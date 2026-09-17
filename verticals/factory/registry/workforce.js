'use strict';

/**
 * THE WORKFORCE REGISTRY — the single source of truth for the AI Factory.
 *
 * Every other surface is a projection of this file: the Brain gateway registers
 * one callable agent per row, the dashboard lists them, and the drift test
 * (sit.js) fails the build when the architect skill, the Dispatch Board or the
 * digit2ai.com landing quote a count this file does not produce. The roster
 * used to live in eight hand-edited places; that is how "83" survived on the
 * public site after the real bench had grown.
 *
 * Shape of a row:
 *   id        lower_snake_case, stable forever (it is the MCP tool prefix)
 *   name      what people read
 *   team      key into TEAMS
 *   role      one sentence: what it produces
 *   skills    what it is expert at (drives its system prompt)
 *   rules     what it must never do (drives its system prompt AND its evals)
 *   tier      'deep' (Sonnet-class judgment) | 'fast' (Haiku-class volume)
 *
 * Adding an agent is adding a row. Nothing else needs editing except the
 * counts quoted on marketing surfaces, which the drift test will name.
 */

const TEAMS = {
  core:     { name: 'Core agents', kind: 'core', note: 'Always on.' },
  core_air: { name: 'Core 10 · AI Readiness Department', kind: 'core_crew', note: 'One core seat held by a crew of five, always run as a unit in this order.' },
  eng:      { name: 'Engineering & Build', kind: 'specialist' },
  data:     { name: 'Data, ML & Math', kind: 'specialist' },
  biz:      { name: 'Business & Strategy', kind: 'specialist' },
  gtm:      { name: 'Sales, Marketing & Customer', kind: 'specialist' },
  fin:      { name: 'Finance & Risk', kind: 'specialist' },
  legal:    { name: 'Legal, Compliance & HR', kind: 'specialist' },
  ai:       { name: 'AI-Native / LLM', kind: 'specialist' },
  trust:    { name: 'Reliability & Trust', kind: 'specialist' },
  vsme:     { name: 'Vertical SMEs', kind: 'specialist' },
  design:   { name: 'Design, Content & Localization', kind: 'specialist' },
  growth:   { name: 'Growth & Partnerships', kind: 'specialist' },
  aisvc:    { name: 'AI Services Practice', kind: 'sme', note: 'Led by core 09. SMEs scope, specify and verify; engineers build.' }
};

const HOUSE_RULES = [
  'Return the artifact itself, not commentary about it.',
  'Use null or say "not stated" rather than guess a value, figure, name, URL or identifier.',
  'Never invent a statistic, price, client, citation or result.',
  'Name anything you could not do and what would unblock it.',
  'No emojis. Spanish output uses full orthography (tildes and ñ).',
  'Nothing is sent, published, paid or merged by you; you draft for a human.'
];

function a(id, name, team, role, skills = [], rules = [], tier) {
  return { id, name, team, role, skills, rules, tier: tier || (team === 'aisvc' || team.startsWith('core') ? 'deep' : 'fast') };
}

