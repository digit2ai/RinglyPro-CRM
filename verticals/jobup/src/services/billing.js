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

// THE list price, in one place. Every surface that quotes a figure reads it
// from here — the teaser, the voice lines, the admin console and the landing
// page, which used to hardcode its own copy and could therefore disagree with
// what Stripe actually charged.
const PRICE_USD = parseInt(process.env.JOBUP_PRICE_USD || '59', 10);
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

// ---- WHICH STRIPE ACCOUNT, AND WHOSE ---------------------------------------
//
// `STRIPE_SECRET_KEY` is shared by THIRTY-EIGHT files across this repo —
// chamber signups, HISPATEC, Lina's Treasures, credits, LawnCopilot's platform
// subscriptions, TunjoRacing checkout, EquiMind. Pointing that variable at a
// test key to try something in JobUp would silently stop every one of them
// taking real money, and nothing would look broken until a customer's card was
// never charged.
//
// So JobUp reads its OWN pair first and falls back to the shared one. Setting
// JOBUP_STRIPE_SECRET_KEY moves JobUp alone; leaving it unset changes nothing.
function secretKey() {
  return process.env.JOBUP_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
}
function webhookSecret() {
  return process.env.JOBUP_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';
}
/** 'test' | 'live' | null — read off the key itself, never configured separately. */
function mode() {
  const k = secretKey();
  if (!k) return null;
  return k.startsWith('sk_test_') || k.startsWith('rk_test_') ? 'test' : 'live';
}
function isTestMode() { return mode() === 'test'; }
/** True when JobUp is on its own key rather than the estate-wide one. */
function isolated() { return Boolean(process.env.JOBUP_STRIPE_SECRET_KEY); }

// ---- IS THIS ACTUALLY A KEY? -----------------------------------------------
//
// A key pasted from an abbreviated form — "sk_test_51RHs2a…00Mm2rz8E0" — still
// starts with sk_test_, so mode() reads "test", the SDK constructs happily and
// /health looks configured. The first sign of trouble is a customer's checkout
// failing. A Stripe key is a prefix plus base62 and nothing else, so a single
// character outside that set proves the paste was truncated, with no API call
// and no waiting for a real payment to expose it.
function keyShape(key) {
  const k = key === undefined ? secretKey() : String(key || '');
  if (!k) return { present: false };
  const body = k.replace(/^(sk|rk)_(test|live)_/, '');
  const bad = body.match(/[^A-Za-z0-9]/g) || [];
  return {
    present: true,
    length: k.length,
    prefix: k.slice(0, 8),
    // Live keys and test keys are both ~100+ characters.
    looks_truncated: k.length < 60 || bad.length > 0,
    illegal_characters: bad.length ? Array.from(new Set(bad)) : null,
    hint: bad.length
      ? 'This key contains characters a Stripe key cannot contain — it was almost '
        + 'certainly pasted from an abbreviated or ellipsised copy. Paste the whole value.'
      : (k.length < 60 ? 'This key is far shorter than a real Stripe key.' : null),
  };
}

/**
 * One real call to Stripe. It is the only thing that can tell "a key string is
 * set" from "Stripe accepts this key", and `livemode` comes back from Stripe
 * itself rather than from our own reading of the prefix.
 */
let probeCache = null;
async function probe({ maxAgeMs = 60000 } = {}) {
  if (probeCache && Date.now() - probeCache.at < maxAgeMs) {
    return { ...probeCache.result, cached: true };
  }
  const shape = keyShape();
  let result;
  if (!shape.present) result = { ok: false, reason: 'no Stripe key configured', shape };
  else if (disabled()) result = { ok: false, reason: 'billing is switched off', shape };
  else {
    const c = client();
    if (!c) result = { ok: false, reason: 'Stripe SDK unavailable', shape };
    else {
      try {
        const bal = await c.balance.retrieve();     // cheap, read-only, no side effect
        result = {
          ok: true, shape,
          // STRIPE'S answer, not our prefix guess. If these ever disagree,
          // trust this one.
          livemode: bal.livemode === true,
          mode_per_stripe: bal.livemode ? 'live' : 'test',
          mode_per_key_prefix: mode(),
          agrees: (bal.livemode ? 'live' : 'test') === mode(),
        };
      } catch (e) {
        result = {
          ok: false, shape,
          status: e && (e.statusCode || e.status) || null,
          type: (e && e.type) || null,
          reason: String((e && e.message) || e).slice(0, 300),
        };
      }
    }
  }
  probeCache = { at: Date.now(), result };
  return result;
}

