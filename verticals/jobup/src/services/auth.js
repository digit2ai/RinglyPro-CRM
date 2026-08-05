'use strict';

// =============================================================
// Account, auth and session (spec section 13).
//
// Password hashing uses Node's built-in scrypt — no native dependency, no
// bcrypt build step, and a real memory-hard KDF.
//
// PASSWORD RESET is the donor LawnCopilot pattern: the token is signed with the
// app secret PLUS THE USER'S CURRENT PASSWORD HASH. That makes it one-time BY
// CONSTRUCTION — using it changes the hash, which invalidates the token — with
// a 1 hour expiry and nothing to store.
//
// Account creation happens AT PAYMENT, not before. The post-payment step sets a
// password and verifies the email.
// =============================================================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { models } = require('../models');

const SECRET = process.env.JOBUP_JWT_SECRET || 'dev-only-insecure-secret';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const RESET_TTL_MS = 60 * 60 * 1000;        // 1 hour
const VERIFY_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days
const SESSION_DAYS = 30;

// ---- passwords ------------------------------------------------------------

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = crypto.scryptSync(String(plain), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${salt}$${dk.toString('hex')}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hex] = stored.split('$');
  if (!salt || !hex) return false;
  const dk = crypto.scryptSync(String(plain), salt, SCRYPT.keylen, SCRYPT);
  const a = Buffer.from(hex, 'hex');
  // Constant-time — never a plain === on a password digest.
  return a.length === dk.length && crypto.timingSafeEqual(a, dk);
}

function passwordProblems(p) {
  const errs = [];
  const s = String(p || '');
  if (s.length < 10) errs.push('password must be at least 10 characters');
  if (!/[a-z]/i.test(s)) errs.push('password must contain a letter');
  if (!/\d/.test(s)) errs.push('password must contain a number');
  return errs;
}

// ---- sessions -------------------------------------------------------------

function issueSession(tenantId) {
  // jti lets a future revocation list invalidate a single session.
  return jwt.sign({ tid: tenantId, jti: crypto.randomUUID() }, SECRET, { expiresIn: `${SESSION_DAYS}d` });
}

function readSession(token) {
  try {
    const p = jwt.verify(token, SECRET);
    return Number.isInteger(p.tid) ? p : null;
  } catch (e) { return null; }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,          // .dev is HSTS-preloaded; there is no http path
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 86400 * 1000,
    path: '/',
  };
}

// ---- stateless signed tokens (reset + verify) -----------------------------

function sign(payloadStr) {
  return crypto.createHmac('sha256', SECRET).update(payloadStr).digest('base64url');
}

/**
 * Reset token. Bound to the CURRENT password hash, so using it once and
 * changing the password makes every outstanding token for that account invalid.
 * Nothing is stored server-side.
 */
function makeResetToken(sub) {
  const exp = Date.now() + RESET_TTL_MS;
  const basis = `reset|${sub.id}|${exp}|${sub.password_hash || ''}`;
  return `${sub.id}.${exp}.${sign(basis)}`;
}

async function consumeResetToken(token) {
  const [idStr, expStr, mac] = String(token || '').split('.');
  const id = parseInt(idStr, 10);
  const exp = parseInt(expStr, 10);
  if (!Number.isInteger(id) || !Number.isInteger(exp)) return { ok: false, reason: 'malformed token' };
  if (Date.now() > exp) return { ok: false, reason: 'token expired' };

  const sub = await models.subscribers.findOne({ where: { id } });
  if (!sub) return { ok: false, reason: 'no such account' };

  const expected = sign(`reset|${sub.id}|${exp}|${sub.password_hash || ''}`);
  const a = Buffer.from(String(mac || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    // A hash change since issue lands here — which is the one-time property.
    return { ok: false, reason: 'token already used or invalid' };
  }
  return { ok: true, subscriber: sub };
}

function makeVerifyToken(sub) {
  const exp = Date.now() + VERIFY_TTL_MS;
  return `${sub.id}.${exp}.${sign(`verify|${sub.id}|${exp}|${sub.email}`)}`;
}

async function consumeVerifyToken(token) {
  const [idStr, expStr, mac] = String(token || '').split('.');
  const id = parseInt(idStr, 10);
  const exp = parseInt(expStr, 10);
  if (!Number.isInteger(id) || !Number.isInteger(exp)) return { ok: false, reason: 'malformed token' };
  if (Date.now() > exp) return { ok: false, reason: 'token expired' };
  const sub = await models.subscribers.findOne({ where: { id } });
  if (!sub) return { ok: false, reason: 'no such account' };
  const expected = sign(`verify|${sub.id}|${exp}|${sub.email}`);
  const a = Buffer.from(String(mac || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'invalid token' };
  return { ok: true, subscriber: sub };
}

// ---- login throttling -----------------------------------------------------
// In-memory is acceptable here ONLY because a lockout that resets on deploy
// fails safe (it re-locks on the next attempt). The teaser limiter, which
// guards money, is DB-backed instead.

const attempts = new Map();
const MAX_ATTEMPTS = 8;
const LOCK_MS = 15 * 60 * 1000;

function throttle(key) {
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, until: 0 };
  if (rec.until > now) return { allowed: false, retry_after_s: Math.ceil((rec.until - now) / 1000) };
  return { allowed: true, rec };
}

function noteFailure(key) {
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, until: 0 };
  rec.n++;
  if (rec.n >= MAX_ATTEMPTS) { rec.until = now + LOCK_MS; rec.n = 0; }
  attempts.set(key, rec);
}

function noteSuccess(key) { attempts.delete(key); }

module.exports = {
  hashPassword, verifyPassword, passwordProblems,
  issueSession, readSession, cookieOptions,
  makeResetToken, consumeResetToken, makeVerifyToken, consumeVerifyToken,
  throttle, noteFailure, noteSuccess,
  SESSION_DAYS, RESET_TTL_MS, VERIFY_TTL_MS, MAX_ATTEMPTS,
};
