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

// Every id shape below was READ OFF THE LIVE FEED, not assumed. They are not
// all distinct — PNC and Capital One both issue `R######` — which is why
// detect() reports an ambiguity instead of picking one. See detect().
const REGISTRY = {
  citi: {
    key: 'citi',
    name: 'Citi',
    adapter: 'workday',
    // tenant:datacenter:site. wd1/wd3/wd103 return 422; wd5 is the live one.
    cfg: parseTriple(process.env.CITIJOBS_WORKDAY || 'citi:wd5:2', ['tenant', 'dc', 'site']),
    id_pattern: /^\d{8}$/,                    // 26974948
    careers_url: 'https://jobs.citi.com/job/tampa',
    // Workday caps a search's reported total at 2000, so discovery must be many
    // narrow queries deduped by req id rather than one firehose.
    total_is_capped: true
  },
  pnc: {
    key: 'pnc',
    name: 'PNC',
    adapter: 'workday',
    cfg: parseTriple(process.env.CITIJOBS_WORKDAY_PNC || 'pnc:wd5:External', ['tenant', 'dc', 'site']),
    id_pattern: /^R\d{5,7}$/i,                // R224025 — shared shape with Capital One
    careers_url: 'https://careers.pnc.com/global/en/search-results',
    total_is_capped: true
  },
  capitalone: {
    key: 'capitalone',
    name: 'Capital One',
    adapter: 'workday',
    cfg: parseTriple(process.env.CITIJOBS_WORKDAY_CAPONE || 'capitalone:wd12:Capital_One', ['tenant', 'dc', 'site']),
    id_pattern: /^R\d{5,7}$/i,                // R247988 — shared shape with PNC
    careers_url: 'https://www.capitalonecareers.com/search-jobs',
    total_is_capped: true
  },
  usbank: {
    key: 'usbank',
    name: 'U.S. Bank',
    adapter: 'workday',
    cfg: parseTriple(process.env.CITIJOBS_WORKDAY_USBANK || 'usbank:wd1:US_Bank_Careers', ['tenant', 'dc', 'site']),
    id_pattern: /^\d{4}-\d{7}$/,              // 2026-0025089
    careers_url: 'https://careers.usbank.com/global/en/search-results',
    total_is_capped: true
  },
  jpmorgan: {
    key: 'jpmorgan',
    name: 'JPMorgan Chase',
    adapter: 'oracle',
    cfg: parseTriple(process.env.CITIJOBS_ORACLE_JPMC || 'jpmc:CX_1001', ['tenant', 'site']),
    id_pattern: /^2\d{8}$/,                   // 210712563
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

// The adapter needs the bank's id shape to pick the right candidate out of a
// posting, so it travels with the connection config rather than being a second
// argument every call site has to remember.
Object.values(REGISTRY).forEach((e) => { if (e.cfg && e.id_pattern) e.cfg.id_pattern = e.id_pattern; });

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

  // A URL names its own bank: the Workday tenant or the careers host is in it.
  for (const key of enabledKeys()) {
    const e = REGISTRY[key];
    if (e.cfg && e.cfg.tenant) {
      if (lower.includes(`${e.cfg.tenant}.${e.cfg.dc || ''}.myworkdayjobs.com`)) return e;
      if (lower.includes(`${e.cfg.tenant}.fa.oraclecloud.com`)) return e;
    }
  }
  if (lower.includes('jobs.citi.com')) return REGISTRY.citi;
  if (lower.includes('jpmorganchase.com') || lower.includes('careers.jpmorgan.com')) return REGISTRY.jpmorgan;
  if (lower.includes('capitalonecareers.com')) return REGISTRY.capitalone;
  if (lower.includes('careers.pnc.com')) return REGISTRY.pnc;
  if (lower.includes('careers.usbank.com')) return REGISTRY.usbank;

  // Otherwise match ID-SHAPED TOKENS in the input against each bank's OWN
  // shape, read off its live feed. Token-wise rather than whole-string so
  // "Job Req Id: 26974948" and a pasted path both resolve.
  //
  // Deliberately NOT "ask each adapter": four of the five banks share the
  // Workday adapter, so every one of them would claim the same input and the
  // answer would always be ambiguous.
  const tokens = idTokens(s);
  const claimed = new Set();
  for (const tok of tokens) {
    for (const key of enabledKeys()) {
      const e = REGISTRY[key];
      if (e.id_pattern && e.id_pattern.test(tok)) claimed.add(key);
    }
  }
  if (claimed.size === 1) return REGISTRY[[...claimed][0]];
  if (claimed.size > 1) {
    // PNC and Capital One both issue `R######`. Picking one would file the
    // requisition under the wrong bank, silently and permanently — so say so
    // and let the human name it.
    const err = new Error('That requisition id could belong to more than one bank.');
    err.code = 'AMBIGUOUS';
    err.candidates = [...claimed].map((k) => ({ key: k, name: REGISTRY[k].name }));
    throw err;
  }
  return null;
}

/** Tokens from an input that could plausibly BE a requisition id. */
function idTokens(s) {
  const raw = String(s || '');
  const out = new Set();
  (raw.match(/[A-Za-z]{0,2}\d[\w-]*/g) || []).forEach((t) => {
    out.add(t);
    out.add(t.replace(/-\d+$/, ''));   // Workday appends -1 / -2 to a path id
  });
  // Path forms: …/Data-Manager_R223512-1
  (raw.match(/_([A-Za-z0-9-]{4,})/g) || []).forEach((t) => {
    const v = t.slice(1);
    out.add(v);
    out.add(v.replace(/-\d+$/, ''));
  });
  return [...out];
}

/** The requisition id inside `input`, read in the named bank's own dialect. */
function reqIdFrom(key, input) {
  const e = get(key);
  const ad = adapterFor(key);
  if (!e || !ad) return null;
  const s = String(input || '').trim();
  if (e.id_pattern && e.id_pattern.test(s)) return s;
  const tok = idTokens(s).find((t) => e.id_pattern && e.id_pattern.test(t));
  if (tok) return tok;
  return ad.reqIdFromInput(s);
}

module.exports = { REGISTRY, ADAPTERS, list, get, adapterFor, nameOf, detect, reqIdFrom, enabledKeys };
