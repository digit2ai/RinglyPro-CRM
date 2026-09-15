'use strict';

/**
 * Build job progress reports, authenticated by the narrow progress token.
 * The server accepts it only for TESTING, FIXING or a failure report of this job.
 *
 *   node progress.js status TESTING|FIXING
 *   node progress.js failed
 */

const crypto = require('crypto');
const { base, jobId, readText } = require('./lib');

(async () => {
  const event = process.argv[2];
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
