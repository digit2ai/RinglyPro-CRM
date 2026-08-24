'use strict';

// =============================================================
// PLATFORM analytics for jobup.dev — the whole front door, not one subscriber site.
//
// Answers the owner's questions: how many people land on jobup.dev, how many use the
// Job Finder, WHAT locations they search, and FROM WHERE they come (visitor geography).
//
// PRIVACY: no raw IP is ever stored. visitor_hash is a salted daily digest (reused from
// services/analytics), so a unique visitor is counted for a day and is unrecognisable
// across days. Geography is coarse (country / region / city from a keyless IP lookup,
// cached in memory) and attached to the event, never to a person.
//
// Fire-and-forget everywhere: logging traffic must never slow or break a page.
// =============================================================

const db = require('../db');
const { QueryTypes } = require('sequelize');
const { visitorHash, AGENT_UA } = require('./analytics');

let ready = false;
async function ensure(seq) {
  if (ready) return;
  await seq.query(`CREATE TABLE IF NOT EXISTS ju_platform_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(24) NOT NULL,
    path TEXT, referrer TEXT, visitor_hash VARCHAR(32),
    country VARCHAR(4), region TEXT, city TEXT,
    search_what TEXT, search_where TEXT, remote BOOLEAN, result_count INT, source VARCHAR(16),
    is_agent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now());`);
  await seq.query(`CREATE INDEX IF NOT EXISTS idx_ju_pe_type_time ON ju_platform_events(event_type, created_at)`).catch(() => {});
  ready = true;
}

