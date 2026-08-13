'use strict';

/**
 * The daily hunter.
 *
 * Off by default behind CITIJOBS_GO=1; state is visible at /citi-tracker/health
 * and /api/v1/agent/status, never hidden in env.
 *
 * SAFETY, in the order each could go wrong:
 *  1. A DATABASE CLAIM, not an in-process flag. Render runs more than one
 *     instance; without the claim every instance runs the whole thing and bills
 *     for it. Enforced by a unique index on (tenant_id, run_date) for scheduled
 *     runs; manual runs are always allowed.
 *  2. A hard HTTP request budget. Exhausting it STOPS the run and says so.
 *  3. A hard model cost cap, per run.
 *  4. It never applies to anything and never contacts anyone.
 *  5. It may set exactly ONE status automatically — see closeSweep().
 */

const { Op } = require('sequelize');
const { Profile, Req, Tracked, Match, Query, Run } = require('../models');
const workday = require('./workday');
const employers = require('./employers');
const prefilter = require('./prefilter');
const matcher = require('./matcher');
const skills = require('./skills');

const DETAIL_CAP = Number(process.env.CITIJOBS_DETAIL_CAP || 60);
const COST_CAP_CENTS = Number(process.env.CITIJOBS_COST_CAP_USD || 0.5) * 100;

function today() { return new Date().toISOString().slice(0, 10); }
function enabled() { return String(process.env.CITIJOBS_GO || '') === '1'; }

/** Claim the day. Returns the Run row, or null when another instance holds it. */
async function claim(tenant_id, trigger) {
  try {
    return await Run.create({ tenant_id, run_date: today(), trigger: trigger || 'manual' });
  } catch (e) {
    if (e && e.name === 'SequelizeUniqueConstraintError') return null;
    throw e;
  }
}

/** Upsert one posting into the shared pool. */
async function upsertReq(tenant_id, norm, { source = 'agent', employer = 'citi' } = {}) {
  if (!norm || !norm.req_id) return { row: null, created: false };
  let row = await Req.findOne({ where: { tenant_id, employer, req_id: norm.req_id } });
  if (!row) {
    row = await Req.create(Object.assign({ tenant_id, employer, source }, norm));
    return { row, created: true };
  }
  row.last_seen_at = new Date();
  // Only overwrite with better information; a list-only refresh must not blank
  // out the detail fields a previous run paid for.
  for (const k of ['title', 'external_path', 'url_workday', 'location']) {
    if (norm[k] && !row[k]) row[k] = norm[k];
  }
  if (norm.detail_fetched) {
    for (const k of ['address', 'remote_type', 'time_type', 'posted_on', 'close_date',
      'salary_min_cents', 'salary_max_cents', 'salary_source', 'description_text',
      'job_family', 'job_family_group', 'raw']) {
      if (norm[k] !== null && norm[k] !== undefined) row[k] = norm[k];
    }
    row.detail_fetched = true;
    row.feed_status = norm.feed_status || 'open';
  }
  await row.save();
  return { row, created: false };
}

/**
 * Pull the detail payload for requisitions that have never had one.
 *
 * ORDER MATTERS MORE THAN THE CAP. A broad query set surfaces hundreds of new
 * requisitions a day and each detail costs one HTTP request, so taking them
 * newest-first spends the whole budget on Pune postings a US-only profile will
 * never see. The pre-filter runs on title and location alone — no description
 * needed, and free — so it decides which requisitions are worth a request.
 */
