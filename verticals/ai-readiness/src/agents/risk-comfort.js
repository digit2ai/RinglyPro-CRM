'use strict';

/**
 * RISK COMFORT AGENT — overcomes the fear of risk.
 *
 * "Something will go wrong and I will be the one who signed off on it."
 *
 * The agent's job is to convert a diffuse sense of danger into a list with
 * names on it. A CEO cannot approve a project against an unnamed fear, and a
 * vendor who answers "we take security very seriously" has confirmed the fear
 * rather than addressed it.
 *
 * So every named concern comes back with four things, and the deliverable is
 * incomplete without all four:
 *
 *   mitigation           — what makes the bad outcome less likely
 *   guardrail            — what makes it structurally unavailable
 *   owner                — the person accountable, by role
 *   evidence_of_control  — the artifact that proves it, and when it exists
 *
 * The most valuable output is the one almost nobody offers up front: the exit
 * criteria. Four written conditions that stop the pilot, and one named person
 * who can halt it without calling a meeting.
 */

const { defineAgent } = require('../brain');
const engine = require('../engines/risk');
const costEngine = require('../engines/cost');
const { loadAnswers, loadEngagement, saveFinding } = require('../services/engagement-store');

module.exports = defineAgent({
  id: 'risk_comfort',
  name: 'Risk Comfort Agent',
  role: 'Risk register with guardrails and owners, plus a low-risk pilot with written exit criteria',
  overcomes: 'The fear of risk',
  replaces: 'The security questionnaire nobody reads and the assurance nobody can verify',
  channels: ['web_orb', 'web_chat', 'portal', 'admin', 'system'],

  tools: {

    assess_risk_comfort: {
      description: 'Build the risk register for an engagement, map each concern the CEO named to a mitigation, a structural guardrail, an owner and a piece of evidence, and define the low-risk pilot with its exit criteria and kill switch.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          engagement_id: { type: 'integer' },
          pilot_scope: { type: 'array', description: 'Phase 1 processes, from the Cost Comfort Agent', items: { type: 'object' } },
          excluded_from_pilot: { type: 'array', items: { type: 'object' } }
        },
        required: ['engagement_id']
      },
      handler: async ({ engagement_id, pilot_scope, excluded_from_pilot }, ctx) => {
        const a = await loadAnswers(ctx.tenant_id, engagement_id);
        if (!a) return { success: false, error: 'Engagement not found' };
        const eng = await loadEngagement(ctx.tenant_id, engagement_id);
        const lang = (eng && eng.lang) || 'en';

        // If the caller did not hand us a scope, derive it the same way the
        // Cost Comfort Agent does — the two must never disagree about which
        // processes are in Phase 1.
        let scope = pilot_scope;
        let excluded = excluded_from_pilot;
        if (!scope) {
          const c = costEngine.analyze({
            processes: (a.pain || {}).processes || [],
            comfortable_pilot_budget_usd: (a.cost || {}).comfortable_pilot_budget_usd,
            systems_count: ((a.data || {}).systems || []).length
          });
          scope = c.pilot_scope;
          excluded = c.excluded_from_pilot;
        }

        const risk = a.risk || {};
        const costSec = a.cost || {};
        const result = engine.analyze({
          risk_concerns: risk.risk_concerns || [],
          regulatory_regimes: risk.regulatory_regimes || [],
          worst_case: risk.worst_case,
          workforce_sensitivity: risk.workforce_sensitivity,
          headcount_intent: risk.headcount_intent,
          security_review_required: risk.security_review_required,
          political_cost_of_failure: costSec.political_cost_of_failure,
          pilot_scope: scope || [],
          excluded_from_pilot: excluded || []
        }, lang);

        await saveFinding(ctx.tenant_id, engagement_id, 'risk_comfort', 'risk', result);
        return { success: true, ...result };
      }
    },

    define_pilot: {
      description: 'The low-risk pilot on its own: scope, duration, shadow period, reversibility, success criteria, exit criteria, kill switch, and what the company keeps if the pilot fails.',
      min_trust: 'identified',
      parameters: { type: 'object', properties: { engagement_id: { type: 'integer' } }, required: ['engagement_id'] },
      handler: async ({ engagement_id }, ctx) => {
        const a = await loadAnswers(ctx.tenant_id, engagement_id);
        if (!a) return { success: false, error: 'Engagement not found' };
        const eng = await loadEngagement(ctx.tenant_id, engagement_id);
        const c = costEngine.analyze({
          processes: (a.pain || {}).processes || [],
          comfortable_pilot_budget_usd: (a.cost || {}).comfortable_pilot_budget_usd,
          systems_count: ((a.data || {}).systems || []).length
        });
        const r = engine.analyze({
          risk_concerns: (a.risk || {}).risk_concerns || [],
          regulatory_regimes: (a.risk || {}).regulatory_regimes || [],
          headcount_intent: (a.risk || {}).headcount_intent,
          political_cost_of_failure: (a.cost || {}).political_cost_of_failure,
          pilot_scope: c.pilot_scope,
          excluded_from_pilot: c.excluded_from_pilot
        }, (eng && eng.lang) || 'en');
        return { success: true, pilot: r.pilot, workforce: r.workforce };
      }
    },

    risk_catalog: {
      description: 'The standing catalog of risk concerns the department can address, each with its mitigation and structural guardrail. Useful for showing a CEO what is covered before they have answered anything.',
      min_trust: 'public_web',
      parameters: { type: 'object', properties: { lang: { type: 'string', enum: ['en', 'es'] } } },
      handler: async ({ lang }) => {
        const l = lang === 'es' ? 'es' : 'en';
        return {
          success: true,
          concerns: Object.keys(engine.CATALOG).map(k => ({
            key: k,
            label: engine.CATALOG[k].label[l],
            mitigation: engine.CATALOG[k].mitigation[l],
            guardrail: engine.CATALOG[k].guardrail[l],
            inherent_severity: engine.CATALOG[k].inherent_severity,
            residual_severity: engine.CATALOG[k].residual_severity
          })),
          regimes: Object.keys(engine.REGIMES).map(k => ({ key: k, ...engine.REGIMES[k] }))
        };
      }
    }
  }
});
