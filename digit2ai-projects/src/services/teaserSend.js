'use strict';

// =============================================================
// teaserSend — deliver a generated voice teaser to a client over
// email, SMS, or WhatsApp.
//
// These are USER-CLICKED sends from the dashboard (the owner picks a
// channel and hits send), so they intentionally BYPASS the
// EMAIL_AUTOSEND_DISABLED gate that guards server-initiated mail.
//
// Every channel also returns a ready-to-click fallback link (mailto:,
// sms:, https://wa.me/...) so the owner can send from their own device
// when server creds aren't configured — matching the project-wide
// Apple-Mail / magic-link pattern.
// =============================================================

let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} catch (_) { /* optional */ }

let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (_) { /* optional */ }

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'info@digit2ai.com';
const FROM_NAME = 'Manuel Stagg / Digit2AI';
const REPLY_TO = 'mstagg@digit2ai.com';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizePhone(p) {
  let s = String(p || '').trim().replace(/[^\d+]/g, '');
  if (!s) return '';
  if (!s.startsWith('+')) {
    // Default to US (+1) when no country code is present (10 digits).
    if (s.length === 10) s = '+1' + s;
    else s = '+' + s;
  }
  return s;
}

function smsBody(teaser, url, lang) {
  const t = teaser.title || 'your AI product';
  return lang === 'es'
    ? `Digit2AI te preparó un adelanto interactivo de "${t}" — míralo y escucha a Lina explicarlo: ${url}`
    : `Digit2AI built you an interactive teaser of "${t}" — see it and hear Lina walk you through it: ${url}`;
}

function emailHtml(teaser, url, lang) {
  const es = lang === 'es';
  const t = esc(teaser.title || 'Your AI product');
  const tagline = esc(teaser.tagline || '');
  const hi = teaser.client_name ? `${es ? 'Hola' : 'Hi'} ${esc(teaser.client_name)},` : (es ? 'Hola,' : 'Hi,');
  const intro = es
    ? `Preparamos un adelanto interactivo de tu proyecto. Es una simulación de cómo se vería y funcionaría tu producto de IA — y puedes escuchar a <b>Lina</b>, nuestra voz de inteligencia artificial, explicártelo todo en menos de dos minutos.`
    : `We put together an interactive teaser of your project. It's a simulation of how your AI product would look and work — and you can hear <b>Lina</b>, our AI voice, walk you through all of it in under two minutes.`;
  const btn = es ? 'Ver y escuchar el adelanto' : 'See & hear the teaser';
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:0;background:#0b1020;border-radius:16px;overflow:hidden">
    <div style="padding:28px 28px 8px;background:linear-gradient(135deg,#0b1020,#131a33)">
      <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#7c5cff;font-weight:700">Digit2AI</div>
      <h1 style="margin:10px 0 4px;color:#fff;font-size:24px">${t}</h1>
      <div style="color:#9bb0d6;font-size:14px">${tagline}</div>
    </div>
    <div style="padding:20px 28px 8px;color:#c9d6f0;font-size:14px;line-height:1.6">
      <p>${hi}</p>
      <p>${intro}</p>
    </div>
    <div style="padding:14px 28px 30px;text-align:center">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#22d3ee,#7c5cff);color:#06122b;font-weight:700;text-decoration:none;padding:14px 30px;border-radius:10px;font-size:15px">${btn} &rarr;</a>
      <div style="margin-top:14px;color:#6f82ab;font-size:12px;word-break:break-all">${esc(url)}</div>
    </div>
    <div style="padding:14px 28px;border-top:1px solid rgba(255,255,255,.08);color:#5f7197;font-size:12px">Digit2AI &middot; ${esc(REPLY_TO)}</div>
  </div>`;
}

// channel: 'email' | 'sms' | 'whatsapp'
async function send({ channel, to, teaser, url, lang }) {
  lang = lang || teaser.lang || 'en';
  const result = { channel, to, sent: false };

  if (channel === 'email') {
    const subject = (lang === 'es' ? 'Tu adelanto interactivo: ' : 'Your interactive teaser: ') + (teaser.title || 'Digit2AI');
    result.mailto = `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent((lang === 'es' ? 'Mira y escucha el adelanto aquí: ' : 'See and hear the teaser here: ') + url)}`;
    if (sgMail && process.env.SENDGRID_API_KEY && to) {
      try {
        const r = await sgMail.send({
          to,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          replyTo: REPLY_TO,
          subject,
          html: emailHtml(teaser, url, lang),
          text: smsBody(teaser, url, lang)
        });
        result.sent = true;
        result.status = r && r[0] && r[0].statusCode;
      } catch (e) {
        console.error('[teaserSend] email failed:', e.message);
        result.error = e.message;
        result.reason = 'sendgrid_error';
      }
    } else {
      result.reason = sgMail ? 'sendgrid_not_configured' : 'sendgrid_unavailable';
    }
    return result;
  }

  if (channel === 'sms') {
    const phone = normalizePhone(to);
    const body = smsBody(teaser, url, lang);
    result.sms_link = `sms:${phone}?&body=${encodeURIComponent(body)}`;
    if (twilioClient && process.env.TWILIO_PHONE_NUMBER && phone) {
      try {
        const m = await twilioClient.messages.create({ from: process.env.TWILIO_PHONE_NUMBER, to: phone, body });
        result.sent = true;
        result.sid = m.sid;
      } catch (e) {
        console.error('[teaserSend] sms failed:', e.message);
        result.error = e.message;
        result.reason = 'twilio_error';
      }
    } else {
      result.reason = twilioClient ? 'twilio_sms_not_configured' : 'twilio_unavailable';
    }
    return result;
  }

  if (channel === 'whatsapp') {
    const phone = normalizePhone(to);
    const body = smsBody(teaser, url, lang);
    result.wa_link = `https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(body)}`;
    const waFrom = process.env.TWILIO_WHATSAPP_NUMBER;
    if (twilioClient && waFrom && phone) {
      try {
        const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
        const m = await twilioClient.messages.create({ from, to: `whatsapp:${phone}`, body });
        result.sent = true;
        result.sid = m.sid;
      } catch (e) {
        console.error('[teaserSend] whatsapp failed:', e.message);
        result.error = e.message;
        result.reason = 'twilio_error';
      }
    } else {
      result.reason = twilioClient ? 'twilio_whatsapp_not_configured' : 'twilio_unavailable';
    }
    return result;
  }

  result.reason = 'unknown_channel';
  return result;
}

module.exports = { send, normalizePhone };
