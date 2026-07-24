'use strict';

/**
 * Lawn Co-Pilot — PLATFORM billing (Digit2AI charges the landscaper)
 *
 * This is Digit2AI's own Stripe account (STRIPE_SECRET_KEY) charging companies
 * their monthly plan — NOT Stripe Connect. Connect (in accounting.js) is the
 * landscaper charging homeowners; that money is theirs. This money is ours.
 *
 * Every subscription starts with a free trial (LAWNCOPILOT_TRIAL_DAYS, default
 * 7). Prices come from the single source in provision.js, so a Checkout line
 * item can never disagree with the pricing page.
 *
 * With no STRIPE_SECRET_KEY the whole module degrades honestly: checkout returns
 * a "not configured" result and the tenant simply stays on its local trial.
 */

const acct = require('./accounting');
const { PlatformSubscription, Tenant } = require('../models');
const { PLAN_LIMITS, normalizePlan } = require('./provision');

const TRIAL_DAYS = () => Number(process.env.LAWNCOPILOT_TRIAL_DAYS || 7);
const enabled = () => acct.stripeEnabled();

function baseUrl() {
  return (process.env.LAWNCOPILOT_BASE_DOMAIN || 'https://lawncopilot.com').replace(/\/+$/, '');
}

/**
 * Reuse or create the tenant's Stripe customer on the platform account. The id
 * lives in tenant.settings so no schema change is needed and it never collides
 * with stripe_account_id (which is the Connect account).
 */
async function ensureCustomer(s, tenant) {
  const existing = tenant.settings && tenant.settings.stripe_customer_id;
  if (existing) return existing;
  const cust = await s.customers.create({
    email: tenant.email || undefined,
    name: tenant.name,
    metadata: { tenant_id: String(tenant.id), slug: tenant.slug }
  });
  tenant.settings = { ...(tenant.settings || {}), stripe_customer_id: cust.id };
  await tenant.save();
  return cust.id;
}

/**
 * A Stripe Checkout session for the plan, with the free trial. Returns the URL
 * the owner is sent to. Metadata carries tenant_id + plan so the webhook can
 * attribute the subscription with no guessing.
 */
async function createCheckout(tenant, planId, { successUrl, cancelUrl } = {}) {
  const s = acct.stripe();
  if (!s) return { success: false, error: 'billing_not_configured', message: 'Stripe is not configured. Set STRIPE_SECRET_KEY to enable paid subscriptions.' };

  const plan = normalizePlan(planId || tenant.plan);
  const p = PLAN_LIMITS[plan];
  if (!p || !p.price_cents) return { success: false, error: 'unknown_plan' };

  const customer = await ensureCustomer(s, tenant);
  const root = baseUrl();
  const success = successUrl || `${root}/lawncopilot/${tenant.slug}/admin?subscribed=1`;
  const cancel = cancelUrl || `${root}/lawncopilot/${tenant.slug}/admin?billing=cancelled`;

  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `Lawn Co-Pilot — ${p.label}`, description: p.tagline },
        unit_amount: p.price_cents,
        recurring: { interval: 'month' }
      },
      quantity: 1
    }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS(),
      metadata: { tenant_id: String(tenant.id), plan }
    },
    metadata: { tenant_id: String(tenant.id), plan },
    allow_promotion_codes: true,
    success_url: success,
    cancel_url: cancel
  });
  return { success: true, url: session.url, id: session.id, trial_days: TRIAL_DAYS() };
}

/** The Stripe billing portal, so the owner manages card / cancels themselves. */
async function createPortal(tenant, returnUrl) {
  const s = acct.stripe();
  if (!s) return { success: false, error: 'billing_not_configured' };
  const customer = tenant.settings && tenant.settings.stripe_customer_id;
  if (!customer) return { success: false, error: 'no_customer', message: 'Start a subscription first.' };
  const ps = await s.billingPortal.sessions.create({
    customer,
    return_url: returnUrl || `${baseUrl()}/lawncopilot/${tenant.slug}/admin`
  });
  return { success: true, url: ps.url };
}

// Stripe status → our local subscription status.
const STATUS_MAP = {
  trialing: 'trialing', active: 'active', past_due: 'past_due',
  canceled: 'cancelled', unpaid: 'past_due', incomplete: 'trialing',
  incomplete_expired: 'cancelled', paused: 'paused'
};

/**
 * Apply a Stripe subscription event to our records. Called from the webhook.
 * `obj` is a Stripe subscription (or a checkout.session with .subscription).
 */
async function applySubscriptionEvent(tenant_id, obj, type) {
  const s = acct.stripe();
  let sub = null;

  if (type && type.startsWith('customer.subscription')) {
    sub = obj;
  } else if (type === 'checkout.session.completed' && obj.subscription && s) {
    try { sub = await s.subscriptions.retrieve(obj.subscription); } catch (e) { sub = null; }
  }

  const stripeStatus = sub ? sub.status : 'active';
  const local = STATUS_MAP[stripeStatus] || 'active';
  const plan = sub && sub.metadata && sub.metadata.plan ? normalizePlan(sub.metadata.plan) : null;

  const patch = { status: local };
  if (sub) {
    patch.stripe_subscription_id = sub.id;
    if (sub.current_period_end) patch.current_period_end = new Date(sub.current_period_end * 1000);
  }
  if (plan) { patch.plan = plan; patch.price_cents = (PLAN_LIMITS[plan] || {}).price_cents || 0; }

  await PlatformSubscription.update(patch, { where: { tenant_id } });

  // A live or trialing subscription keeps the company active; a hard cancel
  // suspends the public page rather than deleting anything.
  const tenantStatus = (local === 'cancelled') ? 'suspended'
    : (local === 'trialing' ? 'trialing' : 'active');
  await Tenant.update({ status: tenantStatus }, { where: { id: tenant_id } });
  if (plan) await Tenant.update({ plan }, { where: { id: tenant_id } });

  return { tenant_id, status: local, plan };
}

async function status(tenant) {
  const sub = await PlatformSubscription.findOne({ where: { tenant_id: tenant.id }, raw: true });
  return {
    success: true,
    billing_enabled: enabled(),
    plan: (sub && sub.plan) || tenant.plan,
    status: (sub && sub.status) || tenant.status,
    current_period_end: sub ? sub.current_period_end : null,
    has_stripe_subscription: !!(sub && sub.stripe_subscription_id),
    trial_days: TRIAL_DAYS()
  };
}

module.exports = { enabled, createCheckout, createPortal, applySubscriptionEvent, status, TRIAL_DAYS };
