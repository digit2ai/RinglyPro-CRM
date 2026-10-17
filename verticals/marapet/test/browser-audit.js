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

const zlib = require('zlib');

/** Minimal PNG reader — enough for a screenshot (8-bit RGB/RGBA, no interlace). */
function decodePng(buf) {
  let p = 8, width = 0, height = 0, colorType = 6, bitDepth = 8;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return null;
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(height * stride);
  let o = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[o++];
    const line = raw.slice(o, o + stride); o += stride;
    const prev = y ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, ch, data: out };
}

/** The pixel behind this box that is CLOSEST in luminance to the text colour. */
function worstPixelFor(png, box, fg) {
  if (!png || box.w <= 0 || box.h <= 0) return null;
  const x0 = Math.max(0, box.x), y0 = Math.max(0, box.y);
  const x1 = Math.min(png.width - 1, box.x + box.w), y1 = Math.min(png.height - 1, box.y + box.h);
  if (x1 <= x0 || y1 <= y0) return null;
  let worst = null;
  const stepX = Math.max(1, Math.floor((x1 - x0) / 60));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 24));
  for (let y = y0; y <= y1; y += stepY) {
    for (let x = x0; x <= x1; x += stepX) {
      const i = y * png.width * png.ch + x * png.ch;
      const px = [png.data[i], png.data[i + 1], png.data[i + 2]];
      const c = ratio(fg, px);
      if (!worst || c < worst.c) worst = { c, px };
    }
  }
  return worst;
}

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
          // IS THERE A PICTURE BEHIND THIS? An ancestor-colour walk cannot see a
          // background-image, so text over one would be measured against a
          // colour that is not what the eye receives — and would pass for
          // entirely the wrong reason. Flag it; the pixel pass handles it.
          //
          // BUT STOP AT THE FIRST OPAQUE BACKGROUND. A filled button inside the
          // hero sits on its OWN colour, not on the artwork; the first version
          // of this walk reported the hero's primary button at 1.61:1 by
          // measuring the sunset behind a control the sunset never touches.
          // An audit that cries wolf gets switched off.
          let overImage = false;
          for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
            const cs2 = getComputedStyle(a);
            const own = parse(cs2.backgroundColor);
            if (own && own.a === 1) break;          // opaque: the picture is hidden here
            const bi = cs2.backgroundImage;
            if (bi && bi !== 'none' && bi.includes('url(')) { overImage = true; break; }
          }
          const r2 = el.getBoundingClientRect();
          texts.push({
            fg: fg.rgb, bg: behind(el),
            fs: parseFloat(cs.fontSize), fw: cs.fontWeight,
            text: (el.textContent || '').trim().slice(0, 36), tag,
            overImage,
            box: { x: Math.round(r2.left), y: Math.round(r2.top),
                   w: Math.round(r2.width), h: Math.round(r2.height) }
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
      const overImage = [];
      for (const t of r.texts) {
        const large = t.fs >= 24 || (t.fs >= 18.66 && Number(t.fw) >= 700);
        const floor = large ? 3.0 : 4.5;
        if (t.overImage) { overImage.push({ ...t, floor, large }); continue; }
        const c = ratio(t.fg, t.bg);
        if (!worst || c < worst.c) worst = { c, ...t, floor };
        if (c < floor - 0.01) {
          fail++;
          problems.push(`${route} @${width}: contrast ${c.toFixed(2)}:1 (floor ${floor}) "${t.text}" ${t.tag} ${t.fs}px`);
        }
      }
      pass++;

      // ── the pixel pass ──────────────────────────────────────────────────
      // For text over artwork, screenshot the region the words occupy with the
      // words HIDDEN, and measure the foreground against the WORST (nearest in
      // luminance) pixel actually behind them. The hero's own image runs from
      // near-white at the sun to near-black at the foreground, so an average
      // would hide exactly the case that fails.
      if (overImage.length) {
        await page.evaluate(() => {
          document.querySelectorAll('.mp-hero > *').forEach((n) => { n.style.visibility = 'hidden'; });
        });
        const shot = await page.screenshot({ type: 'png' });
        await page.evaluate(() => {
          document.querySelectorAll('.mp-hero > *').forEach((n) => { n.style.visibility = ''; });
        });
        const png = decodePng(shot);
        let worstPix = null;
        for (const t of overImage) {
          const probe = worstPixelFor(png, t.box, t.fg);
          if (!probe) continue;
          const margin = probe.c - t.floor;
          if (!worstPix || margin < worstPix.margin) {
            worstPix = { ...probe, text: t.text, floor: t.floor, margin, fs: t.fs };
          }
          if (probe.c < t.floor - 0.01) {
            fail++;
            problems.push(`${route} @${width}: PIXEL contrast ${probe.c.toFixed(2)}:1 ` +
              `(floor ${t.floor}) over artwork "${t.text}" ${t.tag} ${t.fs}px`);
          }
        }
        pass++;
        if (worstPix) {
          console.log(`${''.padEnd(16)} @${String(width).padEnd(5)} ` +
            `over artwork: ${overImage.length} nodes, tightest ${worstPix.c.toFixed(2)}:1 ` +
            `vs floor ${worstPix.floor} (+${worstPix.margin.toFixed(2)}) ${worstPix.fs}px ` +
            `"${String(worstPix.text).slice(0, 28)}"`);
        }
      }

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
