'use strict';
/**
 * Optional weather for "What should I wear today?". Open-Meteo is keyless.
 * Location defaults to Tampa; STYLE_STUDIO_WEATHER=off disables it. A failure
 * returns null and the recommendation simply says weather was not used.
 */
let cache = { at: 0, v: null };
async function today() {
  if (String(process.env.STYLE_STUDIO_WEATHER || '').toLowerCase() === 'off') return null;
  if (Date.now() - cache.at < 30 * 60 * 1000 && cache.v) return cache.v;
  const lat = Number(process.env.STYLE_STUDIO_LAT || 27.9506), lon = Number(process.env.STYLE_STUDIO_LON || -82.4572);
  const place = process.env.STYLE_STUDIO_PLACE || 'Tampa';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=1`;
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    const tc = j.daily && j.daily.temperature_2m_max ? j.daily.temperature_2m_max[0] : null;
    const pp = j.daily && j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[0] : null;
    if (tc == null) return null;
    const v = { place, temp_c: Math.round(tc), temp_f: Math.round(tc * 9 / 5 + 32), rain_chance: pp, rain: pp != null && pp >= 60, source: 'Open-Meteo' };
    cache = { at: Date.now(), v };
    return v;
  } catch (_) { return null; }
}
module.exports = { today };
