// =====================================================
// Photo Studio API Routes
// File: src/routes/photo-studio.js
// Purpose: Photo Studio package purchases (independent from token system)
// =====================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');

// S3 Configuration
let s3Client = null;
const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'ringlypro-uploads';

function getS3Client() {
  if (!s3Client && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }
  return s3Client;
}

// Multer configuration for enhanced photos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 50 // Max 50 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/heic',
      'image/heif',
      'image/webp'
    ];

    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, HEIC, and WebP are allowed.`), false);
    }
  }
});

// Package definitions
const PHOTO_PACKAGES = {
  demo: {
    name: 'Demo',
    price: 1,
    photos_to_upload: 1,
    photos_to_receive: 1,
    description: 'Try our service with 1 photo for just $1'
  },
  starter: {
    name: 'Starter',
    price: 150,
    photos_to_upload: 10,
    photos_to_receive: 10,
    description: 'You send us 10 photos and we send you back 10 professional photos'
  },
  pro: {
    name: 'Pro',
    price: 350,
    photos_to_upload: 10,
    photos_to_receive: 30,
    description: 'You send us 10 photos and we send you back 10 professional photos plus 2 variations of each'
  },
  elite: {
    name: 'Elite',
    price: 500,
    photos_to_upload: 20,
    photos_to_receive: 60,
    description: 'You send us 20 photos and we send you back 20 professional photos plus 2 variations of each'
  }
};

/**
 * GET /api/photo-studio/packages
 * Get available photo studio packages (public endpoint)
 */
router.get('/packages', async (req, res) => {
  try {
    res.json({
      success: true,
      packages: PHOTO_PACKAGES
    });
  } catch (error) {
    logger.error('[PHOTO STUDIO] Get packages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get packages'
    });
  }
});

/**
 * POST /api/photo-studio/create-checkout-session
 * Create Stripe Checkout Session for Photo Studio package purchase
 */
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { package_type } = req.body;

    logger.info(`[PHOTO STUDIO] Creating checkout session for user ${userId}, package: ${package_type}`);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found'
      });
    }

    // Validate package
    const selectedPackage = PHOTO_PACKAGES[package_type];
    if (!selectedPackage) {
      return res.status(400).json({
        success: false,
        error: 'Invalid package type. Must be demo, starter, pro, or elite'
      });
    }

    // Check Stripe configuration
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        success: false,
        error: 'Payment processing not configured'
      });
    }

    // Initialize Stripe
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Create workflow description
    const workflowSteps = `${selectedPackage.description}

How It Works:
1. Complete payment for your photos
2. PixlyPro receives your request and begins processing
3. Upload your photos through our secure portal
4. Processing takes 24-48 hours
5. PixlyPro sends you an email notification when complete
6. Go to PixlyPro.com and click "My Orders" to download
7. Review your enhanced photos and approve or request revisions`;

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `RinglyPro Photo Studio - ${selectedPackage.name} Package`,
              description: workflowSteps,
              images: ['https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/69175f336c431e834ac954b8.png']
            },
            unit_amount: selectedPackage.price * 100, // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com'}/photo-studio-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com'}/photo-studio?canceled=true`,
      client_reference_id: userId.toString(),
      metadata: {
        userId: userId.toString(),
        package_type: package_type,
        photos_to_upload: selectedPackage.photos_to_upload.toString(),
        photos_to_receive: selectedPackage.photos_to_receive.toString(),
        service_type: 'photo_studio' // To differentiate from token purchases
      }
    });

    logger.info(`[PHOTO STUDIO] Created checkout session for user ${userId}: ${session.id}`);

    res.json({
      success: true,
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Create checkout session error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
});

/**
 * GET /api/photo-studio/verify-payment
 * Verify Stripe Checkout Session and create order
 */
router.get('/verify-payment', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { session_id } = req.query;

    logger.info(`[PHOTO STUDIO] Verifying payment for user ${userId}, session: ${session_id}`);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User ID not found'
      });
    }

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    // Initialize Stripe
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Retrieve the session
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Verify the session belongs to this user
    if (session.client_reference_id !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Check if payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed'
      });
    }

    // Check if order already exists for this session
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    const existingOrder = await sequelize.query(
      'SELECT id FROM photo_studio_orders WHERE stripe_session_id = :sessionId',
      {
        replacements: { sessionId: session_id },
        type: QueryTypes.SELECT
      }
    );

    if (existingOrder && existingOrder.length > 0) {
      logger.info(`[PHOTO STUDIO] Order already exists for session ${session_id}`);
      return res.json({
        success: true,
        message: 'Order already created',
        orderId: existingOrder[0].id
      });
    }

    // Get package details from metadata
    const packageType = session.metadata.package_type;
    const photosToUpload = parseInt(session.metadata.photos_to_upload);
    const photosToReceive = parseInt(session.metadata.photos_to_receive);
    const packageInfo = PHOTO_PACKAGES[packageType];

    logger.info(`[PHOTO STUDIO] Creating order for user ${userId}, package: ${packageType}`);

    // Create order in database
    const [order] = await sequelize.query(
      `
      INSERT INTO photo_studio_orders (
        user_id, package_type, price, photos_to_upload, photos_to_receive,
        stripe_session_id, stripe_payment_intent, payment_status, payment_date, order_status
      ) VALUES (
        :userId, :packageType, :price, :photosToUpload, :photosToReceive,
        :stripeSessionId, :stripePaymentIntent, 'paid', NOW(), 'awaiting_upload'
      )
      RETURNING id, order_status, photos_to_upload, photos_to_receive
      `,
      {
        replacements: {
          userId,
          packageType,
          price: packageInfo.price,
          photosToUpload,
          photosToReceive,
          stripeSessionId: session_id,
          stripePaymentIntent: session.payment_intent
        },
        type: QueryTypes.INSERT
      }
    );

    logger.info(`[PHOTO STUDIO] Order created successfully: Order ID ${order[0].id} for user ${userId}`);

    // TODO: Send confirmation email to user with upload instructions

    res.json({
      success: true,
      message: 'Payment verified and order created',
      orderId: order[0].id,
      packageType,
      photosToUpload,
      photosToReceive
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Verify payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify payment'
    });
  }
});

