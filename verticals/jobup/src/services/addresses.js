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
function ladder({ first, middle, last, profession, city, industry }) {
  const f = clean(first), m = clean(middle), l = clean(last);
  const out = [];
  if (f && l) out.push(f + l);                                  // firstnamelastname
  if (f && m && l) out.push(f + m[0] + l);                      // + middle initial
  if (f && m && l) out.push(f + m + l);                         // + full middle
  if (f && l && profession) out.push(f + l + clean(profession)); // + profession
  if (f && l && city) out.push(f + l + clean(city));            // + city
  if (f && l && industry) out.push(f + l + clean(industry));    // + industry
  if (f && l) for (let i = 1; i <= 3; i++) out.push(f + l + i); // + short numeric
  if (!out.length && f) out.push(f);
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

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', middle: '', last: '' };
  if (parts.length === 1) return { first: parts[0], middle: '', last: '' };
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] };
  return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] };
}

module.exports = { ladder, allocate, preview, isTaken, splitName, clean, BASE_DOMAIN, RESERVED };
