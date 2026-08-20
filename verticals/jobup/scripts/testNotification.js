'use strict';

// =============================================================
// Send ONE real job-match digest to a single subscriber, bypassing the cap.
//
//   node verticals/jobup/scripts/testNotification.js <tenantId>
//
// Honors NOTIFY_DRY_RUN=true (logs the payload, sends nothing). Uses the same
// runForUser path as the cron, so what you see is what production sends. Run
// from the repo root; it loads the repo .env.
// =============================================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const db = require('../src/models');
const notifier = require('../src/services/jobMatchNotifier');

(async () => {
  const tid = parseInt(process.argv[2], 10);
  if (!Number.isInteger(tid)) {
    console.error('Usage: node verticals/jobup/scripts/testNotification.js <tenantId>');
    process.exit(1);
  }
  await db.init();
  const sub = await db.models.subscribers.findOne({ where: { id: tid } });
  if (!sub) { console.error('No subscriber with id', tid); process.exit(1); }

  const dryRun = process.env.NOTIFY_DRY_RUN === 'true';
  console.log(`Subscriber ${tid}: ${sub.email} · plan=${sub.plan || 'legacy'} · lang=${sub.language} · dryRun=${dryRun}`);
  const r = await notifier.runForUser(db.plain(sub), { dryRun, now: new Date() });
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
