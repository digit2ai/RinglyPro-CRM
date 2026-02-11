'use strict';

/**
 * Sponsorship Deals Routes - TunjoRacing
 * Manages sponsorship packages and deal templates
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

// GET /api/v1/deals - List all deals (admin only)
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoSponsorshipDeal = models.TunjoSponsorshipDeal;
  const TunjoSponsor = models.TunjoSponsor;
  const { status, level, sponsor_id, page = 1, limit = 20 } = req.query;

  const where = { tenant_id: 1 };
  if (status) where.status = status;
  if (level) where.sponsorship_level = level;
  if (sponsor_id) where.sponsor_id = sponsor_id;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await TunjoSponsorshipDeal.findAndCountAll({
    where,
    include: [{ model: TunjoSponsor, as: 'sponsor', attributes: ['company_name', 'email'] }],
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

// GET /api/v1/deals/templates - Get deal templates (publicly visible for packages page)
router.get('/templates', asyncHandler(async (req, res) => {
  const TunjoSponsorshipDeal = models.TunjoSponsorshipDeal;

  const templates = await TunjoSponsorshipDeal.findAll({
    where: { tenant_id: 1, status: 'template' },
    order: [['sponsorship_level', 'ASC'], ['package_price', 'DESC']],
    attributes: [
      'id', 'deal_name', 'sponsorship_level', 'number_of_races',
      'logo_placements', 'content_campaigns', 'social_mentions',
      'vip_experiences', 'hospitality_passes', 'estimated_exposure',
      'estimated_media_value', 'package_price', 'contract_duration_months',
      'custom_inclusions'
    ]
  });

  res.json({
    success: true,
    data: templates
  });
}));

// POST /api/v1/deals - Create deal (admin only)
router.post('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoSponsorshipDeal = models.TunjoSponsorshipDeal;

  const deal = await TunjoSponsorshipDeal.create({
    ...req.body,
    tenant_id: 1
  });

  res.status(201).json({
    success: true,
    data: deal
  });
}));

// PUT /api/v1/deals/:id - Update deal (admin only)
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoSponsorshipDeal = models.TunjoSponsorshipDeal;

  const deal = await TunjoSponsorshipDeal.findByPk(req.params.id);
  if (!deal) {
    return res.status(404).json({ success: false, error: 'Deal not found' });
  }

  await deal.update(req.body);

  res.json({
    success: true,
    data: deal
  });
}));

// DELETE /api/v1/deals/:id - Delete deal (admin only)
router.delete('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoSponsorshipDeal = models.TunjoSponsorshipDeal;

  const deal = await TunjoSponsorshipDeal.findByPk(req.params.id);
  if (!deal) {
    return res.status(404).json({ success: false, error: 'Deal not found' });
  }

  await deal.destroy();

  res.json({
    success: true,
    message: 'Deal deleted'
  });
}));

// POST /api/v1/deals/:id/assign - Assign deal to sponsor (admin only)
router.post('/:id/assign', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoSponsorshipDeal = models.TunjoSponsorshipDeal;
  const TunjoSponsor = models.TunjoSponsor;

  const { sponsor_id } = req.body;
  if (!sponsor_id) {
    return res.status(400).json({ success: false, error: 'sponsor_id is required' });
  }

  const deal = await TunjoSponsorshipDeal.findByPk(req.params.id);
  if (!deal) {
    return res.status(404).json({ success: false, error: 'Deal not found' });
  }

  const sponsor = await TunjoSponsor.findByPk(sponsor_id);
  if (!sponsor) {
    return res.status(404).json({ success: false, error: 'Sponsor not found' });
  }

  await deal.update({
    sponsor_id,
    status: 'active'
  });

  // Update sponsor's total investment
  await sponsor.update({
    total_investment: parseFloat(sponsor.total_investment || 0) + parseFloat(deal.package_price)
  });

  res.json({
    success: true,
    data: deal,
    message: `Deal assigned to ${sponsor.company_name}`
  });
}));

module.exports = router;
