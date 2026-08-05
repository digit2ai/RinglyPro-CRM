'use strict';

// =============================================================
// The machine-readable identity layer + the privacy projection.
//
// ONE SOURCE OF TRUTH (spec section 10, Agent 3):
//   The website, resume.json, the agent card, the role pages and llms.txt are
//   ALL projections of the subscriber's settings record. They can never state
//   different things, because they are all rendered from applyPrivacy().
//
// THE PRIVACY INVARIANT (spec section 19.1):
//   A private field is DELETED from every public surface — not blanked, not
//   merely hidden in the UI. Asserted by the SIT.
// =============================================================

const settingsSvc = require('./settings');

/**
 * The single projection. Everything public goes through this function.
 * Deletes — never blanks — anything the subscriber has not opted into.
 */
function applyPrivacy(profile, settings) {
  const p = JSON.parse(JSON.stringify(profile || {}));
  const priv = (settings || {}).privacy || settingsSvc.DEFAULTS.privacy;

  const drop = (obj, key) => { if (obj && key in obj) delete obj[key]; };

  if (!priv.email) drop(p, 'email');
  if (!priv.phone) drop(p, 'phone');
  if (!priv.location) drop(p, 'location');
  if (!priv.summary) drop(p, 'summary');
  if (!priv.headline) drop(p, 'headline');
  if (!priv.experience) drop(p, 'experience');
  if (!priv.education) drop(p, 'education');
  if (!priv.skills) drop(p, 'skills');

  // These live in settings.facts and are NEVER public unless opted in.
  const facts = (settings || {}).facts || {};
  p.facts = {};
  if (priv.compensation && facts.compensation_floor) p.facts.compensation = facts.compensation_floor;
  if (priv.work_authorization && facts.work_authorization) p.facts.work_authorization = facts.work_authorization;
  if (priv.clearance && facts.clearance) p.facts.clearance = facts.clearance;
  if (Object.keys(p.facts).length === 0) delete p.facts;

  return p;
}

/** JSON Resume, privacy-filtered. Served at /resume.json on the subscriber host. */
function resumeJson(profile, settings, { name, url }) {
  const p = applyPrivacy(profile, settings);
  const basics = { name: name || p.name || '' };
  if (p.headline) basics.label = p.headline;
  if (p.email) basics.email = p.email;
  if (p.phone) basics.phone = p.phone;
  if (p.summary) basics.summary = p.summary;
  if (p.location) basics.location = { address: p.location };
  if (url) basics.url = url;

  const out = { $schema: 'https://jsonresume.org/schema', basics };
  if (p.experience) {
    out.work = p.experience.map((e) => ({
      name: e.company, position: e.title, startDate: e.start, endDate: e.end,
      highlights: e.highlights || [],
    }));
  }
  if (p.education) {
    out.education = p.education.map((e) => ({
      institution: e.institution, area: e.area, studyType: e.studyType, endDate: e.end,
    }));
  }
  if (p.skills) out.skills = (p.skills || []).map((s) => (typeof s === 'string' ? { name: s } : s));
  if (p.certifications) out.certificates = (p.certifications || []).map((c) => (typeof c === 'string' ? { name: c } : c));
  return out;
}

/** Person + seeks JSON-LD. Rendered into every public page. */
function personJsonLd(profile, settings, { name, url, role }) {
  const p = applyPrivacy(profile, settings);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: name || p.name || '',
  };
  if (url) ld.url = url;
  if (p.headline) ld.jobTitle = p.headline;
  if (p.summary) ld.description = p.summary;
  if (p.email) ld.email = p.email;
  if (p.telephone) ld.telephone = p.phone;
  if (p.location) ld.address = { '@type': 'PostalAddress', addressLocality: p.location };
  if (p.skills && p.skills.length) {
    ld.knowsAbout = p.skills.map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean);
  }
  if (p.experience && p.experience.length) {
    ld.worksFor = p.experience.slice(0, 1).map((e) => ({ '@type': 'Organization', name: e.company }))[0];
  }
  const targets = settingsSvc.pageRoles(settings);
  if (targets.length) {
    ld.seeks = targets.map((r) => ({
      '@type': 'Demand', name: r.title,
      itemOffered: { '@type': 'Occupation', name: r.title },
    }));
  }
  if (role) {
    ld.seeks = [{ '@type': 'Demand', name: role.title,
                  itemOffered: { '@type': 'Occupation', name: role.title } }];
  }
  return ld;
}

/** A2A agent card at /.well-known/agent.json */
function agentCard(profile, settings, { name, url, slug }) {
  const p = applyPrivacy(profile, settings);
  return {
    name: `${name || p.name || 'Candidate'} — career agent`,
    description: p.headline || 'Professional career agent',
    url,
    provider: { organization: 'JobUp', url: 'https://jobup.dev' },
    version: '1.0',
    capabilities: { streaming: false },
    skills: [
      { id: 'get_profile', name: 'Get profile', description: 'Public professional profile.' },
      { id: 'get_resume', name: 'Get résumé', description: 'Full structured résumé in JSON Resume format.', tags: ['resume'] },
      { id: 'match', name: 'Match a role', description: 'Score a job description against this candidate.' },
    ],
    endpoints: {
      rest: `${url}/api/agent/${slug}`,
      mcp: `${url}/api/agent/${slug}/mcp`,
      resume: `${url}/resume.json`,
      card: `${url}/.well-known/agent.json`,
    },
  };
}

function llmsTxt(profile, settings, { name, url }) {
  const p = applyPrivacy(profile, settings);
  const lines = [`# ${name || p.name || 'Candidate'}`, ''];
  if (p.headline) lines.push(p.headline, '');
  if (p.summary) lines.push(p.summary, '');
  const roles = settingsSvc.pageRoles(settings);
  if (roles.length) {
    lines.push('## Roles sought', ...roles.map((r) => `- ${r.title}`), '');
  }
  if (p.skills && p.skills.length) {
    lines.push('## Skills', ...p.skills.slice(0, 40).map((s) => `- ${typeof s === 'string' ? s : s.name}`), '');
  }
  lines.push('## Machine-readable surfaces',
    `- Résumé (JSON Resume): ${url}/resume.json`,
    `- Agent Card (A2A): ${url}/.well-known/agent.json`, '');
  return lines.join('\n');
}

function sitemapXml({ url, roles }) {
  const urls = [
    `<url><loc>${url}/</loc></url>`,
    ...(roles || []).map((r) => `<url><loc>${url}/roles/${r.slug}</loc></url>`),
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function robotsTxt({ url }) {
  return `User-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n`;
}

module.exports = { applyPrivacy, resumeJson, personJsonLd, agentCard, llmsTxt, sitemapXml, robotsTxt };
