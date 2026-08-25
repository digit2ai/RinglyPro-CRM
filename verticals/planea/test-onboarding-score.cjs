/* Test de aceptación del Planea Score (MVP spec §9.2).
   node verticals/planea/test-onboarding-score.cjs → debe imprimir ALL PASS y salir 0.
   Carga el motor de navegador (planea-score-engine.js, que es ESM por el package)
   en un sandbox CommonJS para poder probarlo sin build. */
'use strict';
var fs = require('fs'), path = require('path');
var src = fs.readFileSync(path.join(__dirname, 'portal', 'planea-score-engine.js'), 'utf8');
var mod = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('module', 'exports', 'window', src)(mod, mod.exports, undefined);
var E = mod.exports;

var fails = 0;
function assert(name, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  got=' + JSON.stringify(got) + (ok ? '' : ' want=' + JSON.stringify(want)));
  if (!ok) fails++;
}

var a = {
  ocupacion: 'empleado',
  rango_ingresos: 'i3',                 // 3–5M → 4.000.000
  rango_gastos: 'g3',                   // 2.5–4M → 3.250.000
  tipos_deuda: ['tarjeta'],
  rango_cuotas: 'c3',                   // 700k–1.5M → 1.100.000
  cobertura: 'm1_3',                    // 1–3 meses → 50
  estabilidad_ingreso: 'fijo',         // 100
  numero_dependientes: 'd1_2',         // 65
  // P12 Seguros (reemplaza a la P9 "productos activos" retirada). "No tengo ninguno"
  // dispara frase_sin_coberturas cuando el pilar de atención es fondo de emergencia (§8.2).
  seguros_activos: ['ninguno'],
  // Preguntas informativas nuevas (no alimentan el cálculo; se persisten para Maya):
  conducta_ahorro: 'a_veces', estado_inversion: 'interesa', claridad_tributaria: 'no_se', estado_retiro: 'obligatorio',
};

var r = E.compute(a);
console.log('--- resultado ---');
console.log(JSON.stringify(r, null, 2));
console.log('--- aserciones ---');

assert('pilar fondo_emergencia', r.pilares.fondo_emergencia.puntaje, 50);
assert('pilar flujo_caja', r.pilares.flujo_caja.puntaje, 65);
assert('pilar salud_deuda', r.pilares.salud_deuda.puntaje, 55);
assert('pilar estabilidad', r.pilares.estabilidad.puntaje, 89.5);
assert('SCORE = 61', r.score, 61);
assert('rango = Estable', r.rango.name, 'Estable');
assert('pilar_atencion = fondo_emergencia', r.pilar_atencion, 'fondo_emergencia');
assert('pilar_respaldo = estabilidad', r.pilar_respaldo, 'estabilidad');
assert('cta_primario = ahorro', r.cta_primario, 'ahorro');
assert('cta_secundario = null (seguros no existe)', r.cta_secundario, null);
assert('frase_sin_coberturas = true', r.frase_sin_coberturas, true);
assert('omitir_diagnostico = false', r.omitir_diagnostico, false);
assert('omitir_reconocimiento = false', r.omitir_reconocimiento, false);

var ins = E.buildInsight(r, 'Juana');
assert('apertura personalizada', /^Juana, hoy tu salud financiera es estable/.test(ins.apertura), true);
assert('diagnóstico + frase sin coberturas', /coberturas registradas/.test(ins.diagnostico), true);
assert('reconocimiento estabilidad', /estabilidad de tu ingreso es tu punto más firme/.test(ins.reconocimiento), true);
assert('cta ahorro', /dónde tienes hoy tu ahorro/.test(ins.cta_textos[0]), true);

