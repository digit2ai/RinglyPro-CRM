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
// SIGN-IN IS THE PROJECTS HUB, AND ONLY THAT. This app briefly had its own
// magic-link plus a shared access code — a second credential to distribute,
// rotate and lose, for an audience of two people who already sign in at
// /projects daily. Access here is now exactly access there, so removing someone
// from the Hub removes them from this model too, with nothing to remember to
// revoke separately.
//
// There is consequently no access code and no new secret to configure.
// JWT_SECRET is already set in production, and it is the only thing the token
// exchange needs.
// =====================================================

'use strict';

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

// Where an unauthenticated visitor is sent to sign in. The Projects Hub is the
// identity provider for this app, so there is nowhere else to send them.
function projectsUrl() {
  return process.env.SRCAF_SIGN_IN_URL || '/projects';
}

// ---------------------------------------------------------------------------
// Attempt throttling.
//
// The SSO exchange verifies a signed token, so guessing is not the realistic
// attack that guessing a shared code was. The throttle stays as a cheap brake
// on someone spraying forged tokens at the endpoint. Per-process, and Render
// may run more than one instance, so it raises cost rather than eliminating
// anything — said plainly rather than implied.
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
// short: liveness, the token exchange, and the two assets the handoff page
// needs to render. Everything else — the model, the benchmarks, the watchouts,
// the app shell and app.js — is behind the gate.
const OPEN_PATHS = new Set([
  '/health',
  '/login',
  '/login.html',
  '/login.js',
  '/app.css',
  '/favicon.ico',
  '/api/v1/auth/sso',
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
  projectsUrl,
  throttled,
  recordFailure,
  clearFailures,
  retryAfterSeconds,
  securityHeaders,
  isOpenPath,
  OPEN_PATHS,
  MAX_ATTEMPTS,
};
