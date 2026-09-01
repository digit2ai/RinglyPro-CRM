'use strict';

/**
 * API KEYS — one key type, two directions.
 *
 * The module's connection to a company is a single credential that works both
 * ways, because both directions are the same relationship:
 *
 *   ingest  the company's tools and the browser extension PUSH observed work in
 *   read    the company's own AI PULLS the roadmap back out over MCP
 *
 * Scopes are separate and a key holds whichever were granted, so the key sitting
 * in an extension on fifty laptops can be ingest-only and cannot read the
 * company's readiness assessment back — which matters, because that assessment
 * contains the CEO's stated fears and budget ceiling.
 *
 * THE PLAINTEXT IS SHOWN EXACTLY ONCE. Only a SHA-256 is stored, so a database
 * read cannot replay a key. There is deliberately no "reveal key" endpoint: a
 * key you cannot find again is a key you rotate, which is the correct outcome.
 */

const crypto = require('crypto');
const { ApiKey, Event } = require('../models');

const PREFIX = 'orbup_dk_';           // discovery key
const SCOPES = ['ingest', 'read'];

function hash(plain) {
  return crypto.createHash('sha256').update(String(plain)).digest('hex');
}

/** Mint a key. Returns the plaintext ONCE; it is never recoverable after this. */
async function mint({ tenant_id, account_id, name, scopes }) {
  const wanted = (Array.isArray(scopes) ? scopes : ['ingest'])
    .map(s => String(s).toLowerCase())
    .filter(s => SCOPES.includes(s));
  const use = wanted.length ? Array.from(new Set(wanted)) : ['ingest'];

  const secret = crypto.randomBytes(24).toString('base64url');
  const plain = PREFIX + secret;

  const row = await ApiKey.create({
    tenant_id, account_id,
    name: String(name || 'Untitled key').slice(0, 80),
    prefix: plain.slice(0, PREFIX.length + 6),
    key_hash: hash(plain),
    scopes: use
  });

  await Event.create({
    tenant_id, kind: 'api_key.minted', channel: 'web',
    detail: { key_id: row.id, scopes: use, name: row.name }
  }).catch(() => {});

  return { key: row, plaintext: plain };
}

/**
 * Resolve a presented key. Returns null for unknown, revoked, or wrong-scope —
 * the caller reports "invalid key", never which of the three it was.
 */
async function resolve(presented, requiredScope) {
  if (!presented || typeof presented !== 'string') return null;
  const clean = presented.trim().replace(/^Bearer\s+/i, '');
  if (!clean.startsWith(PREFIX)) return null;

  const row = await ApiKey.findOne({ where: { key_hash: hash(clean) } });
  if (!row || row.revoked_at) return null;

  const scopes = Array.isArray(row.scopes) ? row.scopes : [];
  if (requiredScope && !scopes.includes(requiredScope)) return null;

  // Usage is recorded but never awaited — a slow write must not delay an
  // ingest, and a lost counter is not worth a failed capture.
  ApiKey.update(
    { last_used_at: new Date(), use_count: (row.use_count || 0) + 1 },
    { where: { id: row.id } }
  ).catch(() => {});

  return row;
}

async function list(tenant_id) {
  const rows = await ApiKey.findAll({
    where: { tenant_id },
    order: [['created_at', 'DESC']]
  });
  // key_hash never leaves this function.
  return rows.map(r => ({
    id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes,
    last_used_at: r.last_used_at, use_count: r.use_count,
    revoked_at: r.revoked_at, created_at: r.created_at,
    active: !r.revoked_at
  }));
}

async function revoke(tenant_id, id) {
  const row = await ApiKey.findOne({ where: { id, tenant_id } });
  if (!row) return null;
  if (!row.revoked_at) {
    row.revoked_at = new Date();
    await row.save();
    await Event.create({
      tenant_id, kind: 'api_key.revoked', channel: 'web', detail: { key_id: row.id }
    }).catch(() => {});
  }
  return row;
}

module.exports = { mint, resolve, list, revoke, hash, PREFIX, SCOPES };
