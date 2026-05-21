'use strict';

// Web search wrapper. Primary: Brave Search API (requires BRAVE_SEARCH_API_KEY).
// Fallback: DuckDuckGo HTML scrape (no API key). Returns an array of
// { title, url, snippet } — empty array on total failure (caller decides
// how to proceed; the research agent will still produce a brief from just
// the project context if no sources came back).

const { fetchWithTimeout } = require('./fetchWithTimeout');

async function braveSearch(query, count = 5) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return null;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(count, 20)}&safesearch=moderate`;
  const r = await fetchWithTimeout(url, {
    timeoutMs: 8000,
    headers: { accept: 'application/json', 'x-subscription-token': key }
  });
  if (!r.ok) {
    console.warn('[webSearch] Brave failed:', r.status, r.error || r.text?.slice(0, 200));
    return null;
  }
  try {
    const json = JSON.parse(r.text);
    const results = (json?.web?.results || []).slice(0, count).map(x => ({
      title: String(x.title || '').trim(),
      url: String(x.url || '').trim(),
      snippet: String(x.description || '').replace(/<[^>]+>/g, '').trim()
    })).filter(x => x.url);
    return results;
  } catch (e) {
    console.warn('[webSearch] Brave parse failed:', e.message);
    return null;
  }
}

async function ddgSearch(query, count = 5) {
  // DuckDuckGo HTML endpoint — public, no auth required. Their JSON API
  // is mostly empty for general queries so we scrape the HTML.
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const r = await fetchWithTimeout(url, { timeoutMs: 8000 });
  if (!r.ok) {
    console.warn('[webSearch] DDG failed:', r.status, r.error);
    return [];
  }
  const out = [];
  // Each result block looks like: <a class="result__a" href="...">Title</a> ... <a class="result__snippet">Snippet</a>
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(r.text)) && out.length < count) {
    // DDG wraps real URLs inside a redirect: /l/?uddg=https%3A...
    let url = m[1];
    const uddg = url.match(/[?&]uddg=([^&]+)/);
    if (uddg) {
      try { url = decodeURIComponent(uddg[1]); } catch (_) {}
    }
    const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const snippet = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (url && title) out.push({ title, url, snippet });
  }
  return out;
}

async function webSearch(query, count = 5) {
  const q = String(query || '').trim();
  if (!q) return [];
  // Try Brave first; fall back to DDG on null (no key or hard failure).
  let results = await braveSearch(q, count);
  if (!results || !results.length) {
    results = await ddgSearch(q, count);
  }
  return results || [];
}

module.exports = { webSearch, braveSearch, ddgSearch };
