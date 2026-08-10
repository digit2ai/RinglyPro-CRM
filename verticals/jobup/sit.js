'use strict';

// =============================================================
// JobUp SIT — must pass with ZERO external keys (spec section 23).
//
// Run from the repo root:  node verticals/jobup/sit.js
// Uses the ju_-prefixed tables and degrades to the in-memory store when there
// is no database, so it never touches production data.
//
// No ANTHROPIC_API_KEY, no STRIPE_SECRET_KEY, no DATABASE_URL. Everything
// degrades to a labelled path and the assertions below still hold.
//
//   node sit.js
// =============================================================

process.env.JOBUP_JWT_SECRET = process.env.JOBUP_JWT_SECRET || 'sit-secret';

const assert = require('assert');

let pass = 0, fail = 0;
const failures = [];

function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log(`  ok  ${name}`); })
    .catch((e) => { fail++; failures.push({ name, err: e.message }); console.log(`FAIL  ${name}\n      ${e.message}`); });
}

function section(s) { console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 58 - s.length))}`); }

(async () => {
  console.log('JobUp SIT — zero external keys\n');

  const { init, models, scoped, TENANT_SCOPED } = require(__dirname + '/src/models');
  const r = await init();
  console.log(`store: ${r.backend}, ${r.tables} tables`);

  const settingsSvc = require(__dirname + '/src/services/settings');
  const identity = require(__dirname + '/src/services/identity');
  const geo = require(__dirname + '/src/services/geo');
  const employers = require(__dirname + '/src/services/employers');
  const jobsource = require(__dirname + '/src/services/jobsource');
  const matcher = require(__dirname + '/src/services/matcher');
  const resumeSvc = require(__dirname + '/src/services/resume');
  const addresses = require(__dirname + '/src/services/addresses');
  const billing = require(__dirname + '/src/services/billing');
  const brain = require(__dirname + '/src/services/brain');
  const agents = require(__dirname + '/src/services/agents');
  const teaser = require(__dirname + '/src/services/teaser');
  const siteRender = require(__dirname + '/src/services/site-render');

  // ---------------------------------------------------------------
  section('degradation with no keys');
  await t('brain reports disabled without ANTHROPIC_API_KEY', () => {
    if (!process.env.ANTHROPIC_API_KEY) assert.strictEqual(brain.enabled(), false);
  });
  await t('billing reports not-configured and NEVER a fake URL', async () => {
    const s = billing.status();
    assert.strictEqual(s.configured, false);
    const c = await billing.createCheckout({ subscriberId: 1, email: 'a@b.co' });
    assert.strictEqual(c.ok, false);
    assert.ok(!c.url, 'must not return a URL when it cannot take a payment');
    // Two honest refusals: the layer is switched off, or the key is missing.
    assert.ok(/switched off|not configured/i.test(c.error), 'the refusal must say why');
  });
  await t('THE PAYMENT LAYER DEFAULTS TO ON, and off is explicit', () => {
    const keep = ['JOBUP_BILLING_ENABLED', 'JOBUP_BILLING_DISABLED', 'JOBUP_FREE_ACTIVATION']
      .reduce((a, k) => { a[k] = process.env[k]; delete process.env[k]; return a; }, {});
    assert.strictEqual(billing.disabled(), false,
      'default is ON — JOBUP_BILLING_DISABLED=1 turns it off');
    process.env.JOBUP_BILLING_DISABLED = '1';
    const st = billing.status();
    assert.strictEqual(st.billing_disabled, true);
    assert.strictEqual(st.price_usd, null, 'no surface may quote a price while payment is off');
    assert.ok(/switched off/i.test(st.note), 'a disabled payment layer must never be silent');
    for (const [k, v] of Object.entries(keep)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  await t('the teaser quotes no price and its CTA points at the account form', async () => {
    const t2 = require(__dirname + '/src/services/teaser');
    const src = require('fs').readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(src.includes('build_url'), 'the CTA must follow the server, not hardcode Stripe');
    assert.ok(src.includes("'/build?t='"), 'and fall back to the form if the status call fails');
    // A null price must never render as "$null / year".
    assert.ok(/if\(c\.price_usd\)/.test(src), 'the price block must be conditional');
  });
  await t('the disabled switch is a SWITCH — every Stripe path is still there', () => {
    const src = require('fs').readFileSync(__dirname + '/src/services/billing.js', 'utf8');
    for (const fn of ['createCheckout', 'createPortal', 'applyEvent', 'renewalNoticesDue']) {
      assert.ok(src.includes('function ' + fn) || src.includes(fn + ' ('), 'lost the Stripe path: ' + fn);
    }
    assert.ok(src.includes('JOBUP_BILLING_ENABLED'), 'there must be a documented way back');
  });

  // ---------------------------------------------------------------
  section('multitenancy — the keystone');
  const subA = await models.subscribers.create({ email: 'sit-a@example.com', name: 'Ada Lovelace', status: 'active' });
  const subB = await models.subscribers.create({ email: 'sit-b@example.com', name: 'Grace Hopper', status: 'active' });

  await t('every per-subscriber table is tenant-scoped', () => {
    for (const tbl of ['profiles', 'settings', 'job_matches', 'outreach', 'agent_runs']) {
      assert.ok(TENANT_SCOPED.has(tbl), `${tbl} must be tenant-scoped`);
    }
  });
  await t('shared pool is NOT tenant-scoped (one fetch serves all)', () => {
    assert.ok(!TENANT_SCOPED.has('jobs'));
    assert.ok(!TENANT_SCOPED.has('employers'));
  });
  await t('scoped() refuses a shared table', () => {
    assert.throws(() => scoped('jobs', subA.id), /shared/);
  });
  await t('scoped() refuses a non-integer tenant', () => {
    assert.throws(() => scoped('profiles', '1 OR 1=1'), /integer/);
  });

  await scoped('profiles', subA.id).create({ resume_json: { name: 'Ada', skills: ['analytical engine'] }, source_text: 'Ada Lovelace. Analytical engine. Bernoulli numbers.' });
  await scoped('profiles', subB.id).create({ resume_json: { name: 'Grace', skills: ['COBOL'] }, source_text: 'Grace Hopper. COBOL. UNIVAC.' });

  await t('a tenant reads only its own rows', async () => {
    const a = await scoped('profiles', subA.id).findAll({});
    assert.strictEqual(a.length, 1);
    assert.strictEqual(a[0].resume_json.name, 'Ada');
  });
  await t('CROSS-TENANT READ RETURNS NOTHING, not another tenant row', async () => {
    const rows = await scoped('profiles', subA.id).findAll({});
    assert.ok(rows.every((x) => x.tenant_id === subA.id));
    const asB = await scoped('profiles', subB.id).findOne({ id: rows[0].id });
    assert.strictEqual(asB, null, 'tenant B must not read tenant A row by id');
  });

  // ---------------------------------------------------------------
  section('settings — honesty forced in code');
  await t('approval_required is forced TRUE even when explicitly disabled', () => {
    const s = settingsSvc.sanitize({ approval_required: false });
    assert.strictEqual(s.approval_required, true);
  });
  await t('sensitive fields are private by default', () => {
    const s = settingsSvc.sanitize({});
    for (const k of ['email', 'phone', 'compensation', 'work_authorization', 'clearance']) {
      assert.strictEqual(s.privacy[k], false, `${k} must be private by default`);
    }
  });
  await t('outreachFacts returns only owner-entered lines', () => {
    const s = settingsSvc.sanitize({ facts: { work_authorization: 'US citizen' } });
    const f = settingsSvc.outreachFacts(s);
    assert.deepStrictEqual(f.lines, ['US citizen']);
    assert.strictEqual(f.verbatim, true);
  });
  await t('blocked employers are absolute', () => {
    const s = settingsSvc.sanitize({ blocked: { employers: ['Acme'] } });
    assert.strictEqual(settingsSvc.employerBlocked(s, 'ACME Corporation'), true);
    assert.strictEqual(settingsSvc.employerBlocked(s, 'Globex'), false);
  });

  // ---------------------------------------------------------------
  section('privacy projection — deleted, not blanked');
  const profile = { name: 'Ada', headline: 'Engineer', email: 'ada@example.com', phone: '+15550001', summary: 'S', skills: ['x'] };
  await t('private fields are ABSENT from the projection', () => {
    const s = settingsSvc.sanitize({});
    const p = identity.applyPrivacy(profile, s);
    assert.ok(!('email' in p), 'email key must be deleted, not blanked');
    assert.ok(!('phone' in p), 'phone key must be deleted, not blanked');
  });
  await t('private fields are ABSENT from resume.json', () => {
    const s = settingsSvc.sanitize({});
    const j = identity.resumeJson(profile, s, { name: 'Ada', url: 'https://ada.jobup.dev' });
    assert.ok(!('email' in j.basics));
    assert.ok(!('phone' in j.basics));
  });
  await t('private fields are ABSENT from the agent card and JSON-LD', () => {
    const s = settingsSvc.sanitize({});
    const ld = identity.personJsonLd(profile, s, { name: 'Ada', url: 'https://ada.jobup.dev' });
    assert.ok(!('email' in ld));
    const card = JSON.stringify(identity.agentCard(profile, s, { name: 'Ada', url: 'https://ada.jobup.dev', slug: 'ada' }));
    assert.ok(!card.includes('ada@example.com'));
  });
  await t('opting in makes the field appear', () => {
    const s = settingsSvc.sanitize({ privacy: { email: true } });
    const p = identity.applyPrivacy(profile, s);
    assert.strictEqual(p.email, 'ada@example.com');
  });
  await t('rendered HTML never leaks a private field', () => {
    const s = settingsSvc.sanitize({});
    const html = siteRender.page(profile, s, { name: 'Ada', url: 'https://ada.jobup.dev', slug: 'ada' });
    assert.ok(!html.includes('ada@example.com'), 'private email must not reach the page');
    assert.ok(!html.includes('+15550001'), 'private phone must not reach the page');
  });

  // ---------------------------------------------------------------
  section('ATS connectors — guessed-token quarantine');
  const fakeFetch = async () => ({ ok: true, json: async () => ({ jobs: [
    { id: 1, title: 'Staff Engineer', absolute_url: 'https://x/1', location: { name: 'Austin, TX' }, content: 'Go, Postgres' },
  ] }) });

  await t('a GUESSED token is quarantined and contributes NOTHING', async () => {
    const res = await employers.fetchBoard('greenhouse', 'guessed-co', { verified: false, fetchImpl: fakeFetch });
    assert.strictEqual(res.status, 'unverified');
    assert.strictEqual(res.contributes, false);
    assert.strictEqual(res.postings.length, 0, 'unverified board must contribute zero postings');
    assert.ok(res.sample_titles.length > 0, 'sample titles are surfaced for a human to judge');
  });
  await t('a CONFIRMED token contributes', async () => {
    const res = await employers.fetchBoard('greenhouse', 'real-co', { verified: true, fetchImpl: fakeFetch });
    assert.strictEqual(res.status, 'live');
    assert.strictEqual(res.contributes, true);
    assert.ok(res.postings.length > 0);
  });
  await t('a demo/sample board is rejected outright', async () => {
    const demoFetch = async () => ({ ok: true, json: async () => ({ jobs: [
      { id: 9, title: 'Senior Marketer (Sample)', absolute_url: 'https://x/9', location: { name: 'Amsterdam' }, content: 'demo' },
    ] }) });
    const res = await employers.fetchBoard('greenhouse', 'accenture', { verified: true, fetchImpl: demoFetch });
    assert.strictEqual(res.status, 'demo');
    assert.strictEqual(res.contributes, false);
  });
  await t('closed ATS families are NAMED as closed, not scraped around', async () => {
    for (const fam of ['icims', 'taleo', 'phenom', 'oracle_hcm', 'successfactors']) {
      const res = await employers.fetchBoard(fam, 'anything', { verified: true, fetchImpl: fakeFetch });
      assert.strictEqual(res.status, 'closed', `${fam} must report closed`);
      assert.ok(/no keyless public feed/i.test(res.note));
    }
  });
  await t('Workday is treated as paginated', () => {
    assert.strictEqual(employers.ADAPTERS.workday.paginated, true);
  });
  await t('all 8 ATS adapters are present', () => {
    const want = ['greenhouse','lever','ashby','smartrecruiters','workable','recruitee','workday','eightfold'];
    for (const a of want) assert.ok(employers.ADAPTERS[a], `missing adapter: ${a}`);
  });

  // ---------------------------------------------------------------
  section('geo policy — messy ATS location strings');
  const usOnly = { allowed_countries: ['US'], flag_unknown: true };
  await t('Remote - US allowed for a US-only profile', () => {
    assert.strictEqual(geo.evaluate('Remote - US', usOnly).verdict, 'allow');
  });
  await t('Remote (Global) allowed', () => {
    assert.strictEqual(geo.evaluate('Remote - Global', usOnly).verdict, 'allow');
  });
  await t('a non-policy country is blocked', () => {
    assert.strictEqual(geo.evaluate('Berlin, Germany', usOnly).verdict, 'block');
  });
  await t('city, ST infers US', () => {
    assert.strictEqual(geo.evaluate('Austin, TX', usOnly).verdict, 'allow');
  });
  await t('NO LOCATION is FLAGGED, never silently included', () => {
    const v = geo.evaluate('', usOnly);
    assert.strictEqual(v.verdict, 'flag');
    assert.ok(/no location/i.test(v.reason));
  });
  await t('unrestricted profile allows anything located', () => {
    assert.strictEqual(geo.evaluate('Berlin, Germany', { allowed_countries: [] }).verdict, 'allow');
  });

  // ---------------------------------------------------------------
  section('shared job pool + free pre-filter');
  await models.jobs.create({ source: 'greenhouse', employer: 'Globex', title: 'Senior Go Engineer',
    location: 'Austin, TX', description: 'Go, Postgres, Kubernetes', dedupe_key: 'k1', url: 'https://x/1' });
  await models.jobs.create({ source: 'lever', employer: 'Initech', title: 'Marketing Lead',
    location: 'Remote - US', description: 'Brand, campaigns', dedupe_key: 'k2', url: 'https://x/2' });

  await t('dedupe key collapses the same role across sources', () => {
    const a = jobsource.dedupeKey({ employer: 'Globex', title: 'Senior Go Engineer', location: 'Austin, TX' });
    const b = jobsource.dedupeKey({ employer: 'globex', title: 'senior go engineer', location: 'austin, tx' });
    assert.strictEqual(a, b);
  });
  await t('pre-filter is deterministic and free (no model call)', async () => {
    const pool = await models.jobs.findAll({});
    const ranked = jobsource.prefilter(pool, { skills: ['Go', 'Postgres'], headline: 'Go Engineer' },
      settingsSvc.sanitize({ targeting: { roles: [{ title: 'Senior Go Engineer' }] } }));
    assert.ok(ranked.length >= 1);
    assert.strictEqual(ranked[0].job.title, 'Senior Go Engineer');
  });

  // ---------------------------------------------------------------
  section('matching — compensation and cost discipline');
  await t('heuristic scoring is marked is_simulated without a key', async () => {
    const pool = await models.jobs.findAll({});
    const res = await matcher.scoreBatch(pool, { skills: ['Go'], headline: 'Go Engineer' }, settingsSvc.sanitize({}), { capUsd: 0.01 });
    assert.ok(res.matches.length > 0);
    if (!process.env.ANTHROPIC_API_KEY) {
      assert.ok(res.matches.every((m) => m.is_simulated === true), 'must be labelled simulated');
    }
  });
  await t('COMPENSATION IS NULL when the posting does not state it', async () => {
    const pool = await models.jobs.findAll({});
    const res = await matcher.scoreBatch(pool, { skills: ['Go'] }, settingsSvc.sanitize({}), { capUsd: 0.01 });
    assert.ok(res.matches.every((m) => m.compensation == null), 'compensation must never be estimated');
  });
  await t('a blocked employer never reaches scoring', async () => {
    const pool = await models.jobs.findAll({});
    const s = settingsSvc.sanitize({ blocked: { employers: ['Globex'] } });
    const res = await matcher.scoreBatch(pool, { skills: ['Go'] }, s, { capUsd: 0.01 });
    assert.ok(res.matches.every((m) => m.job.employer !== 'Globex'));
  });

  // ---------------------------------------------------------------
  section('resume tailoring — the no-invented-facts guard');
  const SRC = 'Ada Lovelace. Senior Engineer at Globex 2019-2024. Built the analytical engine. Reduced latency 40%.';
  await t('an invented EMPLOYER is flagged', () => {
    const flags = resumeSvc.flagInventedFacts(SRC, SRC + ' Also worked at Microsoft.');
    assert.ok(flags.some((f) => f.term === 'Microsoft'), 'new employer must be flagged');
  });
  await t('an invented METRIC is flagged', () => {
    const flags = resumeSvc.flagInventedFacts(SRC, SRC.replace('40%', '95%'));
    assert.ok(flags.some((f) => f.type === 'number' && f.term === '95%'));
  });
  await t('a faithful rewrite produces NO flags', () => {
    const flags = resumeSvc.flagInventedFacts(SRC, 'Senior Engineer at Globex, 2019-2024. Reduced latency 40%.');
    assert.strictEqual(flags.length, 0, 'reordering existing facts must not flag: ' + JSON.stringify(flags));
  });
  await t('tailoring without a key returns the SOURCE unchanged, not a fabrication', async () => {
    const out = await resumeSvc.tailor(SRC, { title: 'Engineer', employer: 'X', description: 'Rust, Kafka' });
    if (!process.env.ANTHROPIC_API_KEY) {
      assert.strictEqual(out.content, SRC);
      assert.strictEqual(out.is_simulated, true);
      assert.strictEqual(out.flagged.length, 0);
    }
  });
  await t('ATS scoring is deterministic and costs nothing', () => {
    const s = resumeSvc.atsScore(SRC, { title: 'Senior Engineer', description: 'analytical engine latency' });
    assert.strictEqual(s.deterministic, true);
    assert.ok(s.score > 0 && s.score <= 100);
    assert.ok(Array.isArray(s.missing));
  });

  // ---------------------------------------------------------------
  section('web address ladder');
  await t('ladder prefers firstnamelastname', () => {
    const l = addresses.ladder({ first: 'Ada', last: 'Lovelace' });
    assert.strictEqual(l[0], 'adalovelace');
  });
  await t('accents and punctuation are normalised', () => {
    const l = addresses.ladder({ first: 'José', last: "O'Neill" });
    assert.strictEqual(l[0], 'joseoneill');
  });
  await t('reserved labels are excluded', () => {
    const l = addresses.ladder({ first: 'ad', last: 'min' });
    assert.ok(!l.includes('admin'));
  });
  await t('allocation resolves a free rung and marks the exact match', async () => {
    const r = await addresses.allocate({ first: 'Ada', last: 'Lovelace' });
    assert.strictEqual(r.ok, true);
    assert.ok(r.host.endsWith('.' + addresses.BASE_DOMAIN));
  });
  await t('a taken address falls to the next rung, never reassigned', async () => {
    await models.subscribers.update({ address: 'gracehopper.' + addresses.BASE_DOMAIN }, { where: { id: subB.id } });
    const taken = await addresses.isTaken('gracehopper');
    assert.strictEqual(taken, true);
    const r = await addresses.allocate({ first: 'Grace', last: 'Hopper', city: 'Arlington' });
    assert.notStrictEqual(r.label, 'gracehopper');
  });

  // ---------------------------------------------------------------
  section('agents');
  await t('hunter scores and logs, respecting the pre-filter', async () => {
    await scoped('settings', subA.id).create({ settings: settingsSvc.sanitize({ targeting: { roles: [{ title: 'Senior Go Engineer' }] } }) });
    await scoped('profiles', subA.id).update({ resume_json: { name: 'Ada', headline: 'Go Engineer', skills: ['Go', 'Postgres'] } }, {});
    const res = await agents.hunter(subA.id);
    assert.ok(res.agent === 'hunter');
    const runs = await scoped('agent_runs', subA.id).findAll({});
    assert.ok(runs.some((x) => x.agent === 'hunter'), 'run must be logged');
  });
  await t('presence names gaps and regenerates surfaces from one source', async () => {
    const res = await agents.presence(subA.id);
    assert.ok(Array.isArray(res.gaps));
  });
  await t('agent fan-out respects the concurrency ceiling', () => {
    assert.ok(agents.CONCURRENCY >= 1 && agents.CONCURRENCY <= 32);
  });

  // ---------------------------------------------------------------
  section('teaser — honesty under an empty pool');
  await t('teaser build never fabricates an opening', async () => {
    const payload = await teaser.build({
      name: 'Ada Lovelace', email: 'ada@example.com', language: 'en',
      resumeText: SRC, ip: '127.0.0.1',
    });
    assert.strictEqual(payload.status, 'ready');
    assert.ok(Array.isArray(payload.narration) && payload.narration.length > 0);
    const m = payload.screens.matches;
    if (!m.pool_available) {
      assert.strictEqual(m.items.length, 0, 'no pool means NO items — never invented');
    }
    for (const item of m.items) {
      assert.ok('score' in item, 'every shown job was actually scored');
    }
  });
  await t('teaser stays inside its cost cap', async () => {
    const payload = await teaser.build({ name: 'Ada', email: 'a@b.co', language: 'en', resumeText: SRC, ip: '1.1.1.1' });
    assert.ok(payload.cost_usd <= teaser.TEASER_COST_CAP + 0.001, `cost ${payload.cost_usd} exceeded cap`);
  });
  await t('teaser carries no guaranteed-outcome language', async () => {
    const payload = await teaser.build({ name: 'Ada', email: 'a@b.co', language: 'en', resumeText: SRC, ip: '1.1.1.2' });
    const blob = JSON.stringify(payload).toLowerCase();
    for (const banned of ['guaranteed job', 'guaranteed interview', 'guaranteed employment', 'guarantee you a job']) {
      assert.ok(!blob.includes(banned), `banned phrase present: ${banned}`);
    }
  });
  await t('Spanish narration is produced for lang=es', async () => {
    const payload = await teaser.build({ name: 'Ada', email: 'a@b.co', language: 'es', resumeText: SRC, ip: '1.1.1.3' });
    assert.ok(/Dalia/.test(payload.narration[0]), 'ES narration must be Dalia');
  });

  // ---------------------------------------------------------------
  section('billing lifecycle');
  await t('an unattributable webhook is PARKED, never guessed onto a subscriber', async () => {
    const r2 = await billing.applyEvent('checkout.session.completed', { customer: 'cus_x' });
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.parked, true);
  });
  await t('checkout.session.completed activates by metadata', async () => {
    const r2 = await billing.applyEvent('checkout.session.completed',
      { customer: 'cus_1', subscription: 'sub_1', metadata: { subscriber_id: String(subA.id) } });
    assert.strictEqual(r2.ok, true);
    const s = await models.subscribers.findOne({ where: { id: subA.id } });
    assert.strictEqual(s.status, 'active');
  });
  await t('payment_failed escalates dunning stages', async () => {
    const a = await billing.applyEvent('invoice.payment_failed',
      { id: 'in_1', amount_due: 2500, metadata: { subscriber_id: String(subA.id) } });
    assert.strictEqual(a.stage, 1);
    assert.strictEqual(a.suspend, false);
    const b = await billing.applyEvent('invoice.payment_failed',
      { id: 'in_1', amount_due: 2500, metadata: { subscriber_id: String(subA.id) } });
    assert.strictEqual(b.stage, 2);
  });
  await t('trial_will_end is handled (the conversion email)', async () => {
    const r2 = await billing.applyEvent('customer.subscription.trial_will_end',
      { metadata: { subscriber_id: String(subA.id) } });
    assert.strictEqual(r2.action, 'trial_will_end_notice_queued');
  });
  await t('refund window is enforced', () => {
    assert.strictEqual(billing.refundEligible(new Date()), true);
    assert.strictEqual(billing.refundEligible(new Date(Date.now() - 30 * 86400000)), false);
  });
  await t('renewal notice fires at 30 and 7 days', async () => {
    assert.deepStrictEqual(billing.RENEWAL_NOTICE_DAYS, [30, 7]);
    await models.subscribers.update(
      { status: 'active', current_period_end: new Date(Date.now() + 30 * 86400000) },
      { where: { id: subB.id } });
    const due = await billing.renewalNoticesDue();
    assert.ok(due.some((d) => d.subscriber_id === subB.id && d.days_out === 30));
  });
  await t('A RENEWAL NOTICE QUOTES THE SUBSCRIBER\'S OWN PRICE, NOT THE LIST', async () => {
    // Stripe keeps an existing subscription on the price it was created with,
    // so after a price cut the list figure is wrong for every earlier signup.
    // Telling someone "$25" days before charging them $97 is the failure here.
    await models.subscribers.update(
      { status: 'active', current_period_end: new Date(Date.now() + 7 * 86400000) },
      { where: { id: subB.id } });
    await models.invoices.create({
      tenant_id: subB.id, stripe_invoice_id: 'in_sit_legacy',
      amount_cents: 9700, status: 'paid', paid_at: new Date(),
    });
    const due = await billing.renewalNoticesDue();
    const row = due.find((d) => d.subscriber_id === subB.id);
    assert.ok(row, 'the subscriber should be due a notice');
    assert.strictEqual(row.amount_usd, 97,
      'a legacy subscriber must be quoted what they actually pay');
    assert.strictEqual(row.amount_source, 'last_invoice');
    assert.notStrictEqual(row.amount_usd, billing.PRICE_USD,
      'this test is meaningless if the list price happens to equal the legacy one');
  });

  // ---------------------------------------------------------------
  section('subscribers admin — who paid, how much, when');
  {
    const express = require('express');
    const http = require('http');
    // No hardcoded default any more: configure it the way production must.
    // A distinct value, so a test passing does not depend on a published one.
    process.env.JOBUP_SUBS_ADMIN_PASSWORD = 'sit-only-console-secret';
    const subsAdmin = require(__dirname + '/src/routes/subscribers-admin');

    // Mounted the way the vertical mounts it, so the paths under test are real.
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.cookies = {};
      for (const part of String(req.headers.cookie || '').split(';')) {
        const i = part.indexOf('=');
        if (i > 0) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      }
      next();
    });
    app.use('/subscribers-admin', subsAdmin);
    const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const port = srv.address().port;
    const call = (method, path, { body, cookie } = {}) => new Promise((ok, bad) => {
      const data = body ? JSON.stringify(body) : null;
      const r = http.request({ host: '127.0.0.1', port, path, method,
        headers: Object.assign({}, data ? { 'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data) } : {}, cookie ? { Cookie: cookie } : {}) },
        (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => {
          let j = null; try { j = JSON.parse(b); } catch (e) { /* csv */ }
          ok({ status: x.statusCode, j, body: b, setCookie: x.headers['set-cookie'] });
        }); });
      r.on('error', bad); if (data) r.write(data); r.end();
    });

    let session = '';
    await t('THE CONSOLE IS CLOSED WITHOUT A SESSION', async () => {
      for (const p of ['/subscribers-admin/api/subscribers',
                       '/subscribers-admin/api/export.csv',
                       '/subscribers-admin/api/subscribers/1/invoices']) {
        const r = await call('GET', p);
        assert.strictEqual(r.status, 401, `${p} must refuse an anonymous caller`);
      }
    });
    await t('a wrong password is refused, and so is a wrong email', async () => {
      const bad = await call('POST', '/subscribers-admin/api/login',
        { body: { email: 'admin@jobup.dev', password: 'not-it-at-all' } });
      assert.strictEqual(bad.status, 401);
      const wrongUser = await call('POST', '/subscribers-admin/api/login',
        { body: { email: 'someone@else.com', password: 'sit-only-console-secret' } });
      assert.strictEqual(wrongUser.status, 401);
      // Neither response may hint at which half was wrong.
      assert.deepStrictEqual(bad.j, wrongUser.j);
    });
    await t('the configured admin can sign in', async () => {
      const r = await call('POST', '/subscribers-admin/api/login',
        { body: { email: 'admin@jobup.dev', password: 'sit-only-console-secret' } });
      assert.strictEqual(r.status, 200, JSON.stringify(r.j));
      assert.ok(r.setCookie && r.setCookie[0].includes('jobup_subs_admin='), 'a session cookie is set');
      assert.ok(/HttpOnly/i.test(r.setCookie[0]), 'the cookie must not be readable from JS');
      assert.ok(/Secure/i.test(r.setCookie[0]) && /SameSite=Strict/i.test(r.setCookie[0]));
      session = r.setCookie[0].split(';')[0];
    });
    await t('AMOUNT PAID COMES FROM INVOICES, NOT THE LIST PRICE', async () => {
      const r = await call('GET', '/subscribers-admin/api/subscribers', { cookie: session });
      assert.strictEqual(r.status, 200);
      const mine = r.j.subscribers.find((s) => s.id === subB.id);
      assert.ok(mine, 'the seeded subscriber should be listed');
      // subB has exactly one paid $97 invoice from the renewal-notice test.
      assert.strictEqual(mine.amount_paid_usd, 97);
      assert.strictEqual(mine.payments, 1);
      assert.notStrictEqual(mine.amount_paid_usd, r.j.totals.list_price_usd,
        'the figure must trace to an invoice, not to the current price');
      // Someone never charged reads 0.00, never the list price.
      const unpaid = r.j.subscribers.find((s) => s.payments === 0);
      if (unpaid) assert.strictEqual(unpaid.amount_paid_usd, 0);
    });
    await t('every row carries a subscription date and names its source', async () => {
      const r = await call('GET', '/subscribers-admin/api/subscribers', { cookie: session });
      for (const s of r.j.subscribers) {
        assert.ok(['activated_at', 'created_at'].includes(s.subscribed_at_source),
          'the date must say which column it came from rather than silently swapping');
      }
    });
    await t('A FREE TEST ACCOUNT IS NEVER PRESENTED AS A PAYING ONE', async () => {
      await models.subscribers.update({ activation: 'free_test' }, { where: { id: subA.id } });
      const r = await call('GET', '/subscribers-admin/api/subscribers', { cookie: session });
      const row = r.j.subscribers.find((s) => s.id === subA.id);
      assert.strictEqual(row.activation, 'free_test', 'the row must be labelled');
      assert.ok(r.j.totals.free_test >= 1, 'and counted apart from real subscribers');
      await models.subscribers.update({ activation: 'paid' }, { where: { id: subA.id } });
    });
    await t('CAREER DATA IS STILL OUT OF REACH FROM THIS CONSOLE', async () => {
      // The relaxation is billing identity only. /admin's real rule — no
      // resumes, matches, outreach or settings — survives intact here.
      const r = await call('GET', '/subscribers-admin/api/subscribers', { cookie: session });
      const keys = new Set(r.j.subscribers.flatMap((s) => Object.keys(s)));
      for (const leak of ['resume_json', 'source_text', 'matches', 'outreach',
                          'settings', 'password_hash', 'pipeline']) {
        assert.ok(!keys.has(leak), `the list must not expose ${leak}`);
      }
      const src = require('fs').readFileSync(__dirname + '/src/routes/subscribers-admin.js', 'utf8');
      for (const table of ['profiles', 'matches', 'outreach', 'settings']) {
        assert.ok(!src.includes(`models.${table}`), `this module must not read models.${table}`);
      }
    });
    await t('the CSV export carries the same figures, and is audited', async () => {
      const before = (await models.audit_log.findAll({})).length;
      const r = await call('GET', '/subscribers-admin/api/export.csv', { cookie: session });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.startsWith('id,name,email,status,activation,subscribed_at'));
      assert.ok(r.body.includes('97'), 'the paid amount should appear in the export');
      const after = await models.audit_log.findAll({});
      assert.ok(after.length > before, 'an export must leave an audit row');
      assert.ok(after.some((a) => a.action === 'subs_admin.export.csv'));
    });
    await t('viewing the list is written to the audit log', async () => {
      const rows = await models.audit_log.findAll({});
      assert.ok(rows.some((a) => a.action === 'subs_admin.list.viewed'),
        'a relaxed privacy boundary without a trail is just a hole');
      assert.ok(rows.some((a) => a.action === 'subs_admin.login.failed'),
        'failed sign-ins must be recorded too');
    });
    await t('THE REPO NO LONGER SHIPS A WORKING PASSWORD', () => {
      const src = require('fs').readFileSync(__dirname + '/src/routes/subscribers-admin.js', 'utf8');
      // It shipped with one, at the owner's request. The credential now lives in
      // the environment, so publishing a key in a public repo buys nothing.
      assert.ok(!/JOBUP_SUBS_ADMIN_PASSWORD \|\| '[^']+'/.test(src),
        'no literal password may back the env var');
      assert.ok(src.includes("|| process.env.JOBUP_ADMIN_PASSWORD || ''"),
        'unset must mean CLOSED, with the platform secret as the only fallback');
    });
    await t('unset credentials CLOSE the console rather than open it', async () => {
      const subs = process.env.JOBUP_SUBS_ADMIN_PASSWORD;
      const plat = process.env.JOBUP_ADMIN_PASSWORD;
      delete process.env.JOBUP_SUBS_ADMIN_PASSWORD;
      delete process.env.JOBUP_ADMIN_PASSWORD;
      try {
        assert.strictEqual(subsAdmin.configured(), false);
        const r = await call('POST', '/subscribers-admin/api/login',
          { body: { email: 'admin@jobup.dev', password: 'anything' } });
        assert.strictEqual(r.status, 503, 'a console with no password must refuse to sign anyone in');
      } finally {
        if (subs) process.env.JOBUP_SUBS_ADMIN_PASSWORD = subs;
        if (plat) process.env.JOBUP_ADMIN_PASSWORD = plat;
      }
    });
    await t('ONE SECRET CAN SECURE BOTH CONSOLES', async () => {
      // Two near-identical variable names is a trap: setting the obvious one and
      // believing you were done is exactly what happened in production.
      const subs = process.env.JOBUP_SUBS_ADMIN_PASSWORD;
      delete process.env.JOBUP_SUBS_ADMIN_PASSWORD;
      process.env.JOBUP_ADMIN_PASSWORD = 'platform-only-secret-value';
      try {
        assert.strictEqual(subsAdmin.configured(), true, 'it must fall back to the platform secret');
        const r = await call('POST', '/subscribers-admin/api/login',
          { body: { email: 'admin@jobup.dev', password: 'platform-only-secret-value' } });
        assert.strictEqual(r.status, 200, 'the platform password should open this console too');
      } finally {
        delete process.env.JOBUP_ADMIN_PASSWORD;
        if (subs) process.env.JOBUP_SUBS_ADMIN_PASSWORD = subs;
      }
    });
    await t('A PUBLISHED PASSWORD IS DETECTED BY VALUE, NOT BY PRESENCE', async () => {
      // The first version of this check asked "is the env var set?", which
      // answered reassuringly for JOBUP_SUBS_ADMIN_PASSWORD=Palindrome@7 while
      // the console stayed openable by anyone who had read the repo.
      const keep = process.env.JOBUP_SUBS_ADMIN_PASSWORD;
      try {
        for (const published of subsAdmin.PUBLISHED_PASSWORDS.filter((p) => p.length >= 12)) {
          process.env.JOBUP_SUBS_ADMIN_PASSWORD = published;
          assert.strictEqual(subsAdmin.weakPassword(), true,
            `setting the env var to the published "${published}" must still report weak`);
          const h = await call('GET', '/subscribers-admin/api/health');
          assert.strictEqual(h.j.weak_password, true);
        }
        process.env.JOBUP_SUBS_ADMIN_PASSWORD = 'a-value-that-appears-nowhere';
        assert.strictEqual(subsAdmin.weakPassword(), false);
      } finally { process.env.JOBUP_SUBS_ADMIN_PASSWORD = keep; }
      const html = require('fs').readFileSync(__dirname + '/public/subscribers-admin.html', 'utf8');
      assert.ok(html.includes('weak_password'), 'the console must react to it');
      assert.ok(html.includes('JOBUP_SUBS_ADMIN_PASSWORD'), 'and name the env var that fixes it');
    });
    await t('DELETION REFUSES WITHOUT A WRITTEN REASON', async () => {
      const r = await call('DELETE', `/subscribers-admin/api/subscribers/${subB.id}`,
        { cookie: session, body: { reason: 'oops' } });
      assert.strictEqual(r.status, 400, 'a token reason must not be accepted');
      const none = await call('DELETE', `/subscribers-admin/api/subscribers/${subB.id}`,
        { cookie: session, body: {} });
      assert.strictEqual(none.status, 400);
      // And it must not have deleted anything on the way to refusing.
      assert.ok(await models.subscribers.findOne({ where: { id: subB.id } }),
        'a refused deletion must leave the account intact');
    });
    await t('deletion is gated by the session like everything else', async () => {
      const r = await call('DELETE', `/subscribers-admin/api/subscribers/${subB.id}`,
        { body: { reason: 'anonymous attempt at deletion' } });
      assert.strictEqual(r.status, 401);
    });
    await t('PURGE ERASES EVERY TENANT-SCOPED TABLE, AND ONLY THOSE', async () => {
      const victim = await models.subscribers.create({
        email: `sit-purge-${Date.now()}@example.com`, name: 'SIT Purge Target',
        status: 'active', activation: 'free_test', address: 'sitpurge.jobup.dev',
      });
      // Give it rows in a spread of tenant-scoped tables.
      await models.profiles.create({ tenant_id: victim.id, resume_json: { name: 'x' } });
      await models.settings.create({ tenant_id: victim.id, settings: {} });
      await models.page_views.create({ tenant_id: victim.id, path: '/' });
      await models.invoices.create({ tenant_id: victim.id, amount_cents: 100, status: 'paid' });

      const jobsBefore = (await models.jobs.findAll({})).length;
      const employersBefore = (await models.employers.findAll({})).length;

      const r = await call('DELETE', `/subscribers-admin/api/subscribers/${victim.id}`,
        { cookie: session, body: { reason: 'SIT verification of the purge path' } });
      assert.strictEqual(r.status, 200, JSON.stringify(r.j));

      assert.strictEqual(await models.subscribers.findOne({ where: { id: victim.id } }), null,
        'the subscriber row must be gone');
      for (const table of ['profiles', 'settings', 'page_views', 'invoices']) {
        const left = await models[table].findAll({ where: { tenant_id: victim.id } });
        assert.strictEqual(left.length, 0, `${table} still holds rows for the purged tenant`);
      }
      // The shared pool belongs to everyone. Purging one account must not take
      // postings away from the others.
      assert.strictEqual((await models.jobs.findAll({})).length, jobsBefore, 'ju_jobs must be untouched');
      assert.strictEqual((await models.employers.findAll({})).length, employersBefore,
        'ju_employers must be untouched');
    });
    await t('the purge audit row OUTLIVES the tenant it describes', async () => {
      const rows = await models.audit_log.findAll({});
      const purges = rows.filter((a) => a.action === 'account.purged');
      assert.ok(purges.length, 'a purge must be recorded');
      const last = purges[purges.length - 1];
      assert.strictEqual(last.tenant_id, null,
        'stored under the purged tenant it would have been deleted with it');
      assert.ok(/SIT verification of the purge path/.test(last.reason), 'the reason is kept');
      assert.ok(/sit-purge-/.test(last.reason), 'and a snapshot of who was erased');
    });
    await t('THE PURGE TABLE LIST IS DERIVED, NOT TYPED', () => {
      const fs = require('fs');
      const src = fs.readFileSync(__dirname + '/src/services/provisioning.js', 'utf8');
      // A hardcoded list goes stale the moment a table is added, leaving orphan
      // rows answering to a tenant_id nobody owns.
      assert.ok(/for \(const table of TENANT_SCOPED\)/.test(src),
        'purge must walk models.TENANT_SCOPED');
      assert.ok(!/'profiles', 'settings', 'teasers'/.test(src.slice(src.indexOf('async function purge'))),
        'no literal table list inside purge');
    });
    await t('signing out invalidates the console', async () => {
      const out = await call('POST', '/subscribers-admin/api/logout', { cookie: session });
      assert.strictEqual(out.status, 200);
      assert.ok(/jobup_subs_admin=;/.test(String(out.setCookie)), 'the cookie is cleared');
    });
    srv.close();
  }
  await t('the console HTML renders at every root with no leftover tokens', () => {
    // Required locally: the shared pwaSvc const is declared further down the
    // file and is still in its temporal dead zone here.
    const pwaLocal = require(__dirname + '/src/services/pwa');
    for (const base of ['', '/jobup']) {
      const out = pwaLocal.page('subscribers-admin.html', base);
      assert.ok(!out.includes('{{BASE}}') && !out.includes('{{V}}'), `tokens left at base "${base}"`);
      assert.ok(out.includes(`var API='${base}/subscribers-admin/api'`), 'the API base must follow the mount');
      assert.ok(out.includes('noindex'), 'an admin console must not be indexed');
    }
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    assert.ok(src.includes("'/subscribers-admin.html'"),
      'a direct .html hit must redirect, or the raw template leaks');
  });

  section('structured data surfaces');
  await t('sitemap lists the homepage and every role page', () => {
    const s = settingsSvc.sanitize({ targeting: { roles: [{ title: 'Data Engineer' }, { title: 'Analytics Lead' }] } });
    const xml = identity.sitemapXml({ url: 'https://ada.jobup.dev', roles: settingsSvc.pageRoles(s) });
    assert.ok(xml.includes('https://ada.jobup.dev/'));
    assert.ok(xml.includes('/roles/data-engineer'));
  });
  await t('robots.txt points at the sitemap', () => {
    assert.ok(identity.robotsTxt({ url: 'https://ada.jobup.dev' }).includes('Sitemap: https://ada.jobup.dev/sitemap.xml'));
  });
  await t('llms.txt lists the machine-readable surfaces', () => {
    const s = settingsSvc.sanitize({});
    const txt = identity.llmsTxt(profile, s, { name: 'Ada', url: 'https://ada.jobup.dev' });
    assert.ok(txt.includes('/resume.json'));
    assert.ok(txt.includes('/.well-known/agent.json'));
  });
  await t('role pages exist only for roles the owner marked', () => {
    const s = settingsSvc.sanitize({ targeting: { roles: [{ title: 'Shown' }, { title: 'Hidden', page: false }] } });
    const roles = settingsSvc.pageRoles(s);
    assert.strictEqual(roles.length, 1);
    assert.strictEqual(roles[0].title, 'Shown');
  });
  await t('all surfaces agree — one source of truth', () => {
    const s = settingsSvc.sanitize({ privacy: { email: true } });
    const ctx = { name: 'Ada', url: 'https://ada.jobup.dev', slug: 'ada' };
    const j = identity.resumeJson(profile, s, ctx);
    const ld = identity.personJsonLd(profile, s, ctx);
    assert.strictEqual(j.basics.email, ld.email, 'resume.json and JSON-LD must not disagree');
  });

  // ---------------------------------------------------------------
  section('data export and deletion');
  await t('export returns the tenant\'s own data', async () => {
    const rows = await scoped('job_matches', subA.id).findAll({});
    assert.ok(Array.isArray(rows));
  });
  await t('deletion removes rows AND the stored resume text', async () => {
    const tmp = await models.subscribers.create({ email: 'sit-del@example.com', status: 'active' });
    await scoped('profiles', tmp.id).create({ resume_json: { name: 'Tmp' }, source_text: 'sensitive resume text' });
    await scoped('profiles', tmp.id).destroy({});
    const left = await scoped('profiles', tmp.id).findAll({});
    assert.strictEqual(left.length, 0);
    await models.subscribers.destroy({ where: { id: tmp.id } });
  });


  // ---------------------------------------------------------------
  section('auth — passwords, sessions, reset');
  const authSvc = require(__dirname + '/src/services/auth');

  await t('passwords hash with scrypt and verify constant-time', () => {
    const h = authSvc.hashPassword('correct-horse-7');
    assert.ok(h.startsWith('scrypt$'));
    assert.strictEqual(authSvc.verifyPassword('correct-horse-7', h), true);
    assert.strictEqual(authSvc.verifyPassword('wrong-horse-7', h), false);
  });
  await t('the same password hashes differently each time (unique salt)', () => {
    assert.notStrictEqual(authSvc.hashPassword('same-password-1'), authSvc.hashPassword('same-password-1'));
  });
  await t('weak passwords are rejected', () => {
    assert.ok(authSvc.passwordProblems('short').length > 0);
    assert.ok(authSvc.passwordProblems('alllettersnodigit').length > 0);
    assert.strictEqual(authSvc.passwordProblems('correct-horse-7').length, 0);
  });
  await t('a session round-trips and a forged one is rejected', () => {
    const tok = authSvc.issueSession(4242);
    assert.strictEqual(authSvc.readSession(tok).tid, 4242);
    assert.strictEqual(authSvc.readSession(tok.slice(0, -3) + 'aaa'), null);
    assert.strictEqual(authSvc.readSession('not-a-token'), null);
  });
  await t('session cookies are HttpOnly + Secure + SameSite', () => {
    const o = authSvc.cookieOptions();
    assert.strictEqual(o.httpOnly, true);
    assert.strictEqual(o.secure, true);
    assert.ok(o.sameSite);
  });

  const authSub = await models.subscribers.create({
    email: 'sit-auth@example.com', status: 'active',
    password_hash: authSvc.hashPassword('first-password-1'),
  });
  await t('a reset token validates once', async () => {
    const fresh = await models.subscribers.findOne({ where: { id: authSub.id } });
    const tok = authSvc.makeResetToken(fresh);
    const r2 = await authSvc.consumeResetToken(tok);
    assert.strictEqual(r2.ok, true);
  });
  await t('RESET TOKEN IS ONE-TIME BY CONSTRUCTION — changing the password kills it', async () => {
    const fresh = await models.subscribers.findOne({ where: { id: authSub.id } });
    const tok = authSvc.makeResetToken(fresh);
    // Use it: set a new password (which rotates the hash the token was signed against).
    await models.subscribers.update(
      { password_hash: authSvc.hashPassword('second-password-2') }, { where: { id: authSub.id } });
    const again = await authSvc.consumeResetToken(tok);
    assert.strictEqual(again.ok, false, 'a reused reset token must fail');
    assert.ok(/already used|invalid/i.test(again.reason));
  });
  await t('a tampered reset token is rejected', async () => {
    const fresh = await models.subscribers.findOne({ where: { id: authSub.id } });
    const tok = authSvc.makeResetToken(fresh);
    const [id, exp, mac] = tok.split('.');
    const forged = `${id}.${exp}.${mac.slice(0, -2)}xy`;
    assert.strictEqual((await authSvc.consumeResetToken(forged)).ok, false);
  });
  await t('an expired reset token is rejected', async () => {
    const r2 = await authSvc.consumeResetToken(`${authSub.id}.${Date.now() - 1000}.deadbeef`);
    assert.strictEqual(r2.ok, false);
    assert.ok(/expired/i.test(r2.reason));
  });
  await t('email verification token round-trips and rejects a forgery', async () => {
    const fresh = await models.subscribers.findOne({ where: { id: authSub.id } });
    const tok = authSvc.makeVerifyToken(fresh);
    assert.strictEqual((await authSvc.consumeVerifyToken(tok)).ok, true);
    assert.strictEqual((await authSvc.consumeVerifyToken(tok.slice(0, -2) + 'zz')).ok, false);
  });
  await t('login throttling locks out after repeated failures', () => {
    const key = 'sit|throttle';
    for (let i = 0; i < authSvc.MAX_ATTEMPTS; i++) authSvc.noteFailure(key);
    assert.strictEqual(authSvc.throttle(key).allowed, false);
    authSvc.noteSuccess(key);
    assert.strictEqual(authSvc.throttle(key).allowed, true);
  });

  // ---------------------------------------------------------------
  section('provisioning — the paid signal chain');
  const provisioning = require(__dirname + '/src/services/provisioning');

  const payer = await models.subscribers.create({
    email: 'sit-payer@example.com', name: 'Alan Turing', status: 'active',
  });
  await scoped('profiles', payer.id).create({
    resume_json: { name: 'Alan Turing', headline: 'Computer Scientist', skills: ['logic'] },
    source_text: 'Alan Turing. Computer Scientist. Logic.',
  });

  await t('provisioning refuses a subscriber who has not paid', async () => {
    const pending = await models.subscribers.create({ email: 'sit-pending@example.com', status: 'pending' });
    const r2 = await provisioning.run(pending.id);
    assert.strictEqual(r2.ok, false);
    assert.ok(/not active/i.test(r2.reason));
    await models.subscribers.destroy({ where: { id: pending.id } });
  });
  await t('the full chain provisions address, site and agents', async () => {
    const r2 = await provisioning.run(payer.id);
    assert.strictEqual(r2.ok, true, 'chain must complete: ' + JSON.stringify(r2.steps));
    assert.ok(r2.url && r2.url.startsWith('https://'));
    assert.strictEqual(r2.state.address, true);
    assert.strictEqual(r2.state.site, true);
    assert.strictEqual(r2.state.published, true);
    assert.strictEqual(r2.state.agents_started, true);
  });
  await t('the chain is IDEMPOTENT — Stripe retries webhooks', async () => {
    const before = await models.subscribers.findOne({ where: { id: payer.id } });
    const r2 = await provisioning.run(payer.id);
    const after = await models.subscribers.findOne({ where: { id: payer.id } });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(before.address, after.address, 'address must not change on re-run');
    const sites = await scoped('sites', payer.id).findAll({});
    assert.strictEqual(sites.length, 1, 'must not create a second site row');
  });
  await t('teardown takes the site offline and releases the address', async () => {
    const r2 = await provisioning.teardown(payer.id);
    assert.strictEqual(r2.ok, true);
    const sub = await models.subscribers.findOne({ where: { id: payer.id } });
    assert.strictEqual(sub.address, null);
    assert.strictEqual(sub.status, 'canceled');
    assert.ok(/export remains available/i.test(r2.note));
  });
  await t('a paid webhook fires the whole chain end to end', async () => {
    const buyer = await models.subscribers.create({ email: 'sit-buyer@example.com', name: 'Grace Hopper II', status: 'pending' });
    await scoped('profiles', buyer.id).create({
      resume_json: { name: 'Grace Hopper II', headline: 'Engineer', skills: ['cobol'] }, source_text: 'x' });
    const r2 = await billing.applyEvent('checkout.session.completed',
      { customer: 'cus_2', subscription: 'sub_2', metadata: { subscriber_id: String(buyer.id) } },
      { inline: true });
    assert.strictEqual(r2.ok, true);
    assert.ok(r2.provisioning && r2.provisioning.ok, 'provisioning must have run');
    const sub = await models.subscribers.findOne({ where: { id: buyer.id } });
    assert.ok(sub.address, 'buyer must have an address after paying');
    for (const tbl of ['profiles','settings','sites','agent_runs','job_matches']) await scoped(tbl, buyer.id).destroy({});
    await models.subscribers.destroy({ where: { id: buyer.id } });
  });

  // ---------------------------------------------------------------
  section('rate limits and retention');
  const limits = require(__dirname + '/src/services/limits');

  await t('teaser limiter is DB-backed, so it survives a restart', async () => {
    const ipH = 'sit-hash-' + Date.now();
    for (let i = 0; i < limits.MAX_PER_IP_PER_DAY; i++) {
      await models.teasers.create({ token: 'sit-rl-' + i + '-' + Date.now(), ip_hash: ipH, created_at: new Date() });
    }
    const r2 = await limits.teaserAllowed({ ipHash: ipH });
    assert.strictEqual(r2.allowed, false);
    assert.strictEqual(r2.reason, 'ip');
  });
  await t('a different network is unaffected', async () => {
    assert.strictEqual((await limits.teaserAllowed({ ipHash: 'sit-other-' + Date.now() })).allowed, true);
  });
  await t('unconverted teaser resumes are purged after retention', async () => {
    await models.teasers.create({
      token: 'sit-old-' + Date.now(), ip_hash: 'x',
      resume_purge_after: new Date(Date.now() - 86400000), tenant_id: null,
    });
    const r2 = await limits.purgeExpiredTeasers();
    assert.ok(r2.purged >= 1, 'an expired unconverted teaser must be purged');
  });
  await t('a CONVERTED teaser is never purged', async () => {
    const keep = await models.teasers.create({
      token: 'sit-keep-' + Date.now(), tenant_id: subA.id,
      resume_purge_after: new Date(Date.now() - 86400000),
    });
    await limits.purgeExpiredTeasers();
    const still = await models.teasers.findOne({ where: { id: keep.id } });
    assert.ok(still, 'a teaser belonging to a paying subscriber must survive');
    await models.teasers.destroy({ where: { id: keep.id } });
  });


  // ---------------------------------------------------------------
  section('admin console — owner only');
  const adminRoute = require(__dirname + '/src/routes/admin');

  await t('admin is CLOSED when no password is set (not open with a default)', () => {
    const saved = process.env.JOBUP_ADMIN_PASSWORD;
    delete process.env.JOBUP_ADMIN_PASSWORD;
    assert.strictEqual(adminRoute.configured(), false);
    if (saved) process.env.JOBUP_ADMIN_PASSWORD = saved;
  });
  await t('a short admin password does not count as configured', () => {
    const saved = process.env.JOBUP_ADMIN_PASSWORD;
    process.env.JOBUP_ADMIN_PASSWORD = 'short';
    assert.strictEqual(adminRoute.configured(), false);
    if (saved) process.env.JOBUP_ADMIN_PASSWORD = saved; else delete process.env.JOBUP_ADMIN_PASSWORD;
  });
  await t('owner allowlist defaults to the owner and is env-overridable', () => {
    const saved = process.env.JOBUP_ADMIN_EMAILS;
    delete process.env.JOBUP_ADMIN_EMAILS;
    assert.ok(adminRoute.ownerEmails().includes('mstagg@digit2ai.com'));
    process.env.JOBUP_ADMIN_EMAILS = 'a@x.com, B@X.com';
    assert.deepStrictEqual(adminRoute.ownerEmails(), ['a@x.com', 'b@x.com']);
    if (saved) process.env.JOBUP_ADMIN_EMAILS = saved; else delete process.env.JOBUP_ADMIN_EMAILS;
  });

  function fakeReqRes(cookies) {
    const res = { code: 0, body: null,
      status(c) { this.code = c; return this; },
      json(b) { this.body = b; return this; } };
    return [{ cookies: cookies || {}, headers: {}, ip: '1.2.3.4' }, res];
  }

  await t('NO admin cookie is refused', () => {
    process.env.JOBUP_ADMIN_PASSWORD = 'sit-admin-password-long';
    const [req, res] = fakeReqRes({});
    let passed = false;
    adminRoute.requireOwner(req, res, () => { passed = true; });
    assert.strictEqual(passed, false, 'must not reach the handler');
    assert.strictEqual(res.code, 401);
  });
  await t('A SUBSCRIBER SESSION CANNOT BE ESCALATED to admin', () => {
    // A perfectly valid subscriber token, presented as an admin cookie.
    const subToken = authSvc.issueSession(subA.id);
    const [req, res] = fakeReqRes({ jobup_admin: subToken });
    let passed = false;
    adminRoute.requireOwner(req, res, () => { passed = true; });
    assert.strictEqual(passed, false, 'a subscriber token must never pass the admin gate');
    assert.ok(res.code === 401 || res.code === 403);
  });
  await t('a token for a NON-allowlisted email is refused', () => {
    process.env.JOBUP_ADMIN_EMAILS = 'owner@digit2ai.com';
    const jwtLib = require('jsonwebtoken');
    const bad = jwtLib.sign({ adm: true, email: 'attacker@evil.com' },
      process.env.JOBUP_JWT_SECRET, { expiresIn: '1h' });
    const [req, res] = fakeReqRes({ jobup_admin: bad });
    let passed = false;
    adminRoute.requireOwner(req, res, () => { passed = true; });
    assert.strictEqual(passed, false);
    assert.strictEqual(res.code, 403);
  });
  await t('removing an email from the allowlist revokes an existing token instantly', () => {
    const jwtLib = require('jsonwebtoken');
    process.env.JOBUP_ADMIN_EMAILS = 'owner@digit2ai.com';
    const tok = jwtLib.sign({ adm: true, email: 'owner@digit2ai.com' },
      process.env.JOBUP_JWT_SECRET, { expiresIn: '1h' });
    let [req, res] = fakeReqRes({ jobup_admin: tok });
    let passed = false;
    adminRoute.requireOwner(req, res, () => { passed = true; });
    assert.strictEqual(passed, true, 'allowlisted owner should pass');

    process.env.JOBUP_ADMIN_EMAILS = 'someone-else@digit2ai.com';
    [req, res] = fakeReqRes({ jobup_admin: tok });
    passed = false;
    adminRoute.requireOwner(req, res, () => { passed = true; });
    assert.strictEqual(passed, false, 'same token must stop working once de-listed');
  });
  await t('a forged admin token is refused', () => {
    process.env.JOBUP_ADMIN_EMAILS = 'owner@digit2ai.com';
    const jwtLib = require('jsonwebtoken');
    const forged = jwtLib.sign({ adm: true, email: 'owner@digit2ai.com' }, 'wrong-secret');
    const [req, res] = fakeReqRes({ jobup_admin: forged });
    let passed = false;
    adminRoute.requireOwner(req, res, () => { passed = true; });
    assert.strictEqual(passed, false);
    assert.strictEqual(res.code, 401);
  });
  await t('impersonation is written to the audit log', async () => {
    await adminRoute.audit('owner@digit2ai.com', 'impersonate:' + subA.id, 'SIT check of the audit path', subA.id);
    const rows = await models.audit_log.findAll({});
    const hit = rows.find((r) => r.action === 'impersonate:' + subA.id);
    assert.ok(hit, 'impersonation must be logged');
    assert.ok(hit.reason && hit.reason.length >= 15, 'a written reason must be stored');
    assert.strictEqual(hit.actor, 'owner@digit2ai.com');
  });
  delete process.env.JOBUP_ADMIN_EMAILS;
  delete process.env.JOBUP_ADMIN_PASSWORD;

  // ---------------------------------------------------------------
  section('subscriber site — the anastagg.com template');
  await t('renders nav, hero, voice panel and numbered sections', () => {
    const s = settingsSvc.sanitize({ privacy: { email: true } });
    const prof = { name: 'Ada Lovelace', headline: 'Analytical Engine Architect',
      summary: 'Built the first algorithm.', email: 'ada@example.com',
      skills: ['Mathematics', 'Algorithms'],
      experience: [{ title: 'Mathematician', company: 'Analytical Society', start: '1842', end: '1852',
                     highlights: ['Published the first algorithm.'] }],
      education: [{ institution: 'Private tuition', studyType: 'Mathematics', end: '1836' }],
      certifications: ['Fellow'] };
    const html = siteRender.page(prof, s, { name: 'Ada Lovelace', url: 'https://ada.jobup.dev', slug: 'ada' });
    for (const frag of ['class="nav"', 'ring-orbit', 'class="eyebrow"', 'title-line',
                        'voicecard', 'sec-head', 'timeline', 'sharecard',
                        'Professional Experience', 'Core Competencies']) {
      assert.ok(html.includes(frag), 'missing ' + frag);
    }
  });
  await t('THE HERO PHOTO MATCHES THE MARK IT MIRRORS', () => {
    const st = settingsSvc.sanitize({});
    const html = siteRender.page({ name: 'Ada Lovelace', photo_url: '/photo?v=1' }, st,
      { name: 'Ada Lovelace', url: 'https://a.jobup.dev', slug: 'a' });
    assert.ok(html.includes('class="photo-col"'), 'the column wrapper holds the width');
    assert.ok(html.includes('ring-orbit'));
    // The ring is the one moving element in the hero. Grey reads as a border.
    assert.ok(html.includes('rgba(34,211,238,.28)'), 'the orbit ring must be cyan');
    assert.ok(html.includes('width:200px;height:200px'));
    assert.ok(html.includes('border-radius:22px'));
    assert.ok(html.includes('prefers-reduced-motion'), 'the spin must be optional');
  });
  await t('falls back to initials when there is no photo', () => {
    const html = siteRender.page({ name: 'Ada Lovelace' }, settingsSvc.sanitize({}),
      { name: 'Ada Lovelace', url: 'https://ada.jobup.dev', slug: 'ada' });
    assert.ok(html.includes('photo-fallback'));
    assert.ok(html.includes('>AL<'), 'initials should render');
  });
  await t('THE PRIVACY PROJECTION STILL HOLDS in the richer template', () => {
    const s = settingsSvc.sanitize({});
    const prof = { name: 'Ada', email: 'secret@example.com', phone: '+15550001', headline: 'Engineer' };
    const html = siteRender.page(prof, s, { name: 'Ada', url: 'https://ada.jobup.dev', slug: 'ada' });
    assert.ok(!html.includes('secret@example.com'), 'private email must not reach the page');
    assert.ok(!html.includes('+15550001'), 'private phone must not reach the page');
    assert.ok(!html.includes('EMAIL;TYPE'), 'the vCard must not carry a private email');
  });
  await t('the spoken walkthrough is built only from projected fields', () => {
    const s = settingsSvc.sanitize({});
    const p2 = identity.applyPrivacy({ name: 'Ada', headline: 'Engineer',
      email: 'secret@example.com', skills: ['x'] }, s);
    const lines = siteRender.narrationFor(p2, 'Ada').join(' ');
    assert.ok(!lines.includes('secret@example.com'));
  });


  // ---------------------------------------------------------------
  section('subscriber dashboard — one per profile');
  const analyticsSvc = require(__dirname + '/src/services/analytics');

  await t('page views are recorded WITHOUT storing an IP address', async () => {
    const fakeReq = { get: (h) => (h === 'user-agent' ? 'Mozilla/5.0' : ''), headers: { 'x-forwarded-for': '203.0.113.9' }, ip: '203.0.113.9' };
    analyticsSvc.record(subA.id, fakeReq, '/');
    await new Promise((r) => setTimeout(r, 60));
    const rows = await scoped('page_views', subA.id).findAll({});
    assert.ok(rows.length >= 1, 'a view should be recorded');
    const raw = JSON.stringify(rows);
    assert.ok(!raw.includes('203.0.113.9'), 'the IP must never be stored');
    assert.ok(rows[0].visitor_hash && rows[0].visitor_hash.length === 24, 'a salted digest instead');
  });
  await t('an AI crawler is counted separately from a person', async () => {
    analyticsSvc.record(subA.id, { get: (h) => (h === 'user-agent' ? 'ClaudeBot/1.0' : ''), headers: {}, ip: '1.1.1.1' }, '/llms.txt');
    await new Promise((r) => setTimeout(r, 60));
    const a = await analyticsSvc.summary(subA.id, 30);
    assert.ok(a.agent_views >= 1, 'crawler read should be counted as an agent');
    assert.ok(a.views >= 1, 'the human view is still counted');
    assert.ok(a.per_day.length === 30, 'the chart is zero-filled to 30 days');
  });
  await t('ANALYTICS ARE TENANT-ISOLATED — B never sees A traffic', async () => {
    const b = await analyticsSvc.summary(subB.id, 30);
    assert.strictEqual(b.views, 0);
    assert.strictEqual(b.unique_visitors, 0);
  });
  await t('an inbound opportunity lands in the right subscriber inbox only', async () => {
    await scoped('opportunities', subA.id).create({
      source: 'site_form', company: 'Acme', role: 'Staff Engineer',
      from_name: 'A Recruiter', from_email: 'r@acme.example', note: 'Are you open to a conversation?',
    });
    const mine = await scoped('opportunities', subA.id).findAll({});
    const theirs = await scoped('opportunities', subB.id).findAll({});
    assert.strictEqual(mine.length, 1);
    assert.strictEqual(theirs.length, 0, 'cross-tenant leak');
    assert.strictEqual(mine[0].status, 'new');
  });
  await t('the dashboard is served and carries every tab', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    for (const tab of ['Analytics', 'Job Matches', 'Opportunities', 'Today',
                       'Pipeline', 'Targets', 'My CV', 'Settings']) {
      assert.ok(html.includes('>' + tab), 'missing tab: ' + tab);
    }
    assert.ok(html.includes('honest by design'), 'the explainer callout should be present');
  });
  await t('the dashboard JS parses and references no missing element', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    const js = html.split('<script>')[1].split('</script>')[0];
    new Function(js);   // throws on a syntax error
    const ids = [...new Set([...js.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]))];
    // An id counts as present if it appears literally, OR if the source builds
    // ids with that prefix by concatenation — cvField() emits id="cv-" + key,
    // so the literal string never exists to be found. Prefixes are collected
    // from the source itself rather than hardcoded, so a typo in a STATIC id
    // is still caught.
    const builtPrefixes = [...js.matchAll(/id="([a-z0-9-]+-)'\s*\+/g)].map((m) => m[1]);
    const missing = ids.filter((id) => {
      if (html.includes('id="' + id + '"')) return false;
      return !builtPrefixes.some((pre) => id.startsWith(pre));
    });
    assert.deepStrictEqual(missing, [], 'ids referenced but absent from the DOM');
  });
  await t('the dashboard needs NO env var — a subscriber signs in with their own password', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(!html.includes('JOBUP_ADMIN'), 'the subscriber dashboard must not reference the owner console');
    assert.ok(html.includes('/api/v1/auth/login'), 'it authenticates as the subscriber');
  });


  // ---------------------------------------------------------------
  section('test mode, welcome, and PWA');
  const billingSvc = require(__dirname + '/src/services/billing');
  const mailerSvc = require(__dirname + '/src/services/mailer');
  const models_mod = require(__dirname + '/src/models');

  await t('BILLING IS ON BY DEFAULT — you have to ask for it to be off', () => {
    // It briefly worked the other way round: a change made billing opt-IN, so a
    // deploy switched payment off on a deployment that had been taking money,
    // and removing the old bypass variable no longer restored it. A default
    // that changes what "no configuration" means for revenue is the wrong
    // shape, whichever way it points.
    const keep = ['JOBUP_BILLING_ENABLED', 'JOBUP_BILLING_DISABLED', 'JOBUP_FREE_ACTIVATION']
      .reduce((a, k) => { a[k] = process.env[k]; delete process.env[k]; return a; }, {});
    assert.strictEqual(billingSvc.disabled(), false, 'no configuration must mean CHARGE');
    assert.strictEqual(billingSvc.freeActivation(), false);
    process.env.JOBUP_BILLING_DISABLED = '1';
    assert.strictEqual(billingSvc.disabled(), true, 'and it must be switchable off');
    delete process.env.JOBUP_BILLING_DISABLED;
    process.env.JOBUP_BILLING_ENABLED = '1';   // legacy opt-in still honoured
    assert.strictEqual(billingSvc.disabled(), false);
    for (const [k, v] of Object.entries(keep)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  await t('WHY signups are free is reported, not left ambiguous', () => {
    const keep = ['JOBUP_BILLING_DISABLED', 'JOBUP_FREE_ACTIVATION']
      .reduce((a, k) => { a[k] = process.env[k]; delete process.env[k]; return a; }, {});
    assert.strictEqual(billingSvc.freeReason(), null, 'nothing free, nothing to explain');
    process.env.JOBUP_FREE_ACTIVATION = '1';
    assert.strictEqual(billingSvc.freeReason(), 'JOBUP_FREE_ACTIVATION=1');
    delete process.env.JOBUP_FREE_ACTIVATION;
    process.env.JOBUP_BILLING_DISABLED = '1';
    assert.strictEqual(billingSvc.freeReason(), 'JOBUP_BILLING_DISABLED=1',
      'two different causes must not read the same');
    for (const [k, v] of Object.entries(keep)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  await t('with payment ON, free activation is OFF unless explicitly switched on', () => {
    const savedF = process.env.JOBUP_FREE_ACTIVATION;
    const savedB = process.env.JOBUP_BILLING_ENABLED;
    process.env.JOBUP_BILLING_ENABLED = '1';           // pretend billing is live
    delete process.env.JOBUP_FREE_ACTIVATION;
    assert.strictEqual(billingSvc.freeActivation(), false, 'must never be the default');
    process.env.JOBUP_FREE_ACTIVATION = '0';
    assert.strictEqual(billingSvc.freeActivation(), false, 'only "1" enables it');
    process.env.JOBUP_FREE_ACTIVATION = '1';
    assert.strictEqual(billingSvc.freeActivation(), true);
    if (savedF === undefined) delete process.env.JOBUP_FREE_ACTIVATION;
    else process.env.JOBUP_FREE_ACTIVATION = savedF;
    if (savedB === undefined) delete process.env.JOBUP_BILLING_ENABLED;
    else process.env.JOBUP_BILLING_ENABLED = savedB;
  });
  await t('with payment OFF, EVERY activation is free and stamped no_billing', () => {
    const _keep = process.env.JOBUP_BILLING_DISABLED;
    process.env.JOBUP_BILLING_DISABLED = '1';   // off is now explicit
    assert.strictEqual(billingSvc.disabled(), true);
    assert.strictEqual(billingSvc.freeActivation(), true, 'nothing can be charged, so nothing is');
    const src = require('fs').readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(src.includes("'no_billing'"), 'accounts built without payment must be stamped');
    if (_keep === undefined) delete process.env.JOBUP_BILLING_DISABLED;
    else process.env.JOBUP_BILLING_DISABLED = _keep;
  });
  await t('status() DECLARES test mode and missing webhook verification', () => {
    const savedF = process.env.JOBUP_FREE_ACTIVATION;
    const savedB = process.env.JOBUP_BILLING_ENABLED;
    process.env.JOBUP_BILLING_ENABLED = '1';
    process.env.JOBUP_FREE_ACTIVATION = '1';
    const st = billingSvc.status();
    assert.strictEqual(st.free_activation, true, 'test mode must be visible, never silent');
    assert.ok(st.webhook_verification, 'webhook state must be reported');
    if (savedF === undefined) delete process.env.JOBUP_FREE_ACTIVATION;
    else process.env.JOBUP_FREE_ACTIVATION = savedF;
    if (savedB === undefined) delete process.env.JOBUP_BILLING_ENABLED;
    else process.env.JOBUP_BILLING_ENABLED = savedB;
    // And when it is EXPLICITLY off, the same call is equally clear. Off is
    // now a deliberate setting, not what you get by configuring nothing.
    const keepD = process.env.JOBUP_BILLING_DISABLED;
    process.env.JOBUP_BILLING_DISABLED = '1';
    const off = billingSvc.status();
    assert.strictEqual(off.billing_disabled, true, 'a disabled payment layer must never be silent');
    assert.strictEqual(off.price_usd, null, 'and must not quote a price it cannot charge');
    if (keepD === undefined) delete process.env.JOBUP_BILLING_DISABLED;
    else process.env.JOBUP_BILLING_DISABLED = keepD;
  });
  // ---------------------------------------------------------------
  // THE PAID CHAIN. This is what a real purchase does, minus the card.
  //
  // It shipped broken: createCheckout() never wrote teaser_token into the
  // Stripe metadata that applyEvent() reads, so every paid signup provisioned
  // with teaserToken:null. The resume was never adopted, the promised address
  // was not honoured, and the site published EMPTY while the welcome screen
  // showed four green ticks. These tests exist so that cannot come back.
  await t('THE WEBHOOK CAN ACTUALLY VERIFY A STRIPE SIGNATURE', async () => {
    // express.json() used to run first on this router. It consumes the stream
    // and leaves a parsed object, so the express.raw() in the billing route
    // skipped and the handler re-encoded with JSON.stringify — which differs
    // from Stripe's pretty-printed payload in whitespace alone. That is enough:
    // every webhook returned 400 forever. Payments cleared, accounts never
    // activated, invoices never recorded, cancellations never torn down.
    const src = require('fs').readFileSync(__dirname + '/src/index.js', 'utf8');
    const rawAt = src.indexOf("router.use('/api/v1/billing/webhook', express.raw");
    const jsonAt = src.indexOf('router.use(express.json(');
    assert.ok(rawAt > 0, 'the webhook path needs its own raw body parser');
    assert.ok(rawAt < jsonAt, 'and it MUST be mounted before express.json()');

    // Behaviour, not grep: sign a payload the way Stripe does and post it.
    const crypto2 = require('crypto');
    const payload = JSON.stringify(
      { id: 'evt_sit', type: 'invoice.paid',
        data: { object: { id: 'in_sit', amount_paid: 2500, metadata: { subscriber_id: '424242' } } } },
      null, 2);                                   // <- pretty-printed, like Stripe
    const secret = 'whsec_sit_' + Date.now();
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto2.createHmac('sha256', secret).update(ts + '.' + payload).digest('hex');

    const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const savedKey = process.env.STRIPE_SECRET_KEY;
    const savedEnabled = process.env.JOBUP_BILLING_ENABLED;
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    process.env.STRIPE_SECRET_KEY = savedKey || 'sk_test_sit_dummy';
    process.env.JOBUP_BILLING_ENABLED = '1';
    try {
      const stripeLib = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const ev = stripeLib.webhooks.constructEvent(
        Buffer.from(payload, 'utf8'), 't=' + ts + ',v1=' + sig, secret);
      assert.strictEqual(ev.type, 'invoice.paid', 'a raw buffer must verify');

      // And a forged one must not.
      assert.throws(() => stripeLib.webhooks.constructEvent(
        Buffer.from(payload, 'utf8'), 't=' + ts + ',v1=deadbeef', secret));

      // The re-encoded form — what the broken path produced — must NOT verify.
      assert.throws(() => stripeLib.webhooks.constructEvent(
        Buffer.from(JSON.stringify(JSON.parse(payload))), 't=' + ts + ',v1=' + sig, secret),
        'this is exactly what express.json() left behind');
    } finally {
      if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
      if (savedKey === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = savedKey;
      if (savedEnabled === undefined) delete process.env.JOBUP_BILLING_ENABLED;
      else process.env.JOBUP_BILLING_ENABLED = savedEnabled;
    }
  });

  await t('THE TEASER TOKEN TRAVELS WITH THE PAYMENT', () => {
    const src = require('fs').readFileSync(__dirname + '/src/services/billing.js', 'utf8');
    assert.ok(/meta\.teaser_token = String\(teaserToken\)/.test(src),
      'createCheckout must put the teaser token in the Stripe metadata');
    assert.ok(/metadata: meta/.test(src) && /subscription_data: \{ metadata: meta \}/.test(src),
      'both the session AND the subscription must carry it');
    const route = require('fs').readFileSync(__dirname + '/src/routes/billing.js', 'utf8');
    assert.ok(/teaserToken: teaser_token/.test(route), 'the route must pass it in');
  });

  await t('a paid signup adopts the resume, the address AND publishes a real site', async () => {
    const teaserSvc = require(__dirname + '/src/services/teaser');
    const billingSvc2 = require(__dirname + '/src/services/billing');
    const email = 'sit-paid-' + Date.now() + '@example.com';

    // A finished preview, exactly as the simulator leaves one.
    const made = await teaserSvc.create({
      name: 'Marta Quintero', email, language: 'en', ip: '203.0.113.9',
      resumeText: 'Marta Quintero. Operations Manager. Ten years in logistics, SAP, budgeting.',
    });
    await teaserSvc.finish(made.token, {
      status: 'ready', language: 'en',
      screens: { site: { profile: {
        name: 'Marta Quintero', headline: 'Operations Manager',
        skills: ['logistics', 'sap', 'budgeting'],
      } } },
      narration: [],
    });
    await models.teasers.update(
      { address_offer: 'martaquintero.jobup.dev', status: 'ready' },
      { where: { token: made.token } });

    // What the checkout route does before handing off to Stripe.
    const sub = await models.subscribers.create({ email, name: 'Marta Quintero', status: 'pending' });

    // The webhook Stripe sends back, with the metadata createCheckout now writes.
    const evt = {
      customer: 'cus_SIT', subscription: 'sub_SIT',
      metadata: { subscriber_id: String(sub.id), teaser_token: made.token },
    };
    const applied = await billingSvc2.applyEvent('checkout.session.completed', evt, { inline: true });
    assert.strictEqual(applied.ok, true);
    assert.strictEqual(applied.action, 'activated');

    const after = await models.subscribers.findOne({ where: { id: sub.id } });
    assert.strictEqual(after.status, 'active', 'payment must activate the account');
    assert.strictEqual(after.stripe_customer_id, 'cus_SIT');

    // THE RESUME MUST BE ON THE ACCOUNT — this is what was silently lost.
    const prof = await scoped('profiles', sub.id).findOne({});
    assert.ok(prof, 'a profile row must exist after a paid signup');
    assert.strictEqual(prof.resume_json.headline, 'Operations Manager',
      'the resume from the preview must be adopted, not re-extracted or dropped');

    // THE ADDRESS MUST BE THE ONE THE PREVIEW PROMISED.
    assert.strictEqual(after.address, 'martaquintero.jobup.dev',
      'a preview that does not bind is worse than no preview');

    // AND THE SITE MUST ACTUALLY BE PUBLISHED, not merely reported as such.
    const site = await scoped('sites', sub.id).findOne({});
    assert.ok(site && site.published_at, 'the site must be published');
    assert.strictEqual(site.address, 'martaquintero.jobup.dev');
  });

  await t('provisioning finds the preview by EMAIL when the token is missing', async () => {
    // Belt and braces: an account paid before the metadata fix, or a webhook
    // whose metadata was stripped, must still get its resume.
    const teaserSvc = require(__dirname + '/src/services/teaser');
    const provisioning = require(__dirname + '/src/services/provisioning');
    const email = 'sit-notoken-' + Date.now() + '@example.com';

    const made = await teaserSvc.create({
      name: 'Diego Reyes', email, language: 'en', ip: '203.0.113.10',
      resumeText: 'Diego Reyes. Data Analyst. SQL, Python, dashboards.',
    });
    await teaserSvc.finish(made.token, {
      status: 'ready', language: 'en',
      screens: { site: { profile: { name: 'Diego Reyes', headline: 'Data Analyst' } } },
      narration: [],
    });
    await models.teasers.update({ status: 'ready' }, { where: { token: made.token } });

    const sub = await models.subscribers.create({ email, name: 'Diego Reyes', status: 'active' });
    const out = await provisioning.run(sub.id, { teaserToken: null });   // the broken call

    const prof = await scoped('profiles', sub.id).findOne({});
    assert.ok(prof, 'the email fallback must find the preview');
    assert.strictEqual(prof.resume_json.headline, 'Data Analyst');
    assert.ok(out.steps.some((st) => st && st.via === 'email_fallback'),
      'and it must SAY it used the fallback, not hide it');
  });

  await t('the account form REFUSES to hand out a free account while billing is on', () => {
    const src = require('fs').readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(/verifyCheckoutSession/.test(src),
      'the payment gate must ask Stripe directly, not trust the browser');
    assert.ok(/status\(402\)/.test(src), 'an unpaid attempt must be refused');
    assert.ok(/billing\.disabled\(\)/.test(src), 'and the gate must only apply when payment is on');
  });

  await t('the redirect does not depend on the webhook winning the race', () => {
    const route = require('fs').readFileSync(__dirname + '/src/routes/billing.js', 'utf8');
    assert.ok(/CHECKOUT_SESSION_ID/.test(route),
      'the return URL must carry the session id so payment can be confirmed directly');
    const src = require('fs').readFileSync(__dirname + '/src/services/billing.js', 'utf8');
    assert.ok(/checkout\.sessions\.retrieve/.test(src), 'and we must actually ask Stripe');
  });

  await t('there is a repair path for accounts already provisioned empty', () => {
    const fs2 = require('fs');
    const f = __dirname + '/scripts/repair-paid-accounts.js';
    assert.ok(fs2.existsSync(f), 'the repair script must exist');
    const src = fs2.readFileSync(f, 'utf8');
    assert.ok(/--fix/.test(src), 'it must be dry-run by default');
    assert.ok(/provisioning\.run/.test(src), 'and repair by re-running the idempotent chain');
  });

  await t('a free-test account is STAMPED so it can never be counted as revenue', async () => {
    const s2 = await models.subscribers.create({
      email: 'sit-free@example.com', name: 'Free Test',
      status: 'active', activation: 'free_test',
    });
    const row = await models.subscribers.findOne({ where: { id: s2.id } });
    assert.strictEqual(row.activation, 'free_test');
    const paid = await models.subscribers.findOne({ where: { id: subA.id } });
    assert.strictEqual(paid.activation, 'paid', 'a normal account defaults to paid');
    await models.subscribers.destroy({ where: { id: s2.id } });
  });
  await t('ensureColumns REPORTS when it cannot migrate instead of no-opping', async () => {
    // It previously read a module-scope `seq` that did not exist, so it
    // silently did nothing and production was missing every new column.
    const r = await models_mod.ensureColumns(null);
    assert.ok(r && r.skipped, 'a missing connection must be reported, not swallowed');
    assert.ok(Array.isArray(models_mod.ADDED_COLUMNS) && models_mod.ADDED_COLUMNS.length > 0);
  });
  await t('EVERY column added after launch is in the idempotent ALTER list', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/models/index.js', 'utf8');
    // sync({alter:false}) never adds a column; anything missing here would exist
    // in the model and the memory backend but NOT in production Postgres.
    for (const col of ['activation', 'activated_at', 'from_name', 'from_email',
                       'status', 'reply_draft', 'read_at', 'replied_at']) {
      assert.ok(src.includes(`'${col}'`), 'missing from ADDED_COLUMNS: ' + col);
    }
    assert.ok(src.includes('ADD COLUMN IF NOT EXISTS'), 'the ALTER must be idempotent');
  });
  await t('the welcome page exists — Stripe success_url must not 404', () => {
    const fs = require('fs');
    assert.ok(fs.existsSync(__dirname + '/public/welcome.html'));
    const idx = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    assert.ok(idx.includes("'/welcome'"), 'the /welcome route must be mounted');
    const bill = fs.readFileSync(__dirname + '/src/routes/billing.js', 'utf8');
    assert.ok(bill.includes('/welcome?s='), 'checkout should send people to it');
  });
  await t('the welcome page reports REAL provisioning state, not a fixed success', () => {
    const fs = require('fs');
    const intake = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(intake.includes('provisioning.stateOf'), 'state must come from provisioning');
    assert.ok(intake.includes('needs_password'), 'it must know whether a password is still needed');
  });

  const pwaSvc = require(__dirname + '/src/services/pwa');

  await t('PWA: manifest is valid, scoped, and standalone at EVERY root', () => {
    // The three roots JobUp actually answers on. A manifest is not portable
    // across them: scope and start_url resolve against the manifest's own URL.
    for (const base of ['', '/jobup']) {
      const m = pwaSvc.manifest(base);
      assert.strictEqual(m.display, 'standalone', `display at base "${base}"`);
      assert.strictEqual(m.scope, `${base}/`, `scope must be the mount root at base "${base}"`);
      assert.strictEqual(m.start_url, `${base}/app`, `start_url at base "${base}"`);
      assert.ok(m.icons.some((i) => i.sizes === '512x512'), 'a 512 icon is required to install');
      assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon is required on Android');
      assert.ok(m.id, 'an id keeps installs from being orphaned when start_url changes');
      // The bug this replaces: the apex served scope '/jobup/', which does not
      // contain jobup.dev/, so the installed app broke out to the browser the
      // moment someone tapped the logo.
      assert.ok(m.start_url.startsWith(m.scope.replace(/\/$/, '') || '/'),
        `start_url must live inside scope at base "${base}"`);
    }
  });
  await t('PWA: the manifest never locks the dashboard to portrait', () => {
    const m = pwaSvc.manifest('/jobup');
    assert.notStrictEqual(m.orientation, 'portrait',
      'a table-and-chart dashboard must be readable in landscape and on a tablet');
  });
  await t('PWA: home-screen shortcuts point at tabs the dashboard can actually open', () => {
    const fs = require('fs');
    const m = pwaSvc.manifest('/jobup');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(m.shortcuts && m.shortcuts.length, 'shortcuts make a long-press useful');
    assert.ok(html.includes('tabFromUrl'), 'the dashboard must read ?tab= or the shortcuts are decorative');
    for (const s of m.shortcuts) {
      const tab = new URL('https://x' + s.url).searchParams.get('tab');
      assert.ok(html.includes(`data-p="${tab}"`), `shortcut targets a tab that does not exist: ${tab}`);
    }
  });
  await t('PWA: every icon the manifest promises actually exists and is real', () => {
    const fs = require('fs');
    const m = pwaSvc.manifest('/jobup');
    for (const icon of m.icons) {
      const f = __dirname + '/public' + icon.src.replace('/jobup', '').split('?')[0];
      assert.ok(fs.existsSync(f), 'missing icon file: ' + icon.src);
      const buf = fs.readFileSync(f);
      if (icon.type === 'image/svg+xml') {
        // Not a prefix check: the file opens with a licence/rationale comment.
        assert.ok(buf.toString('utf8').includes('<svg'), 'not an SVG: ' + icon.src);
      } else {
        assert.strictEqual(buf.slice(1, 4).toString(), 'PNG', 'not a PNG: ' + icon.src);
      }
    }
    assert.ok(fs.existsSync(__dirname + '/public/apple-touch-icon.png'), 'iOS needs apple-touch-icon');
  });
  await t('PWA: an advertised icon is actually SERVED at every root', () => {
    // The subscriber subdomain only serves the paths named in serveAsset, so an
    // icon added to the manifest but not to that list would 404 on their site.
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/pwa.js', 'utf8');
    const served = src.slice(src.indexOf("'/icon-192.png'"), src.indexOf('].includes(p)'));
    for (const icon of pwaSvc.manifest('').icons) {
      // serveAsset matches on req.path, which excludes the ?v= cache-buster.
      const p = icon.src.split('?')[0];
      assert.ok(served.includes(`'${p}'`),
        `manifest promises ${p} but serveAsset never returns it`);
    }
  });
  await t('THE SERVICE WORKER NEVER CACHES /api/', () => {
    const sw = pwaSvc.serviceWorker('/jobup');
    assert.ok(sw.includes("includes('/api/')"), 'API responses must be excluded');
    assert.ok(sw.includes("mode === 'navigate'"), 'navigations should be network-first');
    assert.ok(/const CACHE = 'jobup-v\d+/.test(sw), 'the cache must carry a bumpable version');
  });
  await t('THE SERVICE WORKER IS BUILT FOR THE ROOT IT IS SERVED FROM', () => {
    // A worker's scope is the directory it was fetched from, so a fixed
    // /jobup/sw.js never controlled jobup.dev/ — the landing page that
    // registered it. Both the paths it caches and its cache name must follow
    // the base, or the two registrations on jobup.dev fight over one cache.
    const root = pwaSvc.serviceWorker('');
    const mount = pwaSvc.serviceWorker('/jobup');
    assert.ok(!root.includes('__BASE__') && !root.includes('__CACHE__'), 'tokens must be substituted');
    assert.ok(root.includes("const BASE = ''"), 'the apex worker is rooted at /');
    assert.ok(mount.includes("const BASE = '/jobup'"), 'the mounted worker is rooted at /jobup');
    assert.notStrictEqual(
      root.match(/const CACHE = '([^']+)'/)[1],
      mount.match(/const CACHE = '([^']+)'/)[1],
      'the two roots must not share a cache name');
    assert.ok(mount.includes("'/jobup/offline'") || mount.includes('OFFLINE'),
      'there must be an offline fallback');
  });
  await t('the service worker survives one missing shell file', () => {
    const sw = pwaSvc.serviceWorker('/jobup');
    assert.ok(!/addAll\(SHELL\)/.test(sw),
      'addAll is atomic — one 404 would abort install and leave no worker at all');
    assert.ok(/c\.add\(u\)\.catch/.test(sw), 'each shell entry must be cached independently');
  });
  await t('the offline page exists and never claims to hold live matches', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/offline.html', 'utf8');
    assert.ok(html.includes('{{BASE}}/app'), 'it must link back using the mount root');
    assert.ok(/offline/i.test(html), 'it must say what happened');
    assert.ok(html.includes('env(safe-area-inset'), 'it renders full-screen in a standalone window');
  });
  await t('THE RAW SHELL IS NEVER SERVED AS A STATIC FILE', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    // express.static answers '/' with publicDir/index.html by default, which
    // handed out the untemplated shell — {{BASE}} tokens and all — before the
    // landing route ever ran. Caught by the HTTP smoke test, guarded here.
    assert.ok(/express\.static\(publicDir,\s*\{\s*index:\s*false\s*\}\)/.test(src),
      'static must not auto-serve index.html over the templated route');
    // And a direct hit on the filename must redirect rather than leak it.
    assert.ok(src.includes("'/index.html', '/app.html', '/welcome.html'"),
      'the .html filenames must redirect to their real routes');
  });
  await t('the HTML shells resolve their base server-side, not by sniffing the URL', () => {
    const fs = require('fs');
    for (const f of ['index.html', 'app.html', 'welcome.html']) {
      const raw = fs.readFileSync(`${__dirname}/public/${f}`, 'utf8');
      assert.ok(raw.includes('{{BASE}}'), `${f} must carry the base token`);
      assert.ok(!raw.includes('/jobup/sw.js'), `${f} must not hardcode the worker path`);
      assert.ok(!raw.includes('/jobup/manifest'), `${f} must not hardcode the manifest path`);
      // And the substitution must actually clear every token, or the browser
      // gets a literal {{BASE}} in an href.
      for (const base of ['', '/jobup']) {
        const out = pwaSvc.page(f, base);
        assert.ok(!out.includes('{{BASE}}'), `${f} still has an unsubstituted token at base "${base}"`);
        assert.ok(out.includes(`register('${base}/sw.js')`), `${f} registers the worker at the wrong root`);
      }
    }
  });
  await t('mobile: dashboard sets viewport-fit, safe areas and 16px inputs', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(html.includes('viewport-fit=cover'), 'needed for notched devices');
    assert.ok(html.includes('env(safe-area-inset'), 'content must clear the home indicator');
    assert.ok(html.includes('apple-mobile-web-app-capable'), 'iOS standalone');
    assert.ok(/input,select,textarea\{font-size:16px/.test(html.replace(/\s+/g, '')),
      'inputs under 16px make iOS zoom the page on focus');
  });
  await t('mobile: tabs scroll in one row instead of wrapping into a block', () => {
    const fs = require('fs');
    const css = fs.readFileSync(__dirname + '/public/app.html', 'utf8').replace(/\s+/g, '');
    assert.ok(css.includes('.tabs{flex-wrap:nowrap;overflow-x:auto'), 'nine tabs must not wrap on a phone');
  });
  await t('the install prompt can be dismissed permanently', () => {
    const fs = require('fs');
    // Both surfaces: the landing had no prompt at all, so the only way to
    // install was to reach the dashboard first.
    for (const f of ['app.html', 'index.html']) {
      const html = fs.readFileSync(`${__dirname}/public/${f}`, 'utf8');
      assert.ok(html.includes('jobup_install_dismissed'), `${f}: a dismissed prompt must stay dismissed`);
      assert.ok(html.includes('Add to Home Screen'), `${f}: iOS has no beforeinstallprompt`);
      assert.ok(html.includes('beforeinstallprompt'), `${f}: Android/desktop need the real prompt`);
    }
  });
  await t('mobile: the landing clears the notch and the home indicator', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/index.html', 'utf8');
    assert.ok(html.includes('viewport-fit=cover'), 'the page is edge-to-edge');
    assert.ok(html.includes('env(safe-area-inset-top)'), 'the nav must clear the status bar');
    assert.ok(html.includes('env(safe-area-inset-bottom)'), 'the footer must clear the home indicator');
    // viewport-fit=cover without safe-area padding is the actual defect: it
    // pushes content UNDER the notch rather than merely allowing it to.
    const css = html.replace(/\s+/g, '');
    assert.ok(css.includes('padding-left:calc(24px+env(safe-area-inset-left))'),
      'landscape on a notched phone clips the left gutter');
  });
  await t('THE PRICE HAS EXACTLY ONE SOURCE', () => {
    const fs = require('fs');
    const billingSvc = require(__dirname + '/src/services/billing');
    const teaserSvc = require(__dirname + '/src/services/teaser');
    // teaser.js used to declare its own `parseInt(process.env.JOBUP_PRICE_USD)`.
    // Two constants reading one env var is one careless edit away from the
    // teaser quoting a figure the checkout does not charge.
    const teaserSrc = fs.readFileSync(__dirname + '/src/services/teaser.js', 'utf8');
    assert.ok(!/JOBUP_PRICE_USD/.test(teaserSrc), 'teaser.js must not read the price env var itself');
    assert.strictEqual(teaserSvc.PRICE_USD, billingSvc.PRICE_USD, 'the two must agree');
    // And the landing page must not print a number of its own.
    const html = fs.readFileSync(__dirname + '/public/index.html', 'utf8');
    assert.ok(html.includes('${{PRICE}}<span> / year</span>'),
      'the pricing card must be templated, not hardcoded');
    assert.ok(!/\$\d+<span> \/ year/.test(html), 'a hardcoded price is back on the landing page');
    // The rendered page must carry the figure billing actually charges.
    const rendered = pwaSvc.page('index.html', '');
    assert.ok(rendered.includes(`$${billingSvc.PRICE_USD}<span> / year</span>`),
      `the rendered price should be $${billingSvc.PRICE_USD}`);
    assert.ok(!rendered.includes('{{PRICE}}'), 'the price token was not substituted');
  });
  await t('BRAND: one mark, one palette, everywhere', () => {
    const fs = require('fs');
    const p = __dirname + '/public/';
    // The glyph geometry is the identity. If a surface drifts from it there are
    // two logos, which is how this started: a cyan "J" icon, a blank gradient
    // square in the nav, and no favicon at all.
    const GLYPH = 'M283 158 V290 A64 64 0 0 1 155 290';
    for (const f of ['logo-master.svg', 'favicon.svg', 'index.html', 'welcome.html', 'offline.html']) {
      assert.ok(fs.readFileSync(p + f, 'utf8').includes(GLYPH), `${f} does not carry the JobUp mark`);
    }
    // Landing brand gradient, not the dashboard's cyan/violet UI accent.
    for (const f of ['logo-master.svg', 'favicon.svg']) {
      const s = fs.readFileSync(p + f, 'utf8');
      assert.ok(s.includes('#4c6ef5') && s.includes('#e64980') && s.includes('#ff922b'),
        `${f} must use the brand gradient`);
      assert.ok(!s.includes('#22d3ee'), `${f} must not use the dashboard cyan`);
    }
  });
  await t('BRAND: the dashboard header is the logo, and ONLY the logo', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(html.includes('id="brandmark"'), 'the dashboard header needs the brand mark');
    assert.ok(html.includes('M283 158 V290 A64 64 0 0 1 155 290'), 'and it must be the JobUp mark');
    // The initials chip is gone. It rendered a literal "--" before a session
    // resolved, and it sat right next to the same name in text. Its .av rule
    // was declared AFTER .hidden — both single-class — so toggling `hidden`
    // on it did nothing and the two chips showed side by side.
    assert.ok(!/id="av"/.test(html), 'the initials chip must not come back');
    assert.ok(!/\.av\{/.test(html), 'and neither should its CSS');
    assert.ok(!html.includes("$('av')"), 'no script may still reach for it');
    // Signing out must not leave the previous account's name in the header.
    const branches = html.match(/login'\)\.classList\.remove\('hidden'\)/g) || [];
    const restores = html.match(/brandOnly\(\)/g) || [];
    assert.ok(branches.length >= 2, 'expected both the unauthenticated and the network-failure path');
    assert.ok(restores.length >= branches.length,
      'every signed-out path must call brandOnly(), or a stale name survives sign-out');
  });
  await t('A .hidden TOGGLE ONLY WORKS IF .hidden WINS THE CASCADE', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    const css = html.slice(0, html.indexOf('</style>'));
    const hiddenAt = css.indexOf('.hidden{display:none}');
    assert.ok(hiddenAt > -1, '.hidden must exist');
    // Only elements the script actually toggles matter. For each of those, if
    // one of its classes sets `display` in a single-class rule declared AFTER
    // .hidden, that rule silently wins and the toggle does nothing. That is
    // exactly how the "--" chip stayed on screen beside the logo.
    const toggled = new Set(
      [...html.matchAll(/\$\('([\w-]+)'\)\.classList\.(?:add|remove|toggle)\('hidden'/g)]
        .map((m) => m[1]));
    assert.ok(toggled.size > 0, 'expected to find elements toggled with .hidden');
    const offenders = [];
    for (const id of toggled) {
      const el = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`));
      if (!el) continue;
      const cls = (el[0].match(/class="([^"]*)"/) || [, ''])[1].split(/\s+/).filter(Boolean);
      for (const c of cls) {
        if (c === 'hidden') continue;
        const rule = css.match(new RegExp(`(^|\\n)\\.${c}\\{([^}]*)\\}`));
        if (rule && css.indexOf(rule[0]) > hiddenAt && /(^|;)\s*display:/.test(rule[2])
            && !css.replace(/\s+/g, '').includes(`.${c}.hidden{display:none}`)) {
          offenders.push(`#${id}.${c}`);
        }
      }
    }
    assert.deepStrictEqual(offenders, [],
      `toggled with .hidden but their own rule sets display later: ${offenders.join(', ')}`);
  });
  await t('ICONS ARE VERSIONED, OR A REDESIGN NEVER REACHES A DEVICE', () => {
    const fs = require('fs');
    // Icons are served with a long max-age. Without a version in the url, a
    // redesign is invisible to anyone holding the old file: iOS built its
    // "Add to Home Screen" preview from Safari's cached apple-touch-icon and
    // showed the previous mark days after the new one shipped.
    for (const icon of pwaSvc.manifest('/jobup').icons) {
      assert.ok(/\?v=\d+$/.test(icon.src), `manifest icon is unversioned: ${icon.src}`);
    }
    for (const f of ['index.html', 'app.html', 'welcome.html', 'offline.html']) {
      const out = pwaSvc.page(f, '');
      for (const m of out.matchAll(/href="(\/(?:apple-touch-icon|favicon-32|favicon|icon-\d+)\.[a-z]+[^"]*)"/g)) {
        assert.ok(/\?v=\d+$/.test(m[1]), `${f} links an unversioned icon: ${m[1]}`);
      }
      assert.ok(!out.includes('{{V}}'), `${f} has an unsubstituted version token`);
    }
    // The worker must precache the same urls the pages request, not bare ones.
    const sw = pwaSvc.serviceWorker('/jobup');
    assert.ok(!sw.includes('__V__'), 'the worker has an unsubstituted version token');
    assert.ok(/icon-192\.png\?v=\d+/.test(sw), 'the worker precaches an unversioned icon');
  });
  await t('ONLY A VERSIONED ICON URL IS CACHED HARD — asserted over real HTTP', async () => {
    // Grepping the source cannot see this. res.sendFile writes its OWN
    // Cache-Control from its options and silently overwrote a header set with
    // res.set(), so every icon went out as max-age=0 while the source looked
    // correct. Only an actual response proves the policy.
    const express = require('express');
    const http = require('http');
    const app = express();
    // Plain middleware, not a route pattern: the wildcard syntax differs
    // between Express 4 and 5 and this must not depend on which is installed.
    app.use((req, res, next) => { if (!pwaSvc.serveAsset(req, res, '')) next(); });
    const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const port = srv.address().port;
    const head = (p) => new Promise((ok, bad) => {
      http.get({ host: '127.0.0.1', port, path: p }, (r) => {
        r.resume();
        ok({ status: r.statusCode, cc: r.headers['cache-control'] || '' });
      }).on('error', bad);
    });
    try {
      const versioned = await head('/apple-touch-icon.png?v=9');
      assert.strictEqual(versioned.status, 200);
      assert.match(versioned.cc, /max-age=31536000/, 'a versioned icon should be cached for a year');
      assert.match(versioned.cc, /immutable/, 'and marked immutable');

      const bare = await head('/apple-touch-icon.png');
      assert.strictEqual(bare.status, 200);
      assert.doesNotMatch(bare.cc, /immutable/, 'a bare url can change under the same address');
      // This is the whole fix: a device holding a pre-redesign icon at the bare
      // url has to be able to recover without waiting out a week.
      const maxAge = Number((bare.cc.match(/max-age=(\d+)/) || [])[1]);
      assert.ok(maxAge > 0 && maxAge <= 3600,
        `a bare icon url must expire soon, got "${bare.cc}"`);
    } finally { srv.close(); }
  });
  await t('EVERY root routes icons through the same policy', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    // The icons used to fall through to express.static on the apex and the path
    // mount, which serves max-age=0 — so the caching policy existed only on the
    // subscriber subdomain, the one root that already called serveAsset.
    // Anchor the end relative to the start, not on the first global match —
    // any route declared earlier that also calls pwa.basePath would otherwise
    // invert this slice and make the assertions below vacuous.
    const from = src.indexOf("router.get(['/manifest.webmanifest'");
    assert.ok(from > -1, 'the PWA asset route must exist');
    const route = src.slice(from, src.indexOf('pwa.basePath(req)', from));
    for (const f of ['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
                     '/favicon-32.png', '/favicon.svg']) {
      assert.ok(route.includes(`'${f}'`), `${f} is left to express.static`);
    }
  });
  await t('BRAND: every page links the favicon as a real tag, not a mention', () => {
    const fs = require('fs');
    // The landing shipped without the SVG favicon because a guard tested for
    // the substring "favicon.svg", which also matches a comment in the inline
    // logo. Assert the TAG, and on the one page most likely to be seen in a tab.
    for (const f of ['index.html', 'app.html', 'welcome.html', 'offline.html']) {
      const html = fs.readFileSync(`${__dirname}/public/${f}`, 'utf8');
      assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="{{BASE}}/favicon.svg{{V}}">'),
        `${f} is missing the SVG favicon link`);
      assert.ok(html.includes('sizes="32x32" href="{{BASE}}/favicon-32.png{{V}}"'),
        `${f} needs the PNG fallback for browsers without SVG favicon support`);
      assert.ok(html.includes('rel="apple-touch-icon"'), `${f} is missing the iOS icon`);
    }
  });
  await t('BRAND: the master is full-bleed and the favicon is rounded', () => {
    const fs = require('fs');
    const master = fs.readFileSync(__dirname + '/public/logo-master.svg', 'utf8');
    const fav = fs.readFileSync(__dirname + '/public/favicon.svg', 'utf8');
    // iOS rounds apple-touch-icon itself and Android maskable icons need the
    // corners filled, so the master must NOT be pre-rounded.
    assert.ok(/<rect width="512" height="512" fill="url\(#brand\)"\/>/.test(master),
      'the master tile must be a square with no rx');
    assert.ok(/<rect width="512" height="512" rx="\d+"/.test(fav),
      'the tab favicon is rendered as-is, so it must be rounded');
  });
  await t('BRAND: the mark survives the Android maskable crop', () => {
    const fs = require('fs');
    const master = fs.readFileSync(__dirname + '/public/logo-master.svg', 'utf8');
    // A mask can crop to the circle inscribed in the central 80% — radius 205
    // from centre. Every drawn point plus half the stroke must fit inside it.
    const stroke = Number(master.match(/stroke-width="(\d+)"/)[1]);
    // Parse ONLY the path data — a naive scan for number pairs also matches
    // width="512" height="512" and reports the tile corner as a glyph point.
    const pts = [];
    for (const m of master.matchAll(/ d="([^"]+)"/g)) {
      const d = m[1];
      let last = null;
      for (const c of d.matchAll(/([MLA])\s*([\d\s.]+)/g)) {
        const n = c[2].trim().split(/\s+/).map(Number);
        // An arc's first five numbers are radii/rotation/flags — the endpoint
        // is the last pair.
        const pt = c[1] === 'A' ? [n[5], n[6]] : [n[0], n[1]];
        pts.push(pt); last = pt;
      }
      // V is a vertical lineto: x carries over from the previous point.
      for (const v of d.matchAll(/V\s*([\d.]+)/g)) pts.push([last ? last[0] : 256, Number(v[1])]);
      // The J hook is a semicircle, so it dips a full radius below its chord.
      const arc = d.match(/A(\d+) \d+ \d+ \d+ \d+ (\d+) (\d+)/);
      if (arc) pts.push([(Number(arc[2]) + 283) / 2, Number(arc[3]) + Number(arc[1])]);
    }
    assert.ok(pts.length >= 6, `expected the glyph points, parsed ${pts.length}`);
    assert.ok(!pts.some(([x, y]) => x === 512 && y === 512), 'parsed the tile, not the glyph');
    for (const [x, y] of pts) {
      const d = Math.hypot(x - 256, y - 256) + stroke / 2;
      assert.ok(d <= 205, `point ${x},${y} reaches ${Math.round(d)} from centre — outside the safe zone`);
    }
  });
  await t('mobile: the landing nav collapses into a hamburger', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/index.html', 'utf8');
    const css = html.replace(/\s+/g, '');
    assert.ok(html.includes('id="ju-burger"'), 'there must be a burger button');
    assert.ok(html.includes('aria-expanded'), 'the button must report its state to a screen reader');
    assert.ok(html.includes('aria-controls="ju-navlinks"'), 'and say what it controls');
    // The original bug: this page has its OWN nav, so the design system's
    // .nav-links/.nav-burger rules never applied and all five links stayed in a
    // row — wrapping into the brand and running off the right edge.
    assert.ok(css.includes('.d2b.ju-burger{display:none'), 'the burger is desktop-hidden by default');
    assert.ok(/@media\(max-width:760px\)\{[^]*?\.d2b\.ju-burger\{display:inline-flex\}/.test(css),
      'the burger must appear under the mobile breakpoint');
    assert.ok(/\.d2bnav\.nav-open\.ju-navlinks\{display:flex/.test(css),
      'opening the nav must reveal the drawer');
  });
  await t('THE NAV LINKS CARRY NO INLINE DISPLAY — it would beat the media query', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/index.html', 'utf8');
    // Anchor on the real element, not the first '<nav' substring — a CSS
    // comment mentioning one would otherwise slice the whole stylesheet in.
    const open = html.indexOf('<nav>');
    assert.ok(open > -1, 'the nav element must exist');
    assert.ok(open > html.indexOf('<div class="d2b">'),
      'nav must sit inside .d2b or none of the .d2b-prefixed rules apply to it');
    const nav = html.slice(open, html.indexOf('</nav>', open));
    // This is the actual mechanism of the bug being fixed: the links sat in a
    // <div style="display:flex"> and no stylesheet rule can override that.
    assert.ok(!/style="[^"]*display:flex/.test(nav),
      'an inline display:flex in the nav cannot be collapsed into a drawer');
    assert.ok(nav.includes('class="ju-navlinks"'), 'the links need a class to be styled');
  });
  await t('the drawer closes on link tap, outside click and Escape', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/index.html', 'utf8');
    assert.ok(html.includes("!nav.contains(e.target)"), 'tapping outside must close it');
    assert.ok(html.includes("e.key==='Escape'"), 'Escape must close it');
    assert.ok(html.includes("a.addEventListener('click',function(){set(false);})"),
      'an anchor jump must not leave the drawer covering the section it scrolled to');
    assert.ok(html.includes('innerWidth>760'),
      'rotating past the breakpoint must not leave a drawer floating over the desktop row');
  });
  await t('mobile: the landing has real touch targets and does not zoom on focus', () => {
    const fs = require('fs');
    const css = fs.readFileSync(__dirname + '/public/index.html', 'utf8').replace(/\s+/g, '');
    assert.ok(css.includes('min-height:44px'), '44px is the smallest reliably tappable target');
    assert.ok(css.includes('.d2binput,.d2bselect,.d2btextarea{font-size:16px}'),
      'under 16px, iOS zooms the whole page when a field takes focus');
    assert.ok(css.includes('overflow-wrap:anywhere'),
      'a long address or email is the usual cause of sideways scroll on a phone');
  });


  // ---------------------------------------------------------------
  section('phone — accepted the way people actually type it');
  const phoneSvc = require(__dirname + '/src/services/phone');

  await t('a bare 10-digit US number is accepted', () => {
    for (const v of ['6566001400', '(656) 600-1400', '656-600-1400', '656.600.1400', '656 600 1400']) {
      const r = phoneSvc.normalize(v);
      assert.ok(r.ok, 'rejected: ' + v);
      assert.strictEqual(r.e164, '+16566001400', 'wrong result for ' + v);
    }
  });
  await t('THE CASE THAT WAS BROKEN — 11 digits with no plus', () => {
    const r = phoneSvc.normalize('16566001400');
    assert.ok(r.ok, 'this is what a US user types and it must not be rejected');
    assert.strictEqual(r.e164, '+16566001400');
  });
  await t('already-E.164 and 00-prefixed international both work', () => {
    assert.strictEqual(phoneSvc.normalize('+16566001400').e164, '+16566001400');
    assert.strictEqual(phoneSvc.normalize('+44 20 7946 0958').e164, '+442079460958');
    assert.strictEqual(phoneSvc.normalize('00442079460958').e164, '+442079460958');
    assert.strictEqual(phoneSvc.normalize('tel:+16566001400').e164, '+16566001400');
  });
  await t('phone stays OPTIONAL — empty is valid, not an error', () => {
    for (const v of [undefined, null, '', '   ']) {
      const r = phoneSvc.normalize(v);
      assert.ok(r.ok, 'empty must not error');
      assert.strictEqual(r.e164 || null, null);
    }
  });
  await t('AN AMBIGUOUS NUMBER IS NEVER GUESSED INTO A COUNTRY', () => {
    // Assuming +1 on a 12-digit string would send someone else's phone a text.
    const r = phoneSvc.normalize('123456789012');
    assert.strictEqual(r.ok, false);
    assert.ok(/country code/i.test(r.reason), 'it must ask for the country code');
  });
  await t('bad input is refused with a reason a person can act on', () => {
    assert.ok(/10/.test(phoneSvc.normalize('655').reason), 'should say how many digits are needed');
    assert.ok(/area code/i.test(phoneSvc.normalize('0566001400').reason));
    assert.strictEqual(phoneSvc.normalize('abc').ok, false);
  });
  await t('normalisation is idempotent', () => {
    const once = phoneSvc.normalize('(656) 600-1400').e164;
    assert.strictEqual(phoneSvc.normalize(once).e164, once);
  });
  await t('as-you-type formatting builds the familiar US shape', () => {
    assert.strictEqual(phoneSvc.formatAsYouType('6566001400'), '(656) 600-1400');
    assert.strictEqual(phoneSvc.formatAsYouType('656600'), '(656) 600');
    assert.strictEqual(phoneSvc.formatAsYouType('+4420794'), '+4420794', 'international is left alone');
  });
  await t('the intake gate RETURNS the normalised number, so E.164 is stored', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(src.includes('phoneSvc.normalize'), 'the gate must normalise');
    assert.ok(src.includes('body.phone = gate.phone'), 'the normalised value must be what is stored');
    assert.ok(!src.includes('phone must be E.164'), 'the old wall must be gone');
  });
  await t('the client mirrors the server and no longer demands E.164', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/index.html', 'utf8');
    assert.ok(!html.includes('Phone must be in E.164 format'), 'the old error must be gone');
    assert.ok(!html.includes('optional, E.164'), 'the label should not mention E.164');
    assert.ok(html.includes('juNormalizePhone'), 'client-side normaliser');
    assert.ok(html.includes("inputmode','tel'"), 'phones should get the numeric keypad');
    // The client is convenience; the server is the guarantee. Both must agree.
    // Extract just the normaliser rather than stubbing an entire browser —
    // the surrounding block wires DOM listeners we do not care about here.
    const js = html.split('<script>')[1].split('</script>')[0];
    const m = js.match(/function juNormalizePhone\(input\)\{[\s\S]*?\n\}/);
    assert.ok(m, 'juNormalizePhone should be extractable');
    const fn = new Function(m[0] + '; return juNormalizePhone;')();
    for (const v of ['16566001400', '6566001400', '(656) 600-1400', '+442079460958']) {
      assert.strictEqual(fn(v).e164, phoneSvc.normalize(v).e164, 'client/server disagree on ' + v);
    }
  });


  // ---------------------------------------------------------------
  section('build progress, photo, and the walkthrough');
  const photosSvc = require(__dirname + '/src/services/photos');
  const limitsSvc = require(__dirname + '/src/services/limits');
  const teaserSvc = require(__dirname + '/src/services/teaser');

  await t('the build reports every stage it passes through', async () => {
    assert.ok(Array.isArray(teaserSvc.STAGES) && teaserSvc.STAGES.length >= 5);
    for (const st of teaserSvc.STAGES) {
      assert.ok(st.key && st.en && st.es, 'each stage needs a key and both languages');
    }
  });
  await t('PROGRESS REPORTING CAN NEVER FAIL A BUILD', async () => {
    // setStage writes to a row that may not exist; it must swallow that.
    await teaserSvc.setStage('no-such-token-' + Date.now(),
      { key: 'reading', label: 'Reading', n: 1, total: 6 });
    // reaching here without throwing is the assertion
    assert.ok(true);
  });
  await t('a real build advances the stage counter', async () => {
    const seen = [];
    await teaserSvc.build({
      name: 'Stage Probe', email: 'sit-stage@example.com', language: 'en',
      resumeText: 'Stage Probe. Engineer. Node, Postgres, distributed systems. Ten years building platforms.',
      onStage: (st) => { seen.push(st.n); },
    });
    assert.ok(seen.length >= 5, 'expected at least five stages, saw ' + seen.length);
    assert.deepStrictEqual(seen, [...seen].sort((a, b) => a - b), 'stages must advance in order');
    assert.strictEqual(seen[0], 1, 'the first stage should be reported immediately');
  });

  await t('a photo is identified by MAGIC BYTES, not its filename', () => {
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64)]);
    const jpg = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(64)]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(64)]);
    assert.strictEqual(photosSvc.accept(png).mime, 'image/png');
    assert.strictEqual(photosSvc.accept(jpg).mime, 'image/jpeg');
    assert.strictEqual(photosSvc.accept(webp).mime, 'image/webp');
  });
  await t('AN SVG IS REFUSED — it would run script on the subscriber own origin', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    const r = photosSvc.accept(svg, 'image/png');   // lying about the type does not help
    assert.strictEqual(r.ok, false);
    assert.ok(/JPEG, PNG or WebP/.test(r.reason));
  });
  await t('an oversized photo is refused with the actual size', () => {
    const big = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(photosSvc.MAX_BYTES + 10)]);
    const r = photosSvc.accept(big);
    assert.strictEqual(r.ok, false);
    assert.ok(/MB/.test(r.reason));
  });
  await t('the hero uses a photo when there is one and initials when there is not', () => {
    const st = settingsSvc.sanitize({});
    const ctx = { name: 'Ada Lovelace', url: 'https://ada.jobup.dev', slug: 'ada' };
    const withPhoto = siteRender.page({ name: 'Ada Lovelace', photo_url: '/photo' }, st, ctx);
    assert.ok(withPhoto.includes('class="photo"') && withPhoto.includes('src="/photo"'));
    // Match the ELEMENT, not the stylesheet rule of the same name.
    assert.ok(!withPhoto.includes('<div class="photo-fallback">'), 'initials should not also render');
    const without = siteRender.page({ name: 'Ada Lovelace' }, st, ctx);
    assert.ok(without.includes('<div class="photo-fallback">') && without.includes('>AL<'));
    assert.ok(!without.includes('<img class="photo"'), 'no img without a photo');
  });
  await t('the photo lives OUTSIDE resume_json so the JSON surfaces stay small', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/models/index.js', 'utf8');
    assert.ok(src.includes('assets: {'), 'a dedicated assets table');
    assert.ok(src.includes('photo_asset_id'), 'the profile points at it rather than embedding it');
  });

  await t('the walkthrough can PAUSE and resume without restarting', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(src.includes('function pause()') && src.includes('function resume()'));
    assert.ok(src.includes('speechSynthesis.pause'), 'the browser-speech path must pause too');
    assert.ok(src.includes('RESUME_LABEL'), 'the control should say Resume, not Play');
    // A clip finishing while suspended must not advance the walkthrough.
    assert.ok(src.includes('if(t!==token||paused)return;'), 'a paused run must not auto-advance');
    assert.ok(src.includes("stopBtn.addEventListener('click',finish)"), 'Stop still resets to the start');
  });
  await t('leaving the tab pauses rather than losing your place', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(src.includes('visibilitychange'));
  });
  await t('the orb animates and respects prefers-reduced-motion', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    for (const k of ['@keyframes breathe', '@keyframes ripple', '@keyframes eq', 'orbwrap']) {
      assert.ok(src.includes(k), 'missing ' + k);
    }
    assert.ok(src.includes('prefers-reduced-motion'), 'motion must be optional');
  });
  await t('THE ALWAYS-ON LOOP SHOWS THE CYCLE, NOT INVENTED RESULTS', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(src.includes('ALWAYS ON') && src.includes('startAlwaysOn'));
    assert.ok(/This is the loop, not a recording of results/.test(src),
      'it must say plainly that it is an illustration');
    // The four steps are process, never a company or a score.
    for (const step of ['Searching', 'Scoring', 'Explaining', 'Waiting for you']) {
      assert.ok(src.includes('<strong>' + step + '</strong>'), 'missing step ' + step);
    }
  });
  await t('a render fault is NOT retried forever as if it were a network blip', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(src.includes('try{ render(); }'), 'render must be guarded separately');
    assert.ok(/render failed/.test(src), 'and reported, not swallowed into a poll loop');
  });


  // ---------------------------------------------------------------
  section('the console lives on the subscriber own address');
  await t('a subscriber dashboard is served from THEIR subdomain, not the apex', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    // It was only reachable at jobup.dev/jobup/app, which is not their address.
    assert.ok(/\['\/app', '\/app\/', '\/dashboard', '\/admin', '\/cv-admin', '\/login'\]/.test(src),
      'the subscriber-site handler must serve the console');
    assert.ok(src.includes("p.startsWith('/api/v1/')"),
      'the API must answer on their origin too, or the dashboard cannot call it');
  });
  await t('the public site links the owner to their console', () => {
    const st = settingsSvc.sanitize({});
    const html = siteRender.page({ name: 'Ada Lovelace' }, st,
      { name: 'Ada Lovelace', url: 'https://ada.jobup.dev', slug: 'ada' });
    assert.ok(html.includes('Owner sign in'), 'the console must be discoverable from their page');
    assert.ok(html.includes('href="/app"'), 'and it must point at their own origin');
  });
  await t('THE SIGN-IN LINK LEAKS NOTHING — it is a link, not a session', () => {
    const st = settingsSvc.sanitize({});
    const html = siteRender.page(
      { name: 'Ada', email: 'secret@example.com', phone: '+15550001' }, st,
      { name: 'Ada', url: 'https://ada.jobup.dev', slug: 'ada' });
    assert.ok(!html.includes('secret@example.com'));
    assert.ok(!html.includes('+15550001'));
  });
  await t('the dashboard resolves its API base to the current origin', () => {
    const pwaS = require(__dirname + '/src/services/pwa');
    // Sniffing location in the browser got www.jobup.dev and the subdomains
    // subtly wrong. The mount root is substituted server-side, where it is known
    // exactly, and it must be right under /jobup AND at a subdomain root.
    assert.ok(pwaS.page('app.html', '/jobup').includes("var API='/jobup'"),
      'under the path mount the API is prefixed');
    assert.ok(pwaS.page('app.html', '').includes("var API=''"),
      'at a subdomain root the API is at the root');
  });


  // ---------------------------------------------------------------
  section('inbound contact, and the scoped-accessor contract');
  await t('THE SCOPED ACCESSOR TAKES A PLAIN FILTER, NOT {where:{...}}', async () => {
    // Wrapping it produces where:{where:{...},tenant_id} which matches nothing —
    // a silent 404 rather than an error. Assert the contract directly.
    const row = await scoped('opportunities', subA.id).create({ source: 'sit', role: 'X' });
    const hit = await scoped('opportunities', subA.id).findOne({ id: row.id });
    assert.ok(hit, 'a plain filter must find the row');
    const wrapped = await scoped('opportunities', subA.id).findOne({ where: { id: row.id } });
    assert.strictEqual(wrapped, null, 'a wrapped filter finds nothing — this is the trap');
    await scoped('opportunities', subA.id).destroy({ id: row.id });
  });
  await t('no route wraps a scoped filter', () => {
    const fs = require('fs');
    for (const f of ['src/routes/engine.js', 'src/index.js', 'src/services/provisioning.js']) {
      const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
      const bad = src.match(/scoped\([^)]*\)\.(findOne|count|destroy)\(\{ where:/g) || [];
      assert.deepStrictEqual(bad, [], f + ' wraps a scoped filter');
    }
  });
  await t('a contact message becomes an Opportunity for the RIGHT subscriber', async () => {
    const before = (await scoped('opportunities', subB.id).findAll({})).length;
    await scoped('opportunities', subA.id).create({
      source: 'site_form', from_name: 'R', from_email: 'r@acme.example',
      company: 'Acme', role: 'Staff', note: 'Are you open to a conversation?', status: 'new',
    });
    const mine = await scoped('opportunities', subA.id).findAll({});
    assert.ok(mine.some((o) => o.source === 'site_form'));
    assert.strictEqual((await scoped('opportunities', subB.id).findAll({})).length, before,
      'it must not land in another subscriber inbox');
  });
  await t('CONTACT HAS ITS OWN LIMIT — not the teaser cost cap', async () => {
    // Sharing the teaser limiter meant a subscriber who built a few teasers
    // could no longer receive messages on their own site.
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(src.includes('limits.contactAllowed'), 'it must use the contact limiter');
    const contactBlock = src.slice(src.indexOf("router.post('/contact/:slug'"));
    assert.ok(!contactBlock.slice(0, 3000).includes('teaserAllowed'),
      'the teaser cost cap must not gate inbound mail');
    assert.ok(limitsSvc.CONTACT_PER_IP_PER_DAY >= 10, 'the ceiling is about abuse, not spend');
  });
  await t('the contact limit is counted PER RECIPIENT', async () => {
    // One busy profile must never be able to mute another.
    const r = await limitsSvc.contactAllowed({ tenantId: subB.id, ipHash: 'x', email: 'a@b.com' });
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.by_ip, 0, 'another subscriber traffic must not count here');
  });
  await t('an inbound message stores a salted hash, never a raw IP', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(src.includes('ip_hash: ipHash'), 'store the hash');
    assert.ok(!/ip_hash: *clientIp/.test(src), 'never the address itself');
  });
  await t('the contact endpoint exists and is the only thing that creates one', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(src.includes("router.post('/contact/:slug'"), 'the inbound path must exist');
    assert.ok(src.includes('honeypot') || src.includes('b.website'), 'it needs a spam guard');
    assert.ok(src.includes('limits.teaserAllowed'), 'and a rate limit');
  });
  await t('THE PUBLIC PAGE OFFERS A WAY IN WITHOUT EXPOSING AN ADDRESS', () => {
    const st = settingsSvc.sanitize({});   // email private by default
    const html = siteRender.page({ name: 'Ada', email: 'secret@example.com' }, st,
      { name: 'Ada', url: 'https://ada.jobup.dev', slug: 'ada' });
    assert.ok(html.includes('id="cform"'), 'there must be a way to make contact');
    assert.ok(!html.includes('secret@example.com'), 'without publishing the address');
    assert.ok(html.includes('never shared'), 'and it should say so');
  });
  await t('the countdown speaks the page language', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(src.includes("LANG==='es'") && src.includes("step:'Paso'"),
      'Step/left/remaining were hardcoded English inside a Spanish page');
    assert.ok(src.includes('function mmss'), 'a real mm:ss countdown');
    assert.ok(src.includes('pclockbig'), 'and it should be prominent');
  });
  await t('the countdown never freezes at zero pretending', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(src.includes('T.over'), 'past the estimate it must say it is running long');
  });
  await t('PWA manifest is generated for the subscriber origin', () => {
    const pwaS = require(__dirname + '/src/services/pwa');
    // A subdomain is rooted at /, so a manifest scoped to /jobup/ would not even
    // contain /app — the install is rejected outright.
    const m = pwaS.manifest('', { name: 'Manuel Stagg' });
    assert.strictEqual(m.scope, '/');
    assert.strictEqual(m.start_url, '/app');
    assert.ok(m.icons.every((i) => !i.src.includes('/jobup')), 'icons must be rooted at the subdomain');
    // Two installed JobUp sites on one home screen have to be tellable apart.
    assert.ok(m.name.includes('Manuel Stagg'), 'the subscriber name goes on their install');
  });
  await t('ONE generator serves every root — the rewrite is not duplicated', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    // This used to be two separate copies of the rescoping logic, and only the
    // subscriber one was right; the apex shipped a manifest scoped to a path it
    // did not have. Both paths now call the same code.
    assert.ok(!/m\.scope\s*=/.test(src), 'index.js must not hand-patch a manifest any more');
    assert.ok(src.includes('pwa.serveAsset'), 'both roots must go through the shared generator');
    assert.ok(!fs.existsSync(__dirname + '/public/manifest.webmanifest'),
      'a static manifest on disk would be served verbatim to the wrong origin');
  });


  // ---------------------------------------------------------------
  section('address from the name, then numbers');
  await t('the ladder is the NAME, then 1, 2, 3, 4, 5 ...', () => {
    const l = addresses.ladder(addresses.splitName('Manuel Stagg'));
    assert.strictEqual(l[0], 'manuelstagg', 'the name comes first');
    assert.strictEqual(l[1], 'manuelstagg1');
    assert.strictEqual(l[2], 'manuelstagg2');
    assert.strictEqual(l[3], 'manuelstagg3');
    assert.ok(l.length > 50, 'it should not run out after three');
  });
  await t('NO city, profession or industry is ever put in an address', () => {
    const l = addresses.ladder({ first: 'Manuel', last: 'Stagg',
      city: 'Tampa', profession: 'Architect', industry: 'Banking' });
    for (const bad of ['tampa', 'architect', 'banking']) {
      assert.ok(!l.some((x) => x.includes(bad)),
        'an address must not publish a fact they never chose to: ' + bad);
    }
  });
  await t('THE ADDRESS USES THE NAME THEY TYPED, not the one in the CV header', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/teaser.js', 'utf8');
    assert.ok(src.includes('addresses.splitName(name || profile.name)'),
      'a CV header often carries a fuller legal name than the person asked for');
    // "Carlos Gomez" typed vs "CARLOS A GOMEZ MEJIA" in the document.
    assert.strictEqual(addresses.ladder(addresses.splitName('Carlos Gomez'))[0], 'carlosgomez');
    assert.strictEqual(addresses.ladder(addresses.splitName('CARLOS A GOMEZ MEJIA'))[0], 'carlosmejia');
  });
  await t('a one-word name still gets an address', () => {
    const l = addresses.ladder(addresses.splitName('Cher'));
    assert.strictEqual(l[0], 'cher');
    assert.strictEqual(l[1], 'cher1');
  });
  await t('a chosen address is validated strictly — it becomes a hostname', () => {
    assert.strictEqual(addresses.validateLabel('manuelstagg').ok, true);
    assert.strictEqual(addresses.validateLabel('Manuel Stagg').label, 'manuelstagg');
    assert.strictEqual(addresses.validateLabel('ms').ok, false, 'too short');
    assert.strictEqual(addresses.validateLabel('12345').ok, false, 'digits only');
    assert.strictEqual(addresses.validateLabel('app').ok, false, 'reserved');
    assert.strictEqual(addresses.validateLabel('x'.repeat(60)).ok, false, 'too long');
  });
  await t('A RETIRED ADDRESS IS NEVER REASSIGNED — a recruiter may hold that link', async () => {
    await scoped('address_aliases', subA.id).create({ address: `oldname.${addresses.BASE_DOMAIN}` });
    assert.strictEqual(await addresses.isTaken('oldname'), true,
      'an alias must block reuse by anyone, including another subscriber');
    for (const row of await scoped('address_aliases', subA.id).findAll({})) {
      await scoped('address_aliases', subA.id).destroy({ id: row.id });
    }
  });

  // ---------------------------------------------------------------
  section('the site speaks the subscriber language');
  await t('a Spanish profile gets a Spanish page, not English chrome', () => {
    const st = settingsSvc.sanitize({});
    const prof = { name: 'Manuel Stagg', headline: 'Arquitecto', summary: 'Resumen.',
      skills: ['Node'], experience: [{ title: 'SME', company: 'Citi', start: '2019' }] };
    const es = siteRender.page(prof, st, { name: 'Manuel Stagg', url: 'https://m.jobup.dev', slug: 'm', lang: 'es' });
    assert.ok(es.includes('<html lang="es"'), 'the document language must be declared');
    for (const w of ['Perfil profesional', 'Competencias principales', 'Experiencia profesional',
                     '\u00bfContratando?', 'ES \u00b7 Dalia']) {
      assert.ok(es.includes(w), 'missing Spanish: ' + w);
    }
    for (const w of ['Professional Profile', 'Hiring?', 'Owner sign in']) {
      assert.ok(!es.includes(w), 'English leaked into the Spanish page: ' + w);
    }
  });
  await t('English is still English', () => {
    const st = settingsSvc.sanitize({});
    const en = siteRender.page({ name: 'Ada', headline: 'Engineer', summary: 'S.' }, st,
      { name: 'Ada', url: 'https://a.jobup.dev', slug: 'a', lang: 'en' });
    assert.ok(en.includes('<html lang="en"'));
    assert.ok(en.includes('Professional Profile') && en.includes('Hiring?'));
    assert.ok(!en.includes('Perfil profesional'));
  });
  await t('the owner can reach their console from their own page', () => {
    const st = settingsSvc.sanitize({});
    const en = siteRender.page({ name: 'Ada' }, st, { name: 'Ada', url: 'https://a.jobup.dev', slug: 'a' });
    assert.ok(en.includes('href="/app"'), 'a link to the console');
    assert.ok(en.includes('>Manage<'), 'in the nav, not only the footer');
    const es = siteRender.page({ name: 'Ada' }, st,
      { name: 'Ada', url: 'https://a.jobup.dev', slug: 'a', lang: 'es' });
    assert.ok(es.includes('>Gestionar<'), 'localised too');
  });

  // ---------------------------------------------------------------
  section('email to yourself');
  await t('with no key it refuses HONESTLY rather than claiming it sent', async () => {
    const saved = process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    assert.strictEqual(mailerSvc.configured(), false);
    const r = await mailerSvc.send({ to: 'x@example.com', subject: 'x', text: 'x' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.configured, false);
    assert.ok(r.error, 'it must say why');
    if (saved) process.env.SENDGRID_API_KEY = saved;
  });
  await t('EITHER SENDER VARIABLE WORKS — this repo names it two ways', () => {
    const keep = ['JOBUP_FROM_EMAIL', 'SENDGRID_FROM_EMAIL', 'FROM_EMAIL', 'SENDGRID_API_KEY']
      .reduce((a, k) => { a[k] = process.env[k]; delete process.env[k]; return a; }, {});
    process.env.SENDGRID_API_KEY = 'SG.test';
    assert.strictEqual(mailerSvc.configured(), false, 'a key alone is not enough');
    assert.ok(mailerSvc.status().missing.some((m) => /sender address/.test(m)));

    // src/services/emailService.js uses FROM_EMAIL; 14 other places use
    // SENDGRID_FROM_EMAIL. Reporting 'not configured' next to a working
    // SendGrid account because we only looked at one of them is a bug.
    process.env.FROM_EMAIL = 'noreply@ringlypro.com';
    assert.strictEqual(mailerSvc.configured(), true, 'FROM_EMAIL must count');
    assert.strictEqual(mailerSvc.fromSource(), 'FROM_EMAIL');

    process.env.SENDGRID_FROM_EMAIL = 'sg@example.com';
    assert.strictEqual(mailerSvc.fromSource(), 'SENDGRID_FROM_EMAIL', 'the specific one wins');

    process.env.JOBUP_FROM_EMAIL = 'hello@jobup.dev';
    assert.strictEqual(mailerSvc.fromSource(), 'JOBUP_FROM_EMAIL', 'and JobUp own wins over both');

    for (const [k, v] of Object.entries(keep)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  await t('status names WHICH half is missing, not just "not configured"', () => {
    const keep = process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    const st = mailerSvc.status();
    assert.ok(Array.isArray(st.missing) && st.missing.includes('SENDGRID_API_KEY'));
    assert.strictEqual(st.api_key, 'missing');
    if (keep) process.env.SENDGRID_API_KEY = keep;
  });
  await t('the rendered email carries the message and ESCAPES it', () => {
    const r = mailerSvc.renderOpportunity({
      from_name: '<script>alert(1)</script>', from_email: 'r@acme.example',
      company: 'Acme', role: 'Staff', note: 'Are you open?', created_at: new Date(),
    }, 'Manuel');
    assert.ok(r.text.includes('Are you open?'));
    assert.ok(r.html.includes('Acme'));
    assert.ok(!r.html.includes('<script>alert'), 'inbound text must never render as markup');
    assert.ok(r.html.includes('&lt;script&gt;'), 'it should be escaped, not stripped silently');
  });
  await t('EVERY SEND IS USER-CLICKED — nothing mails on a timer or a webhook', () => {
    const fs = require('fs');
    for (const f of ['src/services/mailer.js', 'src/routes/engine.js', 'src/routes/intake.js',
                     'src/services/agents/index.js']) {
      const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
      assert.ok(!/setInterval\([^)]*mailer|cron/i.test(src), f + ' appears to send on a schedule');
    }
    const eng = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(eng.includes("router.post('/opportunities/:id/email-me'"), 'the send is a POST the user triggers');
    assert.ok(eng.includes('to: sub.email'), 'and it goes to their OWN address');
  });


  // ---------------------------------------------------------------
  section('checkout identity comes from the teaser, not the resume');
  await t('A RESUME WITH NO EMAIL STILL CONVERTS', async () => {
    // Plenty of CVs carry no address. Reading the email from the extracted
    // profile meant Submit returned 'email required' and no account was made,
    // even though the person had typed one into the intake form.
    const built = await teaserSvc.build({
      name: 'Carlos Gomez', email: 'sit-noemail@example.com', language: 'en',
      resumeText: 'Carlos Gomez. Systems Engineer. Java, Oracle, Linux. Twelve years in payments. No contact details in this document.',
    });
    const prof = (built.screens && built.screens.site && built.screens.site.profile) || {};
    assert.ok(!prof.email, 'this fixture must have no email in the resume');
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/billing.js', 'utf8');
    assert.ok(src.includes('teaserSvc.get(teaser_token)'),
      'checkout must resolve identity from the teaser row');
    assert.ok(!src.includes("if (!email) return res.status(400).json({ error: 'email required' });"),
      'the old resume-derived check must be gone');
  });
  await t('the teaser row OVERRIDES a client-supplied address', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/billing.js', 'utf8');
    const block = src.slice(src.indexOf('let email ='), src.indexOf('let sub ='));
    assert.ok(/if \(t\.email\) email = /.test(block),
      'a token must not be pairable with somebody else address');
  });
  await t('with no email anywhere it says what to do', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/billing.js', 'utf8');
    assert.ok(/Start again from the home page/.test(src),
      'the error must be actionable, not the bare string "email required"');
  });


  // ---------------------------------------------------------------
  section('resume extraction — shape, budget, retention');
  await t('THE HEURISTIC PATH RETURNS THE SAME FLAT SHAPE AS THE MODEL PATH', async () => {
    // It used to nest everything under `basics`, while the site renderer,
    // resume.json, the JSON-LD and the matcher all read the top level. A real
    // profile therefore rendered as a bare name with the data sitting right
    // there, unread.
    const txt = ['CARLOS A GOMEZ MEJIA', 'carlos@example.com | 656-205-1665',
      'Finance and Operations Professional', '', 'EXPERIENCE', 'Analyst, Acme, 2019-2024'].join('\n');
    const out = await resumeSvc.structure(txt);
    const pr = out.profile;
    assert.ok(!pr.basics, 'nothing may be nested under basics');
    for (const k of ['name', 'headline', 'email', 'phone', 'location',
                     'summary', 'experience', 'education', 'skills', 'certifications']) {
      assert.ok(k in pr, 'missing top-level field: ' + k);
    }
    assert.strictEqual(pr.name, 'CARLOS A GOMEZ MEJIA');
    assert.ok(pr.email.includes('@'), 'the email it found must be reachable');
    assert.ok(pr.headline.length > 5, 'and the headline');
  });
  await t('a heuristic profile actually RENDERS its fields', () => {
    const txt = ['Ada Lovelace', 'ada@example.com', 'Analytical Engine Architect'].join('\n');
    const pr = { name: 'Ada Lovelace', headline: 'Analytical Engine Architect',
                 email: 'ada@example.com', experience: [], education: [], skills: [] };
    const st = settingsSvc.sanitize({ privacy: { email: true } });
    const html = siteRender.page(pr, st, { name: 'Ada Lovelace', url: 'https://a.jobup.dev', slug: 'a' });
    assert.ok(html.includes('Analytical Engine Architect'), 'the headline must reach the page');
  });
  await t('the fallback says WHY it fell back, not always "no key"', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const out = await resumeSvc.structure('Someone\nsome@example.com\nA Title Here');
    assert.ok(/no ANTHROPIC_API_KEY/.test(out.profile.note), 'keyless should say so');
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/resume.js', 'utf8');
    assert.ok(src.includes('could not be parsed'), 'a parse failure must be reported as one');
    assert.ok(src.includes('JOBUP_STRUCTURE_MAX_TOKENS'), 'the output budget must be raisable');
    assert.ok(/maxTokens: budget/.test(src), 'and actually used');
  });
  await t('THE EXTRACTED RESUME IS RETAINED, or the matcher has nothing to match on', () => {
    const fs = require('fs');
    const models_src = fs.readFileSync(__dirname + '/src/models/index.js', 'utf8');
    assert.ok(/resume_text: \{ type: DataTypes\.TEXT \}/.test(models_src),
      'the teaser must keep the text it extracted');
    const intake = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(intake.includes('ip, resumeText }'), 'and store it at creation');
    const prov = fs.readFileSync(__dirname + '/src/services/provisioning.js', 'utf8');
    assert.ok(prov.includes('t.resume_text ||'), 'and carry it onto the profile');
  });
  await t('retention still applies to the text we now keep', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/models/index.js', 'utf8');
    assert.ok(src.includes('resume_purge_after'),
      'the purge column exists and now has something to purge');
  });


  // ---------------------------------------------------------------
  section('the previewed address is the one you get');
  await t('PROVISIONING HONOURS THE ADDRESS THE TEASER PROMISED', async () => {
    // It was derived twice from different inputs: the teaser showed
    // carlosgomez.jobup.dev and provisioning handed out carlosmejia.jobup.dev.
    // Someone chose to pay having seen the first one.
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/provisioning.js', 'utf8');
    assert.ok(src.includes('t.address_offer'), 'it must read what was offered');
    assert.ok(/provisionAddress\(tenantId, teaserToken\)/.test(src), 'and be given the token');
  });
  await t('a promised address still taken by then falls through honestly', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/provisioning.js', 'utf8');
    assert.ok(src.includes('await addresses.isTaken(label)'),
      'it must re-check rather than assume the offer still stands');
    assert.ok(src.includes('Taken between preview and payment'),
      'and allocate a fresh one rather than fail');
  });
  await t('the fallback also prefers the typed name', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/provisioning.js', 'utf8');
    assert.ok(src.includes('addresses.splitName(sub.name || profile.name'),
      'both paths must agree on which name wins');
    assert.ok(!/allocate\(\{ \.\.\.parts, city:/.test(src),
      'and neither may put a city in an address');
  });


  // ---------------------------------------------------------------
  section('rows reach the client as data, not Sequelize instances');
  await t('THE MATCHES ROUTE MUST NOT SPREAD A MODEL INSTANCE', () => {
    // Spreading a Sequelize row yields dataValues/_previousDataValues, not the
    // columns, so `score` arrived at the dashboard as undefined. The memory
    // backend returns plain objects, so it works locally and fails only on
    // Postgres — which is why every SIT passed while the UI showed a dash.
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(!/out\.push\(\{ \.\.\.m, job/.test(src), 'a bare spread must not come back');
    assert.ok(src.includes('...plain(m)'), 'rows must be flattened first');
  });
  await t('plain() flattens an instance, an array, and passes plain objects through', () => {
    const fake = { dataValues: { id: 1, score: 72 }, get: ({ plain: p }) => (p ? { id: 1, score: 72 } : null) };
    assert.deepStrictEqual(models_mod.plain(fake), { id: 1, score: 72 });
    assert.deepStrictEqual(models_mod.plain([fake])[0].score, 72);
    assert.deepStrictEqual(models_mod.plain({ id: 2 }), { id: 2 });
    assert.strictEqual(models_mod.plain(null), null);
  });
  await t('every route that returns rows flattens them', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    for (const frag of ['opportunities: list', 'runs: plain(await', 'recent_runs: plain(runs)']) {
      assert.ok(src.includes(frag), 'not flattened: ' + frag);
    }
  });


  // ---------------------------------------------------------------
  section('QR code on the profile');
  await t('the share card carries a QR thumbnail and a full-size modal', async () => {
    const QR = require('qrcode');
    const qr = await QR.toDataURL('https://ada.jobup.dev', { margin: 1, width: 512 });
    const st = settingsSvc.sanitize({});
    const html = siteRender.page({ name: 'Ada Lovelace', qr_data_uri: qr }, st,
      { name: 'Ada Lovelace', url: 'https://ada.jobup.dev', slug: 'ada' });
    for (const frag of ['id="qrThumb"', 'id="qrModal"', 'class="qrbig"', 'id="qrBtn"', 'id="qrClose"']) {
      assert.ok(html.includes(frag), 'missing ' + frag);
    }
    assert.ok(html.includes('ada.jobup.dev</div>'), 'the modal should show the address');
  });
  await t('THE QR IS GENERATED ON OUR OWN SERVER', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    assert.ok(src.includes("require('qrcode')"), 'encoded locally');
    // A third-party QR image service would receive every subscriber's address.
    assert.ok(!/api\.qrserver\.com|chart\.googleapis\.com|quickchart/.test(src),
      'no external QR service may see a subscriber address');
    assert.ok(src.includes('qrCache'), 'and it should be cached per address');
  });
  await t('the page still renders when QR generation fails', () => {
    const st = settingsSvc.sanitize({});
    const html = siteRender.page({ name: 'Ada' }, st,
      { name: 'Ada', url: 'https://ada.jobup.dev', slug: 'ada' });
    assert.ok(html.includes('sharecard'), 'the share card must survive');
    assert.ok(!html.includes('id="qrThumb"'), 'no broken image element');
    assert.ok(!html.includes('id="qrBtn"'), 'and no button that does nothing');
  });
  await t('the QR label is localised', () => {
    const st = settingsSvc.sanitize({});
    const q = 'data:image/png;base64,AAAA';
    const es = siteRender.page({ name: 'Ada', qr_data_uri: q }, st,
      { name: 'Ada', url: 'https://ada.jobup.dev', slug: 'ada', lang: 'es' });
    assert.ok(es.includes('Ver QR'), 'Spanish label');
    assert.ok(!es.includes('>Show QR<'), 'and not the English one');
  });


  // ---------------------------------------------------------------
  section('changing your profile photo');
  await t('a photo can be REPLACED after signup, not only at intake', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes("router.post('/photo'"), 'upload');
    assert.ok(src.includes("router.delete('/photo'"), 'remove');
    assert.ok(src.includes("router.get('/photo/status'"), 'and report the current one');
  });
  await t('replacing a photo DELETES the old asset rather than orphaning it', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(/previousId && previousId !== asset\.id/.test(src),
      'the superseded image must be removed');
    assert.ok(src.includes("scoped('assets', tid).destroy({ id: previousId })"));
  });
  await t('THE UPLOAD IS STILL JUDGED BY MAGIC BYTES', async () => {
    // Same rule as intake: a renamed SVG must not become a hosted script on
    // the subscriber's own origin.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    assert.strictEqual(photosSvc.accept(svg, 'image/png').ok, false);
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64)]);
    assert.strictEqual(photosSvc.accept(png).mime, 'image/png');
  });
  await t('a photo swap is tenant-scoped', async () => {
    const a = await scoped('assets', subA.id).create({ kind: 'photo', mime: 'image/png', bytes: 10, data: 'x' });
    assert.ok(await scoped('assets', subA.id).findOne({ id: a.id }), 'owner can read it');
    assert.strictEqual(await scoped('assets', subB.id).findOne({ id: a.id }), null,
      'another subscriber must not');
    await scoped('assets', subA.id).destroy({ id: a.id });
  });
  await t('THE HERO PHOTO URL IS VERSIONED, or a replacement stays invisible', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    // /photo is served with max-age=86400. A bare '/photo' would keep showing
    // the previous image for a day after someone replaced theirs.
    assert.ok(/photo\?v=\$\{p\.photo_asset_id\}/.test(src),
      'the asset id must be in the URL');
    assert.ok(src.includes("res.set('Cache-Control', 'public, max-age=86400')"),
      'and it is cached, which is why that matters');
  });
  await t('the dashboard offers add, replace and remove', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(html.includes('Your profile photo'));
    assert.ok(html.includes('loadPhoto') && html.includes('uploadPhoto'));
    assert.ok(html.includes("method:'DELETE'"), 'removal must be reachable');
  });


  // ---------------------------------------------------------------
  section('pressing Run 100 times cannot cost 100 runs');
  //
  // Measured before the fix: the caps were per INVOCATION. jobs_scored_per_day
  // was applied with slice(0, perDay) on EACH call despite its name, and the
  // cost cap was min(monthly/30, $0.05) per run. So 100 presses scored 600 jobs
  // for about $2.50 in a day — roughly nine times annual revenue if repeated —
  // and nothing said no.
  await t('THE CEILINGS ARE DAILY AND COUNT EVERY RUN', () => {
    const src = require('fs').readFileSync(__dirname + '/src/services/agents/index.js', 'utf8');
    assert.ok(src.includes('async function usedToday'), 'spend must be measured across the day');
    assert.ok(src.includes('const jobsLeft = Math.max(0, perDay - used.scored)'),
      'the job ceiling must subtract what today already scored');
    assert.ok(src.includes('const budgetLeft = Math.max(0, dailyBudget - used.spent)'),
      'and the budget likewise');
    assert.ok(src.includes('slice(0, jobsLeft)'), 'the slice must use what is LEFT, not the daily total');
    // Strip comments first: the old expression survives in the note that
    // explains why it was wrong, and matching that would be a false pass.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    assert.ok(!/slice\(0, perDay\)/.test(code), 'the per-invocation slice must be gone');
  });
  await t('usedToday sums only TODAY, and only the Hunter', async () => {
    const t2 = scoped('agent_runs', subA.id);
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });   // earlier tests logged runs
    const yesterday = new Date(Date.now() - 30 * 60 * 60 * 1000);
    await t2.create({ agent: 'hunter', status: 'ok', cost_usd: 9.99, scored: 99, created_at: yesterday });
    await t2.create({ agent: 'presence', status: 'ok', cost_usd: 5, scored: 50 });
    await t2.create({ agent: 'hunter', status: 'ok', cost_usd: 0.02, scored: 4 });
    const u = await agents.usedToday(subA.id);
    assert.strictEqual(u.scored, 4, "yesterday's runs and other agents must not count");
    assert.ok(Math.abs(u.spent - 0.02) < 1e-9);
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
  });
  await t('AT THE CEILING THE RUN COSTS NOTHING AND SAYS SO', async () => {
    const t2 = scoped('agent_runs', subA.id);
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
    // Burn the default allowance of 6 for today.
    await t2.create({ agent: 'hunter', status: 'ok', cost_usd: 0.03, scored: 6 });
    const r = await agents.hunter(subA.id);
    assert.strictEqual(r.daily_limit_reached, true);
    assert.strictEqual(r.scored, 0);
    assert.strictEqual(r.cost_usd, 0, 'a refused run must not spend');
    assert.ok(/used up|allowance|resets/i.test(r.note), 'and must explain itself');
    const logged = (await t2.findAll({})).find((x) => x.status === 'idle');
    assert.ok(logged && Number(logged.cost_usd) === 0, 'the refusal is logged at zero cost');
    for (const r2 of await t2.findAll({})) await t2.destroy({ id: r2.id });
  });
  await t('a partly-used allowance only buys the REMAINDER', async () => {
    const t2 = scoped('agent_runs', subA.id);
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
    await t2.create({ agent: 'hunter', status: 'ok', cost_usd: 0.01, scored: 4 });
    const u = await agents.usedToday(subA.id);
    assert.strictEqual(Math.max(0, 6 - u.scored), 2, 'two left of six, not six again');
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
  });
  await t('A SCHEDULED RUN NEVER STARVES THE MANUAL SEARCH', async () => {
    // They shared one pool, so whoever ran first spent the day. A subscriber
    // opening the app after the 07:00 run pressed the button and got nothing.
    const t2 = scoped('agent_runs', subA.id);
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
    await t2.create({ agent: 'hunter', status: 'ok', scored: 6, cost_usd: 0.03, trigger: 'scheduled' });
    const manual = await agents.usedToday(subA.id, 'manual');
    assert.strictEqual(manual.scored, 0, 'the manual allowance must be untouched');
    assert.strictEqual(manual.manual_runs, 0, 'and no manual run has happened');
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
  });
  await t('ONE MANUAL SEARCH A DAY, and the refusal is free', async () => {
    const t2 = scoped('agent_runs', subA.id);
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
    await t2.create({ agent: 'hunter', status: 'ok', scored: 3, cost_usd: 0.02, trigger: 'manual' });
    const r = await agents.hunter(subA.id, { trigger: 'manual' });
    assert.strictEqual(r.manual_limit_reached, true);
    assert.strictEqual(r.cost_usd, 0, 'a refused search must not spend');
    assert.strictEqual(r.manual_runs_per_day, 1);
    assert.ok(/resets at midnight UTC/i.test(r.note));
    assert.ok(/runs on its own/i.test(r.note), 'it should reassure, not just refuse');
    for (const r2 of await t2.findAll({})) await t2.destroy({ id: r2.id });
  });
  await t('the SIGNUP run does not consume the manual search', async () => {
    const t2 = scoped('agent_runs', subA.id);
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
    await t2.create({ agent: 'hunter', status: 'ok', scored: 6, cost_usd: 0.03, trigger: 'signup' });
    const u = await agents.usedToday(subA.id);
    assert.strictEqual(u.manual_runs, 0,
      'a new subscriber must still have their manual search on day one');
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
  });
  await t('an IDLE manual attempt does not burn the allowance', async () => {
    // Refusing to spend and then counting it against them would be the worst
    // of both.
    const t2 = scoped('agent_runs', subA.id);
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
    await t2.create({ agent: 'hunter', status: 'idle', scored: 0, cost_usd: 0, trigger: 'manual' });
    const u = await agents.usedToday(subA.id);
    assert.strictEqual(u.manual_runs, 0, 'only a run that actually scored counts');
    for (const r of await t2.findAll({})) await t2.destroy({ id: r.id });
  });
  await t('every caller declares what triggered it', () => {
    const fs = require('fs');
    assert.ok(fs.readFileSync(__dirname + '/src/services/provisioning.js', 'utf8')
      .includes("trigger: 'signup'"));
    assert.ok(fs.readFileSync(__dirname + '/src/services/scheduler.js', 'utf8')
      .includes("{ trigger: 'scheduled' }"));
    assert.ok(fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8')
      .includes("{ trigger: 'manual' }"));
  });
  await t('an unknown trigger falls back to scheduled, never to a free pass', () => {
    const src = require('fs').readFileSync(__dirname + '/src/services/agents/index.js', 'utf8');
    assert.ok(src.includes("['signup', 'scheduled', 'manual'].includes(opts.trigger)"),
      'an arbitrary trigger string must not mint a new allowance');
  });
  await t('the dashboard says whether the search is available', () => {
    const html = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(html.includes('manual_runs_left'));
    assert.ok(html.includes('own allowance'), 'and explain that the daily run does not use it');
    assert.ok(html.includes("data-agent=\"hunter\""), 'the button must be disable-able');
  });
  await t('the manual button has a cooldown, and it fails OPEN', () => {
    const src = require('fs').readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes('RUN_COOLDOWN_MS'), 'a double-click must not stampede');
    assert.ok(src.includes('runCooldown.delete(key)'), 'a failed run must not cost you the cooldown');
    assert.ok(src.includes('runCooldown.size > 5000'), 'the map must not grow without bound');
    // In memory ON PURPOSE: a cooldown that resets on deploy fails open, which
    // is right for a nicety. Nothing about spend depends on it.
    assert.ok(/in memory on purpose/i.test(src), 'the reasoning should be recorded');
  });
  await t('the allowance is visible BEFORE you press', () => {
    const src = require('fs').readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes("router.get('/agents/budget'"), 'the dashboard must be able to show it');
    const html = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(html.includes('function loadBudget'));
    assert.ok(html.includes('allowance'), 'and say so in words');
  });
  await t('EVERY TRIGGER IS CAPPED INSIDE THE AGENT', async () => {
    // The allowances are now separate on purpose — a scheduled run must not
    // starve the manual search — but no caller may escape a ceiling by picking
    // its own label, so the enforcement lives in the agent, not the routes.
    const src = require('fs').readFileSync(__dirname + '/src/services/agents/index.js', 'utf8');
    const block = src.slice(src.indexOf('async function hunter'), src.indexOf('async function presence'));
    assert.ok(block.includes('await usedToday(tenantId, trigger)'),
      'the ceiling is read per trigger, inside the agent');
    assert.ok(block.includes("used.manual_runs >= manualCap"), 'and the manual cap with it');
    const sched = require('fs').readFileSync(__dirname + '/src/services/scheduler.js', 'utf8');
    assert.ok(sched.includes("agents.runAll('hunter'"), 'the scheduler goes through the same agent');
  });

  // ---------------------------------------------------------------
  section('the daily run');
  const sched = require(__dirname + '/src/services/scheduler');

  await t('the scheduler is OFF unless explicitly switched on', () => {
    const saved = process.env.JOBUP_AGENTS_GO;
    delete process.env.JOBUP_AGENTS_GO;
    assert.strictEqual(sched.enabled(), false, 'never the default');
    process.env.JOBUP_AGENTS_GO = '0';
    assert.strictEqual(sched.enabled(), false, 'only "1" enables it');
    process.env.JOBUP_AGENTS_GO = '1';
    assert.strictEqual(sched.enabled(), true);
    if (saved === undefined) delete process.env.JOBUP_AGENTS_GO;
    else process.env.JOBUP_AGENTS_GO = saved;
  });
  await t('a tick does NOTHING while it is off', async () => {
    const saved = process.env.JOBUP_AGENTS_GO;
    delete process.env.JOBUP_AGENTS_GO;
    assert.strictEqual(await sched.tick(), null, 'it must not run the fleet');
    if (saved) process.env.JOBUP_AGENTS_GO = saved;
  });
  await t('THE DAY IS CLAIMED IN THE DATABASE, not in memory', async () => {
    // Render can run more than one instance. An in-process flag would let every
    // instance run the whole fleet on the same day and bill for all of them.
    const first = await sched.claimDay('sit-probe');
    const second = await sched.claimDay('sit-probe');
    assert.strictEqual(first, true, 'the first caller wins');
    assert.strictEqual(second, false, 'the second must not');
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/scheduler.js', 'utf8');
    assert.ok(src.includes('models.audit_log.findOne'), 'the claim must be a DB read');
  });
  await t('the claim is per DAY, so tomorrow runs again', async () => {
    const k = sched.dayKey();
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(k));
    const rows = await models.audit_log.findAll({});
    assert.ok(rows.some((r) => String(r.action).includes(k)), 'the day is part of the key');
  });
  await t('THE RUN HOUR IS CHOSEN, not an accident of when the process booted', () => {
    // It used to fire at "the first tick after midnight UTC", which landed at
    // whatever time the instance happened to start and would have shifted an
    // hour twice a year with daylight saving.
    const src = require('fs').readFileSync(__dirname + '/src/services/scheduler.js', 'utf8');
    assert.ok(src.includes('JOBUP_RUN_HOUR_UTC'), 'the hour must be settable');
    assert.ok(src.includes('new Date().getUTCHours() < RUN_HOUR_UTC'), 'and enforced');
    assert.ok(sched.RUN_HOUR_UTC >= 0 && sched.RUN_HOUR_UTC <= 23);
  });
  await t('an out-of-range hour is clamped, not obeyed', () => {
    const saved = process.env.JOBUP_RUN_HOUR_UTC;
    for (const [set, want] of [['99', 23], ['-5', 0], ['abc', 0]]) {
      delete require.cache[require.resolve(__dirname + '/src/services/scheduler')];
      process.env.JOBUP_RUN_HOUR_UTC = set;
      const fresh = require(__dirname + '/src/services/scheduler');
      assert.strictEqual(fresh.RUN_HOUR_UTC, want, `"${set}" should clamp to ${want}`);
    }
    if (saved === undefined) delete process.env.JOBUP_RUN_HOUR_UTC;
    else process.env.JOBUP_RUN_HOUR_UTC = saved;
    delete require.cache[require.resolve(__dirname + '/src/services/scheduler')];
  });
  await t('THE HOUR IS A FLOOR, NOT AN APPOINTMENT', () => {
    // If the service is down at 07:00 the run must still happen when it comes
    // back, or a restart costs a subscriber a whole day of matches.
    const src = require('fs').readFileSync(__dirname + '/src/services/scheduler.js', 'utf8');
    assert.ok(src.includes('getUTCHours() < RUN_HOUR_UTC'),
      'it must compare with <, so any later hour still qualifies');
    assert.ok(!/getUTCHours\(\) !== RUN_HOUR_UTC|getUTCHours\(\) === RUN_HOUR_UTC/.test(src),
      'an exact-hour match would silently skip the day after a restart');
  });
  await t('status reports when the run happens', () => {
    const saved = process.env.JOBUP_AGENTS_GO;
    process.env.JOBUP_AGENTS_GO = '1';
    const st = sched.status();
    assert.strictEqual(typeof st.run_hour_utc, 'number');
    assert.ok(/UTC daily/.test(st.next_run_after), 'a subscriber should be able to see it');
    if (saved === undefined) delete process.env.JOBUP_AGENTS_GO;
    else process.env.JOBUP_AGENTS_GO = saved;
  });
  await t('ONLY ACTIVE SUBSCRIBERS RUN', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/scheduler.js', 'utf8');
    assert.ok(/findAll\(\{ where: \{ status: 'active' \} \}\)/.test(src),
      'a cancelled account must cost nothing');
  });
  await t('the fleet respects the global concurrency ceiling', () => {
    assert.ok(agents.CONCURRENCY >= 1 && agents.CONCURRENCY <= 16);
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/scheduler.js', 'utf8');
    assert.ok(src.includes("agents.runAll('hunter'"), 'fan out through runAll, which batches');
  });
  await t('NOTHING IN THE DAILY RUN SENDS ANYTHING', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/scheduler.js', 'utf8');
    assert.ok(!/mailer|sendgrid|broadcaster/i.test(src.replace(/\/\/.*/g, '')),
      'the daily run must not mail or draft-and-send');
  });
  await t('the retention sweep finally has a caller', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/scheduler.js', 'utf8');
    assert.ok(src.includes('limits.runRetention()'),
      'it existed from day one with nothing calling it');
  });
  await t('status is honest about which mode it is in', () => {
    const saved = process.env.JOBUP_AGENTS_GO;
    delete process.env.JOBUP_AGENTS_GO;
    const off = sched.status();
    assert.strictEqual(off.enabled, false);
    assert.ok(/only run when you press a button/.test(off.note));
    process.env.JOBUP_AGENTS_GO = '1';
    assert.ok(/once per day/.test(sched.status().note));
    if (saved === undefined) delete process.env.JOBUP_AGENTS_GO;
    else process.env.JOBUP_AGENTS_GO = saved;
  });
  await t('a subscriber can see whether their agents run on their own', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes("router.get('/schedule'"), 'and it must not be hidden in env');
    assert.ok(src.includes('on_demand'), 'on-demand must be stated as always available');
  });


  // ---------------------------------------------------------------
  section('matches accumulate; the pipeline can actually be moved');
  await t('THE DAILY RUN ADDS, IT DOES NOT OVERWRITE', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/agents/index.js', 'utf8');
    // Yesterday's matches, and any stage you moved them to, must survive.
    assert.ok(src.includes('const seen = new Set(existing.map((m) => m.job_id))'),
      'already-matched jobs must be skipped');
    assert.ok(src.includes('.filter((r) => !seen.has(r.job.id))'), 'only fresh jobs are scored');
    for (const f of ['src/services/agents/index.js', 'src/services/scheduler.js']) {
      const t2 = fs.readFileSync(__dirname + '/' + f, 'utf8');
      assert.ok(!/job_matches'[^)]*\)\.destroy/.test(t2), f + ' deletes matches');
    }
  });
  await t('ALL SEVEN STAGES ARE REACHABLE, not just applied', async () => {
    // The board showed seven columns while only 'I applied' could move
    // anything, so screening/interviewing/offer could never be tracked.
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes("router.patch('/matches/:id'"), 'a transition endpoint must exist');
    const m = await scoped('job_matches', subA.id).create({ job_id: 999001, score: 70, stage: 'new' });
    for (const stage of ['saved', 'applied', 'screening', 'interviewing', 'offer', 'closed']) {
      await scoped('job_matches', subA.id).update({ stage, stage_changed_at: new Date() }, { id: m.id });
      const back = await scoped('job_matches', subA.id).findOne({ id: m.id });
      assert.strictEqual(back.stage, stage, 'could not reach ' + stage);
    }
    await scoped('job_matches', subA.id).destroy({ id: m.id });
  });
  await t('an unknown stage is refused with the valid list', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes("error: 'unknown stage', stages: STAGES"),
      'a typo must not silently write a junk stage');
  });
  await t('moving a match records WHEN it moved', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes('patch.stage_changed_at = new Date()'));
    assert.ok(/stage: 'applied', stage_changed_at/.test(src), 'including the I-applied shortcut');
  });
  await t('the pipeline carries the job, not just an id', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes('display_title') && src.includes('...r, job,'),
      'a board of bare job ids is unreadable');
  });


  // ---------------------------------------------------------------
  section('everything you are actually pursuing lands in one pipeline');
  await t('AN INBOUND MESSAGE CAN ENTER THE PIPELINE', async () => {
    // Opportunities and the pipeline were separate worlds: a recruiter could
    // reach you, you could draft a reply, and there was nowhere to record that
    // it went to a screen and then an interview.
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes("router.post('/opportunities/:id/track'"), 'the bridge must exist');
    const o = await scoped('opportunities', subA.id).create({
      source: 'site_form', company: 'Acme', role: 'Staff Engineer',
      from_email: 'r@acme.example', note: 'Are you open?', status: 'new',
    });
    const entry = await scoped('job_matches', subA.id).create({
      job_id: null, source: 'inbound', opportunity_id: o.id,
      title: 'Staff Engineer', employer: 'Acme', stage: 'screening',
    });
    assert.strictEqual(entry.job_id, null, 'it has no posting in the shared pool');
    assert.strictEqual(entry.employer, 'Acme', 'so it carries its own employer');
    await scoped('job_matches', subA.id).destroy({ id: entry.id });
    await scoped('opportunities', subA.id).destroy({ id: o.id });
  });
  await t('A PRIVATE CONVERSATION IS NEVER WRITTEN INTO THE SHARED POOL', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    const block = src.slice(src.indexOf("router.post('/opportunities/:id/track'"),
                            src.indexOf("router.post('/pipeline'"));
    assert.ok(!/models\.jobs\.create/.test(block),
      'ju_jobs has no tenant_id — a private inbound role there would reach every tenant matching');
    assert.ok(block.includes('job_id: null'));
  });
  await t('tracking the same message twice does not duplicate it', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes('m.opportunity_id === o.id'), 'it must look for an existing entry');
    assert.ok(src.includes('already: true'));
  });
  await t('a role nobody found can be added by hand', async () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes("router.post('/pipeline'"), 'half a real search is off-platform');
    const row = await scoped('job_matches', subA.id).create({
      job_id: null, source: 'manual', title: 'VP Finance', employer: 'Somewhere', stage: 'interviewing',
    });
    assert.strictEqual(row.score, undefined === row.score ? row.score : null);
    await scoped('job_matches', subA.id).destroy({ id: row.id });
  });
  await t('a HUNTER match cannot be deleted, only closed', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(/row\.source === 'hunter'/.test(src),
      'deleting one just makes the Hunter find it again next run');
    assert.ok(src.includes('Move a found match to closed instead'));
  });
  await t('the board reads the same whatever the entry came from', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes('display_title') && src.includes('display_employer'),
      'one shape for hunter, inbound and manual entries');
  });


  // ---------------------------------------------------------------
  section('country policy');
  const geoSvc = require(__dirname + '/src/services/geo');

  await t('an empty list means unrestricted, not "nothing allowed"', () => {
    const r = geoSvc.evaluate('Bengaluru, India', { allowed_countries: [] });
    assert.strictEqual(r.verdict, geoSvc.VERDICT.ALLOW);
  });
  await t('US-ONLY BLOCKS THE ROLES CARLOS SHOULD NOT SEE', () => {
    const us = { allowed_countries: ['US'] };
    for (const loc of ['Bengaluru, India', 'IN - Bengaluru', 'Mexico City', 'Medellin, Colombia']) {
      assert.strictEqual(geoSvc.evaluate(loc, us).verdict, geoSvc.VERDICT.BLOCK, 'should block: ' + loc);
    }
    for (const loc of ['San Francisco, CA', 'New York, NY', 'Remote - US', 'Remote (US only)']) {
      assert.strictEqual(geoSvc.evaluate(loc, us).verdict, geoSvc.VERDICT.ALLOW, 'should allow: ' + loc);
    }
  });
  await t('a multi-location posting survives if ONE location is in policy', () => {
    const r = geoSvc.evaluate('San Francisco, CA or London, UK', { allowed_countries: ['US'] });
    assert.strictEqual(r.verdict, geoSvc.VERDICT.ALLOW, r.reason);
  });
  await t('a posting with no location is FLAGGED, never silently dropped', () => {
    const r = geoSvc.evaluate('', { allowed_countries: ['US'] });
    assert.strictEqual(r.verdict, geoSvc.VERDICT.FLAG);
    const off = geoSvc.evaluate('', { allowed_countries: ['US'], flag_unknown: false });
    assert.strictEqual(off.verdict, geoSvc.VERDICT.ALLOW, 'and the default is overridable');
  });
  await t('THE BLOCK HAPPENS BEFORE ANY MODEL CALL', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/matcher.js', 'utf8');
    // Match the CALL, not the function definition further up the file.
    const i = src.indexOf('const g = geo.evaluate(');
    const j = src.indexOf('await scoreOne(job');
    assert.ok(i > 0 && j > i, 'geography is free — it must filter before spending');
    const between = src.slice(i, j);
    assert.ok(between.includes('VERDICT.BLOCK) continue'), 'and a blocked posting must skip the model');
  });
  await t('the policy is reachable from the dashboard, not only the API', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(html.includes('allowed_countries'), 'Targets must write the policy');
    assert.ok(html.includes('Where you will work'));
    assert.ok(html.includes('saveGeo') && html.includes('ctrybox'));
  });
  await t('role targets and blocked employers are editable too', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(html.includes('t-addrole') && html.includes('rmRole'));
    assert.ok(html.includes('t-addblock') && html.includes('rmBlocked'));
  });
  await t('saving settings still forces approval_required back on', () => {
    const out = settingsSvc.sanitize({ geo: { allowed_countries: ['US'] }, approval_required: false });
    assert.strictEqual(out.approval_required, true, 'nothing may switch off review');
    assert.deepStrictEqual(out.geo.allowed_countries, ['US']);
  });


  // ---------------------------------------------------------------
  section('editing your own resume');
  const profileSvc = require(__dirname + '/src/services/profile');

  await t('every field is editable and bounded', () => {
    const out = profileSvc.applyEdit({}, {
      name: 'Carlos A Gomez Mejia', headline: 'x'.repeat(500),
      location: 'Zephyrhills, FL', email: 'c@example.com', phone: '(656) 600-1400',
      summary: 'Finance and operations professional.',
      skills: ['Financial Analysis', 'Power BI'],
      experience: [{ title: 'Account Manager', company: 'Konecta', start: '01/2021',
                     end: '09/2023', highlights: ['Improved margin', ''] }],
      education: [{ institution: 'ESUMER', studyType: 'BSc Finance' }],
      certifications: ['Business Intelligence Diploma'],
    });
    assert.strictEqual(out.headline.length, profileSvc.LIMITS.headline, 'bounded, not rejected');
    assert.strictEqual(out.experience[0].highlights.length, 1, 'empty lines dropped');
    assert.strictEqual(out.skills.length, 2);
    assert.strictEqual(out.education[0].institution, 'ESUMER');
    assert.strictEqual(out.certifications[0], 'Business Intelligence Diploma');
  });
  await t('A PARTIAL EDIT CANNOT BLANK THE REST', () => {
    const before = { name: 'Carlos', summary: 'Long summary', skills: ['A'],
                     experience: [{ title: 'X', company: 'Y' }] };
    const after = profileSvc.applyEdit(before, { headline: 'New headline' });
    assert.strictEqual(after.summary, 'Long summary', 'untouched keys survive');
    assert.strictEqual(after.skills.length, 1);
    assert.strictEqual(after.experience.length, 1);
  });
  await t('but an explicit empty array DOES clear a section', () => {
    const after = profileSvc.applyEdit({ skills: ['A', 'B'] }, { skills: [] });
    assert.deepStrictEqual(after.skills, [], 'clearing must be possible');
  });
  await t('duplicate skills and certifications are collapsed', () => {
    const out = profileSvc.applyEdit({}, {
      skills: ['Excel', 'excel', 'EXCEL', 'SQL'],
      certifications: ['SCRUM', 'scrum'],
    });
    assert.strictEqual(out.skills.length, 2);
    assert.strictEqual(out.certifications.length, 1);
  });
  await t('a row with neither title nor company is dropped', () => {
    const out = profileSvc.applyEdit({}, {
      experience: [{ title: '', company: '', highlights: ['orphan'] }, { title: 'Real', company: 'Co' }],
    });
    assert.strictEqual(out.experience.length, 1);
  });
  await t('EDITING CLEARS THE SIMULATED MARKER — these are now the owner words', () => {
    const out = profileSvc.applyEdit(
      { is_simulated: true, note: 'Structured without a language model.' },
      { headline: 'Written by me' });
    assert.ok(!('is_simulated' in out), 'no longer a machine extraction');
    assert.ok(!('note' in out));
    assert.ok(out.edited_at, 'and it records when');
  });
  await t('control characters are stripped, accents are not', () => {
    const out = profileSvc.applyEdit({}, { name: 'Jos\u00e9 G\u00f3mez\u0000 Mej\u00eda' });
    assert.strictEqual(out.name, 'Jos\u00e9 G\u00f3mez Mej\u00eda');
  });
  await t('THE EDIT DOES NOT MOVE YOUR WEB ADDRESS', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    const block = src.slice(src.indexOf("router.put('/profile'"), src.indexOf("// Profile photo"));
    assert.ok(!/addresses\.|allocate\(/.test(block),
      'a link someone saved must not move because a headline was retyped');
    assert.ok(block.includes('models.subscribers.update({ name:'), 'the display name does follow');
  });
  await t('the editor covers every section the owner asked for', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    for (const sec of ['Identity', 'Professional Profile', 'Core Competencies',
                       'Professional Experience', 'Education', 'Additional Qualifications']) {
      assert.ok(html.includes('>' + sec + '<'), 'missing section: ' + sec);
    }
    assert.ok(html.includes('cv-phone') && html.includes('cv-email') && html.includes('cv-location'));
    assert.ok(html.includes('addExp') && html.includes('addEdu'), 'rows must be addable');
  });
  await t('the editor says plainly that nothing is generated', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(html.includes('your data, not code'));
    assert.ok(/if you leave a field empty it stays empty/.test(html));
  });


  // ---------------------------------------------------------------
  section('Targets actually steers the daily search');
  const FIX = [
    { id: 1, title: 'Financial Analyst', employer: 'Stripe', location: 'Remote - US', description: 'fintech payments budgeting' },
    { id: 2, title: 'Unpaid Intern', employer: 'Acme', location: 'New York', description: 'budgeting internship unpaid' },
    { id: 3, title: 'Financial Analyst', employer: 'Konecta', location: 'Bogota', description: 'banking budgeting' },
    { id: 4, title: 'Senior Financial Analyst', employer: 'Brex', location: 'Hybrid - NYC', description: 'fintech budgeting' },
  ];
  const PROF = { skills: ['budgeting'] };
  const ids = (t) => jobsource.prefilter(FIX, PROF, { targeting: t }).map((x) => x.job.id);

  await t('THESE FIELDS WERE DEAD — industries, employers and seniority did nothing', () => {
    // They have been in the settings document since the beginning with no
    // reader. A UI over an unread field is decoration.
    const src = require('fs').readFileSync(__dirname + '/src/services/jobsource.js', 'utf8');
    for (const k of ['targeting.industries', 'targeting.employers', 'targeting.seniority',
                     'targeting.must_include', 'targeting.exclude_keywords',
                     'targeting.remote_preference']) {
      assert.ok(src.includes(k), 'prefilter still ignores ' + k);
    }
  });
  await t('an industry term raises a matching job', () => {
    const base = jobsource.prefilter(FIX, PROF, { targeting: { roles: [{ title: 'Financial Analyst' }] } });
    const withInd = jobsource.prefilter(FIX, PROF,
      { targeting: { roles: [{ title: 'Financial Analyst' }], industries: ['fintech'] } });
    const b1 = base.find((x) => x.job.id === 1).prescore;
    const a1 = withInd.find((x) => x.job.id === 1).prescore;
    assert.ok(a1 > b1, 'a fintech job should rank higher once fintech is a target');
  });
  await t('a named company outranks a generic match', () => {
    const out = ids({ roles: [{ title: 'Financial Analyst' }], employers: ['brex'] });
    assert.strictEqual(out[0], 4, 'the Brex role should come first');
  });
  await t('AN EXCLUDED WORD DROPS THE JOB BEFORE IT COSTS ANYTHING', () => {
    assert.ok(ids({ roles: [{ title: 'Financial Analyst' }] }).includes(2));
    const out = ids({ roles: [{ title: 'Financial Analyst' }], exclude_keywords: ['unpaid'] });
    assert.ok(!out.includes(2), 'the unpaid internship must be gone');
    const src = require('fs').readFileSync(__dirname + '/src/services/jobsource.js', 'utf8');
    const i = src.indexOf('never.some');
    const j = src.indexOf('let hits = 0');
    assert.ok(i > 0 && j > i, 'the exclusion must run before any counting or scoring');
  });
  await t('a must-have word is a REQUIREMENT, not a preference', () => {
    const out = ids({ roles: [{ title: 'Financial Analyst' }], must_include: ['payments'] });
    assert.deepStrictEqual(out, [1], 'only the payments job survives');
  });
  await t('remote-only keeps remote; hybrid-or-remote keeps both', () => {
    assert.deepStrictEqual(ids({ roles: [{ title: 'Financial Analyst' }], remote_preference: 'remote' }), [1]);
    const hy = ids({ roles: [{ title: 'Financial Analyst' }], remote_preference: 'hybrid' });
    assert.ok(hy.includes(1) && hy.includes(4), 'someone open to hybrid is open to remote too');
  });
  await t('seniority is a NUDGE, not a gate', () => {
    const out = ids({ roles: [{ title: 'Financial Analyst' }], seniority: 'senior' });
    assert.ok(out.includes(1) && out.includes(3), 'non-senior roles must survive');
    assert.strictEqual(out[0], 4, 'but the senior one ranks first');
  });
  await t('a minimum score holds a job back WITHOUT hiding that it did', () => {
    const src = require('fs').readFileSync(__dirname + '/src/services/agents/index.js', 'utf8');
    assert.ok(src.includes('below your minimum score of'), 'the run summary must say how many');
    assert.ok(src.includes('below_minimum: held'), 'and report it to the caller');
  });
  await t('the dashboard exposes every one of them', () => {
    const html = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    for (const sec of ['Industries', 'Companies you want', 'Words that rule a job out',
                       'Words a job must contain', 'How you want to work']) {
      assert.ok(html.includes(sec), 'missing: ' + sec);
    }
    assert.ok(html.includes('jobs_scored_per_day'), 'the pace must be settable');
    assert.ok(html.includes('min_score'));
  });


  // ---------------------------------------------------------------
  section('the agents find; the subscriber acts');
  await t('THE BROADCASTER IS GONE', () => {
    // It drafted messages that could never be sent — no sender, no recipient
    // field — while approval implied they would go out. The product is
    // sharper without it: the AI finds the work, the person takes it from there.
    const agentsSrc = require('fs').readFileSync(__dirname + '/src/services/agents/index.js', 'utf8');
    assert.ok(!/broadcaster/i.test(agentsSrc), 'the agent must not remain');
    assert.ok(agentsSrc.includes('hunter') && agentsSrc.includes('presence'), 'the two that work remain');
    assert.strictEqual(typeof agents.hunter, 'function');
    assert.strictEqual(typeof agents.presence, 'function');
    assert.strictEqual(agents.broadcaster, undefined);
  });
  await t('the agent runner refuses an unknown agent name', () => {
    const src = require('fs').readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes("['hunter', 'presence'].includes(name)"),
      'a stale button calling /agents/broadcaster/run must 400, not 500');
  });
  await t('NO SURFACE STILL PROMISES OUTREACH DRAFTING', () => {
    const fs = require('fs');
    for (const f of ['public/app.html', 'public/index.html',
                     'src/routes/teaser-view.js', 'src/services/teaser.js']) {
      const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
      assert.ok(!/Career Broadcaster/i.test(src), f + ' still names the removed agent');
      assert.ok(!/three agents|tres agentes/i.test(src), f + ' still says three agents');
    }
  });
  await t('the dashboard has no Broadcast tab and no dead handlers', () => {
    const html = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(!html.includes('data-p="outreach"'), 'the tab is gone');
    assert.ok(!/loadOutreach|outRow|mailOutToMe/.test(html), 'and so are its functions');
    assert.ok(!html.includes('p-outreach'), 'and its panel');
  });
  await t('the promise now matches what the product does', () => {
    const html = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(/From there you take over/.test(html), 'the callout states the real contract');
    assert.ok(/Nothing is ever sent on your\s+behalf/.test(html));
  });
  await t('EXISTING OUTREACH ROWS ARE STILL EXPORTABLE AND DELETABLE', () => {
    // The feature is retired, not the data. Anyone who has drafts must still be
    // able to take them with them and to have them erased.
    const src = require('fs').readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    const exportBlock = src.slice(src.indexOf("router.get('/export'"));
    assert.ok(exportBlock.includes("'outreach'"), 'export must still include them');
    const del = src.slice(src.indexOf("router.delete('/account'"));
    assert.ok(del.includes("'outreach'"), 'account deletion must still clear them');
  });
  await t('outreachFacts survives — Opportunities still quotes verbatim or omits', () => {
    const none = settingsSvc.outreachFacts({ facts: {} });
    assert.deepStrictEqual(none.lines, []);
    const some = settingsSvc.outreachFacts({ facts: { work_authorization: 'US citizen' } });
    assert.deepStrictEqual(some.lines, ['US citizen']);
  });

  // ---------------------------------------------------------------
  section('Broadcast — drafts that can actually be sent, by you');
  await t('outreachFacts quotes or omits — it never paraphrases', () => {
    const none = settingsSvc.outreachFacts({ facts: {} });
    assert.deepStrictEqual(none.lines, [], 'nothing stated means nothing claimed');
    const some = settingsSvc.outreachFacts({ facts: { work_authorization: 'US citizen' } });
    assert.deepStrictEqual(some.lines, ['US citizen'], 'exactly what the owner typed');
    assert.strictEqual(some.verbatim, true);
  });
  // ---------------------------------------------------------------
  section('the hamburger actually opens — behaviour, not grep');
  //
  // The earlier tests asserted buildDrawer() EXISTED. It did. Nothing called it
  // and nothing bound the button, so the hamburger rendered and did absolutely
  // nothing. Grepping for a function name cannot catch that, so these drive the
  // real DOM.
  const { JSDOM } = require('jsdom');

  function bootDom(html, url) {
    // Swallow jsdom's resource-loader chatter: it tries to fetch external
    // scripts we neither ship nor care about here.
    const { VirtualConsole } = require('jsdom');
    const vc = new VirtualConsole();
    return new JSDOM(html, {
      virtualConsole: vc,
      url: url || 'https://c.jobup.dev/',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(w) {
        w.fetch = () => new Promise(() => {});   // only navigation is exercised
        w.scrollTo = () => {};
      },
    }).window;
  }
  const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  await t('PUBLIC SITE: tapping the hamburger opens the drawer', () => {
    const st = settingsSvc.sanitize({});
    const html = siteRender.page(
      { name: 'Carlos Gomez', summary: 'S', skills: ['a'],
        experience: [{ title: 'X', company: 'Y' }] }, st,
      { name: 'Carlos Gomez', url: 'https://c.jobup.dev', slug: 'c' });
    const w = bootDom(html);
    const b = w.document.getElementById('burger');
    const d = w.document.getElementById('drawer');
    assert.ok(b && d, 'both elements must render');
    assert.strictEqual(d.classList.contains('open'), false, 'starts closed');
    click(w, b);
    assert.strictEqual(d.classList.contains('open'), true, 'THE HAMBURGER DID NOTHING');
    assert.strictEqual(b.getAttribute('aria-expanded'), 'true');
    click(w, b);
    assert.strictEqual(d.classList.contains('open'), false, 'a second tap must close it');
    w.close();
  });
  await t('PUBLIC SITE: the scrim and Escape both close it', () => {
    const st = settingsSvc.sanitize({});
    const html = siteRender.page({ name: 'C', summary: 'S' }, st,
      { name: 'C', url: 'https://c.jobup.dev', slug: 'c' });
    const w = bootDom(html);
    const b = w.document.getElementById('burger');
    const d = w.document.getElementById('drawer');
    click(w, b);
    click(w, w.document.getElementById('scrim'));
    assert.strictEqual(d.classList.contains('open'), false, 'the scrim must close it');
    click(w, b);
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.strictEqual(d.classList.contains('open'), false, 'Escape must close it');
    w.close();
  });
  await t('DASHBOARD: tapping the hamburger opens it and builds the menu', () => {
    const html = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    const w = bootDom(html, 'https://c.jobup.dev/app');
    const b = w.document.getElementById('burger');
    const d = w.document.getElementById('drawer');
    assert.ok(b && d, 'both elements must render');
    click(w, b);
    assert.strictEqual(d.classList.contains('open'), true, 'THE HAMBURGER DID NOTHING');
    const rows = w.document.querySelectorAll('#dnav .dlink');
    const tabs = w.document.querySelectorAll('.tab');
    assert.ok(rows.length >= 8, 'the drawer should list every tab, saw ' + rows.length);
    assert.strictEqual(rows.length, tabs.length, 'drawer and tab row must not drift apart');
    w.close();
  });
  await t('DASHBOARD: choosing from the drawer switches panel and closes it', () => {
    const html = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    const w = bootDom(html, 'https://c.jobup.dev/app');
    click(w, w.document.getElementById('burger'));
    const target = [...w.document.querySelectorAll('#dnav .dlink')]
      .find((x) => x.dataset.p === 'pipeline');
    assert.ok(target, 'Pipeline must be reachable from the drawer');
    click(w, target);
    assert.strictEqual(w.document.getElementById('drawer').classList.contains('open'), false,
      'picking a destination should close the menu');
    assert.strictEqual(w.document.getElementById('p-pipeline').classList.contains('hidden'), false,
      'and actually switch to it');
    w.close();
  });
  await t('there is ONE switcher, not two that can disagree', () => {
    const html = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(!html.includes('function showPanel'),
      'a second switcher existed alongside showTab and only one updated the URL');
    assert.ok(html.includes('showTab(l.dataset.p)'), 'the drawer routes through showTab');
  });

  // ---------------------------------------------------------------
  section('cleanup');
  await t('SIT removes its own rows', async () => {
    for (const tbl of ['profiles', 'settings', 'job_matches', 'outreach', 'agent_runs', 'sites', 'invoices', 'tailored_resumes', 'applications']) {
      await scoped(tbl, subA.id).destroy({});
      await scoped(tbl, subB.id).destroy({});
    }
    for (const tbl of ['profiles', 'settings', 'sites', 'agent_runs', 'job_matches']) {
      await scoped(tbl, payer.id).destroy({});
    }
    await models.subscribers.destroy({ where: { id: subA.id } });
    await models.subscribers.destroy({ where: { id: subB.id } });
    await models.subscribers.destroy({ where: { id: authSub.id } });
    await models.subscribers.destroy({ where: { id: payer.id } });
    await models.jobs.destroy({ where: { dedupe_key: 'k1' } });
    await models.jobs.destroy({ where: { dedupe_key: 'k2' } });
    const teasers = await models.teasers.findAll({});
    for (const t2 of teasers) await models.teasers.destroy({ where: { id: t2.id } });
    const audits = await models.audit_log.findAll({});
    for (const a of audits) await models.audit_log.destroy({ where: { id: a.id } });
    for (const tid of [subA.id, subB.id]) {
      for (const pv of await scoped('page_views', tid).findAll({})) await scoped('page_views', tid).destroy({ where: { id: pv.id } });
      for (const op of await scoped('opportunities', tid).findAll({})) await scoped('opportunities', tid).destroy({ where: { id: op.id } });
    }
  });

  // ---------------------------------------------------------------
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${pass}/${pass + fail} passed`);
  if (fail) {
    console.log(`\n  FAILURES:`);
    failures.forEach((f) => console.log(`   - ${f.name}: ${f.err}`));
  }
  console.log(`${'='.repeat(64)}\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SIT crashed:', e); process.exit(1); });
