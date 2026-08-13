'use strict';

/**
 * Résumé tailoring — the half of the loop that answers the job.
 *
 * THE RULE THE ENGINE MAY NOT BREAK
 * Tailoring SELECTS, ORDERS and EMPHASISES evidence that already exists. It
 * never authors an accomplishment, a metric, an employer, a date or a tool.
 *
 * That is enforced structurally, not requested politely: the model is given a
 * pool of bullets that came out of the base résumé and may only return their
 * IDS. It has no channel through which to emit a new claim, because the bullets
 * that reach the PDF are copied verbatim from the profile. The one piece of
 * free text it may write — the summary — is verified afterwards against the
 * evidence corpus, and discarded in favour of the base summary if it introduces
 * a domain term, an acronym or a NUMBER that the corpus does not contain.
 * Numbers are the classic fabrication and the cheapest thing to check.
 *
 * Re-wording individual bullets is deliberately NOT offered. Verbatim selection
 * is exactly what makes every line on the finished PDF defensible in an
 * interview, which is the whole point of the document.
 */

const skills = require('./skills');

const MODEL = process.env.CITIJOBS_TAILOR_MODEL || process.env.CITIJOBS_MODEL || 'claude-haiku-4-5-20251001';
const MAX_BULLETS_PER_ROLE = Number(process.env.CITIJOBS_MAX_BULLETS || 7);

let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (_client) return _client;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (e) { _client = null; }
  return _client;
}

// ── Evidence corpus ──────────────────────────────────────────────────────────

/** Everything the owner has actually said about themselves, flattened. */
function corpusOf(profile, claimableTerms) {
  const rj = profile.resume_json || {};
  const parts = [
    profile.headline || '',
    profile.resume_text || '',
    rj.summary || '',
    ...(rj.competencies || []).map((c) => `${c.label} ${c.text}`),
    ...(rj.roles || []).flatMap((r) => [r.title, r.meta, r.note, ...(r.bullets || []).map((b) => b.text || b)]),
    ...(rj.skills || []).map((s) => `${s.label} ${s.text}`),
    ...(claimableTerms || [])
  ];
  return skills.normalize(parts.filter(Boolean).join(' \n '));
}

/**
 * Verify a free-text sentence against the corpus. Returns the list of
 * violations; empty means it may ship.
 */
function verifyText(text, corpus) {
  const violations = [];
  const t = String(text || '');
  const n = skills.normalize(t);

  // 1) Domain vocabulary it introduced but the owner never claimed.
  for (const term of skills.LEXICON) {
    if (n.includes(term) && !corpus.includes(term)) {
      violations.push({ kind: 'unverified_term', value: term });
    }
  }
  // 2) Acronyms. CEAM, OFSAA, RTM — trivially fabricated, instantly checkable.
  const acronyms = t.match(/\b[A-Z]{2,7}\b/g) || [];
  for (const a of new Set(acronyms)) {
    if (['AI', 'US', 'IT', 'EN', 'ES'].includes(a)) continue;
    if (!corpus.includes(skills.normalize(a))) {
      violations.push({ kind: 'unverified_acronym', value: a });
    }
  }
  // 3) Numbers. "24 years", "$1T", "six platforms", "50-75%". A tailored resume
  //    that invents a figure is the single worst failure this app could ship.
  const numbers = t.match(/\$?\d[\d,\.]*\s*(?:%|[A-Za-z+]{0,2})?/g) || [];
  for (const raw of new Set(numbers)) {
    const digits = raw.match(/\d[\d,\.]*/);
    if (!digits) continue;
    const d = digits[0].replace(/[.,]$/, '');
    if (d.length < 1) continue;
    if (!corpus.includes(skills.normalize(d))) {
      violations.push({ kind: 'unverified_number', value: raw.trim() });
    }
  }
  return violations;
}

// ── Bullet pool ──────────────────────────────────────────────────────────────

function bulletPool(profile) {
  const roles = (profile.resume_json && profile.resume_json.roles) || [];
  return roles.map((r, ri) => ({
    role_id: r.id || `r${ri}`,
    title: r.title,
    meta: r.meta || null,
    note: r.note || null,
    bullets: (r.bullets || []).map((b, bi) => ({
      id: (typeof b === 'object' && b.id) ? b.id : `${r.id || 'r' + ri}-${bi}`,
      text: typeof b === 'object' ? b.text : String(b)
    }))
  }));
}

