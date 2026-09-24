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
    if (v && typeof v === 'object' && v.constructor === Object) return true; // Op.* — not used in asserts
    return r[k] === v;
  });
  const wrap = (r) => Object.assign(r, {
    update: async (patch) => { Object.assign(r, patch); return r; },
    get: (k) => r[k],
  });
  return {
    _rows: rows,
    async create(v) { const r = wrap({ id: ++seq, ...v }); rows.push(r); return r; },
    async findOne({ where }) { return rows.find((r) => match(r, where)) || null; },
    async findByPk(id) { return rows.find((r) => r.id === id) || null; },
    async findAll({ where } = {}) { return where ? rows.filter((r) => match(r, where)) : rows.slice(); },
    async count({ where } = {}) { return (where ? rows.filter((r) => match(r, where)) : rows).length; },
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

const secretbox = require(path.join(ROOT, 'src/services/secretbox'));
const accounts = require(path.join(ROOT, 'src/services/ghlAccounts'));
const provisioning = require(path.join(ROOT, 'src/services/provisioning'));
const GhlProvider = require(path.join(ROOT, 'src/telephony/ghlProvider'));
const { getNumberProvider, getProvider } = require(path.join(ROOT, 'src/telephony'));

/* ── fake HighLevel ─────────────────────────────────────────────────────── */
let reqs = [];
let scenario = {};
let boughtNumbers = 0;
global.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const body = opts.body ? JSON.parse(opts.body) : null;
  reqs.push({ method: opts.method || 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams),
              body, auth: opts.headers && opts.headers.Authorization });
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
    return json(200, { numbers: [{ phoneNumber: '+18135550101' }, { phoneNumber: '+18135550102' }] });
  }
  if (p.endsWith('/purchase')) {
    if (scenario.purchaseFails) return json(400, { message: 'purchase refused' });
    boughtNumbers++; return json(201, { ok: true });
  }
  if (p === '/calendars/' && opts.method === 'POST') {
    if (scenario.calendarFails) return json(500, { message: 'calendar service down' });
    return json(201, { id: `CAL-${body.locationId}` });
  }
  if (p === '/voice-ai/agents' && (opts.method || 'GET') === 'GET') {
    return json(200, { agents: [{ id: 'tpl1', agentPrompt: 'TEMPLATE PROMPT', voiceId: 'voice-xyz',
      language: 'en-US', callEndWorkflowIds: ['wf-after-call'], welcomeMessage: 'Template hello' }] });
  }
  if (p === '/voice-ai/agents' && opts.method === 'POST') {
    return scenario.agentFails ? json(500, { message: 'agent service down' }) : json(201, { id: 'agent-new-1' });
  }
  if (p === '/voice-ai/actions') return json(201, { id: 'act1' });
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
    const src = strip(read('src/routes/webhooks-ghl.js'));
    assert.ok(/NumberModel\.findOne\(\{ where: \{ did/.test(src));
    assert.ok(!/body\.tenant_id|body\.tenantId/.test(src), 'the webhook trusts a tenant id from the payload');
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
  srv.close();

  console.log(`\n${'='.repeat(66)}\n  ${pass}/${pass + fail} passed`);
  if (fail) console.log('  FAILED: ' + failures.join(' | '));
  console.log('  NOT COVERED: the real HighLevel API, a real purchase, a real webhook');
  console.log('               from HighLevel\'s servers, and Postgres itself.');
  console.log('='.repeat(66));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SIT crashed:', e); process.exit(1); });
