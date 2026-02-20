#!/usr/bin/env node
'use strict';

/**
 * Ronin Brotherhood Ecosystem - API Server
 * Martial Arts Federation | Online Store | RPDTA Training | Membership
 *
 * Mounted at: /ronin
 *
 * Groups: RGRK | IRMAF | RPDTA | Red Belt Society | Ronin MMA
 * 1,000+ Black Belts | 28 Countries | Founded by Hanshi Carlos H. Montalvo
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Import middleware
const errorHandler = require('./middleware/error-handler');
const notFound = require('./middleware/not-found');

// Initialize Express app
const app = express();
const BASE_PATH = process.env.RONIN_BASE_PATH || '';

// Dashboard static files path
const dashboardDistPath = path.join(__dirname, '..', 'dashboard', 'dist');
console.log('🥋 Ronin Brotherhood: Checking dashboard at:', dashboardDistPath);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

app.use((req, res, next) => {
  req.id = Math.random().toString(36).substring(7);
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

let healthRoutes, memberRoutes, productRoutes, cartRoutes, orderRoutes,
    trainingRoutes, eventRoutes, sponsorRoutes, groupRoutes, pressRoutes, adminRoutes,
    bridgeKanchoRoutes;
let routesLoaded = false;

try {
  healthRoutes = require('./routes/health');
  memberRoutes = require('./routes/members');
  productRoutes = require('./routes/products');
  cartRoutes = require('./routes/cart');
  orderRoutes = require('./routes/orders');
  trainingRoutes = require('./routes/training');
  eventRoutes = require('./routes/events');
  sponsorRoutes = require('./routes/sponsors');
  groupRoutes = require('./routes/groups');
  pressRoutes = require('./routes/press');
  adminRoutes = require('./routes/admin');
  bridgeKanchoRoutes = require('./routes/bridge-kancho');
  routesLoaded = true;
  console.log('✅ Ronin Brotherhood routes loaded successfully');

  // Auto-sync database tables on startup
  const models = require('../models');
  models.sequelize.sync({ alter: false }).then(async () => {
    console.log('✅ Ronin Brotherhood database tables synced');

    // Bridge columns migration - add columns if they don't exist
    const bridgeMigrations = [
      `ALTER TABLE ronin_members ADD COLUMN IF NOT EXISTS kancho_school_id INTEGER`,
      `ALTER TABLE ronin_members ADD COLUMN IF NOT EXISTS ringlypro_client_id INTEGER`
    ];
    for (const sql of bridgeMigrations) {
      try { await models.sequelize.query(sql); } catch (e) {}
    }
    console.log('✅ Ronin Brotherhood bridge columns migration complete');
  }).catch(err => {
    console.log('⚠️ Ronin Brotherhood database sync warning:', err.message);
  });
} catch (error) {
  console.log('⚠️ Some Ronin Brotherhood routes failed to load:', error.message);
  console.log('   Error stack:', error.stack);
}

// Diagnostic endpoint
app.get(`${BASE_PATH}/diagnostic`, (req, res) => {
  const distPath = path.join(__dirname, '..', 'dashboard', 'dist');
  const distExists = fs.existsSync(distPath);
  const files = distExists ? fs.readdirSync(distPath) : [];
  res.json({
    service: 'Ronin Brotherhood Ecosystem',
    __dirname,
    distPath,
    distExists,
    files,
    BASE_PATH,
    cwd: process.cwd(),
    routesLoaded
  });
});

// Mount routes if loaded
if (routesLoaded) {
  app.use(`${BASE_PATH}/health`, healthRoutes);

  // API v1 routes
  app.use(`${BASE_PATH}/api/v1/admin`, adminRoutes);
  app.use(`${BASE_PATH}/api/v1/members`, memberRoutes);
  app.use(`${BASE_PATH}/api/v1/products`, productRoutes);
  app.use(`${BASE_PATH}/api/v1/cart`, cartRoutes);
  app.use(`${BASE_PATH}/api/v1/orders`, orderRoutes);
  app.use(`${BASE_PATH}/api/v1/training`, trainingRoutes);
  app.use(`${BASE_PATH}/api/v1/events`, eventRoutes);
  app.use(`${BASE_PATH}/api/v1/sponsors`, sponsorRoutes);
  app.use(`${BASE_PATH}/api/v1/groups`, groupRoutes);
  app.use(`${BASE_PATH}/api/v1/press`, pressRoutes);
  app.use(`${BASE_PATH}/api/v1/bridge/kancho`, bridgeKanchoRoutes);

  console.log('🥋 Ronin Brotherhood API routes mounted:');
  console.log('   - /health');
  console.log('   - /api/v1/admin');
  console.log('   - /api/v1/members');
  console.log('   - /api/v1/products');
  console.log('   - /api/v1/cart');
  console.log('   - /api/v1/orders');
  console.log('   - /api/v1/training');
  console.log('   - /api/v1/events');
  console.log('   - /api/v1/sponsors');
  console.log('   - /api/v1/groups');
  console.log('   - /api/v1/press');
  console.log('   - /api/v1/bridge/kancho');
} else {
  app.get(`${BASE_PATH}/health`, (req, res) => {
    res.json({
      status: 'partial',
      message: 'Ronin Brotherhood running without database',
      timestamp: new Date().toISOString(),
      dashboard: 'available',
      api: 'limited'
    });
  });
}

// ============================================================================
// DASHBOARD - Serve React app or fallback landing page
// ============================================================================

if (fs.existsSync(dashboardDistPath)) {
  console.log('📊 Serving Ronin Brotherhood dashboard from:', dashboardDistPath);
  app.use(`${BASE_PATH}/`, express.static(dashboardDistPath));

  app.get(`${BASE_PATH}/*`, (req, res, next) => {
    if (req.path.startsWith(`${BASE_PATH}/api/`) ||
        req.path.startsWith(`${BASE_PATH}/health`) ||
        req.path.startsWith(`${BASE_PATH}/diagnostic`)) {
      return next();
    }
    const indexPath = path.join(dashboardDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
} else {
  console.log('⚠️ Ronin Brotherhood dashboard not built, serving landing page');

  // Serve a professional Ronin Brotherhood landing page
  app.get(`${BASE_PATH}/`, (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ronin Brotherhood - Martial Arts Federation</title>
  <meta name="description" content="Ronin Brotherhood LLC - 1,000+ Black Belts from 28 Countries. Martial Arts Federation, Online Store, RPDTA Tactical Training.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #0a0a0a; --panel: #1a1a1a; --accent: #d10404; --gold: #c4a35a; --text: #fff; --muted: #999; --line: #2a2a2a; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    .container { max-width: 1120px; margin: 0 auto; padding: 0 20px; }

    header { position: fixed; top: 0; left: 0; right: 0; z-index: 50; background: rgba(10,10,10,.95); border-bottom: 1px solid var(--line); backdrop-filter: blur(10px); }
    .header-inner { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); }
    .brand-logo { height: 64px; width: auto; object-fit: contain; display: block; }
    .brand-sub { font-size: 9px; color: var(--muted); letter-spacing: .12em; text-transform: uppercase; margin-top: 2px; }
    nav { display: flex; gap: 20px; }
    nav a { color: var(--muted); text-decoration: none; font-size: 13px; font-weight: 500; }
    nav a:hover { color: var(--accent); }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; transition: all .2s; border: none; cursor: pointer; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #ff1a1a; }
    .btn-gold { background: transparent; color: var(--gold); border: 2px solid var(--gold); }
    .btn-gold:hover { background: var(--gold); color: #000; }

    .hero { min-height: 120vh; display: flex; align-items: center; padding-top: 80px; background: linear-gradient(to right, rgba(10,10,10,.5) 0%, rgba(10,10,10,.3) 50%, rgba(10,10,10,.1) 100%), url('https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6997c4dc145ac095a4d2ee05.png'); background-size: cover; background-position: 70% 35%; }
    .hero-content { max-width: 680px; }
    .hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--gold); color: var(--gold); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 20px; }
    .hero h1 { font-family: 'Noto Serif', serif; font-size: clamp(32px, 5vw, 52px); font-weight: 700; line-height: 1.15; margin-bottom: 16px; }
    .hero h1 .highlight { color: var(--accent); }
    .hero p { color: var(--muted); font-size: 18px; margin-bottom: 28px; max-width: 560px; }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .hero-quote { margin-top: 40px; padding: 16px 20px; border-left: 3px solid var(--gold); }
    .hero-quote p { font-family: 'Noto Serif', serif; font-style: italic; color: var(--muted); font-size: 15px; margin-bottom: 4px; }
    .hero-quote cite { color: #555; font-size: 12px; }

    .photo-strip { padding: 32px 0; overflow: hidden; background: #fff; border-top: 1px solid var(--line); }
    .photo-strip-inner { display: flex; align-items: center; justify-content: center; gap: 36px; max-width: 1100px; margin: 0 auto; padding: 0 20px; }
    .photo-strip-inner img { height: 150px; width: auto; object-fit: contain; display: block; transition: transform .3s; }
    .photo-strip-inner img:hover { transform: scale(1.08); }
    @media (max-width: 768px) { .photo-strip-inner { gap: 16px; flex-wrap: wrap; } .photo-strip-inner img { height: 90px; } }

    .stats { padding: 48px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: #0e0e0e; }
    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
    .stat { text-align: center; padding: 16px; }
    .stat-num { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, var(--accent), var(--gold)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; margin-top: 4px; }

    .section { padding: 64px 0; }
    .section-title { font-family: 'Noto Serif', serif; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .section-sub { color: var(--muted); margin-bottom: 32px; }

    .groups-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .group-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px; transition: border-color .2s; }
    .group-card:hover { border-color: var(--accent); }
    .group-code { font-size: 11px; color: var(--accent); font-weight: 700; letter-spacing: .1em; margin-bottom: 4px; }
    .group-name { font-weight: 700; font-size: 16px; margin-bottom: 8px; }
    .group-desc { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .group-meta { display: flex; gap: 16px; margin-top: 12px; font-size: 12px; color: #666; }

    .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .product-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; transition: transform .2s, border-color .2s; text-decoration: none; color: var(--text); }
    .product-card:hover { transform: translateY(-4px); border-color: var(--accent); }
    .product-img { width: 100%; height: 180px; background: #222; display: flex; align-items: center; justify-content: center; color: #444; font-size: 48px; }
    .product-info { padding: 14px; }
    .product-cat { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
    .product-name { font-weight: 600; font-size: 14px; margin: 4px 0; }
    .product-price { color: var(--accent); font-weight: 700; font-size: 16px; }

    .courses-list { display: grid; gap: 12px; }
    .course-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px; display: flex; justify-content: space-between; align-items: center; transition: border-color .2s; }
    .course-card:hover { border-color: var(--accent); }
    .course-info h3 { font-size: 15px; font-weight: 600; }
    .course-meta { display: flex; gap: 16px; margin-top: 4px; font-size: 12px; color: var(--muted); }
    .course-price { font-size: 20px; font-weight: 800; color: var(--gold); }

    /* Groups showcase banner */
    .groups-banner { position: relative; overflow: hidden; background: #000; }
    .groups-banner-img { width: 100%; display: block; }
    .groups-banner-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,.3) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,.5) 100%); pointer-events: none; }
    .groups-banner-label { position: absolute; bottom: 24px; left: 0; right: 0; text-align: center; z-index: 2; }
    .groups-banner-label h2 { font-family: 'Noto Serif', serif; font-size: 28px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: .1em; text-shadow: 0 2px 20px rgba(0,0,0,.8); }
    .groups-banner-label .banner-sub { font-size: 13px; color: rgba(255,255,255,.7); letter-spacing: .06em; margin-top: 6px; }
    .groups-banner-corners span { position: absolute; width: 28px; height: 28px; z-index: 3; pointer-events: none; }
    .groups-banner-corners .tl { top: 12px; left: 12px; border-top: 2px solid var(--accent); border-left: 2px solid var(--accent); }
    .groups-banner-corners .tr { top: 12px; right: 12px; border-top: 2px solid var(--accent); border-right: 2px solid var(--accent); }
    .groups-banner-corners .bl { bottom: 12px; left: 12px; border-bottom: 2px solid var(--accent); border-left: 2px solid var(--accent); }
    .groups-banner-corners .br { bottom: 12px; right: 12px; border-bottom: 2px solid var(--accent); border-right: 2px solid var(--accent); }
    @media (max-width: 768px) { .groups-banner-label h2 { font-size: 20px; } .groups-banner-label { bottom: 16px; } }

    .cta-section { padding: 48px 0; background: linear-gradient(135deg, rgba(209,4,4,.08), rgba(196,163,90,.05)); border-top: 1px solid var(--line); }
    .cta-inner { text-align: center; max-width: 600px; margin: 0 auto; }
    .cta-inner h2 { font-family: 'Noto Serif', serif; font-size: 24px; margin-bottom: 8px; }
    .cta-inner p { color: var(--muted); margin-bottom: 20px; }

    footer { border-top: 1px solid var(--line); padding: 24px 0; }
    .footer-inner { display: flex; justify-content: space-between; align-items: center; }
    .footer-copy { color: var(--muted); font-size: 12px; }
    .footer-links { display: flex; gap: 16px; }
    .footer-links a { color: #555; text-decoration: none; font-size: 12px; }
    .footer-links a:hover { color: var(--accent); }

    /* Auth buttons in header */
    .header-auth { display: flex; align-items: center; gap: 10px; }
    .btn-login { background: transparent; color: var(--gold); border: 1px solid var(--gold); padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .2s; text-decoration: none; }
    .btn-login:hover { background: var(--gold); color: #000; }
    .btn-join { background: var(--accent); color: #fff; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; border: none; transition: all .2s; text-decoration: none; }
    .btn-join:hover { background: #ff1a1a; }

    /* Modal overlay */
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.7); z-index: 100; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
    .modal-overlay.active { display: flex; }
    .modal { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; width: 420px; max-width: 95vw; max-height: 90vh; overflow-y: auto; padding: 32px; position: relative; animation: modalIn .25s ease; }
    @keyframes modalIn { from { opacity: 0; transform: translateY(20px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .modal-close { position: absolute; top: 12px; right: 16px; background: none; border: none; color: var(--muted); font-size: 22px; cursor: pointer; padding: 4px 8px; }
    .modal-close:hover { color: #fff; }
    .modal h2 { font-family: 'Noto Serif', serif; font-size: 22px; margin-bottom: 4px; }
    .modal .modal-sub { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
    .modal .form-group { margin-bottom: 14px; }
    .modal label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 5px; }
    .modal input, .modal select { width: 100%; padding: 10px 12px; background: #111; border: 1px solid var(--line); border-radius: 8px; color: #fff; font-size: 14px; font-family: inherit; outline: none; transition: border-color .2s; }
    .modal input:focus, .modal select:focus { border-color: var(--accent); }
    .modal select option { background: #111; }
    .modal .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .modal .btn-submit { width: 100%; padding: 12px; background: var(--accent); color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 6px; transition: all .2s; }
    .modal .btn-submit:hover { background: #ff1a1a; }
    .modal .btn-submit:disabled { opacity: .5; cursor: not-allowed; }
    .modal .switch-link { text-align: center; margin-top: 14px; font-size: 13px; color: var(--muted); }
    .modal .switch-link a { color: var(--gold); cursor: pointer; text-decoration: none; }
    .modal .switch-link a:hover { text-decoration: underline; }
    .modal .form-error { background: rgba(209,4,4,.15); border: 1px solid rgba(209,4,4,.3); color: #ff6b6b; padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; display: none; }
    .modal .form-success { background: rgba(4,180,4,.12); border: 1px solid rgba(4,180,4,.3); color: #6bff6b; padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; display: none; }

    /* Member dashboard panel */
    .member-panel { display: none; }
    .member-panel.active { display: block; }
    .dash-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .dash-header h2 { font-family: 'Noto Serif', serif; font-size: 24px; }
    .dash-header .btn-logout { background: transparent; border: 1px solid var(--line); color: var(--muted); padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; }
    .dash-header .btn-logout:hover { border-color: var(--accent); color: var(--accent); }
    .dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .dash-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
    .dash-card h3 { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
    .dash-card .dash-val { font-size: 28px; font-weight: 800; }
    .dash-card .dash-val.grade-a { color: #22c55e; }
    .dash-card .dash-val.grade-b { color: #84cc16; }
    .dash-card .dash-val.grade-c { color: var(--gold); }
    .dash-card .dash-val.grade-d { color: #f97316; }
    .dash-card .dash-val.grade-f { color: var(--accent); }
    .dash-card .dash-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .dash-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .dash-actions .btn { font-size: 13px; padding: 8px 16px; }

    /* Dojo registration form */
    .dojo-form { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px; margin-top: 16px; }
    .dojo-form h3 { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
    .dojo-form .dojo-sub { color: var(--muted); font-size: 13px; margin-bottom: 16px; }
    .dojo-form .form-group { margin-bottom: 12px; }
    .dojo-form label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px; }
    .dojo-form input, .dojo-form select { width: 100%; padding: 9px 12px; background: #111; border: 1px solid var(--line); border-radius: 8px; color: #fff; font-size: 14px; font-family: inherit; outline: none; }
    .dojo-form input:focus, .dojo-form select:focus { border-color: var(--accent); }
    .dojo-form .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

    /* Founder section */
    .founder-section { padding: 80px 0; background: #000; position: relative; overflow: hidden; }
    .founder-section::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 50%, rgba(200,16,46,.06) 0%, transparent 70%); pointer-events: none; }
    .founder-inner { display: grid; grid-template-columns: 400px 1fr; gap: 48px; align-items: center; max-width: 1000px; margin: 0 auto; padding: 0 20px; }
    .founder-photo { position: relative; }
    .founder-photo img { width: 100%; border-radius: 4px; display: block; box-shadow: 0 0 40px rgba(0,0,0,.6), 0 0 80px rgba(200,16,46,.1); }
    .founder-photo::before { content: ''; position: absolute; inset: -6px; border: 1px solid rgba(200,16,46,.2); border-radius: 6px; pointer-events: none; }
    .founder-photo::after { content: ''; position: absolute; bottom: -3px; left: 10%; right: 10%; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); }
    .founder-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--gold); color: var(--gold); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 16px; }
    .founder-name { font-family: 'Noto Serif', serif; font-size: 36px; font-weight: 700; color: #fff; line-height: 1.15; margin-bottom: 6px; }
    .founder-titles { color: var(--accent); font-size: 14px; font-weight: 600; letter-spacing: .05em; margin-bottom: 6px; }
    .founder-titles span { color: var(--gold); }
    .founder-role { color: var(--muted); font-size: 13px; letter-spacing: .04em; margin-bottom: 24px; }
    .founder-bio p { color: #b0b0b0; font-size: 14px; line-height: 1.8; margin-bottom: 14px; }
    .founder-bio p:first-letter { font-size: 18px; font-weight: 700; color: #fff; }
    .founder-kanji { position: absolute; top: 20px; right: -30px; font-size: 160px; color: rgba(200,16,46,.04); font-family: 'Noto Serif', serif; pointer-events: none; line-height: 1; writing-mode: vertical-rl; }
    @media (max-width: 768px) {
      .founder-inner { grid-template-columns: 1fr; gap: 32px; }
      .founder-photo { max-width: 320px; margin: 0 auto; }
      .founder-name { font-size: 28px; }
      .founder-kanji { display: none; }
    }

    /* KanchoAI pricing section */
    .kancho-section { padding: 80px 0; background: linear-gradient(180deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%); position: relative; overflow: hidden; }
    .kancho-section::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); }
    .kancho-header { text-align: center; margin-bottom: 48px; }
    .kancho-header img { height: 160px; margin-bottom: 24px; }
    .kancho-header h2 { font-family: 'Noto Serif', serif; font-size: 28px; color: #fff; margin-bottom: 8px; }
    .kancho-header h2 .ka-accent { color: var(--accent); }
    .kancho-header p { color: var(--muted); font-size: 14px; max-width: 600px; margin: 0 auto; line-height: 1.6; }
    .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1000px; margin: 0 auto; }
    .price-card { background: rgba(20,20,20,.9); border: 1px solid var(--line); border-radius: 12px; padding: 32px 28px; position: relative; display: flex; flex-direction: column; }
    .price-card.popular { border-color: var(--accent); box-shadow: 0 0 40px rgba(200,16,46,.12); }
    .price-card .popular-badge { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; padding: 5px 18px; border-radius: 999px; }
    .price-card h3 { font-family: 'Noto Serif', serif; font-size: 20px; color: #fff; margin-bottom: 4px; }
    .price-card .price-sub { font-size: 12px; color: var(--muted); margin-bottom: 20px; }
    .price-card .price-amount { margin-bottom: 24px; }
    .price-card .price-amount .price-num { font-size: 42px; font-weight: 800; color: var(--accent); }
    .price-card .price-amount .price-period { font-size: 14px; color: var(--muted); }
    .price-card .price-amount .price-custom { font-size: 36px; font-weight: 800; color: var(--gold); }
    .price-features { list-style: none; padding: 0; margin: 0 0 28px; flex: 1; }
    .price-features li { padding: 6px 0; font-size: 13px; color: #b0b0b0; display: flex; align-items: flex-start; gap: 10px; line-height: 1.4; }
    .price-features li::before { content: '\\2714'; color: #22c55e; font-size: 13px; flex-shrink: 0; margin-top: 1px; }
    .price-features li.bold { color: #fff; font-weight: 600; }
    .price-btn { display: block; width: 100%; padding: 12px; border-radius: 8px; text-align: center; font-weight: 700; font-size: 14px; text-decoration: none; transition: all .2s; cursor: pointer; border: none; }
    .price-btn-primary { background: var(--accent); color: #fff; }
    .price-btn-primary:hover { background: #ff1a1a; }
    .price-btn-outline { background: transparent; border: 1px solid var(--line); color: #fff; }
    .price-btn-outline:hover { border-color: var(--gold); color: var(--gold); }
    .pricing-note { text-align: center; margin-top: 24px; font-size: 12px; color: var(--muted); }
    @media (max-width: 768px) { .pricing-grid { grid-template-columns: 1fr; max-width: 400px; } }

    /* Cinematic video section */
    .cinema-section { padding: 80px 0; background: #000; position: relative; overflow: hidden; }
    .cinema-section::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 80px; background: linear-gradient(to bottom, #0a0a0a, transparent); z-index: 2; pointer-events: none; }
    .cinema-section::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 80px; background: linear-gradient(to top, #0e0e0e, transparent); z-index: 2; pointer-events: none; }
    .cinema-frame { position: relative; max-width: 900px; margin: 0 auto; padding: 0 20px; }
    .cinema-poster { display: block; width: 100%; max-width: 700px; margin: 0 auto 36px; border-radius: 6px; box-shadow: 0 8px 40px rgba(0,0,0,.6); }
    .tv-shell { position: relative; max-width: 760px; margin: 0 auto; background: linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 30%, #111 60%, #1a1a1a 100%); border-radius: 18px; padding: 28px 28px 48px; box-shadow: 0 10px 60px rgba(0,0,0,.8), 0 0 80px rgba(200,16,46,.08), inset 0 1px 0 rgba(255,255,255,.06); }
    .tv-shell::before { content: ''; position: absolute; inset: 3px; border-radius: 15px; border: 1px solid rgba(255,255,255,.04); pointer-events: none; }
    .tv-bezel { position: relative; border-radius: 8px; overflow: hidden; border: 4px solid #0a0a0a; box-shadow: inset 0 0 20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.05); }
    .tv-screen { position: relative; width: 100%; padding-bottom: 56.25%; background: #000; }
    .tv-screen iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    .tv-screen::after { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,.03) 0%, transparent 50%); pointer-events: none; z-index: 2; }
    .tv-bottom { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 14px; }
    .tv-led { width: 8px; height: 8px; border-radius: 50%; background: #c8102e; box-shadow: 0 0 6px rgba(200,16,46,.6); }
    .tv-brand { font-size: 11px; color: #444; letter-spacing: .2em; text-transform: uppercase; font-weight: 600; }
    .tv-dots { display: flex; gap: 6px; }
    .tv-dots span { width: 5px; height: 5px; border-radius: 50%; background: #333; }
    .tv-stand { width: 120px; height: 6px; background: linear-gradient(to bottom, #2a2a2a, #1a1a1a); margin: 0 auto; border-radius: 0 0 4px 4px; }
    .tv-stand-base { width: 180px; height: 3px; background: #222; margin: 0 auto; border-radius: 0 0 6px 6px; }
    .cinema-title { text-align: center; margin-bottom: 32px; position: relative; z-index: 3; }
    .cinema-title h2 { font-family: 'Noto Serif', serif; font-size: 28px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #fff; }
    .cinema-title .kanji { font-size: 16px; color: var(--accent); letter-spacing: .3em; margin-top: 6px; font-weight: 400; }
    .cinema-title .cinema-line { display: block; width: 60px; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); margin: 14px auto 0; }
    .cinema-brush { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 200px; color: rgba(200,16,46,.04); font-family: 'Noto Serif', serif; pointer-events: none; z-index: 1; white-space: nowrap; }
    .cinema-caption { text-align: center; margin-top: 24px; position: relative; z-index: 3; }
    .cinema-caption p { font-size: 13px; color: var(--muted); font-style: italic; letter-spacing: .04em; }
    @media (max-width: 768px) { .tv-shell { padding: 16px 16px 32px; border-radius: 12px; } .tv-bezel { border-width: 3px; border-radius: 6px; } .cinema-poster { max-width: 90%; } }

    @media (max-width: 768px) {
      /* Header */
      .header-inner { padding: 10px 0; }
      .brand-logo { height: 40px; }
      .brand-sub { font-size: 7px; }
      nav { display: none; }
      .header-auth { gap: 4px; }
      .btn-login, .btn-join { padding: 6px 10px; font-size: 11px; }

      /* Hero */
      .hero { min-height: auto; padding: 70px 0 32px; background-size: contain; background-position: center 65px; background-repeat: no-repeat; }
      .hero-content { padding-top: 56vw; }
      .hero h1 { font-size: 28px; }
      .hero p { font-size: 15px; }
      .hero-actions { flex-direction: column; gap: 10px; }
      .hero-actions .btn { width: 100%; text-align: center; }
      .hero-quote { margin-top: 24px; padding: 12px 16px; }
      .hero-quote p { font-size: 13px; }

      /* Stats */
      .stats { padding: 32px 0; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .stat { padding: 10px; }
      .stat-num { font-size: 24px; }

      /* Organizations */
      .section { padding: 40px 0; }
      .section-title { font-size: 22px; }
      .groups-grid { grid-template-columns: 1fr; }
      .group-meta { flex-wrap: wrap; gap: 8px; }

      /* Store */
      .products-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
      .product-img { height: 130px; }
      .product-info { padding: 10px; }
      .product-name { font-size: 12px; }

      /* Courses */
      .course-card { flex-direction: column; align-items: flex-start; gap: 10px; }
      .course-price { font-size: 16px; }

      /* CTA / Sponsors */
      .cta-section { padding: 32px 0; }
      .cta-inner h2 { font-size: 20px; }
      .cta-inner { padding: 0 10px; }

      /* KanchoAI pricing */
      .kancho-section { padding: 48px 0; }
      .kancho-header h2 { font-size: 22px; }
      .kancho-header img { height: 110px; }
      .kancho-header p { font-size: 13px; }

      /* Cinema video */
      .cinema-section { padding: 48px 0; }
      .cinema-title h2 { font-size: 20px; }
      .cinema-title .kanji { font-size: 13px; }
      .cinema-brush { font-size: 120px; }
      .cinema-caption p { font-size: 12px; }

      /* Founder */
      .founder-section { padding: 48px 0; }

      /* Footer */
      .footer-inner { flex-direction: column; gap: 12px; text-align: center; }

      /* Modals */
      .modal { padding: 20px; width: 100%; max-width: 95vw; }
      .modal h2 { font-size: 20px; }
      .modal .form-row { grid-template-columns: 1fr; }
      .dojo-form .form-row { grid-template-columns: 1fr; }

      /* Dashboard */
      .member-panel { padding: 20px 10px; }
      .dash-grid { grid-template-columns: 1fr; }
      .dash-header { flex-direction: column; gap: 10px; align-items: flex-start; }
    }

    @media (max-width: 420px) {
      .hero h1 { font-size: 24px; }
      .products-grid { grid-template-columns: 1fr; }
      .photo-strip-inner img { height: 60px; }
      .stat-num { font-size: 20px; }
      .price-card { padding: 24px 18px; }
      .founder-photo { max-width: 260px; }
      .founder-name { font-size: 24px; }
    }

    /* Language switcher */
    .lang-switch { position: fixed; bottom: 20px; left: 20px; z-index: 100; display: flex; gap: 0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.5); border: 1px solid var(--line); }
    .lang-switch a { display: flex; align-items: center; justify-content: center; padding: 8px 14px; font-size: 12px; font-weight: 700; text-decoration: none; letter-spacing: .06em; transition: all .2s; }
    .lang-switch a.active { background: var(--accent); color: #fff; }
    .lang-switch a:not(.active) { background: var(--panel); color: var(--muted); }
    .lang-switch a:not(.active):hover { color: #fff; background: #222; }
  </style>
</head>
<body>
  <div class="lang-switch"><a href="/ronin/" class="active">EN</a><a href="/ronin/es">ES</a><a href="/ronin/fil">FIL</a></div>
  <header>
    <div class="container header-inner">
      <a href="/ronin/" class="brand">
        <img class="brand-logo" src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69978a0f8d5b5a477096667b.png" alt="Ronin Brotherhood">
        <div class="brand-sub">Martial Arts Federation</div>
      </a>
      <nav>
        <a href="#groups">Organizations</a>
        <a href="#store">Store</a>
        <a href="#training">Training</a>
        <a href="#events">Events</a>
        <a href="#sponsors">Sponsors</a>
      </nav>
      <div class="header-auth" id="header-auth">
        <a href="#" class="btn-login" onclick="openModal('login'); return false;">Login</a>
        <a href="#" class="btn-join" onclick="openModal('signup'); return false;">Join the Brotherhood</a>
      </div>
    </div>
  </header>

  <section class="hero">
    <div class="container">
      <div class="hero-content">
        <span class="hero-badge">28 Countries | 1,000+ Black Belts</span>
        <h1>The Way of the <span class="highlight">Ronin</span></h1>
        <p>A martial arts federation composed of over 1,000 black belts from 28 countries. Five distinct organizations united by seven core virtues.</p>
        <div class="hero-actions">
          <a href="#store" class="btn btn-primary">Shop Official Gear</a>
          <a href="#training" class="btn btn-gold">RPDTA Training</a>
        </div>
        <div class="hero-quote">
          <p>"A journey of a thousand miles begins with a single step"<br><span style="font-size:14px;color:#888;">(千里之行，始於足下)</span></p>
          <cite>– Lao Tzu</cite>
        </div>
      </div>
    </div>
  </section>

  <section class="photo-strip">
    <div class="photo-strip-inner">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/698d245d721397289ba56c7d.png" alt="KanchoAI">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782773873af78f3ae844f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782768d5b5a64b992f22f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782761817151e36b61a7f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782763873afe6caae843d.jpg" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6997827620c035e70c1dce26.png" alt="Ronin Brotherhood">
    </div>
  </section>

  <section class="stats">
    <div class="container">
      <div class="stats-grid">
        <div class="stat"><div class="stat-num">1,000+</div><div class="stat-label">Black Belts</div></div>
        <div class="stat"><div class="stat-num">28</div><div class="stat-label">Countries</div></div>
        <div class="stat"><div class="stat-num">5</div><div class="stat-label">Organizations</div></div>
        <div class="stat"><div class="stat-num">392</div><div class="stat-label">Tournament Placements</div></div>
        <div class="stat"><div class="stat-num">5x</div><div class="stat-label">World Champion</div></div>
      </div>
    </div>
  </section>

  <section class="section" id="groups">
    <div class="container">
      <h2 class="section-title">Our Organizations</h2>
      <p class="section-sub">Five martial arts groups united under the Ronin Brotherhood</p>
      <div class="groups-grid" id="groups-container">
        <div class="group-card">
          <div class="group-code">RGRK</div>
          <div class="group-name">Ronin Goju Ryu Kai World Karate Organization</div>
          <div class="group-desc">Empty hand based academic system of self-defense focused on Okinawan and Japanese karate traditions.</div>
          <div class="group-meta"><span>16 countries</span><span>600+ members</span><span>Founded 2000</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">IRMAF</div>
          <div class="group-name">International Ronin Martial Arts Federation</div>
          <div class="group-desc">General martial arts federation welcoming practitioners from all traditional and modern disciplines.</div>
          <div class="group-meta"><span>28 countries</span><span>1,000+ members</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">RPDTA</div>
          <div class="group-name">Ronin Police Defensive Tactics Association</div>
          <div class="group-desc">Elite tactical training for law enforcement, military, and intelligence professionals. Invitation only.</div>
          <div class="group-meta"><span>8 countries</span><span>150+ members</span><span>Clearance Required</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">RBS</div>
          <div class="group-name">Ronin Red Belt Society</div>
          <div class="group-desc">Exclusive society for masters holding 4th Degree Black Belt (Yondan) and above.</div>
          <div class="group-meta"><span>20 countries</span><span>100+ masters</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">MMA</div>
          <div class="group-name">Ronin Mixed Martial Arts International</div>
          <div class="group-desc">Bridging traditional martial arts with modern MMA competition.</div>
          <div class="group-meta"><span>12 countries</span><span>200+ fighters</span></div>
        </div>
        <div class="group-card" style="border-color: #c8102e;">
          <div class="group-code" style="color: #c8102e;">AI</div>
          <div class="group-name">KanchoAI</div>
          <div class="group-desc">AI-powered dojo management platform. Automate scheduling, student tracking, belt progressions, and voice-powered customer service for your school.</div>
          <div class="group-meta"><span><a href="https://kanchoai.com" target="_blank" style="color:#c8102e;">kanchoai.com</a></span><span>Dojo Management</span><span>AI Voice Agents</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="cinema-section" id="film">
    <div class="cinema-brush">武士道</div>
    <div class="cinema-frame">
      <div class="cinema-title">
        <h2>The Path of the Warrior</h2>
        <div class="kanji">武 士 道</div>
        <span class="cinema-line"></span>
      </div>
      <img class="cinema-poster" src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6997807d8523c514badec0d4.webp" alt="Ronin Brotherhood">
      <div class="tv-shell">
        <div class="tv-bezel">
          <div class="tv-screen">
            <iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/HByRigYk8Hg?si=1&rel=0&modestbranding=1" title="Ronin Brotherhood" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
          </div>
        </div>
        <div class="tv-bottom">
          <div class="tv-led"></div>
          <div class="tv-brand">Ronin TV</div>
          <div class="tv-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
      <div class="tv-stand"></div>
      <div class="tv-stand-base"></div>
      <div class="cinema-caption">
        <p>"The way is in training." — Miyamoto Musashi</p>
      </div>
    </div>
  </section>

  <section class="section" id="store" style="background: #0e0e0e;">
    <div class="container">
      <h2 class="section-title">Official Store</h2>
      <p class="section-sub">Premium uniforms, gear, and merchandise</p>
      <div class="products-grid" id="products-container">
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">Loading products...</div>
      </div>
    </div>
  </section>

  <section class="founder-section" id="founder">
    <div class="founder-kanji">創設者</div>
    <div class="founder-inner">
      <div class="founder-photo">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699787bc8523c56965e1b789.jpg" alt="Carlos Montalvo - Founder of Ronin Brotherhood">
      </div>
      <div class="founder-content">
        <div class="founder-badge">5x World Champion</div>
        <div class="founder-name">Carlos Montalvo</div>
        <div class="founder-titles">5X World Champion &bull; <span>Founder of Ronin Brotherhood</span></div>
        <div class="founder-role">Grandmaster &bull; San Sebastian, Puerto Rico</div>
        <div class="founder-bio">
          <p>Carlos began his career in the Martial Arts during his early middle school years in the City of San Sebastian, Puerto Rico where his father was the former City Police Chief.</p>
          <p>He practiced first Karate and Tae Kwon Do (1969) for a short period of time at the 4-H Club near his house. Later he practiced the Chinese style of Shaolin Tsu Kempo.</p>
          <p>His only brother began practicing Okinawa Kempo Karate Do under Sempai Luis Camara and Sensei Edwin Hernandez — a direct student of Toshimitsu Kina, Naha, Okinawa.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="kancho-section" id="kanchoai">
    <div class="container">
      <div class="kancho-header">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782813ff51693e263e40a.png" alt="KanchoAI">
        <h2>Choose Your <span class="ka-accent">Kancho AI</span> Plan</h2>
        <p>Power your martial arts school with AI-driven business intelligence, automated receptionist, and complete CRM solutions.</p>
      </div>
      <div class="pricing-grid">
        <div class="price-card">
          <h3>Kancho Intelligence</h3>
          <div class="price-sub">AI Business Intelligence</div>
          <div class="price-amount"><span class="price-num">$197</span><span class="price-period"> /month</span></div>
          <ul class="price-features">
            <li>AI Business Intelligence Officer</li>
            <li>Integrates with your existing CRM</li>
            <li>Real-time health score monitoring</li>
            <li>Churn risk detection &amp; alerts</li>
            <li>Lead scoring &amp; prioritization</li>
            <li>Revenue analytics &amp; forecasting</li>
            <li>Voice AI business advisor</li>
            <li>100 AI voice minutes included ($0.50 thereafter)</li>
          </ul>
          <a href="https://kanchoai.com" target="_blank" class="price-btn price-btn-outline">Get Started</a>
        </div>
        <div class="price-card popular">
          <div class="popular-badge">Most Popular</div>
          <h3>Kancho Pro</h3>
          <div class="price-sub">Intelligence + AI Receptionist</div>
          <div class="price-amount"><span class="price-num">$397</span><span class="price-period"> /month</span></div>
          <ul class="price-features">
            <li class="bold">Everything in Intelligence</li>
            <li>24/7 AI Receptionist (Phone &amp; SMS)</li>
            <li>Automated lead follow-up calls</li>
            <li>Retention outreach campaigns</li>
            <li>No-show recovery calls</li>
            <li>Payment reminder automation</li>
            <li>Bilingual support (EN/ES)</li>
            <li>500 AI voice minutes included ($0.45 thereafter)</li>
          </ul>
          <a href="https://kanchoai.com" target="_blank" class="price-btn price-btn-primary">Get Started</a>
        </div>
        <div class="price-card">
          <h3>Kancho Enterprise</h3>
          <div class="price-sub">Multi-Tenant SaaS Solution</div>
          <div class="price-amount"><span class="price-custom">Custom</span></div>
          <ul class="price-features">
            <li class="bold">Everything in Pro</li>
            <li>White-label multi-tenant platform</li>
            <li>Multi-language support</li>
            <li>Custom integrations &amp; API access</li>
            <li>Dedicated account manager</li>
            <li>Priority support &amp; SLA</li>
            <li>Volume pricing for SaaS providers</li>
            <li>Unlimited AI voice minutes</li>
          </ul>
          <a href="https://kanchoai.com" target="_blank" class="price-btn price-btn-outline">Schedule a Call</a>
        </div>
      </div>
      <div class="pricing-note">All plans include a 14-day free trial. No credit card required to start.</div>
    </div>
  </section>

  <section class="section" id="training">
    <div class="container">
      <h2 class="section-title">RPDTA Tactical Training</h2>
      <p class="section-sub">Professional law enforcement and military training programs</p>
      <div class="courses-list" id="courses-container">
        <div style="text-align: center; padding: 40px; color: var(--muted);">Loading courses...</div>
      </div>
    </div>
  </section>

  <section class="groups-banner">
    <div class="groups-banner-corners">
      <span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span>
    </div>
    <img class="groups-banner-img" src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699789283873afd1a0b1898d.jpg" alt="Martial Arts Groups - Ronin Brotherhood">
    <div class="groups-banner-overlay"></div>
    <div class="groups-banner-label">
      <h2>Martial Arts Groups</h2>
      <div class="banner-sub">United Under One Brotherhood</div>
    </div>
  </section>

  <section class="cta-section" id="sponsors">
    <div class="container">
      <div class="cta-inner">
        <h2>Become a Sponsor</h2>
        <p>Support martial arts excellence across 28 countries. Partner with the Ronin Brotherhood.</p>
        <a href="/ronin/api/v1/sponsors/inquiry" class="btn btn-gold" style="margin-right: 12px;">Sponsorship Inquiry</a>
        <a href="#" class="btn btn-primary" onclick="openModal('signup'); return false;">Join as Member</a>
      </div>
    </div>
  </section>

  <!-- ====== MEMBER DASHBOARD (shown when logged in) ====== -->
  <section class="section member-panel" id="member-panel">
    <div class="container">
      <div class="dash-header">
        <h2>Welcome, <span id="dash-name">Member</span></h2>
        <button class="btn-logout" onclick="logout()">Sign Out</button>
      </div>
      <div class="dash-grid" id="dash-grid">
        <div class="dash-card">
          <h3>Membership</h3>
          <div class="dash-val" id="dash-rank">--</div>
          <div class="dash-sub" id="dash-tier">--</div>
        </div>
        <div class="dash-card" id="dash-dojo-card">
          <h3>My Dojo</h3>
          <div class="dash-val" id="dash-dojo-name">Not Connected</div>
          <div class="dash-sub" id="dash-dojo-status">Link your dojo to KanchoAI for health monitoring</div>
        </div>
        <div class="dash-card" id="dash-health-card" style="display:none;">
          <h3>Dojo Health Score</h3>
          <div class="dash-val" id="dash-health-score">--</div>
          <div class="dash-sub" id="dash-health-detail">--</div>
        </div>
        <div class="dash-card" id="dash-students-card" style="display:none;">
          <h3>Active Students</h3>
          <div class="dash-val" id="dash-students">0</div>
          <div class="dash-sub" id="dash-students-detail">--</div>
        </div>
      </div>

      <div class="dash-actions" id="dash-actions">
        <a href="#" class="btn btn-primary" id="btn-register-dojo" onclick="showDojoForm(); return false;">Connect Dojo to KanchoAI</a>
        <a href="/kanchoai/" class="btn btn-gold" id="btn-kancho-dash" style="display:none;">Open KanchoAI Dashboard</a>
      </div>

      <!-- Dojo registration form -->
      <div class="dojo-form" id="dojo-form" style="display:none;">
        <h3>Register Your Dojo with KanchoAI</h3>
        <div class="dojo-sub">Connect your school to get AI health monitoring, student tracking, and voice agent support.</div>
        <div class="form-error" id="dojo-error"></div>
        <div class="form-group">
          <label>Dojo / School Name *</label>
          <input type="text" id="dojo-name" placeholder="e.g. Tiger Karate Academy">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Martial Art Style</label>
            <select id="dojo-style">
              <option value="Goju Ryu">Goju Ryu</option>
              <option value="Shotokan">Shotokan</option>
              <option value="Taekwondo">Taekwondo</option>
              <option value="Judo">Judo</option>
              <option value="Brazilian Jiu-Jitsu">Brazilian Jiu-Jitsu</option>
              <option value="MMA">MMA</option>
              <option value="Krav Maga">Krav Maga</option>
              <option value="Muay Thai">Muay Thai</option>
              <option value="Kung Fu">Kung Fu</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Student Capacity</label>
            <input type="number" id="dojo-capacity" placeholder="100" value="100">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>City</label>
            <input type="text" id="dojo-city" placeholder="City">
          </div>
          <div class="form-group">
            <label>Country</label>
            <input type="text" id="dojo-country" placeholder="USA">
          </div>
        </div>
        <div class="form-group">
          <label>Website (optional)</label>
          <input type="url" id="dojo-website" placeholder="https://mydojo.com">
        </div>
        <button class="btn-submit" id="btn-dojo-submit" onclick="registerDojo()">Register Dojo</button>
      </div>
    </div>
  </section>

  <!-- ====== LOGIN MODAL ====== -->
  <div class="modal-overlay" id="modal-login" onclick="if(event.target===this)closeModals()">
    <div class="modal">
      <button class="modal-close" onclick="closeModals()">&times;</button>
      <h2>Welcome Back</h2>
      <div class="modal-sub">Sign in to your Ronin Brotherhood account</div>
      <div class="form-error" id="login-error"></div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="login-email" placeholder="your@email.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="login-password" placeholder="Enter password" onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <button class="btn-submit" id="btn-login-submit" onclick="doLogin()">Sign In</button>
      <div class="switch-link">Don't have an account? <a onclick="openModal('signup')">Join the Brotherhood</a></div>
    </div>
  </div>

  <!-- ====== SIGNUP MODAL ====== -->
  <div class="modal-overlay" id="modal-signup" onclick="if(event.target===this)closeModals()">
    <div class="modal">
      <button class="modal-close" onclick="closeModals()">&times;</button>
      <h2>Join the Brotherhood</h2>
      <div class="modal-sub">Register as a Ronin Brotherhood member</div>
      <div class="form-error" id="signup-error"></div>
      <div class="form-success" id="signup-success"></div>
      <div class="form-row">
        <div class="form-group">
          <label>First Name *</label>
          <input type="text" id="signup-first" placeholder="First name">
        </div>
        <div class="form-group">
          <label>Last Name *</label>
          <input type="text" id="signup-last" placeholder="Last name">
        </div>
      </div>
      <div class="form-group">
        <label>Email *</label>
        <input type="email" id="signup-email" placeholder="your@email.com">
      </div>
      <div class="form-group">
        <label>Password *</label>
        <input type="password" id="signup-password" placeholder="Min 6 characters">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Phone</label>
          <input type="tel" id="signup-phone" placeholder="+1 (555) 123-4567">
        </div>
        <div class="form-group">
          <label>Country</label>
          <input type="text" id="signup-country" placeholder="USA" value="USA">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Rank</label>
          <select id="signup-rank">
            <option value="">Select rank...</option>
            <option value="Shodan">Shodan (1st Dan)</option>
            <option value="Nidan">Nidan (2nd Dan)</option>
            <option value="Sandan">Sandan (3rd Dan)</option>
            <option value="Yondan">Yondan (4th Dan)</option>
            <option value="Godan">Godan (5th Dan)</option>
            <option value="Rokudan">Rokudan (6th Dan)</option>
            <option value="Nanadan">Nanadan (7th Dan)</option>
            <option value="Hachidan">Hachidan (8th Dan)</option>
            <option value="Kudan">Kudan (9th Dan)</option>
            <option value="Judan">Judan (10th Dan)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Dojo Name</label>
          <input type="text" id="signup-dojo" placeholder="Your school name">
        </div>
      </div>
      <div class="form-group">
        <label>Primary Style</label>
        <select id="signup-style">
          <option value="Goju Ryu">Goju Ryu</option>
          <option value="Shotokan">Shotokan</option>
          <option value="Taekwondo">Taekwondo</option>
          <option value="Judo">Judo</option>
          <option value="Brazilian Jiu-Jitsu">Brazilian Jiu-Jitsu</option>
          <option value="MMA">MMA</option>
          <option value="Krav Maga">Krav Maga</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <button class="btn-submit" id="btn-signup-submit" onclick="doSignup()">Create Account</button>
      <div class="switch-link">Already a member? <a onclick="openModal('login')">Sign In</a></div>
    </div>
  </div>

  <footer>
    <div class="container footer-inner">
      <div class="footer-copy">&copy; ${new Date().getFullYear()} Ronin Brotherhood LLC. All rights reserved.</div>
      <div class="footer-links">
        <a href="/ronin/api/v1/groups">Groups</a>
        <a href="/ronin/api/v1/products">Store</a>
        <a href="/ronin/api/v1/training">Training</a>
        <a href="/ronin/api/v1/events">Events</a>
        <a href="/ronin/api/v1/press">News</a>
        <a href="/ronin/health">Health</a>
      </div>
    </div>
  </footer>

  <script>
    var API = '/ronin/api/v1';
    var KANCHO_API = '/kanchoai/api/v1';
    var memberToken = localStorage.getItem('ronin_token');
    var memberData = null;

    // ==================== MODALS ====================
    function openModal(type) {
      closeModals();
      document.getElementById('modal-' + type).classList.add('active');
    }
    function closeModals() {
      document.querySelectorAll('.modal-overlay').forEach(function(m) { m.classList.remove('active'); });
    }

    // ==================== LOGIN ====================
    function doLogin() {
      var email = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;
      var errEl = document.getElementById('login-error');
      var btn = document.getElementById('btn-login-submit');
      errEl.style.display = 'none';

      if (!email || !password) { errEl.textContent = 'Email and password are required'; errEl.style.display = 'block'; return; }

      btn.disabled = true; btn.textContent = 'Signing in...';
      fetch(API + '/members/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false; btn.textContent = 'Sign In';
        if (data.success && data.token) {
          localStorage.setItem('ronin_token', data.token);
          memberToken = data.token;
          memberData = data.data || data.member;
          closeModals();
          showDashboard();
        } else {
          errEl.textContent = data.error || 'Login failed';
          errEl.style.display = 'block';
        }
      })
      .catch(function(e) {
        btn.disabled = false; btn.textContent = 'Sign In';
        errEl.textContent = 'Connection error. Please try again.';
        errEl.style.display = 'block';
      });
    }

    // ==================== SIGNUP ====================
    function doSignup() {
      var first = document.getElementById('signup-first').value.trim();
      var last = document.getElementById('signup-last').value.trim();
      var email = document.getElementById('signup-email').value.trim();
      var password = document.getElementById('signup-password').value;
      var phone = document.getElementById('signup-phone').value.trim();
      var country = document.getElementById('signup-country').value.trim();
      var rank = document.getElementById('signup-rank').value;
      var dojo = document.getElementById('signup-dojo').value.trim();
      var style = document.getElementById('signup-style').value;
      var errEl = document.getElementById('signup-error');
      var successEl = document.getElementById('signup-success');
      var btn = document.getElementById('btn-signup-submit');

      errEl.style.display = 'none'; successEl.style.display = 'none';

      if (!first || !last || !email || !password) {
        errEl.textContent = 'First name, last name, email, and password are required';
        errEl.style.display = 'block'; return;
      }
      if (password.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters';
        errEl.style.display = 'block'; return;
      }

      btn.disabled = true; btn.textContent = 'Creating account...';
      fetch(API + '/members/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: first, last_name: last, email: email, password: password,
          phone: phone, country: country, rank: rank, dojo_name: dojo,
          styles: style ? [style] : []
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false; btn.textContent = 'Create Account';
        if (data.success) {
          if (data.token) {
            localStorage.setItem('ronin_token', data.token);
            memberToken = data.token;
            memberData = data.data || data.member;
            closeModals();
            showDashboard();
          } else {
            successEl.textContent = 'Account created! You can now sign in.';
            successEl.style.display = 'block';
            setTimeout(function() { openModal('login'); }, 1500);
          }
        } else {
          errEl.textContent = data.error || 'Registration failed';
          errEl.style.display = 'block';
        }
      })
      .catch(function(e) {
        btn.disabled = false; btn.textContent = 'Create Account';
        errEl.textContent = 'Connection error. Please try again.';
        errEl.style.display = 'block';
      });
    }

    // ==================== DASHBOARD ====================
    function showDashboard() {
      // Update header
      var authEl = document.getElementById('header-auth');
      authEl.innerHTML = '<a href="#member-panel" class="btn-login">My Dashboard</a><button class="btn-join" onclick="logout()" style="background:transparent;border:1px solid var(--line);color:var(--muted);font-weight:500;">Sign Out</button>';

      // Show panel
      var panel = document.getElementById('member-panel');
      panel.classList.add('active');

      // Load member profile
      fetch(API + '/members/profile', {
        headers: { 'Authorization': 'Bearer ' + memberToken }
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success && data.data) {
          var m = data.data;
          memberData = m;
          document.getElementById('dash-name').textContent = (m.first_name || '') + ' ' + (m.last_name || '');
          document.getElementById('dash-rank').textContent = m.rank || m.title || 'Member';
          document.getElementById('dash-tier').textContent = (m.membership_tier || 'basic').replace('_', ' ').toUpperCase() + ' membership';
          loadDojoData();
        } else if (data.error) {
          // Token expired or invalid
          logout();
        }
      }).catch(function() {});

      // Scroll to panel
      setTimeout(function() { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);
    }

    // ==================== DOJO DATA ====================
    function loadDojoData() {
      fetch(API + '/bridge/kancho/my-dojo', {
        headers: { 'Authorization': 'Bearer ' + memberToken }
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success && data.data) {
          var d = data.data;
          // School info
          document.getElementById('dash-dojo-name').textContent = d.school.name;
          document.getElementById('dash-dojo-status').textContent = d.school.martialArtType + ' | ' + d.school.status;
          document.getElementById('btn-register-dojo').style.display = 'none';
          document.getElementById('btn-kancho-dash').style.display = 'inline-flex';

          // Health score
          if (d.health) {
            var hCard = document.getElementById('dash-health-card');
            hCard.style.display = 'block';
            var scoreEl = document.getElementById('dash-health-score');
            scoreEl.textContent = d.health.grade + ' (' + d.health.overallScore + ')';
            scoreEl.className = 'dash-val grade-' + (d.health.grade || 'c').toLowerCase();
            document.getElementById('dash-health-detail').textContent =
              'Retention: ' + (d.health.retention || '--') + ' | Revenue: ' + (d.health.revenue || '--') + ' | Leads: ' + (d.health.leads || '--');
          }

          // Students
          if (d.counts) {
            document.getElementById('dash-students-card').style.display = 'block';
            document.getElementById('dash-students').textContent = d.counts.students;
            document.getElementById('dash-students-detail').textContent =
              d.counts.leads + ' leads | ' + d.counts.atRisk + ' at risk';
          }
        }
      }).catch(function() {});
    }

    function showDojoForm() {
      var form = document.getElementById('dojo-form');
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }

    function registerDojo() {
      var name = document.getElementById('dojo-name').value.trim();
      var errEl = document.getElementById('dojo-error');
      var btn = document.getElementById('btn-dojo-submit');
      errEl.style.display = 'none';

      if (!name) { errEl.textContent = 'Dojo name is required'; errEl.style.display = 'block'; return; }

      btn.disabled = true; btn.textContent = 'Registering...';
      fetch(API + '/bridge/kancho/register-dojo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + memberToken },
        body: JSON.stringify({
          dojoName: name,
          martialArtType: document.getElementById('dojo-style').value,
          studentCapacity: parseInt(document.getElementById('dojo-capacity').value) || 100,
          city: document.getElementById('dojo-city').value.trim(),
          country: document.getElementById('dojo-country').value.trim(),
          website: document.getElementById('dojo-website').value.trim()
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false; btn.textContent = 'Register Dojo';
        if (data.success) {
          document.getElementById('dojo-form').style.display = 'none';
          loadDojoData();
        } else {
          errEl.textContent = data.error || 'Registration failed';
          errEl.style.display = 'block';
        }
      })
      .catch(function(e) {
        btn.disabled = false; btn.textContent = 'Register Dojo';
        errEl.textContent = 'Connection error';
        errEl.style.display = 'block';
      });
    }

    // ==================== LOGOUT ====================
    function logout() {
      localStorage.removeItem('ronin_token');
      memberToken = null;
      memberData = null;
      document.getElementById('member-panel').classList.remove('active');
      var authEl = document.getElementById('header-auth');
      authEl.innerHTML = '<a href="#" class="btn-login" onclick="openModal(\\'login\\'); return false;">Login</a><a href="#" class="btn-join" onclick="openModal(\\'signup\\'); return false;">Join the Brotherhood</a>';
    }

    // ==================== INIT ====================
    // Check for existing session
    if (memberToken) {
      showDashboard();
    }

    // Load products
    fetch('/ronin/api/v1/products?featured=true&limit=4')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success && data.data.length > 0) {
          var c = document.getElementById('products-container');
          c.innerHTML = data.data.map(function(p) {
            return '<div class="product-card">' +
              '<div class="product-img">&#x1F94B;</div>' +
              '<div class="product-info">' +
              '<div class="product-cat">' + p.category + '</div>' +
              '<div class="product-name">' + p.name + '</div>' +
              '<div class="product-price">$' + parseFloat(p.price).toFixed(2) + '</div>' +
              '</div></div>';
          }).join('');
        }
      }).catch(function() {});

    // Load courses
    fetch('/ronin/api/v1/training/rpdta')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success && data.data.length > 0) {
          var c = document.getElementById('courses-container');
          c.innerHTML = data.data.map(function(course) {
            return '<div class="course-card">' +
              '<div class="course-info">' +
              '<h3>' + course.title + '</h3>' +
              '<div class="course-meta">' +
              '<span>' + course.duration_hours + ' hours</span>' +
              '<span>' + (course.certification_awarded || 'Certificate') + '</span>' +
              '<span>' + (course.requires_clearance ? 'Clearance Required' : 'Open Enrollment') + '</span>' +
              '</div></div>' +
              '<div class="course-price">$' + parseFloat(course.price).toFixed(2) + '</div>' +
              '</div>';
          }).join('');
        }
      }).catch(function() {});
  </script>
</body>
</html>`);
  });
}

// ============================================================================
// SPANISH LANDING PAGE
// ============================================================================

app.get(`${BASE_PATH}/es`, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ronin Brotherhood - Federaci\u00f3n de Artes Marciales</title>
  <meta name="description" content="Ronin Brotherhood LLC - M\u00e1s de 1,000 Cintas Negras de 28 Pa\u00edses. Federaci\u00f3n de Artes Marciales, Tienda en L\u00ednea, Entrenamiento T\u00e1ctico RPDTA.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #0a0a0a; --panel: #1a1a1a; --accent: #d10404; --gold: #c4a35a; --text: #fff; --muted: #999; --line: #2a2a2a; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    .container { max-width: 1120px; margin: 0 auto; padding: 0 20px; }

    header { position: fixed; top: 0; left: 0; right: 0; z-index: 50; background: rgba(10,10,10,.95); border-bottom: 1px solid var(--line); backdrop-filter: blur(10px); }
    .header-inner { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); }
    .brand-logo { height: 64px; width: auto; object-fit: contain; display: block; }
    .brand-sub { font-size: 9px; color: var(--muted); letter-spacing: .12em; text-transform: uppercase; margin-top: 2px; }
    nav { display: flex; gap: 20px; }
    nav a { color: var(--muted); text-decoration: none; font-size: 13px; font-weight: 500; }
    nav a:hover { color: var(--accent); }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; transition: all .2s; border: none; cursor: pointer; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #ff1a1a; }
    .btn-gold { background: transparent; color: var(--gold); border: 2px solid var(--gold); }
    .btn-gold:hover { background: var(--gold); color: #000; }

    .hero { min-height: 120vh; display: flex; align-items: center; padding-top: 80px; background: linear-gradient(to right, rgba(10,10,10,.5) 0%, rgba(10,10,10,.3) 50%, rgba(10,10,10,.1) 100%), url('https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6997c4dc145ac095a4d2ee05.png'); background-size: cover; background-position: 70% 35%; }
    .hero-content { max-width: 680px; }
    .hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--gold); color: var(--gold); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 20px; }
    .hero h1 { font-family: 'Noto Serif', serif; font-size: clamp(32px, 5vw, 52px); font-weight: 700; line-height: 1.15; margin-bottom: 16px; }
    .hero h1 .highlight { color: var(--accent); }
    .hero p { color: var(--muted); font-size: 18px; margin-bottom: 28px; max-width: 560px; }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .hero-quote { margin-top: 40px; padding: 16px 20px; border-left: 3px solid var(--gold); }
    .hero-quote p { font-family: 'Noto Serif', serif; font-style: italic; color: var(--muted); font-size: 15px; margin-bottom: 4px; }
    .hero-quote cite { color: #555; font-size: 12px; }

    .photo-strip { padding: 32px 0; overflow: hidden; background: #fff; border-top: 1px solid var(--line); }
    .photo-strip-inner { display: flex; align-items: center; justify-content: center; gap: 36px; max-width: 1100px; margin: 0 auto; padding: 0 20px; }
    .photo-strip-inner img { height: 150px; width: auto; object-fit: contain; display: block; transition: transform .3s; }
    .photo-strip-inner img:hover { transform: scale(1.08); }

    .stats { padding: 48px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: #0e0e0e; }
    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
    .stat { text-align: center; padding: 16px; }
    .stat-num { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, var(--accent), var(--gold)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; margin-top: 4px; }

    .section { padding: 64px 0; }
    .section-title { font-family: 'Noto Serif', serif; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .section-sub { color: var(--muted); margin-bottom: 32px; }

    .groups-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .group-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px; transition: border-color .2s; }
    .group-card:hover { border-color: var(--accent); }
    .group-code { font-size: 11px; color: var(--accent); font-weight: 700; letter-spacing: .1em; margin-bottom: 4px; }
    .group-name { font-weight: 700; font-size: 16px; margin-bottom: 8px; }
    .group-desc { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .group-meta { display: flex; gap: 16px; margin-top: 12px; font-size: 12px; color: #666; }

    .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .product-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; transition: transform .2s, border-color .2s; text-decoration: none; color: var(--text); }
    .product-card:hover { transform: translateY(-4px); border-color: var(--accent); }
    .product-img { width: 100%; height: 180px; background: #222; display: flex; align-items: center; justify-content: center; color: #444; font-size: 48px; }
    .product-info { padding: 14px; }
    .product-cat { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
    .product-name { font-weight: 600; font-size: 14px; margin: 4px 0; }
    .product-price { color: var(--accent); font-weight: 700; font-size: 16px; }

    .courses-list { display: grid; gap: 12px; }
    .course-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px; display: flex; justify-content: space-between; align-items: center; transition: border-color .2s; }
    .course-card:hover { border-color: var(--accent); }
    .course-info h3 { font-size: 15px; font-weight: 600; }
    .course-meta { display: flex; gap: 16px; margin-top: 4px; font-size: 12px; color: var(--muted); }
    .course-price { font-size: 20px; font-weight: 800; color: var(--gold); }

    .groups-banner { position: relative; overflow: hidden; background: #000; }
    .groups-banner-img { width: 100%; display: block; }
    .groups-banner-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,.3) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,.5) 100%); pointer-events: none; }
    .groups-banner-label { position: absolute; bottom: 24px; left: 0; right: 0; text-align: center; z-index: 2; }
    .groups-banner-label h2 { font-family: 'Noto Serif', serif; font-size: 28px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: .1em; text-shadow: 0 2px 20px rgba(0,0,0,.8); }
    .groups-banner-label .banner-sub { font-size: 13px; color: rgba(255,255,255,.7); letter-spacing: .06em; margin-top: 6px; }
    .groups-banner-corners span { position: absolute; width: 28px; height: 28px; z-index: 3; pointer-events: none; }
    .groups-banner-corners .tl { top: 12px; left: 12px; border-top: 2px solid var(--accent); border-left: 2px solid var(--accent); }
    .groups-banner-corners .tr { top: 12px; right: 12px; border-top: 2px solid var(--accent); border-right: 2px solid var(--accent); }
    .groups-banner-corners .bl { bottom: 12px; left: 12px; border-bottom: 2px solid var(--accent); border-left: 2px solid var(--accent); }
    .groups-banner-corners .br { bottom: 12px; right: 12px; border-bottom: 2px solid var(--accent); border-right: 2px solid var(--accent); }

    .cta-section { padding: 48px 0; background: linear-gradient(135deg, rgba(209,4,4,.08), rgba(196,163,90,.05)); border-top: 1px solid var(--line); }
    .cta-inner { text-align: center; max-width: 600px; margin: 0 auto; }
    .cta-inner h2 { font-family: 'Noto Serif', serif; font-size: 24px; margin-bottom: 8px; }
    .cta-inner p { color: var(--muted); margin-bottom: 20px; }

    footer { border-top: 1px solid var(--line); padding: 24px 0; }
    .footer-inner { display: flex; justify-content: space-between; align-items: center; }
    .footer-copy { color: var(--muted); font-size: 12px; }
    .footer-links { display: flex; gap: 16px; }
    .footer-links a { color: #555; text-decoration: none; font-size: 12px; }
    .footer-links a:hover { color: var(--accent); }

    .header-auth { display: flex; align-items: center; gap: 10px; }
    .btn-login { background: transparent; color: var(--gold); border: 1px solid var(--gold); padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .2s; text-decoration: none; }
    .btn-login:hover { background: var(--gold); color: #000; }
    .btn-join { background: var(--accent); color: #fff; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; border: none; transition: all .2s; text-decoration: none; }
    .btn-join:hover { background: #ff1a1a; }

    .founder-section { padding: 80px 0; background: #000; position: relative; overflow: hidden; }
    .founder-section::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 50%, rgba(200,16,46,.06) 0%, transparent 70%); pointer-events: none; }
    .founder-inner { display: grid; grid-template-columns: 400px 1fr; gap: 48px; align-items: center; max-width: 1000px; margin: 0 auto; padding: 0 20px; }
    .founder-photo { position: relative; }
    .founder-photo img { width: 100%; border-radius: 4px; display: block; box-shadow: 0 0 40px rgba(0,0,0,.6), 0 0 80px rgba(200,16,46,.1); }
    .founder-photo::before { content: ''; position: absolute; inset: -6px; border: 1px solid rgba(200,16,46,.2); border-radius: 6px; pointer-events: none; }
    .founder-photo::after { content: ''; position: absolute; bottom: -3px; left: 10%; right: 10%; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); }
    .founder-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--gold); color: var(--gold); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 16px; }
    .founder-name { font-family: 'Noto Serif', serif; font-size: 36px; font-weight: 700; color: #fff; line-height: 1.15; margin-bottom: 6px; }
    .founder-titles { color: var(--accent); font-size: 14px; font-weight: 600; letter-spacing: .05em; margin-bottom: 6px; }
    .founder-titles span { color: var(--gold); }
    .founder-role { color: var(--muted); font-size: 13px; letter-spacing: .04em; margin-bottom: 24px; }
    .founder-bio p { color: #b0b0b0; font-size: 14px; line-height: 1.8; margin-bottom: 14px; }
    .founder-bio p:first-letter { font-size: 18px; font-weight: 700; color: #fff; }
    .founder-kanji { position: absolute; top: 20px; right: -30px; font-size: 160px; color: rgba(200,16,46,.04); font-family: 'Noto Serif', serif; pointer-events: none; line-height: 1; writing-mode: vertical-rl; }

    .kancho-section { padding: 80px 0; background: linear-gradient(180deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%); position: relative; overflow: hidden; }
    .kancho-section::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); }
    .kancho-header { text-align: center; margin-bottom: 48px; }
    .kancho-header img { height: 160px; margin-bottom: 24px; }
    .kancho-header h2 { font-family: 'Noto Serif', serif; font-size: 28px; color: #fff; margin-bottom: 8px; }
    .kancho-header h2 .ka-accent { color: var(--accent); }
    .kancho-header p { color: var(--muted); font-size: 14px; max-width: 600px; margin: 0 auto; line-height: 1.6; }
    .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1000px; margin: 0 auto; }
    .price-card { background: rgba(20,20,20,.9); border: 1px solid var(--line); border-radius: 12px; padding: 32px 28px; position: relative; display: flex; flex-direction: column; }
    .price-card.popular { border-color: var(--accent); box-shadow: 0 0 40px rgba(200,16,46,.12); }
    .price-card .popular-badge { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; padding: 5px 18px; border-radius: 999px; }
    .price-card h3 { font-family: 'Noto Serif', serif; font-size: 20px; color: #fff; margin-bottom: 4px; }
    .price-card .price-sub { font-size: 12px; color: var(--muted); margin-bottom: 20px; }
    .price-card .price-amount { margin-bottom: 24px; }
    .price-card .price-amount .price-num { font-size: 42px; font-weight: 800; color: var(--accent); }
    .price-card .price-amount .price-period { font-size: 14px; color: var(--muted); }
    .price-card .price-amount .price-custom { font-size: 36px; font-weight: 800; color: var(--gold); }
    .price-features { list-style: none; padding: 0; margin: 0 0 28px; flex: 1; }
    .price-features li { padding: 6px 0; font-size: 13px; color: #b0b0b0; display: flex; align-items: flex-start; gap: 10px; line-height: 1.4; }
    .price-features li::before { content: '\\2714'; color: #22c55e; font-size: 13px; flex-shrink: 0; margin-top: 1px; }
    .price-features li.bold { color: #fff; font-weight: 600; }
    .price-btn { display: block; width: 100%; padding: 12px; border-radius: 8px; text-align: center; font-weight: 700; font-size: 14px; text-decoration: none; transition: all .2s; cursor: pointer; border: none; }
    .price-btn-primary { background: var(--accent); color: #fff; }
    .price-btn-primary:hover { background: #ff1a1a; }
    .price-btn-outline { background: transparent; border: 1px solid var(--line); color: #fff; }
    .price-btn-outline:hover { border-color: var(--gold); color: var(--gold); }
    .pricing-note { text-align: center; margin-top: 24px; font-size: 12px; color: var(--muted); }

    .cinema-section { padding: 80px 0; background: #000; position: relative; overflow: hidden; }
    .cinema-section::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 80px; background: linear-gradient(to bottom, #0a0a0a, transparent); z-index: 2; pointer-events: none; }
    .cinema-section::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 80px; background: linear-gradient(to top, #0e0e0e, transparent); z-index: 2; pointer-events: none; }
    .cinema-frame { position: relative; max-width: 900px; margin: 0 auto; padding: 0 20px; }
    .cinema-poster { display: block; width: 100%; max-width: 700px; margin: 0 auto 36px; border-radius: 6px; box-shadow: 0 8px 40px rgba(0,0,0,.6); }
    .tv-shell { position: relative; max-width: 760px; margin: 0 auto; background: linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 30%, #111 60%, #1a1a1a 100%); border-radius: 18px; padding: 28px 28px 48px; box-shadow: 0 10px 60px rgba(0,0,0,.8), 0 0 80px rgba(200,16,46,.08), inset 0 1px 0 rgba(255,255,255,.06); }
    .tv-shell::before { content: ''; position: absolute; inset: 3px; border-radius: 15px; border: 1px solid rgba(255,255,255,.04); pointer-events: none; }
    .tv-bezel { position: relative; border-radius: 8px; overflow: hidden; border: 4px solid #0a0a0a; box-shadow: inset 0 0 20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.05); }
    .tv-screen { position: relative; width: 100%; padding-bottom: 56.25%; background: #000; }
    .tv-screen iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    .tv-screen::after { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,.03) 0%, transparent 50%); pointer-events: none; z-index: 2; }
    .tv-bottom { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 14px; }
    .tv-led { width: 8px; height: 8px; border-radius: 50%; background: #c8102e; box-shadow: 0 0 6px rgba(200,16,46,.6); }
    .tv-brand { font-size: 11px; color: #444; letter-spacing: .2em; text-transform: uppercase; font-weight: 600; }
    .tv-dots { display: flex; gap: 6px; }
    .tv-dots span { width: 5px; height: 5px; border-radius: 50%; background: #333; }
    .tv-stand { width: 120px; height: 6px; background: linear-gradient(to bottom, #2a2a2a, #1a1a1a); margin: 0 auto; border-radius: 0 0 4px 4px; }
    .tv-stand-base { width: 180px; height: 3px; background: #222; margin: 0 auto; border-radius: 0 0 6px 6px; }
    .cinema-title { text-align: center; margin-bottom: 32px; position: relative; z-index: 3; }
    .cinema-title h2 { font-family: 'Noto Serif', serif; font-size: 28px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #fff; }
    .cinema-title .kanji { font-size: 16px; color: var(--accent); letter-spacing: .3em; margin-top: 6px; font-weight: 400; }
    .cinema-title .cinema-line { display: block; width: 60px; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); margin: 14px auto 0; }
    .cinema-brush { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 200px; color: rgba(200,16,46,.04); font-family: 'Noto Serif', serif; pointer-events: none; z-index: 1; white-space: nowrap; }
    .cinema-caption { text-align: center; margin-top: 24px; position: relative; z-index: 3; }
    .cinema-caption p { font-size: 13px; color: var(--muted); font-style: italic; letter-spacing: .04em; }

    .lang-switch { position: fixed; bottom: 20px; left: 20px; z-index: 100; display: flex; gap: 0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.5); border: 1px solid var(--line); }
    .lang-switch a { display: flex; align-items: center; justify-content: center; padding: 8px 14px; font-size: 12px; font-weight: 700; text-decoration: none; letter-spacing: .06em; transition: all .2s; }
    .lang-switch a.active { background: var(--accent); color: #fff; }
    .lang-switch a:not(.active) { background: var(--panel); color: var(--muted); }
    .lang-switch a:not(.active):hover { color: #fff; background: #222; }

    @media (max-width: 768px) {
      .header-inner { padding: 10px 0; }
      .brand-logo { height: 40px; }
      .brand-sub { font-size: 7px; }
      nav { display: none; }
      .header-auth { gap: 4px; }
      .btn-login, .btn-join { padding: 6px 10px; font-size: 11px; }
      .hero { min-height: auto; padding: 70px 0 32px; background-size: contain; background-position: center 65px; background-repeat: no-repeat; }
      .hero-content { padding-top: 56vw; }
      .hero h1 { font-size: 28px; }
      .hero p { font-size: 15px; }
      .hero-actions { flex-direction: column; gap: 10px; }
      .hero-actions .btn { width: 100%; text-align: center; }
      .hero-quote { margin-top: 24px; padding: 12px 16px; }
      .hero-quote p { font-size: 13px; }
      .stats { padding: 32px 0; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .stat { padding: 10px; }
      .stat-num { font-size: 24px; }
      .section { padding: 40px 0; }
      .section-title { font-size: 22px; }
      .groups-grid { grid-template-columns: 1fr; }
      .group-meta { flex-wrap: wrap; gap: 8px; }
      .products-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
      .product-img { height: 130px; }
      .product-info { padding: 10px; }
      .product-name { font-size: 12px; }
      .course-card { flex-direction: column; align-items: flex-start; gap: 10px; }
      .course-price { font-size: 16px; }
      .cta-section { padding: 32px 0; }
      .cta-inner h2 { font-size: 20px; }
      .cta-inner { padding: 0 10px; }
      .kancho-section { padding: 48px 0; }
      .kancho-header h2 { font-size: 22px; }
      .kancho-header img { height: 110px; }
      .kancho-header p { font-size: 13px; }
      .cinema-section { padding: 48px 0; }
      .cinema-title h2 { font-size: 20px; }
      .cinema-brush { font-size: 120px; }
      .cinema-caption p { font-size: 12px; }
      .founder-section { padding: 48px 0; }
      .founder-inner { grid-template-columns: 1fr; gap: 32px; }
      .founder-photo { max-width: 320px; margin: 0 auto; }
      .founder-name { font-size: 28px; }
      .founder-kanji { display: none; }
      .footer-inner { flex-direction: column; gap: 12px; text-align: center; }
      .pricing-grid { grid-template-columns: 1fr; max-width: 400px; }
      .tv-shell { padding: 16px 16px 32px; border-radius: 12px; }
      .tv-bezel { border-width: 3px; border-radius: 6px; }
      .cinema-poster { max-width: 90%; }
      .photo-strip-inner { gap: 16px; flex-wrap: wrap; }
      .photo-strip-inner img { height: 90px; }
      .groups-banner-label h2 { font-size: 20px; }
      .groups-banner-label { bottom: 16px; }
    }
    @media (max-width: 420px) {
      .hero h1 { font-size: 24px; }
      .products-grid { grid-template-columns: 1fr; }
      .photo-strip-inner img { height: 60px; }
      .stat-num { font-size: 20px; }
      .price-card { padding: 24px 18px; }
      .founder-photo { max-width: 260px; }
      .founder-name { font-size: 24px; }
    }
  </style>
</head>
<body>
  <div class="lang-switch"><a href="/ronin/">EN</a><a href="/ronin/es" class="active">ES</a><a href="/ronin/fil">FIL</a></div>
  <header>
    <div class="container header-inner">
      <a href="/ronin/es" class="brand">
        <img class="brand-logo" src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69978a0f8d5b5a477096667b.png" alt="Ronin Brotherhood">
        <div class="brand-sub">Federaci\u00f3n de Artes Marciales</div>
      </a>
      <nav>
        <a href="#groups">Organizaciones</a>
        <a href="#store">Tienda</a>
        <a href="#training">Entrenamiento</a>
        <a href="#events">Eventos</a>
        <a href="#sponsors">Patrocinadores</a>
      </nav>
      <div class="header-auth" id="header-auth-es">
        <a href="#" class="btn-login" onclick="openModal('login'); return false;">Iniciar Sesi\u00f3n</a>
        <a href="#" class="btn-join" onclick="openModal('signup'); return false;">\u00danete a la Hermandad</a>
      </div>
    </div>
  </header>

  <section class="hero">
    <div class="container">
      <div class="hero-content">
        <span class="hero-badge">28 Pa\u00edses | 1,000+ Cintas Negras</span>
        <h1>El Camino del <span class="highlight">Ronin</span></h1>
        <p>Una federaci\u00f3n de artes marciales compuesta por m\u00e1s de 1,000 cintas negras de 28 pa\u00edses. Cinco organizaciones distintas unidas por siete virtudes fundamentales.</p>
        <div class="hero-actions">
          <a href="#store" class="btn btn-primary">Tienda Oficial</a>
          <a href="#training" class="btn btn-gold">Entrenamiento RPDTA</a>
        </div>
        <div class="hero-quote">
          <p>"Un viaje de mil millas comienza con un solo paso"<br><span style="font-size:14px;color:#888;">(千里之行，始於足下)</span></p>
          <cite>\u2013 Lao Tzu</cite>
        </div>
      </div>
    </div>
  </section>

  <section class="photo-strip">
    <div class="photo-strip-inner">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/698d245d721397289ba56c7d.png" alt="KanchoAI">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782773873af78f3ae844f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782768d5b5a64b992f22f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782761817151e36b61a7f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782763873afe6caae843d.jpg" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6997827620c035e70c1dce26.png" alt="Ronin Brotherhood">
    </div>
  </section>

  <section class="stats">
    <div class="container">
      <div class="stats-grid">
        <div class="stat"><div class="stat-num">1,000+</div><div class="stat-label">Cintas Negras</div></div>
        <div class="stat"><div class="stat-num">28</div><div class="stat-label">Pa\u00edses</div></div>
        <div class="stat"><div class="stat-num">5</div><div class="stat-label">Organizaciones</div></div>
        <div class="stat"><div class="stat-num">392</div><div class="stat-label">Posiciones en Torneos</div></div>
        <div class="stat"><div class="stat-num">5x</div><div class="stat-label">Campe\u00f3n Mundial</div></div>
      </div>
    </div>
  </section>

  <section class="section" id="groups">
    <div class="container">
      <h2 class="section-title">Nuestras Organizaciones</h2>
      <p class="section-sub">Cinco grupos de artes marciales unidos bajo la Hermandad Ronin</p>
      <div class="groups-grid" id="groups-container-es">
        <div class="group-card">
          <div class="group-code">RGRK</div>
          <div class="group-name">Ronin Goju Ryu Kai Organizaci\u00f3n Mundial de Karate</div>
          <div class="group-desc">Sistema acad\u00e9mico de defensa personal basado en mano vac\u00eda, enfocado en las tradiciones de karate de Okinawa y Jap\u00f3n.</div>
          <div class="group-meta"><span>16 pa\u00edses</span><span>600+ miembros</span><span>Fundada en 2000</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">IRMAF</div>
          <div class="group-name">Federaci\u00f3n Internacional de Artes Marciales Ronin</div>
          <div class="group-desc">Federaci\u00f3n general de artes marciales que acoge practicantes de todas las disciplinas tradicionales y modernas.</div>
          <div class="group-meta"><span>28 pa\u00edses</span><span>1,000+ miembros</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">RPDTA</div>
          <div class="group-name">Asociaci\u00f3n Ronin de T\u00e1cticas Defensivas Policiales</div>
          <div class="group-desc">Entrenamiento t\u00e1ctico de \u00e9lite para profesionales de fuerzas del orden, militares e inteligencia. Solo por invitaci\u00f3n.</div>
          <div class="group-meta"><span>8 pa\u00edses</span><span>150+ miembros</span><span>Requiere Autorizaci\u00f3n</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">RBS</div>
          <div class="group-name">Sociedad Ronin de Cintur\u00f3n Rojo</div>
          <div class="group-desc">Sociedad exclusiva para maestros con Cintur\u00f3n Negro de 4to Grado (Yondan) y superior.</div>
          <div class="group-meta"><span>20 pa\u00edses</span><span>100+ maestros</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">MMA</div>
          <div class="group-name">Ronin Artes Marciales Mixtas Internacional</div>
          <div class="group-desc">Uniendo las artes marciales tradicionales con la competencia moderna de MMA.</div>
          <div class="group-meta"><span>12 pa\u00edses</span><span>200+ peleadores</span></div>
        </div>
        <div class="group-card" style="border-color: #c8102e;">
          <div class="group-code" style="color: #c8102e;">AI</div>
          <div class="group-name">KanchoAI</div>
          <div class="group-desc">Plataforma de gesti\u00f3n de dojos impulsada por IA. Automatiza horarios, seguimiento de estudiantes, progresiones de cintur\u00f3n y servicio al cliente por voz.</div>
          <div class="group-meta"><span><a href="https://kanchoai.com" target="_blank" style="color:#c8102e;">kanchoai.com</a></span><span>Gesti\u00f3n de Dojos</span><span>Agentes de Voz IA</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="cinema-section" id="film">
    <div class="cinema-brush">\u6b66\u58eb\u9053</div>
    <div class="cinema-frame">
      <div class="cinema-title">
        <h2>El Camino del Guerrero</h2>
        <div class="kanji">\u6b66 \u58eb \u9053</div>
        <span class="cinema-line"></span>
      </div>
      <img class="cinema-poster" src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6997807d8523c514badec0d4.webp" alt="Ronin Brotherhood">
      <div class="tv-shell">
        <div class="tv-bezel">
          <div class="tv-screen">
            <iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/HByRigYk8Hg?si=1&rel=0&modestbranding=1" title="Ronin Brotherhood" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
          </div>
        </div>
        <div class="tv-bottom">
          <div class="tv-led"></div>
          <div class="tv-brand">Ronin TV</div>
          <div class="tv-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
      <div class="tv-stand"></div>
      <div class="tv-stand-base"></div>
      <div class="cinema-caption">
        <p>"El camino est\u00e1 en el entrenamiento." \u2014 Miyamoto Musashi</p>
      </div>
    </div>
  </section>

  <section class="section" id="store" style="background: #0e0e0e;">
    <div class="container">
      <h2 class="section-title">Tienda Oficial</h2>
      <p class="section-sub">Uniformes, equipos y mercanc\u00eda premium</p>
      <div class="products-grid" id="products-container-es">
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">Cargando productos...</div>
      </div>
    </div>
  </section>

  <section class="founder-section" id="founder">
    <div class="founder-kanji">\u5275\u8a2d\u8005</div>
    <div class="founder-inner">
      <div class="founder-photo">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699787bc8523c56965e1b789.jpg" alt="Carlos Montalvo - Fundador de Ronin Brotherhood">
      </div>
      <div class="founder-content">
        <div class="founder-badge">5x Campe\u00f3n Mundial</div>
        <div class="founder-name">Carlos Montalvo</div>
        <div class="founder-titles">5X Campe\u00f3n Mundial &bull; <span>Fundador de Ronin Brotherhood</span></div>
        <div class="founder-role">Gran Maestro &bull; San Sebasti\u00e1n, Puerto Rico</div>
        <div class="founder-bio">
          <p>Carlos comenz\u00f3 su carrera en las Artes Marciales durante sus primeros a\u00f1os de escuela intermedia en la Ciudad de San Sebasti\u00e1n, Puerto Rico, donde su padre fue el antiguo Jefe de la Polic\u00eda Municipal.</p>
          <p>Practic\u00f3 primero Karate y Tae Kwon Do (1969) por un corto per\u00edodo de tiempo en el Club 4-H cerca de su casa. Luego practic\u00f3 el estilo chino de Shaolin Tsu Kempo.</p>
          <p>Su \u00fanico hermano comenz\u00f3 a practicar Okinawa Kempo Karate Do bajo Sempai Luis C\u00e1mara y Sensei Edwin Hern\u00e1ndez \u2014 un estudiante directo de Toshimitsu Kina, Naha, Okinawa.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="kancho-section" id="kanchoai">
    <div class="container">
      <div class="kancho-header">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782813ff51693e263e40a.png" alt="KanchoAI">
        <h2>Elige Tu Plan <span class="ka-accent">Kancho AI</span></h2>
        <p>Potencia tu escuela de artes marciales con inteligencia artificial, recepcionista automatizada y soluciones CRM completas.</p>
      </div>
      <div class="pricing-grid">
        <div class="price-card">
          <h3>Kancho Intelligence</h3>
          <div class="price-sub">Inteligencia Empresarial IA</div>
          <div class="price-amount"><span class="price-num">$197</span><span class="price-period"> /mes</span></div>
          <ul class="price-features">
            <li>Oficial de Inteligencia Empresarial IA</li>
            <li>Se integra con tu CRM existente</li>
            <li>Monitoreo de salud en tiempo real</li>
            <li>Detecci\u00f3n de riesgo de abandono y alertas</li>
            <li>Puntuaci\u00f3n y priorizaci\u00f3n de prospectos</li>
            <li>An\u00e1lisis de ingresos y pron\u00f3sticos</li>
            <li>Asesor empresarial de voz IA</li>
            <li>100 minutos de voz IA incluidos ($0.50 adicional)</li>
          </ul>
          <a href="https://kanchoai.com" target="_blank" class="price-btn price-btn-outline">Comenzar</a>
        </div>
        <div class="price-card popular">
          <div class="popular-badge">M\u00e1s Popular</div>
          <h3>Kancho Pro</h3>
          <div class="price-sub">Inteligencia + Recepcionista IA</div>
          <div class="price-amount"><span class="price-num">$397</span><span class="price-period"> /mes</span></div>
          <ul class="price-features">
            <li class="bold">Todo lo de Intelligence</li>
            <li>Recepcionista IA 24/7 (Tel\u00e9fono y SMS)</li>
            <li>Llamadas autom\u00e1ticas de seguimiento</li>
            <li>Campa\u00f1as de retenci\u00f3n</li>
            <li>Recuperaci\u00f3n de citas perdidas</li>
            <li>Automatizaci\u00f3n de recordatorios de pago</li>
            <li>Soporte biling\u00fce (EN/ES)</li>
            <li>500 minutos de voz IA incluidos ($0.45 adicional)</li>
          </ul>
          <a href="https://kanchoai.com" target="_blank" class="price-btn price-btn-primary">Comenzar</a>
        </div>
        <div class="price-card">
          <h3>Kancho Enterprise</h3>
          <div class="price-sub">Soluci\u00f3n SaaS Multi-Tenant</div>
          <div class="price-amount"><span class="price-custom">Personalizado</span></div>
          <ul class="price-features">
            <li class="bold">Todo lo de Pro</li>
            <li>Plataforma multi-tenant marca blanca</li>
            <li>Soporte multi-idioma</li>
            <li>Integraciones personalizadas y acceso API</li>
            <li>Gerente de cuenta dedicado</li>
            <li>Soporte prioritario y SLA</li>
            <li>Precios por volumen para proveedores SaaS</li>
            <li>Minutos de voz IA ilimitados</li>
          </ul>
          <a href="https://kanchoai.com" target="_blank" class="price-btn price-btn-outline">Agendar Llamada</a>
        </div>
      </div>
      <div class="pricing-note">Todos los planes incluyen 14 d\u00edas de prueba gratis. No se requiere tarjeta de cr\u00e9dito.</div>
    </div>
  </section>

  <section class="section" id="training">
    <div class="container">
      <h2 class="section-title">Entrenamiento T\u00e1ctico RPDTA</h2>
      <p class="section-sub">Programas profesionales de entrenamiento para fuerzas del orden y militares</p>
      <div class="courses-list" id="courses-container-es">
        <div style="text-align: center; padding: 40px; color: var(--muted);">Cargando cursos...</div>
      </div>
    </div>
  </section>

  <section class="groups-banner">
    <div class="groups-banner-corners">
      <span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span>
    </div>
    <img class="groups-banner-img" src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699789283873afd1a0b1898d.jpg" alt="Grupos de Artes Marciales - Ronin Brotherhood">
    <div class="groups-banner-overlay"></div>
    <div class="groups-banner-label">
      <h2>Grupos de Artes Marciales</h2>
      <div class="banner-sub">Unidos Bajo Una Hermandad</div>
    </div>
  </section>

  <section class="cta-section" id="sponsors">
    <div class="container">
      <div class="cta-inner">
        <h2>Convi\u00e9rtete en Patrocinador</h2>
        <p>Apoya la excelencia en artes marciales en 28 pa\u00edses. As\u00f3ciate con la Hermandad Ronin.</p>
        <a href="/ronin/api/v1/sponsors/inquiry" class="btn btn-gold" style="margin-right: 12px;">Consulta de Patrocinio</a>
        <a href="#" class="btn btn-primary" onclick="openModal('signup'); return false;">\u00danete como Miembro</a>
      </div>
    </div>
  </section>

  <!-- ====== LOGIN MODAL ====== -->
  <div class="modal-overlay" id="modal-login" onclick="if(event.target===this)closeModals()">
    <div class="modal">
      <button class="modal-close" onclick="closeModals()">&times;</button>
      <h2>Bienvenido de Nuevo</h2>
      <div class="modal-sub">Inicia sesi\u00f3n en tu cuenta de Ronin Brotherhood</div>
      <div class="form-error" id="login-error"></div>
      <div class="form-group">
        <label>Correo Electr\u00f3nico</label>
        <input type="email" id="login-email" placeholder="tu@correo.com">
      </div>
      <div class="form-group">
        <label>Contrase\u00f1a</label>
        <input type="password" id="login-password" placeholder="Ingresa tu contrase\u00f1a" onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <button class="btn-submit" id="btn-login-submit" onclick="doLogin()">Iniciar Sesi\u00f3n</button>
      <div class="switch-link">\u00bfNo tienes cuenta? <a onclick="openModal('signup')">\u00danete a la Hermandad</a></div>
    </div>
  </div>

  <!-- ====== SIGNUP MODAL ====== -->
  <div class="modal-overlay" id="modal-signup" onclick="if(event.target===this)closeModals()">
    <div class="modal">
      <button class="modal-close" onclick="closeModals()">&times;</button>
      <h2>\u00danete a la Hermandad</h2>
      <div class="modal-sub">Reg\u00edstrate como miembro de Ronin Brotherhood</div>
      <div class="form-error" id="signup-error"></div>
      <div class="form-success" id="signup-success"></div>
      <div class="form-row">
        <div class="form-group">
          <label>Nombre *</label>
          <input type="text" id="signup-first" placeholder="Nombre">
        </div>
        <div class="form-group">
          <label>Apellido *</label>
          <input type="text" id="signup-last" placeholder="Apellido">
        </div>
      </div>
      <div class="form-group">
        <label>Correo Electr\u00f3nico *</label>
        <input type="email" id="signup-email" placeholder="tu@correo.com">
      </div>
      <div class="form-group">
        <label>Contrase\u00f1a *</label>
        <input type="password" id="signup-password" placeholder="M\u00ednimo 6 caracteres">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tel\u00e9fono</label>
          <input type="tel" id="signup-phone" placeholder="+1 (555) 123-4567">
        </div>
        <div class="form-group">
          <label>Pa\u00eds</label>
          <input type="text" id="signup-country" placeholder="Puerto Rico" value="Puerto Rico">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Rango</label>
          <select id="signup-rank">
            <option value="">Selecciona rango...</option>
            <option value="Shodan">Shodan (1er Dan)</option>
            <option value="Nidan">Nidan (2do Dan)</option>
            <option value="Sandan">Sandan (3er Dan)</option>
            <option value="Yondan">Yondan (4to Dan)</option>
            <option value="Godan">Godan (5to Dan)</option>
            <option value="Rokudan">Rokudan (6to Dan)</option>
            <option value="Nanadan">Nanadan (7mo Dan)</option>
            <option value="Hachidan">Hachidan (8vo Dan)</option>
            <option value="Kudan">Kudan (9no Dan)</option>
            <option value="Judan">Judan (10mo Dan)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Nombre del Dojo</label>
          <input type="text" id="signup-dojo" placeholder="Nombre de tu escuela">
        </div>
      </div>
      <div class="form-group">
        <label>Estilo Principal</label>
        <select id="signup-style">
          <option value="Goju Ryu">Goju Ryu</option>
          <option value="Shotokan">Shotokan</option>
          <option value="Taekwondo">Taekwondo</option>
          <option value="Judo">Judo</option>
          <option value="Brazilian Jiu-Jitsu">Brazilian Jiu-Jitsu</option>
          <option value="MMA">MMA</option>
          <option value="Krav Maga">Krav Maga</option>
          <option value="Otro">Otro</option>
        </select>
      </div>
      <button class="btn-submit" id="btn-signup-submit" onclick="doSignup()">Crear Cuenta</button>
      <div class="switch-link">\u00bfYa eres miembro? <a onclick="openModal('login')">Iniciar Sesi\u00f3n</a></div>
    </div>
  </div>

  <footer>
    <div class="container footer-inner">
      <div class="footer-copy">&copy; ${new Date().getFullYear()} Ronin Brotherhood LLC. Todos los derechos reservados.</div>
      <div class="footer-links">
        <a href="/ronin/api/v1/groups">Grupos</a>
        <a href="/ronin/api/v1/products">Tienda</a>
        <a href="/ronin/api/v1/training">Entrenamiento</a>
        <a href="/ronin/api/v1/events">Eventos</a>
        <a href="/ronin/api/v1/press">Noticias</a>
      </div>
    </div>
  </footer>

  <script>
    var API = '/ronin/api/v1';
    var KANCHO_API = '/kanchoai/api/v1';
    var memberToken = localStorage.getItem('ronin_token');
    var memberData = null;

    function openModal(type) { closeModals(); document.getElementById('modal-' + type).classList.add('active'); }
    function closeModals() { document.querySelectorAll('.modal-overlay').forEach(function(m) { m.classList.remove('active'); }); }

    function doLogin() {
      var email = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;
      var errEl = document.getElementById('login-error');
      var btn = document.getElementById('btn-login-submit');
      errEl.style.display = 'none';
      if (!email || !password) { errEl.textContent = 'Correo y contrase\u00f1a son requeridos'; errEl.style.display = 'block'; return; }
      btn.disabled = true; btn.textContent = 'Iniciando sesi\u00f3n...';
      fetch(API + '/members/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: password }) })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false; btn.textContent = 'Iniciar Sesi\u00f3n';
        if (data.success && data.token) { localStorage.setItem('ronin_token', data.token); memberToken = data.token; closeModals(); location.reload(); }
        else { errEl.textContent = data.error || 'Error al iniciar sesi\u00f3n'; errEl.style.display = 'block'; }
      }).catch(function() { btn.disabled = false; btn.textContent = 'Iniciar Sesi\u00f3n'; errEl.textContent = 'Error de conexi\u00f3n.'; errEl.style.display = 'block'; });
    }

    function doSignup() {
      var first = document.getElementById('signup-first').value.trim();
      var last = document.getElementById('signup-last').value.trim();
      var email = document.getElementById('signup-email').value.trim();
      var password = document.getElementById('signup-password').value;
      var phone = document.getElementById('signup-phone').value.trim();
      var country = document.getElementById('signup-country').value.trim();
      var rank = document.getElementById('signup-rank').value;
      var dojo = document.getElementById('signup-dojo').value.trim();
      var style = document.getElementById('signup-style').value;
      var errEl = document.getElementById('signup-error');
      var successEl = document.getElementById('signup-success');
      var btn = document.getElementById('btn-signup-submit');
      errEl.style.display = 'none'; successEl.style.display = 'none';
      if (!first || !last || !email || !password) { errEl.textContent = 'Nombre, apellido, correo y contrase\u00f1a son requeridos'; errEl.style.display = 'block'; return; }
      if (password.length < 6) { errEl.textContent = 'La contrase\u00f1a debe tener al menos 6 caracteres'; errEl.style.display = 'block'; return; }
      btn.disabled = true; btn.textContent = 'Creando cuenta...';
      fetch(API + '/members/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ first_name: first, last_name: last, email: email, password: password, phone: phone, country: country, rank: rank, dojo_name: dojo, styles: style ? [style] : [] }) })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false; btn.textContent = 'Crear Cuenta';
        if (data.success) {
          if (data.token) { localStorage.setItem('ronin_token', data.token); memberToken = data.token; closeModals(); location.reload(); }
          else { successEl.textContent = '\u00a1Cuenta creada! Ya puedes iniciar sesi\u00f3n.'; successEl.style.display = 'block'; setTimeout(function() { openModal('login'); }, 1500); }
        } else { errEl.textContent = data.error || 'Error en el registro'; errEl.style.display = 'block'; }
      }).catch(function() { btn.disabled = false; btn.textContent = 'Crear Cuenta'; errEl.textContent = 'Error de conexi\u00f3n.'; errEl.style.display = 'block'; });
    }

    function logout() { localStorage.removeItem('ronin_token'); memberToken = null; location.reload(); }

    // Load products
    fetch('/ronin/api/v1/products?featured=true&limit=4')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success && data.data.length > 0) {
          var c = document.getElementById('products-container-es');
          c.innerHTML = data.data.map(function(p) {
            return '<div class="product-card"><div class="product-img">&#x1F94B;</div><div class="product-info"><div class="product-cat">' + p.category + '</div><div class="product-name">' + p.name + '</div><div class="product-price">$' + parseFloat(p.price).toFixed(2) + '</div></div></div>';
          }).join('');
        }
      }).catch(function() {});

    // Load courses
    fetch('/ronin/api/v1/training/rpdta')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success && data.data.length > 0) {
          var c = document.getElementById('courses-container-es');
          c.innerHTML = data.data.map(function(course) {
            return '<div class="course-card"><div class="course-info"><h3>' + course.title + '</h3><div class="course-meta"><span>' + course.duration_hours + ' horas</span><span>' + (course.certification_awarded || 'Certificado') + '</span><span>' + (course.requires_clearance ? 'Requiere Autorizaci\u00f3n' : 'Inscripci\u00f3n Abierta') + '</span></div></div><div class="course-price">$' + parseFloat(course.price).toFixed(2) + '</div></div>';
          }).join('');
        }
      }).catch(function() {});
  </script>
</body>
</html>`);
});

// ============================================================================
// FILIPINO LANDING PAGE
// ============================================================================

app.get(`${BASE_PATH}/fil`, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fil">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ronin Brotherhood - Pederasyon ng Martial Arts</title>
  <meta name="description" content="Ronin Brotherhood LLC - Mahigit 1,000 Black Belts mula sa 28 Bansa. Pederasyon ng Martial Arts, Online Store, RPDTA Tactical Training.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #0a0a0a; --panel: #1a1a1a; --accent: #d10404; --gold: #c4a35a; --text: #fff; --muted: #999; --line: #2a2a2a; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    .container { max-width: 1120px; margin: 0 auto; padding: 0 20px; }
    header { position: fixed; top: 0; left: 0; right: 0; z-index: 50; background: rgba(10,10,10,.95); border-bottom: 1px solid var(--line); backdrop-filter: blur(10px); }
    .header-inner { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; }
    .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); }
    .brand-logo { height: 64px; width: auto; object-fit: contain; display: block; }
    .brand-sub { font-size: 9px; color: var(--muted); letter-spacing: .12em; text-transform: uppercase; margin-top: 2px; }
    nav { display: flex; gap: 20px; }
    nav a { color: var(--muted); text-decoration: none; font-size: 13px; font-weight: 500; }
    nav a:hover { color: var(--accent); }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; transition: all .2s; border: none; cursor: pointer; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #ff1a1a; }
    .btn-gold { background: transparent; color: var(--gold); border: 2px solid var(--gold); }
    .btn-gold:hover { background: var(--gold); color: #000; }
    .hero { min-height: 120vh; display: flex; align-items: center; padding-top: 80px; background: linear-gradient(to right, rgba(10,10,10,.5) 0%, rgba(10,10,10,.3) 50%, rgba(10,10,10,.1) 100%), url('https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6997c4dc145ac095a4d2ee05.png'); background-size: cover; background-position: 70% 35%; }
    .hero-content { max-width: 680px; }
    .hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--gold); color: var(--gold); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 20px; }
    .hero h1 { font-family: 'Noto Serif', serif; font-size: clamp(32px, 5vw, 52px); font-weight: 700; line-height: 1.15; margin-bottom: 16px; }
    .hero h1 .highlight { color: var(--accent); }
    .hero p { color: var(--muted); font-size: 18px; margin-bottom: 28px; max-width: 560px; }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .hero-quote { margin-top: 40px; padding: 16px 20px; border-left: 3px solid var(--gold); }
    .hero-quote p { font-family: 'Noto Serif', serif; font-style: italic; color: var(--muted); font-size: 15px; margin-bottom: 4px; }
    .hero-quote cite { color: #555; font-size: 12px; }
    .photo-strip { padding: 32px 0; overflow: hidden; background: #fff; border-top: 1px solid var(--line); }
    .photo-strip-inner { display: flex; align-items: center; justify-content: center; gap: 36px; max-width: 1100px; margin: 0 auto; padding: 0 20px; }
    .photo-strip-inner img { height: 150px; width: auto; object-fit: contain; display: block; transition: transform .3s; }
    .photo-strip-inner img:hover { transform: scale(1.08); }
    .stats { padding: 48px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: #0e0e0e; }
    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
    .stat { text-align: center; padding: 16px; }
    .stat-num { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, var(--accent), var(--gold)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; margin-top: 4px; }
    .section { padding: 64px 0; }
    .section-title { font-family: 'Noto Serif', serif; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .section-sub { color: var(--muted); margin-bottom: 32px; }
    .groups-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .group-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px; transition: border-color .2s; }
    .group-card:hover { border-color: var(--accent); }
    .group-code { font-size: 11px; color: var(--accent); font-weight: 700; letter-spacing: .1em; margin-bottom: 4px; }
    .group-name { font-weight: 700; font-size: 16px; margin-bottom: 8px; }
    .group-desc { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .group-meta { display: flex; gap: 16px; margin-top: 12px; font-size: 12px; color: #666; }
    .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .product-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; transition: transform .2s, border-color .2s; text-decoration: none; color: var(--text); }
    .product-card:hover { transform: translateY(-4px); border-color: var(--accent); }
    .product-img { width: 100%; height: 180px; background: #222; display: flex; align-items: center; justify-content: center; color: #444; font-size: 48px; }
    .product-info { padding: 14px; }
    .product-cat { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
    .product-name { font-weight: 600; font-size: 14px; margin: 4px 0; }
    .product-price { color: var(--accent); font-weight: 700; font-size: 16px; }
    .courses-list { display: grid; gap: 12px; }
    .course-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px; display: flex; justify-content: space-between; align-items: center; transition: border-color .2s; }
    .course-card:hover { border-color: var(--accent); }
    .course-info h3 { font-size: 15px; font-weight: 600; }
    .course-meta { display: flex; gap: 16px; margin-top: 4px; font-size: 12px; color: var(--muted); }
    .course-price { font-size: 20px; font-weight: 800; color: var(--gold); }
    .groups-banner { position: relative; overflow: hidden; background: #000; }
    .groups-banner-img { width: 100%; display: block; }
    .groups-banner-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,.3) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,.5) 100%); pointer-events: none; }
    .groups-banner-label { position: absolute; bottom: 24px; left: 0; right: 0; text-align: center; z-index: 2; }
    .groups-banner-label h2 { font-family: 'Noto Serif', serif; font-size: 28px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: .1em; text-shadow: 0 2px 20px rgba(0,0,0,.8); }
    .groups-banner-label .banner-sub { font-size: 13px; color: rgba(255,255,255,.7); letter-spacing: .06em; margin-top: 6px; }
    .groups-banner-corners span { position: absolute; width: 28px; height: 28px; z-index: 3; pointer-events: none; }
    .groups-banner-corners .tl { top: 12px; left: 12px; border-top: 2px solid var(--accent); border-left: 2px solid var(--accent); }
    .groups-banner-corners .tr { top: 12px; right: 12px; border-top: 2px solid var(--accent); border-right: 2px solid var(--accent); }
    .groups-banner-corners .bl { bottom: 12px; left: 12px; border-bottom: 2px solid var(--accent); border-left: 2px solid var(--accent); }
    .groups-banner-corners .br { bottom: 12px; right: 12px; border-bottom: 2px solid var(--accent); border-right: 2px solid var(--accent); }
    .cta-section { padding: 48px 0; background: linear-gradient(135deg, rgba(209,4,4,.08), rgba(196,163,90,.05)); border-top: 1px solid var(--line); }
    .cta-inner { text-align: center; max-width: 600px; margin: 0 auto; }
    .cta-inner h2 { font-family: 'Noto Serif', serif; font-size: 24px; margin-bottom: 8px; }
    .cta-inner p { color: var(--muted); margin-bottom: 20px; }
    footer { border-top: 1px solid var(--line); padding: 24px 0; }
    .footer-inner { display: flex; justify-content: space-between; align-items: center; }
    .footer-copy { color: var(--muted); font-size: 12px; }
    .footer-links { display: flex; gap: 16px; }
    .footer-links a { color: #555; text-decoration: none; font-size: 12px; }
    .footer-links a:hover { color: var(--accent); }
    .header-auth { display: flex; align-items: center; gap: 10px; }
    .btn-login { background: transparent; color: var(--gold); border: 1px solid var(--gold); padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .2s; text-decoration: none; }
    .btn-login:hover { background: var(--gold); color: #000; }
    .btn-join { background: var(--accent); color: #fff; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; border: none; transition: all .2s; text-decoration: none; }
    .btn-join:hover { background: #ff1a1a; }
    .founder-section { padding: 80px 0; background: #000; position: relative; overflow: hidden; }
    .founder-section::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 50%, rgba(200,16,46,.06) 0%, transparent 70%); pointer-events: none; }
    .founder-inner { display: grid; grid-template-columns: 400px 1fr; gap: 48px; align-items: center; max-width: 1000px; margin: 0 auto; padding: 0 20px; }
    .founder-photo { position: relative; }
    .founder-photo img { width: 100%; border-radius: 4px; display: block; box-shadow: 0 0 40px rgba(0,0,0,.6), 0 0 80px rgba(200,16,46,.1); }
    .founder-photo::before { content: ''; position: absolute; inset: -6px; border: 1px solid rgba(200,16,46,.2); border-radius: 6px; pointer-events: none; }
    .founder-photo::after { content: ''; position: absolute; bottom: -3px; left: 10%; right: 10%; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); }
    .founder-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--gold); color: var(--gold); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 16px; }
    .founder-name { font-family: 'Noto Serif', serif; font-size: 36px; font-weight: 700; color: #fff; line-height: 1.15; margin-bottom: 6px; }
    .founder-titles { color: var(--accent); font-size: 14px; font-weight: 600; letter-spacing: .05em; margin-bottom: 6px; }
    .founder-titles span { color: var(--gold); }
    .founder-role { color: var(--muted); font-size: 13px; letter-spacing: .04em; margin-bottom: 24px; }
    .founder-bio p { color: #b0b0b0; font-size: 14px; line-height: 1.8; margin-bottom: 14px; }
    .founder-bio p:first-letter { font-size: 18px; font-weight: 700; color: #fff; }
    .founder-kanji { position: absolute; top: 20px; right: -30px; font-size: 160px; color: rgba(200,16,46,.04); font-family: 'Noto Serif', serif; pointer-events: none; line-height: 1; writing-mode: vertical-rl; }
    .kancho-section { padding: 80px 0; background: linear-gradient(180deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%); position: relative; overflow: hidden; }
    .kancho-section::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); }
    .kancho-header { text-align: center; margin-bottom: 48px; }
    .kancho-header img { height: 160px; margin-bottom: 24px; }
    .kancho-header h2 { font-family: 'Noto Serif', serif; font-size: 28px; color: #fff; margin-bottom: 8px; }
    .kancho-header h2 .ka-accent { color: var(--accent); }
    .kancho-header p { color: var(--muted); font-size: 14px; max-width: 600px; margin: 0 auto; line-height: 1.6; }
    .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1000px; margin: 0 auto; }
    .price-card { background: rgba(20,20,20,.9); border: 1px solid var(--line); border-radius: 12px; padding: 32px 28px; position: relative; display: flex; flex-direction: column; }
    .price-card.popular { border-color: var(--accent); box-shadow: 0 0 40px rgba(200,16,46,.12); }
    .price-card .popular-badge { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; padding: 5px 18px; border-radius: 999px; }
    .price-card h3 { font-family: 'Noto Serif', serif; font-size: 20px; color: #fff; margin-bottom: 4px; }
    .price-card .price-sub { font-size: 12px; color: var(--muted); margin-bottom: 20px; }
    .price-card .price-amount { margin-bottom: 24px; }
    .price-card .price-amount .price-num { font-size: 42px; font-weight: 800; color: var(--accent); }
    .price-card .price-amount .price-period { font-size: 14px; color: var(--muted); }
    .price-card .price-amount .price-custom { font-size: 36px; font-weight: 800; color: var(--gold); }
    .price-features { list-style: none; padding: 0; margin: 0 0 28px; flex: 1; }
    .price-features li { padding: 6px 0; font-size: 13px; color: #b0b0b0; display: flex; align-items: flex-start; gap: 10px; line-height: 1.4; }
    .price-features li::before { content: '\\2714'; color: #22c55e; font-size: 13px; flex-shrink: 0; margin-top: 1px; }
    .price-features li.bold { color: #fff; font-weight: 600; }
    .price-btn { display: block; width: 100%; padding: 12px; border-radius: 8px; text-align: center; font-weight: 700; font-size: 14px; text-decoration: none; transition: all .2s; cursor: pointer; border: none; }
    .price-btn-primary { background: var(--accent); color: #fff; }
    .price-btn-primary:hover { background: #ff1a1a; }
    .price-btn-outline { background: transparent; border: 1px solid var(--line); color: #fff; }
    .price-btn-outline:hover { border-color: var(--gold); color: var(--gold); }
    .pricing-note { text-align: center; margin-top: 24px; font-size: 12px; color: var(--muted); }
    .cinema-section { padding: 80px 0; background: #000; position: relative; overflow: hidden; }
    .cinema-section::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 80px; background: linear-gradient(to bottom, #0a0a0a, transparent); z-index: 2; pointer-events: none; }
    .cinema-section::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 80px; background: linear-gradient(to top, #0e0e0e, transparent); z-index: 2; pointer-events: none; }
    .cinema-frame { position: relative; max-width: 900px; margin: 0 auto; padding: 0 20px; }
    .cinema-poster { display: block; width: 100%; max-width: 700px; margin: 0 auto 36px; border-radius: 6px; box-shadow: 0 8px 40px rgba(0,0,0,.6); }
    .tv-shell { position: relative; max-width: 760px; margin: 0 auto; background: linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 30%, #111 60%, #1a1a1a 100%); border-radius: 18px; padding: 28px 28px 48px; box-shadow: 0 10px 60px rgba(0,0,0,.8), 0 0 80px rgba(200,16,46,.08), inset 0 1px 0 rgba(255,255,255,.06); }
    .tv-shell::before { content: ''; position: absolute; inset: 3px; border-radius: 15px; border: 1px solid rgba(255,255,255,.04); pointer-events: none; }
    .tv-bezel { position: relative; border-radius: 8px; overflow: hidden; border: 4px solid #0a0a0a; box-shadow: inset 0 0 20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.05); }
    .tv-screen { position: relative; width: 100%; padding-bottom: 56.25%; background: #000; }
    .tv-screen iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    .tv-screen::after { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,.03) 0%, transparent 50%); pointer-events: none; z-index: 2; }
    .tv-bottom { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 14px; }
    .tv-led { width: 8px; height: 8px; border-radius: 50%; background: #c8102e; box-shadow: 0 0 6px rgba(200,16,46,.6); }
    .tv-brand { font-size: 11px; color: #444; letter-spacing: .2em; text-transform: uppercase; font-weight: 600; }
    .tv-dots { display: flex; gap: 6px; }
    .tv-dots span { width: 5px; height: 5px; border-radius: 50%; background: #333; }
    .tv-stand { width: 120px; height: 6px; background: linear-gradient(to bottom, #2a2a2a, #1a1a1a); margin: 0 auto; border-radius: 0 0 4px 4px; }
    .tv-stand-base { width: 180px; height: 3px; background: #222; margin: 0 auto; border-radius: 0 0 6px 6px; }
    .cinema-title { text-align: center; margin-bottom: 32px; position: relative; z-index: 3; }
    .cinema-title h2 { font-family: 'Noto Serif', serif; font-size: 28px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #fff; }
    .cinema-title .kanji { font-size: 16px; color: var(--accent); letter-spacing: .3em; margin-top: 6px; font-weight: 400; }
    .cinema-title .cinema-line { display: block; width: 60px; height: 2px; background: linear-gradient(90deg, transparent, var(--accent), transparent); margin: 14px auto 0; }
    .cinema-brush { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 200px; color: rgba(200,16,46,.04); font-family: 'Noto Serif', serif; pointer-events: none; z-index: 1; white-space: nowrap; }
    .cinema-caption { text-align: center; margin-top: 24px; position: relative; z-index: 3; }
    .cinema-caption p { font-size: 13px; color: var(--muted); font-style: italic; letter-spacing: .04em; }
    .lang-switch { position: fixed; bottom: 20px; left: 20px; z-index: 100; display: flex; gap: 0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.5); border: 1px solid var(--line); }
    .lang-switch a { display: flex; align-items: center; justify-content: center; padding: 8px 14px; font-size: 12px; font-weight: 700; text-decoration: none; letter-spacing: .06em; transition: all .2s; }
    .lang-switch a.active { background: var(--accent); color: #fff; }
    .lang-switch a:not(.active) { background: var(--panel); color: var(--muted); }
    .lang-switch a:not(.active):hover { color: #fff; background: #222; }
    @media (max-width: 768px) {
      .header-inner { padding: 10px 0; } .brand-logo { height: 40px; } .brand-sub { font-size: 7px; } nav { display: none; } .header-auth { gap: 4px; } .btn-login, .btn-join { padding: 6px 10px; font-size: 11px; }
      .hero { min-height: auto; padding: 70px 0 32px; background-size: contain; background-position: center 65px; background-repeat: no-repeat; } .hero-content { padding-top: 56vw; } .hero h1 { font-size: 28px; } .hero p { font-size: 15px; }
      .hero-actions { flex-direction: column; gap: 10px; } .hero-actions .btn { width: 100%; text-align: center; } .hero-quote { margin-top: 24px; padding: 12px 16px; } .hero-quote p { font-size: 13px; }
      .stats { padding: 32px 0; } .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; } .stat { padding: 10px; } .stat-num { font-size: 24px; }
      .section { padding: 40px 0; } .section-title { font-size: 22px; } .groups-grid { grid-template-columns: 1fr; } .group-meta { flex-wrap: wrap; gap: 8px; }
      .products-grid { grid-template-columns: 1fr 1fr; gap: 10px; } .product-img { height: 130px; } .product-info { padding: 10px; } .product-name { font-size: 12px; }
      .course-card { flex-direction: column; align-items: flex-start; gap: 10px; } .course-price { font-size: 16px; }
      .cta-section { padding: 32px 0; } .cta-inner h2 { font-size: 20px; } .cta-inner { padding: 0 10px; }
      .kancho-section { padding: 48px 0; } .kancho-header h2 { font-size: 22px; } .kancho-header img { height: 110px; } .kancho-header p { font-size: 13px; }
      .cinema-section { padding: 48px 0; } .cinema-title h2 { font-size: 20px; } .cinema-brush { font-size: 120px; } .cinema-caption p { font-size: 12px; }
      .founder-section { padding: 48px 0; } .founder-inner { grid-template-columns: 1fr; gap: 32px; } .founder-photo { max-width: 320px; margin: 0 auto; } .founder-name { font-size: 28px; } .founder-kanji { display: none; }
      .footer-inner { flex-direction: column; gap: 12px; text-align: center; } .pricing-grid { grid-template-columns: 1fr; max-width: 400px; }
      .tv-shell { padding: 16px 16px 32px; border-radius: 12px; } .tv-bezel { border-width: 3px; border-radius: 6px; } .cinema-poster { max-width: 90%; }
      .photo-strip-inner { gap: 16px; flex-wrap: wrap; } .photo-strip-inner img { height: 90px; }
      .groups-banner-label h2 { font-size: 20px; } .groups-banner-label { bottom: 16px; }
    }
    @media (max-width: 420px) { .hero h1 { font-size: 24px; } .products-grid { grid-template-columns: 1fr; } .photo-strip-inner img { height: 60px; } .stat-num { font-size: 20px; } .price-card { padding: 24px 18px; } .founder-photo { max-width: 260px; } .founder-name { font-size: 24px; } }
  </style>
</head>
<body>
  <div class="lang-switch"><a href="/ronin/">EN</a><a href="/ronin/es">ES</a><a href="/ronin/fil" class="active">FIL</a></div>
  <header>
    <div class="container header-inner">
      <a href="/ronin/fil" class="brand">
        <img class="brand-logo" src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/69978a0f8d5b5a477096667b.png" alt="Ronin Brotherhood">
        <div class="brand-sub">Pederasyon ng Martial Arts</div>
      </a>
      <nav>
        <a href="#groups">Mga Organisasyon</a>
        <a href="#store">Tindahan</a>
        <a href="#training">Pagsasanay</a>
        <a href="#events">Mga Kaganapan</a>
        <a href="#sponsors">Mga Sponsor</a>
      </nav>
      <div class="header-auth" id="header-auth-fil">
        <a href="#" class="btn-login" onclick="openModal('login'); return false;">Mag-login</a>
        <a href="#" class="btn-join" onclick="openModal('signup'); return false;">Sumali sa Kapatiran</a>
      </div>
    </div>
  </header>

  <section class="hero">
    <div class="container">
      <div class="hero-content">
        <span class="hero-badge">28 Bansa | 1,000+ Black Belts</span>
        <h1>Ang Daan ng <span class="highlight">Ronin</span></h1>
        <p>Isang pederasyon ng martial arts na binubuo ng mahigit 1,000 black belts mula sa 28 bansa. Limang natatanging organisasyon na pinag-iisa ng pitong pangunahing birtud.</p>
        <div class="hero-actions">
          <a href="#store" class="btn btn-primary">Tindahan Opisyal</a>
          <a href="#training" class="btn btn-gold">RPDTA Pagsasanay</a>
        </div>
        <div class="hero-quote">
          <p>"Ang paglalakbay ng isang libong milya ay nagsisimula sa isang hakbang"<br><span style="font-size:14px;color:#888;">(\u5343\u91cc\u4e4b\u884c\uff0c\u59cb\u65bc\u8db3\u4e0b)</span></p>
          <cite>\u2013 Lao Tzu</cite>
        </div>
      </div>
    </div>
  </section>

  <section class="photo-strip">
    <div class="photo-strip-inner">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/698d245d721397289ba56c7d.png" alt="KanchoAI">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782773873af78f3ae844f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782768d5b5a64b992f22f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782761817151e36b61a7f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782763873afe6caae843d.jpg" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6997827620c035e70c1dce26.png" alt="Ronin Brotherhood">
    </div>
  </section>

  <section class="stats">
    <div class="container">
      <div class="stats-grid">
        <div class="stat"><div class="stat-num">1,000+</div><div class="stat-label">Black Belts</div></div>
        <div class="stat"><div class="stat-num">28</div><div class="stat-label">Mga Bansa</div></div>
        <div class="stat"><div class="stat-num">5</div><div class="stat-label">Mga Organisasyon</div></div>
        <div class="stat"><div class="stat-num">392</div><div class="stat-label">Mga Puwesto sa Torneo</div></div>
        <div class="stat"><div class="stat-num">5x</div><div class="stat-label">World Champion</div></div>
      </div>
    </div>
  </section>

  <section class="section" id="groups">
    <div class="container">
      <h2 class="section-title">Mga Organisasyon Namin</h2>
      <p class="section-sub">Limang grupo ng martial arts na nagkakaisa sa ilalim ng Ronin Brotherhood</p>
      <div class="groups-grid">
        <div class="group-card">
          <div class="group-code">RGRK</div>
          <div class="group-name">Ronin Goju Ryu Kai World Karate Organization</div>
          <div class="group-desc">Akademikong sistema ng pagtatanggol sa sarili na nakabase sa walang sandata, nakatuon sa tradisyon ng karate mula Okinawa at Japan.</div>
          <div class="group-meta"><span>16 bansa</span><span>600+ miyembro</span><span>Itinatag noong 2000</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">IRMAF</div>
          <div class="group-name">International Ronin Martial Arts Federation</div>
          <div class="group-desc">Pangkalahatang pederasyon ng martial arts na tumatanggap ng mga practitioner mula sa lahat ng tradisyonal at modernong disiplina.</div>
          <div class="group-meta"><span>28 bansa</span><span>1,000+ miyembro</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">RPDTA</div>
          <div class="group-name">Ronin Police Defensive Tactics Association</div>
          <div class="group-desc">Elit na taktikal na pagsasanay para sa mga propesyonal ng pagpapatupad ng batas, militar, at intelligence. Sa pamamagitan lamang ng imbitasyon.</div>
          <div class="group-meta"><span>8 bansa</span><span>150+ miyembro</span><span>Kailangan ng Clearance</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">RBS</div>
          <div class="group-name">Ronin Red Belt Society</div>
          <div class="group-desc">Eksklusibong samahan para sa mga master na may hawak na 4th Degree Black Belt (Yondan) pataas.</div>
          <div class="group-meta"><span>20 bansa</span><span>100+ masters</span></div>
        </div>
        <div class="group-card">
          <div class="group-code">MMA</div>
          <div class="group-name">Ronin Mixed Martial Arts International</div>
          <div class="group-desc">Pinag-uugnay ang tradisyonal na martial arts sa modernong kompetisyon ng MMA.</div>
          <div class="group-meta"><span>12 bansa</span><span>200+ mandirigma</span></div>
        </div>
        <div class="group-card" style="border-color: #c8102e;">
          <div class="group-code" style="color: #c8102e;">AI</div>
          <div class="group-name">KanchoAI</div>
          <div class="group-desc">Platform sa pamamahala ng dojo na pinapagana ng AI. I-automate ang scheduling, pagsubaybay ng estudyante, pagsulong ng sinturon, at serbisyo sa customer sa pamamagitan ng boses.</div>
          <div class="group-meta"><span><a href="https://kanchoai.com" target="_blank" style="color:#c8102e;">kanchoai.com</a></span><span>Pamamahala ng Dojo</span><span>AI Voice Agents</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="cinema-section" id="film">
    <div class="cinema-brush">\u6b66\u58eb\u9053</div>
    <div class="cinema-frame">
      <div class="cinema-title">
        <h2>Ang Landas ng Mandirigma</h2>
        <div class="kanji">\u6b66 \u58eb \u9053</div>
        <span class="cinema-line"></span>
      </div>
      <img class="cinema-poster" src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/6997807d8523c514badec0d4.webp" alt="Ronin Brotherhood">
      <div class="tv-shell">
        <div class="tv-bezel">
          <div class="tv-screen">
            <iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/HByRigYk8Hg?si=1&rel=0&modestbranding=1" title="Ronin Brotherhood" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
          </div>
        </div>
        <div class="tv-bottom">
          <div class="tv-led"></div>
          <div class="tv-brand">Ronin TV</div>
          <div class="tv-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
      <div class="tv-stand"></div>
      <div class="tv-stand-base"></div>
      <div class="cinema-caption">
        <p>"Ang daan ay nasa pagsasanay." \u2014 Miyamoto Musashi</p>
      </div>
    </div>
  </section>

  <section class="section" id="store" style="background: #0e0e0e;">
    <div class="container">
      <h2 class="section-title">Tindahang Opisyal</h2>
      <p class="section-sub">Premium na uniporme, kagamitan, at merchandise</p>
      <div class="products-grid" id="products-container-fil">
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">Naglo-load ng mga produkto...</div>
      </div>
    </div>
  </section>

  <section class="founder-section" id="founder">
    <div class="founder-kanji">\u5275\u8a2d\u8005</div>
    <div class="founder-inner">
      <div class="founder-photo">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699787bc8523c56965e1b789.jpg" alt="Carlos Montalvo - Tagapagtatag ng Ronin Brotherhood">
      </div>
      <div class="founder-content">
        <div class="founder-badge">5x World Champion</div>
        <div class="founder-name">Carlos Montalvo</div>
        <div class="founder-titles">5X World Champion &bull; <span>Tagapagtatag ng Ronin Brotherhood</span></div>
        <div class="founder-role">Grandmaster &bull; San Sebastian, Puerto Rico</div>
        <div class="founder-bio">
          <p>Sinimulan ni Carlos ang kanyang karera sa Martial Arts noong kanyang mga unang taon sa middle school sa Lungsod ng San Sebastian, Puerto Rico kung saan ang kanyang ama ang dating Punong Pulis ng Lungsod.</p>
          <p>Nagsanay muna siya ng Karate at Tae Kwon Do (1969) sa maikling panahon sa 4-H Club malapit sa kanyang bahay. Pagkatapos ay nagsanay siya ng estilong Tsino ng Shaolin Tsu Kempo.</p>
          <p>Ang kanyang kaisa-isang kapatid ay nagsimulang magsanay ng Okinawa Kempo Karate Do sa ilalim ni Sempai Luis Camara at Sensei Edwin Hernandez \u2014 isang direktang estudyante ni Toshimitsu Kina, Naha, Okinawa.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="kancho-section" id="kanchoai">
    <div class="container">
      <div class="kancho-header">
        <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782813ff51693e263e40a.png" alt="KanchoAI">
        <h2>Piliin ang Iyong Plano sa <span class="ka-accent">Kancho AI</span></h2>
        <p>Palakasin ang iyong paaralan ng martial arts gamit ang AI-driven business intelligence, automated na receptionist, at kumpletong CRM solutions.</p>
      </div>
      <div class="pricing-grid">
        <div class="price-card">
          <h3>Kancho Intelligence</h3>
          <div class="price-sub">AI Business Intelligence</div>
          <div class="price-amount"><span class="price-num">$197</span><span class="price-period"> /buwan</span></div>
          <ul class="price-features">
            <li>AI Business Intelligence Officer</li>
            <li>Nag-i-integrate sa iyong kasalukuyang CRM</li>
            <li>Real-time na pagsubaybay ng kalusugan</li>
            <li>Pagtuklas ng panganib ng pag-alis at mga alerto</li>
            <li>Lead scoring at prioritization</li>
            <li>Analytics ng kita at pagtataya</li>
            <li>Voice AI business advisor</li>
            <li>100 AI voice minutes kasama ($0.50 pagkatapos)</li>
          </ul>
          <a href="https://kanchoai.com" target="_blank" class="price-btn price-btn-outline">Magsimula</a>
        </div>
        <div class="price-card popular">
          <div class="popular-badge">Pinakasikat</div>
          <h3>Kancho Pro</h3>
          <div class="price-sub">Intelligence + AI Receptionist</div>
          <div class="price-amount"><span class="price-num">$397</span><span class="price-period"> /buwan</span></div>
          <ul class="price-features">
            <li class="bold">Lahat ng nasa Intelligence</li>
            <li>24/7 AI Receptionist (Telepono at SMS)</li>
            <li>Automated na follow-up calls sa mga lead</li>
            <li>Mga kampanya sa pagpapanatili</li>
            <li>Pagbawi ng mga hindi dumating</li>
            <li>Automation ng paalala sa pagbabayad</li>
            <li>Bilingual na suporta (EN/ES)</li>
            <li>500 AI voice minutes kasama ($0.45 pagkatapos)</li>
          </ul>
          <a href="https://kanchoai.com" target="_blank" class="price-btn price-btn-primary">Magsimula</a>
        </div>
        <div class="price-card">
          <h3>Kancho Enterprise</h3>
          <div class="price-sub">Multi-Tenant SaaS Solution</div>
          <div class="price-amount"><span class="price-custom">Pasadya</span></div>
          <ul class="price-features">
            <li class="bold">Lahat ng nasa Pro</li>
            <li>White-label multi-tenant platform</li>
            <li>Suporta sa maraming wika</li>
            <li>Pasadyang integrasyon at API access</li>
            <li>Dedikadong account manager</li>
            <li>Priority support at SLA</li>
            <li>Volume pricing para sa SaaS providers</li>
            <li>Walang limitasyong AI voice minutes</li>
          </ul>
          <a href="https://kanchoai.com" target="_blank" class="price-btn price-btn-outline">Mag-iskedyul ng Tawag</a>
        </div>
      </div>
      <div class="pricing-note">Lahat ng plano ay may kasamang 14 na araw na libreng pagsubok. Hindi kailangan ng credit card.</div>
    </div>
  </section>

  <section class="section" id="training">
    <div class="container">
      <h2 class="section-title">RPDTA Taktikal na Pagsasanay</h2>
      <p class="section-sub">Propesyonal na programa ng pagsasanay para sa pagpapatupad ng batas at militar</p>
      <div class="courses-list" id="courses-container-fil">
        <div style="text-align: center; padding: 40px; color: var(--muted);">Naglo-load ng mga kurso...</div>
      </div>
    </div>
  </section>

  <section class="groups-banner">
    <div class="groups-banner-corners">
      <span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span>
    </div>
    <img class="groups-banner-img" src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699789283873afd1a0b1898d.jpg" alt="Mga Grupo ng Martial Arts - Ronin Brotherhood">
    <div class="groups-banner-overlay"></div>
    <div class="groups-banner-label">
      <h2>Mga Grupo ng Martial Arts</h2>
      <div class="banner-sub">Nagkakaisa sa Ilalim ng Isang Kapatiran</div>
    </div>
  </section>

  <section class="cta-section" id="sponsors">
    <div class="container">
      <div class="cta-inner">
        <h2>Maging Sponsor</h2>
        <p>Suportahan ang kahusayan sa martial arts sa 28 bansa. Makipagtulungan sa Ronin Brotherhood.</p>
        <a href="/ronin/api/v1/sponsors/inquiry" class="btn btn-gold" style="margin-right: 12px;">Pagtatanong sa Sponsorship</a>
        <a href="#" class="btn btn-primary" onclick="openModal('signup'); return false;">Sumali bilang Miyembro</a>
      </div>
    </div>
  </section>

  <!-- ====== LOGIN MODAL ====== -->
  <div class="modal-overlay" id="modal-login" onclick="if(event.target===this)closeModals()">
    <div class="modal">
      <button class="modal-close" onclick="closeModals()">&times;</button>
      <h2>Maligayang Pagbabalik</h2>
      <div class="modal-sub">Mag-sign in sa iyong Ronin Brotherhood account</div>
      <div class="form-error" id="login-error"></div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="login-email" placeholder="iyong@email.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="login-password" placeholder="Ilagay ang password" onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <button class="btn-submit" id="btn-login-submit" onclick="doLogin()">Mag-sign In</button>
      <div class="switch-link">Wala pang account? <a onclick="openModal('signup')">Sumali sa Kapatiran</a></div>
    </div>
  </div>

  <!-- ====== SIGNUP MODAL ====== -->
  <div class="modal-overlay" id="modal-signup" onclick="if(event.target===this)closeModals()">
    <div class="modal">
      <button class="modal-close" onclick="closeModals()">&times;</button>
      <h2>Sumali sa Kapatiran</h2>
      <div class="modal-sub">Magparehistro bilang miyembro ng Ronin Brotherhood</div>
      <div class="form-error" id="signup-error"></div>
      <div class="form-success" id="signup-success"></div>
      <div class="form-row">
        <div class="form-group">
          <label>Pangalan *</label>
          <input type="text" id="signup-first" placeholder="Pangalan">
        </div>
        <div class="form-group">
          <label>Apelyido *</label>
          <input type="text" id="signup-last" placeholder="Apelyido">
        </div>
      </div>
      <div class="form-group">
        <label>Email *</label>
        <input type="email" id="signup-email" placeholder="iyong@email.com">
      </div>
      <div class="form-group">
        <label>Password *</label>
        <input type="password" id="signup-password" placeholder="Hindi bababa sa 6 character">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Telepono</label>
          <input type="tel" id="signup-phone" placeholder="+63 912 345 6789">
        </div>
        <div class="form-group">
          <label>Bansa</label>
          <input type="text" id="signup-country" placeholder="Pilipinas" value="Pilipinas">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ranggo</label>
          <select id="signup-rank">
            <option value="">Pumili ng ranggo...</option>
            <option value="Shodan">Shodan (1st Dan)</option>
            <option value="Nidan">Nidan (2nd Dan)</option>
            <option value="Sandan">Sandan (3rd Dan)</option>
            <option value="Yondan">Yondan (4th Dan)</option>
            <option value="Godan">Godan (5th Dan)</option>
            <option value="Rokudan">Rokudan (6th Dan)</option>
            <option value="Nanadan">Nanadan (7th Dan)</option>
            <option value="Hachidan">Hachidan (8th Dan)</option>
            <option value="Kudan">Kudan (9th Dan)</option>
            <option value="Judan">Judan (10th Dan)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Pangalan ng Dojo</label>
          <input type="text" id="signup-dojo" placeholder="Pangalan ng iyong paaralan">
        </div>
      </div>
      <div class="form-group">
        <label>Pangunahing Estilo</label>
        <select id="signup-style">
          <option value="Goju Ryu">Goju Ryu</option>
          <option value="Shotokan">Shotokan</option>
          <option value="Taekwondo">Taekwondo</option>
          <option value="Judo">Judo</option>
          <option value="Brazilian Jiu-Jitsu">Brazilian Jiu-Jitsu</option>
          <option value="MMA">MMA</option>
          <option value="Krav Maga">Krav Maga</option>
          <option value="Arnis/Eskrima">Arnis/Eskrima</option>
          <option value="Iba pa">Iba pa</option>
        </select>
      </div>
      <button class="btn-submit" id="btn-signup-submit" onclick="doSignup()">Gumawa ng Account</button>
      <div class="switch-link">Miyembro na? <a onclick="openModal('login')">Mag-sign In</a></div>
    </div>
  </div>

  <footer>
    <div class="container footer-inner">
      <div class="footer-copy">&copy; ${new Date().getFullYear()} Ronin Brotherhood LLC. Lahat ng karapatan ay nakalaan.</div>
      <div class="footer-links">
        <a href="/ronin/api/v1/groups">Mga Grupo</a>
        <a href="/ronin/api/v1/products">Tindahan</a>
        <a href="/ronin/api/v1/training">Pagsasanay</a>
        <a href="/ronin/api/v1/events">Mga Kaganapan</a>
        <a href="/ronin/api/v1/press">Balita</a>
      </div>
    </div>
  </footer>

  <script>
    var API = '/ronin/api/v1';
    var memberToken = localStorage.getItem('ronin_token');

    function openModal(type) { closeModals(); document.getElementById('modal-' + type).classList.add('active'); }
    function closeModals() { document.querySelectorAll('.modal-overlay').forEach(function(m) { m.classList.remove('active'); }); }

    function doLogin() {
      var email = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;
      var errEl = document.getElementById('login-error');
      var btn = document.getElementById('btn-login-submit');
      errEl.style.display = 'none';
      if (!email || !password) { errEl.textContent = 'Kinakailangan ang email at password'; errEl.style.display = 'block'; return; }
      btn.disabled = true; btn.textContent = 'Nag-si-sign in...';
      fetch(API + '/members/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: password }) })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false; btn.textContent = 'Mag-sign In';
        if (data.success && data.token) { localStorage.setItem('ronin_token', data.token); memberToken = data.token; closeModals(); location.reload(); }
        else { errEl.textContent = data.error || 'Hindi makapag-login'; errEl.style.display = 'block'; }
      }).catch(function() { btn.disabled = false; btn.textContent = 'Mag-sign In'; errEl.textContent = 'Error sa koneksyon.'; errEl.style.display = 'block'; });
    }

    function doSignup() {
      var first = document.getElementById('signup-first').value.trim();
      var last = document.getElementById('signup-last').value.trim();
      var email = document.getElementById('signup-email').value.trim();
      var password = document.getElementById('signup-password').value;
      var phone = document.getElementById('signup-phone').value.trim();
      var country = document.getElementById('signup-country').value.trim();
      var rank = document.getElementById('signup-rank').value;
      var dojo = document.getElementById('signup-dojo').value.trim();
      var style = document.getElementById('signup-style').value;
      var errEl = document.getElementById('signup-error');
      var successEl = document.getElementById('signup-success');
      var btn = document.getElementById('btn-signup-submit');
      errEl.style.display = 'none'; successEl.style.display = 'none';
      if (!first || !last || !email || !password) { errEl.textContent = 'Kinakailangan ang pangalan, apelyido, email, at password'; errEl.style.display = 'block'; return; }
      if (password.length < 6) { errEl.textContent = 'Ang password ay dapat hindi bababa sa 6 character'; errEl.style.display = 'block'; return; }
      btn.disabled = true; btn.textContent = 'Gumagawa ng account...';
      fetch(API + '/members/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ first_name: first, last_name: last, email: email, password: password, phone: phone, country: country, rank: rank, dojo_name: dojo, styles: style ? [style] : [] }) })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false; btn.textContent = 'Gumawa ng Account';
        if (data.success) {
          if (data.token) { localStorage.setItem('ronin_token', data.token); memberToken = data.token; closeModals(); location.reload(); }
          else { successEl.textContent = 'Nagawa na ang account! Maaari ka nang mag-sign in.'; successEl.style.display = 'block'; setTimeout(function() { openModal('login'); }, 1500); }
        } else { errEl.textContent = data.error || 'Hindi makapagparehistro'; errEl.style.display = 'block'; }
      }).catch(function() { btn.disabled = false; btn.textContent = 'Gumawa ng Account'; errEl.textContent = 'Error sa koneksyon.'; errEl.style.display = 'block'; });
    }

    function logout() { localStorage.removeItem('ronin_token'); memberToken = null; location.reload(); }

    fetch('/ronin/api/v1/products?featured=true&limit=4')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success && data.data.length > 0) {
          var c = document.getElementById('products-container-fil');
          c.innerHTML = data.data.map(function(p) {
            return '<div class="product-card"><div class="product-img">&#x1F94B;</div><div class="product-info"><div class="product-cat">' + p.category + '</div><div class="product-name">' + p.name + '</div><div class="product-price">$' + parseFloat(p.price).toFixed(2) + '</div></div></div>';
          }).join('');
        }
      }).catch(function() {});

    fetch('/ronin/api/v1/training/rpdta')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success && data.data.length > 0) {
          var c = document.getElementById('courses-container-fil');
          c.innerHTML = data.data.map(function(course) {
            return '<div class="course-card"><div class="course-info"><h3>' + course.title + '</h3><div class="course-meta"><span>' + course.duration_hours + ' oras</span><span>' + (course.certification_awarded || 'Sertipiko') + '</span><span>' + (course.requires_clearance ? 'Kailangan ng Clearance' : 'Bukas na Pagpapatala') + '</span></div></div><div class="course-price">$' + parseFloat(course.price).toFixed(2) + '</div></div>';
          }).join('');
        }
      }).catch(function() {});
  </script>
</body>
</html>`);
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use(notFound);
app.use(errorHandler);

// ============================================================================
// EXPORT
// ============================================================================

module.exports = app;
