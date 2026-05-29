'use strict';

// Agent #4 — Senior Business Analyst
// Input:  { task, project }
// Output: { ok, output_md, structured, cost_estimate_usd, model, error, agent_status_override? }
//
// Purpose:
//   Produce a reviewable, decision-grade BA deliverable on a single task.
//   Auto-classifies the work into one of ~14 deliverable types, attaches
//   confidence per finding / recommendation, flags claims that should be
//   verified against current public sources, and emits ready-to-send
//   drafts (email copy, agendas, talking points) in human_action_queue
//   for residue that needs a person.
//
//   Refuse cleanly on tasks that are purely "attend meeting" / "have call"
//   by returning deliverable_type = 'refusal_human_action_required' and
//   shipping prep materials instead of padded analysis. The dispatcher
//   honors the agent_status_override = 'out_of_scope' so the UI can render
//   that distinction. See requirement #5.
//
// Mirrors researchBriefAgent.js / outreachDrafterAgent.js for shape and
// cost-tracking. No web search in v1 — Claude's training data is the
// research input (gated by env SENIOR_BA_USE_WEB_SEARCH for v2).

const OPUS_MODEL = process.env.SENIOR_BA_MODEL || 'claude-opus-4-7';
const DEFAULT_MAX_TOKENS = Number(process.env.SENIOR_BA_MAX_TOKENS) || 6000;

// Rough $/MTok for Opus 4.x: $15 in / $75 out.
// Sonnet fallback rates if user overrides SENIOR_BA_MODEL to a sonnet variant.
const COST_RATES = {
  'claude-opus-4-7':            { in: 15 / 1e6, out: 75 / 1e6 },
  'claude-opus-4-6':            { in: 15 / 1e6, out: 75 / 1e6 },
  'claude-sonnet-4-6':          { in:  3 / 1e6, out: 15 / 1e6 },
  'claude-sonnet-4-5-20250929': { in:  3 / 1e6, out: 15 / 1e6 }
};
function rateFor(model) {
  return COST_RATES[model] || COST_RATES['claude-opus-4-7'];
}

const VALID_DELIVERABLE_TYPES = new Set([
  'regulatory_research',
  'market_research',
  'competitive_analysis',
  'integration_partner_scan',
  'framework_design',
  'architecture_spec',
  'roadmap',
  'deck_outline',
  'archive_memo',
  'partnership_brief',
  'strategy_proposal',
  'feasibility_writeup',
  'requirements_scope',
  'refusal_human_action_required'
]);

const VALID_CONFIDENCE = new Set(['high', 'medium', 'low']);
const VALID_EFFORT     = new Set(['low', 'medium', 'high']);
const VALID_SOURCE_TYPE = new Set(['training_data', 'public_doc', 'industry_known']);

