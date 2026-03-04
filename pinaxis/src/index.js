#!/usr/bin/env node
'use strict';

/**
 * PINAXIS Warehouse Data Analytics Platform
 * Warehouse data upload, analysis, and GEBHARDT product matching
 *
 * Mounted at: /pinaxis
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();
const BASE_PATH = process.env.PINAXIS_BASE_PATH || '';

// Dashboard static files path
const dashboardDistPath = path.join(__dirname, '..', 'dashboard', 'dist');
console.log('📊 PINAXIS: Checking dashboard at:', dashboardDistPath);

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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request ID for tracing
app.use((req, res, next) => {
  req.id = Math.random().toString(36).substring(7);
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ============================================================================
// DATABASE
// ============================================================================

const models = require('../models');
let dbReady = false;

models.sequelize.sync({ alter: false }).then(async () => {
  console.log('✅ PINAXIS database tables synced');
  dbReady = true;

  // Auto-migrate: ensure all tables exist
  try {
    const [tables] = await models.sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'pinaxis_%'"
    );
    console.log('📊 PINAXIS tables found:', tables.map(t => t.table_name).join(', '));
  } catch (e) {
    console.log('⚠️ PINAXIS table check:', e.message);
  }

  // Unique indexes for production API upsert support
  try {
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS pinaxis_item_master_project_sku_uq ON pinaxis_item_master (project_id, sku)`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS pinaxis_inventory_project_sku_date_uq ON pinaxis_inventory_data (project_id, sku, COALESCE(snapshot_date, '1970-01-01'))`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS pinaxis_goods_in_project_receipt_sku_uq ON pinaxis_goods_in_data (project_id, COALESCE(receipt_id, ''), sku, receipt_date)`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS pinaxis_goods_out_project_order_sku_uq ON pinaxis_goods_out_data (project_id, order_id, sku, ship_date)`);
    console.log('📊 PINAXIS unique indexes verified for production API');
  } catch (e) {
    console.log('⚠️ PINAXIS unique index migration:', e.message);
  }
}).catch(err => {
  console.log('⚠️ PINAXIS database sync warning:', err.message);
});

// Make models available to routes
app.use((req, res, next) => {
  req.models = models;
  req.dbReady = dbReady;
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

let routesLoaded = false;

try {
  const healthRoutes = require('./routes/health');
  const projectRoutes = require('./routes/projects');
  const uploadRoutes = require('./routes/upload');
  const analysisRoutes = require('./routes/analysis');
  const productRoutes = require('./routes/products');
  const reportRoutes = require('./routes/reports');
  const demoRoutes = require('./routes/demo');
  const benefitRoutes = require('./routes/benefits');
  const ingestRoutes = require('./routes/ingest');

  // Health check
  app.use(`${BASE_PATH}/health`, healthRoutes);

  // API v1 routes
  app.use(`${BASE_PATH}/api/v1/projects`, projectRoutes);
  app.use(`${BASE_PATH}/api/v1/upload`, uploadRoutes);
  app.use(`${BASE_PATH}/api/v1/analysis`, analysisRoutes);
  app.use(`${BASE_PATH}/api/v1/products`, productRoutes);
  app.use(`${BASE_PATH}/api/v1/reports`, reportRoutes);
  app.use(`${BASE_PATH}/api/v1/demo`, demoRoutes);
  app.use(`${BASE_PATH}/api/v1/benefits`, benefitRoutes);
  app.use(`${BASE_PATH}/api/v1/ingest`, ingestRoutes);

  routesLoaded = true;
  console.log('✅ PINAXIS routes loaded successfully');
  console.log('📊 PINAXIS API routes mounted:');
  console.log('   - /health');
  console.log('   - /api/v1/projects');
  console.log('   - /api/v1/upload');
  console.log('   - /api/v1/analysis');
  console.log('   - /api/v1/products');
  console.log('   - /api/v1/reports');
  console.log('   - /api/v1/demo');
  console.log('   - /api/v1/ingest (Production API - auth required)');
} catch (error) {
  console.log('⚠️ Some PINAXIS routes failed to load:', error.message);
  console.log('   Error stack:', error.stack);
}

// Fallback health if routes failed
if (!routesLoaded) {
  app.get(`${BASE_PATH}/health`, (req, res) => {
    res.json({
      status: 'partial',
      message: 'PINAXIS running without full routes',
      timestamp: new Date().toISOString()
    });
  });
}

// Serve dashboard static files if they exist
if (fs.existsSync(dashboardDistPath)) {
  console.log('📊 Serving PINAXIS dashboard from:', dashboardDistPath);
  app.use(`${BASE_PATH}/`, express.static(dashboardDistPath));

  // SPA routing - serve index.html for non-API routes
  app.get(`${BASE_PATH}/*`, (req, res, next) => {
    if (req.path.startsWith(`${BASE_PATH}/api/`) ||
        req.path.startsWith(`${BASE_PATH}/health`)) {
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
  console.log('⚠️ PINAXIS dashboard not built yet');

  app.get(`${BASE_PATH}/`, (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PINAXIS - Warehouse Data Analytics</title>
  <style>
    :root { --bg: #0f172a; --panel: #1e293b; --accent: #3b82f6; --text: #f1f5f9; --muted: #94a3b8; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: var(--panel); border-radius: 16px; padding: 48px; max-width: 480px; text-align: center; border: 1px solid #334155; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h1 span { color: var(--accent); }
    p { color: var(--muted); margin: 12px 0; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(59,130,246,.15); color: var(--accent); font-size: 12px; margin-bottom: 16px; }
    .status { margin-top: 24px; padding: 16px; background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); border-radius: 8px; color: #22c55e; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">POWERED BY GEBHARDT</div>
    <h1><span>PINAXIS</span> Analytics</h1>
    <p>Warehouse Data Analytics Platform</p>
    <p style="font-size: 14px;">Upload warehouse data, run automated analysis, and get GEBHARDT product recommendations.</p>
    <div class="status">API Online — Dashboard coming soon</div>
  </div>
</body>
</html>`);
  });
}

// Error handling
const errorHandler = require('./middleware/error-handler');
const notFound = require('./middleware/not-found');
app.use(notFound);
app.use(errorHandler);

module.exports = app;
