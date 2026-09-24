'use strict';

/**
 * AES-256-GCM for secrets that must live in the database rather than in env.
 *
 * WHY THIS EXISTS. A HighLevel Private Integration token is issued PER
 * SUB-ACCOUNT. One sub-account fits in an env var; ten do not. The moment Lite
 * serves more than one client the tokens have to be rows, and a row holding a
 * plaintext credential that can buy phone numbers and read a client's contacts
 * is not acceptable — so they are encrypted at rest and returned masked.
 *
 * The key is derived from LITE_SECRET_KEY (falling back to LITE_JWT_SECRET,
 * then JWT_SECRET) with scrypt. **Rotating that value makes every stored token
 * undecryptable**, which is reported as itself rather than swallowed: a token
 * that silently reads as absent would make Lite quietly stop provisioning and
 * look like a HighLevel outage.
 */
const crypto = require('crypto');

const VERSION = 'v1';
const SALT = 'ringlypro-lite-secretbox';

function keyMaterial() {
  const raw = process.env.LITE_SECRET_KEY || process.env.LITE_JWT_SECRET || process.env.JWT_SECRET || '';
  if (!raw || String(raw).trim().length < 16) {
    const e = new Error('LITE_SECRET_KEY is not set (or is under 16 characters); stored credentials cannot be encrypted');
    e.code = 'NO_SECRET_KEY';
    throw e;
  }
  return crypto.scryptSync(String(raw), SALT, 32);
}

/** @returns {boolean} whether a usable key is configured (for /health, never a secret). */
function configured() {
  try { keyMaterial(); return true; } catch (_) { return false; }
}

/** Encrypt a plaintext secret. Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
function seal(plain) {
  if (plain == null || plain === '') return null;
  const key = keyMaterial();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const out = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [VERSION, iv.toString('base64url'), c.getAuthTag().toString('base64url'), out.toString('base64url')].join('.');
}

/**
 * Decrypt. Throws with code BAD_SECRET when the value cannot be opened —
 * usually a rotated LITE_SECRET_KEY. Never returns a partial or a guess.
 */
function open(sealed) {
  if (!sealed) return null;
  const parts = String(sealed).split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    const e = new Error('stored credential is not in the expected format'); e.code = 'BAD_SECRET'; throw e;
  }
  try {
    const key = keyMaterial();
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'));
    d.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([d.update(Buffer.from(parts[3], 'base64url')), d.final()]).toString('utf8');
  } catch (e) {
    if (e.code === 'NO_SECRET_KEY') throw e;
    const err = new Error('stored credential could not be decrypted — LITE_SECRET_KEY may have been rotated');
    err.code = 'BAD_SECRET';
    throw err;
  }
}

/**
 * What an API may return about a stored secret: whether it is set and a short
 * non-reversible hint, never the value. Same shape the chamber WordPress sync
 * uses, so the two consoles behave alike.
 */
function describe(sealed) {
  if (!sealed) return { set: false, hint: null };
  try {
    open(sealed);   // proves it is readable; the value itself never leaves.
    // NO FRAGMENT OF THE LIVE TOKEN. The last four characters were enough to
    // confirm a guess, and this report is written to be pasted around.
    return { set: true };
  } catch (e) {
    return { set: true, hint: null, error: e.code === 'BAD_SECRET' ? 'undecryptable' : 'no_key' };
  }
}

module.exports = { seal, open, describe, configured };