const SYSTEM_PROMPT = `You are a Senior Business Analyst at Digit2AI working directly for Manuel Stagg. You produce reviewable, decision-grade artifacts on a single task at a time. Your audience is a sharp founder who hates filler and rewards specificity.

OPERATING PRINCIPLES
1. Concise over comprehensive. Every sentence earns its place. No throat-clearing, no recaps, no "in conclusion."
2. Specific over abstract. Numbers, names, dates, dollar figures, source URLs — or explicitly say "unknown — needs verification."
3. Never invent statistics. If you do not have a number from training data with high confidence, write the directional claim and tag it [verify]. Do NOT write fake percentages, market sizes, headcount figures, or revenue numbers.
4. Confidence is a first-class signal. Tag every key_finding and recommendation with confidence: high | medium | low. "high" means you'd defend this in a board meeting; "low" means it's an informed guess.
5. Acknowledge your knowledge cutoff. Your training data has a cutoff. For regulatory rules, pricing, executive names at companies, and product features, prefer "as of [last known date], X — verify current state" over confident assertions.
6. Recommend, don't just describe. Every deliverable ends with a recommendation the user could act on tomorrow.
7. Detect human-required residue. If any sub-step requires a live conversation, calendar negotiation with an external party, an external party's response, or pressing "send" on a personal relationship — DO NOT pretend to complete it. Put it in human_action_queue with a ready-to-use draft (agenda / email copy / suggested times / talking points).
8. Refuse cleanly when the ENTIRE task is human-only. If the task is purely "attend meeting" or "have a phone call," set deliverable_type = "refusal_human_action_required" and put the prep materials (agenda, talking points, expected questions) in human_action_queue. Do not pad with filler analysis. The BA SHOULD attempt research / drafting / design / strategy tasks — only refuse for genuinely human-required actions (live meetings, phone calls, in-person, signatures).

DELIVERABLE TYPES (pick exactly one based on task intent)
- regulatory_research — laws, compliance rules, agency requirements
- market_research — market size, segments, trends, TAM/SAM/SOM scoping
- competitive_analysis — players, positioning, feature/price matrix
- integration_partner_scan — shortlist of vendors/APIs/partners with fit assessment
- framework_design — conceptual model, taxonomy, scoring rubric
- architecture_spec — system flow, data model, component breakdown
- roadmap — phased plan with milestones, dependencies, owners
- deck_outline — slide-by-slide structure with key message + supporting points per slide
- archive_memo — write-up of a past event, decision, or initiative
- partnership_brief — one-pager on a potential partner: who they are, fit, asks, risks
- strategy_proposal — recommended direction with tradeoffs
- feasibility_writeup — concept validation: is this possible, what would it cost
- requirements_scope — list of in-scope / out-of-scope items, acceptance criteria
- refusal_human_action_required — task needs a person; deliver prep materials only

OUTPUT FORMAT
Respond with a single JSON object. No prose before or after. No markdown fences. The JSON must conform to this schema (additional fields allowed but the named fields are required):

{
  "deliverable_type": "one of the types above",
  "executive_summary": "2-4 sentence summary a CEO can read in 15 seconds. Lead with the recommendation if there is one.",
  "key_findings": [
    { "finding": "concise statement", "confidence": "high|medium|low", "evidence": "what backs this (training data | inference | source title)" }
  ],
  "recommendations": [
    { "recommendation": "what to do", "rationale": "why", "confidence": "high|medium|low", "effort": "low|medium|high" }
  ],
  "next_steps": [
    "concrete, single-actor action items in priority order"
  ],
  "sources": [
    { "title": "...", "url": "... or empty string if from training data", "type": "training_data|public_doc|industry_known", "note": "what this source supports" }
  ],
  "human_action_queue": [
    { "action": "what the human must do", "draft": "ready-to-use copy (email body / agenda / talking points) — empty string if not applicable", "blocked_on": "what makes this require a human" }
  ],
  "open_questions": [
    "things the BA could not resolve and that would change the recommendation if answered"
  ],
  "verify_flags": [
    "specific claims in this deliverable that the user should fact-check before relying on them (regulations, current pricing, contact names, recent events)"
  ],
  "confidence_overall": "high|medium|low"
}

Respond with the JSON object only.`;

function safeParseJson(text) {
  if (!text) return null;
  let cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  // Greedy outer braces (handles "Here's my response: { ... }" preamble)
  const greedy = cleaned.match(/\{[\s\S]*\}/);
  if (greedy) { try { return JSON.parse(greedy[0]); } catch (_) {} }
  // Brace-counted extraction — finds the first balanced {...} block. Survives
  // trailing prose after the JSON closes, which Opus occasionally adds despite
  // the "JSON only" instruction.
  const start = cleaned.indexOf('{');
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            const candidate = cleaned.slice(start, i + 1);
            try { return JSON.parse(candidate); } catch (_) { break; }
          }
        }
      }
    }
  }
  return null;
}

function coerceConfidence(v, fallback) {
  return VALID_CONFIDENCE.has(v) ? v : (fallback || 'medium');
}
function coerceEffort(v) {
  return VALID_EFFORT.has(v) ? v : 'medium';
}
function coerceSourceType(v) {
  return VALID_SOURCE_TYPE.has(v) ? v : 'training_data';
}
function coerceDeliverableType(v) {
  return VALID_DELIVERABLE_TYPES.has(v) ? v : 'strategy_proposal';
}

