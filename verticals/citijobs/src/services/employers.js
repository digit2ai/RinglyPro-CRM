'use strict';

/**
 * The employer registry — which banks the tracker watches, and which adapter
 * speaks to each one.
 *
 * Adding a bank is an entry here plus an adapter module. Everything downstream
 * (scoring, the pre-filter, tailoring, the skill store, the pay floor, the
 * board, the console pipeline) already works on requisitions rather than on
 * Citi, so none of it changes.
 *
 * MEASURED, NOT ASSUMED. Citi runs Workday; JPMorgan Chase runs Oracle Fusion
 * recruiting. Both were probed live before being added here. The CV engine's
 * older note that "JPMorgan exposes no keyless feed" was true of the adapters
 * that engine had — Greenhouse, Lever, Ashby, Workday — and not of JPMC, which
 * simply had never been asked in the right dialect.
 */

const workday = require('./workday');
const oracle = require('./oracle');

const ADAPTERS = { workday, oracle };

const REGISTRY = {
  citi: {
    key: 'citi',
    name: 'Citi',
    adapter: 'workday',
    // tenant:datacenter:site. wd1/wd3/wd103 return 422; wd5 is the live one.
    cfg: parseTriple(process.env.CITIJOBS_WORKDAY || 'citi:wd5:2', ['tenant', 'dc', 'site']),
    careers_url: 'https://jobs.citi.com/job/tampa',
    // Workday caps a search's reported total at 2000, so discovery must be many
    // narrow queries deduped by req id rather than one firehose.
    total_is_capped: true
  },
  jpmorgan: {
    key: 'jpmorgan',
    name: 'JPMorgan Chase',
    adapter: 'oracle',
    cfg: parseTriple(process.env.CITIJOBS_ORACLE_JPMC || 'jpmc:CX_1001', ['tenant', 'site']),
    careers_url: 'https://www.jpmorganchase.com/careers',
    // Oracle reports the true count, so a query here can genuinely be paged.
    total_is_capped: false
  }
};

function parseTriple(raw, keys) {
  const parts = String(raw).split(':');
  const out = {};
  keys.forEach((k, i) => { if (parts[i]) out[k] = parts[i]; });
  return out;
}

/** Which employers are switched on. Default: all of them. */
function enabledKeys() {
  const raw = process.env.CITIJOBS_EMPLOYERS;
  if (!raw) return Object.keys(REGISTRY);
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter((k) => REGISTRY[k]);
}

function list() { return enabledKeys().map((k) => REGISTRY[k]); }
function get(key) { return REGISTRY[String(key || '').toLowerCase()] || null; }
function adapterFor(key) {
  const e = get(key);
  return e ? ADAPTERS[e.adapter] : null;
}
function nameOf(key) {
  const e = get(key);
  return e ? e.name : String(key || 'unknown');
}

/**
 * Work out which employer a pasted requisition id or URL belongs to.
 *
 * Deliberately NOT a guess: each adapter only claims an input its own id shape
 * and host match. Citi ids are 8 digits, JPMC ids start with 2 and run 9, and
 * a URL carries its host. An ambiguous bare number resolves to nothing rather
 * than to whichever employer happened to be checked first — importing a
 * requisition under the wrong bank would be silently wrong forever.
 */
function detect(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  if (lower.includes('myworkdayjobs.com') || lower.includes('jobs.citi.com')) return REGISTRY.citi;
  if (lower.includes('oraclecloud.com') || lower.includes('jpmorganchase.com') || lower.includes('careers.jpmorgan.com')) {
    return REGISTRY.jpmorgan;
  }

  const claims = [];
  for (const key of enabledKeys()) {
    const ad = adapterFor(key);
    if (ad && ad.reqIdFromInput && ad.reqIdFromInput(s)) claims.push(REGISTRY[key]);
  }
  return claims.length === 1 ? claims[0] : null;
}

module.exports = { REGISTRY, ADAPTERS, list, get, adapterFor, nameOf, detect, enabledKeys };
