/**
 * Vision2Ai — booking calendar API.
 *
 * Self-contained appointment calendar for the Vision2Ai landing page
 * (public/vision2ai/index.html). The "Request an Introduction" form and the
 * (future) RinglyPro Lite voice agent both book into the SAME calendar via
 * these endpoints, so a slot taken by phone is unavailable on the web and
 * vice-versa.
 *
 * Business hours: weekdays 09:00–18:00 America/New_York (Tampa/Miami HQ),
 * 30-minute slots. Single logical tenant ('vision2ai').
 *
 * Mounted at /vision2ai/api (see src/app.js).
 *
 *   GET  /vision2ai/api/v1/config        -> { voice_number, voice_display } (voice line, if provisioned)
 *   GET  /vision2ai/api/v1/availability  -> open slots grouped by day
 *   POST /vision2ai/api/v1/book          -> book a slot
 *   GET  /vision2ai/api/health           -> health
 *
 * Voice reuse: check_availability / book_appointment for a Lite/relay agent
 * map 1:1 onto GET /availability and POST /book (same tenant, same table).
 */
const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');

const TENANT = 'vision2ai';
const TZ = 'America/New_York';
const HOURS = { start: 9, end: 18, slotMin: 30 }; // last start 17:30
const DEFAULT_WINDOW_DAYS = 21;
const ADMIN_KEY = process.env.VISION2AI_ADMIN_KEY || 'vision2ai-admin-2026';

// Fire-and-forget owner notification + optional Lite/n8n webhook mirror.
// Answers "how do I know someone requested?": emails the owner on every booking.
function notifyOwner(appt, body) {
  if (process.env.VISION2AI_NOTIFY_DISABLED === '1') return;
  const to = process.env.VISION2AI_NOTIFY_EMAIL || 'Lalag16@gmail.com';
  const from = process.env.SENDGRID_FROM_EMAIL;
  const key = process.env.SENDGRID_API_KEY;
  const line = `${body.name} · ${body.email} · ${appt.display_date} ${appt.display_time} ET`;
  if (key && from) {
    try {
      const sg = require('@sendgrid/mail'); sg.setApiKey(key);
      const text = `New Vision2Ai introduction request\n\n`
        + `Name:    ${body.name}\nEmail:   ${body.email}\nCompany: ${body.company || '-'}\n`
        + `Phone:   ${body.phone || '-'}\nWhen:    ${appt.display_date} at ${appt.display_time} (US Eastern)\n`
        + `Lang:    ${body.lang}\nNotes:   ${body.notes || '-'}\n\n`
        + `See all requests: https://aiagent.ringlypro.com/vision2ai/admin?key=${encodeURIComponent(ADMIN_KEY)}\n`;
      sg.send({ to, from, subject: `Vision2Ai request — ${line}`, text })
        .then(() => console.log('[vision2ai] notify email sent to', to))
        .catch(e => console.warn('[vision2ai] notify email failed:', e.message));
    } catch (e) { console.warn('[vision2ai] notify email error:', e.message); }
  } else {
    console.log('[vision2ai] booking (email not configured):', line);
  }
  // Mirror to RinglyPro Lite / n8n when a webhook is configured (flip-on integration
  // seam; unset today because Lite runs on its own isolated DB and is not yet deployed).
  const hook = process.env.VISION2AI_LITE_WEBHOOK_URL;
  if (hook && typeof fetch === 'function') {
    fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'vision2ai-landing', appointment: appt, contact: body }) })
      .catch(e => console.warn('[vision2ai] lite webhook failed:', e.message));
  }
}

// ---------- table bootstrap (idempotent) ----------
let ready = null;
function ensureTable() {
  if (ready) return ready;
  ready = sequelize.query(`
    CREATE TABLE IF NOT EXISTS vision2ai_appointments (
      id SERIAL PRIMARY KEY,
      tenant_id   VARCHAR(40) NOT NULL DEFAULT 'vision2ai',
      name        VARCHAR(160) NOT NULL,
      email       VARCHAR(200) NOT NULL,
      company     VARCHAR(200),
      phone       VARCHAR(40),
      appt_date   DATE NOT NULL,
      appt_time   VARCHAR(5) NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 30,
      notes       TEXT,
      lang        VARCHAR(4) DEFAULT 'en',
      status      VARCHAR(20) NOT NULL DEFAULT 'booked',
      source      VARCHAR(30) NOT NULL DEFAULT 'web',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_vision2ai_slot
      ON vision2ai_appointments(tenant_id, appt_date, appt_time)
      WHERE status <> 'cancelled';
  `).catch((e) => { ready = null; throw e; });
  return ready;
}

// ---------- time helpers (America/New_York, no external deps) ----------
function nowParts() {
  // {ymd:'YYYY-MM-DD', hm:'HH:mm'} for "now" in ET
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const p = {};
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value;
  return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}
