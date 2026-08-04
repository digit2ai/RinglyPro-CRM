// CV Talent Engine — job discovery + matching.
//
// Sources REAL, live job postings from public/keyless ATS boards, normalizes them into one
// shape, and matches them to a candidate with a two-stage pipeline:
//   Stage 1  lexical recall driven by the profile's SETTINGS (role targets, weights)
//   Stage 2  Claude Haiku fit-score + "why it fits" + gaps on the shortlist (cost-capped)
//
// The job POOL is shared infrastructure — one fetch serves every profile. TARGETING is
// per profile: country policy, role targets, industries, excluded employers, dealbreakers
// and the employer watchlist all come from that person's settings document. Nothing about
// any individual is hardcoded here.
//
// Honesty: the fit score is a real model judgment when ANTHROPIC_API_KEY is set; without a key
// it degrades to a labeled heuristic score (is_simulated:true). Never invents jobs, never
// invents a salary, never fabricates coverage for an employer whose board is unreachable.

const targeting = require('./cv-targeting');
const employers = require('./cv-employers');

// ---- Legacy verified boards. These now also SEED the shared employer registry, which is the
// long-term source of truth; keeping the array means a registry-less deployment still works. ----
const SOURCES = [
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
  { ats: 'ashby', token: 'openai',  company: 'OpenAI' },
  { ats: 'ashby', token: 'ramp',    company: 'Ramp' },
  { ats: 'ashby', token: 'notion',  company: 'Notion' },
  { ats: 'ashby', token: 'linear',  company: 'Linear' },
  { ats: 'ashby', token: 'vanta',   company: 'Vanta' },
  { ats: 'ashby', token: 'runway',  company: 'Runway' }
];

const FETCH_TIMEOUT_MS = 12000;
const CONCURRENCY = 5;

// Haiku list price, used to derive a real per-profile call budget from the dollar cap.
const COST_PER_SCORE_USD = 0.003;   // ~2.5k input + ~250 output tokens per scoring call

function adzunaActive() { return !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY); }

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, "'").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, '-').replace(/&ndash;/g, '-').replace(/&hellip;/g, '...');
}
function stripHtml(s) { return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }

async function httpJson(url) {
  if (typeof fetch !== 'function') return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'RinglyPro-CV-Agent/2.0 (+https://manuelstagg.com)' } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

async function fetchGreenhouse(company, token) {
  const j = await httpJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
  if (!j || !Array.isArray(j.jobs)) return [];
  return j.jobs.map((x) => {
    const loc = (x.location && x.location.name) || '';
    return { source: 'greenhouse', source_id: `gh:${token}:${x.id}`, company,
      title: String(x.title || '').trim(), location: loc, remote: /remote/i.test(loc),
      url: x.absolute_url, description: stripHtml(x.content).slice(0, 5000), posted_at: x.updated_at || null };
  });
}
async function fetchAshby(company, token) {
  const j = await httpJson(`https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`);
  if (!j || !Array.isArray(j.jobs)) return [];
  return j.jobs.filter((x) => x.isListed !== false).map((x) => ({
    source: 'ashby', source_id: `ashby:${token}:${x.id}`, company,
    title: String(x.title || '').trim(), location: x.location || '', remote: !!x.isRemote,
    url: x.jobUrl || x.applyUrl, description: String(x.descriptionPlain || '').replace(/\s+/g, ' ').trim().slice(0, 5000),
    posted_at: x.publishedAt || null }));
}
async function fetchAdzuna(query, where) {
  if (!adzunaActive()) return [];
  const p = new URLSearchParams({ app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY,
    results_per_page: '30', what: query, 'content-type': 'application/json' });
  if (where) p.set('where', where);
  const j = await httpJson(`https://api.adzuna.com/v1/api/jobs/us/search/1?${p.toString()}`);
  if (!j || !Array.isArray(j.results)) return [];
  return j.results.map((r) => ({
    source: 'adzuna', source_id: `adzuna:${r.id}`, company: (r.company && r.company.display_name) || 'Company',
    title: String(r.title || '').replace(/<[^>]+>/g, '').trim(),
    location: (r.location && r.location.display_name) || '', remote: /remote/i.test((r.location && r.location.display_name) || ''),
    url: r.redirect_url, description: stripHtml(r.description).slice(0, 5000), posted_at: r.created || null }));
}

