'use strict';

// =============================================================
// SERVER-SIDE ENTITLEMENT RESOLVER — the single guard consult point.
//
// LEGACY-SAFE BY DESIGN (owner decision 2026-08): existing subscribers are left
// exactly as they are. Any account with no `plan` set — i.e. every account
// created before tiers shipped — is a LEGACY full-access user and is NEVER gated
// by the new caps. Only rows with an explicit `plan` (new tiered signups) resolve
// through plans.js. So the tier system can go live without touching a single
// current subscriber.
//
// tenant_id comes from the session upstream — never from a request parameter.
// This module reads the row and resolves; it never charges and never trusts the
// client's claim about its own plan.
// =============================================================

const { models } = require('../models');
const plans = require('./plans');

function entitlementForSub(sub) {
  if (!sub) return { legacy: false, plan: 'free', effective_plan: 'free', status: 'unknown', caps: plans.PLANS.free.caps, degraded: false, unknown: true };
  const plan = sub.plan; // null/'' for legacy accounts
  if (!plan) {
    // Pre-tiers account: untouched, full access. caps:null tells callers "do not
    // enforce the new limits for this user".
    return { legacy: true, plan: null, effective_plan: 'legacy', status: sub.status, caps: null, degraded: false };
  }
  const e = plans.entitlement(plan, sub.status);
  return { legacy: false, plan, ...e };
}

async function entitlementFor(tenantId) {
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  return entitlementForSub(sub);
}

// Is this tenant allowed a named boolean/counted feature right now?
// Legacy accounts are always allowed (they are not on the new tiers).
async function allowsFeature(tenantId, feature) {
  const e = await entitlementFor(tenantId);
  if (e.legacy) return true;
  if (!e.caps) return true;
  const v = e.caps[feature];
  return typeof v === 'boolean' ? v : (v === null || v > 0);
}

// The numeric cap for a metered feature (matches/scorings/tailorings), or null
// for unlimited, or Infinity for legacy (uncapped by the new system).
async function capFor(tenantId, feature) {
  const e = await entitlementFor(tenantId);
  if (e.legacy || !e.caps) return Infinity;
  const v = e.caps[feature];
  return v === null ? Infinity : (typeof v === 'number' ? v : (v ? Infinity : 0));
}

// ---- Free-tier match drip -------------------------------------------------
// Free surfaces a SMALL, slowly-growing set of matches: the base weekly cap
// (5) on day one, then +1 for each full week the account has existed, capped at
// JOBUP_FREE_MATCHES_MAX. The scarcity is the point — it is the upgrade nudge.
// Higher tiers are uncapped, so this only ever narrows Free.

const FREE_MATCHES_MAX = (() => {
  const v = parseInt(process.env.JOBUP_FREE_MATCHES_MAX || '', 10);
  return Number.isFinite(v) ? v : 12;
})();
const WEEK_MS = 7 * 24 * 3600 * 1000;

/**
 * The number of Hunter matches a Free account may SEE right now, and when the
 * next one unlocks. Only meaningful for effective-Free accounts; callers gate
 * on entitlement first. Never applies to legacy or paid tiers.
 */
function freeMatchAllowanceFor(sub, now) {
  const base = plans.PLANS.free.caps.matches_per_week || 5;
  const start = sub && sub.created_at ? new Date(sub.created_at).getTime() : Date.now();
  const t = (now ? new Date(now).getTime() : Date.now());
  const weeks = Math.max(0, Math.floor((t - start) / WEEK_MS));
  const allowance = Math.min(FREE_MATCHES_MAX, base + weeks);
  const atMax = allowance >= FREE_MATCHES_MAX;
  const msIntoWeek = Math.max(0, (t - start)) % WEEK_MS;
  const next_unlock_days = atMax ? null : Math.max(1, Math.ceil((WEEK_MS - msIntoWeek) / (24 * 3600 * 1000)));
  return { allowance, base, weeks, max: FREE_MATCHES_MAX, at_max: atMax, next_unlock_days };
}

/**
 * How many openings the Hunter scans per day for this tenant. Tier-ranked so a
 * paid account always evaluates at least as much of the pool as a cheaper one
 * (Free 8 < Search 40 < Landed 120). Legacy accounts keep their settings-driven
 * number (resolved by the caller); this returns null for legacy to signal that.
 */
function hunterScanFor(sub) {
  const e = entitlementForSub(sub);
  if (e.legacy || !e.caps) return null;                 // legacy: caller uses settings
  const v = e.caps.hunter_scan_per_day;
  return Number.isFinite(v) && v > 0 ? v : null;
}

module.exports = {
  entitlementFor, entitlementForSub, allowsFeature, capFor,
  freeMatchAllowanceFor, hunterScanFor, FREE_MATCHES_MAX,
};