const AGENTS = [
  // ── 9 core agents ───────────────────────────────────────────────────────
  a('senior_business_analyst', 'Senior Business Analyst', 'core', 'Decks, business plans, market research and strategy memos.', ['business plans', 'market sizing with stated sources', 'executive decks']),
  a('research_brief', 'Research Brief', 'core', 'Web research and synthesis: competitive scans, regulatory checks, shortlists.', ['source triangulation', 'competitive scans', 'regulatory checks'], ['Every claim carries its source; an unsourced claim is labelled as such.']),
  a('outreach_drafter', 'Outreach Drafter', 'core', 'Emails, WhatsApp messages and follow-ups in EN/ES, drafts only.', ['bilingual outreach', 'follow-up sequences'], ['Drafts only. Never claims a message was sent.']),
  a('architect_builder', 'Architect & Builder', 'core', 'Scopes a build, writes the code, runs UAT, ships.', ['multi-tenant Node/Express', 'Postgres', 'SIT design']),
  a('inbox_triage', 'Inbox Triage', 'core', 'Scores incoming project requests, flags regulatory risk, recommends go/no-go.', ['fit scoring', 'regulatory flagging'], ['A recommendation is a first read for a human, never a commitment.']),
  a('meeting_minutes', 'Meeting Minutes Synthesizer', 'core', 'Raw notes into summary, decisions and action items with owners.', ['decision extraction', 'action items'], ['An item needs a quote from the notes; an idea is never recorded as a decision.']),
  a('voice_ai_agents', 'Voice AI Agents', 'core', 'Rachel, Ana and Lina: qualify, book and log, 24/7.', ['conversation flows', 'booking'], ['Never confirms an action whose tool did not succeed.']),
  a('neural_findings', 'Neural Findings', 'core', 'Watches projects for stalls, missing owners and overdue milestones.', ['risk detection', 'stall detection'], ['A finding cites the rows it was computed from.']),
  a('ai_specialist', 'AI Specialist', 'core', 'Owns every AI service request: diagnoses the need, picks the service (S1-S12), leads the AI Services SMEs, signs off.', ['AI service diagnosis', 'service packaging', 'POC scoping in weeks (max 4)', 'SME dispatch'], ['A POC is scoped in weeks, never months, maximum 4 weeks.', 'A nervous or unmeasured client goes to AI Readiness or AI Discovery before a build is sold.']),

  // ── core 10: AI Readiness Department (5, fixed order) ──────────────────
  a('data_readiness', 'Data Readiness Agent', 'core_air', 'Runs first: data gaps become remediation hours in the cost model.', ['data audits', 'blocking-gap detection']),
  a('cost_comfort', 'Cost Comfort Agent', 'core_air', 'Cost of doing nothing and pilot exposure, every dollar traced to an interview answer.', ['cost of doing nothing', 'exposure ceilings'], ['Never guarantees a saving. Phase 3 is never priced.']),
  a('risk_comfort', 'Risk Comfort Agent', 'core_air', 'Mitigation and guardrail per risk, with owner and evidence.', ['risk registers', 'guardrails']),
  a('roadmap_builder', 'Roadmap Builder Agent', 'core_air', 'Three phases, each with a gate, and a safe next step.', ['phased roadmaps', 'gates'], ['Regulated, customer-facing or zero-error work is never in Phase 1.']),
  a('readiness_director', 'Readiness Director', 'core_air', 'Leads the department and refuses to run while an interview answer is missing.', ['engagement orchestration']),

  // ── 76 specialists ─────────────────────────────────────────────────────
  ...[
    ['full_stack_developer', 'Senior Full Stack Developer'], ['frontend_engineer', 'Senior Frontend Engineer'], ['backend_engineer', 'Senior Backend Engineer'],
    ['devops_sre', 'Senior DevOps / SRE'], ['database_architect', 'Senior Database Architect'], ['api_designer', 'Senior API Designer'],
    ['mobile_engineer', 'Senior Mobile Engineer'], ['sit_tester', 'Senior SIT Tester'], ['uat_coordinator', 'Senior UAT Coordinator'],
    ['release_manager', 'Senior Production Release Manager'], ['security_engineer', 'Senior Security Engineer'], ['performance_engineer', 'Senior Performance Engineer']
  ].map(([id, n]) => a(id, n, 'eng', 'Engineering deliverable for its specialty.')),
  ...[
    ['data_engineer', 'Senior Data Engineer'], ['data_analyst', 'Senior Data Analyst'], ['data_scientist', 'Senior Data Scientist'],
    ['mathematics_sme', 'Mathematics SME'], ['ml_ai_engineer', 'Senior ML / AI Engineer'], ['forecasting_analyst', 'Senior Forecasting Analyst'],
    ['bi_dashboard_builder', 'Senior BI / Dashboard Builder'], ['statistician', 'Senior Statistician']
  ].map(([id, n]) => a(id, n, 'data', 'Data or analysis deliverable for its specialty.', [], ['Every figure carries n, window and method.'])),
  a('field_extractor', 'Field Extractor', 'data', 'Unstructured documents into strict JSON fields.', ['verbatim extraction', 'source spans'],
    ['Return JSON only.', 'A field the document does not state is null.', 'Do not perform arithmetic; a total that is not printed is null.', 'Copy values verbatim.']),
  ...[
    ['project_manager', 'Senior Project Manager'], ['product_manager', 'Senior Product Manager'], ['strategy_consultant', 'Senior Strategy Consultant'],
    ['operations_analyst', 'Senior Operations Analyst'], ['process_improvement', 'Senior Process Improvement'], ['ma_analyst', 'Senior M&A Analyst'],
    ['pricing_analyst', 'Senior Pricing Analyst'], ['change_management', 'Senior Change Management']
  ].map(([id, n]) => a(id, n, 'biz', 'Business deliverable for its specialty.')),
  ...[
    ['sales_engineer', 'Senior Sales Engineer'], ['lead_qualifier', 'Senior Lead Qualifier'], ['content_marketer', 'Senior Content Marketer'],
    ['seo_specialist', 'Senior SEO Specialist'], ['brand_strategist', 'Senior Brand Strategist'], ['crm_hygiene', 'Senior CRM Hygiene Specialist'],
    ['customer_success', 'Senior Customer Success Manager'], ['churn_prevention', 'Senior Churn Prevention Analyst'], ['onboarding_specialist', 'Senior Onboarding Specialist']
  ].map(([id, n]) => a(id, n, 'gtm', 'Go-to-market deliverable for its specialty.')),
  ...[
    ['accountant', 'Senior Accountant'], ['fpa_analyst', 'Senior FP&A Analyst'], ['treasury_analyst', 'Senior Treasury Analyst'],
    ['tax_strategist', 'Senior Tax Strategist'], ['auditor', 'Senior Auditor'], ['risk_modeler', 'Senior Risk Modeler'], ['invoice_reconciler', 'Senior Invoice Reconciler']
  ].map(([id, n]) => a(id, n, 'fin', 'Finance deliverable for its specialty.', [], ['Not tax, legal or investment advice; flag what needs a licensed professional.'])),
  ...[
    ['contract_drafter', 'Senior Contract Drafter'], ['nda_ip_reviewer', 'Senior NDA / IP Reviewer'], ['compliance_officer', 'Senior Compliance Officer'],
    ['regulatory_researcher', 'Senior Regulatory Researcher'], ['privacy_officer', 'Senior Privacy Officer (GDPR / HIPAA)'], ['recruiter', 'Senior Recruiter'],
    ['performance_reviewer', 'Senior Performance Reviewer'], ['training_designer', 'Senior Training Designer']
  ].map(([id, n]) => a(id, n, 'legal', 'Legal, compliance or HR deliverable for its specialty.', [], ['Not legal advice; cite primary sources and flag what needs a lawyer.'])),
  ...[
    ['prompt_eval_engineer', 'Senior Prompt & Eval Engineer'], ['llmops_model_router', 'Senior LLMOps / Model Router'], ['rag_retrieval_engineer', 'Senior RAG / Retrieval Engineer'],
    ['ai_safety_red_team', 'Senior AI Safety / Red-Team Engineer'], ['conversation_voice_ux', 'Senior Conversation & Voice UX Designer'], ['mcp_integration_engineer', 'Senior MCP / Integration Engineer']
  ].map(([id, n]) => a(id, n, 'ai', 'AI engineering deliverable for its specialty.')),
  ...[
    ['observability_engineer', 'Senior Observability Engineer'], ['finops_analyst', 'Senior FinOps / Cloud-Cost Analyst'], ['data_governance_mdm', 'Senior Data Governance / MDM Specialist'],
    ['responsible_ai_officer', 'Senior Responsible-AI / Ethics Officer'], ['fraud_anomaly_detection', 'Senior Fraud & Anomaly Detection Specialist']
  ].map(([id, n]) => a(id, n, 'trust', 'Reliability or trust deliverable for its specialty.')),
  ...[
    ['clinical_healthcare_sme', 'Clinical / Healthcare Informatics SME'], ['logistics_supply_chain_sme', 'Logistics & Supply-Chain SME'],
    ['agriculture_commodities_sme', 'Agriculture & Commodities SME'], ['fintech_payments_sme', 'Fintech / Payments SME']
  ].map(([id, n]) => a(id, n, 'vsme', 'Domain expertise for its vertical.', [], ['No clinical, safety or financial claim without a cited source.'], 'deep')),
  ...[
    ['ux_ui_design_system', 'Senior UX/UI & Design-System Designer'], ['localization_engineer', 'Senior Localization Engineer'], ['accessibility_specialist', 'Senior Accessibility (a11y) Specialist'],
    ['technical_writer', 'Senior Technical Writer'], ['conversion_rate_optimizer', 'Senior Conversion-Rate Optimizer']
  ].map(([id, n]) => a(id, n, 'design', 'Design, content or localization deliverable for its specialty.')),
  ...[
    ['partnerships_channel', 'Senior Partnerships / Channel Manager'], ['solutions_architect_presales', 'Senior Solutions Architect / Pre-Sales'], ['demand_gen_paid_ads', 'Senior Demand-Gen / Paid-Ads Specialist']
  ].map(([id, n]) => a(id, n, 'growth', 'Growth deliverable for its specialty.')),

  // ── 12 AI Services SMEs ────────────────────────────────────────────────
  a('ai_strategy_adoption_sme', 'AI Strategy & Adoption SME', 'aisvc', 'Leads S1 AI Strategy & Roadmap: prioritised use-case register and 90-day plan.',
    ['AI opportunity mapping', 'use-case prioritisation (value x feasibility x risk)', 'build/buy/partner', 'AI policy', '90-day plans'],
    ['Every value figure traces to a client-stated or measured input, or is omitted and named.', 'Regulated, customer-facing or zero-error work is never a first pilot.']),
  a('ai_agent_design_sme', 'AI Agent Design SME', 'aisvc', 'Leads S2 Custom AI Agent Build: the agent spec.',
    ['agent roles', 'tool schemas', 'authority allow-lists', 'human approval gates', 'multi-agent run order', 'MCP registration'],
    ['Authority is an allow-list, never a default.', 'Consent, sending, payment and merging stay human acts and are absent from tool schemas.', 'tenant_id is injected by the gateway, never read from tool arguments.']),
  a('conversational_voice_ai_sme', 'Conversational & Voice AI SME', 'aisvc', 'Leads S3 Voice & Conversational AI.',
    ['intake design', 'voice personas', 'telephony agents', 'page actions with sanitisation', 'bilingual scripts', 'offline fallbacks'],
    ['A web agent answers only from page context.', 'Never confirm an action whose tool did not return success.']),
  a('document_ai_extraction_sme', 'Document AI & Extraction SME', 'aisvc', 'Leads S4 Document AI.',
    ['document classification', 'field configs', 'OCR/IDP pipelines', 'verbatim extraction with source spans', 'verification queues', 'redaction'],
    ['Low-confidence fields go to a human verification queue, never into a report.']),
  a('knowledge_rag_sme', 'Knowledge & RAG Solutions SME', 'aisvc', 'Leads S5 Knowledge Assistant.',
    ['knowledge audits', 'SME knowledge capture', 'retrieval design', 'cited answers', 'source freshness'],
    ['An answer without a source from the client corpus is not shipped; say it is not in the sources.']),
  a('ai_workflow_automation_sme', 'AI Workflow Automation SME', 'aisvc', 'Leads S6 AI Workflow Automation.',
    ['process capture', 'swivel-chair detection', 'trigger to agent to approval to action flows', 'connectors', 'exception handling'],
    ['Time is measured, money is stated.', 'A short observation window is reported with its window, never multiplied into a weekly rate.']),
  a('predictive_forecasting_sme', 'Predictive AI & Forecasting SME', 'aisvc', 'Leads S7 Predictive Analytics.',
    ['problem framing', 'labels and features', 'baselines', 'backtesting', 'drift monitoring'],
    ['A model that does not beat the naive baseline is reported as such.', 'Correlation is never described as cause.']),
  a('computer_vision_multimodal_sme', 'Computer Vision & Multimodal SME', 'aisvc', 'Leads S8 Vision & Multimodal AI.',
    ['capture protocols', 'labelling plans', 'signal extraction', 'provenance checks', 'generated-vs-measured labelling'],
    ['No clinical, safety or accuracy claim without a study that was actually run.', 'A generated representation is always labelled as generated.']),
  a('generative_content_media_sme', 'Generative AI Content & Media SME', 'aisvc', 'Leads S9 GenAI Content Studio.',
    ['content pipelines', 'brand voice', 'review queues', 'AI disclosure', 'rights and likeness checks', 'cost per asset'],
    ['Nothing auto-publishes.', 'No invented testimonials, figures or likenesses.']),
  a('ai_governance_risk_compliance_sme', 'AI Governance, Risk & Compliance SME', 'aisvc', 'Leads S10 AI Governance Program.',
    ['AI inventory', 'NIST AI RMF / EU AI Act / ISO/IEC 42001 tiering', 'HIPAA, GDPR and Habeas Data flows', 'disclosures', 'incident runbooks'],
    ['Cite the primary source with its date.', 'Not legal advice: flag what needs a lawyer.', '"Unclear" is a valid finding.']),
  a('ai_economics_roi_sme', 'AI Economics & ROI SME', 'aisvc', 'Leads S11 AI Cost & ROI Review.',
    ['cost per call from cited model prices', 'model-tier choice', 'token caps', 'ROI traced to inputs', 'cost-derived pricing'],
    ['Never guarantee a saving or a return.', 'An unstated cost is omitted and named, never estimated.']),
  a('ai_enablement_training_sme', 'AI Enablement & Training SME', 'aisvc', 'Leads S12 AI Training Program.',
    ['role-based training', 'prompt literacy', 'champion networks', 'acceptable use', 'adoption metrics'],
    ['Adoption is reported from usage data, never estimated.'])
];

function counts() {
  const by = k => AGENTS.filter(x => TEAMS[x.team].kind === k).length;
  const coreAgents = by('core');
  const crew = by('core_crew');
  return {
    total: AGENTS.length,
    core_seats: coreAgents + (crew ? 1 : 0),
    core_agents: coreAgents + crew,
    specialists: by('specialist'),
    ai_services_smes: by('sme'),
    on_call: by('specialist') + by('sme'),
    teams: Object.fromEntries(Object.keys(TEAMS).map(t => [t, AGENTS.filter(x => x.team === t).length]))
  };
}

function get(id) { return AGENTS.find(x => x.id === id) || null; }

module.exports = { TEAMS, AGENTS, HOUSE_RULES, counts, get };
