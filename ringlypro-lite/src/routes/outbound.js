'use strict';

/**
 * Outbound list management. Mounted under the authenticated /api tree, so
 * every handler already has req.tenantId from the session — never from a body.
 *
 * Uploading is deliberately unglamorous: paste or upload CSV text, see a
 * per-row result, then ACTIVATE as a separate act. Approve and activate stay
 * apart, because "I uploaded it" and "start ringing strangers" are different
 * decisions and one click should not be both.
 */
const express = require('express');
const router = express.Router();
const { sequelize, Tenant } = require('../models');
const ob = require('../services/outbound');
const tollFraud = require('../security/tollFraud');
const billing = require('../services/outboundBilling');
// How often the plan endpoint may ask Stripe for one tenant, at most.
const PLAN_SWEEP_MS = Math.max(15, parseInt(process.env.LITE_PLAN_SWEEP_SEC || '60', 10) || 60) * 1000;
const notify = require('../services/notify');

// A PER-TENANT CEILING ON THE PAID ENDPOINTS. Nothing else in the /api tree
// is rate limited, so one signed-in client looping /topup could create
// thousands of Stripe Checkout sessions — spending the PLATFORM's shared
// Stripe quota and breaking checkout for every other tenant — and grow a
// table with a unique index without bound. In memory, per instance, which is
// stated rather than implied.
const HITS = new Map();
function tooMany(tenantId, key, perMin) {
  const now = Date.now();
  const k = `${tenantId}:${key}`;
  const arr = (HITS.get(k) || []).filter((t) => now - t < 60000);
  if (arr.length >= perMin) { HITS.set(k, arr); return true; }
  arr.push(now); HITS.set(k, arr);
  if (HITS.size > 5000) HITS.clear();          // unbounded map is its own leak
  return false;
}

const MAX_UPLOAD = Math.max(1, parseInt(process.env.LITE_OUTBOUND_MAX_KB || '2048', 10) || 2048) * 1024;

/** Is this tenant allowed to see the feature at all? */
router.get('/status', async (req, res) => {
  const t = await Tenant.findByPk(req.tenantId);
  const [[cnt]] = await sequelize.query(
    `SELECT COUNT(*)::int AS lists,
            COUNT(*) FILTER (WHERE status = 'active')::int AS active,
            (SELECT COUNT(*)::int FROM lite_outbound_contacts c
               JOIN lite_outbound_lists l2 ON l2.id = c.list_id AND l2.status = 'active'
              WHERE c.tenant_id = :t AND c.status = 'pending') AS waiting
       FROM lite_outbound_lists WHERE tenant_id = :t`,
    { replacements: { t: req.tenantId } }
  );
  res.json({
    enabled: !!(t && t.outbound_enabled),
    workflow_ready: !!(t && t.outbound_workflow_id),
    daily_cap: (t && t.outbound_daily_cap) || 0,
    dialled_today: await ob.dialledToday(req.tenantId),
    lists: (cnt && cnt.lists) || 0,
    active_lists: (cnt && cnt.active) || 0,
    waiting: (cnt && cnt.waiting) || 0,
    // WHETHER ANYTHING IS ACTUALLY RUNNING. "Activate" used to set a column
    // nothing read, so a tenant could activate a list and wait for calls that
    // were never going to happen. The tab now says which it is.
    dialer_running: !!require('../services/outboundDialer').stats.last_at,
    calling_hours: `${ob.startHour()}:00–${ob.endHour()}:00 in each contact's own timezone`,
    consent_bases: ob.CONSENT_BASES,
    // STATED, NOT IMPLIED. Scrubbing needs an FTC SAN the owner does not have.
    // Visible rather than assumed: with no webhook secret set, Stripe's
    // confirmation is refused and the /confirm path above is the ONLY thing
    // applying payments.
    webhook_confirms: !!(process.env.LITE_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET),
    national_dnc_scrub: false,
    national_dnc_note: 'Numbers are NOT checked against the National Do Not Call registry. That needs an FTC Subscription Account Number. Only your own do-not-call list is applied.',
  });
});

/**
 * PREVIEW FIRST. Nothing is stored: the tenant sees exactly which rows would
 * be accepted and which refused, with the reason, before anything exists.
 */
