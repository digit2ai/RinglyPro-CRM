'use strict';

// =============================================================
// The two agents. Each has a schedule, a cost cap, an
// activity log and a dashboard surface.
//
// GLOBAL CONCURRENCY CEILING (spec section 4): agent runs fan out per
// subscriber inside a ceiling. A thousand tenants must never mean a thousand
// simultaneous LLM calls.
// =============================================================

const { models, scoped } = require('../../models');
const jobsource = require('../jobsource');
const matcher = require('../matcher');
const settingsSvc = require('../settings');
const identity = require('../identity');

const CONCURRENCY = parseInt(process.env.JOBUP_AGENT_CONCURRENCY || '4', 10);

// How much of the shared pool the pre-filter is allowed to see. Keep this
// comfortably AHEAD of the pool: a window the pool has outgrown is the exact
// defect this constant exists to have fixed, and it fails silently.
const POOL_WINDOW = parseInt(process.env.JOBUP_POOL_WINDOW || '25000', 10);

/**
 * The candidate pool, NEWEST FIRST.
 *
 * This was `findAll({ limit: 500 })` with no ORDER BY, which is the bug that
 * quietly capped the whole product. Unordered, Postgres returns heap order —
 * effectively the OLDEST rows — so as the pool grew past 500 the window did not
 * move with it. At 4,541 postings the hunter could see 500 of them, all from
 * the first day of crawling, and every posting ingested each morning since was
 * unreachable to every subscriber. It fails silently: the agent runs, reports
 * success, charges for the scoring, and reports the same verdict daily.
 *
 * Ordering by last_seen_at is what makes the window track the pool instead of
 * the heap. The limit stays, because the pre-filter is O(pool x terms) per
 * tenant per run, but it is now a real ceiling rather than an accidental one.
 */
async function poolWindow() {
  const rows = await models.jobs.findAll({ limit: POOL_WINDOW, order: [['last_seen_at', 'DESC']] });
  // Say it out loud rather than quietly matching against a slice. Silence here
  // is what let the 500-row window go unnoticed for the life of the product.
  if (rows.length >= POOL_WINDOW) {
    console.warn(`[jobup] pool window is FULL at ${POOL_WINDOW} — older postings are not being ` +
                 'matched against. Raise JOBUP_POOL_WINDOW.');
  }
  return rows;
}

async function loadContext(tenantId) {
  const t = scoped('profiles', tenantId);
  const profileRow = await t.findOne({});
  const sRow = await scoped('settings', tenantId).findOne({});
  return {
    profile: (profileRow && profileRow.resume_json) || {},
    sourceText: (profileRow && profileRow.source_text) || '',
    settings: settingsSvc.sanitize((sRow && sRow.settings) || {}),
  };
}

/**
 * Name the subscriber's OWN setting that is doing the excluding.
 *
 * A person whose work-mode preference rules out every posting in their field
 * sees precisely what a person with a broken agent sees: an empty board. Only
 * one of those is fixable by the person looking at it, and they cannot tell
 * which they are in without this sentence.
 */
function filterNote(stats) {
  const d = (stats && stats.dropped) || {};
  const reasons = [
    [d.work_mode, 'your remote/hybrid/on-site preference'],
    [d.excluded_keyword, 'your excluded keywords'],
    [d.must_include, 'your required keywords'],
    [d.employment_type, 'your employment-type filter'],
  ].filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]);

  if (!reasons.length) {
    return ' Nothing in the pool overlaps your skills or role targets yet — try adding the titles employers'
         + ' actually advertise for your work, not only the ones you have held.';
  }
  const [n, why] = reasons[0];
  return ` ${n.toLocaleString()} posting(s) were ruled out by ${why} — widening it is the fastest change you can make.`;
}

async function log(tenantId, agent, status, summary, cost, isSimulated, scored, trigger) {
  return scoped('agent_runs', tenantId).create({
    agent, status, summary, cost_usd: cost || 0, is_simulated: Boolean(isSimulated),
    scored: scored || 0, trigger: trigger || 'scheduled',
  });
}

/**
 * What this subscriber has already spent and scored TODAY, across every run —
 * scheduled or manual.
 *
 * Without this the caps were per INVOCATION, not per day: `jobs_scored_per_day`
 * was applied with slice(0, perDay) on each call despite its name, and the cost
 * cap was min(monthly/30, $0.05) per run. So pressing Run 100 times scored 600
 * jobs for about $2.50 in a single day — roughly nine times annual revenue if
 * repeated — and nothing anywhere said no.
 */
async function usedToday(tenantId, trigger) {
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const runs = await scoped('agent_runs', tenantId).findAll({});
  const today = runs.filter((r) => r.agent === 'hunter' && new Date(r.created_at) >= since);
  const scope = trigger ? today.filter((r) => (r.trigger || 'scheduled') === trigger) : today;
  return {
    spent: scope.reduce((n, r) => n + (Number(r.cost_usd) || 0), 0),
    scored: scope.reduce((n, r) => n + (Number(r.scored) || 0), 0),
    runs: scope.length,
    manual_runs: today.filter((r) => r.trigger === 'manual' && r.status !== 'idle').length,
    all_scored: today.reduce((n, r) => n + (Number(r.scored) || 0), 0),
    all_spent: today.reduce((n, r) => n + (Number(r.cost_usd) || 0), 0),
  };
}

