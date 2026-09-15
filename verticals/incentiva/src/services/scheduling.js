'use strict';

/**
 * Scheduler agent: lets a buyer book a free 30-minute consult inside the licensed agent's weekly
 * hours, sends reminders 24 hours and 2 hours before, and after the meeting asks the buyer and the
 * agent how it went. Rules only: no model is involved in picking, booking or reminding.
 *
 * Invariants (SIT asserts each):
 *  - Only a lead that granted agent-referral consent, is not under agreement with another agent,
 *    and has an assigned agent can book.
 *  - A time is bookable only if it is one of slots(): inside the agent's hours, at least
 *    INCENTIVA_BOOK_MIN_HOURS (2) ahead, within INCENTIVA_BOOK_DAYS (14), and free. A partial unique
 *    index stops two bookings of the same start even under a race.
 *  - One active booking per lead.
 *  - Reminder and feedback emails are claimed atomically (UPDATE ... RETURNING), so several app
 *    instances never send twice. Texts need live SMS consent (sms.buyerSms).
 *  - Times are Eastern (America/New_York), DST included.
 *  - This file has no transport: email goes through notify.js, texts through sms.js.
 */

const db = require('../db');
const notify = require('./notify');
const sms = require('./sms');
const eastern = require('./eastern');
const { token, audit, safeFirstName } = require('./util');

const SLOT_MIN = 30;
const DEFAULT_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_min: 9 * 60, end_min: 17 * 60 }));

async function hoursFor(tenantId, agentId) {
  const rows = await db.q('SELECT weekday, start_min, end_min FROM nca_agent_hours WHERE tenant_id = :t AND agent_id = :a ORDER BY weekday', { t: tenantId, a: agentId });
  return rows.length ? { hours: rows.map((r) => ({ weekday: Number(r.weekday), start_min: Number(r.start_min), end_min: Number(r.end_min) })), is_default: false } : { hours: DEFAULT_HOURS, is_default: true };
}

async function setHours(tenantId, agentId, hours) {
  const clean = (Array.isArray(hours) ? hours : []).map((h) => ({ weekday: Number(h.weekday), start_min: Number(h.start_min), end_min: Number(h.end_min) }))
    .filter((h) => Number.isInteger(h.weekday) && h.weekday >= 0 && h.weekday <= 6 && Number.isInteger(h.start_min) && Number.isInteger(h.end_min) && h.start_min >= 0 && h.end_min <= 1440 && h.end_min - h.start_min >= SLOT_MIN);
  const seen = new Set();
  const unique = clean.filter((h) => !seen.has(h.weekday) && seen.add(h.weekday));
  await db.exec('DELETE FROM nca_agent_hours WHERE tenant_id = :t AND agent_id = :a', { t: tenantId, a: agentId });
  for (const h of unique) await db.exec('INSERT INTO nca_agent_hours (tenant_id, agent_id, weekday, start_min, end_min) VALUES (:t, :a, :w, :s, :e)', { t: tenantId, a: agentId, w: h.weekday, s: h.start_min, e: h.end_min });
  return unique;
}

async function slots(tenantId, agentId, { now = new Date(), days = Number(process.env.INCENTIVA_BOOK_DAYS || 14) } = {}) {
  const { hours } = await hoursFor(tenantId, agentId);
  const minStart = now.getTime() + Number(process.env.INCENTIVA_BOOK_MIN_HOURS || 2) * 3600e3;
  const booked = await db.q(`SELECT starts_at, duration_min FROM nca_lead_meetings WHERE tenant_id = :t AND agent_id = :a AND status = 'booked' AND starts_at > now() - interval '1 day'`, { t: tenantId, a: agentId });
  const busy = booked.map((b) => [new Date(b.starts_at).getTime(), new Date(b.starts_at).getTime() + Number(b.duration_min) * 60e3]);
  const out = [];
  for (let i = 0; i <= days; i++) {
    const day = eastern.addDays(now, i);
    for (const h of hours.filter((x) => x.weekday === day.weekday)) {
      for (let m = h.start_min; m + SLOT_MIN <= h.end_min; m += SLOT_MIN) {
        const start = eastern.toUtc(day.y, day.m, day.d, m);
        const s = start.getTime(), e = s + SLOT_MIN * 60e3;
        if (s < minStart) continue;
        if (busy.some(([bs, be]) => s < be && e > bs)) continue;
        out.push(start.toISOString());
      }
    }
  }
  return out;
}

async function bookableLead(tenantId, leadToken) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(leadToken || ''))) return { error: 404 };
  const l = await db.one('SELECT * FROM nca_leads WHERE token = :tok AND tenant_id = :t', { tok: leadToken, t: tenantId });
  if (!l) return { error: 404 };
  if (l.agent_agreement_signed || !l.referral_consent || !l.assigned_agent_id) return { error: 403, lead: l, reason: l.agent_agreement_signed ? 'under_agreement' : 'no_agent_contact_consent' };
  return { lead: l };
}

