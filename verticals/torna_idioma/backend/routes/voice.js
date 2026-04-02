'use strict';

const express = require('express');
const router = express.Router();

/**
 * POST /api/voice/rachel-token
 * Generate ElevenLabs WebRTC signed URL for Rachel — the AI presenter agent for Torna Idioma
 */
router.post('/rachel-token', async (req, res) => {
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const RACHEL_AGENT_ID = process.env.TI_RACHEL_AGENT_ID || process.env.MSK_RACHEL_AGENT_ID || 'agent_0701kn582htmf7zvmmep2qkc43bg';

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ success: false, error: 'ElevenLabs API key not configured' });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(RACHEL_AGENT_ID)}`,
      { method: 'GET', headers: { 'xi-api-key': ELEVENLABS_API_KEY } }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('[TI Voice] Rachel token error:', response.status, errText);
      return res.status(response.status).json({ success: false, error: 'Failed to get Rachel token' });
    }

    const data = await response.json();
    res.json({ success: true, signed_url: data.signed_url, agent_id: RACHEL_AGENT_ID });
  } catch (err) {
    console.error('[TI Voice] Rachel token error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
