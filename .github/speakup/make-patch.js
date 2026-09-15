'use strict';

// Build job: package the working tree change as data for the verify and push jobs.
// No untrusted file from this VM ever reaches the push job except this patch, which
// the push job validates and applies with git hooks disabled.

const { execFileSync } = require('child_process');
const zlib = require('zlib');
const { setOutput, fail } = require('./lib');

const git = (args, opts) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.quotepath=off', ...args], Object.assign({ maxBuffer: 64 * 1024 * 1024 }, opts || {}));
git(['add', '-A']);
const patch = git(['diff', '--cached', '--binary', '--no-renames', '--full-index']);
if (!patch.length) fail('Claude produced no file changes.');
const b64 = zlib.gzipSync(patch, { level: 9 }).toString('base64');
if (b64.length > 900000) fail('The change is too large for the factory (over ~900 KB compressed). Split the plan.');
setOutput('patch', b64);
console.log(`patch ok: ${patch.length} bytes, ${b64.length} encoded`);
