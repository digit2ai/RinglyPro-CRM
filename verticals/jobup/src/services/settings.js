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
  // WHERE THEIR ADDRESS HAS ACTUALLY BEEN PUT.
  //
  // A site nothing links to is a site Google has no reason to crawl. Every
  // placement here is also a backlink, which is what makes the role pages rank.
  // The product cannot do these for them — only track which are done.
  presence: {
    placed: [],                     // slugs from PLACEMENTS below
    directory_opt_in: false,        // opt-in, never assumed
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
    // A manual search has its OWN allowance so it is never starved by the
    // scheduled run. One a day: enough to act on a change of mind, not enough
    // to turn the button into a second budget.
    manual_runs_per_day: 1,
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
  const pr = out.presence || (out.presence = { ...DEFAULTS.presence });
  const known = new Set(PLACEMENTS.map((x) => x.slug));
  pr.placed = (Array.isArray(pr.placed) ? pr.placed : [])
    .filter((x) => known.has(x)).slice(0, PLACEMENTS.length);
  // Opt-in means opt-in: anything but an explicit yes is no.
  pr.directory_opt_in = pr.directory_opt_in === true
    || pr.directory_opt_in === 'true' || pr.directory_opt_in === 'on';

  t.roles = roleList(t.roles, 12);
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

/**
 * ROLE TARGETS ARRIVE AS STRINGS AND WERE READ AS OBJECTS.
 *
 * The signup form has always asked "Job titles you want" and stored the answer
 * via strList() — an array of plain strings. pageRoles() filters on `r.title`,
 * so `'Sales Executive'.title` was undefined and EVERY role was dropped. The
 * consequence was silent and total: no subscriber has ever had a /roles/:role
 * page, and every sitemap contained exactly one url.
 *
 * Normalising here, at the boundary, means every downstream reader gets the
 * canonical shape and neither surface has to know the other's format.
 */
/**
 * The five places worth putting the address, in the order that matters.
 *
 * Each is a real backlink AND somewhere a recruiter already looks. These are
 * PREREQUISITES, not guarantees — nothing here promises anyone will search.
 */
const PLACEMENTS = [
  { slug: 'linkedin', order: 1,
    en: { title: 'LinkedIn profile', what: 'Paste it into the Website field on your profile.',
          why: 'The first place a recruiter opens, and the strongest link you can give us.' },
    es: { title: 'Perfil de LinkedIn', what: 'Pégalo en el campo Sitio web de tu perfil.',
          why: 'El primer lugar que abre un reclutador, y el enlace más fuerte que puedes darnos.' },
    href: 'https://www.linkedin.com/in/me/edit/forms/contact-info/' },
  { slug: 'email_signature', order: 2,
    en: { title: 'Email signature', what: 'Add it under your name, on every message you send.',
          why: 'Every email becomes an invitation to look you up properly.' },
    es: { title: 'Firma de correo', what: 'Agrégalo debajo de tu nombre, en cada mensaje que envíes.',
          why: 'Cada correo se convierte en una invitación a conocerte mejor.' },
    href: null },
  { slug: 'job_boards', order: 3,
    en: { title: 'Indeed, Dice or your job board', what: 'Put it in the personal website field of your profile.',
          why: 'Recruiters sourcing there can reach the full picture in one click.' },
    es: { title: 'Indeed, Dice u otro portal', what: 'Ponlo en el campo de sitio web personal de tu perfil.',
          why: 'Quien busque ahí llega al panorama completo con un clic.' },
    href: null },
  { slug: 'github', order: 4,
    en: { title: 'GitHub or portfolio bio', what: 'Add it to your bio or README.',
          why: 'A public profile that links to you is a link search engines follow.' },
    es: { title: 'Bio de GitHub o portafolio', what: 'Agrégalo a tu bio o README.',
          why: 'Un perfil público que te enlaza es un enlace que los buscadores siguen.' },
    href: null },
  { slug: 'qr', order: 5,
    en: { title: 'Your QR code, printed', what: 'On a card, a CV footer, or a conference badge.',
          why: 'The only one that works on paper, where a URL cannot be clicked.' },
    es: { title: 'Tu código QR, impreso', what: 'En una tarjeta, el pie de tu CV o una credencial.',
          why: 'El único que funciona en papel, donde una URL no se puede pulsar.' },
    href: null },
];

/** The checklist for one subscriber, in their language, with progress. */
function presenceChecklist(settings, lang) {
  const st = sanitize(settings);
  const done = new Set(st.presence.placed);
  const l = lang === 'es' ? 'es' : 'en';
  const items = PLACEMENTS.slice().sort((a, b) => a.order - b.order).map((p) => ({
    slug: p.slug, title: p[l].title, what: p[l].what, why: p[l].why,
    href: p.href, done: done.has(p.slug),
  }));
  return {
    items,
    done_count: items.filter((i) => i.done).length,
    total: items.length,
    directory_opt_in: st.presence.directory_opt_in,
    // Said once, here, so no surface has to remember to say it.
    note: l === 'es'
      ? 'Estos son requisitos, no garantías. Ponen tu dirección donde los reclutadores ya miran '
        + 'y son los enlaces que hacen que tus páginas aparezcan en buscadores.'
      : 'These are prerequisites, not guarantees. They put your address where recruiters already '
        + 'look, and they are the links that make your pages rank.',
  };
}

function roleList(v, max) {
  const seen = new Set();
  return (Array.isArray(v) ? v : [])
    .map((r) => {
      if (typeof r === 'string') return { title: r.trim(), page: true };
      if (r && typeof r === 'object' && r.title) {
        return { ...r, title: String(r.title).trim(), page: r.page !== false };
      }
      return null;
    })
    .filter((r) => r && r.title && r.title.length >= 2 && r.title.length <= 80)
    .map((r) => ({ ...r, slug: r.slug || slugify(r.title) }))
    .filter((r) => r.slug && !seen.has(r.slug) && seen.add(r.slug))
    .slice(0, max || 12);
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
  // roleList() handles both shapes, so a row written before the fix still
  // renders its pages without waiting for a backfill or a re-save.
  return roleList(((settings || {}).targeting || {}).roles, 12)
    .filter((r) => r.page !== false);
}

module.exports = {
  roleList, PLACEMENTS, presenceChecklist,
  DEFAULTS, sanitize, deepMerge, slugify,
  employerBlocked, contactBlocked, outreachFacts, pageRoles,
  EMPLOYMENT_TYPES, WORK_MODES, enumList, strList, deriveRemotePreference,
};
