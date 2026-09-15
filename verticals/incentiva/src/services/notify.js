'use strict';
/**
 * BuyersLine email (SendGrid). THE ONLY FILE IN THE VERTICAL WITH A TRANSPORT (SIT greps).
 *
 * Messages (the agents compose content; only this file sends email):
 *  - reviewerReportWaiting: a report needs approval -> the agent of record, or the admin when the
 *    buyer has no agent. Carries the report number and a console link, never the buyer's email,
 *    phone or criteria (an inbox is not the console's access control).
 *  - buyerReportReady: a report was released -> the buyer, ONLY when their stored email consent
 *    ("Email me my report...") is granted. Sent once per report.
 *
 *  - buyerMessage: Rachel's follow-ups (marketing: live email consent required at send time, one-click
 *    unsubscribe header and link) and the Scheduler's booking emails (transactional: the buyer booked).
 *  - staffMessage: hand-off alerts, meeting bookings and feedback requests to agents and the admin;
 *    never a buyer's email or phone.
 *
 * Never SMS or WhatsApp (SMS lives in sms.js). Never blocks a request: callers fire and forget, failures are logged and
 * audited. INCENTIVA_EMAIL=off turns it off; no SENDGRID_API_KEY = nothing sends.
 */
const db = require('../db');
const { audit, safeFirstName } = require('./util');

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
function publicUrl() { return (process.env.INCENTIVA_PUBLIC_URL || 'https://buyersline.app').replace(/\/+$/, ''); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function layout(title, paragraphs, cta, footer, unsubscribe) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#26213F">${esc(p)}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#F4F5F9;font-family:Mulish,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-size:22px;font-weight:900;color:#26213F;margin-bottom:18px">Buyers<span style="color:#FC4C02">Line</span></div>
<div style="background:#fff;border:1px solid #E7E8E9;border-radius:16px;padding:24px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#26213F">${esc(title)}</h1>${body}
<p style="margin:22px 0 4px"><a href="${esc(cta.url)}" style="display:inline-block;background:#26213F;color:#fff;text-decoration:none;font-weight:800;padding:12px 24px;border-radius:40px">${esc(cta.label)}</a></p>
</div>
<p style="font-size:12px;line-height:1.5;color:#5b5870;margin:16px 4px 0">${esc(footer)}</p>${unsubscribe ? `<p style="font-size:12px;margin:8px 4px 0"><a href="${esc(unsubscribe.url)}" style="color:#5b5870">${esc(unsubscribe.label)}</a></p>` : ''}
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
  const name = safeFirstName(r.first_name);
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
 * Lead flow (Ana). buyerLeadReport: the buyer's on-screen report link, ONLY with the
 * email consent stored on the lead. agentNewLead: the assigned agent, ONLY when the buyer
 * granted agent-referral consent; carries first name and area, never contact details.
 */
/** The disclaimer the owner asked for on every report surface (page, email, print). */
const REPORT_DISCLAIMER = {
  en: 'Builder promotions change daily and are subject to change without notice. BuyersLine is not a real estate agent or broker.',
  es: 'Las promociones de las constructoras cambian a diario y pueden cambiar sin previo aviso. BuyersLine no es un agente ni un corredor de bienes raíces.'
};

/** The full report as email HTML: every section of the page, figures exactly as the report service computed them. */
function reportEmailHtml(r, l, url) {
  const es = l.lang === 'es';
  const usd = (n) => n == null ? '' : '$' + Math.round(Number(n)).toLocaleString('en-US');
  const T = es
    ? { hi: 'Hola', intro: 'Aquí está su informe de BuyersLine.', wish: 'Lo que usted pidió', area: 'Zona', price: 'Precio máximo', monthly: 'Pago mensual máximo', down: 'Pago inicial', timeline: 'Plazo', financing: 'Forma de pago', skipped: 'No indicado',
      pp: 'Poder de compra', builders: 'Promociones de hoy por constructora', builder: 'Constructora', promo: 'Promoción de hoy', best: 'Mejor oferta hoy', lowest: 'Precio más bajo disponible', ppsf: 'Precio por pie cuadrado (mediana)', schools: 'Calificaciones escolares', homes: 'Casas en su rango de precio',
      none_found: 'No se encontró una promoción actual en esta zona hoy.', not_checked: 'No se pudieron revisar las promociones hoy; lo intentaremos de nuevo mañana temprano.', checking: 'Revisando ahora.', no_promo: 'Comunidades activas sin promoción publicada.',
      view: 'Ver el informe completo', schools_none: 'Aún no hay calificaciones escolares oficiales para esta zona.', fit: 'Ajuste' }
    : { hi: 'Hi', intro: 'Here is your BuyersLine report.', wish: 'Your wish list', area: 'Area', price: 'Maximum price', monthly: 'Maximum monthly payment', down: 'Down payment', timeline: 'Timeframe', financing: 'Paying with', skipped: 'Not given',
      pp: 'Purchasing power', builders: "Today's promotions by builder", builder: 'Builder', promo: "Today's promotion", best: 'Best deal today', lowest: 'Lowest price available', ppsf: 'Price per square foot (median)', schools: 'School ratings', homes: 'Homes at your price point',
      none_found: 'No current promotion found in this area today.', not_checked: "Promotions could not be checked today; we try again early tomorrow.", checking: 'Checking now.', no_promo: 'Active communities, no promotion published.',
      view: 'View the full report', schools_none: 'No official school ratings for this area yet.', fit: 'Fit' };
  const TL = es ? { '0_3m': 'En 3 meses', '3_6m': '3 a 6 meses', '6_12m': '6 a 12 meses', '12m_plus': 'Más de 12 meses' } : { '0_3m': 'Within 3 months', '3_6m': '3 to 6 months', '6_12m': '6 to 12 months', '12m_plus': 'More than 12 months' };
  const FIN = es ? { preapproved: 'Preaprobado', cash: 'De contado', needs_lender: 'Ninguno todavía', va: 'VA', fha: 'FHA', unsure: 'No sé' } : { preapproved: 'Pre-approved', cash: 'Cash', needs_lender: 'Neither yet', va: 'VA', fha: 'FHA', unsure: 'Not sure' };
  const h2 = (t) => `<h2 style="margin:22px 0 8px;font-size:17px;color:#26213F">${esc(t)}</h2>`;
  const p = (t, small) => `<p style="margin:0 0 8px;font-size:${small ? 13 : 15}px;line-height:1.5;color:${small ? '#5b5870' : '#26213F'}">${esc(t)}</p>`;
  const td = 'style="padding:6px 8px;border-top:1px solid #E7E8E9;font-size:13px;vertical-align:top;color:#26213F"';
  const w = r.wish;
  let html = p(`${T.hi} ${safeFirstName(l.first_name)}.`.replace(' .', '.')) + p(T.intro);
  html += h2(T.wish) + `<table style="border-collapse:collapse;width:100%">${[[T.area, w.area], [T.price, w.max_price ? usd(w.max_price) : T.skipped], [T.monthly, w.max_monthly ? usd(w.max_monthly) : T.skipped], [T.down, w.down_payment != null ? usd(w.down_payment) : T.skipped], [T.timeline, TL[w.move_timeline] || T.skipped], [T.financing, FIN[w.financing_type] || T.skipped]].map(([k, v]) => `<tr><td ${td}>${esc(k)}</td><td ${td}><strong>${esc(v)}</strong></td></tr>`).join('')}</table>`;
  const pp = r.purchasing_power;
  html += h2(T.pp);
  if (pp.basis === 'monthly' && pp.price_supported) html += p(es ? `Un pago de ${usd(pp.monthly)} al mes compra hasta unos ${usd(pp.price_supported)}. Con un límite de ${pp.dti_cap_pct}% del ingreso bruto para todas sus deudas, incluida la casa nueva, ese pago requiere un ingreso anual de al menos ${usd(pp.income_needed_annual)} si no tiene otras deudas.` : `A payment of ${usd(pp.monthly)} a month buys up to about ${usd(pp.price_supported)}. With all monthly debts, including the new home, capped at ${pp.dti_cap_pct}% of gross income, that payment needs a yearly income of at least ${usd(pp.income_needed_annual)} if you have no other debts.`);
  else if (pp.basis === 'price' && pp.monthly_for_price) html += p(es ? `Una casa de ${usd(w.max_price)} cuesta desde ${usd(pp.monthly_for_price)} al mes (sin HOA ni CDD).` + (pp.income_needed_annual ? ` Con el límite de ${pp.dti_cap_pct}%, requiere un ingreso anual de al menos ${usd(pp.income_needed_annual)} si no tiene otras deudas.` : '') : `A ${usd(w.max_price)} home costs from ${usd(pp.monthly_for_price)} a month (before HOA and CDD).` + (pp.income_needed_annual ? ` With the ${pp.dti_cap_pct}% ceiling, that needs a yearly income of at least ${usd(pp.income_needed_annual)} if you have no other debts.` : ''));
  else html += p(es ? 'Agregue un precio o un pago mensual en su informe para ver su poder de compra.' : 'Add a price or monthly payment on your report to see your purchasing power.');
  if (pp.rate != null) html += p((es ? `Tasa de referencia ${pp.rate}%` : `Reference rate ${pp.rate}%`) + (pp.rate_as_of ? ` (${pp.rate_as_of})` : '') + (es ? '. Es una estimación, no una aprobación de préstamo.' : '. An estimate, not a loan approval.'), true);
  html += h2(T.builders) + `<table style="border-collapse:collapse;width:100%"><tr><th align="left" ${td}>${esc(T.builder)}</th><th align="left" ${td}>${esc(T.promo)}</th></tr>` + r.builders.map((b) => {
    const promo = b.status === 'found' ? [b.promotion, b.rate, b.closing_credit].filter(Boolean).join(' · ') + (b.community ? ` (${b.community})` : '') : b.status === 'no_promotion' ? T.no_promo : b.status === 'checking' ? T.checking : b.status === 'not_checked' ? T.not_checked : T.none_found;
    return `<tr><td ${td}><strong>${esc(b.builder)}</strong>${b.lowest_starting_price ? `<br><span style="color:#5b5870">${es ? 'Desde' : 'From'} ${usd(b.lowest_starting_price)}</span>` : ''}</td><td ${td}>${esc(promo)}${(b.notes || []).length ? `<br><span style="color:#5b5870">${esc(b.notes.join(' '))}</span>` : ''}</td></tr>`;
  }).join('') + '</table>';
  if (r.best_deal && r.best_deal.row) { const b = r.best_deal.row; html += h2(T.best) + p(`${b.community || b.builder} · ${b.builder}${b.starting_price ? ' · ' + b.starting_price : ''}`) + (b.promotion ? p(b.promotion) : '') + p(`${T.fit}: ${b.fit.score}/100`, true); }
  const m = r.market || {};
  if (m.lowest_price || (r.lowest_community && r.lowest_community.starting_price_usd)) {
    html += h2(T.lowest);
    if (m.lowest_price) html += p(`${usd(m.lowest_price)}${es ? ' en casas nuevas listadas a menos de ' : ' among new homes listed within '}${m.radius_miles} ${es ? 'millas' : 'miles'}.`);
    if (r.lowest_community && r.lowest_community.starting_price_usd) html += p(`${r.lowest_community.community || r.lowest_community.builder}: ${r.lowest_community.starting_price}`);
    if (m.median_price_per_sqft) html += p(`${T.ppsf}: $${m.median_price_per_sqft}`);
  }
  html += h2(T.schools) + ((r.schools || []).filter((x) => x.rating).length ? r.schools.filter((x) => x.rating).map((x) => p(`${x.name}: ${x.rating}${x.rating_source ? ' (' + x.rating_source + ')' : ''}`)).join('') : p(T.schools_none, true));
  if ((r.homes || []).length) {
    html += h2(`${T.homes} (${r.homes.length})`) + `<table style="border-collapse:collapse;width:100%">` + r.homes.slice(0, 25).map((x) => `<tr><td ${td}>${esc(x.address || '')}<br><span style="color:#5b5870">${[x.beds ? x.beds + (es ? ' hab' : ' bd') : '', x.baths ? x.baths + (es ? ' baños' : ' ba') : '', x.sqft ? x.sqft.toLocaleString('en-US') + ' sqft' : ''].filter(Boolean).join(' · ')}</span></td><td ${td} align="right"><strong>${usd(x.price)}</strong><br><span style="color:#5b5870">${T.fit} ${x.fit.score}</span></td></tr>`).join('') + '</table>';
    if (r.homes.length > 25) html += p(es ? `Vea las ${r.homes.length} casas en el informe completo.` : `See all ${r.homes.length} homes in the full report.`, true);
  }
  html += `<p style="margin:22px 0 4px"><a href="${esc(url)}" style="display:inline-block;background:#26213F;color:#fff;text-decoration:none;font-weight:800;padding:12px 24px;border-radius:40px">${esc(T.view)}</a></p>`;
  html += `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#26213F;background:#FFF4EC;border-radius:10px;padding:10px 12px">${esc(REPORT_DISCLAIMER[es ? 'es' : 'en'])}</p>`;
  return html;
}

async function buyerLeadReport(tenantId, leadId) {
  const l = await db.one('SELECT id, token, lang, first_name, email, search_id FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  if (!l || !l.email) return { sent: false, reason: 'no_email' };
  const c = await db.one(`SELECT granted, revoked_at FROM nca_lead_consents WHERE tenant_id = :t AND lead_id = :l AND channel = 'email' ORDER BY id DESC LIMIT 1`, { t: tenantId, l: leadId });
  if (!c || c.granted !== true || c.revoked_at) return { sent: false, reason: 'no_email_consent' };
  const es = l.lang === 'es';
  const search = l.search_id ? await db.one('SELECT * FROM nca_searches WHERE id = :id AND tenant_id = :t', { id: l.search_id, t: tenantId }) : null;
  const subject = es ? 'Su informe de BuyersLine' : 'Your BuyersLine report';
  const footer = es
    ? 'Recibe este correo porque creó su informe en BuyersLine. Puede darse de baja cuando quiera respondiendo a este correo. BuyersLine es una plataforma tecnológica, no una correduría de bienes raíces ni un prestamista.'
    : 'You are receiving this because you created your report on BuyersLine. You can unsubscribe at any time by replying to this email. BuyersLine is a technology platform, not a real estate brokerage or a lender.';
  if (search) {
    const url = `${publicUrl()}/?report=${search.token}&lang=${es ? 'es' : 'en'}#intake`;
    const report = await require('./searchReport').buildReport(tenantId, search, { lang: l.lang });
    const inner = reportEmailHtml(report, l, url);
    const html = `<!doctype html><html><body style="margin:0;background:#F4F5F9;font-family:Mulish,Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:28px 16px">
<div style="font-size:22px;font-weight:900;color:#26213F;margin-bottom:18px">Buyers<span style="color:#FC4C02">Line</span></div>
<div style="background:#fff;border:1px solid #E7E8E9;border-radius:16px;padding:22px"><h1 style="margin:0 0 12px;font-size:22px;color:#26213F">${esc(subject)}</h1>${inner}</div>
<p style="font-size:12px;line-height:1.5;color:#5b5870;margin:16px 4px 0">${esc(footer)}</p></div></body></html>`;
    const text = [`${es ? 'Hola' : 'Hi'} ${safeFirstName(l.first_name)}.`.replace(' .', '.'), es ? 'Su informe de BuyersLine está listo.' : 'Your BuyersLine report is ready.', `${es ? 'Ver el informe' : 'View the report'}: ${url}`, REPORT_DISCLAIMER[es ? 'es' : 'en'], footer].join('\n\n');
    return deliver(tenantId, 'email.buyer_lead_report', l.id, { to: l.email, subject, html, text }, 'lead');
  }
  const url = `${publicUrl()}/?lead=${l.token}&lang=${es ? 'es' : 'en'}#intake`;
  const paragraphs = es
    ? [`Hola ${safeFirstName(l.first_name)}.`.replace(' .', '.'), 'Aquí tiene su informe con las promociones que encontramos para su zona.', REPORT_DISCLAIMER.es]
    : [`Hi ${safeFirstName(l.first_name)}.`.replace(' .', '.'), 'Here is your report with the promotions we found for your area.', REPORT_DISCLAIMER.en];
  const cta = { label: es ? 'Ver mi informe' : 'View my report', url };
  return deliver(tenantId, 'email.buyer_lead_report', l.id, { to: l.email, subject, html: layout(subject, paragraphs, cta, footer), text: paragraphs.join('\n\n') + `\n\n${cta.label}: ${url}\n\n${footer}` }, 'lead');
}

async function agentNewLead(tenantId, leadId) {
  const l = await db.one('SELECT id, first_name, city, zip, county, referral_consent, assigned_agent_id, readiness_score, readiness_tier, agent_brief, agent_opening FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  if (!l || l.referral_consent !== true || !l.assigned_agent_id) return { sent: false, reason: 'no_referral_consent_or_agent' };
  const agent = await db.one(`SELECT email FROM nca_users WHERE id = :id AND tenant_id = :t AND active = true`, { id: l.assigned_agent_id, t: tenantId });
  if (!agent) return { sent: false, reason: 'no_agent' };
  const area = [l.city, l.zip].filter(Boolean).join(' ') || 'their area';
  const tier = l.readiness_tier && l.readiness_tier !== 'none' ? `${l.readiness_tier[0].toUpperCase()}${l.readiness_tier.slice(1)} (${l.readiness_score})` : null;
  const subject = `${tier ? tier.split(' ')[0] + ' lead' : 'New BuyersLine lead'}: ${l.first_name} in ${area}`;
  const paragraphs = [`${l.first_name} finished the BuyersLine intake for ${area} and agreed to be contacted by a licensed agent.`];
  if (tier) paragraphs.push(`Readiness: ${tier}.`);
  if (l.agent_brief) paragraphs.push(l.agent_brief);
  if (l.agent_opening) paragraphs.push(`Suggested opening: ${l.agent_opening}`);
  paragraphs.push('Contact details, consent records and sources are in the console, not in this email.');
  const cta = { label: 'Open the lead', url: `${publicUrl()}/admin/#/leads/${l.id}` };
  return deliver(tenantId, 'email.agent_new_lead_' + l.assigned_agent_id, l.id, { to: agent.email, subject, html: layout(subject, paragraphs, cta, 'BuyersLine agent console notification.'), text: paragraphs.join('\n\n') + `\n\n${cta.label}: ${cta.url}` }, 'lead');
}

async function leadEmailConsent(tenantId, leadId, { confirmed = false } = {}) {
  const c = await db.one(`SELECT granted, revoked_at, confirmed_at FROM nca_lead_consents WHERE tenant_id = :t AND lead_id = :l AND channel = 'email' ORDER BY id DESC LIMIT 1`, { t: tenantId, l: leadId });
  return !!(c && c.granted === true && !c.revoked_at && (!confirmed || c.confirmed_at));
}

/**
 * A message to a buyer composed by Rachel or the Scheduler. marketing=true (follow-ups) requires the
 * buyer's live email consent at send time and carries one-click unsubscribe. marketing=false is only
 * for messages about a meeting the buyer booked.
 */
async function buyerMessage(tenantId, leadId, m) {
  const l = await db.one('SELECT id, email, agent_agreement_signed FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  if (!l || !l.email || l.agent_agreement_signed) return { sent: false, reason: 'no_email' };
  if (m.marketing !== false && !(await leadEmailConsent(tenantId, leadId))) return { sent: false, reason: 'no_email_consent' };
  // Marketing mail goes only to an address the buyer confirmed by opening their emailed report link.
  if (m.marketing !== false && !(await leadEmailConsent(tenantId, leadId, { confirmed: true }))) return { sent: false, reason: 'email_not_confirmed' };
  const headers = m.unsubscribe ? { 'List-Unsubscribe': `<${m.unsubscribe.oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
  const text = m.paragraphs.join('\n\n') + (m.cta ? `\n\n${m.cta.label}: ${m.cta.url}` : '') + `\n\n${m.footer}` + (m.unsubscribe ? `\n\n${m.unsubscribe.label}: ${m.unsubscribe.url}` : '');
  return deliver(tenantId, m.action, m.subjectId, Object.assign({ to: l.email, subject: m.subject, html: layout(m.subject, m.paragraphs, m.cta, m.footer, m.unsubscribe), text }, headers ? { headers } : {}), m.subjectType);
}

/** A message to a staff account (the agent by id, or every active admin). Never carries buyer contact details. */
async function staffMessage(tenantId, to, m) {
  const users = to === 'admin'
    ? await db.q(`SELECT id, email FROM nca_users WHERE tenant_id = :t AND role = 'admin' AND active = true`, { t: tenantId })
    : await db.q(`SELECT id, email FROM nca_users WHERE tenant_id = :t AND id = :id AND active = true`, { t: tenantId, id: Number(to) || 0 });
  if (!users.length) return { sent: false, reason: 'no_recipient' };
  let sent = 0;
  for (const u of users) {
    const r = await deliver(tenantId, m.action + '_' + u.id, m.subjectId, { to: u.email, subject: m.subject, html: layout(m.subject, m.paragraphs, m.cta, 'BuyersLine agent console notification.'), text: m.paragraphs.join('\n\n') + (m.cta ? `\n\n${m.cta.label}: ${m.cta.url}` : '') }, m.subjectType);
    if (r.sent) sent++;
  }
  return { sent: sent > 0 };
}

/** SME knowledge capture: a single-use sign-in link (30 minutes) to an SME account's own address. */
async function smeMagicLink(tenantId, userId, linkId, url, lang) {
  const u = await db.one(`SELECT id, name, email FROM nca_sme_users WHERE id = :id AND tenant_id = :t AND status = 'active'`, { id: userId, t: tenantId });
  if (!u) return { sent: false, reason: 'no_account' };
  const es = lang === 'es';
  const subject = es ? 'Su enlace para entrar a BuyersLine' : 'Your BuyersLine sign-in link';
  const paragraphs = es
    ? ['Use este enlace para entrar a su cuestionario de BuyersLine. Funciona una sola vez y vence en 30 minutos.', 'Si usted no lo pidió, ignore este correo.']
    : ['Use this link to open your BuyersLine questionnaire. It works once and expires in 30 minutes.', 'If you did not ask for it, ignore this email.'];
  const cta = { label: es ? 'Entrar' : 'Sign in', url };
  return deliver(tenantId, 'email.sme_magic_link_' + linkId, u.id, { to: u.email, subject, html: layout(subject, paragraphs, cta, 'BuyersLine'), text: paragraphs.join('\n\n') + `\n\n${cta.label}: ${url}` }, 'sme_user');
}

/* ---------- Private-preview logins (archgate.js). Sent through the same SendGrid sender. ---------- */

/** To the owner: someone created a login and it is waiting for approval. Carries the email only. */
async function siteLoginRequested(tenantId, account, ownerEmail) {
  const to = String(process.env.INCENTIVA_SITE_APPROVER_EMAILS || ownerEmail || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!to.length) return { sent: false, reason: 'no_approver' };
  const subject = 'BuyersLine login waiting for approval';
  const paragraphs = [`${account.email} created a login for the BuyersLine.`, 'It cannot sign in until you approve it.'];
  const cta = { label: 'Review logins', url: `${publicUrl()}/gate/accounts` };
  return deliver(tenantId, 'email.site_login_requested', account.id, { to, subject, html: layout(subject, paragraphs, cta, 'BuyersLine.'), text: paragraphs.join('\n\n') + `\n\n${cta.label}: ${cta.url}` }, 'site_user');
}

async function siteLoginApproved(tenantId, account) {
  const subject = 'Your BuyersLine login is approved';
  const paragraphs = ['Your login for BuyersLine is approved. Sign in with the email and password you chose.'];
  const cta = { label: 'Sign in', url: `${publicUrl()}/gate/login` };
  return deliver(tenantId, 'email.site_login_approved', account.id, { to: account.email, subject, html: layout(subject, paragraphs, cta, 'BuyersLine.'), text: paragraphs.join('\n\n') + `\n\n${cta.label}: ${cta.url}` }, 'site_user');
}

async function sitePasswordReset(tenantId, account, token) {
  const subject = 'Reset your BuyersLine password';
  const paragraphs = ['Use this link to choose a new password. It works once and expires in one hour.', 'If you did not ask for it, ignore this email; your password stays the same.'];
  const cta = { label: 'Choose a new password', url: `${publicUrl()}/gate/reset?t=${encodeURIComponent(token)}` };
  return deliver(tenantId, 'email.site_password_reset_' + Date.now().toString(36), account.id, { to: account.email, subject, html: layout(subject, paragraphs, cta, 'BuyersLine.'), text: paragraphs.join('\n\n') + `\n\n${cta.label}: ${cta.url}` }, 'site_user');
}

/** Fire and forget: never let email delay or fail a buyer or agent request. */
function later(fn, ...args) { setImmediate(() => { fn(...args).catch((e) => console.error('[incentiva] email', e.message)); }); }

function _setSender(fn) { sender = fn; }

module.exports = { siteLoginRequested, siteLoginApproved, sitePasswordReset, REPORT_DISCLAIMER, reportEmailHtml, smeMagicLink, configured, buyerReportReady, reviewerReportWaiting, buyerLeadReport, agentNewLead, buyerMessage, staffMessage, leadEmailConsent, publicUrl, later, _setSender };
