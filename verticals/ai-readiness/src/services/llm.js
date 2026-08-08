'use strict';

/**
 * NARRATIVE SERVICE — the model writes prose. It never writes a number.
 *
 * This is the department's central honesty invariant, and it is enforced here
 * rather than asked for in the prompt:
 *
 *   Every figure, score, colour and phase cost is produced by the deterministic
 *   engines. The model receives them as already-computed facts and is asked
 *   only to phrase them for a specific CEO in a specific language. Output is
 *   then checked: any dollar figure the model emits that is not in the set of
 *   figures we handed it causes the model's text to be DISCARDED in favour of
 *   the deterministic summary.
 *
 * Why it matters more here than elsewhere: the CEO this department is built
 * for has usually been oversold once already. One invented number, discovered
 * later, costs the engagement and deserves to.
 *
 * With no ANTHROPIC_API_KEY the department runs end to end on the deterministic
 * prose, labeled `narrative_by: 'heuristic'`. Nothing degrades except the
 * polish of the sentences.
 */

const MODEL = process.env.AIR_MODEL || 'claude-haiku-4-5-20251001';
const KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM = `You are the writing voice of the AI Readiness Department. You are preparing an executive document for a CEO who is nervous about adopting AI and has often been oversold before.

ABSOLUTE RULES:
- You may NOT introduce any number, dollar figure, percentage, score, colour rating, timeline or metric that is not present in the FACTS given to you. Not one. If a number would help your sentence, and it is not in the FACTS, write the sentence without it.
- You may NOT promise an outcome, guarantee a saving, or characterise a result as certain. State what will be measured.
- Do not flatter, do not sell, and do not use marketing language. This CEO reads sales copy as a warning sign.
- Write plainly. Short sentences. No emojis. No bullet symbols.
- Lead with what the CEO said worried them, and answer that first.
- PLAIN PROSE ONLY. No markdown, no asterisks, no bold or italic markers, no headings, no lists. Your text is placed directly into a rendered document that shows those characters literally. Write flowing paragraphs separated by blank lines.
- Do not restate the company name as a title. The document already carries it.

You are writing one executive summary of at most 180 words, in the requested language, drawing ONLY on the FACTS.`;

/**
 * Strip markdown the prompt already forbids.
 *
 * The prompt is the request; this is the guarantee. Model text is placed
 * directly into a rendered document with HTML escaped, so a stray `**` reaches
 * the CEO as literal asterisks — which reads as a machine-generated artifact
 * in precisely the document whose whole job is to look considered.
 */
function deMarkdown(text) {
  return String(text || '')
    .replace(/^\s*#{1,6}\s*/gm, '')          // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // bold
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:)!?]|$)/g, '$1$2')  // italic
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:)!?]|$)/g, '$1$2')    // underscore italic
    .replace(/^\s*[-*+]\s+/gm, '')           // bullet markers
    .replace(/`([^`]+)`/g, '$1')             // inline code
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Pull every numeric token out of a string, for the verification pass. */
function numbersIn(text) {
  const out = new Set();
  const re = /\$?\s?([0-9][0-9,._]*)(\s?%)?/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const raw = m[1].replace(/[,_]/g, '');
    const n = Number(raw);
    if (Number.isFinite(n)) out.add(Math.round(n));
  }
  return out;
}

/** Every number the model is permitted to use, harvested from the facts. */
function allowedNumbers(facts) {
  const allowed = new Set();
  const walk = (v) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'number' && Number.isFinite(v)) {
      allowed.add(Math.round(v));
      // A rounded-to-thousands restatement of a permitted figure is still that
      // figure, and refusing it would reject correct prose.
      allowed.add(Math.round(v / 1000) * 1000);
      allowed.add(Math.round(v / 100) * 100);
      allowed.add(Math.round(v * 100));
      return;
    }
    if (typeof v === 'string') { numbersIn(v).forEach(n => allowed.add(n)); return; }
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === 'object') return Object.values(v).forEach(walk);
  };
  walk(facts);
  // Small integers are ordinary prose ("three lanes", "one process"), not claims.
  for (let i = 0; i <= 60; i++) allowed.add(i);
  return allowed;
}

/**
 * Write the executive summary.
 * @param {object} facts       everything the engines computed
 * @param {string} fallback    the deterministic summary, used when there is no
 *                             key, on any error, or on a verification failure
 * @returns {{text, narrative_by, is_simulated, rejected_reason?}}
 */
async function executiveSummary(facts, fallback, lang = 'en') {
  const safe = { text: fallback, narrative_by: 'heuristic', is_simulated: true };
  if (!KEY) return safe;

  try {
    const body = {
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `LANGUAGE: ${lang === 'es' ? 'Spanish (proper orthography, tildes and ñ)' : 'English'}

FACTS (the only source you may draw on):
${JSON.stringify(facts, null, 2)}

Write the executive summary now. At most 180 words. No number that is not above.`
      }]
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return safe;
    const json = await res.json();
    const raw = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const text = deMarkdown(raw);
    if (!text || text.length < 40) return safe;

    // ── verification: reject invented numbers outright ──────────────────
    const allowed = allowedNumbers(facts);
    const used = numbersIn(text);
    const invented = [...used].filter(n => !allowed.has(n));
    if (invented.length) {
      return { ...safe, rejected_reason: `model introduced figures not present in the computed facts: ${invented.slice(0, 5).join(', ')}` };
    }

    // Outcome guarantees are a rejection too — the whole document's credibility
    // rests on never having made one.
    if (/\b(guarantee[ds]?|guaranteed|we promise|will definitely|risk-free|garantiza|garantizado|sin riesgo)\b/i.test(text)) {
      return { ...safe, rejected_reason: 'model used guarantee language' };
    }

    return { text, narrative_by: 'model', is_simulated: false, model: MODEL };
  } catch (e) {
    return safe;
  }
}

function available() { return !!KEY; }

module.exports = { executiveSummary, available, numbersIn, allowedNumbers, deMarkdown, MODEL };
