'use strict';

// =============================================================
// Country / location policy (ported from donor cv-geo.js, spec section 5.2).
//
// ATS location strings are a swamp. Every messy shape gets an explicit,
// overridable rule. The one rule that matters most: a posting with NO location
// is FLAGGED, never silently included.
// =============================================================

const US_STATES = new Set(['al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy','dc']);

/**
 * Code -> full name, for reading a state out of prose and for labelling the UI.
 *
 * Names are matched as WHOLE WORDS and only in the long form. Two-letter codes
 * are matched only after a comma ("Austin, TX"), never bare: half of them are
 * ordinary English — IN, OR, OK, ME, HI, MA, DE, LA, PA — and a bare scan turns
 * "Remote or hybrid" into Oregon and "Bengaluru, India" into Indiana.
 */
const STATE_NAMES = {
  al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California',
  co: 'Colorado', ct: 'Connecticut', de: 'Delaware', fl: 'Florida', ga: 'Georgia',
  hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa',
  ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland',
  ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi',
  mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire',
  nj: 'New Jersey', nm: 'New Mexico', ny: 'New York', nc: 'North Carolina',
  nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania',
  ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee',
  tx: 'Texas', ut: 'Utah', vt: 'Vermont', va: 'Virginia', wa: 'Washington',
  wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming', dc: 'District of Columbia',
};

/** Every US state named in a location string, as lowercase codes, deduped. */
function statesIn(s) {
  const found = new Set();
  // "Austin, TX" / "Tampa, FL or Austin, TX" — the comma is what makes a
  // two-letter token safe to read as a state.
  let m; const re = /,\s*([a-z]{2})\b/g;
  while ((m = re.exec(s)) !== null) if (US_STATES.has(m[1])) found.add(m[1]);

  // Washington DC before Washington state, or every "washington, d.c." posting
  // is read as the Pacific Northwest.
  if (/\bwashington,?\s*d\.?\s*c\.?\b|\bdistrict of columbia\b/.test(s)) {
    found.add('dc'); found.delete('wa');
  } else {
    for (const [code, name] of Object.entries(STATE_NAMES)) {
      if (code === 'dc') continue;
      if (new RegExp('\\b' + name.toLowerCase() + '\\b').test(s)) found.add(code);
    }
  }
  return Array.from(found);
}

const VERDICT = { ALLOW: 'allow', BLOCK: 'block', FLAG: 'flag' };

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Classify a raw ATS location string into structured signals.
function classify(raw) {
  const s = norm(raw);
  if (!s) return { kind: 'none', remote: false, countries: [], multi: false };

  const remote = /\bremote\b|\bwork from home\b|\bwfh\b|\banywhere\b|\bdistributed\b/.test(s);
  const hybrid = /\bhybrid\b/.test(s);
  const multi = /;|\bor\b|\/|\||,\s*[a-z ]+,\s*[a-z]/.test(s) && s.split(/[;|]|\bor\b/).length > 1;

  const countries = [];
  if (/\bunited states\b|\bu\.?s\.?a?\.?\b|\busa\b/.test(s)) countries.push('US');
  if (/\bcanada\b|\bcanadian\b/.test(s)) countries.push('CA');
  if (/\buk\b|\bunited kingdom\b|\bengland\b|\blondon\b/.test(s)) countries.push('GB');
  if (/\bindia\b|\bbengaluru\b|\bbangalore\b/.test(s)) countries.push('IN');
  if (/\bgermany\b|\bberlin\b|\bmunich\b/.test(s)) countries.push('DE');
  if (/\bmexico\b|\bméxico\b|\bcdmx\b/.test(s)) countries.push('MX');
  if (/\bcolombia\b|\bbogot[aá]\b|\bmedell[ií]n\b/.test(s)) countries.push('CO');

  // "Austin, TX" style — infer US from a state abbreviation or a state name.
  const states = statesIn(s);
  if (!countries.includes('US') && states.length) countries.push('US');

  const global = /\bglobal\b|\bworldwide\b|\banywhere in the world\b/.test(s);
  const northAmerica = /\bnorth america\b|\bnamer\b/.test(s);
  // "Remote - US", "Remote (US only)", "Remote, United States" — remote and
  // national. Takeable from ANY state, so a state filter must not touch it.
  const remoteNational = remote && countries.includes('US') && !states.length;

  return { kind: 'located', raw: s, remote, hybrid, multi, countries, states,
           global, northAmerica, remoteNational };
}

