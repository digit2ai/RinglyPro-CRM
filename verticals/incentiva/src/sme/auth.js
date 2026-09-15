'use strict';

/**
 * SME knowledge capture: accounts, sessions, magic links, CSRF.
 *
 * Invariants (SIT asserts each):
 *  - No public signup. The admin account comes from INCENTIVA_SME_ADMIN_EMAIL + INCENTIVA_SME_ADMIN_PASSWORD
 *    (no defaults); SME accounts are created by an admin. With no admin configured and no accounts the
 *    tool is closed.
 *  - Passwords are bcrypt hashes (cost 12), at least 12 characters. A login compares against a dummy hash
 *    when the email is unknown, so an unknown email is not faster than a wrong password.
 *  - Sessions are server-side: the cookie carries a random token, the database stores only its SHA-256.
 *    A session ends after 24 hours without activity (INCENTIVA_SME_IDLE_HOURS) or on logout / disable.
 *  - Every state-changing API call needs the session's CSRF token in X-CSRF-Token.
 *  - A magic link is single use, valid 30 minutes, stored only as a hash, and requesting one never reveals
 *    whether an email has an account.
 *  - Roles: 'admin' sees everything; 'sme' reads and writes only their own answers.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { audit } = require('../services/util');

const COOKIE = 'bl_sme';
const IDLE_HOURS = () => Number(process.env.INCENTIVA_SME_IDLE_HOURS || 24);
const MAGIC_MINUTES = 30;
const MIN_PASSWORD = 12;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-dummy', 12);

function sha256(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function clean(v) {
  let s = String(v == null ? '' : v).trim();
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) s = s.slice(1, -1).trim();
  return s;
}

function publicUser(u) { return u ? { id: u.id, name: u.name, email: u.email, phone: u.phone || null, role: u.role, language: u.language, status: u.status, last_login_at: u.last_login_at || null } : null; }

/** Create or sync the bootstrap admin from env. Returns the admin row or null when not configured. */
async function ensureAdmin(tenantId) {
  const email = clean(process.env.INCENTIVA_SME_ADMIN_EMAIL).toLowerCase();
  const password = clean(process.env.INCENTIVA_SME_ADMIN_PASSWORD);
  if (!email || !password) return null;
  if (password.length < MIN_PASSWORD) { console.error('[incentiva] SME admin password shorter than 12 characters: admin not created'); return null; }
  const name = clean(process.env.INCENTIVA_SME_ADMIN_NAME) || 'Admin';
  const row = await db.one('SELECT * FROM nca_sme_users WHERE tenant_id = :t AND lower(email) = :e', { t: tenantId, e: email });
  if (!row) {
    const hash = await bcrypt.hash(password, 12);
    const r = await db.exec(`INSERT INTO nca_sme_users (tenant_id, name, email, password_hash, role, language) VALUES (:t, :n, :e, :h, 'admin', 'en')
      ON CONFLICT DO NOTHING RETURNING *`, { t: tenantId, n: name, e: email, h: hash });
    return r[0] || db.one('SELECT * FROM nca_sme_users WHERE tenant_id = :t AND lower(email) = :e', { t: tenantId, e: email });
  }
  const same = row.password_hash ? await bcrypt.compare(password, row.password_hash) : false;
  if (!same || row.role !== 'admin' || row.status !== 'active') {
    await db.exec(`UPDATE nca_sme_users SET password_hash = :h, role = 'admin', status = 'active' WHERE id = :id`, { h: same ? row.password_hash : await bcrypt.hash(password, 12), id: row.id });
    if (!same) await db.exec('UPDATE nca_sme_auth_sessions SET revoked_at = now() WHERE user_id = :id AND revoked_at IS NULL', { id: row.id });
  }
  return db.one('SELECT * FROM nca_sme_users WHERE id = :id', { id: row.id });
}

async function isOpen(tenantId) {
  if (clean(process.env.INCENTIVA_SME_ADMIN_EMAIL) && clean(process.env.INCENTIVA_SME_ADMIN_PASSWORD)) return true;
  return !!(await db.one(`SELECT id FROM nca_sme_users WHERE tenant_id = :t AND status = 'active' LIMIT 1`, { t: tenantId }));
}

