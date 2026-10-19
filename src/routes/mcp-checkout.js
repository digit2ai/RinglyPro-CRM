'use strict';

/**
 * Digit2AI MCP Neural — Stripe checkout for the /mcp landing (digit2ai.com/MCP).
 *
 * POST /api/mcp-checkout/session   public, rate-limited -> { url } of a Stripe Checkout
 * GET  /api/mcp-checkout/status    ?session_id=cs_...  -> { paid } (a boolean, nothing else)
 * GET  /api/mcp-checkout/health    config only
 *
 * ONE Checkout in subscription mode with TWO lines: the $700 setup fee (one time) and
 * the $397/month subscription. Stripe bills both on the FIRST invoice, the day the
 * client pays (the contract day), and the subscription then renews monthly on that date.
 *
 * THE AMOUNTS LIVE HERE, NEVER IN THE REQUEST. The body is ignored apart from the
 * language; a client cannot change what they pay. Prices are inline price_data, so
 * there is no Stripe Product/Price to keep in step. Env overrides exist for both.
 *
 * Nothing is stored on our side: the payment, customer and subscription live in the
 * Digit2AI Stripe account (STRIPE_SECRET_KEY). No key = 503, never a fake URL.
 */

const express = require('express');
const router = express.Router();

const SETUP_USD = Number(process.env.MCP_SETUP_FEE_USD || 700);
const MONTHLY_USD = Number(process.env.MCP_MONTHLY_USD || 397);
const RETURN_BASE = (process.env.MCP_PUBLIC_URL || 'https://aiagent.ringlypro.com/mcp/').replace(/\/?$/, '/');

let stripeClient = null;
function stripe() {
  const key = process.env.MCP_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) stripeClient = require('stripe')(key);
  return stripeClient;
}

// In-memory, per instance: a public endpoint that mints Stripe sessions needs a ceiling.
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 10;
  const arr = (hits.get(ip) || []).filter(t => now - t < win);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

router.get('/health', (req, res) => {
  res.json({ ok: true, stripe_configured: !!stripe(), setup_usd: SETUP_USD, monthly_usd: MONTHLY_USD });
});

router.post('/session', express.json({ limit: '2kb' }), async (req, res) => {
  try {
    const ip = String(req.headers['cf-connecting-ip'] || req.ip || '');
    if (limited(ip)) return res.status(429).json({ error: 'too_many_requests' });
    const s = stripe();
    if (!s) return res.status(503).json({ error: 'payments_not_configured' });
    const lang = req.body && req.body.lang === 'en' ? 'en' : 'es';

    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      locale: lang,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(MONTHLY_USD * 100),
            recurring: { interval: 'month' },
            product_data: {
              name: lang === 'en' ? 'Digit2AI MCP Neural - monthly subscription' : 'Digit2AI MCP Neural - suscripción mensual',
              description: lang === 'en'
                ? 'Use of the advanced AI and ecosystem maintenance, standard token usage.'
                : 'Uso de la inteligencia artificial avanzada y mantenimiento del ecosistema, consumo de tokens estándar.'
            }
          }
        },
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(SETUP_USD * 100),
            product_data: {
              name: lang === 'en' ? 'Digit2AI MCP Neural - initial setup (one time)' : 'Digit2AI MCP Neural - configuración inicial (pago único)'
            }
          }
        }
      ],
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      subscription_data: { metadata: { product: 'digit2ai_mcp_neural' } },
      metadata: { product: 'digit2ai_mcp_neural' },
      success_url: `${RETURN_BASE}?pago=ok&session_id={CHECKOUT_SESSION_ID}#precio`,
      cancel_url: `${RETURN_BASE}?pago=cancelado#precio`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[mcp-checkout] session error:', err && err.message);
    res.status(502).json({ error: 'checkout_failed' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const id = String(req.query.session_id || '');
    if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return res.status(400).json({ error: 'bad_session' });
    const s = stripe();
    if (!s) return res.status(503).json({ error: 'payments_not_configured' });
    const session = await s.checkout.sessions.retrieve(id);
    const ours = session && session.metadata && session.metadata.product === 'digit2ai_mcp_neural';
    res.json({ paid: !!(ours && session.payment_status === 'paid') });
  } catch (err) {
    res.status(404).json({ error: 'not_found' });
  }
});

module.exports = router;
