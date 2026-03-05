const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { User, sequelize } = require('../models');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');
const { sendWelcomeSMS } = require('../services/appointmentNotification');
const { normalizePhoneFromSpeech } = require('../utils/phoneNormalizer');

// Optional: Referral code utilities (won't crash if not available)
let generateUniqueReferralCode = null;
let getClientByReferralCode = null;
try {
    const referralUtils = require('../utils/referralCode');
    generateUniqueReferralCode = referralUtils.generateUniqueReferralCode;
    getClientByReferralCode = referralUtils.getClientByReferralCode;
    console.log('✅ Referral utilities loaded in auth routes');
} catch (error) {
    console.log('⚠️ Referral utilities not available (optional) - signups will work without referral codes');
}

const router = express.Router();

// Import Client and CreditAccount models for appointment booking
let Client, CreditAccount;
try {
    const models = require('../models');
    Client = models.Client;
    CreditAccount = models.CreditAccount;
    console.log('✅ Client and CreditAccount models imported for auth routes');
} catch (error) {
    console.log('⚠️ Client model not available:', error.message);
}

console.log('🔍 AUTH ROUTES FILE LOADED - Routes should be available');

// =====================================================
// SUBSCRIPTION PLANS - Server-side validation
// These values override any frontend-passed values for security
// =====================================================
const SUBSCRIPTION_PLANS = {
    starter: {
        name: 'Starter',
        price: 45,           // $45/month
        tokens: 500,         // 500 tokens/month (100 minutes)
        rollover: true,
        description: 'For small businesses'
    },
    growth: {
        name: 'Growth',
        price: 180,          // $180/month
        tokens: 2000,        // 2,000 tokens/month (400 minutes)
        rollover: true,
        description: 'For growing businesses'
    },
    professional: {
        name: 'Professional',
        price: 675,          // $675/month
        tokens: 7500,        // 7,500 tokens/month (1,500 minutes)
        rollover: true,
        description: 'For large teams'
    }
};

// Annual discount: 15% off
const ANNUAL_DISCOUNT = 0.15;

// Simple test route (no middleware)
router.get('/simple-test', (req, res) => {
    console.log('🎯 Simple test route was called!');
    res.json({ success: true, message: 'Auth routes are loading successfully!' });
});

