'use strict';

// =============================================================
// Outbound email.
//
// Reuses the CRM's SendGrid credentials (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL)
// rather than introducing another provider.
//
// EVERY SEND HERE IS USER-CLICKED. The project-wide EMAIL_AUTOSEND_DISABLED
// rule kills server-initiated mail because it was landing in spam; it
// deliberately does not gate a send the person asked for by pressing a button.
// Nothing in JobUp sends on a schedule or on a webhook.
//
// With no key configured this returns { ok:false, configured:false } and an
// honest message — never a silent drop, and never a claim that mail went out.
// =============================================================

/**
 * The sender address. This repo names it TWO ways — SENDGRID_FROM_EMAIL in 14
 * places and FROM_EMAIL in src/services/emailService.js — so accept either
 * rather than reporting 'not configured' next to a working SendGrid account.
 * JOBUP_FROM_EMAIL overrides both when JobUp should send under its own name.
 */
function fromAddress() {
  return process.env.JOBUP_FROM_EMAIL ||
         process.env.SENDGRID_FROM_EMAIL ||
         process.env.FROM_EMAIL || null;
}

function fromSource() {
  if (process.env.JOBUP_FROM_EMAIL) return 'JOBUP_FROM_EMAIL';
  if (process.env.SENDGRID_FROM_EMAIL) return 'SENDGRID_FROM_EMAIL';
  if (process.env.FROM_EMAIL) return 'FROM_EMAIL';
  return null;
}

// The From DISPLAY NAME. So the inbox shows "JobUp" (or "JobMD"), not the raw
// address, even while the address itself falls back to the shared verified
// sender. Override per brand with JOBUP_FROM_NAME / JOBMD_FROM_NAME.
//
// THE BRAND COMES FROM THE SUBSCRIBER, NOT FROM A REQUEST. A weekly digest is
// sent by the scheduler with nothing to resolve a host from, so a caller that
// knows the recipient passes their brand; anything that does not gets JobUp,
// which is what every account created before the registry is.
function fromName(brand) {
  return require('../brand').fromName(brand);
}
// SendGrid accepts { email, name }. Returns that object when an address exists.
function fromField(brand) {
  const email = fromAddress();
  return email ? { email, name: fromName(brand) } : null;
}

function configured() {
  return Boolean(process.env.SENDGRID_API_KEY && fromAddress());
}

/** Says WHICH half is missing — 'not configured' alone is not diagnosable. */
function status() {
  const key = Boolean(process.env.SENDGRID_API_KEY);
  const from = fromAddress();
  const missing = [];
  if (!key) missing.push('SENDGRID_API_KEY');
  if (!from) missing.push('a sender address (JOBUP_FROM_EMAIL, SENDGRID_FROM_EMAIL or FROM_EMAIL)');
  return {
    configured: configured(),
    api_key: key ? 'set' : 'missing',
    from,
    from_var: fromSource(),
    missing,
    note: configured()
      ? 'User-clicked sends only. Nothing is sent automatically.'
      : `Missing: ${missing.join(' and ')}.`,
  };
}

/**
 * Send one message. Returns { ok, configured, error? }.
 * `to` is always the subscriber's own address for the email-to-self flow —
 * this is never used to mail a third party without the subscriber sending it
 * themselves from their own client.
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function send({ to, subject, text, html, replyTo, bcc, brand }) {
  if (!configured()) {
    return { ok: false, configured: false,
             error: 'Email is not configured on this deployment.' };
  }
  if (!to || !EMAIL_RE.test(String(to))) {
    return { ok: false, configured: true, error: 'A valid destination address is required.' };
  }
  try {
    const sg = require('@sendgrid/mail');
    sg.setApiKey(process.env.SENDGRID_API_KEY);
    const msg = {
      to,
      from: fromField(brand),
      subject: String(subject || require('../brand').byId(brand && brand.id).name).slice(0, 200),
      text: String(text || ''),
    };
    if (html) msg.html = html;
    // So hitting reply in their own client goes to the recruiter, not to us.
    if (replyTo && EMAIL_RE.test(replyTo)) msg.replyTo = replyTo;
    // Optional blind copy — valid addresses only, never the primary recipient
    // (SendGrid rejects a duplicate address across to/bcc).
    const bccList = (Array.isArray(bcc) ? bcc : [bcc])
      .filter((a) => a && EMAIL_RE.test(String(a)) && String(a).toLowerCase() !== String(to).toLowerCase());
    if (bccList.length) msg.bcc = bccList;
    await sg.send(msg);
    return { ok: true, configured: true };
  } catch (e) {
    const detail = (e && e.response && e.response.body &&
      JSON.stringify(e.response.body).slice(0, 300)) || e.message;
    console.warn('[jobup mailer] send failed:', detail);
    return { ok: false, configured: true, error: 'Could not send that email.' };
  }
}

/**
 * Send a job-match digest. Two paths, one contract:
 *   - templateId set  -> SendGrid DYNAMIC TEMPLATE (template_id + dynamicData)
 *   - templateId null -> the in-app fallback html/text (identical layout)
 * Adds the ASM unsubscribe group and List-Unsubscribe headers when provided,
 * and returns the SendGrid message id so email_sends stays auditable.
 * NOTIFY_DRY_RUN=true short-circuits: it never calls SendGrid.
 */
