'use strict';

/**
 * NEW-SUBSCRIBER BADGE for the admin console.
 *
 * Two halves, because a badge that only works while you are looking at the app
 * is not a badge:
 *
 *   1. A WATERMARK the console reads. `last_seen_subscriber_id` per admin, so
 *      "new" means "arrived since you last looked", not "arrived today". Two
 *      operators do not clear each other's count.
 *   2. WEB PUSH, so the number changes on a closed app. Chrome/Android and
 *      iOS 16.4+ (installed to the home screen only) both deliver it; the
 *      service worker calls navigator.setAppBadge from its push handler.
 *
 * VAPID KEYS ARE GENERATED ON FIRST USE AND STORED IN THE DATABASE, not read
 * from env. Web Push needs a keypair, not an account — nothing external issues
 * it — so making the operator paste one into Render before the badge works
 * would be a configuration step that buys nothing. Set JOBUP_VAPID_PUBLIC and
 * JOBUP_VAPID_PRIVATE if you would rather pin them; env wins when present.
 *
 * A PUSH SUBSCRIPTION IS A CAPABILITY. Whoever holds the endpoint can push to
 * that device, so subscriptions are never returned by any read endpoint and
 * never logged.
 */

const { models, scoped } = require('../models');

const TENANT = parseInt(process.env.JOBUP_PLATFORM_TENANT_ID || '0', 10);
const SUBJECT = process.env.JOBUP_VAPID_SUBJECT || 'mailto:admin@jobup.dev';

function webpush() {
  try { return require('web-push'); } catch (e) { return null; }
}

// ---- state helpers --------------------------------------------------------
async function getState(key, actor = '') {
  const row = await scoped('admin_state', TENANT).findOne({ key, actor });
  return row ? row.value : null;
}
async function setState(key, value, actor = '') {
  const row = await scoped('admin_state', TENANT).findOne({ key, actor });
  if (row) await scoped('admin_state', TENANT).update({ value, updated_at: new Date() }, { id: row.id });
  else await scoped('admin_state', TENANT).create({ key, actor, value });
  return value;
}

// ---- VAPID ----------------------------------------------------------------
let cachedKeys = null;
async function vapid() {
  if (cachedKeys) return cachedKeys;
  if (process.env.JOBUP_VAPID_PUBLIC && process.env.JOBUP_VAPID_PRIVATE) {
    cachedKeys = { publicKey: process.env.JOBUP_VAPID_PUBLIC, privateKey: process.env.JOBUP_VAPID_PRIVATE, source: 'env' };
    return cachedKeys;
  }
  const stored = await getState('vapid');
  if (stored && stored.publicKey && stored.privateKey) {
    cachedKeys = { ...stored, source: 'database' };
    return cachedKeys;
  }
  const wp = webpush();
  if (!wp) return null;
  const gen = wp.generateVAPIDKeys();
  await setState('vapid', gen);
  cachedKeys = { ...gen, source: 'generated' };
  return cachedKeys;
}

async function publicKey() {
  const k = await vapid();
  return k ? k.publicKey : null;
}

// ---- the count ------------------------------------------------------------
/** The highest subscriber id that exists. The watermark is compared to this. */
async function latestSubscriberId() {
  const all = await models.subscribers.findAll({});
  return all.reduce((m, s) => (s.id > m ? s.id : m), 0);
}

/**
 * How many subscribers arrived since this admin last looked.
 *
 * Counted from real rows, never from a stored counter that could drift out of
 * step with the table — a badge that says 3 when the list shows 0 is worse
 * than no badge.
 */
async function newCountFor(actor) {
  const watermark = (await getState('last_seen_subscriber_id', actor)) || { id: 0 };
  const all = await models.subscribers.findAll({});
  const fresh = all.filter((s) => s.id > (watermark.id || 0));
  return {
    count: fresh.length,
    last_seen_id: watermark.id || 0,
    latest_id: all.reduce((m, s) => (s.id > m ? s.id : m), 0),
    total: all.length,
    newest: fresh
      .slice().sort((a, b) => b.id - a.id).slice(0, 5)
      .map((s) => ({ id: s.id, name: s.name || null, email: s.email, created_at: s.created_at })),
  };
}

