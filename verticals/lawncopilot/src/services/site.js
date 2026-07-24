'use strict';

/**
 * The tenant's page — their entire web presence.
 *
 * lawncopilot.com/lawn_moster IS the company's website, the way
 * vagaro.com/<salon> is a salon's. Most of these businesses have no site at
 * all; they have a truck, a phone, and a Google Business Profile.
 *
 * Design target: someone standing in a driveway who just tapped "Website" on a
 * Google listing, on 4G, in sunlight. One screen to value, no render-blocking
 * anything, click-to-call as a first-class action.
 */

const { SiteContent, Review, ServicePlan } = require('../models');
const { escapeHtml, tenantBaseUrl } = require('../tenancy');

const e = escapeHtml;

async function loadContent(tenant) {
  try {
    const row = await SiteContent.findOne({
      where: { tenant_id: tenant.id, published: true },
      order: [['version', 'DESC']], raw: true
    });
    if (row && row.content) return { ...(tenant.brand || {}), ...row.content };
  } catch (err) { /* fall back to the brand column */ }
  return tenant.brand || {};
}

async function loadReviews(tenant) {
  try {
    return await Review.findAll({
      where: { tenant_id: tenant.id, status: 'left' },
      order: [['created_at', 'DESC']], limit: 6, raw: true
    });
  } catch (err) { return []; }
}

/**
 * Render the company's page. Server-rendered so first paint needs no JS.
 */
