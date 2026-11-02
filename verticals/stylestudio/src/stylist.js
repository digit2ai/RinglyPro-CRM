'use strict';
/**
 * The AI stylist's judgment, as RULES. Every score here is computed from the
 * garment colours, the pattern and the trouser type, so the same outfit always
 * gets the same score and every point can be explained. Scores are subjective
 * styling guidance, not measurements, and every surface says so.
 *
 * A model may later re-word the explanation (llm.js), never the scores: a
 * rewrite that adds a number is discarded.
 */

const OCCASIONS = [
  { key: 'business_casual', label: 'Business casual' },
  { key: 'corporate', label: 'Corporate meetings' },
  { key: 'weekend', label: 'Weekend casual' },
  { key: 'dinner', label: 'Dinner and restaurants' },
  { key: 'travel', label: 'Travel and airports' },
  { key: 'smart_casual', label: 'Smart casual events' },
  { key: 'florida_summer', label: 'Summer and Florida weather' },
  { key: 'evening', label: 'Evening outings' }
];
const OCC_KEYS = OCCASIONS.map((o) => o.key);
const DISCLAIMER = 'Scores are subjective styling guidance, not measurements.';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r10 = (v) => clamp(Math.round(v), 1, 10);

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  const n = m ? parseInt(m[1], 16) : 0xdddddd;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

const BUSY = { solid: 0, oxford: 0, stripe: 1, gingham: 1, plaid: 2 };

function hueFamily({ h, s, l }) {
  if (s < 0.18 || l > 0.93) return l > 0.8 ? 'white' : l < 0.2 ? 'black' : 'neutral';
  if (h < 18 || h >= 340) return 'red';
  if (h < 45) return l > 0.6 ? 'beige' : 'brown';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 255) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

/** What the shirt reads as: the accent colour of a patterned shirt matters most. */
function shirtProfile(shirt) {
  const base = hexToHsl(shirt.color_hex);
  const accent = shirt.color2_hex ? hexToHsl(shirt.color2_hex) : null;
  const pattern = BUSY[shirt.pattern] != null ? shirt.pattern : 'solid';
  const lead = accent && pattern !== 'solid' && pattern !== 'oxford' ? accent : base;
  // A patterned shirt reads as the average of its two colours from a distance.
  const l = accent && pattern === 'plaid' ? (base.l + accent.l) / 2 : accent && pattern !== 'oxford' ? base.l * 0.75 + accent.l * 0.25 : base.l;
  return { base, accent, lead, l, pattern, busy: BUSY[pattern], family: hueFamily(lead), sat: lead.s };
}

function pantsProfile(pants) {
  const c = hexToHsl(pants.color_hex);
  const name = String(pants.name || '').toLowerCase() + ' ' + String(pants.color_name || '').toLowerCase();
  const type = String(pants.garment_type || '').toLowerCase();
  let kind = 'other';
  if (/black/.test(name)) kind = 'black';
  else if (/khaki|tan|chino/.test(name) || (type === 'chino' && c.h > 20 && c.h < 60 && c.s > 0.15)) kind = 'khaki';
  else if (/grey|gray/.test(name) || (c.s < 0.12 && c.l > 0.3)) kind = 'grey';
  else if (type === 'denim' || /denim|jean/.test(name)) kind = c.l < 0.35 ? 'dark_denim' : 'light_denim';
  const formality = { dark_denim: 2, light_denim: 1, black: 2.5, khaki: 3, grey: 3, other: 2 }[kind];
  return { ...c, kind, formality, dark: c.l < 0.3 };
}

/**
 * Score one shirt + trousers pairing. Returns scores, occasion fits and the
 * reasons the scores came from (the explanation is assembled from them).
 */
