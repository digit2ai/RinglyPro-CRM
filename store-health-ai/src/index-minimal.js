#!/usr/bin/env node
'use strict';

/**
 * Store Health AI - Minimal Test Version
 * Loads without database dependencies for testing
 */

const express = require('express');

// Initialize Express app
const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Store Health AI minimal test - routing works!',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Store Health AI API (Minimal Test)',
    version: '1.0.0',
    status: 'online',
    message: 'Module loaded successfully!'
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ test: 'success', message: 'Store Health AI routes are working!' });
});

module.exports = app;