/** Deterministic relevance of one bullet to this requisition. */
function bulletScore(text, jdTerms) {
  const n = skills.normalize(text);
  let s = 0;
  for (const t of jdTerms) {
    if (t.term.length < 4) continue;
    if (n.includes(t.term)) s += t.weight;
  }
  return s;
}

function deterministicSelection(pool, jdTerms) {
  return pool.map((role) => {
    const ranked = role.bullets
      .map((b) => ({ b, s: bulletScore(b.text, jdTerms) }))
      .sort((x, y) => y.s - x.s);
    const keep = ranked.slice(0, MAX_BULLETS_PER_ROLE);
    // Keep original order among the survivors: a résumé that jumps around
    // chronologically inside one role reads as machine output.
    const keepIds = new Set(keep.map((k) => k.b.id));
    return {
      role_id: role.role_id,
      bullet_ids: role.bullets.filter((b) => keepIds.has(b.id)).map((b) => b.id)
    };
  });
}

// ── The model pass (selection only) ──────────────────────────────────────────

const SYSTEM = [
  'You tailor an existing résumé to one job requisition by SELECTING and ORDERING material that already exists.',
  'You are given a pool of résumé bullets, each with an id, and a job posting.',
  'You may NOT write new bullets. You may only return ids from the pool.',
  'Return ONLY compact JSON:',
  '{"summary":"<3-5 sentences>","roles":[{"role_id":"...","bullet_ids":["..."]}],"competency_order":["<label>",...]}',
  'The summary must restate ONLY facts present in the résumé you were given.',
  'Never introduce a tool, employer, certification, acronym or NUMBER that is not already in the résumé text.',
  'If the posting asks for something the résumé does not evidence, leave it out entirely — do not hedge it in.'
].join(' ');

async function modelSelection(profile, req, pool, jdTerms) {
  const c = client();
  if (!c) return null;

  const poolText = pool.map((r) => {
    const lines = r.bullets.map((b) => `  [${b.id}] ${b.text}`).join('\n');
    return `ROLE ${r.role_id}: ${r.title}\n${lines}`;
  }).join('\n\n');

  const competencies = ((profile.resume_json || {}).competencies || []).map((c2) => c2.label);

  const user = [
    `BASE SUMMARY (facts you may restate): ${(profile.resume_json || {}).summary || profile.headline || ''}`,
    `COMPETENCY LABELS AVAILABLE: ${competencies.join(' | ')}`,
    '',
    'BULLET POOL:',
    poolText.slice(0, 20000),
    '',
    '---',
    `POSTING — ${req.title} (req ${req.req_id}), ${req.location || ''}`,
    String(req.description_text || '').slice(0, 9000),
    '',
    `Select at most ${MAX_BULLETS_PER_ROLE} bullets per role, most relevant first.`
  ].join('\n');

  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 1600,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }]
  });
  const text = (resp.content || []).map((b) => b.text || '').join('').trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch (e) { return null; }
  return { parsed, usage: resp.usage };
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Produce a tailored résumé for one requisition.
 * Returns { content, keyword_coverage, gaps, tailored_by, is_simulated, model, dropped }.
 */
