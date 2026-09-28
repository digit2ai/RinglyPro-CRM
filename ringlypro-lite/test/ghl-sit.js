'use strict';

/**
 * HighLevel provisioning SIT. Zero keys, no database, no network: global fetch
 * is replaced by a fake HighLevel that records every request, and the models
 * are an in-memory stand-in injected through require.cache. Nothing is bought.
 *
 *   node ringlypro-lite/test/ghl-sit.js
 *
 * It attacks the guarantees rather than the happy path: that one tenant's
 * credentials can never serve another's request, that a claim is exclusive,
 * that a retry never buys a second number, that the agent books into the
 * tenant's OWN calendar, that a forbidden transfer destination never reaches
 * the agent, that the post-call mirror refuses an unauthenticated or replayed
 * delivery and cannot write across tenants, and that the token never leaves the
 * Authorization header.
 *
 * NOT COVERED, and said so: the real HighLevel API, a real purchase, a real
 * webhook from HighLevel's servers, and Postgres itself.
 */
process.env.NODE_ENV = 'test';
process.env.LITE_GHL_TOKEN = 'pit-env-fallback-token';
process.env.LITE_GHL_LOCATION_ID = 'LOC-ENV';
process.env.LITE_SECRET_KEY = 'sit-secret-key-at-least-16-chars-long';
delete process.env.LITE_NUMBER_PROVIDER;
delete process.env.LITE_GHL_TEMPLATE_AGENT_ID;
delete process.env.LITE_GHL_AGENCY_TOKEN;
delete process.env.LITE_ALLOWED_DIAL_COUNTRIES;

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0; const failures = [];
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; failures.push(name); console.log(`FAIL  ${name}\n      ${e.message}`); }
}
function section(s) { console.log(`\n-- ${s} ${'-'.repeat(Math.max(0, 58 - s.length))}`); }

/* ── in-memory models, injected before anything requires the real ones ──── */
function table(name) {
  const rows = []; let seq = 0;
  const match = (r, w) => Object.entries(w || {}).every(([k, v]) => {
    // A Date compares by REFERENCE with ===, so booking.js's clash lookup
    // (`starts_at: startUtc`) could NEVER match and the whole slot_taken path
    // was dead in this harness — which made "the freed slot is rebookable"
    // pass for the wrong reason.
    if (v instanceof Date) return r[k] != null && +new Date(r[k]) === +v;
    if (v && typeof v === 'object' && Array.isArray(v[Object.getOwnPropertySymbols(v)[0]])) {
      const arr = v[Object.getOwnPropertySymbols(v)[0]];      // Op.in
      return arr.includes(r[k]);
    }
    if (v && typeof v === 'object') {
      const syms = Object.getOwnPropertySymbols(v);
      for (const sym of syms) {
        const d = String(sym.description || sym.toString());
        // Postgres really does filter on this, so the fake must too — a
        // permissive stand-in turns an untested query into a passing test.
        if (d.includes('ne')) { if (r[k] === v[sym] || (v[sym] === null && r[k] == null)) return false; }
      }
      if (syms.length) return true;
    }
    if (v && typeof v === 'object' && v.constructor === Object) return true; // other Op.* — not asserted on
    return r[k] === v;
  });
  const wrap = (r) => Object.assign(r, {
    update: async (patch) => { Object.assign(r, patch); return r; },
    save: async () => r,
    // A failed push DELETES the local row, so destroy has to be real here or
    // the "booked here, free there" test would pass without the fix.
    destroy: async () => { const i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); return 1; },
    get: (k) => r[k],
  });
  return {
    _rows: rows,
    async create(v) { const r = wrap({ id: ++seq, ...v }); rows.push(r); return r; },
    async findOne({ where }) { return rows.find((r) => match(r, where)) || null; },
    async findByPk(id) { return rows.find((r) => r.id === id) || null; },
    async findAll({ where } = {}) { return where ? rows.filter((r) => match(r, where)) : rows.slice(); },
    async count({ where } = {}) { return (where ? rows.filter((r) => match(r, where)) : rows).length; },
    // Sequelize's static update: patch every matching row, return [count].
    async update(patch, { where } = {}) {
      const hit = where ? rows.filter((r) => match(r, where)) : rows.slice();
      hit.forEach((r) => Object.assign(r, patch));
      return [hit.length];
    },
    async destroy({ where } = {}) {
      const hit = where ? rows.filter((r) => match(r, where)) : rows.slice();
      hit.forEach((r) => { const i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); });
      return hit.length;
    },
    async findOrCreate({ where, defaults }) {
      const found = rows.find((r) => match(r, where));
      if (found) return [found, false];
      return [await this.create({ ...where, ...defaults }), true];
    },
  };
}

const M = {
  Tenant: table('tenant'), User: table('user'), Number: table('number'),
  Call: table('call'), Message: table('message'), Appointment: table('appt'),
  Transcript: table('transcript'), AvailabilityRule: table('avail'),
  Recharge: table('recharge'), GhlAccount: table('ghl'),
};
// The atomic claim is raw SQL against Postgres; in memory we emulate exactly
// its contract — one winner, skip-locked — so the caller is still under test.
const LOCKS = new Set();
M.sequelize = {
  // booking.bookAppointment wraps the insert in a transaction; the push happens
  // OUTSIDE it on purpose (an HTTP round trip must not hold a row lock), which
  // this stand-in preserves by simply running the body.
  async transaction(fn) { return fn({ LOCK: { UPDATE: 'UPDATE' } }); },
  async query(sql, opts) {
    // Emulate pg_try_advisory_lock faithfully: a second holder is REFUSED, so
    // the caller's serialisation is genuinely under test.
    if (/pg_try_advisory_lock/.test(sql)) {
      const k = String(opts.replacements.id);
      if (LOCKS.has(k)) return [[{ ok: false }], {}];
      LOCKS.add(k); return [[{ ok: true }], {}];
    }
    if (/pg_advisory_unlock/.test(sql)) { LOCKS.delete(String(opts.replacements.id)); return [[{ ok: true }], {}]; }
    if (/UPDATE lite_ghl_accounts/.test(sql)) {
      const t = opts.replacements.t;
      const free = M.GhlAccount._rows.find((r) => r.status === 'free' && !r.claimed_by_tenant);
      if (!free) return [[], { rows: [] }];
      free.status = 'claimed'; free.claimed_by_tenant = t; free.claimed_at = new Date();
      const row = { id: free.id, location_id: free.location_id, token_enc: free.token_enc };
      return [[row], { rows: [row] }];
    }

    // ── THE OUTBOUND TABLES ─────────────────────────────────────────────
    // Backed for real, because the fake's default is `[[], {}]`: without
    // this every dialer query returns nothing, the loop does nothing, and
    // the tests pass while testing nothing at all. Each branch emulates the
    // CONTRACT of the statement the service actually issues.
    if (/FROM lite_outbound_suppressions/.test(sql)) {
      const hit = OB.suppressions.find((r) => r.tenant_id === opts.replacements.t
        && r.phone === opts.replacements.p);
      return [hit ? [{ reason: hit.reason }] : [], {}];
    }
    if (/INSERT INTO lite_outbound_suppressions/.test(sql)) {
      const { t, p, r, s: src } = opts.replacements;
      const ex = OB.suppressions.find((x) => x.tenant_id === t && x.phone === p);
      if (ex) { ex.reason = r; ex.source = src; } else OB.suppressions.push({ tenant_id: t, phone: p, reason: r, source: src });
      return [[], {}];
    }
    if (/SELECT DISTINCT t\.id/.test(sql) && /lite_outbound_lists/.test(sql)) {
      const onlyActive = /l\.status\s*=\s*'active'/.test(sql);
      const ids = [...new Set(OB.lists.filter((l) => !onlyActive || l.status === 'active').map((l) => l.tenant_id))]
        .filter((id) => { const t = M.Tenant._rows.find((x) => x.id === id);
          return t && t.outbound_enabled && t.outbound_workflow_id; })
        .sort((a, b) => a - b);
      return [ids.map((id) => ({ id })), {}];
    }
    if (/SELECT c\.\* FROM lite_outbound_contacts/.test(sql)) {
      const { t, n } = opts.replacements;
      // HONOUR THE JOIN AS WRITTEN. Filtering to active lists in JavaScript
      // regardless of the SQL made the harness MORE PERMISSIVE THAN POSTGRES:
      // deleting `AND l.status = 'active'` from the statement changed nothing
      // here, so the one rule that stops a draft list being dialled was not
      // actually under test. Same class as the Op.ne bug.
      const restricted = /l\.status\s*=\s*'active'/.test(sql);
      const active = new Set(OB.lists.filter((l) => !restricted || l.status === 'active').map((l) => l.id));
      const rows = OB.contacts
        .filter((c) => c.tenant_id === t && c.status === 'pending' && active.has(c.list_id))
        .sort((a, b) => a.id - b.id).slice(0, n);
      return [rows.map((r) => ({ ...r })), {}];
    }
    if (/UPDATE lite_outbound_contacts/.test(sql)) {
      const rp = opts.replacements || {};
      for (const c of OB.contacts) {
        const byId = rp.id !== undefined && c.id === rp.id && c.tenant_id === rp.t;
        const byPhone = rp.p !== undefined && c.phone === rp.p && c.tenant_id === rp.t;
        if (!byId && !byPhone) continue;
        if (/status = 'dialled'/.test(sql)) {
          c.status = 'dialled'; c.attempts = (c.attempts || 0) + 1;
          c.last_attempt_at = new Date(); c.ghl_contact_id = rp.gc;
        } else if (/status = 'skipped'/.test(sql)) {
          c.status = 'skipped'; c.last_outcome = rp.o; c.last_attempt_at = new Date();
        } else if (/status = 'suppressed'/.test(sql)) { c.status = 'suppressed'; }
      }
      return [[], {}];
    }
    if (/FROM lite_outbound_calls/.test(sql) && /COUNT/.test(sql)) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const n = OB.calls.filter((c) => c.tenant_id === opts.replacements.t
        && new Date(c.enrolled_at) >= today).length;
      return [[{ n }], {}];
    }
    if (/INSERT INTO lite_outbound_calls/.test(sql)) {
      const { t, c, l, r } = opts.replacements;
      const row = { id: ++OB_CALL_SEQ, tenant_id: t, contact_id: c, list_id: l,
        enrolled_at: new Date(), reserved_cents: Number(r) || 0, settled_at: null,
        charged_cents: null, duration_sec: null, outcome: null, summary: null, ghl_call_id: null };
      OB.calls.push(row);
      return [[{ id: row.id }], {}];
    }

    /* ── WALLET ─────────────────────────────────────────────────────────
     * Emulated faithfully, INCLUDING the conditional predicate on the
     * reserve. A fake that always succeeds would let the atomicity test
     * pass while the real UPDATE had lost its `balance_cents >= :hold`.
     */
    if (/INSERT INTO lite_outbound_credit/.test(sql)) {
      const t = opts.replacements.t;
      if (!OB.wallet[t]) OB.wallet[t] = { balance_cents: 0, reserved_cents: 0,
        lifetime_topup_cents: 0, lifetime_spent_cents: 0 };
      return [[], {}];
    }
    if (/SELECT balance_cents, reserved_cents/.test(sql)) {
      const w = OB.wallet[opts.replacements.t] || { balance_cents: 0, reserved_cents: 0,
        lifetime_topup_cents: 0, lifetime_spent_cents: 0 };
      return [[Object.assign({}, w)], {}];
    }
    if (/UPDATE lite_outbound_credit/.test(sql)) {
      const rp = opts.replacements || {};
      const w = OB.wallet[rp.t] || (OB.wallet[rp.t] = { balance_cents: 0, reserved_cents: 0,
        lifetime_topup_cents: 0, lifetime_spent_cents: 0 });
      if (/balance_cents - :hold/.test(sql)) {
        // HONOUR THE PREDICATE AS WRITTEN. Applying the condition in
        // JavaScript regardless of the SQL made the harness enforce
        // atomicity the code had lost: deleting `balance_cents >= :hold`
        // from the real UPDATE changed nothing here, so the one thing
        // stopping two dials spending the same dollar was untested.
        const guarded = /balance_cents\s*>=\s*:hold/.test(sql);
        if (guarded && w.balance_cents < rp.hold) return [[], {}];
        w.balance_cents -= rp.hold; w.reserved_cents += rp.hold;
        return [[{ balance_cents: w.balance_cents }], {}];
      }
      if (/lifetime_topup_cents \+ :c/.test(sql)) {
        w.balance_cents += rp.c; w.lifetime_topup_cents += rp.c; return [[], {}];
      }
      if (/reserved_cents - :c/.test(sql)) {
        w.balance_cents += rp.c; w.reserved_cents = Math.max(0, w.reserved_cents - rp.c); return [[], {}];
      }
      if (/reserved_cents - :held/.test(sql)) {
        // The overrun is a DEBIT, and the balance is allowed to go negative
        // here: the cost is already incurred by settlement time. A fake that
        // ignored `:over` hid exactly the loss the charge-in-full fix closes.
        w.reserved_cents = Math.max(0, w.reserved_cents - rp.held);
        w.balance_cents += rp.back - (Number(rp.over) || 0);
        w.lifetime_spent_cents += rp.c; return [[], {}];
      }
      return [[], {}];
    }
    if (/SELECT id, reserved_cents FROM lite_outbound_calls/.test(sql)) {
      const onlyOpen = /settled_at IS NULL/.test(sql);     // as written, not assumed
      const c = OB.calls.find((x) => x.id === opts.replacements.id
        && x.tenant_id === opts.replacements.t && (!onlyOpen || !x.settled_at));
      return [c ? [{ id: c.id, reserved_cents: c.reserved_cents }] : [], {}];
    }
    if (/UPDATE lite_outbound_calls/.test(sql) && /settled_at = NOW\(\)/.test(sql) && opts.replacements.id) {
      const rp = opts.replacements;
      const onlyOpen = /settled_at IS NULL/.test(sql);
      const c = OB.calls.find((x) => x.id === rp.id && x.tenant_id === rp.t
        && (!onlyOpen || !x.settled_at));
      if (!c) return [[], {}];
      c.settled_at = new Date(); c.charged_cents = rp.c; c.duration_sec = rp.d;
      if (rp.o) c.outcome = rp.o; if (rp.s) c.summary = rp.s; if (rp.g) c.ghl_call_id = rp.g;
      return [[{ id: c.id }], {}];
    }
    if (/SELECT oc\.id, oc\.enrolled_at/.test(sql)) {
      const rp = opts.replacements;
      const rows = OB.calls
        .filter((x) => x.tenant_id === rp.t && (rp.l == null || x.list_id === rp.l))
        .sort((a, b) => b.enrolled_at - a.enrolled_at)
        .slice(0, rp.n)
        .map((x) => {
          const c = OB.contacts.find((y) => y.id === x.contact_id) || {};
          return Object.assign({}, x, { contact_name: c.contact_name || null,
            company: c.company || null, phone: c.phone || null });
        });
      return [rows, {}];
    }
    if (/COUNT\(\*\) FILTER \(WHERE settled_at IS NOT NULL/.test(sql)) {
      const rp = opts.replacements;
      const mine = OB.calls.filter((x) => x.tenant_id === rp.t && (rp.l == null || x.list_id === rp.l));
      const settled = mine.filter((x) => x.settled_at);
      return [[{ attempted: mine.length,
        connected: settled.filter((x) => (x.duration_sec || 0) > 0).length,
        total_sec: settled.reduce((a, x) => a + (x.duration_sec || 0), 0),
        spent_cents: settled.reduce((a, x) => a + (x.charged_cents || 0), 0),
        in_progress: mine.filter((x) => !x.settled_at).length }], {}];
    }
    if (/FROM lite_outbound_calls oc/.test(sql) && /ghl_contact_id = :gc/.test(sql)) {
      const gc = String(opts.replacements.gc);
      // HONOUR THE TENANT PREDICATE AS WRITTEN. Filtering only on the contact
      // id here — which the first harness did — reproduced the production bug
      // inside the test, so the cross-tenant settle passed the suite.
      const scoped = /oc\.tenant_id = :t/.test(sql);
      const tid = opts.replacements.t;
      const hits = OB.calls.filter((x) => {
        if (scoped && x.tenant_id !== tid) return false;
        const ct = OB.contacts.find((c) => c.id === x.contact_id);
        return ct && String(ct.ghl_contact_id) === gc;
      });
      if (/settled_at IS NULL/.test(sql)) {
        const open = hits.filter((x) => !x.settled_at).sort((a, b) => a.enrolled_at - b.enrolled_at);
        return [open.length ? [{ id: open[0].id, tenant_id: open[0].tenant_id }] : [], {}];
      }
      return [hits.length ? [{ '?column?': 1 }] : [], {}];
    }
    if (/UPDATE lite_tenants SET outbound_state/.test(sql)) {
      const rp = opts.replacements;
      const t = M.Tenant._rows.find((x) => x.id === rp.t);
      if (!t || !rp.froms.includes(t.outbound_state || 'off')) return [[], {}];
      t.outbound_state = rp.to;
      for (const k of Object.keys(rp)) if (!['t', 'to', 'froms'].includes(k)) t[k] = rp[k];
      return [[{ id: t.id, outbound_state: t.outbound_state }], {}];
    }
    if (/FROM lite_broadcasts/.test(sql) && /SELECT id FROM lite_broadcasts/.test(sql)) {
      const t = String(opts.replacements.t || '').toLowerCase();
      const cutoff = Date.now() - 60000;
      const hit = OB.bcasts.find((x) => x.title.toLowerCase() === t && x.at > cutoff);
      return [hit ? [{ id: hit.id }] : [], {}];
    }
    if (/INSERT INTO lite_broadcasts/.test(sql)) {
      const rp = opts.replacements;
      const row = { id: OB.bcasts.length + 1, title: rp.ti, body: rp.b,
        recipients: rp.n, at: Date.now() };
      OB.bcasts.push(row);
      return [[{ id: row.id }], {}];
    }
    if (/SELECT id, title, body, recipients, created_at FROM lite_broadcasts/.test(sql)) {
      return [OB.bcasts.slice().reverse(), {}];
    }
    if (/SELECT id FROM lite_tenants ORDER BY id/.test(sql)) {
      return [M.Tenant._rows.map((r) => ({ id: r.id })), {}];
    }
    if (/INSERT INTO lite_notifications[\s\S]*SELECT id, 'announcement'/.test(sql)) {
      const rp = opts.replacements;
      for (const t2 of M.Tenant._rows) {
        OB.notifs.push({ tenant_id: t2.id, kind: 'announcement', title: rp.ti, body: rp.b, read_at: null });
      }
      return [[], {}];
    }
    // WHO THE FOUNDER IS. Without this branch ownerTenantId() reads null, the
    // owner notification is skipped, and every test about "the owner is told
    // to build the workflow" passes for the wrong reason — which is exactly
    // how a paying client ends up waiting for somebody who was never paged.
    if (/SELECT tenant_id FROM lite_users WHERE LOWER\(email\)/.test(sql)) {
      const e = String(opts.replacements.e || '').toLowerCase();
      const hit = M.User._rows.find((u) => String(u.email || '').toLowerCase() === e);
      return [hit ? [{ tenant_id: hit.tenant_id }] : [], {}];
    }
    // ── THE PAYMENT ROWS ────────────────────────────────────────────────
    // Backed for real because the default `[[], {}]` would make every claim
    // read as "nothing to apply" — so a broken applyPayment would look
    // idempotent, which is exactly the bug it must not have.
    if (/INSERT INTO lite_outbound_payments/.test(sql)) {
      const rp = opts.replacements;
      OB.payments.push({ id: OB.payments.length + 1, tenant_id: rp.t,
        kind: /'setup'/.test(sql) ? 'setup' : 'credit', amount_cents: rp.a,
        stripe_session_id: rp.s, status: 'open', stripe_event_id: null });
      return [[], {}];
    }
    if (/UPDATE lite_outbound_payments/.test(sql) && /status = 'paid'/.test(sql)) {
      const rp = opts.replacements;
      // HONOUR EVERY PREDICATE AS WRITTEN. Dropping the tenant one here would
      // let a forged session id apply to somebody else's row and the suite
      // would never notice; dropping `status <> 'paid'` would make a replay
      // credit a wallet twice inside a test that claims it cannot.
      // READ THE PREDICATES OFF THE SQL, never hardcode them. Spelling them
      // out here made the harness more permissive than Postgres: deleting
      // `AND tenant_id = :t` or `AND status <> 'paid'` from the service left
      // the suite green, so the two tests guarding a cross-tenant apply and a
      // replayed credit both passed without being able to fail. Sixth time
      // this trap has been hit in this file.
      const scoped = /tenant_id = :t/.test(sql);
      const onlyUnpaid = /status <> 'paid'/.test(sql);
      const row = OB.payments.find((x) => x.stripe_session_id === rp.s
        && (!scoped || x.tenant_id === rp.t)
        && (!onlyUnpaid || x.status !== 'paid'));
      if (!row) return [[], {}];
      // The unique index on the event id is what stops one Stripe event
      // being applied through two rows; the fake enforces it too.
      if (rp.e && OB.payments.some((x) => x.stripe_event_id === rp.e)) {
        const err = new Error('duplicate key value violates unique constraint "uq_lite_ob_pay_event"');
        throw err;
      }
      row.status = 'paid'; row.confirmed_at = new Date();
      if (rp.e) row.stripe_event_id = rp.e;
      return [[{ id: row.id, kind: row.kind, amount_cents: row.amount_cents }], {}];
    }
    if (/SELECT DISTINCT tenant_id FROM lite_outbound_payments/.test(sql)) {
      const rp = opts.replacements || {};
      const scoped = /tenant_id = :t/.test(sql);
      const ids = [...new Set(OB.payments
        .filter((x) => x.status === 'open' && x.stripe_session_id
          && (!scoped || x.tenant_id === rp.t))
        .map((x) => x.tenant_id))].sort((a, b) => a - b);
      return [ids.map((tenant_id) => ({ tenant_id })), {}];
    }
    if (/SELECT stripe_session_id FROM lite_outbound_payments/.test(sql)) {
      const rp = opts.replacements;
      const onlySetup = /kind = 'setup'/.test(sql);
      const scoped2 = /tenant_id = :t/.test(sql);
      const rows = OB.payments.filter((x) => (!scoped2 || x.tenant_id === rp.t)
        && x.status === 'open'
        && x.stripe_session_id && (!onlySetup || x.kind === 'setup'))
        .sort((a, b) => b.id - a.id).slice(0, 5);
      return [rows.map((x) => ({ stripe_session_id: x.stripe_session_id })), {}];
    }
    if (/COUNT\(\*\)::int AS n FROM lite_notifications/.test(sql)) {
      const t = opts.replacements.t;
      return [[{ n: OB.notifs.filter((x) => x.tenant_id === t && !x.read_at).length }], {}];
    }
    if (/INSERT INTO lite_notifications/.test(sql)) {
      OB.notifs.push({ tenant_id: opts.replacements.t, kind: opts.replacements.k,
        title: opts.replacements.ti, body: opts.replacements.b });
      return [[], {}];
    }
    return [[], {}];
  },
};
// In-memory stand-ins for the outbound tables the dialer reads and writes.
const OB = { lists: [], contacts: [], calls: [], suppressions: [], wallet: {}, payments: [], notifs: [], bcasts: [] };
let OB_CALL_SEQ = 0;
require.cache[require.resolve(path.join(ROOT, 'src/models.js'))] = { id: 'models', filename: 'models', loaded: true, exports: M };

// The mirror now texts the owner, so the suite has to own the transport: a
// real send would reach Twilio, cost money and drag the toll-fraud guard into
// a test about webhooks.
const SENT = [];
let smsFails = false;
require.cache[require.resolve(path.join(ROOT, 'src/services/sms.js'))] = {
  id: 'sms', filename: 'sms', loaded: true,
  exports: {
    send: async ({ from, to, body }) => {
      if (smsFails) throw new Error('carrier unavailable');
      SENT.push({ from, to, body }); return { segments: 1 };
    },
    segments: () => 1,
    sendDemoConfirm: async () => ({ segments: 0 }),
  },
};

const secretbox = require(path.join(ROOT, 'src/services/secretbox'));
const accounts = require(path.join(ROOT, 'src/services/ghlAccounts'));
const provisioning = require(path.join(ROOT, 'src/services/provisioning'));
const GhlProvider = require(path.join(ROOT, 'src/telephony/ghlProvider'));
const { getNumberProvider, getProvider } = require(path.join(ROOT, 'src/telephony'));

