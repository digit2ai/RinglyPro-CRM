/**
 * Global System Monitor - development proposal by Synthex SAI: Stripe checkout.
 *
 * Three payments, and EVERY amount lives here, never in the request:
 *   deposit   - 30% of the PoC development, paid when the PoC starts (one time)
 *   balance   - the remaining 70%, due 4 weeks after the PoC starts (one time)
 *   hypercare - monthly hypercare, a Stripe subscription that renews every month
 * The page sends only {item}. A caller cannot change what they pay.
 *
 * Nothing is stored on our side: the payment, customer and subscription live in
 * Stripe, and "paid" is what the Stripe dashboard says. The return page only says
 * that Stripe is confirming; it never claims the payment.
 */
const express = require('express');
const router = express.Router();

const PRICES = Object.freeze({
  // 124 h x USD 119 (USD 70 internal cost + 70%) = USD 14,756 for the 4-week PoC.
  development_cents: 1475600,
  deposit_cents: 442680,   // 30%
  balance_cents: 1032920,  // 70%
  hypercare_cents: 119000  // USD 1,190 / month
});
if (PRICES.deposit_cents + PRICES.balance_cents !== PRICES.development_cents) throw new Error('gsm-proposal: split does not add up');

const BRAND_LOGO = 'https://synthexsai.com/icon-512.png';
const BRAND_WORDMARK = 'https://synthexsai.com/stripe-logo.png'; // white wordmark for Stripe's dark panel
const STRIPE_API = '2025-09-30.clover';

const ITEMS = {
  deposit: { mode: 'payment', cents: PRICES.deposit_cents, name: 'Synthex SAI · Global System Monitor - Anticipo 30% (inicio de la prueba de concepto)' },
  balance: { mode: 'payment', cents: PRICES.balance_cents, name: 'Synthex SAI · Global System Monitor - Saldo 70% (semana 4 de la prueba de concepto)' },
  hypercare: { mode: 'subscription', cents: PRICES.hypercare_cents, name: 'Synthex SAI · Global System Monitor - Hypercare mensual' }
};

// Return URL host comes from an allow-list, never echoed from the request.
const HOSTS = { 'synthexsai.com': 'https://synthexsai.com', 'aiagent.ringlypro.com': 'https://aiagent.ringlypro.com' };
function base(req) {
  const h = String(req.get('host') || '').toLowerCase().split(':')[0].replace(/^www\./, '');
  return (HOSTS[h] || HOSTS['synthexsai.com']) + '/global-system-monitor/propuesta/';
}

let stripe = null;
function client() {
  if (stripe) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripe = require('stripe')(key);
  return stripe;
}

const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  return list.length > 20;
}

router.get('/config', (req, res) => {
  res.json({ ok: true, payments_enabled: !!process.env.STRIPE_SECRET_KEY, currency: 'usd', prices: PRICES });
});

router.post('/checkout', express.json({ limit: '2kb' }), async (req, res) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ ok: false, error: 'too_many' });
    const key = String((req.body && req.body.item) || '');
    const item = Object.prototype.hasOwnProperty.call(ITEMS, key) ? ITEMS[key] : null;
    if (!item) return res.status(400).json({ ok: false, error: 'unknown_item' });
    const s = client();
    if (!s) return res.status(503).json({ ok: false, error: 'payments_not_configured' });
    const back = base(req);
    const line = {
      price_data: {
        currency: 'usd',
        unit_amount: item.cents,
        product_data: { name: item.name, images: [BRAND_LOGO] },
        ...(item.mode === 'subscription' ? { recurring: { interval: 'month' } } : {})
      },
      quantity: 1
    };
    const meta = { product: 'gsm_proposal', item: key, proposer: 'synthex_sai' };
    // The Stripe account belongs to Digit2AI; the client must see Synthex SAI.
    // branding_settings overrides name, logo and colours for THIS session only.
    // It exists from API 2025-09-30.clover; the SDK here pins basil, so the call
    // asks for clover explicitly (verified live 2026-11-13).
    const branding = {
      display_name: 'Synthex SAI',
      logo: { type: 'url', url: BRAND_WORDMARK },
      icon: { type: 'url', url: BRAND_LOGO },
      background_color: '#0B0F17',
      button_color: '#00F2FE',
      border_style: 'rounded'
    };
    const session = await s.checkout.sessions.create({
      mode: item.mode,
      line_items: [line],
      metadata: meta,
      ...(item.mode === 'subscription' ? { subscription_data: { metadata: meta } } : { payment_intent_data: { metadata: meta, statement_descriptor_suffix: 'SYNTHEXSAI' }, invoice_creation: { enabled: true } }),
      branding_settings: branding,
      locale: 'es',
      success_url: back + '?pago=ok&item=' + key + '#pagos',
      cancel_url: back + '?pago=cancelado#pagos'
    }, { apiVersion: STRIPE_API });
    res.json({ ok: true, url: session.url });
  } catch (e) {
    console.error('gsm-proposal checkout:', e.message);
    res.status(502).json({ ok: false, error: 'stripe_error' });
  }
});

router._PRICES = PRICES;
router._ITEMS = ITEMS;
router._setStripe = (fake) => { stripe = fake; };
module.exports = router;
