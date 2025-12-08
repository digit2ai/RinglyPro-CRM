// =====================================================
// ONLINE STOREFRONT & MENU API ROUTES
// Multi-tenant storefront system for orders.ringlypro.com
// =====================================================

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { scrapeAndAnalyzeWebsite } = require('../services/aiWebsiteScraper');
const { enhancePhoto } = require('../services/aiPhotoEnhancer');

// =====================================================
// ADMIN ENDPOINTS (Authenticated)
// =====================================================

/**
 * POST /api/storefront/create
 * Create a new storefront from existing website
 */
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      businessName,
      businessSlug,
      businessType,
      websiteUrl,
      clientId
    } = req.body;

    logger.info(`[Storefront] Creating new storefront: ${businessSlug}`);

    // Validate required fields
    if (!businessName || !businessSlug || !websiteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: businessName, businessSlug, websiteUrl'
      });
    }

    // Check if slug already exists
    const [existing] = await sequelize.query(
      'SELECT id FROM storefront_businesses WHERE business_slug = :slug',
      {
        replacements: { slug: businessSlug },
        type: QueryTypes.SELECT
      }
    );

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Business slug already exists'
      });
    }

    // Create storefront record with published=true by default
    const [storefront] = await sequelize.query(
      `INSERT INTO storefront_businesses
       (business_slug, business_name, business_type, original_website_url, client_id, website_import_status, is_published, is_active)
       VALUES (:slug, :name, :type, :url, :clientId, 'pending', true, true)
       RETURNING *`,
      {
        replacements: {
          slug: businessSlug,
          name: businessName,
          type: businessType || 'restaurant',
          url: websiteUrl,
          clientId: clientId || null
        },
        type: QueryTypes.INSERT
      }
    );

    const storefrontId = storefront[0].id;

    // Generate iframe embed code
    const embedCode = generateEmbedCode(businessSlug);
    await sequelize.query(
      'UPDATE storefront_businesses SET embed_code = :code WHERE id = :id',
      {
        replacements: { code: embedCode, id: storefrontId },
        type: QueryTypes.UPDATE
      }
    );

    // Start async website scraping (don't wait)
    importWebsiteAsync(storefrontId, websiteUrl, businessType || 'restaurant');

    res.json({
      success: true,
      storefrontId,
      businessSlug,
      embedCode,
      publicUrl: `https://aiagent.ringlypro.com/storefront/${businessSlug}`,
      message: 'Storefront created. Website import started in background.'
    });

  } catch (error) {
    logger.error('[Storefront] Create error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create storefront'
    });
  }
});

/**
 * GET /api/storefront/list
 * List all storefronts
 */
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const storefronts = await sequelize.query(
      `SELECT
        id, business_slug, business_name, business_type,
        original_website_url, website_import_status,
        is_active, is_published, logo_url, primary_color,
        created_at, updated_at
       FROM storefront_businesses
       ORDER BY created_at DESC`,
      { type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      storefronts,
      total: storefronts.length
    });

  } catch (error) {
    logger.error('[Storefront] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list storefronts'
    });
  }
});

/**
 * GET /api/storefront/:storefrontId
 * Get storefront details
 */
router.get('/:storefrontId', authenticateToken, async (req, res) => {
  try {
    const { storefrontId } = req.params;

    const [storefront] = await sequelize.query(
      'SELECT * FROM storefront_businesses WHERE id = :id',
      {
        replacements: { id: storefrontId },
        type: QueryTypes.SELECT
      }
    );

    if (!storefront) {
      return res.status(404).json({
        success: false,
        error: 'Storefront not found'
      });
    }

    // Get categories
    const categories = await sequelize.query(
      'SELECT * FROM storefront_categories WHERE storefront_id = :id ORDER BY display_order',
      {
        replacements: { id: storefrontId },
        type: QueryTypes.SELECT
      }
    );

    // Get items
    const items = await sequelize.query(
      'SELECT * FROM storefront_items WHERE storefront_id = :id ORDER BY display_order',
      {
        replacements: { id: storefrontId },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      storefront,
      categories,
      items,
      stats: {
        totalCategories: categories.length,
        totalItems: items.length,
        activeItems: items.filter(i => i.is_active).length
      }
    });

  } catch (error) {
    logger.error('[Storefront] Get details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get storefront details'
    });
  }
});

/**
 * PUT /api/storefront/:storefrontId
 * Update storefront settings
 */
