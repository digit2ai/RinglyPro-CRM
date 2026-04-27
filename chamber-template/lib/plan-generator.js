/**
 * Business Plan Generator -- Anthropic Claude integration
 * Used by chamber-template Stage 0 (P2B) to convert a vision into a structured plan.
 */
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are a business plan generator for a chamber of commerce P2B (Project to Business) platform. Given a 2-paragraph vision and basic constraints, produce a complete structured business plan in JSON.

Output schema (strict JSON, no prose, no markdown fences):
{
  "title": string,
  "executive_summary": string (3-5 sentences),
  "problem_market": {
    "problem_statement": string,
    "tam_usd": number,
    "sam_usd": number,
    "som_usd": number,
    "target_segments": string[]
  },
  "solution": {
    "description": string,
    "key_differentiators": string[],
    "tech_stack_or_methodology": string[]
  },
  "go_to_market": {
    "phases": [{ "name": string, "duration_months": number, "activities": string[] }],
    "channel_strategy": string,
    "regional_priorities": [{ "region": string, "rationale": string }]
  },
  "revenue_model": {
    "pricing_tiers": [{ "name": string, "price_usd": number, "period": string }],
    "year1_revenue_estimate_usd": number,
    "year3_revenue_estimate_usd": number
  },
  "team_roles_required": [
    {
      "role_title": string,
      "responsibilities": string[],
      "required_skills": string[],
      "preferred_sectors": string[],
      "preferred_regions": string[],
      "commitment_pct": number,
      "must_have": boolean
    }
  ],
  "budget_breakdown": [{ "category": string, "amount_usd": number, "phase": string }],
  "timeline_milestones": [
    { "month": number, "milestone": string, "deliverable": string }
  ],
  "risks": [{ "risk": string, "likelihood": "low|medium|high", "mitigation": string }],
  "success_kpis": [{ "kpi": string, "target": string, "measurement_period": string }]
}

Generate a thorough, realistic plan. team_roles_required must specify 3-7 distinct roles with clear required_skills and preferred_sectors so AI matching can identify candidates. Output ONLY valid JSON, no prose, no markdown fences.`;

const MODEL = 'claude-sonnet-4-5-20250929';

function buildUserMessage({ vision, sector, countries, budget_tier }) {
  const countryStr = Array.isArray(countries) ? countries.join(', ') : (countries || 'global');
  const tierMap = {
    small: '$50k-200k',
    medium: '$200k-1M',
    large: '$1M+'
  };
  const tier = tierMap[budget_tier] || tierMap.medium;
  return `User vision:
${vision}

Sector: ${sector || 'general'}
Countries: ${countryStr}
Budget tier: ${budget_tier || 'medium'} (${tier})

Generate the structured business plan now.`;
}

async function generatePlan({ vision, sector, countries, budget_tier }) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
    ],
    messages: [
      { role: 'user', content: buildUserMessage({ vision, sector, countries, budget_tier }) }
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
      .replace(/,(\s*[}\]])/g, '$1')          // strip trailing commas before } or ]
      .replace(/([\{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');  // quote unquoted keys
    try {
      plan = JSON.parse(cleaned);
    } catch (e2) {
      const err = new Error('Plan generator returned invalid JSON: ' + e.message);
      err.raw = text.substring(0, 500);
      throw err;
    }
  }

  // Minimal validation
  const required = ['title', 'executive_summary', 'problem_market', 'solution',
    'go_to_market', 'revenue_model', 'team_roles_required', 'budget_breakdown',
    'timeline_milestones', 'risks', 'success_kpis'];
  for (const key of required) {
    if (!(key in plan)) throw new Error(`Plan missing required field: ${key}`);
  }
  if (!Array.isArray(plan.team_roles_required) || plan.team_roles_required.length < 2) {
    throw new Error('Plan must include at least 2 team_roles_required');
  }

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

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') return { ok: false, error: 'plan must be an object' };
  const required = ['title', 'executive_summary', 'team_roles_required', 'timeline_milestones'];
  for (const key of required) {
    if (!(key in plan)) return { ok: false, error: `missing field: ${key}` };
  }
  if (!Array.isArray(plan.team_roles_required) || plan.team_roles_required.length === 0) {
    return { ok: false, error: 'team_roles_required must be a non-empty array' };
  }
  return { ok: true };
}

module.exports = { generatePlan, validatePlan, SYSTEM_PROMPT, MODEL };