async function sendDigest({ to, subject, html, text, templateId, dynamicData, asmGroupId, headers, categories, brand }) {
  if (process.env.NOTIFY_DRY_RUN === 'true') {
    return { ok: true, dry_run: true, messageId: `dry-${Date.now()}` };
  }
  if (!configured()) return { ok: false, configured: false, error: 'Email is not configured.' };
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to))) {
    return { ok: false, configured: true, error: 'A valid destination address is required.' };
  }
  try {
    const sg = require('@sendgrid/mail');
    sg.setApiKey(process.env.SENDGRID_API_KEY);
    const msg = { to, from: fromField(brand) };
    if (templateId) {
      msg.templateId = templateId;
      msg.dynamicTemplateData = dynamicData || {};
    } else {
      msg.subject = String(subject || require('../brand').byId(brand && brand.id).name).slice(0, 200);
      if (text) msg.text = String(text);
      if (html) msg.html = String(html);
    }
    if (asmGroupId) msg.asm = { groupId: parseInt(asmGroupId, 10) };
    if (headers && Object.keys(headers).length) msg.headers = headers;
    if (categories && categories.length) msg.categories = categories;
    const [resp] = await sg.send(msg);
    const messageId = (resp && resp.headers && resp.headers['x-message-id']) || null;
    return { ok: true, configured: true, messageId, statusCode: resp && resp.statusCode };
  } catch (e) {
    const body = e && e.response && e.response.body;
    const detail = (body && JSON.stringify(body).slice(0, 400)) || e.message;
    const code = (e && e.code) || (e && e.response && e.response.statusCode) || null;
    console.warn('[jobup mailer] digest send failed:', detail);
    return { ok: false, configured: true, error: detail, statusCode: code };
  }
}

/** Plain-text + HTML rendering of one inbound opportunity. */
function renderOpportunity(opp, profileName) {
  const when = opp.created_at ? new Date(opp.created_at).toISOString().slice(0, 16).replace('T', ' ') : '';
  const rows = [
    ['From', [opp.from_name, opp.from_email].filter(Boolean).join(' · ')],
    ['Company', opp.company],
    ['Role', opp.role],
    ['Received', when],
  ].filter(([, v]) => v);

  const text = [
    `Message sent to you through your JobUp profile.`, '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    '---', opp.note || '', '---', '',
    opp.reply_draft ? `Your draft reply:\n\n${opp.reply_draft}\n` : '',
    `Reply to this email to answer ${opp.from_name || 'them'} directly.`,
  ].filter((l) => l !== '').join('\n');

  const esc = (v) => String(v == null ? '' : v)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const html = `<div style="font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1d24;max-width:600px">
    <p style="color:#6b7385;font-size:13px;margin:0 0 18px">Message sent to ${esc(profileName || 'you')} through JobUp.</p>
    <table style="border-collapse:collapse;width:100%;margin-bottom:18px">
      ${rows.map(([k, v]) => `<tr>
        <td style="padding:6px 12px 6px 0;color:#6b7385;font-size:13px;white-space:nowrap">${esc(k)}</td>
        <td style="padding:6px 0;font-size:14px">${esc(v)}</td></tr>`).join('')}
    </table>
    <div style="background:#f5f7fa;border-left:3px solid #22d3ee;border-radius:6px;padding:14px 16px;white-space:pre-wrap">${esc(opp.note || '')}</div>
    ${opp.reply_draft ? `<p style="color:#6b7385;font-size:13px;margin:22px 0 6px">Your draft reply</p>
      <div style="background:#fbfbfd;border:1px solid #e6e9ef;border-radius:6px;padding:14px 16px;white-space:pre-wrap">${esc(opp.reply_draft)}</div>` : ''}
    <p style="color:#6b7385;font-size:13px;margin-top:22px">
      Reply to this email to answer ${esc(opp.from_name || 'them')} directly.</p>
  </div>`;

  return { text, html };
}

// Who gets blind-copied on every welcome email. The owner wants a copy of each
// new subscriber's welcome; keep it in ONE place so no signup path can miss it.
// Override or disable via JOBUP_WELCOME_BCC ('' or 'none' turns it off).
function welcomeBcc() {
  const v = process.env.JOBUP_WELCOME_BCC;
  if (v === undefined) return 'mstagg@digit2ai.com';
  return (v === '' || v.toLowerCase() === 'none') ? null : v;
}

/**
 * Send a welcome email. Identical to send(), but ALWAYS blind-copies the
 * configured welcome BCC (the owner). Every real signup path routes through
 * here, so the BCC is guaranteed rather than remembered at each call site.
 */
async function sendWelcome({ to, subject, text, html, replyTo, brand }) {
  return send({ to, subject, text, html, replyTo, bcc: welcomeBcc() });
}

module.exports = { send, sendWelcome, sendDigest, fromName, configured, status, renderOpportunity, fromAddress, fromSource, welcomeBcc };
