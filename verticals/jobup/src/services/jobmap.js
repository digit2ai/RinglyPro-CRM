// JobUp — "Job Search in your area" (Job Map) MVP.
//
// Real, live openings on an interactive map. Two data sources, best-first:
//   1. ADZUNA (when ADZUNA_APP_ID/KEY are set) — returns latitude/longitude + local
//      coverage across every industry (Bandana-style local breadth). No geocoding needed.
//   2. cv_jobs pool (keyless, works now) — the shared CV-engine job pool (~5,600 live jobs),
//      filtered by keyword + area. Placed on the map by geocoding each city with OpenStreetMap
//      Nominatim (keyless), cached in ju_geocache. Requests do CACHE-ONLY lookups so they stay
//      fast (<1s); a background warm-up geocodes the pool's cities at a polite 1/sec, so the map
//      fills in and stays fast for everyone thereafter.
//
// Honesty: never fabricates a coordinate — a job we cannot place is returned without a pin
// (still listed). Never invents a salary. Labels which source produced the results.

const db = require('../db');
const { QueryTypes } = require('sequelize');
const jobsource = require('./jobsource');

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'JobUp-JobMap/1.0 (+https://jobup.dev)';
const US_CENTER = { lat: 39.5, lng: -98.35 };

// Metros pre-seeded so common locations resolve instantly (incl. Citi/tech international hubs).
const SEED = {
  'san francisco, ca': [37.7749, -122.4194], 'south san francisco, ca': [37.6547, -122.4077],
  'new york, ny': [40.7128, -74.006], 'brooklyn, ny': [40.6782, -73.9442], 'jersey city, nj': [40.7178, -74.0431],
  'los angeles, ca': [34.0522, -118.2437], 'san jose, ca': [37.3382, -121.8863], 'oakland, ca': [37.8044, -122.2712],
  'palo alto, ca': [37.4419, -122.143], 'mountain view, ca': [37.3861, -122.0839], 'irvine, ca': [33.6846, -117.8265],
  'sunnyvale, ca': [37.3688, -122.0363], 'santa clara, ca': [37.3541, -121.9552], 'san diego, ca': [32.7157, -117.1611],
  'sacramento, ca': [38.5816, -121.4944], 'seattle, wa': [47.6062, -122.3321], 'bellevue, wa': [47.6101, -122.2015],
  'austin, tx': [30.2672, -97.7431], 'dallas, tx': [32.7767, -96.797], 'irving, tx': [32.814, -96.9489],
  'houston, tx': [29.7604, -95.3698], 'san antonio, tx': [29.4241, -98.4936], 'plano, tx': [33.0198, -96.6989],
  'chicago, il': [41.8781, -87.6298], 'boston, ma': [42.3601, -71.0589], 'cambridge, ma': [42.3736, -71.1097],
  'denver, co': [39.7392, -104.9903], 'atlanta, ga': [33.749, -84.388], 'miami, fl': [25.7617, -80.1918],
  'tampa, fl': [27.9506, -82.4572], 'orlando, fl': [28.5383, -81.3792], 'jacksonville, fl': [30.3322, -81.6557],
  'washington, dc': [38.9072, -77.0369], 'philadelphia, pa': [39.9526, -75.1652], 'pittsburgh, pa': [40.4406, -79.9959],
  'phoenix, az': [33.4484, -112.074], 'tempe, az': [33.4255, -111.94], 'portland, or': [45.5152, -122.6784],
  'minneapolis, mn': [44.9778, -93.265], 'nashville, tn': [36.1627, -86.7816], 'charlotte, nc': [35.2271, -80.8431],
  'raleigh, nc': [35.7796, -78.6382], 'durham, nc': [35.994, -78.8986], 'salt lake city, ut': [40.7608, -111.891],
  'columbus, oh': [39.9612, -82.9988], 'detroit, mi': [42.3314, -83.0458], 'las vegas, nv': [36.1699, -115.1398],
  'kansas city, mo': [39.0997, -94.5786], 'st louis, mo': [38.627, -90.1994], 'new orleans, la': [29.9511, -90.0715],
  // international hubs that show up in the pool
  'london, uk': [51.5074, -0.1278], 'london, united kingdom': [51.5074, -0.1278], 'london, england': [51.5074, -0.1278],
  'dublin, ireland': [53.3498, -6.2603], 'toronto, canada': [43.6532, -79.3832], 'toronto, ontario': [43.6532, -79.3832],
  'singapore': [1.3521, 103.8198], 'bengaluru, india': [12.9716, 77.5946], 'bangalore, india': [12.9716, 77.5946],
  'mexico city, mexico': [19.4326, -99.1332], 'mexico city': [19.4326, -99.1332], 'tokyo, japan': [35.6762, 139.6503],
  'sydney, australia': [-33.8688, 151.2093], 'berlin, germany': [52.52, 13.405], 'paris, france': [48.8566, 2.3522],
  'united states': [39.5, -98.35], 'usa': [39.5, -98.35]
};

