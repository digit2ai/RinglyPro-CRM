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
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).replace(/[^\x20-\x7E]/g, ' ').slice(0, 200);
    fail(`Could not fetch the brief with the build token: HTTP ${res.status} ${body}`);
  }
  const brief = await res.json();
  if (String(brief.job_id) !== id || brief.plan_hash !== process.env.PLAN_HASH) fail('The brief does not match the approved plan.');
  writeJSON('brief.json', brief);

  // Screenshots the owner pasted: written next to the prompt (inside --add-dir) and
  // named at the end of it, so Claude can look at what the owner was looking at.
  const paths = [];
  const dir = path.join(WORK, 'att');
  fs.mkdirSync(dir, { recursive: true });
  for (const a of (brief.attachments || []).slice(0, 6)) {
    try {
      const r = await fetch(`${base()}/api/v1/factory/attachment/${a.id}`, {
        headers: { 'x-speakup-progress': String(process.env.PROGRESS_TOKEN || ''), 'User-Agent': 'SpeakUp-Factory-Action' } });
      if (!r.ok) { console.error('attachment ' + a.id + ': HTTP ' + r.status); continue; }
      const file = path.join(dir, String(a.id) + '-' + String(a.name || 'image').replace(/[^A-Za-z0-9._-]/g, '_'));
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      paths.push(file);
    } catch (e) { console.error('attachment ' + a.id + ' failed'); }
  }
  const prompt = brief.prompt + (paths.length
    ? '\n\nATTACHED SCREENSHOTS (read each one before changing anything):\n' + paths.map(p => '- ' + p).join('\n')
    : '');
  fs.writeFileSync(path.join(WORK, 'prompt.md'), prompt);
  console.log('brief ok' + (paths.length ? ' with ' + paths.length + ' screenshot(s)' : ''));
})().catch(e => fail('Brief fetch failed: ' + e.message));
