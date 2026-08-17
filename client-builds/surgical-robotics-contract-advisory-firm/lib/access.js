// =====================================================
// lib/access.js — the access level, and the gate that enforces it.
//
// WHY THIS EXISTS: the app shipped with public reads. The model, the benchmarks
// and the whole five-tab shell answered to anyone with the URL. That was a
// defensible default for a public-benchmark calculator, and it is the wrong
// default for an artifact about one named person's plan to leave one named
// employer. The Watchouts tab alone names a non-compete, a trade-secret
// boundary and a tortious-interference exposure. That is not a page to leave
// open on a guessable path.
//
// THE HOLE THIS ALSO CLOSES: `POST /auth/magic-link` returned the sign-in URL
// in its response body, because EMAIL_AUTOSEND_DISABLED means no mail can be
// sent. With public reads that was merely untidy. Behind a gate it is the gate:
// anyone who knows an allow-listed address could mint themselves a session.
// A link is now only issued to a caller who ALSO presents the access code, so
// knowing the address is not sufficient.
//
// FAIL CLOSED. With no SRCAF_ACCESS_CODE set, no session can be created at all.
// This is the same rule the JobUp consoles follow in this repo — unset means
// CLOSED, deliberately, rather than open under a default password that is
// published in the documentation. The cost is that the owner must set one env
// var before first sign-in; the alternative is a live app that anyone who has
// read this repository can walk into.
// =====================================================

'use strict';

const crypto = require('crypto');

// `private` — nothing without a session, except /health and the sign-in flow.
// `public`  — the previous behaviour: reads open, writes authenticated.
const LEVELS = ['private', 'public'];

function level() {
  const raw = String(process.env.SRCAF_ACCESS_LEVEL || 'private').trim().toLowerCase();
  return LEVELS.includes(raw) ? raw : 'private';
}

function isPrivate() {
  return level() === 'private';
}

function accessCode() {
  const raw = process.env.SRCAF_ACCESS_CODE;
  return raw && String(raw).length > 0 ? String(raw) : null;
}

function accessConfigured() {
  return accessCode() !== null;
}

// Passwords this repository publishes in its own documentation. A deployment
// using one of these is not protected by it, so it is reported rather than
// silently accepted. Reported and NOT blocked: refusing to boot would lock the
// owner out of their own model with no way back in.
const PUBLISHED_SECRETS = [
  'Palindrome@7',
  'lawncopilot@2026',
  'coachtrack@2026',
  'exec@2026',
  'defensoresdelapatria@7',
  'TunjoRacing2024!',
  'changeme',
  'password',
];

function weakAccessCode() {
  const code = accessCode();
  if (!code) return false;
  if (code.length < 12) return true;
  return PUBLISHED_SECRETS.some((p) => p.toLowerCase() === code.toLowerCase());
}

// Compares hashes rather than the raw values so the comparison is both
// timing-safe and length-agnostic — timingSafeEqual throws on a length
// mismatch, which would itself leak the length of the real code.
function codeMatches(candidate) {
  const real = accessCode();
  if (!real) return false;
  const a = crypto.createHash('sha256').update(String(candidate || ''), 'utf8').digest();
  const b = crypto.createHash('sha256').update(real, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Attempt throttling.
//
// Once an access code is the thing standing between the internet and the app,
// brute force is the attack. This is per-process and Render may run more than
// one instance, so it raises the cost rather than eliminating the attack — the
// real defence is a long random code. Said plainly here rather than implied.
// ---------------------------------------------------------------------------
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

function clientKey(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function throttled(req) {
  const key = clientKey(req);
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || now - row.first > WINDOW_MS) return false;
  return row.count >= MAX_ATTEMPTS;
}

function recordFailure(req) {
  const key = clientKey(req);
  const now = Date.now();
  const row = attempts.get(key);
  if (!row || now - row.first > WINDOW_MS) attempts.set(key, { first: now, count: 1 });
  else row.count += 1;

  // Bounded so a spray across many source addresses cannot grow this map
  // without limit. Oldest window first.
  if (attempts.size > 5000) {
    const oldest = [...attempts.entries()].sort((a, b) => a[1].first - b[1].first)[0];
    if (oldest) attempts.delete(oldest[0]);
  }
}

function clearFailures(req) {
  attempts.delete(clientKey(req));
}

function retryAfterSeconds(req) {
  const row = attempts.get(clientKey(req));
  if (!row) return 0;
  return Math.max(0, Math.ceil((WINDOW_MS - (Date.now() - row.first)) / 1000));
}

// ---------------------------------------------------------------------------
// Security headers.
//
// The page is a single origin serving its own CSS and JS with no CDN and no
// inline script, so the policy can be strict without qualification.
// frame-ancestors none because nothing should embed a private model.
// ---------------------------------------------------------------------------
function securityHeaders(_req, res, next) {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  next();
}

// Paths reachable with no session, even at the private level. Deliberately
// short: liveness, the sign-in flow itself, and the two assets the sign-in page
// needs to render. Everything else — including the model, the benchmarks and
// the app shell — is behind the gate.
const OPEN_PATHS = new Set([
  '/health',
  '/login',
  '/login.html',
  '/login.js',
  '/app.css',
  '/favicon.ico',
  '/api/v1/auth/magic-link',
  '/api/v1/auth/verify',
  '/api/v1/auth/logout',
  '/api/v1/auth/me',
  '/api/v1/auth/status',
]);

function isOpenPath(p) {
  return OPEN_PATHS.has(p);
}

module.exports = {
  LEVELS,
  level,
  isPrivate,
  accessCode,
  accessConfigured,
  weakAccessCode,
  codeMatches,
  throttled,
  recordFailure,
  clearFailures,
  retryAfterSeconds,
  securityHeaders,
  isOpenPath,
  OPEN_PATHS,
  MAX_ATTEMPTS,
};
