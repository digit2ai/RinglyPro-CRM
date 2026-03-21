// maintenance.agent.js
// FreightMind AI — Maintenance & Fleet Agent
// Keeps trucks running, predicts breakdowns, schedules PM, minimizes cost per mile

const { FreightMindAgent, registerAgent } = require('../agent-framework.cw');
const sequelize = require('../db.cw');

// ── Tool Handlers ───────────────────────────────────────────────────────────

// (1) check_truck_health — full health snapshot for a single truck
async function checkTruckHealth(input) {
  const { truck_id } = input;

  const [trucks] = await sequelize.query(
    `SELECT * FROM lg_trucks WHERE id = $1`,
    { bind: [truck_id] }
  );
  if (!trucks.length) return { error: `Truck #${truck_id} not found` };
  const truck = trucks[0];

  const [maintenance] = await sequelize.query(
    `SELECT * FROM lg_maintenance WHERE truck_id = $1 ORDER BY created_at DESC LIMIT 3`,
    { bind: [truck_id] }
  );

  const alerts = [];
  const odometer = parseFloat(truck.odometer) || 0;
  const nextPmDue = parseFloat(truck.next_pm_due_miles) || 0;

  // PM overdue check
  if (nextPmDue > 0 && odometer >= nextPmDue) {
    alerts.push({
      type: 'pm_overdue',
      severity: 'high',
      message: `PM overdue — odometer ${odometer.toLocaleString()} mi exceeds next PM due at ${nextPmDue.toLocaleString()} mi`
    });
  }

  // Inspection due within 30 days
  if (truck.next_inspection_date) {
    const inspDate = new Date(truck.next_inspection_date);
    const thirtyDaysOut = new Date();
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
    if (inspDate <= thirtyDaysOut) {
      const daysUntil = Math.ceil((inspDate - new Date()) / (1000 * 60 * 60 * 24));
      alerts.push({
        type: 'inspection_due',
        severity: daysUntil <= 0 ? 'critical' : 'medium',
        message: daysUntil <= 0
          ? `Inspection EXPIRED ${Math.abs(daysUntil)} days ago`
          : `Inspection due in ${daysUntil} days (${inspDate.toISOString().slice(0, 10)})`
      });
    }
  }

  // Insurance expiring
  if (truck.insurance_expiry) {
    const insDate = new Date(truck.insurance_expiry);
    const thirtyDaysOut = new Date();
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
    if (insDate <= thirtyDaysOut) {
      const daysUntil = Math.ceil((insDate - new Date()) / (1000 * 60 * 60 * 24));
      alerts.push({
        type: 'insurance_expiring',
        severity: daysUntil <= 7 ? 'high' : 'medium',
        message: daysUntil <= 0
          ? `Insurance EXPIRED ${Math.abs(daysUntil)} days ago`
          : `Insurance expires in ${daysUntil} days (${insDate.toISOString().slice(0, 10)})`
      });
    }
  }

  const lastService = maintenance.length > 0 ? maintenance[0] : null;
  const status = alerts.some(a => a.severity === 'critical') ? 'critical'
    : alerts.some(a => a.severity === 'high') ? 'needs_attention'
    : alerts.length > 0 ? 'monitor'
    : 'healthy';

  return {
    truck_id: truck.id,
    unit_number: truck.unit_number || truck.truck_number,
    status,
    odometer,
    alerts,
    next_service: nextPmDue > 0 ? { type: 'PM', due_at_miles: nextPmDue, miles_remaining: Math.max(0, nextPmDue - odometer) } : null,
    last_service: lastService ? { id: lastService.id, type: lastService.service_type || lastService.repair_type, date: lastService.created_at, status: lastService.status } : null,
    recent_maintenance: maintenance
  };
}

