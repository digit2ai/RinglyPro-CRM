// =====================================================
// Account + Credits API (`/api/v1/account`) — sistema PROPIO de la app.
//
// Replica el patrón de RinglyPro (bcrypt + JWT + Stripe) pero AISLADO: cuentas
// exclusivas del caballo, saldo en CRÉDITOS (no tokens). 1 crédito = 1 análisis.
//
//   POST /register {email,password,nombre}   -> crea cuenta + JWT (cookie)
//   POST /login {email,password}             -> JWT (cookie)
//   POST /logout                             -> limpia la cookie
//   GET  /me                                 -> {email,nombre,credits}
//   GET  /config                             -> {publishable_key, packages, logged_in, credits}
//   GET  /credits/balance                    -> {credits}
//   GET  /credits/packages                   -> paquetes de recarga (10..100)
//   POST /credits/create-intent {amount}     -> Stripe PaymentIntent -> client_secret
//   POST /credits/confirm {payment_intent_id}-> acredita (idempotente) -> {credits}
//   POST /credits/webhook                    -> Stripe webhook (raw body)
//   GET  /credits/tx                         -> historial
//
// Exporta requireAccount / optionalAccount para cobrar créditos en los endpoints
// de análisis (routes/championship.js, routes/evaluations.js).
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const account = require('../models/account');

const JWT_SECRET = process.env.ECPF_JWT_SECRET || process.env.JWT_SECRET || 'ecpf-dev-secret';
const COOKIE = 'ecpf_token';
const WELCOME_BONUS = parseInt(process.env.ECPF_WELCOME_BONUS_CREDITS || '0', 10) || 0;
const CREDIT_PRICE = parseFloat(process.env.ECPF_CREDIT_PRICE_USD || '1') || 1; // $1 por crédito
const PACKAGE_AMOUNTS = [10, 20, 40, 60, 80, 100];

function err(res, code, msg) { return res.status(code).json({ error: msg }); }
function creditsFor(amount) { return Math.round(amount / CREDIT_PRICE); }
function packages() { return PACKAGE_AMOUNTS.map((a) => ({ amount: a, credits: creditsFor(a) })); }

function signToken(u) { return jwt.sign({ uid: u.id, email: u.email }, JWT_SECRET, { expiresIn: '30d' }); }
function setCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, maxAge: 30 * 24 * 3600 * 1000, path: '/' });
}
function readToken(req) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  const raw = req.headers.cookie || '';
  const m = raw.match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// Middleware: exige cuenta válida. Carga req.account + req.accountId.
async function requireAccount(req, res, next) {
  const token = readToken(req);
  if (!token) return err(res, 401, 'account login required');
  let dec;
  try { dec = jwt.verify(token, JWT_SECRET); } catch (e) { return err(res, 401, 'invalid or expired session'); }
  const u = await account.findById(dec.uid);
  if (!u) return err(res, 401, 'account not found');
  req.account = u; req.accountId = u.id;
  next();
}
// Middleware suave: si hay cuenta, la carga; si no, sigue anónimo.
async function optionalAccount(req, res, next) {
  const token = readToken(req);
  if (token) {
    try { const dec = jwt.verify(token, JWT_SECRET); const u = await account.findById(dec.uid); if (u) { req.account = u; req.accountId = u.id; } }
    catch (e) { /* anónimo */ }
  }
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Auth -----------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { email, password, nombre } = req.body || {};
    if (!email || !EMAIL_RE.test(String(email))) return err(res, 400, 'valid email required');
    if (!password || String(password).length < 6) return err(res, 400, 'password must be at least 6 characters');
    const existing = await account.findByEmail(email);
    if (existing) return err(res, 409, 'that email is already registered');
    const hash = await bcrypt.hash(String(password), 10);
    const u = await account.createUser({ email, password_hash: hash, nombre: nombre || null, credits: WELCOME_BONUS });
    const token = signToken(u);
    setCookie(res, token);
    res.status(201).json({ token, user: { id: u.id, email: u.email, nombre: u.nombre, credits: u.credits } });
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'register_error', error: e.message }));
    err(res, 500, 'registration failed');
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return err(res, 400, 'email and password required');
    const u = await account.findByEmail(email);
    if (!u) return err(res, 401, 'invalid email or password');
    const ok = await bcrypt.compare(String(password), u.password_hash);
    if (!ok) return err(res, 401, 'invalid email or password');
    const token = signToken(u);
    setCookie(res, token);
    res.json({ token, user: { id: u.id, email: u.email, nombre: u.nombre, credits: u.credits } });
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'login_error', error: e.message }));
    err(res, 500, 'login failed');
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

