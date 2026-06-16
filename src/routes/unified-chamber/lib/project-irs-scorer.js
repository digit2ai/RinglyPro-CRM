/**
 * Project Investment Readiness Score (IRS).
 *
 * Computes a 0-100 score for a chamber project across 8 weighted dimensions,
 * plus an optional Claude AI synthesis pass that adjusts +/-10pts based on
 * the cohesion / quality of the underlying plan and team. Stored on the
 * `projects` table (irs_score, irs_components, irs_evidence, irs_grade,
 * irs_computed_at).
 *
 * Mirrors the trust-verifier.js pattern -- deterministic per-dimension
 * scores from the plan JSON + project metadata, then an LLM critique
 * for cross-dimension cohesion. AI is optional; the deterministic pass
 * runs in <100ms with zero external calls.
 */

const WEIGHTS = {
  financial_viability: 0.20,
  team_experience: 0.15,
  market_traction: 0.15,
  business_model: 0.10,
  regulatory_legal: 0.10,
  esg_impact: 0.10,
  scalability: 0.10,
  banking_match: 0.10
};

// Grade thresholds. "Investment Grade" is the gate for the future investor layer.
function grade(score) {
  if (score >= 0.85) return 'Investment Grade';
  if (score >= 0.75) return 'Strong Candidate';
  if (score >= 0.50) return 'Promising';
  if (score >= 0.30) return 'Early Stage';
  return 'Idea';
}

// ----- per-dimension scoring (each returns 0..1) -----

function scoreFinancialViability(plan, project, team) {
  let score = 0;
  const d = {};
  const rev = plan && plan.revenue_model;
  if (rev) {
    if (Array.isArray(rev.pricing_tiers) && rev.pricing_tiers.length > 0) {
      score += 0.30; d.pricing_tiers = rev.pricing_tiers.length;
    }
    if (rev.year1_revenue_estimate_usd > 0) {
      score += 0.20; d.year1_revenue = rev.year1_revenue_estimate_usd;
    }
    if (rev.year3_revenue_estimate_usd > 0) {
      score += 0.10; d.year3_revenue = rev.year3_revenue_estimate_usd;
      // Bonus: realistic growth (3x-30x over 3 years, anything outside is suspicious)
      const ratio = rev.year3_revenue_estimate_usd / Math.max(1, rev.year1_revenue_estimate_usd);
      if (ratio >= 3 && ratio <= 30) { score += 0.10; d.growth_ratio_realistic = ratio; }
    }
  }
  const bud = Array.isArray(plan && plan.budget_breakdown) ? plan.budget_breakdown : [];
  if (bud.length > 0) {
    score += 0.20; d.budget_line_items = bud.length;
    const total = bud.reduce((s, b) => s + (parseFloat(b.amount_usd) || 0), 0);
    if (total > 0) { score += 0.10; d.budget_total_usd = total; }
  }
  return { score: Math.min(1, score), detail: d };
}

function scoreTeamExperience(plan, project, team) {
  const d = {};
  // Average trust_score of all confirmed team members; the proposer's score
  // counts double because they carry the project's reputation.
  const members = Array.isArray(team) ? team : [];
  const proposer = members.find(m => m.is_proposer);
  const trustScores = members.map(m => parseFloat(m.trust_score || 0.5));
  if (trustScores.length === 0) {
    d.team_size = 0;
    return { score: 0.1, detail: d }; // minimum for "founder declared"
  }
  let avgTrust = trustScores.reduce((s, t) => s + t, 0) / trustScores.length;
  if (proposer) avgTrust = (avgTrust + parseFloat(proposer.trust_score || 0.5)) / 2;

  let score = avgTrust * 0.7; // trust dominates this dimension
  d.team_size = members.length;
  d.avg_trust = Math.round(avgTrust * 1000) / 1000;

  // Bonus: required roles filled vs required roles total
  const required = Array.isArray(plan && plan.team_roles_required) ? plan.team_roles_required.length : 0;
  if (required > 0) {
    const fillRatio = Math.min(1, members.length / required);
    score += fillRatio * 0.3;
    d.required_roles = required;
    d.fill_ratio = Math.round(fillRatio * 100) / 100;
  } else {
    score += 0.15;
  }
  return { score: Math.min(1, score), detail: d };
}

