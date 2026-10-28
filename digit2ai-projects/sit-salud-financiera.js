'use strict';
/**
 * SIT — Salud Financiera.  node digit2ai-projects/sit-salud-financiera.js
 * Zero external keys: ANTHROPIC_API_KEY is removed; the model path is tested
 * with an injected fake client. DB sections use throwaway users 990097/990098
 * (tenant 990015) and delete everything they create.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
delete process.env.ANTHROPIC_API_KEY;
process.env.SALUD_FINANCIERA_OWNER_USER_IDS = '990097,990098';
process.env.SALUD_FINANCIERA_OWNER_EMAILS = 'sit-sf-a@example.test,sit-sf-b@example.test';

const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const engine = require('./src/services/saludFinanciera/engine');
const { toCents, fmt } = require('./src/services/saludFinanciera/money');
const { seedRows } = require('./src/services/saludFinanciera/seed');
const lina = require('./src/services/saludFinanciera/lina');

let pass = 0, fail = 0;
function ok(cond, name, extra) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } }
const TODAY = '2026-10-25';
const seed = () => seedRows().map((r, i) => ({ ...r, id: i + 1 }));
const near = (a, b, d) => Math.abs(a - b) <= d;

async function engineTests() {
  console.log('\n[1] Engine (pure, integer cents)');
  const rows = seed();
  const ing = rows.filter(r => r.tipo === 'ingreso').reduce((s, r) => s + toCents(r.monto), 0);
  const egr = rows.filter(r => r.tipo === 'egreso').reduce((s, r) => s + toCents(r.monto), 0);
  ok(ing === 4756848, 'seed ingresos = 47,568.48', fmt(ing));
  ok(egr === 4310000, 'seed egresos = 43,100.00', fmt(egr));
  const a = engine.analyze(rows, { today: TODAY });
  ok(a.saldo_final === 446848, 'saldo final 4,468.48', fmt(a.saldo_final));
  ok(a.saldo_min === 6848 && a.fecha_min === '2026-12-11', 'saldo mínimo 68.48 el 2026-12-11', [fmt(a.saldo_min), a.fecha_min]);
  ok(near(a.score_exacto, 63, 0.5) && a.color === 'verde' && a.frase === 'Vas bien', 'acceptance 1: salud ~63% (verde: two colours, owner decision)', a.score);
  ok(near(a.A, 2.74, 0.06) && a.B === 30 && a.C === 20 && a.D === 10, 'A=2.74 B=30 C=20 D=10', [a.A, a.B, a.C, a.D]);
  const b = engine.analyze([...rows, { id: 900, fecha: TODAY, concepto: 'x', tipo: 'egreso', monto: '50', categoria: 'otro', origen: 'real' }], { today: TODAY });
  ok(b.saldo_min === 1848, 'acceptance 2: +$50 real hoy -> mínimo 18.48', fmt(b.saldo_min));
  ok(near(b.score_exacto, 60, 0.6) && b.color === 'verde', 'acceptance 2: salud ~60%', b.score);
  // Hard rule: any negative day caps at 49.
  const neg = engine.analyze([...rows, { id: 901, fecha: TODAY, concepto: 'x', tipo: 'egreso', monto: '300', categoria: 'otro', origen: 'real' }], { today: TODAY });
  ok(neg.dias_negativos.length > 0 && neg.score <= 49 && neg.color === 'amarillo' && neg.frase === 'Hay que ajustar', 'regla dura: negativo -> max 49, amarillo', neg.score);
  const dip = engine.analyze([...rows, { id: 904, fecha: '2026-12-11', concepto: 'x', tipo: 'egreso', monto: '300', categoria: 'otro', origen: 'real' }, { id: 905, fecha: '2026-12-12', concepto: 'y', tipo: 'ingreso', monto: '300', categoria: 'otro', origen: 'real' }], { today: TODAY });
  ok(dip.score === 49 && dip.limitado_por_negativo, 'regla dura: one negative day caps a 60-point score at 49', dip.score);
  // Weekly budget: real personal spending is absorbed up to $100, the excess lowers the projection.
  const w1 = engine.analyze([...rows, { id: 902, fecha: TODAY, concepto: 'c', tipo: 'egreso', monto: '45', categoria: 'gasto_personal', origen: 'real' }], { today: TODAY });
  ok(w1.saldo_final === a.saldo_final && w1.C === 20, '$45 personal within week: final unchanged, C=20');
  const w2 = engine.analyze([...rows, { id: 903, fecha: TODAY, concepto: 'c', tipo: 'egreso', monto: '150', categoria: 'gasto_personal', origen: 'real' }], { today: TODAY });
  ok(w2.saldo_final === a.saldo_final - 5000 && near(w2.C, 10, 0.01), '$150 personal: excess $50 lowers final, C=10', [fmt(w2.saldo_final), w2.C]);
  // Cumplido uses the real amount.
  const r2 = rows.map(r => r.concepto === 'Corte – noviembre' ? { ...r, estado: 'cumplido', monto_real: '4000.00' } : r);
  ok(engine.analyze(r2, { today: TODAY }).saldo_final === a.saldo_final + 30000, 'cumplido with monto_real 4000 instead of 4300 -> +300');
  // Simulation never mutates.
  const before = JSON.stringify(rows);
  engine.simulate(rows, [{ monto: '300', tipo: 'egreso' }], { today: TODAY });
  ok(JSON.stringify(rows) === before, 'simulate does not mutate rows');
  // Extend plan: rules + idempotent.
  const ext = engine.extendPlan(rows, 2);
  ok(ext.nuevos.some(n => n.concepto === 'Pago Lina – febrero' && n.fecha === '2027-02-12'), 'extend: pago Lina feb on first salary 2027-02-12');
  ok(!ext.nuevos.some(n => n.concepto === 'Corte – febrero'), 'extend: no duplicate Corte – febrero (paid 2027-01-29)');
  ok(ext.nuevos.some(n => n.concepto === 'Corte – marzo' && n.fecha === '2027-03-06'), 'extend: Corte – marzo on the 6th');
  ok(ext.nuevos.filter(n => n.categoria === 'salario').map(n => n.fecha).join() === '2027-02-12,2027-02-26,2027-03-12,2027-03-26', 'extend: salary every two Fridays');
  const again = engine.extendPlan([...rows, ...ext.nuevos.map((n, i) => ({ ...n, id: 500 + i }))], 2);
  ok(!again.nuevos.some(n => ext.nuevos.some(e => e.fecha === n.fecha && e.categoria === n.categoria)), 'extend twice: never duplicates');
  // Weekly budget rollover: unspent money carries to the next week.
  const r20 = [...rows, { id: 950, fecha: TODAY, concepto: 'c', tipo: 'egreso', monto: '20', categoria: 'gasto_personal', origen: 'real' }];
  const wk2 = engine.analyze(r20, { today: '2026-11-02' });
  ok(wk2.semana.acumulado_previo === 8000 && wk2.semana.disponible === 18000, 'rollover: $20 spent in week 1 -> week 2 has $180 available', wk2.semana);
  const wk2b = engine.analyze([...r20, { id: 951, fecha: '2026-11-02', concepto: 'c', tipo: 'egreso', monto: '170', categoria: 'gasto_personal', origen: 'real' }], { today: '2026-11-02' });
  ok(wk2b.saldo_final === a.saldo_final && wk2b.C === 20, 'spending carried money ($170 of $180) does not lower the projection', [wk2b.saldo_final, wk2b.C]);
  const wk2c = engine.analyze([...r20, { id: 952, fecha: '2026-11-02', concepto: 'c', tipo: 'egreso', monto: '230', categoria: 'gasto_personal', origen: 'real' }], { today: '2026-11-02' });
  ok(wk2c.saldo_final === a.saldo_final - 5000, 'spending beyond the accumulated amount lowers the projection by the excess ($50)', wk2c.saldo_final);
  ok(a.zona && a.zona.desde === '2026-12-06' && a.zona.hasta === '2026-12-17' && a.zona.bajo_colchon, 'zona de cuidado: del 6 al 17 de diciembre', a.zona);
  ok(a.tendencia.sube === false && a.tendencia.malas[0].tipo === 'bajo_colchon', 'trend arrow points down with the reason (below colchón)');
  ok(engine.analyze(rows, { today: TODAY, colchonCents: 5000 }).tendencia.sube === true, 'trend arrow points up when nothing is at risk');
  const withBill = engine.analyze([...rows, { id: 960, fecha: '2026-12-06', concepto: 'Internet', tipo: 'egreso', monto: '500', categoria: 'servicios', origen: 'plan', estado: 'pendiente' }], { today: TODAY });
  ok(withBill.obligaciones.total === 9 && withBill.obligaciones_descubiertas.some(o => o.concepto === 'Internet'), 'monthly bills count as payments that must be covered');
  ok(lina.heuristic('en que fecha tengo que tener cuidado', rows, { today: TODAY }, {}).texto.includes('del 6 de diciembre al 17 de diciembre'), 'Lina: when to be careful -> the window');
  ok(/acumula/.test(lina.heuristic('cuanto me queda para gastar esta semana', r20, { today: '2026-11-02' }, {}).texto), 'Lina explains the weekly rollover');

  // No colchón (owner removed it): the floor is zero.
  const z0 = engine.analyze(rows, { today: TODAY, colchonCents: 0 });
  ok(z0.A === 40 && z0.tendencia.sube === true && !z0.tendencia.malas.length, 'colchón 0: full A while never negative, trend up', [z0.A, z0.tendencia]);
  const z0neg = engine.analyze([...rows, { id: 980, fecha: '2026-12-06', concepto: 'x', tipo: 'egreso', monto: '1000', categoria: 'otro', origen: 'real' }], { today: TODAY, colchonCents: 0 });
  ok(z0neg.A === 0 && z0neg.score <= 49 && z0neg.zona.bajo_colchon, 'colchón 0: a negative day still caps at 49 and opens the care window');
  ok(!/colchón de \$0/.test(lina.heuristic('en que fecha tengo que tener cuidado', rows, { today: TODAY, colchonCents: 0 }, {}).texto), 'colchón 0: Lina never mentions a "$0 colchón"');

  const two = engine.publicSummary(engine.analyze([...rows,
    { id: 990, fecha: '2026-12-06', concepto: 'Internet', tipo: 'egreso', monto: '500', categoria: 'servicios', origen: 'plan', estado: 'pendiente' },
    { id: 991, fecha: '2026-12-07', concepto: 'Software', tipo: 'egreso', monto: '100', categoria: 'servicios', origen: 'plan', estado: 'pendiente' }], { today: TODAY }));
  const pd = two.tendencia.malas.find(m => m.tipo === 'pago_descubierto');
  ok(pd && /Software/.test(pd.texto) && !/y \d+ más/.test(pd.texto) && two.obligaciones_descubiertas.every(x => x.monto && x.saldo), 'uncovered payments are all named, with amount and resulting balance (no "y 1 más")', pd && pd.texto);
  ok(!/<path d="' \+ d \+ '"/.test(fs.readFileSync(path.join(__dirname, 'dashboard/assets/salud-financiera.js'), 'utf8')), 'payments card has no curve');

  // No weekly budget (owner removed the $100 rows): personal spending simply lowers the balance.
  const sinW = rows.filter(r => r.categoria !== 'gasto_semanal'); const o = { today: TODAY };
  const nw = engine.analyze([...sinW, { id: 996, fecha: TODAY, concepto: 'c', tipo: 'egreso', monto: '300', categoria: 'gasto_personal', origen: 'real' }], o);
  ok(nw.sin_presupuesto === true && nw.C === 20 && !nw.tendencia.malas.some(m => m.tipo === 'semana_excedida'), 'no weekly budget: C full, the week is never judged');
  ok(nw.saldo_final === engine.analyze(sinW, o).saldo_final - 30000, 'no weekly budget: a $300 personal expense lowers the projection by exactly $300');
  ok(!engine.extendPlan(sinW, 2).nuevos.some(n => n.categoria === 'gasto_semanal'), 'Extender plan stops creating weekly budget rows once they are gone');
  ok(/No tienes un presupuesto semanal fijo/.test(lina.heuristic('cuanto me queda para gastar esta semana', sinW, o, {}).texto), 'Lina talks about the month, not a weekly budget, when there is none');

  // Monthly recurring bills: end of month and a fixed day, never duplicated.
  const RECS = [{ concepto: 'Internet', monto: '150.00', fin_de_mes: true }, { concepto: 'Software', monto: '100.00', dia: 7 }];
  const rr = engine.recurrentRows(rows, RECS, TODAY, '2027-01-31');
  ok(rr.filter(x => x.concepto === 'Internet').map(x => x.fecha).join() === '2026-10-31,2026-11-30,2026-12-31,2027-01-31', 'recurring end-of-month bill lands on each month\'s last day');
  ok(rr.filter(x => x.concepto === 'Software').map(x => x.fecha).join() === '2026-11-07,2026-12-07,2027-01-07', 'recurring day-7 bill skips the past (Oct 7) and repeats monthly');
  ok(engine.recurrentRows([...rows, ...rr.map((x, i) => ({ ...x, id: 700 + i }))], RECS, TODAY, '2027-01-31').length === 0, 'recurring rows are never duplicated');
  ok(engine.extendPlan(rows, 1, RECS).nuevos.some(x => x.concepto === 'Internet' && x.fecha === '2027-02-28'), 'Extender plan carries recurring bills forward');
  ok(engine.recurrentRows(rows, [{ concepto: 'x', monto: '1', dia: 31 }], '2027-02-01', '2027-02-28')[0].fecha === '2027-02-28', 'day 31 clamps to a short month');
  const far = engine.extendPlan(rows, 11);
  ok(far.nuevos.some(n => n.concepto === 'Corte – noviembre' && n.fecha === '2027-11-06') && far.nuevos.some(n => n.concepto === 'Pago Lina – diciembre' && n.fecha.startsWith('2027-12')), 'extend a year out: Nov/Dec 2027 payments are created although Nov/Dec 2026 have the same name');
  ok(!far.nuevos.some(n => n.concepto === 'Corte – febrero'), 'extend: February 2027 corte (paid 2027-01-29) is still not duplicated');
  // Money is exact.
  ok(toCents('0.10') + toCents('0.20') === toCents('0.30') && toCents('1,500') === 150000 && toCents('4689.48') === 468948, 'money: exact decimal parsing');
  ok(engine.weekStart('2026-10-25') === '2026-10-24' && engine.weekEnd('2026-10-25') === '2026-10-30', 'week runs Saturday to Friday');
}

async function linaTests() {
  console.log('\n[2] Lina (heuristic path, no key)');
  const rows = seed(); const o = { today: TODAY };
  let r = await lina.answer('¿Cómo estoy hoy?', rows, o);
  ok(/62\.7%|63%/.test(r.texto) && /verde/.test(r.texto) && !/Cuidado/.test(r.texto) && /11 de diciembre/.test(r.texto), '"¿Cómo estoy hoy?" -> ~63%, verde, 11 de diciembre', r.texto);
  ok(r.composed_by === 'lina', 'recognised question answered by Lina deterministic engine (no model)');
  r = await lina.answer('Si compro algo de $300 hoy, ¿cómo quedo?', rows, o);
  ok(/negativo/.test(r.texto) && /no guard/.test(r.texto) && !r.propuesta, '"$300 hoy" -> negativo, nothing saved', r.texto);
  r = await lina.answer('Hoy gasté $45', rows, o);
  ok(/^¿Registro un egreso de \$45\.00 hoy/.test(r.texto) && r.propuesta && r.propuesta.accion === 'agregar_movimiento', '"Hoy gasté $45" asks for confirmation', r.texto);
  r = await lina.answer('Ya pagué la corte de noviembre', rows, o);
  ok(r.propuesta && r.propuesta.accion === 'marcar_cumplido', '"Ya pagué la corte de noviembre" -> marcar_cumplido proposal');
  r = await lina.answer('¿Me alcanza para el pago de la corte de diciembre?', rows, o);
  ok(/^Sí\./.test(r.texto) && /\$168\.48/.test(r.texto), 'corte de diciembre: cubierto, queda $168.48', r.texto);
  r = await lina.answer('¿Qué debo hacer?', rows, o);
  ok(r.recomendaciones && r.recomendaciones.length >= 1 && r.recomendaciones.length <= 3, '"¿Qué debo hacer?" 1-3 recommendations');
  ok(!/(no pagues|deja de pagar|pospón la corte)/i.test(r.texto), 'never suggests skipping corte/pago Lina/hija');
  r = await lina.answer('¿y lina?', rows, o);
  ok(r.intent === 'aclarar', 'ambiguous "Lina" -> asks which');

  console.log('\n[2b] Financial NLU (the owner\'s own questions)');
  const H = (q, st) => lina.heuristic(q, rows, o, st || {});
  r = H('¿Cuánto dinero voy a tener disponible según el plan para el 1 de diciembre?');
  ok(r.intent === 'saldo_fecha' && /1 de diciembre/.test(r.texto) && /\$1,868\.48/.test(r.texto) && /\$68\.48/.test(r.texto), 'saldo el 1 de diciembre: $1,868.48 and warns of the $68.48 low', r.texto);
  r = H('¿Por qué hoy aparece un saldo actual de más de $8,000?');
  ok(r.intent === 'explicar_saldo' && /Hoy tienes \$8,968\.48 porque entran \$8,968\.48 \(Ahorro 1, Ahorro 2, Ahorro 3 y Ahorro 4\)/.test(r.texto) && /15,500/.test(r.texto), 'why today > $8,000: cause in one sentence + the next big outflow', r.texto);
  const negRows = [...rows, { id: 970, fecha: '2026-12-06', concepto: 'Internet', tipo: 'egreso', monto: '1000', categoria: 'servicios', origen: 'plan', estado: 'pendiente' }];
  const negA = engine.analyze(negRows, o);
  r = lina.heuristic('por que mi saldo queda en negativo el 6 de diciembre', negRows, o, {});
  const falta = fmt(-require('./src/services/saludFinanciera/finanzas').saldoEnFecha(negA, '2026-12-06').saldo);
  ok(/^El 6 de diciembre quedas en -\$/.test(r.texto) && r.texto.includes('te faltan ' + falta) && /La causa:/.test(r.texto) && /Inversión/.test(r.texto) && r.texto.includes('necesitas liberar ' + falta), 'negative date: the day trigger, the cause, and what to free up (not a list of rows)', r.texto);
  ok(r.texto.split(/(?<=\.) /).length <= 5 && !/movimientos del plan cuentan/.test(r.texto), 'explanation stays short (no inventory)');
  r = H('¿Cuánto voy a tener disponible en diciembre?');
  ok(r.intent === 'resumen_mes' && /cierras el mes con \$3,668\.48/.test(r.texto), 'diciembre: opens, ins, outs, closes $3,668.48', r.texto);
  r = H('¿Y cómo se calcula esa proyección?', { contexto: { fecha: '2026-12-01' } });
  ok(r.intent === 'explicar_calculo' && /Para el 1 de diciembre/.test(r.texto), 'cómo se calcula uses the date under discussion', r.texto);
  r = H('¿Qué tengo que hacer para mantenerla?');
  ok(r.intent === 'mantener' && /margen|colchón/.test(r.texto) && /semana/.test(r.texto), 'mantener: margin, incomes, weekly budget');
  r = H('agrega este gasto: 45 dólares en comida');
  ok(r.intent === 'agregar' && r.propuesta && r.propuesta.datos.monto === '45.00' && r.propuesta.datos.categoria === 'gasto_personal' && r.propuesta.datos.concepto === 'Comida', 'agrega gasto 45 comida -> proposal');
  r = H('sí', { pendiente: r.propuesta });
  ok(r.ejecutar && r.ejecutar.datos.monto === '45.00', 'sí with a pending change -> execute');
  r = H('súmale un ingreso de quinientos dólares el viernes');
  ok(r.propuesta && r.propuesta.datos.tipo === 'ingreso' && r.propuesta.datos.monto === '500.00' && r.propuesta.datos.fecha === '2026-10-30', 'súmale ingreso de quinientos el viernes (number in words)');
  ok(H('no', { pendiente: r.propuesta }).limpiar_pendiente === true, 'no cancels the pending change');
  r = H('agrega un gasto'); const part = r.propuesta;
  ok(part && part.falta === 'monto', 'gasto without amount asks how much');
  r = H('200 para el carro', { pendiente: part });
  ok(r.propuesta && r.propuesta.datos.monto === '200.00' && r.propuesta.datos.concepto === 'Carro' && !r.propuesta.falta, 'follow-up amount completes the proposal');
  r = H('cambia el pago lina de diciembre a 1,400');
  ok(r.propuesta && r.propuesta.accion === 'editar' && r.propuesta.datos.monto === '1400.00', 'cambia pago Lina de diciembre a 1,400');
  ok(H('¿cuánto tendré a fin de mes?').texto.includes('31 de octubre'), 'a fin de mes -> 31 de octubre');
  ok(H('¿y en enero?').intent === 'resumen_mes', 'bare month follow-up -> month summary');
  ok(H('sí').ejecutar === undefined, 'sí with nothing pending executes nothing');
  ok(H('¿vale la pena adelantar algo?').desconocido === true, 'open question is handed to the model path');

  const negR = [...rows, { id: 995, fecha: '2026-12-06', concepto: 'x', tipo: 'egreso', monto: '1000', categoria: 'otro', origen: 'real' }];
  r = lina.heuristic('que tengo que hacer para no estar en saldo negativo', negR, o, { preferencias: ['La inversión no es negociable'] });
  ok(r.intent === 'evitar_negativo' && /Te faltan/.test(r.texto) && /ingreso extra/.test(r.texto) && !/Reduce la inversión|bajar "Inversión"/.test(r.texto) && /no es negociable/.test(r.texto), 'no quedar en negativo: how much, by when, verified options, investment untouched when ruled out', r.texto);
  ok(!/inversi/i.test(lina.heuristic('¿qué debo hacer?', negR, o, { preferencias: ['La inversión no es negociable'] }).texto.replace(/No toqué la inversión[^.]*\./, '')), 'a saved rule keeps the investment out of every recommendation');
  console.log('\n[2c] Lina memory: 50+ financial-health Q&A');
  const kb = require('./src/services/saludFinanciera/conocimiento');
  ok(kb.QA.length >= 50 && new Set(kb.QA.map(q => q.id)).size === kb.QA.length, 'memory holds at least 50 distinct questions', kb.QA.length);
  const miss = kb.QA.filter(q => lina.heuristic(q.p, rows, o, {}).conocimiento !== q.id).map(q => q.id);
  ok(miss.length === 0, 'each memory question is answered by its own entry', miss);
  const allText = kb.QA.map(q => q.r(kb.datos(engine.analyze(rows, o), require('./src/services/saludFinanciera/finanzas')))).join(' ');
  ok(!/(compra acciones|invierte en|criptomoneda|bitcoin|fondo indexado|etf|bolsa de valores)/i.test(allText), 'memory never recommends specific investment products');
  ok(!/(deja de pagar la corte|no pagues|pospón el pago lina|deja de ayudar)/i.test(allText), 'memory never suggests skipping corte / pago Lina / hija');
  const fx = kb.QA.find(q => q.id === 'mayor_riesgo').r(kb.datos(engine.analyze(rows, o), require('./src/services/saludFinanciera/finanzas')));
  ok(/\$68\.48/.test(fx) && /11 de diciembre/.test(fx), 'personal memory answers use engine figures (mayor riesgo -> $68.48, 11 de diciembre)', fx);
  ok(lina.heuristic('agrega un ingreso extra de 300', rows, o, {}).intent === 'agregar', 'a write is never swallowed by the memory ("ingreso extra")');
  ok(lina.heuristic('¿Cuánto tendré el 1 de diciembre?', rows, o, {}).intent === 'saldo_fecha', 'a date question is never swallowed by the memory');
  const ui = fs.readFileSync(path.join(__dirname, 'dashboard/assets/salud-financiera.js'), 'utf8');
  const pv = ui.match(/function paraVoz\(t\) \{[\s\S]*?\n  \}/)[0]; const paraVoz = new Function(pv + '; return paraVoz;')();
  ok(paraVoz('Tienes $1,868.48 y -$131.52') === 'Tienes 1868 dólares con 48 centavos y menos 131 dólares con 52 centavos', 'voice says dólares, never pesos');
  ok(/paraVoz\(text\)\.slice/.test(ui) && /SpeechSynthesisUtterance\(paraVoz\(text\)\)/.test(ui), 'both voice paths (neural + browser) speak through paraVoz');
  ok(/rec\.continuous = true/.test(ui) && /SILENCIO_MS = 3000/.test(ui), 'listening keeps going through pauses (continuous + 3 s silence)');
  const iK = ui.indexOf('id="sf-pfd"'), iL = ui.indexOf('(SHOW_LINA ? orbHtml()');
  ok(iK > 0 && iL > 0 && iL < iK, 'Lina (hidden) slot stays above the instrument panel');
  ok(/var SHOW_LINA = false;/.test(ui) && /if \(SHOW_LINA\) wireLina\(\);/.test(ui), 'Lina is hidden from the dashboard for now (one switch brings her back)');
  ok(/function vozOn\(\) \{ try \{ return localStorage\.getItem\('sf_voz'\) === '1'/.test(ui) && /if \(!vozOn\(\)\) return;/.test(ui), 'voice is muted by default and only speaks when switched on');
  ok(/data-edit="' \+ r\.id/.test(ui) && /function openEdit\(id\)/.test(ui) && /method: 'PATCH', body: cambios/.test(ui), 'every movement row has an Editar button that PATCHes only what changed');
  { const pf = fs.readFileSync(path.join(__dirname, 'dashboard/assets/salud-pfd.js'), 'utf8');
  ok(/Gasto personal de/.test(pf) && /Bajó tu mínimo/.test(pf), 'panel RESUMEN: personal spending this month and its effect on the low point');
  ok(/data-minsel/.test(pf) && /state\.minSel = this\.value/.test(pf), 'panel RESUMEN: minimum with a month/year selector');
  ok(!/Saldo final del trimestre/.test(pf) && /Cierre de /.test(pf) && /Salud financiera/.test(pf) && /Neural Intelligence/.test(pf) && /state = \{ tecla: 'RESUMEN'/.test(pf), 'panel RESUMEN (default) carries hoy, cierre, mínimo, gasto, salud, neural (trimestre tile removed, owner 2026-10-25)');
  ok(!/id="sf-cards"|function drawCards/.test(ui), 'the separate KPI cards are gone from the view'); }
  const pfdSrc = fs.readFileSync(path.join(__dirname, 'dashboard/assets/salud-pfd.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, 'dashboard/index.html'), 'utf8');
  ok(/window\.drawSfPfd/.test(pfdSrc) && /salud-pfd\.js/.test(idx) && idx.indexOf('salud-pfd.js') < idx.indexOf('salud-financiera.js?'), 'G1000 panel script is loaded before the view');
  ok(!/Saldo en el tiempo|Por qué tu salud está así|function drawChart|function drawDesglose/.test(ui) && /id=\"sf-pfd\"/.test(ui), 'chart and score breakdown replaced by the instrument panel');
  {
    const m = /function sinMes\(c\) \{[\s\S]*?\n  \}/.exec(pfdSrc); const sinMes = m && new Function(m[0] + '; return sinMes;')();
    ok(sinMes && sinMes('Pago Lina \u2013 noviembre') === 'Pago Lina' && sinMes('Corte \u2013 diciembre 2026') === 'Corte' && sinMes('Renta') === 'Renta', 'top bar: next payment shows the concept without the month'); }
  { const m = /function trimestres\(desde, hasta\) \{[\s\S]*?\n  \}/.exec(pfdSrc); const tq = m && new Function(m[0] + '; return trimestres;')();
    const qs = tq ? tq('2026-10-25', '2027-12-31') : [];
    ok(qs.map(q => q.nombre).join() === 'Q4-26,Q1-27,Q2-27,Q3-27,Q4-27' && qs[0].desde === '2026-10-25' && qs[1].desde === '2027-01-01' && qs[4].hasta === '2027-12-31', 'inset: quarter marks Q4-26 to Q4-27', qs);
    ok(!/'H' \+ X\(q\.fecha\)/.test(pfdSrc) && /cierre\[q\.fecha\] = q\.saldo/.test(pfdSrc), 'inset: balance curve (daily closes joined), not payment steps');
    ok(/FALTAN/.test(pfdSrc) && /AFECTA/.test(pfdSrc) && /p\.saldo_min\.v < 0/.test(pfdSrc), 'top bar: when negative, how much is missing and which payment it hits'); }
  ok(/PAGOS EN NEGATIVO/.test(pfdSrc) && /if \(!rows\.length\) return;/.test(pfdSrc) && /PUNTO MÁS BAJO/.test(pfdSrc), 'panel: bottom-right box lists the payments that land below zero, only when there are any');
  ok(/'Pagos afectados: '/.test(pfdSrc), 'MÍNIMO key names the affected payments');
  ok(/closing balance of the quarter/.test(pfdSrc) && /z\.fecha < q\.hasta/.test(pfdSrc), 'inset: each quarter shows its closing balance');
  ok(/out = -\(\(p\.costo_mes/.test(pfdSrc) && /p\.ingreso_mes/.test(pfdSrc) && !/v = p\.flujo_30\.v/.test(pfdSrc), 'left tape: income (green) and cost (red) of the month so far');
  { const m = /function curvePitch\(s, p\) \{[\s\S]*?\n  \}/.exec(pfdSrc); const cp = m && new Function('clamp', m[0] + '; return curvePitch;')((v, a, b) => Math.max(a, Math.min(b, v)));
    const ser = (a, b) => ({ hoy: '2026-10-25', serie: { proyeccion: [{ fecha: '2026-10-25', saldo: a }, { fecha: '2026-11-24', saldo: b }, { fecha: '2027-12-31', saldo: b }] } });
    ok(cp && cp(ser(5000, 9000), { saldo_hoy: { v: 5000 }, cambio_30d: { v: 4000 } }) > 0 && cp(ser(5000, 1000), { saldo_hoy: { v: 5000 }, cambio_30d: { v: -4000 } }) < 0 && /var bank = 0;/.test(pfdSrc) && /rotate\(' \+ \(90 - pitch\)/.test(pfdSrc), 'horizon: nose follows the map curve (up when it rises, down when it falls), no banking, map plane tilts the same'); }
  ok(/Pagos de hoy/.test(pfdSrc) && /data-pago-id/.test(pfdSrc) && /window\.sfOpenEdit\(id/.test(pfdSrc) && /window\.sfOpenEdit = function/.test(ui), 'RESUMEN: Pagos de hoy card, each payment opens Editar movimiento');
  ok(['HOY', 'MÍNIMO', 'TRIMESTRE', 'PAGOS', 'RITMO', 'ALERTAS'].every(k => pfdSrc.includes("'" + k + "'")), 'panel softkeys: HOY, MÍNIMO, TRIMESTRE, PAGOS, RITMO, ALERTAS');
  ok(!/sf-kpi|function drawKpi/.test(ui), 'the big health % card is gone');
  ok(!/<th>Categoría<\/th>/.test(ui) && /sf-hide-m/.test(ui), 'movements table: no Categoría column, Estado hidden on phones');
  ok(/getElementById\('sfChat'\)\.innerHTML = ''/.test(ui) && /var last = j\.data\[j\.data\.length - 1\]/.test(ui), 'chat shows only the latest question and answer');

  console.log('\n[3] Lina model path (fake client)');
  const fake = (finalText) => {
    let n = 0;
    return { messages: { create: async () => (n++ === 0
      ? { content: [{ type: 'tool_use', id: 't1', name: 'obtener_salud', input: {} }] }
      : { content: [{ type: 'text', text: finalText }] }) } };
  };
  const OPEN = '¿Vale la pena adelantar algún pago?';
  r = await lina.answer('¿Cómo estoy?', rows, o, { client: fake('no debería llamarse'), model: 'x' });
  ok(r.composed_by === 'lina', 'recognised intent never goes to the model');
  r = await lina.answer(OPEN, rows, o, { client: fake('Tu salud está en 62.7%, verde. Tu punto más bajo es $68.48 el 11 de diciembre.'), model: 'x' });
  ok(r.composed_by === 'model', 'model reply with sourced numbers is kept', r);
  r = await lina.answer(OPEN, rows, o, { client: fake('Tu salud está en 81%, y tienes $12,345.00.'), model: 'x' });
  ok(!/12,345/.test(r.texto) && /cifras sin fuente/.test(r.motivo_respaldo || ''), 'model reply with an invented number is discarded', r.motivo_respaldo);
  const writer = { messages: { create: (() => { let n = 0; return async () => (n++ === 0
    ? { content: [{ type: 'tool_use', id: 't1', name: 'agregar_movimiento', input: { tipo: 'egreso', monto: '45', concepto: 'Comida', categoria: 'gasto_personal' } }] }
    : { content: [{ type: 'text', text: '¿Registro un gasto de $45.00 hoy? ¿Lo registro?' }] }); })() } };
  r = await lina.answer('quiero que me ayudes con algo de comida que salió por 45', rows, o, { client: writer, model: 'x' });
  ok(r.propuesta && r.propuesta.accion === 'agregar_movimiento' && rows.length === 37, 'model agregar_movimiento returns a proposal and writes nothing');
}

function structuralTests() {
  console.log('\n[4] Structure (source greps)');
  const linaSrc = fs.readFileSync(path.join(__dirname, 'src/services/saludFinanciera/lina.js'), 'utf8');
  ok(!/require\(['"]\.\/store['"]\)|insertRow|sequelize/.test(linaSrc), 'lina.js has no database access (cannot write)');
  const route = fs.readFileSync(path.join(__dirname, 'src/routes/saludFinanciera.js'), 'utf8');
  ok(!/req\.body[^\n]*user_id\s*[,)]|req\.body\.user_id|req\.query\.user_id/.test(route.replace(/delete b\.user_id;/, '')), 'route never reads user_id from the request');
  const app = fs.readFileSync(path.join(__dirname, 'dashboard/assets/app.js'), 'utf8');
  const home = app.slice(app.indexOf('function initLinaOrb'), app.indexOf('function initLinaOrb') + 30000);
  ok(!/salud-financiera|saludFinanciera|sfApi/i.test(home), 'Home Lina summary carries no financial data');
  const engineSrc = fs.readFileSync(path.join(__dirname, 'src/services/saludFinanciera/engine.js'), 'utf8');
  ok(!/parseFloat/.test(engineSrc), 'engine never parses money as float');
  const html = fs.readFileSync(path.join(__dirname, 'dashboard/index.html'), 'utf8');
  const i1 = html.indexOf('To-Do List'), i2 = html.indexOf('Salud Financiera'), i3 = html.indexOf('data-view="settings"');
  ok(i1 < i2 && i2 < i3 && /id="nav-salud-financiera" style="display:none"/.test(html), 'nav item after To-Do List, before Settings, hidden until the API says owner');
}

async function apiTests() {
  console.log('\n[5] API + database (throwaway users 990097/990098)');
  const { sequelize } = require('./src/models');
  const route = require('./src/routes/saludFinanciera');
  route._deps.today = () => TODAY;
  route._deps.modelClient = false; // force the keyless path
  const { authenticateToken } = require('./src/middleware/auth');
  const app = express(); app.use(express.json());
  app.use('/api/salud-financiera', authenticateToken, route);
  const server = app.listen(0); const base = 'http://127.0.0.1:' + server.address().port + '/api/salud-financiera';
  const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
  const tok = (userId, email) => jwt.sign({ userId, email, clientId: 990015 }, secret, { expiresIn: '1h' });
  const A = tok(990097, 'sit-sf-a@example.test'), B = tok(990098, 'sit-sf-b@example.test');
  const STRANGER = tok(990099, 'sit-sf-z@example.test'), WRONGMAIL = tok(990097, 'sit-sf-z@example.test');
  const call = async (p, t, method = 'GET', body) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: body && method !== 'GET' ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j };
  };
  const clean = async () => {
    await sequelize.query('DELETE FROM sf_movimientos WHERE user_id IN (990097,990098)').catch(() => {});
    await sequelize.query('DELETE FROM sf_conversaciones_lina WHERE user_id IN (990097,990098)').catch(() => {});
    await sequelize.query('DELETE FROM sf_config WHERE user_id IN (990097,990098)').catch(() => {});
    await sequelize.query('DELETE FROM sf_cambios WHERE user_id IN (990097,990098)').catch(() => {});
    await sequelize.query('DELETE FROM sf_recurrentes WHERE user_id IN (990097,990098)').catch(() => {});
    for (const tb of ['sf_plaid_txn', 'sf_plaid_accounts', 'sf_plaid_items', 'sf_plaid_recurrentes', 'sf_alertas', 'sf_categoria_reglas']) await sequelize.query('DELETE FROM ' + tb + ' WHERE user_id IN (990097,990098)').catch(() => {});
    await sequelize.query("DELETE FROM sf_plaid_webhooks WHERE item_id IN ('sit-item-1','sit-item-2','someone-else')").catch(() => {});
    await sequelize.query("DELETE FROM d2_user_access WHERE email LIKE 'sit-sf-%@example.test'").catch(() => {});
  };
  try {
    await clean();
    for (const [p, m] of [['/salud', 'GET'], ['/movimientos', 'GET'], ['/lina', 'POST'], ['/simular', 'POST']]) {
      ok((await call(p, null, m, { pregunta: 'hola' })).s === 401, `no session -> 401 ${m} ${p}`);
      ok((await call(p, STRANGER, m, { pregunta: '¿Cómo estoy hoy?' })).s === 404, `other user -> 404 ${m} ${p}`);
    }
    ok((await call('/salud', WRONGMAIL)).s === 404, 'owner id with a non-owner email -> 404');
    let r = await call('/salud', A);
    ok(r.s === 200 && near(r.j.score, 63, 0.5) && r.j.color === 'verde' && r.j.cierre_mes_actual.saldo === '$4,568.48' && r.j.cierre_ultimo_mes.saldo === '$4,468.48' && r.j.cierre_fin_de_ano.mes === '2026-12' && r.j.cierre_fin_de_ano.saldo === '$3,668.48' && r.j.cierres_proximos.map(c => c.mes + ' ' + c.saldo).join() === '2026-11 $1,868.48,2026-12 $3,668.48,2027-01 $4,468.48' && r.j.cierres_trimestre.map(c => c.mes).join() === '2026-10,2026-11,2026-12' && r.j.semana.proxima_semana === '$200.00' && r.j.zona.desde === '2026-12-06' && r.j.tendencia.sube === false && r.j.obligaciones.cubiertas === r.j.obligaciones.total && r.j.saldo_min === '$68.48' && r.j.fecha_min === '2026-12-11', 'GET /salud on seed: ~63 verde, cierre octubre $4,568.48, cierre enero $4,468.48, all payments covered, $68.48 on 2026-12-11', r.j);
    { const P = r.j.pfd;
      ok(P && P.saldo_hoy.t === '$8,968.48' && P.saldo_min.t === '$68.48' && P.fecha_min === '2026-12-11', 'instrument panel: altimeter and MIN bug are the engine figures', P);
      ok(Math.round((P.entra_30.v - P.sale_30.v) * 100) === Math.round(P.flujo_30.v * 100) && P.saldo_7d.t === '$4,568.48' && Math.round((P.saldo_7d.v - P.saldo_hoy.v) * 100) === Math.round(P.cambio_7d.v * 100), 'instrument panel: flow and 7-day change are consistent sums', [P.flujo_30, P.saldo_7d, P.cambio_7d]);
      ok(P.proximo_pago && P.proximo_pago.concepto === 'Inversión' && P.proximo_pago.dias === 5, 'instrument panel: next payment and days to it'); }
    { const dic = r.j.minimos_mes.find(m => m.mes === '2026-12');
      ok(r.j.minimos_mes[0].mes === '2026-10' && dic && dic.minimo === '$68.48' && dic.fecha === '2026-12-11', 'minimum by month: December 2026 is $68.48 on the 11th', dic); }
    r = await call('/movimientos', A);
    ok(r.j.data.length === 37 && r.j.data.every(x => x.origen === 'plan'), 'seed: 37 plan rows');
    ok(r.j.data.some(x => x.fecha === '2026-12-11' && x.es_minimo) && r.j.data[r.j.data.length - 1].saldo === '$4,468.48', 'table: running balance + low point flagged');
    // seed runs once even after deleting a row
    await call('/movimientos/' + r.j.data[0].id, A, 'DELETE');
    ok((await call('/movimientos', A)).j.data.length === 36, 'deleting a row never re-seeds');
    // B is a separate owner: cannot see or touch A's rows
    const aRow = r.j.data[5];
    ok((await call('/movimientos', B)).j.data.every(x => x.id !== aRow.id), 'user B cannot list user A rows');
    ok((await call('/movimientos/' + aRow.id, B, 'PATCH', { concepto: 'hack' })).s === 404, 'user B cannot PATCH user A row');
    ok((await call('/movimientos/' + aRow.id, B, 'DELETE')).s === 404, 'user B cannot DELETE user A row');
    // POST ignores user_id / tenant_id / origen from the body
    r = await call('/movimientos', A, 'POST', { fecha: TODAY, concepto: 'Prueba', tipo: 'egreso', monto: '50', categoria: 'otro', user_id: 990098, tenant_id: 1, origen: 'plan' });
    ok(r.s === 201 && r.j.data.origen === 'real', 'POST creates a real movement, body origen ignored');
    const [[own]] = await sequelize.query('SELECT user_id, tenant_id FROM sf_movimientos WHERE id = :id', { replacements: { id: r.j.data.id } });
    ok(own.user_id === 990097 && own.tenant_id === 990015, 'row owned by the session user, not the body');
    ok((await call('/movimientos', A, 'POST', { fecha: TODAY, concepto: 'x', tipo: 'egreso', monto: '-5', categoria: 'otro' })).s === 400, 'negative amount refused');
    const planRow = (await call('/movimientos', A)).j.data.find(x => x.origen === 'plan' && x.concepto === 'Casa de mi hija');
    r = await call('/movimientos/' + planRow.id, A, 'PATCH', { fecha: '2026-12-02', monto: '4200', concepto: 'Casa de mi hija (ajuste)' });
    ok(r.s === 200 && r.j.data.fecha === '2026-12-02' && r.j.data.monto === '4200.00' && r.j.data.origen === 'plan', 'edit a plan row: date, amount and concept change, it stays a plan row');
    ok((await call('/movimientos/' + planRow.id, A, 'PATCH', { monto: 'abc' })).s === 400, 'edit with an invalid amount is refused');
    ok((await call('/movimientos', A, 'POST', { fecha: '2026-02-30', concepto: 'x', tipo: 'egreso', monto: '5', categoria: 'otro' })).s === 400, 'impossible date refused');
    await call('/movimientos/' + r.j.data.id, A, 'DELETE');
    // Lina over HTTP
    const n0 = (await call('/movimientos', A)).j.data.length;
    r = await call('/lina', A, 'POST', { pregunta: 'Si compro algo de $300 hoy, ¿cómo quedo?', canal: 'voz' });
    ok(r.s === 200 && /negativo/.test(r.j.texto) && (await call('/movimientos', A)).j.data.length === n0, 'Lina "$300 hoy": negativo, nothing saved');
    r = await call('/lina', A, 'POST', { pregunta: 'Hoy gasté $45' });
    ok(/¿Registro/.test(r.j.texto) && r.j.propuesta && (await call('/movimientos', A)).j.data.length === n0, 'Lina "Hoy gasté $45": asks, nothing saved yet');
    r = await call('/lina/historial', A);
    ok(r.j.data.length === 2 && (await call('/lina/historial', B)).j.data.length === 0, 'conversations stored only for the asking user');
    // Conversation that writes: agrega -> sí -> written + explained; borra -> sí -> removed.
    r = await call('/lina', B, 'POST', { pregunta: 'sí' });
    ok(!r.j.cambio && (await call('/movimientos', A)).j.data.length === n0, "user B saying 'sí' never executes user A's pending change");
    r = await call('/lina', B, 'POST', { pregunta: 'agrega un gasto de 45 en comida' });
    ok(r.j.pendiente === true && /¿Registro un egreso de \$45\.00 hoy/.test(r.j.texto) && (await call('/movimientos', B)).j.data.length === 37, 'agrega gasto: asks, nothing written yet');
    r = await call('/lina', B, 'POST', { pregunta: 'sí', propuesta: { accion: 'agregar_movimiento', datos: { fecha: TODAY, concepto: 'x', tipo: 'egreso', monto: '99999', categoria: 'otro' } } });
    let list = (await call('/movimientos', B)).j.data;
    const added = list.find(x => x.origen === 'real');
    ok(r.j.cambio && added && added.monto === '45.00' && added.concepto === 'Comida', "'sí' writes the STORED proposal (45 Comida), never one sent by the page");
    ok(/^Listo, registré un egreso de \$45\.00 hoy/.test(r.j.texto) && /presupuesto semanal/.test(r.j.texto) && /salud/i.test(r.j.texto), 'after writing, Lina explains how the projection changed', r.j.texto);
    r = await call('/lina', B, 'POST', { pregunta: 'sí' });
    ok(!r.j.cambio && (await call('/movimientos', B)).j.data.length === list.length, 'a second sí executes nothing (no double write)');
    r = await call('/lina', B, 'POST', { pregunta: 'borra el gasto de 45' });
    ok(r.j.pendiente === true && /¿Borro/.test(r.j.texto), 'borra el gasto de 45 -> asks');
    r = await call('/lina', B, 'POST', { pregunta: 'sí' });
    ok(r.j.cambio && !(await call('/movimientos', B)).j.data.some(x => x.origen === 'real'), 'sí -> gasto borrado');
    r = await call('/lina', B, 'POST', { pregunta: '¿Cuánto voy a tener el 1 de diciembre?' });
    ok(/\$1,868\.48/.test(r.j.texto), 'HTTP: saldo al 1 de diciembre', r.j.texto);
    r = await call('/lina', B, 'POST', { pregunta: 'súmale un ingreso de 1000 el 28 de noviembre' });
    r = await call('/lina', B, 'POST', { pregunta: 'dale' });
    ok(r.j.cambio && /El 28 de noviembre tendrás \$7,368\.48 \(antes \$6,368\.48\)/.test(r.j.texto) && /punto más bajo pasa de \$68\.48/.test(r.j.texto), 'income confirmed: explains the new balance and low point', r.j.texto);
    r = await call('/recurrentes', B, 'POST', { concepto: 'Internet', monto: '150', dia: 'fin' });
    ok(r.s === 201 && r.j.proyectados > 0 && r.j.fechas[0] === '2026-10-31', 'POST /recurrentes projects the bill from today to the plan end', r.j);
    ok((await call('/recurrentes', A)).j.data.length === 0, 'user A cannot see user B recurring bills');
    ok((await call('/recurrentes/' + r.j.data.id, A, 'DELETE')).s === 404, 'user A cannot delete user B recurring bill');
    const nB = (await call('/movimientos', B)).j.data.filter(x => x.concepto === 'Internet').length;
    r = await call('/recurrentes/' + r.j.data.id, B, 'DELETE');
    ok(r.j.borrados === nB && !(await call('/movimientos', B)).j.data.some(x => x.concepto === 'Internet'), 'deactivating removes its pending future rows');
    ok((await call('/recurrentes', B, 'POST', { concepto: 'x', monto: '-5', dia: 3 })).s === 400, 'recurring bill with a negative amount refused');
    r = await call('/simular', A, 'POST', { movimientos: [{ monto: '300', tipo: 'egreso' }] });
    ok(r.j.guardado === false && r.j.despues.dias_negativos.length > 0, 'POST /simular never saves');
    r = await call('/plan/extender', A, 'POST', { meses: 1 });
    const r2 = await call('/plan/extender', A, 'POST', { meses: 0 });
    ok(r.j.creados > 0 && r2.j.creados >= 0, 'extender plan creates rows');
    { // own scope for section [6]
    // ---------------- [6] Lina's brain (model-first, fake scripted client) ----------------
    console.log('\n[6] Cerebro de Lina (scripted fake model)');
    const cerebro = require('./src/services/saludFinanciera/cerebro');
    const lastResult = (p) => { const m = p.messages[p.messages.length - 1]; const tr = Array.isArray(m.content) ? m.content.find(c => c.type === 'tool_result') : null; return tr ? JSON.parse(tr.content) : null; };
    const script = (steps) => { let i = 0; const calls = []; return { calls, messages: { create: async (p) => { calls.push(p); const st = steps[Math.min(i++, steps.length - 1)]; return typeof st === 'function' ? st(p) : st; } } }; };
    const use = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu' + Math.random(), name, input }] });
    const say = (text) => ({ content: [{ type: 'text', text }] });
    const movB = async () => (await call('/movimientos', B)).j.data;
    await sequelize.query("DELETE FROM sf_cambios WHERE user_id IN (990097,990098)");

    // "gasto de 50 dólares personales el día de hoy" -> written at once
    route._deps.modelClient = script([use('agregar_movimiento', { tipo: 'egreso', monto: '50', concepto: 'Gasto personal', categoria: 'gasto_personal' }),
      (p) => { const r = lastResult(p); return say('Listo: ' + r.hecho + '. Dime "deshaz" si me equivoqué.'); }]);
    let before = (await movB()).length; let r;
    r = await call('/lina', B, 'POST', { pregunta: 'gasto de 50 dólares personales el día de hoy' });
    let list = await movB();
    const added50 = list.find(x => x.origen === 'real' && x.monto === '50.00' && x.categoria === 'gasto_personal' && x.fecha === TODAY);
    ok(r.j.composed_by === 'claude' && added50 && list.length === before + 1 && r.j.cambios.length === 1, 'brain: "gasto de 50 dólares personales hoy" is written immediately as gasto personal', r.j);
    ok(/50\.00/.test(r.j.texto) && /deshaz/.test(r.j.texto), 'brain: says what it did and offers undo', r.j.texto);

    // "remueve esos 50 dólares..." -> search then delete by the id the search returned
    route._deps.modelClient = script([use('buscar_movimientos', { monto: '50', origen: 'real', categoria: 'gasto_personal' }),
      (p) => { const r = lastResult(p); return use('borrar_movimiento', { id: r.movimientos[0].id }); },
      (p) => say('Listo: ' + lastResult(p).hecho + '.')]);
    r = await call('/lina', B, 'POST', { pregunta: 'remueve esos 50 dólares de gastos personales que pusimos hoy' });
    ok(r.j.cambios.length === 1 && !(await movB()).some(x => x.id === added50.id), 'brain: "remueve esos 50..." finds the row and deletes it');

    // "deshaz" -> the deleted row comes back
    route._deps.modelClient = script([use('deshacer_ultimo_cambio', {}), (p) => say(lastResult(p).hecho + '.')]);
    r = await call('/lina', B, 'POST', { pregunta: 'deshaz eso' });
    ok((await movB()).some(x => x.origen === 'real' && x.monto === '50.00' && x.categoria === 'gasto_personal'), 'brain: "deshaz" restores the deleted movement');

    // memory: the next call carries the previous exchange
    const mem = script([say('Sí, lo recuerdo.')]);
    route._deps.modelClient = mem;
    await call('/lina', B, 'POST', { pregunta: '¿te acuerdas?' });
    ok(JSON.stringify(mem.calls[0].messages).includes('remueve esos 50'), 'brain: conversation memory comes from the server');

    // preferences are saved and reach the next system prompt
    route._deps.modelClient = script([use('guardar_preferencia', { texto: 'La inversión no es negociable' }), say('Entendido, la inversión no se toca.')]);
    await call('/lina', B, 'POST', { pregunta: 'la inversión no es negociable' });
    const pref = script([say('Ok.')]);
    route._deps.modelClient = pref;
    await call('/lina', B, 'POST', { pregunta: 'hola' });
    ok(JSON.stringify(pref.calls[0].system).includes('La inversión no es negociable'), 'brain: a saved rule reaches every later system prompt');

    // number guard: an invented figure is sent back once; a sourced retry is kept
    const guard = script([use('situacion_actual', {}), say('Tienes $12,345.67 y vas bien.'), (p) => say('Tu salud está en ' + 'según la herramienta.')]);
    route._deps.modelClient = guard;
    r = await call('/lina', B, 'POST', { pregunta: '¿cuál es la situación el día de hoy?' });
    ok(guard.calls.length === 3 && /Control de cifras/.test(JSON.stringify(guard.calls[2].messages)) && !/12,345/.test(r.j.texto), 'brain: invented figure -> sent back once, never shown', r.j.texto);
    route._deps.modelClient = script([say('Tienes $99,999.99.'), say('Sigues teniendo $88,888.88.')]);
    r = await call('/lina', B, 'POST', { pregunta: '¿cómo estoy?' });
    ok(r.j.composed_by !== 'claude' && /cifras sin fuente/.test(r.j.motivo_respaldo || '') && !/99,999|88,888/.test(r.j.texto), 'brain: inventing twice -> discarded, rules answer with the reason');

    // model down -> rules, and the status line says why
    route._deps.modelClient = { messages: { create: async () => { throw new Error('credit balance is too low'); } } };
    r = await call('/lina', B, 'POST', { pregunta: '¿cuánto tendré el 1 de diciembre?' });
    ok(r.j.composed_by !== 'claude' && /credit balance/.test(r.j.motivo_respaldo || '') && /1 de diciembre/.test(r.j.texto), 'brain down -> rule reader answers, with the reason');
    ok(/credit balance/.test((await call('/lina/estado', B)).j.ultimo_error || ''), '/lina/estado reports the last brain error');

    // calculation tools, called directly
    const ctxB = { sequelize, user: { userId: 990098, tenantId: 990015 }, today: TODAY, opts: {} };
    const { tools } = cerebro.makeTools(ctxB);
    const ritmo = await tools.proyectar_al_ritmo({ dias: 7 });
    ok(ritmo.hasta === '2026-11-01' && /Muestra corta/.test(ritmo.basado_en.nota || '') && ritmo.saldo_en_esa_fecha_al_ritmo, '"¿cómo voy a estar en una semana al mismo ritmo?" -> projection with the short-sample warning', ritmo);
    const rango = await tools.saldo_en_rango({ desde: '2026-12-12', hasta: '2026-12-18' });
    ok(rango.mas_bajo && rango.saldo_al_terminar && rango.movimientos.length > 0, 'saldo_en_rango: low, end and movements of a week', rango);
    const sim = await tools.simular({ movimientos: [{ tipo: 'egreso', monto: '1000', fecha: TODAY }], consultar_desde: '2026-12-19', consultar_hasta: '2026-12-25' });
    ok(sim.guardado === false && sim.rango && toCents(sim.rango.antes.al_terminar) - toCents(sim.rango.despues.al_terminar) === 100000, '"si gasto $1,000 extra" in a December week -> exactly $1,000 lower, nothing saved');
    ok(!cerebro.TOOL_DEFS.some(t => /user|tenant/i.test(JSON.stringify(t.input_schema))), 'no tool accepts a user or tenant argument');
    ok(cerebro.unsourced('Tienes $8,948.48 el 6 de diciembre', cerebro.allowedFrom(['"$8,948.48"'])).length === 0 && cerebro.unsourced('Tienes $8,949', cerebro.allowedFrom(['"$8,948.48"'])).length === 1, 'number guard: copied figure passes, altered figure is caught');
    // a model id the account does not have -> the next one answers
    const tried = [];
    route._deps.modelClient = { messages: { create: async (p) => { tried.push(p.model); if (tried.length === 1) { const e = new Error('model: not_found_error'); e.status = 404; throw e; } return { content: [{ type: 'text', text: 'Hola, aquí estoy.' }] }; } } };
    r = await call('/lina', B, 'POST', { pregunta: 'hola' });
    ok(r.j.composed_by === 'claude' && tried.length === 2 && tried[0] !== tried[1], 'missing model id -> the next model in the chain answers', tried);
    route._deps.modelClient = false;
    }

    try { await plaidTests({ call, A, B, sequelize }); } catch (e) { fail++; console.log('  FAIL plaid section crashed:', e.stack); }
  } finally {
    await clean();
    server.close();
    await sequelize.close();
  }
}


// ---------------------------------------------------------------------------
// [7] Bank of America via Plaid — fake Plaid transport, zero keys, real DB with throwaway users
// ---------------------------------------------------------------------------
async function plaidTests({ call, A, B, sequelize }) {
  console.log('\n[7] Plaid (fake transport, throwaway users)');
  const crypto = require('crypto');
  const plaid = require('./src/services/saludFinanciera/plaidClient');
  const psync = require('./src/services/saludFinanciera/plaidSync');
  const verifier = require('./src/services/saludFinanciera/plaidWebhook');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const saved = { id: process.env.PLAID_CLIENT_ID, sec: process.env.PLAID_SECRET, key: process.env.SALUD_FINANCIERA_PLAID_KEY, env: process.env.PLAID_ENV };
  delete process.env.PLAID_CLIENT_ID; delete process.env.PLAID_SECRET; delete process.env.SALUD_FINANCIERA_PLAID_KEY; process.env.PLAID_ENV = 'sandbox';

  let r = await call('/plaid/estado', A);
  ok(r.s === 200 && r.j.data.configurado === false && r.j.data.falta.length === 3, 'no Plaid env -> estado says not configured and names what is missing', r.j);
  ok((await call('/plaid/link-token', A, 'POST')).s === 503, 'no Plaid env -> link-token 503, nothing faked');

  process.env.PLAID_CLIENT_ID = 'sit-client'; process.env.PLAID_SECRET = 'sit-secret'; process.env.SALUD_FINANCIERA_PLAID_KEY = 'sit-key-0123456789-0123456789-abcdef';
  const ACCESS = 'access-sandbox-SITSECRET-0001';
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = { ...ec.publicKey.export({ format: 'jwk' }), kid: 'sit-kid-1', alg: 'ES256', use: 'sig', created_at: 1, expired_at: null };
  const calls = []; let syncQueue = []; let cursorN = 0; let syncFailOnce = false; let exchangeItem = 'sit-item-1'; let keyCalls = 0; let recurringMode = 'unsupported'; let recurringStreams = []; let acctsBiz = false;
  plaid.setTransport(async (p, body) => {
    calls.push({ p, body });
    if (['/item/get', '/accounts/get', '/transactions/sync', '/transactions/recurring/get', '/item/remove'].includes(p) && body.access_token !== ACCESS) throw Object.assign(new Error('bad token'), { status: 400, code: 'INVALID_ACCESS_TOKEN' });
    if (p === '/link/token/create') return { link_token: 'link-sandbox-sit', expiration: '2030-01-01T00:00:00Z' };
    if (p === '/item/public_token/exchange') return { access_token: ACCESS, item_id: exchangeItem };
    if (p === '/accounts/get' && acctsBiz) return { accounts: [{ account_id: 'acc-biz', name: 'Business Adv Fundamentals', mask: '2619', type: 'depository', subtype: 'checking' }] };
    if (p === '/accounts/get') return { accounts: [{ account_id: 'acc-chk', name: 'Adv Plus Banking', mask: '1234', type: 'depository', subtype: 'checking' }, { account_id: 'acc-cc', name: 'Customized Cash', mask: '9876', type: 'credit', subtype: 'credit card' }] };
    if (p === '/item/get') return { item: { item_id: 'sit-item-1', institution_id: 'ins_127989', consent_expiration_time: new Date(Date.now() + 365 * 864e5).toISOString() } };
    if (p === '/transactions/sync' && syncFailOnce) { syncFailOnce = false; throw Object.assign(new Error('plaid down'), { status: 500, code: 'INTERNAL_SERVER_ERROR' }); }
    if (p === '/transactions/sync') { const page = syncQueue.shift(); cursorN++; return page ? { has_more: false, next_cursor: 'cur-' + cursorN, transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE', ...page } : { added: [], modified: [], removed: [], has_more: false, next_cursor: 'cur-' + cursorN, transactions_update_status: 'HISTORICAL_UPDATE_COMPLETE' }; }
    if (p === '/transactions/recurring/get') { if (recurringMode === 'unsupported') throw Object.assign(new Error('not enabled'), { status: 400, code: 'PRODUCTS_NOT_SUPPORTED' }); return { outflow_streams: recurringStreams, inflow_streams: [] }; }
    if (p === '/item/remove') return { request_id: 'x' };
    if (p === '/webhook_verification_key/get') { keyCalls++; return body.key_id === jwk.kid ? { key: jwk } : {}; }
    throw new Error('unexpected ' + p);
  });

  // --- link token: transactions only, 730 days, Spanish, our webhook ---
  r = await call('/plaid/link-token', A, 'POST');
  const lt = calls.filter(c => c.p === '/link/token/create').pop();
  ok(r.s === 200 && r.j.data.link_token === 'link-sandbox-sit', 'link-token returns the Plaid link token');
  ok(lt && JSON.stringify(lt.body.products) === '["transactions"]' && lt.body.transactions.days_requested === 730 && lt.body.language === 'en' && /\/plaid\/webhook$/.test(lt.body.webhook) && !lt.body.access_token, 'link token: products = transactions ONLY, 730 days, en, webhook set', lt && lt.body);
  ok(lt && !/auth|transfer|identity|signal|payment/i.test(JSON.stringify(lt.body.products) + JSON.stringify(lt.body.required_if_supported_products || []) + JSON.stringify(lt.body.additional_consented_products || [])), 'no Auth/Transfer/Identity/Signal/payment product is ever requested');

  // --- exchange ---
  ok((await call('/plaid/exchange', A, 'POST', { public_token: 'not-a-token' })).s === 400, 'malformed public_token refused');
  r = await call('/plaid/exchange', A, 'POST', { public_token: 'public-sandbox-abcdef12-3456', institution: { name: 'Bank of America', institution_id: 'ins_127989' } });
  ok(r.s === 201 && r.j.data.item_id === 'sit-item-1' && !JSON.stringify(r.j).includes('access'), 'exchange stores the item; the response carries no access token', r.j);
  await sleep(300);
    // role per account: only valid roles, one account per role, scoped to the owner
  const [[accR]] = await sequelize.query("SELECT a.id FROM sf_plaid_accounts a JOIN sf_plaid_items i ON i.item_id = a.item_id WHERE a.user_id = 990097 AND i.estado <> 'desconectado' LIMIT 1");
  if (accR) {
    ok((await call('/plaid/cuentas/' + accR.id, A, 'PATCH', { rol: 'jefe' })).s === 400, 'account role: an unknown role is refused');
    ok((await call('/plaid/cuentas/' + accR.id, A, 'PATCH', { rol: 'corte' })).s === 200, 'account role: the owner marks the Corte account');
    const est = await call('/plaid/estado', A, 'GET');
    ok(est.s === 200 && est.j.data.reserva && ['sin_saldo', 'cubierto', 'en_camino', 'faltante', 'insuficiente', 'sin_corte'].includes(est.j.data.reserva.estado), 'the bank status carries the Corte reserve', est.j.data && est.j.data.reserva);
  }
  await sleep(800); // the first background sync (empty) runs
  const [[it]] = await sequelize.query("SELECT * FROM sf_plaid_items WHERE item_id = 'sit-item-1'");
  ok(it && !String(it.access_token_enc).includes('SITSECRET') && plaid.decrypt(it.access_token_enc) === ACCESS, 'access token stored ENCRYPTED (AES-256-GCM) and decrypts back');
  r = await call('/plaid/estado', A);
  ok(r.s === 200 && r.j.data.items.length === 1 && !JSON.stringify(r.j).includes('SITSECRET') && !JSON.stringify(r.j).includes('access_token'), 'estado lists the bank with no token in any form');
  const cuentas = r.j.data.items[0].cuentas;
  ok(cuentas.find(c => c.subtipo === 'checking').incluir === true && cuentas.find(c => c.tipo === 'credit').incluir === false, 'only CHECKING counts by default (card off, owner decision)', cuentas);
  ok((await call('/plaid/estado', B)).j.data.items.length === 0, 'user B sees none of user A\'s bank');
  ok((await call('/plaid/cuentas/' + cuentas[0].id, B, 'PATCH', { incluir: false })).s === 404 && (await call('/plaid/item/' + it.id, B, 'DELETE')).s === 404, 'user B cannot touch user A\'s accounts or item');

  // --- first real sync: plan match, manual link, new row, excluded card, old history ---
  const desde = (await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' })).importar_desde;
  const [[plan]] = await sequelize.query("SELECT id, fecha::text AS fecha, monto::text AS monto FROM sf_movimientos WHERE user_id = 990097 AND origen = 'plan' AND estado = 'pendiente' AND tipo = 'egreso' AND categoria = 'corte' ORDER BY fecha LIMIT 1");
  const add = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const man = await call('/movimientos', A, 'POST', { fecha: plan.fecha, concepto: 'Café a mano', tipo: 'egreso', monto: '12.34', categoria: 'gasto_personal' });
  const count = async () => Number((await sequelize.query('SELECT COUNT(*)::int AS n FROM sf_movimientos WHERE user_id = 990097'))[0][0].n);
  const n0 = await count();
  const T = (id, acct, date, amount, extra = {}) => ({ transaction_id: id, account_id: acct, date, name: extra.name || 'TX ' + id, merchant_name: extra.merchant || null, amount, pending: !!extra.pending, pending_transaction_id: extra.pid || null, personal_finance_category: extra.pfc || null });
  const firstPage = { added: [
    T('txA', 'acc-chk', add(plan.fecha, 2), Number(plan.monto), { name: 'BANK OF AMERICA CREDIT CARD PAYMENT', pfc: { primary: 'LOAN_PAYMENTS', detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' } }),
    T('txB', 'acc-chk', plan.fecha, 45.67, { merchant: 'Starbucks', pending: true, pfc: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } }),
    T('txC', 'acc-cc', plan.fecha, 99, { merchant: 'Amazon', pfc: { primary: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES' } }),
    T('txD', 'acc-chk', '2025-01-15', 300, { merchant: 'Old store' }),
    T('txF', 'acc-chk', add(plan.fecha, 1), 12.34, { merchant: 'Café local' })
  ], modified: [], removed: [] };
  syncQueue.push(firstPage);
  const it1 = await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' });
  let st = await psync.syncItem(sequelize, it1, { today: TODAY });
  const [[pl]] = await sequelize.query('SELECT estado, monto_real::text AS mr FROM sf_movimientos WHERE id = :id', { replacements: { id: plan.id } });
  ok(pl.estado === 'cumplido' && Number(pl.mr) === Number(plan.monto) && st.plan === 1, 'bank payment of the same amount within 5 days marks the PLAN row cumplido (no duplicate row)', { pl, st });
  const [[log]] = await sequelize.query("SELECT datos FROM sf_cambios WHERE user_id = 990097 AND accion = 'cumplido' ORDER BY id DESC LIMIT 1");
  ok(log && log.datos.banco === true && log.datos.antes.estado === 'pendiente', 'that automatic mark is logged in sf_cambios, so it can be undone');
  ok(st.manual === 1 && st.nuevos === 1, 'manual row linked (not duplicated), one new bank row (the coffee)', st);
  ok(await count() === n0 + 1, 'exactly one movement added for five bank transactions (card excluded, old history kept out, plan + manual matched)');
  const [[cof]] = await sequelize.query("SELECT m.* FROM sf_movimientos m JOIN sf_plaid_txn x ON x.mov_id = m.id WHERE x.transaction_id = 'txB'");
  ok(cof && cof.fuente === 'plaid' && cof.pendiente_banco === true && cof.categoria === 'gasto_personal' && cof.origen === 'real', 'new bank row: fuente plaid, pending, PFC v2 FOOD_AND_DRINK -> gasto_personal', cof);
  const [[cc]] = await sequelize.query("SELECT mov_id FROM sf_plaid_txn WHERE transaction_id = 'txC'");
  const [[old]] = await sequelize.query("SELECT mov_id FROM sf_plaid_txn WHERE transaction_id = 'txD'");
  ok(cc && cc.mov_id === null && old && old.mov_id === null, 'card transaction and pre-plan history are kept for detection but never reach the balance');
  const [[cur]] = await sequelize.query("SELECT cursor, historial_completo FROM sf_plaid_items WHERE item_id = 'sit-item-1'");
  ok(cur.cursor && cur.cursor.startsWith('cur-') && cur.historial_completo === true, 'cursor saved in the same transaction; historical status recorded');

  // --- idempotent: the same page again adds nothing ---
  syncQueue.push(firstPage);
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  ok(await count() === n0 + 1, 're-delivering the same transactions inserts nothing (dedupe by transaction_id)');

  // --- pending -> posted keeps the same movement ---
  syncQueue.push({ added: [T('txB-posted', 'acc-chk', add(plan.fecha, 1), 45.67, { merchant: 'Starbucks', pid: 'txB', pfc: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } })], modified: [], removed: [{ transaction_id: 'txB', account_id: 'acc-chk' }] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const [[cof2]] = await sequelize.query("SELECT m.id, m.pendiente_banco FROM sf_movimientos m JOIN sf_plaid_txn x ON x.mov_id = m.id WHERE x.transaction_id = 'txB-posted'");
  ok(cof2 && cof2.id === cof.id && cof2.pendiente_banco === false && await count() === n0 + 1, 'pending -> posted: SAME movement, no longer pending, no duplicate', { cof2 });

  // --- a pending that never posts is removed ---
  syncQueue.push({ added: [T('txG', 'acc-chk', add(plan.fecha, 3), 20, { pending: true, merchant: 'Gas' })], modified: [], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const nG = await count();
  syncQueue.push({ added: [], modified: [], removed: [{ transaction_id: 'txG', account_id: 'acc-chk' }] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  ok(nG === n0 + 2 && await count() === n0 + 1, 'a pending charge that disappears (removed) is deleted from the app', { nG });

  // --- removed plan match goes back to pendiente ---
  syncQueue.push({ added: [], modified: [], removed: [{ transaction_id: 'txA', account_id: 'acc-chk' }] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const [[pl2]] = await sequelize.query('SELECT estado, monto_real FROM sf_movimientos WHERE id = :id', { replacements: { id: plan.id } });
  ok(pl2.estado === 'pendiente' && pl2.monto_real === null, 'when the bank removes the matched payment, the plan row goes back to pendiente');

  // --- manual category survives a re-sync; owner-deleted row is never re-created ---
  await call('/movimientos/' + cof.id, A, 'PATCH', { categoria: 'otro' });
  syncQueue.push({ added: [], modified: [T('txB-posted', 'acc-chk', add(plan.fecha, 1), 45.67, { merchant: 'Starbucks', pfc: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } })], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const [[cof3]] = await sequelize.query('SELECT categoria, categoria_manual FROM sf_movimientos WHERE id = :id', { replacements: { id: cof.id } });
  ok(cof3.categoria === 'otro' && cof3.categoria_manual === true, 'a category set by hand is not overwritten by the bank', cof3);
  await call('/movimientos/' + cof.id, A, 'DELETE');
  syncQueue.push({ added: [], modified: [T('txB-posted', 'acc-chk', add(plan.fecha, 1), 46.00, { merchant: 'Starbucks' })], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  ok(await count() === n0, 'a bank movement the owner deleted is never re-created by a re-sync');

  // --- merchant rule ---
  syncQueue.push({ added: [T('txH', 'acc-chk', add(plan.fecha, 4), 8.5, { merchant: 'Chipotle', pfc: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_FAST_FOOD' } })], modified: [], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const [[chip]] = await sequelize.query("SELECT m.id FROM sf_movimientos m JOIN sf_plaid_txn x ON x.mov_id = m.id WHERE x.transaction_id = 'txH'");
  r = await call('/plaid/regla', A, 'POST', { movimiento_id: chip.id, categoria: 'servicios' });
  syncQueue.push({ added: [T('txI', 'acc-chk', add(plan.fecha, 5), 9.25, { merchant: 'Chipotle', pfc: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_FAST_FOOD' } })], modified: [], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const [[chip2]] = await sequelize.query("SELECT m.categoria FROM sf_movimientos m JOIN sf_plaid_txn x ON x.mov_id = m.id WHERE x.transaction_id = 'txI'");
  ok(r.s === 200 && chip2 && chip2.categoria === 'servicios', 'a merchant rule beats the Plaid category for future charges', { r: r.j, chip2 });
  ok((await call('/plaid/regla', B, 'POST', { movimiento_id: chip.id, categoria: 'otro' })).s === 404, 'user B cannot write a rule on user A\'s movement');

  // --- include / exclude an account re-applies with no Plaid call ---
  const ccRow = cuentas.find(c => c.tipo === 'credit');
  const before = calls.length;
  r = await call('/plaid/cuentas/' + ccRow.id, A, 'PATCH', { incluir: true });
  const [[ccOn]] = await sequelize.query("SELECT mov_id FROM sf_plaid_txn WHERE transaction_id = 'txC'");
  r = await call('/plaid/cuentas/' + ccRow.id, A, 'PATCH', { incluir: false });
  const [[ccOff]] = await sequelize.query("SELECT mov_id FROM sf_plaid_txn WHERE transaction_id = 'txC'");
  ok(ccOn.mov_id !== null && ccOff.mov_id === null && calls.length === before, 'switching the card on brings its rows in, off takes them out, without calling Plaid', { ccOn, ccOff });

  // --- recurring: Plaid add-on unavailable -> our detector, labelled ---
  const monthly = (id, d, amt, m) => T(id, 'acc-chk', d, amt, { merchant: m, pfc: { primary: 'ENTERTAINMENT', detailed: 'ENTERTAINMENT_TV_AND_MOVIES' } });
  syncQueue.push({ added: [monthly('nf1', add(TODAY, -62), 15.49, 'Netflix'), monthly('nf2', add(TODAY, -32), 15.49, 'Netflix'), monthly('nf3', add(TODAY, -2), 15.49, 'Netflix')], modified: [], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  let rec = await psync.recurring(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const [[itr]] = await sequelize.query("SELECT recurrencia FROM sf_plaid_items WHERE item_id = 'sit-item-1'");
  const [alerts1] = await sequelize.query("SELECT tipo, texto FROM sf_alertas WHERE user_id = 990097 ORDER BY id");
  ok(itr.recurrencia === 'detector' && rec.fuente === 'detector' && rec.streams >= 1, 'Recurring add-on not enabled -> falls back to our own detector', rec);
  ok(alerts1.some(a => a.tipo === 'resumen_recurrentes' && /Netflix/.test(a.texto) && /detectados por la app/.test(a.texto)), 'first run: ONE summary alert listing what was found, labelled as the app\'s detection', alerts1);
  syncQueue.push({ added: [monthly('nf4', add(TODAY, 28), 16.99, 'Netflix')], modified: [], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  await psync.recurring(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: add(TODAY, 30) });
  const [chg] = await sequelize.query("SELECT texto FROM sf_alertas WHERE user_id = 990097 AND tipo = 'cambio_monto'");
  ok(chg.length === 1 && /15\.49/.test(chg[0].texto) && /16\.99/.test(chg[0].texto), 'a recurring charge that changes amount raises a cambio_monto alert', chg);
  // Plaid's own streams when the add-on IS enabled
  await sequelize.query("UPDATE sf_plaid_items SET recurrencia = 'plaid' WHERE item_id = 'sit-item-1'");
  recurringMode = 'ok'; recurringStreams = [{ stream_id: 'st-spotify', merchant_name: 'Spotify', description: 'SPOTIFY', frequency: 'MONTHLY', status: 'MATURE', is_active: true, average_amount: { amount: 11.99 }, last_amount: { amount: 11.99 }, predicted_next_date: add(TODAY, 20), personal_finance_category: { primary: 'ENTERTAINMENT', detailed: 'ENTERTAINMENT_MUSIC_AND_AUDIO' } }];
  await psync.recurring(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const [ns] = await sequelize.query("SELECT texto FROM sf_alertas WHERE user_id = 990097 AND tipo = 'nueva_suscripcion'");
  ok(ns.some(a => /Spotify/.test(a.texto) && /mensual/.test(a.texto)), 'a NEW subscription from Plaid\'s streams raises a nueva_suscripcion alert', ns);
  await psync.recurring(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const [ns2] = await sequelize.query("SELECT id FROM sf_alertas WHERE user_id = 990097 AND tipo = 'nueva_suscripcion'");
  ok(ns2.length === ns.length, 'running the check again does not repeat the alert');

  // --- split paycheck: two same-day deposits confirm ONE plan Salario with their sum (owner 2026-10-26) ---
  const [[salS]] = await sequelize.query("SELECT id, fecha::text AS fecha, monto::text AS monto FROM sf_movimientos WHERE user_id = 990097 AND origen = 'plan' AND categoria = 'salario' AND estado = 'pendiente' AND fecha > :d ORDER BY fecha OFFSET 2 LIMIT 1", { replacements: { d: TODAY } });
  const salC = Math.round(Number(salS.monto) * 100), parteA = Math.round(salC * 0.7), parteB = salC - parteA;
  const nSplit = await count();
  const PAY = { primary: 'INCOME', detailed: 'INCOME_SALARY' };
  syncQueue.push({ added: [T('txSA', 'acc-chk', salS.fecha, -parteA / 100, { name: 'CITI PAYROLL DES:EDI PAYMNT', pfc: PAY }), T('txSB', 'acc-chk', salS.fecha, -parteB / 100, { name: 'CITI PAYROLL DES:EDI PAYMNT', pfc: PAY })], modified: [], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  let [[salRow]] = await sequelize.query('SELECT estado, monto_real::text AS mr FROM sf_movimientos WHERE id = :id', { replacements: { id: salS.id } });
  ok(salRow.estado === 'cumplido' && Math.round(Number(salRow.mr) * 100) === salC && await count() === nSplit, 'split paycheck: both deposits confirm ONE Salario with their sum, and no extra income row is created', { salRow, salC });
  syncQueue.push({ added: [], modified: [], removed: [{ transaction_id: 'txSB' }] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  [[salRow]] = await sequelize.query('SELECT estado, monto_real::text AS mr FROM sf_movimientos WHERE id = :id', { replacements: { id: salS.id } });
  ok(salRow.estado === 'cumplido' && Math.round(Number(salRow.mr) * 100) === parteA, 'split paycheck: if the bank removes one part, the Salario keeps only the other part', salRow);
  syncQueue.push({ added: [T('txSC', 'acc-chk', salS.fecha, -(salC) / 100, { name: 'CITI PAYROLL DES:EDI PAYMNT', pfc: PAY })], modified: [], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  [[salRow]] = await sequelize.query('SELECT monto_real::text AS mr FROM sf_movimientos WHERE id = :id', { replacements: { id: salS.id } });
  ok(Math.round(Number(salRow.mr) * 100) === parteA, 'split paycheck: a deposit that would push the Salario past plan + 2% does not join it', salRow);

  // --- review fixes: owner-marked plan row, variable salary, second Connect, category lock ---
  ok((await call('/plaid/exchange', A, 'POST', { public_token: 'public-sandbox-abcdef12-9999', institution: { name: 'Bank of America', institution_id: 'ins_127989' } })).s === 409, 'a second Connect of the same bank is refused (would import everything twice); Reconectar instead');
  // a second login at the same bank with the SAME account is refused, and the orphan login is removed at Plaid
  const rmBefore = calls.filter(c => c.p === '/item/remove').length;
  ok((await call('/plaid/exchange', A, 'POST', { public_token: 'public-sandbox-abcdef12-8888', institution: { name: 'Bank of America', institution_id: 'ins_127989' }, cuentas: ['1234'] })).s === 409 && calls.filter(c => c.p === '/item/remove').length === rmBefore + 1, 'same account through a second login: refused and the extra Plaid login is removed');
  // ...but a second login with DIFFERENT accounts (the business login) is accepted and starts at the plan start
  const [[pStart]] = await sequelize.query("SELECT MIN(fecha)::text AS f FROM sf_movimientos WHERE user_id = 990097 AND origen = 'plan'");
  acctsBiz = true; const prevItem = exchangeItem; exchangeItem = 'sit-item-biz';
  r = await call('/plaid/exchange', A, 'POST', { public_token: 'public-sandbox-abcdef12-6666', institution: { name: 'Bank of America', institution_id: 'ins_127989' }, cuentas: ['2619'] });
  await sleep(400);
  const [[biz]] = await sequelize.query("SELECT id, importar_desde::text AS d FROM sf_plaid_items WHERE item_id = 'sit-item-biz'");
  ok(r.s === 201 && biz && biz.d === (pStart.f < TODAY ? pStart.f : TODAY), 'a second login with different accounts (business) connects and imports from the plan start', { s: r.s, biz, pStart });
  if (biz) await call('/plaid/item/' + biz.id, A, 'DELETE');
  acctsBiz = false; exchangeItem = prevItem;
  const [[pc]] = await sequelize.query("SELECT id, fecha::text AS fecha, monto::text AS monto FROM sf_movimientos WHERE user_id = 990097 AND origen = 'plan' AND estado = 'pendiente' AND tipo = 'egreso' AND categoria = 'corte' ORDER BY fecha OFFSET 1 LIMIT 1");
  await call('/movimientos/' + pc.id, A, 'PATCH', { estado: 'cumplido', monto_real: pc.monto });
  const nPc = await count();
  syncQueue.push({ added: [T('txPC', 'acc-chk', add(pc.fecha, 1), Number(pc.monto), { name: 'CARD PAYMENT' })], modified: [], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const [[lpc]] = await sequelize.query("SELECT enlace, mov_id FROM sf_plaid_txn WHERE transaction_id = 'txPC'");
  ok(lpc.enlace === 'cumplido' && lpc.mov_id === pc.id && await count() === nPc, 'a plan row the owner already marked paid is LINKED, not counted a second time', lpc);
  const [[sal]] = await sequelize.query("SELECT id, fecha::text AS fecha, monto::text AS monto FROM sf_movimientos WHERE user_id = 990097 AND origen = 'plan' AND estado = 'pendiente' AND categoria = 'salario' ORDER BY fecha LIMIT 1");
  if (sal) {
    const nS = await count();
    syncQueue.push({ added: [T('txSAL', 'acc-chk', sal.fecha, -(Number(sal.monto) * 1.01), { name: 'PAYROLL DEPOSIT', pfc: { primary: 'INCOME', detailed: 'INCOME_SALARY' } })], modified: [], removed: [] });
    await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
    const [[ss]] = await sequelize.query('SELECT estado FROM sf_movimientos WHERE id = :id', { replacements: { id: sal.id } });
    ok(ss.estado === 'cumplido' && await count() === nS, 'a salary 1% off the plan still matches the plan row (variable income tolerance 2%)');
  }
  const [[pend]] = await sequelize.query("SELECT id, fecha::text AS fecha, monto::text AS monto FROM sf_movimientos WHERE user_id = 990097 AND origen = 'plan' AND estado = 'pendiente' AND tipo = 'egreso' AND categoria = 'corte' ORDER BY fecha DESC LIMIT 1");
  const nP = await count();
  syncQueue.push({ added: [T('txPP', 'acc-chk', add(pend.fecha, -9), Number(pend.monto), { pending: true, name: 'CARD PMT PENDING' })], modified: [], removed: [] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  syncQueue.push({ added: [T('txPP-posted', 'acc-chk', add(pend.fecha, -2), Number(pend.monto), { pid: 'txPP', name: 'CARD PMT' })], modified: [], removed: [{ transaction_id: 'txPP', account_id: 'acc-chk' }] });
  await psync.syncItem(sequelize, await psync.itemWithToken(sequelize, 'item_id = :i', { i: 'sit-item-1' }), { today: TODAY });
  const [[ppl]] = await sequelize.query("SELECT enlace, mov_id FROM sf_plaid_txn WHERE transaction_id = 'txPP-posted'");
  ok(ppl.enlace === 'plan' && ppl.mov_id === pend.id && await count() === nP, 'a pending charge that did not match, once POSTED within 5 days of the plan, moves onto the plan row (no duplicate)', ppl);
  const [[chipRow]] = await sequelize.query("SELECT m.id, m.categoria FROM sf_movimientos m JOIN sf_plaid_txn x ON x.mov_id = m.id WHERE x.transaction_id = 'txI'");
  await call('/movimientos/' + chipRow.id, A, 'PATCH', { categoria: chipRow.categoria, nota: 'solo nota' });
  const [[cm]] = await sequelize.query('SELECT categoria_manual FROM sf_movimientos WHERE id = :id', { replacements: { id: chipRow.id } });
  ok(cm.categoria_manual === false, 'saving an edit WITHOUT changing the category does not lock it');

  // --- webhook signature ---
  const sign = (bodyStr, o = {}) => {
    const head = Buffer.from(JSON.stringify({ alg: o.alg || 'ES256', kid: o.kid || 'sit-kid-1', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iat: o.iat || Math.floor(Date.now() / 1000), request_body_sha256: crypto.createHash('sha256').update(o.hashOf || bodyStr).digest('hex') })).toString('base64url');
    const sig = crypto.sign('sha256', Buffer.from(head + '.' + claims), { key: o.key || ec.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return head + '.' + claims + '.' + sig;
  };
  const wb = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'sit-item-1', initial_update_complete: true, historical_update_complete: false, environment: 'sandbox' }, null, 2);
  verifier._clearCache();
  ok((await verifier.verify(Buffer.from(wb), sign(wb))).body.item_id === 'sit-item-1', 'a correctly signed webhook verifies');
  const rej = async (b, h) => { try { await verifier.verify(Buffer.from(b), h); return false; } catch (e) { return true; } };
  ok(await rej(wb.replace('SYNC_UPDATES_AVAILABLE', 'SYNC_UPDATES_AVAILABLX'), sign(wb)), 'tampered body (hash mismatch) is rejected');
  ok(await rej(wb, sign(wb, { iat: Math.floor(Date.now() / 1000) - 600 })), 'a webhook older than 5 minutes is rejected');
  ok(await rej(wb, sign(wb, { alg: 'HS256' })), 'alg other than ES256 is rejected');
  ok(await rej(wb, sign(wb, { key: crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey })), 'a signature from another key is rejected');
  ok(await rej(wb, undefined) && await rej(wb, 'abc.def'), 'missing or malformed header is rejected');
  // over HTTP: raw-body route, 400 on bad signature, 200 + stored once on good, duplicate not stored twice
  const wapp = express();
  wapp.use('/wh', require('./src/routes/saludFinancieraPlaid').webhookRouter(require('./src/routes/saludFinanciera')._deps));
  const ws = wapp.listen(0); const wurl = 'http://127.0.0.1:' + ws.address().port + '/wh';
  const post = (b, h) => fetch(wurl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(h ? { 'Plaid-Verification': h } : {}) }, body: b }).then(x => x.status);
  const loginBody = JSON.stringify({ webhook_type: 'ITEM', webhook_code: 'ERROR', item_id: 'sit-item-1', error: { error_code: 'ITEM_LOGIN_REQUIRED' }, environment: 'sandbox' }, null, 2);
  ok(await post(loginBody, sign(loginBody.replace('ERROR', 'ERRORX'))) === 400, 'HTTP: bad signature -> 400, nothing stored');
  const hLogin = sign(loginBody);
  ok(await post(loginBody, hLogin) === 200 && await post(loginBody, hLogin) === 200, 'HTTP: good signature -> 200 (the same delivery twice: Plaid duplicates)');
  await sleep(600);
  const [whs] = await sequelize.query("SELECT procesado_at FROM sf_plaid_webhooks WHERE item_id = 'sit-item-1' AND codigo = 'ERROR'");
  const [[itl]] = await sequelize.query("SELECT estado FROM sf_plaid_items WHERE item_id = 'sit-item-1'");
  ok(whs.length === 1 && whs[0].procesado_at && itl.estado === 'login_requerido', 'webhook stored ONCE, processed after the 200: ITEM_LOGIN_REQUIRED -> estado login_requerido', { whs, itl });
  const [rc] = await sequelize.query("SELECT texto FROM sf_alertas WHERE user_id = 990097 AND tipo = 'reconectar'");
  ok(rc.length >= 1 && /Reconectar/.test(rc[0].texto), 're-auth path: an in-app alert tells the owner to reconnect');
  const pd = JSON.stringify({ webhook_type: 'ITEM', webhook_code: 'PENDING_DISCONNECT', item_id: 'sit-item-1', reason: 'INSTITUTION_TOKEN_EXPIRATION', disconnect_time: '2027-10-01T00:00:00Z' }, null, 2);
  ok(await post(pd, sign(pd)) === 200, 'PENDING_DISCONNECT accepted');
  await sleep(400);
  const [[itp]] = await sequelize.query("SELECT estado FROM sf_plaid_items WHERE item_id = 'sit-item-1'");
  ok(itp.estado === 'por_desconectar', 'PENDING_DISCONNECT (BofA consent expiring) -> estado por_desconectar + alert');
  const syncBody = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'sit-item-1', initial_update_complete: true, historical_update_complete: true, environment: 'sandbox' }, null, 2);
  syncFailOnce = true;
  ok(await post(syncBody, sign(syncBody, { iat: Math.floor(Date.now() / 1000) - 3 })) === 200, 'SYNC_UPDATES_AVAILABLE #1 accepted');
  await sleep(500);
  const [[w1]] = await sequelize.query("SELECT id, procesado_at, error, claimed_at FROM sf_plaid_webhooks WHERE item_id = 'sit-item-1' AND codigo = 'SYNC_UPDATES_AVAILABLE' ORDER BY id DESC LIMIT 1");
  ok(w1 && !w1.procesado_at && w1.error && !w1.claimed_at, 'a webhook whose processing FAILED is not marked done and is left for retry', w1);
  await psync.processWebhook(sequelize, w1.id, { today: TODAY });
  const [[w1b]] = await sequelize.query('SELECT procesado_at, error FROM sf_plaid_webhooks WHERE id = :id', { replacements: { id: w1.id } });
  ok(w1b.procesado_at && !w1b.error, 'the retry succeeds and marks it done');
  ok(await post(syncBody, sign(syncBody, { iat: Math.floor(Date.now() / 1000) - 1 })) === 200, 'SYNC_UPDATES_AVAILABLE #2 (byte-identical body, new delivery) accepted');
  await sleep(400);
  const [ws2] = await sequelize.query("SELECT id FROM sf_plaid_webhooks WHERE item_id = 'sit-item-1' AND codigo = 'SYNC_UPDATES_AVAILABLE'");
  ok(ws2.length === 2, 'an identical body sent later is a NEW event and is processed (dedupe is on the signed header, not the body)');
  verifier._clearCache(); keyCalls = 0;
  const fake = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'sit-item-1' });
  await post(fake, sign(fake, { kid: 'random-kid' })); await post(fake, sign(fake, { kid: 'random-kid' }));
  await post('{"x":1}', sign(fake));
  ok(keyCalls === 1, 'junk cannot burn the key endpoint: unknown kid asked once (negative cache), body-hash mismatch never asks', { keyCalls });
  const unk = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE', item_id: 'someone-else' });
  ok(await post(unk, sign(unk)) === 200, 'a verified webhook for an item we do not hold is acknowledged and ignored');
  ws.close();

  // --- update mode: same Item, no products, existing token ---
  r = await call('/plaid/update-token', A, 'POST', { id: it.id });
  const ut = calls.filter(c => c.p === '/link/token/create').pop();
  ok(r.s === 200 && ut.body.access_token === ACCESS && !ut.body.products, 'update mode: link token built with the existing access token and NO products (same Item, no new Trial slot)', ut.body);
  r = await call('/plaid/update-done', A, 'POST', { id: it.id });
  const [[itu]] = await sequelize.query("SELECT estado FROM sf_plaid_items WHERE item_id = 'sit-item-1'");
  ok(r.s === 200 && itu.estado === 'activo', 'after re-consent the bank is active again');

  // --- vault: a rotated key is reported as itself ---
  const k0 = process.env.SALUD_FINANCIERA_PLAID_KEY; process.env.SALUD_FINANCIERA_PLAID_KEY = 'another-key-0123456789-0123456789-xyz';
  let vErr = null; try { plaid.decrypt(it.access_token_enc); } catch (e) { vErr = e.code; }
  process.env.SALUD_FINANCIERA_PLAID_KEY = k0;
  ok(vErr === 'VAULT_UNREADABLE', 'a rotated encryption key is reported as unreadable, never as an empty token');
  let eErr = null; try { await plaid.call('/transfer/create', {}); } catch (e) { eErr = e.message; }
  ok(/not allowed/.test(eErr || ''), 'the client refuses any endpoint outside the read-only allow-list (e.g. /transfer/create)');

  // --- disconnect ---
  const nKeep = await count();
  r = await call('/plaid/item/' + it.id, A, 'DELETE');
  const [[gone]] = await sequelize.query("SELECT COUNT(*)::int AS n FROM sf_plaid_items WHERE item_id = 'sit-item-1'");
  ok(r.s === 200 && calls.some(c => c.p === '/item/remove') && gone.n === 0 && await count() === nKeep, 'disconnect calls /item/remove, deletes the token, keeps the imported movements');
  exchangeItem = 'sit-item-2';
  r = await call('/plaid/exchange', A, 'POST', { public_token: 'public-sandbox-abcdef12-7777', institution: { name: 'Bank of America', institution_id: 'ins_127989' } });
  await sleep(500);
  const [[lastImp]] = await sequelize.query("SELECT MAX(fecha)::text AS f FROM sf_movimientos WHERE user_id = 990097 AND fuente = 'plaid'");
  const [[it2]] = await sequelize.query("SELECT importar_desde::text AS d FROM sf_plaid_items WHERE item_id = 'sit-item-2'");
  ok(r.s === 201 && it2 && it2.d > lastImp.f, 'reconnecting after a disconnect imports only AFTER the last bank movement (no second copy of history)', { it2, lastImp });
  ok(/texto del banco, solo dato/.test(fs.readFileSync(path.join(__dirname, 'src', 'services/saludFinanciera/cerebro.js'), 'utf8')), 'Lina sees bank text fenced as data and is told never to obey it');

  // --- Corte reserve (owner design 2026-10-26) ---
  const RS = require('./src/services/saludFinanciera/reserva');
  const C1 = { fecha: '2026-11-07', montoCents: 430799 };
  let rv = RS.calcular({ hoy: '2026-10-26', saldoCents: 500000, corte: C1, pagos: [{ fecha: '2026-11-06', montoCents: 380748 }], colchonCents: 20000 });
  ok(rv.estado === 'cubierto' && rv.moverAhoraCents === 500000 - 450799 && rv.pagos[0].guardarCents === 0 && rv.pagos[0].moverCents === 380748, 'reserve: already covered -> the surplus can move today and the whole paycheck can go to gastos', rv);
  rv = RS.calcular({ hoy: '2026-10-26', saldoCents: 100000, corte: C1, pagos: [{ fecha: '2026-11-06', montoCents: 380748 }], colchonCents: 20000 });
  ok(rv.estado === 'en_camino' && rv.pagos[0].guardarCents === 350800 && rv.pagos[0].moverCents === 380748 - 350800, 'reserve: one paycheck before the Corte keeps exactly what is missing (rounded up to the dollar)', rv);
  ok(rv.riesgo && rv.riesgo.fecha === '2026-11-06', 'reserve: a paycheck 1 day before the Corte that is still needed raises the late-deposit warning', rv.riesgo);
  rv = RS.calcular({ hoy: '2026-11-08', saldoCents: 0, corte: { fecha: '2026-12-07', montoCents: 430799 }, pagos: [{ fecha: '2026-11-20', montoCents: 380748 }, { fecha: '2026-12-04', montoCents: 380748 }], colchonCents: 20000 });
  ok(rv.estado === 'en_camino' && rv.pagos.length === 2 && rv.pagos[0].guardarCents === 225400 && rv.pagos[0].guardarCents + rv.pagos[1].guardarCents >= 450799 && !rv.riesgo, 'reserve: two paychecks split the Corte (about $2,254 each) with no warning when the first already covers half', rv);
  rv = RS.calcular({ hoy: '2026-11-08', saldoCents: 0, corte: { fecha: '2026-12-07', montoCents: 430799 }, pagos: [{ fecha: '2026-11-20', montoCents: 200000 }], colchonCents: 20000 });
  ok(rv.estado === 'insuficiente' && rv.traerCents === 250799, 'reserve: a paycheck too small says how much must come from the gastos account', rv);
  rv = RS.calcular({ hoy: '2026-12-05', saldoCents: 100000, corte: { fecha: '2026-12-07', montoCents: 430799 }, pagos: [], colchonCents: 20000 });
  ok(rv.estado === 'faltante' && rv.traerCents === 350799, 'reserve: no paycheck left before the Corte -> bring the gap from gastos', rv);
  ok(RS.calcular({ hoy: '2026-10-26', saldoCents: null, corte: C1, pagos: [] }).estado === 'sin_saldo', 'reserve: no bank balance yet -> it says so, never assumes zero');


  // --- structural promises ---
  const dir = path.join(__dirname, 'src');
  const files = ['services/saludFinanciera/plaidClient.js', 'services/saludFinanciera/plaidSync.js', 'services/saludFinanciera/plaidWebhook.js', 'services/saludFinanciera/plaidCategorias.js', 'routes/saludFinancieraPlaid.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ''));
  ok(!files.some(s => /['"]\/(transfer|auth\/get|identity|processor|signal|payment_initiation|bank_transfer)/.test(s)), 'no money-moving or identity endpoint is referenced anywhere in the bank code');
  ok(!/products:\s*\[[^\]]*(auth|transfer|identity|signal)/i.test(files.join('\n')), 'Link is never asked for auth/transfer/identity/signal');
  const brains = ['services/saludFinanciera/cerebro.js', 'services/saludFinanciera/lina.js', 'services/saludFinanciera/finanzas.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
  ok(!brains.some(s => /access_token|plaidClient|sf_plaid_items/.test(s)), 'Lina and her tools cannot reach the bank token (no reference in cerebro/lina/finanzas)');
  const route = fs.readFileSync(path.join(dir, 'routes/saludFinancieraPlaid.js'), 'utf8');
  ok(!/res\.json\([^)]*access_token/.test(route) && !/console\.(log|error)\([^)]*access/.test(route + files.join('')), 'no route returns or logs an access token');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  ok(app.indexOf("'/projects/api/salud-financiera/plaid/webhook', express.raw") > 0 && app.indexOf("'/projects/api/salud-financiera/plaid/webhook', express.raw") < app.indexOf("app.use(express.json({ limit: '500mb' }))"), 'src/app.js gives the webhook its RAW body before the global JSON parser');

  plaid.setTransport(null);
  if (saved.id === undefined) delete process.env.PLAID_CLIENT_ID; else process.env.PLAID_CLIENT_ID = saved.id;
  if (saved.sec === undefined) delete process.env.PLAID_SECRET; else process.env.PLAID_SECRET = saved.sec;
  if (saved.key === undefined) delete process.env.SALUD_FINANCIERA_PLAID_KEY; else process.env.SALUD_FINANCIERA_PLAID_KEY = saved.key;
  if (saved.env === undefined) delete process.env.PLAID_ENV; else process.env.PLAID_ENV = saved.env;
}

function alarmasTests() {
  console.log('\n-- STALL warning + distinct recurring charges (alarmas.js)');
  const A = require('./src/services/saludFinanciera/alarmas');
  const hoy = '2026-10-28';
  const tx = (id, fecha, nombre, cents, extra) => ({ id, fecha, nombre, comercio: null, monto_cents: cents, pending: false, enlace: null, ...(extra || {}) });
  const base = { hoy, alertas: [], items: [], cuentas: [], vistas: [], recurrentes: [] };
  const r1 = A.revisar({ ...base, txns: [tx(1, '2026-10-27', 'NETFLIX.COM', 1599), tx(2, '2026-10-27', 'NETFLIX.COM', 1599)] });
  ok(r1.length === 1 && /cargo doble/i.test(r1[0].titulo) && r1[0].nivel === 'caution', 'same merchant + amount within 2 days = possible double charge', r1);
  const r1b = A.revisar({ ...base, txns: [tx(1, '2026-10-20', 'NETFLIX.COM', 1599), tx(2, '2026-10-27', 'NETFLIX.COM', 1599)] });
  ok(!r1b.some(a => /doble/i.test(a.titulo)), 'a week apart is NOT a double charge');
  const r2 = A.revisar({ ...base, txns: [tx(3, '2026-10-26', 'OVERDRAFT ITEM FEE', 3500)] });
  ok(r2.length === 1 && r2[0].nivel === 'stall' && /comisi/i.test(r2[0].titulo), 'an overdraft fee is a STALL', r2);
  const r3 = A.revisar({ ...base, txns: [tx(4, '2026-10-26', 'BEST BUY 123', 89999)] });
  ok(r3.length === 1 && r3[0].nivel === 'stall' && /nuevo/i.test(r3[0].titulo), 'a $899 charge from a merchant never seen is a STALL', r3);
  const r3b = A.revisar({ ...base, recurrentes: [{ clave: 'best' }], txns: [tx(4, '2026-10-26', 'BEST BUY 123', 89999)] });
  ok(!r3b.length, 'a known recurring merchant is not "new"');
  const r4 = A.revisar({ ...base, txns: [tx(5, '2026-06-10', 'SHELL OIL', 4000), tx(6, '2026-10-26', 'SHELL OIL', 30000)] });
  ok(r4.length === 1 && /alto/i.test(r4[0].titulo), 'a charge 2x above that merchant\'s highest is flagged', r4);
  const r5 = A.revisar({ ...base, txns: [tx(7, '2026-10-26', 'BEST BUY 123', 89999, { enlace: 'plan' }), tx(8, '2026-10-26', 'TFS DES:TFS PAY', 430799), tx(9, '2026-10-26', 'Online Banking transfer to CHK 5122', 100000)] });
  ok(!r5.length, 'a planned payment, the Corte and own transfers raise nothing', r5);
  const r6 = A.revisar({ ...base, vistas: ['fee:3'], txns: [tx(3, '2026-10-26', 'OVERDRAFT ITEM FEE', 3500)] });
  ok(!r6.length, '"Entendido" silences that alarm');
  const r7 = A.revisar({ ...base, txns: [], dias_negativos: [{ fecha: '2026-12-07', saldo: '-$271.52' }], items: [{ id: 1, institution_name: 'BoA', estado: 'login_requerido' }], cuentas: [{ mask: '5122', incluir: true, saldo_disponible: '-12.00' }] });
  ok(r7.length === 3 && r7.every(a => a.nivel === 'stall'), 'negative day, broken bank link and overdrawn account are STALLs', r7.map(a => a.titulo));
  const rec = [
    { direccion: 'salida', activo: true, descripcion: 'Highlevel Agency', comercio: 'Highlevel Agency', frecuencia: 'MONTHLY', monto_ultimo: '97.00' },
    { direccion: 'salida', activo: true, descripcion: 'Highlevel Agency', comercio: 'Highlevel Agency', frecuencia: 'MONTHLY', monto_ultimo: '97.00' },
    { direccion: 'salida', activo: true, descripcion: 'Amazon', comercio: 'Amazon', frecuencia: 'MONTHLY', monto_ultimo: '9.46' },
    { direccion: 'salida', activo: true, descripcion: 'Amazon', comercio: 'Amazon', frecuencia: 'MONTHLY', monto_ultimo: '7.68' },
    { direccion: 'salida', activo: false, descripcion: 'Gaia', comercio: 'Gaia', frecuencia: 'MONTHLY', monto_ultimo: '15.89' },
    { direccion: 'salida', activo: true, descripcion: 'TFS DES:TFS PAY ID: 20123026 INDN:Manuel Stagg CO ID:XXXXX65079 PPD', comercio: null, frecuencia: 'MONTHLY', monto_ultimo: '4307.99', categoria: 'corte' },
    { direccion: 'salida', activo: true, descripcion: 'Zelle Transfer CONF# L03A3MGNQ; LINA STAGG', comercio: null, frecuencia: 'MONTHLY', monto_ultimo: '1500.00' },
    { direccion: 'entrada', activo: true, descripcion: 'CITI PAYROLL', comercio: null, frecuencia: 'BIWEEKLY', monto_ultimo: '2665.24' }
  ];
  const d = A.distintos(rec);
  const by = Object.fromEntries(d.map(x => [x.nombre, x]));
  ok(d.length === 4, 'one row per merchant: duplicates, inactive streams and income dropped', d.map(x => x.nombre));
  ok(by['Highlevel Agency'] && by['Highlevel Agency'].montos.length === 1, 'the same charge reported twice counts once');
  ok(by.Amazon && by.Amazon.montos.length === 2 && by.Amazon.mensual === '$17.14', 'distinct amounts of one merchant are listed together', by.Amazon);
  ok(by['TFS (Corte)'] && by['TFS (Corte)'].claves.includes('corte'), 'bank codes become a readable name; the Corte also matches its plan row');
  ok(by['Zelle a Lina Stagg'] && by['Zelle a Lina Stagg'].clave === 'lina', 'a Zelle reads as the person and searches by first name', by['Zelle a Lina Stagg']);
}

(async () => {
  await engineTests();
  alarmasTests();
  await linaTests();
  structuralTests();
  try { await apiTests(); } catch (e) { fail++; console.log('  FAIL api section crashed:', e.stack); }
  console.log(`\nSalud Financiera SIT: ${pass}/${pass + fail}`);
  console.log('NOT covered: a real Anthropic call, real voice recognition, the /api/tts/edge audio, a browser, the REAL Plaid API (sandbox/production) and a real Bank of America login.');
  process.exit(fail ? 1 : 0);
})();
