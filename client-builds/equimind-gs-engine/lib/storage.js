// =====================================================
// Storage adapter — one interface, two backends:
//   · s3   (default when AWS_S3_BUCKET + creds present) — signed upload/download URLs
//   · disk (Render disk fallback) — served via the module's /files route with a
//          short-lived HMAC-signed token (no public listing).
// The rest of the engine only sees put()/signedGetUrl()/signedPutUrl()/exists().
// =====================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BUCKET = process.env.GS_S3_BUCKET || process.env.AWS_S3_BUCKET || '';
const REGION = process.env.AWS_REGION || process.env.AWS_S3_REGION || 'us-east-1';
const DISK_ROOT = process.env.GS_DISK_ROOT || path.join(__dirname, '..', '.gs-store');
const SIGN_SECRET = process.env.ECPF_JWT_SECRET || process.env.JWT_SECRET || 'gs-sign-secret';
const useS3 = !!(BUCKET && (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE));

let s3 = null, presign = null;
function s3client() {
  if (s3) return s3;
  const { S3Client } = require('@aws-sdk/client-s3');
  s3 = new S3Client({ region: REGION });
  return s3;
}

function backend() { return useS3 ? 's3' : 'disk'; }

// Persist a Buffer at objectKey. Returns { storage, bucket, object_key, bytes }.
async function put(objectKey, buffer, contentType) {
  if (useS3) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3client().send(new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, Body: buffer, ContentType: contentType || 'application/octet-stream' }));
    return { storage: 's3', bucket: BUCKET, object_key: objectKey, bytes: buffer.length };
  }
  const full = path.join(DISK_ROOT, objectKey);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
  return { storage: 'disk', bucket: null, object_key: objectKey, bytes: buffer.length };
}

async function getBuffer(objectKey) {
  if (useS3) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const r = await s3client().send(new GetObjectCommand({ Bucket: BUCKET, Key: objectKey }));
    const chunks = []; for await (const c of r.Body) chunks.push(c); return Buffer.concat(chunks);
  }
  return fs.readFileSync(path.join(DISK_ROOT, objectKey));
}

async function remove(objectKey) {
  if (useS3) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    try { await s3client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: objectKey })); } catch (e) {}
    return;
  }
  try { fs.unlinkSync(path.join(DISK_ROOT, objectKey)); } catch (e) {}
}

// Signed, time-limited download URL. On disk backend, an HMAC token the /files
// route validates. `base` = module mount base for building disk URLs.
async function signedGetUrl(objectKey, { expiresSec = 3600, base = '/equimind-gs-engine/' } = {}) {
  if (useS3) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    if (!presign) presign = require('@aws-sdk/s3-request-presigner').getSignedUrl;
    return presign(s3client(), new GetObjectCommand({ Bucket: BUCKET, Key: objectKey }), { expiresIn: expiresSec });
  }
  const exp = Math.floor(Date.now() / 1000) + expiresSec;
  const sig = diskSig(objectKey, exp);
  return base + 'files?k=' + encodeURIComponent(objectKey) + '&e=' + exp + '&s=' + sig;
}

// Signed upload URL (S3 PUT presigned; disk backend uploads through the API route).
async function signedPutUrl(objectKey, { expiresSec = 3600, contentType } = {}) {
  if (useS3) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    if (!presign) presign = require('@aws-sdk/s3-request-presigner').getSignedUrl;
    return presign(s3client(), new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, ContentType: contentType || 'application/octet-stream' }), { expiresIn: expiresSec });
  }
  return null; // disk: client posts to /api/v1/sessions/:id/upload instead
}

function diskSig(key, exp) {
  return crypto.createHmac('sha256', SIGN_SECRET).update('gs-file:' + key + ':' + exp).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 24);
}
function verifyDiskSig(key, exp, sig) {
  if (!key || !exp || !sig) return false;
  if (Math.floor(Date.now() / 1000) > Number(exp)) return false;
  return sig === diskSig(key, Number(exp));
}

module.exports = { backend, useS3, put, getBuffer, remove, signedGetUrl, signedPutUrl, verifyDiskSig, DISK_ROOT };
