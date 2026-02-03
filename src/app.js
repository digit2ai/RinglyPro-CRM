// src/app.js - Enhanced with Call History Integration, Multi-Client Support, Credit System, User Authentication, and Rachel Voice AI
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Email service
const emailService = require('./services/emailService');

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

// Serve all-in-one landing page (LaunchStack)
app.use('/all-in-one', express.static(path.join(__dirname, '../all-in-one')));

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
const anaRoutes = require('./routes/anaRoutes'); // Spanish voice routes (Ana) - mirrors Rachel exactly
const linaRoutes = require('./routes/linaRoutes'); // Spanish voice routes (Lina) - legacy
const linaNewRoutes = require('./routes/linaNewRoutes'); // New Spanish voice routes (stateless)
const linaRoutesV2 = require('./routes/linaRoutesV2'); // Spanish V2 - rebuilt from scratch
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

// Import MCP integration routes
let mcpRoutes = null;
try {
    mcpRoutes = require('./routes/mcp'); // MCP AI Copilot integration
    console.log('✅ MCP integration routes loaded successfully');
} catch (error) {
    console.log('⚠️ MCP integration routes not available:', error.message);
}

// Import GoHighLevel MCP routes
let ghlMCPRoutes = null;
try {
    ghlMCPRoutes = require('./routes/gohighlevel-mcp'); // GoHighLevel MCP integration
    console.log('✅ GoHighLevel MCP routes loaded successfully');
} catch (error) {
    console.log('⚠️ GoHighLevel MCP routes not available:', error.message);
}

// Import ElevenLabs tools routes
let elevenlabsToolsRoutes = null;
try {
    elevenlabsToolsRoutes = require('./routes/elevenlabs-tools'); // ElevenLabs Conversational AI tools
    console.log('✅ ElevenLabs tools routes loaded successfully');
} catch (error) {
    console.log('⚠️ ElevenLabs tools routes not available:', error.message);
}

// Import ElevenLabs voice routes
let elevenlabsVoiceRoutes = null;
try {
    elevenlabsVoiceRoutes = require('./routes/elevenlabs-voice'); // ElevenLabs Conversational AI voice handler
    console.log('✅ ElevenLabs voice routes loaded successfully');
} catch (error) {
    console.log('⚠️ ElevenLabs voice routes not available:', error.message);
}

// Import ElevenLabs WebRTC routes (browser-based voice conversations)
let elevenlabsWebrtcRoutes = null;
try {
    elevenlabsWebrtcRoutes = require('./routes/elevenlabs-webrtc'); // ElevenLabs WebRTC token endpoint
    console.log('✅ ElevenLabs WebRTC routes loaded successfully');
} catch (error) {
    console.log('⚠️ ElevenLabs WebRTC routes not available:', error.message);
}

// Import email marketing routes (SendGrid integration)
const emailRoutes = require('./routes/email'); // Email marketing with SendGrid

// Import outbound caller routes
const outboundCallerRoutes = require('./routes/outbound-caller'); // Twilio outbound calling integration
const scheduledCallerRoutes = require('./routes/scheduled-caller'); // Scheduled auto-caller for prospects

// Import token routes (optional - won't crash app if fails)
let tokenRoutes = null;
try {
    tokenRoutes = require('./routes/tokens'); // Token billing system
    console.log('✅ Token routes loaded successfully');
} catch (error) {
    console.error('⚠️ Token routes not loaded (optional feature):', error.message);
    tokenRoutes = null;
}

// Import referral routes (optional - won't crash app if fails)
let referralRoutes = null;
try {
    referralRoutes = require('./routes/referrals'); // Viral referral system
    console.log('✅ Referral routes loaded successfully');
} catch (error) {
    console.error('⚠️ Referral routes not loaded (optional feature):', error.message);
    // Don't print full stack - this is expected before migration
    referralRoutes = null;
}

console.log('📄 About to require auth routes...');
const authRoutes = require('./routes/auth'); // User authentication routes
console.log('✅ Auth routes required successfully, type:', typeof authRoutes);

// Import LaunchStack routes (separate from RinglyPro)
const launchstackRoutes = require('./routes/launchstack'); // LaunchStack registration/login
console.log('✅ LaunchStack routes loaded successfully');

