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
    industries: [],
    employers: [],
    seniority: null,
    remote_preference: null,        // remote|hybrid|onsite|any
  },
  geo: {
    allowed_countries: [],          // [] === unrestricted
    flag_unknown: true,
  },
  facts: {                          // owner-entered, quoted verbatim or omitted
    work_authorization: null,
    compensation_floor: null,
    availability: null,
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

// Forced invariants, applied on EVERY save. Not advisory.
function sanitize(s) {
  const out = deepMerge(DEFAULTS, s || {});
  out.approval_required = true;                       // cannot be turned off
  if (!out.privacy) out.privacy = { ...DEFAULTS.privacy };
  // Sensitive fields can only be opted IN explicitly and are private otherwise.
  for (const k of ['email', 'phone', 'compensation', 'work_authorization', 'clearance']) {
    out.privacy[k] = out.privacy[k] === true;
  }
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
};
