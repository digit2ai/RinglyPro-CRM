'use strict';
/**
 * The full-body ILLUSTRATION: a drawn figure of a mature, bald man in black
 * glasses wearing the selected shirt, trousers and white sneakers with a black V.
 *
 * It is what every outfit shows until an AI try-on render exists, and it is
 * labelled as an illustration everywhere it appears. Its job is honest and
 * narrow: show how the colours and patterns sit together, full body, every
 * time. Because the figure is drawn, the head, the trousers and both shoes are
 * inside the frame by construction (the SIT checks the geometry).
 *
 * When a shirt or trousers have an uploaded photo, a crop of that photo's own
 * fabric fills the garment, so the real colour and weave show through.
 */

const FRAME = { w: 600, h: 1200 };
// The vertical extent of every part, for the framing guarantee and the SIT.
const BOUNDS = { headTop: 70, shoeBottom: 1092, shoeLeft: 186, shoeRight: 414 };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hexOk = (h, d) => (/^#[0-9a-f]{6}$/i.test(String(h || '')) ? h : d);

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  return '#' + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function fabric(id, item, textureDataUrl) {
  const base = hexOk(item.color_hex, '#dddddd');
  const c2 = hexOk(item.color2_hex, shade(base, -0.25));
  if (textureDataUrl) {
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="160" height="160"><image href="${textureDataUrl}" width="160" height="160" preserveAspectRatio="xMidYMid slice"/></pattern>`;
  }
  switch (item.pattern) {
    case 'gingham':
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="20" height="20"><rect width="20" height="20" fill="${base}"/><rect width="10" height="20" fill="${c2}" opacity=".55"/><rect width="20" height="10" fill="${c2}" opacity=".55"/></pattern>`;
    case 'stripe':
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="14" height="14"><rect width="14" height="14" fill="${base}"/><rect width="5" height="14" fill="${c2}"/></pattern>`;
    case 'plaid': {
      const c3 = shade(c2, 0.25);
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="48" height="48"><rect width="48" height="48" fill="${base}"/><rect x="0" y="14" width="48" height="12" fill="${c2}" opacity=".7"/><rect x="14" y="0" width="12" height="48" fill="${c2}" opacity=".7"/><rect x="36" y="0" width="3" height="48" fill="${c3}" opacity=".8"/><rect x="0" y="36" width="48" height="3" fill="${c3}" opacity=".8"/></pattern>`;
    }
    case 'oxford':
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="${base}"/><rect width="3" height="3" fill="${shade(base, -0.035)}"/><rect x="3" y="3" width="3" height="3" fill="${shade(base, 0.02)}"/></pattern>`;
    default:
      return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="10" height="10"><rect width="10" height="10" fill="${base}"/></pattern>`;
  }
}

function denim(id, item, textureDataUrl) {
  if (textureDataUrl) return fabric(id, item, textureDataUrl);
  const base = hexOk(item.color_hex, '#22314f');
  const isDenim = /denim/i.test(item.garment_type || '') || /denim|jean/i.test(item.name || '');
  if (!isDenim) return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="${base}"/><path d="M0 8 L8 0" stroke="${shade(base, 0.03)}" stroke-width="1"/></pattern>`;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="${base}"/><path d="M0 6 L6 0 M-1 1 L1 -1 M5 7 L7 5" stroke="${shade(base, 0.07)}" stroke-width="1.2"/></pattern>`;
}

/**
 * @param {object} o  { shirt, pants, shoe, tucked, sleevesRolled, shirtTexture, pantsTexture, idp }
 * @returns {string} standalone SVG markup (600x1200)
 */
