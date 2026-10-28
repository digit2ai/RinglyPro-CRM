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
const fin = require('../services/saludFinanciera/finanzas');
const store = require('../services/saludFinanciera/store');
const lina = require('../services/saludFinanciera/lina');
const cerebro = require('../services/saludFinanciera/cerebro');
const { toCents, fmt } = require('../services/saludFinanciera/money');
const alarmas = require('../services/saludFinanciera/alarmas');

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

// Bank of America via Plaid (READ-ONLY). Same owner gate as everything above.
router.use('/plaid', require('./saludFinancieraPlaid').ownerRouter(deps));

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

// Real personal spending this month, and how it moves the projected low point
// (the same projection re-run without those rows — a measured effect, not an estimate).
function gastoPersonalMes(rows, opts, a) {
  const ym = a.today.slice(0, 7);
  const delMes = rows.filter(r => r.origen === 'real' && r.tipo === 'egreso' && r.categoria === 'gasto_personal' && r.fecha.slice(0, 7) === ym);
  const total = delMes.reduce((x, r) => x + toCents(r.monto), 0);
  const sin = delMes.length ? engine.analyze(rows.filter(r => !delMes.includes(r)), opts) : a;
  return { mes: ym, nombre: engine.MESES[Number(ym.slice(5, 7)) - 1], gastado: fmt(total), movimientos: delMes.length,
    saldo_min: fmt(a.saldo_min), fecha_min: a.fecha_min, saldo_min_sin_gastos: fmt(sin.saldo_min), baja_el_minimo: fmt(sin.saldo_min - a.saldo_min) };
}

