const express = require('express');
const router = express.Router();
const mcp = require('../services/mcp-server.cw');

// GET /mcp/status — Orchestrator health + tier activation
router.get('/status', async (req, res) => {
  try {
    const status = await mcp.getStatus(req.query.tenant_id);
    res.json({ success: true, data: status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /mcp/tools/list — List available tools (filtered by tenant's licensed tiers)
router.post('/tools/list', async (req, res) => {
  try {
    const tenantId = req.body.tenant_id || req.query.tenant_id || 'logistics';
    const tools = await mcp.listTools(tenantId);
    res.json({ success: true, data: { tools, count: tools.length } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /mcp/tools/call — Execute any tool (routed to correct agent, tier-gated)
router.post('/tools/call', async (req, res) => {
  try {
    const { tenant_id, tool, input } = req.body;
    if (!tool) return res.status(400).json({ error: 'tool name required' });
    const tenantId = tenant_id || 'logistics';
    const result = await mcp.callTool(tenantId, tool, input || {});
    res.json({ success: true, data: result });
  } catch (err) {
    const status = err.message.includes('not licensed') ? 403 : err.message.includes('not initialized') ? 503 : 400;
    res.json({ success: false, error: err.message, status });
  }
});

// POST /mcp/events — Emit cross-tier events
router.post('/events', async (req, res) => {
  try {
    const { tenant_id, event, data } = req.body;
    if (!event) return res.status(400).json({ error: 'event name required' });
    const result = await mcp.emitEvent(tenant_id || 'logistics', event, data || {});
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /mcp/tiers — Show tier definitions and pricing
router.get('/tiers', (req, res) => {
  res.json({ success: true, data: {
    tiers: [
      { id: 1, name: 'Load Operations', tagline: 'Find & Price Freight', agents: ['freight_finder', 'rate_engine'], price_per_truck: 149, tools_count: 34 },
      { id: 2, name: 'Fleet Operations', tagline: 'Move & Track', agents: ['dispatch_ai', 'tracking'], price_per_truck: 149, tools_count: 20 },
      { id: 3, name: 'Financial Operations', tagline: 'Bill & Collect', agents: ['billing'], price_per_truck: 149, tools_count: 13 },
      { id: 4, name: 'Compliance & Safety', tagline: 'Stay Legal', agents: ['compliance', 'maintenance'], price_per_truck: 99, tools_count: 18 },
      { id: 5, name: 'Neural Intelligence', tagline: 'The Brain', agents: ['neural'], price_per_truck: 149, tools_count: 7 },
    ],
    packages: [
      { name: 'Broker Starter', tiers: [1], price_per_truck: 149 },
      { name: 'Carrier Essentials', tiers: [2, 4], price_per_truck: 248 },
      { name: 'Broker Pro', tiers: [1, 3], price_per_truck: 279 },
      { name: 'Full Operations', tiers: [1, 2, 3, 4], price_per_truck: 449 },
      { name: 'FreightMind Complete', tiers: [1, 2, 3, 4, 5], price_per_truck: 699, includes: ['voice', 'treatment'] },
    ],
    addons: [
      { name: 'Voice AI', price: '$0.15/min or minute packs' },
      { name: 'Treatment Module', price: '$99/truck/month', requires: 'Tier 5 + 1 operational tier' },
      { name: 'Custom Consulting', price: '$250/hour' },
    ]
  }});
});

module.exports = router;