/**
 * GET /api/photo-studio/orders
 * Get user's photo studio orders
 */
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    const orders = await sequelize.query(
      `
      SELECT
        id, package_type, price, photos_to_upload, photos_to_receive, photos_uploaded,
        payment_status, order_status, order_date, payment_date, delivery_date
      FROM photo_studio_orders
      WHERE user_id = :userId
      ORDER BY order_date DESC
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      orders
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Get orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get orders'
    });
  }
});

/**
 * GET /api/photo-studio/order/:orderId
 * Get specific order details
 */
router.get('/order/:orderId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    const [order] = await sequelize.query(
      `
      SELECT
        id, package_type, price, photos_to_upload, photos_to_receive, photos_uploaded,
        payment_status, order_status, order_date, payment_date, upload_completed_date,
        delivery_date, customer_notes
      FROM photo_studio_orders
      WHERE id = :orderId AND user_id = :userId
      `,
      {
        replacements: { orderId, userId },
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
    logger.error('[PHOTO STUDIO] Get order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order'
    });
  }
});

/**
 * PUT /api/photo-studio/admin/order/:orderId/complete
 * Admin endpoint to mark order as completed (triggers customer notification email)
 */
router.put('/admin/order/:orderId/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;
    const { sequelize, User } = require('../models');
    const { QueryTypes } = require('sequelize');

    logger.info(`[PHOTO STUDIO] Admin completing order ${orderId}`);

    // Verify user is admin (Photo Studio admins)
    const [adminUser] = await sequelize.query(
      'SELECT email, is_admin FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    const photoStudioAdmins = ['mstagg@digit2ai.com', 'pixlypro@digit2ai.com'];
    if (!adminUser || (!adminUser.is_admin && !photoStudioAdmins.includes(adminUser.email))) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Get order details and user info
    const [orderDetails] = await sequelize.query(
      `
      SELECT
        o.id, o.user_id, o.package_type, o.photos_to_receive, o.order_status,
        u.email, u.first_name, u.last_name
      FROM photo_studio_orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = :orderId
      `,
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    if (!orderDetails) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (orderDetails.order_status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Order is already marked as completed'
      });
    }

    // Update order status to completed
    await sequelize.query(
      `
      UPDATE photo_studio_orders
      SET order_status = 'completed',
          delivery_date = NOW(),
          updated_at = NOW()
      WHERE id = :orderId
      `,
      {
        replacements: { orderId },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`[PHOTO STUDIO] Order ${orderId} marked as completed`);

    // Send customer notification email
    try {
      const { sendPhotosCompletedEmail } = require('../services/emailService');

      await sendPhotosCompletedEmail({
        email: orderDetails.email,
        firstName: orderDetails.first_name || 'Valued Customer',
        orderId: orderDetails.id,
        packageType: orderDetails.package_type,
        photosDelivered: orderDetails.photos_to_receive
      });

      logger.info(`[PHOTO STUDIO] Completion email sent to ${orderDetails.email} for order ${orderId}`);
    } catch (emailError) {
      // Don't fail the completion if email fails
      logger.error(`[PHOTO STUDIO] Failed to send completion email for order ${orderId}:`, emailError);
    }

    res.json({
      success: true,
      message: 'Order marked as completed and customer notified',
      orderId: orderDetails.id,
      customerEmail: orderDetails.email
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Complete order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete order'
    });
  }
});

/**
 * POST /api/photo-studio/admin/order/:orderId/upload-enhanced
 * Admin endpoint to upload enhanced photos
 */
router.post('/admin/order/:orderId/upload-enhanced', authenticateToken, upload.array('photos', 50), async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;
    const { original_photo_id, replace_enhanced_id } = req.body;
    const files = req.files;

    logger.info(`[PHOTO STUDIO] Admin uploading enhanced photos for order ${orderId}, original_photo_id: ${original_photo_id}, replace_enhanced_id: ${replace_enhanced_id}`);

    // Verify user is admin
    const [adminUser] = await sequelize.query(
      'SELECT email, is_admin FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    const photoStudioAdmins = ['mstagg@digit2ai.com', 'pixlypro@digit2ai.com'];
    if (!adminUser || (!adminUser.is_admin && !photoStudioAdmins.includes(adminUser.email))) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    // Verify order exists
    const [order] = await sequelize.query(
      `SELECT id, user_id, order_status, photos_to_receive
       FROM photo_studio_orders
       WHERE id = :orderId`,
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

    // Get S3 client
    const client = getS3Client();
    if (!client) {
      return res.status(503).json({
        success: false,
        error: 'AWS S3 is not configured'
      });
    }

    // If replacing an existing enhanced photo, delete the old one first
    if (replace_enhanced_id) {
      try {
        logger.info(`[PHOTO STUDIO] Deleting old enhanced photo ${replace_enhanced_id} before uploading replacement`);
        await sequelize.query(
          'DELETE FROM enhanced_photos WHERE id = :enhancedId AND order_id = :orderId',
          {
            replacements: { enhancedId: replace_enhanced_id, orderId },
            type: QueryTypes.DELETE
          }
        );
        logger.info(`[PHOTO STUDIO] Old enhanced photo ${replace_enhanced_id} deleted successfully`);
      } catch (deleteError) {
        logger.error(`[PHOTO STUDIO] Failed to delete old enhanced photo:`, deleteError);
        // Continue anyway - worst case we have duplicate photos
      }
    }

    // Process each enhanced photo
    const uploadResults = [];
    const uploadedFileIds = [];

    for (const file of files) {
      try {
        logger.info(`[PHOTO STUDIO] Processing enhanced photo: ${file.originalname} (${file.size} bytes)`);

        // Get image metadata
        const metadata = await sharp(file.buffer).metadata();

        // Generate storage key for enhanced photos
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname);
        const sanitizedName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
        const storageKey = `uploads/photo_studio/user_${order.user_id}/order_${orderId}/enhanced/${timestamp}_${randomString}_${sanitizedName}${ext}`;

        // Upload to S3
        const putCommand = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: storageKey,
          Body: file.buffer,
          ContentType: file.mimetype,
          ServerSideEncryption: 'AES256'
        });

        await client.send(putCommand);

        // Generate presigned URL (valid for 7 days - AWS S3 maximum)
        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: storageKey
        });

        const signedUrl = await getSignedUrl(client, getCommand, { expiresIn: 604800 }); // 7 days (max allowed by AWS)

        // Save to database
        const [results] = await sequelize.query(
          `INSERT INTO enhanced_photos (
            order_id, original_photo_id, filename, file_size, mime_type, storage_provider,
            storage_bucket, storage_key, storage_url, image_width,
            image_height, image_format, uploaded_by, delivery_status
          ) VALUES (
            :orderId, :originalPhotoId, :filename, :fileSize, :mimeType, 's3',
            :bucket, :storageKey, :storageUrl, :imageWidth,
            :imageHeight, :imageFormat, :uploadedBy, 'ready'
          ) RETURNING *`,
          {
            replacements: {
              orderId,
              originalPhotoId: original_photo_id || null,
              filename: file.originalname,
              fileSize: file.size,
              mimeType: file.mimetype,
              bucket: BUCKET_NAME,
              storageKey,
              storageUrl: signedUrl,
              imageWidth: metadata.width,
              imageHeight: metadata.height,
              imageFormat: metadata.format,
              uploadedBy: userId
            },
            type: QueryTypes.INSERT
          }
        );

        // With QueryTypes.INSERT and RETURNING, first element is the array of returned rows
        const enhancedPhoto = Array.isArray(results) ? results[0] : results;

        logger.info(`[PHOTO STUDIO] Database insert result:`, enhancedPhoto);

        uploadedFileIds.push(enhancedPhoto.id);
        uploadResults.push({
          success: true,
          filename: file.originalname,
          enhancedPhotoId: enhancedPhoto.id,
          url: enhancedPhoto.storage_url
        });

        logger.info(`[PHOTO STUDIO] Enhanced photo uploaded: ${file.originalname} -> ${storageKey}`);

      } catch (error) {
        logger.error(`[PHOTO STUDIO] Failed to upload enhanced photo ${file.originalname}:`, error);
        logger.error(`[PHOTO STUDIO] Error stack:`, error.stack);
        uploadResults.push({
          success: false,
          filename: file.originalname,
          error: error.message,
          errorStack: error.stack // Include stack trace for debugging
        });
      }
    }

    const successfulUploads = uploadResults.filter(r => r.success).length;

    // Get count of enhanced photos for this order
    const [photoCount] = await sequelize.query(
      'SELECT COUNT(*) as count FROM enhanced_photos WHERE order_id = :orderId',
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    logger.info(`[PHOTO STUDIO] Uploaded ${successfulUploads} enhanced photos for order ${orderId}. Total: ${photoCount.count}`);

    // Send email notification to customer
    if (successfulUploads > 0) {
      try {
        const { sendPhotosCompletedEmail } = require('../services/emailService');
        const [customer] = await sequelize.query(
          `SELECT u.email, u.first_name, pso.package_type
           FROM users u
           JOIN photo_studio_orders pso ON pso.user_id = u.id
           WHERE pso.id = :orderId`,
          {
            replacements: { orderId },
            type: QueryTypes.SELECT
          }
        );

        if (customer) {
          await sendPhotosCompletedEmail({
            email: customer.email,
            firstName: customer.first_name || 'Valued Customer',
            orderId: orderId,
            packageType: customer.package_type,
            photosDelivered: parseInt(photoCount.count)
          });
          logger.info(`[PHOTO STUDIO] Email notification sent to ${customer.email} for order ${orderId}`);
        }
      } catch (emailError) {
        logger.error('[PHOTO STUDIO] Failed to send email notification:', emailError);
        // Don't fail the upload if email fails
      }
    }

    res.json({
      success: true,
      message: `Uploaded ${successfulUploads} of ${files.length} enhanced photo(s)`,
      uploads: uploadResults,
      order: {
        id: orderId,
        total_enhanced_photos: parseInt(photoCount.count)
      }
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Upload enhanced photos error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload enhanced photos'
    });
  }
});

/**
 * POST /api/photo-studio/admin/order/:orderId/complete
 * Mark order as completed and send notification email to customer
 */
router.post('/admin/order/:orderId/complete', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const { orderId } = req.params;

    // Verify order exists
    const [order] = await sequelize.query(
      `SELECT pso.id, pso.user_id, pso.package_type, pso.order_status,
              u.email, u.first_name
       FROM photo_studio_orders pso
       JOIN users u ON pso.user_id = u.id
       WHERE pso.id = :orderId`,
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

    // Get enhanced photos count
    const [photoCount] = await sequelize.query(
      'SELECT COUNT(*) as count FROM enhanced_photos WHERE order_id = :orderId',
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    // Update order status to completed
    await sequelize.query(
      `UPDATE photo_studio_orders
       SET order_status = 'completed', updated_at = NOW()
       WHERE id = :orderId`,
      {
        replacements: { orderId },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`[PHOTO STUDIO] Order ${orderId} marked as completed`);

    // Send email notification to customer
    try {
      const { sendPhotosCompletedEmail } = require('../services/emailService');

      await sendPhotosCompletedEmail({
        email: order.email,
        firstName: order.first_name || 'Valued Customer',
        orderId: orderId,
        packageType: order.package_type,
        photosDelivered: parseInt(photoCount.count)
      });

      logger.info(`[PHOTO STUDIO] Completion email sent to ${order.email} for order ${orderId}`);
    } catch (emailError) {
      logger.error('[PHOTO STUDIO] Failed to send completion email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: 'Order marked as completed and customer notified',
      order: {
        id: orderId,
        status: 'completed',
        photosDelivered: parseInt(photoCount.count)
      }
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Complete order error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete order'
    });
  }
});

/**
 * GET /api/photo-studio/order/:orderId/enhanced-photos
 * Get enhanced photos for an order (customer endpoint)
 */
router.get('/order/:orderId/enhanced-photos', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;

    // Verify order belongs to user
    const [order] = await sequelize.query(
      'SELECT id, order_status FROM photo_studio_orders WHERE id = :orderId AND user_id = :userId',
      {
        replacements: { orderId, userId },
        type: QueryTypes.SELECT
      }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Get all enhanced photos for this order with approval status
    const enhancedPhotos = await sequelize.query(
      `SELECT
        id, filename, file_size, mime_type, storage_url,
        image_width, image_height, delivery_status, uploaded_at,
        approval_status, customer_feedback, approved_at, reviewed_at
       FROM enhanced_photos
       WHERE order_id = :orderId
       ORDER BY uploaded_at DESC`,
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      order_id: orderId,
      order_status: order.order_status,
      enhanced_photos: enhancedPhotos,
      total: enhancedPhotos.length
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Get enhanced photos error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get enhanced photos'
    });
  }
});

/**
 * GET /api/photo-studio/enhanced-photo/:photoId/download
 * Generate fresh download URL for enhanced photo
 */
router.get('/enhanced-photo/:photoId/download', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { photoId } = req.params;

    // Get photo and verify user owns the order
    const [photo] = await sequelize.query(
      `SELECT ep.*, pso.user_id
       FROM enhanced_photos ep
       JOIN photo_studio_orders pso ON ep.order_id = pso.id
       WHERE ep.id = :photoId`,
      {
        replacements: { photoId },
        type: QueryTypes.SELECT
      }
    );

    if (!photo) {
      return res.status(404).json({
        success: false,
        error: 'Photo not found'
      });
    }

    if (photo.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Generate fresh presigned URL (valid for 1 hour)
    const client = getS3Client();
    if (!client) {
      return res.status(500).json({
        success: false,
        error: 'S3 storage not configured'
      });
    }

    const getCommand = new GetObjectCommand({
      Bucket: photo.storage_bucket,
      Key: photo.storage_key,
      ResponseContentDisposition: `attachment; filename="${photo.filename}"`
    });

    const downloadUrl = await getSignedUrl(client, getCommand, { expiresIn: 3600 }); // 1 hour

    // Update download tracking
    await sequelize.query(
      `UPDATE enhanced_photos
       SET delivery_status = 'downloaded',
           downloaded_at = CASE WHEN downloaded_at IS NULL THEN NOW() ELSE downloaded_at END
       WHERE id = :photoId`,
      {
        replacements: { photoId },
        type: QueryTypes.UPDATE
      }
    );

    res.json({
      success: true,
      download_url: downloadUrl,
      filename: photo.filename,
      file_size: photo.file_size,
      expires_in: 3600
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Generate download URL error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate download URL'
    });
  }
});

/**
 * POST /api/photo-studio/enhanced-photo/:photoId/approve
 * Approve or reject enhanced photo with optional feedback
 */
router.post('/enhanced-photo/:photoId/approve', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { photoId } = req.params;
    const { approval_status, customer_feedback } = req.body;

    // Validate approval_status
    const validStatuses = ['approved', 'rejected', 'revision_requested'];
    if (!validStatuses.includes(approval_status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid approval status'
      });
    }

    // Get photo and verify user owns the order
    const [photo] = await sequelize.query(
      `SELECT ep.*, pso.user_id, pso.id as order_id
       FROM enhanced_photos ep
       JOIN photo_studio_orders pso ON ep.order_id = pso.id
       WHERE ep.id = :photoId`,
      {
        replacements: { photoId },
        type: QueryTypes.SELECT
      }
    );

    if (!photo) {
      return res.status(404).json({
        success: false,
        error: 'Photo not found'
      });
    }

    if (photo.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Update photo approval status
    await sequelize.query(
      `UPDATE enhanced_photos
       SET approval_status = :approval_status,
           customer_feedback = :customer_feedback,
           reviewed_at = NOW(),
           approved_at = CASE WHEN :approval_status = 'approved' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = :photoId`,
      {
        replacements: {
          photoId,
          approval_status,
          customer_feedback: customer_feedback || null
        },
        type: QueryTypes.UPDATE
      }
    );

    // If revision requested, update order status back to 'processing'
    if (approval_status === 'revision_requested') {
      await sequelize.query(
        `UPDATE photo_studio_orders
         SET order_status = 'processing',
             updated_at = NOW()
         WHERE id = :orderId`,
        {
          replacements: { orderId: photo.order_id },
          type: QueryTypes.UPDATE
        }
      );
      logger.info(`[PHOTO STUDIO] Order ${photo.order_id} status changed to 'processing' due to revision request`);
    }

    // Create communication record
    await sequelize.query(
      `INSERT INTO photo_communications
        (order_id, enhanced_photo_id, from_user_id, from_type, to_type,
         subject, message, communication_type, status)
       VALUES
        (:orderId, :photoId, :userId, 'customer', 'admin',
         :subject, :message, :commType, 'unread')`,
      {
        replacements: {
          orderId: photo.order_id,
          photoId,
          userId,
          subject: approval_status === 'approved'
            ? `Photo Approved - Order #${photo.order_id}`
            : approval_status === 'rejected'
            ? `Photo Rejected - Order #${photo.order_id}`
            : `Revision Requested - Order #${photo.order_id}`,
          message: customer_feedback || `Photo ${approval_status}`,
          commType: approval_status === 'revision_requested' ? 'revision_request' : approval_status
        },
        type: QueryTypes.INSERT
      }
    );

    // Send email notification to admin if revision requested or rejected
    if (approval_status === 'revision_requested' || approval_status === 'rejected') {
      try {
        const { sendPhotoFeedbackNotification } = require('../services/emailService');

        // Get user details
        const [user] = await sequelize.query(
          'SELECT first_name, last_name, email FROM users WHERE id = :userId',
          {
            replacements: { userId },
            type: QueryTypes.SELECT
          }
        );

        if (user) {
          const customerName = `${user.first_name} ${user.last_name}`.trim() || 'Customer';

          await sendPhotoFeedbackNotification({
            orderId: photo.order_id,
            photoId,
            customerName,
            customerEmail: user.email,
            approvalStatus: approval_status,
            feedback: customer_feedback || 'No feedback provided',
            photoFilename: photo.filename
          });

          logger.info(`[PHOTO STUDIO] Feedback notification sent for photo ${photoId}`);
        }
      } catch (emailError) {
        // Don't fail the request if email fails
        logger.error(`[PHOTO STUDIO] Failed to send feedback notification:`, emailError);
      }
    }

    res.json({
      success: true,
      message: `Photo ${approval_status}`,
      photo_id: photoId,
      approval_status
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Photo approval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update photo approval status'
    });
  }
});

