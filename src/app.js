// src/app.js - Enhanced with Call History Integration, Multi-Client Support, Credit System, User Authentication, and Rachel Voice AI
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Multi-Client Configuration
const CLIENT_ID = process.env.CLIENT_ID || 'default';
const CLIENT_NAME = process.env.CLIENT_NAME || 'RinglyPro';
const CLIENT_DOMAIN = process.env.CLIENT_DOMAIN || 'ringlypro.com';

// Middleware - MUST COME BEFORE ROUTES
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Add session middleware for Rachel routes
const session = require('express-session');
app.use(session({
    secret: process.env.SESSION_SECRET || 'ringlypro-session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

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

// Import authentication middleware (for API routes only)
const { authenticateToken, getUserClient } = require('./middleware/auth');

// Import routes
const contactsRoutes = require('./routes/contacts');
const appointmentsRoutes = require('./routes/appointments');
// const appointmentRoutes = require('./routes/appointment'); // REMOVED: Was duplicate Appointment model, not routes
const messagesRoutes = require('./routes/messages');
const callsRoutes = require('./routes/calls'); // New call routes
const callLogRoutes = require('./routes/callLog'); // Call log routes
const voiceBotRoutes = require('./routes/voiceBot');
const creditRoutes = require('./routes/credits'); // Credit system routes
const voiceWebhookRouter = require('./routes/voiceWebhook'); // Rachel voice routes
const rachelRoutes = require('./routes/rachelRoutes'); // Multi-tenant Rachel routes (English)
const linaRoutes = require('./routes/linaRoutes'); // Spanish voice routes (Lina)
const twilioRoutes = require('./routes/twilio');
const twilioAdminRoutes = require('./routes/twilioAdmin'); // Twilio number management

// Import new forwarding routes
const conditionalForwardRoutes = require('./routes/conditionalForward');
const callForwardingRoutes = require('./routes/callForwarding');
const forwardingStatusRoutes = require('./routes/forwardingStatus');
const clientRoutes = require('./routes/client'); // Rachel toggle route from Task 1

// Import mobile CRM routes
const mobileRoutes = require('./routes/mobile'); // Mobile CRM API routes

// Import client provisioning routes
const clientProvisioningRoutes = require('./routes/clientProvisioning'); // Automatic number provisioning

// Import referral routes (optional - won't crash app if fails)
let referralRoutes = null;
try {
    referralRoutes = require('./routes/referral'); // Referral system
    console.log('✅ Referral routes loaded successfully');
} catch (error) {
    console.error('⚠️ Referral routes not loaded (optional feature):', error.message);
    // Don't print full stack - this is expected before migration
    referralRoutes = null;
}

console.log('📄 About to require auth routes...');
const authRoutes = require('./routes/auth'); // User authentication routes
console.log('✅ Auth routes required successfully, type:', typeof authRoutes);

// API Routes - Organized by functionality
console.log('📄 About to mount auth routes...');
app.use('/api/auth', authRoutes); // Mount user authentication routes
console.log('✅ Auth routes mounted successfully');

// Core CRM API routes
app.use('/api/contacts', contactsRoutes);
app.use('/api/appointments', appointmentsRoutes);
// app.use('/api/appointment', appointmentRoutes); // REMOVED: Was loading duplicate model, not router
app.use('/api/messages', messagesRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/call-log', callLogRoutes);
app.use('/api/credits', creditRoutes);

// Client management routes
app.use('/api/client', clientRoutes); // Rachel toggle and client settings
app.use('/api/clients', clientProvisioningRoutes); // Automatic client provisioning with Twilio numbers

// Referral system routes
if (referralRoutes) {
    app.use('/api/referral', referralRoutes); // Referral link sharing and statistics
    console.log('✅ Referral routes mounted at /api/referral');
} else {
    console.error('⚠️ Referral routes not available - skipping mount');
}

// Add Mobile CRM API routes
app.use('/api/mobile', mobileRoutes);

// Call forwarding API routes
app.use('/api/call-forwarding', callForwardingRoutes);
app.use('/api/forwarding-status', forwardingStatusRoutes);

// Voice and webhook routes
app.use('/api/voice', voiceBotRoutes);
app.use('/voice', voiceBotRoutes);
app.use('/webhook/twilio', twilioRoutes);

// Twilio number administration (CRITICAL for credit tracking)
app.use('/api/twilio', twilioAdminRoutes);

// Conditional forwarding webhook (for business phone forwarding)
app.use('/webhook', conditionalForwardRoutes);

// Rachel Voice webhook routes (ElevenLabs integration - English) - DEPRECATED
// app.use('/voice/rachel', voiceWebhookRouter);
// console.log('🎤 Rachel Voice webhook routes mounted at /voice/rachel/*');

// Multi-tenant Rachel routes with client identification (English)
app.use('/', rachelRoutes);
console.log('🎯 Multi-tenant Rachel routes mounted - Client identification active');

// Lina Voice routes (ElevenLabs integration - Spanish)
app.use('/', linaRoutes);
console.log('🇪🇸 Lina Spanish voice routes mounted - Bilingual support active');

// =====================================================
// PROTECTED ROUTES - Require Authentication
// =====================================================

// Dashboard route - client-side authentication
app.get('/', async (req, res) => {
  try {
    // Render dashboard - authentication and clientId extraction happens client-side via JavaScript
    res.render('dashboard', { 
      title: `${CLIENT_NAME} CRM Dashboard`,
      currentDate: new Date().toLocaleDateString(),
      voiceEnabled: process.env.VOICE_ENABLED === 'true' || false,
      clientName: CLIENT_NAME
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// =====================================================
// PUBLIC ROUTES - No authentication required
// =====================================================

// User Guide - serve markdown file
app.get('/USER_GUIDE.md', (req, res) => {
  res.sendFile(path.join(__dirname, '../USER_GUIDE.md'));
});

// Login page route
app.get('/login', (req, res) => {
  res.render('login', {
    title: `${CLIENT_NAME} - Sign In`,
    clientName: CLIENT_NAME,
    clientId: CLIENT_ID
  });
});

// Signup page route
app.get('/signup', (req, res) => {
  res.render('signup', {
    title: `${CLIENT_NAME} - Sign Up`,
    clientName: CLIENT_NAME,
    clientId: CLIENT_ID
  });
});

// Forgot password page route
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', {
    title: `${CLIENT_NAME} - Forgot Password`,
    clientName: CLIENT_NAME,
    clientId: CLIENT_ID
  });
});

// Reset password page route
app.get('/reset-password', (req, res) => {
  const token = req.query.token;
  res.render('reset-password', {
    title: `${CLIENT_NAME} - Reset Password`,
    clientName: CLIENT_NAME,
    clientId: CLIENT_ID,
    token: token || ''
  });
});

// Redirect root to dashboard if authenticated, otherwise to login
app.get('/auth-check', (req, res) => {
  // This would check JWT token when we add middleware later
  res.redirect('/login');
});

// =====================================================
// HEALTH CHECK & STATUS ENDPOINTS
// =====================================================

// Health check endpoint
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
      rachel_voice: process.env.ELEVENLABS_API_KEY ? 'active' : 'disabled',
      stripe: process.env.STRIPE_SECRET_KEY ? 'configured' : 'not configured',
      authentication: 'enabled',
      client_identification: 'enabled',
      call_forwarding: 'enabled',
      referral_system: referralRoutes ? 'enabled' : 'disabled'
    },
    webhooks: {
      twilio_voice: `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/webhook/twilio/voice`,
      rachel_voice: `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/voice/rachel/`,
      conditional_forward: `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/webhook/conditional-forward`,
      rachel_client_test: `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/voice/rachel/test-client/+18886103810`
    },
    api_endpoints: {
      rachel_toggle: '/api/client/rachel-toggle',
      call_forwarding_setup: '/api/call-forwarding/setup/:carrier',
      forwarding_status: '/api/forwarding-status'
    }
  });
});

