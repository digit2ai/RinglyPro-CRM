/**
 * PLANEA — score engine (server-side, authoritative).
 *
 * The Puntaje Planea is computed from the user's ACTUAL financial data, not a
 * frozen survey snapshot. Both the survey and the module editors (Ingresos,
 * Gastos, Deuda, Ahorro, ...) write that data; this recomputes the score,
 * pillars, scenario (A–I) and Maya's first insight whenever anything changes.
 *
 * Formulas per Planea_Survey_Tecnico (Jun 2026):
 *   P1 Fondo Emergencia 35% · P2 Flujo 25% · P3 Deuda 25% · P4 Estabilidad 15%.
 */
'use strict';

function round(n) { return Math.round(n); }
function metaMeses(tipo) { return tipo === 'fijo' ? 3 : 6; }
function rangoDe(s) { return s <= 30 ? 'Punto de partida' : s <= 50 ? 'Construyendo' : s <= 70 ? 'En camino' : s <= 85 ? 'Sólido' : 'Planeado'; }
function cop(n) {
  n = Math.round((+n || 0) / 1000) * 1000;
  if (n >= 1000000) { var m = n / 1000000; return '$' + (m % 1 === 0 ? m : m.toFixed(1)) + 'M'; }
  return '$' + Math.max(0, n).toLocaleString('es-CO');
}
function num(x) { var v = +x; return isNaN(v) ? 0 : v; }

function bucket(a) {
  if (a.cat === 'ahorro' || a.cat === 'inversion') return a.cat;
  var s = ((a.type || '') + ' ' + (a.name || '')).toLowerCase();
  if (/invers|accion|acción|fondo|fic|cripto|bono|etf|cdt|portafol|renta/.test(s)) return 'inversion';
  if (/ahorro|efectivo|cuenta|emergenc|cesant|caja|liquid|líquid/.test(s)) return 'ahorro';
  return 'otro';
}

// Derive the score inputs from the profile's real data arrays.
function deriveInputs(p) {
  p = p || {};
  var ing = (p.ingresos_data || []).reduce(function (a, x) { return a + num(x.value); }, 0);
  var gas = (p.gastos_data || []).reduce(function (a, x) { return a + num(x.value); }, 0);
  var liab = p.liabilities_data || [];
  var cuo = liab.reduce(function (a, x) { return a + num(x.monthly); }, 0);
  var ahorros = (p.assets_data || []).filter(function (a) { return bucket(a) === 'ahorro'; }).reduce(function (a, x) { return a + num(x.value); }, 0);
  var meta = p.finance_meta || {};
  return {
    ingresos: ing, gastos: gas, cuotas: cuo, ahorros: ahorros,
    tiene_deuda: liab.length > 0,
    tiene_ahorro: ahorros > 0,
    tipo_ingreso: meta.tipo_ingreso || 'fijo',
    dependientes: meta.dependientes || 'nadie',
    // Coverage months. If no expenses are tracked yet but there ARE savings,
    // treat coverage as effectively complete rather than collapsing the pillar to 0.
    meses_cobertura: gas > 0 ? ahorros / gas : (ahorros > 0 ? 999 : 0),
    nombre: (p.full_name || '').trim().split(/\s+/)[0] || ''
  };
}

function pillars(inp) {
  var p1;
  if (!inp.tiene_ahorro) p1 = 0;
  else { var mm = metaMeses(inp.tipo_ingreso); p1 = Math.min(100, (inp.meses_cobertura / mm) * 100); }
  var margen = inp.ingresos > 0 ? (inp.ingresos - inp.gastos) / inp.ingresos : 0;
  var p2 = margen <= 0 ? 0 : margen >= 0.20 ? 100 : (margen / 0.20) * 100;
  var p3;
  if (!inp.tiene_deuda) p3 = 100;
  else { var dti = inp.ingresos > 0 ? inp.cuotas / inp.ingresos : 1; p3 = dti <= 0 ? 100 : dti >= 0.36 ? 0 : (1 - (dti / 0.36)) * 100; }
  var p4 = inp.tipo_ingreso === 'fijo' ? 100 : inp.tipo_ingreso === 'varia_poco' ? 65 : 35;
  return { emergency_fund: round(p1), cash_flow: round(p2), debt_health: round(p3), stability: round(p4) };
}

