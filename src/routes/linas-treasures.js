// src/routes/linas-treasures.js
// Lina's Treasures E-Commerce Platform Routes

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

/**
 * GET /api/linas-treasures/products
 * Get all active products with optional filtering
 */
router.get('/products', async (req, res) => {
  try {
    const {
      category,
      featured,
      search,
      minPrice,
      maxPrice,
      inStock,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        p.*,
        c.name as category_name,
        c.slug as category_slug
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

    if (featured === 'true') {
      query += ` AND p.is_featured = true`;
    }

    if (search) {
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (minPrice) {
      query += ` AND p.retail_price >= $${paramCount}`;
      params.push(parseFloat(minPrice));
      paramCount++;
    }

    if (maxPrice) {
      query += ` AND p.retail_price <= $${paramCount}`;
      params.push(parseFloat(maxPrice));
      paramCount++;
    }

    if (inStock === 'true') {
      query += ` AND p.stock_quantity > 0`;
    }

    query += ` ORDER BY p.is_featured DESC, p.created_at DESC`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM lt_products p LEFT JOIN lt_product_categories c ON p.category_id = c.id WHERE p.is_active = true';
    if (category) countQuery += ` AND c.slug = '${category}'`;
    if (featured === 'true') countQuery += ` AND p.is_featured = true`;
    const countResult = await pool.query(countQuery);

    res.json({
      products: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/linas-treasures/products/:id
 * Get single product details
 */
router.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        p.*,
        c.name as category_name,
        c.slug as category_slug
      FROM lt_products p
      LEFT JOIN lt_product_categories c ON p.category_id = c.id
      WHERE p.id = $1 AND p.is_active = true
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

/**
 * GET /api/linas-treasures/categories
 * Get all product categories
 */
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM lt_product_categories
      WHERE is_active = true
      ORDER BY display_order, name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * POST /api/linas-treasures/partnership/apply
 * Submit partnership application
 */
router.post('/partnership/apply', async (req, res) => {
  try {
    const {
      businessName,
      businessType,
      contactName,
      email,
      phone,
      website,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
      country,
      taxId,
      resaleCertificateNumber,
      tier = 'bronze'
    } = req.body;

    // Validate required fields
    if (!businessName || !contactName || !email || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if email already exists
    const existingPartnership = await pool.query(
      'SELECT id FROM lt_partnerships WHERE email = $1',
      [email]
    );

    if (existingPartnership.rows.length > 0) {
      return res.status(400).json({ error: 'A partnership application with this email already exists' });
    }

    const result = await pool.query(`
      INSERT INTO lt_partnerships (
        business_name, business_type, contact_name, email, phone, website,
        address_line_1, address_line_2, city, state, zip_code, country,
        tax_id, resale_certificate_number, tier, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending')
      RETURNING *
    `, [
      businessName, businessType, contactName, email, phone, website,
      addressLine1, addressLine2, city, state, zipCode, country || 'USA',
      taxId, resaleCertificateNumber, tier
    ]);

    // TODO: Send confirmation email to applicant
    // TODO: Send notification email to admin

    res.status(201).json({
      message: 'Partnership application submitted successfully',
      partnership: result.rows[0]
    });
  } catch (error) {
    console.error('Error submitting partnership application:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// ============================================
// CART ROUTES (Session-based for guests)
// ============================================

/**
 * GET /api/linas-treasures/cart/:sessionId
 * Get cart items for a session
 */
router.get('/cart/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await pool.query(`
      SELECT
        c.*,
        p.name,
        p.description,
        p.retail_price,
        p.images,
        p.stock_quantity,
        (c.quantity * p.retail_price) as line_total
      FROM lt_cart_items c
      JOIN lt_products p ON c.product_id = p.id
      WHERE c.session_id = $1
      ORDER BY c.created_at DESC
    `, [sessionId]);

    const subtotal = result.rows.reduce((sum, item) => sum + parseFloat(item.line_total), 0);

    res.json({
      items: result.rows,
      subtotal: subtotal.toFixed(2),
      itemCount: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

/**
 * POST /api/linas-treasures/cart
 * Add item to cart
 */
router.post('/cart', async (req, res) => {
  try {
    const { sessionId, productId, quantity = 1 } = req.body;

    if (!sessionId || !productId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if product exists and is in stock
    const product = await pool.query(
      'SELECT id, stock_quantity, name FROM lt_products WHERE id = $1 AND is_active = true',
      [productId]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.rows[0].stock_quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    // Check if item already in cart
    const existing = await pool.query(
      'SELECT id, quantity FROM lt_cart_items WHERE session_id = $1 AND product_id = $2',
      [sessionId, productId]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update quantity
      const newQuantity = existing.rows[0].quantity + quantity;
      result = await pool.query(`
        UPDATE lt_cart_items
        SET quantity = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `, [newQuantity, existing.rows[0].id]);
    } else {
      // Insert new item
      result = await pool.query(`
        INSERT INTO lt_cart_items (session_id, product_id, quantity)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [sessionId, productId, quantity]);
    }

    res.status(201).json({
      message: 'Item added to cart',
      cartItem: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

/**
 * PUT /api/linas-treasures/cart/:id
 * Update cart item quantity
 */
router.put('/cart/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1' });
    }

    const result = await pool.query(`
      UPDATE lt_cart_items
      SET quantity = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [quantity, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({ message: 'Cart updated', cartItem: result.rows[0] });
  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

/**
 * DELETE /api/linas-treasures/cart/:id
 * Remove item from cart
 */
router.delete('/cart/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM lt_cart_items WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// ============================================
// CHECKOUT ROUTES
// ============================================

/**
 * POST /api/linas-treasures/checkout/create-payment-intent
 * Create Stripe payment intent for checkout
 */
router.post('/checkout/create-payment-intent', async (req, res) => {
  try {
    const { sessionId, amount, customerEmail } = req.body;

    if (!amount || amount < 0.50) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      receipt_email: customerEmail,
      metadata: {
        session_id: sessionId,
        source: 'linas-treasures'
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

/**
 * POST /api/linas-treasures/checkout/confirm
 * Confirm order after successful payment
 */
router.post('/checkout/confirm', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      sessionId,
      paymentIntentId,
      customerType = 'retail',
      shippingInfo,
      billingInfo
    } = req.body;

    // Verify payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new Error('Payment not successful');
    }

    // Get cart items
    const cart = await client.query(`
      SELECT
        c.*,
        p.name,
        p.description,
        p.retail_price,
        p.images,
        p.sku
      FROM lt_cart_items c
      JOIN lt_products p ON c.product_id = p.id
      WHERE c.session_id = $1
    `, [sessionId]);

    if (cart.rows.length === 0) {
      throw new Error('Cart is empty');
    }

    // Calculate totals
    const subtotal = cart.rows.reduce((sum, item) =>
      sum + (parseFloat(item.retail_price) * item.quantity), 0
    );
    const taxAmount = subtotal * 0.08; // 8% tax (adjust as needed)
    const shippingAmount = subtotal > 100 ? 0 : 9.99; // Free shipping over $100
    const totalAmount = subtotal + taxAmount + shippingAmount;

    // Generate order number
    const orderNumber = `LT-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    // Create order
    const order = await client.query(`
      INSERT INTO lt_orders (
        order_number,
        customer_type,
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
        stripe_payment_intent_id,
        paid_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'paid', 'card', $16, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      orderNumber,
      customerType,
      shippingInfo.name,
      shippingInfo.email,
      shippingInfo.phone,
      shippingInfo.addressLine1,
      shippingInfo.addressLine2,
      shippingInfo.city,
      shippingInfo.state,
      shippingInfo.zip,
      shippingInfo.country || 'USA',
      subtotal,
      taxAmount,
      shippingAmount,
      totalAmount,
      paymentIntentId
    ]);

    const orderId = order.rows[0].id;

    // Create order items and update inventory
    for (const item of cart.rows) {
      // Insert order item
      await client.query(`
        INSERT INTO lt_order_items (
          order_id,
          product_id,
          sku,
          product_name,
          product_description,
          product_image_url,
          unit_price,
          quantity,
          line_total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        orderId,
        item.product_id,
        item.sku,
        item.name,
        item.description,
        item.images ? item.images[0] : null,
        item.retail_price,
        item.quantity,
        item.retail_price * item.quantity
      ]);

      // Update inventory
      await client.query(`
        UPDATE lt_products
        SET stock_quantity = stock_quantity - $1
        WHERE id = $2
      `, [item.quantity, item.product_id]);

      // Log inventory change
      await client.query(`
        INSERT INTO lt_inventory_history (
          product_id,
          change_type,
          quantity_change,
          quantity_after,
          order_id
        ) VALUES ($1, 'sale', $2, (SELECT stock_quantity FROM lt_products WHERE id = $1), $3)
      `, [item.product_id, -item.quantity, orderId]);
    }

    // Clear cart
    await client.query('DELETE FROM lt_cart_items WHERE session_id = $1', [sessionId]);

    await client.query('COMMIT');

    // TODO: Send order confirmation email

    res.json({
      message: 'Order confirmed successfully',
      order: order.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error confirming order:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm order' });
  } finally {
    client.release();
  }
});

module.exports = router;