function scoreMarketTraction(plan, project, team) {
  let score = 0;
  const d = {};
  const pm = plan && plan.problem_market;
  if (pm) {
    if (pm.problem_statement && pm.problem_statement.length >= 50) {
      score += 0.20; d.problem_statement = 'substantive';
    }
    if (pm.tam_usd > 0) { score += 0.20; d.tam_usd = pm.tam_usd; }
    if (pm.sam_usd > 0) { score += 0.15; d.sam_usd = pm.sam_usd; }
    if (pm.som_usd > 0) { score += 0.15; d.som_usd = pm.som_usd; }
    if (Array.isArray(pm.target_segments) && pm.target_segments.length >= 2) {
      score += 0.20; d.target_segments = pm.target_segments.length;
    }
    // TAM/SAM/SOM monotonicity sanity check
    if (pm.tam_usd > 0 && pm.sam_usd > 0 && pm.som_usd > 0) {
      if (pm.tam_usd > pm.sam_usd && pm.sam_usd > pm.som_usd) {
        score += 0.10; d.market_sizing_consistent = true;
      } else {
        d.market_sizing_consistent = false;
      }
    }
  }
  return { score: Math.min(1, score), detail: d };
}

function scoreBusinessModel(plan, project, team) {
  let score = 0;
  const d = {};
  const sol = plan && plan.solution;
  if (sol) {
    if (sol.description && sol.description.length >= 80) {
      score += 0.30; d.solution_description = 'substantive';
    }
    if (Array.isArray(sol.key_differentiators) && sol.key_differentiators.length >= 2) {
      score += 0.25; d.key_differentiators = sol.key_differentiators.length;
    }
    if (Array.isArray(sol.tech_stack_or_methodology) && sol.tech_stack_or_methodology.length >= 1) {
      score += 0.15; d.tech_stack = sol.tech_stack_or_methodology.length;
    }
  }
  const rev = plan && plan.revenue_model;
  if (rev && Array.isArray(rev.pricing_tiers) && rev.pricing_tiers.length > 0) {
    // Reward varied pricing tiers (suggests segmentation thinking)
    score += rev.pricing_tiers.length >= 2 ? 0.30 : 0.15;
    d.pricing_tiers = rev.pricing_tiers.length;
  }
  return { score: Math.min(1, score), detail: d };
}

function scoreRegulatoryLegal(plan, project, team) {
  let score = 0.5; // start neutral -- no evidence == not necessarily bad
  const d = {};
  const risks = Array.isArray(plan && plan.risks) ? plan.risks : [];
  if (risks.length >= 2) {
    score += 0.30; d.risks_identified = risks.length;
    // Bonus: every risk has a mitigation
    const mitigated = risks.filter(r => r.mitigation && r.mitigation.length >= 20).length;
    if (mitigated === risks.length) {
      score += 0.20; d.all_risks_mitigated = true;
    } else {
      d.mitigated_ratio = Math.round((mitigated / risks.length) * 100) / 100;
    }
  } else if (risks.length === 1) {
    score += 0.10; d.risks_identified = 1;
  } else {
    score -= 0.20; // not even identifying any risks is a yellow flag
    d.risks_identified = 0;
  }
  return { score: Math.max(0, Math.min(1, score)), detail: d };
}

