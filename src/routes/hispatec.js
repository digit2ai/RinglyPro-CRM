// src/routes/hispatec.js -- Main HISPATEC Router
// Mounts all sub-routes for the HISPATEC ecosystem
const express = require('express');
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'HISPATEC Digital Ecosystem',
    version: '1.0.0',
    status: 'operational',
    modules: {
      auth: 'active',
      members: 'active',
      matching: 'active',
      projects: 'active',
      exchange: 'active',
      payments: 'active',
      metrics: 'active',
      mcp: 'active'
    },
    timestamp: new Date().toISOString()
  });
});

// Mount sub-routes
try {
  const authRoutes = require('./hispatec-auth');
  router.use('/auth', authRoutes);
  console.log('  [HISPATEC] Auth routes mounted');
} catch (e) {
  console.error('  [HISPATEC] Auth routes failed:', e.message);
}

try {
  const memberRoutes = require('./hispatec-members');
  router.use('/members', memberRoutes);
  console.log('  [HISPATEC] Member routes mounted');
} catch (e) {
  console.error('  [HISPATEC] Member routes failed:', e.message);
}

try {
  const matchingRoutes = require('./hispatec-matching');
  router.use('/match', matchingRoutes);
  console.log('  [HISPATEC] Matching routes mounted');
} catch (e) {
  console.error('  [HISPATEC] Matching routes failed:', e.message);
}

try {
  const projectRoutes = require('./hispatec-projects');
  router.use('/projects', projectRoutes);
  console.log('  [HISPATEC] Project routes mounted');
} catch (e) {
  console.error('  [HISPATEC] Project routes failed:', e.message);
}

try {
  const exchangeRoutes = require('./hispatec-exchange');
  router.use('/exchange', exchangeRoutes);
  console.log('  [HISPATEC] Exchange routes mounted');
} catch (e) {
  console.error('  [HISPATEC] Exchange routes failed:', e.message);
}

try {
  const paymentRoutes = require('./hispatec-payments');
  router.use('/payments', paymentRoutes);
  console.log('  [HISPATEC] Payment routes mounted');
} catch (e) {
  console.error('  [HISPATEC] Payment routes failed:', e.message);
}

try {
  const metricsRoutes = require('./hispatec-metrics');
  router.use('/metrics', metricsRoutes);
  console.log('  [HISPATEC] Metrics routes mounted');
} catch (e) {
  console.error('  [HISPATEC] Metrics routes failed:', e.message);
}

try {
  const mcpRoutes = require('./hispatec-mcp');
  router.use('/mcp', mcpRoutes);
  console.log('  [HISPATEC] MCP routes mounted');
} catch (e) {
  console.error('  [HISPATEC] MCP routes failed:', e.message);
}

try {
  const adminRoutes = require('./hispatec-admin');
  router.use('/admin', adminRoutes);
  console.log('  [HISPATEC] Admin routes mounted');
} catch (e) {
  console.error('  [HISPATEC] Admin routes failed:', e.message);
}

module.exports = router;
