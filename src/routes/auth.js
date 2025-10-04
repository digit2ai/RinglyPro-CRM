const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const twilio = require('twilio');
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const { User, sequelize } = require('../models');
const emailService = require('../services/emailService');
const { authenticateToken, getUserClient } = require('../middleware/auth');
const router = express.Router();

// =====================================================
// RATE LIMITING CONFIGURATION
// =====================================================

// Strict rate limit for login attempts (prevent brute force)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    message: {
        success: false,
        error: 'Too many login attempts. Please try again in 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // Don't count successful logins
});

// Rate limit for registration (prevent spam)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registrations per hour per IP
    message: {
        success: false,
        error: 'Too many registration attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limit for password reset requests (prevent email spam)
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 reset requests per hour
    message: {
        success: false,
        error: 'Too many password reset requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// General rate limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: {
        success: false,
        error: 'Too many requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

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
router.post('/register', registerLimiter, async (req, res) => {
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
router.post('/login', loginLimiter, async (req, res) => {
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

// GET /api/auth/profile - Get current user profile (Protected)
router.get('/profile', authenticateToken, getUserClient, async (req, res) => {
    try {
        console.log(`📋 Profile request for user: ${req.user.email}`);

        // Get fresh user data from database
        const user = await User.findByPk(req.user.userId, {
            attributes: {
                exclude: ['password_hash', 'password_reset_token', 'email_verification_token']
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
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
                    businessDescription: user.business_description,
                    businessHours: user.business_hours,
                    services: user.services,
                    freeTrialMinutes: user.free_trial_minutes,
                    emailVerified: user.email_verified,
                    onboardingCompleted: user.onboarding_completed,
                    createdAt: user.created_at,
                    updatedAt: user.updated_at
                },
                client: req.client || null
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get profile'
        });
    }
});

// POST /api/auth/update-profile - Update user business information (Protected)
router.post('/update-profile', authenticateToken, async (req, res) => {
    try {
        console.log(`📝 Profile update request for user: ${req.user.email}`);

        const {
            firstName,
            lastName,
            businessName,
            businessType,
            businessPhone,
            phoneNumber,
            websiteUrl,
            businessDescription,
            businessHours,
            services
        } = req.body;

        // Get user from database
        const user = await User.findByPk(req.user.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Build update object with only provided fields
        const updates = {};
        if (firstName !== undefined) updates.first_name = firstName;
        if (lastName !== undefined) updates.last_name = lastName;
        if (businessName !== undefined) updates.business_name = businessName;
        if (businessType !== undefined) updates.business_type = businessType;
        if (businessPhone !== undefined) updates.business_phone = businessPhone;
        if (phoneNumber !== undefined) updates.phone_number = phoneNumber;
        if (websiteUrl !== undefined) {
            updates.website_url = websiteUrl && websiteUrl.trim() !== '' ? websiteUrl.trim() : null;
        }
        if (businessDescription !== undefined) updates.business_description = businessDescription;
        if (businessHours !== undefined) updates.business_hours = businessHours;
        if (services !== undefined) updates.services = services;

        // Update user
        await user.update(updates);

        console.log(`✅ Profile updated for user: ${user.email}`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
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
                    businessDescription: user.business_description,
                    businessHours: user.business_hours,
                    services: user.services,
                    freeTrialMinutes: user.free_trial_minutes,
                    emailVerified: user.email_verified,
                    onboardingCompleted: user.onboarding_completed
                }
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile'
        });
    }
});

// POST /api/auth/refresh-token - Refresh JWT token (Protected)
router.post('/refresh-token', authenticateToken, async (req, res) => {
    try {
        console.log(`🔄 Token refresh for user: ${req.user.email}`);

        // Get fresh user data
        const user = await User.findByPk(req.user.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Get client if exists
        let client = null;
        if (Client) {
            client = await Client.findOne({ where: { user_id: user.id } });
        }

        // Generate new JWT token
        const newToken = jwt.sign(
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

        console.log(`✅ Token refreshed for: ${user.email}`);

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            token: newToken,
            expiresIn: '7d'
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh token'
        });
    }
});

// POST /api/auth/logout - Logout user (Protected)
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        console.log(`👋 Logout request for user: ${req.user.email}`);

        // In a stateless JWT system, logout is handled client-side by removing the token
        // For future enhancement: implement token blacklist in Redis

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to logout'
        });
    }
});

