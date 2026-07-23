'use strict';

/**
 * Lawn Co-Pilot — the orb (voice + typed, one conversation)
 *
 * THE IDENTITY GATE LIVES HERE. Name, phone, and email are captured before any
 * request is processed on any entry point. There is no side door: every other
 * route in this file checks the gate, and the Brain independently refuses
 * identity-gated tools for an unverified session.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const brain = require('../mcp/brain');
const { turn } = require('../services/conversation');
const { AgentSession, Lead, Quote, Property } = require('../models');
const { notify } = require('../services/notify');

const TENANT = () => Number(process.env.LAWNCOPILOT_TENANT_ID || 1);

// ── Rate limiting (per IP, shared bucket) ──────────────────────────────────
const buckets = new Map();
function rateLimit(req, res, next) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const b = buckets.get(ip) || { count: 0, reset: now + 60000 };
  if (now > b.reset) { b.count = 0; b.reset = now + 60000; }
  b.count++;
  buckets.set(ip, b);
  if (b.count > 40) {
    return res.status(429).json({ success: false, error: 'Too many requests. Slow down a moment.' });
  }
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset + 300000) buckets.delete(k);
}, 300000).unref();

router.use(rateLimit);

// ── Config for the browser. No secrets leave the server. ───────────────────
router.get('/config', (req, res) => {
  const enabled = process.env.LAWNCOPILOT_ORB_ENABLED !== '0';
  res.json({
    success: true,
    orb_enabled: enabled,
    // Agent ids are public per ElevenLabs convai design; the API key stays server-side.
    convai_agent_en: process.env.ELEVENLABS_CONVAI_LAWNCOPILOT_EN || null,
    convai_agent_es: process.env.ELEVENLABS_CONVAI_LAWNCOPILOT_ES || null,
    voice_available: !!(process.env.ELEVENLABS_CONVAI_LAWNCOPILOT_EN),
    fallback_tts: '/api/tts/edge',
    typed_always_available: true,
    gate_fields: ['name', 'phone', 'email'],
    phone: process.env.LAWNCOPILOT_VOICE_NUMBER || null
  });
});

/**
 * THE GATE. Nothing happens before this succeeds.
 */
router.post('/identity', async (req, res) => {
  const { name, phone, email, address, consent, session_id } = req.body || {};
  const tenant_id = TENANT();
  const sid = session_id || crypto.randomBytes(12).toString('hex');

  const session = await brain.upsertSession({
    tenant_id, session_id: sid,
    channel: (req.body && req.body.channel) || 'web_orb',
    employee: 'receptionist'
  });

  const result = await brain.callTool(
    'receptionist.capture_lead',
    { name, phone, email, address, consent, source: (req.body && req.body.channel) || 'web_orb' },
    { tenant_id, channel: 'web_orb', session_id: sid, actor: 'visitor' }
  );

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error, session_id: sid });
  }

  await brain.upsertSession({
    tenant_id, session_id: sid,
    identity: { name, phone, email },
    lead_id: result.lead_id,
    customer_id: result.customer_id || null
  });

  res.json({
    success: true,
    session_id: sid,
    lead_id: result.lead_id,
    identity_verified: true,
    returning_customer: result.returning_customer,
    greeting: result.greeting
  });
});

// ── Gate check for everything below ────────────────────────────────────────
async function requireIdentity(req, res, next) {
  const sid = (req.body && req.body.session_id) || req.query.session_id;
  if (!sid) {
    return res.status(403).json({ success: false, gate_required: true, error: 'Identity required before any request.' });
  }
  const s = await AgentSession.findOne({ where: { tenant_id: TENANT(), session_id: sid } });
  if (!s || !s.identity_verified) {
    return res.status(403).json({ success: false, gate_required: true, error: 'Name, phone, and email are required first.' });
  }
  req.orbSession = s;
  next();
}

router.post('/session', requireIdentity, async (req, res) => {
  const s = req.orbSession;
  const out = await turn({
    tenant_id: TENANT(), session_id: s.session_id,
    text: '', channel: req.body.channel || s.channel
  });
  res.json({ ...out, session_id: s.session_id });
});

