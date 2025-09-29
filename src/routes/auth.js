const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const { User, sequelize } = require('../models');
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
            termsAccepted
        } = req.body;
        
        console.log('📝 Registration attempt:', { email, firstName, lastName, businessName, businessType, businessPhone });
        
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
        
        // Check if business phone already exists (for Rachel AI system)
        if (Client) {
            const existingClient = await Client.findOne({ where: { business_phone: businessPhone } });
            if (existingClient) {
                await transaction.rollback();
                return res.status(409).json({ 
                    error: 'A Rachel AI system already exists with this phone number' 
                });
            }
        }
        
        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Clean up website_url - convert empty strings to null
        const cleanWebsiteUrl = websiteUrl && websiteUrl.trim() !== '' ? websiteUrl.trim() : null;
        
        // Create user with all business fields
        const user = await User.create({
            email,
            password_hash: passwordHash,
            first_name: firstName,
            last_name: lastName,
            business_name: businessName,
            business_phone: businessPhone,
            business_type: businessType,
            website_url: cleanWebsiteUrl,
            phone_number: phoneNumber,
            business_description: businessDescription,
            business_hours: businessHours,
            services: services,
            terms_accepted: termsAccepted,
            free_trial_minutes: 100,
            onboarding_completed: false
        }, { transaction });
        
        console.log('✅ User created successfully:', user.id);
        
        // ==================== TWILIO NUMBER PROVISIONING ====================
        console.log('📞 Provisioning Twilio number for new client...');
        
        let twilioNumber, twilioSid;
        
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
            const purchasedNumber = await twilioClient.incomingPhoneNumbers
                .create({
                    phoneNumber: availableNumbers[0].phoneNumber,
                    voiceUrl: `${process.env.WEBHOOK_BASE_URL}/voice/webhook/voice`,
                    voiceMethod: 'POST',
                    smsUrl: `${process.env.WEBHOOK_BASE_URL}/api/messages/incoming`,
                    smsMethod: 'POST',
                    friendlyName: `RinglyPro - ${businessName}`
                });

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
        
        // ==================== CREATE CLIENT RECORD ====================
        let client = null;
        if (Client) {
            client = await Client.create({
                business_name: businessName,
                business_phone: businessPhone,
                ringlypro_number: twilioNumber,              // NEW: Twilio number
                twilio_number_sid: twilioSid,                // NEW: Twilio SID
                forwarding_status: 'active',                  // NEW: Active status
                owner_name: `${firstName} ${lastName}`,
                owner_phone: phoneNumber || businessPhone,
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
                rachel_enabled: true,
                active: true,
                user_id: user.id
            }, { transaction });
            
            console.log('✅ Client record created for Rachel AI:', client.id);
            console.log(`📞 Rachel AI number configured: ${twilioNumber}`);
            
            // Create credit account
            if (CreditAccount) {
                await CreditAccount.create({
                    client_id: client.id,
                    balance: 0.00,
                    free_minutes_used: 0
                }, { transaction });
                console.log('✅ Credit account created');
            }
        } else {
            console.log('⚠️ Client model not available - skipping client creation');
        }
        
        await transaction.commit();
        
        // Generate JWT token
        const token = jwt.sign(
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
        
        // Send welcome response
        res.status(201).json({
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
                    onboardingCompleted: user.onboarding_completed
                },
                client: client ? {
                    id: client.id,
                    rachelNumber: twilioNumber,              // NEW: Return Twilio number
                    rachelEnabled: client.rachel_enabled,
                    twilioSid: twilioSid                      // NEW: Return SID
                } : null,
                token,
                nextSteps: {
                    dashboard: '/dashboard',
                    setupPhone: '/setup/phone',
                    testAI: '/test-assistant',
                    forwardingInstructions: `Forward your calls to ${twilioNumber} to activate Rachel AI`
                }
            }
        });
        
        console.log(`🎉 New user registered: ${firstName} ${lastName} (${businessName}) - ${email}`);
        console.log(`📞 Rachel AI Twilio number: ${twilioNumber}`);
        
    } catch (error) {
        await transaction.rollback();
        console.error('💥 Registration error:', error);
        console.error('Error details:', error.message);
        
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

module.exports = router;