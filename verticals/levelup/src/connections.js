'use strict';

/**
 * Connections — the creator's own credentials for the platforms we are
 * connecting to.
 *
 * THIS STORES; IT DOES NOT CONNECT. Descript, TikTok, Instagram, Facebook and
 * the inbox connectors are still being built, so a saved credential does
 * nothing yet and every surface says exactly that. The one thing a vault like
 * this must never do is imply a connection it cannot make: there is no
 * `connected` column, no green tick, and no "test" button that would have to
 * lie. When a connector ships, it reads from here and the copy changes with it.
 *
 * Secrets are encrypted at rest with AES-256-GCM and are NEVER returned by any
 * endpoint — a read gives `{ set: true, hint: '••••4821' }`. There is no reveal
 * route, and no agent, tool or copilot path can reach this module (the SIT
 * greps for that): a model that could read a page token could hand it away.
 */

const crypto = require('crypto');
const db = require('./db');

const KEY_SOURCE = process.env.LEVELUP_SECRET || process.env.LEVELUP_JWT_SECRET || process.env.JWT_SECRET || '';

/* Providers and the fields each official API actually asks for. `secret: true`
   means encrypted at rest and never sent back. */
const PROVIDERS = [
  {
    id: 'descript',
    name: 'Descript',
    what: { en: 'Queue an edit and pull the finished export back.', es: 'Enviar una edición y traer el export terminado.' },
    fields: [{ key: 'api_key', label: { en: 'API key', es: 'Llave de API' }, secret: true }]
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    what: { en: 'Post an approved draft to your account.', es: 'Publicar un borrador aprobado en tu cuenta.' },
    fields: [
      { key: 'client_key', label: { en: 'Client key', es: 'Client key' } },
      { key: 'client_secret', label: { en: 'Client secret', es: 'Client secret' }, secret: true }
    ]
  },
  {
    id: 'instagram',
    name: 'Instagram',
    what: { en: 'Post to an Instagram Business account.', es: 'Publicar en una cuenta de Instagram Business.' },
    fields: [
      { key: 'ig_business_id', label: { en: 'Instagram Business account id', es: 'ID de la cuenta Business' } },
      { key: 'access_token', label: { en: 'Access token', es: 'Token de acceso' }, secret: true }
    ]
  },
  {
    id: 'facebook',
    name: 'Facebook',
    what: { en: 'Post to a Facebook Page you manage.', es: 'Publicar en una página de Facebook que administras.' },
    fields: [
      { key: 'page_id', label: { en: 'Page id', es: 'ID de la página' } },
      { key: 'page_access_token', label: { en: 'Page access token', es: 'Token de la página' }, secret: true }
    ]
  },
  {
    id: 'inbox',
    name: { en: 'Inbox', es: 'Correo' },
    what: { en: 'Read brand emails so the Business Assistant can draft replies you approve.', es: 'Leer correos de marcas para que el asistente redacte respuestas que tú apruebas.' },
    fields: [
      { key: 'email', label: { en: 'Email address', es: 'Correo' } },
      { key: 'imap_host', label: { en: 'IMAP server', es: 'Servidor IMAP' } },
      { key: 'imap_port', label: { en: 'Port', es: 'Puerto' } },
      { key: 'password', label: { en: 'App password', es: 'Contraseña de aplicación' }, secret: true }
    ]
  }
];
const BY_ID = {};
PROVIDERS.forEach((p) => { BY_ID[p.id] = p; });

function configured() { return typeof KEY_SOURCE === 'string' && KEY_SOURCE.length >= 16; }
function key() { return crypto.createHash('sha256').update('levelup-connections:' + KEY_SOURCE).digest(); }

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const out = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), out.toString('base64')].join('.');
}
function decrypt(s) {
  try {
    const [iv, tag, data] = String(s || '').split('.');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
  } catch (e) { return null; }   // a rotated key is reported, never silently treated as empty
}

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const hint = (v) => (v && v.length >= 4 ? '••••' + v.slice(-4) : '••••');