/**
 * A typed turn. Same brain, same tools, same numbers as the voice path.
 */
router.post('/message', requireIdentity, async (req, res) => {
  const s = req.orbSession;
  const text = String((req.body && req.body.text) || '').slice(0, 2000);
  const out = await turn({
    tenant_id: TENANT(), session_id: s.session_id,
    text, channel: req.body.channel || s.channel || 'web_chat'
  });
  res.json({ ...out, session_id: s.session_id });
});

/**
 * The convai client-tool bridge. The browser SDK calls a tool; we route it
 * through the Brain exactly like every other channel — no shortcuts.
 */
router.post('/tool', requireIdentity, async (req, res) => {
  const s = req.orbSession;
  const { tool, arguments: args } = req.body || {};
  if (!tool) return res.status(400).json({ success: false, error: 'tool is required' });

  const result = await brain.callTool(tool, args || {}, {
    tenant_id: TENANT(),
    channel: 'web_orb',
    session_id: s.session_id,
    customer_id: s.customer_id,
    identity_verified: true,
    actor: `lead:${(s.identity || {}).email || 'unknown'}`
  });
  res.json(result);
});

router.post('/transcript', requireIdentity, async (req, res) => {
  const s = req.orbSession;
  const t = Array.isArray(req.body.transcript) ? req.body.transcript : [];
  if (t.length) {
    s.transcript = t.slice(-60);
    s.updated_at = new Date();
    await s.save();
  }
  res.json({ success: true, saved: t.length });
});

router.get('/transcript', requireIdentity, async (req, res) => {
  res.json({ success: true, transcript: req.orbSession.transcript || [] });
});

/**
 * Email the transcript to the visitor. User-clicked, so it bypasses
 * EMAIL_AUTOSEND_DISABLED.
 */
router.post('/transcript/email', requireIdentity, async (req, res) => {
  const s = req.orbSession;
  const identity = s.identity || {};
  const lines = (s.transcript || [])
    .map(t => `${t.role === 'agent' ? 'Lawn Co-Pilot' : (identity.name || 'You')}: ${t.text}`)
    .join('\n\n');

  const r = await notify({
    tenant_id: TENANT(), customer_id: s.customer_id, channel: 'email',
    template: 'quote_confirmation',
    to: identity.email,
    userInitiated: true,
    vars: {
      name: identity.name || 'there',
      address: (stateOfSession(s).address) || 'your property',
      serviceable_sqft: stateOfSession(s).serviceable_sqft || 0,
      frequency_label: 'Your conversation',
      price: 'see below',
      is_estimate: true,
      quote_url: (process.env.LAWNCOPILOT_BASE_URL || 'https://aiagent.ringlypro.com') + '/lawncopilot/',
      transcript: lines
    }
  });
  res.json({ success: r.success, status: r.status, reason: r.reason || null });
});

function stateOfSession(s) {
  return ((s.identity || {}).__state) || {};
}

/**
 * Session summary — what the orb collected, for the checkout handoff.
 */
router.get('/summary', requireIdentity, async (req, res) => {
  const s = req.orbSession;
  const st = stateOfSession(s);
  let quote = null, property = null;
  if (st.quote_id) {
    quote = await Quote.findOne({ where: { id: st.quote_id, tenant_id: TENANT() }, raw: true });
  }
  if (st.property_id) {
    property = await Property.findOne({ where: { id: st.property_id, tenant_id: TENANT() }, raw: true });
  }
  const lead = s.lead_id ? await Lead.findOne({ where: { id: s.lead_id, tenant_id: TENANT() }, raw: true }) : null;
  res.json({
    success: true,
    identity: { name: (s.identity || {}).name, phone: (s.identity || {}).phone, email: (s.identity || {}).email },
    stage: st.stage || null,
    lead, property, quote,
    chosen_date: st.chosen_date || null,
    frequency: st.frequency || null
  });
});

module.exports = router;
