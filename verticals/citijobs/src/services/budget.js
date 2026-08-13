'use strict';

/**
 * The shared HTTP floor for every employer adapter: one request budget, one
 * timeout, one User-Agent, one injection point for tests.
 *
 * Pulled out of workday.js when JPMorgan arrived. Two adapters each owning
 * their own fetch means SIT has two things to stub and one of them eventually
 * gets missed — and a missed stub is a suite that quietly hits a real bank.
 */

const UA_CONTACT = process.env.CITIJOBS_UA_CONTACT || 'manuelstagg@gmail.com';
const USER_AGENT = `Digit2AI-BankTracker/1.0 (personal job search; ${UA_CONTACT})`;
const TIMEOUT_MS = Number(process.env.CITIJOBS_TIMEOUT_MS || 20000);
const DEFAULT_MAX_REQUESTS = 120;

let _fetch = (...a) => fetch(...a);
function _setFetch(fn) { _fetch = fn || ((...a) => fetch(...a)); }

/**
 * A request budget carried through a run. Every HTTP call decrements it, and
 * exhausting it stops the run and SAYS it stopped — a silent truncation reads
 * as "we covered everything" when we did not.
 */
function newBudget(max) {
  // `max ?? default`, not `max || default`: a caller asking for a budget of 0
  // must get 0. With `||` it silently fell through, which is the exact shape of
  // bug a request ceiling exists to prevent.
  const requested = (max === undefined || max === null || max === '')
    ? (process.env.CITIJOBS_MAX_REQUESTS !== undefined ? process.env.CITIJOBS_MAX_REQUESTS : DEFAULT_MAX_REQUESTS)
    : max;
  const n = Number(requested);
  return {
    max: Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_REQUESTS,
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
      headers: Object.assign({ Accept: 'application/json', 'User-Agent': USER_AGENT },
        (opts && opts.headers) || {})
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

/** Shared HTML-to-text, used by every adapter's description parsing. */
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
 * Salary is COPIED OR ABSENT — for every employer. Never estimated, never
 * interpolated from a sibling requisition in another city. Returns null when
 * the posting is silent, which is the correct answer and not a failure.
 *
 * Citi prints "Salary Range: $x - $y". JPMorgan usually prints nothing at all,
 * and where a state's pay-transparency law forces it, phrasing varies — hence
 * the alternate labels rather than one Citi-shaped regex.
 */
const SALARY_RES = [
  /Salary\s+Range:?\s*\$\s*([\d,]+(?:\.\d{2})?)\s*(?:-|–|—|to)\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
  /Base\s+(?:Pay|Salary)\s*(?:Range)?:?\s*\$\s*([\d,]+(?:\.\d{2})?)\s*(?:-|–|—|to)\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
  /Pay\s+Range:?\s*\$\s*([\d,]+(?:\.\d{2})?)\s*(?:-|–|—|to)\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
  /\$\s*([\d,]{6,})(?:\.\d{2})?\s*(?:-|–|—|to)\s*\$\s*([\d,]{6,})(?:\.\d{2})?\s*(?:per\s+year|annually|\/\s*year)/i
];

function parseSalary(text) {
  const t = String(text || '');
  for (const re of SALARY_RES) {
    const m = t.match(re);
    if (!m) continue;
    const toCents = (s) => Math.round(parseFloat(String(s).replace(/,/g, '')) * 100);
    const min = toCents(m[1]);
    const max = toCents(m[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) continue;
    // A "range" spanning two orders of magnitude is a parse artefact, not pay.
    if (max > min * 20) continue;
    return { min_cents: min, max_cents: max, source: 'stated' };
  }
  return null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function dateOnly(v) {
  const s = String(v || '').slice(0, 10);
  return DATE_ONLY.test(s) ? s : null;
}

module.exports = { newBudget, httpJson, stripHtml, parseSalary, dateOnly, USER_AGENT, _setFetch };
