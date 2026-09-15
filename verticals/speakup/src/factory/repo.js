'use strict';

/**
 * SpeakUp AI Factory — READ-ONLY view of the repository this server was deployed from.
 *
 * Render runs the app from a checkout of main, so the source the plan is compared
 * against is on this disk: no GitHub call, no key, and no write path. Nothing in
 * this file opens a file for writing (SIT greps it).
 *
 * Findings are CANDIDATES by keyword match, and are labelled that way. A file that
 * mentions "sms" is not proof it is where an SMS bug lives.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.SPEAKUP_REPO_ROOT || path.resolve(__dirname, '..', '..', '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'uploads', 'coverage', '.next', 'audio', 'proposal-audio']);
const EXT = /\.(js|mjs|cjs|ts|tsx|jsx|html|sql|md|json|yml|yaml|css)$/i;
const MAX_FILES = 6000;
const MAX_BYTES = 400 * 1024;

const STOP = new Set(('the and for with that this from have will should would could need needs into when then than also about what which your our their there them they were been being make made just like want wants ' +
  'para como pero porque cuando donde desde hasta sobre entre este esta estos estas esos esas aqui alla tiene tienen hacer debe deben puede pueden necesita necesitamos quiero queremos cada todo todos toda todas ' +
  'mas menos muy bien solo tambien sistema system user users usuario usuarios cliente clientes client clients page pagina').split(/\s+/));

function currentSha() {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT;
  try {
    const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head;
    const ref = head.slice(4).trim();
    return fs.readFileSync(path.join(ROOT, '.git', ref), 'utf8').trim();
  } catch (e) { return null; }
}

function safeRel(rel) {
  const r = String(rel || '').replace(/^\/+/, '');
  if (!r || r.includes('..')) return null;
  const abs = path.resolve(ROOT, r);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) return null;
  return abs;
}

function exists(rel) {
  const abs = safeRel(rel);
  try { return !!abs && fs.statSync(abs).isFile(); } catch (e) { return false; }
}

function terms(texts) {
  const counts = new Map();
  for (const t of texts) {
    const ids = String(t || '').match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) || [];
    for (const raw of ids) {
      const w = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (w.length < 4 || STOP.has(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(e => e[0]);
}

function* walk(dir, budget) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const ent of entries) {
    if (budget.n >= MAX_FILES) return;
    if (ent.name.startsWith('.') && ent.name !== '.github') continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) yield* walk(abs, budget); }
    else if (EXT.test(ent.name)) { budget.n++; yield abs; }
  }
}

// Score files under the project's path scope by how many distinct terms they mention.
function candidateFiles(pathScope, searchTerms, limit) {
  const scopes = (pathScope && pathScope.length ? pathScope : ['.']).map(safeRel).filter(Boolean);
  if (!searchTerms.length) return { files: [], scanned: 0, terms: [] };
  const budget = { n: 0 };
  const scored = [];
  for (const scope of scopes) {
    let st;
    try { st = fs.statSync(scope); } catch (e) { continue; }
    const files = st.isFile() ? [scope] : walk(scope, budget);
    for (const abs of files) {
      let size;
      try { size = fs.statSync(abs).size; } catch (e) { continue; }
      if (size > MAX_BYTES) continue;
      let body;
      try { body = fs.readFileSync(abs, 'utf8').toLowerCase(); } catch (e) { continue; }
      const matched = searchTerms.filter(t => body.includes(t));
      if (matched.length) scored.push({ path: path.relative(ROOT, abs), matched, score: matched.length });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return { files: scored.slice(0, limit || 12), scanned: budget.n, terms: searchTerms };
}

function head(rel, lines) {
  const abs = safeRel(rel);
  if (!abs) return '';
  try { return fs.readFileSync(abs, 'utf8').split('\n').slice(0, lines || 40).join('\n'); } catch (e) { return ''; }
}

module.exports = { ROOT, currentSha, exists, terms, candidateFiles, head };
