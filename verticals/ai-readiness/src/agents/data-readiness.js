'use strict';

/**
 * DATA READINESS AGENT — assesses whether the company's data can support a
 * first AI project, and costs the remediation for whatever cannot.
 *
 * "Our data is a mess" is the most common thing a CEO says in this
 * conversation. It is usually true. It is also usually not a reason to wait,
 * and this agent exists to tell the difference honestly in both directions:
 * it will say a company is blocked when it is, and it will refuse to
 * manufacture a blocker to justify a larger engagement.
 *
 * The specific failure it is built to prevent is the eighteen-month data
 * warehouse getting funded instead of the four-week pilot. A first process
 * needs a narrow slice of data, and this score is deliberately about that
 * slice rather than about the enterprise.
 *
 * Only two conditions ever block a pilot:
 *   - the work is not recorded in any machine-readable form
 *   - personal data is in scope with no processing agreement covering it
 * Everything else is a scoping decision, and the agent says which it is.
 */

const { defineAgent } = require('../brain');
const engine = require('../engines/data');
const { loadAnswers, saveFinding } = require('../services/engagement-store');

module.exports = defineAgent({
  id: 'data_readiness',
  name: 'Data Readiness Agent',
  role: 'Data readiness score across seven dimensions, plus a costed remediation plan',
  overcomes: 'The fear that the data is not good enough to start',
  replaces: 'The data-maturity assessment that recommends an eighteen-month warehouse project',
  channels: ['web_orb', 'web_chat', 'portal', 'admin', 'system'],

  tools: {

    assess_data_readiness: {
      description: 'Score the company data across existence, quality, accessibility, structure, governance, history and privacy; produce a weighted readiness score with a Red/Yellow/Green rating and a remediation plan that separates what genuinely blocks a pilot from what does not.',
      min_trust: 'identified',
      parameters: { type: 'object', properties: { engagement_id: { type: 'integer' } }, required: ['engagement_id'] },
      handler: async ({ engagement_id }, ctx) => {
        const a = await loadAnswers(ctx.tenant_id, engagement_id);
        if (!a) return { success: false, error: 'Engagement not found' };

        const d = a.data || {};
        const result = engine.analyze({
          systems: d.systems || [],
          data_exists: d.data_exists,
          data_quality: d.data_quality,
          data_accessible: d.data_accessible,
          data_structured: d.data_structured,
          data_owner_exists: d.data_owner_exists,
          history_months: d.history_months,
          contains_pii: d.contains_pii,
          dpa_in_place: d.dpa_in_place,
          retention_policy: d.retention_policy,
          processes: (a.pain || {}).processes || []
        });

        await saveFinding(ctx.tenant_id, engagement_id, 'data_readiness', 'data', result);
        return { success: true, ...result };
      }
    },

    remediation_plan: {
      description: 'The remediation items only, each with the fix, the effort in days, and whether it blocks a first project. Effort is stated in days because framing it in months is what kills pilots.',
      min_trust: 'identified',
      parameters: { type: 'object', properties: { engagement_id: { type: 'integer' } }, required: ['engagement_id'] },
      handler: async ({ engagement_id }, ctx) => {
        const a = await loadAnswers(ctx.tenant_id, engagement_id);
        if (!a) return { success: false, error: 'Engagement not found' };
        const d = a.data || {};
        const r = engine.analyze({ ...d, processes: (a.pain || {}).processes || [] });
        return {
          success: true,
          remediation: r.remediation,
          blocking: r.blocking,
          blocking_count: r.blocking_count,
          remediation_days_total: r.remediation_days_total,
          can_start_phase_1: r.can_start_phase_1,
          headline: r.headline,
          what_this_is_not: r.what_this_is_not
        };
      }
    },

    scoring_model: {
      description: 'The dimensions and weights used to compute the data readiness score, so a CEO can see how the number was produced rather than being asked to accept it.',
      min_trust: 'public_web',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({
        success: true,
        weights: engine.WEIGHTS,
        thresholds: { green: '75 and above', yellow: '50 to 74', red: 'below 50' },
        note: 'Unanswered dimensions are excluded from the average rather than scored as zero. Scoring a company down for a question we failed to ask would be a defect, not a conservative choice.'
      })
    }
  }
});
