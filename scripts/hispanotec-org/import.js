#!/usr/bin/env node
/*
 * Mirror hispanotec.org's content pages into /hispatec/, in hispanotec.org's
 * own theme (public/hispatec/org/site.css), so digit2ai.com/hispanotec (a GHL
 * frame around aiagent.ringlypro.com/hispatec/) carries the whole site.
 *
 *   node scripts/hispanotec-org/import.js
 *
 * ONE SOURCE, RE-RUNNABLE. Content comes from the WordPress REST API
 * (wp-json/wp/v2/pages|posts), never typed by hand, so re-running after the
 * association edits a page brings the mirror up to date. Images and PDFs are
 * downloaded into public/hispatec/org/media/ so nothing is hotlinked.
 *
 * MEMBERSHIP STAYS ON HISPANOTEC.ORG (owner decision 2026-10-15). Sign-up,
 * forms, login, account and payment pages are NOT mirrored: every link to
 * them keeps pointing at hispanotec.org, opening in a new tab (the page is
 * framed inside GHL, and a payment flow must not run inside someone else's
 * frame). The Hispanotec Digital join/login (camaravirtual.app cv-105) stays
 * beside it — both, as asked.
 *
 * The shared header and footer live in this folder (header.html,
 * footer.html) and are also injected into the landing page between
 * <!--HX-HEADER--> / <!--HX-FOOTER--> markers, so the landing and every
 * mirrored page cannot drift apart.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');

const ORIGIN = 'https://hispanotec.org';
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public', 'hispatec');
const MEDIA_DIR = path.join(OUT, 'org', 'media');
const MEDIA_URL = '/hispatec/org/media/';
const BASE = '/hispatec/';
const HERE = __dirname;

// Pages mirrored here. Everything else on hispanotec.org (sign-up, forms,
// account, payment, splash) is linked, not copied.
const PAGES = [
  'la-asociacion', 'bienvenida', 'quienes-somos', 'asociados-protectores',
  'membresias', 'noticias', 'contacto', 'decalogo', 'estatutos',
  'informacion-sobre-nuestros-dominios', 'aviso-legal', 'privacidad', 'cookies',
];
// Nav entry each page lights up (sub pages of the legal footer light none).
const NAV_OF = {
  'la-asociacion': 'la-asociacion', 'bienvenida': 'bienvenida', 'quienes-somos': 'quienes-somos',
  'asociados-protectores': 'asociados-protectores', 'membresias': 'membresias',
  'noticias': 'noticias', 'contacto': 'contacto',
};

const UA = 'Mozilla/5.0 (compatible; HispanotecMirror/1.0; +https://aiagent.ringlypro.com/hispatec/)';

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

const mediaMap = new Map(); // remote url -> local url
async function mirrorMedia(remote) {
  const clean = remote.split('#')[0].split('?')[0];
  if (mediaMap.has(clean)) return mediaMap.get(clean);
  const ext = (path.extname(new URL(clean).pathname) || '').toLowerCase();
  if (!/^\.(png|jpe?g|webp|gif|svg|pdf)$/.test(ext)) return null;
  const base = path.basename(new URL(clean).pathname, ext).replace(/[^a-z0-9._-]/gi, '-').slice(0, 80);
  const name = `${base}${ext}`;
  const file = path.join(MEDIA_DIR, name);
  if (!fs.existsSync(file)) {
    const r = await fetch(clean, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.warn('  media skipped', r.status, clean); mediaMap.set(clean, null); return null; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) { console.warn('  media too large', clean); mediaMap.set(clean, null); return null; }
    fs.writeFileSync(file, buf);
  }
  const local = MEDIA_URL + name;
  mediaMap.set(clean, local);
  return local;
}

// Cloudflare email obfuscation: /cdn-cgi/l/email-protection#<hex>
function cfDecode(hex) {
  const k = parseInt(hex.substr(0, 2), 16); let s = '';
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ k);
  return s;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decode = s => cheerio.load(`<i>${s}</i>`)('i').text();

/*
 * Elementor wraps everything in nested divs carrying layout classes we do not
 * load. The page is rebuilt as a flat sequence of semantic blocks; buttons
 * (elementor-button) become themed buttons, consecutive buttons share a row.
 */
const KEEP = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'b', 'em', 'i',
  'br', 'img', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption', 'hr', 'sup', 'sub', 'span']);

