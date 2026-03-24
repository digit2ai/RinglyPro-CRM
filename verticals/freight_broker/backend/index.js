// ============================================================================
// FreightMind AI — E2E Freight Broker SaaS Platform
// Mount point: /freight_broker
// "Your fleet runs itself."
// ============================================================================

const express = require('express');
const path = require('path');
const router = express.Router();
const sequelize = require('./services/db.freight');

// Import MCP Server + Agent Framework from CW Carriers (shared infrastructure)
// FreightMind agents live in cw_carriers for now — they serve ALL tenants
const cwPath = path.join(__dirname, '../../cw_carriers/backend');

// ============================================================================
// MCP SERVER ROUTES (the orchestrator — central entry point for all AI ops)
// ============================================================================
const mcpRoutes = require(path.join(cwPath, 'routes/mcp'));
router.use('/mcp', mcpRoutes);

// ============================================================================
// AGENT API ROUTES (inspect, execute, audit agents)
// ============================================================================
const agentsRoutes = require(path.join(cwPath, 'routes/agents'));
router.use('/api/agents', agentsRoutes);

// ============================================================================
// RESOURCE API ROUTES (CRUD for trucks, drivers, dispatches)
// ============================================================================
const trucksRoutes = require(path.join(cwPath, 'routes/trucks'));
const driversRoutes = require(path.join(cwPath, 'routes/drivers'));
const dispatchesRoutes = require(path.join(cwPath, 'routes/dispatches'));
router.use('/api/trucks', trucksRoutes);
router.use('/api/drivers', driversRoutes);
router.use('/api/dispatches', dispatchesRoutes);

// ============================================================================
// OBD SCANNER — Universal Diagnostic Engine
// ============================================================================
const obdRoutes = require('./routes/obd');
router.use('/api/obd', obdRoutes);

// ============================================================================
// DEMO & SEEDING
// ============================================================================
const demoRoutes = require('./routes/demo');
router.use('/api/demo', demoRoutes);

// ============================================================================
// VOICE AI — Rachel Sales Presenter (ElevenLabs)
// ============================================================================
const voiceRoutes = require('./routes/voice');
router.use('/api/voice', voiceRoutes);

// ============================================================================
// CROSS-TIER EVENT HANDLERS (the nervous system)
// ============================================================================
try {
  const { registerEventHandlers } = require('./services/event-handlers');
  registerEventHandlers();
} catch (e) {
  console.error('⚠️ FreightMind event handlers init error:', e.message);
}

// ============================================================================
// TENANT MANAGEMENT API
// ============================================================================
router.get('/api/tenants', async (req, res) => {
  try {
    const [rows] = await sequelize.query(
      `SELECT id, tenant_id, company_name, tier_1_load_ops, tier_2_fleet_ops,
              tier_3_financial, tier_4_compliance, tier_5_neural,
              addon_voice, addon_treatment, package_name, truck_count,
              monthly_rate, status, created_at
       FROM lg_tenant_config ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/tenants', async (req, res) => {
  try {
    const { tenant_id, company_name, package_name, truck_count,
            tier_1, tier_2, tier_3, tier_4, tier_5, voice, treatment } = req.body;
    if (!tenant_id || !company_name) {
      return res.status(400).json({ error: 'tenant_id and company_name required' });
    }
    const apiKey = 'fm_' + require('crypto').randomBytes(24).toString('hex');

    // Calculate monthly rate based on tiers
    let rate = 0;
    if (tier_1) rate += 149;
    if (tier_2) rate += 149;
    if (tier_3) rate += 149;
    if (tier_4) rate += 99;
    if (tier_5) rate += 149;
    if (treatment) rate += 99;
    const monthlyRate = rate * (truck_count || 10);

    await sequelize.query(
      `INSERT INTO lg_tenant_config
       (tenant_id, company_name, tier_1_load_ops, tier_2_fleet_ops, tier_3_financial,
        tier_4_compliance, tier_5_neural, addon_voice, addon_treatment,
        package_name, truck_count, monthly_rate, api_key, status, billing_start_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         company_name=$2, tier_1_load_ops=$3, tier_2_fleet_ops=$4, tier_3_financial=$5,
         tier_4_compliance=$6, tier_5_neural=$7, addon_voice=$8, addon_treatment=$9,
         package_name=$10, truck_count=$11, monthly_rate=$12, updated_at=NOW()`,
      { bind: [tenant_id, company_name, !!tier_1, !!tier_2, !!tier_3, !!tier_4, !!tier_5,
               !!voice, !!treatment, package_name || 'custom', truck_count || 10, monthlyRate, apiKey] }
    );
    res.json({ success: true, data: { tenant_id, api_key: apiKey, monthly_rate: monthlyRate } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  let agents = [];
  try {
    const { getAllAgents } = require(path.join(cwPath, 'services/agent-framework.cw'));
    agents = getAllAgents();
  } catch (e) {}
  res.json({
    product: 'FreightMind AI',
    tagline: 'Your fleet runs itself.',
    status: 'healthy',
    version: '1.0.0',
    architecture: {
      orchestrator: 'MCP Server',
      agents: agents.length,
      agent_names: agents.map(a => a.name),
      total_tools: agents.reduce((s, a) => s + a.toolCount, 0),
      tiers: 5,
      pillars: ['AI Agent Mesh', 'Neural Intelligence', 'Voice AI', 'Command Center']
    },
    endpoints: {
      mcp_status: '/freight_broker/mcp/status',
      mcp_tools_list: '/freight_broker/mcp/tools/list',
      mcp_tools_call: '/freight_broker/mcp/tools/call',
      mcp_events: '/freight_broker/mcp/events',
      mcp_tiers: '/freight_broker/mcp/tiers',
      agents: '/freight_broker/api/agents',
      tenants: '/freight_broker/api/tenants',
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// COMMAND CENTER — Landing Page (static HTML served from dist/)
// ============================================================================
const distPath = path.join(__dirname, '../frontend/dist');
router.use(express.static(distPath));

// SPA fallback
router.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/mcp/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

module.exports = router;
