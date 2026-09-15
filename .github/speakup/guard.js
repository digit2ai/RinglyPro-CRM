'use strict';

/**
 * Push job (trusted): decide, from data only, whether this change may be pushed and
 * what the owner must be told.
 *
 *  - LEAK: added lines are hashed as 5-word shingles and single words and compared with
 *    the prepare job's hashes of requirement text, quotes and participant names. Any hit
 *    refuses the push: this repository is public. Nothing matched is printed.
 *  - SECRET: obvious credential shapes in added lines refuse the push.
 *  - suite_modified: the change edits a script named by an approved test command.
 *    (Recorded; the phone merge gate refuses it, a person reviews on GitHub.)
 */

const { execFileSync } = require('child_process');
const { readJSON, setOutput, sha16, words, shingles, fail } = require('./lib');

const git = (args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.quotepath=off', ...args], { maxBuffer: 64 * 1024 * 1024 }).toString();
const added = git(['diff', '--cached', '-U0', '--no-renames']).split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1));

if (added.some(l => /(sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY)/.test(l))) {
  fail('The change appears to contain a credential; nothing was pushed.');
}

let protectedHashes = [];
try { protectedHashes = JSON.parse(process.env.SENSITIVE || '[]'); } catch (e) { fail('Protected phrase list is malformed.'); }
const set = new Set(protectedHashes);
if (set.size) {
  const ws = words(added.join('\n'));
  let hit = shingles(ws).some(s => set.has('p:' + sha16(s)));
  if (!hit) hit = ws.some(w => set.has('n:' + sha16(w)) || set.has('p:' + sha16(w)));
  if (!hit) for (let i = 0; i + 1 < ws.length && !hit; i++) hit = set.has('n:' + sha16(ws[i] + ' ' + ws[i + 1]));
  if (!hit) for (let i = 0; i + 3 <= ws.length && !hit; i++) hit = set.has('p:' + sha16(ws.slice(i, i + 3).join(' '))) || set.has('p:' + sha16(ws.slice(i, i + 4).join(' ')));
  if (hit) fail('The change copies meeting content (a requirement quote or a participant name) into the public repository; nothing was pushed.');
}

let tests = [];
try { tests = JSON.parse(process.env.TEST_COMMANDS || '[]'); } catch (e) { tests = []; }
const scripts = new Set(tests.flatMap(c => String(c).split(/\s+/).filter(a => /\.(c|m)?js$/.test(a))));
const changed = readJSON('changed_files.json', []);
const suiteModified = changed.some(f => scripts.has(f));
setOutput('suite_modified', suiteModified ? 'true' : 'false');
console.log(`guard ok: suite_modified=${suiteModified}`);
