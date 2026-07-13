'use strict';

// Registry Agent catalog — the machine-readable NIN org chart node source.
// Each entry is a department (reporting to /ringlypro-architect) and the agent
// that staffs it, with its description, input/output schema, and owner. Exposed
// at GET /api/v1/agents/registry so the org chart and any dashboard can render
// the live roster without hard-coding it.

const DEPARTMENTS = [
  {
    department: 'Premortem',
    charter: 'Adversarial risk analysis for all inbound projects, launches, sponsor commitments, and cohort plans across Digit2ai and Vision2Ai verticals. Assumes the project already failed and narrates why (Gary Klein prospective hindsight, 1989). The autopsy, not the encouragement.',
    reports_to: '/ringlypro-architect',
    owner: 'Manuel Stagg (Manny)',
    added: '2026-07-13',
    agent: {
      name: 'Claude Premortem',
      slug: '/claude-premortem',
      agent_type: 'premortem',
      version: 'claude-premortem@1.0.0',
      model: 'claude-sonnet-4-6',
      bilingual: 'English by default; Spanish on request or when the inbound request is in Spanish',
      description: 'Generates 5-10 project-specific failure modes with base rates and likelihood/danger/prevention-cost ranks, three owned mitigations with trigger conditions, and a single verdict. Returns missing_context instead of a fabricated analysis when the request is too vague.',
      invoked_by: 'Inbox Triage (automatically on feasibility completion) or POST /api/v1/agents/premortem/:projectId',
      input_schema: {
        project_id: 'integer',
        project_name: 'string',
        requestor: 'string',
        triage_feasibility: 'object (full Triage AI triage_structured output)',
        project_request: 'string (original raw request)',
        constraints: '{ budget, timeline, team, tech_stack }',
        failure_horizon: 'string (default: "6 months")'
      },
      output_schema: {
        failure_modes: '[{ title, narrative, category (technical|market|people|financial|legal-compliance|operational), base_rate_estimate, likelihood_rank, danger_rank, prevention_cost_rank }]',
        top_mitigations: '[{ failure_mode, mitigation, owner_agent, trigger_condition }]',
        verdict: 'PROCEED | PROCEED_WITH_MITIGATIONS | RESHAPE | DECLINE',
        verdict_rationale: 'string (<= 3 sentences)',
        missing_context: 'string[] (only when analysis cannot be run)'
      },
      guardrails: [
        'Mandatory: every feasibility ships with a Premortem Analysis section or a visible PREMORTEM PENDING banner — never silently without it.',
        'One premortem per project version; re-run only on material scope change (tracked via premortem_version).',
        'RESHAPE or DECLINE flags the project record (premortem_flagged) and notifies Manny before any commitment reaches the requestor.',
        'Anti-sycophancy: no softening language, no "but they learned a lot" framings.'
      ]
    }
  }
];

// The four always-on agents that already existed in this pipeline, surfaced so
// the registry reflects the full intake bench (not just the new department).
const EXISTING_AGENTS = [
  { agent_type: 'triage',    name: 'Inbox Triage',            department: 'Intake',            description: 'Feasibility assessment: fit score, regulatory flags, portfolio synergies, bilingual stakeholder questions, go/no-go. Now auto-chains Claude Premortem.' },
  { agent_type: 'senior_ba', name: 'Senior Business Analyst', department: 'Business & Strategy', description: 'Decks, business plans, market research, strategy memos.' },
  { agent_type: 'research',  name: 'Research Brief',          department: 'Research',          description: 'Web search + synthesis; competitive scans, regulatory checks, partner shortlists.' },
  { agent_type: 'draft',     name: 'Outreach Drafter',        department: 'Sales & Marketing', description: 'Emails, WhatsApp, follow-ups in EN/ES.' }
];

function catalog() {
  return {
    orchestrator: '/ringlypro-architect',
    generated_at: new Date().toISOString(),
    departments: DEPARTMENTS,
    intake_bench: EXISTING_AGENTS
  };
}

module.exports = { catalog, DEPARTMENTS, EXISTING_AGENTS };
