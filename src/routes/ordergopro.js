// =====================================================
// ORDERGOPRO SAAS PLATFORM ROUTES
// Client signup, login, and storefront management
// =====================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const { createStorefrontFromWebsite, createStorefrontFromDesignBrief } = require('../services/storefrontAutomation');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// =====================================================
// PUBLIC ROUTES
// =====================================================

/**
 * POST /api/ordergopro/signup
 * Create new client account
 */
router.post('/signup', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      businessName,
      businessType,
      password,
      plan
    } = req.body;

    logger.info(`[OrderGoPro] New signup: ${email}`);

    // Check if email already exists
    const [existing] = await sequelize.query(
      'SELECT id FROM ordergopro_clients WHERE email = :email',
      {
        replacements: { email },
        type: QueryTypes.SELECT
      }
    );

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create client
    const [client] = await sequelize.query(
      `INSERT INTO ordergopro_clients (
        first_name,
        last_name,
        email,
        phone,
        password_hash,
        business_name,
        business_type,
        subscription_plan,
        subscription_status,
        trial_ends_at,
        created_at
      ) VALUES (
        :firstName,
        :lastName,
        :email,
        :phone,
        :passwordHash,
        :businessName,
        :businessType,
        :plan,
        'trial',
        NOW() + INTERVAL '14 days',
        NOW()
      ) RETURNING *`,
      {
        replacements: {
          firstName,
          lastName,
          email,
          phone,
          passwordHash,
          businessName,
          businessType,
          plan: plan || 'professional'
        },
        type: QueryTypes.INSERT
      }
    );

    // Generate JWT token
    const token = jwt.sign(
      { clientId: client[0].id, email: client[0].email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    logger.info(`[OrderGoPro] Client created: ${client[0].id}`);

    res.json({
      success: true,
      token,
      client: {
        id: client[0].id,
        firstName: client[0].first_name,
        lastName: client[0].last_name,
        email: client[0].email,
        businessName: client[0].business_name,
        plan: client[0].subscription_plan
      }
    });

  } catch (error) {
    logger.error('[OrderGoPro] Signup error:', error);
    res.status(500).json({
      success: false,
      error: 'Signup failed'
    });
  }
});

/**
 * POST /api/ordergopro/login
 * Client login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    logger.info(`[OrderGoPro] Login attempt: ${email}`);

    // Get client
    const [client] = await sequelize.query(
      'SELECT * FROM ordergopro_clients WHERE email = :email',
      {
        replacements: { email },
        type: QueryTypes.SELECT
      }
    );

    if (!client) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, client.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { clientId: client.id, email: client.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    logger.info(`[OrderGoPro] Login successful: ${client.id}`);

    res.json({
      success: true,
      token,
      client: {
        id: client.id,
        firstName: client.first_name,
        lastName: client.last_name,
        email: client.email,
        businessName: client.business_name,
        plan: client.subscription_plan,
        subscriptionStatus: client.subscription_status
      }
    });

  } catch (error) {
    logger.error('[OrderGoPro] Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// =====================================================
// AUTHENTICATED ROUTES
// =====================================================

// Middleware to verify JWT token
function authenticateClient(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'No token provided'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.clientId = decoded.clientId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
}

/**
 * GET /api/ordergopro/me
 * Get current client info
 */
router.get('/me', authenticateClient, async (req, res) => {
  try {
    const [client] = await sequelize.query(
      'SELECT * FROM ordergopro_clients WHERE id = :id',
      {
        replacements: { id: req.clientId },
        type: QueryTypes.SELECT
      }
    );

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    res.json({
      success: true,
      client: {
        id: client.id,
        firstName: client.first_name,
        lastName: client.last_name,
        email: client.email,
        phone: client.phone,
        businessName: client.business_name,
        businessType: client.business_type,
        plan: client.subscription_plan,
        subscriptionStatus: client.subscription_status,
        trialEndsAt: client.trial_ends_at
      }
    });

  } catch (error) {
    logger.error('[OrderGoPro] Get client error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get client info'
    });
  }
});

/**
 * GET /api/ordergopro/storefronts
 * List client's storefronts
 */
router.get('/storefronts', authenticateClient, async (req, res) => {
  try {
    const storefronts = await sequelize.query(
      `SELECT
        sb.*,
        COUNT(DISTINCT si.id) as total_items,
        COALESCE(sb.total_orders, 0) as total_orders,
        COALESCE(sb.total_revenue, 0) as total_revenue
       FROM storefront_businesses sb
       LEFT JOIN storefront_items si ON sb.id = si.storefront_id AND si.is_active = true
       WHERE sb.ordergopro_client_id = :clientId
       GROUP BY sb.id
       ORDER BY sb.created_at DESC`,
      {
        replacements: { clientId: req.clientId },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      storefronts
    });

  } catch (error) {
    logger.error('[OrderGoPro] List storefronts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list storefronts'
    });
  }
});

/**
 * POST /api/ordergopro/storefronts/create
 * Create new storefront for client (autonomous with AI)
 */
router.post('/storefronts/create', authenticateClient, async (req, res) => {
  try {
    const {
      businessName,
      businessSlug,
      businessType,
      websiteUrl,
      designBrief,
      subscriptionPlan
    } = req.body;

    logger.info(`[OrderGoPro] Creating storefront: ${businessSlug} for client ${req.clientId}`);

    // Check if slug already exists
    const [existing] = await sequelize.query(
      'SELECT id FROM storefront_businesses WHERE business_slug = :slug',
      {
        replacements: { slug: businessSlug },
        type: QueryTypes.SELECT
      }
    );

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Business slug already taken'
      });
    }

    // Get client's subscription plan
    const [client] = await sequelize.query(
      'SELECT subscription_plan FROM ordergopro_clients WHERE id = :id',
      {
        replacements: { id: req.clientId },
        type: QueryTypes.SELECT
      }
    );

    const plan = subscriptionPlan || client?.subscription_plan || 'essential';

    let result;

    // Choose creation method based on whether they have a website
    if (websiteUrl) {
      // AUTONOMOUS: Import from website with AI
      result = await createStorefrontFromWebsite({
        clientId: req.clientId,
        businessName,
        businessSlug,
        businessType,
        websiteUrl,
        subscriptionPlan: plan
      });
    } else if (designBrief) {
      // AUTONOMOUS: Create from design brief with AI
      result = await createStorefrontFromDesignBrief({
        clientId: req.clientId,
        businessName,
        businessSlug,
        businessType,
        designBrief,
        subscriptionPlan: plan
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Must provide either websiteUrl or designBrief'
      });
    }

    logger.info(`[OrderGoPro] Storefront creation initiated: ${result.storefrontId}`);

    res.json(result);

  } catch (error) {
    logger.error('[OrderGoPro] Create storefront error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create storefront: ' + error.message
    });
  }
});

module.exports = router;
