// CV Talent Engine — location classification and country-policy evaluation.
//
// ATS boards emit wildly inconsistent location strings: "Remote - US", "Remote (US only)",
// "New York, NY", "London, United Kingdom", "Remote - North America", "Multiple Locations",
// "US-NY-New York | US-CA-San Francisco", or nothing at all. A per-profile country policy is
// worthless unless every one of those shapes has an explicit, documented rule.
//
// classify(text) turns a raw string into a structured verdict; allows(policy, cls) decides.
// Nothing here is person-specific — the policy is data supplied by the caller.

const US_STATES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',
  MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
  NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',
  WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
};

// Country lexicon: ISO code -> match patterns (lowercase). Cities are included only where a
// city name alone is an unambiguous country signal on a job board.
const COUNTRIES = {
  US: { name:'United States', patterns:['united states','u.s.a','u.s.','usa','america'],
        cities:['new york','san francisco','chicago','boston','austin','seattle','atlanta','denver','miami','tampa','dallas','houston','charlotte','phoenix','philadelphia','san diego','los angeles','washington dc','jersey city','wilmington','plano','tempe','san jose','salt lake city'] },
  CA: { name:'Canada', patterns:['canada'], cities:['toronto','vancouver','montreal','montréal','ottawa','calgary','waterloo','mississauga'] },
  MX: { name:'Mexico', patterns:['mexico','méxico'], cities:['mexico city','ciudad de méxico','guadalajara','monterrey'] },
  GB: { name:'United Kingdom', patterns:['united kingdom','england','scotland','wales','northern ireland'], cities:['london','manchester','edinburgh','belfast','glasgow','bristol','leeds','cambridge, uk'] },
  IE: { name:'Ireland', patterns:['ireland'], cities:['dublin','cork'] },
  DE: { name:'Germany', patterns:['germany','deutschland'], cities:['berlin','munich','münchen','frankfurt','hamburg','cologne'] },
  FR: { name:'France', patterns:['france'], cities:['paris','lyon','toulouse'] },
  ES: { name:'Spain', patterns:['spain','españa'], cities:['madrid','barcelona','valencia','sevilla'] },
  PT: { name:'Portugal', patterns:['portugal'], cities:['lisbon','lisboa','porto'] },
  NL: { name:'Netherlands', patterns:['netherlands','holland'], cities:['amsterdam','rotterdam','utrecht'] },
  BE: { name:'Belgium', patterns:['belgium'], cities:['brussels'] },
  CH: { name:'Switzerland', patterns:['switzerland'], cities:['zurich','zürich','geneva','basel'] },
  AT: { name:'Austria', patterns:['austria'], cities:['vienna'] },
  IT: { name:'Italy', patterns:['italy','italia'], cities:['milan','milano','rome','roma','turin'] },
  PL: { name:'Poland', patterns:['poland','polska'], cities:['warsaw','warszawa','krakow','kraków','wroclaw','gdansk'] },
  RO: { name:'Romania', patterns:['romania'], cities:['bucharest','cluj'] },
  CZ: { name:'Czechia', patterns:['czech republic','czechia'], cities:['prague','praha','brno'] },
  SE: { name:'Sweden', patterns:['sweden'], cities:['stockholm','gothenburg'] },
  NO: { name:'Norway', patterns:['norway'], cities:['oslo'] },
  DK: { name:'Denmark', patterns:['denmark'], cities:['copenhagen'] },
  FI: { name:'Finland', patterns:['finland'], cities:['helsinki'] },
  IL: { name:'Israel', patterns:['israel'], cities:['tel aviv','herzliya','jerusalem'] },
  AE: { name:'United Arab Emirates', patterns:['united arab emirates','uae'], cities:['dubai','abu dhabi'] },
  IN: { name:'India', patterns:['india'], cities:['bangalore','bengaluru','hyderabad','pune','mumbai','chennai','gurgaon','gurugram','noida','delhi','kolkata'] },
  SG: { name:'Singapore', patterns:['singapore'], cities:[] },
  JP: { name:'Japan', patterns:['japan'], cities:['tokyo','osaka'] },
  KR: { name:'South Korea', patterns:['south korea','korea'], cities:['seoul'] },
  CN: { name:'China', patterns:['china'], cities:['beijing','shanghai','shenzhen'] },
  HK: { name:'Hong Kong', patterns:['hong kong'], cities:[] },
  AU: { name:'Australia', patterns:['australia'], cities:['sydney','melbourne','brisbane','perth'] },
  NZ: { name:'New Zealand', patterns:['new zealand'], cities:['auckland','wellington'] },
  BR: { name:'Brazil', patterns:['brazil','brasil'], cities:['sao paulo','são paulo','rio de janeiro','belo horizonte'] },
  AR: { name:'Argentina', patterns:['argentina'], cities:['buenos aires','cordoba','córdoba'] },
  CL: { name:'Chile', patterns:['chile'], cities:['santiago'] },
  CO: { name:'Colombia', patterns:['colombia'], cities:['bogota','bogotá','medellin','medellín','cali','barranquilla'] },
  PE: { name:'Peru', patterns:['peru','perú'], cities:['lima'] },
  CR: { name:'Costa Rica', patterns:['costa rica'], cities:['san jose, costa rica'] },
  UY: { name:'Uruguay', patterns:['uruguay'], cities:['montevideo'] },
  VE: { name:'Venezuela', patterns:['venezuela'], cities:['caracas'] },
  PH: { name:'Philippines', patterns:['philippines'], cities:['manila','makati','cebu','taguig'] },
  ZA: { name:'South Africa', patterns:['south africa'], cities:['cape town','johannesburg'] },
  NG: { name:'Nigeria', patterns:['nigeria'], cities:['lagos'] },
  KE: { name:'Kenya', patterns:['kenya'], cities:['nairobi'] },
  EG: { name:'Egypt', patterns:['egypt'], cities:['cairo'] },
  TR: { name:'Turkey', patterns:['turkey','türkiye'], cities:['istanbul'] },
  UA: { name:'Ukraine', patterns:['ukraine'], cities:['kyiv','kiev','lviv'] }
};

