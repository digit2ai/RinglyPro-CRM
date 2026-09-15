'use strict';

/**
 * The background loop for the three workflow agents: Rachel (follow-up), Hand-off (no-response alert)
 * and the Scheduler (reminders, feedback). Every step claims its rows in the database before sending,
 * so several app instances can run the loop at once without sending twice.
 * The loop runs only in production (NODE_ENV=production) unless INCENTIVA_AGENTS=on, so a local script or
 * the SIT that loads the app never sends from a laptop. INCENTIVA_AGENTS=off stops it anywhere.
 * INCENTIVA_AGENTS_INTERVAL_MIN (5) sets the cadence.
 */

const followup = require('./followup');
const handoff = require('./handoff');
const scheduling = require('./scheduling');

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
