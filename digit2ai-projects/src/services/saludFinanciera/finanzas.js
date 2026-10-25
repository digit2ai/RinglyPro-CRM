'use strict';
/**
 * Read-only financial questions over one engine.analyze() result.
 * Every figure here is a lookup or a sum of the engine's own ledger steps —
 * no new rule is invented. All amounts in integer cents.
 */
const engine = require('./engine');
const { fmt } = require('./money');

const CAT = {
  ahorro: 'ahorro', salario: 'salario', ingreso_extra: 'ingreso extra', inversion: 'inversión', corte: 'corte',
  pago_lina: 'pago Lina', hija: 'casa de tu hija', gasto_semanal: 'gastos de la semana', gasto_personal: 'gasto personal', otro: 'otro'
};
const fl = (iso) => engine.fechaLarga(iso);

function balanceAt(days, fecha) {
  let s = 0, any = false;
  for (const d of days) { if (d.fecha <= fecha) { s = d.saldo; any = true; } else break; }
  return { saldo: s, hay_datos: any };
}

function minFrom(days, fecha, startBalance) {
  let min = { fecha, saldo: startBalance };
  for (const d of days) if (d.fecha > fecha && d.saldo < min.saldo) min = d;
  return min;
}

function lastDate(a) { const d = a.serie.proyeccion; return d.length ? d[d.length - 1].fecha : a.today; }

/** Balance at the end of `fecha`, what moves that day, and what is safe to spend from then on. */
function saldoEnFecha(a, fecha) {
  const proj = balanceAt(a.serie.proyeccion, fecha);
  const plan = balanceAt(a.serie.plan, fecha);
  const min = minFrom(a.serie.proyeccion, fecha, proj.saldo);
  const ese_dia = a.steps.filter(s => s.row.fecha === fecha && s.amount > 0);
  return {
    fecha, saldo: proj.saldo, saldo_plan: plan.saldo,
    minimo_despues: min.saldo, fecha_minimo_despues: min.fecha,
    libre: min.saldo - a.colchon_meta, colchon: a.colchon_meta,
    fuera_de_plan: fecha > lastDate(a),
    ultimo_dato: lastDate(a),
    movimientos_del_dia: ese_dia.map(s => ({ concepto: s.row.concepto, tipo: s.row.tipo, monto: s.amount, saldo: s.saldo }))
  };
}

/** What adds up to the balance at `fecha`: ingresos and egresos by category. */
function explicarSaldo(a, fecha) {
  const steps = a.steps.filter(s => s.row.fecha <= fecha && s.amount > 0);
  const group = (tipo) => {
    const g = {};
    for (const s of steps.filter(x => x.row.tipo === tipo)) {
      const k = s.row.categoria;
      g[k] = g[k] || { categoria: k, total: 0, items: [] };
      g[k].total += s.amount; g[k].items.push({ concepto: s.row.concepto, fecha: s.row.fecha, monto: s.amount, origen: s.row.origen, estado: s.row.estado });
    }
    return Object.values(g).sort((x, y) => y.total - x.total);
  };
  const ingresos = group('ingreso'), egresos = group('egreso');
  const asumidos = steps.filter(s => s.row.origen === 'plan' && s.row.estado !== 'cumplido').length;
  const proximos = a.steps.filter(s => s.row.fecha > fecha && s.amount >= 100000).slice(0, 3)
    .map(s => ({ concepto: s.row.concepto, fecha: s.row.fecha, tipo: s.row.tipo, monto: s.amount, saldo: s.saldo }));
  return {
    fecha, saldo: balanceAt(a.serie.proyeccion, fecha).saldo,
    total_ingresos: ingresos.reduce((x, g) => x + g.total, 0), total_egresos: egresos.reduce((x, g) => x + g.total, 0),
    ingresos, egresos, movimientos_del_plan_asumidos: asumidos, proximos_grandes: proximos
  };
}