// Import Stripe webhook routes
const webhookRoutes = require('./routes/webhooks'); // Stripe webhooks for subscriptions
console.log('✅ Webhook routes loaded successfully');

// Import subscription upgrade routes
let subscriptionRoutes = null;
try {
    subscriptionRoutes = require('./routes/subscription'); // Subscription upgrade for existing users
    console.log('✅ Subscription routes loaded successfully');
} catch (error) {
    console.error('⚠️ Subscription routes not loaded (optional feature):', error.message);
    subscriptionRoutes = null;
}

// Import copilot access control routes
const copilotAccessRoutes = require('./routes/copilot-access'); // Copilot authentication
console.log('✅ Copilot access routes loaded successfully');

// Import GHL payment routes
const ghlPaymentRoutes = require('./routes/ghl-payment'); // GHL subscription payments
console.log('✅ GHL payment routes loaded successfully');

// Import Photo Studio routes
const photoStudioRoutes = require('./routes/photo-studio'); // Photo Studio package purchases
console.log('✅ Photo Studio routes loaded successfully');

// Import Photo Upload routes
const photoUploadRoutes = require('./routes/photo-uploads'); // Photo upload handling for all services
console.log('✅ Photo Upload routes loaded successfully');

// Import Google Calendar OAuth routes
const googleOAuthRoutes = require('./routes/google-oauth'); // Google Calendar OAuth integration
console.log('✅ Google Calendar OAuth routes loaded successfully');

// Import Zoho OAuth routes
const zohoOAuthRoutes = require('./routes/zoho-oauth'); // Zoho CRM OAuth integration
console.log('✅ Zoho OAuth routes loaded successfully');

// Import PixlyPro routes
const pixlyproRoutes = require('./routes/pixlypro'); // PixlyPro AI-assisted photo enhancement
const vagaroRoutes = require('./routes/vagaro'); // Vagaro salon/spa scheduling integration
const whatsappRoutes = require('./routes/whatsapp'); // WhatsApp Business integration
const hubspotBookingRoutes = require('./routes/hubspot-booking'); // HubSpot booking integration (isolated)
const e2eTestRoutes = require('./routes/e2e-test'); // E2E testing with self-healing
console.log('✅ PixlyPro routes loaded successfully');
console.log('✅ WhatsApp routes loaded successfully');
console.log('✅ HubSpot Booking routes loaded successfully');
console.log('✅ E2E Test routes loaded successfully');

// Import Storefront routes
const storefrontRoutes = require('./routes/storefront'); // Online storefront & menu system
console.log('✅ Storefront routes loaded successfully');

const ordergoProRoutes = require('./routes/ordergopro'); // OrderGoPro SaaS platform
console.log('✅ OrderGoPro routes loaded successfully');

// Import Project Tracker routes
const projectRoutes = require('./routes/projects'); // Client project tracker
const adminProjectRoutes = require('./routes/admin-projects'); // Admin project tracker
console.log('✅ Project Tracker routes loaded successfully');

// API Routes - Organized by functionality
console.log('📄 About to mount auth routes...');
app.use('/api/auth', authRoutes); // Mount user authentication routes
console.log('✅ Auth routes mounted successfully');

// LaunchStack API routes (separate from RinglyPro)
app.use('/api/launchstack', launchstackRoutes); // Mount LaunchStack routes
console.log('✅ LaunchStack routes mounted at /api/launchstack');

// Mount webhook routes (IMPORTANT: Must be mounted BEFORE body parser middleware)
app.use('/webhooks', webhookRoutes); // Stripe webhooks for subscriptions
console.log('✅ Webhook routes mounted at /webhooks');

// Mount copilot access control routes
app.use('/api/copilot', copilotAccessRoutes); // Copilot authentication and GHL checks
console.log('✅ Copilot access routes mounted at /api/copilot');

// Mount GHL payment routes
app.use('/api/payment', ghlPaymentRoutes); // GHL subscription payments via Stripe
console.log('✅ GHL payment routes mounted at /api/payment');

