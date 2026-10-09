'use strict';
/**
 * Acceso sin contraseña: código de seis dígitos y enlace, enviados al correo.
 *
 *  - El código y el enlace se guardan solo como hash, vencen a los 10 minutos
 *    y sirven una vez. Cinco intentos fallidos anulan el código.
 *  - El número de miembro se asigna al VERIFICAR el correo, dentro de una
 *    transacción que bloquea la fila del contador: consecutivo y sin huecos.
 *  - El administrador es una fila en vm_admins que apunta al id de la cuenta.
 *    Se relee en cada petición.
 *  - Pedir un código nunca revela si el correo existe.
 */
const crypto = require('crypto');
const { q, one, run, db, TENANT, secret, sha, hmac, ipHash, audit } = require('./db');
const mail = require('./mail');

const CONSENT_VERSION = 'vm-2026-10';
const CONSENT_TEXT = 'Autorizo a la Asociación Valle Milagro a tratar mis datos personales (nombre, apellido y correo electrónico) para crear y administrar mi cuenta en el Portal de Miembros, conforme a la Ley 1581 de 2012 y al aviso de privacidad.';
const CODE_MIN = 10;
const SESSION_DAYS = 90;
const FOUNDER = () => String(process.env.VALLEMILAGRO_FOUNDER_EMAIL || 'eduardo.delima@delima.com.co').trim().toLowerCase();

const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{M}' .-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const memberCode = (n) => (n == null ? null : 'VM-' + String(n).padStart(4, '0'));

/* ---- límite simple en memoria, por instancia ---- */
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const k of hits.keys()) { hits.delete(k); if (hits.size < 2500) break; }
  return false;
}

function configured() { return secret().length >= 16; }

/** Siembra al fundador como VM-0001 y administrador. Idempotente. */
async function seedFounder(tenantId = TENANT()) {
  const email = FOUNDER();
  if (!validEmail(email)) return;
  await run(`INSERT INTO vm_counters (tenant_id, name, value) VALUES (:t, 'member_no', 1)
             ON CONFLICT (tenant_id, name) DO NOTHING`, { t: tenantId });
  const existing = await one('SELECT id FROM vm_members WHERE tenant_id = :t AND member_no = 1', { t: tenantId });
  let id = existing && existing.id;
  if (!id) {
    const byMail = await one('SELECT id, member_no FROM vm_members WHERE tenant_id = :t AND email = :e', { t: tenantId, e: email });
    if (byMail && byMail.member_no == null) {
      await run('UPDATE vm_members SET member_no = 1, is_founder = TRUE WHERE id = :id', { id: byMail.id });
      id = byMail.id;
    } else if (!byMail) {
      const rows = await run(`INSERT INTO vm_members (tenant_id, member_no, first_name, last_name, email, is_founder, status)
        VALUES (:t, 1, 'Eduardo', 'de Lima', :e, TRUE, 'pending') RETURNING id`, { t: tenantId, e: email });
      id = rows[0] && rows[0].id;
    }
  }
  const anyAdmin = await one('SELECT member_id FROM vm_admins WHERE tenant_id = :t LIMIT 1', { t: tenantId });
  if (!anyAdmin && id) {
    await run('INSERT INTO vm_admins (tenant_id, member_id) VALUES (:t, :m) ON CONFLICT DO NOTHING', { t: tenantId, m: id });
  }
}

async function issueCode(tenantId, email, req, base) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const token = crypto.randomBytes(32).toString('hex');
  await run('UPDATE vm_login_codes SET used_at = NOW() WHERE tenant_id = :t AND email = :e AND used_at IS NULL', { t: tenantId, e: email });
  await run(`INSERT INTO vm_login_codes (tenant_id, email, code_hash, link_hash, expires_at, ip_hash)
             VALUES (:t, :e, :c, :l, NOW() + INTERVAL '${CODE_MIN} minutes', :ip)`,
    { t: tenantId, e: email, c: hmac('code:' + email + ':' + code), l: sha(token), ip: ipHash(req) });
  const publicUrl = String(process.env.VALLEMILAGRO_PUBLIC_URL || 'https://aiagent.ringlypro.com/vallemilagro').replace(/\/+$/, '');
  return mail.sendCode({ to: email, code, link: publicUrl + '/entrar?t=' + token, minutes: CODE_MIN });
}

