// src/app.js - Enhanced with Call History Integration, Multi-Client Support, and Credit System
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Multi-Client Configuration - ADD THIS SECTION
const CLIENT_ID = process.env.CLIENT_ID || 'default';
const CLIENT_NAME = process.env.CLIENT_NAME || 'RinglyPro';
const CLIENT_DOMAIN = process.env.CLIENT_DOMAIN || 'ringlypro.com';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Import routes
const contactsRoutes = require('./routes/contacts');
const appointmentsRoutes = require('./routes/appointments');
const appointmentRoutes = require('./routes/appointment'); // Individual appointment routes
const messagesRoutes = require('./routes/messages');
const callsRoutes = require('./routes/calls'); // New call routes
const callLogRoutes = require('./routes/callLog'); // Call log routes
const voiceBotRoutes = require('./routes/voiceBot');
const creditRoutes = require('./routes/credits'); // Credit system routes

// Database connection test
const { sequelize } = require('./models');

// Test database connection
sequelize.authenticate()
  .then(() => {
    console.log('✅ Database connection established successfully.');
  })
  .catch(err => {
    console.error('❌ Unable to connect to database:', err);
  });

// API Routes
app.use('/api/contacts', contactsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/appointment', appointmentRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/calls', callsRoutes); // Mount call routes
app.use('/api/call-log', callLogRoutes); // Mount call log routes
app.use('/api/voice', voiceBotRoutes);
app.use('/api/credits', creditRoutes); // Mount credit system routes

// Voice webhook routes (for Twilio integration)
app.use('/voice', voiceBotRoutes);

// Dashboard route - UPDATED FOR MULTI-CLIENT
app.get('/', (req, res) => {
  res.render('dashboard', { 
    title: `${CLIENT_NAME} CRM Dashboard`,
    currentDate: new Date().toLocaleDateString(),
    voiceEnabled: process.env.VOICE_ENABLED === 'true' || false,
    clientName: CLIENT_NAME,
    clientId: CLIENT_ID
  });
});

// Health check endpoint - UPDATED FOR MULTI-CLIENT
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    client: CLIENT_NAME,
    clientId: CLIENT_ID,
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected',
      twilio: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'not configured',
      voice: process.env.ELEVENLABS_API_KEY ? 'configured' : 'not configured',
      stripe: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not configured'
    }
  });
});

// API status endpoint
app.get('/api/status', async (req, res) => {
  try {
    // Test database connection
    await sequelize.authenticate();
    
    // Get quick stats
    const { Contact, Appointment, Message, Call } = require('./models');
    
    const stats = await Promise.all([
      Contact.count(),
      Appointment.count(),
      Message.count(),
      Call.count()
    ]);

    res.json({
      status: 'operational',
      client: CLIENT_NAME,
      clientId: CLIENT_ID,
      timestamp: new Date().toISOString(),
      database: 'connected',
      stats: {
        contacts: stats[0],
        appointments: stats[1],
        messages: stats[2],
        calls: stats[3]
      },
      features: {
        voice_ai: process.env.ELEVENLABS_API_KEY ? 'enabled' : 'disabled',
        sms: process.env.TWILIO_ACCOUNT_SID ? 'enabled' : 'disabled',
        calls: process.env.TWILIO_ACCOUNT_SID ? 'enabled' : 'disabled',
        credits: process.env.STRIPE_SECRET_KEY ? 'enabled' : 'disabled'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      client: CLIENT_NAME,
      clientId: CLIENT_ID,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Get dashboard data endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    const { Contact, Appointment, Message, Call } = require('./models');
    const { Op } = require('sequelize');

    // Get today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Get counts and today's data
    const [
      totalContacts,
      todaysAppointments,
      todaysMessages,
      todaysCalls,
      recentContacts,
      recentAppointments,
      recentMessages,
      recentCalls
    ] = await Promise.all([
      // Counts
      Contact.count(),
      Appointment.count({
        where: {
          date: {
            [Op.between]: [todayStart, todayEnd]
          }
        }
      }),
      Message.count({
        where: {
          createdAt: {
            [Op.between]: [todayStart, todayEnd]
          }
        }
      }),
      Call.count({
        where: {
          createdAt: {
            [Op.between]: [todayStart, todayEnd]
          }
        }
      }),
      
      // Recent data
      Contact.findAll({
        limit: 5,
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'firstName', 'lastName', 'phone', 'email']
      }),
      Appointment.findAll({
        where: {
          date: {
            [Op.between]: [todayStart, todayEnd]
          }
        },
        limit: 10,
        order: [['time', 'ASC']],
        include: [{
          model: Contact,
          as: 'contact',
          required: false,
          attributes: ['firstName', 'lastName', 'phone']
        }]
      }),
      Message.findAll({
        where: {
          createdAt: {
            [Op.between]: [todayStart, todayEnd]
          }
        },
        limit: 10,
        order: [['createdAt', 'DESC']],
        include: [{
          model: Contact,
          as: 'contact',
          required: false,
          attributes: ['firstName', 'lastName', 'phone']
        }]
      }),
      Call.findAll({
        where: {
          createdAt: {
            [Op.between]: [todayStart, todayEnd]
          }
        },
        limit: 10,
        order: [['createdAt', 'DESC']],
        include: [{
          model: Contact,
          as: 'contact',
          required: false,
          attributes: ['firstName', 'lastName', 'phone']
        }]
      })
    ]);

    // Calculate call statistics
    const callStats = {
      total: todaysCalls,
      incoming: recentCalls.filter(call => call.direction === 'incoming').length,
      outgoing: recentCalls.filter(call => call.direction === 'outgoing').length,
      missed: recentCalls.filter(call => call.status === 'no-answer' || call.status === 'busy').length,
      answered: recentCalls.filter(call => call.status === 'completed').length,
      totalDuration: recentCalls.reduce((sum, call) => sum + (call.duration || 0), 0),
      averageDuration: recentCalls.length > 0 ? 
        Math.round(recentCalls.reduce((sum, call) => sum + (call.duration || 0), 0) / recentCalls.length) : 0
    };

    res.json({
      success: true,
      client: CLIENT_NAME,
      clientId: CLIENT_ID,
      stats: {
        contacts: totalContacts,
        appointments: todaysAppointments,
        messages: todaysMessages,
        calls: todaysCalls
      },
      data: {
        contacts: recentContacts,
        appointments: recentAppointments,
        messages: recentMessages,
        calls: recentCalls
      },
      callStats: callStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      client: CLIENT_NAME,
      clientId: CLIENT_ID,
      error: 'Failed to fetch dashboard data'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

module.exports = app;