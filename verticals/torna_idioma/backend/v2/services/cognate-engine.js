'use strict';

/**
 * Cognate Engine — Filipino-Spanish cognate lookup and text highlighting.
 *
 * The cognate map is lazy-loaded from PostgreSQL on first use and cached in
 * memory. Cache refresh is automatic after TTL expires (5 minutes). Cache
 * reset can be forced via resetCache() — used after new inserts.
 */

const sequelize = require('../../services/db.ti');

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = {
  loadedAt: 0,
  bySpanish: new Map(), // key: lowercase Spanish word -> cognate object
  byTagalog: new Map(), // key: lowercase Tagalog word -> cognate object
  all: []
};

async function loadCache() {
  const [rows] = await sequelize.query(
    `SELECT id, word_es, word_tl, category, cefr_level, etymology_note, example_es, example_tl
     FROM ti_v2_cognates
     ORDER BY category, word_es`
  );

  const bySpanish = new Map();
  const byTagalog = new Map();
  for (const r of rows) {
    bySpanish.set(r.word_es.toLowerCase(), r);
    byTagalog.set(r.word_tl.toLowerCase(), r);
  }
  cache = { loadedAt: Date.now(), bySpanish, byTagalog, all: rows };
}

async function ensureCache() {
  if (!cache.loadedAt || Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    await loadCache();
  }
}

function resetCache() {
  cache.loadedAt = 0;
}

/**
 * Search cognates by Spanish or Tagalog word (case-insensitive substring).
 * @param {string} query
 * @param {number} limit
 */
async function search(query, limit = 50) {
  await ensureCache();
  if (!query || query.trim().length === 0) return cache.all.slice(0, limit);
  const q = query.trim().toLowerCase();
  const results = cache.all.filter(
    (c) => c.word_es.toLowerCase().includes(q) || c.word_tl.toLowerCase().includes(q)
  );
  return results.slice(0, limit);
}

async function byCategory(category, limit = 500) {
  await ensureCache();
  return cache.all.filter((c) => c.category === category).slice(0, limit);
}

async function categories() {
  await ensureCache();
  const map = new Map();
  for (const c of cache.all) map.set(c.category, (map.get(c.category) || 0) + 1);
  return Array.from(map.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

async function lookup(word) {
  await ensureCache();
  if (!word) return null;
  const key = word.toLowerCase().replace(/[.,;:!?¿¡"']/g, '');
  return cache.bySpanish.get(key) || cache.byTagalog.get(key) || null;
}

/**
 * Tokenize Spanish text and return structured output with cognate markers.
 * Returns an array of tokens: { text, isCognate, cognate? }
 * Punctuation and whitespace are preserved as separate tokens.
 */
async function highlight(text) {
  await ensureCache();
  if (!text || typeof text !== 'string') return { tokens: [], cognate_count: 0 };

  // Split keeping whitespace and punctuation as separators
  const tokens = [];
  const regex = /([A-Za-zÁÉÍÓÚÑáéíóúñü]+)|([^A-Za-zÁÉÍÓÚÑáéíóúñü]+)/g;
  let cognateCount = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[1]) {
      // Word token
      const key = m[1].toLowerCase();
      const cognate = cache.bySpanish.get(key) || null;
      if (cognate) cognateCount++;
      tokens.push({
        text: m[1],
        isCognate: !!cognate,
        cognate: cognate
          ? {
              word_tl: cognate.word_tl,
              category: cognate.category,
              note: cognate.etymology_note
            }
          : null
      });
    } else {
      // Punctuation / whitespace token
      tokens.push({ text: m[2], isCognate: false, cognate: null });
    }
  }

  return { tokens, cognate_count: cognateCount };
}

async function stats() {
  await ensureCache();
  return {
    total: cache.all.length,
    categories: await categories(),
    cached_at: new Date(cache.loadedAt).toISOString()
  };
}

module.exports = {
  search,
  byCategory,
  categories,
  lookup,
  highlight,
  stats,
  resetCache,
  loadCache
};
