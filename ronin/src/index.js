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

    .hero { min-height: 100vh; display: flex; align-items: center; padding-top: 80px; background: radial-gradient(ellipse at 30% 50%, rgba(209,4,4,.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(196,163,90,.06) 0%, transparent 50%); }
    .hero-content { max-width: 680px; }
    .hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--gold); color: var(--gold); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 20px; }
    .hero h1 { font-family: 'Noto Serif', serif; font-size: clamp(32px, 5vw, 52px); font-weight: 700; line-height: 1.15; margin-bottom: 16px; }
    .hero h1 .highlight { color: var(--accent); }
    .hero p { color: var(--muted); font-size: 18px; margin-bottom: 28px; max-width: 560px; }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .hero-quote { margin-top: 40px; padding: 16px 20px; border-left: 3px solid var(--gold); }
    .hero-quote p { font-family: 'Noto Serif', serif; font-style: italic; color: var(--muted); font-size: 15px; margin-bottom: 4px; }
    .hero-quote cite { color: #555; font-size: 12px; }

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

    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .groups-grid { grid-template-columns: 1fr; }
      .products-grid { grid-template-columns: repeat(2, 1fr); }
      nav { display: none; }
      .footer-inner { flex-direction: column; gap: 12px; }
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
      <a href="/ronin/api/v1/members/register" class="btn btn-primary">Join the Brotherhood</a>
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
        <a href="/ronin/api/v1/members/register" class="btn btn-primary">Join as Member</a>
      </div>
    </div>
  </section>

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