async function register(req, body, tenantId = TENANT()) {
  if (!configured()) return { status: 503, body: { error: 'closed', message: 'El ingreso no está configurado.' } };
  const email = normEmail(body.email);
  const first = cleanName(body.first_name), last = cleanName(body.last_name);
  if (!first || !last) return { status: 400, body: { error: 'name', message: 'Escribe tu nombre y tu apellido.' } };
  if (!validEmail(email)) return { status: 400, body: { error: 'email', message: 'Escribe un correo válido.' } };
  if (body.consent !== true) return { status: 400, body: { error: 'consent', message: 'Debes autorizar el tratamiento de tus datos para crear tu portal.' } };
  if (limited('reg-ip:' + ipHash(req), 8, 3600e3) || limited('reg:' + email, 4, 900e3)) return { status: 429, body: { error: 'rate', message: 'Demasiados intentos. Espera unos minutos.' } };

  let m = await one('SELECT id, status FROM vm_members WHERE tenant_id = :t AND email = :e', { t: tenantId, e: email });
  if (!m) {
    if (String(process.env.VALLEMILAGRO_SIGNUP || 'open') === 'closed') {
      return { status: 200, body: { ok: true, sent: true } }; // misma respuesta: no revela nada
    }
    const rows = await run(`INSERT INTO vm_members (tenant_id, first_name, last_name, email, status)
      VALUES (:t, :f, :l, :e, 'pending') ON CONFLICT (tenant_id, email) DO NOTHING RETURNING id, status`, { t: tenantId, f: first, l: last, e: email });
    m = rows[0] || await one('SELECT id, status FROM vm_members WHERE tenant_id = :t AND email = :e', { t: tenantId, e: email });
  } else if (m.status === 'pending') {
    await run('UPDATE vm_members SET first_name = :f, last_name = :l WHERE id = :id AND email_verified_at IS NULL', { f: first, l: last, id: m.id });
  }
  if (m && m.status !== 'deleted') {
    await run('INSERT INTO vm_consents (tenant_id, member_id, version, text, ip_hash) VALUES (:t, :m, :v, :x, :ip)',
      { t: tenantId, m: m.id, v: CONSENT_VERSION, x: CONSENT_TEXT, ip: ipHash(req) });
    const sent = await issueCode(tenantId, email, req);
    if (!sent.sent) return { status: 502, body: { error: 'mail', message: 'No pudimos enviar el código a tu correo. Intenta de nuevo en unos minutos.' } };
  }
  return { status: 200, body: { ok: true, sent: true } };
}

async function requestCode(req, body, tenantId = TENANT()) {
  if (!configured()) return { status: 503, body: { error: 'closed', message: 'El ingreso no está configurado.' } };
  const email = normEmail(body.email);
  if (!validEmail(email)) return { status: 400, body: { error: 'email', message: 'Escribe un correo válido.' } };
  if (limited('code-ip:' + ipHash(req), 12, 3600e3) || limited('code:' + email, 4, 900e3)) return { status: 429, body: { error: 'rate', message: 'Demasiados intentos. Espera unos minutos.' } };
  const m = await one("SELECT id FROM vm_members WHERE tenant_id = :t AND email = :e AND status <> 'deleted'", { t: tenantId, e: email });
  if (m) {
    const sent = await issueCode(tenantId, email, req);
    if (!sent.sent) return { status: 502, body: { error: 'mail', message: 'No pudimos enviar el código a tu correo. Intenta de nuevo en unos minutos.' } };
  }
  return { status: 200, body: { ok: true, sent: true } };
}

/** Consume un código o un enlace y abre la sesión. */
async function verify(req, body, tenantId = TENANT()) {
  if (!configured()) return { status: 503, body: { error: 'closed' } };
  const bad = { status: 400, body: { error: 'invalid', message: 'El código no es válido o ya venció. Pide uno nuevo.' } };
  if (limited('ver-ip:' + ipHash(req), 30, 900e3)) return { status: 429, body: { error: 'rate', message: 'Demasiados intentos. Espera unos minutos.' } };
  let row = null, email = null;
  if (body.token) {
    const tok = String(body.token);
    if (!/^[a-f0-9]{64}$/.test(tok)) return bad;
    row = await one('SELECT * FROM vm_login_codes WHERE tenant_id = :t AND link_hash = :l AND used_at IS NULL AND expires_at > NOW()', { t: tenantId, l: sha(tok) });
    if (!row) return bad;
    email = row.email;
  } else {
    email = normEmail(body.email);
    const code = String(body.code || '').replace(/\D/g, '');
    if (!validEmail(email) || code.length !== 6) return bad;
    row = await one('SELECT * FROM vm_login_codes WHERE tenant_id = :t AND email = :e AND used_at IS NULL AND expires_at > NOW() ORDER BY id DESC LIMIT 1', { t: tenantId, e: email });
    if (!row) return bad;
    if (row.attempts >= 5) { await run('UPDATE vm_login_codes SET used_at = NOW() WHERE id = :id', { id: row.id }); return bad; }
    const want = Buffer.from(row.code_hash), got = Buffer.from(hmac('code:' + email + ':' + code));
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
      await run('UPDATE vm_login_codes SET attempts = attempts + 1 WHERE id = :id', { id: row.id });
      return bad;
    }
  }
  // Uso único: solo gana quien logra marcarlo.
  const claimed = await run('UPDATE vm_login_codes SET used_at = NOW() WHERE id = :id AND used_at IS NULL RETURNING id', { id: row.id });
  if (!claimed.length) return bad;

  const t = await db().transaction();
  let member;
  try {
    const opts = { transaction: t };
    member = (await run("SELECT * FROM vm_members WHERE tenant_id = :t AND email = :e AND status <> 'deleted' FOR UPDATE", { t: tenantId, e: email }, opts))[0];
    if (!member) { await t.rollback(); return bad; }
    if (member.member_no == null) {
      await run(`INSERT INTO vm_counters (tenant_id, name, value) VALUES (:t, 'member_no', 1) ON CONFLICT (tenant_id, name) DO NOTHING`, { t: tenantId }, opts);
      const c = await run("UPDATE vm_counters SET value = value + 1 WHERE tenant_id = :t AND name = 'member_no' RETURNING value", { t: tenantId }, opts);
      member.member_no = c[0].value;
    }
    await run(`UPDATE vm_members SET member_no = :n, status = 'active',
                 email_verified_at = COALESCE(email_verified_at, NOW()), joined_at = COALESCE(joined_at, NOW())
               WHERE id = :id`, { n: member.member_no, id: member.id }, opts);
    await t.commit();
  } catch (e) { await t.rollback(); throw e; }

  const token = crypto.randomBytes(32).toString('hex');
  await run(`INSERT INTO vm_sessions (tenant_id, token_hash, member_id, expires_at)
             VALUES (:t, :h, :m, NOW() + INTERVAL '${SESSION_DAYS} days')`, { t: tenantId, h: sha(token), m: member.id });
  await audit(tenantId, member.id, 'auth.login', member.id);
  return { status: 200, body: { ok: true }, token };
}

