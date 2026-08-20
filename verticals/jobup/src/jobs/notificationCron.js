'use strict';

// =============================================================
// Hourly job-match notification tick.
//
// JobUp runs on a single Render web service with an in-process scheduler (see
// services/scheduler.js) rather than a separate Render Cron service — so this
// "cron" is invoked once per scheduler tick and gates itself to the top of each
// hour via the notifier's own audit-log claim. That keeps the multi-instance
// safety (one claim per hour) without provisioning a second Render service.
//
// OFF by default: set JOBUP_NOTIFY_GO=1 to enable. NOTIFY_DRY_RUN=true makes it
// log payloads without calling SendGrid.
// =============================================================

const notifier = require('../services/jobMatchNotifier');

let lastRun = null;

async function runHourly() {
  if (!notifier.enabled()) return { skipped: 'JOBUP_NOTIFY_GO is not 1' };
  const dryRun = process.env.NOTIFY_DRY_RUN === 'true';
  const out = await notifier.runOnce({ dryRun });
  if (out && (out.sent || (out.results && out.results.length))) {
    lastRun = { at: new Date(), sent: out.sent, eligible: out.eligible, dry_run: dryRun };
    if (out.sent) console.log('[jobup notifier]', JSON.stringify({ sent: out.sent, eligible: out.eligible, dry_run: dryRun }));
  }
  return out;
}

function status() {
  return {
    enabled: notifier.enabled(),
    dry_run: process.env.NOTIFY_DRY_RUN === 'true',
    send_hour_local: notifier.SEND_HOUR,
    default_timezone: notifier.DEFAULT_TZ,
    last_run: lastRun,
  };
}

module.exports = { runHourly, status };
