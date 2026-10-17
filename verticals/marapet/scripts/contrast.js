'use strict';
/**
 * Computes the contrast ratio of every text/background pair MaraPet declares,
 * straight out of public/theme.css, so a token nobody measured cannot ship.
 *
 * The SIT calls check() and fails on any pair under its floor. This is the
 * grep-able half; the browser half (which rule actually won, composited down
 * the real ancestor chain) is a separate pass a stylesheet parse cannot do.
 */
const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', 'public', 'theme.css');

function lum(hex) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const ch = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Read the literal hex values of the tokens we assert on. */
function tokens() {
  const css = fs.readFileSync(CSS, 'utf8');
  // Only the :root block, so a dark-mode restatement is not mistaken for light.
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css);
  const dark = /:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/.exec(css);
  const parse = (block) => {
    const out = {};
    const re = /--(mp-[a-z0-9-]+)\s*:\s*([^;]+);/g;
    let m;
    while ((m = re.exec(block)) !== null) out[m[1]] = m[2].trim();
    return out;
  };
  const light = root ? parse(root[1]) : {};
  const d = dark ? parse(dark[1]) : {};
  const resolve = (map, name, seen) => {
    const v = map[name];
    if (!v) return null;
    const ref = /^var\(--(mp-[a-z0-9-]+)\)$/.exec(v);
    if (ref) {
      if (seen && seen.has(ref[1])) return null;
      const s = new Set(seen || []); s.add(name);
      return resolve(map, ref[1], s);
    }
    return /^#[0-9a-f]{3,8}$/i.test(v) ? v : null;
  };
  return {
    light: (n) => resolve(light, n),
    dark: (n) => resolve(d, n) || resolve(light, n),
    rawLight: light, rawDark: d
  };
}

// floor 4.5 = WCAG AA for normal text; 3.0 = AA for large text (24px+ bold).
const PAIRS = [
  { fg: 'mp-text',        bg: 'mp-bg',    floor: 4.5, what: 'body text on the page' },
  { fg: 'mp-text-2',      bg: 'mp-bg',    floor: 4.5, what: 'secondary text on the page' },
  { fg: 'mp-text-3',      bg: 'mp-bg',    floor: 4.5, what: 'label text on the page' },
  { fg: 'mp-text',        bg: 'mp-bg-2',  floor: 4.5, what: 'body text on a flat card' },
  { fg: 'mp-text-2',      bg: 'mp-bg-2',  floor: 4.5, what: 'secondary text on a flat card' },
  { fg: 'mp-text-3',      bg: 'mp-bg-2',  floor: 4.5, what: 'label text on a flat card' },
  { fg: 'mp-text-accent', bg: 'mp-bg',    floor: 4.5, what: 'a link, the only orange that may be text' },
  { fg: 'mp-on-accent',   bg: 'mp-orange5', floor: 4.5, what: 'a primary button label on the brand fill' },
  { fg: 'mp-on-accent',   bg: 'mp-orange6', floor: 4.5, what: 'a primary button label, hovered' }
];

function check() {
  const t = tokens();
  const results = [];
  for (const mode of ['light', 'dark']) {
    for (const p of PAIRS) {
      const fg = t[mode](p.fg);
      const bg = t[mode](p.bg);
      if (!fg || !bg) {
        results.push({ mode, ...p, ok: false, reason: 'token_unresolved', fg, bg });
        continue;
      }
      const r = ratio(fg, bg);
      results.push({ mode, ...p, fg, bg, ratio: r, ok: r >= p.floor });
    }
  }
  // The brand fill must STILL fail as text — if it ever passes, somebody
  // changed --mp-orange5 and the brand moved, which is a decision, not a tweak.
  const brandOnWhite = ratio(t.light('mp-orange5'), '#ffffff');
  const whiteOnBrand = brandOnWhite;
  return {
    results,
    failures: results.filter((r) => !r.ok),
    brand_fill_as_text_ratio: brandOnWhite,
    brand_fill_is_text_safe: whiteOnBrand >= 4.5
  };
}

if (require.main === module) {
  const out = check();
  for (const r of out.results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${String(r.ratio || '-').padStart(6)}:1  ` +
      `${r.mode.padEnd(5)} ${r.fg} on ${r.bg}  (floor ${r.floor})  ${r.what}`);
  }
  console.log('');
  console.log(`brand fill #ff6f20 as text: ${out.brand_fill_as_text_ratio}:1 ` +
    `(${out.brand_fill_is_text_safe ? 'PASSES — the brand colour moved, check that was intended' : 'fails, as expected: fill only'})`);
  console.log(`${out.failures.length} failure(s)`);
  process.exit(out.failures.length ? 1 : 0);
}

module.exports = { lum, ratio, tokens, check, PAIRS };
