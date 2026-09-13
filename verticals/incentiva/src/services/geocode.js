'use strict';

/**
 * Keyless geocoding of the buyer's target area (OpenStreetMap Nominatim),
 * cached per tenant. Used only to measure distance to communities. When it is
 * off or fails, matching falls back to exact ZIP matches and the report says a
 * location could not be compared rather than guessing.
 */

const db = require('../db');

async function geocode(tenantId, query) {
  const qn = String(query || '').trim().toLowerCase().slice(0, 190);
  if (!qn || process.env.INCENTIVA_GEOCODE === 'off') return null;
  const cached = await db.one('SELECT lat, lng FROM nca_geocode_cache WHERE tenant_id = :t AND query = :q', { t: tenantId, q: qn });
  if (cached) return cached.lat == null ? null : { lat: Number(cached.lat), lng: Number(cached.lng) };
  let result = null;
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(qn + ', Florida');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { headers: { 'User-Agent': 'Incentiva/1.0 (new-home buyer platform; contact info@digit2ai.com)' }, signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const arr = await r.json();
      if (arr && arr[0]) result = { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
    }
  } catch (e) { return null; } // do not cache transient failures
  await db.exec(`INSERT INTO nca_geocode_cache (tenant_id, query, lat, lng) VALUES (:t, :q, :lat, :lng) ON CONFLICT (tenant_id, query) DO NOTHING`,
    { t: tenantId, q: qn, lat: result ? result.lat : null, lng: result ? result.lng : null });
  return result;
}

module.exports = { geocode };
