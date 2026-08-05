'use strict';

// =============================================================
// Employer / ATS connector registry (ported from donor cv-employers.js).
//
// THE INVARIANT THAT MUST NOT REGRESS (spec section 10):
//   A GUESSED board token is quarantined as `unverified` and contributes
//   NOTHING to the shared pool until a human confirms it. Guessing a token from
//   a company name lands on abandoned trial accounts squatting real names —
//   accenture.recruitee.com and ey.recruitee.com serve Amsterdam demo posts
//   titled "Senior Marketer (Sample)". REACHABLE IS NOT LIVE.
//
// Closed ATS families are NAMED AS CLOSED, not scraped around.
// =============================================================

const STATUS = { LIVE: 'live', UNVERIFIED: 'unverified', CLOSED: 'closed', DEMO: 'demo', NONE: 'none' };

// Families with no keyless public feed. We say so rather than working around them.
const CLOSED_FAMILIES = ['icims', 'taleo', 'phenom', 'oracle_hcm', 'successfactors'];

// Markers that prove a board is an abandoned demo, not a real careers page.
const DEMO_MARKERS = [
  /\(sample\)/i, /\bsample job\b/i, /\bdemo\b/i, /\btest job\b/i,
  /lorem ipsum/i, /\byour company\b/i, /\bexample inc\b/i,
];

const ADAPTERS = {
  greenhouse: {
    url: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/jobs?content=true`,
    parse: (j) => (j.jobs || []).map((x) => ({
      external_id: String(x.id), title: x.title, url: x.absolute_url,
      location: x.location && x.location.name, description: stripHtml(x.content),
      posted_at: x.updated_at,
    })),
  },
  lever: {
    url: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
    parse: (j) => (Array.isArray(j) ? j : []).map((x) => ({
      external_id: x.id, title: x.text, url: x.hostedUrl,
      location: x.categories && x.categories.location,
      description: stripHtml(x.descriptionPlain || x.description), posted_at: x.createdAt,
    })),
  },
  ashby: {
    url: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}?includeCompensation=true`,
    parse: (j) => (j.jobs || []).map((x) => ({
      external_id: x.id, title: x.title, url: x.jobUrl, location: x.location,
      description: stripHtml(x.descriptionPlain || x.descriptionHtml),
      compensation: compFromAshby(x), posted_at: x.publishedAt,
    })),
  },
  smartrecruiters: {
    url: (t) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(t)}/postings?limit=100`,
    parse: (j) => (j.content || []).map((x) => ({
      external_id: x.id, title: x.name,
      url: `https://jobs.smartrecruiters.com/${x.company && x.company.identifier}/${x.id}`,
      location: x.location && [x.location.city, x.location.country].filter(Boolean).join(', '),
      description: '', posted_at: x.releasedDate,
    })),
  },
  workable: {
    url: (t) => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(t)}?details=true`,
    parse: (j) => (j.jobs || []).map((x) => ({
      external_id: x.shortcode, title: x.title, url: x.url,
      location: [x.city, x.country].filter(Boolean).join(', '),
      description: stripHtml(x.description), posted_at: x.published_on,
    })),
  },
  recruitee: {
    url: (t) => `https://${encodeURIComponent(t)}.recruitee.com/api/offers/`,
    parse: (j) => (j.offers || []).map((x) => ({
      external_id: String(x.id), title: x.title, url: x.careers_url,
      location: [x.city, x.country].filter(Boolean).join(', '),
      description: stripHtml(x.description), posted_at: x.published_at,
    })),
  },
  workday: {
    // PAGINATED. A large tenant holds thousands of postings served 20 at a time;
    // one request is page one, often sorted by an unrelated region. Citi returns
    // ~2,000. We cap and SAY SO — never silently truncate (spec section 10).
    paginated: true,
    pageSize: 20,
    url: (t, offset = 0) => {
      const [host, tenant, board] = String(t).split('|');
      return `https://${host}/wday/cxs/${tenant}/${board}/jobs?limit=20&offset=${offset}`;
    },
    parse: (j) => (j.jobPostings || []).map((x) => ({
      external_id: x.bulletFields && x.bulletFields[0] ? x.bulletFields[0] : x.externalPath,
      title: x.title, url: x.externalPath, location: x.locationsText,
      description: '', posted_at: x.postedOn,
    })),
    total: (j) => j.total || 0,
  },
  eightfold: {
    url: (t) => `https://${encodeURIComponent(t)}.eightfold.ai/api/apply/v2/jobs?domain=${encodeURIComponent(t)}.com&start=0&num=100`,
    parse: (j) => (j.positions || []).map((x) => ({
      external_id: String(x.id), title: x.name, url: x.canonicalPositionUrl,
      location: x.location, description: stripHtml(x.job_description), posted_at: x.t_create,
    })),
  },
};

