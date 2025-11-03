/**
 * RINGLYPRO CRM - REFERRAL API ROUTES
 *
 * Endpoints for viral referral system:
 * - Get referral code and link
 * - Validate referral codes
 * - Get referral stats and analytics
 * - View referral list
 * - Leaderboard
 *
 * Created: November 3, 2025
 */

const express = require('express');
const router = express.Router();
const referralService = require('../services/referralService');
const { authenticateToken } = require('../middleware/auth');

// =====================================================
// USER ENDPOINTS (Authenticated)
// =====================================================

/**
 * GET /api/referrals/my-code
 * Get user's referral code and link
 */
router.get('/my-code', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const referralCode = await referralService.getReferralCode(userId);
    const referralLink = await referralService.getReferralLink(userId);

    res.json({
      success: true,
      referralCode,
      referralLink,
      shareMessage: `Join RinglyPro CRM and get 150 tokens free! Use my referral code: ${referralCode} or sign up here: ${referralLink}`
    });

  } catch (error) {
    console.error('Error getting referral code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get referral code',
      message: error.message
    });
  }
});

/**
 * GET /api/referrals/stats
 * Get user's referral statistics
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const stats = await referralService.getReferralStats(userId);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error getting referral stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get referral stats',
      message: error.message
    });
  }
});

/**
 * GET /api/referrals/my-referrals
 * Get list of users referred by current user
 */
router.get('/my-referrals', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50, offset = 0, status } = req.query;

    const result = await referralService.getUserReferrals(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      status
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error getting user referrals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get referrals',
      message: error.message
    });
  }
});

/**
 * GET /api/referrals/dashboard
 * Get complete referral dashboard data
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get all data in parallel
    const [stats, referrals, referralCode, referralLink] = await Promise.all([
      referralService.getReferralStats(userId),
      referralService.getUserReferrals(userId, { limit: 10 }),
      referralService.getReferralCode(userId),
      referralService.getReferralLink(userId)
    ]);

    res.json({
      success: true,
      dashboard: {
        stats,
        recentReferrals: referrals.referrals,
        referralCode,
        referralLink,
        tierProgress: {
          current: stats.tier,
          successfulReferrals: stats.successfulReferrals,
          nextTier: stats.successfulReferrals < 5 ? 'silver' : stats.successfulReferrals < 25 ? 'gold' : null,
          referralsToNextTier: stats.successfulReferrals < 5 ? 5 - stats.successfulReferrals : stats.successfulReferrals < 25 ? 25 - stats.successfulReferrals : 0
        }
      }
    });

  } catch (error) {
    console.error('Error getting referral dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get referral dashboard',
      message: error.message
    });
  }
});

/**
 * GET /api/referrals/leaderboard
 * Get referral leaderboard (top 100 referrers)
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const leaderboard = await referralService.getLeaderboard(parseInt(limit));

    res.json({
      success: true,
      leaderboard,
      total: leaderboard.length
    });

  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard',
      message: error.message
    });
  }
});

/**
 * GET /api/referrals/tier-info
 * Get information about referral tiers
 */
router.get('/tier-info', async (req, res) => {
  try {
    const tiers = [
      {
        name: 'bronze',
        displayName: 'Bronze',
        badge: '🥉',
        color: '#CD7F32',
        minReferrals: 0,
        maxReferrals: 4,
        benefits: {
          signupBonus: 200,
          conversionBonus: 1000,
          recurringTokens: 0,
          commission: 0,
          unlimitedTokens: false,
          prioritySupport: false
        },
        description: 'Start earning tokens by referring friends'
      },
      {
        name: 'silver',
        displayName: 'Silver',
        badge: '🥈',
        color: '#C0C0C0',
        minReferrals: 5,
        maxReferrals: 24,
        benefits: {
          signupBonus: 300,
          conversionBonus: 1500,
          recurringTokens: 200,
          commission: 5,
          unlimitedTokens: false,
          prioritySupport: true,
          customBranding: true,
          analyticsDashboard: true
        },
        description: '5+ referrals unlocks Silver tier with recurring bonuses'
      },
      {
        name: 'gold',
        displayName: 'Gold',
        badge: '🥇',
        color: '#FFD700',
        minReferrals: 25,
        maxReferrals: null,
        benefits: {
          signupBonus: 500,
          conversionBonus: 2000,
          recurringTokens: 500,
          commission: 15,
          commissionType: 'cash',
          unlimitedTokens: true,
          prioritySupport: true,
          customBranding: true,
          analyticsDashboard: true,
          dedicatedAccountManager: true,
          cobrandedMaterials: true
        },
        description: '25+ referrals unlocks Gold tier with unlimited tokens and cash commissions'
      }
    ];

    res.json({
      success: true,
      tiers
    });

  } catch (error) {
    console.error('Error getting tier info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tier info',
      message: error.message
    });
  }
});

