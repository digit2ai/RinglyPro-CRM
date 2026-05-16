'use strict';

// Daily digest email to Manuel summarizing intake submissions still
// sitting in `pending_review`. Skipped entirely on days when the
// inbox is empty (no inbox-zero spam). Idempotent across process
// restarts by querying ActivityLog for the most recent send.

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (e) { /* SendGrid optional */ }

const { Op } = require('sequelize');
const { Project, ActivityLog } = require('../models');

const ENVELOPE_FROM = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'info@digit2ai.com';
const FROM_NAME = process.env.REQUESTOR_FROM_NAME || 'Manuel Stagg';
const TO_EMAIL = process.env.REQUESTOR_REPLY_TO || 'mstagg@digit2ai.com';
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
const ACTIVITY_ACTION = 'inbox_digest_sent';
const MIN_HOURS_BETWEEN = 23; // run at most once per day

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function isConfigured() { return !!(sgMail && process.env.SENDGRID_API_KEY); }

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDays(d) {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function buildDigest(projects) {
  const inboxUrl = `${PUBLIC_BASE}/projects/intake/admin.html`;
  const count = projects.length;
  const subject = `Inbox digest: ${count} project request${count === 1 ? '' : 's'} pending review`;

  const rowsHtml = projects.map(p => {
    const submitter = p.submitter_name
      ? `${esc(p.submitter_name)}${p.submitter_email ? ' &lt;' + esc(p.submitter_email) + '&gt;' : ''}`
      : (p.submitter_email ? esc(p.submitter_email) : '(unknown submitter)');
    const desc = (p.description || '').slice(0, 180);
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;vertical-align:top">
          <div style="font-weight:600;color:#0f172a;font-size:14px">${esc(p.name || 'Untitled')}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px">${submitter}</div>
          ${desc ? `<div style="font-size:12px;color:#64748b;margin-top:6px;line-height:1.5">${esc(desc)}${(p.description || '').length > 180 ? '&hellip;' : ''}</div>` : ''}
          <div style="font-size:11px;color:#94a3b8;margin-top:6px">Submitted ${fmtDays(p.created_at)} &middot; ${fmtDate(p.created_at)}</div>
        </td>
      </tr>
    `;
  }).join('');

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:620px">
    <p>Hi Manuel,</p>
    <p>You have <strong>${count}</strong> project request${count === 1 ? '' : 's'} waiting in the intake inbox.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:14px 0 18px">${rowsHtml}</table>
    <p style="margin:18px 0 6px">
      <a href="${esc(inboxUrl)}" style="display:inline-block;background:#2D8CFF;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px">Review the inbox</a>
    </p>
    <p style="font-size:11px;color:#94a3b8;margin-top:22px">Sent once per day while the inbox has pending items.</p>
  </div>`;

  const text = [
    'Hi Manuel,',
    '',
    `You have ${count} project request${count === 1 ? '' : 's'} waiting in the intake inbox:`,
    '',
    ...projects.map((p, i) => {
      const subm = p.submitter_name
        ? `${p.submitter_name}${p.submitter_email ? ' <' + p.submitter_email + '>' : ''}`
        : (p.submitter_email || '(unknown submitter)');
      return `${i + 1}. ${p.name || 'Untitled'} — submitted ${fmtDays(p.created_at)} by ${subm}`;
    }),
    '',
    `Review them: ${inboxUrl}`
  ].join('\n');

  return { subject, html, text };
}

async function tick() {
  if (!isConfigured()) return;

  // Skip if we already sent a digest in the last MIN_HOURS_BETWEEN hours.
  // Looking at ActivityLog by action lets the flag survive process restarts.
  try {
    const cutoff = new Date(Date.now() - MIN_HOURS_BETWEEN * 60 * 60 * 1000);
    const recent = await ActivityLog.findOne({
      where: { action: ACTIVITY_ACTION, created_at: { [Op.gt]: cutoff } },
      order: [['created_at', 'DESC']]
    });
    if (recent) return;
  } catch (_) { /* on query failure, proceed anyway */ }

  let projects = [];
  try {
    projects = await Project.findAll({
      where: { intake_status: 'pending_review', archived_at: null },
      attributes: ['id', 'name', 'description', 'submitter_name', 'submitter_email', 'created_at'],
      order: [['created_at', 'ASC']],
      limit: 25
    });
  } catch (e) {
    console.error('[inboxDigest] query failed:', e.message);
    return;
  }
  if (!projects.length) {
    console.log('[inboxDigest] inbox empty — skipping digest');
    return;
  }

  const { subject, html, text } = buildDigest(projects);
  try {
    await sgMail.send({
      to: TO_EMAIL,
      from: { email: ENVELOPE_FROM, name: FROM_NAME },
      subject,
      text,
      html
    });
    console.log(`[inboxDigest] digest sent to ${TO_EMAIL} (${projects.length} pending)`);
    try {
      await ActivityLog.create({
        workspace_id: 1,
        action: ACTIVITY_ACTION,
        entity_type: 'system',
        entity_name: `inbox digest: ${projects.length} pending`,
        details: { count: projects.length, ids: projects.map(p => p.id) }
      });
    } catch (_) {}
  } catch (err) {
    const detail = err.response?.body?.errors?.[0]?.message || err.message;
    console.error('[inboxDigest] send failed:', detail);
  }
}

let handle = null;
// Poll every 6 hours — we want at most one digest per day, but checking
// 4x/day means the inbox can clear and re-fill without missing a window.
// The ActivityLog gate ensures we never send more than once per 23h anyway.
const POLL_MS = 6 * 60 * 60 * 1000;

function startPoller() {
  if (handle) return;
  setTimeout(() => { tick().catch(() => {}); }, 60 * 1000);
  handle = setInterval(() => { tick().catch(() => {}); }, POLL_MS);
  console.log('[inboxDigest] poller started (tick every', POLL_MS / 60000 / 60, 'h)');
}

module.exports = { isConfigured, tick, startPoller, buildDigest };
