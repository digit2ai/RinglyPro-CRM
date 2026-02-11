'use strict';

/**
 * Order Routes - TunjoRacing Store
 * Handles order management and admin operations
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

// GET /api/v1/orders - List orders (admin)
router.get('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { payment_status, fulfillment_status, page = 1, limit = 20 } = req.query;

  const TunjoOrder = models.TunjoOrder;
  const TunjoOrderItem = models.TunjoOrderItem;

  const where = { tenant_id: 1 };
  if (payment_status) where.payment_status = payment_status;
  if (fulfillment_status) where.fulfillment_status = fulfillment_status;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { count, rows } = await TunjoOrder.findAndCountAll({
    where,
    include: [
      { model: TunjoOrderItem, as: 'items' }
    ],
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

// GET /api/v1/orders/stats - Order statistics (admin)
router.get('/stats', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoOrder = models.TunjoOrder;

  // Total orders and revenue
  const totals = await TunjoOrder.findOne({
    where: { tenant_id: 1, payment_status: 'paid' },
    attributes: [
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'total_orders'],
      [models.sequelize.fn('SUM', models.sequelize.col('total')), 'total_revenue']
    ],
    raw: true
  });

  // Orders by status
  const byStatus = await TunjoOrder.findAll({
    where: { tenant_id: 1 },
    attributes: [
      'fulfillment_status',
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count']
    ],
    group: ['fulfillment_status'],
    raw: true
  });

  // This month's orders
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const thisMonth = await TunjoOrder.findOne({
    where: {
      tenant_id: 1,
      payment_status: 'paid',
      created_at: { [models.Sequelize.Op.gte]: startOfMonth }
    },
    attributes: [
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'orders'],
      [models.sequelize.fn('SUM', models.sequelize.col('total')), 'revenue']
    ],
    raw: true
  });

  res.json({
    success: true,
    stats: {
      total_orders: parseInt(totals?.total_orders || 0),
      total_revenue: parseFloat(totals?.total_revenue || 0),
      orders_by_status: byStatus,
      this_month: {
        orders: parseInt(thisMonth?.orders || 0),
        revenue: parseFloat(thisMonth?.revenue || 0)
      }
    }
  });
}));

// GET /api/v1/orders/:orderNumber - Get single order
router.get('/:orderNumber', asyncHandler(async (req, res) => {
  const TunjoOrder = models.TunjoOrder;
  const TunjoOrderItem = models.TunjoOrderItem;

  const order = await TunjoOrder.findOne({
    where: { order_number: req.params.orderNumber, tenant_id: 1 },
    include: [
      { model: TunjoOrderItem, as: 'items' }
    ]
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'Order not found'
    });
  }

  res.json({
    success: true,
    data: order
  });
}));

// PUT /api/v1/orders/:id - Update order (admin)
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoOrder = models.TunjoOrder;

  const order = await TunjoOrder.findByPk(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  const { fulfillment_status, tracking_number, tracking_url, internal_notes, shipping_method } = req.body;

  const updates = {};
  if (fulfillment_status) {
    updates.fulfillment_status = fulfillment_status;
    if (fulfillment_status === 'fulfilled' && !order.shipped_at) {
      updates.shipped_at = new Date();
    }
  }
  if (tracking_number) updates.tracking_number = tracking_number;
  if (tracking_url) updates.tracking_url = tracking_url;
  if (internal_notes) updates.internal_notes = internal_notes;
  if (shipping_method) updates.shipping_method = shipping_method;

  await order.update(updates);

  res.json({
    success: true,
    data: order
  });
}));

// POST /api/v1/orders/:id/fulfill - Mark order as fulfilled (admin)
router.post('/:id/fulfill', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoOrder = models.TunjoOrder;
  const TunjoOrderItem = models.TunjoOrderItem;

  const order = await TunjoOrder.findByPk(req.params.id, {
    include: [{ model: TunjoOrderItem, as: 'items' }]
  });

  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  const { tracking_number, tracking_url, shipping_method } = req.body;

  await order.update({
    fulfillment_status: 'fulfilled',
    shipped_at: new Date(),
    tracking_number: tracking_number || order.tracking_number,
    tracking_url: tracking_url || order.tracking_url,
    shipping_method: shipping_method || order.shipping_method
  });

  // Update order items
  for (const item of order.items) {
    await item.update({ fulfilled_quantity: item.quantity });
  }

  // TODO: Send shipping notification email
  // await sendShippingNotificationEmail(order);

  res.json({
    success: true,
    message: 'Order marked as fulfilled',
    data: order
  });
}));

// POST /api/v1/orders/:id/cancel - Cancel order (admin)
router.post('/:id/cancel', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoOrder = models.TunjoOrder;
  const TunjoProduct = models.TunjoProduct;
  const TunjoProductVariant = models.TunjoProductVariant;
  const TunjoOrderItem = models.TunjoOrderItem;

  const order = await TunjoOrder.findByPk(req.params.id, {
    include: [{ model: TunjoOrderItem, as: 'items' }]
  });

  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  if (order.fulfillment_status === 'fulfilled') {
    return res.status(400).json({
      success: false,
      error: 'Cannot cancel fulfilled orders'
    });
  }

  // Restore inventory
  for (const item of order.items) {
    if (item.variant_id) {
      await TunjoProductVariant.increment('inventory_quantity', {
        by: item.quantity,
        where: { id: item.variant_id }
      });
    } else {
      await TunjoProduct.increment('inventory_quantity', {
        by: item.quantity,
        where: { id: item.product_id }
      });
    }
  }

  await order.update({
    fulfillment_status: 'cancelled',
    cancelled_at: new Date()
  });

  res.json({
    success: true,
    message: 'Order cancelled',
    data: order
  });
}));

module.exports = router;
