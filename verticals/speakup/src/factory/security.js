'use strict';

/**
 * SpeakUp AI Factory — security primitives.
 *
 * THE PRIVATE EXECUTION PHRASE LIVES ONLY IN SERVER ENV. It is never sent to the
 * browser, never written to the repo, and never stored in a transcript: a spoken
 * phrase is detected by hashing word windows and the matching words are replaced
 * with "[frase privada]" before anything is persisted.
 *
 *   SPEAKUP_EXEC_PHRASE          plaintext (Render secret env), or
 *   SPEAKUP_EXEC_PHRASE_SHA256   sha256 of the NORMALIZED phrase
 *
 * Neither set = execution is CLOSED. It fails shut, never open.
 */

const crypto = require('crypto');

const REDACTED = '[frase privada]';

// Passwords this repository publishes in CLAUDE.md / source. A factory that can
// change production code must not sit behind one of them.
const PUBLISHED_PASSWORDS = ['Palindrome@7', 'speakup-2026-secret', 'speakup@2026', 'lawncopilot@2026',
  'coachtrack@2026', 'exec@2026', 'defensoresdelapatria@7'];

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function hmac(secret, s) { return crypto.createHmac('sha256', String(secret)).update(String(s)).digest('hex'); }

function safeEqualHex(a, b) {
  const x = Buffer.from(sha256(String(a || '')), 'hex');
  const y = Buffer.from(sha256(String(b || '')), 'hex');
  return crypto.timingSafeEqual(x, y) && String(a || '').length === String(b || '').length;
}

