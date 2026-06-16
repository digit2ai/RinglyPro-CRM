'use strict';

/**
 * Milestone Generator -- Anthropic Claude integration
 * Used by the Inbox approve flow to convert intake answers into a
 * project plan with milestones + due dates.
 *
 * Mirrors chamber-template/lib/plan-generator.js in shape and JSON
 * cleanup behavior.
 */
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are a project plan generator for Digit2AI's Neural AI consulting practice. You read a prospect's intake submission and produce a concrete delivery plan with milestones, deliverables, and realistic due dates.

Output schema (strict JSON, no prose, no markdown fences):
{
  "milestones": [
    {
      "title": string,
      "description": string,
      "due_date": "YYYY-MM-DD",
      "deliverable": string,
      "owner_role": string,
      "order_index": number
    }
  ],
  "next_steps": string[],
  "estimated_completion_date": "YYYY-MM-DD",
  "kickoff_recommendation": string
}

Rules:
- 4 to 8 milestones depending on scope (small/exploratory = 4, large/multi-phase = 8).
- All due_date values must be in the future, anchored to TODAY (which the user message will provide).
- due_dates must be in ascending chronological order; estimated_completion_date >= the last milestone due_date.
- order_index is 1-indexed and matches chronological order.
- owner_role names a role (e.g. "AI Engineering Lead", "Solutions Architect", "Project Manager", "Data Engineer", "Compliance Lead"), not a person.
- next_steps is 3-5 immediate actions for the first 7 days.
- kickoff_recommendation is one paragraph (3-5 sentences) suggesting how to start.
- Output ONLY valid JSON. No prose. No markdown fences.`;

const MODEL = 'claude-sonnet-4-6';

function buildUserMessage({ project_name, description, intake_answers, timeline, budget_range, ai_category }) {
  const today = new Date().toISOString().slice(0, 10);
  const cats = Array.isArray(ai_category) ? ai_category.join(', ') : (ai_category || 'Neural AI');
  const answersBlock = Object.entries(intake_answers || {})
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n') || '(no additional answers provided)';

  return `Today is ${today}. Generate a delivery plan for the following Neural AI project request.

PROJECT NAME: ${project_name}
DESCRIPTION: ${description || '(no description)'}
AI CATEGORY: ${cats}
TIMELINE: ${timeline || 'not specified'}
BUDGET: ${budget_range || 'not specified'}

INTAKE ANSWERS:
${answersBlock}

Produce 4 to 8 milestones with due_date values in YYYY-MM-DD format, anchored to today (${today}). The first milestone should land within 1-2 weeks. Generate the plan now as strict JSON.`;
}

async function generatePlan({ project_name, description, intake_answers, timeline, budget_range, ai_category }) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
    ],
    messages: [
      { role: 'user', content: buildUserMessage({ project_name, description, intake_answers, timeline, budget_range, ai_category }) }
    ]
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  // Strip markdown fences if Claude added them
  let jsonStr = text;
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }

  let plan;
  try {
    plan = JSON.parse(jsonStr);
  } catch (e) {
    // Defensive cleanup: trailing commas, unquoted keys
    let cleaned = jsonStr
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([\{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    try {
      plan = JSON.parse(cleaned);
    } catch (e2) {
      const err = new Error('Milestone generator returned invalid JSON: ' + e.message);
      err.raw = text.substring(0, 500);
      throw err;
    }
  }

  // Validation
  if (!plan || !Array.isArray(plan.milestones) || plan.milestones.length < 3) {
    throw new Error('Plan must include at least 3 milestones (got ' + (plan && plan.milestones ? plan.milestones.length : 0) + ')');
  }
  if (plan.milestones.length > 10) plan.milestones = plan.milestones.slice(0, 10);

  // Normalize: ensure each milestone has required fields and sane order
  plan.milestones = plan.milestones
    .map((m, i) => ({
      title: String(m.title || `Milestone ${i + 1}`).slice(0, 500),
      description: String(m.description || '').slice(0, 4000),
      due_date: m.due_date && /^\d{4}-\d{2}-\d{2}$/.test(m.due_date) ? m.due_date : null,
      deliverable: String(m.deliverable || '').slice(0, 1000),
      owner_role: String(m.owner_role || 'Project Manager').slice(0, 200),
      order_index: Number(m.order_index) || (i + 1)
    }))
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      return a.order_index - b.order_index;
    })
    .map((m, i) => ({ ...m, order_index: i + 1 }));

  if (!plan.estimated_completion_date || !/^\d{4}-\d{2}-\d{2}$/.test(plan.estimated_completion_date)) {
    const last = plan.milestones[plan.milestones.length - 1];
    plan.estimated_completion_date = last.due_date || null;
  }

  if (!Array.isArray(plan.next_steps)) plan.next_steps = [];
  if (typeof plan.kickoff_recommendation !== 'string') plan.kickoff_recommendation = '';

  return {
    plan,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens || 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens || 0
    }
  };
}

module.exports = { generatePlan, SYSTEM_PROMPT, MODEL };
