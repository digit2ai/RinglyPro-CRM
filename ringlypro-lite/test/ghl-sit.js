'use strict';

/**
 * HighLevel number provider SIT. Zero keys, no network: global fetch is
 * replaced by a fake HighLevel that records every request, so nothing is ever
 * bought. Run: node ringlypro-lite/test/ghl-sit.js
 *
 * NOT COVERED: the real HighLevel API (verified read-only in production via
 * /voice/health?check=ghl) and a real purchase, which costs money.
 */
process.env.NODE_ENV = 'test';
process.env.LITE_GHL_TOKEN = 'pit-sit-token-do-not-leak';
process.env.LITE_GHL_LOCATION_ID = 'LOCSIT123';
delete process.env.LITE_NUMBER_PROVIDER;
delete process.env.LITE_GHL_TEMPLATE_AGENT_ID;

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0; const failures = [];
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; failures.push(name); console.log(`FAIL  ${name}\n      ${e.message}`); }
}

// ---- fake HighLevel ------------------------------------------------------
let reqs = [];
let scenario = {};
global.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const body = opts.body ? JSON.parse(opts.body) : null;
  reqs.push({ method: opts.method || 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams), body, auth: opts.headers && opts.headers.Authorization });
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const p = u.pathname;
  if (p.endsWith('/available')) {
    if (scenario.noNumbers) return json(200, { numbers: [] });
    if (u.searchParams.get('firstPart') && scenario.noAreaCode) return json(200, { numbers: [] });
    return json(200, { numbers: [{ phoneNumber: '+18135550101' }, { phoneNumber: '+18135550102' }] });
  }
  if (p.endsWith('/purchase')) return scenario.purchaseFails ? json(400, { message: 'purchase refused' }) : json(201, { ok: true });
  if (p === '/voice-ai/agents' && (opts.method || 'GET') === 'GET') {
    return json(200, { agents: [{ id: 'tpl1', agentPrompt: 'TEMPLATE PROMPT', voiceId: 'voice-xyz', language: 'en-US', callEndWorkflowIds: ['wf-after-call'], welcomeMessage: 'Template hello' }] });
  }
  if (p === '/voice-ai/agents' && opts.method === 'POST') return scenario.agentFails ? json(500, { message: 'agent service down' }) : json(201, { id: 'agent-new-1' });
  if (p === '/voice-ai/actions') return json(201, { id: 'act1' });
  return json(404, { message: 'not found' });
};

const { getNumberProvider, getProvider } = require(path.join(ROOT, 'src/telephony'));
const GhlProvider = require(path.join(ROOT, 'src/telephony/ghlProvider'));

const tenant = { id: 7, business_name: 'Sunny Dental', owner_name: 'Ana Ruiz', owner_phone: '+14085551234', country: 'US', locale: 'en', timezone: 'America/New_York' };

