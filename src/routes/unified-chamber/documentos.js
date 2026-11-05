'use strict';

// =============================================================
// Documentacion de la camara — /:slug/api/documentos
//
// Biblioteca de documentos (PDF, Word, texto) que TODOS los miembros activos
// de la camara pueden ver y descargar. Solo los administradores suben, editan
// el titulo o retiran un documento.
//
// Reglas:
// - Habilitado por slug (CHAMBER_DOCS_SLUGS, por defecto cv-105). Cualquier
//   otra camara recibe 404, no 403: la ruta no existe para ella.
// - Toda consulta lleva chamber_id. El slug es la puerta; chamber_id la
//   cerradura.
// - El rol y el estado se releen de la base en cada peticion, nunca se confian
//   al token de 30 dias: un socio dado de baja hoy deja de ver hoy.
// - El tipo se decide por los primeros bytes, nunca por el nombre ni por el
//   Content-Type que manda el navegador.
// - Los archivos viven en Postgres (BYTEA): el disco de Render se borra en
//   cada despliegue. Las listas nunca devuelven los bytes.
// - Retirar es borrado logico (deleted_at): queda la traza de quien lo subio.
// =============================================================

const express = require('express');
const multer = require('multer');
const { sequelize, QueryTypes, authMiddleware } = require('./lib/shared');

const MAX_MB = Math.max(1, parseInt(process.env.CHAMBER_DOCS_MAX_MB || '20', 10) || 20);
const MAX_FILES = 10;
const ADMIN_LEVELS = ['superadmin', 'admin_global', 'admin_regional'];

function enabledSlugs() {
  return String(process.env.CHAMBER_DOCS_SLUGS || 'cv-105')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: MAX_FILES },
});

const router = express.Router({ mergeParams: true });

// ---- Esquema (idempotente, una vez por proceso) --------------------------
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS chamber_documents (
          id SERIAL PRIMARY KEY,
          chamber_id INTEGER NOT NULL,
          title VARCHAR(200) NOT NULL,
          description TEXT,
          filename VARCHAR(255) NOT NULL,
          kind VARCHAR(10) NOT NULL,
          mime VARCHAR(120) NOT NULL,
          size_bytes INTEGER NOT NULL,
          data BYTEA NOT NULL,
          uploaded_by INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          deleted_at TIMESTAMPTZ,
          deleted_by INTEGER
        )`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_chamber_documents_chamber
        ON chamber_documents (chamber_id, deleted_at, created_at DESC)`);
    })().catch(e => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

// ---- Tipo por bytes --------------------------------------------------------
const KINDS = {
  pdf:  { mime: 'application/pdf', label: 'PDF', inline: true },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word', inline: false },
  doc:  { mime: 'application/msword', label: 'Word', inline: false },
  rtf:  { mime: 'application/rtf', label: 'RTF', inline: false },
  txt:  { mime: 'text/plain; charset=utf-8', label: 'Texto', inline: true },
  md:   { mime: 'text/plain; charset=utf-8', label: 'Texto', inline: true },
  csv:  { mime: 'text/plain; charset=utf-8', label: 'Texto', inline: true },
};

function extOf(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

// Devuelve el tipo real o null. El nombre solo desempata dentro de una misma
// familia de bytes (un ZIP es .docx solo si contiene word/; un texto es md o
// csv solo si el nombre lo dice).
function detectKind(buf, name) {
  if (!buf || buf.length < 4) return null;
  const ext = extOf(name);
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0) {
    return ext === 'doc' ? 'doc' : null; // OLE: tambien es xls/ppt/msg; solo .doc
  }
  if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) {
    // ZIP: es Word solo si lleva la parte principal de un documento.
    const probe = buf.toString('latin1');
    return probe.includes('word/document') || probe.includes('word/_rels') ? 'docx' : null;
  }
  if (buf.slice(0, 5).toString('latin1') === '{\\rtf') return 'rtf';
  // Texto: sin bytes nulos y UTF-8 valido.
  if (buf.includes(0)) return null;
  const s = buf.toString('utf8');
  if (s.includes('�')) return null;
  if (ext === 'md' || ext === 'csv') return ext;
  return 'txt';
}

