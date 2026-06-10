'use strict';

/**
 * AgroMercado — WhatsApp Cloud API notifications.
 * Disabled-by-default safety: when AGROMERCADO_WHATSAPP_TOKEN +
 * AGROMERCADO_WHATSAPP_PHONE_ID are unset, this logs only (no send).
 */

const fetch = require('node-fetch');

async function notify(toPhone, message) {
  const token = process.env.AGROMERCADO_WHATSAPP_TOKEN;
  const phoneId = process.env.AGROMERCADO_WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    console.log(`[agromercado/whatsapp] (log-only) -> ${toPhone}: ${message}`);
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const r = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: String(toPhone).replace(/[^0-9]/g, ''), type: 'text', text: { body: message } })
    });
    const ok = r.ok;
    if (!ok) console.error('[agromercado/whatsapp] send failed', r.status);
    return { sent: ok };
  } catch (e) {
    console.error('[agromercado/whatsapp] error', e.message);
    return { sent: false, reason: e.message };
  }
}

module.exports = { notify };
