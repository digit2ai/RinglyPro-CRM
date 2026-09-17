/* SpeakUp — the header menu, driven in a real browser.
 *
 * A CSS rule that parses is not a menu that opens. This clicks the burger on BOTH screens at
 * two phone widths and a desktop width, and checks what a finger would meet: the panel opens,
 * stays on screen, paints above the page, has 44px targets, closes on Escape, on an outside
 * tap, on choosing something, and when the window grows past the breakpoint.
 *
 *   node verticals/speakup/test-header.js
 *
 * SKIPS LOUDLY without puppeteer rather than reporting a pass it did not earn.
 */
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) {
  console.log('SKIPPED: puppeteer is not installed, so the header menu was NOT verified in a browser.');
  process.exit(0);
}
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0].replace(/^\/speakup\/?/, '') || 'app.html';
  if (p === 'meetings') p = 'meetings.html';
  if (p === 'login') p = 'login.html';
  if (p === 'history') p = 'history.html';
  if (p === 'settings') p = 'settings.html';
  if (p === '') p = 'app.html';
  const f = path.join(DIR, p);
  // The screens call the API on boot; answer so the page settles instead of hanging. A
  // finished job with a status line and a server-authored line is what the language test
  // needs on screen.
  if (req.url.indexOf('/api/') >= 0) {
    const job = { id: 1, status: 'DEPLOYED', terminal: true, title: 'A change', project_name: 'SpeakUp', plan_hash: null, plan_md: null, revisions: [] };
    let body = { operator: true, jobs: [job], recordings: [], readiness: { ready: true, blockers: [] } };
    if (req.url.indexOf('/events') >= 0) {
      body = { status: 'DEPLOYED', terminal: true, pr_number: null, pr_url: null, events: [
        { id: 1, kind: 'status', text: 'TESTING' },
        { id: 2, kind: 'status', text: 'DEPLOYED' },
        { id: 3, kind: 'pr', text: 'Merged into main. Render is deploying.', detail: { i18n: 'merged', branch: 'main' } },
        { id: 4, kind: 'say', text: 'Prose from the model that nobody should translate.' }
      ] };
    } else if (/\/factory\/jobs\/\d+(\?|$)/.test(req.url)) body = { job };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(body));
  }
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };

