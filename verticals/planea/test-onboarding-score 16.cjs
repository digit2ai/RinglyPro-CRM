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
  productos_activos: ['ahorros', 'billetera'],
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

console.log('\n' + (fails === 0 ? 'ALL PASS' : (fails + ' FAILED')));
process.exit(fails === 0 ? 0 : 1);
