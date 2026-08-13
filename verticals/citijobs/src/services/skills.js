'use strict';

/**
 * The skill store — and the single most important rule in this application.
 *
 *   verified   MAY appear on a resume. Reachable ONLY via confirmVerified(),
 *              which requires a human-supplied evidence string.
 *   vocabulary MAY ONLY widen the daily search. Harvested automatically from
 *              postings the owner tailors against. Costs at worst one
 *              irrelevant board row.
 *   rejected   Never suggested again.
 *
 * NOTHING AUTOMATED MAY PROMOTE vocabulary -> verified. Not a model call, not
 * a status change, not a weight update, not a batch job. If that promotion
 * ever becomes automatic, then tailoring against ten postings teaches the
 * profile ten skills the owner does not have; the hunter then searches for
 * that fabricated profile; and the loop compounds away from the owner, getting
 * more confident every day. The resume is the surface where that lie would
 * finally be told out loud, to a Citi hiring manager holding the real record.
 *
 * Search widens fast and automatically. The resume widens deliberately.
 * Never the reverse.
 */

const { Op } = require('sequelize');
const { Skill } = require('../models');

const KIND = { VERIFIED: 'verified', VOCABULARY: 'vocabulary', REJECTED: 'rejected' };

function normalize(term) {
  return String(term || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9+#/&' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(('the and for with you our are will have this that from your all can not was were has had they ' +
  'their been more than when what who how into over under also such each other which while these those there here ' +
  'then some most many much very just only both after before during within across through per via able across ' +
  'ability role team teams work working works job jobs position candidate candidates experience experienced years ' +
  'year including include includes required require requires requirements preferred plus strong excellent ' +
  'demonstrated proven ideal must should would could may might will new other others across level levels senior ' +
  'lead leads leading manage managed manages management manager support supports supported provide provides ' +
  'provided ensure ensures ensured drive drives driven help helps helped make makes made take takes taken ' +
  'business company organization opportunity apply application applications please citi citigroup employees ' +
  'employee benefits salary range full time hybrid remote office day days week weeks month months').split(' '));

/**
 * Deterministic term extraction from a job description. No model call — a
 * model asked for "the skills in this posting" invents plausible ones, and
 * these terms steer both the search and the gap prompts.
 *
 * Returns ranked multi-word phrases plus single-word hits from a curated
 * domain lexicon.
 */
const LEXICON = [
  'data transformation', 'data governance', 'data lineage', 'metadata management', 'data quality',
  'data warehousing', 'data modeling', 'data strategy', 'master data', 'reference data',
  'statistical modelling', 'statistical modeling', 'advanced analytics', 'predictive modeling',
  'machine learning', 'data science', 'business intelligence', 'data mining', 'segmentation',
  'program delivery', 'program management', 'project management', 'delivery execution',
  'stakeholder management', 'stakeholder engagement', 'change management', 'process improvement',
  'risk management', 'issue resolution', 'requirements traceability', 'book of work',
  'kyc', 'aml', 'cdd', 'edd', 'sanctions', 'ofac', 'fincen', 'occ', 'sar',
  'transaction monitoring', 'sanctions screening', 'financial crime', 'fraud analytics',
  'regulatory reporting', 'consent order', 'enterprise architecture', 'taxonomy',
  'sql', 'python', 'sas', 'tableau', 'snowflake', 'hadoop', 'spark', 'alteryx', 'dbt',
  'power bi', 'excel', 'oracle', 'postgresql', 'agile', 'scrum', 'sdlc', 'jira', 'confluence',
  'ofsaa', 'actimize', 'mantas', 'jama', 'workday', 'controls', 'audit', 'governance'
];

function extractTerms(text, { max = 40 } = {}) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const counts = new Map();

  const bump = (term, by) => {
    const n = normalize(term);
    if (!n || n.length < 3) return;
    counts.set(n, (counts.get(n) || 0) + by);
  };

  // 1) Curated lexicon — highest confidence, phrase match.
  for (const term of LEXICON) {
    let idx = 0, hits = 0;
    while ((idx = lower.indexOf(term, idx)) !== -1) { hits++; idx += term.length; }
    if (hits) bump(term, 3 + Math.min(hits, 3));
  }

  // 2) Repeated bigrams/trigrams that survive the stoplist.
  const words = lower.replace(/[^a-z0-9\s'&/+#]/g, ' ').split(/\s+/).filter(Boolean);
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n);
      if (gram.some((w) => STOP.has(w) || w.length < 3)) continue;
      bump(gram.join(' '), 1);
    }
  }

  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([term, weight]) => ({ term, weight }));
}

// ── Store operations ─────────────────────────────────────────────────────────

async function all(profile_id, kinds) {
  const where = { profile_id };
  if (kinds && kinds.length) where.kind = { [Op.in]: kinds };
  return Skill.findAll({ where, order: [['weight', 'DESC'], ['term', 'ASC']] });
}

/** Terms claimable on a resume. Verified only, by construction. */
async function claimable(profile_id) {
  const rows = await all(profile_id, [KIND.VERIFIED]);
  return rows.map((r) => r.term);
}

/** Terms that may steer the search. Verified + vocabulary, never rejected. */
async function searchTerms(profile_id) {
  const rows = await all(profile_id, [KIND.VERIFIED, KIND.VOCABULARY]);
  return rows.map((r) => ({ term: r.term, norm: r.norm, weight: r.weight, kind: r.kind }));
}

