// =====================================================
// Web Push — lets a champion's installed PWA badge its home-screen icon and
// show a notification when the owner sends an Intercom message while the app is
// closed (iOS 16.4+ supports Web Push + App Badging for installed web apps).
//
// VAPID public key is safe to ship; the private key stays in env. Without the
// private key (VAPID_PRIVATE_KEY unset) push is disabled gracefully — the
// in-app App Badge (foreground) still works.
// =====================================================

const webpush = require('web-push');
const { getSequelize } = require('../models');

// Default keypair lets the Intercom badge work out-of-the-box. Override both on
// Render (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) to rotate. The private key alone
// can't push to anyone — a sender also needs the per-device subscription rows in
// voice_to_intake_transcript_direct_pipeli_push_subs (server-side only).
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ||
  'BG5W98lLvPQDb1lnxlKHifsOR39ql-mUWz_zXJ3Cv4fY8l20TNhe8bJfbrztcMocgjhMi4uruJG3iOErmwOtKzc';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ||
  'Vl8M-MSQYeA5UzOFxSQQLghAFY-pvMQY23nNGvTHcCA';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@digit2ai.com';

let enabled = false;
if (PRIVATE_KEY) {
  try { webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY); enabled = true; }
  catch (e) { console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'vapid_init_failed', error: e.message })); }
}

const TABLE = 'voice_to_intake_transcript_direct_pipeli_push_subs';
let tableReady = false;
async function ensureTable(seq) {
  if (tableReady) return;
  await seq.query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
       id SERIAL PRIMARY KEY,
       champion_email VARCHAR(255) NOT NULL,
       endpoint TEXT UNIQUE NOT NULL,
       sub_json TEXT NOT NULL,
       created_at TIMESTAMP NOT NULL DEFAULT NOW()
     )`
  );
  await seq.query(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_email ON ${TABLE} (champion_email)`);
  tableReady = true;
}

function norm(email) { return String(email || '').trim().toLowerCase(); }
function publicKey() { return PUBLIC_KEY; }
function isEnabled() { return enabled; }

// The owner (Digit2Ai team) has no per-champion email, so their device
// subscriptions are stored under this sentinel key in the same table. Lets the
// owner's installed PWA get badged when ANY champion sends a message.
const OWNER_KEY = '__owner__';
function saveOwnerSubscription(sub) { return saveSubscription(OWNER_KEY, sub); }
function sendToOwner(payload) { return sendToChampion(OWNER_KEY, payload); }

async function saveSubscription(email, sub) {
  if (!sub || !sub.endpoint) return false;
  try {
    const seq = getSequelize();
    await ensureTable(seq);
    await seq.query(
      `INSERT INTO ${TABLE} (champion_email, endpoint, sub_json, created_at)
       VALUES (:email, :endpoint, :sub, NOW())
       ON CONFLICT (endpoint) DO UPDATE SET champion_email = EXCLUDED.champion_email, sub_json = EXCLUDED.sub_json`,
      { replacements: { email: norm(email), endpoint: sub.endpoint, sub: JSON.stringify(sub) } }
    );
    return true;
  } catch (e) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'push_save_failed', error: e.message }));
    return false;
  }
}

async function removeEndpoint(endpoint) {
  try {
    const seq = getSequelize();
    await ensureTable(seq);
    await seq.query(`DELETE FROM ${TABLE} WHERE endpoint = :endpoint`, { replacements: { endpoint } });
  } catch (e) { /* ignore */ }
}

// Fire-and-forget push to all of a champion's devices. Never throws.
async function sendToChampion(email, payload) {
  if (!enabled) return;
  try {
    const seq = getSequelize();
    await ensureTable(seq);
    const [rows] = await seq.query(`SELECT endpoint, sub_json FROM ${TABLE} WHERE champion_email = :email`, { replacements: { email: norm(email) } });
    const body = JSON.stringify(payload);
    await Promise.all(rows.map(async (r) => {
      let sub;
      try { sub = JSON.parse(r.sub_json); } catch (e) { return; }
      try {
        await webpush.sendNotification(sub, body);
      } catch (err) {
        // 404/410 = subscription expired -> prune.
        if (err && (err.statusCode === 404 || err.statusCode === 410)) await removeEndpoint(r.endpoint);
      }
    }));
  } catch (e) {
    console.error(JSON.stringify({ svc: 'voice-to-intake', event: 'push_send_failed', error: e.message }));
  }
}

module.exports = { publicKey, isEnabled, saveSubscription, sendToChampion, saveOwnerSubscription, sendToOwner, TABLE };
