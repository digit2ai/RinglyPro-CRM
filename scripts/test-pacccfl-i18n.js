#!/usr/bin/env node
'use strict';
// SIT for the PACC-CFL landing page: EN / ES / TL copy, language-aware voice
// tour, and the embedded live app simulator.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.mp3': 'audio/mpeg', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

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

  const audioHits = [];
  page.on('request', r => { if (/\.mp3$/.test(r.url())) audioHits.push(r.url()); });

  await page.goto(base + '/pacccfl/', { waitUntil: 'networkidle0' });

  const h1 = () => page.$eval('.hero h1', e => e.textContent.trim());
  const nav1 = () => page.$eval('.header-nav a', e => e.textContent.trim());
  const htmlLang = () => page.evaluate(() => document.documentElement.lang);
  const active = () => page.$eval('.lang-opt[aria-pressed="true"]', e => e.getAttribute('data-lang'));
  const tap = async s => { await page.$eval(s, e => e.click()); await new Promise(r => setTimeout(r, 90)); };


  // ═══ page copy ═══
  ok((await h1()).startsWith('Business,'), 'default loads English: ' + (await h1()));
  ok(await active() === 'en', 'EN button is the active one');
  ok(await htmlLang() === 'en', 'html lang=en');

  await tap('.lang-opt[data-lang="es"]');
  ok((await h1()).startsWith('Negocios,'), 'ES h1: ' + (await h1()));
  ok(await nav1() === 'Ecosistema', 'ES nav: ' + (await nav1()));
  ok(await htmlLang() === 'es', 'html lang=es');
  ok(await page.$eval('#orbCap', e => e.textContent) === 'Escucha a Lina', 'ES orb caption');
  ok(await page.$eval('#access .btn-gold', e => e.textContent) === 'Únete a PACC-CFL', 'ES accented CTA renders');

  await tap('.lang-opt[data-lang="tl"]');
  ok((await h1()).startsWith('Negosyo,'), 'TL h1: ' + (await h1()));
  ok(await nav1() === 'Ekosistema', 'TL nav: ' + (await nav1()));
  ok(await htmlLang() === 'tl', 'html lang=tl');

  await tap('.lang-opt[data-lang="en"]');
  ok((await h1()).startsWith('Business,'), 'back to EN h1');
  ok(await page.$('.hero h1 em') !== null, 'hero <em> preserved after 4 switches');
  ok(await page.$$eval('.wf-chip b', n => n.length) === 4, 'all 4 <b> chips preserved');

  // ═══ the live app simulator ═══
  const $ = (s, f) => page.$eval(s, f);
  const txt = s => page.$eval(s, e => e.textContent.trim());
  const count = s => page.$$eval(s, n => n.length);

  const navItems = await page.$$eval('.header-nav a', n => n.map(e => e.textContent.trim()));
  ok(navItems.filter(x => /Live Demo|Demo en Vivo|Live na Demo/.test(x)).length === 1,
     'header nav links the demo exactly once: ' + navItems.join(' | '));
  ok(await page.$$eval('.footer-col a[href="#demo"]', n => n.length) === 1, 'footer links the demo too');
  ok(await page.$('.hero a[href="#demo"]') !== null, 'hero carries a button straight to the demo');
  ok(await page.$('#vcApp') !== null, 'simulator mounted in the page');
  ok(await count('.vc-nav button') === 13, 'sidebar has 13 modules (got ' + await count('.vc-nav button') + ')');
  ok((await txt('.vc-head h3')) === 'Dashboard', 'opens on the Dashboard');
  const kpi = await $('.vc-kpi b', e => e.textContent);
  ok(kpi === '1,247', 'dashboard shows 1,247 active members (got ' + kpi + ')');
  ok(await count('.vc-bar') >= 9, 'region + tier bars render');

  // sample data really is 1,247 rows and the totals reconcile
  const data = await page.evaluate(() => {
    const M = window.PACC_DEMO.MEMBERS;
    const byR = {}, byT = {};
    M.forEach(m => { byR[m.region] = (byR[m.region] || 0) + 1; byT[m.tier] = (byT[m.tier] || 0) + 1; });
    return { n: M.length, byR, byT, regions: window.PACC_DEMO.REGIONS.map(r => [r.id, r.n]), tiers: window.PACC_DEMO.TIERS.map(r => [r.id, r.n]) };
  });
  ok(data.n === 1247, 'dataset holds 1,247 members');
  ok(data.regions.every(([id, n]) => data.byR[id] === n), 'per-region counts match the dashboard chart exactly');
  ok(data.tiers.every(([id, n]) => data.byT[id] === n), 'per-tier counts match the distribution chart exactly');

  // no real person from the live chamber leaked into the public demo
  const REAL = ['Stacy Barnes', 'Ralph Proctor', 'Abby Hamilton', 'Reshekia Fraley', 'Johnny Ruiz',
                'Seth Brock Billen', 'Aline Yap', 'Espaldon', 'Gilbert Hamdan', 'Tess Gallup', 'Bouffard'];
  const leaked = await page.evaluate(names => {
    const blob = JSON.stringify(window.PACC_DEMO);
    return names.filter(n => blob.includes(n));
  }, REAL);
  ok(leaked.length === 0, 'no real chamber member appears in the sample data' + (leaked.length ? ': ' + leaked.join(', ') : ''));
  const emails = await page.evaluate(() => window.PACC_DEMO.MEMBERS.every(m => /\.test$/.test(m.email)));
  ok(emails, 'every sample email is on a reserved .test domain');

  // directory: search, filter, paginate
  await tap('.vc-nav button[data-v="directory"]');
  ok((await txt('.vc-head h3')) === 'Directory', 'navigates to Directory');
  ok(await count('.vc-mc') === 6, 'directory shows a page of 6 member cards');
  ok((await txt('.vc-count')).includes('1,247'), 'directory reports the full 1,247: ' + await txt('.vc-count'));
  await page.select('#vcDirSector', 'salud');
  await tap('[data-act="dirSearch"]');
  const filtered = await txt('.vc-count');
  const n1 = +filtered.replace(/,/g, '').match(/of (\d+)/)[1];
  ok(n1 > 0 && n1 < 1247, 'sector filter narrows the directory to ' + n1);
  const firstBefore = await txt('.vc-mc h5');
  await tap('[data-act="dirNext"]');
  ok(await txt('.vc-mc h5') !== firstBefore, 'pagination advances to different members');

  // AI matching actually ranks
  await tap('.vc-nav button[data-v="matching"]');
  await tap('[data-act="example"]');
  await tap('[data-act="runMatch"]');
  await new Promise(r => setTimeout(r, 1400));
  const cards = await count('.vc-score');
  ok(cards >= 4, 'AI matching returned ' + cards + ' ranked candidates');
  const scores = await page.$$eval('.vc-score', n => n.map(e => parseInt(e.textContent, 10)));
  ok(scores.slice(0, 4).every((s, i, a) => i === 0 || a[i - 1] >= s), 'top results are sorted by score: ' + scores.join(','));
  ok(await count('.vc-pill.gold') >= 1, 'Gini equity slots are labelled in the results');
  ok((await txt('.vc-note')).toLowerCase().includes('gini'), 'the equity correction is explained on screen');

  // projects, exchange, admin
  await tap('.vc-nav button[data-v="projects"]');
  const allProjects = await count('.vc-mc');
  await tap('[data-act="projTab"][data-v="grade"]');
  const graded = await count('.vc-mc');
  ok(graded > 0 && graded < allProjects, 'Investment Grade tab filters ' + allProjects + ' projects to ' + graded);

  await tap('.vc-nav button[data-v="exchange"]');
  await tap('[data-act="xchTab"][data-v="rfqs"]');
  ok(await count('.vc-card') >= 4, 'Exchange lists open RFQs');

  await tap('.vc-nav button[data-v="admin"]');
  ok(await count('.vc-t tbody tr') === 8, 'admin table paginates at 8 rows');
  await page.$eval('#vcAdmQ', e => { e.value = 'Rivera'; });
  await tap('[data-act="admSearch"]');
  const admN = await txt('.vc-count');
  ok(/of \d/.test(admN) && !admN.includes('1,247'), 'admin search narrows the roster: ' + admN);

  // the simulator follows the page language
  await tap('.lang-opt[data-lang="es"]');
  ok((await txt('.vc-nav button.on span')) === 'Admin', 'ES: active nav label');
  await tap('.vc-nav button[data-v="directory"]');
  ok((await txt('.vc-head h3')) === 'Directorio', 'ES simulator screen title: ' + await txt('.vc-head h3'));
  ok((await page.$eval('#vcDirQ', e => e.placeholder)).startsWith('Buscar'), 'ES simulator placeholder');
  ok((await txt('.vc-demo-tag')) === 'Demo · datos de muestra', 'ES demo label: ' + await txt('.vc-demo-tag'));

  await tap('.lang-opt[data-lang="tl"]');
  ok((await txt('.vc-head h3')) === 'Direktoryo', 'TL simulator screen title: ' + await txt('.vc-head h3'));
  await tap('.lang-opt[data-lang="en"]');
  ok((await txt('.vc-head h3')) === 'Directory', 'back to EN simulator title');

  // the demo is labelled as a demonstration, in every language
  for (const [l, want] of [['en', 'sample data'], ['es', 'datos de muestra'], ['tl', 'sample na datos']]) {
    await tap(`.lang-opt[data-lang="${l}"]`);
    const tag = await txt('.vc-demo-tag');
    const disc = await txt('#vcDisc');
    ok(tag.toLowerCase().includes(want) && disc.length > 30, `${l.toUpperCase()}: simulator is labelled a demo with sample data`);
  }
  await tap('.lang-opt[data-lang="en"]');

  // ═══ persistence + ?lang= ═══
  await page.goto(base + '/pacccfl/?lang=es', { waitUntil: 'networkidle0' });
  ok((await h1()).startsWith('Negocios,'), '?lang=es honored on load');
  ok((await txt('.vc-head h3')) === 'Panel', 'simulator boots in Spanish from ?lang=');

  // ═══ VOICE follows the language, across 8 sections ═══
  await page.goto(base + '/pacccfl/', { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.setLang('en'));
  const segs = await page.evaluate(() => document.body.innerHTML.match(/\{ n: \d, sec:/g).length);
  ok(segs === 8, 'the tour has 8 sections including the demo (got ' + segs + ')');
  ok(await page.$('#demo') !== null, 'the demo section the tour scrolls to exists');

  audioHits.length = 0;
  await tap('#orbBtn');
  await new Promise(r => setTimeout(r, 900));
  ok(audioHits.some(u => /\/audio\/en\/lina-1\.mp3$/.test(u)), 'EN tour plays the English narration: ' + audioHits.join(','));

  audioHits.length = 0;
  await tap('.lang-opt[data-lang="es"]');
  await new Promise(r => setTimeout(r, 900));
  ok(audioHits.some(u => /\/audio\/es\/lina-1\.mp3$/.test(u)), 'switching to ES mid-tour reloads Spanish narration');
  ok(await page.$eval('#linaBarSec', e => e.textContent) === 'Sección 1 de 8', 'ES player chrome counts 8: ' + await page.$eval('#linaBarSec', e => e.textContent));

  audioHits.length = 0;
  await tap('.lang-opt[data-lang="tl"]');
  await new Promise(r => setTimeout(r, 900));
  ok(audioHits.some(u => /\/audio\/tl\/lina-1\.mp3$/.test(u)), 'switching to TL mid-tour reloads Tagalog narration');
  ok(await page.$eval('#linaBarSec', e => e.textContent) === 'Bahagi 1 ng 8', 'TL player chrome counts 8');
  ok(await page.evaluate(() => !document.getElementById('linaBar').classList.contains('paused')), 'still playing after the language swap');

  // ═══ all 24 narration files reachable ═══
  const codes = await page.evaluate(async (b) => {
    const out = [];
    for (const d of ['en/', 'es/', 'tl/']) for (let i = 1; i <= 8; i++) {
      const r = await fetch(b + '/pacccfl/audio/' + d + 'lina-' + i + '.mp3', { method: 'HEAD' });
      out.push(r.status);
    }
    return out;
  }, base);
  ok(codes.length === 24 && codes.every(c => c === 200), '24/24 narration files serve 200 (got ' + [...new Set(codes)].join(',') + ')');

  ok(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

  await browser.close();
  server.close();
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
