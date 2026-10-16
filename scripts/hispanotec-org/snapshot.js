#!/usr/bin/env node
/*
 * Exact copy of hispanotec.org under /hispatec/, plus the Hispanotec Digital
 * addition on the home page. digit2ai.com/hispanotec is a GHL frame around
 * aiagent.ringlypro.com/hispatec/, so this is what that address shows.
 *
 *   node scripts/hispanotec-org/snapshot.js
 *
 * THE PAGE IS IDENTICAL BECAUSE IT IS THEIRS, NOT A REBUILD (owner,
 * 2026-10-15: "the landing page must be identical to the source"). A first
 * version rebuilt the content in our own layout and lost the world-map hero,
 * the Cormorant titles, the icon cards and the menu. Now a real browser loads
 * each hispanotec.org page, lets WordPress/Elementor finish rendering, and the
 * finished DOM is saved with every stylesheet, font and image self-hosted
 * under /hispatec/org/wp/. Their scripts are dropped (trackers, cookie
 * banner, jQuery); the two behaviours that need JS — the mobile menu and the
 * "La asociación" dropdown — are replaced by org/wp-menu.js.
 *
 * MEMBERSHIP STAYS ON HISPANOTEC.ORG (owner decision). Sign-up, interest
 * forms, login, account and payment pages are not copied; links to them open
 * hispanotec.org in a new tab (a payment must not run inside a GHL frame).
 *
 * THE ADDITION lives in scripts/hispanotec-org/digital.html and is inserted
 * on the home page just above their footer. Its stylesheet is rewritten so
 * every selector is scoped to #d2-digital: their theme cannot restyle it and
 * it cannot restyle their page. Edit digital.html, never the generated
 * public/hispatec/**.html.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const ORIGIN = 'https://hispanotec.org';
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public', 'hispatec');
const WP_DIR = path.join(OUT, 'org', 'wp');
const WP_URL = '/hispatec/org/wp/';
const BASE = '/hispatec/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// Copied pages. Everything else on hispanotec.org (inscripción, forms, login,
// account, payment, splash) is linked, not copied.
const PAGES = [
  '', 'la-asociacion', 'bienvenida', 'quienes-somos', 'asociados-protectores',
  'membresias', 'noticias', 'contacto', 'decalogo', 'estatutos',
  'informacion-sobre-nuestros-dominios', 'aviso-legal', 'privacidad', 'cookies',
  'formulario-de-interes',
];
// WordPress pages being retired (owner, 2026-10-15): sign-up, login and
// account now live in the digital ecosystem (cv-105), so links to them point
// at our pages instead of hispanotec.org.
const REPLACED = {
  'inscripcion': BASE + 'formulario-de-interes/',
  'tipos-de-membresia': BASE + 'membresias/',
  'iniciar-sesion': '/cv-105/login',
  'mi-cuenta': '/cv-105/login',
};

// ── assets ────────────────────────────────────────────────────────────────
const assetMap = new Map();
function localName(u) {
  const url = new URL(u);
  let p = url.pathname.replace(/^\/+/, '').replace(/^wp-content\//, '');
  const ext = path.extname(p).toLowerCase();
  let base = p.slice(0, p.length - ext.length).replace(/[^a-z0-9._-]+/gi, '_');
  if (base.length > 90) base = base.slice(-90);
  return base + ext;
}
async function fetchBuf(u) {
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return Buffer.from(await r.arrayBuffer());
}
// Mirror any hispanotec.org asset; returns local URL or null.
async function mirror(u, { css = false } = {}) {
  let abs;
  try { abs = new URL(u, ORIGIN); } catch { return null; }
  if (!/(^|\.)hispanotec\.org$/i.test(abs.hostname)) return null;
  abs.hash = '';
  const key = abs.origin + abs.pathname;
  if (assetMap.has(key)) return assetMap.get(key);
  const ext = path.extname(abs.pathname).toLowerCase();
  if (!/^\.(css|png|jpe?g|webp|gif|svg|ico|pdf|woff2?|ttf|eot|otf)$/.test(ext)) return null;
  const name = localName(key);
  const file = path.join(WP_DIR, name);
  const local = WP_URL + name;
  assetMap.set(key, local);
  try {
    if (ext === '.css' || css) {
      let text = (await fetchBuf(abs.href)).toString('utf8');
      text = await rewriteCssUrls(text, abs.href);
      fs.writeFileSync(file, text);
    } else if (!fs.existsSync(file)) {
      const buf = await fetchBuf(abs.href);
      if (buf.length > 15 * 1024 * 1024) throw new Error('too large');
      fs.writeFileSync(file, buf);
    }
  } catch (e) {
    console.warn('  asset skipped:', e.message);
    assetMap.set(key, null);
    return null;
  }
  return local;
}
async function rewriteCssUrls(css, baseUrl) {
  const urls = [...new Set([...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map(m => m[2]))];
  for (const raw of urls) {
    if (/^(data:|#)/.test(raw)) continue;
    let abs; try { abs = new URL(raw, baseUrl).href; } catch { continue; }
    const local = await mirror(abs);
    const to = local || abs;
    css = css.split(raw).join(to);
  }
  // @import of hispanotec.org stylesheets
  for (const m of css.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]\)?/g)) {
    const local = await mirror(new URL(m[1], baseUrl).href, { css: true });
    if (local) css = css.split(m[1]).join(local);
  }
  return css;
}

// ── links ─────────────────────────────────────────────────────────────────
function cfDecode(hex) {
  const k = parseInt(hex.substr(0, 2), 16); let s = '';
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ k);
  return s;
}
function rewriteHref(href, copied) {
  if (!href) return null;
  href = href.trim();
  if (href.startsWith('/cdn-cgi/l/email-protection#')) return { href: 'mailto:' + cfDecode(href.split('#')[1]) };
  if (/^(mailto:|tel:|#|javascript:)/i.test(href)) return { href };
  let u; try { u = new URL(href, ORIGIN); } catch { return { href }; }
  if (!/(^|\.)hispanotec\.org$/i.test(u.hostname)) return { href: u.href, external: true };
  const slug = u.pathname.replace(/^\/+|\/+$/g, '');
  if (copied.has(slug)) return { href: BASE + (slug ? slug + '/' : '') + (u.hash || '') };
  const top = slug.split('/')[0];
  if (REPLACED[top]) return { href: REPLACED[top], external: REPLACED[top].startsWith('/cv-105') };
  if (u.pathname.includes('/wp-content/uploads/')) return { href: u.href, media: true };
  return { href: u.href, external: true }; // membership flow, forms, account: stays on hispanotec.org
}

// ── CSS scoping for the addition ──────────────────────────────────────────
function scopeCss(css, scope) {
  let out = '', i = 0;
  const n = css.length;
  function readBlock(start) { // returns index after matching }
    let depth = 0, j = start;
    for (; j < n; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') { depth--; if (depth === 0) return j + 1; }
    }
    return n;
  }
  while (i < n) {
    const open = css.indexOf('{', i);
    if (open === -1) { out += css.slice(i); break; }
    const prelude = css.slice(i, open);
    const end = readBlock(open);
    const inner = css.slice(open + 1, end - 1);
    const pre = prelude.trim();
    if (pre.startsWith('@media') || pre.startsWith('@supports') || pre.startsWith('@container')) {
      out += prelude + '{' + scopeCss(inner, scope) + '}';
    } else if (pre.startsWith('@')) {
      out += prelude + '{' + inner + '}'; // @keyframes, @font-face: untouched
    } else {
      const lead = prelude.match(/^\s*/)[0];
      const sel = pre.replace(/\/\*[\s\S]*?\*\//g, '').trim().split(',').map(s => {
        s = s.trim();
        if (!s) return s;
        if (/^(:root|html|body)$/.test(s)) return scope;
        if (/^(html|body)\b/.test(s)) return s.replace(/^(html|body)\s*/, scope + ' ');
        if (s === '*' || s.startsWith('*')) return scope + ' ' + s + ', ' + scope;
        return scope + ' ' + s;
      }).join(', ');
      out += lead + sel + ' {' + inner + '}';
    }
    i = end;
  }
  return out;
}

