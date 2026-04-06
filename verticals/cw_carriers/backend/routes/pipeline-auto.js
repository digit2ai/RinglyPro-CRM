/**
 * Autopilot Pipeline API Routes — CW Carriers
 * 13 endpoints for pipeline management, config, and stats
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.cw');
const sequelize = require('../services/db.cw');
const pipeline = require('../services/pipeline.cw');

router.use(auth);

// GET /runs - List pipeline runs
router.get('/runs', async (req, res) => {
  try {
    const { status, stage, load_id, limit = 50, offset = 0 } = req.query;
    let where = "WHERE tenant_id = 'cw_carriers'";
    const binds = [];

    if (status) { binds.push(status); where += ` AND status = $${binds.length}`; }
    if (stage) { binds.push(stage); where += ` AND current_stage = $${binds.length}`; }
    if (load_id) { binds.push(parseInt(load_id)); where += ` AND load_id = $${binds.length}`; }

    binds.push(parseInt(limit));
    binds.push(parseInt(offset));

    const [rows] = await sequelize.query(
      `SELECT * FROM cw_pipeline_runs ${where} ORDER BY created_at DESC LIMIT $${binds.length - 1} OFFSET $${binds.length}`,
      { bind: binds }
    );

    const [[countRow]] = await sequelize.query(
      `SELECT COUNT(*) as total FROM cw_pipeline_runs ${where.replace(` LIMIT $${binds.length - 1} OFFSET $${binds.length}`, '')}`,
      { bind: binds.slice(0, -2) }
    );

    res.json({ success: true, data: rows, total: parseInt(countRow.total) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /runs/:id - Single run with full results
router.get('/runs/:id', async (req, res) => {
  try {
    const run = await pipeline.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Pipeline run not found' });
    res.json({ success: true, data: run });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /runs - Start new pipeline run
router.post('/runs', async (req, res) => {
  try {
    const { load_id, mode } = req.body;
    const run = await pipeline.startPipeline(
      load_id || null,
      mode || 'autopilot',
      'cw_carriers',
      req.user?.email || 'api'
    );
    res.status(201).json({ success: true, data: run });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /runs/:id/pause - Pause running pipeline
router.put('/runs/:id/pause', async (req, res) => {
  try {
    const run = await pipeline.pausePipeline(parseInt(req.params.id));
    res.json({ success: true, data: run });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /runs/:id/resume - Resume paused pipeline
router.put('/runs/:id/resume', async (req, res) => {
  try {
    const run = await pipeline.resumePipeline(parseInt(req.params.id));
    res.json({ success: true, data: run });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /runs/:id/cancel - Cancel pipeline
router.put('/runs/:id/cancel', async (req, res) => {
  try {
    const run = await pipeline.cancelPipeline(parseInt(req.params.id));
    res.json({ success: true, data: run });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /runs/:id/mode - Switch mode
router.put('/runs/:id/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    const run = await pipeline.switchMode(parseInt(req.params.id), mode);
    res.json({ success: true, data: run });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /runs/:id/override - Override stage data
router.put('/runs/:id/override', async (req, res) => {
  try {
    const { stage, data } = req.body;
    if (!stage) return res.status(400).json({ error: 'stage required' });
    const run = await pipeline.overrideStage(parseInt(req.params.id), stage, data || {});
    res.json({ success: true, data: run });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /runs/:id/advance - Manual advance (for manual mode)
router.put('/runs/:id/advance', async (req, res) => {
  try {
    const run = await pipeline.advanceStage(parseInt(req.params.id));
    res.json({ success: true, data: run });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /runs/:id/events - Event log for run
router.get('/runs/:id/events', async (req, res) => {
  try {
    const [events] = await sequelize.query(
      'SELECT * FROM cw_pipeline_events WHERE pipeline_run_id = $1 ORDER BY created_at ASC',
      { bind: [parseInt(req.params.id)] }
    );
    res.json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /config - Get autopilot config
router.get('/config', async (req, res) => {
  try {
    const config = await pipeline.getConfig('cw_carriers');
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /config - Update autopilot config
router.put('/config', async (req, res) => {
  try {
    const { enabled, default_mode, stage_rules, min_margin_pct, target_margin_pct, max_auto_book_amount } = req.body;
    const sets = ['updated_at = NOW()'];
    const binds = [];

    if (enabled !== undefined) { binds.push(enabled); sets.push(`enabled = $${binds.length}`); }
    if (default_mode) { binds.push(default_mode); sets.push(`default_mode = $${binds.length}`); }
    if (stage_rules) { binds.push(JSON.stringify(stage_rules)); sets.push(`stage_rules = $${binds.length}`); }
    if (min_margin_pct !== undefined) { binds.push(min_margin_pct); sets.push(`min_margin_pct = $${binds.length}`); }
    if (target_margin_pct !== undefined) { binds.push(target_margin_pct); sets.push(`target_margin_pct = $${binds.length}`); }
    if (max_auto_book_amount !== undefined) { binds.push(max_auto_book_amount); sets.push(`max_auto_book_amount = $${binds.length}`); }

    const [[config]] = await sequelize.query(
      `UPDATE cw_autopilot_config SET ${sets.join(', ')} WHERE tenant_id = 'cw_carriers' RETURNING *`,
      { bind: binds }
    );

    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats - Pipeline stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await pipeline.getStats('cw_carriers');
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
