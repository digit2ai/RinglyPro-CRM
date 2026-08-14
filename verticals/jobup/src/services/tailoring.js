'use strict';

// =============================================================
// TAILORING SELECTS; IT DOES NOT AUTHOR.
//
// The PDF is assembled from the subscriber's own structured résumé
// (profiles.resume_json) — every job title, every date, every bullet, every
// skill copied VERBATIM. The only thing tailoring is allowed to change is
// which of those bullets appear and in what order, plus a summary paragraph
// that is verified against the résumé before it is used.
//
// This is the same doctrine as verticals/citijobs: a line that reaches an
// employer must be defensible in the interview, and the fastest way to make a
// candidate un-hireable is a résumé that says something they cannot back up.
// A model asked to "rewrite this for the role" will happily add a tool, a
// metric or a scale that was never there.
//
// Consequences to preserve:
//   * a bullet the résumé does not contain can never appear in the PDF
//   * the summary is DISCARDED in favour of the original if it introduces a
//     number, acronym or domain term the résumé does not contain
//   * with no model configured this still produces a real, correct PDF — the
//     subscriber's own résumé, ordered by relevance, labelled as unmodelled
// =============================================================

const resumeSvc = require('./resume');

/** Words too common to count as evidence of anything. */
const STOP = new Set(('a an the and or but for with of to in on at as is are was were be been '
  + 'by from this that these those it its our your their we you they i me my he she his her '
  + 'will would can could should may might must have has had do does did not no yes if then '
  + 'than so such via per across within into over under about between during including')
  .split(' '));

function words(s) {
  return String(s || '').toLowerCase().match(/[a-z][a-z0-9+#.\-]{1,}/g) || [];
}

/** Terms the posting actually asks for, most distinctive first. */
function jobTerms(job) {
  const counts = new Map();
  for (const w of words(`${(job || {}).title || ''} ${(job || {}).description || ''}`)) {
    if (w.length < 3 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}

/**
 * How much of what the posting asks for this document actually evidences.
 *
 * Deterministic and free — no model call. It is a MEASUREMENT of the text, not
 * a prediction of whether anyone will call: an ATS is a keyword filter, and
 * this counts the keywords. It must never be presented as a chance of an
 * interview.
 */
function coverage(text, job) {
  const terms = jobTerms(job).slice(0, 60);
  if (!terms.length) return { pct: null, matched: [], missing: [], total: 0 };
  const have = new Set(words(text));
  const matched = terms.filter((t) => have.has(t));
  const missing = terms.filter((t) => !have.has(t));
  return {
    pct: Math.round((matched.length / terms.length) * 100),
    matched, missing: missing.slice(0, 25), total: terms.length,
  };
}

/** How well one bullet answers this posting. Used only to ORDER, never to edit. */
function relevance(bullet, terms) {
  const have = new Set(words(bullet));
  let n = 0;
  for (let i = 0; i < terms.length; i++) if (have.has(terms[i])) n += (terms.length - i);
  return n;
}

/**
 * The summary is the ONE free-text field, so it is the one that gets verified.
 *
 * Any number, acronym or long word it introduces that the résumé does not
 * contain is a fabrication, and the whole paragraph is discarded rather than
 * patched — a half-trusted summary is worse than the subscriber's own words.
 */
function verifySummary(candidate, corpus) {
  const c = String(candidate || '').trim();
  if (!c) return { text: '', ok: false, reason: 'empty' };
  const have = new Set(words(corpus));
  const introduced = [];
  // Numbers are the classic fabrication: "$4M", "300+", "12 countries".
  for (const n of c.match(/\d[\d,.]*%?\+?/g) || []) {
    if (!String(corpus).includes(n.replace(/[+%]$/, ''))) introduced.push(n);
  }
  for (const w of c.match(/\b[A-Z]{2,6}\b/g) || []) {          // acronyms
    if (!have.has(w.toLowerCase())) introduced.push(w);
  }
  for (const w of words(c)) {                                   // domain terms
    if (w.length >= 7 && !STOP.has(w) && !have.has(w)) introduced.push(w);
  }
  const uniq = Array.from(new Set(introduced));
  return uniq.length
    ? { text: '', ok: false, reason: 'introduced terms the résumé does not contain', introduced: uniq.slice(0, 12) }
    : { text: c, ok: true };
}

/**
 * Build the structured document the PDF renderer takes.
 *
 * `profile` is profiles.resume_json — the subscriber's own parsed résumé.
 * Returns { content, keyword_coverage, gaps, summary_source }.
 */
function build(profile, job, opts) {
  const p = profile || {};
  const o = opts || {};
  const terms = jobTerms(job);
  const corpus = JSON.stringify(p);

  const roles = (Array.isArray(p.experience) ? p.experience : []).map((e) => {
    const bullets = (Array.isArray(e.highlights) ? e.highlights : [])
      .map(String).filter(Boolean)
      // ORDERED by relevance, never rewritten. Selection is the whole of the
      // tailoring; the words are the subscriber's.
      .map((b) => ({ b, r: relevance(b, terms) }))
      .sort((x, y) => y.r - x.r)
      .slice(0, Math.max(1, o.maxBullets || 6))
      .map((x) => x.b);
    const when = [e.start, e.end].filter(Boolean).join(' – ');
    return {
      title: e.title || '',
      meta: [e.company, e.location, when].filter(Boolean).join('  ·  '),
      bullets,
    };
  }).filter((r) => r.title || r.bullets.length);

  const skillNames = (Array.isArray(p.skills) ? p.skills : [])
    .map((s) => (typeof s === 'string' ? s : (s && s.name))).filter(Boolean);
  // Skills the posting asks for come first — again ordering only.
  skillNames.sort((a, b) => relevance(b, terms) - relevance(a, terms));

  // The summary: the tailored one when it verifies, otherwise the subscriber's.
  const v = verifySummary(o.summary, corpus);
  const summary = v.ok ? v.text : (p.summary || '');

  const content = {
    name: p.name || o.name || '',
    headline: p.headline || '',
    contact: [p.email, p.phone, p.location, o.site_url].filter(Boolean),
    target_line: job && job.title
      ? `Target role: ${job.title}${job.employer ? ` — ${job.employer}` : ''}`
      : null,
    summary,
    roles,
    skills: skillNames.length ? [{ label: 'Skills', text: skillNames.slice(0, 40).join(' · ') }] : [],
    education: (Array.isArray(p.education) ? p.education : []).map((e) => [
      e.studyType, e.area, e.institution, e.end,
    ].filter(Boolean).join(', ')).filter(Boolean),
  };

  // Coverage is measured on the DOCUMENT THAT WILL BE SENT, not on the source
  // résumé — otherwise the number describes a file nobody receives.
  const flat = [content.summary, ...roles.flatMap((r) => [r.title, r.meta, ...r.bullets]),
                skillNames.join(' '), ...content.education].join(' ');
  const cov = coverage(flat, job);

  return {
    content,
    keyword_coverage: cov,
    gaps: cov.missing,
    summary_source: v.ok ? 'tailored' : 'resume',
    summary_rejected: v.ok ? null : v,
  };
}

module.exports = { build, coverage, jobTerms, verifySummary, relevance, resumeSvc };
