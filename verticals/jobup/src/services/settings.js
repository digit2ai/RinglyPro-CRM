'use strict';

// =============================================================
// Per-subscriber settings — the single source of truth (donor cv-settings.js).
//
// HONESTY ENCODED IN CODE, NOT PROMPTS (spec sections 10, 19.1):
//   * approval_required is TRUE and sanitize() forces it back on every save.
//     Nothing sends unreviewed. This is not a default; it is not overridable.
//   * Contact details, compensation, work authorization and clearance are
//     PRIVATE BY DEFAULT. The subscriber opts in.
//   * Work authorization / compensation / availability are OWNER-ENTERED facts,
//     quoted verbatim in drafts or omitted entirely. Never paraphrased.
// =============================================================

const DEFAULTS = {
  approval_required: true,          // forced — see sanitize()
  privacy: {
    email: false,                   // false === private
    phone: false,
    compensation: false,
    work_authorization: false,
    clearance: false,
    location: true,
    headline: true,
    summary: true,
    experience: true,
    education: true,
    skills: true,
  },
  targeting: {
    roles: [],                      // [{ title, slug, page: true }]
    industries: [],                 // extra terms the pre-filter counts
    employers: [],                  // companies you want — weighted heavily
    must_include: [],               // a REQUIREMENT: every term must appear
    exclude_keywords: [],           // dropped free, before any model call
    seniority: null,                // a nudge, not a gate
    // WHAT SHAPE OF JOB. Empty === no opinion, so an empty list must never be
    // read as "none of them" — that would filter every posting away.
    employment_types: [],           // full_time|part_time|contract|internship|temporary
    work_modes: [],                 // remote|hybrid|onsite
    remote_preference: null,        // LEGACY single-choice; derived from work_modes
    locations: [],                  // cities/regions you would work in
    open_to_relocation: false,
    min_score: 0,                   // below this, do not clutter the inbox
  },
  geo: {
    allowed_countries: [],          // [] === unrestricted
    flag_unknown: true,
  },
  facts: {                          // owner-entered, quoted verbatim or omitted
    work_authorization: null,
    compensation_floor: null,
    availability: null,
    notice_period: null,
  },
  blocked: {
    employers: [],
    contacts: [],
  },
  quotas: {
    tailor_monthly_limit: parseInt(process.env.JOBUP_TAILOR_MONTHLY_LIMIT || '30', 10),
    jobs_scored_per_day: 6,
  },
  cost_cap_usd: parseFloat(process.env.JOBUP_SUBSCRIBER_COST_CAP_USD || '8'),
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

// The only values the search layer knows how to act on. Anything else is
// dropped rather than stored, so a typo in a payload can never become a filter
// that silently matches nothing.
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'temporary'];
const WORK_MODES = ['remote', 'hybrid', 'onsite'];

function enumList(v, allowed) {
  const seen = new Set();
  return (Array.isArray(v) ? v : [v])
    .map((x) => String(x == null ? '' : x).toLowerCase().trim().replace(/[\s-]+/g, '_'))
    .filter((x) => allowed.includes(x) && !seen.has(x) && seen.add(x));
}

function strList(v, max = 25, len = 120) {
  const seen = new Set();
  return (Array.isArray(v) ? v : String(v == null ? '' : v).split(','))
    .map((x) => String(x == null ? '' : x).trim().slice(0, len))
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
    .slice(0, max);
}

/**
 * work_modes (multi-select) is the real setting; remote_preference is the older
 * single-choice field the pre-filter was written against. Derive one from the
 * other so an old stored profile and a new one behave identically, and neither
 * surface has to know which era it is reading.
 */
function deriveRemotePreference(modes, legacy) {
  if (!modes || !modes.length) return legacy || null;
  if (modes.length >= WORK_MODES.length) return 'any';
  if (modes.includes('remote') && modes.includes('hybrid')) return 'hybrid';
  if (modes.length === 1) return modes[0];
  return 'any';
}

// Forced invariants, applied on EVERY save. Not advisory.
function sanitize(s) {
  const out = deepMerge(DEFAULTS, s || {});
  out.approval_required = true;                       // cannot be turned off
  if (!out.privacy) out.privacy = { ...DEFAULTS.privacy };
  // Sensitive fields can only be opted IN explicitly and are private otherwise.
  for (const k of ['email', 'phone', 'compensation', 'work_authorization', 'clearance']) {
    out.privacy[k] = out.privacy[k] === true;
  }

  const t = out.targeting || (out.targeting = { ...DEFAULTS.targeting });
  t.employment_types = enumList(t.employment_types, EMPLOYMENT_TYPES);
  t.work_modes = enumList(t.work_modes, WORK_MODES);
  t.remote_preference = deriveRemotePreference(t.work_modes, t.remote_preference);
  t.locations = strList(t.locations, 15);
  t.industries = strList(t.industries, 15);
  t.employers = strList(t.employers, 25);
  t.must_include = strList(t.must_include, 10, 60);
  t.exclude_keywords = strList(t.exclude_keywords, 25, 60);
  // A checkbox arrives as true, 'true' or 'on' depending on which surface saved
  // it. Anything else is false — this is opt-in, so ambiguity means no.
  t.open_to_relocation = t.open_to_relocation === true
    || t.open_to_relocation === 'true' || t.open_to_relocation === 'on';
  t.min_score = Math.max(0, Math.min(100, parseInt(t.min_score, 10) || 0));
  t.roles = (Array.isArray(t.roles) ? t.roles : [])
    .map((r) => (typeof r === 'string' ? { title: r } : r))
    .filter((r) => r && String(r.title || '').trim())
    .slice(0, 12)
    .map((r) => ({
      title: String(r.title).trim().slice(0, 120),
      slug: r.slug || slugify(r.title),
      page: r.page !== false,
    }));

  out.quotas.tailor_monthly_limit = Math.max(0, Math.min(500, out.quotas.tailor_monthly_limit | 0));
  out.cost_cap_usd = Math.max(0, Math.min(100, Number(out.cost_cap_usd) || 0));
  return out;
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Absolute blocks — checked at match, alert AND draft time (spec section 10).
function employerBlocked(settings, employer) {
  const list = ((settings || {}).blocked || {}).employers || [];
  const e = String(employer || '').toLowerCase();
  return list.some((x) => e.includes(String(x).toLowerCase()));
}
function contactBlocked(settings, contact) {
  const list = ((settings || {}).blocked || {}).contacts || [];
  const c = String(contact || '').toLowerCase();
  return list.some((x) => c.includes(String(x).toLowerCase()));
}

// Only what the owner actually typed. Never inferred, never paraphrased.
function outreachFacts(settings) {
  const f = (settings || {}).facts || {};
  const lines = [];
  if (f.work_authorization) lines.push(String(f.work_authorization));
  if (f.compensation_floor) lines.push(String(f.compensation_floor));
  if (f.availability) lines.push(String(f.availability));
  if (f.notice_period) lines.push(String(f.notice_period));
  return { lines, verbatim: true };
}

// Which roles get a public indexable page. Never invents one.
function pageRoles(settings) {
  return (((settings || {}).targeting || {}).roles || [])
    .filter((r) => r && r.title && r.page !== false)
    .map((r) => ({ ...r, slug: r.slug || slugify(r.title) }));
}

module.exports = {
  DEFAULTS, sanitize, deepMerge, slugify,
  employerBlocked, contactBlocked, outreachFacts, pageRoles,
  EMPLOYMENT_TYPES, WORK_MODES, enumList, strList, deriveRemotePreference,
};
