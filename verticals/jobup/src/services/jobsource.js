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
const geo = require('./geo');
const { models } = require('../models');

const STALE_DAYS = 30;
// How long a posting stays worth re-asking for body text. Matched to the stale
// window: past it the posting is leaving the pool anyway.
const ENRICH_MAX_AGE_DAYS = parseInt(process.env.JOBUP_ENRICH_MAX_AGE_DAYS || String(STALE_DAYS), 10);

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

  // ---- WORK MODE IS A PREFERENCE. ONLY "REMOTE ONLY" IS A CONSTRAINT. -----
  //
  // The control is labelled "Remote preference" and offers "Hybrid or remote".
  // It was implemented as a hard exclusion, so choosing it silently deleted
  // every on-site posting — which for anyone in field sales, trades, clinical
  // work or hospitality is the entire job market. One subscriber's choice of
  // "Hybrid or remote" removed 3,281 postings and took her local shortlist from
  // 81 to 7 without a word anywhere.
  //
  // Someone who says "hybrid" is telling us they will come into an office. That
  // is a ranking signal, not a veto. "Remote only" IS a veto — a person who
  // cannot commute means it literally — so that one still filters. Anything
  // else ranks: preferred modes score higher and everything stays visible.
  //
  // Because it reads the same stored field, this repairs every existing
  // subscriber on their next run without editing anyone's stated preference.
  let modes = (targeting.work_modes || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  if (!modes.length && targeting.remote_preference && targeting.remote_preference !== 'any') {
    modes = targeting.remote_preference === 'hybrid'
      ? ['hybrid', 'remote']            // the option reads "hybrid or remote"
      : [targeting.remote_preference];
  }
  // A hard filter ONLY where the subscriber has ruled everything else out.
  const strictModes = (modes.length === 1 && modes[0] === 'remote') || targeting.work_mode_strict === true;
  const types = (targeting.employment_types || []).map((x) => String(x).toLowerCase()).filter(Boolean);

  // ---- WHERE THEY ACTUALLY LIVE, AS A RANKING SIGNAL --------------------
  //
  // geo.js owns the hard rules, and it is deliberately lenient: a location it
  // cannot parse is FLAGGED, never dropped. That is right, but it means a
  // station-code location like "WTSP-TV Tampa" or "KIII-TV Corpus Christi"
  // carries no state at all and every market ranks identically. A national
  // employer posting the same title in twenty cities then fills the whole
  // queue in arbitrary order — and at six scorings a day the subscriber spends
  // their week on Corpus Christi and San Angelo while the opening in their own
  // city waits at position thirteen.
  //
  // Their home city and state are already on file. Matching them is free, and
  // it only ever promotes: nothing is excluded for being elsewhere, because a
  // remote-national role is takeable from anywhere.
  const home = new Set();
  const profLoc = String((profile || {}).location || '').toLowerCase();
  const city = profLoc.split(',')[0].trim();
  if (city.length > 3) home.add(city);
  for (const st of ((settings || {}).geo || {}).allowed_states || []) {
    const code = String(st).toLowerCase();
    if (geo.STATE_NAMES[code]) { home.add(geo.STATE_NAMES[code].toLowerCase()); home.add(', ' + code); }
  }

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
    let modeHit = 0;
    if (modes.length && modes.length < 3 && hasText) {
      const where = `${location} ${hay}`;
      const isRemote = /\bremote\b|\bwork from home\b|\bwfh\b|\bfully distributed\b/.test(where);
      const isHybrid = /\bhybrid\b/.test(where);
      const isOnsite = /\bon[- ]?site\b|\bin[- ]office\b|\bin person\b/.test(where);
      const stated = isRemote || isHybrid || isOnsite;
      const wants = (modes.includes('remote') && isRemote)
                 || (modes.includes('hybrid') && isHybrid)
                 || (modes.includes('onsite') && (isOnsite || !stated));
      // Remote-only is a constraint and still filters. Everything else ranks:
      // a posting in a mode you asked for scores higher, and one that is not
      // stays on the list where you can see and judge it.
      if (wants) modeHit = 3;
      else if (strictModes) { drop.work_mode++; continue; }
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

    // Their own city or state, read off the location only — never the body, or
    // every posting that merely mentions Florida ranks as if it were in it.
    const homeHit = home.size && [...home].some((h) => location.includes(h)) ? 5 : 0;

    const prescore = hits + titleHits * 2 + employerHits * 3 + seniorityHit
                   + locationHit + typeHit + modeHit + homeHit;
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
async function enrichDescriptions({ limit = 200, fetchImpl, maxAgeDays = ENRICH_MAX_AGE_DAYS } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  const Jobs = models.jobs;
  const all = await Jobs.findAll({});

  // GIVE UP ON A POSTING THAT WILL NEVER YIELD ONE.
  //
  // Some detail endpoints simply refuse us — a posting pulled and never
  // enriched on day one is not going to enrich on day ninety. Without a bound
  // those rows sit at the head of the candidate list and are re-requested on
  // every refresh forever: 357 wasted HTTP calls a day, growing with the pool,
  // and they crowd out postings that WOULD enrich. A posting older than the
  // stale window is on its way out of the pool anyway, so the cutoff costs
  // nothing real and the waste stops growing.
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const need = all
    .filter((j) => !String(j.description || '').trim())
    .filter((j) => employers.ADAPTERS[j.source] && employers.ADAPTERS[j.source].detail)
    // An unknown age is not an old age. A row with no dates on it is tried,
    // not silently written off — the bound exists to stop provable waste, not
    // to discard anything we cannot date.
    .filter((j) => {
      const seen = new Date(j.first_seen_at || j.last_seen_at || 0).getTime();
      return !seen || isNaN(seen) ? true : seen >= cutoff;
    })
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

/**
 * Spread a ranked queue across employers without disturbing who is best.
 *
 * A national employer posts one title in twenty markets, so a purely ranked
 * queue is twenty near-identical rows from one company. Against a quota of six
 * scorings a day that is the subscriber's entire week spent on one employer —
 * and five of those six are the same job in a city they do not live in.
 *
 * Round-robin by employer, best-first within each. The top-ranked posting still
 * comes first, so nothing better is ever demoted below something worse; what
 * changes is that positions two through six come from different companies.
 */
function diversify(ranked) {
  const byEmployer = new Map();
  for (const r of ranked || []) {
    const k = String((r.job && r.job.employer) || '').toLowerCase() || '(none)';
    if (!byEmployer.has(k)) byEmployer.set(k, []);
    byEmployer.get(k).push(r);
  }
  // Employers ordered by their single best posting, so the overall winner leads.
  const queues = [...byEmployer.values()]
    .sort((a, b) => b[0].prescore - a[0].prescore);

  const out = [];
  for (let round = 0; out.length < (ranked || []).length; round++) {
    let moved = false;
    for (const q of queues) {
      if (q[round] !== undefined) { out.push(q[round]); moved = true; }
    }
    if (!moved) break;
  }
  return out;
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
  enrichDescriptions, safeDate, diversify,
  SOURCES: employers.supportedAts(),
  STALE_DAYS,
};
