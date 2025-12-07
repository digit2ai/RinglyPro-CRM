// =====================================================
// AI Photo Enhancement Service for PixlyPro
// Purpose: Enhance photos using AI (Replicate or OpenAI)
// =====================================================

const logger = require('../utils/logger');
const fetch = require('node-fetch');

/**
 * Enhance a photo using AI
 * Uses Replicate's upscaling/enhancement models or falls back to mock enhancement
 */
async function enhancePhoto({ photoUrl, photoId, orderId }) {
  try {
    logger.info(`[AI Photo Enhancer] Starting enhancement for photo ${photoId}`);

    // Check if Replicate API key is configured
    const replicateApiKey = process.env.REPLICATE_API_TOKEN;

    if (!replicateApiKey) {
      logger.warn('[AI Photo Enhancer] No API key configured, using mock enhancement');
      return mockEnhancement(photoUrl);
    }

    // Use Replicate's Real-ESRGAN for image enhancement
    // Model: nightmareai/real-esrgan
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${replicateApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
        input: {
          image: photoUrl,
          scale: 2, // 2x upscaling
          face_enhance: true // Enable face enhancement
        }
      })
    });

    const prediction = await response.json();

    if (prediction.error) {
      throw new Error(prediction.error);
    }

    // Poll for completion
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

      const checkResponse = await fetch(prediction.urls.get, {
        headers: {
          'Authorization': `Token ${replicateApiKey}`
        }
      });

      result = await checkResponse.json();
      attempts++;
    }

    if (result.status === 'succeeded' && result.output) {
      logger.info(`[AI Photo Enhancer] Enhancement successful for photo ${photoId}`);
      return {
        success: true,
        enhancedUrl: result.output,
        model: 'real-esrgan',
        provider: 'replicate'
      };
    } else {
      throw new Error('Enhancement timeout or failed');
    }

  } catch (error) {
    logger.error('[AI Photo Enhancer] Enhancement error:', error);

    // Fallback to mock enhancement
    logger.warn('[AI Photo Enhancer] Using mock enhancement as fallback');
    return mockEnhancement(photoUrl);
  }
}

/**
 * Mock enhancement for demo/testing when API not available
 * Returns the original URL with a simulated enhancement
 */
function mockEnhancement(photoUrl) {
  logger.info('[AI Photo Enhancer] Using mock enhancement (no API configured)');

  // In a real scenario, you could:
  // 1. Apply basic filters using sharp/jimp library
  // 2. Return original with brightness/contrast adjustments
  // 3. Use a local ML model

  // For now, return original URL with mock flag
  return {
    success: true,
    enhancedUrl: photoUrl, // Original URL (in production, this would be enhanced)
    model: 'mock-enhancement',
    provider: 'local',
    note: 'Mock enhancement - configure REPLICATE_API_TOKEN for real AI enhancement'
  };
}

/**
 * Alternative: Enhance using Stability AI
 * Requires STABILITY_API_KEY
 */
async function enhancePhotoWithStability({ photoUrl, photoId }) {
  try {
    const stabilityApiKey = process.env.STABILITY_API_KEY;

    if (!stabilityApiKey) {
      logger.warn('[AI Photo Enhancer] Stability AI not configured');
      return mockEnhancement(photoUrl);
    }

    // Download original image
    const imageResponse = await fetch(photoUrl);
    const imageBuffer = await imageResponse.buffer();

    // Use Stability AI's upscaling endpoint
    const formData = new FormData();
    formData.append('image', imageBuffer, 'photo.jpg');
    formData.append('width', 2048);
    formData.append('height', 2048);

    const response = await fetch('https://api.stability.ai/v1/generation/esrgan-v1-x2plus/image-to-image/upscale', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stabilityApiKey}`,
        'Accept': 'application/json'
      },
      body: formData
    });

    const result = await response.json();

    if (result.artifacts && result.artifacts.length > 0) {
      const enhancedBase64 = result.artifacts[0].base64;
      const enhancedUrl = `data:image/png;base64,${enhancedBase64}`;

      return {
        success: true,
        enhancedUrl,
        model: 'esrgan-v1-x2plus',
        provider: 'stability-ai'
      };
    } else {
      throw new Error('No enhanced image returned');
    }

  } catch (error) {
    logger.error('[AI Photo Enhancer] Stability AI error:', error);
    return mockEnhancement(photoUrl);
  }
}

module.exports = {
  enhancePhoto,
  enhancePhotoWithStability
};