async function login(tenantId, email, password) {
  const e = clean(email).toLowerCase();
  const row = e ? await db.one(`SELECT * FROM nca_sme_users WHERE tenant_id = :t AND lower(email) = :e`, { t: tenantId, e }) : null;
  const ok = await bcrypt.compare(String(password || ''), (row && row.password_hash) || DUMMY_HASH);
  if (!row || !ok || row.status !== 'active' || !row.password_hash) return null;
  return row;
}

async function createSession(tenantId, user, { ipHash, userAgent }) {
  const tok = randomToken();
  const csrf = randomToken(24);
  const r = await db.exec(`INSERT INTO nca_sme_auth_sessions (tenant_id, user_id, token_hash, csrf_token, ip_hash, user_agent) VALUES (:t, :u, :h, :c, :ip, :ua) RETURNING id`,
    { t: tenantId, u: user.id, h: sha256(tok), c: csrf, ip: ipHash || null, ua: userAgent ? String(userAgent).slice(0, 300) : null });
  await db.exec('UPDATE nca_sme_users SET last_login_at = now() WHERE id = :id', { id: user.id });
  await db.exec('INSERT INTO nca_sme_sessions_log (tenant_id, user_id, auth_session_id) VALUES (:t, :u, :s)', { t: tenantId, u: user.id, s: r[0].id });
  return tok;
}

function readCookie(req) {
  const raw = String(req.headers.cookie || '');
  const m = raw.split(/;\s*/).find((x) => x.startsWith(COOKIE + '='));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : '';
}
function cookiePath(req) { return (req.baseUrl || '').replace(/\/api$/, ''); }
function setCookie(req, res, token, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=${cookiePath(req)}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

/** Resolve the session from the cookie; slides the idle window. */
async function sessionFrom(tenantId, req) {
  const tok = readCookie(req);
  if (!tok || tok.length < 20) return null;
  // Session columns are aliased: selecting u.* next to s.id would let the user's id overwrite the session id.
  const s = await db.one(`SELECT s.id AS session_id, s.csrf_token, s.last_seen_at AS session_last_seen_at, u.id, u.tenant_id, u.name, u.email, u.phone, u.role, u.language, u.status, u.last_login_at
    FROM nca_sme_auth_sessions s JOIN nca_sme_users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
    WHERE s.tenant_id = :t AND s.token_hash = :h AND s.revoked_at IS NULL AND u.status = 'active'
      AND s.last_seen_at > now() - (:idle || ' hours')::interval`, { t: tenantId, h: sha256(tok), idle: String(IDLE_HOURS()) });
  if (!s) return null;
  if (Date.now() - new Date(s.session_last_seen_at).getTime() > 60e3) {
    await db.exec('UPDATE nca_sme_auth_sessions SET last_seen_at = now() WHERE id = :id', { id: s.session_id });
    await db.exec('UPDATE nca_sme_sessions_log SET ended_at = now() WHERE auth_session_id = :id', { id: s.session_id });
  }
  const user = { id: s.id, tenant_id: s.tenant_id, name: s.name, email: s.email, phone: s.phone, role: s.role, language: s.language, status: s.status, last_login_at: s.last_login_at };
  return { sessionId: s.session_id, csrf: s.csrf_token, user };
}

function requireUser(tenantId, { role } = {}) {
  return async (req, res, next) => {
    try {
      const s = await sessionFrom(tenantId, req);
      if (!s) return res.status(401).json({ error: 'Please sign in.' });
      if (role && s.user.role !== role) return res.status(403).json({ error: 'Not allowed.' });
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const sent = String(req.headers['x-csrf-token'] || '');
        const a = Buffer.from(sent), b = Buffer.from(s.csrf);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: 'Your session expired. Reload the page.' });
      }
      req.sme = s;
      next();
    } catch (e) { next(e); }
  };
}

async function logout(tenantId, req) {
  const tok = readCookie(req);
  if (tok) await db.exec('UPDATE nca_sme_auth_sessions SET revoked_at = now() WHERE tenant_id = :t AND token_hash = :h', { t: tenantId, h: sha256(tok) });
}

