'use strict';

/**
 * Timezone-aware slot helpers. We avoid extra deps by using Intl to render a
 * wall-clock date/time in the tenant timezone and to find that timezone's UTC
 * offset for a given instant, then build UTC Date objects for slot instants.
 */

// UTC offset (minutes) for a given instant in a named timezone.
function offsetMinutes(tz, at) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = dtf.formatToParts(at).reduce((a, p) => (a[p.type] = p.value, a), {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUTC - at.getTime()) / 60000);
}

// Build the UTC instant for a local wall-clock (Y,M,D,h,m) in a timezone.
function zonedToUtc(tz, y, mo, d, h, mi) {
  // First guess assuming UTC, then correct by the tz offset at that instant.
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, 0));
  const off = offsetMinutes(tz, guess);
  return new Date(guess.getTime() - off * 60000);
}

// Wall-clock parts (weekday 0-6, y, mo, d, h, mi) for an instant in a tz.
function utcToZonedParts(tz, at) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const p = dtf.formatToParts(at).reduce((a, x) => (a[x.type] = x.value, a), {});
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: wdMap[p.weekday], y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

function hhmmToMinutes(s) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }

// Human display of a slot instant in the tenant tz + locale.
function displaySlot(tz, at, locale) {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-CO' : 'en-US', {
    timeZone: tz, weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  }).format(at);
}

module.exports = { offsetMinutes, zonedToUtc, utcToZonedParts, hhmmToMinutes, displaySlot };
