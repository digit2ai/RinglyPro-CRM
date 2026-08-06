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

const BASE_DOMAIN = process.env.JOBUP_BASE_DOMAIN || 'jobup.dev';

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

async function isTaken(label) {
  if (RESERVED.has(label)) return true;
  // Addresses are STORED as the full host, so compare against the full host.
  const host = `${label}.${BASE_DOMAIN}`;
  for (const value of [host, label]) {
    if (await models.subscribers.findOne({ where: { address: value } })) return true;
    // A retired address stays reserved — never reassign a link a recruiter holds.
    if (await models.sites.findOne({ where: { address: value } })) return true;
    if (models.address_aliases &&
        await models.address_aliases.findOne({ where: { address: value } })) return true;
  }
  return false;
}

/** Resolve the first free rung. Returns the label and the full host. */
async function allocate(parts) {
  const options = ladder(parts);
  for (const label of options) {
    if (!(await isTaken(label))) {
      return { ok: true, label, host: `${label}.${BASE_DOMAIN}`, url: `https://${label}.${BASE_DOMAIN}`,
               ladder: options, rung: options.indexOf(label) };
    }
  }
  return { ok: false, reason: 'every rung of the ladder is taken', ladder: options };
}

/** Non-mutating preview for the teaser — shows the exact address they will get. */
async function preview(parts) {
  const r = await allocate(parts);
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
                   BASE_DOMAIN, RESERVED, MAX_NUMERIC };
