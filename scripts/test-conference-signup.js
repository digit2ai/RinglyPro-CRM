'use strict';
/**
 * Build With AI sign-up (the QR on the last keynote slide) -> CRM contacts.
 *
 *   node scripts/test-conference-signup.js
 *
 * No database and no keys: the router is built with an in-memory `contacts`
 * table. So what is covered is the route's own rules (who may be stored, what
 * a stored value may contain, what happens to an existing contact) and the
 * form in a real browser. NOT covered: the three SQL statements against
 * Postgres. Check those once on the deploy with a real test sign-up.
 */
const path = require('path');
const http = require('http');
const express = require('express');
const mod = require('../src/routes/conference-signup');

let pass = 0, fail = 0;
const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'ok   ' : 'FAIL ') + n + (x !== undefined && !c ? ' -> ' + x : '')); };

/* in-memory contacts: only the three statements the route issues */
function fakeDb(rows) {
  let id = 1000;
  return {
    rows,
    async query(sql, { replacements: r }) {
      if (/^\s*SELECT/i.test(sql)) {
        return [rows.filter((c) => c.email.toLowerCase() === r.email || c.phone.replace(/\D/g, '').slice(-10) === r.last10)
          .map((c) => ({ id: c.id, client_id: c.client_id, email: c.email.toLowerCase() }))];
      }
      if (/^\s*UPDATE/i.test(sql)) {
        const c = rows.find((x) => x.id === r.id && x.client_id === r.client);
        if (c) { c.notes = c.notes ? c.notes + '\n\n' + r.note : r.note; c.tags = [...new Set([...(c.tags || []), ...JSON.parse(r.tags)])]; }
        return [[], c ? 1 : 0];
      }
      if (/^\s*INSERT/i.test(sql)) {
        if (rows.some((c) => c.email === r.email || c.phone === r.phone)) { const e = new Error('dup'); e.name = 'SequelizeUniqueConstraintError'; throw e; }
        rows.push({ id: ++id, client_id: r.client, first_name: r.first, last_name: r.last, phone: r.phone, email: r.email, notes: r.note, source: r.source, lead_source: r.lead_source, tags: JSON.parse(r.tags) });
        return [[], 1];
      }
      throw new Error('unexpected SQL: ' + sql.slice(0, 40));
    }
  };
}

function post(port, body, raw, keepLimits) {
  if (!keepLimits) mod._resetLimits(); // every check starts with a clean limiter, except the one that tests it
  return new Promise((resolve, reject) => {
    const data = raw || JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: '/api/conference/signup', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ s: res.statusCode, j }); });
    });
    req.on('error', reject); req.end(data);
  });
}

const adult = { first_name: 'Ana María', last_name: "O'Neil-Pérez", email: 'Ana@Example.com', phone: '(813) 555-0142', age: '19', consent: true, lang: 'es' };
const minor = { first_name: 'Luis', last_name: 'Gómez', email: 'luis@example.com', phone: '8135550199', age: '16', consent: true,
  parent_name: 'Marta Gómez', parent_email: 'marta@example.com', parent_phone: '', parent_consent: true };

