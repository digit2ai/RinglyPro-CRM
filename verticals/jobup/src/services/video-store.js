'use strict';

// =============================================================
// VIDEO STORE — where a finished MP4 lives once the render is over.
//
// DELIBERATELY NOT A RENDER DISK. Attaching a persistent disk to this service
// pins it to a SINGLE INSTANCE and ends zero-downtime deploys — for the whole
// CRM and every vertical it hosts — in exchange for a folder of marketing
// videos. S3 keeps the file across deploys, costs cents a month, needs no mount
// path, and the credentials are already on this host (the same account the
// photo uploader uses).
//
// The local library is still written first and still serves the download: it is
// the fast path and the thing ffmpeg produced. S3 is the copy that survives the
// next deploy. If the local file is gone and the object is there, the download
// redirects to a short-lived signed URL — never a public object, never a
// permanent link.
//
// IT NEVER CLAIMS A VIDEO IS KEPT WHEN IT IS NOT. With no bucket configured
// every function reports 'local' and the console keeps its ephemeral-storage
// warning. An upload that FAILS is reported as failed and the row records
// storage 'local' — a video row that says "s3" when nothing was uploaded is the
// exact failure this file exists to prevent.
// =============================================================

const fs = require('fs');
const path = require('path');

// The dedicated name wins so the videos can be split off later; otherwise it
// rides the bucket this repo already uploads photos to.
const BUCKET = (process.env.JOBUP_VIDEO_S3_BUCKET || process.env.AWS_S3_BUCKET || '').trim();
const REGION = (process.env.AWS_REGION || process.env.AWS_S3_REGION || 'us-east-1').trim();
const PREFIX = (process.env.JOBUP_VIDEO_S3_PREFIX || 'jobup-videos').replace(/^\/+|\/+$/g, '');
const URL_TTL = Math.max(60, parseInt(process.env.JOBUP_VIDEO_URL_TTL || '3600', 10) || 3600);

function hasCreds() {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    || !!process.env.AWS_PROFILE;
}

/** Whether a durable copy is possible at all on this host. */
function configured() {
  return !!(BUCKET && hasCreds());
}

let clientCache;
function client() {
  if (clientCache !== undefined) return clientCache;
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    clientCache = new S3Client({ region: REGION });
  } catch (e) {
    // The SDK lives in the ROOT package.json. A jobup deployed without it is a
    // deployment fact, not a crash: renders still work, they just aren't kept.
    console.warn('[video-store] @aws-sdk/client-s3 unavailable:', e.message);
    clientCache = null;
  }
  return clientCache;
}

/** Object key for a rendered file. Dated, so the bucket stays browsable. */
function keyFor(filename, when) {
  const d = when instanceof Date ? when : new Date();
  const day = d.toISOString().slice(0, 10);
  // Flattened AND de-dotted: the filename comes from a brief title, so a run
  // of dots must never survive into a key any part of the stack might resolve.
  const safe = String(filename || 'video.mp4')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+/, '') || 'video.mp4';
  return `${PREFIX}/${day}/${safe}`;
}

/**
 * Copy a finished render into durable storage.
 *
 * @returns {{storage:'s3'|'local', bucket:?string, object_key:?string, error:?string}}
 *          Never throws: a failed upload must not fail a render that already
 *          cost real money. The caller records what actually happened.
 */
async function keep(localPath, filename) {
  if (!configured()) return { storage: 'local', bucket: null, object_key: null, error: null };
  const c = client();
  if (!c) return { storage: 'local', bucket: null, object_key: null, error: 'aws sdk not installed' };

  const key = keyFor(filename);
  try {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const stat = fs.statSync(localPath);
    await c.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      // Streamed with an explicit length — a 1080p render is tens of megabytes
      // and reading it into a Buffer to upload it is memory this host does not
      // need to spend.
      Body: fs.createReadStream(localPath),
      ContentLength: stat.size,
      ContentType: 'video/mp4',
    }));
    return { storage: 's3', bucket: BUCKET, object_key: key, error: null };
  } catch (e) {
    console.warn('[video-store] upload failed:', e.message);
    return { storage: 'local', bucket: null, object_key: null, error: e.message };
  }
}

/** A short-lived signed URL, or null. The object is never public. */
async function signedUrl(row) {
  if (!row || row.storage !== 's3' || !row.object_key) return null;
  const c = client();
  if (!c) return null;
  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    return await getSignedUrl(c, new GetObjectCommand({
      Bucket: row.bucket || BUCKET,
      Key: row.object_key,
      ResponseContentDisposition: `inline; filename="${String(row.filename || 'video.mp4').replace(/"/g, '')}"`,
    }), { expiresIn: URL_TTL });
  } catch (e) {
    console.warn('[video-store] could not sign:', e.message);
    return null;
  }
}

/** Whether the durable copy is really there. Used before promising a download. */
async function exists(row) {
  if (!row || row.storage !== 's3' || !row.object_key) return false;
  const c = client();
  if (!c) return false;
  try {
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    await c.send(new HeadObjectCommand({ Bucket: row.bucket || BUCKET, Key: row.object_key }));
    return true;
  } catch (_) {
    return false;
  }
}

/** Delete the durable copy. Only ever called from the console's own delete. */
async function remove(row) {
  if (!row || row.storage !== 's3' || !row.object_key) return false;
  const c = client();
  if (!c) return false;
  try {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await c.send(new DeleteObjectCommand({ Bucket: row.bucket || BUCKET, Key: row.object_key }));
    return true;
  } catch (e) {
    console.warn('[video-store] could not delete:', e.message);
    return false;
  }
}

/** What the console shows about durability. */
function state() {
  return {
    durable: configured(),
    backend: configured() ? 's3' : 'local',
    bucket: configured() ? BUCKET : null,
    region: configured() ? REGION : null,
    prefix: PREFIX,
    url_ttl_seconds: URL_TTL,
    // Named so an operator can act on it, rather than "not configured".
    missing: configured() ? []
      : [BUCKET ? null : 'JOBUP_VIDEO_S3_BUCKET (or AWS_S3_BUCKET)',
         hasCreds() ? null : 'AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY'].filter(Boolean),
  };
}

module.exports = { configured, keep, signedUrl, exists, remove, state, keyFor, BUCKET, PREFIX };
