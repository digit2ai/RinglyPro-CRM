'use strict';
/**
 * Enlaces privados a documentos de clientes (facturas, propuestas): GET /d/:token
 *
 * El repositorio es público, así que un documento con datos de un cliente (RFC, montos, nombres) NO puede vivir
 * en public/. Aquí el HTML se guarda en la base de datos y solo se llega con un token aleatorio de 32 bytes, que
 * se guarda únicamente como SHA-256: quien lea la tabla no puede reconstruir el enlace.
 * - Un token mal formado, desconocido, vencido o revocado responde 404 (igual en todos los casos).
 * - Respuestas noindex y no-store; el HTML se sirve con una CSP que no deja ejecutar scripts.
 * - No hay ruta para crear documentos: se dan de alta con scripts/shared-doc.js desde una máquina con acceso a la base.
 */
const express = require('express');
const crypto = require('crypto');

const router = express.Router();
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const db = () => require('../config/database');

let ready = null;
function ensureTable() {
  if (!ready) {
    ready = db().query(`CREATE TABLE IF NOT EXISTS d2_shared_docs (
      id SERIAL PRIMARY KEY,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(200) NOT NULL,
      html TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      views INTEGER NOT NULL DEFAULT 0,
      last_viewed_at TIMESTAMPTZ
    )`, { logging: false }).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** Crea un documento y devuelve el token en claro (una sola vez). */
async function create({ title, html, expiresAt }, conn) {
  await ensureTable();
  const token = crypto.randomBytes(32).toString('base64url');
  await (conn || db()).query('INSERT INTO d2_shared_docs (token_hash, title, html, expires_at) VALUES (:h, :t, :html, :e)',
    { replacements: { h: sha(token), t: String(title).slice(0, 200), html: String(html), e: expiresAt || null }, logging: false });
  return token;
}

const notFound = (res) => res.status(404).set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' })
  .type('html').send('<!doctype html><meta charset="utf-8"><title>No disponible</title><p style="font-family:sans-serif;margin:40px">Este enlace no existe o ya no está disponible.</p>');

router.get('/:token', async (req, res) => {
  const token = req.params.token;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return notFound(res);
  try {
    await ensureTable();
    const [rows] = await db().query(`UPDATE d2_shared_docs SET views = views + 1, last_viewed_at = NOW()
      WHERE token_hash = :h AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) RETURNING html`, { replacements: { h: sha(token) }, logging: false });
    if (!rows.length) return notFound(res);
    res.set({
      'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data: https:; base-uri 'none'; form-action 'none'"
    }).type('html').send(rows[0].html);
  } catch (e) {
    console.error('[shared-docs]', e.message);
    notFound(res);
  }
});

module.exports = router;
module.exports.create = create;
module.exports._sha = sha;
