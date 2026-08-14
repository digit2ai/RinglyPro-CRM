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

// A US posting does not have to say "United States". Citi writes "Tampa Florida
// United States" and JPMorgan writes "Columbus, OH, United States", but PNC
// writes "PA - Pittsburgh 15222", Capital One "McLean, VA" and U.S. Bank
// "Saint Paul, MN". Matching only the country name silently excluded EVERY
// posting from those three banks as foreign — 524 US jobs, dropped without a
// trace, on an app that looked like it was working.
const US_STATE_CODES = new Set(('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT '
  + 'NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR').split(' '));
const US_NAME_LIST = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware',
  'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine',
  'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma',
  'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia', 'puerto rico'];

/** Does this location string read as a US one, even without the country? */
function looksUS(loc) {
  const l = String(loc || '');
  const lower = l.toLowerCase();
  if (US_NAME_LIST.some((n) => lower.includes(n))) return true;
  // A bare two-letter state token: "McLean, VA", "PA - Pittsburgh 15222".
  if ((l.match(/\b[A-Z]{2}\b/g) || []).some((t) => US_STATE_CODES.has(t))) return true;
  // PNC names facilities "Data Center PA690" — a state code glued to a building
  // number, so the word boundary above never fires.
  return (l.match(/\b([A-Z]{2})\d{2,}\b/g) || []).some((t) => US_STATE_CODES.has(t.slice(0, 2)));
}

/**
 * Country gate. A US-only profile must never be shown Pune — but it must be
 * shown Pittsburgh, and a posting that names only a state is still US.
 */
function locationAllowed(req, profile) {
  // An EXPLICITLY EMPTY list means "anywhere". Only an absent list falls back to
  // US-only. Collapsing the two would make the United-States-only switch
  // impossible to turn off — it would keep filtering while claiming not to.
  if (Array.isArray(profile.countries) && profile.countries.length === 0) {
    return { ok: true, reason: null };
  }
  const countries = (profile.countries && profile.countries.length)
    ? profile.countries
    : ['United States'];
  const loc = String(req.location || '');
  if (!loc) return { ok: true, reason: 'no location stated' };  // flag, do not silently drop
  const lower = loc.toLowerCase();
  if (countries.some((c) => lower.includes(String(c).toLowerCase()))) return { ok: true, reason: null };
  if (countries.some((c) => /united states|usa|u\.s\./i.test(c)) && looksUS(loc)) {
    return { ok: true, reason: null };
  }
  return { ok: false, reason: `location "${loc}" outside ${countries.join(', ')}` };
}

/**
 * The pay floor. Compared against the TOP of a stated range, so a 130k-160k
 * posting still shows.
 *
 * A requisition with no stated range is NOT known to be below the floor, and
 * most Citi postings state nothing (only some US states require it). Treating
 * silence as "too low" would bury good roles while looking like the filter
 * working correctly, so unpriced postings pass unless the owner explicitly
 * turns `hide_unpriced` on — and they carry the reason either way.
 */
function salaryAllowed(req, profile) {
  const floor = Number(profile.min_salary_cents || 0);
  if (!floor) return { ok: true, reason: null };

  const stated = req.salary_source === 'stated' && req.salary_max_cents != null;
  if (!stated) {
    return profile.hide_unpriced
      ? { ok: false, reason: 'no salary stated' }
      : { ok: true, reason: 'no salary stated' };
  }
  const max = Number(req.salary_max_cents);
  return max >= floor
    ? { ok: true, reason: null }
    : { ok: false, reason: `stated maximum $${Math.round(max / 100).toLocaleString('en-US')} is below the floor` };
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

module.exports = { score, shouldScore, locationAllowed, looksUS, salaryAllowed, tokens };
