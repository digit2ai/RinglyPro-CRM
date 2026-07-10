'use strict';

/**
 * In-process booking backend (the "tools" the voice agent calls).
 * Unlike full RinglyPro's loopback-HTTP tools, these are direct function calls
 * against the isolated Lite DB. Every function is tenant-scoped by tenant_id.
 */
const { Op } = require('sequelize');
const { sequelize, Tenant, Number, Call, Message, AvailabilityRule, Appointment } = require('../models');
const { zonedToUtc, utcToZonedParts, hhmmToMinutes, displaySlot } = require('../utils/dates');

function last10(p) { return String(p || '').replace(/[^0-9]/g, '').slice(-10); }

/** Resolve tenant by the dialed Lite DID. */
async function getBusinessInfo({ did, tenantId }) {
  let tenant = null;
  if (tenantId) tenant = await Tenant.findByPk(tenantId);
  if (!tenant && did) {
    const num = await Number.findOne({ where: { did } });
    if (num) tenant = await Tenant.findByPk(num.tenant_id);
  }
  if (!tenant) return { success: false, error: 'tenant_not_found' };
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
    suspended: !!tenant.suspended_at || tenant.subscription_status === 'suspended' || tenant.subscription_status === 'canceled'
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
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) return { success: false, error: 'tenant_not_found' };
  const tz = tenant.timezone || 'America/New_York';
  const rules = await AvailabilityRule.findAll({ where: { tenant_id: tenantId, active: true } });
  if (!rules.length) return { success: true, slots: [], slot_count: 0, note: 'no_availability_rules' };

  const now = new Date();
  const booked = await Appointment.findAll({
    where: { tenant_id: tenantId, status: 'confirmed', starts_at: { [Op.gte]: now } }
  });
  const bookedSet = new Set(booked.map(a => new Date(a.starts_at).getTime()));

  const startDay = 0;
  const endDay = date ? 1 : days_ahead;   // if a specific date requested, only that day
  const slots = [];

  for (let dOff = startDay; dOff <= endDay && slots.length < limit * 4; dOff++) {
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
        if (slots.length >= limit * 4) break;
      }
    }
    if (date) break;
  }
  slots.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const top = slots.slice(0, limit);
  return { success: true, timezone: tz, slot_count: top.length, slots: top };
}

/**
 * Atomic booking. Uses a transaction + the partial unique index
 * uq_lite_appts_slot(tenant_id, starts_at) WHERE status<>'cancelled' as the
 * final race guard, so two concurrent calls can never double-book one slot.
 */
async function bookAppointment({ tenantId, caller_name, callback_number, date, time, starts_at, slot_minutes, call_id }) {
  const tenant = await Tenant.findByPk(tenantId);
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
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) return { success: false, error: 'tenant_not_found' };
  const msg = await Message.create({
    tenant_id: tenantId, call_id: call_id || null,
    caller_name: caller_name || null, callback_number: callback_number || null,
    body: body || ''
  });
  return { success: true, saved: true, message_id: msg.id };
}

module.exports = { getBusinessInfo, identifyCaller, checkAvailability, bookAppointment, takeMessage, last10 };
