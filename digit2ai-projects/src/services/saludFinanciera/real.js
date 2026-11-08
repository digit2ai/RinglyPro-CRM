'use strict';
/**
 * REAL MODE (owner 2026-11-08): "if I fly this plane looking at the panel, I will crash".
 *
 * The panel shows only what IS: the bank's own available balance (Plaid, per account), the real
 * movements already recorded, and what is still to be paid. The financial plan stays in the database
 * as reference but is never projected and never compared against here.
 *
 *  - SALDO = sum of the included bank accounts' AVAILABLE balance (pending charges already taken off).
 *    With no bank, the ledger of real movements up to today.
 *  - The ledger (real rows + plan rows the bank confirmed, up to today) is a cross-check: a gap of
 *    more than $1 is reported as itself, never hidden.
 *  - POR PAGAR = plan payments still pending (only as a reminder of an obligation, by date) and the bills
 *    the bank debits by itself, next 30 days, each with what would be left of TODAY's money after it.
 *    No income is assumed: money counts when it arrives.
 *
 * Pure: no database, no clock. Every figure in integer cents.
 */
const engine = require('./engine');
const { toCents, fmt } = require('./money');

const d = (c) => ({ v: Math.round(c) / 100, t: fmt(c) });
// moves between his own accounts are not spending and not income
const PROPIA = /online banking transfer|zelle payment (to|from) manuel stagg|zelle payment from digit2ai/i;
// opening balances and reconciliations: bookkeeping, not money coming in
const AJUSTE = /ajuste de conciliaci|efectivo guardado|saldo inicial/i;

/**
 * @param hoy        'YYYY-MM-DD'
 * @param rows       all sf_movimientos rows (store.list)
 * @param cuentas    included bank accounts [{ mask, rol, saldo_disponible, saldo_actual, saldo_at }]
 * @param item       { ultimo_sync, estado } or null
 * @param autopagos  result of autopagos.calcular (formatted) or null
 */
