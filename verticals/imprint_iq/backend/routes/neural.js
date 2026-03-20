const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.iq');
const neuralEngine = require('../services/neural.iq');

const TENANT = 'imprint_iq';

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// GET /health
router.get('/health', (req, res) => {
  res.json({ service: 'ImprintIQ Neural Intelligence', status: 'healthy', timestamp: new Date().toISOString() });
});

// GET /dashboard — Main Neural Intelligence endpoint
router.get('/dashboard', asyncHandler(async (req, res) => {
  const tenantId = req.query.tenant_id || TENANT;

  const [dashboard, findings, obdCodes, treatments] = await Promise.all([
    neuralEngine.getDashboard(tenantId),
    neuralEngine.generateFindings(tenantId),
    neuralEngine.getOBDCodes(tenantId),
    sequelize.query(`SELECT * FROM iq_neural_treatments WHERE tenant_id = $1`, { bind: [tenantId] }).then(r => r[0])
  ]);

  // Merge treatment activation state into findings
  const activeTreatments = treatments.filter(t => t.is_active).map(t => t.treatment_type);
  const enrichedFindings = findings.map(f => ({
    ...f,
    treatment: f.treatment ? {
      ...f.treatment,
      active: activeTreatments.includes(f.treatment.treatment_type)
    } : null
  }));

  // Revenue metrics
  const [revenueStats] = await sequelize.query(`
    SELECT COALESCE(SUM(total_amount),0) as pipeline FROM iq_quotes WHERE tenant_id = $1 AND stage IN ('draft','sent')
  `, { bind: [tenantId] });
  const [wonStats] = await sequelize.query(`
    SELECT COALESCE(SUM(total_amount),0) as won FROM iq_orders WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
  `, { bind: [tenantId] });

  const revenueAtRisk = enrichedFindings.reduce((s, f) => {
    const match = f.dollarImpact?.match(/\$([\d,]+)/);
    return s + (match ? parseInt(match[1].replace(/,/g, '')) : 0);
  }, 0);

  // Connections status
  const connections = [
    { name: 'ImprintIQ Platform', status: 'connected', icon: '🖨️' },
    { name: 'Voice AI (Rachel)', status: 'connected', icon: '🎙️' },
    { name: 'Production Floor', status: dashboard.panels[1]?.score > 0 ? 'connected' : 'standby', icon: '🏭' }
  ];

  res.json({
    success: true,
    healthScore: dashboard.overallScore,
    scoreLabel: dashboard.scoreLabel,
    revenueAtRisk,
    recoveryPotential: Math.round(revenueAtRisk * 0.35),
    pipelineValue: parseFloat(revenueStats[0]?.pipeline || 0),
    wonRevenue: parseFloat(wonStats[0]?.won || 0),
    trend: { direction: 'up', points: 3, period: '30 days' },
    panels: dashboard.panels,
    findings: enrichedFindings,
    obdCodes,
    connections
  });
}));

// GET /treatments — List active treatments
router.get('/treatments', asyncHandler(async (req, res) => {
  const tenantId = req.query.tenant_id || TENANT;
  const [rows] = await sequelize.query(`SELECT * FROM iq_neural_treatments WHERE tenant_id = $1 ORDER BY created_at DESC`, { bind: [tenantId] });
  res.json({ success: true, treatments: rows });
}));

// POST /treatments/activate — Toggle a treatment
router.post('/treatments/activate', asyncHandler(async (req, res) => {
  const { treatment_type, active } = req.body;
  const tenantId = req.body.tenant_id || TENANT;

  if (!treatment_type) return res.status(400).json({ error: 'treatment_type required' });

  const isActive = active !== false;

  await sequelize.query(`
    INSERT INTO iq_neural_treatments (tenant_id, treatment_type, is_active, activated_at, created_at, updated_at)
    VALUES ($1, $2, $3, ${isActive ? 'NOW()' : 'NULL'}, NOW(), NOW())
    ON CONFLICT (tenant_id, treatment_type) DO UPDATE SET
      is_active = $3,
      activated_at = ${isActive ? 'NOW()' : 'iq_neural_treatments.activated_at'},
      deactivated_at = ${isActive ? 'NULL' : 'NOW()'},
      updated_at = NOW()
  `, { bind: [tenantId, treatment_type, isActive] });

  res.json({ success: true, treatment_type, active: isActive });
}));

// GET /treatments/templates — Available treatment templates
router.get('/treatments/templates', (req, res) => {
  res.json({
    success: true,
    templates: [
      { type: 'lost_quote_recovery', name: 'Lost Quote Recovery', trigger: 'quote.lost', description: 'AI calls back with revised offer when quote is marked lost' },
      { type: 'artwork_acceleration', name: 'Artwork Acceleration', trigger: 'artwork.pending_48h', description: 'Auto pre-flight + virtual proof generation' },
      { type: 'qc_automation', name: 'QC Automation', trigger: 'production.complete', description: 'AI vision compares output to approved proof' },
      { type: 'dormant_reactivation', name: 'Dormant Account Reactivation', trigger: 'customer.dormant_120d', description: 'Voice agent calls with personalized reorder offer' },
      { type: 'auto_reorder', name: 'Auto Reorder', trigger: 'inventory.below_reorder', description: 'Auto-generate PO when stock drops' },
      { type: 'collections_automation', name: 'Collections Automation', trigger: 'invoice.overdue_7d', description: 'Escalating reminder sequence' },
      { type: 'proactive_reorder', name: 'Proactive Reorder Outreach', trigger: 'prediction.reorder_30d', description: 'Call customers before they need to reorder' },
      { type: 'missed_call_recovery', name: 'Missed Call Recovery', trigger: 'call.missed', description: 'Auto-SMS + AI callback within 5 minutes' },
      { type: 'margin_protection', name: 'Margin Protection', trigger: 'quote.low_margin', description: 'Flag and suggest alternatives for low-margin quotes' },
      { type: 'stale_quote_followup', name: 'Stale Quote Follow-Up', trigger: 'quote.stale_5d', description: 'Voice agent checks in on unanswered quotes' }
    ]
  });
});

// GET /treatments/log — Execution history
router.get('/treatments/log', asyncHandler(async (req, res) => {
  const tenantId = req.query.tenant_id || TENANT;
  const [rows] = await sequelize.query(`
    SELECT * FROM iq_treatment_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50
  `, { bind: [tenantId] });
  res.json({ success: true, log: rows });
}));

module.exports = router;
