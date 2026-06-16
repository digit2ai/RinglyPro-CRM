/**
 * Business Plan Generator -- Anthropic Claude integration
 * Used by chamber-template Stage 0 (P2B) to convert a vision into a structured plan.
 */
const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are a business plan generator for a chamber of commerce P2B (Project to Business) platform. Given a 2-paragraph vision and basic constraints, produce a concise, structured business plan in JSON.

Output schema (strict JSON, no prose, no markdown fences):
{
  "title": string,
  "executive_summary": string (2-3 sentences, max 400 chars),
  "problem_market": {
    "problem_statement": string (max 200 chars),
    "tam_usd": number,
    "sam_usd": number,
    "som_usd": number,
    "target_segments": string[] (2-3 items, each max 80 chars)
  },
  "solution": {
    "description": string (max 300 chars),
    "key_differentiators": string[] (2-3 items, each max 80 chars),
    "tech_stack_or_methodology": string[] (2-4 items, each max 40 chars)
  },
  "go_to_market": {
    "phases": [{ "name": string, "duration_months": number, "activities": string[] (2-3 items, each max 80 chars) }] (2-3 phases),
    "channel_strategy": string (max 200 chars),
    "regional_priorities": [{ "region": string, "rationale": string (max 100 chars) }] (1-3 items)
  },
  "revenue_model": {
    "pricing_tiers": [{ "name": string, "price_usd": number, "period": string }] (1-3 tiers),
    "year1_revenue_estimate_usd": number,
    "year3_revenue_estimate_usd": number
  },
  "team_roles_required": [
    {
      "role_title": string,
      "responsibilities": string[] (2-3 items, each max 80 chars),
      "required_skills": string[] (2-4 items, each max 40 chars),
      "preferred_sectors": string[] (1-3 items),
      "preferred_regions": string[] (1-3 items),
      "commitment_pct": number,
      "must_have": boolean
    }
  ],
  "budget_breakdown": [{ "category": string, "amount_usd": number, "phase": string }] (3-5 items),
  "timeline_milestones": [
    { "month": number, "milestone": string (max 60 chars), "deliverable": string (max 100 chars) }
  ] (3-6 items),
  "risks": [{ "risk": string (max 80 chars), "likelihood": "low|medium|high", "mitigation": string (max 120 chars) }] (2-3 items),
  "success_kpis": [{ "kpi": string (max 60 chars), "target": string (max 60 chars), "measurement_period": string }] (2-4 items)
}

Generate a realistic, concise plan -- short and scannable, not exhaustive. team_roles_required must specify 3-5 distinct roles with clear required_skills and preferred_sectors so AI matching can identify candidates. Keep all string lengths within the limits above. Output ONLY valid JSON, no prose, no markdown fences.`;

const MODEL = 'claude-sonnet-4-6';

function buildUserMessage({ vision, sector, countries, budget_tier, target_delivery_weeks, target_total_usd }) {
  const countryStr = Array.isArray(countries) ? countries.join(', ') : (countries || 'global');
  const tierMap = {
    small: '$50k-200k',
    medium: '$200k-1M',
    large: '$1M+'
  };
  const tier = tierMap[budget_tier] || tierMap.medium;

  // Hard targets override the budget tier. When supplied, the plan must
  // make timeline_milestones fit the delivery window (expressed in weeks)
  // and the sum of budget_breakdown[].amount_usd must equal target_total_usd.
  // The plan schema's timeline_milestones[].month field still uses 1-indexed
  // months — we convert weeks -> months (1 month ≈ 4.33 weeks) so Claude
  // packs the schedule into the right number of monthly buckets.
  const targetMonths = target_delivery_weeks
    ? Math.max(1, Math.ceil(Number(target_delivery_weeks) / 4.33))
    : null;

  const hardTargets = (target_delivery_weeks || target_total_usd)
    ? `\n\nHARD CONSTRAINTS (must honor exactly):
${target_delivery_weeks ? `- Delivery window: ${target_delivery_weeks} weeks (approximately ${targetMonths} months). timeline_milestones MUST span months 1 through ${targetMonths} with the final milestone at month ${targetMonths}. If the window is short (<= 4 weeks), use a single milestone at month 1 describing weekly sub-deliverables in its "deliverable" text.` : ''}
${target_total_usd ? `- Total project budget: $${Number(target_total_usd).toLocaleString('en-US')} USD. The sum of budget_breakdown[].amount_usd MUST equal this number (split into reasonable line items).` : ''}`
    : '';

  return `User vision:
${vision}

Sector: ${sector || 'general'}
Countries: ${countryStr}
Budget tier: ${budget_tier || 'medium'} (${tier})${hardTargets}

Generate the structured business plan now.`;
}

async function generatePlan({ vision, sector, countries, budget_tier, target_delivery_weeks, target_total_usd }) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
    ],
    messages: [
      { role: 'user', content: buildUserMessage({ vision, sector, countries, budget_tier, target_delivery_weeks, target_total_usd }) }
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
