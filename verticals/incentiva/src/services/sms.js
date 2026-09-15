'use strict';

/**
 * BuyersLine SMS (Twilio). The ONLY file in the vertical that reaches Twilio (SIT greps).
 *
 * Outbound:
 *  - agentNewLeadSms: the hand-off brief to the ASSIGNED AGENT's own phone (nca_users.phone), only
 *    when the buyer granted agent-referral consent.
 *  - buyerSms: Rachel's follow-ups and the Scheduler's reminders to a BUYER, only while the buyer's
 *    latest SMS consent is granted and not revoked (checked at send time), never during quiet hours
 *    (before 9 am or from 8 pm Eastern), always ending with the STOP instruction.
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
function publicUrl() { return (process.env.INCENTIVA_PUBLIC_URL || 'https://buyersline.app').replace(/\/+$/, ''); }

async function agentNewLeadSms(tenantId, leadId) {
  const l = await db.one('SELECT id, first_name, city, zip, referral_consent, assigned_agent_id, readiness_score, readiness_tier FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  if (!l || l.referral_consent !== true || !l.assigned_agent_id) return { sent: false, reason: 'no_referral_consent_or_agent' };
  const agent = await db.one('SELECT id, phone FROM nca_users WHERE id = :id AND tenant_id = :t AND active = true', { id: l.assigned_agent_id, t: tenantId });
  const to = agent ? e164(agent.phone) : null;
  const action = 'sms.agent_new_lead_' + l.assigned_agent_id;
  if (await db.one(`SELECT id FROM nca_audit_log WHERE tenant_id = :t AND action = :a AND subject_type = 'lead' AND subject_id = :l LIMIT 1`, { t: tenantId, a: action, l: l.id })) return { sent: false, reason: 'already_sent' };
  if (!to) { await audit(tenantId, { type: 'system' }, 'sms.agent_phone_missing', 'lead', l.id, { agent_id: l.assigned_agent_id }); return { sent: false, reason: 'agent_phone_missing' }; }
  if (!configured()) { await audit(tenantId, { type: 'system' }, 'sms.not_configured', 'lead', l.id, {}); return { sent: false, reason: 'not_configured' }; }
  const area = [l.city, l.zip].filter(Boolean).join(' ') || 'their area';
  const tier = l.readiness_tier && l.readiness_tier !== 'none' ? ` (${l.readiness_tier.toUpperCase()} ${l.readiness_score})` : '';
  const body = `BuyersLine: new lead ${l.first_name}${tier} in ${area} agreed to agent contact. Details in the console: ${publicUrl()}/admin/#/leads/${l.id}`;
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

function quietHours(now = new Date()) { const h = require('./eastern').hourNow(now); return h < 9 || h >= 20; }

/** A text to a buyer. Live SMS consent is required at send time; quiet hours return 'quiet_hours' so the caller can retry later. */
async function buyerSms(tenantId, leadId, { action, subjectType, subjectId, body }) {
  const l = await db.one('SELECT id, phone, agent_agreement_signed FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  const to = l && !l.agent_agreement_signed ? e164(l.phone) : null;
  if (!to) return { sent: false, reason: 'no_phone' };
  const c = await db.one(`SELECT granted, revoked_at, confirmed_at FROM nca_lead_consents WHERE tenant_id = :t AND lead_id = :l AND channel = 'sms' ORDER BY id DESC LIMIT 1`, { t: tenantId, l: leadId });
  if (!c || c.granted !== true || c.revoked_at) return { sent: false, reason: 'no_sms_consent' };
  if (!c.confirmed_at) return { sent: false, reason: 'sms_not_confirmed' };
  if (quietHours()) return { sent: false, reason: 'quiet_hours' };
  if (await db.one(`SELECT id FROM nca_audit_log WHERE tenant_id = :t AND action = :a AND subject_type = :st AND subject_id = :s LIMIT 1`, { t: tenantId, a: action, st: subjectType, s: subjectId })) return { sent: false, reason: 'already_sent' };
  if (!configured()) { await audit(tenantId, { type: 'system' }, 'sms.not_configured', subjectType, subjectId, {}); return { sent: false, reason: 'not_configured' }; }
  const msg = { to, body: String(body).slice(0, 300) + ' Reply STOP to opt out.' };
  if (process.env.INCENTIVA_SMS_MESSAGING_SERVICE_SID) msg.messagingServiceSid = process.env.INCENTIVA_SMS_MESSAGING_SERVICE_SID; else msg.from = process.env.INCENTIVA_SMS_FROM;
  try {
    const r = await twilioClient().messages.create(msg);
    await audit(tenantId, { type: 'system' }, action, subjectType, subjectId, { sid: r && r.sid ? r.sid : null });
    return { sent: true };
  } catch (e) {
    console.error('[incentiva] buyer sms failed:', e.message);
    await audit(tenantId, { type: 'system' }, action + '_failed', subjectType, subjectId, { error: String(e.message).slice(0, 300) });
    return { sent: false, reason: 'error' };
  }
}

/**
 * Double opt-in: the ONE text an unconfirmed number can receive, sent right after the buyer ticked SMS
 * consent. Fixed wording, nothing the buyer typed. Buyer texts start only after they reply YES.
 */
async function smsConfirmRequest(tenantId, leadId) {
  const l = await db.one('SELECT id, phone, lang, agent_agreement_signed FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  const to = l && !l.agent_agreement_signed ? e164(l.phone) : null;
  if (!to) return { sent: false, reason: 'no_phone' };
  const c = await db.one(`SELECT granted, revoked_at, confirmed_at FROM nca_lead_consents WHERE tenant_id = :t AND lead_id = :l AND channel = 'sms' ORDER BY id DESC LIMIT 1`, { t: tenantId, l: leadId });
  if (!c || c.granted !== true || c.revoked_at || c.confirmed_at) return { sent: false, reason: 'not_needed' };
  const action = 'sms.confirm_request';
  if (await db.one(`SELECT id FROM nca_audit_log WHERE tenant_id = :t AND action = :a AND subject_type = 'lead' AND subject_id = :l LIMIT 1`, { t: tenantId, a: action, l: l.id })) return { sent: false, reason: 'already_sent' };
  if (!configured()) { await audit(tenantId, { type: 'system' }, 'sms.not_configured', 'lead', l.id, {}); return { sent: false, reason: 'not_configured' }; }
  const body = l.lang === 'es'
    ? 'BuyersLine: responda SI para recibir mensajes de texto sobre su informe de casas nuevas y sus consultas. Frecuencia variable. Pueden aplicar tarifas de mensajes y datos. Responda STOP para cancelar.'
    : 'BuyersLine: reply YES to get texts about your new-home report and consults. Msg frequency varies. Msg and data rates may apply. Reply STOP to opt out.';
  const msg = { to, body };
  if (process.env.INCENTIVA_SMS_MESSAGING_SERVICE_SID) msg.messagingServiceSid = process.env.INCENTIVA_SMS_MESSAGING_SERVICE_SID; else msg.from = process.env.INCENTIVA_SMS_FROM;
  try {
    const r = await twilioClient().messages.create(msg);
    await audit(tenantId, { type: 'system' }, action, 'lead', l.id, { sid: r && r.sid ? r.sid : null });
    return { sent: true };
  } catch (e) {
    await audit(tenantId, { type: 'system' }, action + '_failed', 'lead', l.id, { error: String(e.message).slice(0, 300) });
    return { sent: false, reason: 'error' };
  }
}

const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT', 'PARAR', 'ALTO'];
const START_WORDS = ['START', 'UNSTOP', 'YES', 'Y', 'SI', 'INICIO'];
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
  const word = String((req.body && req.body.Body) || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, '').split(/\s+/)[0] || '';
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
  if (START_WORDS.includes(word)) {
    // YES confirms a pending opt-in from this number (never re-grants a consent that STOP revoked).
    const rows = await db.exec(`UPDATE nca_lead_consents c SET confirmed_at = now()
      FROM nca_leads l WHERE c.lead_id = l.id AND l.tenant_id = :t AND c.tenant_id = :t AND c.channel = 'sms' AND c.granted = true AND c.revoked_at IS NULL AND c.confirmed_at IS NULL
      AND RIGHT(REGEXP_REPLACE(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), 10) = :p RETURNING c.lead_id`, { t: tenantId, p: last10 });
    await audit(tenantId, { type: 'buyer' }, 'sms.start', 'phone', null, { confirmed: rows.length });
    const followup = require('./followup');
    for (const r of rows) await followup.scheduleForLead(tenantId, r.lead_id);
    return { status: 200, twiml: twiml('') };
  }
  if (HELP_WORDS.includes(word)) {
    return { status: 200, twiml: twiml('BuyersLine new-home report updates. Msg frequency varies. Msg and data rates may apply. Reply STOP to opt out. Help: info@digit2ai.com') };
  }
  return { status: 200, twiml: twiml('') };
}

/**
 * A short alert to staff, never to a buyer: every active admin with a phone on their console account (nca_users.phone).
 * Carries an email address at most (a login request), never buyer contact details.
 *
 * SENDER (owner decision 2026-09-15): the A2P-registered GoHighLevel number INCENTIVA_ALERT_SMS_FROM (default
 * +18132124888), sent through the GHL Conversations API with the CRM's existing GHL connection for client
 * INCENTIVA_ALERT_GHL_CLIENT_ID (default 15). That connection's token is refreshed by the CRM, so it is read at send
 * time rather than copied into an env var that would expire. If GHL is unreachable the text falls back to Twilio
 * (the vertical's sender, else the verified toll-free INCENTIVA_ALERT_TWILIO_FROM, default +18886103810).
 */
const GHL_BASE = 'https://services.leadconnectorhq.com';
let ghlSender = null; // SIT injects a fake
async function ghlCredentials() {
  const clientId = Number(process.env.INCENTIVA_ALERT_GHL_CLIENT_ID || 15);
  const r = await db.one(`SELECT c.settings->'integration'->'ghl' AS gs, g.access_token AS tok, g.ghl_location_id AS loc
    FROM clients c LEFT JOIN ghl_integrations g ON g.client_id = c.id AND g.is_active = true WHERE c.id = :id`, { id: clientId });
  if (!r) return null;
  const key = r.gs && r.gs.enabled && r.gs.apiKey ? r.gs.apiKey : r.tok;
  const loc = r.loc || (r.gs && r.gs.locationId);
  return key && loc ? { key, loc } : null;
}
async function ghlSend(to, body) {
  if (ghlSender) return ghlSender(to, body);
  const axios = require('axios');
  const creds = await ghlCredentials();
  if (!creds) throw new Error('no GHL connection');
  const headers = { Authorization: `Bearer ${creds.key}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
  let contactId = null;
  try {
    const found = await axios.get(`${GHL_BASE}/contacts/search/duplicate`, { params: { locationId: creds.loc, number: to }, headers, timeout: 10000 });
    contactId = found.data && found.data.contact ? found.data.contact.id : null;
  } catch (e) { contactId = null; }
  if (!contactId) {
    const made = await axios.post(`${GHL_BASE}/contacts/`, { locationId: creds.loc, phone: to, firstName: 'BuyersLine', lastName: 'Alerts', tags: ['buyersline-alerts'] }, { headers, timeout: 10000 });
    contactId = made.data && made.data.contact ? made.data.contact.id : null;
  }
  if (!contactId) throw new Error('GHL contact not found or created');
  const sent = await axios.post(`${GHL_BASE}/conversations/messages`, { type: 'SMS', contactId, message: body, fromNumber: process.env.INCENTIVA_ALERT_SMS_FROM || '+18132124888' }, { headers, timeout: 15000 });
  return { id: sent.data && (sent.data.messageId || sent.data.id), provider: 'ghl' };
}
async function staffAlert(tenantId, { action, subjectType, subjectId, body }) {
  if (process.env.INCENTIVA_SMS === 'off') return { sent: 0, reason: 'off' };
  const admins = await db.q(`SELECT id, phone FROM nca_users WHERE tenant_id = :t AND role = 'admin' AND active = true AND phone IS NOT NULL`, { t: tenantId });
  let sent = 0;
  for (const a of admins) {
    const to = e164(a.phone);
    if (!to) continue;
    const act = action + '_' + a.id;
    if (await db.one(`SELECT id FROM nca_audit_log WHERE tenant_id = :t AND action = :a AND subject_type = :st AND subject_id = :s LIMIT 1`, { t: tenantId, a: act, st: subjectType, s: subjectId })) continue;
    const text = String(body).slice(0, 300);
    try {
      const r = await ghlSend(to, text);
      await audit(tenantId, { type: 'system' }, act, subjectType, subjectId, { provider: 'ghl', id: r && r.id ? r.id : null });
      sent++;
      continue;
    } catch (e) {
      console.error('[incentiva] staff sms via GHL failed:', (e.response && JSON.stringify(e.response.data).slice(0, 200)) || e.message);
    }
    if (!client && !(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)) { await audit(tenantId, { type: 'system' }, act + '_failed', subjectType, subjectId, { error: 'GHL failed and Twilio is not configured' }); continue; }
    const msg = { to, body: text };
    if (process.env.INCENTIVA_SMS_MESSAGING_SERVICE_SID) msg.messagingServiceSid = process.env.INCENTIVA_SMS_MESSAGING_SERVICE_SID;
    else msg.from = process.env.INCENTIVA_SMS_FROM || process.env.INCENTIVA_ALERT_TWILIO_FROM || '+18886103810';
    try {
      const r = await twilioClient().messages.create(msg);
      await audit(tenantId, { type: 'system' }, act, subjectType, subjectId, { provider: 'twilio_fallback', sid: r && r.sid ? r.sid : null });
      sent++;
    } catch (e) {
      console.error('[incentiva] staff sms failed:', e.message);
      await audit(tenantId, { type: 'system' }, act + '_failed', subjectType, subjectId, { error: String(e.message).slice(0, 300) });
    }
  }
  return { sent };
}

function _setClient(fake) { client = fake; }
function _setGhlSender(fn) { ghlSender = fn; }

module.exports = { staffAlert, _setGhlSender, configured, agentNewLeadSms, buyerSms, smsConfirmRequest, quietHours, handleInbound, e164, STOP_WORDS, _setClient };