// Decide against a profile's country policy.
//   allowedCountries: [] or null  => unrestricted
//   flagUnknown: default true     => a locationless posting is FLAGGED, not included
function evaluate(raw, policy = {}) {
  const allowed = (policy.allowed_countries || []).map((c) => String(c).toUpperCase());
  const unrestricted = allowed.length === 0;
  const c = classify(raw);

  if (c.kind === 'none') {
    return { verdict: policy.flag_unknown === false ? VERDICT.ALLOW : VERDICT.FLAG,
             reason: 'posting states no location' };
  }
  if (unrestricted) return { verdict: VERDICT.ALLOW, reason: 'no country restriction on this profile' };

  if (c.global) {
    return { verdict: VERDICT.ALLOW, reason: 'remote, global' };
  }
  if (c.northAmerica) {
    const ok = allowed.includes('US') || allowed.includes('CA') || allowed.includes('MX');
    return { verdict: ok ? VERDICT.ALLOW : VERDICT.BLOCK, reason: 'remote, North America' };
  }
  if (c.countries.length === 0) {
    return { verdict: VERDICT.FLAG, reason: 'location present but country not recognized: ' + c.raw };
  }

  const hit = c.countries.filter((x) => allowed.includes(x));
  if (hit.length === 0) {
    return { verdict: VERDICT.BLOCK, reason: 'country ' + c.countries.join('/') + ' outside policy' };
  }

  // ---- STATE POLICY -------------------------------------------------------
  // Applied only AFTER the country check, and only to postings tied to a place.
  //
  // THE RULE THAT MAKES THIS USABLE: a remote-national posting ("Remote - US")
  // is takeable from any state, so a state filter must never touch it. Getting
  // this wrong deletes the best matches on the board — the remote roles are
  // exactly the ones a state-restricted subscriber can actually take — and it
  // fails silently, looking like a thin week rather than a broken filter.
  const states = (policy.allowed_states || [])
    .map((x) => String(x).toLowerCase()).filter((x) => US_STATES.has(x));
  if (states.length && hit.includes('US')) {
    if (c.global || c.remoteNational) {
      return { verdict: VERDICT.ALLOW, reason: 'remote across the US — any state can take it' };
    }
    if (!c.states.length) {
      // US, but which part is unstated. Flagged for the subscriber, never
      // silently dropped — same rule as a posting with no location at all.
      return { verdict: VERDICT.FLAG, reason: 'US posting, state not stated: ' + c.raw };
    }
    const sHit = c.states.filter((x) => states.includes(x));
    if (!sHit.length) {
      return { verdict: VERDICT.BLOCK,
               reason: 'state ' + c.states.map((x) => x.toUpperCase()).join('/') + ' outside policy' };
    }
    return { verdict: VERDICT.ALLOW,
             reason: 'in policy (' + sHit.map((x) => x.toUpperCase()).join('/') + ')' };
  }

  if (c.multi && hit.length < c.countries.length) {
    return { verdict: VERDICT.ALLOW, reason: 'multi-location, at least one in policy (' + hit.join('/') + ')' };
  }
  if (c.hybrid && !c.remote) {
    return { verdict: VERDICT.ALLOW, reason: 'hybrid with office in ' + hit.join('/') + ' — commute is the subscriber\'s call' };
  }
  return { verdict: VERDICT.ALLOW, reason: 'in policy (' + hit.join('/') + ')' };
}

module.exports = { classify, evaluate, VERDICT, US_STATES, STATE_NAMES, statesIn };
