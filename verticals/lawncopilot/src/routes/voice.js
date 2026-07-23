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

const TENANT = () => Number(process.env.LAWNCOPILOT_TENANT_ID || 1);

router.post('/incoming', express.urlencoded({ extended: false }), async (req, res) => {
  const from = req.body.From || null;
  const to = req.body.To || null;
  const callSid = req.body.CallSid || null;
  const tenant_id = TENANT();

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
  const voice = process.env.LAWNCOPILOT_POLLY_VOICE || 'Joanna-Neural';

  // Raw XML: the 4.x twilio SDK has no conversationRelay() builder.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${wsUrl}" voice="${voice}" welcomeGreetingInterruptible="true" transcriptionProvider="google" ttsProvider="amazon">
      <Parameter name="profile" value="lawncopilot"/>
      <Parameter name="tenant_id" value="${tenant_id}"/>
      <Parameter name="caller_name" value="${greetingName || ''}"/>
      <Parameter name="customer_id" value="${customer_id || ''}"/>
    </ConversationRelay>
  </Connect>
</Response>`;

  res.type('text/xml').send(xml);
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Lawn Co-Pilot voice (ConversationRelay)',
    number_configured: !!process.env.LAWNCOPILOT_VOICE_NUMBER,
    transfer_configured: !!process.env.LAWNCOPILOT_TRANSFER_NUMBER,
    voice: process.env.LAWNCOPILOT_POLLY_VOICE || 'Joanna-Neural',
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
  const tenant_id = TENANT();
  const session = call_sid ? await AgentSession.findOne({ where: { tenant_id, session_id: call_sid } }) : null;
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
      { where: { tenant_id: TENANT(), call_sid: CallSid } }
    );
  } catch (e) { /* best effort */ }
  res.sendStatus(204);
});

router.get('/transcripts', async (req, res) => {
  const calls = await CallLog.findAll({
    where: { tenant_id: TENANT() }, order: [['created_at', 'DESC']], limit: 50, raw: true
  });
  res.json({ success: true, calls });
});

module.exports = router;
