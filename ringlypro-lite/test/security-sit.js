'use strict';

/**
 * RinglyPro Lite — security SIT. Zero external keys, no database, no network
 * beyond a loopback port. Runs in CI on every change to ringlypro-lite/.
 *
 *   node ringlypro-lite/test/security-sit.js
 *
 * It attacks the guarantees rather than the happy path: it REPLAYS the
 * 2026-08-06 toll-fraud attack (an unknown "auto-bought" number, ten calls to
 * Cameroon and Tunisia in forty seconds) against the fraud watch, tries to make
 * the provider dial and text premium destinations, and greps the source for the
 * structural promises a runtime test cannot see.
 *
 * NOT COVERED here, and said so: a real Twilio account (the watch runs against a
 * fake client), a real signed webhook from Twilio's servers, and the database
 * count behind the number-purchase cap.
 */
process.env.NODE_ENV = 'test';
delete process.env.LITE_ALLOWED_DIAL_COUNTRIES;
delete process.env.LITE_OUTBOUND_LOCK;
delete process.env.LITE_FRAUD_WATCH;

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const tollFraud = require(path.join(ROOT, 'src/security/tollFraud'));
const fraudWatch = require(path.join(ROOT, 'src/security/fraudWatch'));
const twilioSig = require(path.join(ROOT, 'src/security/twilioSignature'));
const TwilioProvider = require(path.join(ROOT, 'src/telephony/twilioProvider'));

let pass = 0, fail = 0; const failures = [];
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; failures.push(name); console.log(`FAIL  ${name}\n      ${e.message}`); }
}
function section(s) { console.log(`\n-- ${s} ${'-'.repeat(Math.max(0, 60 - s.length))}`); }
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// A fake Twilio client that records what would have been sent.
function fakeClient(seed = {}) {
  const sent = { sms: [], redirects: [], bought: [] };
  const c = {
    sent,
    messages: { create: async (m) => { sent.sms.push(m); return { sid: 'SMfake' }; }, list: async () => seed.messages || [] },
    calls: Object.assign((sid) => ({ update: async (u) => { sent.redirects.push({ sid, ...u }); return {}; } }),
      { list: async () => seed.calls || [] }),
    incomingPhoneNumbers: Object.assign(() => ({}), {
      list: async () => { if (seed.fail) throw new Error('twilio 401'); return seed.numbers || []; },
      create: async (n) => { sent.bought.push(n); return { phoneNumber: n.phoneNumber, sid: 'PNfake' }; } }),
  };
  return c;
}
function providerWith(client) { const p = new TwilioProvider(); p._client = client; return p; }

