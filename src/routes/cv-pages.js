// Phase 7 — ROLE-TARGETED LANDING PAGES.
//
// The site is the destination and the proof, not the discovery channel. Recruiter sourcing
// tools (SeekOut, hireEZ, Juicebox) and search engines match on literal title, skill and
// location strings in crawlable text. A CV headline of "Full-Stack AI Solutions Architect" is
// invisible to anyone searching for a project manager, however much delivery experience sits
// behind it. So each role target in a profile's settings gets its own server-rendered,
// indexable page carrying the exact title a sourcer types.
//
// Generated per profile from its own settings — a new person gets their own set with no new
// code, and a page only exists for a role the owner marked `page`. Privacy settings apply:
// a field marked private is absent from the HTML and from the JSON-LD.

const express = require('express');
const cvAgent = require('./cv-agent');
const settingsSvc = require('../services/cv-settings');

const router = express.Router();

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function originOf(req) {
  const host = String(req.get('host') || '').toLowerCase();
  return (req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + host;
}

// Which roles have a public page, from settings. Never invents one.
function pageRoles(settings) {
  return (((settings || {}).targeting || {}).roles || []).filter((r) => r.page !== false && r.title);
}
function findRole(settings, slug) {
  const s = String(slug || '').toLowerCase();
  return pageRoles(settings).find((r) => (r.slug || settingsSvc.slugify(r.title)) === s) || null;
}

// ---- JSON-LD: Person + what they are seeking. Rendered from the profile record so the page,
// resume.json, the agent card and llms.txt cannot state different things.
function personJsonLd(ctx) {
  const { settings, resume, origin, role } = ctx;
  const id = settings.identity || {};
  const pub = (settings.privacy || {}).public || {};
  const links = (id.links || []).map((l) => l.url).filter(Boolean);
  const roles = pageRoles(settings).map((r) => r.title);

  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': origin + '/#person',
    name: id.name || (resume && resume.basics && resume.basics.name) || '',
    jobTitle: role ? role.title : (id.headline || ''),
    description: [id.headline, id.years_experience ? `${id.years_experience} years in ${id.experience_domain || 'the field'}` : ''].filter(Boolean).join('. '),
    url: origin + '/'
  };
  if (pub.links && links.length) person.sameAs = links;
  if (settings.entity && settings.entity.wikidata_qid) {
    person.sameAs = (person.sameAs || []).concat(['https://www.wikidata.org/wiki/' + settings.entity.wikidata_qid]);
  }
  if (pub.location && id.location) {
    person.homeLocation = { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: id.location } };
  }
  if (pub.email && id.contact_email) person.email = id.contact_email;
  if (pub.phone && id.contact_phone) person.telephone = id.contact_phone;
  const knows = []
    .concat(roles)
    .concat(((settings.targeting || {}).industries || []).map((k) => (settingsSvc.INDUSTRY_TAXONOMY.find((x) => x.key === k) || {}).label || k))
    .concat(role ? (role.variants || []) : []);
  if (knows.length) person.knowsAbout = Array.from(new Set(knows));
  if (roles.length) person.seeks = roles.map((t) => ({ '@type': 'Demand', name: t }));
  if (pub.languages && (id.languages || []).length) person.knowsLanguage = id.languages.map((l) => l.language);
  return person;
}

