'use strict';

/** Eastern time helpers (Tampa Bay). No library: Intl gives the wall clock, DST included. */

const TZ = 'America/New_York';

function parts(date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
  return { y: Number(o.year), m: Number(o.month), d: Number(o.day), hour: Number(o.hour), minute: Number(o.minute), weekday: wd };
}

/** UTC Date for a wall-clock time in Eastern (minutes after midnight). */
function toUtc(y, m, d, minutes) {
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let utc = guess;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(utc));
    const asIf = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute);
    utc += guess - asIf;
  }
  return new Date(utc);
}

/** Calendar day in Eastern, N days from a date. */
function addDays(date, n) {
  const p = parts(date);
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), weekday: base.getUTCDay() };
}

function hourNow(now = new Date()) { return parts(now).hour; }

function label(date, lang) {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) + (lang === 'es' ? ' (hora del este)' : ' Eastern');
}

module.exports = { TZ, parts, toUtc, addDays, hourNow, label };
