'use strict';

/**
 * Fan Routes - TunjoRacing
 * Handles fan signup, engagement, and CRM
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');

let models;
try {
  models = require('../../models');
} catch (e) {
  console.log('TunjoRacing: Models not loaded yet');
  models = {};
}

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
