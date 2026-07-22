'use strict';

/**
 * CaseGuard — System Integration Test (SIT).
 * Boots the router against the dev DB and exercises the full flow with NO external
 * keys (heuristic AI fallback). Run from repo root:  node verticals/caseguard/sit.js
 *
 * Covers: login -> seeded FOI case present -> case overview -> create evidence ->
 * analyze (heuristic) -> add timeline/provider/question/escalation -> draft
 * correspondence -> research KB -> next-steps -> tenant isolation -> cleanup.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');

const PORT = 5599;
let server, base;

function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(base + path, {
      method, headers: Object.assign({ 'Content-Type': 'application/json' }, cookie ? { Cookie: cookie } : {}, data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    }, res => {
      let buf = ''; res.on('data', c => buf += c);
      res.on('end', () => { let j = {}; try { j = JSON.parse(buf); } catch (e) {} resolve({ status: res.statusCode, body: j, cookie: (res.headers['set-cookie'] || [])[0] }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, extra || ''); } }

(async function run() {
  const app = express();
  app.use('/caseguard', require('./src/index'));
  server = http.createServer(app);
  await new Promise(r => server.listen(PORT, r));
  base = `http://127.0.0.1:${PORT}`;
  await new Promise(r => setTimeout(r, 4500)); // allow async init (13-table sync + seed)

  console.log('CaseGuard SIT');
  try {
    // Health
    const h = await req('GET', '/caseguard/health');
    ok('health ok', h.status === 200 && h.body.db, JSON.stringify(h.body));

    // Login
    const pw = process.env.CASEGUARD_PASSWORD || 'Palindrome@7';
    const login = await req('POST', '/caseguard/api/v1/auth/login', { email: 'mstagg@digit2ai.com', password: pw });
    ok('login', login.status === 200 && login.body.success, JSON.stringify(login.body));
    const cookie = (login.cookie || '').split(';')[0];
    ok('got cookie', !!cookie);

    // Cases list — seeded FOI case present
    const cases = await req('GET', '/caseguard/api/v1/cases', null, cookie);
    ok('cases list', cases.status === 200 && Array.isArray(cases.body.cases), JSON.stringify(cases.body).slice(0, 200));
    const foi = (cases.body.cases || []).find(c => /Florida Orthopaedic/.test(c.title));
    ok('FOI case seeded', !!foi);
    const cid = foi ? foi.id : (cases.body.cases[0] && cases.body.cases[0].id);

    // Overview with children + KB
    const ov = await req('GET', '/caseguard/api/v1/cases/' + cid, null, cookie);
    ok('overview loads', ov.status === 200 && ov.body.case);
    ok('KB seeded (policies >= 15)', (ov.body.counts.policies || 0) >= 15, 'policies=' + ov.body.counts.policies);
    ok('timeline seeded', (ov.body.counts.timeline || 0) >= 3, 'timeline=' + ov.body.counts.timeline);
    ok('contradictions seeded', (ov.body.counts.contradictions || 0) >= 2);
    ok('questions seeded', (ov.body.counts.questions || 0) >= 4);
    ok('escalations seeded', (ov.body.counts.escalations || 0) >= 4);

    // Create evidence
    const ev = await req('POST', `/caseguard/api/v1/cases/${cid}/evidence`, { label: 'Urgent care visit note', kind: 'medical_record', content: 'Severe wrist pain. No labs ordered. No MRI. No brace. Steroid discussed but not transmitted. No meaningful pain management provided.' }, cookie);
    ok('create evidence', ev.status === 201 && ev.body.item.id, JSON.stringify(ev.body).slice(0, 200));
    const evId = ev.body.item && ev.body.item.id;

    // Analyze (heuristic)
    const an = await req('POST', '/caseguard/api/v1/ai/analyze', { case_id: cid, evidence_id: evId }, cookie);
    ok('analyze evidence', an.status === 201 && an.body.analysis, JSON.stringify(an.body).slice(0, 200));
    ok('analysis flagged concerns', ((an.body.analysis || {}).flags || []).length >= 1);

    // Add a timeline event
    const tl = await req('POST', `/caseguard/api/v1/cases/${cid}/timeline`, { title: 'Follow-up call to FOI', category: 'communication', detail: 'Called (813) 978-9700 to request records.' }, cookie);
    ok('add timeline', tl.status === 201);

    // Add provider
    const pv = await req('POST', `/caseguard/api/v1/cases/${cid}/providers`, { name: 'Imaging Center NP', role: 'Nurse Practitioner', board: 'Board of Nursing' }, cookie);
    ok('add provider', pv.status === 201);

    // Add question + patch it
    const q = await req('POST', `/caseguard/api/v1/cases/${cid}/questions`, { text: 'Was a rescue-medication protocol in place?', priority: 'high' }, cookie);
    ok('add question', q.status === 201);
    const qp = await req('PATCH', '/caseguard/api/v1/questions/' + q.body.item.id, { status: 'answered', answer: 'No — imaging center stocks no medications.' }, cookie);
    ok('patch question', qp.status === 200 && qp.body.item.status === 'answered');

    // Draft correspondence (heuristic template) + save
    const draft = await req('POST', '/caseguard/api/v1/ai/draft', { case_id: cid, kind: 'records_request', target: 'FOI Corporate Compliance', save: true }, cookie);
    ok('draft correspondence', draft.status === 200 && draft.body.body && draft.body.saved, JSON.stringify(draft.body).slice(0, 150));

    // Research KB (keyword match with no key)
    const rs = await req('POST', '/caseguard/api/v1/ai/research', { case_id: cid, question: 'Which authority handles Florida health care facility complaints?' }, cookie);
    ok('research answers', rs.status === 200 && rs.body.answer && /AHCA/i.test(rs.body.answer), (rs.body.answer || '').slice(0, 120));

    // Next steps
    const ns = await req('POST', '/caseguard/api/v1/ai/next-steps', { case_id: cid }, cookie);
    ok('next steps', ns.status === 200 && (ns.body.recommendations || []).length >= 3);

    // Tenant isolation — unauthenticated cannot list
    const noauth = await req('GET', '/caseguard/api/v1/cases');
    ok('tenant gate (401 without cookie)', noauth.status === 401);

    // Cleanup the evidence we created (keep the seeded case intact)
    const del = await req('DELETE', '/caseguard/api/v1/evidence/' + evId, null, cookie);
    ok('delete evidence', del.status === 200);

  } catch (e) {
    fail++; console.log('  ERROR', e.message);
  } finally {
    server.close();
    console.log(`\nCaseGuard SIT: ${pass}/${pass + fail} passed`);
    process.exit(fail ? 1 : 0);
  }
})();
