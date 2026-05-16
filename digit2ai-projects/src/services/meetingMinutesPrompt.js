'use strict';

// Post-meeting minutes prompt. About an hour after a project meeting
// wraps up, email Manuel a one-click reminder to add the meeting
// minutes while the discussion is still fresh. One prompt per event,
// idempotent via minutes_prompt_sent_at on d2_calendar_events.

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (e) { /* SendGrid optional */ }

const { Op } = require('sequelize');
const { CalendarEvent, Project, MeetingRsvp } = require('../models');

const ENVELOPE_FROM = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'info@digit2ai.com';
const FROM_NAME = process.env.REQUESTOR_FROM_NAME || 'Manuel Stagg';
const TO_EMAIL = process.env.REQUESTOR_REPLY_TO || 'mstagg@digit2ai.com';
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function isConfigured() { return !!(sgMail && process.env.SENDGRID_API_KEY); }

async function buildPrompt(project, event) {
  const TZ = 'America/New_York';
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : new Date(start.getTime() + 30 * 60000);
  const dateOpts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ };
  const timeOpts = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: TZ };
  const whenLabel = `${start.toLocaleDateString('en-US', dateOpts)} · ${start.toLocaleTimeString('en-US', timeOpts)} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: TZ })}`;

  // Use the RSVP table to enumerate who attended (responded yes) vs. who
  // declined / never responded. Falls back to event.invited_emails.
  let attendedLines = [];
  let declinedCount = 0;
  let pendingCount = 0;
  try {
    const rsvps = await MeetingRsvp.findAll({ where: { event_id: event.id } });
    if (rsvps.length) {
      for (const r of rsvps) {
        if (r.response === 'yes') attendedLines.push(r.email);
        else if (r.response === 'no') declinedCount++;
        else pendingCount++;
      }
    } else {
      attendedLines = (event.invited_emails || []).slice(0, 12);
    }
  } catch (_) { /* attendance section becomes empty */ }

  const projectUrl = `${PUBLIC_BASE}/projects`; // dashboard root — lands on My Projects, click into the project
  const meetingTitle = event.title || `Meeting - ${project.name}`;
  const subject = `Add minutes: ${project.name} — ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })}`;

  const attendanceHtml = attendedLines.length
    ? `<div style="font-size:12px;color:#475569;margin-top:6px"><strong>Attended (${attendedLines.length}):</strong> ${attendedLines.map(esc).join(', ')}</div>`
    : '';
  const attendanceMeta = (declinedCount || pendingCount)
    ? `<div style="font-size:11px;color:#94a3b8;margin-top:4px">${declinedCount ? declinedCount + ' declined · ' : ''}${pendingCount ? pendingCount + ' no response' : ''}</div>`
    : '';

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:620px">
    <p>Hi Manuel,</p>
    <p>The meeting <strong>"${esc(meetingTitle)}"</strong> for project <strong>${esc(project.name)}</strong> just wrapped. Add the minutes while the discussion is still fresh.</p>
    <div style="margin:14px 0;padding:14px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px">
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#0369a1;font-weight:700;margin-bottom:8px">Meeting recap</div>
      <div style="font-size:13px;color:#0f172a;margin-bottom:2px"><strong>When:</strong> ${esc(whenLabel)}</div>
      <div style="font-size:13px;color:#0f172a"><strong>Project:</strong> ${esc(project.name)}</div>
      ${attendanceHtml}
      ${attendanceMeta}
    </div>
    <p style="margin:18px 0 6px">
      <a href="${esc(projectUrl)}" style="display:inline-block;background:#2D8CFF;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px">Add Meeting Minutes</a>
    </p>
    <p style="font-size:12px;color:#64748b;margin-top:10px">Opens the Projects Hub. From the project page, scroll to the meeting and add notes, decisions, and follow-ups.</p>
    <p style="font-size:11px;color:#94a3b8;margin-top:22px">Sent automatically about an hour after a project meeting ends. One reminder per meeting.</p>
  </div>`;

  const text = [
    'Hi Manuel,',
    '',
    `The meeting "${meetingTitle}" for project ${project.name} just wrapped. Add the minutes while the discussion is still fresh.`,
    '',
    'MEETING RECAP',
    '-------------',
    `When: ${whenLabel}`,
    `Project: ${project.name}`,
    attendedLines.length ? `Attended (${attendedLines.length}): ${attendedLines.join(', ')}` : '',
    (declinedCount || pendingCount) ? `${declinedCount ? declinedCount + ' declined' : ''}${declinedCount && pendingCount ? ' · ' : ''}${pendingCount ? pendingCount + ' no response' : ''}` : '',
    '',
    `Add minutes: ${projectUrl}`
  ].filter(Boolean).join('\n');

  return { subject, text, html };
}

async function tick() {
  if (!isConfigured()) return;
  const now = new Date();
  // Look for meetings that ended in the last 6 hours (catches anything we
  // missed across one or two failed poll cycles). Lower bound prevents the
  // poller from emailing about ancient meetings the first time this runs
  // after the column is added.
  const lower = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  let due = [];
  try {
    due = await CalendarEvent.findAll({
      where: {
        event_type: 'meeting',
        project_id: { [Op.ne]: null },
        end_time: { [Op.lt]: now, [Op.gt]: lower },
        minutes_prompt_sent_at: { [Op.is]: null }
      },
      order: [['end_time', 'ASC']],
      limit: 50
    });
  } catch (e) {
    console.error('[meetingMinutesPrompt] poll query failed:', e.message);
    return;
  }
  if (!due.length) return;

  for (const event of due) {
    try {
      const project = await Project.findByPk(event.project_id);
      if (!project) {
        event.minutes_prompt_sent_at = new Date();
        await event.save();
        continue;
      }
      const { subject, text, html } = await buildPrompt(project, event);
      try {
        await sgMail.send({
          to: TO_EMAIL,
          from: { email: ENVELOPE_FROM, name: FROM_NAME },
          subject,
          text,
          html
        });
        console.log(`[meetingMinutesPrompt] sent for event #${event.id} (${event.title})`);
      } catch (sendErr) {
        const detail = sendErr.response?.body?.errors?.[0]?.message || sendErr.message;
        console.error('[meetingMinutesPrompt] send failed:', detail);
      }
      // Mark sent even on send failure — better than spamming on every retry
      event.minutes_prompt_sent_at = new Date();
      await event.save();
    } catch (e) {
      console.error('[meetingMinutesPrompt] event handler failed for #' + event.id + ':', e.message);
    }
  }
}

let handle = null;
const POLL_MS = 60 * 60 * 1000; // hourly — meeting ends within the previous hour will be caught

function startPoller() {
  if (handle) return;
  setTimeout(() => { tick().catch(() => {}); }, 90 * 1000);
  handle = setInterval(() => { tick().catch(() => {}); }, POLL_MS);
  console.log('[meetingMinutesPrompt] poller started (tick every', POLL_MS / 60000, 'min)');
}

module.exports = { isConfigured, tick, startPoller, buildPrompt };
