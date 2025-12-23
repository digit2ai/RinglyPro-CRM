/**
 * LaunchStack Routes - Separate from RinglyPro
 *
 * LaunchStack is a separate product that shares the same database
 * but has its own registration flow WITHOUT Twilio/Client provisioning.
 */

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, sequelize } = require('../models');

const router = express.Router();

console.log('🚀 LaunchStack routes loaded');

// POST /api/launchstack/register - LaunchStack user registration (NO Twilio)
router.post('/register', async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const {
            email,
            password,
            firstName,
            lastName,
            businessName,
            businessType,
            phoneNumber,
            websiteUrl,
            services,
            termsAccepted,
            referralCode,
            plan
        } = req.body;

        console.log('🚀 LaunchStack registration attempt:', { email, firstName, lastName, businessName, businessType });

        // Validate required fields
        if (!email || !password || !firstName || !lastName) {
            await transaction.rollback();
            return res.status(400).json({
                error: 'Email, password, first name, and last name are required'
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

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Clean up website_url
        const cleanWebsiteUrl = websiteUrl && websiteUrl.trim() !== '' ? websiteUrl.trim() : null;

        // Convert services array to JSON string
        const servicesString = Array.isArray(services) ? JSON.stringify(services) : services;

        // Determine subscription plan
        const selectedPlan = plan || 'launchstack_starter';

        // Calculate trial end date (14 days from now)
        const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        // Create user - LaunchStack specific (no businessPhone required)
        const user = await User.create({
            email,
            password_hash: passwordHash,
            first_name: firstName,
            last_name: lastName,
            business_name: businessName,
            business_type: businessType,
            website_url: cleanWebsiteUrl,
            phone_number: phoneNumber || null,
            services: servicesString,
            terms_accepted: termsAccepted,
            free_trial_minutes: 0,  // LaunchStack doesn't use voice minutes
            onboarding_completed: false,
            subscription_plan: selectedPlan,
            subscription_status: 'trialing',
            trial_ends_at: trialEndsAt,
            tokens_balance: 100
        }, { transaction });

        console.log('✅ LaunchStack user created:', user.id);

        // Commit transaction
        await transaction.commit();
        console.log('✅ LaunchStack transaction committed');

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                businessName: user.business_name,
                businessType: user.business_type,
                source: 'launchstack'
            },
            process.env.JWT_SECRET || 'your-super-secret-jwt-key',
            { expiresIn: '7d' }
        );

        // Send response
        res.status(201).json({
            success: true,
            message: 'Registration successful! Welcome to LaunchStack!',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    businessName: user.business_name,
                    businessType: user.business_type,
                    phoneNumber: user.phone_number,
                    websiteUrl: user.website_url,
                    services: servicesString,
                    subscriptionPlan: selectedPlan,
                    subscriptionStatus: 'trialing',
                    trialEndsAt: trialEndsAt,
                    source: 'launchstack'
                },
                token,
                nextSteps: {
                    dashboard: '/all-in-one/dashboard.html'
                }
            }
        });

        console.log(`🎉 LaunchStack user registered: ${firstName} ${lastName} (${businessName}) - ${email}`);
        console.log(`📦 Services: ${servicesString || 'none'}`);

    } catch (error) {
        await transaction.rollback();
        console.error('💥 LaunchStack registration error:', error);

        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                error: 'An account with this email already exists'
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

// POST /api/launchstack/login - LaunchStack user login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log(`🔍 LaunchStack login attempt for: ${email}`);

        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required'
            });
        }

        // Find user
        const user = await User.findOne({ where: { email } });

        if (!user) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        console.log(`✅ LaunchStack user logged in: ${user.first_name} ${user.last_name}`);

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                businessName: user.business_name,
                businessType: user.business_type,
                source: 'launchstack'
            },
            process.env.JWT_SECRET || 'your-super-secret-jwt-key',
            { expiresIn: '7d' }
        );

        res.json({
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
                    services: user.services,
                    source: 'launchstack'
                },
                redirectTo: '/all-in-one/dashboard.html'
            }
        });

    } catch (error) {
        console.error('💥 LaunchStack login error:', error);
        res.status(500).json({
            error: 'Login failed. Please try again.'
        });
    }
});

// GET /api/launchstack/profile - Get current user profile
router.get('/profile', async (req, res) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                error: 'No token provided'
            });
        }

        // Verify token
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');

        // Fetch user from database
        const user = await User.findByPk(decoded.userId);

        if (!user) {
            return res.status(404).json({
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
                    phoneNumber: user.phone_number,
                    websiteUrl: user.website_url,
                    services: user.services,
                    subscriptionPlan: user.subscription_plan,
                    subscriptionStatus: user.subscription_status,
                    trialEndsAt: user.trial_ends_at,
                    tokensBalance: user.tokens_balance,
                    source: 'launchstack'
                }
            }
        });

    } catch (error) {
        console.error('💥 LaunchStack profile error:', error);

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired'
            });
        }

        res.status(500).json({
            error: 'Failed to fetch profile'
        });
    }
});

// GET /api/launchstack/verify - Verify token is valid
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                valid: false,
                error: 'No token provided'
            });
        }

        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');

        res.json({
            valid: true,
            userId: decoded.userId,
            source: decoded.source || 'launchstack'
        });

    } catch (error) {
        return res.status(401).json({
            valid: false,
            error: error.message
        });
    }
});

module.exports = router;