let ready = false, warming = false, warmed = false;
async function ensureGeocache(seq) {
  if (ready) return;
  await seq.query(`CREATE TABLE IF NOT EXISTS ju_geocache (
    place TEXT PRIMARY KEY, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    ok BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now());`);
  for (const [place, c] of Object.entries(SEED)) {
    await seq.query(`INSERT INTO ju_geocache (place,lat,lng,ok) VALUES (:p,:lat,:lng,:ok) ON CONFLICT (place) DO NOTHING`,
      { replacements: { p: place, lat: c[0], lng: c[1], ok: true }, type: QueryTypes.INSERT }).catch(() => {});
  }
  ready = true;
}

// Normalize a messy location string to a lookup key: lowercase, drop punctuation, collapse
// spaces, strip trailing country noise, and map full US state names -> abbreviations so
// "Tampa Florida United States" and "Tampa, FL" resolve to the same key.
const STATE = { alabama:'al',alaska:'ak',arizona:'az',arkansas:'ar',california:'ca',colorado:'co',connecticut:'ct',delaware:'de',florida:'fl',georgia:'ga',hawaii:'hi',idaho:'id',illinois:'il',indiana:'in',iowa:'ia',kansas:'ks',kentucky:'ky',louisiana:'la',maine:'me',maryland:'md',massachusetts:'ma',michigan:'mi',minnesota:'mn',mississippi:'ms',missouri:'mo',montana:'mt',nebraska:'ne',nevada:'nv','new hampshire':'nh','new jersey':'nj','new mexico':'nm','new york':'ny','north carolina':'nc','north dakota':'nd',ohio:'oh',oklahoma:'ok',oregon:'or',pennsylvania:'pa','rhode island':'ri','south carolina':'sc','south dakota':'sd',tennessee:'tn',texas:'tx',utah:'ut',vermont:'vt',virginia:'va',washington:'wa','west virginia':'wv',wisconsin:'wi',wyoming:'wy' };
function normPlace(raw) {
  let s = String(raw || '').toLowerCase().replace(/[().]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\bunited states of america\b|\bunited states\b|\bu\.?s\.?a\.?\b/g, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/,\s*$/, '').trim();
  for (const [name, ab] of Object.entries(STATE)) s = s.replace(new RegExp('\\b' + name + '\\b'), ab);
  s = s.replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/,\s*/g, ', ').replace(/,\s*$/, '').trim();
  // "tampa fl" -> "tampa, fl"
  const m = s.match(/^([a-z .'-]+?)[ ,]+([a-z]{2})$/);
  if (m) s = m[1].trim() + ', ' + m[2];
  return s;
}
function isRemote(raw) { return /remote|anywhere|work from home|wfh/i.test(String(raw || '')); }

async function httpJson(url) {
  if (typeof fetch !== 'function') return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; } finally { clearTimeout(t); }
}

// Cache-first geocode. allowLive=false means "cache only" (used in the request path).
async function geocode(seq, raw, allowLive) {
  const place = normPlace(raw);
  if (!place || isRemote(raw)) return null;
  const hit = await seq.query('SELECT lat,lng,ok FROM ju_geocache WHERE place=:p', { replacements: { p: place }, type: QueryTypes.SELECT });
  if (hit[0]) return (hit[0].ok && hit[0].lat != null) ? { lat: +hit[0].lat, lng: +hit[0].lng } : null;
  if (!allowLive) return null;
  const j = await httpJson(`${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(place)}`);
  let lat = null, lng = null, ok = false;
  if (Array.isArray(j) && j[0]) { lat = +j[0].lat; lng = +j[0].lon; ok = Number.isFinite(lat) && Number.isFinite(lng); }
  await seq.query(`INSERT INTO ju_geocache (place,lat,lng,ok) VALUES (:p,:lat,:lng,:ok) ON CONFLICT (place) DO NOTHING`,
    { replacements: { p: place, lat, lng, ok }, type: QueryTypes.INSERT }).catch(() => {});
  return ok ? { lat, lng } : null;
}

// Background: geocode the pool's most common cities at a polite ~1/sec so the map fills in.
// Runs once per process; never blocks a request.
async function warmGeocache(seq) {
  if (warming || warmed) return;
  warming = true;
  try {
    const rows = await seq.query(
      `SELECT location, count(*)::int n FROM cv_jobs WHERE location <> '' AND fetched_at > now() - interval '21 days'
        GROUP BY location ORDER BY n DESC LIMIT 400`, { type: QueryTypes.SELECT }
    );
    for (const r of rows) {
      const place = normPlace(r.location);
      if (!place || isRemote(r.location)) continue;
      const hit = await seq.query('SELECT 1 FROM ju_geocache WHERE place=:p', { replacements: { p: place }, type: QueryTypes.SELECT });
      if (hit[0]) continue;                    // already known (seed or prior warm)
      await geocode(seq, r.location, true);    // live + cache
      await new Promise((res) => setTimeout(res, 1100)); // Nominatim politeness
    }
    warmed = true;
  } catch (e) { /* best-effort */ } finally { warming = false; }
}

function payText(min, max, period) {
  if (!min && !max) return null;
  const per = period === 'hour' ? '/hr' : period === 'year' ? '/yr' : '';
  const f = (n) => '$' + Math.round(n).toLocaleString('en-US');
  if (min && max) return `${f(min)}–${f(max)}${per}`;
  return `${f(min || max)}${per}`;
}

async function searchAdzuna({ what, where, limit }) {
  const p = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY,
    results_per_page: String(Math.min(limit || 50, 50)), 'content-type': 'application/json'
  });
  if (what) p.set('what', what);
  if (where) p.set('where', where);
  const j = await httpJson(`https://api.adzuna.com/v1/api/jobs/us/search/1?${p.toString()}`);
  const rows = (j && Array.isArray(j.results)) ? j.results : [];
  return rows.map((r) => {
    const loc = (r.location && r.location.display_name) || '';
    return {
      title: String(r.title || '').replace(/<[^>]+>/g, '').trim(),
      company: (r.company && r.company.display_name) || 'Company',
      location: loc, remote: isRemote(loc),
      lat: Number.isFinite(r.latitude) ? r.latitude : null,
      lng: Number.isFinite(r.longitude) ? r.longitude : null,
      url: r.redirect_url || '', posted_at: r.created || null,
      pay: payText(r.salary_min, r.salary_max, 'year')
    };
  }).filter((x) => x.title && x.url);
}

