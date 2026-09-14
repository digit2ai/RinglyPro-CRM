'use strict';
/**
 * BuyersLine email (SendGrid). THE ONLY FILE IN THE VERTICAL WITH A TRANSPORT (SIT greps).
 *
 * Four messages, nothing else (two for reports, two for Martha leads below):
 *  - reviewerReportWaiting: a report needs approval -> the agent of record, or the admin when the
 *    buyer has no agent. Carries the report number and a console link, never the buyer's email,
 *    phone or criteria (an inbox is not the console's access control).
 *  - buyerReportReady: a report was released -> the buyer, ONLY when their stored email consent
 *    ("Email me my report...") is granted. Sent once per report.
 *
 * Never SMS or WhatsApp. Never blocks a request: callers fire and forget, failures are logged and
 * audited. INCENTIVA_EMAIL=off turns it off; no SENDGRID_API_KEY = nothing sends.
 */
const db = require('../db');
const { audit } = require('./util');

let sender = null; // replaceable in SIT via _setSender
function realSender() {
  const sg = require('@sendgrid/mail');
  sg.setApiKey(process.env.SENDGRID_API_KEY);
  return (msg) => sg.send(msg);
}

function configured() {
  return process.env.INCENTIVA_EMAIL !== 'off' && (!!sender || !!process.env.SENDGRID_API_KEY);
}
function fromAddress() {
  return { email: process.env.INCENTIVA_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'info@digit2ai.com', name: process.env.INCENTIVA_FROM_NAME || 'BuyersLine' };
}
function publicUrl() { return (process.env.INCENTIVA_PUBLIC_URL || 'https://aiagent.ringlypro.com/buyersline').replace(/\/+$/, ''); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function layout(title, paragraphs, cta, footer) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#26213F">${esc(p)}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#F4F5F9;font-family:Mulish,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-size:22px;font-weight:900;color:#26213F;margin-bottom:18px">Buyers<span style="color:#FC4C02">Line</span></div>
<div style="background:#fff;border:1px solid #E7E8E9;border-radius:16px;padding:24px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#26213F">${esc(title)}</h1>${body}
<p style="margin:22px 0 4px"><a href="${esc(cta.url)}" style="display:inline-block;background:#26213F;color:#fff;text-decoration:none;font-weight:800;padding:12px 24px;border-radius:40px">${esc(cta.label)}</a></p>
</div>
<p style="font-size:12px;line-height:1.5;color:#5b5870;margin:16px 4px 0">${esc(footer)}</p>
</div></body></html>`;
}

async function alreadySent(tenantId, action, reportId, subjectType = 'report') {
  return !!(await db.one(`SELECT id FROM nca_audit_log WHERE tenant_id = :t AND action = :a AND subject_type = :st AND subject_id = :r LIMIT 1`, { t: tenantId, a: action, st: subjectType, r: reportId }));
}

async function deliver(tenantId, action, reportId, msg, subjectType = 'report') {
  if (!configured()) return { sent: false, reason: 'not_configured' };
  if (await alreadySent(tenantId, action, reportId, subjectType)) return { sent: false, reason: 'already_sent' };
  try {
    if (!sender) sender = realSender();
    await sender(Object.assign({ from: fromAddress() }, msg));
    await audit(tenantId, { type: 'system' }, action, subjectType, reportId, { to_domain: String(msg.to).split('@')[1] || null });
    return { sent: true };
  } catch (e) {
    const detail = (e.response && e.response.body && JSON.stringify(e.response.body.errors || e.response.body).slice(0, 300)) || e.message;
    console.error('[incentiva] email failed:', action, detail);
    await audit(tenantId, { type: 'system' }, action + '_failed', subjectType, reportId, { error: String(detail).slice(0, 300) });
    return { sent: false, reason: 'error' };
  }
}

async function buyerReportReady(tenantId, reportId) {
  const r = await db.one(`SELECT r.id, r.token, r.language, r.status, b.id AS buyer_id, b.first_name, b.email
    FROM nca_reports r JOIN nca_buyers b ON b.id = r.buyer_id AND b.tenant_id = r.tenant_id
    WHERE r.id = :id AND r.tenant_id = :t`, { id: reportId, t: tenantId });
  if (!r || r.status !== 'ready' || !r.email) return { sent: false, reason: 'not_ready_or_no_email' };
  const consent = await db.one(`SELECT granted FROM nca_consents WHERE tenant_id = :t AND buyer_id = :b AND channel = 'email' ORDER BY id DESC LIMIT 1`, { t: tenantId, b: r.buyer_id });
  if (!consent || consent.granted !== true) return { sent: false, reason: 'no_email_consent' };
  const es = r.language === 'es';
  const url = `${publicUrl()}/r/${r.token}?lang=${es ? 'es' : 'en'}`;
  const name = r.first_name || '';
  const subject = es ? 'Su informe de BuyersLine está listo' : 'Your BuyersLine report is ready';
  const paragraphs = es
    ? [`Hola ${name}.`, 'Su informe de casas nuevas está listo. Incluye su poder de compra y las comunidades que coinciden con lo que busca.', 'Antes de visitar cualquier oficina de ventas, hable primero con nuestro agente, para conservar su representación sin costo para usted.']
    : [`Hi ${name}.`, 'Your new-home report is ready. It includes your buying power and the communities that match what you are looking for.', 'Before you visit any sales office, talk to our agent first, so you keep your representation at no cost to you.'];
  const footer = es
    ? 'Recibe este correo porque pidió su informe en BuyersLine y aceptó recibirlo por correo. BuyersLine es una plataforma tecnológica, no una correduría de bienes raíces ni un prestamista.'
    : 'You are receiving this because you requested your report on BuyersLine and agreed to receive it by email. BuyersLine is a technology platform, not a real estate brokerage or a lender.';
  const cta = { label: es ? 'Ver mi informe' : 'View my report', url };
  return deliver(tenantId, 'email.buyer_report_ready', r.id, {
    to: r.email, subject, html: layout(subject, paragraphs, cta, footer),
    text: paragraphs.join('\n\n') + `\n\n${cta.label}: ${url}\n\n${footer}`
  });
}

async function reviewerReportWaiting(tenantId, reportId) {
  const r = await db.one(`SELECT r.id, r.report_no, r.status, r.agent_id, b.first_name FROM nca_reports r
    JOIN nca_buyers b ON b.id = r.buyer_id AND b.tenant_id = r.tenant_id WHERE r.id = :id AND r.tenant_id = :t`, { id: reportId, t: tenantId });
  if (!r || !['pending_review', 'compliance_hold'].includes(r.status)) return { sent: false, reason: 'not_waiting' };
  const to = r.agent_id
    ? await db.one(`SELECT email FROM nca_users WHERE id = :id AND tenant_id = :t AND active = true`, { id: r.agent_id, t: tenantId })
    : await db.one(`SELECT email FROM nca_users WHERE tenant_id = :t AND role = 'admin' AND active = true ORDER BY id LIMIT 1`, { t: tenantId });
  if (!to) return { sent: false, reason: 'no_reviewer' };
  const hold = r.status === 'compliance_hold';
  const subject = hold ? `Report ${r.report_no} is on compliance hold` : `Report ${r.report_no} is waiting for your approval`;
  const paragraphs = [
    hold ? `A report for ${r.first_name || 'a buyer'} was held by the compliance check and needs review before anything reaches the buyer.`
      : `A new report for ${r.first_name || 'a buyer'} passed the compliance check and is waiting for your approval. The buyer sees it only after you approve it.`,
    'Buyer details are in the console, not in this email.'
  ];
  const cta = { label: 'Open the console', url: `${publicUrl()}/admin/` };
  const footer = 'BuyersLine agent console notification.';
  return deliver(tenantId, hold ? 'email.reviewer_compliance_hold' : 'email.reviewer_report_waiting', r.id, {
    to: to.email, subject, html: layout(subject, paragraphs, cta, footer), text: paragraphs.join('\n\n') + `\n\n${cta.label}: ${cta.url}`
  });
}

/**
 * Lead flow (Martha). buyerLeadReport: the buyer's on-screen report link, ONLY with the
 * email consent stored on the lead. agentNewLead: the assigned agent, ONLY when the buyer
 * granted agent-referral consent; carries first name and area, never contact details.
 */
async function buyerLeadReport(tenantId, leadId) {
  const l = await db.one('SELECT id, token, lang, first_name, email FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  if (!l || !l.email) return { sent: false, reason: 'no_email' };
  const c = await db.one(`SELECT granted, revoked_at FROM nca_lead_consents WHERE tenant_id = :t AND lead_id = :l AND channel = 'email' ORDER BY id DESC LIMIT 1`, { t: tenantId, l: leadId });
  if (!c || c.granted !== true || c.revoked_at) return { sent: false, reason: 'no_email_consent' };
  const es = l.lang === 'es';
  const url = `${publicUrl()}/?lead=${l.token}&lang=${es ? 'es' : 'en'}#intake`;
  const subject = es ? 'Su informe de BuyersLine' : 'Your BuyersLine report';
  const paragraphs = es
    ? [`Hola ${l.first_name || ''}.`, 'Aquí tiene su informe con las comunidades que eligió y las promociones que encontramos para su zona.', 'Antes de visitar cualquier oficina de ventas: muchas constructoras solo trabajan con el agente del comprador que lo registra antes de su primera visita. Hable primero con nuestro agente, para conservar su representación sin costo para usted.']
    : [`Hi ${l.first_name || ''}.`, 'Here is your report with the communities you chose and the promotions we found for your area.', 'Before you visit any sales office: many builders only work with a buyer\'s agent who registers you before your first visit. Talk to our agent first, so you keep your representation at no cost to you.'];
  const footer = es
    ? 'Recibe este correo porque pidió su informe en BuyersLine y aceptó recibirlo por correo. Puede darse de baja cuando quiera respondiendo a este correo. BuyersLine es una plataforma tecnológica, no una correduría de bienes raíces ni un prestamista.'
    : 'You are receiving this because you asked for your report on BuyersLine and agreed to receive it by email. You can unsubscribe at any time by replying to this email. BuyersLine is a technology platform, not a real estate brokerage or a lender.';
  const cta = { label: es ? 'Ver mi informe' : 'View my report', url };
  return deliver(tenantId, 'email.buyer_lead_report', l.id, { to: l.email, subject, html: layout(subject, paragraphs, cta, footer), text: paragraphs.join('\n\n') + `\n\n${cta.label}: ${url}\n\n${footer}` }, 'lead');
}

