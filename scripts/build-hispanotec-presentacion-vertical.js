#!/usr/bin/env node
/*
 * Builds the PHONE (portrait) version of /hispanotec_presentacion.
 *
 * The slides are the association's own PowerPoint pages, so nothing is redrawn:
 * each landscape slide is cut into its pieces (title, cards, columns, image) and
 * the pieces are stacked top to bottom on a 1080 px wide canvas. Same images,
 * same fonts, same colours; only the arrangement changes so a phone held upright
 * never has to move sideways.
 *
 * Usage:
 *   node scripts/build-hispanotec-presentacion-vertical.js "<path to the PDF>"
 * Needs pdftoppm (poppler) at build time only. Writes:
 *   public/hispanotec_presentacion/slides/sNN.jpg     (landscape, 1920x1080)
 *   public/hispanotec_presentacion/vertical/vNN.jpg   (portrait, 1080 wide)
 *   public/hispanotec_presentacion/vertical/layout.json (link areas per slide)
 *
 * Coordinates below are in tenths of the slide (0..10 across, 0..10 down).
 * A row's pieces share one height and fill `w` pixels (default 1080).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const PDF = process.argv[2];
const OUT = path.join(__dirname, '..', 'public', 'hispanotec_presentacion');
const W = 1080, PAD = 34, GAP = 22;
const LIGHT = '#f4f3ef', WHITE = '#ffffff';

// One entry per slide: { bg, rows: [{ r:[[x0,y0,x1,y1],...], w?, link? }] }
const L = {
  1: { rows: [{ r: [[0.3, 1.6, 4.8, 8.7]] }, { r: [[4.8, 0.5, 10, 8]] }] },
  2: { rows: [{ r: [[3.8, 2.4, 8.5, 8.4]] }, { r: [[0, 2.6, 3.8, 7.2]] }] },
  3: { rows: [{ r: [[0.5, 0.6, 7.6, 3.05]] },
    { r: [[0.45, 3.3, 2.85, 6.0]], w: 780 }, { r: [[2.9, 3.3, 5.3, 6.0]], w: 780 },
    { r: [[5.3, 3.3, 7.7, 6.0]], w: 780 }, { r: [[0.45, 6.0, 2.85, 8.65]], w: 780 },
    { r: [[2.95, 6.0, 5.35, 8.65]], w: 780 }, { r: [[0.4, 9.3, 9.5, 9.9]] }] },
  4: { bg: WHITE, rows: [{ r: [[0, 0, 10, 2.85]] }, { r: [[0.2, 2.9, 3.1, 10]], w: 760 }, { r: [[3.3, 2.9, 10, 10]] }] },
  5: { bg: LIGHT, rows: [{ r: [[0.2, 0.2, 4.5, 8.8]], w: 1000 }, { r: [[0, 8.85, 4.3, 10]], w: 1000 }, { r: [[4.35, 0.3, 10, 9.8]] }] },
  6: { bg: '#0b1633', rows: [{ r: [[0.2, 0.2, 4.9, 8.4]] }, { r: [[4.8, 0.6, 10, 9.3]] }, { r: [[0.2, 8.6, 4.2, 9.9]], w: 800 }] },
  7: { bg: '#0b1633', rows: [{ r: [[0.2, 0.3, 4.6, 4.2]] }, { r: [[0.2, 4.2, 2.25, 7.9]], w: 640 }, { r: [[4.3, 0.3, 8.5, 7.0]] },
    { r: [[8.5, 0.9, 9.9, 5.0]], w: 560 }, { r: [[8.5, 5.0, 9.9, 7.6]], w: 560 }, { r: [[2.3, 7.1, 7.4, 9.1]] }] },
  8: { bg: '#0b1633', rows: [{ r: [[0.2, 0.3, 4.6, 8.6]] }, { r: [[4.7, 0.6, 10, 9.2]] }, { r: [[0.2, 8.7, 3.6, 9.9]], w: 800 }] },
  9: { rows: [{ r: [[0.2, 0.4, 4.0, 9.4]] }, { r: [[3.9, 0.2, 10, 9.4]] }] },
  10: { rows: [{ r: [[1.5, 0, 8.5, 2.5]] }, { r: [[0.6, 3, 3.7, 7.6]], w: 760 }, { r: [[3.8, 3, 6.8, 7.6]], w: 760 },
    { r: [[6.9, 3, 10, 7.6]], w: 760 }, { r: [[1.2, 8.8, 8.8, 9.9]] }] },
  11: { rows: [{ r: [[1.5, 0, 8.7, 2.25]] }, { r: [[1.9, 2.25, 8.1, 2.9]] },
    { r: [[0.2, 2.85, 2.1, 8.3], [2.1, 2.85, 4.0, 8.3]] }, { r: [[4.0, 2.85, 5.9, 8.3], [5.9, 2.85, 7.85, 8.3]] },
    { r: [[7.85, 2.85, 9.8, 8.3]], w: 540 }, { r: [[0.9, 8.1, 6.3, 9.2]] }, { r: [[6.3, 8.1, 9.15, 9.2]], w: 640 }] },
  12: { rows: [{ r: [[0.4, 0.4, 9.0, 2.05]] },
    { r: [[0.45, 2.5, 2.25, 7.45], [2.25, 2.5, 4.05, 7.45]] }, { r: [[4.05, 2.5, 5.85, 7.45], [5.85, 2.5, 7.65, 7.45]] },
    { r: [[7.65, 2.5, 9.5, 7.45]], w: 540 }, { r: [[0.45, 7.6, 4.95, 9.1]] }, { r: [[5.0, 7.6, 9.5, 9.1]] }] },
  13: { rows: [{ r: [[1.9, 0, 8.2, 1.55]] }, { r: [[0, 1.6, 2.65, 7.45]], w: 760 }, { r: [[2.65, 1.6, 5.25, 7.45]], w: 760 },
    { r: [[5.25, 1.6, 7.7, 7.45]], w: 760 }, { r: [[7.7, 1.6, 10, 7.45]], w: 760 },
    { r: [[1.9, 7.5, 4.8, 9.1]], w: 860 }, { r: [[4.7, 7.5, 7.75, 9.1]], w: 860 }, { r: [[3.7, 9.1, 6.3, 9.95]], w: 520 }] },
  14: { rows: [{ r: [[1.5, 0, 8.5, 1.65]] }, { r: [[0.3, 1.8, 2.75, 7.0]], w: 760 }, { r: [[2.75, 1.8, 5.0, 7.0]], w: 760 },
    { r: [[5.0, 1.8, 7.45, 7.0]], w: 760 }, { r: [[7.45, 1.8, 10, 7.0]], w: 760 },
    { r: [[2.2, 7.0, 5.0, 9.1]], w: 860 }, { r: [[5.0, 7.0, 7.8, 9.1]], w: 860 }, { r: [[3.8, 9.1, 6.2, 9.95]], w: 520 }] },
  15: { bg: WHITE, rows: [{ r: [[0.2, 0, 6, 0.95]], w: 820 }, { r: [[0.7, 0.95, 7.5, 3.5]] },
    { r: [[0.8, 3.6, 2.95, 9.5], [2.95, 3.6, 5.05, 9.5]] }, { r: [[5.05, 3.6, 7.15, 9.5], [7.15, 3.6, 9.3, 9.5]] }] },
  16: { bg: WHITE, rows: [{ r: [[0, 0, 10, 3.0]] }, { r: [[0.2, 3, 5, 8.85]] }, { r: [[5, 3, 10, 10]] }] },
  17: { rows: [{ r: [[1.0, 0, 9.0, 1.95]] }, { r: [[0.45, 2.55, 3.2, 7.25], [3.2, 2.55, 4.6, 7.25]] },
    { r: [[4.6, 2.55, 5.95, 7.25], [5.95, 2.55, 7.35, 7.25]] }, { r: [[7.4, 2.3, 10, 8.8]], w: 800 }, { r: [[1, 7.2, 7.3, 9.9]] }] },
  18: { bg: LIGHT, rows: [{ r: [[1, 0, 9, 2.5]] },
    { r: [[3.8, 2.6, 6.1, 4.6]], w: 760 }, { r: [[5.8, 3.5, 8.6, 5.2]], w: 760 }, { r: [[6.0, 5.3, 9.3, 7.0]], w: 760 },
    { r: [[5.3, 7.0, 8.1, 8.7]], w: 760 }, { r: [[2.0, 7.0, 4.6, 8.7]], w: 760 }, { r: [[0.9, 5.3, 4.0, 7.0]], w: 760 },
    { r: [[1.4, 3.5, 4.1, 5.2]], w: 760 }, { r: [[2.5, 8.75, 7.5, 9.9]] }] },
  19: { bg: LIGHT, rows: [{ r: [[0.8, 0.2, 9.2, 2.2]] }, { r: [[4.9, 2.4, 9.4, 9]] }, { r: [[0, 2.2, 5.2, 9]] }, { r: [[0, 8.95, 10, 10]] }] },
  20: { bg: '#06112a', rows: [{ r: [[1.8, 0, 8.2, 1.55]] }, { r: [[1, 1.5, 9, 4.3]] }, { r: [[0.1, 4.2, 3.1, 9.4]], w: 900 },
    { r: [[3.1, 4.2, 6.7, 9.4]] }, { r: [[6.7, 4.2, 9.9, 9.4]], w: 960 },
    { r: [[0.8, 9.4, 8.6, 10]], link: 'https://aiagent.ringlypro.com/hispanotec/ecosystem/index.html' }] },
  21: { bg: WHITE, rows: [{ r: [[1.3, 1.0, 8.4, 3.0]] }, { r: [[0.6, 3.1, 3.9, 7.35]] }, { r: [[3.9, 3.1, 7.25, 7.35]] },
    { r: [[7.4, 3.1, 9.2, 7.45]], w: 520, link: 'https://hispanotec.org/formulario-de-inscripcion/' },
    { r: [[0.6, 7.6, 5.0, 8.9]] }, { r: [[5.0, 7.6, 9.2, 8.9]] }, { r: [[0.4, 8.9, 5.5, 10]] }, { r: [[5.5, 8.9, 9.3, 10]], w: 820 }] },
  22: { bg: LIGHT, rows: [{ r: [[1.8, 0.1, 8.2, 4.0]] },
    { r: [[0.4, 4.2, 1.85, 8.2], [1.95, 4.2, 3.4, 8.2], [3.5, 4.2, 4.95, 8.2]] },
    { r: [[5.0, 4.2, 6.45, 8.2], [6.55, 4.2, 8.0, 8.2], [8.1, 4.2, 9.55, 8.2]] }, { r: [[0.3, 8.4, 8.0, 10]] }] },
  23: { rows: [{ r: [[0.5, 0.4, 5.6, 7.9]] }, { r: [[5.6, 0.5, 10, 8]] }, { r: [[0.3, 7.8, 9.5, 10]] }] }
};

async function cornerColor(file) {
  // Median of the border pixels: the slide's ground colour, ignoring glows and vignettes.
  const { data, info } = await sharp(file).resize(64, 36, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) {
    if (x > 2 && x < 61 && y > 2 && y < 33) continue;
    const i = (y * info.width + x) * info.channels; px.push([data[i], data[i + 1], data[i + 2]]);
  }
  px.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const c = px[Math.floor(px.length / 2)];
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

(async () => {
  if (!PDF || !fs.existsSync(PDF)) { console.error('Usage: node ' + path.basename(__filename) + ' "<pdf>"'); process.exit(1); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv-'));
  execFileSync('pdftoppm', ['-r', '220', '-png', PDF, path.join(tmp, 'p')]);
  fs.mkdirSync(path.join(OUT, 'slides'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'vertical'), { recursive: true });
  const pages = fs.readdirSync(tmp).filter(f => f.endsWith('.png')).sort();
  const layout = {};
  for (let i = 1; i <= pages.length; i++) {
    const n = String(i).padStart(2, '0');
    const page = path.join(tmp, pages[i - 1]);
    const meta = await sharp(page).metadata();
    // The slide is a 16:9 band centred on an A4 page.
    const sw = meta.width, sh = Math.round(sw * 9 / 16), top = Math.round((meta.height - sh) / 2);
    const slide = await sharp(page).extract({ left: 0, top, width: sw, height: sh }).png().toBuffer();
    await sharp(slide).resize(1920, 1080).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(OUT, 'slides', 's' + n + '.jpg'));
    const spec = L[i];
    if (!spec) throw new Error('no vertical layout for slide ' + i);
    const bg = spec.bg || await cornerColor(slide);
    const parts = [], links = [], rowsOut = [];
    let y = PAD;
    for (const row of spec.rows) {
      const rw = Math.min(row.w || W - 2 * PAD, W - 2 * PAD);
      const boxes = row.r.map(([x0, y0, x1, y1]) => {
        const left = Math.round(x0 / 10 * sw), t = Math.round(y0 / 10 * sh);
        const width = Math.min(sw - left, Math.round((x1 - x0) / 10 * sw)), height = Math.min(sh - t, Math.round((y1 - y0) / 10 * sh));
        return { left, top: t, width, height };
      });
      const ratioSum = boxes.reduce((a, b) => a + b.width / b.height, 0);
      const inner = rw - GAP * (boxes.length - 1);
      const H = Math.round(inner / ratioSum);
      let x = Math.round((W - rw) / 2);
      for (const b of boxes) {
        const w = Math.round(b.width / b.height * H);
        const img = await sharp(slide).extract(b).resize(w, H).png().toBuffer();
        parts.push({ input: img, left: x, top: y });
        x += w + GAP;
      }
      if (row.link) links.push({ href: row.link, top: y, left: Math.round((W - rw) / 2), width: rw, height: H });
      rowsOut.push({ top: y, height: H });
      y += H + GAP;
    }
    const total = y - GAP + PAD;
    await sharp({ create: { width: W, height: total, channels: 3, background: bg } })
      .composite(parts).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, 'vertical', 'v' + n + '.jpg'));
    layout[i] = {
      h: total, bg, rows: rowsOut,
      links: links.map(l => ({ href: l.href, top: +(l.top / total * 100).toFixed(2), left: +(l.left / W * 100).toFixed(2), width: +(l.width / W * 100).toFixed(2), height: +(l.height / total * 100).toFixed(2) }))
    };
    console.log('slide ' + n + ': ' + W + 'x' + total + ' bg ' + bg);
  }
  fs.writeFileSync(path.join(OUT, 'vertical', 'layout.json'), JSON.stringify(layout));
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