async function searchPool(seq, { what, where, remote, limit }) {
  const repl = {};
  const clauses = [`fetched_at > now() - interval '21 days'`];
  if (what) { repl.q = '%' + what.trim() + '%'; clauses.push(`(title ILIKE :q OR company ILIKE :q OR description ILIKE :q)`); }
  if (where && !isRemote(where)) { repl.w = '%' + where.trim() + '%'; clauses.push(`(location ILIKE :w)`); }
  if (remote === true) clauses.push(`(remote = true OR location ILIKE '%remote%')`);
  const rows = await seq.query(
    `SELECT title, company, location, remote, url, posted_at, comp_min, comp_max, comp_period
       FROM cv_jobs WHERE ${clauses.join(' AND ')}
       ORDER BY posted_at DESC NULLS LAST LIMIT :lim`,
    { replacements: { ...repl, lim: Math.min(limit || 120, 150) }, type: QueryTypes.SELECT }
  );
  // CACHE-ONLY geocoding in ONE batch query — keeps the request fast (no per-city round-trips).
  // warmGeocache fills any not-yet-cached cities in the background.
  const distinct = [...new Set(rows.map((r) => normPlace(r.location)).filter((p) => p && !isRemote(p)))];
  const coords = {};
  if (distinct.length) {
    const cached = await seq.query(
      `SELECT place,lat,lng FROM ju_geocache WHERE ok=true AND lat IS NOT NULL AND place IN (:ps)`,
      { replacements: { ps: distinct }, type: QueryTypes.SELECT }
    );
    cached.forEach((c) => { coords[c.place] = { lat: +c.lat, lng: +c.lng }; });
  }
  warmGeocache(seq);   // fire-and-forget
  return rows.map((r) => {
    const c = coords[normPlace(r.location)] || null;
    return {
      title: r.title, company: r.company, location: r.location || '', remote: !!r.remote || isRemote(r.location),
      lat: c ? c.lat : null, lng: c ? c.lng : null,
      url: r.url, posted_at: r.posted_at, pay: payText(r.comp_min, r.comp_max, r.comp_period)
    };
  });
}

