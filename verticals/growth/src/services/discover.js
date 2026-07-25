'use strict';

/**
 * Digit2AI Growth — repo scanner ("Add a vertical" utility).
 *
 * Discovers candidate brands from the actual repo so any vertical not yet in
 * "Nuestras marcas" can be added in one click:
 *   1) verticals/<slug>/  directories (self-contained sub-apps)
 *   2) custom domains wired in src/app.js  (host === 'x.app' handlers)
 *   3) public/*-teaser.html / *-landing.html marketing pages
 * Candidates already present in gr_brands (by slug or host) are filtered out.
 */

const fs = require('fs');
const path = require('path');
const { Brand } = require('../models');

const REPO_ROOT = path.resolve(__dirname, '../../../..'); // verticals/growth/src/services -> repo root

function titleize(slug) {
  return String(slug).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function hostOf(url) { try { return new URL(url).host.toLowerCase().replace(/^www\./, ''); } catch { return null; } }

function scanVerticals() {
  const dir = path.join(REPO_ROOT, 'verticals');
  const out = [];
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return out; }
  for (const slug of names) {
    if (slug === 'growth') continue;
    out.push({
      slug, name: titleize(slug), source: 'vertical',
      url: `https://aiagent.ringlypro.com/${slug}`,
      hint: `verticals/${slug}/ (path-mounted sub-app)`
    });
  }
  return out;
}

function scanCustomDomains() {
  const app = safeRead(path.join(REPO_ROOT, 'src', 'app.js'));
  const out = [], seen = new Set();
  // host === 'orbup.app'  /  host === 'www.orbup.app'
  const re = /host\s*===\s*['"]([a-z0-9.-]+\.[a-z]{2,})['"]/gi;
  let m;
  while ((m = re.exec(app))) {
    const host = m[1].toLowerCase().replace(/^www\./, '');
    if (seen.has(host)) continue; seen.add(host);
    const slug = host.split('.')[0];
    out.push({ slug, name: titleize(slug), source: 'domain', url: `https://${host}`, hint: `custom domain wired in src/app.js` });
  }
  return out;
}

function scanLandingPages() {
  const dir = path.join(REPO_ROOT, 'public');
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /(-teaser|-landing)\.html$/i.test(f)); } catch { return out; }
  for (const f of files) {
    const slug = f.replace(/(-teaser|-landing)\.html$/i, '');
    out.push({ slug, name: titleize(slug), source: 'landing', url: `https://aiagent.ringlypro.com/${f}`, hint: `public/${f}` });
  }
  return out;
}

async function discover(ownerId) {
  const existing = await Brand.findAll({ where: { owner_id: ownerId }, raw: true });
  const takenSlugs = new Set(existing.map(b => b.slug));
  const takenHosts = new Set(existing.map(b => hostOf(b.url)).filter(Boolean));

  const all = [...scanCustomDomains(), ...scanVerticals(), ...scanLandingPages()];
  // De-dupe candidates and drop anything already a brand.
  const seen = new Set(), candidates = [];
  for (const c of all) {
    const host = hostOf(c.url);
    const key = c.slug + '|' + (host || '');
    if (seen.has(key)) continue; seen.add(key);
    if (takenSlugs.has(c.slug)) continue;
    if (host && takenHosts.has(host)) continue;
    candidates.push(c);
  }
  return candidates;
}

module.exports = { discover, REPO_ROOT };
