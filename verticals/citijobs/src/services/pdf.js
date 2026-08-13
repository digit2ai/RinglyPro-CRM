'use strict';

/**
 * Résumé PDF rendering, server-side, via pdfkit (already a repo dependency).
 *
 * Deliberately NOT headless Chrome: Render has no Chrome binary, and a feature
 * that works on the laptop and 500s in production is worse than no feature.
 * pdfkit's base-14 Helvetica needs no font files and renders identically
 * everywhere.
 *
 * The PDF is rendered on demand FROM THE STORED CONTENT, never read off disk.
 * Render's disk is ephemeral, so a stored file path would evaporate on the next
 * redeploy and take the "recover the exact document I sent Citi" guarantee with
 * it. Same content in, same bytes out.
 */

const PDFDocument = require('pdfkit');

const NAVY = '#1a3d6d';
const INK = '#111111';
const MUTED = '#444444';

function money(cents) {
  return '$' + Number(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * content: {
 *   name, headline, contact[], target_line,
 *   summary,
 *   competencies: [{label, text}],
 *   roles: [{title, meta, bullets:[string]}],
 *   skills: [{label, text}],
 *   education: [string]
 * }
 */
function render(content, { title } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 46, bottom: 46, left: 50, right: 50 },
        info: {
          Title: title || `${content.name || 'Resume'}`,
          Author: content.name || 'Resume',
          Creator: 'Citi Opportunity Tracker'
        }
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // Header
      doc.font('Helvetica-Bold').fontSize(21).fillColor(INK)
        .text(content.name || '', { width: W });
      if (content.headline) {
        doc.moveDown(0.15);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY)
          .text(content.headline, { width: W });
      }
      if (content.contact && content.contact.length) {
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(8.8).fillColor(MUTED)
          .text(content.contact.join('  ·  '), { width: W });
      }
      if (content.target_line) {
        doc.moveDown(0.15);
        doc.font('Helvetica').fontSize(8.8).fillColor(MUTED)
          .text(content.target_line, { width: W });
      }

      const heading = (t) => {
        doc.moveDown(0.7);
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(9.6).fillColor(NAVY)
          .text(String(t).toUpperCase(), { width: W, characterSpacing: 1 });
        doc.moveTo(doc.page.margins.left, doc.y + 1.5)
          .lineTo(doc.page.margins.left + W, doc.y + 1.5)
          .lineWidth(1).strokeColor(NAVY).stroke();
        doc.moveDown(0.45);
        return y;
      };

      const body = (t, opts) => doc.font('Helvetica').fontSize(9.6).fillColor(INK)
        .text(t, Object.assign({ width: W, align: 'left', lineGap: 1.1 }, opts || {}));

      if (content.summary) {
        heading('Professional Summary');
        body(content.summary, { align: 'justify' });
      }

      if (content.competencies && content.competencies.length) {
        heading('Areas of Impact');
        for (const c of content.competencies) {
          doc.font('Helvetica-Bold').fontSize(9.4).fillColor(NAVY)
            .text(c.label + ' ', { continued: true, width: W });
          doc.font('Helvetica').fontSize(9.4).fillColor(INK)
            .text(c.text, { width: W, lineGap: 0.8 });
          doc.moveDown(0.22);
        }
      }

      if (content.roles && content.roles.length) {
        heading('Professional Experience');
        content.roles.forEach((r, i) => {
          if (i) doc.moveDown(0.5);
          doc.font('Helvetica-Bold').fontSize(10.2).fillColor(INK).text(r.title, { width: W });
          if (r.meta) {
            doc.font('Helvetica-Oblique').fontSize(8.8).fillColor(MUTED)
              .text(r.meta, { width: W });
          }
          if (r.note) {
            doc.moveDown(0.15);
            doc.font('Helvetica-Oblique').fontSize(8.4).fillColor(MUTED)
              .text(r.note, { width: W, lineGap: 0.6 });
          }
          doc.moveDown(0.25);
          for (const b of r.bullets || []) {
            const x = doc.page.margins.left;
            const startY = doc.y;
            doc.font('Helvetica').fontSize(9.5).fillColor(INK).text('•', x, startY, { width: 10 });
            doc.font('Helvetica').fontSize(9.5).fillColor(INK)
              .text(String(b), x + 12, startY, { width: W - 12, lineGap: 1 });
            doc.moveDown(0.22);
          }
        });
      }

      if (content.skills && content.skills.length) {
        heading('Technical Skills');
        for (const s of content.skills) {
          doc.font('Helvetica-Bold').fontSize(9.2).fillColor(NAVY)
            .text(s.label + ': ', { continued: true, width: W });
          doc.font('Helvetica').fontSize(9.2).fillColor(INK)
            .text(s.text, { width: W, lineGap: 0.8 });
          doc.moveDown(0.18);
        }
      }

      if (content.education && content.education.length) {
        heading('Education');
        for (const e of content.education) {
          doc.font('Helvetica').fontSize(9.4).fillColor(INK).text(String(e), { width: W });
          doc.moveDown(0.15);
        }
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** Filename the ATS and the owner will both recognise six weeks later. */
function filename(profileName, reqId, version) {
  const who = String(profileName || 'Resume').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const v = Number(version || 1) > 1 ? `_v${version}` : '';
  return `${who}_Resume_Citi_${reqId}${v}.pdf`;
}

module.exports = { render, filename, money };
