'use strict';

const express = require('express');
const router = express.Router();

// ============================================================================
// PINAXIS Telemetry / Observability Endpoints
// Accept equipment telemetry and serve live operational health data.
// Protected by API key auth for ingest; read endpoints are open.
// ============================================================================

let requireApiKey;
try {
  requireApiKey = require('../middleware/api-auth');
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
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
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
      await req.models.PinaxisTelemetryEvent.bulkCreate(records, { ignoreDuplicates: true });
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
    console.error('PINAXIS telemetry ingest error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /:projectId/health — Live operational health summary
// ============================================================================
router.get('/:projectId/health', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const seq = req.models.sequelize;
    const projectId = project.id;

    // Latest event per source (equipment status)
    const [latestBySource] = await seq.query(`
      SELECT DISTINCT ON (source) source, event_type, event_data, severity, recorded_at
      FROM pinaxis_telemetry_events
      WHERE project_id = :projectId
      ORDER BY source, recorded_at DESC
    `, { replacements: { projectId } });

    // Count events by severity in last hour
    const [severityCounts] = await seq.query(`
      SELECT severity, COUNT(*) as count
      FROM pinaxis_telemetry_events
      WHERE project_id = :projectId AND recorded_at >= NOW() - INTERVAL '1 hour'
      GROUP BY severity
    `, { replacements: { projectId } });

    // Active faults (unresolved)
    const [activeFaults] = await seq.query(`
      SELECT source, event_data, severity, recorded_at
      FROM pinaxis_telemetry_events
      WHERE project_id = :projectId AND event_type = 'fault' AND recorded_at >= NOW() - INTERVAL '24 hours'
      ORDER BY recorded_at DESC
      LIMIT 20
    `, { replacements: { projectId } });

    // Throughput snapshots in last hour
    const [throughputRecent] = await seq.query(`
      SELECT source, event_data, recorded_at
      FROM pinaxis_telemetry_events
      WHERE project_id = :projectId AND event_type = 'throughput_snapshot' AND recorded_at >= NOW() - INTERVAL '1 hour'
      ORDER BY recorded_at DESC
      LIMIT 60
    `, { replacements: { projectId } });

    // Total event count
    const totalEvents = await req.models.PinaxisTelemetryEvent.count({
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
    console.error('PINAXIS telemetry health error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /:projectId/events — Query telemetry events (with filters)
// ============================================================================
router.get('/:projectId/events', async (req, res) => {
  try {
    const project = await req.models.PinaxisProject.findByPk(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const { event_type, source, severity, hours = 24, limit = 100 } = req.query;
    const where = { project_id: project.id };

    if (event_type) where.event_type = event_type;
    if (source) where.source = source;
    if (severity) where.severity = severity;

    const { Op } = req.models.sequelize.constructor;
    where.recorded_at = { [Op.gte]: new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000) };

    const events = await req.models.PinaxisTelemetryEvent.findAll({
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

module.exports = router;
