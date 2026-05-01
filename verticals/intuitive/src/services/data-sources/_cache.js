'use strict';

// Shared cache utility for all public-source data connectors.
// Two-tier cache: in-memory (fast, per-process) + Postgres public_source_cache (durable, cross-instance).

const memoryCache = new Map();

function key(source, cacheKey) { return `${source}::${cacheKey}`; }

async function get(models, source, cacheKey, ttlMs = 24 * 60 * 60 * 1000) {
  const k = key(source, cacheKey);
  const mem = memoryCache.get(k);
  if (mem && mem.expiresAt > Date.now()) return mem.data;

  if (models && models.IntuitivePublicSourceCache) {
    try {
      const row = await models.IntuitivePublicSourceCache.findOne({
        where: { source, cache_key: cacheKey },
      });
      if (row && new Date(row.expires_at).getTime() > Date.now()) {
        memoryCache.set(k, { data: row.data, expiresAt: new Date(row.expires_at).getTime() });
        return row.data;
      }
    } catch (e) { /* fall through to network fetch */ }
  }
  return null;
}

async function set(models, source, cacheKey, data, ttlMs = 24 * 60 * 60 * 1000) {
  const k = key(source, cacheKey);
  const expiresAt = Date.now() + ttlMs;
  memoryCache.set(k, { data, expiresAt });
  if (models && models.IntuitivePublicSourceCache) {
    try {
      await models.IntuitivePublicSourceCache.upsert({
        source,
        cache_key: cacheKey,
        data,
        fetched_at: new Date(),
        expires_at: new Date(expiresAt),
      });
    } catch (e) { /* non-fatal */ }
  }
}

function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(t));
}

async function fetchWithRetry(url, opts = {}, timeoutMs = 10000, retries = 1) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetchWithTimeout(url, opts, timeoutMs);
      if (!r.ok && r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(res => setTimeout(res, 500));
    }
  }
  throw lastErr;
}

module.exports = { get, set, fetchWithTimeout, fetchWithRetry };
