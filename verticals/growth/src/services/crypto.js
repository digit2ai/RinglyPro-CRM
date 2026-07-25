'use strict';

/**
 * Digit2AI Growth — at-rest encryption for channel secrets (X/LinkedIn tokens).
 * AES-256-GCM, key derived from GROWTH_SECRET || JWT_SECRET (mirrors the
 * projects-bridge emailReconcile pattern). Never store raw tokens.
 */

const crypto = require('crypto');

const SECRET = process.env.GROWTH_SECRET || process.env.JWT_SECRET || 'growth-2026-secret';
const KEY = crypto.createHash('sha256').update(String(SECRET)).digest(); // 32 bytes

function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(blob) {
  if (!blob || typeof blob !== 'string' || !blob.startsWith('v1:')) return null;
  try {
    const [, ivB, tagB, dataB] = blob.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}

// For the UI: never return a secret; show only whether it's set + a hint.
function mask(blob) {
  const v = decrypt(blob);
  if (!v) return { set: false };
  return { set: true, hint: v.length > 4 ? '...' + v.slice(-4) : '...' };
}

module.exports = { encrypt, decrypt, mask };
