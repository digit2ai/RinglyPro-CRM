'use strict';

/**
 * AgroMercadoDigital — national agricultural marketplace for Venezuela.
 * Developed by ISTC (Ingeniería y Servicios Tecnológicos Colón); AI layer by
 * Digit2AI. Self-contained Express Router mounted at /agromercado.
 *
 * Phases: Auth · Products/Categories · Live Auctions · FX (BCV) · Services
 * (KYC/Directory/Farms/Financing/Logistics + WhatsApp) · AI layer + Dashboard.
 * Every table is multi-tenant (am_* prefix). Tables auto-create on boot.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const router = express.Router();

const { sequelize } = require('./models');
const { loadUser } = require('./middleware/auth');
const { startScheduler, pollOnce } = require('./services/fxPoller');
const { seedSampleData } = require('./services/seed');

const publicDir = path.join(__dirname, '..', 'public');

// ── Body parsing + cookie-derived user (scoped to this router) ──────────────
router.use(express.json({ limit: '15mb' }));
router.use(express.urlencoded({ extended: true }));
router.use(loadUser);

// ── API routes ──────────────────────────────────────────────────────────────
router.use('/health', require('./routes/health'));
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/api/v1/products', require('./routes/products'));
router.use('/api/v1/subastas', require('./routes/subastas'));
router.use('/api/v1/divisas', require('./routes/divisas'));
router.use('/api/v1/services', require('./routes/services'));
router.use('/api/v1/ai', require('./routes/ai'));

// /categories is a top-level convenience alias for the products route handler
router.use('/api/v1/categories', (req, res, next) => { req.url = '/categories' + (req.url === '/' ? '' : req.url); next(); }, require('./routes/products'));

// ── Static admin/ops dashboard (single self-contained HTML, no build) ───────
router.use(express.static(publicDir));
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'dashboard.html')));

// ── Init: sync tables, start FX scheduler, optional demo seed (non-blocking) ─
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  AgroMercado database tables synced (am_*)');
    startScheduler();
    // Persist an initial FX snapshot if a source is configured.
    if (process.env.AGROMERCADO_FX_SOURCE_URL) { pollOnce().catch(() => {}); }
    if (process.env.AGROMERCADO_SEED_DEMO === '1') {
      try {
        const r = await seedSampleData();
        console.log(r.seeded ? `  AgroMercado seeded demo (${r.products} products)` : `  AgroMercado demo present (${r.products} products)`);
      } catch (seedErr) { console.error('  AgroMercado seed error:', seedErr.message); }
    }
  } catch (e) {
    console.error('  AgroMercado init error:', e.message);
  }
})();

module.exports = router;
