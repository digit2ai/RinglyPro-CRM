'use strict';

// =============================================================
// The subscriber's public website — ONE data-driven template.
//
// The donor repo hand-authors a file per person (manuelstagg.html is 1,237
// lines). That does not scale past a handful. Every subscriber's site renders
// from this one function, through the SAME privacy projection as resume.json,
// the agent card and llms.txt — so they can never state different things.
// =============================================================

const identity = require('./identity');
const settingsSvc = require('./settings');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const CSS = `
:root{--bg:#0a0a0e;--bg2:#101016;--card:#16161d;--line:rgba(255,255,255,.08);
--line2:rgba(255,255,255,.15);--ink:#f5f5f7;--mut:#a6a9b4;--faint:#767a86;
--grad:linear-gradient(120deg,#5b7bff 0%,#e64980 52%,#ff922b 100%);
--cy:#22d3ee;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);position:relative;
font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
letter-spacing:-.011em;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0 0 auto 0;height:620px;z-index:0;pointer-events:none;
background:radial-gradient(60% 40% at 50% 0%,rgba(66,99,235,.34),transparent 70%),
radial-gradient(70% 40% at 50% 26%,rgba(230,73,128,.22),transparent 72%);
filter:blur(30px);-webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
mask-image:linear-gradient(180deg,#000 0%,transparent 100%)}
.wrap{position:relative;z-index:2;max-width:820px;margin:0 auto;padding:64px 24px}
h1{font-size:clamp(34px,5.6vw,46px);line-height:1.08;margin:0 0 8px;font-weight:830;letter-spacing:-.035em}
.headline{font-size:19px;margin:0 0 22px;font-weight:600;background:var(--grad);
-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.summary{color:#cfd2da;font-size:17px}
section{margin:42px 0}
h2{font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);font-family:var(--mono);
border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:18px;font-weight:600}
.item{margin-bottom:22px}.item .t{font-weight:700;font-size:16.5px}
.item .m{color:var(--faint);font-size:13.5px;font-family:var(--mono);margin-top:2px}
.item ul{margin:10px 0 0;padding-left:18px;color:var(--mut)}
.item ul li{margin:5px 0}
.skills{display:flex;flex-wrap:wrap;gap:8px}
.skill{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:14px;color:var(--mut)}
a.skill:hover{border-color:var(--cy);color:var(--cy)}
.cta{background:linear-gradient(180deg,var(--card),var(--bg2));border:1px solid var(--line2);
border-radius:22px;padding:26px;margin-top:44px}
.cta a{color:var(--cy);font-weight:650}
footer{color:var(--faint);font-size:13px;margin-top:52px;border-top:1px solid var(--line);
padding-top:20px;font-family:var(--mono)}
footer a{color:var(--faint)}footer a:hover{color:var(--ink)}
a{color:var(--cy);text-decoration:none}
@media print{body::before{display:none}body{background:#fff;color:#000}}
@media(max-width:600px){.wrap{padding:38px 18px}}
`;


function head(title, desc, ld, url) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<link rel="alternate" type="application/json" href="${esc(url)}/resume.json">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head><body><div class="wrap">`;
}

function foot(url) {
  return `<footer>Machine-readable: <a href="${esc(url)}/resume.json">resume.json</a> ·