/* ── fake HighLevel ─────────────────────────────────────────────────────── */
let reqs = [];
let scenario = {};
let boughtNumbers = 0;
let eventSeq = 0;
const EVENTS = {};   // event id -> the calendar it was created on
const OWNED = [];    // numbers the fake sub-account has actually bought
// A calendar created by POST /calendars/ really does read back as `{}` — an
// EMPTY OBJECT, not an array — which is why it offers no slots at all.
let CAL_HOURS = {};
global.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const body = opts.body ? JSON.parse(opts.body) : null;
  reqs.push({ method: opts.method || 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams),
              body, auth: opts.headers && opts.headers.Authorization,
              version: opts.headers && opts.headers.Version });
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const p = u.pathname;
  if (p.startsWith('/locations/') && (opts.method || 'GET') === 'GET') {
    if (scenario.locationMismatch) return json(200, { id: 'SOME-OTHER-LOCATION' });
    return json(200, { id: p.split('/')[2] });
  }
  if (p === '/locations/' && opts.method === 'POST') return json(201, { id: 'LOC-AGENCY-NEW' });
  if (p.endsWith('/available')) {
    if (scenario.noNumbers) return json(200, { numbers: [] });
    if (u.searchParams.get('firstPart') && scenario.noAreaCode) return json(200, { numbers: [] });
    if (u.searchParams.get('firstPart') && scenario.wrongAreaResults) {
      return json(200, { numbers: [{ phoneNumber: '+17344475009' }] });   // a prefix hint that missed
    }
    const fp = u.searchParams.get('firstPart');
    // The fake behaves like the real API: only the bare area code matches.
    if (fp && fp !== '813') return json(200, { numbers: [] });
    return json(200, { numbers: [{ phoneNumber: '+18135550101' }, { phoneNumber: '+18135550102' }] });
  }
  if (p.endsWith('/purchase')) {
    if (scenario.purchaseFails) return json(400, { message: 'purchase refused' });
    boughtNumbers++;
    if (body && body.phoneNumber && !OWNED.includes(body.phoneNumber)) OWNED.push(body.phoneNumber);
    return json(201, { ok: true });
  }
  if (/^\/calendars\/(?!events$)[^/]+$/.test(p) && (opts.method || 'GET') === 'GET') {
    if (scenario.calRead === 'fail') return json(500, { message: 'calendar read down' });
    return json(200, { calendar: { id: p.split('/').pop(), name: 'Cal',
      openHours: scenario.calOpenHours !== undefined ? scenario.calOpenHours : CAL_HOURS } });
  }
  if (/^\/calendars\/[^/]+$/.test(p) && opts.method === 'PUT') {
    if (scenario.calWriteFails) return json(422, { message: 'calendar update refused' });
    // THE FAKE REFUSES A MULTI-DAY ENTRY, exactly as the live API does:
    // daysOfTheWeek takes ONE day. The error reads like a complaint about the
    // value and is really about the count, so the suite must reproduce it or
    // the obvious grouping optimisation passes here and 422s in production.
    for (const g of (body && body.openHours) || []) {
      if (!Array.isArray(g.daysOfTheWeek) || g.daysOfTheWeek.length !== 1
          || !Number.isInteger(g.daysOfTheWeek[0]) || g.daysOfTheWeek[0] < 0 || g.daysOfTheWeek[0] > 6) {
        return json(422, { message: 'openHours.0.must be a valid day of week' });
      }
    }
    // Store what was written so the read-back sees it, and so a test can assert
    // the exact payload HighLevel was given.
    CAL_HOURS = body && body.openHours ? body.openHours : CAL_HOURS;
    return json(200, { succeeded: true });
  }
  if (p === '/calendars/' && opts.method === 'POST') {
    if (scenario.calendarFails) return json(500, { message: 'calendar service down' });
    return json(201, { id: `CAL-${body.locationId}` });
  }
  if (p === '/voice-ai/agents' && (opts.method || 'GET') === 'GET') {
    // The pilot template really does carry NO end-of-call workflow today,
    // which is why messages never reach us. The fake keeps one by default —
    // that is the behaviour provisioning is supposed to have — and a test
    // opts in to the empty case.
    const agents = [{ id: 'tpl1', agentPrompt: 'TEMPLATE PROMPT', voiceId: 'voice-xyz',
      language: 'en-US', callEndWorkflowIds: scenario.templateNoWorkflow ? [] : ['wf-after-call'],
      welcomeMessage: 'Template hello' }];
    // Live agents carry the line they answer. That is the ONLY route from a
    // call log to a tenant, because the log has no dialled number at all.
    if (scenario.agentRoster) agents.push(...scenario.agentRoster);
    return json(200, { agents });
  }
  if (/^\/voice-ai\/agents\/[^/]+$/.test(p) && opts.method === 'PATCH') return json(200, { id: p.split('/').pop() });
  if (p === '/voice-ai/agents' && opts.method === 'POST') {
    return scenario.agentFails ? json(500, { message: 'agent service down' }) : json(201, { id: 'agent-new-1' });
  }
  if (p === '/voice-ai/actions') return json(201, { id: 'act1' });
  // What the sub-account OWNS — distinct from what is purchasable, and empty
  // until something is actually bought, exactly like the real location.
  if (/^\/phone-system\/numbers\/location\/[^/]+$/.test(p) && (opts.method || 'GET') === 'GET') {
    if (scenario.ownsNothing) return json(200, { status: 'success', data: { numbers: [], total: 0 } });
    const list = scenario.ownedOverride || OWNED;
    return json(200, { status: 'success', data: { numbers: list.map((n) => ({ phoneNumber: n })), total: list.length } });
  }
  // The Voice AI call log: what HighLevel says happened, which is what the
  // poller reads so a message never depends on a webhook action being wired.
  if (p === '/calendars/events' && (opts.method || 'GET') === 'GET') {
    if (scenario.eventsFail) return json(scenario.eventsStatus || 500, { message: 'calendar events down' });
    if (Array.isArray(scenario.failCalendars)
        && scenario.failCalendars.includes(u.searchParams.get('calendarId'))) {
      return json(500, { message: 'calendar unavailable for this sub-account' });
    }
    // THE FAKE PUNISHES AN ISO WINDOW, exactly as the live API does: measured
    // 2026-09-27, the same request with ISO timestamps answers 200 {events:[]}
    // — indistinguishable from an empty calendar. Without this the suite would
    // pass against the bug, which is how the call-log window shipped wrong.
    const sd = u.searchParams.get('startTime') || '';
    if (!/^\d+$/.test(sd)) return json(200, { events: [] });
    // calendarId is required — the live API answers 422 without one.
    const cid = u.searchParams.get('calendarId');
    if (!cid) return json(422, { message: 'Either of userId, calendarId or groupId is required' });
    return json(200, { events: (scenario.events || []).filter((e) => !e.calendarId || e.calendarId === cid
      || scenario.leakForeignEvent) });
  }
  if (/^\/contacts\/[^/]+$/.test(p) && (opts.method || 'GET') === 'GET') {
    if (scenario.contactReadFails) return json(500, { message: 'contact service down' });
    return json(200, { contact: { id: p.split('/').pop(), firstName: 'Lina', lastName: 'Stagg',
      phone: scenario.contactPhone !== undefined ? scenario.contactPhone : '+18134811925' } });
  }
  if (p === '/voice-ai/dashboard/call-logs' && (opts.method || 'GET') === 'GET') {
    if (scenario.callLogsFail) return json(scenario.callLogsStatus || 500, { message: 'call logs down' });
    // THE FAKE PUNISHES SECONDS, exactly as the live API does: a window sent in
    // unix seconds answers 200 with an empty list, which reads as "nobody
    // called". Without this the suite passed against the bug.
    const sd = Number(u.searchParams.get('startDate'));
    if (sd && sd < 1e11) return json(200, { callLogs: [], totalRecords: 0 });
    return json(200, { callLogs: scenario.callLogs || [], totalRecords: (scenario.callLogs || []).length });
  }
  if (p === '/conversations/messages' && opts.method === 'POST') {
    if (scenario.smsFails) return json(422, { message: 'message rejected' });
    return json(201, { messageId: 'MSG-1', conversationId: 'CONV-1' });
  }
  if (p === '/contacts/upsert' && opts.method === 'POST') {
    if (scenario.contactFails) return json(422, { message: 'contact rejected' });
    if (scenario.contactFlaky && !scenario._cFlaky) { scenario._cFlaky = true; return json(503, { message: 'busy' }); }
    return json(201, { new: true, contact: { id: `CT-${body.phone || body.email || 'x'}` } });
  }
  if (p === '/calendars/events/appointments' && opts.method === 'POST') {
    if (scenario.apptVersionError && (opts.headers || {}).Version === 'v3') {
      // DELIBERATELY SAYS NOTHING ABOUT VERSIONS. The first implementation fell
      // back only when HighLevel's prose contained the word, which is a promise
      // about their wording — a real sub-account answers `404 Cannot POST ...`
      // or a bare 400, and every booking would have died.
      return json(scenario.apptVersionStatus || 400, { message: 'Bad Request' });
    }
    if (scenario.apptRefused) return json(403, { message: 'not allowed on this calendar' });
    if (scenario.apptFlaky && !scenario._flakyUsed) { scenario._flakyUsed = true; return json(503, { message: 'upstream busy' }); }
    const id = `EVT-${++eventSeq}`;
    EVENTS[id] = body.calendarId;
    return json(201, { id });
  }
  if (p.startsWith('/calendars/events/appointments/') && (opts.method || 'GET') === 'GET') {
    if (scenario.readEventFails) return json(500, { message: 'event service down' });
    const id = p.split('/').pop();
    if (scenario.foreignCalendar) return json(200, { appointment: { id, calendarId: scenario.foreignCalendar } });
    if (!EVENTS[id]) return json(404, { message: 'not found' });
    return json(200, { appointment: { id, calendarId: EVENTS[id] } });
  }
  if (p.startsWith('/calendars/events/appointments/') && opts.method === 'PUT') {
    if (scenario.cancelFails) return json(500, { message: 'cancel service down' });
    return json(200, { succeeded: true });
  }
  return json(404, { message: 'not found' });
};

const tenantSeed = (over = {}) => ({
  business_name: 'Sunny Dental', owner_name: 'Ana Ruiz', owner_phone: '+14085551234',
  country: 'US', locale: 'en', timezone: 'America/New_York', provisioning_state: 'pending', ...over,
});

