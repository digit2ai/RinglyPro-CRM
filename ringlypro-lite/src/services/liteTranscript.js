'use strict';

/** Fire-and-forget per-turn transcript logging. Never breaks a call. */
const { Transcript } = require('../models');

async function log({ tenantId, callSid, role, text, toolName }) {
  try {
    await Transcript.create({
      tenant_id: tenantId || null,
      call_sid: callSid || null,
      role: role || 'agent',
      text: (text || '').slice(0, 4000),
      tool_name: toolName || null
    });
  } catch (_) { /* swallow */ }
}

module.exports = { log };
