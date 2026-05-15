'use strict';

// On-demand meeting invite — sent from the Project Dashboard's Schedule
// Meeting modal. Uses the same HTML + .ics format as the auto-scheduled
// kickoff email (see requestorNotification.sendApprovalAcknowledgment),
// so every meeting invite the team sends looks consistent and professional.

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (e) { /* SendGrid optional */ }

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

// recipients: array of email strings (To: list, all visible to each other)
// project:    { id, name, description, business_requirements }
// meeting:    { id, title, start_time, end_time, zoom_join_url, zoom_password, location, description }
// agenda:     array of strings (numbered automatically)
// objective:  optional opening line shown above the project summary
// magicLink:  full URL to the stakeholder share page
// language:   'en' or 'es' — toggles label wording
async function sendOnDemandMeetingInvite({
  recipients, project, meeting, agenda, objective, magicLink, language = 'en'
}) {
  if (!isConfigured()) return { sent: false, reason: 'sendgrid_not_configured' };
  if (!recipients || !recipients.length) return { sent: false, reason: 'no_recipients' };
  if (!meeting || !meeting.start_time) return { sent: false, reason: 'no_meeting_time' };

  const isEs = language === 'es';
  const L = isEs ? {
    invite_to: 'Te invitamos a una reunión de trabajo para',
    summary: 'RESUMEN DEL PROYECTO',
    details: 'DETALLES DE LA REUNIÓN',
    when: 'Cuándo',
    join: 'Unirse a Zoom',
    or_open: 'O abrir',
    passcode: 'Código',
    ics_note: 'Se adjunta una invitación de calendario (.ics).',
    agenda: 'AGENDA',
    access: 'Acceso al proyecto',
    access_hint: 'Consulta los detalles del proyecto, los hitos y solicita una reprogramación.',
    closing: 'Por favor, ven preparado con actualizaciones de tu área. Responde si el horario no te funciona y buscaremos otra opción.',
    looking_forward: 'Esperamos hablar contigo.',
    best: 'Saludos cordiales,',
    subject_lead: 'Invitación de reunión'
  } : {
    invite_to: "You're invited to a working meeting for",
    summary: 'PROJECT SUMMARY',
    details: 'MEETING DETAILS',
    when: 'When',
    join: 'Join Zoom Meeting',
    or_open: 'Or open',
    passcode: 'Passcode',
    ics_note: 'A calendar invite (.ics) is attached.',
    agenda: 'AGENDA',
    access: 'Project access',
    access_hint: 'View project details, milestones, and request a reschedule.',
    closing: "Please come prepared with status updates on your area of responsibility. Reply if the time doesn't work and we'll find another slot.",
    looking_forward: 'Looking forward to speaking with you.',
    best: 'Best,',
    subject_lead: 'Meeting'
  };

  // Format date/time in US Eastern so requestors see the meeting in our
  // business timezone, not the server's UTC.
  const TZ = 'America/New_York';
  const start = new Date(meeting.start_time);
  const end = meeting.end_time ? new Date(meeting.end_time) : new Date(start.getTime() + 30 * 60000);
  const dateOpts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ };
  const timeOpts = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: TZ };
  const datePart = start.toLocaleDateString(isEs ? 'es-ES' : 'en-US', dateOpts);
  const startTime = start.toLocaleTimeString(isEs ? 'es-ES' : 'en-US', timeOpts);
  const endTime = end.toLocaleTimeString(isEs ? 'es-ES' : 'en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: TZ });
  const whenLabel = `${datePart} · ${startTime} – ${endTime}`;

  const projectName = project.name || 'project';
  const projectSummaryRaw = (project.description || project.business_requirements || '').trim();
  const projectSummary = projectSummaryRaw.length > 600
    ? projectSummaryRaw.slice(0, 600).replace(/\s+\S*$/, '') + '...'
    : projectSummaryRaw;

  const agendaItems = Array.isArray(agenda) && agenda.length ? agenda : (isEs ? [
    'Estado y avances del proyecto desde la última sincronización',
    'Hitos completados y revisión de entregables',
    'Próximos pasos e hitos por venir',
    'Bloqueos, riesgos y decisiones pendientes',
    'Acciones a tomar, responsables y fechas objetivo'
  ] : [
    'Project status & progress since last sync',
    'Milestones completed and deliverables review',
    'Next steps & upcoming milestones',
    'Blockers, risks & open decisions',
    'Action items, owners & target dates'
  ]);

  const zoomUrl = meeting.zoom_join_url || '';
  const passcode = meeting.zoom_password || '';

  // ---- Plain-text body ----
  const lines = [];
  lines.push(isEs ? 'Hola,' : 'Hi,');
  lines.push('');
  lines.push(`${L.invite_to} "${projectName}".`);
  lines.push('');
  if (objective && objective.trim()) {
    lines.push(objective.trim());
    lines.push('');
  }
  if (projectSummary) {
    lines.push(L.summary);
    lines.push('---------------');
    lines.push(projectSummary);
    lines.push('');
  }
  lines.push(L.details);
  lines.push('---------------');
  lines.push(`${L.when}: ${whenLabel}`);
  if (zoomUrl) {
    lines.push(`${L.join}: ${zoomUrl}`);
    if (passcode) lines.push(`${L.passcode}: ${passcode}`);
  }
  lines.push('');
  lines.push(L.agenda);
  lines.push('------');
  agendaItems.forEach((it, i) => lines.push(`  ${i + 1}. ${it}`));
  lines.push('');
  if (magicLink) {
    lines.push(`${L.access}: ${magicLink}`);
    lines.push(`(${L.access_hint})`);
    lines.push('');
  }
  lines.push(L.closing);
  lines.push('');
  lines.push(L.looking_forward);
  lines.push('');
  lines.push(L.best);
  lines.push(FROM_NAME);
  lines.push(SENDER_TITLE);
  lines.push(SIGNATURE_EMAIL);
  const text = lines.join('\n');

  // ---- HTML body (mirrors requestorNotification.sendApprovalAcknowledgment) ----
  const summaryHtml = projectSummary
    ? `<p style="margin:14px 0 6px;font-size:13px;color:#555">${esc(L.summary)}</p>
       <blockquote style="margin:0 0 16px;padding:10px 14px;border-left:3px solid #38bdf8;background:#f7fbff;color:#333;font-size:13px;white-space:pre-wrap">${esc(projectSummary)}</blockquote>`
    : '';

  const objectiveHtml = (objective && objective.trim())
    ? `<p style="margin:0 0 14px;font-size:14px;color:#222">${esc(objective.trim())}</p>`
    : '';

  const meetingBlockHtml = `
    <div style="margin:18px 0;padding:18px 20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px">
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#0369a1;font-weight:700;margin-bottom:8px">${esc(L.details)}</div>
      <div style="font-size:15px;color:#0f172a;font-weight:600;margin-bottom:4px">${esc(whenLabel)}</div>
      ${zoomUrl ? `<div style="margin-top:14px"><a href="${esc(zoomUrl)}" style="display:inline-block;background:#2D8CFF;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px">${esc(L.join)}</a></div>
          <div style="margin-top:8px;font-size:11px;color:#64748b;word-break:break-all">${esc(L.or_open)}: <a href="${esc(zoomUrl)}" style="color:#2D8CFF">${esc(zoomUrl)}</a></div>` : ''}
      ${passcode ? `<div style="margin-top:6px;font-size:12px;color:#64748b">${esc(L.passcode)}: <strong>${esc(passcode)}</strong></div>` : ''}
      <div style="margin-top:14px;font-size:12px;color:#475569">${esc(L.ics_note)}</div>
    </div>
  `;

  const agendaHtml = `
    <p style="margin:14px 0 6px;font-size:13px;color:#555">${esc(L.agenda)}</p>
    <ol style="margin:0 0 16px 22px;padding:0;font-size:14px;color:#222;line-height:1.6">
      ${agendaItems.map(it => `<li>${esc(it)}</li>`).join('')}
    </ol>
  `;

  const magicLinkHtml = magicLink
    ? `<p style="margin-top:18px">${esc(L.access)}:</p>
       <p style="margin:6px 0 6px"><a href="${esc(magicLink)}" style="color:#0a66c2;word-break:break-all">${esc(magicLink)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;color:#64748b">${esc(L.access_hint)}</p>`
    : '';

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:620px">
    <p>${isEs ? 'Hola' : 'Hi'},</p>
    <p>${esc(L.invite_to)} <strong>"${esc(projectName)}"</strong>.</p>
    ${objectiveHtml}
    ${summaryHtml}
    ${meetingBlockHtml}
    ${agendaHtml}
    ${magicLinkHtml}
    <p>${esc(L.closing)}</p>
    <p>${esc(L.looking_forward)}</p>
    <p style="margin-top:22px;margin-bottom:2px">${esc(L.best)}<br>
    <strong>${esc(FROM_NAME)}</strong><br>
    ${esc(SENDER_TITLE)}<br>
    <a href="mailto:${esc(SIGNATURE_EMAIL)}" style="color:#0a66c2">${esc(SIGNATURE_EMAIL)}</a></p>
  </div>`;

  // Build .ics for the calendar attachment
  let attachment = null;
  try {
    const ics = buildIcs({
      id: meeting.id || `event-${Date.now()}`,
      title: meeting.title || `${L.subject_lead} - ${projectName}`,
      start_time: start,
      end_time: end,
      description: meeting.description || objective || projectSummary || '',
      zoom_join_url: zoomUrl || null,
      zoom_password: passcode || null,
      location: meeting.location || zoomUrl || null
    }, recipients);
    attachment = {
      content: Buffer.from(ics, 'utf8').toString('base64'),
      filename: 'invite.ics',
      type: 'text/calendar',
      disposition: 'attachment'
    };
  } catch (icsErr) {
    console.error('[onDemandMeetingInvite] .ics build failed:', icsErr.message);
  }

  // Subject line. Date appended for skimming.
  const subjectDate = start.toLocaleDateString(isEs ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', timeZone: TZ });
  const subject = `${L.subject_lead} - ${projectName} - ${subjectDate}`;

  // Send one message per recipient (each gets a personal "To:") to mirror
  // how inviteService.sendInvites already works for calendar invites.
  const sent = [];
  const failed = [];
  for (const to of recipients) {
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
    try {
      await sgMail.send(msg);
      sent.push(to);
    } catch (err) {
      const detail = err.response?.body?.errors?.[0]?.message || err.message;
      console.error('[onDemandMeetingInvite] send failed:', to, detail);
      failed.push({ email: to, error: detail });
    }
  }
  return { sent, failed };
}

module.exports = { isConfigured, sendOnDemandMeetingInvite };
