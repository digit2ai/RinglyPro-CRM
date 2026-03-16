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

// ─── Dashboard Data (for neural.html frontend) ───────────────
// Returns NEURAL_DATA format: healthScore, panels, findings, connections
router.get('/dashboard/:client_id', async (req, res) => {
  try {
    const clientId = parseInt(req.params.client_id);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    // 1. Get client info + integration status
    const [client] = await sequelize.query(
      `SELECT id, business_name, business_phone,
              ghl_api_key, hubspot_api_key, booking_system,
              settings, voice_provider, elevenlabs_agent_id
       FROM clients WHERE id = :clientId`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );

    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    // 2. Get overview metrics (30 days current + 30 days prior for trend)
    const metrics = await engine.getOverviewMetrics(clientId, 30);
    const prevMetrics = await engine.getOverviewMetrics(clientId, 60);

    // 3. Run analysis to get fresh findings
    let analysisResult;
    try {
      analysisResult = await engine.runFullAnalysis(clientId);
    } catch (e) {
      console.error('Neural analysis error:', e.message);
      analysisResult = { insights: [] };
    }

    // 4. Calculate health scores per panel
    const callHealth = calculateCallHealth(metrics);
    const pipelineHealth = calculatePipelineHealth(metrics, client);
    const leadCaptureHealth = calculateLeadCaptureHealth(metrics);
    const retentionHealth = calculateRetentionHealth(metrics);
    const automationHealth = calculateAutomationHealth(client);

    const panelScores = [callHealth, pipelineHealth, leadCaptureHealth, retentionHealth, automationHealth];
    const overallScore = Math.round(panelScores.reduce((s, p) => s + p.score, 0) / panelScores.length);

    // Previous period overall for trend
    const prevCallHealth = calculateCallHealth(prevMetrics);
    const prevPanelScores = [prevCallHealth.score, pipelineHealth.score, leadCaptureHealth.score, retentionHealth.score, automationHealth.score];
    const prevOverallScore = Math.round(prevPanelScores.reduce((s, v) => s + v, 0) / prevPanelScores.length);
    const trendPoints = overallScore - prevOverallScore;

    // 5. Map insights to findings format
    const severityMap = { critical: 'CRITICAL', high: 'WARNING', medium: 'WARNING', low: 'OPPORTUNITY' };
    const findings = analysisResult.insights.map((insight, i) => ({
      id: `f${i + 1}`,
      severity: severityMap[insight.impact] || 'WARNING',
      title: insight.title,
      explanation: insight.summary,
      dollarImpact: insight.impactEstimate || '',
      source: mapCategoryToSource(insight.category),
      treatment: buildTreatment(insight)
    }));

    // If no findings, generate a welcome finding
    if (findings.length === 0) {
      findings.push({
        id: 'f0',
        severity: 'OPPORTUNITY',
        title: 'Neural Intelligence is ready to analyze your business',
        explanation: 'As your call data and CRM activity grows, Neural will automatically detect patterns, surface revenue opportunities, and recommend actions. Keep using RinglyPro and check back soon.',
        dollarImpact: '',
        source: 'System',
        treatment: null
      });
    }

    // 6. Calculate revenue at risk and recovery potential
    const missedCalls = metrics.calls.missed || 0;
    const avgBookingValue = 150; // Default average — can be per-client later
    const revenueAtRisk = Math.round(missedCalls * 0.35 * avgBookingValue);
    const recoveryPotential = Math.round(revenueAtRisk * 0.6);

    // 7. Determine connections
    const connections = buildConnections(client);

    // 8. Build response in NEURAL_DATA format
    const scoreLabel = overallScore >= 80 ? 'Excellent' : overallScore >= 65 ? 'Good' : overallScore >= 45 ? 'Needs Attention' : 'Critical';

    res.json({
      success: true,
      healthScore: overallScore,
      scoreLabel,
      revenueAtRisk,
      recoveryPotential,
      trend: {
        direction: trendPoints >= 0 ? 'up' : 'down',
        points: Math.abs(trendPoints),
        period: '30 days'
      },
      businessName: client.business_name || 'Your Business',
      panels: panelScores,
      findings,
      connections
    });
  } catch (error) {
    console.error('Neural dashboard error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Helper: Call Health Score ────────────────────────────────
function calculateCallHealth(metrics) {
  const answerRate = metrics.calls.answerRate || 0;
  const avgDuration = metrics.calls.avgDuration || 0;
  // Score: answer rate weight 70%, duration engagement weight 30%
  const durationScore = Math.min(avgDuration / 120, 1) * 100; // 120s = perfect
  const score = Math.round(answerRate * 0.7 + durationScore * 0.3);
  const trend = metrics.calls.answerRateTrend || 0;

  return {
    name: 'Call Health',
    score: Math.min(Math.max(score, 0), 100),
    topFinding: answerRate < 70
      ? `Answer rate at ${answerRate}% — below 70% target`
      : `${metrics.calls.total} calls handled, ${answerRate}% answer rate`,
    trend: { direction: trend >= 0 ? 'up' : 'down', points: Math.abs(Math.round(trend)) },
    source: 'Rachel / RinglyPro'
  };
}

// ─── Helper: Pipeline Health ─────────────────────────────────
function calculatePipelineHealth(metrics, client) {
  const bookings = metrics.bookings.total || 0;
  const convRate = metrics.bookings.conversionRate || 0;
  const noShows = metrics.bookings.noShows || 0;
  const noShowRate = bookings > 0 ? (noShows / bookings) * 100 : 0;

  // Score based on conversion rate and no-show rate
  let score = Math.min(convRate * 2, 60) + Math.max(40 - noShowRate * 2, 0);
  score = Math.round(Math.min(Math.max(score, 0), 100));

  const hasCRM = !!(client.ghl_api_key || client.hubspot_api_key || (client.settings?.integration?.zoho?.enabled));
  if (!hasCRM && bookings === 0) score = Math.max(score, 30); // New clients get baseline

  return {
    name: 'Pipeline Health',
    score,
    topFinding: bookings === 0
      ? 'No bookings yet — connect a CRM to track pipeline'
      : `${bookings} bookings, ${convRate}% conversion rate`,
    trend: { direction: 'flat', points: 0 },
    source: hasCRM ? 'CRM Pipeline' : 'RinglyPro'
  };
}

// ─── Helper: Lead Capture Health ─────────────────────────────
function calculateLeadCaptureHealth(metrics) {
  const newLeads = metrics.leads.newLeads || 0;
  const totalCalls = metrics.calls.total || 0;
  const captureRate = totalCalls > 0 ? (newLeads / totalCalls) * 100 : 0;

  // Score: leads captured vs calls received
  let score = totalCalls === 0 ? 50 : Math.round(Math.min(captureRate * 2, 100));
  score = Math.min(Math.max(score, 0), 100);

  return {
    name: 'Lead Capture Rate',
    score,
    topFinding: totalCalls === 0
      ? 'No calls yet — score will update as data flows in'
      : `${newLeads} leads captured from ${totalCalls} calls (${captureRate.toFixed(0)}%)`,
    trend: { direction: newLeads > 0 ? 'up' : 'flat', points: newLeads > 0 ? 2 : 0 },
    source: 'Rachel + CRM'
  };
}

// ─── Helper: Customer Retention Health ───────────────────────
function calculateRetentionHealth(metrics) {
  const completed = metrics.bookings.completed || 0;
  const noShows = metrics.bookings.noShows || 0;
  const total = completed + noShows;

  let score = total === 0 ? 60 : Math.round((completed / total) * 100);
  score = Math.min(Math.max(score, 0), 100);

  return {
    name: 'Customer Retention',
    score,
    topFinding: total === 0
      ? 'No appointment history yet'
      : noShows > 0
        ? `${noShows} no-shows detected — ${((noShows / total) * 100).toFixed(0)}% no-show rate`
        : `${completed} completed appointments — excellent retention`,
    trend: { direction: noShows > 0 ? 'down' : 'up', points: noShows > 0 ? noShows : 2 },
    source: 'Appointments'
  };
}

// ─── Helper: Automation Coverage Health ──────────────────────
function calculateAutomationHealth(client) {
  let activeCount = 0;
  const totalRecommended = 6;

  // Check what's configured
  if (client.voice_provider === 'elevenlabs' || client.elevenlabs_agent_id) activeCount++;
  if (client.ghl_api_key) activeCount++;
  if (client.hubspot_api_key) activeCount++;
  if (client.settings?.integration?.zoho?.enabled) activeCount++;
  if (client.booking_system) activeCount++;
  if (client.business_phone) activeCount++; // Basic setup

  const score = Math.round((activeCount / totalRecommended) * 100);

  return {
    name: 'Automation Coverage',
    score: Math.min(Math.max(score, 0), 100),
    topFinding: `${activeCount} of ${totalRecommended} recommended integrations active`,
    trend: { direction: activeCount >= 3 ? 'up' : 'flat', points: activeCount >= 3 ? 2 : 0 },
    source: 'System'
  };
}

// ─── Helper: Map category to data source label ───────────────
function mapCategoryToSource(category) {
  const map = {
    missed_revenue: 'Rachel Call Logs',
    call_conversion: 'Rachel + Appointments',
    lead_response: 'Contacts + Calls',
    scheduling: 'Appointments',
    voice_conversation: 'Rachel Call Logs',
    lead_source: 'Contacts',
    outbound_campaign: 'Outbound Calls',
    customer_sentiment: 'Appointments',
    script_optimization: 'Rachel Call Logs',
    revenue_forecast: 'Calls + Appointments'
  };
  return map[category] || 'RinglyPro';
}

// ─── Helper: Build treatment from insight ────────────────────
function buildTreatment(insight) {
  // Build treatment workflows for top categories
  const treatments = {
    missed_revenue: {
      workflow: [
        { type: 'trigger', text: 'When an incoming call is missed or goes to voicemail' },
        { type: 'condition', text: 'If caller is not in contacts or has no recent callback' },
        { type: 'action', text: 'Auto-send SMS within 30 seconds, create contact, schedule callback task in 2 hours' }
      ],
      projection: insight.impactEstimate || 'Recover missed call revenue'
    },
    call_conversion: {
      workflow: [
        { type: 'trigger', text: 'When a call exceeds 60 seconds with no booking' },
        { type: 'condition', text: 'If caller expressed interest but did not schedule' },
        { type: 'action', text: 'Send follow-up SMS with booking link, add to nurture sequence' }
      ],
      projection: insight.impactEstimate || 'Improve call-to-booking conversion'
    },
    lead_response: {
      workflow: [
        { type: 'trigger', text: 'When a new contact is created from any source' },
        { type: 'condition', text: 'If no outbound call or SMS sent within 5 minutes' },
        { type: 'action', text: 'Auto-trigger outbound call via Rachel AI, send intro SMS with booking link' }
      ],
      projection: insight.impactEstimate || 'Reduce lead response time to under 5 minutes'
    },
    customer_sentiment: {
      workflow: [
        { type: 'trigger', text: 'When an appointment is created' },
        { type: 'condition', text: '24 hours and 1 hour before appointment time' },
        { type: 'action', text: 'Send automated SMS reminder with confirmation link, flag no-response for manual follow-up' }
      ],
      projection: insight.impactEstimate || 'Reduce no-show rate'
    },
    revenue_forecast: {
      workflow: [
        { type: 'trigger', text: 'When weekly call volume is analyzed' },
        { type: 'condition', text: 'If conversion rate is below target threshold' },
        { type: 'action', text: 'Adjust AI agent scripts, activate re-engagement campaigns for unconverted callers' }
      ],
      projection: insight.impactEstimate || 'Increase monthly bookings'
    }
  };

  const t = treatments[insight.category];
  if (!t) return null;

  return { ...t, active: false };
}

// ─── Helper: Build connections status ────────────────────────
function buildConnections(client) {
  const connections = [];

  // Rachel / ElevenLabs Voice AI
  const hasVoice = client.voice_provider === 'elevenlabs' || !!client.elevenlabs_agent_id;
  connections.push({
    name: 'RinglyPro Rachel',
    status: hasVoice ? 'connected' : 'disconnected',
    lastSync: hasVoice ? 'Active' : null
  });

  // GHL
  if (client.ghl_api_key) {
    connections.push({ name: 'GoHighLevel', status: 'connected', lastSync: 'Connected' });
  }

  // HubSpot
  const hasHubSpot = client.hubspot_api_key || client.settings?.integration?.hubspot?.enabled;
  if (hasHubSpot) {
    connections.push({ name: 'HubSpot', status: 'connected', lastSync: 'Connected' });
  }

  // Zoho
  const hasZoho = client.settings?.integration?.zoho?.enabled;
  if (hasZoho) {
    connections.push({ name: 'Zoho CRM', status: 'connected', lastSync: 'Connected' });
  }

  // If no CRM connected, show suggestion
  if (!client.ghl_api_key && !hasHubSpot && !hasZoho) {
    connections.push({ name: 'CRM', status: 'disconnected', lastSync: null });
  }

  return connections;
}

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