// Figures for the G1000-style instrument panel — every one read off the engine's
// ledger (dollars as numbers for positioning, plus the formatted string to print).
function instrumentos(a, rows) {
  const d = (c) => ({ v: Math.round(c) / 100, t: fmt(c) });
  const en = (n) => engine.addDays(a.today, n);
  const tramo = (n) => a.steps.filter(s => s.row.fecha > a.today && s.row.fecha <= en(n) && s.amount !== 0);
  const t30 = tramo(30);
  const entra = t30.filter(s => s.row.tipo === 'ingreso').reduce((x, s) => x + s.amount, 0);
  const sale = t30.filter(s => s.row.tipo === 'egreso').reduce((x, s) => x + s.amount, 0);
  const s7 = fin.balanceAt(a.serie.proyeccion, en(7)).saldo, s14 = fin.balanceAt(a.serie.proyeccion, en(14)).saldo, s30 = fin.balanceAt(a.serie.proyeccion, en(30)).saldo;
  const ym = a.today.slice(0, 7);
  // PERSONAL (owner 2026-10-26): every bank outflow this month that is NOT in the plan. A bank charge that matches
  // a plan row only marks that row cumplido and never lands here; moves between his own accounts are not spending.
  const PROPIA = /online banking transfer|zelle payment (to|from) manuel stagg|zelle payment from digit2ai/i;
  const bankRows = rows.filter(r => r.fuente === 'plaid' && r.origen === 'real' && r.tipo === 'egreso' && r.fecha.slice(0, 7) === ym && r.fecha <= a.today && !PROPIA.test(r.concepto || ''));
  const gastoMes = bankRows.reduce((x, r) => x + toCents(r.monto), 0);
  const prox = a.proximo_pago;
  // what has gone out this month so far: every outflow from the 1st up to and including today
  const delMes = (tipo) => a.steps.filter(s => s.row.tipo === tipo && s.row.fecha >= ym + '-01' && s.row.fecha <= a.today).reduce((x, s) => x + s.amount, 0);
  const costoMes = delMes('egreso'), ingresoMes = delMes('ingreso');
  // every outflow from today that leaves the balance below zero, in ledger order (the panel's "en negativo" box)
  const neg = a.steps.filter(s => s.row.fecha >= a.today && s.row.tipo === 'egreso' && s.amount !== 0 && s.saldo < 0);
  const enNegativo = neg.map(s => ({ fecha: s.row.fecha, concepto: s.row.concepto, monto: fmt(-s.amount), saldo: fmt(s.saldo), minimo: s.row.fecha === a.fecha_min && s.saldo === a.saldo_min }));
  return {
    en_negativo: enNegativo,
    // plan payments still to make today (and any earlier one never marked done): the "Pagos de hoy" card
    pagos_hoy: rows.filter(r => r.tipo === 'egreso' && r.origen === 'plan' && r.estado !== 'cumplido' && r.fecha <= a.today)
      .sort((x, y) => x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : x.id - y.id)
      .map(r => ({ id: r.id, fecha: r.fecha, concepto: r.concepto, monto: fmt(-toCents(r.monto)), vencido: r.fecha < a.today,
        row: { id: r.id, fecha: r.fecha, tipo: r.tipo, categoria: r.categoria, concepto: r.concepto, monto: r.monto, origen: r.origen, estado: r.estado, monto_real: r.monto_real } })),
    costo_mes: d(costoMes), ingreso_mes: d(ingresoMes),
    saldo_hoy: d(a.saldo_hoy), saldo_min: d(a.saldo_min), fecha_min: a.fecha_min, saldo_final: d(a.saldo_final), saldo_final_plan: d(a.saldo_final_plan),
    entra_30: d(entra), sale_30: d(sale), flujo_30: d(entra - sale), saldo_7d: d(s7), saldo_14d: d(s14),
    // owner 2026-10-26: closing balance of each quarter of NEXT year (Q1..Q4), from the projection
    trimestres_prox: (() => { const y = Number(a.today.slice(0, 4)) + 1; return ['03-31', '06-30', '09-30', '12-31'].map((md, i) => ({ q: 'Q' + (i + 1), anio: y, saldo: d(fin.balanceAt(a.serie.proyeccion, y + '-' + md).saldo) })); })(), cambio_7d: d(s7 - a.saldo_hoy), saldo_30d: d(s30), cambio_30d: d(s30 - a.saldo_hoy),
    desvio_plan: d(a.saldo_final - a.saldo_final_plan), gasto_mes: d(gastoMes), gasto_mes_ids: bankRows.map(r => r.id), gasto_mes_n: bankRows.length,
    proximo_pago: prox ? { concepto: prox.concepto, fecha: prox.fecha, monto: fmt(prox.monto), dias: Math.round((Date.parse(prox.fecha) - Date.parse(a.today)) / 864e5), cubierto: prox.cubierto } : null
  };
}

// Projected closing balance of a month (projection and plan base).
function cierre(a, ym) {
  const r = fin.resumenMes(a, ym);
  const plan = fin.balanceAt(a.serie.plan, r.hasta).saldo;
  return { mes: ym, nombre: engine.MESES[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4), hasta: r.hasta, saldo: fmt(r.saldo_fin), saldo_plan: fmt(plan), sobre_plan: r.saldo_fin >= plan };
}

