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

const LOCK_ID = 918273646;
// The states a client can be in while still owing, or having just paid, the
// setup fee. Anything else means the setup already took effect.
const PAYABLE = ['off', 'awaiting_setup_payment', 'failed_setup'];            // one past the dialer's, deliberately its own

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

// Per-tenant floor between listings, so the plan endpoint can ask on every
// visit without paying for a Stripe call each time.
const lastAsk = new Map();
function recentlyAsked(tenantId, everyMs) {
  const at = lastAsk.get(tenantId) || 0;
  if (Date.now() - at < everyMs) return true;
  lastAsk.set(tenantId, Date.now());
  return false;
}

const stats = { runs: 0, applied: 0, repaired: 0, last_at: null, last_error: null };

/**
 * @param {object} opts
 * @param {number} [opts.tenantId] restrict to one tenant (the /confirm path)
 * @param {object} [opts.client]   injected Stripe client (tests)
 */
async function run({ tenantId = null, client = null } = {}) {
  const s = client || stripe();
  if (!s) return { ok: false, reason: 'payments_not_configured', applied: [] };

  // STRIPE DRIVES THIS, NOT OUR OWN ROWS.
  //
  // The first version asked "which tenants have an open payment row?" and only
  // then looked. That is cheap and it was WRONG, because the case worth
  // recovering hardest is the row never having been written: the reuse branch
  // of /activate returned an existing checkout URL and inserted nothing, so a
  // client could pay against a session we had no record of. Our rows cannot
  // report a payment they do not know about — only the payment processor can.
  //
  // It costs ONE account-wide listing per tick, which is nothing, and the
  // tenant travels in metadata we wrote ourselves at create time.
  const since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * days();
  let list = null;
  try {
    list = await s.checkout.sessions.list({ limit: 100, created: { gte: since } });
  } catch (e) {
    stats.last_error = String(e.message || e).slice(0, 200);
    return { ok: false, reason: 'stripe_unreachable', applied: [] };
  }

  // Everything paid, ours, and belonging to a tenant — grouped by tenant.
  const byTenant = new Map();
  for (const sess of (list.data || [])) {
    const md = (sess && sess.metadata) || {};
    const tid = Number(md.tenant_id);
    if (!Number.isInteger(tid)) continue;
    if (tenantId && tid !== Number(tenantId)) continue;
    if (!billing.recoverable([sess], tid, new Set()).length) continue;
    if (!byTenant.has(tid)) byTenant.set(tid, []);
    byTenant.get(tid).push(sess);
  }
  // WHAT THE LISTING ACTUALLY HELD. Counts only — no session id, no email, no
  // amount — so this can be reported to the signed-in tenant and put in a
  // screenshot. Without it "nothing was applied" cannot be told apart from
  // "nothing was found", "found but not yours" and "Stripe was empty".
  const seen = {
    scanned: (list.data || []).length,
    ours: (list.data || []).filter((x) => String(((x && x.metadata) || {}).kind || '')
      .startsWith('lite_outbound')).length,
    ours_paid: (list.data || []).filter((x) => String(((x && x.metadata) || {}).kind || '')
      .startsWith('lite_outbound') && x.payment_status === 'paid').length,
    tenants_in_metadata: [...new Set((list.data || [])
      .map((x) => Number(((x && x.metadata) || {}).tenant_id))
      .filter(Number.isInteger))],
  };
  if (!byTenant.size) return { ok: true, tenants: 0, applied: [], seen };

  const applied = [];
  const why = [];
  for (const [id, sessions] of byTenant) {
    let t = null;
    try { t = await Tenant.findByPk(id); } catch (_) { /* fall through */ }
    if (!t) { why.push({ tenant_lookup: 'failed' }); continue; }  // gone is not paid
    for (const sess of sessions) {
      const cand = billing.recoverable([sess], id, new Set())[0];
      if (!cand) continue;
      try {
        // The unique index on stripe_session_id is what makes this safe to race.
        await sequelize.query(
          `INSERT INTO lite_outbound_payments (tenant_id, kind, amount_cents, stripe_session_id)
           VALUES (:t, :k, :a, :s) ON CONFLICT DO NOTHING`,
          { replacements: { t: id, k: cand.kind, a: cand.amount_cents, s: cand.session.id } });
        const out = await billing.applyPayment(t, cand.session, {});
        // WHY A CANDIDATE WAS NOT APPLIED. Four rounds of this were spent
        // inferring the branch from the outside; the branch says so now.
        // Flags and enum values only — no session id, no amount.
        why.push({ kind: cand.kind, reason: out.reason || (out.applied ? 'applied' : 'unknown'),
          state: t.outbound_state || 'off', paid_at: !!t.outbound_setup_paid_at });
        if (out.applied) { applied.push({ tenant: id, ...out }); stats.applied++; continue; }

        // MONEY TAKEN, TENANT NOT ACTIVATED — REPAIRED ON THE EVIDENCE, NOT ON
        // A REASON STRING. The first version only repaired when applyPayment
        // said `already_applied` and the tenant carried no setup timestamp.
        // Both are guesses about HOW it failed, and on a real account neither
        // matched: the payment was seen on every run and refused on every run,
        // for four deploys, while the owner looked at "Activate — $20.00".
        //
        // The evidence that matters is simpler and is not a guess: Stripe says
        // a setup fee for THIS tenant is paid, and this tenant is still in a
        // state where the setup has not taken effect. That is stranded money
        // whatever the internal bookkeeping says.
        //
        // The escape hatch is explicit rather than inferred: an operator who
        // deliberately puts a client back writes `outbound_state_reason`, and
        // a stated reason is never overridden. Silence is not a decision.
        const fresh = await Tenant.findByPk(id);        // it may have just moved
        if (cand.kind === 'setup' && fresh
            && PAYABLE.includes(fresh.outbound_state || 'off')
            && !fresh.outbound_state_reason) {
          const r = await billing.applyStrandedSetup(fresh, cand.session);
          if (r.applied) { applied.push({ tenant: id, ...r }); stats.repaired++; }
          else why.push({ repair: 'refused', reason: r.reason || 'unknown' });
        }
      } catch (e) {
        // One tenant's failure must never stop another's payment being applied.
        why.push({ error: String(e.message || e).slice(0, 90) });
        console.warn('[lite:paysweep] tenant', id, 'failed:', e.message);
      }
    }
  }
  return { ok: true, tenants: byTenant.size, applied, seen: { ...seen, why } };
}

let timer = null;

function start() {
  // DEFAULT ON WHEREVER THERE IS A STRIPE KEY. The other pollers are gated on
  // NODE_ENV === 'production' because they place calls and cost money; this one
  // RECOVERS money a client has already paid, and gating it on an environment
  // variable nobody set is how the owner's own $20 sat unapplied while three
  // separate fixes shipped. `LITE_PAYMENT_SWEEP=off` still stops it.
  const flag = String(process.env.LITE_PAYMENT_SWEEP || '').toLowerCase();
  if (flag === 'off') { console.log('[lite:paysweep] off by env'); return null; }
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

module.exports = { run, start, stats, LOCK_ID, recentlyAsked, PAYABLE };
