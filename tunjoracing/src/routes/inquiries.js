'use strict';

/**
 * Sponsor Inquiry Routes - TunjoRacing
 * Handles sponsorship inquiry form submissions
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

let models;
try {
  models = require('../../models');
} catch (e) {
  console.log('TunjoRacing: Models not loaded yet');
  models = {};
}

// POST /api/v1/inquiries - Submit sponsor inquiry (public)
router.post('/', asyncHandler(async (req, res) => {
  const {
    company_name,
    contact_name,
    email,
    phone,
    website,
    industry,
    company_size,
    interested_level,
    budget_range,
    message,
    how_found_us,
    utm_source,
    utm_medium,
    utm_campaign
  } = req.body;

  if (!company_name || !contact_name || !email) {
    return res.status(400).json({
      success: false,
      error: 'Company name, contact name, and email are required'
    });
  }

  const TunjoSponsorInquiry = models.TunjoSponsorInquiry;

  if (!TunjoSponsorInquiry) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const inquiry = await TunjoSponsorInquiry.create({
    tenant_id: 1,
    company_name,
    contact_name,
    email: email.toLowerCase(),
    phone,
    website,
    industry,
    company_size,
    interested_level,
    budget_range,
    message,
    how_found_us,
    utm_source,
    utm_medium,
    utm_campaign,
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  });

  // TODO: Send notification email to sales team
  // TODO: Send confirmation email to inquirer

  res.status(201).json({
    success: true,
    message: 'Thank you for your interest in TunjoRacing! Our team will be in touch shortly.',
    inquiry_id: inquiry.id
  });
}));

// Admin routes

// GET /api/v1/inquiries - List inquiries (admin)
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { status, level, page = 1, limit = 20 } = req.query;

  const TunjoSponsorInquiry = models.TunjoSponsorInquiry;

  const where = { tenant_id: 1 };
  if (status) where.status = status;
  if (level) where.interested_level = level;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await TunjoSponsorInquiry.findAndCountAll({
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

// GET /api/v1/inquiries/stats - Inquiry statistics (admin)
router.get('/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoSponsorInquiry = models.TunjoSponsorInquiry;

  const total = await TunjoSponsorInquiry.count({ where: { tenant_id: 1 } });

  const byStatus = await TunjoSponsorInquiry.findAll({
    where: { tenant_id: 1 },
    attributes: [
      'status',
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count']
    ],
    group: ['status'],
    raw: true
  });

  const byLevel = await TunjoSponsorInquiry.findAll({
    where: { tenant_id: 1 },
    attributes: [
      'interested_level',
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count']
    ],
    group: ['interested_level'],
    raw: true
  });

  // This month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const thisMonth = await TunjoSponsorInquiry.count({
    where: {
      tenant_id: 1,
      created_at: { [models.Sequelize.Op.gte]: startOfMonth }
    }
  });

  res.json({
    success: true,
    stats: {
      total,
      this_month: thisMonth,
      by_status: byStatus,
      by_level: byLevel
    }
  });
}));

// PUT /api/v1/inquiries/:id - Update inquiry (admin)
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoSponsorInquiry = models.TunjoSponsorInquiry;

  const inquiry = await TunjoSponsorInquiry.findByPk(req.params.id);
  if (!inquiry) {
    return res.status(404).json({ success: false, error: 'Inquiry not found' });
  }

  await inquiry.update(req.body);

  res.json({
    success: true,
    data: inquiry
  });
}));

// POST /api/v1/inquiries/:id/convert - Convert to sponsor (admin)
router.post('/:id/convert', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoSponsorInquiry = models.TunjoSponsorInquiry;
  const TunjoSponsor = models.TunjoSponsor;

  const inquiry = await TunjoSponsorInquiry.findByPk(req.params.id);
  if (!inquiry) {
    return res.status(404).json({ success: false, error: 'Inquiry not found' });
  }

  // Create sponsor from inquiry
  const sponsor = await TunjoSponsor.create({
    tenant_id: 1,
    company_name: inquiry.company_name,
    contact_name: inquiry.contact_name,
    email: inquiry.email,
    phone: inquiry.phone,
    sponsorship_level: inquiry.interested_level || 'supporting',
    status: 'pending',
    notes: `Converted from inquiry. Original message: ${inquiry.message || 'N/A'}`
  });

  // Update inquiry
  await inquiry.update({
    status: 'won',
    converted_to_sponsor_id: sponsor.id
  });

  res.json({
    success: true,
    message: 'Inquiry converted to sponsor',
    sponsor: {
      ...sponsor.toJSON(),
      password_hash: undefined
    }
  });
}));

module.exports = router;