function scoreEsgImpact(plan, project, team) {
  let score = 0;
  const d = {};
  // Look for ESG-aligned keywords across the plan
  const haystack = JSON.stringify(plan || {}).toLowerCase();
  const positive = [
    'sustainab', 'esg', 'environment', 'social impact', 'community', 'underserved',
    'diversity', 'inclusion', 'equity', 'renewable', 'climate', 'carbon', 'green',
    'bilingual', 'access', 'affordable', 'low-income', 'minority', 'sdg', 'impact'
  ];
  const hits = positive.filter(k => haystack.includes(k)).length;
  d.esg_keyword_hits = hits;
  if (hits >= 5) score += 0.6;
  else if (hits >= 3) score += 0.4;
  else if (hits >= 1) score += 0.2;
  // Bonus: target_segments mention underserved populations
  const pm = plan && plan.problem_market;
  if (pm && Array.isArray(pm.target_segments)) {
    const segs = pm.target_segments.join(' ').toLowerCase();
    if (/underserved|low.income|minority|veteran|immigrant|first.gen|bilingual/.test(segs)) {
      score += 0.4; d.underserved_segment = true;
    }
  }
  return { score: Math.min(1, score), detail: d };
}

function scoreScalability(plan, project, team) {
  let score = 0;
  const d = {};
  const gtm = plan && plan.go_to_market;
  if (gtm) {
    if (Array.isArray(gtm.phases) && gtm.phases.length >= 2) {
      score += 0.30; d.phases = gtm.phases.length;
    }
    if (gtm.channel_strategy && gtm.channel_strategy.length >= 50) {
      score += 0.20; d.channel_strategy = 'substantive';
    }
    if (Array.isArray(gtm.regional_priorities) && gtm.regional_priorities.length >= 2) {
      score += 0.25; d.regional_priorities = gtm.regional_priorities.length;
    }
  }
  // Multi-country targeting
  const countries = Array.isArray(project && project.target_countries)
    ? project.target_countries
    : (project && project.countries) || [];
  if (countries.length >= 2) {
    score += 0.15; d.target_countries = countries.length;
  }
  // Tech-enabled solutions scale faster
  const sol = plan && plan.solution;
  if (sol && Array.isArray(sol.tech_stack_or_methodology) && sol.tech_stack_or_methodology.length > 0) {
    score += 0.10; d.tech_enabled = true;
  }
  return { score: Math.min(1, score), detail: d };
}

function scoreBankingMatch(plan, project, team) {
  let score = 0;
  const d = {};
  // Proxy: team avg trust + budget realism. Real implementation would
  // check ACH/Stripe Connect onboarding status, but this MVP uses trust
  // as a substitute for "the founders are bankable".
  const members = Array.isArray(team) ? team : [];
  if (members.length > 0) {
    const avgTrust = members.reduce((s, m) => s + parseFloat(m.trust_score || 0.5), 0) / members.length;
    score += avgTrust * 0.5;
    d.team_avg_trust = Math.round(avgTrust * 1000) / 1000;
  }
  // Budget transparency
  const bud = Array.isArray(plan && plan.budget_breakdown) ? plan.budget_breakdown : [];
  if (bud.length >= 3) score += 0.3;
  else if (bud.length >= 1) score += 0.15;
  d.budget_line_items = bud.length;
  // Revenue projections present
  const rev = plan && plan.revenue_model;
  if (rev && rev.year1_revenue_estimate_usd > 0) {
    score += 0.2; d.year1_revenue_declared = true;
  }
  return { score: Math.min(1, score), detail: d };
}

// ----- optional AI synthesis pass -----

