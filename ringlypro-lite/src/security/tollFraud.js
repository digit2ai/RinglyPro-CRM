'use strict';

/**
 * Toll-fraud guard — the one gate every outbound call and text Lite makes
 * passes through.
 *
 * WHY THIS EXISTS. On 2026-08-06 someone holding this Twilio account's
 * credentials bought a number and, within 40 seconds, dialled ten sequential
 * numbers in Cameroon (+237) and Tunisia (+216). That is International Revenue
 * Share Fraud: the attacker owns the premium destination and is paid per minute
 * we call it. Twilio disabled voice on the whole account the next day (32005),
 * taking down every number on it, a paying customer's line included.
 *
 * That attack used the master credentials directly and never touched this app,
 * so the Twilio-side controls (2FA, rotated token, geo permissions) are what
 * stop THAT path. But Lite has three doors of its own that reach the same
 * payout, and they are open to anyone because signup is open and unverified:
 *
 *   1. transfer_to_human dials tenant.transfer_number / owner_phone, which the
 *      tenant types. Sign up, set it to a premium +237 number, call the line,
 *      ask for a human: we place the call and pay for it.
 *   2. Owner alerts text tenant.owner_phone — same field, SMS pumping.
 *   3. The demo confirms bookings by texting whatever callback number the
 *      caller or web-chat visitor gave. Anyone on the internet can make us text
 *      any number they choose.
 *
 * So the destination is checked HERE, at the provider, for every dial and every
 * text — not only when the field is saved. A field saved before this existed,
 * edited straight in the database, or reached by a path nobody has written yet
 * still cannot become a call to a premium number.
 */

// Destinations we will ever call or text. ISO codes; override with
// LITE_ALLOWED_DIAL_COUNTRIES (e.g. "US,CO"). Deliberately a short allow-list,
// never a deny-list: the premium-rate world changes weekly, the places our
// customers live do not.
const DEFAULT_COUNTRIES = 'US,CO';

// +1 is shared by the US with ~20 Caribbean and Atlantic countries whose area
// codes BILL AS INTERNATIONAL and are the classic "one-ring" fraud destinations
// (a +1 876 number looks domestic and is Jamaica). Canada is included because
// it is +1 but not the US; allow it with CA if ever needed. Puerto Rico and the
// US Virgin Islands are domestic and are NOT here.
const CARIBBEAN = new Set([
  '242', '246', '264', '268', '284', '345', '441', '473', '649', '658', '664',
  '721', '758', '767', '784', '809', '829', '849', '868', '869', '876',
  // Pacific territories: NANP numbers that carriers commonly bill as international.
  '670', '671', '684',
]);
// Non-geographic NANP codes (personal communications, carrier services): never
// an owner's phone, and a known home for premium routing.
const NON_GEOGRAPHIC = new Set(['456', '500', '521', '522', '523', '524', '525', '526', '527', '528',
  '529', '532', '533', '544', '566', '577', '588', '700']);
const CANADA = new Set([
  '204', '226', '236', '249', '250', '263', '289', '306', '343', '354', '365',
  '367', '368', '382', '387', '403', '416', '418', '428', '431', '437', '438',
  '450', '460', '468', '474', '506', '514', '519', '548', '579', '581', '584',
  '587', '600', '604', '613', '622', '639', '647', '672', '683', '705', '709',
  '742', '753', '778', '780', '782', '807', '819', '825', '867', '873', '879',
  '902', '905', '257', '942',
]);
// US premium rate: the 900 area code, and 976 as an EXCHANGE (there is no 976
// area code; pay-per-call numbers are NPA-976-XXXX).
const US_PREMIUM_AREA = new Set(['900', '976']);
const US_PREMIUM_EXCHANGE = new Set(['976']);

function allowedCountries() {
  return String(process.env.LITE_ALLOWED_DIAL_COUNTRIES || DEFAULT_COUNTRIES)
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
}