// Mount Photo Studio routes
app.use('/api/photo-studio', photoStudioRoutes); // Photo Studio package purchases
console.log('✅ Photo Studio routes mounted at /api/photo-studio');

// Mount PixlyPro routes
app.use('/api/pixlypro', pixlyproRoutes); // PixlyPro AI-assisted photo enhancement
console.log('✅ PixlyPro routes mounted at /api/pixlypro');

app.use('/api/vagaro', vagaroRoutes); // Vagaro salon/spa scheduling integration
console.log('✅ Vagaro routes mounted at /api/vagaro');

app.use('/api/whatsapp', whatsappRoutes); // WhatsApp Business bilingual AI assistant
console.log('✅ WhatsApp routes mounted at /api/whatsapp');

app.use('/api/integrations/hubspot', hubspotBookingRoutes); // HubSpot booking integration (isolated from GHL)
console.log('✅ HubSpot Booking routes mounted at /api/integrations/hubspot');

app.use('/api/e2e-test', e2eTestRoutes); // E2E testing with self-healing (admin only)
console.log('🧪 E2E Test routes mounted at /api/e2e-test');

// Mount Photo Upload routes
app.use('/api/photo-uploads', photoUploadRoutes); // Photo upload handling for all services
console.log('✅ Photo Upload routes mounted at /api/photo-uploads');

// Mount Google Calendar OAuth routes
app.use('/api/google-oauth', googleOAuthRoutes); // Google Calendar OAuth integration
console.log('🗓️ Google Calendar OAuth routes mounted at /api/google-oauth');

// Mount Zoho OAuth routes
app.use('/zoho', zohoOAuthRoutes); // Zoho CRM OAuth integration
console.log('🔗 Zoho OAuth routes mounted at /zoho');

// Mount Storefront routes
app.use('/api/storefront', storefrontRoutes); // Online storefront & menu system
console.log('✅ Storefront routes mounted at /api/storefront');

// Mount OrderGoPro routes
app.use('/api/ordergopro', ordergoProRoutes); // OrderGoPro SaaS platform
console.log('✅ OrderGoPro routes mounted at /api/ordergopro');

// Core CRM API routes
app.use('/api/contacts', contactsRoutes);
app.use('/api/appointments', appointmentsRoutes);
// app.use('/api/appointment', appointmentRoutes); // REMOVED: Was loading duplicate model, not router
app.use('/api/messages', messagesRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/call-log', callLogRoutes);
app.use('/api/credits', creditRoutes);

// Token billing system routes
if (tokenRoutes) {
    app.use('/api/tokens', tokenRoutes); // Token billing and purchases
    console.log('💰 Token routes mounted at /api/tokens');
} else {
    console.error('⚠️ Token routes not available - skipping mount');
}

// Subscription upgrade routes (for existing users to upgrade plans)
if (subscriptionRoutes) {
    app.use('/api/subscription', subscriptionRoutes); // Subscription upgrade and management
    console.log('📈 Subscription routes mounted at /api/subscription');
} else {
    console.error('⚠️ Subscription routes not available - skipping mount');
}

// Viral referral system routes
if (referralRoutes) {
    app.use('/api/referrals', referralRoutes); // Viral referral program (new)
    app.use('/api/referral', referralRoutes); // Backward compatibility (old frontend)
    console.log('🎁 Referral routes mounted at /api/referrals and /api/referral (backward compatible)');
} else {
    console.error('⚠️ Referral routes not available - skipping mount');
}

// Client management routes
app.use('/api/client', clientRoutes); // Rachel toggle and client settings
app.use('/api/clients', clientProvisioningRoutes); // Automatic client provisioning with Twilio numbers

// Add Mobile CRM API routes
app.use('/api/mobile', mobileRoutes);

// Admin Portal API routes (info@digit2ai.com only)
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);
console.log('👑 Admin portal API routes mounted at /api/admin');

// Project Tracker API routes
app.use('/api/projects', projectRoutes); // Client project tracker API
app.use('/api/admin/projects', adminProjectRoutes); // Admin project tracker API
console.log('📋 Project Tracker routes mounted at /api/projects and /api/admin/projects');

// Call forwarding API routes
app.use('/api/call-forwarding', callForwardingRoutes);
app.use('/api/forwarding-status', forwardingStatusRoutes);

