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
    // The list endpoint carries no body text; this one does.
    detail: (t, ref) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(t)}/postings/${encodeURIComponent(String(ref).split('/').pop())}`,
    parseDetail: (j) => {
      const s = (j.jobAd && j.jobAd.sections) || {};
      const text = ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
        .map((k) => (s[k] && s[k].text) || '').filter(Boolean).join('\n\n');
      return { description: stripHtml(text) };
    },
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
    //
    // IT IS A POST, NOT A GET. The CXS jobs endpoint answers a query GET with
    // HTTP 400 on every tenant — including Citi, which this file documents as
    // the proof case and which returned nothing at all through the GET form.
    // The search parameters belong in a JSON body.
    paginated: true,
    pageSize: 20,
    method: 'POST',
    url: (t) => {
      const [host, tenant, board] = String(t).split('|');
      return `https://${host}/wday/cxs/${tenant}/${board}/jobs`;
    },
    body: (offset = 0) => ({ appliedFacets: {}, limit: 20, offset, searchText: '' }),
    // The list endpoint returns title + location and NOTHING else. A posting
    // with no body text cannot match on a single skill, so the pre-filter
    // scores it zero and it never reaches a subscriber however well it fits —
    // which is how an "Account Executive, Tampa FL" sat in the pool invisible
    // to an OOH advertising seller in Tampa. This is where the text lives.
    detail: (t, externalPath) => {
      const [host, tenant, board] = String(t).split('|');
      return `https://${host}/wday/cxs/${tenant}/${board}${externalPath}`;
    },
    parseDetail: (j) => {
      const i = j.jobPostingInfo || {};
      return {
        description: stripHtml(i.jobDescription || ''),
        posted_at: workdayPostedOn(i.startDate || i.postedOn),
        remote_type: i.remoteType || null,
        time_type: i.timeType || null,
      };
    },
    parse: (j) => (j.jobPostings || []).map((x) => ({
      external_id: x.bulletFields && x.bulletFields[0] ? x.bulletFields[0] : x.externalPath,
      title: x.title, url: x.externalPath, location: x.locationsText,
      description: '', posted_at: workdayPostedOn(x.postedOn),
    })),
    total: (j) => j.total || 0,
  },
  /**
   * UKG / UltiPro. Token is "<host>|<TENANT_CODE>|<boardGuid>" because the same
   * request shape serves three hosts (recruiting.ultipro.com,
   * recruiting2.ultipro.com, <tenant>.rec.pro.ukg.net).
   *
   * This is the family Lamar Advertising and Gray Media are on — the two
   * employers a Florida out-of-home seller most wants and that no adapter here
   * could reach. Unlike Workday, the LIST already carries body text, so a
   * posting is matchable the moment it lands.
   */
  ultipro: {
    paginated: true,
    pageSize: 200,
    method: 'POST',
    // The default fetch user-agent is refused outright by UKG.
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; JobUp/1.0)' },
    url: (t) => {
      const [host, code, guid] = String(t).split('|');
      return `https://${host}/${code}/JobBoard/${guid}/JobBoardView/LoadSearchResults`;
    },
    body: (offset = 0) => ({
      opportunitySearch: {
        Top: 200, Skip: offset, QueryString: '',
        OrderBy: [{ Value: 'postedDateDesc', PropertyName: 'PostedDate', Ascending: false }],
        Filters: [],
      },
      matchCriteria: {
        PreferredJobs: [], Educations: [], LicenseAndCertifications: [],
        Skills: [], hasNoLicenses: false, SkippedSkills: [],
      },
    }),
    parse: (j, t) => {
      const [host, code, guid] = String(t || '').split('|');
      return (j.opportunities || []).map((x) => {
        const loc = (x.Locations || [])[0] || {};
        const a = loc.Address || {};
        const place = [a.City, a.State && a.State.Code, a.Country && a.Country.Code]
          .filter(Boolean).join(', ') || loc.LocalizedName || '';
        return {
          external_id: x.RequisitionNumber || x.Id,
          title: x.Title,
          url: host ? `https://${host}/${code}/JobBoard/${guid}/OpportunityDetail?opportunityId=${x.Id}` : null,
          location: place,
          description: stripHtml(x.BriefDescription || ''),
          // A real ISO date, unlike Workday's "Posted 4 Days Ago" prose.
          posted_at: x.PostedDate ? new Date(x.PostedDate) : null,
        };
      });
    },
    total: (j) => j.totalCount || 0,
  },

  /**
   * JazzHR. No JSON API — the board is server-rendered HTML at a predictable
   * address, and an unknown tenant redirects away instead of 200-ing, which
   * makes the true/false test clean.
   *
   * Small boards, but the Florida ones are ENTIRELY Florida: Fort Myers
   * Broadcasting, Sun Broadcasting and Gulfshore Life are 100% in-state, which
   * no national board comes close to.
   */
  jazzhr: {
    format: 'html',
    url: (t) => `https://${encodeURIComponent(t)}.applytojob.com/apply/`,
    parse: (html) => {
      const out = [];
      const s = String(html || '');
      // Each posting is a heading anchor followed by a marker-icon location.
      const re = /<h3[^>]*list-group-item-heading[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = re.exec(s)) !== null) {
        const title = stripHtml(m[2]).trim();
        if (!title) continue;
        // The location sits in the list that follows this heading.
        const after = s.slice(m.index, m.index + 900);
        const loc = after.match(/fa-map-marker[^>]*><\/i>\s*([^<]{2,80})</i);
        out.push({
          external_id: (m[1].match(/\/apply\/([A-Za-z0-9]+)/) || [])[1] || m[1],
          title,
          url: m[1].startsWith('http') ? m[1] : null,
          location: loc ? loc[1].replace(/&nbsp;/g, ' ').trim() : '',
          description: '',
          posted_at: null,
        });
      }
      return out;
    },
  },

  /**
   * ADP Workforce Now public staffing feed. One keyless GET, no pagination.
   * This is Spanish Broadcasting System's board — Spanish-language radio ad
   * sales in Tampa, Orlando and Miami.
   */
  adp_wfn: {
    url: (t) => 'https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/'
      + `job-requisitions?cid=${encodeURIComponent(t)}&timeStamp=1&locale=en_US`,
    parse: (j) => (j.jobRequisitions || []).map((x) => {
      const a = ((x.requisitionLocations || [])[0] || {}).address || {};
      const st = a.countrySubdivisionLevel1 && a.countrySubdivisionLevel1.codeValue;
      return {
        external_id: x.itemID || x.requisitionId,
        title: x.requisitionTitle,
        url: null,
        location: [a.cityName, st].filter(Boolean).join(', '),
        description: stripHtml((x.requisitionDescription || {}).descriptionText || ''),
        posted_at: x.postDate ? new Date(x.postDate) : null,
      };
    }),
  },

  eightfold: {
    url: (t) => `https://${encodeURIComponent(t)}.eightfold.ai/api/apply/v2/jobs?domain=${encodeURIComponent(t)}.com&start=0&num=100`,
    parse: (j) => (j.positions || []).map((x) => ({
      external_id: String(x.id), title: x.name, url: x.canonicalPositionUrl,
      location: x.location, description: stripHtml(x.job_description), posted_at: x.t_create,
    })),
  },
};

