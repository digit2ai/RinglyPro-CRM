'use strict';

// Agent — Market & Economic Analysis  (department: Economics, reports to /ringlypro-architect)
// ============================================================================
// WHY THIS EXISTS
// A platform assessment comparing OrbUp against an open reasoning model found one
// gap on our side: OrbUp establishes whether a thing can be BUILT and what will
// stop it, but never what it is WORTH to the business it serves. It flagged a
// budget gap and stopped, without noting that a single engagement under the
// client's own fee model would cover the build cost many times over. Feasibility
// without economics tells a client what something costs and never why to pay.
//
// This closes that gap the way OrbUp closes every gap: as a MANDATORY PASS.
// The value of a fixed pipeline is that coverage does not depend on how the
// request was phrased. An open model finds economics when the prompt happens to
// point there; this pass runs whether it is asked to or not.
//
// THE HONESTY MECHANISM, WHICH IS THE POINT
// The same assessment cautioned that the open model's figures came "from
// plausible ranges rather than primary research" and should not reach an investor
// conversation unvalidated. Economics is the easiest place in this product to
// manufacture confident nonsense, so the guard is in CODE, not in the prompt:
//
//   - every figure carries a `basis`, and the basis vocabulary is closed
//   - anything not stated by the client or derived from something they stated is
//     forced into validation_required[] by classify(), whatever the model claims
//   - a figure whose basis is missing or unrecognized is DROPPED, not shown
//
// The result is the one thing neither system in that assessment produced: an
// economic case that states plainly which of its own numbers may not yet be
// quoted externally.
//
// Contract (called after triage, or via POST /api/v1/agents/economics/:projectId):
//   INPUT  { project, triage }
//   OUTPUT { ok, output_md, structured, verdict, cost_estimate_usd, model }
//
// Persisted to d2_project_economics — a SIDE TABLE, because d2_projects has
// consumed all 1600 postgres attribute slots and cannot take another column.

const { sequelize } = require('../../models');

const SONNET_MODEL = 'claude-sonnet-4-6';
const SONNET_IN = 3 / 1e6, SONNET_OUT = 15 / 1e6;
const AGENT_VERSION = 'market-economics@1.0.0';
const DEFAULT_TIMEOUT_MS = 90 * 1000;   // Cloudflare 100s ceiling

// Closed vocabulary. Anything outside it is treated as unknown provenance.
const BASIS = {
  stated_by_client:     { rank: 0, quotable: true,  label_en: 'stated by you',              label_es: 'declarado por ti' },
  derived_from_stated:  { rank: 1, quotable: true,  label_en: 'derived from your figures',  label_es: 'derivado de tus cifras' },
  industry_assumption:  { rank: 2, quotable: false, label_en: 'industry assumption',        label_es: 'supuesto del sector' },
  unvalidated_estimate: { rank: 3, quotable: false, label_en: 'estimate, not validated',    label_es: 'estimación sin validar' }
};

const VERDICTS = ['JUSTIFIED', 'JUSTIFIED_WITH_CONDITIONS', 'UNPROVEN', 'NOT_JUSTIFIED'];

