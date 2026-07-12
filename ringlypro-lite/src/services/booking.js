'use strict';

/**
 * In-process booking backend (the "tools" the voice agent calls).
 * Unlike full RinglyPro's loopback-HTTP tools, these are direct function calls
 * against the isolated Lite DB. Every function is tenant-scoped by tenant_id.
 */
const { Op } = require('sequelize');
// NOTE: alias the LiteNumber model — importing it as `Number` shadows the
// global Number constructor and breaks `.split('-').map(Number)` date parsing.
const { sequelize, Tenant, Number: LiteNumber, Call, Message, AvailabilityRule, Appointment } = require('../models');
const { zonedToUtc, utcToZonedParts, hhmmToMinutes, displaySlot } = require('../utils/dates');
const { answeringAllowed } = require('./entitlement');

function last10(p) { return String(p || '').replace(/[^0-9]/g, '').slice(-10); }

// The shared demo line answers as tenant_id 0 (no DB row). Resolve it to a
// synthetic tenant so the booking/message tools work in the demo (Mon–Fri 9–17).
const DEMO_TENANT = {
  id: 0, is_demo: true,
  timezone: 'America/New_York', locale: 'en',
  business_name: process.env.LITE_DEMO_BUSINESS || 'RinglyPro Lite Demo',
  owner_phone: null
};
function isDemo(tenantId) { return Number(tenantId) === 0; }
async function resolveTenant(tenantId) { return isDemo(tenantId) ? DEMO_TENANT : Tenant.findByPk(tenantId); }
const DEMO_RULES = [1, 2, 3, 4, 5].map(wd => ({ weekday: wd, start: '09:00', end: '17:00', slot_minutes: 30 }));