// ---------------------------------------------------------------
// Agent 1 — Opportunity Hunter
// ---------------------------------------------------------------
async function hunter(tenantId, opts = {}) {
  const { profile, settings, sourceText } = await loadContext(tenantId);
  const perDay = (settings.quotas && settings.quotas.jobs_scored_per_day) || 6;
  const dailyBudget = (settings.cost_cap_usd || 8) / 30;   // the monthly cap, per day

  // WHAT ASKED FOR THIS RUN. Each trigger carries its OWN daily allowance:
  // sharing one pool meant whichever ran first spent it, so a subscriber who
  // opened the app after the 07:00 run found the button did nothing.
  const trigger = ['signup', 'scheduled', 'manual'].includes(opts.trigger)
    ? opts.trigger : 'scheduled';

  const used = await usedToday(tenantId, trigger);
  const jobsLeft = Math.max(0, perDay - used.scored);
  const budgetLeft = Math.max(0, dailyBudget - used.spent);

  // One manual search a day. The scheduled run and the signup run are not
  // affected by it, and it is not affected by them.
  const manualCap = (settings.quotas && settings.quotas.manual_runs_per_day) != null
    ? settings.quotas.manual_runs_per_day : 1;
  if (trigger === 'manual' && used.manual_runs >= manualCap) {
    await log(tenantId, 'hunter', 'idle',
      `Manual search already used today (${used.manual_runs} of ${manualCap}). Nothing charged.`,
      0, false, 0, trigger);
    return { agent: 'hunter', scored: 0, cost_usd: 0, manual_limit_reached: true,
             manual_runs_used: used.manual_runs, manual_runs_per_day: manualCap,
             note: `You have used today's manual search. It resets at midnight UTC — and your agent still runs on its own every morning.` };
  }

  if (jobsLeft === 0 || budgetLeft <= 0) {
    await log(tenantId, 'hunter', 'idle',
      `Daily limit reached for ${trigger}: ${used.scored} of ${perDay} scored, ` +
      `$${used.spent.toFixed(4)} of $${dailyBudget.toFixed(4)} spent across ${used.runs} run(s). Nothing charged.`,
      0, false, 0, trigger);
    return { agent: 'hunter', scored: 0, cost_usd: 0, daily_limit_reached: true, trigger,
             used_today: used, jobs_per_day: perDay,
             note: 'That allowance is used up for today. It resets at midnight UTC.' };
  }

  const cap = Math.min(budgetLeft, opts.capUsd || dailyBudget);

  const pool = opts.pool || await poolWindow();
  if (!pool.length) {
    await log(tenantId, 'hunter', 'idle', 'Shared job pool is empty — nothing to score.', 0, false, 0, trigger);
    return { agent: 'hunter', scored: 0, note: 'pool empty' };
  }

  // COST MECHANIC #2 — free deterministic pre-filter before any model call.
  const filterStats = {};
  const ranked = jobsource.prefilter(pool, profile, settings, sourceText, filterStats);

  // Skip anything this tenant has already been CHARGED to look at — filed or
  // not. Reading only job_matches meant below-floor postings were never
  // remembered, so the same handful was re-scored every single day.
  const [existing, ledger] = await Promise.all([
    scoped('job_matches', tenantId).findAll({}),
    scoped('job_scores', tenantId).findAll({}),
  ]);
  const seen = new Set([...existing, ...ledger].map((m) => m.job_id));
  // Spread the day's allowance across employers. A ranked queue alone hands a
  // national employer every slot with one title in six different cities.
  const fresh = jobsource.diversify(ranked.filter((r) => !seen.has(r.job.id))).slice(0, jobsLeft);

  if (!fresh.length) {
    // Distinguish "your targeting matches nothing in the pool" from "we have
    // shown you everything it holds". They look identical from a run count and
    // they need opposite fixes.
    const exhausted = ranked.length > 0;
    await log(tenantId, 'hunter', 'idle', exhausted
      ? `Scored every posting in the pool that matches your targeting (${ranked.length}). Nothing new until fresh openings land.`
      : `No posting in the shared pool matches your targeting.${filterNote(filterStats)}`,
      0, false, 0, trigger);
    return { agent: 'hunter', scored: 0,
             note: exhausted ? 'pool exhausted for this targeting' : 'targeting matches nothing in pool',
             pool_size: pool.length, prefilter_survivors: ranked.length, filters: filterStats };
  }

  const res = await matcher.scoreBatch(fresh.map((r) => r.job), profile, settings,
    { capUsd: cap, limit: jobsLeft });

  // Below the subscriber's floor it was still scored — that cost is already
  // spent — but it does not get filed. This is about inbox noise, not money,
  // and the run summary says how many were held back rather than hiding it.
  const floor = parseInt((settings.targeting && settings.targeting.min_score) || 0, 10) || 0;
  const keep = res.matches.filter((m) => (m.score || 0) >= floor);
  const held = res.matches.length - keep.length;

  for (const m of keep) {
    await scoped('job_matches', tenantId).create({
      job_id: m.job_id, score: m.score, explanation: m.explanation,
      missing: m.missing, stage: 'new', is_simulated: m.is_simulated,
    });
  }

  // The ledger records the spend, not the verdict — so a below-floor posting is
  // never paid for twice.
  const kept = new Set(keep.map((m) => m.job_id));
  for (const m of res.matches) {
    await scoped('job_scores', tenantId).create({
      job_id: m.job_id, score: m.score, filed: kept.has(m.job_id),
    });
  }

  // When NOTHING clears the floor, say how close it got. "6 below your minimum
  // of 70" is unactionable on its own: a best of 68 means lower the floor, a
  // best of 31 means the pool holds nothing in your field.
  const best = res.matches.reduce((n, m) => Math.max(n, m.score || 0), 0);
  const nearMiss = !keep.length && res.matches.length
    ? ` Best was ${best}${best >= floor - 10 ? ' — just under your floor.' : ' — nothing in the pool is close to your field yet.'}`
    : '';

  const simulated = res.matches.some((m) => m.is_simulated);
  await log(tenantId, 'hunter', 'ok',
    `Scored ${res.matches.length} new openings` +
    (held ? `, filed ${keep.length} (${held} below your minimum score of ${floor})` : '') +
    `${res.stopped_for_cap ? ' (stopped at cost cap)' : ''}.${nearMiss}`,
    res.cost_usd, simulated, res.matches.length, trigger);

  return { agent: 'hunter', trigger, scored: keep.length, below_minimum: held, cost_usd: res.cost_usd,
           used_today: { scored: used.scored + res.matches.length, of: perDay,
                         spent: Number((used.spent + (res.cost_usd || 0)).toFixed(5)),
                         of_budget: Number(dailyBudget.toFixed(5)) },
           stopped_for_cap: res.stopped_for_cap, is_simulated: simulated };
}