async function ensureSchema() {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS d2_project_economics (
    project_id INTEGER PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1,
    brief_md TEXT,
    structured JSONB,
    verdict VARCHAR(32),
    model VARCHAR(60),
    version VARCHAR(40),
    cost_usd REAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await sequelize.query('CREATE INDEX IF NOT EXISTS idx_d2_project_economics_tenant ON d2_project_economics(tenant_id)');
}

function num(x) {
  if (x === null || typeof x === 'undefined' || x === '') return null;
  const n = Number(String(x).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : null;
}

/**
 * THE GUARD. Normalizes one figure and decides whether it may be quoted.
 * A model that claims `stated_by_client` for something the client never said is
 * caught here: the claim is checked against the client's own text, and demoted
 * when the number does not appear in it.
 */
function classify(figure, clientText) {
  if (!figure || typeof figure !== 'object') return null;
  const low = num(figure.low), high = num(figure.high), point = num(figure.value);
  if (low === null && high === null && point === null) return null;   // no number, no figure

  let basis = String(figure.basis || '').trim();
  if (!BASIS[basis]) basis = 'unvalidated_estimate';                  // unknown provenance is never quotable

  // A "stated by client" claim has to survive contact with what the client wrote.
  if (basis === 'stated_by_client') {
    const hay = String(clientText || '').replace(/[,\s]/g, '');
    const shown = [low, high, point].filter(v => v !== null);
    const found = shown.some(v => hay.includes(String(Math.round(v))));
    if (!found) basis = 'unvalidated_estimate';
  }

  return {
    low, high, value: point,
    unit: String(figure.unit || 'USD').slice(0, 16),
    period: String(figure.period || '').slice(0, 24) || null,
    basis,
    quotable: BASIS[basis].quotable,
    note: String(figure.note || '').slice(0, 300) || null
  };
}

function strArr(a, cap = 8, len = 400) {
  return Array.isArray(a) ? a.map(x => String(x == null ? '' : x).slice(0, len)).filter(Boolean).slice(0, cap) : [];
}

/**
 * Normalize the whole model response and BUILD validation_required from the
 * figures themselves. The model is not trusted to declare what needs validating;
 * anything non-quotable lands there by construction.
 */
function normalize(raw, clientText) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const figures = {};
  const needsValidation = [];

  const take = (key, label) => {
    const f = classify(r[key], clientText);
    if (!f) return;
    figures[key] = f;
    if (!f.quotable) {
      needsValidation.push({
        figure: label,
        basis: f.basis,
        why: BASIS[f.basis].label_en,
        how_to_validate: String((r[key] && r[key].how_to_validate) || '').slice(0, 300)
          || 'Primary research: name the source, the sample and the date before this figure is used externally.'
      });
    }
  };

  take('value_at_stake',    'What the problem costs today');
  take('addressable_spend', 'Addressable spend');
  take('revenue_year_one',  'First-year revenue');
  take('build_cost',        'Build cost');

  const monetization = Array.isArray(r.monetization) ? r.monetization.slice(0, 4).map(m => ({
    model: String((m && m.model) || '').slice(0, 120),
    price_basis: String((m && m.price_basis) || '').slice(0, 300),
    rationale: String((m && m.rationale) || '').slice(0, 400)
  })).filter(m => m.model) : [];

  const payback = r.payback && typeof r.payback === 'object' ? {
    months_low: num(r.payback.months_low),
    months_high: num(r.payback.months_high),
    rationale: String(r.payback.rationale || '').slice(0, 500) || null
  } : null;

  let verdict = String(r.verdict || '').toUpperCase().replace(/[^A-Z_]/g, '');
  if (!VERDICTS.includes(verdict)) verdict = 'UNPROVEN';

  // A case built entirely on unquotable figures is UNPROVEN, whatever the model
  // concluded. This is the assessment's caution, enforced rather than requested.
  const quotableCount = Object.values(figures).filter(f => f.quotable).length;
  if (quotableCount === 0 && verdict === 'JUSTIFIED') verdict = 'UNPROVEN';

  return {
    figures,
    monetization,
    payback,
    unit_economics: String(r.unit_economics || '').slice(0, 800) || null,
    case_holds_if: strArr(r.case_holds_if, 6),
    case_breaks_if: strArr(r.case_breaks_if, 6),
    commercial_risks: (Array.isArray(r.commercial_risks) ? r.commercial_risks.slice(0, 6) : []).map(x => ({
      risk: String((x && x.risk) || '').slice(0, 200),
      why: String((x && x.why) || '').slice(0, 400),
      horizon: String((x && x.horizon) || '').slice(0, 60)
    })).filter(x => x.risk),
    validation_required: needsValidation,
    verdict,
    verdict_rationale: String(r.verdict_rationale || '').slice(0, 600) || null
  };
}

function fmt(f, es) {
  if (!f) return '';
  const money = n => (f.unit === 'USD' ? '$' : '') + Number(n).toLocaleString(es ? 'es-ES' : 'en-US');
  const span = (f.low !== null && f.high !== null && f.low !== f.high)
    ? money(f.low) + '–' + money(f.high)
    : money(f.value !== null ? f.value : (f.low !== null ? f.low : f.high));
  const per = f.period ? ' / ' + f.period : '';
  const tag = (es ? BASIS[f.basis].label_es : BASIS[f.basis].label_en);
  return span + per + ' (' + tag + ')';
}

function renderMarkdown(s, es) {
  const L = [];
  L.push(es ? '## Análisis de mercado y economía' : '## Market and economic analysis');
  L.push('');
  if (s.verdict_rationale) { L.push('*' + s.verdict + '* — ' + s.verdict_rationale); L.push(''); }
  const rows = [
    ['value_at_stake',    es ? 'Lo que el problema cuesta hoy' : 'What the problem costs today'],
    ['addressable_spend', es ? 'Gasto direccionable' : 'Addressable spend'],
    ['revenue_year_one',  es ? 'Ingreso primer año' : 'First-year revenue'],
    ['build_cost',        es ? 'Costo de construcción' : 'Build cost']
  ].filter(([k]) => s.figures[k]);
  if (rows.length) {
    rows.forEach(([k, label]) => L.push('- **' + label + ':** ' + fmt(s.figures[k], es)));
    L.push('');
  }
  if (s.payback && (s.payback.months_low !== null || s.payback.months_high !== null)) {
    L.push('- **' + (es ? 'Recuperación' : 'Payback') + ':** ' +
      [s.payback.months_low, s.payback.months_high].filter(v => v !== null).join('–') + ' ' + (es ? 'meses' : 'months'));
    L.push('');
  }
  if (s.monetization.length) {
    L.push(es ? '**Cómo se monetiza**' : '**How it monetizes**');
    s.monetization.forEach(m => L.push('- **' + m.model + '** — ' + m.price_basis));
    L.push('');
  }
  if (s.case_breaks_if.length) {
    L.push(es ? '**El caso se cae si**' : '**The case breaks if**');
    s.case_breaks_if.forEach(x => L.push('- ' + x));
    L.push('');
  }
  if (s.commercial_risks.length) {
    L.push(es ? '**Riesgos comerciales**' : '**Commercial risks**');
    s.commercial_risks.forEach(x => L.push('- **' + x.risk + '** — ' + x.why + (x.horizon ? ' (' + x.horizon + ')' : '')));
    L.push('');
  }
  if (s.validation_required.length) {
    L.push(es ? '**No uses estas cifras afuera sin validarlas**' : '**Do not use these figures externally without validating them**');
    s.validation_required.forEach(v => L.push('- **' + v.figure + '** (' + v.why + ') — ' + v.how_to_validate));
    L.push('');
  }
  return L.join('\n');
}

function heuristic(project, es) {
  // No key: say so, produce no numbers at all. An economics pass that invents
  // figures when it cannot think is worse than one that declines.
  return {
    figures: {}, monetization: [], payback: null, unit_economics: null,
    case_holds_if: [], case_breaks_if: [], commercial_risks: [],
    validation_required: [{
      figure: es ? 'Todo el caso económico' : 'The entire economic case',
      basis: 'unvalidated_estimate',
      why: es ? 'el analizador no estaba disponible' : 'the analyzer was unavailable',
      how_to_validate: es ? 'Vuelve a ejecutar el análisis económico.' : 'Re-run the economic analysis.'
    }],
    verdict: 'UNPROVEN',
    verdict_rationale: es
      ? 'No se pudo ejecutar el análisis económico, así que no se afirma ningún número.'
      : 'The economic analysis could not run, so no figure is asserted.',
    is_simulated: true
  };
}

const PROMPT = (project, triage, clientText) => `You are the Market and Economic Analyst on an AI build team. A feasibility pass has already decided whether this can be BUILT. Your job is the question it does not answer: what is this worth to the business it serves, and does that justify the investment.

THE PROJECT (the client's own words)
${clientText}

FEASIBILITY CONTEXT
Fit ${triage && triage.fit_score}/10. Wedge: ${(triage && triage.wedge_recommendation) || 'n/a'}
Monetization ideas already noted: ${((triage && triage.monetization_options) || []).join('; ') || 'none'}

RULES THAT DECIDE WHETHER YOUR OUTPUT IS USABLE
1. Every figure carries a "basis", one of exactly: stated_by_client, derived_from_stated, industry_assumption, unvalidated_estimate.
2. Use stated_by_client ONLY when the number appears in the client's own words above. It is checked. A false claim is demoted automatically and costs you credibility.
3. Prefer a narrow honest range over a confident point estimate. If you genuinely cannot size something, omit the figure entirely rather than guessing.
4. Give the commercial risks, not just the technical ones: sales-cycle length, buyer inertia, whether the advantage erodes, dependency on a single counterparty.
5. State what makes the case FALSE, not only what makes it true.

Produce JSON only:
{
  "value_at_stake": {"low":n,"high":n,"unit":"USD","period":"year","basis":"...","note":"...","how_to_validate":"..."},
  "addressable_spend": {"low":n,"high":n,"unit":"USD","period":"year","basis":"...","note":"...","how_to_validate":"..."},
  "revenue_year_one": {"low":n,"high":n,"unit":"USD","period":"year","basis":"...","note":"...","how_to_validate":"..."},
  "build_cost": {"low":n,"high":n,"unit":"USD","basis":"...","note":"...","how_to_validate":"..."},
  "monetization": [{"model":"...","price_basis":"...","rationale":"..."}],
  "unit_economics": "cost to serve one customer and the resulting margin, in 2-3 sentences",
  "payback": {"months_low":n,"months_high":n,"rationale":"..."},
  "case_holds_if": ["..."],
  "case_breaks_if": ["..."],
  "commercial_risks": [{"risk":"...","why":"...","horizon":"..."}],
  "verdict": "JUSTIFIED | JUSTIFIED_WITH_CONDITIONS | UNPROVEN | NOT_JUSTIFIED",
  "verdict_rationale": "2-3 sentences"
}`;

async function run({ project, triage, language, persist = true, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const p = project && project.toJSON ? project.toJSON() : (project || {});
  const es = String(language || p.language || 'en').toLowerCase().startsWith('es');
  const t = triage || p.triage_structured || null;
  const clientText = [p.description, p.problem, p.current_process, p.success_metrics, p.budget_range]
    .filter(Boolean).join('\n').slice(0, 6000);

  let structured, cost = 0, model = SONNET_MODEL;

  if (!process.env.ANTHROPIC_API_KEY) {
    structured = heuristic(p, es);
    model = 'heuristic';
  } else {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: timeoutMs });
      const resp = await client.messages.create({
        model: SONNET_MODEL, max_tokens: 4000,
        messages: [{ role: 'user', content: PROMPT(p, t, clientText) }]
      });
      const text = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      const m = text.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : null;
      structured = normalize(parsed, clientText);
      const u = resp.usage || {};
      cost = (u.input_tokens || 0) * SONNET_IN + (u.output_tokens || 0) * SONNET_OUT;
    } catch (e) {
      console.error('[marketEconomics] failed:', e.message);
      structured = heuristic(p, es);
      model = 'heuristic';
    }
  }

  const output_md = renderMarkdown(structured, es);

  if (persist && p.id) {
    try {
      await ensureSchema();
      await sequelize.query(
        `INSERT INTO d2_project_economics (project_id, tenant_id, brief_md, structured, verdict, model, version, cost_usd, updated_at)
         VALUES (:pid, :tid, :md, CAST(:st AS JSONB), :v, :m, :ver, :c, NOW())
         ON CONFLICT (project_id) DO UPDATE SET brief_md = EXCLUDED.brief_md, structured = EXCLUDED.structured,
           verdict = EXCLUDED.verdict, model = EXCLUDED.model, version = EXCLUDED.version,
           cost_usd = EXCLUDED.cost_usd, updated_at = NOW()`,
        { replacements: { pid: p.id, tid: p.workspace_id || 1, md: output_md,
            st: JSON.stringify(structured), v: structured.verdict, m: model, ver: AGENT_VERSION, c: cost } });
    } catch (e) { console.error('[marketEconomics] persist failed:', e.message); }
  }

  return { ok: true, output_md, structured, verdict: structured.verdict, cost_estimate_usd: cost, model };
}

async function forProject(projectId) {
  try {
    await ensureSchema();
    const [rows] = await sequelize.query('SELECT structured FROM d2_project_economics WHERE project_id = :p',
      { replacements: { p: projectId } });
    if (!rows || !rows[0]) return null;
    const s = rows[0].structured;
    return typeof s === 'string' ? JSON.parse(s) : s;
  } catch (_) { return null; }
}

module.exports = { run, forProject, ensureSchema, normalize, classify, renderMarkdown,
                   BASIS, VERDICTS, SONNET_MODEL, AGENT_VERSION };
