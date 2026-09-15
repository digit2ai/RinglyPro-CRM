'use strict';

const crypto = require('crypto');
const db = require('../db');

const TENANT_ID = Number(process.env.INCENTIVA_TENANT_ID || 1);

function ipHash(req) {
  const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  return crypto.createHash('sha256').update(ip + '|' + (process.env.SESSION_SALT || 'incentiva-salt')).digest('hex');
}

function token(bytes = 24) { return crypto.randomBytes(bytes).toString('base64url'); }

const buckets = new Map();
/** In-memory sliding window. Returns true when allowed. */
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((ts) => now - ts < windowMs);
  if (arr.length >= max) { buckets.set(key, arr); return false; }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 20000) buckets.clear();
  return true;
}

async function audit(tenantId, actor, action, subjectType, subjectId, detail = {}) {
  try {
    await db.exec(`INSERT INTO nca_audit_log (tenant_id, actor_type, actor_id, action, subject_type, subject_id, detail)
      VALUES (:t, :at, :aid, :action, :st, :sid, :detail)`, {
      t: tenantId, at: actor.type || 'system', aid: actor.id || null, action, st: subjectType || null, sid: subjectId || null, detail: JSON.stringify(detail)
    });
  } catch (e) { console.error('[incentiva] audit write failed:', e.message); }
}

async function activity(tenantId, buyerId, actor, event, payload = {}) {
  await db.exec(`INSERT INTO nca_activity (tenant_id, buyer_id, actor_type, actor_id, event, payload)
    VALUES (:t, :b, :at, :aid, :e, :p)`, { t: tenantId, b: buyerId, at: actor.type, aid: actor.id || null, e: event, p: JSON.stringify(payload) });
}

/** A first name safe to put in an outbound message: letters, spaces, hyphens, apostrophes, up to 40.
 *  Anything else (a link, a number, an address) returns '' so buyer-typed text can never carry one. */
function safeFirstName(v) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  return /^[\p{L}][\p{L} '\u2019-]{0,39}$/u.test(s) ? s : '';
}

function clampStr(v, n) { return v === null || v === undefined ? null : String(v).trim().slice(0, n) || null; }
function numOrNull(v) { if (v === null || v === undefined || v === '') return null; const x = Number(v); return isFinite(x) ? x : null; }

module.exports = { TENANT_ID, ipHash, token, rateLimit, audit, activity, clampStr, numOrNull, safeFirstName };
