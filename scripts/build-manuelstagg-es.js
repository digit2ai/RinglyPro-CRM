// Server-render the Spanish CV from public/manuelstagg.html (AI-search audit item 3).
// Applies the page's own ES i18n dictionary to every [data-i18n] element so the Spanish
// strings live in the DOM a crawler receives — then writes public/manuelstagg-es.html.
// Re-run after editing the English page: node scripts/build-manuelstagg-es.js
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const SRC = path.join(__dirname, '..', 'public', 'manuelstagg.html');
const OUT = path.join(__dirname, '..', 'public', 'manuelstagg-es.html');
let html = fs.readFileSync(SRC, 'utf8');

// Extract the I18N object and evaluate it to get the ES dictionary.
const m = html.match(/const I18N = (\{[\s\S]*?\n\});/);
if (!m) { console.error('I18N block not found'); process.exit(1); }
const I18N = eval('(' + m[1] + ')');           // eslint-disable-line no-eval
const es = I18N.es, strip = (s) => String(s).replace(/<[^>]+>/g, '');

const $ = cheerio.load(html, { decodeEntities: false });

// Fill the DOM with Spanish.
$('[data-i18n]').each((i, el) => {
  const k = $(el).attr('data-i18n');
  if (es[k] !== undefined) $(el).html(es[k]);
});
$('[data-i18n-attr]').each((i, el) => {
  const k = $(el).attr('data-i18n');
  const a = $(el).attr('data-i18n-attr');
  if (es[k] !== undefined) $(el).attr(a, strip(es[k]));
});

// Language + SEO signals for the ES document.
$('html').attr('lang', 'es');
if (es.meta_title) $('title').text(strip(es.meta_title));
$('link[rel="canonical"]').attr('href', 'https://manuelstagg.com/es');
$('meta[property="og:url"]').attr('content', 'https://manuelstagg.com/es');
if (!$('meta[property="og:locale"]').length) $('meta[property="og:url"]').after('\n<meta property="og:locale" content="es_ES">');
$('.lang-btn[data-lang="es"]').addClass('active');
$('.lang-btn[data-lang="en"]').removeClass('active');
// Hero video: ship the Spanish intro as the served source on the ES page.
const heroEs = $('#heroVideo').attr('data-video-es');
if (heroEs) {
  $('#heroVideo').attr('src', heroEs);
  $('#heroVideo').attr('aria-label', 'Manuel Stagg — video de presentación');
}
$('#vidSound').attr('aria-label', 'Reproducir video con sonido');

// ProfilePage language
$('script[type="application/ld+json"]').each((i, el) => {
  let t = $(el).html();
  if (t && t.indexOf('"ProfilePage"') !== -1) { $(el).html(t.replace('"inLanguage": "en"', '"inLanguage": "es"')); }
});

let out = $.html();
// Force Spanish on first paint for humans too (the /es URL is explicitly Spanish).
out = out.replace(/\(function\(\)\{\s*let lang;[\s\S]*?setLang\(lang\);\s*\}\)\(\);/, "(function(){ setLang('es'); })();");
// Point the ES service worker/analytics at the same page identity (beacon page stays 'manuelstagg').

fs.writeFileSync(OUT, out);
console.log('wrote', OUT, '(' + out.length + ' bytes)');
console.log('lang:', $('html').attr('lang'), '| title:', $('title').text().slice(0, 60));
