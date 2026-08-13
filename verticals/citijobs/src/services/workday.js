'use strict';

/**
 * Citi careers feed adapter (Workday CXS).
 *
 * VERIFIED LIVE 2026-08-13 against req 26974948:
 *   tenant `citi`, datacenter `wd5`, site `2`.
 *   wd1 / wd3 / wd103 return HTTP 422 — pin wd5 and save three failed
 *   round-trips per refresh. (The CV engine's seed omits `dc`, so it defaults
 *   to wd1 and probes upward; this module does not repeat that.)
 *
 *   POST /wday/cxs/citi/2/jobs   {appliedFacets,limit,offset,searchText}
 *        -> { total, jobPostings[{title,externalPath,locationsText,postedOn,bulletFields}] }
 *   GET  /wday/cxs/citi/2/job/<externalPath>
 *        -> { jobPostingInfo{ jobReqId,title,jobDescription,location,startDate,
 *                             endDate,timeType,remoteType,externalUrl,canApply,posted,
 *                             jobRequisitionLocation } }
 *
 * `bulletFields[0]` IS the requisition id (26974948). Searching by that id
 * returns exactly one posting, which is what makes paste-to-import reliable
 * rather than a guess.
 *
 * TWO THINGS THIS MODULE WILL NOT DO
 *
 * 1. It never constructs a jobs.citi.com URL. That surface is Phenom People;
 *    its posting id (…/287/99038749520) appears nowhere in the Workday payload
 *    and cannot be derived. A careers deep link is pasted by a human or absent.
 * 2. It never render-crawls. robots.txt on citi.wd5.myworkdayjobs.com disallows
 *    /2/ (the rendered pages) and jobs.citi.com disallows /search-jobs/. We use
 *    only /wday/cxs/, the JSON API the site's own front end calls, at a volume
 *    below what one person clicking around generates.
 *
 * The `total` a search reports is capped at 2000 by Workday. That is a response
 * ceiling, not Citi's opening count — which is why discovery is many targeted
 * queries deduped by req id, and never one firehose.
 */

const DEFAULT_WORKDAY = 'citi:wd5:2';
const UA_CONTACT = process.env.CITIJOBS_UA_CONTACT || 'manuelstagg@gmail.com';
const USER_AGENT = `Digit2AI-CitiTracker/1.0 (personal job search; ${UA_CONTACT})`;
const TIMEOUT_MS = Number(process.env.CITIJOBS_TIMEOUT_MS || 20000);

// Injectable so SIT runs offline against recorded fixtures of the real payloads.
let _fetch = (...a) => fetch(...a);
function _setFetch(fn) { _fetch = fn || ((...a) => fetch(...a)); }

function config() {
  const raw = String(process.env.CITIJOBS_WORKDAY || DEFAULT_WORKDAY);
  const [tenant, dc, site] = raw.split(':');
  return { tenant: tenant || 'citi', dc: dc || 'wd5', site: site || '2' };
}

function base(cfg) {
  const c = cfg || config();
  return `https://${c.tenant}.${c.dc}.myworkdayjobs.com`;
}

/**
 * A request budget carried through a run. Every HTTP call decrements it, and
 * exhausting it stops the run and SAYS it stopped — a silent truncation reads
 * as "we covered everything" when we did not.
 */
function newBudget(max) {
  return {
    max: Number(max || process.env.CITIJOBS_MAX_REQUESTS || 60),
    used: 0,
    hit: false,
    take() {
      if (this.used >= this.max) { this.hit = true; return false; }
      this.used++;
      return true;
    }
  };
}

