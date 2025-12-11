// =====================================================
// PixlyPro API Routes
// File: src/routes/pixlypro.js
// Purpose: AI-Assisted Photo Enhancement Service
// =====================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pixelixeService = require('../services/pixelixeService');

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
 * POST /api/pixlypro/create-checkout-session
 * Create Stripe checkout session for PixlyPro
 */
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { packageType, photoCount, totalAmount } = req.body;

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
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/photo-studio`,
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
      ACL: 'public-read'
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
      ACL: 'public-read'
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
      ACL: 'public-read'
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

    // Get photos for each order
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

    if (order.payment_status !== 'completed') {
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
          ACL: 'public-read'
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
          ACL: 'public-read'
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
          ACL: 'public-read'
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

module.exports = router;
