// CV Talent Engine — per-profile SETTINGS model (Phase 4).
//
// The single source of truth for everything that describes a person or their targeting.
// Nothing in the engine may hardcode a slug, role, country, employer or biographical fact:
// it all lives here as DATA, one row per profile, so adding a new person is data entry.
//
// Storage: cv_profile_settings(profile_id PK, settings JSONB). A JSONB document rather than
// columns, so adding a setting is not a migration — which is the point, since future profiles
// will need fields today's four do not.
//
// Honesty rules encoded here, not merely in prompts:
//   • approval_required is TRUE and cannot be turned off (nothing sends unreviewed).
//   • Contact details, compensation and clearance default to PRIVATE on every public surface.
//   • do-not-contact and excluded employers are absolute — checked at match, alert and draft time.

const { QueryTypes } = require('sequelize');

const MAX = { short: 200, med: 600, long: 4000, list: 100 };

// ---------- defaults ----------
function defaults() {
  return {
    version: 1,
    identity: {
      name: '', headline: '', location: '', timezone: 'America/New_York',
      contact_email: '', contact_phone: '',
      // Facts the OWNER enters. Never inferred, never guessed by a model.
      work_authorization: [],           // [{country:'US', status:'authorized_no_sponsorship', note:''}]
      security_clearance: '',           // '' = none on file. Absent means absent.
      languages: [],                    // [{language:'English', fluency:'native'}]
      years_experience: null,           // number
      experience_domain: '',            // e.g. 'IT integration in banking'
      links: []                         // [{label, url}] -> sameAs graph
    },
    targeting: {
      countries: [],                    // [{code:'US', remote_ok:true, onsite_ok:true}]
      country_rules: {},                // overrides for cv-geo DEFAULT_RULES
      regions: [],                      // states/metros within those countries
      relocation: { willing: false, targets: [] },
      travel_tolerance: '',
      industries: [],                   // taxonomy keys
      roles: [],                        // [{title, variants:[], seniority, keywords:[], weight:1}]
      employment_types: [],             // full_time | contract | c2c | w2 | fractional | consulting | part_time
      company_sizes: [],
      compensation: { base_floor: null, base_target: null, hourly: null, currency: 'USD' },
      availability: { status: 'open', start_date: '', notice_period: '' },
      score_floor: 0,
      dealbreakers: [],
      excluded_employers: []
    },
    outreach: {
      from_name: '', from_email: '', signature: '', phone: '', booking_url: '',
      tone: 'professional', length: 'medium', formality: 'neutral',
      language: 'auto',                 // auto = pick from identity.languages + posting language
      boilerplate: { work_authorization: '', compensation: '', availability: '' },
      resume_variants: [],              // [{label, url, role_titles:[]}]
      templates: {},                    // {application_intro, recruiter_reply, follow_up, referral_ask, thank_you, comp_question}
      cadence: { first_followup_days: 5, max_followups: 2, stop_on_reply: true, stop_on_rejection: true },
      caps: { daily_drafts: 10, daily_sends: 10 },
      send_window: { start: '08:00', end: '18:00' },
      do_not_contact: { emails: [], domains: [], names: [] },
      approval_required: true           // LOCKED — see sanitize()
    },
    notifications: {
      digest: 'daily',                  // off | daily | weekly
      digest_time: '07:30', timezone: '',
      alerts: { target_employer: true, score_threshold: true, inbound: true, followup_due: true }
    },
    privacy: {
      // What the PUBLIC page, resume.json, agent card and MCP tools may expose.
      public: { email: false, phone: false, compensation: false, work_authorization: false,
                security_clearance: false, availability: true, location: true, languages: true, links: true },
      confidential_mode: { enabled: false, employers: [] }
    },
    engine: {
      sources_enabled: [],              // [] = all shared sources
      model: '', cost_cap_usd: 1.0,
      auto_run: true, pool_ttl_hours: 6, match_limit: 12
    },
    entity: { wikidata_qid: '', notability_note: '' }
  };
}

