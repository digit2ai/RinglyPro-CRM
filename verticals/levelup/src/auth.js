'use strict';

/**
 * LevelUp auth. Open self-signup (it is a product creators sign up for); each
 * account is its own tenant (tenant_id = user id).
 *
 * Cookie `lu_token`: JWT with audience 'levelup' (several verticals share
 * JWT_SECRET; the audience stops their tokens being valid here), HttpOnly,
 * SameSite=Lax, 30 days, path = the mount (or / on the brand domain).
 *
 * Platform admin (who may write platform-wide knowledge) is a DB flag set ONLY
 * by the seed, and the seed never promotes an account it did not create:
 * signup is unverified, so anyone could register the owner's email first.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { one, run } = require('./db');

const SECRET = () => process.env.LEVELUP_JWT_SECRET || process.env.JWT_SECRET || 'levelup-dev-only-secret';
const AUD = 'levelup';
const COOKIE = 'lu_token';
const PUBLISHED = ['Palindrome@7', 'lawncopilot@2026', 'coachtrack@2026', 'exec@2026', 'defensoresdelapatria@7', 'Digit2Ai@7', 'TunjoRacing2024!'];

function sign(u) {
  return jwt.sign({ id: u.id, tenant_id: u.tenant_id || u.id, email: u.email, lang: u.lang, pa: !!u.is_platform_admin }, SECRET(), { expiresIn: '30d', audience: AUD });
}
function verify(token) {
  try { return jwt.verify(token, SECRET(), { audience: AUD }); } catch (e) { return null; }
}
function cookiePath(req) { return req.baseUrl || '/'; }
function setCookie(req, res, u) {
  res.cookie(COOKIE, sign(u), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 864e5, path: cookiePath(req) });
}
function clearCookie(req, res) { res.clearCookie(COOKIE, { path: cookiePath(req) }); }
function readCookie(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)lu_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Tiny in-memory limiter, per instance (stated in /health).
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const b = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  b.push(now); buckets.set(key, b);
  return b.length > max;
}

const EMAIL = /^[^@\s]{1,100}@[^@\s]{1,100}\.[^@\s]{2,20}$/;
function checkPassword(p) {
  if (typeof p !== 'string' || p.length < 10) return 'Use at least 10 characters.';
  if (PUBLISHED.includes(p)) return 'That password is published. Choose another.';
  return null;
}
function reserved() {
  return String(process.env.LEVELUP_RESERVED_EMAILS || 'mstagg@digit2ai.com').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
}

async function signup({ email, password, name, lang }) {
  email = String(email || '').toLowerCase().trim();
  if (!EMAIL.test(email)) throw Object.assign(new Error('Enter a valid email'), { status: 400 });
  if (reserved().includes(email)) throw Object.assign(new Error('That email cannot be used to sign up here.'), { status: 409 });
  const bad = checkPassword(password); if (bad) throw Object.assign(new Error(bad), { status: 400 });
  const exists = await one('SELECT id FROM lu_users WHERE lower(email) = :e', { e: email });
  if (exists) throw Object.assign(new Error('An account with that email already exists. Sign in instead.'), { status: 409 });
  const hash = await bcrypt.hash(password, 12);
  const [u] = await run(`INSERT INTO lu_users (email, name, password_hash, lang) VALUES (:e, :n, :h, :l) RETURNING *`,
    { e: email, n: String(name || '').trim().slice(0, 200) || null, h: hash, l: lang === 'es' ? 'es' : 'en' });
  const [u2] = await run('UPDATE lu_users SET tenant_id = id WHERE id = :id RETURNING *', { id: u.id });
  return u2;
}

let DUMMY = null; // real bcrypt hash at the same cost, so an unknown email takes as long as a wrong password
async function login({ email, password }) {
  email = String(email || '').toLowerCase().trim();
  const u = await one('SELECT * FROM lu_users WHERE lower(email) = :e AND active = true', { e: email });
  if (!DUMMY) DUMMY = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
  const ok = await bcrypt.compare(String(password || ''), u ? u.password_hash : DUMMY);
  if (!u || !ok) throw Object.assign(new Error('Wrong email or password'), { status: 401 });
  return u;
}

/** Seed the owner as platform admin, only when a non-published password is configured. */
async function seedOwner() {
  const email = String(process.env.LEVELUP_OWNER_EMAIL || 'mstagg@digit2ai.com').toLowerCase().trim();
  const pw = process.env.LEVELUP_OWNER_PASSWORD || process.env.LAWNCOPILOT_MSTAGG_PASSWORD || '';
  if (!pw || checkPassword(pw)) return { seeded: false, reason: 'LEVELUP_OWNER_PASSWORD not set to a private value of 10+ characters' };
  const existing = await one('SELECT * FROM lu_users WHERE lower(email) = :e', { e: email });
  if (existing && !existing.created_by_seed) return { seeded: false, reason: 'an account with the owner email was created by signup; not promoted' };
  const hash = await bcrypt.hash(pw, 12);
  if (existing) {
    if (!(await bcrypt.compare(pw, existing.password_hash))) await run('UPDATE lu_users SET password_hash = :h WHERE id = :id', { h: hash, id: existing.id });
    return { seeded: true, created: false };
  }
  const [u] = await run(`INSERT INTO lu_users (email, name, password_hash, lang, is_platform_admin, created_by_seed) VALUES (:e, 'Manuel Stagg', :h, 'en', true, true) RETURNING id`, { e: email, h: hash });
  await run('UPDATE lu_users SET tenant_id = id WHERE id = :id', { id: u.id });
  return { seeded: true, created: true };
}

function newApiKey() {
  const raw = 'lu_live_' + crypto.randomBytes(24).toString('hex');
  return { raw, prefix: raw.slice(0, 14), hash: crypto.createHash('sha256').update(raw).digest('hex') };
}
function hashKey(raw) { return crypto.createHash('sha256').update(String(raw || '')).digest('hex'); }

module.exports = { sign, verify, setCookie, clearCookie, readCookie, limited, signup, login, seedOwner, newApiKey, hashKey, checkPassword, COOKIE, PUBLISHED };