/** Strip formatting to +digits. Returns null for anything that is not a phone. */
function normalize(raw, defaultCountry) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Letters, SIP URIs or client: identifiers are never a destination we dial.
  if (/[a-z@:]/i.test(s)) return null;
  const digits = s.replace(/[^\d]/g, '');
  if (!digits) return null;
  if (s.startsWith('+')) return '+' + digits;
  if (s.startsWith('00')) return '+' + digits.slice(2);
  // A number typed without a country code belongs to the OWNER'S country. A
  // Colombian owner typing "315 765 4321" means +57, and reading it as US would
  // text their alerts to a stranger in New York.
  if (String(defaultCountry || 'US').toUpperCase() === 'CO') {
    if (digits.length === 10 && /^(3|60)/.test(digits)) return '+57' + digits;
    if (digits.length === 12 && digits.startsWith('57')) return '+' + digits;
    return null;                                                  // ambiguous for CO: refuse, never guess
  }
  if (digits.length === 10) return '+1' + digits;                 // bare US 10-digit
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return null;                                                    // ambiguous: refuse, never guess
}

/**
 * Is this a destination Lite may call or text?
 * Returns { ok, e164, country, reason }. `reason` is a stable code for logs and
 * API errors; it never echoes the number back.
 */
function checkDestination(raw, opts) {
  const e164 = normalize(raw, opts && opts.defaultCountry);
  if (!e164) return { ok: false, e164: null, country: null, reason: 'not_a_phone_number' };
  const allow = allowedCountries();

  if (e164.startsWith('+1')) {
    if (e164.length !== 12) return { ok: false, e164, country: null, reason: 'bad_length' };
    const area = e164.slice(2, 5);
    const exchange = e164.slice(5, 8);
    // NANP area codes and exchanges never start with 0 or 1.
    if (/^[01]/.test(area) || /^[01]/.test(exchange)) return { ok: false, e164, country: null, reason: 'invalid_nanp' };
    if (US_PREMIUM_AREA.has(area) || US_PREMIUM_EXCHANGE.has(exchange)) return { ok: false, e164, country: 'US', reason: 'premium_rate' };
    if (NON_GEOGRAPHIC.has(area)) return { ok: false, e164, country: 'US', reason: 'non_geographic' };
    if (CARIBBEAN.has(area)) return { ok: false, e164, country: 'NANP_INTL', reason: 'country_not_allowed' };
    if (CANADA.has(area)) {
      if (allow.includes('CA')) return { ok: true, e164, country: 'CA', reason: null };
      return { ok: false, e164, country: 'CA', reason: 'country_not_allowed' };
    }
    if (!allow.includes('US')) return { ok: false, e164, country: 'US', reason: 'country_not_allowed' };
    return { ok: true, e164, country: 'US', reason: null };
  }

  if (e164.startsWith('+57')) {
    const rest = e164.slice(3);
    // Colombia: 10-digit mobile (3xx) or landline (60x). Nothing else.
    if (!/^(3\d{9}|60\d{8})$/.test(rest)) return { ok: false, e164, country: 'CO', reason: 'bad_length' };
    if (!allow.includes('CO')) return { ok: false, e164, country: 'CO', reason: 'country_not_allowed' };
    return { ok: true, e164, country: 'CO', reason: null };
  }

  return { ok: false, e164, country: 'OTHER', reason: 'country_not_allowed' };
}

/* ── Velocity circuit breaker ──────────────────────────────────────────
 * A pump attack is a burst: ten calls in forty seconds. Even to allowed
 * destinations, more calls or texts than a small business ever makes in an
 * hour means something is driving us, so the breaker trips and refuses the
 * rest until the window clears.
 *
 * IN MEMORY, PER INSTANCE — stated, not hidden. Two Render instances each get
 * the full budget. It is a brake on a runaway loop or a scripted pump, not an
 * accounting system; the fraud watch reads Twilio itself for the real picture.
 */
// Separate budgets: a visitor-triggered demo text must never be able to use up
// the budget that carries a paying owner's alerts or a live transfer.
const windows = { call: [], sms: [], demo_sms: [] };
const perDest = new Map();   // `${kind}|${e164}` -> [timestamps]
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function cap(name, dflt) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
}
function limits() {
  return {
    call_per_hour: cap('LITE_MAX_TRANSFERS_PER_HOUR', 20),
    sms_per_hour: cap('LITE_MAX_SMS_PER_HOUR', 60),
    demo_sms_per_hour: cap('LITE_MAX_DEMO_SMS_PER_HOUR', 30),
    per_destination_per_day: cap('LITE_MAX_PER_DESTINATION_PER_DAY', 10),
  };
}