// ---------------------------------------------------------------
// Agent 2 — Professional Presence Agent
// ---------------------------------------------------------------
async function presence(tenantId) {
  const { profile, settings } = await loadContext(tenantId);
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  const url = sub && sub.address ? `https://${sub.address}` : null;

  const gaps = [];
  if (!profile.headline) gaps.push('No headline — recruiters and search engines both key on it.');
  if (!profile.summary) gaps.push('No professional summary.');
  if (!(profile.skills || []).length) gaps.push('No skills listed — this is what matching scores against.');
  if (!(profile.experience || []).length) gaps.push('No employment history.');
  if (!settingsSvc.pageRoles(settings).length) gaps.push('No role targets set — no indexable role pages will be generated.');

  // ONE SOURCE OF TRUTH: every surface is regenerated from the same record.
  const surfaces = url ? {
    resume_json: identity.resumeJson(profile, settings, { name: profile.name, url }),
    json_ld: identity.personJsonLd(profile, settings, { name: profile.name, url }),
    agent_card: identity.agentCard(profile, settings, { name: profile.name, url, slug: 'me' }),
    llms_txt: identity.llmsTxt(profile, settings, { name: profile.name, url }),
    sitemap: identity.sitemapXml({ url, roles: settingsSvc.pageRoles(settings) }),
    robots: identity.robotsTxt({ url }),
  } : null;

  await scoped('sites', tenantId).update({ health: { checked_at: new Date(), gaps } }, {});

  await log(tenantId, 'presence', 'ok',
    `Profile reviewed. ${gaps.length} gap(s) found. Surfaces regenerated from one source of truth.`, 0, false);

  return { agent: 'presence', gaps, surfaces_regenerated: Boolean(surfaces), url };
}

/** Fan out across tenants inside the global concurrency ceiling. */
async function runAll(agentName, tenantIds, opts = {}) {
  const fn = { hunter, presence }[agentName];
  if (!fn) throw new Error('unknown agent: ' + agentName);

  // One read of the shared pool serves the whole fan-out. It is the same rows
  // for every tenant — re-reading it per subscriber was N full table scans for
  // one answer, and that cost grows with the subscriber count.
  const shared = agentName === 'hunter' ? { pool: await poolWindow() } : {};

  const out = [];
  for (let i = 0; i < tenantIds.length; i += CONCURRENCY) {
    const slice = tenantIds.slice(i, i + CONCURRENCY);
    const res = await Promise.all(slice.map((t) =>
      fn(t, { ...shared, ...opts }).catch((e) => ({ error: e.message, tenant: t }))));
    out.push(...res);
  }
  return out;
}

module.exports = { hunter, presence, runAll, CONCURRENCY, loadContext, usedToday, poolWindow, POOL_WINDOW };
