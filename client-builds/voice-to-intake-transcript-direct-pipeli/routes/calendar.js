// =====================================================
// Champion calendar — availability + booking on the owner's (client 15) calendar,
// GATED to valid champion codes, and pings the owner when a booking lands.
//   GET  /api/v1/calendar/availability?c=<code>&days=14
//   POST /api/v1/calendar/book   { c, customer_name, customer_phone, customer_email?, appointment_date, appointment_time, note? }
// Booking + availability reuse the main app's /api/elevenlabs/tools (client 15 carve-out).
// =====================================================

const express = require('express');
const router = express.Router();
const { verifyAny } = require('../middleware/auth');
const registry = require('../services/championRegistry');

const CLIENT_ID = 15; // owner (Manuel) Digit2Ai calendar

function toolsUrl() {
  return `http://127.0.0.1:${process.env.PORT || 3000}/api/elevenlabs/tools`;
}
function callTool(body) {
  return fetch(toolsUrl(), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then((r) => r.json());
}

// Resolve a champion from a signed ?c= code. Returns { name, email } or null.
async function validChampion(code) {
  if (!code) return null;
  let decoded;
  try { decoded = verifyAny(code); } catch (e) { return null; }
  if (!decoded || !decoded.email) return null;
  if (decoded.jti) {
    try { if (!(await registry.isValid(decoded.email, decoded.jti))) return null; }
    catch (e) { /* DB blip: fail-open like requireAuth does */ }
  }
  return { name: decoded.name || decoded.email, email: decoded.email };
}

router.get('/availability', async (req, res) => {
  const champ = await validChampion(req.query.c);
  if (!champ) return res.status(401).json({ error: 'invalid_champion' });
  const days = Math.min(parseInt(req.query.days, 10) || 14, 30);
  try {
    const out = await callTool({ tool_name: 'check_availability', client_id: CLIENT_ID, days_ahead: days });
    res.json(out);
  } catch (e) {
    res.status(502).json({ error: 'availability_failed', detail: e.message });
  }
});

router.post('/book', async (req, res) => {
  const b = req.body || {};
  const champ = await validChampion(b.c);
  if (!champ) return res.status(401).json({ error: 'invalid_champion' });
  if (!b.customer_name || !b.customer_phone || !b.appointment_date || !b.appointment_time) {
    return res.status(422).json({ error: 'missing_fields' });
  }
  const purpose = `Booked by champion ${champ.name} (${champ.email})` + (b.note ? ` — ${b.note}` : '');
  try {
    const booked = await callTool({
      tool_name: 'book_appointment', client_id: CLIENT_ID,
      customer_name: b.customer_name, customer_phone: b.customer_phone,
      customer_email: b.customer_email || undefined,
      appointment_date: b.appointment_date, appointment_time: b.appointment_time, purpose
    });
    if (booked && booked.success) {
      const note = `New appointment booked by champion ${champ.name}: ${b.customer_name} (${b.customer_phone}) on ${booked.appointment_date} at ${booked.appointment_time}.`;
      // Reliable ping: drops into the owner's dashboard inbox (unread badge).
      callTool({ tool_name: 'take_message', client_id: CLIENT_ID, customer_name: b.customer_name, customer_phone: b.customer_phone, reason: note }).catch(() => {});
      // Best-effort SMS ping (opt-in via env so it never errors by default).
      notifyOwnerSms(note).catch(() => {});
    }
    res.json(booked);
  } catch (e) {
    res.status(502).json({ error: 'book_failed', detail: e.message });
  }
});

async function notifyOwnerSms(text) {
  const to = process.env.CHAMPION_BOOKING_NOTIFY_SMS;
  if (!to) return; // unset = no SMS (inbox message is the default ping)
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const opts = { to, body: text };
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) opts.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    else opts.from = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
    if (!opts.messagingServiceSid && !opts.from) return;
    await client.messages.create(opts);
  } catch (e) {
    console.error('[calendar] owner SMS notify failed:', e.message);
  }
}

module.exports = router;
