'use strict';

/**
 * APPLYING A PAYMENT MUST NOT DEPEND ON SOMEBODY OPENING A TAB.
 *
 * The webhook was the only path to a client's money, and when it did not
 * deliver the $20 sat in Stripe while the account read "Activate — $20.00"
 * (live failure 2026-09-27, the owner's own account). `/confirm` closed that
 * for anyone who opens the Outbound tab; this closes it for everyone else.
 *
 * It is DELIBERATELY NOT inside the dialer's tick, although the dialer already
 * holds an advisory lock and the stale-reserve sweep piggybacks there. Dialling
 * is gated on `LITE_OUTBOUND_DIALER`, and a client who has paid but has no
 * workflow yet is exactly the client whose dialer is off — coupling the two
 * would mean turning dialling off stops applying payments.
 *
 * ONE WRITER. It inserts the row if missing and then hands the session to
 * `billing.applyPayment`, the same function the webhook and `/confirm` use, so
 * whichever path arrives first wins and the rest are no-ops.
 */
const { sequelize, Tenant } = require('../models');
const billing = require('./outboundBilling');

const LOCK_ID = 918273646;            // one past the dialer's, deliberately its own

function days() {
  return parseInt(process.env.LITE_OUTBOUND_ADOPT_DAYS || '30', 10) || 30;
}

// THE SAME KEY THE CHECKOUT WAS CREATED WITH, in the same order of preference.
// Reading only STRIPE_SECRET_KEY would point this at a different account from
// the one that took the money the moment LITE_STRIPE_SECRET_KEY is set.
function stripeKey() {
  return process.env.LITE_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
}
function stripe() {
  const key = stripeKey();
  if (!key) return null;
  return require('stripe')(key);
}

const stats = { runs: 0, applied: 0, last_at: null, last_error: null };

/**
 * @param {object} opts
 * @param {number} [opts.tenantId] restrict to one tenant (the /confirm path)
 * @param {object} [opts.client]   injected Stripe client (tests)
 */
async function run({ tenantId = null, client = null, always = false } = {}) {
  const s = client || stripe();
  if (!s) return { ok: false, reason: 'payments_not_configured', applied: [] };

  // THE CHEAP QUESTION FIRST. With nothing outstanding this costs one indexed
  // count and NO Stripe call, so the unattended poller is free on a quiet
  // account.
  //
  // `always` EXISTS BECAUSE THIS GATE IS DRIVEN BY OUR OWN ROWS, and the one
  // case worth recovering hardest is the row being missing altogether — then
  // the gate returns nothing and the tenant is skipped, which is a narrower
  // guarantee than "recovers a payment our own row cannot see". So the
  // /confirm path, where a person is present and the work is bounded to one
  // tenant and rate limited, asks Stripe regardless. The poller does not, or a
  // quiet account would pay for a listing every few minutes for ever.
  const [pend] = always && tenantId ? [[{ tenant_id: tenantId }]] : await sequelize.query(
    `SELECT DISTINCT tenant_id FROM lite_outbound_payments
      WHERE status = 'open' AND stripe_session_id IS NOT NULL
        AND created_at > NOW() - (:d || ' days')::interval
        ${tenantId ? 'AND tenant_id = :t' : ''}
      ORDER BY tenant_id`,
    { replacements: { d: String(days()), t: tenantId } }
  );
  const ids = (pend || []).map((r) => Number(r.tenant_id)).filter(Number.isInteger);
  if (!ids.length) return { ok: true, tenants: 0, applied: [] };

  // ONE listing serves every tenant: it is account-wide, and the tenant is
  // carried in metadata we wrote ourselves.
  const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * days();
  let list = null;
  try {
    list = await s.checkout.sessions.list({ limit: 100, created: { gte: since } });
  } catch (e) {
    stats.last_error = String(e.message || e).slice(0, 200);
    return { ok: false, reason: 'stripe_unreachable', applied: [] };
  }

  const applied = [];
  for (const id of ids) {
    let t = null;
    try { t = await Tenant.findByPk(id); } catch (_) { /* fall through */ }
    if (!t) continue;                            // a tenant that is gone is not paid
    for (const cand of billing.recoverable(list.data, id, new Set())) {
      try {
        await sequelize.query(
          `INSERT INTO lite_outbound_payments (tenant_id, kind, amount_cents, stripe_session_id)
           VALUES (:t, :k, :a, :s) ON CONFLICT DO NOTHING`,
          { replacements: { t: id, k: cand.kind, a: cand.amount_cents, s: cand.session.id } });
        const out = await billing.applyPayment(t, cand.session, {});
        if (out.applied) { applied.push({ tenant: id, ...out }); stats.applied++; }
      } catch (e) {
        // One tenant's failure must never stop another's payment being applied.
        console.warn('[lite:paysweep] tenant', id, 'failed:', e.message);
      }
    }
  }
  return { ok: true, tenants: ids.length, applied };
}

let timer = null;

function start() {
  const flag = String(process.env.LITE_PAYMENT_SWEEP || '').toLowerCase();
  if (flag === 'off') { console.log('[lite:paysweep] off by env'); return null; }
  if (flag !== 'on' && process.env.NODE_ENV !== 'production') return null;
  if (!stripeKey()) {
    console.log('[lite:paysweep] no Stripe key — not started');
    return null;
  }
  const everySec = Math.max(60, parseInt(process.env.LITE_PAYMENT_SWEEP_SEC || '180', 10) || 180);

  const tick = async () => {
    // ONE INSTANCE SWEEPS. Two passes could both insert the missing row; the
    // unique index would refuse the second, but the lock keeps it to one
    // Stripe listing per tick rather than one per instance.
    let held = false;
    try {
      const [lk] = await sequelize.query(
        'SELECT pg_try_advisory_lock(:id) AS ok', { replacements: { id: LOCK_ID } });
      held = !!(lk && lk[0] && (lk[0].ok === true || lk[0].ok === 't'));
      if (!held) return;
      stats.runs++; stats.last_at = new Date().toISOString();
      const r = await run({});
      if (r.applied && r.applied.length) {
        console.log(`[lite:paysweep] applied ${r.applied.length} unconfirmed payment(s)`);
      }
    } catch (e) {
      stats.last_error = String(e.message || e).slice(0, 200);
      console.warn('[lite:paysweep] tick failed:', e.message);
    } finally {
      if (held) {
        await sequelize.query('SELECT pg_advisory_unlock(:id)', { replacements: { id: LOCK_ID } })
          .catch(() => {});
      }
    }
  };

  timer = setInterval(tick, everySec * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 20000).unref?.();
  console.log(`[lite:paysweep] on, every ${everySec}s`);
  return timer;
}

module.exports = { run, start, stats, LOCK_ID };
