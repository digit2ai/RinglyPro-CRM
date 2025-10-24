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
 * GET /api/tokens/balance
 * Get user's current token balance and package info
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const balance = await tokenService.getBalance(req.user.id);
    const warning = await tokenService.checkLowBalanceWarning(req.user.id);

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
    const { limit, offset, startDate, endDate } = req.query;

    const result = await tokenService.getUsageHistory(req.user.id, {
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
    const { days } = req.query;
    const analytics = await tokenService.getUsageAnalytics(
      req.user.id,
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
        user_id: req.user.id,
        package_name,
        tokens: selectedPackage.tokens
      }
    });

    if (paymentIntent.status === 'succeeded') {
      // Add tokens to user account
      await tokenService.addTokens(
        req.user.id,
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
            req.user.id,
            package_name,
            selectedPackage.tokens,
            selectedPackage.price,
            paymentIntent.id,
            'completed'
          ]
        }
      );

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
          req.user.id,
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
      { bind: [req.user.id] }
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

module.exports = router;
