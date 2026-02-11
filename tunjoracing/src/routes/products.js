'use strict';

/**
 * Product Routes - TunjoRacing Store
 * Handles product catalog for merchandise store
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

// GET /api/v1/products - Public product listing
router.get('/', asyncHandler(async (req, res) => {
  const { category, featured, status = 'active', page = 1, limit = 20, sort = 'sort_order' } = req.query;

  const TunjoProduct = models.TunjoProduct;
  const TunjoProductVariant = models.TunjoProductVariant;

  if (!TunjoProduct) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const where = { tenant_id: 1, status };
  if (category) where.category = category;
  if (featured === 'true') where.featured = true;

  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Determine order
  let order;
  switch (sort) {
    case 'price_asc':
      order = [['price', 'ASC']];
      break;
    case 'price_desc':
      order = [['price', 'DESC']];
      break;
    case 'newest':
      order = [['created_at', 'DESC']];
      break;
    case 'bestselling':
      order = [['total_sold', 'DESC']];
      break;
    default:
      order = [['sort_order', 'ASC'], ['created_at', 'DESC']];
  }

  const { count, rows } = await TunjoProduct.findAndCountAll({
    where,
    include: [
      {
        model: TunjoProductVariant,
        as: 'variants',
        where: { status: 'active' },
        required: false
      }
    ],
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
}));

// GET /api/v1/products/categories - Get all categories
router.get('/categories', asyncHandler(async (req, res) => {
  const TunjoProduct = models.TunjoProduct;

  const categories = await TunjoProduct.findAll({
    where: { tenant_id: 1, status: 'active' },
    attributes: [
      'category',
      [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count']
    ],
    group: ['category'],
    raw: true
  });

  res.json({
    success: true,
    data: categories
  });
}));

// GET /api/v1/products/:slug - Get single product by slug
router.get('/:slug', asyncHandler(async (req, res) => {
  const TunjoProduct = models.TunjoProduct;
  const TunjoProductVariant = models.TunjoProductVariant;

  const product = await TunjoProduct.findOne({
    where: { slug: req.params.slug, tenant_id: 1 },
    include: [
      {
        model: TunjoProductVariant,
        as: 'variants',
        where: { status: 'active' },
        required: false,
        order: [['sort_order', 'ASC']]
      }
    ]
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }

  res.json({
    success: true,
    data: product
  });
}));

// Admin routes

// POST /api/v1/products - Create product (admin)
router.post('/', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoProduct = models.TunjoProduct;

  const product = await TunjoProduct.create({
    ...req.body,
    tenant_id: 1
  });

  res.status(201).json({
    success: true,
    data: product
  });
}));

// PUT /api/v1/products/:id - Update product (admin)
router.put('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoProduct = models.TunjoProduct;

  const product = await TunjoProduct.findByPk(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  await product.update(req.body);

  res.json({
    success: true,
    data: product
  });
}));

// DELETE /api/v1/products/:id - Archive product (admin)
router.delete('/:id', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoProduct = models.TunjoProduct;

  const product = await TunjoProduct.findByPk(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  await product.update({ status: 'archived' });

  res.json({
    success: true,
    message: 'Product archived'
  });
}));

// Variant routes

// POST /api/v1/products/:id/variants - Create variant (admin)
router.post('/:id/variants', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoProduct = models.TunjoProduct;
  const TunjoProductVariant = models.TunjoProductVariant;

  const product = await TunjoProduct.findByPk(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const variant = await TunjoProductVariant.create({
    ...req.body,
    product_id: product.id,
    tenant_id: 1
  });

  // Update product to have variants
  await product.update({ has_variants: true });

  res.status(201).json({
    success: true,
    data: variant
  });
}));

// PUT /api/v1/products/:id/variants/:variantId - Update variant (admin)
router.put('/:id/variants/:variantId', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const TunjoProductVariant = models.TunjoProductVariant;

  const variant = await TunjoProductVariant.findOne({
    where: { id: req.params.variantId, product_id: req.params.id }
  });

  if (!variant) {
    return res.status(404).json({ success: false, error: 'Variant not found' });
  }

  await variant.update(req.body);

  res.json({
    success: true,
    data: variant
  });
}));

// PUT /api/v1/products/:id/inventory - Update inventory (admin)
router.put('/:id/inventory', authenticateToken, requireAdmin, asyncHandler(async (req, res) => {
  const { variant_id, quantity, adjustment } = req.body;
  const TunjoProduct = models.TunjoProduct;
  const TunjoProductVariant = models.TunjoProductVariant;

  if (variant_id) {
    const variant = await TunjoProductVariant.findByPk(variant_id);
    if (!variant) {
      return res.status(404).json({ success: false, error: 'Variant not found' });
    }

    const newQty = adjustment
      ? variant.inventory_quantity + adjustment
      : quantity;

    await variant.update({ inventory_quantity: Math.max(0, newQty) });

    return res.json({
      success: true,
      data: variant
    });
  }

  const product = await TunjoProduct.findByPk(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }

  const newQty = adjustment
    ? product.inventory_quantity + adjustment
    : quantity;

  await product.update({ inventory_quantity: Math.max(0, newQty) });

  res.json({
    success: true,
    data: product
  });
}));

module.exports = router;
