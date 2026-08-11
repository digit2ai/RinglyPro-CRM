'use strict';

/**
 * At-rest encryption for social access tokens. AES-256-GCM, key derived from
 * JOBUP_SOCIAL_SECRET || JOBUP_JWT_SECRET || JWT_SECRET. Mirrors the Growth
 * vertical's crypto service rather than inventing a second scheme.
 *
 * A page access token is a bearer credential for someone's Facebook presence.
 * It is stored encrypted, returned to no one, and never logged — decrypt() is
 * called at the moment of the API call and the plaintext never leaves that
 * scope. Rotating the secret makes stored tokens undecryptable, which is the
 * correct failure: re-enter them rather than silently posting with a token the
 * operator can no longer account for.
 */

const crypto = require('crypto');

function key() {
  const secret = process.env.JOBUP_SOCIAL_SECRET
    || process.env.JOBUP_JWT_SECRET
    || process.env.JWT_SECRET
    || 'jobup-dev-only-insecure-secret';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(blob) {
  if (!blob) return null;
  try {
    const [v, iv, tag, data] = String(blob).split(':');
    if (v !== 'v1') return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch (e) {
    // A wrong key or tampered blob. Never throw into a posting run — the caller
    // treats null as "no usable credential" and records a failure.
    return null;
  }
}

/** What an operator may see about a stored token: that it exists, and nothing else. */
function hint(blob) {
  return { set: Boolean(blob), hint: blob ? '••••••••' : null };
}

module.exports = { encrypt, decrypt, hint };