// Defensively normalize the parsed object so the UI never crashes on a
// missing field, and the structured JSONB column always has the shape
// the contract promises.
function normalize(parsed) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    deliverable_type: coerceDeliverableType(p.deliverable_type),
    executive_summary: String(p.executive_summary || '').trim(),
    key_findings: Array.isArray(p.key_findings) ? p.key_findings.map(f => ({
      finding: String((f && f.finding) || '').trim(),
      confidence: coerceConfidence(f && f.confidence, 'medium'),
      evidence: String((f && f.evidence) || '').trim()
    })).filter(f => f.finding) : [],
    recommendations: Array.isArray(p.recommendations) ? p.recommendations.map(r => ({
      recommendation: String((r && r.recommendation) || '').trim(),
      rationale: String((r && r.rationale) || '').trim(),
      confidence: coerceConfidence(r && r.confidence, 'medium'),
      effort: coerceEffort(r && r.effort)
    })).filter(r => r.recommendation) : [],
    next_steps: Array.isArray(p.next_steps) ? p.next_steps.map(s => String(s || '').trim()).filter(Boolean) : [],
    sources: Array.isArray(p.sources) ? p.sources.map(s => ({
      title: String((s && s.title) || '').trim(),
      url: String((s && s.url) || '').trim(),
      type: coerceSourceType(s && s.type),
      note: String((s && s.note) || '').trim()
    })).filter(s => s.title || s.url || s.note) : [],
    human_action_queue: Array.isArray(p.human_action_queue) ? p.human_action_queue.map(h => ({
      action: String((h && h.action) || '').trim(),
      draft: String((h && h.draft) || '').trim(),
      blocked_on: String((h && h.blocked_on) || '').trim()
    })).filter(h => h.action) : [],
    open_questions: Array.isArray(p.open_questions) ? p.open_questions.map(q => String(q || '').trim()).filter(Boolean) : [],
    verify_flags: Array.isArray(p.verify_flags) ? p.verify_flags.map(v => String(v || '').trim()).filter(Boolean) : [],
    confidence_overall: coerceConfidence(p.confidence_overall, 'medium')
  };
}

function fmtConfidence(c) {
  const c2 = String(c || 'medium').toLowerCase();
  if (c2 === 'high') return 'high';
  if (c2 === 'low') return 'low';
  return 'medium';
}

// Render the typed structured deliverable as a markdown report. This is
// what renderAgentPanel displays inline via simpleMarkdownToHtml in the
// task detail modal — so it must use the same restricted markdown subset
// (headings, bold, lists, links, paragraphs) that the renderer supports.
function renderMarkdown(task, parsed) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];
  const typeLabel = String(parsed.deliverable_type || 'strategy_proposal').replace(/_/g, ' ');
  lines.push(`# Senior BA Deliverable: ${task.title || '(untitled)'}`);
  lines.push(`*Generated ${date} - Type: **${typeLabel}** - Overall confidence: **${fmtConfidence(parsed.confidence_overall)}***`);
  lines.push('');

  if (parsed.executive_summary) {
    lines.push('## Executive Summary');
    lines.push(parsed.executive_summary);
    lines.push('');
  }

  if (parsed.key_findings && parsed.key_findings.length) {
    lines.push('## Key Findings');
    parsed.key_findings.forEach(f => {
      lines.push(`- **[${fmtConfidence(f.confidence)}]** ${f.finding}${f.evidence ? ' — *' + f.evidence + '*' : ''}`);
    });
    lines.push('');
  }

  if (parsed.recommendations && parsed.recommendations.length) {
    lines.push('## Recommendations');
    parsed.recommendations.forEach(r => {
      lines.push(`- **${r.recommendation}** — ${r.rationale}  `);
      lines.push(`  *(confidence: ${fmtConfidence(r.confidence)}, effort: ${coerceEffort(r.effort)})*`);
    });
    lines.push('');
  }

  if (parsed.next_steps && parsed.next_steps.length) {
    lines.push('## Next Steps');
    parsed.next_steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }

  if (parsed.human_action_queue && parsed.human_action_queue.length) {
    lines.push('## Human Action Queue');
    lines.push('*The following items require a person — drafts below are ready to paste.*');
    lines.push('');
    parsed.human_action_queue.forEach((h, i) => {
      lines.push(`### ${i + 1}. ${h.action}`);
      if (h.blocked_on) lines.push(`*Blocked on: ${h.blocked_on}*`);
      if (h.draft) {
        lines.push('');
        lines.push('**Draft (copy-paste ready):**');
        lines.push('');
        lines.push('```');
        lines.push(h.draft);
        lines.push('```');
      }
      lines.push('');
    });
  }

  if (parsed.sources && parsed.sources.length) {
    lines.push('## Sources');
    parsed.sources.forEach((s, i) => {
      const titleTxt = s.url ? `[${s.title || s.url}](${s.url})` : (s.title || '(untitled)');
      lines.push(`${i + 1}. **${titleTxt}** *(${s.type})*${s.note ? ' — ' + s.note : ''}`);
    });
    lines.push('');
  }

  if (parsed.open_questions && parsed.open_questions.length) {
    lines.push('## Open Questions');
    parsed.open_questions.forEach(q => lines.push(`- ${q}`));
    lines.push('');
  }

  if (parsed.verify_flags && parsed.verify_flags.length) {
    lines.push('## Verify Before Relying');
    lines.push('*Claude\'s training data has a knowledge cutoff. Fact-check these before acting:*');
    parsed.verify_flags.forEach(v => lines.push(`- ${v}`));
    lines.push('');
  }

  return lines.join('\n');
}