router.post('/preview', express.text({ limit: MAX_UPLOAD, type: '*/*' }), async (req, res) => {
  const t = await Tenant.findByPk(req.tenantId);
  const buf = Buffer.from(req.body || '', 'utf8');
  if (!buf.length) return res.status(400).json({ error: 'empty' });
  const r = ob.parseList(buf, { defaultCountry: (t && t.country) || 'US' });
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true, would_accept: r.accepted.length, would_refuse: r.refused.length,
    truncated: r.truncated, header_detected: r.header_detected,
    columns_mapped: r.columns_mapped, columns_ignored: r.columns_ignored,
    sample: r.accepted.slice(0, 10), refused: r.refused.slice(0, 50) });
});

/** Store the accepted rows as a DRAFT list. A draft never dials. */
router.post('/lists', express.text({ limit: MAX_UPLOAD, type: '*/*' }), async (req, res) => {
  const t = await Tenant.findByPk(req.tenantId);
  const name = String(req.query.name || 'Uploaded list').trim().slice(0, 160);
  const basis = ob.CONSENT_BASES.includes(String(req.query.consent)) ? String(req.query.consent) : 'unstated';
  const note = String(req.query.note || '').slice(0, 500);
  const buf = Buffer.from(req.body || '', 'utf8');
  if (!buf.length) return res.status(400).json({ error: 'empty' });

  const r = ob.parseList(buf, { defaultCountry: (t && t.country) || 'US' });
  if (!r.ok) return res.status(400).json(r);

  const [ins] = await sequelize.query(
    `INSERT INTO lite_outbound_lists (tenant_id, name, consent_basis, consent_note, rows_total, rows_accepted, rows_refused)
       VALUES (:t, :n, :cb, :cn, :tot, :acc, :ref) RETURNING id`,
    { replacements: { t: req.tenantId, n: name, cb: basis, cn: note || null,
      tot: r.total_rows, acc: r.accepted.length, ref: r.refused.length } }
  );
  const listId = ins[0].id;

  let stored = 0, duplicates = 0;
  for (const c of r.accepted) {
    try {
      // A number already on this tenant's books is left alone — re-uploading
      // the same sheet must not reset somebody's status or double-dial them.
      const [out] = await sequelize.query(
        `INSERT INTO lite_outbound_contacts (tenant_id, list_id, company, contact_name, phone, email, timezone)
           VALUES (:t, :l, :co, :cn, :p, :e, :tz)
         ON CONFLICT (tenant_id, phone) DO NOTHING RETURNING id`,
        { replacements: { t: req.tenantId, l: listId, co: c.company, cn: c.contact_name,
          p: c.phone, e: c.email, tz: c.timezone } }
      );
      if (out && out.length) stored++; else duplicates++;
    } catch (e) { duplicates++; }
  }
  res.status(201).json({ ok: true, list_id: listId, stored, duplicates,
    refused: r.refused.length, status: 'draft',
    next: 'Review it, then activate. A draft never dials.' });
});

router.get('/lists', async (req, res) => {
  const [rows] = await sequelize.query(
    `SELECT id, name, consent_basis, status, rows_accepted, rows_refused, created_at, activated_at
       FROM lite_outbound_lists WHERE tenant_id = :t ORDER BY id DESC LIMIT 100`,
    { replacements: { t: req.tenantId } }
  );
  res.json({ lists: rows });
});

router.get('/lists/:id/contacts', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
  const [rows] = await sequelize.query(
    `SELECT id, company, contact_name, phone, email, timezone, status, attempts, last_outcome
       FROM lite_outbound_contacts WHERE tenant_id = :t AND list_id = :l ORDER BY id LIMIT 500`,
    { replacements: { t: req.tenantId, l: id } }
  );
  // The owner's own list, so numbers are shown in full — they uploaded them.
  res.json({ contacts: rows });
});

/** ACTIVATION IS ITS OWN ACT, and it still cannot dial without the gates. */
router.post('/lists/:id/activate', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
  const t = await Tenant.findByPk(req.tenantId);
  if (!t || !t.outbound_enabled) {
    return res.status(403).json({ error: 'outbound_not_enabled',
      message: 'Outbound calling is not switched on for this account yet.' });
  }
  // Paid AND set up. Activating a list while either is missing would start a
  // campaign the dialer then refuses on every contact, one at a time.
  if (t.outbound_state !== 'active') {
    return res.status(402).json({ error: 'outbound_not_activated', state: t.outbound_state,
      message: 'Activate outbound first.' });
  }
  const w = await billing.wallet(req.tenantId);
  if (!w.can_place_a_call) {
    return res.status(402).json({ error: 'insufficient_credit', balance_cents: w.balance_cents,
      message: 'Add funds before starting this list.' });
  }
  // Check what actually moved: reporting 'active' for another tenant's list
  // id, or a stale one, tells the client a campaign started that does not
  // exist.
  const [moved] = await sequelize.query(
    `UPDATE lite_outbound_lists SET status = 'active', activated_at = NOW()
       WHERE id = :i AND tenant_id = :t RETURNING id`,
    { replacements: { i: id, t: req.tenantId } }
  );
  if (!moved || !moved.length) return res.status(404).json({ error: 'no_such_list' });
  res.json({ ok: true, status: 'active' });
});

