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

// One email engine, two looks. 'digit2ai' = meetings booked from the digit2ai.com/presentacion deck.
const BRANDS = {
  synthex: {
    name: 'Synthex SAI', site: SITE, siteLabel: 'synthexsai.com', host: 'synthexsai.com',
    logo: SITE + '/icon-512.png', word: 'Synthex <span style="color:#00F2FE">SAI</span>',
    bg: '#0B0F17', card: '#161F30', box: '#0E1320', cy: '#00F2FE', vi: '#6366F1', boxLine: 'rgba(0,242,254,.35)', btnTxt: '#0B0F17',
    font: "Geist,Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
    fontLink: '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">',
    copyright: '&copy; 2026 Synthex SAI Technologies', ics: 'synthex-sai.ics',
    es: { body: (m) => `Vas a reunirte con nuestros agentes especializados para ver tu caso con tus sistemas reales. La reunión dura ${m} minutos y el equipo de Synthex SAI te contactará antes con el enlace.`,
      prep: 'Para aprovecharla, ten a la mano: qué sistemas usas hoy (Saint, Profit, Excel, WhatsApp...) y la tarea que más horas le quita a tu equipo.',
      summary: 'Synthex SAI: reunión con nuestros especialistas', subject: 'Tu reunión con Synthex SAI está confirmada',
      textLine: 'Tu reunión con los agentes especializados de Synthex SAI está confirmada.', team: 'El equipo de Synthex SAI' },
    en: { body: (m) => `You will meet our specialist agents to look at your case with your real systems. The meeting lasts ${m} minutes and the Synthex SAI team will contact you before it with the link.`,
      prep: 'To make the most of it, have at hand: which systems you use today (Saint, Profit, Excel, WhatsApp...), and the task that takes your team the most hours.',
      summary: 'Synthex SAI: meeting with our specialists', subject: 'Your Synthex SAI meeting is confirmed',
      textLine: 'Your meeting with the Synthex SAI specialist agents is confirmed.', team: 'The Synthex SAI team' }
  },
  digit2ai: {
    name: 'Digit2AI', site: 'https://digit2ai.com/mcp', siteLabel: 'digit2ai.com/mcp', host: 'digit2ai.com',
    logo: 'https://aiagent.ringlypro.com/mcp/logo.png', word: 'Digit2<span style="color:#22d3ee">AI</span>',
    bg: '#070b16', card: '#131e33', box: '#0b1222', cy: '#22d3ee', vi: '#8b5cf6', boxLine: 'rgba(34,211,238,.35)', btnTxt: '#04222a',
    font: "'Space Grotesk',Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", fontLink: '',
    copyright: '&copy; 2026 Digit2AI', ics: 'digit2ai.ics',
    es: { body: (m) => `Vamos a ver juntos cómo conectar Digit2AI MCP Neural a los sistemas que su empresa ya usa. La reunión dura ${m} minutos y el equipo de Digit2AI le enviará antes el enlace.`,
      prep: 'Para aprovecharla, tenga a la mano: qué sistemas usa hoy (ERP, contabilidad, ventas, Excel, WhatsApp...) y la tarea que más horas le quita a su equipo.',
      summary: 'Digit2AI: reunión sobre MCP Neural', subject: 'Su reunión con Digit2AI está confirmada',
      textLine: 'Su reunión con Digit2AI está confirmada.', team: 'El equipo de Digit2AI' },
    en: { body: (m) => `We will look together at how to connect Digit2AI MCP Neural to the systems your company already uses. The meeting lasts ${m} minutes and the Digit2AI team will send you the link before it.`,
      prep: 'To make the most of it, have at hand: which systems you use today (ERP, accounting, sales, Excel, WhatsApp...) and the task that takes your team the most hours.',
      summary: 'Digit2AI: MCP Neural meeting', subject: 'Your Digit2AI meeting is confirmed',
      textLine: 'Your meeting with Digit2AI is confirmed.', team: 'The Digit2AI team' }
  }
};
const brandOf = (b) => BRANDS[b === 'digit2ai' ? 'digit2ai' : 'synthex'];

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
function ics({ start, minutes, nombre, lang, brand }) {
  const B = brandOf(brand);
  const a = new Date(start), b = new Date(a.getTime() + minutes * 60000);
  const title = B[lang === 'en' ? 'en' : 'es'].summary;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${B.name}//Booking//ES`, 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${icsDate(a)}-${Buffer.from(nombre).toString('hex').slice(0, 16)}@${B.host}`,
    `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(a)}`, `DTEND:${icsDate(b)}`,
    `SUMMARY:${title}`, `URL:${B.site}`, 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

function html({ nombre, start, lang, tz, minutes, brand }) {
  const B = brandOf(brand);
  const en = lang === 'en';
  const L = B[en ? 'en' : 'es'];
  const first = esc(String(nombre).split(' ')[0]);
  const t = {
    hi: en ? `Hi ${first},` : `Hola ${first},`,
    title: en ? 'Your meeting is confirmed.' : (brand === 'digit2ai' ? 'Su reunión está confirmada.' : 'Tu reunión está confirmada.'),
    body: L.body(minutes), when: en ? 'When' : 'Cuándo', prep: L.prep,
    cta: (en ? 'Visit ' : 'Visitar ') + B.siteLabel,
    foot: en
      ? `You are receiving this email because you booked a meeting on ${B.host}. To change the time, just reply to this email.`
      : (brand === 'digit2ai'
        ? `Recibe este correo porque agendó una reunión en ${B.host}. Para cambiar el horario, solo responda a este correo.`
        : `Recibes este correo porque agendaste una reunión en ${B.host}. Para cambiar el horario, solo responde a este correo.`)
  };
  const F = B.font;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${B.fontLink}</head>
<body style="margin:0;padding:0;background:${B.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.bg}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${B.card};border:1px solid rgba(255,255,255,.12);border-radius:18px">
<tr><td style="height:4px;background:${B.cy};background-image:linear-gradient(90deg,${B.cy},${B.vi});border-radius:18px 18px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${B.logo}" ${brand === 'digit2ai' ? 'width="160"' : 'width="40" height="40"'} alt="${B.name}" style="display:block;border-radius:10px"></td>
    ${brand === 'digit2ai' ? '' : `<td style="padding-left:12px;font-family:${F};font-size:22px;font-weight:700;color:#FFFFFF">${B.word}</td>`}
  </tr></table>
</td></tr>
<tr><td style="padding:16px 32px 0;font-family:${F};color:#94A3B8;font-size:16px">${t.hi}</td></tr>
<tr><td style="padding:6px 32px 0;font-family:${F};color:#FFFFFF;font-size:26px;font-weight:700;line-height:1.25">${t.title}</td></tr>
<tr><td style="padding:14px 32px 0;font-family:${F};color:#CBD5E1;font-size:16px;line-height:1.6">${t.body}</td></tr>
<tr><td style="padding:20px 32px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${B.box};border:1px solid ${B.boxLine};border-radius:14px"><tr><td style="padding:16px 18px">
    <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${B.cy}">${t.when}</div>
    <div style="font-family:${F};font-size:18px;font-weight:700;color:#FFFFFF;margin-top:6px">${esc(when(start, lang, tz))}</div>
  </td></tr></table>
</td></tr>
<tr><td style="padding:18px 32px 0;font-family:${F};color:#CBD5E1;font-size:15px;line-height:1.6">${t.prep}</td></tr>
<tr><td style="padding:24px 32px 8px"><a href="${B.site}" style="display:inline-block;background:${B.cy};color:${B.btnTxt};font-family:${F};font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:999px">${t.cta}</a></td></tr>
<tr><td style="padding:20px 32px 28px;font-family:${F};color:#64748B;font-size:12px;line-height:1.5">${t.foot}<br>${B.copyright}</td></tr>
</table></td></tr></table></body></html>`;
}

function text({ nombre, start, lang, tz, minutes, brand }) {
  const B = brandOf(brand);
  const L = B[lang === 'en' ? 'en' : 'es'];
  const first = String(nombre).split(' ')[0];
  const ud = brand === 'digit2ai';
  return lang === 'en'
    ? `Hi ${first},\n\n${L.textLine}\n\nWhen: ${when(start, lang, tz)}\nLength: ${minutes} minutes\n\n${L.team} will contact you before it with the link. To change the time, reply to this email.\n\n${B.name} · ${B.site}`
    : `Hola ${first},\n\n${L.textLine}\n\nCuándo: ${when(start, lang, tz)}\nDuración: ${minutes} minutos\n\n${L.team} ${ud ? 'le' : 'te'} contactará antes con el enlace. Para cambiar el horario, ${ud ? 'responda' : 'responde'} a este correo.\n\n${B.name} · ${B.site}`;
}

/** Client confirmation + owner alert. Resolves to { sent, owner, reason }. Never throws. */
async function bookingConfirmed(m) {
  const out = { sent: false, owner: false };
  if (String(process.env.SYNTHEX_EMAIL || '').toLowerCase() === 'off') return { ...out, reason: 'SYNTHEX_EMAIL=off' };
  if (!sender && !process.env.SENDGRID_API_KEY) return { ...out, reason: 'SENDGRID_API_KEY not set' };
  const brand = m.brand === 'digit2ai' ? 'digit2ai' : 'synthex';
  const B = brandOf(brand);
  const lang = m.lang === 'en' ? 'en' : 'es';
  const minutes = m.minutes || 60;
  const from = { email: FROM(), name: B.name };
  try {
    await mailer().send({
      to: m.email, from, replyTo: { email: OWNER(), name: B.name },
      subject: B[lang].subject,
      text: text({ ...m, lang, minutes, brand }), html: html({ ...m, lang, minutes, brand }),
      attachments: [{ content: Buffer.from(ics({ start: m.start, minutes, nombre: m.nombre, lang, brand })).toString('base64'),
        filename: B.ics, type: 'text/calendar', disposition: 'attachment' }]
    });
    out.sent = true;
  } catch (e) {
    out.reason = (e.response && e.response.body && JSON.stringify(e.response.body.errors || '').slice(0, 300)) || e.message;
    console.error('[synthex-notify] client email failed:', out.reason);
  }
  const fromWhere = brand === 'digit2ai' ? (m.source || 'la presentación narrada (digit2ai.com/presentacion)')
    : (m.origen === 'lina' ? 'Lina (asistente) de synthexsai.com' : (m.source || 'el formulario de synthexsai.com'));
  try {
    await mailer().send({
      to: OWNER(), from,
      subject: `Nueva reunión ${B.name}: ${m.nombre}${m.empresa ? ' (' + m.empresa + ')' : ''}`,
      text: [`Reunión agendada desde ${fromWhere}.`,
        `Cuándo: ${when(m.start, 'es', brand === 'digit2ai' ? 'America/New_York' : 'America/Caracas')}`, `Nombre: ${m.nombre}`, m.empresa ? `Empresa: ${m.empresa}` : null,
        `Correo: ${m.email}`, `Teléfono: ${m.telefono}`, m.tema ? `Tema: ${m.tema}` : null,
        `Confirmación al cliente: ${out.sent ? 'enviada' : 'NO enviada (' + (out.reason || '') + ')'}`].filter(Boolean).join('\n')
    });
    out.owner = true;
  } catch (e) { console.error('[synthex-notify] owner alert failed:', e.message); }
  return out;
}

module.exports = { bookingConfirmed, _test: { html, text, ics, setSender: (s) => { sender = s; } } };
