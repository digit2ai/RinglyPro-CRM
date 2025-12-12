// =====================================================
// PixlyPro API Routes
// File: src/routes/pixlypro.js
// Purpose: AI-Assisted Photo Enhancement Service
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
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pixelixeService = require('../services/pixelixeService');

// Helper function to generate presigned URL for S3 objects
async function getPresignedUrl(s3Client, bucket, key, expiresIn = 900) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(s3Client, command, { expiresIn });
}

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

// Multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 100 // Max 100 files per request
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

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  }
});

// =====================================================
// PRICING & PACKAGES
// =====================================================

const PIXLYPRO_PACKAGES = {
  demo: {
    name: 'Demo',
    price: 0.50,
    photos_to_upload: 1,
    photos_to_receive: 1,
    description: 'Try our AI-assisted enhancement with 1 photo for just $0.50'
  },
  starter: {
    name: 'Starter',
    price: 5,
    photos_to_upload: 10,
    photos_to_receive: 10,
    description: 'Perfect for small businesses - 10 AI-enhanced photos at $0.50 each'
  },
  professional: {
    name: 'Professional',
    price: 10,
    photos_to_upload: 20,
    photos_to_receive: 20,
    description: 'Ideal for marketing campaigns - 20 AI-enhanced photos at $0.50 each'
  },
  premium: {
    name: 'Premium',
    price: 20,
    photos_to_upload: 40,
    photos_to_receive: 40,
    description: 'Best value for businesses - 40 AI-enhanced photos at $0.50 each'
  }
};

/**
 * GET /api/pixlypro/packages
 * Get available PixlyPro packages
 */
router.get('/packages', async (req, res) => {
  try {
    res.json({
      success: true,
      packages: PIXLYPRO_PACKAGES,
      ai_powered: pixelixeService.isConfigured()
    });
  } catch (error) {
    logger.error('[PIXLYPRO] Get packages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get packages'
    });
  }
});

/**
 * POST /api/pixlypro/calculate-price
 * Calculate price based on number of photos
 */
router.post('/calculate-price', async (req, res) => {
  try {
    const { photoCount } = req.body;

    if (!photoCount || photoCount < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid photo count'
      });
    }

    // Simple pricing: $0.50 per photo
    const price = photoCount * 0.50;

    res.json({
      success: true,
      photoCount,
      totalPrice: price,
      pricePerPhoto: (price / photoCount).toFixed(2)
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Calculate price error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate price'
    });
  }
});

/**
 * POST /api/pixlypro/upload-temp-photos
 * Upload photos to S3 temporarily before payment
 */
router.post('/upload-temp-photos', authenticateToken, upload.array('photos', 100), async (req, res) => {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const sharp = require('sharp');
  const crypto = require('crypto');
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const photos = req.files;

    if (!photos || photos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No photos uploaded'
      });
    }

    const TEMP_BUCKET_NAME = process.env.AWS_S3_BUCKET || 'ringlypro-uploads';
    const s3 = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    const uploadedPhotos = [];

    // Upload each photo to S3 in a temp folder
    for (const photo of photos) {
      try {
        const tempId = crypto.randomBytes(16).toString('hex');
        const filename = `pixlypro/temp/${userId}/${tempId}.png`;

        // Convert to PNG if needed
        let imageBuffer = photo.buffer;
        if (photo.mimetype !== 'image/png') {
          imageBuffer = await sharp(photo.buffer).png().toBuffer();
        }

        await s3.send(new PutObjectCommand({
          Bucket: TEMP_BUCKET_NAME,
          Key: filename,
          Body: imageBuffer,
          ContentType: 'image/png',
          // Note: ACL removed - bucket uses bucket policy for public access
        }));

        const url = `https://${TEMP_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${filename}`;

        logger.info(`[PIXLYPRO] Uploaded temp photo: ${url}`);

        uploadedPhotos.push({
          tempId,
          filename: photo.originalname,
          url
        });

      } catch (photoError) {
        logger.error(`[PIXLYPRO] Error uploading photo ${photo.originalname}:`, photoError.message);
      }
    }

    logger.info(`[PIXLYPRO] Uploaded ${uploadedPhotos.length} temp photos for user ${userId}`);

    res.json({
      success: true,
      photoIds: uploadedPhotos.map(p => p.tempId),
      photos: uploadedPhotos
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Upload temp photos error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload photos'
    });
  }
});