// ---- keyless IP geolocation, cached in memory (never stores the IP) ----
const geoCache = new Map();   // ip -> { country, region, city, at }
const GEO_TTL = 6 * 3600 * 1000;
function privateIp(ip) { return !ip || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i.test(ip); }
async function geoLookup(ip, req) {
  // Prefer an edge header when present (instant, no network) — Cloudflare / some proxies set it.
  const cf = (req.headers['cf-ipcountry'] || '').toUpperCase();
  if (privateIp(ip)) return { country: cf && cf !== 'XX' ? cf : null, region: null, city: null };
  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < GEO_TTL) return hit;
  let geo = { country: cf && cf !== 'XX' ? cf : null, region: null, city: null, at: Date.now() };
  if (typeof fetch === 'function') {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,region,city`, { signal: ctl.signal });
      if (r.ok) { const j = await r.json(); if (j && j.success) { geo = { country: j.country_code || geo.country, region: j.region || null, city: j.city || null, at: Date.now() }; } }
    } catch (e) { /* keep header/nulls */ } finally { clearTimeout(t); }
  }
  geoCache.set(ip, geo);
  if (geoCache.size > 5000) geoCache.clear();
  return geo;
}

function ipOf(req) { return (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.ip || ''; }

// Public API: fire-and-forget. `meta` for job_search carries {what, where, remote, count, source}.
function record(req, eventType, meta = {}) {
  _record(req, eventType, meta).catch(() => {});
}
async function _record(req, eventType, meta) {
  const seq = db.sequelize();
  if (!seq) return;
  await ensure(seq);
  const ua = (req.get && req.get('user-agent')) || req.headers['user-agent'] || '';
  const ip = ipOf(req);
  let ref = (req.get && req.get('referer')) || req.headers['referer'] || '';
  if (ref.length > 300) ref = ref.slice(0, 300);
  const isAgent = AGENT_UA.test(ua);
  let geo = { country: null, region: null, city: null };
  if (!isAgent) { try { geo = await geoLookup(ip, req); } catch (e) {} }   // don't geo-lookup bots
  await seq.query(
    `INSERT INTO ju_platform_events (event_type, path, referrer, visitor_hash, country, region, city,
       search_what, search_where, remote, result_count, source, is_agent)
     VALUES (:et,:path,:ref,:vh,:country,:region,:city,:what,:where,:remote,:cnt,:src,:agent)`,
    { replacements: {
        et: String(eventType).slice(0, 24), path: String(meta.path || (req.path || '/')).slice(0, 200), ref,
        vh: visitorHash(ip, ua),
        country: geo.country || null, region: (geo.region || '').slice(0, 80) || null, city: (geo.city || '').slice(0, 80) || null,
        what: (meta.what || '').slice(0, 120) || null, where: (meta.where || '').slice(0, 120) || null,
        remote: typeof meta.remote === 'boolean' ? meta.remote : null,
        cnt: Number.isFinite(meta.count) ? meta.count : null, src: (meta.source || '').slice(0, 16) || null,
        agent: isAgent }, type: QueryTypes.INSERT }
  ).catch(() => {});
}

function dayKey(d) { return new Date(d).toISOString().slice(0, 10); }

// The Analytics dashboard payload. Aggregated in SQL so it stays fast as the table grows.
async function summary(days = 30) {
  const seq = db.sequelize();
  if (!seq) return { error: 'database unavailable' };
  await ensure(seq);
  const since = `now() - interval '${parseInt(days, 10) || 30} days'`;
  const q = (sql) => seq.query(sql, { type: QueryTypes.SELECT });

  const [tot] = await q(`
    SELECT
      count(*) FILTER (WHERE event_type='page_view' AND NOT is_agent)::int AS page_views,
      count(DISTINCT visitor_hash) FILTER (WHERE event_type='page_view' AND NOT is_agent)::int AS unique_visitors,
      count(*) FILTER (WHERE event_type='job_search' AND NOT is_agent)::int AS job_searches,
      count(DISTINCT visitor_hash) FILTER (WHERE event_type='job_search' AND NOT is_agent)::int AS unique_searchers,
      count(*) FILTER (WHERE event_type='job_search' AND remote=true AND NOT is_agent)::int AS remote_searches,
      count(*) FILTER (WHERE is_agent)::int AS agent_hits
    FROM ju_platform_events WHERE created_at >= ${since}`);

  const byDay = await q(`
    SELECT to_char(created_at,'YYYY-MM-DD') AS date,
      count(*) FILTER (WHERE event_type='page_view' AND NOT is_agent)::int AS views,
      count(*) FILTER (WHERE event_type='job_search' AND NOT is_agent)::int AS searches
    FROM ju_platform_events WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1`);

  const top = (sql) => q(sql);
  const searchLocations = await top(`SELECT lower(search_where) AS k, count(*)::int n FROM ju_platform_events
    WHERE event_type='job_search' AND NOT is_agent AND search_where IS NOT NULL AND created_at >= ${since}
    GROUP BY 1 ORDER BY n DESC LIMIT 15`);
  const searchKeywords = await top(`SELECT lower(search_what) AS k, count(*)::int n FROM ju_platform_events
    WHERE event_type='job_search' AND NOT is_agent AND search_what IS NOT NULL AND search_what<>'' AND created_at >= ${since}
    GROUP BY 1 ORDER BY n DESC LIMIT 15`);
  const countries = await top(`SELECT country AS k, count(DISTINCT visitor_hash)::int n FROM ju_platform_events
    WHERE NOT is_agent AND country IS NOT NULL AND created_at >= ${since} GROUP BY 1 ORDER BY n DESC LIMIT 15`);
  const cities = await top(`SELECT (city || CASE WHEN region IS NOT NULL THEN ', '||region ELSE '' END) AS k, count(DISTINCT visitor_hash)::int n
    FROM ju_platform_events WHERE NOT is_agent AND city IS NOT NULL AND created_at >= ${since} GROUP BY 1 ORDER BY n DESC LIMIT 15`);
  const referrers = await top(`SELECT referrer AS k, count(*)::int n FROM ju_platform_events
    WHERE event_type='page_view' AND NOT is_agent AND referrer IS NOT NULL AND referrer<>'' AND created_at >= ${since}
    GROUP BY 1 ORDER BY n DESC LIMIT 12`);

  // zero-fill the daily chart
  const dmap = {};
  for (let i = (parseInt(days, 10) || 30) - 1; i >= 0; i--) dmap[dayKey(Date.now() - i * 86400000)] = { date: dayKey(Date.now() - i * 86400000), views: 0, searches: 0 };
  byDay.forEach((r) => { if (dmap[r.date]) dmap[r.date] = { date: r.date, views: r.views, searches: r.searches }; });

  return {
    days: parseInt(days, 10) || 30,
    totals: tot || {},
    per_day: Object.values(dmap),
    search_locations: searchLocations.map((r) => ({ label: r.k, n: r.n })),
    search_keywords: searchKeywords.map((r) => ({ label: r.k, n: r.n })),
    countries: countries.map((r) => ({ label: r.k, n: r.n })),
    cities: cities.map((r) => ({ label: r.k, n: r.n })),
    referrers: referrers.map((r) => ({ label: r.k, n: r.n })),
    note: 'First-party. No IP stored; unique visitors are a salted daily digest. Bots counted separately.',
  };
}

module.exports = { ensure, record, summary };
