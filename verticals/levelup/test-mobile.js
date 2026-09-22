'use strict';
/**
 * LevelUp — mobile + PWA, MEASURED in a real browser. `node verticals/levelup/test-mobile.js`
 *
 * The SIT can read the markup; only a browser settles what a rule WON, what a
 * control actually measures and whether the menu opens. Skips LOUDLY without
 * puppeteer rather than reporting a pass it did not earn.
 */
require('dotenv').config();
delete process.env.ANTHROPIC_API_KEY;
process.env.LEVELUP_SKIP_BOOT = '1';
process.env.NODE_ENV = 'test';

const express = require('express');
const http = require('http');
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) {
  console.log('SKIPPED LOUDLY: puppeteer is not installed, so nothing here was measured.');
  process.exit(0);
}

const BASE = '/levelupmediamarketing';
let pass = 0, fail = 0; const fails = [];
function ok(c, name) { if (c) pass++; else { fail++; fails.push(name); console.log('  FAIL', name); } }

(async () => {
  const app = express();
  app.use(BASE, require('./src/index'));
  app.use('/embed', express.static(require('path').join(__dirname, '..', '..', 'public', 'embed')));
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const url = 'http://127.0.0.1:' + server.address().port + BASE + '/';

  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    for (const w of [360, 390, 414]) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: 780, isMobile: true, hasTouch: true });
      await page.goto(url, { waitUntil: 'networkidle0' });

      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(over <= 1, w + ': no horizontal overflow (' + over + 'px)');

      // The burger is shown and the links are NOT, until it is tapped.
      let st = await page.evaluate(() => ({
        burger: getComputedStyle(document.getElementById('burger')).display,
        nav: getComputedStyle(document.getElementById('nav')).display
      }));
      ok(st.burger === 'flex', w + ': the burger is shown');
      ok(st.nav === 'none', w + ': the links are hidden until it is tapped');

      await page.click('#burger');
      st = await page.evaluate(() => {
        const n = document.getElementById('nav'), r = n.getBoundingClientRect();
        return { display: getComputedStyle(n).display, right: r.right, left: r.left,
                 expanded: document.getElementById('burger').getAttribute('aria-expanded'),
                 links: n.querySelectorAll('a').length };
      });
      ok(st.display === 'flex' && st.expanded === 'true', w + ': tapping it opens the menu');
      ok(st.left >= -1 && st.right <= w + 1, w + ': the open menu stays on screen');
      ok(st.links === 3, w + ': the menu carries every link from the one nav');

      // Every control in the open menu is a real target.
      const small = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('#nav a, #nav button, #burger, #install button').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width && r.height && (r.height < 44 || r.width < 44)) out.push(el.textContent.trim().slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        });
        return out;
      });
      ok(small.length === 0, w + ': no control under 44px' + (small.length ? ' — ' + small.join(', ') : ''));

      // The install bar must clear the voice orb AND actually receive the tap:
      // it shipped overlapping the orb, so Install could not be pressed at all.
      await page.evaluate(() => { document.getElementById('nav').classList.remove('open'); document.getElementById('install').classList.add('show'); });
      const hit = await page.evaluate(() => {
        const bar = document.getElementById('install').getBoundingClientRect();
        const orbEl = document.querySelector('.d2orb-root');
        const orb = orbEl ? orbEl.getBoundingClientRect() : null;
        const overlap = orb ? !(bar.bottom <= orb.top || bar.top >= orb.bottom || bar.right <= orb.left || bar.left >= orb.right) : false;
        const go = document.getElementById('installGo').getBoundingClientRect();
        const top = document.elementFromPoint(go.left + go.width / 2, go.top + go.height / 2);
        return { overlap, onScreen: bar.top >= 0 && bar.bottom <= innerHeight + 1, tappable: !!top && top.closest('#installGo') !== null };
      });
      ok(hit.overlap === false, w + ': the install bar does not overlap the voice orb');
      ok(hit.onScreen, w + ': the install bar is fully on screen');
      ok(hit.tappable, w + ': the Install button receives the tap (nothing sits on top of it)');
      await page.evaluate(() => document.getElementById('install').classList.remove('show'));

      await page.keyboard.press('Escape');
      ok(await page.evaluate(() => document.getElementById('nav').classList.contains('open')) === false, w + ': Escape closes it');

      await page.close();
    }

    // Desktop: the burger is gone and the links are back, with no second nav.
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle0' });
    const desk = await page.evaluate(() => ({
      burger: getComputedStyle(document.getElementById('burger')).display,
      nav: getComputedStyle(document.getElementById('nav')).display,
      navs: document.querySelectorAll('nav').length
    }));
    ok(desk.burger === 'none' && desk.nav === 'flex' && desk.navs === 1, 'desktop keeps the bar and only one nav exists');

    // The orb's ball paints orange, not the shared default cyan.
    await page.waitForSelector('.d2orb-ball', { timeout: 8000 }).catch(() => {});
    const ball = await page.evaluate(() => {
      const b = document.querySelector('.d2orb-ball');
      if (!b) return null;
      const cs = getComputedStyle(b);
      return { bg: cs.backgroundImage, shadow: cs.boxShadow };
    });
    ok(!!ball, 'the voice orb rendered');
    ok(!!ball && /252,\s*76,\s*2/.test(ball.bg) && !/34,\s*211,\s*238/.test(ball.bg), 'the ball is the brand orange, with no cyan left in it');
    ok(!!ball && /252,\s*76,\s*2/.test(ball.shadow), 'its glow is orange too');

    // The orb must not sit on top of the last line of the footer.
    const clear = await page.evaluate(() => {
      const f = document.querySelector('footer'), l = document.querySelector('.d2orb-root');
      if (!f || !l) return null;
      const a = f.getBoundingClientRect(), b = l.getBoundingClientRect();
      return !(a.bottom > b.top && a.left < b.right && a.right > b.left && a.top < b.bottom);
    });
    ok(clear !== false, 'the footer text is not covered by the orb');

    // The home-screen tile: iOS reads none of the manifest icons.
    const head = await page.evaluate(() => ({
      apple: (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || '',
      title: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || ''
    }));
    ok(/icon-180\.png/.test(head.apple), 'iOS gets a PNG apple-touch-icon, not an SVG it cannot read');
    ok(head.title === 'LevelUp', 'the home-screen name is LevelUp, not the page title');
    const icons = await page.evaluate(async () => {
      const m = await (await fetch('manifest.webmanifest')).json();
      const png = m.icons.filter(i => i.type === 'image/png');
      const heads = await Promise.all(png.map(i => fetch(i.src).then(r => r.status)));
      return {
        ok192: png.some(i => i.sizes === '192x192'), ok512: png.some(i => i.sizes === '512x512'),
        mask: m.icons.some(i => (i.purpose || '').split(' ').includes('maskable')),
        heads, short: m.short_name
      };
    });
    ok(icons.ok192 && icons.ok512 && icons.mask, 'Android gets 192 and 512 PNGs plus a maskable one');
    ok(icons.heads.length > 0 && icons.heads.every(s => s === 200), 'every icon the manifest names actually exists');
    ok(icons.short === 'LevelUp', 'the installed app is named LevelUp');


    // ── Install: what each platform can and cannot do ─────────────────────
    // Android: the browser event is the real install, in one tap.
    {
      const pg = await browser.newPage();
      await pg.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
      await pg.goto(url, { waitUntil: 'networkidle0' });
      const r = await pg.evaluate(() => {
        let called = false;
        const e = new Event('beforeinstallprompt');
        e.prompt = () => { called = true; };
        window.dispatchEvent(e);
        document.getElementById('install').classList.add('show');
        document.getElementById('installGo').click();
        return { called, sheetOpen: !document.getElementById('iosSheet').hidden };
      });
      ok(r.called === true, 'Android: Install calls the browser prompt, the real one-tap install');
      ok(r.sheetOpen === false, 'Android: it does not show the iPhone steps');
      await pg.close();
    }
    // iPhone Safari: no install API exists, so the two taps are spelled out.
    {
      const pg = await browser.newPage();
      await pg.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
      await pg.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
      await pg.goto(url, { waitUntil: 'networkidle0' });
      const r = await pg.evaluate(() => {
        document.getElementById('install').classList.add('show');
        document.getElementById('installGo').click();
        const sh = document.getElementById('iosSheet');
        return {
          open: !sh.hidden,
          steps: sh.querySelectorAll('.ios-steps li').length,
          title: document.getElementById('iosTitle').textContent,
          arrow: !document.getElementById('iosPoint').hidden,
          share: /Share/.test(sh.textContent), add: /Add to Home Screen/.test(sh.textContent)
        };
      });
      ok(r.open && r.steps === 3, 'iPhone: tapping Install opens the three steps');
      ok(/Home Screen/.test(r.title) && r.share && r.add, 'iPhone: the steps name Share and Add to Home Screen');
      ok(r.arrow === true, 'iPhone: the arrow points at the Safari bar');
      const closed = await pg.evaluate(() => { document.getElementById('iosOk').click(); return document.getElementById('iosSheet').hidden; });
      ok(closed === true, 'iPhone: the sheet closes');
      await pg.close();
    }
    // Inside WhatsApp's browser there is no Add to Home Screen at all.
    {
      const pg = await browser.newPage();
      await pg.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.24');
      await pg.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true });
      await pg.goto(url, { waitUntil: 'networkidle0' });
      const r = await pg.evaluate(() => {
        document.getElementById('install').classList.add('show');
        document.getElementById('installGo').click();
        return { title: document.getElementById('iosTitle').textContent,
                 arrow: !document.getElementById('iosPoint').hidden,
                 steps: document.querySelectorAll('.ios-steps li').length };
      });
      ok(/Safari/.test(r.title), 'in-app browser: it says to open in Safari first, not steps that are not there');
      ok(r.arrow === false, 'in-app browser: no arrow, because that bar is not on screen');
      ok(r.steps === 3, 'in-app browser: the whole path is still spelled out');
      await pg.close();
    }

    await page.close();
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\nLevelUp mobile/PWA: ' + pass + '/' + (pass + fail));
  if (fail) { console.log('Failures:'); fails.forEach(f => console.log(' - ' + f)); process.exit(1); }
})();
