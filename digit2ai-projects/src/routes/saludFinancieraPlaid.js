'use strict';
/**
 * Bank connection routes for Salud Financiera.
 *
 * ownerRouter(deps): mounted INSIDE the owner-only Salud Financiera router, so
 *   every route already passed authenticateToken + ownerOnly (404 for anyone else).
 *   No route ever returns or logs a bank access token.
 * webhookRouter(deps): PUBLIC, but useless without a valid Plaid signature
 *   (ES256 JWT + raw-body SHA-256, see services/saludFinanciera/plaidWebhook.js).
 *   It stores the event and answers 200 at once; processing happens after.
 */
const express = require('express');
const plaid = require('../services/saludFinanciera/plaidClient');
const sync = require('../services/saludFinanciera/plaidSync');
const reservaSvc = require('../services/saludFinanciera/reserva');
const verifier = require('../services/saludFinanciera/plaidWebhook');
const store = require('../services/saludFinanciera/store');

function later(fn) { setImmediate(() => { Promise.resolve().then(fn).catch(e => console.error('[SaludFinanciera/Plaid]', e.code || e.message)); }); }
function plaidError(res, e) {
  const status = e && e.code === 'VAULT_UNREADABLE' ? 409 : 502;
  return res.status(status).json({ success: false, error: (e && e.message) ? String(e.message).slice(0, 300) : 'Error con Plaid', code: e && e.code });
}

// Corte reserve: the account with rol 'corte' (••7485) must hold the next Corte + cushion; every payday says
// how much to keep there and how much can go to the 'gastos' account (••5122).
async function reservaCorte(deps, user, items, recurrentes) {
  const cuentas = items.filter(i => i.estado !== 'desconectado').flatMap(i => i.cuentas);
  const cc = cuentas.find(c => c.rol === 'corte');
  if (!cc) return { estado: 'sin_cuenta' };
  const gastos = cuentas.find(c => c.rol === 'gastos') || null;
  const hoy = deps.today();
  const q = (sql) => deps.sequelize.query(sql, { replacements: { u: user.userId, t: user.tenantId, hoy } }).then(r => r[0]);
  const cortes = await q("SELECT fecha::text AS fecha, monto::text AS monto FROM sf_movimientos WHERE user_id = :u AND tenant_id = :t AND origen = 'plan' AND categoria = 'corte' AND estado = 'pendiente' AND fecha >= :hoy ORDER BY fecha LIMIT 1");
  const pagos = await q("SELECT fecha::text AS fecha, monto::text AS monto FROM sf_movimientos WHERE user_id = :u AND tenant_id = :t AND origen = 'plan' AND categoria = 'salario' AND estado = 'pendiente' AND fecha >= :hoy ORDER BY fecha LIMIT 8");
  const [ult] = await q("SELECT MAX(monto_real)::text AS m FROM sf_movimientos WHERE user_id = :u AND tenant_id = :t AND origen = 'plan' AND categoria = 'corte' AND estado = 'cumplido'");
  const cents = (v) => v == null ? null : Math.round(Number(v) * 100);
  let corte = null;
  if (cortes[0]) {
    // the bank's real Corte (TFS $4,307.99) beats the plan's round number
    const real = Math.max(cents(ult && ult.m) || 0, ...recurrentes.filter(r => r.categoria === 'corte' && r.activo && r.direccion === 'salida').map(r => cents(r.monto_ultimo) || 0));
    corte = { fecha: cortes[0].fecha, montoCents: Math.max(cents(cortes[0].monto), real) };
  }
  const [cfg] = await q('SELECT colchon_corte::text AS c FROM sf_config WHERE user_id = :u AND tenant_id = :t');
  const saldo = cc.saldo_disponible != null ? cc.saldo_disponible : cc.saldo_actual;
  const r = reservaSvc.calcular({ hoy, saldoCents: cents(saldo), corte, pagos: pagos.map(p => ({ fecha: p.fecha, montoCents: cents(p.monto) })), colchonCents: cfg && cfg.c != null ? cents(cfg.c) : 20000 });
  return { ...r, cuenta: { mask: cc.mask, nombre: cc.nombre, saldo_at: cc.saldo_at }, gastos: gastos ? { mask: gastos.mask } : null };
}

