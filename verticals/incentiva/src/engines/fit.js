'use strict';

/**
 * Fit score. Arithmetic a person can defend, not a model's opinion.
 *
 * ONLY property and criteria fields enter the score. Language, name, contact
 * details and anything about who the buyer is never reach this file (fair
 * housing). Incentives do NOT add to fit: otherwise the biggest incentive wins
 * the ranking, and that is the builder's pitch, not advice.
 *
 * Weights: price 30, location 20, beds/baths 15, timeline 15, must-haves 15, monthly 5.
 */

const { t, money } = require('./i18n');

const TIMELINE_MONTHS = { '0_3m': 3, '3_6m': 6, '6_12m': 12, '12m_plus': 999 };

function haversineMiles(a, b) {
  const R = 3958.8;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function monthsUntil(estCompletion, now = new Date()) {
  if (!estCompletion) return null;
  if (/^ready$/i.test(estCompletion)) return 0;
  const m = String(estCompletion).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return (Number(m[1]) - now.getUTCFullYear()) * 12 + (Number(m[2]) - (now.getUTCMonth() + 1));
}

/** Location check used by matching AND scoring, so they cannot disagree. */
function locationStatus(community, criteria, center) {
  const zips = (criteria.target_zips || []).map(String);
  if (community.zip && zips.includes(String(community.zip))) return { status: 'zip_match', miles: 0 };
  if (center && community.lat != null && community.lng != null) {
    const miles = haversineMiles(center, { lat: Number(community.lat), lng: Number(community.lng) });
    const radius = Number(criteria.radius_miles || 15);
    return { status: miles <= radius ? 'within_radius' : 'outside_area', miles: Math.round(miles) };
  }
  return { status: zips.length ? 'outside_area' : 'unknown', miles: null };
}

/**
 * @param item { community, home|null, fees[], monthly_estimate|null }
 * @param criteria buyer criteria
 * @param opts { center, lang, now }
 * Returns reasons/gaps as KEYS + params (language-free), and a render helper.
 */
function scoreFit(item, criteria, opts = {}) {
  const { community, home } = item;
  const reasons = [], gaps = [];
  let score = 0;
  const price = home ? Number(home.list_price) : (community.price_from != null ? Number(community.price_from) : null);
  const budget = Number(criteria.budget_max);

  if (price == null || !isFinite(price)) gaps.push({ key: 'price_unknown' });
  else if (price <= budget) { score += 30; reasons.push({ key: 'price_ok', price, budget }); }
  else gaps.push({ key: 'price_over', price, budget });

  const loc = locationStatus(community, criteria, opts.center);
  if (loc.status === 'zip_match') { score += 20; reasons.push({ key: 'zip_match', zip: community.zip }); }
  else if (loc.status === 'within_radius') { score += Math.max(8, 20 - Math.floor(loc.miles / 2)); reasons.push({ key: 'within_radius', miles: loc.miles }); }
  else if (loc.status === 'outside_area') gaps.push({ key: 'outside_area' });
  else gaps.push({ key: 'area_unknown' });

  if (home && home.beds != null) {
    const bedsOk = Number(home.beds) >= Number(criteria.beds_min || 0);
    const bathsOk = home.baths == null || Number(home.baths) >= Number(criteria.baths_min || 0);
    if (bedsOk && bathsOk) { score += 15; reasons.push({ key: 'beds_ok', beds: Number(home.beds), baths: home.baths != null ? Number(home.baths) : '?' }); }
    else gaps.push({ key: 'beds_short', beds: Number(home.beds), baths: home.baths != null ? Number(home.baths) : '?' });
  }

  const limit = TIMELINE_MONTHS[criteria.timeline] ?? 999;
  const mu = home ? monthsUntil(home.est_completion, opts.now) : null;
  if (mu === null) gaps.push({ key: 'timeline_tbb' });
  else if (mu <= limit) { score += 15; reasons.push({ key: 'timeline_ok', ready: home.est_completion }); }
  else gaps.push({ key: 'timeline_late', ready: home.est_completion });

  const musts = criteria.must_haves || [];
  if (musts.length) {
    let met = 0;
    const feat = (home && home.features) || [];
    for (const k of musts) {
      let st = 'unknown';
      if (k === 'age_restricted') st = community.age_restricted ? 'ok' : 'missing';
      else if (k === 'single_story') st = home && home.stories != null ? (Number(home.stories) === 1 ? 'ok' : 'missing') : 'unknown';
      else if (k === 'no_cdd') {
        const cdd = (item.fees || []).filter((f) => f.fee_type === 'cdd_om' || f.fee_type === 'cdd_debt');
        st = cdd.length && cdd.every((f) => f.amount_usd !== null && Number(f.amount_usd) === 0) ? 'ok'
          : (cdd.some((f) => f.amount_usd !== null && Number(f.amount_usd) > 0) ? 'missing' : 'unknown');
      } else if (k === 'move_in_90_days') st = mu === null ? 'unknown' : (mu <= 3 ? 'ok' : 'missing');
      else if (home) st = feat.includes(k) ? 'ok' : (feat.length ? 'missing' : 'unknown');
      if (st === 'ok') { met++; reasons.push({ key: 'must_ok', must: k }); }
      else if (st === 'missing') gaps.push({ key: 'must_missing', must: k });
      else gaps.push({ key: 'must_unknown', must: k });
    }
    score += Math.round(15 * met / musts.length);
  } else score += 15;

  if (criteria.budget_monthly_max && item.monthly_estimate != null) {
    if (item.monthly_estimate <= Number(criteria.budget_monthly_max)) { score += 5; reasons.push({ key: 'monthly_ok' }); }
    else gaps.push({ key: 'monthly_over' });
  } else if (!criteria.budget_monthly_max) score += 5;

  return { score: Math.min(100, score), reasons, gaps, location: loc };
}

function renderFitLine(lang, entry) {
  const p = Object.assign({}, entry);
  if (p.price != null) p.price = money(lang, p.price);
  if (p.budget != null) p.budget = money(lang, p.budget);
  if (p.must) p.label = t(lang, 'must_haves.' + p.must);
  if (p.ready && /^ready$/i.test(p.ready)) p.ready = t(lang, 'ready_now');
  return t(lang, 'fit.' + entry.key, p);
}

module.exports = { scoreFit, renderFitLine, locationStatus, haversineMiles, monthsUntil };
