#!/usr/bin/env node
'use strict';

/**
 * Store Health AI - Minimal Version with Mock Data
 * Provides ElevenLabs tool endpoints with sample data
 */

const express = require('express');
const cors = require('cors');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Store Health AI is online with mock data',
    timestamp: new Date().toISOString(),
    database: 'mock_mode'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Store Health AI API',
    version: '1.0.0',
    status: 'online',
    basePath: '',
    endpoints: {
      health: '/health',
      dashboard_overview: '/api/v1/dashboard/overview',
      critical_stores: '/api/v1/dashboard/critical-stores',
      store_details: '/api/v1/stores/:store_code',
      active_alerts: '/api/v1/alerts/active'
    }
  });
});

// ============================================================================
// ELEVENLABS TOOL ENDPOINTS (with mock data)
// ============================================================================

// Tool 1: getDashboardOverview
app.get('/api/v1/dashboard/overview', (req, res) => {
  res.json({
    total_stores: 10,
    average_health_score: 77.1,
    stores_requiring_action: 6,
    critical_stores: 4,
    stores_by_health: {
      green: 4,
      yellow: 2,
      red: 4
    },
    top_issues: [
      { issue: 'Low Sales Performance', count: 4 },
      { issue: 'Inventory Shortage', count: 3 },
      { issue: 'Labor Issues', count: 2 }
    ],
    timestamp: new Date().toISOString()
  });
});

// Tool 2: getCriticalStores
app.get('/api/v1/dashboard/critical-stores', (req, res) => {
  res.json({
    critical_stores: [
      {
        store_code: 'MH-42ST',
        store_name: 'Manhattan 42nd Street',
        health_score: 47,
        status: 'critical',
        issues: ['Sales 30% below target', 'Inventory shortage', 'Staff shortage']
      },
      {
        store_code: 'BK-HEIGHTS',
        store_name: 'Brooklyn Heights',
        health_score: 54,
        status: 'critical',
        issues: ['Sales 25% below target', 'High labor costs']
      },
      {
        store_code: 'SI-MALL',
        store_name: 'Staten Island',
        health_score: 47,
        status: 'critical',
        issues: ['Sales 35% below target', 'Low traffic']
      },
      {
        store_code: 'MH-LES',
        store_name: 'Lower East Side',
        health_score: 47,
        status: 'critical',
        issues: ['Sales 28% below target', 'Inventory issues']
      }
    ],
    count: 4,
    timestamp: new Date().toISOString()
  });
});

// Tool 3: getStoreDetails
app.get('/api/v1/stores/:store_code', (req, res) => {
  const { store_code } = req.params;

  res.json({
    store_code: store_code,
    store_name: 'Sample Store',
    health_score: 65,
    status: 'warning',
    kpis: {
      sales: { value: 85000, target: 100000, variance: -15 },
      labor: { value: 22, target: 18, variance: 22 },
      conversion: { value: 12.5, target: 15, variance: -17 },
      inventory: { value: 88, target: 95, variance: -7 },
      traffic: { value: 450, target: 500, variance: -10 }
    },
    alerts: [
      { severity: 'warning', message: 'Sales below target' },
      { severity: 'info', message: 'Inventory needs attention' }
    ],
    last_updated: new Date().toISOString()
  });
});

// Tool 4: getActiveAlerts
app.get('/api/v1/alerts/active', (req, res) => {
  res.json({
    active_alerts: [
      {
        alert_id: 1,
        store_code: 'MH-42ST',
        store_name: 'Manhattan 42nd Street',
        severity: 'critical',
        type: 'sales',
        message: 'Sales 30% below target for 3 consecutive days',
        created_at: new Date(Date.now() - 86400000).toISOString()
      },
      {
        alert_id: 2,
        store_code: 'BK-HEIGHTS',
        store_name: 'Brooklyn Heights',
        severity: 'critical',
        type: 'labor',
        message: 'Labor costs 22% over budget',
        created_at: new Date(Date.now() - 172800000).toISOString()
      },
      {
        alert_id: 3,
        store_code: 'SI-MALL',
        store_name: 'Staten Island',
        severity: 'critical',
        type: 'traffic',
        message: 'Store traffic down 35%',
        created_at: new Date(Date.now() - 259200000).toISOString()
      }
    ],
    count: 3,
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
