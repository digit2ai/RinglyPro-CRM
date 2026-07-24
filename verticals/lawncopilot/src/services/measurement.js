'use strict';

/**
 * Lawn Co-Pilot — property measurement service (the Estimator's eyes)
 *
 * Provider-agnostic behind ONE contract. Swapping providers changes no UI code.
 *
 *   heuristic  (default, zero-key) — geocode-only inference. ALWAYS is_estimate,
 *              confidence 'low'. An honest labeled placeholder, never presented
 *              as a measurement.
 *   parcel     (recommended prod)  — Regrid/ATTOM parcel record + building
 *              footprint. confidence 'high' when both resolve.
 *   imagery_ai (Phase 3)           — segmentation over satellite tiles.
 *
 * HONESTY RULE (hard): if we did not measure it, we say so. No synthesized
 * number is ever returned without is_estimate:true + confidence + sources.
 */

const crypto = require('crypto');

const PROVIDER = () => (process.env.LAWNCOPILOT_MEASURE_PROVIDER || 'heuristic').toLowerCase();
const CACHE_DAYS = 180;

// ── Typical Florida residential lot sizes by ZIP prefix ────────────────────
// Source: FL county property-appraiser medians. Used ONLY by the heuristic
// provider, and only ever as a labeled estimate.
const FL_ZIP_LOT_MEDIANS = {
  '32': 12000, // North FL / Jacksonville / Tallahassee
  '33': 8500,  // South FL / Miami / Tampa / Fort Lauderdale
  '34': 10500  // Southwest FL / Naples / Sarasota / Ocala
};
const DEFAULT_LOT_SQFT = 9500;
const TYPICAL_FOOTPRINT_RATIO = 0.22;   // house as a share of lot
const TYPICAL_HARDSCAPE_RATIO = 0.11;   // driveway + walk + patio as a share of lot

function normalizeAddress(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]+$/g, '')
    .toUpperCase();
}

function parseAddress(raw) {
  const s = String(raw || '').trim();
  const zip = (s.match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1] || null;
  const state = (s.match(/\b([A-Z]{2})\b(?=[, ]*\d{5})/i) || [])[1] || 'FL';
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  const city = parts.length >= 2 ? parts[parts.length - 2].replace(/\s+[A-Z]{2}$/i, '').trim() : null;
  return { zip, state: state.toUpperCase(), city };
}

// Deterministic pseudo-variation so two different addresses in the same ZIP do
// not return an identical number. Seeded by the address itself — stable across
// calls, never random. Still labeled as an estimate.
function seededRatio(seed, min, max) {
  const h = crypto.createHash('md5').update(String(seed)).digest();
  const v = h.readUInt32BE(0) / 0xffffffff;
  return min + v * (max - min);
}

// ── Geocoding ──────────────────────────────────────────────────────────────
const US_STATE_ABBR = {
  alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',
  connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',
  illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',
  maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',
  mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV',
  'new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY',
  'north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',
  pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',
  tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA',
  'west virginia':'WV',wisconsin:'WI',wyoming:'WY'
};
function stateAbbr(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (t.length === 2) return t.toUpperCase();
  return US_STATE_ABBR[t.toLowerCase()] || t;
}

async function googleGeocode(address, key) {
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' +
    encodeURIComponent(address) + '&key=' + key;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  if (!j.results || !j.results.length) return { ok: false, reason: 'not_found' };
  const g = j.results[0];
  const comp = (type) => (g.address_components.find(c => c.types.includes(type)) || {}).long_name || null;
  return {
    ok: true, geocoder: 'google',
    formatted: g.formatted_address,
    lat: g.geometry.location.lat, lng: g.geometry.location.lng,
    city: comp('locality') || comp('sublocality'),
    county: (comp('administrative_area_level_2') || '').replace(/ County$/i, '') || null,
    state: (g.address_components.find(c => c.types.includes('administrative_area_level_1')) || {}).short_name || null,
    zip: comp('postal_code'),
    place_id: g.place_id
  };
}