// Kill switch: set by the fraud watch (auto-lock) or LITE_OUTBOUND_LOCK=1.
let locked = null;   // { at, reason }
function lock(reason) { if (!locked) locked = { at: new Date().toISOString(), reason: String(reason || 'locked') }; }
function unlock() { locked = null; }
function lockState() {
  if (process.env.LITE_OUTBOUND_LOCK === '1') return { at: null, reason: 'LITE_OUTBOUND_LOCK=1' };
  return locked;
}

const blocked = [];   // recent refusals, for the security report (no full numbers)
function recordBlock(kind, check, reason) {
  blocked.unshift({ at: new Date().toISOString(), kind, reason, country: check && check.country, masked: mask(check && check.e164) });
  if (blocked.length > 100) blocked.length = 100;
}
function mask(e164) { return e164 ? e164.slice(0, 4) + '***' + e164.slice(-2) : null; }

/**
 * The gate. `kind` is 'call' or 'sms'. Returns { ok, e164, reason }. On a
 * refusal nothing is sent and the refusal is recorded.
 */
function bucketCap(k, L) { return k === 'call' ? L.call_per_hour : k === 'demo_sms' ? L.demo_sms_per_hour : L.sms_per_hour; }
function kindOf(kind) { return kind === 'call' ? 'call' : kind === 'demo_sms' ? 'demo_sms' : 'sms'; }

/**
 * Would authorize() let this through right now? Same rules, consumes nothing.
 * Used before promising a caller a transfer, so a refusal becomes "I'll take a
 * message" instead of an announced transfer followed by silence.
 */
function canSend(kind, raw, opts) {
  const k = kindOf(kind);
  if (lockState()) return { ok: false, reason: 'outbound_locked' };
  const check = checkDestination(raw, opts);
  if (!check.ok) return { ok: false, reason: check.reason };
  const now = Date.now(); const L = limits();
  if (windows[k].filter((t) => t > now - HOUR).length >= bucketCap(k, L)) return { ok: false, reason: 'rate_limited' };
  if ((perDest.get(`${k}|${check.e164}`) || []).filter((t) => t > now - DAY).length >= L.per_destination_per_day) return { ok: false, reason: 'destination_rate_limited' };
  return { ok: true, reason: null };
}

function authorize(kind, raw, opts) {
  const k = kindOf(kind);
  const lockNow = lockState();
  const check = checkDestination(raw, opts);
  if (lockNow) { recordBlock(k, check, 'outbound_locked'); return { ok: false, e164: check.e164, reason: 'outbound_locked' }; }
  if (!check.ok) { recordBlock(k, check, check.reason); return { ok: false, e164: check.e164, reason: check.reason }; }

  const now = Date.now();
  const L = limits();
  const w = windows[k];
  while (w.length && w[0] < now - HOUR) w.shift();
  if (w.length >= bucketCap(k, L)) {
    recordBlock(k, check, 'rate_limited');
    return { ok: false, e164: check.e164, reason: 'rate_limited' };
  }
  const key = `${k}|${check.e164}`;
  const d = (perDest.get(key) || []).filter((t) => t > now - DAY);
  if (d.length >= L.per_destination_per_day) {
    recordBlock(k, check, 'destination_rate_limited');
    return { ok: false, e164: check.e164, reason: 'destination_rate_limited' };
  }
  w.push(now); d.push(now); perDest.set(key, d);
  return { ok: true, e164: check.e164, reason: null };
}

function status() {
  return {
    allowed_countries: allowedCountries(),
    limits: limits(),
    outbound_locked: lockState(),
    sent_last_hour: { call: windows.call.length, sms: windows.sms.length, demo_sms: windows.demo_sms.length },
    note: 'Budgets and the lock are per instance and in memory: an unlock reaches one instance, and a restart clears a lock.',
    recent_blocks: blocked.slice(0, 20),
  };
}

// Test hook: reset in-memory state between SIT cases.
function _reset() { windows.call.length = 0; windows.sms.length = 0; windows.demo_sms.length = 0; perDest.clear(); blocked.length = 0; locked = null; }

module.exports = { checkDestination, normalize, authorize, canSend, status, lock, unlock, lockState, mask, _reset, CARIBBEAN, CANADA };