function meetingView(m, agent, lang) {
  const start = new Date(m.starts_at);
  const started = start.getTime() <= Date.now();
  return { token: m.token, lang, starts_at: start.toISOString(), label: eastern.label(start, lang), duration_min: Number(m.duration_min), status: m.status,
    agent: agent ? { name: agent.name, license_no: agent.license_no || null } : null,
    can_cancel: m.status === 'booked' && !started, can_feedback: started && ['booked', 'held'].includes(m.status) && !m.buyer_feedback_at, feedback_given: !!m.buyer_feedback_at };
}

async function agentOf(tenantId, id) { return db.one('SELECT id, name, license_no FROM nca_users WHERE id = :id AND tenant_id = :t', { id, t: tenantId }); }

async function availability(tenantId, leadToken) {
  const b = await bookableLead(tenantId, leadToken);
  if (b.error) return b;
  const l = b.lead, lang = l.lang === 'es' ? 'es' : 'en';
  const agent = await agentOf(tenantId, l.assigned_agent_id);
  const existing = await db.one(`SELECT * FROM nca_lead_meetings WHERE tenant_id = :t AND lead_id = :l AND status = 'booked' AND starts_at > now() ORDER BY starts_at LIMIT 1`, { t: tenantId, l: l.id });
  const list = existing ? [] : await slots(tenantId, l.assigned_agent_id);
  return { agent: agent ? { name: agent.name, license_no: agent.license_no || null } : null, existing: existing ? meetingView(existing, agent, lang) : null,
    slots: list.map((iso) => ({ starts_at: iso, label: eastern.label(new Date(iso), lang) })) };
}

function publicUrl() { return notify.publicUrl(); }
const COPY = {
  en: {
    confirm_subject: 'Your consult with BuyersLine is booked',
    confirm: (x) => [`Hi ${x.name}. Your free 30-minute consult with ${x.agent}, a licensed real estate agent, is booked for ${x.when}.`, 'Please do not visit or sign in at a builder sales office before you talk: registering with your agent first keeps your free representation.'],
    manage: 'View or cancel',
    remind_subject: (x) => `Reminder: your consult ${x.soon ? 'starts soon' : 'is tomorrow'}`,
    remind: (x) => [`Hi ${x.name}. Reminder: your consult with ${x.agent} is ${x.when}.`],
    remind_sms: (x) => `BuyersLine reminder: your consult with ${x.agent} is ${x.when}. Manage: ${x.link}`,
    feedback_subject: 'How was your consult?',
    feedback: (x) => [`Hi ${x.name}. How was your consult with ${x.agent}? Two taps help us make BuyersLine better.`],
    feedback_cta: 'Rate the consult',
    footer: 'You are receiving this because you booked a consult on BuyersLine. BuyersLine is a technology platform, not a real estate brokerage or a lender.'
  },
  es: {
    confirm_subject: 'Su consulta con BuyersLine está reservada',
    confirm: (x) => [`Hola ${x.name}. Su consulta gratuita de 30 minutos con ${x.agent}, agente de bienes raíces con licencia, está reservada para el ${x.when}.`, 'Por favor, no visite ni se registre en una oficina de ventas de una constructora antes de hablar: registrarse primero con su agente conserva su representación sin costo.'],
    manage: 'Ver o cancelar',
    remind_subject: (x) => `Recordatorio: su consulta ${x.soon ? 'empieza pronto' : 'es mañana'}`,
    remind: (x) => [`Hola ${x.name}. Recordatorio: su consulta con ${x.agent} es el ${x.when}.`],
    remind_sms: (x) => `Recordatorio de BuyersLine: su consulta con ${x.agent} es el ${x.when}. Ver: ${x.link}`,
    feedback_subject: '¿Cómo le fue en su consulta?',
    feedback: (x) => [`Hola ${x.name}. ¿Cómo le fue en su consulta con ${x.agent}? Su opinión nos ayuda a mejorar BuyersLine.`],
    feedback_cta: 'Calificar la consulta',
    footer: 'Recibe este correo porque reservó una consulta en BuyersLine. BuyersLine es una plataforma tecnológica, no una correduría de bienes raíces ni un prestamista.'
  }
};

