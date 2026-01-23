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
    free: {
        name: 'Free',
        price: 0,
        tokens: 100,
        rollover: false,
        description: 'Perfect for testing'
    },
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

// POST /api/auth/register - Enhanced User registration with Twilio auto-provisioning
router.post('/register', async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const {
            email,
            password,
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
            // Subscription plan parameters from pricing table
            plan,          // 'free', 'starter', 'growth', 'professional', 'enterprise'
            amount,        // Total amount (monthly or annual)
            tokens,        // Total tokens (monthly allocation or annual total)
            billing        // 'monthly' or 'annual'
        } = req.body;
        
        console.log('📝 Registration attempt:', { email, firstName, lastName, businessName, businessType, businessPhone, plan, billing });
        
        // FIXED BUG #3: Validate Client model is available before proceeding
        if (!Client) {
            await transaction.rollback();
            return res.status(500).json({ 
                error: 'System configuration error. Please contact support.',
                details: process.env.NODE_ENV === 'development' ? 'Client model not loaded' : undefined
            });
        }
        
        // Validate required fields
        if (!email || !password || !firstName || !lastName) {
            await transaction.rollback();
            return res.status(400).json({ 
                error: 'Email, password, first name, and last name are required' 
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
        const existingClient = await Client.findOne({ where: { business_phone: normalizedBusinessPhone } });
        if (existingClient) {
            await transaction.rollback();
            return res.status(409).json({
                error: 'A Rachel AI system already exists with this phone number'
            });
        }
        
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Clean up website_url - convert empty strings to null
        const cleanWebsiteUrl = websiteUrl && websiteUrl.trim() !== '' ? websiteUrl.trim() : null;

        // ==================== SERVER-SIDE PLAN VALIDATION ====================
        // CRITICAL: Use server-side values, not frontend-passed values for security
        const selectedPlan = SUBSCRIPTION_PLANS[plan] ? plan : 'free';
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

        // Create user with all business fields - use normalized phone numbers
        // Note: Paid plans get 'pending' status until Stripe payment completes
        // Free plan gets tokens immediately, paid plans get tokens after first payment
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
            free_trial_minutes: 100,
            onboarding_completed: false,
            // Subscription fields
            subscription_plan: selectedPlan,
            billing_frequency: selectedBilling,
            subscription_status: selectedPlan === 'free' ? 'active' : 'pending',
            trial_ends_at: null,  // No trial - free plan is the trial
            monthly_token_allocation: monthlyTokens,
            tokens_balance: selectedPlan === 'free' ? monthlyTokens : 0  // Free plan gets tokens, paid plans get tokens after payment
        }, { transaction });

        console.log('✅ User created successfully:', user.id);
        console.log(`📊 Plan: ${selectedPlan}, Billing: ${selectedBilling}, Monthly Tokens: ${monthlyTokens}`);
        
        // ==================== TWILIO NUMBER PROVISIONING ====================
        console.log('📞 Provisioning Twilio number for new client...');

        let twilioNumber, twilioSid;

        // TESTING MODE: Skip Twilio provisioning
        if (process.env.SKIP_TWILIO_PROVISIONING === 'true') {
            twilioNumber = `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
            twilioSid = `PN${Math.random().toString(36).substring(2, 15)}`;
            console.log(`🧪 TEST MODE: Using mock Twilio number: ${twilioNumber}`);
        } else {

        try {
            // Search for available US phone numbers
            const availableNumbers = await twilioClient.availablePhoneNumbers('US')
                .local
                .list({
                    limit: 1,
                    voiceEnabled: true,
                    smsEnabled: true
                });

            if (!availableNumbers || availableNumbers.length === 0) {
                throw new Error('No Twilio numbers available');
            }

            console.log(`🔍 Found available number: ${availableNumbers[0].phoneNumber}`);

            // Purchase the number
            const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

            const purchasedNumber = await twilioClient.incomingPhoneNumbers
                .create({
                    phoneNumber: availableNumbers[0].phoneNumber,
                    voiceUrl: `${webhookBaseUrl}/voice/rachel/`,
                    voiceMethod: 'POST',
                    statusCallback: `${webhookBaseUrl}/voice/webhook/call-status`,
                    statusCallbackMethod: 'POST',
                    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
                    smsUrl: `${webhookBaseUrl}/api/messages/incoming`,
                    smsMethod: 'POST',
                    friendlyName: `RinglyPro - ${businessName}`
                });

            console.log(`✅ Configured webhooks for ${businessName}:`);
            console.log(`   Voice: ${webhookBaseUrl}/voice/rachel/`);
            console.log(`   Status: ${webhookBaseUrl}/voice/webhook/call-status`);
            console.log(`   SMS: ${webhookBaseUrl}/api/messages/incoming`);

            twilioNumber = purchasedNumber.phoneNumber;
            twilioSid = purchasedNumber.sid;
            
            console.log(`✅ Provisioned Twilio number: ${twilioNumber} (${twilioSid})`);
            
        } catch (twilioError) {
            console.error('❌ Twilio provisioning error:', twilioError);
            await transaction.rollback();
            return res.status(500).json({
                success: false,
                error: 'Failed to provision phone number. Please try again or contact support.',
                details: process.env.NODE_ENV === 'development' ? twilioError.message : undefined
            });
        }
        } // End skip Twilio check
        
        // ==================== REFERRAL SYSTEM ====================
        // Generate unique referral code for new client
        let newClientReferralCode = null;
        let referrerId = null;

        // Only try referral system if utilities are available
        if (generateUniqueReferralCode) {
            try {
                newClientReferralCode = await generateUniqueReferralCode();
                console.log(`🎁 Generated referral code for new client: ${newClientReferralCode}`);
            } catch (referralError) {
                console.error('⚠️ Failed to generate referral code:', referralError.message);
                // Non-fatal: Continue without referral code
            }
        }

        // Look up referrer if referral code provided AND utility is available
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
                // Non-fatal: Continue without referrer tracking
            }
        }

        // ==================== CREATE CLIENT RECORD ====================
        // FIXED BUG #3: Better error handling and validation
        console.log('🏢 Creating client record...');

        let client = null;
        try {
            client = await Client.create({
                business_name: businessName,
                business_phone: normalizedBusinessPhone,
                ringlypro_number: twilioNumber,              // Twilio number (already normalized from Twilio)
                twilio_number_sid: twilioSid,                // Twilio SID
                forwarding_status: 'active',                  // Active status
                owner_name: `${firstName} ${lastName}`,
                owner_phone: normalizedPhoneNumber || normalizedBusinessPhone,
                owner_email: email,
                custom_greeting: `Hello! Thank you for calling ${businessName}. I'm Rachel, your AI assistant.`,
                business_hours_start: businessHours?.open ? businessHours.open + ':00' : '09:00:00',
                business_hours_end: businessHours?.close ? businessHours.close + ':00' : '17:00:00',
                business_days: 'Mon-Fri',
                timezone: 'America/New_York',
                appointment_duration: 30,
                booking_enabled: true,
                sms_notifications: true,
                monthly_free_minutes: 100,
                per_minute_rate: 0.10,
                rachel_enabled: false,  // Client must toggle ON to activate Rachel AI
                referral_code: newClientReferralCode,  // Unique code for this client to share
                referred_by: referrerId,  // ID of client who referred this signup
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
        
        // FIXED BUG #3: Validate client was actually created
        if (!client || !client.id) {
            console.error('❌ Client creation returned null or no ID');
            await transaction.rollback();
            return res.status(500).json({
                success: false,
                error: 'Failed to create client account. Please try again or contact support.'
            });
        }
        
        // Create credit account
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
            // Don't rollback for credit account errors - it's not critical
        }
        
        // FIXED BUG #3: Commit transaction only after everything succeeds
        await transaction.commit();
        console.log('✅ Transaction committed successfully');

        // ==================== STRIPE SUBSCRIPTION CREATION ====================
        // Create Stripe subscription for paid plans (non-blocking for free tier)
        let stripeSessionUrl = null;

        if (selectedPlan !== 'free' && actualPrice > 0) {
            try {
                console.log('💳 Creating Stripe subscription (immediate payment)...');
                console.log(`   Plan: ${planDetails.name}, Price: $${actualPrice}/${selectedBilling}`);

                const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
                const ghlBookingUrl = 'https://api.leadconnectorhq.com/widget/booking/nhKuDsn2At5csiDYc4d0';

                // TESTING MODE: Skip Stripe checkout
                if (process.env.SKIP_STRIPE_CHECKOUT === 'true') {
                    console.log(`🧪 TEST MODE: Skipping Stripe checkout for ${selectedPlan} plan`);
                    console.log(`🧪 TEST MODE: User would be charged $${actualPrice}/${selectedBilling}`);
                    console.log(`🧪 TEST MODE: User receives ${monthlyTokens} tokens immediately`);

                    // Mock subscription ID
                    await User.update({
                        stripe_customer_id: `cus_test_${user.id}`,
                        stripe_subscription_id: `sub_test_${user.id}`
                    }, { where: { id: user.id } });

                    // Don't set stripeSessionUrl, so user goes directly to dashboard
                    stripeSessionUrl = null;
                } else {

                // Create Stripe Checkout Session for recurring subscription
                // IMPORTANT: Uses server-validated price, not frontend-passed amount
                const session = await stripe.checkout.sessions.create({
                    customer_email: email,
                    payment_method_types: ['card'],
                    line_items: [{
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: `RinglyPro ${planDetails.name} Plan`,
                                description: `${monthlyTokens} tokens/month (${Math.floor(monthlyTokens / 5)} minutes of voice)`,
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

                    // NO TRIAL - Free plan is the trial
                    subscription_data: {
                        metadata: {
                            userId: user.id.toString(),
                            plan: selectedPlan,
                            monthlyTokens: monthlyTokens.toString(),
                            billing: selectedBilling,
                            clientId: client.id.toString(),
                            rollover: planDetails.rollover.toString()
                        }
                    },

                    success_url: ghlBookingUrl,  // Redirect to GHL booking after payment
                    cancel_url: `${webhookBaseUrl}/pricing`,

                    metadata: {
                        userId: user.id.toString(),
                        plan: selectedPlan,
                        monthlyTokens: monthlyTokens.toString(),
                        billing: selectedBilling,
                        clientId: client.id.toString()
                    }
                });

                // Update user with Stripe session info (non-transactional)
                await User.update({
                    stripe_customer_id: session.customer || null
                }, { where: { id: user.id } });

                stripeSessionUrl = session.url;
                console.log(`✅ Stripe checkout session created: ${session.id}`);
                console.log(`💳 User will be charged immediately upon checkout`);
                } // End skip Stripe check

            } catch (stripeError) {
                console.error('⚠️ Stripe subscription creation error (non-critical):', stripeError.message);
                // Don't fail registration if Stripe fails - user account is already created
                // They can subscribe later from the dashboard
            }
        }

        // Process referral if referral code provided (non-blocking)
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
                // Don't fail registration if referral tracking fails
            }
        }

        // Send welcome SMS with Rachel activation instructions (non-blocking)
        try {
            const smsResult = await sendWelcomeSMS({
                ownerPhone: normalizedPhoneNumber || normalizedBusinessPhone,
                ownerName: `${firstName} ${lastName}`,
                businessName: businessName,
                ringlyproNumber: twilioNumber,
                dashboardUrl: process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com'
            });

            if (smsResult.success) {
                console.log(`✅ Welcome SMS sent to ${normalizedPhoneNumber || normalizedBusinessPhone}`);
            } else {
                console.log(`⚠️ Welcome SMS failed (non-critical): ${smsResult.error}`);
            }
        } catch (smsError) {
            console.error('⚠️ Welcome SMS error (non-critical):', smsError.message);
            // Don't fail registration if SMS fails
        }

        // Send welcome email with instructions and CC to admin (non-blocking)
        try {
            const emailResult = await sendWelcomeEmail({
                email: email,
                firstName: firstName,
                lastName: lastName,
                businessName: businessName,
                ringlyproNumber: twilioNumber,
                ccEmail: 'mstagg@digit2ai.com'
            });

            if (emailResult.success) {
                console.log(`✅ Welcome email sent to ${email} (CC: mstagg@digit2ai.com)`);
            } else {
                console.log(`⚠️ Welcome email failed (non-critical): ${emailResult.error || emailResult.reason}`);
            }
        } catch (emailError) {
            console.error('⚠️ Welcome email error (non-critical):', emailError.message);
            // Don't fail registration if email fails
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                email: user.email,
                businessName: user.business_name,
                businessType: user.business_type,
                clientId: client.id  // Always has valid client.id now
            },
            process.env.JWT_SECRET || 'your-super-secret-jwt-key',
            { expiresIn: '7d' }
        );
        
        // Send welcome response
        const responseData = {
            success: true,
            message: 'Registration successful! Welcome to RinglyPro!',
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
                    onboardingCompleted: user.onboarding_completed,
                    subscriptionPlan: selectedPlan,
                    subscriptionStatus: selectedPlan === 'free' ? 'active' : 'pending',
                    tokensBalance: selectedPlan === 'free' ? monthlyTokens : 0
                },
                client: {
                    id: client.id,
                    rachelNumber: twilioNumber,
                    rachelEnabled: client.rachel_enabled,
                    twilioSid: twilioSid
                },
                token,
                nextSteps: {
                    dashboard: '/dashboard',
                    setupPhone: '/setup/phone',
                    testAI: '/test-assistant',
                    forwardingInstructions: `Forward your calls to ${twilioNumber} to activate Rachel AI`
                }
            }
        };

        // Add Stripe redirect URL if subscription was created
        if (stripeSessionUrl) {
            responseData.stripeCheckoutUrl = stripeSessionUrl;
            responseData.message = 'Registration successful! Redirecting to payment...';
        }

        res.status(201).json(responseData);
        
        console.log(`🎉 New user registered: ${firstName} ${lastName} (${businessName}) - ${email}`);
        console.log(`📞 Rachel AI Twilio number: ${twilioNumber}`);
        console.log(`👤 User ID: ${user.id}, Client ID: ${client.id}`);
        
    } catch (error) {
        await transaction.rollback();
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
        
        // Find associated client record for Rachel AI
        let client = null;
        if (Client) {
            client = await Client.findOne({ where: { user_id: user.id } });
            if (client) {
                console.log(`📞 Rachel AI found: ${client.ringlypro_number} (Client ID: ${client.id})`);
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
                    rachelEnabled: client.rachel_enabled
                } : null,
                redirectTo: user.onboarding_completed ? '/dashboard' : '/onboarding'
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