// API status endpoint
app.get('/api/status', async (req, res) => {
  try {
    // Test database connection
    await sequelize.authenticate();
    
    // Get quick stats
    const { Contact, Appointment, Message, Call, User } = require('./models');
    
    const stats = await Promise.all([
      Contact.count(),
      Appointment.count(),
      Message.count(),
      Call.count(),
      User.count()
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
        calls: stats[3],
        users: stats[4]
      },
      features: {
        voice_ai: process.env.ELEVENLABS_API_KEY ? 'enabled' : 'disabled',
        rachel_voice: process.env.ELEVENLABS_API_KEY ? 'enabled' : 'disabled',
        sms: process.env.TWILIO_ACCOUNT_SID ? 'enabled' : 'disabled',
        calls: process.env.TWILIO_ACCOUNT_SID ? 'enabled' : 'disabled',
        credits: process.env.STRIPE_SECRET_KEY ? 'enabled' : 'disabled',
        authentication: 'enabled',
        client_identification: 'enabled',
        call_forwarding: 'enabled'
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
    const { Contact, Appointment, Message, Call, User } = require('./models');
    const { Op } = require('sequelize');
    const jwt = require('jsonwebtoken');

    // Extract and verify JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
    const clientId = decoded.clientId;

    if (!clientId) {
      return res.status(401).json({ success: false, error: 'No client associated with this account' });
    }

    console.log(`📊 Loading dashboard for client ${clientId}`);

    // Get today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Get counts and today's data - ALL FILTERED BY CLIENT ID
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
      Contact.count({ where: { clientId } }),
      Appointment.count({
        where: {
          clientId,
          appointmentDate: {
            [Op.between]: [todayStart, todayEnd]
          }
        }
      }),
      Message.count({
        where: {
          clientId,
          createdAt: {
            [Op.between]: [todayStart, todayEnd]
          }
        }
      }),
      Call.count({
        where: {
          clientId,
          createdAt: {
            [Op.between]: [todayStart, todayEnd]
          }
        }
      }),

      // Recent data
      Contact.findAll({
        where: { clientId },
        limit: 5,
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'firstName', 'lastName', 'phone', 'email']
      }),
      Appointment.findAll({
        where: {
          clientId,
          appointmentDate: {
            [Op.between]: [todayStart, todayEnd]
          }
        },
        limit: 10,
        order: [['appointmentTime', 'ASC']],
        include: [{
          model: Contact,
          as: 'contact',
          required: false,
          attributes: ['firstName', 'lastName', 'phone']
        }]
      }),
      Message.findAll({
        where: {
          clientId,
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
          clientId,
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
  console.log('404 handler hit for:', req.method, req.path);
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

module.exports = app;