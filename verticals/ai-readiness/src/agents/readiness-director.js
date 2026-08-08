'use strict';

/**
 * READINESS DIRECTOR — the orchestrator, and the agent the sponsor works with.
 *
 * It runs the engagement: opens it, walks the interview, dispatches the three
 * lane agents, has the Roadmap Builder assemble the deliverable, and records
 * what the CEO decided at the end.
 *
 * Two behaviours here are load-bearing:
 *
 *   1. IT REFUSES TO ANALYSE ON MISSING INPUTS. `run_department` will not run
 *      while a required interview answer is absent. This is the whole
 *      difference between this department and the thing the CEO was oversold
 *      last time — that document was confident because nobody had asked, and
 *      this one is allowed to be confident because somebody did. The refusal
 *      names exactly which questions are outstanding.
 *
 *   2. PUBLISHING TO THE CEO REQUIRES A HUMAN SIGNATURE. `publish_to_ceo` is
 *      approval-gated: the handler does not run until a person signs it off.
 *      A department whose pitch is "AI never acts on its own in front of your
 *      customers" has to obey that rule about its own most consequential
 *      action, which is putting a document in front of the client.
 */

const { defineAgent } = require('../brain');
const interview = require('../engines/interview');
const {
  createEngagement, loadEngagement, listEngagements, loadAnswers,
  saveAnswers, loadFindings, updateEngagement, latestRoadmap, mintShareToken
} = require('../services/engagement-store');

const AGENT_SEQUENCE = [
  // Data first: its blocking-item count feeds the cost model's remediation
  // hours, so running cost before data would price a pilot that ignores the
  // work needed to make it possible.
  { agent: 'data_readiness', tool: 'data_readiness.assess_data_readiness' },
  { agent: 'cost_comfort', tool: 'cost_comfort.assess_cost_comfort' },
  { agent: 'risk_comfort', tool: 'risk_comfort.assess_risk_comfort' }
];

