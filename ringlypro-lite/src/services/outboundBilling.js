'use strict';

/**
 * OUTBOUND BILLING — the wallet, and the state of the paid add-on.
 *
 * WHY A WALLET AND NOT A PER-LIST CHARGE.
 * The cost of an outbound call is NOT known when it is placed. HighLevel bills
 * the owner per MINUTE and reports the duration minutes later in its call log.
 * Quoting a list up front therefore means guessing an average call length and
 * being wrong in one direction or the other on every single call.
 *
 * So: the client funds a balance, a generous amount is RESERVED when a call is
 * placed, and the reserve is SETTLED against the real duration when the log
 * arrives. The client pays exactly the owner's cost x the markup, and the same
 * settlement row is what their call report reads — the figure shown is the
 * figure that moved the money, never a recomputation.
 *
 * THE RESERVE IS WHY THE BALANCE CANNOT GO NEGATIVE. Two dials racing against
 * the last dollar both try to move it out of `balance_cents` in one atomic
 * UPDATE; exactly one wins. A charge-after-the-fact model has no such moment
 * and would let both calls happen.
 */
const { sequelize } = require('../models');

/* ── PRICING — computed from env, never hardcoded anywhere else ──────────── */

function num(name, dflt) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
}

/** What HighLevel charges the owner, per minute of connected call. */
function costPerMinUsd() { return num('LITE_OUTBOUND_COST_PER_MIN_USD', 0.13); }
/** What the client pays on top. Owner's instruction: cost x 2. */
function markup() { return Math.max(1, num('LITE_OUTBOUND_MARKUP', 2)); }
/** What the client pays per minute, in cents. Every surface reads THIS. */
function pricePerMinCents() { return Math.ceil(costPerMinUsd() * markup() * 100); }
function setupFeeCents() { return Math.round(num('LITE_OUTBOUND_SETUP_FEE_USD', 20) * 100); }
function slaHours() { return Math.max(1, num('LITE_OUTBOUND_SLA_HOURS', 24)); }
function minTopupCents() { return Math.round(num('LITE_OUTBOUND_MIN_TOPUP_USD', 20) * 100); }
/**
 * Minutes held per in-flight call. Deliberately generous: the unused part
 * comes straight back on settlement, and a reserve too small means a long call
 * costs the owner the difference.
 */
function reserveMin() { return Math.max(1, Math.round(num('LITE_OUTBOUND_RESERVE_MIN', 5))); }
function reserveCents() { return pricePerMinCents() * reserveMin(); }
/**
 * A floor charged even on a zero-duration call. Default 0 — an unanswered
 * attempt costs the client nothing, because it is NOT VERIFIED whether
 * HighLevel bills the owner for one. When the report shows the real ratio the
 * owner can set this from evidence rather than from a guess.
 */
function minChargeMin() { return num('LITE_OUTBOUND_MIN_CHARGE_MIN', 0); }

/** Everything a surface needs to describe the price, in one object. */
function pricing() {
  return {
    price_per_min_cents: pricePerMinCents(),
    price_per_min_usd: pricePerMinCents() / 100,
    setup_fee_cents: setupFeeCents(),
    min_topup_cents: minTopupCents(),
    reserve_cents: reserveCents(),
    reserve_min: reserveMin(),
    sla_hours: slaHours(),
    rounding: 'per minute, rounded up',
    // Restated on every surface that quotes a price. The client is told this
    // before they pay, not discovered in a statement afterwards.
    note: 'Charged per minute of connected call, rounded up to the next minute.',
  };
}

/** Cost of a call of this length, in cents. Rounded UP to the whole minute. */
function chargeForSeconds(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const mins = Math.max(minChargeMin(), s > 0 ? Math.ceil(s / 60) : 0);
  return Math.round(mins * pricePerMinCents());
}

/* ── THE STATE MACHINE ───────────────────────────────────────────────────── */

const STATES = ['off', 'awaiting_setup_payment', 'pending_setup', 'active', 'suspended', 'failed_setup'];

/**
 * Every transition is a compare-and-swap on the CURRENT state, and it reports
 * whether the row actually moved. A read-then-write lets two Stripe webhook
 * retries both "activate" — and activating twice sends the client two emails
 * and tells the owner to do the work again.
 */
