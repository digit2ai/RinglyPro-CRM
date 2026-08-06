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
const { models, scoped } = require('../models');
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

const phoneSvc = require('../services/phone');
const photos = require('../services/photos');

/**
 * Returns { errs, phone } — `phone` is the NORMALISED E.164 value, so a caller
 * stores what the carrier APIs expect without the person having had to type it.
 */
function validateGate({ name, email, phone, language }) {
  const errs = [];
  if (!name || String(name).trim().length < 2) errs.push('name required');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.push('valid email required');
  if (language && !['en', 'es'].includes(language)) errs.push('language must be en or es');

  // Phone is optional, and we accept how people actually write it.
  const ph = phoneSvc.normalize(phone);
  if (!ph.ok) errs.push(ph.reason);
  return { errs, phone: ph.ok ? (ph.e164 || null) : null };
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
router.post('/teaser', upload.fields([{ name: 'resume', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), async (req, res) => {
  try {
    const ip = clientIp(req);
    const body = req.body || {};
    const gate = validateGate(body);
    if (gate.errs.length) return res.status(400).json({ errors: gate.errs });
    body.phone = gate.phone;   // store E.164, whatever shape it was typed in

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
    const resumeFile = req.files && req.files.resume && req.files.resume[0];
    const photoFile = req.files && req.files.photo && req.files.photo[0];
    if (resumeFile) {
      const ex = await resumeSvc.extractText(resumeFile.buffer, resumeFile.originalname);
      if (ex.ok) resumeText = ex.text;
      else if (!resumeText) return res.status(400).json({ error: 'Could not read that file: ' + ex.note });
    }
    if (!resumeText || resumeText.length < 60) {
      return res.status(400).json({ error: 'A resume is required — attach a file or paste the text.' });
    }

    const { token } = await teaser.create({ ...body, ip, resumeText });

    // Background build. Response returns immediately with the poll token.
    // Optional profile photo. Stored separately from resume_json so the JSON
    // surfaces stay small; validated by real magic bytes, not the filename.
    if (photoFile) {
      const ph = photos.accept(photoFile.buffer, photoFile.mimetype);
      if (ph.ok) {
        await models.assets.create({
          teaser_token: token, kind: 'photo', mime: ph.mime,
          bytes: ph.bytes, data: ph.base64,
        });
      } else {
        console.warn('[intake] photo rejected:', ph.reason);
      }
    }

    setImmediate(async () => {
      try {
        const payload = await teaser.build({
          ...body, resumeText, ip,
          onStage: (st) => teaser.setStage(token, st),
        });
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
  const out = {
    status: row.status, token: row.token, language: row.language,
    payload: row.status === 'ready' ? row.payload : null,
    narration: row.narration || [],
  };
  if (row.status === 'pending') {
    // Real progress: which stage the build is actually on, and how long it has
    // been running. No invented percentage.
    out.progress = {
      stage: row.stage || null,
      label: row.stage_label || null,
      n: row.stage_n || 0,
      total: row.stages_total || 6,
      elapsed_ms: row.started_at ? Date.now() - new Date(row.started_at).getTime() : 0,
      typical_ms: teaser.TYPICAL_BUILD_MS,
    };
  }
  res.json(out);
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

/**
 * Inbound interest from a recruiter, sent through the subscriber's public site.
 *
 * This is the other half of the product: the subscriber reaches out via
 * Broadcast, and recruiters reach IN here. It lands in their Opportunities tab
 * where they can draft a reply in one click.
 *
 * The subscriber's email address is NEVER exposed to do this — the message is
 * routed through us, which is the entire point of keeping contact details
 * private by default.
 */
router.post('/contact/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const sub = await models.subscribers.findOne({
      where: { address: `${slug}.${addresses.BASE_DOMAIN}` } });
    if (!sub || sub.status !== 'active') return res.status(404).json({ error: 'no such profile' });

    const b = req.body || {};
    const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const from_name = clean(b.from_name, 120);
    const from_email = clean(b.from_email, 200);
    const company = clean(b.company, 160);
    const role = clean(b.role, 160);
    const note = clean(b.note, 4000);

    if (!from_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from_email)) {
      return res.status(400).json({ error: 'A valid email address is required so they can reply to you.' });
    }
    if (note.length < 10) {
      return res.status(400).json({ error: 'Please write a short message.' });
    }
    // Honeypot: a field no human sees. Bots fill it in.
    if (clean(b.website, 200)) return res.json({ ok: true });

    // Its OWN limiter — the teaser one is a cost control for LLM calls, and
    // sharing it meant a subscriber who built teasers could no longer receive
    // messages on their own site.
    const ipHash = teaser.ipHash(clientIp(req));
    const rl = await limits.contactAllowed({ tenantId: sub.id, ipHash, email: from_email });
    if (!rl.allowed) {
      return res.status(429).json({
        error: rl.reason === 'sender'
          ? 'You have already sent several messages to this person today.'
          : 'Too many messages from this network today. Please try again tomorrow.' });
    }

    await scoped('opportunities', sub.id).create({
      source: 'site_form', company, role, from_name, from_email, note, status: 'new', ip_hash: ipHash,
    });

    res.json({ ok: true,
      note: 'Your message was delivered. They will see it in their dashboard and can reply to you directly.' });
  } catch (e) {
    console.error('[contact] error:', e.message);
    res.status(500).json({ error: 'Could not deliver that message.' });
  }
});

module.exports = router;
module.exports.clientIp = clientIp;
module.exports.validateGate = validateGate;
