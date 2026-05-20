'use strict';

/**
 * SurgicalMind NLP Sales Chatbot — POST /api/v1/chat
 *
 * Lets reps ask any natural-language question about hospitals, surgeons, payments,
 * procedure volumes, business plans, surveys. Grounded in the public-source data
 * layer Phase A built (CMS HCRIS, Open Payments, MPUP, NPI Registry, IRS 990,
 * FL AHCA) plus internal Project / Survey / BusinessPlan tables.
 *
 * Architecture:
 *   - Anthropic Claude Sonnet 4 with tool-use
 *   - Prompt caching: system prompt + tool definitions + DB schema cached (5-min TTL)
 *   - Streaming SSE: text deltas + tool calls + tool results forwarded as events
 *   - 10 tools, all parameterized SQL via Sequelize
 *   - Per-user daily message cap, audit logging
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const surgeonTargetingService = require('../services/surgeon-targeting-service');

const SONNET_MODEL = 'claude-sonnet-4-20250514';
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

// ─── System prompt (cached) ───────────────────────────────────
const SYSTEM_PROMPT = `You are the SurgicalMind sales assistant for Intuitive Surgical commercial reps.
You answer questions about hospitals, surgeons, robotic surgery programs, and pipeline using
ONLY the tools provided. NEVER fabricate hospital, surgeon, or payment data — if a tool can't
answer, say so explicitly.

Every answer must:
  1. Cite the source(s) — show source_name and a clickable source_url for every numeric claim
  2. Be actionable — link to the in-app workflow (Report, Business Plan, Survey) when relevant
  3. Be terse — reps don't read paragraphs; use markdown tables, bullets, numbers
  4. Highlight champions — surgeons with high Intuitive payments and high robotic case volumes
     are leverage points

LINK RENDERING RULES (CRITICAL — never violate):
  - When citing a PMID, render as: [PMID 12345678](https://pubmed.ncbi.nlm.nih.gov/12345678/)
    NEVER paste the raw search URL with %20 / %5B encoding into the visible text.
  - When citing a clinical trial, render as: [NCT01234567](https://clinicaltrials.gov/study/NCT01234567)
  - When citing a source, render as: [Source name](url) — always use the markdown link form,
    NEVER a bare URL. The UI does not auto-linkify bare URLs.
  - The tool responses include {pmid, url} pairs and {nct_id, url} pairs — use those exactly.

Examples of well-formed answers:
  Q: "Top 10 robotic candidates in Florida"
  A: A markdown table with hospital, beds, current robotic %, projected gap. Each row
     deep-links to /intuitive/report/<project_id> when the hospital is already a project.

  Q: "Which surgeons at Tampa General received the most Intuitive payments?"
  A: A markdown list with NPI, name, specialty, payment $, robotic cases. Suggest sending
     a survey to the top 5 with: "Want me to send a surgeon survey to these 5? (Confirm)".

For destructive/state-changing actions (send_surgeon_survey, start_business_plan), END YOUR
RESPONSE with a JSON action block the UI will render as a Confirm button:

  \`\`\`action
  { "type": "confirm", "label": "Send survey to top 5 surgeons at Tampa General",
    "tool": "send_surgeon_survey", "args": { ... } }
  \`\`\`

Do NOT call the destructive tool until the user confirms.

Read-only queries (query_*, get_*, compare_*, search_*) execute immediately without confirmation.

CONVERSATION CONTEXT — CARRY IT FORWARD AUTOMATICALLY:
The user is having a CONVERSATION, not asking isolated questions. When a follow-up
message references prior context (implicitly or explicitly), reuse what you already
have. DO NOT re-ask the user for things already established in the conversation.

  - Hospitals discussed in a prior turn → carry forward when the user changes the
    procedure / specialty / year. "Also for hysterectomy" / "what about ventral
    hernia?" / "now show me bariatric" → re-call compare_hospital_procedure_volumes
    with the SAME hospital_ccns/hospital_names as the prior turn and the new procedure.

  - Surgeons discussed in a prior turn → carry forward to enrich_surgeon or
    draft_outreach. "Tell me more about her" / "draft an email to him" → use the
    surgeon name/NPI from the most recent surgeon-mentioning response.

  - Project / hospital being briefed → carry forward across follow-ups. After
    generate_briefing for AdventHealth Orlando: "draft outreach to the top KOL"
    means the top KOL from THAT briefing, not a fresh lookup.

  - Specialty filters / fiscal years / tier filters → carry forward unless the
    user explicitly changes them.

  - Phrases that signal context-reuse, NEVER ask for clarification on:
    "also", "and for", "what about", "now show", "now compare", "the same",
    "those", "them", "him/her", "that hospital", "the top one", "add X", "just X",
    "filter to", "only the X ones", "instead of X try Y"

  - When in doubt: pick the most recent matching entity from the prior turn and
    proceed. The user can always say "no, different hospitals" — but you should
    NEVER make them re-list the hospitals they just compared.

DATA SOURCE GUIDANCE — PICK THE RIGHT TOOL:
  - "Find surgeons in <city/state>" / "top surgeons in <territory>" / "who's in <region>?"
      → use search_surgeons_by_territory (LIVE CMS NPPES + MPUP + Open Payments)
  - "Surgeons at <hospital>" / "who works at <hospital name>?" / "rank <hospital> docs"
      → use search_surgeons_by_hospital (Care Compare-backed, sub-second)
  - "Surgeons at <existing project hospital>" where we already have a project
      → use query_surgeons (project-bound rep curated data)
  - "Top robotic candidates" / "best opportunities in <market>"
      → use search_surgeons_by_territory, sort by target_score, surface Tier A
  - "Tell me about Dr. X" / "Is <surgeon> a KOL?" / "publications of <name>" /
    "trials run by <surgeon or NPI>" / "academic profile of <name>"
      → use enrich_surgeon. Returns publications (5yr), active trials, KOL score + badge.
      ALWAYS check identity_ambiguous flag — if true, surface the caveat in the answer
      so the rep knows the result may include other people with the same name.
  - "Draft an email to Dr. X" / "Outreach to NPI Y" / "Compose a note to <surgeon>" /
    "Write a meeting request for <surgeon>"
      → use draft_outreach. The tool returns personalization material + drafting instructions.
      You write the actual email body. RULES:
        - Use ONLY personalization_hooks from the response. Do not invent papers / trials / titles.
        - Pick ONE subject line from suggested_subject_lines.
        - Email body ≤ 120 words.
        - Render the answer as:
          **Subject:** <chosen subject>
          ---
          Hi Dr. <last name>,
          <body, 80-120 words, referencing 1-2 hooks naturally>
          <CTA per cta_guidance>
          Best,
          <rep.name>
          <rep.title>
          ---
          ### Personalization hooks used
          - <hook 1>
          - <hook 2>
        - If identity_low_confidence is true, skip the research/trials hooks entirely
          and lead with hospital affiliation only. Warn the rep at the bottom.
  - "How many [procedure-type] discharges does [hospital] do as Medicare?" /
    "Institutional volume at <hospital>" / "DRG breakdown for hospital X" /
    "Top surgical DRGs at this hospital"
      → use query_hospital_drg_volumes (hospital_ccn required). This reads CMS's
      direct hospital-level MS-DRG counts — more accurate than summing surgeon MPUP.
      Pass surgical_only=true to filter to surgical DRGs. Render as a markdown
      table with DRG code, description, discharges, avg Medicare payment.
  - "Compare X vs Y vs Z for [list of procedures]" / "Hospital A market share vs competitors
    for prostatectomy/hysterectomy/hernia" / "Volume cross-tab for these hospitals" /
    "Who does the most [procedure] in [region]?" (when ≥2 hospitals named)
      → ALWAYS use compare_hospital_procedure_volumes — ONE call, not N×M. Pass
      procedure_families[] when possible (e.g. ["prostatectomy","hysterectomy_benign",
      "ventral_hernia"]) — the library expands each family to its CPT codes automatically.
      DO NOT loop query_procedure_volumes for each (hospital,procedure) pair — that
      exhausts the tool budget. Render the result as a markdown table:
        | Hospital | Family A | Family B | Family C | Total |
        |----------|----------|----------|----------|-------|
        | ORMC     | 142 (38%) | 88 (29%) | ... | 412 |
        | Advent   | 130 (35%) | 102 (33%) | ... | 389 |
      Cell format: "volume (share%)". Include the fiscal_year_used and cite both
      CMS Care Compare + CMS MPUP.
  - "Build a business plan for project X" / "Generate proforma for project 96" /
    "Give me an ROI for <hospital>" / "Create a draft plan with auto-seeded surgeons"
      → use generate_business_plan. Creates a draft plan + auto-seeds surgeon commitments
      from analysis + CMS data + computes ROI. Render the response as:
        ## Business Plan Generated — <hospital name>
        ### Plan setup
        - System: <system_type> × <quantity> at $<system_price>
        - Service cost: $<annual_service_cost>/yr
        ### Auto-seeded commitments
        - <seeded count> surgeons seeded from <roster_source>
        - Total incremental cases/yr: <totals.totalCases>
        - Revenue impact: $<totals.totalRevenue>
        ### ROI
        - Total combined ROI: $<totals.totalROI>/yr
        - Payback: <payback> months
        - 5-year net benefit: $<fiveYearNet>
        ### Next step
        [Open plan in workflow](<deep_link>) — refine commitments, send a surgeon survey
        to overwrite auto-seeded rows with first-party data.
        ### Sources (markdown links)
  - "Brief me on <hospital>" / "Prep for my meeting at <hospital>" / "Rundown on <hospital>" /
    "What should I know before I see <hospital>?" / "Intel on <hospital>"
      → use generate_briefing. The flagship demo tool. Returns a complete intel sheet:
      hospital profile, top 5 surgeons (with KOL enrichment), Intuitive $ exposure aggregate,
      pre-built talking points, suggested actions. Render the answer in this structure:
        ## Pre-Meeting Briefing — <hospital name>
        ### At a glance
        (4-5 KPI bullets: tier_a_count, total Intuitive $, total robotic cases, project status)
        ### Top 5 surgeons (markdown table: name, specialty, target score, tier, KOL badge)
        ### Talking points (numbered list, lift directly from talking_points[])
        ### Recommended next actions (link to suggested_actions[] deep links)
        ### Sources (markdown links from citations)

NEVER fabricate surgeon names or numbers. If a search returns 0 results, say so.
The targeting tools return target_score (0-100) and tier (A/B/C/D). Tier A = "Convert Now"
based on Medicare robotic volume + Intuitive payment history + recency. Always show these.
The enrich_surgeon tool returns kol_score + kol_badge — surface these when the user asks
about thought leaders, researchers, or academic standing.`;

// ─── Tool definitions (cached) ────────────────────────────────
const TOOLS = [
  {
    name: 'query_hospitals',
    description: 'Query hospitals from the SurgicalMind project list, joined with HCRIS / Florida AHCA / CMS Hospital Compare. Use for "show me hospitals in X", "top N by surgical volume", etc.',
    input_schema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'Two-letter state code (e.g. FL)' },
        min_beds: { type: 'integer' },
        max_beds: { type: 'integer' },
        hospital_type: { type: 'string', enum: ['academic', 'community', 'rural', 'specialty', 'VA', 'military'] },
        has_robotic_program: { type: 'boolean' },
        min_surgical_volume: { type: 'integer' },
        stage: { type: 'string', description: 'Filter by project stage: planning, analyzed, proposed, won' },
        order_by: { type: 'string', enum: ['beds', 'surgical_volume', 'updated_at'], description: 'Sort field' },
        limit: { type: 'integer', description: 'Default 20, max 100' },
      },
    },
  },
  {
    name: 'query_surgeons',
    description: 'Query surgeons from the NPI Registry / Open Payments / MPUP cache. Filter by hospital, specialty, robotic-case volume, Intuitive payments.',
    input_schema: {
      type: 'object',
      properties: {
        hospital_id: { type: 'integer' },
        hospital_name: { type: 'string' },
        specialty: { type: 'string', description: 'urology, gynecology, general, thoracic, colorectal, head_neck' },
        min_robotic_cases_last_year: { type: 'integer' },
        min_intuitive_payments_2yr: { type: 'integer' },
        limit: { type: 'integer' },
      },
    },
  },
  {
    name: 'query_intuitive_payments',
    description: 'Query the CMS Open Payments table directly. Use to surface Intuitive payment rows by NPI, hospital, year.',
    input_schema: {
      type: 'object',
      properties: {
        npi: { type: 'string' },
        fiscal_year: { type: 'integer' },
        min_amount: { type: 'number' },
        limit: { type: 'integer' },
      },
    },
  },
  {
    name: 'query_procedure_volumes',
    description: 'Query CMS Physician Procedure Volume (MPUP). Filter by NPI, HCPCS code (robotic-relevant), fiscal year.',
    input_schema: {
      type: 'object',
      properties: {
        npi: { type: 'string' },
        hcpcs_code: { type: 'string' },
        fiscal_year: { type: 'integer' },
        min_services: { type: 'integer' },
        limit: { type: 'integer' },
      },
    },
  },
  {
    name: 'search_surgeons_by_territory',
    description: 'AcuityMD-style territory intelligence. Returns LIVE CMS-ranked surgeons in a state/ZIP area, with target_score (0-100) and tier (A/B/C/D) computed from Medicare robotic case volume (MPUP) + Intuitive Surgical $ exposure (Open Payments) + recency. This is the right tool for any "find/rank/top surgeons in <city or state>" question. Use specialty="urology|gynecology|general|thoracic|colorectal|head_neck|all". Pass enrich_kol=true to also fetch PubMed publications + ClinicalTrials.gov active PI status (adds ~15s).',
    input_schema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: '2-letter US state code (FL, CA, TX, NY)' },
        zips: { type: 'array', items: { type: 'string' }, description: 'Optional 5-digit ZIPs to narrow the territory' },
        specialty: { type: 'string', enum: ['all', 'urology', 'gynecology', 'general', 'thoracic', 'colorectal', 'head_neck'], description: 'Surgical specialty filter' },
        limit: { type: 'integer', description: 'How many to return. Default 25, max 200.' },
        enrich_kol: { type: 'boolean', description: 'If true, enrich top 25 with PubMed + ClinicalTrials.gov. Slower (~15s). Use when user asks about "KOL", "thought leaders", "researchers", or "publications".' },
      },
      required: ['state'],
    },
  },
  {
    name: 'search_surgeons_by_hospital',
    description: 'Rank every surgeon at a specific hospital. Uses CMS Care Compare hospital affiliation data. Faster than territory search (sub-second). The right tool for "surgeons at <hospital>", "who works at <hospital>", "rank <hospital> docs". Provide hospital_name (fuzzy match) OR hospital_ccn (CMS 6-digit ID).',
    input_schema: {
      type: 'object',
      properties: {
        hospital_name: { type: 'string', description: 'Hospital name (case-insensitive fuzzy match). E.g. "Baptist Health", "Mount Sinai".' },
        hospital_ccn: { type: 'string', description: 'CMS Hospital CCN (6 digits), preferred when known.' },
        specialty: { type: 'string', description: 'Optional substring filter on primary specialty.' },
      },
    },
  },
  {
    name: 'generate_business_plan',
    description: 'BUSINESS PLAN AUTOMATION — for a project that already has analysis complete, this creates a draft business plan AND auto-seeds surgeon commitments from analysis + Care Compare + MPUP, then runs the calculation. Returns total_combined_roi, payback_months, five_year_net_benefit, and a deep link. Use for "build a business plan for project X", "generate proforma for project 96", "give me an ROI for <hospital>". State-changing (creates a plan row) but does not send anything externally — auto-execute without confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer', description: 'SurgicalMind project ID (e.g. 96). Required.' },
        plan_name: { type: 'string', description: 'Optional plan name. Default: "Auto-generated Plan <date>".' },
        prepared_by: { type: 'string', description: 'Optional rep name for the prepared_by field.' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'draft_outreach',
    description: 'Gather personalization material for an outbound email to a specific surgeon. Returns the surgeon\'s real publications, active clinical trials, recent Intuitive payment history, primary specialty, hospital affiliation, and a short list of suggested talking points. The assistant then writes the email using ONLY the material in this response (no fabrication). Use for "draft an email to <surgeon>", "outreach to NPI X", "compose a note to Dr. Y referencing their robotic work". message_type controls tone: intro / follow_up / meeting_request / event_invite / product_update.',
    input_schema: {
      type: 'object',
      properties: {
        surgeon_npi: { type: 'string', description: '10-digit NPI (preferred when known).' },
        surgeon_name: { type: 'string', description: 'Full surgeon name (required if NPI not provided).' },
        message_type: { type: 'string', enum: ['intro', 'follow_up', 'meeting_request', 'event_invite', 'product_update'], description: 'Email tone / purpose. Default: intro.' },
        rep_name: { type: 'string', description: 'Rep\'s own name (will be used as the signature).' },
        rep_title: { type: 'string', description: 'Rep\'s title, e.g. "Intuitive Area Sales Manager".' },
        custom_context: { type: 'string', description: 'Optional rep-specific context (e.g. "saw your AUA talk last month").' },
      },
    },
  },
  {
    name: 'generate_briefing',
    description: 'BRIEFING MODE — generate a complete pre-meeting intel sheet for a hospital. Returns: hospital identity + CMS profile, top 5 surgeons with target_score and KOL enrichment (publications, active trials), aggregate Intuitive relationship strength ($ paid, surgeons engaged), pre-built talking points, and suggested next actions. Use for "brief me on <hospital>", "prep for my meeting at <hospital>", "what do I need to know about <hospital>", "rundown on <hospital>". This is the highest-value tool — chain it whenever the rep mentions an upcoming meeting or asks for hospital intel.',
    input_schema: {
      type: 'object',
      properties: {
        hospital_name: { type: 'string', description: 'Hospital name (fuzzy match). E.g. "Mount Sinai", "Baptist Health".' },
        hospital_ccn: { type: 'string', description: 'CMS 6-digit hospital CCN (preferred when known).' },
        state: { type: 'string', description: 'Optional 2-letter state code to disambiguate common hospital names.' },
      },
    },
  },
  {
    name: 'query_hospital_drg_volumes',
    description: 'Hospital-level Medicare DRG discharge counts — direct from CMS, no surgeon aggregation needed. More accurate than summing surgeon MPUP volume when the question is about institutional volume ("how many <procedure-type> discharges does <hospital> have?"). Filter by hospital_ccn (required) + drg_codes[] or surgical_only=true to filter to surgical MS-DRGs. Returns DRG-level discharge counts + Medicare payment averages, fiscal year, and a summary block.',
    input_schema: {
      type: 'object',
      properties: {
        hospital_ccn: { type: 'string', description: '6-digit CMS hospital CCN.' },
        drg_codes: { type: 'array', items: { type: 'string' }, description: 'Specific MS-DRG codes (e.g. ["470","743"]).' },
        surgical_only: { type: 'boolean', description: 'If true, filter to surgical MS-DRGs only.' },
        fiscal_year: { type: 'integer', description: 'Optional: defaults to latest year available.' },
      },
      required: ['hospital_ccn'],
    },
  },
  {
    name: 'compare_hospital_procedure_volumes',
    description: 'Cross-tabulate Medicare procedure volumes across multiple hospitals in ONE call. Use for any "compare X hospital vs Y hospital for these procedures" or "ORMC market share vs Orlando competitors for prostatectomy/hysterectomy/hernia" question. Accepts hospital_ccns[] OR hospital_names[] (fuzzy ILIKE match), and hcpcs_codes[] OR procedure_families[] (slugs from the library: prostatectomy, partial_nephrectomy, radical_nephrectomy, cystectomy, hysterectomy_benign, hysterectomy_oncology, myomectomy, cholecystectomy, ventral_hernia, inguinal_hernia, colectomy, rectal_resection, lobectomy, thymectomy, esophagectomy, bariatric_sleeve, gastric_bypass, tors). Returns a hospital×family cross-tab matrix with volume, surgeon_count, share_pct (per-family Medicare share among the queried hospitals), and top 3 surgeons per cell. CRITICAL: prefer this over calling query_procedure_volumes multiple times — it does N×M lookups in 1 round-trip and conserves your tool budget.',
    input_schema: {
      type: 'object',
      properties: {
        hospital_ccns: { type: 'array', items: { type: 'string' }, description: 'CMS hospital CCNs (preferred when known).' },
        hospital_names: { type: 'array', items: { type: 'string' }, description: 'Hospital names for fuzzy ILIKE match (use when CCNs unknown).' },
        hcpcs_codes: { type: 'array', items: { type: 'string' }, description: 'Explicit CPT/HCPCS codes (e.g. ["55866","58571"]).' },
        procedure_families: { type: 'array', items: { type: 'string' }, description: 'Family slugs from the hcpcs-families library.' },
        fiscal_year: { type: 'integer', description: 'Optional: specific year (defaults to latest MPUP year available).' },
      },
    },
  },
  {
    name: 'enrich_surgeon',
    description: 'Deep-dive on a single surgeon: PubMed publications in last 5 years + ClinicalTrials.gov active PI status (industry-sponsored flag, Intuitive-sponsored flag) + computed KOL score (0-100) and badge (Key Opinion Leader / Research-Active / Publishing). Use for "tell me about Dr. X", "is <surgeon> a KOL?", "publications of <name>", "trials run by NPI 1234567890". Provide full_name (preferred) or npi. Identity-resolution dampens counts on ambiguous names so the LLM does not over-trust common-name results.',
    input_schema: {
      type: 'object',
      properties: {
        full_name: { type: 'string', description: 'Surgeon full name (e.g. "John Smith MD"). Required if NPI is not provided.' },
        npi: { type: 'string', description: '10-digit NPI. If provided alone, will be resolved to a name via Care Compare affiliation lookup.' },
        specialty: { type: 'string', description: 'Optional specialty hint (urology/gynecology/general/thoracic/colorectal/head_neck) — boosts identity-resolution confidence.' },
        state: { type: 'string', description: 'Optional 2-letter state — boosts identity-resolution confidence.' },
      },
    },
  },
  {
    name: 'query_business_plans',
    description: 'Query Business Plans for the rep. Filter by project, status, year-1 revenue.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer' },
        status: { type: 'string' },
        min_year_1_revenue: { type: 'number' },
        limit: { type: 'integer' },
      },
    },
  },
  {
    name: 'query_surveys',
    description: 'Query surgeon surveys. Filter by project, status, response count.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer' },
        status: { type: 'string' },
        min_response_count: { type: 'integer' },
        limit: { type: 'integer' },
      },
    },
  },
  {
    name: 'get_project_details',
    description: 'Return full details for a single project including latest analysis_results, business_plans, surveys, recommendations.',
    input_schema: {
      type: 'object',
      properties: { project_id: { type: 'integer' } },
      required: ['project_id'],
    },
  },
  {
    name: 'compare_hospitals',
    description: 'Side-by-side comparison across standard fields (beds, surgical volume, current systems, surgeon counts, payer mix) for 2-5 hospitals.',
    input_schema: {
      type: 'object',
      properties: { hospital_ids: { type: 'array', items: { type: 'integer' } } },
      required: ['hospital_ids'],
    },
  },
  {
    name: 'generate_report_link',
    description: 'Return the in-app URL /intuitive/report/<project_id> for the rep to deep-link into the existing Report module.',
    input_schema: {
      type: 'object',
      properties: { project_id: { type: 'integer' } },
      required: ['project_id'],
    },
  },
  {
    name: 'start_business_plan',
    description: 'Create a draft Business Plan and return the deep-link. STATE-CHANGING — surface a Confirm button before calling.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer' },
        plan_name: { type: 'string' },
      },
      required: ['project_id', 'plan_name'],
    },
  },
  {
    name: 'send_surgeon_survey',
    description: 'Create a survey, add NPIs as recipients, trigger /api/v1/surveys/:id/send. STATE-CHANGING — surface a Confirm button before calling.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer' },
        surgeon_npis: { type: 'array', items: { type: 'string' } },
        survey_title: { type: 'string' },
      },
      required: ['project_id', 'surgeon_npis'],
    },
  },
];

// ─── Tool implementations ─────────────────────────────────────
const TOOL_TIMEOUT_MS = 10000;
const TOOL_TIMEOUTS = {
  // Live CMS territory search hits NPPES (up to 8 ZIPs) + DB joins — 30s ceiling
  search_surgeons_by_territory: 60000,
  // Care Compare DB join is fast but defensive
  search_surgeons_by_hospital: 15000,
  // PubMed + ClinicalTrials.gov in parallel — usually <3s, allow headroom for cold cache
  enrich_surgeon: 20000,
  // Briefing chains hospital lookup + surgeon ranking + KOL enrichment on top 5
  generate_briefing: 45000,
  // Outreach drafting hits multiple data sources for personalization material
  draft_outreach: 25000,
  // Business plan generation: create plan + auto-seed (NPPES + MPUP + OpenPayments) + recalc
  generate_business_plan: 60000,
  // Cross-tab procedure volumes across N hospitals — pure DB joins
  compare_hospital_procedure_volumes: 25000,
  // Hospital × MS-DRG indexed query
  query_hospital_drg_volumes: 10000,
};

async function withTimeout(promise, ms = TOOL_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('tool timeout')), ms)),
  ]);
}

async function tool_query_hospitals(input, ctx) {
  const { Op } = require('sequelize');
  const where = {};
  if (input.state) where.state = String(input.state).toUpperCase();
  if (input.hospital_type) where.hospital_type = input.hospital_type;
  if (input.min_beds || input.max_beds) {
    where.bed_count = {};
    if (input.min_beds) where.bed_count[Op.gte] = input.min_beds;
    if (input.max_beds) where.bed_count[Op.lte] = input.max_beds;
  }
  if (input.min_surgical_volume) where.annual_surgical_volume = { [Op.gte]: input.min_surgical_volume };
  if (input.has_robotic_program === true) where.current_robotic_cases = { [Op.gt]: 0 };
  if (input.has_robotic_program === false) where.current_robotic_cases = { [Op.eq]: 0 };
  if (input.stage) where.status = input.stage.toLowerCase();
  const orderBy = input.order_by === 'beds' ? 'bed_count' : input.order_by === 'surgical_volume' ? 'annual_surgical_volume' : 'updated_at';
  const limit = Math.min(Number(input.limit) || 20, 100);
  const rows = await ctx.models.IntuitiveProject.findAll({
    where,
    order: [[orderBy, 'DESC']],
    limit,
    attributes: ['id', 'project_code', 'hospital_name', 'state', 'hospital_type', 'bed_count', 'annual_surgical_volume', 'current_robotic_cases', 'current_system', 'current_system_count', 'status', 'updated_at'],
  });
  return {
    hospitals: rows.map(r => {
      const j = r.toJSON();
      return { ...j, deep_link: `/intuitive/report/${j.id}` };
    }),
    citations: [{ source_name: 'SurgicalMind project pipeline', source_url: '/intuitive/' }],
  };
}

async function tool_query_surgeons(input, ctx) {
  const { Op } = require('sequelize');
  const where = {};
  if (input.hospital_id) where.project_id = input.hospital_id;
  if (input.specialty) where.surgeon_specialty = { [Op.iLike]: `%${input.specialty}%` };
  const limit = Math.min(Number(input.limit) || 20, 100);

  // Try SurgeonCommitment first (rep-curated) then fall back to confirmed_surgeons in extended_data
  let surgeons = [];
  try {
    const commits = await ctx.models.IntuitiveSurgeonCommitment.findAll({ where, limit });
    surgeons = commits.map(c => {
      const j = c.toJSON();
      return {
        npi: null,
        name: j.surgeon_name,
        specialty: j.surgeon_specialty,
        committed_cases: j.total_incremental_annual,
        source: 'SurgeonCommitment table',
      };
    });
  } catch (e) {}

  // If hospital_name provided, also search via project's extended_data.confirmed_surgeons
  if (input.hospital_name) {
    const proj = await ctx.models.IntuitiveProject.findOne({ where: { hospital_name: { [Op.iLike]: `%${input.hospital_name}%` } } });
    if (proj && proj.extended_data?.confirmed_surgeons?.length) {
      surgeons = proj.extended_data.confirmed_surgeons.filter(s => {
        if (input.specialty && s.specialty && !s.specialty.toLowerCase().includes(input.specialty.toLowerCase())) return false;
        if (input.min_robotic_cases_last_year && (s.robotic_cases_last_yr || 0) < input.min_robotic_cases_last_year) return false;
        if (input.min_intuitive_payments_2yr && (s.intuitive_payments_2yr || 0) < input.min_intuitive_payments_2yr) return false;
        return true;
      }).slice(0, limit).map(s => ({
        ...s,
        source: 'NPI Registry + Open Payments + MPUP',
      }));
    }
  }
  return {
    surgeons,
    citations: [
      { source_name: 'NPI Registry (NPPES)', source_url: 'https://npiregistry.cms.hhs.gov/' },
      { source_name: 'CMS Open Payments', source_url: 'https://openpaymentsdata.cms.gov/' },
      { source_name: 'CMS Medicare Physician Provider Utilization', source_url: 'https://data.cms.gov/' },
    ],
  };
}

async function tool_search_surgeons_by_territory(input, ctx) {
  const result = await surgeonTargetingService.searchByTerritory({
    state: input.state,
    zips: input.zips,
    specialty: input.specialty || 'all',
    limit: Math.min(Number(input.limit) || 25, 200),
    enrich: !!input.enrich_kol,
    enrich_top: 25,
  }, { models: ctx.models });

  // Compact response — the chatbot doesn't need every internal field; keep what matters for ranking + sourcing
  return {
    surgeons: (result.targets || []).map(t => ({
      npi: t.npi,
      name: t.full_name,
      credential: t.credential,
      specialty: t.specialty,
      hospital: t.hospital_name,
      group: t.group_legal_name,
      robotic_cases_last_yr: t.robotic_cases_last_yr,
      intuitive_dollars_2yr: t.intuitive_dollars_2yr,
      last_intuitive_payment: t.last_intuitive_payment,
      target_score: t.target_score,
      tier: t.tier,
      publications_5yr: t.publications_5yr ?? null,
      active_trials: t.active_trials ?? null,
      kol_badge: t.kol_badge ?? null,
      identity_ambiguous: t.identity_ambiguous ?? false,
    })),
    summary: result.summary,
    territory: result.territory,
    total: result.total,
    elapsed_ms: result.elapsed_ms,
    enrichment_ms: result.enrichment_ms,
    deep_link: `/intuitive/surgeon-targeting?state=${result.territory.state}&specialty=${result.territory.specialty}`,
    citations: result.data_sources.map(s => ({ source_name: s.name, source_url: s.url })),
  };
}

async function tool_search_surgeons_by_hospital(input, ctx) {
  try {
    const result = await surgeonTargetingService.searchByHospital({
      hospital_ccn: input.hospital_ccn,
      hospital_name: input.hospital_name,
      specialty: input.specialty || 'all',
    }, { models: ctx.models });

    return {
      surgeons: (result.targets || []).slice(0, 50).map(t => ({
        npi: t.npi,
        name: t.full_name,
        credential: t.credential,
        specialty: t.specialty,
        group: t.group_legal_name,
        medical_school: t.medical_school,
        graduation_year: t.graduation_year,
        robotic_cases_last_yr: t.robotic_cases_last_yr,
        intuitive_dollars_2yr: t.intuitive_dollars_2yr,
        last_intuitive_payment: t.last_intuitive_payment,
        target_score: t.target_score,
        tier: t.tier,
      })),
      hospital: result.hospital,
      total: result.total,
      elapsed_ms: result.elapsed_ms,
      summary: result.summary,
      deep_link: result.hospital?.ccn
        ? `/intuitive/surgeon-targeting?hospital_ccn=${result.hospital.ccn}`
        : '/intuitive/surgeon-targeting',
      citations: result.data_sources.map(s => ({ source_name: s.name, source_url: s.url })),
    };
  } catch (e) {
    // Care Compare data not ingested yet — give the LLM something useful to relay
    return {
      surgeons: [],
      error: e.message,
      hint: 'Care Compare ingest has not been run on this environment. Suggest the user run scripts/ingest-care-compare.js, OR use search_surgeons_by_territory with the hospital\'s state as a fallback.',
    };
  }
}

async function tool_generate_business_plan(input, ctx) {
  const autoSeed = require('../services/auto-seed-commitments');
  const { project_id, plan_name, prepared_by } = input;
  if (!project_id) return { error: 'project_id required' };

  const { IntuitiveBusinessPlan, IntuitiveProject, IntuitiveSystemRecommendation,
    IntuitiveAnalysisResult, IntuitiveSurgeonCommitment, IntuitiveClinicalOutcome } = ctx.models;

  const project = await IntuitiveProject.findByPk(project_id);
  if (!project) return { error: `Project ${project_id} not found` };

  // Pick system from primary recommendation, or fall back to analysis cache
  let systemType = null, systemPrice = null, systemQuantity = 1, annualServiceCost = null;
  try {
    const primary = await IntuitiveSystemRecommendation.findOne({
      where: { project_id, is_primary: true }, order: [['fit_score', 'DESC']],
    });
    if (primary) {
      systemType = primary.system_model;
      systemPrice = primary.estimated_price;
      systemQuantity = primary.quantity || 1;
      annualServiceCost = primary.estimated_annual_cost;
    }
  } catch (e) { /* ignore */ }
  if (!systemType) {
    try {
      const row = await IntuitiveAnalysisResult.findOne({ where: { project_id, analysis_type: 'model_matching' } });
      if (row) {
        const data = typeof row.result_data === 'string' ? JSON.parse(row.result_data) : row.result_data;
        systemType = data?.primary_recommendation || data?.recommended_model || 'Xi';
      }
    } catch (e) { /* default below */ }
  }
  systemType = systemType || 'Xi';
  const DEFAULTS = { dV5: { price: 2500000, service: 0 }, Xi: { price: 1800000, service: 175000 }, X: { price: 1000000, service: 125000 }, SP: { price: 1700000, service: 150000 } };
  if (!systemPrice && DEFAULTS[systemType]) systemPrice = DEFAULTS[systemType].price;
  if (annualServiceCost == null && DEFAULTS[systemType]) annualServiceCost = DEFAULTS[systemType].service;

  const plan = await IntuitiveBusinessPlan.create({
    project_id,
    plan_name: plan_name || `Auto-generated Plan ${new Date().toISOString().slice(0, 10)}`,
    system_type: systemType,
    system_price: systemPrice,
    system_quantity: systemQuantity,
    annual_service_cost: annualServiceCost,
    acquisition_model: 'purchase',
    prepared_by: prepared_by || null,
    status: 'draft',
    notes: 'Generated by SurgicalMind Ask via generate_business_plan tool.',
  });

  const seedResult = await autoSeed.autoSeedForPlan(plan.id, { models: ctx.models });

  // Recalc plan totals
  let totals = null;
  try {
    const commitments = await IntuitiveSurgeonCommitment.findAll({ where: { business_plan_id: plan.id } });
    const outcomes = await IntuitiveClinicalOutcome.findAll({ where: { business_plan_id: plan.id } });
    const totalCases = commitments.reduce((s, c) => s + (c.total_incremental_annual || 0), 0);
    const totalRevenue = commitments.reduce((s, c) => s + parseFloat(c.total_revenue_impact || 0), 0);
    const totalClinical = outcomes.reduce((s, c) => s + parseFloat(c.total_clinical_savings_annual || 0), 0);
    const totalROI = totalRevenue + totalClinical;
    const systemCost = (parseFloat(plan.system_price) || 0) * (plan.system_quantity || 1);
    const annualNet = totalROI - (parseFloat(plan.annual_service_cost) || 0);
    const payback = systemCost > 0 && annualNet > 0 ? Math.ceil((systemCost / annualNet) * 12) : null;
    const fiveYearNet = (annualNet * 5) - (plan.acquisition_model === 'purchase' ? systemCost : 0);
    await plan.update({
      total_incremental_cases_annual: totalCases,
      total_incremental_revenue: totalRevenue,
      total_clinical_outcome_savings: totalClinical,
      total_combined_roi: totalROI,
      payback_months: payback,
      five_year_net_benefit: fiveYearNet,
    });
    totals = { totalCases, totalRevenue, totalClinical, totalROI, payback, fiveYearNet, systemCost };
  } catch (e) { console.error('generate_business_plan recalc error:', e.message); }

  return {
    success: true,
    plan: {
      id: plan.id,
      project_id,
      hospital_name: project.hospital_name,
      plan_name: plan.plan_name,
      system_type: systemType,
      system_price: systemPrice,
      system_quantity: systemQuantity,
    },
    seed_result: {
      seeded: seedResult.seeded,
      skipped: seedResult.skipped,
      roster_source: seedResult.roster_source,
    },
    totals,
    deep_link: `/intuitive/business-plan/${project_id}`,
    citations: [
      { source_name: 'CMS Care Compare', source_url: 'https://data.cms.gov/provider-data/dataset/mj5m-pzi6' },
      { source_name: 'CMS MPUP', source_url: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners' },
      { source_name: 'CMS Open Payments', source_url: 'https://openpaymentsdata.cms.gov' },
      { source_name: 'SurgicalMind analysis cache', source_url: `/intuitive/analysis/${project_id}` },
    ],
  };
}

