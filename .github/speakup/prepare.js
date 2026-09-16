'use strict';

/**
 * Trusted job, no untrusted code: fetch the approved brief with the factory secret and
 * hand the other jobs ONLY what they need.
 *
 *  - build job (runs Claude): a single-use brief token + a progress token. Never the secret.
 *  - verify job: the approved test commands.
 *  - push job: path scope, plan files, and HASHES of meeting phrases and names, so it can
 *    refuse a diff that copies meeting content into this public repository without
 *    ever holding that content in plaintext.
 */

const { base, jobId, secret, fingerprint, hmac, sha16, writeJSON, setOutput, words, shingles, SHINGLE, fail } = require('./lib');

(async () => {
  const id = jobId();
  // Safe to print: a fingerprint of the secret, to compare with the one the app shows.
  console.log('factory secret fingerprint on GitHub: ' + fingerprint());
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(`${base()}/api/v1/factory/brief/${id}`, {
    headers: { 'x-speakup-ts': String(ts), 'x-speakup-sig': hmac(secret(), `brief.${id}.${ts}`), 'User-Agent': 'SpeakUp-Factory-Action' }
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).replace(/[^\x20-\x7E]/g, ' ').slice(0, 200);
    fail(`Could not fetch the approved brief: HTTP ${res.status} ${body}` +
      (res.status === 401 ? ' — the GitHub secret SPEAKUP_FACTORY_SECRET (fingerprint ' + fingerprint() + ') does not match the one on Render' : ''));
  }
  const brief = await res.json();
  if (String(brief.job_id) !== id) fail('The brief is for a different job.');
  if (brief.branch !== process.env.BRANCH) fail('The brief branch does not match the dispatched branch.');
  if (!/^[a-f0-9]{64}$/.test(String(brief.plan_hash || ''))) fail('The brief has no plan hash.');
  writeJSON('brief.json', brief);

  const hashes = new Set();
  for (const p of (brief.sensitive && brief.sensitive.phrases) || []) {
    const ws = words(p);
    if (ws.length >= SHINGLE) shingles(ws).forEach(s => hashes.add('p:' + sha16(s)));
    else if (ws.length >= 3) hashes.add('p:' + sha16(ws.join(' ')));
  }
  for (const n of (brief.sensitive && brief.sensitive.names) || []) {
    const ws = words(n);
    if (ws.length && ws.join(' ').length >= 3) hashes.add('n:' + sha16(ws.join(' ')));
  }

  const exp = ts + 3 * 3600 - 60;
  setOutput('plan_hash', brief.plan_hash);
  setOutput('base_branch', brief.base_branch);
  setOutput('test_commands', JSON.stringify(brief.test_commands || []));
  setOutput('path_scope', JSON.stringify(brief.path_scope || []));
  setOutput('plan_files', JSON.stringify(brief.plan_files || []));
  setOutput('sensitive', JSON.stringify([...hashes]));
  setOutput('brief_token', `${exp}.${hmac(secret(), `brief.${id}.${exp}`)}`);
  setOutput('progress_token', `${exp}.${hmac(secret(), `progress.${id}.${exp}`)}`);
  console.log(`prepare ok for job ${id}: ${(brief.test_commands || []).length} test command(s), ${hashes.size} protected hash(es)`);
})().catch(e => fail('Prepare step failed: ' + e.message));