async function fillDetails(tenant_id, budget, run, cap = DETAIL_CAP) {
  const candidates = await Req.findAll({
    // Workday needs an external path to fetch detail; Oracle keys off the req id
    // alone, so requiring a path here would silently starve every JPMorgan row.
    where: { tenant_id, detail_fetched: false },
    order: [['first_seen_at', 'DESC']],
    limit: 800
  });
  const profiles = await Profile.findAll({ where: { tenant_id, active: true } });

  const termsByProfile = new Map();
  for (const p of profiles) termsByProfile.set(p.id, await skills.searchTerms(p.id));

  const ranked = [];
  for (const row of candidates) {
    let best = -1;
    let anyAllowed = false;
    for (const p of profiles) {
      const pre = prefilter.score(row, p, termsByProfile.get(p.id));
      if (pre.location_ok) { anyAllowed = true; }
      else {
        // A permanent exclusion, so RECORD IT rather than letting the
        // requisition quietly never appear. Skipping something silently reads
        // as "we looked at everything" when we did not. Title and location are
        // enough to decide this, so it costs no HTTP request and no tokens.
        const had = await Match.findOne({ where: { tenant_id, profile_id: p.id, employer: row.employer, req_id: row.req_id } });
        if (!had) {
          await Match.create({
            tenant_id, profile_id: p.id, employer: row.employer, req_id: row.req_id,
            score: 0, rationale: pre.location_reason || 'outside the profile\'s countries',
            scored_by: 'heuristic', is_simulated: true, cost_cents: 0
          });
        }
      }
      if (pre.score > best) best = pre.score;
    }
    // A requisition no active profile could take is not worth a request. It
    // stays in the pool, unfetched and visible, rather than being deleted.
    if (!anyAllowed) continue;
    ranked.push({ row, best });
  }
  ranked.sort((a, b) => b.best - a.best);
  const pending = ranked.slice(0, cap).map((r) => r.row);
  if (ranked.length > cap) {
    run.notes = [run.notes, `${ranked.length - cap} requisitions deferred to the next run (detail cap ${cap}).`]
      .filter(Boolean).join(' ');
  }

  let filled = 0;
  for (const row of pending) {
    try {
      const emp = employers.get(row.employer);
      const ad = employers.adapterFor(row.employer);
      if (!emp || !ad) continue;   // an employer switched off keeps its rows, unfetched
      // Each adapter is asked for detail in its own dialect: Workday keys off
      // the external path, Oracle off the requisition id.
      const ref = ad.kind === 'oracle' ? row.req_id : row.external_path;
      const detail = await ad.getDetail(ref, { cfg: emp.cfg, budget });
      if (!detail) continue;
      const listShape = ad.kind === 'oracle'
        ? { Id: row.req_id, Title: row.title, PrimaryLocation: row.location }
        : { externalPath: row.external_path, bulletFields: [row.req_id] };
      const norm = ad.normalize(listShape, detail, emp.cfg);
      await upsertReq(tenant_id, norm, { employer: row.employer });
      filled++;
    } catch (e) {
      if (e.budget) { run.budget_hit = true; break; }
      run.errors = (run.errors || []).concat([{ step: 'detail', req_id: row.req_id, error: e.message }]);
    }
  }
  return filled;
}

/**
 * THE ONE AUTOMATIC STATUS CHANGE THIS AGENT IS ALLOWED.
 *
 * A requisition on the board at New or Saved whose posting has left the feed or
 * flipped canApply:false is closed as expired, with a note and a date.
 *
 * It must never auto-advance Applied -> Interview -> Offer, and must never
 * auto-close something already applied to: that outcome comes from a human at
 * Citi, not from a missing row in a JSON feed.
 */
async function closeSweep(tenant_id, budget, run) {
  const open = await Tracked.findAll({
    where: { tenant_id, status: { [Op.in]: ['new', 'saved'] }, archived: false },
    limit: 60
  });
  let closed = 0;
  for (const t of open) {
    const req = await Req.findOne({ where: { tenant_id, employer: t.employer, req_id: t.req_id } });
    if (!req) continue;
    const emp = employers.get(t.employer);
    const ad = employers.adapterFor(t.employer);
    if (!emp || !ad) continue;

    // Re-check the specific requisition rather than inferring absence from a
    // query that simply did not match it today.
    let gone = false;
    try {
      const found = await ad.findByReqId(t.req_id, { cfg: emp.cfg, budget, withDetail: false });
      gone = !found;
      if (!gone && req.feed_status === 'cannot_apply') gone = true;
    } catch (e) {
      if (e.budget) { run.budget_hit = true; break; }
      continue; // a transport error is not evidence that a job is gone
    }
    if (!gone) continue;

    req.feed_status = 'gone_from_feed';
    await req.save();
    t.status = 'closed';
    t.status_reason = 'expired';
    t.status_changed_at = new Date();
    t.notes = [t.notes, `Auto-closed ${today()}: the posting is no longer in Citi's feed.`]
      .filter(Boolean).join('\n');
    await t.save();
    closed++;
  }
  return closed;
}

