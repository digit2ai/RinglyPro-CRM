#!/usr/bin/env node
'use strict';

/**
 * TunjoRacing Platform - API Server
 * Sponsorship Intelligence, Fan Engagement, Analytics & E-Commerce Platform
 *
 * Mounted at: /tunjoracing
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
const BASE_PATH = process.env.TUNJO_BASE_PATH || '';

// Dashboard static files path
const dashboardDistPath = path.join(__dirname, '..', 'dashboard', 'dist');
console.log('🏎️ TunjoRacing: Checking dashboard at:', dashboardDistPath);

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security - configure helmet for React app
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Request ID for tracing
app.use((req, res, next) => {
  req.id = Math.random().toString(36).substring(7);
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

// Import routes - wrapped in try-catch for resilience
let healthRoutes, sponsorRoutes, fanRoutes, productRoutes, cartRoutes, checkoutRoutes,
    orderRoutes, mediaRoutes, raceRoutes, inquiryRoutes, adminRoutes;
let routesLoaded = false;

try {
  healthRoutes = require('./routes/health');
  sponsorRoutes = require('./routes/sponsors');
  fanRoutes = require('./routes/fans');
  productRoutes = require('./routes/products');
  cartRoutes = require('./routes/cart');
  checkoutRoutes = require('./routes/checkout');
  orderRoutes = require('./routes/orders');
  mediaRoutes = require('./routes/media');
  raceRoutes = require('./routes/races');
  inquiryRoutes = require('./routes/inquiries');
  adminRoutes = require('./routes/admin');
  routesLoaded = true;
  console.log('✅ TunjoRacing routes loaded successfully');

  // Auto-sync database tables on startup
  const models = require('../models');
  models.sequelize.sync({ alter: false }).then(() => {
    console.log('✅ TunjoRacing database tables synced');
  }).catch(err => {
    console.log('⚠️ TunjoRacing database sync warning:', err.message);
  });
} catch (error) {
  console.log('⚠️ Some TunjoRacing routes failed to load:', error.message);
  console.log('   Error stack:', error.stack);
}

// Diagnostic endpoint
app.get(`${BASE_PATH}/diagnostic`, (req, res) => {
  const distPath = path.join(__dirname, '..', 'dashboard', 'dist');
  const distExists = fs.existsSync(distPath);
  const files = distExists ? fs.readdirSync(distPath) : [];
  res.json({
    service: 'TunjoRacing Platform',
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
  // Health check
  app.use(`${BASE_PATH}/health`, healthRoutes);

  // API v1 routes
  app.use(`${BASE_PATH}/api/v1/admin`, adminRoutes);
  app.use(`${BASE_PATH}/api/v1/sponsors`, sponsorRoutes);
  app.use(`${BASE_PATH}/api/v1/fans`, fanRoutes);
  app.use(`${BASE_PATH}/api/v1/products`, productRoutes);
  app.use(`${BASE_PATH}/api/v1/cart`, cartRoutes);
  app.use(`${BASE_PATH}/api/v1/checkout`, checkoutRoutes);
  app.use(`${BASE_PATH}/api/v1/orders`, orderRoutes);
  app.use(`${BASE_PATH}/api/v1/media`, mediaRoutes);
  app.use(`${BASE_PATH}/api/v1/races`, raceRoutes);
  app.use(`${BASE_PATH}/api/v1/inquiries`, inquiryRoutes);

  console.log('🏎️ TunjoRacing API routes mounted:');
  console.log('   - /health');
  console.log('   - /api/v1/admin');
  console.log('   - /api/v1/sponsors');
  console.log('   - /api/v1/fans');
  console.log('   - /api/v1/products');
  console.log('   - /api/v1/cart');
  console.log('   - /api/v1/checkout');
  console.log('   - /api/v1/orders');
  console.log('   - /api/v1/media');
  console.log('   - /api/v1/races');
  console.log('   - /api/v1/inquiries');
} else {
  // Fallback health endpoint
  app.get(`${BASE_PATH}/health`, (req, res) => {
    res.json({
      status: 'partial',
      message: 'TunjoRacing running without database',
      timestamp: new Date().toISOString(),
      dashboard: 'available',
      api: 'limited'
    });
  });
}

// Serve dashboard static files if they exist
if (fs.existsSync(dashboardDistPath)) {
  console.log('📊 Serving TunjoRacing dashboard from:', dashboardDistPath);
  app.use(`${BASE_PATH}/`, express.static(dashboardDistPath));

  // Serve index.html for all non-API routes (SPA routing)
  app.get(`${BASE_PATH}/*`, (req, res, next) => {
    // Skip API and health routes
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
  console.log('⚠️ TunjoRacing dashboard not built yet');

  // Serve a professional landing page
  app.get(`${BASE_PATH}/`, (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TunjoRacing - Professional Motorsport</title>
  <meta name="description" content="TunjoRacing - Professional International Motorsport. Shop merchandise, follow the race calendar, and become a sponsor.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #0a0a0a; --panel: #1a1a1a; --accent: #e31837; --text: #fff; --muted: #888; --line: #333; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    .container { max-width: 1120px; margin: 0 auto; padding: 0 20px; }

    /* Header */
    header { position: fixed; top: 0; left: 0; right: 0; z-index: 50; background: rgba(10,10,10,.95); border-bottom: 1px solid var(--line); backdrop-filter: blur(10px); }
    .header-inner { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; }
    .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--text); }
    .brand-mark { width: 34px; height: 34px; border-radius: 12px; background: linear-gradient(135deg, var(--accent), #8b0000); border: 1px solid var(--accent); }
    .brand-title { font-weight: 700; letter-spacing: .1em; font-size: 14px; }
    nav { display: flex; gap: 24px; }
    nav a { color: var(--muted); text-decoration: none; font-size: 13px; }
    nav a:hover { color: var(--accent); }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 20px; border-radius: 999px; background: var(--accent); color: #000; text-decoration: none; font-weight: 700; font-size: 14px; transition: background .2s; }
    .btn:hover { background: #ff1f41; }
    .btn-ghost { background: transparent; color: var(--text); border: 2px solid #444; }
    .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

    /* Hero */
    .hero { min-height: 100vh; display: flex; align-items: center; padding-top: 80px; background: linear-gradient(180deg, rgba(0,0,0,.4), rgba(0,0,0,.9)), url('https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1600') center/cover; }
    .hero-content { max-width: 600px; }
    .pill { display: inline-block; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--accent); background: rgba(227,24,55,.1); color: var(--accent); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 16px; }
    .hero h1 { font-size: clamp(32px, 5vw, 48px); font-weight: 800; line-height: 1.1; margin-bottom: 16px; }
    .hero h1 span { color: var(--accent); text-decoration: underline; text-underline-offset: 6px; }
    .hero p { color: #666; font-size: 18px; margin-bottom: 24px; }
    .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }

    /* Stats */
    .stats-section { padding: 64px 0; background: #111; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .stat { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 20px; text-align: center; }
    .stat-num { font-size: 28px; font-weight: 800; color: var(--accent); }
    .stat-label { font-size: 12px; color: var(--muted); margin-top: 4px; }

    /* Sections */
    .section { padding: 64px 0; }
    .section-title { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .section-sub { color: var(--muted); margin-bottom: 32px; }

    /* Products */
    .products-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    .product-card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; transition: transform .2s, border-color .2s; text-decoration: none; color: var(--text); }
    .product-card:hover { transform: translateY(-4px); border-color: var(--accent); }
    .product-img { width: 100%; height: 200px; object-fit: cover; }
    .product-info { padding: 16px; }
    .product-cat { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
    .product-name { font-weight: 600; margin: 4px 0; }
    .product-price { color: var(--accent); font-weight: 700; }

    /* CTA */
    .cta-band { display: flex; align-items: center; justify-content: space-between; padding: 24px; border-radius: 18px; border: 1px solid var(--accent); background: rgba(227,24,55,.05); margin-top: 32px; }
    .cta-band h3 { font-weight: 700; }
    .cta-band p { color: var(--muted); font-size: 14px; }

    /* Footer */
    footer { border-top: 1px solid var(--line); padding: 24px 0; text-align: center; color: var(--muted); font-size: 13px; }

    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .products-grid { grid-template-columns: 1fr; }
      nav { display: none; }
      .cta-band { flex-direction: column; text-align: center; gap: 16px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="container header-inner">
      <a href="/tunjoracing/" class="brand">
        <div class="brand-mark"></div>
        <span class="brand-title">TUNJO RACING</span>
      </a>
      <nav>
        <a href="#about">About</a>
        <a href="#products">Shop</a>
        <a href="/tunjoracing/api/v1/races">Calendar</a>
        <a href="#contact">Sponsorship</a>
      </nav>
      <a href="#contact" class="btn">Become a Partner</a>
    </div>
  </header>

  <section class="hero">
    <div class="container">
      <div class="hero-content">
        <span class="pill">2025 Partnership Program</span>
        <h1>Accelerate Your Brand with <span>TUNJO RACING</span></h1>
        <p>Through passion, performance, and global visibility at every race, your company will connect with motorsport fans worldwide.</p>
        <div class="hero-actions">
          <a href="#contact" class="btn">Become a Partner</a>
          <a href="#products" class="btn btn-ghost">Shop Merchandise</a>
        </div>
      </div>
    </div>
  </section>

  <section class="stats-section">
    <div class="container">
      <div class="stats-grid">
        <div class="stat"><div class="stat-num">50+</div><div class="stat-label">Wins & Podiums</div></div>
        <div class="stat"><div class="stat-num">15+</div><div class="stat-label">Pro Seasons</div></div>
        <div class="stat"><div class="stat-num">540M</div><div class="stat-label">Global Viewers</div></div>
        <div class="stat"><div class="stat-num">156</div><div class="stat-label">Countries</div></div>
      </div>
    </div>
  </section>

  <section class="section" id="products">
    <div class="container">
      <h2 class="section-title">Official Merchandise</h2>
      <p class="section-sub">Gear up with official TunjoRacing apparel and collectibles</p>
      <div class="products-grid" id="products-container">
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">Loading products...</div>
      </div>
      <div class="cta-band">
        <div>
          <h3>Ready to check out?</h3>
          <p>Free shipping on orders over $100</p>
        </div>
        <a href="/tunjoracing/api/v1/products" class="btn">View All Products</a>
      </div>
    </div>
  </section>

  <section class="section" id="contact" style="background: #111; border-top: 1px solid var(--line);">
    <div class="container" style="text-align: center;">
      <h2 class="section-title">Become a Partner</h2>
      <p class="section-sub">Join the TunjoRacing family and accelerate your brand</p>
      <p style="color: var(--muted); margin-bottom: 24px;">Contact us at <a href="mailto:sponsors@tunjoracing.com" style="color: var(--accent);">sponsors@tunjoracing.com</a></p>
      <a href="mailto:sponsors@tunjoracing.com" class="btn">Request Media Kit</a>
    </div>
  </section>

  <footer>
    <div class="container">
      &copy; ${new Date().getFullYear()} TunjoRacing. All rights reserved.
    </div>
  </footer>

  <script>
    fetch('/tunjoracing/api/v1/products?limit=6')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data.length > 0) {
          const container = document.getElementById('products-container');
          container.innerHTML = data.data.map(p => {
            let img = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400';
            try { const imgs = typeof p.images === 'string' ? JSON.parse(p.images) : p.images; if(imgs && imgs[0]) img = imgs[0]; } catch(e) {}
            return \`<a href="/tunjoracing/api/v1/products/\${p.slug}" class="product-card">
              <img src="\${img}" alt="\${p.name}" class="product-img">
              <div class="product-info">
                <div class="product-cat">\${p.category}</div>
                <div class="product-name">\${p.name}</div>
                <div class="product-price">$\${parseFloat(p.price).toFixed(2)}</div>
              </div>
            </a>\`;
          }).join('');
        }
      })
      .catch(() => {
        document.getElementById('products-container').innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">Products coming soon!</div>';
      });
  </script>
</body>
</html>`);
  });
      </body>
      </html>
    `);
  });
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// ============================================================================
// EXPORT
// ============================================================================

module.exports = app;