router.put('/:storefrontId', authenticateToken, async (req, res) => {
  try {
    const { storefrontId } = req.params;
    const updates = req.body;

    const allowedFields = [
      'business_name', 'tagline', 'description', 'logo_url',
      'primary_color', 'secondary_color', 'accent_color',
      'hero_image_url', 'is_active', 'is_published',
      'phone', 'email', 'address', 'city', 'state', 'country'
    ];

    const setClauses = [];
    const replacements = { id: storefrontId };

    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = :${key}`);
        replacements[key] = updates[key];
      }
    });

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    await sequelize.query(
      `UPDATE storefront_businesses SET ${setClauses.join(', ')} WHERE id = :id`,
      {
        replacements,
        type: QueryTypes.UPDATE
      }
    );

    res.json({
      success: true,
      message: 'Storefront updated successfully'
    });

  } catch (error) {
    logger.error('[Storefront] Update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update storefront'
    });
  }
});

/**
 * POST /api/storefront/:storefrontId/import
 * Trigger website import/re-import
 */
router.post('/:storefrontId/import', authenticateToken, async (req, res) => {
  try {
    const { storefrontId } = req.params;

    const [storefront] = await sequelize.query(
      'SELECT * FROM storefront_businesses WHERE id = :id',
      {
        replacements: { id: storefrontId },
        type: QueryTypes.SELECT
      }
    );

    if (!storefront) {
      return res.status(404).json({
        success: false,
        error: 'Storefront not found'
      });
    }

    // Start import
    importWebsiteAsync(
      storefrontId,
      storefront.original_website_url,
      storefront.business_type
    );

    res.json({
      success: true,
      message: 'Website import started in background'
    });

  } catch (error) {
    logger.error('[Storefront] Import trigger error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start import'
    });
  }
});

// =====================================================
// PUBLIC ENDPOINTS (No authentication required)
// =====================================================

/**
 * GET /api/storefront/public/:businessSlug
 * Get public storefront data
 */
router.get('/public/:businessSlug', async (req, res) => {
  try {
    const { businessSlug } = req.params;

    const [storefront] = await sequelize.query(
      `SELECT
        id, business_slug, business_name, business_type,
        tagline, description, logo_url,
        primary_color, secondary_color, accent_color,
        hero_image_url, phone, email, address, city, state,
        hours_of_operation, social_media
       FROM storefront_businesses
       WHERE business_slug = :slug AND is_active = true AND is_published = true`,
      {
        replacements: { slug: businessSlug },
        type: QueryTypes.SELECT
      }
    );

    if (!storefront) {
      return res.status(404).json({
        success: false,
        error: 'Storefront not found or not published'
      });
    }

    // Get active categories with items
    const categories = await sequelize.query(
      `SELECT * FROM storefront_categories
       WHERE storefront_id = :id AND is_active = true
       ORDER BY display_order`,
      {
        replacements: { id: storefront.id },
        type: QueryTypes.SELECT
      }
    );

    // Get active items for each category
    for (const category of categories) {
      const items = await sequelize.query(
        `SELECT
          id, name, slug, price, original_price, description, short_description,
          image_url, images_json, dietary_tags, is_featured, is_bestseller,
          is_available
         FROM storefront_items
         WHERE category_id = :categoryId AND is_active = true
         ORDER BY display_order`,
        {
          replacements: { categoryId: category.id },
          type: QueryTypes.SELECT
        }
      );
      category.items = items;
    }

    res.json({
      success: true,
      storefront,
      categories
    });

  } catch (error) {
    logger.error('[Storefront] Public get error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load storefront'
    });
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generate iframe embed code
 */
function generateEmbedCode(businessSlug) {
  return `<!-- RinglyPro Storefront Embed -->
<iframe
  src="https://aiagent.ringlypro.com/storefront/${businessSlug}"
  style="width: 100%; min-height: 900px; border: none;"
  loading="lazy"
  title="${businessSlug} Online Menu"
></iframe>`;
}

/**
 * Import website asynchronously
 */
async function importWebsiteAsync(storefrontId, websiteUrl, businessType) {
  try {
    logger.info(`[Storefront] Starting import for storefront ${storefrontId}`);

    // Update status
    await sequelize.query(
      `UPDATE storefront_businesses
       SET website_import_status = 'processing'
       WHERE id = :id`,
      {
        replacements: { id: storefrontId },
        type: QueryTypes.UPDATE
      }
    );

    // Create import log
    const [importLog] = await sequelize.query(
      `INSERT INTO storefront_ai_imports
       (storefront_id, import_type, source_url, status)
       VALUES (:storefrontId, 'full_website', :url, 'processing')
       RETURNING *`,
      {
        replacements: { storefrontId, url: websiteUrl },
        type: QueryTypes.INSERT
      }
    );

    const importId = importLog[0].id;

    // Scrape and analyze
    const result = await scrapeAndAnalyzeWebsite({ websiteUrl, businessType });

    if (!result.success) {
      throw new Error(result.error);
    }

    // Update storefront with extracted data
    const aiData = result.aiProcessed;

    await sequelize.query(
      `UPDATE storefront_businesses
       SET
         business_name = COALESCE(:name, business_name),
         tagline = :tagline,
         description = :description,
         logo_url = :logo,
         primary_color = :primaryColor,
         secondary_color = :secondaryColor,
         brand_style = :brandStyle,
         website_import_status = 'completed',
         last_imported_at = CURRENT_TIMESTAMP,
         website_import_metadata = :metadata
       WHERE id = :id`,
      {
        replacements: {
          id: storefrontId,
          name: aiData.businessInfo?.name,
          tagline: aiData.businessInfo?.tagline,
          description: aiData.businessInfo?.description,
          logo: result.extractedData?.logo,
          primaryColor: aiData.colors?.primary,
          secondaryColor: aiData.colors?.secondary,
          brandStyle: aiData.businessInfo?.brandStyle,
          metadata: JSON.stringify(result.extractedData)
        },
        type: QueryTypes.UPDATE
      }
    );

    // Create categories and items
    if (aiData.categories && aiData.categories.length > 0) {
      for (let i = 0; i < aiData.categories.length; i++) {
        const cat = aiData.categories[i];

        const [category] = await sequelize.query(
          `INSERT INTO storefront_categories
           (storefront_id, name, slug, description, display_order, ai_generated)
           VALUES (:storefrontId, :name, :slug, :description, :order, true)
           RETURNING *`,
          {
            replacements: {
              storefrontId,
              name: cat.name,
              slug: cat.slug,
              description: cat.description,
              order: i
            },
            type: QueryTypes.INSERT
          }
        );

        const categoryId = category[0].id;

        // Create items
        if (cat.items && cat.items.length > 0) {
          for (let j = 0; j < cat.items.length; j++) {
            const item = cat.items[j];

            await sequelize.query(
              `INSERT INTO storefront_items
               (storefront_id, category_id, name, slug, description, price, image_url, display_order, ai_generated)
               VALUES (:storefrontId, :categoryId, :name, :slug, :description, :price, :image, :order, true)`,
              {
                replacements: {
                  storefrontId,
                  categoryId,
                  name: item.name,
                  slug: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                  description: item.description,
                  price: item.price,
                  image: item.image,
                  order: j
                },
                type: QueryTypes.INSERT
              }
            );
          }
        }
      }
    }

    // Update import log
    await sequelize.query(
      `UPDATE storefront_ai_imports
       SET
         status = 'completed',
         processed_data = :data,
         items_found = :found,
         items_created = :created,
         completed_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: {
          id: importId,
          data: JSON.stringify(aiData),
          found: aiData.categories?.reduce((sum, cat) => sum + (cat.items?.length || 0), 0) || 0,
          created: aiData.categories?.reduce((sum, cat) => sum + (cat.items?.length || 0), 0) || 0
        },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`[Storefront] Import completed successfully for storefront ${storefrontId}`);

  } catch (error) {
    logger.error(`[Storefront] Import failed for storefront ${storefrontId}:`, error);

    await sequelize.query(
      `UPDATE storefront_businesses
       SET website_import_status = 'failed'
       WHERE id = :id`,
      {
        replacements: { id: storefrontId },
        type: QueryTypes.UPDATE
      }
    );
  }
}

