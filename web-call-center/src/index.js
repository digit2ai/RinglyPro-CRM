#!/usr/bin/env node
'use strict';

/**
 * Web Call Center - Express Sub-App
 * Provides web-based AI call center with ElevenLabs voice integration
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const jwt = require('jsonwebtoken');

// Import sequelize from main CRM
const { sequelize } = require('../../src/models');

// Import routes with error handling
let healthRoutes, dashboardRoutes, callsRoutes, widgetRoutes, knowledgeBaseRoutes, usageRoutes, tokenRoutes;
let routesLoaded = false;

try {
  healthRoutes = require('./routes/health');
  dashboardRoutes = require('./routes/dashboard');
  callsRoutes = require('./routes/calls');
  widgetRoutes = require('./routes/widget');
  knowledgeBaseRoutes = require('./routes/knowledge-base');
  usageRoutes = require('./routes/usage');
  tokenRoutes = require('./routes/token');
  routesLoaded = true;
  console.log('Web Call Center routes loaded successfully');
} catch (error) {
  console.log('Some Web Call Center routes failed to load:', error.message);
  console.log('   Dashboard will still be served, but API endpoints may be limited');
}

// Initialize Express app
const app = express();
const BASE_PATH = process.env.WCC_BASE_PATH || '';

// Dashboard static files path
const dashboardDistPath = path.join(__dirname, '..', 'dashboard', 'dist');
const widgetStaticPath = path.join(__dirname, '..', 'widget');

// ============================================================================
// DATABASE INITIALIZATION - ALTER TABLE / CREATE TABLE on startup
// ============================================================================

const initializeDatabase = async () => {
  try {
    console.log('Web Call Center: Initializing database tables...');

    // Add product_type column to clients table if it does not exist
    await sequelize.query(`
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS product_type VARCHAR(50) DEFAULT 'voice_ai';
    `);
    console.log('  - clients.product_type column ensured');

    // Create wcc_knowledge_bases table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS wcc_knowledge_bases (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        config JSONB DEFAULT '{}',
        content TEXT,
        file_url VARCHAR(500),
        original_filename VARCHAR(255),
        record_count INTEGER DEFAULT 0,
        last_synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  - wcc_knowledge_bases table ensured');

    // Create wcc_widget_configs table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS wcc_widget_configs (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL UNIQUE,
        widget_id VARCHAR(50) NOT NULL UNIQUE,
        enabled BOOLEAN DEFAULT true,
        agent_name VARCHAR(100) DEFAULT 'AI Assistant',
        greeting_message TEXT DEFAULT 'Hi! How can I help you today?',
        primary_color VARCHAR(7) DEFAULT '#4F46E5',
        position VARCHAR(20) DEFAULT 'bottom-right',
        allowed_domains JSONB DEFAULT '[]',
        custom_css TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  - wcc_widget_configs table ensured');

    // Create indexes
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_wcc_kb_client_id ON wcc_knowledge_bases(client_id);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_wcc_widget_client ON wcc_widget_configs(client_id);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_wcc_widget_id ON wcc_widget_configs(widget_id);
    `);
    console.log('  - Indexes ensured');

    console.log('Web Call Center: Database initialization complete');
  } catch (error) {
    console.error('Web Call Center: Database initialization error:', error.message);
    console.log('Web Call Center: Continuing without full database setup - some features may be limited');
  }
};

// Run database initialization
initializeDatabase();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security - configure helmet to allow inline scripts for React app and widget
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

// ============================================================================
// ROUTES
// ============================================================================

if (routesLoaded) {
  // Health check (no auth required)
  app.use(`${BASE_PATH}/health`, healthRoutes);

  // Public token endpoint (no auth - called by widget from customer websites)
  app.use(`${BASE_PATH}/api/v1/token`, tokenRoutes);

  // API routes (v1) - auth required
  app.use(`${BASE_PATH}/api/v1/dashboard`, dashboardRoutes);
  app.use(`${BASE_PATH}/api/v1/calls`, callsRoutes);
  app.use(`${BASE_PATH}/api/v1/widget`, widgetRoutes);
  app.use(`${BASE_PATH}/api/v1/knowledge-base`, knowledgeBaseRoutes);
  app.use(`${BASE_PATH}/api/v1/usage`, usageRoutes);
} else {
  // Fallback health endpoint
  app.get(`${BASE_PATH}/health`, (req, res) => {
    res.json({
      status: 'partial',
      message: 'Web Call Center running without full route setup',
      timestamp: new Date().toISOString(),
      dashboard: 'available',
      api: 'limited'
    });
  });
}

// Serve widget static files at /widget/ (public - embedded on customer sites)
app.use(`${BASE_PATH}/widget`, express.static(widgetStaticPath));

// Serve dashboard from dashboard/dist/
app.use(`${BASE_PATH}/`, express.static(dashboardDistPath));

// SPA catch-all for React Router
app.get(`${BASE_PATH}/*`, (req, res, next) => {
  // Skip API, health, and widget routes
  if (
    req.path.startsWith(`${BASE_PATH}/api/`) ||
    req.path.startsWith(`${BASE_PATH}/health`) ||
    req.path.startsWith(`${BASE_PATH}/widget`)
  ) {
    return next();
  }
  const indexPath = path.join(dashboardDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(503).json({
        error: 'Dashboard not built',
        message: 'Run the dashboard build first: cd web-call-center/dashboard && npm run build'
      });
    }
  });
});

module.exports = app;
