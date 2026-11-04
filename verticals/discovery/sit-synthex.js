'use strict';
/**
 * SYNTHEX SAI DISCOVERY — SIT
 *
 * The same Discovery module served on synthexsai.com/discovery, in Spanish and
 * under the Synthex SAI brand. This suite attacks what the mirror must hold:
 *   - the brand comes from the HOST and pages are Spanish there, English elsewhere
 *   - the Spanish pages are a faithful mirror (same ids, same API calls)
 *   - no OrbUp / Digit2AI / Ava text leaks onto a Synthex page
 *   - an account, a session and a shared roadmap never cross between brands
 *   - Synthex keys carry their own prefix and still ingest
 *   - findings and derived process names come back in Spanish
 * Zero external keys. Creates sit_sx_* accounts and deletes them.
 *
 *   node verticals/discovery/sit-synthex.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);
const RUN = crypto.randomBytes(4).toString('hex');
const email = (n) => `sit_sx_${RUN}_${n}@discovery.test`;
const SX = 'synthexsai.com', OU = 'orbup.app';
let base;

function req(method, p, { body, host = SX, cookie, headers = {} } = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const h = Object.assign({ 'Content-Type': 'application/json', Host: host }, headers);
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    if (cookie) h.Cookie = cookie;
    const r = http.request(base + p, { method, headers: h }, (res) => {
      let buf = ''; res.on('data', c => buf += c);
      res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch (e) {} resolve({ status: res.statusCode, json, text: buf, headers: res.headers }); });
    });
    r.on('error', () => resolve({ status: 0, text: '' }));
    if (data) r.write(data); r.end();
  });
}
const cookieOf = (r) => ((r.headers['set-cookie'] || [])[0] || '').split(';')[0];
const PUB = path.join(__dirname, 'public');
const SXD = path.join(PUB, 'sx');
const ids = (html) => new Set((html.match(/\bid="([^"]+)"/g) || []).map(x => x.slice(4, -1)));
const apis = (js) => new Set((js.match(/['"`](\/api\/v1\/[a-z0-9\/_\-]+)/gi) || []).map(x => x.slice(1).replace(/\/$/, '')));

async function main() {
  console.log(`\nSYNTHEX SAI DISCOVERY — SIT (run ${RUN})\n${'='.repeat(66)}`);
  const router = require('./src/index');
  const app = express();
  app.use('/discovery', router);
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  base = 'http://127.0.0.1:' + server.address().port;
  for (let i = 0; i < 40 && !router.ready(); i++) await new Promise(r => setTimeout(r, 150));

  section('The mirror is complete and faithful');
  const pages = fs.readdirSync(PUB).filter(f => f.endsWith('.html'));
  for (const f of pages) {
    const has = fs.existsSync(path.join(SXD, f));
    ok(`sx/${f} exists`, has);
    if (!has) continue;
    const en = fs.readFileSync(path.join(PUB, f), 'utf8'), es = fs.readFileSync(path.join(SXD, f), 'utf8');
    const missing = [...ids(en)].filter(i => !ids(es).has(i));
    ok(`sx/${f} keeps every element id`, missing.length === 0, missing.join(','));
    ok(`sx/${f} is Spanish`, /<html lang="es"/.test(es));
    ok(`sx/${f} carries the Synthex theme`, es.includes('/discovery/sx/synthex.css'));
    const leak = es.match(/OrbUp|orbup\.app|Digit2AI|\bAva\b|orbup_dk_|orbup-discovery/);
    ok(`sx/${f} names no other brand`, !leak, leak && leak[0]);
  }
  for (const f of ['app.js', 'diagram.js', 'guide.js']) {
    const en = fs.readFileSync(path.join(PUB, f), 'utf8'), es = fs.readFileSync(path.join(SXD, f), 'utf8');
    const gone = [...apis(en)].filter(a => !apis(es).has(a));
    ok(`sx/${f} calls the same API paths`, gone.length === 0, gone.join(','));
    const leak = es.match(/OrbUp|orbup\.app|Digit2AI|\bAva\b|orbup_dk_/);
    ok(`sx/${f} names no other brand`, !leak, leak && leak[0]);
  }
  for (const f of ['popup.html', 'popup.js', 'content.js', 'manifest.json']) {
    const es = fs.readFileSync(path.join(__dirname, 'extension-sx', f), 'utf8');
    ok(`extension-sx/${f} names no other brand`, !/OrbUp|orbup\.app/.test(es));
  }

  section('The brand comes from the host');
  {
    const a = await req('GET', '/discovery/', { host: SX });
    ok('synthexsai.com/discovery/ serves the Spanish landing', a.status === 200 && /Synthex SAI/.test(a.text) && /lang="es"/.test(a.text));
    const b = await req('GET', '/discovery/', { host: OU });
    ok('orbup.app/discovery/ still serves the English OrbUp landing', b.status === 200 && /OrbUp/.test(b.text) && /lang="en"/.test(b.text));
    const c = await req('GET', '/discovery/', { host: 'aiagent.ringlypro.com' });
    ok('the CRM host is OrbUp, not Synthex', /OrbUp/.test(c.text));
    const g = await req('GET', '/discovery/guide', { host: SX });
    ok('the walkthrough is Lina on Synthex', /Lina/.test(g.text) && !/\bAva\b/.test(g.text));
    const m = await req('GET', '/discovery/extension/manifest.json', { host: SX });
    ok('the Synthex host serves the Spanish extension', m.status === 200 && /Synthex SAI Discovery/.test(m.text));
    const m2 = await req('GET', '/discovery/extension/manifest.json', { host: OU });
    ok('the OrbUp host still serves the OrbUp extension', /OrbUp/.test(m2.text));
    const sp = await req('POST', '/discovery/api/v1/auth/signup', { host: SX, body: { brand: 'orbup', email: email('spoof'), password: 'longenough1', company_name: 'Spoof' } });
    ok('a brand in the body is ignored (host wins)', sp.status === 201 && sp.json.account.brand === 'synthex');
  }

  section('Accounts never cross brands');
  const sx = await req('POST', '/discovery/api/v1/auth/signup', { host: SX, body: { email: email('a'), password: 'longenough1', company_name: 'Empresa SX', lang: 'en' } });
  ok('Synthex signup creates a Spanish synthex account', sx.status === 201 && sx.json.account.brand === 'synthex' && sx.json.account.lang === 'es');
  const sxCookie = cookieOf(sx);
  const ou = await req('POST', '/discovery/api/v1/auth/signup', { host: OU, body: { email: email('b'), password: 'longenough1', company_name: 'Co OU' } });
  ok('OrbUp signup still creates an orbup account', ou.status === 201 && ou.json.account.brand === 'orbup');
  const ouCookie = cookieOf(ou);
  ok('a Synthex session works on Synthex', (await req('GET', '/discovery/api/v1/auth/me', { host: SX, cookie: sxCookie })).status === 200);
  ok('a Synthex session is refused on OrbUp', (await req('GET', '/discovery/api/v1/auth/me', { host: OU, cookie: sxCookie })).status === 401);
  ok('an OrbUp session is refused on Synthex', (await req('GET', '/discovery/api/v1/auth/me', { host: SX, cookie: ouCookie })).status === 401);
  ok('an OrbUp session cannot read Synthex data via the API', (await req('GET', '/discovery/api/v1/overview', { host: SX, cookie: ouCookie })).status === 401);
  const l1 = await req('POST', '/discovery/api/v1/auth/login', { host: OU, body: { email: email('a'), password: 'longenough1' } });
  ok('a Synthex login is refused on OrbUp, same answer as a wrong password', l1.status === 401 && /incorrect/.test(l1.json.error));
  const l2 = await req('POST', '/discovery/api/v1/auth/login', { host: SX, body: { email: email('a'), password: 'longenough1' } });
  ok('a Synthex login works on Synthex', l2.status === 200);
  const l3 = await req('POST', '/discovery/api/v1/auth/login', { host: SX, body: { email: email('a'), password: 'wrongwrong1' } });
  ok('the Synthex error is Spanish', l3.status === 401 && /contraseña/.test(l3.json.error));
  const pt = await req('PATCH', '/discovery/api/v1/account', { host: SX, cookie: sxCookie, body: { lang: 'en' } });
  ok('a Synthex account cannot switch itself to English', pt.json.account.lang === 'es');

  section('Keys, capture and Spanish output');
  const k = await req('POST', '/discovery/api/v1/keys', { host: SX, cookie: sxCookie, body: { name: 'portátiles', scopes: ['ingest'] } });
  ok('a Synthex key carries the synthex_dk_ prefix', k.status === 201 && k.json.plaintext.startsWith('synthex_dk_'));
  ok('the key warning is Spanish', /única vez/.test(k.json.warning));
  const steps = [];
  ['acme.my.salesforce.com', 'docs.google.com'].forEach((a, i) => {
    steps.push({ action: 'navigate', url: `https://${a}/x/${i}`, dwell_ms: 30000 });
    steps.push({ action: 'type', url: `https://${a}/x/${i}`, role: 'field', dwell_ms: 40000, value: 'SECRETO' });
  });
  const ing = await req('POST', '/discovery/api/v1/ingest/capture', { host: SX, headers: { Authorization: 'Bearer ' + k.json.plaintext },
    body: { started_at: new Date().toISOString(), duration_ms: 140000, steps } });
  ok('a Synthex key ingests', ing.status === 201 || ing.status === 200, String(ing.status));
  const der = await req('POST', '/discovery/api/v1/processes/derive', { host: SX, cookie: sxCookie });
  const p0 = (der.json && der.json.processes || [])[0];
  ok('a derived process name is Spanish', p0 && /( entre | en )/.test(p0.name), p0 && p0.name);
  ok('derived caveats are Spanish', p0 && (p0.evidence.caveats || []).some(c => /Observado|Solo|Una sola/.test(c)));
  const ov = await req('GET', '/discovery/api/v1/overview', { host: SX, cookie: sxCookie });
  const titles = (ov.json.findings || []).map(f => f.title).join(' | ');
  ok('findings come back in Spanish', /propuesto|observó|Todavía|sola persona/.test(titles), titles);
  ok('findings carry no English sentence', !/ awaiting | was performed | observed over /.test(titles));
  const ouOv = await req('GET', '/discovery/api/v1/overview', { host: OU, cookie: ouCookie });
  ok('OrbUp findings are still English', /No work has been observed yet/.test((ouOv.json.findings || []).map(f => f.title).join()));

  section('A shared roadmap stays under its brand');
  {
    const { Evaluation, sequelize } = require('./src/models');
    const tok = 'sxsit' + RUN;
    await Evaluation.create({ tenant_id: sx.json.account.id, account_id: sx.json.account.id, version: 1, scorecard: {}, phases: [], share_token: tok });
    ok('the Synthex roadmap opens on Synthex', (await req('GET', '/discovery/api/v1/public/roadmap/' + tok, { host: SX })).status === 200);
    ok('the Synthex roadmap is 404 on OrbUp', (await req('GET', '/discovery/api/v1/public/roadmap/' + tok, { host: OU })).status === 404);

    section('Wiring');
    const appSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'app.js'), 'utf8');
    const sxBlock = appSrc.slice(appSrc.indexOf('const SYNTHEX_HOSTS'), appSrc.indexOf("Página no encontrada"));
    ok('the synthexsai.com handler passes /discovery through', /path === '\/discovery' \|\| path\.startsWith\('\/discovery\/'\)\) return next\(\)/.test(sxBlock));
    const land = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'synthexai', 'index.html'), 'utf8');
    ok('the Synthex homepage menu is a hamburger', /id="sxBurger"[^>]*aria-controls="sxLinks"/.test(land) && /\.menu-open \.links\{display:flex\}/.test(land));
    for (const f of fs.readdirSync(SXD).filter(x => x.endsWith('.html'))) {
      ok(`sx/${f} loads the hamburger menu`, fs.readFileSync(path.join(SXD, f), 'utf8').includes('/discovery/sx/menu.js'));
    }
    ok('the Synthex top menu links Discovery', /<div class="links"[^>]*>[\s\S]*?href="https:\/\/synthexsai\.com\/discovery\/">Discovery<\/a>[\s\S]*?<\/div>/.test(land));

    section('Cleanup');
    const [rows] = await sequelize.query(`SELECT id FROM dsc_accounts WHERE email LIKE 'sit_sx_${RUN}_%'`);
    const t = rows.map(r => r.id).join(',') || '-1';
    for (const tb of ['dsc_events', 'dsc_findings', 'dsc_evaluations', 'dsc_answers', 'dsc_processes', 'dsc_steps', 'dsc_captures', 'dsc_sources', 'dsc_api_keys']) {
      await sequelize.query(`DELETE FROM ${tb} WHERE tenant_id IN (${t})`).catch(() => {});
    }
    await sequelize.query(`DELETE FROM dsc_accounts WHERE email LIKE 'sit_sx_${RUN}_%'`);
    const [left] = await sequelize.query(`SELECT count(*)::int AS n FROM dsc_accounts WHERE email LIKE 'sit_sx_%'`);
    ok('SIT rows removed', left[0].n === 0);
    await sequelize.close();
  }
  server.close();
  console.log(`\n${'='.repeat(66)}\nRESULT: ${pass}/${pass + fail} passed\nZero external keys used.`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
