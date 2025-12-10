// =====================================================
// Pixelixe API Service
// File: src/services/pixelixeService.js
// Purpose: AI-powered photo enhancement using Pixelixe API
// Documentation: https://pixelixe.com/docs/v2/image-processing.html
// =====================================================

const logger = require('../utils/logger');

const PIXELIXE_API_KEY = process.env.PIXELIXE_API_KEY;
const PIXELIXE_API_URL = 'https://studio.pixelixe.com/api';

// Check if API key is configured
if (!PIXELIXE_API_KEY) {
  logger.warn('[PIXELIXE] API key not configured. AI enhancement will be disabled.');
}

/**
 * Apply brightness adjustment to a photo
 * @param {string} imageUrl - Source image URL
 * @param {number} value - Brightness value (-1 to +1)
 * @param {string} imageType - Output format (png recommended, jpeg has API bugs)
 * @returns {Buffer} Raw image buffer
 */
async function adjustBrightness(imageUrl, value = 0.1, imageType = 'png') {
  if (!PIXELIXE_API_KEY) {
    throw new Error('Pixelixe API key not configured');
  }

  const encodedUrl = encodeURI(imageUrl);
  const url = `${PIXELIXE_API_URL}/brighten/v1?imageUrl=${encodedUrl}&value=${value}&imageType=${imageType}`;

  logger.info(`[PIXELIXE] Adjusting brightness: ${value}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${PIXELIXE_API_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Pixelixe API error: ${response.status} - ${response.statusText}`);
  }

  return await response.buffer();
}

/**
 * Apply contrast adjustment to a photo
 * @param {string} imageUrl - Source image URL
 * @param {number} value - Contrast value (-1 to +1)
 * @param {string} imageType - Output format (png recommended, jpeg has API bugs)
 * @returns {Buffer} Raw image buffer
 */
async function adjustContrast(imageUrl, value = 0.15, imageType = 'png') {
  if (!PIXELIXE_API_KEY) {
    throw new Error('Pixelixe API key not configured');
  }

  const encodedUrl = encodeURI(imageUrl);
  const url = `${PIXELIXE_API_URL}/contrast/v1?imageUrl=${encodedUrl}&value=${value}&imageType=${imageType}`;

  logger.info(`[PIXELIXE] Adjusting contrast: ${value}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${PIXELIXE_API_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Pixelixe API error: ${response.status} - ${response.statusText}`);
  }

  return await response.buffer();
}

/**
 * Compress image to reduce file size
 * Note: Compress API currently has bugs - use Brightness/Contrast APIs instead
 * @param {string} imageUrl - Source image URL
 * @param {string} imageType - Output format (png recommended)
 * @returns {Buffer} Raw compressed image buffer
 */