/** One calendar month: opening, ins, outs, closing and its lowest day. */
function resumenMes(a, ym) {
  const first = ym + '-01';
  const [y, m] = ym.split('-').map(Number);
  const last = engine.lastDayOfMonth(y, m);
  const inicio = balanceAt(a.serie.proyeccion, engine.addDays(first, -1)).saldo;
  const steps = a.steps.filter(s => s.row.fecha >= first && s.row.fecha <= last && s.amount > 0);
  const ingresos = steps.filter(s => s.row.tipo === 'ingreso').reduce((x, s) => x + s.amount, 0);
  const egresos = steps.filter(s => s.row.tipo === 'egreso').reduce((x, s) => x + s.amount, 0);
  const fin = balanceAt(a.serie.proyeccion, last).saldo;
  let min = { fecha: first, saldo: inicio };
  for (const d of a.serie.proyeccion) if (d.fecha >= first && d.fecha <= last && d.saldo < min.saldo) min = d;
  const grandes = steps.filter(s => ['corte', 'pago_lina', 'hija', 'inversion', 'salario'].includes(s.row.categoria) || s.amount >= 100000)
    .map(s => ({ concepto: s.row.concepto, fecha: s.row.fecha, tipo: s.row.tipo, monto: s.amount, saldo: s.saldo }));
  return { mes: ym, desde: first, hasta: last, saldo_inicio: inicio, ingresos, egresos, saldo_fin: fin, minimo: min.saldo, fecha_minimo: min.fecha,
    movimientos: steps.length, grandes, fuera_de_plan: first > lastDate(a), ultimo_dato: lastDate(a) };
}

/** The rules, in words, plus the figures that drive them today. */
function comoSeCalcula(a) {
  return {
    reglas: [
      'Empiezo en cero y sumo cada movimiento en su fecha: primero los ingresos del día y después los egresos.',
      'Los movimientos reales cuentan por lo que registraste; los del plan que marcaste como cumplidos, por el monto real que pagaste.',
      'Los movimientos del plan que siguen pendientes se toman tal como los planeaste, aunque su fecha ya haya pasado, hasta que los marques o los edites.',
      `Tus gastos personales salen del presupuesto semanal de ${fmt(a.presupuesto_semanal)} (sábado a viernes): solo lo que pase de esa cantidad baja la proyección.`
    ],
    salud: `La salud suma cuatro partes: colchón hasta 40 puntos (tu punto más bajo contra la meta de ${fmt(a.colchon_meta)}), apego al plan hasta 30 (saldo final contra el del plan), la semana actual hasta 20 y las obligaciones cubiertas 10. Si algún día quedas en negativo, la salud no pasa de 49.`
  };
}

/** What has to stay true for the projection to hold. */
function planMantener(a, hasta) {
  const limite = hasta || a.fecha_min;
  const obligaciones = a.steps.filter(s => s.row.tipo === 'egreso' && s.row.fecha >= a.today && s.row.fecha <= limite && s.amount > 0 &&
    ['corte', 'pago_lina', 'hija', 'inversion'].includes(s.row.categoria));
  const ingresos = a.steps.filter(s => s.row.tipo === 'ingreso' && s.row.fecha > a.today && s.row.fecha <= limite && s.amount > 0 && s.row.origen === 'plan' && s.row.estado !== 'cumplido');
  const semanas = a.steps.filter(s => s.row.categoria === 'gasto_semanal' && s.row.fecha >= a.today && s.row.fecha <= limite).length;
  return {
    hasta: limite,
    margen: a.saldo_min - a.colchon_meta,
    saldo_min: a.saldo_min, fecha_min: a.fecha_min,
    ingresos_que_deben_llegar: ingresos.map(s => ({ concepto: s.row.concepto, fecha: s.row.fecha, monto: s.amount })),
    pagos_que_salen: obligaciones.map(s => ({ concepto: s.row.concepto, fecha: s.row.fecha, monto: s.amount })),
    semanas_de_presupuesto: semanas, presupuesto: a.presupuesto_semanal
  };
}

/** Before/after of a write, in plain numbers. */
function impacto(antes, despues, fechaFoco) {
  const r = {
    saldo_hoy: [antes.saldo_hoy, despues.saldo_hoy],
    saldo_min: [antes.saldo_min, despues.saldo_min], fecha_min: [antes.fecha_min, despues.fecha_min],
    saldo_final: [antes.saldo_final, despues.saldo_final],
    score: [antes.score, despues.score], color: [antes.color, despues.color],
    semana: [antes.semana.gastado, despues.semana.gastado]
  };
  if (fechaFoco) r.foco = { fecha: fechaFoco, saldo: [saldoEnFecha(antes, fechaFoco).saldo, saldoEnFecha(despues, fechaFoco).saldo] };
  return r;
}

module.exports = { CAT, fl, saldoEnFecha, explicarSaldo, resumenMes, comoSeCalcula, planMantener, impacto, balanceAt };
