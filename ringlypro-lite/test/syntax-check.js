'use strict';
// Static syntax check of every source file (node --check), no DB/network.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const roots = ['server.js', 'src', 'test'];
const files = [];
function walk(p) {
  const full = path.join(__dirname, '..', p);
  if (!fs.existsSync(full)) return;
  const st = fs.statSync(full);
  if (st.isFile() && full.endsWith('.js')) files.push(full);
  else if (st.isDirectory()) for (const f of fs.readdirSync(full)) walk(path.join(p, f));
}
roots.forEach(walk);

let ok = 0, fail = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); ok++; }
  catch (e) { fail++; console.error('SYNTAX FAIL:', f, '\n', e.stderr ? e.stderr.toString() : e.message); }
}
console.log(`\nSyntax check: ${ok} ok, ${fail} failed, ${files.length} files.`);
process.exit(fail ? 1 : 0);