async function book(tenantId, leadToken, startsAtIso) {
  const b = await bookableLead(tenantId, leadToken);
  if (b.error) return b;
  const l = b.lead;
  const start = new Date(String(startsAtIso || ''));
  if (isNaN(start.getTime())) return { error: 400, reason: 'bad_time' };
  const existing = await db.one(`SELECT id FROM nca_lead_meetings WHERE tenant_id = :t AND lead_id = :l AND status = 'booked' AND starts_at > now() LIMIT 1`, { t: tenantId, l: l.id });
  if (existing) return { error: 409, reason: 'already_booked' };
  const free = await slots(tenantId, l.assigned_agent_id);
  if (!free.includes(start.toISOString())) return { error: 409, reason: 'slot_unavailable' };
  let m;
  try {
    m = (await db.exec(`INSERT INTO nca_lead_meetings (tenant_id, lead_id, agent_id, token, starts_at) VALUES (:t, :l, :a, :tok, :s) RETURNING *`,
      { t: tenantId, l: l.id, a: l.assigned_agent_id, tok: token(18), s: start.toISOString() }))[0];
  } catch (e) {
    if (/unique|duplicate/i.test(String(e.message)) || (e.parent && e.parent.code === '23505')) return { error: 409, reason: 'slot_unavailable' };
    throw e;
  }
  await audit(tenantId, { type: 'buyer' }, 'meeting.booked', 'meeting', m.id, { lead_id: l.id, starts_at: m.starts_at });
  const agent = await agentOf(tenantId, l.assigned_agent_id);
  const lang = l.lang === 'es' ? 'es' : 'en', C = COPY[lang];
  const x = { name: safeFirstName(l.first_name), agent: (agent && agent.name) || (lang === 'es' ? 'nuestro agente' : 'our agent'), when: eastern.label(start, lang) };
  notify.later(notify.buyerMessage, tenantId, l.id, { action: 'email.meeting_confirmed', subjectType: 'meeting', subjectId: m.id, marketing: false,
    subject: C.confirm_subject, paragraphs: C.confirm(x), cta: { label: C.manage, url: `${publicUrl()}/meet/${m.token}` }, footer: C.footer });
  notify.later(notify.staffMessage, tenantId, l.assigned_agent_id, { action: 'email.meeting_booked', subjectType: 'meeting', subjectId: m.id,
    subject: `Consult booked: ${l.first_name}, ${eastern.label(start, 'en')}`,
    paragraphs: [`${l.first_name} booked a 30-minute consult for ${eastern.label(start, 'en')}.`, 'Buyer details and the readiness brief are in the console.'],
    cta: { label: 'Open the lead', url: `${publicUrl()}/admin/#/leads/${l.id}` } });
  return { meeting: meetingView(m, agent, lang) };
}

async function meetingByToken(tenantId, mt) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(mt || ''))) return null;
  return db.one('SELECT m.*, l.lang, l.first_name FROM nca_lead_meetings m JOIN nca_leads l ON l.id = m.lead_id AND l.tenant_id = m.tenant_id WHERE m.token = :tok AND m.tenant_id = :t', { tok: mt, t: tenantId });
}

async function publicMeeting(tenantId, mt) {
  const m = await meetingByToken(tenantId, mt);
  if (!m) return null;
  return meetingView(m, await agentOf(tenantId, m.agent_id), m.lang === 'es' ? 'es' : 'en');
}

async function cancelByBuyer(tenantId, mt) {
  const m = await meetingByToken(tenantId, mt);
  if (!m) return { error: 404 };
  const rows = await db.exec(`UPDATE nca_lead_meetings SET status = 'cancelled', updated_at = now() WHERE id = :id AND status = 'booked' AND starts_at > now() RETURNING id`, { id: m.id });
  if (!rows.length) return { error: 409, reason: 'not_cancellable' };
  await audit(tenantId, { type: 'buyer' }, 'meeting.cancelled', 'meeting', m.id, { by: 'buyer' });
  notify.later(notify.staffMessage, tenantId, m.agent_id, { action: 'email.meeting_cancelled', subjectType: 'meeting', subjectId: m.id,
    subject: `Consult cancelled: ${m.first_name}`, paragraphs: [`${m.first_name} cancelled the consult set for ${eastern.label(new Date(m.starts_at), 'en')}.`],
    cta: { label: 'Open the lead', url: `${publicUrl()}/admin/#/leads/${m.lead_id}` } });
  return { ok: true };
}

async function buyerFeedback(tenantId, mt, rating, comment) {
  const m = await meetingByToken(tenantId, mt);
  if (!m) return { error: 404 };
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return { error: 400, reason: 'rating' };
  const rows = await db.exec(`UPDATE nca_lead_meetings SET buyer_rating = :r, buyer_comment = :c, buyer_feedback_at = now(), updated_at = now()
    WHERE id = :id AND starts_at <= now() AND status IN ('booked','held') AND buyer_feedback_at IS NULL RETURNING id`, { r, c: comment ? String(comment).slice(0, 1000) : null, id: m.id });
  if (!rows.length) return { error: 409, reason: 'not_open' };
  await audit(tenantId, { type: 'buyer' }, 'meeting.buyer_feedback', 'meeting', m.id, { rating: r });
  return { ok: true };
}