// GET /api/auth/verify - Verify if token is valid (Protected)
router.get('/verify', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            valid: true,
            user: {
                userId: req.user.userId,
                email: req.user.email,
                businessName: req.user.businessName
            }
        });
    } catch (error) {
        console.error('Verify token error:', error);
        res.status(500).json({
            success: false,
            valid: false,
            error: 'Failed to verify token'
        });
    }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        console.log(`🔐 Password reset requested for: ${email}`);

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email address is required'
            });
        }

        // Find user by email
        const user = await User.findOne({ where: { email } });

        // Always return success to prevent email enumeration
        // Don't reveal if email exists or not
        if (!user) {
            console.log(`⚠️ Password reset requested for non-existent email: ${email}`);
            return res.json({
                success: true,
                message: 'If that email exists, a password reset link has been sent.'
            });
        }

        // Generate password reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

        // Save reset token to user
        await user.update({
            password_reset_token: resetToken,
            password_reset_expires: resetTokenExpiry
        });

        console.log(`✅ Reset token generated for ${email}: ${resetToken.substring(0, 10)}...`);
        console.log(`⏰ Token expires at: ${resetTokenExpiry.toISOString()}`);

        // Send password reset email
        try {
            await emailService.sendPasswordResetEmail(
                user.email,
                resetToken,
                `${user.first_name} ${user.last_name}`
            );
            console.log(`📧 Password reset email sent to ${email}`);
        } catch (emailError) {
            console.error('❌ Failed to send password reset email:', emailError);
            // Don't fail the request if email fails - token is still valid
        }

        res.json({
            success: true,
            message: 'If that email exists, a password reset link has been sent.'
        });

    } catch (error) {
        console.error('💥 Forgot password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process password reset request'
        });
    }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', authLimiter, async (req, res) => {
    try {
        const { token, password } = req.body;

        console.log(`🔐 Password reset attempt with token: ${token?.substring(0, 10)}...`);

        // Validate inputs
        if (!token || !password) {
            return res.status(400).json({
                success: false,
                error: 'Reset token and new password are required'
            });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters long'
            });
        }

        // Find user with valid reset token
        const user = await User.findOne({
            where: {
                password_reset_token: token,
                password_reset_expires: {
                    [sequelize.Sequelize.Op.gt]: new Date() // Token not expired
                }
            }
        });

        if (!user) {
            console.log('❌ Invalid or expired reset token');
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired password reset token'
            });
        }

        console.log(`✅ Valid reset token found for user: ${user.email}`);

        // Hash new password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Update password and clear reset token
        await user.update({
            password_hash: passwordHash,
            password_reset_token: null,
            password_reset_expires: null
        });

        console.log(`✅ Password successfully reset for: ${user.email}`);

        res.json({
            success: true,
            message: 'Password has been reset successfully. You can now log in with your new password.'
        });

    } catch (error) {
        console.error('💥 Reset password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset password'
        });
    }
});

// GET /api/auth/verify-reset-token - Verify if reset token is valid
router.get('/verify-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;

        console.log(`🔍 Verifying reset token: ${token?.substring(0, 10)}...`);

        // Find user with valid reset token
        const user = await User.findOne({
            where: {
                password_reset_token: token,
                password_reset_expires: {
                    [sequelize.Sequelize.Op.gt]: new Date()
                }
            }
        });

        if (!user) {
            console.log('❌ Invalid or expired token');
            return res.status(400).json({
                success: false,
                valid: false,
                error: 'Invalid or expired password reset token'
            });
        }

        console.log(`✅ Valid token for user: ${user.email}`);

        res.json({
            success: true,
            valid: true,
            message: 'Token is valid',
            email: user.email // Return masked email for confirmation
        });

    } catch (error) {
        console.error('💥 Verify token error:', error);
        res.status(500).json({
            success: false,
            valid: false,
            error: 'Failed to verify token'
        });
    }
});

module.exports = router;