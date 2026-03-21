// tracking.agent.js
// FreightMind AI — Tracking & Visibility Agent
// Real-time truck tracking, delay detection, geofence events, customer alerts, fleet map

const { FreightMindAgent, registerAgent } = require('../agent-framework.cw');
const sequelize = require('../db.cw');

// ── Tool Handlers ───────────────────────────────────────────────────────────

// (1) get_truck_position — current GPS position + heading from latest tracking event
async function getTruckPosition(input) {
  const { truck_id } = input;
  if (!truck_id) throw new Error('truck_id required');

  const [trucks] = await sequelize.query(`
    SELECT id, truck_number, equipment_type, status,
           current_lat, current_lng, current_city, current_state,
           speed_mph, last_position_update
    FROM lg_trucks WHERE id = $1
  `, { bind: [truck_id] });

  if (!trucks[0]) throw new Error(`Truck ${truck_id} not found`);
  const truck = trucks[0];

  // Get latest tracking event for heading
  const [events] = await sequelize.query(`
    SELECT event_type, location, notes, created_at
    FROM lg_tracking_events
    WHERE truck_id = $1
    ORDER BY created_at DESC LIMIT 1
  `, { bind: [truck_id] });

  const lastEvent = events[0] || null;

  return {
    truck_id: truck.id,
    truck_number: truck.truck_number,
    equipment_type: truck.equipment_type,
    status: truck.status,
    position: {
      lat: parseFloat(truck.current_lat) || null,
      lng: parseFloat(truck.current_lng) || null,
      city: truck.current_city,
      state: truck.current_state,
    },
    speed_mph: parseFloat(truck.speed_mph) || 0,
    last_position_update: truck.last_position_update,
    last_event: lastEvent ? {
      event_type: lastEvent.event_type,
      location: lastEvent.location,
      notes: lastEvent.notes,
      timestamp: lastEvent.created_at,
    } : null,
  };
}

// (2) calc_eta — estimate arrival time based on position + historical transit data
async function calcEta(input) {
  const { truck_id, destination_city, destination_state } = input;
  if (!truck_id) throw new Error('truck_id required');
  if (!destination_city || !destination_state) throw new Error('destination_city and destination_state required');

  // Get truck position
  const [trucks] = await sequelize.query(`
    SELECT current_lat, current_lng, current_city, current_state
    FROM lg_trucks WHERE id = $1
  `, { bind: [truck_id] });

  if (!trucks[0]) throw new Error(`Truck ${truck_id} not found`);
  const truck = trucks[0];

  // Query historical transit times on similar lanes (same origin/dest state)
  const [history] = await sequelize.query(`
    SELECT AVG(miles) as avg_miles,
           AVG(EXTRACT(EPOCH FROM (d.actual_delivery - d.actual_pickup)) / 3600) as avg_transit_hours,
           COUNT(*) as sample_count
    FROM lg_loads l
    JOIN lg_dispatches d ON d.load_id = l.id
    WHERE l.origin_state = $1 AND l.destination_state = $2
      AND d.actual_delivery IS NOT NULL AND d.actual_pickup IS NOT NULL
  `, { bind: [truck.current_state || 'XX', destination_state] });

  const hist = history[0] || {};
  const avgMiles = parseFloat(hist.avg_miles) || null;
  const avgTransitHours = parseFloat(hist.avg_transit_hours) || null;

  // Estimate: use historical avg if available, else default 50mph
  let estimatedMiles = avgMiles || 500;  // fallback
  let estimatedHours;

  if (avgTransitHours && avgTransitHours > 0) {
    estimatedHours = Math.round(avgTransitHours * 100) / 100;
  } else {
    estimatedHours = Math.round((estimatedMiles / 50) * 100) / 100;
  }

  const now = new Date();
  const eta = new Date(now.getTime() + estimatedHours * 3600000);

  return {
    truck_id,
    current_location: {
      city: truck.current_city,
      state: truck.current_state,
      lat: parseFloat(truck.current_lat) || null,
      lng: parseFloat(truck.current_lng) || null,
    },
    destination: `${destination_city}, ${destination_state}`,
    eta: eta.toISOString(),
    miles_remaining: Math.round(estimatedMiles),
    estimated_hours: estimatedHours,
    based_on: avgTransitHours ? `${parseInt(hist.sample_count)} historical shipments` : 'estimated at 50 mph average',
  };
}