server.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/speakup/';
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    for (const [name, url] of [['factory', base], ['meetings', base + 'meetings'], ['history', base + 'history'], ['settings', base + 'settings']]) {
      for (const [label, w, h] of [['phone 390', 390, 844], ['phone 360', 360, 780], ['desktop 1280', 1280, 900]]) {
        const page = await browser.newPage();
        await page.setViewport({ width: w, height: h });
        await page.goto(url, { waitUntil: 'networkidle0' });
        const phone = w <= 700;

        const shown = (sel) => page.$eval(sel, el => {
          const s = getComputedStyle(el), r = el.getBoundingClientRect();
          return { display: s.display, w: r.width, h: r.height, top: r.top, right: r.right, vis: r.width > 0 && r.height > 0 };
        });

        const burger = await shown('#burger');
        ok(phone ? burger.vis : !burger.vis, `${name} ${label}: burger ${phone ? 'is shown' : 'is hidden'}`);
        if (phone) ok(burger.w >= 44 && burger.h >= 44, `${name} ${label}: burger is a 44px target (${Math.round(burger.w)}x${Math.round(burger.h)})`);

        // THE LOCKUP IS WIDE, AND ONLY A BROWSER KNOWS IT. `.top img` is (0,1,1) and beats a
        // bare `.wordmark` (0,1,0) however late it appears, so the Digit2AI lockup rendered
        // as a 22px square — a squashed logo no source grep can see.
        const wm = await shown('.wordmark');
        ok(wm.vis, `${name} ${label}: the Digit2AI lockup is on screen`);
        ok(wm.w > wm.h * 3, `${name} ${label}: it is a lockup, not squashed into a square (${Math.round(wm.w)}x${Math.round(wm.h)})`);

        const menuClosed = await shown('#hdrMenu');
        ok(phone ? !menuClosed.vis : menuClosed.vis, `${name} ${label}: the controls are ${phone ? 'tucked away' : 'in the bar'}`);

        // No horizontal overflow, closed or open.
        const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        ok(!(await overflow()), `${name} ${label}: no horizontal overflow`);

        if (phone) {
          await page.click('#burger');
          await new Promise(r => setTimeout(r, 250));
          const open = await shown('#hdrMenu');
          ok(open.vis, `${name} ${label}: tapping the burger opens the menu`);
          ok(open.right <= w, `${name} ${label}: the panel stays on screen (right ${Math.round(open.right)} <= ${w})`);
          ok(await page.$eval('#burger', el => el.getAttribute('aria-expanded') === 'true'), `${name} ${label}: aria-expanded reports open`);
          ok(!(await overflow()), `${name} ${label}: no overflow with the menu open`);

          const targets = await page.$$eval('#hdrMenu .lnk', els => els.map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), h: r.height, w: r.width }; }));
          // History, New meeting, Settings, language, sign out — the same five on every screen.
          ok(targets.length === 5, `${name} ${label}: all five menu entries are in the menu (${targets.map(t => t.t).join(' / ')})`);
          ok(targets.every(t => t.h >= 44), `${name} ${label}: every control is a 44px target (${targets.map(t => Math.round(t.h)).join(',')})`);

          // The panel must sit over the page, not push it around.
          const covered = await page.evaluate(() => {
            const m = document.getElementById('hdrMenu').getBoundingClientRect();
            const el = document.elementFromPoint(m.left + m.width / 2, m.top + 10);
            return !!(el && document.getElementById('hdrMenu').contains(el));
          });
          ok(covered, `${name} ${label}: the panel paints above the page`);

          await page.keyboard.press('Escape');
          await new Promise(r => setTimeout(r, 250));
          ok(!(await shown('#hdrMenu')).vis, `${name} ${label}: Escape closes it`);

          await page.click('#burger');
          await new Promise(r => setTimeout(r, 200));
          await page.mouse.click(w / 2, h - 60);
          await new Promise(r => setTimeout(r, 250));
          ok(!(await shown('#hdrMenu')).vis, `${name} ${label}: tapping outside closes it`);

          // Choosing something inside closes it — the language toggle only relabels.
          await page.click('#burger');
          await new Promise(r => setTimeout(r, 200));
          await page.click('#langBtn');
          await new Promise(r => setTimeout(r, 250));
          ok(!(await shown('#hdrMenu')).vis, `${name} ${label}: choosing an item closes it`);

          // Growing past the breakpoint must not strand an open panel.
          await page.click('#burger');
          await new Promise(r => setTimeout(r, 200));
          await page.setViewport({ width: 1280, height: 900 });
          await new Promise(r => setTimeout(r, 300));
          ok(await page.$eval('#burger', el => el.getAttribute('aria-expanded') === 'false'), `${name} ${label}: resizing to desktop closes it`);
        }
        await page.close();
      }
    }
    // ── ONE LANGUAGE ON THE WHOLE SCREEN ───────────────────────────────────────
    // The reported bug: the header said English while the pane still listed "Probando /
    // Subiendo la rama / Desplegado", because a line kept the language it was written in.
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.goto(base, { waitUntil: 'networkidle0' });
      await new Promise(r => setTimeout(r, 600));
      const read = () => page.evaluate(() => ({
        pane: document.getElementById('out').textContent,
        bar: document.getElementById('bar').textContent,
        lang: document.documentElement.lang,
        btn: document.getElementById('langBtn').textContent.trim()
      }));

      let v = await read();
      ok(v.lang === 'es', 'starts in Spanish');
      ok(/Desplegado/.test(v.pane) && /Probando/.test(v.pane), 'Spanish: the statuses are Spanish');
      ok(/Fusionado en main/.test(v.pane), 'Spanish: the server line is Spanish');
      ok(/Despliegue/.test(v.bar), 'Spanish: the step bar is Spanish');

      await page.click('#langBtn');
      await new Promise(r => setTimeout(r, 400));
      v = await read();
      ok(v.lang === 'en', 'toggles to English');
      ok(/Deployed/.test(v.pane) && /Running tests/.test(v.pane), 'English: the statuses turned English');
      ok(!/Desplegado|Probando|Subiendo/.test(v.pane), 'English: NOTHING Spanish is left in the pane');
      ok(/Merged into main/.test(v.pane) && !/Fusionado/.test(v.pane), 'English: the server line turned English too');
      ok(/Deploy/.test(v.bar) && !/Despliegue/.test(v.bar), 'English: the step bar turned English');
      // Prose from a model is shown as it arrived; inventing a translation is worse.
      ok(/Prose from the model/.test(v.pane), 'English: untranslatable prose is left alone');

      await page.click('#langBtn');
      await new Promise(r => setTimeout(r, 400));
      v = await read();
      ok(/Desplegado/.test(v.pane) && !/Deployed/.test(v.pane), 'back to Spanish: nothing English is left');
      ok(/Despliegue/.test(v.bar), 'back to Spanish: the step bar followed');
      await page.close();
    }

    // ── THE LOGIN WEARS THE APP'S THEME ────────────────────────────────────────
    // It was the last screen on the old purple-on-navy palette, so the first thing
    // anyone saw looked like a different product. Two things here are measurable only
    // in a browser: the contrast a label actually renders at, and whether a rule WON —
    // theme.css hides `.product` under 560px and the login has no tabs to name the
    // screen instead, so `.brand .product` has to beat it on specificity.
    {
      const lum = (c) => {
        const [r, g, b] = c.match(/\d+/g).map(Number)
          .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a, b) => { const L = lum(a), M = lum(b); return (Math.max(L, M) + 0.05) / (Math.min(L, M) + 0.05); };

      for (const [label, w, h] of [['phone 390', 390, 844], ['desktop 1280', 1280, 900]]) {
        const page = await browser.newPage();
        await page.setViewport({ width: w, height: h });
        await page.goto(base + 'login', { waitUntil: 'networkidle0' });

        const v = await page.evaluate(() => {
          const cs = (s) => getComputedStyle(document.querySelector(s));
          const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { w: r.width, h: r.height }; };
          return {
            bg: cs('body').backgroundColor,
            btnBg: cs('#btn').backgroundColor, btnInk: cs('#btn').color, btnH: box('#btn').h,
            tag: cs('.tag').color,
            prod: { txt: document.querySelector('.brand .product').textContent, ...box('.brand .product') },
            serif: cs('.brand .product').fontFamily,
            wm: box('.brand img.wordmark'),
            inputH: box('#email').h, inputFont: parseFloat(cs('#email').fontSize),
            // THE GROUND IS NOT WHAT IS BEHIND THE TEXT. The page has two surfaces now — a
            // dark ground with a light panel on it — and the tagline sits INSIDE the panel.
            // Measuring it against `body` reported 1.42:1 for type that actually renders at
            // 7.88:1, i.e. a failure the product does not have.
            cardBg: cs('.card').backgroundColor,
            over: document.documentElement.scrollWidth > window.innerWidth + 1
          };
        });

        ok(v.bg === 'rgb(31, 41, 55)', `login ${label}: the CRM ground #1f2937 (${v.bg})`);
        ok(v.cardBg === 'rgb(224, 225, 227)', `login ${label}: the panel is the CRM's, solid (${v.cardBg})`);
        ok(ratio(v.btnBg, v.btnInk) >= 4.5, `login ${label}: the button label meets AA (${ratio(v.btnBg, v.btnInk).toFixed(2)}:1)`);
        ok(ratio(v.tag, v.cardBg) >= 4.5, `login ${label}: the tagline meets AA on the panel (${ratio(v.tag, v.cardBg).toFixed(2)}:1)`);
        // `/serif/i` USED TO BE THE CHECK AND IT FALSE-PASSES NOW: the CRM's stack begins
        // `ui-sans-serif`, which contains the word. The CRM sets nothing in a serif, so the
        // assertion is that this IS that stack.
        ok(/^ui-sans-serif/.test(v.serif) && !/(^|,)\s*(Georgia|Cambria|Times|ui-serif)\b/i.test(v.serif),
           `login ${label}: the product name uses the CRM sans stack (${v.serif.split(',')[0]})`);
        // The rule that only a browser can settle.
        ok(v.prod.txt === 'AutoDev' && v.prod.w > 0 && v.prod.h > 0,
           `login ${label}: the product name is on screen (${Math.round(v.prod.w)}x${Math.round(v.prod.h)})`);
        ok(v.wm.w > v.wm.h * 3, `login ${label}: the Digit2AI lockup is not squashed (${Math.round(v.wm.w)}x${Math.round(v.wm.h)})`);
        ok(v.btnH >= 44 && v.inputH >= 44, `login ${label}: 44px targets (button ${Math.round(v.btnH)}, field ${Math.round(v.inputH)})`);
        // Under 16px iOS zooms the page on focus and the card jumps off screen.
        ok(v.inputFont >= 16, `login ${label}: the field is 16px, so iOS does not zoom (${v.inputFont}px)`);
        ok(!v.over, `login ${label}: no horizontal overflow`);
        await page.close();
      }
    }
  } catch (e) {
    fail++; console.log('ERROR ' + e.message);
  }
  await browser.close();
  server.close();
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
});