async function maybeAiAdjust(plan, project, team, components, baseScore) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return { adjusted_score: baseScore, ai_used: false, ai_reason: null };
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const summary = {
      project: {
        title: project.title || (plan && plan.title),
        sector: project.sector,
        countries: project.countries || project.target_countries || [],
        plan_status: project.plan_status,
        team_size: (team || []).length
      },
      plan_summary: {
        executive_summary: plan && plan.executive_summary,
        roles_required: plan && Array.isArray(plan.team_roles_required) ? plan.team_roles_required.length : 0,
        milestones: plan && Array.isArray(plan.timeline_milestones) ? plan.timeline_milestones.length : 0,
        risks: plan && Array.isArray(plan.risks) ? plan.risks.length : 0
      },
      component_scores: Object.fromEntries(
        Object.entries(components).map(([k, v]) => [k, Math.round(v.score * 100) / 100])
      ),
      base_irs: Math.round(baseScore * 100) / 100
    };
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 350,
      system: `You audit project Investment Readiness Scores (IRS) for a chamber-of-commerce platform. Given dimension scores and the underlying plan summary, decide whether the base score should be adjusted up or down by no more than 0.10 (10 percentage points) based on cohesion / realism / quality.

REASONS TO ADJUST DOWN: plan numbers contradict (e.g. $1M revenue but no pricing tiers, huge TAM with tiny team), exec summary is generic / boilerplate, milestones don't align with budget, claimed differentiation is weak, risks identified are superficial.

REASONS TO ADJUST UP: tight internal consistency across dimensions, ambitious but realistic projections, deep industry expertise inferable from the plan, strong ESG narrative aligned with the target segment.

Reply ONLY with valid JSON: {"adjustment": number (between -0.10 and +0.10), "reason": "one-sentence explanation"}.`,
      messages: [{ role: 'user', content: JSON.stringify(summary) }]
    });
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    let parsed;
    try { parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); }
    catch (_) { return { adjusted_score: baseScore, ai_used: false, ai_reason: 'parse_failed' }; }
    const adj = Math.max(-0.10, Math.min(0.10, parseFloat(parsed.adjustment) || 0));
    return {
      adjusted_score: Math.max(0, Math.min(1, baseScore + adj)),
      ai_used: true,
      ai_adjustment: adj,
      ai_reason: parsed.reason || null
    };
  } catch (e) {
    return { adjusted_score: baseScore, ai_used: false, ai_reason: 'ai_error:' + e.message };
  }
}

// ----- public API -----

/**
 * Score one project. Pass:
 *   project        -- row from `projects` table (must include plan_json, sector, etc.)
 *   team           -- array of { member_id, trust_score, is_proposer } for current team members
 *   opts.useAi     -- default true; pass false for fast/cheap recomputes
 */
async function scoreProject(project, team, opts = {}) {
  const useAi = opts.useAi !== false;
  const plan = project && project.plan_json;

  const components = {
    financial_viability: scoreFinancialViability(plan, project, team),
    team_experience:     scoreTeamExperience(plan, project, team),
    market_traction:     scoreMarketTraction(plan, project, team),
    business_model:      scoreBusinessModel(plan, project, team),
    regulatory_legal:    scoreRegulatoryLegal(plan, project, team),
    esg_impact:          scoreEsgImpact(plan, project, team),
    scalability:         scoreScalability(plan, project, team),
    banking_match:       scoreBankingMatch(plan, project, team)
  };

  const baseScore = Object.entries(WEIGHTS).reduce(
    (sum, [k, w]) => sum + (components[k].score * w), 0
  );

  const ai = useAi
    ? await maybeAiAdjust(plan, project, team, components, baseScore)
    : { adjusted_score: baseScore, ai_used: false, ai_reason: null };

  const finalScore = Math.round(ai.adjusted_score * 1000) / 1000;
  return {
    score: finalScore,
    score_100: Math.round(finalScore * 100),
    base_score: Math.round(baseScore * 1000) / 1000,
    grade: grade(finalScore),
    components: Object.fromEntries(
      Object.entries(components).map(([k, v]) => [k, {
        score: Math.round(v.score * 1000) / 1000,
        weight: WEIGHTS[k],
        contribution: Math.round(v.score * WEIGHTS[k] * 1000) / 1000,
        detail: v.detail
      }])
    ),
    ai: {
      used: ai.ai_used,
      adjustment: ai.ai_adjustment || 0,
      reason: ai.ai_reason
    },
    computed_at: new Date().toISOString()
  };
}

module.exports = { scoreProject, WEIGHTS, grade };
