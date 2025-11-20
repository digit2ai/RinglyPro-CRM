// =====================================================
// RinglyPro Token API Routes
// File: src/routes/tokens.js
// Purpose: Token balance, usage history, and analytics
// =====================================================

const express = require('express');
const router = express.Router();
const tokenService = require('../services/tokenService');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// =====================================================
// USER TOKEN ENDPOINTS (Authenticated)
// =====================================================

/**
 * GET /api/tokens/balance-from-copilot
 * Get token balance from copilot using clientId (no auth required)
 */
router.get('/balance-from-copilot', async (req, res) => {
  try {
    const clientId = req.query.client_id;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required'
      });
    }

    // Get userId from clientId
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    const result = await sequelize.query(
      'SELECT user_id FROM clients WHERE id = :clientId',
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.SELECT
      }
    );

    if (!result || result.length === 0 || !result[0].user_id) {
      logger.error(`Client ${clientId} has no user_id`);
      return res.status(400).json({
        success: false,
        error: 'Client not properly configured. Please contact support.'
      });
    }

    const userId = result[0].user_id;
    const balance = await tokenService.getBalance(userId);
    const warning = await tokenService.checkLowBalanceWarning(userId);

    res.json({
      success: true,
      ...balance,
      ...warning
    });
  } catch (error) {
    logger.error('[TOKENS API] Balance from copilot error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get token balance'
    });
  }
});

/**
 * GET /api/tokens/balance
 * Get user's current token balance and package info
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const balance = await tokenService.getBalance(userId);
    const warning = await tokenService.checkLowBalanceWarning(userId);

    res.json({
      success: true,
      ...balance,
      ...warning
    });
  } catch (error) {
    logger.error('[TOKENS API] Balance error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get token balance'
    });
  }
});

/**
 * GET /api/tokens/usage
 * Get user's token usage history
 */
router.get('/usage', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { limit, offset, startDate, endDate } = req.query;

    const result = await tokenService.getUsageHistory(userId, {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
      startDate,
      endDate
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('[TOKENS API] Usage history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get usage history'
    });
  }
});

/**
 * GET /api/tokens/analytics
 * Get token usage analytics
 */
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { days } = req.query;
    const analytics = await tokenService.getUsageAnalytics(
      userId,
      parseInt(days) || 30
    );

    res.json({
      success: true,
      ...analytics
    });
  } catch (error) {
    logger.error('[TOKENS API] Analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get analytics'
    });
  }
});

/**
 * GET /api/tokens/pricing
 * Get all service costs (for pricing display)
 */
router.get('/pricing', async (req, res) => {
  try {
    const pricing = tokenService.getAllServiceCosts();

    res.json({
      success: true,
      pricing,
      packages: {
        free: {
          name: 'Free Tier',
          tokens: 100,
          price: 0,
          rollover: 0,
          features: ['All services available', 'Monthly reset', 'No rollover']
        },
        starter: {
          name: 'Starter Pack',
          tokens: 500,
          price: 29,
          rollover: 1000,
          features: ['All services', 'Rollover up to 1000 tokens', 'Priority support']
        },
        growth: {
          name: 'Growth Pack',
          tokens: 2000,
          price: 99,
          rollover: 5000,
          features: ['All services', 'Rollover up to 5000 tokens', 'Premium support']
        },
        professional: {
          name: 'Professional Pack',
          tokens: 7500,
          price: 299,
          rollover: 'unlimited',
          features: ['All services', 'Unlimited rollover', 'Dedicated support']
        }
      }
    });
  } catch (error) {
    logger.error('[TOKENS API] Pricing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pricing'
    });
  }
});

/**
 * POST /api/tokens/purchase
 * Purchase token package (Stripe integration)
 */
router.post('/purchase', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { package_name, payment_method_id } = req.body;

    // Validate package
    const packages = {
      starter: { tokens: 500, price: 29 },
      growth: { tokens: 2000, price: 99 },
      professional: { tokens: 7500, price: 299 }
    };

    const selectedPackage = packages[package_name];
    if (!selectedPackage) {
      return res.status(400).json({
        success: false,
        error: 'Invalid package selected'
      });
    }

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        success: false,
        error: 'Payment processing not configured'
      });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: selectedPackage.price * 100, // Convert to cents
      currency: 'usd',
      payment_method: payment_method_id,
      confirm: true,
      metadata: {
        user_id: userId,
        package_name,
        tokens: selectedPackage.tokens
      }
    });

    if (paymentIntent.status === 'succeeded') {
      // Add tokens to user account
      await tokenService.addTokens(
        userId,
        selectedPackage.tokens,
        'purchase',
        {
          package_name,
          stripe_payment_id: paymentIntent.id,
          amount_paid: selectedPackage.price
        }
      );

      // Log purchase
      const { sequelize } = require('../models');
      await sequelize.query(
        `
        INSERT INTO token_purchases (
          user_id, package_name, tokens_purchased, amount_paid, stripe_payment_id, payment_status
        ) VALUES ($1, $2, $3, $4, $5, $6)
        `,
        {
          bind: [
            userId,
            package_name,
            selectedPackage.tokens,
            selectedPackage.price,
            paymentIntent.id,
            'completed'
          ]
        }
      );

      // Record referral conversion (non-blocking)
      try {
        const referralService = require('../services/referralService');
        await referralService.recordReferralConversion(
          userId,
          selectedPackage.price,
          package_name
        );
        console.log('✅ Referral conversion tracked for user:', userId);
      } catch (referralError) {
        console.error('⚠️ Referral conversion tracking error (non-critical):', referralError.message);
        // Don't fail purchase if referral tracking fails
      }

      res.json({
        success: true,
        tokens_added: selectedPackage.tokens,
        amount_paid: selectedPackage.price,
        payment_id: paymentIntent.id
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Payment failed',
        status: paymentIntent.status
      });
    }
  } catch (error) {
    logger.error('[TOKENS API] Purchase error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Purchase failed'
    });
  }
});

