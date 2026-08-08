'use strict';

/**
 * ROADMAP BUILDER AGENT — combines every finding into the deliverable.
 *
 * Three phases, each carrying cost, risk level, data requirements, timeline
 * and success metrics, plus the gate that must be passed to reach the next.
 * The gates are what make it a roadmap rather than a wish list.
 *
 * It also produces the scorecard — three lanes, Red/Yellow/Green — and the
 * talk track the human sponsor speaks from. That last part is not decoration.
 * A department designed to be presented by a person fails at the presentation
 * if the person cannot narrate it, and a sponsor reading slides aloud to a
 * frightened CEO is the one delivery guaranteed not to work.
 *
 * The narrative here may be model-written. Every number is not: the engines
 * compute them and the narrative service rejects the model's text outright if
 * it introduces a figure the engines did not produce.
 */

const { defineAgent } = require('../brain');
const roadmapEngine = require('../engines/roadmap');
const scorecardEngine = require('../engines/scorecard');
const llm = require('../services/llm');
const { loadEngagement, loadFindings, saveRoadmap } = require('../services/engagement-store');

module.exports = defineAgent({
  id: 'roadmap_builder',
  name: 'Roadmap Builder Agent',
  role: 'Phased roadmap, readiness scorecard and the sponsor talk track',
  overcomes: 'Not knowing what the actual next step is',
  replaces: 'The strategy deck with no gate, no exit and no owner',
  channels: ['web_orb', 'web_chat', 'portal', 'admin', 'system'],

  tools: {

    build_scorecard: {
      description: 'The three-lane readiness scorecard — Cost Comfort, Risk Comfort, Data Readiness, each Red/Yellow/Green — with an overall verdict and the safe next step. The verdict is not an average: a blocking item dominates regardless of the other lanes.',
      min_trust: 'identified',
      parameters: { type: 'object', properties: { engagement_id: { type: 'integer' } }, required: ['engagement_id'] },
      handler: async ({ engagement_id }, ctx) => {
        const eng = await loadEngagement(ctx.tenant_id, engagement_id);
        if (!eng) return { success: false, error: 'Engagement not found' };
        const findings = await loadFindings(ctx.tenant_id, engagement_id);
        const missing = ['cost', 'risk', 'data'].filter(k => !findings[k]);
        if (missing.length === 3) {
          return { success: false, error: 'No lane has been assessed yet. Run the three agents first.' };
        }
        const scorecard = scorecardEngine.build(findings, eng.lang || 'en');
        return { success: true, scorecard, lanes_missing: missing };
      }
    },

    build_roadmap: {
      description: 'Assemble the full deliverable: the scorecard, the three phases with their gates, the executive summary and the sponsor talk track. Freezes a version so a document already presented to a CEO cannot silently change afterwards.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          engagement_id: { type: 'integer' },
          skip_narrative: { type: 'boolean', description: 'Use the deterministic summary and do not call a model' }
        },
        required: ['engagement_id']
      },
      handler: async ({ engagement_id, skip_narrative }, ctx) => {
        const eng = await loadEngagement(ctx.tenant_id, engagement_id);
        if (!eng) return { success: false, error: 'Engagement not found' };

        const findings = await loadFindings(ctx.tenant_id, engagement_id);
        const present = ['cost', 'risk', 'data'].filter(k => findings[k]);
        if (present.length < 3) {
          return {
            success: false,
            error: `The roadmap needs all three lanes assessed. Missing: ${['cost', 'risk', 'data'].filter(k => !findings[k]).join(', ')}. Assembling it with a lane missing would present a confidence the assessment does not have.`
          };
        }

        const lang = eng.lang || 'en';
        const scorecard = scorecardEngine.build(findings, lang);
        const assembled = roadmapEngine.build({
          engagement: { ...eng.toJSON ? eng.toJSON() : eng, biggest_fear: findings._biggest_fear },
          findings, scorecard, lang
        });

        // Narrative: the model phrases, the engines decide. If it invents a
        // figure, its text is discarded and the deterministic prose stands.
        let narrative = { text: assembled.executive_summary, narrative_by: 'heuristic', is_simulated: true };
        if (!skip_narrative) {
          narrative = await llm.executiveSummary(
            {
              company: eng.company_name,
              verdict: scorecard.verdict,
              verdict_label: scorecard.verdict_label,
              lanes: scorecard.lanes.map(l => ({ title: l.title, rating: l.rating, score: l.score, headline: l.headline })),
              cost_of_doing_nothing_annual_usd: (findings.cost.cost_of_doing_nothing || {}).total_annual_usd,
              max_exposure_usd: ((findings.cost.phases || {}).phase_1 || {}).max_exposure_usd,
              payback_months: ((findings.cost.phases || {}).phase_1 || {}).payback_months,
              pilot_weeks: assembled.phases[0].timeline_weeks,
              pilot_scope: assembled.phases[0].scope,
              data_headline: findings.data.headline,
              safe_next_step: scorecard.safe_next_step,
              biggest_fear_text: (findings.risk || {}).worst_case_verbatim || null
            },
            assembled.executive_summary,
            lang
          );
        }

        const saved = await saveRoadmap(ctx.tenant_id, engagement_id, {
          scorecard,
          phases: assembled.phases,
          safe_next_step: scorecard.safe_next_step,
          talk_track: assembled.talk_track,
          executive_summary: narrative.text,
          narrative_by: narrative.narrative_by,
          is_simulated: narrative.is_simulated
        });

        return {
          success: true,
          roadmap_id: saved.id,
          version: saved.version,
          scorecard,
          phases: assembled.phases,
          executive_summary: narrative.text,
          talk_track: assembled.talk_track,
          assumptions: assembled.assumptions,
          honesty_notes: assembled.honesty_notes,
          narrative_by: narrative.narrative_by,
          is_simulated: narrative.is_simulated,
          narrative_rejected_reason: narrative.rejected_reason || null
        };
      }
    },

    talk_track: {
      description: 'The sponsor talk track on its own: what to say section by section, what to watch for in the room, and prepared answers to the five objections that actually get raised.',
      min_trust: 'identified',
      parameters: { type: 'object', properties: { engagement_id: { type: 'integer' } }, required: ['engagement_id'] },
      handler: async ({ engagement_id }, ctx) => {
        const eng = await loadEngagement(ctx.tenant_id, engagement_id);
        if (!eng) return { success: false, error: 'Engagement not found' };
        const findings = await loadFindings(ctx.tenant_id, engagement_id);
        if (!findings.cost || !findings.risk || !findings.data) {
          return { success: false, error: 'Run the three lane agents before requesting the talk track.' };
        }
        const lang = eng.lang || 'en';
        const scorecard = scorecardEngine.build(findings, lang);
        const assembled = roadmapEngine.build({ engagement: eng, findings, scorecard, lang });
        return { success: true, talk_track: assembled.talk_track };
      }
    }
  }
});
