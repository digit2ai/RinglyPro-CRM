'use strict';

/**
 * QR codes for the truck.
 *
 * The slug is the company's whole web presence, so it has to survive being
 * printed on a truck door and scanned from six feet away in sunlight. SVG so it
 * scales to any sign size without pixelation, and error correction level H so a
 * scuffed or partly-dirty sticker still scans.
 *
 * Uses the `qrcode` package already present in the repo rather than
 * hand-rolling an encoder.
 */

let QRCode = null;
try { QRCode = require('qrcode'); } catch (e) { QRCode = null; }

/**
 * Synchronous SVG. qrcode exposes a sync segment/matrix API via create().
 */
function qrSvg(text, opts = {}) {
  const margin = opts.margin == null ? 2 : opts.margin;
  const dark = opts.dark || '#14331f';
  const light = opts.light || '#ffffff';

  if (!QRCode) return fallbackSvg(text, light, dark);

  let qr;
  try {
    qr = QRCode.create(String(text), { errorCorrectionLevel: 'H' });
  } catch (e) {
    return fallbackSvg(text, light, dark);
  }

  const size = qr.modules.size;
  const data = qr.modules.data;
  const total = size + margin * 2;

  // One path for every dark module keeps the file small and print-crisp.
  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) {
        path += `M${x + margin} ${y + margin}h1v1h-1z`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" `
    + `width="1024" height="1024" shape-rendering="crispEdges" role="img" `
    + `aria-label="QR code linking to ${escapeAttr(text)}">`
    + `<rect width="${total}" height="${total}" fill="${light}"/>`
    + `<path d="${path}" fill="${dark}"/>`
    + `</svg>`;
}

/**
 * If the encoder is unavailable we render an honest placeholder with the URL
 * on it rather than a broken image or a fake-looking grid that will not scan.
 */
function fallbackSvg(text, light, dark) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-label="QR unavailable">
<rect width="400" height="400" fill="${light}"/>
<rect x="12" y="12" width="376" height="376" fill="none" stroke="${dark}" stroke-width="3" stroke-dasharray="10 8"/>
<text x="200" y="180" text-anchor="middle" font-family="sans-serif" font-size="17" fill="${dark}">QR code unavailable</text>
<text x="200" y="212" text-anchor="middle" font-family="sans-serif" font-size="12" fill="${dark}">${escapeText(String(text).slice(0, 46))}</text>
</svg>`;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeText(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

module.exports = { qrSvg, available: !!QRCode };
