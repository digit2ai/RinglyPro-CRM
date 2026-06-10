'use strict';

/**
 * AgroMercado — Phase 2: Categories + product directory (JSONB metadata, GIN).
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const { Product } = require('../models');
const { CATEGORIES, CATEGORY_BY_ID, VE_STATES } = require('../categories');
const { tenantId, requireVerifiedProducer } = require('../middleware/auth');

// GET /categories — the 8 categories with attributes + live DB counts
router.get('/categories', async (req, res) => {
  try {
    const tid = tenantId(req);
    const rows = await Product.findAll({
      where: { tenant_id: tid, status: 'active' },
      attributes: ['category_id', [Product.sequelize.fn('COUNT', Product.sequelize.col('id')), 'count']],
      group: ['category_id'], raw: true
    });
    const counts = Object.fromEntries(rows.map(r => [r.category_id, Number(r.count)]));
    res.json({ success: true, categories: CATEGORIES.map(c => ({ ...c, count: counts[c.id] || 0 })), states: VE_STATES });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /products?category_id=&state=&q=&limit=
router.get('/', async (req, res) => {
  try {
    const tid = tenantId(req);
    const { category_id, state, q } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const where = { tenant_id: tid, status: 'active' };
    if (category_id) where.category_id = category_id;
    if (state) where.location_state = state;
    if (q) where.title = { [Op.iLike]: `%${q}%` };
    const products = await Product.findAll({ where, order: [['created_at', 'DESC']], limit });
    res.json({ success: true, count: products.length, products });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /products/:id
router.get('/:id', async (req, res) => {
  try {
    const tid = tenantId(req);
    const product = await Product.findOne({ where: { id: req.params.id, tenant_id: tid } });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ success: true, product });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /products  (producer + verified, or admin)
router.post('/', requireVerifiedProducer, async (req, res) => {
  try {
    const tid = tenantId(req);
    const { title, category_id, price_usd, location_state, condition, metadata } = req.body;
    if (!title || !category_id || price_usd == null || !location_state) {
      return res.status(400).json({ error: 'title, category_id, price_usd y location_state son requeridos' });
    }
    if (!CATEGORY_BY_ID[category_id]) return res.status(400).json({ error: 'category_id inválido' });
    if (!VE_STATES.includes(location_state)) return res.status(400).json({ error: 'location_state inválido' });
    const product = await Product.create({
      tenant_id: tid, title, category_id, price_usd, location_state,
      condition: condition || 'usado', metadata: metadata || {}, vendor_id: req.amUser.id
    });
    res.status(201).json({ success: true, product });
  } catch (e) {
    console.error('AgroMercado product create error:', e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /products/:id  (owner producer or admin)
router.patch('/:id', requireVerifiedProducer, async (req, res) => {
  try {
    const tid = tenantId(req);
    const product = await Product.findOne({ where: { id: req.params.id, tenant_id: tid } });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    if (req.amUser.role !== 'admin' && product.vendor_id !== req.amUser.id) {
      return res.status(403).json({ error: 'No es el propietario del producto' });
    }
    const { title, price_usd, location_state, condition, metadata, status } = req.body;
    Object.assign(product, {
      ...(title != null && { title }),
      ...(price_usd != null && { price_usd }),
      ...(location_state != null && { location_state }),
      ...(condition != null && { condition }),
      ...(metadata != null && { metadata }),
      ...(status != null && { status })
    });
    await product.save();
    res.json({ success: true, product });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
