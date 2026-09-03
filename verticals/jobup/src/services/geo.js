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

/**
 * Where a US city is, for location strings that name no state at all.
 *
 * A broadcast or out-of-home employer writes its locations as markets, not
 * addresses: "WTSP-TV Tampa", "KFMB-TV San Diego", "WWL WUPL-TV New Orleans".
 * None of those contain a state, so a subscriber who had restricted their
 * search to Florida was shown San Diego, New Orleans and Lexington — her
 * filter was working perfectly and the parser simply could not read the
 * strings it was being asked to judge.
 *
 * Only cities distinctive enough to place without a state. Springfield,
 * Columbus, Portland, Kansas City and friends are deliberately absent: a wrong
 * state is worse than an unread one, because it is acted on with confidence.
 */
const CITY_STATE = {
  tampa: 'fl', 'st. petersburg': 'fl', 'saint petersburg': 'fl', clearwater: 'fl',
  orlando: 'fl', miami: 'fl', jacksonville: 'fl', sarasota: 'fl', ocala: 'fl',
  'fort lauderdale': 'fl', 'west palm beach': 'fl', 'boca raton': 'fl', naples: 'fl',
  tallahassee: 'fl', gainesville: 'fl', 'pembroke pines': 'fl', 'coral gables': 'fl',
  'new orleans': 'la', 'baton rouge': 'la', shreveport: 'la',
  'san diego': 'ca', 'los angeles': 'ca', 'san francisco': 'ca', sacramento: 'ca',
  'san jose': 'ca', 'palo alto': 'ca', 'santa monica': 'ca', oakland: 'ca',
  'long beach': 'ca', fresno: 'ca', irvine: 'ca', burbank: 'ca', 'redwood city': 'ca',
  lexington: 'ky', louisville: 'ky',
  seattle: 'wa', spokane: 'wa', tacoma: 'wa', bellevue: 'wa', redmond: 'wa',
  atlanta: 'ga', savannah: 'ga', macon: 'ga', augusta: 'ga',
  chicago: 'il', naperville: 'il', evanston: 'il',
  boston: 'ma', cambridge: 'ma', worcester: 'ma', springfield: null,
  'new york': 'ny', brooklyn: 'ny', manhattan: 'ny', buffalo: 'ny', rochester: 'ny',
  albany: 'ny', syracuse: 'ny', 'wilkes barre': 'pa', 'wilkes-barre': 'pa',
  philadelphia: 'pa', pittsburgh: 'pa', harrisburg: 'pa', allentown: 'pa',
  dallas: 'tx', houston: 'tx', austin: 'tx', 'san antonio': 'tx', 'fort worth': 'tx',
  'corpus christi': 'tx', 'el paso': 'tx', lubbock: 'tx', amarillo: 'tx',
  'san angelo': 'tx', temple: 'tx', waco: 'tx', midland: null,
  denver: 'co', boulder: 'co', 'colorado springs': 'co',
  phoenix: 'az', tucson: 'az', scottsdale: 'az', tempe: 'az', mesa: 'az',
  detroit: 'mi', 'grand rapids': 'mi', 'ann arbor': 'mi',
  minneapolis: 'mn', 'st. paul': 'mn', 'saint paul': 'mn',
  'saint louis': 'mo', 'st. louis': 'mo',
  cleveland: 'oh', cincinnati: 'oh', toledo: 'oh', dayton: 'oh',
  indianapolis: 'in', 'fort wayne': 'in',
  milwaukee: 'wi', madison: null, 'green bay': 'wi',
  nashville: 'tn', memphis: 'tn', knoxville: 'tn', chattanooga: 'tn',
  charlotte: 'nc', raleigh: 'nc', durham: 'nc', greensboro: 'nc', asheville: 'nc',
  charleston: null, columbia: null, greenville: null,
  richmond: 'va', norfolk: 'va', arlington: null, alexandria: null,
  baltimore: 'md', annapolis: 'md', bethesda: 'md',
  newark: 'nj', 'jersey city': 'nj', princeton: 'nj', hoboken: 'nj',
  hartford: 'ct', stamford: 'ct', 'new haven': 'ct',
  'salt lake city': 'ut', provo: 'ut',
  'las vegas': 'nv', reno: 'nv',
  'oklahoma city': 'ok', tulsa: 'ok',
  'little rock': 'ar', birmingham: 'al', huntsville: 'al', montgomery: 'al',
  jackson: null, 'des moines': 'ia', omaha: 'ne', wichita: 'ks',
  albuquerque: 'nm', boise: 'id', anchorage: 'ak', honolulu: 'hi',
  'salisbury': 'md', melbourne: null, /* Melbourne FL vs Australia — ambiguous */
  'sioux falls': 'sd', fargo: 'nd', billings: 'mt', cheyenne: 'wy',
  burlington: 'vt', portland: null, manchester: null, providence: 'ri',
  wilmington: null, dover: null, 'virginia beach': 'va',
};

