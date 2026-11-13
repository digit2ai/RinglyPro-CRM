#!/usr/bin/env node
/* Builds grupolabora.com (public/grupolabora/) from the D2S copy of synthexsai.com
 * (public/d2s/): same landing, deck and calculator, with Labora's name, logo and
 * the two brand colours of Labora's own PDF (Azul #02427F, Verde #159F79), light
 * theme by default like that PDF. Re-run after editing the D2S pages:
 *   node scripts/build-grupolabora.js
 * Logo source: scripts/grupolabora-logo-source.png (the image inside the PDF). */
const fs = require('fs'), path = require('path'), sharp = require('sharp');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'public/d2s'), OUT = path.join(ROOT, 'public/grupolabora');
const BLUE = '#02427F', GREEN = '#159F79';

// Synthex/D2S palette -> Labora palette (case-insensitive). Fills become green,
// indigo becomes Labora blue, the near-black grounds become a deep Labora navy.
const COLORS = [
  [/#00F2FE|#00E5FF|#7DF9FF/gi, GREEN],
  [/#A5F3FC/gi, '#8FE3C8'],
  [/rgba\(\s*0\s*,\s*242\s*,\s*254/gi, 'rgba(21,159,121'],
  [/rgba\(\s*34\s*,\s*211\s*,\s*238/gi, 'rgba(21,159,121'],
  [/#6366F1|#4F46E5/gi, BLUE],
  [/#A5B4FC/gi, '#9CC3EE'],
  [/rgba\(\s*99\s*,\s*102\s*,\s*241/gi, 'rgba(46,109,180'],
  [/rgba\(\s*79\s*,\s*70\s*,\s*229/gi, 'rgba(2,66,127'],
  [/#3B82F6/gi, '#2E6DB4'],
  [/#EC4899/gi, '#0E7A5D'],
  [/rgba\(\s*236\s*,\s*72\s*,\s*153/gi, 'rgba(14,122,93'],
  [/#0E7490/gi, BLUE],
  [/#0B0F17/gi, '#021A33'],
  [/#0E1320/gi, '#04213F'],
  [/#161F30|#131E33/gi, '#0A2E55'],
  [/#0F1728|#111827|#121A2C/gi, '#05254A'],
  [/#1B2638/gi, '#0D3763'],
  [/#04121A/gi, '#011526'],
  [/rgba\(\s*11\s*,\s*15\s*,\s*23/gi, 'rgba(2,26,51'],
  // the moving star field: indigo/pink/orange dots -> Labora blues and greens
  [/rgba\(140,165,255,/g, 'rgba(2,66,127,'], [/rgba\(230,73,128,/g, 'rgba(21,159,121,'], [/rgba\(255,146,43,/g, 'rgba(46,109,180,'], [/rgba\(190,205,255,/g, 'rgba(143,227,200,'],
  [/rgba\(\s*22\s*,\s*31\s*,\s*48/gi, 'rgba(10,46,85'],
];

const LOGO_IMG = (h, cls) => `<img src="LOGO" width="${h}" height="${h}" alt="" class="${cls}" style="border-radius:50%;background:#fff;display:block">`;

function text(s, rel) {
  // rel = path from this page to the site root ('' for /, '../' for /pymes/)
  return s
    .replace(/https:\/\/aiagent\.ringlypro\.com\/d2s\//g, 'https://grupolabora.com/')
    .replace(/aiagent\.ringlypro\.com\/d2s/g, 'grupolabora.com')
    .replace(/href="\/d2s\/apple-touch-icon\.png"/g, `href="${rel}apple-touch-icon.png"`)
    .replace(/href="\/d2s\/pymes\/"/g, `href="${rel}pymes/"`)
    .replace(/brand=d2s/g, 'brand=labora').replace(/data-brand="d2s"/g, 'data-brand="labora"')
    .replace(/brand: 'd2s'/g, "brand: 'labora'").replace(/data-agent="d2s"/g, 'data-agent="labora"')
    .replace(/persona "d2s"/g, 'persona "labora"')
    .replace(/d2s_(theme|lang)/g, 'labora_$1').replace(/d2s-(landing|demo)/g, 'grupolabora-$1')
    .replace(/D2SBookDemo/g, 'LaboraBookDemo').replace(/d2stars/g, 'labstars')
    .replace(/brand d2s/g, 'brand labora').replace(/&copy; 2026 D2S/g, '&copy; 2026 Labora · Cali, Colombia').replace(/'D2S - '/g, "'Labora - '").replace(/\['D2S'\]/g, "['Labora']")
    .replace(/D2S Engine v2\.4/g, 'Labora · IA')
    .replace(/D2S <i>SAI<\/i>/g, 'Labora').replace(/MCP · D2S ENGINE/g, 'PERSONAS · EMPRESAS · OPORTUNIDADES')
    .replace(/og\.jpg\?v=2/g, 'og.jpg?v=3')
    .replace(/D2S/g, 'Labora');
}

function brand(html, rel) {
  // nav logo (inline SVG + word) -> the Labora logo image
  html = html.replace(/(<a class="logo"[^>]*>)\s*<svg[\s\S]*?<\/svg>/, `$1\n      ${LOGO_IMG(36, 'lablogo')}`);
  // deck logo plates
  html = html.replace(/<div class="sxw"><svg[\s\S]*?<\/svg>/g, `<div class="sxw">${LOGO_IMG(58, 'lablogo')}`);
  // favicon: the data-URI SVG -> the logo PNG
  html = html.replace(/<link rel="icon" type="image\/svg\+xml" href="data:[^"]*">/, `<link rel="icon" type="image/png" href="${rel}icon-512.png">`);
  html = html.replace(/LOGO/g, `${rel}logo.png`);
  for (const [re, to] of COLORS) html = html.replace(re, to);
  return html;
}

function lightDefault(html) {
  // Labora's PDF is a light document: white ground, navy bands, green accents.
  return html
    .replace('<html lang="es" data-theme="dark">', '<html lang="es" data-theme="light">')
    .replace(/html\[data-theme="light"\]\{\s*--bg:#F7F9FC;/, (m) => m) // keep the light block as is
    .replace(/(html\[data-theme="light"\]\{[\s\S]*?--cyt:)[^;]+;--g1:[^;]+;--g2:[^;]+;/, `$1${BLUE};--g1:${BLUE};--g2:${GREEN};`);
}

(async () => {
  const pages = [['index.html', ''], ['pymes/index.html', '../'], ['pymes/calculadora/index.html', '../../']];
  for (const [p, rel] of pages) {
    let h = fs.readFileSync(path.join(SRC, p), 'utf8');
    h = brand(text(h, rel), rel);
    if (p === 'index.html') h = lightDefault(h);
    fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true });
    fs.writeFileSync(path.join(OUT, p), h);
    const left = (h.match(/D2S|d2s|aiagent\.ringlypro\.com\/d2s|#00F2FE|#6366F1/gi) || []);
    console.log(p, h.length, 'bytes', left.length ? 'LEFTOVER: ' + [...new Set(left)].join(',') : 'clean');
  }
  // images from the logo inside the PDF
  // The logo is a CIRCLE: crop the PDF image to a square and cut everything outside
  // its ring to transparent, so no square edge shows anywhere (owner 2026-11-13).
  const raw = path.join(__dirname, 'grupolabora-logo-source.png');
  const meta = await sharp(raw).metadata(); const side = Math.min(meta.width, meta.height);
  const sq = await sharp(raw).extract({ left: Math.floor((meta.width - side) / 2), top: Math.floor((meta.height - side) / 2), width: side, height: side }).png().toBuffer();
  const mask = Buffer.from(`<svg width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${side / 2 - 2}" fill="#fff"/></svg>`);
  const src = await sharp(sq).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  await sharp(src).resize(512, 512).png().toFile(path.join(OUT, 'icon-512.png'));
  await sharp(src).resize(180, 180).flatten({ background: '#ffffff' }).png().toFile(path.join(OUT, 'apple-touch-icon.png'));
  await sharp(src).resize(256, 256).png().toFile(path.join(OUT, 'logo.png'));
  const logo = await sharp(src).resize(420, 420).png().toBuffer();
  const og = (title, sub) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="${BLUE}"/><rect y="600" width="1200" height="30" fill="${GREEN}"/>
    <text x="540" y="270" font-family="Helvetica,Arial,sans-serif" font-size="64" font-weight="800" fill="#fff">${title}</text>
    <text x="540" y="340" font-family="Helvetica,Arial,sans-serif" font-size="30" fill="#CFE3F5">${sub}</text>
    <text x="540" y="420" font-family="Helvetica,Arial,sans-serif" font-size="21" letter-spacing="2" fill="#8FE3C8">PERSONAS | EMPRESAS | OPORTUNIDADES</text></svg>`);
  for (const [file, t, s] of [['og.jpg', 'Labora', 'Inteligencia artificial para tu empresa'], ['pymes/og.jpg', 'Labora', 'Automatización con IA · Presentación']]) {
    await sharp(og(t, s)).composite([{ input: logo, left: 80, top: 105 }])
      .jpeg({ quality: 88 }).toFile(path.join(OUT, file));
  }
  console.log('images written');
})().catch((e) => { console.error(e); process.exit(1); });