async function compressImage(imageUrl, imageType = 'png') {
  if (!PIXELIXE_API_KEY) {
    throw new Error('Pixelixe API key not configured');
  }

  const encodedUrl = encodeURI(imageUrl);
  const url = `${PIXELIXE_API_URL}/compress/v1?imageUrl=${encodedUrl}&imageType=${imageType}`;

  logger.info(`[PIXELIXE] Compressing image`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${PIXELIXE_API_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Pixelixe API error: ${response.status} - ${response.statusText}`);
  }

  return await response.buffer();
}

/**
 * Enhance a photo using multiple Pixelixe Image Processing operations
 * This chains multiple API calls: brightness → contrast → compress
 * Note: Each operation returns a raw image buffer that needs to be uploaded to S3
 */
async function enhancePhoto(imageUrl, options = {}) {
  if (!PIXELIXE_API_KEY) {
    return {
      success: false,
      error: 'Pixelixe API key not configured'
    };
  }

  try {
    const {
      brightness = 0.1,  // -1 to +1
      contrast = 0.15,   // -1 to +1
      compress = true
    } = options;

    logger.info(`[PIXELIXE] Enhancing photo with chained operations`);

    // Note: Pixelixe Image Processing API returns raw image buffers
    // We need to upload each result to S3 to get a URL for the next operation
    // For now, return the settings - actual implementation needs S3 integration

    return {
      success: true,
      message: 'Enhancement pipeline configured',
      settings: { brightness, contrast, compress },
      note: 'Implementation requires S3 upload between each API call'
    };

  } catch (error) {
    logger.error('[PIXELIXE] Enhancement error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Apply professional filter preset to a photo
 * Note: Filter API endpoint and parameters need to be verified from documentation
 * Available filters: clarendon, ludwig, hefe, lofi, moon, inkwell, etc.
 */
async function applyFilter(imageUrl, filterName = 'clarendon') {
  if (!PIXELIXE_API_KEY) {
    return {
      success: false,
      error: 'Pixelixe API key not configured'
    };
  }

  try {
    logger.info(`[PIXELIXE] Filter API - implementation pending documentation verification`);

    // TODO: Verify filter API endpoint from https://pixelixe.com/docs/v2/image-filter.html
    // The Image Processing API uses GET requests, filter API may be similar

    return {
      success: false,
      error: 'Filter API implementation pending - check documentation at https://pixelixe.com/docs/v2/image-filter.html'
    };

  } catch (error) {
    logger.error('[PIXELIXE] Filter error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Auto-enhance photo with type-specific presets
 * Note: Implementation requires S3 integration to chain API calls
 *
 * Workflow: Original photo → Brightness API → Upload to S3 → Contrast API → Upload to S3 → Compress API → Final result
 */
async function autoEnhancePhoto(imageUrl, photoType = 'general') {
  if (!PIXELIXE_API_KEY) {
    return {
      success: false,
      error: 'Pixelixe API key not configured'
    };
  }

  try {
    logger.info(`[PIXELIXE] Auto-enhancing photo (type: ${photoType})`);

    // Different enhancement presets based on photo type
    const presets = {
      food: {
        brightness: 0.12,   // More brightness for appetizing look
        contrast: 0.18,     // Higher contrast
        compress: true
      },
      product: {
        brightness: 0.08,   // Subtle brightness
        contrast: 0.20,     // Strong contrast for clarity
        compress: true
      },
      portrait: {
        brightness: 0.10,   // Moderate brightness
        contrast: 0.12,     // Gentle contrast
        compress: true
      },
      general: {
        brightness: 0.10,   // Balanced brightness
        contrast: 0.15,     // Balanced contrast
        compress: true
      }
    };

    const settings = presets[photoType] || presets.general;

    logger.info(`[PIXELIXE] Auto-enhancement settings: ${JSON.stringify(settings)}`);

    return {
      success: true,
      message: 'Auto-enhancement pipeline configured',
      settings: settings,
      photoType: photoType,
      note: 'Full implementation requires S3 upload between each Pixelixe API call'
    };

  } catch (error) {
    logger.error('[PIXELIXE] Auto-enhancement error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if Pixelixe API is properly configured
 */
function isConfigured() {
  return !!PIXELIXE_API_KEY;
}

/**
 * Get API status by testing a simple operation
 */
async function getApiStatus() {
  if (!PIXELIXE_API_KEY) {
    return {
      success: false,
      configured: false
    };
  }

  try {
    // Test API key with a simple compress operation on a test image
    const testImageUrl = 'https://via.placeholder.com/150';
    const encodedUrl = encodeURI(testImageUrl);
    const url = `${PIXELIXE_API_URL}/compress/v1?imageUrl=${encodedUrl}&imageType=jpeg`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PIXELIXE_API_KEY}`
      }
    });

    if (response.ok) {
      return {
        success: true,
        configured: true,
        status: 'active'
      };
    } else {
      return {
        success: false,
        configured: true,
        status: 'invalid_key',
        statusCode: response.status
      };
    }
  } catch (error) {
    logger.error('[PIXELIXE] Status check error:', error.message);
    return {
      success: false,
      configured: true,
      status: 'error',
      error: error.message
    };
  }
}

module.exports = {
  adjustBrightness,
  adjustContrast,
  compressImage,
  enhancePhoto,
  applyFilter,
  autoEnhancePhoto,
  isConfigured,
  getApiStatus
};