(async () => {
  const rows = [
    { id: 1, client_id: 15, first_name: 'Old', last_name: 'Contact', phone: '+18135550111', email: 'old@example.com', notes: 'kept', tags: ['vip'] },
    { id: 2, client_id: 62, first_name: 'Other', last_name: 'Tenant', phone: '(727) 555-0100', email: 'other@example.com', notes: 'private', tags: [] }
  ];
  const db = fakeDb(rows);
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '500mb' })); // the same order as src/app.js: the global parser runs first
  app.use('/api/conference', mod.createRouter(db));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  const srv = app.listen(0); const port = srv.address().port;

  /* ---- adults ---- */
  let r = await post(port, adult);
  const a = rows.find((c) => c.email === 'ana@example.com');
  ok(r.s === 200 && r.j.success && a, 'an adult is saved');
  ok(a && a.client_id === 15 && a.phone === '+18135550142' && a.source === 'conference' && a.lead_source === 'build-with-ai', 'under client 15, E.164 phone, lowercased email, labelled source', JSON.stringify(a));
  ok(a && a.first_name === 'Ana María' && a.last_name === "O'Neil-Pérez", 'accents, apostrophes and hyphens in a name survive');
  ok(a && a.tags.includes('visionarium-ai-engineering') && !a.tags.includes('minor'), 'tagged for the program, not as a minor');
  ok(a && /Age stated: 19\./.test(a.notes) && /Contact consent given/.test(a.notes) && !/MINOR|Parent/.test(a.notes), 'the note records age and consent');

  /* ---- validation: nothing stored ---- */
  const before = rows.length;
  r = await post(port, { ...adult, email: 'b@example.com', phone: '8135550001', consent: false });
  ok(r.s === 400 && r.j.fields.includes('consent'), 'no consent tick, no row');
  r = await post(port, { ...adult, email: 'b@example.com', phone: '8135550001', first_name: '<img src=x onerror=alert(1)>' });
  ok(r.s === 400 && r.j.fields.includes('first_name'), 'markup in a name is refused, not stored');
  r = await post(port, { ...adult, email: 'not-an-email', phone: '8135550001' });
  ok(r.s === 400 && r.j.fields.includes('email'), 'a bad email is refused');
  r = await post(port, { ...adult, email: 'b@example.com', phone: '12345' });
  ok(r.s === 400 && r.j.fields.includes('phone'), 'a short phone is refused');
  r = await post(port, { ...adult, email: 'b@example.com', phone: '8135550001', age: 'nineteen' });
  ok(r.s === 400 && r.j.fields.includes('age'), 'age must be a number');
  r = await post(port, { ...adult, email: 'b@example.com', phone: '8135550001', website: 'http://spam' });
  ok(r.s === 200 && r.j.success && rows.length === before, 'the honeypot answers success and stores nothing');
  r = await post(port, { ...adult, email: 'b@example.com', phone: '8135550001', pad: 'x'.repeat(6000) });
  ok(r.s === 413, 'an oversized body is refused even though the global parser let it in', r.s);
  ok(rows.length === before, 'none of those created a row', rows.length);

  /* ---- minors ---- */
  r = await post(port, { ...minor, parent_consent: false });
  ok(r.s === 400 && r.j.fields.includes('parent_consent') && !rows.some((c) => c.email === 'luis@example.com'), 'a minor without the parent tick is NOT stored');
  r = await post(port, { ...minor, parent_name: '' });
  ok(r.s === 400 && r.j.fields.includes('parent_name'), 'a minor needs a parent name');
  r = await post(port, { ...minor, parent_email: '' });
  ok(r.s === 400 && r.j.fields.includes('parent_contact'), 'a minor needs a way to reach the parent');
  r = await post(port, { ...minor, parent_email: 'nope' });
  ok(r.s === 400 && r.j.fields.includes('parent_email'), 'a typed but unusable parent email is an error, not a blank');
  r = await post(port, { ...minor, age: '17', parent_consent: 'true' });
  ok(r.s === 400 && r.j.fields.includes('parent_consent'), 'the consent must be a real boolean true');
  r = await post(port, minor);
  const m = rows.find((c) => c.email === 'luis@example.com');
  ok(r.s === 200 && m, 'a minor with a parent and consent is saved');
  ok(m && m.tags.includes('minor') && /\(MINOR\)/.test(m.notes) && /Marta Gómez, marta@example.com/.test(m.notes) && /NOT verified/.test(m.notes), 'tagged minor; the note names the parent and says consent is unverified', m && m.notes);
  r = await post(port, { ...minor, email: 'kid@example.com', phone: '8135550555', age: '12' });
  ok(r.s === 403 && r.j.code === 'too_young' && !rows.some((c) => c.email === 'kid@example.com'), 'under 13 is refused outright, parent or not');
  r = await post(port, { ...adult, email: 'c@example.com', phone: '8135550777', age: '18', parent_name: 'x' });
  ok(r.s === 200 && !/Parent/.test(rows.find((c) => c.email === 'c@example.com').notes), 'at 18 no parent section is required or stored');

  /* ---- existing contacts ---- */
  r = await post(port, { ...adult, first_name: 'Changed', email: 'old@example.com', phone: '8135550888' });
  const o = rows.find((c) => c.id === 1);
  ok(r.s === 200 && o.first_name === 'Old' && o.phone === '+18135550111', 'an existing contact keeps its name and phone');
  ok(/^kept\n\n\[Build With AI/.test(o.notes) && o.tags.includes('vip') && o.tags.includes('build-with-ai'), 'and gains a note and tags, losing nothing');
  ok(rows.filter((c) => c.email === 'old@example.com').length === 1, 'with no second row');
  const snap = JSON.stringify(rows.find((c) => c.id === 2));
  r = await post(port, { ...adult, email: 'new@example.com', phone: '727-555-0100' });
  ok(r.s === 409 && r.j.code === 'not_saved' && Object.keys(r.j).length === 2, 'a phone held by ANOTHER client gets a generic refusal', JSON.stringify(r.j));
  r = await post(port, { ...adult, email: 'other@example.com', phone: '8135550999' });
  ok(r.s === 409 && JSON.stringify(rows.find((c) => c.id === 2)) === snap, 'and the other client\'s row is never changed');
  ok(!rows.some((c) => c.email === 'new@example.com'), 'nothing is inserted beside it either');

  /* ---- rate limit ---- */
  mod._resetLimits();
  let last = 200;
  let at30 = 0;
  for (let i = 0; i < 70; i++) { last = (await post(port, { ...adult, email: 'r' + i + '@example.com', phone: '81355510' + String(i).padStart(2, '0') }, null, true)).s; if (i === 29) at30 = last; }
  ok(at30 === 200, 'a full room on one Wi-Fi address (30 sign-ups) is NOT cut off', at30);
  ok(last === 429, 'a script from one address is cut off', last);
  mod._resetLimits();

  /* ---- structural ---- */
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'routes', 'conference-signup.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  ok(!/sendgrid|nodemailer|twilio|messages\.create|sgMail/i.test(src), 'the route has no mail or SMS transport: nothing is sent to anyone');
  ok(/client_id = :client/.test(src) && !/req\.body\.client|body\.client_id/.test(src), 'the client comes from config, never from the request');
  const QR = require('qrcode'); const cfg = require('fs').readFileSync(path.join(__dirname, '..', 'public', 'conference', 'assets', 'config.js'), 'utf8');
  const url = (cfg.match(/signupUrl:\s*"([^"]+)"/) || [])[1];
  const qr = QR.create(url, { errorCorrectionLevel: 'M' }); let p = '';
  for (let y = 0; y < qr.modules.size; y++) for (let x = 0; x < qr.modules.size; x++) if (qr.modules.data[y * qr.modules.size + x]) p += `M${x + 2} ${y + 2}h1v1h-1z`;
  ok(require('fs').readFileSync(path.join(__dirname, '..', 'public', 'conference', 'assets', 'qr-signup.svg'), 'utf8').includes(p), 'the QR on the last slide encodes signupUrl from config.js', url);

  /* ---- the form, in a browser ---- */
  let puppeteer = null; try { puppeteer = require('puppeteer'); } catch (e) {}
  if (!puppeteer) console.log('SKIPPED (puppeteer not installed): the form, slide 12 and slide 22 in a browser were NOT checked');
  else {
    const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const base = 'http://127.0.0.1:' + port + '/conference/';
    for (const w of [390, 1280]) {
      const pg = await br.newPage(); await pg.setViewport({ width: w, height: w === 390 ? 844 : 720 });
      const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
      await pg.goto(base + 'signup/', { waitUntil: 'networkidle2' });
      await pg.evaluate(() => BWA.setLang('es'));
      ok(await pg.$eval('#parent', (e) => e.hidden), w + ' the parent section is hidden to start');
      await pg.click('#send');
      ok((await pg.$$eval('.bad', (e) => e.length)) >= 6 && /rojo/.test(await pg.$eval('#msg', (e) => e.textContent)), w + ' an empty form marks every field, in Spanish');
      await pg.type('#first_name', 'Sofía'); await pg.type('#last_name', 'Ruiz'); await pg.type('#email', 'sofia' + w + '@example.com'); await pg.type('#phone', '813 555 0' + String(w).slice(0, 3)); await pg.type('#age', '15');
      ok(!(await pg.$eval('#parent', (e) => e.hidden)), w + ' typing an age under 18 opens the parent section');
      await pg.click('#consent'); await pg.click('#send');
      ok(await pg.$eval('[data-f="parent_consent"]', (e) => e.classList.contains('bad')) && !rows.some((c) => c.email === 'sofia' + w + '@example.com'), w + ' a minor cannot send without the parent tick');
      mod._resetLimits();
      await pg.type('#parent_name', 'Carmen Ruiz'); await pg.type('#parent_phone', '813 555 0321'); await pg.click('#parent_consent'); await pg.click('#send');
      await pg.waitForFunction(() => !document.getElementById('done').hidden, { timeout: 5000 }).catch(() => {});
      const saved = rows.find((c) => c.email === 'sofia' + w + '@example.com');
      ok(!(await pg.$eval('#done', (e) => e.hidden)) && saved && saved.tags.includes('minor') && /Carmen Ruiz, \+18135550321/.test(saved.notes), w + ' with the parent it saves and says thank you', saved && saved.notes);
      const m2 = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      ok(m2.sw <= m2.cw + 1, w + ' no sideways scroll');
      await pg.goto(base + 'signup/', { waitUntil: 'networkidle2' });
      const small = await pg.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not(#website),button')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.height < 44 || (e.tagName === 'INPUT' && parseFloat(getComputedStyle(e).fontSize) < 16)); }).map((e) => e.id || e.className));
      ok(small.length === 0, w + ' every field is 44px tall with 16px type (no iPhone zoom)', small.join(','));
      ok(errs.length === 0, w + ' no page errors', errs.join(';'));

      await pg.goto(base + 'keynote/#12', { waitUntil: 'networkidle2' });
      const s12 = await pg.evaluate(() => { const s = document.querySelector('.slide.on'), f = s.querySelector('iframe'), b = f.getBoundingClientRect(), h = s.querySelector('h1').getBoundingClientRect(), pr = document.getElementById('progress').getBoundingClientRect(), t = document.getElementById('tbar').getBoundingClientRect(); return { src: f.getAttribute('src'), w: b.width, h: b.height, bottom: b.bottom, pr: pr.top, right: b.right, vw: innerWidth, htop: h.top, tb: t.bottom }; });
      ok(/ringlypro-architect-factory\.html\?embed=stage/.test(s12.src || '') && s12.w > 200 && Math.abs(s12.w / s12.h - 12 / 7) < 0.05, w + ' slide 12 shows the animated diagram at its own shape', JSON.stringify(s12));
      if (w > 800) ok(s12.bottom <= s12.pr + 1 && s12.right <= s12.vw && s12.htop >= s12.tb, w + ' and it fits between the time bar and the section strip', JSON.stringify(s12));
      const lazy = await pg.evaluate(() => document.querySelectorAll('.slide:not(.on) iframe[src]').length);
      ok(lazy === 0, w + ' the diagram is not loaded on any other slide');
      await pg.goto(base + 'keynote/#22', { waitUntil: 'networkidle2' }); await pg.reload({ waitUntil: 'networkidle2' });
      const s22 = await pg.evaluate(() => { const s = document.querySelector('.slide.on'); const img = s.querySelector('img'); let maxB = 0; s.querySelectorAll('h1,.body,.visual,.visual *').forEach((e) => { const b = e.getBoundingClientRect(); if (b.width && b.height) maxB = Math.max(maxB, b.bottom); }); return { t: s.querySelector('h1').innerText, img: img.getAttribute('src'), ok: img.naturalWidth > 0, url: s.querySelector('.v-url').textContent, maxB, pr: document.getElementById('progress').getBoundingClientRect().top, htop: s.querySelector('h1').getBoundingClientRect().top, tb: document.getElementById('tbar').getBoundingClientRect().bottom }; });
      ok(/Visionarium/.test(s22.t) && /qr-signup\.svg/.test(s22.img) && s22.ok && /conference\/signup$/.test(s22.url), w + ' the last slide invites to Visionarium with the sign-up QR and address', JSON.stringify(s22));
      if (w > 800) ok(s22.maxB <= s22.pr + 1 && s22.htop >= s22.tb, w + ' and it fits on the screen', JSON.stringify(s22));
      await pg.close();
    }
    await br.close();
  }

  srv.close();
  console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
