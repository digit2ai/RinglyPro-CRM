'use strict';

// =============================================================
// Phone normalisation.
//
// We STORE E.164 (+13055551234) because that is what Twilio and every other
// carrier API expects. We do not make a person type it. Almost nobody in the
// US knows their country code, and "must be in E.164 format" is a wall in
// front of an optional field.
//
// So: accept what people actually type, coerce it, and only complain when the
// input genuinely cannot be resolved to one number.
// =============================================================

// A leading + means the caller has already declared a country. Trust it.
const E164 = /^\+[1-9]\d{6,14}$/;

// Default country for a bare national number. US/Canada share +1 (NANP).
const DEFAULT_CC = process.env.JOBUP_DEFAULT_COUNTRY_CODE || '1';

/**
 * Normalise a typed phone number to E.164.
 *
 * Returns { ok, e164, formatted, reason }.
 *   ok:false with a reason the person can act on — never a silent drop, and
 *   never a guess when the digits could belong to more than one country.
 *
 * Handled, all resolving to +13055551234:
 *   (305) 555-1234 · 305-555-1234 · 305.555.1234 · 3055551234
 *   1 305 555 1234 · 13055551234 · +1 (305) 555-1234 · tel:+13055551234
 */
function normalize(input, { defaultCountry = DEFAULT_CC } = {}) {
  if (input === undefined || input === null) return { ok: true, e164: null };
  let raw = String(input).trim();
  if (!raw) return { ok: true, e164: null };

  // Strip anything that is decoration: tel: prefix, spaces, punctuation.
  raw = raw.replace(/^tel:/i, '').trim();
  // 00 is the international prefix in much of the world; it means the same as +.
  if (/^00\d/.test(raw)) raw = '+' + raw.slice(2);

  const hadPlus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g, '');

  if (!digits) {
    return { ok: false, reason: 'That does not look like a phone number.' };
  }

  // ---- Already international -------------------------------------------
  if (hadPlus) {
    const e164 = '+' + digits;
    if (!E164.test(e164)) {
      return { ok: false, reason: 'That international number does not look complete.' };
    }
    return { ok: true, e164, formatted: format(e164) };
  }

  // ---- Bare national number --------------------------------------------
  if (defaultCountry === '1') {
    // 10 digits = a NANP number without the country code.
    if (digits.length === 10) {
      if (digits[0] === '0' || digits[0] === '1') {
        return { ok: false, reason: 'A US number cannot start with 0 or 1. Check the area code.' };
      }
      return finish('1' + digits);
    }
    // 11 digits beginning with 1 = the country code was typed without the +.
    if (digits.length === 11 && digits[0] === '1') return finish(digits);

    if (digits.length < 10) {
      return { ok: false, reason: `That is ${digits.length} digit${digits.length === 1 ? '' : 's'} — a US number needs 10.` };
    }
    // Longer than 11, or 11 not starting with 1: could be any country. Do not
    // guess — an assumed country code silently sends texts to a stranger.
    return { ok: false, reason: 'For a number outside the US, start with + and the country code, e.g. +44 20 7946 0958.' };
  }

  return finish(defaultCountry + digits);

  function finish(all) {
    const e164 = '+' + all;
    if (!E164.test(e164)) return { ok: false, reason: 'That does not look like a complete number.' };
    return { ok: true, e164, formatted: format(e164) };
  }
}

/** Human-readable rendering. US numbers get the familiar shape. */
function format(e164) {
  if (!e164) return '';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

/** Progressive formatting while someone types, for US-shaped input. */
function formatAsYouType(input) {
  const raw = String(input || '');
  if (raw.trim().startsWith('+')) return raw;           // international: leave alone
  const d = raw.replace(/\D/g, '').replace(/^1(?=\d)/, '');
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}

module.exports = { normalize, format, formatAsYouType, E164, DEFAULT_CC };