async function transition(tenantId, from, to, extra = {}) {
  if (!STATES.includes(to)) throw new Error('bad_state:' + to);
  const froms = Array.isArray(from) ? from : [from];
  const sets = ['outbound_state = :to'];
  const rep = { t: tenantId, to, froms };
  // The ONE place in this module where a caller-supplied key could reach the
  // SQL string. Every current caller passes literals, so it is not
  // exploitable — and it is one careless `transition(id, a, b, req.body)`
  // away from being an injection, so the columns are an allow-list.
  const WRITABLE = ['outbound_setup_paid_at', 'outbound_setup_due_at',
    'outbound_activated_at', 'outbound_state_reason'];
  for (const [k, v] of Object.entries(extra)) {
    if (!WRITABLE.includes(k)) throw new Error('transition: column not writable: ' + k);
    sets.push(`${k} = :${k}`); rep[k] = v;
  }
  const [rows] = await sequelize.query(
    `UPDATE lite_tenants SET ${sets.join(', ')}
      WHERE id = :t AND outbound_state IN (:froms)
      RETURNING id, outbound_state`,
    { replacements: rep }
  );
  return { moved: !!(rows && rows.length), state: rows && rows[0] ? rows[0].outbound_state : null };
}

/* ── THE WALLET ──────────────────────────────────────────────────────────── */

async function ensureWallet(tenantId) {
  await sequelize.query(
    `INSERT INTO lite_outbound_credit (tenant_id) VALUES (:t) ON CONFLICT (tenant_id) DO NOTHING`,
    { replacements: { t: tenantId } }
  );
}

async function wallet(tenantId) {
  await ensureWallet(tenantId);
  const [rows] = await sequelize.query(
    `SELECT balance_cents, reserved_cents, lifetime_topup_cents, lifetime_spent_cents
       FROM lite_outbound_credit WHERE tenant_id = :t`,
    { replacements: { t: tenantId } }
  );
  const r = (rows && rows[0]) || {};
  const balance = Number(r.balance_cents) || 0;
  const unlimited = await isUnlimited(tenantId);
  return {
    balance_cents: balance,
    reserved_cents: Number(r.reserved_cents) || 0,
    lifetime_topup_cents: Number(r.lifetime_topup_cents) || 0,
    lifetime_spent_cents: Number(r.lifetime_spent_cents) || 0,
    // What the client actually wants to know, not what the columns hold.
    minutes_left: Math.floor(balance / Math.max(1, pricePerMinCents())),
    can_place_a_call: balance >= reserveCents() || unlimited,
    // Stated, so the founder's own screen never reads as a broken negative
    // balance — and so the spend stays visible, because unlimited means "no
    // prepayment", not "free".
    unlimited,
    spent_cents: Number(r.lifetime_spent_cents) || 0,
  };
}

async function credit(tenantId, cents) {
  const amt = Math.max(0, Math.round(Number(cents) || 0));
  if (!amt) return { ok: false, reason: 'zero' };
  await ensureWallet(tenantId);
  await sequelize.query(
    `UPDATE lite_outbound_credit
        SET balance_cents = balance_cents + :c,
            lifetime_topup_cents = lifetime_topup_cents + :c,
            low_balance_notified_at = NULL,
            updated_at = NOW()
      WHERE tenant_id = :t`,
    { replacements: { t: tenantId, c: amt } }
  );
  return { ok: true, credited_cents: amt };
}

/**
 * Hold the reserve. ATOMIC AND CONDITIONAL — the `balance_cents >= :hold`
 * predicate lives inside the UPDATE, so two concurrent dials against a
 * one-call balance produce exactly one winner. Returns false when there is
 * not enough; the caller must then NOT enroll.
 */
/**
 * THE FOUNDER'S OWN ACCOUNT DOES NOT PREPAY ITSELF.
 *
 * Billing the founder means routing their own money through Stripe and losing
 * roughly 3% on the way, to credit a wallet they already own. So the balance
 * check is waived — for exactly one tenant.
 *
 * IT WAIVES THE REFUSAL, NEVER THE ACCOUNTING. Every call still reserves and
 * still settles at the real rate, so the call report and the spend summary
 * stay true and the owner can see what HighLevel is actually costing them.
 * Unlimited means "no prepayment", not "free": those minutes are still billed
 * to the owner at roughly $0.13 each.
 *
 * RESOLVED FROM THE DATABASE, never from a request and never from a column a
 * client could set — it is the same owner-tenant lookup that gates
 * broadcasting to every customer. Every other tenant pays.
 */
async function isUnlimited(tenantId) {
  if (String(process.env.LITE_OUTBOUND_FOUNDER_UNLIMITED || '').toLowerCase() === 'off') return false;
  try { return await require('./notify').isOwner(tenantId); } catch (_) { return false; }
}

