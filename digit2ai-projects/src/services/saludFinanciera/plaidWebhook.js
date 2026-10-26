'use strict';
/**
 * Plaid webhook verification (https://plaid.com/docs/api/webhooks/webhook-verification/).
 *
 * 1. Plaid-Verification header = JWT, alg MUST be ES256 (anything else refused).
 * 2. Public key fetched by kid from /webhook_verification_key/get, cached.
 *    An unknown kid triggers one fresh fetch; an expired key is refused.
 * 3. iat must be no older than 5 minutes.
 * 4. SHA-256 of the RAW body bytes must equal request_body_sha256 (constant-time).
 * Any failure throws; the route answers 400 and stores nothing.
 */
const crypto = require('crypto');
const plaid = require('./plaidClient');

const MAX_AGE_S = 300;
const keyCache = new Map(); // kid -> { jwk, at }   (1 h, so an expired key stops verifying within the hour)
const missCache = new Map(); // kid -> at            (unknown kids are not re-asked for 5 min)

function b64urlJSON(s) { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); }

async function keyFor(kid, nowS) {
  const hit = keyCache.get(kid);
  if (hit && (nowS - hit.at) < 3600) return hit.jwk;
  const miss = missCache.get(kid);
  if (miss && nowS - miss < 300) throw new Error('verification key not found');
  let r = null;
  try { r = await plaid.call('/webhook_verification_key/get', { key_id: kid }); } catch (e) { r = null; }
  const jwk = r && r.key;
  if (!jwk || jwk.kid !== kid) { missCache.set(kid, nowS); if (missCache.size > 500) missCache.clear(); throw new Error('verification key not found'); }
  keyCache.set(kid, { jwk, at: nowS });
  return jwk;
}

/**
 * verify(rawBody Buffer|string, header string, { now }) -> parsed body object
 */
async function verify(rawBody, header, opts = {}) {
  const nowS = Math.floor((opts.now || Date.now()) / 1000);
  if (!header || typeof header !== 'string') throw new Error('missing Plaid-Verification header');
  const parts = header.split('.');
  if (parts.length !== 3) throw new Error('malformed JWT');
  let head, claims;
  try { head = b64urlJSON(parts[0]); claims = b64urlJSON(parts[1]); } catch (e) { throw new Error('malformed JWT'); }
  if (head.alg !== 'ES256') throw new Error('alg not ES256');
  if (!head.kid || typeof head.kid !== 'string' || head.kid.length > 200) throw new Error('missing kid');
  // free checks BEFORE any call to Plaid, so random junk cannot burn the key endpoint
  if (!Number.isFinite(Number(claims.iat)) || nowS - Number(claims.iat) > MAX_AGE_S || Number(claims.iat) - nowS > 60) throw new Error('stale webhook');
  const raw0 = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const got0 = crypto.createHash('sha256').update(raw0).digest('hex');
  const want0 = String(claims.request_body_sha256 || '');
  if (want0.length !== got0.length || !crypto.timingSafeEqual(Buffer.from(got0), Buffer.from(want0))) throw new Error('body hash mismatch');
  const jwk = await keyFor(head.kid, nowS);
  if (jwk.expired_at && Number(jwk.expired_at) && Number(jwk.expired_at) < nowS) throw new Error('verification key expired');
  const pub = crypto.createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: 'jwk' });
  const okSig = crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
  if (!okSig) throw new Error('bad signature');
  if (!Number.isFinite(Number(claims.iat)) || nowS - Number(claims.iat) > MAX_AGE_S || Number(claims.iat) - nowS > 60) throw new Error('stale webhook');
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  const got = crypto.createHash('sha256').update(raw).digest('hex');
  const want = String(claims.request_body_sha256 || '');
  if (want.length !== got.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw new Error('body hash mismatch');
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch (e) { throw new Error('body not JSON'); }
  // dedupe key = the signed header: a true duplicate delivery repeats it, a NEW event with an
  // identical body (Plaid re-sends the same SYNC_UPDATES_AVAILABLE body every time) does not
  return { body, sha256: got, dedupe: crypto.createHash('sha256').update(header).digest('hex') };
}

function _clearCache() { keyCache.clear(); missCache.clear(); }

module.exports = { verify, _clearCache };
