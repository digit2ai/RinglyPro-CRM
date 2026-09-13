'use strict';

/**
 * Agent console auth.
 *
 * THE CONSOLE HAS NO DEFAULT PASSWORD AND FAILS SHUT. It holds buyer contact
 * details and consents; with INCENTIVA_OWNER_PASSWORD unset (or no signing
 * secret) every console route answers 503. Passwords that this repository
 * publishes elsewhere are reported as weak on /health.
 *
 * Only an account with a real estate license number can confirm incentives
 * (can_verify). The LLC owner account is an admin without a license: it can
 * run the platform but cannot vouch that an incentive is real.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getMarket } = require('./market');

const COOKIE = 'incentiva_token';
const TTL_SECONDS = 12 * 3600;
const PUBLISHED_PASSWORDS = ['Palindrome@7', 'lawncopilot@2026', 'coachtrack@2026', 'exec@2026', 'defensoresdelapatria@7', 'TunjoRacing2024!'];
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.ZRqk8C5X3E1u0V6Qm9eGbN5X6G3a';

function secret() { return process.env.INCENTIVA_JWT_SECRET || process.env.JWT_SECRET || null; }
function configured() { return !!(secret() && process.env.INCENTIVA_OWNER_PASSWORD); }
function weakPassword() {
  return [process.env.INCENTIVA_OWNER_PASSWORD, process.env.INCENTIVA_AGENT_PASSWORD].filter(Boolean)
    .some((p) => p.length < 12 || PUBLISHED_PASSWORDS.includes(p));
}

async function upsertAccount(tenantId, { email, name, password, role, license_no, title, brokerage_id }) {
  const e = String(email).trim().toLowerCase();
  const row = await db.one('SELECT * FROM nca_users WHERE tenant_id = :t AND email = :e', { t: tenantId, e });
  if (!row) {
    const hash = await bcrypt.hash(password, 10);
    await db.exec(`INSERT INTO nca_users (tenant_id, email, name, password_hash, role, license_no, title, brokerage_id)
      VALUES (:t, :e, :n, :h, :r, :l, :ti, :b)`, { t: tenantId, e, n: name, h: hash, r: role, l: license_no || null, ti: title || null, b: brokerage_id || null });
  } else {
    const same = await bcrypt.compare(password, row.password_hash);
    await db.exec(`UPDATE nca_users SET name = :n, role = :r, license_no = :l, title = :ti, brokerage_id = COALESCE(:b, brokerage_id),
      password_hash = CASE WHEN :same THEN password_hash ELSE :h END, active = true WHERE id = :id`,
    { n: name, r: role, l: license_no || null, ti: title || null, b: brokerage_id || null, same, h: same ? '' : await bcrypt.hash(password, 10), id: row.id });
  }
  return db.one('SELECT * FROM nca_users WHERE tenant_id = :t AND email = :e', { t: tenantId, e });
}

/** Sync the env-configured accounts. Called on boot; safe to repeat. */
async function ensureAccounts(tenantId) {
  if (!configured()) return { owner: null, agent: null };
  const owner = await upsertAccount(tenantId, {
    email: process.env.INCENTIVA_OWNER_EMAIL || 'mstagg@digit2ai.com', name: process.env.INCENTIVA_OWNER_NAME || 'Incentiva Admin',
    password: process.env.INCENTIVA_OWNER_PASSWORD, role: 'admin'
  });
  let agent = null;
  if (process.env.INCENTIVA_AGENT_EMAIL && process.env.INCENTIVA_AGENT_PASSWORD) {
    let brokerageId = null;
    if (process.env.INCENTIVA_BROKERAGE_NAME) {
      const b = await db.one('SELECT id FROM nca_brokerages WHERE tenant_id = :t AND name = :n', { t: tenantId, n: process.env.INCENTIVA_BROKERAGE_NAME });
      if (b) brokerageId = b.id;
      else {
        await db.exec('INSERT INTO nca_brokerages (tenant_id, name, license_no) VALUES (:t, :n, :l)', { t: tenantId, n: process.env.INCENTIVA_BROKERAGE_NAME, l: process.env.INCENTIVA_BROKERAGE_LICENSE || null });
        brokerageId = (await db.one('SELECT id FROM nca_brokerages WHERE tenant_id = :t AND name = :n', { t: tenantId, n: process.env.INCENTIVA_BROKERAGE_NAME })).id;
      }
    }
    agent = await upsertAccount(tenantId, {
      email: process.env.INCENTIVA_AGENT_EMAIL, name: process.env.INCENTIVA_AGENT_NAME || 'Ole',
      password: process.env.INCENTIVA_AGENT_PASSWORD, role: 'agent', license_no: process.env.INCENTIVA_AGENT_LICENSE || null,
      title: process.env.INCENTIVA_AGENT_TITLE || 'Real estate sales associate', brokerage_id: brokerageId
    });
    const market = await getMarket(tenantId);
    const settings = market.settings;
    const coOwner = process.env.INCENTIVA_AGENT_CO_OWNER !== '0';
    const ids = new Set(settings.co_owner_user_ids || []);
    if (coOwner) ids.add(agent.id); else ids.delete(agent.id);
    settings.co_owner_user_ids = [...ids];
    await db.exec(`UPDATE nca_markets SET settings = :s, default_agent_id = COALESCE(default_agent_id, :a), updated_at = now() WHERE id = :id`,
      { s: JSON.stringify(settings), a: agent.id, id: market.id });
  }
  return { owner, agent };
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, license_no: u.license_no || null, can_verify: !!(u.role === 'agent' && u.license_no) };
}

async function login(tenantId, email, password) {
  const e = String(email || '').trim().toLowerCase();
  const u = e ? await db.one('SELECT * FROM nca_users WHERE tenant_id = :t AND email = :e AND active = true', { t: tenantId, e }) : null;
  const ok = await bcrypt.compare(String(password || ''), u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) return null;
  return u;
}

function sign(u) { return jwt.sign({ uid: u.id, tid: u.tenant_id }, secret(), { expiresIn: TTL_SECONDS }); }

function setCookie(res, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function readCookie(req) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Middleware: 503 when closed, 401 when no valid session. Reloads the user every request. */
function requireAgent(tenantId) {
  return async (req, res, next) => {
    if (!configured()) return res.status(503).json({ error: 'Agent console is not configured' });
    const tok = readCookie(req);
    if (!tok) return res.status(401).json({ error: 'Sign in required' });
    try {
      const claims = jwt.verify(tok, secret());
      if (claims.tid !== tenantId) return res.status(401).json({ error: 'Sign in required' });
      const u = await db.one('SELECT * FROM nca_users WHERE id = :id AND tenant_id = :t AND active = true', { id: claims.uid, t: tenantId });
      if (!u) return res.status(401).json({ error: 'Sign in required' });
      req.user = Object.assign(publicUser(u), { tenant_id: u.tenant_id, brokerage_id: u.brokerage_id });
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Sign in required' });
    }
  };
}

module.exports = { configured, weakPassword, ensureAccounts, login, sign, setCookie, readCookie, requireAgent, publicUser, COOKIE, TTL_SECONDS, upsertAccount };
