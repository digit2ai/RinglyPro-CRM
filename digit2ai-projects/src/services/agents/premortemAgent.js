'use strict';

// Agent — Claude Premortem  (department: Premortem, reports to /ringlypro-architect)
// ============================================================================
// Adversarial risk analysis for every inbound project. Where the Inbox Triage
// agent evaluates whether we CAN do a project (optimistic by design), the
// Premortem agent assumes the project already FAILED and works backward to
// narrate why — Gary Klein's prospective-hindsight technique (1989).
//
// Contract (called by inboxTriageAgent after feasibility completes, or directly
// via POST /api/v1/agents/premortem/:projectId):
//
//   INPUT  { project, triage }            // triage = triage_structured JSON
//   OUTPUT { ok, output_md, structured, verdict, cost_estimate_usd, model }
//
//   structured = {
//     failure_modes[]:  { title, narrative, category, base_rate_estimate,
//                         likelihood_rank, danger_rank, prevention_cost_rank }
//     top_mitigations[]:{ failure_mode, mitigation, owner_agent, trigger_condition }
//     verdict:          PROCEED | PROCEED_WITH_MITIGATIONS | RESHAPE | DECLINE
//     verdict_rationale: string (<= 3 sentences)
//     missing_context[]: string[]  // ONLY when analysis cannot be run
//   }
//
// Persists premortem_brief / premortem_structured / premortem_verdict /
// premortem_at / premortem_model / premortem_version on d2_projects so verdicts
// can be audited against real outcomes later (longitudinal accuracy tracking).

const { sequelize, Project } = require('../../models');

const SONNET_MODEL = 'claude-sonnet-4-6';
const SONNET_IN = 3 / 1e6, SONNET_OUT = 15 / 1e6;
const AGENT_VERSION = 'claude-premortem@1.0.0';
const DEFAULT_TIMEOUT_MS = 90 * 1000; // Cloudflare 100s ceiling — stay under it

const VALID_VERDICTS = new Set(['PROCEED', 'PROCEED_WITH_MITIGATIONS', 'RESHAPE', 'DECLINE']);
const VALID_CATEGORIES = new Set(['technical', 'market', 'people', 'financial', 'legal-compliance', 'operational']);

// ---- JSON salvage (shared shape with inboxTriageAgent) ---------------------
function repairTruncatedJson(src) {
  let s = src;
  const lastClean = Math.max(s.lastIndexOf('"'), s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastClean > 0) s = s.slice(0, lastClean + 1);
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') stack.pop();
  }
  if (inStr) s += '"';
  s = s.replace(/,\s*$/, '');
  while (stack.length) s += stack.pop() === '{' ? '}' : ']';
  try { return JSON.parse(s); } catch (_) { return null; }
}

function safeParseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  const start = cleaned.indexOf('{');
  if (start >= 0) return repairTruncatedJson(cleaned.slice(start));
  return null;
}

// Detect Spanish so we can mirror the requester's language (per input-language rule).
function looksSpanish(project, triage) {
  const hay = [
    project?.description, project?.target_users, project?.current_process,
    project?.name, triage?.fit_reasoning, triage?.wedge_recommendation
  ].filter(Boolean).join(' ').toLowerCase();
  if (!hay) return false;
  const country = String(project?.country || '').toLowerCase();
  if (/colombia|m[eé]xico|mexico|venezuela|espa|argentina|per[uú]|chile|guatemala|ecuador/.test(country)) return true;
  const es = (hay.match(/\b(que|para|con|los|las|una|por|como|est[aá]|necesito|cliente|usuario|empresa|proyecto|ventas|automatizar|pagos)\b/g) || []).length;
  return es >= 4;
}

