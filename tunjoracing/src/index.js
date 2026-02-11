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

  // Serve a simple landing page instead
  app.get(`${BASE_PATH}/`, (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TunjoRacing Platform</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container { text-align: center; padding: 40px; }
          h1 { font-size: 3rem; margin-bottom: 1rem; }
          .tagline { font-size: 1.2rem; opacity: 0.8; margin-bottom: 2rem; }
          .status {
            background: rgba(255,255,255,0.1);
            padding: 20px 40px;
            border-radius: 10px;
            display: inline-block;
          }
          .status h3 { color: #00ff88; margin-bottom: 10px; }
          .endpoints { text-align: left; margin-top: 20px; }
          .endpoints a { color: #4fc3f7; text-decoration: none; display: block; margin: 5px 0; }
          .endpoints a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🏎️ TunjoRacing</h1>
          <p class="tagline">Sponsorship Intelligence & Fan Engagement Platform</p>
          <div class="status">
            <h3>✅ Platform Active</h3>
            <p>API Server Running</p>
            <div class="endpoints">
              <a href="/tunjoracing/health">Health Check</a>
              <a href="/tunjoracing/api/v1/races">Race Calendar API</a>
              <a href="/tunjoracing/api/v1/products">Store Products API</a>
            </div>
          </div>
        </div>
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