/** The do-not-call list. The one thing a called party can demand. */
router.get('/suppressions', async (req, res) => {
  const [rows] = await sequelize.query(
    `SELECT phone, reason, source, created_at FROM lite_outbound_suppressions
       WHERE tenant_id = :t ORDER BY id DESC LIMIT 500`,
    { replacements: { t: req.tenantId } }
  );
  res.json({ suppressions: rows });
});

router.post('/suppressions', express.json({ limit: '8kb' }), async (req, res) => {
  const r = await ob.suppress(req.tenantId, (req.body || {}).phone, 'do_not_call', 'owner');
  res.status(r.ok ? 201 : 400).json(r);
});

/** Dial one contact now. Every gate in mayDial runs first. */
router.post('/contacts/:id/dial', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad_id' });
  const t = await Tenant.findByPk(req.tenantId);
  const [rows] = await sequelize.query(
    `SELECT * FROM lite_outbound_contacts WHERE id = :i AND tenant_id = :t`,
    { replacements: { i: id, t: req.tenantId } }
  );
  const contact = rows && rows[0];
  if (!contact) return res.status(404).json({ error: 'not_found' });
  try {
    const r = await ob.dial(t, contact);
    return res.status(r.ok ? 200 : 409).json(r);
  } catch (e) {
    console.error('[lite:outbound] dial failed:', e.message);
    return res.status(502).json({ ok: false, reason: 'dial_failed',
      detail: String(e.message || e).slice(0, 200) });
  }
});

/* ── THE PAID ADD-ON ─────────────────────────────────────────────────────── */

function stripe() {
  const key = process.env.LITE_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key);
}
function publicUrl() {
  return (process.env.LITE_PUBLIC_URL || 'https://ringlypro-lite.onrender.com').replace(/\/$/, '');
}

/**
 * Everything the tab needs to render itself, in one call. The PRICE IS
 * COMPUTED HERE and nowhere else — no surface may hardcode a figure, so
 * changing the env changes every screen with no redeploy.
 */
