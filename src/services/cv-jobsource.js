// CV Talent Engine — Phase 1 job discovery + matching.
// Sources REAL, live job postings from public/keyless ATS boards (Greenhouse, Ashby),
// plus an optional Adzuna connector (dormant until ADZUNA_APP_ID/KEY are set), normalizes
// them into one shape, and matches them to a candidate profile with a two-stage pipeline:
//   Stage 1  lexical recall (role/keyword overlap) -> shortlist
//   Stage 2  Claude Haiku fit-score + "why it fits" + gaps on the shortlist (cost-capped)
// Honesty: the fit score is a real model judgment when ANTHROPIC_API_KEY is set; without a
// key it degrades to a labeled heuristic score (is_simulated:true). Never invents jobs.
//
// The functions take the caller's Sequelize instance + QueryTypes + claude() helper so this
// module reuses cv-engine's DB connection and Anthropic wiring (no new keys, no new pool).

// ---- Verified company boards (each confirmed to return live jobs, July 2026) ----
// Skewed toward fintech / banking / compliance (Ana, Andrea), AI/eng (Manuel) and
// sales roles that exist across all of them. A dead token just returns 0 and is skipped.
const SOURCES = [
  // Greenhouse (boards-api.greenhouse.io) — content is HTML-entity-encoded
  { ats: 'greenhouse', token: 'stripe',     company: 'Stripe' },
  { ats: 'greenhouse', token: 'coinbase',   company: 'Coinbase' },
  { ats: 'greenhouse', token: 'databricks', company: 'Databricks' },
  { ats: 'greenhouse', token: 'anthropic',  company: 'Anthropic' },
  { ats: 'greenhouse', token: 'brex',       company: 'Brex' },
  { ats: 'greenhouse', token: 'robinhood',  company: 'Robinhood' },
  { ats: 'greenhouse', token: 'affirm',     company: 'Affirm' },
  { ats: 'greenhouse', token: 'chime',      company: 'Chime' },
  { ats: 'greenhouse', token: 'sofi',       company: 'SoFi' },
  { ats: 'greenhouse', token: 'marqeta',    company: 'Marqeta' },
  { ats: 'greenhouse', token: 'betterment', company: 'Betterment' },
  { ats: 'greenhouse', token: 'fireblocks', company: 'Fireblocks' },
  { ats: 'greenhouse', token: 'flexport',   company: 'Flexport' },
  { ats: 'greenhouse', token: 'gusto',      company: 'Gusto' },
  { ats: 'greenhouse', token: 'airbnb',     company: 'Airbnb' },
  { ats: 'greenhouse', token: 'dropbox',    company: 'Dropbox' },
  // Ashby (api.ashbyhq.com/posting-api/job-board) — clean descriptionPlain
  { ats: 'ashby', token: 'openai',  company: 'OpenAI' },
  { ats: 'ashby', token: 'ramp',    company: 'Ramp' },
  { ats: 'ashby', token: 'notion',  company: 'Notion' },
  { ats: 'ashby', token: 'linear',  company: 'Linear' },
  { ats: 'ashby', token: 'vanta',   company: 'Vanta' },
  { ats: 'ashby', token: 'runway',  company: 'Runway' }
];

const POOL_CAP = 6000;         // max jobs kept fetched-fresh in the pool
const FETCH_TIMEOUT_MS = 12000;
const CONCURRENCY = 5;

function adzunaActive() { return !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY); }

// ---- text helpers ----
function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, "'").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…');
}
function stripHtml(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function httpJson(url) {
  if (typeof fetch !== 'function') return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'RinglyPro-CV-Agent/1.0 (+https://manuelstagg.com)' } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

// ---- normalizers per ATS ----
async function fetchGreenhouse(company, token) {
  const j = await httpJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
  if (!j || !Array.isArray(j.jobs)) return [];
  return j.jobs.map((x) => {
    const loc = (x.location && x.location.name) || '';
    return {
      source: 'greenhouse', source_id: `gh:${token}:${x.id}`, company,
      title: String(x.title || '').trim(), location: loc, remote: /remote/i.test(loc),
      url: x.absolute_url, description: stripHtml(x.content).slice(0, 5000),
      posted_at: x.updated_at || null
    };
  });
}
async function fetchAshby(company, token) {
  const j = await httpJson(`https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=false`);
  if (!j || !Array.isArray(j.jobs)) return [];
  return j.jobs.filter((x) => x.isListed !== false).map((x) => ({
    source: 'ashby', source_id: `ashby:${token}:${x.id}`, company,
    title: String(x.title || '').trim(), location: x.location || '', remote: !!x.isRemote,
    url: x.jobUrl || x.applyUrl, description: String(x.descriptionPlain || '').replace(/\s+/g, ' ').trim().slice(0, 5000),
    posted_at: x.publishedAt || null
  }));
}
// Adzuna — search-based; only used when keys are set (per-profile augment)
async function fetchAdzuna(query, where) {
  if (!adzunaActive()) return [];
  const p = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY,
    results_per_page: '30', what: query, 'content-type': 'application/json'
  });
  if (where) p.set('where', where);
  const j = await httpJson(`https://api.adzuna.com/v1/api/jobs/us/search/1?${p.toString()}`);
  if (!j || !Array.isArray(j.results)) return [];
  return j.results.map((r) => ({
    source: 'adzuna', source_id: `adzuna:${r.id}`,
    company: (r.company && r.company.display_name) || 'Company',
    title: String(r.title || '').replace(/<[^>]+>/g, '').trim(),
    location: (r.location && r.location.display_name) || '', remote: /remote/i.test((r.location && r.location.display_name) || ''),
    url: r.redirect_url, description: stripHtml(r.description).slice(0, 5000), posted_at: r.created || null
  }));
}

