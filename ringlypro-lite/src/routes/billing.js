'use strict';

/**
 * Stripe billing — RinglyPro Lite US plan (config-driven, overridable via env):
 *   - One-time SETUP fee: $49
 *   - Monthly subscription: $49/mo, includes 150 answered minutes
 *   - Overage: $0.40 per minute beyond the included allowance
 *   - 7-day trial; failed payment suspends answering (voicemail) but keeps the DID
 *
 * Overage is metered from lite_calls duration for the current billing period and
 * can be pushed to Stripe as an invoice item (see POST /overage/bill).
 */
const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { Tenant, Call, Recharge, User, Number: LiteNumber } = require('../models');
const { entitlement } = require('../services/entitlement');
const minutesSvc = require('../services/minutes');

function stripe() {
  const key = process.env.LITE_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('LITE_STRIPE_SECRET_KEY not set');
  return require('stripe')(key);
}
function int(env, def) { const v = parseInt(process.env[env], 10); return Number.isFinite(v) ? v : def; }

const TRIAL_DAYS = int('LITE_TRIAL_DAYS', 7);

// Recharge amounts (USD) offered in the "add minutes" dialog. Each is charged to
// the tenant's saved payment method and credited as prepaid overage minutes.
const RECHARGE_AMOUNTS_USD = (process.env.LITE_RECHARGE_AMOUNTS || '10,20,40,60,80,100')
  .split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);

// US plan (the only market for now). All amounts config-overridable.
function plan() {
  return {
    priceId: process.env.LITE_STRIPE_PRICE_US || null,     // optional pre-made recurring Price
    setupPriceId: process.env.LITE_STRIPE_SETUP_PRICE_US || null, // optional one-time Price
    monthlyCents: int('LITE_PRICE_US_CENTS', 4900),        // $49/mo
    setupCents: int('LITE_SETUP_US_CENTS', 0),             // no setup fee (0 = disabled)
    includedMinutes: int('LITE_INCLUDED_MIN_US', 150),     // 150 min included
    overagePerMinCents: int('LITE_OVERAGE_US_CENTS', 40),  // $0.40/min
    currency: (process.env.LITE_PRICE_US_CURRENCY || 'usd').toLowerCase(),
    name: 'RinglyPro Lite'
  };
}

// periodStart + usedMinutes now live in services/minutes.js (rollover-aware).
const periodStart = minutesSvc.periodStart;

router.get('/status', requireAuth, async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenantId);
  // Advance banked minutes if the billing period rolled over.
  try { await minutesSvc.reconcileRollover(tenant); } catch (_) {}
  const p = plan();
  res.json({
    subscription_status: tenant.subscription_status,
    trial_ends_at: tenant.trial_ends_at,
    suspended: !!tenant.suspended_at,
    country: tenant.country,
    rollover_minutes: Number(tenant.rollover_minutes) || 0,
    purchased_minutes: Number(tenant.purchased_minutes) || 0,
    recharge_amounts_usd: RECHARGE_AMOUNTS_USD,
    ...entitlement(tenant),
    plan: {
      monthly_usd: p.monthlyCents / 100,
      setup_usd: p.setupCents / 100,
      included_minutes: p.includedMinutes,
      overage_per_min_usd: p.overagePerMinCents / 100
    }
  });
});

