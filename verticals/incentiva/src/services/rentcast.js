'use strict';

/**
 * New-construction listing search, backed by the RentCast API.
 *
 *   GET https://api.rentcast.io/v1/listings/sale   (header X-Api-Key)
 *
 * RentCast has no new-construction query parameter. We request Active listings
 * in a circle (up to 500 per request, which RentCast bills as ONE request) and
 * keep only listingType === 'New Construction'.
 *
 * Rules that must not regress:
 *  - The key never leaves the server. With RENTCAST_API_KEY unset the search
 *    says it is not connected; it never shows sample houses as if they were real.
 *  - One upstream request per area per TTL. Price and bedroom filters run on the
 *    cached set, so changing a filter costs nothing.
 *  - A monthly cap refuses new upstream requests before the plan is exceeded;
 *    a stale cached area is served and labelled stale rather than going blank.
 *  - Builder and listing-agent phone numbers and emails are DROPPED. A buyer who
 *    calls the sales office before being registered can lose free representation.
 *  - These are listings, not verified incentives. Nothing here touches incentives.
 */

const db = require('../db');
const { geocode } = require('./geocode');

const ENDPOINT = process.env.RENTCAST_BASE_URL || 'https://api.rentcast.io/v1/listings/sale';
const PROVIDER = 'rentcast';

function configured() { return !!process.env.RENTCAST_API_KEY; }
function ttlHours() { const n = Number(process.env.INCENTIVA_LISTINGS_TTL_HOURS); return isFinite(n) && n > 0 ? n : 24; }
function monthlyCap() { const n = Number(process.env.RENTCAST_MONTHLY_CAP); return isFinite(n) && n > 0 ? n : 45; }
function monthKey(d = new Date()) { return d.toISOString().slice(0, 7); }

