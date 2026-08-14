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
  section('social media image poster — the eight constraints');
  {
    const poster = require(__dirname + '/src/services/social-poster');
    const socialRules = require(__dirname + '/src/services/social-rules');
    const cryptoSvc = require(__dirname + '/src/services/crypto');
    const T = poster.PLATFORM_TENANT;
    const IMG = 'https://jobup.dev/marketing/launch.jpg';

    // Point the connectors at a local stub so nothing in SIT can reach Meta.
    const http = require('http');
    let graphCalls = [];
    let graphMode = 'ok';
    const graph = http.createServer((rq, rs) => {
      let body = ''; rq.on('data', (c) => body += c);
      rq.on('end', () => {
        graphCalls.push({ path: rq.url.split('?')[0], body });
        rs.setHeader('Content-Type', 'application/json');
        if (graphMode === 'permission') {
          rs.statusCode = 403;
          return rs.end(JSON.stringify({ error: { message: 'permission denied', code: 200 } }));
        }
        if (graphMode === 'transient') {
          rs.statusCode = 500;
          return rs.end(JSON.stringify({ error: { message: 'temporarily unavailable', code: 2 } }));
        }
        if (/media_publish/.test(rq.url)) return rs.end(JSON.stringify({ id: 'ig_media_1' }));
        if (/\/media$/.test(rq.url)) return rs.end(JSON.stringify({ id: 'ig_container_1' }));
        if (/permalink/.test(rq.url) || rq.method === 'GET') {
          return rs.end(JSON.stringify({ id: 'x', permalink: 'https://instagram.com/p/REAL' }));
        }
        return rs.end(JSON.stringify({ id: 'photo_1', post_id: 'page_1_post_1' }));
      });
    });
    await new Promise((r) => graph.listen(0, r));
    process.env.JOBUP_GRAPH_BASE = `http://127.0.0.1:${graph.address().port}`;
    process.env.JOBUP_FB_RATE_DELAY_MS = '0';
    process.env.JOBUP_IG_RATE_DELAY_MS = '0';
    delete require.cache[require.resolve(__dirname + '/src/services/social-connectors')];
    delete require.cache[require.resolve(__dirname + '/src/services/social-rules')];
    delete require.cache[require.resolve(__dirname + '/src/services/social-poster')];
    const poster2 = require(__dirname + '/src/services/social-poster');

    const TOKEN = 'EAAsecrettokenvalue1234567890';
    const mk = (over) => models.social_accounts.create(Object.assign({
      tenant_id: T, name: 'SIT Page', platform: 'facebook_page',
      account_or_page_id: '111', access_token_enc: cryptoSvc.encrypt(TOKEN), enabled: true,
    }, over));

    const fbPage = await mk({ name: 'SIT FB Page' });
    const ig = await mk({ name: 'SIT Instagram', platform: 'instagram', account_or_page_id: '222' });
    const group = await mk({ name: 'SIT HOA Group', platform: 'facebook_group', account_or_page_id: '333' });
    const noTok = await mk({ name: 'SIT No Token', access_token_enc: null });
    const expired = await mk({ name: 'SIT Expired', token_expires_at: new Date(Date.now() - 86400000) });
    const untouched = await mk({ name: 'SIT MUST NOT BE TOUCHED', account_or_page_id: '999' });

    await t('the token is encrypted at rest and never stored in the clear', async () => {
      const row = await models.social_accounts.findOne({ where: { id: fbPage.id } });
      assert.ok(row.access_token_enc.startsWith('v1:'), 'stored value must be a ciphertext envelope');
      assert.ok(!row.access_token_enc.includes(TOKEN), 'the raw token must not appear in the column');
      assert.strictEqual(cryptoSvc.decrypt(row.access_token_enc), TOKEN, 'and it must round-trip');
    });

    await t('CONSTRAINT 3: it never touches a destination outside the supplied list', async () => {
      graphCalls = [];
      const out = await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp finds you jobs.',
        destination_ids: [fbPage.id] });
      assert.strictEqual(out.posts.length, 1, 'exactly one destination was asked for');
      assert.strictEqual(out.posts[0].destination_name, 'SIT FB Page');
      // The decisive check: the account id of the untouched destination must
      // never appear in any call that reached the platform.
      assert.ok(!graphCalls.some((c) => c.path.includes('999')),
        'a destination not in the request was contacted');
    });

    await t('CONSTRAINT 1: nothing is fabricated when the platform is unreachable', async () => {
      graphMode = 'permission';
      const out = await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.',
        destination_ids: [fbPage.id] });
      graphMode = 'ok';
      const p = out.posts[0];
      assert.strictEqual(p.status, 'failed');
      assert.strictEqual(p.post_id, null, 'a failed post must not carry an id');
      assert.strictEqual(p.post_url, null, 'nor a url');
      assert.strictEqual(p.posted_at, null, 'nor a timestamp');
      assert.ok(p.failure_reason, 'and it must say why');
    });

    await t('CONSTRAINT 1: a posted result carries ONLY what the platform returned', async () => {
      const out = await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.',
        destination_ids: [fbPage.id, ig.id] });
      const fb = out.posts.find((p) => p.destination_name === 'SIT FB Page');
      const insta = out.posts.find((p) => p.destination_name === 'SIT Instagram');
      assert.strictEqual(fb.status, 'posted');
      assert.strictEqual(fb.post_id, 'page_1_post_1', 'the id must be the one the API returned');
      assert.strictEqual(insta.post_id, 'ig_media_1');
      // Instagram's permalink came from a real lookup, not from the id.
      assert.strictEqual(insta.post_url, 'https://instagram.com/p/REAL');
      assert.ok(Date.parse(fb.posted_at) > 0, 'posted_at is a real timestamp');
    });

    await t('CONSTRAINT 8: a missing or expired credential is a failure, never an attempt', async () => {
      graphCalls = [];
      const out = await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.',
        destination_ids: [noTok.id, expired.id] });
      assert.strictEqual(out.summary.posted, 0);
      assert.strictEqual(out.summary.failed, 2);
      assert.ok(/no access token/i.test(out.posts[0].failure_reason));
      assert.ok(/expired/i.test(out.posts[1].failure_reason));
      assert.strictEqual(graphCalls.length, 0, 'no call may be made without a live credential');
    });

    await t('A FACEBOOK GROUP IS SKIPPED WITH THE REASON, NOT SILENTLY FAILED', async () => {
      // Meta removed the Groups API from all versions on 2024-04-22, so the
      // spec's assumption that HOA groups are reachable is not true. The agent
      // says so instead of reporting a post that never happened.
      graphCalls = [];
      const out = await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.',
        destination_ids: [group.id] });
      const p = out.posts[0];
      assert.strictEqual(p.status, 'skipped');
      assert.strictEqual(p.post_id, null);
      assert.match(p.failure_reason, /Groups API/i);
      assert.match(p.failure_reason, /2024-04-22/);
      assert.strictEqual(graphCalls.length, 0, 'it must not even try');
    });

    await t('CONSTRAINT 6: the same image never goes to one destination twice in a run', async () => {
      graphCalls = [];
      const out = await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.',
        destination_ids: [fbPage.id, fbPage.id, fbPage.id] });
      assert.strictEqual(out.summary.posted, 1, 'only the first attempt may post');
      assert.strictEqual(out.summary.skipped, 2);
      assert.strictEqual(graphCalls.filter((c) => c.path.includes('/photos')).length, 1,
        'the platform must be called once, not three times');
    });

    await t('CONSTRAINT 5: captions are TRUNCATED, never rewritten', () => {
      const long = 'JobUp finds you jobs. '.repeat(400);   // over Instagram's 2200
      const r = socialRules.adaptCaption(long, 'instagram');
      assert.ok(r.truncated);
      assert.ok(r.text.length <= socialRules.forPlatform('instagram').caption_max);
      // Every character must have come from the input — a prefix plus an ellipsis.
      const body = r.text.replace(/…$/, '');
      assert.ok(long.startsWith(body), 'the adapted caption must be a prefix of the original');
      // Nothing invented: no word appears that was not in the source.
      const src = new Set(long.toLowerCase().match(/[a-z]+/g));
      for (const w of (body.toLowerCase().match(/[a-z]+/g) || [])) {
        assert.ok(src.has(w), `adaptation introduced a word that was not supplied: ${w}`);
      }
    });

    await t('CONSTRAINT 4: there is no image processing anywhere in this vertical', () => {
      const fs = require('fs');
      // The image is handed to the platform as a URL and is never opened, so
      // "never alter the image" is guaranteed by there being no code that could.
      for (const f of ['social-poster.js', 'social-connectors.js', 'social-rules.js']) {
        const src = fs.readFileSync(`${__dirname}/src/services/${f}`, 'utf8');
        for (const lib of ['sharp', 'jimp', 'canvas', 'gm(', 'imagemagick']) {
          assert.ok(!src.includes(lib), `${f} must not process images (found ${lib})`);
        }
      }
      // sharp IS a dependency of the monorepo, used by other verticals. What
      // matters is that nothing in this agent's path requires it, or reads the
      // image bytes at all — the URL is handed to the platform untouched.
      for (const f of ['social-poster.js', 'social-connectors.js', 'social-rules.js']) {
        const src = fs.readFileSync(`${__dirname}/src/services/${f}`, 'utf8');
        const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]);
        for (const r of requires) {
          assert.ok(!/sharp|jimp|canvas|image/i.test(r),
            `${f} requires ${r}, which could alter the image`);
        }
        assert.ok(!/readFile|createReadStream/.test(src),
          `${f} reads a file — the image must only ever be passed on as a URL`);
      }
    });

    await t('CONSTRAINT 7: no token or secret ever appears in the output', async () => {
      const out = await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.',
        destination_ids: [fbPage.id, ig.id, group.id, noTok.id, expired.id] });
      const blob = JSON.stringify(out);
      assert.ok(!blob.includes(TOKEN), 'the access token leaked into the result');
      assert.ok(!blob.includes('access_token'), 'no credential field may appear');
      assert.ok(!/EAA[A-Za-z0-9]{10,}/.test(blob), 'no token-shaped string may appear');
    });

    await t('CONSTRAINT 2: the result is EXACTLY the declared shape', async () => {
      const out = await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.',
        destination_ids: [fbPage.id] });
      assert.deepStrictEqual(Object.keys(out).sort(),
        ['campaign_id', 'image_reference', 'posts', 'run_timestamp', 'summary']);
      assert.deepStrictEqual(Object.keys(out.posts[0]).sort(),
        ['account_or_page_id', 'caption_posted', 'destination_name', 'failure_reason',
         'platform', 'post_id', 'post_url', 'posted_at', 'status']);
      assert.deepStrictEqual(Object.keys(out.summary).sort(),
        ['failed', 'posted', 'skipped', 'total_destinations']);
      assert.ok(['facebook', 'instagram', 'other'].includes(out.posts[0].platform),
        'platform must be one of the three the schema allows');
      assert.ok(['posted', 'failed', 'skipped'].includes(out.posts[0].status));
      // The internal bookkeeping fields must not survive into the output.
      assert.ok(!('_account_id' in out.posts[0]) && !('_attempts' in out.posts[0]));
    });

    await t('the retry fires ONCE on a transient error and never on a refusal', async () => {
      graphCalls = []; graphMode = 'transient';
      await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.', destination_ids: [fbPage.id] });
      const transientCalls = graphCalls.filter((c) => c.path.includes('/photos')).length;
      assert.strictEqual(transientCalls, 2, 'a transient failure gets exactly one retry');

      graphCalls = []; graphMode = 'permission';
      await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.', destination_ids: [fbPage.id] });
      const refusalCalls = graphCalls.filter((c) => c.path.includes('/photos')).length;
      assert.strictEqual(refusalCalls, 1, 'a permission refusal must NOT be retried');
      graphMode = 'ok';
    });

    await t('per-destination image validation rejects what a platform cannot accept', async () => {
      // A PNG Facebook takes happily is rejected by Instagram's publishing API.
      const out = await poster2.run({ tenant_id: T, image: { url: 'https://jobup.dev/a.png' },
        caption: 'JobUp.', destination_ids: [fbPage.id, ig.id] });
      const fb = out.posts.find((p) => p.platform === 'facebook');
      const insta = out.posts.find((p) => p.platform === 'instagram');
      assert.strictEqual(fb.status, 'posted', 'Facebook accepts png');
      assert.strictEqual(insta.status, 'failed');
      assert.match(insta.failure_reason, /format \.png/);
      // And a non-https url is refused everywhere, since Meta must fetch it.
      const insecure = await poster2.run({ tenant_id: T, image: { url: 'http://jobup.dev/a.jpg' },
        caption: 'JobUp.', destination_ids: [fbPage.id] });
      assert.match(insecure.posts[0].failure_reason, /https/);
    });

    await t('a dry run validates and sends NOTHING', async () => {
      graphCalls = [];
      const out = await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.',
        destination_ids: [fbPage.id, ig.id], dry_run: true });
      assert.strictEqual(out.summary.posted, 0);
      assert.strictEqual(out.summary.skipped, 2);
      assert.strictEqual(graphCalls.length, 0, 'a dry run must not call the platform');
    });

    await t('every run is persisted with a row per destination', async () => {
      const out = await poster2.run({ tenant_id: T, image: { url: IMG }, caption: 'JobUp.',
        destination_ids: [fbPage.id, group.id] });
      const camp = await models.social_campaigns.findOne({ where: { campaign_id: out.campaign_id } });
      assert.ok(camp, 'the run must be recorded');
      assert.deepStrictEqual(camp.result.summary, out.summary);
      const rows = await models.social_posts.findAll({ where: { campaign_id: out.campaign_id } });
      assert.strictEqual(rows.length, 2, 'one row per destination attempt');
      assert.ok(!JSON.stringify(rows).includes(TOKEN), 'no token in the stored rows either');
    });

    await t('the social tables are tenant-scoped like every other table', () => {
      const { TENANT_SCOPED, SCHEMA } = require(__dirname + '/src/models');
      for (const tbl of ['social_accounts', 'social_copy', 'social_campaigns', 'social_posts']) {
        assert.ok(SCHEMA[tbl], `${tbl} must exist`);
        assert.ok(SCHEMA[tbl].tenant_id, `${tbl} must carry tenant_id`);
        assert.ok(TENANT_SCOPED.has(tbl), `${tbl} must be tenant-scoped`);
      }
    });

    // Clean up after ourselves.
    for (const a of [fbPage, ig, group, noTok, expired, untouched]) {
      await models.social_accounts.destroy({ where: { id: a.id } });
    }
    await models.social_campaigns.destroy({ where: { tenant_id: T } });
    await models.social_posts.destroy({ where: { tenant_id: T } });
    graph.close();
  }

  await t('A NEW COLUMN ON AN EXISTING TABLE MUST BE REGISTERED FOR ALTER', () => {
    const { SCHEMA, ADDED_COLUMNS, TABLE_PREFIX } = require(__dirname + '/src/models');
    // sync({alter:false}) never adds a column to a table that already exists, so
    // a field added to SCHEMA alone is invisible to Postgres and every INSERT
    // naming it fails outright. That is exactly what the referral columns did.
    const registered = new Set(ADDED_COLUMNS.map(([t, c]) => `${t}.${c}`));
    const LONG_LIVED = ['subscribers', 'profiles', 'settings', 'invoices', 'teasers'];
    const BASELINE = {   // columns that existed when the table was first created
      subscribers: ['id', 'email', 'name', 'phone', 'language', 'password_hash',
        'email_verified_at', 'address', 'status', 'stripe_customer_id',
        'stripe_subscription_id', 'current_period_end', 'created_at'],
    };
    for (const table of LONG_LIVED) {
      const base = BASELINE[table];
      if (!base) continue;
      for (const col of Object.keys(SCHEMA[table])) {
        if (base.includes(col)) continue;
        assert.ok(registered.has(`${TABLE_PREFIX}${table}.${col}`),
          `${table}.${col} is in SCHEMA but not in ADDED_COLUMNS — Postgres will not have it`);
      }
    }
  });

  section('referrals — profit sharing that only pays on real money');
  {
    const referrals = require(__dirname + '/src/services/referrals');
    const mk = (over) => models.subscribers.create(Object.assign({
      email: `sit-ref-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`,
      name: 'SIT Ref', status: 'active', activation: 'paid',
    }, over));

    let alice; let bob;
    await t('every subscriber gets a shareable code, stable across calls', async () => {
      alice = await mk({ name: 'SIT Alice' });
      const c1 = await referrals.codeFor(alice.id);
      const c2 = await referrals.codeFor(alice.id);
      assert.ok(c1 && c1.length >= 6, 'a code must be generated');
      assert.strictEqual(c1, c2, 'the code must not regenerate — a shared link has to keep working');
      // No 0/O/1/I: a referral code gets read aloud and typed by hand.
      assert.ok(!/[01OIL]/.test(c1), `ambiguous characters in ${c1}`);
      assert.ok(referrals.shareUrl(c1).endsWith('/r/' + c1), 'the share url is the magic link');
    });

    await t('SELF-REFERRAL IS REFUSED', async () => {
      const code = await referrals.codeFor(alice.id);
      const r = await referrals.attachOnSignup(alice, code);
      assert.strictEqual(r.ok, false, 'referring yourself must not create a referral');
      assert.match(r.reason, /self-referral/i);
      const rows = await models.referrals.findAll({ where: { referee_tenant_id: alice.id } });
      assert.strictEqual(rows.length, 0, 'and it must leave no row behind');
    });

    await t('a signup creates a PENDING referral and NO commission', async () => {
      bob = await mk({ name: 'SIT Bob' });
      const code = await referrals.codeFor(alice.id);
      const r = await referrals.attachOnSignup(bob, code);
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      const row = await models.referrals.findOne({ where: { referee_tenant_id: bob.id } });
      assert.strictEqual(row.status, 'pending');
      assert.strictEqual(row.commission_cents || 0, 0,
        'a signup on its own must never be worth money');
      // Both the code and the resolved referrer are kept, so a dispute is checkable.
      const fresh = await models.subscribers.findOne({ where: { id: bob.id } });
      assert.strictEqual(fresh.referred_by_tenant, alice.id);
      assert.strictEqual(fresh.referred_by_code, code);
    });

    await t('a second code cannot steal an already-attributed signup', async () => {
      const carol = await mk({ name: 'SIT Carol' });
      const carolCode = await referrals.codeFor(carol.id);
      const r = await referrals.attachOnSignup(bob, carolCode);
      assert.strictEqual(r.ok, false);
      assert.match(r.reason, /already attributed/);
      await models.subscribers.destroy({ where: { id: carol.id } });
    });

    await t('COMMISSION IS BORN FROM A PAID INVOICE, AND ONLY FROM ONE', async () => {
      const before = await models.referrals.findOne({ where: { referee_tenant_id: bob.id } });
      assert.strictEqual(before.status, 'pending');

      // An UNPAID invoice must change nothing.
      const unpaid = await models.invoices.create({
        tenant_id: bob.id, amount_cents: 5900, status: 'past_due' });
      const noGo = await referrals.qualifyFromInvoice(unpaid);
      assert.strictEqual(noGo.ok, false, 'an unpaid invoice must not create a commission');

      const paid = await models.invoices.create({
        tenant_id: bob.id, amount_cents: 5900, status: 'paid', paid_at: new Date() });
      const go = await referrals.qualifyFromInvoice(paid);
      assert.strictEqual(go.ok, true, JSON.stringify(go));
      // The figure traces to what was CHARGED, not to the list price.
      assert.strictEqual(go.invoice_cents, 5900);
      assert.strictEqual(go.commission_cents, Math.round(5900 * referrals.PCT));

      const after = await models.referrals.findOne({ where: { referee_tenant_id: bob.id } });
      assert.strictEqual(after.status, 'qualified');
      assert.strictEqual(after.invoice_id, paid.id, 'the qualifying invoice must be recorded');
    });

    await t('the same invoice cannot pay a commission twice', async () => {
      const row = await models.referrals.findOne({ where: { referee_tenant_id: bob.id } });
      const inv = await models.invoices.findOne({ where: { id: row.invoice_id } });
      const again = await referrals.qualifyFromInvoice(inv);
      assert.strictEqual(again.ok, false, 'a qualified referral must not re-qualify');
      assert.match(again.reason, /already qualified/);
    });

    await t('A FREE_TEST REFEREE EARNS NOBODY ANYTHING', async () => {
      // The obvious fraud: sign up through your own link on a free activation.
      const dave = await mk({ name: 'SIT Dave', activation: 'free_test' });
      await referrals.attachOnSignup(dave, await referrals.codeFor(alice.id));
      const inv = await models.invoices.create({
        tenant_id: dave.id, amount_cents: 5900, status: 'paid', paid_at: new Date() });
      const r = await referrals.qualifyFromInvoice(inv);
      assert.strictEqual(r.ok, false, 'an account that never paid must not qualify');
      const row = await models.referrals.findOne({ where: { referee_tenant_id: dave.id } });
      assert.strictEqual(row.status, 'void');
      assert.strictEqual(row.commission_cents || 0, 0);
      await models.invoices.destroy({ where: { tenant_id: dave.id } });
      await models.referrals.destroy({ where: { referee_tenant_id: dave.id } });
      await models.subscribers.destroy({ where: { id: dave.id } });
    });

    await t('a referrer sees their earnings but NOT who their referees are', async () => {
      const stats = await referrals.statsFor(alice.id);
      assert.ok(stats.code && stats.share_url, 'they need their link');
      assert.strictEqual(stats.qualified, 1);
      assert.strictEqual(stats.owed_usd, Number(((5900 * referrals.PCT) / 100).toFixed(2)));
      // The invitee's identity is not the referrer's to see.
      const blob = JSON.stringify(stats);
      assert.ok(!blob.includes(bob.email), 'a referee email must not leak to the referrer');
      assert.ok(!blob.includes('SIT Bob'), 'nor their name');
    });

    await t('"mark paid" RECORDS a settlement, it does not send money', async () => {
      const fs = require('fs');
      const src = fs.readFileSync(__dirname + '/src/services/referrals.js', 'utf8');
      // There are no payout rails in this repo. A function that looked like it
      // paid would be the worst possible lie in a money feature.
      assert.ok(!/stripe|paypal|transfer|payout_method/i.test(src.replace(/\*[\s\S]*?\*\//g, '')),
        'nothing here may look like it moves money');
      const row = await models.referrals.findOne({ where: { referee_tenant_id: bob.id } });
      const r = await referrals.markPaidOut(row.id, 'sit@example.com', 'paid by bank transfer');
      assert.strictEqual(r.ok, true);
      const after = await models.referrals.findOne({ where: { id: row.id } });
      assert.strictEqual(after.status, 'paid_out');
      assert.ok(after.paid_out_at, 'and when');
      assert.match(after.note, /sit@example\.com/, 'and who recorded it');
    });

    await t('the owner ledger totals only what is genuinely owed', async () => {
      const led = await referrals.ledger();
      assert.ok(led.totals.total >= 1);
      // Paid-out and void rows must not still read as owed.
      const owed = led.referrals.filter((r) => r.status === 'qualified')
        .reduce((a, r) => a + r.commission_usd, 0);
      assert.strictEqual(led.totals.owed_usd, Number(owed.toFixed(2)));
      assert.match(led.note, /does not send money/i, 'the ledger must say what it is not');
    });

    await t('an unknown code earns nobody anything, and never 500s', async () => {
      const r = await referrals.attachOnSignup(bob, 'ZZZZZZZZ');
      assert.strictEqual(r.ok, false);
      const click = await referrals.recordClick('ZZZZZZZZ', { headers: {}, ip: '1.2.3.4' });
      assert.strictEqual(click.ok, false, 'an unknown code logs no click');
    });

    await t('a click is logged without ever storing a raw IP', async () => {
      const code = await referrals.codeFor(alice.id);
      await referrals.recordClick(code, { headers: { 'user-agent': 'SIT' }, ip: '203.0.113.9' });
      const clicks = await models.referral_clicks.findAll({ where: { tenant_id: alice.id } });
      assert.ok(clicks.length >= 1);
      const blob = JSON.stringify(clicks);
      assert.ok(!blob.includes('203.0.113.9'), 'a raw IP must never be stored');
      assert.ok(clicks[0].ip_hash && clicks[0].ip_hash.length >= 16, 'only a salted hash');
    });

    // clean up
    await models.referral_clicks.destroy({ where: { tenant_id: alice.id } });
    await models.referrals.destroy({ where: { tenant_id: alice.id } });
    await models.invoices.destroy({ where: { tenant_id: bob.id } });
    for (const x of [alice, bob]) await models.subscribers.destroy({ where: { id: x.id } });
  }

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
    await t('THE GROWTH PLAN IS A REAL PLAN, NOT FILLER', () => {
    const planSvc = require(__dirname + '/src/services/plan');
    assert.ok(planSvc.TASKS.length >= 60, 'a six-month plan needs real substance');
    const ids = planSvc.TASKS.map((t) => t.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'ids must be unique or ticks collide');
    // Every task must say who does it. An agent cannot open a Reddit account,
    // and a plan that pretends otherwise wastes the owner's week.
    for (const t of planSvc.TASKS) {
      assert.ok(['you', 'me'].includes(t.owner), `task ${t.id} has no owner`);
      assert.ok(t.text && t.text.length > 12, `task ${t.id} is filler`);
    }
    assert.ok(planSvc.TASKS.some((t) => t.owner === 'me'), 'some of it must be buildable');
    assert.ok(planSvc.TASKS.some((t) => t.owner === 'you'), 'and some can only be done by a human');
    // Month 1 day by day; the later months weekly.
    assert.ok(planSvc.TASKS.filter((t) => t.kind === 'day').length >= 30, 'month 1 must be daily');
    assert.ok(planSvc.TASKS.filter((t) => t.kind === 'week').length >= 20, 'months 2-6 must be covered');
  });
  await t('THE PLAN PROMISES WHAT IT CAN AND REFUSES WHAT IT CANNOT', () => {
    const fs = require('fs');
    const planSvc = require(__dirname + '/src/services/plan');
    // The owner asked for a plan that makes the product go viral in six months.
    // No plan can promise that, and saying so on the dashboard itself — not in
    // a footnote — is the difference between a tool and a horoscope.
    assert.ok(/cannot/i.test(Object.keys(planSvc.PROMISE).join(' ')), 'there must be a "cannot"');
    assert.match(planSvc.PROMISE.cannot, /viral/i, 'and it must name virality specifically');
    assert.ok(planSvc.PROMISE.gate, 'the blocking phase must be stated');
    const html = fs.readFileSync(__dirname + '/public/plan.html', 'utf8');
    assert.ok(html.includes('promise.cannot') || html.includes("d.promise.cannot"),
      'the dashboard must render the "cannot" as prominently as the "can"');
  });
  await t('ticking a task persists, and an unknown id cannot inflate progress', async () => {
    const notify = require(__dirname + '/src/services/admin-notify');
    const planSvc = require(__dirname + '/src/services/plan');
    const actor = 'sit-plan@example.com';
    await notify.setState('plan_progress', { done: {} }, actor);
    const first = planSvc.TASKS[0].id;
    await notify.setState('plan_progress', { done: { [first]: new Date().toISOString(),
      'not-a-real-task': new Date().toISOString() } }, actor);
    const st = await notify.getState('plan_progress', actor);
    // Progress counts only ids that exist in the plan, so a stray key cannot
    // make the bar read higher than the work actually done.
    const complete = planSvc.TASKS.filter((t) => st.done[t.id]).length;
    assert.strictEqual(complete, 1, 'an unknown id must not count toward progress');
    await notify.setState('plan_progress', { done: {} }, actor);
  });
  await t('the plan dashboard lives INSIDE the console PWA scope', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    const html = fs.readFileSync(__dirname + '/public/plan.html', 'utf8');
    // Outside /subscribers-admin/ the installed app would kick out to a browser
    // tab when the link is tapped.
    assert.ok(src.includes("'/subscribers-admin/plan'"), 'the route must sit under the console path');
    assert.ok(html.includes('{{BASE}}/subscribers-admin/manifest.webmanifest'),
      'and it must claim the same manifest');
    assert.ok(src.includes("'/plan.html': '/subscribers-admin/plan'"),
      'a direct .html hit must redirect, or the raw template leaks');
    const console_ = fs.readFileSync(__dirname + '/public/subscribers-admin.html', 'utf8');
    assert.ok(console_.includes('{{BASE}}/subscribers-admin/plan'), 'the console must link to it');
  });
  await t('THE CONSOLE IS ITS OWN INSTALLED APP, NOT THE SUBSCRIBER ONE', () => {
    const pwaL = require(__dirname + '/src/services/pwa');
    for (const base of ['', '/jobup']) {
      const sub = pwaL.manifest(base);
      const adm = pwaL.adminManifest(base);
      // Installing from /subscribers-admin must not put the SUBSCRIBER
      // dashboard on the home screen under the wrong name.
      assert.notStrictEqual(adm.id, sub.id, 'the two installs need distinct identities');
      assert.ok(adm.start_url.includes('/subscribers-admin'), 'it must open the console');
      // The console deliberately wears the JOBUP MARK, at the owner's request.
      // An earlier build gave it a separate roster icon so the two apps could be
      // told apart on one home screen; the owner installs the console and not
      // the subscriber app, so that distinction bought nothing. `id` is what
      // keeps the two installs separate, and it still differs.
      assert.ok(adm.icons.every((i) => !i.src.includes('admin-icon')),
        'the console uses the JobUp mark, not a separate admin icon');
      assert.ok(adm.icons.some((i) => i.src.includes('icon-512.png')), 'and a 512 to install with');
      assert.ok(adm.icons.some((i) => i.purpose === 'maskable'), 'maskable for Android');
      // The trailing-slash trap: a start_url outside its own scope opens in a
      // browser tab instead of the app.
      const startPath = new URL('https://x' + adm.start_url).pathname;
      assert.ok(startPath.startsWith(adm.scope),
        `start_url ${startPath} is outside scope ${adm.scope}`);
    }
  });
  await t('the console worker is scoped to the console, and never caches /api/', () => {
    const pwaL = require(__dirname + '/src/services/pwa');
    const sw = pwaL.adminServiceWorker('/jobup');
    assert.ok(!sw.includes('__BASE__') && !sw.includes('__CACHE__') && !sw.includes('__V__'),
      'tokens must be substituted');
    assert.ok(sw.includes("includes('/api/')"), 'a billing register must never render from cache');
    assert.ok(!/addAll\(SHELL\)/.test(sw), 'addAll is atomic — one 404 would leave no worker at all');
    assert.ok(sw.includes('setAppBadge'), 'the push handler is what puts the number on the icon');
    assert.ok(sw.includes('showNotification'),
      'iOS drops a silent push and eventually revokes permission, so it is not optional');
    assert.ok(!sw.includes('admin-icon'), 'the worker must reference the shipped JobUp icons');
  });
  await t('THE BADGE COUNTS REAL ROWS, NOT A STORED COUNTER', async () => {
    const notify = require(__dirname + '/src/services/admin-notify');
    const actor = 'sit-badge@example.com';
    await notify.markSeen(actor);
    const before = await notify.newCountFor(actor);
    assert.strictEqual(before.count, 0, 'just-seen means zero');

    const s1 = await models.subscribers.create({ email: `sit-badge-${Date.now()}@example.com`, name: 'SIT Badge' });
    const after = await notify.newCountFor(actor);
    assert.strictEqual(after.count, 1, 'a new subscriber raises the count');
    assert.ok(after.newest.some((n) => n.id === s1.id), 'and names who');

    // A counter that drifts from the table is worse than no badge: deleting the
    // row must drop the count, which only holds if it is derived.
    await models.subscribers.destroy({ where: { id: s1.id } });
    const gone = await notify.newCountFor(actor);
    assert.strictEqual(gone.count, 0, 'the count is derived from rows, not incremented');
  });
  await t('one admin clearing the badge does NOT clear another admin’s', async () => {
    const notify = require(__dirname + '/src/services/admin-notify');
    const a = 'sit-a@example.com'; const b = 'sit-b@example.com';
    await notify.markSeen(a); await notify.markSeen(b);
    const s1 = await models.subscribers.create({ email: `sit-two-${Date.now()}@example.com`, name: 'SIT Two' });
    await notify.markSeen(a);
    assert.strictEqual((await notify.newCountFor(a)).count, 0, 'A read it');
    assert.strictEqual((await notify.newCountFor(b)).count, 1, 'B has not, and still sees it');
    await models.subscribers.destroy({ where: { id: s1.id } });
  });
  await t('VAPID KEYS GENERATE THEMSELVES — the badge needs no configuration', async () => {
    const notify = require(__dirname + '/src/services/admin-notify');
    const st = await notify.status();
    assert.ok(st.push_available, 'web-push must be installed');
    assert.ok(st.vapid_public_key, 'a keypair must exist without anyone setting an env var');
    assert.ok(['generated', 'database', 'env'].includes(st.vapid_source));
    // Stable across calls, or every device would need to re-subscribe.
    const again = await notify.publicKey();
    assert.strictEqual(again, st.vapid_public_key, 'the key must not regenerate per call');
  });
  await t('A PUSH SUBSCRIPTION IS NEVER HANDED BACK OUT', async () => {
    const fs = require('fs');
    const notify = require(__dirname + '/src/services/admin-notify');
    const endpoint = `https://push.example.com/sit-${Date.now()}`;
    await notify.saveSubscription('sit@example.com',
      { endpoint, keys: { p256dh: 'SECRETKEYMATERIAL', auth: 'SECRETAUTH' } }, 'SIT');
    const st = await notify.status();
    const blob = JSON.stringify(st);
    assert.ok(!blob.includes('SECRETKEYMATERIAL') && !blob.includes(endpoint),
      'anyone holding the endpoint can push to that device — it must not be readable');
    // And no route may return them.
    const src = fs.readFileSync(__dirname + '/src/routes/subscribers-admin.js', 'utf8');
    assert.ok(!/res\.json\([^)]*admin_push_subs/.test(src), 'no endpoint may return subscriptions');
    await notify.removeSubscription(endpoint);
  });
  await t('mobile: the console is installable and thumb-sized', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/subscribers-admin.html', 'utf8');
    const css = html.replace(/\s+/g, '');
    assert.ok(html.includes('rel="manifest" href="{{BASE}}/subscribers-admin/manifest.webmanifest"'),
      'it must link its OWN manifest, not the subscriber one');
    assert.ok(html.includes('apple-mobile-web-app-capable'), 'iOS standalone');
    assert.ok(css.includes('input,select{font-size:16px}'), 'under 16px iOS zooms the page on focus');
    assert.ok(css.includes('min-height:44px'), '44px is the smallest reliably tappable target');
    assert.ok(css.includes('thead{display:none}'),
      'a ten-column table on a phone is a horizontal-scroll trap, not a report');
    assert.ok(html.includes('env(safe-area-inset'), 'it must clear the notch and home indicator');
  });
  await t('NO CONSOLE PAGE CALLS A FUNCTION IT NEVER DEFINES', () => {
    const fs = require('fs');
    // jpost() was copied into subscribers-admin.html from the social console
    // and never defined there. It threw inside enablePush's promise chain,
    // where a catch-all swallowed it — so the device was never registered for
    // push while the card cheerfully reported "Badge is on" — and it threw
    // synchronously in the test handler, leaving the button on "Sending…"
    // forever. A page-local helper that does not exist is invisible until a
    // human taps the exact button.
    const BROWSER = new Set(['fetch','setTimeout','setInterval','clearTimeout','clearInterval',
      'alert','confirm','prompt','atob','btoa','encodeURIComponent','decodeURIComponent',
      'parseInt','parseFloat','isNaN','String','Number','Boolean','Array','Object','JSON',
      'Date','Math','Promise','Error','URL','URLSearchParams','Uint8Array','Set','Map',
      'require','matchMedia','addEventListener','removeEventListener','postMessage','if',
      'for','while','switch','catch','return','function','typeof','new','else','do',
      // Keywords, not calls. `if`/`for`/`catch` were already here; the rest were
      // missing, so a plain `var (` read as a call to a function named var.
      'var','let','const','await','delete','void','in','of','case','yield','throw','with',
      // Browser globals Node has no equivalent for.
      'requestAnimationFrame','cancelAnimationFrame','getComputedStyle','structuredClone',
      'queueMicrotask','IntersectionObserver','MutationObserver','ResizeObserver',
      'Audio','Image','FormData','Headers','Request','Response','AbortController',
      'Notification','SpeechSynthesisUtterance','WebSocket','Worker','Blob','FileReader']);
    for (const f of ['subscribers-admin.html', 'social-admin.html', 'app.html', 'index.html']) {
      const html = fs.readFileSync(`${__dirname}/public/${f}`, 'utf8');
      const scriptSrc = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => m[1]).join('\n');
      // STRIP IN ONE PASS, NOT AS CHAINED REGEXES.
      //
      // The chained version stripped line comments BEFORE strings, so the '//'
      // inside any string literal — every https:// url on the page — ate the
      // rest of that line and desynchronised every quote after it. The symptom
      // was a list of "undefined" functions that were plainly defined two
      // screens up (showTab, api, boot), which reads as a real bug and is not
      // one. A tokenizer cannot desynchronise this way.
      const stripped = (function (src) {
        let out = ''; let i = 0;
        const n = src.length;
        while (i < n) {
          const c = src[i], d = src[i + 1];
          if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; out += ' '; continue; }
          if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; out += ' '; continue; }
          if (c === "'" || c === '"' || c === '`') {
            const q = c; i++;
            while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
            i++; out += q + q; continue;
          }
          // REGEX LITERALS MUST BE SKIPPED TOO. esc() is written
          // .replace(/[&<>"']/g, ...) on every one of these pages, and those
          // quote characters inside the character class opened a phantom string
          // that swallowed the next few hundred lines — hiding the definitions
          // of api, showTab, boot and reporting them as undefined.
          if (c === '/') {
            // A '/' is a regex only where a value may begin; after a value it
            // is division. Look back at the last significant character.
            let k = out.length - 1;
            while (k >= 0 && /\s/.test(out[k])) k--;
            const prev = k >= 0 ? out[k] : '';
            if (prev === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prev)) {
              i++; let cls = false;
              while (i < n) {
                const r = src[i];
                if (r === '\\') { i += 2; continue; }
                if (r === '[') cls = true;
                else if (r === ']') cls = false;
                else if (r === '/' && !cls) break;
                else if (r === '\n') break;      // not a regex after all
                i++;
              }
              i++; out += ' '; continue;
            }
          }
          out += c; i++;
        }
        return out;
      }(scriptSrc));
      const defined = new Set([
        ...[...stripped.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]),
        ...[...stripped.matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\()/g)].map((m) => m[1]),
        // PARAMETERS ARE BINDINGS TOO. browserSpeak(n, done) calls done() — a
        // callback passed in, not a missing global. Without these the scanner
        // reports every callback-style helper as undefined, and a test that
        // cries wolf gets muted, which costs more than it ever saves.
        ...[...stripped.matchAll(/function\s*[\w$]*\s*\(([^)]*)\)/g)]
          .flatMap((m) => m[1].split(',')
            .map((x) => x.trim().replace(/=.*$/, '').trim())
            .filter((x) => /^[A-Za-z_$][\w$]*$/.test(x))),
      ]);
      // Only bare calls at statement/expression level — not obj.method(...).
      const called = new Set([...stripped.matchAll(/(^|[^.\w$])([a-z][\w$]{2,})\s*\(/g)].map((m) => m[2]));
      const missing = [...called].filter((n) => !defined.has(n) && !BROWSER.has(n)
        && !(typeof globalThis[n] === 'function'));
      assert.deepStrictEqual(missing, [], `${f} calls undefined function(s): ${missing.join(', ')}`);
    }
  });
  await t('"BADGE IS ON" MEANS SUBSCRIBED, NOT MERELY PERMITTED', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/subscribers-admin.html', 'utf8');
    // Permission granted with no subscription stored on the server is a device
    // nothing can ever be pushed to. It reported itself as working.
    assert.ok(html.includes('function pushRegistered'), 'the page must check for a real subscription');
    assert.ok(/pushRegistered\(\)\.then/.test(html), 'and gate the green state on it');
    assert.ok(html.includes('Almost — finish connecting'), 'the half-connected state needs its own message');
    // And failures must surface rather than being swallowed.
    assert.ok(/return \{ ok:false, why:/.test(html), 'enablePush must report WHY it failed');
    assert.ok(html.includes("'Could not turn the badge on: '"), 'and the card must show it');
  });
  await t('A TEST PUSH PUTS A NUMBER ON THE ICON', () => {
    const fs = require('fs');
    const sw = fs.readFileSync(__dirname + '/public/sw-admin.js', 'utf8');
    const svc = fs.readFileSync(__dirname + '/src/services/admin-notify.js', 'utf8');
    // The first version sent the REAL count, which is 0 when nothing is new —
    // and 0 means clearAppBadge. The test therefore proved delivery and nothing
    // else, and the icon stayed blank exactly as reported.
    assert.ok(/badge: opts\.test \? Math\.max\(count, 1\) : count/.test(svc),
      'a test must carry a badge value of at least 1');
    assert.ok(/const badge = Number\(data\.badge/.test(sw),
      'the worker must paint `badge`, not the raw count');
    assert.ok(/if \(badge > 0\) await self\.navigator\.setAppBadge\(badge\)/.test(sw),
      'and set it from that value');
    // Honest about what the number means.
    assert.ok(sw.includes('This is a test'), 'the notification must say it is a demonstration');
  });
  await t('AN INSTALLED APP CANNOT SIT ON A STALE WORKER', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/subscribers-admin.html', 'utf8');
    // A PWA keeps its cached service worker unless told otherwise. That is why
    // a fixed push handler never reached the phone, and iOS fell back to its
    // own generic "Notification" because the old worker showed none.
    assert.ok(/updateViaCache: 'none'/.test(html), 'the worker must not be served from cache');
    assert.ok(/reg\.update\(\)/.test(html), 'and an update must be requested on every load');
  });
  await t('a test push is VISIBLE even when the count is zero', () => {
    const fs = require('fs');
    const sw = fs.readFileSync(__dirname + '/public/sw-admin.js', 'utf8');
    const svc = fs.readFileSync(__dirname + '/src/services/admin-notify.js', 'utf8');
    // A silent push is dropped by iOS and repeated silent pushes cost the site
    // its permission — and a test that shows nothing at zero cannot be told
    // apart from a broken one.
    assert.ok(/count > 0 \|\| data\.test/.test(sw), 'a test must render even at zero');
    assert.ok(sw.includes('Badge test'), 'and say that it is a test');
    assert.ok(svc.includes('test: Boolean(opts.test)'), 'the flag must reach the payload');
    const html = fs.readFileSync(__dirname + '/public/subscribers-admin.html', 'utf8');
    assert.ok(html.includes('No device is registered for push yet'),
      '"sent to 0 devices" must not read as success');
  });
  await t('THE BADGE CARD TELLS THE TRUTH ABOUT WHY IT IS OFF', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/subscribers-admin.html', 'utf8');
    // Every state an operator can actually be in gets its own message. Telling
    // an iPhone user in Safari to "allow notifications" sends them round a loop
    // that cannot succeed — iOS badges installed web apps only.
    for (const state of ['Add to Home Screen first', 'Badge is on', 'Badge blocked',
                         'Badge is off', 'Badge not available in this browser']) {
      assert.ok(html.includes(state), `the card must handle the "${state}" case`);
    }
    assert.ok(/IS_IOS && !STANDALONE/.test(html),
      'the iOS-not-installed case must be detected, not lumped in with "off"');
    assert.ok(html.includes("perm === 'denied'"),
      'a blocked permission needs its own instructions, not the enable button');
    // And a way to prove it end to end without waiting for a real signup.
    assert.ok(html.includes("jpost('/push/test'"), 'there must be a test that exercises the real chain');
  });
  await t('the badge clears by READING the list, not a separate button', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/subscribers-admin.html', 'utf8');
    assert.ok(/render\(\);\s*\n\s*\/\/[^\n]*\n\s*markSeen\(\);/.test(html),
      'seen must fire once the rows are actually on screen');
    assert.ok(html.includes('visibilitychange'),
      'coming back to the app must refresh the count without waiting for a poll tick');
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
    for (const tab of ['Analytics', 'Job Matches', 'Opportunities',
                       'Pipeline', 'Getting job matches', 'Getting found', 'My CV', 'Settings']) {
      assert.ok(html.includes('>' + tab), 'missing tab: ' + tab);
    }
    assert.ok(!html.includes('>Today'), 'Today was removed — it carried nothing of its own');
    // The two guides are a PAIR and must stay adjacent: one decides which jobs
    // reach you, the other whether recruiters reach you. Split apart they read
    // as unrelated screens.
    assert.ok(/data-p="targets">Getting job matches<\/button>\s*<button class="tab" data-p="guide">/
      .test(html), 'the two guides must sit next to each other');
    // Removing a tab must not remove a capability: 'Search for jobs now' was
    // the only manual agent run in the product and lived on Today.
    assert.ok(html.includes('data-agent="hunter"') && /runAgent\(\\?'hunter\\?'\)/.test(html),
      'the manual hunt must survive');
    assert.ok(html.includes('id="budget"'), 'and its budget line with it');
    assert.ok(html.includes("$('p-analytics').innerHTML=html") && /Your agents/.test(html),
      'the agent card must now render inside Analytics, which is the landing tab');
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
    // try/finally, because a bare restore after a failing assert never runs:
    // JOBUP_BILLING_DISABLED then leaks into every later test and one real
    // failure is reported as three.
    try {
      assert.strictEqual(billingSvc.disabled(), true);
      assert.strictEqual(billingSvc.freeActivation(), true, 'nothing can be charged, so nothing is');
      // The stamp is decided in ONE place now — there are three of them
      // (no_billing, stripe_test, paid) and a route picking with its own
      // ternary was how a test-mode row would have been recorded as revenue.
      assert.strictEqual(billingSvc.activationStamp(), 'no_billing',
        'accounts built without payment must be stamped');
      const src = require('fs').readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
      assert.ok(src.includes('billing.activationStamp()'),
        'the route must ask billing rather than decide the stamp itself');
    } finally {
      if (_keep === undefined) delete process.env.JOBUP_BILLING_DISABLED;
      else process.env.JOBUP_BILLING_DISABLED = _keep;
    }
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
    // The invariant is that the figure is TEMPLATED, not that the markup around
    // it never changes — the span now carries an i18n key so ' / year' can
    // become ' / año'. Asserting the exact byte string made a legitimate
    // translation look like a regression.
    assert.ok(/\$\{\{PRICE\}\}<span[^>]*> \/ year<\/span>/.test(html),
      'the pricing card must be templated, not hardcoded');
    assert.ok(!/\$\d+<span> \/ year/.test(html), 'a hardcoded price is back on the landing page');
    // The rendered page must carry the figure billing actually charges.
    const rendered = pwaSvc.page('index.html', '');
    assert.ok(new RegExp(`\\$${billingSvc.PRICE_USD}<span[^>]*> / year</span>`).test(rendered),
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

  // ---- SUBSCRIBING IS REACHABLE FROM ANYWHERE ON THE PAGE -----------------
  // Somebody genuinely failed to subscribe because the only button sat below
  // eight screens of preview. These assertions are about that person.
  section('the subscribe button is findable');

  await t('the teaser carries a CTA at the top, the middle, the bottom and pinned', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    // top and middle are drawn by strip(); bottom and sticky are literal markup.
    for (const where of ['top', 'middle']) {
      assert.ok(src.includes(`strip('${where}'`), `no ${where} subscribe button`);
    }
    for (const where of ['bottom', 'sticky']) {
      assert.ok(src.includes(`data-cta="${where}"`), `no ${where} subscribe button`);
    }
    assert.ok(src.includes('data-cta="\'+where+\'"'),
      'strip() must stamp the placement onto the button it draws');
    assert.ok(src.includes('id="stickybuy"'), 'the pinned bar must exist in the shell');
    assert.ok(/body\.hasbuy \.wrap\{padding-bottom/.test(src),
      'the pinned bar must reserve its own room or it covers the last screen');
  });

  await t('all four buttons are ONE code path to ONE checkout', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    const calls = (src.match(/billing\/checkout/g) || []).length;
    assert.strictEqual(calls, 1,
      'a second checkout call is a second funnel that can drift from the first');
    // Wired by class, so a button added later cannot get its own behaviour.
    assert.ok(src.includes("querySelectorAll('.cta')"),
      'buttons must be bound by class, not one id at a time');
  });

  await t('four buttons cannot mint four Stripe sessions', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(src.includes('CTA_BUSY') && src.includes('if(CTA_BUSY)return;'),
      'a second tap while the first request is in flight must be refused');
    assert.ok(src.includes('function ctaBusy'), 'and every button locks together');
  });

  await t('the price is resolved once, so no two buttons can disagree', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(src.includes('var CTA_LABEL=') && src.includes('var PRICE_HTML='),
      'label and price must be computed once for every placement');
    // "/ year" may appear ONCE, in the T table. Anywhere else is a second
    // English string that a Spanish page would print untranslated.
    assert.strictEqual((src.match(/' \/ year'/g) || []).length, 1,
      'the period must come from T.perYear, not a repeated literal');
    assert.strictEqual((src.match(/T\.perYear/g) || []).length, 2,
      'both the pinned bar and screen 8 read the same period string');
    // Payment off must still not print "$null / year" anywhere.
    assert.ok(src.includes('c.price_usd?') && src.includes('T.freePrice'),
      'a price is shown only when there is one');
  });

  await t('a failed checkout is visible from the button that was pressed', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    // The old message printed at the foot of screen 8. Anyone who tapped the
    // top of the page never scrolled to it and just saw nothing happen.
    assert.ok(src.includes('function toast(') && src.includes('toast(msg)'),
      'the error has to surface where the eye already is');
    assert.ok(src.includes('id="toast"'), 'and the element must exist in the shell');
  });

  await t('the pinned bar steps aside for the real CTA', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(src.includes('IntersectionObserver') && src.includes("getElementById('buy')"),
      'showing the same button twice at once is noise');
    assert.ok(src.includes("if(!target||!('IntersectionObserver' in window))return;"),
      'without an observer the bar must stay up rather than vanish');
  });

  await t('the new subscribe copy speaks Spanish too', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    // The file writes accents as \uXXXX escapes, which Node resolves inside the
    // template literal — so test what the BROWSER receives, not the source.
    const shipped = src.replace(/\\u([0-9a-fA-F]{4})/g,
      (_, h) => String.fromCharCode(parseInt(h, 16)));
    assert.ok(shipped.includes("ctaPaid:'Crear mi ecosistema'"), 'ES label missing');
    assert.ok(shipped.includes(' / año'), 'ES period missing its tilde');
    assert.ok(shipped.includes('¿Ya lo tienes claro?'), 'ES mid-page prompt missing');
    assert.ok(shipped.includes('contraseña'), 'ES pinned-bar note missing its tilde');
  });

  await t('the account form can be submitted from three places, and one handler', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/public/build.html', 'utf8');
    for (const where of ['middle', 'bottom', 'sticky']) {
      assert.ok(src.includes(`data-go="${where}"`), `no ${where} submit button`);
    }
    assert.strictEqual((src.match(/addEventListener\('submit'/g) || []).length, 1,
      'three buttons, one submit handler — validation must not be duplicated');
    assert.ok(src.includes('function submitForm') && src.includes('requestSubmit'),
      'the pinned button forwards to the form rather than POSTing itself');
    assert.ok(src.includes("$('go').click()"), 'with a fallback for older Safari');
  });

  await t('the three submit buttons can never disagree about being disabled', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/public/build.html', 'utf8');
    assert.ok(src.includes('function setGo('), 'one setter for all of them');
    // An enabled pinned button beside a disabled bottom one is a duplicate
    // account attempt waiting to happen.
    assert.ok(!/\$\('go'\)\.disabled\s*=/.test(src),
      'nothing may set a single button\'s disabled state directly');
    assert.ok(!/\$\('go'\)\.textContent\s*=/.test(src),
      'nor relabel one button on its own');
  });

  await t('the pinned bar says what is missing instead of failing silently', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/public/build.html', 'utf8');
    assert.ok(src.includes('function hint('), 'the bar must explain itself');
    assert.ok(src.includes('at least 12 characters') && src.includes('Ready to build'),
      'both the blocked and the ready state');
    assert.ok(src.includes('lockHint('),
      'an invalid link or an existing account must override the password hint');
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
  // Was: 'the policy is reachable from the dashboard'. The policy is no longer
  // a policy — the hunt is US only and nothing in the product can express
  // otherwise, so a country control ON the dashboard would be a lie. What must
  // stay reachable is the statement of where it searches; see
  // 'MATCHES: the hunt is US only, and nothing can widen it' for the enforcement.
  await t('the dashboard states where it searches, without offering a choice', () => {
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(/Searching <strong>United States<\/strong>/.test(html),
      'the tab must SAY it searches the US — a silent restriction reads as a bug');
    assert.ok(!html.includes('Where you will work'), 'and must not offer a country picker');
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

  section('an outage must not be permanent, and must not be invisible');

  await t('the sweep repairs a degraded profile and republishes it', async () => {
    const heal = require(__dirname + '/src/services/self-heal');
    const SRC = [
      'Juliana Gramowski', 'Sales Executive and Business Development',
      'Tampa, Florida  (813) 334-2244  jgramowski7@gmail.com',
      'Sales Executive, Clear Channel Outdoor, January 2024 to Present',
    ].join('\n');
    const sub = await models.subscribers.create({
      email: 'sit-heal@example.com', status: 'active', activation: 'paid' });
    const good = await models.subscribers.create({
      email: 'sit-heal-ok@example.com', status: 'active', activation: 'paid' });
    try {
      // Exactly the shape the outage left behind: a name, nothing else, and
      // the full source text sitting right there unused.
      await scoped('profiles', sub.id).create({
        resume_json: { name: 'A Person', experience: [], skills: [], is_simulated: true },
        source_text: SRC,
      });
      // A profile structured WITH the model is not ours to touch — a human's
      // own edits look identical to a good parse.
      await scoped('profiles', good.id).create({
        resume_json: { name: 'Edited By Hand', experience: [], skills: [], is_simulated: false },
        source_text: SRC,
      });

      const p = await heal.pending();
      assert.ok(p.tenant_ids.includes(sub.id), 'the degraded one must be found');
      assert.ok(!p.tenant_ids.includes(good.id), 'a good parse must NEVER be overwritten');
      assert.ok(p.degraded_paying >= 1, 'and paying accounts counted separately');

      // With no key the sweep must decline rather than burn the cap producing
      // the same thin result over and over.
      const r = await heal.sweep();
      assert.strictEqual(r.ran, false);
      assert.match(r.reason, /no model configured|unreachable/);
    } finally {
      await models.profiles.destroy({ where: { tenant_id: sub.id } });
      await models.profiles.destroy({ where: { tenant_id: good.id } });
      await models.subscribers.destroy({ where: { id: sub.id } });
      await models.subscribers.destroy({ where: { id: good.id } });
    }
  });

  await t('it refuses to heal what it cannot re-read', async () => {
    const heal = require(__dirname + '/src/services/self-heal');
    // No source text means the difference could only be invented, which is the
    // one unacceptable outcome.
    assert.strictEqual(heal.needsHealing({ resume_json: { is_simulated: true }, source_text: '' }), false);
    assert.strictEqual(heal.needsHealing({ resume_json: { is_simulated: true }, source_text: 'x'.repeat(80) }), true);
    assert.strictEqual(heal.needsHealing({ resume_json: { is_simulated: false }, source_text: 'x'.repeat(80) }), false);
  });

  await t('the sweep runs every tick, not once a day', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/scheduler.js', 'utf8');
    const heal = src.indexOf("require('./self-heal')");
    const hour = src.indexOf('before the run hour');
    assert.ok(heal > -1 && hour > -1);
    // A frozen profile is live and wrong every minute it exists. Waiting for
    // the daily hour would have left a paying subscriber's page empty for
    // another twenty hours.
    assert.ok(heal < hour, 'self-heal must run BEFORE the once-a-day gate');
    assert.ok(/JOBUP_SELFHEAL_MAX/.test(fs.readFileSync(__dirname + '/src/services/self-heal.js', 'utf8')),
      'and be capped so an ended outage is not a thousand calls in one tick');
  });

  await t('an outage is VISIBLE to the owner, not discovered by a customer', () => {
    const fs = require('fs');
    const idx = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    assert.ok(idx.includes('degraded_profiles'), '/health must count degraded profiles');
    const con = fs.readFileSync(__dirname + '/src/routes/subscribers-admin.js', 'utf8');
    assert.ok(con.includes('degraded_profiles') && con.includes('last_failure'),
      'the console session must carry both the model state and the damage');
    const page = fs.readFileSync(__dirname + '/public/subscribers-admin.html', 'utf8');
    assert.ok(page.includes('id="brainbanner"') && page.includes('id="degradedbanner"'),
      'and both must render as banners');
    assert.ok(/PAYING/.test(page), 'a paying subscriber being affected must be called out');
  });

  section('a paid profile must never inherit a degraded parse');

  // Juliana Gramowski's real CV, in the shape that broke: a banner on line one,
  // her name on line two, and a phone in brackets.
  const JULIANA = [
    'SALES EXECUTIVE · BUSINESS DEVELOPMENT',
    'Juliana Gramowski',
    'Sales Executive · Business Development · Marketing Strategist',
    'Results-oriented sales executive with 10+ years generating new business.',
    'Tampa, Florida  (813) 334-2244  jgramowski7@gmail.com',
    'Sales Executive, Clear Channel Outdoor, Tampa Florida, January 2024 to Present',
  ].join('\n');

  await t('LINE ONE IS NOT ALWAYS THE NAME', async () => {
    const r = require(__dirname + '/src/services/resume');
    const out = await r.structure(JULIANA);
    const p = out.profile;
    // This shipped to a paying subscriber: the banner in the name field and
    // her actual name demoted to the headline.
    assert.notStrictEqual(p.name, 'SALES EXECUTIVE · BUSINESS DEVELOPMENT',
      'a banner line must not be read as somebody\'s name');
    assert.strictEqual(p.name, 'Juliana Gramowski');
    assert.notStrictEqual(p.headline, p.name, 'the headline must not repeat the name');
  });

  await t('a bracketed phone keeps its bracket', async () => {
    const r = require(__dirname + '/src/services/resume');
    const out = await r.structure(JULIANA);
    // The old pattern started at a DIGIT, so "(813) 334-2244" was stored as
    // "813) 334-2244" — a stray bracket on a live public profile.
    assert.ok(!/^\d+\)/.test(out.profile.phone || ''),
      `phone lost its opening bracket: ${out.profile.phone}`);
    assert.ok(String(out.profile.phone || '').includes('334-2244'));
    assert.strictEqual(out.profile.email, 'jgramowski7@gmail.com');
  });

  await t('provisioning RE-STRUCTURES a simulated profile rather than copying it', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/provisioning.js', 'utf8');
    // The teaser's profile used to be copied in verbatim. A preview built while
    // the model was unreachable is a bad demo; the paid account inheriting it
    // is a refund.
    assert.ok(src.includes('profile.is_simulated && sourceText.length > 60'),
      'a simulated parse must be re-run at the moment money is involved');
    assert.ok(src.includes("require('./resume')") && src.includes('resumeSvc.structure('),
      'and re-structured from the source text');
    assert.ok(src.includes('existing.resume_json.is_simulated'),
      're-running provisioning must REPAIR an existing damaged profile, not skip it');
    assert.ok(/never block provisioning/i.test(src),
      'and a failure here must not cost somebody their account');
  });

  await t('a resume can be replaced at any time, in any supported format', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes("router.post('/resume'"), 'upload a new one');
    assert.ok(src.includes("router.post('/resume/reparse'"),
      'and re-read the text already on file — the repair door, when only the structuring failed');
    assert.ok(src.includes('resumeUpload.single('), 'as a real file upload');
    assert.ok(src.includes('publishSite('),
      'the public page, resume.json and the agent card must be republished or nothing really changed');
    // Both doors are behind the session, and tenant_id comes from it.
    const seg = src.slice(src.indexOf("router.post('/resume'"));
    assert.ok(seg.includes('auth(req, res)'), 'gated by the session');
    assert.ok(!/req\.(body|query|params)\.tenant_id/.test(seg),
      'tenant_id must never come from the request');
  });

  await t('a thin result is REPORTED, never dressed up', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(src.includes('is_simulated: Boolean(profile.is_simulated)'),
      'the caller must be told the model was unreachable');
    assert.ok(/Nothing was invented/.test(src), 'and told nothing was fabricated to fill the gap');
    // Re-reading with no model would produce the identical thin result, so it
    // refuses instead of pretending it did something.
    assert.ok(src.includes('brain.enabled()') && /would produce the same thin result/.test(src),
      'reparse must refuse when the model is not configured');
    const page = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(page.includes('loadResume()') && page.includes("id=\"rfile\""),
      'and the dashboard must actually offer it');
  });

  section('a PDF we cannot open is not a PDF we cannot read');

  // Build a real PDF in memory. pdfkit output is exactly what pdf-parse 1.1.1
  // throws "bad XRef entry" on, which is the bug a subscriber actually hit.
  async function makePdf(lines) {
    const PDFDocument = require('pdfkit');
    const d = new PDFDocument();
    const chunks = [];
    const done = new Promise((r) => { d.on('data', (b) => chunks.push(b)); d.on('end', () => r()); });
    d.fontSize(12);
    for (const l of lines) d.text(l);
    d.end();
    await done;
    return Buffer.concat(chunks);
  }

  await t('a PDF whose index will not parse is still read', async () => {
    const resumeSvc2 = require(__dirname + '/src/services/resume');
    const pdf = await makePdf([
      'NUMERIANO BOUFFARD', 'Executive Director, Operations',
      'nvbouffard@gmail.com', 'EXPERIENCE',
      'Vice President, Global Logistics, Acme Corp, 2018 to 2024',
      'Directed distribution across eleven regional centres and a fleet of two hundred vehicles.',
    ]);
    const r = await resumeSvc2.extractText(pdf, 'cv.pdf');
    assert.strictEqual(r.ok, true, 'THE VISITOR WAS TOLD "bad XRef entry" FOR A VALID FILE');
    assert.ok(r.text.includes('NUMERIANO BOUFFARD'), 'and the name must survive');
    assert.ok(r.text.includes('Acme Corp'), 'along with the body');

    // Break the cross-reference table outright — the text lives in the content
    // streams and the index is never needed to reach it.
    const s = pdf.toString('latin1');
    const cut = s.lastIndexOf('startxref');
    const broken = Buffer.from(s.slice(0, cut) + 'startxref\n999999\n%%EOF\n', 'latin1');
    const r2 = await resumeSvc2.extractText(broken, 'cv.pdf');
    assert.strictEqual(r2.ok, true, 'a damaged index must not lose the document');
    assert.ok(r2.text.includes('NUMERIANO BOUFFARD'));
  });

  await t('a filter CASCADE is unwrapped — ASCII85 over Flate', async () => {
    // ReportLab writes `/Filter [/ASCII85Decode /FlateDecode]` by default, so
    // the stream bytes are printable ASCII wrapping a deflate stream. The first
    // version of the recovery only tried to inflate: inflate failed, the raw
    // ASCII85 held no text operators, and the whole page was skipped in
    // silence. A real subscriber's CV is exactly this shape.
    const zlib = require('zlib');
    const rec = require(__dirname + '/src/services/pdf-recover');
    const content = 'BT /F1 12 Tf 72 720 Td (NUMERIANO V. BOUFFARD) Tj T* '
      + '(International Business Executive and Chamber of Commerce leader) Tj T* '
      + '(Multi-Travel Connection, President and Founder, Florida, 1988) Tj ET';
    const a85 = (buf) => {
      let out = '';
      for (let i = 0; i < buf.length; i += 4) {
        const slice = buf.slice(i, i + 4);
        const pad = 4 - slice.length;
        let n = 0;
        for (let j = 0; j < 4; j++) n = n * 256 + (slice[j] || 0);
        if (n === 0 && pad === 0) { out += 'z'; continue; }
        const c = [];
        for (let j = 0; j < 5; j++) { c.unshift(String.fromCharCode(33 + (n % 85))); n = Math.floor(n / 85); }
        out += c.join('').slice(0, 5 - pad);
      }
      return out + '~>';
    };
    const wrapped = a85(zlib.deflateSync(Buffer.from(content, 'latin1')));
    const pdf = Buffer.from(
      '%PDF-1.4\n4 0 obj\n<< /Filter [ /ASCII85Decode /FlateDecode ] >>\nstream\n'
      + wrapped + '\nendstream\nendobj\ntrailer\n<< >>\nstartxref\n999999\n%%EOF\n', 'latin1');

    const out = rec.scavenge(pdf);
    assert.ok(out.quality.ok, 'the cascade must be unwrapped, not skipped');
    assert.ok(out.text.includes('NUMERIANO V. BOUFFARD'), 'and the text must come back');
    assert.ok(out.text.includes('Multi-Travel Connection'));

    // The decoder itself, both directions.
    assert.strictEqual(rec.ascii85Decode(a85(Buffer.from('hello world'))).toString(), 'hello world');
    // Something that is plainly not ASCII85 must be refused, not mangled.
    assert.strictEqual(rec.ascii85Decode('  not ascii85 ÿ'), null);
  });

  await t('RECOVERY NEVER RETURNS GLYPH SOUP', () => {
    // THE ONE THAT MATTERS. A subsetted font stores glyph ids, not characters;
    // decoded blind they are 60-73% junk (measured on our own PDFs). Handing
    // that to the model would produce a confidently fabricated résumé out of
    // noise — far worse than saying we could not read the file.
    const rec = require(__dirname + '/src/services/pdf-recover');
    const soup = '$,y0&3%5$,1Ô¦+,'.repeat(40);
    assert.strictEqual(rec.readable(soup).ok, false, 'symbol soup must be refused');
    assert.ok(/subsetted|glyph/.test(rec.readable(soup).reason || ''), 'and explain itself');
    assert.strictEqual(rec.readable('short').ok, false);

    const real = 'NUMERIANO BOUFFARD Executive Director of Operations with twenty years '
      + 'directing distribution networks across eleven regional centres and a fleet '
      + 'of two hundred vehicles for national retail accounts.';
    assert.strictEqual(rec.readable(real).ok, true, 'genuine text must pass');
    assert.ok(rec.readable(real).ratio >= 0.9);

    // And against a real subsetted-font PDF from this repo, if it is here.
    const fs = require('fs');
    const p = __dirname + '/../../public/architecture/digit2ai-agent-roster.pdf';
    if (fs.existsSync(p)) {
      const q = rec.scavenge(fs.readFileSync(p)).quality;
      assert.strictEqual(q.ok, false,
        `a subsetted-font PDF scavenged to ratio ${q.ratio} and must be refused`);
    } else {
      console.log('      (skipped the real subsetted-font PDF — file not present)');
    }
  });

  await t('a scan is named a scan, because re-exporting cannot fix it', async () => {
    const resumeSvc2 = require(__dirname + '/src/services/resume');
    const r = await resumeSvc2.extractText(Buffer.from('not a pdf at all'), 'cv.pdf');
    assert.strictEqual(r.ok, false, 'garbage in must not come back ok');
    assert.ok(r.note, 'and it must say why');
  });

  await t('the visitor is pointed at the paste box that is already on screen', () => {
    const fs = require('fs');
    const route = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(route.includes('paste_instead: true'),
      '"bad XRef entry" is a sentence about our parser, not something to act on');
    assert.ok(!route.includes("'Could not read that file: '"),
      'the raw parser message must not be shown as the error');
    assert.ok(route.includes('ex.scanned'), 'a scan and an unreadable file need different advice');
    const page = fs.readFileSync(__dirname + '/public/index.html', 'utf8');
    assert.ok(page.includes('j.paste_instead') && page.includes("getElementById('ju-text')"),
      'the landing page must open and focus the paste box');
  });

  await t('an API key pasted as the webhook secret is called out', () => {
    const b = require(__dirname + '/src/services/billing');
    const saved = process.env.JOBUP_STRIPE_WEBHOOK_SECRET;
    try {
      // The confusion is real and the failure is silent: sk_live_ here fails
      // every signature, the account still activates through the build form,
      // and only the invoice and the referral commission go missing.
      process.env.JOBUP_STRIPE_WEBHOOK_SECRET = 'sk_live_' + 'a1B2c3D4e5'.repeat(10);
      let w = b.webhookHealth();
      assert.strictEqual(w.secret_present, true);
      assert.strictEqual(w.secret_shape_ok, false, 'an API key is not a signing secret');
      assert.ok(/whsec_/.test(w.note), 'and the note must say what one looks like');

      process.env.JOBUP_STRIPE_WEBHOOK_SECRET = 'whsec_TT2EC2LchmudkTsIEDilwzujH43CWouG';
      w = b.webhookHealth();
      assert.strictEqual(w.secret_shape_ok, true);
      assert.strictEqual(w.secret_from, 'JOBUP_STRIPE_WEBHOOK_SECRET');
      // Well formed is NOT the same as correct — the note must keep saying so
      // until something has actually arrived.
      assert.ok(/nothing has arrived yet|WRONG endpoint/.test(w.note),
        'shape can never prove the secret belongs to the right endpoint');

      delete process.env.JOBUP_STRIPE_WEBHOOK_SECRET;
      assert.strictEqual(b.webhookHealth().secret_from, 'STRIPE_WEBHOOK_SECRET (shared)');
    } finally {
      if (saved === undefined) delete process.env.JOBUP_STRIPE_WEBHOOK_SECRET;
      else process.env.JOBUP_STRIPE_WEBHOOK_SECRET = saved;
    }
  });

  await t('every webhook is counted, verified or rejected', () => {
    const b = require(__dirname + '/src/services/billing');
    const before = b.webhookHealth();
    b.noteWebhook({ verified: false, error: 'No signatures found matching the expected signature' });
    b.noteWebhook({ verified: true, type: 'invoice.paid', action: 'invoice_recorded' });
    const after = b.webhookHealth();
    assert.strictEqual(after.received, before.received + 2);
    assert.strictEqual(after.rejected, before.rejected + 1);
    assert.strictEqual(after.verified, before.verified + 1);
    assert.strictEqual(after.last_type, 'invoice.paid');
    assert.strictEqual(after.last_action, 'invoice_recorded');
    // A rejection message must be recorded — it is the only trace a
    // wrong-endpoint secret leaves anywhere.
    b.noteWebhook({ verified: false, error: 'No signatures found matching the expected signature' });
    assert.match(b.webhookHealth().last_error, /No signatures found/);
    const fs = require('fs');
    const route = fs.readFileSync(__dirname + '/src/routes/billing.js', 'utf8');
    assert.ok(route.includes('noteWebhook({ verified: false'),
      'the rejection path must record, not just return 400');
  });

  section('invoice.paid must attribute, or the money is invisible');

  await t('STRIPE MOVED THE FIELD — invoice.paid resolves on the current shape', async () => {
    // A real test payment proved this. On current API versions an Invoice no
    // longer carries `subscription` or the subscription metadata at the top
    // level; both moved under `parent.subscription_details`. The old resolver
    // parked the event, so: no invoice row, the billing register read $0.00 for
    // somebody who had paid, and qualifyFromInvoice never ran — meaning NO
    // REFERRAL COMMISSION WOULD EVER HAVE BEEN CREATED.
    const b = require(__dirname + '/src/services/billing');
    const sub = await models.subscribers.create({
      email: 'sit-invshape@example.com', status: 'active', activation: 'paid',
      stripe_customer_id: 'cus_sit_shape', stripe_subscription_id: 'sub_sit_shape',
    });
    try {
      const modern = {
        id: 'in_sit_modern', amount_paid: 5900, customer: 'cus_sit_shape', metadata: {},
        parent: { type: 'subscription_details', subscription_details: {
          subscription: 'sub_sit_shape', metadata: { subscriber_id: String(sub.id) } } },
      };
      const r = await b.applyEvent('invoice.paid', modern);
      assert.strictEqual(r.ok, true, 'THE PAYMENT WAS INVISIBLE');
      assert.strictEqual(r.subscriberId, sub.id);
      assert.strictEqual(r.attributed_via, 'metadata');
      assert.strictEqual(r.amount_cents, 5900);

      // Retried delivery must not create a second row — Stripe retries until 2xx
      // and fires sibling events, and a duplicate inflates the revenue figures.
      const again = await b.applyEvent('invoice.paid', modern);
      assert.strictEqual(again.action, 'invoice_already_recorded');
      const rows = await models.invoices.findAll({ where: { stripe_invoice_id: 'in_sit_modern' } });
      assert.strictEqual(rows.length, 1, 'one payment, one invoice row');

      // No metadata at all: the stored Stripe ids are an authoritative link
      // written by the checkout event, not a guess.
      const bare = { id: 'in_sit_bare', amount_paid: 5900, customer: 'cus_sit_shape', metadata: {} };
      const r2 = await b.applyEvent('invoice.paid', bare);
      assert.strictEqual(r2.ok, true);
      assert.strictEqual(r2.attributed_via, 'stripe_customer_id');

      // And something belonging to nobody is still parked, never guessed on.
      const orphan = { id: 'in_sit_orphan', amount_paid: 5900, customer: 'cus_nobody', metadata: {} };
      const r3 = await b.applyEvent('invoice.paid', orphan);
      assert.strictEqual(r3.ok, false);
      assert.strictEqual(r3.parked, true);
    } finally {
      await models.invoices.destroy({ where: { tenant_id: sub.id } });
      await models.subscribers.destroy({ where: { id: sub.id } });
    }
  });

  await t('the old top-level shape still works — do not break what shipped', async () => {
    const b = require(__dirname + '/src/services/billing');
    const sub = await models.subscribers.create({
      email: 'sit-invold@example.com', status: 'active', activation: 'paid' });
    try {
      const legacy = { id: 'in_sit_legacy', amount_paid: 5900,
        metadata: { subscriber_id: String(sub.id) } };
      const r = await b.applyEvent('invoice.paid', legacy);
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.attributed_via, 'metadata');
    } finally {
      await models.invoices.destroy({ where: { tenant_id: sub.id } });
      await models.subscribers.destroy({ where: { id: sub.id } });
    }
  });

  section('test mode moves JobUp alone, and can never read as revenue');

  await t('JobUp has its own Stripe key, so the estate-wide one is untouchable', () => {
    const b = require(__dirname + '/src/services/billing');
    const savedOwn = process.env.JOBUP_STRIPE_SECRET_KEY;
    const savedShared = process.env.STRIPE_SECRET_KEY;
    try {
      // STRIPE_SECRET_KEY is read by 38 files here — chambers, HISPATEC,
      // credits, LawnCopilot, TunjoRacing. Pointing it at a test key to try
      // something in JobUp would stop all of them taking real money.
      process.env.STRIPE_SECRET_KEY = 'sk_live_shared_estate';
      delete process.env.JOBUP_STRIPE_SECRET_KEY;
      assert.strictEqual(b.secretKey(), 'sk_live_shared_estate', 'falls back when unset');
      assert.strictEqual(b.mode(), 'live');
      assert.strictEqual(b.isolated(), false);

      process.env.JOBUP_STRIPE_SECRET_KEY = 'sk_test_jobup_only';
      assert.strictEqual(b.secretKey(), 'sk_test_jobup_only', 'JobUp key must win');
      assert.strictEqual(b.mode(), 'test', 'the mode is read off the key, never configured apart');
      assert.strictEqual(b.isTestMode(), true);
      assert.strictEqual(b.isolated(), true);
      // The shared key is still exactly what it was.
      assert.strictEqual(process.env.STRIPE_SECRET_KEY, 'sk_live_shared_estate',
        'switching JobUp must not disturb the rest of the estate');
    } finally {
      if (savedOwn === undefined) delete process.env.JOBUP_STRIPE_SECRET_KEY;
      else process.env.JOBUP_STRIPE_SECRET_KEY = savedOwn;
      if (savedShared === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = savedShared;
    }
  });

  await t('a key pasted from an abbreviated copy is caught before a customer is', () => {
    const b = require(__dirname + '/src/services/billing');
    // "sk_test_51RHs2a…00Mm2rz8E0" still starts with sk_test_, so mode() reads
    // 'test', the SDK constructs happily and /health looks configured. Without
    // this check the first symptom is a real checkout failing.
    const bad = b.keyShape('sk_test_51RHs2a 00Mm2rz8E0'.replace(' ', '…'));
    assert.strictEqual(bad.looks_truncated, true, 'an ellipsised key must be caught');
    assert.deepStrictEqual(bad.illegal_characters, ['…']);
    assert.ok(/pasted from an abbreviated/.test(bad.hint), 'and it must say what to do');

    // A real key is ~107 chars of base62 and must pass cleanly.
    const good = b.keyShape('sk_test_' + 'a1B2c3D4e5'.repeat(10));
    assert.strictEqual(good.looks_truncated, false);
    assert.strictEqual(good.illegal_characters, null);
    // Shortened by hand rather than ellipsised — still not a key.
    assert.strictEqual(b.keyShape('sk_test_abc').looks_truncated, true);
    assert.strictEqual(b.keyShape('').present, false);
  });

  await t('the probe asks STRIPE which mode it is in, not the key prefix', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/billing.js', 'utf8');
    assert.ok(src.includes('balance.retrieve()'), 'a real read-only call is the only proof');
    assert.ok(src.includes('mode_per_stripe') && src.includes('mode_per_key_prefix')
           && src.includes('agrees:'),
      'if our prefix reading and Stripe ever disagree, that must be visible');
    const idx = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    assert.ok(idx.includes('billing.keyShape()'),
      'the shape check costs nothing and must always be reported');
    assert.ok(idx.includes('stripe_webhook_secret'),
      'a truncated whsec fails signature verification, and the symptom is silence');
  });

  await t('THE HOST APP MUST NOT EAT THE RAW BODY BEFORE JOBUP SEES IT', () => {
    const fs = require('fs');
    const app = fs.readFileSync(__dirname + '/../../src/app.js', 'utf8');
    const carve = app.indexOf('/api/v1/billing/webhook');
    const json = app.indexOf("app.use(express.json({ limit: '500mb' }))");
    assert.ok(carve > -1, 'src/app.js must carve out JobUp\'s webhook path');
    assert.ok(json > -1, 'the global body parser should still be there');
    // JobUp mounts express.raw() on this path in its OWN router — but that
    // router loads ~2,100 lines below the global express.json(). By then the
    // stream is consumed and req._body is set, so the inner raw() SKIPS and the
    // handler re-serialises the parsed object. Stripe signs the exact bytes it
    // sent, so a re-encode differing only in whitespace fails EVERY signature.
    // This was live: two rejected webhooks, a real $59 taken, no invoice row,
    // with a perfectly correct signing secret.
    assert.ok(carve < json,
      'the raw-body carve-out must come BEFORE the global express.json()');
    // Both roots: the custom domain and the path mount.
    assert.ok(app.includes("'/jobup/api/v1/billing/webhook'"),
      'the path mount needs it too, not just jobup.dev');
    assert.ok(/jobup\.dev/.test(app.slice(carve, json)),
      'and the host must be checked so the shared CRM host is not affected');
  });

  await t('a re-serialised body can never verify — this is the failure mode', () => {
    const crypto = require('crypto');
    const secret = 'whsec_sit_fixture_secret';
    // Stripe sends PRETTY-PRINTED json and signs those exact bytes.
    const raw = JSON.stringify({ id: 'evt_sit', type: 'invoice.paid' }, null, 2);
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
    const header = `t=${ts},v1=${sig}`;
    const stripe = require('stripe')('sk_test_fixture');

    // Raw bytes: verifies.
    stripe.webhooks.constructEvent(Buffer.from(raw), header, secret);

    // What express.json() leaves behind: same object, different bytes.
    assert.throws(
      () => stripe.webhooks.constructEvent(
        Buffer.from(JSON.stringify(JSON.parse(raw))), header, secret),
      /No signatures found matching/,
      'a re-encoded body must fail — this is what a correct secret looked like');
  });

  await t('the webhook verifies against JobUp\'s OWN secret', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/billing.js', 'utf8');
    // Verifying a test-mode signature against the estate-wide live secret fails
    // every time, so a real payment would never activate an account and the
    // only symptom is silence.
    assert.ok(src.includes('billing.webhookSecret()') && src.includes('billing.secretKey()'),
      'the webhook must go through the service, not process.env');
    assert.ok(!/process\.env\.STRIPE_(SECRET|WEBHOOK)/.test(src),
      'no route may read the shared Stripe env vars directly');
    const svc = fs.readFileSync(__dirname + '/src/services/billing.js', 'utf8');
    const direct = (svc.match(/process\.env\.STRIPE_(SECRET|WEBHOOK)_[A-Z_]+/g) || []).length;
    assert.strictEqual(direct, 2, 'only the two fallbacks may name the shared vars');
  });

  await t('a test-mode signup is stamped, and never counted as money', () => {
    const b = require(__dirname + '/src/services/billing');
    const saved = process.env.JOBUP_STRIPE_SECRET_KEY;
    try {
      process.env.JOBUP_STRIPE_SECRET_KEY = 'sk_test_x';
      assert.strictEqual(b.activationStamp(), b.TEST_ACTIVATION,
        'Stripe test mode issues REAL invoice objects with real amounts');
      assert.ok(b.isNonRevenue(b.TEST_ACTIVATION));
      process.env.JOBUP_STRIPE_SECRET_KEY = 'sk_live_x';
      assert.strictEqual(b.activationStamp(), 'paid');
      assert.strictEqual(b.isNonRevenue('paid'), false);
    } finally {
      if (saved === undefined) delete process.env.JOBUP_STRIPE_SECRET_KEY;
      else process.env.JOBUP_STRIPE_SECRET_KEY = saved;
    }
    for (const a of ['free_test', 'no_billing']) assert.ok(b.isNonRevenue(a));
  });

  await t('ONE list decides what is not revenue — no surface repeats the literal', () => {
    const fs = require('fs');
    // A fourth surface added later must not be able to forget stripe_test.
    for (const f of ['src/routes/subscribers-admin.js', 'src/services/referrals.js']) {
      const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
      assert.ok(src.includes('isNonRevenue('), `${f} must ask billing, not compare a string`);
      assert.ok(!/activation\s*!==\s*'free_test'/.test(src)
             && !/\['free_test',\s*'no_billing'\]\.includes/.test(src),
        `${f} still hardcodes the old list and would miss a test-mode row`);
    }
  });

  await t('a preview built BEFORE the switch still shows the test-mode chip', async () => {
    // The payload is built once and stored. Reading test_mode out of it means a
    // teaser from last week offers a $59 button with nothing saying the card is
    // never charged — the exact case that makes somebody believe they paid.
    const express = require('express');
    const http = require('http');
    const b = require(__dirname + '/src/services/billing');
    const teaserSvc4 = require(__dirname + '/src/services/teaser');
    const origGet = teaserSvc4.get;
    const savedKey = process.env.JOBUP_STRIPE_SECRET_KEY;
    teaserSvc4.get = async () => ({ token: 'sit-old', language: 'en', status: 'ready' });
    process.env.JOBUP_STRIPE_SECRET_KEY = 'sk_test_' + 'a1B2c3D4e5'.repeat(10);
    const app = express();
    app.use('/teaser', require(__dirname + '/src/routes/teaser-view'));
    const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    try {
      assert.strictEqual(b.isTestMode(), true);
      const html = await new Promise((ok, bad) => {
        http.get({ host: '127.0.0.1', port: srv.address().port, path: '/teaser/sit-old' }, (r) => {
          let x = ''; r.on('data', (d) => { x += d; }); r.on('end', () => ok(x));
        }).on('error', bad);
      });
      assert.ok(/var TEST_MODE=true/.test(html),
        'the page must carry LIVE server state, not whatever the stored row froze');
      assert.ok(html.includes('TEST_MODE||Boolean(c.test_mode)'),
        'and the live value must win over the payload');
    } finally {
      srv.close(); teaserSvc4.get = origGet;
      if (savedKey === undefined) delete process.env.JOBUP_STRIPE_SECRET_KEY;
      else process.env.JOBUP_STRIPE_SECRET_KEY = savedKey;
    }
  });

  await t('test mode is visible on every surface that offers to take money', () => {
    const fs = require('fs');
    const teaserSvc = fs.readFileSync(__dirname + '/src/services/teaser.js', 'utf8');
    assert.ok(teaserSvc.includes('test_mode:'), 'the CTA payload must carry it');
    const view = fs.readFileSync(__dirname + '/src/routes/teaser-view.js', 'utf8');
    assert.ok(view.includes('TEST_CHIP') && view.includes("testChip:'Test mode'")
           && view.includes("testChip:'Modo de prueba'"),
      'a checkout that looks real and charges nothing must say so, in both languages');
    const console_ = fs.readFileSync(__dirname + '/public/subscribers-admin.html', 'utf8');
    assert.ok(console_.includes('id="testbanner"') && console_.includes('stripe_test'),
      'the billing register must not silently mix test rows with real revenue');
  });

  section('a rate limit must not read as a broken product');

  await t('the network cap counts a connection, so it cannot be three', () => {
    const lim = require(__dirname + '/src/services/limits');
    assert.ok(lim.MAX_PER_IP_PER_DAY >= 8,
      'one household or office behind one NAT must not run out in three previews');
    assert.strictEqual(lim.MAX_PER_EMAIL_PER_DAY, 2,
      'the per-person cap is the one that stops a loop, and it stays tight');
  });

  await t('a refusal carries when it clears and the preview they already have', async () => {
    const lim = require(__dirname + '/src/services/limits');
    const email = 'sit-limit@example.com';
    const ipHash = 'sit-limit-hash';
    const made = [];
    for (let i = 0; i < lim.MAX_PER_EMAIL_PER_DAY; i++) {
      made.push(await models.teasers.create({
        token: 'sit-limit-' + i, email, ip_hash: ipHash, status: 'ready',
      }));
    }
    try {
      const rl = await lim.teaserAllowed({ ipHash, email });
      assert.strictEqual(rl.allowed, false, 'the cap must still bite');
      assert.strictEqual(rl.reason, 'email',
        'the specific refusal is the explicable one — blaming the network here is a lie');
      assert.ok(rl.retry_after, '"try again tomorrow" is usually wrong by hours');
      // Rolling window: it frees up when the OLDEST counted row ages out.
      const gap = new Date(rl.retry_after) - new Date(made[0].created_at);
      assert.ok(Math.abs(gap - lim.WINDOW_MS) < 5000, 'retry_after must track the oldest row');
      assert.ok(rl.existing && rl.existing.token,
        'they already have a preview — handing it back is the whole point');
      assert.ok(rl.existing.url.includes('/teaser/'), 'and it must be openable');

      // A different person on the same Wi-Fi is NOT blocked at two.
      const other = await lim.teaserAllowed({ ipHash, email: 'someone-else@example.com' });
      assert.strictEqual(other.allowed, true,
        'the per-email cap must never leak into a refusal for the next visitor');
    } finally {
      await models.teasers.destroy({ where: { email } });
    }
  });

  await t('an active subscriber never meets a rate limit', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    const gate = src.indexOf("already_registered: true");
    const limit = src.indexOf('limits.teaserAllowed');
    assert.ok(gate > -1 && limit > -1);
    assert.ok(gate < limit,
      'the person who already paid must be sent to sign in BEFORE any cap is counted');
    assert.ok(src.includes("sign_in_url: '/app'"), 'and given the way in');
  });

  await t('the landing page turns a refusal into a way forward', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/public/index.html', 'utf8');
    assert.ok(src.includes('function failWithWay'), 'a dead red string converts nobody');
    assert.ok(src.includes('Open my preview') && src.includes("'Sign in'"),
      'both recoverable cases need a real button');
    assert.ok(src.includes('function clearsAt'), 'and the exact time it clears');
    // A link built from a server field must never be able to leave the site.
    assert.ok(/\^\\\/\[A-Za-z0-9/.test(src),
      'only a same-origin path may be rendered as a button');
  });

  await t('the brain reports whether it WORKS, not whether a key exists', async () => {
    const b = require(__dirname + '/src/services/brain');
    assert.strictEqual(typeof b.probe, 'function', 'a real call is the only proof');
    assert.strictEqual(typeof b.health, 'function');
    const h = b.health();
    assert.ok('key_present' in h && 'last_failure' in h,
      'four previews degraded silently because nothing recorded the reason');
    // With no key the probe must say so rather than pretend or throw.
    const p = await b.probe({ maxAgeMs: 0 });
    assert.strictEqual(p.ok, false);
    assert.match(p.reason, /ANTHROPIC_API_KEY/);
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/services/brain.js', 'utf8');
    assert.ok(src.includes('noteFailure(e)') && src.match(/noteFailure\(e\)/g).length >= 2,
      'both the probe and the real call path must record why they failed');
  });

  section('the guide IS the form');

  await t('Getting found is a real pane, wired into the app', () => {
    const fs = require('fs');
    const page = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(/PANES=\[[^\]]*'guide'/.test(page), 'registered as a pane');
    assert.ok(page.includes('data-p="guide"'), 'has a tab');
    assert.ok(page.includes('id="p-guide"'), 'has a container');
    assert.ok(/renderAccount\(\); loadGuide\(\)/.test(page), 'rendered on boot');
    // ?tab=guide must deep-link, which is what a hyperlink from anywhere needs.
    assert.ok(page.includes('function tabFromUrl'), 'and reachable by ?tab=');
  });

  await t('it follows the app theme rather than inventing one', () => {
    const fs = require('fs');
    const page = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    const guide = page.slice(page.indexOf('function loadGuide'), page.indexOf('function gRmRole'));
    // Reuses the app's own components, so it cannot drift from the rest of the UI.
    for (const cls of ['class="card"', 'class="t"', 'class="chip"', 'class="addrow"',
                       'class="sw', 'class="toggle', 'class="note"', 'btn primary sm']) {
      assert.ok(guide.includes(cls), `must reuse ${cls}`);
    }
    // No literal colours: a hardcoded hex is how a panel stops matching the theme.
    const hexes = guide.match(/#[0-9a-fA-F]{3,6}\b/g) || [];
    assert.strictEqual(hexes.length, 0, `hardcoded colours found: ${hexes.join(', ')}`);
  });

  await t('THE FIELDS WRITE TO THE SAME RECORD AS THE TARGETS TAB', () => {
    const fs = require('fs');
    const page = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    const guide = page.slice(page.indexOf('function loadGuide'), page.indexOf('function gRmRole'));
    // A guide with its own copy of the data is a second source of truth that
    // quietly disagrees with the real one. It must PUT the same settings doc.
    assert.ok(/api\('\/api\/v1\/engine\/settings',\{method:'PUT'/.test(page),
      'adding a title must save the real settings document');
    assert.ok(/next\.targeting\.roles/.test(page), 'into targeting.roles, the same field');
    assert.ok(/loadGuide\(\); loadTargets\(\)/.test(page),
      'and refresh BOTH surfaces, so they can never show different truths');
    // Where a control is not inlined, the field NAME is the link — not prose
    // telling somebody where to go looking.
    assert.ok(/showTab\(\\?'targets\\?'\)/.test(guide),
      'unlinked fields must link straight to the field');
  });

  await t('the five places are ordered by how recruiters actually search', () => {
    const st = require(__dirname + '/src/services/settings');
    const order = st.presenceChecklist({}, 'en').items.map((i) => i.slug);
    // Evidence, not a guess: LinkedIn is the spine every sourcing tool merges
    // against; job boards count twice (paid resume search AND an aggregator
    // source); SeekOut and hireEZ crawl GitHub explicitly. Email and print
    // reach a human directly but feed no index.
    assert.deepStrictEqual(order,
      ['linkedin', 'job_boards', 'github', 'email_signature', 'qr']);
    const why = st.PLACEMENTS.map((p) => p.en.why).join(' ');
    assert.ok(/SeekOut and hireEZ crawl GitHub/.test(why), 'name the tools, so the order is checkable');
    assert.ok(/counts twice/.test(why), 'and say why a job board outranks GitHub');
    // Both languages carry the same reasoning.
    const es = st.PLACEMENTS.map((p) => p.es.why).join(' ');
    assert.ok(/SeekOut y hireEZ/.test(es) && /cuenta doble/.test(es));
  });

  await t('the guide explains how the other side searches', () => {
    const fs = require('fs');
    const page = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    const guide = page.slice(page.indexOf('function loadGuide'), page.indexOf('function gRmRole'));
    assert.ok(/How recruiters actually search/.test(guide));
    assert.ok(/SeekOut, hireEZ, Pin/.test(guide), 'name the aggregators');
    assert.ok(/LinkedIn\s*alone stopped winning/.test(guide.replace(/'\+\s*'/g, '')),
      'and why that category exists at all');
    // The limit that keeps this honest: an aggregator cannot merge a page it
    // has never crawled, so the links remain the prerequisite.
    assert.ok(/cannot merge a page/.test(guide.replace(/'\+\s*'/g, '')));
  });

  await t('the guide states the limits it cannot change', () => {
    const fs = require('fs');
    const page = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    const guide = page.slice(page.indexOf('function loadGuide'), page.indexOf('function gRmRole'));
    assert.ok(/does not post your profile to LinkedIn/.test(guide),
      'the closed-platform limit must be stated in the product, not only in chat');
    assert.ok(/guarantees a recruiter will search/.test(guide), 'and the absence of a guarantee');
    assert.ok(/two to eight weeks/.test(guide), 'and the real timescale');
    // An empty role list is the actual cause of a one-page site. Say so.
    assert.ok(/almost nothing to match you against/.test(guide));
  });

  section('getting found — the half of the product that did not work');

  await t('role targets normalise from BOTH shapes, and do not regress', () => {
    const st = require(__dirname + '/src/services/settings');
    // Signup writes strings; the settings editor writes objects. Both must
    // produce the same canonical role, or a subscriber gets pages depending on
    // which surface they last saved from.
    assert.deepStrictEqual(
      st.pageRoles({ targeting: { roles: ['Sales Executive'] } }).map((r) => r.slug),
      ['sales-executive']);
    assert.deepStrictEqual(
      st.pageRoles({ targeting: { roles: [{ title: 'Sales Executive' }] } }).map((r) => r.slug),
      ['sales-executive']);
    // page:false is how somebody hides a role without deleting the target.
    assert.strictEqual(st.pageRoles({ targeting: { roles: [{ title: 'X Y', page: false }] } }).length, 0);
    // Two spellings of one title must not become two pages competing to rank.
    assert.strictEqual(
      st.pageRoles({ targeting: { roles: ['Sales Executive', 'sales executive'] } }).length, 1);
    // REGRESSION GUARD: this is what carlosgomez.jobup.dev serves in production
    // today. Role pages already worked; the change must not alter one slug.
    const carlos = { targeting: { roles: [
      { title: 'Financial Analyst' }, { title: 'Business Analyst' }, { title: 'FP&A Analyst' },
      { title: 'Operations Analyst' }, { title: 'Account Manager' }, { title: 'Project Manager' }] } };
    assert.deepStrictEqual(st.pageRoles(carlos).map((r) => r.slug),
      ['financial-analyst', 'business-analyst', 'fp-a-analyst',
       'operations-analyst', 'account-manager', 'project-manager']);
  });

  await t('an empty role list is REPORTED, not silently skipped', () => {
    const st = require(__dirname + '/src/services/settings');
    // The real cause of a one-url sitemap is a blank field at signup, not a
    // parser bug. Nobody was ever told.
    assert.strictEqual(st.pageRoles({ targeting: { roles: [] } }).length, 0);
    const fs = require('fs');
    const eng = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    assert.ok(eng.includes('role_pages_note'), 'the API must say when there are none');
    assert.ok(/no target job titles set/.test(eng), 'and say what that costs them');
    // Never invent role titles from the resume — a page claiming they want a job
    // they never asked for is worse than no page.
    assert.ok(!/roles\s*=\s*.*profile\.(headline|experience)/.test(eng),
      'role titles must never be derived from the resume');
  });

  await t('the Get Found checklist is five real places, bilingual', () => {
    const st = require(__dirname + '/src/services/settings');
    assert.strictEqual(st.PLACEMENTS.length, 5);
    const en = st.presenceChecklist({}, 'en');
    const es = st.presenceChecklist({}, 'es');
    assert.strictEqual(en.total, 5);
    assert.strictEqual(en.done_count, 0, 'nothing is done until they say so');
    assert.notStrictEqual(en.items[0].title, es.items[0].title, 'both languages');
    assert.ok(/tilde|Perfil|Pégalo/.test(es.items[0].what + es.items[0].title),
      'Spanish must carry proper orthography');
    // The honesty line, once, where every surface reads it.
    assert.ok(/prerequisites, not guarantees/.test(en.note));
    assert.ok(/requisitos, no garantías/.test(es.note));
    // Progress is counted, not claimed.
    assert.strictEqual(st.presenceChecklist({ presence: { placed: ['linkedin', 'github'] } }, 'en').done_count, 2);
    // An unknown slug cannot inflate the count.
    assert.strictEqual(st.presenceChecklist({ presence: { placed: ['made-up'] } }, 'en').done_count, 0);
  });

  await t('THE DIRECTORY IS OPT-IN AND LEAKS NOTHING', () => {
    const st = require(__dirname + '/src/services/settings');
    // Default OFF. Nobody is published because we decided it would help them.
    assert.strictEqual(st.sanitize({}).presence.directory_opt_in, false);
    assert.strictEqual(st.sanitize({ presence: { directory_opt_in: 'yes' } }).presence.directory_opt_in,
      false, 'anything but an explicit true is no');
    assert.strictEqual(st.sanitize({ presence: { directory_opt_in: true } }).presence.directory_opt_in, true);

    const fs = require('fs');
    const idx = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    const dir = idx.slice(idx.indexOf('async function directoryEntries'),
                          idx.indexOf("router.get(['/build'"));
    assert.ok(dir.includes('directory_opt_in'), 'the listing must check the flag');
    // Name, headline and the role titles they asked to be found for. Nothing else.
    for (const leak of ['profile.email', 'profile.phone', 'profile.location',
                        'sub.email', 'facts', 'compensation']) {
      assert.ok(!dir.includes(leak), `the directory must never publish ${leak}`);
    }
    // Real anchors, server-rendered — a link a crawler cannot see is not a link.
    assert.ok(/<a class="n" href=/.test(idx), 'entries must be real <a href> links');
  });

  await t('the apex tells crawlers anything at all', () => {
    const fs = require('fs');
    const idx = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    // Both were 404 on jobup.dev. Subscriber sites had their own; the apex —
    // the one page that links to every subscriber — had none.
    assert.ok(idx.includes("router.get('/robots.txt'"), 'apex robots.txt');
    assert.ok(idx.includes("router.get('/sitemap.xml'"), 'apex sitemap.xml');
    const sm = idx.slice(idx.indexOf("router.get('/sitemap.xml'"), idx.indexOf("router.get(['/directory'"));
    assert.ok(sm.includes('/directory'), 'the sitemap must include the directory');
    assert.ok(sm.includes('directoryEntries()'),
      'and every listed subscriber, so one fetch reaches them all');
    // The dashboard and the consoles are not for crawlers.
    const rb = idx.slice(idx.indexOf("router.get('/robots.txt'"), idx.indexOf("router.get('/sitemap.xml'"));
    for (const priv of ['/app', '/admin', '/subscribers-admin', '/teaser/']) {
      assert.ok(rb.includes(`Disallow: ${priv}`), `${priv} must be disallowed`);
    }
  });

  section('nobody should close the tab mid-build');

  await t('the teaser countdown is 70 seconds', () => {
    const teaserSvc = require(__dirname + '/src/services/teaser');
    assert.strictEqual(teaserSvc.TYPICAL_BUILD_MS, 70000,
      'the estimate people watch must match the build they actually get');
    const fs = require('fs');
    assert.ok(fs.readFileSync(__dirname + '/src/services/teaser.js', 'utf8')
      .includes('JOBUP_TYPICAL_BUILD_MS'), 'and stay overridable without a redeploy');
  });

  await t('the post-payment wait has its own countdown', () => {
    const fs = require('fs');
    const route = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(route.includes('JOBUP_TYPICAL_PROVISION_MS'), 'with its own tunable estimate');
    assert.ok(route.includes('progress: {') && route.includes('elapsed_ms')
           && route.includes('typical_ms') && route.includes('done_steps'),
      '/welcome must report real elapsed time and real step progress');
    // Measured on live accounts: provisioning finishes 0-2s after activation.
    // The estimate is the FELT wait, and elapsed is real, so the clock can be
    // honest rather than theatre.
    assert.ok(/elapsed.*Date\.now\(\)/s.test(route), 'elapsed must be measured, not invented');

    const page = fs.readFileSync(__dirname + '/public/welcome.html', 'utf8');
    assert.ok(page.includes('id="pclock"') && page.includes('id="pfill"'), 'a clock and a bar');
    assert.ok(page.includes('Taking longer than usual'),
      'past the estimate it must SAY SO, never freeze at 0:00');
    assert.ok(/Math\.min\(96/.test(page),
      'and the bar must never reach 100 before the site really is live');
    assert.ok(page.includes('finishProgress('), 'and it must resolve to the live address');
  });

  await t('THE VOICE IS NOT OFFERED BEFORE THERE IS ANYTHING TO SAY', async () => {
    // While the resume was being read, the bar already showed "Play the
    // walkthrough". People pressed it, nothing happened, and the wait read as
    // a broken page.
    const express = require('express');
    const http = require('http');
    const teaserSvc5 = require(__dirname + '/src/services/teaser');
    const origGet = teaserSvc5.get;
    teaserSvc5.get = async () => ({ token: 'sit-voice', language: 'en', status: 'ready' });
    const app = express();
    app.use('/teaser', require(__dirname + '/src/routes/teaser-view'));
    const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const html = await new Promise((ok, bad) => {
      http.get({ host: '127.0.0.1', port: srv.address().port, path: '/teaser/sit-voice' }, (r) => {
        let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => ok(b));
      }).on('error', bad);
    });

    const READY = { status: 'ready', narration: ['one', 'two'], payload: { screens: {
      site: { profile: { name: 'Ada', skills: [], experience: [] } },
      address: { available: true, address: 'ada.jobup.dev' },
      matches: { pool_available: false, items: [] },
      tailored: null, identity: { json_ld: {} }, agents: [],
      cta: { price_usd: 59, includes: [], non_renewal: '' } } } };

    const w = bootDom(html, 'https://jobup.dev/teaser/sit-voice');
    w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(READY) });
    try {
      const row = w.document.getElementById('voicerow');
      const orb = w.document.getElementById('orb');
      assert.ok(row, 'the controls must live in their own row so they can be hidden');
      assert.strictEqual(row.style.display, 'none', 'THE PLAY BUTTON WAS VISIBLE MID-BUILD');
      // The orb is itself a play button — it must not invite a press either.
      assert.strictEqual(orb.getAttribute('role'), 'img');
      assert.strictEqual(orb.getAttribute('tabindex'), '-1');
      assert.ok(!orb.classList.contains('ready'));

      // Pressing it anyway must explain, not fail silently.
      click(w, orb);
      assert.match(w.document.getElementById('stat').textContent, /Still building/);

      w.eval('poll()');
      await new Promise((r) => setTimeout(r, 60));

      assert.notStrictEqual(w.document.getElementById('voicerow').style.display, 'none',
        'and it must appear once the preview is ready');
      const orb2 = w.document.getElementById('orb');
      assert.strictEqual(orb2.getAttribute('role'), 'button');
      assert.ok(orb2.classList.contains('ready'), 'the orb becomes clickable only now');
    } finally { w.close(); srv.close(); teaserSvc5.get = origGet; }
  });

  section('subscribe and submit — behaviour, not grep');
  // ---- the four subscribe buttons, driven for real -----------------------
  // Grepping for data-cta proves the markup exists. It cannot prove the
  // buttons were ever bound, and an unbound subscribe button is exactly the
  // failure this whole change is about.
  await t('TEASER: all four subscribe buttons render and are wired', async () => {
    const express = require('express');
    const http = require('http');
    const teaserSvc3 = require(__dirname + '/src/services/teaser');
    const origGet = teaserSvc3.get;
    teaserSvc3.get = async () => ({ token: 'sit-cta', language: 'en', status: 'ready' });

    const app = express();
    app.use('/teaser', require(__dirname + '/src/routes/teaser-view'));
    const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
    const port = srv.address().port;
    const html = await new Promise((ok, bad) => {
      http.get({ host: '127.0.0.1', port, path: '/teaser/sit-cta' }, (r) => {
        let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => ok(b));
      }).on('error', bad);
    });

    const READY = {
      status: 'ready', narration: [],
      payload: { screens: {
        site: { profile: { name: 'Ada', skills: ['a'], experience: [] } },
        address: { available: true, address: 'ada.jobup.dev', exact_match: true },
        matches: { pool_available: false, items: [] },
        tailored: null, identity: { json_ld: {} }, agents: [],
        cta: { price_usd: 59, includes: ['x'], non_renewal: 'terms', headline: 'Build my ecosystem' },
      } },
    };
    let checkoutCalls = 0;
    const w = bootDom(html, 'https://jobup.dev/teaser/sit-cta');
    w.fetch = (url) => {
      if (String(url).includes('/billing/checkout')) {
        checkoutCalls++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ error: 'declined for the test' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(READY) });
    };
    try {
      w.eval('poll()');
      await new Promise((r) => setTimeout(r, 60));

      const ctas = w.document.querySelectorAll('.cta');
      assert.strictEqual(ctas.length, 4,
        'top, middle, bottom and pinned — got ' + ctas.length);
      const where = Array.from(ctas).map((b) => b.getAttribute('data-cta')).sort();
      assert.deepStrictEqual(where, ['bottom', 'middle', 'sticky', 'top']);
      // Every one of them must carry the same price and the same label.
      const labels = new Set(Array.from(ctas).map((b) => b.textContent.trim()));
      assert.strictEqual(labels.size, 1, 'the four buttons must say the same thing');
      assert.ok(w.document.getElementById('sb-price').textContent.includes('59'),
        'the pinned bar must quote the real price');
      assert.ok(w.document.getElementById('stickybuy').classList.contains('on'),
        'the pinned bar must actually be revealed once the preview is ready');

      // THE ACTUAL BUG: press the TOP one, the one nobody had before.
      click(w, ctas[0]);
      assert.strictEqual(checkoutCalls, 1, 'THE TOP BUTTON DID NOTHING');
      // A second press while the first is in flight must be refused, or four
      // buttons become four Stripe sessions for one person.
      click(w, ctas[1]);
      click(w, ctas[3]);
      assert.strictEqual(checkoutCalls, 1, 'a second tap opened a second checkout');

      await new Promise((r) => setTimeout(r, 40));
      assert.ok(w.document.getElementById('toast').classList.contains('on'),
        'the failure must be visible from the button that was pressed');
      assert.strictEqual(w.document.querySelector('.cta').disabled, false,
        'and the buttons must come back');
    } finally {
      w.close(); srv.close(); teaserSvc3.get = origGet;
    }
  });

  await t('BUILD FORM: three buttons, one submit, no duplicate POST', async () => {
    const fs = require('fs');
    const raw = fs.readFileSync(__dirname + '/public/build.html', 'utf8')
      .replace(/\{\{BASE\}\}/g, '').replace(/\{\{V\}\}/g, '');
    let posts = 0;
    const w = bootDom(raw, 'https://jobup.dev/build?t=tok');
    w.fetch = (url) => {
      if (String(url).includes('build-account')) posts++;
      return new Promise(() => {});     // never settles: the button stays busy
    };
    try {
      const gos = w.document.querySelectorAll('.go');
      assert.strictEqual(gos.length, 3, 'middle, bottom and pinned — got ' + gos.length);
      assert.ok(w.document.getElementById('stickygo').classList.contains('on'),
        'the pinned bar must be up before the form is touched');
      assert.ok(w.document.getElementById('sghint').textContent.includes('12'),
        'and it must say what is still missing');

      // Submitting from the PINNED button must run the same validation as the
      // one at the foot of the form — not skip it.
      click(w, w.document.getElementById('go3'));
      assert.strictEqual(posts, 0, 'an empty form must not POST');
      assert.ok(w.document.getElementById('err').className.includes('show'),
        'and the same error surface must explain why');

      w.document.getElementById('p1').value = 'a-very-long-password';
      w.document.getElementById('p2').value = 'a-very-long-password';
      w.document.getElementById('roles').value = 'Sales Executive';   // now required
      w.document.getElementById('p1').dispatchEvent(new w.Event('input', { bubbles: true }));
      assert.ok(w.document.getElementById('sghint').className.includes('ready'),
        'the hint must flip once the form is actually valid');

      click(w, w.document.getElementById('go3'));
      assert.strictEqual(posts, 1, 'the pinned button must submit the real form');
      const states = Array.from(w.document.querySelectorAll('.go')).map((b) => b.disabled);
      assert.deepStrictEqual(states, [true, true, true],
        'all three must lock together, or one of them invites a second account');
    } finally { w.close(); }
  });

  // THE LISTING QUESTION MUST BE ASKED, AND ITS ANSWER MUST TRAVEL.
  //
  // Being in the directory is the only thing that puts a subscriber in a
  // sitemap, and it was a dashboard toggle nobody found: 4 of 5 active
  // subscribers were unlisted, the paying one among them. It is now asked
  // during the build. Two ways that silently reverts — the field stops being
  // rendered, or it renders but is never put in the POST body — so this drives
  // the real form and reads the real request.
  await t('BUILD FORM: the directory question is asked, and the answer is sent', async () => {
    const fs = require('fs');
    const raw = fs.readFileSync(__dirname + '/public/build.html', 'utf8')
      .replace(/\{\{BASE\}\}/g, '').replace(/\{\{V\}\}/g, '');

    async function submitWith(optIn) {
      let body = null;
      const w = bootDom(raw, 'https://jobup.dev/build?t=tok');
      w.fetch = (url, init) => {
        if (String(url).includes('build-account')) body = JSON.parse(init.body);
        return new Promise(() => {});
      };
      try {
        const dir = w.document.getElementById('dir');
        assert.ok(dir, 'the listing question must be ON the build form, not only in the dashboard');
        assert.strictEqual(dir.checked, false, 'it is opt-in: it must start OFF');
        if (optIn) dir.checked = true;
        w.document.getElementById('p1').value = 'a-very-long-password';
        w.document.getElementById('p2').value = 'a-very-long-password';
        w.document.getElementById('roles').value = 'Sales Executive';   // now required
        click(w, w.document.getElementById('go3'));
        assert.ok(body, 'the form must have posted');
        return body;
      } finally { w.close(); }
    }

    assert.strictEqual((await submitWith(false)).directory_opt_in, false,
      'left alone it must send false — never omitted, or the server cannot tell '
      + '"declined" from "never asked"');
    assert.strictEqual((await submitWith(true)).directory_opt_in, true,
      'ticked, it must reach the server');

    // And the server must honour it rather than drop it on the floor.
    const intake = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(/presence:\s*\{[\s\S]{0,300}directory_opt_in/.test(intake),
      'targetingFrom() must carry the answer into settings');
    const on = settingsSvc.sanitize({ presence: { directory_opt_in: true } });
    assert.strictEqual(on.presence.directory_opt_in, true, 'and sanitize must preserve a yes');
    // Anything that is not an explicit yes stays a no, whatever shape it arrives in.
    for (const bad of [undefined, null, 0, 'no', 'false', 1, 'yes']) {
      assert.strictEqual(
        settingsSvc.sanitize({ presence: { directory_opt_in: bad } }).presence.directory_opt_in,
        false, 'opt-in means opt-in: ' + JSON.stringify(bad) + ' must not list somebody');
    }
  });

  // US ONLY, AND NOT EXPRESSIBLE OTHERWISE.
  //
  // The country picker is gone from the dashboard. Changing only the DEFAULT
  // would have left every existing row on what it already held — and [] means
  // UNRESTRICTED in geo.evaluate(), so subscribers who never touched the old
  // grid would keep being scored against postings they cannot take, with no
  // control anywhere to fix it.
  await t('MATCHES: the hunt is US only, and nothing can widen it', () => {
    assert.deepStrictEqual(settingsSvc.sanitize({}).geo.allowed_countries, ['US'],
      'a fresh profile is US only');
    for (const attempt of [[], ['GB'], ['US', 'GB', 'IN'], null, undefined, 'US,GB', ['us']]) {
      assert.deepStrictEqual(
        settingsSvc.sanitize({ geo: { allowed_countries: attempt } }).geo.allowed_countries,
        ['US'],
        'a stored ' + JSON.stringify(attempt) + ' must not widen the hunt — [] is UNRESTRICTED');
    }

    // And the engine must actually act on it.
    const geo = require('./src/services/geo');
    const pol = settingsSvc.sanitize({}).geo;
    const v = (raw) => geo.evaluate(raw, pol).verdict;
    assert.strictEqual(v('Tampa, FL'), 'allow');
    assert.strictEqual(v('Remote - US'), 'allow');
    assert.strictEqual(v('London, United Kingdom'), 'block');
    assert.strictEqual(v('Bengaluru, India'), 'block');
    // A locationless posting is FLAGGED for review, never silently included.
    assert.strictEqual(v(''), 'flag');
    assert.strictEqual(pol.flag_unknown, true);

    // The picker must be gone from the dashboard, or it would offer a choice
    // the server now overrides — a control that lies about what it does.
    const app = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(!/id="t-savegeo"/.test(app), 'the Save countries button must be gone');
    assert.ok(!/function saveGeo\(/.test(app), 'and its handler with it');
    assert.ok(!/var COUNTRIES=/.test(app), 'and the country list it rendered');
  });

  // STATE POLICY — the subscriber's to choose, unlike the country.
  //
  // THE RULE THAT MAKES IT USABLE: a remote-national posting is takeable from
  // any state, so a state filter must never touch it. Getting that wrong
  // deletes the best matches on the board — remote roles are exactly the ones a
  // state-restricted subscriber can take — and it fails SILENTLY, looking like
  // a thin week rather than a broken filter.
  await t('MATCHES: a state filter narrows the map without eating remote roles', () => {
    const geo = require('./src/services/geo');
    const pol = settingsSvc.sanitize({ geo: { allowed_states: ['fl', 'ga'] } }).geo;
    assert.deepStrictEqual(pol.allowed_states, ['fl', 'ga']);
    const v = (raw) => geo.evaluate(raw, pol);

    assert.strictEqual(v('Tampa, FL').verdict, 'allow');
    assert.strictEqual(v('Atlanta, Georgia').verdict, 'allow', 'the full name counts too');
    assert.strictEqual(v('Austin, TX').verdict, 'block');
    assert.strictEqual(v('London, United Kingdom').verdict, 'block', 'country still wins first');

    // The exemptions, each for a different reason.
    assert.strictEqual(v('Remote - US').verdict, 'allow', 'REMOTE-US MUST SURVIVE A STATE FILTER');
    assert.strictEqual(v('Remote (US only)').verdict, 'allow');
    assert.strictEqual(v('Remote - Global').verdict, 'allow');
    assert.strictEqual(v('United States').verdict, 'flag',
      'US but state unstated is judged by the subscriber, never silently dropped');
    assert.strictEqual(v('').verdict, 'flag');
    // Multi-location: one in policy is enough.
    assert.strictEqual(v('Miami, FL or Austin, TX').verdict, 'allow');

    // Unticked means the whole country, not "nowhere".
    const none = settingsSvc.sanitize({}).geo;
    assert.deepStrictEqual(none.allowed_states, []);
    assert.strictEqual(geo.evaluate('Austin, TX', none).verdict, 'allow',
      'AN EMPTY LIST MUST MEAN THE WHOLE COUNTRY');

    // Junk cannot become a filter that matches nothing.
    assert.deepStrictEqual(
      settingsSvc.sanitize({ geo: { allowed_states: ['FL', 'fl', 'zz', '', null, 'florida'] } })
        .geo.allowed_states, ['fl'], 'deduped, normalised, unknown codes dropped');

    // Two-letter codes must only be read after a comma: half of them are
    // ordinary English words, and a bare scan turns "Remote or hybrid" into
    // Oregon and "Bengaluru, India" into Indiana.
    assert.deepStrictEqual(geo.statesIn('remote or hybrid'), []);
    assert.deepStrictEqual(geo.statesIn('bengaluru, india'), []);
    assert.deepStrictEqual(geo.statesIn('washington, d.c.'), ['dc'],
      'DC must not read as Washington state');
    assert.deepStrictEqual(geo.statesIn('seattle, wa'), ['wa']);

    // ONE DROPDOWN, NOT 51 CHECKBOXES. The grid pushed the rest of the page
    // below the fold and made a one-line answer look like configuration.
    const app = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(/<select id="t-state">/.test(app), 'the state control must be a dropdown');
    assert.ok(/Whole country (—|\\u2014) every state/.test(app),
      'and "everywhere" must be an option in it, not a separate button');
    assert.ok(!/id="t-allstates"/.test(app), 'the old checkbox grid controls must be gone');

    // THE CHECKLIST LIVES IN ONE PLACE. It was rendered on Account AND on the
    // Getting-found tab, both writing the same record — a screen that can
    // disagree with itself.
    assert.ok(!/loadFound|foundbox/.test(app), 'the duplicated Get found block must be gone');
    assert.ok(/id="g-place"|class="sw g-place"/.test(app),
      'and the one on the Getting found tab must remain');
  });

  // THE STATE IS SET FROM THE RÉSUMÉ, AND ONLY WHEN IT IS UNAMBIGUOUS.
  await t('MATCHES: the state defaults to the one the résumé states', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(/function resumeState\(/.test(src), 'build-account must derive it');
    assert.ok(/hits\.length === 1 \? hits\[0\] : null/.test(src),
      'TWO states on a résumé is not a preference — picking one would be a guess '
      + 'presented as a setting, and too-narrow hides real jobs silently');
    assert.ok(/geo: resumeState \? \{ allowed_states: \[resumeState\] \} : \{\}/.test(src),
      'and it must reach the settings document');

    // The real shapes, against the real résumé values on file.
    const geo = require('./src/services/geo');
    const one = (loc) => {
      const h = geo.statesIn(String(loc || '').toLowerCase());
      return h.length === 1 ? h[0] : null;
    };
    assert.strictEqual(one('Tampa, Florida'), 'fl');
    assert.strictEqual(one('Wesley Chapel, FL'), 'fl');
    assert.strictEqual(one('Philippines'), null, 'not a US state — whole country');
    assert.strictEqual(one(''), null);
    assert.strictEqual(one('Tampa, FL / Austin, TX'), null, 'ambiguous — whole country');
  });

  // A HIDDEN ROLE LEAVES EVERY SURFACE SOMEBODY ELSE SEES — AND ONLY THOSE.
  //
  // The split is the whole design. Public surfaces and the tailored PDF are
  // shown to other people, so a hidden role must be absent from all of them or
  // the switch is a lie. Job MATCHING is private and only the subscriber sees
  // it, so the role still counts there: dropping it would quietly make their
  // results worse in exchange for a decision about presentation.
  await t('CV: a role can be hidden from the public CV without leaving the profile', () => {
    const profileSvc = require('./src/services/profile');
    const tailoring = require('./src/services/tailoring');
    const raw = {
      name: 'Ada', headline: 'AE', summary: 'S', skills: ['B2B'],
      experience: [
        { title: 'Sales Executive', company: 'Globex', highlights: ['Closed regional deals'] },
        { title: 'Secretary', company: 'OldCo', hidden: true, highlights: ['Filed papers'] },
        { title: 'Analyst', company: 'Acme', hidden: false, highlights: ['Built models'] },
      ], education: [],
    };
    const saved = profileSvc.applyEdit({}, raw);
    assert.deepStrictEqual(saved.experience.map((e) => e.hidden), [false, true, false],
      'the flag must persist, and default to shown');

    // Absent means SHOWN: every résumé parsed before this existed keeps all of
    // its roles rather than silently losing them.
    const legacy = profileSvc.applyEdit({}, {
      experience: [{ title: 'Old Role', company: 'X', highlights: ['a'] }] });
    assert.strictEqual(legacy.experience[0].hidden, false,
      'A RÉSUMÉ WITH NO FLAG MUST KEEP EVERY ROLE VISIBLE');
    // And only an explicit true hides one.
    for (const bad of [undefined, null, 0, '', 'no', 'false', 1]) {
      assert.strictEqual(
        profileSvc.applyEdit({}, { experience: [{ title: 'R', company: 'C', hidden: bad }] })
          .experience[0].hidden, false,
        JSON.stringify(bad) + ' must not remove work history');
    }

    const st = settingsSvc.sanitize({});
    const names = (xs) => (xs || []).map((x) => x.title || x.position).join(',');

    // Every public surface is built from applyPrivacy, so one filter covers all
    // of them. Filtering in the page renderer alone would hide it on the page
    // while resume.json still served it — worse than not offering the switch.
    assert.strictEqual(names(identity.applyPrivacy(saved, st).experience),
      'Sales Executive,Analyst', 'the public projection must drop it');
    assert.strictEqual(names(identity.resumeJson(saved, st, { name: 'Ada' }).work),
      'Sales Executive,Analyst', 'and resume.json with it');
    assert.ok(!identity.llmsTxt(saved, st, { name: 'Ada', url: 'https://a.dev' }).includes('Secretary'));

    // The tailored PDF goes to an EMPLOYER, so it drops the role too.
    const built = tailoring.build(saved, { title: 'AE', description: 'sales deals models' }, {});
    assert.strictEqual(built.content.roles.map((r) => r.title).join(','),
      'Sales Executive,Analyst', 'a hidden role must not reach a résumé they send');

    // But MATCHING still sees it: the hunter reads resume_json directly, never
    // the public projection.
    assert.strictEqual(saved.experience.length, 3, 'the role stays on the profile');
    const agents = require('fs').readFileSync(__dirname + '/src/services/agents/index.js', 'utf8');
    assert.ok(/profile: \(profileRow && profileRow\.resume_json\) \|\| \{\}/.test(agents),
      'scoring must read the raw profile, not applyPrivacy — hiding a role is a '
      + 'presentation choice and must not degrade their matches');

    // The editor must get the flag back, or the select resets on every load.
    assert.deepStrictEqual(profileSvc.forEditor(saved).experience.map((e) => e.hidden),
      [false, true, false]);

    // And the control has to exist and be wired, or the flag is unreachable.
    const app = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(app.includes('<select class="x-hidden">'), 'the CV editor must render the select');
    assert.ok(/hidden:g\('x-hidden'\)==='1'/.test(app), 'and saveCV must send it');
  });

  // ===== THE HELP AGENT ====================================================
  section('the assistant answers about THIS account, and cannot act');

  await t('ASSISTANT: the same question gets a different answer per account', async () => {
    const A = require('./src/services/assistant');
    const gappy = settingsSvc.sanitize({
      targeting: { roles: [] },
      presence: { placed: ['linkedin'], directory_opt_in: false } });
    const done = settingsSvc.sanitize({
      targeting: { roles: [{ title: 'Sales Executive' }] },
      presence: { placed: ['linkedin', 'job_boards', 'github', 'email_signature', 'qr'],
                  directory_opt_in: true },
      identity_links: [{ url: 'https://github.com/ada' }] });
    const base = { question: 'How can I increase visibility?', profile: { name: 'Ada' },
                   counts: { matches: 12, opportunities: 1, tailorings: 0, credits: 0 },
                   subscriber: { name: 'Ada', address: 'ada.jobup.dev', language: 'en' } };

    const a = await A.ask({ ...base, settings: gappy });
    const b = await A.ask({ ...base, settings: done });
    assert.notStrictEqual(a.answer, b.answer,
      'A GENERIC ANSWER IS WORSE THAN NONE — it sends somebody to redo work they '
      + 'have already done and leaves the real gap untouched');
    assert.match(a.answer, /no role titles/i, 'it must name the actual gap');
    assert.match(b.answer, /complete|waiting/i, 'and must not tell a finished account to start');
    assert.deepStrictEqual(a.actions, [{ tab: 'guide', label: 'Getting found' }],
      'and it must point at the real tab');

    // The snapshot is assembled from rows, so a wrong count is impossible
    // rather than merely unlikely.
    const snap = A.snapshot({ profile: { name: 'Ada', skills: ['a', 'b'],
        experience: [{ title: 'X', hidden: true }, { title: 'Y' }] },
      settings: gappy, counts: { matches: 7, opportunities: 2, tailorings: 1, credits: 3 },
      subscriber: { name: 'Ada', address: 'ada.jobup.dev' } });
    assert.match(snap, /Skills on file: 2/);
    assert.match(snap, /Roles on the résumé: 2 \(1 hidden/);
    assert.match(snap, /Job matches on the board: 7/);
    assert.match(snap, /Identity links \(sameAs\): 0/);
  });

  await t('ASSISTANT: it cannot invent a control, and it cannot act', () => {
    const A = require('./src/services/assistant');
    // A confident "open the Billing tab" pointing at a tab that does not exist
    // is the fastest way to make an assistant untrustworthy.
    assert.deepStrictEqual(
      A.cleanActions([{ tab: 'billing', label: 'Billing' }, { tab: 'nope' },
                      { tab: 'guide' }, { tab: 'guide' }, { tab: 'cv' }]),
      [{ tab: 'guide', label: 'Getting found' }, { tab: 'cv', label: 'My CV' }],
      'unknown tabs dropped, duplicates collapsed');
    assert.deepStrictEqual(A.cleanActions('nonsense'), []);
    assert.deepStrictEqual(A.cleanActions([{ tab: 'guide', label: 'CLICK HERE NOW' }]),
      [{ tab: 'guide', label: 'Getting found' }],
      'the LABEL is ours — a model may not rename a tab in the UI');
    // Every tab it may name has to exist in the dashboard.
    const app = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    for (const tab of Object.keys(A.TABS)) {
      assert.ok(app.includes('data-p="' + tab + '"'), 'assistant names a missing tab: ' + tab);
    }

    // NO TOOL SURFACE. It advises and links; everything in this product is
    // approval-gated and the assistant is not the exception.
    const src = require('fs').readFileSync(__dirname + '/src/services/assistant.js', 'utf8');
    assert.ok(!/scoped\(|models\.|\.update\(|\.create\(|\.destroy\(/.test(src),
      'THE ASSISTANT MUST NOT BE ABLE TO WRITE ANYTHING');
    assert.ok(/tools?:/.test(src) === false, 'and must have no tool definitions');

    // It must not contradict what the product refuses to do.
    assert.match(A.SYSTEM, /Never claim JobUp applies to jobs/);
    assert.match(A.CAPABILITIES, /NEVER applies to a job/);
  });

  await t('ASSISTANT: capped, and honest with no model', async () => {
    const A = require('./src/services/assistant');
    const src = require('fs').readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    // A chat box is an open invitation to a loop.
    assert.ok(/JOBUP_ASSISTANT_DAILY/.test(src) && /status\(429\)/.test(src),
      'a per-tenant daily cap is the only thing between a stuck client and a bill');
    // The keyless path answers from the SAME snapshot rather than apologising.
    const out = await A.ask({ question: 'why am I not getting matches?',
      profile: {}, settings: settingsSvc.sanitize({}),
      counts: { matches: 0, opportunities: 0, tailorings: 0, credits: 0 },
      subscriber: { language: 'en' } });
    assert.strictEqual(out.is_simulated, true, 'with no key it is labelled, never a silent fake');
    assert.ok(out.answer.length > 40, 'and still says something useful');
    assert.ok(out.actions.every((a) => A.TABS[a.tab]), 'with real actions');

    // A FALLBACK THAT ANSWERS THE WRONG QUESTION CONFIDENTLY IS WORSE THAN ONE
    // THAT ADMITS THE LIMIT. The first version fell through to the visibility
    // answer whenever nothing matched, so "what does tailoring cost?" got a
    // paragraph about sitemaps.
    const st2 = settingsSvc.sanitize({ targeting: { roles: [{ title: 'AE' }] } });
    const ctx = { profile: { name: 'Ada' }, settings: st2,
      counts: { matches: 12, opportunities: 1, tailorings: 0, credits: 2 },
      subscriber: { language: 'en' } };
    const price = await A.ask({ ...ctx, question: 'What does tailoring cost?' });
    assert.match(price.answer, /\$10/, 'a price question must get the price');
    assert.match(price.answer, /2 credit/, 'grounded in the real credit count');
    const applies = await A.ask({ ...ctx, question: 'Does JobUp apply to jobs for me?' });
    assert.match(applies.answer, /never applies/i, 'and the honest refusal must survive');
    const off = await A.ask({ ...ctx, question: 'What is the weather in Tampa?' });
    assert.match(off.answer, /could not match|rather say so/i,
      'AN UNMATCHED QUESTION MUST ADMIT IT, not fall through to a confident wrong answer');
    assert.ok(!/sitemap/i.test(off.answer), 'and must not answer a question nobody asked');
  });

  await t('ASSISTANT: the launcher is the brand badge, and it is actually served', () => {
    const fs = require('fs');
    const app = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(fs.existsSync(__dirname + '/public/ask-icon.svg'), 'the icon file must exist');
    assert.ok(/id="askfab"[\s\S]{0,200}ask-icon\.svg/.test(app), 'the launcher must use it');
    assert.ok(/class="askmark"[\s\S]{0,80}ask-icon\.svg/.test(app),
      'and the panel header too — the thing you opened should look like the thing you clicked');
    assert.ok(/aria-label="Chat with Eva"/.test(app), 'named, and labelled for a screen reader');

    // THE FAILURE THIS EXISTS TO CATCH: a subscriber subdomain serves ONLY the
    // assets named in pwa.serveAsset, and the dashboard runs on those
    // subdomains. Left out of that list the button renders a broken image on
    // every subscriber's own site while looking perfect on jobup.dev.
    const pwaSrc = fs.readFileSync(__dirname + '/src/services/pwa.js', 'utf8');
    assert.ok(/'\/ask-icon\.svg'/.test(pwaSrc),
      'ask-icon.svg must be in the subscriber-subdomain asset allowlist');

    // Prove it end to end through the real handler rather than by grep.
    let sent = null;
    const res = {
      set() { return this; }, type() { return this; }, json() { return this; },
      send() { return this; },
      sendFile(p, opts) { sent = { p, opts }; },
    };
    const served = pwaSvc.serveAsset({ path: '/ask-icon.svg', query: { v: '5' } }, res, '');
    assert.strictEqual(served, true, 'serveAsset must answer for it');
    assert.match(sent.p, /ask-icon\.svg$/);
    assert.strictEqual(sent.opts.immutable, true, 'and a versioned url may be cached hard');
  });

  await t('ASSISTANT: the panel opens, answers, and its action navigates', () => {
    const fs = require('fs');
    const raw = fs.readFileSync(__dirname + '/public/app.html', 'utf8')
      .replace(/\{\{BASE\}\}/g, '').replace(/\{\{V\}\}/g, '').replace(/\{\{PRICE\}\}/g, '59');
    // The binding IIFE runs where the script sits, so the markup must come
    // FIRST — a listener attached to null is silence, and that shipped once.
    assert.ok(raw.indexOf('class="askfab"') < raw.indexOf('<script src'),
      'the panel markup must precede the script that binds it');

    let asked = null;
    const { JSDOM, VirtualConsole } = require('jsdom');
    const w = new JSDOM(raw, {
      runScripts: 'dangerously', url: 'https://a.jobup.dev/app',
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true,
      beforeParse(win) {
        win.fetch = (u, o) => {
          if (String(u).includes('/engine/assistant')) {
            asked = JSON.parse(o.body);
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
              answer: 'Open Getting found — you have no role titles set.',
              actions: [{ tab: 'guide', label: 'Getting found' }], is_simulated: true }) });
          }
          return new Promise(() => {});
        };
        win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {},
                                  addListener() {}, removeListener() {} });
        win.scrollTo = () => {};
      },
    }).window;
    const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    try {
      const d = w.document;
      assert.strictEqual(d.getElementById('askpanel').hidden, true, 'starts closed');
      click(d.getElementById('askfab'));
      assert.strictEqual(d.getElementById('askpanel').hidden, false, 'the launcher must open it');
      assert.ok(d.querySelectorAll('#askchips button').length >= 3, 'with example questions');

      d.getElementById('askq').value = 'How can I increase my visibility?';
      click(d.getElementById('asksend'));
      assert.deepStrictEqual(asked, { question: 'How can I increase my visibility?' });
      return new Promise((resolve, reject) => setTimeout(() => {
        try {
          const act = d.querySelector('.askacts button');
          assert.ok(act, 'the answer must render its action as a button');
          assert.strictEqual(act.textContent, 'Getting found');
          click(act);
          assert.strictEqual(d.getElementById('p-guide').classList.contains('hidden'), false,
            'AND THE BUTTON MUST ACTUALLY NAVIGATE — an instruction to go hunting '
            + 'for a screen is not an answer');
          assert.strictEqual(d.getElementById('askpanel').hidden, true, 'then get out of the way');
          resolve();
        } catch (e) { reject(e); } finally { w.close(); }
      }, 120));
    } catch (e) { w.close(); throw e; }
  });

  // ===== EN / ES ===========================================================
  section('the whole funnel speaks Spanish');

  await t('LANDING: the toggle translates everything and round-trips exactly', () => {
    const fs = require('fs');
    const raw = fs.readFileSync(__dirname + '/public/index.html', 'utf8')
      .replace(/\{\{BASE\}\}/g, '').replace(/\{\{V\}\}/g, '').replace(/\{\{PRICE\}\}/g, '59');
    const w = bootDom(raw, 'https://jobup.dev/');
    try {
      const d = w.document;
      const txt = (s) => (d.querySelector(s) || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();

      // ENGLISH IS IN THE MARKUP, NOT INJECTED. A shell filled in by script
      // would ship a blank page to every crawler — on a product whose entire
      // purpose is being found.
      assert.match(raw, /Stop Looking for Jobs/, 'the English hero must be static HTML');
      assert.strictEqual(d.querySelectorAll('[data-setlang]').length, 2, 'EN and ES');

      const enH1 = txt('h1'), enLede = txt('.lede');
      assert.match(enH1, /Stop Looking for Jobs/);

      w.juApplyLang('es', false);
      assert.strictEqual(d.documentElement.getAttribute('lang'), 'es');
      assert.strictEqual(d.querySelector('.d2b').getAttribute('data-lang'), 'es',
        'the CSS hook must flip too — the orb state suffixes are ::after content');
      assert.match(txt('h1'), /Deja de buscar empleo/);
      assert.match(txt('.lede'), /Habla con el Orbe/);
      assert.match(txt('#orb-caption'), /Dalia/, 'the caption must name the Spanish voice');
      assert.match(txt('#ju-go'), /Construir mi vista previa/);
      assert.strictEqual(d.getElementById('ju-text').getAttribute('placeholder'),
        'Pega aquí el texto de tu currículum...');
      // A SPANISH VISITOR MUST NOT BE CREATED AS AN ENGLISH ACCOUNT.
      assert.strictEqual(d.getElementById('ju-lang').value, 'es',
        'the form language must follow the page, or somebody who never opened '
        + 'the field gets an English onboarding');
      assert.strictEqual(d.querySelector('[data-setlang="es"]').getAttribute('aria-pressed'), 'true');

      // Switching back must restore the ORIGINAL bytes, not a second table.
      w.juApplyLang('en', false);
      assert.strictEqual(txt('h1'), enH1, 'EN must round-trip exactly');
      assert.strictEqual(txt('.lede'), enLede);
      assert.strictEqual(d.getElementById('ju-lang').value, 'en');

      // Nothing may be left untranslated by accident: every key the markup
      // names must exist in the Spanish table.
      const keys = new Set();
      ['data-i18n', 'data-i18n-html', 'data-i18n-ph'].forEach((a) => {
        d.querySelectorAll('[' + a + ']').forEach((el) => keys.add(el.getAttribute(a)));
      });
      const missing = Array.from(keys).filter((k) => w.JU_T.es[k] === undefined);
      assert.deepStrictEqual(missing, [], 'untranslated keys: ' + missing.join(', '));
      assert.ok(keys.size >= 50, 'the whole page is tagged, not just the hero — got ' + keys.size);
    } finally { w.close(); }
  });

  await t('LANDING: the orb speaks Spanish with Dalia', () => {
    const src = require('fs').readFileSync(__dirname + '/public/index.html', 'utf8');
    assert.ok(/VOICE=\{en:'ava',es:'dalia'\}/.test(src), 'Dalia is the ES voice');
    assert.ok(/voice:VOICE\[olang\]/.test(src), 'and the request must use it');
    assert.ok(/u\.lang=LOCALE\[olang\]/.test(src), 'the browser fallback too');
    assert.ok(/Hola, soy Dalia, la voz de JobUp\./.test(src), 'with a Spanish script');
    // Switching language mid-sentence must stop the old voice and drop the
    // cached audio, or Ava finishes an English line on a Spanish page.
    assert.ok(/window\.__juOrbLang=function[\s\S]{0,400}cache=\{\}[\s\S]{0,80}if\(playing\) stop\(\)/.test(src),
      'a language switch must reset the orb');
    // dalia must be a real alias in the shared TTS route, not a hopeful string.
    const tts = require('fs').readFileSync(__dirname + '/../../src/routes/presentation-tts.js', 'utf8');
    assert.ok(/dalia:\s*'es-MX-DaliaNeural'/.test(tts), 'the alias must exist server-side');
  });

  await t('ONBOARDING: the account form is Spanish when the teaser was', () => {
    const fs = require('fs');
    const i18n = fs.readFileSync(__dirname + '/public/i18n.js', 'utf8');
    const build = fs.readFileSync(__dirname + '/public/build.html', 'utf8');
    const welcome = fs.readFileSync(__dirname + '/public/welcome.html', 'utf8');
    assert.ok(build.includes('i18n.js') && welcome.includes('i18n.js'));
    // THE LANGUAGE COMES FROM THE TEASER ROW, not from a second question. The
    // preview and the account must not disagree about who this person is.
    assert.ok(/JobUpI18n\.apply\(j\.language/.test(build),
      'build.html must take the language from the /build payload');
    assert.ok(/language: t\.language \|\| 'en'/.test(
      fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8')),
      'and the payload must carry it');

    // Behaviour, in a real DOM.
    const raw = build.replace(/\{\{BASE\}\}/g, '').replace(/\{\{V\}\}/g, '');
    const w = bootDom(raw, 'https://jobup.dev/build?t=tok');
    try {
      const s = w.document.createElement('script');
      s.textContent = i18n;
      w.document.head.appendChild(s);
      w.JobUpI18n.apply('es');
      const d = w.document;
      const txt = (x) => (d.querySelector(x) || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
      assert.strictEqual(txt('h1'), 'Crear mi cuenta');
      assert.match(txt('.lede'), /Dos cosas/);
      assert.strictEqual(d.documentElement.getAttribute('lang'), 'es');
      assert.strictEqual(d.getElementById('roles').getAttribute('placeholder'),
        'Jefe de Proyecto, Responsable de Operaciones, Analista de Negocio');
      // Chips are painted by script AFTER the first pass; refresh() must catch
      // them or half the form stays English.
      w.chips('etypes', ['full_time', 'part_time'], 'etype');
      assert.match(d.getElementById('etypes').textContent, /Jornada completa/);
      // An UNKNOWN string must stay English rather than going blank — that is
      // the whole reason this matches text instead of keys.
      const el = d.createElement('p'); el.textContent = 'A string nobody translated';
      d.body.appendChild(el);
      w.JobUpI18n.refresh(d.body);
      assert.strictEqual(el.textContent, 'A string nobody translated',
        'a missing translation must never produce an empty label');
    } finally { w.close(); }
  });

  // THE DASHBOARD, NOT JUST THE FRONT DOOR.
  //
  // Nearly every dashboard string is built inside JS template concatenation, so
  // it does not exist until a fetch resolves — there is no element to tag at
  // author time. This drives the real dashboard against stubbed responses,
  // applies Spanish, and asserts that what is LEFT in English is only the
  // subscriber's own data. Reading the source instead would prove nothing:
  // the strings are not in it in the form the user sees.
  await t('DASHBOARD: the whole interface renders in Spanish', async () => {
    const fs = require('fs');
    const FIX = {
      '/api/v1/auth/session': { id: 4, email: 'a@b.co', name: 'Ada', address: 'ada.jobup.dev' },
      '/api/v1/engine/me': { id: 4, email: 'a@b.co', name: 'Ada', address: 'ada.jobup.dev',
                             status: 'active', headline: 'Sales Executive', language: 'es' },
      '/api/v1/engine/settings': { settings: settingsSvc.sanitize({
        targeting: { roles: [{ title: 'Sales Executive', slug: 'sales-executive', page: true }],
                     industries: ['Fintech'], employers: ['Citi'], exclude_keywords: ['door to door'] },
        identity_links: [{ url: 'https://github.com/ada' }], geo: { allowed_states: ['fl'] } }) },
      '/api/v1/engine/matches': { matches: [{ id: 1, score: 92, stage: 'new',
        job: { id: 7, title: 'Sales Executive', employer: 'Globex', location: 'Tampa, FL' } }] },
      '/api/v1/engine/pipeline': { stages: ['new', 'saved', 'applied', 'screening', 'interviewing', 'offer', 'closed'],
        pipeline: { new: [{ id: 1, score: 92, display_title: 'Sales Executive', display_employer: 'Globex', source: 'hunter', stage: 'new' }],
                    saved: [], applied: [], screening: [], interviewing: [], offer: [], closed: [] } },
      '/api/v1/engine/analytics?days=30': { views: 12, unique_visitors: 8, views_all_time: 30,
        agent_views: 2, per_day: [{ date: '2026-08-01', views: 3 }], referrers: [], pages: [],
        agents: [], note: 'Counts real requests.' },
      '/api/v1/engine/presence': { address: 'https://ada.jobup.dev', done_count: 1, total: 5,
        directory_opt_in: true, identity_links: [], role_pages: [{ title: 'Sales Executive' }],
        note: 'These are prerequisites, not guarantees.',
        items: settingsSvc.presenceChecklist({}, 'en').items },
      // loadCV fetches /engine/profile, not /engine/cv — a wrong key here makes
      // renderCV read an undefined profile and the whole pane never paints.
      '/api/v1/engine/profile': { profile: { name: 'Ada', headline: 'Sales Executive', skills: ['B2B'],
        experience: [{ title: 'AE', company: 'Acme' }], education: [] }, source_text: 'x' },
      '/api/v1/engine/tailorings': { tailorings: [] },
      '/api/v1/engine/tailor/pricing': { price_usd: 10, credits: 0, configured: true },
    };
    const pick = (p) => FIX[p] || FIX[Object.keys(FIX).find((k) => p.startsWith(k.split('?')[0]))] || {};

    const { JSDOM, VirtualConsole } = require('jsdom');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8')
      .replace(/\{\{BASE\}\}/g, '').replace(/\{\{V\}\}/g, '').replace(/\{\{PRICE\}\}/g, '59');
    const dom = new JSDOM(html, {
      runScripts: 'dangerously', url: 'https://ada.jobup.dev/app',
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true,
      beforeParse(win) {
        win.fetch = (u) => Promise.resolve({ ok: true, status: 200,
          json: () => Promise.resolve(pick(String(u).replace('https://ada.jobup.dev', ''))) });
        win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {},
                                  addListener() {}, removeListener() {} });
        win.scrollTo = () => {};
      },
    });
    const w = dom.window;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      const sc = w.document.createElement('script');
      sc.textContent = fs.readFileSync(__dirname + '/public/i18n.js', 'utf8');
      w.document.head.appendChild(sc);
      assert.strictEqual(typeof w.JobUpI18n, 'object', 'the translator must load');

      await sleep(250);
      try { w.boot(); } catch (e) { /* boot repaints; failures surface below */ }
      await sleep(300);
      // renderCV reads a module-level CV that loadCV fills asynchronously; in a
      // stubbed run a pane can be shown before that lands. Seed it so visiting
      // every tab exercises the RENDER rather than an ordering artefact.
      if (!w.CV) w.CV = { name: 'Ada', headline: 'Sales Executive', skills: ['B2B'],
                          experience: [{ title: 'AE', company: 'Acme' }], education: [] };
      w.JobUpI18n.apply('es');
      if (w.juWatchPanes) w.juWatchPanes();
      // Visit every pane so every render function has run at least once.
      for (const p of (w.PANES || [])) { try { w.showTab(p); } catch (e) { /* keep going */ } }
      await sleep(300);
      w.JobUpI18n.refresh(w.document.body);

      // Harvest what the user can actually read.
      const seen = new Set();
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) {
            const t2 = c.nodeValue.replace(/\s+/g, ' ').trim();
            if (t2.length > 2 && /[A-Za-z]{3}/.test(t2) && !/^https?:\/\//.test(t2)) seen.add(t2);
          } else if (c.nodeType === 1 && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE') walk(c);
        }
      };
      walk(w.document.body);

      // The subscriber's OWN data is never translated — job titles, employers,
      // skills and keywords are theirs, and are shown verbatim in both
      // languages exactly as the tailoring engine treats them.
      const OWN = ['Sales Executive', 'Globex', 'Tampa, FL', 'Fintech', 'Citi', 'door to door',
                   'Acme', 'AE', 'B2B', 'Ada', 'ada.jobup.dev', 'Counts real requests.',
                   'These are prerequisites, not guarantees.'];
      const englishish = (s2) => !/[áéíóúñ¿¡]/i.test(s2)
        && /\b(the|your|and|you|is|are|of|for|with|that|this|not|will|from|every|each|they|what|how)\b/i.test(s2);
      const left = Array.from(seen).filter((s2) =>
        englishish(s2) && !OWN.some((o) => s2 === o || s2.includes(o)));

      assert.ok(seen.size > 120, 'the whole dashboard must have rendered — got ' + seen.size);
      assert.deepStrictEqual(left, [],
        'STILL IN ENGLISH: ' + left.slice(0, 6).map((x) => JSON.stringify(x.slice(0, 80))).join(', '));
      // And Spanish really is on screen, not merely an absence of English.
      const all = Array.from(seen).join(' ');
      assert.ok(/puesto|ofertas|reclutador|currículum/i.test(all), 'Spanish must be present');
    } finally { w.close(); }
  });

  await t('DASHBOARD: the language lives on the row, not in the browser', () => {
    const src = require('fs').readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    // A browser-local preference does not travel. Somebody who signed up in
    // Spanish and opens the dashboard on their phone must still get Spanish.
    assert.ok(/language: sub\.language === 'es' \? 'es' : 'en'/.test(src),
      '/me must report the subscriber row language');
    assert.ok(/router\.patch\('\/language'/.test(src), 'and the toggle must persist it');
    const app = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(/juSetLang\(r\.j\.language\|\|'en',false\)/.test(app),
      'the dashboard must apply the row language on boot');
    assert.ok(/data-setlang="es"/.test(app), 'and offer a toggle');
    // Every repaint must be re-translated, or half a pane silently reverts.
    assert.ok(/MutationObserver/.test(app), 'a repaint must re-run the pass');
  });

  // ===== PAID TAILORING ====================================================
  // Money and a document that goes to an employer. Both have to be exact.
  await t('TAILORING: the PDF is the subscriber’s own words, selected not written', async () => {
    const tailoring = require('./src/services/tailoring');
    const pdf = require('./src/services/resume-pdf');
    const profile = {
      name: 'Carlos Gomez', headline: 'Sales Executive', summary: 'Sells things in Florida.',
      email: 'c@example.com', location: 'Tampa, FL',
      skills: ['B2B sales', 'CRM', 'forecasting'],
      education: [{ studyType: 'BS', area: 'Marketing', institution: 'USF', end: '2011' }],
      experience: [{
        title: 'Account Executive', company: 'Acme', start: '2019', end: '2024',
        highlights: ['Closed regional CRM deals with mid-market accounts.',
                     'Ran a forecasting cadence for the Florida territory.',
                     'Trained two junior reps on B2B discovery.'],
      }],
    };
    const job = { title: 'Senior Account Executive', employer: 'Globex',
                  description: 'B2B sales, CRM, forecasting, territory planning, quota.' };

    const built = tailoring.build(profile, job, { summary: null });
    const bullets = built.content.roles.flatMap((r) => r.bullets);
    const corpus = JSON.stringify(profile);
    for (const b of bullets) {
      assert.ok(corpus.includes(b),
        'EVERY BULLET MUST BE VERBATIM FROM THE RÉSUMÉ — a line that reaches an '
        + 'employer has to be defensible in the interview: ' + b);
    }
    assert.ok(built.keyword_coverage.pct >= 0 && built.keyword_coverage.pct <= 100);
    assert.strictEqual(built.summary_source, 'resume', 'no model summary offered = keep theirs');

    // The one free-text field is verified, and REJECTED WHOLE rather than patched.
    const invented = tailoring.verifySummary(
      'Sales leader who grew revenue by $4M across 12 countries using Salesforce.', corpus);
    assert.strictEqual(invented.ok, false, 'an invented number/tool must not reach the PDF');
    assert.ok(invented.introduced.some((x) => /4M|12|salesforce/i.test(x)));
    const honest = tailoring.verifySummary('Sells things in Florida.', corpus);
    assert.strictEqual(honest.ok, true, 'and their own words must survive');

    // A rejected summary falls back to theirs, never to nothing and never to the
    // rejected text.
    const withBad = tailoring.build(profile, job,
      { summary: 'Delivered $9M in pipeline across EMEA.' });
    assert.strictEqual(withBad.summary_source, 'resume');
    assert.strictEqual(withBad.content.summary, profile.summary);

    const buf = await pdf.render(built.content, { title: 'x' });
    assert.ok(buf.length > 1000 && buf.slice(0, 5).toString() === '%PDF-', 'a real PDF');
    assert.match(pdf.filename('Carlos Gomez', 'Globex', 2), /^Carlos_Gomez_Resume_Globex_v2\.pdf$/);
  });

  await t('TAILORING: $10, and a credit only exists from a payment Stripe confirms', () => {
    const fs = require('fs');
    const billing = require('./src/services/billing');
    assert.strictEqual(billing.TAILOR_PRICE_USD, 10, 'the price is $10 unless overridden');

    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    const claim = src.slice(src.indexOf("router.post('/tailor/claim'"),
                            src.indexOf("router.post('/tailor/:jobId'"));
    // The four ways a free tailoring could be minted, each closed explicitly.
    assert.ok(/verifyTailorSession/.test(claim),
      'the credit must come from Stripe, not from the redirect the buyer controls');
    assert.ok(/if \(!v\.paid\)/.test(claim), 'an unpaid session must be refused');
    assert.ok(/v\.purpose !== 'tailor_credit'/.test(claim),
      'a session for something else must not buy a tailoring');
    assert.ok(/v\.subscriberId !== tid/.test(claim),
      "SOMEBODY ELSE'S PAYMENT MUST NOT CREDIT THE SIGNED-IN ACCOUNT");
    assert.ok(/c\.stripe_session_id === v\.sessionId/.test(claim),
      'and refreshing the return url must not mint a second credit for one payment');

    const tailor = src.slice(src.indexOf("router.post('/tailor/:jobId'"),
                             src.indexOf("router.get('/tailorings'"));
    assert.ok(/needs_payment: true/.test(tailor), 'no credit = an honest 402, not a free run');
    // Ordering is the whole guarantee: the credit is spent AFTER the row exists,
    // so a model outage cannot burn somebody's ten dollars.
    const iCreate = tailor.indexOf("scoped('tailored_resumes', tid).create");
    const iSpend = tailor.indexOf("scoped('tailor_credits', tid).update");
    assert.ok(iCreate > 0 && iSpend > iCreate,
      'THE CREDIT MUST BE CONSUMED ONLY AFTER THE DOCUMENT EXISTS');

    // The PDF is rendered from the stored document, never read off Render's
    // ephemeral disk, or "recover the exact file I sent" dies at the next deploy.
    const pdfRoute = src.slice(src.indexOf("router.get('/tailorings/:id/pdf'"));
    assert.ok(/resumePdf\.render\(row\.doc/.test(pdfRoute));
    assert.ok(!/readFile|createReadStream/.test(pdfRoute), 'nothing may be read off disk');
  });

  await t('MATCHES: the card carries the PDF, and the two dead buttons are gone', () => {
    const app = require('fs').readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(!/onclick="ats\(/.test(app), 'Keyword check is gone — the number now '
      + 'arrives with the document it describes');
    assert.ok(!/onclick="applied\(/.test(app), 'I applied is gone — the stage dropdown '
      + 'on the same card already does it');
    assert.ok(!/function ats\(|function applied\(/.test(app), 'and their handlers with them');
    assert.ok(/class="tdoc"/.test(app), 'the card must show the résumé document');
    assert.ok(/PDF v/.test(app) && /% keywords/.test(app),
      'with its version and coverage, the way the Bank tracker shows it');
    assert.ok(/class="pricetag"/.test(app), 'and the button must state the price');
  });

  // A COLUMN HEADED (48) THAT SHOWS 12 IS A LIE, NOT A LAYOUT CHOICE.
  //
  // The board rendered items.slice(0,12) under a heading printing the real
  // count, so 36 tracked roles were invisible with nothing saying so — and
  // because the rows arrived in insertion order, the strongest match was hidden
  // whenever it happened to sit at position thirteen. Ordering is now
  // best-score-first and done on the SERVER, so every reader of the endpoint
  // gets the same board.
  await t('PIPELINE: every tracked role renders, best score first', () => {
    const fs = require('fs');
    const app = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(!/items\.slice\(0,\s*\d+\)/.test(app),
      'THE BOARD MUST NOT SILENTLY TRUNCATE A COLUMN');
    assert.ok(/\.stagecol\{[^}]*overflow-y:\s*auto/.test(app),
      'a long column scrolls instead — long is fine, secretly cut is not');
    assert.ok(/class="mscore/.test(app), 'the score must render as a badge');

    // The ordering itself, run against the comparator the route uses.
    const src = fs.readFileSync(__dirname + '/src/routes/engine.js', 'utf8');
    const i = src.indexOf("router.get('/pipeline'");
    const body = src.slice(i, src.indexOf('res.json({ pipeline: by, stages })', i));
    assert.ok(/\.sort\(/.test(body), 'the route must sort, not the browser');

    const rows = [
      { id: 1, score: 41 }, { id: 2, score: 92 }, { id: 3, score: null },
      { id: 4, score: 78 }, { id: 5, score: 0 },
    ];
    rows.sort((a, b) => {
      const as = a.score == null ? -1 : a.score;
      const bs = b.score == null ? -1 : b.score;
      if (bs !== as) return bs - as;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    assert.deepStrictEqual(rows.map((r) => r.id), [2, 4, 1, 5, 3],
      'highest first, and an UNSCORED row sorts last — a missing score is not a '
      + 'zero, but it is not a reason to outrank something measured either');
  });

  // NOBODY IS BLOCKED FOR ROLE TITLES, AND NOBODY ENDS UP WITH NONE.
  //
  // Without titles pageRoles() is empty, no /roles/:role page exists, the
  // sitemap holds a single url and the site carries not one phrase a sourcer
  // would type — measured at 2 of 5 subscribers, the paying one among them.
  //
  // The fix is deliberately NOT a required field: onboarding is where people
  // leave, and this repo already made that mistake once with the subscribe
  // button. The résumé states the titles they have held, so the field arrives
  // filled in, and the server falls back to the same source if it somehow
  // arrives empty. Refinement belongs in the Guide, not the signup form.
  await t('BUILD FORM: titles arrive prefilled and never block the signup', async () => {
    const fs = require('fs');
    const raw = fs.readFileSync(__dirname + '/public/build.html', 'utf8')
      .replace(/\{\{BASE\}\}/g, '').replace(/\{\{V\}\}/g, '');
    let posted = null;
    const w = bootDom(raw, 'https://jobup.dev/build?t=tok');
    w.fetch = (url, init) => {
      if (String(url).includes('build-account')) posted = JSON.parse(init.body);
      return new Promise(() => {});
    };
    try {
      // What the /build payload would have carried.
      w.roleChips(['Sales Executive', 'Account Executive', 'Business Development Manager',
                   'Territory Manager']);
      assert.strictEqual(w.document.getElementById('roles').value,
        'Sales Executive, Account Executive, Business Development Manager',
        'the top three must be applied FOR them — an empty required box is how a signup is lost');
      const boxes = w.document.querySelectorAll('#rolesugg input');
      assert.strictEqual(boxes.length, 4, 'every suggestion is offered');
      assert.deepStrictEqual(Array.from(boxes).map((b) => b.checked), [true, true, true, false]);

      // Unticking must remove it from the one value, not leave the two views
      // disagreeing about what will be submitted.
      boxes[0].checked = false;
      boxes[0].dispatchEvent(new w.Event('change', { bubbles: true }));
      assert.strictEqual(w.document.getElementById('roles').value,
        'Account Executive, Business Development Manager');

      // And an empty box must still submit. It is not a gate.
      w.document.getElementById('roles').value = '';
      w.document.getElementById('p1').value = 'a-very-long-password';
      w.document.getElementById('p2').value = 'a-very-long-password';
      click(w, w.document.getElementById('go3'));
      assert.ok(posted, 'ROLE TITLES MUST NEVER BLOCK AN ACCOUNT BEING CREATED');
      assert.deepStrictEqual(posted.roles, []);
    } finally { w.close(); }

    // The server backstop: silence means "use what the résumé says", never
    // "publish a one-page site nobody can match".
    const intakeSrc = fs.readFileSync(__dirname + '/src/routes/intake.js', 'utf8');
    assert.ok(/roles\.length \? roles : settingsSvc\.strList\(fallbackRoles/.test(intakeSrc),
      'targetingFrom() must fall back to the résumé titles when the form sends none');
    assert.ok(!/errors: \['Add at least one job title/.test(intakeSrc),
      'and must NOT reject the signup for it');
  });

  // ONE SUBSCRIBER'S SETTINGS MUST NEVER TOUCH ANOTHER'S.
  //
  // deepMerge() shallow-copied, so a key a stored document did not override came
  // back as the SHARED DEFAULTS object. sanitize() and its callers mutate what
  // they are handed — engine.js does `cur.presence.directory_opt_in = true` —
  // so one subscriber saving an opt-in wrote straight into the module defaults,
  // and every other subscriber whose row omitted `presence` then sanitized as
  // opted-in: published to the directory and the sitemap without saying yes.
  // Observed live before the fix.
  await t('SETTINGS: sanitize() cannot leak one subscriber into another', () => {
    // A row that omits the sub-objects entirely — the shape that triggered it.
    const bare = () => settingsSvc.sanitize({});

    const a = bare();
    assert.strictEqual(a.presence.directory_opt_in, false, 'baseline: opt-in is off');
    // Do exactly what the route does to the object sanitize handed back.
    a.presence.directory_opt_in = true;
    a.privacy.email = true;
    a.targeting.roles.push({ title: 'Injected', slug: 'injected', page: true });
    a.identity_links.push({ network: 'other', url: 'https://leak.example' });

    const b = bare();
    assert.strictEqual(b.presence.directory_opt_in, false,
      'A SECOND SUBSCRIBER WAS PUBLISHED BY THE FIRST ONE OPTING IN');
    assert.strictEqual(b.privacy.email, false,
      "and their email would have been made public by someone else's choice");
    assert.deepStrictEqual(b.targeting.roles, [], 'no borrowed role targets');
    assert.deepStrictEqual(b.identity_links, [], 'no borrowed identity links');

    // Distinct object identities, not merely equal values.
    assert.notStrictEqual(a.presence, b.presence);
    assert.notStrictEqual(a.privacy, b.privacy);
    assert.notStrictEqual(a.targeting.roles, b.targeting.roles);

    // And the defaults are frozen, so the next version of this throws at the
    // point of the mistake instead of publishing somebody three calls later.
    assert.ok(Object.isFrozen(settingsSvc.DEFAULTS), 'DEFAULTS must be frozen');
    assert.ok(Object.isFrozen(settingsSvc.DEFAULTS.presence), 'and frozen deeply');
    assert.throws(() => { settingsSvc.DEFAULTS.presence.directory_opt_in = true; },
      TypeError, 'writing to DEFAULTS must throw, not succeed');
  });

  // ENTITY RESOLUTION — the only thing on a subscriber page an AI sourcing
  // aggregator (SeekOut, hireEZ, Pin) can act on. They accept no submissions and
  // expose no push API; they crawl and MERGE. `sameAs` is the merge claim.
  await t('IDENTITY LINKS: sameAs reaches every machine-readable surface', () => {
    const st = settingsSvc.sanitize({ identity_links: [
      { url: 'https://www.linkedin.com/in/carlosgomez' },
      { url: 'github.com/carlosgomez' },              // no scheme — must be fixed up
      { url: 'https://orcid.org/0000-0002-1825-0097' },
      { url: 'https://carlosgomez.example' },          // unrecognised host is still valid
    ] });
    assert.strictEqual(st.identity_links.length, 4);
    assert.deepStrictEqual(st.identity_links.map((l) => l.network),
      ['linkedin', 'github', 'orcid', 'other'],
      'a pasted url must be classified, never demanded from a dropdown');
    assert.ok(st.identity_links[1].url.startsWith('https://'),
      'a bare host must be normalised, not rejected — people paste without the scheme');

    const profile = { name: 'Carlos Gomez', headline: 'Sales Executive', skills: ['B2B'] };
    const ld = identity.personJsonLd(profile, st, { name: 'Carlos Gomez', url: 'https://c.jobup.dev' });
    assert.deepStrictEqual(ld.sameAs, st.identity_links.map((l) => l.url),
      'JSON-LD sameAs IS the entity-resolution claim — without it the page merges with nobody');

    const rj = identity.resumeJson(profile, st, { name: 'Carlos Gomez', url: 'https://c.jobup.dev' });
    assert.strictEqual(rj.basics.profiles.length, 4, 'resume.json carries the same identity set');
    assert.strictEqual(rj.basics.profiles[0].network, 'LinkedIn');

    const txt = identity.llmsTxt(profile, st, { name: 'Carlos Gomez', url: 'https://c.jobup.dev' });
    assert.ok(txt.includes('https://orcid.org/0000-0002-1825-0097'),
      'and so does llms.txt — the three surfaces may never disagree');
  });

  await t('IDENTITY LINKS: only http(s), deduped, capped, and private on request', () => {
    // These strings are rendered into JSON-LD AND into an <a href> on a public
    // page. A javascript:/data: url surviving here is stored XSS on every
    // visitor, so the scheme check is a security boundary, not tidiness.
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>',
                       'vbscript:x', 'file:///etc/passwd', 'notaurl', '', null, 'http://nodot']) {
      assert.strictEqual(settingsSvc.publicUrl(bad), null,
        JSON.stringify(bad) + ' must never become a published link');
    }
    assert.strictEqual(
      settingsSvc.sanitize({ identity_links: [{ url: 'javascript:alert(1)' }] }).identity_links.length,
      0, 'and sanitize must drop it rather than store it for a later render');

    // Same profile twice, differing only in case, is one identity.
    const dup = settingsSvc.sanitize({ identity_links: [
      { url: 'https://github.com/me' }, { url: 'https://GitHub.com/me' }] });
    assert.strictEqual(dup.identity_links.length, 1, 'deduped case-insensitively');

    const many = settingsSvc.sanitize({ identity_links:
      Array.from({ length: 30 }, (_, i) => ({ url: `https://s${i}.example` })) });
    assert.strictEqual(many.identity_links.length, 8, 'capped');

    // Public by default — they were typed in order to be found — but the
    // privacy projection must still be able to remove them everywhere at once.
    const off = settingsSvc.sanitize({ privacy: { identity_links: false },
      identity_links: [{ url: 'https://github.com/me' }] });
    const p = { name: 'X', skills: ['a'] };
    assert.strictEqual(identity.personJsonLd(p, off, { name: 'X' }).sameAs, undefined);
    assert.strictEqual(identity.resumeJson(p, off, { name: 'X' }).basics.profiles, undefined);
    assert.ok(!identity.llmsTxt(p, off, { name: 'X', url: 'https://x.dev' }).includes('github.com/me'),
      'a private field is DELETED from every surface, not blanked on one of them');
  });

  section('the hamburger actually opens — behaviour, not grep');

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
