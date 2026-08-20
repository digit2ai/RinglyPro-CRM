'use strict';

// =============================================================================
// orbupBilling — Stripe subscriptions for OrbUp plans.
//
// Naming mirrors JobUp's billing service (createCheckout / createPortal /
// applyEvent) so the two products can share a billing brain later.
//
// Every webhook is claimed by its Stripe event id BEFORE anything is applied, so
// a redelivery is a no-op at the door rather than something the ledger has to
// defend against twice.
// =============================================================================

const express = require('express');
const credits = require('../services/orbupCredits');
const { sequelize } = require('../models');

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
const ORB_BASE = process.env.ORBUP_BASE_URL || 'https://orbup.app';

function stripe() {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) return null;
  try { return require('stripe')(k); } catch (_) { return null; }
}

// Identity comes from the signed OrbUp session — never from a posted email.
function sessionUser(req) {
  const t = (req.body && req.body.session) || (req.query && req.query.session)
    || ((req.headers.authorization || '').replace(/^Bearer\s+/i, '')) || '';
  if (!t) return null;
  try {
    const p = require('jsonwebtoken').verify(String(t),
      process.env.ORBUP_SECRET || process.env.JWT_SECRET || 'orbup-workspace-secret-change-me');
    return p && p.uid && p.email ? { uid: p.uid, email: String(p.email).toLowerCase() } : null;
  } catch (_) { return null; }
}

const apiRouter = express.Router();

// GET /plans — the pricing table, straight from the service. The page renders
// what the server actually charges, so the two can never drift.
apiRouter.get('/plans', async (req, res) => {
  const s = stripe();
  res.json({
    success: true,
    rollover: credits.ROLLOVER,
    configured: !!s,
    plans: Object.values(credits.PLANS).map(p => ({
      key: p.key, label: p.label, cents: p.cents, was_cents: p.was_cents || null,
      credits: p.credits, recommended: !!p.recommended,
      purchasable: p.key === 'free' ? false : !!credits.priceIdFor(p.key)
    })),
    topups: credits.TOPUPS.map(t => ({ key: t.key, cents: t.cents, credits: t.credits,
      purchasable: !!credits.topupPriceId(t.key) })),
    costs: await credits.costTable().catch(() => [])
  });
});