// (3) detect_delay — compare dispatch ETA with current progress
async function detectDelay(input) {
  const { load_id } = input;
  if (!load_id) throw new Error('load_id required');

  // Get the active dispatch for this load
  const [dispatches] = await sequelize.query(`
    SELECT d.id, d.truck_id, d.delivery_eta, d.actual_pickup, d.status,
           l.destination_city, l.destination_state, l.miles
    FROM lg_dispatches d
    JOIN lg_loads l ON l.id = d.load_id
    WHERE d.load_id = $1
    ORDER BY d.created_at DESC LIMIT 1
  `, { bind: [load_id] });

  if (!dispatches[0]) throw new Error(`No dispatch found for load ${load_id}`);
  const dispatch = dispatches[0];

  if (!dispatch.delivery_eta) {
    return { load_id, delayed: false, reason: 'no_eta_set', message: 'No delivery ETA set on dispatch' };
  }

  // Get truck's current position
  const [trucks] = await sequelize.query(`
    SELECT current_city, current_state, current_lat, current_lng, speed_mph
    FROM lg_trucks WHERE id = $1
  `, { bind: [dispatch.truck_id] });

  const truck = trucks[0] || {};
  const now = new Date();
  const eta = new Date(dispatch.delivery_eta);
  const hoursRemaining = (eta.getTime() - now.getTime()) / 3600000;

  // Estimate progress: how far along should the truck be?
  const totalMiles = parseFloat(dispatch.miles) || 500;
  const speedMph = parseFloat(truck.speed_mph) || 0;

  // If the truck is stopped and there's less than 4 hours to ETA, flag potential delay
  let delayed = false;
  let delayMinutes = 0;
  let reason = 'on_schedule';

  if (hoursRemaining < 0) {
    delayed = true;
    delayMinutes = Math.round(Math.abs(hoursRemaining) * 60);
    reason = 'past_due';
  } else if (speedMph === 0 && hoursRemaining < 4 && dispatch.status !== 'delivered') {
    delayed = true;
    delayMinutes = Math.round(hoursRemaining * 60 * 0.5); // estimate 50% likely delay
    reason = 'truck_stopped_near_deadline';
  } else if (hoursRemaining < 2 && speedMph < 20 && dispatch.status !== 'delivered') {
    delayed = true;
    delayMinutes = Math.round((2 - hoursRemaining) * 60);
    reason = 'behind_schedule';
  }

  return {
    load_id,
    dispatch_id: dispatch.id,
    truck_id: dispatch.truck_id,
    delayed,
    delay_minutes: delayed ? delayMinutes : 0,
    reason,
    delivery_eta: dispatch.delivery_eta,
    hours_remaining: Math.round(hoursRemaining * 100) / 100,
    truck_speed_mph: speedMph,
    truck_location: {
      city: truck.current_city || null,
      state: truck.current_state || null,
    },
    destination: `${dispatch.destination_city}, ${dispatch.destination_state}`,
  };
}

// (4) alert_customer — log a customer-facing tracking event/alert
async function alertCustomer(input) {
  const { load_id, message_type, tenant_id } = input;
  if (!load_id) throw new Error('load_id required');
  if (!message_type) throw new Error('message_type required');
  const tid = tenant_id || 'logistics';

  // Validate message_type
  const validTypes = ['delay_alert', 'eta_update', 'delivered', 'pickup_complete', 'in_transit', 'exception'];
  const eventType = validTypes.includes(message_type) ? message_type : 'eta_update';

  // Get load info for context
  const [loads] = await sequelize.query(`
    SELECT id, load_ref, origin_city, origin_state, destination_city, destination_state, status
    FROM lg_loads WHERE id = $1
  `, { bind: [load_id] });

  const load = loads[0] || {};

  // Get active dispatch truck_id
  const [dispatches] = await sequelize.query(`
    SELECT truck_id FROM lg_dispatches WHERE load_id = $1 ORDER BY created_at DESC LIMIT 1
  `, { bind: [load_id] });

  const truckId = dispatches[0] ? dispatches[0].truck_id : null;

  // INSERT tracking event
  const [result] = await sequelize.query(`
    INSERT INTO lg_tracking_events (load_id, truck_id, tenant_id, event_type, location, notes, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id
  `, { bind: [
    load_id, truckId, tid, eventType,
    `${load.destination_city || ''}, ${load.destination_state || ''}`,
    `Customer alert: ${eventType} for load ${load.load_ref || load_id}`
  ] });

  return {
    sent: true,
    alert_id: result[0].id,
    message_type: eventType,
    load_id,
    load_ref: load.load_ref || null,
    lane: load.origin_city ? `${load.origin_city}, ${load.origin_state} -> ${load.destination_city}, ${load.destination_state}` : null,
    timestamp: new Date().toISOString(),
  };
}

