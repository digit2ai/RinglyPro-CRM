'use strict';

/**
 * Cart Routes - TunjoRacing Store
 * Handles shopping cart operations
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const { optionalAuth } = require('../middleware/auth');

let models;
try {
  models = require('../../models');
} catch (e) {
  console.log('TunjoRacing: Models not loaded yet');
  models = {};
}

// Helper to get or create session ID
const getSessionId = (req) => {
  return req.headers['x-cart-session'] || req.query.session_id;
};

// GET /api/v1/cart - Get cart items
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const sessionId = getSessionId(req);

  if (!sessionId) {
    return res.json({
      success: true,
      data: {
        items: [],
        subtotal: 0,
        item_count: 0
      }
    });
  }

  const TunjoCartItem = models.TunjoCartItem;
  const TunjoProduct = models.TunjoProduct;
  const TunjoProductVariant = models.TunjoProductVariant;

  if (!TunjoCartItem) {
    return res.status(500).json({ success: false, error: 'Database not initialized' });
  }

  const items = await TunjoCartItem.findAll({
    where: { session_id: sessionId, tenant_id: 1 },
    include: [
      {
        model: TunjoProduct,
        as: 'product',
        attributes: ['id', 'name', 'slug', 'price', 'images', 'inventory_quantity', 'status']
      },
      {
        model: TunjoProductVariant,
        as: 'variant',
        attributes: ['id', 'title', 'price', 'image_url', 'inventory_quantity', 'status']
      }
    ],
    order: [['created_at', 'ASC']]
  });

  // Calculate totals
  let subtotal = 0;
  let itemCount = 0;

  const cartItems = items.map(item => {
    const price = item.variant?.price || item.product.price;
    const lineTotal = parseFloat(price) * item.quantity;
    subtotal += lineTotal;
    itemCount += item.quantity;

    return {
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      price: parseFloat(price),
      line_total: lineTotal,
      product: item.product,
      variant: item.variant
    };
  });

  res.json({
    success: true,
    data: {
      items: cartItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      item_count: itemCount
    }
  });
}));

// POST /api/v1/cart/items - Add item to cart
router.post('/items', optionalAuth, asyncHandler(async (req, res) => {
  const sessionId = getSessionId(req);
  const { product_id, variant_id, quantity = 1 } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'Session ID required. Send X-Cart-Session header.'
    });
  }

  if (!product_id) {
    return res.status(400).json({
      success: false,
      error: 'Product ID is required'
    });
  }

  const TunjoCartItem = models.TunjoCartItem;
  const TunjoProduct = models.TunjoProduct;
  const TunjoProductVariant = models.TunjoProductVariant;

  // Verify product exists and is active
  const product = await TunjoProduct.findOne({
    where: { id: product_id, status: 'active', tenant_id: 1 }
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Product not found or unavailable'
    });
  }

  // If product has variants, variant_id is required
  if (product.has_variants && !variant_id) {
    return res.status(400).json({
      success: false,
      error: 'Variant selection required for this product'
    });
  }

  let price = product.price;
  let stockQuantity = product.inventory_quantity;

  // Verify variant if provided
  if (variant_id) {
    const variant = await TunjoProductVariant.findOne({
      where: { id: variant_id, product_id, status: 'active' }
    });

    if (!variant) {
      return res.status(404).json({
        success: false,
        error: 'Variant not found or unavailable'
      });
    }

    price = variant.price || product.price;
    stockQuantity = variant.inventory_quantity;
  }

  // Check stock
  if (product.track_inventory && quantity > stockQuantity && !product.allow_backorder) {
    return res.status(400).json({
      success: false,
      error: `Only ${stockQuantity} items available`
    });
  }

  // Check if item already in cart
  const existingItem = await TunjoCartItem.findOne({
    where: {
      session_id: sessionId,
      product_id,
      variant_id: variant_id || null,
      tenant_id: 1
    }
  });

  if (existingItem) {
    // Update quantity
    const newQty = existingItem.quantity + quantity;

    if (product.track_inventory && newQty > stockQuantity && !product.allow_backorder) {
      return res.status(400).json({
        success: false,
        error: `Only ${stockQuantity} items available (you have ${existingItem.quantity} in cart)`
      });
    }

    await existingItem.update({ quantity: newQty });

    return res.json({
      success: true,
      message: 'Cart updated',
      item: existingItem
    });
  }

  // Create new cart item
  const cartItem = await TunjoCartItem.create({
    tenant_id: 1,
    session_id: sessionId,
    fan_id: req.user?.fan_id || null,
    product_id,
    variant_id: variant_id || null,
    quantity,
    price_at_add: price
  });

  res.status(201).json({
    success: true,
    message: 'Added to cart',
    item: cartItem
  });
}));

// PUT /api/v1/cart/items/:id - Update cart item quantity
router.put('/items/:id', optionalAuth, asyncHandler(async (req, res) => {
  const sessionId = getSessionId(req);
  const { quantity } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'Session ID required'
    });
  }

  const TunjoCartItem = models.TunjoCartItem;
  const TunjoProduct = models.TunjoProduct;
  const TunjoProductVariant = models.TunjoProductVariant;

  const item = await TunjoCartItem.findOne({
    where: { id: req.params.id, session_id: sessionId, tenant_id: 1 },
    include: [
      { model: TunjoProduct, as: 'product' },
      { model: TunjoProductVariant, as: 'variant' }
    ]
  });

  if (!item) {
    return res.status(404).json({
      success: false,
      error: 'Cart item not found'
    });
  }

  if (quantity <= 0) {
    await item.destroy();
    return res.json({
      success: true,
      message: 'Item removed from cart'
    });
  }

  // Check stock
  const stockQty = item.variant?.inventory_quantity || item.product.inventory_quantity;
  if (item.product.track_inventory && quantity > stockQty && !item.product.allow_backorder) {
    return res.status(400).json({
      success: false,
      error: `Only ${stockQty} items available`
    });
  }

  await item.update({ quantity });

  res.json({
    success: true,
    message: 'Cart updated',
    item
  });
}));

// DELETE /api/v1/cart/items/:id - Remove item from cart
router.delete('/items/:id', optionalAuth, asyncHandler(async (req, res) => {
  const sessionId = getSessionId(req);

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'Session ID required'
    });
  }

  const TunjoCartItem = models.TunjoCartItem;

  const item = await TunjoCartItem.findOne({
    where: { id: req.params.id, session_id: sessionId, tenant_id: 1 }
  });

  if (!item) {
    return res.status(404).json({
      success: false,
      error: 'Cart item not found'
    });
  }

  await item.destroy();

  res.json({
    success: true,
    message: 'Item removed from cart'
  });
}));

// DELETE /api/v1/cart - Clear cart
router.delete('/', optionalAuth, asyncHandler(async (req, res) => {
  const sessionId = getSessionId(req);

  if (!sessionId) {
    return res.json({
      success: true,
      message: 'Cart cleared'
    });
  }

  const TunjoCartItem = models.TunjoCartItem;

  await TunjoCartItem.destroy({
    where: { session_id: sessionId, tenant_id: 1 }
  });

  res.json({
    success: true,
    message: 'Cart cleared'
  });
}));

module.exports = router;