// Industry taxonomy is DATA with a seed, extensible without a deploy (owners may add keys).
const INDUSTRY_TAXONOMY = [
  { key: 'banking', label: 'Banking' },
  { key: 'payments', label: 'Payments' },
  { key: 'core_banking_vendors', label: 'Core banking vendors' },
  { key: 'consulting_si', label: 'Consulting and systems integration' },
  { key: 'fintech', label: 'Fintech' },
  { key: 'regtech', label: 'Regtech and compliance software' },
  { key: 'capital_markets', label: 'Capital markets and custody' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'technology', label: 'Technology and software' },
  { key: 'media_advertising', label: 'Media and advertising' },
  { key: 'logistics', label: 'Logistics and supply chain' },
  { key: 'government', label: 'Government and public sector' }
];

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'c2c', 'w2', 'fractional', 'consulting'];
const WORK_AUTH_STATUSES = [
  { key: 'authorized_no_sponsorship', label: 'Authorized to work without sponsorship' },
  { key: 'authorized_sponsorship_now', label: 'Authorized, currently sponsored' },
  { key: 'requires_sponsorship', label: 'Requires sponsorship' },
  { key: 'not_authorized', label: 'Not authorized' }
];

// ---------- helpers ----------
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function str(v, max) { return String(v == null ? '' : v).slice(0, max || MAX.short); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function bool(v, d) { return typeof v === 'boolean' ? v : !!d; }
function arr(v, max) { return Array.isArray(v) ? v.slice(0, max || MAX.list) : []; }
function strList(v, max, itemMax) { return arr(v, max).map((x) => str(x, itemMax || MAX.short)).filter(Boolean); }

function deepMerge(base, patch) {
  if (!isObj(patch)) return base;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const [k, v] of Object.entries(patch)) {
    if (isObj(v) && isObj(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

function slugifyRole(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// ---------- sanitize (the honesty + safety gate) ----------
function sanitize(input) {
  const d = defaults();
  const s = deepMerge(d, isObj(input) ? input : {});

  // identity
  const id = s.identity;
  id.name = str(id.name); id.headline = str(id.headline, MAX.med); id.location = str(id.location);
  id.timezone = str(id.timezone, 64); id.contact_email = str(id.contact_email); id.contact_phone = str(id.contact_phone, 40);
  id.security_clearance = str(id.security_clearance, 80);
  id.experience_domain = str(id.experience_domain, MAX.med);
  id.years_experience = id.years_experience == null || id.years_experience === '' ? null
    : Math.max(0, Math.min(80, Math.round(num(id.years_experience) || 0)));
  id.work_authorization = arr(id.work_authorization, 20).map((w) => ({
    country: str((w && w.country) || '', 8).toUpperCase(),
    status: str((w && w.status) || '', 48),
    note: str((w && w.note) || '', MAX.med)
  })).filter((w) => w.country);
  id.languages = arr(id.languages, 20).map((l) => ({ language: str(l && l.language, 60), fluency: str(l && l.fluency, 60) })).filter((l) => l.language);
  id.links = arr(id.links, 30).map((l) => ({ label: str(l && l.label, 80), url: str(l && l.url, 400) }))
    .filter((l) => /^https?:\/\//i.test(l.url));

  // targeting
  const t = s.targeting;
  t.countries = arr(t.countries, 40).map((c) => ({
    code: str(c && c.code, 8).toUpperCase(),
    remote_ok: bool(c && c.remote_ok, true),
    onsite_ok: bool(c && c.onsite_ok, true)
  })).filter((c) => c.code);
  t.country_rules = isObj(t.country_rules) ? t.country_rules : {};
  t.regions = strList(t.regions, 60);
  t.relocation = { willing: bool(t.relocation && t.relocation.willing, false), targets: strList(t.relocation && t.relocation.targets, 40) };
  t.travel_tolerance = str(t.travel_tolerance, 80);
  t.industries = strList(t.industries, 40, 60);
  t.roles = arr(t.roles, 25).map((r) => ({
    title: str(r && r.title, 120),
    slug: slugifyRole((r && r.slug) || (r && r.title)),
    variants: strList(r && r.variants, 25, 120),
    seniority: str(r && r.seniority, 60),
    keywords: strList(r && r.keywords, 60, 60),
    weight: Math.max(0.1, Math.min(5, num(r && r.weight) || 1)),
    page: bool(r && r.page, true),                 // generate a public role page for it
    evidence: str(r && r.evidence, MAX.long)       // the real experience backing this target
  })).filter((r) => r.title);
  t.employment_types = strList(t.employment_types, 12, 24).filter((x) => EMPLOYMENT_TYPES.includes(x));
  t.company_sizes = strList(t.company_sizes, 12, 40);
  t.compensation = {
    base_floor: num(t.compensation && t.compensation.base_floor),
    base_target: num(t.compensation && t.compensation.base_target),
    hourly: num(t.compensation && t.compensation.hourly),
    currency: str((t.compensation && t.compensation.currency) || 'USD', 8).toUpperCase()
  };
  t.availability = {
    status: ['open', 'selective', 'closed'].includes(t.availability && t.availability.status) ? t.availability.status : 'open',
    start_date: str(t.availability && t.availability.start_date, 40),
    notice_period: str(t.availability && t.availability.notice_period, 60)
  };
  t.score_floor = Math.max(0, Math.min(100, Math.round(num(t.score_floor) || 0)));
  t.dealbreakers = strList(t.dealbreakers, 40, 120);
  t.excluded_employers = strList(t.excluded_employers, 100, 120);

  // outreach
  const o = s.outreach;
  o.from_name = str(o.from_name); o.from_email = str(o.from_email); o.phone = str(o.phone, 40);
  o.booking_url = /^https?:\/\//i.test(String(o.booking_url || '')) ? str(o.booking_url, 400) : '';
  o.signature = str(o.signature, MAX.long);
  o.tone = str(o.tone, 40); o.length = str(o.length, 24); o.formality = str(o.formality, 24);
  o.language = str(o.language, 16) || 'auto';
  o.boilerplate = {
    work_authorization: str(o.boilerplate && o.boilerplate.work_authorization, MAX.med),
    compensation: str(o.boilerplate && o.boilerplate.compensation, MAX.med),
    availability: str(o.boilerplate && o.boilerplate.availability, MAX.med)
  };
  o.resume_variants = arr(o.resume_variants, 12).map((v) => ({
    label: str(v && v.label, 80), url: str(v && v.url, 400), role_titles: strList(v && v.role_titles, 20, 120)
  })).filter((v) => v.label);
  const tpl = {}; if (isObj(o.templates)) for (const [k, v] of Object.entries(o.templates)) tpl[str(k, 40)] = str(v, MAX.long);
  o.templates = tpl;
  o.cadence = {
    first_followup_days: Math.max(1, Math.min(60, Math.round(num(o.cadence && o.cadence.first_followup_days) || 5))),
    max_followups: Math.max(0, Math.min(5, Math.round(num(o.cadence && o.cadence.max_followups) || 2))),
    stop_on_reply: bool(o.cadence && o.cadence.stop_on_reply, true),
    stop_on_rejection: bool(o.cadence && o.cadence.stop_on_rejection, true)
  };
  o.caps = {
    daily_drafts: Math.max(1, Math.min(100, Math.round(num(o.caps && o.caps.daily_drafts) || 10))),
    daily_sends: Math.max(1, Math.min(100, Math.round(num(o.caps && o.caps.daily_sends) || 10)))
  };
  o.send_window = { start: str(o.send_window && o.send_window.start, 8) || '08:00', end: str(o.send_window && o.send_window.end, 8) || '18:00' };
  o.do_not_contact = {
    emails: strList(o.do_not_contact && o.do_not_contact.emails, 500, 200).map((x) => x.toLowerCase()),
    domains: strList(o.do_not_contact && o.do_not_contact.domains, 500, 200).map((x) => x.toLowerCase().replace(/^@/, '')),
    names: strList(o.do_not_contact && o.do_not_contact.names, 500, 200)
  };
  o.approval_required = true;    // LOCKED. An unlockable version of this is how bulk-send comes back.

  // notifications
  const n = s.notifications;
  n.digest = ['off', 'daily', 'weekly'].includes(n.digest) ? n.digest : 'daily';
  n.digest_time = str(n.digest_time, 8) || '07:30';
  n.timezone = str(n.timezone, 64);
  n.alerts = {
    target_employer: bool(n.alerts && n.alerts.target_employer, true),
    score_threshold: bool(n.alerts && n.alerts.score_threshold, true),
    inbound: bool(n.alerts && n.alerts.inbound, true),
    followup_due: bool(n.alerts && n.alerts.followup_due, true)
  };

  // privacy — everything sensitive defaults to private; the owner opts in.
  const pv = s.privacy;
  const dp = defaults().privacy.public;
  const pub = {};
  Object.keys(dp).forEach((k) => { pub[k] = bool(pv.public && pv.public[k], dp[k]); });
  pv.public = pub;
  pv.confidential_mode = {
    enabled: bool(pv.confidential_mode && pv.confidential_mode.enabled, false),
    employers: strList(pv.confidential_mode && pv.confidential_mode.employers, 100, 120)
  };

  // engine
  const e = s.engine;
  e.sources_enabled = strList(e.sources_enabled, 200, 80);
  e.model = str(e.model, 80);
  e.cost_cap_usd = Math.max(0.05, Math.min(50, num(e.cost_cap_usd) || 1.0));
  e.auto_run = bool(e.auto_run, true);
  e.pool_ttl_hours = Math.max(1, Math.min(168, Math.round(num(e.pool_ttl_hours) || 6)));
  e.match_limit = Math.max(1, Math.min(60, Math.round(num(e.match_limit) || 12)));

  s.entity = { wikidata_qid: str(s.entity && s.entity.wikidata_qid, 24), notability_note: str(s.entity && s.entity.notability_note, MAX.long) };
  s.version = 1;
  return s;
}

// ---------- seeding from an existing profile row (no person-specific code) ----------
// First read for a profile derives its settings from whatever the profile row already holds,
// so an existing person keeps working and a NEW person needs no code change either.
function seedFromProfile(prof) {
  const s = defaults();
  if (!prof) return sanitize(s);
  s.identity.name = prof.name || '';
  s.identity.headline = prof.headline || '';
  s.identity.location = prof.location || '';
  s.identity.contact_email = prof.email || '';
  s.identity.contact_phone = prof.phone || '';
  if (prof.linkedin) s.identity.links.push({ label: 'LinkedIn', url: prof.linkedin });
  if (prof.site) s.identity.links.push({ label: 'Profile', url: prof.site });
  s.outreach.from_name = prof.name || '';
  s.outreach.from_email = prof.email || '';
  s.targeting.availability.status = prof.availability === 'closed' ? 'closed' : 'open';
  s.targeting.roles = String(prof.target_roles || '').split(';').map((x) => x.trim()).filter(Boolean)
    .slice(0, 25).map((title) => ({ title, slug: slugifyRole(title), variants: [], seniority: '', keywords: [], weight: 1, page: false, evidence: '' }));
  return sanitize(s);
}

// ---------- persistence ----------
async function ensureTable(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS cv_profile_settings (
      profile_id BIGINT PRIMARY KEY,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

async function get(sequelize, profile) {
  const pid = profile && (profile.id || profile.profile_id);
  if (!pid) return sanitize({});
  const rows = await sequelize.query('SELECT settings FROM cv_profile_settings WHERE profile_id=:pid',
    { replacements: { pid }, type: QueryTypes.SELECT }).catch(() => []);
  if (rows[0] && rows[0].settings && Object.keys(rows[0].settings).length) return sanitize(rows[0].settings);
  const seeded = seedFromProfile(profile);
  await save(sequelize, pid, seeded).catch(() => {});
  return seeded;
}

async function save(sequelize, profileId, settings) {
  const clean = sanitize(settings);
  await sequelize.query(
    `INSERT INTO cv_profile_settings (profile_id, settings, created_at, updated_at)
     VALUES (:pid, CAST(:s AS JSONB), now(), now())
     ON CONFLICT (profile_id) DO UPDATE SET settings=EXCLUDED.settings, updated_at=now()`,
    { replacements: { pid: profileId, s: JSON.stringify(clean) }, type: QueryTypes.INSERT });
  return clean;
}

async function patch(sequelize, profile, delta) {
  const cur = await get(sequelize, profile);
  return await save(sequelize, profile.id, deepMerge(cur, delta || {}));
}

// ---------- derived views ----------
// The country policy cv-geo consumes.
function countryPolicy(settings) {
  const t = (settings && settings.targeting) || {};
  return { enabled: Array.isArray(t.countries) && t.countries.length > 0,
           countries: t.countries || [], rules: t.country_rules || {} };
}

// Is this employer off limits for this profile? (excluded list OR confidential mode)
function employerBlocked(settings, company) {
  const c = String(company || '').toLowerCase().trim();
  if (!c) return null;
  const t = (settings && settings.targeting) || {};
  const pv = (settings && settings.privacy) || {};
  const hit = (list) => (list || []).find((x) => {
    const n = String(x || '').toLowerCase().trim();
    return n && (c === n || c.includes(n) || n.includes(c));
  });
  const ex = hit(t.excluded_employers);
  if (ex) return { blocked: true, reason: 'excluded employer', matched: ex };
  if (pv.confidential_mode && pv.confidential_mode.enabled) {
    const cf = hit(pv.confidential_mode.employers);
    if (cf) return { blocked: true, reason: 'confidential mode', matched: cf };
  }
  return null;
}

// Absolute, permanent. Checked before any draft is created and before any alert names a person.
function contactBlocked(settings, email, name) {
  const dnc = ((settings && settings.outreach) || {}).do_not_contact || {};
  const e = String(email || '').toLowerCase().trim();
  if (e) {
    if ((dnc.emails || []).includes(e)) return { blocked: true, reason: 'do-not-contact (email)' };
    const dom = e.split('@')[1] || '';
    if (dom && (dnc.domains || []).some((d) => dom === d || dom.endsWith('.' + d))) return { blocked: true, reason: 'do-not-contact (domain)' };
  }
  const n = String(name || '').toLowerCase().trim();
  if (n && (dnc.names || []).some((x) => String(x).toLowerCase().trim() === n)) return { blocked: true, reason: 'do-not-contact (name)' };
  return null;
}

// What a PUBLIC surface (page, resume.json, agent card, MCP tool) may state.
// A field that is private is ABSENT — not blanked, not hidden in the UI only.
function publicView(settings) {
  const s = sanitize(settings);
  const p = s.privacy.public;
  const id = s.identity;
  const out = {
    name: id.name, headline: id.headline,
    years_experience: id.years_experience, experience_domain: id.experience_domain,
    target_roles: (s.targeting.roles || []).map((r) => r.title),
    industries: s.targeting.industries || []
  };
  if (p.location) out.location = id.location;
  if (p.languages) out.languages = id.languages;
  if (p.links) out.links = id.links;
  if (p.email) out.email = id.contact_email;
  if (p.phone) out.phone = id.contact_phone;
  if (p.availability) out.availability = s.targeting.availability;
  if (p.work_authorization) out.work_authorization = id.work_authorization;
  if (p.security_clearance && id.security_clearance) out.security_clearance = id.security_clearance;
  if (p.compensation) out.compensation = s.targeting.compensation;
  return out;
}

// The honest facts an outreach draft may quote verbatim (owner-entered, never model-invented).
function outreachFacts(settings) {
  const s = sanitize(settings);
  const bp = s.outreach.boilerplate;
  const lines = [];
  if (bp.work_authorization) lines.push('Work authorization: ' + bp.work_authorization);
  else if (s.identity.work_authorization.length) {
    lines.push('Work authorization: ' + s.identity.work_authorization
      .map((w) => w.country + ' — ' + (WORK_AUTH_STATUSES.find((x) => x.key === w.status) || {}).label || w.status).join('; '));
  }
  if (bp.availability) lines.push('Availability: ' + bp.availability);
  else if (s.targeting.availability.start_date || s.targeting.availability.notice_period) {
    lines.push('Availability: ' + [s.targeting.availability.start_date, s.targeting.availability.notice_period].filter(Boolean).join(', '));
  }
  if (bp.compensation) lines.push('Compensation: ' + bp.compensation);
  return { lines, signature: s.outreach.signature, from_name: s.outreach.from_name,
           from_email: s.outreach.from_email, booking_url: s.outreach.booking_url,
           tone: s.outreach.tone, length: s.outreach.length, formality: s.outreach.formality };
}

// Pick the resume variant whose role_titles best match a posting title.
function resumeVariantFor(settings, jobTitle) {
  const vs = ((settings && settings.outreach) || {}).resume_variants || [];
  if (!vs.length) return null;
  const t = String(jobTitle || '').toLowerCase();
  let best = null, bestScore = 0;
  vs.forEach((v) => {
    let sc = 0;
    (v.role_titles || []).forEach((rt) => { const r = String(rt).toLowerCase(); if (r && t.includes(r)) sc += r.length; });
    if (sc > bestScore) { bestScore = sc; best = v; }
  });
  return best || vs[0];
}

module.exports = {
  defaults, sanitize, seedFromProfile, ensureTable, get, save, patch, deepMerge, slugifyRole,
  countryPolicy, employerBlocked, contactBlocked, publicView, outreachFacts, resumeVariantFor,
  INDUSTRY_TAXONOMY, EMPLOYMENT_TYPES, WORK_AUTH_STATUSES
};
