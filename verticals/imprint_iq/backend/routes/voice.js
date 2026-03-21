const express = require('express');
const router = express.Router();

const IMPRINTIQ_AGENT_ID = 'agent_5201km8nbx0sfsgbqfqwacz1bq3v';

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// POST /token — Get signed WebSocket URL for ImprintIQ Lina agent
router.post('/token', asyncHandler(async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${IMPRINTIQ_AGENT_ID}`,
    { headers: { 'xi-api-key': apiKey } }
  );

  if (!response.ok) {
    const err = await response.text();
    return res.status(response.status).json({ error: `ElevenLabs error: ${err}` });
  }

  const data = await response.json();
  res.json({
    signed_url: data.signed_url,
    agent_id: IMPRINTIQ_AGENT_ID,
    agent_name: 'Lina',
    role: 'ImprintIQ Sales Presenter'
  });
}));

// GET /health
router.get('/health', (req, res) => {
  res.json({
    service: 'ImprintIQ Voice AI',
    agent: 'Lina (Sales Presenter)',
    agent_id: IMPRINTIQ_AGENT_ID,
    status: 'ready',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
