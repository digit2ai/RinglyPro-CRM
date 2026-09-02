/* PLANEA — Traductor de DATO REAL → respuestas del motor (Documento Maestro §3, §6.3, §29-32).
   PURO y determinista (sin DOM, sin red). Corre en el navegador (window.PlaneaRealData) y en
   Node (module.exports) para su prueba.

   Regla §3 "Dato registrado es dato real": al existir dato real en un módulo, ese dato
   REEMPLAZA por completo la respuesta del survey en ese componente. Este módulo toma los
   ítems registrados (planea_items) y devuelve una copia de `answers` con las claves del
   motor sobrescritas por lo que el usuario realmente registró. El puntaje sale del MISMO
   motor de 8 pilares (planea-motor.js), así que Inicio, Puntaje Planea y las secciones no
   pueden diferir. Solo se sobrescribe donde HAY dato real; lo demás queda como el survey.

   Cobertura: Flujo (§18/§19), Ahorro cobertura (§20/§6.3 saldo líquido ÷ gastos),
   Deuda (§21/§29 pago + tipos), Inversión (§22/§30 magnitud + instrumentos).
   Impuestos y Patrimonio quedan en survey (aún no hay módulo de dato real fiable).
   Retiro y Seguros los afinan sus propias pantallas (claves retiro_tiempo/seguros_*). */
(function (root) {
  'use strict';

  function num(v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; }
  function sumBy(items, cat, field) {
    return items.reduce(function (s, it) { return it && it.category === cat ? s + num(it[field]) : s; }, 0);
  }
  function ofCat(items, cat) { return items.filter(function (it) { return it && it.category === cat; }); }

  // §6.3 — saldo LÍQUIDO: cuenta de ahorros, efectivo, fondo (FIC) sin permanencia, otro.
  // NO líquidos: CDT, Cuenta AFC (y fondo con permanencia). No suman al fondo de emergencia.
  var AHORRO_ILIQUIDO = { 'CDT': 1, 'Cuenta AFC': 1 };
  function esLiquido(it) {
    if (it.meta && it.meta.permanencia === true) return false; // fondo con pacto de permanencia
    return !AHORRO_ILIQUIDO[it.type];
  }

  // §29 — tipo de deuda de la sección → clave del ajuste del motor.
  var DEUDA_KEY = {
    'Tarjeta de crédito': 'tarjeta', 'Crédito de libre inversión': 'libre',
    'Crédito de vehículo': 'vehiculo', 'Crédito hipotecario': 'hipotecario',
    'Crédito educativo': 'educativo', 'Deuda informal': 'informal', 'Otro': 'otro',
  };
  // §30 — instrumento de inversión → clave para contar instrumentos DISTINTOS. CDT no cuenta
  // aquí (pertenece a Ahorro, §22/§30). Acciones y Bonos son un mismo grupo en el survey.
  var INV_KEY = {
    'Acciones': 'accbonos', 'Bonos': 'accbonos', 'Fondo de inversión': 'fondos', 'ETF': 'fondos',
    'Cripto': 'cripto', 'Portafolio': 'otro', 'Otro': 'otro',
  };
  // §6.3 Seguros — tipo de póliza registrada → clave de cobertura del motor. Solo cuentan
  // las que el modelo evalúa (vida/salud/vehículo/hogar); educativo/exequial/otro no suben
  // la cobertura por sí solos. Empleador se marca con meta.employer.
  var SEG_KEY = { 'Vida': 'vida', 'Salud': 'salud', 'Vehículo': 'vehiculo', 'Hogar': 'hogar' };

  function bucketCoberturaMeses(m) {
    return m > 6 ? 'm6plus' : m >= 3 ? 'm3_6' : m >= 1 ? 'm1_3' : m > 0 ? 'm1' : 'nada';
  }
  function bucketInvMeses(m) {
    return m > 6 ? 'mas6' : m >= 1 ? '1a6' : m > 0 ? 'menos1' : 'nada';
  }
  function distinct(arr) { var o = {}; arr.forEach(function (k) { if (k) o[k] = 1; }); return Object.keys(o); }

  /* applyRealData(answers, items) -> nueva copia de answers con el dato real fusionado.
     Nunca muta el objeto de entrada. Solo toca claves donde hay dato real. */
  function applyRealData(answers, items) {
    var a = Object.assign({}, answers || {});
    items = Array.isArray(items) ? items : [];

    var I = sumBy(items, 'ingreso', 'value');
    var G = sumBy(items, 'gasto', 'value');

    // ── FLUJO (§18/§19): montos reales reemplazan el punto medio del rango del survey.
    if (I > 0) a.monto_ingresos = I;
    if (G > 0) a.monto_gastos = G;

    // ── AHORRO cobertura (§20/§6.3): saldo líquido ÷ gastos → meses → tramo. Requiere
    //    gastos para el divisor. La constancia (§5) NO se afina con dato real: queda survey.
    var ahorros = ofCat(items, 'ahorro');
    if (ahorros.length && G > 0) {
      var liquido = ahorros.reduce(function (s, it) { return esLiquido(it) ? s + num(it.value) : s; }, 0);
      a.ahorro_cobertura = bucketCoberturaMeses(liquido / G);
    }

    // ── DEUDA (§21/§29): pago mensual real + tipos reales. Si hay deudas registradas, el
    //    usuario SÍ tiene deuda (se quita 'ninguna').
    var deudas = ofCat(items, 'deuda');
    if (deudas.length) {
      var pagos = deudas.reduce(function (s, it) { return s + num(it.monthly); }, 0);
      a.monto_pago = pagos;
      a.rango_pago = pagos > 0 ? 'real' : a.rango_pago; // marcador no-'nopago' para que el motor use el monto
      a.deuda_tipos = distinct(deudas.map(function (it) { return DEUDA_KEY[it.type] || 'otro'; }));
    }

    // ── INVERSIÓN (§22/§30): magnitud = portafolio ÷ ingreso; distribución = nº de
    //    instrumentos distintos. CDT registrado en inversión no cuenta (pertenece a ahorro).
    var invs = ofCat(items, 'inversion').filter(function (it) { return it.type !== 'CDT'; });
    if (invs.length) {
      var port = invs.reduce(function (s, it) { return s + num(it.value); }, 0);
      if (I > 0) a.inversion_magnitud = bucketInvMeses(port / I);
      a.inversion_donde = distinct(invs.map(function (it) { return INV_KEY[it.type] || 'otro'; }));
    }

    // ── SEGUROS cobertura (§6.3): tipos de pólizas registradas reemplazan el survey.
    //    Si TODAS las pólizas son del empleador → 'empresa' (cobertura 45). La suficiencia
    //    (§9) NO se afina aquí: la edita la pantalla de Seguros.
    var polizas = ofCat(items, 'seguros');
    if (polizas.length) {
      var mapped = distinct(polizas.map(function (it) { return SEG_KEY[it.type]; }).filter(Boolean));
      var todasEmpleador = polizas.every(function (it) { return it.meta && it.meta.employer === true; });
      if (todasEmpleador) a.seguros_tipos = ['empresa'];
      else if (mapped.length) a.seguros_tipos = mapped;
      // si hay pólizas pero ninguna mapea (solo exequial/otro), se conserva el survey.
    }

    return a;
  }

  var api = { applyRealData: applyRealData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PlaneaRealData = api;
})(typeof window !== 'undefined' ? window : null);
