/**
 * McLeod TMS Bridge Service
 * Handles inbound webhooks from McLeod TMS and outbound status queries.
 * Triggers Rachel proactive calls on load milestone changes.
 */
const axios = require('axios');
const sequelize = require('./db.cw');
const rachel = require('./rachel.cw');
const hubspot = require('./hubspot.cw');

// McLeod TMS API config (set via Settings page or env)
async function getTmsConfig() {
  try {
    const [rows] = await sequelize.query(
      `SELECT setting_key, setting_value FROM cw_settings WHERE category = 'tms'`
    );
    const config = {};
    rows.forEach(r => { config[r.setting_key] = r.setting_value; });
    return {
      apiUrl: config.tms_api_url || process.env.MCLEOD_API_URL || '',
      apiKey: config.tms_api_key || process.env.MCLEOD_API_KEY || '',
      webhookSecret: config.tms_webhook_secret || process.env.MCLEOD_WEBHOOK_SECRET || '',
      autoCallOnMilestone: config.tms_auto_call !== 'false',
      autoSyncToHubspot: config.tms_auto_hubspot !== 'false'
    };
  } catch {
    return {
      apiUrl: process.env.MCLEOD_API_URL || '',
      apiKey: process.env.MCLEOD_API_KEY || '',
      webhookSecret: process.env.MCLEOD_WEBHOOK_SECRET || '',
      autoCallOnMilestone: true,
      autoSyncToHubspot: true
    };
  }
}

// Status mapping: McLeod TMS status → CW internal status
const STATUS_MAP = {
  'dispatched': 'covered',
  'picked_up': 'in_transit',
  'in_transit': 'in_transit',
  'at_delivery': 'in_transit',
  'delivered': 'delivered',
  'cancelled': 'cancelled',
  'available': 'open',
  'tendered': 'open',
  'assigned': 'covered'
};

// Milestones that trigger proactive shipper calls
const CALL_MILESTONES = ['picked_up', 'in_transit', 'at_delivery', 'delivered'];

/**
 * Process inbound TMS webhook event
 * Called by: POST /api/tms/webhook
 */
async function processWebhookEvent(event) {
  const { event_type, load_ref, tms_load_id, status, carrier_name, carrier_mc,
          origin, destination, pickup_date, delivery_date, eta, driver_name,
          driver_phone, notes, timestamp } = event;

  // Log the inbound event
  await logTmsEvent(event_type, event);

  switch (event_type) {
    case 'load_status_change':
      return handleStatusChange(event);
    case 'new_load':
      return handleNewLoad(event);
    case 'load_update':
      return handleLoadUpdate(event);
    case 'carrier_assignment':
      return handleCarrierAssignment(event);
    case 'eta_update':
      return handleEtaUpdate(event);
    default:
      return { success: true, message: `Event type '${event_type}' acknowledged` };
  }
}

/**
 * Handle load status change from TMS
 */
async function handleStatusChange(event) {
  const { load_ref, tms_load_id, status, eta, notes } = event;
  const config = await getTmsConfig();
  const cwStatus = STATUS_MAP[status] || status;

  // Find matching load
  const [[load]] = await sequelize.query(
    `SELECT l.*, sc.id as shipper_contact_id, sc.phone as shipper_phone, sc.company_name as shipper_name,
            sc.hubspot_id as shipper_hubspot_id
     FROM cw_loads l
     LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id
     WHERE l.load_ref = $1 OR l.id::text = $2`,
    { bind: [load_ref || '', tms_load_id || ''] }
  );

  if (!load) {
    return { success: false, error: `Load not found: ${load_ref || tms_load_id}` };
  }

  // Update load status
  await sequelize.query(
    `UPDATE cw_loads SET status = $1, updated_at = NOW() WHERE id = $2`,
    { bind: [cwStatus, load.id] }
  );

  // Sync to HubSpot
  if (config.autoSyncToHubspot && load.hubspot_deal_id) {
    const stageMap = { open: 'appointmentscheduled', covered: 'qualifiedtobuy', in_transit: 'presentationscheduled', delivered: 'closedwon' };
    hubspot.updateDeal(load.hubspot_deal_id, {
      dealstage: stageMap[cwStatus] || 'appointmentscheduled',
      description: `TMS Status: ${status}${eta ? ` | ETA: ${eta}` : ''}${notes ? ` | ${notes}` : ''}`
    }).catch(e => console.error('CW TMS→HubSpot sync error:', e.message));
  }

  // Trigger proactive shipper call on milestone
  if (config.autoCallOnMilestone && CALL_MILESTONES.includes(status) && load.shipper_phone) {
    rachel.makeOutboundCall(load.shipper_phone, 'status_update', {
      load_ref: load.load_ref || `#${load.id}`,
      status: status.replace(/_/g, ' '),
      delivery_date: eta || load.delivery_date || 'TBD'
    }).then(result => {
      if (result.success) {
        rachel.logCall({
          call_sid: result.callSid,
          direction: 'outbound',
          call_type: 'status_update',
          contact_id: load.shipper_contact_id,
          load_id: load.id,
          from_number: process.env.TWILIO_PHONE_NUMBER,
          to_number: load.shipper_phone,
          outcome: 'pending',
          ai_summary: `Proactive status update: Load ${load.load_ref} → ${status}`,
          hubspot_contact_id: load.shipper_hubspot_id
        });
      }
    }).catch(e => console.error('CW TMS auto-call error:', e.message));
  }

  return { success: true, message: `Load ${load_ref} updated to ${cwStatus}`, load_id: load.id };
}

