'use strict';

/**
 * THE APP MUST LOOK LIKE THE PAGE THAT SOLD IT, AND BE READABLE.
 *
 * Two things only a browser can settle, so neither is asserted from the hex:
 *
 *  1. CONTRAST AGAINST WHAT IS ACTUALLY PAINTED. A token is readable or not
 *     depending on every translucent ancestor between the text and the ground,
 *     so this walks the real ancestor chain and composites down. The brand teal
 *     #12b8a6 measures 2.49:1 on white — it is a FILL, never text — and white
 *     on a teal fill is the same 2.49:1, which is why the landing puts #04302b
 *     on its primary button and the dashboard now does too.
 *
 *  2. WHETHER A RULE WON. Specificity and source order are invisible to a grep.
 *
 * It also pins the palette to the LANDING PAGE rather than to a copy: the
 * values are read out of public/ringlypro_lite/index.html at run time, so the
 * two drifting apart fails the build instead of going quietly out of step.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LANDING = path.join(ROOT, '..', 'public', 'ringlypro_lite', 'index.html');
const PAGES = ['dashboard.html', 'login.html', 'onboarding.html'];

let pass = 0, fail = 0; const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; failures.push(name); console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const assert = require('assert');

/** The landing's own tokens — the single source this theme is copied from. */
function landingTokens() {
  const src = fs.readFileSync(LANDING, 'utf8');
  const m = src.match(/\.rpl\{([\s\S]*?)font-family/);
  if (!m) throw new Error('could not find the .rpl token block on the landing page');
  const out = {};
  for (const pair of m[1].split(';')) {
    const kv = pair.trim().match(/^(--[a-z0-9-]+):(#[0-9a-fA-F]{3,8})$/);
    if (kv) out[kv[1]] = kv[2].toLowerCase();
  }
  return out;
}

(async () => {
  const LT = landingTokens();
  console.log(`\n-- landing palette read from index.html ${'-'.repeat(26)}`);
  console.log('   ', JSON.stringify(LT));

  console.log(`\n-- the dashboard copies the landing, it does not re-pick ${'-'.repeat(8)}`);
  const dash = fs.readFileSync(path.join(ROOT, 'public/dashboard.html'), 'utf8');
  const root = (dash.match(/:root\{([^}]*)\}/) || [])[1] || '';
  const tok = (n) => (root.match(new RegExp(`${n}:(#[0-9a-f]{3,8})`)) || [])[1];

  t('--txt is the landing ink', () => assert.strictEqual(tok('--txt'), LT['--ink']));
  t('--acc is the landing teal', () => assert.strictEqual(tok('--acc'), LT['--teal']));
  t('--line is the landing line', () => assert.strictEqual(tok('--line'), LT['--line']));
  t('--bg is a landing surface', () => assert.ok([LT['--soft2'], LT['--soft'], LT['--bg']].includes(tok('--bg')),
    `--bg ${tok('--bg')} is not one of the landing's surfaces`));

  t('LIGHT IS THE DEFAULT — dark is the override, not the other way round', () => {
    assert.ok(/:root\{--bg:#f4f9fb/.test(dash), ':root is not the light palette');
    assert.ok(/html\[data-theme="dark"\]\{/.test(dash), 'there is no dark override left for the picker');
    assert.ok(!/html\[data-theme="light"\]\{/.test(dash), 'a stale light override survives and will fight :root');
  });

  t('nothing renders before the theme is known', () => {
    // A pre-paint script that still defaults to dark flashes navy for one frame
    // and repaints white, which reads as a broken page.
    const pre = dash.slice(0, dash.indexOf('</head>'));
    assert.ok(/t!=='light'&&t!=='dark'\)t='light'/.test(pre), 'the pre-paint fallback is not light');
  });

  t('the app uses the landing font stack', () => {
    for (const p of PAGES) {
      const s = fs.readFileSync(path.join(ROOT, 'public', p), 'utf8');
      assert.ok(/font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif/.test(s), p);
    }
  });

  t('THE SERVICE WORKER CACHE WAS BUMPED FOR THIS THEME', () => {
    // The theme shipped once and stayed invisible: the server was sending the
    // light palette while every installed copy served the dark dashboard from
    // 'lite-v9'. A shell colour change that does not bump the cache has not
    // shipped, whatever the server returns.
    const sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
    const m = sw.match(/const CACHE = 'lite-v(\d+)'/);
    assert.ok(m, 'no versioned CACHE in sw.js');
    assert.ok(Number(m[1]) >= 10, `sw.js is still on lite-v${m[1]} — the re-theme needs a bump`);
  });

  t('WHITE IS NEVER PUT ON THE TEAL FILL', () => {
    for (const p of PAGES) {
      const s = fs.readFileSync(path.join(ROOT, 'public', p), 'utf8');
      assert.ok(!/background:var\(--acc\);color:#fff/.test(s), `${p} still paints white on the brand teal (2.49:1)`);
    }
  });

  // ── the browser half ────────────────────────────────────────────────────
  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch (_) {
    console.log('\n  SKIPPED LOUDLY: puppeteer is not installed, so CONTRAST AND');
    console.log('  WHICH RULE WON were NOT measured. Those are the two things a');
    console.log('  grep cannot see. Install puppeteer and re-run before trusting this.');
    console.log(`\n${'='.repeat(66)}\n  ${pass}/${pass + fail} passed (browser half skipped)\n${'='.repeat(66)}`);
    process.exit(fail ? 1 : 0);
  }

  const srv = http.createServer((req, res) => {
    const f = path.join(ROOT, 'public', (req.url.split('?')[0] || '/').replace(/^\//, '') || 'dashboard.html');
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
      res.end(b);
    });
  }).listen(0);
  const port = srv.address().port;
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });

  const AUDIT = () => {
    const lum = (r, g, b) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const parse = (s) => { const m = String(s).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
    const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    // THE REAL ANCESTOR CHAIN, composited down to the ground — not `body`.
    const bgOf = (el) => {
      const stack = [];
      for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } }
      let out = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
      return out;
    };
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const txt = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
      if (!txt) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const fg = parse(cs.color); if (!fg) continue;
      const bg = bgOf(el);
      const f = fg.a < 1 ? over(fg, bg) : fg;
      const L1 = lum(f.r, f.g, f.b), L2 = lum(bg.r, bg.g, bg.b);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
      const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
      if (ratio < need) bad.push({ txt: txt.slice(0, 40), ratio: +ratio.toFixed(2), need, color: cs.color, size });
    }
    return bad;
  };

  // DESKTOP AND MOBILE BOTH. A token is shared, but which rules win is not:
  // the app hides and restacks things under its breakpoints, so a colour that
  // is fine at 1440 can land on a different surface at 390.
  for (const { w, h, label } of [{ w: 1440, h: 900, label: 'desktop' }, { w: 390, h: 844, label: 'mobile' }])
  for (const p of PAGES) {
    // A CLEAN CONTEXT PER PAGE. The dashboard's theme script WRITES
    // lite_theme to localStorage, so sharing one browser origin let login.html
    // and onboarding.html read 'light' that the dashboard had just stored —
    // and both pages passed while a real first-time visitor, who lands on the
    // login screen, got the dark default they still carried. The test was
    // reporting a pass it had not earned.
    const ctx = await (browser.createBrowserContext
      ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const page = await ctx.newPage();
    await page.setViewport({ width: w, height: h });
    await page.goto(`http://127.0.0.1:${port}/${p}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));

    const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    t(`${label} ${p} paints the LIGHT ground by default`, () => {
      const m = ground.match(/(\d+), (\d+), (\d+)/);
      assert.ok(m, `no background on body: ${ground}`);
      const [, r, g, b] = m.map(Number);
      assert.ok(r > 200 && g > 200 && b > 200, `body is still dark (${ground}) — the default did not flip`);
    });

    const bad = await page.evaluate(AUDIT);
    t(`${label} ${p} has no unreadable text`, () => assert.strictEqual(bad.length, 0,
      bad.map((x) => `"${x.txt}" ${x.ratio}:1 (needs ${x.need}) ${x.color}`).join(' | ')));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    t(`${label} ${p} does not scroll sideways`, () => assert.ok(overflow <= 1, `${overflow}px of horizontal overflow`));

    // MESSAGES OPENS ON UNREAD, AND AN ALL-READ INBOX SAYS SO.
    // Defaulting to Unread makes "nothing to show" the commonest state in a
    // healthy account, and the existing empty text was "No messages match
    // your search" - with no search typed, which reads as a broken filter.
    if (p === 'dashboard.html') {
      const msg = await page.evaluate(() => {
        const r = { chipOn: document.querySelector('.chip.on') && document.querySelector('.chip.on').id };
        /* eslint-disable no-undef */
        allMessages = [
          { id: 1, caller_name: 'A', body: 'read one', read_at: '2026-09-26T00:00:00Z', created_at: '2026-09-26T00:00:00Z' },
          { id: 2, caller_name: 'B', body: 'unread one', read_at: null, created_at: '2026-09-26T01:00:00Z' }];
        renderMessages();
        r.shown = [...document.querySelectorAll('#messages .item .body')].map((e) => e.textContent);
        allMessages = allMessages.map((m) => ({ ...m, read_at: '2026-09-26T00:00:00Z' }));
        renderMessages();
        r.allRead = (document.querySelector('#messages .empty') || {}).textContent || '';
        document.getElementById('fAll').click();
        r.afterAll = document.querySelectorAll('#messages .item').length;
        document.getElementById('fUnread').click();
        msgQuery = 'zzzznotfound'; renderMessages();
        r.search = (document.querySelector('#messages .empty') || {}).textContent || '';
        msgQuery = ''; allMessages = []; renderMessages();
        r.none = (document.querySelector('#messages .empty') || {}).textContent || '';
        /* eslint-enable no-undef */
        return r;
      });
      t(`${label} messages opens on Unread`, () => {
        assert.strictEqual(msg.chipOn, 'fUnread', 'the highlighted chip is ' + msg.chipOn);
        assert.deepStrictEqual(msg.shown, ['unread one'], 'the read message was shown by default');
      });
      t(`${label} an all-read inbox does not claim a search found nothing`, () => {
        assert.ok(!/search|búsqueda/i.test(msg.allRead),
          'all-read shows a SEARCH message: ' + JSON.stringify(msg.allRead));
        assert.ok(msg.allRead.length > 10, 'all-read shows nothing at all');
        assert.notStrictEqual(msg.allRead, msg.none, 'all-read and never-had-any read identically');
      });
      t(`${label} the three empty states are distinct, and All still shows everything`, () => {
        assert.strictEqual(msg.afterAll, 2, 'tapping All did not reveal the read message');
        assert.ok(/search|búsqueda/i.test(msg.search), 'a real search miss lost its own wording');
        assert.ok(/yet|Aún/i.test(msg.none), 'the never-had-any state lost its own wording');
      });
    }

    // THE NOTIFICATION CHANNEL MUST ACTUALLY BE ON SCREEN.
    // The whole "works with no email transport" claim rests on a dashboard row
    // the client can see. The rows were written on every payment and
    // activation and NOTHING in the UI read them — the fallback was a promise
    // in a commit message, not a feature.
    if (p === 'dashboard.html') {
      const notif = await page.evaluate(() => {
        const src = document.documentElement.outerHTML;
        // SPECIFIC. Checking only for the word "notifications" was satisfied
        // by the dismiss call alone, so deleting the fetch that populates the
        // panel changed nothing and the mutation passed.
        return { reads: /api\('\/api\/notifications'\)/.test(src),
          called: /loadNotifs\(/.test(src),
          dismisses: /notifications\/read/.test(src) };
      });
      // THE NOTIFICATION SURFACE: header item, panel, and Alerts relocated.
      const ui = await page.evaluate(() => {
        const src = document.documentElement.outerHTML.replace(/\s+/g, '');
        const bell = document.getElementById('bell');
        return {
          headerItem: !!document.getElementById('notifBtn'),
          count: !!document.getElementById('notifCount'),
          panel: !!document.getElementById('notifPanel'),
          // The push-permission control is a device PREFERENCE, so it belongs
          // in Settings; the header now carries the notifications themselves.
          bellInSettings: !!(bell && bell.closest('#v-settings')),
          // ONE SURFACE. An earlier version had a strip AND a panel, which is
          // the same duplicate-card mistake that put "not switched on yet"
          // directly above "Activate".
          noStrip: !document.getElementById('notif'),
          // The compose box must be drawn from a SERVER flag, never decided
          // by the client.
          ownerFromServer: /isOwner=!!j\.is_owner/.test(src),
          openIsReading: /notifications\/read/.test(src),
        };
      });
      t(`${label} notifications live in the header with a count`, () => {
        assert.ok(ui.headerItem, 'there is no Notifications item in the header');
        assert.ok(ui.count, 'the header item carries no unread count');
        assert.ok(ui.panel, 'there is no notification panel');
        assert.ok(ui.noStrip, 'the old strip is still there alongside the panel');
      });
      // A CONFIRMATION MUST SURVIVE THE THING THAT CAUSED IT. Refreshing the
      // list re-renders the panel's innerHTML, which destroys the compose box
      // and the "sent to N accounts" message inside it — the founder sent a
      // broadcast and the confirmation vanished in the tick it appeared.
      const keepsMsg = await page.evaluate(() => {
        const src = document.documentElement.outerHTML.replace(/\s+/g, '');
        return /loadNotifs\(\{render:false\}\);loadBroadcasts\(\)/.test(src);
      });
      t(`${label} a broadcast confirmation is not wiped by its own refresh`, () => {
        assert.ok(keepsMsg, 'sending a broadcast re-renders the panel and destroys the confirmation');
      });

      t(`${label} Alerts moved to Settings, and admin comes from the server`, () => {
        assert.ok(ui.bellInSettings, 'the push-permission control is not in Settings');
        assert.ok(ui.ownerFromServer, 'the client decides who is an admin');
        assert.ok(ui.openIsReading, 'opening the panel never marks anything read');
      });

      // AN INVALID DATE MUST RENDER AS NOTHING, not the words "Invalid Date".
      // new Date(undefined).toLocaleString() does not throw, so the try/catch
      // that was there could never have caught it.
      const dates = await page.evaluate(() => {
        if (typeof whenLocal !== 'function') return null;
        return [whenLocal(undefined), whenLocal(null), whenLocal(''), whenLocal('not a date')];
      });
      t(`${label} an unparseable date renders as nothing`, () => {
        assert.ok(dates, 'whenLocal is gone');
        assert.deepStrictEqual(dates, ['', '', '', ''], 'got: ' + JSON.stringify(dates));
      });

      // THE BADGE IS THE DELIVERY. A notification row the icon does not count
      // is a message nobody is told about until they open the app for some
      // other reason.
      const badge = await page.evaluate(() => {
        const src = document.documentElement.outerHTML.replace(/\s+/g, '');
        // The DEFINITION alone is not enough: changing the messages poll back
        // to setAppBadge(j.unread) left refreshBadge() defined and unused, and
        // the first version of this check passed.
        return { combined: /functionrefreshBadge\(\)\{setAppBadge\(\(msgUnread\|\|0\)\+\(notifUnread\|\|0\)\)/.test(src)
            && /msgUnread=j\.unread;refreshBadge\(\)/.test(src)
            && !/setAppBadge\(j\.unread\)/.test(src),
          notifFeeds: /notifUnread=j\.unread\|\|0;refreshBadge\(\)/.test(src),
          dropsOnRead: /notifUnread=0;refreshBadge\(\)/.test(src) };
      });
      t(`${label} the icon badge counts messages AND notifications`, () => {
        assert.ok(badge.combined, 'the icon badge is not the sum of both sources');
        assert.ok(badge.notifFeeds, 'notifications never update the badge');
        assert.ok(badge.dropsOnRead, 'the badge does not come down when notifications are read');
      });

      t(`${label} unread notifications have somewhere to appear`, () => {
        assert.ok(notif.reads, 'nothing in the UI fetches the notifications');
        assert.ok(notif.called, 'the notification loader is never invoked');
        assert.ok(notif.dismisses, 'a notification can be shown but never dismissed');
      });

      // ONE CARD AT A TIME. The operational panel used to render in every
      // state, so "not switched on for this account yet" sat directly above
      // "Outbound calling · $0.26 per minute · Activate" — and stayed there
      // after the client had paid.
      const gated = await page.evaluate(() => {
        const src = document.documentElement.outerHTML.replace(/\s+/g, '');
        const i = src.indexOf('asyncfunctionloadOutbound');
        return /state!=='active'\)\{box\.style\.display='none'/.test(src.slice(i, i + 700));
      });
      t(`${label} the operational card is hidden until the add-on is live`, () => {
        assert.ok(gated, 'ob_status renders alongside the gate and contradicts it');
      });
    }

    // NO TWO GLOBALS MAY SHARE A NAME, AND A BUTTON MUST CALL SOMETHING.
    //
    // The $20 setup button shipped calling obActivate(), which already existed
    // as `window.obActivate = async id => ...` for activating a LIST. The
    // assignment wins over the hoisted declaration, so the button hit the list
    // route with an undefined id and the user got an alert saying "bad_id".
    // Nothing in a syntax check, a route test or a contrast audit can see a
    // collision like that — only counting the names can.
    if (p === 'dashboard.html') {
      const dupes = await page.evaluate(() => {
        const src = document.documentElement.outerHTML;
        const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:^|\n)\s*window\.([A-Za-z_$][\w$]*)\s*=|(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)/g;
        const seen = {}; let m;
        while ((m = re.exec(src))) { const n = m[1] || m[2] || m[3]; seen[n] = (seen[n] || 0) + 1; }
        return Object.entries(seen).filter(([, c]) => c > 1).map(([n]) => n);
      });
      t(`${label} no two globals in the dashboard share a name`, () => {
        assert.deepStrictEqual(dupes, [], 'colliding globals: ' + dupes.join(', '));
      });

      // EVERY onclick NAME MUST BE DEFINED — INCLUDING THE GENERATED ONES.
      //
      // The first version of this walked document.querySelectorAll('[onclick]')
      // on the loaded page, which only ever sees the STATIC handlers. The
      // button that actually broke is written by loadPlan() into innerHTML at
      // run time, behind an authenticated fetch that never fires in a test —
      // so renaming its function and leaving the markup behind changed
      // nothing and the mutation passed. Scanning the SOURCE finds both.
      const unbound = await page.evaluate(() => {
        const src = document.documentElement.outerHTML;
        const defined = new Set();
        const dre = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|window\.([A-Za-z_$][\w$]*)\s*=|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)/g;
        let d; while ((d = dre.exec(src))) defined.add(d[1] || d[2] || d[3]);
        const used = new Set();
        const ure = /on(?:click|change|input|submit)\s*=\s*[\\]?["']\s*([A-Za-z_$][\w$]*)\s*\(/g;
        let u; while ((u = ure.exec(src))) used.add(u[1]);
        return [...used].filter((n) => !defined.has(n) && typeof window[n] !== 'function');
      });
      t(`${label} every onclick name is defined, generated ones included`, () => {
        assert.deepStrictEqual(unbound, [], 'handlers that do not exist: ' + unbound.join(', '));
      });
    }

    // THE BOTTOM TABS ARE MEASURED, NOT ASSUMED. A `@media(max-width:700px)`
    // rule set `padding:0 2px` on the tab links, which WIPED the vertical
    // padding from the rule above it - so on every phone each tab was one
    // line of 12px text tall (14px measured) and the label sat hard against
    // the bottom edge, exactly where the iPhone home indicator is. The CSS
    // parsed, nothing looked broken in the source, and only a ruler finds it.
    const nav = await page.evaluate(() => {
      const n = document.querySelector('nav');
      if (!n) return null;
      return [...n.querySelectorAll('a')].map((a) => {
        const box = a.getBoundingClientRect();
        const rng = document.createRange(); rng.selectNodeContents(a);
        const txt = rng.getBoundingClientRect();
        return { label: a.textContent.trim().slice(0, 14), h: Math.round(box.height),
          top: Math.round(txt.top - box.top), bottom: Math.round(box.bottom - txt.bottom) };
      });
    });
    if (nav && nav.length) {
      t(`${label} ${p} bottom tabs are at least 44px tall`, () => {
        const low = nav.filter((x) => x.h < 44);
        assert.strictEqual(low.length, 0,
          low.map((x) => `${x.label} is ${x.h}px`).join(', '));
      });
      t(`${label} ${p} bottom tab labels are vertically centred`, () => {
        // Off-centre means the text is crowding one edge - at the bottom that
        // is the home indicator, which is what made these hard to tap.
        const off = nav.filter((x) => Math.abs(x.top - x.bottom) > 4);
        assert.strictEqual(off.length, 0,
          off.map((x) => `${x.label} top:${x.top} bottom:${x.bottom}`).join(', '));
      });
    }

    await page.close(); await ctx.close();
  }

  await browser.close(); srv.close();
  console.log(`\n${'='.repeat(66)}\n  ${pass}/${pass + fail} passed`);
  if (fail) console.log('  FAILED: ' + failures.join(' | '));
  console.log('  NOT COVERED: the live GoHighLevel copy of the landing page, which');
  console.log('               this repo does not serve and cannot change.');
  console.log('='.repeat(66));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('theme SIT crashed:', e); process.exit(1); });