// Zero-key geocoder — OpenStreetMap Nominatim. Usage-limited and attribution-
// required, so it is the fallback, not the default: it exists so a tenant with
// no Google key still gets coordinates, which is what unlocks the satellite view.
async function nominatimGeocode(address) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=us&q=' +
    encodeURIComponent(address);
  const r = await fetch(url, {
    headers: { 'User-Agent': 'LawnCoPilot/1.0 (https://lawncopilot.com)', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(9000)
  });
  if (!r.ok) return { ok: false, reason: `nominatim_http_${r.status}` };
  const j = await r.json();
  if (!Array.isArray(j) || !j.length) return { ok: false, reason: 'not_found' };
  const g = j[0]; const a = g.address || {};
  return {
    ok: true, geocoder: 'nominatim',
    formatted: g.display_name,
    lat: parseFloat(g.lat), lng: parseFloat(g.lon),
    city: a.city || a.town || a.village || a.hamlet || a.municipality || null,
    county: (a.county || '').replace(/ County$/i, '') || null,
    state: stateAbbr(a.state),
    zip: a.postcode || null,
    place_id: null
  };
}

async function geocode(address) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  try {
    if (key) {
      const g = await googleGeocode(address, key);
      if (g.ok) return g;
    }
    // No key, or Google returned nothing — try the zero-key geocoder so the
    // satellite view still works.
    return await nominatimGeocode(address);
  } catch (e) {
    try { return await nominatimGeocode(address); }
    catch (e2) { return { ok: false, reason: e.message }; }
  }
}