// Voice and webhook routes
app.use('/api/voice', voiceBotRoutes);
app.use('/voice', voiceBotRoutes);
app.use('/webhook/twilio', twilioRoutes);

// Twilio number administration (CRITICAL for credit tracking)
app.use('/api/twilio', twilioAdminRoutes);

// MCP AI Copilot integration routes
if (mcpRoutes) {
    app.use('/api/mcp', mcpRoutes);
    console.log('🤖 MCP AI Copilot routes mounted at /api/mcp');
} else {
    console.log('⚠️ MCP routes not available - skipping mount');
}

// AI Generation routes (DALL-E, content generation)
const aiRoutes = require('./routes/ai');
app.use('/api/ai', aiRoutes);
console.log('✨ AI Generation routes mounted at /api/ai');

// GHL API Test Route (for debugging)
const testGHLRoutes = require('./routes/test-ghl');
app.use('/api/test-ghl', testGHLRoutes);
console.log('🧪 GHL API Test routes mounted at /api/test-ghl');

// GoHighLevel MCP integration routes
if (ghlMCPRoutes) {
    app.use('/api/ghl', ghlMCPRoutes);
    console.log('🎯 GoHighLevel MCP routes mounted at /api/ghl');
} else {
    console.log('⚠️ GoHighLevel MCP routes not available - skipping mount');
}

// ElevenLabs Conversational AI tools routes
if (elevenlabsToolsRoutes) {
    app.use('/api/elevenlabs/tools', elevenlabsToolsRoutes);
    console.log('🎙️ ElevenLabs tools routes mounted at /api/elevenlabs/tools');
} else {
    console.log('⚠️ ElevenLabs tools routes not available - skipping mount');
}

// ElevenLabs voice webhook routes (Twilio -> ElevenLabs)
if (elevenlabsVoiceRoutes) {
    app.use('/voice/elevenlabs', elevenlabsVoiceRoutes);
    console.log('🎙️ ElevenLabs voice routes mounted at /voice/elevenlabs');
} else {
    console.log('⚠️ ElevenLabs voice routes not available - skipping mount');
}

// ElevenLabs WebRTC routes (browser-based voice conversations)
if (elevenlabsWebrtcRoutes) {
    app.use('/api/elevenlabs-webrtc', elevenlabsWebrtcRoutes);
    console.log('🌐 ElevenLabs WebRTC routes mounted at /api/elevenlabs-webrtc');
} else {
    console.log('⚠️ ElevenLabs WebRTC routes not available - skipping mount');
}

// Email Marketing routes (SendGrid integration)
app.use('/api/email', emailRoutes);
console.log('📧 Email Marketing routes mounted at /api/email');

// Lina's Treasures E-Commerce routes
const linasTreasuresRoutes = require('./routes/linas-treasures');
const linasTreasuresAdminRoutes = require('./routes/linas-treasures-admin');
const linasTreasuresPartnerRoutes = require('./routes/linas-treasures-partner');

app.use('/api/linas-treasures', linasTreasuresRoutes); // Public routes
app.use('/api/linas-treasures/admin', linasTreasuresAdminRoutes); // Admin routes
app.use('/api/linas-treasures/partner', linasTreasuresPartnerRoutes); // Partner routes
console.log('💍 Lina\'s Treasures e-commerce routes mounted at /api/linas-treasures');

// Outbound Caller routes (Twilio integration)
app.use('/api/outbound-caller', outboundCallerRoutes);
console.log('📞 Outbound Caller routes mounted at /api/outbound-caller');

// Client Settings routes (voicemail messages, etc.)
const clientSettingsRoutes = require('./routes/client-settings');
app.use('/api/client-settings', clientSettingsRoutes);
console.log('⚙️ Client Settings routes mounted at /api/client-settings');

// Scheduled Auto-Caller routes (automated prospect calling)
app.use('/api/scheduled-caller', scheduledCallerRoutes);
console.log('⏰ Scheduled Auto-Caller routes mounted at /api/scheduled-caller');