// ---- prompt ----------------------------------------------------------------
function buildPrompt({ project, triage, failureHorizon, spanish }) {
  const t = triage || {};
  const constraints = {
    budget: project?.budget_range || '(unspecified)',
    timeline: project?.timeline || project?.target_delivery_weeks ? `${project?.target_delivery_weeks || ''} ${project?.timeline || ''}`.trim() : '(unspecified)',
    team: project?.team_members ? `${(project.team_members || []).length} member(s)` : '(unspecified)',
    tech_stack: project?.existing_stack || '(unspecified)'
  };
  const triageBlock = t && Object.keys(t).length
    ? JSON.stringify({
        fit_score: t.fit_score,
        fit_reasoning: t.fit_reasoning,
        wedge_recommendation: t.wedge_recommendation,
        go_no_go_recommendation: t.go_no_go_recommendation,
        regulatory_flags: t.regulatory_flags,
        monetization_options: t.monetization_options,
        conditions_if_any: t.conditions_if_any
      }, null, 2)
    : '(no triage feasibility on file — reason from the raw request alone)';

  const langLine = spanish
    ? 'RESPONExD IN SPANISH. Use proper Spanish orthography (tildes, ñ). No emojis.'.replace('RESPONExD', 'RESPOND')
    : 'Respond in English. No emojis.';

  return `You are Claude Premortem, the adversarial risk analyst of the Digit2AI Neural Intelligence Network. You report to /ringlypro-architect. Your job is the AUTOPSY, not the encouragement.

ANTI-SYCOPHANCY DIRECTIVE (non-negotiable):
- You do NOT evaluate whether this plan will work. The Triage agent already did that, optimistically.
- You assume it is ${failureHorizon} from now and THIS PROJECT FAILED SPECTACULARLY. Work backward and narrate exactly why.
- No softening language. No "but they learned a lot." No "with the right execution this could still…". No hedging that blunts the warning. Name the failure plainly.
- Every failure mode must be SPECIFIC TO THIS PROJECT — its domain, client, constraints, and data. Reject generic pattern-matching risks ("scope creep", "poor communication") unless you tie them to a concrete mechanism in THIS project.

METHODOLOGY (Gary Klein, prospective hindsight, 1989):
1. Generate 5-10 concrete, project-specific failure modes.
2. For EACH failure mode assign three integer ranks (1 = highest) across the whole set:
   - likelihood_rank  (1 = most likely to happen)
   - danger_rank      (1 = most damaging if it happens)
   - prevention_cost_rank (1 = cheapest to prevent)
   Ranks are distinct positions within their dimension (no ties across the set).
3. Estimate a base rate where possible: "projects of this type fail this way roughly X% of the time." If you truly cannot, say "unknown" — never invent a number.
4. For the TOP 3 failure modes (weigh likelihood x danger, discounted by how cheap prevention is), produce a specific mitigation with an OWNER (a named NIN agent or a human) and a TRIGGER CONDITION (the observable early-warning signal that fires the mitigation).
5. End with ONE verdict: PROCEED | PROCEED_WITH_MITIGATIONS | RESHAPE | DECLINE.

VAGUE-REQUEST GUARD:
- If the request is too thin to premortem honestly (no clear audience, goal, constraints, or definition of failure), DO NOT invent an analysis. Return an empty failure_modes array and populate missing_context[] with the specific facts you need. Set verdict to RESHAPE and say why in verdict_rationale.

OWNER pool (pick real owners): /ringlypro-architect, Inbox Triage, Senior Business Analyst, Research Brief, Senior Full Stack Developer, Senior DevOps/SRE, Senior Security Engineer, Senior Compliance Officer, Senior Regulatory Researcher, Senior Privacy Officer, Senior AI Safety / Red-Team Engineer, Senior Data Governance / MDM Specialist, Senior FinOps / Cloud-Cost Analyst, Senior Pricing Analyst, Senior Customer Success Manager, Senior Product Manager, matching Vertical SME (name it), or a human (Manny / the client stakeholder).

CATEGORIES (use exactly one per failure mode): technical | market | people | financial | legal-compliance | operational

${langLine}

=== PROJECT ===
Name: ${project?.name || '(no name)'}
Requestor: ${project?.submitter_name || '(unknown)'} (${project?.submitter_email || 'no email'}, ${project?.country || 'no country'})
Original request: ${project?.description || '(no description)'}
Target users: ${project?.target_users || '(unknown)'}
Current process: ${project?.current_process || '(unknown)'}
Sensitive data: ${project?.sensitive_data_detail || '(none stated)'}

=== CONSTRAINTS ===
Budget: ${constraints.budget}
Timeline: ${constraints.timeline}
Team: ${constraints.team}
Tech stack: ${constraints.tech_stack}
Failure horizon: ${failureHorizon}

=== TRIAGE FEASIBILITY (the optimistic view you are stress-testing) ===
${triageBlock}

Return ONLY valid JSON in this exact shape:
{
  "failure_modes": [
    {
      "title": "short label",
      "narrative": "It is ${failureHorizon} from now. This failed because... (2-4 sentences, concrete, past tense)",
      "category": "technical|market|people|financial|legal-compliance|operational",
      "base_rate_estimate": "roughly X% / unknown",
      "likelihood_rank": 1,
      "danger_rank": 1,
      "prevention_cost_rank": 1
    }
  ],
  "top_mitigations": [
    { "failure_mode": "matches a title above", "mitigation": "specific action", "owner_agent": "one of the owner pool", "trigger_condition": "observable early signal" }
  ],
  "verdict": "PROCEED | PROCEED_WITH_MITIGATIONS | RESHAPE | DECLINE",
  "verdict_rationale": "<= 3 sentences",
  "missing_context": []
}`;
}

