// =====================================================
// Photo Upload API Routes
// File: src/routes/photo-uploads.js
// Purpose: Handle photo uploads for Photo Studio and future services
// =====================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const sharp = require('sharp'); // For image processing/validation
const crypto = require('crypto');
const path = require('path');

// =====================================================
// S3 Configuration
// =====================================================

// Initialize S3 client only if credentials are provided
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

// =====================================================
// Multer Configuration (Memory Storage)
// =====================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 20 // Max 20 files per request
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
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

// =====================================================
// Helper Functions
// =====================================================

/**
 * Generate unique storage key for uploaded file
 */
function generateStorageKey(userId, serviceType, orderId, filename) {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(filename);
  const sanitizedName = path.basename(filename, ext).replace(/[^a-zA-Z0-9-_]/g, '_');

  return `uploads/${serviceType}/user_${userId}/order_${orderId}/${timestamp}_${randomString}_${sanitizedName}${ext}`;
}

/**
 * Upload file to S3
 */
async function uploadToS3(buffer, storageKey, mimeType) {
  const client = getS3Client();
  if (!client) {
    throw new Error('AWS S3 is not configured. Please set AWS credentials in environment variables.');
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey,
    Body: buffer,
    ContentType: mimeType,
    ServerSideEncryption: 'AES256'
  });

  await client.send(command);

  // Generate presigned URL (valid for 7 days)
  const getCommand = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: storageKey
  });

  const signedUrl = await getSignedUrl(client, getCommand, { expiresIn: 604800 }); // 7 days

  return signedUrl;
}

/**
 * Get image metadata using sharp
 */
async function getImageMetadata(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format
    };
  } catch (error) {
    logger.error('[PHOTO UPLOAD] Error getting image metadata:', error);
    return { width: null, height: null, format: null };
  }
}

// =====================================================
// Routes
// =====================================================

/**
 * POST /api/photo-uploads/upload
 * Upload photos for a specific order
 */
