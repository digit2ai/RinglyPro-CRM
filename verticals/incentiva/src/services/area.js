'use strict';

/**
 * Resolve what a buyer typed ("33578", "Riverview", "Wesley Chapel") to a ZIP,
 * city, county and state. Keyless: Zippopotam.us for ZIP -> city/state, and
 * OpenStreetMap Nominatim for the county and for place names. Cached per tenant.
 *
 * Outcomes, never a guess:
 *  - { ok:true, resolved:true, ... }        the lookup confirmed it
 *  - { ok:false, reason:'invalid_zip' }     a 5-digit value that is not a real ZIP
 *  - { ok:false, reason:'outside_florida' } a real place outside the market's state
 *  - { ok:false, reason:'not_found' }       a place name nobody recognised
 *  - { ok:true, resolved:false, ... }       the lookup service was unreachable: a
 *    well-formed ZIP may continue, labelled unconfirmed, rather than blocking the buyer
 * INCENTIVA_GEOCODE=off skips the network (SIT); _setResolver injects a fake.
 */

const db = require('../db');

const UA = 'BuyersLine/1.0 (new-home buyer platform; contact info@digit2ai.com)';
let resolver = null;

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal });
    if (r.status === 404) return { notFound: true };
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return { data: await r.json() };
  } finally { clearTimeout(timer); }
}

function cleanCounty(c) { return c ? String(c).replace(/\s+County$/i, '').trim() : null; }

async function networkResolve(input) {
  const zip = /^\d{5}$/.test(input) ? input : null;
  if (zip) {
    const z = await getJson('https://api.zippopotam.us/us/' + zip);
    if (z.notFound) return { ok: false, reason: 'invalid_zip' };
    const place = z.data && z.data.places && z.data.places[0];
    if (!place) return { ok: false, reason: 'invalid_zip' };
    if (place['state abbreviation'] !== 'FL') return { ok: false, reason: 'outside_florida', city: place['place name'], state: place['state abbreviation'] };
    let county = null;
    try {
      const n = await getJson('https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=us&postalcode=' + zip);
      const a = n.data && n.data[0] && n.data[0].address;
      county = a ? cleanCounty(a.county) : null;
    } catch (e) { county = null; }
    return { ok: true, resolved: true, zip, city: place['place name'], county, state: 'FL', label: `${place['place name']}, FL ${zip}` };
  }
  const n = await getJson('https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=us&q=' + encodeURIComponent(input + ', Florida'));
  const hit = n.data && n.data[0];
  if (!hit || !hit.address) return { ok: false, reason: 'not_found' };
  const a = hit.address;
  if (a.state && !/florida/i.test(a.state)) return { ok: false, reason: 'outside_florida' };
  const city = a.city || a.town || a.village || a.hamlet || a.suburb || a.neighbourhood || hit.name || null;
  const zipOut = a.postcode && /^\d{5}/.test(a.postcode) ? a.postcode.slice(0, 5) : null;
  return { ok: true, resolved: true, zip: zipOut, city, county: cleanCounty(a.county), state: 'FL', label: [city, 'FL'].filter(Boolean).join(', ') + (zipOut ? ' ' + zipOut : '') };
}

async function resolveArea(tenantId, raw) {
  const input = String(raw || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!input || input.length < 2) return { ok: false, reason: 'empty' };
  const digits = input.replace(/\s/g, '');
  if (/^\d+$/.test(digits) && !/^\d{5}$/.test(digits)) return { ok: false, reason: 'invalid_zip' };
  const query = (/^\d{5}$/.test(digits) ? digits : input).toLowerCase();

  if (resolver) return Object.assign({ input }, await resolver(query));
  if (process.env.INCENTIVA_GEOCODE === 'off') {
    return /^\d{5}$/.test(query)
      ? { ok: true, resolved: false, input, zip: query, city: null, county: null, state: 'FL', label: query }
      : { ok: true, resolved: false, input, zip: null, city: null, county: null, state: 'FL', label: input };
  }

  const cached = await db.one('SELECT result FROM nca_area_cache WHERE tenant_id = :t AND query = :q', { t: tenantId, q: query });
  if (cached && cached.result) return Object.assign({ input }, cached.result);
  let out;
  try { out = await networkResolve(query); }
  catch (e) {
    // Service down: a well-formed ZIP continues unconfirmed; a place name cannot be checked, so it also continues, labelled.
    return /^\d{5}$/.test(query)
      ? { ok: true, resolved: false, input, zip: query, city: null, county: null, state: 'FL', label: query }
      : { ok: true, resolved: false, input, zip: null, city: null, county: null, state: 'FL', label: input };
  }
  await db.exec(`INSERT INTO nca_area_cache (tenant_id, query, result) VALUES (:t, :q, :r)
    ON CONFLICT (tenant_id, query) DO UPDATE SET result = EXCLUDED.result, fetched_at = now()`, { t: tenantId, q: query, r: JSON.stringify(out) });
  return Object.assign({ input }, out);
}

function _setResolver(fn) { resolver = fn; }

module.exports = { resolveArea, _setResolver };