async function reserve(tenantId) {
  await ensureWallet(tenantId);
  const hold = reserveCents();
  const [rows] = await sequelize.query(
    `UPDATE lite_outbound_credit
        SET balance_cents = balance_cents - :hold,
            reserved_cents = reserved_cents + :hold,
            updated_at = NOW()
      WHERE tenant_id = :t AND balance_cents >= :hold
      RETURNING balance_cents`,
    { replacements: { t: tenantId, hold } }
  );
  if (!rows || !rows.length) {
    // The founder's own account is not made to prepay itself. The hold is
    // still recorded so settlement and the call report are unchanged; the
    // balance simply goes negative, and that negative IS the spend.
    if (await isUnlimited(tenantId)) {
      const [f] = await sequelize.query(
        `UPDATE lite_outbound_credit
            SET balance_cents = balance_cents - :hold,
                reserved_cents = reserved_cents + :hold,
                updated_at = NOW()
          WHERE tenant_id = :t
          RETURNING balance_cents`,
        { replacements: { t: tenantId, hold } }
      );
      if (f && f.length) {
        return { ok: true, reserved_cents: hold, unlimited: true,
          balance_cents: Number(f[0].balance_cents) || 0 };
      }
    }
    return { ok: false, reason: 'insufficient_credit', needed_cents: hold };
  }
  return { ok: true, reserved_cents: hold, balance_cents: Number(rows[0].balance_cents) || 0 };
}

/** Give a reserve back in full — the enrollment failed, so nothing happened. */
async function release(tenantId, cents) {
  const amt = Math.max(0, Math.round(Number(cents) || 0));
  if (!amt) return { ok: true, released_cents: 0 };
  await sequelize.query(
    `UPDATE lite_outbound_credit
        SET balance_cents = balance_cents + :c,
            reserved_cents = GREATEST(0, reserved_cents - :c),
            updated_at = NOW()
      WHERE tenant_id = :t`,
    { replacements: { t: tenantId, c: amt } }
  );
  return { ok: true, released_cents: amt };
}

/**
 * Settle one call against its real duration.
 *
 * IDEMPOTENT ON THE CALL ROW, not on the caller's good intentions: the UPDATE
 * carries `settled_at IS NULL`, so a re-poll of the same HighLevel call log
 * settles once. The poller runs every two minutes over a three-hour window,
 * so the same log WILL be seen again.
 *
 * The charge is capped at the reserve. A call longer than the reserve is the
 * owner absorbing the difference — which is a pricing decision, not a reason
 * to take money the client never agreed to hold.
 */
async function settle(tenantId, callId, { durationSec, outcome, summary, ghlCallId } = {}) {
  const [rows] = await sequelize.query(
    `SELECT id, reserved_cents FROM lite_outbound_calls
      WHERE id = :id AND tenant_id = :t AND settled_at IS NULL`,
    { replacements: { id: callId, t: tenantId } }
  );
  if (!rows || !rows.length) return { settled: false, reason: 'already_settled_or_missing' };

  const held = Number(rows[0].reserved_cents) || 0;
  const charge = chargeForSeconds(durationSec);
  const giveBack = Math.max(0, held - charge);
  // THE CHARGE IS NOT CAPPED AT THE RESERVE, and the first version was.
  //
  // Capping made a long call nearly free: the reserve is 5 minutes, so a
  // 60-minute call cost the client $1.30 while HighLevel billed the owner
  // $7.80 — and a client who dials a number they control and leaves it off
  // the hook turns that into an uncapped loss, repeatable on every top-up.
  //
  // The client agreed to pay per minute; the cost is already incurred by the
  // time we settle. So the full amount is charged and the balance is allowed
  // to go NEGATIVE here and only here. `reserve()` still refuses the next
  // call, so a negative balance stops the campaign rather than continuing it.
  const overrun = Math.max(0, charge - held);

  const [upd] = await sequelize.query(
    `UPDATE lite_outbound_calls
        SET settled_at = NOW(), charged_cents = :c, duration_sec = :d,
            outcome = COALESCE(:o, outcome), summary = COALESCE(:s, summary),
            ghl_call_id = COALESCE(:g, ghl_call_id)
      WHERE id = :id AND tenant_id = :t AND settled_at IS NULL
      RETURNING id`,
    { replacements: { id: callId, t: tenantId, c: charge, d: Math.max(0, Math.round(Number(durationSec) || 0)),
      o: outcome || null, s: summary ? String(summary).slice(0, 4000) : null, g: ghlCallId || null } }
  );
  if (!upd || !upd.length) return { settled: false, reason: 'raced' };

  await sequelize.query(
    `UPDATE lite_outbound_credit
        SET reserved_cents = GREATEST(0, reserved_cents - :held),
            balance_cents = balance_cents + :back - :over,
            lifetime_spent_cents = lifetime_spent_cents + :c,
            updated_at = NOW()
      WHERE tenant_id = :t`,
    { replacements: { t: tenantId, held, back: giveBack, over: overrun, c: charge } }
  );
  if (overrun > 0) {
    // Named, not swallowed: a call that outran its reserve is either a very
    // long conversation or somebody holding the line open, and the owner
    // should see the pattern rather than absorb it silently.
    console.warn(`[lite:outbound] call ${callId} tenant ${tenantId} overran its reserve by ${overrun}c`);
  }
  return { settled: true, charged_cents: charge, released_cents: giveBack, overrun_cents: overrun };
}

