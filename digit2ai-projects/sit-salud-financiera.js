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
  // Monthly recurring bills: end of month and a fixed day, never duplicated.
  const RECS = [{ concepto: 'Internet', monto: '150.00', fin_de_mes: true }, { concepto: 'Software', monto: '100.00', dia: 7 }];
  const rr = engine.recurrentRows(rows, RECS, TODAY, '2027-01-31');
  ok(rr.filter(x => x.concepto === 'Internet').map(x => x.fecha).join() === '2026-10-31,2026-11-30,2026-12-31,2027-01-31', 'recurring end-of-month bill lands on each month\'s last day');
  ok(rr.filter(x => x.concepto === 'Software').map(x => x.fecha).join() === '2026-11-07,2026-12-07,2027-01-07', 'recurring day-7 bill skips the past (Oct 7) and repeats monthly');
  ok(engine.recurrentRows([...rows, ...rr.map((x, i) => ({ ...x, id: 700 + i }))], RECS, TODAY, '2027-01-31').length === 0, 'recurring rows are never duplicated');
  ok(engine.extendPlan(rows, 1, RECS).nuevos.some(x => x.concepto === 'Internet' && x.fecha === '2027-02-28'), 'Extender plan carries recurring bills forward');
  ok(engine.recurrentRows(rows, [{ concepto: 'x', monto: '1', dia: 31 }], '2027-02-01', '2027-02-28')[0].fecha === '2027-02-28', 'day 31 clamps to a short month');
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
  ok(r.intent === 'explicar_saldo' && /Ahorro 1 \$4,689\.48/.test(r.texto) && /\$8,968\.48/.test(r.texto), 'why today > $8,000: lists Ahorro 1-4', r.texto);
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
  const iK = ui.indexOf('id="sf-cards"'), iL = ui.indexOf('orbHtml() +');
  ok(iK > 0 && iL > iK, 'KPIs come first, Lina below them');
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
    ok(r.s === 200 && near(r.j.score, 63, 0.5) && r.j.color === 'verde' && r.j.cierre_mes_actual.saldo === '$4,568.48' && r.j.cierre_ultimo_mes.saldo === '$4,468.48' && r.j.obligaciones.cubiertas === r.j.obligaciones.total && r.j.saldo_min === '$68.48' && r.j.fecha_min === '2026-12-11', 'GET /salud on seed: ~63 verde, cierre octubre $4,568.48, cierre enero $4,468.48, all payments covered, $68.48 on 2026-12-11', r.j);
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
  } finally {
    await clean();
    server.close();
    await sequelize.close();
  }
}

(async () => {
  await engineTests();
  await linaTests();
  structuralTests();
  try { await apiTests(); } catch (e) { fail++; console.log('  FAIL api section crashed:', e.stack); }
  console.log(`\nSalud Financiera SIT: ${pass}/${pass + fail}`);
  console.log('NOT covered: a real Anthropic call, real voice recognition, the /api/tts/edge audio, a browser.');
  process.exit(fail ? 1 : 0);
})();
