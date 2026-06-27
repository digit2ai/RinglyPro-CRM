// =====================================================
// Champion magic links — owner mints/lists/revokes login-free links.
//   POST   /api/v1/champion-links            { name, email } -> { url, code }  (mint/rotate)
//   GET    /api/v1/champion-links            -> { champions: [...] }
//   POST   /api/v1/champion-links/revoke     { email }      -> { ok }
// Owner-only (requireCrmAuth): a champion code can never mint/list/revoke.
// Links are permanent (no expiry) and revocable via the registry.
// =====================================================

const express = require('express');
const router = express.Router();
const { requireCrmAuth, signChampion } = require('../middleware/auth');
function linkFor(c) {
  return `${base()}${MOUNT}/?c=${encodeURIComponent(signChampion({ name: c.name, email: c.email, jti: c.jti }))}`;
}
const registry = require('../services/championRegistry');

const MOUNT = '/voice-to-intake-transcript-direct-pipeli';
function base() {
  return (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
}

// Mint (or rotate) a champion's permanent link.
router.post('/', requireCrmAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim();
    const name = String(body.name || '').trim();
    if (!email || email.indexOf('@') < 1) {
      return res.status(422).json({ error: 'A valid email is required' });
    }
    const { jti } = await registry.upsert(email, name || email);
    const code = signChampion({ name: name || email, email, jti });
    const url = `${base()}${MOUNT}/?c=${encodeURIComponent(code)}`;
    return res.json({ ok: true, name: name || email, email, code, url });
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'champion_mint_error', error: err.message }));
    return res.status(500).json({ error: 'internal error' });
  }
});

// List champions (status).
router.get('/', requireCrmAuth, async (req, res) => {
  try {
    const rows = await registry.list();
    // Surface each champion's existing link (re-signed from the stored jti — same
    // link, no rotation). jti is never exposed to the client.
    const champions = rows.map((c) => ({
      email: c.email,
      name: c.name,
      revoked: c.revoked,
      created_at: c.created_at,
      url: c.revoked ? null : linkFor(c)
    }));
    return res.json({ champions });
  } catch (err) {
    return res.status(500).json({ error: 'internal error' });
  }
});

// Revoke a champion's current link.
router.post('/revoke', requireCrmAuth, async (req, res) => {
  try {
    const email = String((req.body && req.body.email) || '').trim();
    if (!email) return res.status(422).json({ error: 'email required' });
    const ok = await registry.revoke(email);
    return res.json({ ok });
  } catch (err) {
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
