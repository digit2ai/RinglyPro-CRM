'use strict';
/**
 * Every uploaded photo goes through here. The type is decided by the file's
 * first bytes, never its name. Each image is re-encoded by sharp, which
 * applies the camera rotation and DROPS all metadata (GPS included).
 * HEIC is refused with the fix: sharp in this build cannot decode it.
 */
const crypto = require('crypto');
const sharp = require('sharp');

const MAX_BYTES = Number(process.env.STYLE_STUDIO_MAX_UPLOAD_MB || 15) * 1024 * 1024;

function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  const brand = buf.slice(4, 12).toString();
  if (/^ftyp(heic|heix|hevc|mif1|msf1)/.test(brand)) return 'heic';
  return null;
}

/**
 * @param {Buffer} buf
 * @param {{trim?: boolean}} opt  trim = auto-crop a plain, even background
 */
async function processUpload(buf, opt = {}) {
  if (!buf || !buf.length) { const e = new Error('empty_file'); e.status = 400; throw e; }
  if (buf.length > MAX_BYTES) { const e = new Error('file_too_large'); e.status = 413; throw e; }
  const kind = sniff(buf);
  if (kind === 'heic') { const e = new Error('heic_not_supported: set the iPhone camera to "Most Compatible" (Settings > Camera > Formats) or share the photo as JPEG'); e.status = 415; throw e; }
  if (!kind) { const e = new Error('not_an_image: JPEG, PNG or WebP only'); e.status = 415; throw e; }
  let img = sharp(buf, { failOn: 'error', limitInputPixels: 40e6, sequentialRead: true }).rotate();
  if (opt.trim) img = img.trim({ threshold: 18 });
  const data = await img.resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const meta = await sharp(data).metadata();
  const thumb = await sharp(data).resize({ width: 400, height: 400, fit: 'cover', position: 'attention' }).jpeg({ quality: 80 }).toBuffer();
  // A square crop from the middle of the garment: what fills the illustration.
  if (!meta.width || meta.width < 64 || meta.height < 64) { const e = new Error('image_too_small'); e.status = 400; throw e; }
  const side = Math.round(Math.min(meta.width, meta.height) * 0.45);
  const texture = await sharp(data)
    .extract({ left: Math.max(0, Math.round(meta.width / 2 - side / 2)), top: Math.max(0, Math.round(meta.height / 2 - side / 2)), width: side, height: side })
    .resize(256, 256).jpeg({ quality: 78 }).toBuffer();
  return { data, thumb, texture, mime: 'image/jpeg', width: meta.width, height: meta.height, sha: crypto.createHash('sha256').update(data).digest('hex') };
}

module.exports = { processUpload, sniff, MAX_BYTES };
