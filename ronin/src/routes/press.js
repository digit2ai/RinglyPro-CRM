'use strict';

const express = require('express');
const router = express.Router();

let models;
try { models = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }

// GET / - List published press releases
router.get('/', async (req, res) => {
  try {
    const { category, featured, page = 1, limit = 10, status = 'published' } = req.query;
    const where = { tenant_id: 1, status };
    if (category) where.category = category;
    if (featured === 'true') where.featured = true;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await models.RoninPressRelease.findAndCountAll({
      where,
      order: [['published_at', 'DESC'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:slug - Get press release by slug
router.get('/:slug', async (req, res) => {
  try {
    const pr = await models.RoninPressRelease.findOne({
      where: { tenant_id: 1, slug: req.params.slug }
    });
    if (!pr) return res.status(404).json({ success: false, error: 'Press release not found' });
    res.json({ success: true, data: pr });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create press release (admin)
router.post('/', async (req, res) => {
  try {
    const data = { ...req.body, tenant_id: 1 };
    if (data.status === 'published' && !data.published_at) {
      data.published_at = new Date();
    }
    const pr = await models.RoninPressRelease.create(data);
    res.status(201).json({ success: true, data: pr });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update press release
router.put('/:id', async (req, res) => {
  try {
    const pr = await models.RoninPressRelease.findOne({ where: { id: req.params.id, tenant_id: 1 } });
    if (!pr) return res.status(404).json({ success: false, error: 'Press release not found' });
    if (req.body.status === 'published' && !pr.published_at) {
      req.body.published_at = new Date();
    }
    await pr.update(req.body);
    res.json({ success: true, data: pr });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Archive press release
router.delete('/:id', async (req, res) => {
  try {
    await models.RoninPressRelease.update({ status: 'archived' }, { where: { id: req.params.id, tenant_id: 1 } });
    res.json({ success: true, message: 'Press release archived' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
