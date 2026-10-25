'use strict';
/**
 * Salud Financiera API — mounted at /projects/api/salud-financiera behind the
 * Hub's own authenticateToken (same login, same session). No session = 401.
 *
 * OWNER ONLY. The signed JWT must carry the owner's user id AND an allowed
 * email. Anyone else gets 404 (not 403: a 403 confirms the module exists).
 * Every query below is filtered by that user_id; nothing reads user_id from a
 * request body.
 */
const express = require('express');
const { sequelize } = require('../models');
const engine = require('../services/saludFinanciera/engine');
const store = require('../services/saludFinanciera/store');
const lina = require('../services/saludFinanciera/lina');
const { toCents, fmt } = require('../services/saludFinanciera/money');

const router = express.Router();

function ownerIds() {
  return String(process.env.SALUD_FINANCIERA_OWNER_USER_IDS || '97').split(',').map(s => Number(s.trim())).filter(Number.isInteger);
}
function ownerEmails() {
  return String(process.env.SALUD_FINANCIERA_OWNER_EMAILS || 'mstagg@digit2ai.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

// Injected by tests; production uses the real database and clock.
const deps = { sequelize, today: () => engine.todayNY(), modelClient: null };

function ownerOnly(req, res, next) {
  const u = req.user || {};
  const id = Number(u.userId);
  const email = String(u.email || '').toLowerCase();
  if (!Number.isInteger(id) || !ownerIds().includes(id) || !ownerEmails().includes(email)) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  req.sf = { userId: id, tenantId: Number(u.clientId) || 15 };
  next();
}

router.use(ownerOnly);
router.use(async (req, res, next) => {
  try {
    await store.ensure(deps.sequelize);
    await store.seedIfNeeded(deps.sequelize, req.sf);
    next();
  } catch (e) {
    console.error('[SaludFinanciera] init error:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo preparar el módulo' });
  }
});

async function context(req) {
  const rows = await store.list(deps.sequelize, req.sf);
  const cfg = await store.config(deps.sequelize, req.sf);
  const opts = { today: deps.today() };
  if (cfg) { opts.colchonCents = toCents(cfg.colchon_meta); opts.presupuestoCents = toCents(cfg.presupuesto_semanal); }
  return { rows, opts };
}

function withSaldo(rows, a) {
  const byId = new Map(a.steps.map(s => [String(s.row.id), s]));
  const minDay = a.fecha_min;
  return rows.map(r => {
    const s = byId.get(String(r.id));
    return { ...r, efectivo: s ? fmt(s.amount) : null, saldo: s ? fmt(s.saldo) : null, saldo_cents: s ? s.saldo : null,
      es_minimo: r.fecha === minDay, estado_visual: r.origen === 'real' ? 'real' : (r.estado === 'cumplido' ? 'cumplido' : 'plan') };
  });
}

router.get('/acceso', (req, res) => res.json({ success: true, ok: true }));

router.get('/salud', async (req, res) => {
  try {
    const { rows, opts } = await context(req);
    const a = engine.analyze(rows, opts);
    res.set('Cache-Control', 'no-store').json({
      success: true,
      ...engine.publicSummary(a),
      serie: { plan: a.serie.plan.map(d => ({ fecha: d.fecha, saldo: d.saldo / 100 })), proyeccion: a.serie.proyeccion.map(d => ({ fecha: d.fecha, saldo: d.saldo / 100 })) }
    });
  } catch (e) { console.error('[SaludFinanciera] salud', e); res.status(500).json({ success: false, error: e.message }); }
});

router.get('/movimientos', async (req, res) => {
  try {
    const { rows, opts } = await context(req);
    const a = engine.analyze(rows, opts);
    let out = withSaldo(rows, a);
    const { desde, hasta, categoria, mes } = req.query;
    if (mes && /^\d{4}-\d{2}$/.test(mes)) out = out.filter(r => r.fecha.slice(0, 7) === mes);
    if (desde && engine.isISO(desde)) out = out.filter(r => r.fecha >= desde);
    if (hasta && engine.isISO(hasta)) out = out.filter(r => r.fecha <= hasta);
    if (categoria && engine.CATEGORIAS.includes(categoria)) out = out.filter(r => r.categoria === categoria);
    const meses = [...new Set(rows.map(r => r.fecha.slice(0, 7)))].sort();
    res.set('Cache-Control', 'no-store').json({ success: true, data: out, meses, fecha_min: a.fecha_min });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// New movements from the dashboard (or a confirmed Lina proposal) are always 'real'.
router.post('/movimientos', async (req, res) => {
  try {
    const v = store.validate(req.body || {});
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    const row = await store.insertRow(deps.sequelize, req.sf, { ...v.value, origen: 'real' });
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.patch('/movimientos/:id(\\d+)', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cur = await store.get(deps.sequelize, req.sf, id);
    if (!cur) return res.status(404).json({ success: false, error: 'No encontrado' });
    const b = { ...(req.body || {}) };
    delete b.origen; delete b.user_id; delete b.tenant_id; delete b.id;
    const v = store.validate(b, { partial: true });
    if (v.error) return res.status(400).json({ success: false, error: v.error });
    if (cur.origen === 'real') { delete v.value.estado; delete v.value.monto_real; }
    if (v.value.estado === 'pendiente') v.value.monto_real = null;
    const row = await store.update(deps.sequelize, req.sf, id, v.value);
    res.json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/movimientos/:id(\\d+)', async (req, res) => {
  try {
    const ok = await store.remove(deps.sequelize, req.sf, Number(req.params.id));
    if (!ok) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/simular', async (req, res) => {
  try {
    const movs = Array.isArray(req.body && req.body.movimientos) ? req.body.movimientos.slice(0, 50) : null;
    if (!movs || !movs.length) return res.status(400).json({ success: false, error: 'movimientos[] requerido' });
    const { rows, opts } = await context(req);
    const { tools } = lina.makeTools(rows, opts);
    res.json({ success: true, ...tools.simular({ movimientos: movs }) });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/plan/extender', async (req, res) => {
  try {
    const meses = Math.max(1, Math.min(12, parseInt((req.body || {}).meses, 10) || 1));
    const { rows } = await context(req);
    const plan = engine.extendPlan(rows, meses);
    const t = await deps.sequelize.transaction();
    try {
      for (const r of plan.nuevos) await store.insertRow(deps.sequelize, req.sf, r, t);
      await t.commit();
    } catch (e) { await t.rollback(); throw e; }
    res.json({ success: true, desde: plan.desde, hasta: plan.hasta, creados: plan.nuevos.length, nuevos: plan.nuevos });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- Lina ----
const linaHits = new Map();
function linaLimited(userId) {
  const now = Date.now(); const w = 10 * 60 * 1000; const max = Number(process.env.SALUD_FINANCIERA_LINA_PER_10MIN || 40);
  const arr = (linaHits.get(userId) || []).filter(t => now - t < w);
  arr.push(now); linaHits.set(userId, arr);
  return arr.length > max;
}

function modelClient() {
  if (deps.modelClient !== null) return deps.modelClient || null;
  try {
    const { anthropicEnabled } = require('../../../src/config/anthropic-flags');
    if (!process.env.ANTHROPIC_API_KEY || !anthropicEnabled('salud_financiera')) return null;
    const Anthropic = require('@anthropic-ai/sdk');
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  } catch (e) { return null; }
}

// Executes a confirmed proposal with the same validation as POST/PATCH/DELETE.
async function executeProposal(req, p) {
  const id = Number(p.id);
  if (p.accion === 'agregar_movimiento') {
    const v = store.validate(p.datos || {});
    if (v.error) return { error: v.error };
    const row = await store.insertRow(deps.sequelize, req.sf, { ...v.value, origen: 'real' });
    return { id: row.id };
  }
  const cur = Number.isInteger(id) ? await store.get(deps.sequelize, req.sf, id) : null;
  if (!cur) return { error: 'ese movimiento ya no existe' };
  if (p.accion === 'borrar') {
    if (cur.origen !== 'real') return { error: 'los movimientos del plan no se borran desde la conversación' };
    await store.remove(deps.sequelize, req.sf, id); return { id };
  }
  if (p.accion === 'marcar_cumplido') {
    if (cur.origen !== 'plan') return { error: 'solo los movimientos del plan se marcan como cumplidos' };
    const v = store.validate({ estado: 'cumplido', monto_real: p.datos && p.datos.monto_real != null ? p.datos.monto_real : cur.monto }, { partial: true });
    if (v.error) return { error: v.error };
    await store.update(deps.sequelize, req.sf, id, v.value); return { id };
  }
  if (p.accion === 'editar') {
    const v = store.validate({ monto: p.datos && p.datos.monto }, { partial: true });
    if (v.error) return { error: v.error };
    await store.update(deps.sequelize, req.sf, id, v.value); return { id };
  }
  return { error: 'acción desconocida' };
}

router.post('/lina', async (req, res) => {
  try {
    const pregunta = String((req.body || {}).pregunta || '').trim().slice(0, 1000);
    const canal = (req.body || {}).canal === 'voz' ? 'voz' : 'texto';
    if (!pregunta) return res.status(400).json({ success: false, error: 'pregunta requerida' });
    if (linaLimited(req.sf.userId)) return res.status(429).json({ success: false, error: 'Demasiadas preguntas seguidas. Espera un momento.' });
    const historial = Array.isArray(req.body.historial) ? req.body.historial.slice(-6) : [];
    const { rows, opts } = await context(req);
    const state = await store.getState(deps.sequelize, req.sf);
    const client = modelClient();
    const out = await lina.answer(pregunta, rows, opts, { historial, client, state, model: process.env.SALUD_FINANCIERA_MODEL || 'claude-haiku-4-5-20251001' });

    let texto = out.texto, cambio = null, pendiente = state.pendiente;
    if (out.ejecutar) {
      // The owner said "sí" to a pending change: write it through the same
      // validation the REST endpoints use, then explain the before/after.
      const r = await executeProposal(req, out.ejecutar);
      pendiente = null;
      if (r.error) texto = `No pude hacerlo: ${r.error}`;
      else {
        const after = await context(req);
        const antes = engine.analyze(rows, opts), despues = engine.analyze(after.rows, after.opts);
        texto = lina.explicarCambio(out.ejecutar, antes, despues, (out.contexto || {}).fecha || null);
        cambio = { accion: out.ejecutar.accion, id: r.id };
      }
    } else if (out.limpiar_pendiente) pendiente = null;
    else if (out.propuesta) pendiente = out.propuesta;
    else if (state.pendiente && !out.propuesta) pendiente = null; // the owner moved on: the old question lapses
    await store.setState(deps.sequelize, req.sf, { pendiente, contexto: out.contexto || state.contexto });

    await store.logConversation(deps.sequelize, req.sf, pregunta, texto, canal);
    res.json({ success: true, texto, propuesta: out.propuesta && !out.propuesta.falta ? out.propuesta : null, pendiente: !!pendiente, cambio,
      intent: out.intent, composed_by: out.composed_by, is_simulated: !!out.is_simulated, motivo_respaldo: out.motivo_respaldo || null,
      audio: { endpoint: '/api/tts/edge', voice: 'lina', text: texto } });
  } catch (e) { console.error('[SaludFinanciera] lina', e); res.status(500).json({ success: false, error: e.message }); }
});

router.get('/lina/historial', async (req, res) => {
  try { res.json({ success: true, data: await store.conversations(deps.sequelize, req.sf, Number(req.query.limit) || 20) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
module.exports._deps = deps;
module.exports._ownerOnly = ownerOnly;