/**
 * POST /api/pixlypro/create-checkout-session
 * Create Stripe checkout session for PixlyPro
 */
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { packageType, photoCount, totalAmount, tempPhotoIds } = req.body;

    // Validate input
    if (!packageType || !photoCount || !totalAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Create order in database
    const [order] = await sequelize.query(
      `INSERT INTO pixlypro_orders (user_id, package_type, total_amount, photo_count, order_status, payment_status, created_at)
       VALUES (:userId, :packageType, :totalAmount, :photoCount, 'awaiting_upload', 'pending', NOW())
       RETURNING id`,
      {
        replacements: { userId, packageType, totalAmount, photoCount },
        type: QueryTypes.INSERT
      }
    );

    const orderId = order[0].id;

    // Store temp photo IDs with the order
    if (tempPhotoIds && tempPhotoIds.length > 0) {
      logger.info(`[PIXLYPRO] Storing ${tempPhotoIds.length} temp photo IDs for order ${orderId}`);

      // Store the temp photo IDs as JSON in the order
      await sequelize.query(
        `UPDATE pixlypro_orders SET temp_photo_ids = :tempPhotoIds WHERE id = :orderId`,
        {
          replacements: {
            tempPhotoIds: JSON.stringify(tempPhotoIds),
            orderId
          },
          type: QueryTypes.UPDATE
        }
      );
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `PixlyPro Photo Enhancement`,
            description: `AI-enhanced ${photoCount} photo${photoCount > 1 ? 's' : ''} at $0.50 each`,
          },
          unit_amount: Math.round(totalAmount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/pixlypro-upload?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/pixlypro-upload?canceled=true&order_id=${orderId}`,
      client_reference_id: orderId.toString(),
      metadata: {
        order_id: orderId.toString(),
        user_id: userId.toString(),
        service: 'pixlypro',
        photo_count: photoCount.toString()
      }
    });

    // Update order with session ID
    await sequelize.query(
      `UPDATE pixlypro_orders SET stripe_session_id = :sessionId WHERE id = :orderId`,
      {
        replacements: { sessionId: session.id, orderId },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`[PIXLYPRO] Checkout session created for order ${orderId}`);

    res.json({
      success: true,
      sessionId: session.id,
      sessionUrl: session.url,
      orderId
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Create checkout session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout session'
    });
  }
});

/**
 * GET /api/pixlypro/verify-payment
 * Verify payment and activate order
 */
router.get('/verify-payment', authenticateToken, async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const { session_id, order_id } = req.query;

    if (!session_id || !order_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing session_id or order_id'
      });
    }

    // Get Stripe session
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid') {
      // Update order
      await sequelize.query(
        `UPDATE pixlypro_orders
         SET payment_status = 'completed',
             stripe_payment_intent_id = :paymentIntentId,
             paid_at = NOW(),
             updated_at = NOW()
         WHERE id = :orderId`,
        {
          replacements: {
            paymentIntentId: session.payment_intent,
            orderId: order_id
          },
          type: QueryTypes.UPDATE
        }
      );

      logger.info(`[PIXLYPRO] Payment verified for order ${order_id}`);

      res.json({
        success: true,
        message: 'Payment verified',
        orderId: order_id
      });
    } else {
      res.json({
        success: false,
        error: 'Payment not completed'
      });
    }

  } catch (error) {
    logger.error('[PIXLYPRO] Verify payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify payment'
    });
  }
});

/**
 * POST /api/pixlypro/upload-temp
 * Upload photo temporarily to S3 for AI enhancement
 */
router.post('/upload-temp', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const s3 = getS3Client();
    if (!s3) {
      return res.status(500).json({
        success: false,
        error: 'S3 not configured'
      });
    }

    // Generate unique filename
    const fileExt = path.extname(req.file.originalname);
    const filename = `pixlypro/temp/${crypto.randomBytes(16).toString('hex')}${fileExt}`;

    // Convert image to PNG if needed (for Pixelixe compatibility)
    let imageBuffer = req.file.buffer;
    let contentType = req.file.mimetype;

    if (req.file.mimetype !== 'image/png') {
      imageBuffer = await sharp(req.file.buffer).png().toBuffer();
      contentType = 'image/png';
    }

    // Upload to S3
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filename,
      Body: imageBuffer,
      ContentType: contentType,
          }));

    const imageUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${filename}`;

    logger.info(`[PIXLYPRO] Temp upload: ${imageUrl}`);

    res.json({
      success: true,
      imageUrl
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Temp upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload photo'
    });
  }
});

/**
 * POST /api/pixlypro/enhance
 * Enhance a photo using Pixelixe AI
 */
router.post('/enhance', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Image URL is required'
      });
    }

    logger.info(`[PIXLYPRO] Enhancing: ${imageUrl}`);

    // Step 1: Apply brightness enhancement
    const brightnessBuffer = await pixelixeService.adjustBrightness(imageUrl, 0.15, 'png');

    // Upload brightness result to S3
    const s3 = getS3Client();
    if (!s3) {
      return res.status(500).json({
        success: false,
        error: 'S3 not configured'
      });
    }

    const brightnessFilename = `pixlypro/enhanced/${crypto.randomBytes(16).toString('hex')}_brightness.png`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: brightnessFilename,
      Body: brightnessBuffer,
      ContentType: 'image/png',
          }));

    const brightnessUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${brightnessFilename}`;

    // Step 2: Apply contrast enhancement
    const contrastBuffer = await pixelixeService.adjustContrast(brightnessUrl, 0.20, 'png');

    // Upload final result to S3
    const finalFilename = `pixlypro/enhanced/${crypto.randomBytes(16).toString('hex')}_final.png`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: finalFilename,
      Body: contrastBuffer,
      ContentType: 'image/png',
          }));

    const enhancedUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${finalFilename}`;

    logger.info(`[PIXLYPRO] Enhanced successfully: ${enhancedUrl}`);

    res.json({
      success: true,
      enhancedUrl
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Enhancement error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enhance photo: ' + error.message
    });
  }
});

