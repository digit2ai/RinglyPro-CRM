// CV Talent Engine — SHARED employer/ATS connector registry + per-profile watchlists (Phase 5).
//
// The registry is infrastructure: one company -> the ATS that actually serves its career site
// -> the public JSON endpoint that site itself calls. Resolved once, reused by every profile.
// The watchlist (who a given person is targeting) is per profile and lives in cv_watchlist.
//
// HONESTY IS THE WHOLE POINT OF THE PROBE. We try the public endpoints; whatever answers with
// real postings becomes 'live'. Anything else is recorded as unreachable WITH the list of
// patterns tried. We never scrape a site whose terms forbid it, never touch LinkedIn or
// Indeed, and never emit a synthetic posting to make a company look covered.

const { QueryTypes } = require('sequelize');

const PROBE_TIMEOUT_MS = 9000;
const PROBE_CONCURRENCY = 4;
const WORKDAY_DETAIL_CAP = 60;   // per employer per refresh — documented bound, not a silent truncation
const WORKDAY_PAGE = 20;         // Workday's own page size
const WORKDAY_MAX_PAGES = 10;    // 200 postings/employer/refresh. Reported, never silent.

const STATUS = {
  LIVE: 'live',
  UNVERIFIED: 'unverified',        // a board answered, but the token was GUESSED — see below
  NO_PUBLIC_ENDPOINT: 'no_public_endpoint',
  BLOCKED_TOS: 'blocked_tos',
  DORMANT_KEY: 'dormant_key',
  ERROR: 'error',
  UNPROBED: 'unprobed'
};

// Guessing a board token from a company name finds real boards — and also finds abandoned
// trial accounts that squat the same name. Probing "accenture" and "ey" on Recruitee returns
// demo tenants in Amsterdam whose postings are literally titled "Senior Marketer (Sample)";
// treating those as Accenture and EY would attribute fabricated-looking jobs to real firms.
// So: a token that was CONFIGURED (seeded or owner-entered) is trusted on success; a token
// that was GUESSED is recorded as 'unverified' with sample titles for the owner to confirm,
// and contributes nothing to the pool until they do.
const SAMPLE_MARKERS = /\(sample\)|\bsample\b|\bdemo\b|\btest job\b|lorem ipsum/i;
function looksLikeDemoBoard(jobs) {
  if (!jobs.length) return false;
  const sampled = jobs.slice(0, 8);
  return sampled.filter((j) => SAMPLE_MARKERS.test(String(j.title || ''))).length >= 1 && jobs.length <= 10;
}

