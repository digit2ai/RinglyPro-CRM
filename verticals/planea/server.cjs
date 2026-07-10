/**
 * PLANEA — copiloto financiero personal (Colombia).
 * Self-contained static mount for the Ionic React + Vite SPA.
 *
 * The app is a pure client-side SPA that talks directly to its own Supabase
 * backend (auth + Postgres + edge functions) — see src/configurations/supabase.ts.
 * There is NO server-side API here; this module only serves the built `dist/`
 * under /planea with an SPA history fallback.
 *
 * Mounted in src/app.js:  app.use('/planea', require('../verticals/planea/server.cjs'));
 * NOTE: this folder's package.json is "type":"module", so this file MUST be .cjs
 * to be require()-able from the CommonJS main CRM app.
 * Built by build.sh (skips if dist/ already committed).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const distDir = path.join(__dirname, 'dist');
const indexHtml = path.join(distDir, 'index.html');
const hasBuild = fs.existsSync(indexHtml);

// Health check — GET /planea/health
router.get('/health', (req, res) => {
  res.json({
    service: 'planea',
    status: hasBuild ? 'ok' : 'no-build',
    app: 'Planea - copiloto financiero personal',
    dist: hasBuild,
    ts: new Date().toISOString(),
  });
});

if (hasBuild) {
  // Static assets (/planea/assets/*, /planea/images/*, /planea/manifest.json, etc.)
  router.use(express.static(distDir, { index: false, maxAge: '1h' }));

  // SPA history fallback — any non-file route returns index.html so the
  // client router (basename="/planea") can take over (/planea/score, /home, ...).
  router.get('*', (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(indexHtml);
  });
} else {
  router.get('*', (req, res) => {
    res
      .status(503)
      .type('html')
      .send('<h1>Planea</h1><p>Build no encontrado. Ejecuta el build (build.sh o npm run build en verticals/planea).</p>');
  });
}

module.exports = router;
