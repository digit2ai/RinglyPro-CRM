/**
 * RinglyPro Neural - Intelligence API Routes
 *
 * Provides endpoints for the Neural dashboard:
 *  - GET  /api/neural/health           — Health check
 *  - GET  /api/neural/overview         — KPI overview metrics
 *  - GET  /api/neural/insights         — Stored insight cards
 *  - POST /api/neural/analyze          — Run full analysis pipeline
 *  - PUT  /api/neural/insights/:id     — Update insight status
 *  - GET  /api/neural/insights/category/:cat — Filter by category
 */

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const NeuralEngine = require('../services/neuralEngine');

const engine = new NeuralEngine(sequelize);

// ─── Auth: API key or JWT ──────────────────────────────────────
function requireAuth(req, res, next) {
  const apiKey = req.query.apiKey || req.headers['x-api-key'] || req.body?.apiKey;
  const expectedKey = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
  if (apiKey === expectedKey) return next();

  // Fallback: JWT from Authorization header
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ringlypro-jwt-secret');
      req.user = decoded;
      return next();
    } catch (e) { /* fall through */ }
  }

  return res.status(401).json({ success: false, error: 'Authentication required' });
}

router.use(requireAuth);

// ─── Health ────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ success: true, service: 'RinglyPro Neural', version: '1.0.0', status: 'operational' });
});

// ─── Overview Metrics ──────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const clientId = parseInt(req.query.client_id);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    const days = parseInt(req.query.days) || 7;
    const metrics = await engine.getOverviewMetrics(clientId, days);

    res.json({ success: true, ...metrics });
  } catch (error) {
    console.error('Neural overview error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Run Full Analysis ─────────────────────────────────────────
router.post('/analyze', async (req, res) => {
  try {
    const clientId = parseInt(req.body.client_id || req.query.client_id);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    const result = await engine.runFullAnalysis(clientId);

    // Persist insights to database
    let saved = 0;
    for (const insight of result.insights) {
      try {
        await sequelize.query(
          `INSERT INTO neural_insights (client_id, category, title, summary, evidence, impact, impact_estimate, recommended_action, status, analysis_date, metadata, created_at, updated_at)
           VALUES (:clientId, :category, :title, :summary, :evidence, :impact, :impactEstimate, :recommendedAction, 'active', :analysisDate, '{}', NOW(), NOW())
           ON CONFLICT (client_id, category, analysis_date)
           DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary, evidence = EXCLUDED.evidence,
             impact = EXCLUDED.impact, impact_estimate = EXCLUDED.impact_estimate,
             recommended_action = EXCLUDED.recommended_action, updated_at = NOW()`,
          {
            replacements: {
              clientId: insight.clientId,
              category: insight.category,
              title: insight.title,
              summary: insight.summary,
              evidence: JSON.stringify(insight.evidence),
              impact: insight.impact,
              impactEstimate: insight.impactEstimate || '',
              recommendedAction: insight.recommendedAction,
              analysisDate: insight.analysisDate
            }
          }
        );
        saved++;
      } catch (e) {
        console.error(`Failed to save insight ${insight.category}:`, e.message);
      }
    }

    res.json({ success: true, ...result, saved });
  } catch (error) {
    console.error('Neural analyze error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Get Stored Insights ───────────────────────────────────────
router.get('/insights', async (req, res) => {
  try {
    const clientId = parseInt(req.query.client_id);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    const status = req.query.status || 'active';
    const limit = parseInt(req.query.limit) || 50;

    const insights = await sequelize.query(
      `SELECT * FROM neural_insights
       WHERE client_id = :clientId AND status = :status
       ORDER BY
         CASE impact WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         analysis_date DESC
       LIMIT :limit`,
      { replacements: { clientId, status, limit }, type: QueryTypes.SELECT }
    );

    res.json({ success: true, count: insights.length, insights });
  } catch (error) {
    console.error('Neural insights error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Filter by Category ────────────────────────────────────────
router.get('/insights/category/:category', async (req, res) => {
  try {
    const clientId = parseInt(req.query.client_id);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    const insights = await sequelize.query(
      `SELECT * FROM neural_insights
       WHERE client_id = :clientId AND category = :category
       ORDER BY analysis_date DESC LIMIT 30`,
      { replacements: { clientId, category: req.params.category }, type: QueryTypes.SELECT }
    );

    res.json({ success: true, count: insights.length, insights });
  } catch (error) {
    console.error('Neural category error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Update Insight Status ─────────────────────────────────────
router.put('/insights/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'acknowledged', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    await sequelize.query(
      `UPDATE neural_insights SET status = :status, updated_at = NOW() WHERE id = :id`,
      { replacements: { status, id: parseInt(req.params.id) } }
    );

    res.json({ success: true, message: 'Insight updated' });
  } catch (error) {
    console.error('Neural update error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Clients with Neural Data ──────────────────────────────────
router.get('/clients', async (req, res) => {
  try {
    const clients = await sequelize.query(
      `SELECT DISTINCT c.id, c.business_name
       FROM clients c
       INNER JOIN calls cl ON cl.client_id = c.id
       WHERE c.active = true
       ORDER BY c.business_name`,
      { type: QueryTypes.SELECT }
    );
    res.json({ success: true, clients });
  } catch (error) {
    console.error('Neural clients error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
