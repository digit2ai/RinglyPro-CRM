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

  for (const p of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${port}/${p}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));

    const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    t(`${p} paints the LIGHT ground by default`, () => {
      const m = ground.match(/(\d+), (\d+), (\d+)/);
      assert.ok(m, `no background on body: ${ground}`);
      const [, r, g, b] = m.map(Number);
      assert.ok(r > 200 && g > 200 && b > 200, `body is still dark (${ground}) — the default did not flip`);
    });

    const bad = await page.evaluate(AUDIT);
    t(`${p} has no unreadable text`, () => assert.strictEqual(bad.length, 0,
      bad.map((x) => `"${x.txt}" ${x.ratio}:1 (needs ${x.need}) ${x.color}`).join(' | ')));

    await page.close();
  }

  await browser.close(); srv.close();
  console.log(`\n${'='.repeat(66)}\n  ${pass}/${pass + fail} passed`);
  if (fail) console.log('  FAILED: ' + failures.join(' | '));
  console.log('  NOT COVERED: the live GoHighLevel copy of the landing page, which');
  console.log('               this repo does not serve and cannot change.');
  console.log('='.repeat(66));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('theme SIT crashed:', e); process.exit(1); });
