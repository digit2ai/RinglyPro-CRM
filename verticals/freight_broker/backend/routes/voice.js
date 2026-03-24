const express = require('express');
const router = express.Router();
const voiceTools = require('../services/voiceTools.freight');

const FREIGHTMIND_AGENT_ID = 'agent_01jq91q5v3e84rash52t6pxscr';

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// POST /token — Get signed WebSocket URL for FreightMind Rachel agent
router.post('/token', asyncHandler(async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${FREIGHTMIND_AGENT_ID}`,
    { headers: { 'xi-api-key': apiKey } }
  );

  if (!response.ok) {
    const err = await response.text();
    return res.status(response.status).json({ error: `ElevenLabs error: ${err}` });
  }

  const data = await response.json();
  res.json({
    signed_url: data.signed_url,
    agent_id: FREIGHTMIND_AGENT_ID,
    agent_name: 'Rachel',
    role: 'FreightMind AI Sales Presenter'
  });
}));

// POST /tools/webhook — ElevenLabs server tool webhook handler
// Called by the ElevenLabs agent during conversation when Rachel needs data
router.post('/tools/webhook', asyncHandler(async (req, res) => {
  const { tool_call_id, tool_name, parameters } = req.body;

  console.log(`[FreightMind Voice Tool] ${tool_name} called (${tool_call_id})`);

  let result = '';

  switch (tool_name) {
    case 'get_obd_overview':
      result = await voiceTools.getOBDOverview();
      break;
    case 'get_findings':
      result = await voiceTools.getFindings();
      break;
    case 'get_prescriptions':
      result = await voiceTools.getPrescriptions();
      break;
    case 'get_cost_reduction':
      result = await voiceTools.getCostReductionModel();
      break;
    case 'get_company_profile':
      result = await voiceTools.getCompanyProfile();
      break;
    case 'get_pricing':
      result = await voiceTools.getPricingModel();
      break;
    case 'get_roi_projection':
      result = await voiceTools.getROIProjection();
      break;
    case 'get_tech_stack':
      result = await voiceTools.getTechStack();
      break;
    default:
      result = `Tool ${tool_name} is not available. I can present the OBD overview, findings, prescriptions, cost reduction model, company profile, pricing, ROI projection, or tech stack architecture.`;
  }

  res.json({ result });
}));

// GET /tools/list — List available voice tools
router.get('/tools/list', (req, res) => {
  res.json({
    tools: [
      { name: 'get_obd_overview', description: 'Get live OBD Scanner overview — overall score, finding counts by severity, total savings, scan history, platform stats (8 agents, 92 tools, 7 modules)' },
      { name: 'get_findings', description: 'Get all open findings from the OBD scan — severity, title, diagnostic text, and estimated savings for each finding' },
      { name: 'get_prescriptions', description: 'Get AI-generated prescriptions ranked by savings — recommended actions, responsible agents, and monthly savings per prescription' },
      { name: 'get_cost_reduction', description: 'Get the full CW Carriers cost reduction model — margin recovery, lane optimization, carrier rates, operational efficiency, claims reduction totaling $1.5M' },
      { name: 'get_company_profile', description: 'Get CW Carriers company profile — revenue, MC number, headquarters, leadership, key clients, tech stack, on-time rate' },
      { name: 'get_pricing', description: 'Get FreightMind AI 3-tier pricing — Scanner $8,500/mo, Treatment $12,500/mo + 2.5% savings, Managed $18,000/mo, implementation $35K' },
      { name: 'get_roi_projection', description: 'Get 3-year ROI projection — Year 1 $1.5M savings, Year 2 $2M, Year 3 $2.5M, total $5.285M net benefit, $8.40 per dollar invested' },
      { name: 'get_tech_stack', description: 'Get OBD Scanner architecture — universal ingestion engine, 500+ fuzzy aliases, 10 TMS profiles, 7 scan modules, Treatment auto-execution' }
    ]
  });
});

// GET /health
router.get('/health', (req, res) => {
  res.json({
    service: 'FreightMind AI Voice',
    agent: 'Rachel (Sales Presenter)',
    agent_id: FREIGHTMIND_AGENT_ID,
    tools: 8,
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