// run async mapper with a small concurrency cap
async function pooled(items, n, fn) {
  const out = []; let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

async function upsertJobs(sequelize, QueryTypes, jobs) {
  let n = 0;
  for (const job of jobs) {
    if (!job || !job.title || !job.url || !job.source_id) continue;
    await sequelize.query(
      `INSERT INTO cv_jobs (source, source_id, company, title, location, remote, url, description, posted_at, fetched_at)
       VALUES (:source,:source_id,:company,:title,:location,:remote,:url,:description,:posted_at, now())
       ON CONFLICT (source_id) DO UPDATE SET title=EXCLUDED.title, location=EXCLUDED.location, remote=EXCLUDED.remote,
         url=EXCLUDED.url, description=EXCLUDED.description, posted_at=EXCLUDED.posted_at, fetched_at=now()`,
      { replacements: {
          source: job.source, source_id: job.source_id, company: job.company || '', title: job.title.slice(0, 400),
          location: (job.location || '').slice(0, 200), remote: !!job.remote, url: job.url.slice(0, 800),
          description: (job.description || '').slice(0, 5000), posted_at: job.posted_at || null
        }, type: QueryTypes.INSERT }
    ).then(() => { n++; }).catch(() => {});
  }
  return n;
}

// Fetch every configured board and upsert into cv_jobs. Shared across all profiles.
async function refreshJobPool(sequelize, QueryTypes, opts = {}) {
  const perSource = [];
  const results = await pooled(SOURCES, CONCURRENCY, async (s) => {
    let jobs = [];
    try { jobs = s.ats === 'greenhouse' ? await fetchGreenhouse(s.company, s.token) : await fetchAshby(s.company, s.token); }
    catch (e) { jobs = []; }
    perSource.push({ company: s.company, ats: s.ats, count: jobs.length, ok: jobs.length > 0 });
    return jobs;
  });
  const all = results.flat();
  const upserted = await upsertJobs(sequelize, QueryTypes, all);
  // prune stale (not seen in this refresh window) to keep the pool bounded and fresh
  await sequelize.query(`DELETE FROM cv_jobs WHERE fetched_at < now() - interval '14 days'`).catch(() => {});
  const cnt = await sequelize.query(`SELECT count(*)::int AS n FROM cv_jobs`, { type: QueryTypes.SELECT }).catch(() => [{ n: 0 }]);
  return { pool_size: (cnt[0] && cnt[0].n) || 0, upserted, sources: perSource.sort((a, b) => b.count - a.count) };
}

// ---- matching ----
const STOP = new Set(('a an the and or of to in for with on at by from as is are be we you your our their this that will can new role team work experience years about across including etc us who what how job jobs position opportunity opportunities company companies please apply help support strong plus').split(' '));
function tokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9+#/ ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
}
function profileTerms(p) {
  const roleText = (p.target_roles || '') + ' ' + (p.headline || '');
  const phrases = (p.target_roles || '').toLowerCase().split(/[;,/]|\band\b/).map((x) => x.trim()).filter((x) => x.length >= 4);
  const kw = new Set(tokens(roleText + ' ' + (p.summary || '')));
  return { kw, phrases };
}
function lexicalScore(job, terms) {
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase();
  let s = 0;
  const tset = new Set(tokens(job.title));
  const dset = new Set(tokens(job.description));
  for (const k of terms.kw) { if (tset.has(k)) s += 3; else if (dset.has(k)) s += 1; }
  for (const ph of terms.phrases) { if (title.includes(ph)) s += 6; else if (desc.includes(ph)) s += 2; }
  if (job.remote) s += 0.5;
  return s;
}

