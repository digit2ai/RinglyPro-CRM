const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const { User, sequelize } = require('../models');
const { sendPasswordResetEmail } = require('../services/emailService');
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
        const existingClient = await Client.findOne({ where: { business_phone: businessPhone } });
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
        // FIXED BUG #3: Better error handling and validation
        console.log('🏢 Creating client record...');
        
        let client = null;
        try {
            client = await Client.create({
                business_name: businessName,
                business_phone: businessPhone,
                ringlypro_number: twilioNumber,              // Twilio number
                twilio_number_sid: twilioSid,                // Twilio SID
                forwarding_status: 'active',                  // Active status
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
        });
        
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

// POST /api/auth/forgot-password - Request password reset via SMS
router.post('/forgot-password', async (req, res) => {
    try {
        const { email, phone } = req.body;

        if (!email && !phone) {
            return res.status(400).json({
                success: false,
                error: 'Email or phone number is required'
            });
        }

        // Find user by email or phone
        let user;
        if (email) {
            user = await User.findOne({ where: { email } });
        } else if (phone) {
            user = await User.findOne({ where: { phone_number: phone } });
        }

        // Always return success for security (don't reveal if user exists)
        if (!user) {
            console.log(`Password reset requested for non-existent user: ${email || phone}`);
            return res.json({
                success: true,
                message: 'If an account exists, you will receive a password reset link via SMS'
            });
        }

        // Check if user has a phone number
        if (!user.phone_number) {
            console.log(`⚠️  User ${user.email} has no phone number - cannot send SMS`);
            return res.json({
                success: true,
                message: 'If an account exists, you will receive a password reset link via SMS'
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
            email_verification_token: resetToken // Reusing this field for password reset
        });

        console.log(`✅ Password reset token generated for: ${user.email}`);

        // Send password reset SMS via Twilio
        const resetLink = `${process.env.APP_URL || 'https://aiagent.ringlypro.com'}/reset-password?token=${resetToken}`;

        try {
            await twilioClient.messages.create({
                body: `🔐 RinglyPro Password Reset\n\nClick here to reset your password:\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this message.`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: user.phone_number
            });

            console.log(`📱 Password reset SMS sent successfully to: ${user.phone_number}`);
        } catch (smsError) {
            console.error(`❌ SMS error:`, smsError.message);
            console.log(`🔗 Reset link: ${resetLink}`);
        }

        res.json({
            success: true,
            message: 'If an account exists, you will receive a password reset link via SMS',
            // REMOVE THIS IN PRODUCTION - only for testing
            resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process password reset request'
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