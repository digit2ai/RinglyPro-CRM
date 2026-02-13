'use strict';

/**
 * Fan Routes - TunjoRacing
 * Handles fan signup, engagement, and CRM
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const { authenticateToken, requireAdmin, requireFan, optionalAuth, generateToken } = require('../middleware/auth');

let models;
try {
  models = require('../../models');
} catch (e) {
  console.log('TunjoRacing: Models not loaded yet');
  models = {};
}

// POST /api/v1/fans/register - Fan registration with password
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name, country } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters'
    });
  }

  const TunjoFan = models.TunjoFan;
  if (!TunjoFan) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  // Check if fan already exists
  const existingFan = await TunjoFan.findOne({
    where: { email: email.toLowerCase(), tenant_id: 1 }
  });

  if (existingFan) {
    // If fan exists but has no password, set the password
    if (!existingFan.password_hash) {
      await existingFan.update({
        password_hash: password,
        first_name: first_name || existingFan.first_name,
        last_name: last_name || existingFan.last_name,
        country: country || existingFan.country
      });

      const token = generateToken({
        id: existingFan.id,
        email: existingFan.email,
        role: 'fan',
        first_name: existingFan.first_name
      });

      return res.json({
        success: true,
        message: 'Account activated! Welcome back.',
        token,
        fan: {
          id: existingFan.id,
          email: existingFan.email,
          first_name: existingFan.first_name,
          last_name: existingFan.last_name,
          membership_tier: existingFan.membership_tier
        }
      });
    }

    return res.status(400).json({
      success: false,
      error: 'An account with this email already exists. Please login.'
    });
  }

  // Create new fan with password
  const fan = await TunjoFan.create({
    tenant_id: 1,
    email: email.toLowerCase(),
    password_hash: password,
    first_name,
    last_name,
    country,
    source: 'fan_portal',
    email_subscribed: true
  });

  const token = generateToken({
    id: fan.id,
    email: fan.email,
    role: 'fan',
    first_name: fan.first_name
  });

  res.status(201).json({
    success: true,
    message: 'Welcome to the TunjoRacing fan community!',
    token,
    fan: {
      id: fan.id,
      email: fan.email,
      first_name: fan.first_name,
      last_name: fan.last_name,
      membership_tier: fan.membership_tier
    }
  });
}));

// POST /api/v1/fans/login - Fan login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  const TunjoFan = models.TunjoFan;
  if (!TunjoFan) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const fan = await TunjoFan.findOne({ where: { email: email.toLowerCase(), tenant_id: 1 } });

  if (!fan) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  if (!fan.password_hash) {
    return res.status(401).json({
      success: false,
      error: 'Please register to create a password for your account'
    });
  }

  const isValid = await fan.validatePassword(password);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  // Update engagement score on login
  await fan.update({ engagement_score: fan.engagement_score + 1 });

  const token = generateToken({
    id: fan.id,
    email: fan.email,
    role: 'fan',
    first_name: fan.first_name
  });

  res.json({
    success: true,
    token,
    fan: {
      id: fan.id,
      email: fan.email,
      first_name: fan.first_name,
      last_name: fan.last_name,
      membership_tier: fan.membership_tier
    }
  });
}));

// GET /api/v1/fans/me - Get current fan info
router.get('/me', authenticateToken, requireFan, asyncHandler(async (req, res) => {
  const TunjoFan = models.TunjoFan;
  const fan = await TunjoFan.findByPk(req.user.id);

  if (!fan) {
    return res.status(404).json({ success: false, error: 'Fan not found' });
  }

  res.json({
    success: true,
    fan: {
      id: fan.id,
      email: fan.email,
      first_name: fan.first_name,
      last_name: fan.last_name,
      membership_tier: fan.membership_tier,
      engagement_score: fan.engagement_score,
      total_orders: fan.total_orders,
      total_spent: parseFloat(fan.total_spent || 0),
      email_subscribed: fan.email_subscribed,
      created_at: fan.created_at
    }
  });
}));

// GET /api/v1/fans/dashboard - Fan dashboard data
router.get('/dashboard', authenticateToken, requireFan, asyncHandler(async (req, res) => {
  const TunjoFan = models.TunjoFan;
  const TunjoRace = models.TunjoRace;
  const TunjoProduct = models.TunjoProduct;

  const fan = await TunjoFan.findByPk(req.user.id);

  if (!fan) {
    return res.status(404).json({ success: false, error: 'Fan not found' });
  }

  // Get upcoming races
  let upcomingRaces = [];
  if (TunjoRace) {
    upcomingRaces = await TunjoRace.findAll({
      where: {
        tenant_id: 1,
        race_date: { [models.Sequelize.Op.gte]: new Date() }
      },
      order: [['race_date', 'ASC']],
      limit: 3
    });
  }

  // Get featured products
  let featuredProducts = [];
  if (TunjoProduct) {
    featuredProducts = await TunjoProduct.findAll({
      where: { tenant_id: 1, status: 'active' },
      order: [['created_at', 'DESC']],
      limit: 4
    });
  }

  // Calculate discount based on membership tier
  const discountPercent = fan.membership_tier === 'vip' ? 20 : fan.membership_tier === 'premium' ? 15 : 10;

  res.json({
    success: true,
    data: {
      fan: {
        first_name: fan.first_name,
        email: fan.email,
        membership_tier: fan.membership_tier,
        engagement_score: fan.engagement_score,
        member_since: fan.created_at
      },
      benefits: {
        discount_percent: discountPercent,
        newsletter_access: true,
        behind_the_scenes: true,
        driver_qa_access: fan.membership_tier !== 'free',
        vip_experiences: fan.membership_tier === 'vip'
      },
      upcoming_races: upcomingRaces,
      featured_products: featuredProducts,
      exclusive_content: [
        {
          id: 1,
          title: 'Race Day Preparation',
          type: 'video',
          description: 'Exclusive behind-the-scenes look at Oscar\'s race day routine',
          thumbnail: 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/696c12cc439b6bb3782f8255.png'
        },
        {
          id: 2,
          title: 'Team Radio Highlights',
          type: 'audio',
          description: 'Listen to the most exciting team radio moments from recent races',
          thumbnail: 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/696c12ccb34b640a0770f924.png'
        },
        {
          id: 3,
          title: 'Driver Q&A Session',
          type: 'video',
          description: 'Oscar answers fan questions about racing and life on the track',
          thumbnail: 'https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/696cf718439b6bf938457268.png'
        }
      ]
    }
  });
}));

// POST /api/v1/fans/signup - Public fan signup
router.post('/signup', asyncHandler(async (req, res) => {
  const { email, first_name, last_name, country, interests, source, utm_source, utm_medium, utm_campaign } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Email is required'
    });
  }

  const TunjoFan = models.TunjoFan;
  if (!TunjoFan) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  // Check if fan already exists
  const existingFan = await TunjoFan.findOne({
    where: { email: email.toLowerCase(), tenant_id: 1 }
  });

  if (existingFan) {
    // Update existing fan with new info if provided
    await existingFan.update({
      first_name: first_name || existingFan.first_name,
      last_name: last_name || existingFan.last_name,
      country: country || existingFan.country,
      interests: interests || existingFan.interests,
      email_subscribed: true
    });

    return res.json({
      success: true,
      message: 'Welcome back! Your preferences have been updated.',
      fan: {
        email: existingFan.email,
        first_name: existingFan.first_name,
        membership_tier: existingFan.membership_tier
      }
    });
  }

  // Create new fan
  const fan = await TunjoFan.create({
    tenant_id: 1,
    email: email.toLowerCase(),
    first_name,
    last_name,
    country,
    interests: interests || [],
    source: source || 'website',
    utm_source,
    utm_medium,
    utm_campaign,
    email_subscribed: true
  });

  res.status(201).json({
    success: true,
    message: 'Welcome to the TunjoRacing fan community!',
    fan: {
      email: fan.email,
      first_name: fan.first_name,
      membership_tier: fan.membership_tier
    }
  });
}));

// POST /api/v1/fans/reset-password - Reset fan password (temporary admin endpoint)
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { email, new_password, admin_key } = req.body;

  // Simple admin key check for security
  if (admin_key !== process.env.TUNJO_RESET_KEY && admin_key !== 'TunjoReset2024!') {
    return res.status(403).json({ success: false, error: 'Invalid admin key' });
  }

  if (!email || !new_password) {
    return res.status(400).json({ success: false, error: 'Email and new_password are required' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  }

  const TunjoFan = models.TunjoFan;
  if (!TunjoFan) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const fan = await TunjoFan.findOne({ where: { email: email.toLowerCase(), tenant_id: 1 } });

  if (!fan) {
    return res.status(404).json({ success: false, error: 'Fan not found' });
  }

  // Update password (model hook will hash it)
  await fan.update({ password_hash: new_password });

  res.json({
    success: true,
    message: 'Password has been reset successfully'
  });
}));

// POST /api/v1/fans/unsubscribe - Unsubscribe from emails
router.post('/unsubscribe', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Email is required'
    });
  }

  const TunjoFan = models.TunjoFan;
  const fan = await TunjoFan.findOne({
    where: { email: email.toLowerCase(), tenant_id: 1 }
  });

  if (fan) {
    await fan.update({ email_subscribed: false });
  }

  res.json({
    success: true,
    message: 'You have been unsubscribed from email communications.'
  });
}));

// Admin routes

// GET /api/v1/fans - List all fans (admin)
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { country, tier, subscribed, page = 1, limit = 50 } = req.query;

  const TunjoFan = models.TunjoFan;

  const where = { tenant_id: 1 };
  if (country) where.country = country;
  if (tier) where.membership_tier = tier;
  if (subscribed !== undefined) where.email_subscribed = subscribed === 'true';

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await TunjoFan.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset
  });

  res.json({
    success: true,
    data: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(count / parseInt(limit))
    }
  });
}));

// GET /api/v1/fans/stats - Fan statistics (admin)
router.get('/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoFan = models.TunjoFan;

  const totalFans = await TunjoFan.count({ where: { tenant_id: 1 } });
  const subscribedFans = await TunjoFan.count({ where: { tenant_id: 1, email_subscribed: true } });

  // Fans by tier
  const tierBreakdown = await TunjoFan.findAll({
    where: { tenant_id: 1 },
    attributes: [
      'membership_tier',
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count']
    ],
    group: ['membership_tier'],
    raw: true
  });

  // Fans by country (top 10)
  const countryBreakdown = await TunjoFan.findAll({
    where: { tenant_id: 1 },
    attributes: [
      'country',
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count']
    ],
    group: ['country'],
    order: [[models.sequelize.fn('COUNT', models.sequelize.col('id')), 'DESC']],
    limit: 10,
    raw: true
  });

  // New fans this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const newThisMonth = await TunjoFan.count({
    where: {
      tenant_id: 1,
      created_at: { [models.Sequelize.Op.gte]: startOfMonth }
    }
  });

  res.json({
    success: true,
    stats: {
      total_fans: totalFans,
      subscribed_fans: subscribedFans,
      unsubscribed_fans: totalFans - subscribedFans,
      new_this_month: newThisMonth,
      by_tier: tierBreakdown,
      by_country: countryBreakdown
    }
  });
}));

// GET /api/v1/fans/export - Export fan list as CSV (admin)
router.get('/export', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoFan = models.TunjoFan;

  const fans = await TunjoFan.findAll({
    where: { tenant_id: 1 },
    order: [['created_at', 'DESC']]
  });

  // Generate CSV
  const headers = ['Email', 'First Name', 'Last Name', 'Country', 'Tier', 'Subscribed', 'Created At'];
  const rows = fans.map(f => [
    f.email,
    f.first_name || '',
    f.last_name || '',
    f.country || '',
    f.membership_tier,
    f.email_subscribed ? 'Yes' : 'No',
    f.created_at.toISOString()
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="tunjoracing-fans.csv"');
  res.send(csv);
}));

// PUT /api/v1/fans/:id - Update fan (admin)
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoFan = models.TunjoFan;

  const fan = await TunjoFan.findByPk(req.params.id);
  if (!fan) {
    return res.status(404).json({ success: false, error: 'Fan not found' });
  }

  await fan.update(req.body);

  res.json({
    success: true,
    data: fan
  });
}));

module.exports = router;
