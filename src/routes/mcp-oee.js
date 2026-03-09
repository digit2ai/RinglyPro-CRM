// src/routes/mcp-oee.js — MCP OEE (Overall Equipment Effectiveness) Tool Handlers
// Rewired to LOGISTICS models (project_id scoping, machine_name text refs)
'use strict';

const express = require('express');
const router = express.Router();
const { calculateOEE } = require('../utils/oee');

// Import LOGISTICS models (auto-loaded from logistics/models/)
const models = require('../../logistics/models');
const sequelize = models.sequelize;
const OEEMachine = models.LogisticsOEEMachine;
const OEEMachineEvent = models.LogisticsOEEMachineEvent;
const OEEProductionRun = models.LogisticsOEEProductionRun;

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
        machine_name: { type: 'string', description: 'Optional. If omitted, returns all machines.' },
        project_id: { type: 'integer', description: 'Required for LOGISTICS project scoping.' }
      },
      required: ['project_id']
    }
  },
  {
    name: 'get_oee_report',
    description: 'Returns full OEE breakdown — Availability, Performance, Quality, and OEE score — for a machine on a given shift date.',
    input_schema: {
      type: 'object',
      properties: {
        machine_name: { type: 'string' },
        shift_date: { type: 'string', description: 'ISO date string e.g. 2025-03-05. Defaults to today.' },
        project_id: { type: 'integer' }
      },
      required: ['machine_name', 'project_id']
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
        machine_name: { type: 'string', description: 'Optional. Omit for floor-wide summary.' },
        project_id: { type: 'integer' }
      },
      required: ['project_id']
    }
  },
  {
    name: 'log_machine_event',
    description: 'Logs a machine status change event — running, stopped, idle, or fault — with an optional reason code.',
    input_schema: {
      type: 'object',
      properties: {
        machine_name: { type: 'string' },
        status: { type: 'string', enum: ['running', 'stopped', 'idle', 'fault'] },
        reason: { type: 'string', description: 'Optional downtime reason or fault code.' },
        project_id: { type: 'integer' }
      },
      required: ['machine_name', 'status', 'project_id']
    }
  },
  {
    name: 'get_floor_summary',
    description: 'Returns a live snapshot of the entire shop floor: how many machines are running vs stopped, and the rolling OEE for the current shift.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer' }
      },
      required: ['project_id']
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
 * get_machine_status — Latest status per machine using LATERAL join
 */
async function handleGetMachineStatus({ project_id, machine_name }) {
  let query = `
    SELECT m.id, m.name, m.line, m.is_active,
           me.status, me.reason, me.recorded_at
    FROM logistics_oee_machines m
    LEFT JOIN LATERAL (
      SELECT status, reason, recorded_at
      FROM logistics_oee_machine_events
      WHERE machine_name = m.name AND project_id = m.project_id
      ORDER BY recorded_at DESC
      LIMIT 1
    ) me ON true
    WHERE m.project_id = :project_id
  `;
  const replacements = { project_id };

  if (machine_name) {
    query += ' AND m.name = :machine_name';
    replacements.machine_name = machine_name;
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
async function handleGetOEEReport({ project_id, machine_name, shift_date }) {
  const date = shift_date || new Date().toISOString().slice(0, 10);

  // Verify machine exists for this project
  const machine = await OEEMachine.findOne({
    where: { project_id, name: machine_name }
  });
  if (!machine) {
    return { error: 'Machine not found for this project' };
  }

  // Get production run for this date
  const [runs] = await sequelize.query(`
    SELECT * FROM logistics_oee_production_runs
    WHERE project_id = :project_id
      AND machine_name = :machine_name
      AND shift_start::date = :date
    ORDER BY shift_start DESC
    LIMIT 1
  `, { replacements: { project_id, machine_name, date } });

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
      FROM logistics_oee_machine_events
      WHERE project_id = :project_id
        AND machine_name = :machine_name
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
      project_id,
      machine_name,
      shift_start: run.shift_start,
      shift_end: run.shift_end
    }
  });

  const downtime = parseFloat(downtimeResult[0]?.downtime_min || 0);

  const oee = calculateOEE({
    plannedTime: run.planned_production_time_min,
    downtime,
    idealCycleTimeSec: machine.expected_cycle_time_sec,
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
    ideal_cycle_time_sec: machine.expected_cycle_time_sec,
    ...oee
  };
}

/**
 * get_downtime_summary — Ranked downtime reasons
 */