// =====================================================
// PUBLIC VALIDATION ENDPOINTS
// =====================================================

/**
 * POST /api/referrals/validate
 * Validate a referral code (public endpoint for signup form)
 */
router.post('/validate', async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        error: 'Referral code is required'
      });
    }

    const validation = await referralService.validateReferralCode(referralCode);

    if (!validation.valid) {
      return res.status(404).json({
        success: false,
        error: validation.error
      });
    }

    res.json({
      success: true,
      valid: true,
      referrer: {
        name: validation.referrer.name,
        businessName: validation.referrer.businessName || 'RinglyPro User'
      },
      bonus: {
        tokensForReferee: 50,
        tokensForReferrer: 200,
        conversionBonus: 1000
      },
      message: `Valid referral code! You'll get 150 tokens (100 base + 50 referral bonus) when you sign up.`
    });

  } catch (error) {
    console.error('Error validating referral code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate referral code',
      message: error.message
    });
  }
});

// =====================================================
// INTERNAL ENDPOINTS (Called by other services)
// =====================================================

/**
 * POST /api/referrals/record-signup
 * Record a referral when a new user signs up
 * Internal use only - should be called from auth/registration service
 */
router.post('/record-signup', authenticateToken, async (req, res) => {
  try {
    const { referredUserId, referralCode, metadata } = req.body;

    if (!referredUserId || !referralCode) {
      return res.status(400).json({
        success: false,
        error: 'referredUserId and referralCode are required'
      });
    }

    const result = await referralService.recordReferralSignup(
      referredUserId,
      referralCode,
      metadata || {}
    );

    res.json(result);

  } catch (error) {
    console.error('Error recording referral signup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record referral signup',
      message: error.message
    });
  }
});

/**
 * POST /api/referrals/record-conversion
 * Record a referral conversion when user makes first purchase
 * Internal use only - should be called from token purchase service
 */
router.post('/record-conversion', authenticateToken, async (req, res) => {
  try {
    const { referredUserId, purchaseAmount, packageName } = req.body;

    if (!referredUserId || !purchaseAmount || !packageName) {
      return res.status(400).json({
        success: false,
        error: 'referredUserId, purchaseAmount, and packageName are required'
      });
    }

    const result = await referralService.recordReferralConversion(
      referredUserId,
      purchaseAmount,
      packageName
    );

    res.json(result);

  } catch (error) {
    console.error('Error recording referral conversion:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record referral conversion',
      message: error.message
    });
  }
});

// =====================================================
// ADMIN ENDPOINTS (Future)
// =====================================================

/**
 * POST /api/referrals/process-monthly-rewards
 * Process monthly recurring rewards for Silver/Gold tiers
 * Should be called via cron job
 */
router.post('/process-monthly-rewards', authenticateToken, async (req, res) => {
  try {
    // TODO: Add admin authentication check
    // if (!req.user.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const result = await referralService.processMonthlyRecurringRewards();
    res.json(result);

  } catch (error) {
    console.error('Error processing monthly rewards:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process monthly rewards',
      message: error.message
    });
  }
});

/**
 * GET /api/referrals/test
 * Test endpoint to verify referral system is working
 */
router.get('/test', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Referral system is operational',
      timestamp: new Date().toISOString(),
      endpoints: {
        user: [
          'GET /api/referrals/my-code',
          'GET /api/referrals/stats',
          'GET /api/referrals/my-referrals',
          'GET /api/referrals/dashboard'
        ],
        public: [
          'GET /api/referrals/leaderboard',
          'GET /api/referrals/tier-info',
          'POST /api/referrals/validate'
        ],
        internal: [
          'POST /api/referrals/record-signup',
          'POST /api/referrals/record-conversion'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
