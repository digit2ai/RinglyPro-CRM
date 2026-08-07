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

/**
 * THE PAYMENT LAYER IS OFF.
 *
 * JobUp is running its funnel without billing while the signup flow is proven
 * end to end: intake -> teaser -> account form -> live account. Nothing charges,
 * nothing calls Stripe, and no surface quotes a price.
 *
 * This is a SWITCH, not a deletion — every Stripe path below is intact and
 * comes back by setting JOBUP_BILLING_ENABLED=1 (plus the usual STRIPE_* keys).
 * Deleting the code would have meant rewriting dunning, refunds, renewal
 * notices and webhook attribution later; disabling it costs one env var.
 *
 * Accounts created while this is off are stamped activation:'no_billing' so
 * they can never be counted as revenue, exactly like the free_test stamp.
 */
/**
 * Billing is ON by default — you have to ASK for it to be off.
 *
 * This briefly worked the other way round: a change made billing opt-IN via
 * JOBUP_BILLING_ENABLED, so a deploy silently switched payment off on a
 * deployment that had been taking money, and removing the old bypass variable
 * no longer restored it. A default that changes what "no configuration" means
 * for revenue is the wrong shape, whichever way it points.
 *
 * JOBUP_BILLING_ENABLED=1 is still honoured so nothing that already sets it
 * breaks; it simply is not required any more.
 */
function disabled() {
  if (process.env.JOBUP_BILLING_DISABLED === '1') return true;
  if (process.env.JOBUP_BILLING_ENABLED === '1') return false;
  return false;   // default: charge for it
}

let stripe = null;
function client() {
  if (disabled()) return null;
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

/** WHY signups are free, if they are — the two causes must be distinguishable. */
function freeReason() {
  if (process.env.JOBUP_BILLING_DISABLED === '1') return 'JOBUP_BILLING_DISABLED=1';
  if (process.env.JOBUP_FREE_ACTIVATION === '1') return 'JOBUP_FREE_ACTIVATION=1';
  return null;
}

function status() {
  if (disabled()) {
    return {
      billing_disabled: true,
      configured: false,
      free_activation: true,      // every account is activated without payment
      price_usd: null,            // no surface may quote a price while this is off
      free_reason: freeReason(),
      note: 'The payment layer is switched off on this deployment. Accounts are '
          + 'created and activated for free and are stamped no_billing. '
          + 'Remove JOBUP_BILLING_DISABLED to restore checkout.',
    };
  }
  return {
    billing_disabled: false,
    free_activation: freeActivation(),
    // WHICH variable is making signups free, when billing itself is on. Without
    // this, 'free_activation: true' next to 'billing_disabled: false' looks
    // like a contradiction instead of a leftover override.
    free_reason: freeReason(),
    webhook_verification: process.env.STRIPE_WEBHOOK_SECRET ? 'configured'
      : 'NOT configured — production refuses unverified webhooks, so a real payment would never activate an account',
    configured: enabled(),
    price_usd: PRICE_USD,
    refund_days: REFUND_DAYS,
    renewal_notice_days: RENEWAL_NOTICE_DAYS,
    tax: process.env.STRIPE_TAX_ENABLED === '1' ? 'stripe_tax' : 'not_configured',
    note: enabled() ? null : 'Checkout is not configured. Set STRIPE_SECRET_KEY to enable payments.',
  };
}

/**
 * TEST MODE. When JOBUP_FREE_ACTIVATION=1 the payment step is skipped entirely:
 * the subscriber is activated and provisioned immediately, with no charge.
 *
 * This exists so the funnel can be walked end to end without a real card, and
 * it is deliberately NOT the default. It is reported by status(), shown on the
 * health endpoint and on the owner console, and every account created this way
 * is stamped `activation: 'free_test'` so it can never be mistaken for a
 * paying subscriber in the revenue figures.
 */
function freeActivation() {
  // With billing off, EVERY activation is free — that is the whole point.
  return disabled() || process.env.JOBUP_FREE_ACTIVATION === '1';
}

/**
 * THE TEASER TOKEN MUST TRAVEL WITH THE PAYMENT.
 *
 * applyEvent() reads obj.metadata.teaser_token to know which preview this
 * purchase belongs to. It was never written here, so it was always undefined
 * and every paid signup provisioned with teaserToken:null — which meant
 * adoptTeaser() no-opped, no profile row was created, the address the preview
 * promised was not honoured, and the site published EMPTY while /welcome showed
 * four green ticks. The person paid and got nothing.
 *
 * It goes on both the session and the subscription: session metadata is what
 * checkout.session.completed carries, subscription metadata is what every later
 * subscription.* event carries.
 */
async function createCheckout({ subscriberId, email, successUrl, cancelUrl, teaserToken }) {
  if (disabled()) {
    return { ok: false, configured: false, billing_disabled: true,
             error: 'Payment is switched off on this deployment. Accounts are created for free.' };
  }
  const s = client();
  if (!s) {
    // Honest refusal. Never a fake URL.
    return { ok: false, configured: false,
             error: 'Checkout is not configured on this deployment. Set STRIPE_SECRET_KEY.' };
  }
  const meta = { subscriber_id: String(subscriberId) };
  if (teaserToken) meta.teaser_token = String(teaserToken);

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
      metadata: meta,
      subscription_data: { metadata: meta },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return { ok: true, configured: true, url: session.url, id: session.id };
  } catch (e) {
    return { ok: false, configured: true, error: e.message };
  }
}

/**
 * Ask Stripe directly whether this checkout session was paid.
 *
 * THE REDIRECT USUALLY BEATS THE WEBHOOK. Stripe sends the browser back the
 * instant the card clears, while the webhook is a separate delivery that can
 * be seconds late, retried, or — if signature verification is misconfigured —
 * never processed at all. Gating the account form on the webhook having landed
 * would strand a paying customer on a page that refuses to let them continue.
 *
 * So the form asks Stripe itself, using the session id Stripe put in the return
 * URL. This is the authoritative answer and it cannot be forged: a made-up id
 * does not resolve, and one that does resolve carries its own subscriber_id.
 */
async function verifyCheckoutSession(sessionId) {
  if (disabled()) return { ok: false, reason: 'billing disabled' };
  const s = client();
  if (!s || !sessionId) return { ok: false, reason: 'not configured or no session id' };
  try {
    const cs = await s.checkout.sessions.retrieve(String(sessionId));
    const paid = cs.payment_status === 'paid' || cs.status === 'complete';
    return {
      ok: true, paid,
      subscriberId: parseInt((cs.metadata && cs.metadata.subscriber_id) || '', 10) || null,
      teaserToken: (cs.metadata && cs.metadata.teaser_token) || null,
      customerId: cs.customer || null,
      subscriptionId: cs.subscription || null,
      email: (cs.customer_details && cs.customer_details.email) || cs.customer_email || null,
    };
  } catch (e) {
    return { ok: false, reason: e.message };
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
  freeReason,
  disabled,
  freeActivation,
  enabled, status, createCheckout, verifyCheckoutSession, createPortal, applyEvent,
  renewalNoticesDue, refundEligible,
  PRICE_USD, REFUND_DAYS, RENEWAL_NOTICE_DAYS, DUNNING_STAGES,
};