assert('sin deudas -> deuda 100', E.compute({ rango_ingresos: 'i3', rango_gastos: 'g1', tipos_deuda: ['ninguna'], cobertura: 'nada', estabilidad_ingreso: 'fijo', numero_dependientes: 'nadie' }).pilares.salud_deuda.puntaje, 100);
assert('no pago cuotas -> deuda 100', E.compute({ rango_ingresos: 'i3', rango_gastos: 'g1', tipos_deuda: ['tarjeta'], rango_cuotas: 'nopago', cobertura: 'nada', estabilidad_ingreso: 'fijo', numero_dependientes: 'nadie' }).pilares.salud_deuda.puntaje, 100);
assert('cobertura nada -> fondo 0', E.compute({ rango_ingresos: 'i3', rango_gastos: 'g1', tipos_deuda: ['ninguna'], cobertura: 'nada', estabilidad_ingreso: 'fijo', numero_dependientes: 'nadie' }).pilares.fondo_emergencia.puntaje, 0);

// ── Regresión del ajuste 9→13: las 5 preguntas informativas NO mueven el puntaje ──
// (inversión, impuestos, retiro, conducta de ahorro, y CUALQUIER combinación de seguros
//  que no sea "ninguno/inseguro" no cambia el score respecto al caso base de 61).
var base = { rango_ingresos: 'i3', rango_gastos: 'g3', tipos_deuda: ['tarjeta'], rango_cuotas: 'c3', cobertura: 'm1_3', estabilidad_ingreso: 'fijo', numero_dependientes: 'd1_2', seguros_activos: ['ninguno'] };
function withExtra(extra) { var o = {}; for (var k in base) o[k] = base[k]; for (var j in extra) o[j] = extra[j]; return o; }
assert('P9-13 no mueven el score (todas rellenas)', E.compute(withExtra({ conducta_ahorro: 'casi_todos', monto_ahorro_mensual: '500000', estado_inversion: 'periodica', claridad_tributaria: 'claro', estado_retiro: 'voluntario' })).score, 61);
assert('P9-13 no mueven el score (otras respuestas)', E.compute(withExtra({ conducta_ahorro: 'cero', estado_inversion: 'no_prioridad', claridad_tributaria: 'no_toca', estado_retiro: 'nada' })).score, 61);
assert('seguros con pólizas NO dispara frase_sin_coberturas', E.compute(withExtra({ seguros_activos: ['salud', 'vida'] })).frase_sin_coberturas, false);
assert('seguros "No estoy seguro" SÍ dispara frase (atención=fondo)', E.compute(withExtra({ seguros_activos: ['inseguro'] })).frase_sin_coberturas, true);
assert('seguros vacío NO dispara frase (solo ninguno/inseguro)', E.compute(withExtra({ seguros_activos: [] })).frase_sin_coberturas, false);

// ── Ajuste Eduardo: tramos superiores subidos + monto aproximado OBLIGATORIO ──────
// El monto real manda sobre el tramo, así dos personas del mismo tramo NO se aplanan.
var hi = { rango_gastos: 'g3', tipos_deuda: ['ninguna'], cobertura: 'nada', estabilidad_ingreso: 'fijo', numero_dependientes: 'nadie' };
function ing(extra) { var o = {}; for (var k in hi) o[k] = hi[k]; for (var j in extra) o[j] = extra[j]; return o; }
// Dos usuarios en el MISMO tramo tope (i6 "Más de $12M") con montos muy distintos:
var flujoRico = E.compute(ing({ rango_ingresos: 'i6', monto_ingresos: '40000000', rango_gastos: 'g3', monto_gastos: '3250000' })).pilares.flujo_caja.puntaje;
var flujoJusto = E.compute(ing({ rango_ingresos: 'i6', monto_ingresos: '13000000', rango_gastos: 'g6', monto_gastos: '12000000' })).pilares.flujo_caja.puntaje;
assert('mismo tramo tope, montos distintos -> flujo distinto (no aplana)', flujoRico !== flujoJusto, true);
assert('ingreso alto real -> flujo 100 (usa el monto, no el tramo)', flujoRico, 100);
// El tramo nuevo intermedio existe como respaldo (sin monto) y no rompe el motor:
assert('tramo i5 respaldo computa', E.compute(ing({ rango_ingresos: 'i5' })).score >= 0, true);
assert('tramo tope g6 respaldo computa', E.compute(ing({ rango_ingresos: 'i3', rango_gastos: 'g6' })).score >= 0, true);

console.log('\n' + (fails === 0 ? 'ALL PASS' : (fails + ' FAILED')));
process.exit(fails === 0 ? 0 : 1);
