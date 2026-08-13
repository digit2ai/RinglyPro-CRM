'use strict';

/**
 * Fit scoring. Ported in spirit from jobup's matcher.js.
 *
 * INVARIANTS
 *   * The stable prefix (profile + rules) is built once per batch so it caches;
 *     only the posting varies per call.
 *   * A hard cost ceiling per run. It stops mid-batch rather than overspending,
 *     and the run reports that it stopped.
 *   * With no ANTHROPIC_API_KEY the score is the deterministic pre-filter score,
 *     marked scored_by:'heuristic' + is_simulated:true and shown as such in the
 *     UI. Never a silent fake.
 *   * The model scores fit. It does not decide status, does not touch the skill
 *     store, and cannot promote anything to claimable.
 */

const prefilter = require('./prefilter');

const MODEL = process.env.CITIJOBS_MODEL || 'claude-haiku-4-5-20251001';
const IN_PER_M = Number(process.env.CITIJOBS_LLM_IN_PER_M || 1.00);
const OUT_PER_M = Number(process.env.CITIJOBS_LLM_OUT_PER_M || 5.00);

let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (_client) return _client;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (e) {
    _client = null;
  }
  return _client;
}

const SYSTEM = [
  'You score how well one candidate fits one job requisition at Citigroup.',
  'You are given the candidate profile first, then a single posting.',
  'Return ONLY compact JSON: {"score": <0-100 integer>, "rationale": "<one sentence, max 200 chars>"}.',
  'Score on evidence in the profile, not on enthusiasm. A candidate missing a stated hard requirement',
  'cannot score above 65 no matter how strong the rest is. Do not invent candidate experience that is',
  'not in the profile. Do not comment on compensation. No prose outside the JSON.'
].join(' ');

function costCents(usage) {
  if (!usage) return 0;
  const i = Number(usage.input_tokens || 0);
  const o = Number(usage.output_tokens || 0);
  return ((i / 1e6) * IN_PER_M + (o / 1e6) * OUT_PER_M) * 100;
}

/** The cacheable half: everything about the candidate, none of the posting. */
function cachedPrefix(profile, claimableTerms) {
  const lines = [
    `CANDIDATE: ${profile.display_name}`,
    profile.headline ? `HEADLINE: ${profile.headline}` : null,
    profile.internal ? 'CURRENTLY EMPLOYED AT CITI (internal mobility candidate).' : 'EXTERNAL CANDIDATE.',
    `TARGET TITLES: ${(profile.target_titles || []).join(' | ') || 'not stated'}`,
    `TARGET LOCATIONS: ${(profile.target_locations || []).join(' | ') || 'not stated'}`,
    `CONFIRMED SKILLS: ${(claimableTerms || []).join(', ') || 'none recorded'}`,
    '',
    'RESUME:',
    String(profile.resume_text || '').slice(0, 12000)
  ].filter(Boolean);
  return lines.join('\n');
}

function postingBlock(req) {
  return [
    `REQ ID: ${req.req_id}`,
    `TITLE: ${req.title || ''}`,
    `LOCATION: ${req.location || ''}${req.remote_type ? ' (' + req.remote_type + ')' : ''}`,
    req.job_family ? `JOB FAMILY: ${req.job_family}` : null,
    '',
    'POSTING:',
    String(req.description_text || '').slice(0, 9000)
  ].filter(Boolean).join('\n');
}

/** Score one posting with the model. Throws on transport failure. */
async function scoreOne(req, profile, prefix) {
  const c = client();
  if (!c) throw new Error('no api key');
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: SYSTEM,
    messages: [{ role: 'user', content: `${prefix}\n\n---\n\n${postingBlock(req)}` }]
  });
  const text = (resp.content || []).map((b) => b.text || '').join('').trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('unparseable model output');
  const parsed = JSON.parse(m[0]);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
  if (!Number.isFinite(score)) throw new Error('no score in model output');
  return {
    score,
    rationale: String(parsed.rationale || '').slice(0, 400),
    scored_by: 'model',
    is_simulated: false,
    model: MODEL,
    cost_cents: costCents(resp.usage)
  };
}

/**
 * Score a batch inside a hard ceiling. Every item gets a result; items past the
 * cap (or after a model failure) fall back to the deterministic score and say
 * so, so a run is never silently half-scored.
 */
async function scoreBatch(reqs, profile, skillTerms, claimableTerms, { capCents = 50, onSpend } = {}) {
  const prefix = cachedPrefix(profile, claimableTerms);
  const out = [];
  let spent = 0;
  let capped = false;

  for (const req of reqs) {
    const pre = prefilter.score(req, profile, skillTerms);
    const heuristic = {
      score: pre.score,
      rationale: pre.reasons.slice(0, 3).join('; ') || 'deterministic match on title and profile terms',
      scored_by: 'heuristic',
      is_simulated: true,
      model: null,
      cost_cents: 0,
      prefilter: pre
    };

    if (!client() || capped || spent >= capCents) {
      out.push(Object.assign({ req_id: req.req_id }, heuristic));
      continue;
    }
    try {
      const r = await scoreOne(req, profile, prefix);
      spent += r.cost_cents;
      if (typeof onSpend === 'function') onSpend(r.cost_cents);
      if (spent >= capCents) capped = true;
      out.push(Object.assign({ req_id: req.req_id, prefilter: pre }, r));
    } catch (e) {
      out.push(Object.assign({ req_id: req.req_id, error: e.message }, heuristic));
    }
  }
  return { results: out, spent_cents: spent, capped };
}

module.exports = { scoreOne, scoreBatch, cachedPrefix, costCents, MODEL, hasModel: () => !!client() };
