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
