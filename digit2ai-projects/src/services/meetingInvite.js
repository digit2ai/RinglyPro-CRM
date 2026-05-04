'use strict';

// Meeting invitation builder + SendGrid sender.
// Sends a plain, clean meeting invite email with an .ics attachment so
// recipients can one-click add the event to Google/Outlook/Apple Calendar.

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (e) { /* @sendgrid/mail not installed — sends will fail loudly */ }

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'info@digit2ai.com';
const FROM_NAME  = 'Digit2AI';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeEmails(input) {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : String(input).split(/[,;\s\n]+/);
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const e = String(r || '').trim().toLowerCase();
    if (!e || !EMAIL_RE.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

// Format Date as iCalendar UTC: 20260504T140000Z
function icsDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    dt.getUTCFullYear().toString() +
    pad(dt.getUTCMonth() + 1) +
    pad(dt.getUTCDate()) + 'T' +
    pad(dt.getUTCHours()) +
    pad(dt.getUTCMinutes()) +
    pad(dt.getUTCSeconds()) + 'Z'
  );
}

// Escape iCalendar TEXT values per RFC 5545: \\, \;, \, , \n
function icsEscape(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Build an RFC 5545 VCALENDAR body for one event. CRLF line endings are mandatory.
function buildIcs(event, attendeeEmails) {
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : new Date(start.getTime() + 30 * 60000);
  const uid = `d2ai-event-${event.id}@digit2ai.com`;
  const summary = icsEscape(event.title || 'Meeting');
  let descParts = [];
  if (event.description) descParts.push(event.description);
  if (event.zoom_join_url) {
    descParts.push('');
    descParts.push('Join Zoom Meeting:');
    descParts.push(event.zoom_join_url);
    if (event.zoom_password) descParts.push('Passcode: ' + event.zoom_password);
  }
  const description = icsEscape(descParts.join('\n'));
  const location = icsEscape(event.zoom_join_url || event.location || '');

  const attendees = (attendeeEmails || []).map(e =>
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${e}":mailto:${e}`
  );

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Digit2AI//CRM Calendar//EN',
    'METHOD:REQUEST',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${summary}`,
    description ? `DESCRIPTION:${description}` : null,
    location ? `LOCATION:${location}` : null,
    `ORGANIZER;CN=${FROM_NAME}:mailto:${FROM_EMAIL}`,
    ...attendees,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);

  return lines.join('\r\n') + '\r\n';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function fmtWhen(start, end) {
  const s = new Date(start);
  const dateOpts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  const timeOpts = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  const datePart = s.toLocaleDateString('en-US', dateOpts);
  const startTime = s.toLocaleTimeString('en-US', timeOpts);
  if (end) {
    const e = new Date(end);
    const endTime = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${datePart} · ${startTime.replace(/ [A-Z]{2,4}$/, '')} – ${endTime}${startTime.match(/ [A-Z]{2,4}$/) ? ' ' + startTime.match(/ [A-Z]{2,4}$/)[0].trim() : ''}`;
  }
  return `${datePart} · ${startTime}`;
}