async function httpJson(url, opts, budget) {
  if (budget && !budget.take()) {
    const e = new Error('request budget exhausted');
    e.budget = true;
    throw e;
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await _fetch(url, Object.assign({
      signal: ctl.signal,
      headers: Object.assign({
        'Accept': 'application/json',
        'User-Agent': USER_AGENT
      }, (opts && opts.headers) || {})
    }, opts || {}));
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status} from ${url}`);
      e.status = res.status;
      throw e;
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ── List ─────────────────────────────────────────────────────────────────────

async function listJobs({ searchText = '', limit = 20, offset = 0, cfg, budget } = {}) {
  const c = cfg || config();
  const url = `${base(c)}/wday/cxs/${c.tenant}/${c.site}/jobs`;
  const body = { appliedFacets: {}, limit, offset, searchText: String(searchText || '') };
  const json = await httpJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, budget);
  return {
    total: Number(json.total || 0),
    postings: Array.isArray(json.jobPostings) ? json.jobPostings : []
  };
}

/** Walk a query's pages up to maxPages, stopping early on a short page. */
async function listAll({ searchText, maxPages = 5, pageSize = 20, cfg, budget } = {}) {
  const out = [];
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    const r = await listJobs({ searchText, limit: pageSize, offset: page * pageSize, cfg, budget });
    total = r.total;
    out.push(...r.postings);
    if (r.postings.length < pageSize) break;
  }
  return { total, postings: out };
}

// ── Detail ───────────────────────────────────────────────────────────────────

async function getDetail(externalPath, { cfg, budget } = {}) {
  const c = cfg || config();
  const p = String(externalPath || '');
  if (!p.startsWith('/')) throw new Error('externalPath must start with /');
  const url = `${base(c)}/wday/cxs/${c.tenant}/${c.site}${p}`;
  const json = await httpJson(url, { method: 'GET' }, budget);
  return json && json.jobPostingInfo ? json.jobPostingInfo : null;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Salary is COPIED OR ABSENT. Never estimated, never interpolated from a
 * sibling requisition in another city. Returns null when the posting is silent,
 * which is the correct answer and not a failure.
 */
function parseSalary(text) {
  const t = String(text || '');
  const re = /Salary\s+Range:?\s*\$\s*([\d,]+(?:\.\d{2})?)\s*(?:-|–|—|to)\s*\$\s*([\d,]+(?:\.\d{2})?)/i;
  const m = t.match(re);
  if (!m) return null;
  const toCents = (s) => Math.round(parseFloat(String(s).replace(/,/g, '')) * 100);
  const min = toCents(m[1]);
  const max = toCents(m[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return null;
  return { min_cents: min, max_cents: max, source: 'stated' };
}

/** Pull the req id out of a posting: bulletFields first, then the path suffix. */
function reqIdOf(posting) {
  if (posting && Array.isArray(posting.bulletFields) && posting.bulletFields[0]) {
    const b = String(posting.bulletFields[0]).trim();
    if (/^\d{5,}$/.test(b)) return b;
  }
  const path = String((posting && posting.externalPath) || '');
  const m = path.match(/_(\d{5,})(?:-\d+)?$/);
  return m ? m[1] : null;
}

/** Extract a req id from anything a human might paste. */
function reqIdFromInput(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^\d{5,}$/.test(s)) return s;
  // Workday path or URL:  ..._26974948-1
  let m = s.match(/_(\d{5,})(?:-\d+)?(?:[/?#]|$)/);
  if (m) return m[1];
  // jobs.citi.com deep links carry a Phenom id, not the req id — but people
  // often paste a URL with the req id in the query or the slug tail.
  m = s.match(/(?:req|requisition|job)[-_ ]?(?:id)?[-_ =:]*(\d{6,})/i);
  if (m) return m[1];
  const nums = s.match(/\b\d{7,9}\b/g);
  return nums && nums.length === 1 ? nums[0] : null;
}

/** Does this look like a jobs.citi.com careers deep link we should keep? */
function citiCareersUrl(input) {
  const s = String(input || '').trim();
  return /^https?:\/\/(www\.)?jobs\.citi\.com\/job\//i.test(s) ? s.split('#')[0] : null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function dateOnly(v) {
  const s = String(v || '').slice(0, 10);
  return DATE_ONLY.test(s) ? s : null;
}

/**
 * Normalize a list posting + (optional) detail into a cj_reqs shaped object.
 * Anything the feed does not state stays null. Nothing is inferred.
 */
function normalize(posting, detail, cfg) {
  const c = cfg || config();
  const req_id = reqIdOf(posting) || (detail && detail.jobReqId) || null;
  const external_path = (posting && posting.externalPath) || null;
  const url_workday = detail && detail.externalUrl
    ? detail.externalUrl
    : (external_path ? `${base(c)}/${c.site}/job${external_path.replace(/^\/job/, '')}` : null);

  const out = {
    req_id: req_id ? String(req_id) : null,
    title: (detail && detail.title) || (posting && posting.title) || null,
    external_path,
    url_workday,
    location: (detail && detail.location) || (posting && posting.locationsText) || null,
    address: detail && detail.jobRequisitionLocation && detail.jobRequisitionLocation.descriptor
      ? detail.jobRequisitionLocation.descriptor : null,
    remote_type: (detail && detail.remoteType) || null,
    time_type: (detail && detail.timeType) || null,
    posted_on: detail ? dateOnly(detail.startDate) : null,
    close_date: detail ? dateOnly(detail.endDate) : null,
    salary_min_cents: null,
    salary_max_cents: null,
    salary_source: null,
    description_text: null,
    detail_fetched: !!detail,
    feed_status: 'open',
    raw: {}
  };

  if (detail) {
    const text = stripHtml(detail.jobDescription);
    out.description_text = text || null;
    const sal = parseSalary(text);
    if (sal) {
      out.salary_min_cents = sal.min_cents;
      out.salary_max_cents = sal.max_cents;
      out.salary_source = sal.source;
    }
    out.job_family = jobFamilyFrom(text, 'Job Family');
    out.job_family_group = jobFamilyFrom(text, 'Job Family Group');
    if (detail.canApply === false || detail.posted === false) out.feed_status = 'cannot_apply';
    out.raw = {
      jobPostingId: detail.jobPostingId || null,
      timeLeftToApply: detail.timeLeftToApply || null,
      jobPostingEndDateAsText: detail.jobPostingEndDateAsText || null,
      country: detail.country && detail.country.descriptor ? detail.country.descriptor : null
    };
  } else if (posting) {
    out.raw = { postedOn: posting.postedOn || null };
  }
  return out;
}

/** Citi prints "Job Family Group:\n Technology" style blocks in the description. */
function jobFamilyFrom(text, label) {
  const re = new RegExp(label + '\\s*:?\\s*[-\\s]*([A-Za-z0-9 &/,\\.\\-]{2,60})');
  const m = String(text || '').match(re);
  if (!m) return null;
  return m[1].replace(/-+$/, '').trim().slice(0, 60) || null;
}

// ── High level ───────────────────────────────────────────────────────────────

/**
 * Find one requisition by its id. Verified exact: searchText:"26974948"
 * returns total 1. Returns { posting, detail, normalized } or null.
 */
async function findByReqId(reqId, { cfg, budget, withDetail = true } = {}) {
  const id = String(reqId || '').trim();
  if (!/^\d{5,}$/.test(id)) return null;
  const { postings } = await listJobs({ searchText: id, limit: 20, offset: 0, cfg, budget });
  const hit = postings.find((p) => reqIdOf(p) === id) || null;
  if (!hit) return null;
  let detail = null;
  if (withDetail && hit.externalPath) {
    try { detail = await getDetail(hit.externalPath, { cfg, budget }); } catch (e) { detail = null; }
  }
  return { posting: hit, detail, normalized: normalize(hit, detail, cfg) };
}

module.exports = {
  config, base, newBudget,
  listJobs, listAll, getDetail,
  stripHtml, parseSalary, reqIdOf, reqIdFromInput, citiCareersUrl, normalize,
  findByReqId,
  USER_AGENT,
  _setFetch
};
