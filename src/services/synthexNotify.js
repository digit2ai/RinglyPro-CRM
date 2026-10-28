'use strict';
/**
 * Synthex SAI meeting confirmations (SendGrid). Sent once, after a meeting is
 * committed to the Projects calendar, from the demo form on synthexsai.com or
 * from Lina. Never blocks or fails the booking: every outcome is logged.
 *
 *   To the client: a confirmation in Synthex SAI's look (Obsidian #0B0F17, cyan
 *   #00F2FE to indigo #6366F1, Geist/Inter) with a calendar invite (.ics).
 *   To the owner:  a short alert (SYNTHEX_NOTIFY_EMAIL || D2AI_LEAD_NOTIFY_EMAIL || info@digit2ai.com).
 *
 * From: "Synthex SAI" <SYNTHEX_FROM_EMAIL || no-reply@digit2ai.com>.
 * The address must be a verified SendGrid sender. SYNTHEX_EMAIL=off stops all sends.
 */

// A dedicated address, NOT the shared SENDGRID_FROM_EMAIL: that one is the owner's own mailbox, and a mail app
// shows a saved contact's name ("Digit2Ai") instead of the From name. digit2ai.com is authenticated in SendGrid.
const FROM = () => process.env.SYNTHEX_FROM_EMAIL || 'no-reply@digit2ai.com';
const OWNER = () => process.env.SYNTHEX_NOTIFY_EMAIL || process.env.D2AI_LEAD_NOTIFY_EMAIL || 'info@digit2ai.com';
const SITE = 'https://synthexsai.com';