// ── capture ───────────────────────────────────────────────────────────────
async function capture(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  // Scroll the whole page so lazy backgrounds and entrance animations fire.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 1500));
  const html = await page.evaluate(() => {
    const kill = s => document.querySelectorAll(s).forEach(e => e.remove());
    kill('script, noscript, iframe[src*="googletagmanager"], .elementor-sticky__spacer, #wpadminbar');
    kill('[class^="cky-"], [class*=" cky-"], [id^="cky"]');
    kill('link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"], link[rel="dns-prefetch"], link[rel="preconnect"]:not([href*="fonts.g"]), link[rel="alternate"], link[rel="EditURI"], link[rel="shortlink"], link[rel="https://api.w.org/"], link[rel="pingback"], link[rel="canonical"], meta[name="generator"], meta[name="msapplication-TileImage"]');
    document.querySelectorAll('.elementor-nav-menu__container, .sub-menu').forEach(e => { e.removeAttribute('style'); });
    document.documentElement.className = document.documentElement.className.split(' ').filter(c => !/^(ua-|no-)/.test(c)).join(' ');
    document.querySelectorAll('.elementor-invisible').forEach(e => e.classList.remove('elementor-invisible'));
    document.querySelectorAll('.elementor-sticky').forEach(e => { e.removeAttribute('style'); e.classList.remove('elementor-sticky--active', 'elementor-sticky--effects'); e.classList.add('hx-sticky'); });
    document.querySelectorAll('[class*="elementor-element"]').forEach(e => { if (e.classList.contains('e-lazyloaded') === false && e.classList.contains('e-con')) e.classList.add('e-lazyloaded'); });
    return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
  });
  await page.close();
  return html;
}

