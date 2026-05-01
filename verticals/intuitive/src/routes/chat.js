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

Read-only queries (query_*, get_*, compare_*) execute immediately without confirmation.`;

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
    // Load conversation history if exists
    let history = [];
    if (conversation_id) {
      try {
        const conv = await models.IntuitiveChatConversation.findOne({ where: { conversation_id } });
        if (conv?.messages) history = conv.messages.slice(-30);
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

    // Build messages: history + new user question
    const userMessage = { role: 'user', content: question };
    const messages = [...history.map(m => ({ role: m.role, content: m.content })), userMessage];

    const anthropic = getAnthropic();
    let stopReason = null;
    let assistantTurnContent = [];

    // Agentic loop: call model → execute tools → call again until stop_reason !== 'tool_use'
    for (let turn = 0; turn < 6; turn++) { // max 6 tool roundtrips
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
          const result = await withTimeout(impl(block.input, { models, userId }));
          send({ type: 'tool_result', tool: block.name, output: result });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (e) {
          send({ type: 'tool_result', tool: block.name, output: { error: e.message } });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: e.message }), is_error: true });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // Persist conversation
    try {
      const finalMessages = [
        ...history,
        { role: 'user', content: question, ts: new Date() },
        { role: 'assistant', content: assistantTurnContent, ts: new Date() },
      ];
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
