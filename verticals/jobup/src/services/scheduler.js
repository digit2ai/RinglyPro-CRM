'use strict';

// =============================================================
// The daily run.
//
// Until now the agents only fired on demand and once at provisioning, while
// the teaser told every visitor that the agents would work for them "around
// the clock, every day". That was a promise the product could not keep. This
// keeps it.
//
// OFF BY DEFAULT (JOBUP_AGENTS_GO=1). State is visible at
// GET /jobup/health and GET /api/v1/engine/schedule — never hidden in env.
//
// SAFETY, in order of how badly each could go wrong:
//   1. Only ACTIVE subscribers run. A cancelled account costs nothing.
//   2. Each subscriber's own cost cap applies — the Hunter already divides
//      their monthly cap by 30 and stops mid-batch rather than overspending.
//   3. A global concurrency ceiling. A thousand tenants must never mean a
//      thousand simultaneous model calls.
//   4. A DATABASE CLAIM, not an in-process flag. Render can run more than one
//      instance; without this every instance would run the whole fleet on the
//      same day and bill for it.
//   5. Nothing here mails anyone. The agents find and check; the subscriber
//      decides and acts.
// =============================================================

const { models } = require('../models');
const agents = require('./agents');
const employers = require('./employers');
const limits = require('./limits');

const TICK_MS = parseInt(process.env.JOBUP_TICK_MS || String(15 * 60 * 1000), 10);
const POOL_REFRESH_HOURS = parseInt(process.env.JOBUP_POOL_REFRESH_HOURS || '24', 10);

/**
 * The hour (UTC) the daily run is allowed to start.
 *
 * Without this the run happened at "whatever time the first tick after
 * midnight UTC lands", which was an accident of when the process booted, and
 * would have shifted an hour twice a year with daylight saving.
 *
 * Default 07:00 UTC = 3am US Eastern / midnight Pacific. Matches are waiting
 * before the working day starts, and we fetch seventeen job boards while they
 * are quiet rather than mid-morning.
 *
 * It is a FLOOR, not an appointment: if the service is down at that hour the
 * run still happens on the next tick after it comes back, so a restart cannot
 * cost a subscriber a day.
 */
const RUN_HOUR_UTC = Math.max(0, Math.min(23,
  parseInt(process.env.JOBUP_RUN_HOUR_UTC || '7', 10) || 0));

let timer = null;
let lastTick = null;
let lastRun = null;
let running = false;

function enabled() {
  return process.env.JOBUP_AGENTS_GO === '1';
}

