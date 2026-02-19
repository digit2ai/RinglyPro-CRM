'use strict';

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');

let models;
try { models = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }

// GET / - Get cart items
router.get('/', optionalAuth, async (req, res) => {
  try {
    const where = { tenant_id: 1 };
    if (req.memberId) {
      where.member_id = req.memberId;
    } else {
      const sessionId = req.query.session_id || req.headers['x-session-id'];
      if (!sessionId) return res.json({ success: true, data: [], total: 0 });
      where.session_id = sessionId;
    }

    const items = await models.RoninCartItem.findAll({
      where,
      include: [
        { model: models.RoninProduct, as: 'product' },
        { model: models.RoninProductVariant, as: 'variant' }
      ]
    });

    const total = items.reduce((sum, item) => {
      const price = item.variant?.price || item.product?.price || 0;
      return sum + (parseFloat(price) * item.quantity);
    }, 0);

    res.json({ success: true, data: items, total: parseFloat(total.toFixed(2)), count: items.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Add to cart
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { product_id, variant_id, quantity = 1, session_id } = req.body;
    if (!product_id) return res.status(400).json({ success: false, error: 'product_id required' });

    const product = await models.RoninProduct.findOne({ where: { id: product_id, tenant_id: 1, status: 'active' } });
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const where = { tenant_id: 1, product_id, variant_id: variant_id || null };
    if (req.memberId) {
      where.member_id = req.memberId;
    } else {
      where.session_id = session_id || req.headers['x-session-id'];
    }

    const existing = await models.RoninCartItem.findOne({ where });
    if (existing) {
      await existing.update({ quantity: existing.quantity + parseInt(quantity) });
      res.json({ success: true, data: existing, message: 'Cart updated' });
    } else {
      const item = await models.RoninCartItem.create({
        ...where,
        quantity: parseInt(quantity)
      });
      res.status(201).json({ success: true, data: item, message: 'Added to cart' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update cart item quantity
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) return res.status(400).json({ success: false, error: 'Valid quantity required' });

    await models.RoninCartItem.update(
      { quantity: parseInt(quantity) },
      { where: { id: req.params.id, tenant_id: 1 } }
    );
    res.json({ success: true, message: 'Cart item updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Remove from cart
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    await models.RoninCartItem.destroy({ where: { id: req.params.id, tenant_id: 1 } });
    res.json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
