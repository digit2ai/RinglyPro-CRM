'use strict';

/**
 * NOTIFICATIONS — dashboard only. There is deliberately NO mail transport here.
 *
 * An earlier version of this file sent SendGrid email and treated the
 * dashboard row as a fallback. The owner's decision (2026-09-27) is the
 * opposite: everything is a dashboard notification, and the badge is what
 * tells you one arrived. That is the better shape for three reasons worth
 * recording, because "just add email later" is a tempting regression:
 *
 *  - Server-sent mail across this estate has been landing in spam. A
 *    notification that reaches a spam folder is worse than none, because it
 *    looks delivered.
 *  - A dashboard row needs no key, no verified sender, no provider and no
 *    network to a third party. It cannot silently fail the way the rotated
 *    Twilio token did for weeks.
 *  - The client already has the app installed with push and an icon badge.
 *    That is a real delivery channel we own end to end.
 *
 * THE OWNER IS A TENANT TOO. "A client paid, go build their workflow" is a
 * notification on the OWNER'S OWN dashboard, resolved from
 * LITE_OWNER_ALERT_EMAIL, so it arrives with a badge on the same installed app
 * they already carry — rather than in an inbox they may not read for a day.
 *
 * SIT greps this file and fails if any mail transport reappears.
 */
const { sequelize } = require('../models');

function ownerEmail() {
  return process.env.LITE_OWNER_ALERT_EMAIL || 'mstagg@digit2ai.com';
}

let ownerTenantCache = { id: null, at: 0 };

/**
 * Which tenant is the owner's own account. Resolved from the alert email
 * rather than a second env var, so there is one place to change it and the
 * two can never disagree. Cached for a minute; a miss is reported, never
 * guessed at — notifying the wrong tenant would put an operational alert
 * about client A into client B's dashboard.
 */
async function ownerTenantId() {
  if (ownerTenantCache.id && Date.now() - ownerTenantCache.at < 60000) return ownerTenantCache.id;
  try {
    const [rows] = await sequelize.query(
      'SELECT tenant_id FROM lite_users WHERE LOWER(email) = LOWER(:e) ORDER BY id LIMIT 1',
      { replacements: { e: ownerEmail() } }
    );
    const id = rows && rows[0] ? Number(rows[0].tenant_id) : null;
    if (id) ownerTenantCache = { id, at: Date.now() };
    return id;
  } catch (e) {
    console.warn('[lite:notify] could not resolve the owner tenant:', e.message);
    return null;
  }
}

/**
 * Write a notification and push the badge.
 *
 * NEVER THROWS. Every caller is mid-webhook or mid-transaction: a
 * notification failure must not roll back a payment Stripe has already taken,
 * or make HighLevel retry a delivery whose rows are already written.
 */
async function notify(tenantId, kind, title, body, { push = true } = {}) {
  const t = parseInt(tenantId, 10);
  if (!Number.isInteger(t)) return { ok: false, reason: 'no_tenant' };
  try {
    await sequelize.query(
      `INSERT INTO lite_notifications (tenant_id, kind, title, body)
       VALUES (:t, :k, :ti, :b)`,
      { replacements: { t, k: String(kind).slice(0, 40),
        ti: String(title).slice(0, 200), b: body ? String(body).slice(0, 4000) : null } }
    );
  } catch (e) {
    console.warn('[lite:notify] could not write notification:', e.message);
    return { ok: false, reason: String(e.message || e).slice(0, 120) };
  }
  // THE BADGE IS THE DELIVERY. Without this the row sits there until the
  // client happens to open the app, which is the same as not telling them.
  if (push) {
    try {
      await require('./pushNotify').pushBadge(t, { title: String(title).slice(0, 120), body: body || '' });
    } catch (e) { console.warn('[lite:notify] push failed:', e.message); }
  }
  return { ok: true };
}

/** The same thing, addressed to the owner's own account. */
async function notifyOwner(kind, title, body) {
  const t = await ownerTenantId();
  if (!t) {
    // Reported loudly rather than dropped: an operational alert nobody
    // receives is how a paying client sits waiting for a day.
    console.error(`[lite:notify] NO OWNER TENANT for ${ownerEmail()} — alert not delivered: ${title}`);
    return { ok: false, reason: 'no_owner_tenant' };
  }
  return notify(t, kind, title, body);
}

/** Unread count, for the badge. Messages and notifications are one number. */
async function unreadCount(tenantId) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM lite_notifications
      WHERE tenant_id = :t AND read_at IS NULL`,
    { replacements: { t: tenantId } }
  );
  return (rows && rows[0] && rows[0].n) || 0;
}

async function list(tenantId, { limit = 20, unreadOnly = false } = {}) {
  const [rows] = await sequelize.query(
    `SELECT id, kind, title, body, created_at, read_at
       FROM lite_notifications
      WHERE tenant_id = :t ${unreadOnly ? 'AND read_at IS NULL' : ''}
      ORDER BY created_at DESC LIMIT :n`,
    { replacements: { t: tenantId, n: Math.min(100, Math.max(1, limit)) } }
  );
  return rows || [];
}

async function markRead(tenantId, id) {
  await sequelize.query(
    `UPDATE lite_notifications SET read_at = NOW()
      WHERE tenant_id = :t ${id ? 'AND id = :i' : ''} AND read_at IS NULL`,
    { replacements: { t: tenantId, i: id || null } }
  );
  // The badge must come DOWN when they read, or it is noise within a day.
  try { await require('./pushNotify').pushBadge(tenantId); } catch (_) { /* best effort */ }
  return { ok: true };
}

/* ── THE EVENTS THIS ADD-ON HAS ─────────────────────────────────────────── */

/**
 * A client paid the setup fee. The owner now has to build that client's
 * HighLevel workflow by hand, so this carries everything needed to do the job
 * — and NOTHING about any caller, which is the estate rule everywhere else.
 */
async function ownerSetupPaid(tenant, due) {
  const when = due ? new Date(due).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'not set';
  return notifyOwner('owner_setup_paid',
    `Outbound setup paid — tenant ${tenant.id}`,
    [`${tenant.business_name || 'Unnamed business'} paid for outbound. Build their HighLevel workflow.`,
      `Their number: ${tenant.ringlypro_number || tenant.did || 'none on file'}`,
      `GHL location: ${tenant.ghl_location_id || 'none'} · agent: ${tenant.ghl_agent_id || 'none'}`,
      `Promised by: ${when}`,
      `Then: POST /internal/security/outbound {"confirm":true,"enabled":true,"tenant":${tenant.id},"workflow_id":"<id>"}`,
    ].join('\n'));
}

/** The client is live. */
async function clientOutboundReady(tenant) {
  return notify(tenant.id, 'outbound_ready', 'Your outbound caller is ready',
    'Add funds and upload your list to start calling. You are charged per minute of connected call.');
}

/** Past the promise, still not done. */
async function ownerSetupOverdue(tenant, due) {
  const hrs = due ? Math.round((Date.now() - new Date(due).getTime()) / 36e5) : 0;
  return notifyOwner('owner_setup_overdue',
    `OVERDUE — outbound setup, tenant ${tenant.id}`,
    `${tenant.business_name || 'Unnamed'} paid and is ${hrs}h past the promised time. They have been told we were notified.`);
}

module.exports = { notify, notifyOwner, ownerTenantId, ownerEmail, list, markRead, unreadCount,
  ownerSetupPaid, clientOutboundReady, ownerSetupOverdue };
