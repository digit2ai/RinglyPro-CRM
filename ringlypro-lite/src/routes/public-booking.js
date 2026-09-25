'use strict';

/**
 * PUBLIC, tenant-scoped booking endpoint for external landing pages
 * (e.g. the Vision2Ai page at aiagent.ringlypro.com/vision2ai).
 *
 * A visitor picks a time on the landing page and it is written straight into a
 * specific tenant's Lite calendar (lite_appointments), so it appears in that
 * owner's dashboard and fires the owner's booking SMS.
 *
 * SECURITY: no login / no password. Access is via a PUBLIC BOOKING KEY that
 * maps only to ONE tenant and only allows two actions — read open slots and
 * create a booking — which is exactly what a public "book a time" page should
 * do. The key never unlocks the dashboard or any tenant data.
 *
 * Key → tenant map comes from env LITE_PUBLIC_BOOKING_KEYS ("key:tenantId,..."),
 * with a built-in default for the comped Vision2Ai account (tenant 9) so it
 * works out of the box. Rotate/extend by setting that env on the Lite service.
 *
 * Mounted at /api/public-booking BEFORE the auth-gated /api catch-all.
 */
const express = require('express');
const router = express.Router();
const booking = require('../services/booking');
const smsSvc = require('../services/sms');
const { Tenant, Number: LiteNumber, AvailabilityRule } = require('../models');

// ---- public key -> tenant map ----
function parseKeyMap(raw) {
  const map = {};
  String(raw || '').split(',').forEach((pair) => {
    const [k, t] = pair.split(':').map((s) => (s || '').trim());
    if (k && t && /^\d+$/.test(t)) map[k] = parseInt(t, 10);
  });
  return map;
}
// Default pins the Vision2Ai comped account (tenant 9). Overridable via env.
const KEY_MAP = Object.assign(
  { 'vision2ai-pub-9': 9 },
  parseKeyMap(process.env.LITE_PUBLIC_BOOKING_KEYS)
);
function tenantForKey(key) {
  const k = String(key || '').trim();
  return Object.prototype.hasOwnProperty.call(KEY_MAP, k) ? KEY_MAP[k] : null;
}

// Default booking hours for a public tenant that has none yet: Mon–Fri 09:00–17:00, 30-min.
async function ensureDefaultRules(tenantId) {
  const existing = await AvailabilityRule.count({ where: { tenant_id: tenantId } });
  if (existing > 0) return;
  const tenant = await Tenant.findByPk(tenantId);
  const tz = (tenant && tenant.timezone) || 'America/New_York';
  for (const wd of [1, 2, 3, 4, 5]) {
    await AvailabilityRule.create({
      tenant_id: tenantId, weekday: wd, start: '09:00', end: '17:00',
      slot_minutes: 30, timezone: tz, active: true
    });
  }
  console.log(`[lite:public-booking] seeded default Mon–Fri 09:00–17:00 rules for tenant ${tenantId}`);
}

