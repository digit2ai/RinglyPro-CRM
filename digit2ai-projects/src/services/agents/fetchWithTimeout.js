'use strict';

// AbortController-based fetch with a hard timeout. Node 18+ has global fetch.
// Returns { ok, status, text, error } — never throws. Used by webSearch and
// the research agent's source extraction so a single slow URL cannot stall
// the worker tick.

async function fetchWithTimeout(url, { timeoutMs = 8000, headers = {}, method = 'GET' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method,
      headers: {
        // Some hosts (e.g. DDG, news sites) reject bot user-agents. Use a
        // common desktop UA so we get real content back.
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'text/html,application/json,*/*;q=0.5',
        ...headers
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, text, error: null };
  } catch (err) {
    return { ok: false, status: 0, text: '', error: err.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// Cheap HTML -> visible text. Strips script/style blocks, tags, collapses
// whitespace. Not a full parser — good enough for first-N-chars extraction.
function stripHtml(html, maxChars = 4000) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

module.exports = { fetchWithTimeout, stripHtml };
