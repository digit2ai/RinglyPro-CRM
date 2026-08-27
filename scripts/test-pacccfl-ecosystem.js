#!/usr/bin/env node
'use strict';
// SIT for the narrated ecosystem walkthrough at /pacccfl/ecosystem/.
// Runs the real page against a local static server, with the TTS endpoint
// stubbed so the suite needs no network and no keys.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg' };
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };

// A 0.4s silent MP3 stands in for /api/tts/edge.
const SILENT = Buffer.from(
  '//uQZAAAAAAAaQAAAAAAAA0gAAAAAAABpAAAAAAADSAAAAAAAGkAAAAAAAANIAAAAAAAaQAAAAAAA0gAAAAA', 'base64');

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/tts/edge') {
    let n = 0; req.on('data', c => n += c.length);
    req.on('end', () => { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); res.end(SILENT); });
    return;
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 950 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const ttsCalls = [];
  page.on('request', r => { if (r.url().includes('/api/tts/edge')) ttsCalls.push(r.postData() || ''); });

  const txt = s => page.$eval(s, e => e.textContent.trim());
  const tap = async s => { await page.$eval(s, e => e.click()); await new Promise(r => setTimeout(r, 260)); };

  await page.goto(base + '/pacccfl/ecosystem/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 700));

  // ═══ structure ═══
  ok(await page.$('#cover') !== null, 'cover / start screen renders');
  ok(await page.evaluate(() => window.PACCDeck.slides) === 16, 'walkthrough has 16 steps');
  ok(await page.$$eval('#dots button', n => n.length) === 16, 'one dot per step');
  ok(await page.$('#vcApp') !== null, 'the live simulator is embedded, not screenshots');

  // every slide carries a title, subtitle and narration in all three languages
  const gaps = await page.evaluate(() => {
    const out = [];
    window.PACCDeck.table.forEach((s, i) => {
      ['en', 'es', 'tl'].forEach(l => {
        if (!s.t[l]) out.push(`slide ${i + 1} title.${l}`);
        if (!s.s[l]) out.push(`slide ${i + 1} sub.${l}`);
        if (!s.n[l] || s.n[l].length < 60) out.push(`slide ${i + 1} narration.${l}`);
      });
    });
    return out;
  });
  ok(gaps.length === 0, 'all 16 slides carry EN/ES/TL title, subtitle and narration' + (gaps.length ? ': ' + gaps.slice(0, 4).join(', ') : ''));

  // rough runtime, so nobody is surprised by a 20-minute "7 minute" deck
  const words = await page.evaluate(() =>
    window.PACCDeck.table.reduce((n, s) => n + s.n.en.split(/\s+/).length, 0));
  const mins = words / 150;
  ok(mins > 4 && mins < 11, `English narration runs about ${mins.toFixed(1)} min (${words} words)`);

  // ═══ start and walk ═══
  await tap('#start');
  await new Promise(r => setTimeout(r, 900));
  ok((await txt('#stepPill')).indexOf('1') !== -1, 'starts at step 1: ' + await txt('#stepPill'));
  ok((await txt('#narr')).length > 60, 'narration text is shown on screen');
  ok(ttsCalls.length >= 1, 'narration was requested from the TTS endpoint');
  ok(/"voice":"ava"/.test(ttsCalls[0]), 'English uses the Ava voice: ' + (ttsCalls[0] || '').slice(0, 60));

  // step 3 is the dashboard — the simulator must actually be on it
  await tap('#next'); await tap('#next');
  await new Promise(r => setTimeout(r, 600));
  ok((await txt('#count')) === '3 / 16', 'advanced to step 3: ' + await txt('#count'));
  ok((await txt('.vc-head h3')) === 'Dashboard', 'simulator is showing the Dashboard');
  ok((await txt('.vc-kpi b')) === '1,247', 'dashboard shows the 1,247-member network');

  // jump to the AI matching step and confirm it auto-runs a real ranking
  await page.evaluate(() => window.PACCDeck.go(6));
  await new Promise(r => setTimeout(r, 1600));
  ok((await txt('.vc-head h3')) === 'AI Matching', 'step 7 drives the simulator to AI Matching');
  const scores = await page.$$eval('.vc-score', n => n.map(e => parseInt(e.textContent, 10)));
  ok(scores.length >= 4, 'the ranking actually ran: ' + scores.join(','));
  ok(await page.$$eval('.vc-pill.gold', n => n.length) >= 1, 'the Gini equity slots are visible on that step');

  // projects / exchange / admin steps land on the right screens
  const checks = [[8, 'Projects'], [10, 'Exchange'], [14, 'Admin']];
  for (const [i, want] of checks) {
    await page.evaluate(n => window.PACCDeck.go(n), i);
    await new Promise(r => setTimeout(r, 500));
    ok((await txt('.vc-head h3')) === want, `step ${i + 1} shows ${want}`);
  }

  // intro / login / outro render panels instead of the app
  for (const [i, sel] of [[0, '.panel'], [1, '.login-card'], [15, '.panel .cta']]) {
    await page.evaluate(n => window.PACCDeck.go(n), i);
    await new Promise(r => setTimeout(r, 400));
    ok(await page.$(sel) !== null, `step ${i + 1} renders its own panel (${sel})`);
  }

  // ═══ language ═══
  ttsCalls.length = 0;
  await page.evaluate(() => window.PACCDeck.go(2));
  await tap('.lang-opt[data-lang="es"]');
  await new Promise(r => setTimeout(r, 800));
  ok((await txt('#slideTitle')) === 'El panel de control', 'ES slide title: ' + await txt('#slideTitle'));
  ok((await txt('.vc-head h3')) === 'Panel', 'ES drives the simulator too: ' + await txt('.vc-head h3'));
  ok(ttsCalls.some(c => /Paloma/.test(c)), 'ES narration uses the Spanish voice');

  ttsCalls.length = 0;
  await tap('.lang-opt[data-lang="tl"]');
  await new Promise(r => setTimeout(r, 800));
  ok((await txt('#slideTitle')) === 'Ang dashboard', 'TL slide title: ' + await txt('#slideTitle'));
  ok(ttsCalls.some(c => /Blessica/.test(c)), 'TL narration uses the Filipino voice, not the Spanish fallback');

  await tap('.lang-opt[data-lang="en"]');
  await new Promise(r => setTimeout(r, 500));
  ok((await txt('#slideTitle')) === 'The dashboard', 'back to EN');

  // ═══ deep link ═══
  await page.goto(base + '/pacccfl/ecosystem/?lang=es&step=7', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 700));
  ok((await txt('#count')) === '7 / 16', '?step=7 deep link lands on step 7');
  ok((await txt('#slideTitle')) === 'Matching con IA', '?lang=es opens in Spanish: ' + await txt('#slideTitle'));

  ok(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

  await browser.close(); server.close();
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
