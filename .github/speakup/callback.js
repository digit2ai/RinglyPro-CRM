'use strict';

/**
 * Trusted-job reports to SpeakUp, signed with the factory secret. Only the prepare and
 * push jobs (which run no untrusted code) and the final failure reporter use this.
 *
 *   node callback.js status CODING|PUSHING
 *   node callback.js pushed      (env COMMIT_SHA, FILES_CHANGED, CHANGED_FILES, SUITE_MODIFIED, TESTS_JSON)
 *   node callback.js failed      (env FAIL_MESSAGE or $WORK/error.txt)
 *
 * The signature covers a canonical array of every field in a fixed order.
 */

const crypto = require('crypto');
const { base, jobId, secret, hmac, readText } = require('./lib');

const FIELDS = ['ts', 'job_id', 'event', 'status', 'plan_hash', 'commit_sha', 'files_changed',
  'tests_passed', 'tests_failed', 'tests_measured', 'run_url', 'message', 'nonce', 'changed_files', 'suite_modified'];

(async () => {
  const event = process.argv[2];
  const payload = {
    ts: Math.floor(Date.now() / 1000), job_id: jobId(), event, status: event === 'status' ? process.argv[3] : null,
    plan_hash: process.env.PLAN_HASH || null,
    commit_sha: null, files_changed: null, tests_passed: null, tests_failed: null, tests_measured: null,
    run_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    message: null, nonce: crypto.randomBytes(16).toString('hex'), changed_files: null, suite_modified: null
  };
  if (event === 'pushed') {
    let t = {};
    try { t = JSON.parse(process.env.TESTS_JSON || '{}'); } catch (e) { t = {}; }
    const measured = t.measured === true || t.measured === 'true';
    payload.commit_sha = process.env.COMMIT_SHA || null;
    payload.files_changed = process.env.FILES_CHANGED || null;
    payload.tests_measured = measured ? 'true' : 'false';
    payload.tests_passed = measured ? String(parseInt(t.passed, 10) || 0) : null;
    payload.tests_failed = measured ? String(parseInt(t.failed, 10) || 0) : null;
    payload.message = String(t.summary || '').replace(/[^\x20-\x7E]/g, ' ').slice(0, 300);
    payload.changed_files = process.env.CHANGED_FILES || '[]';
    payload.suite_modified = process.env.SUITE_MODIFIED === 'false' ? 'false' : 'true';
  }
  if (event === 'failed') payload.message = (process.env.FAIL_MESSAGE || readText('error.txt') || 'The workflow failed at an unreported step.').slice(0, 400);
  const canonical = JSON.stringify(FIELDS.map(k => (payload[k] === undefined || payload[k] === '' ? null : payload[k])));
  const res = await fetch(`${base()}/api/v1/factory/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-speakup-sig': hmac(secret(), canonical), 'User-Agent': 'SpeakUp-Factory-Action' },
    body: JSON.stringify(payload)
  });
  console.log(`callback ${event}${payload.status ? ' ' + payload.status : ''}: HTTP ${res.status}` +
    (res.status === 401 ? ' (the GitHub secret SPEAKUP_FACTORY_SECRET does not match Render)' : ''));
  if (!res.ok && event !== 'failed') process.exit(1);
})().catch(e => {
  console.error('callback error: ' + e.message);
  if (process.argv[2] !== 'failed') process.exit(1);
});
