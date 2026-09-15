'use strict';

/**
 * Readiness score for a lead: fixed rules, never a model, so an agent can see and defend
 * why a buyer is Hot, Warm or Nurture. 0-100. A buyer under agreement with another agent
 * is not scored for outreach at all.
 */

const TIMELINE = { '0_3m': 30, '3_6m': 22, '6_12m': 12, '12m_plus': 4 };
const FINANCING = { preapproved: 25, cash: 25, va: 18, fha: 18, needs_lender: 10, unsure: 5 };
const REASON = {
  timeline: { '0_3m': 'Moving within 3 months', '3_6m': 'Moving in 3 to 6 months', '6_12m': 'Moving in 6 to 12 months', '12m_plus': 'Moving in more than a year' },
  financing: { preapproved: 'Pre-approved', cash: 'Paying cash', va: 'VA loan', fha: 'FHA loan', needs_lender: 'Needs a lender', unsure: 'Financing not decided' }
};

function score({ move_timeline, financing_type, selections = 0, has_agent, visits = 0, phone = false }) {
  if (has_agent === 'yes_under_agreement') return { score: 0, tier: 'none', reasons: ['Under agreement with another agent: not contacted'] };
  const reasons = [];
  let s = 0;
  const tl = TIMELINE[move_timeline] || 0; s += tl; if (REASON.timeline[move_timeline]) reasons.push(REASON.timeline[move_timeline]);
  const fin = FINANCING[financing_type] || 0; s += fin; if (REASON.financing[financing_type]) reasons.push(REASON.financing[financing_type]);
  const n = Number(selections) || 0;
  const sel = n >= 3 ? 15 : n === 2 ? 12 : n === 1 ? 8 : 0; s += sel;
  reasons.push(n ? `Chose ${n} ${n === 1 ? 'community' : 'communities'}` : 'Chose no community');
  if (phone) { s += 10; reasons.push('Left a mobile number'); }
  if (has_agent === 'no') { s += 10; reasons.push('Not working with an agent'); }
  else if (has_agent === 'yes_informal') { s += 4; reasons.push('Talks to an agent without an agreement'); }
  const v = Number(visits) || 0;
  if (!v) { s += 10; reasons.push('No sales offices visited yet'); }
  else { s += 3; reasons.push(`Visited ${v} sales ${v === 1 ? 'office' : 'offices'}: check registration`); }
  s = Math.max(0, Math.min(100, s));
  return { score: s, tier: s >= 70 ? 'hot' : s >= 45 ? 'warm' : 'nurture', reasons };
}

module.exports = { score, TIMELINE, FINANCING };