async function scoreJobWithClaude(claude, p, job) {
  const system = 'You are a precise recruiter matching one candidate to one job. Output STRICT JSON only: {"score":0-100,"verdict":"strong|possible|weak","why":"1-2 sentences, specific to THIS role and candidate","gaps":"one short phrase on what is missing, or empty string"}. Be honest and calibrated: 80-100 only for a clear fit, 50-79 plausible, below 50 weak. Never invent candidate experience.';
  const user = `CANDIDATE\nName: ${p.name}\nHeadline: ${p.headline}\nTarget roles: ${p.target_roles}\nSummary: ${p.summary}\n\nJOB\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\nDescription: ${String(job.description || '').slice(0, 1600)}`;
  const raw = await claude(system, user, 320);
  if (raw) { try { const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    if (typeof o.score === 'number') return { score: Math.max(0, Math.min(100, Math.round(o.score))), verdict: o.verdict || 'possible', why: String(o.why || '').slice(0, 400), gaps: String(o.gaps || '').slice(0, 200), is_simulated: false };
  } catch (e) {} }
  return null;
}

// Match the pool against one profile. limit = how many top-shortlist jobs to LLM-score per run.
async function scoreProfile(sequelize, QueryTypes, claude, p, opts = {}) {
  const limit = opts.limit || 12;
  const recall = opts.recall || 60;
  const terms = profileTerms(p);

  // Optional Adzuna augment (only when keys set): search the profile's first role + location
  if (adzunaActive()) {
    const q = ((p.target_roles || '').split(/[;,]/)[0] || p.headline || '').replace(/[^a-zA-Z ]/g, ' ').trim().slice(0, 60);
    const where = (p.location || '').split(',')[0] || '';
    try { const az = await fetchAdzuna(q, where); if (az.length) await upsertJobs(sequelize, QueryTypes, az); } catch (e) {}
  }

  // Candidate pool: fresh jobs not already dismissed by this profile
  const jobs = await sequelize.query(
    `SELECT j.* FROM cv_jobs j
       WHERE j.fetched_at > now() - interval '14 days'
         AND NOT EXISTS (SELECT 1 FROM cv_job_matches m WHERE m.job_id=j.id AND m.profile_id=:pid AND m.status='dismissed')
       ORDER BY j.posted_at DESC NULLS LAST
       LIMIT 4000`,
    { replacements: { pid: p.id }, type: QueryTypes.SELECT }
  );

  // Stage 1 — lexical recall
  const ranked = jobs.map((j) => ({ j, ls: lexicalScore(j, terms) }))
    .filter((x) => x.ls > 0)
    .sort((a, b) => b.ls - a.ls)
    .slice(0, recall);

  // Prefer scoring jobs this profile hasn't seen yet; fall back to re-scoring top ones
  const existing = await sequelize.query(
    `SELECT job_id FROM cv_job_matches WHERE profile_id=:pid`, { replacements: { pid: p.id }, type: QueryTypes.SELECT }
  );
  const seen = new Set(existing.map((r) => Number(r.job_id)));
  const fresh = ranked.filter((x) => !seen.has(Number(x.j.id)));
  const toScore = (fresh.length ? fresh : ranked).slice(0, limit);

  let scored = 0, simulated = false;
  for (const { j, ls } of toScore) {
    let r = await scoreJobWithClaude(claude, p, j);
    if (!r) { // heuristic fallback (labeled)
      simulated = true;
      const norm = Math.max(20, Math.min(95, Math.round(40 + ls * 4)));
      r = { score: norm, verdict: norm >= 75 ? 'strong' : norm >= 55 ? 'possible' : 'weak',
            why: `Keyword and role alignment with your target roles (${p.target_roles.split(';')[0].trim()}). AI fit-scoring is offline (no model key), so this is a heuristic estimate.`,
            gaps: '', is_simulated: true };
    }
    await sequelize.query(
      `INSERT INTO cv_job_matches (profile_id, job_id, score, verdict, why, gaps, is_simulated, status, created_at, updated_at)
       VALUES (:pid,:jid,:score,:verdict,:why,:gaps,:sim,'new', now(), now())
       ON CONFLICT (profile_id, job_id) DO UPDATE SET score=EXCLUDED.score, verdict=EXCLUDED.verdict,
         why=EXCLUDED.why, gaps=EXCLUDED.gaps, is_simulated=EXCLUDED.is_simulated, updated_at=now()`,
      { replacements: { pid: p.id, jid: j.id, score: r.score, verdict: r.verdict, why: r.why, gaps: r.gaps, sim: r.is_simulated }, type: QueryTypes.INSERT }
    ).then(() => { scored++; }).catch(() => {});
  }
  const total = await sequelize.query(`SELECT count(*)::int AS n FROM cv_job_matches WHERE profile_id=:pid`, { replacements: { pid: p.id }, type: QueryTypes.SELECT });
  return { considered: jobs.length, shortlisted: ranked.length, scored, matches_total: (total[0] && total[0].n) || 0, is_simulated: simulated };
}

module.exports = { SOURCES, adzunaActive, refreshJobPool, scoreProfile };
