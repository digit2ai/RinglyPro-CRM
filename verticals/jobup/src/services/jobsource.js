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

// Upsert postings into the shared pool. Returns counts, never throws into a request.
async function ingest(postings, { source, employer }) {
  const Jobs = models.jobs;
  let added = 0, refreshed = 0, reposts = 0;

  for (const p of postings || []) {
    const key = dedupeKey({ ...p, employer });
    const existing = await Jobs.findOne({ where: { dedupe_key: key } });
    if (existing) {
      await Jobs.update({ last_seen_at: new Date() }, { where: { id: existing.id } });
      refreshed++;
      if (existing.external_id && p.external_id && existing.external_id !== p.external_id) reposts++;
      continue;
    }
    await Jobs.create({
      source, external_id: p.external_id || null, employer,
      title: p.title || null, location: p.location || null, url: p.url || null,
      description: p.description || '', compensation: p.compensation || null,
      posted_at: p.posted_at ? new Date(p.posted_at) : null,
      dedupe_key: key, first_seen_at: new Date(), last_seen_at: new Date(),
    });
    added++;
  }
  return { added, refreshed, reposts, total: (postings || []).length };
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

function prefilter(jobs, profile, settings, rawText) {
  const targeting = (settings || {}).targeting || {};
  const titles = (targeting.roles || []).map((r) => String(r.title || '').toLowerCase()).filter(Boolean);
  const industries = (targeting.industries || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const wantEmployers = (targeting.employers || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const must = (targeting.must_include || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const never = (targeting.exclude_keywords || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const remotePref = targeting.remote_preference || null;
  const seniority = String(targeting.seniority || '').toLowerCase();

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

  const scored = [];
  for (const j of (jobs || [])) {
    const title = String(j.title || '').toLowerCase();
    const employer = String(j.employer || '').toLowerCase();
    const location = String(j.location || '').toLowerCase();
    const hay = `${title} ${String(j.description || '').toLowerCase()}`;

    // ---- FREE EXCLUSIONS, before anything is counted or spent ----
    // A word you never want to see costs nothing to check and saves a whole
    // model call. This runs before scoring for exactly that reason.
    if (never.length && never.some((w) => hay.includes(w) || employer.includes(w))) continue;

    // A must-have term is a requirement, not a preference.
    if (must.length && !must.every((w) => hay.includes(w))) continue;

    // Remote preference, read off the location string.
    if (remotePref && remotePref !== 'any') {
      const isRemote = /\bremote\b|\bwork from home\b|\bwfh\b|\bdistributed\b/.test(location);
      const isHybrid = /\bhybrid\b/.test(location);
      if (remotePref === 'remote' && !isRemote) continue;
      if (remotePref === 'onsite' && isRemote && !isHybrid) continue;
      // 'hybrid' accepts hybrid or remote — someone open to hybrid is open to
      // remote too, and excluding it would drop the better offer.
    }

    let hits = 0;
    for (const t of terms) if (t.length > 2 && hay.includes(t)) hits++;

    // Title matches count double — a title hit is a far stronger signal.
    const titleHits = titles.filter((t) => t && title.includes(t)).length;
    // An employer you named is a strong signal too.
    const employerHits = wantEmployers.filter((e) => e && employer.includes(e)).length;
    // Seniority is a nudge, not a gate: titles word it too many ways to filter on.
    const seniorityHit = seniority && title.includes(seniority) ? 1 : 0;

    const prescore = hits + titleHits * 2 + employerHits * 3 + seniorityHit;
    if (prescore > 0) scored.push({ job: j, prescore });
  }

  return scored.sort((a, b) => b.prescore - a.prescore);
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
  SOURCES: employers.supportedAts(),
  STALE_DAYS,
};