// Self-service password reset (POC convenience). Enabled by default; set
// ECPF_SELF_RESET=0 to disable and require an admin/email-verified flow instead.
// Sets a new password for an existing email. Logged for audit.
const SELF_RESET_ON = process.env.ECPF_SELF_RESET !== '0';
router.post('/reset-password', async (req, res) => {
  try {
    if (!SELF_RESET_ON) return err(res, 403, 'password reset is disabled');
    const { email, new_password } = req.body || {};
    if (!email || !EMAIL_RE.test(String(email))) return err(res, 400, 'valid email required');
    if (!new_password || String(new_password).length < 6) return err(res, 400, 'new password must be at least 6 characters');
    const u = await account.findByEmail(email);
    if (!u) return err(res, 404, 'no account with that email');
    const hash = await bcrypt.hash(String(new_password), 10);
    await account.setPassword(u.id, hash);
    console.log(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'password_reset', user_id: u.id }));
    res.json({ ok: true });
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'reset_error', error: e.message }));
    err(res, 500, 'reset failed');
  }
});

router.get('/me', requireAccount, (req, res) => {
  res.json({ id: req.account.id, email: req.account.email, nombre: req.account.nombre, credits: req.account.credits });
});

// Short-lived token for embedding a sibling app (e.g. the Jump Coach) that runs
// on a different origin and cannot read the HttpOnly session cookie. The panel
// fetches this (same-origin, cookie-authed) and passes it to the embedded app,
// which validates it against THIS account system and debits credits.
router.get('/embed-token', requireAccount, (req, res) => {
  const token = jwt.sign({ uid: req.account.id, email: req.account.email, embed: true }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, credits: req.account.credits });
});

router.get('/config', optionalAccount, (req, res) => {
  res.json({
    publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || null,
    payments_enabled: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY),
    credit_price_usd: CREDIT_PRICE,
    packages: packages(),
    welcome_bonus: WELCOME_BONUS,
    logged_in: !!req.account,
    credits: req.account ? req.account.credits : null,
    email: req.account ? req.account.email : null
  });
});

// Aggregate stats (count only — no PII by default). The detailed user list is
// returned only to an ADMIN: either ECPF_ADMIN_KEY (?key=/x-admin-key) matches,
// or the caller is logged in with an admin email (ECPF_ADMIN_EMAILS, default the
// owner mstagg@digit2ai.com). Keeps PII owner-only.
const ADMIN_EMAILS = (process.env.ECPF_ADMIN_EMAILS || 'mstagg@digit2ai.com').toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(Boolean);
router.get('/stats', optionalAccount, async (req, res) => {
  try {
    const s = await account.stats();
    const adminKey = process.env.ECPF_ADMIN_KEY;
    const provided = req.headers['x-admin-key'] || (req.query && req.query.key);
    const isAdmin = (adminKey && provided === adminKey) ||
      (req.account && ADMIN_EMAILS.indexOf(String(req.account.email || '').toLowerCase()) >= 0);
    if (isAdmin) {
      s.recent = (await account.listRecent(100)).map((u) => ({ id: u.id, email: u.email, nombre: u.nombre, credits: u.credits, created_at: u.created_at }));
    }
    res.json(s);
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'stats_error', error: e.message }));
    err(res, 500, 'stats failed');
  }
});

// Admin: grant credits to an email (creates the account if missing). Gated to an
// admin caller (ECPF_ADMIN_KEY or an admin-email session).
router.post('/admin-grant', optionalAccount, async (req, res) => {
  try {
    const adminKey = process.env.ECPF_ADMIN_KEY;
    const provided = req.headers['x-admin-key'] || (req.body && req.body.key);
    const isAdmin = (adminKey && provided === adminKey) ||
      (req.account && ADMIN_EMAILS.indexOf(String(req.account.email || '').toLowerCase()) >= 0);
    if (!isAdmin) return err(res, 403, 'admin only');
    const b = req.body || {};
    const n = parseInt(b.credits, 10);
    if (!b.email || !EMAIL_RE.test(String(b.email))) return err(res, 400, 'valid email required');
    if (!Number.isInteger(n) || n <= 0) return err(res, 400, 'positive credits required');
    let u = await account.findByEmail(b.email);
    let created = false;
    if (!u) {
      const hash = await bcrypt.hash(String(b.password || 'EquiMindDemo2026!'), 10);
      u = await account.createUser({ email: b.email, password_hash: hash, nombre: b.nombre || null, credits: 0 });
      created = true;
    }
    const balance = await account.addCredits(u.id, n, { kind: 'bonus', description: 'admin grant' });
    console.log(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'admin_grant', user_id: u.id, credits: n, created }));
    res.json({ email: u.email, credits: balance, added: n, created });
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'admin_grant_error', error: e.message }));
    err(res, 500, 'grant failed');
  }
});

