'use strict';

/**
 * Console notes, documents and the internal knowledge base.
 *
 * Data functions only. Row ownership (which lead an agent may touch) is decided by the
 * agent router, which calls these with a tenant id taken from the session, never a body.
 *
 * FILES ARE KEPT IN POSTGRES, NEVER ON DISK. The Render disk is wiped on every deploy, and a
 * console document that silently vanishes is worse than one that was never accepted. Nothing
 * in this file touches the filesystem.
 *
 * AN UPLOAD IS JUDGED BY ITS BYTES, NOT BY WHAT THE BROWSER SAYS IT IS. The extension must be on
 * the allow-list AND the leading bytes must match that type; the stored content type is the
 * canonical one for the extension, so a client-sent "text/html" can never be replayed on
 * download. HTML and SVG are not on the list at all.
 */

const crypto = require('crypto');
const db = require('../db');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_NOTE_CHARS = 20000;
const MAX_KB_BODY_CHARS = 100000;
const MAX_TITLE_CHARS = 300;
const MAX_URL_CHARS = 2000;
const MAX_TAGS = 20;

class ConsoleError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const startsWith = (buf, bytes) => buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);
const ascii = (buf, s, at = 0) => buf.length >= at + s.length && buf.toString('latin1', at, at + s.length) === s;
const CFB_MAGIC = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
const ZIP = [0x50, 0x4B, 0x03, 0x04];

function looksLikeText(buf) {
  if (buf.includes(0)) return false;
  const head = buf.toString('utf8', 0, Math.min(buf.length, 4096));
  // Text files are served as attachments either way; markup is refused as defence in depth.
  return !/^\s*<(!doctype|html|svg|script|\?xml|body|head|iframe)/i.test(head.replace(/^\uFEFF/, ''));
}

const TYPES = {
  pdf: { mime: 'application/pdf', check: (b) => ascii(b, '%PDF-') },
  png: { mime: 'image/png', check: (b) => startsWith(b, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) },
  jpg: { mime: 'image/jpeg', check: (b) => startsWith(b, [0xFF, 0xD8, 0xFF]) },
  jpeg: { mime: 'image/jpeg', check: (b) => startsWith(b, [0xFF, 0xD8, 0xFF]) },
  gif: { mime: 'image/gif', check: (b) => ascii(b, 'GIF87a') || ascii(b, 'GIF89a') },
  webp: { mime: 'image/webp', check: (b) => ascii(b, 'RIFF') && ascii(b, 'WEBP', 8) },
  txt: { mime: 'text/plain; charset=utf-8', check: looksLikeText },
  csv: { mime: 'text/csv; charset=utf-8', check: looksLikeText },
  doc: { mime: 'application/msword', check: (b) => startsWith(b, CFB_MAGIC) },
  xls: { mime: 'application/vnd.ms-excel', check: (b) => startsWith(b, CFB_MAGIC) },
  // OOXML is a zip; its part names are stored uncompressed, so the folder name identifies the kind.
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', check: (b) => startsWith(b, ZIP) && b.includes('word/') },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', check: (b) => startsWith(b, ZIP) && b.includes('xl/') }
};
const ALLOWED_EXTENSIONS = Object.keys(TYPES);