function evaluate(shirt, pants) {
  const S = shirtProfile(shirt);
  const P = pantsProfile(pants);
  const good = [], bad = [];
  let color = 5.5;

  // 1. Light/dark contrast between top and bottom.
  const contrast = Math.abs(S.l - P.l);
  if (contrast >= 0.45) { color += 1.5; good.push('a clear light-over-dark contrast that reads crisp and intentional'); }
  else if (contrast >= 0.25) { color += 1; good.push('enough contrast between top and bottom to keep the outfit defined'); }
  else if (contrast < 0.12) { color -= 2; bad.push('the shirt and trousers sit at almost the same depth, so the outfit can look washed together'); }
  else { color -= 0.5; bad.push('a soft, low-contrast pairing'); }

  // 2. Colour relationship.
  const f = S.family;
  if (P.kind === 'khaki') {
    if (['blue', 'white', 'pink', 'purple', 'green'].includes(f)) { color += 1.5; good.push('cool or crisp tones against warm khaki are a classic American pairing'); }
    if (['beige', 'brown', 'yellow'].includes(f)) { color -= 1; bad.push('warm on warm (khaki with a ' + f + ' shirt) blends rather than contrasts'); }
    if (f === 'red') { color += 0.5; good.push('red against khaki is a relaxed, preppy combination'); }
  } else if (P.kind === 'dark_denim') {
    color += 1; good.push('dark denim is a near-neutral that anchors almost any Oxford');
    if (f === 'blue' && S.l > 0.6) { color += 0.5; good.push('light blue over indigo is tone-on-tone done right'); }
  } else if (P.kind === 'light_denim') {
    if (f === 'blue' && contrast < 0.25) { color -= 1.5; bad.push('a blue shirt over light-wash denim is a lot of the same blue'); }
    if (['white', 'pink', 'yellow', 'red', 'green'].includes(f) || (f === 'neutral')) { color += 0.5; good.push('light denim keeps a ' + f + ' shirt easy and casual'); }
    if (S.busy >= 2) { color -= 0.5; bad.push('a busy plaid with faded denim reads very casual'); }
  } else if (P.kind === 'black') {
    if (S.l > 0.6) { color += 1; good.push('black trousers make a light shirt look sharper'); }
    if (['beige', 'brown'].includes(f)) { color -= 1; bad.push('beige with black trousers is a softer, less natural match'); }
    if (S.l < 0.35) { color -= 1; bad.push('a dark shirt over black trousers loses its outline'); }
  } else if (P.kind === 'grey') {
    if (['blue', 'pink', 'purple', 'white'].includes(f)) { color += 1.5; good.push('grey flatters cool and pastel shirts'); }
    if (['yellow', 'beige'].includes(f)) { color -= 0.5; bad.push('grey with a warm ' + f + ' shirt is pleasant but a little flat'); }
    if (f === 'green') { color += 0.5; good.push('green against grey stays understated'); }
  }

  // 3. Pattern load.
  if (S.busy === 2) { color -= 0.5; bad.push('the plaid carries the outfit, so the trousers should stay quiet'); }
  if (S.sat > 0.55 && S.busy === 0 && f !== 'white') { color -= 0.5; bad.push('a strong shirt colour works best with plain trousers'); }

  const colorScore = r10(color);
  const shirtFormal = S.busy === 0 ? 3 : S.pattern === 'stripe' ? 2.5 : S.pattern === 'gingham' ? 2 : 1.5;
  const loud = S.sat > 0.45 || S.busy >= 1;
  const light = S.l > 0.7;

  const fit = {};
  fit.corporate = 3 + (P.formality - 1) * 1.6 + (shirtFormal - 1.5) * 1.6 + (['white', 'blue'].includes(f) ? 1.2 : 0) - (/denim/.test(P.kind) ? 1.5 : 0) - (P.kind === 'light_denim' ? 2 : 0) - (S.busy >= 1 && S.pattern !== 'stripe' ? 1.5 : 0) - (S.sat > 0.5 && S.busy === 0 && f !== 'blue' ? 0.5 : 0);
  fit.business_casual = 4 + (P.formality - 1) * 1.3 + (shirtFormal - 1.5) * 1.1 - (P.kind === 'light_denim' ? 1.5 : 0);
  fit.weekend = 6 + (S.busy >= 1 ? 1.5 : 0) + (P.kind === 'light_denim' || P.kind === 'khaki' ? 1 : 0) - (P.kind === 'grey' ? 0.5 : 0) + (loud ? 0.5 : 0);
  fit.dinner = 4.5 + (P.dark || P.kind === 'grey' ? 1.5 : 0) + (shirtFormal >= 2.5 ? 1 : 0) - (P.kind === 'light_denim' ? 1.5 : 0) + (S.busy === 2 ? -0.5 : 0);
  fit.travel = 5 + (P.dark ? 2 : 0) - (P.kind === 'khaki' ? 0.5 : 0) - (P.kind === 'light_denim' ? 0 : 0) - (S.l > 0.9 ? 1 : 0) + (S.busy >= 1 ? 0.5 : 0);
  fit.smart_casual = 5 + (P.formality - 1) * 0.9 + (shirtFormal - 1.5) * 0.8 + (colorScore >= 8 ? 0.5 : 0);
  fit.florida_summer = 4.5 + (light ? 1.5 : 0) + (P.kind === 'khaki' || P.kind === 'light_denim' ? 1.5 : 0) - (P.kind === 'black' ? 2 : 0) - (P.dark && P.kind !== 'black' ? 0.5 : 0) - (S.l < 0.35 ? 1.5 : 0);
  fit.evening = 4 + (P.dark ? 2 : 0) + (P.kind === 'grey' ? 0.5 : 0) + (S.l < 0.6 || S.sat > 0.35 ? 1 : 0) - (P.kind === 'light_denim' ? 1.5 : 0);
  // A good colour match lifts every occasion a little; a poor one drags.
  for (const k of OCC_KEYS) fit[k] = r10(fit[k] + (colorScore - 6) * 0.25);

  const best = OCC_KEYS.filter((k) => fit[k] >= 8).sort((a, b) => fit[b] - fit[a]).slice(0, 3);
  const top3 = OCC_KEYS.slice().sort((a, b) => fit[b] - fit[a]).slice(0, 3);
  const overall = r10(colorScore * 0.6 + (fit[top3[0]] + fit[top3[1]]) / 2 * 0.4);

  // Tuck and sleeve advice follow from the most suitable occasion.
  const formalLead = ['corporate', 'business_casual', 'dinner'].includes(top3[0]);
  const tuck = formalLead || P.formality >= 3 && S.busy === 0
    ? { advice: 'Tucked', why: 'a tuck with a belt keeps a ' + (shirt.color_name || 'solid') + ' Oxford and ' + (pants.color_name || 'these trousers').toLowerCase() + ' looking put together' }
    : { advice: 'Untucked', why: 'a ' + (S.busy >= 1 ? 'patterned ' : '') + 'Oxford over ' + (pants.color_name || 'these trousers').toLowerCase() + ' is meant to look relaxed; a tuck would read stiff' };
  const sleeves = fit.florida_summer >= 7 || top3.includes('weekend')
    ? { advice: 'Rolled twice, just below the elbow', why: 'a neat roll keeps it cool and relaxed' }
    : { advice: 'Buttoned at the cuff', why: 'full-length sleeves keep the more formal settings sharp' };

  return {
    overall, color: colorScore,
    occasions: OCC_KEYS.map((k) => ({ key: k, label: OCCASIONS.find((o) => o.key === k).label, fit: fit[k] })),
    recommended: best.length ? best : top3.slice(0, 1),
    tuck, sleeves,
    reasons: dedupe(good).slice(0, 3),
    cautions: dedupe(bad).slice(0, 2),
    explanation: explain(shirt, pants, good, bad, overall, best.length ? best : top3.slice(0, 1)),
    composed_by: 'rules',
    disclaimer: DISCLAIMER
  };
}

