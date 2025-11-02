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

    const imageUrl = response.data[0].url;
    console.log('✅ AI image generated:', imageUrl);

    return res.json({
      success: true,
      imageUrl: imageUrl,
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

module.exports = router;
