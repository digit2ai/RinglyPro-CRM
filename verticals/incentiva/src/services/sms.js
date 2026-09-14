'use strict';

/**
 * BuyersLine SMS (Twilio). The ONLY file in the vertical that reaches Twilio (SIT greps).
 *
 * Outbound: one message type, agentNewLeadSms, to the ASSIGNED AGENT's own phone
 * (nca_users.phone), only when the buyer granted agent-referral consent. It never
 * texts a buyer: no buyer SMS is built, so the buyer's SMS consent is recorded and
 * honoured (STOP) but nothing is sent on it yet.
 *
 * Inbound: handleInbound() applies STOP / START / HELP from the Twilio webhook to the
 * buyer's stored SMS consent, after validating Twilio's request signature.
 *
 * Configuration: TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, and a sender:
 * INCENTIVA_SMS_MESSAGING_SERVICE_SID (preferred, A2P 10DLC) or INCENTIVA_SMS_FROM.
 * Missing any of them = nothing sends and the audit says why.
 */

const db = require('../db');
const { audit } = require('./util');

let client = null; // SIT injects a fake via _setClient

function configured() {
  if (process.env.INCENTIVA_SMS === 'off') return false;
  if (client) return true;
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.INCENTIVA_SMS_MESSAGING_SERVICE_SID || process.env.INCENTIVA_SMS_FROM));
}
function twilioClient() {
  if (client) return client;
  const twilio = require('twilio');
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}
function e164(phone) {
  const d = String(phone || '').replace(/[^\d]/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}
function publicUrl() { return (process.env.INCENTIVA_PUBLIC_URL || 'https://aiagent.ringlypro.com/buyersline').replace(/\/+$/, ''); }

async function agentNewLeadSms(tenantId, leadId) {
  const l = await db.one('SELECT id, first_name, city, zip, referral_consent, assigned_agent_id FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  if (!l || l.referral_consent !== true || !l.assigned_agent_id) return { sent: false, reason: 'no_referral_consent_or_agent' };
  const agent = await db.one('SELECT id, phone FROM nca_users WHERE id = :id AND tenant_id = :t AND active = true', { id: l.assigned_agent_id, t: tenantId });
  const to = agent ? e164(agent.phone) : null;
  const action = 'sms.agent_new_lead_' + l.assigned_agent_id;
  if (await db.one(`SELECT id FROM nca_audit_log WHERE tenant_id = :t AND action = :a AND subject_type = 'lead' AND subject_id = :l LIMIT 1`, { t: tenantId, a: action, l: l.id })) return { sent: false, reason: 'already_sent' };
  if (!to) { await audit(tenantId, { type: 'system' }, 'sms.agent_phone_missing', 'lead', l.id, { agent_id: l.assigned_agent_id }); return { sent: false, reason: 'agent_phone_missing' }; }
  if (!configured()) { await audit(tenantId, { type: 'system' }, 'sms.not_configured', 'lead', l.id, {}); return { sent: false, reason: 'not_configured' }; }
  const area = [l.city, l.zip].filter(Boolean).join(' ') || 'their area';
  const body = `BuyersLine: new lead ${l.first_name} in ${area} agreed to agent contact. Details in the console: ${publicUrl()}/admin/#/leads/${l.id}`;
  const msg = { to, body };
  if (process.env.INCENTIVA_SMS_MESSAGING_SERVICE_SID) msg.messagingServiceSid = process.env.INCENTIVA_SMS_MESSAGING_SERVICE_SID; else msg.from = process.env.INCENTIVA_SMS_FROM;
  try {
    const r = await twilioClient().messages.create(msg);
    await audit(tenantId, { type: 'system' }, action, 'lead', l.id, { sid: r && r.sid ? r.sid : null });
    return { sent: true };
  } catch (e) {
    console.error('[incentiva] sms failed:', e.message);
    await audit(tenantId, { type: 'system' }, action + '_failed', 'lead', l.id, { error: String(e.message).slice(0, 300) });
    return { sent: false, reason: 'error' };
  }
}

const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT', 'PARAR', 'ALTO'];
const START_WORDS = ['START', 'UNSTOP', 'YES', 'INICIO'];
const HELP_WORDS = ['HELP', 'INFO', 'AYUDA'];

function validSignature(req, fullUrl) {
  if (client && client.__fake) return true;
  if (!process.env.TWILIO_AUTH_TOKEN) return false;
  const twilio = require('twilio');
  return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, req.headers['x-twilio-signature'] || '', fullUrl, req.body || {});
}

/**
 * STOP revokes every active SMS consent for that number in this tenant. START does NOT
 * silently re-grant marketing consent: it is recorded, and the buyer opts in again on the site.
 */
async function handleInbound(tenantId, req, fullUrl) {
  if (!validSignature(req, fullUrl)) return { status: 403, twiml: null };
  const from = e164(req.body && req.body.From);
  const word = String((req.body && req.body.Body) || '').trim().toUpperCase().split(/\s+/)[0] || '';
  const twiml = (text) => `<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Message>${text.replace(/[<&>]/g, '')}</Message>` : ''}</Response>`;
  if (!from) return { status: 200, twiml: twiml('') };
  const last10 = from.slice(-10);
  if (STOP_WORDS.includes(word)) {
    const rows = await db.exec(`UPDATE nca_lead_consents c SET revoked_at = now(), revoked_via = 'sms_stop'
      FROM nca_leads l WHERE c.lead_id = l.id AND l.tenant_id = :t AND c.tenant_id = :t AND c.channel = 'sms' AND c.revoked_at IS NULL
      AND RIGHT(REGEXP_REPLACE(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), 10) = :p RETURNING c.id`, { t: tenantId, p: last10 });
    await audit(tenantId, { type: 'buyer' }, 'sms.stop', 'phone', null, { revoked: rows.length });
    // Twilio's Advanced Opt-Out sends the carrier-required confirmation; an empty response avoids a duplicate.
    return { status: 200, twiml: twiml('') };
  }
  if (START_WORDS.includes(word)) { await audit(tenantId, { type: 'buyer' }, 'sms.start', 'phone', null, {}); return { status: 200, twiml: twiml('') }; }
  if (HELP_WORDS.includes(word)) {
    return { status: 200, twiml: twiml('BuyersLine new-home report updates. Msg frequency varies. Msg and data rates may apply. Reply STOP to opt out. Help: info@digit2ai.com') };
  }
  return { status: 200, twiml: twiml('') };
}

function _setClient(fake) { client = fake; }

module.exports = { configured, agentNewLeadSms, handleInbound, e164, STOP_WORDS, _setClient };
