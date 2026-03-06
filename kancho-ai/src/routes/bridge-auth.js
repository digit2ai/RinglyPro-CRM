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

// DEBUG: Test auth flow (REMOVE AFTER DEBUG)
router.post('/debug-auth', async (req, res) => {
  try {
    const email = req.body.email || 'carlos@tampabaybjj.com';
    const result = { email, bridgeReady: !!crmBridge?.ready, kanchoModelsReady: !!kanchoModels };

    if (kanchoModels) {
      const school = await kanchoModels.KanchoSchool.findOne({ where: { owner_email: email } });
      if (school) {
        result.schoolFound = true;
        result.schoolId = school.id;
        result.settingsType = typeof school.settings;
        result.settingsKeys = Object.keys(school.settings || {});
        result.hasPasswordHash = !!(school.settings && school.settings.password_hash);
        if (school.settings?.password_hash) {
          result.hashPrefix = school.settings.password_hash.substring(0, 10);
          const testMatch = await bcrypt.compare('KanchoAI2024!', school.settings.password_hash);
          result.testPasswordMatch = testMatch;
        }
      } else {
        result.schoolFound = false;
      }
    }

    if (crmBridge?.ready) {
      try {
        const user = await crmBridge.User.findOne({ where: { email } });
        result.bridgeUserFound = !!user;
      } catch (e) {
        result.bridgeError = e.message;
      }
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// POST /register - Create KanchoAI school (+ RinglyPro User + Client if bridge available)
router.post('/register', async (req, res) => {
  try {
    const {
      schoolName, martialArtType, address, city, state, zip, country, timezone,
      email, password, firstName, lastName, phone, businessPhone,
      website, monthlyRevenueTarget, studentCapacity,
      plan, billing
    } = req.body;

    if (!email || !password || !firstName || !lastName || !schoolName) {
      return res.status(400).json({ success: false, error: 'Email, password, first name, last name, and school name are required' });
    }

    const ownerPhone = businessPhone || phone || '';

    // Check if school owner email already exists in KanchoAI
    const existingSchool = await kanchoModels.KanchoSchool.findOne({ where: { owner_email: email } });
    if (existingSchool) {
      return res.status(409).json({ success: false, error: 'A school is already registered with this email' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const PLANS = {
      free: { tokens: 100, price: 0 },
      starter: { tokens: 500, price: 45 },
      growth: { tokens: 2000, price: 180 },
      professional: { tokens: 7500, price: 675 }
    };
    const selectedPlan = PLANS[plan] ? plan : 'free';

    let userId = null, clientId = null, twilioNumber = null;

    // Bridge path: also create RinglyPro User + Client
    if (crmBridge?.ready) {
      const crmTransaction = await crmBridge.crmSequelize.transaction();
      try {
        const existingUser = await crmBridge.User.findOne({ where: { email } });
        if (existingUser) {
          await crmTransaction.rollback();
          return res.status(409).json({ success: false, error: 'An account already exists with this email' });
        }

        const user = await crmBridge.User.create({
          email, password_hash: passwordHash, first_name: firstName, last_name: lastName,
          business_name: schoolName, business_phone: ownerPhone, business_type: 'fitness',
          website_url: website || null, terms_accepted: true, free_trial_minutes: 100,
          onboarding_completed: false, subscription_plan: selectedPlan,
          billing_frequency: billing === 'annual' ? 'annual' : 'monthly',
          subscription_status: selectedPlan === 'free' ? 'active' : 'pending',
          monthly_token_allocation: PLANS[selectedPlan].tokens,
          tokens_balance: selectedPlan === 'free' ? PLANS[selectedPlan].tokens : 0
        }, { transaction: crmTransaction });
        userId = user.id;

        twilioNumber = `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
        const client = await crmBridge.Client.create({
          business_name: schoolName, business_phone: ownerPhone, ringlypro_number: twilioNumber,
          twilio_number_sid: `PN_PENDING_${Date.now()}`, forwarding_status: 'active',
          owner_name: `${firstName} ${lastName}`, owner_phone: ownerPhone, owner_email: email,
          custom_greeting: `Hello! Thank you for calling ${schoolName}. I'm your AI assistant.`,
          business_hours_start: '09:00:00', business_hours_end: '21:00:00', business_days: 'Mon-Sat',
          timezone: timezone || 'America/New_York', appointment_duration: 60, booking_enabled: true,
          sms_notifications: true, monthly_free_minutes: 100, per_minute_rate: 0.10,
          rachel_enabled: false, active: true, user_id: user.id
        }, { transaction: crmTransaction });
        clientId = client.id;

        try { await crmBridge.CreditAccount.create({ client_id: client.id, balance: 0, free_minutes_used: 0 }, { transaction: crmTransaction }); } catch (e) {}
        await crmTransaction.commit();
        console.log(`KanchoAI: Created bridge User ${userId} + Client ${clientId}`);
      } catch (bridgeErr) {
        try { await crmTransaction.rollback(); } catch (e) {}
        console.log('KanchoAI: Bridge registration failed, using direct mode:', bridgeErr.message);
      }
    }

    // Create KanchoAI school
    const school = await kanchoModels.KanchoSchool.create({
      tenant_id: 1, name: schoolName, owner_name: `${firstName} ${lastName}`,
      owner_email: email, owner_phone: ownerPhone,
      address: address || null, city: city || null, state: state || null,
      zip: zip || null, country: country || 'USA', timezone: timezone || 'America/New_York',
      martial_art_type: martialArtType || null,
      plan_type: selectedPlan === 'free' ? 'starter' : selectedPlan,
      monthly_revenue_target: monthlyRevenueTarget || 0, student_capacity: studentCapacity || 100,
      website: website || null, ai_enabled: true, voice_agent: 'kancho', status: 'trial',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      settings: { password_hash: passwordHash },
      ringlypro_client_id: clientId, ringlypro_user_id: userId
    });

    console.log(`KanchoAI: Created school ${school.id} for ${email}`);

    const token = jwt.sign({
      userId, email, clientId, schoolId: school.id, businessName: schoolName,
      source: userId ? 'kanchoai' : 'kanchoai-direct'
    }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true, token,
      data: {
        school: { id: school.id, name: school.name, martialArtType: school.martial_art_type, status: school.status, voiceAgent: school.voice_agent, trialEndsAt: school.trial_ends_at },
        client: clientId ? { id: clientId, aiNumber: twilioNumber, rachelEnabled: false } : null,
        user: { id: userId, email, firstName, lastName, plan: selectedPlan, tokensBalance: PLANS[selectedPlan].tokens }
      }
    });
  } catch (error) {
    console.error('KanchoAI Register error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /login - Authenticate against RinglyPro User, return combined JWT
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    console.log('LOGIN attempt for:', email, 'password length:', password?.length, 'password first 3:', password?.substring(0, 3));

    // Strategy 1: Try RinglyPro bridge login (if bridge is available)
    if (crmBridge?.ready) {
      console.log('LOGIN: Trying bridge strategy');
      try {
        const user = await crmBridge.User.findOne({ where: { email } });
        if (user) {
          const isValid = await bcrypt.compare(password, user.password_hash);
          if (isValid) {
            const client = await crmBridge.Client.findOne({ where: { user_id: user.id } });
            let school = null;
            if (client) school = await kanchoModels.KanchoSchool.findOne({ where: { ringlypro_client_id: client.id } });
            if (!school) school = await kanchoModels.KanchoSchool.findOne({ where: { owner_email: email } });

            if (school) {
              const token = jwt.sign({
                userId: user.id, email: user.email, clientId: client?.id || null,
                schoolId: school.id, businessName: school.name, source: 'kanchoai'
              }, JWT_SECRET, { expiresIn: '7d' });
              await user.update({ updated_at: new Date() });
              console.log('LOGIN: Bridge success for school', school.id);
              return res.json({
                success: true, token,
                data: {
                  school: { id: school.id, name: school.name, martialArtType: school.martial_art_type, status: school.status, voiceAgent: school.voice_agent, planType: school.plan_type },
                  client: client ? { id: client.id, aiNumber: client.ringlypro_number, rachelEnabled: client.rachel_enabled } : null,
                  user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, plan: user.subscription_plan, tokensBalance: user.tokens_balance }
                }
              });
            } else {
              console.log('LOGIN: Bridge user found but no linked school');
            }
          } else {
            console.log('LOGIN: Bridge user found but password mismatch');
          }
        } else {
          console.log('LOGIN: No bridge user found for', email);
        }
      } catch (bridgeErr) {
        console.log('LOGIN: Bridge strategy error:', bridgeErr.message);
      }
    } else {
      console.log('LOGIN: Bridge not available');
    }

    // Strategy 2: Direct KanchoAI school login (owner_email + password_hash on school settings)
    if (kanchoModels) {
      console.log('LOGIN: Trying direct strategy');
      const school = await kanchoModels.KanchoSchool.findOne({ where: { owner_email: email } });
      if (school) {
        const settings = school.settings || {};
        console.log('LOGIN: School found id:', school.id, 'settingsType:', typeof settings, 'keys:', Object.keys(settings), 'has pw:', !!settings.password_hash);
        if (settings.password_hash) {
          console.log('LOGIN: Comparing password:', JSON.stringify(password), 'hash prefix:', settings.password_hash.substring(0, 10));
          const isValid = await bcrypt.compare(password, settings.password_hash);
          console.log('LOGIN: Password valid:', isValid);
          if (isValid) {
            const token = jwt.sign({
              userId: null, email, clientId: null,
              schoolId: school.id, businessName: school.name, source: 'kanchoai-direct'
            }, JWT_SECRET, { expiresIn: '7d' });
            await school.update({ updated_at: new Date() });
            console.log('LOGIN: Direct success for school', school.id);
            return res.json({
              success: true, token,
              data: {
                school: { id: school.id, name: school.name, martialArtType: school.martial_art_type, status: school.status, voiceAgent: school.voice_agent, planType: school.plan_type },
                client: null,
                user: { id: null, email, firstName: school.owner_name?.split(' ')[0] || 'Admin', lastName: school.owner_name?.split(' ').slice(1).join(' ') || '', plan: school.plan_type, tokensBalance: 1000 }
              }
            });
          }
        }
      } else {
        console.log('LOGIN: No school found for', email);
      }
    }

    console.log('LOGIN: All strategies failed for', email);
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  } catch (error) {
    console.error('KanchoAI Bridge Login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /me - Get combined profile (school + client + user)
router.get('/me', authenticateBridge, async (req, res) => {
  try {
    const school = await kanchoModels.KanchoSchool.findByPk(req.schoolId);
    if (!school) return res.status(404).json({ success: false, error: 'School not found' });

    // Bridge user/client lookup (only if userId exists — skip for direct login)
    let user = null, client = null;
    if (req.userId && crmBridge?.ready) {
      try {
        [user, client] = await Promise.all([
          crmBridge.User.findByPk(req.userId, { attributes: { exclude: ['password_hash'] } }),
          req.clientId ? crmBridge.Client.findByPk(req.clientId) : null
        ]);
      } catch (bridgeErr) {
        console.log('Bridge lookup skipped:', bridgeErr.message);
      }
    }

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
        } : {
          id: null,
          email: school.owner_email || req.userEmail,
          firstName: school.owner_name?.split(' ')[0] || 'Admin',
          lastName: school.owner_name?.split(' ').slice(1).join(' ') || '',
          plan: school.plan_type,
          tokensBalance: 1000,
          tokensUsedThisMonth: 0,
          monthlyAllocation: 1000
        },
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

// =========================================================
// POST /forgot-password - Generate reset token and send email
// =========================================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    // Try bridge user first, then direct school
    let user = null;
    if (crmBridge?.ready) {
      user = await crmBridge.User.findOne({ where: { email } });
    }

    // Also check for direct school login
    let school = null;
    if (kanchoModels) {
      school = await kanchoModels.KanchoSchool.findOne({ where: { owner_email: email } });
    }

    if (!user && !school) {
      return res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
    }

    // Generate reset token (1 hour)
    const resetToken = jwt.sign(
      { userId: user ? user.id : null, email, schoolId: school ? school.id : null, type: 'password_reset' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    if (user) await user.update({ email_verification_token: resetToken });
    if (school) {
      const settings = school.settings || {};
      settings.reset_token = resetToken;
      await school.update({ settings });
    }

    const APP_URL = process.env.APP_URL || 'https://aiagent.ringlypro.com';
    const resetLink = `${APP_URL}/kanchoai/?reset_token=${resetToken}`;

    // Send email via SendGrid
    try {
      const sgMail = require('@sendgrid/mail');
      if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to: email,
          from: { email: process.env.FROM_EMAIL || 'noreply@ringlypro.com', name: 'Kancho AI' },
          subject: 'Reset Your Kancho AI Password',
          html: '<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#1A1A1A 0%,#2A2A2A 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0}.header h1{color:#E85A4F;margin:0;font-size:24px}.content{background:#111;padding:30px;border:1px solid #2A2A2A;color:#ccc}.button{display:inline-block;background:#E85A4F;color:white;padding:14px 30px;text-decoration:none;border-radius:8px;margin:20px 0;font-weight:bold}.footer{text-align:center;color:#6b7280;margin-top:20px;font-size:14px;padding:16px}</style></head><body><div class="container"><div class="header"><h1>🥋 Kancho AI</h1></div><div class="content"><p>Hello <strong>' + (user.first_name || 'there') + '</strong>,</p><p>You requested to reset your password for your Kancho AI account.</p><div style="text-align:center"><a href="' + resetLink + '" class="button">Reset My Password</a></div><p style="color:#f59e0b"><strong>⏰ This link expires in 1 hour.</strong></p><p style="font-size:14px;color:#6b7280">If the button doesn\'t work, copy this link:<br><code style="color:#E85A4F">' + resetLink + '</code></p><hr style="border-color:#2A2A2A"><p style="font-size:14px;color:#6b7280">If you didn\'t request this, ignore this email.</p></div><div class="footer"><p>Kancho AI — AI Business Intelligence for Martial Arts</p></div></div></body></html>'
        });
        console.log(`✅ KanchoAI password reset email sent to: ${email}`);
      } else {
        console.log(`⚠️ SendGrid not configured. Reset link: ${resetLink}`);
      }
    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
    }

    res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (error) {
    console.error('KanchoAI forgot password error:', error);
    res.status(500).json({ success: false, error: 'Failed to process request' });
  }
});

// =========================================================
// POST /verify-reset-token - Verify if a reset token is valid
// =========================================================
router.post('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Token is required' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== 'password_reset') throw new Error('Invalid token type');
    } catch (err) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
    }

    // Check bridge user or direct school
    let valid = false;
    if (decoded.userId && crmBridge?.ready) {
      const user = await crmBridge.User.findOne({ where: { id: decoded.userId, email: decoded.email, email_verification_token: token } });
      if (user) valid = true;
    }
    if (!valid && decoded.schoolId && kanchoModels) {
      const school = await kanchoModels.KanchoSchool.findByPk(decoded.schoolId);
      if (school && school.settings?.reset_token === token) valid = true;
    }

    if (!valid) return res.status(400).json({ success: false, error: 'Invalid or already used reset link' });

    res.json({ success: true, email: decoded.email });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify token' });
  }
});

// =========================================================
// POST /reset-password - Set new password with valid token
// =========================================================
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, error: 'Token and new password are required' });
    if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== 'password_reset') throw new Error('Invalid token type');
    } catch (err) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    let reset = false;

    // Reset bridge user password
    if (decoded.userId && crmBridge?.ready) {
      const user = await crmBridge.User.findOne({ where: { id: decoded.userId, email: decoded.email, email_verification_token: token } });
      if (user) {
        await user.update({ password_hash: hashedPassword, email_verification_token: null });
        reset = true;
      }
    }

    // Reset direct school password
    if (decoded.schoolId && kanchoModels) {
      const school = await kanchoModels.KanchoSchool.findByPk(decoded.schoolId);
      if (school && school.settings?.reset_token === token) {
        const settings = { ...school.settings, password_hash: hashedPassword, reset_token: null };
        await school.update({ settings });
        reset = true;
      }
    }

    if (!reset) return res.status(400).json({ success: false, error: 'Invalid reset token' });

    console.log('KanchoAI password reset for: ' + decoded.email);
    res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (error) {
    console.error('KanchoAI reset password error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

// Export router and middleware
router.authenticateBridge = authenticateBridge;
module.exports = router;
