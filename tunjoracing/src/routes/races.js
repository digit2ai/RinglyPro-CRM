'use strict';

/**
 * Race Event Routes - TunjoRacing
 * Handles race calendar and event data
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

// GET /api/v1/races - Public race calendar
router.get('/', asyncHandler(async (req, res) => {
  const { year, status, series, page = 1, limit = 50 } = req.query;

  const TunjoRaceEvent = models.TunjoRaceEvent;

  if (!TunjoRaceEvent) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const where = { tenant_id: 1 };
  if (status) where.status = status;
  if (series) where.series = series;

  // Filter by year if provided
  if (year) {
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);
    where.start_date = {
      [models.Sequelize.Op.between]: [startDate, endDate]
    };
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await TunjoRaceEvent.findAndCountAll({
    where,
    order: [['start_date', 'ASC']],
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

// GET /api/v1/races/upcoming - Next upcoming races
router.get('/upcoming', asyncHandler(async (req, res) => {
  const { limit = 5 } = req.query;
  const TunjoRaceEvent = models.TunjoRaceEvent;

  const races = await TunjoRaceEvent.findAll({
    where: {
      tenant_id: 1,
      start_date: { [models.Sequelize.Op.gte]: new Date() },
      status: { [models.Sequelize.Op.in]: ['upcoming', 'in_progress'] }
    },
    order: [['start_date', 'ASC']],
    limit: parseInt(limit)
  });

  res.json({
    success: true,
    data: races
  });
}));

// GET /api/v1/races/stats - Season statistics
router.get('/stats', asyncHandler(async (req, res) => {
  const { year } = req.query;
  const TunjoRaceEvent = models.TunjoRaceEvent;

  const targetYear = year || new Date().getFullYear();
  const startDate = new Date(`${targetYear}-01-01`);
  const endDate = new Date(`${targetYear}-12-31`);

  const stats = await TunjoRaceEvent.findOne({
    where: {
      tenant_id: 1,
      start_date: { [models.Sequelize.Op.between]: [startDate, endDate] },
      status: 'completed'
    },
    attributes: [
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'total_races'],
      [models.sequelize.fn('SUM', models.sequelize.col('points_earned')), 'total_points'],
      [models.sequelize.fn('COUNT', models.sequelize.literal("CASE WHEN race1_position = 1 OR race2_position = 1 OR race3_position = 1 THEN 1 END")), 'wins'],
      [models.sequelize.fn('COUNT', models.sequelize.literal("CASE WHEN race1_position <= 3 OR race2_position <= 3 OR race3_position <= 3 THEN 1 END")), 'podiums'],
      [models.sequelize.fn('COUNT', models.sequelize.literal("CASE WHEN fastest_lap = true THEN 1 END")), 'fastest_laps']
    ],
    raw: true
  });

  res.json({
    success: true,
    year: targetYear,
    stats: {
      total_races: parseInt(stats?.total_races || 0),
      total_points: parseInt(stats?.total_points || 0),
      wins: parseInt(stats?.wins || 0),
      podiums: parseInt(stats?.podiums || 0),
      fastest_laps: parseInt(stats?.fastest_laps || 0)
    }
  });
}));

// GET /api/v1/races/:id - Single race detail
router.get('/:id', asyncHandler(async (req, res) => {
  const TunjoRaceEvent = models.TunjoRaceEvent;

  const race = await TunjoRaceEvent.findByPk(req.params.id);

  if (!race) {
    return res.status(404).json({
      success: false,
      error: 'Race not found'
    });
  }

  res.json({
    success: true,
    data: race
  });
}));

// Admin routes

// POST /api/v1/races - Create race event (admin)
router.post('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoRaceEvent = models.TunjoRaceEvent;

  const race = await TunjoRaceEvent.create({
    ...req.body,
    tenant_id: 1
  });

  res.status(201).json({
    success: true,
    data: race
  });
}));

// PUT /api/v1/races/:id - Update race event (admin)
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoRaceEvent = models.TunjoRaceEvent;

  const race = await TunjoRaceEvent.findByPk(req.params.id);
  if (!race) {
    return res.status(404).json({ success: false, error: 'Race not found' });
  }

  await race.update(req.body);

  res.json({
    success: true,
    data: race
  });
}));

// DELETE /api/v1/races/:id - Delete race event (admin)
router.delete('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoRaceEvent = models.TunjoRaceEvent;

  const race = await TunjoRaceEvent.findByPk(req.params.id);
  if (!race) {
    return res.status(404).json({ success: false, error: 'Race not found' });
  }

  await race.destroy();

  res.json({
    success: true,
    message: 'Race deleted'
  });
}));

module.exports = router;