(async () => {
  console.log('RinglyPro Lite HighLevel provisioning SIT — zero keys, fake HighLevel, in-memory store\n');

  section('routing');
  await t('with the HighLevel token set, NEW numbers come from HighLevel', () => {
    assert.strictEqual(getNumberProvider().name, 'ghl');
  });
  await t('LITE_NUMBER_PROVIDER=twilio forces the old path', () => {
    process.env.LITE_NUMBER_PROVIDER = 'twilio';
    try { assert.notStrictEqual(getNumberProvider().name, 'ghl'); } finally { delete process.env.LITE_NUMBER_PROVIDER; }
  });
  await t('calls to EXISTING numbers keep the Twilio provider', () => {
    assert.notStrictEqual(getProvider().name, 'ghl');
  });

  section('secrets at rest');
  await t('a token round-trips through AES-256-GCM', () => {
    const sealed = secretbox.seal('pit-abc-123');
    assert.notStrictEqual(sealed, 'pit-abc-123');
    assert.strictEqual(secretbox.open(sealed), 'pit-abc-123');
  });
  await t('THE SEALED VALUE NEVER CONTAINS THE PLAINTEXT', () => {
    assert.ok(!secretbox.seal('pit-abc-123').includes('pit-abc'));
  });
  await t('describe() reports only that it is set — NO fragment of the token', () => {
    const d = secretbox.describe(secretbox.seal('pit-super-secret-xyz9'));
    assert.strictEqual(d.set, true);
    assert.strictEqual(d.hint, undefined, 'a last-4 hint is enough to confirm a guess');
    assert.ok(!JSON.stringify(d).includes('xyz9'));
  });
  await t('a rotated key is reported as undecryptable, never as absent', () => {
    const sealed = secretbox.seal('pit-abc-123');
    const old = process.env.LITE_SECRET_KEY;
    process.env.LITE_SECRET_KEY = 'a-completely-different-key-16+';
    try {
      assert.throws(() => secretbox.open(sealed), (e) => e.code === 'BAD_SECRET');
      assert.strictEqual(secretbox.describe(sealed).error, 'undecryptable');
    } finally { process.env.LITE_SECRET_KEY = old; }
  });

  section('the sub-account pool');
  await t('a token that does not belong to that sub-account is REFUSED', async () => {
    scenario = { locationMismatch: true };
    await assert.rejects(accounts.addToPool({ location_id: 'LOC-A', token: 'pit-a' }),
      (e) => e.code === 'TOKEN_LOCATION_MISMATCH');
    scenario = {};
  });
  await t('the owner stocks the pool by hand and the token is verified first', async () => {
    reqs = [];
    const a = await accounts.addToPool({ location_id: 'LOC-A', token: 'pit-a', label: 'pilot' });
    assert.strictEqual(a.status, 'free');
    assert.ok(reqs.some((r) => r.path === '/locations/LOC-A'), 'the token was stored without being checked');
  });
  await t('the stored token is encrypted, not plain', async () => {
    const row = await M.GhlAccount.findOne({ where: { location_id: 'LOC-A' } });
    assert.ok(!String(row.token_enc).includes('pit-a'));
  });
  await t('status() never returns a token', async () => {
    const s = await accounts.status();
    assert.ok(!JSON.stringify(s).includes('pit-a'));
    assert.strictEqual(s.free, 1);
  });
  await t('ON $97 AND $297 THE POOL IS NOT SELF-FILLING, AND SAYS SO', async () => {
    const s = await accounts.status();
    assert.strictEqual(s.auto_create, false);
    assert.ok(/by hand/i.test(s.plan_note));
  });
  await t('A CLAIM IS EXCLUSIVE — the second tenant does not get the same sub-account', async () => {
    const one = await accounts.claim(901);
    assert.strictEqual(one.location_id, 'LOC-A');
    await assert.rejects(accounts.claim(902), (e) => e.code === 'POOL_EMPTY');
  });
  await t('a tenant that already holds one gets the SAME one back, not a second', async () => {
    const again = await accounts.claim(901);
    assert.strictEqual(again.location_id, 'LOC-A');
    assert.strictEqual(again.fresh, false);
  });
  await t('automated creation is refused without the agency plan, and names it', async () => {
    await assert.rejects(accounts.agencyCreate({ name: 'x' }),
      (e) => e.code === 'NO_AGENCY_API' && /497/.test(e.message));
  });

  section('provisioning end to end');
  let tenant;
  await t('a paid signup gets a sub-account, a number, a calendar and an agent', async () => {
    await accounts.addToPool({ location_id: 'LOC-B', token: 'pit-b' });
    tenant = await M.Tenant.create(tenantSeed());
    reqs = []; boughtNumbers = 0; scenario = {};
    const out = await provisioning.provision(tenant);
    assert.strictEqual(out.state, 'ready');
    assert.strictEqual(out.number, '+18135550101');
    assert.ok(out.agent_ready && out.calendar_ready);
  });
  await t('EVERY CALL CARRIED THE TENANT\'S OWN LOCATION, NEVER THE ENV ONE', () => {
    const touched = reqs.filter((r) => /LOC-/.test(JSON.stringify({ p: r.path, b: r.body, q: r.query })));
    assert.ok(touched.length > 0);
    assert.ok(!touched.some((r) => JSON.stringify(r).includes('LOC-ENV')), 'an env location leaked into a tenant call');
    assert.ok(touched.some((r) => JSON.stringify(r).includes('LOC-B')));
  });
  await t('every call used the TENANT\'S token, not the env fallback', () => {
    assert.ok(reqs.every((r) => r.auth === 'Bearer pit-b'), 'a request used the wrong tenant\'s credentials');
  });
  await t('THE AGENT BOOKS INTO THIS TENANT\'S OWN CALENDAR', () => {
    const act = reqs.find((r) => r.path === '/voice-ai/actions' && r.body.actionType === 'APPOINTMENT_BOOKING');
    assert.ok(act, 'no booking action was added');
    assert.strictEqual(act.body.actionParameters.calendarId, 'CAL-LOC-B');
  });
  await t('the agent is COPIED from the template: voice and end-of-call workflows carry over', () => {
    const a = reqs.find((r) => r.path === '/voice-ai/agents' && r.method === 'POST').body;
    assert.strictEqual(a.voiceId, 'voice-xyz');
    assert.deepStrictEqual(a.callEndWorkflowIds, ['wf-after-call']);
    assert.ok(a.agentPrompt.startsWith('TEMPLATE PROMPT'));
    assert.ok(a.agentPrompt.includes('Sunny Dental'));
    assert.strictEqual(a.inboundNumber, '+18135550101');
  });
  await t('THE BOOKING ACTION USES THE VALUES HIGHLEVEL ACCEPTS', () => {
    // Asserted on the request that was actually SENT, not on the source text —
    // the values are env-overridable now and a grep would only prove what the
    // default literal says, not what HighLevel receives.
    //
    // Measured against the live API: 2/2/3 and 3/3/3 are accepted; 14/1/4 (what
    // this once sent), 5, 7, 10 and 14 days and 4 and 5 slots are all refused
    // 422, which is why no agent ever got a booking action at all.
    const act = reqs.find((r) => r.path === '/voice-ai/actions' && r.body
      && r.body.actionType === 'APPOINTMENT_BOOKING');
    assert.ok(act, 'no booking action was sent');
    const p = act.body.actionParameters;
    assert.ok(p.daysOfOfferingDates >= 1 && p.daysOfOfferingDates <= 3,
      `daysOfOfferingDates ${p.daysOfOfferingDates} is outside the set HighLevel accepts`);
    assert.ok(p.slotsPerDay >= 1 && p.slotsPerDay <= 3,
      `slotsPerDay ${p.slotsPerDay} is refused by HighLevel (4 and 5 are 422)`);
    assert.ok(Number.isInteger(p.hoursBetweenSlots) && p.hoursBetweenSlots >= 1,
      'hoursBetweenSlots must be a positive integer');
  });

  await t('the owner gets the SHORT list they asked for by default', () => {
    // Two days, two times. A caller cannot hold six options in their head, and
    // the spoken list is what the owner complained about.
    const act = reqs.find((r) => r.path === '/voice-ai/actions' && r.body
      && r.body.actionType === 'APPOINTMENT_BOOKING');
    assert.strictEqual(act.body.actionParameters.daysOfOfferingDates, 2);
    assert.strictEqual(act.body.actionParameters.slotsPerDay, 2);
  });
  await t('VOICE AI ACTIONS ARE SENT WITH Version v3', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/telephony/ghlProvider.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const calls = src.split("'/voice-ai/actions'").slice(1);
    assert.ok(calls.length >= 2, 'expected both action creates');
    for (const c of calls) assert.ok(/version: ACTION_VERSION/.test(c.slice(0, 160)),
      'an action call lost its Version v3 — HighLevel 422s on the default');
  });
  await t('a transfer action carries the two fields HighLevel requires', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/telephony/ghlProvider.js'), 'utf8');
    assert.ok(/triggerMessage:/.test(src) && /hearWhisperMessage:/.test(src),
      'without these HighLevel refuses the transfer action');
  });
  await t('the agent is told never to invent prices or hours', () => {
    assert.ok(/Never quote a price, hour or policy/.test(GhlProvider.clientContext(tenantSeed())));
  });
  await t('the purchase carries a per-tenant fingerprint', () => {
    const buy = reqs.find((r) => r.path.endsWith('/purchase'));
    assert.strictEqual(buy.body.fingerprintId, `ringlypro-lite-tenant-${tenant.id}`);
  });
  await t('A SECOND RUN BUYS NOTHING AND CREATES NOTHING', async () => {
    reqs = []; boughtNumbers = 0;
    const out = await provisioning.provision(tenant);
    assert.strictEqual(out.already, true);
    assert.strictEqual(boughtNumbers, 0);
    assert.strictEqual(reqs.length, 0);
  });
  await t('the client view names the number and never the platform underneath', async () => {
    const v = await provisioning.clientView(tenant);
    assert.strictEqual(v.number, '+18135550101');
    assert.strictEqual(v.assistant_ready, true);
    const s = JSON.stringify(v).toLowerCase();
    assert.ok(!s.includes('ghl') && !s.includes('highlevel') && !s.includes('location'));
  });

  section('provisioning fails safely and resumes');
  await t('IF THE AGENT FAILS THE NUMBER IS KEPT, AND THE RETRY DOES NOT RE-BUY', async () => {
    await accounts.addToPool({ location_id: 'LOC-C', token: 'pit-c' });
    const t2 = await M.Tenant.create(tenantSeed());
    scenario = { agentFails: true }; boughtNumbers = 0;
    await assert.rejects(provisioning.provision(t2));
    assert.strictEqual(boughtNumbers, 1, 'the number was not bought exactly once');
    const num = await M.Number.findOne({ where: { tenant_id: t2.id } });
    assert.ok(num, 'the bought number was thrown away');
    assert.strictEqual(t2.provisioning_state, 'calendar', 'the state does not say where it stopped');

    scenario = {}; boughtNumbers = 0;
    const out = await provisioning.provision(t2);
    assert.strictEqual(out.state, 'ready');
    assert.strictEqual(boughtNumbers, 0, 'the resume bought a second number');
  });
  await t('a failed calendar stops before the agent and records the error', async () => {
    await accounts.addToPool({ location_id: 'LOC-D', token: 'pit-d' });
    const t3 = await M.Tenant.create(tenantSeed());
    scenario = { calendarFails: true }; reqs = [];
    await assert.rejects(provisioning.provision(t3));
    assert.ok(!reqs.some((r) => r.path === '/voice-ai/agents' && r.method === 'POST'), 'an agent was built with no calendar');
    assert.ok(t3.provisioning_error && t3.provisioning_error.length > 0);
    scenario = {};
  });
  await t('an empty pool fails the signup honestly, and buys nothing', async () => {
    const t4 = await M.Tenant.create(tenantSeed());
    boughtNumbers = 0;
    await assert.rejects(provisioning.provision(t4), (e) => e.code === 'POOL_EMPTY');
    assert.strictEqual(boughtNumbers, 0);
  });

  section('the toll-fraud gate still lives in the provider');
  await t('A PREMIUM TRANSFER NUMBER IS NEVER GIVEN TO THE AGENT', async () => {
    await accounts.addToPool({ location_id: 'LOC-E', token: 'pit-e' });
    const t5 = await M.Tenant.create(tenantSeed({ owner_phone: null, transfer_number: '+237656876200' }));
    reqs = []; scenario = {};
    await provisioning.provision(t5);
    const transfer = reqs.find((r) => r.path === '/voice-ai/actions' && r.body.actionType === 'CALL_TRANSFER');
    assert.ok(!transfer, 'a Cameroon number reached the agent');
  });
  await t('an allowed owner number IS added, normalised to E.164', async () => {
    await accounts.addToPool({ location_id: 'LOC-F', token: 'pit-f' });
    const t6 = await M.Tenant.create(tenantSeed({ owner_phone: '(408) 555-1234' }));
    reqs = [];
    await provisioning.provision(t6);
    const transfer = reqs.find((r) => r.path === '/voice-ai/actions' && r.body.actionType === 'CALL_TRANSFER');
    assert.ok(transfer, 'no transfer action');
    assert.strictEqual(transfer.body.actionParameters.transferToValue, '+14085551234');
  });

  section('the token never leaks');
  await t('the token is sent ONLY as the Authorization header', () => {
    for (const r of reqs) {
      assert.ok(String(r.auth || '').startsWith('Bearer '));
      assert.ok(!JSON.stringify(r.body || {}).includes('pit-'), 'a token leaked into a body');
      assert.ok(!JSON.stringify(r.query || {}).includes('pit-'), 'a token leaked into a query string');
    }
  });
  await t('an error never carries the token', async () => {
    scenario = { purchaseFails: true };
    await accounts.addToPool({ location_id: 'LOC-G', token: 'pit-g' });
    const t7 = await M.Tenant.create(tenantSeed());
    try { await provisioning.provision(t7); } catch (e) { assert.ok(!String(e.message).includes('pit-')); }
    scenario = {};
  });

  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  section('the guards a second entry point must not skip');
  await t('ONE GUARD SERVES BOTH /provision-number AND /resume', () => {
    const src = strip(read('src/routes/onboarding.js'));
    assert.ok(/function mayProvision/.test(src), 'the guards are still inline in one route');
    const calls = (src.match(/mayProvision\(tenant\)/g) || []).length;
    assert.ok(calls >= 2, `only ${calls} caller(s) run the guard; /resume could buy a number with no card and no cap`);
  });
  await t('the purchase cap, the card gate, the CO gate and the lock are all in it', () => {
    const src = strip(read('src/routes/onboarding.js'));
    const guard = src.slice(src.indexOf('function mayProvision'), src.indexOf('router.get('));
    for (const must of ['canProvisionNumber', 'LITE_CO_NUMBERS_ENABLED', 'lockState', 'MAX_NUMBERS_PER_DAY']) {
      assert.ok(guard.includes(must), `${must} is not in the shared guard`);
    }
  });
  await t('TWO CONCURRENT RUNS FOR ONE TENANT DO NOT BOTH PROVISION', async () => {
    await accounts.addToPool({ location_id: 'LOC-RACE1', token: 'pit-r1' });
    await accounts.addToPool({ location_id: 'LOC-RACE2', token: 'pit-r2' });
    const t8 = await M.Tenant.create(tenantSeed());
    scenario = {}; boughtNumbers = 0;
    const [a, b] = await Promise.allSettled([provisioning.provision(t8), provisioning.provision(t8)]);
    const ok = [a, b].filter((r) => r.status === 'fulfilled').length;
    assert.strictEqual(ok, 1, 'both concurrent runs provisioned; two numbers and two sub-accounts burned');
    assert.strictEqual(boughtNumbers, 1);
    const refused = [a, b].find((r) => r.status === 'rejected');
    assert.strictEqual(refused.reason.code, 'ALREADY_RUNNING');
  });

  section('structural promises a runtime test cannot see');
  await t('provisioning reads credentials from the tenant, never from env directly', () => {
    const src = strip(read('src/services/provisioning.js'));
    assert.ok(!/process\.env\.LITE_GHL_(TOKEN|LOCATION_ID)/.test(src));
    assert.ok(/credsFor/.test(src));
  });
  await t('the claim is an atomic UPDATE, not a read-then-write', () => {
    const src = read('src/services/ghlAccounts.js');
    assert.ok(/UPDATE lite_ghl_accounts[\s\S]*FOR UPDATE SKIP LOCKED/.test(src));
  });
  await t('the provider is still the only file that reaches a telephony API', () => {
    const src = strip(read('src/services/provisioning.js'));
    assert.ok(!/\/phone-system\/numbers/.test(src), 'provisioning buys a number directly');
  });
  await t('the mirror fails shut with no secret configured', () => {
    const src = strip(read('src/routes/webhooks-ghl.js'));
    assert.ok(/no_secret_configured[\s\S]{0,300}503/.test(src), 'an unset secret does not hard-refuse');
  });
  await t('the mirror resolves the tenant from the dialled number, never the body', () => {
    // The lookup lives in callMirror.js now, because the poller needs it too.
    // Both the route and the writer must still refuse a tenant id from a
    // payload — that is the half of the rule an attacker would attack.
    const mir = strip(read('src/services/callMirror.js'));
    assert.ok(/NumberModel\.findOne\(\{ where: \{ did/.test(mir),
      'the writer no longer resolves the tenant from the dialled number');
    for (const f of ['src/routes/webhooks-ghl.js', 'src/services/callMirror.js', 'src/services/ghlCallLogs.js']) {
      assert.ok(!/body\.tenant_id|body\.tenantId/.test(strip(read(f))), `${f} trusts a tenant id from the payload`);
    }
  });

  section('shared sub-account mode (the $97 answer)');
  await t('ONE SHARED SUB-ACCOUNT SERVES EVERY TENANT, AND IS NEVER CONSUMED', async () => {
    // A fresh store for this section so the exclusive rows above cannot mask it.
    M.GhlAccount._rows.length = 0;
    await accounts.addToPool({ location_id: 'LOC-SHARED', token: 'pit-shared', shared: true });
    const s1 = await accounts.claim(9001);
    const s2 = await accounts.claim(9002);
    const s3 = await accounts.claim(9003);
    for (const r of [s1, s2, s3]) assert.strictEqual(r.location_id, 'LOC-SHARED');
    assert.ok(s1.shared && s2.shared);
    const row = await M.GhlAccount.findOne({ where: { location_id: 'LOC-SHARED' } });
    assert.strictEqual(row.status, 'shared', 'the shared row was consumed by a claim');
    assert.strictEqual(row.claimed_by_tenant, undefined, 'a shared row must not be pinned to one tenant');
  });
  await t('every tenant in the shared location still gets their OWN number, agent and calendar', async () => {
    scenario = {}; reqs = []; boughtNumbers = 0;
    const a = await M.Tenant.create(tenantSeed({ business_name: 'Clinic A' }));
    const b = await M.Tenant.create(tenantSeed({ business_name: 'Clinic B' }));
    await provisioning.provision(a);
    await provisioning.provision(b);
    assert.strictEqual(boughtNumbers, 2, 'the two clients did not get two numbers');
    assert.notStrictEqual(a.ghl_agent_id, undefined);
    assert.notStrictEqual(b.ghl_agent_id, undefined);
    // Two calendars were created, one per client, inside the one location.
    const cals = reqs.filter((r) => r.path === '/calendars/' && r.method === 'POST');
    assert.strictEqual(cals.length, 2, 'the two clients shared a calendar');
    assert.ok(cals[0].body.name !== cals[1].body.name);
    assert.strictEqual(a.ghl_location_id, b.ghl_location_id, 'shared mode should put both in one location');
  });
  await t('the owner report names the mode and what sharing actually costs', async () => {
    const st = await accounts.status();
    assert.strictEqual(st.mode, 'shared');
    assert.ok(/CONTACT list is shared/i.test(st.plan_note));
  });
  await t('ROTATING A SHARED TOKEN REACHES EVERY TENANT USING IT', async () => {
    M.GhlAccount._rows.length = 0;
    await accounts.addToPool({ location_id: 'LOC-ROT', token: 'pit-old', shared: true });
    const a = await M.Tenant.create(tenantSeed({ business_name: 'A', ghl_location_id: 'LOC-ROT',
      ghl_token_enc: secretbox.seal('pit-old') }));
    const b = await M.Tenant.create(tenantSeed({ business_name: 'B', ghl_location_id: 'LOC-ROT',
      ghl_token_enc: secretbox.seal('pit-old') }));
    await accounts.addToPool({ location_id: 'LOC-ROT', token: 'pit-new', shared: true });
    // credsFor prefers the tenant's own copy, so a stale copy means every
    // call, text and booking 401s while the pool reports the account healthy.
    assert.strictEqual(secretbox.open((await M.Tenant.findByPk(a.id)).ghl_token_enc), 'pit-new');
    assert.strictEqual(secretbox.open((await M.Tenant.findByPk(b.id)).ghl_token_enc), 'pit-new');
    M.GhlAccount._rows.length = 0;
  });
  await t('a sub-account already carrying a client is never re-scoped to shared', async () => {
    M.GhlAccount._rows.length = 0;
    await accounts.addToPool({ location_id: 'LOC-EX', token: 'pit-ex' });
    await accounts.claim(9100);
    await accounts.addToPool({ location_id: 'LOC-EX', token: 'pit-ex', shared: true });
    const row = await M.GhlAccount.findOne({ where: { location_id: 'LOC-EX' } });
    assert.strictEqual(row.status, 'claimed', 'a claimed exclusive row was opened up to strangers');
  });

  section('the post-call mirror');
  const express = require('express');
  const webhook = require(path.join(ROOT, 'src/routes/webhooks-ghl'));
  // Mirrors src/app.js: the small body cap is mounted BEFORE the router, which
  // is the only way a route-level limit actually applies.
  const appW = express();
  appW.use('/webhooks/ghl', express.json({ limit: '64kb' }));
  appW.use('/webhooks', webhook);
  const http = require('http');
  const srv = http.createServer(appW);
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (body, headers = {}) => fetchReal(`${base}/webhooks/ghl/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  // the fake fetch above owns global.fetch, so the webhook tests use a real one
  const fetchReal = require('node:http') && (async (url, opts) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: opts.method,
      headers: opts.headers }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, json: async () => JSON.parse(d || '{}') }));
    });
    req.on('error', reject); req.end(opts.body);
  }));

  const mirrorTenantNum = await M.Number.findOne({ where: { tenant_id: tenant.id } });

  await t('WITH NO SECRET CONFIGURED EVERY DELIVERY IS REFUSED, IN EVERY MODE', async () => {
    delete process.env.LITE_GHL_WEBHOOK_SECRET;
    for (const m of ['log', 'off', 'enforce']) {
      process.env.LITE_GHL_WEBHOOK_MODE = m;
      const before = await M.Call.count();
      const r = await post({ to: mirrorTenantNum.did, call_id: `nosecret-${m}`, summary: 'forged' });
      assert.strictEqual(r.status, 503, `mode=${m} accepted a delivery with no secret set`);
      assert.strictEqual(await M.Call.count(), before, `mode=${m} WROTE A ROW`);
    }
  });
  await t('THE PUBLIC HEALTH BODY IS NOT AN ORACLE FOR FORGERY', async () => {
    const r = await fetchReal(`${base}/webhooks/ghl/health`, { method: 'GET', headers: {} });
    const j = await r.json();
    assert.strictEqual(j.mode, undefined, 'the mode is disclosed publicly');
    assert.strictEqual(j.secret_configured, undefined, 'whether a secret is set is disclosed publicly');
  });

  process.env.LITE_GHL_WEBHOOK_SECRET = 'sit-webhook-secret';
  process.env.LITE_GHL_WEBHOOK_MODE = 'enforce';

  await t('AN UNAUTHENTICATED DELIVERY IS REFUSED UNDER enforce', async () => {
    const r = await post({ to: mirrorTenantNum.did, call_id: 'c-1' });
    assert.strictEqual(r.status, 403);
  });
  await t('THE SECRET IS NOT ACCEPTED IN A QUERY STRING', async () => {
    const r = await fetchReal(`${base}/webhooks/ghl/call?key=sit-webhook-secret`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: mirrorTenantNum.did, call_id: 'q-1' }) });
    assert.strictEqual(r.status, 403, 'a secret in the URL was honoured, and URLs end up in logs');
  });
  await t('an authenticated call is mirrored into OUR database', async () => {
    const r = await post({ to: mirrorTenantNum.did, from: '+14085559999', call_id: 'c-1',
      duration: 95, summary: 'Wants a cleaning next week', outcome: 'message taken' },
      { 'x-ringlypro-signature': 'sit-webhook-secret' });
    const j = await r.json();
    assert.strictEqual(r.status, 200, JSON.stringify(j)); assert.ok(j.call_id, JSON.stringify(j));
    const call = await M.Call.findOne({ where: { call_sid: 'ghl:c-1' } });
    assert.strictEqual(call.tenant_id, tenant.id);
    assert.strictEqual(call.disposition, 'message');
  });
  await t('A REPLAY DOES NOT DOUBLE-WRITE', async () => {
    const before = await M.Call.count();
    const r = await post({ to: mirrorTenantNum.did, call_id: 'c-1' }, { 'x-ringlypro-signature': 'sit-webhook-secret' });
    assert.strictEqual((await r.json()).replayed, true);
    assert.strictEqual(await M.Call.count(), before);
  });
  await t('an appointment booked in HighLevel appears in OUR appointments', async () => {
    await post({ to: mirrorTenantNum.did, call_id: 'c-2', outcome: 'appointment booked',
      appointment: { startTime: '2026-10-01T15:00:00Z' } }, { 'x-ringlypro-signature': 'sit-webhook-secret' });
    const appt = await M.Appointment.findOne({ where: { tenant_id: tenant.id } });
    assert.ok(appt, 'the booking was not mirrored');
  });
  await t('A NUMBER NOBODY OWNS IS DROPPED, NEVER GUESSED AT', async () => {
    const before = await M.Call.count();
    const r = await post({ to: '+19998887777', call_id: 'c-9' }, { 'x-ringlypro-signature': 'sit-webhook-secret' });
    assert.ok((await r.json()).ignored);
    assert.strictEqual(await M.Call.count(), before);
  });
  await t('a wrong secret is refused', async () => {
    const r = await post({ to: mirrorTenantNum.did, call_id: 'c-3' }, { 'x-ringlypro-signature': 'wrong' });
    assert.strictEqual(r.status, 403);
  });
  await t('A DELIVERY WITH NO CALL ID IS DROPPED — the dedupe key is never ours to mint', async () => {
    const before = await M.Call.count();
    const r = await post({ to: mirrorTenantNum.did, summary: 'no id' }, { 'x-ringlypro-signature': 'sit-webhook-secret' });
    assert.ok((await r.json()).ignored);
    assert.strictEqual(await M.Call.count(), before);
  });
  await t('A CALLBACK NUMBER IS AN E.164 NUMBER OR NOTHING — no script reaches the dashboard', async () => {
    await post({ to: mirrorTenantNum.did, call_id: 'xss-1',
      from: '+1"><img src=x onerror=alert(1)>', summary: 'hi' },
      { 'x-ringlypro-signature': 'sit-webhook-secret' });
    const call = await M.Call.findOne({ where: { call_sid: 'ghl:xss-1' } });
    assert.strictEqual(call.caller, null, 'attacker text was stored as a callback number');
    const msg = (await M.Message.findAll({})).find((x) => x.call_id === call.id);
    if (msg) assert.strictEqual(msg.callback_number, null);
  });
  await t('the transcript is stored ONCE, and capped', async () => {
    const big = 'x'.repeat(50000);
    await post({ to: mirrorTenantNum.did, call_id: 'big-1', transcript: big },
      { 'x-ringlypro-signature': 'sit-webhook-secret' });
    const call = await M.Call.findOne({ where: { call_sid: 'ghl:big-1' } });
    assert.ok(call.transcript.length <= 8000, 'the transcript cap did not apply');
    const turns = (await M.Transcript.findAll({})).filter((x) => x.call_sid === 'ghl:big-1');
    assert.strictEqual(turns.length, 0, 'the transcript was stored a second time per-turn');
  });
  await t('A MESSAGE TAKEN BY THE AI TEXTS THE OWNER', async () => {
    const owner = await M.Tenant.findByPk(tenant.id);
    await owner.update({ owner_phone: '+14085551234', locale: 'en' });
    SENT.length = 0;
    await post({ to: mirrorTenantNum.did, from: '+14085557777', call_id: 'alert-1',
      summary: 'Wants a quote for a roof', outcome: 'message taken', contact_name: 'Rosa' },
      { 'x-ringlypro-signature': 'sit-webhook-secret' });
    assert.strictEqual(SENT.length, 1, 'the owner was never told a message came in');
    assert.strictEqual(SENT[0].to, '+14085551234');
    assert.strictEqual(SENT[0].from, mirrorTenantNum.did, 'the alert did not come from the tenant\'s own line');
    assert.ok(/Rosa/.test(SENT[0].body) && /roof/.test(SENT[0].body));
  });

  await t('THE CALLER IS NEVER TEXTED ON THIS PATH — HighLevel owns that', async () => {
    SENT.length = 0;
    await post({ to: mirrorTenantNum.did, from: '+14085557778', call_id: 'alert-2',
      outcome: 'appointment booked', appointment: { startTime: '2027-03-02T15:00:00Z', id: 'EVT-ALERT-2' } },
      { 'x-ringlypro-signature': 'sit-webhook-secret' });
    assert.ok(!SENT.some((m) => m.to === '+14085557778'), 'the caller got a second confirmation from us');
    assert.strictEqual(SENT.length, 1, 'exactly one alert, to the owner');
  });

  await t('A CARRIER OUTAGE DOES NOT FAIL THE MIRROR — the rows are already written', async () => {
    smsFails = true;
    const r = await post({ to: mirrorTenantNum.did, from: '+14085557779', call_id: 'alert-3',
      summary: 'Call me back', outcome: 'message taken' }, { 'x-ringlypro-signature': 'sit-webhook-secret' });
    smsFails = false;
    assert.strictEqual(r.status, 200);
    const j = await r.json();
    assert.ok(j.call_id, 'the delivery failed because a text failed, so HighLevel will retry it');
    assert.ok(await M.Call.findOne({ where: { call_sid: 'ghl:alert-3' } }), 'the call row was lost');
  });

  await t('no owner mobile on file = no text, and no error', async () => {
    const owner = await M.Tenant.findByPk(tenant.id);
    await owner.update({ owner_phone: null });
    SENT.length = 0;
    const r = await post({ to: mirrorTenantNum.did, call_id: 'alert-4', summary: 'hi', outcome: 'message taken' },
      { 'x-ringlypro-signature': 'sit-webhook-secret' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(SENT.length, 0);
    await owner.update({ owner_phone: '+14085551234' });
  });

  await t('THE ROUTE IS RATE LIMITED', async () => {
    process.env.LITE_GHL_WEBHOOK_PER_MIN = '3';
    let throttled = false;
    for (let i = 0; i < 6; i++) {
      const r = await post({ to: mirrorTenantNum.did, call_id: `rl-${i}` }, { 'x-ringlypro-signature': 'sit-webhook-secret' });
      if (r.status === 429) throttled = true;
    }
    assert.ok(throttled, 'an unauthenticated-reachable route has no ceiling');
    delete process.env.LITE_GHL_WEBHOOK_PER_MIN;
  });
  /* ── the two-way calendar ─────────────────────────────────────────────
   * Until this shipped the calendar was one-way: HighLevel wrote to us and
   * nothing went back, so a booking taken on the public page was invisible to
   * the Voice AI and the same slot was offered to the next caller. The tests
   * below attack the two ways a two-way sync goes wrong — an echo loop, and a
   * booking that is kept locally after the remote write failed.
   */
  section('a purchase that timed out');
  await t('A RETRY ADOPTS THE NUMBER INSTEAD OF BUYING A SECOND ONE', async () => {
    // The live failure: HighLevel bought (or may have bought) +1656... and did
    // not answer in time, so the tenant sat at `claimed` with an error. Going
    // straight to "buy" on the retry spends another $1.15/month for ever on a
    // line nothing points at.
    const tn = await M.Tenant.create(tenantSeed({ business_name: 'Timed Out Co', provisioning_state: 'claimed',
      ghl_location_id: 'LOC-SHARED', ghl_token_enc: secretbox.seal('pit-shared') }));
    GhlProvider._clearOwnedCache();                  // it is cached for 60 s per location
    scenario = { ownedOverride: ['+18139990001'] };   // bought, unclaimed
    const before = boughtNumbers;
    await provisioning.provision(tn);
    scenario = {};
    assert.strictEqual(boughtNumbers, before, 'it bought a second number after a timeout');
    const n = await M.Number.findOne({ where: { tenant_id: tn.id } });
    assert.ok(n, 'the orphan was not adopted');
    assert.strictEqual(n.did, '+18139990001');
  });
  await t('IT NEVER ADOPTS A NUMBER ANOTHER TENANT ALREADY HOLDS', async () => {
    const mine = await M.Number.findOne({ where: { did: '+18139990001' } });
    assert.ok(mine, 'fixture missing');
    const other = await M.Tenant.create(tenantSeed({ business_name: 'Someone Else', provisioning_state: 'claimed',
      ghl_location_id: 'LOC-SHARED', ghl_token_enc: secretbox.seal('pit-shared') }));
    GhlProvider._clearOwnedCache();
    scenario = { ownedOverride: ['+18139990001'] };   // the SAME line, already taken
    const before = boughtNumbers;
    await provisioning.provision(other);
    scenario = {};
    assert.strictEqual(boughtNumbers, before + 1, 'it should have bought its own rather than adopting');
    const n = await M.Number.findOne({ where: { tenant_id: other.id } });
    assert.notStrictEqual(n.did, '+18139990001', 'it handed one tenant another tenant\'s line');
  });

  section('the end-of-call workflow');
  await t('AN AGENT BUILT BEFORE THE WORKFLOW EXISTED CAN BE REPAIRED', async () => {
    scenario = {}; reqs = [];
    const tn = await M.Tenant.create(tenantSeed({ business_name: 'Repair Me',
      ghl_location_id: 'LOC-A', ghl_agent_id: 'agent-old', ghl_token_enc: secretbox.seal('pit-x'),
      provisioning_state: 'ready' }));
    const out = await provisioning.syncWorkflows(tn);
    scenario = {};
    assert.strictEqual(out.changed, true, JSON.stringify(out));
    const patch = reqs.find((r) => r.method === 'PATCH' && r.path.includes('/voice-ai/agents/'));
    assert.ok(patch, 'the existing agent was never re-pointed');
    assert.deepStrictEqual(patch.body.callEndWorkflowIds, ['wf-after-call']);
  });
  await t('A TEMPLATE WITH NO WORKFLOW NEVER WIPES A WORKING AGENT', async () => {
    scenario = { templateNoWorkflow: true }; reqs = [];
    const tn = await M.Tenant.create(tenantSeed({ business_name: 'Leave Me Alone',
      ghl_location_id: 'LOC-A', ghl_agent_id: 'agent-live', ghl_token_enc: secretbox.seal('pit-x'),
      provisioning_state: 'ready' }));
    const out = await provisioning.syncWorkflows(tn);
    assert.strictEqual(out.changed, false);
    assert.ok(/no end-of-call workflow/.test(out.reason));
    assert.strictEqual(reqs.filter((r) => r.method === 'PATCH').length, 0,
      'a missing template setting was pushed onto a working agent');
    scenario = {};
  });

  section('SMS on the HighLevel path');
  await t('A TEXT GOES OUT FROM THE TENANT\'S OWN HIGHLEVEL NUMBER', async () => {
    reqs = []; scenario = {};
    scenario = { ownedOverride: ['+18135550101'] };
    const prov = new GhlProvider({ creds: { token: 'pit-x', locationId: 'LOC-SMS-1' } });
    const out = await prov.sendSMS({ from: '+18135550101', to: '+14085551234', body: 'hello' });
    assert.ok(out && out.provider === 'ghl');
    const msg = reqs.find((r) => r.path === '/conversations/messages' && r.method === 'POST');
    assert.ok(msg, 'no message was sent through HighLevel');
    assert.strictEqual(msg.body.type, 'SMS');
    assert.strictEqual(msg.body.fromNumber, '+18135550101', 'it did not send from the tenant\'s own line');
    assert.strictEqual(msg.body.toNumber, '+14085551234');
    assert.ok(msg.body.contactId, 'HighLevel requires a contactId and none was sent');
    assert.ok(reqs.some((r) => r.path === '/contacts/upsert'), 'the recipient was never upserted');
  });
  await t('A NUMBER THE ACCOUNT DOES NOT OWN IS REFUSED, not accepted and dropped', async () => {
    reqs = []; scenario = { ownedOverride: ['+18135550101'] };
    const prov = new GhlProvider({ creds: { token: 'pit-x', locationId: 'LOC-OWN-1' } });
    await assert.rejects(prov.sendSMS({ from: '+18886103810', to: '+14085551234', body: 'x' }),
      (e) => e.code === 'FROM_NOT_OWNED');
    scenario = {};
    assert.strictEqual(reqs.filter((r) => r.path === '/conversations/messages').length, 0,
      'HighLevel answers 201 for a sender it does not hold and delivers nothing');
  });
  await t('an account with no number at all says so rather than sending', async () => {
    scenario = { ownsNothing: true }; reqs = [];
    const prov = new GhlProvider({ creds: { token: 'pit-x', locationId: 'LOC-OWN-2' } });
    await assert.rejects(prov.sendSMS({ from: '+18135550101', to: '+14085551234', body: 'x' }),
      (e) => e.code === 'FROM_NOT_OWNED' && /owns no phone number/.test(e.message));
    scenario = {};
  });
  await t('TWILIO SMS IS OFF WHILE HIGHLEVEL IS CONFIGURED', () => {
    const TwilioProvider = require(path.join(ROOT, 'src/telephony/twilioProvider'));
    assert.strictEqual(TwilioProvider.smsDisabled(), true, 'a text could still fall back to Twilio');
    process.env.LITE_TWILIO_SMS = 'on';
    try { assert.strictEqual(TwilioProvider.smsDisabled(), false, 'the deliberate override does not work'); }
    finally { delete process.env.LITE_TWILIO_SMS; }
  });
  await t('THE TOLL-FRAUD GATE IS IN THIS PROVIDER TOO, not only Twilio\'s', async () => {
    reqs = []; scenario = { ownedOverride: ['+18135550101'] };
    const prov = new GhlProvider({ creds: { token: 'pit-x', locationId: 'LOC-A' } });
    await assert.rejects(prov.sendSMS({ from: '+18135550101', to: '+237650000000', body: 'x' }),
      (e) => e.code === 'TOLL_FRAUD_GUARD');
    assert.strictEqual(reqs.filter((r) => r.path === '/conversations/messages').length, 0,
      'a Cameroon destination reached HighLevel');
    scenario = {};
  });
  await t('a demo text draws on its own budget, so it cannot starve owner alerts', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/telephony/ghlProvider.js'), 'utf8');
    assert.ok(/purpose === 'demo' \? 'demo_sms' : 'sms'/.test(src), 'the two budgets were merged');
  });
  await t('NO FILE OUTSIDE A PROVIDER REACHES A SEND API', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/services/sms.js'), 'utf8');
    assert.ok(!/conversations\/messages/.test(src), 'the service reaches the send endpoint directly');
    assert.ok(/sendSMS/.test(src), 'it should go through the provider');
  });

  section('area codes');
  await t('A REQUESTED AREA CODE IS HONOURED', async () => {
    scenario = {}; reqs = [];
    const prov = new GhlProvider({ creds: { token: 'pit-x', locationId: 'LOC-A' } });
    const got = await prov.buyNumber({ areaCode: '813', tenantId: 5001 });
    assert.ok(String(got.did).startsWith('+1813'), `asked for 813, got ${got.did}`);
    const q = reqs.find((r) => r.path.endsWith('/available') && r.query.firstPart);
    // The BARE area code. '1813' returns zero from the real API.
    assert.strictEqual(q.query.firstPart, '813');
  });
  await t('ASKING FOR 813 NEVER SILENTLY BUYS A MICHIGAN NUMBER', async () => {
    scenario = { noAreaCode: true }; reqs = [];
    const prov = new GhlProvider({ creds: { token: 'pit-x', locationId: 'LOC-A' } });
    await assert.rejects(prov.buyNumber({ areaCode: '813', tenantId: 5002 }),
      (e) => e.code === 'NO_NUMBER_IN_AREA' && e.area_code === '813');
    assert.strictEqual(reqs.filter((r) => r.path.endsWith('/purchase')).length, 0, 'it bought a number in the wrong area');
    scenario = {};
  });
  await t('...unless the client is told and chooses any number', async () => {
    scenario = { noAreaCode: true }; reqs = [];
    const prov = new GhlProvider({ creds: { token: 'pit-x', locationId: 'LOC-A' } });
    const got = await prov.buyNumber({ areaCode: '813', tenantId: 5003, allowAnyArea: true });
    assert.ok(got.did, 'the explicit opt-in did not buy anything');
    scenario = {};
  });
  await t('a PREFIX match that is not really in the area is rejected', async () => {
    // HighLevel's firstPart is a hint, not a filter: it can return numbers
    // outside the area. Trusting the first row is how 813 becomes 8135-ish.
    scenario = { wrongAreaResults: true }; reqs = [];
    const prov = new GhlProvider({ creds: { token: 'pit-x', locationId: 'LOC-A' } });
    await assert.rejects(prov.buyNumber({ areaCode: '813', tenantId: 5004 }),
      (e) => e.code === 'NO_NUMBER_IN_AREA');
    scenario = {};
  });

  section('the two-way calendar');
  const booking = require(path.join(ROOT, 'src/services/booking'));
  const ghlCalendar = require(path.join(ROOT, 'src/services/ghlCalendar'));

  // Give the shared fixture tenant working availability. Its provisioning above
  // already left it with a location, a calendar and its own sealed token.
  const CAL_T = tenant;
  // Starts FAR out on purpose. The mirror section above writes appointments at
  // fixed dates ('2026-10-01T15:00:00Z'), and once match() compares Dates by
  // value rather than by reference — which it now does — a generated slot that
  // lands on one of them comes back `slot_taken` and the test under it reports
  // a defect the product does not have.
  const nextSlot = (() => { let n = 0; return () => {
    const d = new Date(Date.now() + (400 + (n++)) * 86400000);
    d.setUTCHours(15, 0, 0, 0);
    return d;
  }; })();

  await t('THE TENANT IS ACTUALLY ON THE HIGHLEVEL PATH (fixture sanity)', () => {
    assert.ok(ghlCalendar.enabledFor(CAL_T), 'fixture has no HighLevel calendar; the rest would vacuously pass');
  });

  await t('a booking made in RinglyPro IS written into the HighLevel calendar', async () => {
    reqs = []; scenario = {};
    const r = await booking.bookAppointment({
      tenantId: CAL_T.id, caller_name: 'Rosa Diaz', callback_number: '+14085551212',
      starts_at: nextSlot().toISOString(), email: 'rosa@example.com',
    });
    assert.strictEqual(r.success, true, JSON.stringify(r));
    assert.strictEqual(r.synced_to_calendar, true, 'the booking was never pushed to HighLevel');
    const made = reqs.find((x) => x.path === '/calendars/events/appointments' && x.method === 'POST');
    assert.ok(made, 'no appointment was created in HighLevel');
    assert.strictEqual(made.body.calendarId, CAL_T.ghl_calendar_id, 'pushed into the wrong calendar');
    assert.strictEqual(made.body.locationId, CAL_T.ghl_location_id);
    assert.ok(made.body.contactId, 'HighLevel requires a contactId and none was sent');
    const appt = (await M.Appointment.findAll({ where: { tenant_id: CAL_T.id } })).slice(-1)[0];
    assert.ok(String(appt.ghl_event_id).startsWith('EVT-'), 'the HighLevel event id was not kept');
    assert.strictEqual(appt.origin, 'ringlypro');
  });

  await t('THE CREDENTIALS USED ARE THAT TENANT\'S OWN, never the env fallback', async () => {
    const made = reqs.filter((x) => x.path === '/calendars/events/appointments');
    assert.ok(made.length, '[].every() is true — this asserted nothing without a request to check');
    const want = `Bearer ${secretbox.open(CAL_T.ghl_token_enc)}`;
    assert.ok(made.every((x) => x.auth === want), 'another account\'s token reached the calendar');
    assert.ok(made.every((x) => x.auth !== 'Bearer pit-env-fallback-token'));
  });

  await t('THE TOKEN NEVER LEAVES THE AUTHORIZATION HEADER', () => {
    const tok = secretbox.open(CAL_T.ghl_token_enc);
    for (const r of reqs) {
      assert.ok(!r.path.includes(tok), 'a token appeared in a URL path');
      assert.ok(!JSON.stringify(r.query || {}).includes(tok), 'a token appeared in a query string');
      assert.ok(!JSON.stringify(r.body || {}).includes(tok), 'a token appeared in a request body');
    }
  });

  await t('AN APPOINTMENT MIRRORED IN FROM HIGHLEVEL IS NEVER PUSHED BACK', async () => {
    reqs = []; scenario = {};
    const before = await M.Appointment.count();
    const r = await post({ to: mirrorTenantNum.did, call_id: 'echo-1', outcome: 'appointment booked',
      appointment: { startTime: '2026-11-04T16:00:00Z', id: 'EVT-FROM-GHL' } },
      { 'x-ringlypro-signature': 'sit-webhook-secret' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(await M.Appointment.count(), before + 1, 'the mirror did not store the booking');
    const echoed = reqs.filter((x) => x.path === '/calendars/events/appointments' || x.path === '/contacts/upsert');
    assert.strictEqual(echoed.length, 0, 'ECHO LOOP: a HighLevel booking was pushed straight back');
    const row = (await M.Appointment.findAll({ where: { tenant_id: CAL_T.id } })).slice(-1)[0];
    assert.strictEqual(row.origin, 'ai', 'a mirrored row was not marked as coming from the AI');
    assert.strictEqual(row.ghl_event_id, 'EVT-FROM-GHL');
  });

  await t('A CALLER CANNOT SET `origin` — the relay spreads raw model tool input', async () => {
    // relayAgent does bookAppointment({ ...base, ...input }) where `input` is
    // whatever the model emitted. If `origin` were an argument, a model writing
    // origin:'ai' would book locally, push nothing, and silently hand the slot
    // back to HighLevel's Voice AI — reinstating the exact double-booking this
    // change removes, with nothing on any screen to show for it.
    reqs = []; scenario = {};
    const r = await booking.bookAppointment({
      tenantId: CAL_T.id, caller_name: 'Model', callback_number: '+14085550099',
      starts_at: nextSlot().toISOString(), origin: 'ai',
    });
    assert.strictEqual(r.success, true, JSON.stringify(r));
    assert.strictEqual(r.synced_to_calendar, true, 'a caller-supplied origin suppressed the push');
    const row = await M.Appointment.findByPk(r.appointment_id);
    assert.strictEqual(row.origin, 'ringlypro', 'the model chose the provenance of a RinglyPro booking');
    assert.ok(reqs.some((x) => x.path === '/calendars/events/appointments'));
    // and the signature itself does not name it
    const src = fs.readFileSync(path.join(ROOT, 'src/services/booking.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/async function bookAppointment\([^)]*\borigin\b/.test(src),
      'origin is back in the destructured arguments');
  });

  await t('a row with UNKNOWN provenance (pre-dating the column) is never pushed', () => {
    assert.strictEqual(ghlCalendar.pushable({ origin: null }), false);
    assert.strictEqual(ghlCalendar.pushable({ origin: undefined }), false);
    assert.strictEqual(ghlCalendar.pushable({ origin: 'ai' }), false);
    assert.strictEqual(ghlCalendar.pushable({ origin: 'ringlypro' }), true);
  });

  await t('THE MIRROR CANNOT REACH THE PUSH AT ALL — structural, not behavioural', () => {
    // Comments are stripped FIRST. This file explains the echo guard in prose,
    // and the first version of this check passed against its own explanation.
    // BOTH inbound paths are checked: the route and the writer it delegates to,
    // plus the poller. Any one of them reaching the push reopens the echo loop.
    for (const f of ['src/routes/webhooks-ghl.js', 'src/services/callMirror.js', 'src/services/ghlCallLogs.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      assert.ok(!/require\(['"][^'"]*ghlCalendar['"]\)/.test(src), `${f} imports the push service`);
      assert.ok(!/bookAppointment/.test(src), `${f} books through the pushing path — that is the echo loop`);
    }
    // origin:'ai' travels with the Appointment.create it guards, which is now
    // in the writer. It is the field the outbound push filters on.
    const mir = fs.readFileSync(path.join(ROOT, 'src/services/callMirror.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(/origin:\s*'ai'/.test(mir), 'the mirror no longer marks its rows as AI-origin');
  });

  // The SAME instant is reused by the next test on purpose — "the slot is free
  // again" is only meaningful about the slot that just failed.
  const FAILED_SLOT = nextSlot();

  await t('A FAILED PUSH LEAVES NO LOCALLY-BOOKED, REMOTELY-FREE SLOT', async () => {
    scenario = { apptRefused: true }; reqs = [];
    const before = await M.Appointment.count();
    const r = await booking.bookAppointment({
      tenantId: CAL_T.id, caller_name: 'Ghost', callback_number: '+14085550000',
      starts_at: FAILED_SLOT.toISOString(),
    });
    scenario = {};
    assert.strictEqual(r.success, false, 'a booking HighLevel refused was reported as booked');
    assert.strictEqual(r.error, 'sync_failed');
    assert.strictEqual(r.detail, undefined, 'HighLevel\'s own words reached the caller');
    assert.strictEqual(await M.Appointment.count(), before, 'the local row survived a failed push');
  });

  await t('THE EXACT slot that failed is rebookable, not merely a different day', async () => {
    scenario = {};
    const r = await booking.bookAppointment({
      tenantId: CAL_T.id, caller_name: 'Second Try', callback_number: '+14085550001',
      starts_at: FAILED_SLOT.toISOString(),
    });
    assert.strictEqual(r.success, true, JSON.stringify(r));
  });

  await t('THE HARNESS CAN ACTUALLY SEE A CLASH (or the test above proves nothing)', async () => {
    const when = nextSlot();
    const a = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'A',
      callback_number: '+14085550100', starts_at: when.toISOString() });
    const b = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'B',
      callback_number: '+14085550101', starts_at: when.toISOString() });
    assert.strictEqual(a.success, true, JSON.stringify(a));
    assert.strictEqual(b.success, false, 'the same instant booked twice — Date matching is broken in the fake');
    assert.strictEqual(b.error, 'slot_taken');
  });

  await t('A PERMISSION REFUSAL IS NOT RETRIED — a retry cannot change a 403', async () => {
    scenario = { apptRefused: true }; reqs = [];
    const out = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'X', callback_number: '+14085550002',
      starts_at: nextSlot().toISOString() });
    scenario = {};
    assert.strictEqual(out.error, 'sync_failed', `expected a clean refusal, got ${JSON.stringify(out)} / reqs=${JSON.stringify(reqs.map((r) => r.method + ' ' + r.path))}`);
    const tries = reqs.filter((x) => x.path === '/calendars/events/appointments' && x.method === 'POST');
    assert.strictEqual(tries.length, 1, 'a refusal was retried, doubling the visitor\'s wait for nothing');
  });

  await t('A CREATE IS NEVER RETRIED — a timeout says nothing about what HighLevel did', async () => {
    scenario = { apptFlaky: true }; reqs = [];
    const when = nextSlot();
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Flaky', callback_number: '+14085550003',
      starts_at: when.toISOString() });
    scenario = {};
    const tries = reqs.filter((x) => x.path === '/calendars/events/appointments' && x.method === 'POST');
    assert.strictEqual(tries.length, 1, 'a create was sent twice — that is how one visitor gets two events');
    assert.strictEqual(r.success, false, JSON.stringify(r));
    assert.strictEqual(r.error, 'sync_unconfirmed', 'an unknown outcome was reported as a clean failure');
  });

  await t('AN UNKNOWN OUTCOME KEEPS THE ROW AND HOLDS THE SLOT', async () => {
    const rows = await M.Appointment.findAll({ where: { tenant_id: CAL_T.id } });
    const held = rows.filter((r) => r.status === 'sync_unknown');
    assert.strictEqual(held.length, 1, 'the row was deleted, orphaning an event that may exist there');
    // and the slot it holds cannot be handed to the next visitor
    const again = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Next',
      callback_number: '+14085550031', starts_at: new Date(held[0].starts_at).toISOString() });
    assert.strictEqual(again.success, false, 'a slot we may hold in HighLevel was offered again');
    assert.strictEqual(again.error, 'slot_taken');
  });

  await t('the contact upsert IS retried — it is an upsert', async () => {
    scenario = { contactFlaky: true }; reqs = [];
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Retry Me',
      callback_number: '+14085550032', starts_at: nextSlot().toISOString() });
    scenario = {};
    assert.strictEqual(r.success, true, JSON.stringify(r));
    assert.strictEqual(reqs.filter((x) => x.path === '/contacts/upsert').length, 2);
  });

  await t('A CALLER WITH NO NUMBER AND NO EMAIL STILL GETS BOOKED', async () => {
    reqs = []; scenario = {};
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Withheld',
      callback_number: null, starts_at: nextSlot().toISOString() });
    assert.strictEqual(r.success, true, 'a booking the business can honour was thrown away');
    assert.strictEqual(r.synced_to_calendar, false, 'it must be flagged as not pushed, not silently fine');
    assert.strictEqual(reqs.length, 0, 'a contact with nothing to identify it was sent anyway');
  });

  await t('AN EVENT ON ANOTHER CALENDAR IS NEVER CANCELLED', async () => {
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Foreign',
      callback_number: '+14085550033', starts_at: nextSlot().toISOString() });
    scenario = { foreignCalendar: 'CAL-SOMEONE-ELSE' }; reqs = [];
    const out = await booking.cancelAppointment({ tenantId: CAL_T.id, appointmentId: r.appointment_id });
    scenario = {};
    assert.strictEqual(out.remote, false, 'we cancelled an event on a calendar that is not ours');
    const put = reqs.find((x) => x.method === 'PUT');
    assert.ok(!put, 'a PUT went out against a foreign event');
  });

  await t('a failed remote cancel is RECORDED on the row, not only counted', async () => {
    const rows = await M.Appointment.findAll({ where: { tenant_id: CAL_T.id } });
    assert.ok(rows.some((r) => r.ghl_cancel_failed_at), 'nobody who could act on it can see it');
  });

  await t('the caller never receives HighLevel\'s own error text', async () => {
    scenario = { cancelFails: true };
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Words',
      callback_number: '+14085550034', starts_at: nextSlot().toISOString() });
    const out = await booking.cancelAppointment({ tenantId: CAL_T.id, appointmentId: r.appointment_id });
    scenario = {};
    assert.strictEqual(out.remote_error, undefined, 'the raw message is back');
    assert.strictEqual(out.remote_status, 'not_confirmed_elsewhere');
  });

  await t('a Version the sub-account rejects falls back to the date-stamped one', async () => {
    scenario = { apptVersionError: true }; reqs = [];
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Ver', callback_number: '+14085550004',
      starts_at: nextSlot().toISOString() });
    scenario = {};
    assert.strictEqual(r.success, true, JSON.stringify(r));
    const tries = reqs.filter((x) => x.path === '/calendars/events/appointments' && x.method === 'POST');
    assert.strictEqual(tries.length, 2);
    assert.strictEqual(tries[0].version, 'v3');
    assert.strictEqual(tries[1].version, '2021-07-28', 'the documented fallback version was not tried');
  });

  await t('A TENANT NOT ON HIGHLEVEL BOOKS LOCALLY AND CALLS NOTHING', async () => {
    const plain = await M.Tenant.create(tenantSeed({ business_name: 'Twilio-path Co' }));
    reqs = []; scenario = {};
    const r = await booking.bookAppointment({ tenantId: plain.id, caller_name: 'Local Only',
      callback_number: '+14085550005', starts_at: nextSlot().toISOString() });
    assert.strictEqual(r.success, true, JSON.stringify(r));
    assert.strictEqual(r.synced_to_calendar, false);
    assert.strictEqual(reqs.length, 0, 'a non-HighLevel tenant made an outbound HighLevel call');
  });

  await t('CANCELLING HERE CANCELS IT THERE, on the right event id', async () => {
    reqs = []; scenario = {};
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'To Cancel',
      callback_number: '+14085550006', starts_at: nextSlot().toISOString() });
    const appt = await M.Appointment.findByPk(r.appointment_id);
    reqs = [];
    const out = await booking.cancelAppointment({ tenantId: CAL_T.id, appointmentId: appt.id });
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.remote, true, 'the HighLevel side was never cancelled — the slot stays blocked there');
    const put = reqs.find((x) => x.method === 'PUT' && x.path.startsWith('/calendars/events/appointments/'));
    assert.ok(put, 'no cancel reached HighLevel');
    assert.ok(put.path.endsWith(appt.ghl_event_id), 'cancelled the wrong event');
    assert.strictEqual(put.body.appointmentStatus, 'cancelled');
    assert.strictEqual((await M.Appointment.findByPk(appt.id)).status, 'cancelled');
  });

  await t('a HighLevel outage never blocks the owner\'s own cancellation', async () => {
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Outage',
      callback_number: '+14085550007', starts_at: nextSlot().toISOString() });
    scenario = { cancelFails: true };
    const out = await booking.cancelAppointment({ tenantId: CAL_T.id, appointmentId: r.appointment_id });
    scenario = {};
    assert.strictEqual(out.success, true, 'the owner could not cancel because HighLevel was down');
    assert.strictEqual(out.remote, false);
    assert.strictEqual(out.remote_status, 'not_confirmed_elsewhere', 'the failure was swallowed instead of reported');
    assert.strictEqual((await M.Appointment.findByPk(r.appointment_id)).status, 'cancelled');
  });

  await t('cancelling a row that never reached HighLevel makes no outbound call', async () => {
    const oStart = nextSlot();
    const orphan = await M.Appointment.create({ tenant_id: CAL_T.id, starts_at: oStart,
      ends_at: new Date(oStart.getTime() + 30 * 60000), status: 'confirmed', origin: 'ringlypro' });
    reqs = [];
    const out = await booking.cancelAppointment({ tenantId: CAL_T.id, appointmentId: orphan.id });
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.remote, false);
    assert.strictEqual(reqs.length, 0);
  });

  await t('ONE TENANT CAN NEVER CANCEL ANOTHER TENANT\'S APPOINTMENT', async () => {
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Mine',
      callback_number: '+14085550008', starts_at: nextSlot().toISOString() });
    reqs = [];
    const out = await booking.cancelAppointment({ tenantId: CAL_T.id + 9999, appointmentId: r.appointment_id });
    assert.strictEqual(out.success, false);
    assert.strictEqual(out.error, 'not_found');
    assert.strictEqual(reqs.length, 0, 'a cross-tenant cancel reached HighLevel');
    assert.strictEqual((await M.Appointment.findByPk(r.appointment_id)).status, 'confirmed');
  });

  await t('the contact upsert carries the caller, and the push carries its id', async () => {
    reqs = []; scenario = {};
    await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Ana Ruiz',
      callback_number: '+14085550009', email: 'ana@example.com', starts_at: nextSlot().toISOString() });
    const up = reqs.find((x) => x.path === '/contacts/upsert');
    assert.ok(up, 'no contact was upserted, yet HighLevel requires contactId');
    assert.strictEqual(up.body.locationId, CAL_T.ghl_location_id);
    assert.strictEqual(up.body.phone, '+14085550009');
    assert.strictEqual(up.body.email, 'ana@example.com');
    const made = reqs.find((x) => x.path === '/calendars/events/appointments' && x.method === 'POST');
    assert.strictEqual(made.body.contactId, up_id(up), 'the appointment used a different contact than the upsert returned');
    function up_id(u) { return `CT-${u.body.phone || u.body.email || 'x'}`; }
  });

  await t('a contact HighLevel will not accept fails the booking, it does not half-book it', async () => {
    scenario = { contactFails: true };
    const before = await M.Appointment.count();
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'NoContact',
      callback_number: '+14085550010', starts_at: nextSlot().toISOString() });
    scenario = {};
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.error, 'sync_failed');
    assert.strictEqual(await M.Appointment.count(), before);
  });

  await t('SLOT VALIDATION IS GRANTED PER TENANT, NOT BY ONE GLOBAL SWITCH', () => {
    const c = require(path.join(ROOT, 'src/services/ghlCalendar'));
    const env = process.env.LITE_GHL_APPT_VALIDATE_SLOT;
    try {
      delete process.env.LITE_GHL_APPT_VALIDATE_SLOT;
      // A calendar never proven to have open hours refuses EVERY booking if
      // HighLevel is allowed to judge, so it is not allowed to.
      assert.strictEqual(c.validateSlot({ id: 1 }), false, 'an unproven calendar was given the authority');
      assert.strictEqual(c.validateSlot({ id: 1, ghl_hours_confirmed_at: new Date() }), true,
        'a calendar with confirmed hours was not trusted');
      // The override still wins both ways.
      process.env.LITE_GHL_APPT_VALIDATE_SLOT = '0';
      assert.strictEqual(c.validateSlot({ ghl_hours_confirmed_at: new Date() }), false, 'forced off was ignored');
      process.env.LITE_GHL_APPT_VALIDATE_SLOT = '1';
      assert.strictEqual(c.validateSlot({}), true, 'forced on was ignored');
    } finally {
      if (env === undefined) delete process.env.LITE_GHL_APPT_VALIDATE_SLOT;
      else process.env.LITE_GHL_APPT_VALIDATE_SLOT = env;
    }
  });

  await t('slot validation at HighLevel is OFF by default, and the reason is written down', () => {
    assert.strictEqual(ghlCalendar.validateSlot(), false);
    const src = fs.readFileSync(path.join(ROOT, 'src/services/ghlCalendar.js'), 'utf8');
    assert.ok(/uq_lite_appts_slot/.test(src), 'the file does not say which index is the conflict authority');
    assert.ok(/LITE_GHL_APPT_VALIDATE_SLOT=1/.test(src), 'the gap left by ignoring slot validation is not named');
  });

  await t('LITE_GHL_APPT_VALIDATE_SLOT=1 hands the second opinion back to HighLevel', async () => {
    process.env.LITE_GHL_APPT_VALIDATE_SLOT = '1';
    reqs = []; scenario = {};
    try {
      await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Strict',
        callback_number: '+14085550011', starts_at: nextSlot().toISOString() });
      const made = reqs.find((x) => x.path === '/calendars/events/appointments' && x.method === 'POST');
      assert.strictEqual(made.body.ignoreFreeSlotValidation, false);
    } finally { delete process.env.LITE_GHL_APPT_VALIDATE_SLOT; }
  });

  /* ─── the call-log poller: a message must not depend on a webhook ─────── */
  section('call-log poller (the webhook is no longer the only path)');

  const calls = require(path.join(ROOT, 'src/services/ghlCallLogs'));
  const mirror = require(path.join(ROOT, 'src/services/callMirror'));

  // A tenant that owns a line and has an agent on it, the way provisioning
  // leaves one. POLL_CREDS is passed explicitly so a test never depends on
  // which tenant the fake model layer happens to return first.
  const POLL_T = await M.Tenant.create(tenantSeed({ business_name: 'Poller Dental',
    owner_phone: '+14085557777', ghl_location_id: 'LOC-POLL', provisioning_state: 'ready' }));
  await M.Number.create({ tenant_id: POLL_T.id, did: '+16562203777', country: 'US',
    provider: 'ghl', status: 'active', ghl_agent_id: 'agent-poll-1' });
  const OTHER_T = await M.Tenant.create(tenantSeed({ business_name: 'Other Dental',
    owner_phone: '+14085558888', ghl_location_id: 'LOC-POLL', provisioning_state: 'ready' }));
  await M.Number.create({ tenant_id: OTHER_T.id, did: '+16562204444', country: 'US',
    provider: 'ghl', status: 'active', ghl_agent_id: 'agent-other-1' });
  const POLL_CREDS = { token: 'tok-poll', locationId: 'LOC-POLL' };

  const logOf = (over = {}) => Object.assign({
    id: 'CL-1', agentId: 'agent-poll-1', toNumber: '+16562203777', fromNumber: '+14085551111',
    contactName: 'Manuel', duration: 61, createdAt: new Date().toISOString(),
    summary: 'Wants a quote for a new roof. Call back after 4pm.',
    transcript: 'AI: Hello. Caller: I need a quote.',
    executedCallActions: [],
  }, over);

  await t('a message left on a call reaches the tenant with no webhook at all', async () => {
    scenario = { callLogs: [logOf()] };
    const r = await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.results[0].stored, true);
    const msg = M.Message._rows.find((m) => m.tenant_id === POLL_T.id);
    assert.ok(msg, 'the message was not stored');
    assert.match(msg.body, /quote for a new roof/);
    assert.strictEqual(M.Call._rows.filter((c) => c.tenant_id === POLL_T.id).length, 1);
  });

  await t('the owner is texted about it, on their own line', async () => {
    const sent = SENT.filter((x) => x.to === '+14085557777');
    assert.strictEqual(sent.length, 1, `expected one owner alert, got ${sent.length}`);
    assert.strictEqual(sent[0].from, '+16562203777');
  });

  await t('re-polling the same window stores nothing and texts nobody again', async () => {
    const before = SENT.length;
    const r = await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(r.results[0].reason, 'replayed');
    assert.strictEqual(M.Call._rows.filter((c) => c.tenant_id === POLL_T.id).length, 1);
    assert.strictEqual(SENT.length, before, 'a re-poll texted the owner a second time');
  });

  await t('the webhook and the poller converge on ONE call row, either order', async () => {
    // The same HighLevel call id arriving down the other path is a no-op, which
    // is what makes running both safe.
    const r = await mirror.storeCallResult({ callId: 'CL-1', dialed: '+16562203777',
      caller: '+14085551111', summary: 'same call, webhook copy' }, { source: 'webhook' });
    assert.strictEqual(r.stored, false);
    assert.strictEqual(r.reason, 'replayed');
    assert.strictEqual(M.Message._rows.filter((m) => m.tenant_id === POLL_T.id).length, 1);
  });

  await t('THE TENANT COMES FROM THE LINE DIALLED, not from whose token polled', async () => {
    // One sub-account serves every tenant, so a poll returns everyone's calls.
    // Filing them by the credential used would put one client's caller in
    // another client's dashboard.
    scenario = { callLogs: [logOf({ id: 'CL-2', agentId: 'agent-other-1',
      toNumber: '+16562204444', summary: 'this one belongs to the other tenant' })] };
    const r = await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(r.results[0].stored, true);
    assert.strictEqual(r.results[0].tenant_id, OTHER_T.id);
    assert.ok(!M.Message._rows.some((m) => m.tenant_id === POLL_T.id && /other tenant/.test(m.body)),
      'a call for one tenant was filed under another');
  });

  await t('the agent id attributes a call when HighLevel sends no dialled number', async () => {
    scenario = { callLogs: [logOf({ id: 'CL-3', toNumber: null, summary: 'no toNumber in this payload' })] };
    const r = await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(r.results[0].stored, true);
    assert.strictEqual(r.results[0].tenant_id, POLL_T.id);
  });

  await t('a call on a line nobody owns is DROPPED, never filed against a guess', async () => {
    scenario = { callLogs: [logOf({ id: 'CL-4', agentId: 'agent-unknown',
      toNumber: '+15125559999', summary: 'a stranger\'s line' })] };
    const before = M.Call._rows.length;
    const r = await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(r.results[0].stored, false);
    assert.strictEqual(r.results[0].reason, 'number_not_on_file');
    assert.strictEqual(M.Call._rows.length, before, 'an unattributable call created a row');
  });

  await t('a caller number that is not a real number is stored as null, not as text', async () => {
    scenario = { callLogs: [logOf({ id: 'CL-5', fromNumber: '<script>x</script>',
      summary: 'a message from a bad caller field' })] };
    const r = await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(r.results[0].stored, true);
    const c = M.Call._rows.find((x) => x.call_sid === 'ghl:CL-5');
    assert.strictEqual(c.caller, null, 'free text reached the caller column');
  });

  await t('an executed booking action never invents an appointment time', async () => {
    // HighLevel does not put the slot in the call log. A row here would be a
    // fabricated appointment in a customer's calendar; the booking arrives
    // through the calendar path instead.
    scenario = { callLogs: [logOf({ id: 'CL-6',
      executedCallActions: [{ actionType: 'APPOINTMENT_BOOKING', executedAt: new Date().toISOString() }] })] };
    const before = M.Appointment._rows.length;
    const r = await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(r.results[0].stored, true);
    assert.strictEqual(M.Appointment._rows.length, before, 'the poller invented an appointment');
    const c = M.Call._rows.find((x) => x.call_sid === 'ghl:CL-6');
    assert.strictEqual(c.disposition, 'appointment', 'the outcome should still say a booking happened');
  });

  await t('a transfer reads as transferred, a bare call as completed', async () => {
    scenario = { callLogs: [
      logOf({ id: 'CL-7', executedCallActions: [{ actionType: 'CALL_TRANSFER' }] }),
      logOf({ id: 'CL-8', summary: null, transcript: null }),
    ] };
    await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(M.Call._rows.find((x) => x.call_sid === 'ghl:CL-7').disposition, 'transferred');
    assert.strictEqual(M.Call._rows.find((x) => x.call_sid === 'ghl:CL-8').disposition, 'completed');
  });

  await t('a dry run reports what WOULD be stored and writes nothing', async () => {
    scenario = { callLogs: [logOf({ id: 'CL-DRY' })] };
    const before = M.Call._rows.length;
    const r = await calls.importRecent({ creds: POLL_CREDS, dryRun: true });
    assert.strictEqual(r.results[0].would_store, true);
    assert.strictEqual(r.results[0].tenant_id, POLL_T.id);
    assert.strictEqual(M.Call._rows.length, before, 'a dry run wrote a row');
  });

  await t('a call-logs outage is reported as itself, never as "no calls"', async () => {
    scenario = { callLogsFail: true, callLogsStatus: 503 };
    const r = await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'fetch_failed');
    assert.ok(r.detail, 'the failure carried no detail');
  });

  await t('the window is the right LENGTH, newest first, for that location only', async () => {
    // This test asserted SECONDS when it was written, from a reading of the
    // docs. It was asserting the bug: the live API answers an empty list to a
    // seconds window. The unit is checked in its own test above; this one is
    // about the span, the ordering and the scope.
    scenario = { callLogs: [] }; reqs = [];
    await calls.importRecent({ creds: POLL_CREDS, minutes: 60 });
    const q = reqs.find((x) => x.path === '/voice-ai/dashboard/call-logs').query;
    assert.strictEqual(q.locationId, 'LOC-POLL');
    assert.strictEqual(q.sort, 'descend');
    const span = (Number(q.endDate) - Number(q.startDate)) / 1000;
    assert.ok(Math.abs(span - 3600) < 5, `window was ${span}s, expected ~3600`);
  });

  await t('the call log is read with Version v3', async () => {
    const r = reqs.find((x) => x.path === '/voice-ai/dashboard/call-logs');
    assert.strictEqual(r.version, 'v3');
  });

  await t('the poller does NOT run outside production unless it is switched on', async () => {
    const env = process.env.NODE_ENV, flag = process.env.LITE_GHL_CALL_POLL;
    try {
      process.env.NODE_ENV = 'development'; delete process.env.LITE_GHL_CALL_POLL;
      assert.strictEqual(calls.start(), null);
      process.env.LITE_GHL_CALL_POLL = 'off'; process.env.NODE_ENV = 'production';
      assert.strictEqual(calls.start(), null, 'off must stop it even in production');
    } finally {
      process.env.NODE_ENV = env;
      if (flag === undefined) delete process.env.LITE_GHL_CALL_POLL; else process.env.LITE_GHL_CALL_POLL = flag;
      calls.stop();
    }
  });

  await t('THE WINDOW IS SENT IN MILLISECONDS — seconds silently returns nothing', async () => {
    // Measured on the live API 2026-09-26: the identical request in seconds
    // answers 200 with an empty list. A missing voicemail then looks like a
    // quiet day, which is the worst way for this endpoint to fail.
    scenario = { callLogs: [logOf({ id: 'CL-MS' })] }; reqs = [];
    const r = await calls.importRecent({ creds: POLL_CREDS, minutes: 180 });
    assert.strictEqual(r.fetched, 1, 'the window found nothing — it is probably in seconds again');
    const q = reqs.find((x) => x.path === '/voice-ai/dashboard/call-logs').query;
    assert.ok(Number(q.startDate) > 1e11, `startDate ${q.startDate} is not milliseconds`);
    assert.ok(Number(q.endDate) > 1e11, `endDate ${q.endDate} is not milliseconds`);
  });

  await t('a call log with NO dialled number is attributed through its agent', async () => {
    // The live shape: fromNumber is the CALLER and there is no toNumber. A
    // number row provisioned before ghl_agent_id existed has it empty, so the
    // line is read off the agent roster.
    await M.Number.create({ tenant_id: POLL_T.id, did: '+16562205555', country: 'US',
      provider: 'ghl', status: 'active' });     // deliberately NO ghl_agent_id
    scenario = { callLogs: [logOf({ id: 'CL-AG', toNumber: null, agentId: 'agent-roster-1',
      summary: 'attributed through the agent roster' })],
      agentRoster: [{ id: 'agent-roster-1', inboundNumber: '+16562205555' }] };
    const r = await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(r.results[0].stored, true, 'the call was dropped as unattributable');
    assert.strictEqual(r.results[0].tenant_id, POLL_T.id);
  });

  await t('...and the agent id is recorded, so the webhook can attribute it too', async () => {
    const num = M.Number._rows.find((n) => n.did === '+16562205555');
    assert.strictEqual(num.ghl_agent_id, 'agent-roster-1', 'what we learned was not written down');
  });

  await t('a stale roster can NEVER move a number between tenants', async () => {
    // Backfill fills an EMPTY column only. Overwriting one would let one
    // client's line start answering for another's agent.
    scenario = { callLogs: [logOf({ id: 'CL-STEAL', toNumber: null, agentId: 'agent-thief' })],
      agentRoster: [{ id: 'agent-thief', inboundNumber: '+16562205555' }] };
    await calls.importRecent({ creds: POLL_CREDS });
    const num = M.Number._rows.find((n) => n.did === '+16562205555');
    assert.strictEqual(num.ghl_agent_id, 'agent-roster-1', 'a later roster overwrote the agent id');
  });

  await t('an unreadable agent roster degrades to dropping, never to guessing', async () => {
    scenario = { callLogs: [logOf({ id: 'CL-NOROSTER', toNumber: null, agentId: 'agent-unknown-9' })] };
    const before = M.Call._rows.length;
    const r = await calls.importRecent({ creds: POLL_CREDS });
    assert.strictEqual(r.results[0].stored, false);
    assert.strictEqual(M.Call._rows.length, before);
  });

  await t('THE WEBHOOK OWNS NO ROW-WRITING CODE OF ITS OWN', async () => {
    // Two writers drift: one learns to mirror something the other does not, and
    // which one ran depends on a checkbox in HighLevel. The route must delegate.
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/webhooks-ghl.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const w of ['Call.create', 'Message.create', 'Appointment.create']) {
      assert.ok(!src.includes(w), `the webhook still writes rows itself (${w})`);
    }
    assert.ok(src.includes('mirror.storeCallResult'), 'the webhook does not use the shared writer');
  });


  await t('NO FILE USES THE GLOBAL Number WHERE THE SEQUELIZE MODEL SHADOWS IT', () => {
    // This has now broken production twice: `Number(duration)` in the webhook,
    // and `Number.isInteger` in provisioning's calendar hours. Both parse
    // cleanly and throw at runtime, and both were swallowed by a catch, so they
    // read as HighLevel refusing something. A grep is the only cheap guard.
    const walk = (dir, out = []) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f, out);
        else if (e.name.endsWith('.js')) out.push(f);
      }
      return out;
    };
    const offenders = [];
    for (const f of walk(path.join(ROOT, 'src'))) {
      const src = fs.readFileSync(f, 'utf8');
      // Only files that pull the MODEL into module scope under the bare name.
      const shadows = /^const \{[^}]*\bNumber\b(?!\s*:)[^}]*\} = require\(['"][^'"]*models['"]\)/m.test(src);
      if (!shadows) continue;
      const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // Any use of Number as the global: a call, or a static like isInteger.
      const bad = body.match(/\bNumber\s*\(|\bNumber\.(isInteger|isNaN|parseInt|parseFloat|isFinite|MAX_SAFE_INTEGER)/g);
      if (bad) offenders.push(`${path.relative(ROOT, f)} → ${[...new Set(bad)].join(', ')}`);
    }
    assert.strictEqual(offenders.length, 0,
      `the Sequelize Number model shadows the global here: ${offenders.join(' | ')}`
      + ' — alias the import (Number: NumberModel) or use isNaN/parseInt instead');
  });

  /* ─── calendar hours: a calendar with none offers no slots ─────────────── */
  section('calendar open hours (why the agent offered nothing)');

  await t('ONE ENTRY PER WEEKDAY — grouping identical windows is refused by HighLevel', () => {
    // Measured: daysOfTheWeek:[1] is accepted, [1,2,3,4,5] gets 422
    // "must be a valid day of week". Grouping is the obvious optimisation and
    // it breaks the entire request.
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00', active: true }));
    const p = provisioning.hoursPayload(rules);
    assert.strictEqual(p.length, 5, 'Mon-Fri must be five entries, not one grouped entry');
    for (const g of p) assert.strictEqual(g.daysOfTheWeek.length, 1, 'an entry carried more than one day');
    assert.deepStrictEqual(p.map((g) => g.daysOfTheWeek[0]), [1, 2, 3, 4, 5], 'days must be in order');
    assert.deepStrictEqual(p[0].hours, [{ openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 }]);
  });

  await t('two windows on one day travel together; an inactive rule is left out', () => {
    const p = provisioning.hoursPayload([
      { weekday: 1, start: '09:00', end: '12:00', active: true },
      { weekday: 1, start: '13:00', end: '17:00', active: true },   // after lunch
      { weekday: 1, start: '09:00', end: '12:00', active: true },   // a duplicate row
      { weekday: 0, start: '09:00', end: '17:00', active: false },
    ]);
    assert.strictEqual(p.length, 1, 'one day is one entry');
    assert.strictEqual(p[0].hours.length, 2, 'the two windows should both be sent, the duplicate once');
    assert.ok(!p.some((g) => g.daysOfTheWeek[0] === 0), 'an inactive day was sent to HighLevel');
  });

  await t('a weekday outside 0-6 is dropped rather than sent', () => {
    const p = provisioning.hoursPayload([{ weekday: 9, start: '09:00', end: '17:00', active: true }]);
    assert.strictEqual(p.length, 0);
  });

  await t('a malformed rule is dropped, never sent as NaN', () => {
    const p = provisioning.hoursPayload([{ weekday: 1, start: 'whenever', end: '17:00', active: true }]);
    assert.strictEqual(p.length, 0);
    assert.ok(!JSON.stringify(p).includes('null'));
  });

  const HRS_T = await M.Tenant.create(tenantSeed({ business_name: 'Hours Dental',
    ghl_location_id: 'LOC-HRS', ghl_calendar_id: 'CAL-HRS', provisioning_state: 'ready' }));

  await t('AN EMPTY CALENDAR GETS THE TENANT\'S OWN HOURS WRITTEN ONTO IT', async () => {
    // The live failure: openHours reads as {} and free-slots answers nothing,
    // so the agent tells every caller there is nothing available.
    CAL_HOURS = {}; scenario = { calOpenHours: {} }; reqs = [];
    const r = await provisioning.syncCalendarHours(HRS_T, { token: 'tk', locationId: 'LOC-HRS' });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    const put = reqs.find((x) => x.method === 'PUT' && /^\/calendars\//.test(x.path));
    assert.ok(put, 'nothing was written to the calendar');
    assert.strictEqual(put.body.openHours.length, 5, 'Mon-Fri must be five single-day entries');
    assert.deepStrictEqual(put.body.openHours[0].daysOfTheWeek, [1]);
    assert.strictEqual(put.body.openHours[0].hours[0].openHour, 9);
  });

  await t('...and the rules were seeded from nothing, so a new tenant is bookable', async () => {
    const rules = M.AvailabilityRule._rows.filter((x) => x.tenant_id === HRS_T.id);
    assert.strictEqual(rules.length, 5, `expected Mon-Fri, got ${rules.length}`);
    assert.strictEqual(rules[0].timezone, 'America/New_York');
  });

  await t('the result is READ BACK — a 200 on the write is not evidence of a slot', async () => {
    scenario = {}; reqs = [];
    const r = await provisioning.syncCalendarHours(HRS_T, { token: 'tk', locationId: 'LOC-HRS' }, { force: true });
    assert.ok(r.read_back >= 1, `hours were not confirmed after writing: ${JSON.stringify(r)}`);
    const gets = reqs.filter((x) => x.method === 'GET' && /^\/calendars\//.test(x.path));
    assert.ok(gets.length >= 1, 'the calendar was never re-read');
  });

  await t('HOURS SOMEBODY SET BY HAND ARE NEVER OVERWRITTEN', async () => {
    // Replacing a real business's configured hours with our defaults changes
    // when they are bookable. Only ?force=1 may do that.
    CAL_HOURS = [{ daysOfTheWeek: [2], hours: [{ openHour: 11, openMinute: 30, closeHour: 15, closeMinute: 0 }] }];
    scenario = { calOpenHours: CAL_HOURS }; reqs = [];
    const r = await provisioning.syncCalendarHours(HRS_T, { token: 'tk', locationId: 'LOC-HRS' });
    assert.strictEqual(r.skipped, 'already_has_open_hours');
    assert.ok(!reqs.some((x) => x.method === 'PUT' && /^\/calendars\//.test(x.path)), 'existing hours were overwritten');
  });

  await t('AN UNREADABLE CALENDAR IS NOT AN EMPTY ONE — it refuses rather than clobbering', async () => {
    scenario = { calRead: 'fail' }; reqs = [];
    const r = await provisioning.syncCalendarHours(HRS_T, { token: 'tk', locationId: 'LOC-HRS' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'calendar_unreadable');
    assert.ok(!reqs.some((x) => x.method === 'PUT'), 'it wrote hours on a failed read');
  });

  await t('PROVISIONING SETS THE HOURS, and a failure there never loses the number', async () => {
    CAL_HOURS = {}; scenario = { calOpenHours: {}, calWriteFails: true };
    reqs = []; boughtNumbers = 0;
    const fresh = await M.Tenant.create(tenantSeed({ business_name: 'Fresh Dental' }));
    await accounts.addToPool({ location_id: 'LOC-FRESH', token: 'pit-fresh', shared: true });
    const r = await provisioning.provision(fresh.id, { areaCode: '813' });
    scenario = {};
    // The calendar-hours write was refused; the run must still have finished
    // and the bought number must still be on the tenant.
    assert.strictEqual(boughtNumbers, 1, 'the purchase did not happen exactly once');
    const after = await M.Tenant.findByPk(fresh.id);
    assert.ok(after.ghl_calendar_id, 'no calendar was recorded');
    assert.ok(M.Number._rows.some((n) => n.tenant_id === fresh.id), 'the bought number was lost');
    assert.ok(reqs.some((x) => x.method === 'PUT' && /^\/calendars\//.test(x.path)), 'provisioning never tried to set hours');
    assert.ok(r, 'provision returned nothing');
  });


  /* ─── outbound calling: the toll-fraud payout path, with a UI ─────────── */
  section('outbound (upload a spreadsheet, dial strangers — gate it twice)');

  const ob = require(path.join(ROOT, 'src/services/outbound'));
  const obTenant = (over = {}) => Object.assign({ id: 4242, country: 'US', timezone: 'America/New_York',
    outbound_enabled: true, outbound_workflow_id: 'wf-outbound', outbound_daily_cap: 50 }, over);

  await t('A CAMEROON NUMBER IS REFUSED AT IMPORT, and masked in the report', () => {
    const r = ob.parseList(Buffer.from('Company,Phone\nAcme,813-555-0134\nFraud,+237650000000\n'));
    assert.strictEqual(r.accepted.length, 1);
    assert.strictEqual(r.accepted[0].phone, '+18135550134');
    assert.strictEqual(r.refused.length, 1);
    assert.ok(!r.refused[0].phone.includes('650000000'), 'the full number was echoed back');
  });

  await t('...AND AGAIN AT DIAL, because a row can be edited after import', async () => {
    // The import check happened while a human watched. This one is the only
    // thing standing between an edited row and a premium-rate call.
    const g = await ob.mayDial(obTenant(), { id: 1, phone: '+237650000000', status: 'pending' });
    assert.strictEqual(g.ok, false);
    assert.strictEqual(g.reason, 'destination_not_allowed');
  });

  await t('EVERY ROW GETS A RESULT — nothing is silently dropped', () => {
    const r = ob.parseList(Buffer.from('Company,Phone\nA,813-555-0100\nB,\nC,+237650000001\nD,813-555-0100\n'));
    assert.strictEqual(r.accepted.length + r.refused.length, 4,
      'a row vanished: the tenant would never know which');
    assert.ok(r.refused.some((x) => /no phone/.test(x.reason)));
    assert.ok(r.refused.some((x) => /duplicate/.test(x.reason)));
  });

  await t('A FORMULA CELL IS NEUTRALISED, not stored as a formula', () => {
    // Excel executes =cmd|... when the file is reopened. A list exported later
    // must not carry it into somebody's spreadsheet.
    const r = ob.parseList(Buffer.from('Company,Phone\n=cmd|\' /c calc\'!A1,813-555-0111\n'));
    assert.strictEqual(r.accepted.length, 1);
    assert.ok(r.accepted[0].company.startsWith("'"), 'a formula survived into storage');
  });

  await t('an .xlsx is refused with the fix, not parsed by a new dependency', () => {
    const xlsx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const r = ob.parseList(xlsx);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'spreadsheet_not_supported');
    assert.ok(/CSV/i.test(r.message), 'the refusal does not say what to do instead');
  });

  // ── A REAL LIST, NOT A LIST SHAPED LIKE THE TEST ────────────────────────
  // Every case below comes from an actual roster the owner tried to upload
  // (139 City-of-Tampa realtors). Each one passed the old importer and lost
  // data in silence, which is the failure mode worth testing.

  await t('NO AREA CODE IS IN TWO TIMEZONES - the resolution was key order, not a decision', () => {
    // The first table listed TWELVE codes twice and let object key order pick
    // the winner: 915 (El Paso) read as Central, 601 (Mississippi) as Eastern,
    // 707 (California) as Eastern. An hour out at the edge of the 8am-9pm
    // window is an illegal call, and it is silent - the number dials and the
    // log looks normal.
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'outbound.js'), 'utf8')
      .replace(/\/\/[^\n]*/g, '');                    // comments carry example codes
    const table = src.match(/const TZ_BY_AREA = \{[\s\S]*?\n\};/);
    assert.ok(table, 'the area-code table was not found');
    const zones = {};
    let cur = null;
    for (const line of table[0].split('\n')) {
      const head = line.match(/^\s*(\w+):\s*\[/);
      if (head) { cur = head[1]; zones[cur] = zones[cur] || []; }
      if (!cur) continue;
      for (const q of (line.match(/'\d{3}'/g) || [])) zones[cur].push(q.replace(/'/g, ''));
      if (/\],\s*$/.test(line)) cur = null;
    }
    const total = Object.values(zones).reduce((n, l) => n + l.length, 0);
    assert.ok(total > 200, 'the table parsed to ' + total + ' codes - the parser, not the table, is wrong');
    const seen = {};
    for (const [z, list] of Object.entries(zones)) for (const a of list) (seen[a] = seen[a] || []).push(z);
    const dupes = Object.entries(seen).filter(([, zs]) => zs.length > 1);
    assert.strictEqual(dupes.length, 0,
      'area codes in more than one zone: ' + dupes.map(([a, zs]) => a + '=' + zs.join('/')).join(', '));
  });

  await t('the area codes that were WRONG now resolve to the right zone', () => {
    // Each of these was measurably wrong before: a duplicate resolved by key
    // order, a single misfiling, or missing entirely so the dialer refused it.
    const expect = {
      '+13525550100': 'America/New_York',      // Gainesville FL - was Central
      '+16155550100': 'America/Chicago',       // Nashville - was Eastern
      '+19315550100': 'America/Chicago',       // Clarksville TN - was Eastern
      '+15025550100': 'America/New_York',      // Louisville KY - was Central
      '+19155550100': 'America/Denver',        // El Paso - was Central
      '+17075550100': 'America/Los_Angeles',   // Santa Rosa CA - was Eastern
      '+16015550100': 'America/Chicago',       // Mississippi - was Eastern
      '+19015550100': 'America/Chicago',       // Memphis - was Eastern
      '+15415550100': 'America/Los_Angeles',   // Oregon - was Central
      '+14065550100': 'America/Denver',        // Montana - was Central
      '+16565550100': 'America/New_York',      // Tampa overlay - was MISSING
      '+13215550100': 'America/New_York',      // Brevard FL - was MISSING
      '+13865550100': 'America/New_York',      // Daytona FL - was MISSING
      '+17025550100': 'America/Los_Angeles',   // Las Vegas - was MISSING
      '+16025550100': 'America/Phoenix',       // Arizona keeps no DST
    };
    for (const [num, tz] of Object.entries(expect)) {
      assert.strictEqual(ob.tzForNumber(num), tz, num + ' resolved to ' + ob.tzForNumber(num));
    }
  });

  await t('A SPLIT AREA CODE MUST BE LEGAL IN BOTH ZONES, never a coin toss', () => {
    // 850 straddles the Florida time boundary: Tallahassee is Eastern,
    // Pensacola is Central. The line does not say which. Picking either side
    // puts somebody an hour outside the window, so both must be legal.
    // Daylight saving is still in effect on 1 October, so Eastern is UTC-4 and
    // Central UTC-5. 12:30 UTC = 08:30 Eastern, 07:30 Central: legal for
    // Tallahassee, illegal for Pensacola.
    const early = new Date('2026-10-01T12:30:00Z');
    assert.strictEqual(ob.withinCallingHours('+18135550100', null, early).ok, true,
      'a plain Eastern number should be callable at 08:30 local');
    assert.strictEqual(ob.withinCallingHours('+18505550100', null, early).ok, false,
      'a split 850 number was allowed while one of its zones was at 07:30');

    // AND THE OTHER END, which a one-sided test would miss. 01:30 UTC the next
    // day = 21:30 Eastern, 20:30 Central: legal for Pensacola, illegal for
    // Tallahassee. Picking either zone alone lets one of these through.
    const late = new Date('2026-10-02T01:30:00Z');
    assert.strictEqual(ob.withinCallingHours('+19015550100', null, late).ok, true,
      'a plain Central number should be callable at 20:30 local');
    assert.strictEqual(ob.withinCallingHours('+18505550100', null, late).ok, false,
      'a split 850 number was allowed while one of its zones was at 21:30');

    // 15:30 UTC = 11:30 Eastern, 10:30 Central -> legal in both.
    assert.strictEqual(ob.withinCallingHours('+18505550100', null, new Date('2026-10-01T15:30:00Z')).ok, true);
  });

  await t('a PDF is refused BY NAME - it is the one wrong format that parses', () => {
    // xlsx and xls are binary and produce obvious rubbish. A PDF is mostly
    // ASCII, so without this the splitter returns hundreds of object-dictionary
    // rows and the tenant is shown a preview of garbage.
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'),
      Buffer.from('1 0 obj<</Type/Page>>endobj\nPhone 813-546-1954\n')]);
    const r = ob.parseList(pdf);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'pdf_not_supported');
    assert.ok(/CSV/i.test(r.message), 'the refusal does not say what to do instead');
  });

  await t('loose PDF text is refused with the RIGHT reason, not "no phone number"', () => {
    // Text copied out of a PDF is space-separated: nothing splits into columns,
    // so every row used to fail the phone check and report "no phone number"
    // while the phone sat in the line. 139 rows of a wrong reason sends the
    // tenant hunting a problem they do not have.
    const loose = Buffer.from(
      'Ainsley Daux Florida Realty a@b.com 813-546-1954 Creole\n'
      + 'Albert Medina Jr Homelife Realty j@live.com 813-409-0237 English\n');
    const r = ob.parseList(loose);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'not_columns');
    assert.ok(/are there/i.test(r.message), 'it does not say the numbers ARE present');
    assert.ok(/CSV|Sheets|Excel/i.test(r.message), 'the refusal does not say what to do instead');
  });

  await t('a ONE-COLUMN phone list still works - the guard is on the line, not the column count', () => {
    // The first draft of the guard above asked whether the row split into
    // columns, which is also false for a plain list of numbers one per line: a
    // perfectly good list that it then refused. Both shapes must import.
    for (const body of ['8135550134\n8135550135\n8135550136\n', 'Phone\n8135550134\n8135550135\n']) {
      const r = ob.parseList(Buffer.from(body));
      assert.strictEqual(r.ok, true, JSON.stringify(body));
      assert.ok(r.accepted.length >= 2, 'a bare phone column was not imported: ' + JSON.stringify(body));
      assert.strictEqual(r.accepted[0].phone, '+18135550134');
    }
  });

  await t('a trade-named company column is recognised, not silently dropped', () => {
    // A realtor roster says "Brokerage / Agency"; a contractor list says "Firm".
    // An unrecognised header used to become a null with nothing saying so.
    for (const h of ['Brokerage / Agency', 'brokerage/agency', 'Agency', 'Firm', 'Office']) {
      const r = ob.parseList(Buffer.from(h + ',Phone\nFlorida Realty,813-546-1954\n'));
      assert.strictEqual(r.accepted.length, 1, h);
      assert.strictEqual(r.accepted[0].company, 'Florida Realty', h + ' did not map to company');
    }
  });

  await t('First Name + Last Name are JOINED, not half-dropped', () => {
    const r = ob.parseList(Buffer.from(
      'First Name,Last Name,Brokerage / Agency,Email,Phone,Language\n'
      + 'Albert,Medina Jr,Homelife Realty,j@live.com,813-409-0237,English/Spanish\n'));
    assert.strictEqual(r.accepted.length, 1);
    assert.strictEqual(r.accepted[0].contact_name, 'Albert Medina Jr');
    assert.strictEqual(r.accepted[0].company, 'Homelife Realty');
    assert.strictEqual(r.accepted[0].email, 'j@live.com');
  });

  await t('the preview REPORTS which columns were understood and which were not', () => {
    const r = ob.parseList(Buffer.from(
      'First Name,Last Name,Brokerage / Agency,Email,Phone,Language\n'
      + 'Ainsley,Daux,Florida Realty,a@b.com,813-546-1954,Creole\n'));
    const mapped = r.columns_mapped.map((c) => c.field);
    assert.ok(mapped.includes('company'), 'company not reported as mapped');
    assert.ok(mapped.includes('last_name'), 'last name not reported as mapped');
    // A column we do not use must be NAMED, so nothing is lost in silence.
    assert.deepStrictEqual(r.columns_ignored, ['Language']);
  });

  await t('a malformed number in a real roster is refused, the rest still import', () => {
    // Kelly Dobbin's row in the real file reads 99-489-1990: nine digits.
    const r = ob.parseList(Buffer.from(
      'First Name,Last Name,Brokerage / Agency,Phone\n'
      + 'Kelly,Dobbin,Intl Realty,99-489-1990\n'
      + 'Keyanna,Jacobs,Jacobs Realty,813-270-1212\n'));
    assert.strictEqual(r.accepted.length, 1);
    assert.strictEqual(r.accepted[0].phone, '+18132701212');
    assert.strictEqual(r.refused.length, 1);
    assert.ok(/[*]/.test(r.refused[0].phone), 'the refused number was not masked');
  });

  await t('CALLING HOURS ARE THE CALLED PARTY\'S, not the business\'s', () => {
    // 8pm Eastern is 5pm Pacific: legal to ring California, and the business
    // being in Florida is irrelevant to whether it is legal.
    const at = new Date('2026-10-01T00:30:00Z');            // 20:30 ET, 17:30 PT
    assert.strictEqual(ob.withinCallingHours('+12135550100').tz, 'America/Los_Angeles');
    assert.strictEqual(ob.withinCallingHours('+12135550100', null, at).ok, true, 'a legal Pacific call was refused');
    const early = new Date('2026-10-01T11:30:00Z');          // 07:30 ET, 04:30 PT
    assert.strictEqual(ob.withinCallingHours('+12135550100', null, early).ok, false, '4:30am was allowed');
    assert.strictEqual(ob.withinCallingHours('+18135550100', null, early).ok, false, '7:30am Eastern was allowed');
  });

  await t('AN UNPLACEABLE NUMBER IS REFUSED, NEVER ASSUMED EASTERN', () => {
    // Guessing is how somebody gets rung at 5am.
    const r = ob.withinCallingHours('+441134960000');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'timezone_unknown');
  });

  await t('DIALLING IS OFF UNTIL AN OPERATOR TURNS IT ON', async () => {
    const g = await ob.mayDial(obTenant({ outbound_enabled: false }), { id: 1, phone: '+18135550100', status: 'pending' });
    assert.strictEqual(g.ok, false);
    assert.strictEqual(g.reason, 'outbound_not_enabled_for_this_tenant');
  });

  await t('no outbound workflow means it REFUSES and says why', async () => {
    // HighLevel dials Voice AI outbound only from a workflow action, and a
    // workflow cannot be created by API — it is loaded from a Snapshot.
    const g = await ob.mayDial(obTenant({ outbound_workflow_id: null }), { id: 1, phone: '+18135550100', status: 'pending' });
    assert.strictEqual(g.reason, 'no_outbound_workflow');
    assert.ok(/Snapshot/i.test(g.detail || ''), 'the refusal does not name the owner-side fix');
  });

  await t('a suppressed contact is never dialled', async () => {
    const g = await ob.mayDial(obTenant(), { id: 1, phone: '+18135550100', status: 'suppressed' });
    assert.strictEqual(g.reason, 'do_not_call');
  });

  await t('THE DAILY CAP IS OURS, because HighLevel places the call', () => {
    // The toll-fraud velocity breaker cannot see a HighLevel-placed call —
    // already reported as ghl_transfers_uncapped — so the ceiling lives here.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outbound.js'), 'utf8');
    assert.ok(/daily_cap_reached/.test(src), 'there is no per-tenant daily ceiling');
    assert.ok(/dialledToday/.test(src), 'the cap is not counted from real rows');
  });

  await t('NO CALL ID IS EVER INVENTED', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outbound.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/ghl_call_id\s*[:=]\s*['"`]/.test(src), 'a call id literal is being written');
    assert.ok(!/randomUUID|Date\.now\(\)\s*\+\s*['"]/.test(src), 'a call id looks minted locally');
  });

  await t('NATIONAL DNC IS NOT CLAIMED ANYWHERE', () => {
    // Scrubbing needs an FTC SAN the owner does not have. Implying a scrub
    // that is not happening is the one failure here with legal consequences.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outbound.js'), 'utf8');
    assert.ok(/not.*scrub|National DNC.*not|no National DNC scrub/i.test(src),
      'the absence of a national DNC scrub is not stated');
    assert.ok(!/scrubbed against the national/i.test(src.replace(/not scrubbed against the national/gi, '')),
      'the code claims a national scrub');
  });

  await t('a consent basis is a recorded claim, not a checkbox', () => {
    assert.ok(ob.CONSENT_BASES.includes('unstated'),
      'there is no way to record that the tenant claimed nothing — which is the honest default');
    assert.ok(ob.CONSENT_BASES.includes('existing_customer'));
  });

  await t('A CALLBACK GREETING MAY ONLY CLAIM A CALL THAT HAPPENED', () => {
    // Being on a list is not being rung. A greeting that says "thanks for
    // calling us back" to someone nobody called is a lie the product told.
    assert.strictEqual(ob.callbackNote(null), null);
    assert.strictEqual(ob.callbackNote({ known: false }), null);
    const notCalled = ob.callbackNote({ known: true, called: false, company: 'Acme' });
    assert.ok(!/calling back/i.test(notCalled || ''), 'it claimed a callback for someone never called');
    const called = ob.callbackNote({ known: true, called: true, company: 'Acme',
      last_called_at: '2026-09-20T10:00:00Z', last_outcome: 'voicemail' });
    assert.ok(/Acme/.test(called) && /2026-09-20/.test(called),
      'the note does not carry what actually happened');
  });

  await t('the note carries no marketing copy — only recorded facts', () => {
    const n = ob.callbackNote({ known: true, called: true, company: 'Acme',
      last_called_at: '2026-09-20T10:00:00Z' });
    // Nothing about an offer, a discount or a reason we did not record.
    assert.ok(!/offer|discount|save|deal|special/i.test(n), 'a sales claim leaked into the greeting');
  });

  await t('recognition is keyed on the CALLING number, never on what a caller says', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outbound.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function recogniseCaller'), src.indexOf('function callbackNote'));
    assert.ok(/c\.phone = :p/.test(fn), 'recognition does not match on the phone number');
    assert.ok(/tenant_id = :t/.test(fn), 'recognition is not tenant-scoped');
  });

  /* ─── web push: the badge on a CLOSED app ────────────────────────────── */
  section('web push (an in-page badge cannot update a closed icon)');

  const push = require(path.join(ROOT, 'src/services/pushNotify'));

  await t('A SUBSCRIPTION IS NEVER RETURNED BY ANY ENDPOINT', () => {
    // It is a capability URL: anyone holding it can push to that device.
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/api.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Test the RETURNED SHAPES, not whether a word appears: `req.body.endpoint`
    // is an INPUT — the browser naming its own subscription to remove — and the
    // first version of this test flagged it as a leak.
    const key = { key: 'BPublicKeyValue', available: true };
    for (const shape of [key, { ok: true }, { ok: false, error: 'bad_subscription' }]) {
      const flat = JSON.stringify(shape);
      for (const secret of ['p256dh', 'auth"', 'https://fcm.googleapis.com']) {
        assert.ok(!flat.includes(secret), `a response shape carries ${secret}`);
      }
    }
    // And nothing in the service can hand a caller the stored rows.
    assert.ok(!Object.keys(push).some((k) => /^(list|all|find|get)(Subs|Subscriptions)/i.test(k)),
      'pushNotify exports a subscription reader: ' + Object.keys(push).join(','));
    // The SELECT that reads them is used only to SEND, never to return.
    const svc = fs.readFileSync(path.join(ROOT, 'src/services/pushNotify.js'), 'utf8');
    const sel = svc.slice(svc.indexOf('SELECT id, endpoint'));
    assert.ok(sel.indexOf('sendNotification') > 0 && sel.indexOf('sendNotification') < 1200,
      'the subscription SELECT is not immediately feeding a send');
    // And the service exposes no reader at all.
    assert.ok(!Object.keys(push).some((k) => /list|all|get.*sub/i.test(k)),
      'pushNotify exports something that could list subscriptions: ' + Object.keys(push).join(','));
  });

  await t('a malformed subscription is refused, not stored', async () => {
    for (const bad of [null, {}, { endpoint: 'https://x' }, { endpoint: 'https://x', keys: {} }]) {
      const r = await push.subscribe(1, bad);
      assert.strictEqual(r.ok, false, 'a subscription with no keys was accepted');
      assert.strictEqual(r.error, 'bad_subscription');
    }
  });

  await t('unsubscribe is TENANT-SCOPED — one tenant cannot unhook another\'s device', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/services/pushNotify.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function unsubscribe'), src.indexOf('async function unreadCount'));
    assert.ok(/tenant_id = :t/.test(fn),
      'unsubscribe deletes by endpoint alone, so a guessed endpoint kills another tenant\'s device');
  });

  await t('THE COUNT IS A COUNT OF ROWS, never a stored counter', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/services/pushNotify.js'), 'utf8');
    assert.ok(/Message\.count\(/.test(src), 'the unread count is not derived from rows');
    assert.ok(!/badge_count|stored_count|counter\s*\+\+/.test(src), 'a stored counter appeared');
  });

  await t('no web-push installed is reported, never faked', async () => {
    // pushBadge must say it cannot, rather than claiming a send.
    const r = await push.pushBadge(999999).catch((e) => ({ ok: false, threw: e.message }));
    assert.ok(r.ok === false || r.sent === 0,
      'pushBadge claimed a send with no devices and no keys: ' + JSON.stringify(r));
  });

  await t('A PUSH FAILURE NEVER FAILS THE MIRROR', async () => {
    // The message is the product; the badge is a courtesy. This is the same
    // rule the owner SMS follows.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/callMirror.js'), 'utf8');
    const part = src.slice(src.indexOf('pushBadge') - 400, src.indexOf('pushBadge') + 260);
    assert.ok(/try\s*\{/.test(part) && /catch/.test(part),
      'the push call is not wrapped — a push outage would lose the message');
  });

  await t('the service worker reads the count the SERVER actually sends', () => {
    // It read `data.unread`, which the server has never sent, so the icon
    // would have shown 1 for ever however many messages were waiting.
    const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
    assert.ok(/data\.count/.test(sw), 'the push handler ignores the count the server sends');
  });

  await t('A REFUSED BADGE IS REPORTED, NOT SWALLOWED', () => {
    // setAppBadge returns a PROMISE, so the try/catch that used to wrap it
    // caught nothing. When macOS refused, the feature failed in total silence
    // and read as broken — which is exactly how it was reported.
    const html = fs.readFileSync(path.join(ROOT, 'public/dashboard.html'), 'utf8');
    const fn = html.slice(html.indexOf('function setAppBadge'), html.indexOf('function notifyNew'));
    assert.ok(/\.catch\(/.test(fn), 'the setAppBadge promise rejection is still unhandled');
    assert.ok(/badgeState/.test(fn), 'the outcome is not recorded anywhere the owner can see');
    // And the owner is told where to fix it on the OS that refuses.
    assert.ok(/System Settings/.test(html) && /Badges/.test(html),
      'the tooltip does not say how to allow the badge on macOS');
  });

  await t('the service worker cache was bumped for the push change', () => {
    const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
    const m = sw.match(/const CACHE = 'lite-v(\d+)'/);
    assert.ok(m && Number(m[1]) >= 12, `sw.js is still on lite-v${m && m[1]}`);
  });

  /* ─── an appointment must say what it is FOR ──────────────────────────── */
  section('appointment reason (a time and a name is not enough)');

  await t('a reason given by the caller is stored and pushed as the title', async () => {
    scenario = {}; reqs = [];
    const when = nextSlot();
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Reason Caller',
      callback_number: '+14085550077', starts_at: when.toISOString(),
      reason: '  Roof   estimate for the back porch  ' });
    assert.strictEqual(r.success, true, JSON.stringify(r));
    const row = M.Appointment._rows.find((a) => a.id === r.appointment_id);
    // Trimmed and whitespace-collapsed, not re-worded.
    assert.strictEqual(row.reason, 'Roof estimate for the back porch');
    const push = reqs.find((x) => x.path === '/calendars/events/appointments' && x.method === 'POST');
    assert.ok(push.body.title.includes('Roof estimate'),
      'the purpose did not reach HighLevel, so their calendar still shows "(No title)"');
  });

  await t('NO REASON IS NULL, NEVER A GUESS', async () => {
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Silent Caller',
      callback_number: '+14085550078', starts_at: nextSlot().toISOString() });
    const row = M.Appointment._rows.find((a) => a.id === r.appointment_id);
    assert.strictEqual(row.reason, null, 'an unstated reason was invented');
  });

  await t('whitespace-only is the same as saying nothing', async () => {
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Blank',
      callback_number: '+14085550079', starts_at: nextSlot().toISOString(), reason: '   ' });
    assert.strictEqual(M.Appointment._rows.find((a) => a.id === r.appointment_id).reason, null);
  });

  await t('a runaway reason is capped, not refused', async () => {
    const r = await booking.bookAppointment({ tenantId: CAL_T.id, caller_name: 'Long',
      callback_number: '+14085550080', starts_at: nextSlot().toISOString(), reason: 'x'.repeat(4000) });
    const row = M.Appointment._rows.find((a) => a.id === r.appointment_id);
    assert.strictEqual(row.reason.length, 500, 'the cap did not apply');
    assert.strictEqual(r.success, true, 'a long reason lost the booking');
  });

  /* ─── the appointment mirror: the slot only exists on the calendar ────── */
  section('appointment mirror (Lina booked it; the Calendar tab was empty)');

  const appts = require(path.join(ROOT, 'src/services/ghlAppointments'));
  const APT_T = await M.Tenant.create(tenantSeed({ business_name: 'Booked Dental',
    ghl_location_id: 'LOC-APT', ghl_calendar_id: 'CAL-APT', provisioning_state: 'ready' }));
  const OTHER_CAL_T = await M.Tenant.create(tenantSeed({ business_name: 'Other Dental',
    ghl_location_id: 'LOC-APT', ghl_calendar_id: 'CAL-OTHER', provisioning_state: 'ready' }));
  const APT_CREDS = { token: 'tok-apt', locationId: 'LOC-APT' };
  const soon = new Date(Date.now() + 3 * 86400000);
  const evOf = (over = {}) => Object.assign({
    id: 'EV-1', calendarId: 'CAL-APT', contactId: 'CT-1',
    appointmentStatus: 'confirmed', deleted: false,
    startTime: soon.toISOString(),
    endTime: new Date(soon.getTime() + 30 * 60000).toISOString(),
    title: '', locationId: 'LOC-APT',
  }, over);

  await t('A BOOKING MADE BY PHONE REACHES THE CALENDAR TAB', async () => {
    scenario = { events: [evOf()] };
    const r = await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.results[0].stored, true, JSON.stringify(r.results[0]));
    const row = M.Appointment._rows.find((a) => a.ghl_event_id === 'EV-1');
    assert.ok(row, 'no appointment row was written');
    assert.strictEqual(row.tenant_id, APT_T.id);
    assert.strictEqual(row.status, 'confirmed');
  });

  await t('...with the caller\'s name and a VALIDATED callback number', async () => {
    const row = M.Appointment._rows.find((a) => a.ghl_event_id === 'EV-1');
    assert.strictEqual(row.caller_name, 'Lina Stagg');
    assert.strictEqual(row.callback_number, '+18134811925');
  });

  await t('IT IS MARKED origin:ai, so it can never be pushed back', async () => {
    const row = M.Appointment._rows.find((a) => a.ghl_event_id === 'EV-1');
    assert.strictEqual(row.origin, 'ai', 'a mirrored booking that is not origin:ai is an echo loop');
  });

  await t('re-polling stores nothing — one row, whatever the poll count', async () => {
    const before = M.Appointment._rows.length;
    const r = await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(r.results[0].reason, 'already_mirrored');
    assert.strictEqual(M.Appointment._rows.length, before);
  });

  await t('THE WINDOW IS MILLISECONDS — ISO silently returns an empty calendar', async () => {
    scenario = { events: [evOf({ id: 'EV-MS' })] }; reqs = [];
    const r = await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(r.fetched, 1, 'nothing came back — the window is probably ISO again');
    const q = reqs.find((x) => x.path === '/calendars/events').query;
    assert.ok(/^\d+$/.test(q.startTime), `startTime ${q.startTime} is not milliseconds`);
    assert.ok(Number(q.startTime) > 1e11, 'startTime looks like seconds, not milliseconds');
    assert.strictEqual(q.calendarId, 'CAL-APT', 'the read must be scoped to this tenant\'s calendar');
  });

  await t('A CANCELLED BOOKING NEVER APPEARS AS A HELD SLOT', async () => {
    scenario = { events: [evOf({ id: 'EV-CX', appointmentStatus: 'cancelled' })] };
    const r = await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(r.results[0].stored, false);
    assert.strictEqual(r.results[0].reason, 'cancelled');
    assert.ok(!M.Appointment._rows.some((a) => a.ghl_event_id === 'EV-CX'),
      'a cancelled booking was written as a held slot');
  });

  await t('a deleted event is treated the same as a cancelled one', async () => {
    scenario = { events: [evOf({ id: 'EV-DEL', deleted: true })] };
    await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.ok(!M.Appointment._rows.some((a) => a.ghl_event_id === 'EV-DEL'));
  });

  await t('A CANCELLATION MADE IN HIGHLEVEL REACHES THE MIRRORED ROW', async () => {
    // Otherwise the Calendar tab keeps showing a slot the owner has freed and
    // the agent stops offering a time that is genuinely open.
    scenario = { events: [evOf({ appointmentStatus: 'cancelled' })] };   // EV-1, now cancelled
    const r = await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(r.results[0].reason, 'cancelled_upstream');
    assert.strictEqual(M.Appointment._rows.find((a) => a.ghl_event_id === 'EV-1').status, 'cancelled');
  });

  await t('AN EVENT ON ANOTHER TENANT\'S CALENDAR IS NEVER FILED HERE', async () => {
    // One sub-account holds every tenant's calendar, so this is the boundary.
    scenario = { events: [evOf({ id: 'EV-FOREIGN', calendarId: 'CAL-OTHER' })], leakForeignEvent: true };
    const r = await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(r.results[0].reason, 'foreign_calendar');
    assert.ok(!M.Appointment._rows.some((a) => a.ghl_event_id === 'EV-FOREIGN' && a.tenant_id === APT_T.id));
  });

  await t('an unreadable contact still keeps the appointment', async () => {
    scenario = { events: [evOf({ id: 'EV-NOCT' })], contactReadFails: true };
    const r = await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(r.results[0].stored, true, 'the booking was lost because a second request failed');
    const row = M.Appointment._rows.find((a) => a.ghl_event_id === 'EV-NOCT');
    assert.strictEqual(row.callback_number, null);
  });

  await t('a contact phone that is not a real number is stored as null', async () => {
    scenario = { events: [evOf({ id: 'EV-BADPH' })], contactPhone: '<script>x</script>' };
    await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(M.Appointment._rows.find((a) => a.ghl_event_id === 'EV-BADPH').callback_number, null);
  });

  await t('a calendar outage is reported as itself, never as "no bookings"', async () => {
    scenario = { eventsFail: true, eventsStatus: 503 };
    const r = await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'fetch_failed');
  });

  await t('a dry run reports what WOULD be mirrored and writes nothing', async () => {
    scenario = { events: [evOf({ id: 'EV-DRY' })] };
    const before = M.Appointment._rows.length;
    const r = await appts.importForTenant(APT_T, { creds: APT_CREDS, dryRun: true });
    assert.strictEqual(r.results[0].would_store, true);
    assert.strictEqual(M.Appointment._rows.length, before);
  });

  /* IS IT FIXED FOR TENANT 4, OR FOR EVERY CLIENT? importAll() is the loop the
     poller actually runs, and every test above drives importForTenant with an
     explicit tenant — so "it works for future clients" was an assertion about
     untested code. These four make it a fact. */

  await t('A CLIENT WHO SIGNS UP TOMORROW IS COVERED — no per-tenant wiring', async () => {
    const fresh = await M.Tenant.create(tenantSeed({ business_name: 'Signed Up Later',
      ghl_location_id: 'LOC-APT', ghl_calendar_id: 'CAL-NEW', provisioning_state: 'ready' }));
    scenario = { events: [evOf({ id: 'EV-NEW', calendarId: 'CAL-NEW' })] };
    const r = await appts.importAll({});
    const mine = r.results.find((x) => x.tenant === fresh.id);
    assert.ok(mine, 'importAll did not even visit the new tenant');
    assert.ok((mine.results || []).some((x) => x.stored), 'the new tenant\'s booking was not mirrored');
    const row = M.Appointment._rows.find((a) => a.ghl_event_id === 'EV-NEW');
    assert.strictEqual(row.tenant_id, fresh.id);
  });

  await t('two clients booking at once land in their OWN calendars', async () => {
    const a = await M.Tenant.create(tenantSeed({ business_name: 'Client A',
      ghl_location_id: 'LOC-APT', ghl_calendar_id: 'CAL-A', provisioning_state: 'ready' }));
    const b = await M.Tenant.create(tenantSeed({ business_name: 'Client B',
      ghl_location_id: 'LOC-APT', ghl_calendar_id: 'CAL-B', provisioning_state: 'ready' }));
    scenario = { events: [
      evOf({ id: 'EV-A', calendarId: 'CAL-A' }),
      evOf({ id: 'EV-B', calendarId: 'CAL-B', startTime: new Date(soon.getTime() + 3600e3).toISOString(),
        endTime: new Date(soon.getTime() + 5400e3).toISOString() }),
    ] };
    await appts.importAll({});
    assert.strictEqual(M.Appointment._rows.find((x) => x.ghl_event_id === 'EV-A').tenant_id, a.id);
    assert.strictEqual(M.Appointment._rows.find((x) => x.ghl_event_id === 'EV-B').tenant_id, b.id);
  });

  await t('a tenant with NO calendar is skipped, not an error', async () => {
    const none = await M.Tenant.create(tenantSeed({ business_name: 'No Calendar Yet' }));
    scenario = { events: [] };
    const r = await appts.importAll({});
    assert.ok(!r.results.some((x) => x.tenant === none.id),
      'a tenant still being provisioned was polled anyway');
  });

  await t('ONE CLIENT\'S OUTAGE DOES NOT STOP EVERY OTHER CLIENT', async () => {
    // The single most important property of a shared loop: without a per-tenant
    // catch, the first broken calendar silently stops every client behind it.
    const ok = await M.Tenant.create(tenantSeed({ business_name: 'Healthy Client',
      ghl_location_id: 'LOC-APT', ghl_calendar_id: 'CAL-OK', provisioning_state: 'ready' }));
    scenario = { events: [evOf({ id: 'EV-OK', calendarId: 'CAL-OK',
      startTime: new Date(soon.getTime() + 7200e3).toISOString(),
      endTime: new Date(soon.getTime() + 9000e3).toISOString() })] };
    // One specific client's calendar is unreadable — a revoked token, a
    // deleted calendar, HighLevel 500ing for that sub-account.
    scenario.failCalendars = ['CAL-APT'];
    const r = await appts.importAll({});
    const hurt = r.results.find((x) => x.tenant === APT_T.id);
    assert.ok(hurt && hurt.ok === false, 'the broken tenant was not reported as failed');
    assert.strictEqual(hurt.reason, 'fetch_failed');
    assert.ok(M.Appointment._rows.some((a) => a.ghl_event_id === 'EV-OK'),
      'a healthy client was starved by another client\'s outage');
    assert.ok(r.results.filter((x) => x.ok).length >= 1, 'no tenant succeeded after the failure');
  });

  await t('THE MIRROR NEVER TURNS AN EMPTY TITLE INTO A NAME OR A REASON', async () => {
    // HighLevel's own calendar shows "(No title)" for the booking the owner
    // made by phone. The title used to stand in for a missing caller name,
    // which put "Appointment" in the name column.
    scenario = { events: [evOf({ id: 'EV-NOTITLE', title: '' })], contactReadFails: true };
    const r = await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(r.results[0].stored, true);
    const row = M.Appointment._rows.find((a) => a.ghl_event_id === 'EV-NOTITLE');
    assert.strictEqual(row.reason, null);
    assert.strictEqual(row.caller_name, null, 'an empty title was used as the caller name');
  });

  await t('a titled event mirrors the title as the REASON', async () => {
    scenario = { events: [evOf({ id: 'EV-TITLED', title: 'Quote for a new roof' })] };
    await appts.importForTenant(APT_T, { creds: APT_CREDS });
    assert.strictEqual(M.Appointment._rows.find((a) => a.ghl_event_id === 'EV-TITLED').reason,
      'Quote for a new roof');
  });

  await t('THE APPOINTMENT MIRROR CANNOT REACH THE PUSH', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/services/ghlAppointments.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/require\(['"][^'"]*ghlCalendar['"]\)/.test(src), 'it imports the push service');
    assert.ok(!/bookAppointment/.test(src), 'it books through the pushing path — that is the echo loop');
    assert.ok(/origin:\s*'ai'/.test(src), 'it does not mark its rows AI-origin');
  });

  await t('the poller does NOT run outside production unless switched on', () => {
    const env = process.env.NODE_ENV, flag = process.env.LITE_GHL_APPT_POLL;
    try {
      process.env.NODE_ENV = 'development'; delete process.env.LITE_GHL_APPT_POLL;
      assert.strictEqual(appts.start(), null);
      process.env.LITE_GHL_APPT_POLL = 'off'; process.env.NODE_ENV = 'production';
      assert.strictEqual(appts.start(), null, 'off must stop it even in production');
    } finally {
      process.env.NODE_ENV = env;
      if (flag === undefined) delete process.env.LITE_GHL_APPT_POLL; else process.env.LITE_GHL_APPT_POLL = flag;
      appts.stop();
    }
  });


  /* ── THE OUTBOUND SWITCH ────────────────────────────────────────────────
   * `outbound_enabled` and `outbound_workflow_id` were read in three places
   * and written by NOTHING: the columns existed, the dialer checked them, the
   * dashboard reported them, and no surface anywhere could set either. The
   * banner "not switched on for this account yet" was the end of the road.
   */
  const ghlMod = require(path.join(ROOT, 'src/telephony/ghl'));
  const realCall = ghlMod.call;
  const WF = [
    { id: 'wf-published-001', name: 'RinglyPro Outbound', status: 'published' },
    { id: 'wf-draft-002', name: 'Half built', status: 'draft' },
  ];
  let wfThrows = false;
  ghlMod.call = async (m, pth, o) => {
    if (String(pth).startsWith('/workflows')) {
      if (wfThrows) { const e = new Error('upstream down'); e.status = 502; throw e; }
      return { workflows: WF };
    }
    return realCall ? realCall(m, pth, o) : {};
  };
  ghlMod.resolve = () => ({ token: 't', locationId: 'loc-sit' });

  process.env.LITE_ADMIN_KEY = 'k'.repeat(32);
  const appA = express();
  appA.use('/internal/security', require(path.join(ROOT, 'src/routes/security')));
  const srvA = http.createServer(appA);
  await new Promise((r) => srvA.listen(0, r));
  const baseA = `http://127.0.0.1:${srvA.address().port}/internal/security/outbound`;
  const adminPost = (body, key = 'k'.repeat(32)) => fetchReal(baseA, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': key }, body: JSON.stringify(body) });

  const obT = await M.Tenant.create({ business_name: 'SIT Outbound', outbound_enabled: false });

  await t('the outbound switch answers 404 without the admin key, never 401', async () => {
    const r = await fetchReal(baseA, { method: 'GET', headers: {} });
    assert.strictEqual(r.status, 404);
  });

  await t('enabling REFUSES without a workflow id - "ready" with nothing able to dial is worse', async () => {
    const r = await adminPost({ tenant: obT.id, confirm: true });
    assert.strictEqual(r.status, 422);
    assert.strictEqual((await r.json()).error, 'no_outbound_workflow');
  });

  await t('A WORKFLOW ID IS VERIFIED AGAINST HIGHLEVEL, NOT TAKEN ON TRUST', async () => {
    // A typo does not fail loudly: mayDial passes, the enrollment POSTs to a
    // workflow that is not there, and every contact errors one at a time while
    // the dashboard says outbound is ready.
    const r = await adminPost({ tenant: obT.id, confirm: true, workflow_id: 'wf-typo-999' });
    assert.strictEqual(r.status, 422);
    const j = await r.json();
    assert.strictEqual(j.error, 'workflow_not_found');
    assert.ok(j.available.some((w) => w.id === 'wf-published-001'), 'it did not offer the real workflows');
  });

  await t('a DRAFT workflow is refused - an enrollment would silently do nothing', async () => {
    const r = await adminPost({ tenant: obT.id, confirm: true, workflow_id: 'wf-draft-002' });
    assert.strictEqual(r.status, 422);
    assert.strictEqual((await r.json()).error, 'workflow_not_published');
  });

  await t('a HighLevel outage refuses rather than enabling unchecked', async () => {
    wfThrows = true;
    const r = await adminPost({ tenant: obT.id, confirm: true, workflow_id: 'wf-published-001' });
    wfThrows = false;
    assert.strictEqual(r.status, 502);
    assert.strictEqual((await r.json()).error, 'workflow_check_failed');
  });

  await t('AFTER EVERY REFUSAL NOTHING WAS WRITTEN', async () => {
    const row = await M.Tenant.findByPk(obT.id);
    assert.strictEqual(!!row.outbound_enabled, false, 'a refused call enabled outbound');
    assert.ok(!row.outbound_workflow_id, 'a refused call stored a workflow id');
  });

  await t('confirm is required - this is what lets a list start dialling real people', async () => {
    const r = await adminPost({ tenant: obT.id, workflow_id: 'wf-published-001' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual((await r.json()).error, 'confirm_required');
  });

  await t('a published workflow enables it, reports what it verified, and persists', async () => {
    const r = await adminPost({ tenant: obT.id, confirm: true, workflow_id: 'wf-published-001', daily_cap: 60 });
    assert.strictEqual(r.status, 200);
    const j = await r.json();
    assert.strictEqual(j.enabled, true);
    assert.strictEqual(j.workflow_verified.name, 'RinglyPro Outbound');
    assert.strictEqual(j.daily_cap, 60);
    assert.ok(/Do Not Call/i.test(j.reminder), 'the DNC gap is not restated on the way out');
    const row = await M.Tenant.findByPk(obT.id);
    assert.strictEqual(!!row.outbound_enabled, true);
    assert.strictEqual(row.outbound_workflow_id, 'wf-published-001');
  });

  await t('switching OFF keeps the workflow id, so turning it back on is one field', async () => {
    const r = await adminPost({ tenant: obT.id, confirm: true, enabled: false });
    assert.strictEqual(r.status, 200);
    const row = await M.Tenant.findByPk(obT.id);
    assert.strictEqual(!!row.outbound_enabled, false);
    assert.strictEqual(row.outbound_workflow_id, 'wf-published-001', 'a disable wiped the workflow');
  });

  await t('an unknown tenant is 404, and mayDial still refuses a tenant with no workflow', async () => {
    const r = await adminPost({ tenant: 999999, confirm: true, workflow_id: 'wf-published-001' });
    assert.strictEqual(r.status, 404);
    const bare = await M.Tenant.create({ business_name: 'No Workflow' });
    const gate = await ob.mayDial(bare, { phone: '+18135550100', status: 'new' }, new Date('2026-10-01T16:00:00Z'));
    assert.strictEqual(gate.ok, false);
    assert.strictEqual(gate.reason, 'outbound_not_enabled_for_this_tenant');
  });

  srvA.close();

  /* ── THE DIALER ─────────────────────────────────────────────────────────
   * "Activate" wrote status='active' and NOTHING read it. A tenant could
   * upload 139 contacts, press Activate and wait for calls that were never
   * going to happen, while the UI implied it had started.
   */
  const dialer = require(path.join(ROOT, 'src/services/outboundDialer'));
  let enrolled = [];
  ghlMod.call = async (m, pth, o) => {
    if (/\/workflow\//.test(pth)) { enrolled.push(pth); return { ok: true }; }
    if (String(pth).startsWith('/workflows')) return { workflows: WF };
    if (/contacts\/upsert/.test(pth)) return { contact: { id: 'c-' + (enrolled.length + 1) } };
    return {};
  };

  const dT = await M.Tenant.create({ business_name: 'Dialer Co', country: 'US',
    outbound_enabled: true, outbound_workflow_id: 'wf-published-001', outbound_daily_cap: 3,
    // BOTH GATES. `outbound_enabled` says the owner built the workflow;
    // `outbound_state` says the client paid. The dialer needs both, and the
    // wallet needs funding, or every call is refused before it starts.
    outbound_state: 'active' });
  const bill = require(path.join(ROOT, 'src/services/outboundBilling'));
  await bill.credit(dT.id, 100000);          // $1000, plenty for the pacing tests
  OB.lists.push({ id: 5001, tenant_id: dT.id, status: 'active' });
  OB.lists.push({ id: 5002, tenant_id: dT.id, status: 'draft' });
  let cid = 6000;
  const addContact = (phone, listId = 5001, status = 'pending') =>
    OB.contacts.push({ id: ++cid, tenant_id: dT.id, list_id: listId, phone,
      contact_name: 'Person ' + cid, status, attempts: 0 });
  // Tampa numbers: Eastern, so a mid-morning UTC time is inside the window.
  for (const n of ['+18135550101', '+18135550102', '+18135550103', '+18135550104']) addContact(n);
  addContact('+18135550999', 5002);                   // on the DRAFT list
  const noon = new Date('2026-10-01T15:00:00Z');      // 11:00 Eastern

  await t('a DRAFT list is never dialled - activation is what starts it', async () => {
    // The draft contact must be the ONLY candidate, or the pass ends on the
    // daily cap before reaching it and the test passes without testing:
    // removing the draft filter entirely changed nothing until this.
    OB.contacts.forEach((c) => { if (c.list_id === 5001) c.status = 'done'; });
    const draftRow = OB.contacts.find((c) => c.list_id === 5002);
    draftRow.status = 'pending';
    OB.calls.length = 0; enrolled = [];
    await dialer.runTenant(dT.id, { at: noon, limit: 10 });
    assert.strictEqual(enrolled.length, 0, 'it dialled a contact on a draft list');
    assert.strictEqual(draftRow.status, 'pending', 'a contact on a draft list was consumed');
  });

  await t('THE PASS IS PACED - it does not dump a whole list into HighLevel at once', async () => {
    OB.contacts.filter((c) => c.list_id === 5001).forEach((c) => { c.status = 'pending'; });
    OB.calls.length = 0; enrolled = [];
    await dialer.runTenant(dT.id, { at: noon, limit: 2 });
    assert.strictEqual(enrolled.length, 2, 'enrolled ' + enrolled.length + ' in one pass');
  });

  await t('the daily cap stops the pass, and stops it for the WHOLE tenant', async () => {
    // SIX candidates against a cap of THREE. With four, "stopped the pass" and
    // "refused each remaining contact one by one" produce identical counts, so
    // the whole-tenant break was untested; the surplus is what reveals it.
    for (const n of ['+18135550105', '+18135550106']) addContact(n);
    OB.contacts.forEach((c) => { if (c.list_id === 5001) c.status = 'pending'; });
    OB.contacts.forEach((c) => { if (c.list_id === 5002) c.status = 'done'; });
    OB.suppressions.length = 0;
    OB.calls.length = 0; enrolled = [];
    const r = await dialer.runTenant(dT.id, { at: noon, limit: 10 });
    assert.strictEqual(enrolled.length, 3, 'the cap of 3 let ' + enrolled.length + ' through');
    const capped = r.results.find((x) => /daily_cap/.test(x.reason || ''));
    assert.ok(capped, 'the cap refusal was not reported');
    assert.strictEqual(capped.transient, true, 'a capped contact was burned instead of left pending');
    assert.strictEqual(r.results.length, 4,
      'the pass kept going after the cap (' + r.results.length + ' results); it must stop for the tenant');
    assert.strictEqual(OB.contacts.filter((c) => c.list_id === 5001 && c.status === 'pending').length, 3,
      'contacts past the cap were consumed instead of left for tomorrow');
  });

  await t('OUTSIDE CALLING HOURS NOTHING DIALS, AND NOBODY IS BURNED', async () => {
    OB.contacts.filter((c) => c.list_id === 5001).forEach((c) => { c.status = 'pending'; });
    OB.calls.length = 0; enrolled = [];
    const night = new Date('2026-10-02T05:00:00Z');   // 01:00 Eastern
    const r = await dialer.runTenant(dT.id, { at: night, limit: 10 });
    assert.strictEqual(enrolled.length, 0, 'it dialled at 1am');
    assert.ok(r.results.every((x) => x.transient), 'a contact was marked skipped for a clock refusal');
    assert.strictEqual(OB.contacts.filter((c) => c.list_id === 5001 && c.status === 'pending').length, 6,
      'contacts were consumed by a refusal that will not be true later today');
  });

  await t('a SUPPRESSED number is refused by the dialer and never retried', async () => {
    OB.contacts.filter((c) => c.list_id === 5001).forEach((c) => { c.status = 'pending'; });
    OB.calls.length = 0; enrolled = [];
    await ob.suppress(dT.id, '+18135550101', 'asked to be removed', 'sit');
    const r = await dialer.runTenant(dT.id, { at: noon, limit: 10 });
    assert.ok(!enrolled.some((p) => /c-.*/.test(p) === false), 'sanity');
    const row = OB.contacts.find((c) => c.phone === '+18135550101');
    assert.strictEqual(row.status, 'suppressed', 'a do-not-call number stayed dialable');
    assert.ok(!r.results.some((x) => x.id === row.id && x.dialled), 'a suppressed number was dialled');
  });

  await t('a tenant that is switched OFF is not offered to the dialer at all', async () => {
    await dT.update({ outbound_enabled: false });
    const ids = await dialer.dialableTenants();
    assert.ok(!ids.includes(dT.id), 'a disabled tenant was still queued');
    await dT.update({ outbound_enabled: true });
  });

  await t('a tenant with no workflow is not offered either - it could only fail', async () => {
    await dT.update({ outbound_workflow_id: null });
    const ids = await dialer.dialableTenants();
    assert.ok(!ids.includes(dT.id), 'a tenant with no workflow was queued');
    await dT.update({ outbound_workflow_id: 'wf-published-001' });
  });

  await t('THE DIALER RE-CHECKS NOTHING ITSELF - every gate stays in mayDial', () => {
    // Two copies of the calling-hours or allow-list rules is how one of them
    // drifts and starts ringing people at 7am. The loop decides WHO and HOW
    // FAST; it must never decide WHETHER.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outboundDialer.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const forbidden of ['checkDestination', 'withinCallingHours', 'startHour', 'endHour', 'tzForNumber']) {
      assert.ok(!src.includes(forbidden),
        'the dialer re-implements ' + forbidden + ' instead of going through mayDial');
    }
    assert.ok(/ob\.dial\(/.test(src), 'the dialer does not go through ob.dial');
  });

  /* ── THE PAID ADD-ON: WALLET, STATE, SETTLEMENT ────────────────────────
   * Outbound costs the owner money per minute. Every test here is about a
   * way the client could be called without having paid, or charged for
   * something that did not happen.
   */
  const bl = require(path.join(ROOT, 'src/services/outboundBilling'));
  // THE FOUNDER'S OWN ACCOUNT EXISTS HERE, because "the owner is paged" is a
  // behavioural claim and an unresolvable owner silently skips the page.
  const OWNER_T = await M.Tenant.create({ business_name: 'RinglyPro (founder)' });
  await M.User.create({ tenant_id: OWNER_T.id, email: 'mstagg@digit2ai.com' });
  process.env.LITE_OUTBOUND_COST_PER_MIN_USD = '0.13';
  process.env.LITE_OUTBOUND_MARKUP = '2';
  process.env.LITE_OUTBOUND_RESERVE_MIN = '5';

  await t('the price is the owner cost x the markup, computed not hardcoded', () => {
    assert.strictEqual(bl.pricePerMinCents(), 26, 'expected 13c x 2 = 26c');
    process.env.LITE_OUTBOUND_MARKUP = '3';
    assert.strictEqual(bl.pricePerMinCents(), 39, 'changing the env did not change the price');
    process.env.LITE_OUTBOUND_MARKUP = '2';
    // No surface may carry a figure of its own — but a COMMENT explaining the
    // rule is not a violation of it. The first version of this check flagged
    // its own explanation, which is a trap this repo has fallen into before.
    const page = fs.readFileSync(path.join(ROOT, 'public/dashboard.html'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    assert.ok(!/\$0\.26|\$0,26/.test(page), 'the dashboard hardcodes a per-minute price');
  });

  await t('a call is charged per minute, ROUNDED UP, and zero seconds is free', () => {
    assert.strictEqual(bl.chargeForSeconds(0), 0, 'an unanswered call was charged');
    assert.strictEqual(bl.chargeForSeconds(1), 26, '1 second must round up to one minute');
    assert.strictEqual(bl.chargeForSeconds(60), 26);
    assert.strictEqual(bl.chargeForSeconds(61), 52, '61s must round up to two minutes');
    assert.strictEqual(bl.chargeForSeconds(100), 52);
  });

  // A tenant with the plumbing but NOT the payment.
  const unpaid = await M.Tenant.create({ business_name: 'Unpaid Co', country: 'US',
    outbound_enabled: true, outbound_workflow_id: 'wf-published-001', outbound_state: 'pending_setup' });
  await bl.credit(unpaid.id, 100000);

  await t('A TENANT WHO HAS NOT PAID CANNOT DIAL, even with the workflow and the money', async () => {
    const g = await ob.mayDial(unpaid, { phone: '+18135550300', status: 'new' }, new Date('2026-10-01T16:00:00Z'));
    assert.strictEqual(g.ok, false);
    assert.strictEqual(g.reason, 'outbound_not_activated');
  });

  // Active but broke.
  const broke = await M.Tenant.create({ business_name: 'Broke Co', country: 'US',
    outbound_enabled: true, outbound_workflow_id: 'wf-published-001', outbound_state: 'active' });

  await t('A TENANT WITH NO FUNDS CANNOT DIAL, even when fully activated', async () => {
    const g = await ob.mayDial(broke, { phone: '+18135550301', status: 'new' }, new Date('2026-10-01T16:00:00Z'));
    assert.strictEqual(g.ok, false);
    assert.strictEqual(g.reason, 'insufficient_credit');
  });

  await t('THE RESERVE IS ATOMIC — two dials against a one-call balance give ONE winner', async () => {
    const one = await M.Tenant.create({ business_name: 'One Call Co', outbound_state: 'active' });
    await bl.credit(one.id, bl.reserveCents());          // exactly one reserve
    const [a, b] = await Promise.all([bl.reserve(one.id), bl.reserve(one.id)]);
    const wins = [a, b].filter((x) => x.ok).length;
    assert.strictEqual(wins, 1, 'both dials reserved against the same money');
    const w = await bl.wallet(one.id);
    assert.ok(w.balance_cents >= 0, 'the balance went NEGATIVE: ' + w.balance_cents);
  });

  await t('a failed enrollment RELEASES the reserve — no money held for a call never placed', async () => {
    const f = await M.Tenant.create({ business_name: 'Enroll Fail Co', country: 'US',
      outbound_enabled: true, outbound_workflow_id: 'wf-published-001',
      outbound_state: 'active', outbound_daily_cap: 50 });
    await bl.credit(f.id, 50000);
    const before = (await bl.wallet(f.id)).balance_cents;
    OB.contacts.push({ id: 7777, tenant_id: f.id, list_id: 5001, phone: '+18135550302',
      contact_name: 'Fail Target', status: 'pending', attempts: 0 });
    const boom = ghlMod.call;
    ghlMod.call = async (m, pth) => {
      if (/\/workflow\//.test(pth)) { const e = new Error('HighLevel said no'); e.status = 422; throw e; }
      if (/contacts\/upsert/.test(pth)) return { contact: { id: 'c-fail' } };
      return {};
    };
    const r = await ob.dial(f, OB.contacts.find((c) => c.id === 7777), { at: new Date('2026-10-01T16:00:00Z') });
    ghlMod.call = boom;
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'enroll_failed');
    const after = await bl.wallet(f.id);
    assert.strictEqual(after.balance_cents, before, 'the reserve was not returned');
    assert.strictEqual(after.reserved_cents, 0, 'money is still held for a call that never happened');
  });

  await t('SETTLEMENT charges the real duration and releases the rest', async () => {
    const st = await M.Tenant.create({ business_name: 'Settle Co', outbound_state: 'active' });
    await bl.credit(st.id, 50000);
    const held = await bl.reserve(st.id);
    OB.calls.push({ id: ++OB_CALL_SEQ, tenant_id: st.id, contact_id: 1, list_id: null,
      enrolled_at: new Date(), reserved_cents: held.reserved_cents, settled_at: null });
    const callRow = OB.calls[OB.calls.length - 1].id;
    const before = (await bl.wallet(st.id)).balance_cents;

    const r = await bl.settle(st.id, callRow, { durationSec: 95, outcome: 'message' });
    assert.strictEqual(r.settled, true);
    assert.strictEqual(r.charged_cents, 52, '95s must be two minutes at 26c');
    assert.strictEqual(r.released_cents, held.reserved_cents - 52);
    const after = await bl.wallet(st.id);
    assert.strictEqual(after.balance_cents, before + (held.reserved_cents - 52));
    assert.strictEqual(after.reserved_cents, 0, 'the hold was not cleared');

    // RE-SETTLING THE SAME CALL MUST DO NOTHING. The poller re-reads a 3h
    // window every two minutes, so it WILL see this log again.
    const again = await bl.settle(st.id, callRow, { durationSec: 95 });
    assert.strictEqual(again.settled, false);
    assert.strictEqual((await bl.wallet(st.id)).balance_cents, after.balance_cents, 'it charged twice');
  });

  await t('A LONG CALL IS CHARGED IN FULL — capping it at the reserve made it nearly free', async () => {
    // The first version capped the charge at the 5-minute reserve, so a
    // 60-minute call cost the client $1.30 while HighLevel billed the owner
    // $7.80 — and a client dialling a number they control and leaving it off
    // the hook turned that into an uncapped loss on every top-up.
    const lg = await M.Tenant.create({ business_name: 'Long Call Co', outbound_state: 'active' });
    await bl.credit(lg.id, 200);                    // deliberately less than the call costs
    const held = await bl.reserve(lg.id);
    OB.calls.push({ id: ++OB_CALL_SEQ, tenant_id: lg.id, contact_id: 1,
      enrolled_at: new Date(), reserved_cents: held.reserved_cents, settled_at: null });
    const r = await bl.settle(lg.id, OB.calls[OB.calls.length - 1].id, { durationSec: 3600 });
    assert.strictEqual(r.charged_cents, 60 * 26, 'a 60-minute call was not charged 60 minutes');
    assert.ok(r.overrun_cents > 0, 'the overrun was not reported');
    const w = await bl.wallet(lg.id);
    assert.ok(w.balance_cents < 0, 'the overrun was absorbed instead of billed');
    // And a negative balance must STOP the next call rather than continue.
    assert.strictEqual(w.can_place_a_call, false);
    assert.strictEqual((await bl.reserve(lg.id)).ok, false);
  });

  await t('SETTLEMENT MATCHES ON contactId, NEVER ON THE PHONE NUMBER', () => {
    // One shared HighLevel sub-account serves every tenant, so matching on
    // `fromNumber` — a field whose meaning on an outbound call is UNVERIFIED —
    // would one day settle one client's call against another's wallet.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outboundBilling.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function settleFromCallLog'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.ok(/ghl_contact_id/.test(body), 'settlement does not key on the contact id');
    assert.ok(!/fromNumber|\bcaller\b|\.phone\b/.test(body.replace(/\/\*[\s\S]*?\*\//g, '')),
      'settlement reads a phone number — that is the cross-tenant billing bug');
  });

  await t('AN OUTBOUND CALL NEVER BECOMES A "SOMEBODY CALLED YOU" MESSAGE', async () => {
    // The poller mirrors inbound calls into the Messages tab. Without the
    // claim, every outbound call the client PAID FOR also lands there as a
    // missed call, and the owner gets texted about it.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/ghlCallLogs.js'), 'utf8');
    const i1 = src.indexOf('settleFromCallLog'), i2 = src.indexOf('mirror.storeCallResult');
    assert.ok(i1 > 0 && i2 > 0 && i1 < i2, 'the mirror runs before the outbound claim');
    assert.ok(/if \(ob\.claimed\)[\s\S]{0,200}continue;/.test(src),
      'a claimed outbound call is not skipped before the mirror');

    // And behaviourally: an already-settled outbound call is STILL claimed,
    // so a re-poll cannot leak it into the inbox later.
    const oc = await M.Tenant.create({ business_name: 'Claim Co', outbound_state: 'active' });
    OB.contacts.push({ id: 8888, tenant_id: oc.id, list_id: 5001, phone: '+18135550303',
      status: 'dialled', ghl_contact_id: 'gc-claimed', attempts: 1 });
    OB.calls.push({ id: ++OB_CALL_SEQ, tenant_id: oc.id, contact_id: 8888,
      enrolled_at: new Date(), reserved_cents: 0, settled_at: new Date() });
    const c = await bl.settleFromCallLog({ contactId: 'gc-claimed', durationSec: 30, callId: 'log-1' }, { tenantId: oc.id });
    assert.strictEqual(c.claimed, true, 'an already-settled outbound call was handed to the inbox mirror');
    assert.strictEqual(c.settled, false);
  });

  await t('a call log that is NOT ours is left for the inbound mirror', async () => {
    const c = await bl.settleFromCallLog({ contactId: 'gc-a-stranger', durationSec: 30 }, { tenantId: 1 });
    assert.strictEqual(c.claimed, false);
  });

  await t('A MISSING LOG READS "no result recorded", NEVER "not answered"', async () => {
    // Different facts. We know one call was not answered; we know nothing
    // about the other. Reporting the second as the first is a fabrication.
    const nl = await M.Tenant.create({ business_name: 'No Log Co', outbound_state: 'active' });
    await bl.credit(nl.id, 50000);
    const held = await bl.reserve(nl.id);
    OB.contacts.push({ id: 9001, tenant_id: nl.id, list_id: 5001, phone: '+18135550304', status: 'dialled' });
    OB.calls.push({ id: ++OB_CALL_SEQ, tenant_id: nl.id, contact_id: 9001,
      enrolled_at: new Date(), reserved_cents: held.reserved_cents, settled_at: null });
    const id = OB.calls[OB.calls.length - 1].id;
    await bl.settle(nl.id, id, { durationSec: 0, outcome: 'no_log' });
    const rep = await bl.callReport(nl.id, { limit: 10 });
    const row = rep.find((r) => r.id === id);
    assert.ok(row, 'the call is missing from the report');
    assert.strictEqual(row.outcome, 'no_result_recorded');
    assert.strictEqual(row.charged_cents, 0, 'a call we know nothing about was charged');
  });

  await t('the report shows what was CHARGED, not a figure recomputed at render', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outboundBilling.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function callReport'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.ok(/charged_cents/.test(body));
    assert.ok(!/chargeForSeconds|pricePerMinCents/.test(body),
      'the report recomputes a price — it must read the settled figure');
  });

  /* ── PAYING AND ACTUALLY GETTING IT ────────────────────────────────────
   * The first live activation: the owner paid by Apple Pay, Stripe returned
   * them to the dashboard, and NOTHING had happened — the webhook was the
   * only path to their money and it had not delivered. They were then offered
   * "Activate — $20.00" again. These tests are that failure. */

  await t('CONFIRM READS NOTHING FROM THE REQUEST — the return URL is public', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/outbound.js'), 'utf8');
    const fn = src.slice(src.indexOf("router.post('/confirm'"));
    const body = fn.slice(0, fn.indexOf('\n});'));
    // Anyone can visit the success URL, with any query string they like. If
    // the handler believed a session id from the browser, a stranger could
    // apply somebody else's payment — or their own, twice.
    assert.ok(!/req\.body|req\.query|req\.params/.test(body),
      'confirm trusts the request — a public return URL must not be evidence of payment');
    assert.ok(/tenant_id = :t/.test(body), 'confirm is not scoped to the caller\'s own rows');
    assert.ok(/billing\.recoverable/.test(body),
      'confirm does not check what Stripe itself says about the session');
  });

  await t('BOTH PATHS SHARE ONE WRITER, so whichever arrives first wins and the other is a no-op', () => {
    const wh = fs.readFileSync(path.join(ROOT, 'src/routes/webhooks.js'), 'utf8');
    const fn = wh.slice(wh.indexOf('async function handleOutbound'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    // Two copies of "credit the wallet and move the state" drift the moment
    // one learns something the other does not, and which one runs depends on
    // whether a webhook secret happens to be set.
    assert.ok(/billing\.applyPayment/.test(body), 'the webhook does not delegate to the shared writer');
    assert.ok(!/credit\(|transition\(/.test(body), 'the webhook has its own second copy of the money logic');
    const ob = fs.readFileSync(path.join(ROOT, 'src/routes/outbound.js'), 'utf8');
    const cf = ob.slice(ob.indexOf("router.post('/confirm'"));
    assert.ok(/billing\.applyPayment/.test(cf.slice(0, cf.indexOf('\n});'))),
      'confirm does not use the same writer as the webhook');
  });

  await t('a paid session moves the tenant and tells the owner to build the workflow', async () => {
    const pay = await M.Tenant.create({ business_name: 'Paid Co', outbound_state: 'awaiting_setup_payment' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: pay.id, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_paid_1', status: 'open', stripe_event_id: null });
    const before = OB.notifs.length;
    const out = await bl.applyPayment(pay, { id: 'cs_paid_1', amount_total: 2000 }, { eventId: 'evt_1' });
    assert.strictEqual(out.applied, true);
    assert.strictEqual(out.kind, 'setup');
    const fresh = await M.Tenant.findByPk(pay.id);
    assert.strictEqual(fresh.outbound_state, 'pending_setup', 'paying did not move the tenant');
    assert.ok(fresh.outbound_setup_due_at, 'no promised time was recorded');
    const fired = OB.notifs.slice(before);
    assert.ok(fired.some((n) => n.tenant_id === pay.id && n.kind === 'outbound_setup_paid'),
      'the client was not told their payment landed');
    assert.ok(fired.some((n) => n.kind === 'owner_setup_paid'),
      'the owner was not told to build the workflow — the client would wait for ever');
  });

  await t('APPLYING THE SAME SESSION TWICE CHANGES NOTHING', async () => {
    // The webhook and the confirm poll can both reach a session. The second
    // one must be a no-op, not a second $20 or a second wallet credit.
    const twice = await M.Tenant.create({ business_name: 'Twice Co', outbound_state: 'active' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: twice.id, kind: 'credit',
      amount_cents: 5000, stripe_session_id: 'cs_twice', status: 'open', stripe_event_id: null });
    const a = await bl.applyPayment(twice, { id: 'cs_twice', amount_total: 5000 }, {});
    const b = await bl.applyPayment(twice, { id: 'cs_twice', amount_total: 5000 }, {});
    assert.strictEqual(a.applied, true);
    assert.strictEqual(b.applied, false, 'the same payment was applied twice');
    assert.strictEqual((await bl.wallet(twice.id)).balance_cents, 5000,
      'the wallet was credited twice for one payment');
  });

  await t('one Stripe EVENT cannot be applied through two rows', async () => {
    const ev = await M.Tenant.create({ business_name: 'Event Co', outbound_state: 'active' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: ev.id, kind: 'credit',
      amount_cents: 1000, stripe_session_id: 'cs_ev_a', status: 'open', stripe_event_id: null });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: ev.id, kind: 'credit',
      amount_cents: 1000, stripe_session_id: 'cs_ev_b', status: 'open', stripe_event_id: null });
    await bl.applyPayment(ev, { id: 'cs_ev_a', amount_total: 1000 }, { eventId: 'evt_same' });
    const second = await bl.applyPayment(ev, { id: 'cs_ev_b', amount_total: 1000 }, { eventId: 'evt_same' });
    assert.strictEqual(second.applied, false, 'a replayed event credited a second row');
    assert.strictEqual((await bl.wallet(ev.id)).balance_cents, 1000);
  });

  await t('CREDITING MORE THAN ARRIVED IS REFUSED — the smaller of the two figures wins', async () => {
    const sm = await M.Tenant.create({ business_name: 'Small Co', outbound_state: 'active' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: sm.id, kind: 'credit',
      amount_cents: 20000, stripe_session_id: 'cs_small', status: 'open', stripe_event_id: null });
    // Our row says $200; Stripe says $1 arrived. Believe Stripe.
    await bl.applyPayment(sm, { id: 'cs_small', amount_total: 100 }, {});
    assert.strictEqual((await bl.wallet(sm.id)).balance_cents, 100,
      'the wallet was credited our own figure rather than what Stripe took');
  });

  await t('a session belonging to ANOTHER tenant applies nothing', async () => {
    const mine = await M.Tenant.create({ business_name: 'Mine Co', outbound_state: 'active' });
    const yours = await M.Tenant.create({ business_name: 'Yours Co', outbound_state: 'active' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: yours.id, kind: 'credit',
      amount_cents: 9900, stripe_session_id: 'cs_yours', status: 'open', stripe_event_id: null });
    const out = await bl.applyPayment(mine, { id: 'cs_yours', amount_total: 9900 }, {});
    assert.strictEqual(out.applied, false, 'one tenant applied another tenant\'s payment');
    assert.strictEqual((await bl.wallet(mine.id)).balance_cents, 0);
    assert.strictEqual((await bl.wallet(yours.id)).balance_cents, 0, 'the real owner lost the credit too');
  });

  await t('PAYING THE SETUP FEE TWICE IS REPORTED FOR REFUND, never swallowed', async () => {
    const dup = await M.Tenant.create({ business_name: 'Dup Co', outbound_state: 'awaiting_setup_payment' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: dup.id, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_dup_1', status: 'open', stripe_event_id: null });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: dup.id, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_dup_2', status: 'open', stripe_event_id: null });
    await bl.applyPayment(dup, { id: 'cs_dup_1', amount_total: 2000 }, {});
    const before = OB.notifs.length;
    const out = await bl.applyPayment(dup, { id: 'cs_dup_2', amount_total: 2000 }, {});
    assert.strictEqual(out.refund_due, true, 'a second setup charge was absorbed silently');
    const fired = OB.notifs.slice(before);
    assert.ok(fired.some((n) => n.kind === 'outbound_duplicate_fee' && n.tenant_id === dup.id),
      'the client was not told they were charged twice');
    assert.ok(fired.some((n) => n.kind === 'owner_refund_due'),
      'nobody was told to issue the refund');
  });

  await t('A SECOND TAP ON ACTIVATE STILL LEAVES A PAYABLE STATE', () => {
    // The reuse branch returned the open checkout URL and skipped the
    // transition, so the tenant stayed 'off' and the tab kept offering
    // "Activate — $20.00" to somebody who already had a checkout open.
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/outbound.js'), 'utf8');
    const fn = src.slice(src.indexOf("router.post('/activate'"), src.indexOf("router.post('/confirm'"));
    const reuse = fn.slice(fn.indexOf('reused: true') - 900, fn.indexOf('reused: true'));
    assert.ok(/billing\.transition/.test(reuse),
      'the reuse path does not move the tenant — the tab will re-offer Activate');
  });

  await t('THE CLIENT LANDS ON OUTBOUND AFTER PAYING, and the URL is cleaned', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/dashboard.html'), 'utf8');
    // Stripe sent them back to whatever tab was last open (Messages), so the
    // payment looked like it had failed and they were about to pay again.
    const i = src.indexOf('[?&]outbound=');
    assert.ok(i > 0, 'nothing handles the Stripe return');
    const h = src.slice(i, i + 1600);
    assert.ok(/data-view="outbound"/.test(h), 'the return does not switch to the Outbound tab');
    assert.ok(/replaceState/.test(h), 'the URL is not cleaned — a refresh would re-run the return');
    assert.ok(/outbound\/confirm/.test(h), 'the return does not ask the server to confirm');
    assert.ok(/obConfirmSlow/.test(h),
      'a payment that has not cleared shows nothing — the client would pay twice');
    // And the success URL must actually carry the parameter the page reads.
    // EVERY success URL, not just one. The first version of this check passed
    // with the activate URL stripped, because the topup URL still matched.
    const rt = fs.readFileSync(path.join(ROOT, 'src/routes/outbound.js'), 'utf8');
    const urls = rt.match(/success_url:[^\n]*/g) || [];
    assert.ok(urls.length >= 2, 'expected a success URL for both the setup fee and a top-up');
    for (const u of urls) {
      assert.ok(/outbound=/.test(u),
        'Stripe is told to return to a URL the dashboard does not recognise: ' + u.trim());
    }
  });

  await t('AN UNCONFIRMED PAYMENT SELF-HEALS when the tab is opened', () => {
    // Somebody who paid and closed the tab has no ?outbound= to come back
    // with. Without this their money is stuck until a human notices.
    const src = fs.readFileSync(path.join(ROOT, 'public/dashboard.html'), 'utf8');
    const i = src.indexOf('__obConfirmTried');
    assert.ok(i > 0, 'there is no self-heal at all');
    const heal = src.slice(i - 900, i + 500);
    assert.ok(/outbound\/confirm/.test(heal), 'the self-heal does not ask the server to confirm');
    // IT MUST NOT BE SCOPED TO ONE STATE. The tab the owner came back to read
    // "Activate — $20.00", so they were in 'off' — the state the /activate
    // reuse bug left them in. A recovery that only fires in
    // awaiting_setup_payment would have missed the very case it is for.
    assert.ok(!/awaiting_setup_payment/.test(heal),
      'the self-heal only covers one state — it would miss the case it was written for');
    assert.ok(/open_payments/.test(heal),
      'the self-heal reaches Stripe for tenants with no payment in flight');
    // And the server has to supply that flag, or the condition is never true.
    const rt = fs.readFileSync(path.join(ROOT, 'src/routes/outbound.js'), 'utf8');
    assert.ok(/open_payments: openPayments/.test(rt), '/plan does not report a checkout in flight');
  });

  /* ── RECOVERING A PAYMENT OUR OWN ROW CANNOT SEE ───────────────────────
   * The last way $20 can be lost: the row that names the session is missing,
   * so nothing on our side points at real money. */

  await t("THE OWNER'S OWN SHAPE: one paid session, one unpaid retap", () => {
    // Measured in Stripe 2026-09-27: tenant 4 paid $20 at 22:00, then tapped
    // Activate again at 23:48 and abandoned it. Applying the second one would
    // move the tenant on a checkout nobody paid.
    const sessions = [
      { id: 'cs_open_2348', payment_status: 'unpaid', status: 'open', amount_total: 2000,
        metadata: { kind: 'lite_outbound_setup', tenant_id: '4' } },
      { id: 'cs_paid_2200', payment_status: 'paid', status: 'complete', amount_total: 2000,
        metadata: { kind: 'lite_outbound_setup', tenant_id: '4' } },
    ];
    const got = bl.recoverable(sessions, 4, new Set());
    assert.strictEqual(got.length, 1, 'expected exactly the paid session');
    assert.strictEqual(got[0].session.id, 'cs_paid_2200');
    assert.strictEqual(got[0].kind, 'setup');
    assert.strictEqual(got[0].amount_cents, 2000);
  });

  await t('A PAID SESSION BELONGING TO ANOTHER TENANT IS NEVER ADOPTED', () => {
    // One Stripe account serves every tenant, so the listing returns everyone's
    // sessions. Without the tenant check this route would hand any caller the
    // next client's payment.
    const sessions = [{ id: 'cs_theirs', payment_status: 'paid', amount_total: 9900,
      metadata: { kind: 'lite_outbound_topup', tenant_id: '77' } }];
    assert.strictEqual(bl.recoverable(sessions, 4, new Set()).length, 0);
    assert.strictEqual(bl.recoverable(sessions, 77, new Set()).length, 1, 'the real owner cannot claim it either');
  });

  await t('a session already covered by a row is not adopted a second time', () => {
    const sessions = [{ id: 'cs_known', payment_status: 'paid', amount_total: 2000,
      metadata: { kind: 'lite_outbound_setup', tenant_id: '4' } }];
    assert.strictEqual(bl.recoverable(sessions, 4, new Set(['cs_known'])).length, 0);
  });

  await t('AN UNRECOGNISED KIND IS SKIPPED, never guessed into a wallet credit', () => {
    const sessions = [
      { id: 'cs_other', payment_status: 'paid', amount_total: 50000,
        metadata: { kind: 'lite_outbound_something_new', tenant_id: '4' } },
      { id: 'cs_sub', payment_status: 'paid', amount_total: 2600,
        metadata: { kind: 'lite_subscription', tenant_id: '4' } },
      { id: 'cs_none', payment_status: 'paid', amount_total: 2600, metadata: {} },
      { id: 'cs_zero', payment_status: 'paid', amount_total: 0,
        metadata: { kind: 'lite_outbound_topup', tenant_id: '4' } },
    ];
    assert.deepStrictEqual(bl.recoverable(sessions, 4, new Set()), [],
      'a session we do not understand was turned into money');
  });

  await t('the recovered payment goes through the SAME writer, so it cannot double-apply', async () => {
    const rec = await M.Tenant.create({ business_name: 'Recover Co', outbound_state: 'off' });
    const sess = { id: 'cs_recover', amount_total: 2000,
      payment_status: 'paid', metadata: { kind: 'lite_outbound_setup', tenant_id: String(rec.id) } };
    const cand = bl.recoverable([sess], rec.id, new Set());
    assert.strictEqual(cand.length, 1);
    // What the route does: insert the missing row, then hand it to applyPayment.
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: rec.id, kind: cand[0].kind,
      amount_cents: cand[0].amount_cents, stripe_session_id: sess.id, status: 'open', stripe_event_id: null });
    const a = await bl.applyPayment(rec, sess, {});
    assert.strictEqual(a.applied, true);
    assert.strictEqual((await M.Tenant.findByPk(rec.id)).outbound_state, 'pending_setup');
    const b = await bl.applyPayment(rec, sess, {});
    assert.strictEqual(b.applied, false, 'a recovered payment applied twice');
  });

  await t('THE SWEEP IS A MONEY RULE AND LIVES IN THE SERVICE, not the route', () => {
    const rt = fs.readFileSync(path.join(ROOT, 'src/routes/outbound.js'), 'utf8');
    const fn = rt.slice(rt.indexOf("router.post('/confirm'"));
    const body = fn.slice(0, fn.indexOf('\n});'));
    assert.ok(/billing\.recoverable/.test(body), 'the route decides for itself what counts as paid');
    // The route must not re-implement the checks; that is how two copies drift.
    assert.ok(!/payment_status/.test(body),
      'the route inspects payment_status itself — the rule belongs in one place');
    assert.ok(!/INSERT INTO lite_outbound_payments/.test(body),
      'the route inserts payment rows as well as the sweep');
    const sw = fs.readFileSync(path.join(ROOT, 'src/services/paymentSweep.js'), 'utf8');
    assert.ok(/ON CONFLICT DO NOTHING/.test(sw),
      'two concurrent sweeps could insert the same session twice');
    assert.ok(/recoverable\(list\.data, id, new Set\(\)\)/.test(sw), 'the sweep is not scoped per tenant');
  });

  await t('THE LIVE BUILD IS REPORTABLE, or "is it deployed?" has no answer', () => {
    // Nothing reported which commit was running, so verifying a deploy meant
    // hunting for a string that happened to differ in a served page.
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/voice-relay.js'), 'utf8');
    assert.ok(/RENDER_GIT_COMMIT/.test(src), '/voice/health does not report the build');
    assert.ok(/booted_at/.test(src), 'nothing says whether the instance restarted');
    // A commit of a public repo is not a secret. What the block must NOT do is
    // grow into a dump of the environment, so it is checked for exactly the two
    // fields. (The first version of this test grepped the whole FILE for
    // secret-shaped names and flagged the ?check=ghl admin gate, which reads
    // the key only to COMPARE it — the assertion was wrong, not the code.)
    // Bounded to the block, not a fixed character count: a wide window ran
    // past the closing brace and picked up the next field's own env read.
    const bi = src.indexOf('build: {');
    const blk = src.slice(bi, src.indexOf('},', bi) + 2);
    assert.ok(/slice\(0, 7\)/.test(blk), 'the commit is not truncated');
    const envs = blk.match(/process\.env\.[A-Z_]+/g) || [];
    assert.deepStrictEqual(envs, ['process.env.RENDER_GIT_COMMIT'],
      'the build block reads an environment variable other than the commit');
  });

  /* ── THE PAYMENT IS APPLIED WITH NOBODY WATCHING ───────────────────────
   * /confirm needs somebody to open the tab. This is the same money, applied
   * by the server on a timer. */

  const psweep = require(path.join(ROOT, 'src/services/paymentSweep'));

  await t('AN UNCONFIRMED PAYMENT IS APPLIED WITH NO TAB OPEN', async () => {
    const un = await M.Tenant.create({ business_name: 'Unattended Co', outbound_state: 'awaiting_setup_payment' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: un.id, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_sweep_1', status: 'open', stripe_event_id: null });
    const fake = { checkout: { sessions: { list: async () => ({ data: [
      { id: 'cs_sweep_1', payment_status: 'paid', amount_total: 2000,
        metadata: { kind: 'lite_outbound_setup', tenant_id: String(un.id) } }] }) } } };
    const r = await psweep.run({ client: fake });
    assert.ok(r.ok, 'the sweep did not run');
    assert.ok(r.applied.some((a) => a.tenant === un.id), 'the payment was not applied');
    assert.strictEqual((await M.Tenant.findByPk(un.id)).outbound_state, 'pending_setup');
  });

  await t('NOTHING OUTSTANDING COSTS NO STRIPE CALL', async () => {
    // The poller runs every few minutes for ever; on a quiet account it must be
    // one indexed query and nothing else.
    let calls = 0;
    const fake = { checkout: { sessions: { list: async () => { calls++; return { data: [] }; } } } };
    const quiet = await M.Tenant.create({ business_name: 'Quiet Co' });
    const r = await psweep.run({ tenantId: quiet.id, client: fake });
    assert.strictEqual(r.tenants, 0);
    assert.strictEqual(calls, 0, 'the sweep asked Stripe with nothing outstanding');
  });

  await t("a scoped sweep applies ONE tenant's payment and never the neighbour's", async () => {
    const a = await M.Tenant.create({ business_name: 'Sweep A', outbound_state: 'awaiting_setup_payment' });
    const b = await M.Tenant.create({ business_name: 'Sweep B', outbound_state: 'awaiting_setup_payment' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: a.id, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_sw_a', status: 'open', stripe_event_id: null });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: b.id, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_sw_b', status: 'open', stripe_event_id: null });
    const data = [
      { id: 'cs_sw_a', payment_status: 'paid', amount_total: 2000,
        metadata: { kind: 'lite_outbound_setup', tenant_id: String(a.id) } },
      { id: 'cs_sw_b', payment_status: 'paid', amount_total: 2000,
        metadata: { kind: 'lite_outbound_setup', tenant_id: String(b.id) } },
    ];
    const fake = { checkout: { sessions: { list: async () => ({ data }) } } };
    const r = await psweep.run({ tenantId: a.id, client: fake });
    assert.deepStrictEqual(r.applied.map((x) => x.tenant), [a.id],
      "a scoped sweep applied another tenant's payment");
    assert.strictEqual((await M.Tenant.findByPk(b.id)).outbound_state, 'awaiting_setup_payment',
      "the neighbour's tenant row was moved");
  });

  await t('ONE TENANT FAILING DOES NOT STARVE THE REST', async () => {
    const ok1 = await M.Tenant.create({ business_name: 'Ok One', outbound_state: 'awaiting_setup_payment' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: ok1.id, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_ok1', status: 'open', stripe_event_id: null });
    // A row whose apply throws must not stop the tenant after it being paid.
    const boom = await M.Tenant.create({ business_name: 'Boom Co', outbound_state: 'awaiting_setup_payment' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: boom.id, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_boom', status: 'open', stripe_event_id: null });
    const data = [
      { id: 'cs_boom', payment_status: 'paid', amount_total: 2000,
        metadata: { kind: 'lite_outbound_setup', tenant_id: String(boom.id) } },
      { id: 'cs_ok1', payment_status: 'paid', amount_total: 2000,
        metadata: { kind: 'lite_outbound_setup', tenant_id: String(ok1.id) } },
    ];
    const fake = { checkout: { sessions: { list: async () => ({ data }) } } };
    const realApply = bl.applyPayment;
    bl.applyPayment = async (t2, sess, o) => {
      if (sess.id === 'cs_boom') throw new Error('deliberate failure');
      return realApply(t2, sess, o);
    };
    let r;
    try { r = await psweep.run({ client: fake }); }
    finally { bl.applyPayment = realApply; }
    assert.ok(r && r.ok, 'one tenant failing aborted the whole pass');
    assert.ok(r.applied.some((x) => x.tenant === ok1.id), 'the good tenant was skipped');
  });

  await t('A PAYMENT ROW WHOSE TENANT IS GONE IS SKIPPED, not thrown', async () => {
    // The row outlives the tenant if an account is removed, and the ids come
    // from the ROWS. Throwing here would stop every later tenant's payment.
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: 999777, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_orphan', status: 'open', stripe_event_id: null });
    const live = await M.Tenant.create({ business_name: 'Live Co', outbound_state: 'awaiting_setup_payment' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: live.id, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_live_after_orphan', status: 'open', stripe_event_id: null });
    const data = [
      { id: 'cs_orphan', payment_status: 'paid', amount_total: 2000,
        metadata: { kind: 'lite_outbound_setup', tenant_id: '999777' } },
      { id: 'cs_live_after_orphan', payment_status: 'paid', amount_total: 2000,
        metadata: { kind: 'lite_outbound_setup', tenant_id: String(live.id) } },
    ];
    const fake = { checkout: { sessions: { list: async () => ({ data }) } } };
    const r = await psweep.run({ client: fake });
    assert.ok(r.ok, 'an orphaned payment row aborted the pass');
    assert.ok(r.applied.some((x) => x.tenant === live.id),
      'a tenant after the orphan never got their payment');
    assert.ok(!r.applied.some((x) => x.tenant === 999777), 'money was applied to a tenant that is gone');
  });

  await t('STRIPE BEING UNREACHABLE IS REPORTED, never read as "nothing to apply"', async () => {
    const dn = await M.Tenant.create({ business_name: 'Down Co', outbound_state: 'awaiting_setup_payment' });
    OB.payments.push({ id: OB.payments.length + 1, tenant_id: dn.id, kind: 'setup',
      amount_cents: 2000, stripe_session_id: 'cs_down', status: 'open', stripe_event_id: null });
    const fake = { checkout: { sessions: { list: async () => { throw new Error('network down'); } } } };
    const r = await psweep.run({ tenantId: dn.id, client: fake });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'stripe_unreachable');
    assert.strictEqual((await M.Tenant.findByPk(dn.id)).outbound_state, 'awaiting_setup_payment');
  });

  await t('SWEEPING PAYMENTS IS NOT GATED ON DIALLING', () => {
    // A client who has paid but has no workflow yet is exactly the client whose
    // dialer is off. Putting this in the dialer's tick would mean turning
    // dialling off stops applying money.
    const raw = fs.readFileSync(path.join(ROOT, 'src/services/paymentSweep.js'), 'utf8');
    // COMMENTS STRIPPED FIRST: the file EXPLAINS why it is not coupled to the
    // dialer, and a check of this shape has flagged its own explanation before.
    const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
    assert.ok(!/LITE_OUTBOUND_DIALER/.test(strip(raw)), 'the payment sweep reads the dialer switch');
    const dialer = strip(fs.readFileSync(path.join(ROOT, 'src/services/outboundDialer.js'), 'utf8'));
    assert.ok(!/paymentSweep/.test(dialer), 'the sweep was folded into the dialer tick');
    const boot = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert.ok(/paymentSweep'\)\.start\(\)/.test(boot), 'the sweep is never started');
    assert.ok(/LOCK_ID = 9182736(?!45)/.test(raw), 'the sweep shares the dialer advisory lock');
  });

  await t('WHETHER THE SWEEP RAN IS REPORTABLE, and only behind the key', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/security.js'), 'utf8');
    assert.ok(/payment_sweep:/.test(src), '/internal/security does not report the sweep');
    // It must be on the ADMIN report, never the open health body.
    const vr = fs.readFileSync(path.join(ROOT, 'src/routes/voice-relay.js'), 'utf8');
    assert.ok(!/payment_sweep/.test(vr), 'the sweep counters are on the open health endpoint');
    const ps = fs.readFileSync(path.join(ROOT, 'src/services/paymentSweep.js'), 'utf8');
    const blk = ps.slice(ps.indexOf('const stats = {'), ps.indexOf('};', ps.indexOf('const stats = {')));
    // Counters and timestamps only: no session id, no tenant, no amount.
    assert.ok(!/session|tenant|amount_cents/.test(blk),
      'the reported counters carry a session, a tenant or an amount');
  });

  await t('THE SWEEP USES THE KEY THE CHECKOUT WAS CREATED WITH', () => {
    // The route prefers LITE_STRIPE_SECRET_KEY; reading only STRIPE_SECRET_KEY
    // would point the sweep at a different account from the one holding the money.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/paymentSweep.js'), 'utf8');
    const rt = fs.readFileSync(path.join(ROOT, 'src/routes/outbound.js'), 'utf8');
    const want = /LITE_STRIPE_SECRET_KEY \|\| process\.env\.STRIPE_SECRET_KEY/;
    assert.ok(want.test(src), 'the sweep does not read the same key, in the same order, as the checkout');
    assert.ok(want.test(rt));
  });

  await t('/confirm delegates to the same sweep, so there is one copy of the rule', () => {
    const rt = fs.readFileSync(path.join(ROOT, 'src/routes/outbound.js'), 'utf8');
    const fn = rt.slice(rt.indexOf("router.post('/confirm'"));
    const body = fn.slice(0, fn.indexOf('\n});'));
    assert.ok(/paymentSweep'\)\.run\(\{ tenantId: req\.tenantId \}\)/.test(body),
      'confirm has its own second copy of the sweep');
    assert.ok(!/checkout\.sessions\.list/.test(body), 'confirm still lists sessions itself');
  });

  await t('the state machine is a compare-and-swap, so a webhook retry cannot double-activate', async () => {
    const sm = await M.Tenant.create({ business_name: 'State Co', outbound_state: 'awaiting_setup_payment' });
    const a = await bl.transition(sm.id, ['off', 'awaiting_setup_payment'], 'pending_setup');
    const b = await bl.transition(sm.id, ['off', 'awaiting_setup_payment'], 'pending_setup');
    assert.strictEqual(a.moved, true);
    assert.strictEqual(b.moved, false, 'a replayed transition moved the row a second time');
  });

  await t('THERE IS NO MAIL TRANSPORT, AND NONE MAY COME BACK', () => {
    // Owner decision 2026-09-27: everything is a dashboard notification.
    // Server-sent mail across this estate has been landing in spam, and a
    // notification that reaches a spam folder is worse than none because it
    // looks delivered. Comments are stripped first — the file EXPLAINS why
    // SendGrid is gone, and an earlier check of this shape flagged its own
    // explanation.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/notify.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
    for (const t2 of ['sendgrid', 'nodemailer', 'smtp', 'mailgun', 'postmark']) {
      assert.ok(!new RegExp(t2, 'i').test(src), 'a mail transport is back in notify.js: ' + t2);
    }
    assert.ok(!/\bemail\s*[:(]/.test(src), 'notify.js exposes an email() function again');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(!pkg.dependencies['@sendgrid/mail'], 'the SendGrid dependency is back');
  });

  await t('a notification is written AND pushes the badge — the row alone is not delivery', async () => {
    const nt = require(path.join(ROOT, 'src/services/notify'));
    const before = OB.notifs.length;
    let pushed = 0;
    const pn = require(path.join(ROOT, 'src/services/pushNotify'));
    const realPush = pn.pushBadge;
    pn.pushBadge = async () => { pushed++; return { ok: true }; };
    await nt.notify(1, 'test', 'Title', 'Body');
    pn.pushBadge = realPush;
    assert.strictEqual(OB.notifs.length, before + 1, 'the notification row was not written');
    assert.strictEqual(pushed, 1, 'the badge was not pushed — the client sees nothing until they open the app');
  });

  await t('THE ICON BADGE COUNTS NOTIFICATIONS TOO, or the client is told nothing', async () => {
    // Counting only messages meant "your outbound caller is ready" arrived
    // with a silent icon: the notification existed and delivery depended on
    // the client opening the app for some other reason.
    //
    // MEASURED, NOT GREPPED. The first version of this looked for the word
    // `lite_notifications` in the function body — which stayed there when the
    // return was changed back to messages only, so the mutation passed.
    const pn = require(path.join(ROOT, 'src/services/pushNotify'));
    const bt = await M.Tenant.create({ business_name: 'Badge Co' });
    const base = await pn.unreadCount(bt.id);
    OB.notifs.push({ tenant_id: bt.id, kind: 'x', title: 'One', body: null, read_at: null });
    OB.notifs.push({ tenant_id: bt.id, kind: 'x', title: 'Two', body: null, read_at: null });
    const after = await pn.unreadCount(bt.id);
    assert.strictEqual(after, base + 2,
      'two unread notifications did not move the badge (' + base + ' -> ' + after + ')');
    // And a read one must not keep counting, or the badge never comes down.
    OB.notifs.filter((x) => x.tenant_id === bt.id).forEach((x) => { x.read_at = new Date(); });
    assert.strictEqual(await pn.unreadCount(bt.id), base, 'read notifications still count');
  });

  await t('the OWNER is a tenant too — their alert lands on their own dashboard', async () => {
    const nt = require(path.join(ROOT, 'src/services/notify'));
    const src = fs.readFileSync(path.join(ROOT, 'src/services/notify.js'), 'utf8');
    assert.ok(/LITE_OWNER_ALERT_EMAIL/.test(src), 'the owner is not resolved from the alert email');
    // A miss must be reported, never guessed: notifying the wrong tenant puts
    // an operational alert about client A into client B's dashboard.
    const fn = src.slice(src.indexOf('async function notifyOwner'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.ok(/console\.error/.test(body), 'an unresolvable owner is dropped silently');
    assert.ok(/no_owner_tenant/.test(body));
  });

  await t('an owner alert carries NO caller or contact detail', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/services/notify.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function ownerSetupPaid'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    for (const leak of ['contact_name', 'callback_number', 'transcript', 'caller']) {
      assert.ok(!body.includes(leak), 'the owner alert includes ' + leak);
    }
  });

  await t('the National DNC gap is still stated on the paid surfaces', async () => {
    const page = fs.readFileSync(path.join(ROOT, 'public/dashboard.html'), 'utf8');
    assert.ok(/obDncOff/.test(page), 'the DNC statement is gone from the dashboard');
    const route = fs.readFileSync(path.join(ROOT, 'src/routes/outbound.js'), 'utf8');
    assert.ok(/national_dnc_scrub: false/.test(route) && /FTC/.test(route),
      'the plan endpoint stopped stating the DNC gap');
  });

  /* ── WHAT THE SECURITY REVIEW FOUND ────────────────────────────────────── */

  await t('TWO TENANTS SHARING A CONTACT ID SETTLE SEPARATELY — no cross-tenant charge', async () => {
    // One shared HighLevel sub-account: /contacts/upsert dedupes by phone
    // WITHIN a location, so two tenants who both hold the same number get the
    // IDENTICAL ghl_contact_id. Unscoped, the settle took whichever row was
    // oldest across ALL tenants — charging A for B's call and writing B's
    // call summary onto A's row for A to read back. No attacker needed.
    const A = await M.Tenant.create({ business_name: 'Tenant A', outbound_state: 'active' });
    const B = await M.Tenant.create({ business_name: 'Tenant B', outbound_state: 'active' });
    await bl.credit(A.id, 50000); await bl.credit(B.id, 50000);
    const hA = await bl.reserve(A.id), hB = await bl.reserve(B.id);
    OB.contacts.push({ id: 9100, tenant_id: A.id, list_id: 5001, phone: '+18135559999',
      ghl_contact_id: 'gc-shared', status: 'dialled' });
    OB.contacts.push({ id: 9101, tenant_id: B.id, list_id: 5001, phone: '+18135559999',
      ghl_contact_id: 'gc-shared', status: 'dialled' });
    // A enrolled FIRST, so the unscoped query would always pick A.
    OB.calls.push({ id: ++OB_CALL_SEQ, tenant_id: A.id, contact_id: 9100,
      enrolled_at: new Date(Date.now() - 300000), reserved_cents: hA.reserved_cents, settled_at: null });
    const aRow = OB.calls[OB.calls.length - 1].id;
    OB.calls.push({ id: ++OB_CALL_SEQ, tenant_id: B.id, contact_id: 9101,
      enrolled_at: new Date(), reserved_cents: hB.reserved_cents, settled_at: null });
    const bRow = OB.calls[OB.calls.length - 1].id;

    // B's call log arrives, attributed to B by the dialled line.
    const r = await bl.settleFromCallLog(
      { contactId: 'gc-shared', durationSec: 120, summary: "B's private call summary", callId: 'log-b' },
      { tenantId: B.id });
    assert.strictEqual(r.claimed, true);
    assert.strictEqual(r.tenant_id, B.id, 'it settled against the WRONG tenant');
    assert.strictEqual(r.call_row, bRow);

    const aCall = OB.calls.find((x) => x.id === aRow);
    assert.strictEqual(aCall.settled_at, null, "tenant A's call was settled by tenant B's log");
    assert.ok(!aCall.summary, "tenant B's call summary leaked onto tenant A's row");
  });

  await t('WITH NO RESOLVABLE TENANT NOTHING IS CLAIMED — refusing is safe, guessing is the bug', async () => {
    const r = await bl.settleFromCallLog({ contactId: 'gc-shared', durationSec: 60 }, {});
    assert.strictEqual(r.claimed, false);
    assert.strictEqual(r.reason, 'no_tenant');
  });

  await t('the poller resolves the tenant from the DIALLED LINE, not the contact id', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/services/ghlCallLogs.js'), 'utf8');
    const i1 = src.indexOf('mirror.resolveNumber({ dialed: f.dialed, agentId: f.agentId })');
    const i2 = src.indexOf('billing.settleFromCallLog');
    assert.ok(i1 > 0 && i2 > i1, 'the tenant is not resolved before the claim');
    assert.ok(/tenantId: obNum\.tenant_id/.test(src), 'the resolved tenant is not passed to settlement');
  });

  await t('a settle ERROR is claimed, never dropped into the client inbox', () => {
    // The catch used to return {claimed:false}, so a transient DB error
    // produced exactly the bug the branch exists to prevent: the client's own
    // paid outbound call arriving as "somebody called you", owner texted.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/ghlCallLogs.js'), 'utf8');
    const c = src.slice(src.indexOf('billing.settleFromCallLog'));
    const body = c.slice(0, c.indexOf('if (ob.claimed)'));
    assert.ok(/claimed: true[^}]*settle_error/.test(body.replace(/\n/g, ' ')),
      'a settle error still falls through to the inbound mirror');
  });

  await t('AN UNSIGNED STRIPE EVENT MAY NEVER MOVE MONEY', () => {
    // With no webhook secret the endpoint is unauthenticated: open a Checkout
    // session, never pay, POST a forged "completed" naming your own session,
    // and credit yourself any amount.
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/webhooks.js'), 'utf8');
    assert.ok(/event\.__unsigned = true/.test(src), 'an unsigned event is not marked');
    const out = src.slice(src.indexOf("kind === 'lite_outbound_setup'"));
    const guard = out.slice(0, out.indexOf('await handleOutbound'));
    assert.ok(/event\.__unsigned/.test(guard) && /503/.test(guard),
      'an unsigned outbound payment event is not refused');
  });

  await t('the reserve TTL always exceeds the window a log can still settle in', () => {
    // At 60 against a 180-minute match window, a log arriving at 90 minutes
    // found the row already swept and charged 0 — a call the owner paid for,
    // billed to nobody.
    process.env.LITE_OUTBOUND_MATCH_WINDOW_MIN = '180';
    process.env.LITE_OUTBOUND_RESERVE_TTL_MIN = '60';          // deliberately wrong
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outboundBilling.js'), 'utf8');
    assert.ok(/Math\.max\(matchWin \+ 30/.test(src), 'the TTL floor is not enforced against the window');
    delete process.env.LITE_OUTBOUND_MATCH_WINDOW_MIN;
    delete process.env.LITE_OUTBOUND_RESERVE_TTL_MIN;
  });

  await t('THE STALE-RESERVE SWEEP IS ACTUALLY CALLED', () => {
    // It was written, exported, documented — and invoked by nothing. Every
    // call whose log never arrived held the client's money for ever.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outboundDialer.js'), 'utf8');
    assert.ok(/sweepStaleReserves/.test(src), 'the dialer never runs the reserve sweep');
  });

  await t('RUNNING OUT OF CREDIT DOES NOT DESTROY THE REST OF THE LIST', async () => {
    // Nothing requeues a 'skipped' contact and the dialer only selects
    // 'pending', so marking them skipped meant a client topped up and their
    // campaign was silently, permanently dead.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outboundDialer.js'), 'utf8');
    const tr = src.slice(src.indexOf('const transient ='), src.indexOf('if (!transient)'));
    assert.ok(/insufficient_credit/.test(tr), 'running out of credit burns the contact');
    assert.ok(/outbound_not_activated/.test(tr), 'a deactivated tenant burns its contacts');

    const poor = await M.Tenant.create({ business_name: 'Poor Co', country: 'US',
      outbound_enabled: true, outbound_workflow_id: 'wf-published-001',
      outbound_state: 'active', outbound_daily_cap: 50 });
    OB.lists.push({ id: 5100, tenant_id: poor.id, status: 'active' });
    for (const n of ['+18135550401', '+18135550402']) {
      OB.contacts.push({ id: ++cid, tenant_id: poor.id, list_id: 5100, phone: n,
        contact_name: 'Broke Target', status: 'pending', attempts: 0 });
    }
    const r = await dialer.runTenant(poor.id, { at: noon, limit: 10 });
    assert.ok(r.results.every((x) => x.transient), 'a contact was burned for a lack of funds');
    assert.strictEqual(OB.contacts.filter((c) => c.list_id === 5100 && c.status === 'pending').length, 2,
      'contacts were consumed when the client simply needed to top up');
  });

  await t('a duplicate setup fee is raised for refund, never pocketed', () => {
    // Lives in outboundBilling now, not the webhook: the confirm poll can
    // land a duplicate too, so the refund notice belongs with the writer.
    const src = fs.readFileSync(path.join(ROOT, 'src/services/outboundBilling.js'), 'utf8');
    const dup = src.slice(src.indexOf('if (!moved.moved)'));
    const body = dup.slice(0, dup.indexOf('  }'));
    assert.ok(/REFUND DUE|refund/i.test(body), 'a second paid setup fee is silently kept');
    assert.ok(/notify\.notify/.test(body), 'the client is not told they were charged twice');
  });

  await t('transition() will not write a column outside the allow-list', async () => {
    const v = await M.Tenant.create({ business_name: 'Injection Co', outbound_state: 'off' });
    await assert.rejects(
      () => bl.transition(v.id, 'off', 'pending_setup', { subscription_status: 'active' }),
      /not writable/, 'an arbitrary column reached the SQL string');
  });

  await t('changing only the daily cap does not activate a paying tenant', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/security.js'), 'utf8');
    assert.ok(/b\.enabled === true && t\.outbound_state === 'pending_setup'/.test(src),
      'activation still rides on the default-true enable flag');
  });

  /* ── THE FOUNDER'S BROADCAST ──────────────────────────────────────────── */

  await t('a BROADCAST reaches every tenant, one row each', async () => {
    const nt = require(path.join(ROOT, 'src/services/notify'));
    const pn = require(path.join(ROOT, 'src/services/pushNotify'));
    const realPush = pn.pushBadge; pn.pushBadge = async () => ({ ok: true });
    const before = OB.notifs.length;
    const tenants = M.Tenant._rows.length;
    const r = await nt.broadcast({ title: 'Twenty percent off outbound', body: 'This month.', byTenant: 1 });
    pn.pushBadge = realPush;
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.recipients, tenants, 'it did not reach every tenant');
    // ONE ROW EACH is the design: a single shared row would make "read"
    // global, so the first person to dismiss it clears it for everyone and
    // no tenant's badge could ever be right.
    assert.strictEqual(OB.notifs.length, before + tenants, 'it did not write one row per tenant');
  });

  await t('A DOUBLE TAP DOES NOT NOTIFY EVERY CUSTOMER TWICE', async () => {
    const nt = require(path.join(ROOT, 'src/services/notify'));
    const pn = require(path.join(ROOT, 'src/services/pushNotify'));
    const realPush = pn.pushBadge; pn.pushBadge = async () => ({ ok: true });
    await nt.broadcast({ title: 'Double tap test', body: 'x', byTenant: 1 });
    const before = OB.notifs.length;
    const again = await nt.broadcast({ title: 'Double tap test', body: 'x', byTenant: 1 });
    pn.pushBadge = realPush;
    assert.strictEqual(again.ok, false);
    // REFUSED, not silently deduped: the founder must know the second one
    // did not go, rather than wonder whether everyone got it twice.
    assert.strictEqual(again.reason, 'just_sent');
    assert.strictEqual(OB.notifs.length, before, 'the second tap wrote rows anyway');
  });

  await t('a broadcast with no title is refused', async () => {
    const nt = require(path.join(ROOT, 'src/services/notify'));
    const r = await nt.broadcast({ title: '   ', body: 'x', byTenant: 1 });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'no_title');
  });

  await t('ADMIN IS RESOLVED FROM THE DATABASE, NEVER FROM THE 30-DAY TOKEN', () => {
    // The session token is signed, so its email is truthful — about who
    // logged in a month ago. Reading the owner tenant fresh means a changed
    // founder account takes effect the same day, and a stale token cannot
    // keep broadcasting to every customer.
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/notifications.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function requireOwner'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.ok(/notify\.isOwner\(req\.tenantId\)/.test(body), 'admin is not resolved from the owner tenant');
    assert.ok(!/req\.user/.test(body), 'admin is read off the session token');
    assert.ok(/404/.test(body), 'a refusal confirms the admin surface exists');
  });

  await t('the broadcast route is owner-gated BEFORE it parses a body', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/notifications.js'), 'utf8');
    const line = src.split('\n').find((l) => l.includes("post('/broadcast'"));
    assert.ok(line, 'the broadcast route is gone');
    // PRESENT FIRST, THEN ORDERED. `indexOf` returns -1 when the gate is
    // absent, and -1 is less than any real index — so the naive ordering
    // check passed with requireOwner deleted entirely, which is the exact
    // thing it exists to prevent.
    const gate = line.indexOf('requireOwner');
    const body = line.indexOf('express.json');
    assert.ok(gate > 0, 'the broadcast route is NOT owner-gated at all');
    assert.ok(body > 0 && gate < body,
      'a non-owner body is parsed before the gate refuses them');
  });

  await t('isOwner is false for an ordinary tenant', async () => {
    const nt = require(path.join(ROOT, 'src/services/notify'));
    const stranger = await M.Tenant.create({ business_name: 'Not The Founder' });
    assert.strictEqual(await nt.isOwner(stranger.id), false,
      'an ordinary subscriber reads as the founder');
  });

  await t('AN UNREACHABLE FOUNDER IS REPORTED, not discovered by a waiting client', () => {
    // Owner alerts are notifications on the owner's own tenant, resolved from
    // LITE_OWNER_ALERT_EMAIL. If no account carries that address the alert
    // goes NOWHERE and the only symptom is a paying client waiting a day for
    // a setup nobody was told about.
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/security.js'), 'utf8');
    assert.ok(/owner_alerts: ownerAlerts/.test(src), '/internal/security does not report owner reachability');
    assert.ok(/deliverable: false/.test(src), 'an unresolvable owner is not reported as undeliverable');
    assert.ok(/NO ACCOUNT HAS THIS EMAIL/.test(src), 'the problem is reported without saying what to do');
  });

  ghlMod.call = realCall;

  srv.close();

  console.log(`\n${'='.repeat(66)}\n  ${pass}/${pass + fail} passed`);
  if (fail) console.log('  FAILED: ' + failures.join(' | '));
  console.log('  NOT COVERED: the real HighLevel API (including whether a live sub-account');
  console.log('               honours Version v3 or 2021-07-28 on the calendar endpoints),');
  console.log('               a real purchase, a real webhook from HighLevel\'s servers,');
  console.log('               and Postgres itself.');
  console.log('='.repeat(66));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SIT crashed:', e); process.exit(1); });
