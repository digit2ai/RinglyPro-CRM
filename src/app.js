// src/app.js - Complete application setup with all routes
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Trust proxy for Render deployment
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? 'connected' : 'not configured'
  });
});

// Main dashboard route
app.get('/', (req, res) => {
  res.render('dashboard', { 
    title: 'RinglyPro CRM',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/calls', require('./routes/calls')); // 🎯 THIS IS THE MISSING LINE!

// Legacy webhook routes (for backward compatibility)
app.use('/webhook', require('./routes/messages')); // Legacy SMS webhook
app.use('/webhook/twilio', require('./routes/messages')); // Legacy Twilio webhook

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.render('dashboard', { 
    title: 'RinglyPro CRM',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error handler:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
