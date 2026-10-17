'use strict';
/**
 * The half a stylesheet parse cannot do: which rule actually WON, measured in a
 * real browser, with every text node checked against what is genuinely painted
 * behind it (compositing translucent ancestors down to the page ground).
 *
 * Skips LOUDLY without puppeteer rather than reporting a pass it did not earn.
 *   node verticals/marapet/test/browser-audit.js
 */
process.env.MARAPET_SESSION_SECRET = 'audit-only-secret-0123456789abcd';
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (_) {
  console.log('SKIPPED LOUDLY: puppeteer is not installed, so contrast, tap targets');
  console.log('and horizontal overflow were NOT measured in this run.');
  process.exit(0);
}
const express = require('express');
require('./fake-db').install();

const WIDTHS = [390, 1440];
const PAGES = ['/', '/login', '/app', '/how-it-works', '/offline'];

function lum(rgb) {
  const c = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

(async () => {
  const app = express();
  app.use('/marapet', require('../src/index'));
  const server = app.listen(0);
  const port = server.address().port;
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });

  let pass = 0, fail = 0;
  const problems = [];

  for (const width of WIDTHS) {
    for (const route of PAGES) {
      // A CLEAN context per page: the theme script writes localStorage, so a
      // shared browser lets one page's stored preference decide another's
      // default and the whole audit passes for the wrong reason.
      // Older puppeteer names this createIncognitoBrowserContext.
      const mk = browser.createBrowserContext || browser.createIncognitoBrowserContext;
      const ctx = await mk.call(browser);
      const page = await ctx.newPage();
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${port}/marapet${route}`, { waitUntil: 'networkidle0' });

      const r = await page.evaluate(() => {
        function parse(c) {
          const m = /rgba?\(([^)]+)\)/.exec(c || '');
          if (!m) return null;
          const p = m[1].split(',').map((x) => parseFloat(x));
          return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
        }
        /** Composite every translucent ancestor down to the page ground. */
        function behind(el) {
          let stack = [];
          let n = el;
          while (n && n !== document.documentElement) {
            const bg = parse(getComputedStyle(n).backgroundColor);
            if (bg && bg.a > 0) stack.push(bg);
            if (bg && bg.a === 1) break;
            n = n.parentElement;
          }
          const root = parse(getComputedStyle(document.body).backgroundColor) || { rgb: [255, 255, 255], a: 1 };
          stack.push(root);
          let out = stack[stack.length - 1].rgb.slice();
          for (let i = stack.length - 2; i >= 0; i--) {
            const s = stack[i];
            out = out.map((v, k) => s.rgb[k] * s.a + v * (1 - s.a));
          }
          return out;
        }
        const texts = [], targets = [];
        document.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
          const rect = el.getBoundingClientRect();
          const tag = el.tagName.toLowerCase();
          const interactive = ['button', 'a', 'select', 'input', 'textarea', 'summary'].includes(tag);
          if (interactive && rect.width > 0 && rect.height > 0) {
            // WCAG 2.5.5 exempts a link that sits INSIDE a sentence: enlarging
            // it would push the words around it apart. The exception is for a
            // link with text flowing beside it in the same block, and nothing
            // else — a standalone nav link does not qualify.
            const parent = el.parentElement;
            const inlineInProse = tag === 'a' && parent &&
              ['p', 'li', 'span', 'small', 'figcaption'].includes(parent.tagName.toLowerCase()) &&
              [...parent.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
            targets.push({ tag, w: Math.round(rect.width), h: Math.round(rect.height),
              text: (el.textContent || '').trim().slice(0, 28),
              fs: parseFloat(cs.fontSize), inlineInProse });
          }
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
          if (!own || rect.width === 0 || rect.height === 0) return;
          const fg = parse(cs.color);
          if (!fg || fg.a === 0) return;
          texts.push({
            fg: fg.rgb, bg: behind(el),
            fs: parseFloat(cs.fontSize), fw: cs.fontWeight,
            text: (el.textContent || '').trim().slice(0, 36), tag
          });
        });
        return {
          texts, targets,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
          theme: document.documentElement.getAttribute('data-theme')
        };
      });

      if (r.overflow) { fail++; problems.push(`${route} @${width}: horizontal overflow ${r.scrollW} > ${r.innerW}`); }
      else pass++;

      if (r.theme !== 'light') { fail++; problems.push(`${route} @${width}: default theme is ${r.theme}, not light`); }
      else pass++;

      let worst = null;
      for (const t of r.texts) {
        const large = t.fs >= 24 || (t.fs >= 18.66 && Number(t.fw) >= 700);
        const floor = large ? 3.0 : 4.5;
        const c = ratio(t.fg, t.bg);
        if (!worst || c < worst.c) worst = { c, ...t, floor };
        if (c < floor - 0.01) {
          fail++;
          problems.push(`${route} @${width}: contrast ${c.toFixed(2)}:1 (floor ${floor}) "${t.text}" ${t.tag} ${t.fs}px`);
        }
      }
      pass++;

      if (width === 390) {
        for (const t of r.targets) {
          if (t.inlineInProse) continue;
          if (t.h < 44 || t.w < 44) {
            fail++; problems.push(`${route} @390: tap target ${t.w}x${t.h} <${t.tag}> "${t.text}"`);
          }
          if (['input', 'select', 'textarea'].includes(t.tag) && t.fs < 16) {
            fail++; problems.push(`${route} @390: input font ${t.fs}px <16px (iOS zooms) "${t.text}"`);
          }
        }
        for (const t of r.texts) {
          if (t.fs < 12) { fail++; problems.push(`${route} @390: text ${t.fs}px "${t.text}"`); }
        }
        pass++;
      }

      console.log(`${route.padEnd(16)} @${String(width).padEnd(5)} ` +
        `texts ${String(r.texts.length).padStart(3)}  targets ${String(r.targets.length).padStart(3)}  ` +
        `lowest contrast ${worst ? worst.c.toFixed(2) : 'n/a'}:1`);
      await ctx.close();
    }
  }

  await browser.close();
  server.close();
  console.log('');
  if (problems.length) { console.log('PROBLEMS:'); problems.forEach((p) => console.log('  ✗ ' + p)); }
  console.log(`\nMaraPet browser audit: ${pass} checks, ${fail} problem(s)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
