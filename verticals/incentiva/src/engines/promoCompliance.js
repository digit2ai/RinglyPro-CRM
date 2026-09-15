'use strict';

/**
 * The DIGIT2AI compliance agent for builder promotions. Deterministic rules, keyless, and it FAILS CLOSED:
 * a row it cannot evaluate is held. Anna may show a promotion only when this returns status 'pass'.
 * It runs when research rows are stored AND again every time they are read, so a promotion whose date
 * passes overnight disappears the next morning without anyone re-running the research.
 *
 *  hold  : fair-housing wording on the shared lexicon, guarantee or approval claims,
 *          an expired promotion, a promotion with no source at all, a row naming no builder
 *  pass  : everything else, with notes the page shows beside the promotion (for example a temporary
 *          buydown that raises the payment later, or a lender or title requirement)
 */

const { lexiconFindings } = require('./compliance');

const GUARANTEE = /\b(risk[- ]free|no[- ]risk|guarantee[ds]?|you (will )?qualify|approval guaranteed)\b|\b(garantizad[oa]|sin riesgo|usted califica)\b/i;
const SUPERLATIVE = /\b(best|lowest|cheapest|unbeatable)\b|\b(mejor|más bajo)\b/i;
const TEMP_BUYDOWN = /\b[1-3][-/][0-3](?:[-/][0-3])?\s*buy\s*-?down\b|\btemporary\s+(rate\s+)?buy\s*-?down\b/i;
const LENDER_REQ = /\b(preferred|affiliated|builder'?s)\s+(lender|mortgage|title)\b|\bmust\s+(use|finance with|close with)\b/i;

function review(row, today) {
  try {
    const notes = [];
    if (!row || !String(row.builder || '').trim()) return { status: 'hold', notes: [{ code: 'no_builder' }] };
    const text = [row.community, row.promotion, row.rate, row.closing_credit, row.other_incentives, row.restrictions].filter(Boolean).join(' ');
    const lex = lexiconFindings(text);
    if (lex.length) return { status: 'hold', notes: lex.map((f) => ({ code: 'wording_' + f.category, quote: f.quote })) };
    const offerText = [row.promotion, row.other_incentives].filter(Boolean).join(' ');
    if (GUARANTEE.test(offerText)) return { status: 'hold', notes: [{ code: 'unsupported_claim' }] };
    if (SUPERLATIVE.test(offerText)) notes.push({ code: 'builder_claim' });
    const day = today || new Date().toISOString().slice(0, 10);
    const exp = row.expiration_date ? String(row.expiration_date).slice(0, 10) : null;
    if (exp && exp < day) return { status: 'hold', notes: [{ code: 'expired', date: exp }] };
    const hasOffer = !!(row.promotion || row.rate || row.closing_credit || row.other_incentives);
    if (hasOffer && !row.source_url && row.origin !== 'agent_verified') return { status: 'hold', notes: [{ code: 'no_source' }] };
    if (TEMP_BUYDOWN.test(text)) notes.push({ code: 'temporary_buydown' });
    if (LENDER_REQ.test(text)) notes.push({ code: 'lender_requirement' });
    if (hasOffer && !exp) notes.push({ code: 'no_expiration' });
    if (row.origin !== 'agent_verified' && !row.verified && hasOffer) notes.push({ code: 'not_agent_confirmed' });
    return { status: 'pass', notes };
  } catch (e) {
    return { status: 'hold', notes: [{ code: 'review_error' }] };
  }
}

const NOTE_TEXT = {
  en: {
    temporary_buydown: 'Temporary buydown: the payment rises when the buydown ends.',
    lender_requirement: "Requires the builder's lender or title company.",
    no_expiration: 'No end date published.',
    not_agent_confirmed: 'Not yet confirmed by a licensed agent.',
    builder_claim: "Comparative wording is the builder's own, not ours."
  },
  es: {
    temporary_buydown: 'Reducción temporal de tasa: el pago sube cuando termina.',
    lender_requirement: 'Exige el prestamista o la compañía de título de la constructora.',
    no_expiration: 'Sin fecha de vencimiento publicada.',
    not_agent_confirmed: 'Aún no confirmada por un agente con licencia.',
    builder_claim: 'Las comparaciones son palabras de la constructora, no nuestras.'
  }
};
function noteLines(notes, lang) {
  const d = NOTE_TEXT[lang === 'es' ? 'es' : 'en'];
  return (notes || []).map((n) => d[n.code]).filter(Boolean);
}

module.exports = { review, noteLines };
