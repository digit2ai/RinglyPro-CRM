'use strict';

/**
 * Build job progress reports, authenticated by the narrow progress token.
 * The server accepts it only for TESTING, FIXING or a failure report of this job.
 *
 *   node progress.js status TESTING|FIXING
 *   node progress.js failed
 *   node progress.js tests      (posts the measured counts as an activity line)
 */

const crypto = require('crypto');
const { base, jobId, readText, readJSON } = require('./lib');

(async () => {
  const event = process.argv[2];
  if (event === 'tests') {
    const t = readJSON('tests.json', {});
    const res = await fetch(`${base()}/api/v1/factory/progress-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-speakup-progress': String(process.env.PROGRESS_TOKEN || ''), 'User-Agent': 'SpeakUp-Factory-Action' },
      body: JSON.stringify({ job_id: jobId(), plan_hash: process.env.PLAN_HASH || null,
        events: [{ kind: 'test', text: t.measured ? `${t.passed} passed, ${t.failed} failed — ${String(t.summary || '').slice(0, 300)}` : 'Tests could not be measured',
          detail: t.measured ? { i18n: 'tests', passed: t.passed, failed: t.failed, summary: String(t.summary || '').slice(0, 300) } : { i18n: 'tests_unmeasured' } }] })
    });
    console.log('progress tests: HTTP ' + res.status);
    return;
  }
  const payload = { ts: Math.floor(Date.now() / 1000), job_id: jobId(), event, status: event === 'status' ? process.argv[3] : null,
    plan_hash: process.env.PLAN_HASH || null, nonce: crypto.randomBytes(16).toString('hex'),
    run_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    message: event === 'failed' ? (readText('error.txt') || 'The build job failed.').slice(0, 400) : null };
  const res = await fetch(`${base()}/api/v1/factory/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-speakup-progress': String(process.env.PROGRESS_TOKEN || ''), 'User-Agent': 'SpeakUp-Factory-Action' },
    body: JSON.stringify(payload)
  });
  console.log(`progress ${event}${payload.status ? ' ' + payload.status : ''}: HTTP ${res.status}`);
})().catch(e => console.error('progress error: ' + e.message));
