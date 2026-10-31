'use strict';

/**
 * The ONLY file in RinglyPro Supply that sends email, and it sends exactly
 * one thing: the password-reset code. SendGrid via SENDGRID_API_KEY.
 * No key = nothing is sent and the caller is told so (never a fake "sent").
 * Tests replace the transport with setTransport().
 */

let transport = null;
function setTransport(fn) { transport = fn; }

function from() {
  return {
    email: process.env.SUPPLY_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'info@digit2ai.com',
    name: process.env.SUPPLY_FROM_NAME || 'RinglyPro Supply'
  };
}

async function send(msg) {
  if (transport) return transport(msg);
  if (!process.env.SENDGRID_API_KEY) return { sent: false, reason: 'SENDGRID_API_KEY not set' };
  const sg = require('@sendgrid/mail');
  sg.setApiKey(process.env.SENDGRID_API_KEY);
  await sg.send(msg);
  return { sent: true };
}

function resetCode({ to, code, minutes }) {
  const text = `Your RinglyPro Supply password reset code is ${code}.\n\n` +
    `It expires in ${minutes} minutes and works once.\n\n` +
    `If you did not ask to reset your password, ignore this email. Your password has not changed.`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;color:#0f2033">
<h2 style="margin:0 0 12px">Reset your password</h2>
<p>Your RinglyPro Supply password reset code is:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0;color:#0a7f73">${code}</p>
<p>It expires in ${minutes} minutes and works once.</p>
<p style="color:#5f7180;font-size:13px">If you did not ask to reset your password, ignore this email. Your password has not changed.</p>
</div>`;
  return send({ to, from: from(), subject: 'Your RinglyPro Supply reset code: ' + code, text, html });
}

module.exports = { resetCode, setTransport };
