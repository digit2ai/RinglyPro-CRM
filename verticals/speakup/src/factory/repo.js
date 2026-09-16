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

/**
 * WHICH FILES TO LOOK AT FIRST — AND WHY COUNTING MATCHES WAS THE WRONG ANSWER.
 *
 * The old score was simply how many of the search words a file mentioned anywhere. Asked for
 * "a different font for the SpeakUp title" it ranked CLAUDE.md first, then src/app.js, then
 * an unrelated vertical: a 30,000-word document contains nearly every word in the repository,
 * so it matched all five and won. The one word that meant anything — "speakup" — counted no
 * more than "only". The real file, verticals/speakup/public/theme.css, was nowhere.
 *
 * Three things decide it now, each fixing one part of that:
 *  - A WORD THAT IS EVERYWHERE MEANS NOTHING. Every term is weighted by how rare it is across
 *    the files scanned, so "speakup" outweighs "font", "title" and "only" together.
 *  - THE PATH IS THE STRONGEST CLUE. A file living under verticals/speakup/ beats one that
 *    merely says the word once in prose — that is what a person would open first.
 *  - BULK IS NOT RELEVANCE. Rarity weighting alone stops a huge file winning by containing
 *    everything; nothing here rewards size.
 *
 * Still CANDIDATES, still labelled that way. This ranks the guesses; it does not know.
 */
function candidateFiles(pathScope, searchTerms, limit) {
  const scopes = (pathScope && pathScope.length ? pathScope : ['.']).map(safeRel).filter(Boolean);
  if (!searchTerms.length) return { files: [], scanned: 0, terms: [] };
  const budget = { n: 0 };
  const hits = [];
  const df = new Map(); // term -> how many files mention it at all
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
      const rel = path.relative(ROOT, abs);
      const lower = rel.toLowerCase();
      // HOW OFTEN, not merely whether. A file that says "font" once in a comment is not
      // about fonts; a stylesheet full of font-family rules is. Counting presence alone put
      // this very file above the stylesheet the change belonged in.
      const counts = {};
      for (const t of searchTerms) {
        let n = 0, i = body.indexOf(t);
        while (i >= 0 && n < 500) { n++; i = body.indexOf(t, i + t.length); }
        if (n) counts[t] = n;
      }
      const matched = Object.keys(counts);
      const inPath = searchTerms.filter(t => lower.includes(t));
      if (!matched.length && !inPath.length) continue;
      for (const t of matched) df.set(t, (df.get(t) || 0) + 1);
      hits.push({ path: rel, matched, inPath, counts, size: Math.max(size, 1) });
    }
  }
  const total = Math.max(hits.length, 1);
  const weight = (t) => Math.log((total + 1) / ((df.get(t) || 0) + 1)) + 0.05;
  for (const h of hits) {
    let s = 0;
    // Density, not bulk: repeated use counts, but a big file gets no advantage for being big.
    const bulk = Math.log(h.size / 500 + Math.E);
    for (const t of h.matched) s += weight(t) * (1 + Math.log(1 + h.counts[t])) / bulk;
    // A term in the path counts, but must not swamp the body: every file under verticals/speakup
    // matches "speakup" equally, so if the path dominated, the ranking inside it would be noise.
    for (const t of h.inPath) s += weight(t) * 1.2;
    h.score = s;
  }
  hits.sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path));
  return {
    files: hits.slice(0, limit || 12).map(h => ({ path: h.path, matched: h.matched, score: Math.round(h.score * 100) / 100 })),
    scanned: budget.n, terms: searchTerms
  };
}

function head(rel, lines) {
  const abs = safeRel(rel);
  if (!abs) return '';
  try { return fs.readFileSync(abs, 'utf8').split('\n').slice(0, lines || 40).join('\n'); } catch (e) { return ''; }
}

module.exports = { ROOT, currentSha, exists, terms, candidateFiles, head };