// =====================================================
// ORDER ENDPOINTS (Public - No Auth Required)
// =====================================================

/**
 * POST /api/storefront/orders/create
 * Create a new order
 */
router.post('/orders/create', async (req, res) => {
  try {
    const {
      businessSlug,
      customerInfo,
      orderType,
      deliveryAddress,
      items,
      pricing,
      notes,
      paymentMethod
    } = req.body;

    logger.info(`[Storefront Orders] New order for ${businessSlug}`);

    // Get storefront
    const [storefront] = await sequelize.query(
      'SELECT * FROM storefront_businesses WHERE business_slug = :slug',
      {
        replacements: { slug: businessSlug },
        type: QueryTypes.SELECT
      }
    );

    if (!storefront) {
      return res.status(404).json({
        success: false,
        error: 'Storefront not found'
      });
    }

    // Create order
    const [order] = await sequelize.query(
      `INSERT INTO storefront_orders (
        storefront_id,
        customer_name,
        customer_email,
        customer_phone,
        order_type,
        delivery_address,
        items_json,
        subtotal_amount,
        tax_amount,
        delivery_fee,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        special_instructions,
        created_at
      ) VALUES (
        :storefrontId,
        :customerName,
        :customerEmail,
        :customerPhone,
        :orderType,
        :deliveryAddress,
        :itemsJson,
        :subtotal,
        :tax,
        :deliveryFee,
        :total,
        :paymentMethod,
        :paymentStatus,
        'pending',
        :notes,
        NOW()
      ) RETURNING *`,
      {
        replacements: {
          storefrontId: storefront.id,
          customerName: `${customerInfo.firstName} ${customerInfo.lastName}`,
          customerEmail: customerInfo.email,
          customerPhone: customerInfo.phone,
          orderType: orderType,
          deliveryAddress: deliveryAddress ? JSON.stringify(deliveryAddress) : null,
          itemsJson: JSON.stringify(items),
          subtotal: pricing.subtotal,
          tax: pricing.tax,
          deliveryFee: pricing.deliveryFee || 0,
          total: pricing.total,
          paymentMethod: paymentMethod,
          paymentStatus: paymentMethod === 'cash' ? 'pending' : 'pending',
          notes: notes || null
        },
        type: QueryTypes.INSERT
      }
    );

    // Create CRM contact
    try {
      await sequelize.query(
        `INSERT INTO storefront_visitors (
          storefront_id,
          email,
          phone,
          first_name,
          last_name,
          total_orders,
          lifetime_value,
          created_at
        ) VALUES (
          :storefrontId,
          :email,
          :phone,
          :firstName,
          :lastName,
          1,
          :total,
          NOW()
        )
        ON CONFLICT (storefront_id, email)
        DO UPDATE SET
          total_orders = storefront_visitors.total_orders + 1,
          lifetime_value = storefront_visitors.lifetime_value + :total,
          last_order_at = NOW()`,
        {
          replacements: {
            storefrontId: storefront.id,
            email: customerInfo.email,
            phone: customerInfo.phone,
            firstName: customerInfo.firstName,
            lastName: customerInfo.lastName,
            total: pricing.total
          },
          type: QueryTypes.INSERT
        }
      );
    } catch (crmError) {
      logger.error('[Storefront Orders] CRM contact creation error:', crmError);
      // Don't fail order if CRM creation fails
    }

    // Update storefront analytics
    await sequelize.query(
      `UPDATE storefront_businesses
       SET total_orders = COALESCE(total_orders, 0) + 1,
           total_revenue = COALESCE(total_revenue, 0) + :total
       WHERE id = :id`,
      {
        replacements: {
          id: storefront.id,
          total: pricing.total
        },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`[Storefront Orders] Order created successfully: ${order[0].id}`);

    res.json({
      success: true,
      order: order[0],
      message: 'Order placed successfully'
    });

  } catch (error) {
    logger.error('[Storefront Orders] Create order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create order'
    });
  }
});

