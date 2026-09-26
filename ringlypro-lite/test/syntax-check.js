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
// INLINE SCRIPTS IN HTML, which `node --check` never sees.
//
// A stray `<script>` tag was inserted INSIDE the dashboard's running script
// block. It parses as HTML perfectly well, so nothing complained — and it
// killed the entire page's JavaScript: no messages, no calendar, no settings,
// not even logout. It shipped to production and was found by a person using
// the app, which is the worst way to find anything.
const pages = [];
(function walkHtml(p) {
  const full = path.join(__dirname, '..', p);
  if (!fs.existsSync(full)) return;
  const st = fs.statSync(full);
  if (st.isFile() && full.endsWith('.html')) pages.push(full);
  else if (st.isDirectory()) for (const f of fs.readdirSync(full)) walkHtml(path.join(p, f));
})('public');

let hOk = 0, hFail = 0;
for (const f of pages) {
  const html = fs.readFileSync(f, 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(html))) {
    n++;
    try { new Function(m[1]); hOk++; }
    catch (e) {
      hFail++;
      console.error(`INLINE SCRIPT FAIL: ${path.relative(path.join(__dirname, '..'), f)} block ${n}\n  ${e.message}`);
    }
  }
}
console.log(`Inline scripts: ${hOk} ok, ${hFail} failed, across ${pages.length} pages.`);

console.log(`\nSyntax check: ${ok} ok, ${fail} failed, ${files.length} files.`);
process.exit(fail + hFail ? 1 : 0);
