// EquiMind credit payments, served from the CRM so the Stripe keys never leave
// this service. The vision2ai service (equimind.app) calls these endpoints with
// one shared key (EQUIMIND_PAY_KEY here = ECPF_PAY_KEY there) and never holds a
// Stripe key itself.
//
// What it can do is deliberately narrow:
//   - create a PaymentIntent for one of the fixed credit packages, always tagged
//     metadata.app = 'ecpf_caballo';
//   - read back a PaymentIntent, but ONLY one carrying that tag;
//   - list recent succeeded tagged PaymentIntents (EquiMind's sweep credits them).
// It cannot read, refund or touch any other payment in the Stripe account.
//
// Endpoints (all need header x-equimind-key):
//   GET  /config          -> { publishable_key, packages }
//   POST /intent          {amount, user_id, email} -> { client_secret, payment_intent_id, amount, credits }
//   GET  /intent/:id      -> { id, status, amount, credits, user_id }
//   GET  /succeeded?hours=48 -> [{ id, amount, credits, user_id }]
'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const APP_TAG = 'ecpf_caballo';
const PACKAGE_AMOUNTS = [10, 20, 40, 60, 80, 100]; // same list as equimind.app
const CREDIT_PRICE = parseFloat(process.env.EQUIMIND_CREDIT_PRICE_USD || '1') || 1;
const creditsFor = (amount) => Math.round(amount / CREDIT_PRICE);

function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Fails shut: no key configured = 503, wrong key = 404 (does not confirm the route exists).
function requireKey(req, res, next) {
  const want = process.env.EQUIMIND_PAY_KEY || '';
  if (want.length < 16) return res.status(503).json({ error: 'equimind payments not configured' });
  const got = String(req.headers['x-equimind-key'] || '');
  const a = crypto.createHash('sha256').update(got).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(404).json({ error: 'not found' });
  next();
}

function view(pi) {
  const m = pi.metadata || {};
  return {
    id: pi.id,
    status: pi.status,
    amount: pi.amount / 100,
    credits: parseInt(m.credits, 10) || creditsFor(pi.amount / 100),
    user_id: m.user_id || null
  };
}

router.use(requireKey);

router.get('/config', (req, res) => {
  const pk = process.env.STRIPE_PUBLISHABLE_KEY || null;
  res.json({
    publishable_key: pk,
    payments_enabled: !!(pk && process.env.STRIPE_SECRET_KEY),
    packages: PACKAGE_AMOUNTS.map((a) => ({ amount: a, credits: creditsFor(a) }))
  });
});

router.post('/intent', async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'payments not configured' });
  const b = req.body || {};
  const amount = parseInt(b.amount, 10);
  if (!PACKAGE_AMOUNTS.includes(amount)) return res.status(400).json({ error: 'invalid amount' });
  const userId = String(b.user_id || '');
  if (!/^\d{1,12}$/.test(userId)) return res.status(400).json({ error: 'invalid user_id' });
  const email = String(b.email || '').slice(0, 200);
  const credits = creditsFor(amount);
  try {
    const pi = await s.paymentIntents.create({
      amount: amount * 100, currency: 'usd', payment_method_types: ['card'],
      description: `EquiMind ${credits} créditos`,
      metadata: { app: APP_TAG, user_id: userId, email, credits: String(credits), amount: String(amount) }
    });
    res.json({ client_secret: pi.client_secret, payment_intent_id: pi.id, amount, credits });
  } catch (e) {
    console.error('[equimind-pay] create intent failed:', e.message);
    res.status(502).json({ error: 'could not start payment' });
  }
});

router.get('/intent/:id', async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'payments not configured' });
  const id = String(req.params.id || '');
  if (!/^pi_[A-Za-z0-9]{8,64}$/.test(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const pi = await s.paymentIntents.retrieve(id);
    // Another product's payment is answered exactly like a missing one.
    if (!pi || !pi.metadata || pi.metadata.app !== APP_TAG) return res.status(404).json({ error: 'not found' });
    res.json(view(pi));
  } catch (e) {
    if (e && e.statusCode === 404) return res.status(404).json({ error: 'not found' });
    console.error('[equimind-pay] retrieve failed:', e.message);
    res.status(502).json({ error: 'stripe unavailable' });
  }
});

router.get('/succeeded', async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'payments not configured' });
  const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 48, 1), 24 * 30);
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  try {
    const out = [];
    // Plain listing, not the search API: search can lag by a minute or more.
    for await (const pi of s.paymentIntents.list({ created: { gte: since }, limit: 100 })) {
      if (pi.status === 'succeeded' && pi.metadata && pi.metadata.app === APP_TAG) out.push(view(pi));
      if (out.length >= 500) break;
    }
    res.json(out);
  } catch (e) {
    console.error('[equimind-pay] list failed:', e.message);
    res.status(502).json({ error: 'stripe unavailable' });
  }
});

module.exports = router;
