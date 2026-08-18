'use strict';

const express = require('express');
const { models } = require('../models');
const billing = require('../services/billing');
const teaserSvc = require('../services/teaser');
const plans = require('../services/plans');
const ent = require('../services/entitlements');
const authSvc = require('../services/auth');

const router = express.Router();

// tenant_id from the session cookie ONLY (same rule as the engine surface).
function tenantFromReq(req) {
  const token = (req.cookies && req.cookies.jobup_token) || (req.headers.authorization || '').replace(/^Bearer /, '');
  const p = token ? authSvc.readSession(token) : null;
  return p && p.tid ? p.tid : null;
}

router.get('/status', (req, res) => res.json(billing.status()));

// Create checkout from a completed teaser.
//
// WITH BILLING OFF this creates nothing. It hands back the URL of the account
// form and lets the person build an account for free. The teaser's CTA follows
// whatever this returns, so switching payment back on (JOBUP_BILLING_ENABLED=1)
// changes the funnel with no front-end edit.
router.post('/checkout', async (req, res) => {
  try {
    const body = req.body || {};
    const teaser_token = body.teaser_token;

    if (billing.disabled()) {
      const base = process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev';
      if (!teaser_token) {
        return res.status(400).json({
          error: 'We lost track of your preview. Start again from the home page.' });
      }
      return res.json({
        ok: true, billing_disabled: true,
        build_url: `${base}/build?t=${encodeURIComponent(teaser_token)}`,
        note: 'Payment is switched off. The next step creates the account for free.',
      });
    }

    // THE TEASER ROW IS AUTHORITATIVE for who this is.
    //
    // The client used to send the email extracted from the RESUME, which is
    // often absent — plenty of CVs carry no address, and the privacy
    // projection can strip it. The result was 'email required' on the Submit
    // button and no account, even though the person had typed their address
    // into the intake form. It is also the safer source: a token cannot be
    // paired with somebody else's address.
    let email = String(body.email || '').trim().toLowerCase();
    let name = body.name;
    if (teaser_token) {
      const t = await teaserSvc.get(teaser_token);
      if (t) {
        if (t.email) email = String(t.email).trim().toLowerCase();
        if (t.name) name = t.name;
      }
    }
    if (!email) {
      return res.status(400).json({
        error: 'We do not have an email address for you. Start again from the home page and enter one.' });
    }

    let sub = await models.subscribers.findOne({ where: { email } });
    if (!sub) sub = await models.subscribers.create({ email, name, status: 'pending' });

    const base = process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev';
    const chosenPlan = String((req.body || {}).plan || '').toLowerCase();

    // ---- FREE PLAN selected on the landing -------------------------------
    // No charge. Create the account on the Free tier and send them to /build to
    // set a password and their targeting (so the Hunter has something to search).
    if (chosenPlan === 'free') {
      await models.subscribers.update(
        { status: 'active', activation: 'free_plan', activated_at: new Date(), plan: 'free' },
        { where: { id: sub.id } });
      const provisioning = require('../services/provisioning');
      const pr = await provisioning.run(sub.id, { teaserToken: teaser_token }).catch(() => ({ ok: false }));
      try { await models.audit_log.create({ tenant_id: sub.id, actor: 'system', action: 'free_plan_activation', reason: 'Free plan selected on landing' }); } catch (e) {}
      return res.json({ ok: true, plan: 'free', build_url: `${base}/build?t=${encodeURIComponent(teaser_token)}&s=${sub.id}&free=1`, provisioned: pr.ok });
    }

    // ---- TEST MODE: skip payment entirely --------------------------------
    // Activates and provisions immediately. Off unless JOBUP_FREE_ACTIVATION=1.
    if (billing.freeActivation()) {
      await models.subscribers.update(
        { status: 'active', activation: 'free_test', activated_at: new Date() },
        { where: { id: sub.id } });
      const provisioning = require('../services/provisioning');
      const r2 = await provisioning.run(sub.id, { teaserToken: teaser_token });
      await models.audit_log.create({
        tenant_id: sub.id, actor: 'system', action: 'free_activation',
        reason: 'JOBUP_FREE_ACTIVATION=1 — activated with no payment (test mode)',
      });
      return res.json({
        ok: true, configured: true, free_activation: true,
        url: `${base}/welcome?s=${sub.id}`,
        provisioned: r2.ok, site: r2.url, steps: r2.steps,
        note: 'TEST MODE — no payment was taken. This account is marked free_test.',
      });
    }

    // ---- PAID TIER selected on the landing (Search/Landed) ----------------
    // Plan-aware monthly checkout at the SELECTED price; the account is then
    // provisioned on that plan by the webhook. Success returns to /build to
    // capture the password + targeting, same as the single-tier flow.
    if (chosenPlan === 'search' || chosenPlan === 'landed') {
      const rp = await billing.createPlanCheckout({
        subscriberId: sub.id, email, plan: chosenPlan, teaserToken: teaser_token,
        successUrl: teaser_token
          ? `${base}/build?t=${encodeURIComponent(teaser_token)}&s=${sub.id}&paid=1&cs={CHECKOUT_SESSION_ID}`
          : `${base}/welcome?s=${sub.id}&paid=1&cs={CHECKOUT_SESSION_ID}`,
        cancelUrl: teaser_token ? `${base}/teaser/${teaser_token}` : `${base}/`,
      });
      return res.status(rp.ok ? 200 : 503).json(rp);
    }

    // AFTER PAYMENT, FINISH THE ACCOUNT — do not drop them on a status page.
    //
    // Stripe's redirect used to land on /welcome, where the only thing left to
    // do was pick a password. That skipped the account form entirely, so every
    // paying subscriber ended up with empty targeting: no employment type, no
    // work mode, no locations. The Hunter then searched against nothing.
    // /build takes the password AND what to look for, then forwards to the
    // confirmation screen itself.
    const r = await billing.createCheckout({
      subscriberId: sub.id, email, teaserToken: teaser_token,
      successUrl: teaser_token
        ? `${base}/build?t=${encodeURIComponent(teaser_token)}&s=${sub.id}&paid=1&cs={CHECKOUT_SESSION_ID}`
        : `${base}/welcome?s=${sub.id}&paid=1&cs={CHECKOUT_SESSION_ID}`,
      cancelUrl: teaser_token ? `${base}/teaser/${teaser_token}` : `${base}/`,
    });
    // Honest when unconfigured — never a fake URL.
    res.status(r.ok ? 200 : 503).json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stripe webhook. Signature verification is required in production.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Nothing should be sending these while payment is off. Refusing is safer
  // than processing an event that could flip a subscriber's status.
  if (billing.disabled()) {
    return res.status(503).json({ error: 'billing is disabled on this deployment' });
  }
  let event;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    // MUST go through the service, not process.env. JobUp can be on its own
    // Stripe account (JOBUP_STRIPE_*), and verifying a test-mode signature
    // against the estate-wide live secret fails every time — so a real payment
    // would never activate an account, and the only symptom is silence.
    const whSecret = billing.webhookSecret();
    if (whSecret && billing.enabled()) {
      const stripe = require('stripe')(billing.secretKey());
      event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], whSecret);
    } else if (process.env.NODE_ENV === 'production') {
      // REFUSE rather than trust an unverified body. An unauthenticated webhook
      // that flips subscribers to active is a free-subscription vulnerability.
      return res.status(503).json({
        error: 'webhook signature verification is not configured',
        note: 'Set STRIPE_WEBHOOK_SECRET. Unverified webhooks are refused in production.',
      });
    } else {
      event = JSON.parse(raw.toString('utf8'));
    }
  } catch (e) {
    // Record the rejection: this is the ONLY visible trace that a wrong-endpoint
    // signing secret leaves behind.
    billing.noteWebhook({ verified: false, error: e.message });
    return res.status(400).json({ error: 'signature verification failed: ' + e.message });
  }
  try {
    const r = await billing.applyEvent(event.type, event.data && event.data.object ? event.data.object : {});
    billing.noteWebhook({ verified: true, type: event.type,
      action: r && (r.action || (r.parked ? 'parked' : null)) });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/renewal-notices', async (req, res) => {
  res.json({ due: await billing.renewalNoticesDue() });
});

