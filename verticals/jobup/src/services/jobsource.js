'use strict';

// =============================================================
// The SHARED job pool (donor cv-jobsource.js, spec sections 4 + 8.3).
//
// COST MECHANIC #1: one fetch of a Greenhouse board serves EVERY tenant
// targeting that employer. Never fetch per subscriber — that is how ATS rate
// limits get hit and connectors get blocked.
//
// Cross-source dedupe, repost detection and stale marking live here.
// =============================================================

const crypto = require('crypto');
const employers = require('./employers');
const { models } = require('../models');

const STALE_DAYS = 30;

function dedupeKey(p) {
  // Same role reposted under a new id, or listed on two sources, collapses here.
  const basis = [
    String(p.employer || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
    String(p.title || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
    String(p.location || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24),
  ].join('|');
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 20);
}

/**
 * A posted date we can defend, or null.
 *
 * Not every ATS returns a date in this field — Workday returns English prose
 * ("Posted 30+ Days Ago"). `new Date()` turns that into Invalid Date, Postgres
 * rejects the row, and because ingest ran the whole board in one pass, a single
 * unparseable string discarded EVERY posting from that employer. Nothing here
 * needs a posted date badly enough to be worth guessing one.
 */
function safeDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Upsert postings into the shared pool. Returns counts, never throws into a request.
async function ingest(postings, { source, employer }) {
  const Jobs = models.jobs;
  let added = 0, refreshed = 0, reposts = 0, rejected = 0;

  for (const p of postings || []) {
    const key = dedupeKey({ ...p, employer });
    const existing = await Jobs.findOne({ where: { dedupe_key: key } });
    if (existing) {
      await Jobs.update({ last_seen_at: new Date() }, { where: { id: existing.id } });
      refreshed++;
      if (existing.external_id && p.external_id && existing.external_id !== p.external_id) reposts++;
      continue;
    }
    // One malformed posting must never cost the other 86.
    try {
      await Jobs.create({
        source, external_id: p.external_id || null, employer,
        title: p.title || null, location: p.location || null, url: p.url || null,
        description: p.description || '', compensation: p.compensation || null,
        posted_at: safeDate(p.posted_at),
        dedupe_key: key, first_seen_at: new Date(), last_seen_at: new Date(),
      });
      added++;
    } catch (e) {
      rejected++;
    }
  }
  return { added, refreshed, reposts, rejected, total: (postings || []).length };
}

// Refresh one employer's board. Honors the guessed-token quarantine.
async function refreshEmployer(row, opts = {}) {
  const res = await employers.fetchBoard(row.ats, row.token, {
    verified: row.status === employers.STATUS.LIVE,
    ...opts,
  });
  if (!res.contributes) {
    return { employer: row.name, status: res.status, ingested: null, note: res.note,
             sample_titles: res.sample_titles || [] };
  }
  const counts = await ingest(res.postings, { source: row.ats, employer: row.name });
  return { employer: row.name, status: res.status, ingested: counts,
           capped: res.capped || false, note: res.note };
}

// Deterministic, FREE pre-filter. Runs before any LLM call.
// COST MECHANIC #2 — this is the difference between 5 USD and 25 USD a year.
const STOP = new Set(['the','and','for','with','you','our','are','will','have','this','that','from','your','all','can','not','was','were','has','had','they','their','been','more','than','when','what','who','how','into','over','under','also','such','each','other','about','which','while','these','those','there','here','then','some','most','many','much','very','just','only','both','after','before','during']);

/**
 * @param stats optional object, mutated with WHY each posting was dropped.
 *
 * A subscriber whose own targeting excludes the whole pool sees exactly what a
 * subscriber with a broken agent sees: nothing. The counts are what separate
 * the two, and they are free — the filter already knows which branch it took.
 */
function prefilter(jobs, profile, settings, rawText, stats) {
  const targeting = (settings || {}).targeting || {};
  const titles = (targeting.roles || []).map((r) => String(r.title || '').toLowerCase()).filter(Boolean);
  const industries = (targeting.industries || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const wantEmployers = (targeting.employers || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const must = (targeting.must_include || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const never = (targeting.exclude_keywords || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const seniority = String(targeting.seniority || '').toLowerCase();
  const wantLocations = (targeting.locations || []).map((x) => String(x).toLowerCase()).filter(Boolean);

  // Multi-select is the real setting; the legacy single choice is the fallback
  // for a profile saved before the account form existed.
  let modes = (targeting.work_modes || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  if (!modes.length && targeting.remote_preference && targeting.remote_preference !== 'any') {
    modes = targeting.remote_preference === 'hybrid'
      ? ['hybrid', 'remote']            // open to hybrid means open to remote too
      : [targeting.remote_preference];
  }
  const types = (targeting.employment_types || []).map((x) => String(x).toLowerCase()).filter(Boolean);

  const skills = ((profile || {}).skills || []).map((s) =>
    String(typeof s === 'string' ? s : s.name || '').toLowerCase()).filter(Boolean);
  let terms = [...titles, ...skills, ...industries];

  // Keyless fallback: with no model the profile has no structured skills, which
  // would leave the pre-filter with nothing to match on and the teaser showing
  // zero jobs. Distinctive tokens from the raw resume keep it working — the
  // matches are still real postings, just selected without an LLM.
  if (terms.length === 0) {
    const src = `${rawText || ''} ${(profile || {}).headline || ''} ${(profile || {}).summary || ''}`;
    terms = [...new Set((src.toLowerCase().match(/[a-z][a-z0-9+#.]{3,}/g) || [])
      .filter((w) => !STOP.has(w)))].slice(0, 60);
  }

  const drop = { excluded_keyword: 0, must_include: 0, work_mode: 0, employment_type: 0, no_overlap: 0 };
  const scored = [];
  for (const j of (jobs || [])) {
    const title = String(j.title || '').toLowerCase();
    const employer = String(j.employer || '').toLowerCase();
    const location = String(j.location || '').toLowerCase();
    const hay = `${title} ${String(j.description || '').toLowerCase()}`;

    // ---- FREE EXCLUSIONS, before anything is counted or spent ----
    // A word you never want to see costs nothing to check and saves a whole
    // model call. This runs before scoring for exactly that reason.
    if (never.length && never.some((w) => hay.includes(w) || employer.includes(w))) { drop.excluded_keyword++; continue; }

    // A must-have term is a requirement, not a preference.
    if (must.length && !must.every((w) => hay.includes(w))) { drop.must_include++; continue; }

    // ---- WORK MODE. Read off location AND description: plenty of postings say
    // "Remote" only in the body, and judging on the location string alone threw
    // away real remote roles whose location field held a head-office city.
    //
    // THE RULE IS ASYMMETRIC, because postings are. Remote and hybrid are
    // selling points — a posting that offers them says so. On-site is the
    // unstated default, so silence means on-site far more often than not.
    //   * on-site NOT wanted -> a posting must SHOW an accepted mode. Silence
    //     is treated as on-site and dropped. Otherwise a remote-only seeker
    //     gets an inbox of ordinary office jobs that simply never said.
    //   * on-site wanted     -> silence is fine; only a stated mode you
    //     excluded drops the row.
    //
    // ONE EXCEPTION, AND IT IS THE DIFFERENCE BETWEEN SILENCE AND IGNORANCE.
    // "Silence means on-site" is a fair reading of a posting we have READ. Some
    // sources (Workday, SmartRecruiters) hand us title and location only, with
    // no body text at all — that posting is not silent about its work mode, we
    // simply never fetched the sentence that states it. Treating our own
    // ingestion gap as a statement by the employer excluded every Workday
    // posting from anyone who had expressed any mode preference, silently. When
    // there is no text to judge, the mode is UNKNOWN and is not grounds to
    // drop the row — the same rule geo.js already applies to a missing location.
    const hasText = String(j.description || '').trim().length > 0;
    if (modes.length && modes.length < 3 && hasText) {
      const where = `${location} ${hay}`;
      const isRemote = /\bremote\b|\bwork from home\b|\bwfh\b|\bfully distributed\b/.test(where);
      const isHybrid = /\bhybrid\b/.test(where);
      const isOnsite = /\bon[- ]?site\b|\bin[- ]office\b|\bin person\b/.test(where);
      const stated = isRemote || isHybrid || isOnsite;
      const wants = (modes.includes('remote') && isRemote)
                 || (modes.includes('hybrid') && isHybrid)
                 || (modes.includes('onsite') && (isOnsite || !stated));
      if (!wants) { drop.work_mode++; continue; }
    }

    // ---- EMPLOYMENT TYPE. Same asymmetry: full-time is the unstated default,
    // so a full-time seeker is never filtered on silence, while somebody who
    // only wants an internship is not shown every unlabelled permanent role.
    let typeHit = 0;
    if (types.length) {
      const stated = {
        internship: /\bintern(ship)?s?\b/.test(hay),
        part_time: /\bpart[- ]time\b/.test(hay),
        contract: /\bcontract(or)?\b|\bfreelance\b|\bc2c\b|\bcorp[- ]to[- ]corp\b/.test(hay),
        temporary: /\btemporary\b|\btemp\b|\bseasonal\b/.test(hay),
        full_time: /\bfull[- ]time\b|\bpermanent\b/.test(hay),
      };
      const anyStated = Object.values(stated).some(Boolean);
      const wanted = types.some((k) => stated[k]);
      if (wanted) typeHit = 2;
      else if (anyStated) { drop.employment_type++; continue; }   // states a type you ruled out
      else if (!types.includes('full_time')) { drop.employment_type++; continue; } // silence reads as full-time
    }

    let hits = 0;
    for (const t of terms) if (t.length > 2 && hay.includes(t)) hits++;

    // Title matches count double — a title hit is a far stronger signal.
    const titleHits = titles.filter((t) => t && title.includes(t)).length;
    // An employer you named is a strong signal too.
    const employerHits = wantEmployers.filter((e) => e && employer.includes(e)).length;
    // Seniority is a nudge, not a gate: titles word it too many ways to filter on.
    const seniorityHit = seniority && title.includes(seniority) ? 1 : 0;
    // A place you said you would work is a preference, never a gate — geo.js
    // owns the hard country rules and it runs later.
    const locationHit = wantLocations.some((l) => location.includes(l)) ? 2 : 0;

    const prescore = hits + titleHits * 2 + employerHits * 3 + seniorityHit + locationHit + typeHit;
    if (prescore > 0) scored.push({ job: j, prescore }); else drop.no_overlap++;
  }

  if (stats) Object.assign(stats, { considered: (jobs || []).length, kept: scored.length, dropped: drop });
  return scored.sort((a, b) => b.prescore - a.prescore);
}

/**
 * Fill in the body text for postings that arrived without any.
 *
 * Workday and SmartRecruiters list endpoints return title and location only.
 * The pre-filter matches a subscriber's skills against title + description, so
 * a posting with no description can only ever match on its title — and a title
 * like "Account Executive" contains none of the skills of the person it is
 * perfect for. Those postings entered the shared pool effectively unmatched.
 *
 * It runs against the DB rather than inside fetchBoard so it is INCREMENTAL: a
 * capped pass each day converges, only ever touches rows still missing text,
 * and one board's slow detail endpoint cannot stall the whole refresh. The cost
 * is one request per posting ONCE, amortised across every subscriber, because
 * the pool is shared.
 */
async function enrichDescriptions({ limit = 200, fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  const Jobs = models.jobs;
  const all = await Jobs.findAll({});
  const need = all
    .filter((j) => !String(j.description || '').trim())
    .filter((j) => employers.ADAPTERS[j.source] && employers.ADAPTERS[j.source].detail)
    .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))
    .slice(0, limit);

  // The detail URL is built from the employer's token, not the posting.
  const boards = await models.employers.findAll({});
  const tokenFor = new Map(boards.map((b) => [`${b.ats}|${b.name}`, b.token]));

  let filled = 0, failed = 0, skipped = 0;
  for (const j of need) {
    const token = tokenFor.get(`${j.source}|${j.employer}`);
    const ref = j.url || j.external_id;
    if (!token || !ref) { skipped++; continue; }
    try {
      const a = employers.ADAPTERS[j.source];
      const r = await doFetch(a.detail(token, ref), { headers: { accept: 'application/json' } });
      if (!r.ok) { failed++; continue; }
      const d = a.parseDetail(await r.json());
      const text = String((d && d.description) || '').trim();
      if (!text) { failed++; continue; }
      const patch = { description: text };
      // A real posted date beats the list endpoint's prose, but never
      // overwrite one we already have with nothing.
      const posted = d.posted_at instanceof Date && !isNaN(d.posted_at.getTime()) ? d.posted_at : null;
      if (posted && !j.posted_at) patch.posted_at = posted;
      await Jobs.update(patch, { where: { id: j.id } });
      filled++;
    } catch (e) {
      failed++;
    }
  }
  return { candidates: need.length, filled, failed, skipped };
}

async function markStale() {
  const cutoff = new Date(Date.now() - STALE_DAYS * 86400000);
  const all = await models.jobs.findAll({});
  const stale = all.filter((j) => new Date(j.last_seen_at) < cutoff);
  return { stale: stale.length, cutoff_days: STALE_DAYS };
}

function adzunaActive() {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

module.exports = {
  dedupeKey, ingest, refreshEmployer, prefilter, markStale, adzunaActive,
  enrichDescriptions, safeDate,
  SOURCES: employers.supportedAts(),
  STALE_DAYS,
};
