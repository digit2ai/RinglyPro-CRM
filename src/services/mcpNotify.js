'use strict';

/**
 * Digit2AI MCP Neural — booking confirmations to the CLIENT (email + text) and an
 * alert to the owner. Called once, after a setup meeting is committed to the
 * Projects calendar, and never blocks or fails the booking.
 *
 * EMAIL: SendGrid (SENDGRID_API_KEY + SENDGRID_FROM_EMAIL). Owner copy goes to
 *   MCP_NOTIFY_EMAIL || D2AI_LEAD_NOTIFY_EMAIL || info@digit2ai.com.
 * TEXT: the Digit2AI A2P-registered GoHighLevel number (MCP_SMS_FROM, default
 *   +18132124888), through the GHL Conversations API with the CRM's own GHL
 *   connection for client 15 (read at send time, because the CRM refreshes that
 *   token) — the same path BuyersLine staff alerts use. US/Canada numbers only:
 *   that 10DLC number is registered for US traffic, and a +1 that is not a
 *   10-digit NANP number is refused rather than guessed (toll-fraud rule).
 * The client agreed to these messages on the form (consent line above the button).
 * Every outcome is logged; nothing here throws.
 */

const FROM = () => process.env.MCP_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'info@digit2ai.com';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const SMS_FROM = () => process.env.MCP_SMS_FROM || '+18132124888';
const GHL_CLIENT = () => Number(process.env.MCP_GHL_CLIENT_ID || 15);

let crmDb = null;
function db() {
  if (!crmDb) {
    const { Sequelize } = require('sequelize');
    crmDb = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
      dialect: 'postgres', logging: false,
      dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
      pool: { max: 2, min: 0, idle: 10000 }
    });
  }
  return crmDb;
}

const CARIB = new Set(['242','246','264','268','284','345','441','473','649','658','664','670','671','684','721','758','767','784','809','829','849','868','869','876']);

function e164us(phone) {
  const d = String(phone || '').replace(/[^\d]/g, '');
  let n = null;
  if (d.length === 10) n = '+1' + d;
  else if (d.length === 11 && d[0] === '1') n = '+' + d;
  if (!n) return null;
  // NANP: area code and exchange cannot start with 0/1; refuse premium 900/976.
  if (!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(n) || /^\+1(900|500|700)/.test(n) || /^\+1\d{3}976/.test(n)) return null;
  // Caribbean and Pacific +1 codes bill as international: refused.
  if (CARIB.has(n.slice(2, 5))) return null;
  return n;
}

function validTz(tz) {
  try { if (tz) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } } catch (e) {}
  return 'America/New_York';
}

function when(startIso, lang, tz) {
  const zone = validTz(tz);
  const loc = lang === 'en' ? 'en-US' : 'es-ES';
  const txt = new Intl.DateTimeFormat(loc, {
    timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hourCycle: 'h12'
  }).format(new Date(startIso));
  const city = zone.split('/').pop().replace(/_/g, ' ');
  return `${txt} (${lang === 'en' ? 'time in' : 'hora de'} ${city})`;
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = n => String(n || '').trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '').slice(0, 40);

async function ghlCreds() {
  // A fresh Private Integration token set on Render wins over the stored CRM connection
  // (both stored client-15 tokens answered 401 on 2026-10-20).
  if (process.env.MCP_GHL_TOKEN && process.env.MCP_GHL_LOCATION_ID) return { key: process.env.MCP_GHL_TOKEN, loc: process.env.MCP_GHL_LOCATION_ID };
  const rows = await db().query(
    `SELECT c.settings->'integration'->'ghl' AS gs, g.access_token AS tok, g.ghl_location_id AS loc
       FROM clients c LEFT JOIN ghl_integrations g ON g.client_id = c.id AND g.is_active = true
      WHERE c.id = :id LIMIT 1`,
    { replacements: { id: GHL_CLIENT() }, type: require('sequelize').QueryTypes.SELECT });
  const r = rows[0];
  if (!r) return null;
  const key = r.gs && r.gs.enabled && r.gs.apiKey ? r.gs.apiKey : r.tok;
  const loc = r.loc || (r.gs && r.gs.locationId);
  return key && loc ? { key, loc } : null;
}