// (5) update_load_status — update load status + log tracking event + handle delivery
async function updateLoadStatus(input) {
  const { load_id, status, notes, tenant_id } = input;
  if (!load_id) throw new Error('load_id required');
  if (!status) throw new Error('status required');
  const tid = tenant_id || 'logistics';

  // Update lg_loads
  await sequelize.query(`
    UPDATE lg_loads SET status = $1, updated_at = NOW() WHERE id = $2
  `, { bind: [status, load_id] });

  // Get dispatch truck_id
  const [dispatches] = await sequelize.query(`
    SELECT id, truck_id FROM lg_dispatches WHERE load_id = $1 ORDER BY created_at DESC LIMIT 1
  `, { bind: [load_id] });

  const dispatch = dispatches[0] || {};

  // Log tracking event
  await sequelize.query(`
    INSERT INTO lg_tracking_events (load_id, truck_id, tenant_id, event_type, notes, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `, { bind: [load_id, dispatch.truck_id || null, tid, `status_${status}`, notes || `Load status updated to ${status}`] });

  // If delivered, also update dispatch
  if (status === 'delivered' && dispatch.id) {
    await sequelize.query(`
      UPDATE lg_dispatches SET actual_delivery = NOW(), status = 'delivered' WHERE id = $1
    `, { bind: [dispatch.id] });

    // Update truck status to available
    if (dispatch.truck_id) {
      await sequelize.query(`
        UPDATE lg_trucks SET status = 'available' WHERE id = $1
      `, { bind: [dispatch.truck_id] });
    }
  }

  // Return updated load
  const [loads] = await sequelize.query(`
    SELECT id, load_ref, origin_city, origin_state, destination_city, destination_state,
           status, equipment_type, miles, sell_rate, buy_rate
    FROM lg_loads WHERE id = $1
  `, { bind: [load_id] });

  const load = loads[0] || {};
  return {
    load_id,
    load_ref: load.load_ref,
    status: load.status,
    lane: `${load.origin_city}, ${load.origin_state} -> ${load.destination_city}, ${load.destination_state}`,
    delivery_completed: status === 'delivered',
    dispatch_updated: status === 'delivered' && !!dispatch.id,
    notes: notes || null,
    timestamp: new Date().toISOString(),
  };
}

// (6) log_detention — start detention clock at a facility
async function logDetention(input) {
  const { load_id, facility, start_time, tenant_id } = input;
  if (!load_id) throw new Error('load_id required');
  const tid = tenant_id || 'logistics';
  const detentionStart = start_time ? new Date(start_time) : new Date();

  // Get dispatch and truck info
  const [dispatches] = await sequelize.query(`
    SELECT id, truck_id FROM lg_dispatches WHERE load_id = $1 ORDER BY created_at DESC LIMIT 1
  `, { bind: [load_id] });

  const dispatch = dispatches[0] || {};

  // Log detention start tracking event
  const [result] = await sequelize.query(`
    INSERT INTO lg_tracking_events (load_id, truck_id, tenant_id, event_type, location, notes, created_at)
    VALUES ($1, $2, $3, 'detention_start', $4, $5, $6)
    RETURNING id
  `, { bind: [
    load_id, dispatch.truck_id || null, tid,
    facility || 'Unknown facility',
    `Detention clock started at ${facility || 'facility'}`,
    detentionStart.toISOString()
  ] });

  // Update dispatch detention minutes (time elapsed so far)
  if (dispatch.id) {
    const minutesSoFar = Math.round((new Date().getTime() - detentionStart.getTime()) / 60000);
    await sequelize.query(`
      UPDATE lg_dispatches SET detention_minutes = $1 WHERE id = $2
    `, { bind: [Math.max(minutesSoFar, 0), dispatch.id] });
  }

  return {
    detention_id: result[0].id,
    load_id,
    facility: facility || 'Unknown facility',
    start_time: detentionStart.toISOString(),
    clock_running: true,
    dispatch_id: dispatch.id || null,
  };
}