function dedupe(a) { return a.filter((x, i) => a.indexOf(x) === i); }
function explain(shirt, pants, good, bad, overall, best) {
  const occ = best.map((k) => OCCASIONS.find((o) => o.key === k).label.toLowerCase());
  const g = dedupe(good).slice(0, 2), b = dedupe(bad).slice(0, 1);
  const lead = `The ${shirt.name} with ${pants.name}`;
  let txt;
  if (overall >= 6 && g.length) txt = lead + ' works because of ' + g.join(', and ') + '.' + (b.length ? ' One thing to watch: ' + b[0] + '.' : '');
  else if (b.length) txt = lead + ' is a weaker pairing: ' + b.join('; ') + '.' + (g.length ? ' In its favour: ' + g[0] + '.' : '');
  else txt = lead + ' is a straightforward, safe pairing.';
  return txt + (occ.length ? ' Best for ' + occ.slice(0, 3).join(', ') + '.' : '');
}

/**
 * "What should I wear today?" Ranks outfits for an occasion. Pure: the caller
 * passes in what it knows (recent wear, favourites, ratings, weather).
 */
function rankForOccasion(outfits, occasion, { wornRecently = new Set(), weather = null } = {}) {
  const hot = weather && weather.temp_c != null && weather.temp_c >= 28;
  const wet = weather && weather.rain === true;
  return outfits
    .filter((o) => !o.shirt.is_slot)
    .map((o) => {
      const e = o.eval || evaluate(o.shirt, o.pants);
      const occ = e.occasions.find((x) => x.key === occasion) || e.occasions[0];
      let score = occ.fit * 0.6 + e.overall * 0.4;
      if (hot) score += (e.occasions.find((x) => x.key === 'florida_summer').fit - 6) * 0.3;
      if (wet && /khaki|light/i.test(o.pants.color_name || '')) score -= 0.5;
      if (o.favorite) score += 0.4;
      if (o.rating) score += (o.rating - 3) * 0.25;
      if (wornRecently.has(o.id)) score -= 2;
      return { outfit: o, eval: e, score: Math.round(score * 100) / 100 };
    })
    .sort((a, b) => b.score - a.score || a.outfit.id - b.outfit.id);
}

/** Default occasion for a date: weekdays business casual, weekends casual. */
function defaultOccasion(date) {
  const d = (date instanceof Date ? date : new Date()).getDay();
  return d === 0 || d === 6 ? 'weekend' : 'business_casual';
}

module.exports = { evaluate, rankForOccasion, defaultOccasion, OCCASIONS, OCC_KEYS, DISCLAIMER, hexToHsl, shirtProfile, pantsProfile };
