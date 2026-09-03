/* ─────────────────────────────────────────────────────────────────────────
   OPEN JOB FEEDS — the sources that are not somebody's ATS board.

   The hunter's pool was fed by ATS boards alone (Greenhouse, Lever, Ashby,
   Workday, …). Adzuna was wired to the MAP only, so the fifty live openings a
   subscriber could see on /jobsearch were never scored by the agent that is
   supposed to be hunting for them. That is the gap this closes.

   EVERY CONNECTOR RETURNS THE SHAPE jobsource.ingest ALREADY TAKES —
   { external_id, title, location, url, description, compensation, posted_at }
   — so these ride the same dedupe key, the same US-only geo policy and the
   same pre-filter as everything else. A second ingest path with its own key
   would silently double-insert; jobsource.js documents that scar already.

   WHICH SOURCES, AND WHY NOT THE OTHERS. Measured, not assumed. Of the free
   keyless boards, only The Muse carries US clinical work in any volume: in a
   sample of 20 it returned 12 medical roles, 10 of them US. Remotive, Jobicy,
   Himalayas and Arbeitnow returned ZERO US medical roles between them — they
   are remote-tech boards, and adding them to a physician product would be
   noise that the US-only filter would mostly delete anyway. They are left out
   deliberately, and this comment is the record of why.

   A SOURCE THAT NEEDS A KEY SAYS SO AND RETURNS NOTHING. It never invents a
   posting, and never reports a refresh it did not perform. `status()` names
   which feeds are live and which are dormant for want of a key, so "the hunter
   found nothing" can always be told apart from "the hunter was not looking".
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

const UA = 'JobUp/1.0 (+https://jobup.dev)';
const TIMEOUT_MS = Number(process.env.JOBUP_FEED_TIMEOUT_MS || 20000);

async function httpJson(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, headers || {}),
    });
    if (!r.ok) return { ok: false, status: r.status, error: 'HTTP ' + r.status };
    return { ok: true, body: await r.json() };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'timed out' : e.message };
  } finally { clearTimeout(timer); }
}

function clean(s, max) {
  return String(s == null ? '' : s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 6000);
}

/* ── 1. ADZUNA ────────────────────────────────────────────────────────────
   Already keyed in production and already trusted for the map. The country is
   pinned in the PATH (/jobs/us/), so this cannot return a foreign posting
   even if a query asked for one — the strongest form the US-only rule can
   take, because it is enforced by the provider rather than by our filter. */
function adzunaKeyed() {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

async function adzuna({ what, where, page = 1, perPage = 50 } = {}) {
  if (!adzunaKeyed()) {
    return { ok: false, source: 'adzuna', dormant: true,
             note: 'ADZUNA_APP_ID / ADZUNA_APP_KEY not set — this feed contributed nothing.',
             postings: [] };
  }
  const p = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID,
    app_key: process.env.ADZUNA_APP_KEY,
    results_per_page: String(Math.min(perPage, 50)),
    'content-type': 'application/json',
  });
  if (what) p.set('what', what);
  if (where) p.set('where', where);
  const r = await httpJson(`https://api.adzuna.com/v1/api/jobs/us/search/${page}?${p.toString()}`);
  if (!r.ok) return { ok: false, source: 'adzuna', error: r.error, postings: [] };

  const postings = (r.body.results || []).map((j) => ({
    external_id: String(j.id || ''),
    title: clean(j.title, 300),
    // Adzuna's display name is already "City, County" / "City, State".
    location: clean((j.location && j.location.display_name) || '', 200),
    url: j.redirect_url || null,
    description: clean(j.description, 6000),
    // ONLY WHAT THE POSTING STATED. Adzuna marks a predicted salary with
    // salary_is_predicted:'1'; passing that through as if the employer wrote
    // it would put a number in front of a subscriber that nobody offered.
    compensation: (j.salary_is_predicted === '1' || j.salary_is_predicted === 1)
      ? null
      : (j.salary_min || j.salary_max
          ? { min: j.salary_min || null, max: j.salary_max || null, currency: 'USD' }
          : null),
    posted_at: j.created || null,
    employer: clean((j.company && j.company.display_name) || '', 200) || 'Unknown employer',
  }));
  return { ok: true, source: 'adzuna', postings, total: r.body.count || postings.length };
}

/* ── 2. USAJOBS ───────────────────────────────────────────────────────────
   The US federal government's own board, and the reason it is here rather
   than a nice-to-have: the Department of Veterans Affairs is one of the
   largest employers of physicians and nurses in the country, and none of its
   openings appear on a Greenhouse or Lever board.

   US-only by construction — it is a federal hiring system. The key is free
   (an email plus a key from the USAJOBS developer page) but it IS required;
   unkeyed this returns nothing and says so rather than degrading silently. */
