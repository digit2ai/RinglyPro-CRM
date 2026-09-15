'use strict';

/**
 * Hand-off agent: the moment a lead is saved it scores readiness (fixed rules, engines/readiness.js),
 * writes a brief for the licensed agent, alerts that agent by email and text within about a minute,
 * hands the lead to Rachel's follow-up plan, and tells the admin when a new lead has had no agent
 * response after INCENTIVA_NO_RESPONSE_HOURS (4).
 *
 * Invariants (SIT asserts each):
 *  - The score and tier come from rules only; a model never produces or changes them.
 *  - The brief and alerts carry no buyer email or phone; contact details stay in the console.
 *  - The agent is alerted only when the buyer granted agent-referral consent.
 *  - The optional suggested opening line is a model rewrite of a fixed template, discarded if it adds
 *    any figure or name (advisor.acceptRewrite).
 *  - This file has no transport: email goes through notify.js, texts through sms.js.
 */

const db = require('../db');
const notify = require('./notify');
const sms = require('./sms');
const llm = require('./llm');
const followup = require('./followup');
const readiness = require('../engines/readiness');
const { audit, safeFirstName } = require('./util');
const { acceptRewrite } = require('../engines/advisor');

function money(n) { return n == null ? null : '$' + Math.round(Number(n)).toLocaleString('en-US'); }

async function facts(tenantId, l) {
  const [chosen, visits] = await Promise.all([
    db.q(`SELECT r.builder, r.community FROM nca_lead_selections s JOIN nca_research_rows r ON r.id = s.research_row_id AND r.tenant_id = s.tenant_id WHERE s.tenant_id = :t AND s.lead_id = :l ORDER BY r.builder`, { t: tenantId, l: l.id }),
    db.q('SELECT builder, community FROM nca_lead_visited_offices WHERE tenant_id = :t AND lead_id = :l ORDER BY id', { t: tenantId, l: l.id })
  ]);
  return { chosen, visits };
}

const TIMELINE = { '0_3m': 'within 3 months', '3_6m': 'in 3 to 6 months', '6_12m': 'in 6 to 12 months', '12m_plus': 'in more than a year' };
const FINANCING = { preapproved: 'is pre-approved', cash: 'is paying cash', va: 'plans a VA loan', fha: 'plans an FHA loan', needs_lender: 'needs a lender', unsure: 'has not decided on financing' };

/** The agent's brief: facts only, English (console language), no contact details. */
function buildBrief(l, score, { chosen, visits }) {
  const place = [l.city, l.zip].filter(Boolean).join(' ') || l.area_input || 'their area';
  const parts = [`${l.first_name} is looking in ${place}, moving ${TIMELINE[l.move_timeline] || 'on an open timeline'}, and ${FINANCING[l.financing_type] || 'has not said how they will pay'}.`];
  const money_parts = [l.max_price != null ? `Maximum price ${money(l.max_price)}` : null, l.max_monthly ? `monthly payment up to ${money(l.max_monthly)}` : null, l.down_payment != null ? `down payment ${money(l.down_payment)}` : null].filter(Boolean);
  parts.push(money_parts.length ? money_parts.join(', ').replace(/^m/, 'M') + '.' : 'Skipped the budget questions.');
  parts.push(chosen.length ? `Chose ${chosen.map((c) => (c.community || c.builder) + ' by ' + c.builder).slice(0, 5).join('; ')}.` : 'Chose no community.');
  if (visits.length) parts.push(`Already visited: ${visits.map((v) => [v.builder, v.community].filter(Boolean).join(' · ')).join('; ')}. Check registration before contacting the builder.`);
  else if (l.visited_site === true) parts.push('Has already visited a new-construction site. Check registration before contacting the builder.');
  else parts.push('Has not visited a sales office.');
  if (l.has_agent === 'yes_informal') parts.push('Talks to another agent without a signed agreement.');
  if (l.has_agent === 'yes') parts.push('Already works with a real estate agent: not referred.');
  return parts.join(' ');
}

function openingTemplate(l, agentName, { chosen }) {
  const place = [l.city].filter(Boolean).join('') || 'your area';
  const communities = chosen.slice(0, 2).map((c) => c.community || c.builder).join(' and ');
  return l.lang === 'es'
    ? `Hola ${safeFirstName(l.first_name)}, soy ${agentName} de BuyersLine. Vi que le interesa${communities ? ' ' + communities : 'n casas nuevas'} en ${place}; puedo confirmar las promociones actuales y registrarlo antes de cualquier visita.`
    : `Hi ${safeFirstName(l.first_name)}, this is ${agentName} with BuyersLine. I saw you are interested in ${communities || 'new homes'} in ${place}; I can confirm the current promotions and register you before any visit.`;
}

