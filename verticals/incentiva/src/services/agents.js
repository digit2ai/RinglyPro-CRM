'use strict';

/**
 * The background loop for the workflow agents: Rachel (follow-up), Hand-off (no-response alert), the
 * Scheduler (reminders, feedback) and the morning promotion research refresh. Every step claims its rows in the database before sending,
 * so several app instances can run the loop at once without sending twice.
 * The loop runs only in production (NODE_ENV=production) unless INCENTIVA_AGENTS=on, so a local script or
 * the SIT that loads the app never sends from a laptop. INCENTIVA_AGENTS=off stops it anywhere.
 * INCENTIVA_AGENTS_INTERVAL_MIN (5) sets the cadence.
 */

const followup = require('./followup');
const handoff = require('./handoff');
const scheduling = require('./scheduling');
const research = require('./research');

let timer = null;
let lastRun = null;

async function runOnce(tenantId) {
  const out = { at: new Date().toISOString() };
  const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = 'error'; console.error('[incentiva] agents', name, e.message); } };
  await step('refresh_areas', () => followup.refreshAreas(tenantId));
  await step('promo_alerts', () => followup.detectChanges(tenantId));
  await step('followups_sent', () => followup.sendDue(tenantId));
  await step('meeting_messages', () => scheduling.tick(tenantId));
  await step('no_response_alerts', () => handoff.noResponseTick(tenantId));
  // Promotion Researcher + Incentives Reader, every morning. Runs detached: a full refresh takes many minutes,
  // and the date claim in nca_job_runs keeps a second instance or a second tick from running it again.
  out.research_daily = 'checked';
  research.dailyRefresh(tenantId).then((r) => { if (r && r.ran) console.log('[incentiva] morning research', JSON.stringify(r)); }).catch((e) => console.error('[incentiva] morning research', e.message));
  lastRun = out;
  return out;
}

function enabled() {
  if (process.env.INCENTIVA_AGENTS === 'off') return false;
  return process.env.INCENTIVA_AGENTS === 'on' || process.env.NODE_ENV === 'production';
}

function start(tenantId) {
  if (!enabled() || timer) return false;
  const every = Math.max(1, Number(process.env.INCENTIVA_AGENTS_INTERVAL_MIN || 5)) * 60e3;
  timer = setInterval(() => { runOnce(tenantId); }, every);
  setTimeout(() => { runOnce(tenantId); }, 90e3);
  return true;
}

function status() { return { enabled: enabled(), running: !!timer, last_run: lastRun }; }

module.exports = { start, runOnce, status, enabled };