// Usage + projected overage for the current period (rollover + prepaid aware).
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.tenantId);
    const p = plan();
    const snap = await minutesSvc.usageSnapshot(tenant);
    res.json({
      ...snap,
      estimated_total_usd: +((p.monthlyCents / 100) + snap.overage_usd).toFixed(2)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Resolve the tenant's default/saved card payment method (invoice default →
// subscription default → first card on file). Returns a PM id or null.
async function savedPaymentMethod(s, tenant) {
  if (!tenant.stripe_customer_id) return null;
  try {
    const cust = await s.customers.retrieve(tenant.stripe_customer_id);
    let pm = cust && cust.invoice_settings && cust.invoice_settings.default_payment_method;
    if (!pm && tenant.stripe_subscription_id) {
      const sub = await s.subscriptions.retrieve(tenant.stripe_subscription_id);
      pm = sub && sub.default_payment_method;
    }
    if (!pm) {
      const list = await s.paymentMethods.list({ customer: tenant.stripe_customer_id, type: 'card', limit: 1 });
      pm = list.data[0] && list.data[0].id;
    }
    return pm || null;
  } catch (_) { return null; }
}

// Recharge: buy prepaid overage minutes. Charges the SAVED card off-session and
// credits minutes immediately; if no card is on file yet, returns a Checkout URL
// (one-time payment that also saves the card) and the webhook credits on success.
router.post('/recharge', requireAuth, async (req, res) => {
  try {
    const s = stripe();
    const tenant = await Tenant.findByPk(req.tenantId);
    const p = plan();
    const amountUsd = parseInt((req.body && req.body.amount_usd), 10);
    if (!RECHARGE_AMOUNTS_USD.includes(amountUsd)) {
      return res.status(400).json({ error: 'invalid_amount', allowed: RECHARGE_AMOUNTS_USD });
    }
    const cents = amountUsd * 100;
    const mins = minutesSvc.minutesForCents(cents);

    // Ensure a Stripe customer exists.
    if (!tenant.stripe_customer_id) {
      const c = await s.customers.create({ email: tenant.owner_email || undefined, metadata: { tenant_id: String(tenant.id) } });
      tenant.stripe_customer_id = c.id; await tenant.save();
    }

    const pm = await savedPaymentMethod(s, tenant);
    const base = (process.env.LITE_WEBHOOK_BASE_URL || 'https://localhost').replace(/\/$/, '');

    if (pm) {
      // Off-session charge to the saved card.
      const rec = await Recharge.create({ tenant_id: tenant.id, amount_cents: cents, minutes: mins, currency: p.currency, status: 'pending' });
      try {
        const pi = await s.paymentIntents.create({
          amount: cents, currency: p.currency, customer: tenant.stripe_customer_id,
          payment_method: pm, off_session: true, confirm: true,
          description: `RinglyPro Lite recharge — ${mins} min ($${amountUsd})`,
          metadata: { tenant_id: String(tenant.id), recharge_id: String(rec.id), minutes: String(mins) }
        });
        rec.stripe_payment_intent = pi.id;
        if (pi.status === 'succeeded') {
          rec.status = 'succeeded'; await rec.save();
          const balance = await minutesSvc.creditMinutes(tenant, mins);
          return res.json({ success: true, charged: true, minutes_added: mins, purchased_minutes: balance, amount_usd: amountUsd });
        }
        await rec.save();
        return res.json({ success: false, requires_action: true, status: pi.status });
      } catch (e) {
        rec.status = 'failed'; await rec.save();
        // Card was declined / needs authentication → fall back to Checkout.
        if (e.code === 'authentication_required' || e.type === 'StripeCardError') {
          // fall through to checkout below
        } else {
          return res.status(402).json({ error: e.message, code: e.code });
        }
      }
    }

    // No saved card (or the off-session charge needs the customer present):
    // one-time Checkout that saves the card for next time. Webhook credits minutes.
    const rec = await Recharge.create({ tenant_id: tenant.id, amount_cents: cents, minutes: mins, currency: p.currency, status: 'pending' });
    const session = await s.checkout.sessions.create({
      mode: 'payment',
      customer: tenant.stripe_customer_id,
      payment_intent_data: { setup_future_usage: 'off_session' },
      line_items: [{ price_data: { currency: p.currency, product_data: { name: `${p.name} — ${mins} minutes` }, unit_amount: cents }, quantity: 1 }],
      success_url: `${base}/dashboard?recharge=1`,
      cancel_url: `${base}/dashboard?recharge=0`,
      metadata: { tenant_id: String(tenant.id), recharge_id: String(rec.id), minutes: String(mins), kind: 'recharge' }
    });
    rec.stripe_checkout_session = session.id; await rec.save();
    res.json({ success: true, charged: false, checkout_url: session.url, minutes: mins, amount_usd: amountUsd });
  } catch (e) {
    console.error('[lite:billing] recharge error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Create a Stripe Checkout session: $49/mo subscription + $49 one-time setup fee.
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const s = stripe();
    const tenant = await Tenant.findByPk(req.tenantId);
    const p = plan();
    const base = (process.env.LITE_WEBHOOK_BASE_URL || 'https://localhost').replace(/\/$/, '');

    const recurring = p.priceId
      ? { price: p.priceId, quantity: 1 }
      : { price_data: { currency: p.currency, product_data: { name: `${p.name} — Monthly` }, unit_amount: p.monthlyCents, recurring: { interval: 'month' } }, quantity: 1 };

    // One-time setup fee — in subscription mode Stripe adds one-time line items
    // to the first invoice.
    const setup = p.setupPriceId
      ? { price: p.setupPriceId, quantity: 1 }
      : { price_data: { currency: p.currency, product_data: { name: `${p.name} — Setup (one-time)` }, unit_amount: p.setupCents }, quantity: 1 };

    const line_items = [recurring];
    if (p.setupCents > 0) line_items.push(setup);

    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer_email: tenant.owner_email || undefined,
      line_items,
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { tenant_id: String(tenant.id), country: tenant.country, plan: 'us_lite_49' }
      },
      success_url: `${base}/onboarding?paid=1&sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/onboarding?paid=0`,
      metadata: { tenant_id: String(tenant.id) }
    });
    res.json({ success: true, url: session.url });
  } catch (e) {
    console.error('[lite:billing] checkout error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Push the current period's overage to Stripe as an invoice item (idempotent-ish
// per period via metadata). Call at/near period end (manual or cron). Admin-gated.
router.post('/overage/bill', async (req, res) => {
  try {
    const key = process.env.LITE_ADMIN_KEY;
    if (!key || (req.headers['x-admin-key'] || req.query.key) !== key) return res.status(401).json({ error: 'unauthorized' });
    const tenant = await Tenant.findByPk(Number(req.body && req.body.tenant_id || req.query.tenant_id));
    if (!tenant || !tenant.stripe_customer_id) return res.status(400).json({ error: 'no_customer' });
    const p = plan();
    const since = await periodStart(tenant);
    const { minutes } = await minutesSvc.usedMinutes(tenant.id, since);
    // Only bill beyond ALL banked minutes (included + rollover + prepaid).
    const banked = p.includedMinutes + (Number(tenant.rollover_minutes) || 0) + (Number(tenant.purchased_minutes) || 0);
    const overageMin = Math.max(0, minutes - banked);
    if (overageMin <= 0) return res.json({ ok: true, overage_minutes: 0, billed: false });
    const amount = Math.round(overageMin * p.overagePerMinCents);
    const item = await stripe().invoiceItems.create({
      customer: tenant.stripe_customer_id,
      currency: p.currency,
      amount,
      description: `RinglyPro Lite overage — ${overageMin.toFixed(0)} min @ $${(p.overagePerMinCents / 100).toFixed(2)}/min`,
      metadata: { tenant_id: String(tenant.id), period_start: since.toISOString() }
    });
    res.json({ ok: true, overage_minutes: +overageMin.toFixed(2), amount_usd: amount / 100, invoice_item: item.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Confirm a completed Checkout session and persist the subscription on the
// tenant immediately (so onboarding can proceed to number provisioning without
// waiting on the webhook). Called right after the Stripe redirect back.
router.post('/confirm', requireAuth, async (req, res) => {
  try {
    const sid = (req.body && req.body.session_id) || req.query.session_id;
    if (!sid) return res.status(400).json({ error: 'missing_session_id' });
    const session = await stripe().checkout.sessions.retrieve(sid);
    if (String(session.metadata && session.metadata.tenant_id) !== String(req.tenantId)) {
      return res.status(403).json({ error: 'session_tenant_mismatch' });
    }
    const tenant = await Tenant.findByPk(req.tenantId);
    if (session.customer) tenant.stripe_customer_id = session.customer;
    if (session.subscription) tenant.stripe_subscription_id = session.subscription;
    tenant.subscription_status = 'trialing';   // webhook will refine to active/etc.
    tenant.suspended_at = null;
    await tenant.save();
    res.json({ success: true, has_card: !!tenant.stripe_subscription_id });
  } catch (e) {
    console.error('[lite:billing] confirm error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Auto-release DIDs from non-converting tenants to stop paying for dead numbers.
// Releases numbers where the subscription is canceled, OR the trial expired with
// no card on file (grace period), then marks the number released. Admin-gated;
// wire a Render cron to call this daily.
router.post('/release-unconverted', async (req, res) => {
  try {
    const key = process.env.LITE_ADMIN_KEY;
    if (!key || (req.headers['x-admin-key'] || req.query.key) !== key) return res.status(401).json({ error: 'unauthorized' });
    const { releaseUnconverted } = require('../services/numberReclaim');
    const released = await releaseUnconverted();
    res.json({ ok: true, released_count: released.length, released });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin-only: list all signed-up users/tenants (read-only, no secrets).
// Gate: LITE_ADMIN_KEY via ?key= or x-admin-key header (same as other admin routes).
// Open in a browser: /api/billing/admin/users?key=YOUR_LITE_ADMIN_KEY
router.get('/admin/users', async (req, res) => {
  try {
    const key = process.env.LITE_ADMIN_KEY;
    if (!key || (req.headers['x-admin-key'] || req.query.key) !== key) {
      return res.status(401).json({ error: 'unauthorized', hint: 'set LITE_ADMIN_KEY on Render and pass ?key=' });
    }
    const users = await User.findAll({ order: [['created_at', 'DESC']] });
    const tenants = await Tenant.findAll();
    const numbers = await LiteNumber.findAll({ where: { status: 'active' } });
    const tById = new Map(tenants.map(t => [t.id, t]));
    const numByTenant = new Map(numbers.map(n => [n.tenant_id, n.did]));
    const rows = users.map(u => {
      const t = tById.get(u.tenant_id) || {};
      return {
        user_id: u.id,
        email: u.email,
        name: u.name,
        signed_up: u.created_at,
        business_name: t.business_name,
        country: t.country,
        locale: t.locale,
        subscription_status: t.subscription_status,
        trial_ends_at: t.trial_ends_at,
        has_card: !!t.stripe_subscription_id,
        number: numByTenant.get(u.tenant_id) || null,
        rollover_minutes: t.rollover_minutes != null ? Number(t.rollover_minutes) : 0,
        purchased_minutes: t.purchased_minutes != null ? Number(t.purchased_minutes) : 0
      };
    });
    const paying = rows.filter(r => r.subscription_status === 'active').length;
    const trialing = rows.filter(r => r.subscription_status === 'trialing').length;
    res.json({ count: rows.length, paying, trialing, users: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cancel at period end.
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.tenantId);
    if (!tenant.stripe_subscription_id) return res.status(400).json({ error: 'no_subscription' });
    await stripe().subscriptions.update(tenant.stripe_subscription_id, { cancel_at_period_end: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