async function cleanContent(html, slugSet, postSlugs) {
  const $ = cheerio.load(`<main id="x">${html}</main>`, null, false);
  $('script,style,noscript,svg,iframe,form,input,button,link,meta').remove();
  $('[aria-hidden="true"]').filter((_, el) => !$(el).text().trim()).remove();

  // Flag Elementor buttons before classes are stripped.
  $('a.elementor-button, a[class*="elementor-button"]').attr('data-hx-btn', '1');
  // Elementor "div-only" text blocks (e.g. <div class="elementor-heading-title">) -> p
  $('div').each((_, el) => {
    const $el = $(el);
    if ($el.children().length === 0 && $el.text().trim()) $el.replaceWith(`<p>${$el.html()}</p>`);
  });

  // Rewrite links and media.
  const imgs = $('img').toArray();
  for (const el of imgs) {
    const $el = $(el);
    const src = $el.attr('data-src') || $el.attr('src') || '';
    if (!/^https?:/.test(src)) { $el.remove(); continue; }
    const local = src.includes('/wp-content/uploads/') ? await mirrorMedia(src) : null;
    if (!local) { $el.remove(); continue; }
    const attrs = { src: local, alt: $el.attr('alt') || '', loading: 'lazy', decoding: 'async' };
    if ($el.attr('width')) attrs.width = $el.attr('width');
    if ($el.attr('height')) attrs.height = $el.attr('height');
    el.attribs = attrs;
  }
  for (const el of $('a').toArray()) {
    const $el = $(el);
    let href = ($el.attr('href') || '').trim();
    const btn = $el.attr('data-hx-btn') === '1';
    const label = $el.text().replace(/\s+/g, ' ').trim();
    if (!label && !$el.find('img').length) { $el.remove(); continue; }
    if (href.startsWith('/cdn-cgi/l/email-protection#')) href = 'mailto:' + cfDecode(href.split('#')[1]);
    if (href.startsWith('/')) href = ORIGIN + href;
    const attrs = {};
    if (/^mailto:|^tel:/i.test(href)) attrs.href = href;
    else if (/^#/.test(href)) attrs.href = href;
    else if (/^https?:\/\/(www\.)?hispanotec\.org/i.test(href)) {
      const u = new URL(href);
      if (u.pathname.includes('/wp-content/uploads/')) {
        const local = await mirrorMedia(href);
        attrs.href = local || href;
        if (local) attrs.target = '_blank';
      } else {
        const slug = u.pathname.replace(/^\/+|\/+$/g, '');
        if (slug === '') attrs.href = BASE;
        else if (slugSet.has(slug) || postSlugs.has(slug)) attrs.href = BASE + slug + '/' + (u.hash || '');
        else { attrs.href = u.href; attrs.target = '_blank'; attrs.rel = 'noopener'; } // membership flow stays there
      }
    } else if (/^https?:/i.test(href)) { attrs.href = href; attrs.target = '_blank'; attrs.rel = 'noopener'; }
    else { $el.replaceWith($el.html()); continue; }
    if (btn) { attrs.class = 'hx-btn hx-btn-navy'; $el.html(esc(label)); }
    el.attribs = attrs;
  }

  // Strip every attribute except the ones set above, unwrap unknown tags.
  $('#x *').each((_, el) => {
    if (el.type !== 'tag') return;
    const tag = el.name;
    if (!KEEP.has(tag)) return;
    if (tag === 'a' || tag === 'img') return;
    const keep = {};
    if ((tag === 'td' || tag === 'th') && el.attribs.colspan) keep.colspan = el.attribs.colspan;
    el.attribs = keep;
  });
  let changed = true;
  while (changed) {
    changed = false;
    $('#x *').each((_, el) => {
      if (el.type === 'tag' && !KEEP.has(el.name)) { $(el).prepend(' ').append(' '); $(el).replaceWith($(el).contents()); changed = true; }
    });
  }
  $('#x span').each((_, el) => { $(el).replaceWith($(el).contents()); });
  // Group consecutive buttons into one action row.
  $('#x a.hx-btn').each((_, el) => {
    const $el = $(el);
    if ($el.parent().is('.hx-actions')) return;
    if ($el.parent().is('p') && $el.parent().text().trim() === $el.text().trim()) $el.parent().replaceWith($el);
  });
  $('#x a.hx-btn').each((_, el) => {
    const $el = $(el);
    if ($el.parent().is('.hx-actions')) return;
    const row = $('<div class="hx-actions"></div>');
    $el.before(row);
    let cur = $el;
    while (cur && cur.length && cur.is('a.hx-btn')) {
      const next = cur.next();
      row.append(cur);
      cur = next;
    }
  });
  $('#x .hx-actions').each((i, el) => { $(el).find('a.hx-btn').first().attr('class', 'hx-btn hx-btn-gold'); });
  $('#x p').each((_, el) => { const $el = $(el); if (!$el.text().trim() && !$el.find('img').length) $el.remove(); });
  let out = $('#x').html() || '';
  out = out.replace(/\n\s*\n+/g, '\n').replace(/>\s+</g, '>\n<');
  return out.trim();
}

function partial(name) { return fs.readFileSync(path.join(HERE, name), 'utf8'); }
function header(current, withLang) {
  let h = partial('header.html');
  h = h.replace(/<a ([^>]*data-nav="([a-z-]+)"[^>]*)>/g, (m, attrs, key) => key === current ? `<a ${attrs} aria-current="page">` : m);
  if (!withLang) h = h.replace(/\s*<!--LANG-->[\s\S]*?<!--\/LANG-->/, '');
  return h.replace(/<!--\/?LANG-->/g, '');
}

function shell({ title, description, slug, nav, eyebrow, heading, lead, body, sourceUrl, date }) {
  const canonical = `https://aiagent.ringlypro.com${BASE}${slug}/`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | HISPANOTEC</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)} | HISPANOTEC">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${date ? 'article' : 'website'}">
