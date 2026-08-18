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

module.exports = { entitlementFor, entitlementForSub, allowsFeature, capFor };
