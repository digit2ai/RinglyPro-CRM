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
    .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--text); }
    .brand-mark { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), #8b0000); border: 2px solid var(--gold); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; color: var(--gold); font-family: 'Noto Serif', serif; }
    .brand-title { font-weight: 700; letter-spacing: .15em; font-size: 13px; text-transform: uppercase; }
    .brand-sub { font-size: 10px; color: var(--muted); letter-spacing: .08em; }
    nav { display: flex; gap: 20px; }
    nav a { color: var(--muted); text-decoration: none; font-size: 13px; font-weight: 500; }
    nav a:hover { color: var(--accent); }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; transition: all .2s; border: none; cursor: pointer; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #ff1a1a; }
    .btn-gold { background: transparent; color: var(--gold); border: 2px solid var(--gold); }
    .btn-gold:hover { background: var(--gold); color: #000; }

    .hero { min-height: 100vh; display: flex; align-items: center; padding-top: 80px; background: linear-gradient(to right, rgba(10,10,10,.92) 0%, rgba(10,10,10,.7) 50%, rgba(10,10,10,.3) 100%), url('https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699780603873afe495adab89.png'); background-size: cover; background-position: center right; }
    .hero-content { max-width: 680px; }
    .hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--gold); color: var(--gold); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 20px; }
    .hero h1 { font-family: 'Noto Serif', serif; font-size: clamp(32px, 5vw, 52px); font-weight: 700; line-height: 1.15; margin-bottom: 16px; }
    .hero h1 .highlight { color: var(--accent); }
    .hero p { color: var(--muted); font-size: 18px; margin-bottom: 28px; max-width: 560px; }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .hero-quote { margin-top: 40px; padding: 16px 20px; border-left: 3px solid var(--gold); }
    .hero-quote p { font-family: 'Noto Serif', serif; font-style: italic; color: var(--muted); font-size: 15px; margin-bottom: 4px; }
    .hero-quote cite { color: #555; font-size: 12px; }

    .photo-strip { padding: 0; overflow: hidden; background: #0a0a0a; border-top: 1px solid var(--line); }
    .photo-strip-inner { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0; }
    .photo-strip-inner img { width: 100%; height: 220px; object-fit: cover; display: block; filter: grayscale(30%); transition: filter .3s, transform .3s; }
    .photo-strip-inner img:hover { filter: grayscale(0%); transform: scale(1.03); z-index: 1; }
    @media (max-width: 768px) { .photo-strip-inner { grid-template-columns: repeat(3, 1fr); } .photo-strip-inner img { height: 140px; } .photo-strip-inner img:nth-child(4), .photo-strip-inner img:nth-child(5) { display: none; } }

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

    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .groups-grid { grid-template-columns: 1fr; }
      .products-grid { grid-template-columns: repeat(2, 1fr); }
      nav { display: none; }
      .footer-inner { flex-direction: column; gap: 12px; }
      .modal { padding: 24px; }
      .modal .form-row { grid-template-columns: 1fr; }
      .dojo-form .form-row { grid-template-columns: 1fr; }
      .header-auth { gap: 6px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="container header-inner">
      <a href="/ronin/" class="brand">
        <div class="brand-mark">R</div>
        <div>
          <div class="brand-title">Ronin Brotherhood</div>
          <div class="brand-sub">Martial Arts Federation</div>
        </div>
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
          <p>"A journey of a thousand miles begins with a single step."</p>
          <cite>- Lao Tzu</cite>
        </div>
      </div>
    </div>
  </section>

  <section class="photo-strip">
    <div class="photo-strip-inner">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782813ff51693e263e40a.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782773873af78f3ae844f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782768d5b5a64b992f22f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782761817151e36b61a7f.png" alt="Ronin Brotherhood">
      <img src="https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/699782763873afe6caae843d.jpg" alt="Ronin Brotherhood">
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

  <section class="section" id="training">
    <div class="container">
      <h2 class="section-title">RPDTA Tactical Training</h2>
      <p class="section-sub">Professional law enforcement and military training programs</p>
      <div class="courses-list" id="courses-container">
        <div style="text-align: center; padding: 40px; color: var(--muted);">Loading courses...</div>
      </div>
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
// ERROR HANDLING
// ============================================================================

app.use(notFound);
app.use(errorHandler);

// ============================================================================
// EXPORT
// ============================================================================

module.exports = app;
