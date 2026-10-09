'use strict';
/**
 * El ÚNICO correo que este vertical envía: el código de acceso, que pide la
 * propia persona. No hay ningún otro envío (el SIT lo revisa).
 */
let injected = null;
function _setSender(fn) { injected = fn; }

function sender() {
  if (injected) return injected;
  if (!process.env.SENDGRID_API_KEY) return null;
  const sg = require('@sendgrid/mail');
  sg.setApiKey(process.env.SENDGRID_API_KEY);
  return (msg) => sg.send(msg);
}

function configured() { return !!(injected || process.env.SENDGRID_API_KEY); }

async function sendCode({ to, code, link, minutes }) {
  const send = sender();
  if (!send) return { sent: false, reason: 'mail_not_configured' };
  const from = process.env.VALLEMILAGRO_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || 'info@digit2ai.com';
  const text = `Tu código de acceso al Portal de Miembros de la Asociación Valle Milagro es: ${code}\n\n` +
    `También puedes entrar con este enlace:\n${link}\n\nEl código y el enlace vencen en ${minutes} minutos y sirven una sola vez.\n` +
    'Si no pediste este código, puedes ignorar este mensaje.\n\nNo manejamos dinero. Conectamos a quien sí.';
  const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#21392B;background:#F5F0E6">
    <p style="font-family:Arial,sans-serif;letter-spacing:.2em;font-size:12px;text-transform:uppercase;margin:0 0 16px">Asociación Valle Milagro</p>
    <p style="font-size:16px;margin:0 0 12px">Tu código de acceso al Portal de Miembros:</p>
    <p style="font-family:Arial,sans-serif;font-size:34px;font-weight:700;letter-spacing:.3em;margin:0 0 20px">${code}</p>
    <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#21392B;color:#F5F0E6;text-decoration:none;font-family:Arial,sans-serif;font-weight:600;padding:12px 22px;border-radius:999px">Entrar al portal</a></p>
    <p style="font-size:13px;color:#5b6b60;margin:0 0 6px">El código y el enlace vencen en ${minutes} minutos y sirven una sola vez.</p>
    <p style="font-size:13px;color:#5b6b60;margin:0">Si no pediste este código, puedes ignorar este mensaje.</p>
    <p style="font-size:12px;font-style:italic;color:#5b6b60;margin:20px 0 0">No manejamos dinero. Conectamos a quien sí.</p></div>`;
  try {
    await send({ to, from: { email: from, name: 'Asociación Valle Milagro' }, subject: `${code} es tu código de acceso · Valle Milagro`, text, html,
      trackingSettings: { clickTracking: { enable: false, enableText: false } } });
    return { sent: true };
  } catch (e) {
    console.error('[vallemilagro] no se pudo enviar el código:', e && (e.code || e.message));
    return { sent: false, reason: 'mail_failed' };
  }
}

module.exports = { sendCode, configured, _setSender };