function ownerRouter(deps) {
  const r = express.Router();

  r.get('/estado', async (req, res) => {
    try {
      const items = await sync.items(deps.sequelize, req.sf);
      const alertas = await sync.alertas(deps.sequelize, req.sf, true);
      const recurrentes = await sync.recurrentesDe(deps.sequelize, req.sf);
      let reserva = null;
      try { reserva = await reservaCorte(deps, req.sf, items, recurrentes); } catch (e) { reserva = { estado: 'error', error: e.message }; }
      res.json({ success: true, data: { configurado: plaid.configured(), falta: plaid.missing(), entorno: plaid.env(), items, alertas, recurrentes, recurrentes_distintos: require('../services/saludFinanciera/alarmas').distintos(recurrentes), reserva } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  r.post('/link-token', async (req, res) => {
    if (!plaid.configured()) return res.status(503).json({ success: false, error: 'Plaid no está configurado: falta ' + plaid.missing().join(', ') });
    try {
      const body = {
        client_name: 'Salud Financiera', language: (process.env.PLAID_LINK_LANGUAGE || 'en'), country_codes: ['US'],
        user: { client_user_id: 'sf-' + req.sf.userId },
        products: ['transactions'],            // READ-ONLY: transactions only. Never auth/transfer/identity/signal.
        transactions: { days_requested: 730 },  // owner decision 2026-10-26: maximum, set once at the first link
        webhook: plaid.webhookUrl()
      };
      if (process.env.PLAID_REDIRECT_URI) body.redirect_uri = process.env.PLAID_REDIRECT_URI;
      const out = await plaid.call('/link/token/create', body);
      res.json({ success: true, data: { link_token: out.link_token, expiration: out.expiration } });
    } catch (e) { plaidError(res, e); }
  });

  r.post('/exchange', async (req, res) => {
    if (!plaid.configured()) return res.status(503).json({ success: false, error: 'Plaid no está configurado' });
    const pt = req.body && req.body.public_token;
    if (typeof pt !== 'string' || !/^public-[a-z]+-[\w-]{8,}$/i.test(pt)) return res.status(400).json({ success: false, error: 'public_token inválido' });
    const ya = (await sync.items(deps.sequelize, req.sf)).filter(i => i.estado !== 'desconectado');
    const inst = req.body && req.body.institution && typeof req.body.institution.institution_id === 'string' ? req.body.institution.institution_id : null;
    const masks = Array.isArray(req.body && req.body.cuentas) ? req.body.cuentas.map(m => String(m || '').replace(/\D/g, '').slice(-4)).filter(Boolean) : null;
    // a second login at the same bank is allowed (e.g. the business login) as long as it brings DIFFERENT accounts;
    // the same account twice would import everything twice. Without the account list we stay strict.
    let repetida = false;
    if (masks && masks.length) {
      const ya4 = new Set(ya.flatMap(i => (i.cuentas || []).map(c => String(c.mask || ''))));
      repetida = masks.some(m => ya4.has(m));
    } else repetida = ya.some(i => !inst || !i.institution_id || i.institution_id === inst);
    if (repetida) {
      // Plaid already created the login when Link finished: remove it so it is not billed or left orphaned
      if (masks && masks.length) {
        try { const ex = await plaid.call('/item/public_token/exchange', { public_token: pt }); if (ex && ex.access_token) await plaid.call('/item/remove', { access_token: ex.access_token }); } catch (e) { /* best effort */ }
      }
      return res.status(409).json({ success: false, error: 'Esa cuenta ya está conectada. Usa "Reconectar" para renovar el permiso o "Agregar cuentas" para sumar otras del mismo usuario.' });
    }
    try {
      const item = await sync.connect(deps.sequelize, req.sf, pt, req.body.institution, deps.today(), { adicional: ya.length > 0 });
      // first sync starts the webhooks (Plaid sends SYNC_UPDATES_AVAILABLE only after one call)
      later(async () => { const full = await sync.itemWithToken(deps.sequelize, 'id = :id', { id: item.id }); await sync.syncItem(deps.sequelize, full, { today: deps.today() }); });
      res.status(201).json({ success: true, data: item });
    } catch (e) { plaidError(res, e); }
  });

  r.post('/update-token', async (req, res) => {
    if (!plaid.configured()) return res.status(503).json({ success: false, error: 'Plaid no está configurado' });
    try {
      const item = await sync.itemWithToken(deps.sequelize, 'id = :id AND user_id = :u AND tenant_id = :t', { id: Number(req.body && req.body.id), u: req.sf.userId, t: req.sf.tenantId });
      if (!item) return res.status(404).json({ success: false, error: 'No encontrado' });
      const body = { client_name: 'Salud Financiera', language: (process.env.PLAID_LINK_LANGUAGE || 'en'), country_codes: ['US'], user: { client_user_id: 'sf-' + req.sf.userId }, webhook: plaid.webhookUrl() };
      if (req.body && req.body.cuentas_nuevas === true) body.update = { account_selection_enabled: true };
      if (process.env.PLAID_REDIRECT_URI) body.redirect_uri = process.env.PLAID_REDIRECT_URI;
      // update mode: the existing access token, NO products -> same Item, no new Trial slot
      const out = await plaid.call('/link/token/create', body, { accessTokenEnc: item.access_token_enc });
      res.json({ success: true, data: { link_token: out.link_token, expiration: out.expiration } });
    } catch (e) { plaidError(res, e); }
  });

  r.post('/update-done', async (req, res) => {
    try {
      const item = await sync.itemWithToken(deps.sequelize, 'id = :id AND user_id = :u AND tenant_id = :t', { id: Number(req.body && req.body.id), u: req.sf.userId, t: req.sf.tenantId });
      if (!item) return res.status(404).json({ success: false, error: 'No encontrado' });
      await deps.sequelize.query("UPDATE sf_plaid_items SET estado = 'activo', ultimo_error = NULL, updated_at = NOW() WHERE id = :id", { replacements: { id: item.id } });
      await deps.sequelize.query("UPDATE sf_alertas SET leida = TRUE WHERE user_id = :u AND tenant_id = :t AND tipo IN ('reconectar','cuentas_nuevas')", { replacements: { u: req.sf.userId, t: req.sf.tenantId } });
      later(async () => { await sync.loadAccounts(deps.sequelize, item); await sync.refreshItemInfo(deps.sequelize, item); await sync.syncItem(deps.sequelize, item, { today: deps.today() }); });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  r.post('/sync', async (req, res) => {
    try {
      const all = await sync.items(deps.sequelize, req.sf);
      for (const it of all) {
        later(async () => {
          const full = await sync.itemWithToken(deps.sequelize, 'id = :id', { id: it.id });
          await sync.syncItem(deps.sequelize, full, { today: deps.today() });
          const fresh = await sync.itemWithToken(deps.sequelize, 'id = :id', { id: it.id });
          if (fresh.historial_completo) await sync.recurring(deps.sequelize, fresh, { today: deps.today() });
        });
      }
      res.status(202).json({ success: true, data: { iniciados: all.length } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  r.patch('/cuentas/:id(\\d+)', async (req, res) => {
    try {
      const b = req.body || {};
      if ('rol' in b) {
        if (![null, 'corte', 'gastos'].includes(b.rol)) return res.status(400).json({ success: false, error: 'rol debe ser corte, gastos o null' });
        const [[acct]] = await deps.sequelize.query('SELECT id FROM sf_plaid_accounts WHERE id = :id AND user_id = :u AND tenant_id = :t', { replacements: { id: Number(req.params.id), u: req.sf.userId, t: req.sf.tenantId } });
        if (!acct) return res.status(404).json({ success: false, error: 'No encontrado' });
        // one account per role
        if (b.rol) await deps.sequelize.query('UPDATE sf_plaid_accounts SET rol = NULL WHERE user_id = :u AND tenant_id = :t AND rol = :r', { replacements: { u: req.sf.userId, t: req.sf.tenantId, r: b.rol } });
        await deps.sequelize.query('UPDATE sf_plaid_accounts SET rol = :r WHERE id = :id', { replacements: { r: b.rol, id: acct.id } });
        if (typeof b.incluir !== 'boolean') return res.json({ success: true, data: { rol: b.rol } });
      }
      if (typeof b.incluir !== 'boolean') return res.status(400).json({ success: false, error: 'incluir debe ser true o false' });
      const out = await sync.setIncluir(deps.sequelize, req.sf, Number(req.params.id), b.incluir);
      if (!out) return res.status(404).json({ success: false, error: 'No encontrado' });
      res.json({ success: true, data: out });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  r.delete('/item/:id(\\d+)', async (req, res) => {
    try {
      const out = await sync.disconnect(deps.sequelize, req.sf, Number(req.params.id));
      if (!out) return res.status(404).json({ success: false, error: 'No encontrado' });
      res.json({ success: true, data: out });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  r.get('/alertas', async (req, res) => {
    try { res.json({ success: true, data: await sync.alertas(deps.sequelize, req.sf, false) }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });
  r.patch('/alertas/:id(\\d+)', async (req, res) => {
    try {
      const [rows] = await deps.sequelize.query('UPDATE sf_alertas SET leida = :l WHERE id = :id AND user_id = :u AND tenant_id = :t RETURNING id',
        { replacements: { l: (req.body || {}).leida !== false, id: Number(req.params.id), u: req.sf.userId, t: req.sf.tenantId } });
      if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // "apply to this merchant always": a manual category rule (beats the Plaid map)
  r.post('/regla', async (req, res) => {
    try {
      const { claveComercio } = require('../services/saludFinanciera/plaidCategorias');
      const engine = require('../services/saludFinanciera/engine');
      const b = req.body || {};
      if (!engine.CATEGORIAS.includes(b.categoria)) return res.status(400).json({ success: false, error: 'categoría inválida' });
      const mov = await store.get(deps.sequelize, req.sf, Number(b.movimiento_id));
      if (!mov || mov.fuente !== 'plaid') return res.status(404).json({ success: false, error: 'No encontrado' });
      const clave = claveComercio(mov.comercio || mov.concepto);
      await deps.sequelize.query(`INSERT INTO sf_categoria_reglas (tenant_id, user_id, clave, categoria) VALUES (:t, :u, :c, :cat)
        ON CONFLICT (user_id, clave) DO UPDATE SET categoria = EXCLUDED.categoria`, { replacements: { t: req.sf.tenantId, u: req.sf.userId, c: clave, cat: b.categoria } });
      // same normalised key as the rule itself, so "now" and "next sync" agree
      const [cands] = await deps.sequelize.query(`SELECT m.id, x.comercio, x.nombre FROM sf_movimientos m JOIN sf_plaid_txn x ON x.mov_id = m.id AND x.enlace = 'nuevo'
        WHERE m.user_id = :u AND m.tenant_id = :t AND m.fuente = 'plaid' AND NOT m.categoria_manual`, { replacements: { u: req.sf.userId, t: req.sf.tenantId } });
      const ids = cands.filter(c => claveComercio(c.comercio || c.nombre) === clave).map(c => c.id);
      if (ids.length) await deps.sequelize.query('UPDATE sf_movimientos SET categoria = :cat, updated_at = NOW() WHERE user_id = :u AND tenant_id = :t AND id IN (:ids)', { replacements: { cat: b.categoria, u: req.sf.userId, t: req.sf.tenantId, ids } });
      res.json({ success: true, data: { clave, actualizados: ids.length } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  return r;
}

function webhookRouter(deps) {
  const r = express.Router();
  // raw bytes: the signature covers the exact body. src/app.js also registers
  // express.raw for this path ABOVE the CRM's global JSON parser.
  const hits = new Map(); // ip -> [count, windowStart]  (in memory, per instance)
  r.post('/', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
    const ip = String(req.headers['cf-connecting-ip'] || req.ip || 'x');
    const now = Date.now(); const h = hits.get(ip) || [0, now];
    if (now - h[1] > 60000) { h[0] = 0; h[1] = now; }
    h[0]++; hits.set(ip, h); if (hits.size > 5000) hits.clear();
    if (h[0] > 120) return res.status(429).json({ error: 'too many requests' });
    const raw = Buffer.isBuffer(req.body) ? req.body : null;
    if (!raw) return res.status(400).json({ error: 'raw body required' });
    let v;
    try { v = await verifier.verify(raw, req.get('Plaid-Verification')); }
    catch (e) { return res.status(400).json({ error: 'invalid webhook' }); }
    try {
      await store.ensure(deps.sequelize);
      const stored = await sync.storeWebhook(deps.sequelize, v.body, v.dedupe);
      res.status(200).json({ received: true });
      if (stored) later(() => sync.processWebhook(deps.sequelize, stored.id, { today: deps.today() }));
    } catch (e) {
      // 5xx -> Plaid retries for 24 h
      if (!res.headersSent) res.status(500).json({ error: 'temporarily unavailable' });
    }
  });
  return r;
}

module.exports = { ownerRouter, webhookRouter };
