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

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'mstagg@digit2ai.com';
const FROM_NAME  = process.env.REQUESTOR_FROM_NAME || 'Manuel Stagg';
const SENDER_TITLE = process.env.REQUESTOR_FROM_TITLE || 'Digit2AI';

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

async function sendApprovalAcknowledgment({
  toEmail, toName, company, projectName, description, magicLink, ccEmails
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
    ? `\n\nHere is a summary of what you submitted so we are aligned:\n\n"${desc.length > 600 ? desc.slice(0, 600) + '...' : desc}"\n`
    : '';
  const descBlockHtml = desc
    ? `<p style="margin:14px 0 6px;font-size:13px;color:#555">Here is a summary of what you submitted so we are aligned:</p>
       <blockquote style="margin:0 0 16px;padding:10px 14px;border-left:3px solid #38bdf8;background:#f7fbff;color:#333;font-size:13px;white-space:pre-wrap">${esc(desc.length > 600 ? desc.slice(0, 600) + '...' : desc)}</blockquote>`
    : '';

  const subject = `Re: ${proj} — request received, let us schedule a quick call`;

  const text = `Hi ${fn},

Thank you for submitting your project request${co ? ' on behalf of ' + co : ''}. I'd like to schedule a brief 20-30 minute call so I can ask a few clarifying questions before we lock the scope and timeline.

Please reply with two or three times that suit you and I will send a calendar invite.${descBlock}

In the meantime you can review and add notes to the request directly in our shared workspace:
${magicLink}

Looking forward to speaking with you.

Best,
${FROM_NAME}
${SENDER_TITLE}
${FROM_EMAIL}`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#222;max-width:620px">
    <p>Hi ${esc(fn)},</p>
    <p>Thank you for submitting your project request${co ? ' on behalf of <strong>' + esc(co) + '</strong>' : ''}. I'd like to schedule a brief <strong>20-30 minute call</strong> so I can ask a few clarifying questions before we lock the scope and timeline.</p>
    <p>Please reply with <strong>two or three times</strong> that suit you and I will send a calendar invite.</p>
    ${descBlockHtml}
    <p style="margin-top:18px">In the meantime you can review and add notes to the request directly in our shared workspace:</p>
    <p style="margin:6px 0 18px"><a href="${esc(magicLink)}" style="color:#0a66c2;word-break:break-all">${esc(magicLink)}</a></p>
    <p>Looking forward to speaking with you.</p>
    <p style="margin-top:22px;margin-bottom:2px">Best,<br>
    <strong>${esc(FROM_NAME)}</strong><br>
    ${esc(SENDER_TITLE)}<br>
    <a href="mailto:${esc(FROM_EMAIL)}" style="color:#0a66c2">${esc(FROM_EMAIL)}</a></p>
  </div>`;

  const msg = {
    to: toEmail,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    text,
    html,
    replyTo: FROM_EMAIL
  };
  const cc = (ccEmails || []).filter(e => e && e !== toEmail);
  if (cc.length) msg.cc = cc;

  try {
    await sgMail.send(msg);
    console.log(`[D2AI-Notify] Approval acknowledgment sent to ${toEmail}`);
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
${FROM_EMAIL}`;

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
    <a href="mailto:${esc(FROM_EMAIL)}" style="color:#0a66c2">${esc(FROM_EMAIL)}</a></p>
  </div>`;

  try {
    await sgMail.send({
      to: toEmail,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      text,
      html,
      replyTo: FROM_EMAIL
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
