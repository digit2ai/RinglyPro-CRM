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

function sign(u) { return jwt.sign({ id: u.id }, SECRET(), { expiresIn: '12h', audience: AUD }); }
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
  const u = await db.one('SELECT id, tenant_id, email, name, role, is_super_admin, active FROM sup_users WHERE id = :id', { id: claims.id });
  return u && u.active ? u : null;
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

module.exports = { sign, verify, setCookie, clearCookie, readCookie, limited, userFromRequest, createUser, login, seedOwner, checkPassword, ROLES, COOKIE };
