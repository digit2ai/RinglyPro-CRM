'use strict';

// Bridge Checkout - Stripe-first signup flow for KanchoAI
// Flow: Form → POST /initiate → Stripe Checkout (14-day trial) → Webhook provisions everything
// NOTE: For direct registration without Stripe, see bridge-auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Stripe (lazy-loaded, may not have key configured)
let stripe;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (e) { console.log('Stripe not available for Kancho checkout:', e.message); }

// CRM Bridge + Kancho models
let crmBridge, kanchoModels;
try { crmBridge = require('../../config/crm-bridge'); } catch (e) { console.log('CRM Bridge not loaded:', e.message); }
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// Twilio client
let twilioClient;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (e) { console.log('Twilio not available for checkout:', e.message); }

// ElevenLabs provisioning
let elevenlabsProvisioning;
try {
  elevenlabsProvisioning = require('../../services/kancho-elevenlabs-provisioning');
} catch (e) { console.log('ElevenLabs provisioning not available:', e.message); }

// KanchoAI subscription plans
const KANCHO_PLANS = {
  intelligence: {
    name: 'Kancho Intelligence',
    price: 197,
    tokens: 2000,
    description: 'AI Business Intelligence Officer integrated with your CRM',
    features: ['AI Business Intelligence', 'CRM Integration', 'Health Scoring', 'Churn Detection', 'Lead Scoring', 'Revenue Analytics', 'Voice AI Advisor', '100 AI Voice Minutes']
  },
  pro: {
    name: 'Kancho Pro',
    price: 397,
    tokens: 7500,
    description: 'Intelligence + AI Receptionist for 24/7 automation',
    features: ['Everything in Intelligence', '24/7 AI Receptionist', 'Lead Follow-up Calls', 'Retention Campaigns', 'No-show Recovery', 'Payment Reminders', 'Bilingual (EN/ES)', '500 AI Voice Minutes']
  }
};

const KANCHO_STRIPE_LOGO_URL = 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/698d245d721397289ba56c7d.png';