// =====================================================
// AUTHENTICATION & USER MANAGEMENT
// =====================================================

/**
 * POST /api/pixlypro/register
 * Register new PixlyPro user
 */
router.post('/register', async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body;

    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Check if user already exists
    const [existingUser] = await sequelize.query(
      'SELECT id FROM users WHERE email = :email',
      {
        replacements: { email },
        type: QueryTypes.SELECT
      }
    );

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const [newUser] = await sequelize.query(
      `INSERT INTO users (first_name, last_name, email, phone_number, password_hash, created_at)
       VALUES (:firstName, :lastName, :email, :phoneNumber, :passwordHash, NOW())
       RETURNING id, first_name, last_name, email`,
      {
        replacements: { firstName, lastName, email, phoneNumber, passwordHash },
        type: QueryTypes.INSERT
      }
    );

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: newUser[0].id,
        email: newUser[0].email
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );

    logger.info(`[PIXLYPRO] New user registered: ${email}`);

    res.json({
      success: true,
      token,
      user: {
        id: newUser[0].id,
        firstName: newUser[0].first_name,
        lastName: newUser[0].last_name,
        email: newUser[0].email
      }
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
});

// =====================================================
// ORDER MANAGEMENT
// =====================================================

/**
 * POST /api/pixlypro/create-cart-checkout
 * Create Stripe Checkout Session for PixlyPro cart-based purchase
 */
router.post('/create-cart-checkout', authenticateToken, async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { photo_count } = req.body;
    const count = parseInt(photo_count) || 0;

    logger.info(`[PIXLYPRO] Creating cart checkout for user ${userId}, ${count} photos`);

    if (count <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Photo count must be greater than 0'
      });
    }

    // Calculate price using same logic as Photo Studio
    const calculatePrice = (photoCount) => {
      if (photoCount <= 10) return { total: 150 };

      let total = 150;
      let remaining = photoCount - 10;

      if (remaining > 0) {
        const tier1 = Math.min(remaining, 10);
        total += tier1 * 12;
        remaining -= tier1;
      }

      if (remaining > 0) {
        const tier2 = Math.min(remaining, 20);
        total += tier2 * 10;
        remaining -= tier2;
      }

      if (remaining > 0) {
        total += remaining * 8;
      }

      return { total };
    };

    const pricing = calculatePrice(count);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `PixlyPro AI Enhancement - ${count} Photos`,
            description: `AI-powered photo enhancement for ${count} photos. Automatic processing with instant delivery!`,
            images: ['https://storage.googleapis.com/msgsndr/3lSeAHXNU9t09Hhp9oai/media/69175f336c431e834ac954b8.png']
          },
          unit_amount: pricing.total * 100
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/pixlypro-success?session_id={CHECKOUT_SESSION_ID}&cart=true`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/pixlypro-upload?canceled=true`,
      client_reference_id: userId.toString(),
      metadata: {
        userId: userId.toString(),
        package_type: 'custom',
        photos_to_upload: count.toString(),
        photos_to_receive: count.toString(),
        service_type: 'pixlypro',
        pricing_model: 'cart'
      }
    });

    logger.info(`[PIXLYPRO] Created checkout session: ${session.id}`);

    res.json({
      success: true,
      checkout_url: session.url,
      session_id: session.id,
      price: pricing.total,
      photo_count: count
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Create checkout error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create checkout session'
    });
  }
});

/**
 * GET /api/pixlypro/orders
 * Get user's PixlyPro orders with photos
 * Returns presigned URLs for private S3 objects so images can be displayed
 */
