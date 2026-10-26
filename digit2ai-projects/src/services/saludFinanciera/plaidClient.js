'use strict';
/**
 * Plaid client for Salud Financiera — READ-ONLY by construction.
 *
 * - The ONLY endpoints this file can reach are in ALLOWED below. There is no
 *   Auth, Transfer, Identity, Signal, Processor or payment endpoint, and the
 *   SIT greps the vertical to keep it that way. Nothing is written to the bank.
 * - Credentials come from env only (PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV).
 * - Bank access tokens are encrypted with AES-256-GCM (SALUD_FINANCIERA_PLAID_KEY)
 *   and decrypted only inside call(); they are never logged, never returned by a
 *   route, and never handed to Lina or any model tool.
 * - No `plaid` npm dependency: Plaid's API is plain JSON over HTTPS, and one
 *   less dependency is one less thing that can leak or break on Render.
 */
const crypto = require('crypto');

const HOSTS = { sandbox: 'https://sandbox.plaid.com', production: 'https://production.plaid.com' };

const ALLOWED = new Set([
  '/link/token/create',
  '/item/public_token/exchange',
  '/item/get',
  '/item/remove',
  '/accounts/get',
  '/transactions/sync',
  '/transactions/recurring/get',
  '/webhook_verification_key/get',
  // Sandbox-only helpers (refused outside sandbox below)
  '/sandbox/public_token/create',
  '/sandbox/item/fire_webhook',
  '/sandbox/item/reset_login'
]);

// Injected by tests: (path, body) -> response JSON or throws {status, data}
let transport = null;
function setTransport(fn) { transport = fn; }

function env() { return String(process.env.PLAID_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox'; }
function configured() {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET && vaultKey());
}
function missing() {
  const m = [];
  if (!process.env.PLAID_CLIENT_ID) m.push('PLAID_CLIENT_ID');
  if (!process.env.PLAID_SECRET) m.push('PLAID_SECRET');
  if (!vaultKey()) m.push('SALUD_FINANCIERA_PLAID_KEY (32+ caracteres)');
  return m;
}
function webhookUrl() {
  return process.env.PLAID_WEBHOOK_URL || 'https://aiagent.ringlypro.com/projects/api/salud-financiera/plaid/webhook';
}

// ---------------- vault ----------------
function vaultKey() {
  const k = process.env.SALUD_FINANCIERA_PLAID_KEY || '';
  return k.length >= 32 ? crypto.createHash('sha256').update(k).digest() : null;
}
function encrypt(text) {
  const key = vaultKey(); if (!key) throw new Error('SALUD_FINANCIERA_PLAID_KEY no configurada');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}
function decrypt(blob) {
  const key = vaultKey(); if (!key) throw new Error('SALUD_FINANCIERA_PLAID_KEY no configurada');
  const p = String(blob || '').split(':');
  if (p.length !== 4 || p[0] !== 'v1') throw new Error('token guardado ilegible');
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p[1], 'base64'));
    d.setAuthTag(Buffer.from(p[2], 'base64'));
    return Buffer.concat([d.update(Buffer.from(p[3], 'base64')), d.final()]).toString('utf8');
  } catch (e) {
    // a rotated SALUD_FINANCIERA_PLAID_KEY makes stored tokens unreadable: report it as itself
    const err = new Error('El token guardado no se puede leer (¿cambió SALUD_FINANCIERA_PLAID_KEY?). Vuelve a conectar el banco.');
    err.code = 'VAULT_UNREADABLE'; throw err;
  }
}

// ---------------- calls ----------------
class PlaidError extends Error {
  constructor(status, data) {
    super((data && (data.error_message || data.error_code)) || ('Plaid HTTP ' + status));
    this.status = status; this.code = data && data.error_code; this.type = data && data.error_type;
  }
}

/**
 * call(path, body, { accessTokenEnc }) — accessTokenEnc is decrypted here and
 * only here; callers never see the plain token.
 */
async function call(path, body = {}, opts = {}) {
  if (!ALLOWED.has(path)) throw new Error('Plaid endpoint not allowed: ' + path);
  if (path.startsWith('/sandbox/') && env() !== 'sandbox') throw new Error('sandbox endpoint outside sandbox');
  const payload = { ...body };
  if (opts.accessTokenEnc) payload.access_token = decrypt(opts.accessTokenEnc);
  if (transport) return transport(path, payload);
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) throw new Error('Plaid no configurado');
  payload.client_id = process.env.PLAID_CLIENT_ID;
  payload.secret = process.env.PLAID_SECRET;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(HOSTS[env()] + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Plaid-Version': '2020-09-14' }, body: JSON.stringify(payload), signal: ctl.signal });
    let data = {}; try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new PlaidError(r.status, data);
    return data;
  } finally { clearTimeout(timer); }
}

module.exports = { call, encrypt, decrypt, configured, missing, env, webhookUrl, setTransport, PlaidError, ALLOWED };
