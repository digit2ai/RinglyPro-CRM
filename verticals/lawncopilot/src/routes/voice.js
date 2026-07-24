'use strict';

/**
 * Lawn Co-Pilot — phone entry (Twilio ConversationRelay)
 *
 * Reuses the repo's existing ConversationRelay stack rather than introducing a
 * new telephony vendor. The relay socket resolves this session profile and the
 * Receptionist's tools are the SAME Brain tools the web orb calls.
 */

const express = require('express');
const router = express.Router();
const brain = require('../mcp/brain');
const { CallLog, AgentSession } = require('../models');

const { Tenant } = require('../models');

/**
 * A phone call has no URL slug, so the tenant is resolved from the number the
 * caller DIALED. One number, one company. Never an env var.
 */
async function tenantForNumber(to) {
  const digits = String(to || '').replace(/\D/g, '').slice(-10);
  if (!digits) return null;
  const tenants = await Tenant.findAll({ where: { status: ['active', 'trialing'] }, raw: true });
  return tenants.find(t => String(t.phone || '').replace(/\D/g, '').slice(-10) === digits) || null;
}

router.post('/incoming', express.urlencoded({ extended: false }), async (req, res) => {
  const from = req.body.From || null;
  const to = req.body.To || null;
  const callSid = req.body.CallSid || null;

  const tenant = await tenantForNumber(to);
  if (!tenant) {
    // An unrouted number must say so plainly, not answer as some other company.
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>This number is not currently in service. Goodbye.</Say><Hangup/></Response>`);
  }
  const tenant_id = tenant.id;

  let greetingName = null;
  let customer_id = null;
  try {
    const ident = await brain.callTool('receptionist.identify_caller', { phone: from }, {
      tenant_id, channel: 'phone', session_id: callSid, actor: `caller:${from}`
    });
    if (ident.success && ident.matched) {
      greetingName = ident.first_name;
      customer_id = ident.customer_id;
    }
  } catch (e) { /* unknown caller is fine */ }

  try {
    await CallLog.create({
      tenant_id, call_sid: callSid, from_number: from, to_number: to,
      customer_id, session_id: callSid, outcome: 'in_progress'
    });
    await brain.upsertSession({
      tenant_id, session_id: callSid, channel: 'phone', employee: 'receptionist',
      customer_id,
      // A phone caller's identity comes from ANI + a confirmation factor, not
      // from the web gate. The Brain treats 'phone' trust separately.
      identity: from ? { phone: from } : {}
    });
  } catch (e) { /* logging must not block the call */ }

  const base = process.env.LAWNCOPILOT_BASE_URL || 'https://aiagent.ringlypro.com';
  const wsUrl = base.replace(/^https/, 'wss') + '/voice-relay/ws';
  const voice = (tenant.settings && tenant.settings.polly_voice)
    || process.env.LAWNCOPILOT_POLLY_VOICE || 'Joanna-Neural';

  // Raw XML: the 4.x twilio SDK has no conversationRelay() builder.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${wsUrl}" voice="${voice}" welcomeGreetingInterruptible="true" transcriptionProvider="google" ttsProvider="amazon">
      <Parameter name="profile" value="lawncopilot"/>
      <Parameter name="tenant_slug" value="${tenant.slug}"/>
      <Parameter name="company" value="${(tenant.name || '').replace(/"/g, '')}"/>
      <Parameter name="tenant_id" value="${tenant_id}"/>
      <Parameter name="caller_name" value="${greetingName || ''}"/>
      <Parameter name="customer_id" value="${customer_id || ''}"/>
    </ConversationRelay>
  </Connect>
</Response>`;

  res.type('text/xml').send(xml);
});

router.get('/health', async (req, res) => {
  const routed = await Tenant.count({ where: { status: ['active', 'trialing'] } });
  const withNumbers = (await Tenant.findAll({ attributes: ['phone'], raw: true })).filter(t => t.phone).length;
  res.json({
    status: 'ok',
    service: 'Lawn Co-Pilot voice (ConversationRelay)',
    routing: 'tenant resolved from the dialed number',
    tenants_live: routed,
    tenants_with_numbers: withNumbers,
    voice_default: process.env.LAWNCOPILOT_POLLY_VOICE || 'Joanna-Neural',
    model: process.env.LAWNCOPILOT_VOICE_MODEL || 'claude-haiku-4-5-20251001'
  });
});

/**
 * Relay tool bridge — the ConversationRelay session calls tools through here,
 * so the phone runs on exactly the same Brain as the web.
 */
router.post('/tool', express.json(), async (req, res) => {
  const { tool, arguments: args, call_sid } = req.body || {};
  if (!tool) return res.status(400).json({ success: false, error: 'tool is required' });
  // The tenant for a live call comes from the session opened at /incoming.
  const session = call_sid ? await AgentSession.findOne({ where: { session_id: call_sid } }) : null;
  if (!session) return res.status(404).json({ success: false, error: 'Unknown call session' });
  const tenant_id = session.tenant_id;
  const result = await brain.callTool(tool, args || {}, {
    tenant_id, channel: 'phone', session_id: call_sid,
    customer_id: session ? session.customer_id : null,
    actor: `call:${call_sid}`
  });
  res.json(result);
});

router.post('/status', express.urlencoded({ extended: false }), async (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body || {};
  try {
    await CallLog.update(
      { outcome: CallStatus, duration_seconds: Number(CallDuration || 0) },
      { where: { call_sid: CallSid } }
    );
  } catch (e) { /* best effort */ }
  res.sendStatus(204);
});

// Call transcripts are tenant data — served from the tenant admin, not here.
router.get('/transcripts', (req, res) => {
  res.status(404).json({ success: false, error: 'Use the tenant admin call log' });
});

module.exports = router;
