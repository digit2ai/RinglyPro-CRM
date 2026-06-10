/**
 * Email Reconciliation Service
 *
 * Unifies unread counts + recent unread messages across the owner's (client 15)
 * email accounts for the Projects Hub "Email" card. Universal IMAP path covers
 * Gmail (app password), Microsoft 365, iCloud/Apple, Network Solutions, etc.
 * Gmail-via-OAuth can be layered on later as a password-free option.
 *
 * App passwords are stored AES-256-GCM encrypted (key from EMAIL_CRED_SECRET ||
 * JWT_SECRET). Results are cached ~60s in memory so the badge poll + view don't
 * hammer the IMAP servers.
 */

'use strict';

const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// ---- credential encryption --------------------------------------------------
function cryptoKey() {
  const secret = process.env.EMAIL_CRED_SECRET || process.env.JWT_SECRET || 'd2ai-email-default-key';
  return crypto.createHash('sha256').update(secret).digest();
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', cryptoKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(b64) {
  const buf = Buffer.from(String(b64), 'base64');
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', cryptoKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// ---- table ------------------------------------------------------------------
let _tableReady = false;
async function ensureTable() {
  if (_tableReady) return;
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      label VARCHAR(120),
      email_address VARCHAR(255) NOT NULL,
      provider VARCHAR(20) DEFAULT 'imap',
      imap_host VARCHAR(255),
      imap_port INTEGER DEFAULT 993,
      imap_secure BOOLEAN DEFAULT true,
      imap_user VARCHAR(255),
      imap_password_enc TEXT,
      refresh_token TEXT,
      access_token TEXT,
      token_expires_at TIMESTAMPTZ,
      scope TEXT,
      is_active BOOLEAN DEFAULT true,
      last_unread INTEGER DEFAULT 0,
      last_synced_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  _tableReady = true;
}

async function listAccounts(clientId) {
  await ensureTable();
  return sequelize.query(
    `SELECT id, label, email_address, provider, imap_host, imap_port, is_active,
            last_unread, last_synced_at, last_error
       FROM email_accounts WHERE client_id = $1 ORDER BY id ASC`,
    { bind: [clientId], type: QueryTypes.SELECT }
  );
}

async function addImapAccount(clientId, a) {
  await ensureTable();
  const enc = encrypt(a.password);
  const [row] = await sequelize.query(
    `INSERT INTO email_accounts
       (client_id, label, email_address, provider, imap_host, imap_port, imap_secure, imap_user, imap_password_enc)
     VALUES ($1,$2,$3,'imap',$4,$5,$6,$7,$8)
     RETURNING id`,
    { bind: [
        clientId, a.label || a.email, a.email, a.host,
        parseInt(a.port, 10) || 993, a.secure !== false,
        a.user || a.email, enc
      ], type: QueryTypes.INSERT }
  );
  _cache.delete(clientId);
  return Array.isArray(row) ? row[0] : row;
}

async function deleteAccount(clientId, id) {
  await ensureTable();
  await sequelize.query(
    `DELETE FROM email_accounts WHERE id = $1 AND client_id = $2`,
    { bind: [parseInt(id, 10), clientId], type: QueryTypes.DELETE }
  );
  _cache.delete(clientId);
}

// ---- IMAP -------------------------------------------------------------------
function imapConfig(account) {
  return {
    host: account.imap_host,
    port: account.imap_port || 993,
    secure: account.imap_secure !== false,
    auth: { user: account.imap_user || account.email_address, pass: decrypt(account.imap_password_enc) },
    logger: false,
    socketTimeout: 20000,
    greetingTimeout: 12000,
    connectionTimeout: 12000
  };
}

// Verify credentials work (used on add).
async function testImap(a) {
  const client = new ImapFlow({
    host: a.host, port: parseInt(a.port, 10) || 993, secure: a.secure !== false,
    auth: { user: a.user || a.email, pass: a.password },
    logger: false, socketTimeout: 15000, greetingTimeout: 10000, connectionTimeout: 10000
  });
  await client.connect();
  await client.logout().catch(() => {});
  return true;
}

async function fetchAccount(account, limit) {
  const client = new ImapFlow(imapConfig(account));
  const result = { unread: 0, items: [] };
  await client.connect();
  try {
    const status = await client.status('INBOX', { unseen: true });
    result.unread = status.unseen || 0;
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      const recent = (uids || []).slice(-limit).reverse();
      if (recent.length) {
        for await (const msg of client.fetch(recent, { envelope: true, internalDate: true }, { uid: true })) {
          const from = msg.envelope && msg.envelope.from && msg.envelope.from[0];
          const dt = msg.internalDate || (msg.envelope && msg.envelope.date) || new Date();
          result.items.push({
            account_id: account.id,
            account: account.label || account.email_address,
            email_address: account.email_address,
            from: (from && from.address) || '',
            from_name: (from && from.name) || '',
            subject: (msg.envelope && msg.envelope.subject) || '(no subject)',
            ts: (dt instanceof Date ? dt : new Date(dt)).toISOString()
          });
        }
      }
    } finally { lock.release(); }
  } finally {
    await client.logout().catch(() => {});
  }
  return result;
}

async function persistStatus(id, unread, error) {
  try {
    await sequelize.query(
      `UPDATE email_accounts
          SET last_unread = $1, last_error = $2, last_synced_at = NOW(), updated_at = NOW()
        WHERE id = $3`,
      { bind: [unread || 0, error || null, id], type: QueryTypes.UPDATE }
    );
  } catch (e) { /* non-fatal */ }
}

// ---- aggregate (cached) -----------------------------------------------------
const _cache = new Map(); // clientId -> { at, data }
const CACHE_MS = 60 * 1000;

async function getSummary(clientId, { limit = 12, force = false } = {}) {
  await ensureTable();
  const cached = _cache.get(clientId);
  if (!force && cached && (Date.now() - cached.at) < CACHE_MS) return cached.data;

  const accounts = await sequelize.query(
    `SELECT * FROM email_accounts WHERE client_id = $1 AND is_active = true ORDER BY id ASC`,
    { bind: [clientId], type: QueryTypes.SELECT }
  );

  let totalUnread = 0;
  const perAccount = [];
  const items = [];

  await Promise.all(accounts.map(async (acc) => {
    try {
      const r = await fetchAccount(acc, limit);
      totalUnread += r.unread;
      perAccount.push({ id: acc.id, label: acc.label || acc.email_address, email: acc.email_address, unread: r.unread, error: null });
      items.push(...r.items);
      persistStatus(acc.id, r.unread, null);
    } catch (e) {
      perAccount.push({ id: acc.id, label: acc.label || acc.email_address, email: acc.email_address, unread: 0, error: e.message });
      persistStatus(acc.id, 0, e.message);
    }
  }));

  items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const data = { total_unread: totalUnread, accounts: perAccount, items: items.slice(0, limit * Math.max(accounts.length, 1)) };
  _cache.set(clientId, { at: Date.now(), data });
  return data;
}

module.exports = {
  listAccounts, addImapAccount, deleteAccount, testImap, getSummary, encrypt, decrypt
};