(async () => {
  console.log('RinglyPro Lite security SIT - zero external keys\n');

  section('destination allow-list: the attack numbers are refused');
  for (const [num, why] of [
    ['+237656876200', 'Cameroon - the 2026-08-06 destination'],
    ['+21629259924', 'Tunisia - the 2026-08-06 destination'],
    ['+18765551234', 'Jamaica hiding behind +1'],
    ['+18095551234', 'Dominican Republic hiding behind +1'],
    ['+19005551234', 'US premium-rate 900'],
    ['+19765551234', 'US pay-per-call 976'],
    ['+14165551234', 'Canada (not allowed by default)'],
    ['+442071234567', 'United Kingdom'],
    ['sip:attacker@example.com', 'a SIP URI'],
    ['client:someone', 'a client identifier'],
    ['12345', 'an ambiguous short number'],
    ['+5712345', 'a truncated Colombian number'],
    ['+10005551234', 'an invalid NANP area code'],
  ]) {
    await t(`refuses ${why}`, () => assert.strictEqual(tollFraud.checkDestination(num).ok, false));
  }

  section('destination allow-list: real owners still work');
  for (const [num, e164] of [
    ['+14085551234', '+14085551234'], ['(813) 212-0813', '+18132120813'], ['813.212.0813', '+18132120813'],
    ['+573001234567', '+573001234567'], ['+57 601 234 5678', '+576012345678'], ['0057 300 123 4567', '+573001234567'],
    ['+17875551234', '+17875551234'],   // Puerto Rico is domestic
  ]) {
    await t(`accepts ${num}`, () => {
      const r = tollFraud.checkDestination(num);
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      assert.strictEqual(r.e164, e164);
    });
  }
  for (const [num, why] of [
    ['+14089765555', 'a US pay-per-call 976 EXCHANGE'],
    ['+15005551234', 'a non-geographic 500 number'],
    ['+17005551234', 'a non-geographic 700 number'],
    ['+16715551234', 'Guam (billed as international)'],
    ['+12575551234', 'Canada\'s new 257 area code'],
  ]) {
    await t(`refuses ${why}`, () => assert.strictEqual(tollFraud.checkDestination(num).ok, false));
  }
  await t('A COLOMBIAN OWNER TYPING 315 765 4321 GETS +57, NOT A STRANGER IN THE US', () => {
    const r = tollFraud.checkDestination('315 765 4321', { defaultCountry: 'CO' });
    assert.strictEqual(r.ok, true); assert.strictEqual(r.e164, '+573157654321');
    assert.strictEqual(tollFraud.checkDestination('315 765 4321').e164, '+13157654321', 'US default changed');
  });
  await t('an ambiguous number from a Colombian owner is refused, never guessed', () => {
    assert.strictEqual(tollFraud.checkDestination('555 123 4567', { defaultCountry: 'CO' }).ok, false);
  });
  await t('the owner\'s country reaches the save-time check', () => {
    assert.ok(/defaultCountry: tenant\.country/.test(read('src/routes/api.js')));
    assert.ok(/defaultCountry:/.test(read('src/routes/auth.js')));
  });
  await t('LITE_ALLOWED_DIAL_COUNTRIES=US turns Colombia off', () => {
    process.env.LITE_ALLOWED_DIAL_COUNTRIES = 'US';
    try { assert.strictEqual(tollFraud.checkDestination('+573001234567').ok, false); }
    finally { delete process.env.LITE_ALLOWED_DIAL_COUNTRIES; }
  });
  await t('adding CA is the only way Canada is reached', () => {
    process.env.LITE_ALLOWED_DIAL_COUNTRIES = 'US,CA';
    try { assert.strictEqual(tollFraud.checkDestination('+14165551234').ok, true); }
    finally { delete process.env.LITE_ALLOWED_DIAL_COUNTRIES; }
  });
  await t('an empty override does NOT open every country', () => {
    process.env.LITE_ALLOWED_DIAL_COUNTRIES = '   ';
    try { assert.strictEqual(tollFraud.checkDestination('+237656876200').ok, false); }
    finally { delete process.env.LITE_ALLOWED_DIAL_COUNTRIES; }
  });

  section('the provider cannot be made to dial or text a premium destination');
  tollFraud._reset();
  await t('THE TRANSFER TO +237 NEVER REACHES TWILIO', async () => {
    const c = fakeClient(); const p = providerWith(c);
    await assert.rejects(p.redirectCall({ callSid: 'CA1', number: '+237656876200', message: 'hi' }), /transfer_refused/);
    assert.strictEqual(c.sent.redirects.length, 0);
  });
  await t('THE TEXT TO +216 NEVER REACHES TWILIO', async () => {
    const c = fakeClient(); const p = providerWith(c);
    await assert.rejects(p.sendSMS({ from: '+18886103810', to: '+21629259924', body: 'x' }), /sms_refused/);
    assert.strictEqual(c.sent.sms.length, 0);
  });
  await t('a Jamaican +1 876 transfer is refused like any other international call', async () => {
    const c = fakeClient(); const p = providerWith(c);
    await assert.rejects(p.redirectCall({ callSid: 'CA1', number: '+18765551234' }), /transfer_refused/);
    assert.strictEqual(c.sent.redirects.length, 0);
  });
  await t('a US transfer goes through, dialling the normalised number', async () => {
    const c = fakeClient(); const p = providerWith(c);
    await p.redirectCall({ callSid: 'CA2', number: '(408) 555-1234' });
    assert.strictEqual(c.sent.redirects.length, 1);
    assert.ok(c.sent.redirects[0].twiml.includes('+14085551234'));
  });
  await t('the TwiML cannot be injected through the number', async () => {
    const c = fakeClient(); const p = providerWith(c);
    await assert.rejects(p.redirectCall({ callSid: 'CA3', number: '+14085551234</Dial><Dial>+237656876200' }), /transfer_refused/);
    assert.strictEqual(c.sent.redirects.length, 0);
  });

  section('velocity breaker: a pump is a burst');
  await t('the 4th transfer in an hour is refused when the cap is 3', async () => {
    tollFraud._reset(); process.env.LITE_MAX_TRANSFERS_PER_HOUR = '3';
    try {
      const c = fakeClient(); const p = providerWith(c);
      for (let i = 0; i < 3; i++) await p.redirectCall({ callSid: 'CA' + i, number: `+1408555120${i}` });
      await assert.rejects(p.redirectCall({ callSid: 'CAx', number: '+14085551299' }), /rate_limited/);
      assert.strictEqual(c.sent.redirects.length, 3);
    } finally { delete process.env.LITE_MAX_TRANSFERS_PER_HOUR; tollFraud._reset(); }
  });
  await t('one number cannot be texted more than the per-destination cap', async () => {
    tollFraud._reset(); process.env.LITE_MAX_PER_DESTINATION_PER_DAY = '2';
    try {
      const c = fakeClient(); const p = providerWith(c);
      await p.sendSMS({ from: 'x', to: '+14085551234', body: '1' });
      await p.sendSMS({ from: 'x', to: '+14085551234', body: '2' });
      await assert.rejects(p.sendSMS({ from: 'x', to: '+14085551234', body: '3' }), /destination_rate_limited/);
      await p.sendSMS({ from: 'x', to: '+14085559999', body: 'other number is fine' });
      assert.strictEqual(c.sent.sms.length, 3);
    } finally { delete process.env.LITE_MAX_PER_DESTINATION_PER_DAY; tollFraud._reset(); }
  });
  await t('VISITOR DEMO TEXTS CANNOT USE UP THE OWNER-ALERT BUDGET', async () => {
    tollFraud._reset(); process.env.LITE_MAX_DEMO_SMS_PER_HOUR = '2';
    try {
      const c = fakeClient(); const p = providerWith(c);
      await p.sendSMS({ from: 'x', to: '+14085551111', body: 'd', purpose: 'demo' });
      await p.sendSMS({ from: 'x', to: '+14085552222', body: 'd', purpose: 'demo' });
      await assert.rejects(p.sendSMS({ from: 'x', to: '+14085553333', body: 'd', purpose: 'demo' }), /rate_limited/);
      await p.sendSMS({ from: 'x', to: '+14085554444', body: 'owner alert' });
      assert.strictEqual(c.sent.sms.length, 3);
    } finally { delete process.env.LITE_MAX_DEMO_SMS_PER_HOUR; tollFraud._reset(); }
  });
  await t('demo texts aimed at an owner\'s phone do not silence that owner\'s alerts', async () => {
    tollFraud._reset(); process.env.LITE_MAX_PER_DESTINATION_PER_DAY = '2';
    try {
      const c = fakeClient(); const p = providerWith(c);
      for (let i = 0; i < 2; i++) await p.sendSMS({ from: 'x', to: '+14085551234', body: 'd', purpose: 'demo' });
      await p.sendSMS({ from: 'x', to: '+14085551234', body: 'the real owner alert' });
      assert.strictEqual(c.sent.sms.length, 3);
    } finally { delete process.env.LITE_MAX_PER_DESTINATION_PER_DAY; tollFraud._reset(); }
  });
  await t('demo confirmations are sent on the demo budget', () => {
    assert.ok(/purpose: 'demo'/.test(read('src/services/sms.js')));
  });
  await t('canSend answers without consuming the budget, and sees the lock', () => {
    tollFraud._reset(); process.env.LITE_MAX_TRANSFERS_PER_HOUR = '1';
    try {
      for (let i = 0; i < 5; i++) assert.strictEqual(tollFraud.canSend('call', '+14085551234').ok, true);
      tollFraud.lock('t'); assert.strictEqual(tollFraud.canSend('call', '+14085551234').reason, 'outbound_locked');
    } finally { delete process.env.LITE_MAX_TRANSFERS_PER_HOUR; tollFraud._reset(); }
  });
  await t('transfer_to_human asks canSend (lock and budget), so no promised transfer goes silent', () => {
    assert.ok(/tollFraud\.canSend\('call'/.test(read('src/services/relayAgent.js')));
  });
  await t('refusals are recorded with the number MASKED, never in full', () => {
    tollFraud._reset(); tollFraud.authorize('call', '+237656876200');
    const b = tollFraud.status().recent_blocks[0];
    assert.strictEqual(b.reason, 'country_not_allowed');
    assert.ok(!JSON.stringify(b).includes('656876200'), 'a full number leaked into the security report');
  });

  section('the kill switch');
  await t('a lock refuses even an allowed US number', async () => {
    tollFraud._reset(); tollFraud.lock('test');
    const c = fakeClient(); const p = providerWith(c);
    await assert.rejects(p.sendSMS({ from: 'x', to: '+14085551234', body: 'x' }), /outbound_locked/);
    tollFraud.unlock();
    await p.sendSMS({ from: 'x', to: '+14085551234', body: 'x' });
    assert.strictEqual(c.sent.sms.length, 1);
  });
  await t('LITE_OUTBOUND_LOCK=1 locks from the environment', () => {
    tollFraud._reset(); process.env.LITE_OUTBOUND_LOCK = '1';
    try { assert.strictEqual(tollFraud.authorize('sms', '+14085551234').reason, 'outbound_locked'); }
    finally { delete process.env.LITE_OUTBOUND_LOCK; }
  });

  section('fraud watch: REPLAY OF THE 2026-08-06 ATTACK');
  // Ten calls in forty seconds, as on 2026-08-06.
  const t0 = Date.now() - 5 * 60 * 1000;
  const attackCalls = [];
  for (let i = 0; i < 5; i++) attackCalls.push({ sid: 'CAcm' + i, direction: 'outbound-api', from: '+14108921440', to: '+23765687620' + i, startTime: new Date(t0 + i * 4000) });
  for (let i = 0; i < 5; i++) attackCalls.push({ sid: 'CAtn' + i, direction: 'outbound-api', from: '+14108921440', to: '+2162925990' + i, startTime: new Date(t0 + 20000 + i * 4000) });
  const accountNumbers = [
    ...fraudWatch.DEFAULT_KNOWN.map((n, i) => ({ sid: 'PNk' + i, phoneNumber: n, friendlyName: 'known' })),
    { sid: 'PNlite', phoneNumber: '+14085550100', friendlyName: 'RinglyPro Lite tenant 3' },
    { sid: 'PNattack', phoneNumber: '+14108921440', friendlyName: 'auto-bought +14108921440' },
  ];
  let raised = [];
  const sentAlerts = [];
  await t('the attack raises all three alarms in one pass', async () => {
    tollFraud._reset(); fraudWatch._reset();
    raised = await fraudWatch.runOnce({
      client: fakeClient({ numbers: accountNumbers, calls: attackCalls }),
      ownedDids: async () => ['+14085550100'],
      sendAlert: async (to, body) => { sentAlerts.push({ to, body }); },
    });
    const types = new Set(raised.map((a) => a.type));
    assert.ok(types.has('unknown_number'), 'the auto-bought number was not flagged');
    assert.ok(types.has('bad_destination'), 'calls to Cameroon/Tunisia were not flagged');
    assert.ok(types.has('call_burst'), 'ten calls in one window were not flagged');
  });
  await t('only the attacker number is unknown: known lines and Lite DIDs are not flagged', () => {
    const unknown = raised.filter((a) => a.type === 'unknown_number');
    assert.strictEqual(unknown.length, 1);
    assert.ok(unknown[0].key === 'num:PNattack');
  });
  await t('every one of the ten attack calls is named', () => {
    assert.strictEqual(raised.filter((a) => a.type === 'bad_destination').length, 10);
  });
  await t('the attacker\'s own traffic ALERTS but does not lock Lite (locking Lite would not stop it)', () => {
    assert.strictEqual(tollFraud.lockState(), null, 'Lite was locked over traffic that was not its own');
  });
  await t('AUTO-LOCK: a forbidden call FROM A LITE LINE locks all of Lite\'s outbound', async () => {
    fraudWatch._reset(); tollFraud._reset();
    await fraudWatch.runOnce({
      client: fakeClient({ numbers: accountNumbers.filter((n) => n.sid !== 'PNattack'),
        calls: [{ sid: 'CAlite', direction: 'outbound-dial', from: '+17627611589', to: '+237656876200', startTime: new Date() }] }),
      ownedDids: async () => ['+14085550100'], sendAlert: async () => {} });
    assert.ok(tollFraud.lockState(), 'outbound was not locked');
    assert.strictEqual(tollFraud.authorize('sms', '+14085551234').ok, false);
  });
  await t('the CRM\'s app, SIP and WhatsApp legs are not judged as phone destinations', async () => {
    fraudWatch._reset(); tollFraud._reset();
    const r = await fraudWatch.runOnce({
      client: fakeClient({ numbers: accountNumbers.filter((n) => n.sid !== 'PNattack'),
        calls: [{ sid: 'CAc', direction: 'outbound-api', from: '+12232949184', to: 'client:agent7', startTime: new Date() },
                { sid: 'CAs', direction: 'outbound-api', from: '+12232949184', to: 'sip:desk@pbx.example', startTime: new Date() }],
        messages: [{ sid: 'SMw', direction: 'outbound-api', from: 'whatsapp:+18886103810', to: 'whatsapp:+639171234567' }] }),
      ownedDids: async () => ['+14085550100'], sendAlert: async () => {} });
    assert.strictEqual(r.length, 0, JSON.stringify(r));
  });
  await t('a forbidden SMS from the shared toll-free alerts but never locks', async () => {
    fraudWatch._reset(); tollFraud._reset();
    const r = await fraudWatch.runOnce({
      client: fakeClient({ numbers: accountNumbers.filter((n) => n.sid !== 'PNattack'),
        messages: [{ sid: 'SMx', direction: 'outbound-api', from: '+18886103810', to: '+237656876200' }] }),
      ownedDids: async () => ['+14085550100'], sendAlert: async () => {} });
    assert.strictEqual(r.length, 1);
    assert.strictEqual(tollFraud.lockState(), null);
  });
  await t('an alert already recorded (before a restart) is not raised again', async () => {
    fraudWatch._reset(); tollFraud._reset();
    const stored = new Set(['num:PNattack']);
    const r = await fraudWatch.runOnce({ client: fakeClient({ numbers: accountNumbers, calls: [] }),
      ownedDids: async () => ['+14085550100'], sendAlert: async () => {},
      hasSeen: async (k) => stored.has(k), markSeen: async (k) => stored.add(k) });
    assert.strictEqual(r.length, 0);
  });
  await t('no alert phone configured = no alert text, and the report says so', () => {
    assert.strictEqual(sentAlerts.length, 0);
    assert.strictEqual(fraudWatch.status().alert_phone_set, false);
  });
  await t('a second pass does not re-raise the same alarms', async () => {
    fraudWatch._reset();
    await fraudWatch.runOnce({ client: fakeClient({ numbers: accountNumbers, calls: attackCalls }),
      ownedDids: async () => ['+14085550100'], sendAlert: async () => {} });
    const again = await fraudWatch.runOnce({
      client: fakeClient({ numbers: accountNumbers, calls: attackCalls }),
      ownedDids: async () => ['+14085550100'], sendAlert: async () => {},
    });
    assert.strictEqual(again.length, 0);
  });
  await t('an alert is texted when LITE_SECURITY_ALERT_PHONE is set', async () => {
    fraudWatch._reset(); tollFraud._reset(); process.env.LITE_SECURITY_ALERT_PHONE = '+14085551234';
    const got = [];
    try {
      await fraudWatch.runOnce({ client: fakeClient({ numbers: accountNumbers, calls: [] }),
        ownedDids: async () => ['+14085550100'], sendAlert: async (to, body) => got.push({ to, body }) });
      assert.strictEqual(got.length, 1);
      assert.ok(/unknown_number/.test(got[0].body));
      assert.ok(!got[0].body.includes('4108921440'), 'the alert text carried a full number');
    } finally { delete process.env.LITE_SECURITY_ALERT_PHONE; }
  });
  await t('LITE_FRAUD_AUTOLOCK=0 alerts without locking', async () => {
    fraudWatch._reset(); tollFraud._reset(); process.env.LITE_FRAUD_AUTOLOCK = '0';
    try {
      await fraudWatch.runOnce({ client: fakeClient({ numbers: accountNumbers, calls: [] }),
        ownedDids: async () => [], sendAlert: async () => {} });
      assert.ok(fraudWatch.status().alerts.length > 0);
      assert.strictEqual(tollFraud.lockState(), null);
    } finally { delete process.env.LITE_FRAUD_AUTOLOCK; }
  });
  await t('A WATCH THAT CANNOT READ THE ACCOUNT NEVER REPORTS "ALL CLEAR"', async () => {
    fraudWatch._reset();
    await fraudWatch.runOnce({ client: fakeClient({ fail: true }), ownedDids: async () => [], sendAlert: async () => {} });
    const s = fraudWatch.status();
    assert.ok(s.last_error, 'the failure was swallowed');
    assert.strictEqual(s.healthy, false);
  });
  await t('a quiet account raises nothing', async () => {
    fraudWatch._reset(); tollFraud._reset();
    const r = await fraudWatch.runOnce({
      client: fakeClient({ numbers: accountNumbers.filter((n) => n.sid !== 'PNattack'),
        calls: [{ sid: 'CAok', direction: 'outbound-dial', from: '+17627611589', to: '+14085551234' }] }),
      ownedDids: async () => ['+14085550100'], sendAlert: async () => {} });
    assert.strictEqual(r.length, 0);
    assert.strictEqual(tollFraud.lockState(), null);
  });
  await t('the CRM\'s own US calls spread over 20 minutes are NOT a burst', async () => {
    fraudWatch._reset(); tollFraud._reset();
    const spread = [];
    for (let i = 0; i < 15; i++) spread.push({ sid: 'CAcrm' + i, direction: 'outbound-api', from: '+12232949184', to: '+1408555' + String(1000 + i), startTime: new Date(Date.now() - 20 * 60 * 1000 + i * 80 * 1000) });
    const r = await fraudWatch.runOnce({ client: fakeClient({ numbers: accountNumbers.filter((n) => n.sid !== 'PNattack'), calls: spread }),
      ownedDids: async () => ['+14085550100'], sendAlert: async () => {} });
    assert.strictEqual(r.length, 0, JSON.stringify(r));
    assert.strictEqual(tollFraud.lockState(), null, 'legitimate CRM traffic locked Lite');
  });
  await t('the watch never releases or edits a number on its own', () => {
    const src = stripComments(read('src/security/fraudWatch.js'));
    assert.ok(!/\.remove\(|\.update\(|\.create\(/.test(src), 'fraudWatch mutates the account');
  });
  await t('the watch does not start on a laptop (NODE_ENV != production)', () => {
    assert.strictEqual(fraudWatch.enabled(), false);
  });

  section('Twilio webhook signatures');
  const twilio = require('twilio');
  const TOKEN = 'sit_test_token_0123456789abcdef';
  const URL = 'https://ringlypro-lite.onrender.com/voice/incoming';
  const params = { CallSid: 'CA123', From: '+14085551234', To: '+17627611589' };
  const goodSig = twilio.getExpectedTwilioSignature(TOKEN, URL, params);
  await t('a correctly signed request is valid', () =>
    assert.strictEqual(twilioSig.isValid({ authToken: TOKEN, signature: goodSig, url: URL, params }), true));
  await t('a forged request (params changed after signing) is refused', () =>
    assert.strictEqual(twilioSig.isValid({ authToken: TOKEN, signature: goodSig, url: URL, params: { ...params, From: '+237656876200' } }), false));
  await t('a missing signature is refused', () =>
    assert.strictEqual(twilioSig.isValid({ authToken: TOKEN, signature: '', url: URL, params }), false));
  await t('a signature made with the OLD (stolen) token is refused', () => {
    const stolen = twilio.getExpectedTwilioSignature('the_old_leaked_token_0000000000', URL, params);
    assert.strictEqual(twilioSig.isValid({ authToken: TOKEN, signature: stolen, url: URL, params }), false);
  });
  await t('enforce mode answers 403 and does not run the handler', async () => {
    process.env.LITE_TWILIO_SIGNATURE = 'enforce'; process.env.LITE_TWILIO_AUTH_TOKEN = TOKEN;
    try {
      let ran = false; let code = 200;
      const res = { status(c) { code = c; return this; }, type() { return this; }, send() { return this; } };
      twilioSig.middleware({ method: 'POST', headers: { host: 'x' }, body: params, originalUrl: '/voice/incoming', path: '/voice/incoming' }, res, () => { ran = true; });
      assert.strictEqual(code, 403); assert.strictEqual(ran, false);
    } finally { delete process.env.LITE_TWILIO_SIGNATURE; delete process.env.LITE_TWILIO_AUTH_TOKEN; }
  });
  await t('every public Twilio webhook route carries the signature check', () => {
    const src = read('src/routes/voice-relay.js');
    for (const r of ["post('/incoming'", "get('/incoming'", "post('/sms-fallback'", "post('/status'"]) {
      const line = src.split('\n').find((l) => l.includes(`router.${r}`));
      assert.ok(line && line.includes('twilioSig.middleware'), `${r} is not signature-checked`);
    }
  });

  await t('enforce refuses an unsigned relay WebSocket; log lets it through and counts it', () => {
    const req = { headers: { host: 'ringlypro-lite.onrender.com' }, url: '/voice-relay/ws' };
    process.env.LITE_TWILIO_SIGNATURE = 'enforce';
    try { assert.strictEqual(twilioSig.allowUpgrade(req), false); } finally { delete process.env.LITE_TWILIO_SIGNATURE; }
    assert.strictEqual(twilioSig.allowUpgrade(req), true);
  });
  await t('a signed relay WebSocket upgrade is accepted under enforce', () => {
    process.env.LITE_TWILIO_SIGNATURE = 'enforce'; process.env.LITE_TWILIO_AUTH_TOKEN = TOKEN;
    process.env.LITE_WEBHOOK_BASE_URL = 'https://ringlypro-lite.onrender.com';
    try {
      const sig = twilio.getExpectedTwilioSignature(TOKEN, 'wss://ringlypro-lite.onrender.com/voice-relay/ws', {});
      assert.strictEqual(twilioSig.allowUpgrade({ headers: { 'x-twilio-signature': sig, host: 'x' }, url: '/voice-relay/ws' }), true);
    } finally { delete process.env.LITE_TWILIO_SIGNATURE; delete process.env.LITE_TWILIO_AUTH_TOKEN; delete process.env.LITE_WEBHOOK_BASE_URL; }
  });
  await t('the WebSocket upgrade is signature-checked and a transfer needs a call /voice/incoming answered', () => {
    const src = read('server.js');
    assert.ok(/allowUpgrade\(req\)/.test(src), 'upgrade is not checked');
    const ft = src.slice(src.indexOf('async function fireTransfer'), src.indexOf('async function fireTransfer') + 500);
    assert.ok(/!ctx\.callVerified/.test(ft), 'a transfer can redirect any callSid');
    assert.ok(/callVerified = !!\(call && call\.started_at/.test(src), 'setup does not tie the socket to a real call');
  });
  await t('the public chat has a per-IP ceiling and at most one demo text per session', () => {
    const src = read('src/routes/webchat.js');
    assert.ok(/ipAllowed\(req\)/.test(src) && /status\(429\)/.test(src));
    assert.ok(/MAX_DEMO_SMS_PER_SESSION/.test(src));
  });

  section('structural promises');
  await t('NO FILE OUTSIDE THE PROVIDER CALLS TWILIO\'S SEND OR DIAL APIs DIRECTLY', () => {
    const files = execSync('git ls-files src server.js', { cwd: ROOT }).toString().trim().split('\n').filter((f) => f.endsWith('.js'));
    const offenders = [];
    for (const f of files) {
      if (f === 'src/telephony/twilioProvider.js') continue;
      const src = stripComments(read(f));
      // Anthropic's SDK also has a messages.create(); only Twilio's counts.
      const twilioSrc = src.split('\n').filter((l) => !/anthropic/i.test(l)).join('\n');
      const hits = twilioSrc.match(/messages\.create\(|\.calls\([^)]*\)\.update\(|calls\.create\(/g) || [];
      // server.js holds exactly one direct send: the fraud-watch alert, which
      // checks the allow-list itself (it must bypass only the auto-lock).
      if (f === 'server.js') {
        if (hits.length > 1) offenders.push(`${f} (${hits.length})`);
        else if (hits.length === 1 && !/checkDestination\(to\)\.ok/.test(src)) offenders.push(`${f} (alert without allow-list)`);
        continue;
      }
      if (hits.length) offenders.push(f);
    }
    assert.deepStrictEqual(offenders, [], 'direct Twilio send/dial outside the guarded provider');
  });
  await t('the provider checks the guard BEFORE touching the client, in both paths', () => {
    const src = read('src/telephony/twilioProvider.js');
    for (const fn of ['async sendSMS(', 'async redirectCall(']) {
      const body = src.slice(src.indexOf(fn), src.indexOf(fn) + 900);
      assert.ok(body.indexOf('tollFraud.authorize') > -1, `${fn} has no guard`);
      assert.ok(body.indexOf('tollFraud.authorize') < body.indexOf('this.client()'), `${fn} reaches the client before the guard`);
    }
  });
  await t('the phone fields are validated when an owner saves them', () => {
    assert.ok(/tollFraud\.checkDestination/.test(read('src/routes/api.js')), 'settings PATCH does not validate');
    assert.ok(/tollFraud\.checkDestination/.test(read('src/routes/auth.js')), 'signup does not validate owner_phone');
  });
  await t('transfer_to_human refuses a forbidden number up front (no dead air)', () => {
    assert.ok(/transfer_unavailable/.test(read('src/services/relayAgent.js')));
  });
  await t('IMPORT-DEMO IS NOT OPEN TO EVERY NEW ACCOUNT', () => {
    const src = read('src/routes/api.js');
    const body = src.slice(src.indexOf("router.post('/import-demo'"), src.indexOf("router.post('/import-demo'") + 900);
    assert.ok(/req\.tenantId !== demoTenantId/.test(body) && /404/.test(body), 'any signup could take the demo callers');
  });
  await t('no stack trace is sent to a client', () => {
    for (const f of execSync('git ls-files src', { cwd: ROOT }).toString().trim().split('\n').filter((x) => x.endsWith('.js'))) {
      assert.ok(!/stack:\s*e\.stack/.test(read(f)), `${f} returns e.stack`);
    }
  });
  await t('number purchases have a daily cap counted from the database', () => {
    const src = read('src/routes/onboarding.js');
    assert.ok(/LITE_MAX_NUMBERS_PER_DAY/.test(src) && /Number\.count\(/.test(src));
    assert.ok(src.indexOf('Number.count(') < src.indexOf('provider.buyNumber('), 'the cap is checked after buying');
  });

  section('security endpoint');
  await t('without the admin key it answers 404, not 401', async () => {
    process.env.LITE_ADMIN_KEY = 'sit_admin_key_0123456789';
    const express = require('express');
    const app = express(); app.set('fraudWatchDeps', () => ({}));
    app.use('/internal/security', require(path.join(ROOT, 'src/routes/security')));
    const srv = app.listen(0); const port = srv.address().port;
    const get = (headers) => new Promise((resolve) => http.get({ port, path: '/internal/security', headers }, (r) => resolve(r.statusCode)));
    try {
      assert.strictEqual(await get({}), 404);
      assert.strictEqual(await get({ 'x-admin-key': 'wrong' }), 404);
      assert.strictEqual(await get({ 'x-admin-key': 'sit_admin_key_0123456789' }), 200);
    } finally { srv.close(); delete process.env.LITE_ADMIN_KEY; }
  });
  await t('the user list is behind the same key and never selects a password hash', async () => {
    process.env.LITE_ADMIN_KEY = 'sit_admin_key_0123456789';
    const express = require('express');
    const app = express(); app.set('fraudWatchDeps', () => ({}));
    app.use('/internal/security', require(path.join(ROOT, 'src/routes/security')));
    const srv = app.listen(0); const port = srv.address().port;
    const get = (headers) => new Promise((resolve) => http.get({ port, path: '/internal/security/users', headers }, (r) => resolve(r.statusCode)));
    try {
      assert.strictEqual(await get({}), 404, 'no key must 404');
      assert.strictEqual(await get({ 'x-admin-key': 'wrong' }), 404, 'a wrong key must 404');
    } finally { srv.close(); delete process.env.LITE_ADMIN_KEY; }
    const src = read('src/routes/security.js');
    const block = src.slice(src.indexOf("router.get('/users'"));
    assert.ok(!/password_hash/.test(block), 'the user list must never touch password_hash');
    assert.ok(/tollFraud\.mask\(/.test(block), 'phone numbers in the user list must be masked');
  });
  await t('a short admin key is treated as unset (closed, not open)', async () => {
    process.env.LITE_ADMIN_KEY = 'short';
    const express = require('express');
    const app = express(); app.use('/s', require(path.join(ROOT, 'src/routes/security')));
    const srv = app.listen(0); const port = srv.address().port;
    try {
      const code = await new Promise((resolve) => http.get({ port, path: '/s', headers: { 'x-admin-key': 'short' } }, (r) => resolve(r.statusCode)));
      assert.strictEqual(code, 404);
    } finally { srv.close(); delete process.env.LITE_ADMIN_KEY; }
  });

  section('secrets never enter the repository');
  await t('no credential is committed anywhere under ringlypro-lite/', () => {
    const files = execSync('git ls-files', { cwd: ROOT }).toString().trim().split('\n')
      .filter((f) => !/package-lock\.json$|\.(png|jpg|jpeg|gif|ico|mp3|woff2?|pdf)$/i.test(f));
    const patterns = [
      [/\bSK[0-9a-f]{32}\b/, 'Twilio API key SID'],
      [/\bsk_live_[0-9A-Za-z]{10,}/, 'Stripe live secret'],
      [/\brk_live_[0-9A-Za-z]{10,}/, 'Stripe restricted key'],
      [/\bwhsec_[0-9A-Za-z]{16,}/, 'Stripe webhook secret'],
      [/\bsk-ant-[0-9A-Za-z_-]{20,}/, 'Anthropic key'],
      [/(AUTH_TOKEN|authToken)\s*[:=]\s*['"][0-9a-f]{32}['"]/, 'Twilio auth token literal'],
      [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'private key'],
    ];
    const hits = [];
    for (const f of files) {
      let src; try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) { continue; }
      for (const [re, what] of patterns) if (re.test(src)) hits.push(`${f}: ${what}`);
    }
    assert.deepStrictEqual(hits, []);
  });
  await t('.env is never tracked', () => {
    const tracked = execSync('git ls-files', { cwd: ROOT }).toString().split('\n');
    assert.ok(!tracked.some((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.example$/.test(f)));
  });

  section('CI guard is wired');
  await t('the workflow runs this suite on every ringlypro-lite change', () => {
    const wf = fs.readFileSync(path.join(ROOT, '..', '.github/workflows/lite-security.yml'), 'utf8');
    assert.ok(/ringlypro-lite\/\*\*/.test(wf), 'not triggered by ringlypro-lite paths');
    assert.ok(/test\/security-sit\.js/.test(wf), 'does not run the security SIT');
    assert.ok(/permissions:\s*\n\s*contents:\s*read/.test(wf), 'workflow token is not read-only');
  });
  await t('every action in the workflow is pinned to a commit, not a tag', () => {
    const wf = fs.readFileSync(path.join(ROOT, '..', '.github/workflows/lite-security.yml'), 'utf8');
    const uses = wf.match(/uses:\s*\S+/g) || [];
    assert.ok(uses.length > 0);
    for (const u of uses) assert.ok(/@[0-9a-f]{40}\b/.test(u), `${u} is not pinned by SHA`);
  });

  console.log(`\n${'='.repeat(64)}\n  ${pass}/${pass + fail} passed`);
  if (fail) console.log('  FAILED: ' + failures.join(' | '));
  console.log('  NOT COVERED: a real Twilio account, a real Twilio-signed webhook, the DB count behind the purchase cap.');
  console.log(`${'='.repeat(64)}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SIT crashed:', e); process.exit(1); });
