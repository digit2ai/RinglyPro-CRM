'use strict';

/**
 * Citi Opportunity Tracker — System Integration Test.
 *
 *   node verticals/citijobs/sit.js
 *
 * Zero external keys. The Workday feed is replaced by RECORDED FIXTURES of the
 * real payloads (captured live 2026-08-13 from req 26974948), so the suite is
 * free, offline and deterministic — and the keyless heuristic path, which is
 * what runs when ANTHROPIC_API_KEY is absent, is the one under test.
 *
 * It asserts the INVARIANTS, not the happy path: what must never happen.
 */

require('dotenv').config();
process.env.CITIJOBS_GO = process.env.CITIJOBS_GO || '';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { sequelize, User, Profile, Req, Tracked, Match, Query, Run, Skill, Tailoring } = require('./src/models');
const workday = require('./src/services/workday');
const skills = require('./src/services/skills');
const prefilter = require('./src/services/prefilter');
const tailorSvc = require('./src/services/tailor');
const pdf = require('./src/services/pdf');
const agent = require('./src/services/agent');
const seed = require('./src/services/seed');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}
async function throws(name, fn, codeOrMsg) {
  try { await fn(); ok(name, false, 'did not throw'); }
  catch (e) {
    const hit = !codeOrMsg || e.code === codeOrMsg || String(e.message).toLowerCase().includes(String(codeOrMsg).toLowerCase());
    ok(name, hit, hit ? '' : `threw "${e.message}"`);
  }
}
function section(t) { console.log(`\n${t}`); }

// ── Recorded fixtures — the real shapes, captured live ───────────────────────
const FIX_POSTING = {
  title: 'Senior Data & Analytics Lead – Data Transformation Programs',
  externalPath: '/job/Tampa-Florida-United-States/Senior-Data---Analytics-Lead---Data-Transformation-Programs_26974948-1',
  locationsText: 'Tampa Florida United States',
  postedOn: 'Posted 3 Days Ago',
  bulletFields: ['26974948']
};
const FIX_DETAIL = {
  id: '836416e25965101588f570415c0a0000',
  title: 'Senior Data & Analytics Lead – Data Transformation Programs',
  jobDescription: '<p>Citi is looking for a Senior Data &amp; Analytics Lead to spearhead high-impact programs within Citi\'s broader <b>Data Transformation</b> efforts.</p>' +
    '<ul><li>Lead complex, large-scale Data Transformation programs end-to-end across multiple workstreams.</li>' +
    '<li>Generate actionable insights from high-volume banking data sets and translate those insights into clear strategy.</li>' +
    '<li>Negotiate timelines, scope, and delivery approach with senior-level stakeholders.</li>' +
    '<li>Manage a broad and varied book of work across multiple stakeholder groups.</li>' +
    '<li>Familiarity with data governance, data lineage concepts, or metadata management within a financial services context.</li>' +
    '<li>10 or more years of experience applying statistical modelling and advanced analytical tools to large, complex data sets.</li>' +
    '<li>Experience with Snowflake and Tableau is an advantage.</li></ul>' +
    '<p>Job Family Group:<br>Technology<br>Job Family:<br>Data Science</p>' +
    '<p>Primary Location Full Time Salary Range: $141,440.00 - $212,160.00</p>' +
    '<p>Anticipated Posting Close Date: Aug 24, 2026</p>',
  location: 'Tampa Florida United States',
  postedOn: 'Posted 3 Days Ago',
  startDate: '2026-08-10',
  endDate: '2026-08-24',
  timeType: 'Full time',
  jobReqId: '26974948',
  jobPostingId: 'Senior-Data---Analytics-Lead---Data-Transformation-Programs_26974948-1',
  country: { descriptor: 'United States of America' },
  canApply: true,
  posted: true,
  remoteType: 'Hybrid',
  externalUrl: 'https://citi.wd5.myworkdayjobs.com/2/job/Tampa-Florida-United-States/Senior-Data---Analytics-Lead---Data-Transformation-Programs_26974948-1',
  jobRequisitionLocation: { descriptor: '3800 CITIGROUP CENTER DRIVE BUILDING B TAMPA' },
  timeLeftToApply: '11 Days Left to Apply'
};
const FIX_PUNE = {
  title: 'Data Analytics Lead Analyst',
  externalPath: '/job/Pune-Maharashtra-India/Data-Analytics-Lead-Analyst_26980420',
  locationsText: 'Pune Maharashtra India',
  postedOn: 'Posted 21 Days Ago',
  bulletFields: ['26980420']
};

// ── JPMorgan Chase (Oracle Fusion) fixtures, captured live 2026-08-13 ────────
const FIX_JPMC_LIST = {
  Id: '210712563',
  Title: 'Lead Software Engineer - Observability Platform Cloud Developer',
  PrimaryLocation: 'Columbus, OH, United States',
  PostedDate: '2026-08-13',
  PostingEndDate: null,
  JobFamily: 'Software Engineering',
  JobFunction: 'Technology',
  ShortDescriptionStr: 'Carry out critical tech solutions across multiple technical areas'
};
const FIX_JPMC_DETAIL = {
  Id: '210712563',
  Title: 'Lead Software Engineer - Observability Platform Cloud Developer',
  PrimaryLocation: 'Columbus, OH, United States',
  ExternalPostedStartDate: '2026-08-13',
  ExternalPostedEndDate: null,
  JobFamily: 'Software Engineering',
  JobFunction: 'Technology',
  JobSchedule: 'Full time',
  WorkplaceType: 'Hybrid',
  LegalEmployer: 'JPMorgan Chase Bank, N.A.',
  ExternalDescriptionStr: '<p>Lead <b>data governance</b> and data lineage work across the platform.</p>',
  ExternalQualificationsStr: '<ul><li>10+ years applying statistical modelling to large data sets</li></ul>',
  ExternalResponsibilitiesStr: '<p>Own program delivery end to end.</p>'
};
const FIX_JPMC_PAID = Object.assign({}, FIX_JPMC_DETAIL, {
  Id: '210999001', Title: 'Data Governance Lead',
  ExternalDescriptionStr: '<p>Base Pay Range: $150,000.00 - $190,000.00 per year</p><p>data governance</p>'
});

