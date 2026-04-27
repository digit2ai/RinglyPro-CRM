#!/usr/bin/env node
/**
 * P2B Phase Flow End-to-End Smoke Test (PR-A through PR-C)
 *
 * Validates:
 *  - PR-A: 30-day deadline, auto AI invitations on publish, manual close-recruitment,
 *          real Monte Carlo (NOT 72% mock), auto Final Meeting, auto workspace init
 *  - PR-B: amend plan, signatures invalidated, version history
 *  - PR-C: Project Owner role, milestone lead assignments, non-owner 403s
 */
require('dotenv').config();
const https = require('https');
const { Sequelize, QueryTypes } = require('sequelize');

const HOST = 'aiagent.ringlypro.com';
const BASE = '/chamber/hispamind/api';
const PROPOSER = { email: 'mstagg@digit2ai.com', password: 'Palindrome@7' };

function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = https.request({
      hostname: HOST, path: opts.path, method: opts.method || 'GET', headers: opts.headers || {}
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, body: text }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

async function login(creds) {
  const r = await req({ path: BASE + '/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, creds);
  if (!r.body || !r.body.success) throw new Error(`Login failed for ${creds.email}: ${JSON.stringify(r.body).substring(0,200)}`);
  return r.body.data.token;
}

async function authReq(token, path, method, body) {
  return req({
    path: BASE + path,
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
  }, body);
}

(async () => {
  const seq = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
    dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false
  });
  const results = [];
  function check(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' -- ' + detail : ''}`);
  }

  // -------- PR-A: Stage 0 -> Recruitment + Auto-Cascade --------
  console.log('\n=== PR-A: Stage 0 + Recruitment + Auto-Cascade ===');
  const proposerToken = await login(PROPOSER);
  check('proposer login', !!proposerToken);

  console.log('  -> Generating plan...');
  const draft = await authReq(proposerToken, '/projects/draft', 'POST', {
    vision: 'P2B Phase Flow smoke test -- AI-driven supply chain analytics for Latin American manufacturing. Real-time visibility into shipments, inventory, and supplier performance.\n\nLaunched via CamaraVirtual.app member network: chambers earn revenue share, manufacturers adopt the platform.',
    sector: 'manufactura',
    countries: ['USA', 'Mexico'],
    budget_tier: 'medium'
  });
  check('plan draft generated', draft.body.success, draft.body.success ? `pid=${draft.body.data.project_id}` : draft.body.error);
  if (!draft.body.success) { await seq.close(); process.exit(1); }
  const PID = draft.body.data.project_id;
  const plan = draft.body.data.plan_json;

  // PR-A core: publish should set 30-day deadline + auto-invite
  console.log('  -> Publishing (should auto-invite + set deadline)...');
  const publish = await authReq(proposerToken, `/projects/${PID}/publish`, 'POST');
  check('publish succeeded', publish.body.success);
  check('plan_status = recruiting after publish', publish.body.data.plan_status === 'recruiting',
    `actual: ${publish.body.data.plan_status}`);
  check('recruitment_deadline set ~30 days out', !!publish.body.data.recruitment_deadline,
    publish.body.data.recruitment_deadline);
  const deadlineMs = new Date(publish.body.data.recruitment_deadline).getTime() - Date.now();
  const deadlineDays = Math.round(deadlineMs / 86400000);
  check('deadline is 30 days', deadlineDays >= 29 && deadlineDays <= 31, `${deadlineDays} days`);
  check('invitations_created > 0 on publish', publish.body.data.invitations_created > 0,
    `${publish.body.data.invitations_created} invitations`);

  // Re-run matching with higher top_n to ensure plenty of candidates per role
  await authReq(proposerToken, `/projects/${PID}/invite-matches`, 'POST', { top_n: 10 });

  // Have testers accept enough roles to fill must_have
  const allInvitations = await seq.query(
    `SELECT i.id, i.member_id, i.role_index, m.email
     FROM hispamind_project_invitations i
     JOIN hispamind_members m ON m.id = i.member_id
     WHERE i.project_id = :p AND i.status = 'pending'
     ORDER BY i.role_index, i.match_score DESC NULLS LAST`,
    { replacements: { p: PID }, type: QueryTypes.SELECT }
  );
  // Fill EVERY must_have role -- try each candidate per role until one succeeds
  const acceptedByMember = {};
  const filledRoles = new Set();
  const mustHaveRoleIndexes = plan.team_roles_required
    .map((r, i) => ({ ...r, idx: i }))
    .filter(r => r.must_have)
    .map(r => r.idx);

  for (const idx of mustHaveRoleIndexes) {
    const candidates = allInvitations.filter(i => i.role_index === idx);
    for (const candidate of candidates) {
      if (acceptedByMember[candidate.member_id]) continue;
      try {
        const tt = await login({ email: candidate.email, password: 'CamaraVirtual2026!' });
        const accept = await authReq(tt, `/projects/${PID}/invitations/${candidate.id}/respond`, 'POST', { action: 'accept' });
        if (accept.body.success) {
          acceptedByMember[candidate.member_id] = true;
          filledRoles.add(idx);
          break;
        }
      } catch (e) { /* try next */ }
    }
  }
  check('all must_have roles filled', filledRoles.size === mustHaveRoleIndexes.length,
    `${filledRoles.size} / ${mustHaveRoleIndexes.length} (need=${mustHaveRoleIndexes.length})`);

  // PR-A: Verify auto-cascade fired on last accept (Monte Carlo + Final Meeting auto-ran)
  console.log('  -> Verifying auto-cascade fired on team-lock...');
  const projAfterCascade = await authReq(proposerToken, `/projects/${PID}`);
  check('plan_status = pending_signoff after team-lock (cascade auto-fired)',
    projAfterCascade.body.data.plan_status === 'pending_signoff',
    `actual: ${projAfterCascade.body.data.plan_status}`);
  check('monte_carlo_result stored on project (auto-computed)',
    !!projAfterCascade.body.data.monte_carlo_result);
  if (projAfterCascade.body.data.monte_carlo_result) {
    const mc = projAfterCascade.body.data.monte_carlo_result;
    check('Monte Carlo NOT hardcoded 72%',
      mc.success_probability !== 0.72,
      `actual: ${(mc.success_probability * 100).toFixed(1)}%`);
    check('Monte Carlo budget percentiles present',
      mc.budget && mc.budget.p50 > 0,
      mc.budget ? `P50=$${Number(mc.budget.p50).toLocaleString()}` : 'missing');
  }
  check('recruitment_closed_at set automatically',
    !!projAfterCascade.body.data.recruitment_closed_at);
  check('recruitment_closed_by = auto_team_locked',
    projAfterCascade.body.data.recruitment_closed_by === 'auto_team_locked',
    `actual: ${projAfterCascade.body.data.recruitment_closed_by}`);

  const meetings = await authReq(proposerToken, `/projects/${PID}/meetings`);
  check('Final Meeting auto-booked',
    meetings.body.success && meetings.body.data.length > 0,
    meetings.body.success ? `${meetings.body.data.length} meeting(s)` : meetings.body.error);

  // -------- PR-B: Amend Plan --------
  console.log('\n=== PR-B: Amend Plan ===');
  const amendedPlan = JSON.parse(JSON.stringify(plan));
  amendedPlan.title = plan.title + ' (Amended)';
  amendedPlan.executive_summary = 'AMENDED: ' + (plan.executive_summary || '').substring(0, 100);
  const amend = await authReq(proposerToken, `/projects/${PID}/amend-plan`, 'POST', {
    plan_json: amendedPlan,
    reason: 'Smoke test amendment: testing signature invalidation and version history'
  });
  check('amend-plan succeeded', amend.body.success, amend.body.success ? `signatures_invalidated=${amend.body.data.signatures_invalidated}` : amend.body.error);
  if (amend.body.success) {
    check('plan_status reset to pending_signoff', amend.body.data.new_status === 'pending_signoff');
    check('re_sign_required flag set', amend.body.data.re_sign_required === true);
    const versions = await authReq(proposerToken, `/projects/${PID}/plan-versions`);
    check('plan-versions list returned', versions.body.success && Array.isArray(versions.body.data));
    check('version history has 1 entry', versions.body.success && versions.body.data.length === 1);
  } else {
    check('plan_status reset (skipped due to amend failure)', false, 'preceding test failed');
  }

  // -------- Sign-off (auto-init workspace) --------
  console.log('\n=== Sign-off + Auto Workspace Init ===');
  const participants = await seq.query(
    `SELECT DISTINCT m.id, m.email FROM hispamind_members m
     WHERE m.id IN (
       SELECT proposer_member_id FROM hispamind_projects WHERE id = :p
       UNION SELECT member_id FROM hispamind_project_members WHERE project_id = :p
     )`,
    { replacements: { p: PID }, type: QueryTypes.SELECT }
  );
  let signed = 0;
  for (const p of participants) {
    try {
      const pwd = p.email === 'mstagg@digit2ai.com' ? 'Palindrome@7' : 'CamaraVirtual2026!';
      const tt = await login({ email: p.email, password: pwd });
      const sgn = await authReq(tt, `/projects/${PID}/signoff`, 'POST', { typed_name: p.email.split('@')[0], agreed: true });
      if (sgn.body.success) signed++;
    } catch (e) { /* skip */ }
  }
  check('all participants re-signed amended plan', signed === participants.length, `${signed}/${participants.length}`);

  const projFinal = await authReq(proposerToken, `/projects/${PID}`);
  check('plan_status = executing (auto-init fired)', projFinal.body.data.plan_status === 'executing',
    `actual: ${projFinal.body.data.plan_status}`);
  check('visibility = participants_only', projFinal.body.data.visibility === 'participants_only');

  // -------- PR-C: Project Owner + Milestone Leads --------
  console.log('\n=== PR-C: Project Owner + Milestone Leads ===');
  const overview = await authReq(proposerToken, `/projects/${PID}/workspace/overview`);
  check('workspace overview accessible', overview.body.success);
  check('viewer.is_owner = true for proposer', overview.body.success && overview.body.data.viewer && overview.body.data.viewer.is_owner === true);
  check('my_tasks counts present', overview.body.success && overview.body.data.my_tasks);

  // Get a milestone to assign leads to
  const milestones = await authReq(proposerToken, `/projects/${PID}/workspace/milestones`);
  check('milestones loaded', milestones.body.success && milestones.body.data.length > 0,
    milestones.body.success ? `${milestones.body.data.length} milestones` : milestones.body.error);

  if (milestones.body.success && milestones.body.data.length > 0) {
    const targetMilestone = milestones.body.data[0];
    const teamMemberIds = participants.filter(p => p.email !== 'mstagg@digit2ai.com').slice(0, 2).map(p => p.id);

    // Owner assigns leads
    const assign = await authReq(proposerToken, `/projects/${PID}/workspace/milestones/${targetMilestone.id}/assign`, 'PUT', {
      lead_member_ids: teamMemberIds
    });
    check('Owner assigned leads to milestone', assign.body.success, assign.body.success ? `${teamMemberIds.length} leads` : assign.body.error);

    // Verify by re-fetching
    const ms2 = await authReq(proposerToken, `/projects/${PID}/workspace/milestones`);
    const updated = ms2.body.data.find(m => m.id === targetMilestone.id);
    check('milestone now has leads array', Array.isArray(updated.leads) && updated.leads.length === teamMemberIds.length,
      `${updated.leads ? updated.leads.length : 0} leads`);

    // Non-owner tries to assign -> should 403
    if (teamMemberIds.length > 0) {
      const nonOwnerEmail = participants.find(p => p.id === teamMemberIds[0]).email;
      try {
        const nt = await login({ email: nonOwnerEmail, password: 'CamaraVirtual2026!' });
        const blocked = await authReq(nt, `/projects/${PID}/workspace/milestones/${targetMilestone.id}/assign`, 'PUT', {
          lead_member_ids: []
        });
        check('non-owner gets 403 on assign', blocked.status === 403, `status=${blocked.status}`);

        // But assigned lead should be able to update status
        if (teamMemberIds.includes(participants.find(p => p.email === nonOwnerEmail).id)) {
          const stat = await authReq(nt, `/projects/${PID}/workspace/milestones/${targetMilestone.id}`, 'PUT', { status: 'in_progress' });
          check('lead can update milestone status', stat.body.success, stat.body.error || '');
        }
      } catch (e) { check('non-owner 403 check', false, e.message); }
    }
  }

  // Cleanup
  try {
    await seq.query(`DELETE FROM hispamind_projects WHERE id = :p`, { replacements: { p: PID } });
    console.log(`\nCleaned up project #${PID}`);
  } catch (e) { console.log('Cleanup warn:', e.message); }

  console.log('\n=== SUMMARY ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`Passed: ${passed} | Failed: ${failed} | Total: ${results.length}`);
  if (failed > 0) {
    console.log('\nFailures:');
    results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.name}: ${r.detail || ''}`));
  }
  await seq.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
