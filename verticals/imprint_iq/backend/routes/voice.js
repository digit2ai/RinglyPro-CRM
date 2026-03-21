const express = require('express');
const router = express.Router();
const voiceTools = require('../services/voiceTools.iq');

const IMPRINTIQ_AGENT_ID = 'agent_5201km8nbx0sfsgbqfqwacz1bq3v';

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// POST /token — Get signed WebSocket URL for ImprintIQ Lina agent
router.post('/token', asyncHandler(async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${IMPRINTIQ_AGENT_ID}`,
    { headers: { 'xi-api-key': apiKey } }
  );

  if (!response.ok) {
    const err = await response.text();
    return res.status(response.status).json({ error: `ElevenLabs error: ${err}` });
  }

  const data = await response.json();
  res.json({
    signed_url: data.signed_url,
    agent_id: IMPRINTIQ_AGENT_ID,
    agent_name: 'Lina',
    role: 'ImprintIQ Sales Presenter'
  });
}));

// POST /tools/webhook — ElevenLabs server tool webhook handler
// This is called by the ElevenLabs agent during conversation when Lina needs data
router.post('/tools/webhook', asyncHandler(async (req, res) => {
  const { tool_call_id, tool_name, parameters } = req.body;

  console.log(`[ImprintIQ Voice Tool] ${tool_name} called (${tool_call_id})`);

  let result = '';

  switch (tool_name) {
    case 'get_dashboard_overview':
      result = await voiceTools.getDashboardOverview();
      break;
    case 'get_neural_report':
      result = await voiceTools.getNeuralReport();
      break;
    case 'get_process_comparison':
      result = await voiceTools.getProcessComparison();
      break;
    case 'get_architecture_overview':
      result = await voiceTools.getArchitectureOverview();
      break;
    case 'get_roi_summary':
      result = await voiceTools.getROISummary();
      break;
    case 'get_findings':
      result = await voiceTools.getFindings();
      break;
    case 'get_system_health':
      result = await voiceTools.getSystemHealth();
      break;
    default:
      result = `Tool ${tool_name} is not available. I can present the dashboard overview, neural intelligence report, process comparison, architecture overview, ROI summary, diagnostic findings, or system health.`;
  }

  res.json({ result });
}));

// GET /tools/list — List available voice tools
router.get('/tools/list', (req, res) => {
  res.json({
    tools: [
      { name: 'get_dashboard_overview', description: 'Get live KPIs from the ImprintIQ dashboard — open quotes, active orders, production jobs, customers, calls, inventory alerts' },
      { name: 'get_neural_report', description: 'Get the full Neural Intelligence health report — 6 panel scores, overall health score, and top diagnostic findings with dollar impact' },
      { name: 'get_process_comparison', description: 'Get the current state vs ImprintIQ target state comparison for all 6 operational areas with before/after metrics and savings per area' },
      { name: 'get_architecture_overview', description: 'Get the complete 5-layer architecture overview — what each data layer does, what agents are included, and current build status' },
      { name: 'get_roi_summary', description: 'Get the projected ROI for Hit Promotional Products — investment, savings breakdown by area, net benefit, payback period, and additional revenue upside' },
      { name: 'get_findings', description: 'Get all active Neural Intelligence diagnostic findings with severity, title, explanation, dollar impact, and recommended treatment' },
      { name: 'get_system_health', description: 'Get the on-board diagnostics status for all 8 ImprintIQ systems — which are operational and which need attention' },
    ]
  });
});

// GET /health
router.get('/health', (req, res) => {
  res.json({
    service: 'ImprintIQ Voice AI',
    agent: 'Lina (Sales Presenter)',
    agent_id: IMPRINTIQ_AGENT_ID,
    tools: 7,
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
