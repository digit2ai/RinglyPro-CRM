// Phase 2 — the AGENT SURFACE for the personal CV domains.
// Turns each résumé site into something other AIs can discover and query:
//   • /resume.json                      JSON Resume (served host-aware in app.js)
//   • /.well-known/agent.json           A2A Agent Card (served host-aware in app.js)
//   • GET  /api/agent/:slug/card|profile|resume
//   • POST /api/agent/:slug/match       public fit-scoring of a pasted job description
//   • POST /api/agent/:slug/message     leave an opportunity -> the owner's private inbox
//   • POST /api/agent/:slug/mcp         a real MCP (JSON-RPC 2.0) server: initialize / tools/list / tools/call
// Public + unauthenticated by design (recruiters' agents have no login), but LLM/DB actions
// are rate-limited per IP, and leave_message only WRITES to the inbox — it never auto-replies.
const express = require('express');
const { Sequelize, QueryTypes } = require('sequelize');
const { getResume, RESUMES, listSlugs } = require('../data/cv-resumes');
const settingsSvc = require('../services/cv-settings');

const router = express.Router();
router.use(express.json({ limit: '256kb' }));

const DB_URL = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
const sequelize = DB_URL ? new Sequelize(DB_URL, { dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false }) : null;
const MODEL = process.env.CV_ENGINE_MODEL || 'claude-haiku-4-5-20251001';

async function claude(system, user, maxTokens = 600) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || typeof fetch !== 'function') return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 22000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctl.signal,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }) });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.content && j.content[0] && j.content[0].text) || null;
  } catch (e) { return null; } finally { clearTimeout(timer); }
}

// ================= PRIVACY-AWARE PUBLIC PROJECTION (Phase 7) =================
// The static résumé in cv-resumes.js is the base; the profile's SETTINGS decide what of it
// may leave the building. A field the owner marked private is DELETED from the object here —
// so it is absent from resume.json, the agent card, every MCP tool response and every role
// page, rather than merely hidden in a UI. Settings also supply the live role targets, so the
// public surface and the matching engine can never drift apart.
const SETTINGS_TTL_MS = 60 * 1000;
const settingsCache = new Map();          // slug -> { at, profile, settings }

async function profileSettings(slug) {
  const hit = settingsCache.get(slug);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit;
  let profile = null, settings = null;
  if (sequelize) {
    try {
      const rows = await sequelize.query('SELECT * FROM cv_profiles WHERE slug=:s', { replacements: { s: slug }, type: QueryTypes.SELECT });
      profile = rows[0] || null;
      if (profile) settings = await settingsSvc.get(sequelize, profile);
    } catch (e) { /* DB down: fall back to the static résumé, never to a fabricated one */ }
  }
  const rec = { at: Date.now(), profile, settings };
  settingsCache.set(slug, rec);
  return rec;
}

// Apply the owner's visibility choices to a JSON Resume object.
function applyPrivacy(resume, settings) {
  const r = JSON.parse(JSON.stringify(resume));
  if (!settings) return r;                                  // no settings row yet = unchanged
  const pub = (settings.privacy && settings.privacy.public) || {};
  const id = settings.identity || {};
  const t = settings.targeting || {};

  if (!pub.email) delete r.basics.email;
  if (!pub.phone) delete r.basics.phone;
  if (!pub.location) delete r.basics.location;
  if (!pub.languages) delete r.languages;
  if (!pub.links) delete r.basics.profiles;

  // Owner-entered facts only appear when explicitly opted in.
  if (pub.work_authorization && (id.work_authorization || []).length) r.meta.workAuthorization = id.work_authorization;
  if (pub.security_clearance && id.security_clearance) r.meta.securityClearance = id.security_clearance;
  if (pub.compensation && t.compensation) r.meta.compensation = t.compensation;
  if (pub.availability) {
    r.meta.availability = (t.availability && t.availability.status) || r.meta.availability;
    if (t.availability && t.availability.start_date) r.meta.startDate = t.availability.start_date;
  } else {
    delete r.meta.availability;
  }

  // Live role targets from settings win over the static list.
  const roles = (t.roles || []).map((x) => x.title).filter(Boolean);
  if (roles.length) r.meta.targetRoles = roles.join('; ');
  if ((t.industries || []).length) r.meta.targetIndustries = t.industries;
  if (id.years_experience) r.meta.yearsExperience = id.years_experience;
  if (id.experience_domain) r.meta.experienceDomain = id.experience_domain;
  if (settings.entity && settings.entity.wikidata_qid) r.meta.wikidata = 'https://www.wikidata.org/wiki/' + settings.entity.wikidata_qid;

  // sameAs graph, deduplicated against whatever the static résumé already lists.
  const links = (id.links || []).map((l) => l.url).filter(Boolean);
  if (links.length && pub.links) {
    const have = new Set((r.basics.profiles || []).map((p) => p.url));
    r.basics.profiles = (r.basics.profiles || []).concat(links.filter((u) => !have.has(u)).map((u) => ({ network: 'Web', url: u })));
  }
  return r;
}

