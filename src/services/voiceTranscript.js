'use strict';
/**
 * Voice call transcript logging for the ConversationRelay agent.
 * Persists every turn (caller speech, agent replies, tool calls) so calls are debuggable.
 * Fire-and-forget from the hot path — never blocks or fails a call.
 */

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS voice_call_transcripts (
      id SERIAL PRIMARY KEY,
      call_sid VARCHAR(64),
      client_id INTEGER,
      from_number VARCHAR(32),
      role VARCHAR(16) NOT NULL,       -- 'caller' | 'agent' | 'tool'
      text TEXT,
      tool_name VARCHAR(64),
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_vct_call_sid ON voice_call_transcripts(call_sid)');
  ensured = true;
}

// Fire-and-forget. Swallows all errors — logging must never break a call.
function log({ callSid, clientId, from, role, text, toolName }) {
  ensureTable()
    .then(() => sequelize.query(
      `INSERT INTO voice_call_transcripts (call_sid, client_id, from_number, role, text, tool_name, created_at)
       VALUES (:callSid, :clientId, :from, :role, :text, :toolName, now())`,
      {
        replacements: {
          callSid: callSid || null,
          clientId: clientId || null,
          from: from || null,
          role,
          text: text ? String(text).slice(0, 4000) : null,
          toolName: toolName || null
        }
      }))
    .catch(e => console.error('[VoiceTranscript] log failed:', e.message));
}

async function getTranscript(callSid) {
  await ensureTable();
  return sequelize.query(
    'SELECT role, text, tool_name, created_at FROM voice_call_transcripts WHERE call_sid = :c ORDER BY id',
    { replacements: { c: callSid }, type: QueryTypes.SELECT });
}

async function recentCalls(limit = 25) {
  await ensureTable();
  return sequelize.query(
    `SELECT call_sid, MAX(client_id) client_id, MAX(from_number) from_number,
            MIN(created_at) started, COUNT(*) turns
     FROM voice_call_transcripts
     GROUP BY call_sid
     ORDER BY started DESC
     LIMIT :lim`,
    { replacements: { lim: limit }, type: QueryTypes.SELECT });
}

module.exports = { log, getTranscript, recentCalls };