router.post('/upload', authenticateToken, upload.array('photos', 20), async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { service_type = 'photo_studio', order_id } = req.body;
    const files = req.files;

    logger.info(`[PHOTO UPLOAD] Upload request - User: ${userId}, Service: ${service_type}, Order: ${order_id}, Files: ${files?.length || 0}`);

    // Validate request
    if (!order_id) {
      return res.status(400).json({
        success: false,
        error: 'order_id is required'
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    // Verify order exists and belongs to user
    let orderTable = 'photo_studio_orders';
    if (service_type !== 'photo_studio') {
      // Future: Add logic for other service types
      return res.status(400).json({
        success: false,
        error: `Service type ${service_type} not yet supported`
      });
    }

    const [order] = await sequelize.query(
      `SELECT id, user_id, photos_to_upload, photos_uploaded, order_status
       FROM ${orderTable}
       WHERE id = :orderId AND user_id = :userId`,
      {
        replacements: { orderId: order_id, userId },
        type: QueryTypes.SELECT
      }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or access denied'
      });
    }

    // Check if user can still upload
    const remainingSlots = order.photos_to_upload - order.photos_uploaded;
    if (remainingSlots <= 0) {
      return res.status(400).json({
        success: false,
        error: 'All photo slots for this order are filled'
      });
    }

    if (files.length > remainingSlots) {
      return res.status(400).json({
        success: false,
        error: `You can only upload ${remainingSlots} more photo(s) for this order`
      });
    }

    // Get device info from headers
    const userAgent = req.headers['user-agent'] || '';
    let uploadDevice = 'browser';
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      uploadDevice = 'ios';
    } else if (userAgent.includes('Android')) {
      uploadDevice = 'android';
    }

    const uploadIP = req.ip || req.connection.remoteAddress;

    // Process each file
    const uploadResults = [];
    const uploadedFileIds = [];

    for (const file of files) {
      try {
        logger.info(`[PHOTO UPLOAD] Processing file: ${file.originalname} (${file.size} bytes)`);

        // Get image metadata
        const imageMetadata = await getImageMetadata(file.buffer);

        // Generate storage key
        const storageKey = generateStorageKey(userId, service_type, order_id, file.originalname);

        // Upload to S3
        const storageUrl = await uploadToS3(file.buffer, storageKey, file.mimetype);

        // Save to database
        const [uploadRecord] = await sequelize.query(
          `INSERT INTO photo_uploads (
            user_id, service_type, service_order_id, original_filename,
            file_size, mime_type, file_extension, storage_provider,
            storage_bucket, storage_key, storage_url, image_width,
            image_height, image_format, upload_status, upload_device,
            upload_ip, user_agent, uploaded_at
          ) VALUES (
            :userId, :serviceType, :orderId, :originalFilename,
            :fileSize, :mimeType, :fileExtension, 's3',
            :bucket, :storageKey, :storageUrl, :imageWidth,
            :imageHeight, :imageFormat, 'uploaded', :uploadDevice,
            :uploadIP, :userAgent, NOW()
          ) RETURNING id, storage_key, storage_url`,
          {
            replacements: {
              userId,
              serviceType: service_type,
              orderId: order_id,
              originalFilename: file.originalname,
              fileSize: file.size,
              mimeType: file.mimetype,
              fileExtension: path.extname(file.originalname),
              bucket: BUCKET_NAME,
              storageKey,
              storageUrl,
              imageWidth: imageMetadata.width,
              imageHeight: imageMetadata.height,
              imageFormat: imageMetadata.format,
              uploadDevice,
              uploadIP,
              userAgent
            },
            type: QueryTypes.INSERT
          }
        );

        uploadedFileIds.push(uploadRecord[0].id);
        uploadResults.push({
          success: true,
          filename: file.originalname,
          uploadId: uploadRecord[0].id,
          url: uploadRecord[0].storage_url
        });

        logger.info(`[PHOTO UPLOAD] File uploaded successfully: ${file.originalname} -> ${storageKey}`);

      } catch (error) {
        logger.error(`[PHOTO UPLOAD] Failed to upload file ${file.originalname}:`, error);
        uploadResults.push({
          success: false,
          filename: file.originalname,
          error: error.message
        });
      }
    }

    // Update order photos_uploaded count
    const successfulUploads = uploadResults.filter(r => r.success).length;
    if (successfulUploads > 0) {
      await sequelize.query(
        `UPDATE ${orderTable}
         SET photos_uploaded = photos_uploaded + :count,
             updated_at = NOW()
         WHERE id = :orderId`,
        {
          replacements: { count: successfulUploads, orderId: order_id },
          type: QueryTypes.UPDATE
        }
      );

      // Check if all photos uploaded
      if (order.photos_uploaded + successfulUploads >= order.photos_to_upload) {
        await sequelize.query(
          `UPDATE ${orderTable}
           SET order_status = 'processing',
               upload_completed_date = NOW(),
               updated_at = NOW()
           WHERE id = :orderId`,
          {
            replacements: { orderId: order_id },
            type: QueryTypes.UPDATE
          }
        );
        logger.info(`[PHOTO UPLOAD] Order ${order_id} upload completed - moved to processing`);

        // Send admin notification email
        try {
          // Get user details and order info
          const [userDetails] = await sequelize.query(
            `SELECT u.first_name, u.last_name, u.email, o.package_type
             FROM users u
             JOIN ${orderTable} o ON o.user_id = u.id
             WHERE o.id = :orderId`,
            {
              replacements: { orderId: order_id },
              type: QueryTypes.SELECT
            }
          );

          if (userDetails) {
            const { sendPhotoUploadAdminNotification } = require('../services/emailService');

            // Get all uploaded photo URLs for this order
            const photoUrls = uploadResults
              .filter(r => r.success)
              .map(r => r.url);

            const customerName = `${userDetails.first_name} ${userDetails.last_name}`.trim() || 'Customer';

            await sendPhotoUploadAdminNotification({
              orderId: order_id,
              customerName,
              customerEmail: userDetails.email,
              packageType: userDetails.package_type,
              photosUploaded: order.photos_uploaded + successfulUploads,
              photoUrls
            });

            logger.info(`[PHOTO UPLOAD] Admin notification email sent for order ${order_id}`);
          }
        } catch (emailError) {
          // Don't fail the upload if email fails
          logger.error(`[PHOTO UPLOAD] Failed to send admin notification email for order ${order_id}:`, emailError);
        }
      }
    }

    res.json({
      success: true,
      message: `Uploaded ${successfulUploads} of ${files.length} file(s)`,
      uploads: uploadResults,
      order: {
        id: order_id,
        photos_uploaded: order.photos_uploaded + successfulUploads,
        photos_to_upload: order.photos_to_upload,
        remaining: order.photos_to_upload - (order.photos_uploaded + successfulUploads)
      }
    });

  } catch (error) {
    logger.error('[PHOTO UPLOAD] Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Upload failed'
    });
  }
});

