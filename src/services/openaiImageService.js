/**
 * OpenAI Image Enhancement Service
 * File: src/services/openaiImageService.js
 * Purpose: AI-powered professional photo enhancement using OpenAI's image API
 */

const OpenAI = require('openai');
const logger = require('../utils/logger');

// Professional enhancement prompt (hidden from customers)
const ENHANCEMENT_PROMPT = `I am a professional graphic designer. My role is to enhance this image to a high-end commercial, professional grade while preserving the original look, composition, and authenticity of the uploaded image.

Improve overall color balance, brightness, contrast, sharpness, and clarity. Enhance details naturally without over-processing. Correct lighting, reduce noise if present, and ensure clean, crisp edges.

The final result should look polished, realistic, and ready for commercial use (website, menu, social media, or marketing materials), while fully conserving the original aspects, proportions, and visual intent of the image.`;

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
 * Enhance an image using OpenAI's image editing API
 * @param {Buffer} imageBuffer - The image buffer to enhance
 * @param {string} filename - Original filename for logging
 * @returns {Promise<Buffer>} - Enhanced image buffer
 */
async function enhanceImage(imageBuffer, filename = 'image.png') {
    const client = getOpenAIClient();

    if (!client) {
        throw new Error('OpenAI API key not configured');
    }

    logger.info(`[OPENAI-IMAGE] Starting enhancement for: ${filename}`);

    try {
        // Convert buffer to base64
        const base64Image = imageBuffer.toString('base64');

        // Use OpenAI's image edit/variation API
        // Note: OpenAI's DALL-E doesn't directly enhance images, so we use the
        // gpt-4-vision model to analyze and then generate an enhanced version

        const response = await client.images.edit({
            model: "dall-e-2",
            image: imageBuffer,
            prompt: ENHANCEMENT_PROMPT,
            n: 1,
            size: "1024x1024",
            response_format: "b64_json"
        });

        if (response.data && response.data[0] && response.data[0].b64_json) {
            const enhancedBuffer = Buffer.from(response.data[0].b64_json, 'base64');
            logger.info(`[OPENAI-IMAGE] Enhancement complete for: ${filename}`);
            return enhancedBuffer;
        }

        throw new Error('No image data in response');

    } catch (error) {
        logger.error(`[OPENAI-IMAGE] Enhancement error for ${filename}:`, error.message);

        // If DALL-E edit fails, try using GPT-4 Vision to analyze and describe enhancements
        // then return the original with basic sharp enhancements as fallback
        logger.info(`[OPENAI-IMAGE] Falling back to local enhancement for: ${filename}`);
        return await localEnhancement(imageBuffer);
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
