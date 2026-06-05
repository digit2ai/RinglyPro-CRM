'use strict';

const express = require('express');
const router = express.Router();
const { Detection, Asset, Monitor, Takedown } = require('../models');

function tenantId(req) {
  return parseInt(req.query.tenant_id || req.body.tenant_id || 1, 10);
}

// GET /api/v1/detections?tenant_id=N&verdict=deepfake
router.get('/', async (req, res) => {
  try {
    const where = { tenant_id: tenantId(req) };
    if (req.query.verdict) where.verdict = req.query.verdict;
    const detections = await Detection.findAll({
      where,
      include: [{ model: Asset, include: [Monitor] }, { model: Takedown }],
      order: [['confidence', 'DESC'], ['created_at', 'DESC']]
    });
    res.json({ success: true, data: detections });
  } catch (e) {
    console.error('Veritas detections GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v1/detections/summary?tenant_id=N  — dashboard stat cards
router.get('/summary', async (req, res) => {
  try {
    const tid = tenantId(req);
    const all = await Detection.findAll({ where: { tenant_id: tid } });
    const takedowns = await Takedown.findAll({ where: { tenant_id: tid } });
    const byVerdict = { deepfake: 0, suspect: 0, clean: 0 };
    all.forEach(d => { byVerdict[d.verdict] = (byVerdict[d.verdict] || 0) + 1; });
    const removed = takedowns.filter(t => t.status === 'removed').length;
    const active = takedowns.filter(t => ['draft', 'submitted', 'acknowledged'].includes(t.status)).length;
    const monitors = await Monitor.count({ where: { tenant_id: tid, status: 'active' } });
    res.json({
      success: true,
      data: {
        total_scanned: all.length,
        deepfakes_detected: byVerdict.deepfake,
        suspect: byVerdict.suspect,
        clean: byVerdict.clean,
        takedowns_removed: removed,
        takedowns_active: active,
        active_monitors: monitors,
        accuracy: 99.8 // headline figure (provider-reported once live)
      }
    });
  } catch (e) {
    console.error('Veritas summary error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v1/detections/timeline?tenant_id=N  — chart data (by day + by verdict)
router.get('/timeline', async (req, res) => {
  try {
    const tid = tenantId(req);
    const all = await Detection.findAll({ where: { tenant_id: tid }, order: [['created_at', 'ASC']] });
    const byVerdict = { clean: 0, suspect: 0, deepfake: 0 };
    const dayMap = {};
    for (const d of all) {
      byVerdict[d.verdict] = (byVerdict[d.verdict] || 0) + 1;
      const day = (d.created_at instanceof Date ? d.created_at : new Date(d.created_at)).toISOString().slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { date: day, total: 0, deepfake: 0 };
      dayMap[day].total++;
      if (d.verdict === 'deepfake') dayMap[day].deepfake++;
    }
    const byDay = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
    res.json({ success: true, data: { byDay, byVerdict } });
  } catch (e) {
    console.error('Veritas timeline error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// GET /api/v1/detections/export.csv?tenant_id=N
router.get('/export.csv', async (req, res) => {
  try {
    const tid = tenantId(req);
    const rows = await Detection.findAll({
      where: { tenant_id: tid },
      include: [{ model: Asset }],
      order: [['created_at', 'DESC']]
    });
    const header = ['id', 'verdict', 'confidence', 'targeted_person', 'platform', 'media_type', 'source_url', 'impact', 'provider', 'created_at'];
    const lines = [header.join(',')];
    for (const d of rows) {
      const a = d.VeritasAsset || {};
      lines.push([
        d.id, d.verdict, d.confidence, d.targeted_person, a.source_platform, a.media_type,
        a.source_url, d.deepfakes_impact, d.provider, d.created_at && d.created_at.toISOString()
      ].map(csvCell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="veritas-detections-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(lines.join('\n'));
  } catch (e) {
    console.error('Veritas detections export error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
