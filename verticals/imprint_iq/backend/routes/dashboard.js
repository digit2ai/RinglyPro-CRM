const express = require('express');
const router = express.Router();
const sequelize = require('../services/db.iq');

const TENANT = 'imprint_iq';

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// GET /kpis — Main dashboard KPI cards
router.get('/kpis', asyncHandler(async (req, res) => {
  const tenantId = req.query.tenant_id || TENANT;

  const [quotes, orders, production, customers, calls, inventory] = await Promise.all([
    sequelize.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM iq_quotes WHERE tenant_id = $1 AND stage IN ('draft','sent')`, { bind: [tenantId] }).then(r => r[0][0]),
    sequelize.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM iq_orders WHERE tenant_id = $1 AND stage NOT IN ('delivered','cancelled')`, { bind: [tenantId] }).then(r => r[0][0]),
    sequelize.query(`SELECT COUNT(*) as cnt FROM iq_production_jobs WHERE tenant_id = $1 AND stage IN ('queued','setup','running')`, { bind: [tenantId] }).then(r => r[0][0]),
    sequelize.query(`SELECT COUNT(*) as cnt FROM iq_customers WHERE tenant_id = $1 AND status = 'active'`, { bind: [tenantId] }).then(r => r[0][0]),
    sequelize.query(`SELECT COUNT(*) as cnt FROM iq_calls WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'`, { bind: [tenantId] }).then(r => r[0][0]),
    sequelize.query(`SELECT SUM(CASE WHEN qty_on_hand <= reorder_point AND reorder_point > 0 THEN 1 ELSE 0 END) as low_stock FROM iq_inventory WHERE tenant_id = $1`, { bind: [tenantId] }).then(r => r[0][0])
  ]);

  res.json({
    success: true,
    kpis: [
      { label: 'Open Quotes', value: parseInt(quotes.cnt), detail: `$${Math.round(parseFloat(quotes.total)).toLocaleString()} pipeline`, icon: '📋' },
      { label: 'Active Orders', value: parseInt(orders.cnt), detail: `$${Math.round(parseFloat(orders.total)).toLocaleString()} in production`, icon: '📦' },
      { label: 'Production Jobs', value: parseInt(production.cnt), detail: 'In progress', icon: '🏭' },
      { label: 'Active Customers', value: parseInt(customers.cnt), detail: 'Account base', icon: '👥' },
      { label: 'Calls Today', value: parseInt(calls.cnt), detail: 'Voice AI activity', icon: '📞' },
      { label: 'Low Stock Alerts', value: parseInt(inventory.low_stock || 0), detail: 'Below reorder point', icon: '⚠️' }
    ]
  });
}));

// GET /recent-orders — Latest orders
router.get('/recent-orders', asyncHandler(async (req, res) => {
  const tenantId = req.query.tenant_id || TENANT;
  const [rows] = await sequelize.query(`
    SELECT o.*, c.company_name FROM iq_orders o
    LEFT JOIN iq_customers c ON o.customer_id = c.id
    WHERE o.tenant_id = $1 ORDER BY o.created_at DESC LIMIT 10
  `, { bind: [tenantId] });
  res.json({ success: true, orders: rows });
}));

// GET /recent-calls — Latest calls
router.get('/recent-calls', asyncHandler(async (req, res) => {
  const tenantId = req.query.tenant_id || TENANT;
  const [rows] = await sequelize.query(`
    SELECT cl.*, c.company_name FROM iq_calls cl
    LEFT JOIN iq_customers c ON cl.customer_id = c.id
    WHERE cl.tenant_id = $1 ORDER BY cl.created_at DESC LIMIT 10
  `, { bind: [tenantId] });
  res.json({ success: true, calls: rows });
}));

// GET /agents — AI agent status
router.get('/agents', asyncHandler(async (req, res) => {
  const tenantId = req.query.tenant_id || TENANT;

  const [sessions] = await sequelize.query(`
    SELECT agent_type, COUNT(*) as total_sessions, MAX(created_at) as last_active
    FROM iq_agent_sessions WHERE tenant_id = $1 GROUP BY agent_type
  `, { bind: [tenantId] });

  const agents = [
    { id: 'catalog', name: 'Catalog Intelligence', icon: '📚', description: 'Product tagging, trend prediction, catalog curation' },
    { id: 'quote_engine', name: 'Quote Engine', icon: '💰', description: 'NL quote generation, pricing, volume breaks' },
    { id: 'art_director', name: 'Art Director', icon: '🎨', description: 'Artwork preflight, virtual proofs, color matching' },
    { id: 'production', name: 'Production Orchestrator', icon: '🏭', description: 'Job routing, scheduling, bottleneck detection' },
    { id: 'supply_chain', name: 'Supply Chain', icon: '🚚', description: 'Inventory, auto-reorder, supplier scoring' },
    { id: 'qc', name: 'QC Vision', icon: '🔍', description: 'Visual inspection, defect detection, color delta' },
    { id: 'fulfillment', name: 'Fulfillment', icon: '📬', description: 'Carrier selection, tracking, kitting' },
    { id: 'customer_voice', name: 'Customer Voice', icon: '🎙️', description: 'Rachel/Ana/Lina — inbound/outbound calls' },
    { id: 'sales_intel', name: 'Sales Intelligence', icon: '📊', description: 'Lead scoring, pipeline, win/loss analysis' },
    { id: 'finance', name: 'Finance & Billing', icon: '🧾', description: 'Invoicing, collections, margin analysis' },
    { id: 'compliance', name: 'Compliance', icon: '🛡️', description: 'CPSIA, Prop 65, import compliance, recalls' }
  ];

  const sessionMap = {};
  sessions.forEach(s => { sessionMap[s.agent_type] = s; });

  const enriched = agents.map(a => ({
    ...a,
    status: sessionMap[a.id] ? 'active' : 'standby',
    totalSessions: parseInt(sessionMap[a.id]?.total_sessions || 0),
    lastActive: sessionMap[a.id]?.last_active || null
  }));

  res.json({ success: true, agents: enriched });
}));

module.exports = router;
