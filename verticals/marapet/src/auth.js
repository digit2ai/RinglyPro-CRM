'use strict';
/**
 * Owner accounts. Email + password, bcrypt cost 12, signed cookie session.
 *
 * tenant_id IS the account id (self-tenant), set at signup and never read from
 * a request body afterwards. The session is re-checked against the database on
 * every request, so an account deleted today loses access today rather than
 * when its 30-day token happens to expire.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const dbm = require('./db');

const COOKIE = 'marapet_session';
const TTL_DAYS = 30;

// Passwords this repository publishes. It is public, so a value from it is not
// a secret, and the gate must refuse it rather than read as configured.
const PUBLISHED = new Set([
  'palindrome@7', 'lawncopilot@2026', 'coachtrack@2026', 'exec@2026',
  'tunjoracing2024!', 'defensoresdelapatria@7', 'digit2ai@7', 'marapet@2026'
]);

function secret() {
  return process.env.MARAPET_SESSION_SECRET || process.env.JWT_SECRET || '';
}
function configured() {
  return secret().length >= 16;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const mac = token.slice(i + 1);
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (_) { return null; }
  if (!payload || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'password_too_short';
  if (PUBLISHED.has(pw.toLowerCase())) return 'password_is_published';
  return null;
}

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}
function emailProblem(e) {
  const v = normalizeEmail(e);
  if (v.length < 5 || v.length > 200) return 'email_invalid';
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(v)) return 'email_invalid';
  return null;
}

async function signup({ email, password, name, lang }) {
  const ep = emailProblem(email); if (ep) return { error: ep };
  const pp = passwordProblem(password); if (pp) return { error: pp };
  const e = normalizeEmail(email);
  const existing = await dbm.one('SELECT id FROM mp_accounts WHERE lower(email) = :e', { e });
  if (existing) return { error: 'email_taken' };

  const hash = await bcrypt.hash(password, 12);

  // ONE STATEMENT, BECAUSE tenant_id IS THE ONLY ISOLATION BOUNDARY HERE.
  // The first version inserted with a literal 0 and then UPDATEd it to the row's
  // own id. Those are two statements with no transaction, so a connection reset,
  // a pool timeout, a failover or the process dying between them left a usable
  // account permanently at tenant_id = 0 — and 0 is a REAL, SHARED tenant, so
  // the second such account would read and write the first one's dogs. It fails
  // OPEN into a shared bucket, which is the worst available direction.
  // Taking the sequence value first makes the id and the tenant the same number
  // in one atomic insert, so the placeholder never exists at any instant.
  const rows = await dbm.run(
    `WITH new_id AS (SELECT nextval(pg_get_serial_sequence('mp_accounts','id')) AS id)
     INSERT INTO mp_accounts (id, tenant_id, email, password_hash, name, lang)
     SELECT id, id, :email, :hash, :name, :lang FROM new_id
     RETURNING id`,
    {
      email: e, hash,
      // String() and not (name || ''): a non-string name threw a TypeError
      // inside an async handler, which Express 4 cannot catch and which
      // src/server.js escalates to process.exit — taking down the whole CRM.
      name: String(name == null ? '' : name).slice(0, 120) || null,
      lang: lang === 'es' ? 'es' : 'en'
    }
  );
  const id = rows[0].id;
  await dbm.event(id, id, 'account.created', {});
  return { account: { id, tenant_id: id, email: e, name: name || null, lang: lang === 'es' ? 'es' : 'en' } };
}

async function login({ email, password }) {
  const e = normalizeEmail(email);
  const row = await dbm.one(
    'SELECT id, tenant_id, email, password_hash, name, lang FROM mp_accounts WHERE lower(email) = :e',
    { e }
  );
  // Always run a compare so an unknown address is not measurably faster.
  const hash = row ? row.password_hash : '$2a$12$0000000000000000000000000000000000000000000000000000';
  let ok = false;
  try { ok = await bcrypt.compare(String(password || ''), hash); } catch (_) { ok = false; }
  if (!row || !ok) return { error: 'bad_credentials' };
  await dbm.run('UPDATE mp_accounts SET last_login_at = NOW() WHERE id = :id', { id: row.id });
  return { account: { id: row.id, tenant_id: row.tenant_id, email: row.email, name: row.name, lang: row.lang } };
}

function setCookie(res, account, base) {
  const token = sign({
    sub: account.id,
    exp: Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000,
    aud: 'marapet'
  });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: base && base !== '' ? base + '/' : '/',
    maxAge: TTL_DAYS * 24 * 60 * 60 * 1000
  });
}

function clearCookie(res, base) {
  res.clearCookie(COOKIE, { path: base && base !== '' ? base + '/' : '/' });
}

/**
 * Read our cookie out of the raw header. This repo has no cookie-parser
 * dependency and the verticals each parse the header themselves; adding one
 * for a single cookie would widen the dependency surface of the whole CRM.
 * res.cookie() is core Express and needs no parser.
 */
function readCookie(req) {
  const raw = String((req && req.headers && req.headers.cookie) || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== COOKIE) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); } catch (_) { return part.slice(i + 1).trim(); }
  }
  return null;
}

/** The signed-in account, or null. Never throws. */
async function current(req) {
  if (!configured()) return null;
  const payload = verifyToken(readCookie(req));
  if (!payload || payload.aud !== 'marapet') return null;
  const row = await dbm.one(
    'SELECT id, tenant_id, email, name, lang FROM mp_accounts WHERE id = :id',
    { id: payload.sub }
  );
  // FAIL CLOSED on a row whose tenant is not its own id. The schema now has a
  // CHECK that makes this unreachable, but a row written before that constraint
  // existed would otherwise hand its holder a shared tenant. Refusing the
  // session is recoverable; serving someone else's dog is not.
  if (!row || row.tenant_id !== row.id) return null;
  return row;
}

/** Express middleware: resolves req.mp = {id, tenant_id, email, name, lang} or 401. */
function required() {
  return async (req, res, next) => {
    if (!configured()) {
      return res.status(503).json({ error: 'sessions_not_configured',
        detail: 'Set MARAPET_SESSION_SECRET (16+ chars) on the service.' });
    }
    // Re-read from the database on every request, never trust the token beyond
    // the id: an account removed today loses access today, not in 30 days.
    const row = await current(req);
    if (!row) return res.status(401).json({ error: 'not_signed_in' });
    req.mp = row;
    next();
  };
}

module.exports = {
  COOKIE, configured, sign, verifyToken, readCookie, current,
  passwordProblem, emailProblem, normalizeEmail,
  signup, login, setCookie, clearCookie, required, PUBLISHED
};
