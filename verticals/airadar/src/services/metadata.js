'use strict';

/**
 * AI Radar — page metadata fetcher (dependency-free).
 *
 * Given a shared link, pull whatever the page will actually give us:
 * og:title / og:description / og:site_name / og:image / <title> / meta description.
 * Social platforms (Instagram, Facebook, TikTok) frequently serve a login wall
 * to server-side fetches — that is EXPECTED. We report what we got and let the
 * enricher be honest about the gap rather than inventing a company.
 */

const PLATFORMS = [
  [/(^|\.)instagram\.com$/i, 'instagram'],
  [/(^|\.)facebook\.com$/i, 'facebook'],
  [/(^|\.)fb\.watch$/i, 'facebook'],
  [/(^|\.)tiktok\.com$/i, 'tiktok'],
  [/(^|\.)(x|twitter)\.com$/i, 'x'],
  [/(^|\.)t\.co$/i, 'x'],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, 'youtube'],
  [/(^|\.)linkedin\.com$/i, 'linkedin'],
  [/(^|\.)(reddit\.com|redd\.it)$/i, 'reddit'],
  [/(^|\.)threads\.(net|com)$/i, 'threads']
];

// Hosts that describe the *post*, not the company behind the product.
const SOCIAL = new Set(['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'linkedin', 'reddit', 'threads']);

function detectPlatform(url) {
  const host = safeHost(url);
  if (!host) return null;
  for (const [re, name] of PLATFORMS) if (re.test(host)) return name;
  return 'web';
}

function isSocial(platform) { return SOCIAL.has(String(platform || '')); }

function safeHost(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./i, ''); } catch (e) { return null; }
}

// Only ever fetch public http(s) hosts. Owner-only tool, but no reason to let a
// pasted link probe the private network.
const PRIVATE = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

function fetchable(url) {
  let u;
  try { u = new URL(String(url)); } catch (e) { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  if (PRIVATE.test(u.hostname)) return false;
  return true;
}

function pick(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1]).trim().slice(0, 1200);
  }
  return null;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function metaRe(prop) {
  // Matches <meta property="og:x" content="..."> in either attribute order.
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${p}["']`, 'i')
  ];
}

/**
 * fetchMetadata(url) -> { ok, status, platform, host, title, description,
 *                         site_name, image, canonical, blocked, error }
 * Never throws. `blocked:true` means the host answered but gave us nothing
 * usable (login wall / JS-only page).
 */
async function fetchMetadata(url) {
  const platform = detectPlatform(url);
  const host = safeHost(url);
  const base = { ok: false, status: null, platform, host, title: null, description: null,
    site_name: null, image: null, canonical: null, blocked: false, error: null };

  if (!fetchable(url)) return { ...base, error: 'unfetchable_url' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        // Identify as a normal browser; many sites 403 an unknown agent outright.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    base.status = res.status;
    const ctype = res.headers.get('content-type') || '';
    if (!res.ok || !/html|xml/i.test(ctype)) {
      return { ...base, blocked: true, error: res.ok ? 'non_html' : ('http_' + res.status) };
    }
    // Cap the read — metadata lives in <head>.
    const html = (await res.text()).slice(0, 400000);

    base.title = pick(html, [...metaRe('og:title'), ...metaRe('twitter:title'), /<title[^>]*>([\s\S]{1,400}?)<\/title>/i]);
    base.description = pick(html, [...metaRe('og:description'), ...metaRe('twitter:description'), ...metaRe('description')]);
    base.site_name = pick(html, [...metaRe('og:site_name'), ...metaRe('application-name')]);
    base.image = pick(html, [...metaRe('og:image'), ...metaRe('twitter:image')]);
    base.canonical = pick(html, [/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i]);

    base.ok = Boolean(base.title || base.description);
    base.blocked = !base.ok;
    return base;
  } catch (e) {
    return { ...base, blocked: true, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── Public oEmbed ────────────────────────────────────────────────────────────
// Some platforms publish a keyless oEmbed endpoint that returns the real title
// and author even when the HTML page is a login wall. Facebook and Instagram
// removed theirs (token required since 2020), so their posts genuinely cannot
// be read server-side — we do not pretend otherwise.
const OEMBED = [
  [/(^|\.)tiktok\.com$/i, (u) => 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(u)],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, (u) => 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u)],
  [/(^|\.)vimeo\.com$/i, (u) => 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(u)]
];

async function fetchOembed(url) {
  if (!fetchable(url)) return null;
  const host = safeHost(url);
  const hit = OEMBED.find(([re]) => re.test(host || ''));
  if (!hit) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(hit[1](url), { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || !d.title) return null;
    return {
      title: String(d.title).slice(0, 400),
      author: d.author_name ? String(d.author_name).slice(0, 160) : null,
      thumbnail: d.thumbnail_url || null,
      provider: d.provider_name || null
    };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Pull any company URL mentioned in a caption the user shared with us.
// (Share sheets on iOS/Android often hand over the caption text.)
function urlsInText(text) {
  const out = [];
  const re = /https?:\/\/[^\s<>"')]+/gi;
  let m;
  while ((m = re.exec(String(text || ''))) && out.length < 10) out.push(m[0].replace(/[.,;:)]+$/, ''));
  return out;
}

module.exports = { fetchMetadata, fetchOembed, detectPlatform, isSocial, safeHost, fetchable, urlsInText };
