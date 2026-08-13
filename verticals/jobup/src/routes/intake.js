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

    // SOMEONE WHO ALREADY PAID MUST NEVER MEET A RATE LIMIT.
    //
    // An active subscriber typing their address into the landing page is trying
    // to get IN, not to build a preview. Sending them to sign in is both the
    // truth and the thing they wanted; "daily limit reached" reads as a broken
    // product to the one person who has already given us money.
    const known = body.email
      ? await models.subscribers.findOne({ where: { email: String(body.email).trim().toLowerCase() } })
      : null;
    if (known && known.status === 'active') {
      return res.status(409).json({
        error: 'You already have a JobUp account for this address.',
        already_registered: true,
        sign_in_url: '/app',
        note: 'Sign in and your dashboard is exactly where you left it.',
      });
    }

    const rl = await limits.teaserAllowed({ ipHash: teaser.ipHash(ip), email: body.email });
    if (!rl.allowed) {
      // A refusal with no way forward is a lost customer. This one carries the
      // exact moment it clears and, when there is one, the preview they already
      // have — which they can subscribe from right now.
      return res.status(429).json({
        error: rl.reason === 'email'
          ? `You have already built ${rl.count} previews for this email address today.`
          : 'This network has already built its previews for today.',
        note: rl.existing
          ? 'Your most recent preview is still here, and you can subscribe from it.'
          : (rl.reason === 'ip'
            ? 'The limit counts the connection, not the person, so someone else on '
              + 'this Wi-Fi may have used it. A phone on mobile data will work now.'
            : 'Nothing was lost. You can build another one shortly.'),
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

// =============================================================
// STEP 3 OF THE FUNNEL — build the account.
//
//   1. jobup.dev        identity + CV        -> teaser build + magic link
//   2. /teaser/:token   the simulator        -> "build my account"
//   3. /build?t=token   THIS                 -> password + what to hunt for
//   4. /welcome?s=id    the account is live  -> bookmark it, or Manage
//
// This is where an account actually comes into existence. It used to happen in
// the Stripe webhook, which meant the person set a password AFTER paying and
// told us nothing about the work they wanted. With payment switched off, the
// form does both jobs at once: it creates the login and it tells the Hunter
// what to look for — the fields here are the ones jobsource.prefilter() and
// matcher.cachedPrefix() actually read, not decoration.
// =============================================================

const authSvc = require('../services/auth');
const settingsSvc = require('../services/settings');
const billing = require('../services/billing');

/** Only what the search layer can act on; everything else is dropped. */
function targetingFrom(body) {
  const b = body || {};
  return settingsSvc.sanitize({
    targeting: {
      roles: settingsSvc.strList(b.roles, 12),
      employment_types: b.employment_types,
      work_modes: b.work_modes,
      locations: b.locations,
      industries: b.industries,
      employers: b.employers,
      exclude_keywords: b.exclude_keywords,
      must_include: b.must_include,
      seniority: b.seniority ? String(b.seniority).slice(0, 40) : null,
      open_to_relocation: b.open_to_relocation === true || b.open_to_relocation === 'true',
      min_score: b.min_score,
    },
    // Owner-entered facts. Quoted verbatim in outreach or omitted — never
    // paraphrased, and private until the owner opts in.
    facts: {
      work_authorization: b.work_authorization ? String(b.work_authorization).slice(0, 200) : null,
      compensation_floor: b.compensation_floor ? String(b.compensation_floor).slice(0, 120) : null,
      availability: b.availability ? String(b.availability).slice(0, 120) : null,
      notice_period: b.notice_period ? String(b.notice_period).slice(0, 120) : null,
    },
  });
}

/**
 * GET /api/v1/intake/build?t=<teaser_token>
 * What the build form needs to render: who this is (from the teaser, which is
 * authoritative), and whether an account already exists for that address.
 */
router.get('/build', async (req, res) => {
  try {
    const t = await teaser.get(String(req.query.t || ''));
    if (!t) return res.status(404).json({ error: 'That preview link is not valid any more. Start again from the home page.' });

    const profile = ((t.payload || {}).screens || {}).site || {};
    const email = String(t.email || '').toLowerCase();
    const existing = email ? await models.subscribers.findOne({ where: { email } }) : null;

    res.json({
      ok: true,
      token: t.token,
      email,
      name: t.name || (profile.profile && profile.profile.name) || null,
      language: t.language || 'en',
      address_offer: t.address_offer || null,
      teaser_ready: t.status === 'ready',
      // An account that already has a password signs in; it does not re-register.
      already_registered: Boolean(existing && existing.password_hash),
      billing_disabled: billing.disabled(),
      // Whether we can already see the payment. The page uses this only to
      // choose its wording — the real gate is on POST, against Stripe.
      paid: Boolean(existing && (existing.status === 'active' || existing.stripe_customer_id)),
      employment_types: settingsSvc.EMPLOYMENT_TYPES,
      work_modes: settingsSvc.WORK_MODES,
      password_rule: 'At least 12 characters.',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/v1/intake/build-account
 * Creates the account, stores what to hunt for, and kicks off provisioning.
 *
 * Provisioning runs in the BACKGROUND. It allocates the address, renders the
 * site and makes the first agent run — comfortably past Cloudflare's ~100s
 * ceiling on a slow day. The response returns as soon as the account exists,
 * and /welcome polls for the rest (same pattern as the teaser build).
 */
router.post('/build-account', async (req, res) => {
  try {
    const b = req.body || {};
    const t = await teaser.get(String(b.teaser_token || ''));
    if (!t) return res.status(400).json({ error: 'That preview link is not valid any more. Start again from the home page.' });

    // THE TEASER ROW IS AUTHORITATIVE for identity — a token cannot be paired
    // with somebody else's address, and the resume often carries no email.
    const email = String(t.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'We do not have an email address for you. Start again from the home page.' });
    }

    const password = String(b.password || '');
    if (password !== String(b.password_confirm == null ? password : b.password_confirm)) {
      return res.status(400).json({ errors: ['The two passwords do not match.'] });
    }
    const problems = authSvc.passwordProblems(password);
    if (problems.length) return res.status(400).json({ errors: problems });

    let sub = await models.subscribers.findOne({ where: { email } });
    if (sub && sub.password_hash) {
      return res.status(409).json({
        error: 'An account already exists for this email address. Sign in instead.',
        sign_in_url: '/app',
      });
    }

    // ---- PAYMENT GATE ------------------------------------------------------
    // With billing ON this form is the step AFTER checkout, so it must confirm
    // a payment actually happened. Without this, anyone who typed /build?t=...
    // would get a live account for free — the form would have become a way
    // around the paywall rather than a step behind it.
    //
    // Truth comes from Stripe itself, via the session id Stripe put in the
    // return URL. The webhook is NOT relied on here: the browser redirect
    // routinely beats it, and gating on it would strand a paying customer.
    // A row already marked active (webhook won the race) is equally accepted.
    let paidVia = null;
    if (!billing.disabled()) {
      const already = sub && (sub.status === 'active' || sub.stripe_customer_id);
      if (already) {
        paidVia = 'subscriber_active';
      } else {
        const v = await billing.verifyCheckoutSession(b.checkout_session_id);
        if (!v.ok || !v.paid || (v.subscriberId && sub && v.subscriberId !== sub.id)) {
          return res.status(402).json({
            error: 'We could not confirm a payment for this account yet.',
            note: 'If you have just paid, wait a few seconds and refresh this page.',
            checkout_url: `/teaser/${t.token}`,
          });
        }
        paidVia = 'checkout_session';
        // The webhook may never arrive (misconfigured secret, delivery failure).
        // Record what Stripe just told us so the account is complete either way.
        if (sub) {
          await models.subscribers.update(
            { stripe_customer_id: v.customerId || sub.stripe_customer_id,
              stripe_subscription_id: v.subscriptionId || sub.stripe_subscription_id },
            { where: { id: sub.id } });
        }
      }
    }

    const fields = {
      name: t.name || (sub && sub.name) || null,
      phone: t.phone || (sub && sub.phone) || null,
      language: t.language || 'en',
      password_hash: authSvc.hashPassword(password),
      status: 'active',
      // Never countable as revenue. Mirrors the free_test stamp.
      activation: billing.activationStamp(),
      activated_at: new Date(),
    };
    if (sub) await models.subscribers.update(fields, { where: { id: sub.id } });
    else sub = await models.subscribers.create({ email, ...fields });
    // Badge the admin console. Fire-and-forget by design: a push that fails
    // must never break the signup that triggered it.
    try { require('../services/admin-notify').onNewSubscriber(sub); } catch (e) { /* non-fatal */ }

    // Referral attribution. Cookie first (set by /r/CODE), then an explicit
    // ?ref= in the body. Creates a PENDING row only — a commission can be born
    // solely from a paid invoice, never from a signup.
    try {
      const referrals = require('../services/referrals');
      const code = (req.cookies && req.cookies[referrals.COOKIE]) || b.ref || b.referral_code || '';
      if (code) await referrals.attachOnSignup(sub, code);
    } catch (e) { console.warn('[intake] referral attach failed:', e.message); }
    const tenantId = sub.id;

    // What the Hunter searches on. Written BEFORE provisioning so the first
    // agent run already uses it — otherwise the first batch of matches would
    // be scored against empty targeting and the person's answers would look
    // like they had been ignored.
    const cleaned = targetingFrom(b);
    const existingSettings = await scoped('settings', tenantId).findOne({});
    if (existingSettings) await scoped('settings', tenantId).update({ settings: cleaned }, { id: existingSettings.id });
    else await scoped('settings', tenantId).create({ settings: cleaned });

    await models.audit_log.create({
      tenant_id: tenantId, actor: 'subscriber', action: 'account_built',
      reason: billing.disabled()
        ? 'Built from the account form with the payment layer switched off (no_billing).'
        : `Built from the account form after payment (confirmed via ${paidVia}).`,
    });

    res.cookie('jobup_token', authSvc.issueSession(tenantId), authSvc.cookieOptions());

    const base = process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev';
    res.status(202).json({
      ok: true,
      tenant_id: tenantId,
      email,
      ready_url: `${base}/welcome?s=${tenantId}`,
      manage_url: `${base}/app`,
      poll: `/api/v1/intake/welcome?s=${tenantId}`,
      billing_disabled: billing.disabled(),
      targeting: cleaned.targeting,
    });

    // Background — the response above has already gone out.
    setImmediate(async () => {
      try {
        const provisioning = require('../services/provisioning');
        await provisioning.run(tenantId, { teaserToken: t.token });
      } catch (e) {
        console.error('[build-account] provisioning failed:', e.message);
      }
    });
  } catch (e) {
    console.error('[build-account] error:', e);
    res.status(500).json({ error: e.message });
  }
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
  const base = process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev';

  const steps = [
    { label: 'Account activated', ok: sub.status === 'active' },
    { label: sub.address ? `Web address reserved — ${sub.address}` : 'Web address reserved', ok: Boolean(state.address) },
    { label: 'Your site published', ok: Boolean(state.published) },
    { label: 'Your agents switched on', ok: Boolean(state.agents_started) },
  ];

  res.json({
    id: sub.id, email: sub.email, name: sub.name, status: sub.status,
    activation: sub.activation || 'paid',
    needs_password: !sub.password_hash,
    url: state.url || (sub.address ? `https://${sub.address}` : null),
    manage_url: `${base}/app`,
    billing_disabled: require('../services/billing').disabled(),
    // The page polls until this is true, then stops. Reported from the real
    // provisioning state, so it never claims a site is live before it is.
    complete: steps.every((s) => s.ok),
    steps,
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