// Named remote regions and the countries they cover.
const REGIONS = {
  'north america': ['US','CA','MX'],
  namer: ['US','CA','MX'],
  'united states and canada': ['US','CA'],
  'us and canada': ['US','CA'],
  latam: ['MX','BR','AR','CL','CO','PE','UY','VE','CR'],
  'latin america': ['MX','BR','AR','CL','CO','PE','UY','VE','CR'],
  emea: ['GB','IE','DE','FR','ES','PT','NL','BE','CH','AT','IT','PL','RO','CZ','SE','NO','DK','FI','IL','AE','ZA','NG','KE','EG','TR','UA'],
  europe: ['GB','IE','DE','FR','ES','PT','NL','BE','CH','AT','IT','PL','RO','CZ','SE','NO','DK','FI','UA'],
  eu: ['IE','DE','FR','ES','PT','NL','BE','AT','IT','PL','RO','CZ','SE','DK','FI'],
  apac: ['IN','SG','JP','KR','CN','HK','AU','NZ','PH'],
  'asia pacific': ['IN','SG','JP','KR','CN','HK','AU','NZ','PH'],
  anywhere: null,        // null = every country
  worldwide: null,
  global: null,
  international: null
};

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[‐-―]/g, '-')       // unicode dashes -> hyphen
    .replace(/\s+/g, ' ')
    .trim();
}

