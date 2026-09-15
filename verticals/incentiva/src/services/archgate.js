'use strict';

/**
 * Sign-in gate for the whole BuyersLine site while it is not public (owner request 2026-09-15), and always
 * for the architecture page. INCENTIVA_SITE_GATE=off opens the site; the architecture page stays gated.
 *
 * Two kinds of people pass it:
 *  - the OWNER: INCENTIVA_ARCHITECTURE_USER / INCENTIVA_ARCHITECTURE_PASSWORD on Render. No default; with
 *    either unset the gate answers 503 and nobody can sign in, not even an approved account (fails shut).
 *  - PREVIEW ACCOUNTS (nca_site_users): anyone may create one with an email and a password typed twice
 *    (the maker). It stays PENDING and cannot sign in until the owner approves it (the checker) on
 *    /gate/accounts. Only the owner credential can approve; an approved account cannot approve anyone.
 *    Forgot password emails a link through the existing SendGrid sender (notify.js). The reset token is
 *    signed with the app secret AND the account's current password hash, so it works once, expires in
 *    one hour, and needs no table.
 *
 * Owner compares run over SHA-256 digests with timingSafeEqual and always check both fields. The cookie is
 * `<kind>.<id>.<expiry>.<hmac>`; the owner's is keyed with the owner credential and an account's with its
 * password hash, so changing either password signs that person out everywhere.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const COOKIE = 'bl_arch';
const TTL_MS = 12 * 3600e3;
const MIN_PASSWORD = 12;
const RESET_TTL_MS = 3600e3;
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5zG6bPnrC4hNGnK9pwmOn5JtC5jRg6i';

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
function secret() { return process.env.INCENTIVA_JWT_SECRET || process.env.JWT_SECRET || 'buyersline-architecture'; }

function digest(v) { return crypto.createHash('sha256').update(String(v)).digest(); }
function safeEqual(a, b) { return crypto.timingSafeEqual(digest(a), digest(b)); }

/** The owner credential. The user field may be an email or the plain user ID set on Render. */
function check(user, password) {
  const c = creds();
  if (!c) return false;
  const u = safeEqual(clean(user).toLowerCase(), c.user.toLowerCase());
  const p = safeEqual(clean(password), c.password);
  return u && p;
}

function ownerKey() {
  const c = creds();
  return crypto.createHash('sha256').update(secret() + '|' + (c ? c.user.toLowerCase() + '|' + c.password : '')).digest();
}
function accountKey(passwordHash) { return crypto.createHash('sha256').update(secret() + '|site-user|' + String(passwordHash)).digest(); }
function hmac(key, payload) { return crypto.createHmac('sha256', key).update(payload).digest('base64url'); }

/** Owner session value (kept as sign(expires) for callers that predate accounts). */
function sign(expires) { const payload = 'o.0.' + String(expires); return payload + '.' + hmac(ownerKey(), payload); }
function signAccount(user, expires) { const payload = 'u.' + user.id + '.' + String(expires); return payload + '.' + hmac(accountKey(user.password_hash), payload); }