<a href="${esc(url)}/.well-known/agent.json">agent card</a> ·
<a href="${esc(url)}/llms.txt">llms.txt</a><br>Built and maintained by JobUp.</footer></div></body></html>`;
}

function body(p) {
  let h = '';
  if (p.headline) h += `<p class="headline">${esc(p.headline)}</p>`;
  if (p.summary) h += `<p class="summary">${esc(p.summary)}</p>`;

  if (p.experience && p.experience.length) {
    h += '<section><h2>Experience</h2>';
    for (const e of p.experience) {
      h += `<div class="item"><div class="t">${esc(e.title)}${e.company ? ' · ' + esc(e.company) : ''}</div>`;
      if (e.start || e.end) h += `<div class="m">${esc(e.start || '')} — ${esc(e.end || 'Present')}</div>`;
      if (e.highlights && e.highlights.length) {
        h += '<ul>' + e.highlights.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>';
      }
      h += '</div>';
    }
    h += '</section>';
  }
  if (p.education && p.education.length) {
    h += '<section><h2>Education</h2>' + p.education.map((e) =>
      `<div class="item"><div class="t">${esc(e.institution || '')}</div><div class="m">${esc([e.studyType, e.area, e.end].filter(Boolean).join(' · '))}</div></div>`
    ).join('') + '</section>';
  }
  if (p.skills && p.skills.length) {
    h += '<section><h2>Skills</h2><div class="skills">' + p.skills.map((s) =>
      `<span class="skill">${esc(typeof s === 'string' ? s : s.name)}</span>`).join('') + '</div></section>';
  }
  if (p.certifications && p.certifications.length) {
    h += '<section><h2>Certifications</h2><div class="skills">' + p.certifications.map((c) =>
      `<span class="skill">${esc(typeof c === 'string' ? c : c.name)}</span>`).join('') + '</div></section>';
  }
  return h;
}

function page(profile, settings, ctx) {
  const p = identity.applyPrivacy(profile, settings);
  const ld = identity.personJsonLd(profile, settings, ctx);
  const name = ctx.name || p.name || 'Professional';
  const desc = (p.summary || p.headline || name).slice(0, 200);
  let h = head(`${name}${p.headline ? ' — ' + p.headline : ''}`, desc, ld, ctx.url);
  h += `<h1>${esc(name)}</h1>` + body(p);

  const roles = settingsSvc.pageRoles(settings);
  if (roles.length) {
    h += '<section><h2>Open to</h2><div class="skills">' + roles.map((r) =>
      `<a class="skill" href="/roles/${esc(r.slug)}">${esc(r.title)}</a>`).join('') + '</div></section>';
  }
  h += `<div class="cta"><strong>Hiring?</strong> ${p.email
    ? `Reach ${esc(name)} at <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>.`
    : `Contact details are available on request.`}</div>`;
  return h + foot(ctx.url);
}

// Role-targeted page — carries the exact title string a sourcer searches.
function rolePage(profile, settings, ctx, role) {
  const p = identity.applyPrivacy(profile, settings);
  const ld = identity.personJsonLd(profile, settings, { ...ctx, role });
  const name = ctx.name || p.name || 'Professional';
  const title = `${name} — ${role.title}`;
  const desc = `${name} is open to ${role.title} roles. ${(p.summary || '').slice(0, 140)}`;
  let h = head(title, desc, ld, `${ctx.url}/roles/${role.slug}`);
  h += `<h1>${esc(name)}</h1><p class="headline">${esc(role.title)}</p>`;
  if (role.note) h += `<p class="summary">${esc(role.note)}</p>`;
  h += body(p);
  h += `<div class="cta"><strong>Recruiting for ${esc(role.title)}?</strong> ${p.email
    ? `Reach ${esc(name)} at <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>.`
    : 'Contact details are available on request.'} · <a href="/">Full profile</a></div>`;
  return h + foot(ctx.url);
}

function roleIndex(profile, settings, ctx) {
  const p = identity.applyPrivacy(profile, settings);
  const roles = settingsSvc.pageRoles(settings);
  const ld = identity.personJsonLd(profile, settings, ctx);
  const name = ctx.name || p.name || 'Professional';
  let h = head(`${name} — roles`, `Roles ${name} is open to.`, ld, `${ctx.url}/roles`);
  h += `<h1>${esc(name)}</h1><p class="headline">Open to</p><div class="skills">` +
    roles.map((r) => `<a class="skill" href="/roles/${esc(r.slug)}">${esc(r.title)}</a>`).join('') +
    '</div>';
  return h + foot(ctx.url);
}

module.exports = { page, rolePage, roleIndex, esc };
