'use strict';
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIO_CACHE_DIR = path.join(__dirname, '../../.tts-cache');
if (!fs.existsSync(AUDIO_CACHE_DIR)) fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });

const VOICES = {
  rachel: '21m00Tcm4TlvDq8ikWAM',   // Rachel — English
  bella: 'EXAVITQu4vr4xnSDxMaL'     // Bella — Spanish (Lina)
};

// POST /api/tts/generate - Generate TTS audio from text
router.post('/generate', async (req, res) => {
  try {
    const { text, voice, lang } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });

    const voiceId = VOICES[voice] || VOICES.bella; // default to Spanish Bella

    // Include voice+lang in cache key so different voices don't collide
    const hash = crypto.createHash('md5').update(voiceId + '|' + (lang || 'es') + '|' + text).digest('hex');
    const cachePath = path.join(AUDIO_CACHE_DIR, hash + '.mp3');

    if (fs.existsSync(cachePath)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('X-Cache', 'HIT');
      return fs.createReadStream(cachePath).pipe(res);
    }

    // Generate via ElevenLabs API
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        language_code: lang || 'es',
        voice_settings: {
          stability: 0.78,
          similarity_boost: 0.75,
          style: 0.08,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('ElevenLabs TTS error:', response.status, err);
      return res.status(500).json({ error: 'TTS generation failed: ' + response.status });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Cache the audio
    fs.writeFileSync(cachePath, buffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-Cache', 'MISS');
    res.send(buffer);
  } catch (err) {
    console.error('TTS error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tts/cached/:hash - Serve cached audio
router.get('/cached/:hash', (req, res) => {
  const cachePath = path.join(AUDIO_CACHE_DIR, req.params.hash + '.mp3');
  if (!fs.existsSync(cachePath)) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', 'audio/mpeg');
  fs.createReadStream(cachePath).pipe(res);
});

module.exports = router;