router.get('/plan', async (req, res) => {
  let t = await Tenant.findByPk(req.tenantId);

  // LOADING THIS TAB IS ENOUGH TO RECOVER A PAYMENT.
  //
  // Everything else that could apply it has a way of not being there: the
  // webhook needs a secret, the timer needs a process that started it, the
  // admin endpoint needs a key, and a button needs the browser to have picked
  // up new JavaScript rather than a cached shell. This endpoint is the one
  // thing that is always hit, by the page they are already looking at, and
  // `/api/` is never cached. Throttled per tenant, and only while they are in
  // a state where money could be owed — a live tenant never triggers it.
  let recovery = null;
  const payable = require('../services/paymentSweep').PAYABLE;
  if (payable.includes((t && t.outbound_state) || 'off')) {
    const ps = require('../services/paymentSweep');
    if (ps.recentlyAsked(req.tenantId, PLAN_SWEEP_MS)) {
      // SAID, NOT LEFT NULL. A reload inside the throttle window would report
      // nothing at all, which reads exactly like another silent failure.
      recovery = { ok: true, skipped: 'checked_recently' };
    } else {
      try {
        const r = await ps.run({ tenantId: req.tenantId });
        if (r.applied && r.applied.length) t = await Tenant.findByPk(req.tenantId);
        // REPORTED TO THE SIGNED-IN TENANT, about their OWN account: counts and
        // a reason, never a session id or an amount. Four fixes failed in a row
        // because "nothing happened" was the only signal available from
        // outside, and it cannot be told apart from "nothing was found", "found
        // but tagged to another tenant" or "Stripe was never reached".
        recovery = { ok: r.ok, reason: r.reason || null,
          applied: (r.applied || []).length, ...(r.seen || {}) };
      } catch (e) {
        recovery = { ok: false, reason: String(e.message || e).slice(0, 120) };
        console.warn('[lite:outbound] plan sweep failed:', e.message);
      }
    }
  }

  const state = (t && t.outbound_state) || 'off';
  const w = await billing.wallet(req.tenantId);
  // IS THERE MONEY IN FLIGHT? One cheap count, so the page knows whether it is
  // worth asking Stripe. Without it the self-heal would retrieve sessions for
  // every tenant who has never paid, on every page load.
  let openPayments = 0;
  try {
    const [c] = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM lite_outbound_payments
        WHERE tenant_id = :t AND status = 'open' AND stripe_session_id IS NOT NULL`,
      { replacements: { t: req.tenantId } });
    openPayments = (c && c[0] && c[0].n) || 0;
  } catch (_) { /* a count is never worth failing the page for */ }
  res.json({
    state,
    tenant: req.tenantId,
    recovery,
    open_payments: openPayments,
    pricing: billing.pricing(),
    wallet: w,
    setup_paid_at: t && t.outbound_setup_paid_at,
    setup_due_at: t && t.outbound_setup_due_at,
    // A deadline that has passed must never keep being shown as a promise.
    overdue: !!(state === 'pending_setup' && t && t.outbound_setup_due_at
      && new Date(t.outbound_setup_due_at) < new Date()),
    reason: t && t.outbound_state_reason,
    national_dnc_scrub: false,
    national_dnc_note: 'Numbers are NOT checked against the National Do Not Call registry. That needs an FTC Subscription Account Number. Only your own do-not-call list is applied.',
  });
});

/** Pay the one-off setup fee. The AMOUNT IS READ FROM ENV, never from the body. */
router.post('/activate', async (req, res) => {
  if (tooMany(req.tenantId, 'activate', 5)) return res.status(429).json({ error: 'slow_down' });
  const t = await Tenant.findByPk(req.tenantId);
  if (!t) return res.status(404).json({ error: 'no_tenant' });
  if (['pending_setup', 'active'].includes(t.outbound_state)) {
    return res.status(409).json({ error: 'already_' + t.outbound_state });
  }
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'payments_not_configured' });

  const amount = billing.setupFeeCents();
  try {
    // Reuse an open session rather than minting a second: two sessions for
    // one activation is two charges if both get paid.
    const [open] = await sequelize.query(
      `SELECT stripe_session_id FROM lite_outbound_payments
        WHERE tenant_id = :t AND kind = 'setup' AND status = 'open'
        ORDER BY id DESC LIMIT 1`, { replacements: { t: req.tenantId } });
    if (open && open.length && open[0].stripe_session_id) {
      try {
        const prev = await s.checkout.sessions.retrieve(open[0].stripe_session_id);
        if (prev && prev.status === 'open' && prev.url) {
          // TRANSITION HERE TOO. Returning early skipped it, so a second tap
          // on Activate left the tenant in 'off' — and the tab then offered
          // "Activate — $20.00" to somebody with a live checkout open.
          await billing.transition(req.tenantId, ['off', 'failed_setup'], 'awaiting_setup_payment');
          return res.json({ url: prev.url, reused: true });
        }
      } catch (_) { /* fall through and make a new one */ }
    }

    const session = await s.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: amount,
        product_data: { name: 'Outbound calling — one-off setup' } } }],
      metadata: { kind: 'lite_outbound_setup', tenant_id: String(req.tenantId) },
      success_url: `${publicUrl()}/dashboard?outbound=confirming`,
      cancel_url: `${publicUrl()}/dashboard?outbound=cancelled`,
    });
    await sequelize.query(
      `INSERT INTO lite_outbound_payments (tenant_id, kind, amount_cents, stripe_session_id)
       VALUES (:t, 'setup', :a, :s)`,
      { replacements: { t: req.tenantId, a: amount, s: session.id } });
    await billing.transition(req.tenantId, ['off', 'awaiting_setup_payment', 'failed_setup'],
      'awaiting_setup_payment');
    res.json({ url: session.url, amount_cents: amount });
  } catch (e) {
    res.status(502).json({ error: 'checkout_failed', detail: String(e.message || e).slice(0, 200) });
  }
});

/**
 * CONFIRM A PAYMENT BY ASKING STRIPE, not by believing the browser.
 *
 * The return URL cannot be trusted — anyone can visit it — so this does not
 * read a single thing from the request. It finds THIS TENANT's open payment
 * rows, retrieves each session from Stripe with the server key, and applies
 * only the ones Stripe itself reports as paid.
 *
 * WHY IT EXISTS: the webhook was the only path to somebody's money, and it
 * needs the secret set, the endpoint registered and Stripe's delivery to
 * succeed. When any of those is missing the client pays and NOTHING happens
 * — which is what happened on the first live activation. With this, a
 * misconfigured webhook is a latency problem instead of lost money.
 */
router.post('/confirm', async (req, res) => {
  // It reaches Stripe, so it gets the same kind of ceiling as the routes
  // that mint sessions — generous, because a legitimate poll after paying
  // makes several calls in a row.
  if (tooMany(req.tenantId, 'confirm', 30)) return res.status(429).json({ error: 'slow_down' });
  const t = await Tenant.findByPk(req.tenantId);
  if (!t) return res.status(404).json({ error: 'no_tenant' });
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'payments_not_configured' });

  const [rows] = await sequelize.query(
    `SELECT stripe_session_id FROM lite_outbound_payments
      WHERE tenant_id = :t AND status = 'open' AND stripe_session_id IS NOT NULL
      ORDER BY id DESC LIMIT 5`,
    { replacements: { t: req.tenantId } }
  );
  const applied = [];
  for (const r of (rows || [])) {
    let sess = null;
    try { sess = await s.checkout.sessions.retrieve(r.stripe_session_id); }
    catch (e) { continue; }                     // a session Stripe cannot find is not a payment
    // ONE RULE, ONE PLACE. This path knows the session id from our own row, but
    // what makes it money is the same question the sweep below asks, so it is
    // asked in the same function — which also means Stripe's own metadata has
    // to agree that the session is this tenant's, not just our row.
    if (!billing.recoverable([sess], req.tenantId, new Set()).length) continue;
    try {
      const out = await billing.applyPayment(t, sess, {});
      if (out.applied) applied.push(out);
    } catch (e) {
      console.warn('[lite:outbound] confirm failed for', r.stripe_session_id, e.message);
    }
  }
  // AND THE CASE WHERE OUR OWN ROW IS MISSING ENTIRELY — the same sweep the
  // unattended poller runs, scoped to this caller. It lives in
  // services/paymentSweep so that applying a payment does not depend on
  // somebody opening a tab, and so there is ONE copy of the rule.
  try {
    const sw = await require('../services/paymentSweep').run({ tenantId: req.tenantId });
    for (const a of (sw.applied || [])) applied.push({ ...a, recovered: true });
  } catch (e) {
    console.warn('[lite:outbound] confirm sweep failed:', e.message);
  }

  const fresh = await Tenant.findByPk(req.tenantId);
  res.json({ ok: true, applied, state: fresh.outbound_state,
    wallet: await billing.wallet(req.tenantId) });
});

/** Add funds. Any amount at or above the floor. */
router.post('/topup', express.json({ limit: '4kb' }), async (req, res) => {
  if (tooMany(req.tenantId, 'topup', 10)) return res.status(429).json({ error: 'slow_down' });
  const t = await Tenant.findByPk(req.tenantId);
  if (!t) return res.status(404).json({ error: 'no_tenant' });
  if (t.outbound_state !== 'active') {
    return res.status(402).json({ error: 'outbound_not_activated', state: t.outbound_state });
  }
  const amount = Math.round(Number((req.body || {}).amount_cents) || 0);
  if (!Number.isFinite(amount) || amount < billing.minTopupCents() || amount > 500000) {
    return res.status(400).json({ error: 'bad_amount', min_cents: billing.minTopupCents() });
  }
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'payments_not_configured' });
  try {
    const session = await s.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: amount,
        product_data: { name: 'Outbound calling credit' } } }],
      metadata: { kind: 'lite_outbound_topup', tenant_id: String(req.tenantId) },
      success_url: `${publicUrl()}/dashboard?outbound=funded`,
      cancel_url: `${publicUrl()}/dashboard?outbound=cancelled`,
    });
    await sequelize.query(
      `INSERT INTO lite_outbound_payments (tenant_id, kind, amount_cents, stripe_session_id)
       VALUES (:t, 'credit', :a, :s)`,
      { replacements: { t: req.tenantId, a: amount, s: session.id } });
    res.json({ url: session.url, amount_cents: amount });
  } catch (e) {
    res.status(502).json({ error: 'checkout_failed', detail: String(e.message || e).slice(0, 200) });
  }
});

/** The call report: what happened, and what it cost. */
router.get('/calls', async (req, res) => {
  const listId = req.query.list ? parseInt(req.query.list, 10) : null;
  res.json({
    calls: await billing.callReport(req.tenantId, { limit: 200, listId: Number.isInteger(listId) ? listId : null }),
    summary: await billing.spendSummary(req.tenantId, { listId: Number.isInteger(listId) ? listId : null }),
    pricing: billing.pricing(),
  });
});

module.exports = router;
