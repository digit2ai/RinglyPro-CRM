'use strict';

/**
 * Lawn Co-Pilot — scheduling service (the Dispatcher's calendar)
 *
 * Real availability only. The Dispatcher never invents a slot: every date it
 * offers comes from this module, which checks business days, crew capacity, and
 * existing bookings.
 */

const { Op } = require('sequelize');
const { Appointment, Crew, Subscription, Tenant } = require('../models');

const DAY_MS = 86400000;

/**
 * Local calendar date, NOT UTC.
 *
 * toISOString() converts to UTC first, so after ~20:00 Eastern it returns
 * tomorrow's date while getDay() still reports today's weekday. That mismatch
 * made the Dispatcher offer Saturdays labeled "Friday" and then refuse to book
 * them. Every date string in this module is the local calendar day.
 */
function toDateStr(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) { return new Date(new Date(d).getTime() + n * DAY_MS); }

const WINDOWS = [
  { start: '08:00', end: '12:00', label: 'Morning (8am - 12pm)' },
  { start: '12:00', end: '16:00', label: 'Afternoon (12pm - 4pm)' }
];

async function businessDays(tenant_id) {
  try {
    const t = await Tenant.findByPk(tenant_id, { raw: true });
    const bh = (t && t.business_hours) || {};
    return Array.isArray(bh.days) && bh.days.length ? bh.days : [1, 2, 3, 4, 5];
  } catch (e) {
    return [1, 2, 3, 4, 5];
  }
}

async function dailyCapacity(tenant_id) {
  try {
    const crews = await Crew.findAll({ where: { tenant_id, active: true }, raw: true });
    if (!crews.length) return 12;
    return crews.reduce((a, c) => a + (c.capacity_per_day || 12), 0);
  } catch (e) {
    return 12;
  }
}

/**
 * Real open slots. Never returns a day that is full, closed, or in the past.
 */
async function checkAvailability({ tenant_id, from, days = 14, limit = 8 }) {
  const start = from ? new Date(from) : addDays(new Date(), 1);
  const allowed = await businessDays(tenant_id);
  const capacity = await dailyCapacity(tenant_id);

  const end = addDays(start, days);
  const booked = await Appointment.findAll({
    where: {
      tenant_id,
      service_date: { [Op.between]: [toDateStr(start), toDateStr(end)] },
      status: { [Op.notIn]: ['cancelled', 'skipped'] }
    },
    raw: true
  });
  const counts = {};
  booked.forEach(a => { counts[a.service_date] = (counts[a.service_date] || 0) + 1; });

  const slots = [];
  for (let i = 0; i < days && slots.length < limit; i++) {
    const d = addDays(start, i);
    if (!allowed.includes(d.getDay())) continue;
    const ds = toDateStr(d);
    const used = counts[ds] || 0;
    if (used >= capacity) continue;
    const remaining = capacity - used;
    WINDOWS.forEach(w => {
      if (slots.length >= limit) return;
      slots.push({
        date: ds,
        day_name: d.toLocaleDateString('en-US', { weekday: 'long' }),
        display: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        window_start: w.start,
        window_end: w.end,
        window_label: w.label,
        slots_remaining: Math.max(1, Math.floor(remaining / 2))
      });
    });
  }
  return { slots, capacity_per_day: capacity, business_days: allowed };
}

function nextServiceDate(frequency, from) {
  const base = from ? new Date(from) : new Date();
  const step = { weekly: 7, biweekly: 14, monthly: 30, one_time: null }[frequency];
  if (!step) return null;
  return toDateStr(addDays(base, step));
}