// Lowercase, strip accents and punctuation, collapse whitespace.
function normalizeSpoken(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseHash() {
  if (process.env.SPEAKUP_EXEC_PHRASE_SHA256) return String(process.env.SPEAKUP_EXEC_PHRASE_SHA256).trim().toLowerCase();
  if (process.env.SPEAKUP_EXEC_PHRASE) {
    const n = normalizeSpoken(process.env.SPEAKUP_EXEC_PHRASE);
    return n ? sha256(n) : null;
  }
  return null;
}

function phraseConfigured() { return !!phraseHash(); }

// A typed passphrase: compared as a whole, normalized, constant time.
function phraseMatches(input) {
  const h = phraseHash();
  if (!h) return false;
  const n = normalizeSpoken(input);
  if (!n) return false;
  return safeEqualHex(sha256(n), h);
}

// Find the phrase inside a longer spoken transcript. Works with a hash-only
// configuration because every 1..16-word window is hashed and compared.
function findPhrase(text) {
  const h = phraseHash();
  if (!h) return null;
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const norm = words.map(normalizeSpoken);
  for (let i = 0; i < words.length; i++) {
    let acc = '';
    for (let len = 1; len <= 16 && i + len <= words.length; len++) {
      const w = norm[i + len - 1];
      if (!w) continue;
      acc = acc ? acc + ' ' + w : w;
      if (safeEqualHex(sha256(acc), h)) return { start: i, end: i + len };
    }
  }
  return null;
}

function containsPhrase(text) { return !!findPhrase(text); }

// Remove every occurrence of the phrase before a transcript is stored.
function redactPhrase(text) {
  let out = String(text || '');
  for (let guard = 0; guard < 5; guard++) {
    const hit = findPhrase(out);
    if (!hit) break;
    const words = out.split(/\s+/).filter(Boolean);
    words.splice(hit.start, hit.end - hit.start, REDACTED);
    out = words.join(' ');
  }
  return out;
}

function teamPasswordWeak() {
  const pw = process.env.SPEAKUP_TEAM_PASSWORD;
  return !pw || pw.length < 12 || PUBLISHED_PASSWORDS.includes(pw);
}

// The factory requires SpeakUp's OWN session secret. JWT_SECRET is shared with other
// verticals, and a token they mint must never be able to reach the execution door.
function authSecretIsDefault() {
  return !process.env.SPEAKUP_JWT_SECRET || process.env.SPEAKUP_JWT_SECRET === process.env.JWT_SECRET;
}

// A plaintext phrase shorter than 4 words / 20 characters is refused (hash-only is trusted).
function phraseWeak() {
  if (!process.env.SPEAKUP_EXEC_PHRASE) return false;
  const n = normalizeSpoken(process.env.SPEAKUP_EXEC_PHRASE);
  return n.split(' ').length < 4 || n.length < 20;
}

function factorySecret() { return process.env.SPEAKUP_FACTORY_SECRET || null; }

function allowedEmails() {
  return String(process.env.SPEAKUP_FACTORY_ALLOWED_EMAILS || 'mstagg@digit2ai.com')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function isFactoryOperator(user) {
  return !!(user && user.role === 'admin' && allowedEmails().includes(String(user.email || '').toLowerCase()));
}

// ── In-memory sliding-window limiter (per instance; a backstop, not the gate) ──
const buckets = new Map();
function rateLimit(name, key, max, windowMs) {
  const k = name + '|' + key;
  const now = Date.now();
  const arr = (buckets.get(k) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { buckets.set(k, arr); return false; }
  arr.push(now); buckets.set(k, arr);
  if (buckets.size > 5000) { for (const kk of buckets.keys()) { buckets.delete(kk); if (buckets.size < 2500) break; } }
  return true;
}
function resetRateLimits() { buckets.clear(); }

function clientIp(req) {
  return String((req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '')).split(',')[0].trim();
}
function ipHash(req) {
  const salt = process.env.SESSION_SALT || 'speakup-factory';
  return sha256(salt + '|' + clientIp(req)).slice(0, 32);
}

// Cross-site request guard for state-changing factory routes: a custom header
// (a cross-origin page cannot send it with cookies without a preflight the app
// never grants credentials for) plus a same-host Origin when the browser sends one.
function sameOriginRequest(req) {
  if (String(req.headers['x-speakup'] || '') !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  let host;
  try { host = new URL(origin).host; } catch (e) { return false; }
  const expected = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host === expected;
}

// Short-lived, stateless confirmation token bound to a job, its plan hash and a
// user. Single use is guaranteed by the atomic WAITING_APPROVAL -> QUEUED update.
function confirmSecret() {
  return (process.env.SPEAKUP_JWT_SECRET || process.env.JWT_SECRET || 'speakup-2026-secret') + '|' + (factorySecret() || '');
}
function signConfirm(jobId, planHash, userId, ttlMs) {
  const exp = Date.now() + (ttlMs || 3 * 60 * 1000);
  const body = [jobId, planHash, userId, exp].join('.');
  return Buffer.from(body).toString('base64url') + '.' + hmac(confirmSecret(), body);
}
// Narrow workflow tokens. The GitHub job that runs Claude never holds the factory
// secret; it gets two of these instead, computed by a job that runs no untrusted code.
//   brief:    fetch the brief once
//   progress: report TESTING / FIXING / failed for this job only
function workflowToken(kind, jobId, exp) {
  return exp + '.' + hmac(factorySecret() || '', `${kind}.${jobId}.${exp}`);
}
function verifyWorkflowToken(kind, jobId, token) {
  if (!factorySecret()) return false;
  const [exp, sig] = String(token || '').split('.');
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now() / 1000 || e > Date.now() / 1000 + 3 * 3600) return false;
  return safeEqualHex(hmac(factorySecret(), `${kind}.${jobId}.${e}`), sig || '');
}

function verifyConfirm(token, jobId, planHash, userId) {
  const [b64, sig] = String(token || '').split('.');
  if (!b64 || !sig) return false;
  let body;
  try { body = Buffer.from(b64, 'base64url').toString(); } catch (e) { return false; }
  if (!safeEqualHex(hmac(confirmSecret(), body), sig)) return false;
  const [j, p, u, exp] = body.split('.');
  return String(j) === String(jobId) && p === String(planHash) && String(u) === String(userId) && Number(exp) > Date.now();
}

module.exports = {
  REDACTED, PUBLISHED_PASSWORDS, sha256, hmac, safeEqualHex, normalizeSpoken,
  phraseConfigured, phraseMatches, containsPhrase, redactPhrase, phraseWeak, workflowToken, verifyWorkflowToken,
  teamPasswordWeak, authSecretIsDefault, factorySecret, allowedEmails, isFactoryOperator,
  rateLimit, resetRateLimits, ipHash, sameOriginRequest, signConfirm, verifyConfirm
};
