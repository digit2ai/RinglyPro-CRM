'use strict';

/**
 * Media Routes - TunjoRacing
 * Handles media content and analytics
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

// GET /api/v1/media - List media content (admin)
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { platform, content_type, sponsor_id, page = 1, limit = 20 } = req.query;

  const TunjoMediaContent = models.TunjoMediaContent;
  const TunjoSponsor = models.TunjoSponsor;

  const where = { tenant_id: 1 };
  if (platform) where.platform = platform;
  if (content_type) where.content_type = content_type;
  if (sponsor_id) where.sponsor_id = sponsor_id;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await TunjoMediaContent.findAndCountAll({
    where,
    include: [
      { model: TunjoSponsor, as: 'sponsor', attributes: ['id', 'company_name', 'logo_url'] }
    ],
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

// GET /api/v1/media/analytics - Overall analytics (admin)
router.get('/analytics', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaContent = models.TunjoMediaContent;

  // Overall totals
  const totals = await TunjoMediaContent.findOne({
    where: { tenant_id: 1 },
    attributes: [
      [models.sequelize.fn('SUM', models.sequelize.col('reach')), 'total_reach'],
      [models.sequelize.fn('SUM', models.sequelize.col('impressions')), 'total_impressions'],
      [models.sequelize.fn('SUM', models.sequelize.col('engagement')), 'total_engagement'],
      [models.sequelize.fn('SUM', models.sequelize.col('video_views')), 'total_video_views'],
      [models.sequelize.fn('SUM', models.sequelize.col('estimated_media_value')), 'total_media_value'],
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'total_content']
    ],
    raw: true
  });

  // By platform
  const byPlatform = await TunjoMediaContent.findAll({
    where: { tenant_id: 1 },
    attributes: [
      'platform',
      [models.sequelize.fn('SUM', models.sequelize.col('reach')), 'reach'],
      [models.sequelize.fn('SUM', models.sequelize.col('engagement')), 'engagement'],
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'content_count']
    ],
    group: ['platform'],
    raw: true
  });

  // By content type
  const byContentType = await TunjoMediaContent.findAll({
    where: { tenant_id: 1 },
    attributes: [
      'content_type',
      [models.sequelize.fn('SUM', models.sequelize.col('reach')), 'reach'],
      [models.sequelize.fn('SUM', models.sequelize.col('engagement')), 'engagement'],
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'content_count']
    ],
    group: ['content_type'],
    raw: true
  });

  res.json({
    success: true,
    analytics: {
      totals: {
        reach: parseInt(totals?.total_reach || 0),
        impressions: parseInt(totals?.total_impressions || 0),
        engagement: parseInt(totals?.total_engagement || 0),
        video_views: parseInt(totals?.total_video_views || 0),
        media_value: parseFloat(totals?.total_media_value || 0),
        content_count: parseInt(totals?.total_content || 0)
      },
      by_platform: byPlatform,
      by_content_type: byContentType
    }
  });
}));

// POST /api/v1/media - Create media content (admin)
router.post('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaContent = models.TunjoMediaContent;

  const media = await TunjoMediaContent.create({
    ...req.body,
    tenant_id: 1
  });

  res.status(201).json({
    success: true,
    data: media
  });
}));

// PUT /api/v1/media/:id - Update media content (admin)
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaContent = models.TunjoMediaContent;

  const media = await TunjoMediaContent.findByPk(req.params.id);
  if (!media) {
    return res.status(404).json({ success: false, error: 'Media not found' });
  }

  await media.update(req.body);

  res.json({
    success: true,
    data: media
  });
}));

// DELETE /api/v1/media/:id - Archive media content (admin)
router.delete('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaContent = models.TunjoMediaContent;

  const media = await TunjoMediaContent.findByPk(req.params.id);
  if (!media) {
    return res.status(404).json({ success: false, error: 'Media not found' });
  }

  await media.update({ status: 'archived' });

  res.json({
    success: true,
    message: 'Media archived'
  });
}));

// POST /api/v1/media/:id/metrics - Update metrics (for external integrations)
router.post('/:id/metrics', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoMediaContent = models.TunjoMediaContent;

  const media = await TunjoMediaContent.findByPk(req.params.id);
  if (!media) {
    return res.status(404).json({ success: false, error: 'Media not found' });
  }

  const { reach, impressions, likes, comments, shares, video_views, clicks } = req.body;

  await media.update({
    reach: reach ?? media.reach,
    impressions: impressions ?? media.impressions,
    likes: likes ?? media.likes,
    comments: comments ?? media.comments,
    shares: shares ?? media.shares,
    video_views: video_views ?? media.video_views,
    clicks: clicks ?? media.clicks
  });

  res.json({
    success: true,
    data: media
  });
}));

module.exports = router;