// ---- TIERED PLANS (new subscribers only) -----------------------------------

// Public plan catalog for the pricing/landing page.
router.get('/plans', (req, res) => {
  res.json({
    ok: true, configured: billing.status().configured,
    plans: plans.allPlans().map((p) => ({
      id: p.id, name: p.name, price_cents: p.price_cents, trial_days: p.trial_days,
      tagline_en: p.tagline_en, tagline_es: p.tagline_es,
      includes_en: p.includes_en, includes_es: p.includes_es,
    })),
  });
});

// The signed-in subscriber's current plan + entitlement + billing state.
router.get('/plan/me', async (req, res) => {
  try {
    const tid = tenantFromReq(req); if (!tid) return res.status(401).json({ error: 'not signed in' });
    const sub = await models.subscribers.findOne({ where: { id: tid } });
    if (!sub) return res.status(404).json({ error: 'no account' });
    const e = ent.entitlementForSub(sub);
    res.json({
      ok: true, plan: e.plan, legacy: e.legacy, status: sub.status, degraded: e.degraded,
      current_period_end: sub.current_period_end, pending_plan: sub.pending_plan,
      plan_change_at: sub.plan_change_at, paused_until: sub.paused_until,
      caps: e.caps, catalog: plans.planFor(e.plan || 'free'),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Start a paid subscription for a signed-in (Free/legacy) subscriber.
router.post('/plan/checkout', async (req, res) => {
  try {
    const tid = tenantFromReq(req); if (!tid) return res.status(401).json({ error: 'not signed in' });
    const sub = await models.subscribers.findOne({ where: { id: tid } });
    if (!sub) return res.status(404).json({ error: 'no account' });
    const plan = String((req.body || {}).plan || '');
    if (!plans.isPaid(plan)) return res.status(400).json({ error: 'Choose the Search or Landed plan.' });
    const base = process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev';
    const r = await billing.createPlanCheckout({
      subscriberId: sub.id, email: sub.email, plan,
      successUrl: `${base}/plan?upgraded=1`, cancelUrl: `${base}/plan`,
    });
    res.status(r.ok ? 200 : 503).json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function planAction(fn) {
  return async (req, res) => {
    try {
      const tid = tenantFromReq(req); if (!tid) return res.status(401).json({ error: 'not signed in' });
      const r = await fn(tid, req);
      res.status(r.ok ? 200 : 400).json(r);
    } catch (err) { res.status(500).json({ error: err.message }); }
  };
}
router.post('/plan/change', planAction((tid, req) => billing.changePlan({ subscriberId: tid, toPlan: String((req.body || {}).plan || '') })));
router.post('/plan/pause',  planAction((tid) => billing.pausePlan({ subscriberId: tid })));
router.post('/plan/resume', planAction((tid) => billing.resumePlan({ subscriberId: tid })));
router.post('/plan/cancel', planAction((tid) => billing.cancelPlan({ subscriberId: tid })));

module.exports = router;