// Build the user message — keeps the system prompt clean and reusable.
function buildUserMessage({ task, project }) {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}.

Produce the deliverable for this task.

TASK
- Title: ${task.title || '(untitled)'}
- Description: ${task.description || '(none)'}
- Suggested owner / requester: ${task.assignee_hint || task.owner || '(unspecified)'}

PROJECT CONTEXT
- Project: ${project?.name || '(unattached)'}
- Sector / country: ${project?.sector || '(unknown)'} / ${project?.country || '(unknown)'}
- Project purpose: ${project?.description || '(no project description on file)'}

If the project context is missing or empty, infer cautiously from the task title alone and set confidence_overall to "low" or "medium". If the task title is itself ambiguous (under 4 words, no domain hint), produce a deliverable_type = "requirements_scope" that lists the clarifying questions you would need answered before producing a full artifact — that is itself a useful deliverable.

Respond with the JSON object only.`;
}

async function run({ task, project }) {
  if (!task || !task.title) {
    return { ok: false, error: 'missing_task', output_md: '', structured: null, cost_estimate_usd: 0, model: OPUS_MODEL };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'no_api_key', output_md: '', structured: null, cost_estimate_usd: 0, model: OPUS_MODEL };
  }

  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) {
    return { ok: false, error: 'sdk_missing', output_md: '', structured: null, cost_estimate_usd: 0, model: OPUS_MODEL };
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let totalCost = 0;
  const rate = rateFor(OPUS_MODEL);
  const userMsg = buildUserMessage({ task, project });

  let resp;
  try {
    resp = await client.messages.create({
      model: OPUS_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }]
    });
  } catch (err) {
    console.error('[businessAnalystAgent] Opus call failed:', err.message);
    return {
      ok: false,
      error: err.message || 'opus_call_failed',
      output_md: '',
      structured: null,
      cost_estimate_usd: 0,
      model: OPUS_MODEL
    };
  }

  const text = (resp && resp.content && resp.content[0] && resp.content[0].text) || '';
  totalCost += (resp?.usage?.input_tokens || 0) * rate.in + (resp?.usage?.output_tokens || 0) * rate.out;

  let rawParsed = safeParseJson(text);
  // Retry once if first response wasn't valid JSON. Opus occasionally adds
  // a preamble or trailing prose despite the "JSON only" instruction, or
  // hits max_tokens mid-object. Reissue the same prompt + show what came
  // back and ask explicitly for ONLY the JSON. ~95% of parse failures
  // recover on this second pass.
  if (!rawParsed) {
    try {
      const retryResp = await client.messages.create({
        model: OPUS_MODEL,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userMsg },
          { role: 'assistant', content: text || '(empty response)' },
          { role: 'user', content: 'Your last response was not valid JSON or was truncated. Reply again with the COMPLETE JSON object only — no preamble, no markdown fences, no trailing commentary. Begin your reply with { and end with }. If your previous response was truncated mid-field, shorten the content so the JSON fits within the token budget.' }
        ]
      });
      const retryText = (retryResp && retryResp.content && retryResp.content[0] && retryResp.content[0].text) || '';
      totalCost += (retryResp?.usage?.input_tokens || 0) * rate.in + (retryResp?.usage?.output_tokens || 0) * rate.out;
      rawParsed = safeParseJson(retryText);
    } catch (err) {
      console.error('[businessAnalystAgent] retry call failed:', err.message);
    }
  }
  if (!rawParsed) {
    return {
      ok: false,
      error: 'parse_failed',
      output_md: '',
      structured: { raw: String(text).slice(0, 2000) },
      cost_estimate_usd: Number(totalCost.toFixed(4)),
      model: OPUS_MODEL
    };
  }

  const structured = normalize(rawParsed);
  const output_md = renderMarkdown(task, structured);

  // Refusal path — task is purely human-only (live meeting, phone call,
  // in-person, signature). The dispatcher honors agent_status_override so
  // the UI can render an 'out_of_scope' badge distinct from 'ready_for_review'.
  // This is requirement #5: refuse-with-explanation persisted as
  // agent_status = 'out_of_scope', explanation in agent_output + agent_structured.
  if (structured.deliverable_type === 'refusal_human_action_required') {
    return {
      ok: true,
      output_md,
      structured,
      cost_estimate_usd: Number(totalCost.toFixed(4)),
      model: OPUS_MODEL,
      agent_status_override: 'out_of_scope'
    };
  }

  return {
    ok: true,
    output_md,
    structured,
    cost_estimate_usd: Number(totalCost.toFixed(4)),
    model: OPUS_MODEL
  };
}

module.exports = { run, OPUS_MODEL };
