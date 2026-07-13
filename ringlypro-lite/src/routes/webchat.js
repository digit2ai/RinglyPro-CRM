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
async function flushDemoSms(entry) {
  const evs = entry.session.events;
  while ((entry.sent || 0) < evs.length) {
    const ev = evs[entry.sent || 0];
    entry.sent = (entry.sent || 0) + 1;
    try { await smsSvc.sendDemoConfirm(entry.session.ctx, ev); } catch (_) {}
  }
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
