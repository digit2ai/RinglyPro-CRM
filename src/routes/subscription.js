// =====================================================
// Subscription Management Routes
// File: src/routes/subscription.js
// Purpose: Handle subscription upgrades for existing users
// =====================================================

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { User, Client } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// =====================================================
// SUBSCRIPTION PLANS - Must match auth.js and webhooks.js
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

/**
 * POST /api/subscription/upgrade
 * Create Stripe checkout session for subscription upgrade
 * Used by existing free users to upgrade to a paid plan
 */
router.post('/upgrade', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const { plan } = req.body;

        logger.info(`[SUBSCRIPTION] Upgrade request from user ${userId} to plan: ${plan}`);

        // Validate plan
        if (!plan || !SUBSCRIPTION_PLANS[plan]) {
            return res.status(400).json({
                success: false,
                error: 'Invalid plan selected. Choose starter, growth, or professional.'
            });
        }

        // Get user
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check if user already has an active subscription
        if (user.stripe_subscription_id && user.subscription_status === 'active') {
            // User already has a subscription - they need to manage it through Stripe portal
            // For now, we'll create a new subscription (Stripe will handle upgrade/downgrade)
            logger.info(`[SUBSCRIPTION] User ${userId} already has subscription ${user.stripe_subscription_id}`);
        }

        // Get client for metadata
        const client = await Client.findOne({ where: { user_id: userId } });

        const planDetails = SUBSCRIPTION_PLANS[plan];
        const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

        logger.info(`[SUBSCRIPTION] Creating checkout for ${planDetails.name} plan at $${planDetails.price}/month`);

        // Create Stripe Checkout Session for recurring subscription
        // NO TRIAL - user pays immediately
        const session = await stripe.checkout.sessions.create({
            customer_email: user.email,
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `RinglyPro ${planDetails.name} Plan`,
                        description: `${planDetails.tokens} tokens/month (${Math.floor(planDetails.tokens / 5)} minutes of voice)`,
                    },
                    unit_amount: planDetails.price * 100,  // Price in cents
                    recurring: {
                        interval: 'month',
                        interval_count: 1
                    }
                },
                quantity: 1
            }],
            mode: 'subscription',

            // NO TRIAL - immediate payment
            subscription_data: {
                metadata: {
                    userId: userId.toString(),
                    plan: plan,
                    monthlyTokens: planDetails.tokens.toString(),
                    billing: 'monthly',
                    clientId: client ? client.id.toString() : '',
                    rollover: planDetails.rollover.toString(),
                    upgradeFrom: user.subscription_plan || 'free'
                }
            },

            success_url: `${webhookBaseUrl}/dashboard?upgrade=success&plan=${plan}`,
            cancel_url: `${webhookBaseUrl}/purchase-tokens?upgrade=canceled`,

            metadata: {
                userId: userId.toString(),
                plan: plan,
                monthlyTokens: planDetails.tokens.toString(),
                billing: 'monthly',
                clientId: client ? client.id.toString() : '',
                type: 'subscription_upgrade'
            }
        });

        logger.info(`[SUBSCRIPTION] Checkout session created: ${session.id}`);

        // Return checkout URL
        res.json({
            success: true,
            url: session.url,
            sessionId: session.id
        });

    } catch (error) {
        logger.error('[SUBSCRIPTION] Upgrade error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create subscription checkout'
        });
    }
});

/**
 * GET /api/subscription/status
 * Get current subscription status for user
 */
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;

        const user = await User.findByPk(userId, {
            attributes: [
                'subscription_plan',
                'subscription_status',
                'stripe_subscription_id',
                'stripe_customer_id',
                'tokens_balance',
                'monthly_token_allocation',
                'billing_cycle_start',
                'token_package'
            ]
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const plan = user.subscription_plan || user.token_package || 'free';
        const planDetails = SUBSCRIPTION_PLANS[plan] || { name: 'Free', price: 0, tokens: 100 };

        res.json({
            success: true,
            subscription: {
                plan: plan,
                planName: planDetails.name,
                status: user.subscription_status || 'free',
                hasActiveSubscription: !!user.stripe_subscription_id,
                tokensBalance: user.tokens_balance || 0,
                monthlyAllocation: user.monthly_token_allocation || planDetails.tokens,
                billingCycleStart: user.billing_cycle_start,
                price: planDetails.price
            }
        });

    } catch (error) {
        logger.error('[SUBSCRIPTION] Status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get subscription status'
        });
    }
});

/**
 * POST /api/subscription/cancel
 * Cancel current subscription (user keeps tokens until end of billing period)
 */
router.post('/cancel', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (!user.stripe_subscription_id) {
            return res.status(400).json({
                success: false,
                error: 'No active subscription to cancel'
            });
        }

        // Cancel at end of billing period (not immediately)
        const subscription = await stripe.subscriptions.update(user.stripe_subscription_id, {
            cancel_at_period_end: true
        });

        logger.info(`[SUBSCRIPTION] Subscription ${user.stripe_subscription_id} set to cancel at period end`);

        res.json({
            success: true,
            message: 'Subscription will be canceled at the end of the current billing period',
            cancelAt: new Date(subscription.current_period_end * 1000)
        });

    } catch (error) {
        logger.error('[SUBSCRIPTION] Cancel error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to cancel subscription'
        });
    }
});

module.exports = router;