// (7) geofence_trigger — process geofence entry/exit events
async function geofenceTrigger(input) {
  const { truck_id, fence_type, location, tenant_id } = input;
  if (!truck_id) throw new Error('truck_id required');
  if (!fence_type) throw new Error('fence_type required');
  const tid = tenant_id || 'logistics';

  const validFenceTypes = ['pickup_arrival', 'pickup_departure', 'delivery_arrival', 'delivery_departure'];
  if (!validFenceTypes.includes(fence_type)) {
    throw new Error(`Invalid fence_type. Must be one of: ${validFenceTypes.join(', ')}`);
  }

  // Get active dispatch for this truck
  const [dispatches] = await sequelize.query(`
    SELECT d.id, d.load_id, d.status
    FROM lg_dispatches d
    WHERE d.truck_id = $1 AND d.status NOT IN ('delivered', 'cancelled')
    ORDER BY d.created_at DESC LIMIT 1
  `, { bind: [truck_id] });

  const dispatch = dispatches[0] || {};
  const actionsTaken = [];

  // Log tracking event
  const [result] = await sequelize.query(`
    INSERT INTO lg_tracking_events (load_id, truck_id, tenant_id, event_type, location, notes, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id
  `, { bind: [
    dispatch.load_id || null, truck_id, tid,
    fence_type, location || 'Geofence zone',
    `Geofence ${fence_type} triggered at ${location || 'zone'}`
  ] });
  actionsTaken.push('tracking_event_logged');

  // Handle specific fence types
  if (fence_type === 'delivery_arrival' && dispatch.id) {
    // Start detention clock
    await sequelize.query(`
      INSERT INTO lg_tracking_events (load_id, truck_id, tenant_id, event_type, location, notes, created_at)
      VALUES ($1, $2, $3, 'detention_start', $4, 'Auto-started by delivery geofence', NOW())
    `, { bind: [dispatch.load_id, truck_id, tid, location || 'Delivery facility'] });
    actionsTaken.push('detention_clock_started');
  }

  if (fence_type === 'pickup_departure' && dispatch.load_id) {
    // Update load status to in_transit
    await sequelize.query(`
      UPDATE lg_loads SET status = 'in_transit', updated_at = NOW() WHERE id = $1
    `, { bind: [dispatch.load_id] });

    await sequelize.query(`
      UPDATE lg_dispatches SET actual_pickup = NOW() WHERE id = $1 AND actual_pickup IS NULL
    `, { bind: [dispatch.id] });

    actionsTaken.push('load_status_set_in_transit', 'actual_pickup_recorded');
  }

  if (fence_type === 'pickup_arrival' && dispatch.id) {
    await sequelize.query(`
      UPDATE lg_dispatches SET status = 'at_pickup' WHERE id = $1
    `, { bind: [dispatch.id] });
    actionsTaken.push('dispatch_status_at_pickup');
  }

  if (fence_type === 'delivery_departure' && dispatch.id) {
    // Delivery departure likely means delivery is complete
    actionsTaken.push('delivery_departure_noted');
  }

  return {
    event_id: result[0].id,
    event: fence_type,
    truck_id,
    load_id: dispatch.load_id || null,
    dispatch_id: dispatch.id || null,
    location: location || null,
    timestamp: new Date().toISOString(),
    actions_taken: actionsTaken,
  };
}

// (8) get_fleet_map — all trucks + active dispatches for a tenant
async function getFleetMap(input) {
  const { tenant_id } = input;
  const tid = tenant_id || 'logistics';

  const [trucks] = await sequelize.query(`
    SELECT id, truck_number, equipment_type, status,
           current_lat, current_lng, current_city, current_state,
           last_position_update
    FROM lg_trucks WHERE tenant_id = $1
    ORDER BY truck_number
  `, { bind: [tid] });

  // Get active dispatches with load info
  const [activeDispatches] = await sequelize.query(`
    SELECT d.id as dispatch_id, d.truck_id, d.load_id, d.status as dispatch_status,
           d.delivery_eta, d.detention_minutes,
           l.load_ref, l.origin_city, l.origin_state,
           l.destination_city, l.destination_state,
           l.equipment_type, l.miles, l.sell_rate, l.status as load_status
    FROM lg_dispatches d
    JOIN lg_loads l ON l.id = d.load_id
    WHERE d.tenant_id = $1 AND d.status NOT IN ('delivered', 'cancelled')
    ORDER BY d.delivery_eta ASC NULLS LAST
  `, { bind: [tid] });

  return {
    tenant_id: tid,
    truck_count: trucks.length,
    trucks: trucks.map(t => ({
      id: t.id,
      truck_number: t.truck_number,
      equipment_type: t.equipment_type,
      status: t.status,
      position: {
        lat: parseFloat(t.current_lat) || null,
        lng: parseFloat(t.current_lng) || null,
        city: t.current_city,
        state: t.current_state,
      },
      last_position_update: t.last_position_update,
    })),
    active_loads: activeDispatches.map(d => ({
      dispatch_id: d.dispatch_id,
      truck_id: d.truck_id,
      load_id: d.load_id,
      load_ref: d.load_ref,
      dispatch_status: d.dispatch_status,
      load_status: d.load_status,
      lane: `${d.origin_city}, ${d.origin_state} -> ${d.destination_city}, ${d.destination_state}`,
      equipment_type: d.equipment_type,
      miles: parseFloat(d.miles) || null,
      sell_rate: parseFloat(d.sell_rate) || null,
      delivery_eta: d.delivery_eta,
      detention_minutes: parseInt(d.detention_minutes) || 0,
    })),
    active_load_count: activeDispatches.length,
    summary: {
      available: trucks.filter(t => t.status === 'available').length,
      in_transit: trucks.filter(t => t.status === 'in_transit' || t.status === 'dispatched').length,
      at_facility: trucks.filter(t => t.status === 'at_pickup' || t.status === 'at_delivery').length,
      out_of_service: trucks.filter(t => t.status === 'out_of_service' || t.status === 'maintenance').length,
    },
  };
}