/**
 * A call whose log never arrived holds its reserve for ever. Release it, and
 * mark the row `no_log` — NOT `not_answered`. They are different facts and
 * only one of them is known; telling a client their call was not answered
 * when we simply never heard back is a fabrication.
 */
async function sweepStaleReserves({ olderThanMin } = {}) {
  // THE TTL MUST EXCEED THE MATCH WINDOW. At 60 against a 180-minute match
  // window, a log arriving at 90 minutes found the row already swept and
  // charged 0 — a call the owner paid HighLevel for, billed to nobody. The
  // floor is enforced here rather than trusted to two env values agreeing.
  const matchWin = num('LITE_OUTBOUND_MATCH_WINDOW_MIN', 180);
  const mins = Math.max(matchWin + 30, Math.round(Number(olderThanMin)
    || num('LITE_OUTBOUND_RESERVE_TTL_MIN', 240)));
  const [rows] = await sequelize.query(
    `UPDATE lite_outbound_calls
        SET settled_at = NOW(), charged_cents = 0, outcome = 'no_log'
      WHERE settled_at IS NULL
        AND enrolled_at < NOW() - (:mins || ' minutes')::interval
      RETURNING id, tenant_id, reserved_cents`,
    { replacements: { mins: String(mins) } }
  );
  let released = 0;
  for (const r of (rows || [])) {
    await release(r.tenant_id, Number(r.reserved_cents) || 0);
    released++;
  }
  return { swept: released };
}

/**
 * Match one HighLevel call log to an outbound call WE placed for THIS tenant,
 * and settle it.
 *
 * THE TENANT IS REQUIRED, AND THAT IS THE WHOLE POINT. The first version of
 * this matched on `ghl_contact_id` alone, reasoning that the id had "a
 * provenance". It does not. Lite runs ONE SHARED HighLevel sub-account across
 * every tenant, and `/contacts/upsert` dedupes by phone WITHIN a location — so
 * two tenants who both hold +1 813 555 1234 (routine: cold-call rosters
 * overlap heavily) get the IDENTICAL contact id. The unscoped query then
 * settled whichever row was oldest, across all tenants: tenant A charged for
 * tenant B's call, and B's call summary written onto A's row for A to read.
 * A cross-tenant disclosure of call CONTENT, with no attacker needed.
 *
 * So the caller must resolve the tenant from the dialled line (the agent map,
 * exactly as callMirror does) and pass it. WITH NO TENANT, NOTHING IS CLAIMED:
 * refusing is safe (the log falls through to the inbound mirror, which does
 * its own attribution), while guessing is the bug above.
 *
 * Returns `{claimed:true}` when this log was ours. The caller must then NOT
 * hand it to the inbound mirror, or an outbound call the client paid for
 * appears in their Messages tab as "somebody called you".
 */