async function bookAppointment({ tenant_id, customer_id, property_id, subscription_id, service_date, window_start, window_end, service_type, price_cents, addons, notes }) {
  const allowed = await businessDays(tenant_id);
  const d = new Date(service_date + 'T12:00:00');
  if (isNaN(d.getTime())) return { success: false, error: 'Invalid service date' };
  if (!allowed.includes(d.getDay())) {
    return { success: false, error: 'That day is outside service days. Offer a different date.' };
  }
  if (toDateStr(d) < toDateStr(new Date())) {
    return { success: false, error: 'Cannot book a date in the past' };
  }
  const capacity = await dailyCapacity(tenant_id);
  const used = await Appointment.count({
    where: { tenant_id, service_date: toDateStr(d), status: { [Op.notIn]: ['cancelled', 'skipped'] } }
  });
  if (used >= capacity) return { success: false, error: 'That date is fully booked. Offer another date.' };

  const appt = await Appointment.create({
    tenant_id, customer_id, property_id, subscription_id,
    service_date: toDateStr(d),
    window_start: window_start || '08:00',
    window_end: window_end || '12:00',
    service_type: service_type || 'mowing',
    price_cents: price_cents || null,
    addons: addons || [],
    notes: notes || null,
    status: 'scheduled',
    route_order: used + 1
  });
  return { success: true, appointment: appt.toJSON() };
}

async function rescheduleAppointment({ tenant_id, appointment_id, service_date, window_start, window_end }) {
  const appt = await Appointment.findOne({ where: { id: appointment_id, tenant_id } });
  if (!appt) return { success: false, error: 'Appointment not found' };
  if (['completed', 'cancelled'].includes(appt.status)) {
    return { success: false, error: `Cannot reschedule a ${appt.status} visit` };
  }
  const allowed = await businessDays(tenant_id);
  const d = new Date(service_date + 'T12:00:00');
  if (isNaN(d.getTime()) || !allowed.includes(d.getDay())) {
    return { success: false, error: 'That day is not available. Offer a different date.' };
  }
  const old = appt.service_date;
  appt.service_date = toDateStr(d);
  if (window_start) appt.window_start = window_start;
  if (window_end) appt.window_end = window_end;
  appt.status = 'scheduled';
  appt.updated_at = new Date();
  await appt.save();
  return { success: true, appointment: appt.toJSON(), previous_date: old };
}

async function cancelAppointment({ tenant_id, appointment_id, reason }) {
  const appt = await Appointment.findOne({ where: { id: appointment_id, tenant_id } });
  if (!appt) return { success: false, error: 'Appointment not found' };
  if (appt.status === 'completed') return { success: false, error: 'That visit is already completed' };
  appt.status = 'cancelled';
  appt.notes = [appt.notes, reason ? `Cancelled: ${reason}` : null].filter(Boolean).join(' | ');
  appt.updated_at = new Date();
  await appt.save();
  return { success: true, appointment: appt.toJSON() };
}

async function skipVisit({ tenant_id, appointment_id }) {
  const appt = await Appointment.findOne({ where: { id: appointment_id, tenant_id } });
  if (!appt) return { success: false, error: 'Appointment not found' };
  if (appt.status === 'completed') return { success: false, error: 'That visit is already completed' };
  appt.status = 'skipped';
  appt.updated_at = new Date();
  await appt.save();
  // The next recurring visit still stands.
  return { success: true, appointment: appt.toJSON() };
}

async function pauseService({ tenant_id, customer_id, until }) {
  const subs = await Subscription.findAll({ where: { tenant_id, customer_id, status: 'active' } });
  if (!subs.length) return { success: false, error: 'No active service to pause' };
  for (const s of subs) {
    s.status = 'paused';
    s.pause_until = until || null;
    await s.save();
  }
  const upcoming = await Appointment.findAll({
    where: {
      tenant_id, customer_id,
      status: 'scheduled',
      service_date: { [Op.gte]: toDateStr(new Date()), ...(until ? { [Op.lte]: until } : {}) }
    }
  });
  for (const a of upcoming) { a.status = 'skipped'; await a.save(); }
  return { success: true, paused: subs.length, visits_skipped: upcoming.length, until: until || null };
}

async function resumeService({ tenant_id, customer_id }) {
  const subs = await Subscription.findAll({ where: { tenant_id, customer_id, status: 'paused' } });
  if (!subs.length) return { success: false, error: 'No paused service to resume' };
  for (const s of subs) { s.status = 'active'; s.pause_until = null; await s.save(); }
  return { success: true, resumed: subs.length };
}