// (2) schedule_pm — schedule preventive maintenance
async function schedulePm(input) {
  const { truck_id, service_type, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  const intervalMap = {
    oil_change: 15000,
    tire_rotation: 5000,
    brake_inspection: 20000,
    full_service: 25000,
    dot_inspection: 0,
    transmission_service: 50000,
    coolant_flush: 30000
  };
  const nextDueMiles = intervalMap[service_type] || 15000;

  // Get current odometer
  const [trucks] = await sequelize.query(
    `SELECT odometer FROM lg_trucks WHERE id = $1`,
    { bind: [truck_id] }
  );
  const currentOdometer = trucks.length ? (parseFloat(trucks[0].odometer) || 0) : 0;

  const [result] = await sequelize.query(`
    INSERT INTO lg_maintenance (truck_id, service_type, status, scheduled_miles, notes, tenant_id, created_at, updated_at)
    VALUES ($1, $2, 'scheduled', $3, $4, $5, NOW(), NOW())
    RETURNING id, truck_id, service_type, status, scheduled_miles, created_at
  `, { bind: [truck_id, service_type, currentOdometer + nextDueMiles, `Scheduled PM: ${service_type}`, tid] });

  // Update truck's next_pm_due_miles
  await sequelize.query(
    `UPDATE lg_trucks SET next_pm_due_miles = $1, updated_at = NOW() WHERE id = $2`,
    { bind: [currentOdometer + nextDueMiles, truck_id] }
  );

  const record = result[0];
  return {
    appointment_id: record.id,
    truck_id: record.truck_id,
    service_type: record.service_type,
    current_odometer: currentOdometer,
    next_due_miles: currentOdometer + nextDueMiles,
    interval_miles: nextDueMiles,
    status: 'scheduled'
  };
}

// (3) log_repair — record a completed repair
async function logRepair(input) {
  const { truck_id, repair_type, cost, shop, description, odometer, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  const [result] = await sequelize.query(`
    INSERT INTO lg_maintenance (truck_id, repair_type, cost, shop, description, status, tenant_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, 'completed', $6, NOW(), NOW())
    RETURNING id, truck_id, repair_type, cost, shop, status, created_at
  `, { bind: [truck_id, repair_type, parseFloat(cost) || 0, shop || null, description || null, tid] });

  // Update odometer if provided
  if (odometer) {
    await sequelize.query(
      `UPDATE lg_trucks SET odometer = $1, updated_at = NOW() WHERE id = $2`,
      { bind: [parseFloat(odometer), truck_id] }
    );
  }

  const record = result[0];
  return {
    repair_id: record.id,
    truck_id: record.truck_id,
    repair_type: record.repair_type,
    cost: parseFloat(record.cost),
    shop: record.shop,
    status: 'completed',
    recorded_at: record.created_at
  };
}

// (4) track_fuel_mpg — fuel economy analysis for a truck over a period
async function trackFuelMpg(input) {
  const { truck_id, period_start, period_end, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  const start = period_start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const end = period_end || new Date().toISOString().slice(0, 10);

  const [dispatches] = await sequelize.query(`
    SELECT COALESCE(SUM(route_miles), 0) as total_miles,
           COUNT(*) as trip_count
    FROM lg_dispatches
    WHERE truck_id = $1 AND tenant_id = $2
      AND pickup_date >= $3 AND pickup_date <= $4
  `, { bind: [truck_id, tid, start, end] });

  const totalMiles = parseFloat(dispatches[0].total_miles) || 0;
  const avgMpg = 6.0; // Industry average for class 8 trucks
  const estimatedGallons = Math.round(totalMiles / avgMpg * 10) / 10;
  const fuelPricePerGallon = 3.85; // Current average diesel
  const fuelCost = Math.round(estimatedGallons * fuelPricePerGallon * 100) / 100;
  const costPerMile = totalMiles > 0 ? Math.round(fuelCost / totalMiles * 100) / 100 : 0;

  return {
    truck_id,
    period: { start, end },
    total_miles: totalMiles,
    trip_count: parseInt(dispatches[0].trip_count),
    estimated_gallons: estimatedGallons,
    mpg: avgMpg,
    fuel_price_per_gallon: fuelPricePerGallon,
    total_fuel_cost: fuelCost,
    cost_per_mile: costPerMile,
    trend: 'stable',
    note: 'Fuel estimates based on 6.0 MPG avg for Class 8 trucks. Integrate fuel card data for actuals.'
  };
}

// (5) predict_failure — predictive maintenance based on repair history
async function predictFailure(input) {
  const { truck_id } = input;

  const [trucks] = await sequelize.query(
    `SELECT * FROM lg_trucks WHERE id = $1`,
    { bind: [truck_id] }
  );
  if (!trucks.length) return { error: `Truck #${truck_id} not found` };
  const truck = trucks[0];

  // Count repairs by type in last 12 months
  const [repairCounts] = await sequelize.query(`
    SELECT repair_type, COUNT(*) as repair_count, MAX(created_at) as last_occurrence,
           SUM(COALESCE(cost, 0)) as total_cost
    FROM lg_maintenance
    WHERE truck_id = $1 AND status = 'completed'
      AND created_at >= NOW() - INTERVAL '12 months'
    GROUP BY repair_type
    ORDER BY repair_count DESC
  `, { bind: [truck_id] });

  const riskComponents = [];
  for (const r of repairCounts) {
    if (parseInt(r.repair_count) > 2) {
      riskComponents.push({
        component: r.repair_type,
        occurrences_12mo: parseInt(r.repair_count),
        last_occurrence: r.last_occurrence,
        total_cost: parseFloat(r.total_cost) || 0,
        risk_level: parseInt(r.repair_count) > 4 ? 'critical' : 'elevated',
        recommendation: `${r.repair_type} repaired ${r.repair_count}x in 12 months — consider component replacement`
      });
    }
  }

  // Age/mileage risk
  const odometer = parseFloat(truck.odometer) || 0;
  const year = parseInt(truck.year) || new Date().getFullYear();
  const age = new Date().getFullYear() - year;

  if (odometer > 500000) {
    riskComponents.push({
      component: 'high_mileage',
      risk_level: odometer > 750000 ? 'critical' : 'elevated',
      recommendation: `Truck has ${odometer.toLocaleString()} miles — increase inspection frequency`
    });
  }
  if (age > 7) {
    riskComponents.push({
      component: 'age',
      risk_level: age > 10 ? 'critical' : 'elevated',
      recommendation: `Truck is ${age} years old — evaluate replacement ROI`
    });
  }

  const confidence = repairCounts.length > 3 ? 'high' : repairCounts.length > 1 ? 'medium' : 'low';
  const overallRisk = riskComponents.some(r => r.risk_level === 'critical') ? 'high'
    : riskComponents.length > 0 ? 'moderate' : 'low';

  return {
    truck_id,
    unit_number: truck.unit_number || truck.truck_number,
    odometer,
    age_years: age,
    overall_risk: overallRisk,
    risk_components: riskComponents,
    confidence,
    repair_history_count: repairCounts.length,
    recommendation: riskComponents.length === 0
      ? 'No recurring failure patterns detected. Continue standard PM schedule.'
      : `${riskComponents.length} risk area(s) identified. Review and schedule inspections.`
  };
}

// (6) find_nearest_shop — simulated shop finder (production: Google Places API)
async function findNearestShop(input) {
  const { city, state, service_type } = input;

  // Simulated results — in production would call Google Places API
  const shopTemplates = [
    { suffix: 'Truck & Trailer Repair', distance_mi: 2.3, availability: 'same_day', rating: 4.5 },
    { suffix: 'Fleet Services', distance_mi: 5.8, availability: 'next_day', rating: 4.2 },
    { suffix: 'Diesel & Heavy Equipment', distance_mi: 11.4, availability: 'next_day', rating: 4.7 }
  ];

  const shops = shopTemplates.map((t, i) => ({
    name: `${city} ${t.suffix}`,
    city,
    state,
    distance_mi: t.distance_mi,
    availability: t.availability,
    rating: t.rating,
    services: service_type ? [service_type] : ['general_repair', 'pm_service', 'tires', 'brakes'],
    phone: `(555) ${String(100 + i * 111).padStart(3, '0')}-${String(1000 + i * 1111).padStart(4, '0')}`
  }));

  return {
    query: { city, state, service_type: service_type || 'general' },
    shops,
    count: shops.length,
    note: 'Simulated results. Production will use Google Places API for real-time shop data.'
  };
}

// (7) calc_truck_cost_per_mile — total cost-per-mile breakdown for a truck
async function calcTruckCostPerMile(input) {
  const { truck_id, period_start, period_end, tenant_id } = input;
  const tid = tenant_id || 'logistics';

  const start = period_start || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const end = period_end || new Date().toISOString().slice(0, 10);

  // Maintenance cost
  const [maintCost] = await sequelize.query(`
    SELECT COALESCE(SUM(cost), 0) as total_maintenance_cost,
           COUNT(*) as repair_count
    FROM lg_maintenance
    WHERE truck_id = $1 AND tenant_id = $2
      AND created_at >= $3 AND created_at <= $4
  `, { bind: [truck_id, tid, start, end] });

  // Total miles
  const [mileage] = await sequelize.query(`
    SELECT COALESCE(SUM(route_miles), 0) as total_miles,
           COUNT(*) as trip_count
    FROM lg_dispatches
    WHERE truck_id = $1 AND tenant_id = $2
      AND pickup_date >= $3 AND pickup_date <= $4
  `, { bind: [truck_id, tid, start, end] });

  const totalMiles = parseFloat(mileage[0].total_miles) || 0;
  const maintenanceCost = parseFloat(maintCost[0].total_maintenance_cost) || 0;

  // Fuel estimate
  const avgMpg = 6.0;
  const fuelPricePerGallon = 3.85;
  const fuelCost = totalMiles > 0 ? (totalMiles / avgMpg) * fuelPricePerGallon : 0;

  const insuranceCpm = 0.05; // Industry estimate per mile

  const fuelCpm = totalMiles > 0 ? Math.round(fuelCost / totalMiles * 100) / 100 : 0;
  const maintenanceCpm = totalMiles > 0 ? Math.round(maintenanceCost / totalMiles * 100) / 100 : 0;
  const totalCpm = Math.round((fuelCpm + maintenanceCpm + insuranceCpm) * 100) / 100;

  return {
    truck_id,
    period: { start, end },
    total_miles: totalMiles,
    trip_count: parseInt(mileage[0].trip_count),
    costs: {
      fuel: Math.round(fuelCost * 100) / 100,
      maintenance: maintenanceCost,
      insurance_est: Math.round(totalMiles * insuranceCpm * 100) / 100
    },
    fuel_cpm: fuelCpm,
    maintenance_cpm: maintenanceCpm,
    insurance_cpm: insuranceCpm,
    total_cpm: totalCpm,
    repair_count: parseInt(maintCost[0].repair_count),
    benchmark: { good: '< $1.50', average: '$1.50 - $2.00', high: '> $2.00' }
  };
}

// (8) get_fleet_utilization — fleet-wide utilization snapshot
async function getFleetUtilization(input) {
  const { tenant_id } = input;
  const tid = tenant_id || 'logistics';

  const [statusCounts] = await sequelize.query(`
    SELECT status, COUNT(*) as count
    FROM lg_trucks
    WHERE tenant_id = $1
    GROUP BY status
  `, { bind: [tid] });

  const byStatus = {};
  let total = 0;
  for (const row of statusCounts) {
    byStatus[row.status] = parseInt(row.count);
    total += parseInt(row.count);
  }

  const activeStatuses = ['assigned', 'in_transit', 'dispatched', 'loaded', 'en_route'];
  const activeCount = activeStatuses.reduce((sum, s) => sum + (byStatus[s] || 0), 0);
  const utilizationPct = total > 0 ? Math.round(activeCount / total * 1000) / 10 : 0;

  // Get idle trucks
  const [idleTrucks] = await sequelize.query(`
    SELECT id, unit_number, truck_number, status, odometer, city, state
    FROM lg_trucks
    WHERE tenant_id = $1 AND status IN ('available', 'idle', 'parked')
    ORDER BY updated_at ASC
    LIMIT 20
  `, { bind: [tid] });

  // Trucks needing attention
  const [needsAttention] = await sequelize.query(`
    SELECT id, unit_number, truck_number, status, next_inspection_date, next_pm_due_miles, odometer
    FROM lg_trucks
    WHERE tenant_id = $1
      AND (next_inspection_date < NOW() + INTERVAL '30 days'
           OR (next_pm_due_miles > 0 AND odometer >= next_pm_due_miles))
    LIMIT 10
  `, { bind: [tid] });

  return {
    tenant_id: tid,
    total_trucks: total,
    active_trucks: activeCount,
    by_status: byStatus,
    utilization_pct: utilizationPct,
    idle_trucks: idleTrucks.map(t => ({
      id: t.id,
      unit: t.unit_number || t.truck_number,
      status: t.status,
      location: t.city && t.state ? `${t.city}, ${t.state}` : 'Unknown'
    })),
    needs_attention: needsAttention.map(t => ({
      id: t.id,
      unit: t.unit_number || t.truck_number,
      issues: [
        t.next_inspection_date && new Date(t.next_inspection_date) < new Date(Date.now() + 30 * 86400000) ? 'inspection_due' : null,
        t.next_pm_due_miles > 0 && parseFloat(t.odometer) >= parseFloat(t.next_pm_due_miles) ? 'pm_overdue' : null
      ].filter(Boolean)
    })),
    summary: `Fleet utilization: ${utilizationPct}% — ${activeCount} active of ${total} trucks, ${idleTrucks.length} idle`
  };
}

// ── Agent Definition ─────────────────────────────────────────────────────────

const maintenanceAgent = new FreightMindAgent({
  name: 'maintenance_fleet',
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: `You are the Maintenance & Fleet agent for FreightMind. You keep trucks running, predict breakdowns, schedule preventive maintenance, and minimize cost per mile. An idle truck is a losing truck.

When checking truck health, always flag overdue PMs, expiring inspections, and insurance issues.
When scheduling maintenance, explain the interval logic and next due mileage.
When predicting failures, cite the repair frequency data and confidence level.
Always tie recommendations back to cost impact — downtime costs $800-1200/day.`,
  tools: [
    {
      name: 'check_truck_health',
      description: 'Full health snapshot for a truck — PM status, inspection dates, insurance, recent maintenance, alerts',
      input_schema: {
        type: 'object',
        properties: {
          truck_id: { type: 'integer', description: 'ID of the truck to check' }
        },
        required: ['truck_id']
      },
      handler: checkTruckHealth
    },
    {
      name: 'schedule_pm',
      description: 'Schedule preventive maintenance for a truck. Calculates next-due mileage based on service type interval.',
      input_schema: {
        type: 'object',
        properties: {
          truck_id: { type: 'integer', description: 'ID of the truck' },
          service_type: {
            type: 'string',
            description: 'Type of PM service',
            enum: ['oil_change', 'tire_rotation', 'brake_inspection', 'full_service', 'dot_inspection', 'transmission_service', 'coolant_flush']
          },
          tenant_id: { type: 'string' }
        },
        required: ['truck_id', 'service_type']
      },
      handler: schedulePm
    },
    {
      name: 'log_repair',
      description: 'Record a completed repair or service. Updates truck odometer if provided.',
      input_schema: {
        type: 'object',
        properties: {
          truck_id: { type: 'integer', description: 'ID of the truck' },
          repair_type: { type: 'string', description: 'Type of repair (e.g. engine, brakes, tires, electrical, transmission)' },
          cost: { type: 'number', description: 'Total repair cost in dollars' },
          shop: { type: 'string', description: 'Name of the repair shop' },
          description: { type: 'string', description: 'Description of the repair work' },
          odometer: { type: 'number', description: 'Current odometer reading (optional, updates truck record)' },
          tenant_id: { type: 'string' }
        },
        required: ['truck_id', 'repair_type', 'cost']
      },
      handler: logRepair
    },
    {
      name: 'track_fuel_mpg',
      description: 'Fuel economy analysis for a truck over a time period. Estimates gallons and cost from dispatch miles at 6 MPG avg.',
      input_schema: {
        type: 'object',
        properties: {
          truck_id: { type: 'integer', description: 'ID of the truck' },
          period_start: { type: 'string', description: 'Start date (YYYY-MM-DD). Default: 30 days ago' },
          period_end: { type: 'string', description: 'End date (YYYY-MM-DD). Default: today' },
          tenant_id: { type: 'string' }
        },
        required: ['truck_id']
      },
      handler: trackFuelMpg
    },
    {
      name: 'predict_failure',
      description: 'Predictive maintenance — analyzes 12-month repair history to flag recurring failures and high-risk components',
      input_schema: {
        type: 'object',
        properties: {
          truck_id: { type: 'integer', description: 'ID of the truck to analyze' }
        },
        required: ['truck_id']
      },
      handler: predictFailure
    },
    {
      name: 'find_nearest_shop',
      description: 'Find repair shops near a location. Currently returns simulated results; production will use Google Places API.',
      input_schema: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
          state: { type: 'string', description: 'Two-letter state code' },
          service_type: { type: 'string', description: 'Specific service needed (optional)' }
        },
        required: ['city', 'state']
      },
      handler: findNearestShop
    },
    {
      name: 'calc_truck_cost_per_mile',
      description: 'Total cost-per-mile breakdown for a truck: fuel, maintenance, insurance over a period',
      input_schema: {
        type: 'object',
        properties: {
          truck_id: { type: 'integer', description: 'ID of the truck' },
          period_start: { type: 'string', description: 'Start date (YYYY-MM-DD). Default: 90 days ago' },
          period_end: { type: 'string', description: 'End date (YYYY-MM-DD). Default: today' },
          tenant_id: { type: 'string' }
        },
        required: ['truck_id']
      },
      handler: calcTruckCostPerMile
    },
    {
      name: 'get_fleet_utilization',
      description: 'Fleet-wide utilization snapshot — trucks by status, utilization %, idle trucks, trucks needing attention',
      input_schema: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string', description: 'Tenant ID (default: logistics)' }
        },
        required: []
      },
      handler: getFleetUtilization
    }
  ]
});

registerAgent(maintenanceAgent);

module.exports = maintenanceAgent;