async function settleFromCallLog(f, { tenantId, windowMin } = {}) {
  const contactId = f && (f.contactId || f.contact_id);
  if (!contactId) return { claimed: false, reason: 'no_contact_id' };
  const t = parseInt(tenantId, 10);
  if (!Number.isInteger(t)) return { claimed: false, reason: 'no_tenant' };
  const mins = Math.max(5, Math.round(Number(windowMin) || num('LITE_OUTBOUND_MATCH_WINDOW_MIN', 180)));

  // Oldest unsettled first: a number dialled twice settles the earlier call
  // against the earlier log.
  const [rows] = await sequelize.query(
    `SELECT oc.id, oc.tenant_id
       FROM lite_outbound_calls oc
       JOIN lite_outbound_contacts c ON c.id = oc.contact_id AND c.tenant_id = oc.tenant_id
      WHERE oc.tenant_id = :t
        AND c.ghl_contact_id = :gc
        AND oc.settled_at IS NULL
        AND oc.enrolled_at > NOW() - (:mins || ' minutes')::interval
      ORDER BY oc.enrolled_at ASC
      LIMIT 1`,
    { replacements: { t, gc: String(contactId), mins: String(mins) } }
  );
  if (!rows || !rows.length) {
    // AN ALREADY-SETTLED OUTBOUND CALL IS STILL CLAIMED, or a re-poll hands it
    // to the inbound mirror and it becomes a fake missed-call message.
    //
    // BOUNDED BY THE SAME WINDOW AND TENANT, because the unbounded version
    // swallowed real inbound calls for ever: once anyone had outbound-dialled
    // a number, every later inbound call from that person was claimed and
    // never became a message. A prospect cold-called once could never leave a
    // voicemail again.
    const [seen] = await sequelize.query(
      `SELECT 1 AS hit FROM lite_outbound_calls oc
         JOIN lite_outbound_contacts c ON c.id = oc.contact_id AND c.tenant_id = oc.tenant_id
        WHERE oc.tenant_id = :t
          AND c.ghl_contact_id = :gc
          AND oc.enrolled_at > NOW() - (:mins || ' minutes')::interval
        LIMIT 1`,
      { replacements: { t, gc: String(contactId), mins: String(mins) } }
    );
    if (seen && seen.length) return { claimed: true, settled: false, reason: 'already_settled' };
    return { claimed: false, reason: 'not_ours' };
  }

  const r = await settle(rows[0].tenant_id, rows[0].id, {
    durationSec: f.durationSec, outcome: f.outcome, summary: f.summary, ghlCallId: f.callId,
  });
  return Object.assign({ claimed: true, tenant_id: rows[0].tenant_id, call_row: rows[0].id }, r);
}

/**
 * APPLY A PAID STRIPE SESSION. ONE WRITER, TWO SOURCES.
 *
 * The webhook calls this, and so does the return-from-Stripe confirm. Two
 * copies of "a payment arrived" would drift the moment one learned something
 * the other did not — the same rule callMirror follows for call results.
 *
 * WHY A SECOND SOURCE EXISTS AT ALL: the webhook is not reliable enough to be
 * the only path to somebody's money. It needs STRIPE_WEBHOOK_SECRET set, the
 * endpoint registered, and Stripe's delivery to succeed. When any of those is
 * missing the client pays and NOTHING happens — which is exactly what
 * happened on the first live activation. The confirm path asks Stripe itself
 * whether the session is paid, so a misconfigured webhook is a latency
 * problem rather than lost money.
 *
 * Idempotent on the payment row: `status <> 'paid'` in the claiming UPDATE
 * means whichever source arrives second is a no-op.
 */
/**
 * WHICH OF STRIPE'S SESSIONS BELONG TO THIS TENANT AND ARE REALLY PAID.
 *
 * Lives here rather than in the route because it is a money rule, and the
 * route is not something the suite can drive. Pure: it reaches nothing.
 *
 * The tenant comes from `metadata.tenant_id`, which WE wrote when the session
 * was created, and it must equal the caller's own tenant — a paid session
 * belonging to somebody else is skipped, never adopted, which matters because
 * one Stripe account serves every tenant. An unrecognised kind is skipped
 * rather than guessed into a wallet credit, and the amount is Stripe's own.
 */
function recoverable(sessions, tenantId, seen) {
  const already = seen instanceof Set ? seen : new Set(seen || []);
  const out = [];
  for (const sess of (sessions || [])) {
    if (!sess || !sess.id) continue;
    const md = sess.metadata || {};
    if (!String(md.kind || '').startsWith('lite_outbound')) continue;
    if (String(md.tenant_id) !== String(tenantId)) continue;
    if (sess.payment_status !== 'paid') continue;   // an open checkout is not a payment
    if (already.has(sess.id)) continue;             // a row already covers it
    const kind = md.kind === 'lite_outbound_setup' ? 'setup'
      : md.kind === 'lite_outbound_topup' ? 'credit' : null;
    if (!kind) continue;
    const amount = Math.round(Number(sess.amount_total) || 0);
    if (!(amount > 0)) continue;
    out.push({ session: sess, kind, amount_cents: amount });
  }
  return out;
}