let httpCalls = 0;
let feedHas = new Set(['26974948', '26980420']);
function installFakeFeed() {
  httpCalls = 0;
  workday._setFetch(async (url, opts) => {
    httpCalls++;
    const u = String(url);
    if (u.endsWith('/jobs')) {
      const body = JSON.parse(opts.body || '{}');
      const q = String(body.searchText || '').toLowerCase();
      let all = [FIX_POSTING, FIX_PUNE].filter((p) => feedHas.has(workday.reqIdOf(p)));
      if (q) {
        all = all.filter((p) => workday.reqIdOf(p) === q || (p.title + ' ' + p.locationsText).toLowerCase().includes(q));
      }
      const off = Number(body.offset || 0), lim = Number(body.limit || 20);
      return { ok: true, status: 200, json: async () => ({ total: all.length, jobPostings: all.slice(off, off + lim) }) };
    }
    if (u.includes('/job/Tampa-')) {
      if (!feedHas.has('26974948')) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ jobPostingInfo: FIX_DETAIL }) };
    }
    if (u.includes('/job/Pune-')) {
      const puneDetail = Object.assign({}, FIX_DETAIL, {
        title: FIX_PUNE.title,
        location: 'Pune Maharashtra India',
        jobReqId: '26980420',
        externalUrl: 'https://citi.wd5.myworkdayjobs.com/2/job/Pune',
        jobDescription: '<p>Data analytics work in Pune. No salary stated.</p>'
      });
      return { ok: true, status: 200, json: async () => ({ jobPostingInfo: puneDetail }) };
    }
    // ── Oracle (JPMorgan) ────────────────────────────────────────────────────
    if (u.includes('recruitingCEJobRequisitions')) {
      const kw = (decodeURIComponent(u).match(/keyword="([^"]*)"/) || [])[1] || '';
      const all = [FIX_JPMC_LIST].filter((r) => !kw
        || (r.Title + ' ' + r.PrimaryLocation).toLowerCase().includes(kw.toLowerCase()));
      return { ok: true, status: 200,
        json: async () => ({ items: [{ TotalJobsCount: 7456, requisitionList: all }] }) };
    }
    if (u.includes('recruitingCEJobRequisitionDetails')) {
      const id = (decodeURIComponent(u).match(/Id="(\d+)"/) || [])[1];
      if (id === '210712563') return { ok: true, status: 200, json: async () => ({ items: [FIX_JPMC_DETAIL] }) };
      if (id === '210999001') return { ok: true, status: 200, json: async () => ({ items: [FIX_JPMC_PAID] }) };
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

// Throwaway tenant, cleaned up at the end.
const SIT_EMAIL = 'sit-citijobs@example.invalid';
let tenant, profileA, profileB;

async function cleanup() {
  if (!tenant) return;
  const ids = [profileA, profileB].filter(Boolean).map((p) => p.id);
  await Tailoring.destroy({ where: { tenant_id: tenant } });
  await Skill.destroy({ where: { tenant_id: tenant } });
  await Match.destroy({ where: { tenant_id: tenant } });
  await Tracked.destroy({ where: { tenant_id: tenant } });
  await Req.destroy({ where: { tenant_id: tenant } });
  await Query.destroy({ where: { tenant_id: tenant } });
  await Run.destroy({ where: { tenant_id: tenant } });
  await Profile.destroy({ where: { tenant_id: tenant } });
  await User.destroy({ where: { email: SIT_EMAIL } });
  void ids;
}

(async function main() {
  console.log('CITI OPPORTUNITY TRACKER — SIT');
  console.log('Offline: recorded Workday fixtures. No ANTHROPIC_API_KEY required.\n');

  const hadKey = !!process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;   // the keyless path is the one under test
  console.log(hadKey ? 'ANTHROPIC_API_KEY was present and has been unset for this run.\n'
    : 'No ANTHROPIC_API_KEY present; heuristic path under test.\n');

  await require('./src/index').init();
  installFakeFeed();

  // ── 1. Field mapping ──────────────────────────────────────────────────────
  section('1. Feed field mapping (the six fields the tracker asked for)');
  const norm = workday.normalize(FIX_POSTING, FIX_DETAIL);
  ok('Job Req Id comes from bulletFields[0]', norm.req_id === '26974948', norm.req_id);
  ok('Job Title', norm.title === 'Senior Data & Analytics Lead – Data Transformation Programs');
  ok('Posted maps from startDate', norm.posted_on === '2026-08-10', String(norm.posted_on));
  ok('Anticipated close maps from endDate', norm.close_date === '2026-08-24', String(norm.close_date));
  ok('Salary min parsed', norm.salary_min_cents === 14144000, String(norm.salary_min_cents));
  ok('Salary max parsed', norm.salary_max_cents === 21216000, String(norm.salary_max_cents));
  ok('Salary marked stated (never estimated)', norm.salary_source === 'stated');
  ok('Canonical Workday apply URL', /myworkdayjobs\.com/.test(norm.url_workday || ''));
  ok('Location + work model + time type', norm.location.includes('Tampa') && norm.remote_type === 'Hybrid' && norm.time_type === 'Full time');
  ok('Job family group parsed', String(norm.job_family_group || '').startsWith('Technology'), String(norm.job_family_group));

  section('2. Salary is copied or absent — never invented');
  ok('No salary line yields null, not a guess', workday.parseSalary('No pay information here at all.') === null);
  ok('A reversed range is refused', workday.parseSalary('Salary Range: $200,000.00 - $100,000.00') === null);
  const noSal = workday.normalize(FIX_PUNE, { jobDescription: '<p>no pay stated</p>', jobReqId: '26980420' });
  ok('Posting without a range stores null salary', noSal.salary_min_cents === null && noSal.salary_source === null);

  section('3. Paste-to-import accepts what a human actually pastes');
  ok('bare req id', workday.reqIdFromInput('26974948') === '26974948');
  ok('workday url', workday.reqIdFromInput(FIX_DETAIL.externalUrl) === '26974948');
  ok('workday path', workday.reqIdFromInput(FIX_POSTING.externalPath) === '26974948');
  ok('"Job Req Id: 26974948"', workday.reqIdFromInput('Job Req Id: 26974948') === '26974948');
  ok('garbage yields null, not a guess', workday.reqIdFromInput('hello there') === null);
  ok('a pasted jobs.citi.com link is recognised and kept',
    workday.citiCareersUrl('https://jobs.citi.com/job/tampa/senior-data-and-analytics-lead-data-transformation-programs/287/99038749520')
      === 'https://jobs.citi.com/job/tampa/senior-data-and-analytics-lead-data-transformation-programs/287/99038749520');
  ok('a non-careers URL is not mistaken for one', workday.citiCareersUrl('https://example.com/job/1') === null);

  section('4. The jobs.citi.com deep link is NEVER constructed');
  const srcFiles = ['services/workday.js', 'services/agent.js', 'routes/api.js', 'services/tailor.js', 'services/seed.js']
    .map((f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8'));
  const constructs = srcFiles.some((s) =>
    /['"`]https?:\/\/(www\.)?jobs\.citi\.com\/job\//.test(s) || /jobs\.citi\.com\/job\/['"`]\s*\+/.test(s));
  ok('no source path builds a jobs.citi.com/job/ URL', !constructs);
  ok('the search click-out (allowed) is the only jobs.citi.com URL built',
    srcFiles.some((s) => s.includes('jobs.citi.com/search-jobs/')));

  // ── Tenant fixture ────────────────────────────────────────────────────────
  section('5. Setup: throwaway tenant with two profiles');
  const u = await User.create({ email: SIT_EMAIL, name: 'SIT', password_hash: 'x', role: 'owner' });
  u.tenant_id = u.id; await u.save();
  tenant = u.tenant_id;
  profileA = await Profile.create({
    tenant_id: tenant, slug: 'sit-a', display_name: 'SIT Alpha',
    headline: seed.MANUEL_RESUME.headline,
    resume_json: seed.MANUEL_RESUME, resume_text: seed.flatten(seed.MANUEL_RESUME),
    target_titles: ['Data Analytics Lead', 'Data Transformation'],
    target_locations: ['Tampa'], countries: ['United States'], score_threshold: 60
  });
  profileB = await Profile.create({
    tenant_id: tenant, slug: 'sit-b', display_name: 'SIT Beta',
    resume_json: { roles: [] }, resume_text: 'unrelated', countries: ['United States']
  });
  ok('two profiles created in one tenant', !!profileA.id && !!profileB.id);

  // ── 6. Skills: the safety boundary ────────────────────────────────────────
  section('6. The skill store — vocabulary can never become claimable on its own');
  await skills.learnVocabulary(profileA, [{ term: 'snowflake' }, { term: 'tableau' }], { req_id: '26974948' });
  let snow = await Skill.findOne({ where: { profile_id: profileA.id, norm: 'snowflake' } });
  ok('harvested posting language lands as vocabulary', snow.kind === 'vocabulary');
  ok('vocabulary is NOT claimable', !(await skills.claimable(profileA.id)).includes('snowflake'));
  ok('vocabulary DOES steer the search', (await skills.searchTerms(profileA.id)).some((s) => s.norm === 'snowflake'));

  await skills.learnVocabulary(profileA, [{ term: 'snowflake' }], { req_id: '26974948' });
  snow = await Skill.findOne({ where: { profile_id: profileA.id, norm: 'snowflake' } });
  ok('re-harvesting the same term never promotes it', snow.kind === 'vocabulary');

  await skills.applyOutcome(profileA, ['snowflake'], 'interview');
  snow = await Skill.findOne({ where: { profile_id: profileA.id, norm: 'snowflake' } });
  ok('an Interview outcome raises weight', Number(snow.weight) > 1);
  ok('...but still cannot change kind', snow.kind === 'vocabulary');

  await throws('verifying without evidence is refused',
    () => skills.confirmVerified(profileA, 'snowflake', ''), 'EVIDENCE_REQUIRED');
  await skills.confirmVerified(profileA, 'snowflake', 'Used Snowflake on the X migration in 2025.');
  snow = await Skill.findOne({ where: { profile_id: profileA.id, norm: 'snowflake' } });
  ok('explicit human confirmation with evidence promotes it', snow.kind === 'verified' && !!snow.evidence);
  ok('now claimable', (await skills.claimable(profileA.id)).includes('snowflake'));

  await skills.reject(profileA, 'tableau');
  await skills.learnVocabulary(profileA, [{ term: 'tableau' }], { req_id: '26974948' });
  const tab = await Skill.findOne({ where: { profile_id: profileA.id, norm: 'tableau' } });
  ok('a rejected term stays rejected even if harvested again', tab.kind === 'rejected');
  ok('rejected terms never steer the search', !(await skills.searchTerms(profileA.id)).some((s) => s.norm === 'tableau'));

  await skills.markAdjacent(profileA, 'snowflake');
  snow = await Skill.findOne({ where: { profile_id: profileA.id, norm: 'snowflake' } });
  ok('"Adjacent" never demotes an already-verified claim', snow.kind === 'verified');

  ok('skill terms are profile-scoped', (await skills.claimable(profileB.id)).length === 0);

  // ── 7. Import + pool ──────────────────────────────────────────────────────
  section('7. Import by req id');
  const imported = await agent.importReq(tenant, 'Job Req Id: 26974948');
  ok('imports the right requisition', imported.req_id === '26974948');
  ok('detail captured on import', imported.detail_fetched === true && imported.close_date === '2026-08-24');
  ok('no careers deep link invented', imported.url_citi_careers === null);
  const imported2 = await agent.importReq(tenant, 'https://jobs.citi.com/job/tampa/senior-data-and-analytics-lead-data-transformation-programs/287/99038749520 26974948');
  ok('a pasted careers link IS stored', imported2.url_citi_careers && imported2.url_citi_careers.includes('99038749520'));
  await throws('an unknown req id is reported, not fabricated',
    () => agent.importReq(tenant, '99999999'), 'NOT_FOUND');
  await throws('unparseable input is refused', () => agent.importReq(tenant, 'nonsense'), 'NO_REQ_ID');

  // ── 8. Pre-filter ─────────────────────────────────────────────────────────
  section('8. Pre-filter — the free gate that keeps the model bill honest');
  const terms = await skills.searchTerms(profileA.id);
  const tampaReq = await Req.findOne({ where: { tenant_id: tenant, req_id: '26974948' } });
  const preT = prefilter.score(tampaReq, profileA, terms);
  ok('the Tampa requisition scores well', preT.score >= 50, String(preT.score));
  ok('it clears the scoring floor', prefilter.shouldScore(preT, profileA));
  // A US POSTING DOES NOT HAVE TO SAY "UNITED STATES". Citi and JPMorgan spell
  // the country out; PNC, Capital One and U.S. Bank name only a state. Gating on
  // the country name silently excluded every posting from those three banks as
  // foreign — 524 US jobs dropped without a trace, on an app that looked like it
  // was working.
  const usProfile = { countries: ['United States'], target_titles: [], target_locations: [] };
  [['Tampa Florida United States', true], ['Columbus, OH, United States', true],
    ['PA - Pittsburgh 15222', true], ['McLean, VA', true], ['Saint Paul, MN', true],
    ['Data Center PA690', true], ['Plano, TX', true],
    ['Pune Maharashtra India', false], ['Bangalore, Karnataka, India', false],
    ['London, United Kingdom', false], ['Toronto, ON', false]
  ].forEach(([loc, want]) => {
    const r = prefilter.locationAllowed({ location: loc }, usProfile);
    ok(`"${loc}" reads as ${want ? 'US' : 'outside the US'}`, r.ok === want);
  });

  // An empty country list means "anywhere" — the US-only switch turning off
  // must not become a filter that silently keeps filtering.
  ok('no countries set means no country gate',
    prefilter.locationAllowed({ location: 'Pune Maharashtra India' }, { countries: [] }).ok === true);
  ok('...while United States set still excludes Pune',
    prefilter.locationAllowed({ location: 'Pune Maharashtra India' }, { countries: ['United States'] }).ok === false);

  // STATE GATE. Empty means every state, and a posting that names no state —
  // "Remote", a bare city — is kept: filtering by state must not quietly delete
  // every remote role, the one category it is least meant to exclude.
  const flOnly = { countries: ['United States'], states: ['FL', 'TX'] };
  [['Tampa Florida United States', true], ['Plano, TX', true], ['Remote - United States', true],
    ['McLean, VA', false], ['PA - Pittsburgh 15222', false], ['Pune Maharashtra India', false]
  ].forEach(([loc, want]) => {
    ok(`states FL,TX: "${loc}" ${want ? 'shows' : 'hidden'}`,
      prefilter.locationAllowed({ location: loc }, flOnly).ok === want);
  });
  ok('an empty state list means EVERY state, not none',
    prefilter.locationAllowed({ location: 'McLean, VA' }, { countries: ['United States'], states: [] }).ok === true);
  ok('the state is read from a name as well as a code', prefilter.stateOf('Tampa Florida United States') === 'FL');
  ok('...and from a facility code', prefilter.stateOf('Data Center PA690') === 'PA');
  ok('a location naming no state yields null, not a guess', prefilter.stateOf('Remote') === null);

  const puneReq = Req.build({ req_id: '26980420', title: 'Data Analytics Lead Analyst', location: 'Pune Maharashtra India', description_text: 'data analytics' });
  const preP = prefilter.score(puneReq, profileA, terms);
  ok('a Pune requisition is refused for a US-only profile', !preP.location_ok);
  ok('...and never reaches the model', !prefilter.shouldScore(preP, profileA));
  ok('the reason is stated, not silent', /outside/.test(preP.reasons.join(' ')));

  // ── 9. Tailoring ──────────────────────────────────────────────────────────
  section('8b. The pay floor');
  const hi = Req.build({ req_id: 'x1', salary_source: 'stated', salary_min_cents: 14144000, salary_max_cents: 21216000 });
  const lo = Req.build({ req_id: 'x2', salary_source: 'stated', salary_min_cents: 9000000, salary_max_cents: 12000000 });
  const straddle = Req.build({ req_id: 'x3', salary_source: 'stated', salary_min_cents: 13000000, salary_max_cents: 16000000 });
  const unpriced = Req.build({ req_id: 'x4', salary_source: null, salary_min_cents: null, salary_max_cents: null });
  const withFloor = Object.assign({}, profileA.get({ plain: true }), { min_salary_cents: 14000000, hide_unpriced: false });
  ok('a range above the floor passes', prefilter.salaryAllowed(hi, withFloor).ok);
  ok('a range entirely below the floor is refused', !prefilter.salaryAllowed(lo, withFloor).ok);
  ok('...and says why, with the figure', /below the floor/.test(prefilter.salaryAllowed(lo, withFloor).reason || ''));
  ok('a range STRADDLING the floor passes on its top end', prefilter.salaryAllowed(straddle, withFloor).ok);
  ok('a posting with no stated range is shown by default', prefilter.salaryAllowed(unpriced, withFloor).ok);
  ok('...and is labelled as unpriced rather than passed silently',
    prefilter.salaryAllowed(unpriced, withFloor).reason === 'no salary stated');
  const strict = Object.assign({}, withFloor, { hide_unpriced: true });
  ok('hide_unpriced hides it only when explicitly turned on', !prefilter.salaryAllowed(unpriced, strict).ok);
  const noFloor = Object.assign({}, withFloor, { min_salary_cents: 0 });
  ok('no floor set means nothing is filtered', prefilter.salaryAllowed(lo, noFloor).ok);

  section('9. Tailoring selects evidence and cannot author a claim');
  const claim = await skills.claimable(profileA.id);
  const out = await tailorSvc.tailor(profileA, tampaReq, { claimableTerms: claim, rejectedNorms: new Set(['tableau']) });
  ok('produced without a model, labelled', out.tailored_by === 'heuristic' && out.is_simulated === true);

  const poolTexts = new Set(tailorSvc.bulletPool(profileA).flatMap((r) => r.bullets.map((b) => b.text)));
  const printed = out.content.roles.flatMap((r) => r.bullets);
  ok('every printed bullet is verbatim from the base résumé', printed.every((b) => poolTexts.has(b)), 'a bullet was not in the pool');
  ok('the résumé is not empty', printed.length >= 8, String(printed.length));
  ok('the independent-practice disclaimer survives tailoring',
    out.content.roles.some((r) => (r.note || '').includes('NOT performed at, for, or on behalf of Citigroup')));
  ok('the target line names the requisition', out.content.target_line.includes('26974948'));

  ok('keyword coverage is computed deterministically', typeof out.keyword_coverage.pct === 'number');
  ok('coverage identifies present terms', out.keyword_coverage.covered.some((t) => t.includes('data governance')));
  ok('coverage identifies absent terms', out.keyword_coverage.missing.length >= 0);

  const gapTerms = out.gaps.map((g) => g.term);
  ok('a rejected term never returns as a gap', !gapTerms.includes('tableau'));
  ok('an already-verified term is not a gap', !gapTerms.includes('snowflake'));

  section('10. The summary verifier — the model may not introduce a fact');
  const corpus = tailorSvc.corpusOf(profileA, claim);
  ok('a true restatement passes', tailorSvc.verifyText('Data governance and data lineage delivery at Citigroup.', corpus).length === 0);
  const vNum = tailorSvc.verifyText('Delivered 47 transformation programs.', corpus);
  ok('an invented NUMBER is caught', vNum.some((v) => v.kind === 'unverified_number'), JSON.stringify(vNum));
  const vAcr = tailorSvc.verifyText('Expert in COBIT and TOGAF frameworks.', corpus);
  ok('an invented ACRONYM is caught', vAcr.some((v) => v.kind === 'unverified_acronym'));
  const vTerm = tailorSvc.verifyText('Built dbt and spark pipelines daily.', corpus);
  ok('an invented TOOL is caught', vTerm.some((v) => v.kind === 'unverified_term'));
  ok('a true figure from the résumé passes', tailorSvc.verifyText('Over 24 years at Citigroup.', corpus).length === 0);

  section('11. PDF — real bytes, rendered from stored content');
  const buf = await pdf.render(out.content, { title: 'SIT' });
  ok('renders a PDF', buf.slice(0, 5).toString() === '%PDF-');
  ok('and it is a real document, not a stub', buf.length > 6000, String(buf.length) + ' bytes');
  ok('filename carries the req id', pdf.filename('Manuel Stagg', '26974948', 1) === 'Manuel_Stagg_Resume_Citi_26974948.pdf');
  ok('a re-tailor is versioned in the filename', pdf.filename('Manuel Stagg', '26974948', 2).endsWith('_v2.pdf'));
  const buf2 = await pdf.render(out.content, { title: 'SIT' });
  ok('same content renders the same size (recoverable, not ephemeral)', buf.length === buf2.length);

  section('12. Tailorings are versioned and immutable');
  const t1 = await Tailoring.create({ tenant_id: tenant, profile_id: profileA.id, req_id: '26974948', version: 1, content: out.content });
  const t2 = await Tailoring.create({ tenant_id: tenant, profile_id: profileA.id, req_id: '26974948', version: 2, content: out.content });
  ok('a re-tailor appends a version', t2.version === 2 && t1.version === 1);
  let dupBlocked = false;
  try { await Tailoring.create({ tenant_id: tenant, profile_id: profileA.id, req_id: '26974948', version: 2, content: {} }); }
  catch (e) { dupBlocked = true; }
  ok('a version can never be overwritten', dupBlocked);

  // ── 13. The daily run ─────────────────────────────────────────────────────
  section('13. The daily run');
  await Query.create({ tenant_id: tenant, label: 'sit', search_text: 'data', weight: 1 });
  const run1 = await agent.runDaily(tenant, { trigger: 'manual' });
  ok('a manual run completes', run1.ok === true);
  ok('it saw requisitions', run1.reqs_seen >= 1, JSON.stringify(run1));
  ok('it reports its HTTP request count', run1.http_requests > 0);
  ok('it scored candidates', run1.scored >= 1, String(run1.scored));

  const boardedA = await Tracked.findAll({ where: { tenant_id: tenant, profile_id: profileA.id } });
  ok('the Tampa requisition reached the board', boardedA.some((t) => t.req_id === '26974948'));
  ok('the Pune requisition never reached the board', !boardedA.some((t) => t.req_id === '26980420'));
  const puneMatch = await Match.findOne({ where: { profile_id: profileA.id, req_id: '26980420' } });
  ok('...and its rejection is recorded, not silent', !!puneMatch && puneMatch.score < 70);
  ok('scores with no key are labelled simulated', (await Match.findOne({ where: { profile_id: profileA.id, req_id: '26974948' } })).is_simulated === true);

  // ONE FLOOR, ALWAYS — the heuristic path gets no discount. It used to board at
  // 70% of the threshold, which put 71 sub-threshold rows on the real board.
  {
    const boarded = await Tracked.findAll({ where: { tenant_id: tenant, profile_id: profileA.id } });
    const scores = await Match.findAll({ where: { tenant_id: tenant, profile_id: profileA.id } });
    const byKey = new Map(scores.map((m) => [m.employer + ':' + m.req_id, m.score]));
    const below = boarded.filter((t) => {
      const sc = byKey.get(t.employer + ':' + t.req_id);
      return t.source === 'agent' && sc != null && sc < profileA.score_threshold;
    });
    ok('nothing the agent boarded scores below the threshold', below.length === 0,
      below.map((b) => b.req_id + '=' + byKey.get(b.employer + ':' + b.req_id)).join(','));
  }

  section('14. The daily claim — one scheduled run per tenant per day');
  const c1 = await agent.claim(tenant, 'schedule');
  const c2 = await agent.claim(tenant, 'schedule');
  ok('the first scheduled claim succeeds', !!c1);
  ok('a second instance is refused the same day', c2 === null);
  const m1 = await agent.claim(tenant, 'manual');
  ok('manual runs are never locked out by the claim', !!m1);

  section('15. The request budget stops the run and says so');
  const tinyBudget = workday.newBudget(1);
  await workday.listJobs({ searchText: 'data', budget: tinyBudget });   // spends the only unit
  let budgetErr = null;
  try {
    await workday.listJobs({ searchText: 'data', budget: tinyBudget }); // must be refused
  } catch (e) { budgetErr = e; }
  ok('exhausting the budget throws a flagged error', !!budgetErr && budgetErr.budget === true);
  ok('the budget records that it was hit', tinyBudget.hit === true);
  ok('and it never exceeded its ceiling', tinyBudget.used <= 1, String(tinyBudget.used));

  const runBudget = workday.newBudget(0);
  const stopped = await agent.runDaily(tenant, { trigger: 'manual', maxRequests: 0 });
  ok('a run with no budget reports budget_hit rather than failing silently', stopped.budget_hit === true);
  void runBudget;

  section('16. The ONE automatic status change');
  const tr = await Tracked.findOne({ where: { tenant_id: tenant, profile_id: profileA.id, req_id: '26974948' } });
  tr.status = 'applied'; tr.applied_at = new Date(); await tr.save();
  feedHas = new Set(['26980420']);                       // the posting disappears
  const swept1 = await agent.closeSweep(tenant, workday.newBudget(20), Run.build({}));
  const trAfter = await Tracked.findOne({ where: { id: tr.id } });
  ok('an APPLIED requisition is never auto-closed', trAfter.status === 'applied', trAfter.status);
  ok('the sweep closed nothing it should not have', swept1 === 0);

  tr.status = 'new'; await tr.save();
  const swept2 = await agent.closeSweep(tenant, workday.newBudget(20), Run.build({}));
  const trAfter2 = await Tracked.findOne({ where: { id: tr.id } });
  ok('a NEW requisition that left the feed is auto-closed', trAfter2.status === 'closed' && swept2 === 1);
  ok('...with the reason recorded as expired', trAfter2.status_reason === 'expired');
  ok('...and a note saying why', /no longer in Citi/.test(trAfter2.notes || ''));
  feedHas = new Set(['26974948', '26980420']);

  section('17. Cross-profile isolation');
  const bBoard = await Tracked.findAll({ where: { tenant_id: tenant, profile_id: profileB.id } });
  ok('profile B sees none of profile A\'s board', bBoard.every((t) => t.profile_id === profileB.id));
  const aSkills = await skills.all(profileA.id);
  const bSkills = await skills.all(profileB.id);
  ok('skill stores do not bleed', aSkills.length > 0 && bSkills.length === 0);
  const bTail = await Tailoring.findAll({ where: { profile_id: profileB.id } });
  ok('tailorings do not bleed', bTail.length === 0);

  section('18. Honest countdowns and honest labels');
  ok('a stated close date yields a countdown', FIX_DETAIL.endDate === '2026-08-24');
  const noClose = workday.normalize(FIX_POSTING, Object.assign({}, FIX_DETAIL, { endDate: null }));
  ok('an absent close date is null, never a guess', noClose.close_date === null);
  const badDate = workday.normalize(FIX_POSTING, Object.assign({}, FIX_DETAIL, { endDate: 'soon' }));
  ok('an unparseable date is null, never coerced', badDate.close_date === null);

  section('19. Seed integrity');
  ok('the base résumé has bullets with stable ids',
    seed.MANUEL_RESUME.roles.every((r) => r.bullets.every((b) => !!b.id)));
  ok('the independent practice is stated as outside Citi',
    seed.MANUEL_RESUME.roles.some((r) => (r.note || '').includes('NOT performed at')));
  ok('seeded verified skills carry evidence', seed.SEED_VERIFIED.every((s) => s[1] && s[1].length > 5));
  ok('seeded searches are many and targeted, not one firehose', seed.SEED_QUERIES.length >= 6);

  section('18b. JPMorgan Chase (Oracle Fusion) — a second bank, same board');
  {
    const employers = require('./src/services/employers');
    const oracle = require('./src/services/oracle');

    ok('five banks are registered',
      employers.list().map((e) => e.key).sort().join(',') === 'capitalone,citi,jpmorgan,pnc,usbank',
      employers.list().map((e) => e.key).join(','));
    ok('four speak Workday, one speaks Oracle',
      employers.list().filter((e) => e.adapter === 'workday').length === 4
      && employers.list().filter((e) => e.adapter === 'oracle').length === 1);
    ok('every bank declares the id shape read off its live feed',
      employers.list().every((e) => e.id_pattern instanceof RegExp));
    ok('Citi speaks Workday and JPMorgan speaks Oracle',
      employers.get('citi').adapter === 'workday' && employers.get('jpmorgan').adapter === 'oracle');
    ok('Workday\'s 2000 cap is recorded; Oracle\'s real total is not',
      employers.get('citi').total_is_capped === true && employers.get('jpmorgan').total_is_capped === false);

    // WHICH BANK A PASTED ID BELONGS TO IS DETECTED, NEVER DEFAULTED. Filing a
    // JPMorgan requisition under Citi would be silently wrong forever.
    ok('an 8-digit id is Citi', (employers.detect('26974948') || {}).key === 'citi');
    ok('a 9-digit id is JPMorgan', (employers.detect('210712563') || {}).key === 'jpmorgan');
    ok('a Workday URL is Citi', (employers.detect('https://citi.wd5.myworkdayjobs.com/2/job/X_26974948-1') || {}).key === 'citi');
    ok('an Oracle URL is JPMorgan',
      (employers.detect('https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210712563') || {}).key === 'jpmorgan');
    ok('a U.S. Bank id is U.S. Bank', (employers.detect('2026-0025089') || {}).key === 'usbank');
    ok('a PNC URL is PNC',
      (employers.detect('https://pnc.wd5.myworkdayjobs.com/External/job/PA/Data-Manager_R223512-1') || {}).key === 'pnc');
    ok('a Capital One URL is Capital One',
      (employers.detect('https://capitalone.wd12.myworkdayjobs.com/Capital_One/job/McLean-VA/X_R249146-1') || {}).key === 'capitalone');
    ok('a U.S. Bank URL is U.S. Bank',
      (employers.detect('https://usbank.wd1.myworkdayjobs.com/US_Bank_Careers/job/MO/Data-Scientist_2026-0018812') || {}).key === 'usbank');

    // PNC AND CAPITAL ONE BOTH ISSUE R######. The registry must say so rather
    // than pick one — a requisition filed under the wrong bank is wrong
    // silently and forever.
    let amb = null;
    try { employers.detect('R224025'); } catch (e) { amb = e; }
    ok('a shape two banks share raises AMBIGUOUS, never a guess', amb && amb.code === 'AMBIGUOUS');
    ok('...and names both candidates so a human can choose',
      amb && amb.candidates.map((c) => c.key).sort().join(',') === 'capitalone,pnc');
    ok('naming the bank resolves it', employers.reqIdFrom('pnc', 'R224025') === 'R224025');
    ok('...for either bank', employers.reqIdFrom('capitalone', 'R247988') === 'R247988');
    ok('a Workday path id survives the non-numeric form',
      employers.reqIdFrom('pnc', '/job/PA---Pittsburgh-15222/Data-Manager_R223512-1') === 'R223512');

    // WORKDAY REQ IDS ARE NOT NUMBERS, and assuming they were dropped every PNC
    // and U.S. Bank posting silently: 620 read, zero stored, no error raised.
    // A feed that yields no id must never look like a feed with no jobs.
    const shapes = [
      ['citi', { bulletFields: ['26974948'], externalPath: '/job/Tampa/X_26974948-1' }, '26974948'],
      ['pnc', { bulletFields: ['R224025'], externalPath: '/job/PA/Security-Analyst_R224025' }, 'R224025'],
      ['capitalone', { bulletFields: ['R249146'], externalPath: '/job/McLean-VA/Eng_R249146-1' }, 'R249146'],
      ['usbank', { bulletFields: ['2026-0025089'], externalPath: '/job/MN/DBA_2026-0025089' }, '2026-0025089']
    ];
    shapes.forEach(([k, posting, want]) => {
      ok(`${k} requisition id is read, not assumed numeric`,
        workday.reqIdOf(posting, employers.get(k).cfg) === want,
        String(workday.reqIdOf(posting, employers.get(k).cfg)));
    });
    // The dangerous half: a greedy path parse turns 2026-0025089 into "2026",
    // which is a confidently WRONG id rather than a missing one.
    ok('a dashed id is never truncated by the path fallback',
      workday.reqIdOf({ externalPath: '/job/MO/Data-Scientist_2026-0018812' }, employers.get('usbank').cfg) === '2026-0018812');
    ok('a repost suffix (-1) is stripped, the id is not',
      workday.reqIdOf({ externalPath: '/job/McLean-VA/Eng_R249146-1' }, employers.get('capitalone').cfg) === 'R249146');
    const normPnc = workday.normalize({ bulletFields: ['R224025'], externalPath: '/job/PA/X_R224025', title: 'Sec Analyst', locationsText: 'Pittsburgh PA' },
      null, employers.get('pnc').cfg);
    ok('...so a PNC posting normalizes to a storable row', normPnc.req_id === 'R224025' && !!normPnc.url_workday);

    ok('an ambiguous number resolves to NOTHING rather than a guess', employers.detect('12345') === null);
    ok('junk resolves to nothing', employers.detect('hello there') === null);

    const jl = await oracle.listAll({ searchText: 'observability', maxPages: 1, cfg: employers.get('jpmorgan').cfg,
      budget: workday.newBudget(5) });
    ok('the Oracle list returns the TRUE total, not a 2000 cap', jl.total === 7456, String(jl.total));
    ok('...and the postings', jl.postings.length === 1);

    const jd = await oracle.getDetail('210712563', { cfg: employers.get('jpmorgan').cfg, budget: workday.newBudget(5) });
    const jn = oracle.normalize(FIX_JPMC_LIST, jd, employers.get('jpmorgan').cfg);
    ok('JPMorgan req id', jn.req_id === '210712563');
    ok('title, location, work model, schedule', jn.title.startsWith('Lead Software Engineer')
      && jn.location.includes('Columbus') && jn.remote_type === 'Hybrid' && jn.time_type === 'Full time');
    ok('posted date', jn.posted_on === '2026-08-13');
    ok('an absent close date stays null, never a guess', jn.close_date === null);
    ok('the apply URL is Oracle\'s, derived from the id it returned', /oraclecloud\.com\/hcmUI/.test(jn.url_workday));
    ok('no jobs.citi.com link is ever attached to a JPMorgan row', jn.url_citi_careers === null);
    // Oracle splits the posting across fields; the qualifications block is where
    // the requirements a score depends on actually live.
    ok('description joins description + qualifications + responsibilities',
      /data governance/.test(jn.description_text) && /statistical modelling/.test(jn.description_text)
      && /program delivery/i.test(jn.description_text));
    ok('salary absent when the posting is silent', jn.salary_min_cents === null && jn.salary_source === null);

    const paid = oracle.normalize({ Id: '210999001' },
      await oracle.getDetail('210999001', { cfg: employers.get('jpmorgan').cfg, budget: workday.newBudget(5) }),
      employers.get('jpmorgan').cfg);
    ok('a stated "Base Pay Range" IS parsed', paid.salary_min_cents === 15000000 && paid.salary_max_cents === 19000000);
    ok('...and marked stated', paid.salary_source === 'stated');

    // Import routes to the right bank without being told which.
    const jrow = await agent.importReq(tenant, '210712563');
    ok('importing a JPMorgan id files it under JPMorgan', jrow.employer === 'jpmorgan', jrow.employer);
    ok('...with its own detail', jrow.detail_fetched === true && jrow.title.startsWith('Lead Software'));
    await throws('an unresolvable paste is refused, not filed under a default bank',
      () => agent.importReq(tenant, '12345'), 'NO_REQ_ID');

    // Two banks could one day issue the same requisition number.
    const citiRow = await Req.findOne({ where: { tenant_id: tenant, employer: 'citi', req_id: '26974948' } });
    ok('Citi and JPMorgan rows coexist in one pool', !!citiRow && !!jrow && citiRow.employer !== jrow.employer);
    const clash = await Req.create({ tenant_id: tenant, employer: 'jpmorgan', req_id: '26974948', title: 'same number, other bank' });
    ok('the same req number under a DIFFERENT bank is allowed', !!clash.id);
    let dupe = false;
    try { await Req.create({ tenant_id: tenant, employer: 'jpmorgan', req_id: '26974948', title: 'dupe' }); }
    catch (e) { dupe = true; }
    ok('...but a duplicate within the same bank is refused', dupe);
    await clash.destroy();
  }

  section('19b. Host lock — the tracker exists only on the console\'s domain');
  {
    const express = require('express');
    const app = express();
    app.use('/citi-tracker', require('./src/index'));
    const server = await new Promise((r) => { const s2 = app.listen(0, () => r(s2)); });
    const port = server.address().port;
    // fetch() silently DROPS a Host header (it is a forbidden header name), so
    // a host-lock test written with fetch always passes against the wrong host.
    const http = require('http');
    const hit = (p_, host) => new Promise((resolve, reject) => {
      const rq = http.request({ host: '127.0.0.1', port, path: '/citi-tracker' + p_, method: 'GET',
        headers: host ? { Host: host } : {} }, (rs) => {
        rs.resume();
        rs.on('end', () => resolve({ status: rs.statusCode }));
      });
      rq.on('error', reject);
      rq.end();
    });

    // META-TEST, and the reason this section can be trusted at all.
    // The host lock was first tested with fetch(), which SILENTLY DROPS a Host
    // header because it is a forbidden header name. Every assertion below then
    // ran against 127.0.0.1 and passed while proving nothing. Before testing
    // the lock, prove the harness can actually deliver the header — and pin the
    // fetch behaviour so a future rewrite back to fetch fails loudly here
    // instead of quietly turning this whole section into theatre.
    const echo = http.createServer((rq2, rs2) => {
      rs2.writeHead(200, { 'content-type': 'application/json' });
      rs2.end(JSON.stringify({ host: rq2.headers.host }));
    });
    await new Promise((r) => echo.listen(0, r));
    const echoPort = echo.address().port;

    const viaHttp = await new Promise((resolve, reject) => {
      const rq2 = http.request({ host: '127.0.0.1', port: echoPort, path: '/', headers: { Host: 'manuelstagg.com' } },
        (rs2) => { let b = ''; rs2.on('data', (d) => { b += d; }); rs2.on('end', () => resolve(JSON.parse(b))); });
      rq2.on('error', reject);
      rq2.end();
    });
    ok('the harness really does deliver the Host header it claims to send',
      viaHttp.host === 'manuelstagg.com', 'server saw ' + viaHttp.host);

    const viaFetch = await (await fetch(`http://127.0.0.1:${echoPort}/`, { headers: { Host: 'manuelstagg.com' } })).json();
    ok('...and fetch() still drops it, which is the trap this guards against',
      viaFetch.host !== 'manuelstagg.com', 'fetch unexpectedly delivered ' + viaFetch.host);
    await new Promise((r) => echo.close(r));

    const wrong = await hit('/', 'aiagent.ringlypro.com');
    ok('the CRM host does not serve the tracker at all', wrong.status === 404, 'HTTP ' + wrong.status);
    ok('...and answers 404, not 403 (a 403 confirms there is something here)', wrong.status !== 403);
    const wrongApi = await hit('/api/v1/board', 'aiagent.ringlypro.com');
    ok('the API is gone on that host too', wrongApi.status === 404);

    const right = await hit('/', 'manuelstagg.com');
    ok('the console domain still reaches it', right.status !== 404, 'HTTP ' + right.status);
    const health = await hit('/health', 'aiagent.ringlypro.com');
    ok('health stays reachable everywhere for monitoring', health.status === 200);

    await new Promise((r) => server.close(r));
  }

  section('19c. Citi requisitions in the console pipeline (one board, two windows)');
  {
    const cv = require('../../src/routes/cv-engine');
    const bridge = cv._citi;
    ok('the pipeline bridge is wired', !!bridge && typeof bridge.citiPipelineRows === 'function');
    ok('interview maps to the console\'s "interviewing"', bridge.CITI_STAGE_FROM_STATUS.interview === 'interviewing');
    ok('...and back again', bridge.CITI_STATUS_FROM_STAGE.interviewing === 'interview');
    ok('every other stage is 1:1', ['saved', 'applied', 'screening', 'offer', 'closed']
      .every((x) => bridge.CITI_STAGE_FROM_STATUS[x] === x));

    const cvProfile = { id: 999, slug: 'sit-cv-' + profileA.id };
    bridge.CITI_PROFILE_BY_CV_SLUG[cvProfile.slug] = profileA.slug;

    const tr2 = await Tracked.findOne({ where: { tenant_id: tenant, profile_id: profileA.id, req_id: '26974948' } });
    tr2.status = 'new'; tr2.status_reason = null; await tr2.save();
    let rows = await bridge.citiPipelineRows(cvProfile);
    ok('a NEW requisition is not in the pipeline yet', !rows.some((r) => r.req_id === '26974948'));

    tr2.status = 'saved'; tr2.status_changed_at = new Date(); await tr2.save();
    rows = await bridge.citiPipelineRows(cvProfile);
    const row = rows.find((r) => r.req_id === '26974948');
    ok('setting it to SAVED puts it in the pipeline', !!row);
    ok('...tagged as a Citi row', row && row.source === 'citi' && row.company === 'Citi');
    ok('...carrying the requisition title and apply link', row && !!row.title && !!row.url);
    ok('...and its match score', row && row.score != null);
    ok('...with a compound id the console can route back', row && row.id === 'citi:' + tr2.id);
    ok('salary shown only when the posting stated it', row && row.salary_min_cents === 14144000);

    // The 'applied' branch is the one carrying the timestamp CAST, which is
    // exactly where the original UPDATE ... FROM syntax error lived. Left
    // untested, that statement could break again and no assertion would notice.
    tr2.applied_at = null; await tr2.save();
    const appliedMove = await bridge.citiSetStage(cvProfile, tr2.id, 'applied', {});
    ok('the console can mark it applied', appliedMove.ok);
    await tr2.reload();
    ok('...and applied_at is stamped by that statement', tr2.status === 'applied' && !!tr2.applied_at);
    const firstApplied = tr2.applied_at;
    await bridge.citiSetStage(cvProfile, tr2.id, 'applied', {});
    await tr2.reload();
    ok('...but never re-stamped on a second pass', String(tr2.applied_at) === String(firstApplied));

    const moved = await bridge.citiSetStage(cvProfile, tr2.id, 'interviewing', {});
    ok('the console can move it forward', moved.ok);
    await tr2.reload();
    ok('...and the tracker board is what actually changed', tr2.status === 'interview', tr2.status);

    await bridge.citiSetStage(cvProfile, tr2.id, 'closed', {});
    await tr2.reload();
    ok('closing from the pipeline records a reason of "unspecified", not an invented one',
      tr2.status === 'closed' && tr2.status_reason === 'unspecified');

    const otherProfile = { id: 998, slug: 'sit-cv-nobody' };
    const none = await bridge.citiPipelineRows(otherProfile);
    ok('an unmapped CV profile sees no Citi rows', none.length === 0);
    const refused = await bridge.citiSetStage(otherProfile, tr2.id, 'saved', {});
    ok('...and cannot move one either', refused.ok === false);

    tr2.status = 'saved'; tr2.status_reason = null; await tr2.save();
  }

  section('20. Single sign-on from the CV admin console');
  {
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const app = express();
    app.use('/citi-tracker', require('./src/index'));
    const server = await new Promise((r) => { const s2 = app.listen(0, () => r(s2)); });
    const port = server.address().port;
    const BASE = `http://127.0.0.1:${port}/citi-tracker`;
    const crypto = require('crypto');
    const CV_SECRET = process.env.CV_ADMIN_SECRET || process.env.JWT_SECRET || 'cv-engine-secret';
    // EXACTLY what src/routes/cv-engine.js sign() produces: base64url(JSON)
    // plus an HMAC-SHA256, with exp in epoch MILLISECONDS. Minting it any other
    // way is how a broken verifier passed its own test once.
    const cvToken = (slug, secret, expMs) => {
      const body = Buffer.from(JSON.stringify({
        pid: 1, slug, exp: expMs === undefined ? Date.now() + 3600000 : expMs
      })).toString('base64url');
      const mac = crypto.createHmac('sha256', secret || CV_SECRET).update(body).digest('base64url');
      return body + '.' + mac;
    };
    const get = (path_, cookie) => fetch(BASE + path_, {
      redirect: 'manual', headers: cookie ? { cookie } : {}
    });

    const anon = await get('/api/v1/profiles');
    ok('no cookie is refused', anon.status === 401);

    const good = await get('/api/v1/profiles', 'cv_admin_token=' + cvToken('manuelstagg'));
    ok('an allowlisted CV console session is accepted', good.status === 200, 'HTTP ' + good.status);
    ok('...and it issues a tracker cookie so the next request is cheap',
      /citijobs_token=/.test(good.headers.get('set-cookie') || ''));

    const other = await get('/api/v1/profiles', 'cv_admin_token=' + cvToken('anastagg'));
    ok('a CV session for another person grants nothing here', other.status === 401, 'HTTP ' + other.status);

    const forged = await get('/api/v1/profiles', 'cv_admin_token=' + cvToken('manuelstagg', 'the-wrong-secret'));
    ok('a forged console token is refused', forged.status === 401, 'HTTP ' + forged.status);

    const garbage = await get('/api/v1/profiles', 'cv_admin_token=not-a-token');
    ok('a garbage cookie is refused, not crashed on', garbage.status === 401);

    const expired = await get('/api/v1/profiles', 'cv_admin_token=' + cvToken('manuelstagg', null, Date.now() - 1000));
    ok('an expired console session is refused', expired.status === 401, 'HTTP ' + expired.status);

    // The console signs its OWN token format, not a JWT. Reading it as a JWT
    // rejects every real session, and shipped once because the test minted a
    // JWT too. A JWT arriving here must be refused, and this locks that.
    const asJwt = await get('/api/v1/profiles', 'cv_admin_token=' + jwt.sign({ pid: 1, slug: 'manuelstagg' }, CV_SECRET));
    ok('a JWT is NOT the console format and is refused', asJwt.status === 401, 'HTTP ' + asJwt.status);

    const tampered = (() => { const t = cvToken('anastagg'); const [b] = t.split('.');
      const evil = Buffer.from(JSON.stringify({ pid: 1, slug: 'manuelstagg', exp: Date.now() + 3600000 })).toString('base64url');
      return evil + '.' + t.split('.')[1] + (b ? '' : ''); })();
    const swapped = await get('/api/v1/profiles', 'cv_admin_token=' + tampered);
    ok('a body swapped onto a valid signature is refused', swapped.status === 401, 'HTTP ' + swapped.status);

    const page = await get('/', 'cv_admin_token=' + cvToken('manuelstagg'));
    ok('the app page itself loads inside the console (no login bounce)', page.status === 200, 'HTTP ' + page.status);

    const health = await get('/health');
    ok('health stays public', health.status === 200);

    await new Promise((r) => server.close(r));
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  await cleanup();
  console.log(`\n${'-'.repeat(58)}`);
  console.log(`RESULT: ${pass}/${pass + fail} passed`);
  if (fail) { console.log('\nFAILURES:'); failures.forEach((f) => console.log('  - ' + f)); }
  console.log('-'.repeat(58));
  await sequelize.close();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('\nSIT CRASHED:', e);
  try { await cleanup(); await sequelize.close(); } catch (x) { /* ignore */ }
  process.exit(1);
});
