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
    if (!process.env.STRIPE_SECRET_KEY) {
      assert.strictEqual(s.configured, false);
      const c = await billing.createCheckout({ subscriberId: 1, email: 'a@b.co' });
      assert.strictEqual(c.ok, false);
      assert.ok(!c.url, 'must not return a URL when unconfigured');
      assert.ok(/not configured/i.test(c.error));
    }
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
  await t('BROADCASTER DRAFTS BUT NEVER SENDS — approved_at and sent_at stay null', async () => {
    const res = await agents.broadcaster(subA.id);
    assert.strictEqual(res.sent, 0);
    assert.strictEqual(res.approval_required, true);
    const drafts = await scoped('outreach', subA.id).findAll({});
    assert.ok(drafts.every((d) => d.approved_at == null), 'nothing may be pre-approved');
    assert.ok(drafts.every((d) => d.sent_at == null), 'nothing may be pre-sent');
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
      { id: 'in_1', amount_due: 9700, metadata: { subscriber_id: String(subA.id) } });
    assert.strictEqual(a.stage, 1);
    assert.strictEqual(a.suspend, false);
    const b = await billing.applyEvent('invoice.payment_failed',
      { id: 'in_1', amount_due: 9700, metadata: { subscriber_id: String(subA.id) } });
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

  // ---------------------------------------------------------------
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
                       'Pipeline', 'Targets', 'Broadcast', 'Settings']) {
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
    const missing = ids.filter((id) => !html.includes('id="' + id + '"'));
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

  await t('free activation is OFF unless explicitly switched on', () => {
    const saved = process.env.JOBUP_FREE_ACTIVATION;
    delete process.env.JOBUP_FREE_ACTIVATION;
    assert.strictEqual(billingSvc.freeActivation(), false, 'must never be the default');
    process.env.JOBUP_FREE_ACTIVATION = '0';
    assert.strictEqual(billingSvc.freeActivation(), false, 'only "1" enables it');
    process.env.JOBUP_FREE_ACTIVATION = '1';
    assert.strictEqual(billingSvc.freeActivation(), true);
    if (saved === undefined) delete process.env.JOBUP_FREE_ACTIVATION;
    else process.env.JOBUP_FREE_ACTIVATION = saved;
  });
  await t('status() DECLARES test mode and missing webhook verification', () => {
    const saved = process.env.JOBUP_FREE_ACTIVATION;
    process.env.JOBUP_FREE_ACTIVATION = '1';
    const st = billingSvc.status();
    assert.strictEqual(st.free_activation, true, 'test mode must be visible, never silent');
    assert.ok(st.webhook_verification, 'webhook state must be reported');
    if (saved === undefined) delete process.env.JOBUP_FREE_ACTIVATION;
    else process.env.JOBUP_FREE_ACTIVATION = saved;
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

  await t('PWA: manifest is valid, scoped, and standalone', () => {
    const fs = require('fs');
    const m = JSON.parse(fs.readFileSync(__dirname + '/public/manifest.webmanifest', 'utf8'));
    assert.strictEqual(m.display, 'standalone');
    assert.ok(m.scope.startsWith('/jobup'), 'scope must not escape the mount');
    assert.ok(m.start_url.startsWith('/jobup'), 'start_url must not escape the mount');
    assert.ok(m.icons.some((i) => i.sizes === '512x512'), 'a 512 icon is required to install');
    assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon is required on Android');
  });
  await t('PWA: every icon the manifest promises actually exists and is a PNG', () => {
    const fs = require('fs');
    const m = JSON.parse(fs.readFileSync(__dirname + '/public/manifest.webmanifest', 'utf8'));
    for (const icon of m.icons) {
      const f = __dirname + '/public' + icon.src.replace('/jobup', '');
      assert.ok(fs.existsSync(f), 'missing icon file: ' + icon.src);
      assert.strictEqual(fs.readFileSync(f).slice(1, 4).toString(), 'PNG', 'not a PNG: ' + icon.src);
    }
    assert.ok(fs.existsSync(__dirname + '/public/apple-touch-icon.png'), 'iOS needs apple-touch-icon');
  });
  await t('THE SERVICE WORKER NEVER CACHES /api/', () => {
    const fs = require('fs');
    const sw = fs.readFileSync(__dirname + '/public/sw.js', 'utf8');
    assert.ok(sw.includes("includes('/api/')"), 'API responses must be excluded');
    assert.ok(sw.includes("mode === 'navigate'"), 'navigations should be network-first');
    assert.ok(/const CACHE = 'jobup-v\d+'/.test(sw), 'the cache must carry a bumpable version');
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
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(html.includes('jobup_install_dismissed'), 'a dismissed prompt must stay dismissed');
    assert.ok(html.includes('Add to Home Screen'), 'iOS has no beforeinstallprompt — it needs instructions');
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
    for (const step of ['Searching', 'Scoring', 'Tailoring', 'Drafting']) {
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
    const fs = require('fs');
    const html = fs.readFileSync(__dirname + '/public/app.html', 'utf8');
    assert.ok(html.includes("location.pathname.indexOf('/jobup')===0"),
      'it must work under /jobup AND at a subdomain root');
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
  await t('PWA manifest is rewritten for the subscriber origin', () => {
    const fs = require('fs');
    const src = fs.readFileSync(__dirname + '/src/index.js', 'utf8');
    // The shipped manifest is scoped to /jobup/, which does not contain /app
    // on a subdomain — an install from there would be rejected outright.
    assert.ok(src.includes("m.start_url = '/app'") && src.includes("m.scope = '/'"),
      'the manifest must be rescoped for the subdomain');
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
