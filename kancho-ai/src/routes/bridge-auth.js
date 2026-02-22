'use strict';

// Bridge Auth - Unified signup/login that creates KanchoAI school + RinglyPro User/Client
// This is the white-label layer: member sees KanchoAI, engine is RinglyPro

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

let crmBridge, kanchoModels;
try { crmBridge = require('../../config/crm-bridge'); } catch (e) { console.log('CRM Bridge not loaded:', e.message); }
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// Twilio client (optional - for phone provisioning)
let twilioClient;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (e) { console.log('Twilio not available for bridge:', e.message); }

// Middleware: authenticate bridge JWT
function authenticateBridge(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.schoolId = decoded.schoolId;
    req.clientId = decoded.clientId;
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// POST /register - Create KanchoAI school + RinglyPro User + Client in one transaction
router.post('/register', async (req, res) => {
  if (!crmBridge?.ready) return res.status(503).json({ success: false, error: 'CRM bridge not available' });

  const crmTransaction = await crmBridge.crmSequelize.transaction();

  try {
    const {
      // School info
      schoolName, martialArtType, address, city, state, zip, country, timezone,
      // Owner info (becomes RinglyPro User + Client owner)
      email, password, firstName, lastName, phone, businessPhone,
      // Optional
      website, monthlyRevenueTarget, studentCapacity,
      // Subscription
      plan, billing
    } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !schoolName) {
      await crmTransaction.rollback();
      return res.status(400).json({ success: false, error: 'Email, password, first name, last name, and school name are required' });
    }

    const ownerPhone = businessPhone || phone;
    if (!ownerPhone) {
      await crmTransaction.rollback();
      return res.status(400).json({ success: false, error: 'A phone number is required for your AI voice system' });
    }

    // Check if email already exists in RinglyPro
    const existingUser = await crmBridge.User.findOne({ where: { email } });
    if (existingUser) {
      await crmTransaction.rollback();
      return res.status(409).json({ success: false, error: 'An account already exists with this email' });
    }

    // Check if school owner email already exists in KanchoAI
    const existingSchool = await kanchoModels.KanchoSchool.findOne({ where: { owner_email: email } });
    if (existingSchool) {
      await crmTransaction.rollback();
      return res.status(409).json({ success: false, error: 'A school is already registered with this email' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Subscription plan validation
    const PLANS = {
      free: { tokens: 100, price: 0 },
      starter: { tokens: 500, price: 45 },
      growth: { tokens: 2000, price: 180 },
      professional: { tokens: 7500, price: 675 }
    };
    const selectedPlan = PLANS[plan] ? plan : 'free';
    const planDetails = PLANS[selectedPlan];

    // ==================== 1. CREATE RINGLYPRO USER ====================
    const user = await crmBridge.User.create({
      email,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      business_name: schoolName,
      business_phone: ownerPhone,
      business_type: 'fitness', // Martial arts maps to fitness
      website_url: website || null,
      terms_accepted: true,
      free_trial_minutes: 100,
      onboarding_completed: false,
      subscription_plan: selectedPlan,
      billing_frequency: billing === 'annual' ? 'annual' : 'monthly',
      subscription_status: selectedPlan === 'free' ? 'active' : 'pending',
      monthly_token_allocation: planDetails.tokens,
      tokens_balance: selectedPlan === 'free' ? planDetails.tokens : 0
    }, { transaction: crmTransaction });

    console.log(`KanchoAI Bridge: Created RinglyPro User ${user.id} for ${email}`);

    // ==================== 2. PROVISION TWILIO NUMBER ====================
    let twilioNumber = `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
    let twilioSid = `PN_PENDING_${Date.now()}`;

    if (twilioClient && process.env.SKIP_TWILIO_PROVISIONING !== 'true') {
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
            friendlyName: `KanchoAI - ${schoolName}`
          });
          twilioNumber = purchased.phoneNumber;
          twilioSid = purchased.sid;
          console.log(`KanchoAI Bridge: Provisioned Twilio number ${twilioNumber}`);
        }
      } catch (twilioError) {
        console.error('KanchoAI Bridge: Twilio provisioning failed (using placeholder):', twilioError.message);
      }
    }

    // ==================== 3. CREATE RINGLYPRO CLIENT ====================
    const client = await crmBridge.Client.create({
      business_name: schoolName,
      business_phone: ownerPhone,
      ringlypro_number: twilioNumber,
      twilio_number_sid: twilioSid,
      forwarding_status: 'active',
      owner_name: `${firstName} ${lastName}`,
      owner_phone: ownerPhone,
      owner_email: email,
      custom_greeting: `Hello! Thank you for calling ${schoolName}. I'm your AI assistant, powered by KanchoAI. How can I help you today?`,
      business_hours_start: '09:00:00',
      business_hours_end: '21:00:00',
      business_days: 'Mon-Sat',
      timezone: timezone || 'America/New_York',
      appointment_duration: 60,
      booking_enabled: true,
      sms_notifications: true,
      monthly_free_minutes: 100,
      per_minute_rate: 0.10,
      rachel_enabled: false,
      active: true,
      user_id: user.id
    }, { transaction: crmTransaction });

    console.log(`KanchoAI Bridge: Created RinglyPro Client ${client.id}`);

    // ==================== 4. CREATE CREDIT ACCOUNT ====================
    try {
      await crmBridge.CreditAccount.create({
        client_id: client.id,
        balance: 0.00,
        free_minutes_used: 0
      }, { transaction: crmTransaction });
    } catch (creditError) {
      console.error('KanchoAI Bridge: Credit account creation non-fatal error:', creditError.message);
    }

    // Commit CRM transaction
    await crmTransaction.commit();

    // ==================== 5. CREATE KANCHOAI SCHOOL ====================
    const school = await kanchoModels.KanchoSchool.create({
      tenant_id: 1,
      name: schoolName,
      owner_name: `${firstName} ${lastName}`,
      owner_email: email,
      owner_phone: ownerPhone,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      country: country || 'USA',
      timezone: timezone || 'America/New_York',
      martial_art_type: martialArtType || null,
      plan_type: selectedPlan === 'free' ? 'starter' : selectedPlan,
      monthly_revenue_target: monthlyRevenueTarget || 0,
      student_capacity: studentCapacity || 100,
      website: website || null,
      ai_enabled: true,
      voice_agent: 'kancho',
      status: 'trial',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      ringlypro_client_id: client.id,
      ringlypro_user_id: user.id
    });

    console.log(`KanchoAI Bridge: Created KanchoSchool ${school.id} linked to Client ${client.id}`);

    // ==================== 6. GENERATE JWT ====================
    const token = jwt.sign({
      userId: user.id,
      email: user.email,
      clientId: client.id,
      schoolId: school.id,
      businessName: schoolName,
      source: 'kanchoai'
    }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      token,
      data: {
        school: {
          id: school.id,
          name: school.name,
          martialArtType: school.martial_art_type,
          status: school.status,
          voiceAgent: school.voice_agent,
          trialEndsAt: school.trial_ends_at
        },
        client: {
          id: client.id,
          aiNumber: twilioNumber,
          rachelEnabled: client.rachel_enabled
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          plan: selectedPlan,
          tokensBalance: user.tokens_balance
        }
      }
    });
  } catch (error) {
    try { await crmTransaction.rollback(); } catch (e) {}
    console.error('KanchoAI Bridge Register error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /login - Authenticate against RinglyPro User, return combined JWT
router.post('/login', async (req, res) => {
  if (!crmBridge?.ready) return res.status(503).json({ success: false, error: 'CRM bridge not available' });

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Find user in RinglyPro
    const user = await crmBridge.User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    // Find linked client
    const client = await crmBridge.Client.findOne({ where: { user_id: user.id } });

    // Find linked KanchoAI school
    let school = null;
    if (client) {
      school = await kanchoModels.KanchoSchool.findOne({ where: { ringlypro_client_id: client.id } });
    }
    if (!school) {
      school = await kanchoModels.KanchoSchool.findOne({ where: { owner_email: email } });
    }

    if (!school) {
      return res.status(404).json({ success: false, error: 'No KanchoAI school found for this account. Please register first.' });
    }

    // Generate combined JWT
    const token = jwt.sign({
      userId: user.id,
      email: user.email,
      clientId: client?.id || null,
      schoolId: school.id,
      businessName: school.name,
      source: 'kanchoai'
    }, JWT_SECRET, { expiresIn: '7d' });

    // Update last login
    await user.update({ updated_at: new Date() });

    res.json({
      success: true,
      token,
      data: {
        school: {
          id: school.id,
          name: school.name,
          martialArtType: school.martial_art_type,
          status: school.status,
          voiceAgent: school.voice_agent,
          healthScore: null // Will be fetched separately
        },
        client: client ? {
          id: client.id,
          aiNumber: client.ringlypro_number,
          rachelEnabled: client.rachel_enabled
        } : null,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          plan: user.subscription_plan,
          tokensBalance: user.tokens_balance
        }
      }
    });
  } catch (error) {
    console.error('KanchoAI Bridge Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /me - Get combined profile (school + client + user)
router.get('/me', authenticateBridge, async (req, res) => {
  try {
    const [user, client, school] = await Promise.all([
      crmBridge.User.findByPk(req.userId, { attributes: { exclude: ['password_hash'] } }),
      req.clientId ? crmBridge.Client.findByPk(req.clientId) : null,
      kanchoModels.KanchoSchool.findByPk(req.schoolId)
    ]);

    if (!school) return res.status(404).json({ success: false, error: 'School not found' });

    // Get latest health score
    let healthScore = null;
    try {
      healthScore = await kanchoModels.KanchoHealthScore.findOne({
        where: { school_id: school.id },
        order: [['created_at', 'DESC']]
      });
    } catch (e) {}

    res.json({
      success: true,
      data: {
        school: {
          id: school.id,
          name: school.name,
          martialArtType: school.martial_art_type,
          activeStudents: school.active_students,
          studentCapacity: school.student_capacity,
          monthlyRevenueTarget: school.monthly_revenue_target,
          voiceAgent: school.voice_agent,
          aiEnabled: school.ai_enabled,
          status: school.status,
          planType: school.plan_type
        },
        client: client ? {
          id: client.id,
          aiNumber: client.ringlypro_number,
          rachelEnabled: client.rachel_enabled,
          bookingEnabled: client.booking_enabled,
          businessHoursStart: client.business_hours_start,
          businessHoursEnd: client.business_hours_end,
          businessDays: client.business_days,
          customGreeting: client.custom_greeting,
          elevenlabsAgentId: client.elevenlabs_agent_id || null
        } : null,
        user: user ? {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          plan: user.subscription_plan,
          tokensBalance: user.tokens_balance,
          tokensUsedThisMonth: user.tokens_used_this_month,
          monthlyAllocation: user.monthly_token_allocation
        } : null,
        healthScore: healthScore ? {
          overall: healthScore.overall_score,
          grade: healthScore.grade,
          retention: healthScore.retention_score,
          revenue: healthScore.revenue_score,
          leads: healthScore.lead_score,
          date: healthScore.date
        } : null
      }
    });
  } catch (error) {
    console.error('KanchoAI Bridge Profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export router and middleware
router.authenticateBridge = authenticateBridge;
module.exports = router;
