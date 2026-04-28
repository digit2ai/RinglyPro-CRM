#!/usr/bin/env node
/**
 * Unified Chamber API smoke test.
 *
 * Validates that /:chamber_slug/api/* exposes the full P2B feature set --
 * including all the endpoints that previously only existed under the legacy
 * /chamber/<prefix>/api/* mount. Run against any chamber slug to prove
 * signup-created chambers (cv-101+) work identically to config-driven ones.
 *
 *   SLUG=cv-103 node scripts/smoke-test-unified-chamber.js
 *   HOST=aiagent.ringlypro.com SLUG=cv-1 node scripts/smoke-test-unified-chamber.js
 *
 * Required env: PROPOSER_EMAIL + PROPOSER_PASSWORD for a real account in the
 * target chamber (so we exercise auth + ownership-gated endpoints). If those
 * aren't set the test still validates that every endpoint exists (asserts on
 * status codes, not just success), so it catches 404 regressions cleanly.
 */
const https = require('https');

const HOST = process.env.HOST || 'www.camaravirtual.app';
const SLUG = process.env.SLUG || 'cv-103';
const BASE = `/${SLUG}/api`;
const PROPOSER_EMAIL = process.env.PROPOSER_EMAIL;
const PROPOSER_PASSWORD = process.env.PROPOSER_PASSWORD;