function construir({ hoy, rows, cuentas, item, autopagos }) {
  const reales = rows.filter(r => r.origen === 'real' || r.estado === 'cumplido');
  const pasado = reales.filter(r => r.fecha <= hoy);
  const a = engine.analyze(pasado, { today: hoy, colchonCents: 0 });
  const libro = a.saldo_hoy;

  const cs = (cuentas || []).map(c => {
    const disp = c.saldo_disponible != null ? toCents(c.saldo_disponible) : (c.saldo_actual != null ? toCents(c.saldo_actual) : null);
    return { mask: c.mask, rol: c.rol || null, disponible: disp, actual: c.saldo_actual != null ? toCents(c.saldo_actual) : null, saldo_at: c.saldo_at || null };
  }).filter(c => c.disponible != null);
  const banco = cs.length ? cs.reduce((x, c) => x + c.disponible, 0) : null;
  const saldo = banco != null ? banco : libro;
  const diferencia = banco != null ? libro - banco : 0;

  const at = (iso) => engine.addDays(hoy, iso);
  const enFecha = (f) => { let s = 0; for (const x of a.serie.proyeccion) { if (x.fecha <= f) s = x.saldo; else break; } return s; };
  // before the first real movement there is no record, so it is neither drawn nor counted as growth
  // a reconciliation / opening-balance row is where the record really starts: growth is measured from the end of that day
  let primera = pasado.length ? pasado.reduce((m, r) => (r.fecha < m ? r.fecha : m), hoy) : hoy;
  for (const r of pasado) if (AJUSTE.test(r.concepto || '') && r.fecha > primera) primera = r.fecha;
  const hist = [];
  for (let n = -60; n <= 0; n++) { const f = at(n); if (f >= primera) hist.push({ fecha: f, saldo: Math.round(enFecha(f)) / 100 }); }
  const cambio = (n) => { const f = at(-n); return f >= primera ? { ...d(libro - enFecha(f)), dias: n } : { ...d(libro - enFecha(primera)), dias: Math.round((Date.parse(hoy) - Date.parse(primera)) / 864e5), desde: primera }; };

  const ym = hoy.slice(0, 7);
  const delMes = pasado.filter(r => r.fecha.slice(0, 7) === ym && !PROPIA.test(r.concepto || '') && !AJUSTE.test(r.concepto || ''));
  const monto = (r) => toCents(r.estado === 'cumplido' && r.monto_real != null ? r.monto_real : r.monto);
  const entro = delMes.filter(r => r.tipo === 'ingreso').reduce((x, r) => x + monto(r), 0);
  const salio = delMes.filter(r => r.tipo === 'egreso').reduce((x, r) => x + monto(r), 0);
  const bancoMes = delMes.filter(r => r.fuente === 'plaid' && r.tipo === 'egreso');

  const pend = pasado.filter(r => r.fuente === 'plaid' && r.pendiente_banco && !PROPIA.test(r.concepto || ''));
  const pendNeto = pend.reduce((x, r) => x + (r.tipo === 'egreso' ? monto(r) : -monto(r)), 0);

  // what still has to be paid: pending plan outflows (from 15 days back, an overdue one is still owed) + bank autopays
  const hasta = at(30);
  const lista = rows.filter(r => r.origen === 'plan' && r.estado !== 'cumplido' && r.tipo === 'egreso' && r.fecha >= at(-15) && r.fecha <= hasta)
    .map(r => ({ id: r.id, fecha: r.fecha, concepto: r.concepto, cents: toCents(r.monto), tipo: 'pago', vencido: r.fecha < hoy,
      row: { id: r.id, fecha: r.fecha, tipo: r.tipo, categoria: r.categoria, concepto: r.concepto, monto: r.monto, origen: r.origen, estado: r.estado, monto_real: r.monto_real } }));
  for (const i of (autopagos && autopagos.items) || []) {
    if (i.fecha > hasta) continue;
    lista.push({ id: null, fecha: i.fecha, concepto: i.concepto, cents: i.monto_cents, tipo: 'automatico', estimado: !!i.estimado, vencido: false });
  }
  lista.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : y.cents - x.cents));
  let acum = 0;
  const porPagar = lista.map(p => {
    acum += p.cents;
    return { id: p.id, fecha: p.fecha, concepto: p.concepto, monto: fmt(p.cents), monto_v: p.cents / 100, tipo: p.tipo, estimado: !!p.estimado, vencido: p.vencido,
      dias: Math.round((Date.parse(p.fecha) - Date.parse(hoy)) / 864e5), queda: d(saldo - acum), cubierto: saldo - acum >= 0, row: p.row || null };
  });
  const sinCubrir = porPagar.find(p => !p.cubierto) || null;

  // incomes he typed by hand for a future date: not counted, only listed
  const porCobrar = reales.filter(r => r.fecha > hoy && r.tipo === 'ingreso').sort((x, y) => (x.fecha < y.fecha ? -1 : 1))
    .map(r => ({ id: r.id, fecha: r.fecha, concepto: r.concepto, monto: fmt(toCents(r.monto)) }));

  const syncAt = item && item.ultimo_sync ? new Date(item.ultimo_sync).toISOString() : null;
  return {
    saldo: d(saldo), fuente: banco != null ? 'banco' : 'movimientos',
    cuentas: cs.map(c => ({ mask: c.mask, rol: c.rol, disponible: d(c.disponible), actual: c.actual == null ? null : d(c.actual), saldo_at: c.saldo_at })),
    libro: d(libro), diferencia: d(diferencia), cuadra: Math.abs(diferencia) <= 100,
    ultimo_sync: syncAt, banco_estado: item ? item.estado : null,
    cambio_7d: cambio(7), cambio_30d: cambio(30), hist, desde: primera,
    mes: { ym, entro: d(entro), salio: d(salio), neto: d(entro - salio) },
    gasto_banco_mes: d(bancoMes.reduce((x, r) => x + monto(r), 0)), gasto_banco_ids: bancoMes.map(r => r.id), gasto_banco_n: bancoMes.length,
    pendientes: { n: pend.length, neto: d(pendNeto) },
    por_pagar: porPagar, total_por_pagar: d(acum), alcanza: d(saldo - acum), sin_cubrir: sinCubrir,
    por_cobrar: porCobrar
  };
}

/** Alarms that only real money can raise (the plan-based ones are off in real mode). */
function alarmas(r, vistas) {
  const out = [];
  if (r.saldo.v < 0) out.push({ nivel: 'stall', clave: 'real-negativo:' + r.saldo.t, titulo: 'Saldo en negativo', detalle: 'Hoy tienes ' + r.saldo.t + ' en el banco.' });
  const p = r.sin_cubrir;
  if (p && p.dias <= 7) out.push({ nivel: 'stall', clave: 'real-nocubre:' + p.concepto + ':' + p.fecha, titulo: 'No alcanza para ' + p.concepto,
    detalle: (p.vencido ? 'Vencido (' : 'El ' + p.fecha.slice(8) + '/' + p.fecha.slice(5, 7) + ' (') + p.monto + '). Con el dinero de hoy quedarías en ' + p.queda.t + '.' });
  if (!r.cuadra) out.push({ nivel: 'caution', clave: 'real-cuadre:' + r.diferencia.t, titulo: 'El registro no cuadra con el banco',
    detalle: 'Los movimientos suman ' + r.libro.t + ' y el banco tiene ' + r.saldo.t + ' (diferencia ' + r.diferencia.t + '). El panel usa el saldo del banco.' });
  if (r.ultimo_sync && Date.now() - Date.parse(r.ultimo_sync) > 36 * 3600e3) out.push({ nivel: 'caution', clave: 'real-sync:' + r.ultimo_sync.slice(0, 10), titulo: 'El banco no se ha actualizado',
    detalle: 'Última sincronización: ' + r.ultimo_sync.slice(0, 16).replace('T', ' ') + ' UTC. Usa "Sincronizar ahora".' });
  return out.filter(x => !(vistas || []).includes(x.clave));
}

module.exports = { construir, alarmas, PROPIA, AJUSTE };