/**
 * THE SETUP FEE WAS TAKEN AND THE TENANT NEVER MOVED.
 *
 * `applyPayment` claims the payment row BEFORE it transitions, so a transition
 * that fails leaves the row marked paid, the client charged, and the dashboard
 * still offering "Activate — $20.00" with nothing that will ever try again.
 * This is that repair, and it is deliberately NOT part of applyPayment: that
 * function's claim is what makes a replay a no-op, and loosening it would let a
 * webhook retry re-apply money.
 *
 * IT MOVES STATE ONLY. No wallet is credited and no row is re-claimed — the
 * money already moved, once. The caller decides it is warranted (row paid, no
 * setup timestamp, tenant still in a payable state); this function re-checks
 * the state atomically so two sweeps cannot both repair.
 */
/**
 * TURN IT ON WITHOUT A HUMAN, WHEN THERE IS NOTHING LEFT FOR A HUMAN TO DO.
 *
 * The manual step exists only because HighLevel cannot create a workflow by
 * API. Once the shared sub-account HAS one, published, the operator decision
 * was already made — when they built it — and making every later client wait
 * 24 hours for someone to paste an id is a queue with no work in it.
 *
 * It stays conservative: a workflow that is missing, ambiguous or draft leaves
 * the tenant exactly where it was, in pending_setup with the owner alerted, so
 * the manual path still works and nothing is ever enabled on a guess.
 * `LITE_OUTBOUND_AUTO_ACTIVATE=off` restores the always-manual behaviour.
 */
async function autoActivate(tenant) {
  if (String(process.env.LITE_OUTBOUND_AUTO_ACTIVATE || '').toLowerCase() === 'off') {
    return { activated: false, reason: 'off_by_env' };
  }
  const admin = require('./outboundAdmin');

  // THE CLIENT'S OWN WORKFLOW, named after their own number. No caller-ID
  // question arises here: a workflow named for a number dials from that
  // number, so a prospect who calls back reaches the client who rang them.
  // This is the path that lets every client activate itself.
  const mine = await admin.findWorkflowForTenant(tenant)
    .catch(() => ({ ok: false, reason: 'lookup_failed' }));

  let workflowId = 'auto';
  if (mine.ok) {
    workflowId = mine.id;
  } else {
    // FALLING BACK TO THE ONE SHARED WORKFLOW — WHOSE CALLER ID IS IT? A shared
    // workflow dials from ONE number, and `callMirror.resolveNumber` attributes
    // an inbound call by the number that was DIALLED. So a prospect returning
    // that call reaches whoever owns the line, hears THEIR business name, and
    // their message lands in THAT client's dashboard; the client who ran the
    // campaign never learns they called back, and a stranger's details appear
    // in someone else's inbox.
    //
    // `GET /workflows/` returns metadata only — id, name, status — so the
    // action's from-number cannot be read back and the owner states it once.
    // UNSET MEANS REFUSE: this fires with nobody watching, and guessing
    // mis-routes a real prospect to a real stranger. The manual path still
    // works, and naming the workflow after the client's number avoids this
    // branch entirely.
    const ownerTenant = parseInt(process.env.LITE_GHL_OUTBOUND_WORKFLOW_TENANT || '', 10);
    if (!Number.isInteger(ownerTenant)) {
      return { activated: false, reason: 'shared_workflow_owner_unknown', expected: mine.expected_name || null };
    }
    if (Number(tenant.id) !== ownerTenant) {
      return { activated: false, reason: 'shared_caller_id_belongs_to_another_tenant',
        expected: mine.expected_name || null };
    }
  }

  const r = await admin.setOutbound({ confirm: true, tenant: tenant.id,
    enabled: true, workflow_id: workflowId });
  if (r.status !== 200 || !r.payload || !r.payload.ok) {
    return { activated: false, reason: (r.payload && r.payload.error) || 'not_activated' };
  }
  return { activated: true, workflow: r.payload.workflow_verified || null };
}

/**
 * THE MOMENT THE WORKFLOW EXISTS, THE CLIENT GOES LIVE — WITH NOBODY ACTING.
 *
 * `autoActivate` runs once, at the instant the setup fee lands. If the owner
 * had not built that client's workflow yet (the ordinary case: they are told
 * to build it BY that payment), the tenant is parked in `pending_setup` and
 * nothing ever looked again — so finishing the HighLevel side left the client
 * waiting until a human remembered to paste an id, which is the manual step
 * this whole path exists to remove.
 *
 * This re-asks. It is deliberately the SAME `autoActivate`, so a tenant can
 * never reach `active` by a route with fewer checks, and one tenant's failure
 * is caught per tenant: a HighLevel outage for one client must not stop the
 * next one going live.
 *
 * Bounded per pass, because it costs one HighLevel request per waiting client
 * per tick. Waiting clients are few by definition — a client leaves this state
 * the first time it succeeds.
 */
