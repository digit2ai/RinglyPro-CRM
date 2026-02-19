'use strict';

const express = require('express');
const router = express.Router();
const { authenticateMember, optionalAuth } = require('../middleware/auth');

let models;
try { models = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }

// GET / - List orders (admin or member's own)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = { tenant_id: 1 };
    if (req.memberId) where.member_id = req.memberId;
    if (status) where.status = status;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await models.RoninOrder.findAndCountAll({
      where,
      include: [
        { model: models.RoninOrderItem, as: 'items' },
        { model: models.RoninMember, as: 'member', attributes: ['id', 'first_name', 'last_name', 'email'] }
      ],
      order: [['created_at', 'DESC']],
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

// GET /:orderNumber - Get order by number
router.get('/:orderNumber', async (req, res) => {
  try {
    const order = await models.RoninOrder.findOne({
      where: { order_number: req.params.orderNumber, tenant_id: 1 },
      include: [
        { model: models.RoninOrderItem, as: 'items', include: [{ model: models.RoninProduct, as: 'product' }] },
        { model: models.RoninMember, as: 'member', attributes: ['id', 'first_name', 'last_name', 'email'] }
      ]
    });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create order (checkout)
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { customer_email, customer_name, customer_phone, shipping_address, shipping_method, items, payment_method } = req.body;

    if (!customer_email || !customer_name || !items || !items.length) {
      return res.status(400).json({ success: false, error: 'customer_email, customer_name, and items are required' });
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await models.RoninProduct.findOne({ where: { id: item.product_id, tenant_id: 1 } });
      if (!product) continue;

      let price = parseFloat(product.price);
      let variantName = null;
      if (item.variant_id) {
        const variant = await models.RoninProductVariant.findByPk(item.variant_id);
        if (variant && variant.price) price = parseFloat(variant.price);
        if (variant) variantName = variant.name;
      }

      const totalPrice = price * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        product_id: product.id,
        variant_id: item.variant_id || null,
        product_name: product.name,
        variant_name: variantName,
        sku: product.sku,
        quantity: item.quantity,
        unit_price: price,
        total_price: totalPrice,
        tenant_id: 1
      });
    }

    const shipping_cost = parseFloat(req.body.shipping_cost || 0);
    const tax = parseFloat((subtotal * 0.08).toFixed(2));
    const total = parseFloat((subtotal + tax + shipping_cost).toFixed(2));

    const order = await models.RoninOrder.create({
      tenant_id: 1,
      member_id: req.memberId || null,
      customer_email,
      customer_name,
      customer_phone,
      shipping_address,
      shipping_method,
      shipping_cost,
      subtotal,
      tax,
      total,
      payment_method,
      payment_status: 'pending'
    });

    for (const item of orderItems) {
      await models.RoninOrderItem.create({ ...item, order_id: order.id });
    }

    // Clear cart if member
    if (req.memberId) {
      await models.RoninCartItem.destroy({ where: { member_id: req.memberId, tenant_id: 1 } });
    }

    // Update product sold counts
    for (const item of orderItems) {
      await models.RoninProduct.increment('total_sold', { by: item.quantity, where: { id: item.product_id } });
    }

    const fullOrder = await models.RoninOrder.findByPk(order.id, {
      include: [{ model: models.RoninOrderItem, as: 'items' }]
    });

    res.status(201).json({ success: true, data: fullOrder });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id/status - Update order status (admin)
router.put('/:id/status', async (req, res) => {
  try {
    const { status, tracking_number } = req.body;
    const updates = {};
    if (status) updates.status = status;
    if (tracking_number) updates.tracking_number = tracking_number;

    await models.RoninOrder.update(updates, { where: { id: req.params.id, tenant_id: 1 } });
    res.json({ success: true, message: 'Order updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /stats/summary - Order stats
router.get('/stats/summary', async (req, res) => {
  try {
    const [totalOrders, totalRevenue, recentOrders] = await Promise.all([
      models.RoninOrder.count({ where: { tenant_id: 1 } }),
      models.RoninOrder.sum('total', { where: { tenant_id: 1, payment_status: 'paid' } }),
      models.RoninOrder.findAll({
        where: { tenant_id: 1 },
        order: [['created_at', 'DESC']],
        limit: 5,
        include: [{ model: models.RoninOrderItem, as: 'items' }]
      })
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        totalRevenue: totalRevenue || 0,
        recentOrders
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