async function suggestedOpening(l, agentName, f) {
  const base = openingTemplate(l, agentName, f);
  if (process.env.INCENTIVA_HANDOFF_MODEL === 'off' || !llm.configured()) return base;
  try {
    const out = await llm.text({
      model: process.env.INCENTIVA_HANDOFF_MODEL || 'claude-haiku-4-5-20251001',
      system: `Rewrite a real estate agent's first text message to a new-home buyer so it sounds natural and friendly. Language: ${l.lang === 'es' ? 'Spanish, use usted, correct accents' : 'English'}. Keep every fact. Do not add any number, date, price, name, place or promise. One or two sentences. No emojis. Return only the message.`,
      user: base, max_tokens: 160
    });
    const clean = String(out || '').trim().replace(/^"|"$/g, '');
    const factsText = [l.first_name, agentName, l.city, ...f.chosen.map((c) => [c.community, c.builder].join(' '))].join(' ');
    return clean && acceptRewrite(base, clean, factsText) ? clean : base;
  } catch (e) { return base; }
}

/** Runs right after a lead is saved (fire and forget from the public route). */
async function afterLead(tenantId, leadId) {
  const l = await db.one('SELECT * FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  if (!l) return { ok: false };
  const f = await facts(tenantId, l);
  const r = readiness.score({ move_timeline: l.move_timeline, financing_type: l.financing_type, selections: f.chosen.length, has_agent: l.has_agent, visits: f.visits.length || (l.visited_site === true ? 1 : 0), phone: !!l.phone });
  const agent = l.assigned_agent_id ? await db.one('SELECT id, name FROM nca_users WHERE id = :id AND tenant_id = :t', { id: l.assigned_agent_id, t: tenantId }) : null;
  const brief = l.agent_agreement_signed ? null : buildBrief(l, r, f);
  const opening = l.referral_consent && agent ? await suggestedOpening(l, agent.name || 'your agent', f) : null;
  await db.exec(`UPDATE nca_leads SET readiness_score = :s, readiness_tier = :tier, readiness_reasons = :reasons, agent_brief = :brief, agent_opening = :op, updated_at = now() WHERE id = :id AND tenant_id = :t`,
    { s: r.score, tier: r.tier, reasons: JSON.stringify(r.reasons), brief, op: opening, id: l.id, t: tenantId });
  await audit(tenantId, { type: 'system' }, 'handoff.scored', 'lead', l.id, { score: r.score, tier: r.tier });
  if (l.referral_consent && l.assigned_agent_id && !l.agent_agreement_signed) {
    await notify.agentNewLead(tenantId, l.id);
    await sms.agentNewLeadSms(tenantId, l.id);
    await db.exec('UPDATE nca_leads SET notified_agent_id = :a WHERE id = :id AND tenant_id = :t', { a: l.assigned_agent_id, id: l.id, t: tenantId });
  }
  // Double opt-in for texts: one fixed confirmation text; follow-up texts start only after a YES reply.
  await sms.smsConfirmRequest(tenantId, l.id);
  const planned = await followup.scheduleForLead(tenantId, l.id);
  return { ok: true, score: r.score, tier: r.tier, planned };
}

/** A referred lead still 'new' with no agent response after N hours: tell the admin and the agent, once. */
async function noResponseTick(tenantId) {
  const hours = Number(process.env.INCENTIVA_NO_RESPONSE_HOURS || 4);
  const rows = await db.exec(`UPDATE nca_leads SET no_response_alerted_at = now()
    WHERE tenant_id = :t AND referral_consent = true AND assigned_agent_id IS NOT NULL AND status = 'new' AND first_response_at IS NULL
      AND no_response_alerted_at IS NULL AND created_at < now() - (:h || ' hours')::interval AND created_at > now() - interval '7 days'
    RETURNING id, first_name, city, zip, assigned_agent_id, readiness_tier, readiness_score`, { t: tenantId, h: String(hours) });
  for (const l of rows) {
    const area = [l.city, l.zip].filter(Boolean).join(' ') || 'their area';
    const tier = l.readiness_tier ? ` (${l.readiness_tier}, ${l.readiness_score})` : '';
    const m = { action: 'email.no_response_alert', subjectType: 'lead', subjectId: l.id, subject: `No agent response after ${hours} hours: ${l.first_name} in ${area}`,
      paragraphs: [`${l.first_name}${tier} asked to be contacted by a licensed agent ${hours} or more hours ago, and the lead is still marked new.`, 'Open the lead and mark it contacted once the agent has reached out.'],
      cta: { label: 'Open the lead', url: `${notify.publicUrl()}/admin/#/leads/${l.id}` } };
    await notify.staffMessage(tenantId, 'admin', m);
    await notify.staffMessage(tenantId, l.assigned_agent_id, m);
    await audit(tenantId, { type: 'system' }, 'handoff.no_response', 'lead', l.id, { hours });
  }
  return rows.length;
}

module.exports = { afterLead, noResponseTick, buildBrief, openingTemplate };