(async () => {
  console.log('RinglyPro Lite HighLevel provider SIT - zero keys, fake HighLevel\n');

  await t('with the HighLevel token set, NEW numbers come from HighLevel', () => {
    assert.strictEqual(getNumberProvider().name, 'ghl');
  });
  await t('LITE_NUMBER_PROVIDER=twilio forces the old path', () => {
    process.env.LITE_NUMBER_PROVIDER = 'twilio';
    try { assert.notStrictEqual(getNumberProvider().name, 'ghl'); } finally { delete process.env.LITE_NUMBER_PROVIDER; }
  });
  await t('calls to existing numbers keep the Twilio provider', () => {
    assert.notStrictEqual(getProvider().name, 'ghl');
  });

  reqs = []; scenario = {};
  let r;
  await t('a signup buys a number and gives it its own agent', async () => {
    r = await new GhlProvider().buyNumber({ country: 'US', tenantId: 7, tenant });
    assert.strictEqual(r.did, '+18135550101');
    assert.strictEqual(r.provider, 'ghl');
    assert.strictEqual(r.agent, 'agent-new-1');
  });
  await t('the purchase carries a per-tenant fingerprint, so a retry cannot buy twice', () => {
    const buy = reqs.find((q) => q.path.endsWith('/purchase'));
    assert.strictEqual(buy.body.fingerprintId, 'ringlypro-lite-tenant-7');
    assert.strictEqual(buy.body.phoneNumber, '+18135550101');
    assert.ok(buy.path.includes('/LOCSIT123/'), 'bought outside the pilot sub-account');
  });
  await t('the agent is COPIED from the template: voice and end-of-call workflows carry over', () => {
    const a = reqs.find((q) => q.path === '/voice-ai/agents' && q.method === 'POST').body;
    assert.strictEqual(a.voiceId, 'voice-xyz');
    assert.deepStrictEqual(a.callEndWorkflowIds, ['wf-after-call']);
    assert.ok(a.agentPrompt.startsWith('TEMPLATE PROMPT'), 'the owner template was not kept first');
    assert.ok(a.agentPrompt.includes('Sunny Dental'), 'the client facts are missing');
    assert.strictEqual(a.inboundNumber, '+18135550101');
    assert.strictEqual(a.locationId, 'LOCSIT123');
  });
  await t('the agent is told never to invent prices or hours', () => {
    assert.ok(/Never quote a price, hour or policy/.test(GhlProvider.clientContext(tenant)));
  });
  await t('a transfer to the owner is added, normalised', () => {
    const act = reqs.find((q) => q.path === '/voice-ai/actions');
    assert.ok(act, 'no transfer action');
    assert.strictEqual(act.body.actionParameters.transferToValue, '+14085551234');
  });
  await t('the token is sent only as a header and never appears in a request body', () => {
    for (const q of reqs) {
      assert.strictEqual(q.auth, 'Bearer pit-sit-token-do-not-leak');
      assert.ok(!JSON.stringify(q.body || {}).includes('pit-sit'), 'token leaked into a body');
    }
  });

  await t('A PREMIUM TRANSFER NUMBER IS NEVER GIVEN TO THE AGENT', async () => {
    reqs = []; scenario = {};
    await new GhlProvider().buyNumber({ country: 'US', tenantId: 8, tenant: { ...tenant, transfer_number: '+237656876200', owner_phone: null } });
    assert.ok(!reqs.some((q) => q.path === '/voice-ai/actions'), 'a Cameroon number reached the agent');
  });
  await t('a Spanish-speaking client gets a Spanish agent', async () => {
    reqs = []; scenario = {};
    await new GhlProvider().buyNumber({ country: 'US', tenantId: 9, tenant: { ...tenant, locale: 'es' } });
    assert.strictEqual(reqs.find((q) => q.path === '/voice-ai/agents' && q.method === 'POST').body.language, 'es');
  });
  await t('an area code with no stock falls back to any US number', async () => {
    reqs = []; scenario = { noAreaCode: true };
    const x = await new GhlProvider().buyNumber({ country: 'US', areaCode: '305', tenantId: 10, tenant });
    assert.strictEqual(x.did, '+18135550101');
    assert.ok(reqs.some((q) => q.query.firstPart === '1305'), 'the area code was not tried first');
  });
  await t('IF THE AGENT FAILS, THE BOUGHT NUMBER IS STILL RETURNED (never bought again)', async () => {
    reqs = []; scenario = { agentFails: true };
    const x = await new GhlProvider().buyNumber({ country: 'US', tenantId: 11, tenant });
    assert.strictEqual(x.did, '+18135550101');
    assert.strictEqual(x.agent, null);
    assert.ok(/agent service down/.test(x.agentError));
    assert.strictEqual(reqs.filter((q) => q.path.endsWith('/purchase')).length, 1);
  });
  await t('no stock = an honest error, and nothing is bought', async () => {
    reqs = []; scenario = { noNumbers: true };
    await assert.rejects(new GhlProvider().buyNumber({ country: 'US', tenantId: 12, tenant }), /No US local numbers/);
    assert.ok(!reqs.some((q) => q.path.endsWith('/purchase')));
  });
  await t('a refused purchase fails the signup step, and no agent is created', async () => {
    reqs = []; scenario = { purchaseFails: true };
    await assert.rejects(new GhlProvider().buyNumber({ country: 'US', tenantId: 13, tenant }), /purchase refused/);
    assert.ok(!reqs.some((q) => q.path === '/voice-ai/agents' && q.method === 'POST'));
  });
  await t('an error never carries the token', async () => {
    reqs = []; scenario = { purchaseFails: true };
    try { await new GhlProvider().buyNumber({ country: 'US', tenantId: 14, tenant }); } catch (e) { assert.ok(!e.message.includes('pit-sit')); }
  });
  await t('Colombian clients are refused here (US-only pilot), before any purchase', async () => {
    reqs = []; scenario = {};
    await assert.rejects(new GhlProvider().buyNumber({ country: 'CO', tenantId: 15, tenant }), /US-only/);
    assert.strictEqual(reqs.length, 0);
  });
  await t('release is manual and says so, never a silent success', async () => {
    const x = await new GhlProvider().releaseNumber();
    assert.strictEqual(x.released, false);
  });
  await t('onboarding buys through getNumberProvider, and passes the tenant', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/routes/onboarding.js'), 'utf8');
    assert.ok(/getNumberProvider\(\)/.test(src));
    assert.ok(/buyNumber\(\{[^}]*tenant \}/.test(src));
    assert.ok(src.indexOf('Number.count(') < src.indexOf('provider.buyNumber('), 'the daily cap no longer runs first');
  });

  console.log(`\n${'='.repeat(64)}\n  ${pass}/${pass + fail} passed`);
  if (fail) console.log('  FAILED: ' + failures.join(' | '));
  console.log('  NOT COVERED: the real HighLevel API and a real purchase.');
  console.log('='.repeat(64));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SIT crashed:', e); process.exit(1); });