<meta property="og:image" content="https://aiagent.ringlypro.com${MEDIA_URL}fondo-splash-og.jpg">
<meta name="theme-color" content="#1A2F4A">
<link rel="icon" href="${MEDIA_URL}logo-hispanotec-240-66x66.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/hispatec/org/site.css?v=${VERSION}">
</head>
<body class="hx-page">
${header(nav, false)}
<main>
<section class="hx-hero">
${eyebrow ? `<div class="hx-eyebrow">${esc(eyebrow)}</div>` : ''}
<h1>${esc(heading)}</h1>
${lead ? `<p>${esc(lead)}</p>` : ''}
<hr class="hx-gold-rule">
</section>
<article class="hx-prose">
${date ? `<p class="hx-meta">${esc(date)}</p>` : ''}
${body}
</article>
<p class="hx-source">Contenido de la Asociación HISPANOTEC, publicado también en <a href="${esc(sourceUrl)}" target="_blank" rel="noopener">hispanotec.org</a>.</p>
</main>
${partial('footer.html')}
<script src="/hispatec/org/site.js?v=${VERSION}" defer></script>
</body>
</html>
`;
}

let VERSION = '1';

// The page's own first H1 becomes the hero; a short first paragraph the lead.
function splitHero(bodyHtml, fallbackTitle) {
  const $ = cheerio.load(`<div id="b">${bodyHtml}</div>`, null, false);
  const b = $('#b');
  let eyebrow = '', heading = fallbackTitle, lead = '';
  const first = b.children().first();
  if (first.is('p,h5,h6') && first.text().trim().length < 40 && first.next().is('h1')) { eyebrow = first.text().trim(); first.remove(); }
  const h1 = b.children('h1').first();
  if (h1.length && b.children().index(h1) <= 1) {
    heading = h1.text().replace(/\s+/g, ' ').trim();
    const prev = h1.prev();
    if (prev.is('p,h5,h6') && prev.text().trim().length < 40) { eyebrow = prev.text().trim(); prev.remove(); }
    const nxt = h1.next();
    if (nxt.is('p,h3') && nxt.text().trim().length < 240 && !nxt.find('a,img').length) { lead = nxt.text().replace(/\s+/g, ' ').trim(); nxt.remove(); }
    h1.remove();
  }
  return { eyebrow, heading, lead, body: b.html().trim() };
}

function describe(html, fallback) {
  const t = cheerio.load(`<i>${html}</i>`)('i').text().replace(/\s+/g, ' ').trim();
  const s = t.slice(0, 158);
  return s ? (t.length > 158 ? s.replace(/\s+\S*$/, '') + '…' : s) : fallback;
}

const fmtDate = iso => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });

async function main() {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const slugSet = new Set(PAGES);
  const pages = await getJSON(`${ORIGIN}/wp-json/wp/v2/pages?per_page=100&_fields=id,slug,link,title,content,modified`);
  const posts = await getJSON(`${ORIGIN}/wp-json/wp/v2/posts?per_page=100&_fields=id,slug,link,title,content,excerpt,date,modified`);
  const postSlugs = new Set(posts.map(p => p.slug));
  VERSION = crypto.createHash('sha1')
    .update(fs.readFileSync(path.join(OUT, 'org', 'site.css')))
    .update(fs.readFileSync(path.join(OUT, 'org', 'site.js'))).digest('hex').slice(0, 8);

  // Always mirror the brand assets the header/footer and OG tags use.
  for (const u of ['/wp-content/uploads/2026/05/logo-hispanotec-240.png', '/wp-content/uploads/2026/05/logo-hispanotec-240-66x66.png',
    '/wp-content/uploads/2026/04/fondo-splash-og.jpg']) await mirrorMedia(ORIGIN + u);

  const written = [];
  for (const slug of PAGES) {
    const p = pages.find(x => x.slug === slug && x.link.replace(/\/$/, '').endsWith('/' + slug));
    if (!p) { console.warn('missing page', slug); continue; }
    let body = await cleanContent(p.content.rendered, slugSet, postSlugs);
    if (slug === 'noticias') body = newsIndex(posts, body);
    const title = decode(p.title.rendered);
    const h = splitHero(body, title);
    const html = shell({ title, description: describe(h.lead || h.body, title), slug, nav: NAV_OF[slug] || '',
      eyebrow: h.eyebrow, heading: h.heading, lead: h.lead, body: h.body, sourceUrl: p.link });
    write(slug, html); written.push(slug);
  }
  for (const p of posts) {
    const body = await cleanContent(p.content.rendered, slugSet, postSlugs);
    const title = decode(p.title.rendered);
    const h = splitHero(body, title);
    const html = shell({ title, description: describe(p.excerpt.rendered, title), slug: p.slug, nav: 'noticias',
      eyebrow: 'Noticias', heading: title, lead: '', body: (h.heading !== title ? `<h2>${esc(h.heading)}</h2>` : '') + (h.lead ? `<p><strong>${esc(h.lead)}</strong></p>` : '') + h.body,
      sourceUrl: p.link, date: fmtDate(p.date) });
    write(p.slug, html); written.push(p.slug);
  }

  injectLanding();
  fs.writeFileSync(path.join(OUT, 'org', 'manifest.json'), JSON.stringify({
    source: ORIGIN, imported_at: new Date().toISOString(), pages: written,
    media: [...mediaMap.values()].filter(Boolean).sort(),
  }, null, 2) + '\n');
  console.log(`wrote ${written.length} pages, ${[...mediaMap.values()].filter(Boolean).length} media files`);
}

// The WordPress "Noticias" page lists posts with an Elementor loop widget; it
// is rebuilt from the posts API so a new post appears on the next import.
function newsIndex(posts, body) {
  const $ = cheerio.load(`<div id="b">${body}</div>`, null, false);
  const b = $('#b');
  // Keep the intro (up to the loop) and the closing call to action (after it).
  const kids = b.children().toArray();
  const firstLink = kids.findIndex(el => $(el).find(`a[href^="${BASE}"]`).filter((_, a) => posts.some(p => $(a).attr('href').startsWith(BASE + p.slug))).length || $(el).is('h2') && posts.some(p => $(el).text().includes(decode(p.title.rendered).slice(0, 30))));
  let lastLink = -1;
  kids.forEach((el, i) => { if ($(el).text().match(/Leer más|\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) \d+, \d{4}/i)) lastLink = i; });
  const head = firstLink > 0 ? kids.slice(0, firstLink) : kids;
  const tail = lastLink >= 0 ? kids.slice(lastLink + 1) : [];
  const cards = posts.map(p => `<div class="hx-card"><p class="hx-meta">${esc(fmtDate(p.date))}</p><h3><a href="${BASE}${p.slug}/">${esc(decode(p.title.rendered))}</a></h3><p>${esc(describe(p.excerpt.rendered, ''))}</p><p><a href="${BASE}${p.slug}/">Leer más</a></p></div>`).join('\n');
  return head.map(el => $.html(el)).join('\n') + '\n' + cards + '\n' + tail.map(el => $.html(el)).join('\n');
}

function write(slug, html) {
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log('  /hispatec/' + slug + '/');
}

function injectLanding() {
  const file = path.join(OUT, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const swap = (tag, content) => {
    const re = new RegExp(`<!--${tag}-->[\\s\\S]*?<!--\\/${tag}-->`);
    if (!re.test(html)) throw new Error(`landing is missing <!--${tag}--> markers`);
    html = html.replace(re, `<!--${tag}-->\n${content.trim()}\n<!--/${tag}-->`);
  };
  swap('HX-HEADER', header('', true));
  swap('HX-FOOTER', partial('footer.html'));
  html = html.replace(/\/hispatec\/org\/site\.(css|js)\?v=[a-z0-9]+/g, (m, ext) => `/hispatec/org/site.${ext}?v=${VERSION}`);
  fs.writeFileSync(file, html);
  console.log('  /hispatec/ (header + footer injected)');
}

module.exports = { cleanContent, cfDecode, splitHero };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
