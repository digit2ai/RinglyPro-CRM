#!/usr/bin/env node
/* PACC-CFL — PWA + mobile acceptance.
 *
 *   node scripts/test-pacccfl-pwa.js
 *
 * Zero external keys. The browser half is skipped LOUDLY if puppeteer is not
 * installed, so a green run always says what it could not cover.
 *
 * It tests the things that actually went wrong building this, not the happy
 * path: two CSS rules that parsed fine and applied nothing because of source
 * order and specificity, and a burger button whose X came apart when its
 * layout changed. Each of those measured as a failure and was invisible in the
 * source.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DIR = path.join(__dirname, '..', 'public', 'pacccfl');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const swRaw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
// Strip comments before grepping: sw.js EXPLAINS why addAll is wrong and names
// it three times, so a grep over the raw text fails on the very comment that
// documents the rule.
const sw = swRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.webmanifest'), 'utf8'));

let pass = 0; const failures = [];
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { failures.push({ name, err: e.message }); console.log('FAIL  ' + name + '\n      ' + e.message); }
}

(async () => {
  console.log('\nPACC-CFL — PWA + mobile\n' + '='.repeat(64));

  // ── the manifest ────────────────────────────────────────────────────────
  await t('MANIFEST: scope and start_url keep the trailing slash', () => {
    // Scope matches by PATH PREFIX, so "/pacccfl" (no slash) resolves outside
    // "/pacccfl/" and the installed app opens in a browser tab instead.
    assert.strictEqual(manifest.scope, '/pacccfl/');
    assert.strictEqual(manifest.start_url, '/pacccfl/');
    assert.strictEqual(manifest.id, '/pacccfl/', 'a stable id, or a later start_url change orphans installs');
    assert.strictEqual(manifest.display, 'standalone');
  });

  await t('MANIFEST: every icon exists on disk and a maskable one is declared', () => {
    assert.ok(manifest.icons.length >= 2);
    for (const i of manifest.icons) {
      assert.ok(i.src.startsWith('/pacccfl/'), 'icons are served from this app: ' + i.src);
      assert.ok(fs.existsSync(path.join(DIR, i.src.replace('/pacccfl/', ''))), 'missing icon file: ' + i.src);
    }
    assert.ok(manifest.icons.some((i) => String(i.purpose).includes('maskable')),
      'Android crops to a circle; without a maskable icon the mark gets clipped');
    assert.ok(manifest.icons.some((i) => i.sizes === '512x512'), 'a 512 is required for the install UI');
  });

  // ── the service worker ──────────────────────────────────────────────────
  await t('SW: never caches the API', () => {
    assert.ok(/\/api\//.test(sw) && /includes\('\/api\/'\)/.test(sw),
      'a directory showing yesterday’s members from cache is worse than an error');
  });

  await t('SW: caches shell entries individually, never addAll', () => {
    // addAll is atomic: one 404 rejects the install and leaves the page with
    // NO worker at all, silently.
    assert.ok(!/addAll/.test(sw), 'addAll must not be used');
    assert.ok(/SHELL\.map/.test(sw), 'the shell is added entry by entry');
  });

  await t('SW: answers only for this app, and only same-origin', () => {
    assert.ok(/url\.origin !== self\.location\.origin/.test(sw), 'cross-origin requests pass through');
    assert.ok(/startsWith\('\/pacccfl\/'\)/.test(sw),
      'the worker shares an origin with the whole CRM and must not answer for it');
  });

  await t('SW: navigations are network-first', () => {
    // Asserted on the comment-stripped source, so it cannot be satisfied by a
    // comment that merely claims the policy.
    assert.ok(/fetch\(req\)[\s\S]{0,400}\.catch\(\(\) => caches\.match/.test(sw),
      'navigations must try the network first and fall back to the cache');
    assert.ok(/offline\.html/.test(sw), 'with offline.html as the last resort');
    assert.ok(fs.existsSync(path.join(DIR, 'offline.html')), 'the last-resort page exists');
  });

  // ── the page ────────────────────────────────────────────────────────────
  await t('PAGE: declares the manifest, theme colour and iOS icon', () => {
    assert.ok(/<link rel="manifest" href="\/pacccfl\/manifest\.webmanifest">/.test(html));
    assert.ok(/<meta name="theme-color" content="#14245f">/.test(html));
    assert.ok(/rel="apple-touch-icon"/.test(html), 'iOS has no manifest icon support');
    assert.ok(/viewport-fit=cover/.test(html),
      'standalone has no browser chrome to absorb the safe-area insets');
  });

  await t('PAGE: no asset is hotlinked from another host’s CDN', () => {
    // The nav mark used to come from GoHighLevel's CDN: a dependency on
    // someone else keeping a file at a URL, and 1.6MB for a 40px slot.
    const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    for (const s of srcs) {
      assert.ok(!/^https?:\/\//.test(s), 'hotlinked image: ' + s);
    }
    assert.ok(fs.existsSync(path.join(DIR, 'pacc-seal.png')), 'the mark is served by us');
  });

  await t('PAGE: the service worker is registered ONLY at the top level', () => {
    // digit2ai.com/pacc-cfl frames this page. Registering inside a
    // third-party frame is either refused or partitioned against the
    // embedding site, so it would report a worker that controls nothing.
    assert.ok(/window\.top !== window\.self/.test(html), 'the page detects being framed');
    assert.ok(/if \(!framed && 'serviceWorker' in navigator\)/.test(html),
      'registration must be guarded by that check');
  });

  await t('PAGE: framed, the install button breaks out instead of doing nothing', () => {
    // A browser only ever offers to install the TOP-LEVEL document, which on
    // digit2ai.com is GoHighLevel's and carries no manifest.
    const framedBranch = html.slice(html.indexOf('if (framed) {'), html.indexOf('var standalone'));
    assert.ok(/ORIGIN \+ APP/.test(framedBranch), 'it opens this app on its own origin');
    assert.ok(/Open the app/.test(framedBranch), 'and says so');
    assert.ok(/beforeinstallprompt/.test(html), 'the top-level path uses the real prompt');
    assert.ok(/Add to Home Screen/.test(html),
      'iOS Safari fires no prompt — the page must say how instead of showing a dead button');
  });

  // ── the signup QR in the Access section ─────────────────────────────────
  await t('QR: the card reuses the shared endpoint rather than a second image', () => {
    assert.ok(/src="\/api\/chamber-qr\/cv-2\.svg"/.test(html),
      'one endpoint, so this card and the chamber landing cannot drift apart');
    assert.ok(/id="joinQrCard"/.test(html));
    // A code on a page that is mostly read on a desktop needs a clickable
    // route too — there is no camera to point at the screen it is on.
    assert.ok(/<a href="https:\/\/www\.camaravirtual\.app\/cv-2\/signup-member"[^>]*>\s*<img src="\/api\/chamber-qr/.test(html),
      'the image is wrapped in a link to the same destination it encodes');
    assert.ok(/onerror=/.test(html.slice(html.indexOf('joinQrCard'), html.indexOf('joinQrCard') + 900)),
      'a failed image hides the card instead of leaving a broken frame');
  });

  await t('QR: all three languages, or it reads English on the Spanish page', () => {
    const card = html.slice(html.indexOf('id="joinQrCard"'), html.indexOf('id="joinQrCard"') + 1400);
    for (const attr of ['data-en', 'data-es', 'data-tl']) {
      assert.ok(new RegExp(attr + '="[^"]+"').test(card), 'the caption needs ' + attr);
    }
  });

  await t('QR: the endpoint never encodes the CRM\u2019s own host', () => {
    // A scanned or printed code must carry a public, branded address. The
    // allowlist used to include aiagent.ringlypro.com, which serves this very
    // page, so the code encoded the internal host beside a Join button
    // pointing at the branded domain.
    const appjs = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
    const set = appjs.slice(appjs.indexOf('const CHAMBER_QR_HOSTS'), appjs.indexOf('const CHAMBER_QR_HOSTS') + 400);
    assert.ok(!/aiagent\.ringlypro\.com/.test(set),
      'the CRM host must not be in the QR host allowlist');
    assert.ok(/camaravirtual\.app/.test(set), 'the chamber brand domains stay');
    // And the target is still built from the slug, never from a caller.
    const route = appjs.slice(appjs.indexOf("app.get('/api/chamber-qr/"), appjs.indexOf("app.get('/api/chamber-qr/") + 1800);
    assert.ok(!/req\.query/.test(route),
      'encoding caller-supplied text would make this an open QR generator');
  });

  // ── the two traps this build actually hit ───────────────────────────────
  await t('CSS: the simulator overrides come AFTER its stylesheet', () => {
    // Same specificity as demo.css's own rules, so SOURCE ORDER decides and a
    // media query adds none. Placed above the link they parsed fine and
    // changed nothing — a failure only a measurement could see.
    const link = html.indexOf('<link rel="stylesheet" href="/pacccfl/demo/demo.css">');
    const override = html.indexOf('.vc-tab { min-height: 44px');
    assert.ok(link > 0 && override > 0, 'both are present');
    assert.ok(override > link, 'the overrides must come after the stylesheet they override');
  });

  await t('CSS: the badge rule is qualified the way the simulator qualifies it', () => {
    // demo.css writes `.vc-nav .vc-badge-n` (0,2,0); a bare `.vc-badge-n`
    // (0,1,0) loses however late it appears.
    assert.ok(/\.vc-nav \.vc-badge-n/.test(html),
      'a bare .vc-badge-n cannot beat .vc-nav .vc-badge-n');
  });

  await t('CSS: the burger keeps its block flow, so the X still closes', () => {
    // The three bars are block-level with collapsing margins and the open
    // state makes an X with rotate(45deg) translate(5px,5px) — values that
    // assume exactly that flow. Centring them with flex renders a chevron.
    const rule = (html.match(/\.mobile-menu-btn \{[^}]*\}/g) || []).join(' ');
    assert.ok(/padding: 9px/.test(rule), 'it reaches 44px by padding');
    assert.ok(!/display: *flex/.test(rule), 'flex stops the margins collapsing and breaks the X');
  });

  // ── live, in a browser ──────────────────────────────────────────────────
  let puppeteer = null;
  try { puppeteer = require('puppeteer'); } catch (e) { puppeteer = null; }

  if (!puppeteer) {
    console.log('\n  SKIPPED (puppeteer not installed): touch-target sizes, horizontal');
    console.log('  overflow, and that the worker actually registers and controls the page.');
    console.log('  Those are measurements — the assertions above cannot replace them.\n');
  } else {
    const express = require('express');
    const app = express();
    app.use(express.static(path.join(__dirname, '..', 'public')));
    const srv = app.listen(0);
    const base = 'http://127.0.0.1:' + srv.address().port;
    const br = await puppeteer.launch({ args: ['--no-sandbox'] });
    try {
      await t('LIVE: no horizontal overflow and no target under 44px on a phone', async () => {
        for (const w of [360, 390, 414, 768]) {
          const pg = await br.newPage();
          await pg.setViewport({ width: w, height: 820, deviceScaleFactor: 2, isMobile: w < 768, hasTouch: w < 768 });
          await pg.goto(base + '/pacccfl/', { waitUntil: 'networkidle2' });
          // open the drawer, or its links are never measured
          await pg.evaluate(() => { const b = document.querySelector('.mobile-menu-btn'); if (b) b.click(); });
          await new Promise((r) => setTimeout(r, 350));
          const r = await pg.evaluate(() => {
            const small = [];
            document.querySelectorAll('a,button,input,select,textarea').forEach((el) => {
              const b = el.getBoundingClientRect();
              if (b.width > 0 && b.height > 0 && (b.height < 44 || b.width < 44)) {
                small.push((el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 18)
                  + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
              }
            });
            return { overflow: document.documentElement.scrollWidth - window.innerWidth, small };
          });
          await pg.close();
          assert.strictEqual(r.overflow, 0, w + 'px: the page scrolls sideways by ' + r.overflow + 'px');
          assert.deepStrictEqual(r.small, [], w + 'px: targets under 44px: ' + r.small.join(', '));
        }
      });

      await t('LIVE: the worker registers, activates and controls the page', async () => {
        const pg = await br.newPage();
        await pg.goto(base + '/pacccfl/', { waitUntil: 'networkidle2' });
        await new Promise((r) => setTimeout(r, 2500));
        const r = await pg.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration('/pacccfl/');
          return { active: !!(reg && reg.active), scope: reg && reg.scope,
                   controlled: !!navigator.serviceWorker.controller };
        });
        await pg.close();
        assert.ok(r.active, 'the worker never activated');
        assert.ok(/\/pacccfl\/$/.test(r.scope || ''), 'scope must be /pacccfl/, got ' + r.scope);
        assert.ok(r.controlled, 'the worker is not controlling the page');
      });

      await t('LIVE: inside a frame it registers NOTHING and offers the breakout', async () => {
        // A clean profile: a registration from an earlier top-level visit is
        // returned to the frame too, and reads as the guard having worked
        // when it did not.
        const fresh = await puppeteer.launch({ args: ['--no-sandbox'],
          userDataDir: path.join(require('os').tmpdir(), 'pacc-sit-' + Date.now()) });
        try {
          const stub = express();
          stub.use(express.static(path.join(__dirname, '..', 'public')));
          stub.get('/stub', (req, res) => res.type('html').send(
            '<style>html,body{margin:0;height:100%}iframe{width:100%;height:100dvh;border:0}</style>'
            + '<iframe src="/pacccfl/"></iframe>'));
          const s2 = stub.listen(0);
          const b2 = 'http://127.0.0.1:' + s2.address().port;
          const pg = await fresh.newPage();
          await pg.goto(b2 + '/stub', { waitUntil: 'networkidle2' });
          await new Promise((r) => setTimeout(r, 3000));
          const fr = pg.frames().find((f) => f.url().includes('/pacccfl/'));
          const r = await fr.evaluate(async () => ({
            regs: (await navigator.serviceWorker.getRegistrations()).length,
            act: (document.getElementById('pwaAct') || {}).textContent,
          }));
          s2.close();
          assert.strictEqual(r.regs, 0, 'a framed page must register no worker');
          assert.strictEqual(r.act, 'Open the app', 'the framed offer must be the breakout');
        } finally { await fresh.close(); }
      });
    } finally { await br.close(); srv.close(); }
  }

  console.log('\n' + '='.repeat(64));
  console.log('  ' + pass + '/' + (pass + failures.length) + ' passed');
  if (failures.length) {
    console.log('\n  FAILURES:');
    failures.forEach((f) => console.log('   - ' + f.name + ': ' + f.err));
  }
  console.log('='.repeat(64) + '\n');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(1); });