async function pooled(items, n, fn) {
  const out = []; let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

async function upsertJobs(sequelize, QueryTypes, jobs, employerId) {
  let n = 0;
  for (const job of jobs) {
    if (!job || !job.title || !job.url || !job.source_id) continue;
    const comp = targeting.parseCompensation(job.description);
    await sequelize.query(
      `INSERT INTO cv_jobs (source, source_id, company, title, location, remote, url, description, posted_at, fetched_at,
                            dedupe_key, employer_id, comp_min, comp_max, comp_period)
       VALUES (:source,:source_id,:company,:title,:location,:remote,:url,:description,:posted_at, now(),
               :dk,:eid,:cmin,:cmax,:cper)
       ON CONFLICT (source_id) DO UPDATE SET title=EXCLUDED.title, location=EXCLUDED.location, remote=EXCLUDED.remote,
         url=EXCLUDED.url, description=EXCLUDED.description, posted_at=EXCLUDED.posted_at, fetched_at=now(),
         dedupe_key=EXCLUDED.dedupe_key, employer_id=COALESCE(EXCLUDED.employer_id, cv_jobs.employer_id),
         comp_min=EXCLUDED.comp_min, comp_max=EXCLUDED.comp_max, comp_period=EXCLUDED.comp_period`,
      { replacements: {
          source: job.source, source_id: job.source_id, company: job.company || '', title: job.title.slice(0, 400),
          location: (job.location || '').slice(0, 200), remote: !!job.remote, url: job.url.slice(0, 800),
          description: (job.description || '').slice(0, 5000), posted_at: job.posted_at || null,
          dk: targeting.dedupeKey(job).slice(0, 400), eid: employerId || null,
          cmin: comp ? comp.min : null, cmax: comp ? comp.max : null, cper: comp ? comp.period : null
        }, type: QueryTypes.INSERT }
    ).then(() => { n++; }).catch(() => {});
  }
  return n;
}

/**
 * Refresh the SHARED job pool: the legacy verified boards plus every employer the registry has
 * probed as live. Runs in the background (dozens of boards always exceed Cloudflare's ceiling).
 */
async function refreshJobPool(sequelize, QueryTypes, opts = {}) {
  const perSource = [];

  const legacy = await pooled(SOURCES, CONCURRENCY, async (s) => {
    let jobs = [];
    try { jobs = s.ats === 'greenhouse' ? await fetchGreenhouse(s.company, s.token) : await fetchAshby(s.company, s.token); }
    catch (e) { jobs = []; }
    perSource.push({ company: s.company, ats: s.ats, count: jobs.length, ok: jobs.length > 0, via: 'core' });
    return jobs;
  });
  let upserted = await upsertJobs(sequelize, QueryTypes, legacy.flat());

  // Registry-driven employers (Phase 5). Only those probed LIVE are fetched; the rest carry an
  // honest status and contribute nothing rather than a fabricated posting.
  let registry = [];
  try { registry = await employers.liveEmployers(sequelize); } catch (e) { registry = []; }
  const known = new Set(SOURCES.map((s) => String(s.company).toLowerCase()));
  const extra = registry.filter((e) => !known.has(String(e.name).toLowerCase()));
  if (extra.length) {
    await pooled(extra, CONCURRENCY, async (e) => {
      let jobs = [];
      try { jobs = await employers.fetchEmployerJobs(e); } catch (err) { jobs = []; }
      perSource.push({ company: e.name, ats: e.ats, count: jobs.length, ok: jobs.length > 0, via: 'registry' });
      if (jobs.length) upserted += await upsertJobs(sequelize, QueryTypes, jobs, e.id);
      await sequelize.query('UPDATE cv_employers SET last_fetch_at=now(), last_count=:c WHERE id=:id',
        { replacements: { id: e.id, c: jobs.length }, type: QueryTypes.UPDATE }).catch(() => {});
      return jobs.length;
    });
  }

  await sequelize.query(`DELETE FROM cv_jobs WHERE fetched_at < now() - interval '14 days'`).catch(() => {});
  const cnt = await sequelize.query(`SELECT count(*)::int AS n FROM cv_jobs`, { type: QueryTypes.SELECT }).catch(() => [{ n: 0 }]);
  return { pool_size: (cnt[0] && cnt[0].n) || 0, upserted,
           sources: perSource.sort((a, b) => b.count - a.count),
           registry_employers: extra.length };
}

// ---- LLM scoring ----
async function scoreJobWithClaude(claude, p, job, settings) {
  const roles = ((settings && settings.targeting) || {}).roles || [];
  const roleLines = roles.map((r) => '- ' + r.title + (r.variants && r.variants.length ? ' (also: ' + r.variants.join(', ') + ')' : '') + (r.evidence ? ' | evidence: ' + r.evidence : '')).join('\n');
  const inds = ((settings && settings.targeting) || {}).industries || [];
  const system = 'You are a precise recruiter matching one candidate to one job. Output STRICT JSON only: {"score":0-100,"verdict":"strong|possible|weak","why":"1-2 sentences, specific to THIS role and candidate","gaps":"one short phrase on what is missing, or empty string"}. Be honest and calibrated: 80-100 only for a clear fit, 50-79 plausible, below 50 weak. Judge the candidate against the role they are TARGETING, using the evidence given — do not penalize a delivery-leadership target for lacking a different discipline. Never invent candidate experience.';
  const user = `CANDIDATE\nName: ${p.name}\nHeadline: ${(settings && settings.identity && settings.identity.headline) || p.headline}\n`
    + (roleLines ? `Target roles:\n${roleLines}\n` : `Target roles: ${p.target_roles}\n`)
    + (inds.length ? `Target industries: ${inds.join(', ')}\n` : '')
    + `Summary: ${p.summary}\n\nJOB\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\nDescription: ${String(job.description || '').slice(0, 1600)}`;
  const raw = await claude(system, user, 320);
  if (raw) {
    try {
      const o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      if (typeof o.score === 'number') return { score: Math.max(0, Math.min(100, Math.round(o.score))), verdict: o.verdict || 'possible',
        why: String(o.why || '').slice(0, 400), gaps: String(o.gaps || '').slice(0, 200), is_simulated: false };
    } catch (e) {}
  }
  return null;
}

/**
 * Match the shared pool against ONE profile using ITS settings.
 * opts: { settings, watchByCompany, limit, recall }
 */
async function scoreProfile(sequelize, QueryTypes, claude, p, opts = {}) {
  const settings = opts.settings || {};
  const eng = settings.engine || {};
  const watchByCompany = opts.watchByCompany || {};
  const recall = opts.recall || 80;

  // Derive the call budget from the dollar cap — a cost ceiling, not a magic number.
  const capCalls = Math.max(1, Math.floor((Number(eng.cost_cap_usd) || 1) / COST_PER_SCORE_USD));
  const limit = Math.min(opts.limit || eng.match_limit || 12, capCalls);

  const terms = targeting.buildTerms(p, settings);

  if (adzunaActive()) {
    const roles = (settings.targeting && settings.targeting.roles) || [];
    const q = (roles[0] && roles[0].title) || (String(p.target_roles || '').split(/[;,]/)[0]) || p.headline || '';
    const where = (p.location || '').split(',')[0] || '';
    try { const az = await fetchAdzuna(String(q).replace(/[^a-zA-Z ]/g, ' ').trim().slice(0, 60), where); if (az.length) await upsertJobs(sequelize, QueryTypes, az); } catch (e) {}
  }

  const rawJobs = await sequelize.query(
    `SELECT j.* FROM cv_jobs j
       WHERE j.fetched_at > now() - interval '14 days'
         AND NOT EXISTS (SELECT 1 FROM cv_job_matches m WHERE m.job_id=j.id AND m.profile_id=:pid AND m.status='dismissed')
       ORDER BY j.posted_at DESC NULLS LAST
       LIMIT 6000`,
    { replacements: { pid: p.id }, type: QueryTypes.SELECT });

  // Deduplicate reposts across sources before anything expensive happens.
  const jobs = targeting.dedupe(rawJobs).filter((j) => !targeting.isStale(j, 60));

  // Per-profile gates, then lexical recall with the watchlist boost.
  const gated = [];
  const rejected = { location: 0, excluded: 0, dealbreaker: 0, employment_type: 0 };
  jobs.forEach((j) => {
    const ev = targeting.evaluateJob(j, { settings, watchByCompany });
    if (!ev.allowed) {
      const r = (ev.reasons[0] || '');
      if (r.indexOf('location') === 0) rejected.location++;
      else if (r.indexOf('excluded') === 0 || r.indexOf('confidential') === 0) rejected.excluded++;
      else if (r.indexOf('dealbreaker') === 0) rejected.dealbreaker++;
      else rejected.employment_type++;
      return;
    }
    const ls = targeting.lexicalScore(j, terms) + targeting.watchBoost(ev.watch);
    if (ls <= 0) return;
    gated.push({ j, ls, ev });
  });

  const ranked = gated.sort((a, b) => b.ls - a.ls).slice(0, recall);

  const existing = await sequelize.query(`SELECT job_id FROM cv_job_matches WHERE profile_id=:pid`,
    { replacements: { pid: p.id }, type: QueryTypes.SELECT });
  const seen = new Set(existing.map((r) => Number(r.job_id)));
  const fresh = ranked.filter((x) => !seen.has(Number(x.j.id)));
  const toScore = (fresh.length ? fresh : ranked).slice(0, limit);

  const floor = Number((settings.targeting || {}).score_floor) || 0;
  let scored = 0, simulated = false, belowFloor = 0, spend = 0;

  for (const { j, ls, ev } of toScore) {
    let r = await scoreJobWithClaude(claude, p, j, settings);
    if (r) spend += COST_PER_SCORE_USD;
    if (!r) {
      simulated = true;
      const norm = Math.max(20, Math.min(95, Math.round(40 + ls * 2)));
      const firstRole = ((settings.targeting && settings.targeting.roles) || [])[0];
      r = { score: norm, verdict: norm >= 75 ? 'strong' : norm >= 55 ? 'possible' : 'weak',
            why: `Keyword and role alignment with your target roles${firstRole ? ' (' + firstRole.title + ')' : ''}. AI fit-scoring is offline (no model key), so this is a heuristic estimate.`,
            gaps: '', is_simulated: true };
    }
    if (r.score < floor) { belowFloor++; continue; }

    const flags = { location: ev.geo ? ev.geo.reason : null, flagged: ev.flagged, matched_country: ev.geo ? ev.geo.matched_country : null };
    await sequelize.query(
      `INSERT INTO cv_job_matches (profile_id, job_id, score, verdict, why, gaps, is_simulated, status, stage,
                                   target_employer, flags, created_at, updated_at)
       VALUES (:pid,:jid,:score,:verdict,:why,:gaps,:sim,'new','new',:tgt,CAST(:flags AS JSONB), now(), now())
       ON CONFLICT (profile_id, job_id) DO UPDATE SET score=EXCLUDED.score, verdict=EXCLUDED.verdict,
         why=EXCLUDED.why, gaps=EXCLUDED.gaps, is_simulated=EXCLUDED.is_simulated,
         target_employer=EXCLUDED.target_employer, flags=EXCLUDED.flags, updated_at=now()`,
      { replacements: { pid: p.id, jid: j.id, score: r.score, verdict: r.verdict, why: r.why, gaps: r.gaps,
          sim: r.is_simulated, tgt: !!(ev.watch && !ev.watch.muted), flags: JSON.stringify(flags) }, type: QueryTypes.INSERT }
    ).then(() => { scored++; }).catch(() => {});
  }

  const total = await sequelize.query(`SELECT count(*)::int AS n FROM cv_job_matches WHERE profile_id=:pid`,
    { replacements: { pid: p.id }, type: QueryTypes.SELECT });
  return { considered: rawJobs.length, deduped: jobs.length, passed_targeting: gated.length,
           shortlisted: ranked.length, scored, below_floor: belowFloor, rejected,
           matches_total: (total[0] && total[0].n) || 0, is_simulated: simulated,
           budget: { cap_usd: Number(eng.cost_cap_usd) || 1, calls_allowed: capCalls, spend_estimate_usd: Math.round(spend * 1000) / 1000 } };
}

module.exports = { SOURCES, adzunaActive, refreshJobPool, scoreProfile, upsertJobs, fetchGreenhouse, fetchAshby };
