'use strict';

/**
 * THE INTELLIGENT MATCHING ENGINE.
 *
 * The seven dimensions are read from corpus.js — the same list the architecture
 * documents publish — so the running app and the spec cannot disagree about
 * what a match is made of. Add a dimension to the corpus and this engine picks
 * it up or fails loudly; it can never silently score six.
 *
 * IT IS ARITHMETIC, NOT A MODEL. Every dimension is computed from two records
 * and returns a score, the reason it scored that way, and the gap if there is
 * one. A model is never asked for a number, because a number a recruiter will
 * act on has to be reproducible and explainable. The optional model writes only
 * the one-paragraph summary, and only over figures this file produced.
 *
 * A score with no gaps attached is a number nobody can act on, so `gaps` is
 * always returned alongside `reasons`, even at 100.
 */

const C = require('./corpus');

// Weights sum to 1. Clinical dominates because a specialty mismatch is not a
// near miss, it is a different job.
const WEIGHTS = {
  'Clinical Match': 0.30,
  'Technology Match': 0.15,
  'Geographic Match': 0.15,
  'Career Match': 0.08,
  'Compensation Match': 0.14,
  'Availability Match': 0.08,
  'Cultural / Professional Match': 0.10
};

const CALL_RANK = { none: 0, light: 1, moderate: 2, heavy: 3 };

function arr(v) { return Array.isArray(v) ? v : []; }
function norm(s) { return String(s || '').trim().toLowerCase(); }
function overlap(a, b) {
  const B = arr(b).map(norm);
  return arr(a).filter(function (x) { return B.indexOf(norm(x)) !== -1; });
}
function clamp01(n) { return Math.max(0, Math.min(1, n)); }

// ── The seven dimensions. Each returns {score, reason, gap}. ───────────────
const EVALUATORS = {

  'Clinical Match': function (p, pos) {
    if (!p.specialty) return { score: 0, reason: null, gap: 'No specialty on the profile yet.' };
    if (norm(p.specialty) !== norm(pos.specialty)) {
      return { score: 0, reason: null,
               gap: 'Specialty is ' + p.specialty + '; the position is ' + pos.specialty + '.' };
    }
    let s = 0.6;
    const reasons = ['Specialty matches: ' + pos.specialty + '.'];
    const gaps = [];

    if (pos.board_certification_required) {
      if (p.board_certified) { s += 0.2; reasons.push('Board certified, as required.'); }
      else gaps.push('The position requires board certification; the profile does not show it.');
    } else if (p.board_certified) { s += 0.1; reasons.push('Board certified.'); }

    const need = pos.min_years_experience || 0;
    const has = p.years_experience || 0;
    if (has >= need) {
      s += 0.2;
      reasons.push(has + ' years of experience against a ' + need + '-year minimum.');
    } else {
      gaps.push(has + ' years of experience against a ' + need + '-year minimum.');
    }

    const shared = overlap(pos.procedures, p.procedure_expertise);
    if (shared.length) { s += 0.1; reasons.push('Shared procedures: ' + shared.join(', ') + '.'); }
    else if (arr(pos.procedures).length) {
      gaps.push('The position lists procedures the profile does not: ' + arr(pos.procedures).join(', ') + '.');
    }
    return { score: clamp01(s), reason: reasons.join(' '), gap: gaps.join(' ') || null };
  },

  'Technology Match': function (p, pos) {
    if (!pos.robotics_required) {
      return { score: 1, reason: 'The position does not require robotic experience.', gap: null };
    }
    const shared = overlap(pos.robotic_platforms, p.robotic_platforms);
    const anyRobotics = arr(p.robotic_platforms).length > 0;
    if (!anyRobotics) {
      return { score: 0, reason: null, gap: 'The position requires robotic surgery experience; the profile records none.' };
    }
    let s = 0.45;
    const reasons = ['Robotic experience on record.'];
    const gaps = [];
    if (shared.length) { s += 0.3; reasons.push('Platform match: ' + shared.join(', ') + '.'); }
    else gaps.push('Trained on ' + arr(p.robotic_platforms).join(', ') +
                   '; the position uses ' + arr(pos.robotic_platforms).join(', ') + '.');
    if ((p.robotic_years || 0) >= 3) { s += 0.15; reasons.push(p.robotic_years + ' years robotic.'); }
    if (p.robotics_program_leadership) { s += 0.1; reasons.push('Has led a robotics programme.'); }
    return { score: clamp01(s), reason: reasons.join(' '), gap: gaps.join(' ') || null };
  },

  'Geographic Match': function (p, pos) {
    const prefs = arr(p.geographic_preferences).map(norm);
    const st = norm(pos.state);
    if (prefs.length && prefs.indexOf(st) !== -1) {
      return { score: 1, reason: pos.state + ' is a stated preferred location.', gap: null };
    }
    if (p.relocation_willing) {
      return { score: 0.6, reason: 'Open to relocation.',
               gap: pos.state + ' is not among the stated preferences (' +
                    (prefs.length ? arr(p.geographic_preferences).join(', ') : 'none given') + ').' };
    }
    if (!prefs.length) {
      return { score: 0.4, reason: null, gap: 'No geographic preference on the profile, and relocation not indicated.' };
    }
    return { score: 0.05, reason: null,
             gap: 'Prefers ' + arr(p.geographic_preferences).join(', ') + ' and is not open to relocation; the position is in ' + pos.state + '.' };
  },

  'Career Match': function (p, pos) {
    let s = 0.5;
    const reasons = [];
    const gaps = [];
    const academic = norm(pos.employment_model) === 'academic';
    if (academic) {
      if (p.academic_experience || (p.publications || 0) > 0) {
        s += 0.4; reasons.push('Academic background suits an academic post.');
      } else gaps.push('The post is academic; the profile shows no academic experience or publications.');
    } else {
      s += 0.2;
    }
    if (p.robotics_program_leadership || (p.leadership && String(p.leadership).trim())) {
      s += 0.2; reasons.push('Leadership experience on record.');
    }
    return { score: clamp01(s), reason: reasons.join(' ') || 'No career signal either way.', gap: gaps.join(' ') || null };
  },

  'Compensation Match': function (p, pos) {
    const want = p.compensation_expectation;
    const lo = pos.compensation_min, hi = pos.compensation_max;
    // The request is explicit that compensation is only compared when stated.
    if (!want) return { score: 0.5, reason: null, gap: 'No compensation expectation on the profile.' };
    if (!lo && !hi) return { score: 0.5, reason: null, gap: 'The position states no compensation range.' };
    const top = hi || lo;
    if (want <= top) {
      return { score: 1, reason: 'Expectation of $' + want.toLocaleString() + ' sits within the posted range.', gap: null };
    }
    const over = want - top;
    const ratio = over / top;
    if (ratio <= 0.10) {
      return { score: 0.65, reason: null,
               gap: 'Expectation of $' + want.toLocaleString() + ' is about ' + Math.round(ratio * 100) +
                    '% above the top of the range ($' + top.toLocaleString() + ').' };
    }
    return { score: clamp01(0.4 - ratio), reason: null,
             gap: 'Expectation of $' + want.toLocaleString() + ' exceeds the top of the range ($' +
                  top.toLocaleString() + ').' };
  },

  'Availability Match': function (p, pos) {
    if (!p.available_from) return { score: 0.5, reason: null, gap: 'No availability date on the profile.' };
    if (!pos.start_date) return { score: 0.7, reason: 'Available from ' + p.available_from + '; the position states no start date.', gap: null };
    const avail = new Date(p.available_from), start = new Date(pos.start_date);
    const days = Math.round((avail - start) / 86400000);
    if (days <= 0) return { score: 1, reason: 'Available on or before the ' + pos.start_date + ' start date.', gap: null };
    if (days <= 60) return { score: 0.7, reason: null, gap: 'Available about ' + days + ' days after the requested start date.' };
    return { score: 0.25, reason: null, gap: 'Available ' + days + ' days after the requested start date.' };
  },

  'Cultural / Professional Match': function (p, pos) {
    let s = 0.5;
    const reasons = [];
    const gaps = [];
    const pref = norm(p.employment_preference);
    const model = norm(pos.employment_model);
    if (!pref || pref === 'any') { s += 0.15; }
    else if (pref === model) { s += 0.3; reasons.push('Employment model matches the stated preference (' + pos.employment_model + ').'); }
    else gaps.push('Prefers ' + p.employment_preference + '; the position is ' + pos.employment_model + '.');

    const tol = norm(p.call_tolerance);
    const call = norm(pos.call_schedule);
    if (!tol || tol === 'any' || !call) { s += 0.1; }
    else if (CALL_RANK[call] <= CALL_RANK[tol]) { s += 0.2; reasons.push('Call schedule is within the stated tolerance.'); }
    else gaps.push('Call is ' + pos.call_schedule + '; the stated tolerance is ' + p.call_tolerance + '.');
    return { score: clamp01(s), reason: reasons.join(' ') || 'No cultural signal either way.', gap: gaps.join(' ') || null };
  }
};