// Pick `k` VARIED slots across the sorted candidate list (one per evenly-spaced
// segment, randomized within the segment) so Lina offers different days/times
// each call instead of a robotic 9:00 / 9:30 / 10:00. Returns them sorted.
function pickVaried(all, k) {
  if (all.length <= k) return all;
  const seg = all.length / k;
  const chosen = new Map();
  for (let i = 0; i < k; i++) {
    const lo = Math.floor(i * seg);
    const hi = Math.max(lo, Math.floor((i + 1) * seg) - 1);
    const idx = Math.min(all.length - 1, lo + Math.floor(Math.random() * (hi - lo + 1)));
    chosen.set(all[idx].starts_at, all[idx]);
  }
  return Array.from(chosen.values()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

/** Resolve tenant by the dialed Lite DID. */
async function getBusinessInfo({ did, tenantId }) {
  let tenant = null;
  if (tenantId) tenant = await Tenant.findByPk(tenantId);
  if (!tenant && did) {
    const num = await LiteNumber.findOne({ where: { did } });
    if (num) tenant = await Tenant.findByPk(num.tenant_id);
  }
  if (!tenant) {
    // Shared demo line: if this DID is the configured demo number, answer as a
    // synthetic demo tenant (no DB row, no per-tenant cost) so prospects can
    // hear Lina before adding a card. Requires the DID's voice webhook to point
    // at this Lite service.
    const demo = process.env.LITE_DEMO_NUMBER;
    if (did && demo && last10(did) === last10(demo)) {
      return {
        success: true, tenant_id: 0, is_demo: true,
        business_name: process.env.LITE_DEMO_BUSINESS || 'RinglyPro Lite Demo',
        owner_name: null, owner_phone: null, transfer_number: null,
        // Spanish-first voice (Lupe) so es callers get a native demo; the agent
        // is bilingual and mirrors the caller's language (see relayAgent).
        country: 'US', locale: process.env.LITE_DEMO_LANG || 'es',
        timezone: 'America/New_York', suspended: false
      };
    }
    return { success: false, error: 'tenant_not_found' };
  }
  return {
    success: true,
    tenant_id: tenant.id,
    business_name: tenant.business_name,
    owner_name: tenant.owner_name,
    owner_phone: tenant.owner_phone,
    transfer_number: tenant.transfer_number,
    country: tenant.country,
    locale: tenant.locale,
    timezone: tenant.timezone,
    // Suspend answering on failed payment OR expired trial with no card.
    suspended: !answeringAllowed(tenant)
  };
}

/** Returning-caller recognition: name + upcoming appts by callback number. */
async function identifyCaller({ tenantId, phone }) {
  const l10 = last10(phone);
  if (!l10) return { success: true, found: false };
  const appts = await Appointment.findAll({
    where: {
      tenant_id: tenantId,
      status: 'confirmed',
      starts_at: { [Op.gte]: new Date() }
    },
    order: [['starts_at', 'ASC']],
    limit: 20
  });
  const mine = appts.filter(a => last10(a.callback_number) === l10);
  const name = mine[0] && mine[0].caller_name;
  return {
    success: true,
    found: !!name,
    caller_name: name || null,
    upcoming: mine.map(a => ({ appointment_id: a.id, starts_at: a.starts_at }))
  };
}

/**
 * Compute open slots across the next `days_ahead` days from availability rules,
 * excluding past and already-booked slots. Returns up to `limit` nearest slots.
 */
async function checkAvailability({ tenantId, date, days_ahead = 7, limit = 3 }) {
  const tenant = await resolveTenant(tenantId);
  if (!tenant) return { success: false, error: 'tenant_not_found' };
  const tz = tenant.timezone || 'America/New_York';
  const rules = isDemo(tenantId)
    ? DEMO_RULES
    : await AvailabilityRule.findAll({ where: { tenant_id: tenantId, active: true } });
  if (!rules.length) return { success: true, slots: [], slot_count: 0, note: 'no_availability_rules' };

  const now = new Date();
  const booked = await Appointment.findAll({
    where: { tenant_id: tenantId, status: 'confirmed', starts_at: { [Op.gte]: now } }
  });
  const bookedSet = new Set(booked.map(a => new Date(a.starts_at).getTime()));

  const startDay = 0;
  const endDay = date ? 1 : days_ahead;   // if a specific date requested, only that day
  const slots = [];

  for (let dOff = startDay; dOff <= endDay && slots.length < 80; dOff++) {
    // Determine the calendar date (in tenant tz) we are generating for.
    let y, mo, d;
    if (date) {
      [y, mo, d] = date.split('-').map(Number);
    } else {
      const probe = new Date(now.getTime() + dOff * 86400000);
      const p = utcToZonedParts(tz, probe);
      y = p.y; mo = p.mo; d = p.d;
    }
    // Weekday of that local date.
    const localNoon = zonedToUtc(tz, y, mo, d, 12, 0);
    const wd = utcToZonedParts(tz, localNoon).weekday;
    const dayRules = rules.filter(r => r.weekday === wd);
    for (const rule of dayRules) {
      const step = rule.slot_minutes || 30;
      for (let m = hhmmToMinutes(rule.start); m + step <= hhmmToMinutes(rule.end); m += step) {
        const h = Math.floor(m / 60), mi = m % 60;
        const startUtc = zonedToUtc(tz, y, mo, d, h, mi);
        if (startUtc.getTime() <= now.getTime() + 60000) continue;   // future only
        if (bookedSet.has(startUtc.getTime())) continue;
        slots.push({
          starts_at: startUtc.toISOString(),
          date: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          time: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
          slot_minutes: step,
          display: displaySlot(tz, startUtc, tenant.locale)
        });
        if (slots.length >= 80) break;
      }
    }
    if (date) break;
  }
  slots.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  // Specific-date requests: offer the nearest times on that day in order.
  // Otherwise offer a VARIED spread so it doesn't sound robotic.
  const top = date ? slots.slice(0, limit) : pickVaried(slots, limit);
  return { success: true, timezone: tz, slot_count: top.length, slots: top };
}

/**
 * Atomic booking. Uses a transaction + the partial unique index
 * uq_lite_appts_slot(tenant_id, starts_at) WHERE status<>'cancelled' as the
 * final race guard, so two concurrent calls can never double-book one slot.
 */
async function bookAppointment({ tenantId, caller_name, callback_number, date, time, starts_at, slot_minutes, call_id }) {
  const tenant = await resolveTenant(tenantId);
  if (!tenant) return { success: false, error: 'tenant_not_found' };
  const tz = tenant.timezone || 'America/New_York';

  let startUtc;
  if (starts_at) {
    startUtc = new Date(starts_at);
  } else if (date && time) {
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    startUtc = zonedToUtc(tz, y, mo, d, h, mi);
  } else {
    return { success: false, error: 'missing_slot' };
  }
  if (isNaN(startUtc.getTime())) return { success: false, error: 'bad_slot' };
  if (startUtc.getTime() <= Date.now()) return { success: false, error: 'slot_in_past' };

  const step = slot_minutes || 30;
  const endUtc = new Date(startUtc.getTime() + step * 60000);

  try {
    const appt = await sequelize.transaction(async (tx) => {
      const clash = await Appointment.findOne({
        where: { tenant_id: tenantId, starts_at: startUtc, status: 'confirmed' },
        transaction: tx,
        lock: tx.LOCK.UPDATE
      });
      if (clash) { const e = new Error('slot_taken'); e.code = 'SLOT_TAKEN'; throw e; }
      return Appointment.create({
        tenant_id: tenantId, call_id: call_id || null,
        caller_name: caller_name || null, callback_number: callback_number || null,
        starts_at: startUtc, ends_at: endUtc, status: 'confirmed'
      }, { transaction: tx });
    });
    return {
      success: true, booked: true, appointment_id: appt.id,
      starts_at: startUtc.toISOString(),
      display: displaySlot(tz, startUtc, tenant.locale)
    };
  } catch (e) {
    // Unique-index violation from a concurrent booking also lands here.
    if (e.code === 'SLOT_TAKEN' || (e.name && e.name.includes('Unique'))) {
      return { success: false, error: 'slot_taken' };
    }
    console.error('[lite:booking] book error:', e.message);
    return { success: false, error: e.message };
  }
}

/** Message-taking path. */
async function takeMessage({ tenantId, call_id, caller_name, callback_number, body }) {
  const tenant = await resolveTenant(tenantId);
  if (!tenant) return { success: false, error: 'tenant_not_found' };
  const msg = await Message.create({
    tenant_id: tenantId, call_id: call_id || null,
    caller_name: caller_name || null, callback_number: callback_number || null,
    body: body || ''
  });
  return { success: true, saved: true, message_id: msg.id };
}

module.exports = { getBusinessInfo, identifyCaller, checkAvailability, bookAppointment, takeMessage, last10 };