function shell(ctx) {
  const { settings, origin, role, req } = ctx;
  const id = settings.identity || {};
  const pub = (settings.privacy || {}).public || {};
  const t = settings.targeting || {};
  const title = role ? `${role.title} — ${id.name}` : `${id.name} — role targets`;
  const locBit = pub.location && id.location ? ` in ${id.location}` : '';
  const yrs = id.years_experience ? `${id.years_experience} years` : '';
  const desc = role
    ? [`${id.name}${locBit}`, role.title, yrs && id.experience_domain ? `${yrs} of ${id.experience_domain}` : yrs].filter(Boolean).join(' — ').slice(0, 300)
    : `${id.name}${locBit} — currently targeting ${pageRoles(settings).map((r) => r.title).join(', ')}.`.slice(0, 300);
  const canonical = origin + (role ? '/roles/' + (role.slug || settingsSvc.slugify(role.title)) : '/roles');
  const jsonld = personJsonLd(ctx);
  const industries = (t.industries || []).map((k) => (settingsSvc.INDUSTRY_TAXONOMY.find((x) => x.key === k) || {}).label || k);
  const note = cvAgent.confidentialNote(settings);
  const others = pageRoles(settings).filter((r) => !role || r.title !== role.title);
  const av = pub.availability ? (t.availability || {}).status : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<link rel="alternate" type="application/json" title="Résumé (JSON Resume)" href="${esc(origin)}/resume.json">
<link rel="alternate" type="application/json" title="AI Agent Card (A2A)" href="${esc(origin)}/.well-known/agent.json">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>
:root{--bg:#05070e;--card:rgba(255,255,255,.03);--line:rgba(255,255,255,.1);--line2:rgba(255,255,255,.16);--txt:#e8ecf4;--dim:#9aa4b8;--cyan:#22d3ee;--violet:#8b5cf6;--grad:linear-gradient(135deg,#22d3ee,#8b5cf6)}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--txt);line-height:1.6;
 background-image:radial-gradient(60% 45% at 80% 3%,rgba(139,92,246,.14),transparent 60%),radial-gradient(55% 40% at 8% 12%,rgba(34,211,238,.12),transparent 60%);min-height:100vh}
a{color:var(--cyan)}
.wrap{max-width:820px;margin:0 auto;padding:48px 20px 72px}
.eyebrow{display:inline-block;font-size:11.5px;letter-spacing:2.5px;text-transform:uppercase;color:var(--cyan);border:1px solid rgba(34,211,238,.35);border-radius:20px;padding:6px 12px;margin-bottom:18px}
h1{font-size:clamp(28px,5vw,42px);font-weight:800;letter-spacing:-.6px;line-height:1.1;margin-bottom:10px}
h1 .g{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
h2{font-size:19px;margin:34px 0 12px;font-weight:700}
.sub{color:var(--dim);font-size:16px;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin:14px 0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.chip{font-size:13px;border:1px solid var(--line2);border-radius:20px;padding:6px 12px;color:var(--txt);background:var(--card)}
ul{margin:8px 0 0 20px}li{margin:5px 0}
.foot{margin-top:40px;padding-top:20px;border-top:1px solid var(--line);color:var(--dim);font-size:13px}
.btn{display:inline-block;background:var(--grad);color:#04121a;font-weight:700;padding:11px 18px;border-radius:11px;text-decoration:none;margin-top:8px}
.btn.ghost{background:var(--card);color:var(--txt);border:1px solid var(--line2)}
.note{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:12px 14px;font-size:13px;color:#f6d08a;margin:14px 0}
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">${role ? 'Role target' : 'Role targets'}</div>
  <h1>${role ? `<span class="g">${esc(role.title)}</span>` : esc(id.name)}</h1>
  <div class="sub">${esc(id.name)}${locBit ? ' — ' + esc(id.location) : ''}${yrs ? ' — ' + esc(yrs) + (id.experience_domain ? ' of ' + esc(id.experience_domain) : '') : ''}</div>
  ${note ? `<div class="note">${esc(note)}</div>` : ''}
  ${role ? `
  <div class="card">
    <h2 style="margin-top:0">What this means in practice</h2>
    ${role.evidence ? `<p>${esc(role.evidence)}</p>` : `<p>${esc(id.headline || '')}</p>`}
    ${(role.variants || []).length ? `<div class="chips">${role.variants.map((v) => `<span class="chip">${esc(v)}</span>`).join('')}</div>` : ''}
  </div>` : ''}
  ${industries.length ? `<h2>Sectors</h2><div class="chips">${industries.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>` : ''}
  ${av ? `<h2>Availability</h2><p>${esc(av === 'open' ? 'Open to opportunities.' : av === 'selective' ? 'Selectively open to opportunities.' : 'Not currently looking.')}</p>` : ''}
  ${others.length ? `<h2>Other role targets</h2><ul>${others.map((r) => `<li><a href="/roles/${esc(r.slug || settingsSvc.slugify(r.title))}">${esc(r.title)}</a></li>`).join('')}</ul>` : ''}
  <h2>Contact</h2>
  <p>${pub.email && id.contact_email ? `Email <a href="mailto:${esc(id.contact_email)}">${esc(id.contact_email)}</a>.` : 'Send an opportunity through the profile and it lands in a private inbox — it is read by a person, not answered by a bot.'}</p>
  <p><a class="btn" href="/">View the full profile</a> <a class="btn ghost" href="/resume.json">Résumé as JSON</a></p>
  <div class="foot">
    <p>This page is written for people and for the AI agents that read on their behalf. Machine-readable versions: <a href="/resume.json">JSON Resume</a>, <a href="/.well-known/agent.json">A2A agent card</a>.</p>
  </div>
</div>
</body>
</html>`;
}

// ---- handlers (host-aware wiring lives in app.js) ----
async function renderRoleIndex(slug, req, res, next) {
  const { settings } = await cvAgent.profileSettings(slug);
  const resume = await cvAgent.publicResume(slug);
  if (!settings || !resume) return next();
  const roles = pageRoles(settings);
  if (!roles.length) return next();
  res.type('html').send(shell({ settings, resume, origin: originOf(req), role: null, req }));
}
async function renderRolePage(slug, roleSlug, req, res, next) {
  const { settings } = await cvAgent.profileSettings(slug);
  const resume = await cvAgent.publicResume(slug);
  if (!settings || !resume) return next();
  const role = findRole(settings, roleSlug);
  if (!role) return next();
  res.type('html').send(shell({ settings, resume, origin: originOf(req), role, req }));
}
// Sitemap entries for a profile's role pages — used by the CV-domain sitemap in app.js.
async function roleUrls(slug) {
  const { settings } = await cvAgent.profileSettings(slug);
  if (!settings) return [];
  return pageRoles(settings).map((r) => '/roles/' + (r.slug || settingsSvc.slugify(r.title)));
}

// Main-host access (useful before a custom domain is pointed here): /cv/:slug/roles[/:role]
router.get('/:slug/roles', (req, res, next) => renderRoleIndex(String(req.params.slug).toLowerCase(), req, res, next));
router.get('/:slug/roles/:role', (req, res, next) => renderRolePage(String(req.params.slug).toLowerCase(), String(req.params.role).toLowerCase(), req, res, next));

module.exports = { router, renderRoleIndex, renderRolePage, roleUrls, pageRoles, personJsonLd };
