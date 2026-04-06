/**
 * CW Carriers — Autopilot Pipeline Engine
 * 8-stage orchestration: contract -> rate -> match -> load-match -> outreach -> confirm -> track -> bill
 * Event-driven auto-advancement with configurable pause rules
 */

const { EventEmitter } = require('events');
const sequelize = require('./db.cw');
const pricing = require('./pricing.cw');

const bus = new EventEmitter();
bus.setMaxListeners(50);

const STAGES = [
  'contract_received',
  'rate_analysis',
  'carrier_match',
  'load_match',
  'carrier_outreach',
  'rate_confirmation',
  'transit_tracking',
  'delivery_billing',
];

// ── Helpers ──────────────────────────────────────────────────────

async function safeQuery(sql, bind) {
  try {
    const [rows] = await sequelize.query(sql, { bind });
    return rows;
  } catch { return []; }
}

async function getRun(id) {
  const [[run]] = await sequelize.query('SELECT * FROM cw_pipeline_runs WHERE id = $1', { bind: [id] });
  return run;
}

async function getConfig(tenantId) {
  const rows = await safeQuery('SELECT * FROM cw_autopilot_config WHERE tenant_id = $1', [tenantId || 'cw_carriers']);
  if (rows.length) return rows[0];
  // Return defaults
  return {
    tenant_id: tenantId || 'cw_carriers',
    enabled: true,
    default_mode: 'autopilot',
    stage_rules: {
      contract_received: { auto_advance: true },
      rate_analysis: { auto_advance: true, pause_if_above_market_pct: 20, pause_if_no_history: true },
      carrier_match: { auto_advance: true, min_carriers_above_threshold: 3, min_carrier_score: 40 },
      load_match: { auto_advance: true, auto_accept_savings_pct: 10 },
      carrier_outreach: { auto_advance: true, use_rachel_voice: false, max_outreach_attempts: 5 },
      rate_confirmation: { auto_advance: true, pause_if_margin_below_pct: 10 },
      transit_tracking: { auto_advance: true, check_call_interval_hours: 4 },
      delivery_billing: { auto_advance: true, auto_invoice: true },
    },
    min_margin_pct: 10,
    target_margin_pct: 15,
    max_auto_book_amount: 25000,
  };
}

function parseRules(config) {
  const rules = config.stage_rules;
  if (typeof rules === 'string') return JSON.parse(rules);
  return rules || {};
}