// ---- ARE WEBHOOKS ACTUALLY ARRIVING, AND DO THEY VERIFY? -------------------
//
// The one thing no amount of config inspection can answer. A signing secret
// from the WRONG endpoint is perfectly well formed — right prefix, right
// length, right character set — and fails every signature. Nothing visible
// breaks: the account still activates through the build form, and only the
// invoice row and the referral commission go missing, quietly.
//
// So the webhook route records what actually happened. Combined with Stripe's
// "Send test event" button this turns "I hope the secret is right" into one
// curl, before a real customer pays.
const webhookLog = {
  received: 0, verified: 0, rejected: 0,
  last_at: null, last_type: null, last_verified: null, last_error: null, last_action: null,
};
/** Counters are owned here so a caller cannot corrupt them by passing undefined. */
function noteWebhook({ verified, type = null, error = null, action = null } = {}) {
  webhookLog.received += 1;
  if (verified) webhookLog.verified += 1; else webhookLog.rejected += 1;
  webhookLog.last_at = new Date().toISOString();
  webhookLog.last_verified = Boolean(verified);
  webhookLog.last_type = type;
  webhookLog.last_error = error ? String(error).slice(0, 200) : null;
  webhookLog.last_action = action;
}
function webhookHealth() {
  const w = { ...webhookLog };
  const secret = webhookSecret();
  w.secret_present = Boolean(secret);
  w.secret_shape_ok = Boolean(secret) && /^whsec_[A-Za-z0-9_-]{16,}$/.test(secret);
  w.secret_from = process.env.JOBUP_STRIPE_WEBHOOK_SECRET
    ? 'JOBUP_STRIPE_WEBHOOK_SECRET' : 'STRIPE_WEBHOOK_SECRET (shared)';
  w.note = !w.secret_present
    ? 'No signing secret — production refuses unverified webhooks, so nothing will ever activate.'
    : !w.secret_shape_ok
      ? 'This does not look like a signing secret. A Stripe webhook secret starts with whsec_ — '
        + 'an API key (sk_live_/sk_test_) pasted here fails every signature, silently.'
      : (webhookLog.received === 0
        ? 'Well formed, but nothing has arrived yet. Send a test event from the Stripe dashboard '
          + 'and check back — a secret from the WRONG endpoint looks identical to a right one.'
        : (webhookLog.rejected > 0 && webhookLog.verified === 0
          ? 'EVERY webhook has failed verification. The secret almost certainly belongs to a '
            + 'different endpoint than the one Stripe is posting to.'
          : null));
  return w;
}

// A TEST-MODE CHECKOUT PRODUCES A REAL ROW AND A REAL INVOICE.
//
// Stripe test mode issues genuine invoice objects with genuine amounts; nothing
// about the row says the money was imaginary. Left alone it would read as
// revenue in the billing register and, worse, qualify a referral commission —
// the ledger would owe somebody real money for a card that was never charged.
// So a test-mode signup is stamped, and every surface that means "not revenue"
// reads ONE list rather than repeating a literal it can forget to update.
const TEST_ACTIVATION = 'stripe_test';
const NON_REVENUE_ACTIVATIONS = ['free_test', 'no_billing', TEST_ACTIVATION];
function isNonRevenue(activation) {
  return NON_REVENUE_ACTIVATIONS.includes(String(activation || ''));
}
/** What to stamp on a subscriber activated through checkout right now. */
function activationStamp() {
  if (disabled()) return 'no_billing';
  return isTestMode() ? TEST_ACTIVATION : 'paid';
}

