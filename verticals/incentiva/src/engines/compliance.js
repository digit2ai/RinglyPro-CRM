'use strict';

/**
 * Compliance guard, deterministic layer. Runs on every report, keyless. FAILS
 * CLOSED: a thrown error is a hold, never a pass.
 *
 *  block : fair-housing hard term, or an incentive that is not buyer-safe
 *  hold  : softer fair-housing term, a figure in prose that the facts do not
 *          contain, a missing disclosure, a temporary buydown without its
 *          post-buydown payment, an unknown fee presented as a complete payment
 */

const { isBuyerSafe } = require('./freshness');

const LEXICON = [
  // [pattern, severity, category]
  [/\bno (children|kids)\b/i, 'block', 'fair_housing'],
  [/\b(christian|catholic|jewish|muslim) (community|neighborhood|area)\b/i, 'block', 'fair_housing'],
  [/\b(white|black|hispanic|latino|asian) (neighborhood|community|area)\b/i, 'block', 'fair_housing'],
  [/\bno section 8\b/i, 'block', 'fair_housing'],
  [/\bsin (niños|ninos)\b/i, 'block', 'fair_housing'],
  [/\bcomunidad (cristiana|católica|catolica|judía|musulmana)\b/i, 'block', 'fair_housing'],
  [/\bbarrio (latino|hispano|blanco|negro|asiático)\b/i, 'block', 'fair_housing'],
  [/\badults? only\b|\bsolo adultos\b/i, 'hold', 'fair_housing'],
  [/\b(ideal|perfect|great) for (young )?(couples|families|singles|retirees|professionals|kids)\b/i, 'hold', 'fair_housing'],
  [/\bideal para (familias|parejas|solteros|jubilados)\b/i, 'hold', 'fair_housing'],
  [/\bfamily[- ]friendly\b/i, 'hold', 'fair_housing'],
  [/\bsafe (area|neighborhood|community)\b|\b(zona|barrio) segur[oa]\b/i, 'hold', 'fair_housing'],
  [/\bcrime\b|\bcrimen\b|\bdelincuencia\b/i, 'hold', 'fair_housing'],
  [/\bexclusive (area|neighborhood|community)\b|\bcomunidad exclusiva\b/i, 'hold', 'fair_housing'],
  [/\b(good|great|best) schools\b|\bbuenas escuelas\b/i, 'hold', 'fair_housing'],
  [/\bwalking distance to (a |the )?(church|synagogue|mosque|temple)\b|\bcerca de la iglesia\b/i, 'hold', 'fair_housing'],
  [/\bdemographic|\bethnic|\bdemográfic|\bétnic/i, 'hold', 'fair_housing'],
  [/\bguarantee(d)?\b|\bgarantizad[oa]\b/i, 'hold', 'unverified_claim'],
  [/\bbest deal\b|\blowest price\b|\bmejor oferta\b|\bprecio más bajo\b/i, 'hold', 'unverified_claim'],
  [/\byou (will )?qualify\b|\busted califica\b/i, 'hold', 'unverified_claim']
];

const REQUIRED_DISCLOSURES = ['platform', 'compensation', 'estimates', 'incentives', 'equal_housing'];

function lexiconFindings(text) {
  const out = [];
  for (const [re, severity, category] of LEXICON) {
    const m = String(text || '').match(re);
    if (m) out.push({ severity, category, quote: m[0], why: 'Matched the ' + category.replace('_', ' ') + ' word list.', suggested_fix: 'Describe the property, not the people.' });
  }
  return out;
}

function digitsOnly(s) { return String(s).replace(/[^\d.]/g, '').replace(/\.0+$/, ''); }

/** Numeric tokens that appear in prose (money, percents, plain 3+ digit numbers). */
function numericTokens(text) {
  const out = [];
  const re = /\$?\d[\d,]*(?:\.\d+)?%?/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const tok = m[0];
    const d = digitsOnly(tok);
    if (!d) continue;
    if (!/[$%,]/.test(tok) && d.length < 3) continue; // small bare numbers ("3 questions") are not figures
    out.push({ tok, d });
  }
  return out;
}

function proseStrings(payload) {
  const n = payload.narrative || {};
  const arr = [n.opening, n.next_step].concat(n.watch_outs || [], n.questions_to_ask || []);
  (payload.items || []).forEach((it) => arr.push(it.take));
  return arr.filter(Boolean);
}

/**
 * @param payload  one language payload of a report
 * @param ctx { versionsById: {id: versionRow}, now }
 */
function reviewReport(payload, ctx = {}) {
  const findings = [];
  try {
    const prose = proseStrings(payload);
    const allText = prose.join(' \n ');
    findings.push(...lexiconFindings(allText));

    // Figures in prose must exist in the structured facts.
    const structured = JSON.stringify({ items: (payload.items || []).map((it) => Object.assign({}, it, { take: null })), comparison: payload.comparison, criteria: payload.criteria_summary, assumptions: payload.assumptions });
    const factDigits = new Set(numericTokens(structured.replace(/\\"/g, '"')).map((x) => x.d));
    // Also accept the raw numbers stored unformatted.
    (structured.match(/\d+(?:\.\d+)?/g) || []).forEach((x) => factDigits.add(digitsOnly(x)));
    for (const p of prose) {
      for (const { tok, d } of numericTokens(p)) {
        if (!factDigits.has(d)) findings.push({ severity: 'hold', category: 'unverified_claim', quote: tok, why: 'This figure does not appear in the report data.', suggested_fix: 'Remove the figure or use the value from the data.' });
      }
    }

    for (const k of REQUIRED_DISCLOSURES) {
      if (!payload.disclosures || !payload.disclosures[k]) findings.push({ severity: 'hold', category: 'disclosure', quote: k, why: 'Required disclosure missing.', suggested_fix: 'Restore the standard disclosure.' });
    }

    const now = ctx.now || new Date();
    for (const it of payload.items || []) {
      for (const inc of it.incentives || []) {
        const v = ctx.versionsById ? ctx.versionsById[inc.version_id] : null;
        if (!v || !isBuyerSafe(v, now)) findings.push({ severity: 'block', category: 'unverified_incentive', quote: inc.headline, why: 'Incentive is not verified and fresh.', suggested_fix: 'Remove it until an agent confirms it.' });
      }
      for (const sc of it.scenarios || []) {
        if (sc.type === 'rate_buydown_temporary' && sc.modeled && (sc.year3plus === null || sc.year3plus === undefined)) {
          findings.push({ severity: 'hold', category: 'payment_presentation', quote: sc.label, why: 'Temporary buydown shown without the payment after it ends.', suggested_fix: 'Show the Year 3+ payment.' });
        }
        if (it.fees_known === false && sc.modeled && !sc.from) {
          findings.push({ severity: 'hold', category: 'payment_presentation', quote: sc.label, why: 'Payment shown as complete while a fee is not confirmed.', suggested_fix: 'Mark the payment as "from".' });
        }
      }
    }
  } catch (e) {
    findings.push({ severity: 'hold', category: 'reviewer_error', quote: String(e.message).slice(0, 120), why: 'The compliance check failed, so the report is held.', suggested_fix: 'Retry or review manually.' });
  }
  const verdict = findings.some((f) => f.severity === 'block') ? 'block' : (findings.some((f) => f.severity === 'hold') ? 'hold' : 'pass');
  return { verdict, findings };
}

module.exports = { reviewReport, lexiconFindings, numericTokens, LEXICON, REQUIRED_DISCLOSURES };
