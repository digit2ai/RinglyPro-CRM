// src/routes/linas-treasures-partner.js
// Partner portal routes for Lina's Treasures

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware to check if user is a partner
const requirePartner = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT p.*, u.email
      FROM lt_partnerships p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = $1 AND p.status = 'approved'
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Partner access required' });
    }

    // Attach partnership data to request
    req.partnership = result.rows[0];
    next();
  } catch (error) {
    console.error('Error checking partner status:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// Apply authentication and partner check to all routes
router.use(authenticateToken);
router.use(requirePartner);

// ============================================
// PARTNER DASHBOARD
// ============================================

/**
 * GET /api/linas-treasures/partner/dashboard
 * Get partner dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const partnershipId = req.partnership.id;

    // Get partner statistics
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM lt_orders WHERE partnership_id = $1) as total_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM lt_orders WHERE partnership_id = $1 AND payment_status = 'paid') as total_spent,
        (SELECT COUNT(*) FROM lt_orders WHERE partnership_id = $1 AND created_at > NOW() - INTERVAL '30 days') as orders_this_month,
        (SELECT COALESCE(SUM(total_amount), 0) FROM lt_orders WHERE partnership_id = $1 AND payment_status = 'paid' AND created_at > NOW() - INTERVAL '30 days') as spent_this_month
    `, [partnershipId]);

    // Get recent orders
    const recentOrders = await pool.query(`
      SELECT * FROM lt_orders
      WHERE partnership_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `, [partnershipId]);

    res.json({
      partnership: {
        businessName: req.partnership.business_name,
        tier: req.partnership.tier,
        discountPercentage: req.partnership.discount_percentage,
        minimumOrderAmount: req.partnership.minimum_order_amount
      },
      statistics: stats.rows[0],
      recentOrders: recentOrders.rows
    });
  } catch (error) {
    console.error('Error fetching partner dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// ============================================
// PARTNER PRODUCT CATALOG
// ============================================

/**
 * GET /api/linas-treasures/partner/products
 * Get products with partner pricing
 */
router.get('/products', async (req, res) => {
  try {
    const tier = req.partnership.tier;
    const { category, search, limit = 50, offset = 0 } = req.query;

    // Determine which price column to use based on tier
    const priceColumn = tier === 'gold' ? 'partner_tier_3_price' :
                        tier === 'silver' ? 'partner_tier_2_price' :
                        'partner_tier_1_price';

    let query = `
      SELECT
        p.*,
        c.name as category_name,
        c.slug as category_slug,
        p.${priceColumn} as partner_price,
        p.retail_price - p.${priceColumn} as savings
      FROM lt_products p
      LEFT JOIN lt_product_categories c ON p.category_id = c.id
      WHERE p.is_active = true
    `;

    const params = [];
    let paramCount = 1;

    if (category) {
      query += ` AND c.slug = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (search) {
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY p.is_featured DESC, p.created_at DESC`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    res.json({
      products: result.rows,
      tier: tier,
      discountPercentage: req.partnership.discount_percentage
    });
  } catch (error) {
    console.error('Error fetching partner products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ============================================
// PARTNER ORDERS
// ============================================

/**
 * GET /api/linas-treasures/partner/orders
 * Get partner order history
 */
router.get('/orders', async (req, res) => {
  try {
    const partnershipId = req.partnership.id;
    const { status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM lt_orders WHERE partnership_id = $1';
    const params = [partnershipId];

    if (status) {
      query += ' AND fulfillment_status = $2';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    res.json({
      orders: result.rows
    });
  } catch (error) {
    console.error('Error fetching partner orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * GET /api/linas-treasures/partner/orders/:id
 * Get single order details with items
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const partnershipId = req.partnership.id;

    // Get order
    const order = await pool.query(
      'SELECT * FROM lt_orders WHERE id = $1 AND partnership_id = $2',
      [id, partnershipId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const items = await pool.query(
      'SELECT * FROM lt_order_items WHERE order_id = $1',
      [id]
    );

    res.json({
      order: order.rows[0],
      items: items.rows
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * POST /api/linas-treasures/partner/orders
 * Create partner order
 */
router.post('/orders', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      items, // Array of {productId, quantity}
      shippingInfo,
      paymentMethod = 'net_30', // Partners can use Net 30 terms
      customerNotes
    } = req.body;

    const partnershipId = req.partnership.id;
    const tier = req.partnership.tier;

    if (!items || items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    // Determine partner price column
    const priceColumn = tier === 'gold' ? 'partner_tier_3_price' :
                        tier === 'silver' ? 'partner_tier_2_price' :
                        'partner_tier_1_price';

    // Calculate order totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await client.query(`
        SELECT id, sku, name, description, images, ${priceColumn} as price, stock_quantity
        FROM lt_products
        WHERE id = $1 AND is_active = true
      `, [item.productId]);

      if (product.rows.length === 0) {
        throw new Error(`Product ${item.productId} not found`);
      }

      const productData = product.rows[0];

      if (productData.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${productData.name}`);
      }

      const lineTotal = productData.price * item.quantity;
      subtotal += lineTotal;

      orderItems.push({
        productId: productData.id,
        sku: productData.sku,
        name: productData.name,
        description: productData.description,
        imageUrl: productData.images ? productData.images[0] : null,
        unitPrice: productData.price,
        quantity: item.quantity,
        lineTotal
      });
    }

    // Check minimum order amount
    if (subtotal < req.partnership.minimum_order_amount) {
      throw new Error(`Minimum order amount is $${req.partnership.minimum_order_amount}`);
    }

    // Calculate totals
    const taxAmount = subtotal * 0.08; // 8% tax
    const shippingAmount = subtotal > 1000 ? 0 : (subtotal > 500 ? 15 : 25); // Tiered shipping
    const totalAmount = subtotal + taxAmount + shippingAmount;

    // Generate order number
    const orderNumber = `LT-P-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    // Create order
    const order = await client.query(`
      INSERT INTO lt_orders (
        order_number,
        customer_type,
        partnership_id,
        ship_to_name,
        ship_to_email,
        ship_to_phone,
        ship_to_address_line_1,
        ship_to_address_line_2,
        ship_to_city,
        ship_to_state,
        ship_to_zip,
        ship_to_country,
        subtotal,
        tax_amount,
        shipping_amount,
        total_amount,
        payment_status,
        payment_method,
        customer_notes
      ) VALUES ($1, 'partner', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `, [
      orderNumber,
      partnershipId,
      shippingInfo.name || req.partnership.business_name,
      shippingInfo.email || req.partnership.email,
      shippingInfo.phone || req.partnership.phone,
      shippingInfo.addressLine1 || req.partnership.address_line_1,
      shippingInfo.addressLine2 || req.partnership.address_line_2,
      shippingInfo.city || req.partnership.city,
      shippingInfo.state || req.partnership.state,
      shippingInfo.zip || req.partnership.zip_code,
      shippingInfo.country || req.partnership.country,
      subtotal,
      taxAmount,
      shippingAmount,
      totalAmount,
      paymentMethod === 'net_30' ? 'pending' : 'paid',
      paymentMethod,
      customerNotes
    ]);

    const orderId = order.rows[0].id;

    // Create order items and update inventory
    for (const item of orderItems) {
      await client.query(`
        INSERT INTO lt_order_items (
          order_id, product_id, sku, product_name, product_description,
          product_image_url, unit_price, quantity, line_total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        orderId, item.productId, item.sku, item.name, item.description,
        item.imageUrl, item.unitPrice, item.quantity, item.lineTotal
      ]);

      // Update inventory
      await client.query(
        'UPDATE lt_products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.productId]
      );

      // Log inventory change
      await client.query(`
        INSERT INTO lt_inventory_history (
          product_id, change_type, quantity_change,
          quantity_after, order_id
        ) VALUES ($1, 'sale', $2, (SELECT stock_quantity FROM lt_products WHERE id = $1), $3)
      `, [item.productId, -item.quantity, orderId]);
    }

    await client.query('COMMIT');

    // TODO: Send order confirmation email

    res.status(201).json({
      message: 'Order created successfully',
      order: order.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating partner order:', error);
    res.status(500).json({ error: error.message || 'Failed to create order' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/linas-treasures/partner/profile
 * Get partner profile information
 */
router.get('/profile', async (req, res) => {
  try {
    res.json(req.partnership);
  } catch (error) {
    console.error('Error fetching partner profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/linas-treasures/partner/profile
 * Update partner profile
 */
router.put('/profile', async (req, res) => {
  try {
    const partnershipId = req.partnership.id;
    const {
      phone,
      website,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode
    } = req.body;

    const result = await pool.query(`
      UPDATE lt_partnerships
      SET
        phone = COALESCE($1, phone),
        website = COALESCE($2, website),
        address_line_1 = COALESCE($3, address_line_1),
        address_line_2 = COALESCE($4, address_line_2),
        city = COALESCE($5, city),
        state = COALESCE($6, state),
        zip_code = COALESCE($7, zip_code),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [phone, website, addressLine1, addressLine2, city, state, zipCode, partnershipId]);

    res.json({
      message: 'Profile updated successfully',
      partnership: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating partner profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