// (9) check_weather_route — simulated weather check for route
async function checkWeatherRoute(input) {
  const { origin_state, destination_state } = input;
  if (!origin_state || !destination_state) throw new Error('origin_state and destination_state required');

  // Simulated weather check — in production this would call a weather API
  return {
    route: `${origin_state} -> ${destination_state}`,
    checked_at: new Date().toISOString(),
    alerts: [],
    impact: 'none',
    summary: `No active weather alerts on the ${origin_state} to ${destination_state} corridor.`,
    road_conditions: 'clear',
    visibility: 'good',
    note: 'Simulated response — connect weather API for live data',
  };
}

// (10) log_check_call — driver check-in call
async function logCheckCall(input) {
  const { load_id, driver_id, status, location, notes, tenant_id } = input;
  if (!load_id) throw new Error('load_id required');
  const tid = tenant_id || 'logistics';

  // Get dispatch truck_id
  const [dispatches] = await sequelize.query(`
    SELECT id, truck_id FROM lg_dispatches WHERE load_id = $1 ORDER BY created_at DESC LIMIT 1
  `, { bind: [load_id] });

  const dispatch = dispatches[0] || {};
  const truckId = dispatch.truck_id || null;

  // Insert check call tracking event
  const [result] = await sequelize.query(`
    INSERT INTO lg_tracking_events (load_id, truck_id, tenant_id, event_type, location, notes, created_at)
    VALUES ($1, $2, $3, 'check_call', $4, $5, NOW())
    RETURNING id
  `, { bind: [
    load_id, truckId, tid,
    location || null,
    [
      status ? `Status: ${status}` : null,
      driver_id ? `Driver: ${driver_id}` : null,
      notes || null,
    ].filter(Boolean).join(' | ') || 'Check call logged'
  ] });

  // Update truck position if location provided
  if (location && truckId) {
    // Parse location string — expect "City, ST" format
    const parts = location.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      const city = parts[0];
      const state = parts[parts.length - 1];
      await sequelize.query(`
        UPDATE lg_trucks SET current_city = $1, current_state = $2, last_position_update = NOW()
        WHERE id = $3
      `, { bind: [city, state, truckId] });
    }
  }

  return {
    logged: true,
    check_call_id: result[0].id,
    load_id,
    truck_id: truckId,
    driver_id: driver_id || null,
    status: status || null,
    location: location || null,
    notes: notes || null,
    timestamp: new Date().toISOString(),
  };
}

// ── Agent Definition ────────────────────────────────────────────────────────

