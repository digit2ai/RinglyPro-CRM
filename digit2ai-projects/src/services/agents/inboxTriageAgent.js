'use strict';

// Agent #3 — Inbox Triage
// Runs against a pending_review intake project. Pulls intake Q&A,
// quick web search for competitive context, then Sonnet for the full
// triage brief (fit score, regulatory flags, portfolio synergies,
// bilingual stakeholder questions, go/no-go).
//
// Persists to d2_projects.triage_brief (markdown) and triage_structured (JSON).

const { sequelize, Project } = require('../../models');
const { webSearch } = require('./webSearch');

const SONNET_MODEL = 'claude-sonnet-4-6';
const SONNET_IN = 3 / 1e6, SONNET_OUT = 15 / 1e6;

// Attempt to repair a truncated JSON object: strip a dangling partial token,
// drop trailing commas, then close any still-open strings/arrays/objects.
// Lets us salvage a usable triage even when the model hits max_tokens.
function repairTruncatedJson(src) {
  let s = src;
  // Cut anything after the last "complete-looking" value boundary so we don't
  // try to close in the middle of a half-written key or value.
  const lastClean = Math.max(s.lastIndexOf('"'), s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastClean > 0) s = s.slice(0, lastClean + 1);

  // Walk the string tracking structure + whether we're inside a string literal.
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (c === '\\') { esc = true; }
      else if (c === '"') { inStr = false; }
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') stack.pop();
  }
  if (inStr) s += '"';                       // close a dangling string
  s = s.replace(/,\s*$/, '');                // drop a trailing comma
  while (stack.length) s += stack.pop() === '{' ? '}' : ']';
  try { return JSON.parse(s); } catch (_) { return null; }
}

function safeParseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  // Last resort: the object never closed (truncated at max_tokens) — repair it.
  const start = cleaned.indexOf('{');
  if (start >= 0) return repairTruncatedJson(cleaned.slice(start));
  return null;
}

async function loadIntakeQA(projectId) {
  try {
    const [rows] = await sequelize.query(
      `SELECT q.id, q.question_text, q.sort_order, r.answer_text
       FROM d2_project_questions q
       LEFT JOIN d2_question_responses r ON r.question_id = q.id
       WHERE q.project_id = :pid
       ORDER BY q.sort_order, q.id`,
      { replacements: { pid: projectId } }
    );
    return rows || [];
  } catch (_) { return []; }
}

function renderMarkdown(project, parsed) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];
  lines.push(`# AI Triage Brief: ${project.name || project.title || ''}`);
  lines.push(`*Generated ${date} · Fit ${parsed.fit_score || '?'}/10 · Recommendation: **${(parsed.go_no_go_recommendation || 'review').replace(/_/g, ' ')}***`);
  lines.push('');
  lines.push('## Fit Assessment');
  lines.push(parsed.fit_reasoning || '(no reasoning provided)');
  if (parsed.wedge_recommendation) {
    lines.push('');
    lines.push('### Suggested v1 Wedge');
    lines.push(parsed.wedge_recommendation);
  }
  lines.push('');
  if (Array.isArray(parsed.regulatory_flags) && parsed.regulatory_flags.length) {
    lines.push('## Regulatory Flags');
    parsed.regulatory_flags.forEach(f => {
      const sev = (f.severity || 'medium').toUpperCase();
      lines.push(`- **[${sev}] ${f.risk || ''}** — ${f.what_to_check || ''}`);
    });
    lines.push('');
  }
  if (Array.isArray(parsed.portfolio_synergies) && parsed.portfolio_synergies.length) {
    lines.push('## Portfolio Synergies');
    parsed.portfolio_synergies.forEach(s => {
      lines.push(`- **${s.product || ''}** — ${s.angle || ''}`);
    });
    lines.push('');
  }
  if (Array.isArray(parsed.monetization_options) && parsed.monetization_options.length) {
    lines.push('## Monetization Options');
    parsed.monetization_options.forEach(m => lines.push(`- ${m}`));
    lines.push('');
  }
  if (Array.isArray(parsed.competitors_to_watch) && parsed.competitors_to_watch.length) {
    lines.push('## Competitors to Watch');
    parsed.competitors_to_watch.forEach(c => lines.push(`- ${c}`));
    lines.push('');
  }
  if (Array.isArray(parsed.stakeholder_questions_en) && parsed.stakeholder_questions_en.length) {
    lines.push('## Stakeholder Questions (English)');
    parsed.stakeholder_questions_en.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
    lines.push('');
  }
  if (Array.isArray(parsed.stakeholder_questions_es) && parsed.stakeholder_questions_es.length) {
    lines.push('## Preguntas para el stakeholder (Español)');
    parsed.stakeholder_questions_es.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
    lines.push('');
  }
  if (Array.isArray(parsed.conditions_if_any) && parsed.conditions_if_any.length) {
    lines.push('## Conditions (if conditional accept)');
    parsed.conditions_if_any.forEach(c => lines.push(`- ${c}`));
  }
  return lines.join('\n');
}

