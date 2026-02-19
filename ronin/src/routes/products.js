'use strict';

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');

let models;
try { models = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }

// GET / - List products (public)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, featured, status = 'active', sort = 'sort_order' } = req.query;
    const where = { tenant_id: 1, status };
    if (category) where.category = category;
    if (featured === 'true') where.featured = true;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const order = sort === 'price_asc' ? [['price', 'ASC']]
      : sort === 'price_desc' ? [['price', 'DESC']]
      : sort === 'newest' ? [['created_at', 'DESC']]
      : sort === 'bestselling' ? [['total_sold', 'DESC']]
      : [['sort_order', 'ASC']];

    const { count, rows } = await models.RoninProduct.findAndCountAll({
      where,
      include: [{ model: models.RoninProductVariant, as: 'variants' }],
      order,
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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /categories - List product categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await models.RoninProduct.findAll({
      where: { tenant_id: 1, status: 'active' },
      attributes: ['category', [models.sequelize.fn('COUNT', '*'), 'count']],
      group: ['category'],
      order: [['category', 'ASC']],
      raw: true
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:slug - Get product by slug
router.get('/:slug', async (req, res) => {
  try {
    const product = await models.RoninProduct.findOne({
      where: { tenant_id: 1, slug: req.params.slug },
      include: [{ model: models.RoninProductVariant, as: 'variants', order: [['sort_order', 'ASC']] }]
    });
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create product (admin)
router.post('/', async (req, res) => {
  try {
    const product = await models.RoninProduct.create({ ...req.body, tenant_id: 1 });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update product (admin)
router.put('/:id', async (req, res) => {
  try {
    const product = await models.RoninProduct.findOne({ where: { id: req.params.id, tenant_id: 1 } });
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    await product.update(req.body);
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Archive product (admin)
router.delete('/:id', async (req, res) => {
  try {
    await models.RoninProduct.update(
      { status: 'archived' },
      { where: { id: req.params.id, tenant_id: 1 } }
    );
    res.json({ success: true, message: 'Product archived' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