/**
 * Handle new load from TMS
 */
async function handleNewLoad(event) {
  const { load_ref, origin, destination, freight_type, weight_lbs, pickup_date, delivery_date, rate_usd, shipper_name } = event;

  // Check if load already exists
  const [[existing]] = await sequelize.query(
    `SELECT id FROM cw_loads WHERE load_ref = $1`, { bind: [load_ref || ''] }
  );
  if (existing) {
    return { success: true, message: `Load ${load_ref} already exists`, load_id: existing.id };
  }

  // Find or create shipper
  let shipperId = null;
  if (shipper_name) {
    const [[shipper]] = await sequelize.query(
      `SELECT id FROM cw_contacts WHERE company_name ILIKE $1 AND contact_type = 'shipper' LIMIT 1`,
      { bind: [`%${shipper_name}%`] }
    );
    shipperId = shipper?.id || null;
  }

  // Create load
  const [[newLoad]] = await sequelize.query(
    `INSERT INTO cw_loads (load_ref, origin, destination, freight_type, weight_lbs, pickup_date, delivery_date, rate_usd, status, shipper_id, broker_notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, NOW(), NOW()) RETURNING id`,
    { bind: [load_ref, origin, destination, freight_type || 'dry_van', weight_lbs || null, pickup_date || null, delivery_date || null, rate_usd || null, shipperId, `TMS Import: ${event.tms_load_id || ''}`] }
  );

  // Auto-sync to HubSpot as deal
  const config = await getTmsConfig();
  if (config.autoSyncToHubspot) {
    hubspot.createDeal({ load_ref, origin, destination, freight_type, weight_lbs, rate_usd, delivery_date, status: 'open' })
      .then(result => {
        if (result.success && result.data?.id) {
          sequelize.query(`UPDATE cw_loads SET hubspot_deal_id = $1 WHERE id = $2`, { bind: [result.data.id, newLoad.id] });
        }
      }).catch(e => console.error('CW TMS new load→HubSpot error:', e.message));
  }

  return { success: true, message: `Load ${load_ref} created from TMS`, load_id: newLoad.id };
}

/**
 * Handle load field updates from TMS
 */
async function handleLoadUpdate(event) {
  const { load_ref, tms_load_id, origin, destination, pickup_date, delivery_date, rate_usd, weight_lbs, notes } = event;

  const [[load]] = await sequelize.query(
    `SELECT id FROM cw_loads WHERE load_ref = $1 OR id::text = $2`,
    { bind: [load_ref || '', tms_load_id || ''] }
  );
  if (!load) return { success: false, error: `Load not found: ${load_ref || tms_load_id}` };

  const updates = [];
  const binds = [];
  if (origin) { binds.push(origin); updates.push(`origin = $${binds.length}`); }
  if (destination) { binds.push(destination); updates.push(`destination = $${binds.length}`); }
  if (pickup_date) { binds.push(pickup_date); updates.push(`pickup_date = $${binds.length}`); }
  if (delivery_date) { binds.push(delivery_date); updates.push(`delivery_date = $${binds.length}`); }
  if (rate_usd) { binds.push(rate_usd); updates.push(`rate_usd = $${binds.length}`); }
  if (weight_lbs) { binds.push(weight_lbs); updates.push(`weight_lbs = $${binds.length}`); }
  if (notes) { binds.push(notes); updates.push(`broker_notes = $${binds.length}`); }

  if (updates.length) {
    binds.push(load.id);
    await sequelize.query(
      `UPDATE cw_loads SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${binds.length}`,
      { bind: binds }
    );
  }

  return { success: true, message: `Load ${load_ref} updated`, load_id: load.id };
}

/**
 * Handle carrier assignment from TMS
 */
