'use strict';

/**
 * RinglyPro Supply auth.
 *
 * Cookie `sup_token`: JWT with audience 'supply' (several verticals share
 * JWT_SECRET; the audience stops their tokens being valid here), HttpOnly,
 * SameSite=Lax, 12 h. The user row is RE-READ on every request, so a disabled
 * or demoted account loses access immediately, and tenant_id always comes from
 * that row — never from a request body or query.
 *
 * Signup creates a new supplier (tenant) with its creator as owner, status
 * 'trial'. A trial tenant cannot dial until it connects its own GoHighLevel
 * sub-account and an owner approves and activates a campaign.
 *
 * Platform super admin is a DB flag set ONLY by the seed, and the seed never
 * promotes an account that signup created.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SECRET = () => process.env.SUPPLY_JWT_SECRET || process.env.JWT_SECRET || 'supply-dev-only-secret';
const AUD = 'supply';
const COOKIE = 'sup_token';
const PUBLISHED = ['Palindrome@7', 'lawncopilot@2026', 'coachtrack@2026', 'exec@2026', 'defensoresdelapatria@7', 'Digit2Ai@7', 'TunjoRacing2024!', 'Palindrome@7!'];
const ROLES = ['owner', 'admin', 'rep', 'viewer'];

// pc = when the password last changed; a reset ends every older session.
const pcOf = (u) => (u && u.password_changed_at ? new Date(u.password_changed_at).getTime() : 0);
function sign(u) { return jwt.sign({ id: u.id, pc: pcOf(u) }, SECRET(), { expiresIn: '12h', audience: AUD }); }
function verify(t) { try { return jwt.verify(t, SECRET(), { audience: AUD }); } catch (e) { return null; } }
function cookiePath(req) { return req.baseUrl || '/'; }
function setCookie(req, res, u) { res.cookie(COOKIE, sign(u), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 12 * 3600e3, path: cookiePath(req) }); }
function clearCookie(req, res) { res.clearCookie(COOKIE, { path: cookiePath(req) }); }
function readCookie(req) { const m = (req.headers.cookie || '').match(/(?:^|;\s*)sup_token=([^;]+)/); return m ? decodeURIComponent(m[1]) : null; }

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
const err = (status, message) => Object.assign(new Error(message), { status });

async function userFromRequest(req) {
  const tok = readCookie(req);
  const claims = tok ? verify(tok) : null;
  if (!claims) return null;
  const u = await db.one('SELECT id, tenant_id, email, name, role, is_super_admin, active, password_changed_at FROM sup_users WHERE id = :id', { id: claims.id });
  if (!u || !u.active || (claims.pc || 0) !== pcOf(u)) return null;
  delete u.password_changed_at;
  return u;
}

async function createUser({ tenantId, email, password, name, role }) {
  email = String(email || '').toLowerCase().trim();
  if (!EMAIL.test(email)) throw err(400, 'Enter a valid email');
  const bad = checkPassword(password); if (bad) throw err(400, bad);
  if (!ROLES.includes(role)) throw err(400, 'Unknown role');
  if (await db.one('SELECT id FROM sup_users WHERE lower(email) = :e', { e: email })) throw err(409, 'An account with that email already exists');
  const hash = await bcrypt.hash(password, 12);
  const [u] = await db.run(`INSERT INTO sup_users (tenant_id, email, name, password_hash, role) VALUES (:t, :e, :n, :h, :r) RETURNING id, tenant_id, email, name, role, is_super_admin, active`,
    { t: tenantId, e: email, n: String(name || '').trim().slice(0, 200) || null, h: hash, r: role });
  return u;
}

let DUMMY = null;
async function login({ email, password }) {
  email = String(email || '').toLowerCase().trim();
  const u = await db.one('SELECT * FROM sup_users WHERE lower(email) = :e AND active = true', { e: email });
  if (!DUMMY) DUMMY = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
  const ok = await bcrypt.compare(String(password || ''), u ? u.password_hash : DUMMY);
  if (!u || !ok) throw err(401, 'Wrong email or password');
  return u;
}

async function seedOwner() {
  const email = String(process.env.SUPPLY_OWNER_EMAIL || 'mstagg@digit2ai.com').toLowerCase().trim();
  const pw = process.env.SUPPLY_OWNER_PASSWORD || '';
  if (!pw || checkPassword(pw)) return { seeded: false, reason: 'SUPPLY_OWNER_PASSWORD not set to a private value of 10+ characters' };
  const existing = await db.one('SELECT * FROM sup_users WHERE lower(email) = :e', { e: email });
  if (existing && !existing.created_by_seed) return { seeded: false, reason: 'an account with the owner email was created by signup; not promoted' };
  if (existing) {
    if (!(await bcrypt.compare(pw, existing.password_hash))) await db.run('UPDATE sup_users SET password_hash = :h WHERE id = :id', { h: await bcrypt.hash(pw, 12), id: existing.id });
    return { seeded: true, created: false };
  }
  await db.run(`INSERT INTO sup_users (tenant_id, email, name, password_hash, role, is_super_admin, created_by_seed) VALUES (NULL, :e, 'Platform owner', :h, 'owner', true, true)`, { e: email, h: await bcrypt.hash(pw, 12) });
  return { seeded: true, created: true };
}

// ── Forgot password: 6-digit code by email ──
const RESET_MIN = () => Math.max(5, Number(process.env.SUPPLY_RESET_MINUTES) || 15);
const RESET_TRIES = 5;
const RESEND_SEC = 60;
function codeHash(userId, code) { return crypto.createHash('sha256').update(SECRET() + ':reset:' + userId + ':' + code).digest('hex'); }
function sameHex(a, b) { const x = Buffer.from(String(a || ''), 'utf8'); const y = Buffer.from(String(b || ''), 'utf8'); return x.length === y.length && crypto.timingSafeEqual(x, y); }

// Same answer whether or not the email exists, so nobody can probe for accounts.
async function requestReset(email, mail) {
  email = String(email || '').toLowerCase().trim();
  if (!EMAIL.test(email)) throw err(400, 'Enter a valid email');
  const u = await db.one('SELECT id, email, reset_sent_at FROM sup_users WHERE lower(email) = :e AND active = true', { e: email });
  if (!u) return { ok: true };
  if (u.reset_sent_at && Date.now() - new Date(u.reset_sent_at).getTime() < RESEND_SEC * 1000) return { ok: true };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const min = RESET_MIN();
  await db.run(`UPDATE sup_users SET reset_code_hash = :h, reset_expires = now() + (:m || ' minutes')::interval, reset_attempts = 0, reset_sent_at = now() WHERE id = :id`,
    { h: codeHash(u.id, code), m: String(min), id: u.id });
  let out;
  try { out = await mail.resetCode({ to: u.email, code, minutes: min }); } catch (e) { out = { sent: false, reason: e.message }; }
  if (!out || !out.sent) {
    // Nothing reached the inbox: drop the code so the resend wait does not block a retry.
    await db.run('UPDATE sup_users SET reset_code_hash = NULL, reset_expires = NULL, reset_sent_at = NULL WHERE id = :id', { id: u.id });
    console.error('[supply] reset email not sent:', out && out.reason);
    throw err(503, 'Email could not be sent right now. Try again later.');
  }
  return { ok: true };
}

async function resetPassword({ email, code, password }) {
  email = String(email || '').toLowerCase().trim();
  code = String(code || '').replace(/\s+/g, '');
  const bad = checkPassword(password); if (bad) throw err(400, bad);
  const generic = err(400, 'That code is wrong or has expired. Ask for a new one.');
  if (!/^\d{6}$/.test(code)) throw generic;
  const u = await db.one('SELECT id, reset_code_hash, reset_expires, reset_attempts FROM sup_users WHERE lower(email) = :e AND active = true', { e: email });
  if (!u || !u.reset_code_hash || !u.reset_expires || new Date(u.reset_expires).getTime() < Date.now() || u.reset_attempts >= RESET_TRIES) throw generic;
  if (!sameHex(u.reset_code_hash, codeHash(u.id, code))) {
    await db.run('UPDATE sup_users SET reset_attempts = reset_attempts + 1 WHERE id = :id', { id: u.id });
    throw generic;
  }
  // Single use: the code is cleared in the same statement that checks it is still there.
  const [done] = await db.run(`UPDATE sup_users SET password_hash = :h, password_changed_at = now(), reset_code_hash = NULL, reset_expires = NULL, reset_attempts = 0
    WHERE id = :id AND reset_code_hash = :old RETURNING *`, { h: await bcrypt.hash(password, 12), id: u.id, old: u.reset_code_hash });
  if (!done) throw generic;
  return done;
}

module.exports = { requestReset, resetPassword, sign, verify, setCookie, clearCookie, readCookie, limited, userFromRequest, createUser, login, seedOwner, checkPassword, ROLES, COOKIE };
