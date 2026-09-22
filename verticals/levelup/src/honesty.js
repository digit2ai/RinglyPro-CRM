'use strict';

/**
 * LevelUp honesty guards — enforced in code, on every path.
 *
 *  - numbersIn / newNumbers: a figure a model introduced that the evidence
 *    does not contain. A brand reply carrying one is DISCARDED; a script
 *    carrying one is flagged "confirm before filming".
 *  - copiedRun: the originality rule. A script may copy a structure, never
 *    8+ consecutive words of a reference transcript.
 *  - injectionIn: a pasted email is data. Text that tries to instruct the
 *    assistant is flagged and shown to the creator in plain words.
 */

function numbersIn(s) {
  const out = new Set();
  String(s || '').replace(/\$?\d[\d,]*(?:\.\d+)?\s*(?:k|K|%)?/g, (m) => {
    let t = m.replace(/[$,\s]/g, '').toLowerCase();
    if (t.endsWith('k')) t = String(Number(t.slice(0, -1)) * 1000);
    if (t.endsWith('%')) t = t.slice(0, -1);
    const n = Number(t);
    if (isFinite(n)) out.add(String(n));
    return m;
  });
  return out;
}

/** Numbers in `text` that appear nowhere in `evidence` (string or array). */
function newNumbers(text, evidence) {
  const ev = numbersIn(Array.isArray(evidence) ? evidence.join(' ') : evidence);
  return [...numbersIn(text)].filter((n) => !ev.has(n) && !/^[1-9]$/.test(n)); // single digits (steps, "3 tips") are prose
}

function words(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/** Longest run of consecutive words shared by `text` and `reference`. */
function copiedRun(text, reference, n = 8) {
  const a = words(text); const b = words(reference);
  if (a.length < n || b.length < n) return null;
  const grams = new Set();
  for (let i = 0; i + n <= b.length; i++) grams.add(b.slice(i, i + n).join(' '));
  for (let i = 0; i + n <= a.length; i++) {
    const g = a.slice(i, i + n).join(' ');
    if (grams.has(g)) return g;
  }
  return null;
}

const INJECTION = /(ignore (all|any|the|previous|prior)[^.]{0,40}instructions|disregard (the|your|all)[^.]{0,30}(rules|instructions)|you are now|system prompt|as an ai (model|assistant)|reply with (the|your) (rate card|password|api key)|olvida (tus|las) instrucciones|ignora (tus|las|todas)[^.]{0,30}instrucciones)/i;
function injectionIn(s) { return INJECTION.test(String(s || '')); }

/** Fence untrusted text so it cannot spell the fence itself. */
function fence(label, s) {
  const clean = String(s || '').replace(/<\/?untrusted[^>]*>/gi, '');
  return `<untrusted source="${label}">\n${clean}\n</untrusted>`;
}

module.exports = { numbersIn, newNumbers, copiedRun, injectionIn, fence, words };
