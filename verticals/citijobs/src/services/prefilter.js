'use strict';

/**
 * The free, deterministic pre-filter. Ported from jobup's jobsource.prefilter,
 * whose own comment calls it "the difference between $5 and $25 a year".
 *
 * Nothing reaches the model that this can decide. It also produces the
 * heuristic score used when there is no API key, so the app is fully usable
 * with zero external keys — just labelled as such, never silently faked.
 */

const { normalize } = require('./skills');

const SENIOR = ['senior', 'lead', 'principal', 'director', 'head', 'vp', 'vice president', 'svp', 'c14', 'c15', 'c16', 'manager'];
const JUNIOR = ['intern', 'internship', 'apprentice', 'graduate', 'entry level', 'campus', 'trainee', 'analyst i', 'associate analyst'];

function tokens(s) {
  return normalize(s).split(' ').filter((w) => w.length > 2);
}

/**
 * Country gate. A US-only profile must never be shown Pune, and the location
 * strings Citi emits are plain ("Tampa Florida United States"), so a substring
 * test on the profile's country list is honest and sufficient.
 */
function locationAllowed(req, profile) {
  const countries = (profile.countries && profile.countries.length)
    ? profile.countries
    : ['United States'];
  const loc = String(req.location || '');
  if (!loc) return { ok: true, reason: 'no location stated' };  // flag, do not silently drop
  const hit = countries.some((c) => loc.toLowerCase().includes(String(c).toLowerCase()));
  return hit
    ? { ok: true, reason: null }
    : { ok: false, reason: `location "${loc}" outside ${countries.join(', ')}` };
}

/**
 * Score 0-100 from evidence only: title overlap with target titles, skill-term
 * hits weighted by the skill store, seniority alignment, location.
 */
function score(req, profile, skillTerms) {
  const title = String(req.title || '');
  const titleN = normalize(title);
  const body = normalize([title, req.description_text || ''].join(' \n '));
  const reasons = [];
  let pts = 0;

  // Target titles — the strongest single signal.
  let titleHits = 0;
  for (const t of profile.target_titles || []) {
    const tn = normalize(t);
    if (!tn) continue;
    if (titleN.includes(tn)) { titleHits += 2; continue; }
    const tw = tokens(tn);
    const overlap = tw.filter((w) => titleN.includes(w)).length;
    if (tw.length && overlap / tw.length >= 0.6) titleHits += 1;
  }
  if (titleHits) {
    const add = Math.min(40, titleHits * 12);
    pts += add;
    reasons.push(`title matches ${titleHits} target title pattern(s) (+${add})`);
  }

  // Skill terms from the store, weighted. Verified counts double — it is
  // evidence, where vocabulary is only interest.
  let termPts = 0;
  const matched = [];
  for (const s of skillTerms || []) {
    if (!s.norm || s.norm.length < 4) continue;
    if (!body.includes(s.norm)) continue;
    const w = Number(s.weight || 1) * (s.kind === 'verified' ? 2 : 1);
    termPts += w;
    matched.push(s.term);
  }
  if (termPts) {
    const add = Math.min(40, Math.round(termPts * 2));
    pts += add;
    reasons.push(`${matched.length} profile term(s) present: ${matched.slice(0, 6).join(', ')}${matched.length > 6 ? '…' : ''} (+${add})`);
  }

  // Seniority alignment.
  const isSenior = SENIOR.some((w) => titleN.includes(w));
  const isJunior = JUNIOR.some((w) => titleN.includes(w));
  if (isSenior) { pts += 10; reasons.push('senior-level title (+10)'); }
  if (isJunior) { pts -= 25; reasons.push('junior/entry title (-25)'); }

  // Location.
  const loc = locationAllowed(req, profile);
  if (loc.ok) {
    const preferred = (profile.target_locations || []).some(
      (l) => String(req.location || '').toLowerCase().includes(String(l).toLowerCase())
    );
    if (preferred) { pts += 10; reasons.push('preferred location (+10)'); }
  } else {
    pts -= 60;
    reasons.push(`${loc.reason} (-60)`);
  }

  const final = Math.max(0, Math.min(100, Math.round(pts)));
  return { score: final, reasons, matched, location_ok: loc.ok, location_reason: loc.reason };
}

/**
 * Decide what is worth spending a model call on. `floor` is deliberately well
 * below the profile's board threshold: the pre-filter's job is to discard the
 * obviously-irrelevant, not to make the final call.
 */
function shouldScore(pre, profile) {
  if (!pre.location_ok) return false;
  const floor = Math.max(15, Math.round((profile.score_threshold || 70) * 0.5));
  return pre.score >= floor;
}

module.exports = { score, shouldScore, locationAllowed, tokens };
