// src/routes/linas-treasures-admin.js
// Admin routes for Lina's Treasures

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Error checking admin status:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// ============================================
// PRODUCT MANAGEMENT
// ============================================

/**
 * POST /api/linas-treasures/admin/products
 * Create new product
 */
router.post('/products', async (req, res) => {
  try {
    const {
      sku,
      name,
      description,
      categoryId,
      retailPrice,
      wholesalePrice,
      stockQuantity,
      images,
      specifications,
      tags,
      metaTitle,
      metaDescription,
      isFeatured = false
    } = req.body;

    // Validate required fields
    if (!sku || !name || !retailPrice || !wholesalePrice) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Calculate partner tier pricing
    const tier1Price = wholesalePrice * 0.8; // 20% off wholesale
    const tier2Price = wholesalePrice * 0.7; // 30% off wholesale
    const tier3Price = wholesalePrice * 0.6; // 40% off wholesale

    const result = await pool.query(`
      INSERT INTO lt_products (
        sku, name, description, category_id,
        retail_price, wholesale_price,
        partner_tier_1_price, partner_tier_2_price, partner_tier_3_price,
        stock_quantity, images, specifications, tags,
        meta_title, meta_description, is_featured,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      sku, name, description, categoryId,
      retailPrice, wholesalePrice,
      tier1Price, tier2Price, tier3Price,
      stockQuantity || 0,
      JSON.stringify(images || []),
      JSON.stringify(specifications || {}),
      tags || [],
      metaTitle || name,
      metaDescription || description,
      isFeatured,
      req.user.id
    ]);

    res.status(201).json({
      message: 'Product created successfully',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating product:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'SKU already exists' });
    }
    res.status(500).json({ error: 'Failed to create product' });
  }
});

/**
 * PUT /api/linas-treasures/admin/products/:id
 * Update product
 */
router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const allowedFields = [
      'sku', 'name', 'description', 'category_id',
      'retail_price', 'wholesale_price', 'stock_quantity',
      'images', 'specifications', 'tags',
      'meta_title', 'meta_description',
      'is_active', 'is_featured'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(snakeKey)) {
        setClauses.push(`${snakeKey} = $${paramCount}`);
        values.push(updates[key]);
        paramCount++;
      }
    });

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Recalculate tier pricing if wholesale price changed
    if (updates.wholesalePrice) {
      setClauses.push(`partner_tier_1_price = $${paramCount}`);
      values.push(updates.wholesalePrice * 0.8);
      paramCount++;

      setClauses.push(`partner_tier_2_price = $${paramCount}`);
      values.push(updates.wholesalePrice * 0.7);
      paramCount++;

      setClauses.push(`partner_tier_3_price = $${paramCount}`);
      values.push(updates.wholesalePrice * 0.6);
      paramCount++;
    }

    values.push(id);

    const query = `
      UPDATE lt_products
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      message: 'Product updated successfully',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * DELETE /api/linas-treasures/admin/products/:id
 * Delete product (soft delete - set is_active to false)
 */
router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE lt_products
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ============================================
// PARTNERSHIP MANAGEMENT
// ============================================

/**
 * GET /api/linas-treasures/admin/partnerships
 * List all partnership applications
 */
router.get('/partnerships', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM lt_partnerships';
    const params = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    res.json({
      partnerships: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching partnerships:', error);
    res.status(500).json({ error: 'Failed to fetch partnerships' });
  }
});

/**
 * PUT /api/linas-treasures/admin/partnerships/:id/approve
 * Approve partnership application
 */
router.put('/partnerships/:id/approve', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { tier = 'bronze' } = req.body;

    // Get partnership details
    const partnership = await client.query(
      'SELECT * FROM lt_partnerships WHERE id = $1',
      [id]
    );

    if (partnership.rows.length === 0) {
      throw new Error('Partnership not found');
    }

    const partnerData = partnership.rows[0];

    // Create user account for partner
    const password = Math.random().toString(36).slice(-12); // Generate random password
    const hashedPassword = require('bcrypt').hashSync(password, 10);

    const user = await client.query(`
      INSERT INTO users (email, password, is_admin, client_id)
      VALUES ($1, $2, false, 1)
      RETURNING id
    `, [partnerData.email, hashedPassword]);

    const userId = user.rows[0].id;

    // Update partnership with approval
    const discountMap = { bronze: 20, silver: 30, gold: 40 };
    const minOrderMap = { bronze: 250, silver: 500, gold: 1000 };

    await client.query(`
      UPDATE lt_partnerships
      SET status = 'approved',
          tier = $1,
          discount_percentage = $2,
          minimum_order_amount = $3,
          user_id = $4,
          approved_by = $5,
          approved_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [tier, discountMap[tier], minOrderMap[tier], userId, req.user.id, id]);

    await client.query('COMMIT');

    // TODO: Send approval email with login credentials

    res.json({
      message: 'Partnership approved successfully',
      userId,
      temporaryPassword: password // Send this via email, not in response
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error approving partnership:', error);
    res.status(500).json({ error: 'Failed to approve partnership' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/linas-treasures/admin/partnerships/:id/reject
 * Reject partnership application
 */
router.put('/partnerships/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await pool.query(`
      UPDATE lt_partnerships
      SET status = 'rejected',
          rejection_reason = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [reason, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Partnership not found' });
    }

    // TODO: Send rejection email

    res.json({ message: 'Partnership rejected' });
  } catch (error) {
    console.error('Error rejecting partnership:', error);
    res.status(500).json({ error: 'Failed to reject partnership' });
  }
});

// ============================================
// ORDER MANAGEMENT
// ============================================

/**
 * GET /api/linas-treasures/admin/orders
 * List all orders
 */
router.get('/orders', async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      fulfillmentStatus,
      limit = 50,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM lt_orders WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND fulfillment_status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (paymentStatus) {
      query += ` AND payment_status = $${paramCount}`;
      params.push(paymentStatus);
      paramCount++;
    }

    if (fulfillmentStatus) {
      query += ` AND fulfillment_status = $${paramCount}`;
      params.push(fulfillmentStatus);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    res.json({
      orders: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * PUT /api/linas-treasures/admin/orders/:id/fulfill
 * Update order fulfillment status
 */
router.put('/orders/:id/fulfill', async (req, res) => {
  try {
    const { id } = req.params;
    const { fulfillmentStatus, trackingNumber, shippingCarrier } = req.body;

    const updates = { fulfillment_status: fulfillmentStatus };

    if (fulfillmentStatus === 'shipped') {
      updates.tracking_number = trackingNumber;
      updates.shipping_carrier = shippingCarrier;
      updates.shipped_at = new Date();
    } else if (fulfillmentStatus === 'delivered') {
      updates.delivered_at = new Date();
    }

    const setClauses = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`);
    const values = Object.values(updates);
    values.push(id);

    const result = await pool.query(`
      UPDATE lt_orders
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // TODO: Send shipping notification email if status is 'shipped'

    res.json({
      message: 'Order updated successfully',
      order: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

/**
 * GET /api/linas-treasures/admin/dashboard
 * Get admin dashboard statistics
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Get various statistics
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM lt_products WHERE is_active = true) as total_products,
        (SELECT COUNT(*) FROM lt_orders WHERE created_at > NOW() - INTERVAL '30 days') as orders_last_30_days,
        (SELECT COALESCE(SUM(total_amount), 0) FROM lt_orders WHERE payment_status = 'paid' AND created_at > NOW() - INTERVAL '30 days') as revenue_last_30_days,
        (SELECT COUNT(*) FROM lt_partnerships WHERE status = 'pending') as pending_partnerships,
        (SELECT COUNT(*) FROM lt_partnerships WHERE status = 'approved') as active_partners,
        (SELECT COUNT(*) FROM lt_orders WHERE fulfillment_status = 'pending') as pending_orders,
        (SELECT COUNT(*) FROM lt_products WHERE stock_quantity <= low_stock_threshold) as low_stock_products
    `);

    // Get recent orders
    const recentOrders = await pool.query(`
      SELECT * FROM lt_orders
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      statistics: stats.rows[0],
      recentOrders: recentOrders.rows
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