/**
 * Workday reports `postedOn` as English prose relative to today — "Posted
 * Today", "Posted 4 Days Ago", "Posted 30+ Days Ago" — never a date. Passing it
 * to `new Date()` yields Invalid Date, and Postgres rejects the whole INSERT,
 * so ONE unparseable field discarded an entire employer's board.
 *
 * Only the unambiguous forms are converted. "30+ Days Ago" is a floor, not a
 * date, so it comes back null: an approximate posted date the UI would render
 * as fact is worse than no posted date, and nothing here depends on having one.
 */
function workdayPostedOn(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return null;
  const day = 86400000;
  if (/\btoday\b|\bjust posted\b/.test(s)) return new Date();
  if (/\byesterday\b/.test(s)) return new Date(Date.now() - day);
  const m = s.match(/(\d+)\+?\s*day/);
  if (m) return s.includes('+') ? null : new Date(Date.now() - parseInt(m[1], 10) * day);
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

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

  // Some boards repeat a posting across pages, and one (Workday) keeps serving
  // page one for ever past the end of the list. Identity is the requisition,
  // not the position in the response.
  const seenIds = new Set();
  const push = (page) => {
    let added = 0;
    for (const p of page || []) {
      const id = String(p.external_id || p.url || p.title || '');
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id); postings.push(p); added++;
    }
    return added;
  };

  try {
    if (adapter.paginated) {
      let offset = 0;
      while (offset < cap) {
        const req = { headers: { accept: 'application/json', ...(adapter.headers || {}) } };
        if (adapter.method === 'POST') {
          req.method = 'POST';
          req.headers['content-type'] = 'application/json';
          req.body = JSON.stringify(adapter.body(offset));
        }
        const r = await doFetch(adapter.url(token, offset), req);
        // A FAILED FIRST PAGE IS A FAILED BOARD, not an employer with no
        // openings. `break` alone returned ok:true with an empty list, which is
        // indistinguishable from a real empty board — so a broken adapter read
        // as "nothing hiring" on every tenant, silently, for as long as it was
        // broken. Later pages are different: those postings are already real.
        if (!r.ok) {
          if (offset === 0) {
            return { ok: false, status: STATUS.NONE, postings: [], contributes: false,
                     note: `board returned HTTP ${r.status}` };
          }
          capped = true;
          break;
        }
        const j = adapter.format === 'html' ? await r.text() : await r.json();
        total = adapter.total ? adapter.total(j) : 0;
        const page = adapter.parse(j, token);
        const added = push(page);

        // THREE WAYS A LIST ENDS, AND ONLY ONE OF THEM WAS HANDLED.
        //   * a short page — the original check;
        //   * the declared total is reached — Workday happily serves page one
        //     again past the end, so Scripps' 80 postings came back as 400 rows,
        //     320 of them duplicates of the first page;
        //   * a full page containing nothing new — the same symptom on a board
        //     that declares no total at all.
        if (page.length < adapter.pageSize) break;
        if (total > 0 && postings.length >= total) break;
        if (added === 0) break;
        offset += adapter.pageSize;
      }
      // Only claim truncation against a total the board actually declared.
      // Several tenants report total:0 while serving real pages, which made
      // every one of them look capped.
      if (total > 0 && total > postings.length) capped = true;
    } else {
      const r = await doFetch(adapter.url(token), {
        headers: { accept: 'application/json', ...(adapter.headers || {}) } });
      if (!r.ok) {
        return { ok: false, status: STATUS.NONE, postings: [], contributes: false,
                 note: `board returned HTTP ${r.status}` };
      }
      const j = adapter.format === 'html' ? await r.text() : await r.json();
      push(adapter.parse(j, token));
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
  fetchBoard, stripHtml, looksLikeDemo, workdayPostedOn,
  supportedAts: () => Object.keys(ADAPTERS),
};
