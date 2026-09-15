'use strict';

/**
 * Billing to agents (Revision 1 + 2 of the founding plan).
 *
 * THE PLATFORM BILLS PER CONSULT HELD AND FOR NOTHING THAT DEPENDS ON A
 * TRANSACTION. A fee tied to a signed agreement, a registration or a closing is
 * a referral fee that only a licensed Florida brokerage may receive. There is
 * no code path here for those events, the database CHECK refuses them, and the
 * SIT fails the build if one appears. The agent partner, as a co-owner, pays the same rate as
 * any agent (arm's length).
 */

const ALLOWED_EVENTS = Object.freeze(['consult_held']);

function plan() {
  const fee = Number(process.env.INCENTIVA_CONSULT_FEE_USD);
  const cap = Number(process.env.INCENTIVA_CONSULT_MONTHLY_CAP);
  return {
    event: 'consult_held',
    fee_usd: isFinite(fee) && fee >= 0 && process.env.INCENTIVA_CONSULT_FEE_USD ? fee : 350,
    monthly_cap: isFinite(cap) && cap > 0 && process.env.INCENTIVA_CONSULT_MONTHLY_CAP ? cap : 20
  };
}

/** Decide billability of one consult-held event given this month's billable count. */
function evaluate(event, billableThisMonth, p = plan()) {
  if (!ALLOWED_EVENTS.includes(event)) throw new Error('Not a billable event type: ' + event);
  if (billableThisMonth >= p.monthly_cap) return { billable: false, fee_usd: 0, waiver_reason: 'monthly_cap_reached' };
  return { billable: true, fee_usd: p.fee_usd, waiver_reason: null };
}

module.exports = { ALLOWED_EVENTS, plan, evaluate };
