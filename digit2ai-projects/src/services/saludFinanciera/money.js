'use strict';
// Money is integer CENTS everywhere in the engine. Never a float.
// Postgres NUMERIC arrives as a string ("4689.48"), which is parsed exactly here.

function toCents(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    // A JS number from JSON ("45" or 45.5): go through its shortest decimal string.
    v = String(v);
  }
  let s = String(v).trim().replace(/[$\s]/g, '');
  // "1,500.25" -> "1500.25"; "1.500,25" (es) -> "1500.25"; "1,500" -> "1500"
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = parseInt(m[2], 10) * 100 + parseInt((m[3] || '0').padEnd(2, '0'), 10);
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] ? -cents : cents;
}

// "4689.48" — the exact string written to a NUMERIC(12,2) column.
function toDecimalString(cents) {
  const neg = cents < 0; const a = Math.abs(cents);
  return (neg ? '-' : '') + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
}

// "$4,689.48" for display and for Lina's words.
function fmt(cents) {
  if (cents === null || cents === undefined) return null;
  const neg = cents < 0; const a = Math.abs(cents);
  const int = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-$' : '$') + int + '.' + String(a % 100).padStart(2, '0');
}

module.exports = { toCents, toDecimalString, fmt };