async function run({ project }) {
  if (!project || !project.id) {
    return { ok: false, error: 'missing_project', output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'no_api_key', output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) {
    return { ok: false, error: 'sdk_missing', output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Load intake Q&A
  const qa = await loadIntakeQA(project.id);
  const qaBlock = qa.length
    ? qa.map(r => `Q: ${r.question_text}\nA: ${r.answer_text || '(no answer)'}`).join('\n\n')
    : '(no structured intake Q&A on file)';

  // Quick competitive search
  const searchQuery = `${project.name || ''} ${project.sector || project.ai_category?.[0] || ''}`.trim().slice(0, 200);
  const competitors = searchQuery ? await webSearch(searchQuery, 4) : [];
  const competitorsBlock = competitors.length
    ? competitors.map(r => `- ${r.title} — ${r.snippet || ''} (${r.url})`).join('\n')
    : '(no search results — derive competitor list from sector knowledge)';

  const aiCategoryStr = Array.isArray(project.ai_category) ? project.ai_category.join(', ') : (project.ai_category || '');

  const prompt = `You are a partnerships triage analyst for Digit2AI / Manuel Stagg.
Digit2AI's portfolio includes:
- RinglyPro: multi-tenant voice AI (Rachel/Ana/Lina) for outbound calling, bilingual EN/ES
- HISPATEC: Hispanic professional network
- TunjoRacing: motorsport vertical
- CW Carriers: logistics
- SurgicalMind: medtech sales ops
- Visionarium: visual intelligence platform

INTAKE TO TRIAGE
Project: ${project.name || project.title || '(no name)'}
Submitter: ${project.submitter_name || '(unknown)'} (${project.submitter_email || '(no email)'}, ${project.country || '(no country)'})
Description: ${project.description || '(no description)'}
Target users: ${project.target_users || '(unknown)'}
Current process: ${project.current_process || '(unknown)'}
Timeline: ${project.timeline || '(unspecified)'}   Budget: ${project.budget_range || '(unspecified)'}
Sensitive data: ${project.sensitive_data_detail || '(none specified)'}
AI category: ${aiCategoryStr || '(unspecified)'}

INTAKE Q&A
${qaBlock}

COMPETITIVE CONTEXT (web search)
${competitorsBlock}

Produce JSON:
{
  "fit_score": 1-10,
  "fit_reasoning": "2-3 sentences explaining the score",
  "wedge_recommendation": "if scope is too big, which one piece should be v1",
  "regulatory_flags": [{"risk": "...", "severity": "high|medium|low", "what_to_check": "..."}],
  "portfolio_synergies": [{"product": "...", "angle": "..."}],
  "monetization_options": ["model 1", "model 2", "model 3"],
  "competitors_to_watch": ["competitor 1", "..."],
  "stakeholder_questions_es": ["pregunta 1", "..."],
  "stakeholder_questions_en": ["question 1", "..."],
  "go_no_go_recommendation": "accept | accept_with_conditions | reject",
  "conditions_if_any": ["condition 1", "..."]
}

Provide 10-15 stakeholder questions in EACH language, organized by feasibility / desired outcome / monetization. Spanish questions use usted form. Output only valid JSON.`;

  try {
    const resp = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 12000,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = resp?.content?.[0]?.text || '';
    const cost = (resp?.usage?.input_tokens || 0) * SONNET_IN + (resp?.usage?.output_tokens || 0) * SONNET_OUT;
    const parsed = safeParseJson(text);
    if (!parsed || typeof parsed.fit_score === 'undefined') {
      console.error('[inboxTriageAgent] parse_failed — stop_reason=%s, output_tokens=%s, text_len=%s, head=%j',
        resp?.stop_reason, resp?.usage?.output_tokens, text.length, text.slice(0, 300));
      return { ok: false, error: 'parse_failed', output_md: '', structured: { raw: text.slice(0, 2000) }, cost_estimate_usd: Number(cost.toFixed(4)), model: SONNET_MODEL };
    }
    const output_md = renderMarkdown(project, parsed);
    // Persist directly to the project row (this agent owns its own storage)
    try {
      await Project.update(
        { triage_brief: output_md, triage_structured: parsed, triage_at: new Date(), triage_model: SONNET_MODEL },
        { where: { id: project.id, workspace_id: 1 } }
      );
    } catch (dbErr) {
      console.error('[inboxTriageAgent] persist failed:', dbErr.message);
    }
    return {
      ok: true,
      output_md,
      structured: parsed,
      cost_estimate_usd: Number(cost.toFixed(4)),
      model: SONNET_MODEL
    };
  } catch (err) {
    console.error('[inboxTriageAgent] Sonnet call failed:', err.message);
    return { ok: false, error: err.message, output_md: '', structured: null, cost_estimate_usd: 0, model: SONNET_MODEL };
  }
}

// Convenience: run by project id (loads project + dispatches)
async function runById(projectId) {
  const project = await Project.findOne({ where: { id: projectId, workspace_id: 1 } });
  if (!project) return { ok: false, error: 'project_not_found', model: SONNET_MODEL };
  return run({ project });
}

module.exports = { run, runById, SONNET_MODEL };