// GoHighLevel Webhook routes (bidirectional sync for contacts and appointments)
const ghlWebhookRoutes = require('./routes/ghl-webhook');
app.use('/api/webhooks/gohighlevel', ghlWebhookRoutes);
console.log('🔄 GoHighLevel Webhook routes mounted at /api/webhooks/gohighlevel');

// A2P 10DLC Business Verification routes
const a2pRoutes = require('./routes/a2p');
app.use('/api', a2pRoutes);
console.log('📝 A2P 10DLC verification routes mounted at /api/clients/:clientId/a2p');

// =====================================================
// STORE HEALTH AI INTEGRATION
// =====================================================

// Mount Store Health AI system at /aiastore
let storeHealthApp = null;
try {
  // Try full version with dashboard and database
  storeHealthApp = require('../store-health-ai/src/index');
  app.use('/aiastore', storeHealthApp);
  console.log('🏪 Store Health AI (FULL VERSION) mounted at /aiastore');
  console.log('   - Dashboard UI: /aiastore/');
  console.log('   - Health Check: /aiastore/health');
  console.log('   - API: /aiastore/api/v1/*');
} catch (error) {
  console.log('⚠️ Store Health AI full version failed, trying minimal version');
  console.error('Full version error:', error.message);
  try {
    // Fallback to minimal version with mock data
    storeHealthApp = require('../store-health-ai/src/index-minimal');
    app.use('/aiastore', storeHealthApp);
    console.log('🏪 Store Health AI (MINIMAL/FALLBACK) mounted at /aiastore');
    console.log('   - API only with mock data');
  } catch (fallbackError) {
    console.log('⚠️ Store Health AI not available:', fallbackError.message);
  }
}

// Conditional forwarding webhook (for business phone forwarding)
app.use('/webhook', conditionalForwardRoutes);

// Rachel Voice webhook routes (ElevenLabs integration - English) - DEPRECATED
// app.use('/voice/rachel', voiceWebhookRouter);
// console.log('🎤 Rachel Voice webhook routes mounted at /voice/rachel/*');

// Multi-tenant Rachel routes with client identification (English)
app.use('/', rachelRoutes);
console.log('🎯 Multi-tenant Rachel routes mounted - Client identification active');

// Ana Voice routes (Spanish) - mirrors Rachel exactly
app.use('/', anaRoutes);
console.log('🇪🇸 Ana Spanish voice routes mounted - Mirrors Rachel flow exactly');

// Lina Voice routes (ElevenLabs integration - Spanish) - legacy
app.use('/', linaRoutes);
console.log('🇪🇸 Lina Spanish voice routes mounted - Bilingual support active (legacy)');

// NEW Lina Voice routes (stateless, mirrors English flow)
app.use('/', linaNewRoutes);
console.log('🇪🇸 Lina NEW Spanish voice routes mounted - Stateless flow active');

// Lina V2 Voice routes - rebuilt from scratch based on Rachel
app.use('/', linaRoutesV2);
console.log('🇪🇸 Lina V2 Spanish voice routes mounted - Clean rebuild active');

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
      clientName: CLIENT_NAME,
      client: null // Client info loaded client-side via JWT
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// Admin login page - no authentication required
app.get('/admin/login', (req, res) => {
  res.render('admin-login', {
    title: 'Admin Portal - Sign In'
  });
});

// Photo Studio Admin login page - separate from main admin
app.get('/photo-studio-admin-login', (req, res) => {
  res.render('photo-studio-admin-login', {
    title: 'Photo Studio Admin - Sign In'
  });
});

// Admin portal route - for info@digit2ai.com only
app.get('/admin', async (req, res) => {
  try {
    res.render('admin', {
      title: 'RinglyPro Admin Portal',
      currentDate: new Date().toLocaleDateString(),
      clientName: CLIENT_NAME
    });
  } catch (error) {
    console.error('Admin portal error:', error);
    res.status(500).send('Error loading admin portal');
  }
});

// =====================================================
// PUBLIC ROUTES - No authentication required
// =====================================================

// A2P 10DLC Onboarding page - public with clientId query param
app.get('/a2p', async (req, res) => {
  try {
    res.render('a2p-onboarding', {
      title: 'A2P 10DLC Business Verification | RinglyPro'
    });
  } catch (error) {
    console.error('A2P onboarding page error:', error);
    res.status(500).send('Error loading A2P onboarding page');
  }
});