function allSlotTimes() {
  const out = [];
  for (let h = HOURS.start; h < HOURS.end; h++) {
    for (let m = 0; m < 60; m += HOURS.slotMin) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out; // 09:00 .. 17:30
}
function addDaysYMD(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function weekdayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun .. 6 Sat
}
function displayDate(ymd, lang) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US',
    { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
function displayTime(hm, lang) {
  const [h, m] = hm.split(':').map(Number);
  const dt = new Date(Date.UTC(2000, 0, 1, h, m));
  return dt.toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-US',
    { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- config (voice line) ----------
router.get('/v1/config', (req, res) => {
  const num = (process.env.VISION2AI_VOICE_NUMBER || '').trim();
  res.json({
    voice_number: num || null,                    // E.164 for tel: link
    voice_display: (process.env.VISION2AI_VOICE_DISPLAY || num) || null
  });
});

// ---------- availability ----------
router.get('/v1/availability', async (req, res) => {
  try {
    await ensureTable();
    const lang = req.query.lang === 'es' ? 'es' : 'en';
    const windowDays = Math.min(60, Math.max(1, parseInt(req.query.days, 10) || DEFAULT_WINDOW_DAYS));
    const now = nowParts();

    const [rows] = await sequelize.query(
      `SELECT appt_date, appt_time FROM vision2ai_appointments
       WHERE tenant_id = :t AND status <> 'cancelled' AND appt_date >= :from`,
      { replacements: { t: TENANT, from: now.ymd } }
    );
    const taken = new Set(rows.map(r => {
      const d = (r.appt_date instanceof Date) ? r.appt_date.toISOString().slice(0, 10) : String(r.appt_date).slice(0, 10);
      return `${d} ${String(r.appt_time).slice(0, 5)}`;
    }));

    const times = allSlotTimes();
    const days = [];
    for (let i = 0; i < windowDays; i++) {
      const ymd = addDaysYMD(now.ymd, i);
      const wd = weekdayOf(ymd);
      if (wd === 0 || wd === 6) continue; // weekdays only
      const slots = times.filter(hm => {
        if (taken.has(`${ymd} ${hm}`)) return false;
        if (ymd === now.ymd && hm <= now.hm) return false; // no past-today slots
        return true;
      }).map(hm => ({ time: hm, display: displayTime(hm, lang) }));
      if (slots.length) days.push({ date: ymd, display: displayDate(ymd, lang), slots });
    }
    res.json({ success: true, timezone: TZ, days });
  } catch (e) {
    console.error('[vision2ai] availability error:', e.message);
    res.status(500).json({ success: false, error: 'availability_failed' });
  }
});

// ---------- book ----------
router.post('/v1/book', async (req, res) => {
  try {
    await ensureTable();
    const b = req.body || {};
    const name = (b.name || '').toString().trim().slice(0, 160);
    const email = (b.email || '').toString().trim().slice(0, 200);
    const company = (b.company || '').toString().trim().slice(0, 200) || null;
    const phone = (b.phone || '').toString().trim().slice(0, 40) || null;
    const date = (b.date || '').toString().trim();
    const time = (b.time || '').toString().trim().slice(0, 5);
    const notes = (b.notes || '').toString().trim().slice(0, 2000) || null;
    const lang = b.lang === 'es' ? 'es' : 'en';
    const source = (b.source === 'voice') ? 'voice' : 'web';

    if (!name) return res.status(400).json({ success: false, error: 'name_required' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'email_invalid' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
      return res.status(400).json({ success: false, error: 'datetime_invalid' });

    const now = nowParts();
    const wd = weekdayOf(date);
    if (wd === 0 || wd === 6) return res.status(400).json({ success: false, error: 'weekend_not_available' });
    if (date < now.ymd || (date === now.ymd && time <= now.hm))
      return res.status(400).json({ success: false, error: 'slot_in_past' });
    if (!allSlotTimes().includes(time))
      return res.status(400).json({ success: false, error: 'slot_out_of_hours' });

    try {
      const [ins] = await sequelize.query(
        `INSERT INTO vision2ai_appointments
           (tenant_id, name, email, company, phone, appt_date, appt_time, notes, lang, source)
         VALUES (:t, :name, :email, :company, :phone, :date, :time, :notes, :lang, :source)
         RETURNING id`,
        { replacements: { t: TENANT, name, email, company, phone, date, time, notes, lang, source } }
      );
      const appointment = {
        id: ins[0].id,
        date, time,
        display_date: displayDate(date, lang),
        display_time: displayTime(time, lang)
      };
      notifyOwner(appointment, { name, email, company, phone, notes, lang });
      return res.status(201).json({ success: true, appointment });
    } catch (err) {
      const code = (err && (err.original || err.parent || {}).code) || err.code;
      const txt = `${err.message || ''} ${(err.original || err.parent || {}).message || ''}`;
      if (code === '23505' || /unique|duplicate/i.test(txt)) {
        return res.status(409).json({ success: false, error: 'slot_taken' });
      }
      throw err;
    }
  } catch (e) {
    console.error('[vision2ai] book error:', e.message);
    res.status(500).json({ success: false, error: 'book_failed' });
  }
});

// ---------- admin: list requests (key-gated) ----------
router.get('/v1/appointments', async (req, res) => {
  if ((req.query.key || '') !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'unauthorized' });
  }
  try {
    await ensureTable();
    const all = req.query.scope === 'all';
    const [rows] = await sequelize.query(
      `SELECT id, name, email, company, phone, appt_date, appt_time, notes, lang, status, source, created_at
       FROM vision2ai_appointments
       WHERE tenant_id = :t AND status <> 'cancelled'
       ${all ? '' : "AND appt_date >= (NOW() AT TIME ZONE 'America/New_York')::date"}
       ORDER BY appt_date ASC, appt_time ASC`,
      { replacements: { t: TENANT } }
    );
    res.json({ success: true, count: rows.length, appointments: rows });
  } catch (e) {
    console.error('[vision2ai] list error:', e.message);
    res.status(500).json({ success: false, error: 'list_failed' });
  }
});

router.get('/health', async (req, res) => {
  try { await ensureTable(); res.json({ ok: true, service: 'vision2ai', tz: TZ }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
