const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.lg');
const sequelize = require('../services/db.lg');

const TOOLS = {
  get_shipment_status: { module: 'shipper', description: 'Get real-time status of a shipment', params: ['load_id'] },
  request_quote: { module: 'shipper', description: 'Request a freight quote with AI pricing', params: ['origin', 'destination', 'freight_type', 'weight_lbs', 'pickup_date'] },
  submit_booking: { module: 'shipper', description: 'Book a quoted shipment', params: ['quote_id'] },
  get_shipper_history: { module: 'shipper', description: 'Get shipment history for a shipper', params: ['shipper_id'] },
  get_available_loads: { module: 'carrier', description: 'Get loads matching carrier lanes and equipment', params: ['carrier_id'] },
  submit_bid: { module: 'carrier', description: 'Submit a bid on a load', params: ['load_id', 'carrier_id', 'rate'] },
  get_payment_status: { module: 'carrier', description: 'Get payment status for carrier', params: ['carrier_id'] },
  update_availability: { module: 'carrier', description: 'Update carrier equipment availability', params: ['carrier_id', 'available_city', 'available_state', 'equipment_type'] },
  upload_document: { module: 'documents', description: 'Upload a document to the vault', params: ['doc_type', 'load_id'] },
  get_load_documents: { module: 'documents', description: 'Get all documents for a load', params: ['load_id'] },
  verify_documents_complete: { module: 'documents', description: 'Check if all required docs are present for billing', params: ['load_id'] },
  verify_carrier_authority: { module: 'fmcsa', description: 'Verify carrier authority status via FMCSA', params: ['dot_number'] },
  get_safety_score: { module: 'fmcsa', description: 'Get carrier CSA safety scores', params: ['dot_number'] },
  check_insurance_status: { module: 'fmcsa', description: 'Check carrier insurance status and expiration', params: ['carrier_id'] },
  run_carrier_onboarding: { module: 'fmcsa', description: 'Run full carrier onboarding check', params: ['dot_number', 'mc_number'] },
  match_carriers_to_load: { module: 'matching', description: 'AI-powered carrier matching for a load', params: ['load_id'] },
  launch_coverage_campaign: { module: 'matching', description: 'Auto-call top carriers for load coverage', params: ['load_id', 'max_carriers'] },
  get_match_score: { module: 'matching', description: 'Get match score breakdown for carrier+load', params: ['load_id', 'carrier_id'] },
};

router.get('/list', (req, res) => {
  const tools = Object.entries(TOOLS).map(([name, t]) => ({ name, module: t.module, description: t.description, parameters: t.params }));
  res.json({ success: true, tools });
});

router.post('/call', auth.any, async (req, res) => {
  const start = Date.now();
  const { tool, input } = req.body;
  if (!tool || !TOOLS[tool]) return res.status(400).json({ error: `Unknown tool: ${tool}. Use GET /tools/list to see available tools.` });
  try {
    const handler = require(`../services/${TOOLS[tool].module}.lg`);
    if (!handler[tool]) return res.status(500).json({ error: `Tool ${tool} not implemented in ${TOOLS[tool].module} module` });
    const result = await handler[tool](input || {}, req.user);
    const duration = Date.now() - start;
    await sequelize.query(
      `INSERT INTO lg_mcp_tool_log (tenant_id, tool_name, input, output, user_id, duration_ms, status, created_at) VALUES ('logistics', $1, $2, $3, $4, $5, 'success', NOW())`,
      { bind: [tool, JSON.stringify(input || {}), JSON.stringify(result), req.user?.id || null, duration] }
    ).catch(() => {});
    res.json({ success: true, tool, result, duration_ms: duration });
  } catch (err) {
    const duration = Date.now() - start;
    await sequelize.query(
      `INSERT INTO lg_mcp_tool_log (tenant_id, tool_name, input, user_id, duration_ms, status, error, created_at) VALUES ('logistics', $1, $2, $3, $4, 'error', $5, NOW())`,
      { bind: [tool, JSON.stringify(input || {}), req.user?.id || null, duration, err.message] }
    ).catch(() => {});
    res.status(500).json({ error: err.message, tool });
  }
});

module.exports = router;