function fundTarget(inp) {
  var f = inp.dependientes === '3+' ? 1.5 : inp.dependientes === '1-2' ? 1.2 : 1;
  return round(metaMeses(inp.tipo_ingreso) * inp.gastos * f);
}

// Maya insight — CFP-pyramid decision tree (scenarios A–I).
function recommendation(inp) {
  var inc = inp.ingresos, exp = inp.gastos, cuotas = inp.tiene_deuda ? inp.cuotas : 0;
  var nombre = inp.nombre || 'amigo/a';
  var margen = inc > 0 ? (inc - exp) / inc : 0;
  var margenLibre = inc - exp - cuotas;

  if (margen < 0) {
    var dif = Math.abs(inc - exp);
    return { scenario: 'A', goalText: 'Reducir gastos en ' + cop(dif) + ' para no seguir endeudándote cada mes.',
      mayaMessage: nombre + ', cada mes estás gastando más de lo que ganas. Eso hace que tu deuda crezca sola aunque no uses las tarjetas. Lo primero que vamos a hacer juntos es cerrar ese hueco. Esta semana revisemos en qué se va la plata.',
      timeline: '30 días para identificar y reducir gastos variables.' };
  }
  if (margen <= 0.10) {
    var mB = Math.ceil(500000 / Math.max(1, inc - exp));
    return { scenario: 'B', goalText: 'Ahorra $500.000 como colchón mínimo antes de atacar cualquier otra cosa.',
      mayaMessage: 'Tu flujo de caja está muy ajustado: tienes poco margen y eso es riesgoso. Primero construyamos un colchón mínimo de $500.000 para amortiguar cualquier imprevisto. ¿Cuánto puedes separar esta quincena?',
      timeline: mB + (mB === 1 ? ' mes' : ' meses') + ' para lograrlo.' };
  }
  if (inp.tiene_deuda) {
    var dti = inc > 0 ? cuotas / inc : 0;
    if (dti > 0.20) {
      var extra = round(cuotas * 0.10);
      return { scenario: 'C', goalText: 'Paga ' + cop(extra) + ' adicionales al mes a tu deuda más cara.',
        mayaMessage: nombre + ', tus cuotas ya se llevan más del 20% de tus ingresos. Esa deuda te cuesta más de lo que cualquier inversión te daría. Lo más inteligente ahora es atacarla: cuando la reduzcas, esa plata queda libre para lo que tú quieras. ¿Arrancamos?',
        timeline: 'Calculado según tu saldo y pago adicional.' };
    }
    var pd = Math.max(0, round(margenLibre * 0.50)), af = Math.max(0, round(margenLibre * 0.50));
    return { scenario: 'D', goalText: 'Divide tu margen: ' + cop(pd) + ' a tu deuda y ' + cop(af) + ' a tu fondo de emergencia.',
      mayaMessage: 'Tu deuda está bajo control. Divide tu margen en dos: la mitad para pagar más de tu cuota y la otra mitad para empezar tu fondo de emergencia. Así avanzas en los dos frentes al tiempo.',
      timeline: 'Mensual, según tu margen disponible.' };
  }
  var meses = inp.meses_cobertura;
  if (meses === 0) {
    var sem = round(exp / 4);
    return { scenario: 'E', goalText: 'Ahorra ' + cop(sem) + ' esta semana — en 4 semanas tienes tu primer mes de respaldo.',
      mayaMessage: 'No tienes ahorro guardado, así que cualquier imprevisto te puede empujar a endeudarte. Esta semana separa ' + cop(sem) + ' antes de gastar. No es para invertir ni pagar deuda: es tu escudo.',
      timeline: '4 semanas para tu primer mes de fondo.' };
  }
  if (meses < 1) {
    var falt = round(exp - meses * exp), mF = Math.ceil(falt / Math.max(1, margenLibre));
    return { scenario: 'F', goalText: 'Llegar a 1 mes de fondo — te faltan ' + cop(falt) + '.',
      mayaMessage: 'Ya tienes algo guardado, pero con menos de un mes de cobertura aún estás expuesto. Lleguemos primero a 1 mes de gastos. Estás a ' + cop(falt) + ' de lograrlo. ¿Vamos?',
      timeline: mF + (mF === 1 ? ' mes' : ' meses') + ' para lograrlo.' };
  }
  if (meses < 3) {
    var target = fundTarget(inp), falt2 = round(target - meses * exp), mG = Math.ceil(falt2 / Math.max(1, margenLibre));
    return { scenario: 'G', goalText: 'Completa tu fondo de emergencia — te faltan ' + cop(Math.max(0, falt2)) + '.',
      mayaMessage: 'Vas muy bien: ya tienes ' + (meses % 1 === 0 ? meses : meses.toFixed(1)) + ' meses de fondo. El estándar del CFP para tu caso es llegar a ' + metaMeses(inp.tipo_ingreso) + ' meses. Con lo que te queda cada mes lo completas en ' + mG + (mG === 1 ? ' mes' : ' meses') + '.',
      timeline: mG + (mG === 1 ? ' mes' : ' meses') + ' para completar el fondo.' };
  }
  var invMonto = round(inc * 0.20);
  return { scenario: 'I', goalText: 'Invierte al menos el 20% de tus ingresos — ' + cop(invMonto) + ' cada mes.',
    mayaMessage: nombre + ', estás en una posición sólida: sin deuda cara y con tu fondo de emergencia listo. Ahora tu plata puede trabajar para ti. Voy a mostrarte opciones de inversión que se ajustan a tu perfil, sin comisiones escondidas.',
    timeline: 'Mensual.' };
}