async function resumePendingSetups({ tenantId = null, limit = 25 } = {}) {
  const { Tenant } = require('../models');
  const where = { outbound_state: 'pending_setup' };
  if (tenantId) where.id = tenantId;
  let rows = [];
  try { rows = await Tenant.findAll({ where, limit }); } catch (_) { return []; }
  const out = [];
  for (const t of rows) {
    try {
      const r = await autoActivate(t);
      out.push({ tenant: t.id, activated: !!r.activated, reason: r.reason || null });
    } catch (e) {
      out.push({ tenant: t.id, activated: false, reason: String(e.message || e).slice(0, 90) });
    }
  }
  return out;
}

async function applyStrandedSetup(tenant, session) {
  const notify = require('./notify');
  const due = new Date(Date.now() + slaHours() * 3600 * 1000);
  const moved = await transition(tenant.id,
    ['off', 'awaiting_setup_payment', 'failed_setup'], 'pending_setup',
    { outbound_setup_paid_at: new Date(), outbound_setup_due_at: due, outbound_state_reason: null });
  if (!moved.moved) return { applied: false, reason: 'not_stranded' };

  console.warn('[lite:outbound] REPAIRED a stranded setup fee for tenant', tenant.id,
    '- paid at Stripe, never applied here. Session', session && session.id);
  const autoR = await autoActivate(tenant).catch(() => ({ activated: false }));
  if (autoR.activated) return { applied: true, kind: 'setup', repaired: true, activated: true };
  await notify.notify(tenant.id, 'outbound_setup_paid', 'Outbound setup paid',
    `Your outbound caller will be ready by ${due.toISOString()}. We will let you know the moment it is live.`);
  await notify.ownerSetupPaid(tenant, due).catch(() => {});
  return { applied: true, kind: 'setup', repaired: true, due_at: due };
}

async function applyPayment(tenant, session, { eventId } = {}) {
  const notify = require('./notify');
  const [claimed] = await sequelize.query(
    `UPDATE lite_outbound_payments
        SET status = 'paid', confirmed_at = NOW(), stripe_event_id = COALESCE(:e, stripe_event_id)
      WHERE stripe_session_id = :s AND tenant_id = :t AND status <> 'paid'
      RETURNING id, kind, amount_cents`,
    { replacements: { s: session.id, t: tenant.id, e: eventId || null } }
  ).catch((e) => {
    if (/uq_lite_ob_pay_event|duplicate key/i.test(String(e.message || e))) return [[]];
    throw e;
  });
  if (!claimed || !claimed.length) return { applied: false, reason: 'already_applied' };

  const row = claimed[0];
  // The amount is OUR row's, never the event's — but if Stripe's own figure
  // is smaller, take the smaller. Crediting more than arrived is the one
  // direction that costs real money.
  let amount = Number(row.amount_cents) || 0;
  const paid = Number(session.amount_total);
  if (Number.isFinite(paid) && paid > 0 && paid < amount) amount = paid;

  if (row.kind === 'credit') {
    await credit(tenant.id, amount);
    await notify.notify(tenant.id, 'outbound_funded', 'Funds added',
      `$${(amount / 100).toFixed(2)} added to your outbound balance.`);
    return { applied: true, kind: 'credit', amount_cents: amount };
  }

  const due = new Date(Date.now() + slaHours() * 3600 * 1000);
  const moved = await transition(tenant.id,
    ['off', 'awaiting_setup_payment', 'failed_setup'], 'pending_setup',
    { outbound_setup_paid_at: new Date(), outbound_setup_due_at: due, outbound_state_reason: null });
  if (!moved.moved) {
    // Paid twice for one setup. Raised on both surfaces so it is refunded,
    // not discovered in an audit months later.
    console.warn('[lite:outbound] DUPLICATE setup fee for tenant', tenant.id, '— refund due');
    await notify.notify(tenant.id, 'outbound_duplicate_fee', 'Duplicate setup fee',
      'You were charged the setup fee twice. We have been notified and will refund it.');
    await notify.notifyOwner('owner_refund_due',
      `REFUND DUE — duplicate setup fee, tenant ${tenant.id}`,
      `Session ${session.id}, ${amount}c. Refund it in Stripe.`).catch(() => {});
    return { applied: false, reason: 'duplicate_setup', refund_due: true };
  }

  // FINISH IT NOW IF THE SHARED WORKFLOW ALREADY EXISTS. HighLevel cannot
  // create a workflow by API, but Lite runs every tenant in ONE sub-account, so
  // after the first client the workflow is already there and published — and
  // then a 24-hour promise and a human step are both theatre. If it is not
  // found, nothing changes: the tenant stays pending_setup and the owner gets
  // the alert exactly as before.
  const auto = await autoActivate(tenant).catch(() => ({ activated: false }));
  if (auto.activated) return { applied: true, kind: 'setup', activated: true, workflow: auto.workflow };

  await notify.notify(tenant.id, 'outbound_setup_paid', 'Outbound setup paid',
    `Your outbound caller will be ready by ${due.toISOString()}. We will let you know the moment it is live.`);
  await notify.ownerSetupPaid(tenant, due).catch(() => {});
  return { applied: true, kind: 'setup', due_at: due };
}