/**
 * Score one physician against one position.
 * @returns {{score:number, dimensions:Array, reasons:Array<string>, gaps:Array<string>}}
 */
function scoreMatch(physician, position) {
  const dimensions = [];
  const reasons = [];
  const gaps = [];
  let total = 0;

  // Iterating the CORPUS, not a local list: the engine cannot score six.
  C.MATCHING_DIMENSIONS.forEach(function (d) {
    const fn = EVALUATORS[d.dimension];
    if (!fn) throw new Error('No evaluator for dimension "' + d.dimension + '"');
    const out = fn(physician, position);
    const w = WEIGHTS[d.dimension];
    total += out.score * w;
    dimensions.push({
      dimension: d.dimension,
      evaluates: d.evaluates,
      score: Math.round(out.score * 100),
      weight: w,
      reason: out.reason || null,
      gap: out.gap || null
    });
    if (out.reason) reasons.push(d.dimension + ': ' + out.reason);
    if (out.gap) gaps.push(d.dimension + ': ' + out.gap);
  });

  return { score: Math.round(total * 100), dimensions: dimensions, reasons: reasons, gaps: gaps };
}

/** Every open position scored against one physician, best first. */
function matchPhysician(physician, positions) {
  return positions.map(function (pos) {
    const m = scoreMatch(physician, pos);
    return { position_id: pos.id, position: pos, score: m.score,
             dimensions: m.dimensions, reasons: m.reasons, gaps: m.gaps };
  }).sort(function (a, b) { return b.score - a.score; });
}

/** Every physician scored against one position, best first. */
function matchPosition(position, physicians) {
  return physicians.map(function (p) {
    const m = scoreMatch(p, position);
    return { physician_id: p.id, physician: p, score: m.score,
             dimensions: m.dimensions, reasons: m.reasons, gaps: m.gaps };
  }).sort(function (a, b) { return b.score - a.score; });
}

module.exports = { scoreMatch, matchPhysician, matchPosition, WEIGHTS, EVALUATORS };
