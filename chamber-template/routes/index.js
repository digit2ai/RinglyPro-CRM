/**
 * Chamber Template - Main Router Factory
 * Creates an Express router for a chamber instance from config.
 */
const express = require('express');

function createChamberRouter(config) {
  const router = express.Router();
  const slug = config.slug;
  const name = config.name;

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      service: `${name} Digital Ecosystem`,
      slug,
      version: '1.0.0',
      status: 'operational',
      modules: {
        auth: 'active', members: 'active', matching: 'active',
        projects: 'active', exchange: 'active', payments: 'active',
        metrics: 'active', mcp: 'active', admin: 'active'
      },
      timestamp: new Date().toISOString()
    });
  });

  const modules = [
    { path: '/auth', factory: require('./auth'), label: 'Auth' },
    { path: '/members', factory: require('./members'), label: 'Members' },
    { path: '/match', factory: require('./matching'), label: 'Matching' },
    { path: '/projects', factory: require('./projects'), label: 'Projects' },
    { path: '/exchange', factory: require('./exchange'), label: 'Exchange' },
    { path: '/payments', factory: require('./payments'), label: 'Payments' },
    { path: '/metrics', factory: require('./metrics'), label: 'Metrics' },
    { path: '/mcp', factory: require('./mcp'), label: 'MCP' },
    { path: '/admin', factory: require('./admin'), label: 'Admin' }
  ];

  // P2B Stage 3 -- private workspace MUST mount BEFORE projects
  // because /projects/:id/workspace shares the /projects prefix
  try {
    const createWorkspaceRoutes = require('./workspace');
    router.use('/projects/:id/workspace', createWorkspaceRoutes(config));
    console.log(`  [${slug.toUpperCase()}] Workspace (P2B Stage 3) routes mounted`);
  } catch (e) {
    console.error(`  [${slug.toUpperCase()}] Workspace routes failed:`, e.message);
  }

  for (const mod of modules) {
    try {
      router.use(mod.path, mod.factory(config));
      console.log(`  [${slug.toUpperCase()}] ${mod.label} routes mounted`);
    } catch (e) {
      console.error(`  [${slug.toUpperCase()}] ${mod.label} routes failed:`, e.message);
    }
  }

  return router;
}

module.exports = createChamberRouter;
