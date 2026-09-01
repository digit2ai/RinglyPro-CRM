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
const geo = require('../geo');
const matcher = require('../matcher');
const settingsSvc = require('../settings');
const brain = require('../brain');
const identity = require('../identity');
const ent = require('../entitlements');

const CONCURRENCY = parseInt(process.env.JOBUP_AGENT_CONCURRENCY || '4', 10);

// How much of the shared pool the pre-filter is allowed to see. Keep this
// comfortably AHEAD of the pool: a window the pool has outgrown is the exact
// defect this constant exists to have fixed, and it fails silently.
const POOL_WINDOW = parseInt(process.env.JOBUP_POOL_WINDOW || '25000', 10);

// A candidate counts as STRONG at this fraction of the subscriber's own best
// pre-filter score, and strong candidates are worked through at CATCHUP_PER_RUN
// rather than at the daily rate. See the backlog block in hunter().
const PRIORITY_FRACTION = parseFloat(process.env.JOBUP_PRIORITY_FRACTION || '0.5');
const CATCHUP_PER_RUN = parseInt(process.env.JOBUP_CATCHUP_PER_RUN || '40', 10);
const ADMIN_BASELINE = parseInt(process.env.JOBUP_ADMIN_RUN_JOBS || '12', 10);

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

  // WHAT ASKED FOR THIS RUN. Each trigger carries its OWN daily allowance:
  // sharing one pool meant whichever ran first spent it, so a subscriber who
  // opened the app after the 07:00 run found the button did nothing.
  //
  // 'admin' is the operator's own bucket. A support run must never consume the
  // allowance the subscriber is about to use, and must not be refused because
  // this morning's scheduled run already spent theirs — that is exactly the
  // moment somebody is trying to fix something for them. It is still capped,
  // still costs real money, and is recorded under its own trigger so it can
  // never be mistaken for the subscriber's own activity.
  const trigger = ['signup', 'scheduled', 'manual', 'admin'].includes(opts.trigger)
    ? opts.trigger : 'scheduled';
  const isAdmin = trigger === 'admin';

  // An operator run has no number attached to it: the backlog rule below picks
  // one. ADMIN_BASELINE is only what it falls back to when there is no backlog
  // at all, and opts.limit stays available for a script that genuinely needs a
  // specific count — the console deliberately does not offer it.
  // TIER-RANKED SCAN (the fix for "Search surfaced more strong matches than
  // Landed"). A tiered account scans its plan's daily breadth (Free 8 < Search
  // 40 < Landed 120), so on the same resume a higher tier always evaluates at
  // least as much of the pool and can only surface MORE strong matches, never
  // fewer. Legacy accounts (no plan) keep their settings-driven number.
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  const tierScan = ent.hunterScanFor(sub);            // null for legacy
  const settingsPerDay = (settings.quotas && settings.quotas.jobs_scored_per_day) || 6;
  const perDay = isAdmin
    ? Math.max(1, Math.min(50, parseInt(opts.limit, 10) || ADMIN_BASELINE))
    : (tierScan != null ? tierScan : settingsPerDay);
  const subEnt = ent.entitlementForSub(sub);
  const priorityScoring = Boolean(subEnt.caps && subEnt.caps.priority_scoring);
  // Free scans at its flat daily rate (no backlog burst) to keep its cost low;
  // paid and legacy accounts keep the catch-up. Admin runs always catch up.
  const catchupAllowed = isAdmin || subEnt.legacy || subEnt.effective_plan !== 'free';
  // TIER-RANKED DAILY BUDGET. Without this the shared monthly cap flattens every
  // tier to the same ~$0.27/day (~22 jobs), so the tier scan above never bit and
  // Landed could file no more than Search. A tiered account gets its plan's
  // budget (Free $0.10 < Search $0.60 < Landed $1.80 a day); legacy keeps the
  // settings-driven monthly cap.
  const tierBudget = ent.hunterBudgetFor(sub);
  const dailyBudget = isAdmin
    ? (settings.cost_cap_usd || 8) / 30
    : (tierBudget != null ? tierBudget : (settings.cost_cap_usd || 8) / 30);

  const used = await usedToday(tenantId, trigger);
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

  // COUNTRY/STATE POLICY BEFORE THE SLICE, NOT AFTER IT.
  //
  // scoreBatch also checks geo and skips a blocked posting — free, no model
  // call — but by then the row has already taken a slot out of the day's
  // allowance. And a blocked row is never ledgered, because it was never
  // scored, so it stays at the head of the queue and takes a slot again
  // tomorrow, and the day after that, for as long as the policy stands.
  //
  // For a subscriber who searches one state that is not a rounding error:
  // 2,809 of 5,581 queued postings were out-of-state, 16 of every 40 slots
  // went to rows that could not be scored, and a run that promised 40 scored
  // 18. Filtering here spends the whole allowance on postings that can
  // actually be scored, and makes this queue the same one /diagnose reports.
  const scoreable = ranked.filter((r) => {
    if (seen.has(r.job.id)) return false;
    // Never spend a scoring slot on a posting that cannot be opened — a match
    // whose "Open posting" dead-ends never reaches the board anyway.
    const u = r.job && r.job.url;
    if (!(typeof u === 'string' && /^https?:\/\//i.test(u.trim()))) return false;
    return geo.evaluate(r.job.location, settings.geo || {}).verdict !== geo.VERDICT.BLOCK;
  });

  // Spread across employers. A ranked queue alone hands a national employer
  // every slot with one title in six different cities.
  const queue = jobsource.diversify(scoreable);

  // ---- CLEAR THE STRONG BACKLOG, THEN PACE ------------------------------
  //
  // A flat jobs-per-day rate rations the good matches at exactly the same
  // speed as the weak ones. A subscriber whose queue holds 83 strong
  // candidates and 2,700 marginal ones met the strong ones at six a day —
  // a fortnight to reach the end of the jobs that were obviously hers, while
  // the same six-a-day would still be grinding through the marginal tail two
  // years later. The value in a ranked queue is not spread evenly, so the
  // allowance should not be either.
  //
  // THE THRESHOLD IS RELATIVE TO THIS SUBSCRIBER, not a global number.
  // A pre-filter score counts term overlap, so a résumé listing 22 skills
  // scores far higher than one listing five. A fixed "8 or better" would empty
  // one person's backlog on day one and never trigger for the next. Half of
  // their own best candidate travels across profiles; a fixed number does not.
  // plan() is the SINGLE source for the allowance number — /diagnose publishes
  // it and the run scores exactly it, so the screen never disagrees with the
  // run. priorityScoring lifts the catch-up ceiling for the Landed tier.
  const pl = plan(queue, perDay, priorityScoring, catchupAllowed);
  const strong = pl.strong_backlog;
  const allowance = pl.allowance;
  const jobsLeft = Math.max(0, allowance - used.scored);

  if (jobsLeft === 0 || budgetLeft <= 0) {
    await log(tenantId, 'hunter', 'idle',
      `Daily limit reached for ${trigger}: ${used.scored} of ${allowance} scored, ` +
      `$${used.spent.toFixed(4)} of $${dailyBudget.toFixed(4)} spent across ${used.runs} run(s). Nothing charged.`,
      0, false, 0, trigger);
    return { agent: 'hunter', scored: 0, cost_usd: 0, daily_limit_reached: true, trigger,
             used_today: used, jobs_per_day: allowance,
             note: 'That allowance is used up for today. It resets at midnight UTC.' };
  }

  const cap = Math.min(budgetLeft, opts.capUsd || dailyBudget);
  const fresh = queue.slice(0, jobsLeft);

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

  // A HEURISTIC SCORE AND A MODEL SCORE ARE NOT THE SAME SCALE, AND MUST NOT
  // SHARE A FLOOR.
  //
  // With no model the fallback counts keyword overlap and tops out in the
  // teens; the model judges fit and lands between 28 and 92 on the same
  // profiles. Compared against one min_score, a keyword count of 12 was filed
  // onto a paying subscriber's board next to a real 92 — six of them, on an
  // account that had been through a keyless run.
  //
  // They were correctly LABELLED simulated, and the label is not the problem:
  // a keyword count is not a match, however it is badged. So they are scored
  // (the run still learns what it looked at) and not filed, and the summary
  // says the model was missing rather than reporting an empty morning.
  const usable = res.matches.filter((m) => !m.is_simulated);
  const keep = usable.filter((m) => (m.score || 0) >= floor);
  const heuristicHeld = res.matches.length - usable.length;
  const held = usable.length - keep.length;

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
  const bestScore = usable.reduce((n, m) => Math.max(n, m.score || 0), 0);
  const nearMiss = !keep.length && usable.length
    ? ` Best was ${bestScore}${bestScore >= floor - 10 ? ' — just under your floor.' : ' — nothing in the pool is close to your field yet.'}`
    : '';

  const simulated = res.matches.some((m) => m.is_simulated);
  await log(tenantId, 'hunter', 'ok',
    `Scored ${res.matches.length} new openings` +
    (held ? `, filed ${keep.length} (${held} below your minimum score of ${floor})` : '') +
    (heuristicHeld
      ? `. ${heuristicHeld} could not be judged — no language model was available, so they were `
        + 'not filed. Keyword overlap is not a fit score and does not belong on your board'
      : '') +
    `${res.stopped_for_cap ? ' (stopped at cost cap)' : ''}.${nearMiss}`,
    res.cost_usd, simulated, res.matches.length, trigger);

  return { agent: 'hunter', trigger, scored: keep.length, below_minimum: held, cost_usd: res.cost_usd,
           strong_backlog: Math.max(0, strong - res.matches.length),
           used_today: { scored: used.scored + res.matches.length, of: allowance,
                         spent: Number((used.spent + (res.cost_usd || 0)).toFixed(5)),
                         of_budget: Number(dailyBudget.toFixed(5)) },
           stopped_for_cap: res.stopped_for_cap, is_simulated: simulated };
}

// ---------------------------------------------------------------
// Agent 2 — Professional Presence Agent
// ---------------------------------------------------------------
/**
 * Teach an account what employers call its work, if onboarding could not.
 *
 * The widening runs at signup, but it needs a model and a model can be down or
 * unconfigured at that exact moment. A signup must never fail for that, so it
 * records whether it happened — and this finishes the job on the next daily
 * run. That is what makes the step MANDATORY rather than best-effort: an
 * account cannot end up permanently searching on the titles it has held.
 *
 * Once per account, then never again: the flag is set even when the model has
 * nothing to add, so this cannot become a daily model call per subscriber.
 */
async function widenRolesIfNeeded(tenantId, settings) {
  if (!settings.targeting || settings.targeting.roles_widened) return null;
  if (!brain.enabled()) return null;            // no model — try again tomorrow

  const row = await scoped('settings', tenantId).findOne({});
  const profRow = await scoped('profiles', tenantId).findOne({});
  if (!row || !profRow) return null;

  let mt;
  try { mt = await require('../resume').marketTitles(profRow.resume_json || {}); }
  catch (e) { return null; }                     // transient — try again tomorrow
  if (!mt || mt.is_simulated) return null;

  const cur = settingsSvc.sanitize(row.settings);
  const existing = (cur.targeting.roles || []).map((r) => r.title).filter(Boolean);
  const have = new Set(existing.map((t) => t.toLowerCase()));
  const added = (mt.titles || []).filter((t) => !have.has(String(t).toLowerCase()));

  const next = settingsSvc.sanitize({ ...cur, targeting: { ...cur.targeting,
    roles: existing.concat(added).map((t) => ({ title: t })) } });
  next.targeting.roles_widened = true;           // set even when nothing was added
  await scoped('settings', tenantId).update({ settings: next }, { id: row.id });
  return added;
}

async function presence(tenantId) {
  const { profile, settings } = await loadContext(tenantId);
  const sub = await models.subscribers.findOne({ where: { id: tenantId } });
  const url = sub && sub.address ? `https://${sub.address}` : null;

  const widened = await widenRolesIfNeeded(tenantId, settings);

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
    `Profile reviewed. ${gaps.length} gap(s) found. Surfaces regenerated from one source of truth.`
    + (widened && widened.length
      ? ` Role targets widened to the titles employers post: ${widened.join(', ')}.` : ''),
    0, false);

  return { agent: 'presence', gaps, surfaces_regenerated: Boolean(surfaces), url,
           roles_widened: widened || [] };
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

/**
 * What a run WOULD do, without doing it.
 *
 * The operator screen used to ask "how many jobs?" and then ignore the answer
 * whenever a backlog was present — the box read 12 while the run scored 40. A
 * control that does not control is worse than no control, so the number is the
 * agent's to decide and this is how the screen states that decision before the
 * button is pressed.
 */
function plan(queue, perDay, priority, catchup) {
  const best = queue.length ? queue[0].prescore : 0;
  const strongFloor = Math.max(2, Math.ceil(best * PRIORITY_FRACTION));
  const strong = queue.filter((r) => r.prescore >= strongFloor).length;
  // Catch-up clears a strong backlog fast, but it also lets a run burst well past
  // its daily scan — which is cost we do NOT want to spend on the Free tier. So
  // Free (catchup === false) scans at its flat daily rate and drains slowly;
  // paid and legacy accounts keep the burst. Priority scoring (Landed) clears at
  // a higher ceiling than Search. `catchup` defaults to on for back-compat.
  const allowCatchup = catchup !== false;
  const ceiling = priority ? Math.round(CATCHUP_PER_RUN * 1.5) : CATCHUP_PER_RUN;
  const raw = (allowCatchup && strong > 0) ? Math.max(perDay, Math.min(ceiling, strong)) : perDay;
  const allowance = Math.min(raw, queue.length);
  return {
    allowance,
    strong_backlog: strong,
    strong_floor: strongFloor,
    catching_up: strong > 0 && raw > perDay,
    runs_to_drain: allowance ? Math.ceil(strong / allowance) : 0,
  };
}

module.exports = { hunter, presence, runAll, CONCURRENCY, loadContext, usedToday,
                   poolWindow, POOL_WINDOW, plan, PRIORITY_FRACTION, CATCHUP_PER_RUN };
