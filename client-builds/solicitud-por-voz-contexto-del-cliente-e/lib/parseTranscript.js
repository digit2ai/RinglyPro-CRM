// =====================================================
// parseTranscript — deterministic keyword/regex parser (MOCK NLP).
//
// THIS IS A STUB, NOT a real STT or LLM call. A production integration would
// route audio through Twilio Media Streams + a Spanish STT model (e.g. Whisper)
// then an LLM intent extractor. This sprint accepts a pre-transcribed Spanish
// string and parses it with deterministic rules:
//   - type:         sale | purchase | import   (keyword match, default sale)
//   - amount_usd:   first numeric token, ES/EN thousands+decimal aware
//   - counterparty: name after "a " / "para " / "con " (best-effort)
// =====================================================

const SALE_KW = /\b(vend\w*|venta|vendido|sold|sell|sale)\b/i;
const PURCHASE_KW = /\b(compr\w*|compra|comprado|bought|buy|purchase)\b/i;
const IMPORT_KW = /\b(import\w*|importaci[oó]n|imported)\b/i;

function detectType(text) {
  if (IMPORT_KW.test(text)) return 'import';
  if (PURCHASE_KW.test(text)) return 'purchase';
  if (SALE_KW.test(text)) return 'sale';
  return 'sale'; // TODO: improve NLP — default to sale when ambiguous
}

// Normalize a numeric token in ES ("5.000,50") or EN ("5,000.50") or plain ("5000").
function toNumber(raw) {
  if (!raw) return 0;
  let s = String(raw).replace(/\s/g, '');
  const hasDot = s.indexOf('.') !== -1;
  const hasComma = s.indexOf(',') !== -1;
  if (hasDot && hasComma) {
    // last separator is the decimal one
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.'); // ES
    else s = s.replace(/,/g, ''); // EN
  } else if (hasComma) {
    // single/grouped commas: comma as decimal only if it looks like ",dd"
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else {
    // dots only: treat ".ddd" groups as thousands unless it looks like a decimal ".dd"
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function detectAmount(text) {
  const m = String(text).match(/(\d[\d.,]*\d|\d)/);
  return m ? toNumber(m[1]) : 0;
}

function detectCounterparty(text) {
  // name introduced by a connector near the end: "... a Acme", "para Proveedor X"
  const m = String(text).match(/\b(?:a|para|con|al)\s+([^\d,.;]+?)\s*$/i);
  if (m && m[1]) {
    const name = m[1].trim().replace(/\b(de\s+palma|d[oó]lares?|usd)\b/gi, '').trim();
    if (name && name.length >= 2) return name.slice(0, 255);
  }
  return null;
}

function parseTranscript(transcript) {
  const text = String(transcript || '').trim();
  return {
    type: detectType(text),
    amount_usd: detectAmount(text),
    counterparty: detectCounterparty(text),
    note: text.slice(0, 500)
  };
}

module.exports = { parseTranscript, toNumber, detectType, detectAmount, detectCounterparty };
