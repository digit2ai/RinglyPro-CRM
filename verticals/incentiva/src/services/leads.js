'use strict';

/**
 * Ana's conversational intake -> a lead.
 *
 * Invariants (SIT asserts each):
 *  - The consent text stored is the SERVER's wording for LEAD_CONSENT_VERSION in the
 *    buyer's language, never text a client sent. Each channel is its own row with the
 *    timestamp, raw IP and user agent (consent evidence; console-only).
 *  - SMS consent without a phone number is stored as not granted.
 *  - A buyer who signed an agreement with another agent is not solicited: the lead keeps
 *    a first name and criteria only (no email, no phone), every consent is stored as not
 *    granted, status is 'lost', and no agent is notified.
 *  - Selections must be visible rows of the research run the lead points at.
 *  - Without agent-referral consent the lead has no assigned agent and nobody is
 *    notified; the console marks it "Report only - no outreach consent".
 *  - A lead's public view (by token) never carries source URLs, check dates, the IP,
 *    or any other lead's data.
 */

const db = require('../db');
const { token, audit, clampStr, numOrNull } = require('./util');
const { t } = require('../engines/i18n');

const LEAD_CONSENT_VERSION = 'lead-v1-2026-09-14';
const TIMELINE = ['0_3m', '3_6m', '6_12m', '12m_plus'];
const FINANCING = ['preapproved', 'cash', 'needs_lender', 'va', 'fha', 'unsure'];
const HAS_AGENT = ['no', 'yes_under_agreement', 'yes_informal'];
const STATUSES = ['new', 'contacted', 'working', 'closed', 'lost'];

function leadConsentTexts(lang, agent) {
  const l = lang === 'es' ? 'es' : 'en';
  let referral = t(l, 'consent.share_unnamed');
  if (agent && agent.co_owner && agent.name) referral += ' ' + t(l, 'consent.co_owner', { agent: agent.name });
  return {
    version: LEAD_CONSENT_VERSION,
    email: t(l, 'consent.email'),
    sms: t(l, 'consent.sms'),
    agent_referral: referral
  };
}

function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 64) || null;
}

/** Validate the submitted conversation. Returns { value } or { missing, errors }. */
function validateLead(body) {
  const b = body && typeof body === 'object' ? body : {};
  const a = b.answers && typeof b.answers === 'object' ? b.answers : {};
  const missing = [], errors = [];
  const firstName = clampStr(a.first_name, 120);
  const underAgreement = a.has_agent === 'yes_under_agreement';
  const email = clampStr(a.email, 200);
  const phoneRaw = clampStr(a.phone, 40);
  const phoneDigits = phoneRaw ? phoneRaw.replace(/[^\d]/g, '') : '';
  const area = a.area && typeof a.area === 'object' ? a.area : {};
  const maxPrice = numOrNull(a.max_price);

  if (!clampStr(area.input, 200) && !area.zip) missing.push('area');
  if (area.zip && !/^\d{5}$/.test(String(area.zip))) errors.push('area');
  if (!(maxPrice > 0)) missing.push('max_price');
  else if (maxPrice < 50000 || maxPrice > 20000000) errors.push('max_price');
  const maxMonthly = numOrNull(a.max_monthly);
  if (maxMonthly !== null && !(maxMonthly >= 300 && maxMonthly <= 50000)) errors.push('max_monthly');
  const down = numOrNull(a.down_payment);
  if (down !== null && !(down >= 0 && down <= 10000000)) errors.push('down_payment');
  if (!TIMELINE.includes(a.move_timeline)) missing.push('move_timeline');
  if (!FINANCING.includes(a.financing_type)) missing.push('financing_type');
  if (!firstName) missing.push('first_name');
  if (!email) missing.push('email');
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('email');
  if (phoneRaw && !(phoneDigits.length === 10 || (phoneDigits.length === 11 && phoneDigits[0] === '1'))) errors.push('phone');
  if (!HAS_AGENT.includes(a.has_agent)) missing.push('has_agent');
  const runToken = clampStr(b.research_token, 40);
  const selections = (Array.isArray(b.selections) ? b.selections : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 40);
  const visits = (Array.isArray(a.visited_offices) ? a.visited_offices : []).slice(0, 10)
    .map((v) => ({ builder: clampStr(v && v.builder, 160), community: clampStr(v && v.community, 200) }))
    .filter((v) => v.builder || v.community);
  const c = b.consents && typeof b.consents === 'object' ? b.consents : {};
  if (missing.length || errors.length) return { missing, errors };
  return {
    value: {
      lang: b.lang === 'es' ? 'es' : 'en', first_name: firstName, email: email.toLowerCase(), phone: phoneRaw,
      area: { input: clampStr(area.input, 200), zip: area.zip ? String(area.zip) : null, city: clampStr(area.city, 120), county: clampStr(area.county, 120), state: clampStr(area.state, 40) || 'FL' },
      max_price: maxPrice, max_monthly: maxMonthly, down_payment: down, move_timeline: a.move_timeline, financing_type: a.financing_type,
      has_agent: a.has_agent, under_agreement: underAgreement, research_token: runToken, selections, visits,
      consents: { email: c.email === true, sms: c.sms === true && !!phoneRaw, agent_referral: c.agent_referral === true }
    }
  };
}

