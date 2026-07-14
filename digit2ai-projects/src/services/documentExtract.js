// =====================================================
// documentExtract — pull readable text out of an uploaded attachment buffer so
// the intake triage + PoC teaser analyze the ACTUAL document content, exactly
// like typed/dictated input (not just a "(see attachments)" placeholder).
//
// Supports: pdf (pdf-parse), docx (mammoth), txt/md/csv/json (utf8), rtf (strip
// control words). Legacy binary .doc is skipped (returns '').
// Discipline: never throws, never blocks a submission. Returns '' on any failure.
// (Copied from the voice-to-intake app so the public digit2ai landing can accept
// PDF/Word/Text uploads and fold their text into the project description.)
// =====================================================

let pdfParse = null;
try { pdfParse = require('pdf-parse/lib/pdf-parse.js'); } catch (_) { /* optional dep */ }
let mammoth = null;
try { mammoth = require('mammoth'); } catch (_) { /* optional dep */ }

const PER_FILE_CHAR_CAP = 20000;

function extOf(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}
function cleanText(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function rtfToText(s) {
  return String(s || '')
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// file: a multer memoryStorage entry { originalname, mimetype, buffer }.
async function extractText(file) {
  const ext = extOf(file && file.originalname);
  const buf = file && file.buffer;
  if (!buf || !buf.length) return '';
  try {
    if (ext === 'pdf') { if (!pdfParse) return ''; const r = await pdfParse(buf); return cleanText(r && r.text).slice(0, PER_FILE_CHAR_CAP); }
    if (ext === 'docx') { if (!mammoth) return ''; const r = await mammoth.extractRawText({ buffer: buf }); return cleanText(r && r.value).slice(0, PER_FILE_CHAR_CAP); }
    if (ext === 'rtf') { return cleanText(rtfToText(buf.toString('utf8'))).slice(0, PER_FILE_CHAR_CAP); }
    if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json') { return cleanText(buf.toString('utf8')).slice(0, PER_FILE_CHAR_CAP); }
    return '';
  } catch (e) {
    console.error(JSON.stringify({ svc: 'digit2ai-projects', event: 'extract_failed', file: file && file.originalname, ext, error: e.message }));
    return '';
  }
}

module.exports = { extractText, extOf, PER_FILE_CHAR_CAP };
