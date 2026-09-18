'use strict';

/**
 * Web chat — the SAME Lina brain (relayAgent) over HTTP text, for the landing
 * page live demo. Visitors can take a message or book an appointment by typing,
 * exactly like the phone flow. Uses the synthetic demo tenant (id 0) so tools
 * work with no per-tenant cost. Sessions are kept in memory with a TTL.
 */
const express = require('express');
const router = express.Router();
const { RelaySession } = require('../services/relayAgent');
const bookingSvc = require('../services/booking');
const smsSvc = require('../services/sms');
const { Tenant } = require('../models');

// Text the caller a demo confirmation for any new booking/message events.
// A chat visitor can type ANY phone number as the callback, so a chat session
// may cause at most this many demo texts. Past it the demo still works, it just
// stops texting (SMS pumping through a public chat box is the cheapest attack).
const MAX_DEMO_SMS_PER_SESSION = Math.max(0, parseInt(process.env.LITE_WEBCHAT_MAX_SMS || '1', 10) || 0);
async function flushDemoSms(entry) {
  const evs = entry.session.events;
  while ((entry.sent || 0) < evs.length) {
    const ev = evs[entry.sent || 0];
    entry.sent = (entry.sent || 0) + 1;
    if ((entry.smsSent || 0) >= MAX_DEMO_SMS_PER_SESSION) continue;
    try { const r = await smsSvc.sendDemoConfirm(entry.session.ctx, ev); if (r && r.sent) entry.smsSent = (entry.smsSent || 0) + 1; } catch (_) {}
  }
}

// Per-IP ceiling on the public chat: every turn is a model call we pay for, and
// every new session is a fresh demo-text allowance. In memory, per instance.
const PER_IP_PER_10MIN = Math.max(1, parseInt(process.env.LITE_WEBCHAT_PER_IP || '40', 10) || 40);
const ipHits = new Map();
function ipAllowed(req) {
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const arr = (ipHits.get(ip) || []).filter((t) => t > now - 10 * 60 * 1000);
  if (arr.length >= PER_IP_PER_10MIN) { ipHits.set(ip, arr); return false; }
  arr.push(now); ipHits.set(ip, arr);
  if (ipHits.size > 5000) ipHits.clear();
  return true;
}

const sessions = new Map(); // id -> { session, expires, turns }
const TTL_MS = 20 * 60 * 1000;
const MAX_TURNS = parseInt(process.env.LITE_WEBCHAT_MAX_TURNS || '18', 10);

function gc() { const now = Date.now(); for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k); }
setInterval(gc, 5 * 60 * 1000);
function newId() { return 'web-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function demoNumber(locale) {
  return locale === 'es'
    ? (process.env.LITE_DEMO_NUMBER || '+18132120813')
    : (process.env.LITE_DEMO_NUMBER_EN || '+17627611589');
}

// CORS so the marketing site (aiagent.ringlypro.com) can call this.
router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

router.post('/', async (req, res) => {
  if (!ipAllowed(req)) return res.status(429).json({ error: 'rate_limited', message: 'Too many messages. Please wait a few minutes.' });
  try {
    const { session_id, text, lang } = req.body || {};
    let entry = session_id ? sessions.get(session_id) : null;

    // New chat session (demo tenant, language from the landing).
    if (!entry) {
      const locale = lang === 'en' ? 'en' : 'es';
      // Route web-chat demo activity to the real demo tenant so it shows in the
      // demo account's dashboard (falls back to synthetic tenant 0).
      const demoTenantId = parseInt(process.env.LITE_DEMO_TENANT_ID || '7', 10);
      const dt = demoTenantId ? await Tenant.findByPk(demoTenantId) : null;
      const ctx = {
        tenantId: dt ? dt.id : 0, is_demo: true,
        businessName: dt ? dt.business_name : (process.env.LITE_DEMO_BUSINESS || 'RinglyPro Lite'),
        locale, country: 'US', timezone: dt ? (dt.timezone || 'America/New_York') : 'America/New_York',
        from: null, to: demoNumber(locale), callSid: newId(), callerName: null, callId: null
      };
      const session = new RelaySession(ctx, { booking: bookingSvc });
      const greeting = session.openingGreeting();  // seeds history + is returned
      const id = newId();
      entry = { session, expires: Date.now() + TTL_MS, turns: 0 };
      sessions.set(id, entry);
      if (!text) return res.json({ session_id: id, reply: greeting });
      entry.turns++;
      const reply = await session.handlePrompt(text);
      await flushDemoSms(entry);
      return res.json({ session_id: id, reply, disposition: session.disposition });
    }

    // Existing session.
    entry.expires = Date.now() + TTL_MS;
    if (!text) return res.json({ session_id, reply: '' });
    if (entry.turns >= MAX_TURNS) {
      const es = entry.session.ctx.locale === 'es';
      return res.json({ session_id, done: true, reply: es
        ? 'Gracias por probar la demo. Para poner a Lina a contestar sus llamadas reales, inicie su prueba gratis.'
        : 'Thanks for trying the demo. To put Lina on your real calls, start your free trial.' });
    }
    entry.turns++;
    const reply = await entry.session.handlePrompt(text);
    await flushDemoSms(entry);
    res.json({ session_id, reply, disposition: entry.session.disposition });
  } catch (e) {
    console.error('[lite:webchat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
