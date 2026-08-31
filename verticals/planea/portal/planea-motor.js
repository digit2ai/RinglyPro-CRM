/* PLANEA — Motor del Puntaje Planea v2 (Documento Maestro de Ajustes, Agosto 2026).
   MOTOR ÚNICO (regla §3): ocho pilares, un solo número 0–100. PURO y determinista:
   sin DOM, sin red. Corre en el navegador (window.PlaneaMotor) y en Node
   (module.exports) para la prueba de regresión §8 (Perfiles A/B/C/D → 49/23/77/79).

   Reemplaza al motor de 4 pilares y al cálculo paralelo de Salud Financiera.
   §6 al pie de la letra: pesos fijos, sub-componentes por fuente survey|real,
   moduladores de contexto, redondeo una sola vez sobre el total, tope 0–100. */
(function (root) {
  'use strict';

  // ── Pesos de los 8 pilares (§6) — fijos para todos, nunca por segmento ──────
  var PESOS = { ahorro: 20, flujo: 18, deuda: 18, retiro: 12, seguros: 12, inversion: 10, impuestos: 6, patrimonio: 4 };

  // ── Rangos (§7) — únicos válidos en toda la app ─────────────────────────────
  var RANGOS = [
    { max: 35, name: 'Punto de partida', color: '#B03A2E' },
    { max: 52, name: 'Construyendo', color: '#C87A32' },
    { max: 68, name: 'En camino', color: '#16373A' },
    { max: 83, name: 'Sólido', color: '#5A9E7B' },
    { max: 100, name: 'Planeado', color: '#2E7D5B' },
  ];
  function rangoDe(s) { for (var i = 0; i < RANGOS.length; i++) if (s <= RANGOS[i].max) return RANGOS[i]; return RANGOS[RANGOS.length - 1]; }

  function num(v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }

  // ── Puntos medios de rango (§6.5) ───────────────────────────────────────────
  // Q18/Q19 comparten los mismos 5 tramos (§5). Puntos medios §6.5.
  var MID_ING = { i1: 1000000, i2: 2250000, i3: 4500000, i4: 9000000, i5: 18000000 };       // Q18 ingresos
  var MID_GAS = { g1: 1000000, g2: 2250000, g3: 4500000, g4: 9000000, g5: 18000000 };       // Q19 gastos
  var MID_PAGO = { nopago: 0, p1: 250000, p2: 1000000, p3: 2250000, p4: 4500000 };          // Q20

  function valorIngresos(a) { return a.monto_ingresos ? num(a.monto_ingresos) : (MID_ING[a.rango_ingresos] || 0); }
  function valorGastos(a) { return a.monto_gastos ? num(a.monto_gastos) : (MID_GAS[a.rango_gastos] || 0); }
  function valorPago(a) {
    if (a.rango_pago === 'nopago') return 0;
    return a.monto_pago ? num(a.monto_pago) : (MID_PAGO[a.rango_pago] || 0);
  }

  // ── Moduladores de contexto (§6.1) ──────────────────────────────────────────
  function esIndependiente(a) { return a.ocupacion === 'independiente'; }
  function esVariable(a) { return a.variabilidad === 'cambia'; }
  function nDeps(a) { return a.dependientes === 'd1_2' ? 1.5 : a.dependientes === 'd3plus' ? 3 : 0; }
  function tieneVida(a) { return has(a.seguros_tipos, 'vida'); }

  // ── AHORRO — peso 20 % (§6.3) ───────────────────────────────────────────────
  var COBERTURA_MAP = { m6plus: 100, m3_6: 80, m1_3: 55, m1: 30, nada: 0 };                 // Q6
  var CONSTANCIA_MAP = { casi_todos: 100, a_veces: 60, casi_nunca: 25, cero: 0 };            // Q5
  function pilarAhorro(a) {
    var cob = COBERTURA_MAP[a.ahorro_cobertura] != null ? COBERTURA_MAP[a.ahorro_cobertura] : 50;
    // Moduladores sobre COBERTURA, piso 0, tope combinado −20 (§6.1, §6.5)
    var resta = (esIndependiente(a) ? 10 : 0) + (esVariable(a) ? 10 : 0);
    cob = Math.max(0, cob - Math.min(resta, 20));
    var con = CONSTANCIA_MAP[a.ahorro_constancia] != null ? CONSTANCIA_MAP[a.ahorro_constancia] : 50;
    return 0.70 * cob + 0.30 * con;
  }

  // ── FLUJO DE CAJA — peso 18 % (§6.3) ────────────────────────────────────────
  function pilarFlujo(a) {
    var ing = valorIngresos(a), gas = valorGastos(a);
    if (ing <= 0) return 0;
    var m = (ing - gas) / ing;                 // margen; no descuenta deuda ni ahorro
    if (m < 0) return 0;                        // gastos > ingresos (§6.5)
    if (m >= 0.30) return 100;
    if (m >= 0.20) return 85;
    if (m >= 0.10) return 65;
    return 40;                                  // 0–10 %
  }

  // ── DEUDA — peso 18 % (§6.3, §29) ───────────────────────────────────────────
  var DEUDA_ADJ = { hipotecario: 15, educativo: 10, vehiculo: 0, otro: 0, libre: -5, compras: -10, tarjeta: -15, informal: -20 };
  function sinDeuda(a) { return has(a.deuda_tipos, 'ninguna') || !(a.deuda_tipos && a.deuda_tipos.length) || a.rango_pago === 'nopago'; }
  function pilarDeuda(a) {
    var tipos = (a.deuda_tipos || []).filter(function (t) { return t !== 'ninguna'; });
    // Carga de pago (70 %)
    var carga;
    if (has(a.deuda_tipos, 'ninguna')) { carga = 100; }
    else {
      var ing = valorIngresos(a), pago = valorPago(a);
      var r = ing > 0 ? pago / ing : (pago > 0 ? 1 : 0);
      carga = (r <= 0.10) ? 100 : (r <= 0.20) ? 80 : (r <= 0.30) ? 55 : (r <= 0.40) ? 30 : 0;
    }
    // Composición (30 %): base 70 + suma de ajustes de los tipos presentes, acotado 0–100
    var comp;
    if (has(a.deuda_tipos, 'ninguna')) { comp = 100; }
    else {
      var adj = tipos.reduce(function (s, t) { return s + (DEUDA_ADJ[t] != null ? DEUDA_ADJ[t] : 0); }, 0);
      comp = clamp(70 + adj, 0, 100);
    }
    return 0.70 * carga + 0.30 * comp;
  }

  // ── RETIRO / PENSIÓN — peso 12 % (§6.3) ─────────────────────────────────────
  // Matriz tiempo cotizado × rango de edad. Columnas: e1..e5.
  var RETIRO_MATRIZ = {
    mas15: { e1: 100, e2: 100, e3: 95, e4: 90, e5: 85 },
    '5a15': { e1: 95, e2: 85, e3: 70, e4: 50, e5: 35 },
    menos5: { e1: 80, e2: 55, e3: 35, e4: 20, e5: 10 },
    nocotizo: { e1: 40, e2: 25, e3: 15, e4: 10, e5: 5 },
    nose: { e1: 50, e2: 50, e3: 50, e4: 50, e5: 50 },
  };
  function pilarRetiro(a) {
    if (a.ocupacion === 'pensionado') return 100;
    var fila = RETIRO_MATRIZ[a.retiro_tiempo] || RETIRO_MATRIZ.nose;
    var base = fila[a.edad] != null ? fila[a.edad] : 50;
    if (a.retiro_regimen && a.retiro_regimen !== 'nose') base = Math.min(100, base + 5);
    return base;
  }

  // ── SEGUROS — peso 12 % (§6.3) ──────────────────────────────────────────────
  var SUFICIENCIA_MAP = { mas1: 100, '3a12': 65, menos3: 25, nose: 50 };                     // Q9
  function coberturaSeguros(a) {
    var t = a.seguros_tipos || [];
    if (has(t, 'ninguno')) return 0;
    if (has(t, 'inseguro')) return 50;
    var propias = t.filter(function (x) { return x !== 'empresa'; });
    if (propias.length === 0 && has(t, 'empresa')) return 45;   // solo lo del empleador
    var vida = has(t, 'vida'), salud = has(t, 'salud'), patr = has(t, 'vehiculo') || has(t, 'hogar');
    // Recorre las filas en orden; primera que se cumple (§6.3)
    if (vida && salud && patr) return 100;
    if (vida && salud) return 85;
    if (salud || vida) return 60;               // patrimonial solo suma si ya hay vida y salud
    if (has(t, 'empresa')) return 45;
    if (patr) return 40;                        // solo coberturas patrimoniales
    return 0;
  }
  function pilarSeguros(a) {
    var cob = coberturaSeguros(a);
    var suf = SUFICIENCIA_MAP[a.seguros_suficiencia] != null ? SUFICIENCIA_MAP[a.seguros_suficiencia] : 50;
    var s = 0.50 * cob + 0.50 * suf;
    // Modulador por dependientes (§6.1): si NO hay seguro de vida activo
    if (!tieneVida(a)) {
      var d = nDeps(a);
      if (d >= 3) s = s * 0.8; else if (d >= 1) s = s * 0.9;
    }
    return s;
  }

  // ── INVERSIÓN — peso 10 % (§6.3) ────────────────────────────────────────────
  var INV_MAG_MAP = { mas6: 100, '1a6': 70, menos1: 40, nada: 0, nose: 50 };                 // Q17
  function pilarInversion(a, ahorroScore) {
    var donde = a.inversion_donde || [];
    if (has(donde, 'ninguno')) return 0;        // "No tengo nada invertido" -> ambos 0 (§5.3)
    var mag = INV_MAG_MAP[a.inversion_magnitud] != null ? INV_MAG_MAP[a.inversion_magnitud] : 50;
    var n = donde.filter(function (x) { return x !== 'ninguno'; }).length;
    var dist = n >= 3 ? 100 : n === 2 ? 75 : n === 1 ? 50 : 0;
    var v = 0.60 * mag + 0.40 * dist;
    // Regla de secuencia: si Ahorro < 40 y hay inversión declarada, tope 70
    if (ahorroScore < 40 && n > 0) v = Math.min(v, 70);
    return v;
  }

  // ── IMPUESTOS — peso 6 % (§6.3) ─────────────────────────────────────────────
  var IMP_CUMPL_MAP = { aldia: 100, notoca: 85, atraso: 45, nose: 20 };                       // Q14
  var IMP_SOP_MAP = { organizados: 100, algunos: 55, nose: 30, ninguno: 20 };                 // Q15
  function pilarImpuestos(a) {
    var c = IMP_CUMPL_MAP[a.impuestos_cumplimiento] != null ? IMP_CUMPL_MAP[a.impuestos_cumplimiento] : 20;
    var s = IMP_SOP_MAP[a.impuestos_soportes] != null ? IMP_SOP_MAP[a.impuestos_soportes] : 30;
    return 0.70 * c + 0.30 * s;
  }

  // ── PATRIMONIO Y SUCESIÓN — peso 4 % (§6.3) ─────────────────────────────────
  var SUCESION_MAP = { definido: 100, algunos: 60, noaplica: 40, nada: 25 };                  // Q13
  function pilarPatrimonio(a) {
    var cats = (a.patrimonio_activos || []).filter(function (x) { return x !== 'ninguno'; }).length;
    var activos = cats >= 3 ? 100 : cats === 2 ? 75 : cats === 1 ? 50 : 20;   // piso 20
    var prev = SUCESION_MAP[a.patrimonio_sucesion] != null ? SUCESION_MAP[a.patrimonio_sucesion] : 40;
    var edad40 = (a.edad === 'e3' || a.edad === 'e4' || a.edad === 'e5');
    var conDeps = nDeps(a) >= 1;
    var wA = (edad40 || conDeps) ? 0.60 : 0.80, wP = (edad40 || conDeps) ? 0.40 : 0.20;
    return wA * activos + wP * prev;
  }

  // ── COMPUTE — orden §6.2, redondeo una sola vez al final §6.5 ────────────────
  function round1(n) { return Math.round(n * 100) / 100; }
  function compute(a) {
    a = a || {};
    var pil = {};
    pil.ahorro = pilarAhorro(a);
    pil.flujo = pilarFlujo(a);
    pil.deuda = pilarDeuda(a);
    pil.retiro = pilarRetiro(a);
    pil.seguros = pilarSeguros(a);
    pil.inversion = pilarInversion(a, pil.ahorro);   // requiere Ahorro (regla de secuencia)
    pil.impuestos = pilarImpuestos(a);
    pil.patrimonio = pilarPatrimonio(a);

    var total = 0;
    Object.keys(PESOS).forEach(function (k) { total += (PESOS[k] / 100) * pil[k]; });
    var score = Math.round(total);   // única vez, sobre el total

    return {
      score: score,
      rango: rangoDe(score),
      pilares: {
        ahorro: { puntaje: round1(pil.ahorro), peso: 20 },
        flujo: { puntaje: round1(pil.flujo), peso: 18 },
        deuda: { puntaje: round1(pil.deuda), peso: 18 },
        retiro: { puntaje: round1(pil.retiro), peso: 12 },
        seguros: { puntaje: round1(pil.seguros), peso: 12 },
        inversion: { puntaje: round1(pil.inversion), peso: 10 },
        impuestos: { puntaje: round1(pil.impuestos), peso: 6 },
        patrimonio: { puntaje: round1(pil.patrimonio), peso: 4 },
      },
      prioridad: prioridad(a, pil),
    };
  }

  // ── PRIORIZACIÓN DE HALLAZGOS (§14) — determinista, un solo pilar prioritario ─
  var ORDEN_EDAD = {
    e1: ['ahorro', 'deuda', 'flujo', 'seguros', 'inversion', 'impuestos', 'retiro', 'patrimonio'],
    e2: ['ahorro', 'deuda', 'flujo', 'seguros', 'retiro', 'inversion', 'impuestos', 'patrimonio'],
    e3: ['ahorro', 'deuda', 'retiro', 'seguros', 'flujo', 'inversion', 'patrimonio', 'impuestos'],
    e4: ['retiro', 'ahorro', 'seguros', 'deuda', 'patrimonio', 'flujo', 'inversion', 'impuestos'],
    e5: ['retiro', 'patrimonio', 'seguros', 'ahorro', 'flujo', 'deuda', 'inversion', 'impuestos'],
  };
  function prioridad(a, pil) {
    var orden = (ORDEN_EDAD[a.edad] || ORDEN_EDAD.e2).slice();
    // Seguros sube dos posiciones si hay dependientes (§14.2)
    if (nDeps(a) >= 1) {
      var i = orden.indexOf('seguros');
      if (i > 0) { orden.splice(i, 1); orden.splice(Math.max(0, i - 2), 0, 'seguros'); }
    }
    if (a.ocupacion === 'pensionado') { orden = orden.filter(function (k) { return k !== 'retiro'; }); }
    var principal = null, secundario = null;
    for (var j = 0; j < orden.length; j++) { if (pil[orden[j]] < 60) { principal = orden[j]; break; } }
    if (principal == null) {
      var lo = 101; orden.forEach(function (k) { if (pil[k] < lo) { lo = pil[k]; principal = k; } });
    } else {
      for (var m = orden.indexOf(principal) + 1; m < orden.length; m++) { if (pil[orden[m]] < 40) { secundario = orden[m]; break; } }
    }
    return { principal: principal, secundario: secundario };
  }

  var api = { compute: compute, rangoDe: rangoDe, PESOS: PESOS, RANGOS: RANGOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PlaneaMotor = api;
})(typeof window !== 'undefined' ? window : null);
