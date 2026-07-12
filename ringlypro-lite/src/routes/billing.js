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
const { Tenant, Call } = require('../models');
const { entitlement } = require('../services/entitlement');

function stripe() {
  const key = process.env.LITE_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('LITE_STRIPE_SECRET_KEY not set');
  return require('stripe')(key);
}
function int(env, def) { const v = parseInt(process.env[env], 10); return Number.isFinite(v) ? v : def; }

const TRIAL_DAYS = int('LITE_TRIAL_DAYS', 7);

// US plan (the only market for now). All amounts config-overridable.
function plan() {
  return {
    priceId: process.env.LITE_STRIPE_PRICE_US || null,     // optional pre-made recurring Price
    setupPriceId: process.env.LITE_STRIPE_SETUP_PRICE_US || null, // optional one-time Price
    monthlyCents: int('LITE_PRICE_US_CENTS', 4900),        // $49/mo
    setupCents: int('LITE_SETUP_US_CENTS', 4900),          // $49 one-time
    includedMinutes: int('LITE_INCLUDED_MIN_US', 150),     // 150 min included
    overagePerMinCents: int('LITE_OVERAGE_US_CENTS', 40),  // $0.40/min
    currency: (process.env.LITE_PRICE_US_CURRENCY || 'usd').toLowerCase(),
    name: 'RinglyPro Lite'
  };
}

// Current billing period start: Stripe subscription period, else calendar month.
async function periodStart(tenant) {
  if (tenant.stripe_subscription_id) {
    try {
      const sub = await stripe().subscriptions.retrieve(tenant.stripe_subscription_id);
      if (sub && sub.current_period_start) return new Date(sub.current_period_start * 1000);
    } catch (_) { /* fall through */ }
  }
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// Answered minutes used this period (any call that connected).
async function usedMinutes(tenantId, since) {
  const calls = await Call.findAll({
    where: { tenant_id: tenantId, started_at: { [Op.gte]: since }, duration: { [Op.gt]: 0 } },
    attributes: ['duration']
  });
  const secs = calls.reduce((a, c) => a + (c.duration || 0), 0);
  return { minutes: +(secs / 60).toFixed(2), calls: calls.length };
}

router.get('/status', requireAuth, async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenantId);
  const p = plan();
  res.json({
    subscription_status: tenant.subscription_status,
    trial_ends_at: tenant.trial_ends_at,
    suspended: !!tenant.suspended_at,
    country: tenant.country,
    ...entitlement(tenant),
    plan: {
      monthly_usd: p.monthlyCents / 100,
      setup_usd: p.setupCents / 100,
      included_minutes: p.includedMinutes,
      overage_per_min_usd: p.overagePerMinCents / 100
    }
  });
});

// Usage + projected overage for the current period.
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.tenantId);
    const p = plan();
    const since = await periodStart(tenant);
    const { minutes, calls } = await usedMinutes(tenant.id, since);
    const overageMin = Math.max(0, +(minutes - p.includedMinutes).toFixed(2));
    const overageUsd = +((overageMin * p.overagePerMinCents) / 100).toFixed(2);
    res.json({
      period_start: since.toISOString(),
      calls,
      minutes_used: minutes,
      included_minutes: p.includedMinutes,
      minutes_remaining: Math.max(0, +(p.includedMinutes - minutes).toFixed(2)),
      overage_minutes: overageMin,
      overage_usd: overageUsd,
      estimated_total_usd: +((p.monthlyCents / 100) + overageUsd).toFixed(2)
    });
  } catch (e) {
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
      success_url: `${base}/dashboard?billing=success`,
      cancel_url: `${base}/dashboard?billing=cancel`,
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
    const { minutes } = await usedMinutes(tenant.id, since);
    const overageMin = Math.max(0, minutes - p.includedMinutes);
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