async function search({ what = '', where = '', remote, limit } = {}) {
  const seq = db.sequelize();
  if (!seq) return { source: 'none', center: US_CENTER, jobs: [], count: 0, mapped: 0, adzuna: false, note: 'database unavailable' };
  await ensureGeocache(seq);
  const adzuna = jobsource.adzunaActive();
  let jobs, source;
  if (adzuna) { jobs = await searchAdzuna({ what, where, limit }); source = 'adzuna'; }
  else { jobs = await searchPool(seq, { what, where, remote, limit }); source = 'pool'; }

  let center = where ? await geocode(seq, where, true) : null;   // one live call for the searched area
  const placed = jobs.filter((j) => j.lat != null && j.lng != null);
  if (!center && placed.length) center = { lat: placed[0].lat, lng: placed[0].lng };
  if (!center) center = US_CENTER;

  // EVERY MAP SEARCH FEEDS THE HUNTER. These are live US openings the engine
  // did not otherwise hold: Adzuna was wired to this map alone, so the fifty
  // roles a subscriber could see here were never scored by the agent whose job
  // is to find them. Now the same postings enter the shared pool, through the
  // same ingest and the same dedupe key as everything else.
  //
  // Fire-and-forget on purpose: a map search is somebody waiting on a page.
  // Ingest failing must cost them nothing, so it is never awaited and never
  // surfaces — the scheduled refresh is what guarantees coverage, and this is
  // opportunistic on top of it.
  if (adzuna && jobs.length) {
    setImmediate(() => { ingestMapResults(jobs).catch(() => {}); });
  }

  return {
    source, adzuna, center, count: jobs.length, mapped: placed.length,
    jobs: jobs.slice(0, limit || 120),
    note: adzuna ? null : 'Live openings placed by city — the map keeps filling in as we map more locations. Add a free Adzuna key for full local coverage.'
  };
}

/** Map rows -> the ingest shape, grouped by employer so each keeps its own. */
async function ingestMapResults(rows) {
  const byEmployer = new Map();
  rows.forEach((r) => {
    if (!r.title || !r.url) return;
    const employer = r.company || 'Unknown employer';
    if (!byEmployer.has(employer)) byEmployer.set(employer, []);
    byEmployer.get(employer).push({
      external_id: null,
      title: r.title,
      location: r.location || '',
      url: r.url,
      description: '',
      // `pay` is display text and Adzuna's may be a PREDICTION rather than
      // something the employer wrote. The pool stores only stated figures, so
      // this deliberately carries none: enrichment fills the body later.
      compensation: null,
      posted_at: r.posted_at || null,
    });
  });
  for (const [employer, list] of byEmployer) {
    await jobsource.ingest(list, { source: 'adzuna', employer });
  }
}

module.exports = { search, geocode, ensureGeocache, warmGeocache, ingestMapResults };