async function createLead(tenantId, v, { req, agent, ipHash }) {
  const run = v.research_token ? await db.one('SELECT id, status FROM nca_research_runs WHERE tenant_id = :t AND token = :tok', { t: tenantId, tok: v.research_token }) : null;
  let selectionIds = [];
  if (run && v.selections.length) {
    const ok = await db.q(`SELECT id FROM nca_research_rows WHERE tenant_id = :t AND run_id = :r AND hidden_reason IS NULL AND id IN (:ids)`, { t: tenantId, r: run.id, ids: v.selections });
    selectionIds = ok.map((x) => x.id);
  }
  const gated = v.under_agreement;
  const consents = gated ? { email: false, sms: false, agent_referral: false } : v.consents;
  const assigned = consents.agent_referral && agent ? agent.id : null;
  const texts = leadConsentTexts(v.lang, agent);
  const tok = token(24);
  const rows = await db.exec(`INSERT INTO nca_leads (tenant_id, token, lang, first_name, email, phone, area_input, zip, city, county, state, max_price, max_monthly, down_payment,
    move_timeline, financing_type, has_agent, agent_agreement_signed, referral_consent, research_run_id, status, assigned_agent_id, ip_hash)
    VALUES (:t, :tok, :lang, :fn, :email, :phone, :ai, :zip, :city, :county, :state, :mp, :mm, :dp, :tl, :fin, :ha, :aas, :rc, :run, :status, :agent, :ih) RETURNING id`, {
    t: tenantId, tok, lang: v.lang, fn: v.first_name, email: gated ? null : v.email, phone: gated ? null : v.phone,
    ai: v.area.input, zip: v.area.zip, city: v.area.city, county: v.area.county, state: v.area.state, mp: v.max_price, mm: v.max_monthly, dp: v.down_payment,
    tl: v.move_timeline, fin: v.financing_type, ha: v.has_agent, aas: gated, rc: consents.agent_referral, run: run ? run.id : null,
    status: gated ? 'lost' : 'new', agent: assigned, ih: ipHash
  });
  const leadId = rows[0].id;
  for (const s of selectionIds) {
    await db.exec('INSERT INTO nca_lead_selections (tenant_id, lead_id, research_row_id) VALUES (:t, :l, :r) ON CONFLICT DO NOTHING', { t: tenantId, l: leadId, r: s });
  }
  for (const visit of v.visits) {
    await db.exec('INSERT INTO nca_lead_visited_offices (tenant_id, lead_id, builder, community) VALUES (:t, :l, :b, :c)', { t: tenantId, l: leadId, b: visit.builder, c: visit.community });
  }
  const ip = req ? clientIp(req) : null;
  const ua = req ? clampStr(req.headers['user-agent'], 300) : null;
  for (const ch of ['email', 'sms', 'agent_referral']) {
    await db.exec(`INSERT INTO nca_lead_consents (tenant_id, lead_id, channel, granted, consent_text, consent_version, ip, user_agent)
      VALUES (:t, :l, :ch, :g, :tx, :ver, :ip, :ua)`, { t: tenantId, l: leadId, ch, g: consents[ch], tx: texts[ch], ver: texts.version, ip, ua });
  }
  await audit(tenantId, { type: 'buyer' }, 'lead.created', 'lead', leadId, { gated, referral: consents.agent_referral, selections: selectionIds.length, visits: v.visits.length });
  return { id: leadId, token: tok, gated, referral: consents.agent_referral, email_consent: consents.email, assigned_agent_id: assigned, selections: selectionIds.length };
}

/** The buyer's own view of their lead: criteria, selections, and their research. No sources, no IP. */
async function publicLead(tenantId, leadToken) {
  const l = await db.one('SELECT * FROM nca_leads WHERE tenant_id = :t AND token = :tok', { t: tenantId, tok: leadToken });
  if (!l) return null;
  const run = l.research_run_id ? await db.one('SELECT token FROM nca_research_runs WHERE id = :id AND tenant_id = :t', { id: l.research_run_id, t: tenantId }) : null;
  const sel = await db.q(`SELECT s.research_row_id AS id FROM nca_lead_selections s WHERE s.tenant_id = :t AND s.lead_id = :l`, { t: tenantId, l: l.id });
  return {
    lang: l.lang, first_name: l.first_name, gated: l.agent_agreement_signed, referral: l.referral_consent,
    area: { input: l.area_input, zip: l.zip, city: l.city, county: l.county },
    criteria: { max_price: l.max_price != null ? Number(l.max_price) : null, max_monthly: l.max_monthly != null ? Number(l.max_monthly) : null,
      down_payment: l.down_payment != null ? Number(l.down_payment) : null, move_timeline: l.move_timeline, financing_type: l.financing_type },
    research_token: run ? run.token : null, selections: sel.map((s) => s.id), created_at: l.created_at
  };
}

module.exports = { LEAD_CONSENT_VERSION, TIMELINE, FINANCING, HAS_AGENT, STATUSES, leadConsentTexts, validateLead, createLead, publicLead, clientIp };