// ---------- http ----------
async function httpJson(url, opts = {}) {
  if (typeof fetch !== 'function') return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeout || PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: opts.method || 'GET', signal: ctl.signal,
      headers: Object.assign({ 'User-Agent': 'RinglyPro-CV-Agent/2.0 (+https://manuelstagg.com)', Accept: 'application/json' },
        opts.body ? { 'Content-Type': 'application/json' } : {}, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!r.ok) return { __status: r.status };
    return await r.json();
  } catch (e) { return { __error: (e && e.name === 'AbortError') ? 'timeout' : (e && e.message) || 'fetch failed' }; }
  finally { clearTimeout(t); }
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, '-').replace(/&ndash;/g, '-')
    .replace(/\s+/g, ' ').trim();
}
function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function tokenize(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

// ---------- ATS adapters ----------
// Each returns { url, fetch(company, cfg) -> [job] }. `cfg` is whatever the registry row stored.
const ADAPTERS = {
  greenhouse: {
    label: 'Greenhouse',
    endpoint: (cfg) => `https://boards-api.greenhouse.io/v1/boards/${cfg.token}/jobs?content=true`,
    parse: (j, company, cfg) => (j && Array.isArray(j.jobs) ? j.jobs : []).map((x) => {
      const loc = (x.location && x.location.name) || '';
      return { source: 'greenhouse', source_id: `gh:${cfg.token}:${x.id}`, company,
        title: String(x.title || '').trim(), location: loc, remote: /remote/i.test(loc),
        url: x.absolute_url, description: stripHtml(x.content).slice(0, 5000), posted_at: x.updated_at || null };
    })
  },
  lever: {
    label: 'Lever',
    endpoint: (cfg) => `https://api.lever.co/v0/postings/${cfg.token}?mode=json`,
    parse: (j, company, cfg) => (Array.isArray(j) ? j : []).map((x) => ({
      source: 'lever', source_id: `lever:${cfg.token}:${x.id}`, company,
      title: String(x.text || '').trim(), location: (x.categories && x.categories.location) || '',
      remote: /remote/i.test(((x.categories && x.categories.location) || '') + ' ' + (x.workplaceType || '')),
      url: x.hostedUrl || x.applyUrl, description: stripHtml(x.descriptionPlain || x.description).slice(0, 5000),
      posted_at: x.createdAt ? new Date(x.createdAt).toISOString() : null
    }))
  },
  ashby: {
    label: 'Ashby',
    endpoint: (cfg) => `https://api.ashbyhq.com/posting-api/job-board/${cfg.token}?includeCompensation=true`,
    parse: (j, company, cfg) => (j && Array.isArray(j.jobs) ? j.jobs : []).filter((x) => x.isListed !== false).map((x) => ({
      source: 'ashby', source_id: `ashby:${cfg.token}:${x.id}`, company,
      title: String(x.title || '').trim(), location: x.location || '', remote: !!x.isRemote,
      url: x.jobUrl || x.applyUrl, description: String(x.descriptionPlain || '').replace(/\s+/g, ' ').trim().slice(0, 5000),
      posted_at: x.publishedAt || null
    }))
  },
  smartrecruiters: {
    label: 'SmartRecruiters',
    endpoint: (cfg) => `https://api.smartrecruiters.com/v1/companies/${cfg.token}/postings?limit=100`,
    parse: (j, company, cfg) => (j && Array.isArray(j.content) ? j.content : []).map((x) => {
      const loc = x.location ? [x.location.city, x.location.region, x.location.country].filter(Boolean).join(', ') : '';
      return { source: 'smartrecruiters', source_id: `sr:${cfg.token}:${x.id}`, company,
        title: String(x.name || '').trim(), location: loc, remote: !!(x.location && x.location.remote),
        url: `https://jobs.smartrecruiters.com/${cfg.token}/${x.id}`,
        description: stripHtml((x.jobAd && x.jobAd.sections && x.jobAd.sections.jobDescription && x.jobAd.sections.jobDescription.text) || '').slice(0, 5000),
        posted_at: x.releasedDate || null };
    })
  },
  workable: {
    label: 'Workable',
    endpoint: (cfg) => `https://apply.workable.com/api/v1/widget/accounts/${cfg.token}?details=true`,
    parse: (j, company, cfg) => (j && Array.isArray(j.jobs) ? j.jobs : []).map((x) => ({
      source: 'workable', source_id: `wk:${cfg.token}:${x.shortcode || x.id}`, company,
      title: String(x.title || '').trim(), location: [x.city, x.state, x.country].filter(Boolean).join(', '),
      remote: !!x.telecommuting, url: x.url || x.application_url,
      description: stripHtml(x.description).slice(0, 5000), posted_at: x.published_on || null
    }))
  },
  recruitee: {
    label: 'Recruitee',
    endpoint: (cfg) => `https://${cfg.token}.recruitee.com/api/offers/`,
    parse: (j, company, cfg) => (j && Array.isArray(j.offers) ? j.offers : []).map((x) => ({
      source: 'recruitee', source_id: `rc:${cfg.token}:${x.id}`, company,
      title: String(x.title || '').trim(), location: [x.city, x.country].filter(Boolean).join(', '),
      remote: /remote/i.test(String(x.location || '')), url: x.careers_url || x.careers_apply_url,
      description: stripHtml(x.description).slice(0, 5000), posted_at: x.published_at || null
    }))
  },
  workday: {
    // Workday's own career site calls this endpoint. Needs tenant + data-center + site id,
    // so it is only probed when the registry row supplies them.
    label: 'Workday',
    endpoint: (cfg) => `https://${cfg.tenant}.${cfg.dc || 'wd1'}.myworkdayjobs.com/wday/cxs/${cfg.tenant}/${cfg.site}/jobs`,
    method: 'POST',
    body: { appliedFacets: {}, limit: 20, offset: 0, searchText: '' },
    parse: (j, company, cfg) => (j && Array.isArray(j.jobPostings) ? j.jobPostings : []).map((x) => ({
      source: 'workday', source_id: `wd:${cfg.tenant}:${cfg.site}:${x.bulletFields && x.bulletFields[0] ? x.bulletFields[0] : x.externalPath}`,
      company, title: String(x.title || '').trim(), location: x.locationsText || '',
      remote: /remote/i.test(x.locationsText || ''),
      url: `https://${cfg.tenant}.${cfg.dc || 'wd1'}.myworkdayjobs.com/en-US/${cfg.site}${x.externalPath || ''}`,
      description: '', posted_at: null,
      _detail: `https://${cfg.tenant}.${cfg.dc || 'wd1'}.myworkdayjobs.com/wday/cxs/${cfg.tenant}/${cfg.site}${x.externalPath || ''}`
    }))
  },
  eightfold: {
    label: 'Eightfold',
    endpoint: (cfg) => `https://${cfg.token}.eightfold.ai/api/apply/v2/jobs?domain=${cfg.domain || (cfg.token + '.com')}&start=0&num=50&exclude_pid=&sort_by=relevance`,
    parse: (j, company, cfg) => (j && Array.isArray(j.positions) ? j.positions : []).map((x) => ({
      source: 'eightfold', source_id: `ef:${cfg.token}:${x.id}`, company,
      title: String(x.name || '').trim(), location: x.location || (Array.isArray(x.locations) ? x.locations.join(' | ') : ''),
      remote: /remote/i.test(String(x.location || '')), url: x.canonicalPositionUrl || x.positionUrl,
      description: stripHtml(x.job_description).slice(0, 5000), posted_at: x.t_create ? new Date(x.t_create * 1000).toISOString() : null
    }))
  }
};

// ATS families that exist but expose no stable keyless JSON for third parties. Recorded
// honestly rather than scraped.
const CLOSED_ATS = {
  icims: 'iCIMS serves its board as rendered HTML with no documented public JSON API.',
  taleo: 'Oracle Taleo requires an authenticated integration; no keyless public feed.',
  phenom: 'Phenom People sites expose no documented public JSON feed for third parties.',
  oracle_hcm: 'Oracle HCM career sites require a per-tenant API registration.',
  successfactors: 'SAP SuccessFactors requires an OData integration credential.'
};

// ---------- probing ----------
function candidateTokens(name) {
  const t = tokenize(name);
  const s = slugify(name);
  const first = s.split('-')[0];
  const noSuffix = s.replace(/-(inc|llc|corp|corporation|group|holdings|company|co|plc|sa|ag|nv)$/i, '');
  return Array.from(new Set([t, s, noSuffix, first].filter((x) => x && x.length >= 2)));
}

async function tryAdapter(kind, company, cfg) {
  const ad = ADAPTERS[kind];
  if (!ad) return { ok: false, note: 'unknown adapter' };
  const url = ad.endpoint(cfg);
  const j = await httpJson(url, { method: ad.method || 'GET', body: ad.method === 'POST' ? ad.body : undefined });
  if (!j || j.__error) return { ok: false, note: `${ad.label}: ${(j && j.__error) || 'no response'}`, url };
  if (j.__status) return { ok: false, note: `${ad.label}: HTTP ${j.__status}`, url };
  let jobs = [];
  try { jobs = ad.parse(j, company, cfg) || []; } catch (e) { return { ok: false, note: `${ad.label}: parse failed`, url }; }
  if (!jobs.length) return { ok: false, note: `${ad.label}: reachable but returned 0 postings`, url };
  if (looksLikeDemoBoard(jobs)) return { ok: false, demo: true, url,
    note: `${ad.label}: "${cfg.token}" is an abandoned trial board (sample postings), not this employer` };
  const total = (j && (j.total || j.totalFound)) || jobs.length;
  return { ok: true, count: total, page_count: jobs.length, url, cfg, kind,
           samples: jobs.slice(0, 3).map((x) => x.title + (x.location ? ' — ' + x.location : '')) };
}

/**
 * Probe one employer across the keyless public patterns.
 * Returns { status, ats, cfg, endpoint, count, reason } — reason always lists what was tried.
 */
async function probeEmployer(emp) {
  const tried = [];
  // 1) An explicit config already on the row wins (owner-supplied or previously resolved).
  if (emp.ats && ADAPTERS[emp.ats] && emp.cfg && Object.keys(emp.cfg).length) {
    const r = await tryAdapter(emp.ats, emp.name, emp.cfg);
    tried.push(r.note || `${emp.ats}: ok`);
    if (r.ok) return { status: STATUS.LIVE, ats: emp.ats, cfg: emp.cfg, endpoint: r.url, count: r.count, reason: 'configured endpoint returned ' + r.count + ' postings' };
  }
  // 2) A declared closed ATS — record it, do not attempt to scrape around it.
  if (emp.ats && CLOSED_ATS[emp.ats]) {
    return { status: STATUS.NO_PUBLIC_ENDPOINT, ats: emp.ats, cfg: emp.cfg || {}, endpoint: null, count: 0, reason: CLOSED_ATS[emp.ats] };
  }
  // 3) Workday needs tenant + site; only probe when hinted (i.e. always a CONFIGURED token).
  if (emp.cfg && emp.cfg.tenant && emp.cfg.site) {
    for (const dc of [emp.cfg.dc || 'wd1', 'wd1', 'wd3', 'wd5', 'wd103']) {
      const cfg = Object.assign({}, emp.cfg, { dc });
      const r = await tryAdapter('workday', emp.name, cfg);
      tried.push(r.note || `workday ${dc}: ok`);
      if (r.ok) return { status: STATUS.LIVE, ats: 'workday', cfg, endpoint: r.url, count: r.count,
        reason: `Workday tenant "${cfg.tenant}" returned ${r.count} postings (configured tenant, ${WORKDAY_PAGE * WORKDAY_MAX_PAGES} fetched per refresh)` };
    }
  }
  // 4) Keyless token-based boards. A CONFIGURED token is trusted; a GUESSED one is only ever
  //    'unverified' — see the namesquat note at the top of this file.
  const configured = !!(emp.cfg && emp.cfg.token && !emp.cfg.guessed);
  const tokens = configured ? [emp.cfg.token] : candidateTokens(emp.name);
  for (const kind of ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee']) {
    for (const token of tokens) {
      const r = await tryAdapter(kind, emp.name, { token });
      if (r.ok) {
        const base = { ats: kind, cfg: { token }, endpoint: r.url, count: r.count };
        if (configured) return Object.assign(base, { status: STATUS.LIVE,
          reason: `${ADAPTERS[kind].label} board "${token}" returned ${r.count} postings` });
        // cfg.guessed marks the token as unconfirmed so a LATER probe cannot mistake the
        // token we stored for one the owner supplied.
        return Object.assign(base, { status: STATUS.UNVERIFIED, cfg: { token, guessed: true },
          reason: `Found a ${ADAPTERS[kind].label} board at the guessed token "${token}" with ${r.count} postings, but nothing proves it belongs to ${emp.name}. Confirm or reject it. Sample: ${(r.samples || []).join(' / ') || 'n/a'}` });
      }
      tried.push(r.note);
    }
  }
  return { status: STATUS.NO_PUBLIC_ENDPOINT, ats: emp.ats || null, cfg: emp.cfg || {}, endpoint: null, count: 0,
           reason: 'No keyless public board found. Tried: ' + Array.from(new Set(tried)).slice(0, 10).join(' | ') };
}

// ---------- fetching a live employer ----------
async function fetchEmployerJobs(emp) {
  const ad = ADAPTERS[emp.ats];
  if (!ad || emp.status !== STATUS.LIVE) return [];
  const cfg = emp.cfg || {};
  let jobs = [];

  if (emp.ats === 'workday') {
    // A large Workday tenant holds thousands of postings and serves 20 per page, so a single
    // request is not "the board" — it is page one, frequently sorted by a region that has
    // nothing to do with the candidate. Paginate to a documented ceiling.
    for (let page = 0; page < WORKDAY_MAX_PAGES; page++) {
      const body = { appliedFacets: {}, limit: WORKDAY_PAGE, offset: page * WORKDAY_PAGE, searchText: '' };
      const j = await httpJson(ad.endpoint(cfg), { method: 'POST', body, timeout: 12000 });
      if (!j || j.__error || j.__status) break;
      let batch = [];
      try { batch = ad.parse(j, emp.name, cfg) || []; } catch (e) { break; }
      if (!batch.length) break;
      jobs = jobs.concat(batch);
      if (batch.length < WORKDAY_PAGE) break;
    }
    // Workday list responses carry no description; pull a bounded number of details so the
    // fit-scorer has real text to judge. The cap is reported, never silently applied.
    for (const job of jobs.slice(0, WORKDAY_DETAIL_CAP)) {
      if (!job._detail) continue;
      const d = await httpJson(job._detail, { timeout: 8000 });
      const info = d && d.jobPostingInfo;
      if (info) {
        job.description = stripHtml(info.jobDescription).slice(0, 5000);
        job.posted_at = info.startDate || job.posted_at;
      }
    }
    jobs.forEach((x) => { delete x._detail; });
    return jobs;
  }

  const j = await httpJson(ad.endpoint(cfg), { method: ad.method || 'GET', body: ad.method === 'POST' ? ad.body : undefined, timeout: 12000 });
  if (!j || j.__error || j.__status) return [];
  try { jobs = ad.parse(j, emp.name, cfg) || []; } catch (e) { return []; }
  return jobs;
}

// ---------- seed registry ----------
// A starting point any owner edits — not a fixture. Industry tags come from the shared
// taxonomy in cv-settings. Workday hints are supplied where a tenant is publicly known; the
// probe still has to confirm them, and records the truth if it cannot.
const SEED_EMPLOYERS = [
  // Money-center and large regional banks
  { name: 'Citi', industries: ['banking', 'capital_markets'], cfg: { tenant: 'citi', site: '2' } },
  { name: 'JPMorgan Chase', industries: ['banking', 'capital_markets'] },
  { name: 'Bank of America', industries: ['banking'] },
  { name: 'Wells Fargo', industries: ['banking'] },
  { name: 'Goldman Sachs', industries: ['banking', 'capital_markets'] },
  { name: 'Capital One', industries: ['banking', 'fintech'] },
  { name: 'PNC', industries: ['banking'] },
  { name: 'Truist', industries: ['banking'] },
  { name: 'U.S. Bank', industries: ['banking'] },
  { name: 'Citizens', industries: ['banking'] },
  { name: 'Regions', industries: ['banking'] },
  { name: 'Fifth Third', industries: ['banking'] },
  { name: 'American Express', industries: ['banking', 'payments'] },
  { name: 'USAA', industries: ['banking', 'insurance'] },
  { name: 'Santander US', industries: ['banking'] },
  // Core banking and payments vendors
  { name: 'FIS', industries: ['core_banking_vendors', 'payments'] },
  { name: 'Fiserv', industries: ['core_banking_vendors', 'payments'] },
  { name: 'Jack Henry', industries: ['core_banking_vendors'] },
  { name: 'Temenos', industries: ['core_banking_vendors'] },
  { name: 'Finastra', industries: ['core_banking_vendors'] },
  { name: 'ACI Worldwide', industries: ['payments'] },
  { name: 'Broadridge', industries: ['capital_markets'] },
  { name: 'nCino', industries: ['core_banking_vendors'] },
  { name: 'Q2', industries: ['core_banking_vendors'] },
  { name: 'Mastercard', industries: ['payments'] },
  { name: 'Visa', industries: ['payments'] },
  { name: 'Swift', industries: ['payments', 'banking'] },
  { name: 'Early Warning', industries: ['payments'] },
  // Consultancies and integrators that run bank programs
  { name: 'Accenture', industries: ['consulting_si'] },
  { name: 'Deloitte', industries: ['consulting_si'] },
  { name: 'EY', industries: ['consulting_si'] },
  { name: 'PwC', industries: ['consulting_si'] },
  { name: 'KPMG', industries: ['consulting_si'] },
  { name: 'Infosys', industries: ['consulting_si'] },
  { name: 'TCS', industries: ['consulting_si'] },
  { name: 'Cognizant', industries: ['consulting_si'] },
  { name: 'Capgemini', industries: ['consulting_si'] },
  { name: 'Wipro', industries: ['consulting_si'] },
  { name: 'HCLTech', industries: ['consulting_si'] },
  // Already-verified keyless boards from Phase 1 (kept so the registry is the single source)
  { name: 'Stripe', industries: ['fintech', 'payments'], ats: 'greenhouse', cfg: { token: 'stripe' } },
  { name: 'Coinbase', industries: ['fintech'], ats: 'greenhouse', cfg: { token: 'coinbase' } },
  { name: 'Databricks', industries: ['technology'], ats: 'greenhouse', cfg: { token: 'databricks' } },
  { name: 'Anthropic', industries: ['technology'], ats: 'greenhouse', cfg: { token: 'anthropic' } },
  { name: 'Brex', industries: ['fintech'], ats: 'greenhouse', cfg: { token: 'brex' } },
  { name: 'Robinhood', industries: ['fintech', 'capital_markets'], ats: 'greenhouse', cfg: { token: 'robinhood' } },
  { name: 'Affirm', industries: ['fintech'], ats: 'greenhouse', cfg: { token: 'affirm' } },
  { name: 'Chime', industries: ['fintech'], ats: 'greenhouse', cfg: { token: 'chime' } },
  { name: 'SoFi', industries: ['fintech', 'banking'], ats: 'greenhouse', cfg: { token: 'sofi' } },
  { name: 'Marqeta', industries: ['fintech', 'payments'], ats: 'greenhouse', cfg: { token: 'marqeta' } },
  { name: 'Betterment', industries: ['fintech'], ats: 'greenhouse', cfg: { token: 'betterment' } },
  { name: 'Fireblocks', industries: ['fintech'], ats: 'greenhouse', cfg: { token: 'fireblocks' } },
  { name: 'Flexport', industries: ['logistics'], ats: 'greenhouse', cfg: { token: 'flexport' } },
  { name: 'Gusto', industries: ['technology'], ats: 'greenhouse', cfg: { token: 'gusto' } },
  { name: 'Airbnb', industries: ['technology'], ats: 'greenhouse', cfg: { token: 'airbnb' } },
  { name: 'Dropbox', industries: ['technology'], ats: 'greenhouse', cfg: { token: 'dropbox' } },
  { name: 'OpenAI', industries: ['technology'], ats: 'ashby', cfg: { token: 'openai' } },
  { name: 'Ramp', industries: ['fintech'], ats: 'ashby', cfg: { token: 'ramp' } },
  { name: 'Notion', industries: ['technology'], ats: 'ashby', cfg: { token: 'notion' } },
  { name: 'Linear', industries: ['technology'], ats: 'ashby', cfg: { token: 'linear' } },
  { name: 'Vanta', industries: ['regtech'], ats: 'ashby', cfg: { token: 'vanta' } },
  { name: 'Runway', industries: ['technology'], ats: 'ashby', cfg: { token: 'runway' } }
];

// ---------- persistence ----------
async function ensureTables(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS cv_employers (
      id BIGSERIAL PRIMARY KEY,
      slug VARCHAR(120) UNIQUE NOT NULL,
      name TEXT NOT NULL,
      ats VARCHAR(32),
      cfg JSONB DEFAULT '{}'::jsonb,
      endpoint TEXT,
      industries TEXT[] DEFAULT '{}',
      status VARCHAR(32) DEFAULT 'unprobed',
      status_reason TEXT,
      last_probe_at TIMESTAMPTZ,
      last_count INT DEFAULT 0,
      last_fetch_at TIMESTAMPTZ,
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_cv_employers_status ON cv_employers(status);
    CREATE TABLE IF NOT EXISTS cv_watchlist (
      id BIGSERIAL PRIMARY KEY,
      profile_id BIGINT NOT NULL,
      employer_id BIGINT NOT NULL,
      priority INT DEFAULT 1,
      muted BOOLEAN DEFAULT false,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(profile_id, employer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cv_watchlist_profile ON cv_watchlist(profile_id);
  `);
}

async function seed(sequelize) {
  for (const e of SEED_EMPLOYERS) {
    // industries is TEXT[]: Sequelize renders a JS array as an IN-list, so build it in SQL.
    await sequelize.query(
      `INSERT INTO cv_employers (slug, name, ats, cfg, industries, status)
       VALUES (:slug,:name,:ats,CAST(:cfg AS JSONB),string_to_array(:inds, ','),'unprobed')
       ON CONFLICT (slug) DO NOTHING`,
      { replacements: { slug: slugify(e.name), name: e.name, ats: e.ats || null,
          cfg: JSON.stringify(e.cfg || {}), inds: (e.industries || []).join(',') }, type: QueryTypes.INSERT }
    ).catch((err) => { console.error('cv-employers seed', e.name, err.message); });
  }
}

async function list(sequelize, opts = {}) {
  const where = [];
  const rep = {};
  if (opts.status) { where.push('status=:st'); rep.st = opts.status; }
  if (opts.industry) { where.push(':ind = ANY(industries)'); rep.ind = opts.industry; }
  if (opts.q) { where.push('lower(name) LIKE :q'); rep.q = '%' + String(opts.q).toLowerCase() + '%'; }
  const rows = await sequelize.query(
    `SELECT id, slug, name, ats, cfg, endpoint, industries, status, status_reason, last_probe_at,
            last_count, last_fetch_at, enabled
       FROM cv_employers ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (status='unverified') DESC, (status='live') DESC, last_count DESC, name ASC LIMIT 500`,
    { replacements: rep, type: QueryTypes.SELECT });
  return rows;
}

async function liveEmployers(sequelize) {
  // `status` MUST be selected: fetchEmployerJobs() gates on it, so omitting the column makes
  // every registry employer silently return zero jobs.
  return await sequelize.query(
    `SELECT id, slug, name, ats, cfg, industries, status FROM cv_employers WHERE status='live' AND enabled=true`,
    { type: QueryTypes.SELECT });
}

async function recordProbe(sequelize, id, r) {
  await sequelize.query(
    `UPDATE cv_employers SET status=:st, status_reason=:rs, ats=COALESCE(:ats,ats),
       cfg=CAST(:cfg AS JSONB), endpoint=:ep, last_probe_at=now(), last_count=:cnt, updated_at=now()
     WHERE id=:id`,
    { replacements: { id, st: r.status, rs: String(r.reason || '').slice(0, 1000), ats: r.ats || null,
        cfg: JSON.stringify(r.cfg || {}), ep: r.endpoint || null, cnt: r.count || 0 }, type: QueryTypes.UPDATE });
}

// Probe many employers with a small concurrency cap. Caller runs this in the BACKGROUND —
// dozens of boards will always exceed Cloudflare's request ceiling.
async function probeAll(sequelize, opts = {}) {
  const rows = await sequelize.query(
    `SELECT id, name, ats, cfg, status FROM cv_employers
      WHERE enabled=true ${opts.only_unprobed ? "AND status='unprobed'" : ''}
      ORDER BY (status='unprobed') DESC, last_probe_at ASC NULLS FIRST
      LIMIT :lim`, { replacements: { lim: Math.min(300, opts.limit || 300) }, type: QueryTypes.SELECT });
  const out = { probed: 0, live: 0, unreachable: 0, details: [] };
  let i = 0;
  const worker = async () => {
    while (i < rows.length) {
      const emp = rows[i++];
      let r;
      try { r = await probeEmployer(emp); }
      catch (e) { r = { status: STATUS.ERROR, reason: (e && e.message) || 'probe failed', cfg: emp.cfg || {}, count: 0 }; }
      await recordProbe(sequelize, emp.id, r).catch(() => {});
      out.probed++;
      if (r.status === STATUS.LIVE) out.live++; else out.unreachable++;
      out.details.push({ name: emp.name, status: r.status, ats: r.ats || null, count: r.count || 0, reason: r.reason });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, rows.length) }, worker));
  return out;
}

// ---------- watchlist ----------
async function watchlist(sequelize, profileId) {
  return await sequelize.query(
    `SELECT w.id, w.employer_id, w.priority, w.muted, w.notes,
            e.name, e.slug, e.status, e.status_reason, e.ats, e.industries, e.last_count
       FROM cv_watchlist w JOIN cv_employers e ON e.id=w.employer_id
      WHERE w.profile_id=:pid ORDER BY w.priority DESC, e.name ASC`,
    { replacements: { pid: profileId }, type: QueryTypes.SELECT });
}
async function watchAdd(sequelize, profileId, employerId, fields = {}) {
  await sequelize.query(
    `INSERT INTO cv_watchlist (profile_id, employer_id, priority, muted, notes)
     VALUES (:pid,:eid,:pri,:mut,:notes)
     ON CONFLICT (profile_id, employer_id) DO UPDATE SET priority=EXCLUDED.priority, muted=EXCLUDED.muted, notes=EXCLUDED.notes`,
    { replacements: { pid: profileId, eid: employerId,
        pri: Math.max(1, Math.min(5, parseInt(fields.priority, 10) || 1)),
        mut: !!fields.muted, notes: String(fields.notes || '').slice(0, 600) }, type: QueryTypes.INSERT });
}
async function watchRemove(sequelize, profileId, employerId) {
  await sequelize.query('DELETE FROM cv_watchlist WHERE profile_id=:pid AND employer_id=:eid',
    { replacements: { pid: profileId, eid: employerId }, type: QueryTypes.DELETE });
}
// company name (lowercased) -> watch row, for the matcher's boost + badge
async function watchIndex(sequelize, profileId) {
  const rows = await watchlist(sequelize, profileId);
  const idx = {};
  rows.forEach((r) => { idx[String(r.name).toLowerCase().trim()] = r; });
  return idx;
}

module.exports = {
  STATUS, ADAPTERS, CLOSED_ATS, SEED_EMPLOYERS, WORKDAY_DETAIL_CAP,
  ensureTables, seed, list, liveEmployers, probeEmployer, probeAll, recordProbe, fetchEmployerJobs,
  watchlist, watchAdd, watchRemove, watchIndex, slugify, candidateTokens
};
