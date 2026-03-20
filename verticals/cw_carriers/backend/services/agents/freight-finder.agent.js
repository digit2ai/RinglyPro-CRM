// freight-finder.agent.js
// FreightMind AI — Freight Finder Agent
// Multi-channel load sourcing, carrier management, shipper intelligence, and email processing
// Wraps existing loadmatching engine + adds carrier, shipper, and truck tools

const { FreightMindAgent, registerAgent } = require('../agent-framework.cw');
const loadmatching = require('../loadmatching.cw');
const fmcsa = require('../fmcsa.cw');
const sequelize = require('../db.cw');

// ─── Tool Handlers ───────────────────────────────────────────────────────────

/**
 * a) scan_load_boards — query lg_loads WHERE status='open'
 *    Filters: equipment_type, origin state/radius, pickup_date range
 */
async function handleScanLoadBoards(input) {
  const { equipment_type, origin_state, origin_city, date_from, date_to, max_results, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const limit = Math.min(max_results || 50, 200);

  const binds = [tid];
  const clauses = [`tenant_id = $1`, `status = 'open'`];
  let idx = 2;

  if (equipment_type) {
    clauses.push(`equipment_type = $${idx}`);
    binds.push(equipment_type);
    idx++;
  }
  if (origin_state) {
    clauses.push(`UPPER(origin_state) = $${idx}`);
    binds.push(origin_state.toUpperCase());
    idx++;
  }
  if (origin_city) {
    clauses.push(`LOWER(origin_city) = $${idx}`);
    binds.push(origin_city.toLowerCase().trim());
    idx++;
  }
  if (date_from) {
    clauses.push(`pickup_date >= $${idx}::DATE`);
    binds.push(date_from);
    idx++;
  }
  if (date_to) {
    clauses.push(`pickup_date <= $${idx}::DATE`);
    binds.push(date_to);
    idx++;
  }

  const [loads] = await sequelize.query(`
    SELECT id, load_ref, origin_city, origin_state, destination_city, destination_state,
           equipment_type, pickup_date, delivery_date, miles, sell_rate, buy_rate, status, source
    FROM lg_loads
    WHERE ${clauses.join(' AND ')}
    ORDER BY pickup_date ASC
    LIMIT ${limit}
  `, { bind: binds });

  return { loads, total: loads.length, filters: { equipment_type, origin_state, origin_city, date_from, date_to } };
}

/**
 * b) filter_by_equipment — filter a loads array by equipment_type match
 */
async function handleFilterByEquipment(input) {
  const { loads, equipment_type } = input;
  if (!loads || !Array.isArray(loads)) throw new Error('loads array required');
  if (!equipment_type) throw new Error('equipment_type required');

  const compatible = {
    dry_van: ['dry_van', 'reefer'],
    reefer: ['reefer', 'dry_van'],
    flatbed: ['flatbed', 'step_deck'],
    step_deck: ['step_deck', 'flatbed'],
  };

  const allowed = compatible[equipment_type] || [equipment_type];
  const exact = loads.filter(l => l.equipment_type === equipment_type);
  const compat = loads.filter(l => l.equipment_type !== equipment_type && allowed.includes(l.equipment_type));

  return {
    exact_matches: exact,
    compatible_matches: compat,
    total_exact: exact.length,
    total_compatible: compat.length,
    equipment_type,
  };
}

/**
 * c) check_shipper_reputation — query lg_shippers score + lg_quotes payment history
 */
async function handleCheckShipperReputation(input) {
  const { shipper_id, tenant_id } = input;
  if (!shipper_id) throw new Error('shipper_id required');
  const tid = tenant_id || 'logistics';

  const [[shipper]] = await sequelize.query(
    `SELECT id, company_name, contact_name, credit_score, payment_terms, avg_days_to_pay, total_loads, on_time_pct, status
     FROM lg_shippers WHERE id = $1 AND tenant_id = $2`,
    { bind: [shipper_id, tid] }
  );
  if (!shipper) throw new Error('Shipper not found');

  // Payment history from quotes
  const [payments] = await sequelize.query(`
    SELECT COUNT(*) as total_quotes,
           COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid,
           COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue,
           COUNT(CASE WHEN status = 'disputed' THEN 1 END) as disputed,
           COALESCE(AVG(CASE WHEN days_to_pay IS NOT NULL THEN days_to_pay END), 0) as avg_days_to_pay,
           COALESCE(SUM(amount), 0) as total_revenue
    FROM lg_quotes WHERE shipper_id = $1 AND tenant_id = $2
  `, { bind: [shipper_id, tid] });

  const paymentStats = payments[0] || {};
  const reputation = {
    shipper,
    payment_history: {
      total_quotes: parseInt(paymentStats.total_quotes) || 0,
      paid: parseInt(paymentStats.paid) || 0,
      overdue: parseInt(paymentStats.overdue) || 0,
      disputed: parseInt(paymentStats.disputed) || 0,
      avg_days_to_pay: Math.round(parseFloat(paymentStats.avg_days_to_pay) || 0),
      total_revenue: parseFloat(paymentStats.total_revenue) || 0,
    },
    risk_level: 'low',
  };

  // Compute risk level
  const overdueRate = reputation.payment_history.total_quotes > 0
    ? reputation.payment_history.overdue / reputation.payment_history.total_quotes : 0;
  if (overdueRate > 0.3 || reputation.payment_history.disputed > 2) {
    reputation.risk_level = 'high';
  } else if (overdueRate > 0.1 || reputation.payment_history.avg_days_to_pay > 45) {
    reputation.risk_level = 'medium';
  }

  return reputation;
}

/**
 * d) qualify_load — check equipment match, distance, rate vs minimum, HOS feasibility
 */
async function handleQualifyLoad(input) {
  const { load_id, truck_equipment, min_rate_per_mile, max_distance, tenant_id } = input;
  if (!load_id) throw new Error('load_id required');
  const tid = tenant_id || 'logistics';

  let load;
  const [[byId]] = await sequelize.query(`SELECT * FROM lg_loads WHERE id = $1 AND tenant_id = $2`, { bind: [load_id, tid] });
  if (byId) { load = byId; }
  else {
    const [[byRef]] = await sequelize.query(`SELECT * FROM lg_loads WHERE load_ref = $1 AND tenant_id = $2`, { bind: [String(load_id), tid] });
    load = byRef;
  }
  if (!load) throw new Error('Load not found');

  const miles = parseFloat(load.miles) || 0;
  const rate = parseFloat(load.sell_rate) || parseFloat(load.buy_rate) || 0;
  const rpm = miles > 0 ? rate / miles : 0;
  const hosDrivingLimit = 11; // hours
  const avgSpeed = 50; // mph
  const maxHosMiles = hosDrivingLimit * avgSpeed; // 550 miles per driving day
  const drivingDays = miles > 0 ? Math.ceil(miles / maxHosMiles) : 1;

  const checks = {
    equipment_match: true,
    rate_acceptable: true,
    distance_acceptable: true,
    hos_feasible: true,
  };
  const issues = [];

  // Equipment check
  if (truck_equipment && load.equipment_type && truck_equipment !== load.equipment_type) {
    const compat = { dry_van: ['reefer'], reefer: ['dry_van'], flatbed: ['step_deck'], step_deck: ['flatbed'] };
    if (!(compat[truck_equipment] || []).includes(load.equipment_type)) {
      checks.equipment_match = false;
      issues.push(`Equipment mismatch: load requires ${load.equipment_type}, truck is ${truck_equipment}`);
    }
  }

  // Rate check
  if (min_rate_per_mile && rpm < min_rate_per_mile) {
    checks.rate_acceptable = false;
    issues.push(`Rate $${rpm.toFixed(2)}/mi below minimum $${min_rate_per_mile}/mi`);
  }

  // Distance check
  if (max_distance && miles > max_distance) {
    checks.distance_acceptable = false;
    issues.push(`Distance ${miles} mi exceeds maximum ${max_distance} mi`);
  }

  // HOS feasibility — flag if pickup-to-delivery window is too tight
  if (load.pickup_date && load.delivery_date) {
    const pickupDate = new Date(load.pickup_date);
    const deliveryDate = new Date(load.delivery_date);
    const windowDays = (deliveryDate - pickupDate) / 86400000;
    if (windowDays > 0 && drivingDays > windowDays) {
      checks.hos_feasible = false;
      issues.push(`HOS: needs ${drivingDays} driving days but only ${windowDays} day(s) window`);
    }
  }

  const qualified = Object.values(checks).every(v => v);

  return {
    load_id: load.id,
    load_ref: load.load_ref,
    lane: `${load.origin_city || '?'}, ${load.origin_state || '?'} -> ${load.destination_city || '?'}, ${load.destination_state || '?'}`,
    miles,
    rate,
    rate_per_mile: Math.round(rpm * 100) / 100,
    driving_days: drivingDays,
    qualified,
    checks,
    issues,
  };
}

/**
 * e) match_freight_to_truck — query lg_trucks near location + match to open loads
 */
async function handleMatchFreightToTruck(input) {
  const { truck_id, origin_state, equipment_type, radius_miles, max_results, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const limit = Math.min(max_results || 20, 100);

  // Get truck info if truck_id provided
  let truck = null;
  if (truck_id) {
    const [[t]] = await sequelize.query(
      `SELECT * FROM lg_trucks WHERE id = $1 AND tenant_id = $2`, { bind: [truck_id, tid] }
    );
    truck = t;
  }

  const truckState = truck ? (truck.current_state || '').toUpperCase() : (origin_state || '').toUpperCase();
  const truckEquip = truck ? truck.equipment_type : equipment_type;

  if (!truckState) throw new Error('Could not determine truck location — provide truck_id or origin_state');

  // Find open loads originating in same or adjacent states
  const [loads] = await sequelize.query(`
    SELECT id, load_ref, origin_city, origin_state, destination_city, destination_state,
           equipment_type, pickup_date, delivery_date, miles, sell_rate, buy_rate, status
    FROM lg_loads
    WHERE tenant_id = $1 AND status = 'open'
      AND UPPER(origin_state) = $2
    ORDER BY pickup_date ASC
    LIMIT ${limit * 2}
  `, { bind: [tid, truckState] });

  // Score each load for this truck
  const scored = loads.map(load => {
    let score = 50; // base
    const miles = parseFloat(load.miles) || 0;
    const rate = parseFloat(load.sell_rate) || parseFloat(load.buy_rate) || 0;
    const rpm = miles > 0 ? rate / miles : 0;

    // Equipment match bonus
    if (truckEquip && load.equipment_type === truckEquip) score += 25;
    else if (truckEquip) score += 5;

    // Rate bonus
    if (rpm >= 3.0) score += 15;
    else if (rpm >= 2.0) score += 10;
    else if (rpm >= 1.5) score += 5;

    // Same city bonus
    if (truck && truck.current_city && load.origin_city &&
        truck.current_city.toLowerCase().trim() === load.origin_city.toLowerCase().trim()) {
      score += 10;
    }

    return { ...load, match_score: Math.min(score, 100), rate_per_mile: Math.round(rpm * 100) / 100 };
  });

  scored.sort((a, b) => b.match_score - a.match_score);
  const topMatches = scored.slice(0, limit);

  return {
    truck: truck ? { id: truck.id, current_location: `${truck.current_city || '?'}, ${truck.current_state || '?'}`, equipment: truck.equipment_type } : { state: truckState, equipment: truckEquip },
    matches: topMatches,
    total: topMatches.length,
  };
}

/**
 * f) score_load — composite score (distance, rate, timing, equipment)
 */
async function handleScoreLoad(input) {
  const { load_id, preferred_equipment, min_rpm, preferred_origin_state, tenant_id } = input;
  if (!load_id) throw new Error('load_id required');
  const tid = tenant_id || 'logistics';

  let load;
  const [[byId]] = await sequelize.query(`SELECT * FROM lg_loads WHERE id = $1 AND tenant_id = $2`, { bind: [load_id, tid] });
  if (byId) { load = byId; }
  else {
    const [[byRef]] = await sequelize.query(`SELECT * FROM lg_loads WHERE load_ref = $1 AND tenant_id = $2`, { bind: [String(load_id), tid] });
    load = byRef;
  }
  if (!load) throw new Error('Load not found');

  const miles = parseFloat(load.miles) || 0;
  const rate = parseFloat(load.sell_rate) || parseFloat(load.buy_rate) || 0;
  const rpm = miles > 0 ? rate / miles : 0;

  // Distance score: prefer 200-800 mile loads (sweet spot)
  let distanceScore = 50;
  if (miles >= 200 && miles <= 800) distanceScore = 90;
  else if (miles > 800 && miles <= 1500) distanceScore = 70;
  else if (miles < 200 && miles > 50) distanceScore = 60;
  else if (miles > 1500) distanceScore = 40;

  // Rate score
  let rateScore = 30;
  const targetRpm = min_rpm || 2.0;
  if (rpm >= targetRpm * 1.5) rateScore = 100;
  else if (rpm >= targetRpm * 1.2) rateScore = 85;
  else if (rpm >= targetRpm) rateScore = 70;
  else if (rpm >= targetRpm * 0.8) rateScore = 50;

  // Timing score: loads with more lead time score higher
  let timingScore = 50;
  if (load.pickup_date) {
    const daysUntilPickup = (new Date(load.pickup_date) - new Date()) / 86400000;
    if (daysUntilPickup >= 1 && daysUntilPickup <= 5) timingScore = 90;
    else if (daysUntilPickup > 5 && daysUntilPickup <= 14) timingScore = 75;
    else if (daysUntilPickup > 0 && daysUntilPickup < 1) timingScore = 60;
    else if (daysUntilPickup < 0) timingScore = 20;
  }

  // Equipment score
  let equipmentScore = 50;
  if (preferred_equipment && load.equipment_type === preferred_equipment) equipmentScore = 100;
  else if (!preferred_equipment) equipmentScore = 70;

  // Location bonus
  let locationBonus = 0;
  if (preferred_origin_state && (load.origin_state || '').toUpperCase() === preferred_origin_state.toUpperCase()) {
    locationBonus = 10;
  }

  const composite = Math.round(
    distanceScore * 0.25 +
    rateScore * 0.35 +
    timingScore * 0.20 +
    equipmentScore * 0.20 +
    locationBonus
  );

  return {
    load_id: load.id,
    load_ref: load.load_ref,
    lane: `${load.origin_city || '?'}, ${load.origin_state || '?'} -> ${load.destination_city || '?'}, ${load.destination_state || '?'}`,
    miles,
    rate,
    rate_per_mile: Math.round(rpm * 100) / 100,
    composite_score: Math.min(composite, 100),
    scores: { distance: distanceScore, rate: rateScore, timing: timingScore, equipment: equipmentScore },
    location_bonus: locationBonus,
  };
}

/**
 * g) find_load_pairs — wraps existing loadmatching.find_load_pairs
 */
async function handleFindLoadPairs(input) {
  return loadmatching.find_load_pairs(input);
}

/**
 * h) post_to_load_board — INSERT into lg_loads with source='api', status='posted' (simulate)
 */
async function handlePostToLoadBoard(input) {
  const {
    origin_city, origin_state, destination_city, destination_state,
    equipment_type, pickup_date, delivery_date, miles, rate, weight,
    commodity, notes, tenant_id
  } = input;

  if (!origin_state || !destination_state) throw new Error('origin_state and destination_state required');
  const tid = tenant_id || 'logistics';
  const loadRef = `POST-${Date.now().toString(36).toUpperCase()}`;

  const [result] = await sequelize.query(`
    INSERT INTO lg_loads (tenant_id, load_ref, origin_city, origin_state, destination_city, destination_state,
      equipment_type, pickup_date, delivery_date, miles, sell_rate, weight, commodity, notes, source, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'api', 'posted', NOW())
    RETURNING id, load_ref
  `, { bind: [tid, loadRef, origin_city || null, origin_state, destination_city || null, destination_state,
    equipment_type || 'dry_van', pickup_date || null, delivery_date || null,
    miles || null, rate || null, weight || null, commodity || null, notes || null] });

  return {
    success: true,
    load_id: result[0].id,
    load_ref: result[0].load_ref,
    status: 'posted',
    source: 'api',
    message: 'Load posted to board successfully',
  };
}

/**
 * i) search_available_trucks — query lg_trucks WHERE status='available' near origin
 */
async function handleSearchAvailableTrucks(input) {
  const { origin_state, origin_city, equipment_type, max_results, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const limit = Math.min(max_results || 25, 100);

  const binds = [tid];
  const clauses = [`tenant_id = $1`, `status = 'available'`];
  let idx = 2;

  if (origin_state) {
    clauses.push(`UPPER(current_state) = $${idx}`);
    binds.push(origin_state.toUpperCase());
    idx++;
  }
  if (origin_city) {
    clauses.push(`LOWER(current_city) = $${idx}`);
    binds.push(origin_city.toLowerCase().trim());
    idx++;
  }
  if (equipment_type) {
    clauses.push(`equipment_type = $${idx}`);
    binds.push(equipment_type);
    idx++;
  }

  const [trucks] = await sequelize.query(`
    SELECT id, truck_number, carrier_id, equipment_type, current_city, current_state,
           available_date, driver_name, status
    FROM lg_trucks
    WHERE ${clauses.join(' AND ')}
    ORDER BY available_date ASC NULLS LAST
    LIMIT ${limit}
  `, { bind: binds });

  return { trucks, total: trucks.length, filters: { origin_state, origin_city, equipment_type } };
}

/**
 * j) onboard_carrier — lookup FMCSA data + INSERT into lg_carriers + lg_compliance
 */
async function handleOnboardCarrier(input) {
  const { dot_number, mc_number, contact_name, contact_email, contact_phone, tenant_id } = input;
  if (!dot_number && !mc_number) throw new Error('dot_number or mc_number required');
  const tid = tenant_id || 'logistics';

  // Lookup FMCSA data
  const fmcsaData = await fmcsa.lookupCarrier({ dot_number, mc_number });
  if (!fmcsaData.found) {
    return { success: false, message: 'Carrier not found in FMCSA database', dot_number, mc_number };
  }

  // Check if already exists
  const [[existing]] = await sequelize.query(
    `SELECT id FROM lg_carriers WHERE dot_number = $1 AND tenant_id = $2`,
    { bind: [fmcsaData.dot_number, tid] }
  );
  if (existing) {
    return { success: false, message: 'Carrier already onboarded', carrier_id: existing.id, dot_number: fmcsaData.dot_number };
  }

  // Insert carrier
  const [carrierResult] = await sequelize.query(`
    INSERT INTO lg_carriers (tenant_id, dot_number, mc_number, company_name, contact_name, contact_email, contact_phone,
      city, state, zip, power_units, total_drivers, equipment_types, fmcsa_status, onboarded_at, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
    RETURNING id
  `, { bind: [tid, fmcsaData.dot_number, fmcsaData.mc_number, fmcsaData.legal_name,
    contact_name || null, contact_email || null, contact_phone || fmcsaData.phone,
    fmcsaData.city, fmcsaData.state, fmcsaData.zip,
    fmcsaData.power_units, fmcsaData.total_drivers, null,
    fmcsaData.status] });

  const carrierId = carrierResult[0].id;

  // Insert compliance record
  await sequelize.query(`
    INSERT INTO lg_compliance (tenant_id, entity_type, entity_id, compliance_type, status,
      verified_at, expires_at, source, created_at)
    VALUES ($1, 'carrier', $2, 'operating_authority', $3, NOW(), NOW() + INTERVAL '1 year', 'fmcsa', NOW())
  `, { bind: [tid, carrierId, fmcsaData.status === 'active' ? 'valid' : 'invalid'] }).catch(() => {});

  return {
    success: true,
    carrier_id: carrierId,
    carrier: {
      dot_number: fmcsaData.dot_number,
      mc_number: fmcsaData.mc_number,
      company_name: fmcsaData.legal_name,
      city: fmcsaData.city,
      state: fmcsaData.state,
      power_units: fmcsaData.power_units,
      total_drivers: fmcsaData.total_drivers,
      fmcsa_status: fmcsaData.status,
    },
    message: 'Carrier onboarded successfully with FMCSA data',
  };
}

/**
 * k) score_carrier — query lg_carriers + lg_loads for carrier performance metrics
 */
async function handleScoreCarrier(input) {
  const { carrier_id, tenant_id } = input;
  if (!carrier_id) throw new Error('carrier_id required');
  const tid = tenant_id || 'logistics';

  const [[carrier]] = await sequelize.query(
    `SELECT * FROM lg_carriers WHERE id = $1 AND tenant_id = $2`, { bind: [carrier_id, tid] }
  );
  if (!carrier) throw new Error('Carrier not found');

  // Load performance
  const [stats] = await sequelize.query(`
    SELECT COUNT(*) as total_loads,
           COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
           COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
           COUNT(CASE WHEN on_time_delivery = true THEN 1 END) as on_time,
           COALESCE(AVG(miles), 0) as avg_miles,
           COALESCE(SUM(buy_rate), 0) as total_revenue
    FROM lg_loads WHERE carrier_id = $1 AND tenant_id = $2
  `, { bind: [carrier_id, tid] });

  const s = stats[0] || {};
  const totalLoads = parseInt(s.total_loads) || 0;
  const delivered = parseInt(s.delivered) || 0;
  const onTime = parseInt(s.on_time) || 0;
  const cancelled = parseInt(s.cancelled) || 0;

  const completionRate = totalLoads > 0 ? (delivered / totalLoads) * 100 : 0;
  const onTimeRate = delivered > 0 ? (onTime / delivered) * 100 : 0;
  const cancelRate = totalLoads > 0 ? (cancelled / totalLoads) * 100 : 0;

  // Composite carrier score
  let score = 50;
  if (completionRate >= 95) score += 20; else if (completionRate >= 85) score += 10;
  if (onTimeRate >= 90) score += 15; else if (onTimeRate >= 75) score += 8;
  if (cancelRate <= 2) score += 10; else if (cancelRate <= 5) score += 5;
  if (totalLoads >= 50) score += 5; else if (totalLoads >= 20) score += 3;

  return {
    carrier_id: carrier.id,
    company_name: carrier.company_name,
    dot_number: carrier.dot_number,
    composite_score: Math.min(score, 100),
    metrics: {
      total_loads: totalLoads,
      delivered,
      on_time: onTime,
      cancelled,
      completion_rate: Math.round(completionRate * 10) / 10,
      on_time_rate: Math.round(onTimeRate * 10) / 10,
      cancel_rate: Math.round(cancelRate * 10) / 10,
      avg_miles: Math.round(parseFloat(s.avg_miles) || 0),
      total_revenue: parseFloat(s.total_revenue) || 0,
    },
    tier: score >= 85 ? 'gold' : score >= 65 ? 'silver' : score >= 45 ? 'bronze' : 'probation',
  };
}

/**
 * l) monitor_carrier_insurance — query lg_compliance WHERE entity_type='carrier' for expiry
 */
async function handleMonitorCarrierInsurance(input) {
  const { days_until_expiry, carrier_id, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const days = days_until_expiry || 30;

  const binds = [tid, days];
  let carrierFilter = '';
  if (carrier_id) {
    carrierFilter = ` AND c.entity_id = $3`;
    binds.push(carrier_id);
  }

  const [records] = await sequelize.query(`
    SELECT c.id, c.entity_id as carrier_id, c.compliance_type, c.status, c.expires_at,
           c.verified_at, cr.company_name, cr.dot_number,
           EXTRACT(DAY FROM c.expires_at - NOW()) as days_remaining
    FROM lg_compliance c
    JOIN lg_carriers cr ON cr.id = c.entity_id AND cr.tenant_id = c.tenant_id
    WHERE c.tenant_id = $1 AND c.entity_type = 'carrier'
      AND c.expires_at <= NOW() + ($2 || ' days')::INTERVAL
    ${carrierFilter}
    ORDER BY c.expires_at ASC
  `, { bind: binds });

  const expired = records.filter(r => parseFloat(r.days_remaining) <= 0);
  const expiring_soon = records.filter(r => parseFloat(r.days_remaining) > 0);

  return {
    expired: expired.length,
    expiring_soon: expiring_soon.length,
    total_alerts: records.length,
    days_window: days,
    records,
  };
}

/**
 * m) score_shipper_relationship — query lg_shippers scores + lg_loads volume + lg_quotes payment
 */
async function handleScoreShipperRelationship(input) {
  const { shipper_id, tenant_id } = input;
  if (!shipper_id) throw new Error('shipper_id required');
  const tid = tenant_id || 'logistics';

  const [[shipper]] = await sequelize.query(
    `SELECT * FROM lg_shippers WHERE id = $1 AND tenant_id = $2`, { bind: [shipper_id, tid] }
  );
  if (!shipper) throw new Error('Shipper not found');

  // Load volume
  const [[volume]] = await sequelize.query(`
    SELECT COUNT(*) as total_loads, COALESCE(SUM(sell_rate), 0) as total_revenue,
           MIN(pickup_date) as first_load, MAX(pickup_date) as last_load
    FROM lg_loads WHERE shipper_id = $1 AND tenant_id = $2
  `, { bind: [shipper_id, tid] });

  // Payment performance
  const [[payments]] = await sequelize.query(`
    SELECT COUNT(*) as total_quotes, COALESCE(AVG(days_to_pay), 0) as avg_days,
           COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_count
    FROM lg_quotes WHERE shipper_id = $1 AND tenant_id = $2
  `, { bind: [shipper_id, tid] });

  const totalLoads = parseInt(volume.total_loads) || 0;
  const totalRevenue = parseFloat(volume.total_revenue) || 0;
  const avgDaysToPay = Math.round(parseFloat(payments.avg_days) || 0);
  const overdueCount = parseInt(payments.overdue_count) || 0;

  // Relationship score
  let score = 50;
  if (totalLoads >= 100) score += 15; else if (totalLoads >= 50) score += 10; else if (totalLoads >= 20) score += 5;
  if (totalRevenue >= 500000) score += 10; else if (totalRevenue >= 100000) score += 5;
  if (avgDaysToPay <= 15) score += 10; else if (avgDaysToPay <= 30) score += 5; else if (avgDaysToPay > 45) score -= 10;
  if (overdueCount === 0) score += 10; else if (overdueCount <= 2) score += 5; else score -= 5;
  if (parseFloat(shipper.credit_score || 0) >= 80) score += 5;

  return {
    shipper_id: shipper.id,
    company_name: shipper.company_name,
    relationship_score: Math.min(Math.max(score, 0), 100),
    volume: { total_loads: totalLoads, total_revenue: totalRevenue, first_load: volume.first_load, last_load: volume.last_load },
    payment: { avg_days_to_pay: avgDaysToPay, overdue_count: overdueCount, total_quotes: parseInt(payments.total_quotes) || 0 },
    tier: score >= 80 ? 'strategic' : score >= 60 ? 'preferred' : score >= 40 ? 'standard' : 'at_risk',
  };
}

/**
 * n) predict_shipper_demand — query last 12 months lg_loads grouped by month, calculate trend
 */
async function handlePredictShipperDemand(input) {
  const { shipper_id, tenant_id } = input;
  if (!shipper_id) throw new Error('shipper_id required');
  const tid = tenant_id || 'logistics';

  const [monthly] = await sequelize.query(`
    SELECT TO_CHAR(pickup_date, 'YYYY-MM') as month,
           COUNT(*) as load_count,
           COALESCE(SUM(sell_rate), 0) as revenue,
           COALESCE(AVG(miles), 0) as avg_miles
    FROM lg_loads
    WHERE shipper_id = $1 AND tenant_id = $2
      AND pickup_date >= NOW() - INTERVAL '12 months'
    GROUP BY TO_CHAR(pickup_date, 'YYYY-MM')
    ORDER BY month ASC
  `, { bind: [shipper_id, tid] });

  if (monthly.length < 2) {
    return { shipper_id, monthly, trend: 'insufficient_data', predicted_next_month: null, message: 'Need at least 2 months of data for trend analysis' };
  }

  // Calculate linear trend (simple regression on load counts)
  const counts = monthly.map(m => parseInt(m.load_count));
  const n = counts.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = counts.reduce((a, b) => a + b, 0);
  const sumXY = counts.reduce((acc, y, i) => acc + i * y, 0);
  const sumX2 = Array.from({ length: n }, (_, i) => i * i).reduce((a, b) => a + b, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const predicted = Math.max(0, Math.round(intercept + slope * n));

  // Trend direction
  let trend = 'stable';
  if (slope > 1) trend = 'growing';
  else if (slope > 0.2) trend = 'slight_growth';
  else if (slope < -1) trend = 'declining';
  else if (slope < -0.2) trend = 'slight_decline';

  // Average revenue per load for revenue projection
  const avgRevenuePerLoad = sumY > 0
    ? monthly.reduce((acc, m) => acc + parseFloat(m.revenue), 0) / sumY : 0;

  return {
    shipper_id,
    monthly,
    trend,
    slope: Math.round(slope * 100) / 100,
    predicted_next_month: { loads: predicted, estimated_revenue: Math.round(predicted * avgRevenuePerLoad) },
    avg_loads_per_month: Math.round(sumY / n),
  };
}

/**
 * o) identify_upsell_lanes — query lg_loads for shipper's top lanes vs our capacity
 */
async function handleIdentifyUpsellLanes(input) {
  const { shipper_id, tenant_id } = input;
  if (!shipper_id) throw new Error('shipper_id required');
  const tid = tenant_id || 'logistics';

  // Get shipper's top lanes by volume
  const [shipperLanes] = await sequelize.query(`
    SELECT origin_state, destination_state, equipment_type,
           COUNT(*) as load_count,
           COALESCE(AVG(sell_rate), 0) as avg_rate,
           COALESCE(AVG(miles), 0) as avg_miles
    FROM lg_loads
    WHERE shipper_id = $1 AND tenant_id = $2 AND pickup_date >= NOW() - INTERVAL '6 months'
    GROUP BY origin_state, destination_state, equipment_type
    ORDER BY load_count DESC
    LIMIT 20
  `, { bind: [shipper_id, tid] });

  // Check our truck availability for each lane
  const upsellOpportunities = [];
  for (const lane of shipperLanes) {
    const [[truckCount]] = await sequelize.query(`
      SELECT COUNT(*) as available
      FROM lg_trucks
      WHERE tenant_id = $1 AND status = 'available'
        AND UPPER(current_state) = $2
        AND ($3::TEXT IS NULL OR equipment_type = $3)
    `, { bind: [tid, (lane.origin_state || '').toUpperCase(), lane.equipment_type || null] });

    const available = parseInt(truckCount.available) || 0;

    // If we have trucks in the lane, it's an upsell opportunity
    if (available > 0) {
      upsellOpportunities.push({
        lane: `${lane.origin_state} -> ${lane.destination_state}`,
        equipment: lane.equipment_type,
        shipper_volume: parseInt(lane.load_count),
        avg_rate: Math.round(parseFloat(lane.avg_rate) * 100) / 100,
        avg_miles: Math.round(parseFloat(lane.avg_miles)),
        our_available_trucks: available,
        potential_monthly_revenue: Math.round(parseFloat(lane.avg_rate) * parseInt(lane.load_count) / 6),
        recommendation: available >= parseInt(lane.load_count) / 6 ? 'full_coverage' : 'partial_coverage',
      });
    }
  }

  return {
    shipper_id,
    total_lanes_analyzed: shipperLanes.length,
    upsell_opportunities: upsellOpportunities.length,
    opportunities: upsellOpportunities,
  };
}

/**
 * p) detect_shipper_churn — query lg_shippers WHERE volume declining >15% over 60 days
 */
async function handleDetectShipperChurn(input) {
  const { threshold_pct, days_window, tenant_id } = input;
  const tid = tenant_id || 'logistics';
  const threshold = threshold_pct || 15;
  const window = days_window || 60;
  const halfWindow = Math.floor(window / 2);

  // Compare recent half vs prior half load volume per shipper
  const [churnData] = await sequelize.query(`
    WITH recent AS (
      SELECT shipper_id, COUNT(*) as recent_loads
      FROM lg_loads
      WHERE tenant_id = $1 AND pickup_date >= NOW() - ($2 || ' days')::INTERVAL
        AND pickup_date >= NOW() - ($3 || ' days')::INTERVAL
        AND shipper_id IS NOT NULL
      GROUP BY shipper_id
    ),
    prior AS (
      SELECT shipper_id, COUNT(*) as prior_loads
      FROM lg_loads
      WHERE tenant_id = $1
        AND pickup_date >= NOW() - ($2 || ' days')::INTERVAL
        AND pickup_date < NOW() - ($3 || ' days')::INTERVAL
        AND shipper_id IS NOT NULL
      GROUP BY shipper_id
    )
    SELECT COALESCE(r.shipper_id, p.shipper_id) as shipper_id,
           COALESCE(p.prior_loads, 0) as prior_loads,
           COALESCE(r.recent_loads, 0) as recent_loads,
           s.company_name, s.contact_name
    FROM prior p
    FULL OUTER JOIN recent r ON r.shipper_id = p.shipper_id
    LEFT JOIN lg_shippers s ON s.id = COALESCE(r.shipper_id, p.shipper_id) AND s.tenant_id = $1
    WHERE COALESCE(p.prior_loads, 0) > 0
    ORDER BY COALESCE(r.recent_loads, 0)::FLOAT / GREATEST(COALESCE(p.prior_loads, 1), 1) ASC
  `, { bind: [tid, window, halfWindow] });

  const atRisk = churnData.filter(d => {
    const prior = parseInt(d.prior_loads) || 0;
    const recent = parseInt(d.recent_loads) || 0;
    if (prior === 0) return false;
    const declinePct = ((prior - recent) / prior) * 100;
    return declinePct >= threshold;
  }).map(d => {
    const prior = parseInt(d.prior_loads) || 0;
    const recent = parseInt(d.recent_loads) || 0;
    const declinePct = prior > 0 ? Math.round(((prior - recent) / prior) * 100) : 0;
    return {
      shipper_id: d.shipper_id,
      company_name: d.company_name,
      contact_name: d.contact_name,
      prior_loads: prior,
      recent_loads: recent,
      decline_pct: declinePct,
      risk_level: declinePct >= 50 ? 'critical' : declinePct >= 30 ? 'high' : 'moderate',
    };
  });

  return {
    threshold_pct: threshold,
    days_window: window,
    shippers_analyzed: churnData.length,
    at_risk: atRisk.length,
    at_risk_shippers: atRisk,
  };
}

/**
 * q) get_shipper_360 — full shipper profile from lg_shippers + lg_loads + lg_quotes + lg_calls
 */
async function handleGetShipper360(input) {
  const { shipper_id, tenant_id } = input;
  if (!shipper_id) throw new Error('shipper_id required');
  const tid = tenant_id || 'logistics';

  // Shipper profile
  const [[shipper]] = await sequelize.query(
    `SELECT * FROM lg_shippers WHERE id = $1 AND tenant_id = $2`, { bind: [shipper_id, tid] }
  );
  if (!shipper) throw new Error('Shipper not found');

  // Load summary
  const [[loadSummary]] = await sequelize.query(`
    SELECT COUNT(*) as total_loads,
           COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
           COUNT(CASE WHEN status = 'open' THEN 1 END) as open_loads,
           COUNT(CASE WHEN status = 'in_transit' THEN 1 END) as in_transit,
           COALESCE(SUM(sell_rate), 0) as total_revenue,
           COALESCE(AVG(sell_rate), 0) as avg_rate,
           COALESCE(AVG(miles), 0) as avg_miles,
           MIN(pickup_date) as first_load_date,
           MAX(pickup_date) as last_load_date
    FROM lg_loads WHERE shipper_id = $1 AND tenant_id = $2
  `, { bind: [shipper_id, tid] });

  // Top lanes
  const [topLanes] = await sequelize.query(`
    SELECT origin_state, destination_state, COUNT(*) as count, COALESCE(AVG(sell_rate),0) as avg_rate
    FROM lg_loads WHERE shipper_id = $1 AND tenant_id = $2
    GROUP BY origin_state, destination_state
    ORDER BY count DESC LIMIT 5
  `, { bind: [shipper_id, tid] });

  // Quote / payment summary
  const [[quoteSummary]] = await sequelize.query(`
    SELECT COUNT(*) as total_quotes,
           COALESCE(SUM(amount), 0) as total_invoiced,
           COALESCE(AVG(days_to_pay), 0) as avg_days_to_pay,
           COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid,
           COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue
    FROM lg_quotes WHERE shipper_id = $1 AND tenant_id = $2
  `, { bind: [shipper_id, tid] });

  // Recent calls
  const [recentCalls] = await sequelize.query(`
    SELECT id, direction, duration_seconds, outcome, notes, created_at
    FROM lg_calls
    WHERE shipper_id = $1 AND tenant_id = $2
    ORDER BY created_at DESC LIMIT 10
  `, { bind: [shipper_id, tid] }).catch(() => [[]]);

  return {
    profile: shipper,
    load_summary: {
      total: parseInt(loadSummary.total_loads) || 0,
      delivered: parseInt(loadSummary.delivered) || 0,
      open: parseInt(loadSummary.open_loads) || 0,
      in_transit: parseInt(loadSummary.in_transit) || 0,
      total_revenue: parseFloat(loadSummary.total_revenue) || 0,
      avg_rate: Math.round(parseFloat(loadSummary.avg_rate) || 0),
      avg_miles: Math.round(parseFloat(loadSummary.avg_miles) || 0),
      first_load: loadSummary.first_load_date,
      last_load: loadSummary.last_load_date,
    },
    top_lanes: topLanes.map(l => ({
      lane: `${l.origin_state} -> ${l.destination_state}`,
      count: parseInt(l.count),
      avg_rate: Math.round(parseFloat(l.avg_rate) * 100) / 100,
    })),
    financials: {
      total_quotes: parseInt(quoteSummary.total_quotes) || 0,
      total_invoiced: parseFloat(quoteSummary.total_invoiced) || 0,
      avg_days_to_pay: Math.round(parseFloat(quoteSummary.avg_days_to_pay) || 0),
      paid: parseInt(quoteSummary.paid) || 0,
      overdue: parseInt(quoteSummary.overdue) || 0,
    },
    recent_calls: recentCalls || [],
  };
}


// ─── Tool Definitions ────────────────────────────────────────────────────────

const tools = [
  {
    name: 'scan_load_boards',
    description: 'Scan open loads from load boards filtered by equipment, origin, and date range',
    input_schema: {
      type: 'object',
      properties: {
        equipment_type: { type: 'string', description: 'e.g. dry_van, reefer, flatbed' },
        origin_state: { type: 'string', description: '2-letter state code' },
        origin_city: { type: 'string' },
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        max_results: { type: 'integer', default: 50 },
        tenant_id: { type: 'string' },
      },
    },
    handler: handleScanLoadBoards,
  },
  {
    name: 'filter_by_equipment',
    description: 'Filter an array of loads by equipment type with compatibility matching',
    input_schema: {
      type: 'object',
      properties: {
        loads: { type: 'array', description: 'Array of load objects to filter' },
        equipment_type: { type: 'string', description: 'Target equipment type' },
      },
      required: ['loads', 'equipment_type'],
    },
    handler: handleFilterByEquipment,
  },
  {
    name: 'check_shipper_reputation',
    description: 'Check shipper credit score and payment history to assess risk',
    input_schema: {
      type: 'object',
      properties: {
        shipper_id: { type: 'integer' },
        tenant_id: { type: 'string' },
      },
      required: ['shipper_id'],
    },
    handler: handleCheckShipperReputation,
  },
  {
    name: 'qualify_load',
    description: 'Qualify a load by checking equipment match, rate, distance, and HOS feasibility',
    input_schema: {
      type: 'object',
      properties: {
        load_id: { type: ['integer', 'string'], description: 'Load ID or load_ref' },
        truck_equipment: { type: 'string' },
        min_rate_per_mile: { type: 'number' },
        max_distance: { type: 'number' },
        tenant_id: { type: 'string' },
      },
      required: ['load_id'],
    },
    handler: handleQualifyLoad,
  },
  {
    name: 'match_freight_to_truck',
    description: 'Find open loads matching a specific truck based on location and equipment',
    input_schema: {
      type: 'object',
      properties: {
        truck_id: { type: 'integer' },
        origin_state: { type: 'string' },
        equipment_type: { type: 'string' },
        radius_miles: { type: 'integer', default: 150 },
        max_results: { type: 'integer', default: 20 },
        tenant_id: { type: 'string' },
      },
    },
    handler: handleMatchFreightToTruck,
  },
  {
    name: 'score_load',
    description: 'Calculate a composite score for a load based on distance, rate, timing, and equipment',
    input_schema: {
      type: 'object',
      properties: {
        load_id: { type: ['integer', 'string'], description: 'Load ID or load_ref' },
        preferred_equipment: { type: 'string' },
        min_rpm: { type: 'number', description: 'Minimum acceptable rate per mile' },
        preferred_origin_state: { type: 'string' },
        tenant_id: { type: 'string' },
      },
      required: ['load_id'],
    },
    handler: handleScoreLoad,
  },
  {
    name: 'find_load_pairs',
    description: 'Find matching load pairs (backhaul, chain, round-trip) for a given load using the load matching engine',
    input_schema: {
      type: 'object',
      properties: {
        load_id: { type: ['integer', 'string'], description: 'Anchor load ID or load_ref' },
        max_results: { type: 'integer', default: 20 },
        pair_types: { type: 'array', items: { type: 'string' }, description: 'Filter: backhaul, chain, round_trip, relay' },
        tenant_id: { type: 'string' },
      },
      required: ['load_id'],
    },
    handler: handleFindLoadPairs,
  },
  {
    name: 'post_to_load_board',
    description: 'Post a new load to the load board (simulated API posting)',
    input_schema: {
      type: 'object',
      properties: {
        origin_city: { type: 'string' },
        origin_state: { type: 'string' },
        destination_city: { type: 'string' },
        destination_state: { type: 'string' },
        equipment_type: { type: 'string', default: 'dry_van' },
        pickup_date: { type: 'string', description: 'YYYY-MM-DD' },
        delivery_date: { type: 'string', description: 'YYYY-MM-DD' },
        miles: { type: 'number' },
        rate: { type: 'number' },
        weight: { type: 'number' },
        commodity: { type: 'string' },
        notes: { type: 'string' },
        tenant_id: { type: 'string' },
      },
      required: ['origin_state', 'destination_state'],
    },
    handler: handlePostToLoadBoard,
  },
  {
    name: 'search_available_trucks',
    description: 'Search for available trucks near a given origin location',
    input_schema: {
      type: 'object',
      properties: {
        origin_state: { type: 'string' },
        origin_city: { type: 'string' },
        equipment_type: { type: 'string' },
        max_results: { type: 'integer', default: 25 },
        tenant_id: { type: 'string' },
      },
    },
    handler: handleSearchAvailableTrucks,
  },
  {
    name: 'onboard_carrier',
    description: 'Onboard a new carrier by looking up FMCSA data and creating carrier + compliance records',
    input_schema: {
      type: 'object',
      properties: {
        dot_number: { type: 'string' },
        mc_number: { type: 'string' },
        contact_name: { type: 'string' },
        contact_email: { type: 'string' },
        contact_phone: { type: 'string' },
        tenant_id: { type: 'string' },
      },
    },
    handler: handleOnboardCarrier,
  },
  {
    name: 'score_carrier',
    description: 'Score a carrier based on load completion, on-time delivery, and cancellation rates',
    input_schema: {
      type: 'object',
      properties: {
        carrier_id: { type: 'integer' },
        tenant_id: { type: 'string' },
      },
      required: ['carrier_id'],
    },
    handler: handleScoreCarrier,
  },
  {
    name: 'monitor_carrier_insurance',
    description: 'Check for carrier compliance records nearing expiration (insurance, authority, etc.)',
    input_schema: {
      type: 'object',
      properties: {
        days_until_expiry: { type: 'integer', default: 30, description: 'Alert window in days' },
        carrier_id: { type: 'integer', description: 'Optional: check a specific carrier' },
        tenant_id: { type: 'string' },
      },
    },
    handler: handleMonitorCarrierInsurance,
  },
  {
    name: 'score_shipper_relationship',
    description: 'Score the overall relationship with a shipper based on volume, payment, and history',
    input_schema: {
      type: 'object',
      properties: {
        shipper_id: { type: 'integer' },
        tenant_id: { type: 'string' },
      },
      required: ['shipper_id'],
    },
    handler: handleScoreShipperRelationship,
  },
  {
    name: 'predict_shipper_demand',
    description: 'Predict next month shipper demand using linear trend analysis on the last 12 months',
    input_schema: {
      type: 'object',
      properties: {
        shipper_id: { type: 'integer' },
        tenant_id: { type: 'string' },
      },
      required: ['shipper_id'],
    },
    handler: handlePredictShipperDemand,
  },
  {
    name: 'identify_upsell_lanes',
    description: 'Identify lanes where a shipper has volume and we have available truck capacity',
    input_schema: {
      type: 'object',
      properties: {
        shipper_id: { type: 'integer' },
        tenant_id: { type: 'string' },
      },
      required: ['shipper_id'],
    },
    handler: handleIdentifyUpsellLanes,
  },
  {
    name: 'detect_shipper_churn',
    description: 'Detect shippers with declining load volume that may be churning',
    input_schema: {
      type: 'object',
      properties: {
        threshold_pct: { type: 'number', default: 15, description: 'Minimum decline % to flag' },
        days_window: { type: 'integer', default: 60, description: 'Lookback window in days' },
        tenant_id: { type: 'string' },
      },
    },
    handler: handleDetectShipperChurn,
  },
  {
    name: 'get_shipper_360',
    description: 'Get a full 360-degree shipper profile including loads, financials, top lanes, and call history',
    input_schema: {
      type: 'object',
      properties: {
        shipper_id: { type: 'integer' },
        tenant_id: { type: 'string' },
      },
      required: ['shipper_id'],
    },
    handler: handleGetShipper360,
  },
];


// ─── Create and Register Agent ───────────────────────────────────────────────

const freightFinder = new FreightMindAgent({
  name: 'freight_finder',
  systemPrompt: `You are the Freight Finder agent for FreightMind AI — a logistics intelligence platform.

Your capabilities:
- LOAD SOURCING: Scan load boards, filter by equipment, score and qualify loads, find load pairs (backhaul/chain/round-trip)
- TRUCK MATCHING: Match open freight to available trucks based on location, equipment, and capacity
- CARRIER MANAGEMENT: Onboard new carriers via FMCSA, score carrier performance, monitor insurance/compliance expiry
- SHIPPER INTELLIGENCE: Score shipper relationships, predict demand trends, identify upsell lanes, detect churn risk, build 360-degree profiles
- LOAD BOARD POSTING: Post loads to the board for coverage

When analyzing freight:
1. Always consider equipment compatibility (dry_van/reefer are cross-compatible, flatbed/step_deck are cross-compatible)
2. Rate per mile (RPM) is the key profitability metric — target >= $2.00/mi for dry van, >= $2.50/mi for reefer, >= $3.00/mi for flatbed
3. Factor in deadhead miles when evaluating load pairs
4. HOS regulations limit drivers to 11 hours driving / 14 hours on-duty per day

When evaluating carriers:
1. FMCSA operating authority must be active
2. Insurance and compliance documents must be current
3. On-time delivery and completion rates are key performance indicators

When analyzing shippers:
1. Payment history and days-to-pay indicate financial reliability
2. Volume trends predict future demand
3. Declining volume over 60+ days signals potential churn — flag for account management

Be data-driven, concise, and actionable in all responses.`,
  tools,
});

registerAgent(freightFinder);

module.exports = freightFinder;