const trackingAgent = new FreightMindAgent({
  name: 'tracking',
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: `You are the Tracking & Visibility agent for FreightMind. You monitor all trucks and loads in real-time, detect delays, trigger geofence events, and keep customers informed. You operate continuously with minimal latency.
Always provide precise location data and timestamps. When detecting delays, explain the reasoning and suggest corrective actions. For geofence events, execute all downstream status updates automatically.`,
  tools: [
    {
      name: 'get_truck_position',
      description: 'Get current GPS position, speed, and last event for a truck',
      input_schema: {
        type: 'object',
        properties: {
          truck_id: { type: 'integer', description: 'ID of the truck' }
        },
        required: ['truck_id']
      },
      handler: getTruckPosition
    },
    {
      name: 'calc_eta',
      description: 'Calculate estimated time of arrival for a truck to a destination using position and historical transit data',
      input_schema: {
        type: 'object',
        properties: {
          truck_id: { type: 'integer', description: 'ID of the truck' },
          destination_city: { type: 'string', description: 'Destination city name' },
          destination_state: { type: 'string', description: '2-letter state code' }
        },
        required: ['truck_id', 'destination_city', 'destination_state']
      },
      handler: calcEta
    },
    {
      name: 'detect_delay',
      description: 'Check if a load is behind schedule by comparing dispatch ETA with current truck progress',
      input_schema: {
        type: 'object',
        properties: {
          load_id: { type: 'integer', description: 'ID of the load to check' }
        },
        required: ['load_id']
      },
      handler: detectDelay
    },
    {
      name: 'alert_customer',
      description: 'Send a customer-facing tracking alert (delay, ETA update, delivered, etc.)',
      input_schema: {
        type: 'object',
        properties: {
          load_id: { type: 'integer', description: 'ID of the load' },
          message_type: { type: 'string', description: 'Alert type: delay_alert, eta_update, delivered, pickup_complete, in_transit, exception' },
          tenant_id: { type: 'string' }
        },
        required: ['load_id', 'message_type']
      },
      handler: alertCustomer
    },
    {
      name: 'update_load_status',
      description: 'Update a load status and log tracking event. If delivered, also closes the dispatch and frees the truck.',
      input_schema: {
        type: 'object',
        properties: {
          load_id: { type: 'integer', description: 'ID of the load' },
          status: { type: 'string', description: 'New status: booked, dispatched, in_transit, at_pickup, at_delivery, delivered, cancelled' },
          notes: { type: 'string', description: 'Optional notes about the status change' },
          tenant_id: { type: 'string' }
        },
        required: ['load_id', 'status']
      },
      handler: updateLoadStatus
    },
    {
      name: 'log_detention',
      description: 'Start a detention clock at a facility for a load',
      input_schema: {
        type: 'object',
        properties: {
          load_id: { type: 'integer', description: 'ID of the load' },
          facility: { type: 'string', description: 'Name of the facility' },
          start_time: { type: 'string', description: 'Detention start time (ISO format, defaults to now)' },
          tenant_id: { type: 'string' }
        },
        required: ['load_id']
      },
      handler: logDetention
    },
    {
      name: 'geofence_trigger',
      description: 'Process a geofence entry/exit event and execute downstream actions (status updates, detention clock, etc.)',
      input_schema: {
        type: 'object',
        properties: {
          truck_id: { type: 'integer', description: 'ID of the truck that triggered the geofence' },
          fence_type: { type: 'string', description: 'Event type: pickup_arrival, pickup_departure, delivery_arrival, delivery_departure' },
          location: { type: 'string', description: 'Location name or address of the geofence' },
          tenant_id: { type: 'string' }
        },
        required: ['truck_id', 'fence_type']
      },
      handler: geofenceTrigger
    },
    {
      name: 'get_fleet_map',
      description: 'Get all trucks with positions and active dispatches for a tenant — used to render the fleet map',
      input_schema: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string', description: 'Tenant ID (default: logistics)' }
        }
      },
      handler: getFleetMap
    },
    {
      name: 'check_weather_route',
      description: 'Check weather conditions and alerts along a route corridor (simulated)',
      input_schema: {
        type: 'object',
        properties: {
          origin_state: { type: 'string', description: '2-letter origin state code' },
          destination_state: { type: 'string', description: '2-letter destination state code' }
        },
        required: ['origin_state', 'destination_state']
      },
      handler: checkWeatherRoute
    },
    {
      name: 'log_check_call',
      description: 'Log a driver check-in call with status, location, and notes. Updates truck position if location provided.',
      input_schema: {
        type: 'object',
        properties: {
          load_id: { type: 'integer', description: 'ID of the load' },
          driver_id: { type: 'integer', description: 'ID of the driver' },
          status: { type: 'string', description: 'Driver-reported status' },
          location: { type: 'string', description: 'Current location (City, ST format)' },
          notes: { type: 'string', description: 'Additional notes from the check call' },
          tenant_id: { type: 'string' }
        },
        required: ['load_id']
      },
      handler: logCheckCall
    }
  ]
});

registerAgent(trackingAgent);

module.exports = trackingAgent;