/**
 * GET /api/tokens/purchases
 * Get user's purchase history
 */
router.get('/purchases', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { limit, offset } = req.query;
    const { sequelize } = require('../models');

    const [purchases] = await sequelize.query(
      `
      SELECT
        id, package_name, tokens_purchased, amount_paid,
        stripe_payment_id, payment_status, purchased_at
      FROM token_purchases
      WHERE user_id = $1
      ORDER BY purchased_at DESC
      LIMIT $2 OFFSET $3
      `,
      {
        bind: [
          userId,
          parseInt(limit) || 20,
          parseInt(offset) || 0
        ]
      }
    );

    const [countResult] = await sequelize.query(
      `
      SELECT COUNT(*) as total
      FROM token_purchases
      WHERE user_id = $1
      `,
      { bind: [userId] }
    );

    res.json({
      success: true,
      purchases,
      total: parseInt(countResult[0]?.total || 0)
    });
  } catch (error) {
    logger.error('[TOKENS API] Purchase history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get purchase history'
    });
  }
});

// =====================================================
// INTERNAL ENDPOINTS (No authentication - for services)
// =====================================================

/**
 * POST /api/tokens/check
 * Check if user has enough tokens (internal use)
 */
router.post('/check', async (req, res) => {
  try {
    const { userId, serviceType } = req.body;

    if (!userId || !serviceType) {
      return res.status(400).json({
        success: false,
        error: 'userId and serviceType required'
      });
    }

    const hasTokens = await tokenService.hasEnoughTokens(userId, serviceType);
    const cost = tokenService.getServiceCost(serviceType);

    res.json({
      success: true,
      has_enough_tokens: hasTokens,
      cost,
      service_type: serviceType
    });
  } catch (error) {
    logger.error('[TOKENS API] Check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tokens/deduct
 * Deduct tokens (internal use)
 */
router.post('/deduct', async (req, res) => {
  try {
    const { userId, serviceType, metadata } = req.body;

    if (!userId || !serviceType) {
      return res.status(400).json({
        success: false,
        error: 'userId and serviceType required'
      });
    }

    const result = await tokenService.deductTokens(userId, serviceType, metadata);

    res.json(result);
  } catch (error) {
    logger.error('[TOKENS API] Deduct error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tokens/diagnostic/:clientId
 * Diagnostic endpoint to check token system configuration
 */
router.get('/diagnostic/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { Client, User } = require('../models');

    console.log(`🔍 Token diagnostic for clientId: ${clientId}`);

    // Check if client exists
    const client = await Client.findByPk(clientId);
    if (!client) {
      return res.json({
        success: false,
        error: 'Client not found',
        clientId: parseInt(clientId),
        exists: false
      });
    }

    // Check if client has user_id
    if (!client.user_id) {
      return res.json({
        success: false,
        error: 'Client has NO user_id - token deduction will fail',
        clientId: parseInt(clientId),
        client: {
          id: client.id,
          business_name: client.business_name,
          owner_email: client.owner_email,
          user_id: null
        },
        issue: 'CLIENT_MISSING_USER_ID',
        solution: 'Run migration: migrations/link-clients-to-users.sql'
      });
    }

    // Check if user exists
    const user = await User.findByPk(client.user_id);
    if (!user) {
      return res.json({
        success: false,
        error: 'User not found for client.user_id',
        clientId: parseInt(clientId),
        client: {
          id: client.id,
          business_name: client.business_name,
          user_id: client.user_id
        },
        issue: 'USER_NOT_FOUND',
        solution: 'Check users table or run migration'
      });
    }

    // All checks passed
    return res.json({
      success: true,
      message: 'Token system configured correctly',
      clientId: parseInt(clientId),
      client: {
        id: client.id,
        business_name: client.business_name,
        owner_email: client.owner_email,
        user_id: client.user_id
      },
      user: {
        id: user.id,
        email: user.email,
        tokens_balance: user.tokens_balance,
        token_package: user.token_package,
        referral_code: user.referral_code
      },
      status: 'READY_FOR_TOKEN_DEDUCTION'
    });

  } catch (error) {
    logger.error('[TOKENS API] Diagnostic error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tokens/manual-recharge/:clientId
 * Manually add tokens when payment succeeded but webhook failed
 * ADMIN USE ONLY - should be protected in production
 */
router.post('/manual-recharge/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { amountPaid } = req.body;

    if (!amountPaid || amountPaid <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amountPaid is required and must be positive'
      });
    }

    const { Client, User } = require('../models');

    // Get client and user
    const client = await Client.findByPk(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: `Client ${clientId} not found`
      });
    }

    if (!client.user_id) {
      return res.status(400).json({
        success: false,
        error: `Client ${clientId} has no user_id - cannot add tokens`,
        solution: 'Run migration: migrations/link-clients-to-users.sql'
      });
    }

    const user = await User.findByPk(client.user_id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: `User ${client.user_id} not found`
      });
    }

    // Calculate tokens to add ($0.05 per token)
    const tokensToAdd = Math.floor(amountPaid / 0.05);
    const previousBalance = user.tokens_balance;

    logger.info(`[MANUAL RECHARGE] Client ${clientId}, User ${user.id}, Adding ${tokensToAdd} tokens ($${amountPaid})`);

    // Add tokens
    await tokenService.addTokens(
      user.id,
      tokensToAdd,
      'manual_recharge',
      {
        client_id: clientId,
        amount_paid: amountPaid,
        reason: 'Manual recharge - payment succeeded but webhook failed',
        admin_action: true
      }
    );

    // Get updated balance
    const updatedUser = await User.findByPk(user.id);

    logger.info(`[MANUAL RECHARGE] Success! User ${user.id} balance: ${previousBalance} → ${updatedUser.tokens_balance}`);

    res.json({
      success: true,
      message: 'Tokens added successfully',
      userId: user.id,
      email: user.email,
      tokensAdded: tokensToAdd,
      previousBalance,
      newBalance: updatedUser.tokens_balance,
      amountPaid
    });

  } catch (error) {
    logger.error('[TOKENS API] Manual recharge error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tokens/monthly-reset
 * Trigger monthly token reset for all users or specific user
 * ADMIN USE ONLY
 */
router.post('/monthly-reset', async (req, res) => {
  try {
    const { userId } = req.body;

    logger.info(`[MONTHLY RESET API] Triggered${userId ? ` for user ${userId}` : ' for all users'}`);

    const results = await tokenService.resetMonthlyTokens(userId);

    res.json({
      success: true,
      message: 'Monthly token reset completed',
      ...results
    });

  } catch (error) {
    logger.error('[TOKENS API] Monthly reset error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/tokens/reset-status/:userId
 * Check if user needs monthly reset
 */
router.get('/reset-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { User } = require('../models');

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const needsReset = await tokenService.needsMonthlyReset(userId);
    const daysSinceReset = user.last_token_reset
      ? Math.floor((new Date() - new Date(user.last_token_reset)) / (1000 * 60 * 60 * 24))
      : null;

    res.json({
      success: true,
      userId: parseInt(userId),
      email: user.email,
      needsReset,
      lastReset: user.last_token_reset,
      daysSinceReset,
      currentBalance: user.tokens_balance,
      package: user.token_package
    });

  } catch (error) {
    logger.error('[TOKENS API] Reset status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/tokens/create-checkout-session
 * Create Stripe Checkout Session for token purchase
 * This avoids Stripe.js loading issues in iOS WebView
 */
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, tokens } = req.body;

    if (!amount || !tokens) {
      return res.status(400).json({
        success: false,
        error: 'Amount and tokens are required'
      });
    }

    // Initialize Stripe
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${tokens} RinglyPro Tokens`,
              description: `Add ${tokens} tokens to your account`,
            },
            unit_amount: amount * 100, // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com'}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com'}/purchase-tokens?canceled=true`,
      client_reference_id: userId.toString(),
      metadata: {
        userId: userId.toString(),
        tokens: tokens.toString(),
        amount: amount.toString()
      }
    });

    logger.info(`[TOKENS] Created checkout session for user ${userId}: ${session.id}`);

    res.json({
      success: true,
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    logger.error('[TOKENS API] Create checkout session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
});

/**
 * GET /api/tokens/verify-payment
 * Verify Stripe Checkout Session and add tokens to user account
 */
router.get('/verify-payment', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    // Initialize Stripe
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Retrieve the session
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Verify the session belongs to this user
    if (session.client_reference_id !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Check if payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed'
      });
    }

    // Get tokens and amount from metadata
    const tokens = parseInt(session.metadata.tokens);
    const amount = parseFloat(session.metadata.amount);

    // Add tokens to user account
    const result = await tokenService.addTokens(userId, tokens, {
      source: 'purchase',
      transactionId: session.payment_intent,
      amount: amount,
      currency: 'usd'
    });

    logger.info(`[TOKENS] Payment verified and ${tokens} tokens added to user ${userId}`);

    res.json({
      success: true,
      tokensAdded: tokens,
      newBalance: result.balance
    });

  } catch (error) {
    logger.error('[TOKENS API] Verify payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify payment'
    });
  }
});

module.exports = router;
