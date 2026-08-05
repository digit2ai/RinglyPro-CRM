'use strict';

// =============================================================
// Country / location policy (ported from donor cv-geo.js, spec section 5.2).
//
// ATS location strings are a swamp. Every messy shape gets an explicit,
// overridable rule. The one rule that matters most: a posting with NO location
// is FLAGGED, never silently included.
// =============================================================

const US_STATES = new Set(['al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy','dc']);

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

  // "Austin, TX" style — infer US from a state abbreviation.
  if (!countries.includes('US')) {
    const m = s.match(/,\s*([a-z]{2})\b/);
    if (m && US_STATES.has(m[1])) countries.push('US');
  }

  const global = /\bglobal\b|\bworldwide\b|\banywhere in the world\b/.test(s);
  const northAmerica = /\bnorth america\b|\bnamer\b/.test(s);

  return { kind: 'located', raw: s, remote, hybrid, multi, countries, global, northAmerica };
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
  if (c.multi && hit.length < c.countries.length) {
    return { verdict: VERDICT.ALLOW, reason: 'multi-location, at least one in policy (' + hit.join('/') + ')' };
  }
  if (c.hybrid && !c.remote) {
    return { verdict: VERDICT.ALLOW, reason: 'hybrid with office in ' + hit.join('/') + ' — commute is the subscriber\'s call' };
  }
  return { verdict: VERDICT.ALLOW, reason: 'in policy (' + hit.join('/') + ')' };
}

module.exports = { classify, evaluate, VERDICT, US_STATES };