/** Score and board one profile's fresh candidates. */
async function scoreProfile(tenant_id, profile, run, budgetCents) {
  const tracked = await Tracked.findAll({ where: { tenant_id, profile_id: profile.id }, attributes: ['req_id', 'employer'] });
  const already = new Set(tracked.map((t) => t.employer + ':' + t.req_id));
  const scored = await Match.findAll({ where: { tenant_id, profile_id: profile.id }, attributes: ['req_id', 'employer'] });
  const seen = new Set(scored.map((m) => m.employer + ':' + m.req_id));

  const pool = await Req.findAll({
    where: { tenant_id, detail_fetched: true, feed_status: 'open' },
    order: [['first_seen_at', 'DESC']],
    limit: 400
  });

  const terms = await skills.searchTerms(profile.id);
  const claimable = await skills.claimable(profile.id);

  const candidates = [];
  for (const req of pool) {
    const key = req.employer + ':' + req.req_id;
    if (already.has(key) || seen.has(key)) continue;
    const pre = prefilter.score(req, profile, terms);
    if (!prefilter.shouldScore(pre, profile)) {
      // Still record the deterministic verdict so the pool is explainable and
      // the same requisition is not re-evaluated tomorrow for free.
      await Match.create({
        tenant_id, profile_id: profile.id, employer: req.employer, req_id: req.req_id,
        score: pre.score, rationale: pre.reasons.slice(0, 2).join('; ') || 'below pre-filter floor',
        scored_by: 'heuristic', is_simulated: true, cost_cents: 0
      });
      continue;
    }
    candidates.push(req);
  }

  const { results, spent_cents, capped } = await matcher.scoreBatch(
    candidates, profile, terms, claimable, { capCents: budgetCents }
  );
  if (capped) run.notes = [run.notes, `Model cost cap reached while scoring ${profile.slug}.`].filter(Boolean).join(' ');

  let boarded = 0;
  for (const r of results) {
    const scoredReq = candidates.find((c) => c.req_id === r.req_id);
    await Match.create({
      tenant_id, profile_id: profile.id, employer: (scoredReq && scoredReq.employer) || 'citi', req_id: r.req_id,
      score: r.score, rationale: r.rationale,
      scored_by: r.scored_by, is_simulated: r.is_simulated, model: r.model,
      cost_cents: r.cost_cents || 0
    });
    // A heuristic score and a model score are NOT the same scale, so comparing
    // both to one threshold is a category error: the deterministic score tops
    // out around the 60s on a genuinely strong match, and with no API key that
    // silently produces an empty board on an app that is working correctly.
    // The keyless path therefore boards against its own floor, and the UI says
    // which mode produced each score.
    const floor = r.is_simulated
      ? Math.round((profile.score_threshold || 70) * 0.7)
      : (profile.score_threshold || 70);
    // A requisition whose STATED pay tops out below the floor never reaches
    // the board, however well it scores. Silence about pay is not a reason to
    // exclude — see prefilter.salaryAllowed.
    const reqRow = candidates.find((c) => c.req_id === r.req_id);
    const payOk = !reqRow || prefilter.salaryAllowed(reqRow, profile).ok;
    if (r.score >= floor && payOk) {
      const emp = (scoredReq && scoredReq.employer) || 'citi';
      const exists = await Tracked.findOne({ where: { tenant_id, profile_id: profile.id, employer: emp, req_id: r.req_id } });
      if (!exists) {
        await Tracked.create({
          tenant_id, profile_id: profile.id, employer: emp, req_id: r.req_id,
          status: 'new', source: 'agent'
        });
        boarded++;
      }
    }
  }
  return { scored: results.length, boarded, spent_cents };
}