async function renderTenantPage(tenant, req, page) {
  const c = await loadContent(tenant);
  const reviews = await loadReviews(tenant);
  const name = c.display_name || tenant.name;
  const accent = sanitizeColor(c.accent) || '#307f44';
  const base = tenantBaseUrl(tenant, req);
  const phone = tenant.phone || tenant.owner_phone || null;
  const areas = Array.isArray(tenant.counties) ? tenant.counties : [];
  const services = Array.isArray(c.services) && c.services.length ? c.services : [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name,
    description: c.hero_sub || `${name} — lawn care.`,
    url: base,
    ...(phone ? { telephone: phone } : {}),
    areaServed: areas.length
      ? areas.map(a => ({ '@type': 'AdministrativeArea', name: `${a} County, ${tenant.state}` }))
      : { '@type': 'State', name: tenant.state || 'FL' },
    priceRange: '$$'
  };

  const body = page ? subPage(page, { c, name, services, areas, reviews, tenant })
                    : homeBody({ c, name, services, areas, reviews, tenant, phone, base });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${e(name)}${page ? ' — ' + e(titleFor(page)) : ' — Lawn care, priced in seconds'}</title>
<meta name="description" content="${e((c.hero_sub || '').slice(0, 155))}">
<meta property="og:title" content="${e(name)}">
<meta property="og:description" content="${e((c.hero_sub || '').slice(0, 155))}">
<meta property="og:type" content="website">
<meta property="og:url" content="${e(base)}">
${c.logo_url ? `<meta property="og:image" content="${e(c.logo_url)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/lawncopilot/mark.png" type="image/png">
<link rel="apple-touch-icon" href="/lawncopilot/apple-touch-icon.png">
<link rel="stylesheet" href="/lawncopilot/styles.css">
<link rel="stylesheet" href="/lawncopilot/tenant.css">
<link rel="manifest" href="/lawncopilot/app.webmanifest">
<meta name="theme-color" content="${accent}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<style>:root{--green-600:${accent};--green-700:${shade(accent,-14)};--green-500:${shade(accent,16)}}</style>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body data-slug="${e(tenant.slug)}">

<nav class="nav">
  <div class="wrap nav__inner">
    <a class="nav__logo" href="${e(base)}">
      ${c.logo_url
        ? `<img src="${e(c.logo_url)}" alt="${e(name)}" height="40">`
        : `<span class="brandmark" style="background:${accent}">${e(initials(name))}</span><span>${e(name)}</span>`}
    </a>
    <div class="nav__links">
      <a href="${e(base)}/services">Services</a>
      <a href="${e(base)}/areas">Areas</a>
      <a href="${e(base)}/reviews">Reviews</a>
      <a href="${e(base)}/faq">FAQ</a>
    </div>
    <div class="nav__cta">
      ${phone ? `<a class="btn btn--ghost btn--sm" href="tel:${e(phone)}">Call</a>` : ''}
      <a class="btn btn--ghost btn--sm" href="${e(base)}/login">Sign in</a>
      <button class="btn btn--primary btn--sm" data-gate="hero">Get my price</button>
    </div>
  </div>
</nav>

${body}

<footer class="footer">
  <div class="wrap">
    <div class="footer__grid">
      <div>
        <div class="nav__logo" style="color:#fff;margin-bottom:12px">${e(name)}</div>
        <p class="small" style="color:var(--ink-400)">${e(c.about || '')}</p>
        ${c.license_text ? `<p class="tiny" style="color:var(--ink-400)">${e(c.license_text)}</p>` : ''}
      </div>
      <div><h4>Service</h4><ul>
        <li><a href="${e(base)}/services">What we do</a></li>
        <li><a href="${e(base)}/areas">Where we work</a></li>
        <li><a href="${e(base)}/faq">Questions</a></li>
      </ul></div>
      <div><h4>Account</h4><ul>
        <li><a href="${e(base)}/login">Customer sign in</a></li>
        ${phone ? `<li><a href="tel:${e(phone)}">${e(phone)}</a></li>` : ''}
      </ul></div>
      <div><h4>Legal</h4><ul>
        <li><a href="${e(base)}/terms">Terms</a></li>
        <li><a href="${e(base)}/privacy">Privacy</a></li>
      </ul></div>
    </div>
    <div class="footer__bottom">
      <span>${e(name)}${areas.length ? ' &middot; Serving ' + e(areas.slice(0, 3).join(', ')) : ''}</span>
      ${c.show_powered_by === false ? '' : '<span>Powered by Lawn Co-Pilot</span>'}
    </div>
  </div>
</footer>

<div class="stickycta">
  <button class="btn btn--primary" data-gate="hero">Get my price</button>
  ${phone ? `<a class="btn btn--ghost" href="tel:${e(phone)}">Call</a>` : ''}
</div>

${gateMarkup(name)}
<script src="/lawncopilot/orb.js" defer></script>
<script src="/lawncopilot/pwa.js" defer></script>
</body>
</html>`;
}

function homeBody({ c, name, services, areas, reviews, tenant, phone, base }) {
  return `
<header class="hero">
  <div class="wrap hero__grid">
    <div>
      <div class="eyebrow">${areas.length ? e(areas.slice(0, 2).join(' and ') + ' County') : e(tenant.state || 'Florida')}</div>
      <h1>${e(c.hero_headline || 'Lawn care, priced in seconds.')}</h1>
      <p class="lead">${e(c.hero_sub || '')}</p>
      <div class="hero__actions">
        <button class="btn btn--primary btn--lg" data-gate="hero">Get my price</button>
        ${phone ? `<a class="btn btn--ghost btn--lg" href="tel:${e(phone)}">Call ${e(name)}</a>` : ''}
      </div>
      <div class="hero__proof">
        <div><b>Free</b><span>Instant estimate</span></div>
        <div><b>No visit</b><span>Measured from records</span></div>
        <div><b>24/7</b><span>We always answer</span></div>
      </div>
    </div>

    <div class="orbcard" id="orbcard">
      <div class="orbcard__head">
        <button class="orb" id="orb" aria-label="Talk to ${e(name)}" data-gate="orb"></button>
        <div>
          <div class="orbcard__title">${e(name)}</div>
          <div class="orbcard__sub">Speak or type. Same answer either way.</div>
        </div>
      </div>
      <div class="orbcard__status" id="status">Type your address to get a price.</div>
      <div class="transcript" id="transcript" aria-live="polite"></div>
      <div class="composer">
        <input id="msg" type="text" placeholder="Type your address to start..."
               autocomplete="off" data-gate="input" aria-label="Message ${e(name)}">
        <button class="btn btn--primary" id="send" data-gate="send">Send</button>
      </div>
      <div class="chips">
        <button class="chip" data-gate="chip" data-chip="How much does it cost?">How much?</button>
        <button class="chip" data-gate="chip" data-chip="What is included in a visit?">What is included?</button>
        <button class="chip" data-gate="chip" data-chip="When can you come out?">When can you come?</button>
      </div>
      <div class="result" id="result">
        <div class="map" id="map"></div>
        <div class="legend">
          <span><i style="background:#f59e0b"></i>Property line</span>
          <span><i style="background:#94a3b8"></i>House</span>
          <span><i style="background:var(--green-500)"></i>Lawn we service</span>
        </div>
        <div class="prices" id="prices"></div>
        <div class="tiny mut" id="disclaimer" style="margin-top:12px;color:var(--ink-400)"></div>
      </div>
    </div>
  </div>
</header>

<section class="section section--tint" style="padding:var(--space-6) 0">
  <div class="wrap trust">
    <div><b>Measured</b><span>Priced on real square footage</span></div>
    <div><b>No contract</b><span>Pause or cancel anytime</span></div>
    <div><b>Local</b><span>${areas.length ? e(areas.join(', ')) : e(tenant.state || 'Florida')}</span></div>
    <div><b>Insured</b><span>Licensed and insured crew</span></div>
  </div>
</section>

<section class="section" id="services">
  <div class="wrap">
    <div class="center" style="max-width:640px;margin:0 auto var(--space-6)">
      <h2>What we do</h2>
    </div>
    <div class="grid grid--4">
      ${services.map(s => `<div class="card"><h3>${e(s.name)}</h3><p class="mut small">${e(s.description || '')}</p></div>`).join('')}
    </div>
  </div>
</section>

${reviews.length ? `
<section class="section section--tint">
  <div class="wrap">
    <div class="center" style="margin-bottom:var(--space-6)"><h2>What neighbors say</h2></div>
    <div class="grid grid--3">
      ${reviews.map(r => `<div class="card">
        <div style="color:var(--accent);font-weight:800">${'★'.repeat(Math.max(1, Math.min(5, r.rating || 5)))}</div>
        <p class="small">${e(r.text || '')}</p>
        <p class="tiny mut">${e(r.author || 'Verified customer')}</p>
      </div>`).join('')}
    </div>
  </div>
</section>` : ''}

<section class="section section--ink">
  <div class="wrap center" style="max-width:600px">
    <h2>Get your price right now</h2>
    <p>Enter your address and see exactly what we would charge. It takes about ten seconds.</p>
    <button class="btn btn--primary btn--lg" data-gate="hero" style="margin-top:var(--space-4)">Get my price</button>
  </div>
</section>`;
}

function subPage(page, { c, name, services, areas, reviews, tenant }) {
  const wrap = (title, inner) => `
<header class="section" style="background:linear-gradient(180deg,#fff,var(--bg-alt));padding-bottom:var(--space-6)">
  <div class="wrap" style="max-width:800px"><h1>${e(title)}</h1></div>
</header>
<section class="section" style="padding-top:0"><div class="wrap" style="max-width:800px">${inner}</div></section>`;

  if (page === 'services') {
    return wrap('What we do', `<div class="grid grid--2">${services.map(s =>
      `<div class="card"><h3>${e(s.name)}</h3><p class="mut">${e(s.description || '')}</p></div>`).join('')}</div>
      <p style="margin-top:var(--space-6)"><button class="btn btn--primary btn--lg" data-gate="hero">Get my price</button></p>`);
  }
  if (page === 'areas') {
    return wrap('Where we work', areas.length
      ? `<div class="grid grid--3">${areas.map(a => `<div class="card"><h3>${e(a)} County</h3><p class="mut small">${e(tenant.state || 'FL')}</p></div>`).join('')}</div>
         <p class="mut" style="margin-top:var(--space-5)">Not sure if we cover you? Enter your address and we will tell you.</p>
         <button class="btn btn--primary" data-gate="hero">Check my address</button>`
      : `<p class="lead">Enter your address and we will confirm we cover you.</p><button class="btn btn--primary" data-gate="hero">Check my address</button>`);
  }
  if (page === 'reviews') {
    return wrap('Reviews', reviews.length
      ? `<div class="grid grid--2">${reviews.map(r => `<div class="card">
          <div style="color:var(--accent);font-weight:800">${'★'.repeat(Math.max(1, Math.min(5, r.rating || 5)))}</div>
          <p>${e(r.text || '')}</p><p class="tiny mut">${e(r.author || 'Verified customer')}</p></div>`).join('')}</div>`
      : `<p class="lead">We are just getting started collecting reviews here. Ask us for references anytime.</p>`);
  }
  if (page === 'about') {
    return wrap(`About ${name}`, `<p class="lead">${e(c.about || '')}</p>`);
  }
  if (page === 'contact') {
    const phone = tenant.phone || tenant.owner_phone;
    return wrap('Contact', `
      ${phone ? `<p class="lead">Call or text <a href="tel:${e(phone)}">${e(phone)}</a>. We answer 24 hours a day.</p>` : ''}
      ${tenant.email ? `<p class="mut">Email: <a href="mailto:${e(tenant.email)}">${e(tenant.email)}</a></p>` : ''}
      <button class="btn btn--primary btn--lg" data-gate="hero">Get my price</button>`);
  }
  if (page === 'faq') {
    return wrap('Questions', FAQ.map(f =>
      `<details><summary>${e(f.q)}</summary><p>${e(f.a.replace('{company}', name))}</p></details>`).join(''));
  }
  if (page === 'privacy') {
    return wrap('Privacy', `<p class="mut">${e(name)} collects your name, phone, email and service address in order to quote and perform lawn care. We do not sell your information. Payment card details are handled by our payment processor and are never stored on our servers. To have your information removed, contact us.</p>`);
  }
  if (page === 'terms') {
    return wrap('Terms', `<p class="mut">Estimates produced from public property records are preliminary and verified before service. Recurring plans may be paused or cancelled subject to the notice period stated at signup. Service may be rescheduled for weather; you are not charged for a visit that did not occur.</p>`);
  }
  return wrap(titleFor(page), '<p class="mut">Nothing here yet.</p>');
}

const FAQ = [
  { q: 'How can you price my lawn without coming out?', a: 'We measure your lot from public property records, subtract the house, driveway and walkways, and price the lawn that is left. If we could not verify something, we say so and a person checks it before you are charged.' },
  { q: 'Do I have to sign a contract?', a: 'No. Recurring plans get a better per-visit rate, but you can skip, pause or cancel from your account.' },
  { q: 'What happens if it rains?', a: 'We move you to the next available day and let you know. You are never charged for a visit that did not happen.' },
  { q: 'How do I pay?', a: 'You get an invoice after each visit and can pay online by card. Automatic payment is optional and you can turn it off anytime.' },
  { q: 'Am I talking to a real person?', a: 'The assistant on this page and on our phone line is an AI. It can quote, schedule and answer account questions, and it will put you through to a person whenever you want.' }
];

function titleFor(page) {
  return ({ services: 'Services', areas: 'Service areas', about: 'About', reviews: 'Reviews',
    contact: 'Contact', faq: 'Questions', privacy: 'Privacy', terms: 'Terms' })[page] || page;
}

function gateMarkup(name) {
  return `
<div class="gate" id="gate" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
  <div class="gate__box">
    <h3 id="gateTitle">First, who are we quoting?</h3>
    <p class="small mut">We need these three before we measure anything. It takes ten seconds and it is how ${e(name)} sends you the estimate.</p>
    <form id="gateForm" novalidate>
      <div class="field" id="f-name"><label for="g-name">Full name</label>
        <input id="g-name" name="name" type="text" autocomplete="name" required>
        <div class="err">Please enter your name.</div></div>
      <div class="field" id="f-phone"><label for="g-phone">Mobile number</label>
        <input id="g-phone" name="phone" type="tel" autocomplete="tel" placeholder="+1 305 555 0142" required>
        <div class="err">Enter a valid mobile number with country code.</div></div>
      <div class="field" id="f-email"><label for="g-email">Email</label>
        <input id="g-email" name="email" type="email" autocomplete="email" required>
        <div class="err">Enter a valid email address.</div></div>
      <label class="small mut" style="display:flex;gap:9px;align-items:flex-start;margin-bottom:var(--space-4)">
        <input type="checkbox" id="g-marketing" style="margin-top:4px;width:auto;min-height:auto">
        <span>Send me seasonal offers too. (Optional.)</span></label>
      <button class="btn btn--primary" type="submit" style="width:100%" id="gateSubmit">Continue</button>
    </form>
  </div>
</div>`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function sanitizeColor(v) {
  return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : null;
}

function shade(hex, pct) {
  const c = sanitizeColor(hex) || '#307f44';
  const n = parseInt(c.slice(1), 16);
  const adj = (v) => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255)));
  const r = adj((n >> 16) & 255), g = adj((n >> 8) & 255), b = adj(n & 255);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

module.exports = { renderTenantPage, loadContent };
