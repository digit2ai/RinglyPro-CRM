'use strict';

// "Are you coming?" nudge — sent to recipients who never clicked Yes/No/
// Maybe in the meeting invite, when the meeting is less than 48 hours away.
// Soft tone, same RSVP buttons (using the existing token), and the same
// styled meeting card as the invite/reminder so the look stays consistent.
//
// Skips:
//   - recipients who already responded (yes / no / maybe)
//   - rows where rsvp_reminder_sent_at is already set (one nudge per row)
//   - meetings that have already started
//   - meetings whose invited_at is < 12h ago (let the original invite do
//     its job for short-notice meetings before nagging)

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (e) { /* SendGrid optional */ }

const { Op } = require('sequelize');
const { MeetingRsvp, CalendarEvent, Project } = require('../models');
const { buildCcBcc } = require('./stakeholderRecipients');

const ENVELOPE_FROM = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'info@digit2ai.com';
const FROM_NAME = process.env.REQUESTOR_FROM_NAME || 'Manuel Stagg';
const SIGNATURE_EMAIL = process.env.REQUESTOR_REPLY_TO || 'mstagg@digit2ai.com';
const SENDER_TITLE = process.env.REQUESTOR_FROM_TITLE || 'Digit2AI';
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function isConfigured() {
  return !!(sgMail && process.env.SENDGRID_API_KEY);
}