async function tool_draft_outreach(input, ctx) {
  let { surgeon_npi, surgeon_name, message_type, rep_name, rep_title, custom_context } = input;
  surgeon_npi = surgeon_npi ? String(surgeon_npi).replace(/\D/g, '') : null;
  message_type = message_type || 'intro';

  // Resolve identity — use Care Compare as the canonical name + hospital source
  let affiliation = null;
  if (surgeon_npi && ctx.models?.IntuitiveProviderAffiliation) {
    try {
      affiliation = await ctx.models.IntuitiveProviderAffiliation.findOne({ where: { npi: surgeon_npi }, raw: true });
      if (affiliation && !surgeon_name) surgeon_name = affiliation.full_name;
    } catch (e) { /* ignore */ }
  }
  if (!surgeon_name) {
    return { error: 'Could not resolve surgeon. Provide surgeon_npi (with Care Compare ingested) or surgeon_name.' };
  }

  // Pull all the personalization material in parallel
  const pubmed = require('../services/data-sources/pubmed');
  const clinicalTrials = require('../services/data-sources/clinical-trials');
  const mpup = require('../services/data-sources/cms-physician-volume');
  const openPayments = require('../services/data-sources/cms-open-payments');
  const identityRes = require('../services/identity-resolution');

  const [pub, trials, volRes, payRes] = await Promise.all([
    pubmed.fetchPublicationCount(surgeon_name, { models: ctx.models }),
    clinicalTrials.fetchActiveTrials(surgeon_name, { models: ctx.models }),
    surgeon_npi ? mpup.fetchFor([surgeon_npi], { models: ctx.models }) : { data: { surgeon_volumes: [] } },
    surgeon_npi ? openPayments.fetchFor([surgeon_npi], { models: ctx.models }) : { data: { surgeon_payments: [] } },
  ]);

  const vol = (volRes?.data?.surgeon_volumes || [])[0] || {};
  const pay = (payRes?.data?.surgeon_payments || [])[0] || {};

  const idGate = identityRes.gateExternalCount({
    full_name: surgeon_name,
    specialty_key: affiliation?.primary_specialty || null,
    license_state: affiliation?.practice_state || null,
  });
  const dampen = idGate.confidence;
  const pubsAdj = Math.round((pub.count || 0) * dampen);
  const trialsAdj = Math.round((trials.active_count || 0) * dampen);

  // Build talking points the LLM should weave into the email
  const personalization_hooks = [];
  if (pubsAdj > 0 && idGate.trust) {
    personalization_hooks.push(`${pubsAdj} published paper${pubsAdj === 1 ? '' : 's'} in the last 5 years (PubMed). Most recent: ${(pub.recent_pmids || [])[0] ? `PMID ${pub.recent_pmids[0]}` : 'see profile'}.`);
  }
  if (trialsAdj > 0 && idGate.trust) {
    personalization_hooks.push(`${trialsAdj} active clinical trial${trialsAdj === 1 ? '' : 's'} as PI${trials.intuitive_sponsored > 0 ? ' (including Intuitive-sponsored research)' : ''}.`);
  }
  if (vol.total_robotic_cases_last_yr > 0) {
    personalization_hooks.push(`${vol.total_robotic_cases_last_yr} robotic Medicare cases last fiscal year (MPUP).`);
  }
  if (pay.total_payments_2yr > 0) {
    personalization_hooks.push(`Existing Intuitive relationship — $${Math.round(pay.total_payments_2yr / 1000)}K paid over 2 years (Open Payments)${pay.last_payment_date ? `, most recently ${pay.last_payment_date}` : ''}.`);
  }
  if (affiliation?.hospital_name) {
    personalization_hooks.push(`Primary affiliation: ${affiliation.hospital_name}${affiliation.hospital_state ? ` (${affiliation.hospital_state})` : ''}.`);
  }
  if (affiliation?.medical_school) {
    personalization_hooks.push(`Trained at ${affiliation.medical_school}${affiliation.graduation_year ? ` ('${String(affiliation.graduation_year).slice(-2)})` : ''}.`);
  }

  // CTA suggestions based on message_type
  const cta_suggestions = {
    intro: 'Open with respect for their work, offer a brief intro call (~20 min), no hard pitch.',
    follow_up: 'Reference a prior touchpoint, summarize value, propose a concrete next step.',
    meeting_request: 'Propose 2 specific times next week, mention what you\'ll bring (case data, peer references).',
    event_invite: 'Frame as an invitation, name the event, peer attendees, the speaker, location, RSVP deadline.',
    product_update: 'Lead with the clinical/financial outcome they care about, then the product capability.',
  };

  return {
    surgeon: {
      npi: surgeon_npi,
      name: surgeon_name,
      credential: affiliation?.credential || null,
      specialty: affiliation?.primary_specialty || null,
      hospital: affiliation?.hospital_name || null,
      group_practice: affiliation?.group_legal_name || null,
    },
    message_type,
    rep: {
      name: rep_name || '[Rep name]',
      title: rep_title || 'Intuitive Surgical',
    },
    custom_context: custom_context || null,
    personalization_hooks,
    suggested_subject_lines: [
      // 3 options for the LLM to pick from
      message_type === 'meeting_request' ? `Quick meeting on ${affiliation?.primary_specialty || 'your robotic'} cases` : null,
      message_type === 'event_invite' ? `${affiliation?.primary_specialty || 'Robotic surgery'} forum — invite` : null,
      pay.total_payments_2yr > 0 ? `Following up on our recent work together` : `Brief intro — Intuitive Surgical`,
      personalization_hooks.length > 0 ? `Your ${affiliation?.primary_specialty || 'robotic'} program — a quick note` : `Connecting on robotic surgery`,
    ].filter(Boolean),
    cta_guidance: cta_suggestions[message_type] || cta_suggestions.intro,
    drafting_instructions: [
      'Use ONLY the personalization_hooks provided — never fabricate publications, trials, or relationships.',
      'Reference 1-2 specific hooks; do not list all of them (sounds like a dossier, not a note).',
      'Keep the email under 120 words. Subject line under 60 characters.',
      'Sign with rep.name and rep.title.',
      'Do not mention surgeon\'s salary, demographics, or anything not in the hooks.',
      'If identity_low_confidence is true, do NOT reference research/trial counts — focus on hospital affiliation only.',
    ],
    identity_low_confidence: !idGate.trust,
    identity_confidence: idGate.confidence,
    citations: [
      { source_name: 'CMS Care Compare', source_url: 'https://data.cms.gov/provider-data/dataset/mj5m-pzi6' },
      { source_name: 'CMS Open Payments', source_url: 'https://openpaymentsdata.cms.gov' },
      { source_name: 'CMS MPUP', source_url: 'https://data.cms.gov/' },
      { source_name: 'PubMed', source_url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(surgeon_name + '[Author]')}` },
      { source_name: 'ClinicalTrials.gov', source_url: `https://clinicaltrials.gov/search?term=${encodeURIComponent(surgeon_name)}` },
    ],
  };
}

async function tool_generate_briefing(input, ctx) {
  try {
    return await surgeonTargetingService.generateBriefing({
      hospital_name: input.hospital_name,
      hospital_ccn: input.hospital_ccn,
      state: input.state,
    }, { models: ctx.models });
  } catch (e) {
    return {
      error: e.message,
      hint: 'Briefing requires Care Compare data. If not yet ingested, fall back to search_surgeons_by_territory + query_hospitals.',
    };
  }
}

async function tool_query_hospital_drg_volumes(input, ctx) {
  try {
    return await surgeonTargetingService.hospitalDrgVolume({
      hospital_ccn: input.hospital_ccn,
      drg_codes: input.drg_codes,
      mdc: input.mdc,
      surgical_only: !!input.surgical_only,
      fiscal_year: input.fiscal_year,
    }, { models: ctx.models });
  } catch (e) {
    return {
      error: e.message,
      hint: 'Most common cause: intuitive_hospital_drg_volume table not yet populated. Run scripts/ingest-medicare-inpatient-drg.js on the latest CMS Medicare Inpatient Hospitals CSV.',
    };
  }
}

async function tool_compare_hospital_procedure_volumes(input, ctx) {
  try {
    return await surgeonTargetingService.compareHospitalProcedureVolumes({
      hospital_ccns: input.hospital_ccns,
      hospital_names: input.hospital_names,
      hcpcs_codes: input.hcpcs_codes,
      procedure_families: input.procedure_families,
      fiscal_year: input.fiscal_year,
    }, { models: ctx.models });
  } catch (e) {
    return {
      error: e.message,
      hint: 'Most common cause: Care Compare not yet ingested (run scripts/ingest-care-compare.js) OR MPUP physician volume not loaded for these surgeons (run scripts/ingest-physician-volume.js).',
    };
  }
}

async function tool_enrich_surgeon(input, ctx) {
  let { npi, full_name, specialty, state } = input;
  npi = npi ? String(npi).replace(/\D/g, '') : null;

  // Resolve name from NPI via Care Compare affiliation if only NPI given
  if (npi && !full_name && ctx.models?.IntuitiveProviderAffiliation) {
    try {
      const row = await ctx.models.IntuitiveProviderAffiliation.findOne({ where: { npi } });
      if (row) {
        full_name = row.full_name;
        if (!specialty) specialty = row.primary_specialty;
        if (!state) state = row.practice_state;
      }
    } catch (e) { /* ignore */ }
  }
  if (!full_name) {
    return {
      error: 'Could not resolve surgeon name. Provide full_name (e.g. "John Smith MD") or a known NPI when Care Compare data is loaded.',
    };
  }

  const pubmed = require('../services/data-sources/pubmed');
  const clinicalTrials = require('../services/data-sources/clinical-trials');
  const identityRes = require('../services/identity-resolution');
  const { kolScore, kolBadge } = surgeonTargetingService;

  // Run PubMed + ClinicalTrials.gov in parallel
  const [pub, trials] = await Promise.all([
    pubmed.fetchPublicationCount(full_name, { models: ctx.models }),
    clinicalTrials.fetchActiveTrials(full_name, { models: ctx.models }),
  ]);

  // Identity-resolution gate — dampen on ambiguous names
  const idGate = identityRes.gateExternalCount(
    { full_name, specialty_key: specialty || null, license_state: state || null },
    null
  );
  const dampen = idGate.trust ? 1 : Math.max(0.1, idGate.confidence);

  const publications_5yr = Math.round((pub.count || 0) * dampen);
  const active_trials = Math.round((trials.active_count || 0) * dampen);

  const ks = kolScore({
    publications_5yr,
    active_trials,
    intuitive_trials: trials.intuitive_sponsored || 0,
  });
  const kb = kolBadge(ks);

  // Build per-PMID direct links so the LLM renders clean markdown, not a giant URL-encoded search URL
  const recent_pmids = (pub.recent_pmids || []).slice(0, 5).map(pmid => ({
    pmid,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  }));

  return {
    npi: npi || null,
    full_name,
    publications_5yr,
    publications_5yr_raw: pub.count || 0,
    recent_pmids,
    pubmed_profile_url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(full_name + '[Author]')}`,
    active_trials,
    active_trials_raw: trials.active_count || 0,
    industry_trials: trials.industry_sponsored || 0,
    intuitive_trials: trials.intuitive_sponsored || 0,
    trials: (trials.trials || []).slice(0, 10).map(t => ({
      nct_id: t.nct_id,
      title: t.title,
      status: t.status,
      phase: t.phase,
      sponsor: t.sponsor,
      url: t.nct_id ? `https://clinicaltrials.gov/study/${t.nct_id}` : null,
    })),
    clinicaltrials_profile_url: `https://clinicaltrials.gov/search?term=${encodeURIComponent(full_name)}`,
    kol_score: ks,
    kol_badge: kb ? kb.label : null,
    identity_confidence: idGate.confidence,
    identity_ambiguous: !idGate.trust,
    caveat: !idGate.trust
      ? `This name appears too common for high-confidence identity match (confidence ${(idGate.confidence * 100).toFixed(0)}%). PubMed / ClinicalTrials.gov counts have been dampened. Treat as a directional signal, not an exact figure.`
      : null,
    citations: [
      { source_name: 'PubMed', source_url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(full_name + '[Author]')}` },
      { source_name: 'ClinicalTrials.gov', source_url: `https://clinicaltrials.gov/search?term=${encodeURIComponent(full_name)}` },
    ],
  };
}