async function tailor(profile, req, { claimableTerms = [], rejectedNorms = new Set() } = {}) {
  const jdTerms = skills.extractTerms([req.title, req.description_text].filter(Boolean).join('\n'), { max: 45 });
  const pool = bulletPool(profile);
  const corpus = corpusOf(profile, claimableTerms);
  const dropped = [];

  const byId = new Map();
  for (const r of pool) for (const b of r.bullets) byId.set(b.id, b);

  let selection = deterministicSelection(pool, jdTerms);
  let summary = (profile.resume_json || {}).summary || profile.headline || '';
  let competencyOrder = ((profile.resume_json || {}).competencies || []).map((c) => c.label);
  let tailored_by = 'heuristic';
  let is_simulated = true;
  let usedModel = null;

  const c = client();
  if (c) {
    try {
      const out = await modelSelection(profile, req, pool, jdTerms);
      if (out && out.parsed) {
        const p = out.parsed;

        // Selection: ids must exist. An invented id is dropped and recorded —
        // it is the model reaching for a bullet that does not exist.
        if (Array.isArray(p.roles) && p.roles.length) {
          const cleaned = [];
          for (const r of p.roles) {
            const role = pool.find((x) => x.role_id === r.role_id);
            if (!role) { dropped.push({ kind: 'unknown_role_id', value: r.role_id }); continue; }
            const ids = [];
            for (const id of (r.bullet_ids || [])) {
              if (byId.has(id) && role.bullets.some((b) => b.id === id)) ids.push(id);
              else dropped.push({ kind: 'unknown_bullet_id', value: String(id) });
            }
            if (ids.length) cleaned.push({ role_id: role.role_id, bullet_ids: ids.slice(0, MAX_BULLETS_PER_ROLE) });
          }
          // Any role the model skipped keeps its deterministic selection: a
          // silently dropped role is a hole in the work history.
          for (const det of selection) {
            if (!cleaned.some((x) => x.role_id === det.role_id)) cleaned.push(det);
          }
          const order = new Map(pool.map((r, i) => [r.role_id, i]));
          cleaned.sort((a, b) => order.get(a.role_id) - order.get(b.role_id));
          selection = cleaned;
        }

        // Summary: free text, therefore verified before it is allowed to ship.
        if (p.summary) {
          const violations = verifyText(p.summary, corpus);
          if (violations.length) {
            dropped.push({ kind: 'summary_rejected', value: violations.slice(0, 8) });
          } else {
            summary = String(p.summary).slice(0, 2000);
          }
        }

        if (Array.isArray(p.competency_order) && p.competency_order.length) {
          const known = new Set(competencyOrder);
          const reordered = p.competency_order.filter((l) => known.has(l));
          for (const l of competencyOrder) if (!reordered.includes(l)) reordered.push(l);
          competencyOrder = reordered;
        }

        tailored_by = 'model';
        is_simulated = false;
        usedModel = MODEL;
      }
    } catch (e) {
      dropped.push({ kind: 'model_error', value: e.message });
    }
  }

  // ── Assemble the document ──────────────────────────────────────────────────
  const rj = profile.resume_json || {};
  const selById = new Map(selection.map((s) => [s.role_id, s.bullet_ids]));
  const roles = pool.map((r) => ({
    title: r.title,
    meta: r.meta,
    note: r.note,
    bullets: (selById.get(r.role_id) || r.bullets.map((b) => b.id))
      .map((id) => (byId.get(id) || {}).text)
      .filter(Boolean)
  })).filter((r) => r.bullets.length);

  const compByLabel = new Map((rj.competencies || []).map((c2) => [c2.label, c2]));
  const competencies = competencyOrder.map((l) => compByLabel.get(l)).filter(Boolean);

  const content = {
    name: profile.display_name,
    headline: rj.headline || profile.headline || '',
    contact: rj.contact || [],
    target_line: `Target role: ${req.title} (Job Req ${req.req_id}${req.location ? ', ' + req.location : ''})`,
    summary,
    competencies,
    roles,
    skills: rj.skills || [],
    education: rj.education || []
  };

  // ── Keyword coverage — deterministic, not a model opinion ──────────────────
  const flat = skills.normalize([
    content.headline, content.summary,
    ...competencies.map((c2) => `${c2.label} ${c2.text}`),
    ...roles.flatMap((r) => [r.title, r.meta, ...r.bullets]),
    ...(content.skills || []).map((s) => `${s.label} ${s.text}`)
  ].filter(Boolean).join(' \n '));

  const covered = [];
  const missing = [];
  for (const t of jdTerms) {
    (flat.includes(t.term) ? covered : missing).push(t.term);
  }
  const keyword_coverage = {
    total: jdTerms.length,
    covered_count: covered.length,
    pct: jdTerms.length ? Math.round((covered.length / jdTerms.length) * 100) : 0,
    covered,
    missing
  };

  // ── Gaps — what the posting wants that the profile cannot evidence ────────
  const claimNorms = new Set((claimableTerms || []).map(skills.normalize));
  const gaps = jdTerms
    .filter((t) => t.weight >= 3)                       // lexicon-grade, not noise n-grams
    .filter((t) => !claimNorms.has(t.term))
    .filter((t) => !corpus.includes(t.term))
    .filter((t) => !rejectedNorms.has(t.term))
    .slice(0, 12)
    .map((t) => ({ term: t.term, weight: t.weight, in_resume: false }));

  return {
    content, keyword_coverage, gaps, jd_terms: jdTerms,
    tailored_by, is_simulated, model: usedModel, dropped
  };
}

module.exports = { tailor, verifyText, corpusOf, bulletPool, deterministicSelection, MODEL };