let sender = null; // injectable for tests
function mailer() {
  if (sender) return sender;
  const sg = require('@sendgrid/mail');
  sg.setApiKey(process.env.SENDGRID_API_KEY);
  return sg;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function validTz(tz) {
  try { if (tz) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } } catch (e) {}
  return 'America/Caracas';
}
function when(iso, lang, tz) {
  const zone = validTz(tz);
  const s = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-VE', {
    timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function icsDate(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function ics({ start, minutes, nombre, lang }) {
  const a = new Date(start), b = new Date(a.getTime() + minutes * 60000);
  const title = lang === 'en' ? 'Synthex SAI: meeting with our specialists' : 'Synthex SAI: reunión con nuestros especialistas';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Synthex SAI//Lina//ES', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${icsDate(a)}-${Buffer.from(nombre).toString('hex').slice(0, 16)}@synthexsai.com`,
    `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(a)}`, `DTEND:${icsDate(b)}`,
    `SUMMARY:${title}`, `URL:${SITE}`, 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

function html({ nombre, start, lang, tz, minutes }) {
  const en = lang === 'en';
  const first = esc(String(nombre).split(' ')[0]);
  const t = en ? {
    hi: `Hi ${first},`, title: 'Your meeting is confirmed.',
    body: `You will meet our specialist agents to look at your case with your real systems. The meeting lasts ${minutes} minutes and the Synthex SAI team will contact you before it with the link.`,
    when: 'When', prep: 'To make the most of it, have at hand: which systems you use today (Saint, Profit, Excel, WhatsApp...), and the task that takes your team the most hours.',
    cta: 'Visit synthexsai.com', foot: 'You are receiving this email because you booked a meeting on synthexsai.com. To change the time, just reply to this email.'
  } : {
    hi: `Hola ${first},`, title: 'Tu reunión está confirmada.',
    body: `Vas a reunirte con nuestros agentes especializados para ver tu caso con tus sistemas reales. La reunión dura ${minutes} minutos y el equipo de Synthex SAI te contactará antes con el enlace.`,
    when: 'Cuándo', prep: 'Para aprovecharla, ten a la mano: qué sistemas usas hoy (Saint, Profit, Excel, WhatsApp...) y la tarea que más horas le quita a tu equipo.',
    cta: 'Visitar synthexsai.com', foot: 'Recibes este correo porque agendaste una reunión en synthexsai.com. Para cambiar el horario, solo responde a este correo.'
  };
  const F = "Geist,Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#0B0F17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F17"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#161F30;border:1px solid rgba(255,255,255,.12);border-radius:18px">
<tr><td style="height:4px;background:#00F2FE;background-image:linear-gradient(90deg,#00F2FE,#6366F1);border-radius:18px 18px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${SITE}/icon-512.png" width="40" height="40" alt="" style="display:block;border-radius:10px"></td>
    <td style="padding-left:12px;font-family:${F};font-size:22px;font-weight:700;color:#FFFFFF">Synthex <span style="color:#00F2FE">SAI</span></td>
  </tr></table>
</td></tr>
<tr><td style="padding:16px 32px 0;font-family:${F};color:#94A3B8;font-size:16px">${t.hi}</td></tr>
<tr><td style="padding:6px 32px 0;font-family:${F};color:#FFFFFF;font-size:26px;font-weight:700;line-height:1.25">${t.title}</td></tr>
<tr><td style="padding:14px 32px 0;font-family:${F};color:#CBD5E1;font-size:16px;line-height:1.6">${t.body}</td></tr>
<tr><td style="padding:20px 32px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0E1320;border:1px solid rgba(0,242,254,.35);border-radius:14px"><tr><td style="padding:16px 18px">
    <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#00F2FE">${t.when}</div>
    <div style="font-family:${F};font-size:18px;font-weight:700;color:#FFFFFF;margin-top:6px">${esc(when(start, lang, tz))}</div>
  </td></tr></table>
</td></tr>
<tr><td style="padding:18px 32px 0;font-family:${F};color:#CBD5E1;font-size:15px;line-height:1.6">${t.prep}</td></tr>
<tr><td style="padding:24px 32px 8px"><a href="${SITE}" style="display:inline-block;background:#00F2FE;color:#0B0F17;font-family:${F};font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:999px">${t.cta}</a></td></tr>
<tr><td style="padding:20px 32px 28px;font-family:${F};color:#64748B;font-size:12px;line-height:1.5">${t.foot}<br>&copy; 2026 Synthex SAI Technologies</td></tr>
</table></td></tr></table></body></html>`;
}

function text({ nombre, start, lang, tz, minutes }) {
  const first = String(nombre).split(' ')[0];
  return lang === 'en'
    ? `Hi ${first},\n\nYour meeting with the Synthex SAI specialist agents is confirmed.\n\nWhen: ${when(start, lang, tz)}\nLength: ${minutes} minutes\n\nThe Synthex SAI team will contact you before it with the link. To change the time, reply to this email.\n\nSynthex SAI · ${SITE}`
    : `Hola ${first},\n\nTu reunión con los agentes especializados de Synthex SAI está confirmada.\n\nCuándo: ${when(start, lang, tz)}\nDuración: ${minutes} minutos\n\nEl equipo de Synthex SAI te contactará antes con el enlace. Para cambiar el horario, responde a este correo.\n\nSynthex SAI · ${SITE}`;
}

/** Client confirmation + owner alert. Resolves to { sent, owner, reason }. Never throws. */
async function bookingConfirmed(m) {
  const out = { sent: false, owner: false };
  if (String(process.env.SYNTHEX_EMAIL || '').toLowerCase() === 'off') return { ...out, reason: 'SYNTHEX_EMAIL=off' };
  if (!sender && !process.env.SENDGRID_API_KEY) return { ...out, reason: 'SENDGRID_API_KEY not set' };
  const lang = m.lang === 'en' ? 'en' : 'es';
  const minutes = m.minutes || 60;
  const from = { email: FROM(), name: 'Synthex SAI' };
  try {
    await mailer().send({
      to: m.email, from, replyTo: { email: OWNER(), name: 'Synthex SAI' },
      subject: lang === 'en' ? 'Your Synthex SAI meeting is confirmed' : 'Tu reunión con Synthex SAI está confirmada',
      text: text({ ...m, lang, minutes }), html: html({ ...m, lang, minutes }),
      attachments: [{ content: Buffer.from(ics({ start: m.start, minutes, nombre: m.nombre, lang })).toString('base64'),
        filename: 'synthex-sai.ics', type: 'text/calendar', disposition: 'attachment' }]
    });
    out.sent = true;
  } catch (e) {
    out.reason = (e.response && e.response.body && JSON.stringify(e.response.body.errors || '').slice(0, 300)) || e.message;
    console.error('[synthex-notify] client email failed:', out.reason);
  }
  try {
    await mailer().send({
      to: OWNER(), from,
      subject: `Nueva reunión Synthex SAI: ${m.nombre}${m.empresa ? ' (' + m.empresa + ')' : ''}`,
      text: [`Reunión agendada desde ${m.origen === 'lina' ? 'Lina (asistente)' : 'el formulario'} de synthexsai.com.`,
        `Cuándo: ${when(m.start, 'es', 'America/Caracas')}`, `Nombre: ${m.nombre}`, m.empresa ? `Empresa: ${m.empresa}` : null,
        `Correo: ${m.email}`, `Teléfono: ${m.telefono}`, m.tema ? `Tema: ${m.tema}` : null,
        `Confirmación al cliente: ${out.sent ? 'enviada' : 'NO enviada (' + (out.reason || '') + ')'}`].filter(Boolean).join('\n')
    });
    out.owner = true;
  } catch (e) { console.error('[synthex-notify] owner alert failed:', e.message); }
  return out;
}

module.exports = { bookingConfirmed, _test: { html, text, ics, setSender: (s) => { sender = s; } } };
