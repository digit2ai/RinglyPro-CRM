'use strict';

/**
 * A COUNT ON THE HOME-SCREEN ICON, INCLUDING WHEN THE APP IS CLOSED.
 *
 * Half of this already worked: `setAppBadge` is wired in dashboard.html and
 * sw.js and is driven by the unread count, which is why the tab shows
 * "Messages 2". But an in-page badge cannot update an icon nobody is looking
 * at — the page has to be open for the code to run. Only Web Push reaches a
 * closed app, and that is the half that was missing.
 *
 * VAPID KEYS GENERATE THEMSELVES ON FIRST USE. Web Push needs a keypair, not
 * an account, so requiring an env var before the badge works would be
 * configuration that buys nothing. `LITE_VAPID_PUBLIC`/`_PRIVATE` override.
 *
 * A PUSH SUBSCRIPTION IS A CAPABILITY URL — anyone holding it can push to that
 * device — so it is never returned by any read endpoint. `publicKey()` is the
 * only thing a browser is given, and that is public by design.
 *
 * iOS DROPS SILENT PUSHES and eventually revokes permission, so every push
 * shows a NOTIFICATION as well as setting the badge. On iPhone the app must be
 * installed to the home screen before a subscription is even possible, which
 * the UI says rather than silently not working.
 */
const { sequelize, Tenant, Message } = require('../models');

function webpush() {
  try { return require('web-push'); } catch (_) { return null; }
}

const stats = { sent: 0, failed: 0, pruned: 0, last_at: null, last_error: null };

/** Created on demand — Lite has no generic key-value store. */
async function ensureTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lite_push_subs (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_ok_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_push_endpoint ON lite_push_subs(endpoint);
    CREATE INDEX IF NOT EXISTS ix_lite_push_tenant ON lite_push_subs(tenant_id);
    CREATE TABLE IF NOT EXISTS lite_push_state (
      k VARCHAR(64) PRIMARY KEY,
      v JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

let cachedKeys = null;
async function vapid() {
  if (cachedKeys) return cachedKeys;
  if (process.env.LITE_VAPID_PUBLIC && process.env.LITE_VAPID_PRIVATE) {
    cachedKeys = { publicKey: process.env.LITE_VAPID_PUBLIC,
      privateKey: process.env.LITE_VAPID_PRIVATE, source: 'env' };
    return cachedKeys;
  }
  const wp = webpush();
  if (!wp) return null;
  await ensureTable();
  const [rows] = await sequelize.query(`SELECT v FROM lite_push_state WHERE k = 'vapid'`);
  const stored = rows && rows[0] && rows[0].v;
  if (stored && stored.publicKey && stored.privateKey) {
    cachedKeys = { ...stored, source: 'database' };
    return cachedKeys;
  }
  const gen = wp.generateVAPIDKeys();
  await sequelize.query(
    `INSERT INTO lite_push_state (k, v) VALUES ('vapid', :v)
       ON CONFLICT (k) DO UPDATE SET v = :v, updated_at = NOW()`,
    { replacements: { v: JSON.stringify(gen) } }
  );
  cachedKeys = { ...gen, source: 'generated' };
  return cachedKeys;
}

async function publicKey() {
  const k = await vapid();
  return k ? k.publicKey : null;
}

/** Store a browser's subscription for this tenant. Idempotent on the endpoint. */
async function subscribe(tenantId, sub) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return { ok: false, error: 'bad_subscription' };
  }
  await ensureTable();
  await sequelize.query(
    `INSERT INTO lite_push_subs (tenant_id, endpoint, p256dh, auth)
       VALUES (:t, :e, :p, :a)
     ON CONFLICT (endpoint) DO UPDATE SET tenant_id = :t, p256dh = :p, auth = :a`,
    { replacements: { t: tenantId, e: String(sub.endpoint).slice(0, 2000),
      p: String(sub.keys.p256dh).slice(0, 500), a: String(sub.keys.auth).slice(0, 500) } }
  );
  return { ok: true };
}

async function unsubscribe(tenantId, endpoint) {
  if (!endpoint) return { ok: false, error: 'no_endpoint' };
  await ensureTable();
  // Scoped to the tenant: an endpoint is a capability, and one tenant must not
  // be able to unhook another's device by guessing it.
  await sequelize.query(`DELETE FROM lite_push_subs WHERE tenant_id = :t AND endpoint = :e`,
    { replacements: { t: tenantId, e: String(endpoint) } });
  return { ok: true };
}

/**
 * THE COUNT IS A COUNT OF REAL ROWS, never a stored counter, so deleting a
 * message lowers it and nothing can drift.
 */
async function unreadCount(tenantId) {
  return Message.count({ where: { tenant_id: tenantId, read_at: null } });
}

/**
 * Push the current unread count to every device this tenant has registered.
 * Best effort: a push failure must never fail the thing that triggered it.
 */
async function pushBadge(tenantId, { title, body } = {}) {
  const wp = webpush();
  const keys = await vapid();
  if (!wp || !keys) return { ok: false, error: 'web_push_unavailable' };
  await ensureTable();

  const tenant = await Tenant.findByPk(tenantId);
  const count = await unreadCount(tenantId);
  wp.setVapidDetails(
    process.env.LITE_VAPID_SUBJECT || 'mailto:support@ringlypro.com',
    keys.publicKey, keys.privateKey
  );

  const [subs] = await sequelize.query(
    `SELECT id, endpoint, p256dh, auth FROM lite_push_subs WHERE tenant_id = :t`,
    { replacements: { t: tenantId } }
  );
  if (!subs.length) return { ok: true, sent: 0, reason: 'no_devices' };

  // A NOTIFICATION, not only a badge: iOS discards data-only pushes and will
  // eventually revoke the permission of an app that keeps sending them.
  const payload = JSON.stringify({
    type: 'badge', count,
    title: title || (tenant && tenant.business_name) || 'RinglyPro',
    body: body || (count === 1 ? 'You have 1 new message.' : `You have ${count} new messages.`),
  });

  let sent = 0;
  for (const s of subs) {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++; stats.sent++;
      await sequelize.query(`UPDATE lite_push_subs SET last_ok_at = NOW() WHERE id = :id`,
        { replacements: { id: s.id } });
    } catch (e) {
      stats.failed++; stats.last_error = String(e.message || e).slice(0, 160);
      // 404/410 means the browser threw the subscription away. Keeping it means
      // pushing to a dead endpoint for ever.
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sequelize.query(`DELETE FROM lite_push_subs WHERE id = :id`, { replacements: { id: s.id } });
        stats.pruned++;
      }
    }
  }
  stats.last_at = new Date().toISOString();
  return { ok: true, sent, devices: subs.length, count };
}

module.exports = { publicKey, subscribe, unsubscribe, pushBadge, unreadCount, ensureTable, stats, vapid };