async function logEvent(runId, tenantId, eventType, stage, details, triggeredBy) {
  try {
    await sequelize.query(
      `INSERT INTO cw_pipeline_events (tenant_id, pipeline_run_id, event_type, stage, details, triggered_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      { bind: [tenantId || 'cw_carriers', runId, eventType, stage || null, JSON.stringify(details || {}), triggeredBy || 'system'] }
    );
  } catch (e) { console.error('[Pipeline] Event log error:', e.message); }
}

async function updateRun(id, fields) {
  const sets = [];
  const binds = [];
  for (const [key, val] of Object.entries(fields)) {
    binds.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
    sets.push(`${key} = $${binds.length}`);
  }
  binds.push(id);
  sets.push('updated_at = NOW()');
  await sequelize.query(`UPDATE cw_pipeline_runs SET ${sets.join(', ')} WHERE id = $${binds.length}`, { bind: binds });
}

function nextStage(current) {
  const idx = STAGES.indexOf(current);
  if (idx < 0 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

function appendError(existingLog, error) {
  const log = Array.isArray(existingLog) ? existingLog : [];
  log.push({ ts: new Date().toISOString(), error: String(error) });
  return log;
}

// ── Stage Executors ──────────────────────────────────────────────

async function exec_contract_received(run, config) {
  const rules = parseRules(config);
  const stageRules = rules.contract_received || {};

  // Get load info
  let load = null;
  if (run.load_id) {
    const rows = await safeQuery('SELECT * FROM lg_loads WHERE id = $1', [run.load_id]);
    if (!rows.length) {
      const cwRows = await safeQuery('SELECT * FROM cw_loads WHERE id = $1', [run.load_id]);
      load = cwRows[0] || null;
    } else {
      load = rows[0];
    }
  }

  const result = {
    load_id: run.load_id,
    load_ref: load?.load_ref || run.load_ref || null,
    origin: load?.origin || load?.origin_city ? `${load.origin_city}, ${load.origin_state}` : null,
    destination: load?.destination || load?.destination_city ? `${load.destination_city}, ${load.destination_state}` : null,
    equipment: load?.equipment_type || 'dry_van',
    weight: load?.weight_lbs || null,
    miles: load?.miles || null,
    shipper_rate: load?.sell_rate || load?.shipper_rate || null,
    recorded_at: new Date().toISOString(),
  };

  return { result, shouldPause: false, pauseReason: null };
}

async function exec_rate_analysis(run, config) {
  const rules = parseRules(config);
  const stageRules = rules.rate_analysis || {};
  const contract = run.result_contract_received || {};

  let rateData = null;
  try {
    rateData = await pricing.get_rate_recommendation({
      origin: contract.origin || '',
      destination: contract.destination || '',
      equipment_type: contract.equipment || 'dry_van',
      miles: contract.miles,
      tenant_id: run.tenant_id === 'cw_carriers' ? 'logistics' : run.tenant_id,
    });
  } catch (e) {
    rateData = { error: e.message, pricing_method: 'failed' };
  }

  const result = {
    recommendation: rateData?.recommendation || null,
    confidence: rateData?.confidence_band?.confidence || 'low',
    pricing_method: rateData?.pricing_method || 'unknown',
    dat: rateData?.dat || null,
    data_quality: rateData?.data_quality || {},
    rationale: rateData?.rationale || [],
    analyzed_at: new Date().toISOString(),
  };

  // Check pause conditions
  let shouldPause = false;
  let pauseReason = null;

  if (stageRules.pause_if_no_history && rateData?.pricing_method === 'market_estimate') {
    shouldPause = true;
    pauseReason = 'No historical rate data — manual rate review recommended';
  }

  if (stageRules.pause_if_above_market_pct && rateData?.dat?.avg_rate && contract.shipper_rate) {
    const marketRate = rateData.dat.avg_rate;
    const shipperRate = parseFloat(contract.shipper_rate);
    const pctAbove = ((shipperRate - marketRate) / marketRate) * 100;
    if (pctAbove > stageRules.pause_if_above_market_pct) {
      shouldPause = true;
      pauseReason = `Rate is ${pctAbove.toFixed(1)}% above market (threshold: ${stageRules.pause_if_above_market_pct}%)`;
    }
  }

  return { result, shouldPause, pauseReason };
}

async function exec_carrier_match(run, config) {
  const rules = parseRules(config);
  const stageRules = rules.carrier_match || {};
  const contract = run.result_contract_received || {};
  const minScore = stageRules.min_carrier_score || 40;
  const minCarriers = stageRules.min_carriers_above_threshold || 3;

  // Direct DB carrier matching (same logic as carrier-matching.js route)
  let load = null;
  if (run.load_id) {
    const rows = await safeQuery('SELECT * FROM lg_loads WHERE id = $1', [run.load_id]);
    if (!rows.length) {
      const cwRows = await safeQuery('SELECT * FROM cw_loads WHERE id = $1', [run.load_id]);
      load = cwRows[0] || null;
    } else {
      load = rows[0];
    }
  }

  const originState = (load?.origin_state || '').toUpperCase();
  const destState = (load?.destination_state || '').toUpperCase();
  const equip = load?.equipment_type || contract.equipment || 'dry_van';

  const carriers = await safeQuery(`
    SELECT id, carrier_name, mc_number, dot_number, contact_name, phone, email,
           equipment_types, home_state, reliability_score, avg_rate_per_mile,
           total_loads_completed, safety_rating
    FROM lg_carriers WHERE tenant_id = 'logistics'
    ORDER BY reliability_score DESC NULLS LAST LIMIT 500
  `, []);

  const matches = [];
  for (const c of carriers) {
    const carrierState = (c.home_state || '').toUpperCase();
    const equipTypes = c.equipment_types || [];
    let equipScore = (Array.isArray(equipTypes) ? equipTypes.includes(equip) : String(equipTypes).includes(equip)) ? 100 : 20;
    let laneScore = carrierState === originState ? 90 : carrierState === destState ? 60 : 30;
    const reliabilityScore = Math.min(100, parseFloat(c.reliability_score) || 50);
    let safetyScore = 50;
    const rating = (c.safety_rating || '').toLowerCase();
    if (rating.includes('satisfactory')) safetyScore = 100;
    else if (rating.includes('unsatisfactory')) safetyScore = 10;

    const matchScore = Math.round(equipScore * 0.25 + laneScore * 0.30 + reliabilityScore * 0.20 + 50 * 0.10 + safetyScore * 0.15);
    if (matchScore >= minScore) {
      matches.push({
        carrier_id: c.id,
        carrier_name: c.carrier_name,
        mc_number: c.mc_number,
        phone: c.phone,
        email: c.email,
        match_score: matchScore,
        reliability: Math.round(reliabilityScore),
      });
    }
  }

  matches.sort((a, b) => b.match_score - a.match_score);
  const topMatches = matches.slice(0, 20);

  const result = {
    total_evaluated: carriers.length,
    qualifying_carriers: matches.length,
    top_matches: topMatches,
    min_score_threshold: minScore,
    matched_at: new Date().toISOString(),
  };

  const shouldPause = matches.length < minCarriers;
  const pauseReason = shouldPause ? `Only ${matches.length} carriers above score ${minScore} (need ${minCarriers})` : null;

  return { result, shouldPause, pauseReason };
}

async function exec_load_match(run, config) {
  const rules = parseRules(config);
  const stageRules = rules.load_match || {};

  let pairs = [];
  try {
    const loadmatching = require('./loadmatching.cw');
    const pairResult = await loadmatching.find_load_pairs({
      load_id: run.load_id,
      tenant_id: run.tenant_id === 'cw_carriers' ? 'logistics' : run.tenant_id,
    });
    pairs = pairResult?.pairs || [];
  } catch (e) {
    pairs = [];
  }

  const savingsThreshold = stageRules.auto_accept_savings_pct || 10;
  const autoAccepted = pairs.filter(p => (p.savings_pct || 0) >= savingsThreshold);

  const result = {
    total_pairs_found: pairs.length,
    auto_accepted: autoAccepted.length,
    savings_threshold_pct: savingsThreshold,
    pairs: pairs.slice(0, 10),
    matched_at: new Date().toISOString(),
  };

  // Load matching always auto-advances
  return { result, shouldPause: false, pauseReason: null };
}

async function exec_carrier_outreach(run, config) {
  const rules = parseRules(config);
  const stageRules = rules.carrier_outreach || {};
  const carrierData = run.result_carrier_match || {};
  const topCarriers = carrierData.top_matches || [];

  const maxAttempts = stageRules.max_outreach_attempts || 5;
  const outreachList = topCarriers.slice(0, maxAttempts);

  const result = {
    carriers_contacted: outreachList.length,
    outreach_method: stageRules.use_rachel_voice ? 'rachel_voice_ai' : 'email_sms',
    carriers: outreachList.map(c => ({
      carrier_id: c.carrier_id,
      carrier_name: c.carrier_name,
      phone: c.phone,
      email: c.email,
      match_score: c.match_score,
      outreach_status: 'pending',
    })),
    campaign_started_at: new Date().toISOString(),
  };

  // In autopilot, auto-advance (carrier acceptance tracked separately)
  return { result, shouldPause: false, pauseReason: null };
}

async function exec_rate_confirmation(run, config) {
  const rules = parseRules(config);
  const stageRules = rules.rate_confirmation || {};
  const rateData = run.result_rate_analysis || {};
  const contract = run.result_contract_received || {};
  const minMargin = stageRules.pause_if_margin_below_pct || parseFloat(config.min_margin_pct) || 10;

  const suggestedBuy = rateData?.recommendation?.suggested_buy_rate || 0;
  const sellRate = parseFloat(contract.shipper_rate) || rateData?.recommendation?.suggested_sell_rate || 0;
  const margin = sellRate - suggestedBuy;
  const marginPct = sellRate > 0 ? (margin / sellRate) * 100 : 0;

  // Generate rate con number
  const rateConNumber = `RC-${(run.load_ref || run.load_id || Date.now()).toString().replace(/[^A-Z0-9]/gi, '').substring(0, 8)}-${Date.now().toString(36).toUpperCase().slice(-4)}`;

  // Update load status to 'covered' if we have a load_id
  if (run.load_id) {
    await safeQuery('UPDATE lg_loads SET status = $1, updated_at = NOW() WHERE id = $2', ['covered', run.load_id]);
    await safeQuery("UPDATE cw_loads SET status = $1, updated_at = NOW() WHERE id = $2", ['covered', run.load_id]);
  }

  const result = {
    rate_con_number: rateConNumber,
    buy_rate: suggestedBuy,
    sell_rate: sellRate,
    margin: Math.round(margin * 100) / 100,
    margin_pct: Math.round(marginPct * 100) / 100,
    load_status_updated: 'covered',
    confirmed_at: new Date().toISOString(),
  };

  const shouldPause = marginPct < minMargin;
  const pauseReason = shouldPause ? `Margin ${marginPct.toFixed(1)}% is below threshold ${minMargin}%` : null;

  return { result, shouldPause, pauseReason };
}

async function exec_transit_tracking(run, config) {
  const rules = parseRules(config);
  const stageRules = rules.transit_tracking || {};
  const intervalHours = stageRules.check_call_interval_hours || 4;

  // Create check call schedule entries
  const scheduledCalls = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const callTime = new Date(now.getTime() + i * intervalHours * 3600000);
    scheduledCalls.push({
      scheduled_at: callTime.toISOString(),
      call_number: i + 1,
      status: i === 0 ? 'pending' : 'scheduled',
    });
  }

  // Insert first check call into cw_check_calls if table exists
  if (run.load_id) {
    await safeQuery(
      `INSERT INTO cw_check_calls (load_id, call_type, status, scheduled_at, notes, created_at, updated_at)
       VALUES ($1, 'check_call', 'scheduled', NOW() + INTERVAL '${intervalHours} hours', 'Autopilot check call #1', NOW(), NOW())`,
      [run.load_id]
    );
  }

  const result = {
    check_call_interval_hours: intervalHours,
    scheduled_calls: scheduledCalls,
    tracking_started_at: new Date().toISOString(),
  };

  // Auto-advance (delivery confirmation comes externally)
  return { result, shouldPause: false, pauseReason: null };
}

async function exec_delivery_billing(run, config) {
  const rules = parseRules(config);
  const stageRules = rules.delivery_billing || {};
  const rateCon = run.result_rate_confirmation || {};

  const sellRate = rateCon.sell_rate || 0;
  const buyRate = rateCon.buy_rate || 0;
  const margin = sellRate - buyRate;
  const marginPct = sellRate > 0 ? (margin / sellRate) * 100 : 0;

  const invNumber = `INV-${(run.load_ref || run.load_id || 'AUTO')}-S`;
  const payNumber = `PAY-${(run.load_ref || run.load_id || 'AUTO')}-C`;

  // Create invoices if load_id exists
  let shipperInvoice = null;
  let carrierPayment = null;

  if (run.load_id && stageRules.auto_invoice !== false) {
    // Shipper invoice
    const existingInv = await safeQuery(
      "SELECT id FROM cw_invoices WHERE load_id = $1 AND invoice_type = 'shipper'", [run.load_id]
    );
    if (!existingInv.length && sellRate > 0) {
      const invRows = await safeQuery(
        `INSERT INTO cw_invoices (load_id, invoice_type, invoice_number, amount, status, due_date, notes, created_at, updated_at)
         VALUES ($1, 'shipper', $2, $3, 'draft', (CURRENT_DATE + INTERVAL '30 days')::date, 'Auto-generated by Autopilot', NOW(), NOW()) RETURNING *`,
        [run.load_id, invNumber, sellRate]
      );
      shipperInvoice = invRows[0] || null;
    }

    // Carrier payment
    const existingPay = await safeQuery(
      "SELECT id FROM cw_invoices WHERE load_id = $1 AND invoice_type = 'carrier'", [run.load_id]
    );
    if (!existingPay.length && buyRate > 0) {
      const payRows = await safeQuery(
        `INSERT INTO cw_invoices (load_id, invoice_type, invoice_number, amount, status, due_date, notes, created_at, updated_at)
         VALUES ($1, 'carrier', $2, $3, 'draft', (CURRENT_DATE + INTERVAL '30 days')::date, 'Auto-generated by Autopilot', NOW(), NOW()) RETURNING *`,
        [run.load_id, payNumber, buyRate]
      );
      carrierPayment = payRows[0] || null;
    }

    // Update load status to delivered/invoiced
    await safeQuery("UPDATE lg_loads SET status = 'invoiced', updated_at = NOW() WHERE id = $1", [run.load_id]);
    await safeQuery("UPDATE cw_loads SET status = 'invoiced', updated_at = NOW() WHERE id = $1", [run.load_id]);
  }

  const result = {
    shipper_invoice: shipperInvoice ? { number: invNumber, amount: sellRate } : null,
    carrier_payment: carrierPayment ? { number: payNumber, amount: buyRate } : null,
    final_pnl: {
      revenue: sellRate,
      cost: buyRate,
      gross_profit: Math.round(margin * 100) / 100,
      margin_pct: Math.round(marginPct * 100) / 100,
    },
    billed_at: new Date().toISOString(),
  };

  return { result, shouldPause: false, pauseReason: null };
}

const STAGE_EXECUTORS = {
  contract_received: exec_contract_received,
  rate_analysis: exec_rate_analysis,
  carrier_match: exec_carrier_match,
  load_match: exec_load_match,
  carrier_outreach: exec_carrier_outreach,
  rate_confirmation: exec_rate_confirmation,
  transit_tracking: exec_transit_tracking,
  delivery_billing: exec_delivery_billing,
};

// ── Core Pipeline Functions ──────────────────────────────────────

async function advanceStage(pipelineRunId) {
  try {
    const run = await getRun(pipelineRunId);
    if (!run) throw new Error('Pipeline run not found');
    if (run.status === 'completed' || run.status === 'cancelled') return run;
    if (run.status === 'paused') return run;

    const config = await getConfig(run.tenant_id);
    const rules = parseRules(config);
    const stage = run.current_stage;
    const executor = STAGE_EXECUTORS[stage];

    if (!executor) throw new Error(`Unknown stage: ${stage}`);

    // Log stage start
    await logEvent(pipelineRunId, run.tenant_id, 'stage_started', stage, {}, run.started_by);

    // Execute
    const { result, shouldPause, pauseReason } = await executor(run, config);

    // Store result and timestamp
    const tsField = `ts_${stage}`;
    const resultField = `result_${stage}`;
    const updates = {
      [tsField]: new Date().toISOString(),
      [resultField]: result,
    };

    // Check if we should pause (only in autopilot mode)
    const stageRules = rules[stage] || {};
    if (shouldPause && run.mode === 'autopilot') {
      updates.status = 'paused';
      updates.paused_at = new Date().toISOString();
      updates.pause_reason = pauseReason;
      await updateRun(pipelineRunId, updates);
      await logEvent(pipelineRunId, run.tenant_id, 'paused', stage, { reason: pauseReason });
      bus.emit('pipeline:paused', { runId: pipelineRunId, stage, reason: pauseReason });
      return await getRun(pipelineRunId);
    }

    // Stage completed
    await logEvent(pipelineRunId, run.tenant_id, 'stage_completed', stage, { result_summary: Object.keys(result) });

    // Check if this was the last stage
    const next = nextStage(stage);
    if (!next) {
      updates.status = 'completed';
      updates.completed_at = new Date().toISOString();
      await updateRun(pipelineRunId, updates);
      bus.emit('pipeline:completed', { runId: pipelineRunId });
      return await getRun(pipelineRunId);
    }

    // Advance to next stage
    updates.current_stage = next;
    await updateRun(pipelineRunId, updates);
    bus.emit('pipeline:stage:completed', { runId: pipelineRunId, stage, next });

    // Auto-advance in autopilot mode
    if (run.mode === 'autopilot' && stageRules.auto_advance !== false) {
      // Use setImmediate to prevent deep recursion
      return new Promise((resolve) => {
        setImmediate(async () => {
          try {
            const updated = await advanceStage(pipelineRunId);
            resolve(updated);
          } catch (e) {
            resolve(await getRun(pipelineRunId));
          }
        });
      });
    }

    return await getRun(pipelineRunId);
  } catch (error) {
    // Log error, mark failed, never crash
    try {
      const run = await getRun(pipelineRunId);
      if (run) {
        const errorLog = appendError(run.error_log, error.message);
        await updateRun(pipelineRunId, { status: 'failed', error_log: errorLog });
        await logEvent(pipelineRunId, run.tenant_id, 'stage_failed', run.current_stage, { error: error.message });
        bus.emit('pipeline:failed', { runId: pipelineRunId, error: error.message });
      }
    } catch (e) { console.error('[Pipeline] Critical error:', e.message); }
    return await getRun(pipelineRunId);
  }
}

async function startPipeline(loadId, mode, tenantId, startedBy) {
  const tid = tenantId || 'cw_carriers';
  const m = mode || 'autopilot';

  // Get load ref
  let loadRef = null;
  if (loadId) {
    const lgRows = await safeQuery('SELECT load_ref FROM lg_loads WHERE id = $1', [loadId]);
    if (lgRows.length) loadRef = lgRows[0].load_ref;
    else {
      const cwRows = await safeQuery('SELECT load_ref FROM cw_loads WHERE id = $1', [loadId]);
      if (cwRows.length) loadRef = cwRows[0].load_ref;
    }
  }

  const [[run]] = await sequelize.query(
    `INSERT INTO cw_pipeline_runs (tenant_id, load_id, load_ref, mode, status, current_stage, started_by, started_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'running', 'contract_received', $5, NOW(), NOW(), NOW()) RETURNING *`,
    { bind: [tid, loadId || null, loadRef, m, startedBy || 'system'] }
  );

  await logEvent(run.id, tid, 'stage_started', 'contract_received', { load_id: loadId, mode: m }, startedBy);

  // Kick off stage 1
  const result = await advanceStage(run.id);
  return result;
}

async function resumePipeline(pipelineRunId) {
  const run = await getRun(pipelineRunId);
  if (!run) throw new Error('Pipeline run not found');
  if (run.status !== 'paused') throw new Error('Pipeline is not paused');

  await updateRun(pipelineRunId, { status: 'running', paused_at: null, pause_reason: null });
  await logEvent(pipelineRunId, run.tenant_id, 'resumed', run.current_stage, {});

  // Advance to next stage from current
  const next = nextStage(run.current_stage);
  if (next) {
    await updateRun(pipelineRunId, { current_stage: next });
    return await advanceStage(pipelineRunId);
  } else {
    await updateRun(pipelineRunId, { status: 'completed', completed_at: new Date().toISOString() });
    return await getRun(pipelineRunId);
  }
}

async function overrideStage(pipelineRunId, stage, overrideData) {
  const run = await getRun(pipelineRunId);
  if (!run) throw new Error('Pipeline run not found');

  const resultField = `result_${stage}`;
  const tsField = `ts_${stage}`;
  await updateRun(pipelineRunId, {
    [resultField]: overrideData,
    [tsField]: new Date().toISOString(),
    status: 'running',
    paused_at: null,
    pause_reason: null,
  });

  await logEvent(pipelineRunId, run.tenant_id, 'override', stage, overrideData);

  // Advance
  const next = nextStage(stage);
  if (next) {
    await updateRun(pipelineRunId, { current_stage: next });
    if (run.mode === 'autopilot') {
      return await advanceStage(pipelineRunId);
    }
  } else {
    await updateRun(pipelineRunId, { status: 'completed', completed_at: new Date().toISOString() });
  }

  return await getRun(pipelineRunId);
}

async function switchMode(pipelineRunId, mode) {
  const run = await getRun(pipelineRunId);
  if (!run) throw new Error('Pipeline run not found');
  if (!['autopilot', 'manual'].includes(mode)) throw new Error('Mode must be autopilot or manual');

  await updateRun(pipelineRunId, { mode });
  await logEvent(pipelineRunId, run.tenant_id, 'mode_switch', run.current_stage, { from: run.mode, to: mode });

  return await getRun(pipelineRunId);
}

async function cancelPipeline(pipelineRunId) {
  const run = await getRun(pipelineRunId);
  if (!run) throw new Error('Pipeline run not found');

  await updateRun(pipelineRunId, { status: 'cancelled', completed_at: new Date().toISOString() });
  await logEvent(pipelineRunId, run.tenant_id, 'cancelled', run.current_stage, {});

  return await getRun(pipelineRunId);
}

async function pausePipeline(pipelineRunId) {
  const run = await getRun(pipelineRunId);
  if (!run) throw new Error('Pipeline run not found');
  if (run.status !== 'running') throw new Error('Pipeline is not running');

  await updateRun(pipelineRunId, { status: 'paused', paused_at: new Date().toISOString(), pause_reason: 'Manually paused' });
  await logEvent(pipelineRunId, run.tenant_id, 'paused', run.current_stage, { reason: 'Manual pause' });

  return await getRun(pipelineRunId);
}

async function getStats(tenantId) {
  const tid = tenantId || 'cw_carriers';
  const stats = await safeQuery(`
    SELECT status, COUNT(*) as count FROM cw_pipeline_runs
    WHERE tenant_id = $1 GROUP BY status
  `, [tid]);

  const avgTime = await safeQuery(`
    SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds
    FROM cw_pipeline_runs WHERE tenant_id = $1 AND status = 'completed' AND completed_at IS NOT NULL
  `, [tid]);

  const todayCompleted = await safeQuery(`
    SELECT COUNT(*) as count FROM cw_pipeline_runs
    WHERE tenant_id = $1 AND status = 'completed' AND completed_at::date = CURRENT_DATE
  `, [tid]);

  const total = stats.reduce((sum, s) => sum + parseInt(s.count), 0);
  const completed = parseInt(stats.find(s => s.status === 'completed')?.count || 0);
  const running = parseInt(stats.find(s => s.status === 'running')?.count || 0);
  const paused = parseInt(stats.find(s => s.status === 'paused')?.count || 0);
  const failed = parseInt(stats.find(s => s.status === 'failed')?.count || 0);

  return {
    total_runs: total,
    active: running,
    paused,
    completed,
    failed,
    cancelled: parseInt(stats.find(s => s.status === 'cancelled')?.count || 0),
    completed_today: parseInt(todayCompleted[0]?.count || 0),
    avg_completion_seconds: avgTime[0]?.avg_seconds ? Math.round(parseFloat(avgTime[0].avg_seconds)) : null,
    success_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

module.exports = {
  startPipeline,
  advanceStage,
  resumePipeline,
  overrideStage,
  switchMode,
  cancelPipeline,
  pausePipeline,
  getStats,
  getConfig,
  getRun,
  bus,
  STAGES,
};
