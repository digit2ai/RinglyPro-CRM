'use strict';

// Day-before meeting reminder. An hourly poller picks up every project
// meeting whose start_time is within the next 24 hours and that has not
// yet had a reminder sent, then mails every invited stakeholder (skipping
// anyone who already responded "no" via the RSVP buttons) using the same
// styled HTML body as the on-demand invite email — just shorter, with a
// "Reminder" subject and no RSVP buttons (they were already invited).
//
// Bilingual: each event carries its own language column (en|es), captured
// at send-invite time. The reminder renders in that language.

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (e) { /* SendGrid optional */ }

const { Op } = require('sequelize');
const { CalendarEvent, Project, MeetingRsvp } = require('../models');
const { buildCcBcc } = require('./stakeholderRecipients');
const { buildIcs } = require('./meetingInvite');

const ENVELOPE_FROM = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'info@digit2ai.com';
const FROM_NAME = process.env.REQUESTOR_FROM_NAME || 'Manuel Stagg';
const SIGNATURE_EMAIL = process.env.REQUESTOR_REPLY_TO || 'mstagg@digit2ai.com';
const SENDER_TITLE = process.env.REQUESTOR_FROM_TITLE || 'Digit2AI';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function isConfigured() {
  return !!(sgMail && process.env.SENDGRID_API_KEY);
}

