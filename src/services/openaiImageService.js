/**
 * OpenAI Image Enhancement Service
 * File: src/services/openaiImageService.js
 * Purpose: AI-powered professional photo enhancement using OpenAI's gpt-image-1 API
 *
 * Uses gpt-image-1 (the same model ChatGPT uses) for superior quality image editing
 * NO manual adjustments - OpenAI handles ALL enhancement decisions based on the prompt
 */

const OpenAI = require('openai');
const { toFile } = require('openai');
const logger = require('../utils/logger');

// Professional enhancement prompt (hidden from customers)
// This prompt tells OpenAI exactly how to enhance the image - AI decides everything
const ENHANCEMENT_PROMPT = `Enhance this photo to high-end commercial, professional grade quality while preserving the original look, composition, and authenticity.

Apply professional-level improvements:
- Perfect color balance and white balance correction
- Optimal brightness and exposure adjustment
- Rich contrast with preserved shadow and highlight details
- Enhanced color vibrancy and saturation without oversaturation
- Professional sharpening for crisp, clean details
- Noise reduction while maintaining texture
- Lighting correction and enhancement
- Clean, polished finish ready for commercial use

The result should look like it was professionally retouched by an expert photo editor - polished, realistic, and ready for website, menu, social media, or marketing materials. Preserve the original subject, composition, and visual intent completely.`;

let openai = null;

/**
 * Initialize OpenAI client
 */
function getOpenAIClient() {
    if (!openai && process.env.OPENAI_API_KEY) {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return openai;
}

/**
 * Check if OpenAI is configured
 */
function isConfigured() {
    return !!process.env.OPENAI_API_KEY;
}

/**
 * Enhance an image using OpenAI's gpt-image-1 model (same as ChatGPT uses)
 * This is the ONLY enhancement method - no manual adjustments
 * OpenAI's AI decides all enhancement parameters based on the prompt
 *
 * @param {Buffer} imageBuffer - The image buffer to enhance
 * @param {string} filename - Original filename for logging
 * @returns {Promise<Buffer>} - Enhanced image buffer
 */
async function enhanceImage(imageBuffer, filename = 'image.png') {
    const client = getOpenAIClient();

    if (!client) {
        throw new Error('OpenAI API key not configured');
    }

    logger.info(`[OPENAI-IMAGE] Starting gpt-image-1 enhancement for: ${filename}`);

    try {
        // Ensure we have a PNG file for the API
        const sharp = require('sharp');
        const pngBuffer = await sharp(imageBuffer)
            .png()
            .toBuffer();

        logger.info(`[OPENAI-IMAGE] Calling gpt-image-1 images.edit API...`);
        logger.info(`[OPENAI-IMAGE] Image size: ${pngBuffer.length} bytes`);

        // Use toFile helper to explicitly set MIME type (fixes application/octet-stream error)
        // See: https://github.com/openai/openai-node/issues/1468
        const imageFile = await toFile(pngBuffer, 'image.png', { type: 'image/png' });

        // Use gpt-image-1 for superior quality (same model ChatGPT uses)
        // OpenAI's AI analyzes the image and decides ALL adjustments
        const response = await client.images.edit({
            model: "gpt-image-1",
            image: imageFile,
            prompt: ENHANCEMENT_PROMPT,
            size: "1024x1024"
        });

        if (response.data && response.data[0]) {
            let enhancedBuffer;

            if (response.data[0].b64_json) {
                enhancedBuffer = Buffer.from(response.data[0].b64_json, 'base64');
            } else if (response.data[0].url) {
                // If URL is returned, fetch the image
                logger.info(`[OPENAI-IMAGE] Fetching enhanced image from URL...`);
                const fetch = require('node-fetch');
                const imageResponse = await fetch(response.data[0].url);
                enhancedBuffer = Buffer.from(await imageResponse.arrayBuffer());
            }

            if (enhancedBuffer) {
                logger.info(`[OPENAI-IMAGE] gpt-image-1 enhancement complete for: ${filename}`);
                return enhancedBuffer;
            }
        }

        throw new Error('No image data in response');

    } catch (error) {
        logger.error(`[OPENAI-IMAGE] gpt-image-1 error for ${filename}:`, error.message);

        // Re-throw the error - no fallback to manual adjustments
        // This ensures we only deliver AI-enhanced images or fail clearly
        throw new Error(`OpenAI enhancement failed: ${error.message}`);
    }
}

module.exports = {
    isConfigured,
    enhanceImage,
    ENHANCEMENT_PROMPT
};