/** A filename safe to store and to put in a Content-Disposition header. */
function sanitizeFilename(raw) {
  let name = String(raw == null ? '' : raw);
  // Browsers send UTF-8 bytes that the multipart parser reads as latin1; recover when that is what happened.
  try { const fixed = Buffer.from(name, 'latin1').toString('utf8'); if (!fixed.includes('\uFFFD') && fixed !== name) name = fixed; } catch (e) { /* keep as sent */ }
  name = name.split(/[\\/]/).pop();
  name = name.replace(/[\u0000-\u001F\u007F-\u009F"'`<>:*?|;]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  let stem = dot > 0 ? name.slice(0, dot) : name;
  if (stem.length > 150) stem = stem.slice(0, 150).trim();
  if (!stem) stem = 'file';
  return { filename: ext ? `${stem}.${ext}` : stem, ext };
}

/** Validate an upload. Throws ConsoleError(400|413|415). Returns what may be stored. */
function inspectUpload(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) throw new ConsoleError(400, 'Choose a file to upload');
  if (file.buffer.length > MAX_FILE_BYTES) throw new ConsoleError(413, 'Files are limited to 10 MB');
  const { filename, ext } = sanitizeFilename(file.originalname);
  const type = TYPES[ext];
  if (!type) throw new ConsoleError(415, 'That file type is not accepted. Allowed: ' + ALLOWED_EXTENSIONS.join(', '));
  const claimed = String(file.mimetype || '').toLowerCase();
  if (/html|svg|javascript|xml/.test(claimed) && !/officedocument/.test(claimed)) throw new ConsoleError(415, 'That file type is not accepted');
  if (!type.check(file.buffer)) throw new ConsoleError(415, `The file content does not match a .${ext} file`);
  return { filename, content_type: type.mime, size_bytes: file.buffer.length, sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'), data: file.buffer };
}

function cleanUrl(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s.length > MAX_URL_CHARS || /[\u0000-\u0020\u007F]/.test(s)) throw new ConsoleError(400, 'Enter a full link that starts with http:// or https://');
  let u;
  try { u = new URL(s); } catch (e) { throw new ConsoleError(400, 'Enter a full link that starts with http:// or https://'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ConsoleError(400, 'Only http:// and https:// links are accepted');
  if (u.username || u.password) throw new ConsoleError(400, 'Links may not carry a user name or password');
  return u.href;
}

function cleanText(v, max, label, { required = false } = {}) {
  const s = v == null ? '' : String(v).replace(/\r\n/g, '\n').trim();
  if (required && !s) throw new ConsoleError(400, `${label} is required`);
  if (s.length > max) throw new ConsoleError(400, `${label} is limited to ${max.toLocaleString('en-US')} characters`);
  return s;
}

function cleanTags(v) {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  const out = [];
  for (const x of arr) {
    const t = String(x == null ? '' : x).trim().replace(/\s+/g, ' ').slice(0, 40);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

// ── Lead notes ───────────────────────────────────────────────────────────────
const NOTE_COLS = `n.id, n.lead_id, n.author_user_id, u.name AS author_name, n.body, n.created_at, n.updated_at`;

function listLeadNotes(tt, leadId) {
  return db.q(`SELECT ${NOTE_COLS} FROM nca_lead_notes n LEFT JOIN nca_users u ON u.id = n.author_user_id AND u.tenant_id = n.tenant_id
    WHERE n.tenant_id = :tt AND n.lead_id = :l ORDER BY n.created_at DESC, n.id DESC`, { tt, l: leadId });
}

async function getLeadNote(tt, leadId, noteId) {
  return db.one(`SELECT ${NOTE_COLS} FROM nca_lead_notes n LEFT JOIN nca_users u ON u.id = n.author_user_id AND u.tenant_id = n.tenant_id
    WHERE n.tenant_id = :tt AND n.lead_id = :l AND n.id = :id`, { tt, l: leadId, id: Number(noteId) || 0 });
}

async function addLeadNote(tt, leadId, userId, body) {
  const text = cleanText(body, MAX_NOTE_CHARS, 'Note', { required: true });
  const rows = await db.exec(`INSERT INTO nca_lead_notes (tenant_id, lead_id, author_user_id, body) VALUES (:tt, :l, :u, :b) RETURNING id`, { tt, l: leadId, u: userId, b: text });
  return getLeadNote(tt, leadId, rows[0].id);
}

async function updateLeadNote(tt, leadId, noteId, body) {
  const text = cleanText(body, MAX_NOTE_CHARS, 'Note', { required: true });
  await db.exec(`UPDATE nca_lead_notes SET body = :b, updated_at = now() WHERE tenant_id = :tt AND lead_id = :l AND id = :id`, { b: text, tt, l: leadId, id: Number(noteId) || 0 });
  return getLeadNote(tt, leadId, noteId);
}

function deleteLeadNote(tt, leadId, noteId) {
  return db.exec('DELETE FROM nca_lead_notes WHERE tenant_id = :tt AND lead_id = :l AND id = :id', { tt, l: leadId, id: Number(noteId) || 0 });
}

// ── Files (metadata never includes the bytes) ────────────────────────────────
const FILE_COLS = `f.id, f.owner_type, f.owner_id, f.filename, f.content_type, f.size_bytes, f.sha256, f.uploaded_by, u.name AS uploaded_by_name, f.created_at`;

function listFiles(tt, ownerType, ownerId) {
  return db.q(`SELECT ${FILE_COLS} FROM nca_files f LEFT JOIN nca_users u ON u.id = f.uploaded_by AND u.tenant_id = f.tenant_id
    WHERE f.tenant_id = :tt AND f.owner_type = :ot AND f.owner_id = :oid ORDER BY f.created_at DESC, f.id DESC`, { tt, ot: ownerType, oid: ownerId });
}

function getFileMeta(tt, fileId) {
  return db.one(`SELECT ${FILE_COLS} FROM nca_files f LEFT JOIN nca_users u ON u.id = f.uploaded_by AND u.tenant_id = f.tenant_id
    WHERE f.tenant_id = :tt AND f.id = :id`, { tt, id: Number(fileId) || 0 });
}

async function getFileData(tt, fileId) {
  const row = await db.one('SELECT data FROM nca_files WHERE tenant_id = :tt AND id = :id', { tt, id: Number(fileId) || 0 });
  return row ? row.data : null;
}

async function addFile(tt, ownerType, ownerId, userId, file) {
  if (!['lead', 'kb'].includes(ownerType)) throw new ConsoleError(400, 'Unknown owner');
  const f = inspectUpload(file);
  const rows = await db.exec(`INSERT INTO nca_files (tenant_id, owner_type, owner_id, filename, content_type, size_bytes, sha256, data, uploaded_by)
    VALUES (:tt, :ot, :oid, :fn, :ct, :sz, :sha, :data, :u) RETURNING id`,
  { tt, ot: ownerType, oid: ownerId, fn: f.filename, ct: f.content_type, sz: f.size_bytes, sha: f.sha256, data: f.data, u: userId });
  return getFileMeta(tt, rows[0].id);
}

function deleteFile(tt, fileId) {
  return db.exec('DELETE FROM nca_files WHERE tenant_id = :tt AND id = :id', { tt, id: Number(fileId) || 0 });
}

/** Content-Disposition that is always an attachment, with an ASCII fallback and an RFC 5987 name. */
function contentDisposition(filename) {
  const asciiName = String(filename).replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'file';
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// ── Knowledge base ───────────────────────────────────────────────────────────
async function listKb(tt, { q, archived } = {}) {
  const term = q ? String(q).trim().slice(0, 100) : '';
  return db.q(`SELECT e.id, e.title, left(e.body, 240) AS snippet, e.tags, e.created_at, e.updated_at, e.archived_at, u.name AS updated_by_name,
      (SELECT COUNT(*)::int FROM nca_kb_links k WHERE k.entry_id = e.id AND k.tenant_id = e.tenant_id) AS link_count,
      (SELECT COUNT(*)::int FROM nca_files f WHERE f.owner_type = 'kb' AND f.owner_id = e.id AND f.tenant_id = e.tenant_id) AS file_count
    FROM nca_kb_entries e LEFT JOIN nca_users u ON u.id = e.updated_by AND u.tenant_id = e.tenant_id
    WHERE e.tenant_id = :tt AND ${archived ? 'e.archived_at IS NOT NULL' : 'e.archived_at IS NULL'}
    ${term ? `AND (e.title ILIKE :like OR e.body ILIKE :like OR e.tags::text ILIKE :like)` : ''}
    ORDER BY e.updated_at DESC, e.id DESC LIMIT 500`, { tt, like: '%' + term.replace(/[\\%_]/g, (c) => '\\' + c) + '%' });
}

async function getKb(tt, id) {
  const entry = await db.one(`SELECT e.id, e.title, e.body, e.tags, e.created_by, cu.name AS created_by_name, e.updated_by, uu.name AS updated_by_name,
      e.created_at, e.updated_at, e.archived_at
    FROM nca_kb_entries e LEFT JOIN nca_users cu ON cu.id = e.created_by AND cu.tenant_id = e.tenant_id
    LEFT JOIN nca_users uu ON uu.id = e.updated_by AND uu.tenant_id = e.tenant_id
    WHERE e.tenant_id = :tt AND e.id = :id`, { tt, id: Number(id) || 0 });
  if (!entry) return null;
  const [links, files] = await Promise.all([
    db.q('SELECT id, url, label, created_by, created_at FROM nca_kb_links WHERE tenant_id = :tt AND entry_id = :e ORDER BY id', { tt, e: entry.id }),
    listFiles(tt, 'kb', entry.id)
  ]);
  return Object.assign(entry, { links, files });
}

async function createKb(tt, userId, input = {}) {
  const title = cleanText(input.title, MAX_TITLE_CHARS, 'Title', { required: true });
  const body = cleanText(input.body, MAX_KB_BODY_CHARS, 'Notes');
  const tags = cleanTags(input.tags);
  const links = Array.isArray(input.links) ? input.links.slice(0, 50).map((l) => ({ url: cleanUrl(l && l.url), label: cleanText(l && l.label, MAX_TITLE_CHARS, 'Link label') })) : [];
  await db.ensureSchema();
  const t = await db.sequelize.transaction();
  try {
    const [rows] = await db.sequelize.query(`INSERT INTO nca_kb_entries (tenant_id, title, body, tags, created_by, updated_by) VALUES (:tt, :title, :body, :tags, :u, :u) RETURNING id`,
      { replacements: { tt, title, body, tags: JSON.stringify(tags), u: userId }, transaction: t });
    for (const l of links) {
      await db.sequelize.query('INSERT INTO nca_kb_links (tenant_id, entry_id, url, label, created_by) VALUES (:tt, :e, :url, :label, :u)',
        { replacements: { tt, e: rows[0].id, url: l.url, label: l.label || null, u: userId }, transaction: t });
    }
    await t.commit();
    return getKb(tt, rows[0].id);
  } catch (e) { await t.rollback(); throw e; }
}

async function updateKb(tt, id, userId, input = {}) {
  const sets = [], rep = { tt, id: Number(id) || 0, u: userId };
  if (input.title !== undefined) { sets.push('title = :title'); rep.title = cleanText(input.title, MAX_TITLE_CHARS, 'Title', { required: true }); }
  if (input.body !== undefined) { sets.push('body = :body'); rep.body = cleanText(input.body, MAX_KB_BODY_CHARS, 'Notes'); }
  if (input.tags !== undefined) { sets.push('tags = :tags'); rep.tags = JSON.stringify(cleanTags(input.tags)); }
  if (input.archived === false) sets.push('archived_at = NULL');
  if (input.archived === true) sets.push('archived_at = COALESCE(archived_at, now())');
  if (!sets.length) throw new ConsoleError(400, 'Nothing to change');
  await db.exec(`UPDATE nca_kb_entries SET ${sets.join(', ')}, updated_by = :u, updated_at = now() WHERE tenant_id = :tt AND id = :id`, rep);
  return getKb(tt, id);
}

function archiveKb(tt, id, userId) { return updateKb(tt, id, userId, { archived: true }); }

async function touchKb(tt, id, userId) {
  await db.exec('UPDATE nca_kb_entries SET updated_by = :u, updated_at = now() WHERE tenant_id = :tt AND id = :id', { tt, id, u: userId });
}

async function addKbLink(tt, entryId, userId, input = {}) {
  const url = cleanUrl(input.url);
  const label = cleanText(input.label, MAX_TITLE_CHARS, 'Link label');
  const rows = await db.exec('INSERT INTO nca_kb_links (tenant_id, entry_id, url, label, created_by) VALUES (:tt, :e, :url, :label, :u) RETURNING id, url, label, created_by, created_at',
    { tt, e: entryId, url, label: label || null, u: userId });
  await touchKb(tt, entryId, userId);
  return rows[0];
}

async function deleteKbLink(tt, entryId, linkId, userId) {
  const rows = await db.exec('DELETE FROM nca_kb_links WHERE tenant_id = :tt AND entry_id = :e AND id = :id RETURNING id', { tt, e: entryId, id: Number(linkId) || 0 });
  if (rows.length) await touchKb(tt, entryId, userId);
  return rows.length > 0;
}

module.exports = {
  MAX_FILE_BYTES, ALLOWED_EXTENSIONS, ConsoleError,
  sanitizeFilename, inspectUpload, cleanUrl, cleanTags, contentDisposition,
  listLeadNotes, getLeadNote, addLeadNote, updateLeadNote, deleteLeadNote,
  listFiles, getFileMeta, getFileData, addFile, deleteFile,
  listKb, getKb, createKb, updateKb, archiveKb, touchKb, addKbLink, deleteKbLink
};
