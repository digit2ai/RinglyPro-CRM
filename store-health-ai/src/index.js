#!/usr/bin/env node
'use strict';

/**
 * Store Health AI - API Server
 * Express REST API for Store Health Monitoring System
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Import middleware
const errorHandler = require('./middleware/error-handler');
const notFound = require('./middleware/not-found');

// Import routes - wrapped in try-catch for resilience
let healthRoutes, storeRoutes, kpiRoutes, alertRoutes, taskRoutes, escalationRoutes, dashboardRoutes, voiceRoutes;
let routesLoaded = false;

try {
  healthRoutes = require('./routes/health');
  storeRoutes = require('./routes/stores');
  kpiRoutes = require('./routes/kpis');
  alertRoutes = require('./routes/alerts');
  taskRoutes = require('./routes/tasks');
  escalationRoutes = require('./routes/escalations');
  dashboardRoutes = require('./routes/dashboard');
  voiceRoutes = require('./routes/voice');
  routesLoaded = true;
  console.log('✅ Store Health AI routes loaded successfully');
} catch (error) {
  console.log('⚠️ Some Store Health AI routes failed to load:', error.message);
  console.log('   Dashboard will still be served, but API endpoints may be limited');
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_PATH = process.env.BASE_PATH || '';

// Dashboard static files path - try root copy first, then original location
let dashboardDistPath = path.join(__dirname, '..', '..', 'store-health-ai-dashboard-dist');
if (!fs.existsSync(dashboardDistPath)) {
  dashboardDistPath = path.join(__dirname, '..', 'dashboard', 'dist');
}
console.log('🔍 Dashboard dist path:', dashboardDistPath);
console.log('🔍 Dist folder exists?', fs.existsSync(dashboardDistPath));
if (fs.existsSync(dashboardDistPath)) {
  console.log('🔍 Dist folder contents:', fs.readdirSync(dashboardDistPath));
}

// Create HTTP server and Socket.IO
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  }
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security - configure helmet to allow inline scripts for React app
app.use(helmet({
  contentSecurityPolicy: false,  // Disable CSP for React app
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

// Mount routes only if they loaded successfully
if (routesLoaded) {
  // Health check (no auth required)
  app.use(`${BASE_PATH}/health`, healthRoutes);

  // API routes (v1)
  app.use(`${BASE_PATH}/api/v1/stores`, storeRoutes);
  app.use(`${BASE_PATH}/api/v1/kpis`, kpiRoutes);
  app.use(`${BASE_PATH}/api/v1/alerts`, alertRoutes);
  app.use(`${BASE_PATH}/api/v1/tasks`, taskRoutes);
  app.use(`${BASE_PATH}/api/v1/escalations`, escalationRoutes);
  app.use(`${BASE_PATH}/api/v1/dashboard`, dashboardRoutes);
  app.use(`${BASE_PATH}/api/v1/voice`, voiceRoutes);
} else {
  // Fallback health endpoint
  app.get(`${BASE_PATH}/health`, (req, res) => {
    res.json({
      status: 'partial',
      message: 'Store Health AI running without database',
      timestamp: new Date().toISOString(),
      dashboard: 'available',
      api: 'limited'
    });
  });
}

// Serve React dashboard static files
if (fs.existsSync(dashboardDistPath)) {
  console.log('📊 Serving Store Health AI dashboard from:', dashboardDistPath);
  app.use(`${BASE_PATH}/`, express.static(dashboardDistPath));

  // Handle React Router - serve index.html for all non-API routes
  app.get(`${BASE_PATH}/*`, (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith(`${BASE_PATH}/api/`) || req.path.startsWith(`${BASE_PATH}/health`)) {
      return next();
    }
    res.sendFile(path.join(dashboardDistPath, 'index.html'));
  });
} else {
  console.log('⚠️ Dashboard dist folder not found, serving API only');
  // Fallback: Root endpoint returns API info
  app.get(`${BASE_PATH}/`, (req, res) => {
    res.json({
      name: 'Store Health AI API',
      version: '1.0.0',
      status: 'online',
      basePath: BASE_PATH,
      message: 'Dashboard not built. Run: cd dashboard && npm run build',
      endpoints: {
        health: `${BASE_PATH}/health`,
        docs: `${BASE_PATH}/api/docs`,
        stores: `${BASE_PATH}/api/v1/stores`,
        kpis: `${BASE_PATH}/api/v1/kpis`,
        alerts: `${BASE_PATH}/api/v1/alerts`,
        tasks: `${BASE_PATH}/api/v1/tasks`,
        escalations: `${BASE_PATH}/api/v1/escalations`,
        dashboard: `${BASE_PATH}/api/v1/dashboard`,
        voice: `${BASE_PATH}/api/v1/voice`
      }
    });
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
// WEBSOCKET / SOCKET.IO
// ============================================================================

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Make io available to other modules
app.set('io', io);

// ============================================================================
// START SERVER
// ============================================================================

if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                                                            ║');
    console.log('║           🏪  STORE HEALTH AI - API SERVER  🏪            ║');
    console.log('║                                                            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  Server running on port: ${PORT.toString().padEnd(34)} ║`);
    console.log(`║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(45)} ║`);
    console.log('║                                                            ║');
    console.log('║  Endpoints:                                                ║');
    console.log(`║    Health Check:  http://localhost:${PORT}/health${' '.repeat(16)} ║`);
    console.log(`║    API v1:        http://localhost:${PORT}/api/v1${' '.repeat(16)} ║`);
    console.log(`║    WebSocket:     ws://localhost:${PORT}/socket.io${' '.repeat(12)} ║`);
    console.log(`║    Stores:        /api/v1/stores${' '.repeat(26)} ║`);
    console.log(`║    KPIs:          /api/v1/kpis${' '.repeat(28)} ║`);
    console.log(`║    Alerts:        /api/v1/alerts${' '.repeat(26)} ║`);
    console.log(`║    Tasks:         /api/v1/tasks${' '.repeat(27)} ║`);
    console.log(`║    Dashboard:     /api/v1/dashboard${' '.repeat(23)} ║`);
    console.log(`║    Voice Calls:   /api/v1/voice${' '.repeat(26)} ║`);
    console.log('║                                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  });
}

module.exports = app;
