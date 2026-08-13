'use strict';

/**
 * JPMorgan Chase careers feed adapter (Oracle Fusion Cloud recruiting).
 *
 * VERIFIED LIVE 2026-08-13:
 *   tenant `jpmc`, site `CX_1001`, host jpmc.fa.oraclecloud.com. No key, no auth.
 *
 *   GET /hcmRestApi/resources/latest/recruitingCEJobRequisitions
 *       ?onlyData=true&expand=requisitionList.secondaryLocations
 *       &finder=findReqs;siteNumber=CX_1001,keyword="…",limit=N,offset=M,sortBy=POSTING_DATES_DESC
 *     -> items[0].{ TotalJobsCount, requisitionList[{Id,Title,PrimaryLocation,PostedDate,
 *                   PostingEndDate,JobFamily,JobFunction,WorkplaceType,ShortDescriptionStr}] }
 *
 *   GET /hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails
 *       ?expand=all&onlyData=true&finder=ById;Id="<Id>",siteNumber=CX_1001
 *     -> items[0].{ Id, Title, ExternalDescriptionStr, PrimaryLocation, JobFamily,
 *                   ExternalPostedStartDate, ExternalPostedEndDate, JobSchedule, WorkplaceType }
 *
 * TWO DIFFERENCES FROM CITI'S WORKDAY FEED, both load-bearing:
 *
 * 1. THE TOTAL IS REAL. Workday caps a search's reported total at 2000, which is
 *    why Citi discovery is many narrow queries. Oracle returns the true count
 *    (7,456 openings at first probe), so a query here can genuinely be paged.
 *
 * 2. A LIST ROW IS NOT ENOUGH TO SCORE ON. It carries a ~130-character blurb,
 *    not the posting, so a detail call per requisition is still required — same
 *    cost shape as Citi, and the same reason the free pre-filter decides which
 *    requisitions are worth a request.
 *
 * Chase and JPMorgan are ONE employer here. Chase is a JPMC brand and both sit
 * behind this site; two entries would double every fetch and split the board.
 */

const budget = require('./budget');

const DEFAULT_CFG = { tenant: 'jpmc', site: 'CX_1001', host: null };
const PAGE = 20;

function cfgFrom(cfg) {
  const c = Object.assign({}, DEFAULT_CFG, cfg || {});
  c.host = c.host || `${c.tenant}.fa.oraclecloud.com`;
  return c;
}
function base(cfg) { return `https://${cfgFrom(cfg).host}/hcmRestApi/resources/latest`; }

/** Oracle's finder syntax wants quoted values; keep encoding in one place. */
function finder(parts) {
  return parts.map(([k, v]) => `${k}=${v}`).join(',');
}

async function listJobs({ searchText = '', limit = PAGE, offset = 0, cfg, budget: b } = {}) {
  const c = cfgFrom(cfg);
  const f = [['siteNumber', c.site]];
  if (searchText) f.push(['keyword', `"${String(searchText).replace(/"/g, '')}"`]);
  f.push(['limit', String(limit)], ['offset', String(offset)], ['sortBy', 'POSTING_DATES_DESC']);
  const url = `${base(c)}/recruitingCEJobRequisitions`
    + `?onlyData=true&expand=requisitionList.secondaryLocations`
    + `&finder=${encodeURIComponent('findReqs;' + finder(f))}`;
  const json = await budget.httpJson(url, { method: 'GET' }, b);
  const item = (json && json.items && json.items[0]) || {};
  return {
    total: Number(item.TotalJobsCount || 0),
    postings: Array.isArray(item.requisitionList) ? item.requisitionList : []
  };
}

async function listAll({ searchText, maxPages = 3, pageSize = PAGE, cfg, budget: b } = {}) {
  const out = [];
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    const r = await listJobs({ searchText, limit: pageSize, offset: page * pageSize, cfg, budget: b });
    total = r.total;
    out.push(...r.postings);
    if (r.postings.length < pageSize) break;
  }
  return { total, postings: out };
}

async function getDetail(id, { cfg, budget: b } = {}) {
  const c = cfgFrom(cfg);
  const f = finder([['Id', `"${String(id).replace(/"/g, '')}"`], ['siteNumber', c.site]]);
  const url = `${base(c)}/recruitingCEJobRequisitionDetails`
    + `?expand=all&onlyData=true&finder=${encodeURIComponent('ById;' + f)}`;
  const json = await budget.httpJson(url, { method: 'GET' }, b);
  return (json && json.items && json.items[0]) || null;
}