async function handleCarrierAssignment(event) {
  const { load_ref, tms_load_id, carrier_name, carrier_mc, driver_name, driver_phone } = event;

  const [[load]] = await sequelize.query(
    `SELECT id, status FROM cw_loads WHERE load_ref = $1 OR id::text = $2`,
    { bind: [load_ref || '', tms_load_id || ''] }
  );
  if (!load) return { success: false, error: `Load not found: ${load_ref || tms_load_id}` };

  // Find or create carrier contact
  let carrierId = null;
  if (carrier_name) {
    const [[carrier]] = await sequelize.query(
      `SELECT id FROM cw_contacts WHERE company_name ILIKE $1 AND contact_type = 'carrier' LIMIT 1`,
      { bind: [`%${carrier_name}%`] }
    );
    if (carrier) {
      carrierId = carrier.id;
    } else {
      const [[newCarrier]] = await sequelize.query(
        `INSERT INTO cw_contacts (contact_type, company_name, full_name, phone, created_at, updated_at)
         VALUES ('carrier', $1, $2, $3, NOW(), NOW()) RETURNING id`,
        { bind: [carrier_name, driver_name || null, driver_phone || null] }
      );
      carrierId = newCarrier.id;
    }
  }

  // Update load
  const newStatus = load.status === 'open' ? 'covered' : load.status;
  await sequelize.query(
    `UPDATE cw_loads SET carrier_id = $1, status = $2, broker_notes = COALESCE(broker_notes, '') || $3, updated_at = NOW() WHERE id = $4`,
    { bind: [carrierId, newStatus, `\nCarrier assigned via TMS: ${carrier_name} (MC#${carrier_mc || 'N/A'})`, load.id] }
  );

  return { success: true, message: `Carrier ${carrier_name} assigned to load ${load_ref}`, load_id: load.id };
}

/**
 * Handle ETA update
 */
async function handleEtaUpdate(event) {
  const { load_ref, tms_load_id, eta, notes } = event;

  const [[load]] = await sequelize.query(
    `SELECT l.id, l.load_ref, sc.phone as shipper_phone, sc.id as shipper_contact_id
     FROM cw_loads l LEFT JOIN cw_contacts sc ON l.shipper_id = sc.id
     WHERE l.load_ref = $1 OR l.id::text = $2`,
    { bind: [load_ref || '', tms_load_id || ''] }
  );
  if (!load) return { success: false, error: `Load not found` };

  if (eta) {
    await sequelize.query(
      `UPDATE cw_loads SET delivery_date = $1, broker_notes = COALESCE(broker_notes, '') || $2, updated_at = NOW() WHERE id = $3`,
      { bind: [eta, `\nETA updated: ${eta}${notes ? ' - ' + notes : ''}`, load.id] }
    );
  }

  return { success: true, message: `ETA updated for load ${load_ref}` };
}

/**
 * Log TMS event to webhook_logs
 */
async function logTmsEvent(eventType, payload) {
  try {
    await sequelize.query(
      `INSERT INTO cw_webhook_logs (direction, event_type, source_ip, payload, status, created_at)
       VALUES ('inbound', $1, 'tms', $2, 'processed', NOW())`,
      { bind: [eventType, JSON.stringify(payload)] }
    );
  } catch (e) {
    console.error('CW TMS log error:', e.message);
  }
}

/**
 * Pull loads from TMS API (outbound query)
 */
async function pullLoadsFromTms() {
  const config = await getTmsConfig();
  if (!config.apiUrl || !config.apiKey) {
    return { success: false, error: 'TMS API not configured' };
  }

  try {
    const response = await axios.get(`${config.apiUrl}/loads`, {
      headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      params: { status: 'available', limit: 50 }
    });

    const loads = response.data?.loads || response.data?.data || [];
    let imported = 0;

    for (const tmsLoad of loads) {
      const result = await handleNewLoad({
        event_type: 'new_load',
        load_ref: tmsLoad.load_ref || tmsLoad.reference || tmsLoad.id,
        origin: tmsLoad.origin || tmsLoad.pickup_city,
        destination: tmsLoad.destination || tmsLoad.delivery_city,
        freight_type: tmsLoad.freight_type || tmsLoad.equipment_type || 'dry_van',
        weight_lbs: tmsLoad.weight_lbs || tmsLoad.weight,
        pickup_date: tmsLoad.pickup_date,
        delivery_date: tmsLoad.delivery_date,
        rate_usd: tmsLoad.rate_usd || tmsLoad.rate,
        shipper_name: tmsLoad.shipper_name || tmsLoad.shipper,
        tms_load_id: tmsLoad.id
      });
      if (result.success) imported++;
    }

    return { success: true, message: `Imported ${imported} loads from TMS`, total: loads.length, imported };
  } catch (err) {
    return { success: false, error: `TMS API error: ${err.message}` };
  }
}

/**
 * Get TMS event log
 */
async function getEventLog(limit = 50) {
  try {
    const [rows] = await sequelize.query(
      `SELECT * FROM cw_webhook_logs WHERE source_ip = 'tms' ORDER BY created_at DESC LIMIT $1`,
      { bind: [limit] }
    );
    return rows;
  } catch {
    return [];
  }
}

module.exports = {
  processWebhookEvent,
  handleStatusChange,
  handleNewLoad,
  handleLoadUpdate,
  handleCarrierAssignment,
  handleEtaUpdate,
  pullLoadsFromTms,
  getEventLog,
  getTmsConfig,
  STATUS_MAP
};