async function createMagicLink(tenantId, email) {
  const e = clean(email).toLowerCase();
  const u = e ? await db.one(`SELECT * FROM nca_sme_users WHERE tenant_id = :t AND lower(email) = :e AND status = 'active'`, { t: tenantId, e }) : null;
  if (!u) return null;
  const tok = randomToken();
  const r = await db.exec(`INSERT INTO nca_sme_magic_links (tenant_id, user_id, token_hash, expires_at) VALUES (:t, :u, :h, now() + (:m || ' minutes')::interval) RETURNING id`,
    { t: tenantId, u: u.id, h: sha256(tok), m: String(MAGIC_MINUTES) });
  await audit(tenantId, { type: 'system' }, 'sme.magic_link_created', 'sme_user', u.id, {});
  return { user: u, token: tok, linkId: r[0].id };
}

/** Consume a magic link atomically. Returns the user or null (unknown, expired or already used). */
async function consumeMagicLink(tenantId, token) {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(String(token || ''))) return null;
  const r = await db.exec(`UPDATE nca_sme_magic_links SET used_at = now() WHERE tenant_id = :t AND token_hash = :h AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
    { t: tenantId, h: sha256(token) });
  if (!r.length) return null;
  return db.one(`SELECT * FROM nca_sme_users WHERE id = :id AND tenant_id = :t AND status = 'active'`, { id: r[0].user_id, t: tenantId });
}

async function createUser(tenantId, { name, email, phone, language, role, password }) {
  const e = clean(email).toLowerCase();
  if (!clean(name) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { error: 'Name and a valid email are required.' };
  const r = role === 'admin' ? 'admin' : 'sme';
  const pw = password ? String(password) : null;
  if (pw && pw.length < MIN_PASSWORD) return { error: 'The password must be at least 12 characters.' };
  const generated = pw ? null : randomToken(12);
  const hash = await bcrypt.hash(pw || generated, 12);
  const rows = await db.exec(`INSERT INTO nca_sme_users (tenant_id, name, email, phone, password_hash, role, language) VALUES (:t, :n, :e, :p, :h, :r, :l)
    ON CONFLICT DO NOTHING RETURNING *`, { t: tenantId, n: clean(name).slice(0, 160), e, p: clean(phone).slice(0, 40) || null, h: hash, r, l: language === 'es' ? 'es' : 'en' });
  if (!rows.length) return { error: 'An account with that email already exists.' };
  return { user: rows[0], temporary_password: generated };
}

async function setPassword(tenantId, userId, password) {
  if (!password || String(password).length < MIN_PASSWORD) return { error: 'The password must be at least 12 characters.' };
  await db.exec('UPDATE nca_sme_users SET password_hash = :h WHERE id = :id AND tenant_id = :t', { h: await bcrypt.hash(String(password), 12), id: userId, t: tenantId });
  await db.exec('UPDATE nca_sme_auth_sessions SET revoked_at = now() WHERE user_id = :id AND revoked_at IS NULL', { id: userId });
  return { ok: true };
}

/**
 * Single sign-on from the site gate (owner request 2026-09-15): the owner sign-in maps to an SME admin and an
 * approved preview login to an SME account, created on first visit with no password of its own. A disabled
 * SME account stays disabled.
 */
async function ensureGateUser(tenantId, who) {
  const email = clean(who && who.email).toLowerCase();
  if (!email || !/@/.test(email)) return null;
  const role = who.kind === 'owner' ? 'admin' : 'sme';
  let row = await db.one('SELECT * FROM nca_sme_users WHERE tenant_id = :t AND lower(email) = :e', { t: tenantId, e: email });
  if (!row) {
    const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 160) || 'Expert';
    const r = await db.exec(`INSERT INTO nca_sme_users (tenant_id, name, email, role, language) VALUES (:t, :n, :e, :r, 'en') ON CONFLICT DO NOTHING RETURNING *`, { t: tenantId, n: name, e: email, r: role });
    row = r[0] || await db.one('SELECT * FROM nca_sme_users WHERE tenant_id = :t AND lower(email) = :e', { t: tenantId, e: email });
  }
  if (!row || row.status !== 'active') return null;
  if (role === 'admin' && row.role !== 'admin') { await db.exec(`UPDATE nca_sme_users SET role = 'admin' WHERE id = :id`, { id: row.id }); row.role = 'admin'; }
  return row;
}

module.exports = { ensureGateUser, COOKIE, MIN_PASSWORD, MAGIC_MINUTES, sha256, clean, publicUser, ensureAdmin, isOpen, login, createSession, sessionFrom, requireUser, setCookie, logout, createMagicLink, consumeMagicLink, createUser, setPassword };
