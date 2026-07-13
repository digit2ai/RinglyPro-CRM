'use strict';

/**
 * Minute banking for RinglyPro Lite.
 *
 * A tenant's available answered minutes in a period =
 *     includedMinutes (plan)  +  rollover_minutes (unused, carried forward)
 *   + purchased_minutes (prepaid overage top-ups bought via recharge).
 *
 * Consumption order when metering a period's used minutes:
 *   included  →  rollover  →  purchased  →  (billable overage beyond all three).
 *
 * At each period boundary reconcileRollover() carries the leftover of
 * (included + rollover) into rollover_minutes for the new period, and debits any
 * purchased minutes that were dipped into. Purchased minutes never expire.
 */

const { Op } = require('sequelize');
const { Tenant, Call } = require('../models');

function int(env, def) { const v = parseInt(process.env[env], 10); return Number.isFinite(v) ? v : def; }
function includedMinutes() { return int('LITE_INCLUDED_MIN_US', 150); }
function overagePerMinCents() { return int('LITE_OVERAGE_US_CENTS', 40); }
function num(v) { return Number(v) || 0; }

function stripe() {
  const key = process.env.LITE_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('LITE_STRIPE_SECRET_KEY not set');
  return require('stripe')(key);
}

// Current billing period start: Stripe subscription period, else calendar month.
async function periodStart(tenant) {
  if (tenant.stripe_subscription_id) {
    try {
      const sub = await stripe().subscriptions.retrieve(tenant.stripe_subscription_id);
      if (sub && sub.current_period_start) return new Date(sub.current_period_start * 1000);
    } catch (_) { /* fall through */ }
  }
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// Answered minutes used in [since, until) (until optional = now).
async function usedMinutes(tenantId, since, until) {
  const where = { tenant_id: tenantId, duration: { [Op.gt]: 0 }, started_at: { [Op.gte]: since } };
  if (until) where.started_at = { [Op.gte]: since, [Op.lt]: until };
  const calls = await Call.findAll({ where, attributes: ['duration'] });
  const secs = calls.reduce((a, c) => a + (c.duration || 0), 0);
  return { minutes: +(secs / 60).toFixed(2), calls: calls.length };
}

/**
 * Roll unused included minutes into the next period if the billing period rolled
 * over since we last reconciled. Idempotent — safe to call on every usage/status
 * read and from a daily scheduler. Mutates + saves the tenant when it advances.
 */
async function reconcileRollover(tenant) {
  const curStart = await periodStart(tenant);
  const last = tenant.rollover_period_start ? new Date(tenant.rollover_period_start) : null;
  if (!last) { tenant.rollover_period_start = curStart; await tenant.save(); return tenant; }
  if (curStart.getTime() <= last.getTime()) return tenant;   // same period — nothing to do

  // The period [last, curStart) just closed. Meter what it used.
  const inc = includedMinutes();
  const rollIn = num(tenant.rollover_minutes);
  const purchased = num(tenant.purchased_minutes);
  const { minutes: usedPrev } = await usedMinutes(tenant.id, last, curStart);

  const includedPlusRoll = inc + rollIn;
  const newRollover = Math.max(0, +(includedPlusRoll - usedPrev).toFixed(2));           // unused included+rollover carries
  const consumedFromPurchased = Math.max(0, +(usedPrev - includedPlusRoll).toFixed(2)); // dipped into prepaid
  const newPurchased = Math.max(0, +(purchased - consumedFromPurchased).toFixed(2));    // prepaid persists

  tenant.rollover_minutes = newRollover;
  tenant.purchased_minutes = newPurchased;
  tenant.rollover_period_start = curStart;
  await tenant.save();
  return tenant;
}

/** Credit prepaid minutes (from a successful recharge). Mutates + saves. */
async function creditMinutes(tenant, minutes) {
  tenant.purchased_minutes = +(num(tenant.purchased_minutes) + Number(minutes)).toFixed(2);
  await tenant.save();
  return num(tenant.purchased_minutes);
}

/** Dollars→minutes at the overage rate (e.g. $10 @ $0.40/min = 25 min). */
function minutesForCents(cents) {
  const rate = overagePerMinCents();
  return rate > 0 ? +(cents / rate).toFixed(2) : 0;
}

/**
 * Full usage snapshot for the current period, rollover-aware.
 */
async function usageSnapshot(tenant) {
  await reconcileRollover(tenant);
  const since = await periodStart(tenant);
  const { minutes, calls } = await usedMinutes(tenant.id, since);
  const inc = includedMinutes();
  const rollover = num(tenant.rollover_minutes);
  const purchased = num(tenant.purchased_minutes);
  const available = +(inc + rollover + purchased).toFixed(2);
  const overageMin = Math.max(0, +(minutes - available).toFixed(2));    // billable only beyond all banked minutes
  const overageUsd = +((overageMin * overagePerMinCents()) / 100).toFixed(2);
  return {
    period_start: since.toISOString(),
    calls,
    minutes_used: minutes,
    included_minutes: inc,
    rollover_minutes: rollover,
    purchased_minutes: purchased,
    available_minutes: available,
    minutes_remaining: Math.max(0, +(available - minutes).toFixed(2)),
    overage_minutes: overageMin,
    overage_usd: overageUsd
  };
}

module.exports = {
  includedMinutes, overagePerMinCents, periodStart, usedMinutes,
  reconcileRollover, creditMinutes, minutesForCents, usageSnapshot
};
