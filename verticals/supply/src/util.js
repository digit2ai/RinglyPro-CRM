'use strict';

/** Shared helpers: phone normalisation, secret encryption, timezones, audit. */

const crypto = require('crypto');
const db = require('./db');

function e164(raw, defaultCountry = '1') {
  if (!raw) return null;
  const s = String(raw).trim();
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null;
  if (digits.length === 10 && defaultCountry === '1') return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null; // ambiguous input is refused, never guessed
}

function mask(phone) {
  if (!phone) return null;
  const d = String(phone);
  return d.length > 4 ? d.slice(0, -4).replace(/\d/g, '*') + d.slice(-4) : '****';
}

function companyKey(name) {
  return String(name || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(llc|inc|corp|corporation|co|company|ltd|l\.l\.c|pllc)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 240);
}

// ── Secrets (AES-256-GCM) ────────────────────────────────────────────────────
function key() {
  const k = process.env.SUPPLY_SECRET || process.env.JWT_SECRET || 'supply-dev-only-secret';
  return crypto.createHash('sha256').update('ringlypro-supply:' + k).digest();
}
function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}
function decrypt(blob) {
  if (!blob) return null;
  try {
    const [iv, tag, enc] = String(blob).split('.').map((p) => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch (e) { return null; } // rotated key: reported as "undecryptable", never guessed
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a || '').length > 0;
}

// ── Timezones ────────────────────────────────────────────────────────────────
// A contractor is called in THEIR local time. State -> zone covers the common
// case; a state spanning zones uses its most populous zone, and a contractor
// row may carry its own explicit timezone which always wins.
const STATE_TZ = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago', CA: 'America/Los_Angeles',
  CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago', NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago',
  OH: 'America/New_York', OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver'
};
function tzFor(contractor, tenant) {
  if (contractor && contractor.timezone) return contractor.timezone;
  const st = contractor && contractor.state ? String(contractor.state).trim().toUpperCase().slice(0, 2) : '';
  return STATE_TZ[st] || (tenant && tenant.timezone) || 'America/New_York';
}
/** Local weekday (0=Sun) and minutes-after-midnight in a zone. */
function localClock(tz, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const h = Number(get('hour')) % 24;
  return { weekday: wd, minutes: h * 60 + Number(get('minute')) };
}
function localDate(tz, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

async function audit(tenantId, actorId, action, subjectType, subjectId, detail = {}) {
  try {
    await db.trun(tenantId, `INSERT INTO sup_audit (tenant_id, actor_id, action, subject_type, subject_id, detail)
      VALUES (:tenant, :a, :act, :st, :sid, :d::jsonb)`, { a: actorId || null, act: action, st: subjectType || null, sid: subjectId || null, d: JSON.stringify(detail || {}) });
  } catch (e) { console.error('[supply] audit failed:', e.message); }
}

const money = (n) => (n == null || n === '' || isNaN(Number(n)) ? null : Number(Number(n).toFixed(2)));
const num = (n) => (n == null || n === '' || isNaN(Number(n)) ? null : Number(n));
function httpError(status, message, extra) { return Object.assign(new Error(message), { status }, extra || {}); }

module.exports = { e164, mask, companyKey, encrypt, decrypt, safeEqual, tzFor, localClock, localDate, STATE_TZ, audit, money, num, httpError };