// GHL Signup page - for users without GoHighLevel account
app.get('/ghl-signup', async (req, res) => {
  try {
    const clientId = req.query.client_id;
    res.render('ghl-signup', {
      clientId: clientId || null
    });
  } catch (error) {
    console.error('Error loading GHL signup:', error);
    res.status(500).send('Error loading page');
  }
});

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

// Register page route (alias for signup - used by all-in-one landing page)
app.get('/register', (req, res) => {
  res.redirect('/signup');
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

// Purchase tokens page route
app.get('/purchase-tokens', (req, res) => {
  res.render('purchase-tokens', {
    title: `${CLIENT_NAME} - Purchase Tokens`,
    clientName: CLIENT_NAME,
    clientId: CLIENT_ID
  });
});

// Purchase success page route
app.get('/purchase-success', (req, res) => {
  res.render('purchase-success', {
    title: `${CLIENT_NAME} - Purchase Successful`,
    clientName: CLIENT_NAME,
    clientId: CLIENT_ID,
    sessionId: req.query.session_id || ''
  });
});

// Pricing page route - token-based pricing tiers
app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/pricing-table.html'));
});

// Photo Studio success page route
// Photo Studio landing page route
app.get('/photo-studio', (req, res) => {
  res.render('pixlypro-studio', {
    title: 'PixlyPro Photo Studio - Instant Photo Enhancement'
  });
});

app.get('/photo-studio-success', (req, res) => {
  res.render('photo-studio-success', {
    title: 'Order Confirmed - RinglyPro Photo Studio',
    sessionId: req.query.session_id || ''
  });
});

// Photo Studio authentication page route
app.get('/photo-studio-auth', (req, res) => {
  res.render('photo-studio-auth', {
    title: 'Sign In - RinglyPro Photo Studio'
  });
});

// Photo Studio customer portal route
app.get('/photo-studio-portal', (req, res) => {
  res.render('photo-studio-portal', {
    title: 'My Photo Studio Orders - RinglyPro'
  });
});

// Photo Studio upload page (cart model)
app.get('/photo-studio-upload', (req, res) => {
  res.render('photo-studio-upload', {
    title: 'Upload Photos - PixlyPro Photo Studio'
  });
});

// Photo Studio admin dashboard route
app.get('/photo-studio-admin-dashboard', (req, res) => {
  res.render('photo-studio-admin-dashboard', {
    title: 'Admin Dashboard - Photo Studio - RinglyPro'
  });
});

// =====================================================
// PIXLYPRO ROUTES (AI-Assisted Photo Enhancement)
// =====================================================

// PixlyPro landing page
app.get('/pixlypro', (req, res) => {
  res.render('pixlypro-landing', {
    title: 'PixlyPro - AI-Assisted Photo Enhancement | RinglyPro'
  });
});

// PixlyPro AI Studio (main interface)
app.get('/pixlypro-studio', (req, res) => {
  res.render('pixlypro-studio', {
    title: 'PixlyPro AI Studio - Instant Photo Enhancement | RinglyPro'
  });
});

// PixlyPro authentication page (login/signup)
app.get('/pixlypro-auth', (req, res) => {
  res.render('pixlypro-auth', {
    title: 'Sign In - PixlyPro AI Enhancement | RinglyPro'
  });
});

// PixlyPro customer portal
app.get('/pixlypro-portal', (req, res) => {
  res.render('pixlypro-portal', {
    title: 'My PixlyPro Orders - RinglyPro'
  });
});

// PixlyPro upload page
app.get('/pixlypro-upload', (req, res) => {
  res.render('pixlypro-upload', {
    title: 'Upload Photos - PixlyPro - RinglyPro'
  });
});

// Vagaro Integration Settings
app.get('/settings/vagaro', (req, res) => {
  res.render('settings-vagaro', {
    title: 'Vagaro Integration - RinglyPro Settings',
    APP_URL: process.env.APP_URL || process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com'
  });
});

