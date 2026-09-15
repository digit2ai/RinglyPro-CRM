'use strict';

// Build job: fetch the brief once with the single-use brief token. No factory secret here.

const fs = require('fs');
const path = require('path');
const { WORK, base, jobId, writeJSON, fail } = require('./lib');

(async () => {
  const id = jobId();
  const res = await fetch(`${base()}/api/v1/factory/brief/${id}`, {
    headers: { 'x-speakup-brief-token': String(process.env.BRIEF_TOKEN || ''), 'User-Agent': 'SpeakUp-Factory-Action' }
  });
  if (!res.ok) fail(`Could not fetch the brief with the build token (HTTP ${res.status}).`);
  const brief = await res.json();
  if (String(brief.job_id) !== id || brief.plan_hash !== process.env.PLAN_HASH) fail('The brief does not match the approved plan.');
  writeJSON('brief.json', brief);
  fs.writeFileSync(path.join(WORK, 'prompt.md'), brief.prompt);
  console.log('brief ok');
})().catch(e => fail('Brief fetch failed: ' + e.message));