// Full recompute from a profile. Returns null when there isn't enough data
// (no income yet) so the caller can leave the user "Sin diagnóstico".
function scoreFromProfile(p) {
  var inp = deriveInputs(p);
  if (inp.ingresos <= 0) return null;
  var pl = pillars(inp);
  var score = round(pl.emergency_fund * 0.35 + pl.cash_flow * 0.25 + pl.debt_health * 0.25 + pl.stability * 0.15);
  var rec = recommendation(inp);
  return { score: score, rango: rangoDe(score), scenario: rec.scenario, pillars: pl, recommendation: rec, inputs: inp };
}

// Rebuild the editable data arrays from a legacy survey that only stored answers
// (P1–P8). Used to self-heal accounts created before the modules were connected.
var INC_MID = { A: 1200000, B: 2250000, C: 4000000, D: 6500000, E: 9000000 };
var CUOTA_MID = { A: 200000, B: 500000, C: 1100000, D: 2250000, E: 3500000 };
var MESES_MID = { A: 0.5, B: 2, C: 4.5, D: 9, E: 12 };
function amt(key, map, exact) {
  if (key === 'X') return Math.max(0, parseInt(exact || '0', 10) || 0);
  return map[key] != null ? map[key] : 0;
}
function dataFromAnswers(a) {
  a = a || {};
  var inc = amt(a.P1, INC_MID, a.P1_exact);
  var exp = amt(a.P2, INC_MID, a.P2_exact); // gastos use the same range midpoints
  var tieneDeuda = a.P3 === 'yes';
  var cuota = tieneDeuda ? amt(a.P4, CUOTA_MID, a.P4_exact) : 0;
  var tieneAhorro = a.P5 !== 'no';
  var meses = tieneAhorro ? (MESES_MID[a.P6] != null ? MESES_MID[a.P6] : 0) : 0;
  var ahorros = Math.round(meses * exp);
  var tipo = a.P7 === 'A' ? 'fijo' : a.P7 === 'B' ? 'varia_poco' : 'cambia';
  var deps = a.P8 === 'A' ? 'nadie' : a.P8 === 'B' ? '1-2' : '3+';
  return {
    ingresos_data: [{ name: 'Ingreso mensual', type: 'Salario', value: inc }],
    gastos_data: [{ name: 'Gastos mensuales', type: 'General', value: exp }],
    liabilities_data: tieneDeuda ? [{ name: 'Cuotas de deuda', type: 'Crédito', value: 0, monthly: cuota }] : [],
    assets_data: (tieneAhorro && ahorros > 0) ? [{ name: 'Ahorros', type: 'Cuenta de ahorros', cat: 'ahorro', value: ahorros }] : [],
    finance_meta: { tipo_ingreso: tipo, dependientes: deps }
  };
}

module.exports = { scoreFromProfile: scoreFromProfile, deriveInputs: deriveInputs, pillars: pillars, recommendation: recommendation, dataFromAnswers: dataFromAnswers };
