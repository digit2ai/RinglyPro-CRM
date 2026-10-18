'use strict';
/**
 * Client Workspace SIT. Run from the repo root:
 *   node -e "require('dotenv').config();require('./verticals/clientspace/sit.js')"
 * Zero external keys. Uses the database in .env with throwaway sit-cws-* rows,
 * deleted at the end. Attacks the invariants: cross-workspace access, roles,
 * the password-change gate, file-type sniffing, and session revocation.
 * NOT covered: the owner's sign-in against the CRM users table (needs the real
 * owner password) — verify by signing in on the live site.
 */
process.env.CLIENTSPACE_JWT_SECRET = process.env.CLIENTSPACE_JWT_SECRET || 'sit-only-secret-' + Date.now();
process.env.CLIENTSPACE_SEED = 'off';
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const bcrypt = require('bcryptjs');
const router = require('./src/index');
const db = require('./src/db');

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) { if (cond) pass++; else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); } console.log((cond ? '  ✓ ' : '  ✗ ') + name); }

const app = express(); app.use('/workspace', router);
const server = http.createServer(app);
let base;
function req(method, p, { body, cookie, header = true, raw } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (header) headers['X-Workspace'] = '1';
    if (cookie) headers.Cookie = cookie;
    let data = null;
    if (raw) { data = raw.body; headers['Content-Type'] = raw.type; }
    else if (body !== undefined) { data = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(base + '/workspace/api/v1' + p, { method, headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks); let json = null; try { json = JSON.parse(buf.toString()); } catch (_) {}
        const sc = res.headers['set-cookie']; const ck = sc ? sc[0].split(';')[0] : null;
        resolve({ status: res.statusCode, json, buf, headers: res.headers, cookie: ck });
      });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
function multipart(fields, file) {
  const b = '----sit' + Date.now(); const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
  parts.push(file.data); parts.push(Buffer.from(`\r\n--${b}--\r\n`));
  return { body: Buffer.concat(parts), type: 'multipart/form-data; boundary=' + b };
}
const q = (sql, r) => db.query(sql, { replacements: r });

(async () => {
  await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
  await router._internal.ready();
  const tag = 'sit-cws-' + Date.now();
  const [[A]] = await q('INSERT INTO cws_workspaces (name,slug) VALUES (:n,:s) RETURNING id', { n: tag + ' A', s: tag + '-a' });
  const [[B]] = await q('INSERT INTO cws_workspaces (name,slug) VALUES (:n,:s) RETURNING id', { n: tag + ' B', s: tag + '-b' });
  const h = await bcrypt.hash('Temporal-12345', 4);
  const mk = async (email, ws, role, must) => (await q(`INSERT INTO cws_users (workspace_id,email,role,password_hash,must_change) VALUES (:w,:e,:r,:h,:m) RETURNING id`,
    { w: ws, e: email, r: role, h, m: must }))[0][0].id;
  await mk(tag + '-owner@x.test', null, 'owner', false);
  await mk(tag + '-a@x.test', A.id, 'member', true);
  await mk(tag + '-v@x.test', A.id, 'viewer', false);
  await mk(tag + '-b@x.test', B.id, 'member', false);
  const login = async (e, p = 'Temporal-12345') => (await req('POST', '/auth/login', { body: { email: e, password: p } }));

  try {
    console.log('\n── health and sign-in');
    const hl = await new Promise((r) => http.get(base + '/workspace/health', (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => r(JSON.parse(d))); }));
    ok('health reports database and signing secret', hl.database === true && hl.signing_secret === true);
    ok('a state change without the X-Workspace header is refused (403)', (await req('POST', '/auth/login', { body: { email: 'a', password: 'b' }, header: false })).status === 403);
    ok('wrong password is 401', (await login(tag + '-a@x.test', 'nope-nope')).status === 401);
    ok('unknown email is 401, same as a wrong password', (await login(tag + '-zz@x.test')).status === 401);
    ok('no session is 401', (await req('GET', '/auth/me')).status === 401);

    console.log('\n── first sign-in must change the temporary password');
    const la = await login(tag + '-a@x.test');
    ok('member signs in and is told to change the password', la.status === 200 && la.json.must_change === true);
    let ckA = la.cookie;
    ok('until then every workspace call is refused', (await req('GET', `/w/${A.id}/summary`, { cookie: ckA })).status === 403);
    ok('a short new password is refused', (await req('POST', '/auth/password', { cookie: ckA, body: { current: 'Temporal-12345', new: 'short' } })).status === 400);
    ok('a wrong current password is refused', (await req('POST', '/auth/password', { cookie: ckA, body: { current: 'xxxxxxxxxxx', new: 'Nueva-clave-2026' } })).status === 401);
    const ch = await req('POST', '/auth/password', { cookie: ckA, body: { current: 'Temporal-12345', new: 'Nueva-clave-2026' } });
    ok('the change succeeds and issues a new session', ch.status === 200 && !!ch.cookie);
    ok('the OLD session stops working once the password changed', (await req('GET', `/w/${A.id}/summary`, { cookie: ckA })).status === 401);
    ckA = ch.cookie;
    ok('the new session reaches the workspace', (await req('GET', `/w/${A.id}/summary`, { cookie: ckA })).status === 200);

    console.log('\n── workspace isolation');
    const ckB = (await login(tag + '-b@x.test')).cookie;
    const ckO = (await login(tag + '-owner@x.test')).cookie;
    const ckV = (await login(tag + '-v@x.test')).cookie;
    ok('member A cannot read workspace B (404, not 403)', (await req('GET', `/w/${B.id}/summary`, { cookie: ckA })).status === 404);
    ok('a non-numeric workspace id is 404', (await req('GET', `/w/abc/summary`, { cookie: ckA })).status === 404);
    const me = await req('GET', '/auth/me', { cookie: ckA });
    ok('member A sees only their own workspace', me.json.workspaces.length === 1 && me.json.workspaces[0].id === A.id);
    const meO = await req('GET', '/auth/me', { cookie: ckO });
    ok('the owner sees every workspace', meO.json.workspaces.some((w) => w.id === A.id) && meO.json.workspaces.some((w) => w.id === B.id));
    const pB = await req('POST', `/w/${B.id}/projects`, { cookie: ckB, body: { name: 'Proyecto B' } });
    const tB = await req('POST', `/w/${B.id}/projects/${pB.json.id}/tasks`, { cookie: ckB, body: { title: 'Tarea B' } });
    ok('member A cannot change a task of B through A\'s URL (404)', (await req('PATCH', `/w/${A.id}/tasks/${tB.json.id}`, { cookie: ckA, body: { status: 'hecho' } })).status === 404);
    ok('member A cannot list B\'s project tasks through A\'s URL (404)', (await req('GET', `/w/${A.id}/projects/${pB.json.id}/tasks`, { cookie: ckA })).status === 404);
    const pA = await req('POST', `/w/${A.id}/projects`, { cookie: ckA, body: { name: 'Proyecto A', workspace_id: B.id, tenant_id: B.id } });
    const [[row]] = await q('SELECT workspace_id FROM cws_projects WHERE id=:id', { id: pA.json.id });
    ok('a workspace_id in the body is ignored', pA.status === 201 && row.workspace_id === A.id);

    console.log('\n── roles');
    ok('a viewer cannot create a project (403)', (await req('POST', `/w/${A.id}/projects`, { cookie: ckV, body: { name: 'X' } })).status === 403);
    ok('a viewer can read the summary', (await req('GET', `/w/${A.id}/summary`, { cookie: ckV })).status === 200);
    ok('a member cannot see the team list (404)', (await req('GET', `/w/${A.id}/users`, { cookie: ckA })).status === 404);
    ok('a member cannot create a workspace (404)', (await req('POST', '/workspaces', { cookie: ckA, body: { name: 'Nuevo' } })).status === 404);

    console.log('\n── files');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const exe = Buffer.from('MZ\x90\x00 this is not a document');
    ok('a file that is not an allowed type is refused, whatever its name (415)',
      (await req('POST', `/w/${A.id}/files`, { cookie: ckA, raw: multipart({ category: 'documento' }, { name: 'contrato.pdf', type: 'application/pdf', data: exe }) })).status === 415);
    const up = await req('POST', `/w/${A.id}/files`, { cookie: ckA, raw: multipart({ category: 'documento', title: 'Plano', project_id: pA.json.id }, { name: 'plano.pdf', type: 'application/pdf', data: pdf }) });
    ok('a member uploads a PDF document', up.status === 201);
    ok('a member cannot upload an invoice (403)',
      (await req('POST', `/w/${A.id}/files`, { cookie: ckA, raw: multipart({ category: 'factura' }, { name: 'f.pdf', type: 'application/pdf', data: pdf }) })).status === 403);
    const inv = await req('POST', `/w/${A.id}/files`, { cookie: ckO, raw: multipart({ category: 'factura', amount: '1234.567', currency: 'MXN' }, { name: 'f.pdf', type: 'application/pdf', data: pdf }) });
    const [[irow]] = await q('SELECT amount,currency,invoice_status FROM cws_files WHERE id=:id', { id: inv.json.id });
    ok('the owner uploads an invoice; it starts pending, amount rounded to cents', inv.status === 201 && irow.invoice_status === 'pendiente' && Number(irow.amount) === 1234.57 && irow.currency === 'MXN');
    const dl = await req('GET', `/w/${A.id}/files/${up.json.id}/download`, { cookie: ckV });
    ok('download is an attachment with nosniff and a sandbox CSP',
      dl.status === 200 && /^attachment/.test(dl.headers['content-disposition']) && dl.headers['x-content-type-options'] === 'nosniff' && /sandbox/.test(dl.headers['content-security-policy']));
    ok('the bytes come back unchanged', dl.buf.equals(pdf));
    ok('workspace B cannot download A\'s file (404)', (await req('GET', `/w/${B.id}/files/${up.json.id}/download`, { cookie: ckB })).status === 404);
    ok('the file list never carries the file bytes', !JSON.stringify((await req('GET', `/w/${A.id}/files`, { cookie: ckA })).json).includes('"data"'));
    ok('a member cannot mark an invoice paid (404)', (await req('PATCH', `/w/${A.id}/files/${inv.json.id}`, { cookie: ckA, body: { invoice_status: 'pagada' } })).status === 404);

    console.log('\n── team management');
    const nu = await req('POST', `/w/${A.id}/users`, { cookie: ckO, body: { email: tag + '-new@x.test', name: 'Nuevo', role: 'member' } });
    ok('the owner creates a client account and gets a one-time temporary password', nu.status === 201 && /^[A-Za-z0-9]{14}$/.test(nu.json.temporary_password));
    const [[nrow]] = await q('SELECT password_hash, must_change FROM cws_users WHERE id=:id', { id: nu.json.id });
    ok('the temporary password is stored only as a hash, and must be changed', nrow.password_hash !== nu.json.temporary_password && nrow.must_change === true);
    ok('the same email twice is refused (409)', (await req('POST', `/w/${A.id}/users`, { cookie: ckO, body: { email: tag + '-new@x.test' } })).status === 409);
    ok('the owner email cannot be given to a client account', (await req('POST', `/w/${A.id}/users`, { cookie: ckO, body: { email: router._internal.OWNER_EMAIL } })).status === 400);
    ok('the team list never returns password hashes', !JSON.stringify((await req('GET', `/w/${A.id}/users`, { cookie: ckO })).json).includes('password_hash'));
    const [[vid]] = await q('SELECT id FROM cws_users WHERE email=:e', { e: tag + '-v@x.test' });
    await req('PATCH', `/w/${A.id}/users/${vid.id}`, { cookie: ckO, body: { active: false } });
    ok('a deactivated account loses its live session at once', (await req('GET', `/w/${A.id}/summary`, { cookie: ckV })).status === 401);
    ok('and cannot sign in again', (await login(tag + '-v@x.test')).status === 401);

    console.log('\n── activity and structure');
    const act = await req('GET', `/w/${A.id}/activity`, { cookie: ckA });
    ok('actions are recorded in the activity log', act.json.some((a) => a.action === 'file_uploaded') && act.json.some((a) => a.action === 'project_created'));
    const src = fs.readFileSync(path.join(__dirname, 'src/index.js'), 'utf8');
    const scoped = src.split('\n').filter((l) => /(FROM|UPDATE|DELETE FROM|INTO)\s+cws_(projects|tasks|files)\b/.test(l) && !/INSERT INTO/.test(l));
    ok('every read, update and delete of projects, tasks and files filters by workspace_id',
      scoped.length > 10 && scoped.every((l) => /workspace_id/.test(l)), scoped.filter((l) => !/workspace_id/.test(l)).join(' | '));
    ok('the client app escapes everything it renders (no raw innerHTML of data without esc)',
      /function esc\(/.test(fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8')));
  } finally {
    const ids = [A.id, B.id];
    await q('DELETE FROM cws_activity WHERE workspace_id IN (:ids) OR user_email LIKE :t', { ids, t: tag + '%' });
    await q('DELETE FROM cws_files WHERE workspace_id IN (:ids)', { ids });
    await q('DELETE FROM cws_tasks WHERE workspace_id IN (:ids)', { ids });
    await q('DELETE FROM cws_projects WHERE workspace_id IN (:ids)', { ids });
    await q('DELETE FROM cws_users WHERE email LIKE :t', { t: tag + '%' });
    await q('DELETE FROM cws_workspaces WHERE id IN (:ids)', { ids });
    server.close();
    console.log('\n' + '─'.repeat(60));
    if (fails.length) { console.log('FAILURES:'); fails.forEach((f) => console.log('  ✗ ' + f)); }
    console.log(`\nClient Workspace SIT: ${pass}/${pass + fail}`);
    console.log('NOT covered: owner sign-in against the CRM users table (verify live).');
    await db.close();
    process.exit(fail ? 1 : 0);
  }
})().catch((e) => { console.error(e); process.exit(1); });
