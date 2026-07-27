'use strict';

/**
 * Lawn Co-Pilot — indexation foundation (Phase 1).
 *
 * One canonical home for the whole product. The app is reachable on two hosts —
 * lawncopilot.com (root) and aiagent.ringlypro.com/lawncopilot — which is
 * duplicate content to a crawler. Everything here anchors to ONE canonical
 * origin (lawncopilot.com), so ranking signals consolidate instead of splitting.
 *
 * Provides: robots.txt, a live sitemap.xml (built from the real routes and the
 * companies actually in the database), a human-readable HTML hub that links
 * every page that should rank (so nothing is an orphan), a SoftwareApplication
 * JSON-LD block carrying the three real price tiers, and the canonical/OG head
 * tags each page injects.
 */

const { CANONICAL } = require('./tenancy');
const { PLAN_LIMITS, PLAN_ORDER } = require('./services/provision');
const { publishedAreas } = require('./data/service-areas');

function origin() { return CANONICAL(); }               // https://lawncopilot.com
function xml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Canonical + OG head tags ────────────────────────────────────────────────
// `path` is the clean path on the canonical domain, e.g. '' , '/for-companies',
// '/green-acres'. Always points at lawncopilot.com so the two hosts collapse.
function canonicalHead(pathname) {
  const url = origin() + (pathname || '');
  return `<link rel="canonical" href="${url}">\n<meta property="og:url" content="${url}">`;
}

function noindex() {
  return '<meta name="robots" content="noindex, nofollow">';
}

// ── SoftwareApplication JSON-LD (product pages), with the three real tiers ───
function softwareApplicationJsonLd() {
  const offers = PLAN_ORDER.map(id => {
    const p = PLAN_LIMITS[id];
    return {
      '@type': 'Offer',
      name: p.label,
      price: String(Math.round(p.price_cents / 100)),
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: String(Math.round(p.price_cents / 100)),
        priceCurrency: 'USD',
        unitCode: 'MON',
        unitText: 'month'
      },
      url: origin() + '/signup?plan=' + encodeURIComponent(id),
      category: p.tagline
    };
  });
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Lawn Co-Pilot',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    url: origin() + '/',
    description: 'The AI office for landscaping companies. One brain, eight AI employees — a receptionist that answers every call, an estimator that prices from property records, a dispatcher, a bookkeeper and more — from $35 a month.',
    offers,
    provider: { '@type': 'Organization', name: 'Digit2AI', url: 'https://digit2ai.com' }
  };
  // No aggregateRating: we do not fabricate reviews.
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/** The full head block product pages inject: canonical + OG url + SoftwareApplication. */
function productHead(pathname) {
  return canonicalHead(pathname) + '\n' + softwareApplicationJsonLd();
}

// ── robots.txt ──────────────────────────────────────────────────────────────
function robotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# Utility and per-company operator surfaces are not for the index',
    'Disallow: /api/',
    'Disallow: /mcp',
    'Disallow: /platform',
    'Disallow: /signin',
    'Disallow: /login',
    'Disallow: /reset',
    'Disallow: /l/',
    'Disallow: /*/admin',
    'Disallow: /*/portal',
    'Disallow: /*/admin/',
    'Disallow: /*/portal/',
    '',
    'Sitemap: ' + origin() + '/sitemap.xml',
    ''
  ].join('\n');
}

// ── sitemap.xml (live) ──────────────────────────────────────────────────────
// Static conversion pages + every published geo page + every live company page.
async function sitemapUrls() {
  const base = origin();
  const day = today();
  const urls = [
    { loc: base + '/', pri: '1.0', freq: 'daily' },
    { loc: base + '/for-companies', pri: '0.8', freq: 'weekly' },
    { loc: base + '/signup', pri: '0.7', freq: 'monthly' },
    { loc: base + '/sitemap', pri: '0.3', freq: 'weekly' }
  ];

  // Geo pages (Phase 3) — only the ones with real, published content.
  for (const a of publishedAreas()) {
    urls.push({ loc: `${base}/lawn-care/${a.slug}`, pri: '0.7', freq: 'monthly' });
  }

  // Every live company's public page. (The tenant row has created_at, not
  // updated_at, so lastmod is today — the page is rendered fresh each request.)
  try {
    const { Tenant } = require('./models');
    const tenants = await Tenant.findAll({
      where: { status: ['active', 'trialing'] },
      attributes: ['slug'], raw: true
    });
    for (const t of tenants) {
      if (!t.slug) continue;
      urls.push({ loc: `${base}/${t.slug}`, pri: '0.6', freq: 'weekly' });
    }
  } catch (e) { /* DB down: still ship the static URLs */ }

  return urls.map(u => ({ lastmod: day, ...u }));
}

async function sitemapXml() {
  const urls = await sitemapUrls();
  const body = urls.map(u =>
    `  <url><loc>${xml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod>` +
    `<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ── Human hub: /sitemap ─────────────────────────────────────────────────────
// A real, crawlable index so no page that should rank is an orphan. Links the
// product pages, every service area (when present) and every live company page.
async function hubHtml(base) {
  // `base` is the path prefix for links on the SERVING host ('' or '/lawncopilot').
  const areas = publishedAreas();
  let companies = [];
  try {
    const { Tenant } = require('./models');
    companies = await Tenant.findAll({
      where: { status: ['active', 'trialing'] },
      attributes: ['slug', 'name'], order: [['name', 'ASC']], raw: true
    });
  } catch (e) { companies = []; }

  const e = s => xml(s == null ? '' : s);
  const link = (href, text) => `<li><a href="${base}${href}">${e(text)}</a></li>`;

  const areaList = areas.length
    ? `<h2>Service areas</h2><ul class="cols">${areas.map(a => link('/lawn-care/' + a.slug, a.county + ', ' + a.state)).join('')}</ul>`
    : `<h2>Service areas</h2><p class="mut">Local service-area guides are being added county by county.</p>`;

  const coList = companies.length
    ? `<h2>Companies on Lawn Co-Pilot</h2><ul class="cols">${companies.map(c => link('/' + c.slug, c.name)).join('')}</ul>`
    : '';

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site index — Lawn Co-Pilot</title>
<meta name="description" content="Every Lawn Co-Pilot page: product, pricing, service areas and the companies running on it.">
${canonicalHead('/sitemap')}
<link rel="stylesheet" href="${base}/styles.css">
<style>.hubwrap{max-width:900px;margin:0 auto;padding:48px 24px}
.hubwrap h1{font-size:1.9rem;margin:0 0 6px}.hubwrap h2{font-size:1.1rem;margin:32px 0 10px}
.hubwrap ul{list-style:none;padding:0;margin:0}.hubwrap li{padding:5px 0}
.cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:2px 20px}
.hubwrap a{color:var(--green-700,#215e33);font-weight:600}.mut{color:#667}</style>
</head><body><div class="hubwrap">
<h1>Site index</h1>
<p class="mut">Everything on Lawn Co-Pilot, in one place.</p>
<h2>Product</h2>
<ul>
${link('/', 'Home — the AI office for landscaping companies')}
${link('/for-companies', 'Why Lawn Co-Pilot')}
${link('/#pricing', 'Pricing — Solo, Crew, Multi Trucks')}
${link('/signup', 'Start free')}
</ul>
${areaList}
${coList}
</div></body></html>`;
}

module.exports = {
  robotsTxt, sitemapXml, sitemapUrls, hubHtml,
  canonicalHead, noindex, productHead, softwareApplicationJsonLd, origin
};
