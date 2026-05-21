'use strict';

/**
 * Web Search service — Brave → DuckDuckGo HTML fallback.
 *
 * Provides current-web search for the Ask SurgicalMind chatbot when local
 * CMS / project tools can't answer (international hospitals, latest M&A,
 * recent pricing, industry news, etc.).
 *
 * Usage:
 *   const { search } = require('./web-search');
 *   const results = await search('top hospitals in Manila Philippines', { count: 5 });
 *   // returns [{ title, snippet, url, source: 'brave'|'duckduckgo' }, ...]
 *
 * Set BRAVE_SEARCH_API_KEY env for higher-quality results; otherwise DDG fallback.
 */

const TIMEOUT_MS = 8000;

function fetchWithTimeout(url, opts = {}, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function braveSearch(query, count = 5) {
  if (!process.env.BRAVE_SEARCH_API_KEY) return null;
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
    const resp = await fetchWithTimeout(url, {
      headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY, 'Accept': 'application/json' },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return ((data.web && data.web.results) || []).map(r => ({
      title: r.title,
      snippet: r.description,
      url: r.url,
      source: 'brave',
    }));
  } catch (e) {
    console.log('[web-search] brave error:', e.message);
    return null;
  }
}

async function duckDuckGoSearch(query, count = 5) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const resp = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'SurgicalMind AI Research Agent/1.0' },
    });
    if (!resp.ok) return [];
    const html = await resp.text();
    // DDG HTML structure: result__a (title link), result__snippet (snippet), result__url
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && results.length < count) {
      const rawHref = m[1] || '';
      // DDG wraps URLs in redirect; extract uddg= param
      let realUrl = rawHref;
      try {
        const u = new URL(rawHref, 'https://duckduckgo.com');
        const uddg = u.searchParams.get('uddg');
        if (uddg) realUrl = decodeURIComponent(uddg);
      } catch (_) {}
      results.push({
        title: m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim(),
        snippet: m[3].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim(),
        url: realUrl,
        source: 'duckduckgo',
      });
    }
    return results;
  } catch (e) {
    console.log('[web-search] ddg error:', e.message);
    return [];
  }
}

/**
 * Search the web. Tries Brave first when key is configured, falls back to DuckDuckGo HTML.
 * Returns an array of { title, snippet, url, source }.
 */
async function search(query, opts = {}) {
  const count = Number(opts.count) || 5;
  if (!query || typeof query !== 'string') return [];

  const brave = await braveSearch(query, count);
  if (brave && brave.length > 0) return brave;

  const ddg = await duckDuckGoSearch(query, count);
  return ddg || [];
}

module.exports = { search, braveSearch, duckDuckGoSearch };