/**
 * GET /api/storefront/orders/:orderId
 * Get order details (for customer tracking)
 */
router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const [order] = await sequelize.query(
      `SELECT o.*, b.business_name, b.business_slug
       FROM storefront_orders o
       JOIN storefront_businesses b ON o.storefront_id = b.id
       WHERE o.id = :orderId`,
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    res.json({
      success: true,
      order
    });

  } catch (error) {
    logger.error('[Storefront Orders] Get order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve order'
    });
  }
});

/**
 * GET /api/storefront/admin/orders
 * Get all orders for admin (authenticated)
 */
router.get('/admin/orders', authenticateToken, async (req, res) => {
  try {
    const { storefrontId, status } = req.query;

    let whereClause = '';
    const replacements = {};

    if (storefrontId) {
      whereClause = 'WHERE o.storefront_id = :storefrontId';
      replacements.storefrontId = storefrontId;
    }

    if (status) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += 'o.order_status = :status';
      replacements.status = status;
    }

    const orders = await sequelize.query(
      `SELECT o.*, b.business_name, b.business_slug
       FROM storefront_orders o
       JOIN storefront_businesses b ON o.storefront_id = b.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT 100`,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      orders
    });

  } catch (error) {
    logger.error('[Storefront Orders] List orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve orders'
    });
  }
});

/**
 * PUT /api/storefront/admin/orders/:orderId/status
 * Update order status (authenticated)
 */
router.put('/admin/orders/:orderId/status', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    await sequelize.query(
      `UPDATE storefront_orders
       SET order_status = :status,
           updated_at = NOW()
       WHERE id = :orderId`,
      {
        replacements: { orderId, status },
        type: QueryTypes.UPDATE
      }
    );

    res.json({
      success: true,
      message: 'Order status updated'
    });

  } catch (error) {
    logger.error('[Storefront Orders] Update status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update order status'
    });
  }
});

module.exports = router;
