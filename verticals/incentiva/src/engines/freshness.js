'use strict';

/**
 * Freshness and the buyer-safe rule, in JS.
 *
 * The database view nca_v_incentives_buyer_safe is what the report builder
 * reads. isBuyerSafe() states the same rule so the SIT can assert both agree
 * and so a report can be re-checked at read time.
 */

const TZ = 'America/New_York';

function todayET(now = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function isoDate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

/** End of the given date in New York, as a Date. */
function endOfDayET(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Find the UTC instant of 23:59:59.999 local ET by probing the offset.
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hour12: false }).formatToParts(probe);
  const etHour = Number(parts.find((p) => p.type === 'hour').value);
  const offsetHours = 12 - etHour; // e.g. 4 in EDT, 5 in EST
  return new Date(Date.UTC(y, m - 1, d, 23 + offsetHours, 59, 59, 999));
}

function computeFreshUntil(verifiedAt, expiresOn, settings = {}) {
  const withExp = Number(settings.fresh_days_with_expiry || 21);
  const noExp = Number(settings.fresh_days_no_expiry || 10);
  const v = new Date(verifiedAt);
  if (expiresOn) {
    const byWindow = new Date(v.getTime() + withExp * 86400000);
    const byExpiry = endOfDayET(isoDate(expiresOn));
    return byWindow < byExpiry ? byWindow : byExpiry;
  }
  return new Date(v.getTime() + noExp * 86400000);
}

function isBuyerSafe(version, now = new Date()) {
  if (!version) return false;
  if (version.audience !== 'buyer') return false;
  if (version.verification_status !== 'verified') return false;
  if (!version.last_verified_at || !version.fresh_until) return false;
  if (new Date(version.fresh_until) <= now) return false;
  if (version.expires_on && isoDate(version.expires_on) < todayET(now)) return false;
  return true;
}

module.exports = { computeFreshUntil, isBuyerSafe, todayET, isoDate, endOfDayET };
