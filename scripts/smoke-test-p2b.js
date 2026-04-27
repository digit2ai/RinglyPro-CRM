#!/usr/bin/env node
/**
 * P2B End-to-End Smoke Test
 * Tests Stage 0 -> 1 -> 2 -> 3 with cleanup-tolerant logic.
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
  const r = await req(
    { path: BASE + '/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    creds
  );
  if (!r.body.success) throw new Error(`Login failed for ${creds.email}: ${JSON.stringify(r.body).substring(0,200)}`);
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

  console.log('\n=== STAGE 0: Plan Generation ===');
  const proposerToken = await login(PROPOSER);
  check('proposer login', !!proposerToken);

  console.log('  -> Generating plan with Claude...');
  const draft = await authReq(proposerToken, '/projects/draft', 'POST', {
    vision: 'P2B Smoke Test -- Bilingual AI Voice CRM for Hospitality. Hotels and restaurants get 24/7 bilingual AI receptionists handling reservations, guest service and concierge.\n\nLaunched via CamaraVirtual.app member network: chambers earn revenue share, hotels adopt the platform, Digit2AI provides the AI core. Targets 200 properties year 1.',
    sector: 'hoteleria_turismo',
    countries: ['USA', 'Mexico'],
    budget_tier: 'medium'
  });
  check('plan draft generated', draft.body.success,
    draft.body.success ? `pid=${draft.body.data.project_id}, sections=${Object.keys(draft.body.data.plan_json).length}` : draft.body.error);
  if (!draft.body.success) { console.log('\nABORT'); process.exit(1); }

  const PID = draft.body.data.project_id;
  const plan = draft.body.data.plan_json;
  check('plan has team_roles_required', Array.isArray(plan.team_roles_required), `${plan.team_roles_required.length} roles`);
  check('plan has timeline_milestones', Array.isArray(plan.timeline_milestones), `${plan.timeline_milestones.length} milestones`);

  const publish = await authReq(proposerToken, `/projects/${PID}/publish`, 'POST');
  check('plan published', publish.body.success, publish.body.success ? publish.body.data.plan_status : publish.body.error);

  console.log('\n=== STAGE 1: AI Recruitment ===');
  const inv = await authReq(proposerToken, `/projects/${PID}/invite-matches`, 'POST', { top_n: 5 });
  check('AI invitations created', inv.body.success && inv.body.data.invitations_created > 0,
    inv.body.success ? `${inv.body.data.invitations_created} invites across ${inv.body.data.by_role.length} roles` : inv.body.error);

  // Get all pending invitations across all members and accept them all (so must_have roles get filled)
  const allInvitations = await seq.query(
    `SELECT i.id, i.member_id, i.role_index, i.role_title, m.email
     FROM hispamind_project_invitations i
     JOIN hispamind_members m ON m.id = i.member_id
     WHERE i.project_id = :p AND i.status = 'pending'
     ORDER BY i.role_index, i.match_score DESC NULLS LAST`,
    { replacements: { p: PID }, type: QueryTypes.SELECT }
  );

  // Accept the top 1 candidate for each must_have role
  const acceptedByRole = {};
  let totalAccepted = 0;
  for (const role of plan.team_roles_required) {
    if (!role.must_have) continue;
    const idx = plan.team_roles_required.indexOf(role);
    const candidates = allInvitations.filter(i => i.role_index === idx && !acceptedByRole[i.member_id]);
    if (candidates.length === 0) continue;
    const pick = candidates[0];
    try {
      const tToken = await login({ email: pick.email, password: 'CamaraVirtual2026!' });
      const accept = await authReq(tToken, `/projects/${PID}/invitations/${pick.id}/respond`, 'POST', { action: 'accept' });
      check(`${pick.email} accepted role[${idx}]:${pick.role_title}`,
        accept.body.success,
        accept.body.success ? '' : accept.body.error);
      if (accept.body.success) {
        acceptedByRole[pick.member_id] = true;
        totalAccepted++;
      }
    } catch (e) {
      check(`${pick.email} accept`, false, e.message);
    }
  }
  check('all must_have roles filled', totalAccepted >= plan.team_roles_required.filter(r => r.must_have).length,
    `${totalAccepted} accepted of ${plan.team_roles_required.filter(r => r.must_have).length} must_have`);

  // Verify status flipped to fully_staffed
  const proj1 = await authReq(proposerToken, `/projects/${PID}`);
  check('plan_status now fully_staffed', proj1.body.data.plan_status === 'fully_staffed', `actual: ${proj1.body.data.plan_status}`);

  console.log('\n=== STAGE 2: Final Meeting + Sign-off ===');
  const book = await authReq(proposerToken, `/projects/${PID}/book-final-meeting`, 'POST', {});
  check('Final Meeting booked', book.body.success, book.body.success ? `mid=${book.body.data.meeting.id}, attendees=${book.body.data.attendee_count}` : book.body.error);

  // Get list of all participants (proposer + accepted members)
  const participants = await seq.query(
    `SELECT DISTINCT m.id, m.email FROM hispamind_members m
     WHERE m.id IN (
       SELECT proposer_member_id FROM hispamind_projects WHERE id = :p
       UNION SELECT member_id FROM hispamind_project_members WHERE project_id = :p
     )`,
    { replacements: { p: PID }, type: QueryTypes.SELECT }
  );

  // Sign off as each participant
  let signedCount = 0;
  for (const p of participants) {
    try {
      const pwd = p.email === 'mstagg@digit2ai.com' ? 'Palindrome@7' : 'CamaraVirtual2026!';
      const tt = await login({ email: p.email, password: pwd });
      const sgn = await authReq(tt, `/projects/${PID}/signoff`, 'POST', { typed_name: p.email.split('@')[0], agreed: true });
      check(`${p.email} signed`, sgn.body.success, sgn.body.success ? `${sgn.body.data.signed_count}/${sgn.body.data.total_participants}` : sgn.body.error);
      if (sgn.body.success) signedCount++;
    } catch (e) {
      check(`${p.email} signed`, false, e.message);
    }
  }
  check('all participants signed', signedCount === participants.length, `${signedCount}/${participants.length}`);

  const proj2 = await authReq(proposerToken, `/projects/${PID}`);
  check('plan_status now signed_off', proj2.body.data.plan_status === 'signed_off', `actual: ${proj2.body.data.plan_status}`);
  check('visibility now participants_only', proj2.body.data.visibility === 'participants_only', `actual: ${proj2.body.data.visibility}`);

  console.log('\n=== STAGE 3: Private Workspace ===');
  const init = await authReq(proposerToken, `/projects/${PID}/workspace/initialize-from-plan`, 'POST');
  check('workspace initialized', init.body.success,
    init.body.success ? `${init.body.data.milestones} milestones + ${init.body.data.tasks} tasks` : init.body.error);

  const overview = await authReq(proposerToken, `/projects/${PID}/workspace/overview`);
  check('workspace overview', overview.body.success,
    overview.body.success ? `tasks=${overview.body.data.tasks.total}, milestones=${overview.body.data.milestones.total}` : overview.body.error);

  const newTask = await authReq(proposerToken, `/projects/${PID}/workspace/tasks`, 'POST', {
    title: 'Smoke Test Task', description: 'automated smoke test', priority: 'high'
  });
  check('task created', newTask.body.success, newTask.body.success ? `tid=${newTask.body.data.id}` : newTask.body.error);

  if (newTask.body.success) {
    const upd = await authReq(proposerToken, `/projects/${PID}/workspace/tasks/${newTask.body.data.id}`, 'PUT', { status: 'doing' });
    check('task status update', upd.body.success);
  }

  const msg = await authReq(proposerToken, `/projects/${PID}/workspace/messages`, 'POST', { body: 'Smoke test message from automated test.' });
  check('message posted', msg.body.success);

  const doc = await authReq(proposerToken, `/projects/${PID}/workspace/documents`, 'POST', {
    title: 'Smoke Test Document', file_url: 'https://example.com/smoke-test.pdf', doc_type: 'other'
  });
  check('document added', doc.body.success);

  // Non-participant gets 403
  try {
    const otherTester = await login({ email: 'lcastro@cocacola.com.pe', password: 'CamaraVirtual2026!' });
    const blocked = await authReq(otherTester, `/projects/${PID}/workspace/overview`);
    check('non-participant gets 403', blocked.status === 403, `status=${blocked.status}`);

    const stub = await authReq(otherTester, `/projects/${PID}`);
    check('non-participant sees stub', stub.body.success && stub.body.data.is_stub === true,
      `is_stub=${stub.body.data.is_stub}, plan_json=${stub.body.data.plan_json ? 'leaked' : 'redacted'}`);
  } catch (e) {
    check('non-participant 403/stub check', false, e.message);
  }

  // Cleanup smoke test project (keep DB tidy)
  try {
    await seq.query(`DELETE FROM hispamind_projects WHERE id = :p`, { replacements: { p: PID } });
    console.log(`\nCleaned up project #${PID}`);
  } catch(e) { console.log('Cleanup failed:', e.message); }

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