// Build the reminder email body for a single recipient. Mirrors the invite
// look (sky-blue meeting card + Join Zoom button) without the RSVP block.
function buildReminder({ project, event, language }) {
  const isEs = language === 'es';
  const L = isEs ? {
    subject: 'Recordatorio',
    hi: 'Hola',
    intro: 'Recordatorio rápido — tienes una reunión mañana para el proyecto',
    details: 'DETALLES DE LA REUNIÓN',
    when: 'Cuándo',
    join: 'Unirse a Zoom',
    or_open: 'O abrir',
    passcode: 'Código',
    ics: 'Se adjunta una invitación de calendario (.ics).',
    access: 'Acceso al proyecto',
    access_hint: 'Detalles del proyecto, hitos y solicitar reprogramación.',
    closing: 'Por favor, ven preparado con actualizaciones de tu área. Si el horario ya no te funciona, responde a este correo y buscaremos otra opción.',
    best: 'Saludos cordiales,'
  } : {
    subject: 'Reminder',
    hi: 'Hi',
    intro: 'Quick reminder — you have a meeting tomorrow for the project',
    details: 'MEETING DETAILS',
    when: 'When',
    join: 'Join Zoom Meeting',
    or_open: 'Or open',
    passcode: 'Passcode',
    ics: 'A calendar invite (.ics) is attached.',
    access: 'Project access',
    access_hint: 'Project details, milestones, and request a reschedule.',
    closing: "Please come prepared with status updates on your area of responsibility. If the time no longer works, reply to this email and we'll find another slot.",
    best: 'Best,'
  };

  const TZ = 'America/New_York';
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : new Date(start.getTime() + 30 * 60000);
  const dateOpts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ };
  const timeOpts = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: TZ };
  const datePart = start.toLocaleDateString(isEs ? 'es-ES' : 'en-US', dateOpts);
  const startTime = start.toLocaleTimeString(isEs ? 'es-ES' : 'en-US', timeOpts);
  const endTime = end.toLocaleTimeString(isEs ? 'es-ES' : 'en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: TZ });
  const whenLabel = `${datePart} · ${startTime} – ${endTime}`;

  const zoomUrl = event.zoom_join_url || '';
  const passcode = event.zoom_password || '';
  const projectName = project.name || '';

  // Build magic link from project share token (if present)
  let magicLink = null;
  if (project.stakeholder_share_token) {
    const base = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
    magicLink = `${base}/projects/share/${project.stakeholder_share_token}`;
  }

  const meetingBlockHtml = `
    <div style="margin:18px 0;padding:18px 20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px">
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#0369a1;font-weight:700;margin-bottom:8px">${esc(L.details)}</div>
      <div style="font-size:15px;color:#0f172a;font-weight:600;margin-bottom:4px">${esc(whenLabel)}</div>
      ${zoomUrl ? `<div style="margin-top:14px"><a href="${esc(zoomUrl)}" style="display:inline-block;background:#2D8CFF;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px">${esc(L.join)}</a></div>
          <div style="margin-top:8px;font-size:11px;color:#64748b;word-break:break-all">${esc(L.or_open)}: <a href="${esc(zoomUrl)}" style="color:#2D8CFF">${esc(zoomUrl)}</a></div>` : ''}
      ${passcode ? `<div style="margin-top:6px;font-size:12px;color:#64748b">${esc(L.passcode)}: <strong>${esc(passcode)}</strong></div>` : ''}
      <div style="margin-top:14px;font-size:12px;color:#475569">${esc(L.ics)}</div>
    </div>
  `;

  const magicLinkHtml = magicLink
    ? `<p style="margin-top:18px">${esc(L.access)}:</p>
       <p style="margin:6px 0 6px"><a href="${esc(magicLink)}" style="color:#0a66c2;word-break:break-all">${esc(magicLink)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;color:#64748b">${esc(L.access_hint)}</p>`
    : '';

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:620px">
    <p>${esc(L.hi)},</p>
    <p>${esc(L.intro)} <strong>"${esc(projectName)}"</strong>.</p>
    ${meetingBlockHtml}
    ${magicLinkHtml}
    <p>${esc(L.closing)}</p>
    <p style="margin-top:22px;margin-bottom:2px">${esc(L.best)}<br>
    <strong>${esc(FROM_NAME)}</strong><br>
    ${esc(SENDER_TITLE)}<br>
    <a href="mailto:${esc(SIGNATURE_EMAIL)}" style="color:#0a66c2">${esc(SIGNATURE_EMAIL)}</a></p>
  </div>`;

  const text = [
    `${L.hi},`,
    '',
    `${L.intro} "${projectName}".`,
    '',
    L.details,
    '---------------',
    `${L.when}: ${whenLabel}`,
    zoomUrl ? `${L.join}: ${zoomUrl}` : '',
    passcode ? `${L.passcode}: ${passcode}` : '',
    '',
    magicLink ? `${L.access}: ${magicLink}` : '',
    '',
    L.closing,
    '',
    L.best,
    FROM_NAME,
    SENDER_TITLE,
    SIGNATURE_EMAIL
  ].filter(Boolean).join('\n');

  const subjectDate = start.toLocaleDateString(isEs ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', timeZone: TZ });
  const subject = `${L.subject}: ${projectName} - ${subjectDate}`;

  // .ics attachment so they can re-add to calendar if they cleared the first invite
  let attachment = null;
  try {
    const ics = buildIcs({
      id: event.id,
      title: event.title || `Meeting - ${projectName}`,
      start_time: start,
      end_time: end,
      description: event.description || '',
      zoom_join_url: zoomUrl || null,
      zoom_password: passcode || null,
      location: event.location || zoomUrl || null
    }, []);
    attachment = {
      content: Buffer.from(ics, 'utf8').toString('base64'),
      filename: 'invite.ics',
      type: 'text/calendar',
      disposition: 'attachment'
    };
  } catch (_) {}

  return { subject, text, html, attachment };
}

// Recipients for one event:
//   - prefer MeetingRsvp rows (skip anyone with response === 'no')
//   - fall back to event.invited_emails if no rsvp rows exist
async function resolveRecipients(event) {
  const rows = await MeetingRsvp.findAll({ where: { event_id: event.id } });
  if (rows.length) {
    return rows
      .filter(r => r.response !== 'no')
      .map(r => String(r.email || '').trim().toLowerCase())
      .filter(Boolean);
  }
  const invited = Array.isArray(event.invited_emails) ? event.invited_emails : [];
  return invited.map(e => String(e || '').trim().toLowerCase()).filter(Boolean);
}

async function tick() {
  if (!isConfigured()) return;
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let due = [];
  try {
    due = await CalendarEvent.findAll({
      where: {
        event_type: 'meeting',
        reminder_sent_at: { [Op.is]: null },
        start_time: { [Op.gt]: now, [Op.lte]: horizon },
        project_id: { [Op.ne]: null }
      },
      order: [['start_time', 'ASC']],
      limit: 50
    });
  } catch (e) {
    console.error('[meetingReminder] poll query failed:', e.message);
    return;
  }
  if (!due.length) return;

  for (const event of due) {
    try {
      const project = await Project.findByPk(event.project_id);
      if (!project) continue;
      const recipients = await resolveRecipients(event);
      if (!recipients.length) {
        // Nothing to send — still mark so we don't retry forever
        event.reminder_sent_at = new Date();
        await event.save();
        continue;
      }
      const { subject, text, html, attachment } = buildReminder({
        project,
        event,
        language: event.language || 'en'
      });
      for (const to of recipients) {
        try {
          const msg = {
            to,
            from: { email: ENVELOPE_FROM, name: FROM_NAME },
            replyTo: SIGNATURE_EMAIL,
            subject,
            text,
            html,
            ...buildCcBcc(to)
          };
          if (attachment) msg.attachments = [attachment];
          await sgMail.send(msg);
        } catch (sendErr) {
          const detail = sendErr.response?.body?.errors?.[0]?.message || sendErr.message;
          console.error('[meetingReminder] send failed:', to, detail);
        }
      }
      event.reminder_sent_at = new Date();
      await event.save();
      console.log(`[meetingReminder] sent ${recipients.length} reminder(s) for event #${event.id} (${event.title})`);
    } catch (e) {
      console.error('[meetingReminder] event handler failed for #' + event.id + ':', e.message);
    }
  }
}

let handle = null;
const POLL_MS = 60 * 60 * 1000; // every 60 min

function startPoller() {
  if (handle) return;
  // First tick 30s after boot so we don't block startup; then hourly.
  setTimeout(() => { tick().catch(() => {}); }, 30 * 1000);
  handle = setInterval(() => { tick().catch(() => {}); }, POLL_MS);
  console.log('[meetingReminder] poller started (tick every', POLL_MS / 60000, 'min)');
}

module.exports = { isConfigured, tick, startPoller, buildReminder };
