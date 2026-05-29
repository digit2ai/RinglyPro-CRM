'use strict';

// Automated submitter-facing emails sent immediately after a reviewer
// approves or rejects an intake submission. Approval emails ask the
// requestor for 2-3 meeting time options and surface their magic link
// so they can keep editing the request inside the shared workspace.
// Rejection emails send a polite, professional close-out.

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (e) { /* SendGrid not installed — sends will fail loudly */ }

const { buildCcBcc } = require('./stakeholderRecipients');
const { skipIfDisabled } = require('./emailSendGuard');

// Envelope From — must be a SendGrid-verified sender. info@digit2ai.com
// is the verified shared mailbox; replies are routed back to the actual
// signer via Reply-To so the requestor's reply reaches Manuel directly.
const ENVELOPE_FROM = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'info@digit2ai.com';
const FROM_NAME      = process.env.REQUESTOR_FROM_NAME  || 'Manuel Stagg';
const SIGNATURE_EMAIL = process.env.REQUESTOR_REPLY_TO  || 'mstagg@digit2ai.com';
const SENDER_TITLE    = process.env.REQUESTOR_FROM_TITLE || 'Digit2AI';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function firstName(full) {
  if (!full) return '';
  return String(full).trim().split(/\s+/)[0] || '';
}

function buildMagicLink(baseUrl, token) {
  const root = (baseUrl || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
  return `${root}/projects/intake/batch.html?token=${token}`;
}

// One merged email sent after admin approves the project request.
// Contains: acknowledgment + auto-scheduled kickoff (date, time, Zoom link,
// .ics attachment) + magic link + reschedule note. Replaces the previous
// pair of emails (acknowledgment + separate calendar invite).
async function sendApprovalAcknowledgment({
  toEmail, toName, company, projectName, description, magicLink, ccEmails, meeting
}) {
  if (!sgMail || !process.env.SENDGRID_API_KEY) {
    console.log('[D2AI-Notify] SendGrid not configured — approval email skipped');
    return { sent: false, reason: 'sendgrid_not_configured' };
  }
  if (!toEmail) {
    console.log('[D2AI-Notify] No submitter email — approval email skipped');
    return { sent: false, reason: 'no_email' };
  }

  const fn = firstName(toName) || 'there';
  const co = company || '';
  const proj = projectName || 'your project';
  const desc = (description || '').trim();
  const descBlock = desc
    ? `\n\nHere is a summary of what you submitted:\n\n"${desc.length > 600 ? desc.slice(0, 600) + '...' : desc}"\n`
    : '';
  const descBlockHtml = desc
    ? `<p style="margin:14px 0 6px;font-size:13px;color:#555">Here is a summary of what you submitted:</p>
       <blockquote style="margin:0 0 16px;padding:10px 14px;border-left:3px solid #38bdf8;background:#f7fbff;color:#333;font-size:13px;white-space:pre-wrap">${esc(desc.length > 600 ? desc.slice(0, 600) + '...' : desc)}</blockquote>`
    : '';

  // Kickoff meeting block (text + html). If no meeting was scheduled, fall
  // back to the original "reply with 2-3 times" copy.
  let meetingTextBlock = '';
  let meetingHtmlBlock = '';
  let attachment = null;
  if (meeting && meeting.start_time) {
    const start = new Date(meeting.start_time);
    const end = meeting.end_time ? new Date(meeting.end_time) : new Date(start.getTime() + 30 * 60000);
    // Render the meeting time in US Eastern (handles EST/EDT automatically)
    // so requestors see the time in our business timezone, not the server's UTC.
    // The attached .ics still uses UTC internally — calendar apps convert to
    // the recipient's local timezone on open.
    const TZ = 'America/New_York';
    const dateOpts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ };
    const timeOpts = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: TZ };
    const datePart = start.toLocaleDateString('en-US', dateOpts);
    const startTime = start.toLocaleTimeString('en-US', timeOpts);
    const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: TZ });
    const whenLabel = `${datePart} · ${startTime} – ${endTime}`;
    const zoomUrl = meeting.zoom_join_url || '';
    const passcode = meeting.zoom_password || '';

    meetingTextBlock = [
      '',
      'KICKOFF MEETING (auto-scheduled)',
      `When: ${whenLabel}`,
      zoomUrl ? `Join Zoom: ${zoomUrl}` : '',
      passcode ? `Passcode: ${passcode}` : '',
      '',
      'A calendar invite (.ics) is attached.',
      'If this time does not work, open the workspace link below and click Reschedule on the meeting card to pick another slot (up to 2 reschedules).'
    ].filter(Boolean).join('\n');

    meetingHtmlBlock = `
      <div style="margin:18px 0;padding:18px 20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px">
        <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#0369a1;font-weight:700;margin-bottom:8px">Kickoff Meeting (auto-scheduled)</div>
        <div style="font-size:15px;color:#0f172a;font-weight:600;margin-bottom:4px">${esc(whenLabel)}</div>
        ${zoomUrl ? `<div style="margin-top:14px"><a href="${esc(zoomUrl)}" style="display:inline-block;background:#2D8CFF;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px">Join Zoom Meeting</a></div>
            <div style="margin-top:8px;font-size:11px;color:#64748b;word-break:break-all">Or open: <a href="${esc(zoomUrl)}" style="color:#2D8CFF">${esc(zoomUrl)}</a></div>` : ''}
        ${passcode ? `<div style="margin-top:6px;font-size:12px;color:#64748b">Passcode: <strong>${esc(passcode)}</strong></div>` : ''}
        <div style="margin-top:14px;font-size:12px;color:#475569">A calendar invite (.ics) is attached. If this time does not work, open the workspace link below and click <strong>Reschedule</strong> on the meeting card to pick another slot (up to 2 reschedules).</div>
      </div>
    `;

    // Build .ics attachment by reusing meetingInvite.buildIcs
    try {
      const { buildIcs } = require('./meetingInvite');
      const ics = buildIcs({
        id: meeting.id || `auto-${Date.now()}`,
        title: meeting.title || `Kickoff — ${proj}`,
        start_time: start,
        end_time: end,
        description: meeting.description || `Project kickoff for ${proj}.`,
        zoom_join_url: zoomUrl || null,
        zoom_password: passcode || null,
        location: meeting.location || zoomUrl || null
      }, [toEmail]);
      attachment = {
        content: Buffer.from(ics, 'utf8').toString('base64'),
        filename: 'invite.ics',
        type: 'text/calendar',
        disposition: 'attachment'
      };
    } catch (icsErr) {
      console.error('[D2AI-Notify] .ics build failed (continuing without attachment):', icsErr.message);
    }
  } else {
    // Fallback copy when no meeting was scheduled (e.g., kickoff failed)
    meetingTextBlock = "\nI'd like to schedule a brief 20-30 minute call. Please reply with two or three times that suit you and I will send a calendar invite.\n";
    meetingHtmlBlock = `<p>I'd like to schedule a brief <strong>20-30 minute call</strong>. Please reply with <strong>two or three times</strong> that suit you and I will send a calendar invite.</p>`;
  }

  const subject = `${proj} — approved, kickoff scheduled`;

  const text = `Hi ${fn},

We approved your project request${co ? ' on behalf of ' + co : ''}.${descBlock}${meetingTextBlock}

You can review the project and add notes any time in the shared workspace:
${magicLink}

Looking forward to speaking with you.

Best,
${FROM_NAME}
${SENDER_TITLE}
${SIGNATURE_EMAIL}`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:620px">
    <p>Hi ${esc(fn)},</p>
    <p>We approved your project request${co ? ' on behalf of <strong>' + esc(co) + '</strong>' : ''}.</p>
    ${descBlockHtml}
    ${meetingHtmlBlock}
    <p style="margin-top:18px">You can review the project and add notes any time in the shared workspace:</p>
    <p style="margin:6px 0 18px"><a href="${esc(magicLink)}" style="color:#0a66c2;word-break:break-all">${esc(magicLink)}</a></p>
    <p>Looking forward to speaking with you.</p>
    <p style="margin-top:22px;margin-bottom:2px">Best,<br>
    <strong>${esc(FROM_NAME)}</strong><br>
    ${esc(SENDER_TITLE)}<br>
    <a href="mailto:${esc(SIGNATURE_EMAIL)}" style="color:#0a66c2">${esc(SIGNATURE_EMAIL)}</a></p>
  </div>`;

  const msg = {
    to: toEmail,
    from: { email: ENVELOPE_FROM, name: FROM_NAME },
    subject,
    text,
    html,
    replyTo: SIGNATURE_EMAIL
  };
  if (attachment) msg.attachments = [attachment];
  const callerCc = (ccEmails || []).filter(e => e && e !== toEmail);
  const auto = buildCcBcc([toEmail, ...callerCc]);
  const cc = [...callerCc, ...(auto.cc || [])];
  if (cc.length) msg.cc = cc;
  if (auto.bcc && auto.bcc.length) msg.bcc = auto.bcc;

  if (skipIfDisabled(`requestor approval -> ${toEmail}`)) {
    return { sent: false, reason: 'autosend_disabled' };
  }
  try {
    await sgMail.send(msg);
    console.log(`[D2AI-Notify] Approval+kickoff email sent to ${toEmail}${attachment ? ' (with .ics)' : ''}`);
    return { sent: true };
  } catch (err) {
    console.error('[D2AI-Notify] Approval send failed:', err.response?.body || err.message);
    return { sent: false, reason: 'send_error', error: err.message };
  }
}

async function sendRejectionNotice({
  toEmail, toName, company, projectName, reason
}) {
  if (!sgMail || !process.env.SENDGRID_API_KEY) {
    console.log('[D2AI-Notify] SendGrid not configured — rejection email skipped');
    return { sent: false, reason: 'sendgrid_not_configured' };
  }
  if (!toEmail) {
    console.log('[D2AI-Notify] No submitter email — rejection email skipped');
    return { sent: false, reason: 'no_email' };
  }

  const fn = firstName(toName) || 'there';
  const co = company || '';
  const proj = projectName || 'your project';
  const reasonText = (reason || '').trim();

  const reasonBlock = reasonText
    ? `\n\nA quick note on our decision: ${reasonText}\n`
    : `\n\nAt this time the request does not align with our current capacity and roadmap. We did not see a clean fit between the scope you described and the projects we are positioned to take on this quarter.\n`;
  const reasonBlockHtml = reasonText
    ? `<p>A quick note on our decision:</p><blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #94a3b8;background:#f7f8fa;color:#333;font-size:13px;white-space:pre-wrap">${esc(reasonText)}</blockquote>`
    : `<p>At this time the request does not align with our current capacity and roadmap. We did not see a clean fit between the scope you described and the projects we are positioned to take on this quarter.</p>`;

  const subject = `Re: ${proj} — update on your request`;

  const text = `Hi ${fn},

Thank you for taking the time to submit your project request${co ? ' on behalf of ' + co : ''}. I appreciate the thought and detail you put into it.

After reviewing the brief carefully, I am not able to move this one forward.${reasonBlock}
This is not a reflection of the merit of the idea. If the scope or context changes, or if there is a future initiative where we may be a better fit, please do not hesitate to reach back out — I would welcome the conversation.

Wishing you the best with the work ahead.

Best,
${FROM_NAME}
${SENDER_TITLE}
${SIGNATURE_EMAIL}`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:620px">
    <p>Hi ${esc(fn)},</p>
    <p>Thank you for taking the time to submit your project request${co ? ' on behalf of <strong>' + esc(co) + '</strong>' : ''}. I appreciate the thought and detail you put into it.</p>
    <p>After reviewing the brief carefully, I am not able to move this one forward.</p>
    ${reasonBlockHtml}
    <p>This is not a reflection of the merit of the idea. If the scope or context changes, or if there is a future initiative where we may be a better fit, please do not hesitate to reach back out — I would welcome the conversation.</p>
    <p>Wishing you the best with the work ahead.</p>
    <p style="margin-top:22px;margin-bottom:2px">Best,<br>
    <strong>${esc(FROM_NAME)}</strong><br>
    ${esc(SENDER_TITLE)}<br>
    <a href="mailto:${esc(SIGNATURE_EMAIL)}" style="color:#0a66c2">${esc(SIGNATURE_EMAIL)}</a></p>
  </div>`;

  if (skipIfDisabled(`requestor rejection -> ${toEmail}`)) {
    return { sent: false, reason: 'autosend_disabled' };
  }
  try {
    await sgMail.send({
      to: toEmail,
      from: { email: ENVELOPE_FROM, name: FROM_NAME },
      subject,
      text,
      html,
      replyTo: SIGNATURE_EMAIL,
      ...buildCcBcc(toEmail)
    });
    console.log(`[D2AI-Notify] Rejection notice sent to ${toEmail}`);
    return { sent: true };
  } catch (err) {
    console.error('[D2AI-Notify] Rejection send failed:', err.response?.body || err.message);
    return { sent: false, reason: 'send_error', error: err.message };
  }
}

module.exports = {
  sendApprovalAcknowledgment,
  sendRejectionNotice,
  buildMagicLink
};
