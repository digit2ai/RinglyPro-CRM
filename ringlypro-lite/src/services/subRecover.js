'use strict';

/**
 * THE SUBSCRIPTION HAS THE SAME HOLE THE OUTBOUND WALLET HAD, AND BILLING BEING
 * OFF IS THE ONLY REASON IT HAS NOT BITTEN YET.
 *
 * With `LITE_BILLING_ENABLED` on, `entitlement.canProvisionNumber` refuses a
 * number until `tenant.stripe_subscription_id` is set. Exactly two things ever
 * wrote it: the Stripe webhook, and `POST /api/billing/confirm` — which runs
 * only if the browser comes BACK from Stripe carrying `?paid=1&sid=`. So a
 * client who paid and closed the tab, on a service whose webhook delivery has
 * never been proven, is left with a card charged, no number, and nothing that
 * will ever retry. That is the failure that cost an evening on the outbound
 * add-on, and the fix is the same one: ask Stripe, from a path that does not
 * depend on anybody opening a tab.
 *
 * ONE WRITER. `apply()` is the only function here that touches a tenant row,
 * and both the return-from-Stripe confirm and the sweep call it — two copies
 * drift the moment one learns something the other does not, and which one ran
 * would depend on whether a redirect happened to land.
 */
const { Tenant } = require('../models');

/**
 * WHICH SESSIONS COUNT. Decided here rather than in the route, because this is
 * a money rule and a route is not something the suite can drive.
 *
 *  - the tenant comes from `metadata.tenant_id`, which WE wrote at create time,
 *    and must equal the caller's own: ONE Stripe account serves every tenant,
 *    so an account-wide listing returns everyone's sessions;
 *  - `mode` must be `subscription` — a one-time top-up is not a subscription
 *    and must never grant the card gate;
 *  - there must be a `subscription` id on it. An ABANDONED checkout is `open`
 *    with no subscription, and treating that as a card on file would hand a
 *    number to somebody who never entered one.
 *
 * `payment_status` is deliberately NOT required: a trialing subscription
 * completes as `no_payment_required`, which is a real card on file and is the
 * ordinary case for this plan.
 */
function recoverable(sessions, tenantId) {
  const out = [];
  for (const s of (sessions || [])) {
    if (!s || s.mode !== 'subscription') continue;
    const md = s.metadata || {};
    if (String(md.tenant_id || '') !== String(tenantId)) continue;
    if (!s.subscription) continue;
    out.push(s);
  }
  return out;
}

/**
 * The one writer. Idempotent: a tenant that already carries this subscription
 * is reported as `already` and nothing is written, so the sweep and the
 * redirect racing each other is a no-op rather than a double save.
 */
async function apply(tenant, session) {
  const subId = typeof session.subscription === 'string'
    ? session.subscription : (session.subscription && session.subscription.id);
  if (!subId) return { applied: false, reason: 'no_subscription_on_session' };
  if (tenant.stripe_subscription_id === subId) return { applied: false, reason: 'already' };

  const patch = { stripe_subscription_id: subId, suspended_at: null };
  if (session.customer) patch.stripe_customer_id = session.customer;
  // 'trialing' is the honest state for a session that completed on this plan:
  // the webhook refines it to active/past_due/canceled when Stripe says so. It
  // is never written as 'active' here — that is a claim only Stripe can make.
  if (tenant.subscription_status !== 'active') patch.subscription_status = 'trialing';
  await tenant.update(patch);
  return { applied: true, subscription: subId };
}

/**
 * Ask Stripe what it holds, and apply it.
 * @param {object} opts
 * @param {number} [opts.tenantId] restrict to one tenant (the redirect path)
 * @param {object} [opts.client]   injected Stripe client (tests)
 * @param {Array}  [opts.sessions] a listing already fetched this tick (the
 *   sweep passes its own, so one tick costs ONE account-wide listing rather
 *   than two)
 */
async function run({ tenantId = null, client = null, sessions = null } = {}) {
  let data = sessions;
  if (!data) {
    // THE SAME KEY THE CHECKOUT WAS CREATED WITH, in the same order. Reading
    // only STRIPE_SECRET_KEY would point this at a different account from the
    // one holding the subscription the moment LITE_STRIPE_SECRET_KEY is set.
    const key = process.env.LITE_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
    if (!client && !key) return { ok: false, reason: 'payments_not_configured', applied: [] };
    const s = client || require('stripe')(key);
    const days = parseInt(process.env.LITE_OUTBOUND_ADOPT_DAYS || '30', 10) || 30;
    const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * days;
    try {
      const list = await s.checkout.sessions.list({ limit: 100, created: { gte: since } });
      data = list.data || [];
    } catch (e) {
      // Stripe being unreachable is reported as itself, never as "nothing to
      // apply" — the two look identical from outside and only one is safe.
      return { ok: false, reason: 'stripe_unreachable', detail: String(e.message || e).slice(0, 160), applied: [] };
    }
  }

  const byTenant = new Map();
  for (const sess of data) {
    const tid = Number((sess && sess.metadata && sess.metadata.tenant_id) || NaN);
    if (!Number.isInteger(tid)) continue;
    if (tenantId && tid !== Number(tenantId)) continue;
    if (!recoverable([sess], tid).length) continue;
    if (!byTenant.has(tid)) byTenant.set(tid, []);
    byTenant.get(tid).push(sess);
  }

  const applied = [];
  for (const [id, list] of byTenant) {
    let t = null;
    try { t = await Tenant.findByPk(id); } catch (_) { t = null; }
    if (!t) continue;                       // the row outlives the account; gone is not paid
    if (t.stripe_subscription_id) continue; // already carries one; never re-point it
    for (const sess of list) {
      try {
        // One tenant's failure must never stop the next tenant's being applied.
        const r = await apply(t, sess);
        if (r.applied) { applied.push({ tenant: id, ...r }); break; }
      } catch (e) {
        console.warn('[lite:subrecover] tenant', id, 'failed:', e.message);
      }
    }
  }
  return { ok: true, tenants: byTenant.size, applied };
}

module.exports = { recoverable, apply, run };