async function sendSms(to, body, name) {
  const axios = require('axios');
  const creds = await ghlCreds();
  if (!creds) throw new Error('no GHL connection for client ' + GHL_CLIENT());
  const headers = { Authorization: `Bearer ${creds.key}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
  let contactId = null;
  try {
    const found = await axios.get(`${GHL_BASE}/contacts/search/duplicate`, { params: { locationId: creds.loc, number: to }, headers, timeout: 10000 });
    contactId = found.data && found.data.contact ? found.data.contact.id : null;
  } catch (e) { contactId = null; }
  if (!contactId) {
    const made = await axios.post(`${GHL_BASE}/contacts/`,
      { locationId: creds.loc, phone: to, firstName: first(name) || 'MCP', lastName: '', tags: ['mcp-neural'], source: 'digit2ai.com/MCP' },
      { headers, timeout: 10000 });
    contactId = made.data && made.data.contact ? made.data.contact.id : null;
  }
  if (!contactId) throw new Error('GHL contact not found or created');
  const sent = await axios.post(`${GHL_BASE}/conversations/messages`,
    { type: 'SMS', contactId, message: body, fromNumber: SMS_FROM() }, { headers, timeout: 15000 });
  return sent.data && (sent.data.messageId || sent.data.id);
}

function sendgrid() {
  if (!process.env.SENDGRID_API_KEY) return null;
  const sg = require('@sendgrid/mail');
  sg.setApiKey(process.env.SENDGRID_API_KEY);
  return sg;
}

/**
 * booking = { start (ISO), name, email, phone, projectId, lang, tz, test }
 * Returns { email, sms, owner } each 'sent' | 'skipped: …' | 'failed: …'.
 */
async function bookingConfirmed(booking) {
  const b = booking || {};
  const lang = b.lang === 'en' ? 'en' : 'es';
  const whenTxt = when(b.start, lang, b.tz);
  const whenNy = when(b.start, lang, 'America/New_York');
  const nm = first(b.name);
  const out = { email: 'skipped', sms: 'skipped', owner: 'skipped' };
  const sg = sendgrid();

  // 1) Client email
  if (!sg) out.email = 'skipped: SendGrid not configured';
  else if (!b.email) out.email = 'skipped: no email';
  else {
    try {
      const subject = lang === 'en' ? 'Your Digit2AI MCP Neural setup meeting is confirmed' : 'Su reunión de configuración de Digit2AI MCP Neural está confirmada';
      const html = lang === 'en'
        ? `<p>Hi ${esc(nm)},</p><p>Your <b>Digit2AI MCP Neural</b> setup meeting is confirmed for <b>${esc(whenTxt)}</b>. It lasts 60 minutes.</p><p>Our team will send you the meeting link before the call. In the meeting we connect MCP to your systems and agree the first steps.</p><p>Need another time? Just reply to this email.</p><p>Digit2AI</p>`
        : `<p>Hola ${esc(nm)},</p><p>Su reunión de configuración de <b>Digit2AI MCP Neural</b> quedó confirmada para el <b>${esc(whenTxt)}</b>. Dura 60 minutos.</p><p>Nuestro equipo le enviará el enlace de la reunión antes de la llamada. En la reunión conectamos el MCP a sus sistemas y acordamos los primeros pasos.</p><p>¿Necesita otro horario? Responda a este correo.</p><p>Digit2AI</p>`;
      await sg.send({ to: b.email, from: { email: FROM(), name: 'Digit2AI' }, replyTo: process.env.MCP_NOTIFY_EMAIL || process.env.D2AI_LEAD_NOTIFY_EMAIL || 'info@digit2ai.com', subject, html });
      out.email = 'sent';
    } catch (e) { out.email = 'failed: ' + ((e.response && JSON.stringify(e.response.body).slice(0, 160)) || e.message); }
  }

  // 2) Client text from the A2P number
  const to = e164us(b.phone);
  if (!b.phone) out.sms = 'skipped: no phone';
  else if (!to) out.sms = 'skipped: not a US/Canada number';
  else {
    try {
      const body = lang === 'en'
        ? `Digit2AI: ${nm ? nm + ', y' : 'Y'}our MCP Neural setup meeting is confirmed for ${whenTxt}. We will send you the meeting link. Reply STOP to opt out.`
        : `Digit2AI: ${nm ? nm + ', s' : 'S'}u reunión de configuración de MCP Neural quedó confirmada para el ${whenTxt}. Le enviaremos el enlace. Responda STOP para no recibir mensajes.`;
      const id = await sendSms(to, body, b.name);
      out.sms = 'sent' + (id ? ' ' + id : '');
    } catch (e) { out.sms = 'failed: ' + ((e.response && JSON.stringify(e.response.data).slice(0, 160)) || e.message); }
  }

  // 3) Owner alert (email)
  const ownerTo = process.env.MCP_NOTIFY_EMAIL || process.env.D2AI_LEAD_NOTIFY_EMAIL || 'info@digit2ai.com';
  if (sg) {
    try {
      await sg.send({
        to: ownerTo, from: { email: FROM(), name: 'Digit2AI MCP' },
        subject: `${b.test ? '[PRUEBA] ' : ''}Nueva reunión MCP Neural: ${b.name || b.email || 'cliente'}`,
        html: `<p><b>${esc(b.name)}</b> &lt;${esc(b.email)}&gt; ${esc(b.phone || '')}</p><p>Reunión: <b>${esc(whenNy)}</b>${b.test ? ' (modo prueba, sin pago)' : ' (pagado en Stripe)'}</p>${b.projectId ? `<p>Lead en Projects: #${esc(b.projectId)}</p>` : ''}<p>Confirmación al cliente: correo ${esc(out.email)} · texto ${esc(out.sms)}</p>`
      });
      out.owner = 'sent';
    } catch (e) { out.owner = 'failed: ' + e.message; }
  }
  console.log('[mcp-notify]', JSON.stringify({ project: b.projectId || null, email: out.email, sms: out.sms.split(' ')[0], owner: out.owner }));
  return out;
}

module.exports = { bookingConfirmed, e164us, when, _setDb: d => { crmDb = d; } };
