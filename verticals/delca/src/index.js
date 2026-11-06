'use strict';
/**
 * del Calor al Sabor (Delca, Maracaibo) — landing that mirrors the printed menu,
 * Dalia (chat + voice) who explains the menu and takes orders, the products
 * table, and an orders/products admin. Mounted at /delca.
 *
 * RULES THAT MUST NOT REGRESS
 *  - The tenant comes from DELCA_TENANT_ID, never from a request.
 *  - Prices and totals come from dlc_products; a request never carries a price.
 *  - An order is written only by placeOrder(), reached from Dalia after the
 *    customer saw the summary of exactly that cart and said yes.
 *  - "Sent" on WhatsApp is recorded only when the provider accepted it.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { store, TENANT } = require('./store');
const dalia = require('./dalia');
const wa = require('./whatsapp');
const llm = require('./llm');
const { CATEGORIES, BRAND } = require('./menu');

const router = express.Router();
const PUBLIC = path.join(__dirname, '..', 'public');
const VERSION = '1';
let lastError = null;

let booted = null;
function boot() {
  if (!booted) booted = (async () => { await store().init(); await store().seed(TENANT()); return true; })()
    .catch((e) => { booted = null; lastError = String((e && e.message) || e); throw e; });
  return booted;
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ready = wrap(async (req, res, next) => { await boot(); next(); });

/* ---- small in-memory limits (per instance) ---- */
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const b = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  b.push(now); buckets.set(key, b);
  if (buckets.size > 5000) buckets.clear();
  return b.length > max;
}
const ipKey = (req) => crypto.createHash('sha256').update(String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || '')).digest('hex').slice(0, 24);
const SID = /^[a-f0-9]{32}$/;

/* one turn at a time per session */
const locks = new Map();
function withLock(sid, fn) {
  const prev = locks.get(sid) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(sid, next.catch(() => {}));
  next.finally(() => { if (locks.get(sid) === next) locks.delete(sid); }).catch(() => {});
  return next;
}

/* ---------------- pages ---------------- */
function page(file) {
  return (req, res) => {
    const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8').replace(/\{\{BASE\}\}/g, req.baseUrl || '').replace(/\{\{VERSION\}\}/g, VERSION);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  };
}
router.get('/', page('index.html'));
router.get('/admin', (req, res, next) => { res.set('X-Robots-Tag', 'noindex'); next(); }, page('admin.html'));
router.get(['/index.html', '/admin.html'], (req, res) => res.redirect(301, (req.baseUrl || '') + (req.path === '/admin.html' ? '/admin' : '/')));
router.use(express.static(PUBLIC, { index: false, maxAge: '1h' }));
router.use('/api', express.json({ limit: '32kb' }));

/* ---------------- health ---------------- */
router.get('/health', wrap(async (req, res) => {
  let ok = false; try { await boot(); ok = true; } catch (e) { /* reported */ }
  res.json({ ok, service: 'delca', store: store().backend, ai: llm.enabled() ? 'model' : 'heuristic', model: llm.enabled() ? llm.MODEL() : null,
    whatsapp: wa.provider() || 'not_configured', restaurant_whatsapp: !!wa.restaurantLink('x'), admin: adminConfigured() ? 'configured' : 'closed',
    error: ok ? null : 'store unavailable' });
}));

/* ---------------- public API ---------------- */
router.get('/api/v1/menu', ready, wrap(async (req, res) => {
  const products = await store().products(TENANT());
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ brand: BRAND, categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, page: c.page, tone: c.tone, note: c.note || null })),
    products: products.map((p) => ({ code: p.code, category: p.category, name: p.name, description: p.description, price_cents: p.price_cents,
      price: dalia.fmt(p.price_cents), kind: p.kind, options: p.options || null, available: p.available !== false })) });
}));

router.post('/api/v1/session', (req, res) => res.json({ sid: crypto.randomBytes(16).toString('hex') }));

function view(state, catalog, extra) {
  const ls = dalia.lines(state, catalog);
  return Object.assign({ cart: { lines: ls.map((l) => ({ code: l.code, name: l.name, qty: l.qty, note: l.note, unit: dalia.fmt(l.unit_cents), line: dalia.fmt(l.line_cents) })),
    total: dalia.fmt(dalia.total(state, catalog)), total_cents: dalia.total(state, catalog) },
  customer: state.customer, awaiting: state.awaiting, order: state.order || null }, extra || {});
}

async function loadState(sid) { return (await store().getSession(TENANT(), sid)) || dalia.newState(); }

/** The ONLY door that writes an order. */
async function placeOrder(state, sid, catalog) {
  const t = TENANT();
  const ls = dalia.lines(state, catalog);
  const c = state.customer;
  if (limited('order:' + c.phone, 3, 60 * 60 * 1000)) throw Object.assign(new Error('Demasiados pedidos seguidos para ese número. Intenta en un rato.'), { status: 429 });
  const tot = dalia.total(state, catalog);
  const order = await store().createOrder(t, { session_id: await store().sessionId(t, sid), customer_name: c.name, customer_phone: c.phone, mode: c.mode,
    address: c.mode === 'delivery' ? c.address : null, total_cents: tot, currency: 'EUR', composed_by: llm.enabled() ? 'model' : 'heuristic' },
  ls.map((l) => ({ product_code: l.code, name: l.name, qty: l.qty, unit_price_cents: l.unit_cents, line_cents: l.line_cents, note: l.note })));
  const text = dalia.orderText(order, ls, c);
  const sent = await wa.send({ to: c.phone, text, template: [c.name, order.number, dalia.fmt(tot)] });
  await store().setOrder(t, order.id, { whatsapp_status: sent.status, whatsapp_detail: sent.detail || sent.id || null });
  // the restaurant's own line, if configured, gets the same text (best effort)
  const shop = String(process.env.DELCA_WHATSAPP_NUMBER || '').replace(/\D/g, '');
  if (shop.length >= 10 && wa.provider()) wa.send({ to: '+' + shop, text: 'NUEVO PEDIDO\n' + text }).catch(() => {});
  state.order = { number: order.number, id: order.id, total: dalia.fmt(tot), whatsapp: sent.status, wa_link: wa.restaurantLink(text) };
  state.awaiting = null;
  const waLine = sent.status === 'sent' ? `Te envié la confirmación por WhatsApp al ${c.phone}.`
    : sent.status === 'not_configured' ? 'La confirmación por WhatsApp todavía no está activada en este sistema; guarda este número de pedido.'
      : 'No pude enviarte la confirmación por WhatsApp; guarda este número de pedido.';
  return { reply: `¡Listo, ${c.name.split(' ')[0]}! Tu pedido ${order.number} quedó registrado por ${dalia.fmt(tot)}. ${waLine}`, whatsapp_status: sent.status };
}

