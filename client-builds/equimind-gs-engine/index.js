// =====================================================
// EquiMind 3DGS Engine — Express sub-app (EQUIMIND-3DGS-001).
// Auto-mounted by src/app.js at /equimind-gs-engine.
//   GET  /health                     -> module health (db, storage, provider)
//   POST /api/v1/mcp/tools/call       -> MCP tool dispatcher (7 gs.* tools)
//   GET  /api/v1/mcp/tools/list       -> tool catalog
//   /api/v1/*                         -> REST (sessions, upload, process, jobs, scenes, ops)
//   /files                            -> disk-backed signed asset serving
//   /viewer /capture /admin           -> product surfaces (bilingual)
// Reuses the EquiMind account/credit system for multi-tenant auth + billing.
// =====================================================
'use strict';

const express = require('express');
const path = require('path');

const gs = require('./models/gs');
const account = require('../evaluacion-del-caballo-de-paso-fino/models/account');
const queue = require('./lib/queue');
const storage = require('./lib/storage');
const provider = require('./lib/provider');
const scenes = require('./routes/scenes');
const mcp = require('./routes/mcp');
const pages = require('./routes/pages');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); next(); });
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));

// Boot data layers (idempotent; memory fallback). Account may already be inited
// by the paso-fino app — init() is guarded so this is safe.
gs.init().then((s) => console.log(JSON.stringify({ svc: 'equimind-gs-engine', event: 'gs_init', mode: s.mode }))).catch(() => {});
account.init().then(() => {}).catch(() => {});
queue.startWorker();

app.get('/health', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const dbMode = gs.mode();
  const providerReal = provider.name() !== 'mock';
  res.json({
    status: (isProd && dbMode === 'memory') ? 'degraded' : 'ok',
    service: 'equimind-gs-engine', version: '1.0.0', env: process.env.NODE_ENV || 'development',
    db: dbMode, storage: storage.backend(), provider: provider.name(),
    provider_real: providerReal,
    note: providerReal ? 'real splatting provider active' : 'MOCK provider: placeholder splats (is_simulated). See BLOCKERS.md — needs LUMA_API_KEY or GPU worker.'
  });
});

app.use('/api/v1/mcp', mcp);
app.use('/files', scenes.filesRouter);
app.use('/api/v1', scenes);
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/', pages);

module.exports = app;

if (require.main === module) {
  const PORT = process.env.GS_PORT || 4099;
  app.listen(PORT, () => console.log('equimind-gs-engine on :' + PORT));
}