// STALL warning (owner 2026-10-28): bank anomalies + plan risks, fixed rules in alarmas.js. A failure here never breaks /salud.
async function revisarAlarmas(req, a, resumen) {
  try {
    const q = (sql, r) => deps.sequelize.query(sql, { replacements: { u: req.sf.userId, t: req.sf.tenantId, ...(r || {}) } }).then(x => x[0]);
    const [txns, alertas, items, cuentas, cfg, rec] = await Promise.all([
      q(`SELECT x.id, x.fecha, x.nombre, x.comercio, x.monto_cents, x.pending, x.enlace FROM sf_plaid_txn x
           JOIN sf_plaid_accounts c ON c.account_id = x.account_id AND c.user_id = x.user_id AND c.tenant_id = x.tenant_id AND c.incluir
          WHERE x.user_id = :u AND x.tenant_id = :t AND x.fecha >= :d`, { d: engine.addDays(a.today, -400) }).catch(() => []),
      q('SELECT id, tipo, texto, leida FROM sf_alertas WHERE user_id = :u AND tenant_id = :t AND NOT leida ORDER BY id DESC LIMIT 50').catch(() => []),
      q("SELECT id, institution_name, estado FROM sf_plaid_items WHERE user_id = :u AND tenant_id = :t AND estado <> 'desconectado'").catch(() => []),
      q('SELECT mask, incluir, saldo_actual::text AS saldo_actual, saldo_disponible::text AS saldo_disponible FROM sf_plaid_accounts WHERE user_id = :u AND tenant_id = :t').catch(() => []),
      q('SELECT alarmas_vistas FROM sf_config WHERE user_id = :u AND tenant_id = :t').catch(() => []),
      q('SELECT direccion, descripcion, comercio, frecuencia, activo, monto_ultimo::text AS monto_ultimo, monto_promedio::text AS monto_promedio, proxima_fecha::text AS proxima_fecha, categoria FROM sf_plaid_recurrentes WHERE user_id = :u AND tenant_id = :t').catch(() => [])
    ]);
    const vistas = cfg[0] && Array.isArray(cfg[0].alarmas_vistas) ? cfg[0].alarmas_vistas : [];
    return alarmas.revisar({ hoy: a.today, txns, alertas, items, cuentas, vistas, recurrentes: alarmas.distintos(rec),
      dias_negativos: resumen.dias_negativos || [], obligaciones_descubiertas: resumen.obligaciones_descubiertas || [] });
  } catch (e) { return [{ nivel: 'caution', clave: 'error', titulo: 'No pude revisar el banco', detalle: e.message }]; }
}

