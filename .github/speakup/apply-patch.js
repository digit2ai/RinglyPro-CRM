'use strict';

/**
 * Verify and push jobs: apply the build job's patch as DATA.
 *
 * Refused: any path under .github/ or .git/, any .env file, any path with "..", absolute
 * paths, symlinks (mode 120000), submodules (mode 160000). Applied with git hooks disabled
 * and quotepath off, renames expanded, so a rename or a non-ASCII name cannot hide a path.
 * Writes changed_files.json to $WORK and the outputs changed_files + files_changed.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WORK, writeJSON, setOutput, fail } = require('./lib');

const git = (args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.quotepath=off', ...args], { maxBuffer: 64 * 1024 * 1024 }).toString();

const b64 = String(process.env.PATCH_B64 || '');
if (!/^[A-Za-z0-9+/=]+$/.test(b64)) fail('The patch from the build job is missing or malformed.');
let patch;
try { patch = zlib.gunzipSync(Buffer.from(b64, 'base64')); } catch (e) { fail('The patch could not be decompressed.'); }
const text = patch.toString('utf8');

function badPath(p) {
  return !p || p.startsWith('/') || p.split('/').includes('..') || /^\.github(\/|$)/.test(p) || /^\.git(\/|$)/.test(p) ||
    /(^|\/)\.env(\.|$)/.test(p) || /[\x00-\x1f]/.test(p);
}
const headerPaths = [];
for (const line of text.split('\n')) {
  let m;
  if ((m = line.match(/^diff --git a\/(.+) b\/(.+)$/))) headerPaths.push(m[1], m[2]);
  else if ((m = line.match(/^(?:---|\+\+\+) (?:a|b)\/(.+)$/))) headerPaths.push(m[1]);
  else if (/^(new|deleted) file mode 1(2|6)0000/.test(line) || /^(old|new) mode 1(2|6)0000/.test(line)) fail('The change contains a symlink or submodule, which the factory refuses.');
  else if (/^(rename|copy) (from|to) /.test(line)) fail('The change contains a rename header, which the factory refuses.');
}
const offending = headerPaths.find(badPath);
if (offending) fail('The change touches a protected path (.github, .git, .env or outside the repository).');

const file = path.join(WORK, 'change.patch');
fs.writeFileSync(file, patch);
try { git(['apply', '--index', '--whitespace=nowarn', file]); } catch (e) { fail('The patch does not apply cleanly to the base branch.'); }

const changed = git(['diff', '--cached', '--name-only', '--no-renames']).split('\n').filter(Boolean);
if (!changed.length) fail('The patch changes nothing.');
if (changed.some(badPath)) fail('The change touches a protected path.');
writeJSON('changed_files.json', changed);
setOutput('changed_files', JSON.stringify(changed));
setOutput('files_changed', changed.length);
console.log(`applied: ${changed.length} file(s)`);
