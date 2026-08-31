/* Prueba de regresión del Puntaje Planea v2 (Documento Maestro §8).
   node verticals/planea/test-motor.cjs -> ALL PASS, exit 0.
   Los cuatro perfiles se evalúan SOLO con respuestas del survey (sin datos reales),
   con tolerancia de un punto. Se afirman los subpuntajes por pilar y el total. */
'use strict';
var fs = require('fs'), path = require('path');
var src = fs.readFileSync(path.join(__dirname, 'portal', 'planea-motor.js'), 'utf8');
var mod = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('module', 'exports', 'window', src)(mod, mod.exports, undefined);
var E = mod.exports;

var fails = 0;
function near(name, got, want, tol) {
  tol = tol == null ? 1 : tol;
  var ok = Math.abs(got - want) <= tol;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  got=' + got + (ok ? '' : ' want=' + want + ' (±' + tol + ')'));
  if (!ok) fails++;
}
function eq(name, got, want) {
  var ok = got === want;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  got=' + JSON.stringify(got) + (ok ? '' : ' want=' + JSON.stringify(want)));
  if (!ok) fails++;
}

// ── Perfiles (respuestas del survey que reproducen los subpuntajes de §8) ──────
var PERFILES = {
  A: {
    edad: 'e1', ocupacion: 'empleado', dependientes: 'nadie', variabilidad: 'fijo',
    ahorro_constancia: 'a_veces', ahorro_cobertura: 'm1',
    deuda_tipos: ['ninguna'], rango_pago: 'nopago',
    seguros_tipos: ['empresa'], seguros_suficiencia: 'menos3',
    retiro_tiempo: 'menos5', retiro_regimen: 'nose',
    patrimonio_activos: ['ninguno'], patrimonio_sucesion: 'nada',
    impuestos_cumplimiento: 'nose', impuestos_soportes: 'ninguno',
    inversion_donde: ['ninguno'],
    rango_ingresos: 'i3', rango_gastos: 'g3',
    esperado: { ahorro: 39, flujo: 40, deuda: 100, retiro: 80, seguros: 35, inversion: 0, impuestos: 20, patrimonio: 21, total: 49, rango: 'Construyendo' },
  },
  B: {
    edad: 'e2', ocupacion: 'empleado', dependientes: 'd1_2', variabilidad: 'fijo',
    ahorro_constancia: 'casi_nunca', ahorro_cobertura: 'nada',
    deuda_tipos: ['tarjeta', 'compras'], rango_pago: 'p4',
    seguros_tipos: ['ninguno'], seguros_suficiencia: 'menos3',
    retiro_tiempo: 'menos5', retiro_regimen: 'nose',
    patrimonio_activos: ['ninguno'], patrimonio_sucesion: 'nada',
    impuestos_cumplimiento: 'atraso', impuestos_soportes: 'algunos',
    inversion_donde: ['ninguno'],
    rango_ingresos: 'i3', rango_gastos: 'g3',
    esperado: { ahorro: 7.5, flujo: 40, deuda: 13.5, retiro: 55, seguros: 11.3, inversion: 0, impuestos: 48, patrimonio: 22, total: 23, rango: 'Punto de partida' },
  },
  C: {
    edad: 'e3', ocupacion: 'empleado', dependientes: 'nadie', variabilidad: 'fijo',
    ahorro_constancia: 'casi_todos', ahorro_cobertura: 'm3_6',
    deuda_tipos: ['hipotecario'], rango_pago: 'p3',
    seguros_tipos: ['vida', 'salud'], seguros_suficiencia: '3a12',
    retiro_tiempo: '5a15', retiro_regimen: 'privado',
    patrimonio_activos: ['vivienda', 'vehiculo'], patrimonio_sucesion: 'algunos',
    impuestos_cumplimiento: 'aldia', impuestos_soportes: 'algunos',
    inversion_donde: ['fondos'], inversion_magnitud: 'menos1',
    rango_ingresos: 'i4', rango_gastos: 'g3',
    esperado: { ahorro: 86, flujo: 100, deuda: 64, retiro: 75, seguros: 75, inversion: 44, impuestos: 86.5, patrimonio: 69, total: 77, rango: 'Sólido' },
  },
  D: {
    edad: 'e2', ocupacion: 'empleado', dependientes: 'd1_2', variabilidad: 'fijo',
    ahorro_constancia: 'casi_todos', ahorro_cobertura: 'm3_6',
    deuda_tipos: ['ninguna'], rango_pago: 'nopago',
    seguros_tipos: ['salud'], seguros_suficiencia: 'menos3',
    retiro_tiempo: 'nocotizo', retiro_regimen: 'nose',
    patrimonio_activos: ['vivienda', 'vehiculo', 'inversiones'], patrimonio_sucesion: 'nada',
    impuestos_cumplimiento: 'aldia', impuestos_soportes: 'organizados',
    inversion_donde: ['fondos', 'acciones'], inversion_magnitud: 'mas6',
    rango_ingresos: 'i4', rango_gastos: 'g3',
    esperado: { ahorro: 86, flujo: 100, deuda: 100, retiro: 25, seguros: 38.3, inversion: 90, impuestos: 100, patrimonio: 70, total: 79, rango: 'Sólido' },
  },
};