function cleanText(v, max) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  return s.slice(0, max);
}

function safeFilename(name, kind) {
  let base = String(name || 'documento').replace(/[\\/\u0000-\u001F"<>|:*?]/g, '_').trim();
  if (!base) base = 'documento';
  if (base.length > 200) base = base.slice(0, 200);
  if (!extOf(base)) base += '.' + kind;
  return base;
}

function titleFrom(name) {
  return cleanText(String(name || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' '), 200) || 'Documento';
}

// Multer manda los nombres como latin1; los recuperamos en UTF-8 (tildes, ñ).
function decodeName(n) {
  try {
    const d = Buffer.from(String(n || ''), 'latin1').toString('utf8');
    return d.includes('�') ? String(n || '') : d;
  } catch (_) { return String(n || ''); }
}

// ---- Puerta + sesion -------------------------------------------------------
router.use((req, res, next) => {
  const slug = String((req.chamber && req.chamber.slug) || req.params.chamber_slug || '').toLowerCase();
  if (!req.chamber_id || !enabledSlugs().includes(slug)) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  next();
});

router.use(authMiddleware);

// Rol y estado desde la base, no desde el token.
router.use(async (req, res, next) => {
  try {
    await ensureSchema();
    const [m] = await sequelize.query(
      `SELECT id, access_level, status FROM members WHERE chamber_id = :c AND id = :m`,
      { replacements: { c: req.chamber_id, m: req.member.id }, type: QueryTypes.SELECT });
    if (!m || (m.status && m.status !== 'active')) {
      return res.status(403).json({ success: false, error: 'Tu membresia no esta activa.' });
    }
    req.docsAdmin = ADMIN_LEVELS.includes(m.access_level);
    next();
  } catch (e) {
    console.error('[documentos] auth', e.message);
    res.status(500).json({ success: false, error: 'No se pudo verificar tu acceso.' });
  }
});

function soloAdmin(req, res, next) {
  if (req.docsAdmin) return next();
  return res.status(403).json({ success: false, error: 'Solo un administrador puede hacer esto.' });
}

function parseId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : null;
}

// ---- Lista (sin bytes) -----------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const q = cleanText(req.query.q, 100);
    const rows = await sequelize.query(
      `SELECT d.id, d.title, d.description, d.filename, d.kind, d.size_bytes, d.created_at,
              TRIM(COALESCE(m.first_name,'') || ' ' || COALESCE(m.last_name,'')) AS uploaded_by_name
         FROM chamber_documents d
         LEFT JOIN members m ON m.id = d.uploaded_by AND m.chamber_id = d.chamber_id
        WHERE d.chamber_id = :c AND d.deleted_at IS NULL
          AND (:q = '' OR d.title ILIKE :like OR d.filename ILIKE :like OR COALESCE(d.description,'') ILIKE :like)
        ORDER BY d.created_at DESC
        LIMIT 500`,
      { replacements: { c: req.chamber_id, q, like: '%' + q.replace(/[\\%_]/g, '\\$&') + '%' },
        type: QueryTypes.SELECT });
    res.json({
      success: true,
      data: rows.map(r => ({ ...r, kind_label: (KINDS[r.kind] || {}).label || r.kind })),
      can_manage: !!req.docsAdmin,
      max_mb: MAX_MB,
      max_files: MAX_FILES,
    });
  } catch (e) {
    console.error('[documentos] list', e.message);
    res.status(500).json({ success: false, error: 'No se pudo cargar la documentacion.' });
  }
});