router.get('/orders', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;

    // Get all orders
    const orders = await sequelize.query(
      `SELECT id, package_type, total_amount as price, photo_count as photos_to_upload,
              photo_count as photos_to_receive, photo_count as photos_uploaded,
              payment_status, order_status, created_at as order_date,
              paid_at, updated_at
       FROM pixlypro_orders
       WHERE user_id = :userId
       ORDER BY created_at DESC`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    // Convert price to number for each order
    for (const order of orders) {
      order.price = parseFloat(order.price);
    }

    // Get S3 client for presigned URLs
    const s3 = getS3Client();

    // Get photos for each order and generate presigned URLs
    for (const order of orders) {
      const photos = await sequelize.query(
        `SELECT id, original_url, enhanced_url, filename, created_at
         FROM pixlypro_photos
         WHERE order_id = :orderId
         ORDER BY created_at ASC`,
        {
          replacements: { orderId: order.id },
          type: QueryTypes.SELECT
        }
      );

      // Generate presigned URLs for each photo (1 hour expiry for viewing)
      if (s3 && photos.length > 0) {
        for (const photo of photos) {
          try {
            // Extract S3 key from the URL
            if (photo.original_url && photo.original_url.includes('.amazonaws.com/')) {
              const originalKey = photo.original_url.split('.amazonaws.com/')[1];
              photo.original_url = await getPresignedUrl(s3, BUCKET_NAME, originalKey, 3600);
            }
            if (photo.enhanced_url && photo.enhanced_url.includes('.amazonaws.com/')) {
              const enhancedKey = photo.enhanced_url.split('.amazonaws.com/')[1];
              photo.enhanced_url = await getPresignedUrl(s3, BUCKET_NAME, enhancedKey, 3600);
            }
          } catch (presignError) {
            logger.error(`[PIXLYPRO] Error generating presigned URL for photo ${photo.id}:`, presignError.message);
            // Keep original URLs as fallback
          }
        }
      }

      order.photos = photos;
    }

    res.json({
      success: true,
      orders
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Get orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get orders'
    });
  }
});

/**
 * POST /api/pixlypro/webhooks/stripe
 * Stripe payment webhook - triggers AI photo processing after successful payment
 */