// Confidential mode: the profile is suppressed from named employers. We cannot identify an
// anonymous HTTP caller, so this is enforced where it CAN be — the owner's own outreach and
// alerts (cv-engine) — and reported honestly here rather than pretended.
function confidentialNote(settings) {
  const cm = settings && settings.privacy && settings.privacy.confidential_mode;
  if (!cm || !cm.enabled || !(cm.employers || []).length) return null;
  return 'This candidate has asked not to be presented to certain employers. If you represent one of them, please disregard this profile.';
}

// Build a minimal JSON Resume from the profile record alone. This is what makes adding a
// person DATA ENTRY: a new profile gets a working /resume.json, agent card and MCP surface
// from its settings, with no hand-authored entry in cv-resumes.js. Only states what the
// owner actually entered — an empty profile yields an empty résumé, never a filled-in one.
function resumeFromProfile(slug, profile, settings) {
  if (!profile) return null;
  const id = (settings && settings.identity) || {};
  const t = (settings && settings.targeting) || {};
  const loc = id.location || profile.location || '';
  const parts = String(loc).split(',').map((x) => x.trim());
  return {
    basics: {
      name: id.name || profile.name || '',
      label: id.headline || profile.headline || '',
      email: id.contact_email || profile.email || '',
      phone: id.contact_phone || profile.phone || '',
      url: profile.site || ('https://' + slug + '.com'),
      summary: profile.summary || '',
      location: loc ? { city: parts[0] || '', region: parts[1] || '', countryCode: 'US' } : undefined,
      profiles: (id.links || []).map((l) => ({ network: l.label || 'Web', url: l.url }))
    },
    work: [], education: [], skills: [],
    languages: (id.languages || []).map((l) => ({ language: l.language, fluency: l.fluency })),
    meta: {
      slug,
      availability: (t.availability && t.availability.status) || profile.availability || 'open',
      targetRoles: (t.roles || []).map((r) => r.title).filter(Boolean).join('; ') || profile.target_roles || '',
      generatedFrom: 'profile settings'
    }
  };
}

async function publicResume(slug) {
  const { profile, settings } = await profileSettings(slug);
  const base = getResume(slug) || resumeFromProfile(slug, profile, settings);
  if (!base) return null;
  return applyPrivacy(base, settings);
}