/** Every US state named in a location string, as lowercase codes, deduped. */
function statesIn(s) {
  const found = new Set();
  // "Austin, TX" / "Tampa, FL or Austin, TX" — the comma is what makes a
  // two-letter token safe to read as a state.
  let m; const re = /,\s*([a-z]{2})\b/g;
  while ((m = re.exec(s)) !== null) if (US_STATES.has(m[1])) found.add(m[1]);

  // "KY, Lexington" — some boards lead with the code instead of trailing it.
  // Anchored, so it can only ever be the first token and never eats a word.
  const lead = s.match(/^\s*([a-z]{2})\s*,/);
  if (lead && US_STATES.has(lead[1])) found.add(lead[1]);

  // A distinctive city places itself. Word-boundary matched, and only for
  // cities that are unambiguous nationally — see CITY_STATE.
  for (const [city, st] of Object.entries(CITY_STATE)) {
    if (!st) continue;                       // listed as known-ambiguous
    if (new RegExp('(^|[^a-z])' + city.replace(/[.]/g, '\\.') + '([^a-z]|$)').test(s)) found.add(st);
  }

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
  // Named cities count as their country for the same reason they count as
  // their state: an employer writes "Montreal", not "Montreal, Canada".
  if (/\bcanada\b|\bcanadian\b|\bmontr[eé]al\b|\btoronto\b|\bvancouver\b|\bcalgary\b|\bottawa\b|\bedmonton\b|\bwinnipeg\b|\bhalifax\b|\bqu[eé]bec\b/.test(s)) countries.push('CA');
  if (/\baustralia\b|\bsydney\b|\bmelbourne, (au|vic)\b|\bbrisbane\b|\bperth\b/.test(s)) countries.push('AU');
  if (/\bnetherlands\b|\bamsterdam\b|\brotterdam\b/.test(s)) countries.push('NL');
  if (/\bireland\b|\bdublin\b/.test(s)) countries.push('IE');
  if (/\bbrazil\b|\bbrasil\b|\bs[aã]o paulo\b/.test(s)) countries.push('BR');
  if (/\bsingapore\b/.test(s)) countries.push('SG');
  if (/\bjapan\b|\btokyo\b/.test(s)) countries.push('JP');
  if (/\bphilippines\b|\bmanila\b|\bmakati\b/.test(s)) countries.push('PH');
  if (/\bvietnam\b|\bha noi\b|\bhanoi\b/.test(s)) countries.push('VN');
  if (/\bchina\b|\bshanghai\b|\bbeijing\b|\bwuxi\b|\bchangzhou\b/.test(s)) countries.push('CN');
  if (/\bspain\b|\bmadrid\b|\bbarcelona\b/.test(s)) countries.push('ES');
  if (/\bfrance\b|\bparis\b/.test(s)) countries.push('FR');
  if (/\buk\b|\bunited kingdom\b|\bengland\b|\blondon\b/.test(s)) countries.push('GB');
  if (/\bindia\b|\bbengaluru\b|\bbangalore\b/.test(s)) countries.push('IN');
  if (/\bgermany\b|\bberlin\b|\bmunich\b/.test(s)) countries.push('DE');
  if (/\bmexico\b|\bméxico\b|\bcdmx\b/.test(s)) countries.push('MX');
  if (/\bcolombia\b|\bbogot[aá]\b|\bmedell[ií]n\b/.test(s)) countries.push('CO');

  // More country names, added after measuring the live pool: 1,568 of 8,000
  // postings were reaching subscribers as "country not recognized", and the
  // bucket was overwhelmingly foreign — Warsaw, Budapest, Kuala Lumpur,
  // Kowloon, Dubai, Seoul, Cluj-Napoca, Bayan Lepas. The filter was not weak;
  // the parser could not read the strings it was being asked to judge.
  if (/\bpoland\b|\bwarsaw\b|\bwarszawa\b|\bkrak[oó]w\b|\bwroc[lł]aw\b|\bgda[nń]sk\b/.test(s)) countries.push('PL');
  if (/\bhungary\b|\bbudapest\b|\bmiskolc\b|\bdebrecen\b|\bszeged\b|\bhatvan\b/.test(s)) countries.push('HU');
  if (/\bmalaysia\b|\bkuala lumpur\b|\bpenang\b|\bbayan lepas\b|\bselangor\b|\bcyberjaya\b/.test(s)) countries.push('MY');
  if (/\bhong kong\b|\bkowloon\b/.test(s)) countries.push('HK');
  if (/\bunited arab emirates\b|\bdubai\b|\babu dhabi\b/.test(s)) countries.push('AE');
  if (/\bsouth korea\b|\bseoul\b|\bincheon\b/.test(s)) countries.push('KR');
  if (/\bromania\b|\bbucharest\b|\bcluj-napoca\b|\btimi[sș]oara\b|\bia[sș]i\b/.test(s)) countries.push('RO');
  if (/\bportugal\b|\blisbon\b|\blisboa\b|\bporto\b|\bbraga\b/.test(s)) countries.push('PT');
  if (/\bczech\b|\bczechia\b|\bprague\b|\bpraha\b|\bbrno\b/.test(s)) countries.push('CZ');
  if (/\bpoland\b|\bkatowice\b|\bpozna[nń]\b|\b[lł][oó]d[zź]\b/.test(s)) countries.push('PL');
  if (/\bthailand\b|\bbangkok\b/.test(s)) countries.push('TH');
  if (/\bindonesia\b|\bjakarta\b/.test(s)) countries.push('ID');
  if (/\bturkey\b|\bt[uü]rkiye\b|\bistanbul\b|\bankara\b/.test(s)) countries.push('TR');
  if (/\bisrael\b|\btel aviv\b/.test(s)) countries.push('IL');
  if (/\bswitzerland\b|\bz[uü]rich\b|\bgeneva\b|\bgen[eè]ve\b/.test(s)) countries.push('CH');
  if (/\bsweden\b|\bstockholm\b|\bg[oö]teborg\b/.test(s)) countries.push('SE');
  if (/\bnorway\b|\boslo\b/.test(s)) countries.push('NO');
  if (/\bdenmark\b|\bcopenhagen\b|\bk[oø]benhavn\b/.test(s)) countries.push('DK');
  if (/\bfinland\b|\bhelsinki\b/.test(s)) countries.push('FI');
  if (/\bbelgium\b|\bbrussels\b|\bbruxelles\b/.test(s)) countries.push('BE');
  if (/\bitaly\b|\bitalia\b|\bmilan\b|\bmilano\b|\brome\b|\broma\b/.test(s)) countries.push('IT');
  if (/\baustria\b|\bvienna\b|\bwien\b/.test(s)) countries.push('AT');
  if (/\bargentina\b|\bbuenos aires\b/.test(s)) countries.push('AR');
  if (/\bchile\b|\bsantiago de chile\b/.test(s)) countries.push('CL');
  if (/\bperu\b|\bper[uú]\b|\blima, pe\b/.test(s)) countries.push('PE');
  if (/\bcosta rica\b|\bsan jos[eé], cr\b/.test(s)) countries.push('CR');
  if (/\bnew zealand\b|\bauckland\b|\bwellington, nz\b/.test(s)) countries.push('NZ');
  if (/\bsouth africa\b|\bjohannesburg\b|\bcape town\b/.test(s)) countries.push('ZA');
  if (/\begypt\b|\bcairo\b/.test(s)) countries.push('EG');
  if (/\bpakistan\b|\bkarachi\b|\blahore\b/.test(s)) countries.push('PK');
  if (/\btaiwan\b|\btaipei\b/.test(s)) countries.push('TW');

  // "Budapest, hu" / "Campinas, br" — the ISO country code after a comma, the
  // convention Workday and Adzuna both use. A bare two-letter token is NEVER
  // read this way (half of them are ordinary English), and a code that is also
  // a US state abbreviation is skipped entirely: ", ca" is California far more
  // often than Canada, and guessing wrong sends a Los Angeles job to Toronto.
  {
    const m = s.match(/,\s*([a-z]{2})\b\s*$/);
    const iso = m && m[1];
    const KNOWN = new Set(['pl','hu','br','cn','mx','pt','ro','my','cz','th','tr','il','ch',
      'se','no','dk','fi','be','it','at','ar','cl','pe','cr','nz','za','eg','pk','tw','hk',
      'ae','kr','jp','sg','ph','vn','gb','uk','fr','es','nl','ie','au','ru','ua','gr','hr',
      'rs','bg','sk','si','lt','lv','ee','lu','is','pr','do','gt','hn','sv','ni','pa','py',
      'uy','bo','ec','ve','ke','ng','gh','ma','tn','dz','sa','qa','kw','bh','om','jo','lb',
      'bd','lk','np','mm','kh','la','bn','mn','kz','uz','az','ge','am']);
    if (iso && !US_STATES.has(iso) && KNOWN.has(iso)) {
      countries.push(iso === 'uk' ? 'GB' : iso.toUpperCase());
    }
  }

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

  // ── STRICT US ONLY ───────────────────────────────────────────────────────
  // JobMD hunts US clinical postings and nothing else, so "we could not verify
  // this is in the United States" must mean NO, not "show it and let them
  // judge". Every filter in the engine drops BLOCK and passes FLAG, so a flag
  // is a pass — which meant a posting with no location, one that says
  // "Anywhere", and one nobody could parse all reached the subscriber.
  //
  // It is a POLICY FLAG, not a global change: JobUp keeps flagging, which is
  // right for a product whose subscriber reviews the edge cases themselves.
  // TWO NAMES, ONE RULE. `us_only` is enforced for every profile by
  // settings.sanitize; `strict_us` is what the brand registry stamps. Reading
  // both means neither path can silently stop working — and a merge that
  // dropped one would have turned the filter off for a whole product.
  const strict = policy.strict_us === true || policy.us_only === true;

  if (c.kind === 'none') {
    // US-ONLY, ENFORCED: a posting we cannot confirm is in the US is not shown.
    // Without this, a locationless posting was FLAGGED (never blocked), so it
    // reached the board — which is how non-US and unplaceable jobs appeared.
    if (strict) return { verdict: VERDICT.BLOCK, reason: 'US-only: posting states no location' };
    return { verdict: policy.flag_unknown === false ? VERDICT.ALLOW : VERDICT.FLAG,
             reason: 'posting states no location' };
  }
  if (unrestricted) return { verdict: VERDICT.ALLOW, reason: 'no country restriction on this profile' };

  if (c.global) {
    // A globally-remote posting is takeable FROM the US but is not a job based
    // IN the US, and for a licensed clinical role that distinction is the whole
    // point — a role open to anyone on earth is not a US hospital vacancy.
    if (strict && !c.countries.includes('US')) {
      return { verdict: VERDICT.BLOCK, reason: 'open globally, not a US posting' };
    }
    return { verdict: VERDICT.ALLOW, reason: 'remote, global' };
  }
  if (c.northAmerica) {
    // "North America" is the US, Canada AND Mexico. Under a US-only rule that
    // is not a verified US posting, and for a licensed clinical role a Toronto
    // or Monterrey vacancy is not one a US-licensed clinician can take.
    if (strict && !c.countries.includes('US')) {
      return { verdict: VERDICT.BLOCK, reason: 'North America (includes CA/MX), not stated as US' };
    }
    const ok = allowed.includes('US') || allowed.includes('CA') || allowed.includes('MX');
    return { verdict: ok ? VERDICT.ALLOW : VERDICT.BLOCK, reason: 'remote, North America' };
  }
  if (c.countries.length === 0) {
    // US-ONLY, ENFORCED. A location we cannot positively read as US is refused
    // rather than flagged onto the board — that is what stops "London",
    // "Bengaluru" and other unparsed-foreign strings from appearing. The one
    // exception is a REMOTE posting: the pool is US-sourced, so a bare "Remote"
    // is a US-workable role, not a foreign office, and is kept.
    if (strict) {
      // A remote role is kept ONLY when it names no foreign region — "Remote"
      // and "Remote - US" stay; "Remote - EMEA / Europe / India" are refused.
      const FOREIGN = /\b(emea|apac|apj|anz|latam|latin america|europe|european|eu|uk|u\.k\.|england|britain|canada|canadian|india|australia|singapore|germany|france|spain|italy|mexico|brazil|argentina|colombia|philippines|ireland|netherlands|poland|romania|asia|asian|africa|middle east|gcc|dubai|uae)\b/i;
      return (c.remote && !FOREIGN.test(c.raw))
        ? { verdict: VERDICT.ALLOW, reason: 'US-only: remote role, workable from the US' }
        : { verdict: VERDICT.BLOCK, reason: 'US-only: location not confirmed US: ' + c.raw };
    }
    // A LOCATION WE CANNOT READ IS NOT A LOCATION IN POLICY.
    //
    // This returned FLAG, and nothing consumes a flag — every caller filters
    // on BLOCK alone, so "we could not parse this" quietly meant "allow". A
    // subscriber who had restricted her search to one state was shown San
    // Diego, New Orleans, Lexington, Montreal and Australia, and reasonably
    // concluded the filter was broken. It was not; the parser was.
    //
    // The parser is much better now, so what still reaches here is genuinely
    // unreadable. When somebody has drawn an explicit geographic line, an
    // unreadable location is refused rather than waved through — being shown
    // nothing from a market you cannot work in beats being shown five things.
    // With no state restriction it stays a flag, which is the old behaviour
    // and the right one: nothing has been ruled out to contradict.
    const restricted = (policy.allowed_states || []).length > 0;
    return restricted
      ? { verdict: VERDICT.BLOCK, reason: 'location could not be placed, and this search is limited to '
          + (policy.allowed_states || []).map((x) => String(x).toUpperCase()).join('/') + ': ' + c.raw }
      : { verdict: VERDICT.FLAG, reason: 'location present but country not recognized: ' + c.raw };
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
  let stateReason = null;
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
    // PASSING THE STATE IS NOT THE END OF THE CHECK. This used to return ALLOW
    // here, which made the city rule below unreachable for exactly the people
    // who had set one — a subscriber who chose Tampa was shown the whole of
    // Florida and the filter looked ignored. Fall through instead.
    stateReason = 'in policy (' + sHit.map((x) => x.toUpperCase()).join('/') + ')';
  }

  // ---- CITY POLICY --------------------------------------------------------
  // Applied after country and state, and governed by the SAME rule that makes
  // the state filter safe: a posting that is remote across the country can be
  // taken from any city, so a city filter must never touch it. Without that
  // exemption a subscriber who names their city loses every remote role on the
  // board — the ones they can most easily take — and it fails silently.
  //
  // A city is matched as a whole word against the location string only, never
  // the body: "our Tampa team is hiring for Phoenix" is a Phoenix job.
  const cities = (policy.allowed_cities || [])
    .map((x) => norm(x).replace(/,.*$/, '').trim()).filter(Boolean);
  if (cities.length && hit.includes('US')) {
    if (c.global || c.remoteNational) {
      return { verdict: VERDICT.ALLOW, reason: 'remote across the US — any city can take it' };
    }
    const loc = norm(raw);
    const cHit = cities.filter((city) =>
      new RegExp('\\b' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(loc));
    if (!cHit.length) {
      // Unlike a state, a city is often simply absent from a location string
      // that is still perfectly in range ("Hillsborough County, FL"). Blocking
      // on absence would hide most of a metro area, so an unmatched posting
      // that already passed the state check is FLAGGED, not dropped.
      return { verdict: VERDICT.FLAG,
               reason: 'outside the chosen ' + (cities.length > 1 ? 'cities' : 'city')
                     + ' (' + cities.join('/') + '): ' + c.raw };
    }
    return { verdict: VERDICT.ALLOW, reason: 'in ' + cHit.join('/') };
  }

  if (stateReason) return { verdict: VERDICT.ALLOW, reason: stateReason };

  if (c.multi && hit.length < c.countries.length) {
    return { verdict: VERDICT.ALLOW, reason: 'multi-location, at least one in policy (' + hit.join('/') + ')' };
  }
  if (c.hybrid && !c.remote) {
    return { verdict: VERDICT.ALLOW, reason: 'hybrid with office in ' + hit.join('/') + ' — commute is the subscriber\'s call' };
  }
  return { verdict: VERDICT.ALLOW, reason: 'in policy (' + hit.join('/') + ')' };
}

module.exports = { classify, evaluate, VERDICT, US_STATES, STATE_NAMES, statesIn };
