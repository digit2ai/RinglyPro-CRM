'use strict';

/**
 * NOTIFICATIONS — Lite's first mail transport, and the dashboard row that does
 * not need one.
 *
 * Until this file, Lite could not send email AT ALL. That is why the caller's
 * booking confirmation was never built. The outbound add-on needs two emails
 * (tell the owner a client paid; tell the client they are live), so the
 * transport arrives here.
 *
 * THE ORDER IS THE DESIGN: the dashboard notification is written FIRST, always,
 * because it is the one channel that cannot fail. Email needs a key, a
 * verified sender, a network and a provider that is up. With no
 * SENDGRID_API_KEY every send is recorded as `skipped:'no_transport'` and the
 * product still works end to end — a client still learns they are live, by
 * opening the app they were already going to open.
 *
 * WHAT NEVER GOES IN AN EMAIL: a caller's phone number, a contact's name, a
 * transcript. Owner alerts carry TENANT-level facts only. This is the estate
 * rule everywhere else and it holds here.
 */
const { sequelize } = require('../models');

function from() {
  return process.env.LITE_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'info@digit2ai.com';
}
function ownerEmail() {
  return process.env.LITE_OWNER_ALERT_EMAIL || 'mstagg@digit2ai.com';
}
function enabled() {
  return String(process.env.LITE_EMAIL || '').toLowerCase() !== 'off'
    && !!process.env.SENDGRID_API_KEY;
}

/**
 * Send one email. Never throws — a caller is always mid-transaction or
 * mid-webhook, and an email failure must not roll back a payment Stripe has
 * already taken or make HighLevel retry a delivery whose rows are written.
 */
async function email({ to, subject, text }) {
  if (!enabled()) return { sent: false, reason: 'no_transport' };
  const addr = String(to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return { sent: false, reason: 'bad_address' };
  try {
    const sg = require('@sendgrid/mail');
    sg.setApiKey(process.env.SENDGRID_API_KEY);
    await sg.send({
      to: addr,
      from: { email: from(), name: process.env.LITE_FROM_NAME || 'RinglyPro' },
      subject: String(subject || '').slice(0, 200),
      text: String(text || '').slice(0, 20000),
    });
    return { sent: true };
  } catch (e) {
    // Reported, not swallowed: an SMS/email that silently fails is how the
    // estate went weeks without noticing a rotated Twilio token.
    const why = (e && e.response && e.response.body
      && JSON.stringify(e.response.body).slice(0, 200)) || String(e.message || e).slice(0, 200);
    console.warn('[lite:notify] email failed:', why);
    return { sent: false, reason: 'send_failed', detail: why };
  }
}

/** The dashboard row. Written first, on every event, whatever email does. */
async function notify(tenantId, kind, title, body) {
  try {
    await sequelize.query(
      `INSERT INTO lite_notifications (tenant_id, kind, title, body)
       VALUES (:t, :k, :ti, :b)`,
      { replacements: { t: tenantId, k: String(kind).slice(0, 40),
        ti: String(title).slice(0, 200), b: body ? String(body).slice(0, 4000) : null } }
    );
    return { ok: true };
  } catch (e) {
    console.warn('[lite:notify] could not write notification:', e.message);
    return { ok: false, reason: String(e.message || e).slice(0, 120) };
  }
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
  return { ok: true };
}

/* ── THE THREE EVENTS THIS ADD-ON HAS ───────────────────────────────────── */

/**
 * A client paid the setup fee. The owner now has to build that client's
 * HighLevel workflow by hand, so this carries EVERYTHING needed to do the job
 * without opening a dashboard first — and nothing about any caller.
 */
async function ownerSetupPaid(tenant, due) {
  const lines = [
    'A client has paid the outbound setup fee. Their workflow needs building in HighLevel.',
    '',
    `Tenant:        ${tenant.id}`,
    `Business:      ${tenant.business_name || '(not set)'}`,
    `Their number:  ${tenant.ringlypro_number || tenant.did || '(none on file)'}`,
    `GHL location:  ${tenant.ghl_location_id || '(none)'}`,
    `GHL agent:     ${tenant.ghl_agent_id || '(none)'}`,
    `Promised by:   ${due ? new Date(due).toISOString() : '(not set)'}`,
    '',
    'When the workflow is published, switch them on:',
    '  POST /internal/security/outbound',
    '  {"confirm":true,"tenant":' + tenant.id + ',"workflow_id":"<id>"}',
    '',
    'That call verifies the workflow against HighLevel, moves them to active,',
    'and emails the client. Do not do those separately.',
  ].join('\n');
  return email({ to: ownerEmail(), subject: `[RinglyPro Lite] Outbound setup paid — tenant ${tenant.id}`, text: lines });
}

/** The client is live. */
async function clientOutboundReady(tenant, toEmail) {
  const text = [
    `Your outbound caller is ready${tenant.business_name ? ', ' + tenant.business_name : ''}.`,
    '',
    'Open the Outbound tab, add funds, and upload your list.',
    'You are charged per minute of connected call, rounded up to the next minute.',
    '',
    'Numbers are not checked against the National Do Not Call registry.',
    'Only your own do-not-call list is applied.',
  ].join('\n');
  return email({ to: toEmail, subject: 'Your outbound caller is ready', text });
}

/** Past the promise, still not done. Sent to the owner once. */
async function ownerSetupOverdue(tenant, due) {
  const hrs = due ? Math.round((Date.now() - new Date(due).getTime()) / 36e5) : 0;
  return email({
    to: ownerEmail(),
    subject: `[RinglyPro Lite] OVERDUE — outbound setup, tenant ${tenant.id}`,
    text: `Tenant ${tenant.id} (${tenant.business_name || 'unnamed'}) paid for outbound setup and is ${hrs}h past the promised time.\nThey have been told we were notified.`,
  });
}

module.exports = { email, notify, list, markRead, enabled, ownerEmail, from,
  ownerSetupPaid, clientOutboundReady, ownerSetupOverdue };