function num(v) { return v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v); }
function str(v, n = 200) { return v === null || v === undefined ? null : String(v).slice(0, n); }
function httpUrl(v) { return typeof v === 'string' && /^https?:\/\//i.test(v) ? v.slice(0, 500) : null; }

/** Keep what a buyer needs; drop contact details and internal fields. */
function sanitizeListing(l) {
  const lat = num(l.latitude), lng = num(l.longitude);
  const b = l.builder && typeof l.builder === 'object' ? l.builder : null;
  return {
    id: str(l.id, 160),
    address: str(l.formattedAddress || l.addressLine1, 200),
    city: str(l.city, 80), state: str(l.state, 2), zip: str(l.zipCode, 10), county: str(l.county, 80),
    lat, lng,
    price: num(l.price), beds: num(l.bedrooms), baths: num(l.bathrooms), sqft: num(l.squareFootage),
    lot_sqft: num(l.lotSize), year_built: num(l.yearBuilt), property_type: str(l.propertyType, 40),
    hoa_monthly: l.hoa && num(l.hoa.fee) !== null ? num(l.hoa.fee) : null,
    days_on_market: num(l.daysOnMarket), listed_date: l.listedDate ? String(l.listedDate).slice(0, 10) : null,
    last_seen: l.lastSeenDate ? String(l.lastSeenDate).slice(0, 10) : null,
    builder: b ? { name: str(b.name, 120), community: str(b.development || b.community, 160), website: httpUrl(b.website) } : null,
    office: l.listingOffice && l.listingOffice.name ? str(l.listingOffice.name, 160) : null,
    mls_name: str(l.mlsName, 80), mls_number: str(l.mlsNumber, 40)
  };
}

function isNewConstruction(l) { return String(l.listingType || '').toLowerCase() === 'new construction'; }

async function usage(tenantId) {
  const r = await db.one('SELECT requests FROM nca_api_usage WHERE tenant_id = :t AND provider = :p AND month = :m', { t: tenantId, p: PROVIDER, m: monthKey() });
  return { month: monthKey(), requests: r ? r.requests : 0, cap: monthlyCap() };
}

/** Claim one upstream request under the cap, atomically. Returns false when the cap is reached. */
async function claimRequest(tenantId) {
  const rows = await db.exec(`INSERT INTO nca_api_usage (tenant_id, provider, month, requests) VALUES (:t, :p, :m, 1)
    ON CONFLICT (tenant_id, provider, month) DO UPDATE SET requests = nca_api_usage.requests + 1, updated_at = now()
    WHERE nca_api_usage.requests < :cap RETURNING requests`,
  { t: tenantId, p: PROVIDER, m: monthKey(), cap: monthlyCap() });
  return rows.length > 0;
}

async function fetchUpstream({ lat, lng, zip, radius }) {
  const url = new URL(ENDPOINT);
  if (lat !== null && lng !== null) { url.searchParams.set('latitude', String(lat)); url.searchParams.set('longitude', String(lng)); url.searchParams.set('radius', String(radius)); }
  else url.searchParams.set('zipCode', zip);
  url.searchParams.set('status', 'Active');
  url.searchParams.set('limit', '500');
  const resp = await fetch(url.href, { headers: { 'X-Api-Key': process.env.RENTCAST_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (resp.status === 401 || resp.status === 403) throw Object.assign(new Error('upstream_auth'), { code: 'upstream_auth' });
  if (resp.status === 404) return []; // RentCast answers 404 when an area has no listings
  if (resp.status === 429) throw Object.assign(new Error('upstream_rate_limited'), { code: 'upstream_rate_limited' });
  if (!resp.ok) throw Object.assign(new Error('upstream_' + resp.status), { code: 'upstream_error' });
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

function applyFilters(listings, f) {
  return listings.filter((l) =>
    (f.min_price === null || (l.price !== null && l.price >= f.min_price)) &&
    (f.max_price === null || (l.price !== null && l.price <= f.max_price)) &&
    (f.beds_min === null || (l.beds !== null && l.beds >= f.beds_min)) &&
    (f.baths_min === null || (l.baths !== null && l.baths >= f.baths_min)));
}

/**
 * @param q { zip, radius, min_price, max_price, beds_min, baths_min, sort }
 * @returns {{ configured, status, center, listings, total_new_construction, cached, stale, fetched_at, usage, message? }}
 */
async function search(tenantId, q, { allowGeocode = true } = {}) {
  if (!configured()) return { configured: false, status: 'not_configured', listings: [], total_new_construction: 0 };
  const zip = String(q.zip || '').trim();
  if (!/^\d{5}$/.test(zip)) return { configured: true, status: 'invalid', message: 'zip', listings: [], total_new_construction: 0 };
  const radius = [5, 10, 15, 25, 40].includes(Number(q.radius)) ? Number(q.radius) : 15;
  const filters = { min_price: num(q.min_price), max_price: num(q.max_price), beds_min: num(q.beds_min), baths_min: num(q.baths_min) };

  const center = allowGeocode ? await geocode(tenantId, zip) : null;
  const key = `zip:${zip}:r${radius}`;
  const cached = await db.one(`SELECT * FROM nca_listing_cache WHERE tenant_id = :t AND provider = :p AND cache_key = :k`, { t: tenantId, p: PROVIDER, k: key });
  const fresh = cached && (Date.now() - new Date(cached.fetched_at).getTime()) < ttlHours() * 3600e3;

  let listings, fetchedAt, stale = false, fromCache = true, note = null;
  if (fresh) {
    listings = cached.listings; fetchedAt = cached.fetched_at;
  } else if (!(await claimRequest(tenantId))) {
    if (cached) { listings = cached.listings; fetchedAt = cached.fetched_at; stale = true; note = 'monthly_cap_stale'; }
    else return { configured: true, status: 'cap_reached', listings: [], total_new_construction: 0, usage: await usage(tenantId) };
  } else {
    try {
      const raw = await fetchUpstream({ lat: center ? center.lat : null, lng: center ? center.lng : null, zip, radius });
      listings = raw.filter(isNewConstruction).map(sanitizeListing);
      fetchedAt = new Date().toISOString();
      fromCache = false;
      await db.exec(`INSERT INTO nca_listing_cache (tenant_id, provider, cache_key, center_lat, center_lng, radius_miles, listings, upstream_count, fetched_at)
        VALUES (:t, :p, :k, :lat, :lng, :r, :l, :n, now())
        ON CONFLICT (tenant_id, provider, cache_key) DO UPDATE SET listings = EXCLUDED.listings, upstream_count = EXCLUDED.upstream_count,
          center_lat = EXCLUDED.center_lat, center_lng = EXCLUDED.center_lng, fetched_at = now()`,
      { t: tenantId, p: PROVIDER, k: key, lat: center ? center.lat : null, lng: center ? center.lng : null, r: radius, l: JSON.stringify(listings), n: raw.length });
    } catch (e) {
      if (cached) { listings = cached.listings; fetchedAt = cached.fetched_at; stale = true; note = e.code || 'upstream_error'; }
      else return { configured: true, status: 'upstream_error', message: e.code || 'upstream_error', listings: [], total_new_construction: 0 };
    }
  }

  let out = applyFilters(listings, filters);
  const sort = ['price_asc', 'price_desc', 'newest'].includes(q.sort) ? q.sort : 'price_asc';
  out = out.slice().sort((a, b) => sort === 'newest' ? String(b.listed_date || '').localeCompare(String(a.listed_date || ''))
    : sort === 'price_desc' ? (b.price || 0) - (a.price || 0) : (a.price || Infinity) - (b.price || Infinity));

  const pts = out.filter((l) => l.lat !== null && l.lng !== null);
  const mapCenter = center || (pts.length ? { lat: pts.reduce((s, l) => s + l.lat, 0) / pts.length, lng: pts.reduce((s, l) => s + l.lng, 0) / pts.length } : null);
  return {
    configured: true, status: 'ok', center: mapCenter, radius: center ? radius : null, zip, area_mode: center ? 'radius' : 'zip_only',
    listings: out.slice(0, 300), shown: Math.min(out.length, 300), matching: out.length, total_new_construction: listings.length,
    cached: fromCache, stale, stale_reason: note, fetched_at: fetchedAt
  };
}

module.exports = { search, sanitizeListing, isNewConstruction, applyFilters, configured, usage, claimRequest, monthlyCap, ENDPOINT };