async function processPage(html, slug, copied, digital) {
  const $ = cheerio.load(html);
  // Stylesheets
  for (const el of $('link[rel="stylesheet"]').toArray()) {
    const href = $(el).attr('href');
    if (/fonts\.googleapis\.com/.test(href)) continue;
    const local = await mirror(href, { css: true });
    if (local) $(el).attr('href', local); else $(el).remove();
  }
  for (const el of $('style').toArray()) $(el).text(await rewriteCssUrls($(el).text(), ORIGIN + '/'));
  // Images
  for (const el of $('img, source').toArray()) {
    const $el = $(el);
    for (const a of ['src', 'data-src']) {
      const v = $el.attr(a); if (!v) continue;
      const local = await mirror(v); if (local) $el.attr(a, local);
    }
    for (const a of ['srcset', 'data-srcset']) {
      const v = $el.attr(a); if (!v) continue;
      const parts = [];
      for (const part of v.split(',')) {
        const [u, d] = part.trim().split(/\s+/);
        const local = await mirror(u);
        parts.push((local || u) + (d ? ' ' + d : ''));
      }
      $el.attr(a, parts.join(', '));
    }
  }
  for (const el of $('[style*="url("]').toArray()) $(el).attr('style', await rewriteCssUrls($(el).attr('style'), ORIGIN + '/'));
  for (const el of $('link[rel="icon"], link[rel="apple-touch-icon"]').toArray()) {
    const local = await mirror($(el).attr('href')); if (local) $(el).attr('href', local);
  }
  for (const el of $('meta[property="og:image"], meta[name="twitter:image"]').toArray()) {
    const local = await mirror($(el).attr('content')); if (local) $(el).attr('content', 'https://aiagent.ringlypro.com' + local);
  }
  // Links
  for (const el of $('a[href]').toArray()) {
    const r = rewriteHref($(el).attr('href'), copied);
    if (!r) continue;
    if (r.media) { const local = await mirror(r.href); $(el).attr('href', local || r.href); $(el).attr('target', '_blank'); continue; }
    $(el).attr('href', r.href);
    if (r.external) { $(el).attr('target', '_blank'); $(el).attr('rel', 'noopener'); }
  }
  $('meta[property="og:url"]').attr('content', `https://aiagent.ringlypro.com${BASE}${slug ? slug + '/' : ''}`);
  $('head').append(`\n<link rel="canonical" href="https://aiagent.ringlypro.com${BASE}${slug ? slug + '/' : ''}">\n<link rel="stylesheet" href="/hispatec/org/wp-menu.css?v=${VERSION}">\n`);
  $('body').append(`\n<script src="/hispatec/org/wp-menu.js?v=${VERSION}" defer></script>\n`);

  if (slug === 'formulario-de-interes') {
    const form = $('.elementor-widget-form').first();
    if (!form.length) throw new Error('formulario-de-interes: Elementor form widget not found -- their page changed, update snapshot.js');
    form.html('<div class="elementor-widget-container">' + fs.readFileSync(path.join(__dirname, 'signup-form.html'), 'utf8') + '</div>');
    $('head').append(`<link rel="stylesheet" href="/hispatec/org/signup.css?v=${VERSION}">\n`);
    $('body').append(`<script src="/hispatec/org/signup.js?v=${VERSION}" defer></script>\n`);
  }
  if (slug === '' && digital) {
    const $d = cheerio.load(`<div id="hx-digital-wrap">${digital}</div>`, null, false);
    $d('style[data-d2-scope]').each((_, s) => { $d(s).text(scopeCss($d(s).text(), '#d2-digital')); });
    const footer = $('[data-elementor-type="footer"]').first();
    const block = `\n<!-- ═══ HISPANOTEC DIGITAL (Digit2AI addition — source: scripts/hispanotec-org/digital.html) ═══ -->\n<link rel="stylesheet" href="/hispatec/org/site.css?v=${VERSION}">\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&display=swap" rel="stylesheet">\n` + $d('#hx-digital-wrap').html() + '\n<!-- ═══ /HISPANOTEC DIGITAL ═══ -->\n';
    if (footer.length) footer.before(block); else $('body').append(block);
  }
  return $.html();
}