/**
 * GET /api/photo-studio/admin/all-orders
 * Get all orders with enhanced photos for admin dashboard
 */
router.get('/admin/all-orders', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    // Verify admin access
    const userId = req.user.userId || req.user.id;
    const [user] = await sequelize.query(
      'SELECT is_admin FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!user || !user.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Get all orders with customer info and enhanced photos
    const orders = await sequelize.query(
      `SELECT
        pso.id, pso.package_type, pso.order_status, pso.order_date, pso.price,
        pso.photos_to_upload, pso.photos_uploaded,
        u.first_name, u.last_name, u.email as customer_email,
        (SELECT json_agg(json_build_object(
          'id', ep.id,
          'filename', ep.filename,
          'approval_status', ep.approval_status,
          'customer_feedback', ep.customer_feedback
        )) FROM enhanced_photos ep WHERE ep.order_id = pso.id) as enhanced_photos
       FROM photo_studio_orders pso
       JOIN users u ON pso.user_id = u.id
       WHERE pso.order_status IN ('processing', 'completed')
       ORDER BY pso.order_date DESC`,
      { type: QueryTypes.SELECT }
    );

    // Format orders
    const formattedOrders = orders.map(order => ({
      ...order,
      customer_name: `${order.first_name || ''} ${order.last_name || ''}`.trim() || 'Unknown',
      enhanced_photos: order.enhanced_photos || []
    }));

    res.json({
      success: true,
      orders: formattedOrders,
      total: formattedOrders.length
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO ADMIN] Get all orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get orders'
    });
  }
});

