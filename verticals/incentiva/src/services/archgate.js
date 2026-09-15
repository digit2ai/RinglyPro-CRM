'use strict';

/**
 * Sign-in gate for the architecture page (/architecture).
 *
 * THE CREDENTIAL HAS NO DEFAULT AND FAILS SHUT: with INCENTIVA_ARCHITECTURE_USER or
 * INCENTIVA_ARCHITECTURE_PASSWORD unset the page answers 503, never open. The page file lives in
 * src/views, outside the public static folder, so it cannot be fetched around the gate.
 * Compares run over SHA-256 digests with timingSafeEqual (equal lengths), and both the user and the
 * password compare always run. The user is matched case-insensitively; the password is not.
 * The session cookie is an HMAC of (user, expiry) keyed with the app secret AND the current password,
 * so changing the password on Render signs every session out.
 */

const crypto = require('crypto');

const COOKIE = 'bl_arch';
const TTL_MS = 12 * 3600e3;

// A value pasted into Render often carries a stray space, a newline or wrapping quotes; none of those can be
// part of the intended credential, so they are removed from the stored value and from what is typed.
function clean(v) {
  let s = String(v == null ? '' : v).trim();
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) s = s.slice(1, -1).trim();
  return s;
}
function creds() {
  const user = clean(process.env.INCENTIVA_ARCHITECTURE_USER);
  const password = clean(process.env.INCENTIVA_ARCHITECTURE_PASSWORD);
  return user && password ? { user, password } : null;
}
function configured() { return !!creds(); }
function weak() {
  const c = creds();
  if (!c) return null;
  const { PUBLISHED_PASSWORDS = [] } = require('./auth');
  return c.password.length < 12 || PUBLISHED_PASSWORDS.includes(c.password);
}

function digest(v) { return crypto.createHash('sha256').update(String(v)).digest(); }
function safeEqual(a, b) { return crypto.timingSafeEqual(digest(a), digest(b)); }

function check(user, password) {
  const c = creds();
  if (!c) return false;
  const u = safeEqual(clean(user).toLowerCase(), c.user.toLowerCase());
  const p = safeEqual(clean(password), c.password);
  return u && p;
}

function key() {
  const c = creds();
  return crypto.createHash('sha256').update((process.env.INCENTIVA_JWT_SECRET || process.env.JWT_SECRET || 'buyersline-architecture') + '|' + (c ? c.user.toLowerCase() + '|' + c.password : '')).digest();
}
function sign(expires) {
  const payload = String(expires);
  return payload + '.' + crypto.createHmac('sha256', key()).update(payload).digest('base64url');
}
function readCookie(req) {
  const raw = String(req.headers.cookie || '');
  const m = raw.split(/;\s*/).find((x) => x.startsWith(COOKIE + '='));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : '';
}
function valid(req) {
  if (!configured()) return false;
  const v = readCookie(req);
  const i = v.indexOf('.');
  if (i < 1) return false;
  const payload = v.slice(0, i), sig = v.slice(i + 1);
  const expected = crypto.createHmac('sha256', key()).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(payload) > Date.now();
}
function setCookie(req, res, value, maxAgeMs) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=${req.baseUrl || ''}/architecture; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`);
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function page(base, title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · BuyersLine</title><link rel="icon" href="${esc(base)}/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700&family=Mulish:wght@400;700;900&display=swap">
<style>
*{box-sizing:border-box}html,body{margin:0;background:#0E0C1F;color:#ECEAF6;font:400 16px/1.55 Mulish,system-ui,sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.card{width:100%;max-width:400px;border:1px solid rgba(252,76,2,.45);border-radius:18px;padding:28px;background:linear-gradient(180deg,#221B3F,#15122D);box-shadow:0 0 3em rgba(252,76,2,.18)}
.eye{font:700 12px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:#FF7A3D;margin:0}
h1{font-weight:900;font-size:28px;margin:8px 0 18px;line-height:1.15}
label{display:block;font:700 11px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#A6A3BD;margin:14px 0 6px}
input{width:100%;font:inherit;color:#ECEAF6;background:#0E0C1F;border:1px solid rgba(166,163,189,.35);border-radius:10px;padding:12px;min-height:44px}
input:focus-visible,button:focus-visible{outline:2px solid #FC4C02;outline-offset:2px}
button{margin-top:20px;width:100%;min-height:46px;font:800 16px/1 Mulish,system-ui,sans-serif;color:#fff;background:#FC4C02;border:0;border-radius:40px;cursor:pointer}
.err{margin:14px 0 0;color:#F09590}.muted{color:#A6A3BD;font-size:14px;margin:14px 0 0}a{color:#5CC8E6}
</style></head><body><main>${inner}</main></body></html>`;
}

function loginPage(base, error) {
  return page(base, 'Architecture sign in', `<form class="card" method="post" action="${esc(base)}/architecture/login" novalidate>
<p class="eye">BuyersLine · Architecture</p><h1>Sign in</h1>
<label for="arch_user">User ID</label><input id="arch_user" name="user" autocomplete="username" required autofocus>
<label for="arch_pass">Password</label><input id="arch_pass" name="password" type="password" autocomplete="current-password" required>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}<button type="submit">Sign in</button>
<p class="muted"><a href="${esc(base)}/">Back to BuyersLine</a></p></form>`);
}
function closedPage(base) {
  return page(base, 'Architecture closed', `<div class="card"><p class="eye">BuyersLine · Architecture</p><h1>This page is closed</h1>
<p class="muted">It opens once its sign-in is configured on the server.</p><p class="muted"><a href="${esc(base)}/">Back to BuyersLine</a></p></div>`);
}

module.exports = { clean, COOKIE, TTL_MS, configured, weak, check, sign, valid, setCookie, loginPage, closedPage };