async function tool_query_intuitive_payments(input, ctx) {
  const { Op } = require('sequelize');
  const where = {};
  if (input.npi) where.npi = String(input.npi);
  if (input.fiscal_year) where.fiscal_year = Number(input.fiscal_year);
  if (input.min_amount) where.total_amount = { [Op.gte]: input.min_amount };
  const limit = Math.min(Number(input.limit) || 20, 100);
  const rows = await ctx.models.IntuitiveOpenPaymentsIntuitive.findAll({ where, order: [['total_amount', 'DESC']], limit });
  return {
    payments: rows.map(r => r.toJSON()),
    citations: [{ source_name: 'CMS Open Payments', source_url: 'https://openpaymentsdata.cms.gov/' }],
  };
}

async function tool_query_procedure_volumes(input, ctx) {
  const { Op } = require('sequelize');
  const where = {};
  if (input.npi) where.npi = String(input.npi);
  if (input.hcpcs_code) where.hcpcs_code = input.hcpcs_code;
  if (input.fiscal_year) where.fiscal_year = Number(input.fiscal_year);
  if (input.min_services) where.total_services = { [Op.gte]: input.min_services };
  const limit = Math.min(Number(input.limit) || 20, 100);
  const rows = await ctx.models.IntuitivePhysicianProcedureVolume.findAll({ where, order: [['total_services', 'DESC']], limit });
  return {
    volumes: rows.map(r => r.toJSON()),
    citations: [{ source_name: 'CMS Medicare Physician Provider Utilization', source_url: 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners' }],
  };
}

async function tool_query_business_plans(input, ctx) {
  const { Op } = require('sequelize');
  const where = {};
  if (input.project_id) where.project_id = input.project_id;
  if (input.status) where.status = input.status;
  const limit = Math.min(Number(input.limit) || 20, 100);
  const rows = await ctx.models.IntuitiveBusinessPlan.findAll({ where, order: [['updated_at', 'DESC']], limit });
  return {
    business_plans: rows.map(r => {
      const j = r.toJSON();
      return { ...j, deep_link: `/intuitive/business-plan/${j.project_id}` };
    }),
  };
}

async function tool_query_surveys(input, ctx) {
  const where = {};
  if (input.project_id) where.project_id = input.project_id;
  if (input.status) where.status = input.status;
  const limit = Math.min(Number(input.limit) || 20, 100);
  const rows = await ctx.models.IntuitiveSurvey.findAll({ where, order: [['updated_at', 'DESC']], limit });
  return {
    surveys: rows.map(r => {
      const j = r.toJSON();
      return { ...j, deep_link: `/intuitive/surveys/${j.project_id}` };
    }),
  };
}

async function tool_get_project_details(input, ctx) {
  const project = await ctx.models.IntuitiveProject.findByPk(input.project_id);
  if (!project) return { error: 'project not found' };
  const j = project.toJSON();
  const [analysis, plans, surveys] = await Promise.all([
    ctx.models.IntuitiveAnalysisResult.findAll({ where: { project_id: input.project_id }, attributes: ['analysis_type', 'computed_at'] }),
    ctx.models.IntuitiveBusinessPlan.findAll({ where: { project_id: input.project_id }, attributes: ['id', 'plan_name', 'status', 'updated_at'] }),
    ctx.models.IntuitiveSurvey.findAll({ where: { project_id: input.project_id }, attributes: ['id', 'title', 'status', 'response_count'] }),
  ]);
  return {
    project: {
      ...j,
      analysis_modules: analysis.map(a => a.analysis_type),
      business_plans: plans.map(p => p.toJSON()),
      surveys: surveys.map(s => s.toJSON()),
      deep_link: `/intuitive/report/${j.id}`,
    },
  };
}

async function tool_compare_hospitals(input, ctx) {
  const ids = (input.hospital_ids || []).slice(0, 5);
  const projects = await ctx.models.IntuitiveProject.findAll({ where: { id: ids } });
  return {
    comparison: projects.map(p => {
      const j = p.toJSON();
      return {
        id: j.id,
        hospital_name: j.hospital_name,
        state: j.state,
        bed_count: j.bed_count,
        annual_surgical_volume: j.annual_surgical_volume,
        current_robotic_cases: j.current_robotic_cases,
        current_system: j.current_system,
        current_system_count: j.current_system_count,
        credentialed_robotic_surgeons: j.credentialed_robotic_surgeons,
        payer_medicare_pct: j.payer_medicare_pct,
        deep_link: `/intuitive/report/${j.id}`,
      };
    }),
  };
}

async function tool_generate_report_link(input, ctx) {
  const project = await ctx.models.IntuitiveProject.findByPk(input.project_id);
  if (!project) return { error: 'project not found' };
  return {
    deep_link: `/intuitive/report/${input.project_id}`,
    hospital_name: project.hospital_name,
  };
}

async function tool_start_business_plan(input, ctx) {
  const plan = await ctx.models.IntuitiveBusinessPlan.create({
    project_id: input.project_id,
    plan_name: input.plan_name || `Plan ${new Date().toISOString().slice(0, 10)}`,
    status: 'draft',
    created_by_user_id: ctx.userId,
  });
  return {
    business_plan_id: plan.id,
    deep_link: `/intuitive/business-plan/${input.project_id}`,
    message: `Created draft business plan "${plan.plan_name}" for project ${input.project_id}`,
  };
}

async function tool_send_surgeon_survey(input, ctx) {
  const project = await ctx.models.IntuitiveProject.findByPk(input.project_id);
  if (!project) return { error: 'project not found' };
  const survey = await ctx.models.IntuitiveSurvey.create({
    project_id: input.project_id,
    title: input.survey_title || `Surgeon survey for ${project.hospital_name}`,
    status: 'draft',
    distribution_method: 'email',
  });
  // Best-effort: create recipients from NPI list (without email; rep can fill emails in UI before sending)
  for (const npi of (input.surgeon_npis || []).slice(0, 50)) {
    try {
      await ctx.models.IntuitiveSurveyRecipient.create({
        survey_id: survey.id,
        surgeon_name: `NPI ${npi}`,
        surgeon_email: null,
        personal_token: require('crypto').randomBytes(20).toString('hex'),
        status: 'pending',
      });
    } catch (_) {}
  }
  return {
    survey_id: survey.id,
    deep_link: `/intuitive/surveys/${input.project_id}`,
    message: `Created survey "${survey.title}" with ${(input.surgeon_npis || []).length} recipients (status: draft). Visit the survey page to add emails and send.`,
  };
}

const TOOL_IMPL = {
  query_hospitals: tool_query_hospitals,
  query_surgeons: tool_query_surgeons,
  search_surgeons_by_territory: tool_search_surgeons_by_territory,
  search_surgeons_by_hospital: tool_search_surgeons_by_hospital,
  enrich_surgeon: tool_enrich_surgeon,
  generate_briefing: tool_generate_briefing,
  draft_outreach: tool_draft_outreach,
  generate_business_plan: tool_generate_business_plan,
  compare_hospital_procedure_volumes: tool_compare_hospital_procedure_volumes,
  query_hospital_drg_volumes: tool_query_hospital_drg_volumes,
  query_intuitive_payments: tool_query_intuitive_payments,
  query_procedure_volumes: tool_query_procedure_volumes,
  query_business_plans: tool_query_business_plans,
  query_surveys: tool_query_surveys,
  get_project_details: tool_get_project_details,
  compare_hospitals: tool_compare_hospitals,
  generate_report_link: tool_generate_report_link,
  start_business_plan: tool_start_business_plan,
  send_surgeon_survey: tool_send_surgeon_survey,
};

const STATE_CHANGING = new Set(['start_business_plan', 'send_surgeon_survey']);

// ─── Daily cap check ──────────────────────────────────────────
async function checkDailyCap(models, userId) {
  const cap = Number(process.env.CHAT_DAILY_CAP_PER_USER) || 200;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    const count = await models.IntuitiveChatAudit.count({ where: { user_id: userId, ts: { [require('sequelize').Op.gte]: since } } });
    return { allowed: count < cap, count, cap };
  } catch (e) {
    return { allowed: true, count: 0, cap }; // fail-open if audit table not yet synced
  }
}

// ─── Conversation history helpers ─────────────────────────────
// Walk the raw saved messages and produce a sequence safe to replay to Anthropic.
// Anthropic rejects any tool_use block not followed by a paired tool_result block.
// If a pair is broken, we downgrade THAT assistant message to text-only and drop
// any orphan tool_result so the rest of the history remains usable.
function sanitizeForReplay(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];
  const out = [];
  for (let i = 0; i < rawMessages.length; i++) {
    const m = rawMessages[i];
    if (!m || !m.role) continue;

    // Assistant message with structured content
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const hasToolUse = m.content.some(b => b && b.type === 'tool_use');
      if (hasToolUse) {
        const next = rawMessages[i + 1];
        const nextIsToolResult =
          next && next.role === 'user' && Array.isArray(next.content) &&
          next.content.some(b => b && b.type === 'tool_result');
        if (!nextIsToolResult) {
          // Broken pair — flatten just this assistant turn to text
          const text = m.content.filter(b => b && b.type === 'text')
            .map(b => b.text || '').join('\n\n').trim();
          if (text) out.push({ role: 'assistant', content: text });
          continue;
        }
      }
      // Properly paired (or text-only) structured content — keep as-is
      out.push({ role: 'assistant', content: m.content });
      continue;
    }

    // User message with structured content (tool_results)
    if (m.role === 'user' && Array.isArray(m.content)) {
      const allToolResults = m.content.length > 0 && m.content.every(b => b && b.type === 'tool_result');
      if (allToolResults) {
        // Verify prior is assistant with tool_use
        const prev = out[out.length - 1];
        const prevHasToolUse = prev && prev.role === 'assistant' && Array.isArray(prev.content) &&
          prev.content.some(b => b && b.type === 'tool_use');
        if (!prevHasToolUse) {
          // Orphan tool_results — drop
          continue;
        }
      }
      out.push({ role: 'user', content: m.content });
      continue;
    }

    // Plain text content (string) — pass through
    const text = typeof m.content === 'string' ? m.content :
      Array.isArray(m.content) ? m.content.filter(b => b && b.type === 'text')
        .map(b => b.text || '').join('\n\n').trim() : '';
    if (text) out.push({ role: m.role, content: text });
  }
  return out;
}

