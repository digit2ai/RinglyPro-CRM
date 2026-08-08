'use strict';

/**
 * AI Readiness Department — System Integration Test.
 *
 * These are invariants, not features. If one fails, the department's central
 * claim — that a CEO can trust these numbers — is broken even if every screen
 * still renders.
 *
 * The ones worth failing the build over:
 *   - the same answers produce the same figures with and without a model
 *   - the model cannot introduce a number the engines did not compute
 *   - analysis REFUSES to run on missing interview inputs
 *   - a regulated or customer-facing process never enters Phase 1
 *   - Phase 3 is never priced
 *   - one sponsor cannot read another's engagement, and a model-supplied
 *     tenant_id is deleted rather than honoured
 *   - publishing to a CEO parks for a human and does not run its handler
 *
 * NEVER TOUCHES A REAL ACCOUNT. The dev database is production here, so this
 * provisions its own throwaway sponsors, works only inside those tenants, and
 * deletes everything it made at the end.
 *
 * Run from the repo root:  node verticals/ai-readiness/sit.js
 * Exit 0 = all green. Zero external keys required.
 */

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');

const { sequelize, Sponsor, Engagement, Answer, Finding, Roadmap, Call, Approval } = require('./src/models');
const { brain } = require('./src/department');
const costEngine = require('./src/engines/cost');
const riskEngine = require('./src/engines/risk');
const dataEngine = require('./src/engines/data');
const scorecardEngine = require('./src/engines/scorecard');
const interview = require('./src/engines/interview');
const llm = require('./src/services/llm');

const app = express();
app.use('/ai-readiness', require('./src/index'));

const SIT_A = 'sit-air-a@digit2ai.test';
const SIT_B = 'sit-air-b@digit2ai.test';
const SIT_PW = 'sit-air-' + process.pid;

/* ── a complete, realistic interview, used across the suite ─────────────── */
const FULL_ANSWERS = {
  context: { company_name: 'SIT Manufacturing', ceo_name: 'A. Tester', industry: 'manufacturing',
             country: 'US', headcount: 45, revenue_band: '10m_50m' },
  fears: { top_fears: ['cost', 'risk', 'data'], biggest_fear: 'cost', prior_attempt: 'tried_stalled',
           board_pressure: 'expecting_a_plan' },
  pain: {
    processes: [
      // Safe, high-hours: this must be Phase 1.
      { name: 'quote preparation', people: 3, hours_per_week: 9, loaded_hourly_cost: 45,
        customer_facing: false, involves_regulated_data: false, error_tolerance: 'medium' },
      { name: 'purchase order entry', people: 2, hours_per_week: 7, loaded_hourly_cost: 38,
        customer_facing: false, involves_regulated_data: false, error_tolerance: 'high' },
      // Disqualified: regulated AND customer-facing. Must never reach Phase 1.
      { name: 'patient billing follow-up', people: 2, hours_per_week: 12, loaded_hourly_cost: 52,
        customer_facing: true, involves_regulated_data: true, error_tolerance: 'zero' }
    ],
    known_leak: 'quotes going out late', known_leak_annual_usd: 40000
  },
  cost: { comfortable_pilot_budget_usd: 12000, monthly_run_comfort_usd: 600,
          current_software_spend_monthly_usd: 2400, political_cost_of_failure: 'high',
          decision_process: 'ceo_plus_one' },
  risk: { regulatory_regimes: ['hipaa'], risk_concerns: ['security', 'errors', 'job_disruption'],
          worst_case: 'We send a customer something wrong and they find out before we do.',
          workforce_sensitivity: 'medium', headcount_intent: 'redeploy', security_review_required: true },
  data: { systems: ['erp', 'spreadsheets', 'email'], data_exists: 4, data_quality: 3, data_accessible: 3,
          data_structured: 3, data_owner_exists: true, history_months: 30,
          contains_pii: true, dpa_in_place: true, retention_policy: false }
};

