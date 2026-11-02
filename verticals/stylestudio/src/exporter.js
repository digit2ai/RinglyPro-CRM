'use strict';
/**
 * Exports: one outfit as a high-resolution PNG, one shirt against all five
 * trousers as one PNG, and a multi-page PDF catalog (four large outfits a page,
 * landscape, editorial). An outfit with a finished AI render uses the render;
 * otherwise the illustration, and the caption says which it is.
 */
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const W = require('./wardrobe');

const LABEL = { render: 'AI render, not an exact copy of the garments', sketch: 'Illustration, not a photo' };

async function outfitPng(tenantId, o, height = 2400) {
  if (o.render_id) {
    const r = await W.renderImage(tenantId, o.render_id);
    if (r) return { buf: await sharp(r.image).resize({ height, fit: 'inside' }).png().toBuffer(), kind: 'render' };
  }
  const svg = await W.sketchFor(tenantId, o);
  return { buf: await sharp(Buffer.from(svg), { density: 72 * (height / 1200) }).resize({ height }).png().toBuffer(), kind: 'sketch' };
}

async function comparisonPng(tenantId, list) {
  const H = 1600, w = 800, gap = 40, top = 140, bottom = 220;
  const tiles = [];
  for (const o of list) tiles.push(await outfitPng(tenantId, o, H));
  const width = list.length * w + (list.length + 1) * gap;
  const height = top + H + bottom;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const captions = list.map((o, i) => {
    const x = gap + i * (w + gap) + w / 2;
    return `<text x="${x}" y="${top + H + 70}" text-anchor="middle" font-family="Georgia,serif" font-size="40" fill="#1b2a44">${esc(o.pants.name)}</text>
      <text x="${x}" y="${top + H + 125}" text-anchor="middle" font-family="Helvetica,Arial" font-size="30" fill="#5d6470">Style ${o.eval.overall}/10 · Colour ${o.eval.color}/10</text>
      <text x="${x}" y="${top + H + 170}" text-anchor="middle" font-family="Helvetica,Arial" font-size="24" fill="#8a8f98">${esc(LABEL[tiles[i].kind])}</text>`;
  }).join('');
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#faf8f3"/>
    <text x="${gap}" y="90" font-family="Georgia,serif" font-size="56" fill="#1b2a44">${esc(list[0].shirt.name)} · five trousers</text>${captions}</svg>`);
  const comps = [];
  for (let i = 0; i < tiles.length; i++) {
    const t = await sharp(tiles[i].buf).resize({ width: w, height: H, fit: 'contain', background: '#faf8f3' }).png().toBuffer();
    comps.push({ input: t, left: gap + i * (w + gap), top });
  }
  return sharp(frame).composite(comps).png().toBuffer();
}

/** Streams a PDF into `res`. */
async function catalogPdf(tenantId, list, { title = "Manuel's Style Studio", subtitle = 'Outfit catalog' } = {}, res) {
  const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 36, info: { Title: title + ' · ' + subtitle } });
  doc.pipe(res);
  const navy = '#1b2a44', grey = '#6b7280';
  // Cover
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#faf8f3');
  doc.fillColor(navy).font('Times-Roman').fontSize(44).text(title, 60, 200, { width: doc.page.width - 120 });
  doc.font('Times-Italic').fontSize(22).fillColor(grey).text(subtitle + ' · ' + list.length + ' outfits', 60, 270);
  doc.font('Helvetica').fontSize(10).fillColor(grey).text('Scores are subjective styling guidance, not measurements. Each outfit is either an AI render (not an exact copy of the garments) or an illustration, as labelled under it.', 60, doc.page.height - 110, { width: doc.page.width - 120 });
  doc.text('Private. Generated ' + new Date().toISOString().slice(0, 10) + '.', 60, doc.page.height - 80);

  const perPage = 4, cellW = (doc.page.width - 72) / perPage, imgH = 410, imgW = imgH / 2;
  try {
  for (let i = 0; i < list.length; i++) {
    if (i % perPage === 0) {
      doc.addPage({ size: 'LETTER', layout: 'landscape', margin: 36 });
      doc.rect(0, 0, doc.page.width, doc.page.height).fill('#faf8f3');
      doc.font('Times-Roman').fontSize(13).fillColor(navy).text(title, 36, 22);
      doc.font('Helvetica').fontSize(8).fillColor(grey).text('Page ' + (Math.floor(i / perPage) + 2), doc.page.width - 100, 26, { width: 64, align: 'right' });
    }
    const o = list[i];
    const col = i % perPage, x = 36 + col * cellW;
    const img = await outfitPng(tenantId, o, 1100);
    doc.image(img.buf, x + (cellW - imgW) / 2, 50, { fit: [imgW, imgH], align: 'center' });
    const ty = 50 + imgH + 8;
    doc.font('Times-Bold').fontSize(11).fillColor(navy).text(o.shirt.name, x + 6, ty, { width: cellW - 12, align: 'center' });
    doc.font('Times-Roman').fontSize(10).fillColor(navy).text('with ' + o.pants.name, x + 6, doc.y, { width: cellW - 12, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(grey)
      .text('Style ' + o.eval.overall + '/10 · Colour ' + o.eval.color + '/10' + (o.favorite ? ' · Favourite' : ''), x + 6, doc.y + 2, { width: cellW - 12, align: 'center' })
      .text(o.eval.recommended.map((k) => o.eval.occasions.find((q) => q.key === k).label).join(', '), x + 6, doc.y, { width: cellW - 12, align: 'center' })
      .text(LABEL[img.kind], x + 6, doc.y, { width: cellW - 12, align: 'center' });
  }
  } catch (e) {
    // Headers are already sent; end the stream rather than leave the socket hanging.
    console.error('[stylestudio] pdf:', e.message);
    doc.font('Helvetica').fontSize(11).fillColor('#9b2c2c').text('The catalog stopped early: ' + (e.status ? e.message : 'an image could not be drawn') + '.', 36, 40);
  }
  doc.end();
}

module.exports = { outfitPng, comparisonPng, catalogPdf, LABEL };
