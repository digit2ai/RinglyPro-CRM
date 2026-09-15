'use strict';

/**
 * BuyersLine console notes, documents and knowledge base SIT.
 * Run from the repo root: node verticals/incentiva/sit-console.js
 *
 * The local .env DATABASE_URL is the PRODUCTION database. Every row this suite writes lives
 * under the throwaway tenants 990913 / 990914 and is deleted before and after the run. The
 * send loop, the site gate, email and the model are all switched off before anything loads.
 *
 * It attacks the invariants, not the happy path: a cross-tenant read, an agent reading a lead
 * that is not theirs, a disguised or oversized upload, a download that could render as a page,
 * a javascript: link, an unauthenticated call, and an upload path that writes to disk.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
delete process.env.ANTHROPIC_API_KEY;
const SIT_TENANT = 990913, OTHER_TENANT = 990914;
Object.assign(process.env, {
  INCENTIVA_TENANT_ID: String(SIT_TENANT), INCENTIVA_GEOCODE: 'off',
  INCENTIVA_OWNER_EMAIL: 'sit-owner@example.test', INCENTIVA_OWNER_PASSWORD: 'sit-owner-password-2026x',
  INCENTIVA_AGENT_EMAIL: 'sit-agent@example.test', INCENTIVA_AGENT_PASSWORD: 'sit-agent-password-2026x', INCENTIVA_AGENT_NAME: 'Sit Agent',
  INCENTIVA_AGENT_LICENSE: 'SL0000000', INCENTIVA_BROKERAGE_NAME: 'SIT Brokerage LLC', INCENTIVA_BROKERAGE_LICENSE: 'BK0000000'
});
if (!process.env.INCENTIVA_JWT_SECRET && !process.env.JWT_SECRET) process.env.INCENTIVA_JWT_SECRET = 'sit-console-secret-' + Date.now();
['INCENTIVA_REPORT_REVIEW', 'INCENTIVA_MONITOR_GO', 'INCENTIVA_SEED_DEMO', 'RENTCAST_API_KEY', 'SENDGRID_API_KEY', 'INCENTIVA_EMAIL',
  'INCENTIVA_SMS_MESSAGING_SERVICE_SID', 'INCENTIVA_SMS_FROM', 'INCENTIVA_AGENT_PHONE'].forEach((k) => delete process.env[k]);
process.env.INCENTIVA_RATE_FEED = 'off';
process.env.INCENTIVA_AGENTS = 'off'; // never run the send loop from a test process
process.env.INCENTIVA_SITE_GATE = 'off';
process.env.INCENTIVA_SMS = 'off';
process.env.INCENTIVA_RESEARCH = 'off';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');

let pass = 0, fail = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; failures.push(name + ': ' + e.message); console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'expected equal') + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function walk(dir, out = []) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; }
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1'); }

// Minimal valid-looking payloads, identified by their leading bytes.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from('IHDR-sit-console-png')]);
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.from('JFIF-sit')]);
const GIF = Buffer.from('GIF89a-sit-console');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 sit')]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('....[Content_Types].xml....word/document.xml....')]);
const XLSX = Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('....[Content_Types].xml....xl/workbook.xml....')]);
const CFB_MAGIC = Buffer.concat([Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), Buffer.from('cfb-sit')]);
const HTML = Buffer.from('<!doctype html><html><body><script>alert(document.cookie)</script></body></html>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');

(async () => {
  const kb = require('./src/services/console-kb');

  console.log('\nA. No upload ever touches the disk');
  await t('console-kb.js and agent.js contain no filesystem write', () => {
    for (const f of [path.join(SRC, 'services', 'console-kb.js'), path.join(SRC, 'routes', 'agent.js')]) {
      const code = stripComments(read(f));
      assert(!/\bfs\b|require\(['"](fs|fs\/promises|node:fs)['"]\)/.test(code), path.basename(f) + ' requires fs');
      assert(!/writeFile|createWriteStream|appendFile|diskStorage|\bdest\s*:/.test(code), path.basename(f) + ' writes to disk');
    }
  });
  await t('no file in src/ configures multer to store uploads on disk', () => {
    for (const f of walk(SRC).filter((p) => p.endsWith('.js'))) {
      const code = stripComments(read(f));
      if (!/multer/.test(code)) continue;
      assert(!/diskStorage|multer\(\s*\{[^}]*\bdest\b/.test(code), path.relative(ROOT, f) + ' stores uploads on disk');
      assert(/memoryStorage/.test(code), path.relative(ROOT, f) + ' uses multer without memoryStorage');
    }
  });
  await t('the migration is idempotent, prefixed, tenant-scoped, and leaves the SME nca_kb table alone', () => {
    const sql = read(path.join(ROOT, 'migrations', '20260915_console_notes_kb.sql'));
    const body = sql.replace(/--.*$/gm, '');
    const creates = body.match(/CREATE\s+TABLE[^(]*/gi) || [];
    eq(creates.length, 4, 'four tables');
    creates.forEach((c) => assert(/IF NOT EXISTS\s+nca_/i.test(c), 'not idempotent or not prefixed: ' + c));
    const idx = body.match(/CREATE\s+(UNIQUE\s+)?INDEX\s+\S+\s+\S+\s+\S+/gi) || [];
    eq(idx.length, 4, 'four indexes');
    idx.forEach((c) => assert(/INDEX\s+IF NOT EXISTS/i.test(c), 'index not idempotent: ' + c));
    assert(!/\bnca_kb\b(?!_)/.test(body), 'the SME nca_kb table must not be touched');
    assert(!/DROP\s|TRUNCATE|DELETE\s+FROM/i.test(body), 'destructive statement in a boot migration');
    for (const tb of ['nca_lead_notes', 'nca_kb_entries', 'nca_kb_links', 'nca_files']) {
      const block = body.slice(body.indexOf('IF NOT EXISTS ' + tb));
      assert(/tenant_id INTEGER NOT NULL/.test(block.slice(0, block.indexOf(');'))), tb + ' lacks tenant_id NOT NULL');
      assert(new RegExp('ON ' + tb + ' \\(tenant_id').test(body), tb + ' lacks a tenant index');
    }
    assert(/data BYTEA NOT NULL/.test(body), 'file bytes must live in Postgres');
  });

  console.log('\nB. Upload inspection (pure)');
  const up = (name, buffer, mimetype = 'application/octet-stream') => kb.inspectUpload({ originalname: name, buffer, mimetype });
  const status = (fn) => { try { fn(); return 200; } catch (e) { return e.status || 500; } };
  await t('every allowed type is accepted by its bytes and stored under its canonical content type', () => {
    const cases = [['a.pdf', PDF, 'application/pdf'], ['a.png', PNG, 'image/png'], ['a.jpg', JPG, 'image/jpeg'], ['a.JPEG', JPG, 'image/jpeg'], ['a.gif', GIF, 'image/gif'],
      ['a.webp', WEBP, 'image/webp'], ['a.txt', Buffer.from('plain notes'), 'text/plain; charset=utf-8'], ['a.csv', Buffer.from('a,b\n1,2\n'), 'text/csv; charset=utf-8'],
      ['a.doc', CFB_MAGIC, 'application/msword'], ['a.xls', CFB_MAGIC, 'application/vnd.ms-excel'],
      ['a.docx', DOCX, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['a.xlsx', XLSX, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']];
    for (const [n, b, mime] of cases) eq(up(n, b).content_type, mime, n);
    eq(kb.ALLOWED_EXTENSIONS.slice().sort().join(','), 'csv,doc,docx,gif,jpeg,jpg,pdf,png,txt,webp,xls,xlsx', 'allow-list drifted');
  });
  await t('html, svg, executables, no extension and disguised content are refused (415)', () => {
    eq(status(() => up('page.html', HTML)), 415, 'html');
    eq(status(() => up('page.htm', HTML)), 415, 'htm');
    eq(status(() => up('logo.svg', SVG)), 415, 'svg');
    eq(status(() => up('run.exe', Buffer.from('MZ....'))), 415, 'exe');
    eq(status(() => up('noextension', PDF)), 415, 'no extension');
    eq(status(() => up('image.png', HTML)), 415, 'html bytes named .png');
    eq(status(() => up('doc.pdf', PNG)), 415, 'png bytes named .pdf');
    eq(status(() => up('notes.txt', HTML)), 415, 'markup in a .txt');
    eq(status(() => up('notes.txt', Buffer.from([0x41, 0x00, 0x42]))), 415, 'binary in a .txt');
    eq(status(() => up('sheet.xlsx', DOCX)), 415, 'a Word zip named .xlsx');
    eq(status(() => up('real.png', PNG, 'text/html')), 415, 'a client-declared text/html');
    eq(status(() => up('real.png', PNG, 'image/svg+xml')), 415, 'a client-declared svg');
    eq(status(() => up('empty.pdf', Buffer.alloc(0))), 400, 'empty file');
  });
  await t('the 10 MB cap is enforced by the service as well as by the upload parser', () => {
    eq(kb.MAX_FILE_BYTES, 10 * 1024 * 1024);
    const big = Buffer.alloc(kb.MAX_FILE_BYTES + 1); PDF.copy(big);
    eq(status(() => up('big.pdf', big)), 413);
  });
  await t('filenames lose path separators, control characters and quotes, and are length-capped', () => {
    const a = kb.sanitizeFilename('../../etc/"pass\'wd"\r\n;<x>.PDF').filename;
    assert(!/[\\/"'\r\n;<>]/.test(a), a); assert(/\.pdf$/.test(a), a);
    eq(kb.sanitizeFilename('C:\\Users\\me\\Report 2026.pdf').filename, 'Report 2026.pdf');
    eq(kb.sanitizeFilename('...hidden.txt').filename, 'hidden.txt');
    assert(kb.sanitizeFilename('x'.repeat(900) + '.pdf').filename.length <= 160, 'cap');
    const cd = kb.contentDisposition('Informe de compraventa \u00f1.pdf');
    assert(/^attachment; filename="[\x20-\x7E]+"; filename\*=UTF-8''/.test(cd), cd);
  });
  await t('links must be http(s): javascript:, data:, ftp: and embedded credentials are refused', () => {
    eq(kb.cleanUrl(' https://www.hillsboroughcounty.org/en/residents '), 'https://www.hillsboroughcounty.org/en/residents');
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'ftp://example.test/a', 'vbscript:x', '//example.test/a',
      'example.test', 'https://user:pw@example.test/', 'https://exa mple.test/', 'java\tscript:alert(1)']) {
      eq(status(() => kb.cleanUrl(bad)), 400, 'accepted ' + JSON.stringify(bad));
    }
  });

  console.log('\nC. Console UI wiring (static)');
  await t('the console has a knowledge base tab and a notes and documents panel on the lead', () => {
    const js = read(path.join(ROOT, 'public', 'admin.js'));
    assert(/kb: viewKb/.test(js) && /data-nav="kb"|dataset\.nav = 'kb'/.test(js), 'knowledge base view not routed');
    assert(/leadNotesCard/.test(js) && /leadFilesCard/.test(js), 'lead panel missing');
    assert(/\/agent\/files\//.test(js) && /\/agent\/kb/.test(js), 'console does not call the new routes');
    assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(js + read(path.join(SRC, 'services', 'console-kb.js'))), 'emoji in shipped copy');
  });

  // ── Database sections ────────────────────────────────────────────────────
  const db = require('./src/db');
  if (!db.configured) {
    fail++; failures.push('no DATABASE_URL: the database sections were NOT exercised');
  } else {
    const TABLES = ['nca_files', 'nca_kb_links', 'nca_kb_entries', 'nca_lead_notes', 'nca_leads', 'nca_audit_log', 'nca_users', 'nca_brokerages', 'nca_markets'];
    const cleanup = async () => { for (const tb of TABLES) await db.exec(`DELETE FROM ${tb} WHERE tenant_id IN (:a, :b)`, { a: SIT_TENANT, b: OTHER_TENANT }); };
    let server;
    try {
      await db.ensureSchema();
      await cleanup();
      const express = require('express');
      // Requiring src/index also builds its default router; with the env above it is scoped to the SIT tenant,
      // the scheduler and agents are off and nothing is seeded. The routers under test are built with boot:false.
      const { createApp } = require('./src/index');
      const auth = require('./src/services/auth');
      const app = express();
      app.use('/a', createApp({ boot: false, tenantId: SIT_TENANT }));
      app.use('/b', createApp({ boot: false, tenantId: OTHER_TENANT }));
      server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
      const HOST = `http://127.0.0.1:${server.address().port}`;
      await new Promise((r) => setTimeout(r, 1500)); // let the default router's account sync settle
      await auth.ensureAccounts(SIT_TENANT);
      await auth.ensureAccounts(OTHER_TENANT);
      const agent2 = await auth.upsertAccount(SIT_TENANT, { email: 'sit-agent2@example.test', name: 'Sit Agent Two', password: 'sit-agent2-password-2026x', role: 'agent', license_no: 'SL0000001' });

      const jar = {};
      async function call(method, p, body, who, raw) {
        const headers = {};
        if (who && jar[who]) headers.Cookie = jar[who];
        let payload;
        if (body instanceof FormData) payload = body;
        else if (body !== undefined && body !== null) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
        let r;
        try { r = await fetch(HOST + p, { method, headers, body: payload }); }
        catch (e) { return { status: 0, error: e, headers: new Headers(), data: null }; }
        const sc = r.headers.get('set-cookie');
        if (who && sc && /incentiva_token=/.test(sc)) jar[who] = sc.split(';')[0];
        if (raw) return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
        let data = null; const txt = await r.text(); try { data = JSON.parse(txt); } catch (e) { data = txt; }
        return { status: r.status, headers: r.headers, data };
      }
      const form = (name, buf, type = 'application/octet-stream') => { const fd = new FormData(); fd.append('file', new Blob([buf], { type }), name); return fd; };
      const A = '/a/api/v1', B = '/b/api/v1';

      console.log('\nD. Sign-in and tenancy');
      await t('owner, agent and a second agent sign in; the other tenant has its own owner', async () => {
        eq((await call('POST', A + '/auth/login', { email: 'sit-owner@example.test', password: process.env.INCENTIVA_OWNER_PASSWORD }, 'admin')).data.user.role, 'admin');
        eq((await call('POST', A + '/auth/login', { email: 'sit-agent@example.test', password: process.env.INCENTIVA_AGENT_PASSWORD }, 'agent')).data.user.role, 'agent');
        eq((await call('POST', A + '/auth/login', { email: 'sit-agent2@example.test', password: 'sit-agent2-password-2026x' }, 'agent2')).status, 200);
        eq((await call('POST', B + '/auth/login', { email: 'sit-owner@example.test', password: process.env.INCENTIVA_OWNER_PASSWORD }, 'adminB')).status, 200);
      });
      const me = async (who, base) => (await call('GET', base + '/auth/me', null, who)).data.user;
      const adminUser = await me('admin', A), agentUser = await me('agent', A);

      const newLead = async (tenant, assigned) => (await db.exec(`INSERT INTO nca_leads (tenant_id, token, first_name, max_price, move_timeline, financing_type, has_agent, referral_consent, assigned_agent_id)
        VALUES (:t, :tok, 'Sit Console', 400000, '0_3m', 'needs_lender', 'no', true, :a) RETURNING id`, { t: tenant, tok: 'sitc_' + crypto.randomBytes(10).toString('hex'), a: assigned }))[0].id;
      const leadMine = await newLead(SIT_TENANT, agentUser.id);
      const leadNobody = await newLead(SIT_TENANT, null);
      const leadOther = await newLead(OTHER_TENANT, null);
      const otherNote = await kb.addLeadNote(OTHER_TENANT, leadOther, null, 'Other tenant private note');
      const otherFile = await kb.addFile(OTHER_TENANT, 'lead', leadOther, null, { originalname: 'other.pdf', buffer: PDF, mimetype: 'application/pdf' });
      const otherKb = await kb.createKb(OTHER_TENANT, null, { title: 'Other tenant policy', body: 'Other tenant research', links: [{ url: 'https://example.test/other' }] });
      const otherKbFile = await kb.addFile(OTHER_TENANT, 'kb', otherKb.id, null, { originalname: 'other-kb.pdf', buffer: PDF, mimetype: 'application/pdf' });

      await t('unauthenticated requests are refused with 401 on every new route', async () => {
        const probes = [['GET', `/leads/${leadMine}/notes`], ['POST', `/leads/${leadMine}/notes`, { body: 'x' }], ['PATCH', `/leads/${leadMine}/notes/1`, { body: 'x' }], ['DELETE', `/leads/${leadMine}/notes/1`],
          ['GET', `/leads/${leadMine}/files`], ['POST', `/leads/${leadMine}/files`, form('a.pdf', PDF)], ['GET', '/files/1'], ['DELETE', '/files/1'],
          ['GET', '/kb'], ['POST', '/kb', { title: 'x' }], ['GET', '/kb/1'], ['PATCH', '/kb/1', { title: 'x' }], ['DELETE', '/kb/1'],
          ['POST', '/kb/1/links', { url: 'https://example.test' }], ['DELETE', '/kb/1/links/1'], ['POST', '/kb/1/files', form('a.pdf', PDF)]];
        for (const [m, p, body] of probes) eq((await call(m, A + '/agent' + p, body)).status, 401, `${m} ${p}`);
        eq((await call('GET', A + '/agent/kb', null, null, false)).status, 401);
        const forged = await fetch(HOST + A + '/agent/kb', { headers: { Cookie: 'incentiva_token=forged.token.value' } });
        eq(forged.status, 401, 'forged cookie');
      });
      await t('a session from the other tenant is not accepted here (401)', async () => {
        const r = await fetch(HOST + A + '/agent/kb', { headers: { Cookie: jar.adminB } });
        eq(r.status, 401);
      });

      console.log('\nE. Notes on a lead');
      let adminNote, agentNote;
      await t('the admin adds a note; the tenant comes from the session, never the body', async () => {
        const r = await call('POST', A + `/agent/leads/${leadMine}/notes`, { body: '  Called the builder about the lot premium.\nFollow up Friday.  ', tenant_id: OTHER_TENANT, author_user_id: 1 }, 'admin');
        eq(r.status, 201, JSON.stringify(r.data)); adminNote = r.data.note;
        eq(adminNote.body, 'Called the builder about the lot premium.\nFollow up Friday.'); eq(adminNote.author_user_id, adminUser.id);
        const row = await db.one('SELECT tenant_id FROM nca_lead_notes WHERE id = :id', { id: adminNote.id });
        eq(row.tenant_id, SIT_TENANT);
      });
      await t('the assigned agent reads it and adds and edits their own note', async () => {
        const list = await call('GET', A + `/agent/leads/${leadMine}/notes`, null, 'agent');
        eq(list.status, 200); assert(list.data.notes.some((n) => n.id === adminNote.id), 'admin note not visible to the assigned agent');
        const r = await call('POST', A + `/agent/leads/${leadMine}/notes`, { body: 'Buyer prefers weekend tours.' }, 'agent');
        eq(r.status, 201); agentNote = r.data.note;
        const e = await call('PATCH', A + `/agent/leads/${leadMine}/notes/${agentNote.id}`, { body: 'Buyer prefers Saturday tours.' }, 'agent');
        eq(e.status, 200); eq(e.data.note.body, 'Buyer prefers Saturday tours.');
      });
      await t('only the author or an admin changes a note', async () => {
        eq((await call('PATCH', A + `/agent/leads/${leadMine}/notes/${adminNote.id}`, { body: 'hijacked' }, 'agent')).status, 403, 'agent edited the admin note');
        eq((await call('DELETE', A + `/agent/leads/${leadMine}/notes/${adminNote.id}`, null, 'agent')).status, 403, 'agent deleted the admin note');
        eq((await call('PATCH', A + `/agent/leads/${leadMine}/notes/${agentNote.id}`, { body: 'Admin clarified: Saturday mornings.' }, 'admin')).status, 200, 'admin cannot edit');
        eq((await db.one('SELECT body FROM nca_lead_notes WHERE id = :id', { id: adminNote.id })).body, 'Called the builder about the lot premium.\nFollow up Friday.');
      });
      await t('an agent cannot read, add, edit or delete notes on a lead not assigned to them (404)', async () => {
        eq((await call('GET', A + `/agent/leads/${leadMine}/notes`, null, 'agent2')).status, 404);
        eq((await call('POST', A + `/agent/leads/${leadMine}/notes`, { body: 'x' }, 'agent2')).status, 404);
        eq((await call('PATCH', A + `/agent/leads/${leadMine}/notes/${agentNote.id}`, { body: 'x' }, 'agent2')).status, 404);
        eq((await call('DELETE', A + `/agent/leads/${leadMine}/notes/${agentNote.id}`, null, 'agent2')).status, 404);
        eq((await call('GET', A + `/agent/leads/${leadNobody}/notes`, null, 'agent')).status, 404, 'an unassigned lead leaked to an agent');
        eq((await call('GET', A + `/agent/leads/${leadNobody}/notes`, null, 'admin')).status, 200, 'the admin sees the tenant');
      });
      await t('a note id from another lead is not reachable through this lead', async () => {
        const n = (await call('POST', A + `/agent/leads/${leadNobody}/notes`, { body: 'admin-only lead note' }, 'admin')).data.note;
        eq((await call('PATCH', A + `/agent/leads/${leadMine}/notes/${n.id}`, { body: 'moved' }, 'admin')).status, 404);
        eq((await call('PATCH', A + `/agent/leads/${leadMine}/notes/${n.id}`, { body: 'moved' }, 'agent')).status, 404);
      });
      await t('empty and oversized notes are refused', async () => {
        eq((await call('POST', A + `/agent/leads/${leadMine}/notes`, { body: '   ' }, 'agent')).status, 400);
        eq((await call('POST', A + `/agent/leads/${leadMine}/notes`, {}, 'agent')).status, 400);
        eq((await call('POST', A + `/agent/leads/${leadMine}/notes`, { body: 'x'.repeat(20001) }, 'agent')).status, 400);
        eq((await call('PATCH', A + `/agent/leads/${leadMine}/notes/${agentNote.id}`, { body: '' }, 'agent')).status, 400);
      });
      await t('cross-tenant: the other tenant\'s lead notes are 404 even for the admin', async () => {
        eq((await call('GET', A + `/agent/leads/${leadOther}/notes`, null, 'admin')).status, 404);
        eq((await call('POST', A + `/agent/leads/${leadOther}/notes`, { body: 'x' }, 'admin')).status, 404);
        eq((await call('PATCH', A + `/agent/leads/${leadOther}/notes/${otherNote.id}`, { body: 'x' }, 'admin')).status, 404);
        eq((await call('DELETE', A + `/agent/leads/${leadOther}/notes/${otherNote.id}`, null, 'admin')).status, 404);
        eq((await db.one('SELECT body FROM nca_lead_notes WHERE id = :id', { id: otherNote.id })).body, 'Other tenant private note');
      });
      await t('the author deletes their own note', async () => {
        eq((await call('DELETE', A + `/agent/leads/${leadMine}/notes/${agentNote.id}`, null, 'agent')).status, 200);
        eq(await db.one('SELECT id FROM nca_lead_notes WHERE id = :id', { id: agentNote.id }), null);
      });

      console.log('\nF. Documents on a lead');
      let leadPdf, adminPng;
      await t('the assigned agent uploads a PDF; it is stored in Postgres with its hash', async () => {
        const r = await call('POST', A + `/agent/leads/${leadMine}/files`, form('Pre-approval letter.pdf', PDF, 'application/pdf'), 'agent');
        eq(r.status, 201, JSON.stringify(r.data)); leadPdf = r.data.file;
        eq(leadPdf.content_type, 'application/pdf'); eq(leadPdf.size_bytes, PDF.length); eq(leadPdf.sha256, crypto.createHash('sha256').update(PDF).digest('hex'));
        assert(!('data' in leadPdf), 'file metadata must not carry the bytes');
        const row = await db.one('SELECT tenant_id, owner_type, owner_id, length(data)::int AS n FROM nca_files WHERE id = :id', { id: leadPdf.id });
        eq(row.tenant_id, SIT_TENANT); eq(row.owner_type, 'lead'); eq(row.owner_id, leadMine); eq(row.n, PDF.length);
        const list = await call('GET', A + `/agent/leads/${leadMine}/files`, null, 'admin');
        assert(list.data.files.some((f) => f.id === leadPdf.id), 'not listed for the admin');
      });
      await t('download is always an attachment with nosniff, a sandboxing CSP and the exact bytes', async () => {
        const r = await call('GET', A + `/agent/files/${leadPdf.id}`, null, 'admin', true);
        eq(r.status, 200);
        eq(r.headers.get('content-type'), 'application/pdf');
        assert(/^attachment;/.test(r.headers.get('content-disposition') || ''), 'not an attachment: ' + r.headers.get('content-disposition'));
        assert(/Pre-approval letter\.pdf/.test(r.headers.get('content-disposition')), 'filename lost');
        eq(r.headers.get('x-content-type-options'), 'nosniff');
        assert(/sandbox/.test(r.headers.get('content-security-policy') || ''), 'no sandbox CSP');
        assert(/no-store/.test(r.headers.get('cache-control') || ''), 'cacheable');
        assert(r.buf.equals(PDF), 'bytes differ');
      });
      await t('every accepted type downloads as an attachment and never as text/html or svg', async () => {
        const kinds = [['photo.png', PNG, 'text/plain'], ['scan.jpg', JPG], ['plan.webp', WEBP], ['map.gif', GIF], ['notes.txt', Buffer.from('Lot 42 faces east.')], ['comps.csv', Buffer.from('a,b\n1,2\n')],
          ['contract.docx', DOCX], ['budget.xlsx', XLSX], ['old.doc', CFB_MAGIC], ['old.xls', CFB_MAGIC]];
        for (const [n, b, ty] of kinds) {
          const r = await call('POST', A + `/agent/leads/${leadMine}/files`, form(n, b, ty), 'admin');
          eq(r.status, 201, n + ' ' + JSON.stringify(r.data));
          if (n === 'photo.png') adminPng = r.data.file;
          const d = await call('GET', A + `/agent/files/${r.data.file.id}`, null, 'agent', true);
          eq(d.status, 200, n);
          assert(!/^(text\/(html|xml|javascript)|image\/svg|application\/(xhtml|xml|javascript))/i.test(d.headers.get('content-type') || ''), n + ' served as ' + d.headers.get('content-type'));
          assert(/^attachment;/.test(d.headers.get('content-disposition') || ''), n + ' not an attachment');
          eq(d.headers.get('x-content-type-options'), 'nosniff', n);
        }
        eq(adminPng.content_type, 'image/png', 'the client-sent text/plain must not be stored');
      });
      await t('disguised and disallowed uploads are refused by the server (415) and nothing is stored', async () => {
        const before = (await db.one('SELECT COUNT(*)::int AS n FROM nca_files WHERE tenant_id = :t', { t: SIT_TENANT })).n;
        const bad = [['page.html', HTML, 'text/html'], ['logo.svg', SVG, 'image/svg+xml'], ['logo.svg', SVG, 'image/png'], ['image.png', HTML, 'image/png'], ['invoice.pdf', HTML, 'application/pdf'],
          ['notes.txt', HTML, 'text/plain'], ['run.exe', Buffer.from('MZ\x90\x00'), 'application/octet-stream'], ['README', Buffer.from('plain'), 'text/plain'], ['real.png', PNG, 'text/html'],
          ['archive.zip', DOCX, 'application/zip'], ['book.xlsx', DOCX, 'application/octet-stream']];
        for (const [n, b, ty] of bad) eq((await call('POST', A + `/agent/leads/${leadMine}/files`, form(n, b, ty), 'admin')).status, 415, `${n} as ${ty}`);
        eq((await db.one('SELECT COUNT(*)::int AS n FROM nca_files WHERE tenant_id = :t', { t: SIT_TENANT })).n, before, 'a refused upload was stored');
      });
      await t('a file over 10 MB is refused with 413; a request with no file is 400', async () => {
        const big = Buffer.alloc(10 * 1024 * 1024 + 1024); PDF.copy(big);
        const r = await call('POST', A + `/agent/leads/${leadMine}/files`, form('huge.pdf', big, 'application/pdf'), 'admin');
        eq(r.status, 413, 'oversized upload' + (r.error ? ': ' + r.error.message : ''));
        eq((await db.one(`SELECT COUNT(*)::int AS n FROM nca_files WHERE tenant_id = :t AND filename = 'huge.pdf'`, { t: SIT_TENANT })).n, 0);
        eq((await db.one(`SELECT COUNT(*)::int AS n FROM nca_files WHERE tenant_id = :t AND size_bytes > 10485760`, { t: SIT_TENANT })).n, 0);
        const fd = new FormData(); fd.append('note', 'no file here');
        eq((await call('POST', A + `/agent/leads/${leadMine}/files`, fd, 'admin')).status, 400);
        eq((await call('POST', A + `/agent/leads/${leadMine}/files`, { file: 'JVBERi0=' }, 'admin')).status, 400, 'a JSON body is not an upload');
      });
      await t('an uploaded filename is sanitized before it is stored', async () => {
        const r = await call('POST', A + `/agent/leads/${leadMine}/files`, form('..\\..\\evil";name<x>.pdf', PDF), 'admin');
        eq(r.status, 201);
        assert(!/[\\/"<>;]/.test(r.data.file.filename), 'unsafe filename stored: ' + r.data.file.filename);
        const d = await call('GET', A + `/agent/files/${r.data.file.id}`, null, 'admin', true);
        const cd = d.headers.get('content-disposition');
        eq((cd.match(/"/g) || []).length, 2, 'header quoting broken: ' + cd);
      });
      await t('an agent cannot list, upload, download or delete documents on a lead not assigned to them (404)', async () => {
        eq((await call('GET', A + `/agent/leads/${leadMine}/files`, null, 'agent2')).status, 404);
        eq((await call('POST', A + `/agent/leads/${leadMine}/files`, form('a.pdf', PDF), 'agent2')).status, 404);
        eq((await call('GET', A + `/agent/files/${leadPdf.id}`, null, 'agent2', true)).status, 404);
        eq((await call('DELETE', A + `/agent/files/${leadPdf.id}`, null, 'agent2')).status, 404);
        const nf = (await call('POST', A + `/agent/leads/${leadNobody}/files`, form('internal.pdf', PDF), 'admin')).data.file;
        eq((await call('GET', A + `/agent/files/${nf.id}`, null, 'agent', true)).status, 404, 'unassigned lead file leaked');
      });
      await t('reassigning a lead takes its documents and notes away from the previous agent', async () => {
        await db.exec('UPDATE nca_leads SET assigned_agent_id = :a WHERE id = :id', { a: agent2.id, id: leadMine });
        try {
          eq((await call('GET', A + `/agent/files/${leadPdf.id}`, null, 'agent', true)).status, 404);
          eq((await call('GET', A + `/agent/leads/${leadMine}/notes`, null, 'agent')).status, 404);
          eq((await call('GET', A + `/agent/files/${leadPdf.id}`, null, 'agent2', true)).status, 200);
        } finally { await db.exec('UPDATE nca_leads SET assigned_agent_id = :a WHERE id = :id', { a: agentUser.id, id: leadMine }); }
      });
      await t('only the uploader or an admin deletes a lead document', async () => {
        eq((await call('DELETE', A + `/agent/files/${adminPng.id}`, null, 'agent')).status, 403, 'agent deleted the admin upload');
        eq((await call('DELETE', A + `/agent/files/${adminPng.id}`, null, 'admin')).status, 200);
        eq((await call('GET', A + `/agent/files/${adminPng.id}`, null, 'admin', true)).status, 404);
        eq((await call('DELETE', A + `/agent/files/${leadPdf.id}`, null, 'agent')).status, 200, 'the uploader cannot delete');
      });
      await t('cross-tenant: another tenant\'s files are 404 for download, listing, upload and delete', async () => {
        eq((await call('GET', A + `/agent/files/${otherFile.id}`, null, 'admin', true)).status, 404);
        eq((await call('GET', A + `/agent/files/${otherKbFile.id}`, null, 'admin', true)).status, 404);
        eq((await call('DELETE', A + `/agent/files/${otherFile.id}`, null, 'admin')).status, 404);
        eq((await call('DELETE', A + `/agent/files/${otherKbFile.id}`, null, 'admin')).status, 404);
        eq((await call('GET', A + `/agent/leads/${leadOther}/files`, null, 'admin')).status, 404);
        eq((await call('POST', A + `/agent/leads/${leadOther}/files`, form('a.pdf', PDF), 'admin')).status, 404);
        eq((await db.one('SELECT COUNT(*)::int AS n FROM nca_files WHERE id IN (:ids)', { ids: [otherFile.id, otherKbFile.id] })).n, 2, 'other tenant files were deleted');
        const own = await call('GET', B + `/agent/files/${otherFile.id}`, null, 'adminB', true);
        eq(own.status, 200, 'the owning tenant can still download'); assert(own.buf.equals(PDF));
      });

      console.log('\nG. Knowledge base');
      let entry;
      await t('the licensed agent creates an entry with notes, tags and links', async () => {
        const r = await call('POST', A + '/agent/kb', { title: 'Hillsborough builder registration rules', body: 'Register the buyer on the first visit.\nKeep the guest card.', tags: 'registration, Hillsborough, registration',
          links: [{ url: 'https://example.test/policy', label: 'Builder policy' }, { url: 'http://example.test/plain' }], tenant_id: OTHER_TENANT }, 'agent');
        eq(r.status, 201, JSON.stringify(r.data)); entry = r.data.entry;
        eq(entry.links.length, 2); eq(JSON.stringify(entry.tags), '["registration","Hillsborough"]');
        eq((await db.one('SELECT tenant_id, created_by FROM nca_kb_entries WHERE id = :id', { id: entry.id })).tenant_id, SIT_TENANT);
      });
      await t('a javascript: link refuses the whole entry and stores nothing', async () => {
        const before = (await db.one('SELECT COUNT(*)::int AS n FROM nca_kb_entries WHERE tenant_id = :t', { t: SIT_TENANT })).n;
        const r = await call('POST', A + '/agent/kb', { title: 'Bad', links: [{ url: 'https://ok.example.test' }, { url: 'javascript:alert(document.cookie)' }] }, 'admin');
        eq(r.status, 400);
        eq((await db.one('SELECT COUNT(*)::int AS n FROM nca_kb_entries WHERE tenant_id = :t', { t: SIT_TENANT })).n, before, 'a partial entry was stored');
        eq((await call('POST', A + '/agent/kb', { body: 'no title' }, 'admin')).status, 400, 'title required');
        eq((await call('POST', A + '/agent/kb', { title: 'x'.repeat(301) }, 'admin')).status, 400, 'title cap');
      });
      await t('links are http(s) only when added later, and are removable', async () => {
        for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<b>x</b>', 'ftp://example.test/', 'mailto:a@example.test', 'not a url']) {
          eq((await call('POST', A + `/agent/kb/${entry.id}/links`, { url: bad }, 'admin')).status, 400, 'accepted ' + bad);
        }
        const r = await call('POST', A + `/agent/kb/${entry.id}/links`, { url: 'https://www.floridarealtors.org/', label: 'Florida Realtors' }, 'admin');
        eq(r.status, 201);
        const e = (await call('GET', A + `/agent/kb/${entry.id}`, null, 'agent')).data.entry;
        eq(e.links.length, 3); assert(e.links.every((l) => /^https?:\/\//.test(l.url)), 'a non-http link was stored');
        eq((await call('DELETE', A + `/agent/kb/${entry.id}/links/${r.data.link.id}`, null, 'agent')).status, 200);
        eq((await call('DELETE', A + `/agent/kb/${entry.id}/links/${r.data.link.id}`, null, 'agent')).status, 404, 'double delete');
      });
      await t('both roles read and edit the shared knowledge base, unlimited entries', async () => {
        const p = await call('PATCH', A + `/agent/kb/${entry.id}`, { body: 'Register the buyer on the first visit.\nKeep the guest card.\nAdmin: confirmed with two builders.', tags: ['registration'] }, 'admin');
        eq(p.status, 200); eq(p.data.entry.updated_by, adminUser.id);
        eq((await call('GET', A + `/agent/kb/${entry.id}`, null, 'agent2')).data.entry.body.split('\n').length, 3, 'another agent cannot read shared knowledge');
        for (let i = 0; i < 3; i++) eq((await call('POST', A + '/agent/kb', { title: 'Research note ' + i }, i % 2 ? 'admin' : 'agent2')).status, 201);
        const list = await call('GET', A + '/agent/kb', null, 'agent');
        eq(list.data.entries.length, 4);
        const found = await call('GET', A + '/agent/kb?q=guest%20card', null, 'agent');
        eq(found.data.entries.length, 1); eq(found.data.entries[0].link_count, 2);
        eq((await call('GET', A + '/agent/kb?q=%25', null, 'agent')).data.entries.length, 0, 'a LIKE wildcard in the search matched everything');
        eq((await call('PATCH', A + `/agent/kb/${entry.id}`, {}, 'agent')).status, 400, 'empty patch');
      });
      await t('documents on an entry upload, download as attachments, and any console user may remove them', async () => {
        const r = await call('POST', A + `/agent/kb/${entry.id}/files`, form('Registration policy.pdf', PDF, 'application/pdf'), 'admin');
        eq(r.status, 201);
        eq((await call('POST', A + `/agent/kb/${entry.id}/files`, form('policy.svg', SVG, 'image/svg+xml'), 'admin')).status, 415);
        const e = (await call('GET', A + `/agent/kb/${entry.id}`, null, 'agent')).data.entry;
        eq(e.files.length, 1); assert(!('data' in e.files[0]), 'bytes leaked into JSON');
        const d = await call('GET', A + `/agent/files/${r.data.file.id}`, null, 'agent2', true);
        eq(d.status, 200); assert(/^attachment;/.test(d.headers.get('content-disposition'))); eq(d.headers.get('x-content-type-options'), 'nosniff');
        eq((await call('DELETE', A + `/agent/files/${r.data.file.id}`, null, 'agent')).status, 200);
      });
      await t('delete archives: the entry leaves the list, stays readable, and can be restored', async () => {
        eq((await call('DELETE', A + `/agent/kb/${entry.id}`, null, 'agent')).status, 200);
        assert(!(await call('GET', A + '/agent/kb', null, 'admin')).data.entries.some((x) => x.id === entry.id), 'archived entry still listed');
        assert((await call('GET', A + '/agent/kb?archived=1', null, 'admin')).data.entries.some((x) => x.id === entry.id), 'archived entry missing from the archive');
        const g = await call('GET', A + `/agent/kb/${entry.id}`, null, 'admin');
        eq(g.status, 200); assert(g.data.entry.archived_at, 'archived_at not set'); eq(g.data.entry.links.length, 2, 'archiving dropped links');
        eq((await call('PATCH', A + `/agent/kb/${entry.id}`, { archived: false }, 'admin')).data.entry.archived_at, null);
      });
      await t('cross-tenant: another tenant\'s entries are 404 for read, edit, archive, links and uploads, and never listed', async () => {
        eq((await call('GET', A + `/agent/kb/${otherKb.id}`, null, 'admin')).status, 404);
        eq((await call('PATCH', A + `/agent/kb/${otherKb.id}`, { title: 'x' }, 'admin')).status, 404);
        eq((await call('DELETE', A + `/agent/kb/${otherKb.id}`, null, 'admin')).status, 404);
        eq((await call('POST', A + `/agent/kb/${otherKb.id}/links`, { url: 'https://example.test' }, 'admin')).status, 404);
        eq((await call('DELETE', A + `/agent/kb/${otherKb.id}/links/${otherKb.links[0].id}`, null, 'admin')).status, 404);
        eq((await call('POST', A + `/agent/kb/${otherKb.id}/files`, form('a.pdf', PDF), 'admin')).status, 404);
        for (const q of ['', '?archived=1', '?q=Other']) assert(!(await call('GET', A + '/agent/kb' + q, null, 'admin')).data.entries.some((x) => x.id === otherKb.id), 'other tenant entry listed ' + q);
        const still = await db.one('SELECT title, archived_at FROM nca_kb_entries WHERE id = :id', { id: otherKb.id });
        eq(still.title, 'Other tenant policy'); eq(still.archived_at, null);
        eq((await db.one('SELECT COUNT(*)::int AS n FROM nca_kb_links WHERE entry_id = :id', { id: otherKb.id })).n, 1);
      });

      console.log('\nH. Audit');
      await t('writes and downloads are audited, and no note or entry text is copied into the audit log', async () => {
        const rows = await db.q('SELECT action, detail FROM nca_audit_log WHERE tenant_id = :t', { t: SIT_TENANT });
        const actions = new Set(rows.map((r) => r.action));
        for (const a of ['lead.note_add', 'lead.note_edit', 'lead.note_delete', 'lead.file_upload', 'file.download', 'file.delete', 'kb.create', 'kb.update', 'kb.archive', 'kb.link_add', 'kb.link_delete', 'kb.file_upload']) {
          assert(actions.has(a), 'missing audit action ' + a);
        }
        const blob = JSON.stringify(rows.map((r) => r.detail));
        assert(!/lot premium|Saturday|guest card/.test(blob), 'note or entry text copied into the audit log');
        eq((await db.one('SELECT COUNT(*)::int AS n FROM nca_audit_log WHERE tenant_id = :t', { t: OTHER_TENANT })).n >= 0, true);
      });
    } catch (e) {
      fail++; failures.push('database section crashed: ' + e.stack);
      console.log('  FAIL database section crashed\n', e);
    } finally {
      try { if (server) server.close(); } catch (e) { /* ignore */ }
      try { await cleanup(); } catch (e) { console.log('  cleanup failed:', e.message); }
      try {
        const left = await db.one(`SELECT (SELECT COUNT(*) FROM nca_files WHERE tenant_id IN (:a,:b)) + (SELECT COUNT(*) FROM nca_kb_entries WHERE tenant_id IN (:a,:b))
          + (SELECT COUNT(*) FROM nca_lead_notes WHERE tenant_id IN (:a,:b)) + (SELECT COUNT(*) FROM nca_leads WHERE tenant_id IN (:a,:b)) AS n`, { a: SIT_TENANT, b: OTHER_TENANT });
        if (Number(left.n)) { fail++; failures.push('cleanup left ' + left.n + ' rows behind'); }
        else console.log('\n  cleanup: every row under tenants 990913 / 990914 removed');
      } catch (e) { console.log('  cleanup check failed:', e.message); }
      try { await db.sequelize.close(); } catch (e) { /* ignore */ }
    }
  }

  console.log('\n────────────────────────────────────────');
  console.log(`BuyersLine console notes + knowledge base SIT: ${pass}/${pass + fail} passed`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach((f) => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