// =====================================================
// PHASE 1: REGISTER — Validate, create User, Stripe checkout
// Flow: Form → Stripe → Provisioning (complete-setup)
// NO Twilio, NO Client creation, NO ElevenLabs, NO welcome SMS/email
// =====================================================
router.post('/register', async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const {
            email,
            password,       // Optional: kept for backward compatibility, ignored if empty
            firstName,
            lastName,
            businessName,
            businessPhone,
            businessType,
            websiteUrl,
            phoneNumber,
            businessDescription,
            businessHours,
            services,
            termsAccepted,
            referralCode,  // Optional: referral code from URL parameter
            timezone,      // IANA timezone (e.g., 'America/New_York')
            businessDays,  // Comma-separated (e.g., 'Mon,Tue,Wed,Thu,Fri')
            // Subscription plan parameters from pricing table
            plan,          // 'starter', 'growth', 'professional'
            amount,        // Total amount (monthly or annual)
            tokens,        // Total tokens (monthly allocation or annual total)
            billing        // 'monthly' or 'annual'
        } = req.body;

        console.log('📝 Registration attempt:', { email, firstName, lastName, businessName, businessType, businessPhone, plan, billing });

        // Validate required fields (password no longer required — OTP generated server-side)
        if (!email || !firstName || !lastName) {
            await transaction.rollback();
            return res.status(400).json({
                error: 'Email, first name, and last name are required'
            });
        }

        // Validate business phone for Rachel AI
        if (!businessPhone) {
            await transaction.rollback();
            return res.status(400).json({
                error: 'Business phone number is required for your Rachel AI system'
            });
        }

        // Normalize phone numbers
        const normalizedBusinessPhone = normalizePhoneFromSpeech(businessPhone);
        const normalizedPhoneNumber = phoneNumber ? normalizePhoneFromSpeech(phoneNumber) : null;

        console.log(`📞 Normalized business phone: ${businessPhone} → ${normalizedBusinessPhone}`);
        if (phoneNumber) {
            console.log(`📞 Normalized personal phone: ${phoneNumber} → ${normalizedPhoneNumber}`);
        }

        // Validate terms acceptance
        if (!termsAccepted) {
            await transaction.rollback();
            return res.status(400).json({
                error: 'You must accept the terms and conditions to register'
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            await transaction.rollback();
            return res.status(409).json({
                error: 'User already exists with this email'
            });
        }

        // Check if business phone already exists (for Rachel AI system) - use normalized version
        if (Client) {
            const existingClient = await Client.findOne({ where: { business_phone: normalizedBusinessPhone } });
            if (existingClient) {
                await transaction.rollback();
                return res.status(409).json({
                    error: 'A Rachel AI system already exists with this phone number'
                });
            }
        }

        // Generate OTP (6-digit) instead of user-chosen password
        const otpCode = String(Math.floor(100000 + Math.random() * 900000));
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password || otpCode, saltRounds);
        const useOtp = !password;  // If no password provided, user must change on first login

        // Clean up website_url - convert empty strings to null
        const cleanWebsiteUrl = websiteUrl && websiteUrl.trim() !== '' ? websiteUrl.trim() : null;

        // ==================== SERVER-SIDE PLAN VALIDATION ====================
        // CRITICAL: Use server-side values, not frontend-passed values for security
        const selectedPlan = SUBSCRIPTION_PLANS[plan] ? plan : 'starter';
        const selectedBilling = (billing === 'annual') ? 'annual' : 'monthly';

        // Get server-validated plan details
        const planDetails = SUBSCRIPTION_PLANS[selectedPlan];
        const monthlyTokens = planDetails.tokens;

        // Calculate price (apply annual discount if applicable)
        const monthlyPrice = planDetails.price;
        const actualPrice = selectedBilling === 'annual'
            ? Math.floor(monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT))  // Annual: 15% off
            : monthlyPrice;

        console.log(`📊 Server-validated plan: ${selectedPlan}`);
        console.log(`   - Monthly tokens: ${monthlyTokens}`);
        console.log(`   - Price: $${actualPrice} (${selectedBilling})`);
        console.log(`   - Rollover: ${planDetails.rollover ? 'Yes' : 'No'}`);

        // Create user with checkout_pending status - NO tokens, NO trial yet
        const user = await User.create({
            email,
            password_hash: passwordHash,
            first_name: firstName,
            last_name: lastName,
            business_name: businessName,
            business_phone: normalizedBusinessPhone,
            business_type: businessType,
            website_url: cleanWebsiteUrl,
            phone_number: normalizedPhoneNumber,
            business_description: businessDescription,
            business_hours: businessHours,
            services: services,
            terms_accepted: termsAccepted,
            free_trial_minutes: 0,
            onboarding_completed: false,
            // Subscription fields
            subscription_plan: selectedPlan,
            billing_frequency: selectedBilling,
            subscription_status: 'checkout_pending',  // Waiting for Stripe checkout
            trial_ends_at: null,  // Set after Stripe checkout in complete-setup
            monthly_token_allocation: monthlyTokens,
            tokens_balance: 0,  // Tokens granted after Stripe checkout in complete-setup
            must_change_password: useOtp,
            otp_code: useOtp ? otpCode : null
        }, { transaction });

        console.log('✅ User created successfully:', user.id);
        console.log(`📊 Plan: ${selectedPlan}, Billing: ${selectedBilling}, Monthly Tokens: ${monthlyTokens}`);

        // Commit the user creation transaction
        await transaction.commit();
        console.log('✅ Transaction committed successfully');

        // ==================== STRIPE CHECKOUT SESSION ====================
        const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

        // TESTING MODE: Skip Stripe checkout
        if (process.env.SKIP_STRIPE_CHECKOUT === 'true') {
            console.log(`🧪 TEST MODE: Skipping Stripe checkout for ${selectedPlan} plan`);

            // Mock subscription ID
            await User.update({
                stripe_customer_id: `cus_test_${user.id}`,
                stripe_subscription_id: `sub_test_${user.id}`
            }, { where: { id: user.id }, validate: false });

            return res.status(201).json({
                success: true,
                message: 'Registration successful (test mode). Call /api/auth/complete-setup to finish provisioning.',
                testMode: true,
                userId: user.id
            });
        }

        // Create Stripe Checkout Session for recurring subscription
        // Store all needed data in metadata so complete-setup can retrieve it
        const session = await stripe.checkout.sessions.create({
            customer_email: email,
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `RinglyPro ${planDetails.name} Plan`,
                        description: `${monthlyTokens} tokens/month (${Math.floor(monthlyTokens / 5)} minutes of voice)`,
                        images: ['https://assets.cdn.filesafe.space/3lSeAHXNU9t09Hhp9oai/media/691756ffa6f5eb21b7794f1b.png'],
                    },
                    unit_amount: actualPrice * 100,  // Server-validated price in cents
                    recurring: {
                        interval: selectedBilling === 'annual' ? 'year' : 'month',
                        interval_count: 1
                    }
                },
                quantity: 1
            }],
            mode: 'subscription',

            // No trial — client pays immediately
            subscription_data: {
                metadata: {
                    userId: user.id.toString(),
                    plan: selectedPlan,
                    monthlyTokens: monthlyTokens.toString(),
                    billing: selectedBilling,
                    rollover: planDetails.rollover.toString(),
                    timezone: timezone || 'America/New_York',
                    businessDays: businessDays || 'Mon,Tue,Wed,Thu,Fri'
                }
            },

            // Redirect to completing page after checkout, which calls complete-setup
            success_url: `${webhookBaseUrl}/signup/completing?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${webhookBaseUrl}/signup`,

            metadata: {
                userId: user.id.toString(),
                plan: selectedPlan,
                monthlyTokens: monthlyTokens.toString(),
                billing: selectedBilling,
                referralCode: referralCode || '',
                timezone: timezone || 'America/New_York',
                businessDays: businessDays || 'Mon,Tue,Wed,Thu,Fri'
            }
        });

        console.log(`✅ Stripe checkout session created: ${session.id}`);
        console.log(`💳 Subscription active — client charged immediately`);

        // Update user with Stripe session info (skip validation)
        await User.update({
            stripe_customer_id: session.customer || null
        }, { where: { id: user.id }, validate: false });

        // Return ONLY the Stripe checkout URL - no JWT, no client data
        res.status(201).json({
            success: true,
            stripeCheckoutUrl: session.url
        });

        console.log(`📝 User ${user.id} created, redirecting to Stripe checkout`);

    } catch (error) {
        try { await transaction.rollback(); } catch (e) { /* already committed or rolled back */ }
        console.error('💥 Registration error:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);

        // Check for specific database errors
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                error: 'An account with this email or phone number already exists'
            });
        }

        if (error.name === 'SequelizeValidationError') {
            return res.status(400).json({
                error: 'Validation error: ' + error.errors.map(e => e.message).join(', ')
            });
        }

        res.status(500).json({
            error: 'Registration failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =====================================================
// PHASE 2: COMPLETE-SETUP — After Stripe checkout success
// Provisions Twilio, Client, ElevenLabs, welcome SMS/email
// Called from /signup/completing page with session_id
// =====================================================
router.post('/complete-setup', async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { session_id } = req.body;

        if (!session_id) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                error: 'Stripe session ID is required'
            });
        }

        console.log(`🔄 Complete-setup called with session_id: ${session_id}`);

        // ==================== VERIFY STRIPE SESSION ====================
        let stripeSession;
        try {
            stripeSession = await stripe.checkout.sessions.retrieve(session_id, {
                expand: ['subscription']
            });
        } catch (stripeError) {
            await transaction.rollback();
            console.error('❌ Stripe session retrieval failed:', stripeError.message);
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired checkout session'
            });
        }

        // Verify payment was successful
        if (stripeSession.status !== 'complete') {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                error: 'Checkout session is not complete'
            });
        }

        // Extract metadata
        const userId = parseInt(stripeSession.metadata.userId);
        const selectedPlan = stripeSession.metadata.plan;
        const monthlyTokens = parseInt(stripeSession.metadata.monthlyTokens);
        const selectedBilling = stripeSession.metadata.billing;
        const referralCode = stripeSession.metadata.referralCode || null;
        const metaTimezone = stripeSession.metadata.timezone || 'America/New_York';
        const metaBusinessDays = stripeSession.metadata.businessDays || 'Mon,Tue,Wed,Thu,Fri';

        console.log(`📋 Session verified for user ${userId}, plan: ${selectedPlan}`);

        // ==================== PREVENT DOUBLE-PROVISIONING ====================
        if (Client) {
            const existingClient = await Client.findOne({ where: { user_id: userId } });
            if (existingClient) {
                await transaction.rollback();
                console.log(`⚠️ Client already exists for user ${userId} - double-provisioning prevented`);

                // Still return success with existing data so the UI can proceed
                const user = await User.findByPk(userId);
                const token = jwt.sign(
                    {
                        userId: user.id,
                        email: user.email,
                        businessName: user.business_name,
                        businessType: user.business_type,
                        clientId: existingClient.id
                    },
                    process.env.JWT_SECRET || 'your-super-secret-jwt-key',
                    { expiresIn: '7d' }
                );

                return res.json({
                    success: true,
                    message: 'Account already provisioned',
                    alreadyProvisioned: true,
                    data: {
                        user: {
                            id: user.id,
                            email: user.email,
                            firstName: user.first_name,
                            lastName: user.last_name,
                            businessName: user.business_name,
                            businessType: user.business_type,
                            businessPhone: user.business_phone,
                            phoneNumber: user.phone_number,
                            subscriptionPlan: user.subscription_plan,
                            subscriptionStatus: user.subscription_status,
                            tokensBalance: user.tokens_balance
                        },
                        client: {
                            id: existingClient.id,
                            rachelNumber: existingClient.ringlypro_number,
                            rachelEnabled: existingClient.rachel_enabled
                        },
                        token
                    }
                });
            }
        }

        // ==================== LOAD USER ====================
        const user = await User.findByPk(userId);
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log(`👤 User found: ${user.first_name} ${user.last_name} (${user.email})`);

        // ==================== UPDATE USER: Activate subscription ====================
        await User.update({
            subscription_status: 'active',
            trial_ends_at: null,
            tokens_balance: monthlyTokens,
            stripe_customer_id: stripeSession.customer,
            stripe_subscription_id: stripeSession.subscription?.id || stripeSession.subscription || null
        }, { where: { id: userId }, validate: false, transaction });

        console.log(`✅ User subscription activated: active (no trial)`);
        console.log(`💰 Tokens granted: ${monthlyTokens}`);

        // ==================== TWILIO NUMBER PROVISIONING ====================
        let twilioNumber = null;
        let twilioSid = null;

        try {
            console.log('📞 Provisioning Twilio number...');
            const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

            // Search for available numbers
            const availableNumbers = await twilioClient.availablePhoneNumbers('US')
                .local
                .list({ limit: 1, voiceEnabled: true, smsEnabled: true });

            if (!availableNumbers || availableNumbers.length === 0) {
                throw new Error('No phone numbers available');
            }

            // Purchase the first available number
            const purchasedNumber = await twilioClient.incomingPhoneNumbers.create({
                phoneNumber: availableNumbers[0].phoneNumber,
                voiceUrl: `${webhookBaseUrl}/voice/rachel/`,
                voiceMethod: 'POST',
                statusCallback: `${webhookBaseUrl}/voice/webhook/call-status`,
                statusCallbackMethod: 'POST',
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
                smsUrl: `${webhookBaseUrl}/api/messages/incoming`,
                smsMethod: 'POST',
                friendlyName: `RinglyPro - ${user.business_name}`
            });

            twilioNumber = purchasedNumber.phoneNumber;
            twilioSid = purchasedNumber.sid;

            console.log(`✅ Twilio number provisioned: ${twilioNumber} (SID: ${twilioSid})`);

        } catch (twilioError) {
            console.error('❌ Twilio provisioning error:', twilioError.message);
            await transaction.rollback();
            return res.status(500).json({
                success: false,
                error: 'Failed to provision phone number. Please try again or contact support.',
                details: process.env.NODE_ENV === 'development' ? twilioError.message : undefined
            });
        }

        // ==================== REFERRAL SYSTEM ====================
        let newClientReferralCode = null;
        let referrerId = null;

        if (generateUniqueReferralCode) {
            try {
                newClientReferralCode = await generateUniqueReferralCode();
                console.log(`🎁 Generated referral code for new client: ${newClientReferralCode}`);
            } catch (referralError) {
                console.error('⚠️ Failed to generate referral code:', referralError.message);
            }
        }

        if (referralCode && getClientByReferralCode) {
            try {
                const referrer = await getClientByReferralCode(referralCode);
                if (referrer) {
                    referrerId = referrer.id;
                    console.log(`🎁 Referral detected! Referred by client ${referrerId} (${referrer.business_name})`);
                } else {
                    console.log(`⚠️ Invalid referral code: ${referralCode}`);
                }
            } catch (referralError) {
                console.error('⚠️ Error looking up referrer:', referralError.message);
            }
        }

        // ==================== CREATE CLIENT RECORD ====================
        if (!Client) {
            await transaction.rollback();
            return res.status(500).json({
                success: false,
                error: 'System configuration error. Please contact support.',
                details: process.env.NODE_ENV === 'development' ? 'Client model not loaded' : undefined
            });
        }

        console.log('🏢 Creating client record...');

        let client = null;
        try {
            client = await Client.create({
                business_name: user.business_name,
                business_phone: user.business_phone,
                ringlypro_number: twilioNumber,
                twilio_number_sid: twilioSid,
                forwarding_status: 'active',
                owner_name: `${user.first_name} ${user.last_name}`,
                owner_phone: user.phone_number || user.business_phone,
                owner_email: user.email,
                custom_greeting: `Hello! Thank you for calling ${user.business_name}. I'm Rachel, your AI assistant.`,
                business_hours_start: user.business_hours?.open ? user.business_hours.open + ':00' : '09:00:00',
                business_hours_end: user.business_hours?.close ? user.business_hours.close + ':00' : '17:00:00',
                business_days: metaBusinessDays,
                timezone: metaTimezone,
                appointment_duration: 30,
                booking_enabled: true,
                sms_notifications: true,
                monthly_free_minutes: 100,
                per_minute_rate: 0.10,
                rachel_enabled: true,  // Enabled by default — Rachel answers calls immediately after signup
                referral_code: newClientReferralCode,
                referred_by: referrerId,
                active: true,
                user_id: user.id  // CRITICAL: Links client to user
            }, { transaction });

            console.log('✅ Client record created for Rachel AI:', client.id);
            console.log(`📞 Rachel AI number configured: ${twilioNumber}`);

        } catch (clientError) {
            console.error('❌ Client creation error:', clientError);
            await transaction.rollback();
            return res.status(500).json({
                success: false,
                error: 'Failed to create client account. Please try again or contact support.',
                details: process.env.NODE_ENV === 'development' ? clientError.message : undefined
            });
        }

        if (!client || !client.id) {
            console.error('❌ Client creation returned null or no ID');
            await transaction.rollback();
            return res.status(500).json({
                success: false,
                error: 'Failed to create client account. Please try again or contact support.'
            });
        }

        // ==================== CREATE CREDIT ACCOUNT ====================
        try {
            if (CreditAccount) {
                await CreditAccount.create({
                    client_id: client.id,
                    balance: 0.00,
                    free_minutes_used: 0
                }, { transaction });
                console.log('✅ Credit account created');
            }
        } catch (creditError) {
            console.error('⚠️ Credit account creation error (non-fatal):', creditError);
        }

        // Commit transaction
        await transaction.commit();
        console.log('✅ Transaction committed successfully');

        // ==================== ELEVENLABS VOICE AGENT PROVISIONING (non-blocking) ====================
        let elevenlabsProvisioned = false;

        if (process.env.SKIP_ELEVENLABS_PROVISIONING !== 'true') {
            try {
                const elevenLabsProvisioning = require('../services/elevenLabsProvisioningService');
                console.log('🤖 Provisioning ElevenLabs voice agent...');

                const cleanWebsiteUrl = user.website_url;
                const elResult = await elevenLabsProvisioning.provisionAgent(
                    {
                        businessName: user.business_name,
                        businessType: user.business_type,
                        websiteUrl: cleanWebsiteUrl,
                        businessDescription: user.business_description,
                        businessHours: user.business_hours,
                        services: user.services,
                        ownerPhone: user.phone_number || user.business_phone,
                        timezone: metaTimezone,
                        businessDays: metaBusinessDays,
                        language: 'en'
                    },
                    twilioNumber,
                    twilioSid,
                    client.id
                );

                if (elResult.success) {
                    await sequelize.query(
                        `UPDATE clients SET elevenlabs_agent_id = :agentId, elevenlabs_phone_number_id = :phoneNumberId WHERE id = :clientId`,
                        {
                            replacements: {
                                agentId: elResult.agentId,
                                phoneNumberId: elResult.phoneNumberId,
                                clientId: client.id
                            }
                        }
                    );
                    elevenlabsProvisioned = true;
                    console.log(`✅ ElevenLabs voice agent provisioned: agent=${elResult.agentId}, phone=${elResult.phoneNumberId}`);
                } else {
                    console.error(`⚠️ ElevenLabs provisioning failed (non-critical): ${elResult.error}`);
                }
            } catch (elError) {
                console.error('⚠️ ElevenLabs provisioning error (non-critical):', elError.message);
            }
        } else {
            console.log('🧪 TEST MODE: Skipping ElevenLabs provisioning');
        }

        // ==================== PROCESS REFERRAL TRACKING (non-blocking) ====================
        if (referralCode) {
            try {
                const referralService = require('../services/referralService');
                const referralResult = await referralService.recordReferralSignup(
                    user.id,
                    referralCode,
                    {
                        signupIp: req.ip,
                        source: 'registration_form'
                    }
                );

                if (referralResult.success) {
                    console.log(`✅ Referral recorded: ${referralResult.tokensEarned} tokens credited to referrer`);
                } else {
                    console.log(`⚠️ Referral tracking skipped: ${referralResult.message}`);
                }
            } catch (referralError) {
                console.error('⚠️ Referral tracking error (non-critical):', referralError.message);
            }
        }

        // ==================== SEND WELCOME SMS (non-blocking) ====================
        try {
            const smsResult = await sendWelcomeSMS({
                ownerPhone: user.phone_number || user.business_phone,
                ownerName: `${user.first_name} ${user.last_name}`,
                businessName: user.business_name,
                ringlyproNumber: twilioNumber,
                dashboardUrl: process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com',
                userEmail: user.email,
                otpCode: user.otp_code
            });

            if (smsResult.success) {
                console.log(`✅ Welcome SMS sent to ${user.phone_number || user.business_phone}`);
            } else {
                console.log(`⚠️ Welcome SMS failed (non-critical): ${smsResult.error}`);
            }
        } catch (smsError) {
            console.error('⚠️ Welcome SMS error (non-critical):', smsError.message);
        }

        // ==================== SEND WELCOME EMAIL (non-blocking) ====================
        try {
            const emailResult = await sendWelcomeEmail({
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                businessName: user.business_name,
                ringlyproNumber: twilioNumber,
                ccEmail: 'mstagg@digit2ai.com'
            });

            if (emailResult.success) {
                console.log(`✅ Welcome email sent to ${user.email} (CC: mstagg@digit2ai.com)`);
            } else {
                console.log(`⚠️ Welcome email failed (non-critical): ${emailResult.error || emailResult.reason}`);
            }
        } catch (emailError) {
            console.error('⚠️ Welcome email error (non-critical):', emailError.message);
        }

        // ==================== GENERATE JWT TOKEN ====================
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                businessName: user.business_name,
                businessType: user.business_type,
                clientId: client.id
            },
            process.env.JWT_SECRET || 'your-super-secret-jwt-key',
            { expiresIn: '7d' }
        );

        // ==================== RETURN SETUP DATA ====================
        res.json({
            success: true,
            message: 'Account setup complete! Welcome to RinglyPro!',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    businessName: user.business_name,
                    businessType: user.business_type,
                    businessPhone: user.business_phone,
                    phoneNumber: user.phone_number,
                    websiteUrl: user.website_url,
                    freeTrialMinutes: 0,
                    onboardingCompleted: user.onboarding_completed,
                    subscriptionPlan: selectedPlan,
                    subscriptionStatus: 'active',
                    tokensBalance: monthlyTokens,
                    trialEndsAt: null
                },
                client: {
                    id: client.id,
                    rachelNumber: twilioNumber,
                    rachelEnabled: client.rachel_enabled,
                    twilioSid: twilioSid,
                    elevenlabsProvisioned: elevenlabsProvisioned
                },
                token,
                nextSteps: {
                    dashboard: '/dashboard',
                    setupPhone: '/setup/phone',
                    testAI: '/test-assistant',
                    forwardingInstructions: `Forward your calls to ${twilioNumber} to activate Rachel AI`
                }
            }
        });

        console.log(`🎉 Setup complete for: ${user.first_name} ${user.last_name} (${user.business_name}) - ${user.email}`);
        console.log(`📞 Rachel AI Twilio number: ${twilioNumber}`);
        console.log(`🤖 ElevenLabs provisioned: ${elevenlabsProvisioned ? 'YES' : 'NO'}`);
        console.log(`👤 User ID: ${user.id}, Client ID: ${client.id}`);

    } catch (error) {
        try { await transaction.rollback(); } catch (e) { /* already committed or rolled back */ }
        console.error('💥 Complete-setup error:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);

        res.status(500).json({
            success: false,
            error: 'Account setup failed. Please try again or contact support.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// POST /api/auth/login - User login with enhanced debugging and business data
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log(`🔍 Login attempt for: ${email}`);

        if (!email || !password) {
            console.log('❌ Missing email or password');
            return res.status(400).json({
                error: 'Email and password are required'
            });
        }

        // Find user
        console.log(`🔎 Searching for user: ${email}`);
        const user = await User.findOne({ where: { email } });

        if (!user) {
            console.log('❌ User not found in database');
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        console.log(`✅ User found: ${user.first_name} ${user.last_name} (ID: ${user.id})`);
        console.log(`🏢 Business: ${user.business_name} (${user.business_type})`);
        console.log(`🔑 Stored password hash length: ${user.password_hash.length}`);

        // Check password
        console.log('🔐 Comparing passwords...');
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        console.log(`🎯 Password comparison result: ${isValidPassword}`);

        if (!isValidPassword) {
            console.log('❌ Password comparison failed');
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        console.log('✅ Password validated successfully');

        // Check if user must change password (OTP first login)
        if (user.must_change_password) {
            console.log('🔒 User must change password — issuing short-lived token');
            const changeToken = jwt.sign(
                { userId: user.id, email: user.email, purpose: 'change_password' },
                process.env.JWT_SECRET || 'your-super-secret-jwt-key',
                { expiresIn: '15m' }
            );
            return res.json({
                success: true,
                mustChangePassword: true,
                token: changeToken,
                data: { redirectTo: '/change-password' }
            });
        }

        // Find associated client record
        let client = null;
        let clientProductType = 'voice_ai';
        if (Client) {
            client = await Client.findOne({ where: { user_id: user.id } });
            if (client) {
                console.log(`📞 Client found: ${client.ringlypro_number} (Client ID: ${client.id})`);
                // Fetch product_type via raw query (not in Sequelize model)
                try {
                    const [ptRows] = await sequelize.query(
                        'SELECT product_type FROM clients WHERE id = :clientId',
                        { replacements: { clientId: client.id } }
                    );
                    if (ptRows && ptRows.length > 0 && ptRows[0].product_type) {
                        clientProductType = ptRows[0].product_type;
                    }
                } catch (ptErr) {
                    console.log('⚠️ Could not fetch product_type:', ptErr.message);
                }
                console.log(`📦 Product type: ${clientProductType}`);
            } else {
                console.log('⚠️ No client record found for user - this should not happen after registration');
            }
        }

        // Generate JWT token with business context
        console.log('🎫 Generating JWT token...');
        const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
        console.log(`🔐 JWT Secret length: ${jwtSecret.length}`);

        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                businessName: user.business_name,
                businessType: user.business_type,
                clientId: client ? client.id : null
            },
            jwtSecret,
            { expiresIn: '7d' }
        );

        console.log(`✅ JWT token generated: ${token.substring(0, 20)}...`);

        const response = {
            success: true,
            message: 'Login successful',
            token: token,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    businessName: user.business_name,
                    businessType: user.business_type,
                    businessPhone: user.business_phone,
                    phoneNumber: user.phone_number,
                    websiteUrl: user.website_url,
                    freeTrialMinutes: user.free_trial_minutes,
                    onboardingCompleted: user.onboarding_completed
                },
                client: client ? {
                    id: client.id,
                    rachelNumber: client.ringlypro_number,
                    rachelEnabled: client.rachel_enabled,
                    productType: clientProductType
                } : null,
                redirectTo: (client && clientProductType === 'web_call_center')
                    ? '/webcallcenter/'
                    : '/'
            }
        };

        console.log('📤 Sending successful login response');
        res.json(response);

    } catch (error) {
        console.error('💥 Login error details:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            error: 'Login failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =====================================================
// CHANGE PASSWORD — Force OTP users to set a real password
// =====================================================
router.post('/change-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        // Verify the change-password token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
        } catch (err) {
            return res.status(401).json({ error: 'Token expired or invalid. Please log in again.' });
        }

        if (decoded.purpose !== 'change_password') {
            return res.status(401).json({ error: 'Invalid token type' });
        }

        const user = await User.findByPk(decoded.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Hash new password and clear OTP flags
        const passwordHash = await bcrypt.hash(newPassword, 12);
        await User.update({
            password_hash: passwordHash,
            must_change_password: false,
            otp_code: null
        }, { where: { id: user.id }, validate: false });

        console.log(`✅ Password changed for user ${user.id} (${user.email})`);

        // Find associated client
        let client = null;
        if (Client) {
            client = await Client.findOne({ where: { user_id: user.id } });
        }

        // Issue a full session JWT
        const sessionToken = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                businessName: user.business_name,
                businessType: user.business_type,
                clientId: client ? client.id : null
            },
            process.env.JWT_SECRET || 'your-super-secret-jwt-key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Password changed successfully',
            token: sessionToken,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    businessName: user.business_name,
                    businessType: user.business_type,
                    businessPhone: user.business_phone,
                    phoneNumber: user.phone_number,
                    freeTrialMinutes: user.free_trial_minutes,
                    onboardingCompleted: user.onboarding_completed
                },
                client: client ? {
                    id: client.id,
                    rachelNumber: client.ringlypro_number,
                    rachelEnabled: client.rachel_enabled
                } : null,
                redirectTo: '/'
            }
        });

    } catch (error) {
        console.error('💥 Change password error:', error);
        res.status(500).json({
            error: 'Failed to change password. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// POST /api/auth/admin-impersonate - Admin login to access any client's dashboard
// This allows administrators to access client dashboards for support purposes
router.post('/admin-impersonate', async (req, res) => {
    try {
        const { adminEmail, adminPassword, clientId } = req.body;

        console.log(`🔐 Admin impersonation attempt: ${adminEmail} -> Client ${clientId}`);

        if (!adminEmail || !adminPassword || !clientId) {
            return res.status(400).json({
                error: 'Admin email, password, and client ID are required'
            });
        }

        // Find admin user
        const admin = await User.findOne({ where: { email: adminEmail } });

        if (!admin) {
            console.log('❌ Admin user not found');
            return res.status(401).json({
                error: 'Invalid admin credentials'
            });
        }

        // Verify admin flag (Sequelize model uses isAdmin, maps to is_admin in DB)
        if (!admin.isAdmin) {
            console.log(`❌ User ${adminEmail} is not an admin`);
            return res.status(403).json({
                error: 'Access denied. Admin privileges required.'
            });
        }

        // Check admin password
        const isValidPassword = await bcrypt.compare(adminPassword, admin.password_hash);

        if (!isValidPassword) {
            console.log('❌ Admin password validation failed');
            return res.status(401).json({
                error: 'Invalid admin credentials'
            });
        }

        console.log(`✅ Admin ${adminEmail} authenticated successfully`);

        // Find target client
        const client = await Client.findOne({ where: { id: parseInt(clientId) } });

        if (!client) {
            return res.status(404).json({
                error: `Client ID ${clientId} not found`
            });
        }

        // Find user associated with client
        let clientUser = null;
        if (client.user_id) {
            clientUser = await User.findByPk(client.user_id);
        }

        console.log(`📋 Impersonating Client: ${client.business_name} (ID: ${client.id})`);

        // Generate JWT token for admin impersonation
        const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

        const token = jwt.sign(
            {
                userId: clientUser ? clientUser.id : admin.id,
                email: clientUser ? clientUser.email : admin.email,
                businessName: client.business_name,
                businessType: clientUser?.business_type || 'business',
                clientId: client.id,
                // Flag to indicate this is an admin impersonation session
                isAdminImpersonation: true,
                adminUserId: admin.id,
                adminEmail: admin.email
            },
            jwtSecret,
            { expiresIn: '4h' }  // Shorter expiry for impersonation sessions
        );

        console.log(`🎫 Impersonation token generated for Client ${clientId}`);
        console.log(`📝 AUDIT: Admin ${admin.email} (ID: ${admin.id}) impersonated Client ${client.business_name} (ID: ${client.id}) at ${new Date().toISOString()}`);

        res.json({
            success: true,
            message: `Admin impersonation successful for ${client.business_name}`,
            token: token,
            data: {
                impersonation: true,
                admin: {
                    id: admin.id,
                    email: admin.email,
                    name: `${admin.first_name} ${admin.last_name}`
                },
                user: clientUser ? {
                    id: clientUser.id,
                    email: clientUser.email,
                    firstName: clientUser.first_name,
                    lastName: clientUser.last_name,
                    businessName: clientUser.business_name,
                    businessType: clientUser.business_type
                } : null,
                client: {
                    id: client.id,
                    businessName: client.business_name,
                    rachelNumber: client.ringlypro_number,
                    rachelEnabled: client.rachel_enabled,
                    depositRequired: client.deposit_required,
                    depositAmount: client.deposit_amount
                },
                redirectTo: '/'  // Dashboard is at root
            }
        });

    } catch (error) {
        console.error('💥 Admin impersonation error:', error);
        res.status(500).json({
            error: 'Impersonation failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/auth/profile - Get current user profile
router.get('/profile', async (req, res) => {
    try {
        // This would need JWT middleware to extract userId from token
        // For now, just return a placeholder
        res.json({
            success: true,
            message: 'Profile endpoint ready - JWT middleware needed'
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            error: 'Failed to get profile'
        });
    }
});

// POST /api/auth/update-profile - Update user business information
router.post('/update-profile', async (req, res) => {
    try {
        // This would need JWT middleware to get current user
        // Placeholder for profile update functionality
        res.json({
            success: true,
            message: 'Profile update endpoint ready - JWT middleware needed'
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({
            error: 'Failed to update profile'
        });
    }
});

// POST /api/auth/forgot-password - Request password reset with instant link display
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        // Find user by email
        const user = await User.findOne({ where: { email } });

        // Don't reveal if user exists for security
        if (!user) {
            console.log(`Password reset requested for non-existent email: ${email}`);
            return res.json({
                success: false,
                error: 'No account found with this email address'
            });
        }

        // Generate reset token (valid for 1 hour)
        const resetToken = jwt.sign(
            { userId: user.id, email: user.email, type: 'password_reset' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Store reset token in user record
        await user.update({
            email_verification_token: resetToken
        });

        console.log(`✅ Password reset token generated for: ${user.email}`);

        // Generate reset link and return it directly
        const resetLink = `${process.env.APP_URL || 'https://aiagent.ringlypro.com'}/reset-password?token=${resetToken}`;

        res.json({
            success: true,
            message: 'Password reset link generated successfully',
            resetLink: resetLink,
            expiresIn: '1 hour'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process password reset request'
        });
    }
});

// GET /api/auth/verify-reset-token/:token - Verify if reset token is valid
router.get('/verify-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                valid: false,
                error: 'No token provided'
            });
        }

        // Verify JWT token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (decoded.type !== 'password_reset') {
                throw new Error('Invalid token type');
            }
        } catch (err) {
            return res.json({
                valid: false,
                error: 'Token is invalid or has expired'
            });
        }

        // Check if user exists and token matches
        const user = await User.findOne({
            where: {
                id: decoded.userId,
                email: decoded.email,
                email_verification_token: token
            }
        });

        if (!user) {
            return res.json({
                valid: false,
                error: 'Reset token not found or already used'
            });
        }

        // Token is valid
        res.json({
            valid: true,
            email: user.email
        });

    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({
            valid: false,
            error: 'Failed to verify token'
        });
    }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Token and new password are required'
            });
        }

        // Validate password strength
        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters long'
            });
        }

        // Verify reset token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (decoded.type !== 'password_reset') {
                throw new Error('Invalid token type');
            }
        } catch (err) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired reset token'
            });
        }

        // Find user
        const user = await User.findOne({
            where: {
                id: decoded.userId,
                email: decoded.email,
                email_verification_token: token // Verify token matches
            }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'Invalid reset token or user not found'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear reset token
        await user.update({
            password_hash: hashedPassword,
            email_verification_token: null // Clear the token
        });

        console.log(`✅ Password reset successful for: ${user.email}`);

        res.json({
            success: true,
            message: 'Password has been reset successfully. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset password'
        });
    }
});

module.exports = router;