function buildHtml(event, customMessage, organizerName) {
  const when = fmtWhen(event.start_time, event.end_time);
  const titleSafe = escapeHtml(event.title || 'Meeting');
  const customSafe = customMessage ? `<p style="margin:0 0 16px 0;color:#334155;font-size:15px;line-height:1.55;white-space:pre-wrap">${escapeHtml(customMessage)}</p>` : '';
  const descSafe = event.description ? `<div style="margin:18px 0 0 0;padding-top:18px;border-top:1px solid #e2e8f0;color:#475569;font-size:14px;line-height:1.55;white-space:pre-wrap">${escapeHtml(event.description)}</div>` : '';
  const locationLine = !event.zoom_join_url && event.location
    ? `<div style="margin-top:6px;color:#475569;font-size:14px"><strong>Location:</strong> ${escapeHtml(event.location)}</div>`
    : '';

  const zoomBlock = event.zoom_join_url ? `
    <div style="margin:24px 0 8px 0">
      <a href="${escapeHtml(event.zoom_join_url)}" style="display:inline-block;background:#2D8CFF;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:16px">Join Zoom Meeting</a>
    </div>
    <div style="margin-top:6px;font-size:12px;color:#64748b;word-break:break-all">
      Or open: <a href="${escapeHtml(event.zoom_join_url)}" style="color:#2D8CFF">${escapeHtml(event.zoom_join_url)}</a>
    </div>
    ${event.zoom_password ? `<div style="margin-top:4px;font-size:12px;color:#64748b">Passcode: <strong>${escapeHtml(event.zoom_password)}</strong></div>` : ''}
  ` : '';

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
        <tr><td style="padding:28px 32px 24px 32px">
          <div style="font-size:13px;color:#64748b;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:8px">You're invited</div>
          <h1 style="margin:0 0 4px 0;font-size:22px;color:#0f172a;font-weight:700;line-height:1.3">${titleSafe}</h1>
          <div style="margin-top:6px;color:#475569;font-size:14px"><strong>When:</strong> ${escapeHtml(when)}</div>
          ${locationLine}
          ${zoomBlock}
          ${customSafe ? `<div style="margin-top:22px">${customSafe}</div>` : ''}
          ${descSafe}
        </td></tr>
        <tr><td style="padding:18px 32px 24px 32px;border-top:1px solid #e2e8f0;background:#f8fafc">
          <div style="font-size:13px;color:#64748b">A calendar invite (.ics) is attached — click it to add this meeting to your calendar.</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:10px">Sent by ${escapeHtml(organizerName || FROM_NAME)} · <a href="mailto:${FROM_EMAIL}" style="color:#94a3b8">${FROM_EMAIL}</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildText(event, customMessage, organizerName) {
  const when = fmtWhen(event.start_time, event.end_time);
  const lines = [];
  lines.push(`You're invited: ${event.title || 'Meeting'}`);
  lines.push('');
  lines.push(`When: ${when}`);
  if (!event.zoom_join_url && event.location) lines.push(`Location: ${event.location}`);
  if (event.zoom_join_url) {
    lines.push('');
    lines.push(`Join Zoom Meeting: ${event.zoom_join_url}`);
    if (event.zoom_password) lines.push(`Passcode: ${event.zoom_password}`);
  }
  if (customMessage) {
    lines.push('');
    lines.push(customMessage);
  }
  if (event.description) {
    lines.push('');
    lines.push('---');
    lines.push(event.description);
  }
  lines.push('');
  lines.push('A calendar invite (.ics) is attached — open it to add this meeting to your calendar.');
  lines.push('');
  lines.push(`— ${organizerName || FROM_NAME} (${FROM_EMAIL})`);
  return lines.join('\n');
}

function isConfigured() {
  return !!(sgMail && process.env.SENDGRID_API_KEY);
}

// Sends one email per recipient (so each gets a personal "To:" rather than being CC'd together).
// Returns { sent: [...], failed: [{ email, error }, ...] }
async function sendInvites({ event, emails, customMessage, organizerName, organizerEmail }) {
  if (!isConfigured()) {
    throw new Error('SendGrid not configured (SENDGRID_API_KEY missing)');
  }
  const recipients = normalizeEmails(emails);
  if (!recipients.length) return { sent: [], failed: [] };

  const ics = buildIcs(event, recipients);
  const html = buildHtml(event, customMessage, organizerName);
  const text = buildText(event, customMessage, organizerName);
  const startStr = new Date(event.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const subject = `You're invited: ${event.title || 'Meeting'} — ${startStr}`;

  const attachment = {
    content: Buffer.from(ics, 'utf8').toString('base64'),
    filename: 'invite.ics',
    type: 'text/calendar; method=REQUEST; charset=UTF-8',
    disposition: 'attachment'
  };

  const sent = [];
  const failed = [];
  for (const to of recipients) {
    const msg = {
      to,
      from: { email: FROM_EMAIL, name: organizerName || FROM_NAME },
      replyTo: organizerEmail || FROM_EMAIL,
      subject,
      text,
      html,
      attachments: [attachment]
    };
    try {
      await sgMail.send(msg);
      sent.push(to);
    } catch (err) {
      const detail = err.response?.body?.errors?.[0]?.message || err.message;
      console.error('[D2AI] invite send failed:', to, detail);
      failed.push({ email: to, error: detail });
    }
  }
  return { sent, failed };
}

module.exports = { isConfigured, normalizeEmails, sendInvites, buildIcs };