function readCookie(req) {
  const raw = String(req.headers.cookie || '');
  const m = raw.split(/;\s*/).find((x) => x.startsWith(COOKIE + '='));
  return m ? decodeURIComponent(m.slice(COOKIE.length + 1)) : '';
}
function sigOk(sig, expected) { return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
function parts(v) {
  const bits = String(v || '').split('.');
  if (bits.length !== 4 || !['o', 'u'].includes(bits[0]) || !/^\d{1,10}$/.test(bits[1]) || !/^\d{10,16}$/.test(bits[2])) return null;
  return { kind: bits[0], id: Number(bits[1]), expires: Number(bits[2]), payload: bits.slice(0, 3).join('.'), sig: bits[3] };
}

/** Owner session only, synchronous. */
function valid(req) {
  if (!configured()) return false;
  const p = parts(readCookie(req));
  if (!p || p.kind !== 'o' || p.expires <= Date.now()) return false;
  return sigOk(p.sig, hmac(ownerKey(), p.payload));
}

/** Who is signed in: { kind:'owner' } or { kind:'account', user }, else null. */
async function identify(req, tenantId) {
  if (!configured()) return null;
  const p = parts(readCookie(req));
  if (!p || p.expires <= Date.now()) return null;
  if (p.kind === 'o') return sigOk(p.sig, hmac(ownerKey(), p.payload)) ? { kind: 'owner', email: ownerEmail() } : null;
  const u = await db.one(`SELECT id, email, password_hash, status FROM nca_site_users WHERE id = :id AND tenant_id = :t`, { id: p.id, t: tenantId });
  if (!u || u.status !== 'approved' || !sigOk(p.sig, hmac(accountKey(u.password_hash), p.payload))) return null;
  return { kind: 'account', user: { id: u.id, email: u.email }, email: u.email };
}
function ownerEmail() {
  const c = creds();
  const u = c ? c.user.toLowerCase() : '';
  return /@/.test(u) ? u : clean(process.env.INCENTIVA_OWNER_EMAIL || 'mstagg@digit2ai.com').toLowerCase();
}

function setCookie(req, res, value, maxAgeMs) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const base = req.baseUrl || '';
  const cookies = [`${COOKIE}=${encodeURIComponent(value)}; Path=${base}/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`];
  // The first version scoped the cookie to /architecture; clear that one so it cannot shadow the site cookie.
  cookies.push(`${COOKIE}=; Path=${base}/architecture; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  res.setHeader('Set-Cookie', cookies);
}
// The website is PUBLIC by default (owner decision 2026-09-15): only the Log in link, the dashboard and the architecture
// page need a sign-in. INCENTIVA_SITE_GATE=on puts the whole site back behind the sign-in.
function siteGateOn() { return process.env.INCENTIVA_SITE_GATE === 'on'; }
/** A post-login destination: only a path inside this mount, never another host or a protocol-relative URL. */
function safeNext(base, next) {
  const n = String(next || '');
  const root = (base || '') + '/';
  if (!n.startsWith(root) || n.startsWith('//') || /[\\\r\n]/.test(n) || n.includes('/../') || n.length > 500) return root;
  return n;
}

/* ---------- accounts ---------- */

function validEmail(e) { return /^[^@\s]{1,100}@[^@\s]{1,100}\.[^@\s]{2,40}$/.test(e); }
function passwordProblem(pw, confirm) {
  const { PUBLISHED_PASSWORDS = [] } = require('./auth');
  if (!pw || pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 200) return 'That password is too long.';
  if (PUBLISHED_PASSWORDS.includes(pw)) return 'That password is published. Choose another.';
  if (confirm !== undefined && pw !== confirm) return "The passwords don't match.";
  return null;
}

/** Sign in with an email (or the owner user ID) and a password. */
async function authenticate(tenantId, login, password) {
  if (!configured()) return { error: 'closed' };
  if (check(login, password)) return { kind: 'owner' };
  const email = clean(login).toLowerCase();
  const u = validEmail(email) ? await db.one('SELECT * FROM nca_site_users WHERE tenant_id = :t AND LOWER(email) = :e', { t: tenantId, e: email }) : null;
  const ok = await bcrypt.compare(String(password || ''), (u && u.password_hash) || DUMMY_HASH);
  if (!u || !ok) return { error: 'invalid' };
  if (u.status === 'pending') return { error: 'pending' };
  if (u.status !== 'approved') return { error: 'invalid' };
  await db.exec('UPDATE nca_site_users SET last_login_at = now() WHERE id = :id', { id: u.id });
  return { kind: 'account', user: u };
}

async function createAccount(tenantId, email, password, confirm) {
  const e = clean(email).toLowerCase();
  if (!validEmail(e)) return { error: 'Enter a valid email address.' };
  const problem = passwordProblem(String(password || ''), String(confirm || ''));
  if (problem) return { error: problem };
  const hash = await bcrypt.hash(String(password), 12);
  const rows = await db.exec(`INSERT INTO nca_site_users (tenant_id, email, password_hash) VALUES (:t, :e, :h) ON CONFLICT DO NOTHING RETURNING id, email, status`, { t: tenantId, e, h: hash });
  // An existing email gets the same answer as a new one, so the form cannot be used to find accounts.
  return { ok: true, created: rows[0] || null };
}

async function listAccounts(tenantId) {
  return db.q(`SELECT id, email, status, decided_by, decided_at, last_login_at, created_at FROM nca_site_users WHERE tenant_id = :t ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 500`, { t: tenantId });
}
async function decide(tenantId, id, decision, by) {
  const status = { approve: 'approved', reject: 'rejected', disable: 'disabled' }[decision];
  if (!status) return null;
  const rows = await db.exec(`UPDATE nca_site_users SET status = :s, decided_by = :by, decided_at = now(), updated_at = now() WHERE id = :id AND tenant_id = :t RETURNING id, email, status`, { s: status, by, id: Number(id) || 0, t: tenantId });
  return rows[0] || null;
}

function resetToken(user, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: user.id, e: now + RESET_TTL_MS })).toString('base64url');
  return payload + '.' + hmac(accountKey('reset|' + user.password_hash), payload);
}
async function readResetToken(tenantId, tok) {
  const [payload, sig] = String(tok || '').split('.');
  if (!payload || !sig || payload.length > 200) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!data || !Number.isInteger(data.u) || !(data.e > Date.now())) return null;
  const u = await db.one(`SELECT * FROM nca_site_users WHERE id = :id AND tenant_id = :t AND status = 'approved'`, { id: data.u, t: tenantId });
  if (!u || !sigOk(sig, hmac(accountKey('reset|' + u.password_hash), payload))) return null;
  return u;
}
async function requestReset(tenantId, email) {
  const e = clean(email).toLowerCase();
  if (!validEmail(e)) return null;
  const u = await db.one(`SELECT * FROM nca_site_users WHERE tenant_id = :t AND LOWER(email) = :e AND status = 'approved'`, { t: tenantId, e });
  return u ? { user: u, token: resetToken(u) } : null;
}
async function resetPassword(tenantId, tok, password, confirm) {
  const u = await readResetToken(tenantId, tok);
  if (!u) return { error: 'expired' };
  const problem = passwordProblem(String(password || ''), String(confirm || ''));
  if (problem) return { error: problem };
  const hash = await bcrypt.hash(String(password), 12);
  await db.exec('UPDATE nca_site_users SET password_hash = :h, updated_at = now() WHERE id = :id', { h: hash, id: u.id });
  return { ok: true, user: Object.assign({}, u, { password_hash: hash }) };
}

/* ---------- pages ---------- */

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
function page(base, title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · BuyersLine</title><link rel="icon" href="${esc(base)}/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700&family=Mulish:wght@400;700;900&display=swap">
<style>
*{box-sizing:border-box}html,body{margin:0;background:#0E0C1F;color:#ECEAF6;font:400 16px/1.55 Mulish,system-ui,sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.card{width:100%;max-width:420px;border:1px solid rgba(252,76,2,.45);border-radius:18px;padding:28px;background:linear-gradient(180deg,#221B3F,#15122D);box-shadow:0 0 3em rgba(252,76,2,.18)}
.card.wide{max-width:760px}
.eye{font:700 12px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;color:#FF7A3D;margin:0}
h1{font-weight:900;font-size:28px;margin:8px 0 18px;line-height:1.15}
label{display:block;font:700 11px/1.4 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#A6A3BD;margin:14px 0 6px}
input{width:100%;font:inherit;color:#ECEAF6;background:#0E0C1F;border:1px solid rgba(166,163,189,.35);border-radius:10px;padding:12px;min-height:46px}
.pw{position:relative}.pw input{padding-right:52px}
.pw button{position:absolute;right:4px;top:4px;width:44px;height:38px;margin:0;padding:0;border:0;border-radius:8px;background:transparent;color:#A6A3BD;cursor:pointer;display:grid;place-items:center}
.pw button svg{width:22px;height:22px}.pw button[aria-pressed="true"]{color:#FF7A3D}
input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #FC4C02;outline-offset:2px}
.go{margin-top:20px;width:100%;min-height:46px;font:800 16px/1 Mulish,system-ui,sans-serif;color:#fff;background:#FC4C02;border:0;border-radius:40px;cursor:pointer}
.err{margin:14px 0 0;color:#F09590}.ok{margin:14px 0 0;color:#8BE0B0}.muted{color:#A6A3BD;font-size:14px;margin:14px 0 0}a{color:#5CC8E6}
.row{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px 6px;border-top:1px solid rgba(166,163,189,.2);vertical-align:middle}
.st{font:700 11px/1 "JetBrains Mono",monospace;text-transform:uppercase;letter-spacing:.08em;padding:4px 8px;border-radius:999px;background:rgba(166,163,189,.18)}
.st.pending{background:rgba(252,76,2,.2);color:#FFB08A}.st.approved{background:rgba(52,168,100,.22);color:#8BE0B0}
.acts{display:flex;gap:6px;flex-wrap:wrap}.acts button{min-height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(166,163,189,.35);background:transparent;color:#ECEAF6;font:700 13px Mulish,sans-serif;cursor:pointer}
.acts button.yes{background:#FC4C02;border-color:#FC4C02;color:#fff}.scroll{overflow-x:auto}
</style></head><body><main>${inner}</main>
<script>document.querySelectorAll('[data-eye]').forEach(function(b){b.addEventListener('click',function(){var i=document.getElementById(b.getAttribute('data-eye'));var show=i.type==='password';i.type=show?'text':'password';b.setAttribute('aria-pressed',show?'true':'false');b.setAttribute('aria-label',show?'Hide password':'Show password');});});</script>
</body></html>`;
}
function pw(id, name, label, auto) {
  return `<label for="${id}">${esc(label)}</label><div class="pw"><input id="${id}" name="${name}" type="password" autocomplete="${auto}" required minlength="${MIN_PASSWORD}"><button type="button" data-eye="${id}" aria-label="Show password" aria-pressed="false">${EYE}</button></div>`;
}

function loginPage(base, error, next, notice) {
  next = next || (base || '') + '/admin/';
  return page(base, 'Sign in', `<form class="card" method="post" action="${esc(base)}/gate/login" novalidate>
<p class="eye">BuyersLine</p><h1>Sign in</h1>
<input type="hidden" name="next" value="${esc(safeNext(base, next))}">
<label for="gate_email">Email</label><input id="gate_email" name="email" type="text" inputmode="email" autocomplete="username" required autofocus>
${pw('gate_pass', 'password', 'Password', 'current-password')}
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}${notice ? `<p class="ok" role="status">${esc(notice)}</p>` : ''}<button class="go" type="submit">Sign in</button>
<div class="row"><a href="${esc(base)}/gate/forgot">Forgot password?</a><a href="${esc(base)}/gate/signup">Create a login</a></div>
<p class="muted"><a href="${esc(base)}/">Back to BuyersLine</a></p></form>`);
}
function signupPage(base, error, done) {
  if (done) return page(base, 'Account created', `<div class="card"><p class="eye">BuyersLine · Private preview</p><h1>Request received</h1>
<p>Your login is waiting for approval. The owner reviews every new login, and you'll get an email as soon as yours is approved.</p><p class="muted"><a href="${esc(base)}/gate/login">Back to sign in</a></p></div>`);
  return page(base, 'Create a login', `<form class="card" method="post" action="${esc(base)}/gate/signup" novalidate>
<p class="eye">BuyersLine · Private preview</p><h1>Create a login</h1>
<label for="su_email">Email</label><input id="su_email" name="email" type="email" autocomplete="email" required autofocus>
${pw('su_pass', 'password', 'Password', 'new-password')}
${pw('su_pass2', 'confirm', 'Verify password', 'new-password')}
<p class="muted">At least ${MIN_PASSWORD} characters. The owner approves every new login before it works.</p>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}<button class="go" type="submit">Create login</button>
<div class="row"><a href="${esc(base)}/gate/login">I already have a login</a></div></form>`);
}
function forgotPage(base, error, sent) {
  if (sent) return page(base, 'Check your email', `<div class="card"><p class="eye">BuyersLine · Private preview</p><h1>Check your email</h1>
<p>If that email has an approved login, a reset link is on its way. It works once and expires in one hour.</p><p class="muted"><a href="${esc(base)}/gate/login">Back to sign in</a></p></div>`);
  return page(base, 'Forgot password', `<form class="card" method="post" action="${esc(base)}/gate/forgot" novalidate>
<p class="eye">BuyersLine · Private preview</p><h1>Forgot password</h1>
<label for="fg_email">Email</label><input id="fg_email" name="email" type="email" autocomplete="email" required autofocus>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}<button class="go" type="submit">Email me a reset link</button>
<div class="row"><a href="${esc(base)}/gate/login">Back to sign in</a></div></form>`);
}
function resetPage(base, tok, error, expired) {
  if (expired) return page(base, 'Link expired', `<div class="card"><p class="eye">BuyersLine · Private preview</p><h1>This link has expired</h1>
<p>Reset links work once and expire after one hour.</p><p class="muted"><a href="${esc(base)}/gate/forgot">Request a new link</a></p></div>`);
  return page(base, 'Choose a new password', `<form class="card" method="post" action="${esc(base)}/gate/reset" novalidate>
<p class="eye">BuyersLine · Private preview</p><h1>Choose a new password</h1>
<input type="hidden" name="t" value="${esc(tok)}">
${pw('rs_pass', 'password', 'New password', 'new-password')}
${pw('rs_pass2', 'confirm', 'Verify password', 'new-password')}
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}<button class="go" type="submit">Save password</button></form>`);
}
function accountsPage(base, rows) {
  const tr = rows.map((r) => `<tr><td>${esc(r.email)}</td><td><span class="st ${esc(r.status)}">${esc(r.status)}</span></td><td>${esc(new Date(r.created_at).toISOString().slice(0, 10))}</td>
<td><form class="acts" method="post" action="${esc(base)}/gate/accounts/${Number(r.id)}">${r.status !== 'approved' ? '<button class="yes" name="decision" value="approve">Approve</button>' : ''}${r.status === 'pending' ? '<button name="decision" value="reject">Reject</button>' : ''}${r.status === 'approved' ? '<button name="decision" value="disable">Disable</button>' : ''}</form></td></tr>`).join('');
  return page(base, 'Logins', `<div class="card wide"><p class="eye">BuyersLine · Private preview</p><h1>Logins waiting for you</h1>
<p class="muted">People create a login; it works only after you approve it here. Only the owner sign-in can see this page.</p>
<div class="scroll"><table><thead><tr><th>Email</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${tr || '<tr><td colspan="4" class="muted">No logins yet.</td></tr>'}</tbody></table></div>
<p class="muted"><a href="${esc(base)}/">Back to BuyersLine</a></p></div>`);
}
function closedPage(base) {
  return page(base, 'Closed', `<div class="card"><p class="eye">BuyersLine · Private preview</p><h1>This site is closed</h1>
<p class="muted">It opens once its sign-in is configured on the server.</p><p class="muted"><a href="${esc(base)}/">Back to BuyersLine</a></p></div>`);
}

module.exports = {
  clean, siteGateOn, safeNext, COOKIE, TTL_MS, MIN_PASSWORD, configured, weak, check, sign, signAccount, valid, identify, ownerEmail, setCookie,
  authenticate, createAccount, listAccounts, decide, requestReset, readResetToken, resetPassword, resetToken, passwordProblem,
  loginPage, signupPage, forgotPage, resetPage, accountsPage, closedPage
};