/** One full pass. */
async function runDaily(tenant_id, { trigger = 'manual', maxRequests, force = false } = {}) {
  if (trigger === 'schedule' && !enabled() && !force) {
    return { skipped: true, reason: 'CITIJOBS_GO is not 1' };
  }
  const run = await claim(tenant_id, trigger);
  if (!run) return { skipped: true, reason: 'another instance already claimed today' };

  const budget = workday.newBudget(maxRequests);
  let costCents = 0;

  try {
    const queries = await Query.findAll({ where: { tenant_id, enabled: true }, order: [['weight', 'DESC']] });
    const profiles = await Profile.findAll({ where: { tenant_id, active: true } });

    let seen = 0, created = 0;
    for (const q of queries) {
      if (budget.hit) break;
      try {
        const emp = employers.get(q.employer);
        const ad = employers.adapterFor(q.employer);
        if (!emp || !ad) continue;      // a query for a switched-off bank is skipped, not guessed at
        const { total, postings } = await ad.listAll({
          searchText: q.search_text, maxPages: q.max_pages || 3, cfg: emp.cfg, budget
        });
        q.last_run_at = new Date();
        q.last_total = total;
        await q.save();
        run.queries_run += 1;

        for (const p of postings) {
          const norm = ad.normalize(p, null, emp.cfg);
          if (!norm.req_id) continue;
          const { created: isNew } = await upsertReq(tenant_id, norm, { employer: q.employer });
          seen++;
          if (isNew) created++;
        }
      } catch (e) {
        if (e.budget) { run.budget_hit = true; break; }
        run.errors = (run.errors || []).concat([{ step: 'query', label: q.label, error: e.message }]);
      }
    }
    run.reqs_seen = seen;
    run.reqs_new = created;

    if (!budget.hit) await fillDetails(tenant_id, budget, run);

    let scoredTotal = 0, boardedTotal = 0;
    for (const profile of profiles) {
      const remaining = Math.max(0, COST_CAP_CENTS - costCents);
      if (remaining <= 0) break;
      const r = await scoreProfile(tenant_id, profile, run, remaining);
      scoredTotal += r.scored;
      boardedTotal += r.boarded;
      costCents += r.spent_cents || 0;
    }
    run.scored = scoredTotal;
    run.boarded = boardedTotal;

    if (!budget.hit) run.closed_swept = await closeSweep(tenant_id, budget, run);

    run.http_requests = budget.used;
    run.budget_hit = run.budget_hit || budget.hit;
    run.cost_cents = costCents;
    run.ok = true;
    run.finished_at = new Date();
    await run.save();

    return {
      ok: true, run_id: run.id, queries_run: run.queries_run, http_requests: run.http_requests,
      reqs_seen: run.reqs_seen, reqs_new: run.reqs_new, scored: run.scored, boarded: run.boarded,
      closed_swept: run.closed_swept, cost_usd: Number((costCents / 100).toFixed(4)),
      budget_hit: run.budget_hit, errors: run.errors || []
    };
  } catch (e) {
    run.ok = false;
    run.finished_at = new Date();
    run.errors = (run.errors || []).concat([{ step: 'run', error: e.message }]);
    run.http_requests = budget.used;
    await run.save();
    throw e;
  }
}

/** Import one requisition by req id or by any URL a human might paste. */
async function importReq(tenant_id, input, { source = 'manual' } = {}) {
  const reqId = workday.reqIdFromInput(input);
  if (!reqId) {
    const e = new Error('No Citi requisition id found in that input. Paste a req id (for example 26974948) or a Workday job URL.');
    e.code = 'NO_REQ_ID';
    throw e;
  }
  const budget = workday.newBudget(6);
  const found = await workday.findByReqId(reqId, { budget });
  if (!found) {
    const e = new Error(`Requisition ${reqId} was not found in Citi's feed. It may have closed.`);
    e.code = 'NOT_FOUND';
    throw e;
  }
  const { row } = await upsertReq(tenant_id, found.normalized, { source });

  // A jobs.citi.com deep link is KEPT when a human pastes one, and never
  // constructed: its Phenom posting id exists nowhere in the Workday payload.
  const careers = emp.key === 'citi' ? workday.citiCareersUrl(input) : null;
  if (careers && row && !row.url_citi_careers) {
    row.url_citi_careers = careers;
    await row.save();
  }
  return row;
}

module.exports = { runDaily, claim, upsertReq, fillDetails, closeSweep, scoreProfile, importReq, enabled, today };
