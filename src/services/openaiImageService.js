/**
 * OpenAI Image Enhancement Service
 * File: src/services/openaiImageService.js
 * Purpose: AI-powered professional photo enhancement using OpenAI's gpt-image-1 API
 *
 * Uses gpt-image-1 (the same model ChatGPT uses) for superior quality image editing
 */

const OpenAI = require('openai');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Professional enhancement prompt (hidden from customers)
// This prompt is used with gpt-image-1 to achieve commercial-grade results
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
 * This produces commercial-grade professional results
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

    // Write buffer to temp file (required for OpenAI's images.edit API)
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `pixlypro_${Date.now()}_${filename}`);

    try {
        // Ensure we have a PNG file for the API
        const sharp = require('sharp');
        const pngBuffer = await sharp(imageBuffer)
            .png()
            .toBuffer();

        fs.writeFileSync(tempFilePath, pngBuffer);

        logger.info(`[OPENAI-IMAGE] Calling gpt-image-1 images.edit API...`);

        // Use gpt-image-1 for superior quality (same model ChatGPT uses)
        const response = await client.images.edit({
            model: "gpt-image-1",
            image: fs.createReadStream(tempFilePath),
            prompt: ENHANCEMENT_PROMPT,
            size: "1024x1024"
        });

        // Clean up temp file
        try { fs.unlinkSync(tempFilePath); } catch (e) {}

        if (response.data && response.data[0]) {
            let enhancedBuffer;

            if (response.data[0].b64_json) {
                enhancedBuffer = Buffer.from(response.data[0].b64_json, 'base64');
            } else if (response.data[0].url) {
                // If URL is returned, fetch the image
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
        // Clean up temp file on error
        try { fs.unlinkSync(tempFilePath); } catch (e) {}

        logger.error(`[OPENAI-IMAGE] gpt-image-1 error for ${filename}:`, error.message);

        // Check if this is an access error (gpt-image-1 requires verification)
        if (error.message.includes('access') || error.message.includes('permission') || error.message.includes('not available')) {
            logger.warn(`[OPENAI-IMAGE] gpt-image-1 may require API verification. Falling back to vision analysis.`);
            return await enhanceWithVision(imageBuffer, filename);
        }

        // Fall back to vision-based enhancement
        logger.info(`[OPENAI-IMAGE] Falling back to vision-based enhancement for: ${filename}`);
        return await enhanceWithVision(imageBuffer, filename);
    }
}

/**
 * Alternative: Use GPT-4 Vision to analyze image and apply local enhancements
 * This is a fallback when DALL-E editing isn't suitable
 */
async function enhanceWithVision(imageBuffer, filename = 'image.png') {
    const client = getOpenAIClient();
    const sharp = require('sharp');

    if (!client) {
        throw new Error('OpenAI API key not configured');
    }

    logger.info(`[OPENAI-IMAGE] Using Vision analysis for: ${filename}`);

    try {
        // Convert buffer to base64
        const base64Image = imageBuffer.toString('base64');
        const mimeType = 'image/png';

        // Use GPT-4 Vision to analyze the image and get enhancement recommendations
        // The AI acts as a professional graphic designer analyzing the specific image
        const analysisResponse = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: ENHANCEMENT_PROMPT
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Analyze this specific image and determine the exact adjustments needed to enhance it to high-end commercial, professional grade.

Based on what you see in THIS image, provide specific numeric adjustments:
- brightness: (-1 to 1) - adjust based on current lighting
- contrast: (0.5 to 2) - enhance depth and definition as needed
- saturation: (0.5 to 2) - improve color vibrancy if needed
- sharpness: (0 to 2) - enhance clarity and crisp edges

Consider the image's current state: Is it too dark? Too flat? Colors dull? Details soft?
Make adjustments that will make it polished and commercial-ready while preserving its authenticity.

Respond ONLY with a JSON object like:
{"brightness": 0.1, "contrast": 1.2, "saturation": 1.1, "sharpness": 1.3}

Do not include any other text.`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`,
                                detail: "low"
                            }
                        }
                    ]
                }
            ],
            max_tokens: 100
        });

        // Parse the AI's recommendations
        let adjustments = { brightness: 0.05, contrast: 1.15, saturation: 1.1, sharpness: 1.2 };

        try {
            const responseText = analysisResponse.choices[0].message.content.trim();
            // Extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                adjustments = JSON.parse(jsonMatch[0]);
            }
            logger.info(`[OPENAI-IMAGE] AI recommended adjustments: ${JSON.stringify(adjustments)}`);
        } catch (parseError) {
            logger.warn(`[OPENAI-IMAGE] Could not parse AI response, using defaults`);
        }

        // Apply enhancements using sharp
        let pipeline = sharp(imageBuffer);

        // Apply brightness and contrast
        if (adjustments.brightness !== 0 || adjustments.contrast !== 1) {
            pipeline = pipeline.modulate({
                brightness: 1 + (adjustments.brightness || 0),
                saturation: adjustments.saturation || 1
            });
        }

        // Apply sharpening
        if (adjustments.sharpness && adjustments.sharpness > 1) {
            const sharpenAmount = Math.min(adjustments.sharpness - 1, 1) * 2;
            pipeline = pipeline.sharpen(sharpenAmount);
        }

        // Apply contrast adjustment using linear transformation
        if (adjustments.contrast && adjustments.contrast !== 1) {
            pipeline = pipeline.linear(adjustments.contrast, -(128 * (adjustments.contrast - 1)));
        }

        // Normalize and output
        pipeline = pipeline.normalize().png({ quality: 95 });

        const enhancedBuffer = await pipeline.toBuffer();

        logger.info(`[OPENAI-IMAGE] Vision-guided enhancement complete for: ${filename}`);
        return enhancedBuffer;

    } catch (error) {
        logger.error(`[OPENAI-IMAGE] Vision enhancement error:`, error.message);
        // Fall back to basic local enhancement
        return await localEnhancement(imageBuffer);
    }
}

/**
 * Local enhancement fallback using sharp
 * Professional-grade enhancements when AI is unavailable
 */
async function localEnhancement(imageBuffer) {
    const sharp = require('sharp');

    logger.info(`[OPENAI-IMAGE] Applying local professional enhancement`);

    try {
        const enhancedBuffer = await sharp(imageBuffer)
            // Slight brightness boost and saturation enhancement
            .modulate({
                brightness: 1.08,
                saturation: 1.12
            })
            // Sharpen for crisp details
            .sharpen(1.2)
            // Normalize to improve contrast and color balance
            .normalize()
            // High quality PNG output
            .png({ quality: 95 })
            .toBuffer();

        return enhancedBuffer;

    } catch (error) {
        logger.error(`[OPENAI-IMAGE] Local enhancement error:`, error.message);
        // Return original if all else fails
        return imageBuffer;
    }
}

module.exports = {
    isConfigured,
    enhanceImage,
    enhanceWithVision,
    localEnhancement,
    ENHANCEMENT_PROMPT
};