router.post('/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error('[PIXLYPRO] Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // Check if this is a PixlyPro payment
      if (session.metadata && session.metadata.service === 'pixlypro') {
        const orderId = session.metadata.order_id || session.client_reference_id;

        logger.info(`[PIXLYPRO] Payment completed for order ${orderId}`);

        // Update order payment status
        await sequelize.query(
          `UPDATE pixlypro_orders
           SET payment_status = 'completed',
               stripe_payment_intent_id = :paymentIntentId,
               paid_at = NOW(),
               updated_at = NOW()
           WHERE id = :orderId`,
          {
            replacements: {
              paymentIntentId: session.payment_intent,
              orderId: orderId
            },
            type: QueryTypes.UPDATE
          }
        );

        // Note: Photos will be uploaded and processed via the upload endpoint
        // after payment is confirmed (user uploads from pixlypro-upload page)

        logger.info(`[PIXLYPRO] Order ${orderId} payment confirmed - ready for photo upload`);
      }
    }

    res.json({ received: true });

  } catch (error) {
    logger.error('[PIXLYPRO] Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/pixlypro/process-order
 * Process photos for a paid order - upload to S3 and enhance with Pixelixe AI
 */
router.post('/process-order', authenticateToken, upload.array('photos', 100), async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.body;
    const photos = req.files;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    if (!photos || photos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No photos uploaded'
      });
    }

    // Verify order belongs to user and is paid
    const [order] = await sequelize.query(
      `SELECT id, photo_count, payment_status, order_status
       FROM pixlypro_orders
       WHERE id = :orderId AND user_id = :userId`,
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

    // For localhost testing: auto-update payment status if pending
    // (Stripe webhooks don't work on localhost without ngrok)
    if (order.payment_status === 'pending') {
      logger.info(`[PIXLYPRO] Auto-updating payment status to completed for order ${orderId} (localhost workaround)`);
      await sequelize.query(
        `UPDATE pixlypro_orders
         SET payment_status = 'completed',
             paid_at = NOW(),
             updated_at = NOW()
         WHERE id = :orderId`,
        {
          replacements: { orderId },
          type: QueryTypes.UPDATE
        }
      );
    } else if (order.payment_status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Order payment not completed'
      });
    }

    if (photos.length > order.photo_count) {
      return res.status(400).json({
        success: false,
        error: `Too many photos. Order allows ${order.photo_count} photos`
      });
    }

    const s3 = getS3Client();
    if (!s3) {
      return res.status(500).json({
        success: false,
        error: 'S3 not configured'
      });
    }

    logger.info(`[PIXLYPRO] Processing ${photos.length} photos for order ${orderId}`);

    // Update order status
    await sequelize.query(
      `UPDATE pixlypro_orders
       SET order_status = 'processing',
           updated_at = NOW()
       WHERE id = :orderId`,
      {
        replacements: { orderId },
        type: QueryTypes.UPDATE
      }
    );

    const processedPhotos = [];

    for (const photo of photos) {
      try {
        // Step 1: Upload original to S3
        const originalFilename = `pixlypro/originals/${orderId}/${crypto.randomBytes(16).toString('hex')}.png`;

        let imageBuffer = photo.buffer;
        if (photo.mimetype !== 'image/png') {
          imageBuffer = await sharp(photo.buffer).png().toBuffer();
        }

        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: originalFilename,
          Body: imageBuffer,
          ContentType: 'image/png',
                  }));

        const originalUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${originalFilename}`;

        // Step 2: Enhance with Pixelixe AI
        const brightnessBuffer = await pixelixeService.adjustBrightness(originalUrl, 0.15, 'png');

        const brightnessFilename = `pixlypro/temp/${crypto.randomBytes(16).toString('hex')}.png`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: brightnessFilename,
          Body: brightnessBuffer,
          ContentType: 'image/png',
                  }));

        const brightnessUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${brightnessFilename}`;

        // Step 3: Apply contrast
        const contrastBuffer = await pixelixeService.adjustContrast(brightnessUrl, 0.20, 'png');

        const enhancedFilename = `pixlypro/enhanced/${orderId}/${crypto.randomBytes(16).toString('hex')}.png`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: enhancedFilename,
          Body: contrastBuffer,
          ContentType: 'image/png',
                  }));

        const enhancedUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${enhancedFilename}`;

        // Step 4: Save to database
        await sequelize.query(
          `INSERT INTO pixlypro_photos (order_id, original_url, enhanced_url, filename, created_at)
           VALUES (:orderId, :originalUrl, :enhancedUrl, :filename, NOW())`,
          {
            replacements: {
              orderId,
              originalUrl,
              enhancedUrl,
              filename: photo.originalname
            },
            type: QueryTypes.INSERT
          }
        );

        processedPhotos.push({
          filename: photo.originalname,
          originalUrl,
          enhancedUrl
        });

        logger.info(`[PIXLYPRO] Enhanced photo: ${photo.originalname}`);

      } catch (photoError) {
        logger.error(`[PIXLYPRO] Error processing photo ${photo.originalname}:`, photoError);
        // Continue with other photos
      }
    }

    // Update order status to completed
    await sequelize.query(
      `UPDATE pixlypro_orders
       SET order_status = 'completed',
           updated_at = NOW()
       WHERE id = :orderId`,
      {
        replacements: { orderId },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`[PIXLYPRO] Order ${orderId} processing completed - ${processedPhotos.length} photos enhanced`);

    res.json({
      success: true,
      processedCount: processedPhotos.length,
      photos: processedPhotos
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Process order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process photos'
    });
  }
});

/**
 * POST /api/pixlypro/process-temp-photos
 * Process temp photos from S3 for a paid order - enhance with Pixelixe AI
 */
router.post('/process-temp-photos', authenticateToken, async (req, res) => {
  const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const sharp = require('sharp');
  const crypto = require('crypto');
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');
  const https = require('https');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.body;

    logger.info(`[PIXLYPRO] process-temp-photos called for order ${orderId} by user ${userId}`);

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    // Verify order belongs to user and get temp photo IDs
    // Use * to handle case where temp_photo_ids column might not exist yet
    const [order] = await sequelize.query(
      `SELECT *
       FROM pixlypro_orders
       WHERE id = :orderId AND user_id = :userId`,
      {
        replacements: { orderId, userId },
        type: QueryTypes.SELECT
      }
    );

    logger.info(`[PIXLYPRO] Order lookup result: ${order ? JSON.stringify(order) : 'not found'}`);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // For localhost testing: auto-update payment status if pending
    if (order.payment_status === 'pending') {
      logger.info(`[PIXLYPRO] Auto-updating payment status to completed for order ${orderId} (localhost workaround)`);
      await sequelize.query(
        `UPDATE pixlypro_orders
         SET payment_status = 'completed',
             paid_at = NOW(),
             updated_at = NOW()
         WHERE id = :orderId`,
        {
          replacements: { orderId },
          type: QueryTypes.UPDATE
        }
      );
    } else if (order.payment_status !== 'completed') {
      logger.error(`[PIXLYPRO] Order ${orderId} payment status is ${order.payment_status}, not completed`);
      return res.status(400).json({
        success: false,
        error: 'Order payment not completed'
      });
    }

    const TEMP_BUCKET_NAME = process.env.AWS_S3_BUCKET || 'ringlypro-uploads';
    const s3 = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    logger.info(`[PIXLYPRO] Processing temp photos for order ${orderId}`);

    // Parse stored temp photo IDs
    let tempPhotoIds = [];
    if (order.temp_photo_ids) {
      try {
        tempPhotoIds = JSON.parse(order.temp_photo_ids);
        logger.info(`[PIXLYPRO] Found ${tempPhotoIds.length} temp photo IDs for order ${orderId}: ${tempPhotoIds.join(', ')}`);
      } catch (e) {
        logger.error(`[PIXLYPRO] Failed to parse temp_photo_ids: ${e.message}`);
      }
    }

    // Update order status
    await sequelize.query(
      `UPDATE pixlypro_orders
       SET order_status = 'processing',
           updated_at = NOW()
       WHERE id = :orderId`,
      {
        replacements: { orderId },
        type: QueryTypes.UPDATE
      }
    );

    // If we have specific temp photo IDs, use those; otherwise fall back to listing
    let s3Objects = [];

    if (tempPhotoIds.length > 0) {
      // Build S3 keys from temp photo IDs
      for (const tempId of tempPhotoIds) {
        s3Objects.push({
          Key: `pixlypro/temp/${userId}/${tempId}.png`
        });
      }
      logger.info(`[PIXLYPRO] Using ${s3Objects.length} specific temp photos from order`);
    } else {
      // Fall back to listing all temp photos for user
      logger.info(`[PIXLYPRO] No temp_photo_ids stored, listing from S3...`);
      const listResponse = await s3.send(new ListObjectsV2Command({
        Bucket: TEMP_BUCKET_NAME,
        Prefix: `pixlypro/temp/${userId}/`
      }));

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        s3Objects = listResponse.Contents;
        logger.info(`[PIXLYPRO] Found ${s3Objects.length} photos in S3 temp folder`);
      }
    }

    if (s3Objects.length === 0) {
      logger.error(`[PIXLYPRO] No photos found for order ${orderId}`);
      return res.status(400).json({
        success: false,
        error: 'No photos found to process'
      });
    }

    const processedPhotos = [];

    // Process each temp photo
    for (const s3Object of s3Objects) {
      try {
        const tempUrl = `https://${TEMP_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Object.Key}`;
        const filename = s3Object.Key.split('/').pop();

        logger.info(`[PIXLYPRO] Processing temp photo: ${tempUrl}`);

        // Step 1: Move to originals folder
        const originalFilename = `pixlypro/originals/${orderId}/${filename}`;
        const getResponse = await s3.send(new GetObjectCommand({
          Bucket: TEMP_BUCKET_NAME,
          Key: s3Object.Key
        }));

        const chunks = [];
        for await (const chunk of getResponse.Body) {
          chunks.push(chunk);
        }
        const imageBuffer = Buffer.concat(chunks);

        await s3.send(new PutObjectCommand({
          Bucket: TEMP_BUCKET_NAME,
          Key: originalFilename,
          Body: imageBuffer,
          ContentType: 'image/png',
                  }));

        const originalUrl = `https://${TEMP_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${originalFilename}`;
        logger.info(`[PIXLYPRO] Saved original: ${originalUrl}`);

        // Step 2: Enhance with Pixelixe AI
        logger.info(`[PIXLYPRO] Calling Pixelixe brightness API...`);
        const brightnessBuffer = await pixelixeService.adjustBrightness(originalUrl, 0.15, 'png');
        logger.info(`[PIXLYPRO] Brightness applied, buffer size: ${brightnessBuffer.length}`);

        const brightnessFilename = `pixlypro/temp/${crypto.randomBytes(16).toString('hex')}.png`;
        await s3.send(new PutObjectCommand({
          Bucket: TEMP_BUCKET_NAME,
          Key: brightnessFilename,
          Body: brightnessBuffer,
          ContentType: 'image/png',
                  }));

        const brightnessUrl = `https://${TEMP_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${brightnessFilename}`;
        logger.info(`[PIXLYPRO] Brightness saved: ${brightnessUrl}`);

        // Step 3: Apply contrast
        logger.info(`[PIXLYPRO] Calling Pixelixe contrast API...`);
        const contrastBuffer = await pixelixeService.adjustContrast(brightnessUrl, 0.20, 'png');
        logger.info(`[PIXLYPRO] Contrast applied, buffer size: ${contrastBuffer.length}`);

        const enhancedFilename = `pixlypro/enhanced/${orderId}/${filename}`;
        await s3.send(new PutObjectCommand({
          Bucket: TEMP_BUCKET_NAME,
          Key: enhancedFilename,
          Body: contrastBuffer,
          ContentType: 'image/png',
                  }));

        const enhancedUrl = `https://${TEMP_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${enhancedFilename}`;
        logger.info(`[PIXLYPRO] Enhanced saved: ${enhancedUrl}`);

        // Step 4: Save to database
        await sequelize.query(
          `INSERT INTO pixlypro_photos (order_id, original_url, enhanced_url, filename, created_at)
           VALUES (:orderId, :originalUrl, :enhancedUrl, :filename, NOW())`,
          {
            replacements: {
              orderId,
              originalUrl,
              enhancedUrl,
              filename
            },
            type: QueryTypes.INSERT
          }
        );

        processedPhotos.push({
          original: originalUrl,
          enhanced: enhancedUrl,
          filename
        });

        logger.info(`[PIXLYPRO] Successfully processed photo: ${filename}`);

      } catch (photoError) {
        logger.error(`[PIXLYPRO] Error processing temp photo:`, photoError);
      }
    }

    // Update order status to completed
    await sequelize.query(
      `UPDATE pixlypro_orders
       SET order_status = 'completed',
           updated_at = NOW()
       WHERE id = :orderId`,
      {
        replacements: { orderId },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`[PIXLYPRO] Order ${orderId} completed with ${processedPhotos.length} photos`);

    res.json({
      success: true,
      processedCount: processedPhotos.length,
      photos: processedPhotos
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Process temp photos error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to process photos: ' + error.message
    });
  }
});

