'use strict';

/**
 * Sponsor Routes - TunjoRacing
 * Handles sponsor authentication and dashboard data
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const { authenticateToken, requireSponsor, requireAdmin, generateToken } = require('../middleware/auth');

let models;
try {
  models = require('../../models');
} catch (e) {
  console.log('TunjoRacing: Models not loaded yet');
  models = {};
}

// POST /api/v1/sponsors/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  const TunjoSponsor = models.TunjoSponsor;
  if (!TunjoSponsor) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const sponsor = await TunjoSponsor.findOne({ where: { email: email.toLowerCase() } });

  if (!sponsor) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  const isValid = await sponsor.validatePassword(password);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  // Update last login
  await sponsor.update({ last_login_at: new Date() });

  // Generate token
  const token = generateToken({
    id: sponsor.id,
    email: sponsor.email,
    role: 'sponsor',
    company_name: sponsor.company_name
  });

  res.json({
    success: true,
    token,
    sponsor: {
      id: sponsor.id,
      company_name: sponsor.company_name,
      contact_name: sponsor.contact_name,
      email: sponsor.email,
      sponsorship_level: sponsor.sponsorship_level
    }
  });
}));

// GET /api/v1/sponsors/dashboard
router.get('/dashboard', authenticateToken, requireSponsor, asyncHandler(async (req, res) => {
  const sponsorId = req.user.id;
  const TunjoSponsor = models.TunjoSponsor;
  const TunjoMediaContent = models.TunjoMediaContent;

  const sponsor = await TunjoSponsor.findByPk(sponsorId);
  if (!sponsor) {
    return res.status(404).json({ success: false, error: 'Sponsor not found' });
  }

  // Get media metrics for this sponsor
  const mediaStats = await TunjoMediaContent.findAll({
    where: { sponsor_id: sponsorId },
    attributes: [
      [models.sequelize.fn('SUM', models.sequelize.col('reach')), 'total_reach'],
      [models.sequelize.fn('SUM', models.sequelize.col('engagement')), 'total_engagement'],
      [models.sequelize.fn('SUM', models.sequelize.col('impressions')), 'total_impressions'],
      [models.sequelize.fn('SUM', models.sequelize.col('estimated_media_value')), 'total_media_value'],
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'content_count']
    ],
    raw: true
  });

  // Get recent media content
  const recentMedia = await TunjoMediaContent.findAll({
    where: { sponsor_id: sponsorId },
    order: [['published_at', 'DESC']],
    limit: 10
  });

  res.json({
    success: true,
    data: {
      sponsor: {
        company_name: sponsor.company_name,
        sponsorship_level: sponsor.sponsorship_level,
        contract_start_date: sponsor.contract_start_date,
        contract_end_date: sponsor.contract_end_date
      },
      metrics: {
        total_exposure: parseInt(mediaStats[0]?.total_reach || 0),
        total_engagements: parseInt(mediaStats[0]?.total_engagement || 0),
        total_impressions: parseInt(mediaStats[0]?.total_impressions || 0),
        estimated_media_value: parseFloat(mediaStats[0]?.total_media_value || 0),
        content_pieces: parseInt(mediaStats[0]?.content_count || 0)
      },
      recent_content: recentMedia
    }
  });
}));

// GET /api/v1/sponsors/content
router.get('/content', authenticateToken, requireSponsor, asyncHandler(async (req, res) => {
  const sponsorId = req.user.id;
  const { platform, content_type, page = 1, limit = 20 } = req.query;

  const TunjoMediaContent = models.TunjoMediaContent;

  const where = { sponsor_id: sponsorId };
  if (platform) where.platform = platform;
  if (content_type) where.content_type = content_type;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await TunjoMediaContent.findAndCountAll({
    where,
    order: [['published_at', 'DESC']],
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

// GET /api/v1/sponsors/reports (downloadable reports)
router.get('/reports', authenticateToken, requireSponsor, asyncHandler(async (req, res) => {
  const sponsorId = req.user.id;

  // For MVP, return JSON data that can be rendered as PDF on frontend
  const TunjoMediaContent = models.TunjoMediaContent;
  const TunjoSponsor = models.TunjoSponsor;

  const sponsor = await TunjoSponsor.findByPk(sponsorId);

  // Get monthly breakdown
  const monthlyStats = await TunjoMediaContent.findAll({
    where: { sponsor_id: sponsorId },
    attributes: [
      [models.sequelize.fn('DATE_TRUNC', 'month', models.sequelize.col('published_at')), 'month'],
      [models.sequelize.fn('SUM', models.sequelize.col('reach')), 'reach'],
      [models.sequelize.fn('SUM', models.sequelize.col('engagement')), 'engagement'],
      [models.sequelize.fn('SUM', models.sequelize.col('estimated_media_value')), 'media_value'],
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'content_count']
    ],
    group: [models.sequelize.fn('DATE_TRUNC', 'month', models.sequelize.col('published_at'))],
    order: [[models.sequelize.fn('DATE_TRUNC', 'month', models.sequelize.col('published_at')), 'DESC']],
    raw: true
  });

  res.json({
    success: true,
    report: {
      sponsor: {
        company_name: sponsor.company_name,
        sponsorship_level: sponsor.sponsorship_level
      },
      generated_at: new Date().toISOString(),
      monthly_breakdown: monthlyStats
    }
  });
}));

// Admin routes for managing sponsors

// GET /api/v1/sponsors (admin only - list all sponsors)
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { status, level, page = 1, limit = 20 } = req.query;
  const TunjoSponsor = models.TunjoSponsor;

  const where = { tenant_id: 1 };
  if (status) where.status = status;
  if (level) where.sponsorship_level = level;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await TunjoSponsor.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset,
    attributes: { exclude: ['password_hash'] }
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

// POST /api/v1/sponsors (admin only - create sponsor)
router.post('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoSponsor = models.TunjoSponsor;

  const sponsor = await TunjoSponsor.create({
    ...req.body,
    tenant_id: 1
  });

  res.status(201).json({
    success: true,
    data: {
      ...sponsor.toJSON(),
      password_hash: undefined
    }
  });
}));

// PUT /api/v1/sponsors/:id (admin only)
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoSponsor = models.TunjoSponsor;

  const sponsor = await TunjoSponsor.findByPk(req.params.id);
  if (!sponsor) {
    return res.status(404).json({ success: false, error: 'Sponsor not found' });
  }

  await sponsor.update(req.body);

  res.json({
    success: true,
    data: {
      ...sponsor.toJSON(),
      password_hash: undefined
    }
  });
}));

module.exports = router;
