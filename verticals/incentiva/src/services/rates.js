'use strict';

/**
 * Reference mortgage rate from Freddie Mac's Primary Mortgage Market Survey
 * (weekly national average, 30-year fixed). Public CSV, no key.
 *
 * Used ONLY when the agent has not entered a reference rate in Settings. It is
 * a published average for comparison, never a loan offer, and every surface
 * that shows it names the source and the survey date. Cached for 12 hours;
 * a failed fetch keeps the last good value; no value at all = null, and the
 * estimate says it cannot run rather than inventing a rate.
 * INCENTIVA_RATE_FEED=off disables it (SIT runs offline).
 */

const FEED_URL = process.env.INCENTIVA_RATE_FEED_URL || 'https://www.freddiemac.com/pmms/docs/PMMS_history.csv';
const TTL_MS = 12 * 3600e3;
const SOURCE = { en: 'Freddie Mac Primary Mortgage Market Survey, 30-year fixed national average', es: 'Encuesta PMMS de Freddie Mac, promedio nacional a 30 años fijo' };

let cache = null; // { rate, as_of, fetched_at }
let inflight = null;

/** Last row with a 30-year figure. Columns: date (M/D/YYYY), pmms30, ... */
function parsePmms(csv) {
  const lines = String(csv || '').trim().split(/\r?\n/);
  for (let k = lines.length - 1; k > 0; k--) {
    const [date, r30] = lines[k].split(',');
    const m = String(date || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const rate = Number(String(r30 || '').trim());
    if (m && isFinite(rate) && rate > 1 && rate < 20) {
      return { rate, as_of: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` };
    }
  }
  return null;
}

async function fetchLatest() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(FEED_URL, { signal: ctl.signal, headers: { 'User-Agent': 'BuyersLine/1.0 (rate reference)', Accept: 'text/csv' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const parsed = parsePmms(await r.text());
    if (!parsed) throw new Error('no rate row');
    cache = Object.assign(parsed, { fetched_at: Date.now() });
    return cache;
  } finally { clearTimeout(timer); }
}

async function latest() {
  if (process.env.INCENTIVA_RATE_FEED === 'off') return cache && cache.injected ? cache : null;
  if (cache && Date.now() - cache.fetched_at < TTL_MS) return cache;
  if (!inflight) {
    inflight = fetchLatest()
      .catch((e) => { console.error('[incentiva] rate feed:', e.message); return cache; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

function source(lang) { return lang === 'es' ? SOURCE.es : SOURCE.en; }
function _inject(value) { cache = value ? Object.assign({ fetched_at: Date.now(), injected: true }, value) : null; }

module.exports = { latest, parsePmms, source, _inject };
