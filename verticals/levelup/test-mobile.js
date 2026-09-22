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
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\nLevelUp mobile/PWA: ' + pass + '/' + (pass + fail));
  if (fail) { console.log('Failures:'); fails.forEach(f => console.log(' - ' + f)); process.exit(1); }
})();