/* ---- cookie ---- */
function readCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setCookie(req, res, token) {
  const secure = process.env.NODE_ENV === 'production' || req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
  const base = (req.vmBase != null ? req.vmBase : (req.baseUrl || '')) + '/';
  const parts = ['vm_session=' + (token || ''), 'Path=' + base, 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  parts.push(token ? 'Max-Age=' + SESSION_DAYS * 86400 : 'Max-Age=0');
  res.append('Set-Cookie', parts.join('; '));
}

async function loadSession(req, tenantId = TENANT()) {
  const token = readCookie(req, 'vm_session');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await one(`SELECT s.id AS session_id, m.id, m.member_no, m.first_name, m.last_name, m.email, m.joined_at,
                                m.dues_status, m.is_founder, m.tenant_id,
                                (SELECT 1 FROM vm_admins a WHERE a.tenant_id = m.tenant_id AND a.member_id = m.id) AS is_admin
                         FROM vm_sessions s JOIN vm_members m ON m.id = s.member_id AND m.tenant_id = s.tenant_id
                         WHERE s.tenant_id = :t AND s.token_hash = :h AND s.revoked_at IS NULL AND s.expires_at > NOW()
                           AND m.status = 'active'`, { t: tenantId, h: sha(token) });
  if (!row) return null;
  run(`UPDATE vm_sessions SET last_seen_at = NOW(), expires_at = NOW() + INTERVAL '${SESSION_DAYS} days'
       WHERE id = :id AND last_seen_at < NOW() - INTERVAL '1 hour'`, { id: row.session_id }).catch(() => {});
  row.is_admin = !!row.is_admin;
  row.code = memberCode(row.member_no);
  return row;
}

async function logout(req, res, tenantId = TENANT()) {
  const token = readCookie(req, 'vm_session');
  if (token) await run('UPDATE vm_sessions SET revoked_at = NOW() WHERE tenant_id = :t AND token_hash = :h', { t: tenantId, h: sha(token) });
  setCookie(req, res, null);
}

/* ---- middlewares ---- */
function requireMember(req, res, next) {
  loadSession(req).then((m) => {
    if (!m) return res.status(401).json({ error: 'auth', message: 'Inicia sesión.' });
    req.member = m; next();
  }).catch(next);
}
/** Quien no es administrador recibe 404: un 403 confirma que ahí hay algo. */
function requireAdmin(req, res, next) {
  loadSession(req).then((m) => {
    if (!m || !m.is_admin) return res.status(404).json({ error: 'not_found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers['x-vm-admin'] !== '1') return res.status(404).json({ error: 'not_found' });
      const origin = req.headers.origin;
      if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(404).json({ error: 'not_found' }); } catch (e) { return res.status(404).json({ error: 'not_found' }); } }
    }
    req.member = m; next();
  }).catch(next);
}
/** Las escrituras del portal exigen la cabecera propia y el mismo origen. */
function sameOrigin(req, res, next) {
  if (req.headers['x-vm'] !== '1') return res.status(400).json({ error: 'bad_request' });
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return res.status(400).json({ error: 'bad_request' }); } catch (e) { return res.status(400).json({ error: 'bad_request' }); } }
  next();
}

module.exports = { register, requestCode, verify, loadSession, logout, setCookie, requireMember, requireAdmin, sameOrigin,
  seedFounder, configured, limited, memberCode, cleanName, CONSENT_TEXT, CONSENT_VERSION, FOUNDER };
