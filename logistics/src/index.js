#!/usr/bin/env node
'use strict';

/**
 * LOGISTICS Warehouse Data Analytics Platform
 * Warehouse data upload, analysis, and RinglyPro Logistics product matching
 *
 * Mounted at: /logistics
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const BASE_PATH = process.env.LOGISTICS_BASE_PATH || '';

// Dashboard static files path
const dashboardDistPath = path.join(__dirname, '..', 'dashboard', 'dist');
console.log('📊 LOGISTICS: Checking dashboard at:', dashboardDistPath);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

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

// Migrate old pinaxis_* tables to logistics_* (one-time rename)
(async () => {
  try {
    const renameMap = [
      ['pinaxis_projects', 'logistics_projects'],
      ['pinaxis_uploaded_files', 'logistics_uploaded_files'],
      ['pinaxis_item_master', 'logistics_item_master'],
      ['pinaxis_inventory_data', 'logistics_inventory_data'],
      ['pinaxis_goods_in_data', 'logistics_goods_in_data'],
      ['pinaxis_goods_out_data', 'logistics_goods_out_data'],
      ['pinaxis_product_recommendations', 'logistics_product_recommendations'],
      ['pinaxis_analysis_results', 'logistics_analysis_results'],
      ['pinaxis_api_keys', 'logistics_api_keys'],
      ['pinaxis_telemetry_events', 'logistics_telemetry_events'],
      ['pinaxis_oee_machines', 'logistics_oee_machines'],
      ['pinaxis_oee_machine_events', 'logistics_oee_machine_events'],
      ['pinaxis_oee_production_runs', 'logistics_oee_production_runs'],
    ];
    for (const [oldName, newName] of renameMap) {
      const [exists] = await models.sequelize.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${oldName}'`
      );
      if (exists.length > 0) {
        await models.sequelize.query(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
        console.log(`📊 Renamed table ${oldName} → ${newName}`);
      }
    }
  } catch (e) {
    console.log('⚠️ Table rename migration:', e.message);
  }
})().then(() => {

models.sequelize.sync({ alter: false }).then(async () => {
  console.log('✅ LOGISTICS database tables synced');
  dbReady = true;

  // Auto-migrate: ensure all tables exist
  try {
    const [tables] = await models.sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'logistics_%'"
    );
    console.log('📊 LOGISTICS tables found:', tables.map(t => t.table_name).join(', '));
  } catch (e) {
    console.log('⚠️ LOGISTICS table check:', e.message);
  }

  // Auto-migrate: add missing columns
  try {
    await models.sequelize.query(`ALTER TABLE logistics_goods_out_data ADD COLUMN IF NOT EXISTS order_type VARCHAR(100)`);
    console.log('✅ LOGISTICS: order_type column ensured');
  } catch (e) {
    console.log('⚠️ LOGISTICS migration:', e.message);
  }

  // Unique indexes for production API upsert support
  try {
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_item_master_project_sku_uq ON logistics_item_master (project_id, sku)`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_inventory_project_sku_date_uq ON logistics_inventory_data (project_id, sku, COALESCE(snapshot_date, '1970-01-01'))`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_goods_in_project_receipt_sku_uq ON logistics_goods_in_data (project_id, COALESCE(receipt_id, ''), sku, receipt_date)`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_goods_out_project_order_sku_uq ON logistics_goods_out_data (project_id, order_id, sku, ship_date)`);
    // OEE unique indexes
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_oee_machines_project_name_uq ON logistics_oee_machines (project_id, name)`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_oee_machine_events_project_machine_time_uq ON logistics_oee_machine_events (project_id, machine_name, recorded_at)`);
    await models.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS logistics_oee_production_runs_project_machine_shift_uq ON logistics_oee_production_runs (project_id, machine_name, shift_start)`);
    console.log('📊 LOGISTICS unique indexes verified for production API (including OEE)');
  } catch (e) {
    console.log('⚠️ LOGISTICS unique index migration:', e.message);
  }
}).catch(err => {
  console.log('⚠️ LOGISTICS database sync warning:', err.message);
});

}); // end table rename migration

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
  const voiceAgentRoutes = require('./routes/voice-agent');
  const telemetryRoutes = require('./routes/telemetry');
  const ndaRoutes = require('./routes/nda');
  const simulationRoutes = require('./routes/simulation');
  const pricingSnapshotRoutes = require('./routes/pricing-snapshot');
  const approvalsRoutes = require('./routes/approvals');

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
  app.use(`${BASE_PATH}/api/v1/voice`, voiceAgentRoutes);
  app.use(`${BASE_PATH}/api/v1/telemetry`, telemetryRoutes);
  app.use(`${BASE_PATH}/api/v1/nda`, ndaRoutes);
  app.use(`${BASE_PATH}/api/v1/simulation`, simulationRoutes);
  app.use(`${BASE_PATH}/api/v1/pricing-snapshot`, pricingSnapshotRoutes);
  app.use(`${BASE_PATH}/api/v1/approvals`, approvalsRoutes);

  routesLoaded = true;
  console.log('✅ LOGISTICS routes loaded successfully');
  console.log('📊 LOGISTICS API routes mounted:');
  console.log('   - /health');
  console.log('   - /api/v1/projects');
  console.log('   - /api/v1/upload');
  console.log('   - /api/v1/analysis');
  console.log('   - /api/v1/products');
  console.log('   - /api/v1/reports');
  console.log('   - /api/v1/demo');
  console.log('   - /api/v1/ingest (Production API - auth required)');
  console.log('   - /api/v1/voice (ElevenLabs Voice Agent)');
  console.log('   - /api/v1/telemetry (Live Observability)');
} catch (error) {
  console.log('⚠️ Some LOGISTICS routes failed to load:', error.message);
  console.log('   Error stack:', error.stack);
}

// Fallback health if routes failed
if (!routesLoaded) {
  app.get(`${BASE_PATH}/health`, (req, res) => {
    res.json({
      status: 'partial',
      message: 'LOGISTICS running without full routes',
      timestamp: new Date().toISOString()
    });
  });
}

// Serve dashboard static files if they exist
if (fs.existsSync(dashboardDistPath)) {
  console.log('📊 Serving LOGISTICS dashboard from:', dashboardDistPath);
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
  console.log('⚠️ LOGISTICS dashboard not built yet');

  app.get(`${BASE_PATH}/`, (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LOGISTICS - Warehouse Data Analytics</title>
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
    <div class="badge">POWERED BY RinglyPro Logistics</div>
    <h1><span>LOGISTICS</span> Analytics</h1>
    <p>Warehouse Data Analytics Platform</p>
    <p style="font-size: 14px;">Upload warehouse data, run automated analysis, and get RinglyPro Logistics product recommendations.</p>
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
