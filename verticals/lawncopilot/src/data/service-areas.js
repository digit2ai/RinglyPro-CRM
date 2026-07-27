'use strict';

/**
 * Lawn Co-Pilot — service-area (geo) data source.
 *
 * THE SINGLE FILE TO EXTEND, county by county. Phase 3 renders a geo landing
 * page for every entry here, and Phase 1's sitemap + hub link them.
 *
 * HARD RULE (Phase 3): a page is generated ONLY when the entry carries genuine,
 * differentiated local content — real rate-card ranges for that county, the
 * grass types common to that region, a seasonal service calendar for its
 * climate zone, and the number of landscaping companies in the area. Thin
 * pages where only the city name changes will not rank and can get the whole
 * site ignored. If you do not have real data for an area, DO NOT add it here.
 *
 * Shape of a complete, publishable entry:
 * {
 *   slug: 'orange-county-fl',              // URL: /lawn-care/orange-county-fl
 *   county: 'Orange County',
 *   state: 'FL',
 *   cities: ['Orlando', 'Winter Park', 'Maitland'],
 *   climate_zone: 'USDA 9b',
 *   // REAL local rate ranges (per visit, by lot size) — cite the source below.
 *   rate_ranges: { small: [35, 45], medium: [45, 65], large: [65, 95] },
 *   grass_types: ['St. Augustine', 'Bahia', 'Zoysia'],
 *   season: [ { months: 'Apr-Sep', cadence: 'Weekly', note: 'Peak growth' },
 *             { months: 'Oct-Mar', cadence: 'Biweekly', note: 'Slow season' } ],
 *   competitor_count: 380,                 // # of landscaping businesses in the area
 *   source: 'FL county appraiser / BLS QCEW / operator survey',   // REQUIRED
 *   published: true                        // false = keep out of geo pages + sitemap
 * }
 *
 * Empty by design until Phase 3 supplies verified county data. Nothing is
 * fabricated here.
 */

const SERVICE_AREAS = [
  // Add verified county entries here. See the shape above.
];

/** Only entries with real content AND published:true become live geo pages. */
function publishedAreas() {
  return SERVICE_AREAS.filter(a =>
    a && a.published === true && a.slug && a.county &&
    a.rate_ranges && Array.isArray(a.grass_types) && a.grass_types.length &&
    Array.isArray(a.season) && a.season.length && a.source
  );
}

function areaBySlug(slug) {
  return publishedAreas().find(a => a.slug === String(slug || '').toLowerCase()) || null;
}

module.exports = { SERVICE_AREAS, publishedAreas, areaBySlug };
