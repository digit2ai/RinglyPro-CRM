// src/routes/mcp-oee.js — MCP OEE (Overall Equipment Effectiveness) Tool Handlers
// 5 MCP tools + inbound webhook for machine events
'use strict';

const express = require('express');
const router = express.Router();
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');
const { calculateOEE } = require('../utils/oee');

// Import models
const Machine = require('../models/Machine');
const MachineEvent = require('../models/MachineEvent');
const ProductionRun = require('../models/ProductionRun');

// ============================================================================
// MCP TOOL DEFINITIONS
// ============================================================================

const OEE_TOOLS = [
  {
    name: 'get_machine_status',
    description: 'Returns the current live status (running/stopped/idle/fault) of one or all machines on the shop floor.',
    input_schema: {
      type: 'object',
      properties: {
        machine_id: { type: 'integer', description: 'Optional. If omitted, returns all machines.' },
        tenant_id: { type: 'integer', description: 'Required for multi-tenant scoping.' }
      },
      required: ['tenant_id']
    }
  },
  {
    name: 'get_oee_report',
    description: 'Returns full OEE breakdown — Availability, Performance, Quality, and OEE score — for a machine on a given shift date.',
    input_schema: {
      type: 'object',
      properties: {
        machine_id: { type: 'integer' },
        shift_date: { type: 'string', description: 'ISO date string e.g. 2025-03-05. Defaults to today.' },
        tenant_id: { type: 'integer' }
      },
      required: ['machine_id', 'tenant_id']
    }
  },
  {
    name: 'get_downtime_summary',
    description: 'Returns total downtime minutes and top downtime reasons for a machine or the entire floor over a given time range.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'ISO datetime start' },
        to: { type: 'string', description: 'ISO datetime end' },
        machine_id: { type: 'integer', description: 'Optional. Omit for floor-wide summary.' },
        tenant_id: { type: 'integer' }
      },
      required: ['tenant_id']
    }
  },
  {
    name: 'log_machine_event',
    description: 'Logs a machine status change event — running, stopped, idle, or fault — with an optional reason code.',
    input_schema: {
      type: 'object',
      properties: {
        machine_id: { type: 'integer' },
        status: { type: 'string', enum: ['running', 'stopped', 'idle', 'fault'] },
        reason: { type: 'string', description: 'Optional downtime reason or fault code.' },
        tenant_id: { type: 'integer' }
      },
      required: ['machine_id', 'status', 'tenant_id']
    }
  },
  {
    name: 'get_floor_summary',
    description: 'Returns a live snapshot of the entire shop floor: how many machines are running vs stopped, and the rolling OEE for the current shift.',
    input_schema: {
      type: 'object',
      properties: {
        tenant_id: { type: 'integer' }
      },
      required: ['tenant_id']
    }
  }
];

// ============================================================================
// GET /tools/list — Return OEE tool definitions
// ============================================================================
router.get('/tools/list', (req, res) => {
  res.json({ success: true, tools: OEE_TOOLS });
});