/**
 * POST /api/pixlypro/upload-and-enhance
 * Combined endpoint: Upload photos to S3 and enhance with Pixelixe AI
 * This is called AFTER payment is confirmed (bulletproof workflow)
 */
router.post('/upload-and-enhance', authenticateToken, upload.array('photos', 100), async (req, res) => {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const sharp = require('sharp');
  const crypto = require('crypto');
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.body;
    const photos = req.files;

    logger.info(`[PIXLYPRO] upload-and-enhance called for order ${orderId} with ${photos?.length || 0} photos`);

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    if (!photos || photos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No photos uploaded'
      });
    }

    // Verify order belongs to user and payment is completed
    const [order] = await sequelize.query(
      `SELECT id, photo_count, payment_status, order_status
       FROM pixlypro_orders
       WHERE id = :orderId AND user_id = :userId`,
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

    if (order.payment_status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed for this order'
      });
    }

    // Update order status to processing
    await sequelize.query(
      `UPDATE pixlypro_orders
       SET order_status = 'processing',
           updated_at = NOW()
       WHERE id = :orderId`,
      {
        replacements: { orderId },
        type: QueryTypes.UPDATE
      }
    );

    const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'ringlypro-uploads';
    const s3 = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    const processedPhotos = [];

    // Process each photo
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];

      try {
        logger.info(`[PIXLYPRO] Processing photo ${i + 1}/${photos.length}: ${photo.originalname}`);

        // Convert to PNG if needed
        let imageBuffer = photo.buffer;
        if (photo.mimetype !== 'image/png') {
          imageBuffer = await sharp(photo.buffer).png().toBuffer();
        }

        // Step 1: Upload original to S3
        const originalFilename = `pixlypro/originals/${orderId}/${crypto.randomBytes(16).toString('hex')}.png`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: originalFilename,
          Body: imageBuffer,
          ContentType: 'image/png',
                  }));

        const originalUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${originalFilename}`;
        logger.info(`[PIXLYPRO] Original uploaded: ${originalUrl}`);

        // Step 2: Apply brightness enhancement
        logger.info(`[PIXLYPRO] Applying brightness...`);
        const brightnessBuffer = await pixelixeService.adjustBrightness(originalUrl, 0.15, 'png');

        // Upload brightness result
        const brightnessFilename = `pixlypro/temp/${crypto.randomBytes(16).toString('hex')}.png`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: brightnessFilename,
          Body: brightnessBuffer,
          ContentType: 'image/png',
                  }));

        const brightnessUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${brightnessFilename}`;
        logger.info(`[PIXLYPRO] Brightness applied: ${brightnessUrl}`);

        // Step 3: Apply contrast enhancement
        logger.info(`[PIXLYPRO] Applying contrast...`);
        const contrastBuffer = await pixelixeService.adjustContrast(brightnessUrl, 0.20, 'png');

        // Upload final enhanced photo
        const enhancedFilename = `pixlypro/enhanced/${orderId}/${crypto.randomBytes(16).toString('hex')}.png`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: enhancedFilename,
          Body: contrastBuffer,
          ContentType: 'image/png',
                  }));

        const enhancedUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${enhancedFilename}`;
        logger.info(`[PIXLYPRO] Enhanced uploaded: ${enhancedUrl}`);

        // Step 4: Save to database
        await sequelize.query(
          `INSERT INTO pixlypro_photos (order_id, original_url, enhanced_url, filename, created_at)
           VALUES (:orderId, :originalUrl, :enhancedUrl, :filename, NOW())`,
          {
            replacements: {
              orderId,
              originalUrl,
              enhancedUrl,
              filename: photo.originalname
            },
            type: QueryTypes.INSERT
          }
        );

        processedPhotos.push({
          original: originalUrl,
          enhanced: enhancedUrl,
          filename: photo.originalname
        });

        logger.info(`[PIXLYPRO] Successfully processed: ${photo.originalname}`);

      } catch (photoError) {
        logger.error(`[PIXLYPRO] Error processing photo ${photo.originalname}:`, photoError);
        // Continue with other photos even if one fails
      }
    }

    // Update order status to completed
    await sequelize.query(
      `UPDATE pixlypro_orders
       SET order_status = 'completed',
           updated_at = NOW()
       WHERE id = :orderId`,
      {
        replacements: { orderId },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`[PIXLYPRO] Order ${orderId} completed with ${processedPhotos.length} photos`);

    res.json({
      success: true,
      processedCount: processedPhotos.length,
      photos: processedPhotos
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Upload and enhance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process photos: ' + error.message
    });
  }
});

/**
 * POST /api/pixlypro/upload-and-enhance-direct
 * Direct upload and enhance - NO PAYMENT REQUIRED
 * Flow: Upload to S3 -> Enhance with Pixelixe -> Save to database
 */
router.post('/upload-and-enhance-direct', authenticateToken, upload.array('photos', 100), async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const photos = req.files;

    logger.info(`[PIXLYPRO] Direct upload-and-enhance called by user ${userId} with ${photos?.length || 0} photos`);

    if (!photos || photos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No photos provided'
      });
    }

    const s3 = getS3Client();
    if (!s3) {
      return res.status(500).json({
        success: false,
        error: 'S3 not configured'
      });
    }

    // Step 1: Create order in database (no payment required)
    const [orderResult] = await sequelize.query(
      `INSERT INTO pixlypro_orders (user_id, package_type, total_amount, photo_count, order_status, payment_status, created_at)
       VALUES (:userId, 'free', 0, :photoCount, 'processing', 'completed', NOW())
       RETURNING id`,
      {
        replacements: { userId, photoCount: photos.length },
        type: QueryTypes.INSERT
      }
    );
    const orderId = orderResult[0]?.id || orderResult[0];
    logger.info(`[PIXLYPRO] Created order ${orderId} for direct enhancement`);

    const processedPhotos = [];

    // Step 2: Process each photo
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const filename = `${crypto.randomBytes(16).toString('hex')}.png`;

      try {
        logger.info(`[PIXLYPRO] Processing photo ${i + 1}/${photos.length}: ${photo.originalname}`);

        // Convert to PNG if needed
        let imageBuffer = photo.buffer;
        if (photo.mimetype !== 'image/png') {
          imageBuffer = await sharp(photo.buffer).png().toBuffer();
        }

        // Upload original to S3
        const originalFilename = `pixlypro/originals/${orderId}/${filename}`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: originalFilename,
          Body: imageBuffer,
          ContentType: 'image/png',
        }));

        // Generate presigned URL for Pixelixe to access (15 min expiry)
        const originalPresignedUrl = await getPresignedUrl(s3, BUCKET_NAME, originalFilename, 900);
        const originalUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${originalFilename}`;
        logger.info(`[PIXLYPRO] Original uploaded: ${originalUrl}`);
        logger.info(`[PIXLYPRO] Presigned URL generated for Pixelixe access`);

        // =====================================================
        // Professional 2-Step Enhancement Pipeline
        // Note: Pixelixe only supports brighten and contrast APIs
        // =====================================================

        // Step 1: Brightness (+0.30) - Professional level brightness boost
        logger.info(`[PIXLYPRO] Step 1/2: Applying brightness (+0.30)...`);
        const brightnessBuffer = await pixelixeService.adjustBrightness(originalPresignedUrl, 0.30, 'png');

        const brightnessFilename = `pixlypro/temp/${crypto.randomBytes(16).toString('hex')}.png`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: brightnessFilename,
          Body: brightnessBuffer,
          ContentType: 'image/png',
        }));
        const brightnessPresignedUrl = await getPresignedUrl(s3, BUCKET_NAME, brightnessFilename, 900);
        logger.info(`[PIXLYPRO] Brightness applied`);

        // Step 2: Contrast (+0.35) - Enhance depth and definition
        logger.info(`[PIXLYPRO] Step 2/2: Applying contrast (+0.35)...`);
        const finalBuffer = await pixelixeService.adjustContrast(brightnessPresignedUrl, 0.35, 'png');
        logger.info(`[PIXLYPRO] Contrast applied`);

        // Upload final enhanced photo (after 2 steps)
        const enhancedFilename = `pixlypro/enhanced/${orderId}/${filename}`;
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: enhancedFilename,
          Body: finalBuffer,
          ContentType: 'image/png',
        }));

        const enhancedUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${enhancedFilename}`;
        logger.info(`[PIXLYPRO] Enhancement complete (4 steps): ${enhancedUrl}`);

        // Save to database
        await sequelize.query(
          `INSERT INTO pixlypro_photos (order_id, original_url, enhanced_url, filename, created_at)
           VALUES (:orderId, :originalUrl, :enhancedUrl, :filename, NOW())`,
          {
            replacements: {
              orderId,
              originalUrl,
              enhancedUrl,
              filename: photo.originalname || filename
            },
            type: QueryTypes.INSERT
          }
        );

        processedPhotos.push({
          originalUrl,
          enhancedUrl,
          filename: photo.originalname || filename
        });

        logger.info(`[PIXLYPRO] Photo ${i + 1} processed successfully`);

      } catch (photoError) {
        logger.error(`[PIXLYPRO] Error processing photo ${i + 1}:`, photoError.message);
        // Continue with other photos
      }
    }

    // Update order status
    await sequelize.query(
      `UPDATE pixlypro_orders SET order_status = 'completed', updated_at = NOW() WHERE id = :orderId`,
      { replacements: { orderId }, type: QueryTypes.UPDATE }
    );

    logger.info(`[PIXLYPRO] Direct enhancement complete: ${processedPhotos.length} photos processed`);

    res.json({
      success: true,
      orderId,
      processedCount: processedPhotos.length,
      photos: processedPhotos
    });

  } catch (error) {
    logger.error('[PIXLYPRO] Direct upload-and-enhance error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to process photos: ' + error.message
    });
  }
});

module.exports = router;