const OUTCOMES = ['good_fit', 'needs_time', 'touring_scheduled', 'under_contract', 'not_a_fit', 'no_show'];

/** The agent's side after the meeting. Ownership is enforced by the route. */
async function agentUpdate(tenantId, meetingId, { status, outcome, note }) {
  const sets = [], rep = { id: meetingId, t: tenantId };
  if (status !== undefined) { if (!['held', 'no_show', 'cancelled'].includes(status)) return { error: 400, reason: 'status' }; sets.push('status = :status'); rep.status = status; }
  if (outcome !== undefined) { if (!OUTCOMES.includes(outcome)) return { error: 400, reason: 'outcome' }; sets.push('agent_outcome = :outcome', 'agent_feedback_at = now()'); rep.outcome = outcome; }
  if (note !== undefined) { sets.push('agent_note = :note'); rep.note = note ? String(note).slice(0, 2000) : null; }
  if (!sets.length) return { error: 400, reason: 'nothing' };
  await db.exec(`UPDATE nca_lead_meetings SET ${sets.join(', ')}, updated_at = now() WHERE id = :id AND tenant_id = :t`, rep);
  return { ok: true };
}

/** Reminders and feedback requests. Each row is claimed before anything is sent. */
async function tick(tenantId) {
  let n = 0;
  const lang = (m) => (m.lang === 'es' ? 'es' : 'en');
  const agentName = async (m, l) => { const a = await agentOf(tenantId, m.agent_id); return (a && a.name) || (l === 'es' ? 'nuestro agente' : 'our agent'); };
  for (const [col, window, soon] of [['reminder_24h_at', "starts_at <= now() + interval '24 hours' AND starts_at > now() + interval '3 hours'", false], ['reminder_2h_at', "starts_at <= now() + interval '2 hours' AND starts_at > now()", true]]) {
    const due = await db.exec(`UPDATE nca_lead_meetings m SET ${col} = now() FROM nca_leads l
      WHERE m.tenant_id = :t AND l.id = m.lead_id AND l.tenant_id = m.tenant_id AND m.status = 'booked' AND m.${col} IS NULL AND ${window}
      RETURNING m.*, l.lang, l.first_name`, { t: tenantId });
    for (const m of due) {
      const L = lang(m), C = COPY[L];
      const x = { name: safeFirstName(m.first_name), agent: await agentName(m, L), when: eastern.label(new Date(m.starts_at), L), soon, link: `${publicUrl()}/meet/${m.token}` };
      await notify.buyerMessage(tenantId, m.lead_id, { action: `email.meeting_${soon ? 'reminder_2h' : 'reminder_24h'}`, subjectType: 'meeting', subjectId: m.id, marketing: false,
        subject: C.remind_subject(x), paragraphs: C.remind(x), cta: { label: C.manage, url: x.link }, footer: C.footer });
      await sms.buyerSms(tenantId, m.lead_id, { action: `sms.meeting_${soon ? 'reminder_2h' : 'reminder_24h'}`, subjectType: 'meeting', subjectId: m.id, body: C.remind_sms(x) });
      n++;
    }
  }
  const after = await db.exec(`UPDATE nca_lead_meetings m SET feedback_requested_at = now() FROM nca_leads l
    WHERE m.tenant_id = :t AND l.id = m.lead_id AND l.tenant_id = m.tenant_id AND m.status IN ('booked','held') AND m.feedback_requested_at IS NULL
      AND m.starts_at + (m.duration_min || ' minutes')::interval + interval '1 hour' <= now() AND m.starts_at > now() - interval '7 days'
    RETURNING m.*, l.lang, l.first_name`, { t: tenantId });
  for (const m of after) {
    const L = lang(m), C = COPY[L];
    const x = { name: safeFirstName(m.first_name), agent: await agentName(m, L) };
    await notify.buyerMessage(tenantId, m.lead_id, { action: 'email.meeting_feedback', subjectType: 'meeting', subjectId: m.id, marketing: false,
      subject: C.feedback_subject, paragraphs: C.feedback(x), cta: { label: C.feedback_cta, url: `${publicUrl()}/meet/${m.token}` }, footer: C.footer });
    await notify.staffMessage(tenantId, m.agent_id, { action: 'email.meeting_agent_feedback', subjectType: 'meeting', subjectId: m.id,
      subject: `How did the consult with ${m.first_name} go?`, paragraphs: [`Record whether the consult with ${m.first_name} was held and what comes next. Rachel's follow-up adapts to the lead status you set.`],
      cta: { label: 'Record the outcome', url: `${publicUrl()}/admin/#/leads/${m.lead_id}` } });
    n++;
  }
  return n;
}

module.exports = { DEFAULT_HOURS, SLOT_MIN, OUTCOMES, hoursFor, setHours, slots, availability, book, publicMeeting, cancelByBuyer, buyerFeedback, agentUpdate, tick };
