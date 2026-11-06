'use strict';
/**
 * The ONLY file in the Delca vertical with a message transport (the SIT greps it).
 * It sends the order confirmation the customer asked for when they said "sí".
 *
 * Providers, first configured wins:
 *   1. Meta WhatsApp Cloud API: DELCA_WHATSAPP_TOKEN + DELCA_WHATSAPP_PHONE_ID.
 *      A business-initiated message outside a 24 h customer window needs an
 *      APPROVED TEMPLATE (DELCA_WHATSAPP_TEMPLATE); without one a free-text
 *      message is attempted and Meta may refuse it. The refusal is reported.
 *   2. Twilio WhatsApp: DELCA_TWILIO_WHATSAPP_FROM + TWILIO_ACCOUNT_SID/AUTH_TOKEN.
 *   3. Nothing configured: status 'not_configured'. Never reported as sent.
 */
let injected = null;
function _setTransport(fn) { injected = fn; }

function provider() {
  if (injected) return 'test';
  if (process.env.DELCA_WHATSAPP_TOKEN && process.env.DELCA_WHATSAPP_PHONE_ID) return 'meta';
  if (process.env.DELCA_TWILIO_WHATSAPP_FROM && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) return 'twilio';
  return null;
}

async function send({ to, text, template }) {
  const p = provider();
  if (!/^\+\d{10,15}$/.test(String(to || ''))) return { status: 'failed', provider: p, detail: 'invalid_phone' };
  if (!p) return { status: 'not_configured', provider: null, detail: 'no WhatsApp provider configured' };
  try {
    if (p === 'test') return await injected({ to, text, template });
    if (p === 'meta') {
      const v = process.env.DELCA_WHATSAPP_API_VERSION || 'v21.0';
      const tpl = process.env.DELCA_WHATSAPP_TEMPLATE;
      const body = tpl && template
        ? { messaging_product: 'whatsapp', to: to.slice(1), type: 'template', template: { name: tpl, language: { code: process.env.DELCA_WHATSAPP_TEMPLATE_LANG || 'es' },
            components: [{ type: 'body', parameters: template.map((x) => ({ type: 'text', text: String(x).slice(0, 900) })) }] } }
        : { messaging_product: 'whatsapp', to: to.slice(1), type: 'text', text: { body: text.slice(0, 4000) } };
      const r = await fetch(`https://graph.facebook.com/${v}/${process.env.DELCA_WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + process.env.DELCA_WHATSAPP_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { status: 'failed', provider: p, detail: String((j.error && j.error.message) || ('HTTP ' + r.status)).slice(0, 300) };
      return { status: 'sent', provider: p, id: j.messages && j.messages[0] && j.messages[0].id };
    }
    const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const m = await twilio.messages.create({ from: 'whatsapp:' + process.env.DELCA_TWILIO_WHATSAPP_FROM, to: 'whatsapp:' + to, body: text.slice(0, 1500) });
    return { status: 'sent', provider: p, id: m.sid };
  } catch (e) {
    return { status: 'failed', provider: p, detail: String((e && e.message) || e).slice(0, 300) };
  }
}

/** Click-to-chat link to the restaurant's own WhatsApp, prefilled with the order. Costs nothing. */
function restaurantLink(text) {
  const n = String(process.env.DELCA_WHATSAPP_NUMBER || '').replace(/\D/g, '');
  if (n.length < 10) return null;
  return 'https://wa.me/' + n + '?text=' + encodeURIComponent(text.slice(0, 1800));
}

module.exports = { send, restaurantLink, provider, _setTransport };
