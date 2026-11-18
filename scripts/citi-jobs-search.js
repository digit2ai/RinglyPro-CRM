#!/usr/bin/env node
// Search Citi's open requisitions on its own Workday feed (read only).
//
//   node scripts/citi-jobs-search.js "<keywords>" [location] [--exclude=id,id] [--json]
//
//   node scripts/citi-jobs-search.js "IT Project Technology Lead" Tampa
//   node scripts/citi-jobs-search.js "project manager; program manager" "Irving"
//
// Keywords separated by ";" or "," are searched one by one and merged.
// The location is matched against Citi's own location list (the "locations"
// facet), so "Tampa" resolves to Citi's Tampa id. No match = the run stops and
// prints the closest names instead of silently searching everywhere.
//
// Same feed the citijobs tracker reads: tenant citi, datacenter wd5, site 2.
// Only /wday/cxs/ is used (robots.txt). Paced, and retries a 429 with backoff,
// because a burst of queries gets the caller rate-limited for minutes.
// Writes nothing anywhere.

const URL_ = 'https://citi.wd5.myworkdayjobs.com/wday/cxs/citi/2/jobs';
const APPLY = 'https://citi.wd5.myworkdayjobs.com/2';
const PAGE = 20, MAX_PER_TERM = 200, PACE_MS = 1500;

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => {
  const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v];
}));
const pos = args.filter(a => !a.startsWith('--'));
const keywords = (pos[0] || '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
const location = (pos[1] || '').trim();
const exclude = new Set(String(flags.exclude || '').split(',').map(s => s.trim()).filter(Boolean));

if (!keywords.length) {
  console.error('Usage: node scripts/citi-jobs-search.js "<keywords>" [location] [--exclude=id,id] [--json]');
  process.exit(2);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function post(body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let r;
    try {
      r = await Promise.race([
        fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json',
          'user-agent': 'CitiJobsSearch/1.0 (personal job search)' }, body: JSON.stringify(body) }),
        new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 25000)),
      ]);
    } catch (e) { await sleep(2000 * (attempt + 1)); continue; }
    if (r.status === 429 || r.status >= 500) {
      const wait = Math.min(60000, 5000 * 2 ** attempt);
      process.stderr.write(`  Citi answered ${r.status}, waiting ${Math.round(wait / 1000)}s...\n`);
      await sleep(wait); continue;
    }
    if (!r.ok) throw new Error(`Citi answered ${r.status}`);
    return r.json();
  }
  throw new Error('Citi kept refusing (rate limit). Try again in a few minutes.');
}

// Walk the facet tree (Workday nests location values under groups).
function locationValues(facets) {
  const out = [];
  (function walk(list, param) {
    for (const f of list || []) {
      const p = f.facetParameter || param;
      if (Array.isArray(f.values)) {
        for (const v of f.values) {
          if (v.id && v.descriptor && /location/i.test(p || '')) out.push({ param: p, id: v.id, name: v.descriptor, count: v.count });
          if (v.values) walk([v], p);
        }
      }
    }
  })(facets, null);
  return out;
}

// Verified 2026-11 against the feed; used only if the facet list cannot be read.
const KNOWN = { tampa: { param: 'locations', ids: ['6669335a15de010f6e579927610016a0'], names: ['Tampa Florida United States'] } };

async function resolveLocation(name) {
  const d = await post({ appliedFacets: {}, limit: PAGE, offset: 0, searchText: '' });
  const all = locationValues(d.facets);
  if (!all.length && KNOWN[fold(name)]) return KNOWN[fold(name)];
  const want = fold(name);
  const hits = all.filter(l => fold(l.name).includes(want));
  if (!hits.length) {
    const close = all.filter(l => fold(l.name).split(/\W+/).some(w => w && want.includes(w))).slice(0, 10);
    throw new Error(`No Citi location matches "${name}".` + (close.length ? ' Closest: ' + close.map(c => c.name).join('; ') : ''));
  }
  // Group by facet parameter; prefer the plain "locations" facet.
  const byParam = {};
  for (const h of hits) (byParam[h.param] = byParam[h.param] || []).push(h.id);
  const param = byParam.locations ? 'locations' : Object.keys(byParam)[0];
  return { param, ids: byParam[param], names: hits.filter(h => h.param === param).map(h => h.name) };
}

(async () => {
  let facets = {}, locLabel = 'all locations';
  if (location) {
    const loc = await resolveLocation(location);
    facets = { [loc.param]: loc.ids };
    locLabel = loc.names.join('; ');
    await sleep(PACE_MS);
  }

  const found = new Map();
  for (const term of keywords) {
    for (let off = 0; off < MAX_PER_TERM; off += PAGE) {
      const d = await post({ appliedFacets: facets, limit: PAGE, offset: off, searchText: term });
      const posts = d.jobPostings || [];
      for (const j of posts) {
        const id = (j.bulletFields || [])[0] || j.externalPath;
        if (!id || exclude.has(id)) continue;
        const prev = found.get(id);
        if (prev) { prev.matched.add(term); continue; }
        found.set(id, { id, title: j.title, location: j.locationsText, posted: j.postedOn,
          url: j.externalPath ? APPLY + j.externalPath : null, matched: new Set([term]) });
      }
      await sleep(PACE_MS);
      if (posts.length < PAGE) break;
    }
  }

  // Rank: how many keywords hit it, then how many keyword words appear in the title.
  const words = [...new Set(keywords.flatMap(k => fold(k).split(/\W+/)).filter(w => w.length > 2))];
  const rows = [...found.values()].map(r => ({ ...r, matched: [...r.matched],
    title_hits: words.filter(w => fold(r.title).includes(w)).length }))
    .sort((a, b) => b.matched.length - a.matched.length || b.title_hits - a.title_hits || String(b.id).localeCompare(String(a.id)));

  if (flags.json) { console.log(JSON.stringify({ keywords, location: locLabel, count: rows.length, rows }, null, 2)); return; }
  console.log(`Citi open requisitions · keywords: ${keywords.join(' | ')} · location: ${locLabel} · ${rows.length} found\n`);
  for (const r of rows) console.log([r.id, r.title, r.location, r.posted, r.url].join(' | '));
})().catch(e => { console.error(e.message); process.exit(1); });