// ─── Main streaming endpoint ──────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.id || req.user.user_id;
  const { question, conversation_id, project_id, confirmed_action } = req.body || {};
  if (!question && !confirmed_action) {
    return res.status(400).json({ error: 'question or confirmed_action required' });
  }

  const models = req.models;
  const { allowed, count, cap } = await checkDailyCap(models, userId);
  if (!allowed) {
    return res.status(429).json({ error: `Daily message cap reached (${count}/${cap})` });
  }

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  const startTs = Date.now();
  const convId = conversation_id || uuidv4();
  const toolsUsed = [];
  let totalTokens = 0;
  let cachedTokens = 0;

  try {
    // Load conversation history.
    // Preserves STRUCTURED content blocks (tool_use + tool_result pairs) so the model can
    // see actual prior tool data on follow-ups — not just a flattened text summary.
    // sanitizeForReplay() downgrades any broken pair to text-only so Anthropic's API
    // never rejects with "tool_use ids were found without tool_result blocks".
    let history = [];
    let historyRaw = [];
    if (conversation_id) {
      try {
        const conv = await models.IntuitiveChatConversation.findOne({ where: { conversation_id } });
        if (conv?.messages) {
          historyRaw = conv.messages.slice(-30);
          history = sanitizeForReplay(historyRaw);
        }
      } catch (e) {}
    }

    // If user is confirming a destructive action, execute it directly
    if (confirmed_action) {
      const impl = TOOL_IMPL[confirmed_action.tool];
      if (!impl) {
        send({ type: 'text', content: `Unknown tool: ${confirmed_action.tool}` });
        send({ type: 'done' });
        return res.end();
      }
      send({ type: 'tool_call', tool: confirmed_action.tool, input: confirmed_action.args, confirmed: true });
      const result = await withTimeout(impl(confirmed_action.args, { models, userId }));
      send({ type: 'tool_result', tool: confirmed_action.tool, output: result });
      send({ type: 'text', content: result.message || 'Action completed.' });
      send({ type: 'done', conversation_id: convId });
      return res.end();
    }

    // Build messages: history (structured where safe) + new user question
    const userMessage = { role: 'user', content: question };
    const messages = [...history, userMessage];

    const anthropic = getAnthropic();
    let stopReason = null;
    let assistantTurnContent = [];

    // Agentic loop: call model → execute tools → call again until stop_reason !== 'tool_use'
    const MAX_TURNS = 10;
    for (let turn = 0; turn < MAX_TURNS; turn++) { // max 6 tool roundtrips
      const response = await anthropic.messages.create({
        model: SONNET_MODEL,
        max_tokens: 4096,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        tools: TOOLS.map((t, i) => i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t),
        messages,
      });

      const usage = response.usage || {};
      totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
      cachedTokens += (usage.cache_read_input_tokens || 0);

      assistantTurnContent = response.content || [];
      stopReason = response.stop_reason;

      // Stream text blocks
      for (const block of assistantTurnContent) {
        if (block.type === 'text') {
          send({ type: 'text', content: block.text });
        } else if (block.type === 'tool_use') {
          send({ type: 'tool_call', tool: block.name, input: block.input });
        }
      }

      if (stopReason !== 'tool_use') break;

      // Append assistant turn to messages and execute tool calls
      messages.push({ role: 'assistant', content: assistantTurnContent });
      const toolResults = [];
      for (const block of assistantTurnContent) {
        if (block.type !== 'tool_use') continue;
        toolsUsed.push(block.name);

        // Block destructive tools — surface confirm action instead of executing
        if (STATE_CHANGING.has(block.name)) {
          const confirmBlock = {
            type: 'confirm',
            label: `Confirm: ${block.name} ${JSON.stringify(block.input).slice(0, 100)}`,
            tool: block.name,
            args: block.input,
          };
          send({ type: 'confirm', payload: confirmBlock });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ pending_user_confirmation: true, action: confirmBlock }),
          });
          continue;
        }

        const impl = TOOL_IMPL[block.name];
        if (!impl) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: `unknown tool ${block.name}` }), is_error: true });
          continue;
        }
        try {
          const timeoutMs = TOOL_TIMEOUTS[block.name] || TOOL_TIMEOUT_MS;
          const result = await withTimeout(impl(block.input, { models, userId }), timeoutMs);
          send({ type: 'tool_result', tool: block.name, output: result });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (e) {
          send({ type: 'tool_result', tool: block.name, output: { error: e.message } });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: e.message }), is_error: true });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // If the loop exhausted with stop_reason still 'tool_use', force a final
    // synthesis call without tools so the user gets a coherent answer instead
    // of silence — AND so we never persist an unfulfilled tool_use block.
    if (stopReason === 'tool_use') {
      try {
        const synth = await anthropic.messages.create({
          model: SONNET_MODEL,
          max_tokens: 2048,
          system: [{ type: 'text', text: SYSTEM_PROMPT + '\n\nIMPORTANT: You have reached the tool-call limit for this turn. Synthesize an answer from the tool results already returned. Do NOT request more tools. If the question cannot be fully answered with what you have, say so explicitly and suggest a more scoped follow-up.' }],
          messages,
          // NOTE: no `tools` param — forces text-only output, prevents another tool_use block
        });
        const synthText = (synth.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        if (synthText) {
          send({ type: 'text', content: synthText });
          assistantTurnContent = [{ type: 'text', text: synthText }];
        } else {
          assistantTurnContent = [{ type: 'text', text: 'I ran out of tool-call budget for this question. Try splitting it into smaller follow-ups.' }];
        }
        const synthUsage = synth.usage || {};
        totalTokens += (synthUsage.input_tokens || 0) + (synthUsage.output_tokens || 0);
        cachedTokens += (synthUsage.cache_read_input_tokens || 0);
      } catch (synthErr) {
        console.error('[chat] synthesis fallback error:', synthErr.message);
        assistantTurnContent = [{ type: 'text', text: 'I hit the tool-call limit for this question. Try splitting it into smaller follow-ups, or narrow the scope (e.g. one procedure at a time).' }];
        send({ type: 'text', content: assistantTurnContent[0].text });
      }
    }

    // Persist conversation as STRUCTURED turn additions.
    // `messages` already contains [history..., userMessage, (assistant_tool_use + user_tool_results)*]
    // We append the final assistant turn (which the loop exited without pushing).
    // This preserves tool_use / tool_result PAIRS so follow-up questions can reference
    // the actual data Claude saw — not just a flattened text summary of the response.
    //
    // The synthesis fallback above guarantees `assistantTurnContent` is text-only when
    // the agentic loop exhausted on stop_reason='tool_use', so we never persist an
    // unpaired tool_use block. sanitizeForReplay() also defends on load.
    try {
      // This turn's additions = everything in `messages` beyond what was originally loaded,
      // plus the final assistant response.
      const turnAdditions = messages.slice(history.length).concat([
        { role: 'assistant', content: assistantTurnContent, ts: new Date() },
      ]);
      // Mark the user message with a timestamp for later display ordering
      if (turnAdditions[0] && turnAdditions[0].role === 'user' && !turnAdditions[0].ts) {
        turnAdditions[0] = { ...turnAdditions[0], ts: new Date() };
      }
      const finalMessages = [...historyRaw, ...turnAdditions];

      const existing = await models.IntuitiveChatConversation.findOne({ where: { conversation_id: convId } });
      if (existing) {
        await existing.update({ messages: finalMessages, project_id: project_id || existing.project_id });
      } else {
        await models.IntuitiveChatConversation.create({
          user_id: userId,
          conversation_id: convId,
          project_id: project_id || null,
          title: String(question).slice(0, 80),
          messages: finalMessages,
        });
      }
    } catch (e) { console.error('chat: persist conversation failed', e.message); }

    // Audit log
    try {
      await models.IntuitiveChatAudit.create({
        user_id: userId,
        conversation_id: convId,
        question: String(question).slice(0, 1000),
        total_tokens: totalTokens,
        cached_tokens: cachedTokens,
        latency_ms: Date.now() - startTs,
        tools_used: toolsUsed,
      });
    } catch (e) {}

    send({ type: 'done', conversation_id: convId, latency_ms: Date.now() - startTs, total_tokens: totalTokens, cached_tokens: cachedTokens });
  } catch (e) {
    console.error('[chat] error:', e);
    send({ type: 'error', message: e.message });
    try {
      await models.IntuitiveChatAudit.create({ user_id: userId, conversation_id: convId, question: String(question || '').slice(0, 1000), latency_ms: Date.now() - startTs, error: e.message });
    } catch (_) {}
  }
  res.end();
});

// ─── Conversation persistence endpoints ───────────────────────
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const rows = await req.models.IntuitiveChatConversation.findAll({
      where: { user_id: userId, deleted_at: null },
      order: [['updated_at', 'DESC']],
      limit: 50,
      attributes: ['id', 'conversation_id', 'project_id', 'title', 'updated_at'],
    });
    res.json({ success: true, conversations: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const conv = await req.models.IntuitiveChatConversation.findOne({
      where: { conversation_id: req.params.id, user_id: userId },
    });
    if (!conv) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, conversation: conv });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const conv = await req.models.IntuitiveChatConversation.findOne({
      where: { conversation_id: req.params.id, user_id: userId },
    });
    if (!conv) return res.status(404).json({ error: 'not found' });
    await conv.update({ deleted_at: new Date() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
