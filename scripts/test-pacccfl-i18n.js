#!/usr/bin/env node
'use strict';
// SIT for the PACC-CFL trilingual page: EN / ES / TL text + language-aware voice.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.mp3': 'audio/mpeg', '.js': 'text/javascript', '.css': 'text/css' };

let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // Record every audio file the page requests.
  const audioHits = [];
  page.on('request', r => { if (/\.mp3$/.test(r.url())) audioHits.push(r.url()); });

  await page.goto(base + '/pacccfl/', { waitUntil: 'networkidle0' });

  const h1 = () => page.$eval('.hero h1', e => e.textContent.trim());
  const nav1 = () => page.$eval('.header-nav a', e => e.textContent.trim());
  const htmlLang = () => page.evaluate(() => document.documentElement.lang);
  const active = () => page.$eval('.lang-opt[aria-pressed="true"]', e => e.getAttribute('data-lang'));

  // ── default English ──
  ok((await h1()).startsWith('Business,'), 'default loads English: ' + (await h1()));
  ok(await active() === 'en', 'EN button is the active one');
  ok(await htmlLang() === 'en', 'html lang=en');

  // ── Spanish ──
  await page.click('.lang-opt[data-lang="es"]');
  ok((await h1()).startsWith('Negocios,'), 'ES h1: ' + (await h1()));
  ok(await nav1() === 'Ecosistema', 'ES nav: ' + (await nav1()));
  ok(await active() === 'es', 'ES button active');
  ok(await htmlLang() === 'es', 'html lang=es');
  ok(await page.$eval('#orbCap', e => e.textContent) === 'Escucha a Lina', 'ES orb caption');
  ok(await page.$eval('.section-title', e => e.textContent) === 'El Ecosistema Digital', 'ES section title');
  ok(await page.$eval('#access .btn-gold', e => e.textContent) === 'Únete a PACC-CFL', 'ES accented CTA renders: ' + await page.$eval('#access .btn-gold', e => e.textContent));

  // ── Tagalog ──
  await page.click('.lang-opt[data-lang="tl"]');
  ok((await h1()).startsWith('Negosyo,'), 'TL h1: ' + (await h1()));
  ok(await nav1() === 'Ekosistema', 'TL nav: ' + (await nav1()));
  ok(await htmlLang() === 'tl', 'html lang=tl');
  ok(await page.$eval('#orbCap', e => e.textContent) === 'Makinig kay Lina', 'TL orb caption');

  // ── back to English ──
  await page.click('.lang-opt[data-lang="en"]');
  ok((await h1()).startsWith('Business,'), 'back to EN h1');
  ok(await page.$eval('.section-title', e => e.textContent) === 'The Digital Ecosystem', 'back to EN section title');

  // ── inline <em>/<b> markup survives translation ──
  ok(await page.$('.hero h1 em') !== null, 'hero <em> preserved after 4 switches');
  ok(await page.$$eval('.wf-chip b', n => n.length) === 4, 'all 4 <b> chips preserved');

  // ── persistence + ?lang= ──
  const stored = await page.evaluate(() => localStorage.getItem('pacccfl_lang'));
  ok(stored === 'en', 'choice persisted to localStorage: ' + stored);
  await page.goto(base + '/pacccfl/?lang=es', { waitUntil: 'networkidle0' });
  ok((await h1()).startsWith('Negocios,'), '?lang=es honored on load');
  await page.goto(base + '/pacccfl/', { waitUntil: 'networkidle0' });
  ok((await h1()).startsWith('Negocios,'), 'stored language survives a reload');

  // ── VOICE follows the language ──
  await page.goto(base + '/pacccfl/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.setLang('en'));
  audioHits.length = 0;
  await page.click('#orbBtn');
  await new Promise(r => setTimeout(r, 900));
  ok(audioHits.some(u => /\/pacccfl\/audio\/lina-1\.mp3$/.test(u)), 'EN tour plays English narration: ' + audioHits.join(','));

  audioHits.length = 0;
  await page.click('.lang-opt[data-lang="es"]');
  await new Promise(r => setTimeout(r, 900));
  ok(audioHits.some(u => /\/audio\/es\/lina-1\.mp3$/.test(u)), 'switching to ES mid-tour reloads Spanish narration: ' + audioHits.join(','));
  ok(await page.$eval('#linaBarSec', e => e.textContent) === 'Sección 1 de 7', 'ES player chrome: ' + await page.$eval('#linaBarSec', e => e.textContent));

  audioHits.length = 0;
  await page.click('.lang-opt[data-lang="tl"]');
  await new Promise(r => setTimeout(r, 900));
  ok(audioHits.some(u => /\/audio\/tl\/lina-1\.mp3$/.test(u)), 'switching to TL mid-tour reloads Tagalog narration: ' + audioHits.join(','));
  ok(await page.$eval('#linaBarSec', e => e.textContent) === 'Bahagi 1 ng 7', 'TL player chrome');
  ok(await page.evaluate(() => !document.getElementById('linaBar').classList.contains('paused')), 'still playing after the language swap');

  // pause label localized
  await page.click('#linaBarPause');
  ok(await page.$eval('#linaBarPause', e => e.textContent) === 'Ituloy', 'TL resume label: ' + await page.$eval('#linaBarPause', e => e.textContent));

  // ── all 21 narration files reachable over HTTP ──
  const codes = await page.evaluate(async (b) => {
    const out = [];
    for (const d of ['', 'es/', 'tl/']) for (let i = 1; i <= 7; i++) {
      const r = await fetch(b + '/pacccfl/audio/' + d + 'lina-' + i + '.mp3', { method: 'HEAD' });
      out.push(r.status);
    }
    return out;
  }, base);
  ok(codes.length === 21 && codes.every(c => c === 200), '21/21 narration files serve 200 (got ' + [...new Set(codes)].join(',') + ')');

  ok(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

  await browser.close();
  server.close();
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