function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function compFromAshby(x) {
  const c = x.compensation && x.compensation.compensationTierSummary;
  return c || null; // only when the posting states it — never estimated
}

function looksLikeDemo(postings) {
  if (!postings || postings.length === 0) return false;
  const sample = postings.slice(0, 5);
  return sample.some((p) => DEMO_MARKERS.some((re) => re.test(p.title || '')));
}

// Fetch a board. `verified` decides whether results may enter the shared pool.
async function fetchBoard(ats, token, { verified = false, cap = 200, fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (CLOSED_FAMILIES.includes(ats)) {
    return { ok: false, status: STATUS.CLOSED, postings: [], contributes: false,
             note: `${ats} exposes no keyless public feed. Named as closed, not scraped around.` };
  }
  const adapter = ADAPTERS[ats];
  if (!adapter) return { ok: false, status: STATUS.NONE, postings: [], contributes: false, note: 'unknown ATS' };

  let postings = [];
  let capped = false;
  let total = 0;

  try {
    if (adapter.paginated) {
      let offset = 0;
      while (offset < cap) {
        const r = await doFetch(adapter.url(token, offset), { headers: { accept: 'application/json' } });
        if (!r.ok) break;
        const j = await r.json();
        total = adapter.total ? adapter.total(j) : 0;
        const page = adapter.parse(j);
        postings.push(...page);
        if (page.length < adapter.pageSize) break;
        offset += adapter.pageSize;
      }
      if (total > postings.length) capped = true;
    } else {
      const r = await doFetch(adapter.url(token), { headers: { accept: 'application/json' } });
      if (!r.ok) {
        return { ok: false, status: STATUS.NONE, postings: [], contributes: false,
                 note: `board returned HTTP ${r.status}` };
      }
      const j = await r.json();
      postings = adapter.parse(j);
      total = postings.length;
    }
  } catch (e) {
    return { ok: false, status: STATUS.NONE, postings: [], contributes: false, note: e.message };
  }

  if (looksLikeDemo(postings)) {
    return { ok: false, status: STATUS.DEMO, postings: [], contributes: false,
             note: 'demo/sample board — rejected outright' };
  }

  // THE QUARANTINE. A guessed token is never trusted into the pool.
  const status = verified ? STATUS.LIVE : STATUS.UNVERIFIED;
  const contributes = verified === true;

  return {
    ok: true,
    status,
    contributes,
    postings: contributes ? postings : [],
    sample_titles: postings.slice(0, 5).map((p) => p.title),
    total,
    capped,
    note: contributes
      ? (capped ? `capped at ${postings.length} of ${total} postings this refresh` : null)
      : 'GUESSED token — quarantined as unverified. Contributes nothing to the pool until confirmed. Sample titles provided for a human to judge.',
  };
}

module.exports = {
  ADAPTERS, CLOSED_FAMILIES, STATUS, DEMO_MARKERS,
  fetchBoard, stripHtml, looksLikeDemo,
  supportedAts: () => Object.keys(ADAPTERS),
};
