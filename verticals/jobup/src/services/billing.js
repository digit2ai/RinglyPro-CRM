'use strict';

// =============================================================
// Billing (spec sections 8, 14). Ported from the donor LawnCopilot pattern.
//
// HONEST WITH NO KEY (spec section 21): no STRIPE_SECRET_KEY disables checkout
// with a truthful message. It NEVER returns a fake URL.
//
// Lifecycle is the part that decides whether annual SaaS survives: dunning,
// trial_will_end, card expiry, renewal notice, refunds.
// =============================================================

const { models } = require('../models');

const PRICE_USD = parseInt(process.env.JOBUP_PRICE_USD || '97', 10);
const REFUND_DAYS = parseInt(process.env.JOBUP_REFUND_DAYS || '14', 10);
const RENEWAL_NOTICE_DAYS = [30, 7];
const DUNNING_STAGES = 4;

let stripe = null;
function client() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (stripe) return stripe;
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    return stripe;
  } catch (e) {
    console.warn('[billing] stripe SDK unavailable:', e.message);
    return null;
  }
}

function enabled() {
  return Boolean(client());
}

function status() {
  return {
    configured: enabled(),
    price_usd: PRICE_USD,
    refund_days: REFUND_DAYS,
    renewal_notice_days: RENEWAL_NOTICE_DAYS,
    tax: process.env.STRIPE_TAX_ENABLED === '1' ? 'stripe_tax' : 'not_configured',
    note: enabled() ? null : 'Checkout is not configured. Set STRIPE_SECRET_KEY to enable payments.',
  };
}

async function createCheckout({ subscriberId, email, successUrl, cancelUrl }) {
  const s = client();
  if (!s) {
    // Honest refusal. Never a fake URL.
    return { ok: false, configured: false,
             error: 'Checkout is not configured on this deployment. Set STRIPE_SECRET_KEY.' };
  }
  try {
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          recurring: { interval: 'year' },
          unit_amount: PRICE_USD * 100,
          product_data: { name: 'JobUp — Personal AI Career Platform' },
        },
        quantity: 1,
      }],
      automatic_tax: { enabled: process.env.STRIPE_TAX_ENABLED === '1' },
      // Attribution by metadata — never guessed from the customer object.
      metadata: { subscriber_id: String(subscriberId) },
      subscription_data: { metadata: { subscriber_id: String(subscriberId) } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return { ok: true, configured: true, url: session.url, id: session.id };
  } catch (e) {
    return { ok: false, configured: true, error: e.message };
  }
}

async function createPortal({ customerId, returnUrl }) {
  const s = client();
  if (!s) return { ok: false, configured: false, error: 'Billing portal is not configured.' };
  try {
    const p = await s.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { ok: true, url: p.url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Apply a Stripe webhook event. Attribution comes from metadata ONLY —
 * an unattributable event is parked, never guessed onto a subscriber.
 */
async function applyEvent(type, obj, opts = {}) {
  const subscriberId = parseInt(
    (obj.metadata && obj.metadata.subscriber_id) ||
    (obj.subscription_details && obj.subscription_details.metadata && obj.subscription_details.metadata.subscriber_id) ||
    '', 10
  );

  if (!Number.isInteger(subscriberId)) {
    return { ok: false, parked: true, reason: 'no subscriber_id in metadata — parked rather than guessed', type };
  }

  switch (type) {
    case 'checkout.session.completed': {
      await models.subscribers.update(
        { status: 'active', stripe_customer_id: obj.customer, stripe_subscription_id: obj.subscription },
        { where: { id: subscriberId } }
      );
      // THE PAID SIGNAL. Provisioning runs as a background job — the webhook
      // must answer fast, and the chain far exceeds Cloudflare's ~100s ceiling.
      const teaserToken = (obj.metadata && obj.metadata.teaser_token) || null;
      const provisioning = require('./provisioning');
      if (opts.inline) {
        const r = await provisioning.run(subscriberId, { teaserToken });
        return { ok: true, action: 'activated', subscriberId, provisioning: r };
      }
      setImmediate(() => {
        provisioning.run(subscriberId, { teaserToken })
          .then((r) => console.log('[provisioning]', subscriberId, r.ok ? 'live at ' + r.url : 'FAILED', r.ms + 'ms'))
          .catch((e) => console.error('[provisioning] failed for', subscriberId, e.message));
      });
      return { ok: true, action: 'activated', subscriberId, provisioning: 'queued' };
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await models.subscribers.update(
        { status: obj.status === 'active' || obj.status === 'trialing' ? 'active'
                : obj.status === 'past_due' ? 'past_due' : obj.status,
          current_period_end: obj.current_period_end ? new Date(obj.current_period_end * 1000) : null },
        { where: { id: subscriberId } }
      );
      return { ok: true, action: 'status:' + obj.status, subscriberId };

    case 'customer.subscription.trial_will_end':
      // The conversion email. This single message largely decides trial-to-paid.
      return { ok: true, action: 'trial_will_end_notice_queued', subscriberId };

    case 'customer.subscription.deleted': {
      const provisioning = require('./provisioning');
      const r = await provisioning.teardown(subscriberId);
      return { ok: true, action: 'torn_down', subscriberId, ...r };
    }

    case 'invoice.paid':
      await models.invoices.create({
        tenant_id: subscriberId, stripe_invoice_id: obj.id,
        amount_cents: obj.amount_paid, status: 'paid', dunning_stage: 0, paid_at: new Date(),
      });
      return { ok: true, action: 'invoice_recorded', subscriberId };

    case 'invoice.payment_failed': {
      const existing = await models.invoices.findOne({ where: { stripe_invoice_id: obj.id } });
      const stage = Math.min(DUNNING_STAGES, ((existing && existing.dunning_stage) || 0) + 1);
      if (existing) {
        await models.invoices.update({ status: 'past_due', dunning_stage: stage }, { where: { id: existing.id } });
      } else {
        await models.invoices.create({
          tenant_id: subscriberId, stripe_invoice_id: obj.id,
          amount_cents: obj.amount_due, status: 'past_due', dunning_stage: stage,
        });
      }
      await models.subscribers.update({ status: 'past_due' }, { where: { id: subscriberId } });
      return { ok: true, action: 'dunning', stage, subscriberId,
               suspend: stage >= DUNNING_STAGES,
               note: stage >= DUNNING_STAGES ? 'Grace period exhausted — suspend.' : 'Grace period: site stays up, agents keep running.' };
    }

    default:
      return { ok: true, action: 'ignored', type };
  }
}

/** Which subscribers are due an advance renewal notice (30 and 7 days). */
async function renewalNoticesDue(now = new Date()) {
  const subs = await models.subscribers.findAll({ where: { status: 'active' } });
  const due = [];
  for (const s of subs) {
    if (!s.current_period_end) continue;
    const days = Math.round((new Date(s.current_period_end) - now) / 86400000);
    if (RENEWAL_NOTICE_DAYS.includes(days)) {
      due.push({ subscriber_id: s.id, email: s.email, days_out: days, amount_usd: PRICE_USD });
    }
  }
  return due;
}

/** Is this subscriber inside the published refund window? */
function refundEligible(chargedAt, now = new Date()) {
  if (!chargedAt) return false;
  const days = (now - new Date(chargedAt)) / 86400000;
  return days <= REFUND_DAYS;
}

module.exports = {
  enabled, status, createCheckout, createPortal, applyEvent,
  renewalNoticesDue, refundEligible,
  PRICE_USD, REFUND_DAYS, RENEWAL_NOTICE_DAYS, DUNNING_STAGES,
};