async function assignCrew({ tenant_id, appointment_id, crew_id }) {
  const appt = await Appointment.findOne({ where: { id: appointment_id, tenant_id } });
  if (!appt) return { success: false, error: 'Appointment not found' };
  const crew = await Crew.findOne({ where: { id: crew_id, tenant_id } });
  if (!crew) return { success: false, error: 'Crew not found' };
  appt.crew_id = crew_id;
  appt.updated_at = new Date();
  await appt.save();
  return { success: true, appointment: appt.toJSON(), crew: crew.name };
}

/**
 * Phase 1 route sequencing: order the day's stops by longitude then latitude
 * (a west-to-east sweep). The optimizer seam is here — swapping in a real
 * solver changes only this function.
 */
async function sequenceRoute({ tenant_id, service_date, crew_id }) {
  const where = { tenant_id, service_date, status: { [Op.notIn]: ['cancelled', 'skipped'] } };
  if (crew_id) where.crew_id = crew_id;
  const appts = await Appointment.findAll({ where, raw: true });
  if (!appts.length) return { success: true, stops: 0, sequence: [] };

  const { Property } = require('../models');
  const props = await Property.findAll({
    where: { tenant_id, id: appts.map(a => a.property_id).filter(Boolean) }, raw: true
  });
  const byId = {};
  props.forEach(p => { byId[p.id] = p; });

  const ordered = appts
    .map(a => ({ a, p: byId[a.property_id] || {} }))
    .sort((x, y) => (x.p.lng || 0) - (y.p.lng || 0) || (y.p.lat || 0) - (x.p.lat || 0));

  for (let i = 0; i < ordered.length; i++) {
    await Appointment.update({ route_order: i + 1 }, { where: { id: ordered[i].a.id, tenant_id } });
  }
  return {
    success: true,
    stops: ordered.length,
    method: 'west-to-east sweep (Phase 1)',
    sequence: ordered.map((o, i) => ({ order: i + 1, appointment_id: o.a.id, address: o.p.address || null }))
  };
}

async function weatherHold({ tenant_id, service_date, reason }) {
  const appts = await Appointment.findAll({ where: { tenant_id, service_date, status: 'scheduled' } });
  for (const a of appts) {
    a.status = 'weather_hold';
    a.notes = [a.notes, `Weather hold: ${reason || 'inclement weather'}`].filter(Boolean).join(' | ');
    await a.save();
  }
  return { success: true, held: appts.length, service_date };
}

/**
 * Generate the recurring visits that follow the first one.
 */
async function generateRecurring({ tenant_id, subscription_id, count = 4 }) {
  const sub = await Subscription.findOne({ where: { id: subscription_id, tenant_id } });
  if (!sub) return { success: false, error: 'Subscription not found' };
  if (sub.frequency === 'one_time') return { success: true, created: 0 };

  let cursor = sub.next_service_date || toDateStr(addDays(new Date(), 7));
  const allowed = await businessDays(tenant_id);
  const created = [];
  for (let i = 0; i < count; i++) {
    let d = new Date(cursor + 'T12:00:00');
    let guard = 0;
    while (!allowed.includes(d.getDay()) && guard++ < 7) d = addDays(d, 1);
    const res = await bookAppointment({
      tenant_id,
      customer_id: sub.customer_id,
      property_id: sub.property_id,
      subscription_id: sub.id,
      service_date: toDateStr(d),
      price_cents: sub.price_cents,
      addons: sub.addons
    });
    if (res.success) created.push(res.appointment);
    cursor = nextServiceDate(sub.frequency, toDateStr(d));
    if (!cursor) break;
  }
  sub.next_service_date = cursor;
  await sub.save();
  return { success: true, created: created.length, appointments: created };
}

module.exports = {
  checkAvailability, bookAppointment, rescheduleAppointment, cancelAppointment,
  skipVisit, pauseService, resumeService, assignCrew, sequenceRoute, weatherHold,
  generateRecurring, nextServiceDate, toDateStr, WINDOWS
};
