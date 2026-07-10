// =====================================================
// documentExtract — pull readable text out of an uploaded attachment buffer so
// the inbox triage + PoC teaser analyze the ACTUAL document content, exactly
// like typed/dictated input (not just a "(see attachments)" placeholder).
//
// Supports: pdf (pdf-parse), docx (mammoth), txt/md/csv (utf8), rtf (strip
// control words). Legacy binary .doc is skipped (returns '') — no reliable
// zero-dep extractor; the file still rides along as a downloadable attachment.
//
// Discipline: never throws, never blocks a submission. On any failure it logs
// (filename + ext only, never the content) and returns ''.
// =====================================================

// Require pdf-parse's inner module directly to skip its debug harness (the
// package's index.js reads a bundled test PDF when it thinks it's the entrypoint).
let pdfParse = null;
try { pdfParse = require('pdf-parse/lib/pdf-parse.js'); } catch (_) { /* optional dep */ }
let mammoth = null;
try { mammoth = require('mammoth'); } catch (_) { /* optional dep */ }

const PER_FILE_CHAR_CAP = 20000; // keep the forwarded description well under the projects app's 100kb JSON limit

function extOf(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function cleanText(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ')                 // non-breaking space -> regular space
    .replace(/[​-‍﻿]/g, '')   // zero-width chars / BOM
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Minimal RTF -> plain text: drop \'hh hex escapes, control words, and braces.
function rtfToText(s) {
  return String(s || '')
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// file: a multer memoryStorage entry { originalname, mimetype, buffer }.
// Returns extracted text (possibly '') — never rejects.
async function extractText(file) {
  const ext = extOf(file && file.originalname);
  const buf = file && file.buffer;
  if (!buf || !buf.length) return '';
  try {
    if (ext === 'pdf') {
      if (!pdfParse) return '';
      const r = await pdfParse(buf);
      return cleanText(r && r.text).slice(0, PER_FILE_CHAR_CAP);
    }
    if (ext === 'docx') {
      if (!mammoth) return '';
      const r = await mammoth.extractRawText({ buffer: buf });
      return cleanText(r && r.value).slice(0, PER_FILE_CHAR_CAP);
    }
    if (ext === 'rtf') {
      return cleanText(rtfToText(buf.toString('utf8'))).slice(0, PER_FILE_CHAR_CAP);
    }
    if (ext === 'txt' || ext === 'md' || ext === 'csv') {
      return cleanText(buf.toString('utf8')).slice(0, PER_FILE_CHAR_CAP);
    }
    // 'doc' (legacy binary) and anything else: no reliable extraction — skip.
    return '';
  } catch (e) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'extract_failed', file: file && file.originalname, ext, error: e.message }));
    return '';
  }
}

module.exports = { extractText, extOf, PER_FILE_CHAR_CAP };