// ---- normalization ---------------------------------------------------------
function normalize(parsed) {
  const out = {
    failure_modes: [],
    top_mitigations: [],
    verdict: 'RESHAPE',
    verdict_rationale: '',
    missing_context: []
  };
  if (!parsed || typeof parsed !== 'object') return out;

  if (Array.isArray(parsed.missing_context)) {
    out.missing_context = parsed.missing_context.map(x => String(x)).filter(Boolean).slice(0, 12);
  }
  if (Array.isArray(parsed.failure_modes)) {
    out.failure_modes = parsed.failure_modes.slice(0, 10).map((f, i) => ({
      title: String(f?.title || `Failure mode ${i + 1}`).slice(0, 200),
      narrative: String(f?.narrative || '').slice(0, 2000),
      category: VALID_CATEGORIES.has(String(f?.category)) ? String(f.category) : 'operational',
      base_rate_estimate: String(f?.base_rate_estimate || 'unknown').slice(0, 60),
      likelihood_rank: Number.isFinite(+f?.likelihood_rank) ? +f.likelihood_rank : (i + 1),
      danger_rank: Number.isFinite(+f?.danger_rank) ? +f.danger_rank : (i + 1),
      prevention_cost_rank: Number.isFinite(+f?.prevention_cost_rank) ? +f.prevention_cost_rank : (i + 1)
    }));
  }
  if (Array.isArray(parsed.top_mitigations)) {
    out.top_mitigations = parsed.top_mitigations.slice(0, 5).map(m => ({
      failure_mode: String(m?.failure_mode || '').slice(0, 200),
      mitigation: String(m?.mitigation || '').slice(0, 1000),
      owner_agent: String(m?.owner_agent || '/ringlypro-architect').slice(0, 120),
      trigger_condition: String(m?.trigger_condition || '').slice(0, 500)
    }));
  }
  const v = String(parsed.verdict || '').toUpperCase().replace(/\s+/g, '_');
  out.verdict = VALID_VERDICTS.has(v) ? v : (out.missing_context.length ? 'RESHAPE' : 'PROCEED_WITH_MITIGATIONS');
  out.verdict_rationale = String(parsed.verdict_rationale || '').slice(0, 1200);
  return out;
}

// ---- markdown (the mandatory "Premortem Analysis" section) -----------------
function renderMarkdown(structured, { spanish, version }) {
  const L = spanish
    ? {
        h: '## Análisis Premortem', by: 'Claude Premortem', ver: 'versión',
        vague: 'Contexto insuficiente para un premortem honesto. Se requiere:',
        modesH: 'Modos de falla', likely: 'más probable', danger: 'más peligroso', cheap: 'más barato de prevenir',
        base: 'Tasa base', mitsH: 'Mitigaciones prioritarias', owner: 'Responsable', trigger: 'Disparador',
        verdictH: 'Veredicto'
      }
    : {
        h: '## Premortem Analysis', by: 'Claude Premortem', ver: 'version',
        vague: 'Insufficient context for an honest premortem. Missing:',
        modesH: 'Failure Modes', likely: 'most likely', danger: 'most dangerous', cheap: 'cheapest to prevent',
        base: 'Base rate', mitsH: 'Top Mitigations', owner: 'Owner', trigger: 'Trigger',
        verdictH: 'Verdict'
      };
  const lines = [];
  lines.push(L.h);
  lines.push(`*${L.by} · ${L.ver} ${version} · ${AGENT_VERSION}*`);
  lines.push('');

  if (structured.missing_context && structured.missing_context.length) {
    lines.push(`**${L.vague}**`);
    structured.missing_context.forEach(c => lines.push(`- ${c}`));
    lines.push('');
    lines.push(`**${L.verdictH}: ${structured.verdict}**`);
    if (structured.verdict_rationale) lines.push('', structured.verdict_rationale);
    return lines.join('\n');
  }

  // Rank lookups for annotation
  const byLikely = [...structured.failure_modes].sort((a, b) => a.likelihood_rank - b.likelihood_rank)[0];
  const byDanger = [...structured.failure_modes].sort((a, b) => a.danger_rank - b.danger_rank)[0];
  const byCheap = [...structured.failure_modes].sort((a, b) => a.prevention_cost_rank - b.prevention_cost_rank)[0];

  lines.push(`### ${L.modesH}`);
  structured.failure_modes.forEach((f) => {
    const tags = [];
    if (f === byLikely) tags.push(L.likely);
    if (f === byDanger) tags.push(L.danger);
    if (f === byCheap) tags.push(L.cheap);
    const tagStr = tags.length ? ` _(${tags.join(' · ')})_` : '';
    lines.push(`- **${f.title}** [${f.category}]${tagStr}`);
    lines.push(`  ${f.narrative}`);
    lines.push(`  ${L.base}: ${f.base_rate_estimate} · L${f.likelihood_rank}/D${f.danger_rank}/P${f.prevention_cost_rank}`);
  });
  lines.push('');

  if (structured.top_mitigations.length) {
    lines.push(`### ${L.mitsH}`);
    structured.top_mitigations.forEach((m, i) => {
      lines.push(`${i + 1}. **${m.failure_mode}** — ${m.mitigation}`);
      lines.push(`   ${L.owner}: ${m.owner_agent} · ${L.trigger}: ${m.trigger_condition}`);
    });
    lines.push('');
  }

  lines.push(`**${L.verdictH}: ${structured.verdict}**`);
  if (structured.verdict_rationale) lines.push('', structured.verdict_rationale);
  return lines.join('\n');
}