function render(o) {
  const p = o.idp || 'f';
  const shirt = o.shirt || {}, pants = o.pants || {}, shoe = o.shoe || {};
  const tucked = !!o.tucked, rolled = !!o.sleevesRolled;
  const skin = '#d8a98a', skinShade = '#c18f71';
  const shoeHex = hexOk(shoe.color_hex, '#f6f5f1');
  const logoHex = hexOk(shoe.color2_hex, '#111111');
  const collar = shade(hexOk(shirt.color_hex, '#dddddd'), -0.06);
  const hemY = tucked ? 582 : 632;
  const cuffY = rolled ? 470 : 568;
  const outline = '#2b2b2b';

  // Arm (sleeve) shape for one side; mirrored for the other.
  const sleeve = (s) => {
    const x = (v) => (s < 0 ? v : 600 - v);
    return `M${x(206)} 266 L${x(178)} 286 L${x(140)} ${cuffY - 8} L${x(166)} ${cuffY + 4} L${x(208)} 360 Z`;
  };
  const forearm = (s) => {
    const x = (v) => (s < 0 ? v : 600 - v);
    if (!rolled) return '';
    return `<path d="M${x(141)} ${cuffY - 6} L${x(166)} ${cuffY + 2} L${x(158)} 580 L${x(130)} 574 Z" fill="${skin}" stroke="${skinShade}" stroke-width="1.5"/>`;
  };
  const hand = (s) => `<ellipse cx="${s < 0 ? 143 : 457}" cy="${rolled ? 598 : 594}" rx="17" ry="25" fill="${skin}" stroke="${skinShade}" stroke-width="1.5"/>`;

  const pantsPath = `M206 572 L394 572 L398 640 L392 1040 L312 1040 L302 660 L298 660 L288 1040 L208 1040 L202 640 Z`;
  const shirtBody = `M206 262 Q300 236 394 262 L420 292 L404 ${hemY} Q300 ${hemY + 14} 196 ${hemY} L180 292 Z`;

  const shoeSide = (s) => {
    // s = -1 left, 1 right. The toe points outward a little, as in a relaxed stance.
    const x0 = s < 0 ? 196 : 312, x1 = s < 0 ? 290 : 404;
    const toe = s < 0 ? x0 - 10 : x1 + 10;
    const heel = s < 0 ? x1 : x0;
    const top = 1036, sole = 1078;
    const vX = (x0 + x1) / 2;
    return `<path d="M${heel} ${top} L${heel} ${sole} L${toe} ${sole} Q${toe + (s < 0 ? -2 : 2)} ${top + 18} ${(toe + heel) / 2} ${top + 6} Z" fill="${shoeHex}" stroke="${outline}" stroke-width="2"/>
      <rect x="${Math.min(toe, heel) - 1}" y="${sole - 2}" width="${Math.abs(heel - toe) + 2}" height="12" rx="4" fill="#ece9e2" stroke="${outline}" stroke-width="1.5"/>
      <path d="M${vX - 16} ${top + 14} L${vX} ${top + 34} L${vX + 16} ${top + 14}" fill="none" stroke="${logoHex}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M${(toe + heel) / 2 - 10} ${top + 8} l20 0" stroke="#cfcac0" stroke-width="2"/>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRAME.w} ${FRAME.h}" width="${FRAME.w}" height="${FRAME.h}">
<defs>
  <linearGradient id="${p}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f3ec"/><stop offset=".78" stop-color="#ece6da"/><stop offset="1" stop-color="#e2dacb"/></linearGradient>
  <radialGradient id="${p}sh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <linearGradient id="${p}vol" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".14"/><stop offset=".3" stop-color="#000" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>
  ${fabric(p + 'shirt', shirt, o.shirtTexture)}
  ${denim(p + 'pants', pants, o.pantsTexture)}
</defs>
<rect width="600" height="1200" fill="url(#${p}bg)"/>
<ellipse cx="300" cy="1094" rx="190" ry="26" fill="url(#${p}sh)"/>
<!-- legs / trousers -->
<path d="${pantsPath}" fill="url(#${p}pants)" stroke="${outline}" stroke-width="2"/>
<path d="${pantsPath}" fill="url(#${p}vol)"/>
<path d="M300 590 L300 660" stroke="${shade(hexOk(pants.color_hex, '#22314f'), -0.15)}" stroke-width="2"/>
<path d="M206 590 L394 590" stroke="${shade(hexOk(pants.color_hex, '#22314f'), -0.12)}" stroke-width="2"/>
${shoeSide(-1)}${shoeSide(1)}
<!-- arms -->
${forearm(-1)}${forearm(1)}${hand(-1)}${hand(1)}
<path d="${sleeve(-1)}" fill="url(#${p}shirt)" stroke="${outline}" stroke-width="2"/>
<path d="${sleeve(1)}" fill="url(#${p}shirt)" stroke="${outline}" stroke-width="2"/>
<!-- neck -->
<path d="M276 206 L324 206 L330 258 L270 258 Z" fill="${skin}" stroke="${skinShade}" stroke-width="1.5"/>
<!-- torso / shirt -->
<path d="${shirtBody}" fill="url(#${p}shirt)" stroke="${outline}" stroke-width="2"/>
<path d="${shirtBody}" fill="url(#${p}vol)"/>
${tucked ? `<rect x="204" y="566" width="192" height="16" fill="#3a2a1e" stroke="${outline}" stroke-width="1.5"/><rect x="290" y="566" width="20" height="16" fill="none" stroke="#c9b38a" stroke-width="3"/>` : ''}
<path d="M300 262 L300 ${hemY + 6}" stroke="${shade(collar, -0.15)}" stroke-width="2"/>
${[300, 350, 400, 450, 500, 550].filter((y) => y < hemY - 10).map((y) => `<circle cx="306" cy="${y}" r="3.5" fill="#f2efe8" stroke="#8a8578" stroke-width="1"/>`).join('')}
<!-- button-down collar -->
<path d="M268 250 L300 290 L286 300 L250 270 Z" fill="${collar}" stroke="${outline}" stroke-width="1.8"/>
<path d="M332 250 L300 290 L314 300 L350 270 Z" fill="${collar}" stroke="${outline}" stroke-width="1.8"/>
<circle cx="262" cy="275" r="2.5" fill="#f2efe8" stroke="#8a8578"/><circle cx="338" cy="275" r="2.5" fill="#f2efe8" stroke="#8a8578"/>
<!-- small embroidered chest mark (generic, not a brand logo) -->
<ellipse cx="350" cy="338" rx="7" ry="5" fill="${shade(hexOk(shirt.color2_hex || shirt.color_hex, '#1d2a4a'), -0.35)}" opacity=".8"/>
<!-- head: bald, black-framed glasses -->
<ellipse cx="244" cy="148" rx="11" ry="18" fill="${skin}" stroke="${skinShade}" stroke-width="1.5"/>
<ellipse cx="356" cy="148" rx="11" ry="18" fill="${skin}" stroke="${skinShade}" stroke-width="1.5"/>
<ellipse cx="300" cy="140" rx="57" ry="70" fill="${skin}" stroke="${skinShade}" stroke-width="2"/>
<ellipse cx="282" cy="92" rx="26" ry="12" fill="#fff" opacity=".18"/>
<path d="M278 186 Q300 198 322 186" fill="none" stroke="#8c5a46" stroke-width="3" stroke-linecap="round"/>
<path d="M300 140 L296 168 L304 168" fill="none" stroke="${skinShade}" stroke-width="2"/>
<rect x="258" y="124" width="36" height="26" rx="7" fill="#ffffff" fill-opacity=".25" stroke="#111" stroke-width="5"/>
<rect x="306" y="124" width="36" height="26" rx="7" fill="#ffffff" fill-opacity=".25" stroke="#111" stroke-width="5"/>
<path d="M294 134 L306 134" stroke="#111" stroke-width="4"/>
<path d="M258 132 L245 136 M342 132 L355 136" stroke="#111" stroke-width="4"/>
<circle cx="276" cy="138" r="3" fill="#2a1f1a"/><circle cx="324" cy="138" r="3" fill="#2a1f1a"/>
<path d="M264 116 Q276 110 290 115 M310 115 Q324 110 336 116" fill="none" stroke="#6b5448" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}

module.exports = { render, FRAME, BOUNDS, esc };