// ---- Subida (solo admin, varios a la vez) ----------------------------------
router.post('/', soloAdmin, (req, res) => {
  upload.array('files', MAX_FILES)(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Cada archivo puede pesar hasta ${MAX_MB} MB.`
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `Hasta ${MAX_FILES} archivos por envio.`
        : 'No se pudo recibir el archivo.';
      return res.status(400).json({ success: false, error: msg });
    }
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, error: 'No llego ningun archivo.' });
    const description = cleanText(req.body && req.body.description, 2000) || null;
    const singleTitle = files.length === 1 ? cleanText(req.body && req.body.title, 200) : '';
    const results = [];
    for (const f of files) {
      const name = decodeName(f.originalname);
      const kind = detectKind(f.buffer, name);
      if (!kind) {
        results.push({ filename: name, ok: false, error: 'Tipo no admitido. Solo PDF, Word (.docx, .doc), RTF o texto.' });
        continue;
      }
      try {
        const [row] = await sequelize.query(
          `INSERT INTO chamber_documents (chamber_id, title, description, filename, kind, mime, size_bytes, data, uploaded_by)
           VALUES (:c, :title, :description, :filename, :kind, :mime, :size, :data, :by)
           RETURNING id, title, filename, kind, size_bytes, created_at`,
          { replacements: {
              c: req.chamber_id, title: singleTitle || titleFrom(name), description,
              filename: safeFilename(name, kind), kind, mime: KINDS[kind].mime,
              size: f.buffer.length, data: f.buffer, by: req.member.id },
            type: QueryTypes.SELECT });
        results.push({ filename: name, ok: true, document: row });
      } catch (e) {
        console.error('[documentos] insert', e.message);
        results.push({ filename: name, ok: false, error: 'No se pudo guardar.' });
      }
    }
    const saved = results.filter(r => r.ok).length;
    res.status(saved ? 201 : 400).json({ success: saved > 0, saved, results });
  });
});

// ---- Ver / descargar -------------------------------------------------------
router.get('/:id/file', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ success: false, error: 'Not found' });
  try {
    const [d] = await sequelize.query(
      `SELECT filename, kind, mime, data FROM chamber_documents
        WHERE id = :id AND chamber_id = :c AND deleted_at IS NULL`,
      { replacements: { id, c: req.chamber_id }, type: QueryTypes.SELECT });
    if (!d) return res.status(404).json({ success: false, error: 'Not found' });
    const k = KINDS[d.kind] || {};
    const inline = req.query.download !== '1' && k.inline;
    const ascii = d.filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    res.set({
      'Content-Type': k.mime || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'private, no-store',
    });
    res.send(d.data);
  } catch (e) {
    console.error('[documentos] file', e.message);
    res.status(500).json({ success: false, error: 'No se pudo abrir el documento.' });
  }
});

// ---- Editar titulo / descripcion (solo admin) ------------------------------
router.patch('/:id', soloAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ success: false, error: 'Not found' });
  const title = cleanText(req.body && req.body.title, 200);
  if (!title) return res.status(400).json({ success: false, error: 'El titulo no puede quedar vacio.' });
  const description = cleanText(req.body && req.body.description, 2000) || null;
  const rows = await sequelize.query(
    `UPDATE chamber_documents SET title = :title, description = :description, updated_at = NOW()
      WHERE id = :id AND chamber_id = :c AND deleted_at IS NULL RETURNING id`,
    { replacements: { id, c: req.chamber_id, title, description }, type: QueryTypes.SELECT });
  if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true });
});

// ---- Retirar (solo admin, borrado logico) ----------------------------------
router.delete('/:id', soloAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ success: false, error: 'Not found' });
  const rows = await sequelize.query(
    `UPDATE chamber_documents SET deleted_at = NOW(), deleted_by = :by
      WHERE id = :id AND chamber_id = :c AND deleted_at IS NULL RETURNING id`,
    { replacements: { id, c: req.chamber_id, by: req.member.id }, type: QueryTypes.SELECT });
  if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true });
});

router._test = { detectKind, safeFilename, titleFrom, decodeName, enabledSlugs, ensureSchema };
module.exports = router;