// ---- Credits --------------------------------------------------------------
router.get('/credits/balance', requireAccount, async (req, res) => {
  res.json({ credits: await account.getBalance(req.accountId) });
});

router.get('/credits/packages', (req, res) => res.json({ credit_price_usd: CREDIT_PRICE, packages: packages() }));

router.get('/credits/tx', requireAccount, async (req, res) => {
  res.json(await account.listTx(req.accountId, 100));
});

// Crea el PaymentIntent y devuelve el client_secret para Stripe Elements.
router.post('/credits/create-intent', requireAccount, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return err(res, 503, 'payments not configured');
    const amount = parseInt((req.body || {}).amount, 10);
    if (!PACKAGE_AMOUNTS.includes(amount)) return err(res, 400, 'invalid amount (10,20,40,60,80,100)');
    const credits = creditsFor(amount);
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const pi = await stripe.paymentIntents.create({
      amount: amount * 100, currency: 'usd', payment_method_types: ['card'],
      description: `ECPF ${credits} créditos`,
      metadata: { app: 'ecpf_caballo', user_id: String(req.accountId), email: req.account.email, credits: String(credits), amount: String(amount) }
    });
    res.json({ client_secret: pi.client_secret, payment_intent_id: pi.id, amount, credits });
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'create_intent_error', error: e.message }));
    err(res, 500, 'could not start payment');
  }
});

// Confirma tras el pago en el cliente: verifica el PI y acredita (idempotente).
router.post('/credits/confirm', requireAccount, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return err(res, 503, 'payments not configured');
    const piId = (req.body || {}).payment_intent_id;
    if (!piId) return err(res, 400, 'payment_intent_id required');
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (!pi || pi.status !== 'succeeded') return err(res, 402, 'payment not completed');
    if (String(pi.metadata.user_id) !== String(req.accountId)) return err(res, 403, 'payment does not belong to this account');
    if (await account.paymentAlreadyCredited(piId)) {
      return res.json({ credits: await account.getBalance(req.accountId), already: true });
    }
    const credits = parseInt(pi.metadata.credits, 10) || creditsFor(pi.amount / 100);
    const balance = await account.addCredits(req.accountId, credits, { kind: 'purchase', dollars: pi.amount / 100, payment_intent: piId, description: `Recarga ${credits} créditos` });
    res.json({ credits: balance, added: credits });
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'confirm_error', error: e.message }));
    err(res, 500, 'could not confirm payment');
  }
});

// Webhook de Stripe (raw body montado en index.js). Acredita de forma idempotente.
router.post('/credits/webhook', async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    let event;
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (whSecret) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, whSecret);
    } else {
      event = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(req.body.toString('utf8'));
    }
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      if (pi.metadata && pi.metadata.app === 'ecpf_caballo' && !(await account.paymentAlreadyCredited(pi.id))) {
        const credits = parseInt(pi.metadata.credits, 10) || creditsFor(pi.amount / 100);
        await account.addCredits(pi.metadata.user_id, credits, { kind: 'purchase', dollars: pi.amount / 100, payment_intent: pi.id, description: `Recarga ${credits} créditos (webhook)` });
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error(JSON.stringify({ svc: 'evaluacion-del-caballo-de-paso-fino', event: 'webhook_error', error: e.message }));
    res.status(400).json({ error: e.message });
  }
});

// Concesión de créditos SOLO para pruebas (SIT). Gated por env; 403 en prod.
router.post('/credits/test-grant', requireAccount, async (req, res) => {
  if (process.env.ECPF_TEST_CREDITS !== '1') return err(res, 403, 'disabled');
  const n = parseInt((req.body || {}).credits, 10) || 10;
  const balance = await account.addCredits(req.accountId, n, { kind: 'bonus', description: 'test grant' });
  res.json({ credits: balance });
});

module.exports = router;
module.exports.requireAccount = requireAccount;
module.exports.optionalAccount = optionalAccount;
