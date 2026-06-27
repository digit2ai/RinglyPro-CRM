// =====================================================
// Champion magic links — owner mints a personal, login-free link per champion.
//   POST /api/v1/champion-links   { name, email }  -> { url, code }
// Owner-only (requireCrmAuth): a champion code can never mint another link.
// =====================================================

const express = require('express');
const router = express.Router();
const { requireCrmAuth, signChampion } = require('../middleware/auth');

const MOUNT = '/voice-to-intake-transcript-direct-pipeli';

function base() {
  return (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
}

router.post('/', requireCrmAuth, (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim();
    const name = String(body.name || '').trim();
    if (!email || email.indexOf('@') < 1) {
      return res.status(422).json({ error: 'A valid email is required' });
    }
    const code = signChampion({ name: name || email, email });
    const url = `${base()}${MOUNT}/?c=${encodeURIComponent(code)}`;
    return res.json({ ok: true, name: name || email, email, code, url });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'champion_mint_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