let passed = 0, failed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}${detail ? ` -- ${detail}` : ''}`);
  } else {
    failed++;
    failures.push(label + (detail ? ` -- ${detail}` : ''));
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = https.request({
      hostname: HOST, path: opts.path, method: opts.method || 'GET',
      headers: opts.headers || {}
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, body: json, raw: text });
      });
    });
    r.on('error', reject);
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

async function authReq(token, path, method, body) {
  return req({
    path: BASE + path,
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
  }, body);
}

async function pubReq(path, method, body) {
  return req({
    path: BASE + path,
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json' }
  }, body);
}

async function main() {
  console.log('==========================================================');
  console.log(`  Unified Chamber Smoke Test`);
  console.log(`  Target: https://${HOST}${BASE}`);
  console.log('==========================================================\n');

  // -------- 1) Public endpoints reachable --------
  console.log('[1] Public endpoints');
  const pi = await pubReq('/public/info');
  check('/public/info returns chamber row', pi.status === 200 && pi.body && pi.body.success,
        pi.body && pi.body.data ? `name=${pi.body.data.name}` : `status=${pi.status}`);
  if (!pi.body || !pi.body.success) {
    console.log('\nAborting -- chamber is unreachable. Check the slug.');
    process.exit(1);
  }

  // -------- 2) Endpoint existence (must not 404) --------
  // For unauthenticated requests, every protected endpoint should respond 401,
  // not 404. A 404 here would mean the route was never wired up.
  console.log('\n[2] Endpoint existence (auth-protected routes should 401, not 404)');
  const protectedGets = [
    '/auth/me',
    '/members',
    '/regions',
    '/projects',
    '/projects/invitations/inbox',
    '/exchange/companies',
    '/exchange/rfqs',
    '/exchange/opportunities',
    '/metrics/dashboard',
    '/metrics/hci',
    '/metrics/gini',
    '/metrics/network-value',
    '/payments/plans',
    '/payments/history',
    '/admin/members',
    '/admin/roles',
    '/admin/regions',
    '/admin/system/stats'
  ];
  for (const p of protectedGets) {
    const r = await pubReq(p);
    check(`GET ${p} is wired`, r.status === 401 || r.status === 403, `status=${r.status}`);
  }

  // P2B project lifecycle endpoints -- previously 404 on unified router
  const protectedProjectActions = [
    ['POST', '/projects/draft'],
    ['POST', '/projects/9999999/advance'],
    ['POST', '/projects/9999999/publish'],
    ['POST', '/projects/9999999/close-recruitment'],
    ['POST', '/projects/9999999/reopen-recruitment'],
    ['POST', '/projects/9999999/invite-matches'],
    ['POST', '/projects/9999999/request-join'],
    ['POST', '/projects/9999999/book-final-meeting'],
    ['POST', '/projects/9999999/signoff'],
    ['POST', '/projects/9999999/amend-plan'],
    ['POST', '/projects/9999999/evaluate'],
    ['POST', '/projects/9999999/join'],
    ['GET', '/projects/9999999/invitations'],
    ['GET', '/projects/9999999/meetings'],
    ['GET', '/projects/9999999/signoff-status'],
    ['GET', '/projects/9999999/plan-versions'],
    ['GET', '/projects/9999999/workspace/overview'],
    ['GET', '/projects/9999999/workspace/tasks'],
    ['POST', '/projects/9999999/workspace/tasks'],
    ['GET', '/projects/9999999/workspace/milestones'],
    ['POST', '/projects/9999999/workspace/milestones'],
    ['GET', '/projects/9999999/workspace/messages'],
    ['POST', '/projects/9999999/workspace/messages'],
    ['GET', '/projects/9999999/workspace/documents'],
    ['POST', '/projects/9999999/workspace/initialize-from-plan']
  ];
  for (const [m, p] of protectedProjectActions) {
    const r = await pubReq(p, m, m === 'POST' ? {} : null);
    check(`${m} ${p} is wired`, r.status === 401 || r.status === 403,
          `status=${r.status}` + (r.body && r.body.error ? ` (${r.body.error})` : ''));
  }

  // -------- 3) Optional: full auth + create flow if creds provided --------
  if (PROPOSER_EMAIL && PROPOSER_PASSWORD) {
    console.log('\n[3] Authenticated end-to-end flow');
    const login = await pubReq('/auth/login', 'POST', { email: PROPOSER_EMAIL, password: PROPOSER_PASSWORD });
    check('proposer login', login.status === 200 && login.body && login.body.success,
          login.body && login.body.error);
    if (!login.body || !login.body.success) {
      console.log('Skipping authenticated flow.');
    } else {
      const token = login.body.data.token;

      const me = await authReq(token, '/auth/me');
      check('/auth/me returns member', me.status === 200 && me.body && me.body.success,
            me.body && me.body.data ? `id=${me.body.data.id}` : '');

      const draft = await authReq(token, '/projects/draft', 'POST', {
        vision: 'Smoke-test vision: prove the unified chamber router exposes the full P2B Stage-0 plan-generation pipeline for any chamber slug, including cv-103 which has no /configs JSON.',
        sector: 'tecnologia',
        countries: ['United States'],
        budget_tier: 'small'
      });
      check('POST /projects/draft generates plan',
            draft.status === 201 && draft.body && draft.body.success,
            draft.body && draft.body.data ? `pid=${draft.body.data.project_id}` : (draft.body && draft.body.error));

      if (draft.body && draft.body.success) {
        const pid = draft.body.data.project_id;

        const publish = await authReq(token, `/projects/${pid}/publish`, 'POST');
        check(`POST /projects/${pid}/publish`,
              publish.status === 200 && publish.body && publish.body.success,
              publish.body && publish.body.data
                ? `invitations_created=${publish.body.data.invitations_created}, deadline=${publish.body.data.recruitment_deadline}`
                : (publish.body && publish.body.error));

        const detail = await authReq(token, `/projects/${pid}`);
        check(`GET /projects/${pid} returns hydrated project`,
              detail.status === 200 && detail.body && detail.body.success && detail.body.data && detail.body.data.id === pid);

        const meetings = await authReq(token, `/projects/${pid}/meetings`);
        check(`GET /projects/${pid}/meetings`, meetings.status === 200 && meetings.body && meetings.body.success);

        const inbox = await authReq(token, `/projects/invitations/inbox`);
        check(`GET /projects/invitations/inbox`, inbox.status === 200 && inbox.body && inbox.body.success);

        // workspace endpoints will 403 (not a participant on a fresh draft) but
        // must still return JSON, not 404.
        const ws = await authReq(token, `/projects/${pid}/workspace/overview`);
        check(`GET /projects/${pid}/workspace/overview wired`, ws.status === 200 || ws.status === 403,
              `status=${ws.status}`);
      }
    }
  } else {
    console.log('\n[3] Skipping authenticated flow (set PROPOSER_EMAIL + PROPOSER_PASSWORD to enable)');
  }

  console.log('\n==========================================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
  }
  console.log('==========================================================');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