/** Mark everything up to now as seen. Clears the badge for this admin only. */
async function markSeen(actor) {
  const latest = await latestSubscriberId();
  await setState('last_seen_subscriber_id', { id: latest, at: new Date().toISOString() }, actor);
  return { last_seen_id: latest, count: 0 };
}

// ---- push -----------------------------------------------------------------
async function saveSubscription(actor, sub, userAgent) {
  if (!sub || !sub.endpoint) return { ok: false, error: 'no endpoint' };
  const existing = await scoped('admin_push_subs', TENANT).findOne({ endpoint: sub.endpoint });
  if (existing) {
    await scoped('admin_push_subs', TENANT).update(
      { actor, keys_json: sub.keys || null, failures: 0 }, { id: existing.id });
    return { ok: true, updated: true };
  }
  await scoped('admin_push_subs', TENANT).create({
    actor, endpoint: sub.endpoint, keys_json: sub.keys || null,
    user_agent: String(userAgent || '').slice(0, 240),
  });
  return { ok: true, created: true };
}

async function removeSubscription(endpoint) {
  const row = await scoped('admin_push_subs', TENANT).findOne({ endpoint });
  if (row) await scoped('admin_push_subs', TENANT).destroy({ id: row.id });
  return { ok: true };
}

/**
 * Push the current count to every installed console.
 *
 * Each device gets ITS OWN admin's number, not a shared one — the payload is
 * computed per subscription actor. A 404/410 from the push service means the
 * subscription is dead and is deleted rather than retried forever.
 */
async function pushBadge(reason = 'new subscriber', opts = {}) {
  const wp = webpush();
  const keys = await vapid();
  if (!wp || !keys) return { ok: false, error: 'web-push unavailable' };
  wp.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey);

  const subs = await scoped('admin_push_subs', TENANT).findAll({});
  const counts = new Map();
  let sent = 0; let dropped = 0; let failed = 0;

  for (const s of subs) {
    const actor = s.actor || '';
    if (!counts.has(actor)) counts.set(actor, (await newCountFor(actor)).count);
    const count = counts.get(actor);
    // `test` makes the worker render something even when the count is zero.
    // A test that is invisible at zero is indistinguishable from a broken one,
    // and iOS treats a push that shows no notification as a silent push — which
    // it drops, and eventually revokes the permission for.
    // A TEST MUST PUT A NUMBER ON THE ICON, or it proves delivery and nothing
    // else. With no new subscribers the real count is 0, and 0 means
    // clearAppBadge — so the previous test could never show anything by
    // construction. `badge` is what the worker paints; for a test it is at
    // least 1 and the notification says plainly that it is a demonstration.
    const payload = JSON.stringify({
      type: 'new_subscriber', count, reason,
      test: Boolean(opts.test),
      badge: opts.test ? Math.max(count, 1) : count,
    });
    try {
      await wp.sendNotification(
        { endpoint: s.endpoint, keys: s.keys_json || undefined }, payload, { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) {
        await scoped('admin_push_subs', TENANT).destroy({ id: s.id });
        dropped++;
      } else {
        await scoped('admin_push_subs', TENANT).update({ failures: (s.failures || 0) + 1 }, { id: s.id });
        failed++;
      }
    }
  }
  return { ok: true, sent, dropped, failed, devices: subs.length };
}

/**
 * Call when a subscriber is created. Fire-and-forget on purpose: a push that
 * fails must never break the signup that triggered it.
 */
function onNewSubscriber(sub) {
  setImmediate(async () => {
    try { await pushBadge(`new subscriber: ${(sub && sub.email) || 'unknown'}`); }
    catch (e) { console.warn('[admin-notify] badge push failed:', e.message); }
  });
}

async function status() {
  const keys = await vapid();
  const subs = await scoped('admin_push_subs', TENANT).findAll({});
  return {
    push_available: Boolean(webpush()),
    vapid_source: keys ? keys.source : null,
    // The public key is meant to be public — it is what the browser subscribes
    // with. The private half is never exposed anywhere.
    vapid_public_key: keys ? keys.publicKey : null,
    installed_devices: subs.length,
  };
}

module.exports = {
  newCountFor, markSeen, latestSubscriberId,
  saveSubscription, removeSubscription, pushBadge, onNewSubscriber,
  publicKey, status, getState, setState, TENANT,
};
