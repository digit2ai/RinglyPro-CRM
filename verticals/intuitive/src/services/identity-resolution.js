'use strict';

/**
 * Identity Resolution — disambiguate name-keyed external sources against NPI roster.
 *
 * External sources (PubMed, ClinicalTrials.gov, ABMS, state boards) key on names.
 * Names collide constantly — "Smith J" matches thousands of real physicians.
 *
 * This service:
 *   1. Normalizes names (strip credentials, prefixes, punctuation)
 *   2. Scores a candidate name against a known NPI record using multiple signals
 *   3. Returns a confidence score 0..1 — callers should reject matches < 0.6
 *
 * Used by:
 *   - data-sources/pubmed.js (before counting publications as "this surgeon's")
 *   - data-sources/clinical-trials.js (before counting trials as "this surgeon's")
 *   - any future name-keyed connector
 */

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

const CREDENTIAL_PATTERN = /,?\s*(md|do|phd|mph|mba|facs|frcs|fasco|fasn|fcap|jr|sr|ii|iii|iv|v)\.?(\s|$)/gi;
const PREFIX_PATTERN = /^(dr|doctor|prof|professor)\.?\s+/i;

function normalize(name) {
  if (!name) return '';
  return String(name)
    .replace(PREFIX_PATTERN, '')
    .replace(CREDENTIAL_PATTERN, ' ')
    .replace(/[^a-zA-Z\s\-']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(name) {
  const n = normalize(name);
  if (!n) return { first: '', middle: '', last: '', tokens: [], inverted: false };
  const tokens = n.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first: '', middle: '', last: '', tokens: [], inverted: false };
  if (tokens.length === 1) return { first: '', middle: '', last: tokens[0], tokens, inverted: false };

  // Detect inverted "Lastname FI" form (common in PubMed): last token is 1-2 chars
  // and first token is multi-char. E.g. "smith j" or "smith jq".
  const last = tokens[tokens.length - 1];
  const first = tokens[0];
  if (tokens.length === 2 && last.length <= 2 && first.length > 2) {
    return { first: last, middle: '', last: first, tokens, inverted: true };
  }

  if (tokens.length === 2) return { first: tokens[0], middle: '', last: tokens[1], tokens, inverted: false };
  return {
    first: tokens[0],
    middle: tokens.slice(1, -1).join(' '),
    last: tokens[tokens.length - 1],
    tokens,
    inverted: false,
  };
}

// ---------------------------------------------------------------------------
// String similarity (Levenshtein-based, normalized 0..1)
// ---------------------------------------------------------------------------

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return curr[b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 1;
  return 1 - levenshtein(a, b) / longer;
}

// ---------------------------------------------------------------------------
// Specialty match — surgical specialty keywords across naming variants
// ---------------------------------------------------------------------------

const SPECIALTY_SYNONYMS = {
  urology: ['urolog'],
  gynecology: ['gynecolog', 'obstetric', 'ob/gyn', 'obgyn'],
  general: ['general surger'],
  thoracic: ['thoracic', 'cardiothoracic', 'cardiovascular'],
  colorectal: ['colon', 'rectal', 'colorectal'],
  head_neck: ['otolaryngolog', 'head and neck', 'ent'],
  plastic: ['plastic surger'],
  oncology: ['surgical oncolog'],
};

function specialtyMatches(npiSpecialtyKey, externalSpecialtyText) {
  if (!externalSpecialtyText) return false;
  const syns = SPECIALTY_SYNONYMS[npiSpecialtyKey] || [];
  const blob = String(externalSpecialtyText).toLowerCase();
  return syns.some(s => blob.includes(s));
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

/**
 * Score how confidently an external "candidate" matches a known NPI record.
 *
 * @param {Object} candidate - external source's record { name, specialty?, state?, affiliation? }
 * @param {Object} npiRecord - known NPI roster row { full_name, specialty_key, license_state, practice_address }
 * @returns {{ confidence: number, signals: Object }}
 *
 * Confidence ranges:
 *   1.00       — exact name match + specialty match + state match
 *   0.85-0.95  — strong name + specialty match
 *   0.65-0.84  — last name + first initial match
 *   0.40-0.64  — last name match only (USE WITH CAUTION)
 *   < 0.40     — reject (almost certainly a different person)
 */
function score(candidate, npiRecord) {
  const cand = tokenize(candidate.name || '');
  const ref = tokenize(npiRecord.full_name || '');
  const signals = { last_match: false, first_match: false, first_initial: false, specialty: false, state: false };

  if (!cand.last || !ref.last) {
    return { confidence: 0, signals, reason: 'missing_last_name' };
  }

  // Last name — must match (allow 1 typo for long names)
  const lastSim = similarity(cand.last, ref.last);
  if (lastSim < 0.8) {
    return { confidence: 0, signals, reason: 'last_name_mismatch' };
  }
  signals.last_match = true;
  let pts = 0.4; // base for last-name match

  // First name comparison
  if (cand.first && ref.first) {
    const firstSim = similarity(cand.first, ref.first);
    if (firstSim >= 0.85) {
      signals.first_match = true;
      pts += 0.25; // strong first-name match
    } else if (cand.first[0] === ref.first[0]) {
      signals.first_initial = true;
      pts += 0.15; // first-initial match only
    } else {
      pts -= 0.1; // first-name disagreement — penalize but don't kill
    }
  } else if (cand.first && cand.first.length === 1 && ref.first && cand.first[0] === ref.first[0]) {
    // PubMed often gives "Smith J" form — first is just an initial
    signals.first_initial = true;
    pts += 0.15;
  }

  // Specialty match (when available)
  if (candidate.specialty && npiRecord.specialty_key) {
    if (specialtyMatches(npiRecord.specialty_key, candidate.specialty)) {
      signals.specialty = true;
      pts += 0.2;
    }
  }

  // State / geography match (when available)
  if (candidate.state && npiRecord.license_state) {
    if (String(candidate.state).toUpperCase() === String(npiRecord.license_state).toUpperCase()) {
      signals.state = true;
      pts += 0.1;
    }
  }

  // Middle initial bonus (rare but very strong signal)
  if (cand.middle && ref.middle) {
    if (cand.middle[0] && cand.middle[0] === ref.middle[0]) {
      pts += 0.05;
    }
  }

  return { confidence: Math.max(0, Math.min(1, pts)), signals };
}

/**
 * From a list of NPI roster candidates, find the best match for an external name.
 * Returns the best match and confidence, or null if no candidate clears `threshold`.
 */
function resolveBest(externalCandidate, npiRoster, threshold = 0.6) {
  let best = null;
  let bestScore = 0;
  for (const npi of npiRoster) {
    const result = score(externalCandidate, npi);
    if (result.confidence > bestScore) {
      bestScore = result.confidence;
      best = { npi, confidence: result.confidence, signals: result.signals };
    }
  }
  if (!best || best.confidence < threshold) return null;
  return best;
}

// Top-300 most common US surnames (Census 2020 + surgery-frequent immigrant names).
// Used as a fast heuristic for "is this name distinctive enough to trust name-keyed sources?"
const COMMON_LAST_NAMES = new Set([
  // Top US Census surnames
  'smith','johnson','williams','brown','jones','garcia','miller','davis','rodriguez','martinez',
  'hernandez','lopez','gonzalez','wilson','anderson','thomas','taylor','moore','jackson','martin',
  'lee','perez','thompson','white','harris','sanchez','clark','ramirez','lewis','robinson',
  'walker','young','allen','king','wright','scott','torres','nguyen','hill','flores',
  'green','adams','nelson','baker','hall','rivera','campbell','mitchell','carter','roberts',
  'gomez','phillips','evans','turner','diaz','parker','cruz','edwards','collins','reyes',
  'stewart','morris','morales','murphy','cook','rogers','gutierrez','ortiz','morgan','cooper',
  'peterson','bailey','reed','kelly','howard','ramos','kim','cox','ward','richardson',
  'watson','brooks','chavez','wood','james','bennett','gray','mendoza','ruiz','hughes',
  'price','alvarez','castillo','sanders','patel','myers','long','ross','foster','jimenez',
  // Common Asian surnames in US medical workforce
  'chen','wang','liu','zhang','wong','huang','singh','shah','khan','ahmed','sharma','das','gupta',
]);

/**
 * Decide whether to trust an external source's count for a given record.
 *
 * Returns:
 *   - { trust: true, confidence: 0.95 }   — distinctive name, trust raw counts
 *   - { trust: true, confidence: 0.7  }   — common surname, dampen mildly
 *   - { trust: false, confidence: 0.5 }   — common surname AND no disambiguating context
 *
 * Callers should multiply external counts by `confidence` so common-name results
 * are dampened proportionally rather than zeroed.
 */
function gateExternalCount(npiRecord, externalResult) {
  const t = tokenize(npiRecord.full_name || '');
  if (!t.last) return { trust: false, reason: 'no_name', confidence: 0 };
  if (t.tokens.length < 2) return { trust: false, reason: 'single_token', confidence: 0.3 };

  const isCommon = COMMON_LAST_NAMES.has(t.last);
  const hasContext = !!(npiRecord.specialty_key || npiRecord.license_state);

  if (!isCommon) {
    // Distinctive last name — trust the result fully
    return { trust: true, confidence: 0.95, reason: 'distinctive_name' };
  }
  if (isCommon && hasContext) {
    // Common surname but we have specialty/state to help — moderate trust
    return { trust: true, confidence: 0.75, reason: 'common_name_with_context' };
  }
  // Common surname, no context — flag as ambiguous, dampen heavily
  return { trust: false, confidence: 0.5, reason: 'common_name_no_context' };
}

module.exports = {
  normalize,
  tokenize,
  similarity,
  specialtyMatches,
  score,
  resolveBest,
  gateExternalCount,
};
