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

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `RinglyPro Photo Studio - ${selectedPackage.name} Package`,
              description: selectedPackage.description,
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

    // Verify user is admin (mstagg@digit2ai.com)
    const [adminUser] = await sequelize.query(
      'SELECT email, is_admin FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!adminUser || (!adminUser.is_admin && adminUser.email !== 'mstagg@digit2ai.com')) {
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
    const files = req.files;

    logger.info(`[PHOTO STUDIO] Admin uploading enhanced photos for order ${orderId}`);

    // Verify user is admin
    const [adminUser] = await sequelize.query(
      'SELECT email, is_admin FROM users WHERE id = :userId',
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!adminUser || (!adminUser.is_admin && adminUser.email !== 'mstagg@digit2ai.com')) {
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

        // Generate presigned URL (valid for 30 days)
        const getCommand = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: storageKey
        });

        const signedUrl = await getSignedUrl(client, getCommand, { expiresIn: 2592000 }); // 30 days

        // Save to database
        const [enhancedPhoto] = await sequelize.query(
          `INSERT INTO enhanced_photos (
            order_id, filename, file_size, mime_type, storage_provider,
            storage_bucket, storage_key, storage_url, image_width,
            image_height, image_format, uploaded_by, delivery_status
          ) VALUES (
            :orderId, :filename, :fileSize, :mimeType, 's3',
            :bucket, :storageKey, :storageUrl, :imageWidth,
            :imageHeight, :imageFormat, :uploadedBy, 'ready'
          ) RETURNING id, storage_key, storage_url`,
          {
            replacements: {
              orderId,
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

        uploadedFileIds.push(enhancedPhoto[0].id);
        uploadResults.push({
          success: true,
          filename: file.originalname,
          enhancedPhotoId: enhancedPhoto[0].id,
          url: enhancedPhoto[0].storage_url
        });

        logger.info(`[PHOTO STUDIO] Enhanced photo uploaded: ${file.originalname} -> ${storageKey}`);

      } catch (error) {
        logger.error(`[PHOTO STUDIO] Failed to upload enhanced photo ${file.originalname}:`, error);
        uploadResults.push({
          success: false,
          filename: file.originalname,
          error: error.message
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

    // Get all enhanced photos for this order
    const enhancedPhotos = await sequelize.query(
      `SELECT
        id, filename, file_size, mime_type, storage_url,
        image_width, image_height, delivery_status, uploaded_at
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

module.exports = router;
