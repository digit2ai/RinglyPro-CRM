'use strict';

// =============================================================
// Web address allocation (spec section 9).
//
// Every subscriber gets firstnamelastname.jobup.dev under a single wildcard
// certificate. No registrar, no ICANN obligations, no renewal exposure.
// Custom domains are PARKED (spec section 8.5).
//
// INVARIANT: an address that is already live is NEVER reassigned — a recruiter
// may be holding the link.
// =============================================================

const { models } = require('../models');

// THE ADDRESS DOMAIN FOLLOWS THE BRAND, NOT A GLOBAL CONSTANT.
//
// This was one module-level constant, so a doctor signing up on jobmd.io was
// offered marcuswhitfield.JOBUP.DEV — the wrong product's domain, on the one
// screen of the whole funnel that is entirely about their own name. The
// registry's site_suffix decides it now, and this constant is only the
// fallback for a caller with no brand in hand.
const BASE_DOMAIN = process.env.JOBUP_BASE_DOMAIN || 'jobup.dev';

/** The subscriber-site domain for a brand ('' or null => JobUp). */
function baseDomain(brand) {
  if (!brand) return BASE_DOMAIN;
  const b = typeof brand === 'string' ? require('../brand').byId(brand) : brand;
  // An explicit env override still wins for JobUp, so nothing about the
  // existing deployment changes.
  if (b.id === require('../brand').DEFAULT_ID) return BASE_DOMAIN;
  return b.site_suffix;
}

const RESERVED = new Set([
  'www', 'api', 'app', 'admin', 'mail', 'smtp', 'ftp', 'blog', 'help', 'support',
  'status', 'docs', 'static', 'assets', 'cdn', 'dashboard', 'login', 'signup',
  'jobup', 'teaser', 'billing', 'stripe', 'webhook', 'webhooks', 'test', 'staging',
]);

function clean(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The ladder, in decreasing preference (spec section 9).
 * Clean, professional, memorable only — no long or random variants.
 */
// How many numbered fallbacks to offer before giving up.
const MAX_NUMERIC = parseInt(process.env.JOBUP_ADDRESS_MAX_NUMERIC || '99', 10);

/**
 * The address comes from the PERSON'S NAME, and nothing else.
 *
 * firstnamelastname, then firstnamelastname1, 2, 3, 4, 5 ... until one is free.
 *
 * Earlier versions tried profession, city and industry before numbering, which
 * meant the second Manuel Stagg could be handed `manuelstaggtampa` — an address
 * derived from a fact he never asked to publish, and unpredictable besides.
 * A number is honest, predictable, and reveals nothing.
 */
function ladder({ first, middle, last }) {
  const f = clean(first), m = clean(middle), l = clean(last);
  const base = (f && l) ? f + l : (f || l || '');
  if (!base) return [];

  const out = [base];
  // A middle initial is still the person's own name, so it is offered once
  // before falling back to digits.
  if (f && m && l) out.push(f + m[0] + l);
  for (let i = 1; i <= MAX_NUMERIC; i++) out.push(base + i);

  return out.filter((x) => x.length >= 3 && x.length <= 40 && !RESERVED.has(x));
}

async function isTaken(label, domain) {
  if (RESERVED.has(label)) return true;
  // THE NAMESPACE IS PER BRAND. marcuswhitfield.jobup.dev and
  // marcuswhitfield.jobmd.io are different hosts and both may exist — they are
  // different products with different people on them. Checking a bare label
  // across every brand pushed a doctor to marcuswhitfield1.jobmd.io because
  // somebody unrelated held marcuswhitfield.jobup.dev.
  const dom = domain || BASE_DOMAIN;
  const host = `${label}.${dom}`;
  // The bare label is still checked for the DEFAULT brand only: some early
  // JobUp rows stored just the label, and those must stay reserved.
  const candidates = dom === BASE_DOMAIN ? [host, label] : [host];
  for (const value of candidates) {
    if (await models.subscribers.findOne({ where: { address: value } })) return true;
    // A retired address stays reserved — never reassign a link a recruiter holds.
    if (await models.sites.findOne({ where: { address: value } })) return true;
    if (models.address_aliases &&
        await models.address_aliases.findOne({ where: { address: value } })) return true;
  }
  return false;
}

/** Resolve the first free rung. Returns the label and the full host. */
async function allocate(parts, brand) {
  const domain = baseDomain(brand);
  const options = ladder(parts);
  for (const label of options) {
    if (!(await isTaken(label, domain))) {
      return { ok: true, label, host: `${label}.${domain}`, url: `https://${label}.${domain}`,
               ladder: options, rung: options.indexOf(label) };
    }
  }
  return { ok: false, reason: 'every rung of the ladder is taken', ladder: options };
}

/** Non-mutating preview for the teaser — shows the exact address they will get. */
async function preview(parts, brand) {
  const r = await allocate(parts, brand);
  return r.ok
    ? { available: true, address: r.host, url: r.url, rung: r.rung, exact_match: r.rung === 0 }
    : { available: false, reason: r.reason, ladder: r.ladder };
}

/**
 * Validate an address the subscriber chose. Returns { ok, label } or a reason.
 * Deliberately strict: this becomes a hostname, and it is the thing recruiters
 * type and AI agents fetch.
 */
function validateLabel(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return { ok: false, reason: 'Choose an address.' };
  const label = clean(raw);
  if (!label) return { ok: false, reason: 'Use letters and numbers.' };
  if (label !== raw.replace(/[^a-z0-9-]/g, '')) {
    // clean() strips more than the user may expect; say what we would use.
    if (label.length < 3) return { ok: false, reason: 'Use at least 3 letters or numbers.' };
  }
  if (label.length < 3) return { ok: false, reason: 'Use at least 3 letters or numbers.' };
  if (label.length > 40) return { ok: false, reason: 'Keep it to 40 characters or fewer.' };
  if (RESERVED.has(label)) return { ok: false, reason: 'That address is reserved.' };
  if (/^\d+$/.test(label)) return { ok: false, reason: 'Use at least one letter.' };
  return { ok: true, label };
}

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', middle: '', last: '' };
  if (parts.length === 1) return { first: parts[0], middle: '', last: '' };
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] };
  return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] };
}

module.exports = { ladder, allocate, preview, isTaken, splitName, clean, validateLabel,
                   BASE_DOMAIN, baseDomain, RESERVED, MAX_NUMERIC };