// Banner appended to the feasibility when the premortem could not run — the
// feasibility must NEVER ship silently without a premortem.
function pendingBanner(reason, spanish) {
  return spanish
    ? `## Análisis Premortem\n\n> **PREMORTEM PENDIENTE** — el análisis de riesgo adversarial no pudo completarse (${reason}). Esta evaluación de factibilidad está INCOMPLETA hasta que Claude Premortem se ejecute de nuevo.`
    : `## Premortem Analysis\n\n> **PREMORTEM PENDING** — the adversarial risk analysis could not complete (${reason}). This feasibility assessment is INCOMPLETE until Claude Premortem re-runs.`;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('premortem_timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---- main ------------------------------------------------------------------
// opts: { failureHorizon='6 months', persist=true, language='auto', timeoutMs }
async function run({ project, triage, failure_horizon, language, persist = true, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const failureHorizon = failure_horizon || '6 months';
  const spanish = language === 'es' ? true : (language === 'en' ? false : looksSpanish(project, triage));
  const version = ((project && project.premortem_version) || 0) + 1;

  const fail = (error) => ({
    ok: false, error, output_md: pendingBanner(error, spanish),
    structured: null, verdict: 'PENDING', cost_estimate_usd: 0, model: SONNET_MODEL, version
  });

  if (!project || !project.id) return fail('missing_project');
  if (!process.env.ANTHROPIC_API_KEY) return fail('no_api_key');

  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) { return fail('sdk_missing'); }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = buildPrompt({ project, triage, failureHorizon, spanish });

  let text = '', cost = 0;
  try {
    const resp = await withTimeout(client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    }), timeoutMs);
    text = resp?.content?.[0]?.text || '';
    cost = (resp?.usage?.input_tokens || 0) * SONNET_IN + (resp?.usage?.output_tokens || 0) * SONNET_OUT;
  } catch (err) {
    console.error('[premortemAgent] Sonnet call failed:', err.message);
    const r = fail(err.message === 'premortem_timeout' ? 'timeout' : err.message);
    r.cost_estimate_usd = Number(cost.toFixed(4));
    if (persist) await persistPending(project.id, r, version).catch(() => {});
    return r;
  }

  const parsed = safeParseJson(text);
  if (!parsed) {
    console.error('[premortemAgent] parse_failed head=%j', text.slice(0, 300));
    const r = fail('parse_failed');
    r.cost_estimate_usd = Number(cost.toFixed(4));
    if (persist) await persistPending(project.id, r, version).catch(() => {});
    return r;
  }

  const structured = normalize(parsed);
  const output_md = renderMarkdown(structured, { spanish, version });
  const result = {
    ok: true, output_md, structured, verdict: structured.verdict,
    cost_estimate_usd: Number(cost.toFixed(4)), model: SONNET_MODEL, version, spanish
  };

  if (persist) {
    try {
      await Project.update({
        premortem_brief: output_md,
        premortem_structured: structured,
        premortem_verdict: structured.verdict,
        premortem_at: new Date(),
        premortem_model: `${SONNET_MODEL} (${AGENT_VERSION})`,
        premortem_version: version,
        premortem_flagged: (structured.verdict === 'RESHAPE' || structured.verdict === 'DECLINE')
      }, { where: { id: project.id, workspace_id: 1 } });
    } catch (dbErr) {
      console.error('[premortemAgent] persist failed:', dbErr.message);
    }
  }
  return result;
}

async function persistPending(projectId, r, version) {
  await Project.update({
    premortem_brief: r.output_md,
    premortem_verdict: 'PENDING',
    premortem_at: new Date(),
    premortem_model: `${SONNET_MODEL} (${AGENT_VERSION})`,
    premortem_version: version
  }, { where: { id: projectId, workspace_id: 1 } });
}

// Convenience: load project (+ its triage_structured) and run.
async function runById(projectId, opts = {}) {
  const project = await Project.findOne({ where: { id: projectId, workspace_id: 1 } });
  if (!project) return { ok: false, error: 'project_not_found', verdict: 'PENDING', model: SONNET_MODEL };
  return run({ project, triage: project.triage_structured || null, ...opts });
}

module.exports = { run, runById, renderMarkdown, pendingBanner, SONNET_MODEL, AGENT_VERSION };