async function turnFor(req, res, mutate) {
  const sid = String((req.body && req.body.sid) || '');
  if (!SID.test(sid)) return res.status(400).json({ error: 'sid inválido' });
  if (limited('chat:' + ipKey(req), 60, 10 * 60 * 1000)) return res.status(429).json({ error: 'Muchos mensajes seguidos. Espera un momento.' });
  return withLock(sid, async () => {
    const catalog = await store().products(TENANT());
    const state = await loadState(sid);
    try {
      const out = await mutate(state, catalog, sid);
      await store().saveSession(TENANT(), sid, state);
      res.json(view(state, catalog, out));
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });
}

router.post('/api/v1/chat', ready, wrap(async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'mensaje vacío' });
  if (text.length > 600) return res.status(400).json({ error: 'mensaje demasiado largo' });
  return turnFor(req, res, async (state, catalog, sid) => {
    const ctx = { placeOrder: (s) => placeOrder(s, sid, catalog) };
    const r = await dalia.turn(state, text, catalog, ctx);
    return { reply: r.reply, composed_by: r.composed_by, is_simulated: r.is_simulated, discarded: r.discarded_text || undefined };
  });
}));

router.post('/api/v1/cart', ready, wrap(async (req, res) => turnFor(req, res, async (state, catalog) => {
  if (state.order) return { reply: `Tu pedido ${state.order.number} ya está registrado. Di "nuevo pedido" para empezar otro.` };
  const code = String(req.body.code || '');
  // the summary hash is cleared by add/remove, so a later "sí" re-shows the new summary instead of placing
  const r = req.body.remove ? dalia.removeLine(state, code, req.body.qty) : dalia.addLine(state, catalog, code, req.body.qty || 1, req.body.note);
  if (!r.ok) return { reply: r.reason === 'unavailable' ? `${r.name} no está disponible hoy.` : 'Ese producto no está en el menú.' };
  return { reply: req.body.remove ? 'Listo, lo quité.' : `Anotado: ${r.qty} x ${r.name}.` };
})));

router.post('/api/v1/state', ready, wrap(async (req, res) => turnFor(req, res, async () => ({}))));

/* ---------------- admin (one key, fails shut) ---------------- */
function adminConfigured() { return String(process.env.DELCA_ADMIN_KEY || '').length >= 16; }
function requireAdmin(req, res, next) {
  if (!adminConfigured()) return res.status(503).json({ error: 'admin closed: set DELCA_ADMIN_KEY (16+ chars)' });
  const a = crypto.createHash('sha256').update(String(req.headers['x-delca-admin-key'] || '')).digest();
  const b = crypto.createHash('sha256').update(String(process.env.DELCA_ADMIN_KEY)).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(404).json({ error: 'not found' });
  if (limited('admin:' + ipKey(req), 300, 10 * 60 * 1000)) return res.status(429).json({ error: 'slow down' });
  res.set('Cache-Control', 'no-store');
  next();
}
router.get('/api/v1/admin/orders', ready, requireAdmin, wrap(async (req, res) => {
  res.json({ orders: await store().listOrders(TENANT(), parseInt(req.query.limit, 10) || 100) });
}));
const STATUSES = ['nuevo', 'preparando', 'en_camino', 'listo', 'entregado', 'cancelado'];
router.patch('/api/v1/admin/orders/:id', ready, requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(id > 0) || !STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'status: ' + STATUSES.join('|') });
  const o = await store().setOrder(TENANT(), id, { status: req.body.status });
  return o ? res.json({ order: o }) : res.status(404).json({ error: 'not found' });
}));
router.get('/api/v1/admin/products', ready, requireAdmin, wrap(async (req, res) => res.json({ products: await store().products(TENANT()) })));
router.patch('/api/v1/admin/products/:code', ready, requireAdmin, wrap(async (req, res) => {
  const patch = {};
  if (req.body.price != null) {
    const v = Number(String(req.body.price).replace(',', '.'));
    if (!(v >= 0 && v <= 1000)) return res.status(400).json({ error: 'precio inválido' });
    patch.price_cents = Math.round(v * 100);
  }
  if (req.body.available != null) patch.available = !!req.body.available;
  const p = await store().setProduct(TENANT(), String(req.params.code), patch);
  return p ? res.json({ product: p }) : res.status(404).json({ error: 'not found' });
}));

/* ---------------- errors ---------------- */
router.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  lastError = String((err && err.message) || err);
  console.error('[delca]', lastError);
  res.status(500).json({ error: 'Algo falló de nuestro lado. Intenta de nuevo.' });
});

router.lastError = () => lastError;
router._placeOrder = placeOrder;
module.exports = router;