/**
 * GET /api/photo-uploads/order/:orderId
 * Get all uploads for a specific order
 */
router.get('/order/:orderId', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { orderId } = req.params;
    const { service_type = 'photo_studio' } = req.query;

    // Verify order belongs to user
    let orderTable = 'photo_studio_orders';
    const [order] = await sequelize.query(
      `SELECT id FROM ${orderTable} WHERE id = :orderId AND user_id = :userId`,
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

    // Get all uploads
    const uploads = await sequelize.query(
      `SELECT
        id, original_filename, file_size, mime_type, storage_url,
        image_width, image_height, upload_status, processing_status,
        uploaded_at, upload_device
       FROM photo_uploads
       WHERE service_type = :serviceType AND service_order_id = :orderId
       ORDER BY uploaded_at DESC`,
      {
        replacements: { serviceType: service_type, orderId },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      uploads
    });

  } catch (error) {
    logger.error('[PHOTO UPLOAD] Get uploads error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get uploads'
    });
  }
});

/**
 * DELETE /api/photo-uploads/:uploadId
 * Delete an uploaded photo (only if not yet processed)
 */
router.delete('/:uploadId', authenticateToken, async (req, res) => {
  const { sequelize } = require('../models');
  const { QueryTypes } = require('sequelize');

  try {
    const userId = req.user.userId || req.user.id;
    const { uploadId } = req.params;

    // Get upload and verify ownership
    const [upload] = await sequelize.query(
      `SELECT p.*, o.user_id
       FROM photo_uploads p
       JOIN photo_studio_orders o ON p.service_order_id = o.id AND p.service_type = 'photo_studio'
       WHERE p.id = :uploadId`,
      {
        replacements: { uploadId },
        type: QueryTypes.SELECT
      }
    );

    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      });
    }

    if (upload.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Don't allow deletion if already processed
    if (upload.processing_status === 'completed' || upload.processing_status === 'in_progress') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete photo that is being processed or already processed'
      });
    }

    // Delete from S3
    try {
      const client = getS3Client();
      if (client) {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: upload.storage_key
        });
        await client.send(deleteCommand);
        logger.info(`[PHOTO UPLOAD] Deleted from S3: ${upload.storage_key}`);
      }
    } catch (s3Error) {
      logger.error('[PHOTO UPLOAD] S3 deletion error:', s3Error);
      // Continue even if S3 deletion fails
    }

    // Delete from database
    await sequelize.query(
      'DELETE FROM photo_uploads WHERE id = :uploadId',
      {
        replacements: { uploadId },
        type: QueryTypes.DELETE
      }
    );

    // Update order count
    await sequelize.query(
      `UPDATE photo_studio_orders
       SET photos_uploaded = photos_uploaded - 1,
           updated_at = NOW()
       WHERE id = :orderId`,
      {
        replacements: { orderId: upload.service_order_id },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`[PHOTO UPLOAD] Upload ${uploadId} deleted by user ${userId}`);

    res.json({
      success: true,
      message: 'Upload deleted successfully'
    });

  } catch (error) {
    logger.error('[PHOTO UPLOAD] Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete upload'
    });
  }
});

/**
 * GET /api/photo-uploads/presigned-url
 * Generate presigned URL for direct browser upload (alternative method)
 */
router.post('/presigned-url', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { filename, content_type, order_id, service_type = 'photo_studio' } = req.body;

    if (!filename || !content_type || !order_id) {
      return res.status(400).json({
        success: false,
        error: 'filename, content_type, and order_id are required'
      });
    }

    // Generate storage key
    const storageKey = generateStorageKey(userId, service_type, order_id, filename);

    // Generate presigned URL for upload
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
      ContentType: content_type
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

    res.json({
      success: true,
      uploadUrl,
      storageKey,
      expiresIn: 3600
    });

  } catch (error) {
    logger.error('[PHOTO UPLOAD] Presigned URL error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate upload URL'
    });
  }
});

module.exports = router;