/**
 * GET /api/photo-studio/admin/order/:orderId/details
 * Get detailed order information including photos and communications
 */
router.get('/admin/order/:orderId/details', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    // Verify admin access
    const userId = req.user.userId || req.user.id;
    const [user] = await sequelize.query(
      'SELECT is_admin FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!user || !user.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { orderId } = req.params;

    // Get order details
    let order;
    try {
      [order] = await sequelize.query(
        `SELECT
          pso.*, u.first_name, u.last_name, u.email as customer_email
         FROM photo_studio_orders pso
         JOIN users u ON pso.user_id = u.id
         WHERE pso.id = :orderId`,
        {
          replacements: { orderId },
          type: QueryTypes.SELECT
        }
      );
    } catch (orderError) {
      console.error('[PHOTO STUDIO] Failed to get order:', orderError.message);
      throw new Error(`Failed to get order: ${orderError.message}`);
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Get enhanced photos (may not exist yet)
    let enhancedPhotos = [];
    try {
      enhancedPhotos = await sequelize.query(
        `SELECT * FROM enhanced_photos WHERE order_id = :orderId ORDER BY uploaded_at ASC`,
        {
          replacements: { orderId },
          type: QueryTypes.SELECT
        }
      );
    } catch (enhancedError) {
      console.warn('[PHOTO STUDIO] Enhanced photos table not found:', enhancedError.message);
    }

    // Get original photos
    let originalPhotos = [];
    try {
      originalPhotos = await sequelize.query(
        `SELECT * FROM photo_uploads
         WHERE service_order_id = :orderId
         AND service_type = 'photo_studio'
         ORDER BY uploaded_at ASC`,
        {
          replacements: { orderId },
          type: QueryTypes.SELECT
        }
      );
    } catch (photoError) {
      console.warn('[PHOTO STUDIO] Photo uploads table not found:', photoError.message);
    }

    // Get communications (gracefully handle if table doesn't exist yet)
    let communications = [];
    try {
      communications = await sequelize.query(
        `SELECT * FROM photo_communications WHERE order_id = :orderId ORDER BY created_at DESC`,
        {
          replacements: { orderId },
          type: QueryTypes.SELECT
        }
      );
    } catch (commError) {
      console.warn('[PHOTO STUDIO] Communications table not found, skipping:', commError.message);
      // Table doesn't exist yet - that's okay, return empty array
    }

    res.json({
      success: true,
      order: {
        ...order,
        customer_name: `${order.first_name || ''} ${order.last_name || ''}`.trim() || 'Unknown'
      },
      enhanced_photos: enhancedPhotos,
      original_photos: originalPhotos,
      communications: communications
    });

  } catch (error) {
    console.error('[PHOTO STUDIO ADMIN] Get order details error:', error);
    console.error('Error stack:', error.stack);
    logger.error('[PHOTO STUDIO ADMIN] Get order details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get order details',
      details: error.message
    });
  }
});