// Vagaro Setup Guide (self-service integration help)
app.get('/settings/vagaro/guide', (req, res) => {
  res.render('vagaro-setup-guide', {
    title: 'Vagaro Setup Guide - RinglyPro'
  });
});

// WhatsApp Integration Settings
app.get('/settings/whatsapp', (req, res) => {
  res.render('settings-whatsapp', {
    title: 'WhatsApp Integration - RinglyPro Settings',
    APP_URL: process.env.APP_URL || process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com'
  });
});

// GoHighLevel Integration Settings
app.get('/settings/ghl', (req, res) => {
  res.render('settings-ghl', {
    title: 'GoHighLevel Integration - RinglyPro Settings'
  });
});

// HubSpot Integration Settings - DISABLED (removed from UI)
// app.get('/settings/hubspot', (req, res) => {
//   res.render('settings-hubspot', {
//     title: 'HubSpot Integration - RinglyPro Settings'
//   });
// });

// SendGrid Email Marketing Settings
app.get('/settings/sendgrid', (req, res) => {
  res.render('settings-sendgrid', {
    title: 'SendGrid Email Marketing - RinglyPro Settings'
  });
});

// Zoho CRM Integration Settings
app.get('/settings/zoho', (req, res) => {
  res.render('settings-zoho', {
    title: 'Zoho CRM Integration - RinglyPro Settings'
  });
});

// RinglyPro Calendar Settings
app.get('/settings/calendar', (req, res) => {
  res.render('settings-calendar', {
    title: 'RinglyPro Calendar - RinglyPro Settings'
  });
});

// Business Settings (Client Requirements)
app.get('/settings/business', (req, res) => {
  res.render('settings-business', {
    title: 'Business Settings - RinglyPro'
  });
});

// Google Calendar Integration Settings
app.get('/settings/google-calendar', (req, res) => {
  res.render('settings-google-calendar', {
    title: 'Google Calendar Integration - RinglyPro Settings'
  });
});

// PixlyPro admin dashboard
app.get('/pixlypro-admin-dashboard', (req, res) => {
  res.render('pixlypro-admin-dashboard', {
    title: 'Admin Dashboard - PixlyPro - RinglyPro'
  });
});

// Online Storefront public page route
app.get('/storefront/:businessSlug', (req, res) => {
  res.render('storefront-public-v2', {
    title: 'Online Menu & Storefront',
    businessSlug: req.params.businessSlug
  });
});

// Storefront admin management route
app.get('/storefront-admin', (req, res) => {
  res.render('storefront-admin', {
    title: 'Storefront Manager - RinglyPro'
  });
});

// OrderGoPro SaaS Platform routes
app.get('/ordergopro', (req, res) => {
  res.render('ordergopro-landing', {
    title: 'OrderGoPro - Online Ordering Platform'
  });
});

app.get('/ordergopro/signup', (req, res) => {
  res.render('ordergopro-signup', {
    title: 'Sign Up - OrderGoPro'
  });
});

app.get('/ordergopro/login', (req, res) => {
  res.render('ordergopro-login', {
    title: 'Login - OrderGoPro'
  });
});

app.get('/ordergopro/dashboard', (req, res) => {
  res.render('ordergopro-dashboard', {
    title: 'Dashboard - OrderGoPro'
  });
});

// =====================================================
// PROJECT TRACKER ROUTES
// =====================================================

// Client Project Tracker page
app.get('/project-tracker', (req, res) => {
  res.render('project-tracker', {
    title: 'Project Tracker - RinglyPro'
  });
});

// Admin Project Tracker page
app.get('/admin/projects', (req, res) => {
  res.render('admin-projects', {
    title: 'Project Tracker - Admin Portal'
  });
});

// Privacy Policy page route (required for App Store)
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy.html'));
});

// Terms of Service page route
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/terms.html'));
});

// Delete Account page route (required for Google Play)
app.get('/delete-account', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/delete-account.html'));
});

// Partnership roadmap page route
app.get('/partnership-roadmap', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/partnership-roadmap.html'));
});

// Partnership contract page route
app.get('/partnership', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/partnership.html'));
});

// Partnership contract form page route
app.get('/contract', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/contract.html'));
});