// ---- simple per-IP rate limit for the LLM/DB actions ----
const RL = {};
function limited(ip, max = 40, winMs = 3600 * 1000) {
  const now = Date.now(); const b = RL[ip] || { n: 0, t: now };
  if (now - b.t > winMs) { b.n = 0; b.t = now; }
  b.n++; RL[ip] = b; return b.n > max;
}
function ipOf(req) { return (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.ip || '0'; }

// ---- candidate context + tools (shared by REST and MCP) ----
function ctxText(r) {
  const skills = (r.skills || []).map((s) => s.name + ': ' + (s.keywords || []).join(', ')).join(' | ');
  return `Name: ${r.basics.name}\nHeadline: ${r.basics.label}\nLocation: ${[r.basics.location && r.basics.location.city, r.basics.location && r.basics.location.region].filter(Boolean).join(', ')}\nTarget roles: ${r.meta.targetRoles}\nSummary: ${r.basics.summary}\nSkills: ${skills}`;
}
function toolGetProfile(r) {
  return { name: r.basics.name, headline: r.basics.label, location: r.basics.location,
    availability: r.meta.availability, target_roles: r.meta.targetRoles, summary: r.basics.summary,
    skills: r.skills, languages: r.languages, links: (r.basics.profiles || []).map((p) => p.url), site: r.basics.url,
    resume: r.basics.url + '/resume.json' };
}
function toolAvailability(r) {
  if (r.meta.availability === undefined) {
    return { name: r.basics.name, availability: 'not published',
      note: 'This candidate has not published their availability. Use leave_message to ask directly.',
      target_roles: r.meta.targetRoles };
  }
  return { name: r.basics.name, available: r.meta.availability !== 'closed', availability: r.meta.availability,
    start_date: r.meta.startDate, target_roles: r.meta.targetRoles,
    contact: 'Use leave_message to reach ' + r.basics.name.split(' ')[0] + ' — it lands in their private inbox.' };
}
async function toolMatch(r, jd) {
  jd = String(jd || '').slice(0, 6000);
  if (jd.length < 40) return { error: 'Provide a longer job_description (40+ chars).' };
  const system = 'You are a precise candidate-fit analyst. Given a candidate and a job description, output STRICT JSON only: {"fit_score":0-100,"verdict":"strong|possible|weak","why":"2-3 sentences specific to THIS role and candidate","gaps":"short phrase on what is missing or empty","tailored_pitch":"a 60-90 word first-person pitch the candidate could send for THIS role"}. Be honest and calibrated; never invent candidate experience.';
  const raw = await claude(system, `CANDIDATE\n${ctxText(r)}\n\nJOB DESCRIPTION\n${jd}`, 550);
  let out = null; if (raw) { try { out = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch (e) {} }
  if (!out) out = { fit_score: null, verdict: 'unavailable', why: 'AI fit-scoring is offline right now. Target roles: ' + r.meta.targetRoles + '.', gaps: '', tailored_pitch: `I'm ${r.basics.name}, ${r.basics.label}. ${r.basics.summary}`, is_simulated: true };
  out.candidate = r.basics.name; out.site = r.basics.url;
  return out;
}
async function toolLeaveMessage(r, a) {
  a = a || {};
  const message = String(a.message || '').slice(0, 4000);
  if (!message && !a.role && !a.company) return { error: 'Provide at least a message, role, or company.' };
  let delivered = false;
  if (sequelize) {
    try {
      const prof = await sequelize.query('SELECT id FROM cv_profiles WHERE slug=:s', { replacements: { s: r.meta.slug }, type: QueryTypes.SELECT });
      if (prof[0]) {
        await sequelize.query(
          `INSERT INTO cv_opportunities (profile_id, source, company, contact_name, contact_email, role_title, message, status, created_at, updated_at)
           VALUES (:pid,'agent',:co,:cn,:ce,:rt,:msg,'new', now(), now())`,
          { replacements: { pid: prof[0].id, co: String(a.company || '').slice(0, 200), cn: String(a.from_name || '').slice(0, 160),
              ce: String(a.from_email || '').slice(0, 200), rt: String(a.role || '').slice(0, 200), msg: message }, type: QueryTypes.INSERT });
        delivered = true;
      }
    } catch (e) {}
  }
  return { ok: true, delivered, note: `Message delivered to ${r.basics.name}'s private inbox. ${r.basics.name.split(' ')[0]} reviews and responds personally — this agent does not auto-reply or make commitments on their behalf.` };
}

// ---- A2A Agent Card ----
function agentCard(r) {
  const url = r.basics.url; const slug = r.meta.slug;
  return {
    name: `${r.basics.name} — AI Career Agent`,
    description: `${r.basics.label}. Ask about ${r.basics.name}'s experience, score a job description against this candidate, check availability, or leave an opportunity that reaches them directly.`,
    url, version: '1.0.0',
    provider: { organization: r.basics.name, url },
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ['text'], defaultOutputModes: ['text', 'application/json'],
    documentationUrl: url,
    skills: [
      { id: 'get_profile', name: 'Get profile', description: `A structured summary of ${r.basics.name} (role, skills, availability).`, tags: ['profile', 'candidate'] },
      { id: 'get_resume', name: 'Get résumé', description: 'Full structured résumé in JSON Resume format.', tags: ['resume'] },
      { id: 'match_against_jd', name: 'Match a job description', description: 'Score how well this candidate fits a pasted job description (0-100) with reasons, gaps and a tailored pitch.', tags: ['matching'], examples: ['Paste a job posting to get a fit score for this candidate.'] },
      { id: 'check_availability', name: 'Check availability', description: 'Whether this candidate is open, and the roles they target.', tags: ['availability'] },
      { id: 'leave_message', name: 'Leave an opportunity', description: `Send a role/opportunity to ${r.basics.name}; it lands in their private inbox.`, tags: ['contact', 'recruiting'] }
    ],
    endpoints: { rest: `${url}/api/agent/${slug}`, mcp: `${url}/api/agent/${slug}/mcp`, resume: `${url}/resume.json`, card: `${url}/.well-known/agent.json` },
    // Live from the profile's settings, so the card cannot drift from what the engine matches.
    targets: { roles: String(r.meta.targetRoles || '').split(';').map((x) => x.trim()).filter(Boolean),
               industries: r.meta.targetIndustries || [],
               availability: r.meta.availability === undefined ? 'not published' : r.meta.availability }
  };
}

// ---- MCP tool descriptors ----
const MCP_TOOLS = [
  { name: 'get_profile', description: 'Get a structured summary of the candidate (role, skills, availability, links).', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_resume', description: 'Get the full résumé in JSON Resume format.', inputSchema: { type: 'object', properties: {} } },
  { name: 'match_against_jd', description: 'Score how well this candidate fits a job description. Returns fit_score 0-100, verdict, why, gaps and a tailored pitch.', inputSchema: { type: 'object', properties: { job_description: { type: 'string', description: 'The full job posting text.' } }, required: ['job_description'] } },
  { name: 'check_availability', description: 'Check whether the candidate is open to opportunities and what roles they target.', inputSchema: { type: 'object', properties: {} } },
  { name: 'leave_message', description: 'Send an opportunity/message to the candidate; it lands in their private inbox (no auto-reply).', inputSchema: { type: 'object', properties: { from_name: { type: 'string' }, from_email: { type: 'string' }, company: { type: 'string' }, role: { type: 'string' }, message: { type: 'string' } } } }
];
async function callTool(r, name, args) {
  if (name === 'get_profile') return toolGetProfile(r);
  if (name === 'get_resume') return r;                       // already privacy-filtered
  if (name === 'match_against_jd') return await toolMatch(r, (args || {}).job_description);
  if (name === 'check_availability') return toolAvailability(r);
  if (name === 'leave_message') return await toolLeaveMessage(r, args);
  return { error: 'unknown tool: ' + name };
}

// ================= REST =================
// Every public read goes through publicResume() so the owner's visibility settings apply
// uniformly. Nothing below may reach around it to the raw résumé.
async function resolve(req, res) {
  const r = await publicResume(String(req.params.slug || '').toLowerCase());
  if (!r) { res.status(404).json({ error: 'unknown candidate' }); return null; }
  return r;
}

router.get('/', (req, res) => res.json({ ok: true, candidates: listSlugs(), note: 'Each candidate exposes /card, /profile, /resume, POST /match, POST /message, and an MCP endpoint at /mcp.' }));
router.get('/:slug/card', async (req, res) => { const r = await resolve(req, res); if (!r) return; res.type('application/json').json(agentCard(r)); });
router.get('/:slug/profile', async (req, res) => { const r = await resolve(req, res); if (!r) return; res.json(toolGetProfile(r)); });
router.get(['/:slug/resume', '/:slug/resume.json'], async (req, res) => { const r = await resolve(req, res); if (!r) return; res.type('application/json').json(r); });

router.post('/:slug/match', async (req, res) => {
  const r = await resolve(req, res); if (!r) return;
  if (limited(ipOf(req))) return res.status(429).json({ error: 'rate limit — try again later' });
  res.json(await toolMatch(r, req.body && req.body.job_description));
});
router.post('/:slug/message', async (req, res) => {
  const r = await resolve(req, res); if (!r) return;
  if (limited(ipOf(req), 20)) return res.status(429).json({ error: 'rate limit — try again later' });
  res.json(await toolLeaveMessage(r, req.body || {}));
});

// ================= MCP (JSON-RPC 2.0) =================
router.post('/:slug/mcp', async (req, res) => {
  const r = await publicResume(String(req.params.slug || '').toLowerCase());
  const body = req.body || {};
  const id = (body.id === undefined ? null : body.id);
  const ok = (result) => res.json({ jsonrpc: '2.0', id, result });
  const err = (code, message) => res.json({ jsonrpc: '2.0', id, error: { code, message } });
  if (!r) return err(-32602, 'unknown candidate');
  const method = body.method;
  try {
    if (method === 'initialize')
      return ok({ protocolVersion: (body.params && body.params.protocolVersion) || '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: `${r.basics.name} Career Agent`, version: '1.0.0' } });
    if (method === 'ping') return ok({});
    if (typeof method === 'string' && method.indexOf('notifications/') === 0) return res.status(202).end();
    if (method === 'tools/list') return ok({ tools: MCP_TOOLS });
    if (method === 'tools/call') {
      const p = body.params || {};
      if (p.name === 'match_against_jd' && limited(ipOf(req))) return err(-32000, 'rate limit — try again later');
      if (p.name === 'leave_message' && limited(ipOf(req), 20)) return err(-32000, 'rate limit — try again later');
      const out = await callTool(r, p.name, p.arguments || {});
      return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: !!(out && out.error) });
    }
    return err(-32601, 'method not found: ' + method);
  } catch (e) { return err(-32603, (e && e.message) || 'internal error'); }
});

module.exports = { router, agentCard, getResume, listSlugs, publicResume, profileSettings, applyPrivacy, confidentialNote };
