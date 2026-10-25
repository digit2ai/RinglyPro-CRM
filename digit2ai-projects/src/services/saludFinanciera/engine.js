'use strict';
/**
 * Salud Financiera — the ONLY place a balance or a health score is computed.
 * Pure functions, integer cents, no database, no model. The API, the dashboard
 * and Lina's tools all call these; nothing recomputes a figure elsewhere.
 *
 * Rules (owner spec 2026-10-25):
 *  - The balance is never stored: it is the running sum ordered by date, and
 *    on the same day ingresos go before egresos.
 *  - Projection = every row at its own date: real rows at their amount, plan
 *    rows marked cumplido at the real amount paid, plan rows still pending at
 *    the planned amount. A pending plan row dated in the past is taken as
 *    planned (it stays at its date) until you mark it or edit it.
 *  - Weekly personal budget: a week runs Saturday to Friday. Real
 *    'gasto_personal' rows hit the balance on their own date, and the week's
 *    pending 'gasto_semanal' plan row only charges what is left of the budget,
 *    so the week's total impact is max(budget, spent).
 *  - Health is measured from TODAY forward (the past is history, not a risk).
 */
const { toCents, fmt } = require('./money');

const CATEGORIAS = ['ahorro', 'salario', 'ingreso_extra', 'inversion', 'corte', 'pago_lina', 'hija', 'gasto_semanal', 'gasto_personal', 'servicios', 'otro'];
const OBLIGACIONES = ['corte', 'pago_lina', 'hija'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------- dates (YYYY-MM-DD strings, UTC arithmetic) ----------
function isISO(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dow(iso) { return new Date(iso + 'T00:00:00Z').getUTCDay(); } // 0=Sunday
function weekStart(iso) { return addDays(iso, -((dow(iso) + 1) % 7)); } // Saturday
function weekEnd(iso) { return addDays(weekStart(iso), 6); }             // Friday
function todayNY(now) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now || new Date());
  return p; // en-CA formats as YYYY-MM-DD
}
function fechaLarga(iso) { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]}${y !== Number(todayNY().slice(0, 4)) ? ' de ' + y : ''}`; }

// ---------- rows ----------
function norm(r) {
  return {
    id: r.id,
    fecha: typeof r.fecha === 'string' ? r.fecha.slice(0, 10) : new Date(r.fecha).toISOString().slice(0, 10),
    concepto: r.concepto,
    tipo: r.tipo,
    cents: r.cents != null ? r.cents : toCents(r.monto),
    realCents: r.realCents != null ? r.realCents : (r.monto_real == null ? null : toCents(r.monto_real)),
    categoria: r.categoria,
    origen: r.origen,
    estado: r.estado || null,
    nota: r.nota || null
  };
}

function sign(r) { return r.tipo === 'ingreso' ? 1 : -1; }

function sortForLedger(a, b) {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  if (a.tipo !== b.tipo) return a.tipo === 'ingreso' ? -1 : 1;
  const ai = typeof a.id === 'number' ? a.id : 1e15, bi = typeof b.id === 'number' ? b.id : 1e15;
  return ai - bi;
}

// Amount each row moves the balance by, in the projection.
function effectiveAmounts(rows, presupuestoCents) {
  const spent = {}; // weekStart -> cents of real gasto_personal
  for (const r of rows) {
    if (r.origen === 'real' && r.tipo === 'egreso' && r.categoria === 'gasto_personal') {
      const w = weekStart(r.fecha); spent[w] = (spent[w] || 0) + r.cents;
    }
  }
  const absorbed = {}; // spent already offset against a pending weekly row
  const out = new Map();
  for (const r of [...rows].sort(sortForLedger)) {
    let amt;
    if (r.origen === 'real') amt = r.cents;
    else if (r.estado === 'cumplido') amt = r.realCents != null ? r.realCents : r.cents;
    else if (r.categoria === 'gasto_semanal') {
      const w = weekStart(r.fecha);
      const avail = Math.max(0, (spent[w] || 0) - (absorbed[w] || 0));
      const take = Math.min(avail, r.cents);
      absorbed[w] = (absorbed[w] || 0) + take;
      amt = r.cents - take;
    } else amt = r.cents;
    out.set(r, amt);
  }
  return out;
}

// Running ledger. Returns steps (one per row) and end-of-day balances.
function ledger(rows, amounts) {
  const steps = []; let bal = 0;
  for (const r of [...rows].sort(sortForLedger)) {
    const amt = amounts ? amounts.get(r) : r.cents;
    bal += sign(r) * amt;
    steps.push({ row: r, amount: amt, saldo: bal });
  }
  const days = [];
  for (const s of steps) {
    if (days.length && days[days.length - 1].fecha === s.row.fecha) days[days.length - 1].saldo = s.saldo;
    else days.push({ fecha: s.row.fecha, saldo: s.saldo });
  }
  return { steps, days, final: steps.length ? steps[steps.length - 1].saldo : 0 };
}

function planBase(rows) {
  return ledger(rows.filter(r => r.origen === 'plan'));
}

function round1(x) { return Math.round(x * 10) / 10; }

/**
 * The whole picture. `opts.today` (YYYY-MM-DD, America/New_York) is required
 * in tests; production passes todayNY().
 */
function analyze(rawRows, opts = {}) {
  const today = opts.today || todayNY();
  const colchon = opts.colchonCents != null ? opts.colchonCents : 100000;
  const presupuesto = opts.presupuestoCents != null ? opts.presupuestoCents : 10000;
  const rows = rawRows.map(norm);
  const amounts = effectiveAmounts(rows, presupuesto);
  const proj = ledger(rows, amounts);
  const plan = planBase(rows);

  // Balance as of the end of today, then every later day.
  let saldoHoy = 0;
  for (const d of proj.days) if (d.fecha <= today) saldoHoy = d.saldo;
  const forward = [{ fecha: today, saldo: saldoHoy }, ...proj.days.filter(d => d.fecha > today)];
  let min = forward[0];
  for (const d of forward) if (d.saldo < min.saldo) min = d;
  const negativos = forward.filter(d => d.saldo < 0);
  const saldoFinal = proj.final;
  const saldoFinalPlan = plan.final;

  // A. Colchón (40)
  const A = min.saldo < 0 ? 0 : Math.min(1, min.saldo / colchon) * 40;
  // B. Apego al plan (30)
  let B;
  if (saldoFinalPlan > 0) B = Math.max(0, Math.min(1, saldoFinal / saldoFinalPlan)) * 30;
  else B = saldoFinal >= saldoFinalPlan ? 30 : 0;
  // C. Presupuesto de la semana actual (20)
  const ws = weekStart(today), we = weekEnd(today);
  const gastado = rows.filter(r => r.origen === 'real' && r.tipo === 'egreso' && r.categoria === 'gasto_personal' && r.fecha >= ws && r.fecha <= we)
    .reduce((s, r) => s + r.cents, 0);
  const C = gastado <= presupuesto ? 20 : 20 * Math.max(0, 1 - (gastado - presupuesto) / presupuesto);
  // D. Obligaciones cubiertas (10), from today forward, checked right after each payment.
  const obligaciones = proj.steps.filter(s => s.row.tipo === 'egreso' && OBLIGACIONES.includes(s.row.categoria) && s.row.fecha >= today);
  const descubiertas = obligaciones.filter(s => s.saldo < 0);
  const D = descubiertas.length ? 0 : 10;

  let score = A + B + C + D;
  const limitado = negativos.length > 0 && score > 49;
  if (negativos.length) score = Math.min(score, 49);
  // Two colours only (owner decision 2026-10-25): verde from 50, amarillo below. No negative wording.
  const color = score >= 50 ? 'verde' : 'amarillo';
  const frase = color === 'verde' ? 'Vas bien' : 'Hay que ajustar';

  // Next big payment: the next obligation or any egreso of $1,000+ from today.
  const proximoGrande = proj.steps.find(s => s.row.tipo === 'egreso' && s.row.fecha >= today &&
    (OBLIGACIONES.includes(s.row.categoria) || s.amount >= 100000) && !(s.row.origen === 'plan' && s.row.estado === 'cumplido'));

  return {
    today,
    score: round1(score),
    score_exacto: score,
    color, frase,
    limitado_por_negativo: negativos.length > 0,
    A: round1(A), B: round1(B), C: round1(C), D: round1(D),
    saldo_hoy: saldoHoy,
    saldo_min: min.saldo, fecha_min: min.fecha,
    saldo_final: saldoFinal,
    saldo_final_plan: saldoFinalPlan,
    colchon_meta: colchon,
    presupuesto_semanal: presupuesto,
    semana: { desde: ws, hasta: we, gastado, restante: presupuesto - gastado },
    dias_negativos: negativos,
    obligaciones: { total: obligaciones.length, cubiertas: obligaciones.length - descubiertas.length, hasta: obligaciones.length ? obligaciones[obligaciones.length - 1].row.fecha : null },
    obligaciones_descubiertas: descubiertas.map(s => ({ id: s.row.id, fecha: s.row.fecha, concepto: s.row.concepto, saldo: s.saldo })),
    proximo_pago: proximoGrande ? { id: proximoGrande.row.id, fecha: proximoGrande.row.fecha, concepto: proximoGrande.row.concepto, monto: proximoGrande.amount, saldo_despues: proximoGrande.saldo, cubierto: proximoGrande.saldo >= 0 } : null,
    steps: proj.steps,
    serie: { proyeccion: proj.days, plan: plan.days },
    rows
  };
}

// A compact, cents-free view for the API and for Lina's tools.
function publicSummary(a) {
  return {
    hoy: a.today,
    score: a.score, color: a.color, frase: a.frase,
    limitado_por_negativo: a.limitado_por_negativo,
    A: a.A, B: a.B, C: a.C, D: a.D,
    saldo_hoy: fmt(a.saldo_hoy),
    saldo_min: fmt(a.saldo_min), fecha_min: a.fecha_min,
    saldo_final: fmt(a.saldo_final),
    saldo_final_plan: fmt(a.saldo_final_plan),
    colchon_meta: fmt(a.colchon_meta),
    semana: { desde: a.semana.desde, hasta: a.semana.hasta, gastado: fmt(a.semana.gastado), presupuesto: fmt(a.presupuesto_semanal), restante: fmt(a.semana.restante) },
    dias_negativos: a.dias_negativos.map(d => ({ fecha: d.fecha, saldo: fmt(d.saldo) })),
    obligaciones: a.obligaciones,
    obligaciones_descubiertas: a.obligaciones_descubiertas.map(o => ({ ...o, saldo: fmt(o.saldo) })),
    proximo_pago: a.proximo_pago ? { ...a.proximo_pago, monto: fmt(a.proximo_pago.monto), saldo_despues: fmt(a.proximo_pago.saldo_despues) } : null
  };
}

// Hypothetical rows are real movements that are never saved.
function simulate(rawRows, hypotheticals, opts = {}) {
  const base = analyze(rawRows, opts);
  const extra = hypotheticals.map((h, i) => ({
    id: 'sim-' + i, fecha: h.fecha || base.today, concepto: h.concepto || 'Simulación',
    tipo: h.tipo === 'ingreso' ? 'ingreso' : 'egreso', cents: toCents(h.monto),
    categoria: CATEGORIAS.includes(h.categoria) ? h.categoria : 'otro', origen: 'real', estado: null
  }));
  if (extra.some(e => e.cents == null || e.cents <= 0 || !isISO(e.fecha))) throw new Error('Movimiento hipotético inválido');
  const after = analyze([...rawRows, ...extra], opts);
  return { antes: base, despues: after, guardado: false };
}

// ---------- plan extension ----------
const SALARIO_ANCLA = '2026-11-06';
function salaryDatesBetween(from, to) {
  const out = []; let d = SALARIO_ANCLA;
  while (d < from) d = addDays(d, 14);
  while (d <= to) { out.push(d); d = addDays(d, 14); }
  return out;
}
function lastDayOfMonth(y, m) { return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); } // m = 1..12

/**
 * New plan rows for the next `meses` months after the last plan date, using
 * the owner's rules. Never duplicates: a corte or pago Lina is matched by its
 * month name in the concept (the seed pays February's corte on 2027-01-29),
 * salary and weekly rows by date + category.
 */
/**
 * Monthly recurring items (owner's own list, stored in sf_recurrentes, never
 * in code) turned into plan rows for every month in [desde, hasta]. A month
 * that already holds a plan row with the same concept is skipped, so running
 * it twice never duplicates.
 */
function recurrentRows(rawRows, recurrentes, desde, hasta) {
  const plan = rawRows.map(norm).filter(r => r.origen === 'plan');
  const have = new Set(plan.map(r => (r.concepto || '').toLowerCase() + '|' + r.fecha.slice(0, 7)));
  const out = [];
  if (!desde || !hasta || desde > hasta) return out;
  for (const rec of recurrentes || []) {
    if (rec.activo === false) continue;
    let ym = desde.slice(0, 7);
    while (ym <= hasta.slice(0, 7)) {
      const [y, m] = ym.split('-').map(Number);
      const last = lastDayOfMonth(y, m);
      const dia = rec.fin_de_mes ? Number(last.slice(8)) : Math.min(Number(rec.dia) || 1, Number(last.slice(8)));
      const fecha = ym + '-' + String(dia).padStart(2, '0');
      const key = String(rec.concepto).toLowerCase() + '|' + ym;
      if (fecha >= desde && fecha <= hasta && !have.has(key)) {
        have.add(key);
        out.push({ fecha, concepto: rec.concepto, tipo: rec.tipo || 'egreso', monto: rec.monto, categoria: rec.categoria || 'servicios', origen: 'plan', estado: 'pendiente' });
      }
      ym = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    }
  }
  return out.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

function extendPlan(rawRows, meses = 1, recurrentes = []) {
  const rows = rawRows.map(norm).filter(r => r.origen === 'plan');
  if (!rows.length) return { desde: null, hasta: null, nuevos: [] };
  const last = rows.reduce((m, r) => r.fecha > m ? r.fecha : m, rows[0].fecha);
  const desde = addDays(last, 1);
  const [ly, lm] = last.split('-').map(Number);
  const end = new Date(Date.UTC(ly, lm - 1 + meses + 1, 0)).toISOString().slice(0, 10);
  const hasta = end;
  const have = new Set(rows.map(r => r.fecha + '|' + r.categoria));
  const conceptos = new Set(rows.map(r => (r.concepto || '').toLowerCase()));
  const nuevos = [];
  const add = (fecha, concepto, tipo, monto, categoria) => nuevos.push({ fecha, concepto, tipo, monto, categoria, origen: 'plan', estado: 'pendiente' });

  const salarios = salaryDatesBetween(desde, hasta);
  for (const f of salarios) if (!have.has(f + '|salario')) add(f, 'Salario', 'ingreso', '3800.00', 'salario');

  // Pago Lina on the first salary of each month (salary dates may come from the existing plan too).
  const allSalaries = salaryDatesBetween('2026-11-01', hasta);
  const byMonth = {};
  for (const f of allSalaries) { const k = f.slice(0, 7); if (!byMonth[k]) byMonth[k] = f; }
  for (const [k, f] of Object.entries(byMonth)) {
    if (f < desde) continue;
    const mes = MESES[Number(k.slice(5, 7)) - 1];
    const c = `Pago Lina – ${mes}`;
    if (!conceptos.has(c.toLowerCase())) add(f, c, 'egreso', '1500.00', 'pago_lina');
  }
  // Corte on the 6th of each month.
  let cursor = desde.slice(0, 7);
  while (cursor <= hasta.slice(0, 7)) {
    const f = cursor + '-06';
    const mes = MESES[Number(cursor.slice(5, 7)) - 1];
    const c = `Corte – ${mes}`;
    if (f >= desde && f <= hasta && !conceptos.has(c.toLowerCase())) add(f, c, 'egreso', '4300.00', 'corte');
    const [y, m] = cursor.split('-').map(Number);
    cursor = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  }
  // Weekly personal budget closes every Friday.
  let fri = desde; while (dow(fri) !== 5) fri = addDays(fri, 1);
  for (; fri <= hasta; fri = addDays(fri, 7)) if (!have.has(fri + '|gasto_semanal')) add(fri, 'Gastos semana', 'egreso', '100.00', 'gasto_semanal');

  for (const x of recurrentRows(rawRows, recurrentes, desde, hasta)) nuevos.push(x);
  nuevos.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.tipo === 'ingreso' ? -1 : 1));
  return { desde, hasta, nuevos };
}

module.exports = {
  CATEGORIAS, OBLIGACIONES, MESES,
  isISO, addDays, dow, weekStart, weekEnd, todayNY, fechaLarga, lastDayOfMonth,
  norm, analyze, publicSummary, simulate, extendPlan, recurrentRows, ledger
};
