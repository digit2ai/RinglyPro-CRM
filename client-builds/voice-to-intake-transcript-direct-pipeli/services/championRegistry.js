// =====================================================
// Champion registry — makes magic links PERMANENT (no expiry) but REVOCABLE.
//
// A champion code is a stateless signed token, so to revoke one we track a
// server-side registry: one row per champion email holding the currently-valid
// token id (jti) + a revoked flag. A code is valid only if its jti matches the
// champion's active jti and the row isn't revoked. Re-issuing rotates the jti
// (old link dies); revoking flips the flag.
//
// Stored in the voice app's own DB (DATABASE_URL). Fail-open on DB errors so a
// transient blip never locks champions out; success-but-no-row / revoked / stale
// jti all correctly reject. Cached briefly to avoid a DB hit per request.
// =====================================================

const crypto = require('crypto');
const { getSequelize } = require('../models');

const TABLE = 'voice_to_intake_transcript_direct_pipeli_champions';
const CACHE_TTL_MS = 30000;
const cache = new Map(); // email -> { jti, revoked, ts }

let tableReady = false;
async function ensureTable(seq) {
  if (tableReady) return;
  await seq.query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       id SERIAL PRIMARY KEY,
       email VARCHAR(255) UNIQUE NOT NULL,
       name VARCHAR(255),
       jti VARCHAR(64) NOT NULL,
       revoked BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMP NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMP NOT NULL DEFAULT NOW()
     )`
  );
  tableReady = true;
}

function norm(email) { return String(email || '').trim().toLowerCase(); }

// Create/rotate a champion's active token id. Returns { jti, persisted }.
async function upsert(email, name) {
  const jti = crypto.randomUUID();
  const e = norm(email);
  try {
    const seq = getSequelize();
    await ensureTable(seq);
    await seq.query(
      `INSERT INTO ${TABLE} (email, name, jti, revoked, created_at, updated_at)
       VALUES (:email, :name, :jti, FALSE, NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET jti = EXCLUDED.jti, name = EXCLUDED.name, revoked = FALSE, updated_at = NOW()`,
      { replacements: { email: e, name: name || e, jti } }
    );
    cache.delete(e);
    return { jti, persisted: true };
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'champion_upsert_failed', error: err.message }));
    return { jti, persisted: false };
  }
}

// Is this (email, jti) the active, non-revoked link? Fail-open on DB error.
async function isValid(email, jti) {
  const e = norm(email);
  const now = Date.now();
  const c = cache.get(e);
  if (c && (now - c.ts) < CACHE_TTL_MS) {
    return !c.revoked && c.jti === jti;
  }
  try {
    const seq = getSequelize();
    await ensureTable(seq);
    const [rows] = await seq.query(
      `SELECT jti, revoked FROM ${TABLE} WHERE email = :email LIMIT 1`,
      { replacements: { email: e } }
    );
    if (!rows.length) {
      // No registry row but a validly-signed jti — treat as revoked/unknown.
      cache.set(e, { jti: null, revoked: true, ts: now });
      return false;
    }
    const row = rows[0];
    cache.set(e, { jti: row.jti, revoked: !!row.revoked, ts: now });
    return !row.revoked && row.jti === jti;
  } catch (err) {
    // Fail-open: don't lock champions out on a DB hiccup.
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'champion_isvalid_failed_failopen', error: err.message }));
    return true;
  }
}

async function list() {
  try {
    const seq = getSequelize();
    await ensureTable(seq);
    const [rows] = await seq.query(
      `SELECT email, name, revoked, created_at, updated_at FROM ${TABLE} ORDER BY created_at ASC`
    );
    return rows;
  } catch (err) {
    return [];
  }
}

async function revoke(email) {
  const e = norm(email);
  try {
    const seq = getSequelize();
    await ensureTable(seq);
    await seq.query(`UPDATE ${TABLE} SET revoked = TRUE, updated_at = NOW() WHERE email = :email`, { replacements: { email: e } });
    cache.delete(e);
    return true;
  } catch (err) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'champion_revoke_failed', error: err.message }));
    return false;
  }
}

module.exports = { upsert, isValid, list, revoke, TABLE };