function dayKey(d = new Date()) {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Claim today's run in the DATABASE so only one instance does the work.
 * Uses the audit log rather than a new table: the claim IS an auditable event.
 * Returns true if this process won the claim.
 */
async function claimDay(kind) {
  const action = `schedule:${kind}:${dayKey()}`;
  const existing = await models.audit_log.findOne({ where: { action } });
  if (existing) return false;
  try {
    await models.audit_log.create({
      tenant_id: null, actor: 'scheduler', action,
      reason: `claimed by pid ${process.pid}`,
    });
  } catch (e) {
    return false;   // a unique-violation race means another instance won
  }
  // Re-read: if two instances inserted in the same instant, the lower id wins.
  const rows = await models.audit_log.findAll({ where: { action } });
  if (rows.length > 1) {
    const mine = rows.find((r) => String(r.reason || '').includes(`pid ${process.pid}`));
    const winner = rows.reduce((a, b) => (a.id <= b.id ? a : b));
    if (!mine || mine.id !== winner.id) return false;
  }
  return true;
}

/** Re-fetch every LIVE employer board into the shared pool. */
async function refreshPool() {
  const all = await models.employers.findAll({});
  const live = all.filter((e) => e.status === 'live');
  let added = 0; let refreshed = 0; const errors = [];

  for (const e of live) {
    let res;
    try {
      res = await employers.fetchBoard(e.ats, e.token, { verified: true, cap: 200 });
    } catch (err) { errors.push(`${e.name}: ${err.message}`); continue; }
    if (!res.ok || !res.postings.length) continue;

    for (const p of res.postings) {
      if (!p.title) continue;
      const dedupe_key = `${e.ats}:${e.token}:${p.external_id || p.title}`.slice(0, 250);
      const existing = await models.jobs.findOne({ where: { dedupe_key } });
      if (existing) {
        // last_seen_at is how a stale posting is later identified as gone.
        await models.jobs.update({ last_seen_at: new Date() }, { where: { id: existing.id } });
        refreshed++;
        continue;
      }
      await models.jobs.create({
        source: e.ats, external_id: String(p.external_id || ''), employer: e.name,
        title: String(p.title).slice(0, 250), location: String(p.location || '').slice(0, 250),
        url: p.url || '', description: String(p.description || '').slice(0, 20000),
        compensation: p.compensation || null,
        posted_at: p.posted_at ? new Date(p.posted_at) : null,
        dedupe_key,
      });
      added++;
    }
    await models.employers.update({ last_fetched_at: new Date() }, { where: { id: e.id } });
  }
  return { boards: live.length, added, refreshed, errors };
}

/** Fan the Hunter (and Presence) across every active subscriber. */
async function runFleet() {
  const subs = await models.subscribers.findAll({ where: { status: 'active' } });
  const ids = subs.map((s) => s.id);
  if (!ids.length) return { subscribers: 0, results: [] };

  const hunted = await agents.runAll('hunter', ids, { trigger: 'scheduled' });
  const seen = await agents.runAll('presence', ids);

  const scored = hunted.reduce((n, r) => n + ((r && r.scored) || 0), 0);
  const cost = hunted.reduce((n, r) => n + ((r && r.cost_usd) || 0), 0);
  return {
    subscribers: ids.length,
    scored,
    cost_usd: Number(cost.toFixed(5)),
    presence_checked: seen.filter(Boolean).length,
    concurrency: agents.CONCURRENCY,
  };
}

/** One tick. Cheap and idempotent — it usually decides there is nothing to do. */
async function tick() {
  lastTick = new Date();
  if (!enabled() || running) return null;
  running = true;
  const started = Date.now();
  const out = { at: lastTick, pool: null, fleet: null, retention: null, skipped: null };

  try {
    if (new Date().getUTCHours() < RUN_HOUR_UTC) {
      out.skipped = `before the run hour (${RUN_HOUR_UTC}:00 UTC)`;
      return out;
    }
    // Pool first: scoring against yesterday's postings is the wrong order.
    if (await claimDay('pool')) {
      out.pool = await refreshPool();
    }
    if (await claimDay('fleet')) {
      out.fleet = await runFleet();
      // The retention helper has existed since day one with nothing calling it.
      try { out.retention = await limits.runRetention(); } catch (e) { out.retention = { error: e.message }; }
    }
    if (!out.pool && !out.fleet) out.skipped = 'already done today';
  } catch (e) {
    out.error = e.message;
    console.error('[jobup scheduler] tick failed:', e.message);
  } finally {
    running = false;
  }
  if (out.skipped && !out.pool && !out.fleet) { out.ms = Date.now() - started; return out; }

  out.ms = Date.now() - started;
  if (out.pool || out.fleet) {
    lastRun = out;
    console.log('[jobup scheduler]', JSON.stringify({
      pool: out.pool && { added: out.pool.added, refreshed: out.pool.refreshed },
      fleet: out.fleet, ms: out.ms,
    }));
  }
  return out;
}

function start() {
  if (timer) return { started: false, reason: 'already running' };
  if (!enabled()) {
    console.log('[jobup] scheduler OFF — set JOBUP_AGENTS_GO=1 to run agents daily');
    return { started: false, reason: 'JOBUP_AGENTS_GO is not 1' };
  }
  // A first tick shortly after boot, then every TICK_MS. The day-claim makes
  // frequent ticks harmless: whoever wins does the work, everyone else no-ops.
  setTimeout(() => { tick().catch(() => {}); }, 60 * 1000);
  timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  if (timer.unref) timer.unref();
  console.log(`[jobup] scheduler ON — tick every ${Math.round(TICK_MS / 60000)} min, one run per day after ${RUN_HOUR_UTC}:00 UTC`);
  return { started: true, tick_ms: TICK_MS };
}

function status() {
  return {
    enabled: enabled(),
    running,
    tick_ms: TICK_MS,
    run_hour_utc: RUN_HOUR_UTC,
    next_run_after: `${String(RUN_HOUR_UTC).padStart(2, '0')}:00 UTC daily`,
    pool_refresh_hours: POOL_REFRESH_HOURS,
    last_tick: lastTick,
    last_run: lastRun,
    note: enabled()
      ? 'Agents run once per day. On-demand runs are always available.'
      : 'OFF. Agents only run when you press a button. Set JOBUP_AGENTS_GO=1 for the daily run.',
  };
}

module.exports = { start, tick, status, enabled, refreshPool, runFleet, claimDay, dayKey, RUN_HOUR_UTC };