/**
 * POST /api/photo-studio/admin/order/:orderId/send-message
 * Send email message to customer
 */
router.post('/admin/order/:orderId/send-message', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    // Verify admin access
    const userId = req.user.userId || req.user.id;
    const [user] = await sequelize.query(
      'SELECT is_admin FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!user || !user.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    const { orderId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Get order and customer details
    const [order] = await sequelize.query(
      `SELECT
        pso.id, u.email, u.first_name, u.last_name
       FROM photo_studio_orders pso
       JOIN users u ON pso.user_id = u.id
       WHERE pso.id = :orderId`,
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

    // Send email
    const { sendAdminMessageToCustomer } = require('../services/emailService');
    await sendAdminMessageToCustomer({
      email: order.email,
      firstName: order.first_name,
      orderId,
      message
    });

    // Record communication
    await sequelize.query(
      `INSERT INTO photo_communications
        (order_id, from_user_id, from_type, to_type, subject, message, communication_type, status)
       VALUES
        (:orderId, :userId, 'admin', 'customer', :subject, :message, 'general', 'unread')`,
      {
        replacements: {
          orderId,
          userId,
          subject: `Message from Admin - Order #${orderId}`,
          message
        },
        type: QueryTypes.INSERT
      }
    );

    res.json({
      success: true,
      message: 'Email sent successfully'
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO ADMIN] Send message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

/**
 * GET /api/photo-studio/order/:orderId/communications
 * Get all communications for an order (customer endpoint)
 */
router.get('/order/:orderId/communications', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;

    // Verify user owns this order
    const [order] = await sequelize.query(
      'SELECT id, user_id FROM photo_studio_orders WHERE id = :orderId',
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

    if (order.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get all communications for this order
    const communications = await sequelize.query(
      `SELECT * FROM photo_communications
       WHERE order_id = :orderId
       ORDER BY created_at DESC`,
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      communications: communications
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Get communications error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get communications'
    });
  }
});

/**
 * POST /api/photo-studio/order/:orderId/send-message-to-admin
 * Customer sends message to admin about their order
 */
router.post('/order/:orderId/send-message-to-admin', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Verify user owns this order
    const [order] = await sequelize.query(
      'SELECT id, user_id FROM photo_studio_orders WHERE id = :orderId',
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

    if (order.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const subject = `Customer Message - Order #${orderId}`;

    // Record communication in database
    await sequelize.query(
      `INSERT INTO photo_communications
        (order_id, from_user_id, from_type, to_type, subject, message, communication_type, status)
       VALUES
        (:orderId, :userId, 'customer', 'admin', :subject, :message, 'general', 'unread')`,
      {
        replacements: {
          orderId,
          userId,
          subject,
          message: message.trim()
        },
        type: QueryTypes.INSERT
      }
    );

    logger.info(`[PHOTO STUDIO] Customer message sent for order ${orderId}`);

    // TODO: Send email notification to admin
    // For now, admin will see it in the dashboard communications section

    res.json({
      success: true,
      message: 'Message sent to admin successfully'
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Send customer message error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

/**
 * POST /api/photo-studio/register
 * Simple registration for Photo Studio customers (no Twilio provisioning)
 */
router.post('/register', async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');
  const bcrypt = require('bcrypt');
  const jwt = require('jsonwebtoken');

  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body;

    logger.info(`[PHOTO STUDIO] Registration attempt:`, {
      email,
      firstName,
      lastName
    });

    // Validate required fields
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters'
      });
    }

    // Check if user already exists
    const [existingUser] = await sequelize.query(
      'SELECT id FROM users WHERE email = :email',
      {
        replacements: { email: email.toLowerCase() },
        type: QueryTypes.SELECT
      }
    );

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Normalize phone number
    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    // Create user (Photo Studio customer - no Twilio provisioning)
    const [result] = await sequelize.query(
      `INSERT INTO users (
        first_name, last_name, email, phone_number, password_hash,
        business_name, business_phone, business_type,
        created_at, updated_at
      ) VALUES (
        :firstName, :lastName, :email, :phoneNumber, :password,
        :businessName, :businessPhone, 'other',
        NOW(), NOW()
      ) RETURNING id`,
      {
        replacements: {
          firstName,
          lastName,
          email: email.toLowerCase(),
          phoneNumber: normalizedPhone,
          password: hashedPassword,
          businessName: `${firstName}'s Photos`,
          businessPhone: normalizedPhone
        },
        type: QueryTypes.INSERT
      }
    );

    const userId = Array.isArray(result) ? result[0].id : result.id;

    logger.info(`[PHOTO STUDIO] User created successfully:`, {
      userId,
      email,
      name: `${firstName} ${lastName}`
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId, email: email.toLowerCase() },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        id: userId,
        firstName,
        lastName,
        email: email.toLowerCase()
      }
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
});

// =====================================================
// DESIGN BRIEF ENDPOINTS (Customer & Admin)
// =====================================================

/**
 * POST /api/photo-studio/order/:orderId/brief
 * Create or update design brief for an order (customer endpoint)
 */
router.post('/order/:orderId/brief', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;
    const briefData = req.body;

    logger.info(`[PHOTO STUDIO] Creating/updating design brief for order ${orderId}`);

    // Verify user owns this order
    const [order] = await sequelize.query(
      'SELECT id, user_id FROM photo_studio_orders WHERE id = :orderId',
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

    if (order.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Validate required fields
    if (!briefData.business_name || !briefData.primary_design_need || !briefData.design_goal) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: business_name, primary_design_need, design_goal'
      });
    }

    // Check if brief already exists
    const [existingBrief] = await sequelize.query(
      'SELECT id FROM photo_studio_design_briefs WHERE order_id = :orderId',
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    let brief;

    if (existingBrief) {
      // Update existing brief
      await sequelize.query(
        `UPDATE photo_studio_design_briefs
         SET business_name = :businessName,
             business_type = :businessType,
             website = :website,
             business_phone = :businessPhone,
             location_city = :locationCity,
             location_country = :locationCountry,
             primary_design_need = :primaryDesignNeed,
             design_goal = :designGoal,
             target_audience = :targetAudience,
             usage_channels = :usageChannels,
             brand_colors = :brandColors,
             brand_fonts = :brandFonts,
             style_reference_links = :styleReferenceLinks,
             logo_present = :logoPresent,
             logo_notes = :logoNotes,
             copy_status = :copyStatus,
             main_headline = :mainHeadline,
             key_offers_or_items = :keyOffersOrItems,
             special_requirements = :specialRequirements,
             languages = :languages,
             updated_at = NOW()
         WHERE order_id = :orderId
         RETURNING *`,
        {
          replacements: {
            orderId,
            businessName: briefData.business_name,
            businessType: briefData.business_type || 'Restaurant',
            website: briefData.website || null,
            businessPhone: briefData.business_phone || null,
            locationCity: briefData.location_city || null,
            locationCountry: briefData.location_country || null,
            primaryDesignNeed: briefData.primary_design_need,
            designGoal: briefData.design_goal,
            targetAudience: briefData.target_audience || null,
            usageChannels: briefData.usage_channels || null,
            brandColors: briefData.brand_colors || null,
            brandFonts: briefData.brand_fonts || null,
            styleReferenceLinks: briefData.style_reference_links || null,
            logoPresent: briefData.logo_present || false,
            logoNotes: briefData.logo_notes || null,
            copyStatus: briefData.copy_status || 'designer_writes_copy',
            mainHeadline: briefData.main_headline || null,
            keyOffersOrItems: briefData.key_offers_or_items || null,
            specialRequirements: briefData.special_requirements || null,
            languages: briefData.languages || null
          },
          type: QueryTypes.UPDATE
        }
      );

      [brief] = await sequelize.query(
        'SELECT * FROM photo_studio_design_briefs WHERE order_id = :orderId',
        {
          replacements: { orderId },
          type: QueryTypes.SELECT
        }
      );

      logger.info(`[PHOTO STUDIO] Design brief updated for order ${orderId}`);
    } else {
      // Create new brief
      const [results] = await sequelize.query(
        `INSERT INTO photo_studio_design_briefs (
          order_id, business_name, business_type, website, business_phone,
          location_city, location_country, primary_design_need, design_goal,
          target_audience, usage_channels, brand_colors, brand_fonts,
          style_reference_links, logo_present, logo_notes, copy_status,
          main_headline, key_offers_or_items, special_requirements, languages
         ) VALUES (
          :orderId, :businessName, :businessType, :website, :businessPhone,
          :locationCity, :locationCountry, :primaryDesignNeed, :designGoal,
          :targetAudience, :usageChannels, :brandColors, :brandFonts,
          :styleReferenceLinks, :logoPresent, :logoNotes, :copyStatus,
          :mainHeadline, :keyOffersOrItems, :specialRequirements, :languages
         ) RETURNING *`,
        {
          replacements: {
            orderId,
            businessName: briefData.business_name,
            businessType: briefData.business_type || 'Restaurant',
            website: briefData.website || null,
            businessPhone: briefData.business_phone || null,
            locationCity: briefData.location_city || null,
            locationCountry: briefData.location_country || null,
            primaryDesignNeed: briefData.primary_design_need,
            designGoal: briefData.design_goal,
            targetAudience: briefData.target_audience || null,
            usageChannels: briefData.usage_channels || null,
            brandColors: briefData.brand_colors || null,
            brandFonts: briefData.brand_fonts || null,
            styleReferenceLinks: briefData.style_reference_links || null,
            logoPresent: briefData.logo_present || false,
            logoNotes: briefData.logo_notes || null,
            copyStatus: briefData.copy_status || 'designer_writes_copy',
            mainHeadline: briefData.main_headline || null,
            keyOffersOrItems: briefData.key_offers_or_items || null,
            specialRequirements: briefData.special_requirements || null,
            languages: briefData.languages || null
          },
          type: QueryTypes.INSERT
        }
      );

      brief = results[0];
      logger.info(`[PHOTO STUDIO] Design brief created for order ${orderId}`);
    }

    res.json({
      success: true,
      brief,
      message: existingBrief ? 'Design brief updated' : 'Design brief created'
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Create/update design brief error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save design brief'
    });
  }
});

/**
 * PUT /api/photo-studio/order/:orderId/brief
 * Update design brief (alias for POST - supports both)
 */
router.put('/order/:orderId/brief', authenticateToken, async (req, res) => {
  // Just forward to POST endpoint
  return router.handle(
    Object.assign(req, { method: 'POST' }),
    res
  );
});

/**
 * GET /api/photo-studio/order/:orderId/brief
 * Get design brief for an order (customer or admin)
 */
router.get('/order/:orderId/brief', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;

    // Check if user is admin
    const [user] = await sequelize.query(
      'SELECT email, is_admin FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    const photoStudioAdmins = ['mstagg@digit2ai.com', 'pixlypro@digit2ai.com'];
    const isAdmin = user && (user.is_admin || photoStudioAdmins.includes(user.email));

    if (!isAdmin) {
      // Verify user owns this order
      const [order] = await sequelize.query(
        'SELECT id, user_id FROM photo_studio_orders WHERE id = :orderId',
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

      if (order.user_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }

    // Get design brief
    const [brief] = await sequelize.query(
      'SELECT * FROM photo_studio_design_briefs WHERE order_id = :orderId',
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    if (!brief) {
      return res.json({
        success: true,
        brief: null,
        exists: false
      });
    }

    res.json({
      success: true,
      brief,
      exists: true
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Get design brief error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get design brief'
    });
  }
});

// =====================================================
// AI DESIGN ASSISTANT ENDPOINTS (Admin Only)
// =====================================================

const { generateDesignContent } = require('../services/aiDesignAssistant');

/**
 * POST /api/photo-studio/admin/order/:orderId/ai/generate
 * Generate AI content for an order (admin only)
 */
router.post('/admin/order/:orderId/ai/generate', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;
    const { mode, extraInstructions, preferredModel } = req.body;

    logger.info(`[PHOTO STUDIO] AI generation request - Order: ${orderId}, Mode: ${mode}`);

    // Verify user is admin
    const [adminUser] = await sequelize.query(
      'SELECT email, is_admin FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    const photoStudioAdmins = ['mstagg@digit2ai.com', 'pixlypro@digit2ai.com'];
    if (!adminUser || (!adminUser.is_admin && !photoStudioAdmins.includes(adminUser.email))) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Validate mode
    const validModes = ['menu', 'flyer', 'social', 'generic'];
    if (!mode || !validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        error: `Invalid mode. Must be one of: ${validModes.join(', ')}`
      });
    }

    // Load order
    const [order] = await sequelize.query(
      'SELECT * FROM photo_studio_orders WHERE id = :orderId',
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

    // Load design brief
    const [brief] = await sequelize.query(
      'SELECT * FROM photo_studio_design_briefs WHERE order_id = :orderId',
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    if (!brief) {
      logger.warn(`[PHOTO STUDIO] No design brief for order ${orderId}, proceeding with limited context`);
    }

    // Load photo metadata (optional)
    const photos = await sequelize.query(
      `SELECT filename, file_size, mime_type, uploaded_at
       FROM photo_uploads
       WHERE order_id = :orderId
       ORDER BY uploaded_at DESC
       LIMIT 10`,
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    // Call AI Design Assistant
    const aiResult = await generateDesignContent({
      mode,
      brief,
      order,
      photos,
      extraInstructions: extraInstructions || ''
    });

    // Save AI output to database
    const [results] = await sequelize.query(
      `INSERT INTO photo_studio_ai_outputs (
        order_id, mode, request_context, model_name, output_json, raw_text, created_by_admin_id
       ) VALUES (
        :orderId, :mode, :requestContext, :modelName, :outputJson, :rawText, :adminId
       ) RETURNING *`,
      {
        replacements: {
          orderId,
          mode,
          requestContext: JSON.stringify({ brief, order, photos, extraInstructions, fallback: aiResult.fallback || false }),
          modelName: aiResult.model,
          outputJson: JSON.stringify(aiResult.content),
          rawText: aiResult.rawText,
          adminId: userId
        },
        type: QueryTypes.INSERT
      }
    );

    logger.info(`[PHOTO STUDIO] AI output generated and saved for order ${orderId}, mode: ${mode}`);

    res.json({
      success: true,
      mode,
      model: aiResult.model,
      content: aiResult.content,
      rawText: aiResult.rawText,
      tokensUsed: aiResult.tokensUsed,
      fallback: aiResult.fallback || false,
      aiOutput: results[0]
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] AI generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate AI content',
      details: error.message
    });
  }
});

/**
 * GET /api/photo-studio/admin/order/:orderId/ai/outputs
 * List all AI outputs for an order (admin only)
 */
router.get('/admin/order/:orderId/ai/outputs', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;

    // Verify user is admin
    const [adminUser] = await sequelize.query(
      'SELECT email, is_admin FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    const photoStudioAdmins = ['mstagg@digit2ai.com', 'pixlypro@digit2ai.com'];
    if (!adminUser || (!adminUser.is_admin && !photoStudioAdmins.includes(adminUser.email))) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Get all AI outputs for this order
    const outputs = await sequelize.query(
      `SELECT
        id, order_id, mode, model_name, output_json, raw_text,
        created_by_admin_id, created_at
       FROM photo_studio_ai_outputs
       WHERE order_id = :orderId
       ORDER BY created_at DESC`,
      {
        replacements: { orderId },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      orderId,
      outputs,
      total: outputs.length
    });

  } catch (error) {
    logger.error('[PHOTO STUDIO] Get AI outputs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI outputs'
    });
  }
});

module.exports = router;