function reqIdOf(posting) {
  const id = posting && (posting.Id || posting.RequisitionId);
  return id ? String(id) : null;
}

/** Extract a JPMC requisition id from anything a human might paste. */
function reqIdFromInput(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^2\d{8}$/.test(s)) return s;                       // bare id, e.g. 210712563
  const m = s.match(/\/job\/(\d{6,})/);                   // …/sites/CX_1001/job/210712563
  if (m) return m[1];
  const q = s.match(/[?&](?:Id|jobId|requisitionId)=(\d{6,})/i);
  if (q) return q[1];
  const nums = s.match(/\b2\d{8}\b/g);
  return nums && nums.length === 1 ? nums[0] : null;
}

/** The candidate-facing apply URL. Derived from the id Oracle itself returned. */
function applyUrl(id, cfg) {
  const c = cfgFrom(cfg);
  return `https://${c.host}/hcmUI/CandidateExperience/en/sites/${c.site}/job/${encodeURIComponent(id)}`;
}

/**
 * Normalize a list posting + (optional) detail into the shared cj_reqs shape.
 * Anything the feed does not state stays null. Nothing is inferred.
 */
function normalize(posting, detail, cfg) {
  const c = cfgFrom(cfg);
  const id = reqIdOf(posting) || (detail && String(detail.Id || '')) || null;

  const out = {
    req_id: id,
    title: (detail && detail.Title) || (posting && posting.Title) || null,
    external_path: id ? `/job/${id}` : null,
    url_workday: id ? applyUrl(id, c) : null,      // shared column: the canonical apply link
    url_citi_careers: null,                        // Citi-only surface; never set here
    location: (detail && detail.PrimaryLocation) || (posting && posting.PrimaryLocation) || null,
    address: null,
    remote_type: (detail && detail.WorkplaceType) || (posting && posting.WorkplaceType) || null,
    time_type: (detail && detail.JobSchedule) || (posting && posting.JobSchedule) || null,
    job_family: (detail && detail.JobFamily) || (posting && posting.JobFamily) || null,
    job_family_group: (detail && detail.JobFunction) || (posting && posting.JobFunction) || null,
    posted_on: budget.dateOnly((detail && detail.ExternalPostedStartDate) || (posting && posting.PostedDate)),
    close_date: budget.dateOnly((detail && detail.ExternalPostedEndDate) || (posting && posting.PostingEndDate)),
    salary_min_cents: null,
    salary_max_cents: null,
    salary_source: null,
    description_text: null,
    detail_fetched: !!detail,
    feed_status: 'open',
    raw: {}
  };

  if (detail) {
    // Oracle splits the posting across several fields; the qualifications and
    // responsibilities blocks are where the requirements a score depends on
    // actually live, so joining them is not cosmetic.
    const text = [detail.ExternalDescriptionStr, detail.ExternalQualificationsStr,
      detail.ExternalResponsibilitiesStr, detail.CorporateDescriptionStr]
      .filter(Boolean).map(budget.stripHtml).join('\n\n').trim();
    out.description_text = text || null;
    const sal = budget.parseSalary(text);
    if (sal) {
      out.salary_min_cents = sal.min_cents;
      out.salary_max_cents = sal.max_cents;
      out.salary_source = sal.source;
    }
    out.raw = {
      jobGrade: detail.JobGrade || null,
      legalEmployer: detail.LegalEmployer || null,
      organization: detail.Organization || null,
      contractType: detail.ContractType || null
    };
  } else if (posting) {
    out.raw = { shortDescription: posting.ShortDescriptionStr || null };
  }
  return out;
}

/** Find one requisition by its id. Returns { posting, detail, normalized } or null. */
async function findByReqId(reqId, { cfg, budget: b, withDetail = true } = {}) {
  const id = String(reqId || '').trim();
  if (!/^\d{6,}$/.test(id)) return null;
  let detail = null;
  try { detail = await getDetail(id, { cfg, budget: b }); } catch (e) { detail = null; }
  if (!detail) return null;
  const posting = { Id: id, Title: detail.Title, PrimaryLocation: detail.PrimaryLocation };
  return { posting, detail: withDetail ? detail : null, normalized: normalize(posting, withDetail ? detail : null, cfg) };
}

module.exports = {
  kind: 'oracle',
  DEFAULT_CFG, cfgFrom, base,
  listJobs, listAll, getDetail,
  reqIdOf, reqIdFromInput, applyUrl, normalize, findByReqId
};