module.exports = defineAgent({
  id: 'readiness_director',
  name: 'Readiness Director',
  role: 'Leads the engagement, runs the interview, coordinates the crew, assembles the roadmap',
  overcomes: 'Not knowing where to start',
  replaces: 'The discovery call that becomes a proposal nobody can evaluate',
  channels: ['web_orb', 'web_chat', 'portal', 'admin', 'system'],
  supervisor_role: 'owner',

  tools: {

    open_engagement: {
      description: 'Open a new engagement for one company and one CEO. Everything else in the department hangs off this.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          company_name: { type: 'string' },
          ceo_name: { type: 'string' },
          industry: { type: 'string' },
          country: { type: 'string' },
          headcount: { type: 'integer' },
          revenue_band: { type: 'string' },
          lang: { type: 'string', enum: ['en', 'es'] }
        },
        required: ['company_name']
      },
      handler: async (args, ctx) => {
        if (!args.company_name || !String(args.company_name).trim()) {
          return { success: false, error: 'A company name is required to open an engagement.' };
        }
        const eng = await createEngagement(ctx.tenant_id, {
          ...args,
          sponsor_id: ctx.user_id || null
        });
        return {
          success: true,
          engagement_id: eng.id,
          stage: eng.stage,
          next: 'Walk the interview. Start with the fears section — a CEO who has named what frightens them answers the operational questions honestly.'
        };
      }
    },

    get_interview: {
      description: 'The interview script: every section with its questions, why each is asked, plus the answers recorded so far and how complete the interview is. The sponsor reads the "why" aloud when the CEO asks why they are being asked, which happens constantly.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          engagement_id: { type: 'integer' },
          section: { type: 'string', description: 'Optional: one section only' }
        }
      },
      handler: async ({ engagement_id, section }, ctx) => {
        const answers = engagement_id ? (await loadAnswers(ctx.tenant_id, engagement_id)) : {};
        if (engagement_id && !answers) return { success: false, error: 'Engagement not found' };
        const sections = section
          ? [interview.section(section)].filter(Boolean)
          : interview.SECTIONS;
        if (section && !sections.length) return { success: false, error: `Unknown section: ${section}` };
        return {
          success: true,
          sections,
          answers: answers || {},
          completeness: interview.completeness(answers || {}),
          missing_required: interview.missingRequired(answers || {})
        };
      }
    },

    record_answers: {
      description: 'Record the CEO answers for one interview section. Re-recording a section replaces it, so a correction made in the room takes effect immediately.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          engagement_id: { type: 'integer' },
          section: { type: 'string', enum: ['context', 'fears', 'pain', 'cost', 'risk', 'data'] },
          payload: { type: 'object' },
          answered_by: { type: 'string', enum: ['ceo', 'sponsor', 'unknown'] }
        },
        required: ['engagement_id', 'section', 'payload']
      },
      handler: async ({ engagement_id, section, payload, answered_by }, ctx) => {
        if (!interview.section(section)) return { success: false, error: `Unknown section: ${section}` };
        const eng = await loadEngagement(ctx.tenant_id, engagement_id);
        if (!eng) return { success: false, error: 'Engagement not found' };

        await saveAnswers(ctx.tenant_id, engagement_id, section, payload || {}, answered_by || 'ceo');

        // Keep the engagement header in step with the context section so the
        // deliverable header cannot disagree with the interview.
        if (section === 'context') {
          await updateEngagement(ctx.tenant_id, engagement_id, {
            company_name: payload.company_name || eng.company_name,
            ceo_name: payload.ceo_name || eng.ceo_name,
            industry: payload.industry || eng.industry,
            country: payload.country || eng.country,
            headcount: payload.headcount || eng.headcount,
            revenue_band: payload.revenue_band || eng.revenue_band
          });
        }
        if (eng.stage === 'intake') await updateEngagement(ctx.tenant_id, engagement_id, { stage: 'interview' });

        const all = await loadAnswers(ctx.tenant_id, engagement_id);
        const missing = interview.missingRequired(all);
        return {
          success: true,
          section,
          completeness: interview.completeness(all),
          missing_required: missing,
          ready_to_analyse: missing.length === 0
        };
      }
    },

    engagement_status: {
      description: 'Where an engagement stands: stage, interview completeness, which lanes have been assessed, whether a roadmap exists, and what the CEO decided.',
      min_trust: 'identified',
      parameters: { type: 'object', properties: { engagement_id: { type: 'integer' } }, required: ['engagement_id'] },
      handler: async ({ engagement_id }, ctx) => {
        const eng = await loadEngagement(ctx.tenant_id, engagement_id);
        if (!eng) return { success: false, error: 'Engagement not found' };
        const answers = await loadAnswers(ctx.tenant_id, engagement_id);
        const findings = await loadFindings(ctx.tenant_id, engagement_id);
        const roadmap = await latestRoadmap(ctx.tenant_id, engagement_id);
        const missing = interview.missingRequired(answers);
        return {
          success: true,
          engagement: {
            id: eng.id, company_name: eng.company_name, ceo_name: eng.ceo_name,
            stage: eng.stage, lang: eng.lang, decision: eng.decision,
            share_token: eng.share_token
          },
          completeness: interview.completeness(answers),
          missing_required: missing,
          ready_to_analyse: missing.length === 0,
          lanes_assessed: ['cost', 'risk', 'data'].filter(k => findings[k]),
          has_roadmap: !!roadmap,
          roadmap_version: roadmap ? roadmap.version : null
        };
      }
    },

    run_department: {
      description: 'Run the whole crew: Data Readiness, then Cost Comfort, then Risk Comfort, then have the Roadmap Builder assemble the scorecard and the three-phase roadmap. Refuses to run while a required interview answer is missing, and names which ones.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          engagement_id: { type: 'integer' },
          skip_narrative: { type: 'boolean' }
        },
        required: ['engagement_id']
      },
      handler: async ({ engagement_id, skip_narrative }, ctx) => {
        const eng = await loadEngagement(ctx.tenant_id, engagement_id);
        if (!eng) return { success: false, error: 'Engagement not found' };

        const answers = await loadAnswers(ctx.tenant_id, engagement_id);
        const missing = interview.missingRequired(answers);
        if (missing.length) {
          // The refusal IS the feature. A roadmap built on absent inputs is
          // exactly the confident, unfounded artifact this CEO already told us
          // they have been burned by once.
          return {
            success: false,
            error: 'The interview is not complete enough to analyse.',
            code: 'interview_incomplete',
            missing_required: missing,
            why: 'Every figure in the deliverable traces to an answer. Producing one now would mean inventing the inputs, which is the specific thing this department exists not to do.'
          };
        }

        await updateEngagement(ctx.tenant_id, engagement_id, { stage: 'analysis' });
        const brain = ctx.brain;
        const inner = { ...ctx, channel: ctx.channel === 'admin' ? 'admin' : 'system', engagement_id };
        const ran = [];

        // Sequential, not parallel: the cost model needs the data agent's
        // blocking-item count, and the risk agent needs the cost agent's pilot
        // scope. Fanning these out concurrently would have each of them
        // guessing at the others' output.
        let dataResult = null, costResult = null;

        for (const step of AGENT_SEQUENCE) {
          let args = { engagement_id };
          if (step.agent === 'cost_comfort') {
            args.remediation_items = dataResult ? (dataResult.blocking_count || 0) : 0;
          }
          if (step.agent === 'risk_comfort' && costResult) {
            args.pilot_scope = costResult.pilot_scope;
            args.excluded_from_pilot = costResult.excluded_from_pilot;
          }
          const r = await brain.callTool(step.tool, args, inner);
          ran.push({ agent: step.agent, tool: step.tool, success: r.success !== false, error: r.error || null });
          if (r.success === false) {
            return { success: false, error: `${step.agent} failed: ${r.error}`, agents_run: ran };
          }
          if (step.agent === 'data_readiness') dataResult = r;
          if (step.agent === 'cost_comfort') costResult = r;
        }

        const built = await brain.callTool('roadmap_builder.build_roadmap', { engagement_id, skip_narrative }, inner);
        ran.push({ agent: 'roadmap_builder', tool: 'roadmap_builder.build_roadmap', success: built.success !== false, error: built.error || null });
        if (built.success === false) return { success: false, error: built.error, agents_run: ran };

        await updateEngagement(ctx.tenant_id, engagement_id, { stage: 'roadmap' });

        return {
          success: true,
          agents_run: ran,
          scorecard: built.scorecard,
          phases: built.phases,
          executive_summary: built.executive_summary,
          talk_track: built.talk_track,
          assumptions: built.assumptions,
          honesty_notes: built.honesty_notes,
          narrative_by: built.narrative_by,
          is_simulated: built.is_simulated,
          roadmap_version: built.version
        };
      }
    },

    publish_to_ceo: {
      description: 'Mint the read-only link the CEO receives, and mark the engagement presented. Approval-gated: putting a document in front of the client is the department\'s most consequential action, and it does not happen without a human signature.',
      min_trust: 'identified',
      requires_approval: true,
      approval_reason: 'A document going in front of a client CEO always gets a human signature. The department cannot be exempt from the rule it is selling.',
      parameters: { type: 'object', properties: { engagement_id: { type: 'integer' } }, required: ['engagement_id'] },
      handler: async ({ engagement_id }, ctx) => {
        const eng = await loadEngagement(ctx.tenant_id, engagement_id);
        if (!eng) return { success: false, error: 'Engagement not found' };
        const roadmap = await latestRoadmap(ctx.tenant_id, engagement_id);
        if (!roadmap) return { success: false, error: 'There is no roadmap to publish yet.' };
        const token = await mintShareToken(ctx.tenant_id, engagement_id);
        await updateEngagement(ctx.tenant_id, engagement_id, { stage: 'presented' });
        return {
          success: true,
          share_token: token,
          path: `/ai-readiness/roadmap/${token}`,
          note: 'Read-only. It shows the frozen roadmap version, so what the CEO reads later is what they were shown.'
        };
      }
    },

    record_decision: {
      description: 'Record what the CEO decided. This is the only outcome the department is measured on — everything else exists to move this from nothing to something.',
      min_trust: 'identified',
      parameters: {
        type: 'object',
        properties: {
          engagement_id: { type: 'integer' },
          decision: { type: 'string', enum: ['pilot', 'narrow_pilot', 'remediate', 'declined'] },
          note: { type: 'string' }
        },
        required: ['engagement_id', 'decision']
      },
      handler: async ({ engagement_id, decision, note }, ctx) => {
        const eng = await loadEngagement(ctx.tenant_id, engagement_id);
        if (!eng) return { success: false, error: 'Engagement not found' };
        await updateEngagement(ctx.tenant_id, engagement_id, {
          decision, decision_note: note || null, decided_at: new Date(), stage: 'decided'
        });
        return { success: true, decision, engagement_id };
      }
    },

    list_engagements: {
      description: 'Every engagement this sponsor is running, with stage and decision.',
      min_trust: 'identified',
      parameters: { type: 'object', properties: { stage: { type: 'string' } } },
      handler: async ({ stage }, ctx) => {
        const rows = await listEngagements(ctx.tenant_id, { stage });
        return { success: true, engagements: rows };
      }
    },

    department_overview: {
      description: 'What the department is, who is on the crew, what each one overcomes, and what the deliverable is. Safe to show a prospective client before any engagement exists.',
      min_trust: 'public_web',
      parameters: { type: 'object', properties: {} },
      handler: async (args, ctx) => ({
        success: true,
        department: 'AI Readiness Department',
        mission: 'Take a CEO from fear to confidence about adopting AI, and leave them with a personalised roadmap and a next step small enough to say yes to in the room.',
        crew: ctx.brain.listAgents(),
        deliverable: [
          'An executive AI Readiness Roadmap: three phases, each with cost, risk level, data requirements, timeline, success metrics and a gate.',
          'A readiness scorecard: Cost Comfort, Risk Comfort and Data Readiness, each rated Red, Yellow or Green.',
          'A safe next step, sized to a budget the CEO said they could lose without pain.',
          'A talk track so a human sponsor can present the whole thing end to end.'
        ],
        what_it_will_not_do: [
          'Use industry averages to compute a specific company\'s savings.',
          'Price Phase 3 against unknowns.',
          'Promise an outcome, in place of stating what will be measured.',
          'Produce an analysis when the interview inputs are missing.'
        ]
      })
    }
  }
});
