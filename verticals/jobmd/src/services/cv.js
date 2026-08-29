'use strict';

/**
 * CV / RESUME INTELLIGENCE — extraction, with the honesty rule that matters:
 * IT NEVER INVENTS A FIELD.
 *
 * Everything returned must be traceable to a substring of the CV the physician
 * pasted. A specialty is only returned if one of the corpus specialties appears
 * in the text; a licence only if a state appears next to licence wording. What
 * it cannot find, it leaves null and lists in `not_found`, so the form can ask
 * rather than the profile quietly claiming something nobody said.
 *
 * Zero-key by default. A model may improve the SUMMARY only — never a field —
 * and even then the summary is discarded if it introduces a number the CV does
 * not contain.
 */

const C = require('./corpus');

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY',
  'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR',
  'PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

// Platform names are matched literally; a platform not named is not returned.
const ROBOT_PLATFORMS = ['da Vinci Xi','da Vinci X','da Vinci SP','da Vinci Si','da Vinci',
  'Hugo RAS','Hugo','Versius','Mazor X','Excelsius GPS','ROSA','MAKO','Monarch','Ion'];

function uniq(a) { return Array.from(new Set(a)); }

function extract(text) {
  const raw = String(text || '');
  const t = raw.replace(/\s+/g, ' ');
  const low = t.toLowerCase();
  const found = {};
  const notFound = [];
  const evidence = {};

  function set(field, value, snippet) {
    found[field] = value;
    if (snippet) evidence[field] = snippet.slice(0, 160);
  }

  // Specialty — only from the corpus list. A CV commonly names several
  // ("board-certified in Robotic Surgery ... residency in General Surgery"),
  // so rather than silently picking one, the earliest mention wins and the
  // rest come back as candidates for the physician to choose between.
  const specHits = C.MEDICAL_SPECIALTIES
    .map(function (s) { return { name: s, at: low.indexOf(s.toLowerCase()) }; })
    .filter(function (x) { return x.at !== -1; })
    .sort(function (a, b) { return a.at - b.at || b.name.length - a.name.length; });
  if (specHits.length) {
    set('specialty', specHits[0].name, specHits[0].name);
    if (specHits.length > 1) {
      found.specialty_candidates = specHits.map(function (x) { return x.name; });
    }
  } else notFound.push('specialty');

  // Board certification — the phrase must actually be present.
  const bc = t.match(/board[- ]certified[^.,;]{0,60}/i);
  if (bc) set('board_certified', true, bc[0]);
  else notFound.push('board_certified');

  // Years of experience — a stated number, never inferred from dates.
  const yrs = t.match(/(\d{1,2})\+?\s*(?:\+\s*)?years?(?:\s+of)?\s+(?:clinical\s+|surgical\s+|practice\s+)?experience/i);
  if (yrs) set('years_experience', parseInt(yrs[1], 10), yrs[0]);
  else notFound.push('years_experience');

  // Robotic experience.
  const platforms = uniq(ROBOT_PLATFORMS.filter(function (p) {
    return new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(t);
  }));
  // "da Vinci Xi" implies "da Vinci"; keep the most specific only.
  const specific = platforms.filter(function (p) {
    return !platforms.some(function (q) { return q !== p && q.toLowerCase().indexOf(p.toLowerCase()) === 0; });
  });
  if (specific.length) set('robotic_platforms', specific, specific.join(', '));
  else notFound.push('robotic_platforms');

  const ry = t.match(/(\d{1,2})\+?\s*years?[^.]{0,20}robotic/i) || t.match(/robotic[^.]{0,30}?(\d{1,2})\+?\s*years?/i);
  if (ry) set('robotic_years', parseInt(ry[1], 10), ry[0]);

  const cases = t.match(/(\d{2,5})\+?\s*(?:robotic\s+)?cases?(?:\s+(?:per|a)\s+year|\s+annually)?/i);
  if (cases) set('robotic_cases_annual', parseInt(cases[1], 10), cases[0]);

  // Licences — a state only counts next to licence wording.
  const licBlock = t.match(/licen[sc]e[ds]?[^.]{0,160}/ig) || [];
  const lic = uniq(licBlock.join(' ').match(/\b([A-Z]{2})\b/g) || [])
    .filter(function (s) { return STATES.indexOf(s) !== -1; });
  if (lic.length) set('licenses', lic, licBlock[0]);
  else notFound.push('licenses');

  const fell = t.match(/fellowship(?:\s+in)?[^.;,]{0,70}?(?=\s+and\b|[.;,]|$)/i);
  if (fell) set('fellowship', fell[0].trim(), fell[0]);
  else notFound.push('fellowship');

  const res = t.match(/residency(?:\s+in)?[^.;,]{0,70}?(?=\s+and\b|[.;,]|$)/i);
  if (res) set('residency', res[0].trim(), res[0]);
  else notFound.push('residency');

  const pubs = t.match(/(\d{1,3})\+?\s*(?:peer[- ]reviewed\s+)?publications?/i);
  if (pubs) set('publications', parseInt(pubs[1], 10), pubs[0]);

  if (/program director|chief of|division chief|department chair|medical director/i.test(t)) {
    const l = t.match(/(?:program director|chief of[^.,;]{0,40}|division chief|department chair|medical director)/i);
    set('leadership', l[0], l[0]);
  }
  if (/robotic[^.]{0,40}(program|programme)[^.]{0,40}(director|lead|chief|develop)/i.test(t)) {
    set('robotics_program_leadership', true, 'robotics programme leadership');
  }

  return {
    fields: found,
    not_found: notFound,
    evidence: evidence,
    extracted_by: 'heuristic',
    // Nothing here was inferred: every value above appears in the text.
    note: 'Every value was read from the CV text. Anything not found is listed in not_found so you can fill it in.'
  };
}

/** A plain summary built only from fields that exist. No model, no flourish. */
function summarize(p) {
  const bits = [];
  if (p.specialty) bits.push(p.specialty + (p.subspecialty ? ' (' + p.subspecialty + ')' : ''));
  if (p.years_experience) bits.push(p.years_experience + ' years of experience');
  if (p.board_certified) bits.push('board certified');
  const rp = Array.isArray(p.robotic_platforms) ? p.robotic_platforms : [];
  if (rp.length) bits.push('robotic experience on ' + rp.join(', ') +
                           (p.robotic_years ? ' over ' + p.robotic_years + ' years' : ''));
  if (p.robotics_program_leadership) bits.push('has led a robotics programme');
  const lic = Array.isArray(p.licenses) ? p.licenses : [];
  if (lic.length) bits.push('licensed in ' + lic.join(', '));
  if (!bits.length) return null;
  return bits.join('; ') + '.';
}

module.exports = { extract, summarize, ROBOT_PLATFORMS, STATES };
