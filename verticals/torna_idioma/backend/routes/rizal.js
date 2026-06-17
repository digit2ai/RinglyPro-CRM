'use strict';

/**
 * MÓDULO RIZAL — Rizal Studies track + config-driven Completion Record.
 * Certificate requirement satisfied via Rizal's own public-domain Spanish works
 * as graded reading. The artifact is labeled "Rizal Studies — Completion Record"
 * and never asserts legal sufficiency (PART A §5, PART D).
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.ti');
const sequelize = require('../services/db.ti');
const emperador = require('../services/emperador');
const cfg = require('../config/rizal');
const SECTIONS = require('../seeds/metodo_rizal/rizal_sections');

// GET /config — required sections + pass threshold (config-driven, no hard-coding).
router.get('/config', auth.any, (req, res) => {
  res.json({
    success: true,
    required_sections: cfg.REQUIRED_SECTIONS,
    pass_threshold: cfg.PASS_THRESHOLD,
    artifact_label: cfg.ARTIFACT_LABEL,
    disclaimer: cfg.DISCLAIMER,
  });
});

// GET /sections — section reading content (graded public-domain Spanish).
router.get('/sections', auth.any, (req, res) => {
  res.json({ success: true, sections: SECTIONS, required: cfg.REQUIRED_SECTIONS });
});

// GET /progress — my Rizal section progress.
router.get('/progress', auth.any, async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT section, status, score, completed_at FROM ti_rizal_module_progress WHERE user_id = $1`,
      { bind: [req.user.id] }
    );
    res.json({ success: true, progress: rows });
  } catch (err) {
    console.error('rizal/progress error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /section/:section/complete — mark a section done with a score (0-100).
router.post('/section/:section/complete', auth.any, async (req, res) => {
  try {
    const section = String(req.params.section).toLowerCase();
    if (!SECTIONS.some(s => s.key === section)) {
      return res.status(404).json({ error: 'unknown section' });
    }
    const score = Math.max(0, Math.min(100, Number(req.body.score) || 0));
    const [[prev]] = await sequelize.query(
      `SELECT completed_at FROM ti_rizal_module_progress WHERE user_id = $1 AND section = $2`,
      { bind: [req.user.id, section] }
    );
    await sequelize.query(
      `INSERT INTO ti_rizal_module_progress (user_id, section, status, score, completed_at, updated_at)
       VALUES ($1, $2, 'completed', $3, NOW(), NOW())
       ON CONFLICT (user_id, section) DO UPDATE SET
         status = 'completed', score = GREATEST(ti_rizal_module_progress.score, $3),
         completed_at = COALESCE(ti_rizal_module_progress.completed_at, NOW()), updated_at = NOW()`,
      { bind: [req.user.id, section, score] }
    );
    if (!prev?.completed_at) await emperador.award(req.user.id, 'rizal_milestone');
    res.json({ success: true });
  } catch (err) {
    console.error('rizal/complete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /completion-record — the Rizal Studies Completion Record (config-driven).
router.get('/completion-record', auth.any, async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT section, status, score, completed_at FROM ti_rizal_module_progress WHERE user_id = $1`,
      { bind: [req.user.id] }
    );
    const byKey = Object.fromEntries(rows.map(r => [r.section, r]));
    const required = cfg.REQUIRED_SECTIONS;

    const sections = required.map(key => {
      const meta = SECTIONS.find(s => s.key === key);
      const row = byKey[key];
      return {
        key,
        title_en: meta?.title_en || key,
        title_fil: meta?.title_fil || key,
        status: row?.status || 'not_started',
        score: row?.score ?? null,
        completed_at: row?.completed_at || null,
      };
    });

    const completed = sections.filter(s => s.status === 'completed');
    const scored = completed.filter(s => typeof s.score === 'number');
    const avg = scored.length ? Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length) : 0;
    const allDone = completed.length === required.length;
    const passed = allDone && avg >= cfg.PASS_THRESHOLD;

    res.json({
      success: true,
      artifact_label: cfg.ARTIFACT_LABEL,
      disclaimer: cfg.DISCLAIMER,
      learner: { name: req.user.full_name || req.user.email, id: req.user.id },
      pass_threshold: cfg.PASS_THRESHOLD,
      required_sections: required,
      sections,
      overall_score: avg,
      status: passed ? 'passed' : (allDone ? 'completed_below_threshold' : 'in_progress'),
      issued_at: passed ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error('rizal/completion-record error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
