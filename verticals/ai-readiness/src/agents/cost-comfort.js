'use strict';

/**
 * COST COMFORT AGENT — overcomes the fear of cost.
 *
 * "It will cost more than it returns, and I will have spent money I cannot
 * justify to my board."
 *
 * What this agent will not do, and the reason each is a rule rather than a
 * preference:
 *
 *   - It will not use an industry benchmark to compute the CEO's savings.
 *     The moment a CEO recognises a number as generic, everything else in the
 *     document becomes generic too.
 *   - It will not hide an assumption. Every rate and capture rate is listed
 *     with its basis, because a CEO can argue with a visible assumption and
 *     will stop trusting an invisible one the moment they find it.
 *   - It will not size a pilot the CEO has to stretch to afford. It takes the
 *     figure they said they could lose without losing sleep and builds under
 *     it — and when nothing meaningful fits under it, it says so rather than
 *     quietly shrinking what is promised.
 */

const { defineAgent } = require('../brain');
const engine = require('../engines/cost');
const { loadAnswers, saveFinding } = require('../services/engagement-store');

module.exports = defineAgent({
  id: 'cost_comfort',
  name: 'Cost Comfort Agent',
  role: 'Transparent cost model, cost of doing nothing, and a start-small budget path',
  overcomes: 'The fear of cost',
  replaces: 'The proposal with one big number on the last page',
  channels: ['web_orb', 'web_chat', 'portal', 'admin', 'system'],

  tools: {

    assess_cost_comfort: {
      description: 'Build the full cost model for an engagement: what the work costs to do by hand today, what each phase costs, the payback, the maximum exposure, and the pilot-to-scale budget path. Every figure traces to an interview answer or to a listed assumption.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          engagement_id: { type: 'integer' },
          remediation_items: { type: 'integer', description: 'Count of blocking data gaps, from the Data Readiness Agent' }
        },
        required: ['engagement_id']
      },
      handler: async ({ engagement_id, remediation_items }, ctx) => {
        const a = await loadAnswers(ctx.tenant_id, engagement_id);
        if (!a) return { success: false, error: 'Engagement not found' };

        const pain = a.pain || {};
        const costSec = a.cost || {};
        const dataSec = a.data || {};

        const result = engine.analyze({
          processes: pain.processes || [],
          known_leak_annual_usd: pain.known_leak_annual_usd,
          comfortable_pilot_budget_usd: costSec.comfortable_pilot_budget_usd,
          monthly_run_comfort_usd: costSec.monthly_run_comfort_usd,
          current_software_spend_monthly_usd: costSec.current_software_spend_monthly_usd,
          remediation_items: remediation_items || 0,
          systems_count: (dataSec.systems || []).length
        });

        await saveFinding(ctx.tenant_id, engagement_id, 'cost_comfort', 'cost', result);
        return { success: true, ...result };
      }
    },

    cost_of_doing_nothing: {
      description: 'What the named processes cost to run by hand every year, computed only from the hours, headcount and loaded rates the CEO gave. This is not a savings claim and is labeled as such.',
      min_trust: 'identified',
      parameters: { type: 'object', properties: { engagement_id: { type: 'integer' } }, required: ['engagement_id'] },
      handler: async ({ engagement_id }, ctx) => {
        const a = await loadAnswers(ctx.tenant_id, engagement_id);
        if (!a) return { success: false, error: 'Engagement not found' };
        const pain = a.pain || {};
        return { success: true, ...engine.costOfDoingNothing(pain.processes || [], pain.known_leak_annual_usd) };
      }
    },

    budget_path: {
      description: 'The four-step pilot-to-scale spending path, where every step is one the CEO can stop at without losing what came before.',
      min_trust: 'identified',
      parameters: { type: 'object', properties: { engagement_id: { type: 'integer' } }, required: ['engagement_id'] },
      handler: async ({ engagement_id }, ctx) => {
        const a = await loadAnswers(ctx.tenant_id, engagement_id);
        if (!a) return { success: false, error: 'Engagement not found' };
        const r = engine.analyze({
          processes: (a.pain || {}).processes || [],
          known_leak_annual_usd: (a.pain || {}).known_leak_annual_usd,
          comfortable_pilot_budget_usd: (a.cost || {}).comfortable_pilot_budget_usd,
          systems_count: ((a.data || {}).systems || []).length
        });
        return {
          success: true,
          budget_path: r.budget_path,
          max_exposure_usd: r.phases.phase_1.max_exposure_usd,
          narrowed_to_fit: r.narrowed_to_fit,
          fits_ceiling: r.fits_ceiling,
          ceiling_shortfall_usd: r.ceiling_shortfall_usd
        };
      }
    },

    list_assumptions: {
      description: 'Every assumption in the cost model with its basis. Rendered into the deliverable so none of them are hidden from the CEO.',
      min_trust: 'public_web',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ success: true, assumptions: engine.assumptionList() })
    }
  }
});
