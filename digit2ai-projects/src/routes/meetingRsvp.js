'use strict';

// Public click-through endpoint for the Yes / No / Maybe buttons inside
// the on-demand meeting invite emails. The URL embeds a per-recipient
// token (UUID, unique on d2_meeting_rsvps.token) — no auth required, the
// token itself is the credential.

const express = require('express');
const router = express.Router();
const { MeetingRsvp, CalendarEvent, Project } = require('../models');

const VALID = new Set(['yes', 'no', 'maybe']);

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderConfirmPage({ response, meetingTitle, meetingWhen, projectName, rescheduleUrl, viewProjectUrl }) {
  const color = response === 'yes' ? '#10b981' : response === 'maybe' ? '#f59e0b' : '#ef4444';
  const label = response === 'yes' ? 'Confirmed — see you there.'
              : response === 'maybe' ? 'Tentative — we will count you as a maybe.'
              : 'Declined — we will let the team know.';
  // No / Maybe get a CTA to open the share page on the reschedule flow.
  // Yes gets a softer "View project" link in case they want to add notes.
  const ctaBtn = (response === 'no' || response === 'maybe') && rescheduleUrl
    ? `<a href="${esc(rescheduleUrl)}" style="display:inline-block;margin-top:18px;background:#2D8CFF;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px">Propose a new time</a>
       <div style="margin-top:8px;font-size:11px;color:#64748b">Opens the project workspace where the requestor can pick a different slot.</div>`
    : (viewProjectUrl
        ? `<a href="${esc(viewProjectUrl)}" style="display:inline-block;margin-top:18px;color:#38bdf8;font-size:13px;text-decoration:none">View project workspace &rarr;</a>`
        : '');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>RSVP recorded</title>
<style>
  body { margin:0; background:#0f172a; color:#e2e8f0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; }
  .wrap { max-width:520px; margin:8vh auto 0; padding:0 20px; }
  .card { background:#1e293b; border:1px solid #334155; border-radius:14px; padding:28px 28px 22px; }
  .badge { display:inline-block; padding:6px 14px; border-radius:999px; background:${color}; color:#fff; font-weight:600; font-size:12px; letter-spacing:0.06em; text-transform:uppercase; }
  h1 { font-size:20px; margin:16px 0 6px; color:#fff; }
  .meta { font-size:13px; color:#94a3b8; margin-top:18px; line-height:1.55; }
  .meta strong { color:#fff; font-weight:600; }
  .foot { margin-top:22px; font-size:11px; color:#64748b; }
  a { color:#38bdf8; }
</style></head>
<body><div class="wrap"><div class="card">
  <span class="badge">${esc(response.toUpperCase())}</span>
  <h1>${esc(label)}</h1>
  <div class="meta">
    <div><strong>Meeting:</strong> ${esc(meetingTitle || 'Project meeting')}</div>
    ${meetingWhen ? `<div><strong>When:</strong> ${esc(meetingWhen)}</div>` : ''}
    ${projectName ? `<div><strong>Project:</strong> ${esc(projectName)}</div>` : ''}
  </div>
  ${ctaBtn}
  <div class="foot">You can change your answer any time by clicking another button in the original email.</div>
</div></div></body></html>`;
}

// GET /api/v1/meeting-rsvp/:token/:response
router.get('/:token/:response', async (req, res) => {
  try {
    const { token, response } = req.params;
    const resp = String(response || '').toLowerCase();
    if (!VALID.has(resp)) return res.status(400).send('Invalid response. Expected yes, no, or maybe.');

    const row = await MeetingRsvp.findOne({ where: { token } });
    if (!row) return res.status(404).send('Invitation link not found or expired.');

    row.response = resp;
    row.responded_at = new Date();
    row.ip = clientIp(req);
    row.user_agent = String(req.headers['user-agent'] || '').slice(0, 500);
    await row.save();

    // Pull event + project labels for the confirmation page
    let meetingTitle = null, meetingWhen = null, projectName = null;
    let rescheduleUrl = null, viewProjectUrl = null;
    try {
      const ev = await CalendarEvent.findByPk(row.event_id, { attributes: ['title', 'start_time', 'end_time'] });
      if (ev) {
        meetingTitle = ev.title;
        if (ev.start_time) {
          meetingWhen = new Date(ev.start_time).toLocaleString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
            timeZone: 'America/New_York'
          });
        }
      }
      if (row.project_id) {
        const proj = await Project.findByPk(row.project_id, { attributes: ['name', 'stakeholder_share_token'] });
        if (proj) {
          projectName = proj.name;
          if (proj.stakeholder_share_token) {
            const base = `${req.protocol}://${req.get('host')}`;
            // email pre-fills the share-page gate; meeting param scrolls
            // to (and auto-opens reschedule on) the matching meeting card.
            const qs = `?email=${encodeURIComponent(row.email)}&meeting=${row.event_id}`;
            const baseShare = `${base}/projects/share/${proj.stakeholder_share_token}`;
            rescheduleUrl = `${baseShare}${qs}&action=reschedule`;
            viewProjectUrl = `${baseShare}${qs}`;
          }
        }
      }
    } catch (_) {}

    res.type('html').send(renderConfirmPage({ response: resp, meetingTitle, meetingWhen, projectName, rescheduleUrl, viewProjectUrl }));
  } catch (err) {
    console.error('[meetingRsvp] error:', err);
    res.status(500).send('Server error recording your response.');
  }
});

module.exports = router;