async function agentNewLead(tenantId, leadId) {
  const l = await db.one('SELECT id, first_name, city, zip, county, referral_consent, assigned_agent_id FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  if (!l || l.referral_consent !== true || !l.assigned_agent_id) return { sent: false, reason: 'no_referral_consent_or_agent' };
  const agent = await db.one(`SELECT email FROM nca_users WHERE id = :id AND tenant_id = :t AND active = true`, { id: l.assigned_agent_id, t: tenantId });
  if (!agent) return { sent: false, reason: 'no_agent' };
  const area = [l.city, l.zip].filter(Boolean).join(' ') || 'their area';
  const subject = `New BuyersLine lead: ${l.first_name} in ${area}`;
  const paragraphs = [`${l.first_name} finished the BuyersLine intake for ${area} and agreed to be contacted by a licensed agent.`, 'Criteria, chosen communities, representation status and consent records are in the console. Contact details are not in this email.'];
  const cta = { label: 'Open the lead', url: `${publicUrl()}/admin/#/leads/${l.id}` };
  return deliver(tenantId, 'email.agent_new_lead_' + l.assigned_agent_id, l.id, { to: agent.email, subject, html: layout(subject, paragraphs, cta, 'BuyersLine agent console notification.'), text: paragraphs.join('\n\n') + `\n\n${cta.label}: ${cta.url}` }, 'lead');
}

/** Fire and forget: never let email delay or fail a buyer or agent request. */
function later(fn, ...args) { setImmediate(() => { fn(...args).catch((e) => console.error('[incentiva] email', e.message)); }); }

function _setSender(fn) { sender = fn; }

module.exports = { configured, buyerReportReady, reviewerReportWaiting, buyerLeadReport, agentNewLead, later, _setSender };