function labels(tz, iso, lang) {
  const at = new Date(iso);
  const loc = lang === 'es' ? 'es-CO' : 'en-US';
  return {
    day: new Intl.DateTimeFormat(loc, { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(at),
    time: new Intl.DateTimeFormat(loc, { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(at)
  };
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A CEILING ON /book, PER IP AND PER KEY.
 *
 * This endpoint is public, CORS is open, there is no session, and the booking
 * key is a value in this repository. The only thing that used to cap abuse was
 * the partial unique index: book a slot once and every later attempt on it was
 * a cheap 409. The two-way calendar removed that by design — a push that fails
 * DELETES the row, freeing the slot — so one slot can now be hammered forever,
 * and each attempt spends real HighLevel requests against a quota that, in the
 * shared sub-account, belongs to every tenant at once. In memory, per instance;
 * stated rather than implied.
 */
const BOOK_HITS = new Map();
function bookOverLimit(bucket, perMin) {
  const win = Math.floor(Date.now() / 60000);
  for (const k of BOOK_HITS.keys()) if (!k.endsWith(`:${win}`)) BOOK_HITS.delete(k);
  const key = `${bucket}:${win}`;
  const n = (BOOK_HITS.get(key) || 0) + 1;
  BOOK_HITS.set(key, n);
  return n > perMin;
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown';
}

// CORS so the marketing site (aiagent.ringlypro.com / vision2ai.app) can call this.
router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- open slots ----------
// GET /api/public-booking/availability?key=<key>&days=<N>&lang=en|es
router.get('/availability', async (req, res) => {
  const tenantId = tenantForKey(req.query.key);
  if (tenantId == null) return res.status(401).json({ success: false, error: 'invalid_key' });
  try {
    await ensureDefaultRules(tenantId);
    const lang = req.query.lang === 'es' ? 'es' : 'en';
    const days = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 14));
    const out = await booking.checkAvailability({ tenantId, days_ahead: days, limit: 500 });
    if (!out.success) return res.status(400).json(out);
    const tz = out.timezone || 'America/New_York';

    // Group the flat slot list by local date for the picker.
    const byDay = new Map(); // date -> { iso, slots:[] }
    for (const s of (out.slots || [])) {
      if (!byDay.has(s.date)) byDay.set(s.date, { iso: s.starts_at, slots: [] });
      byDay.get(s.date).slots.push({ time: s.time, display: labels(tz, s.starts_at, lang).time });
    }
    const daysArr = Array.from(byDay.entries()).map(([date, g]) => ({
      date, display: labels(tz, g.iso, lang).day, slots: g.slots
    }));
    res.json({ success: true, timezone: tz, days: daysArr });
  } catch (e) {
    console.error('[lite:public-booking] availability error:', e.message);
    res.status(500).json({ success: false, error: 'availability_failed' });
  }
});

// ---------- book ----------
// POST /api/public-booking/book  { key, name, phone, email?, company?, notes?, date, time, lang? }
router.post('/book', async (req, res) => {
  const b = req.body || {};
  const perIp = Math.max(1, parseInt(process.env.LITE_PUBLIC_BOOK_PER_MIN || '6', 10) || 6);
  const perKey = Math.max(1, parseInt(process.env.LITE_PUBLIC_BOOK_PER_MIN_KEY || '30', 10) || 30);
  if (bookOverLimit(`ip:${clientIp(req)}`, perIp)) return res.status(429).json({ success: false, error: 'slow_down' });

  const tenantId = tenantForKey(b.key);
  if (tenantId == null) return res.status(401).json({ success: false, error: 'invalid_key' });
  // Per key as well as per IP: the published key plus a spread of addresses
  // would otherwise walk straight past the per-IP ceiling.
  if (bookOverLimit(`key:${tenantId}`, perKey)) return res.status(429).json({ success: false, error: 'slow_down' });

  const name = (b.name || '').toString().trim().slice(0, 160);
  const phone = (b.phone || '').toString().trim().slice(0, 40);
  const email = (b.email || '').toString().trim().slice(0, 200);
  const company = (b.company || '').toString().trim().slice(0, 200);
  const notes = (b.notes || '').toString().trim().slice(0, 2000);
  const date = (b.date || '').toString().trim();
  const time = (b.time || '').toString().trim().slice(0, 5);
  const lang = b.lang === 'es' ? 'es' : 'en';

  if (!name) return res.status(400).json({ success: false, error: 'name_required' });
  if (!phone && !EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'contact_required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return res.status(400).json({ success: false, error: 'datetime_invalid' });

  try {
    const result = await booking.bookAppointment({
      tenantId, caller_name: name, callback_number: phone || null, date, time,
      // Passed through for the HighLevel contact, not stored on the row: the
      // calendar table has no email column and the address already travels to
      // the owner in the dashboard message below.
      email: EMAIL_RE.test(email) ? email : null
    });
    if (!result.success) {
      // sync_failed = we could not write it into the owner's HighLevel
      // calendar, so nothing was kept here either. Saying "booked" would put
      // the visitor in a slot the AI will hand to the next caller, which is
      // the exact failure the two-way sync exists to prevent.
      if (result.error === 'sync_failed' || result.error === 'sync_unconfirmed') {
        // sync_failed   = the other calendar refused; nothing was kept here either.
        // sync_unconfirmed = we may have created it there and cannot prove it, so
        // the slot is HELD here and flagged for the owner rather than handed to
        // the next visitor. Both tell the visitor the same true thing: it is not
        // confirmed. Saying "booked" would put them in a slot the AI may hand to
        // the next caller, which is the failure the two-way sync exists to remove.
        return res.status(503).json({ success: false, error: result.error,
          message: lang === 'es'
            ? 'No pudimos confirmar ese horario. Por favor elige otro o llámanos.'
            : 'We could not confirm that time. Please pick another one, or call us.' });
      }
      const code = result.error === 'slot_taken' ? 409 : 400;
      return res.status(code).json({ success: false, error: result.error });
    }

    const tenant = await Tenant.findByPk(tenantId);
    const tz = (tenant && tenant.timezone) || 'America/New_York';
    const l = labels(tz, result.starts_at, lang);

    // Preserve the extra contact context (email/company/notes) that the calendar
    // row doesn't carry, as a dashboard message, so the owner has full details.
    if (email || company || notes) {
      const parts = [];
      if (email) parts.push(`Email: ${email}`);
      if (company) parts.push(`Company: ${company}`);
      if (notes) parts.push(`Notes: ${notes}`);
      const body = `Intro request via Vision2Ai landing — ${l.day} ${l.time}. ` + parts.join(' · ');
      try { await booking.takeMessage({ tenantId, caller_name: name, callback_number: phone || null, body }); }
      catch (e) { console.warn('[lite:public-booking] takeMessage failed:', e.message); }
    }

    // Best-effort owner SMS for web bookings (mirrors the phone-booking alert).
    if (tenant && tenant.owner_phone) {
      try {
        const num = await LiteNumber.findOne({ where: { tenant_id: tenantId, status: 'active' } });
        const from = (num && num.did) || process.env.LITE_DEFAULT_SMS_FROM || null;
        if (from) {
          const sms = `New booking (${tenant.business_name || 'Vision2Ai'}): ${name}`
            + (phone ? ` (${phone})` : '') + ` — ${l.day} ${l.time}.`;
          await smsSvc.send({ from, to: tenant.owner_phone, body: sms });
        }
      } catch (e) { console.warn('[lite:public-booking] owner SMS failed:', e.message); }
    }

    res.status(201).json({
      success: true,
      appointment: {
        id: result.appointment_id,
        starts_at: result.starts_at,
        display: result.display,
        display_date: l.day,
        display_time: l.time
      }
    });
  } catch (e) {
    console.error('[lite:public-booking] book error:', e.message);
    res.status(500).json({ success: false, error: 'book_failed' });
  }
});

router.get('/health', (req, res) => res.json({ ok: true, service: 'lite-public-booking', tenants: Object.keys(KEY_MAP).length }));

module.exports = router;