let stripe = null;
let stripeKey = null;
function client() {
  if (disabled()) return null;
  const key = secretKey();
  if (!key) return null;
  // Rebuild if the key changed under us, or a restart would be needed to swap
  // between test and live.
  if (stripe && stripeKey === key) return stripe;
  try {
    stripe = require('stripe')(key);
    stripeKey = key;
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
    webhook_verification: webhookSecret() ? 'configured'
      : 'NOT configured — production refuses unverified webhooks, so a real payment would never activate an account',
    configured: enabled(),
    // TEST MODE MUST BE IMPOSSIBLE TO MISS. A checkout that looks exactly like
    // the real one but takes no money is worse than one that is switched off:
    // somebody believes they subscribed.
    mode: mode(),
    test_mode: isTestMode(),
    stripe_account: isolated() ? 'JOBUP_STRIPE_SECRET_KEY (JobUp only)'
                               : 'STRIPE_SECRET_KEY (shared with the rest of the estate)',
    mode_note: isTestMode()
      ? 'TEST MODE — no real card is charged. Use 4242 4242 4242 4242, any future '
        + 'expiry and any CVC. Subscribers created here are real rows against a test '
        + 'Stripe account and should be purged before going live.'
      : null,
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
/**
 * RECONCILE FROM STRIPE — the webhook is not the only way money can be recorded.
 *
 * A signing secret from the wrong endpoint fails EVERY signature, and the
 * symptom is silence: the customer is charged, the account may still activate
 * through the build form, and only the invoice row and the referral commission
 * go missing. That happened here — two webhooks rejected, a real $59 taken,
 * and no invoice row anywhere.
 *
 * So we ask Stripe directly rather than waiting to be told. Stripe is the
 * authority on what was paid; this pulls what it already knows and replays it
 * through the SAME applyEvent the webhook uses, so there is one code path and
 * no second interpretation of what a payment means. applyEvent is idempotent,
 * which is what makes running this safe at any time, as often as you like.
 */
async function reconcile({ days = 7, limit = 100 } = {}) {
  const c = client();
  if (!c) return { ok: false, reason: 'Stripe is not configured on this deployment' };
  if (disabled()) return { ok: false, reason: 'billing is switched off' };

  const since = Math.floor((Date.now() - days * 86400000) / 1000);
  const out = { ok: true, days, checked: 0, applied: [], parked: [], errors: [] };

  const replay = async (type, obj, label) => {
    out.checked++;
    try {
      const r = await applyEvent(type, obj);
      if (r && r.ok) out.applied.push({ type, id: obj.id, label, action: r.action,
                                        subscriber: r.subscriberId, via: r.attributed_via || null });
      else out.parked.push({ type, id: obj.id, label, reason: (r && r.reason) || 'not applied' });
    } catch (e) {
      out.errors.push({ type, id: obj.id, error: e.message });
    }
  };

  // Paid invoices are the money. These create the invoice rows the register
  // reads and are the ONLY thing that can qualify a referral commission.
  try {
    const invs = await c.invoices.list({ limit, created: { gte: since }, status: 'paid' });
    for (const inv of invs.data) await replay('invoice.paid', inv, `$${(inv.amount_paid / 100).toFixed(2)}`);
  } catch (e) { out.errors.push({ stage: 'invoices', error: e.message }); }

  // Completed checkouts are the ACTIVATION. Somebody charged but left pending
  // has paid for an account they cannot use.
  try {
    const sessions = await c.checkout.sessions.list({ limit, created: { gte: since } });
    for (const cs of sessions.data) {
      if (cs.payment_status !== 'paid') continue;
      await replay('checkout.session.completed', cs, cs.customer_details && cs.customer_details.email);
    }
  } catch (e) { out.errors.push({ stage: 'sessions', error: e.message }); }

  out.note = out.applied.length
    ? 'Replayed through the same handler the webhook uses. Safe to run again — it is idempotent.'
    : 'Nothing to apply: everything Stripe knows about is already recorded.';
  return out;
}

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
/**
 * WHO IS THIS EVENT ABOUT?
 *
 * STRIPE MOVED THE FIELD. On current API versions an Invoice no longer carries
 * `subscription` or the subscription's metadata at the top level — both now sit
 * under `parent.subscription_details`. A real test payment proved the damage:
 * `checkout.session.completed` resolved fine and the account went active, while
 * `invoice.paid` resolved to nothing and was parked. Consequences, all silent:
 * no invoice row, so the billing register reads $0.00 for a customer who paid;
 * and `qualifyFromInvoice` never runs, so NO REFERRAL COMMISSION IS EVER
 * CREATED — the whole profit-sharing programme would have paid out nothing
 * while looking perfectly healthy.
 *
 * The stored Stripe ids are the last resort, and they are not a guess: they
 * were written onto the subscriber row by the checkout event itself, so they
 * are an authoritative link rather than an inference.
 */
async function resolveSubscriberId(obj) {
  const fromMeta = parseInt(
    (obj.metadata && obj.metadata.subscriber_id) ||
    (obj.subscription_details && obj.subscription_details.metadata
      && obj.subscription_details.metadata.subscriber_id) ||
    // Current API version: Invoice.parent.subscription_details.
    (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.metadata
      && obj.parent.subscription_details.metadata.subscriber_id) ||
    '', 10
  );
  if (Number.isInteger(fromMeta)) return { id: fromMeta, via: 'metadata' };

  const subId = obj.subscription
    || (obj.parent && obj.parent.subscription_details && obj.parent.subscription_details.subscription)
    || null;
  if (subId) {
    const row = await models.subscribers.findOne({ where: { stripe_subscription_id: subId } });
    if (row) return { id: row.id, via: 'stripe_subscription_id' };
  }
  if (obj.customer) {
    const row = await models.subscribers.findOne({ where: { stripe_customer_id: obj.customer } });
    if (row) return { id: row.id, via: 'stripe_customer_id' };
  }
  return { id: null, via: null };
}

async function applyEvent(type, obj, opts = {}) {
  const resolved = await resolveSubscriberId(obj);
  const subscriberId = resolved.id;

  if (!Number.isInteger(subscriberId)) {
    return { ok: false, parked: true,
             reason: 'could not attribute this event to a subscriber — parked rather than guessed', type };
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

    case 'invoice.paid': {
      // IDEMPOTENT. Stripe retries a webhook until it gets a 2xx, and it also
      // fires invoice.paid alongside invoice_payment.paid and
      // invoice.payment_succeeded. Creating a row per delivery would inflate
      // the revenue figures on the billing register for a single payment.
      const already = await models.invoices.findOne({ where: { stripe_invoice_id: obj.id } });
      const inv = already || await models.invoices.create({
        tenant_id: subscriberId, stripe_invoice_id: obj.id,
        amount_cents: obj.amount_paid, status: 'paid', dunning_stage: 0, paid_at: new Date(),
      });
      if (already) {
        return { ok: true, action: 'invoice_already_recorded', subscriberId,
                 attributed_via: resolved.via };
      }
      // THE ONLY PLACE A REFERRAL COMMISSION IS EVER CREATED. It reads this
      // invoice row, so the figure traces to money that actually arrived
      // rather than to a signup or to the list price. Non-fatal on purpose: a
      // referral bug must never make a real payment look unrecorded.
      let referral = null;
      try {
        referral = await require('./referrals').qualifyFromInvoice(inv);
      } catch (e) { console.warn('[billing] referral qualify failed:', e.message); }
      return { ok: true, action: 'invoice_recorded', subscriberId,
               attributed_via: resolved.via, amount_cents: obj.amount_paid, referral };
    }

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
      // Quote what THIS subscriber is actually charged, not today's list price.
      // Stripe keeps an existing subscription on the price it was created with,
      // so after a price change the list figure is simply wrong for everyone who
      // signed up before it — a renewal notice saying $25 ahead of a $97 charge
      // is the kind of number this codebase refuses to print. Falls back to the
      // list price only for a subscriber with no invoice on file yet.
      const paid = await models.invoices.findAll({ where: { tenant_id: s.id, status: 'paid' } });
      const last = paid.sort((a, b) => new Date(b.paid_at || 0) - new Date(a.paid_at || 0))[0];
      due.push({
        subscriber_id: s.id, email: s.email, days_out: days,
        amount_usd: last && last.amount_cents ? last.amount_cents / 100 : PRICE_USD,
        amount_source: last && last.amount_cents ? 'last_invoice' : 'list_price',
      });
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
  // Test-vs-live and WHICH account, so the webhook route cannot verify a
  // test-mode signature against the estate-wide live secret.
  secretKey, webhookSecret, mode, isTestMode, isolated, keyShape, probe,
  noteWebhook, webhookHealth,
  TEST_ACTIVATION, NON_REVENUE_ACTIVATIONS, isNonRevenue, activationStamp,
  freeReason,
  disabled,
  freeActivation,
  enabled, status, createCheckout, verifyCheckoutSession, createPortal, applyEvent, reconcile,
  renewalNoticesDue, refundEligible,
  PRICE_USD, REFUND_DAYS, RENEWAL_NOTICE_DAYS, DUNNING_STAGES,
};
