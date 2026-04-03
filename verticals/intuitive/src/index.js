#!/usr/bin/env node
'use strict';

/**
 * INTUITIVE SURGICAL — da Vinci System Matching Engine
 * Hospital data intake, analysis, and da Vinci robot-to-hospital matching
 *
 * Mounted at: /intuitive
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const BASE_PATH = process.env.INTUITIVE_BASE_PATH || '';

const dashboardDistPath = path.join(__dirname, '..', 'dashboard', 'dist');
console.log('  INTUITIVE: Checking dashboard at:', dashboardDistPath);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
  console.log('  INTUITIVE database tables synced');
  dbReady = true;

  try {
    const [tables] = await models.sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'intuitive_%'"
    );
    console.log('  INTUITIVE tables found:', tables.map(t => t.table_name).join(', '));
  } catch (e) {
    console.log('  INTUITIVE table check:', e.message);
  }
}).catch(err => {
  console.error('  INTUITIVE DB sync error:', err.message);
});

// Inject models into request
app.use((req, res, next) => {
  req.models = models;
  req.dbReady = dbReady;
  next();
});

// ============================================================================
// ROUTES
// ============================================================================

const projectRoutes = require('./routes/projects');
const analysisRoutes = require('./routes/analysis');
const healthRoutes = require('./routes/health');

app.use(`${BASE_PATH}/health`, healthRoutes);
app.use(`${BASE_PATH}/api/v1/projects`, projectRoutes);
app.use(`${BASE_PATH}/api/v1/analysis`, analysisRoutes);

// ============================================================================
// DASHBOARD (SPA)
// ============================================================================

if (fs.existsSync(dashboardDistPath)) {
  console.log('  Serving INTUITIVE dashboard from:', dashboardDistPath);
  app.use(`${BASE_PATH}/`, express.static(dashboardDistPath));

  app.get(`${BASE_PATH}/*`, (req, res, next) => {
    if (req.path.startsWith(`${BASE_PATH}/api/`) || req.path.startsWith(`${BASE_PATH}/health`)) {
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
  console.log('  INTUITIVE dashboard not built yet (no dist/ folder)');
  app.get(`${BASE_PATH}/`, (req, res) => {
    res.json({ status: 'ok', message: 'Intuitive Surgical Matching Engine API', docs: '/intuitive/api/v1/' });
  });
}

module.exports = app;
