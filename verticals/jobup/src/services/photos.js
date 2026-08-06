'use strict';

// =============================================================
// Optional profile photo.
//
// A filename and a client-supplied Content-Type are both attacker-controlled,
// so neither is trusted: the format is decided by the file's own magic bytes.
// Anything that is not a real JPEG, PNG or WebP is refused rather than stored
// and served back to visitors from our own origin.
//
// Stored base64 in ju_assets rather than inside resume_json, so the JSON
// surfaces (resume.json, the agent card) stay small and cacheable.
// =============================================================

const MAX_BYTES = parseInt(process.env.JOBUP_PHOTO_MAX_BYTES || String(4 * 1024 * 1024), 10);

/** Identify by magic bytes. Returns a mime string, or null if unrecognised. */
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  // WebP: "RIFF" .... "WEBP"
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' &&
      buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Validate an uploaded photo.
 * Returns { ok, mime, bytes, base64 } or { ok:false, reason }.
 */
function accept(buffer, declaredMime) {
  if (!buffer || !buffer.length) return { ok: false, reason: 'empty file' };
  if (buffer.length > MAX_BYTES) {
    return { ok: false, reason: `photo is ${(buffer.length / 1048576).toFixed(1)} MB; the limit is ${(MAX_BYTES / 1048576).toFixed(0)} MB` };
  }
  const mime = sniff(buffer);
  if (!mime) {
    // An SVG would be the interesting one to smuggle — it can carry script and
    // would execute on the subscriber's own origin. Raster formats only.
    return { ok: false, reason: 'that is not a JPEG, PNG or WebP image' };
  }
  return { ok: true, mime, bytes: buffer.length, base64: buffer.toString('base64') };
}

/** Cache-busting tag so a replaced photo is not served from a stale cache. */
function etagFor(asset) {
  return `"p${asset.id}-${asset.bytes}"`;
}

module.exports = { accept, sniff, etagFor, MAX_BYTES };
