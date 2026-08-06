'use strict';

// =============================================================
// The funnel: identity gate -> resume -> teaser (spec sections 1, 7).
//
// Rate limiting keys on CF-Connecting-IP (NOT forgeable XFF) — ported from the
// donor's clientIp(). The teaser is a free spend on every visitor, so this is
// the line that stops the product losing money.
// =============================================================

const express = require('express');
const multer = require('multer');
const { models } = require('../models');
const teaser = require('../services/teaser');
const resumeSvc = require('../services/resume');
const addresses = require('../services/addresses');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function clientIp(req) {
  return req.headers['cf-connecting-ip'] || req.ip || req.connection?.remoteAddress || '';
}

// DB-backed — correct across restarts and instances (spec section 4).
const limits = require('../services/limits');

const E164 = /^\+[1-9]\d{6,14}$/;

function validateGate({ name, email, phone, language }) {
  const errs = [];
  if (!name || String(name).trim().length < 2) errs.push('name required');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push('valid email required');
  if (phone && !E164.test(phone)) errs.push('phone must be E.164 (e.g. +13055551234)');
  if (language && !['en', 'es'].includes(language)) errs.push('language must be en or es');
  return errs;
}

// Live address preview — used by the orb and the teaser (spec section 9).
router.post('/address-preview', async (req, res) => {
  try {
    const parts = addresses.splitName(req.body && req.body.name);
    const r = await addresses.preview({ ...parts, city: req.body && req.body.city });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/v1/intake/teaser
 * Identity gate + resume -> background teaser build + poll token.
 *
 * Cloudflare's ~100s ceiling means this MUST be a background job plus a poll,
 * never a synchronous request (spec section 21).
 */
router.post('/teaser', upload.single('resume'), async (req, res) => {
  try {
    const ip = clientIp(req);
    const body = req.body || {};
    const errs = validateGate(body);
    if (errs.length) return res.status(400).json({ errors: errs });

    const rl = await limits.teaserAllowed({ ipHash: teaser.ipHash(ip), email: body.email });
    if (!rl.allowed) {
      return res.status(429).json({
        error: rl.reason === 'email'
          ? 'Daily teaser limit reached for this email address.'
          : 'Daily teaser limit reached for this network.',
        ...rl,
      });
    }

    let resumeText = String(body.resume_text || '');
    if (req.file) {
      const ex = await resumeSvc.extractText(req.file.buffer, req.file.originalname);
      if (ex.ok) resumeText = ex.text;
      else if (!resumeText) return res.status(400).json({ error: 'Could not read that file: ' + ex.note });
    }
    if (!resumeText || resumeText.length < 60) {
      return res.status(400).json({ error: 'A resume is required — attach a file or paste the text.' });
    }

    const { token } = await teaser.create({ ...body, ip });

    // Background build. Response returns immediately with the poll token.
    setImmediate(async () => {
      try {
        const payload = await teaser.build({ ...body, resumeText, ip });
        await teaser.finish(token, payload);
      } catch (e) {
        console.error('[teaser] build failed:', e.message);
        await teaser.finish(token, { status: 'failed', error: e.message, narration: [] });
      }
    });

    res.status(202).json({ ok: true, token, poll: `/api/v1/intake/teaser/${token}` });
  } catch (e) {
    console.error('[intake] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Poll / fetch the built teaser.
router.get('/teaser/:token', async (req, res) => {
  const row = await teaser.get(req.params.token);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({
    status: row.status, token: row.token, language: row.language,
    payload: row.status === 'ready' ? row.payload : null,
    narration: row.narration || [],
  });
});

// A visitor who never pays still has deletion rights (spec section 19.1).
router.delete('/teaser/:token', async (req, res) => {
  const n = await models.teasers.destroy({ where: { token: req.params.token } });
  res.json({ deleted: n, note: 'Teaser and its extracted resume text removed.' });
});

/**
 * What the /welcome page reads after activation. Reports the real provisioning
 * state — it never claims a site is live when it is not.
 */
router.get('/welcome', async (req, res) => {
  const id = parseInt(req.query.s, 10);
  if (!id) return res.status(400).json({ error: 'missing account reference' });
  const sub = await models.subscribers.findOne({ where: { id } });
  if (!sub) return res.status(404).json({ error: 'no such account' });

  const provisioning = require('../services/provisioning');
  const state = await provisioning.stateOf(sub.id);

  res.json({
    id: sub.id, email: sub.email, name: sub.name, status: sub.status,
    activation: sub.activation || 'paid',
    needs_password: !sub.password_hash,
    url: state.url || (sub.address ? `https://${sub.address}` : null),
    steps: [
      { label: 'Account activated', ok: sub.status === 'active' },
      { label: sub.address ? `Web address reserved — ${sub.address}` : 'Web address reserved', ok: Boolean(state.address) },
      { label: 'Your site published', ok: Boolean(state.published) },
      { label: 'Your three agents switched on', ok: Boolean(state.agents_started) },
    ],
  });
});

module.exports = router;
module.exports.clientIp = clientIp;
module.exports.validateGate = validateGate;