let VERSION = '1';
async function main() {
  fs.mkdirSync(WP_DIR, { recursive: true });
  VERSION = crypto.createHash('sha1').update(fs.readFileSync(path.join(OUT, 'org', 'wp-menu.js')))
    .update(fs.readFileSync(path.join(OUT, 'org', 'wp-menu.css'))).update(fs.readFileSync(path.join(OUT, 'org', 'site.css')))
    .update(fs.readFileSync(path.join(OUT, 'org', 'signup.css'))).update(fs.readFileSync(path.join(OUT, 'org', 'signup.js'))).digest('hex').slice(0, 8);
  const posts = await (await fetch(`${ORIGIN}/wp-json/wp/v2/posts?per_page=100&_fields=slug`, { headers: { 'User-Agent': UA } })).json();
  const slugs = [...PAGES, ...posts.map(p => p.slug)];
  const copied = new Set(slugs);
  const digital = fs.readFileSync(path.join(__dirname, 'digital.html'), 'utf8');
  const browser = await puppeteer.launch({ headless: 'new' });
  try {
    for (const slug of slugs) {
      const html = await capture(browser, `${ORIGIN}/${slug ? slug + '/' : ''}`);
      const out = await processPage(html, slug, copied, digital);
      const dir = slug ? path.join(OUT, slug) : OUT;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), out);
      console.log('  /hispatec/' + (slug ? slug + '/' : ''));
    }
  } finally { await browser.close(); }
  const files = [...assetMap.values()].filter(Boolean).sort();
  fs.writeFileSync(path.join(OUT, 'org', 'manifest.json'), JSON.stringify({ source: ORIGIN, captured_at: new Date().toISOString(), pages: slugs, assets: files }, null, 2) + '\n');
  console.log(`captured ${slugs.length} pages, ${files.length} assets`);
}

module.exports = { scopeCss, rewriteHref };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