/* ── WHAT THE CLIENT SEES ────────────────────────────────────────────────── */

/** The per-call report. Only facts: no outcome is invented for a missing log. */
async function callReport(tenantId, { limit = 100, listId = null } = {}) {
  const [rows] = await sequelize.query(
    `SELECT oc.id, oc.enrolled_at, oc.duration_sec, oc.charged_cents, oc.outcome,
            oc.summary, oc.settled_at, oc.list_id,
            c.contact_name, c.company, c.phone
       FROM lite_outbound_calls oc
       LEFT JOIN lite_outbound_contacts c ON c.id = oc.contact_id
      WHERE oc.tenant_id = :t ${listId ? 'AND oc.list_id = :l' : ''}
      ORDER BY oc.enrolled_at DESC
      LIMIT :n`,
    { replacements: { t: tenantId, n: Math.min(500, Math.max(1, limit)), l: listId } }
  );
  return (rows || []).map((r) => ({
    id: r.id,
    at: r.enrolled_at,
    name: r.contact_name || null,
    company: r.company || null,
    phone: r.phone || null,
    duration_sec: r.settled_at ? (Number(r.duration_sec) || 0) : null,
    charged_cents: r.settled_at ? (Number(r.charged_cents) || 0) : null,
    // THREE DIFFERENT FACTS, three different words. `in_progress` means we are
    // still waiting; `no_result_recorded` means we waited and never heard.
    outcome: !r.settled_at ? 'in_progress'
      : (r.outcome === 'no_log' ? 'no_result_recorded'
        : (r.outcome || ((Number(r.duration_sec) || 0) > 0 ? 'connected' : 'not_answered'))),
    summary: r.summary || null,      // only ever HighLevel's own words
  }));
}

/** Roll-up for a list, or the whole account. Counts of real rows only. */
async function spendSummary(tenantId, { listId = null } = {}) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*)::int AS attempted,
            COUNT(*) FILTER (WHERE settled_at IS NOT NULL AND COALESCE(duration_sec,0) > 0)::int AS connected,
            COALESCE(SUM(duration_sec) FILTER (WHERE settled_at IS NOT NULL), 0)::int AS total_sec,
            COALESCE(SUM(charged_cents) FILTER (WHERE settled_at IS NOT NULL), 0)::int AS spent_cents,
            COUNT(*) FILTER (WHERE settled_at IS NULL)::int AS in_progress
       FROM lite_outbound_calls
      WHERE tenant_id = :t ${listId ? 'AND list_id = :l' : ''}`,
    { replacements: { t: tenantId, l: listId } }
  );
  const r = (rows && rows[0]) || {};
  return {
    attempted: Number(r.attempted) || 0,
    connected: Number(r.connected) || 0,
    total_minutes: Math.round(((Number(r.total_sec) || 0) / 60) * 10) / 10,
    spent_cents: Number(r.spent_cents) || 0,
    in_progress: Number(r.in_progress) || 0,
  };
}

module.exports = { recoverable, applyStrandedSetup, autoActivate, resumePendingSetups, isUnlimited,
  STATES, transition,
  pricing, pricePerMinCents, setupFeeCents, minTopupCents, reserveCents, reserveMin,
  slaHours, chargeForSeconds, costPerMinUsd, markup,
  ensureWallet, wallet, credit, reserve, release, settle, sweepStaleReserves,
  callReport, spendSummary, settleFromCallLog, applyPayment,
};