// GET /balance — the live meter. Reads the account, never a hardcoded number.
apiRouter.get('/balance', async (req, res) => {
  const me = sessionUser(req);
  if (!me) return res.status(401).json({ success: false, error: 'needs_auth' });
  try {
    const a = await credits.getAccount({ tenantId: me.uid, userId: me.uid, email: me.email });
    const allowance = a.monthly_allowance || 1;
    const pct = Math.max(0, Math.min(100, Math.round((a.balance / allowance) * 100)));
    const topup = a.topup_balance || 0;
    res.json({ success: true, plan: a.plan, balance: a.balance, topup_balance: topup,
               available: a.balance + topup, allowance, pct,
               // The warning is about the perishable bucket. Purchased credits do
               // not expire, so a healthy top-up balance means you are not low.
               low: pct <= 20 && topup === 0, critical: pct <= 5 && topup === 0,
               period_end: a.period_end, rollover: credits.ROLLOVER });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /checkout { plan, session } -> Stripe Checkout in subscription mode.
apiRouter.post('/checkout', async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ success: false, error: 'billing_not_configured' });
  const me = sessionUser(req);
  if (!me) return res.status(401).json({ success: false, error: 'needs_auth' });
  const plan = String((req.body || {}).plan || '').toLowerCase();
  // Free never touches Stripe and never asks for a card. Refused here explicitly
  // so a forged or mistaken request cannot open a checkout for a free plan.
  if (plan === 'free') {
    return res.status(400).json({ success: false, error: 'free_needs_no_payment',
      note: 'The Free plan requires no card. Sign up and it is granted.' });
  }
  const price = credits.priceIdFor(plan);
  if (!price) return res.status(400).json({ success: false, error: 'unknown_plan', plan });
  try {
    const acct = await credits.getAccount({ tenantId: me.uid, userId: me.uid, email: me.email });
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      customer: acct.stripe_customer_id || undefined,
      customer_email: acct.stripe_customer_id ? undefined : me.email,
      client_reference_id: String(me.uid),
      // The webhook is the source of truth, and it reads these back.
      metadata: { orbup_user_id: String(me.uid), orbup_email: me.email, orbup_plan: plan },
      subscription_data: { metadata: { orbup_user_id: String(me.uid), orbup_email: me.email, orbup_plan: plan } },
      success_url: ORB_BASE + '/orbup/welcome?checkout=success&plan=' + encodeURIComponent(plan),
      cancel_url: ORB_BASE + '/orbup#pricing'
    });
    res.json({ success: true, url: session.url });
  } catch (e) {
    console.error('[orbupBilling] checkout failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /topup { pack, session } -> one-time Stripe Checkout. mode:'payment', so
// this can never create a subscription, and a Free user can buy credits without
// ever taking on a recurring charge.
apiRouter.post('/topup', async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ success: false, error: 'billing_not_configured' });
  const me = sessionUser(req);
  if (!me) return res.status(401).json({ success: false, error: 'needs_auth' });
  const packKey = String((req.body || {}).pack || '').toLowerCase();
  const pack = credits.topupPack(packKey);
  const price = credits.topupPriceId(packKey);
  if (!pack || !price) return res.status(400).json({ success: false, error: 'unknown_pack', pack: packKey });
  try {
    const acct = await credits.getAccount({ tenantId: me.uid, userId: me.uid, email: me.email });
    const session = await s.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price, quantity: 1 }],
      customer: acct.stripe_customer_id || undefined,
      customer_email: acct.stripe_customer_id ? undefined : me.email,
      client_reference_id: String(me.uid),
      metadata: { orbup_user_id: String(me.uid), orbup_email: me.email, orbup_topup: packKey },
      payment_intent_data: { metadata: { orbup_user_id: String(me.uid), orbup_topup: packKey } },
      success_url: ORB_BASE + '/orbup/welcome?topup=success&pack=' + encodeURIComponent(packKey),
      cancel_url: ORB_BASE + '/orbup#pricing'
    });
    res.json({ success: true, url: session.url });
  } catch (e) {
    console.error('[orbupBilling] topup failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /portal — self-service upgrade, downgrade and cancel.
apiRouter.post('/portal', async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ success: false, error: 'billing_not_configured' });
  const me = sessionUser(req);
  if (!me) return res.status(401).json({ success: false, error: 'needs_auth' });
  try {
    const acct = await credits.getAccount({ tenantId: me.uid, userId: me.uid, email: me.email });
    if (!acct.stripe_customer_id) return res.status(400).json({ success: false, error: 'no_subscription' });
    const p = await s.billingPortal.sessions.create({
      customer: acct.stripe_customer_id, return_url: ORB_BASE + '/orbup/workspace'
    });
    res.json({ success: true, url: p.url });
  } catch (e) {
    console.error('[orbupBilling] portal failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---- webhook ---------------------------------------------------------------
async function accountForStripe({ customerId, meta }) {
  const uid = parseInt((meta && (meta.orbup_user_id || meta.orbup_uid)) || 0, 10);
  const email = (meta && meta.orbup_email) || null;
  if (uid) return { uid, email: email || '' };
  if (customerId) {
    const [[r]] = await sequelize.query(
      'SELECT user_id, email FROM orbup_credit_accounts WHERE stripe_customer_id = :c LIMIT 1',
      { replacements: { c: customerId } });
    if (r) return { uid: r.user_id, email: r.email };
  }
  return null;  // unattributable — parked, never guessed onto an account
}

async function applyEvent(event) {
  const type = event.type;
  const obj = event.data && event.data.object || {};
  const meta = obj.metadata || (obj.subscription_details && obj.subscription_details.metadata) || {};
  const customerId = obj.customer || null;
  const who = await accountForStripe({ customerId, meta });
  if (!who) { console.warn('[orbupBilling] unattributable %s, parked', type); return; }

  const acct = await credits.getAccount({ tenantId: who.uid, userId: who.uid, email: who.email });

  if (type === 'checkout.session.completed' && (obj.mode === 'payment' || meta.orbup_topup)) {
    // A one-time credit purchase. Idempotent on the Stripe session id, and it
    // never touches the plan — buying credits is not subscribing.
    await credits.topUp({ tenantId: who.uid, userId: who.uid, email: who.email,
      packKey: meta.orbup_topup, sessionId: obj.id });
    if (customerId) await sequelize.query(
      'UPDATE orbup_credit_accounts SET stripe_customer_id=:c, updated_at=NOW() WHERE id=:i',
      { replacements: { c: customerId, i: acct.id } });
    return;
  }

  if (type === 'checkout.session.completed') {
    const plan = meta.orbup_plan || 'plus';
    await sequelize.query(
      `UPDATE orbup_credit_accounts SET stripe_customer_id=:c, stripe_subscription_id=:s, updated_at=NOW() WHERE id=:i`,
      { replacements: { c: customerId, s: obj.subscription || null, i: acct.id } });
    await credits.prorateUpgrade({ tenantId: who.uid, userId: who.uid, email: who.email,
      fromPlan: acct.plan, toPlan: plan, eventId: event.id });
    return;
  }

  if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
    const priceId = obj.items && obj.items.data && obj.items.data[0] && obj.items.data[0].price
      && obj.items.data[0].price.id;
    const plan = credits.planForPriceId(priceId) || meta.orbup_plan;
    if (!plan) return;
    await sequelize.query(
      `UPDATE orbup_credit_accounts SET stripe_customer_id=:c, stripe_subscription_id=:s, updated_at=NOW() WHERE id=:i`,
      { replacements: { c: customerId, s: obj.id, i: acct.id } });
    if (plan !== acct.plan) {
      await credits.prorateUpgrade({ tenantId: who.uid, userId: who.uid, email: who.email,
        fromPlan: acct.plan, toPlan: plan, eventId: event.id });
    }
    return;
  }

  // Refill on the billing anniversary, not the calendar first.
  if (type === 'invoice.paid') {
    const priceId = obj.lines && obj.lines.data && obj.lines.data[0] && obj.lines.data[0].price
      && obj.lines.data[0].price.id;
    // Price id first, then the metadata Stripe carries on the subscription. The
    // metadata fallback matters: if a price env var is unset or a price object is
    // later replaced, the plan is still recoverable and the refill is still right.
    const plan = credits.planForPriceId(priceId) || meta.orbup_plan || acct.plan;
    const period = obj.lines && obj.lines.data && obj.lines.data[0] && obj.lines.data[0].period;
    await credits.refill({ tenantId: who.uid, userId: who.uid, email: who.email, plan,
      periodStart: period && period.start ? new Date(period.start * 1000) : undefined,
      periodEnd: period && period.end ? new Date(period.end * 1000) : undefined,
      eventId: event.id });
    return;
  }

  if (type === 'customer.subscription.deleted') {
    await credits.downgradeToFree({ tenantId: who.uid, userId: who.uid, email: who.email, eventId: event.id });
    return;
  }

  // Terminal failure only — Stripe retries before giving up, and a mid-dunning
  // downgrade would punish a card that is about to succeed.
  if (type === 'invoice.payment_failed') {
    if (obj.next_payment_attempt) return;
    await credits.downgradeToFree({ tenantId: who.uid, userId: who.uid, email: who.email, eventId: event.id });
  }
}

const webhookRouter = express.Router();
webhookRouter.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).send('billing not configured');
  let event;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // REFUSE rather than trust an unverified body — the same stance JobUp takes.
    // An unauthenticated webhook that reaches this handler could POST a forged
    // invoice.paid with any orbup_user_id and grant itself 100,000 credits.
    console.error('[orbupBilling] refused: STRIPE_WEBHOOK_SECRET is not set');
    return res.status(503).json({ error: 'webhook signature verification is not configured',
      note: 'Set STRIPE_WEBHOOK_SECRET. Unverified webhooks are refused.' });
  }
  try {
    event = s.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (e) {
    console.error('[orbupBilling] signature verify failed:', e.message);
    return res.status(400).send('bad signature');
  }
  // Claim the event id first. A redelivery never reaches the handler.
  try {
    const fresh = await credits.claimEvent(event.id, event.type);
    if (!fresh) return res.json({ received: true, replay: true });
    await applyEvent(event);
  } catch (e) {
    console.error('[orbupBilling] handler error:', e.message);
  }
  res.json({ received: true });
});

module.exports = { apiRouter, webhookRouter, applyEvent };