// ============================================================================
// POST /tools/call — Execute an OEE MCP tool
// ============================================================================
router.post('/tools/call', async (req, res) => {
  const { name, input } = req.body;

  if (!name || !input) {
    return res.status(400).json({ success: false, error: 'name and input are required' });
  }

  try {
    let result;

    switch (name) {
      case 'get_machine_status':
        result = await handleGetMachineStatus(input);
        break;
      case 'get_oee_report':
        result = await handleGetOEEReport(input);
        break;
      case 'get_downtime_summary':
        result = await handleGetDowntimeSummary(input);
        break;
      case 'log_machine_event':
        result = await handleLogMachineEvent(input);
        break;
      case 'get_floor_summary':
        result = await handleGetFloorSummary(input);
        break;
      default:
        return res.status(400).json({ success: false, error: `Unknown tool: ${name}` });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error(`OEE MCP tool error [${name}]:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TOOL HANDLERS
// ============================================================================

/**
 * get_machine_status — Latest status per machine using DISTINCT ON
 */
async function handleGetMachineStatus({ tenant_id, machine_id }) {
  let query = `
    SELECT m.id, m.name, m.line, m.is_active,
           me.status, me.reason, me.recorded_at
    FROM machines m
    LEFT JOIN LATERAL (
      SELECT status, reason, recorded_at
      FROM machine_events
      WHERE machine_id = m.id
      ORDER BY recorded_at DESC
      LIMIT 1
    ) me ON true
    WHERE m.tenant_id = :tenant_id
  `;
  const replacements = { tenant_id };

  if (machine_id) {
    query += ' AND m.id = :machine_id';
    replacements.machine_id = machine_id;
  }

  query += ' ORDER BY m.name';

  const [rows] = await sequelize.query(query, { replacements });

  return {
    machines: rows.map(r => ({
      id: r.id,
      name: r.name,
      line: r.line,
      is_active: r.is_active,
      current_status: r.status || 'unknown',
      reason: r.reason,
      last_event_at: r.recorded_at
    }))
  };
}

/**
 * get_oee_report — Full OEE breakdown for a machine on a shift date
 */
async function handleGetOEEReport({ tenant_id, machine_id, shift_date }) {
  const date = shift_date || new Date().toISOString().slice(0, 10);

  // Verify machine belongs to tenant
  const machine = await Machine.findOne({
    where: { id: machine_id, tenantId: tenant_id }
  });
  if (!machine) {
    return { error: 'Machine not found for this tenant' };
  }

  // Get production run for this date
  const [runs] = await sequelize.query(`
    SELECT * FROM production_runs
    WHERE machine_id = :machine_id
      AND shift_start::date = :date
    ORDER BY shift_start DESC
    LIMIT 1
  `, { replacements: { machine_id, date } });

  if (runs.length === 0) {
    return {
      machine: { id: machine.id, name: machine.name },
      shift_date: date,
      message: 'No production run found for this date',
      oee: null
    };
  }

  const run = runs[0];

  // Calculate downtime from stopped events during the shift
  const [downtimeResult] = await sequelize.query(`
    WITH events_ordered AS (
      SELECT status, recorded_at,
             LEAD(recorded_at) OVER (ORDER BY recorded_at) AS next_at
      FROM machine_events
      WHERE machine_id = :machine_id
        AND recorded_at >= :shift_start
        AND recorded_at <= COALESCE(:shift_end, NOW())
      ORDER BY recorded_at
    )
    SELECT COALESCE(SUM(
      EXTRACT(EPOCH FROM (COALESCE(next_at, COALESCE(:shift_end, NOW())) - recorded_at)) / 60
    ), 0) AS downtime_min
    FROM events_ordered
    WHERE status = 'stopped'
  `, {
    replacements: {
      machine_id,
      shift_start: run.shift_start,
      shift_end: run.shift_end
    }
  });

  const downtime = parseFloat(downtimeResult[0]?.downtime_min || 0);

  const oee = calculateOEE({
    plannedTime: run.planned_production_time_min,
    downtime,
    idealCycleTimeSec: machine.expectedCycleTimeSec,
    totalParts: run.total_parts,
    goodParts: run.good_parts
  });

  return {
    machine: { id: machine.id, name: machine.name, line: machine.line },
    shift_date: date,
    shift_start: run.shift_start,
    shift_end: run.shift_end,
    planned_time_min: run.planned_production_time_min,
    total_parts: run.total_parts,
    good_parts: run.good_parts,
    reject_parts: run.total_parts - run.good_parts,
    ideal_cycle_time_sec: machine.expectedCycleTimeSec,
    ...oee
  };
}

/**
 * get_downtime_summary — Ranked downtime reasons
 */
async function handleGetDowntimeSummary({ tenant_id, machine_id, from, to }) {
  const fromDate = from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  let query = `
    WITH events_ordered AS (
      SELECT me.machine_id, me.status, me.reason, me.recorded_at,
             LEAD(me.recorded_at) OVER (PARTITION BY me.machine_id ORDER BY me.recorded_at) AS next_at
      FROM machine_events me
      JOIN machines m ON m.id = me.machine_id
      WHERE m.tenant_id = :tenant_id
        AND me.recorded_at >= :from_date
        AND me.recorded_at <= :to_date
  `;
  const replacements = { tenant_id, from_date: fromDate, to_date: toDate };

  if (machine_id) {
    query += ' AND me.machine_id = :machine_id';
    replacements.machine_id = machine_id;
  }

  query += `
      ORDER BY me.recorded_at
    )
    SELECT
      COALESCE(reason, 'Unspecified') AS reason,
      COUNT(*) AS occurrences,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (COALESCE(next_at, :to_date::timestamptz) - recorded_at)) / 60
      )::numeric, 1) AS total_minutes
    FROM events_ordered
    WHERE status = 'stopped'
    GROUP BY reason
    ORDER BY total_minutes DESC
    LIMIT 20
  `;

  const [rows] = await sequelize.query(query, { replacements });

  const grandTotal = rows.reduce((sum, r) => sum + parseFloat(r.total_minutes || 0), 0);

  return {
    period: { from: fromDate, to: toDate },
    machine_id: machine_id || 'all',
    grand_total_downtime_min: +grandTotal.toFixed(1),
    reasons: rows.map(r => ({
      reason: r.reason,
      occurrences: parseInt(r.occurrences),
      total_minutes: parseFloat(r.total_minutes)
    }))
  };
}

/**
 * log_machine_event — Insert a status change event
 */
async function handleLogMachineEvent({ tenant_id, machine_id, status, reason }) {
  // Verify machine belongs to tenant
  const machine = await Machine.findOne({
    where: { id: machine_id, tenantId: tenant_id }
  });
  if (!machine) {
    return { error: 'Machine not found for this tenant' };
  }

  const event = await MachineEvent.create({
    machineId: machine_id,
    status,
    reason: reason || null,
    recordedAt: new Date()
  });

  if (status === 'fault') {
    console.warn(`[OEE ALERT] FAULT on machine ${machine.name} (ID: ${machine_id}): ${reason || 'No reason provided'}`);
  }

  return {
    id: event.id,
    machine_id,
    machine_name: machine.name,
    status,
    reason,
    recorded_at: event.recordedAt
  };
}

/**
 * get_floor_summary — Live shop floor snapshot
 */
async function handleGetFloorSummary({ tenant_id }) {
  // Count machines by current status
  const [statusCounts] = await sequelize.query(`
    WITH latest_events AS (
      SELECT DISTINCT ON (m.id) m.id, me.status
      FROM machines m
      LEFT JOIN machine_events me ON me.machine_id = m.id
      WHERE m.tenant_id = :tenant_id AND m.is_active = true
      ORDER BY m.id, me.recorded_at DESC
    )
    SELECT
      COALESCE(status, 'unknown') AS status,
      COUNT(*) AS count
    FROM latest_events
    GROUP BY status
  `, { replacements: { tenant_id } });

  const counts = { running: 0, stopped: 0, idle: 0, fault: 0, unknown: 0 };
  let totalMachines = 0;
  for (const row of statusCounts) {
    counts[row.status] = parseInt(row.count);
    totalMachines += parseInt(row.count);
  }

  // Aggregate OEE for today's shift across all active machines
  const today = new Date().toISOString().slice(0, 10);
  const [oeeRows] = await sequelize.query(`
    SELECT
      pr.machine_id,
      m.expected_cycle_time_sec,
      pr.planned_production_time_min,
      pr.total_parts,
      pr.good_parts
    FROM production_runs pr
    JOIN machines m ON m.id = pr.machine_id
    WHERE m.tenant_id = :tenant_id
      AND m.is_active = true
      AND pr.shift_start::date = :today
  `, { replacements: { tenant_id, today } });

  let floorOEE = null;
  if (oeeRows.length > 0) {
    let totalOEE = 0;
    for (const row of oeeRows) {
      const result = calculateOEE({
        plannedTime: row.planned_production_time_min,
        downtime: 0, // Simplified — per-machine downtime calc would be expensive here
        idealCycleTimeSec: row.expected_cycle_time_sec,
        totalParts: row.total_parts,
        goodParts: row.good_parts
      });
      totalOEE += result.oee;
    }
    floorOEE = +(totalOEE / oeeRows.length).toFixed(1);
  }

  return {
    running: counts.running,
    stopped: counts.stopped,
    idle: counts.idle,
    fault: counts.fault,
    unknown: counts.unknown,
    totalMachines,
    floorOEE,
    shift_date: today
  };
}

// ============================================================================
// REST API ENDPOINTS (direct CRUD — no MCP wrapper needed)
// ============================================================================

// GET /machines — List machines for a tenant
router.get('/machines', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ success: false, error: 'tenant_id required' });

    const machines = await Machine.findAll({
      where: { tenantId: tenant_id },
      order: [['name', 'ASC']]
    });
    res.json({ success: true, data: machines });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /machines — Register a new machine
router.post('/machines', async (req, res) => {
  try {
    const { tenant_id, name, line, expected_cycle_time_sec } = req.body;
    if (!tenant_id || !name) {
      return res.status(400).json({ success: false, error: 'tenant_id and name required' });
    }

    const machine = await Machine.create({
      tenantId: tenant_id,
      name,
      line: line || null,
      expectedCycleTimeSec: expected_cycle_time_sec || 30
    });
    res.status(201).json({ success: true, data: machine });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /production-runs — Record a production run
router.post('/production-runs', async (req, res) => {
  try {
    const { machine_id, shift_start, shift_end, planned_production_time_min, total_parts, good_parts, actual_cycle_time_sec } = req.body;
    if (!machine_id || !shift_start || !planned_production_time_min) {
      return res.status(400).json({ success: false, error: 'machine_id, shift_start, and planned_production_time_min required' });
    }

    const run = await ProductionRun.create({
      machineId: machine_id,
      shiftStart: shift_start,
      shiftEnd: shift_end || null,
      plannedProductionTimeMin: planned_production_time_min,
      totalParts: total_parts || 0,
      goodParts: good_parts || 0,
      actualCycleTimeSec: actual_cycle_time_sec || null
    });
    res.status(201).json({ success: true, data: run });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// POST /webhooks/machine-event — Inbound webhook for PLC / n8n
// ============================================================================
router.post('/webhooks/machine-event', async (req, res) => {
  try {
    const { machine_id, status, reason, tenant_id, api_key } = req.body;

    // Validate webhook API key
    const expectedKey = process.env.WEBHOOK_API_KEY || process.env.OEE_WEBHOOK_KEY;
    if (expectedKey && api_key !== expectedKey) {
      return res.status(401).json({ success: false, error: 'Invalid api_key' });
    }

    if (!machine_id || !status || !tenant_id) {
      return res.status(400).json({ success: false, error: 'machine_id, status, and tenant_id required' });
    }

    const validStatuses = ['running', 'stopped', 'idle', 'fault'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    // Verify machine belongs to tenant
    const machine = await Machine.findOne({
      where: { id: machine_id, tenantId: tenant_id }
    });
    if (!machine) {
      return res.status(404).json({ success: false, error: 'Machine not found for this tenant' });
    }

    const event = await MachineEvent.create({
      machineId: machine_id,
      status,
      reason: reason || null,
      recordedAt: new Date()
    });

    if (status === 'fault') {
      console.warn(`[OEE WEBHOOK ALERT] FAULT on ${machine.name} (ID: ${machine_id}): ${reason || 'No reason'}`);
    }

    res.json({
      success: true,
      recorded_at: event.recordedAt
    });
  } catch (error) {
    console.error('OEE webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// POST /demo-seed — Generate realistic demo data for client demos
// ============================================================================
router.post('/demo-seed', async (req, res) => {
  try {
    const tenant_id = parseInt(req.body.tenant_id) || 1;

    // Clear existing demo data for this tenant
    await sequelize.query(`
      DELETE FROM machine_events WHERE machine_id IN (SELECT id FROM machines WHERE tenant_id = :tenant_id);
      DELETE FROM production_runs WHERE machine_id IN (SELECT id FROM machines WHERE tenant_id = :tenant_id);
      DELETE FROM machines WHERE tenant_id = :tenant_id;
    `, { replacements: { tenant_id } });

    // Create 6 realistic machines
    const machineData = [
      { name: 'CNC-Lathe-01', line: 'Line A', expectedCycleTimeSec: 45 },
      { name: 'CNC-Mill-02', line: 'Line A', expectedCycleTimeSec: 60 },
      { name: 'Injection-Mold-03', line: 'Line B', expectedCycleTimeSec: 30 },
      { name: 'Assembly-Robot-04', line: 'Line B', expectedCycleTimeSec: 20 },
      { name: 'Packaging-05', line: 'Line C', expectedCycleTimeSec: 15 },
      { name: 'Quality-Station-06', line: 'Line C', expectedCycleTimeSec: 25 }
    ];

    const machines = [];
    for (const m of machineData) {
      const machine = await Machine.create({
        tenantId: tenant_id,
        name: m.name,
        line: m.line,
        expectedCycleTimeSec: m.expectedCycleTimeSec
      });
      machines.push(machine);
    }

    const now = new Date();
    const shiftStart = new Date(now);
    shiftStart.setHours(6, 0, 0, 0);
    const shiftEnd = new Date(now);
    shiftEnd.setHours(14, 0, 0, 0);

    const statuses = ['running', 'stopped', 'idle', 'fault'];
    const stopReasons = [
      'Material changeover', 'Tool wear replacement', 'Scheduled maintenance',
      'Conveyor jam', 'Sensor calibration', 'Operator break',
      'Raw material shortage', 'Quality hold'
    ];
    const faultReasons = [
      'Spindle overheating', 'Hydraulic pressure drop', 'E-Stop triggered',
      'Motor overload', 'Communication timeout'
    ];

    // Current status profile (for realistic floor summary)
    const currentStatuses = ['running', 'running', 'running', 'stopped', 'running', 'idle'];

    let eventRows = [];

    for (let i = 0; i < machines.length; i++) {
      const machine = machines[i];
      const cycleTimeSec = machineData[i].expectedCycleTimeSec;

      // Generate events every 10-30 minutes during the shift
      let t = new Date(shiftStart);
      while (t < now && t < shiftEnd) {
        const rnd = Math.random();
        let status, reason;
        if (rnd < 0.65) {
          status = 'running'; reason = null;
        } else if (rnd < 0.82) {
          status = 'stopped';
          reason = stopReasons[Math.floor(Math.random() * stopReasons.length)];
        } else if (rnd < 0.93) {
          status = 'idle'; reason = 'Waiting for parts';
        } else {
          status = 'fault';
          reason = faultReasons[Math.floor(Math.random() * faultReasons.length)];
        }

        eventRows.push({
          machineId: machine.id,
          status,
          reason,
          recordedAt: new Date(t)
        });

        // Advance 10-30 min
        t = new Date(t.getTime() + (10 + Math.random() * 20) * 60 * 1000);
      }

      // Ensure the latest event matches our designed current status
      eventRows.push({
        machineId: machine.id,
        status: currentStatuses[i],
        reason: currentStatuses[i] === 'stopped' ? 'Material changeover' : null,
        recordedAt: new Date(now.getTime() - 60000) // 1 min ago
      });

      // Create production run for today
      const plannedMin = (Math.min(now.getTime(), shiftEnd.getTime()) - shiftStart.getTime()) / 60000;
      const partsPerMin = 60 / cycleTimeSec;
      const maxParts = Math.floor(partsPerMin * plannedMin * (0.7 + Math.random() * 0.25));
      const goodParts = Math.floor(maxParts * (0.92 + Math.random() * 0.07));

      await ProductionRun.create({
        machineId: machine.id,
        shiftStart,
        shiftEnd: now > shiftEnd ? shiftEnd : null,
        plannedProductionTimeMin: Math.round(plannedMin),
        totalParts: maxParts,
        goodParts,
        actualCycleTimeSec: cycleTimeSec * (0.95 + Math.random() * 0.15)
      });
    }

    // Bulk insert events in chunks
    const chunkSize = 500;
    for (let j = 0; j < eventRows.length; j += chunkSize) {
      await MachineEvent.bulkCreate(eventRows.slice(j, j + chunkSize));
    }

    res.json({
      success: true,
      message: `Demo data seeded for tenant ${tenant_id}`,
      machines_created: machines.length,
      events_created: eventRows.length,
      production_runs_created: machines.length,
      tenant_id
    });
  } catch (error) {
    console.error('OEE demo seed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    module: 'OEE Tracking',
    tools: OEE_TOOLS.length,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
