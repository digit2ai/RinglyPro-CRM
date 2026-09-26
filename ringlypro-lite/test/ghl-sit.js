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
    return [[], {}];
  },
};
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
  if (p === '/calendars/' && opts.method === 'POST') {
    if (scenario.calendarFails) return json(500, { message: 'calendar service down' });
    return json(201, { id: `CAL-${body.locationId}` });
  }
  if (p === '/voice-ai/agents' && (opts.method || 'GET') === 'GET') {
    // The pilot template really does carry NO end-of-call workflow today,
    // which is why messages never reach us. The fake keeps one by default —
    // that is the behaviour provisioning is supposed to have — and a test
    // opts in to the empty case.
    return json(200, { agents: [{ id: 'tpl1', agentPrompt: 'TEMPLATE PROMPT', voiceId: 'voice-xyz',
      language: 'en-US', callEndWorkflowIds: scenario.templateNoWorkflow ? [] : ['wf-after-call'],
      welcomeMessage: 'Template hello' }] });
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
  if (p === '/voice-ai/dashboard/call-logs' && (opts.method || 'GET') === 'GET') {
    if (scenario.callLogsFail) return json(scenario.callLogsStatus || 500, { message: 'call logs down' });
    return json(200, { callLogs: scenario.callLogs || [] });
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
    // Measured against the live API: 3/3/3 is accepted and 14/1/4 - what this
    // used to send - is refused 422, which is why no agent ever got one.
    const src = fs.readFileSync(path.join(ROOT, 'src/telephony/ghlProvider.js'), 'utf8');
    const m = src.match(/actionParameters:\s*\{\s*calendarId,\s*daysOfOfferingDates:\s*(\d+),\s*slotsPerDay:\s*(\d+),\s*hoursBetweenSlots:\s*(\d+)/);
    assert.ok(m, 'the booking parameters changed shape');
    assert.deepStrictEqual(m.slice(1, 4), ['3', '3', '3'], 'a value HighLevel refuses is back');
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

  await t('the window is sent as unix seconds, newest first, for that location only', async () => {
    scenario = { callLogs: [] }; reqs = [];
    await calls.importRecent({ creds: POLL_CREDS, minutes: 60 });
    const q = reqs.find((x) => x.path === '/voice-ai/dashboard/call-logs').query;
    assert.strictEqual(q.locationId, 'LOC-POLL');
    assert.strictEqual(q.sort, 'descend');
    const span = Number(q.endDate) - Number(q.startDate);
    assert.ok(Math.abs(span - 3600) < 5, `window was ${span}s, expected ~3600`);
    assert.ok(Number(q.endDate) < 1e11, 'dates must be seconds, not milliseconds');
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
