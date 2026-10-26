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
const verifier = require('../services/saludFinanciera/plaidWebhook');
const store = require('../services/saludFinanciera/store');

function later(fn) { setImmediate(() => { Promise.resolve().then(fn).catch(e => console.error('[SaludFinanciera/Plaid]', e.code || e.message)); }); }
function plaidError(res, e) {
  const status = e && e.code === 'VAULT_UNREADABLE' ? 409 : 502;
  return res.status(status).json({ success: false, error: (e && e.message) ? String(e.message).slice(0, 300) : 'Error con Plaid', code: e && e.code });
}

function ownerRouter(deps) {
  const r = express.Router();

  r.get('/estado', async (req, res) => {
    try {
      const items = await sync.items(deps.sequelize, req.sf);
      const alertas = await sync.alertas(deps.sequelize, req.sf, true);
      const recurrentes = await sync.recurrentesDe(deps.sequelize, req.sf);
      res.json({ success: true, data: { configurado: plaid.configured(), falta: plaid.missing(), entorno: plaid.env(), items, alertas, recurrentes } });
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
    // one bank login is one Item: a second Connect would import everything twice (and burn a Trial slot)
    const ya = await sync.items(deps.sequelize, req.sf);
    const inst = req.body && req.body.institution && typeof req.body.institution.institution_id === 'string' ? req.body.institution.institution_id : null;
    if (ya.some(i => i.estado !== 'desconectado' && (!inst || !i.institution_id || i.institution_id === inst))) return res.status(409).json({ success: false, error: 'Ese banco ya está conectado. Usa "Reconectar" para renovar el permiso.' });
    const pt = req.body && req.body.public_token;
    if (typeof pt !== 'string' || !/^public-[a-z]+-[\w-]{8,}$/i.test(pt)) return res.status(400).json({ success: false, error: 'public_token inválido' });
    try {
      const item = await sync.connect(deps.sequelize, req.sf, pt, req.body.institution, deps.today());
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
      if (req.body && req.body.cuentas_nuevas) body.update = { account_selection_enabled: true };
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
      if (typeof (req.body || {}).incluir !== 'boolean') return res.status(400).json({ success: false, error: 'incluir debe ser true o false' });
      const out = await sync.setIncluir(deps.sequelize, req.sf, Number(req.params.id), req.body.incluir);
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