// Split a location string into the distinct places it names.
function segments(text) {
  return norm(text)
    .split(/\s*(?:\||;|\bor\b|\band\b|\/|,\s*(?=remote\b))\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function countriesIn(seg) {
  const found = new Set();
  // "US-NY-New York" / "USA - Texas" prefixes
  if (/(^|[^a-z])(us|usa)([^a-z]|$)/.test(seg)) found.add('US');
  for (const [code, c] of Object.entries(COUNTRIES)) {
    for (const p of c.patterns) if (seg.includes(p)) { found.add(code); break; }
    if (!found.has(code)) for (const city of c.cities) if (seg.includes(city)) { found.add(code); break; }
  }
  // US state code or full name (e.g. "New York, NY" / "Wesley Chapel, Florida")
  for (const [code, name] of Object.entries(US_STATES)) {
    if (new RegExp('(^|[^a-z])' + code.toLowerCase() + '([^a-z]|$)').test(seg) || seg.includes(name.toLowerCase())) { found.add('US'); break; }
  }
  return Array.from(found);
}

function regionIn(seg) {
  for (const key of Object.keys(REGIONS)) {
    if (new RegExp('(^|[^a-z])' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(seg)) return key;
  }
  return null;
}

/**
 * Classify a raw ATS location string.
 * Returns { raw, remote, countries[], region, region_countries[], scope, multi, unknown }
 *   scope: 'country'  the posting names one or more countries
 *          'region'   remote scoped to a named region ("Remote - North America")
 *          'global'   remote with no geographic limit ("Remote - Anywhere")
 *          'none'     nothing usable was found
 */
function classify(text, opts = {}) {
  const raw = String(text || '').trim();
  const n = norm(raw);
  const remoteFlag = !!opts.remote || /\bremote\b|\bwork from home\b|\bwfh\b|\bdistributed\b/.test(n);
  if (!n) return { raw, remote: remoteFlag, countries: [], region: null, region_countries: [], scope: 'none', multi: false, unknown: true };

  const segs = segments(n);
  const countrySet = new Set();
  let region = null;
  segs.forEach((s) => { countriesIn(s).forEach((c) => countrySet.add(c)); if (!region) region = regionIn(s); });

  const countries = Array.from(countrySet);
  const multi = segs.length > 1 || countries.length > 1 || /\bmultiple locations\b|\bvarious\b/.test(n);

  let scope = 'none';
  if (countries.length) scope = 'country';
  else if (region) scope = REGIONS[region] === null ? 'global' : 'region';
  else if (remoteFlag) scope = 'global';           // bare "Remote" with no qualifier

  const region_countries = region && REGIONS[region] ? REGIONS[region] : [];
  return { raw, remote: remoteFlag, countries, region, region_countries, scope, multi,
           unknown: scope === 'none' };
}

// Default rules — every messy case has one, and each is overridable per profile.
const DEFAULT_RULES = {
  remote_global: 'allow',        // allow | flag | exclude   ("Remote", "Remote - Anywhere")
  remote_region: 'allow',        // allow | flag | exclude   (allowed only if a target country is IN the region)
  multi_location: 'allow',       // allow | flag | exclude   (allowed if ANY named place matches)
  unknown_location: 'flag',      // allow | flag | exclude   (no parseable location at all)
  hybrid_in_country: 'allow'     // an on-site/hybrid role inside a target country
};

/**
 * Evaluate a classification against a per-profile country policy.
 * policy = { countries:[{code, remote_ok, onsite_ok}], rules:{...}, enabled:bool }
 * Returns { allowed, flagged, reason, matched_country }
 */
function allows(policy, cls) {
  const p = policy || {};
  if (p.enabled === false || !Array.isArray(p.countries) || !p.countries.length) {
    return { allowed: true, flagged: false, reason: 'no country policy set', matched_country: null };
  }
  const rules = Object.assign({}, DEFAULT_RULES, p.rules || {});
  const byCode = {};
  p.countries.forEach((c) => { if (c && c.code) byCode[String(c.code).toUpperCase()] = c; });
  const wanted = Object.keys(byCode);
  const verdict = (rule, reason, matched) => {
    if (rule === 'exclude') return { allowed: false, flagged: false, reason, matched_country: matched || null };
    if (rule === 'flag') return { allowed: true, flagged: true, reason, matched_country: matched || null };
    return { allowed: true, flagged: false, reason, matched_country: matched || null };
  };

  if (cls.scope === 'country') {
    const hit = cls.countries.find((c) => wanted.includes(c));
    if (!hit) return { allowed: false, flagged: false, reason: 'outside target countries (' + cls.countries.join(', ') + ')', matched_country: null };
    const conf = byCode[hit];
    const wantsRemote = cls.remote;
    if (wantsRemote && conf.remote_ok === false) return { allowed: false, flagged: false, reason: 'remote not accepted for ' + hit, matched_country: hit };
    if (!wantsRemote && conf.onsite_ok === false) return { allowed: false, flagged: false, reason: 'on-site not accepted for ' + hit, matched_country: hit };
    if (cls.multi) return verdict(rules.multi_location, 'multi-location posting including ' + hit, hit);
    return { allowed: true, flagged: false, reason: 'in ' + hit, matched_country: hit };
  }

  if (cls.scope === 'region') {
    const hit = (cls.region_countries || []).find((c) => wanted.includes(c));
    if (!hit) return { allowed: false, flagged: false, reason: 'remote region "' + cls.region + '" excludes target countries', matched_country: null };
    if (byCode[hit].remote_ok === false) return { allowed: false, flagged: false, reason: 'remote not accepted for ' + hit, matched_country: hit };
    return verdict(rules.remote_region, 'remote within ' + cls.region + ' (covers ' + hit + ')', hit);
  }

  if (cls.scope === 'global') {
    const anyRemote = wanted.find((c) => byCode[c].remote_ok !== false);
    if (!anyRemote) return { allowed: false, flagged: false, reason: 'remote not accepted by policy', matched_country: null };
    return verdict(rules.remote_global, 'remote with no stated country limit', null);
  }

  return verdict(rules.unknown_location, 'posting states no location', null);
}

// Convenience: classify + evaluate in one call.
function evaluate(policy, locationText, remoteFlag) {
  const cls = classify(locationText, { remote: remoteFlag });
  const res = allows(policy, cls);
  return Object.assign({}, res, { classification: cls });
}

function countryName(code) { return (COUNTRIES[String(code || '').toUpperCase()] || {}).name || String(code || ''); }
function countryList() { return Object.entries(COUNTRIES).map(([code, c]) => ({ code, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)); }

module.exports = { classify, allows, evaluate, countryName, countryList, US_STATES, REGIONS, DEFAULT_RULES };