function usajobsKeyed() {
  return Boolean(process.env.USAJOBS_API_KEY && process.env.USAJOBS_EMAIL);
}

async function usajobs({ what, where, perPage = 50, page = 1 } = {}) {
  if (!usajobsKeyed()) {
    return { ok: false, source: 'usajobs', dormant: true,
             note: 'USAJOBS_API_KEY / USAJOBS_EMAIL not set — federal and VA openings are NOT being searched. '
                 + 'The key is free from https://developer.usajobs.gov/APIRequest',
             postings: [] };
  }
  const p = new URLSearchParams({ ResultsPerPage: String(Math.min(perPage, 500)), Page: String(page) });
  if (what) p.set('Keyword', what);
  if (where) p.set('LocationName', where);
  const r = await httpJson('https://data.usajobs.gov/api/search?' + p.toString(), {
    'Authorization-Key': process.env.USAJOBS_API_KEY,
    'User-Agent': process.env.USAJOBS_EMAIL,
    Host: 'data.usajobs.gov',
  });
  if (!r.ok) return { ok: false, source: 'usajobs', error: r.error, postings: [] };

  const items = ((r.body.SearchResult || {}).SearchResultItems) || [];
  const postings = items.map((it) => {
    const d = it.MatchedObjectDescriptor || {};
    const pay = (d.PositionRemuneration || [])[0] || null;
    return {
      external_id: String(it.MatchedObjectId || d.PositionID || ''),
      title: clean(d.PositionTitle, 300),
      location: clean((d.PositionLocationDisplay
        || ((d.PositionLocation || [])[0] || {}).LocationName || ''), 200),
      url: d.PositionURI || null,
      description: clean((d.UserArea && d.UserArea.Details && d.UserArea.Details.JobSummary)
        || d.QualificationSummary || '', 6000),
      // The grade range the notice itself states, never a derived figure.
      compensation: pay && (pay.MinimumRange || pay.MaximumRange)
        ? { min: Number(pay.MinimumRange) || null, max: Number(pay.MaximumRange) || null,
            currency: 'USD', period: pay.RateIntervalCode || null }
        : null,
      posted_at: d.PublicationStartDate || null,
      employer: clean(d.OrganizationName || d.DepartmentName || '', 200) || 'US Federal Government',
    };
  });
  return { ok: true, source: 'usajobs', postings,
           total: Number(((r.body.SearchResult || {}).SearchResultCountAll) || postings.length) };
}

/* ── 3. THE MUSE ──────────────────────────────────────────────────────────
   Keyless, and the only free open board measured to carry US clinical work in
   volume. A key raises the rate limit but is not required, so this feed is
   live for everyone with no configuration at all. */
async function themuse({ category = 'Healthcare', where, page = 0 } = {}) {
  const p = new URLSearchParams({ page: String(page) });
  if (category) p.append('category', category);
  if (where) p.append('location', where);
  if (process.env.THEMUSE_API_KEY) p.set('api_key', process.env.THEMUSE_API_KEY);
  const r = await httpJson('https://www.themuse.com/api/public/jobs?' + p.toString());
  if (!r.ok) return { ok: false, source: 'themuse', error: r.error, postings: [] };

  const postings = (r.body.results || []).map((j) => ({
    external_id: String(j.id || ''),
    title: clean(j.name, 300),
    location: clean(((j.locations || [])[0] || {}).name || '', 200),
    url: (j.refs && j.refs.landing_page) || null,
    description: clean(j.contents, 6000),
    compensation: null,                       // The Muse does not publish pay
    posted_at: j.publication_date || null,
    employer: clean((j.company && j.company.name) || '', 200) || 'Unknown employer',
  }));
  return { ok: true, source: 'themuse', postings, total: Number(r.body.total || postings.length) };
}

/* Which feeds are live, and which are dormant for want of a free key.
   Never guessed: this is what /diagnose and the refresh report read, so
   "found nothing" is always distinguishable from "was not looking". */
function status() {
  return {
    adzuna: { live: adzunaKeyed(), keyed: true,
              needs: 'ADZUNA_APP_ID + ADZUNA_APP_KEY', country: 'US (pinned in the request path)' },
    usajobs: { live: usajobsKeyed(), keyed: true,
               needs: 'USAJOBS_API_KEY + USAJOBS_EMAIL (free)',
               country: 'US only — federal hiring system',
               why: 'the VA is one of the largest physician and nurse employers in the US' },
    themuse: { live: true, keyed: false, needs: null, country: 'mixed — filtered by the US-only geo policy' },
  };
}

const FEEDS = { adzuna, usajobs, themuse };

module.exports = { FEEDS, adzuna, usajobs, themuse, status, adzunaKeyed, usajobsKeyed, clean };