/**
 * Harvest posting language. Writes ONLY kind:'vocabulary', and never touches a
 * row that is already verified or rejected — a rejected term must stay dead,
 * and a verified term must not be demoted by a scraper.
 */
async function learnVocabulary(profile, terms, { req_id = null, source = 'tailoring' } = {}) {
  const learned = [];
  for (const t of terms || []) {
    const term = typeof t === 'string' ? t : t.term;
    const norm = normalize(term);
    if (!norm || norm.length < 3) continue;
    const existing = await Skill.findOne({ where: { profile_id: profile.id, norm } });
    if (existing) {
      if (existing.kind === KIND.VOCABULARY) {
        existing.hits += 1;
        existing.weight = Math.min(5, Number(existing.weight || 1) + 0.25);
        await existing.save();
      }
      continue; // verified and rejected are left exactly as they are
    }
    await Skill.create({
      tenant_id: profile.tenant_id,
      profile_id: profile.id,
      term: String(term).slice(0, 190),
      norm,
      kind: KIND.VOCABULARY,
      first_seen_req_id: req_id,
      source,
      weight: 1.0
    });
    learned.push(term);
  }
  return learned;
}

/**
 * THE ONLY PATH TO CLAIMABLE. Requires evidence in the owner's own words —
 * "I did this, here is where" — because that sentence is what has to survive
 * an interview, and because a required field is the cheapest possible barrier
 * against a future refactor quietly making this automatic.
 */
async function confirmVerified(profile, term, evidence, { req_id = null, source = 'manual' } = {}) {
  const norm = normalize(term);
  if (!norm) throw new Error('term required');
  const ev = String(evidence || '').trim();
  if (ev.length < 3) {
    const e = new Error('evidence required to verify a skill');
    e.code = 'EVIDENCE_REQUIRED';
    throw e;
  }
  let row = await Skill.findOne({ where: { profile_id: profile.id, norm } });
  if (row) {
    row.kind = KIND.VERIFIED;
    row.term = String(term).slice(0, 190);
    row.evidence = ev.slice(0, 2000);
    row.confirmed_at = new Date();
    row.weight = Math.max(2, Number(row.weight || 1));
    await row.save();
    return row;
  }
  return Skill.create({
    tenant_id: profile.tenant_id,
    profile_id: profile.id,
    term: String(term).slice(0, 190),
    norm,
    kind: KIND.VERIFIED,
    evidence: ev.slice(0, 2000),
    confirmed_at: new Date(),
    first_seen_req_id: req_id,
    source,
    weight: 2.0
  });
}

/** "Adjacent" — the owner does not claim it, but it may steer the search. */
async function markAdjacent(profile, term, { req_id = null } = {}) {
  const norm = normalize(term);
  if (!norm) throw new Error('term required');
  let row = await Skill.findOne({ where: { profile_id: profile.id, norm } });
  if (row) {
    if (row.kind === KIND.VERIFIED) return row; // never demote a confirmed claim
    row.kind = KIND.VOCABULARY;
    row.weight = Math.max(1, Number(row.weight || 1));
    await row.save();
    return row;
  }
  return Skill.create({
    tenant_id: profile.tenant_id, profile_id: profile.id,
    term: String(term).slice(0, 190), norm, kind: KIND.VOCABULARY,
    first_seen_req_id: req_id, source: 'manual', weight: 1.0
  });
}

/** "No" — never suggest this again, and stop it steering the search. */
async function reject(profile, term) {
  const norm = normalize(term);
  if (!norm) throw new Error('term required');
  let row = await Skill.findOne({ where: { profile_id: profile.id, norm } });
  if (row) {
    row.kind = KIND.REJECTED;
    row.weight = 0;
    await row.save();
    return row;
  }
  return Skill.create({
    tenant_id: profile.tenant_id, profile_id: profile.id,
    term: String(term).slice(0, 190), norm, kind: KIND.REJECTED,
    source: 'manual', weight: 0
  });
}

/**
 * Board movement retrains the hunter — the third and strongest signal, and the
 * one that needs no form. Applied weights a requisition's language up;
 * Interview weights it up hard (the market confirmed the fit, not just me);
 * not_interested weights it down, which is what stops the Pune rows.
 *
 * Weights move ranking only. They can never change `kind`.
 */
const OUTCOME_DELTA = {
  applied: 0.5,
  interview: 1.5,
  offer: 2.0,
  rejected: -0.15,
  not_interested: -0.75,
  withdrawn: -0.25
};

async function applyOutcome(profile, terms, outcome) {
  const delta = OUTCOME_DELTA[outcome];
  if (!delta) return 0;
  let touched = 0;
  for (const t of terms || []) {
    const norm = normalize(typeof t === 'string' ? t : t.term);
    if (!norm) continue;
    const row = await Skill.findOne({ where: { profile_id: profile.id, norm } });
    if (!row || row.kind === KIND.REJECTED) continue;
    row.weight = Math.max(0.1, Math.min(6, Number(row.weight || 1) + delta));
    await row.save();
    touched++;
  }
  return touched;
}

module.exports = {
  KIND, normalize, extractTerms, LEXICON,
  all, claimable, searchTerms,
  learnVocabulary, confirmVerified, markAdjacent, reject, applyOutcome,
  OUTCOME_DELTA
};