// Partnership success page route
app.get('/partnership-success', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/partnership-success.html'));
});

// Unsubscribe page route
app.get('/unsubscribe', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/unsubscribe.html'));
});

// Partnership agreement (full legal document)
app.get('/partnership-agreement', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/partnership-agreement.html'));
});

// Marketing guidelines and branding standards
app.get('/marketing-guidelines', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/marketing-guidelines.html'));
});

// Unsubscribe API endpoint
app.post('/api/unsubscribe', async (req, res) => {
  try {
    const { email, preferences, feedback } = req.body;

    if (!email || !preferences || preferences.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Email and preferences are required'
      });
    }

    // Log unsubscribe request
    console.log('Unsubscribe request:', {
      email,
      preferences,
      feedback: feedback || 'No feedback provided',
      timestamp: new Date().toISOString()
    });

    // TODO: Save unsubscribe preferences to database
    // TODO: Update user email preferences
    // TODO: Add to SendGrid suppression list if needed

    // For now, just log and return success
    console.log(`✅ User ${email} unsubscribed from: ${preferences.join(', ')}`);

    res.status(200).json({
      success: true,
      message: 'Unsubscribe preferences updated successfully'
    });

  } catch (error) {
    console.error('Error processing unsubscribe request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process unsubscribe request'
    });
  }
});

// Partnership agreement submission endpoint
app.post('/api/partnership/submit', async (req, res) => {
  try {
    console.log('Partnership submission received:', req.body);

    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      address,
      city,
      state,
      zip,
      taxId,
      signature,
      timestamp
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !address || !city || !state || !zip || !taxId || !signature) {
      console.log('Validation failed - missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // TODO: Save partnership agreement to database
    // For now, log the submission
    console.log('Partnership Agreement Submitted:', {
      name: `${firstName} ${lastName}`,
      email,
      phone,
      company: company || 'N/A',
      address: `${address}, ${city}, ${state} ${zip}`,
      timestamp: timestamp || new Date().toISOString()
    });

    // Send confirmation email to partner
    try {
      await emailService.sendPartnershipConfirmationEmail({
        email,
        firstName,
        lastName,
        company
      });
      console.log('✅ Partnership confirmation email sent to partner');
    } catch (emailError) {
      console.error('⚠️ Failed to send partnership confirmation email:', emailError);
      // Don't fail the request if email fails
    }

    // Send notification email to admin
    try {
      await emailService.sendPartnershipAdminNotification({
        firstName,
        lastName,
        email,
        phone,
        company,
        address,
        city,
        state,
        zip,
        taxId,
        timestamp: timestamp || new Date().toISOString()
      });
      console.log('✅ Partnership admin notification sent');
    } catch (emailError) {
      console.error('⚠️ Failed to send admin notification email:', emailError);
      // Don't fail the request if email fails
    }

    // Return success
    console.log('Partnership agreement submitted successfully');
    res.status(200).json({
      success: true,
      message: 'Partnership agreement submitted successfully'
    });

  } catch (error) {
    console.error('Error submitting partnership agreement:', error);
    res.status(500).json({ error: 'Failed to submit partnership agreement' });
  }
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
      sendgrid: process.env.SENDGRID_API_KEY ? 'configured' : 'not configured',
      authentication: 'enabled',
      client_identification: 'enabled',
      call_forwarding: 'enabled',
      referral_system: referralRoutes ? 'enabled' : 'disabled',
      email_marketing: process.env.SENDGRID_API_KEY ? 'enabled' : 'disabled'
    },
    webhooks: {
      twilio_voice: `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/webhook/twilio/voice`,
      rachel_voice: `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/voice/rachel/`,
      conditional_forward: `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/webhook/conditional-forward`,
      rachel_client_test: `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/voice/rachel/test-client/+18886103810`,
      sendgrid_events: `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/api/email/webhooks/sendgrid`
    },
    api_endpoints: {
      rachel_toggle: '/api/client/rachel-toggle',
      call_forwarding_setup: '/api/call-forwarding/setup/:carrier',
      forwarding_status: '/api/forwarding-status',
      email_send: '/api/email/send',
      email_stats: '/api/email/stats',
      email_events: '/api/email/events'
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