async function handleGetDowntimeSummary({ project_id, machine_name, from, to }) {
  const fromDate = from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const toDate = to || new Date().toISOString();

  let query = `
    WITH events_ordered AS (
      SELECT me.machine_name, me.status, me.reason, me.recorded_at,
             LEAD(me.recorded_at) OVER (PARTITION BY me.machine_name ORDER BY me.recorded_at) AS next_at
      FROM logistics_oee_machine_events me
      WHERE me.project_id = :project_id
        AND me.recorded_at >= :from_date
        AND me.recorded_at <= :to_date
  `;
  const replacements = { project_id, from_date: fromDate, to_date: toDate };

  if (machine_name) {
    query += ' AND me.machine_name = :machine_name';
    replacements.machine_name = machine_name;
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
    machine_name: machine_name || 'all',
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
async function handleLogMachineEvent({ project_id, machine_name, status, reason }) {
  // Verify machine exists for this project
  const machine = await OEEMachine.findOne({
    where: { project_id, name: machine_name }
  });
  if (!machine) {
    return { error: 'Machine not found for this project' };
  }

  const event = await OEEMachineEvent.create({
    project_id,
    machine_name,
    status,
    reason: reason || null,
    recorded_at: new Date()
  });

  if (status === 'fault') {
    console.warn(`[OEE ALERT] FAULT on machine ${machine_name} (project ${project_id}): ${reason || 'No reason provided'}`);
  }

  return {
    id: event.id,
    project_id,
    machine_name,
    status,
    reason,
    recorded_at: event.recorded_at
  };
}

/**
 * get_floor_summary — Live shop floor snapshot
 */
async function handleGetFloorSummary({ project_id }) {
  // Count machines by current status
  const [statusCounts] = await sequelize.query(`
    WITH latest_events AS (
      SELECT DISTINCT ON (m.name) m.name, me.status
      FROM logistics_oee_machines m
      LEFT JOIN logistics_oee_machine_events me
        ON me.machine_name = m.name AND me.project_id = m.project_id
      WHERE m.project_id = :project_id AND m.is_active = true
      ORDER BY m.name, me.recorded_at DESC
    )
    SELECT
      COALESCE(status, 'unknown') AS status,
      COUNT(*) AS count
    FROM latest_events
    GROUP BY status
  `, { replacements: { project_id } });

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
      pr.machine_name,
      m.expected_cycle_time_sec,
      pr.planned_production_time_min,
      pr.total_parts,
      pr.good_parts
    FROM logistics_oee_production_runs pr
    JOIN logistics_oee_machines m
      ON m.name = pr.machine_name AND m.project_id = pr.project_id
    WHERE m.project_id = :project_id
      AND m.is_active = true
      AND pr.shift_start::date = :today
  `, { replacements: { project_id, today } });

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

// GET /machines — List machines for a project
router.get('/machines', async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ success: false, error: 'project_id required' });

    const machines = await OEEMachine.findAll({
      where: { project_id },
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
    const { project_id, name, line, expected_cycle_time_sec } = req.body;
    if (!project_id || !name) {
      return res.status(400).json({ success: false, error: 'project_id and name required' });
    }

    const machine = await OEEMachine.create({
      project_id,
      name,
      line: line || null,
      expected_cycle_time_sec: expected_cycle_time_sec || 30
    });
    res.status(201).json({ success: true, data: machine });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /production-runs — Record a production run
router.post('/production-runs', async (req, res) => {
  try {
    const { project_id, machine_name, shift_start, shift_end, planned_production_time_min, total_parts, good_parts, actual_cycle_time_sec } = req.body;
    if (!project_id || !machine_name || !shift_start || !planned_production_time_min) {
      return res.status(400).json({ success: false, error: 'project_id, machine_name, shift_start, and planned_production_time_min required' });
    }

    const run = await OEEProductionRun.create({
      project_id,
      machine_name,
      shift_start,
      shift_end: shift_end || null,
      planned_production_time_min,
      total_parts: total_parts || 0,
      good_parts: good_parts || 0,
      actual_cycle_time_sec: actual_cycle_time_sec || null
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
    const { machine_name, status, reason, project_id, api_key } = req.body;

    // Validate webhook API key
    const expectedKey = process.env.WEBHOOK_API_KEY || process.env.OEE_WEBHOOK_KEY;
    if (expectedKey && api_key !== expectedKey) {
      return res.status(401).json({ success: false, error: 'Invalid api_key' });
    }

    if (!machine_name || !status || !project_id) {
      return res.status(400).json({ success: false, error: 'machine_name, status, and project_id required' });
    }

    const validStatuses = ['running', 'stopped', 'idle', 'fault'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    // Verify machine exists for this project
    const machine = await OEEMachine.findOne({
      where: { project_id, name: machine_name }
    });
    if (!machine) {
      return res.status(404).json({ success: false, error: 'Machine not found for this project' });
    }

    const event = await OEEMachineEvent.create({
      project_id,
      machine_name,
      status,
      reason: reason || null,
      recorded_at: new Date()
    });

    if (status === 'fault') {
      console.warn(`[OEE WEBHOOK ALERT] FAULT on ${machine_name} (project ${project_id}): ${reason || 'No reason'}`);
    }

    res.json({
      success: true,
      recorded_at: event.recorded_at
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
    const project_id = parseInt(req.body.project_id) || 1;

    // Clear existing demo data for this project
    await sequelize.query(`
      DELETE FROM logistics_oee_machine_events WHERE project_id = :project_id;
      DELETE FROM logistics_oee_production_runs WHERE project_id = :project_id;
      DELETE FROM logistics_oee_machines WHERE project_id = :project_id;
    `, { replacements: { project_id } });

    // Create 6 realistic machines
    const machineData = [
      { name: 'CNC-Lathe-01', line: 'Line A', expected_cycle_time_sec: 45 },
      { name: 'CNC-Mill-02', line: 'Line A', expected_cycle_time_sec: 60 },
      { name: 'Injection-Mold-03', line: 'Line B', expected_cycle_time_sec: 30 },
      { name: 'Assembly-Robot-04', line: 'Line B', expected_cycle_time_sec: 20 },
      { name: 'Packaging-05', line: 'Line C', expected_cycle_time_sec: 15 },
      { name: 'Quality-Station-06', line: 'Line C', expected_cycle_time_sec: 25 }
    ];

    const machines = [];
    for (const m of machineData) {
      const machine = await OEEMachine.create({
        project_id,
        name: m.name,
        line: m.line,
        expected_cycle_time_sec: m.expected_cycle_time_sec
      });
      machines.push(machine);
    }

    const now = new Date();
    const shiftStart = new Date(now);
    shiftStart.setHours(6, 0, 0, 0);
    const shiftEnd = new Date(now);
    shiftEnd.setHours(14, 0, 0, 0);

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
      const cycleTimeSec = machineData[i].expected_cycle_time_sec;

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
          project_id,
          machine_name: machine.name,
          status,
          reason,
          recorded_at: new Date(t)
        });

        // Advance 10-30 min
        t = new Date(t.getTime() + (10 + Math.random() * 20) * 60 * 1000);
      }

      // Ensure the latest event matches our designed current status
      eventRows.push({
        project_id,
        machine_name: machine.name,
        status: currentStatuses[i],
        reason: currentStatuses[i] === 'stopped' ? 'Material changeover' : null,
        recorded_at: new Date(now.getTime() - 60000) // 1 min ago
      });

      // Create production run for today
      const plannedMin = (Math.min(now.getTime(), shiftEnd.getTime()) - shiftStart.getTime()) / 60000;
      const partsPerMin = 60 / cycleTimeSec;
      const maxParts = Math.floor(partsPerMin * plannedMin * (0.7 + Math.random() * 0.25));
      const goodParts = Math.floor(maxParts * (0.92 + Math.random() * 0.07));

      await OEEProductionRun.create({
        project_id,
        machine_name: machine.name,
        shift_start: shiftStart,
        shift_end: now > shiftEnd ? shiftEnd : null,
        planned_production_time_min: Math.round(plannedMin),
        total_parts: maxParts,
        good_parts: goodParts,
        actual_cycle_time_sec: cycleTimeSec * (0.95 + Math.random() * 0.15)
      });
    }

    // Bulk insert events in chunks
    const chunkSize = 500;
    for (let j = 0; j < eventRows.length; j += chunkSize) {
      await OEEMachineEvent.bulkCreate(eventRows.slice(j, j + chunkSize));
    }

    res.json({
      success: true,
      message: `Demo data seeded for project ${project_id}`,
      machines_created: machines.length,
      events_created: eventRows.length,
      production_runs_created: machines.length,
      project_id
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
    module: 'OEE Tracking (LOGISTICS)',
    tools: OEE_TOOLS.length,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
