const express = require('express');
const router = express.Router();

// Generate image with DALL-E
router.post('/generate-image', async (req, res) => {
  try {
    const { prompt, style, sessionId } = req.body;

    if (!prompt) {
      return res.json({
        success: false,
        error: 'Prompt is required'
      });
    }

    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        success: false,
        error: 'AI image generation is not configured'
      });
    }

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log('🎨 Generating AI image:', { prompt, style });

    // Map style to DALL-E parameters
    const styleMap = {
      'natural': 'natural',
      'vivid': 'vivid',
      'illustration': 'natural' // DALL-E doesn't have illustration, use natural
    };

    const dalleStyle = styleMap[style] || 'natural';

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      size: "1024x1024",
      quality: "standard",
      style: dalleStyle,
      n: 1
    });

    const tempImageUrl = response.data[0].url;
    console.log('✅ AI image generated (temp URL):', tempImageUrl);

    // Download and save image permanently to avoid expiration
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');

    // Download image
    const imageResponse = await axios.get(tempImageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data);

    // Create unique filename
    const imageHash = crypto.createHash('md5').update(prompt + Date.now()).digest('hex');
    const filename = `ai-${imageHash}.png`;

    // Save to public/ai-images directory
    const aiImagesDir = path.join(__dirname, '../../public/ai-images');
    if (!fs.existsSync(aiImagesDir)) {
      fs.mkdirSync(aiImagesDir, { recursive: true });
    }

    const filepath = path.join(aiImagesDir, filename);
    fs.writeFileSync(filepath, imageBuffer);

    const permanentUrl = `/ai-images/${filename}`;
    console.log('💾 Image saved permanently:', permanentUrl);

    // Also save metadata for future reuse
    const metadataFile = path.join(aiImagesDir, 'metadata.json');
    let metadata = {};
    if (fs.existsSync(metadataFile)) {
      metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    }

    metadata[imageHash] = {
      prompt: prompt,
      style: style,
      filename: filename,
      url: permanentUrl,
      created: new Date().toISOString(),
      revised_prompt: response.data[0].revised_prompt
    };

    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

    return res.json({
      success: true,
      imageUrl: permanentUrl, // Return permanent URL, not temp DALL-E URL
      tempUrl: tempImageUrl,
      filename: filename,
      revised_prompt: response.data[0].revised_prompt
    });

  } catch (error) {
    console.error('❌ AI image generation error:', error);
    return res.json({
      success: false,
      error: error.message || 'Failed to generate image'
    });
  }
});

// Generate text with OpenAI (for email marketing and content generation)
router.post('/generate-text', async (req, res) => {
  try {
    const { message, clientId } = req.body;

    if (!message) {
      return res.json({
        success: false,
        error: 'Message is required'
      });
    }

    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
      return res.json({
        success: false,
        error: 'OpenAI API is not configured. Please contact support to set up AI text generation.'
      });
    }

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log('✨ Generating AI text content for client:', clientId);
    console.log('📝 Prompt:', message.substring(0, 100) + '...');

    // Use GPT-4 for high-quality content generation
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional marketing content writer. Generate engaging, professional content based on user requirements. Always format the content appropriately for the requested medium (email, social media, etc.)."
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    const generatedText = response.choices[0].message.content;
    console.log('✅ AI text generated successfully');

    return res.json({
      success: true,
      text: generatedText,
      model: response.model,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      }
    });

  } catch (error) {
    console.error('❌ AI text generation error:', error);

    // Provide more specific error messages
    let errorMessage = 'Failed to generate text content';

    if (error.code === 'insufficient_quota') {
      errorMessage = 'OpenAI API quota exceeded. Please contact support.';
    } else if (error.code === 'invalid_api_key') {
      errorMessage = 'OpenAI API key is invalid. Please contact support.';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return res.json({
      success: false,
      error: errorMessage
    });
  }
});

module.exports = router;