/** Everything the settings screen needs; secrets are described, never sent. */
async function list(tenantId) {
  const rows = await db.q('SELECT provider, fields, secrets_enc, secret_hints, updated_at FROM lu_connections WHERE tenant_id = :t', { t: tenantId });
  const by = {};
  rows.forEach((r) => { by[r.provider] = r; });
  return {
    // Stated on every read so a caller cannot mistake storage for a connection.
    note: 'saved_not_connected',
    encryption_configured: configured(),
    providers: PROVIDERS.map((p) => {
      const row = by[p.id];
      const hints = (row && row.secret_hints) || {};
      const unreadable = !!(row && row.secrets_enc && decrypt(row.secrets_enc) === null);
      return {
        id: p.id,
        name: p.name,
        what: p.what,
        saved: !!row,
        unreadable,                       // key rotated: say so rather than pretend it is empty
        updated_at: row ? row.updated_at : null,
        fields: p.fields.map((f) => ({
          key: f.key,
          label: f.label,
          secret: !!f.secret,
          value: f.secret ? null : clip((row && row.fields && row.fields[f.key]) || '', 200),
          set: f.secret ? !!hints[f.key] : !!(row && row.fields && row.fields[f.key]),
          hint: f.secret ? (hints[f.key] || null) : null
        }))
      };
    })
  };
}

/** Save one provider. A blank secret KEEPS the stored one, as everywhere else. */
async function save(tenantId, provider, input) {
  const p = BY_ID[provider];
  if (!p) return { error: 'unknown provider' };
  if (!configured()) return { error: 'encryption not configured' };

  const row = await db.one('SELECT fields, secrets_enc, secret_hints FROM lu_connections WHERE tenant_id = :t AND provider = :p', { t: tenantId, p: provider });
  const secrets = (row && row.secrets_enc && decrypt(row.secrets_enc)) || {};
  const hints = (row && row.secret_hints) || {};
  const fields = Object.assign({}, (row && row.fields) || {});

  p.fields.forEach((f) => {
    const v = clip(input && input[f.key], 4000);
    if (!f.secret) { if (input && Object.prototype.hasOwnProperty.call(input, f.key)) fields[f.key] = v.slice(0, 200); return; }
    if (!v) return;                       // blank keeps what is stored
    secrets[f.key] = v;
    hints[f.key] = hint(v);
  });

  await db.run(`INSERT INTO lu_connections (tenant_id, provider, fields, secrets_enc, secret_hints, updated_at)
     VALUES (:t, :p, :f, :s, :h, now())
     ON CONFLICT (tenant_id, provider) DO UPDATE SET fields = :f, secrets_enc = :s, secret_hints = :h, updated_at = now()`,
    { t: tenantId, p: provider, f: JSON.stringify(fields), s: Object.keys(secrets).length ? encrypt(secrets) : null, h: JSON.stringify(hints) });
  return { ok: true };
}

async function remove(tenantId, provider) {
  if (!BY_ID[provider]) return { error: 'unknown provider' };
  await db.run('DELETE FROM lu_connections WHERE tenant_id = :t AND provider = :p', { t: tenantId, p: provider });
  return { ok: true };
}

/** For a connector, when one ships. Nothing calls this yet, by design. */
async function secretsFor(tenantId, provider) {
  const row = await db.one('SELECT fields, secrets_enc FROM lu_connections WHERE tenant_id = :t AND provider = :p', { t: tenantId, p: provider });
  if (!row) return null;
  const secrets = row.secrets_enc ? decrypt(row.secrets_enc) : {};
  if (secrets === null) return { error: 'unreadable' };
  return Object.assign({}, row.fields || {}, secrets);
}

module.exports = { PROVIDERS, list, save, remove, secretsFor, configured };