router.post('/alarmas/visto', async (req, res) => {
  try {
    const clave = String((req.body && req.body.clave) || '').slice(0, 120);
    if (!clave) return res.status(400).json({ success: false, error: 'clave requerida' });
    const r = { u: req.sf.userId, t: req.sf.tenantId };
    const [[row]] = await deps.sequelize.query('SELECT alarmas_vistas FROM sf_config WHERE user_id = :u AND tenant_id = :t', { replacements: r });
    const vistas = (row && Array.isArray(row.alarmas_vistas) ? row.alarmas_vistas : []).filter(x => x !== clave).concat([clave]).slice(-300);
    await deps.sequelize.query('UPDATE sf_config SET alarmas_vistas = CAST(:v AS JSONB) WHERE user_id = :u AND tenant_id = :t', { replacements: { ...r, v: JSON.stringify(vistas) } });
    const m = clave.match(/^alerta:(\d+)$/);
    if (m) await deps.sequelize.query('UPDATE sf_alertas SET leida = TRUE WHERE id = :id AND user_id = :u AND tenant_id = :t', { replacements: { ...r, id: Number(m[1]) } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/acceso', (req, res) => res.json({ success: true, ok: true }));

router.get('/salud', async (req, res) => {
  try {
    const { rows, opts } = await context(req);
    const a = engine.analyze(rows, opts);
    const resumen = engine.publicSummary(a);
    res.set('Cache-Control', 'no-store').json({
      success: true,
      ...resumen,
      alarmas: await revisarAlarmas(req, a, resumen),
      cierre_mes_actual: cierre(a, a.today.slice(0, 7)),
      gasto_personal_mes: gastoPersonalMes(rows, opts, a),
      pfd: instrumentos(a, rows),
      // projected low point of every month from now to the end of the plan (for the month/year selector)
      minimos_mes: (() => { const out = []; const last = a.serie.proyeccion.length ? a.serie.proyeccion[a.serie.proyeccion.length - 1].fecha.slice(0, 7) : a.today.slice(0, 7); let ym = a.today.slice(0, 7);
        while (ym <= last && out.length < 60) { const r = fin.resumenMes(a, ym); out.push({ mes: ym, nombre: engine.MESES[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4), minimo: fmt(r.minimo), fecha: r.fecha_minimo, negativo: r.minimo < 0 });
          const [y, m] = ym.split('-').map(Number); ym = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); } return out; })(),
      cierre_fin_de_ano: cierre(a, a.today.slice(0, 4) + '-12'),
      // the closes of the months of the CURRENT QUARTER (owner request 2026-10-25: Q4 = octubre, noviembre, diciembre)
      cierres_trimestre: (() => { const [y, m] = a.today.slice(0, 7).split('-').map(Number); const q0 = Math.floor((m - 1) / 3) * 3; return [1, 2, 3].map(k => cierre(a, y + '-' + String(q0 + k).padStart(2, '0'))); })(),
      cierres_proximos: [1, 2, 3].map(k => { const [y, m] = a.today.slice(0, 7).split('-').map(Number); return cierre(a, new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7)); }),
      cierre_ultimo_mes: a.serie.proyeccion.length ? cierre(a, a.serie.proyeccion[a.serie.proyeccion.length - 1].fecha.slice(0, 7)) : null,
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
    const recs = await store.recurrentes(deps.sequelize, req.sf);
    const plan = engine.extendPlan(rows, meses, recs);
    const t = await deps.sequelize.transaction();
    try {
      for (const r of plan.nuevos) await store.insertRow(deps.sequelize, req.sf, r, t);
      await t.commit();
    } catch (e) { await t.rollback(); throw e; }
    res.json({ success: true, desde: plan.desde, hasta: plan.hasta, creados: plan.nuevos.length, nuevos: plan.nuevos });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- Monthly recurring items (bills) ----
// Creating one projects it at once, from today to the end of the plan's last
// month; 'Extender plan' keeps adding it. Deactivating removes only its future
// pending rows.
function lastPlanMonthEnd(rows) {
  const plan = rows.filter(r => r.origen === 'plan');
  if (!plan.length) return null;
  const last = plan.reduce((m, r) => (r.fecha > m ? r.fecha : m), plan[0].fecha);
  const [y, m] = last.split('-').map(Number);
  return engine.lastDayOfMonth(y, m);
}

router.get('/recurrentes', async (req, res) => {
  try { res.json({ success: true, data: await store.recurrentes(deps.sequelize, req.sf) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/recurrentes', async (req, res) => {
  try {
    const b = req.body || {};
    const concepto = String(b.concepto || '').trim().slice(0, 200);
    const monto = toCents(b.monto);
    const tipo = b.tipo === 'ingreso' ? 'ingreso' : 'egreso';
    const categoria = engine.CATEGORIAS.includes(b.categoria) ? b.categoria : (tipo === 'ingreso' ? 'ingreso_extra' : 'servicios');
    const fin_de_mes = b.fin_de_mes === true || b.dia === 'fin';
    const dia = fin_de_mes ? null : parseInt(b.dia, 10);
    if (!concepto) return res.status(400).json({ success: false, error: 'concepto requerido' });
    if (monto == null || monto <= 0) return res.status(400).json({ success: false, error: 'monto debe ser positivo' });
    if (!fin_de_mes && !(dia >= 1 && dia <= 31)) return res.status(400).json({ success: false, error: "dia 1-31 o 'fin'" });
    const rec = await store.insertRecurrente(deps.sequelize, req.sf, { concepto, tipo, monto: (monto / 100).toFixed(2), categoria, dia, fin_de_mes });
    const { rows, opts } = await context(req);
    const nuevos = engine.recurrentRows(rows, [rec], opts.today, lastPlanMonthEnd(rows));
    const t = await deps.sequelize.transaction();
    try { for (const r of nuevos) await store.insertRow(deps.sequelize, req.sf, r, t); await t.commit(); }
    catch (e) { await t.rollback(); throw e; }
    res.status(201).json({ success: true, data: rec, proyectados: nuevos.length, fechas: nuevos.map(n => n.fecha) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/recurrentes/:id(\\d+)', async (req, res) => {
  try {
    const r = await store.desactivarRecurrente(deps.sequelize, req.sf, Number(req.params.id), deps.today());
    if (!r) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true, concepto: r.concepto, borrados: r.borrados });
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
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 45000, maxRetries: 1 });
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

// What the owner sees under Lina: is the brain on, and if not, why.
const brainStatus = { ultimo_ok: null, ultimo_error: null, ultimo_error_at: null };
const MODEL = () => process.env.SALUD_FINANCIERA_MODEL || 'claude-sonnet-5';
router.get('/lina/estado', (req, res) => {
  let habilitado = false;
  try { habilitado = require('../../../src/config/anthropic-flags').anthropicEnabled('salud_financiera'); } catch (e) {}
  const activo = !!modelClient();
  res.json({ success: true, cerebro: activo ? 'claude' : 'reglas', modelo: cerebro.modeloActivo() || MODEL(), llave: !!process.env.ANTHROPIC_API_KEY, habilitado,
    ultimo_ok: brainStatus.ultimo_ok, ultimo_error: brainStatus.ultimo_error, ultimo_error_at: brainStatus.ultimo_error_at });
});

router.post('/lina', async (req, res) => {
  try {
    const pregunta = String((req.body || {}).pregunta || '').trim().slice(0, 1000);
    const canal = (req.body || {}).canal === 'voz' ? 'voz' : 'texto';
    if (!pregunta) return res.status(400).json({ success: false, error: 'pregunta requerida' });
    if (linaLimited(req.sf.userId)) return res.status(429).json({ success: false, error: 'Demasiadas preguntas seguidas. Espera un momento.' });
    const { rows, opts } = await context(req);
    const state = await store.getState(deps.sequelize, req.sf);
    const client = modelClient();
    // Conversation memory comes from the server, not the page.
    const historial = (await store.conversations(deps.sequelize, req.sf, 8)).flatMap(c => [{ rol: 'yo', texto: c.pregunta }, { rol: 'lina', texto: c.respuesta }]);

    // A pending "sí/no" from the rule reader is still honoured first.
    const pendienteActivo = state.pendiente && /^(si|sí|no|dale|ok|confirmo|cancela)(?=$|[\s,.!¡?])/i.test(pregunta.trim()); // \b fails after "í"
    if (client && !pendienteActivo) {
      let b = null, motivo = null;
      try {
        b = await cerebro.responder({ client, model: MODEL(), ctx: { sequelize: deps.sequelize, user: req.sf, today: opts.today, opts }, pregunta, historial });
      } catch (e) { motivo = 'modelo no disponible: ' + String(e.message || e).slice(0, 200); }
      if (b && (b.texto || b.cambios.length)) {
        const texto = b.texto || cerebro.textoDeCambios(b.cambios);
        brainStatus.ultimo_ok = new Date().toISOString();
        if (state.pendiente) await store.setState(deps.sequelize, req.sf, { pendiente: null, contexto: state.contexto });
        await store.logConversation(deps.sequelize, req.sf, pregunta, texto, canal, b.texto ? 'claude' : 'claude-cambios', { herramientas: b.herramientas, verificado: b.verificado, motivo: b.motivo || null });
        return res.json({ success: true, texto, cambios: b.cambios, cambio: b.cambios.length ? { accion: b.cambios[b.cambios.length - 1].accion } : null, propuesta: null, pendiente: false,
          intent: 'cerebro', composed_by: 'claude', is_simulated: false, motivo_respaldo: null, audio: { endpoint: '/api/tts/edge', voice: 'lina', text: texto } });
      }
      motivo = motivo || (b && b.motivo) || 'sin respuesta';
      brainStatus.ultimo_error = motivo; brainStatus.ultimo_error_at = new Date().toISOString();
      req._sfMotivo = motivo;
    }
    const out = await lina.answer(pregunta, rows, opts, { historial, client: null, state: { ...state, preferencias: await store.preferencias(deps.sequelize, req.sf) } });
    if (client && req._sfMotivo) out.motivo_respaldo = req._sfMotivo;

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

    await store.logConversation(deps.sequelize, req.sf, pregunta, texto, canal, 'reglas', { motivo: out.motivo_respaldo || (client ? null : 'sin llave o desactivado') });
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