const server = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/ai-readiness';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? (pass++, console.log('PASS ' + m)) : (fail++, console.log('FAIL ' + m)); };
  let A = null, B = null, cookieA = '', engId = null, engB = null;

  const login = async (email) => {
    const r = await fetch(base + '/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: SIT_PW })
    });
    const setCookie = r.headers.get('set-cookie') || '';
    return { json: await r.json(), cookie: (setCookie.split(';')[0] || '') };
  };
  const api = (p, o = {}) => fetch(base + p, {
    ...o, headers: { 'Content-Type': 'application/json', Cookie: cookieA, ...(o.headers || {}) }
  }).then(r => r.json().then(j => ({ status: r.status, j })));

  try {
    await wait(3500);   // let sync + seed finish

    /* ══ 1. deterministic engines ══════════════════════════════════════ */
    console.log('\n-- engines --');
    const c1 = costEngine.analyze({
      processes: FULL_ANSWERS.pain.processes,
      known_leak_annual_usd: FULL_ANSWERS.pain.known_leak_annual_usd,
      comfortable_pilot_budget_usd: 12000, systems_count: 3
    });
    const c2 = costEngine.analyze({
      processes: FULL_ANSWERS.pain.processes,
      known_leak_annual_usd: FULL_ANSWERS.pain.known_leak_annual_usd,
      comfortable_pilot_budget_usd: 12000, systems_count: 3
    });
    ok(JSON.stringify(c1) === JSON.stringify(c2), 'cost engine is deterministic across runs');

    // 3 people x 9 hrs x 52 x $45 = 63,180 ; 2 x 7 x 52 x 38 = 27,664 ; 2 x 12 x 52 x 52 = 64,896
    const expected = 63180 + 27664 + 64896 + 40000;
    ok(c1.cost_of_doing_nothing.total_annual_usd === expected,
      `cost of doing nothing computed from the CEO's own hours and rates (${c1.cost_of_doing_nothing.total_annual_usd} = ${expected})`);

    ok(!c1.pilot_scope.some(p => /patient billing/.test(p.name)),
      'a regulated + customer-facing process never enters Phase 1');
    ok(c1.excluded_from_pilot.some(p => /patient billing/.test(p.name) && p.blockers.length >= 2),
      'the excluded process is reported with its blockers rather than silently dropped');
    ok(c1.phases.phase_3.costed === false && !!c1.phases.phase_3.why_not_costed,
      'Phase 3 is never priced, and says why');
    ok(c1.assumptions.length >= 8 && c1.assumptions.every(a => a.basis),
      'every assumption is listed with its basis');
    ok(c1.phases.phase_1.max_exposure_usd > 0 &&
       c1.phases.phase_1.max_exposure_usd >= c1.phases.phase_1.build_usd.mid,
      'maximum exposure is stated and covers build plus run');

    // A ceiling below the two-process pilot must narrow the scope, visibly.
    const tight = costEngine.analyze({ processes: FULL_ANSWERS.pain.processes, comfortable_pilot_budget_usd: 4000, systems_count: 3 });
    ok(tight.narrowed_to_fit === true || tight.fits_ceiling === false,
      'a pilot over the stated ceiling is narrowed or the shortfall is reported, never silently accepted');
    ok(tight.fits_ceiling === false ? typeof tight.ceiling_shortfall_usd === 'number' : true,
      'a shortfall against the ceiling is reported as a number');

    // No hours or rates given: nothing may be invented.
    const empty = costEngine.analyze({ processes: [{ name: 'unknown work' }], comfortable_pilot_budget_usd: 5000 });
    ok(empty.cost_of_doing_nothing.total_annual_usd === 0 && empty.cost_of_doing_nothing.incomplete === true,
      'with no hours or rates, no cost is invented and the gap is flagged');
    const noLeak = costEngine.costOfDoingNothing(FULL_ANSWERS.pain.processes, undefined);
    ok(noLeak.stated_leak_annual_usd === null, 'an unstated leak is omitted rather than estimated');

    const r1 = riskEngine.analyze({
      risk_concerns: FULL_ANSWERS.risk.risk_concerns,
      regulatory_regimes: ['hipaa'], headcount_intent: 'redeploy',
      political_cost_of_failure: 'high',
      pilot_scope: c1.pilot_scope, excluded_from_pilot: c1.excluded_from_pilot
    }, 'en');
    ok(r1.register.length === 3 && r1.register.every(x => x.mitigation && x.guardrail && x.owner && x.evidence_of_control),
      'every named risk carries a mitigation, a guardrail, an owner and evidence');
    ok(r1.pilot.exit_criteria.length >= 4 && !!r1.pilot.kill_switch,
      'the pilot defines exit criteria and a named kill switch');
    ok(r1.pilot.posture === 'internal_only',
      'a high political cost of failure forces an internal-only pilot');
    ok(r1.regulatory_obligations.length === 1 && r1.regulatory_obligations[0].regime === 'HIPAA',
      'the named regulatory regime produces explicit obligations');
    const undecided = riskEngine.analyze({ risk_concerns: ['security'], headcount_intent: 'undecided', pilot_scope: c1.pilot_scope }, 'en');
    ok(undecided.workforce.is_gap === true && undecided.score < r1.score,
      'an unstated headcount intent is scored as the unmanaged risk it is');

    const d1 = dataEngine.analyze({ ...FULL_ANSWERS.data, processes: FULL_ANSWERS.pain.processes });
    ok(d1.score > 0 && ['red', 'yellow', 'green'].includes(d1.rating), 'data readiness produces a score and a rating');
    ok(d1.can_start_phase_1 === true, 'good-enough data does not block a pilot');
    const pii = dataEngine.analyze({ ...FULL_ANSWERS.data, dpa_in_place: false, processes: FULL_ANSWERS.pain.processes });
    ok(pii.can_start_phase_1 === false && pii.blocking.some(b => /agreement/i.test(b.gap + b.fix)),
      'personal data with no processing agreement blocks Phase 1');
    ok(pii.blocking.every(b => b.effort_days <= 10),
      'blocking remediation is measured in days, not months');
    const unanswered = dataEngine.analyze({ data_exists: 4, data_quality: 4, data_accessible: 4 });
    ok(unanswered.score >= 60,
      'unanswered dimensions are excluded from the average rather than scored as zero');

    /* ══ 2. interview gate ═════════════════════════════════════════════ */
    console.log('\n-- interview --');
    ok(interview.missingRequired({}).length > 0, 'an empty interview reports missing required answers');
    ok(interview.missingRequired(FULL_ANSWERS).length === 0, 'the full answer set has no gaps');
    ok(interview.completeness({}) === 0 && interview.completeness(FULL_ANSWERS) > 70,
      'completeness tracks how much of the interview is done');
    ok(interview.SECTIONS[1].id === 'fears',
      'the interview is fear-first: fears precede the operational sections');

    /* ══ 3. auth + tenancy ═════════════════════════════════════════════ */
    console.log('\n-- auth and tenancy --');
    const hash = await bcrypt.hash(SIT_PW, 10);
    A = await Sponsor.create({ email: SIT_A, name: 'SIT A', password_hash: hash, role: 'sponsor', created_at: new Date() });
    A.tenant_id = A.id; await A.save();
    B = await Sponsor.create({ email: SIT_B, name: 'SIT B', password_hash: hash, role: 'sponsor', created_at: new Date() });
    B.tenant_id = B.id; await B.save();

    const anon = await fetch(base + '/api/v1/engagements');
    ok(anon.status === 401, 'unauthenticated API access is refused');
    const health = await fetch(base + '/health').then(r => r.json());
    ok(health.status === 'healthy' && health.agents === 5, `health reports the department (${health.agents} agents, ${health.tools} tools)`);

    const bad = await fetch(base + '/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SIT_A, password: 'wrong' })
    });
    ok(bad.status === 401, 'a wrong password is refused');

    const la = await login(SIT_A);
    cookieA = la.cookie;
    ok(la.json.success === true && !!cookieA, 'sponsor A signs in');

    /* ══ 4. the crew is registered ═════════════════════════════════════ */
    console.log('\n-- the department --');
    const agents = await api('/api/v1/agents');
    const ids = (agents.j.agents || []).map(a => a.id).sort();
    ok(JSON.stringify(ids) === JSON.stringify(['cost_comfort', 'data_readiness', 'readiness_director', 'risk_comfort', 'roadmap_builder']),
      'all five agents are registered: ' + ids.join(', '));
    ok((agents.j.agents || []).every(a => a.tool_count > 0), 'every agent registers at least one tool');

    // Discovery and execution must agree on every tool, not a sample.
    const catalog = brain.listTools({ channel: 'web_orb', role: 'sponsor', identity_verified: false });
    let mismatch = 0;
    for (const t of Object.keys(brain.registry)) {
      const entry = brain.registry[t];
      const visible = catalog.some(x => x.name === t);
      const channelOk = !entry.channels || entry.channels.includes('web_orb');
      const trustOk = !entry.min_trust || ['public_web'].includes(entry.min_trust);
      if (visible !== (channelOk && trustOk)) mismatch++;
    }
    ok(mismatch === 0, 'the catalog and the gateway agree on every tool at public_web trust');

    /* ══ 5. the engagement ═════════════════════════════════════════════ */
    console.log('\n-- engagement --');
    const opened = await api('/api/v1/engagements', { method: 'POST', body: JSON.stringify({ company_name: 'SIT Manufacturing', ceo_name: 'A. Tester', lang: 'en' }) });
    engId = opened.j.engagement_id;
    ok(opened.j.success === true && engId > 0, 'an engagement opens');

    const noName = await api('/api/v1/engagements', { method: 'POST', body: JSON.stringify({ company_name: '  ' }) });
    ok(noName.j.success === false, 'an engagement without a company name is refused');

    // THE refusal: analysis on missing inputs.
    const early = await api(`/api/v1/engagements/${engId}/run`, { method: 'POST', body: JSON.stringify({}) });
    ok(early.j.success === false && early.j.code === 'interview_incomplete' && (early.j.missing_required || []).length > 0,
      'the department REFUSES to analyse while required answers are missing, and names them');

    for (const section of Object.keys(FULL_ANSWERS)) {
      const res = await api(`/api/v1/engagements/${engId}/answers`, {
        method: 'POST', body: JSON.stringify({ section, payload: FULL_ANSWERS[section], answered_by: 'ceo' })
      });
      if (section === 'data') ok(res.j.success === true && res.j.ready_to_analyse === true, 'the interview completes and reports ready to analyse');
    }
    const badSection = await api(`/api/v1/engagements/${engId}/answers`, { method: 'POST', body: JSON.stringify({ section: 'nonsense', payload: {} }) });
    ok(badSection.j.success === false, 'an unknown interview section is refused');

    /* ══ 6. run the crew ═══════════════════════════════════════════════ */
    console.log('\n-- run --');
    const run = await api(`/api/v1/engagements/${engId}/run`, { method: 'POST', body: JSON.stringify({ skip_narrative: true }) });
    ok(run.j.success === true, 'the department runs end to end');
    ok((run.j.agents_run || []).length === 4, 'four agents ran: three lanes plus the roadmap builder');
    ok(run.j.agents_run[0].agent === 'data_readiness',
      'data runs first, because its blocking count feeds the cost model');

    const sc = run.j.scorecard || {};
    ok((sc.lanes || []).length === 3 && sc.lanes.every(l => ['red', 'yellow', 'green'].includes(l.rating)),
      'the scorecard rates all three lanes Red, Yellow or Green');
    ok(['pilot', 'narrow_pilot', 'remediate_first'].includes(sc.verdict), `a verdict is produced (${sc.verdict})`);
    ok(!!sc.safe_next_step && !!sc.safe_next_step.step,
      'there is ALWAYS a safe next step — the department never ends on "not ready"');
    ok(sc.safe_next_step.you_can_stop_after === true, 'the next step is one the CEO can stop after');

    const phases = run.j.phases || [];
    ok(phases.length === 3, 'three phases are produced');
    ok(phases[0].risk_level === 'low' && !phases[0].scope.some(s => /patient billing/.test(s)),
      'Phase 1 is low risk and excludes the regulated, customer-facing process');
    ok(phases[0].timeline_weeks <= 6, 'the pilot is scoped in weeks, not months');
    ok((phases[0].exit_criteria || []).length >= 4, 'Phase 1 carries written exit criteria');
    ok((phases[0].success_metrics || []).length >= 4, 'Phase 1 carries measurable success metrics');
    ok(!!phases[0].gate && (phases[0].gate.conditions || []).length >= 3, 'Phase 1 has a gate with conditions');
    ok(phases[2].cost.costed === false, 'Phase 3 is not priced');
    ok(phases.every(p => !JSON.stringify(p).match(/\bguarantee/i)), 'no phase uses guarantee language');

    ok((run.j.talk_track || []).length >= 6, 'a sponsor talk track is produced');
    const objections = (run.j.talk_track || []).find(t => t.objections);
    ok(objections && objections.objections.length >= 5, 'the talk track carries prepared answers to the objections raised');

    /* ══ 7. numbers are model-independent ══════════════════════════════ */
    console.log('\n-- honesty --');
    const rerun = await api(`/api/v1/engagements/${engId}/run`, { method: 'POST', body: JSON.stringify({ skip_narrative: true }) });
    const strip = (o) => JSON.stringify({ scorecard: o.scorecard, phases: o.phases });
    ok(strip(run.j) === strip(rerun.j), 'identical answers produce identical figures on a re-run');

    const allowed = llm.allowedNumbers({ a: 12000, b: 'we spend $63,180 a year' });
    ok(allowed.has(12000) && allowed.has(63180), 'the narrative verifier harvests every permitted figure from the facts');
    ok(!allowed.has(987654), 'a figure absent from the facts is not permitted');
    const invented = [...llm.numbersIn('The pilot saves $250,000 in year one.')].filter(n => !allowed.has(n));
    ok(invented.length > 0, 'an invented figure in model prose is detectable and would be rejected');
    ok(run.j.narrative_by === 'heuristic',
      'with the narrative skipped the deterministic prose is used and labeled as such');

    const finding = await Finding.findOne({ where: { tenant_id: A.id, engagement_id: engId, agent: 'cost_comfort' } });
    ok(finding && finding.computed_by === 'deterministic', 'lane findings record that they were computed deterministically');

    /* ══ 8. approval gate ══════════════════════════════════════════════ */
    console.log('\n-- approvals --');
    const beforeRoadmaps = await Roadmap.count({ where: { tenant_id: A.id, engagement_id: engId } });
    const pub = await api(`/api/v1/engagements/${engId}/publish`, { method: 'POST', body: JSON.stringify({}) });
    ok(pub.j.requires_approval === true && pub.j.approval_id > 0,
      'publishing to the CEO parks for a human signature');
    const engAfter = await Engagement.findOne({ where: { tenant_id: A.id, id: engId } });
    ok(!engAfter.share_token,
      'the approval-gated handler did NOT run: no link exists until a person signs off');

    const approved = await api(`/api/v1/approvals/${pub.j.approval_id}`, { method: 'POST', body: JSON.stringify({ approve: true }) });
    ok(approved.j.success === true && approved.j.status === 'executed', 'an approved item executes');
    const replay = await api(`/api/v1/approvals/${pub.j.approval_id}`, { method: 'POST', body: JSON.stringify({ approve: true }) });
    ok(replay.j.success === false, 'an executed approval cannot be replayed');

    const engPub = await Engagement.findOne({ where: { tenant_id: A.id, id: engId } });
    ok(!!engPub.share_token && engPub.share_token.length >= 16, 'a share token is minted only after sign-off');
    ok(beforeRoadmaps > 0, 'a roadmap version existed before publication');

    /* ══ 9. the CEO's read-only link ═══════════════════════════════════ */
    console.log('\n-- the CEO link --');
    const pubView = await fetch(base + '/api/v1/public/roadmap/' + engPub.share_token).then(r => r.json());
    ok(pubView.success === true && !!pubView.roadmap.scorecard, 'the read-only link serves the roadmap with no session');
    ok(pubView.roadmap.talk_track === undefined,
      'the sponsor talk track is NOT in the CEO copy — it is the script, including how to read the room');
    const badToken = await fetch(base + '/api/v1/public/roadmap/short');
    ok(badToken.status === 404, 'a guessed short token is refused');

    /* ══ 10. tenancy ═══════════════════════════════════════════════════ */
    console.log('\n-- isolation --');
    engB = await Engagement.create({ tenant_id: B.id, company_name: 'SIT Other Co', stage: 'intake', lang: 'en', created_at: new Date(), updated_at: new Date() });
    const cross = await api('/api/v1/engagements/' + engB.id);
    ok(cross.j.success === false, "sponsor A cannot read sponsor B's engagement");
    const crossRoadmap = await api(`/api/v1/engagements/${engB.id}/roadmap`);
    ok(crossRoadmap.status === 404, "sponsor A cannot read sponsor B's roadmap");
    const crossAnswers = await api(`/api/v1/engagements/${engB.id}/answers`, { method: 'POST', body: JSON.stringify({ section: 'context', payload: { company_name: 'hijack' } }) });
    ok(crossAnswers.j.success === false, "sponsor A cannot write into sponsor B's engagement");

    // The line that makes cross-tenant access unrepresentable.
    const hijack = await brain.callTool('readiness_director.engagement_status',
      { engagement_id: engB.id, tenant_id: B.id }, { tenant_id: A.id, channel: 'admin', role: 'sponsor', identity_verified: true });
    ok(hijack.success === false && /not found/i.test(hijack.error),
      'a model-supplied tenant_id is DELETED — the hijack reads as "not found", not as another tenant\'s row');

    /* ══ 11. the five gates ════════════════════════════════════════════ */
    console.log('\n-- gates --');
    const anonTrust = await brain.callTool('readiness_director.engagement_status', { engagement_id: engId },
      { tenant_id: A.id, channel: 'web_orb', identity_verified: false });
    ok(anonTrust.success === false && anonTrust.code === 'forbidden',
      'an anonymous web caller is denied an identified-trust tool');
    const identified = await brain.callTool('readiness_director.department_overview', {},
      { tenant_id: A.id, channel: 'web_orb', identity_verified: false });
    ok(identified.success === true, 'a public_web tool is reachable anonymously');
    const noTenant = await brain.callTool('readiness_director.department_overview', {}, { channel: 'admin' });
    ok(noTenant.success === false && /tenant/i.test(noTenant.error), 'a call with no tenant context is refused');
    const unknown = await brain.callTool('nope.not_a_tool', {}, { tenant_id: A.id, channel: 'admin' });
    ok(unknown.success === false, 'an unknown tool is refused');

    const denials = await Call.count({ where: { tenant_id: A.id, success: false } });
    ok(denials > 0, 'denied calls still write an audit row');

    // A throwing handler must become a structured failure, not an exception.
    const original = brain.registry['cost_comfort.budget_path'].handler;
    brain.registry['cost_comfort.budget_path'].handler = async () => { throw new Error('boom'); };
    const thrown = await brain.callTool('cost_comfort.budget_path', { engagement_id: engId }, { tenant_id: A.id, channel: 'admin', role: 'sponsor' });
    brain.registry['cost_comfort.budget_path'].handler = original;
    ok(thrown.success === false && /boom/.test(thrown.error), 'a thrown handler becomes a structured failure');

    /* ══ 12. decision + activity ═══════════════════════════════════════ */
    console.log('\n-- outcome --');
    const dec = await api(`/api/v1/engagements/${engId}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'pilot', note: 'sit' }) });
    ok(dec.j.success === true, 'the CEO decision is recorded');
    const st = await api('/api/v1/engagements/' + engId);
    ok(st.j.engagement.stage === 'decided' && st.j.engagement.decision === 'pilot', 'the engagement reaches the decided stage');
    const act = await api('/api/v1/activity?days=1');
    ok(act.j.success === true && act.j.total_calls > 0, `the audit trail records the run (${act.j.total_calls} calls)`);

    /* ══ 13. scorecard is not an average ═══════════════════════════════ */
    console.log('\n-- scorecard logic --');
    const blocked = scorecardEngine.build({
      cost: { score: 95, rating: 'green', to_green: [], reasons: [], phases: { phase_1: { max_exposure_usd: 9000 } }, cost_of_doing_nothing: { total_annual_usd: 100000 } },
      risk: { score: 90, rating: 'green', to_green: [], reasons: [], register: [{}], pilot: { scope: ['x'], duration_weeks: 4 } },
      data: { score: 30, rating: 'red', to_green: [], reasons: [], can_start_phase_1: false, blocking: [{ fix: 'sign the agreement', effort_days: 2 }], headline: 'blocked' }
    }, 'en');
    ok(blocked.verdict === 'remediate_first',
      'a blocking data item dominates two green lanes — the verdict is not an average');
    ok(!!blocked.safe_next_step.step && blocked.safe_next_step.exposure_usd === 0,
      'even a blocked engagement gets a concrete, zero-cost next step');

    const allGreen = scorecardEngine.build({
      cost: { score: 88, rating: 'green', to_green: [], reasons: [], fits_ceiling: true, phases: { phase_1: { max_exposure_usd: 9000 } }, cost_of_doing_nothing: { total_annual_usd: 190000 }, pilot_scope: [{ name: 'a' }] },
      risk: { score: 85, rating: 'green', to_green: [], reasons: [], register: [{}], pilot: { scope: ['a'], duration_weeks: 4 } },
      data: { score: 80, rating: 'green', to_green: [], reasons: [], can_start_phase_1: true, blocking: [], headline: 'ready' }
    }, 'en');
    ok(allGreen.verdict === 'pilot' && allGreen.confidence === 'high', 'three green lanes produce a pilot verdict at high confidence');

    /* ══ 14. Spanish ═══════════════════════════════════════════════════ */
    console.log('\n-- bilingual --');
    const rEs = riskEngine.analyze({ risk_concerns: ['security'], headcount_intent: 'redeploy', pilot_scope: [{ name: 'x' }] }, 'es');
    ok(/[áéíóúñ]/i.test(rEs.register[0].guardrail + rEs.register[0].mitigation),
      'the Spanish register uses proper orthography');
    const scEs = scorecardEngine.build({
      cost: { score: 80, rating: 'green', reasons: [], to_green: [], phases: { phase_1: { max_exposure_usd: 9000 } }, cost_of_doing_nothing: { total_annual_usd: 100000 }, pilot_scope: [{ name: 'a' }] },
      risk: { score: 80, rating: 'green', reasons: [], to_green: [], register: [{}], pilot: { scope: ['a'], duration_weeks: 4 } },
      data: { score: 80, rating: 'green', reasons: [], to_green: [], can_start_phase_1: true, blocking: [], headline: 'listo' }
    }, 'es');
    ok(/piloto|Ejecute/i.test(scEs.verdict_label), 'the Spanish scorecard renders in Spanish');

    /* ══ 15. no emojis anywhere in the shipped copy ════════════════════ */
    const corpus = JSON.stringify([run.j, blocked, rEs, dataEngine.analyze(FULL_ANSWERS.data)]);
    ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(corpus), 'no emojis appear in any generated copy');

  } catch (e) {
    fail++; console.log('FAIL exception: ' + e.message); console.log(e.stack);
  } finally {
    /* ── cleanup: remove everything this suite created ──────────────── */
    try {
      const tenants = [A && A.id, B && B.id].filter(Boolean);
      for (const t of tenants) {
        await Roadmap.destroy({ where: { tenant_id: t } });
        await Finding.destroy({ where: { tenant_id: t } });
        await Answer.destroy({ where: { tenant_id: t } });
        await Approval.destroy({ where: { tenant_id: t } });
        await Call.destroy({ where: { tenant_id: t } });
        await Engagement.destroy({ where: { tenant_id: t } });
      }
      await Sponsor.destroy({ where: { email: [SIT_A, SIT_B] } });
      console.log('\ncleanup: SIT sponsors and all their rows removed');
    } catch (ce) {
      console.log('\ncleanup warning: ' + ce.message);
    }

    console.log(`\n${pass}/${pass + fail} passed`);
    server.close();
    await sequelize.close().catch(() => {});
    process.exit(fail ? 1 : 0);
  }
});