// =========================================================
// POST /initiate - Validate form, save pending, create Stripe session
// =========================================================
router.post('/initiate', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ success: false, error: 'Payment system not configured' });
  }
  if (!crmBridge?.ready || !kanchoModels) {
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable' });
  }

  try {
    const {
      email, password, firstName, lastName, phone,
      schoolName, martialArtType,
      address, city, state, zip, country, timezone,
      website, monthlyRevenueTarget, studentCapacity,
      plan
    } = req.body;

    // 1. Validate required fields
    if (!email || !password || !firstName || !lastName || !phone || !schoolName || !plan) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: email, password, firstName, lastName, phone, schoolName, plan'
      });
    }

    if (!KANCHO_PLANS[plan]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan. Choose: intelligence or pro'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // 2. Check for existing accounts
    const existingUser = await crmBridge.User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'An account already exists with this email' });
    }

    const existingSchool = await kanchoModels.KanchoSchool.findOne({ where: { owner_email: email } });
    if (existingSchool) {
      return res.status(409).json({ success: false, error: 'A school is already registered with this email' });
    }

    // 3. Check for active pending signup (let them resume)
    const existingPending = await kanchoModels.KanchoPendingSignup.findOne({
      where: {
        email,
        status: 'pending',
        expires_at: { [Op.gt]: new Date() }
      }
    });
    if (existingPending) {
      // Retrieve the Stripe session to get the URL
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(existingPending.stripe_checkout_session_id);
        if (existingSession.url) {
          return res.json({
            success: true,
            url: existingSession.url,
            sessionId: existingPending.stripe_checkout_session_id,
            resumed: true
          });
        }
      } catch (e) {
        // Session expired, delete the old pending and create a new one
        await existingPending.destroy();
      }
    }

    // 4. Hash password before saving
    const passwordHash = await bcrypt.hash(password, 12);

    // 5. Create Stripe Checkout Session with 14-day trial
    const planDetails = KANCHO_PLANS[plan];
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: planDetails.name,
            description: planDetails.description,
            images: [KANCHO_STRIPE_LOGO_URL]
          },
          unit_amount: planDetails.price * 100,
          recurring: { interval: 'month' }
        },
        quantity: 1
      }],
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          product: 'kancho_ai',
          plan: plan
        }
      },
      metadata: {
        product: 'kancho_ai',
        plan: plan,
        email: email
      },
      success_url: `${webhookBaseUrl}/kanchoai/signup-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webhookBaseUrl}/kanchoai/pricing?canceled=true`
    });

    // 6. Save to pending signups table
    await kanchoModels.KanchoPendingSignup.create({
      email,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      phone,
      school_name: schoolName,
      martial_art_type: martialArtType || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      country: country || 'USA',
      timezone: timezone || 'America/New_York',
      website: website || null,
      monthly_revenue_target: monthlyRevenueTarget || 0,
      student_capacity: studentCapacity || 100,
      plan,
      stripe_checkout_session_id: session.id,
      status: 'pending',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    console.log(`[KanchoCheckout] Pending signup created for ${email}, session: ${session.id}`);

    res.json({
      success: true,
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('[KanchoCheckout] Initiate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================================
// GET /status/:sessionId - Poll for signup completion status
// =========================================================
router.get('/status/:sessionId', async (req, res) => {
  try {
    if (!kanchoModels) {
      return res.status(503).json({ success: false, error: 'Service unavailable' });
    }

    const pending = await kanchoModels.KanchoPendingSignup.findOne({
      where: { stripe_checkout_session_id: req.params.sessionId }
    });

    if (!pending) {
      return res.status(404).json({ success: false, error: 'Signup session not found' });
    }

    const response = {
      success: true,
      data: {
        status: pending.status,
        step: pending.provisioning_step || null,
        error: pending.status === 'failed' ? pending.provisioning_error : null
      }
    };

    // If completed, include JWT and school data for auto-login
    if (pending.status === 'completed' && pending.result_jwt) {
      response.data.token = pending.result_jwt;
      response.data.school = {
        id: pending.result_school_id,
        name: pending.school_name,
        aiNumber: pending.result_twilio_number,
        hasVoiceAgent: !!pending.result_elevenlabs_agent_id
      };
      response.data.user = {
        id: pending.result_user_id,
        email: pending.email,
        firstName: pending.first_name,
        lastName: pending.last_name
      };
    }

    res.json(response);
  } catch (error) {
    console.error('[KanchoCheckout] Status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================================
// STRIPE WEBHOOK HANDLER
// Exported and mounted separately in src/app.js (before body parser)
// =========================================================
async function stripeWebhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_KANCHO_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[KanchoWebhook] STRIPE_KANCHO_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;
  try {
    const stripeInstance = require('stripe')(process.env.STRIPE_SECRET_KEY);
    event = stripeInstance.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log(`[KanchoWebhook] Verified event: ${event.type}`);
  } catch (err) {
    console.error('[KanchoWebhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Only handle checkout.session.completed
  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data.object;

  // Verify this is a KanchoAI checkout
  if (session.metadata?.product !== 'kancho_ai') {
    return res.json({ received: true });
  }

  // Respond to Stripe immediately (provisioning happens async)
  res.json({ received: true });

  // Process asynchronously
  try {
    await processKanchoSignup(session);
  } catch (error) {
    console.error('[KanchoWebhook] Processing error:', error);
  }
}

// =========================================================
// SIGNUP PROCESSING (called by webhook handler)
// =========================================================
async function processKanchoSignup(session) {
  // Lazy-load dependencies (webhook runs in main app context)
  let bridge, models;
  try { bridge = require('../../config/crm-bridge'); } catch (e) {}
  try { models = require('../../models'); } catch (e) {}

  if (!bridge?.ready || !models) {
    console.error('[KanchoWebhook] Bridge or models not available');
    return;
  }

  // 1. Find pending signup
  const pending = await models.KanchoPendingSignup.findOne({
    where: { stripe_checkout_session_id: session.id }
  });

  if (!pending) {
    console.error(`[KanchoWebhook] No pending signup for session: ${session.id}`);
    return;
  }

  if (pending.status === 'completed') {
    console.log(`[KanchoWebhook] Already completed for: ${pending.email}`);
    return;
  }

  // Mark as processing
  await pending.update({
    status: 'processing',
    provisioning_step: 'starting',
    stripe_customer_id: session.customer || null
  });

  const crmTransaction = await bridge.crmSequelize.transaction();

  try {
    const planDetails = KANCHO_PLANS[pending.plan];
    const planMapping = { intelligence: 'growth', pro: 'professional' };
    const ringlyproPlan = planMapping[pending.plan] || 'growth';

    // ==================== STEP 1: CREATE USER ====================
    await pending.update({ provisioning_step: 'creating_user' });

    const user = await bridge.User.create({
      email: pending.email,
      password_hash: pending.password_hash,
      first_name: pending.first_name,
      last_name: pending.last_name,
      business_name: pending.school_name,
      business_phone: pending.phone,
      business_type: 'fitness',
      website_url: pending.website || null,
      terms_accepted: true,
      free_trial_minutes: 100,
      onboarding_completed: false,
      subscription_plan: ringlyproPlan,
      billing_frequency: 'monthly',
      subscription_status: 'trialing',
      monthly_token_allocation: planDetails.tokens,
      tokens_balance: planDetails.tokens,
      stripe_customer_id: session.customer || null,
      stripe_subscription_id: session.subscription || null
    }, { transaction: crmTransaction });

    console.log(`[KanchoWebhook] Created User ${user.id} for ${pending.email}`);

    // ==================== STEP 2: PROVISION TWILIO NUMBER ====================
    await pending.update({ provisioning_step: 'provisioning_twilio' });

    let twilioNumber, twilioSid;

    // Option A: Use existing Twilio number (for testing or pre-assigned numbers)
    if (process.env.KANCHO_TEST_TWILIO_NUMBER && process.env.KANCHO_TEST_TWILIO_SID) {
      twilioNumber = process.env.KANCHO_TEST_TWILIO_NUMBER;
      twilioSid = process.env.KANCHO_TEST_TWILIO_SID;
      console.log(`[KanchoWebhook] Using existing Twilio number: ${twilioNumber}`);

      // Update webhooks on the existing number to point to our app
      if (twilioClient) {
        try {
          const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
          await twilioClient.incomingPhoneNumbers(twilioSid).update({
            voiceUrl: `${webhookBaseUrl}/voice/rachel/`,
            voiceMethod: 'POST',
            statusCallback: `${webhookBaseUrl}/voice/webhook/call-status`,
            statusCallbackMethod: 'POST',
            smsUrl: `${webhookBaseUrl}/api/messages/incoming`,
            smsMethod: 'POST',
            friendlyName: `KanchoAI - ${pending.school_name}`
          });
          console.log(`[KanchoWebhook] Updated webhooks on existing Twilio number`);
        } catch (updateErr) {
          console.error('[KanchoWebhook] Failed to update Twilio webhooks (non-fatal):', updateErr.message);
        }
      }

    // Option B: Purchase a new Twilio number
    } else if (twilioClient && process.env.SKIP_TWILIO_PROVISIONING !== 'true') {
      twilioNumber = `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
      twilioSid = `PN_PENDING_${Date.now()}`;
      try {
        const availableNumbers = await twilioClient.availablePhoneNumbers('US')
          .local.list({ limit: 1, voiceEnabled: true, smsEnabled: true });

        if (availableNumbers.length > 0) {
          const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
          const purchased = await twilioClient.incomingPhoneNumbers.create({
            phoneNumber: availableNumbers[0].phoneNumber,
            voiceUrl: `${webhookBaseUrl}/voice/rachel/`,
            voiceMethod: 'POST',
            statusCallback: `${webhookBaseUrl}/voice/webhook/call-status`,
            statusCallbackMethod: 'POST',
            smsUrl: `${webhookBaseUrl}/api/messages/incoming`,
            smsMethod: 'POST',
            friendlyName: `KanchoAI - ${pending.school_name}`
          });
          twilioNumber = purchased.phoneNumber;
          twilioSid = purchased.sid;
          console.log(`[KanchoWebhook] Provisioned Twilio: ${twilioNumber}`);
        }
      } catch (twilioError) {
        console.error('[KanchoWebhook] Twilio provisioning failed (using placeholder):', twilioError.message);
      }

    // Option C: No Twilio at all (placeholder)
    } else {
      twilioNumber = `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
      twilioSid = `PN_PENDING_${Date.now()}`;
      console.log(`[KanchoWebhook] Twilio skipped, using placeholder: ${twilioNumber}`);
    }

    // ==================== STEP 3: CREATE CLIENT ====================
    await pending.update({ provisioning_step: 'creating_client' });

    const client = await bridge.Client.create({
      business_name: pending.school_name,
      business_phone: pending.phone,
      ringlypro_number: twilioNumber,
      twilio_number_sid: twilioSid,
      forwarding_status: 'active',
      owner_name: `${pending.first_name} ${pending.last_name}`,
      owner_phone: pending.phone,
      owner_email: pending.email,
      custom_greeting: `Hello! Thank you for calling ${pending.school_name}. I'm your AI assistant, powered by Kancho AI. How can I help you today?`,
      business_hours_start: '09:00:00',
      business_hours_end: '21:00:00',
      business_days: 'Mon-Sat',
      timezone: pending.timezone || 'America/New_York',
      appointment_duration: 60,
      booking_enabled: true,
      sms_notifications: true,
      monthly_free_minutes: 100,
      per_minute_rate: 0.10,
      rachel_enabled: false,
      active: true,
      user_id: user.id
    }, { transaction: crmTransaction });

    console.log(`[KanchoWebhook] Created Client ${client.id}`);

    // ==================== STEP 4: CREATE CREDIT ACCOUNT ====================
    try {
      await bridge.CreditAccount.create({
        client_id: client.id,
        balance: 0.00,
        free_minutes_used: 0
      }, { transaction: crmTransaction });
    } catch (creditError) {
      console.error('[KanchoWebhook] Credit account error (non-fatal):', creditError.message);
    }

    // Commit CRM transaction
    await crmTransaction.commit();

    // ==================== STEP 5: CREATE KANCHOAI SCHOOL ====================
    await pending.update({ provisioning_step: 'creating_school' });

    const school = await models.KanchoSchool.create({
      tenant_id: 1,
      name: pending.school_name,
      owner_name: `${pending.first_name} ${pending.last_name}`,
      owner_email: pending.email,
      owner_phone: pending.phone,
      address: pending.address || null,
      city: pending.city || null,
      state: pending.state || null,
      zip: pending.zip || null,
      country: pending.country || 'USA',
      timezone: pending.timezone || 'America/New_York',
      martial_art_type: pending.martial_art_type || null,
      plan_type: pending.plan,
      monthly_revenue_target: pending.monthly_revenue_target || 0,
      student_capacity: pending.student_capacity || 100,
      website: pending.website || null,
      ai_enabled: true,
      voice_agent: 'kancho',
      status: 'trial',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      ringlypro_client_id: client.id,
      ringlypro_user_id: user.id
    });

    console.log(`[KanchoWebhook] Created School ${school.id}`);

    // ==================== STEP 6: ELEVENLABS AGENT (NON-FATAL) ====================
    await pending.update({ provisioning_step: 'creating_voice_agent' });

    let elevenlabsAgentId = null;
    let elProvisioning;
    try { elProvisioning = require('../../services/kancho-elevenlabs-provisioning'); } catch (e) {}

    if (elProvisioning && process.env.ELEVENLABS_API_KEY &&
        process.env.SKIP_ELEVENLABS_PROVISIONING !== 'true') {
      try {
        const result = await elProvisioning.provisionAgentForSchool(
          {
            schoolName: pending.school_name,
            ownerPhone: pending.phone,
            martialArtType: pending.martial_art_type,
            timezone: pending.timezone,
            website: pending.website
          },
          twilioNumber,
          twilioSid,
          client.id
        );

        if (result.success) {
          elevenlabsAgentId = result.agentId;
          // Update client with ElevenLabs IDs (CRM transaction already committed, use direct update)
          await bridge.Client.update({
            elevenlabs_agent_id: result.agentId,
            elevenlabs_phone_number_id: result.phoneNumberId
          }, { where: { id: client.id } });
          console.log(`[KanchoWebhook] ElevenLabs agent created: ${result.agentId}`);
        } else {
          console.error('[KanchoWebhook] ElevenLabs failed (non-fatal):', result.error);
        }
      } catch (elError) {
        console.error('[KanchoWebhook] ElevenLabs error (non-fatal):', elError.message);
      }
    }

    // ==================== STEP 7: UPDATE STRIPE SUBSCRIPTION METADATA ====================
    await pending.update({ provisioning_step: 'updating_stripe' });

    try {
      if (session.subscription) {
        const stripeInstance = require('stripe')(process.env.STRIPE_SECRET_KEY);
        await stripeInstance.subscriptions.update(session.subscription, {
          metadata: {
            userId: user.id.toString(),
            plan: pending.plan,
            product: 'kancho_ai',
            schoolId: school.id.toString(),
            clientId: client.id.toString(),
            monthlyTokens: planDetails.tokens.toString(),
            rollover: 'true'
          }
        });
      }
    } catch (stripeError) {
      console.error('[KanchoWebhook] Stripe metadata update (non-fatal):', stripeError.message);
    }

    // ==================== STEP 8: GENERATE JWT + MARK COMPLETE ====================
    const token = jwt.sign({
      userId: user.id,
      email: user.email,
      clientId: client.id,
      schoolId: school.id,
      businessName: pending.school_name,
      source: 'kanchoai'
    }, JWT_SECRET, { expiresIn: '7d' });

    await pending.update({
      status: 'completed',
      provisioning_step: 'done',
      result_user_id: user.id,
      result_client_id: client.id,
      result_school_id: school.id,
      result_twilio_number: twilioNumber,
      result_elevenlabs_agent_id: elevenlabsAgentId,
      result_jwt: token,
      completed_at: new Date()
    });

    console.log(`[KanchoWebhook] Signup COMPLETE for ${pending.email} — User:${user.id} Client:${client.id} School:${school.id} Twilio:${twilioNumber} Agent:${elevenlabsAgentId || 'none'}`);

  } catch (error) {
    try { await crmTransaction.rollback(); } catch (e) {}

    await pending.update({
      status: 'failed',
      provisioning_error: error.message
    });

    console.error(`[KanchoWebhook] Signup FAILED for ${pending.email}:`, error);
  }
}

// =========================================================
// POST /test-trigger/:sessionId - DEV ONLY: Skip Stripe, trigger provisioning directly
// Protected by JWT_SECRET as auth header
// =========================================================
router.post('/test-trigger/:sessionId', async (req, res) => {
  // Auth check: require JWT_SECRET as Bearer token
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${JWT_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    if (!kanchoModels) {
      return res.status(503).json({ success: false, error: 'Models not available' });
    }

    const pending = await kanchoModels.KanchoPendingSignup.findOne({
      where: { stripe_checkout_session_id: req.params.sessionId }
    });

    if (!pending) {
      return res.status(404).json({ success: false, error: 'Pending signup not found' });
    }

    if (pending.status === 'completed') {
      return res.json({ success: true, message: 'Already completed', status: pending.status });
    }

    // Build a mock session object with the fields processKanchoSignup needs
    const mockSession = {
      id: pending.stripe_checkout_session_id,
      customer: `cus_test_${Date.now()}`,
      subscription: `sub_test_${Date.now()}`,
      metadata: {
        product: 'kancho_ai',
        plan: pending.plan,
        email: pending.email
      }
    };

    res.json({ success: true, message: 'Provisioning triggered', sessionId: req.params.sessionId });

    // Process async (same as webhook)
    await processKanchoSignup(mockSession);
  } catch (error) {
    console.error('[KanchoCheckout] Test trigger error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export router + webhook handler separately
router.stripeWebhookHandler = stripeWebhookHandler;
module.exports = router;
