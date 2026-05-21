'use strict';

// Sends a meeting-minutes recap email to the linked project's stakeholders
// (project.submitter_email + project.team_members[*].email). Used by both
// the manual "Send" button and the auto-send-on-first-save hook in
// routes/meeting-minutes.js.

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (e) { /* SendGrid optional — sends will fail loudly */ }

const { MeetingMinute, Project } = require('../models');
const { buildCcBcc } = require('./stakeholderRecipients');

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'info@digit2ai.com';
const FROM_NAME  = 'Digit2AI';
const REPLY_TO   = process.env.REQUESTOR_REPLY_TO || 'mstagg@digit2ai.com';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (s) => String(s || '').trim().toLowerCase();

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function fmtDate(d) {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date)) return String(d);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function collectStakeholders(project) {
  const set = new Set();
  if (project && project.submitter_email) {
    const e = norm(project.submitter_email);
    if (EMAIL_RE.test(e)) set.add(e);
  }
  if (project && Array.isArray(project.team_members)) {
    project.team_members.forEach(m => {
      if (m && m.email) {
        const e = norm(m.email);
        if (EMAIL_RE.test(e)) set.add(e);
      }
    });
  }
  return Array.from(set);
}

function buildHtml({ subject, meetingDate, notes, aiSummary, actionItems, projectName }) {
  const items = Array.isArray(actionItems) ? actionItems : [];
  const itemsHtml = items.length ? `
    <h3 style="margin:24px 0 8px 0;color:#0f172a;font-size:16px">Action Items</h3>
    <ul style="margin:0;padding-left:22px;color:#334155;font-size:14px;line-height:1.55">
      ${items.map(i => `
        <li style="margin-bottom:8px">
          <strong>${esc(i.title || '')}</strong>
          ${i.assignee_hint ? ` <span style="color:#64748b">(suggested owner: ${esc(i.assignee_hint)})</span>` : ''}
          ${i.due_in_days != null ? ` <span style="color:#64748b">— due in ${esc(String(i.due_in_days))} day${i.due_in_days === 1 ? '' : 's'}</span>` : ''}
          ${i.description ? `<div style="font-size:13px;color:#475569;margin-top:2px">${esc(i.description)}</div>` : ''}
        </li>
      `).join('')}
    </ul>
  ` : '';

  const summaryHtml = aiSummary ? `
    <div style="background:#f0f9ff;border-left:3px solid #38bdf8;padding:12px 16px;margin:18px 0;border-radius:0 6px 6px 0">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#0369a1;font-weight:700;margin-bottom:4px">Summary</div>
      <div style="color:#0c4a6e;font-size:14px;line-height:1.55;white-space:pre-wrap">${esc(aiSummary)}</div>
    </div>
  ` : '';

  const notesHtml = notes ? `
    <h3 style="margin:24px 0 8px 0;color:#0f172a;font-size:16px">Full Notes</h3>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 16px;color:#1e293b;font-size:13px;line-height:1.55;white-space:pre-wrap">${esc(notes)}</div>
  ` : '';

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
        <tr><td style="padding:28px 32px 8px 32px">
          <div style="font-size:12px;color:#64748b;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:8px">Meeting Minutes</div>
          <h1 style="margin:0 0 4px 0;font-size:22px;color:#0f172a;font-weight:700;line-height:1.3">${esc(subject)}</h1>
          <div style="font-size:13px;color:#475569;margin-top:4px">
            ${esc(fmtDate(meetingDate))}${projectName ? '  ·  Project: <strong>' + esc(projectName) + '</strong>' : ''}
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px">
          ${summaryHtml}
          ${itemsHtml}
          ${notesHtml}
        </td></tr>
        <tr><td style="padding:14px 32px 20px 32px;border-top:1px solid #e2e8f0;background:#f8fafc">
          <div style="font-size:12px;color:#64748b">Reply to this email to comment or add corrections — replies go to ${esc(REPLY_TO)}.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildText({ subject, meetingDate, notes, aiSummary, actionItems, projectName }) {
  const items = Array.isArray(actionItems) ? actionItems : [];
  const lines = [];
  lines.push(`MEETING MINUTES — ${subject}`);
  lines.push(`${fmtDate(meetingDate)}${projectName ? '  ·  Project: ' + projectName : ''}`);
  lines.push('');
  if (aiSummary) {
    lines.push('SUMMARY');
    lines.push(aiSummary);
    lines.push('');
  }
  if (items.length) {
    lines.push('ACTION ITEMS');
    items.forEach((i, idx) => {
      const due = (i.due_in_days != null) ? ` (due in ${i.due_in_days} day${i.due_in_days === 1 ? '' : 's'})` : '';
      const owner = i.assignee_hint ? ` — owner: ${i.assignee_hint}` : '';
      lines.push(`${idx + 1}. ${i.title || ''}${owner}${due}`);
      if (i.description) lines.push(`   ${i.description}`);
    });
    lines.push('');
  }
  if (notes) {
    lines.push('FULL NOTES');
    lines.push('---');
    lines.push(notes);
    lines.push('---');
    lines.push('');
  }
  lines.push(`(Reply to this email to comment — replies go to ${REPLY_TO}.)`);
  return lines.join('\n');
}

// Sends the meeting minutes to the linked project's stakeholders.
// Returns { sent: [...], failed: [...], skipped_reason: '...' }
async function sendMinutesToStakeholders(meetingMinuteId, { onlyTo } = {}) {
  if (!sgMail || !process.env.SENDGRID_API_KEY) {
    return { sent: [], failed: [], skipped_reason: 'sendgrid_not_configured' };
  }
  const minute = await MeetingMinute.findByPk(meetingMinuteId);
  if (!minute) return { sent: [], failed: [], skipped_reason: 'minute_not_found' };
  if (!minute.notes || !minute.notes.trim()) {
    return { sent: [], failed: [], skipped_reason: 'no_notes' };
  }
  if (!minute.project_id) {
    return { sent: [], failed: [], skipped_reason: 'no_project' };
  }
  const project = await Project.findByPk(minute.project_id);
  if (!project) return { sent: [], failed: [], skipped_reason: 'project_not_found' };

  let recipients = Array.isArray(onlyTo) && onlyTo.length
    ? onlyTo.map(norm).filter(e => EMAIL_RE.test(e))
    : collectStakeholders(project);
  // Dedup
  recipients = Array.from(new Set(recipients));
  if (!recipients.length) {
    return { sent: [], failed: [], skipped_reason: 'no_stakeholders' };
  }

  const subject = `Meeting Minutes — ${minute.subject || 'Untitled'} · ${fmtDate(minute.meeting_date)}`;
  const html = buildHtml({
    subject: minute.subject,
    meetingDate: minute.meeting_date,
    notes: minute.notes,
    aiSummary: minute.ai_summary,
    actionItems: minute.action_items_json,
    projectName: project.name
  });
  const text = buildText({
    subject: minute.subject,
    meetingDate: minute.meeting_date,
    notes: minute.notes,
    aiSummary: minute.ai_summary,
    actionItems: minute.action_items_json,
    projectName: project.name
  });

  // One send per recipient (personal To: line), with CC/BCC riding along.
  const sent = [];
  const failed = [];
  for (const to of recipients) {
    const msg = {
      to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      replyTo: REPLY_TO,
      subject,
      text,
      html,
      ...buildCcBcc(to)
    };
    try {
      await sgMail.send(msg);
      sent.push(to);
    } catch (err) {
      const detail = err.response?.body?.errors?.[0]?.message || err.message;
      console.error('[D2AI-MeetingMinutes] send failed:', to, detail);
      failed.push({ email: to, error: detail });
    }
  }

  // Persist send log
  const existingSent = Array.isArray(minute.sent_to) ? minute.sent_to : [];
  const merged = Array.from(new Set([...existingSent, ...sent]));
  minute.sent_to = merged;
  if (sent.length) minute.sent_at = new Date();
  await minute.save();

  return { sent, failed };
}

module.exports = { sendMinutesToStakeholders, collectStakeholders };
