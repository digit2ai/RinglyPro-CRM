'use strict';

const express = require('express');
const router = express.Router();

// ============================================================================
// LOGISTICS Telemetry / Observability Endpoints
// Accept equipment telemetry and serve live operational health data.
// Protected by API key auth for ingest; read endpoints are open.
// ============================================================================

let requireApiKey;
try {
  const authModule = require('../middleware/api-auth');
  requireApiKey = authModule.requireApiKey || authModule;
} catch (e) {
  // Fallback if api-auth middleware not available
  requireApiKey = (req, res, next) => next();
}

// Rate limit for telemetry ingest (higher than data ingest — 120/min)
let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (e) {
  rateLimit = () => (req, res, next) => next();
}

const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, error: 'Rate limit exceeded. Max 120 telemetry requests per minute.' }
});

// ============================================================================
// POST /:projectId/events — Ingest telemetry events
// ============================================================================
router.post('/:projectId/events', requireApiKey, telemetryLimiter, async (req, res) => {
  try {
    const project = await req.models.LogisticsProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    // Accept single event or batch
    let events = req.body.events || (req.body.event_type ? [req.body] : []);
    if (!Array.isArray(events)) events = [events];
    if (events.length === 0) {
      return res.status(400).json({ success: false, error: 'No events provided' });
    }
    if (events.length > 1000) {
      return res.status(400).json({ success: false, error: 'Max 1000 events per request' });
    }

    const validTypes = ['equipment_status', 'throughput_snapshot', 'fault', 'kpi_update'];
    const records = [];
    const errors = [];

    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      if (!evt.event_type || !validTypes.includes(evt.event_type)) {
        errors.push({ index: i, error: `Invalid event_type. Must be one of: ${validTypes.join(', ')}` });
        continue;
      }
      if (!evt.source) {
        errors.push({ index: i, error: 'source is required' });
        continue;
      }
      records.push({
        project_id: project.id,
        event_type: evt.event_type,
        source: evt.source,
        event_data: evt.data || evt.event_data || {},
        severity: evt.severity || 'info',
        recorded_at: evt.recorded_at || new Date()
      });
    }

    if (records.length > 0) {
      await req.models.LogisticsTelemetryEvent.bulkCreate(records, { ignoreDuplicates: true });
    }

    res.json({
      success: true,
      data: {
        processed: records.length,
        errors: errors.length,
        error_details: errors.length > 0 ? errors.slice(0, 10) : undefined
      }
    });
  } catch (error) {
    console.error('LOGISTICS telemetry ingest error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /:projectId/health — Live operational health summary
// ============================================================================
router.get('/:projectId/health', async (req, res) => {
  try {
    const project = await req.models.LogisticsProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const seq = req.models.sequelize;
    const projectId = project.id;

    // Latest event per source (equipment status)
    const [latestBySource] = await seq.query(`
      SELECT DISTINCT ON (source) source, event_type, event_data, severity, recorded_at
      FROM logistics_telemetry_events
      WHERE project_id = :projectId
      ORDER BY source, recorded_at DESC
    `, { replacements: { projectId } });

    // Count events by severity in last hour
    const [severityCounts] = await seq.query(`
      SELECT severity, COUNT(*) as count
      FROM logistics_telemetry_events
      WHERE project_id = :projectId AND recorded_at >= NOW() - INTERVAL '1 hour'
      GROUP BY severity
    `, { replacements: { projectId } });

    // Active faults (unresolved)
    const [activeFaults] = await seq.query(`
      SELECT source, event_data, severity, recorded_at
      FROM logistics_telemetry_events
      WHERE project_id = :projectId AND event_type = 'fault' AND recorded_at >= NOW() - INTERVAL '24 hours'
      ORDER BY recorded_at DESC
      LIMIT 20
    `, { replacements: { projectId } });

    // Throughput snapshots in last hour
    const [throughputRecent] = await seq.query(`
      SELECT source, event_data, recorded_at
      FROM logistics_telemetry_events
      WHERE project_id = :projectId AND event_type = 'throughput_snapshot' AND recorded_at >= NOW() - INTERVAL '1 hour'
      ORDER BY recorded_at DESC
      LIMIT 60
    `, { replacements: { projectId } });

    // Total event count
    const totalEvents = await req.models.LogisticsTelemetryEvent.count({
      where: { project_id: projectId }
    });

    // Determine overall health status
    const criticalCount = severityCounts.find(s => s.severity === 'critical')?.count || 0;
    const warningCount = severityCounts.find(s => s.severity === 'warning')?.count || 0;
    let overall_status = 'healthy';
    if (parseInt(criticalCount) > 0) overall_status = 'critical';
    else if (parseInt(warningCount) > 3) overall_status = 'degraded';
    else if (parseInt(warningCount) > 0) overall_status = 'warning';

    res.json({
      success: true,
      data: {
        company_name: project.company_name,
        overall_status,
        total_events: totalEvents,
        last_hour_summary: {
          info: parseInt(severityCounts.find(s => s.severity === 'info')?.count || 0),
          warning: parseInt(warningCount),
          critical: parseInt(criticalCount)
        },
        equipment: latestBySource.map(e => ({
          source: e.source,
          event_type: e.event_type,
          status: e.event_data,
          severity: e.severity,
          last_seen: e.recorded_at
        })),
        active_faults: activeFaults.map(f => ({
          source: f.source,
          details: f.event_data,
          severity: f.severity,
          time: f.recorded_at
        })),
        recent_throughput: throughputRecent.map(t => ({
          source: t.source,
          metrics: t.event_data,
          time: t.recorded_at
        }))
      }
    });
  } catch (error) {
    console.error('LOGISTICS telemetry health error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /:projectId/events — Query telemetry events (with filters)
// ============================================================================
router.get('/:projectId/events', async (req, res) => {
  try {
    const project = await req.models.LogisticsProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const { event_type, source, severity, hours = 24, limit = 100 } = req.query;
    const where = { project_id: project.id };

    if (event_type) where.event_type = event_type;
    if (source) where.source = source;
    if (severity) where.severity = severity;

    const { Op } = req.models.sequelize.constructor;
    where.recorded_at = { [Op.gte]: new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000) };

    const events = await req.models.LogisticsTelemetryEvent.findAll({
      where,
      order: [['recorded_at', 'DESC']],
      limit: Math.min(parseInt(limit), 500)
    });

    res.json({
      success: true,
      data: {
        events: events.map(e => e.toJSON()),
        count: events.length,
        filters: { event_type, source, severity, hours: parseInt(hours) }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// POST /:projectId/demo-seed — Generate realistic demo telemetry data
// ============================================================================
router.post('/:projectId/demo-seed', async (req, res) => {
  try {
    const project = await req.models.LogisticsProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const projectId = project.id;
    const now = Date.now();
    const records = [];

    // Equipment definitions (RinglyPro Logistics warehouse)
    const equipment = [
      { source: 'Shuttle-A1', type: 'RinglyPro Logistics StoreBiter', zone: 'Aisle 1' },
      { source: 'Shuttle-A2', type: 'RinglyPro Logistics StoreBiter', zone: 'Aisle 2' },
      { source: 'Shuttle-B1', type: 'RinglyPro Logistics StoreBiter', zone: 'Aisle 3' },
      { source: 'Conveyor-Main', type: 'RinglyPro Logistics FlexConveyor', zone: 'Inbound' },
      { source: 'Conveyor-Outbound', type: 'RinglyPro Logistics FlexConveyor', zone: 'Outbound' },
      { source: 'Lift-01', type: 'RinglyPro Logistics MultiLevel Lift', zone: 'Aisle 1' },
      { source: 'Lift-02', type: 'RinglyPro Logistics MultiLevel Lift', zone: 'Aisle 2' },
      { source: 'Pick-Station-1', type: 'RinglyPro Logistics Goods-to-Person', zone: 'Pick Area' },
      { source: 'Pick-Station-2', type: 'RinglyPro Logistics Goods-to-Person', zone: 'Pick Area' },
      { source: 'Charging-Bay', type: 'RinglyPro Logistics AutoCharge', zone: 'Maintenance' }
    ];

    const rand = (min, max) => Math.random() * (max - min) + min;
    const randInt = (min, max) => Math.floor(rand(min, max));

    // Generate 1 hour of telemetry (every ~2 minutes per equipment = ~300 events)
    for (let minutesAgo = 60; minutesAgo >= 0; minutesAgo -= 2) {
      const ts = new Date(now - minutesAgo * 60 * 1000);

      for (const eq of equipment) {
        // Equipment status events
        const isRunning = Math.random() > 0.05;
        const temp = rand(28, 52).toFixed(1);
        const utilization = isRunning ? randInt(55, 98) : 0;

        records.push({
          project_id: projectId,
          event_type: 'equipment_status',
          source: eq.source,
          event_data: {
            status: isRunning ? 'running' : 'idle',
            equipment_type: eq.type,
            zone: eq.zone,
            temperature_c: parseFloat(temp),
            utilization_pct: utilization,
            cycles_today: randInt(800, 4500),
            uptime_hours: rand(6, 23.5).toFixed(1)
          },
          severity: parseFloat(temp) > 48 ? 'warning' : 'info',
          recorded_at: ts
        });
      }

      // Throughput snapshots (every 2 min from main zones)
      if (minutesAgo <= 60) {
        records.push({
          project_id: projectId,
          event_type: 'throughput_snapshot',
          source: 'Zone-Inbound',
          event_data: {
            cases_per_hour: randInt(180, 320),
            orders_per_hour: randInt(45, 85),
            picks_per_hour: randInt(250, 500),
            avg_cycle_time_sec: rand(8, 18).toFixed(1)
          },
          severity: 'info',
          recorded_at: ts
        });
        records.push({
          project_id: projectId,
          event_type: 'throughput_snapshot',
          source: 'Zone-Outbound',
          event_data: {
            cases_per_hour: randInt(150, 280),
            orders_per_hour: randInt(40, 75),
            pallets_per_hour: randInt(12, 28),
            avg_cycle_time_sec: rand(10, 22).toFixed(1)
          },
          severity: 'info',
          recorded_at: ts
        });
      }
    }

    // Inject some realistic faults
    const faultScenarios = [
      { source: 'Shuttle-B1', severity: 'warning', data: { fault_code: 'SB-W-042', message: 'Vibration threshold exceeded on drive motor', action: 'Schedule preventive maintenance', vibration_mm_s: 4.8 } },
      { source: 'Conveyor-Main', severity: 'warning', data: { fault_code: 'FC-W-018', message: 'Belt tension below nominal — auto-adjusted', action: 'Monitor next 30 min', tension_pct: 82 } },
      { source: 'Lift-01', severity: 'critical', data: { fault_code: 'ML-C-003', message: 'Emergency stop triggered — obstruction detected Level 3', action: 'Operator intervention required', level: 3 } },
      { source: 'Pick-Station-2', severity: 'warning', data: { fault_code: 'GP-W-011', message: 'Scanner read rate dropped below 98%', action: 'Clean scanner lens', read_rate_pct: 96.2 } },
      { source: 'Shuttle-A1', severity: 'warning', data: { fault_code: 'SB-W-055', message: 'Battery charge below 20% — returning to charge bay', action: 'Auto-routing to Charging-Bay', battery_pct: 18 } }
    ];

    for (let i = 0; i < faultScenarios.length; i++) {
      const f = faultScenarios[i];
      records.push({
        project_id: projectId,
        event_type: 'fault',
        source: f.source,
        event_data: f.data,
        severity: f.severity,
        recorded_at: new Date(now - randInt(5, 50) * 60 * 1000)
      });
    }

    // KPI updates
    const kpiSources = ['System-Overall', 'Zone-Inbound', 'Zone-Outbound'];
    for (const src of kpiSources) {
      records.push({
        project_id: projectId,
        event_type: 'kpi_update',
        source: src,
        event_data: {
          pick_accuracy_pct: rand(98.5, 99.9).toFixed(2),
          order_fill_rate_pct: rand(96, 99.5).toFixed(1),
          avg_order_cycle_min: rand(12, 35).toFixed(1),
          throughput_vs_target_pct: randInt(88, 115),
          labor_productivity_uph: randInt(120, 280)
        },
        severity: 'info',
        recorded_at: new Date(now - randInt(1, 10) * 60 * 1000)
      });
    }

    // Bulk insert in chunks
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      await req.models.LogisticsTelemetryEvent.bulkCreate(chunk, { ignoreDuplicates: true });
      inserted += chunk.length;
    }

    res.json({
      success: true,
      data: {
        events_generated: inserted,
        equipment_count: equipment.length,
        fault_count: faultScenarios.length,
        time_span: '1 hour of simulated telemetry'
      }
    });
  } catch (error) {
    console.error('LOGISTICS demo telemetry seed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