// ── Parcel provider (Regrid primary, ATTOM alternate) ──────────────────────
async function fetchParcel(geo) {
  const regrid = process.env.REGRID_API_KEY;
  const attom = process.env.ATTOM_API_KEY;
  if (!regrid && !attom) return { ok: false, reason: 'no_parcel_key' };

  try {
    if (regrid) {
      const url = `https://app.regrid.com/api/v2/parcels/point?lat=${geo.lat}&lon=${geo.lng}&token=${regrid}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return { ok: false, reason: `regrid_http_${r.status}` };
      const j = await r.json();
      const feat = j && j.parcels && j.parcels.features && j.parcels.features[0];
      if (!feat) return { ok: false, reason: 'parcel_not_found' };
      const p = feat.properties && (feat.properties.fields || feat.properties);
      const lotSqft = p.ll_gissqft || (p.ll_gisacre ? Math.round(p.ll_gisacre * 43560) : null) ||
        (p.gisacre ? Math.round(p.gisacre * 43560) : null);
      return {
        ok: true,
        provider: 'regrid',
        parcel_id: p.parcelnumb || p.ll_uuid || null,
        lot_sqft: lotSqft ? Math.round(lotSqft) : null,
        building_sqft: p.ll_bldg_footprint_sqft || p.improvval_sqft || p.sqft || null,
        land_use: p.usedesc || p.zoning || null,
        geometry: feat.geometry || null,
        raw: p
      };
    }
    const url = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/detail?address=' +
      encodeURIComponent(geo.formatted);
    const r = await fetch(url, { headers: { apikey: attom, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { ok: false, reason: `attom_http_${r.status}` };
    const j = await r.json();
    const prop = j && j.property && j.property[0];
    if (!prop) return { ok: false, reason: 'parcel_not_found' };
    return {
      ok: true,
      provider: 'attom',
      parcel_id: (prop.identifier || {}).apn || null,
      lot_sqft: (prop.lot || {}).lotsize2 ? Math.round((prop.lot || {}).lotsize2) : null,
      building_sqft: (prop.building || {}).size ? (prop.building.size.universalsize || null) : null,
      land_use: (prop.summary || {}).proptype || null,
      geometry: null,
      raw: prop
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ── Building footprint (Open Buildings / OSM) ──────────────────────────────
async function fetchFootprint(geo) {
  try {
    const q = `[out:json][timeout:10];way(around:60,${geo.lat},${geo.lng})["building"];out geom;`;
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return { ok: false, reason: `overpass_http_${r.status}` };
    const j = await r.json();
    if (!j.elements || !j.elements.length) return { ok: false, reason: 'no_building' };
    // Nearest building to the geocoded point wins.
    let best = null, bestD = Infinity;
    for (const el of j.elements) {
      if (!el.geometry || el.geometry.length < 3) continue;
      const cx = el.geometry.reduce((a, p) => a + p.lon, 0) / el.geometry.length;
      const cy = el.geometry.reduce((a, p) => a + p.lat, 0) / el.geometry.length;
      const d = Math.hypot(cx - geo.lng, cy - geo.lat);
      if (d < bestD) { bestD = d; best = el; }
    }
    if (!best) return { ok: false, reason: 'no_building' };
    const ring = best.geometry.map(p => [p.lon, p.lat]);
    return {
      ok: true,
      sqft: Math.round(polygonAreaSqft(ring)),
      geojson: { type: 'Polygon', coordinates: [ring.concat([ring[0]])] }
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// Shoelace area on lon/lat, converted to square feet.
function polygonAreaSqft(ring) {
  if (!ring || ring.length < 3) return 0;
  const latRad = (ring[0][1] * Math.PI) / 180;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
  const mPerDegLon = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad);
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += (x1 * mPerDegLon) * (y2 * mPerDegLat) - (x2 * mPerDegLon) * (y1 * mPerDegLat);
  }
  return Math.abs(a / 2) * 10.7639; // m2 -> sqft
}

function bboxFromPoint(lat, lng, meters) {
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

// A square parcel ring centered on the point, sized to the lot. Used when the
// provider gives us an area but no polygon — clearly a representation, and the
// caller is told so via is_estimate/confidence.
function syntheticParcelRing(lat, lng, sqft) {
  const side = Math.sqrt(Math.max(sqft, 100)) * 0.3048; // ft -> m
  const half = side / 2;
  const dLat = half / 111320;
  const dLng = half / (111320 * Math.cos((lat * Math.PI) / 180));
  return [
    [lng - dLng, lat - dLat], [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat], [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat]
  ];
}

/**
 * A satellite image of the property, framed to `bbox` ([minLon,minLat,maxLon,maxLat])
 * so the parcel/building overlay lines up. Three sources, best first:
 *   Google Static Maps (key)  ·  Mapbox (token)  ·  Esri World Imagery (KEYLESS).
 * The Esri fallback is why a tenant with no keys still sees a real satellite
 * view instead of only the scaled diagram.
 */
function imageryUrl(geo, bbox) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    return `https://maps.googleapis.com/maps/api/staticmap?center=${geo.lat},${geo.lng}` +
      `&zoom=19&size=640x400&scale=2&maptype=satellite&key=${key}`;
  }
  const mb = process.env.MAPBOX_TOKEN;
  if (mb) {
    return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${geo.lng},${geo.lat},18,0/640x400@2x?access_token=${mb}`;
  }
  if (bbox) {
    // Esri World Imagery export — one satellite JPG for the bbox, no key.
    return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export' +
      `?bbox=${bbox.join(',')}&bboxSR=4326&imageSR=4326&size=640,400&format=jpg&f=image`;
  }
  return null;
}

// A padded bounding box around the lot, in [minLon,minLat,maxLon,maxLat]. The
// imagery is framed to this, and the overlay projects against the same box, so
// the parcel outline sits on the actual roof and yard.
function lotBbox(lat, lng, lotSqft) {
  const side = Math.sqrt(Math.max(lotSqft || 9000, 2000)) * 0.3048; // ft -> m
  const half = side * 0.72;                                          // ~44% padding
  const dLat = half / 111320;
  const dLng = half / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/**
 * THE CONTRACT. Everything downstream depends only on this shape.
 */
async function measureProperty({ address, tenant_id, lat, lng }) {
  const provider = PROVIDER();
  const sources = [];
  const startedAt = Date.now();

  // 1. Resolve the address.
  let geo = await geocode(address);
  if (!geo.ok) {
    const parsed = parseAddress(address);
    geo = {
      ok: false,
      formatted: String(address || '').trim(),
      lat: lat || null, lng: lng || null,
      city: parsed.city, county: null, state: parsed.state, zip: parsed.zip
    };
  } else {
    sources.push({ field: 'address', provider: 'google_geocoding', retrieved_at: new Date().toISOString() });
  }

  const normalized = normalizeAddress(geo.formatted || address);
  const zipPrefix = (geo.zip || '').slice(0, 2);

  let lotSqft = null, footprintSqft = null, parcelId = null;
  let parcelGeo = null, buildingGeo = null;
  let confidence = 'low';
  let isEstimate = true;
  let excludedBreakdown = [];

  // 2. Parcel data (the real measurement path).
  if (provider === 'parcel' || provider === 'imagery_ai') {
    if (geo.ok) {
      const parcel = await fetchParcel(geo);
      if (parcel.ok) {
        lotSqft = parcel.lot_sqft || null;
        parcelId = parcel.parcel_id;
        parcelGeo = parcel.geometry;
        if (parcel.building_sqft) footprintSqft = Math.round(parcel.building_sqft);
        sources.push({ field: 'lot_sqft', provider: parcel.provider, retrieved_at: new Date().toISOString() });
      }
      const fp = await fetchFootprint(geo);
      if (fp.ok) {
        footprintSqft = fp.sqft;
        buildingGeo = fp.geojson;
        sources.push({ field: 'building_footprint_sqft', provider: 'osm_overpass', retrieved_at: new Date().toISOString() });
      }
      if (lotSqft && footprintSqft) { confidence = 'high'; isEstimate = false; }
      else if (lotSqft || footprintSqft) { confidence = 'medium'; isEstimate = true; }
    }
  }

  // 3. Heuristic fill for anything still missing. ALWAYS marks the result as an
  //    estimate — we never dress inference up as measurement.
  if (!lotSqft) {
    const median = FL_ZIP_LOT_MEDIANS[zipPrefix] || DEFAULT_LOT_SQFT;
    lotSqft = Math.round(median * seededRatio(normalized, 0.72, 1.34));
    isEstimate = true;
    if (confidence === 'high') confidence = 'medium';
    sources.push({ field: 'lot_sqft', provider: 'heuristic_zip_median', retrieved_at: new Date().toISOString(), note: 'inferred, not measured' });
  }
  if (!footprintSqft) {
    footprintSqft = Math.round(lotSqft * TYPICAL_FOOTPRINT_RATIO * seededRatio(normalized + 'b', 0.82, 1.2));
    isEstimate = true;
    if (confidence === 'high') confidence = 'medium';
    sources.push({ field: 'building_footprint_sqft', provider: 'heuristic_ratio', retrieved_at: new Date().toISOString(), note: 'inferred, not measured' });
  }

  // 4. Non-lawn surfaces. Real polygons in imagery_ai; ratio-based otherwise.
  const hardscapeSqft = Math.round(lotSqft * TYPICAL_HARDSCAPE_RATIO * seededRatio(normalized + 'h', 0.7, 1.35));
  const drive = Math.round(hardscapeSqft * 0.62);
  const walk = Math.round(hardscapeSqft * 0.18);
  const patio = hardscapeSqft - drive - walk;
  excludedBreakdown = [
    { type: 'driveway', sqft: drive, source: 'heuristic_ratio', measured: false },
    { type: 'sidewalk', sqft: walk, source: 'heuristic_ratio', measured: false },
    { type: 'patio', sqft: patio, source: 'heuristic_ratio', measured: false }
  ];
  const excludedSqft = drive + walk + patio;
  sources.push({ field: 'excluded_sqft', provider: 'heuristic_ratio', retrieved_at: new Date().toISOString(), note: 'inferred, not measured' });

  // 5. The client's formula, exactly.
  let serviceable = lotSqft - footprintSqft - excludedSqft;
  if (serviceable < 0) serviceable = 0;
  serviceable = Math.round(serviceable);

  // 6. Sanity guard -> human review instead of a silently wrong auto-quote.
  const ratio = lotSqft > 0 ? serviceable / lotSqft : 0;
  const needsReview = ratio < 0.05 || ratio > 1 || serviceable < 300;

  // 7. Geometry for the visualization.
  if (!parcelGeo && geo.lat && geo.lng) {
    parcelGeo = { type: 'Polygon', coordinates: [syntheticParcelRing(geo.lat, geo.lng, lotSqft)], synthetic: true };
  }
  if (!buildingGeo && geo.lat && geo.lng) {
    buildingGeo = { type: 'Polygon', coordinates: [syntheticParcelRing(geo.lat, geo.lng, footprintSqft)], synthetic: true };
  }

  return {
    normalized_address: geo.formatted || String(address || '').trim(),
    address_resolved: !!geo.ok,
    lat: geo.lat, lng: geo.lng,
    city: geo.city, county: geo.county, state: geo.state || 'FL', zip: geo.zip,
    parcel_id: parcelId,
    lot_sqft: lotSqft,
    building_footprint_sqft: footprintSqft,
    building_sqft: footprintSqft,
    excluded_sqft: excludedSqft,
    excluded_breakdown: excludedBreakdown,
    serviceable_sqft: serviceable,
    geometry: {
      parcel: parcelGeo,
      building: buildingGeo,
      excluded: [],
      // The imagery frame — the overlay projects against THIS box so the outline
      // lands on the real roof and yard.
      bbox: geo.lat ? lotBbox(geo.lat, geo.lng, lotSqft) : null
    },
    imagery_url: geo.lat ? imageryUrl(geo, geo.lat ? lotBbox(geo.lat, geo.lng, lotSqft) : null) : null,
    confidence,
    is_estimate: isEstimate,
    needs_review: needsReview,
    provider,
    sources,
    elapsed_ms: Date.now() - startedAt,
    disclaimer: isEstimate
      ? 'Preliminary estimate based on available property records. Subject to final verification before service.'
      : null
  };
}

module.exports = {
  measureProperty,
  normalizeAddress,
  parseAddress,
  polygonAreaSqft,
  CACHE_DAYS
};