Object.keys(PERFILES).forEach(function (id) {
  var p = PERFILES[id], exp = p.esperado;
  var r = E.compute(p);
  console.log('\n── Perfil ' + id + ' ──');
  ['ahorro', 'flujo', 'deuda', 'retiro', 'seguros', 'inversion', 'impuestos', 'patrimonio'].forEach(function (k) {
    near(id + ' · ' + k, r.pilares[k].puntaje, exp[k]);
  });
  near(id + ' · TOTAL = ' + exp.total, r.score, exp.total);
  eq(id + ' · rango = ' + exp.rango, r.rango.name, exp.rango);
});

// ── Comprobaciones de tablas individuales (§6.3) ──────────────────────────────
console.log('\n── Tablas de pilar ──');
function base(extra) {
  var b = {
    edad: 'e2', ocupacion: 'empleado', dependientes: 'nadie', variabilidad: 'fijo',
    ahorro_constancia: 'casi_todos', ahorro_cobertura: 'm6plus',
    deuda_tipos: ['ninguna'], rango_pago: 'nopago',
    seguros_tipos: ['vida', 'salud', 'vehiculo'], seguros_suficiencia: 'mas1',
    retiro_tiempo: 'mas15', retiro_regimen: 'privado',
    patrimonio_activos: ['vivienda', 'vehiculo', 'inversiones'], patrimonio_sucesion: 'definido',
    impuestos_cumplimiento: 'aldia', impuestos_soportes: 'organizados',
    inversion_donde: ['fondos', 'acciones', 'cripto'], inversion_magnitud: 'mas6',
    rango_ingresos: 'i4', rango_gastos: 'g1',
  };
  for (var k in extra) b[k] = extra[k];
  return b;
}
near('flujo margen>=30 -> 100', E.compute(base({ rango_ingresos: 'i4', rango_gastos: 'g1' })).pilares.flujo.puntaje, 100);
near('flujo gastos>ingresos -> 0', E.compute(base({ rango_ingresos: 'i1', rango_gastos: 'g5' })).pilares.flujo.puntaje, 0);
near('deuda sin deudas -> 100', E.compute(base({ deuda_tipos: ['ninguna'] })).pilares.deuda.puntaje, 100);
near('seguros vida+salud+patr -> cob100/suf100 = 100', E.compute(base()).pilares.seguros.puntaje, 100);
near('retiro pensionado -> 100', E.compute(base({ ocupacion: 'pensionado', retiro_tiempo: 'nocotizo' })).pilares.retiro.puntaje, 100);
near('modulador independiente resta a cobertura', E.compute(base({ ocupacion: 'independiente' })).pilares.ahorro.puntaje, 100 - 0.7 * 10);
near('inversion secuencia: ahorro<40 -> tope 70', E.compute(base({ ahorro_cobertura: 'nada', ahorro_constancia: 'cero', inversion_donde: ['fondos', 'acciones', 'cripto'], inversion_magnitud: 'mas6' })).pilares.inversion.puntaje <= 70 ? 70 : 0, 70);
// Prioridad (§14): un pilar débil en seguros con dependientes sube su prioridad
var prA = E.compute(PERFILES.A);
eq('A · prioridad es un pilar < 60', prA.pilares[prA.prioridad.principal].puntaje < 60, true);

console.log('\n' + (fails === 0 ? 'ALL PASS' : (fails + ' FAILED')));
process.exit(fails === 0 ? 0 : 1);