// Build the nudge email for one recipient.
function buildNudge({ project, event, rsvp }) {
  const isEs = (event.language || 'en') === 'es';
  const L = isEs ? {
    subject_prefix: '¿Vas a asistir?',
    hi: 'Hola',
    intro1: 'Notamos que aún no nos confirmaste si podrás asistir a la reunión de mañana para el proyecto',
    intro2: 'Toma un segundo para hacer clic en una de las opciones de abajo — así sabemos con quién contar.',
    details: 'DETALLES DE LA REUNIÓN',
    when: 'Cuándo',
    join: 'Unirse a Zoom',
    or_open: 'O abrir',
    passcode: 'Código',
    rsvp_label: '¿Asistirás?',
    rsvp_yes: 'Sí, asistiré',
    rsvp_maybe: 'Tal vez',
    rsvp_no: 'No puedo',
    reschedule_label: '¿No te funciona el horario?',
    reschedule_cta: 'Proponer otro horario',
    reschedule_hint: 'Abre el espacio de trabajo del proyecto para elegir uno de los próximos espacios disponibles.',
    foot: 'Si el horario no te funciona, también puedes responder a este correo y buscaremos otra opción.',
    best: 'Saludos cordiales,'
  } : {
    subject_prefix: 'Are you coming?',
    hi: 'Hi',
    intro1: 'We noticed you haven\'t let us know yet whether you can join tomorrow\'s meeting for the project',
    intro2: 'Take a second to click one of the options below — it helps us know who to expect.',
    details: 'MEETING DETAILS',
    when: 'When',
    join: 'Join Zoom Meeting',
    or_open: 'Or open',
    passcode: 'Passcode',
    rsvp_label: 'Will you attend?',
    rsvp_yes: "Yes, I'll attend",
    rsvp_maybe: 'Maybe',
    rsvp_no: "No, I can't make it",
    reschedule_label: "Time doesn't work?",
    reschedule_cta: 'Propose a new time',
    reschedule_hint: 'Opens the project workspace where you can pick one of the next available slots.',
    foot: "If the time doesn't work for you, reply to this email and we'll find another slot.",
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

  const rsvpUrl = (r) => `${PUBLIC_BASE}/projects/api/v1/meeting-rsvp/${rsvp.token}/${r}`;

  // Reschedule deep-link — opens the share page with email pre-filled, the
  // matching meeting highlighted, and the slot picker auto-opened (since
  // Option 2 lets any stakeholder reschedule, not just the project owner).
  const rescheduleUrl = project.stakeholder_share_token
    ? `${PUBLIC_BASE}/projects/share/${project.stakeholder_share_token}?email=${encodeURIComponent(rsvp.email)}&meeting=${event.id}&action=reschedule`
    : null;

  const meetingBlockHtml = `
    <div style="margin:18px 0;padding:18px 20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px">
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#0369a1;font-weight:700;margin-bottom:8px">${esc(L.details)}</div>
      <div style="font-size:15px;color:#0f172a;font-weight:600;margin-bottom:4px">${esc(whenLabel)}</div>
      ${zoomUrl ? `<div style="margin-top:14px"><a href="${esc(zoomUrl)}" style="display:inline-block;background:#2D8CFF;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px">${esc(L.join)}</a></div>
          <div style="margin-top:8px;font-size:11px;color:#64748b;word-break:break-all">${esc(L.or_open)}: <a href="${esc(zoomUrl)}" style="color:#2D8CFF">${esc(zoomUrl)}</a></div>` : ''}
      ${passcode ? `<div style="margin-top:6px;font-size:12px;color:#64748b">${esc(L.passcode)}: <strong>${esc(passcode)}</strong></div>` : ''}
    </div>
  `;

  const rsvpBlockHtml = `
    <div style="margin:22px 0 8px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
      <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:10px">${esc(L.rsvp_label)}</div>
      <div style="display:inline-block;margin-right:6px">
        <a href="${rsvpUrl('yes')}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-weight:600;font-size:13px">${esc(L.rsvp_yes)}</a>
      </div>
      <div style="display:inline-block;margin-right:6px">
        <a href="${rsvpUrl('maybe')}" style="display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-weight:600;font-size:13px">${esc(L.rsvp_maybe)}</a>
      </div>
      <div style="display:inline-block">
        <a href="${rsvpUrl('no')}" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-weight:600;font-size:13px">${esc(L.rsvp_no)}</a>
      </div>
    </div>
  `;

  const rescheduleBlockHtml = rescheduleUrl ? `
    <div style="margin:14px 0 8px;padding:14px 16px;background:rgba(45,140,255,0.06);border:1px solid rgba(45,140,255,0.3);border-radius:10px">
      <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:8px">${esc(L.reschedule_label)}</div>
      <a href="${esc(rescheduleUrl)}" style="display:inline-block;background:#2D8CFF;color:#fff;text-decoration:none;padding:9px 18px;border-radius:6px;font-weight:600;font-size:13px">${esc(L.reschedule_cta)}</a>
      <div style="margin-top:8px;font-size:11px;color:#64748b">${esc(L.reschedule_hint)}</div>
    </div>
  ` : '';

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:620px">
    <p>${esc(L.hi)},</p>
    <p>${esc(L.intro1)} <strong>"${esc(projectName)}"</strong>.</p>
    <p>${esc(L.intro2)}</p>
    ${meetingBlockHtml}
    ${rsvpBlockHtml}
    ${rescheduleBlockHtml}
    <p style="font-size:13px;color:#475569;margin-top:18px">${esc(L.foot)}</p>
    <p style="margin-top:22px;margin-bottom:2px">${esc(L.best)}<br>
    <strong>${esc(FROM_NAME)}</strong><br>
    ${esc(SENDER_TITLE)}<br>
    <a href="mailto:${esc(SIGNATURE_EMAIL)}" style="color:#0a66c2">${esc(SIGNATURE_EMAIL)}</a></p>
  </div>`;

  const text = [
    `${L.hi},`,
    '',
    `${L.intro1} "${projectName}".`,
    L.intro2,
    '',
    L.details,
    '---------------',
    `${L.when}: ${whenLabel}`,
    zoomUrl ? `${L.join}: ${zoomUrl}` : '',
    passcode ? `${L.passcode}: ${passcode}` : '',
    '',
    `${L.rsvp_yes}: ${rsvpUrl('yes')}`,
    `${L.rsvp_maybe}: ${rsvpUrl('maybe')}`,
    `${L.rsvp_no}: ${rsvpUrl('no')}`,
    rescheduleUrl ? '' : null,
    rescheduleUrl ? `${L.reschedule_label} ${L.reschedule_cta}: ${rescheduleUrl}` : null,
    '',
    L.foot,
    '',
    L.best,
    FROM_NAME,
    SENDER_TITLE,
    SIGNATURE_EMAIL
  ].filter(Boolean).join('\n');

  const subjectDate = start.toLocaleDateString(isEs ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', timeZone: TZ });
  const subject = `${L.subject_prefix} - ${projectName} - ${subjectDate}`;

  return { subject, text, html };
}

async function tick() {
  if (!isConfigured()) return;
  const now = new Date();
  const horizon48 = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  let rows = [];
  try {
    rows = await MeetingRsvp.findAll({
      where: {
        response: { [Op.is]: null },
        rsvp_reminder_sent_at: { [Op.is]: null },
        invited_at: { [Op.lt]: twelveHoursAgo }
      },
      limit: 100,
      order: [['invited_at', 'ASC']]
    });
  } catch (e) {
    console.error('[rsvpReminder] poll query failed:', e.message);
    return;
  }
  if (!rows.length) return;

  for (const rsvp of rows) {
    try {
      const event = await CalendarEvent.findByPk(rsvp.event_id);
      if (!event) continue;
      const start = new Date(event.start_time).getTime();
      // Skip if meeting already started OR is more than 48h away
      if (start <= now.getTime()) continue;
      if (start > horizon48.getTime()) continue;

      const project = rsvp.project_id ? await Project.findByPk(rsvp.project_id) : null;
      if (!project) continue;

      const { subject, text, html } = buildNudge({ project, event, rsvp });

      try {
        await sgMail.send({
          to: rsvp.email,
          from: { email: ENVELOPE_FROM, name: FROM_NAME },
          replyTo: SIGNATURE_EMAIL,
          subject,
          text,
          html,
          ...buildCcBcc(rsvp.email)
        });
        rsvp.rsvp_reminder_sent_at = new Date();
        await rsvp.save();
        console.log(`[rsvpReminder] nudge sent to ${rsvp.email} for event #${rsvp.event_id} (${event.title})`);
      } catch (sendErr) {
        const detail = sendErr.response?.body?.errors?.[0]?.message || sendErr.message;
        console.error('[rsvpReminder] send failed:', rsvp.email, detail);
      }
    } catch (e) {
      console.error('[rsvpReminder] row handler failed for rsvp #' + rsvp.id + ':', e.message);
    }
  }
}

let handle = null;
const POLL_MS = 60 * 60 * 1000; // hourly, same cadence as meetingReminder

function startPoller() {
  if (handle) return;
  // First tick 45s after boot (offset slightly from the day-before reminder
  // poller at 30s so the two services don't slam the DB at the same instant).
  setTimeout(() => { tick().catch(() => {}); }, 45 * 1000);
  handle = setInterval(() => { tick().catch(() => {}); }, POLL_MS);
  console.log('[rsvpReminder] poller started (tick every', POLL_MS / 60000, 'min)');
}

module.exports = { isConfigured, tick, startPoller, buildNudge };
