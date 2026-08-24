/* PLANEA — Motor del Planea Score (MVP Onboarding spec, Planea Financiera S.A.S.).
   PURO y determinista: sin DOM, sin red. Corre en el navegador (window.PlaneaScoreEngine)
   y en Node (module.exports) para poder testear el caso de verificación (§9.2 → 61).

   ES UN SOLO puntaje: este cálculo produce el PUNTO DE PARTIDA del Planea Score con las
   9 respuestas del onboarding; luego se refina con datos reales (unified-score.cjs).
   Textos LITERALES de la spec (§2.2, §6, §7): no se reformulan.
   Reglas duras: el insight NO lo redacta un modelo; nunca montos/%/meses; nunca felicita
   ni penaliza por no tener deuda; siempre hay al menos un CTA. */
(function (root) {
  'use strict';

  // ── Puntos medios (§3.1). Extremos = decisión de Planea, no mitad. ──────────
  var MID_INGRESOS = { i1: 1200000, i2: 2250000, i3: 4000000, i4: 6500000, i5: 12000000 };
  var MID_GASTOS   = { g1: 1200000, g2: 2000000, g3: 3250000, g4: 5250000, g5: 8000000 };
  var MID_CUOTAS   = { nopago: 0, c1: 200000, c2: 500000, c3: 1100000, c4: 2250000, c5: 4000000 };

  // ── Mapas de puntaje por respuesta ──────────────────────────────────────────
  var FONDO_MAP = { nada: 0, m1: 20, m1_3: 50, m3_6: 85, m6_12: 92, m12plus: 100 }; // P6 directo (§3.2)
  var ESTAB_MAP = { fijo: 100, varia: 65, cambia: 25 };                              // P7 (§3.5)
  var DEP_MAP   = { nadie: 100, d1_2: 65, d3plus: 30 };                              // P8 (§3.5)
  // Ajuste por tipo de deuda MÁS COSTOSO marcado (el más bajo; no se suman) (§3.4)
  var DEUDA_ADJ = { hipotecario: 10, vehiculo: 10, educativo: 0, personal: 0, compras: -5, tarjeta: -10, familiares: -20 };

  function num(v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; }

  // El monto exacto SIEMPRE manda sobre el rango (§3.1). fueraDeRango se marca aparte.
  function valorIngresos(a) { return a.monto_ingresos ? num(a.monto_ingresos) : (MID_INGRESOS[a.rango_ingresos] || 0); }
  function valorGastos(a)   { return a.monto_gastos   ? num(a.monto_gastos)   : (MID_GASTOS[a.rango_gastos]   || 0); }
  function valorCuotas(a)   {
    if (a.rango_cuotas === 'nopago') return 0;
    return a.monto_cuotas ? num(a.monto_cuotas) : (MID_CUOTAS[a.rango_cuotas] || 0);
  }

  function sinDeuda(a) {
    var t = a.tipos_deuda || [];
    return t.indexOf('ninguna') >= 0 || t.length === 0 || a.rango_cuotas === 'nopago';
  }

  // ── Los 4 pilares (por tramos, §3.2–3.5) ────────────────────────────────────
  function pilarFondo(a) { return FONDO_MAP[a.cobertura] != null ? FONDO_MAP[a.cobertura] : 0; }

  function pilarFlujo(a) {
    var ing = valorIngresos(a), gas = valorGastos(a);
    if (ing <= 0) return 0;
    var p = gas / ing;
    if (p < 0.50) return 100;
    if (p < 0.70) return 85;
    if (p < 0.85) return 65;
    if (p <= 1.00) return 35;
    return 10;
  }

  function pilarDeuda(a) {
    if (sinDeuda(a)) return 100; // sin carga que medir; NO es "premio" por no tener deuda
    var ing = valorIngresos(a), cuo = valorCuotas(a);
    var prop = ing > 0 ? cuo / ing : 1;
    var base = prop < 0.15 ? 85 : prop < 0.30 ? 65 : prop < 0.40 ? 35 : 10;
    // ajuste = el MÁS BAJO entre los tipos marcados
    var adj = 0, tipos = (a.tipos_deuda || []).filter(function (t) { return t !== 'ninguna'; });
    if (tipos.length) {
      adj = Math.min.apply(null, tipos.map(function (t) { return DEUDA_ADJ[t] != null ? DEUDA_ADJ[t] : 0; }));
    }
    var f = base + adj;
    return f < 0 ? 0 : f > 100 ? 100 : f;
  }

  function pilarEstabilidad(a) {
    var e = ESTAB_MAP[a.estabilidad_ingreso] != null ? ESTAB_MAP[a.estabilidad_ingreso] : 65;
    var d = DEP_MAP[a.numero_dependientes] != null ? DEP_MAP[a.numero_dependientes] : 65;
    return e * 0.70 + d * 0.30;
  }

  var PESOS = { fondo_emergencia: 0.35, flujo_caja: 0.25, salud_deuda: 0.25, estabilidad: 0.15 };
  // Orden de desempate del pilar de ATENCIÓN (el más bajo) — §5.1, por urgencia.
  var TIE_ATENCION = ['flujo_caja', 'salud_deuda', 'fondo_emergencia', 'estabilidad'];

  function compute(a) {
    a = a || {};
    var pil = {
      fondo_emergencia: pilarFondo(a),
      flujo_caja: pilarFlujo(a),
      salud_deuda: pilarDeuda(a),
      estabilidad: pilarEstabilidad(a),
    };
    var score = Math.round(
      pil.fondo_emergencia * PESOS.fondo_emergencia +
      pil.flujo_caja * PESOS.flujo_caja +
      pil.salud_deuda * PESOS.salud_deuda +
      pil.estabilidad * PESOS.estabilidad
    );

    var keys = Object.keys(pil);
    var minV = Math.min.apply(null, keys.map(function (k) { return pil[k]; }));
    var maxV = Math.max.apply(null, keys.map(function (k) { return pil[k]; }));
    // atención: el más bajo; empate → orden de urgencia §5.1
    var atencion = TIE_ATENCION.filter(function (k) { return pil[k] === minV; })[0];
    // respaldo: el más alto; empate → mismo orden de urgencia como desempate estable
    var respaldo = TIE_ATENCION.filter(function (k) { return pil[k] === maxV; })[0];

    var allHigh = keys.every(function (k) { return pil[k] >= 85; });
    var allEqual = minV === maxV;
    var omitir_diagnostico = allHigh;
    var omitir_reconocimiento = (pil[respaldo] < 40) || allEqual;

    // Regla de seguros (§8.2): antes leía "productos activos" (P9, retirada). Ahora lee
    // la P12 "Seguros". Se activa cuando el usuario respondió "No tengo ninguno" o "No
    // estoy seguro". Los seguros NO alimentan el cálculo; solo esta frase del insight.
    var seguros = a.seguros_activos || [];
    var sinSeguros = seguros.indexOf('ninguno') >= 0 || seguros.indexOf('inseguro') >= 0;
    var productos = a.productos_activos || []; // compat de persistencia (P9 retirada)
    var frase_sin_coberturas = (atencion === 'fondo_emergencia') && sinSeguros;

    var cta = ctaFor(atencion, allHigh);

    return {
      score: score,
      rango: rangoDe(score),
      pilares: {
        fondo_emergencia: { puntaje: round1(pil.fondo_emergencia), peso: 0.35 },
        flujo_caja: { puntaje: round1(pil.flujo_caja), peso: 0.25 },
        salud_deuda: { puntaje: round1(pil.salud_deuda), peso: 0.25 },
        estabilidad: { puntaje: round1(pil.estabilidad), peso: 0.15 },
      },
      pilar_atencion: atencion,
      pilar_respaldo: respaldo,
      productos_activos: productos,
      seguros_activos: seguros,
      frase_sin_coberturas: frase_sin_coberturas,
      cta_primario: cta.primario,
      cta_secundario: cta.secundario,
      omitir_diagnostico: omitir_diagnostico,
      omitir_reconocimiento: omitir_reconocimiento,
    };
  }

  function round1(n) { return Math.round(n * 100) / 100; }

  // ── Rango (§4) — califica la SITUACIÓN, nunca al usuario ─────────────────────
  var RANGOS = [
    { max: 30, name: 'En riesgo', color: '#B03A2E' },
    { max: 50, name: 'Frágil', color: '#C87A32' },
    { max: 70, name: 'Estable', color: '#16373A' },
    { max: 85, name: 'Saludable', color: '#5A9E7B' },
    { max: 100, name: 'Pleno', color: '#2E7D5B' },
  ];
  function rangoDe(score) { for (var i = 0; i < RANGOS.length; i++) if (score <= RANGOS[i].max) return RANGOS[i]; return RANGOS[RANGOS.length - 1]; }

  // ── CTA (§7) — solo pantallas habilitadas: deuda y ahorro ────────────────────
  var PANTALLAS_HABILITADAS = { deuda: true, ahorro: true, seguros: false, inversion: false, retiro: false };
  var CTA_TABLA = {
    flujo_caja: ['deuda', 'ahorro'],
    salud_deuda: ['deuda', 'seguros'],
    fondo_emergencia: ['ahorro', 'seguros'],
    estabilidad: ['seguros', 'retiro'],
    __all_high__: ['inversion', 'retiro'],
  };
  function ctaFor(atencion, allHigh) {
    var pref = allHigh ? CTA_TABLA.__all_high__ : (CTA_TABLA[atencion] || ['ahorro']);
    var disponibles = pref.filter(function (d) { return PANTALLAS_HABILITADAS[d]; });
    if (disponibles.length === 0) disponibles = ['ahorro']; // regla de respaldo: nunca sin CTA (§7.2)
    return { primario: disponibles[0], secundario: disponibles[1] || null };
  }

  // ── Textos LITERALES del insight (§6, §7) ────────────────────────────────────
  var APERTURA = {
    'En riesgo': '[Nombre], hoy tu salud financiera está en riesgo. Varias partes de tus finanzas se están sosteniendo con dificultad al mismo tiempo. Eso no dice nada sobre ti ni sobre cómo has manejado las cosas: dice desde dónde empezamos, y es justo donde más sirve tener el panorama completo.',
    'Frágil': '[Nombre], hoy tu salud financiera es frágil. Ya hay algo que te sostiene, pero todavía no alcanza a compensar lo demás, y por eso cualquier cambio te desbalancea. Lo importante es que ya tienes una base sobre la cual apoyarte.',
    'Estable': '[Nombre], hoy tu salud financiera es estable. Tus finanzas se sostienen en el día a día y eso ya es terreno ganado. Lo que falta es el respaldo que te permita absorber un imprevisto sin retroceder.',
    'Saludable': '[Nombre], hoy tu salud financiera es saludable. La relación entre las partes de tus finanzas se sostiene sola en condiciones normales y aguanta los imprevistos pequeños.',
    'Pleno': '[Nombre], hoy tu salud financiera es plena. Las cuatro partes que Planea mide se sostienen sin depender de una sola. Tienes la base completa para construir tu plan sobre ella.',
  };
  var DIAGNOSTICO = {
    flujo_caja: 'El punto que más pesa hoy en tu resultado es tu flujo de caja. Lo que sale cada mes está muy cerca de lo que entra, o por encima. Mientras eso siga así, cualquier otro avance es difícil de sostener.',
    salud_deuda: 'El punto que más pesa hoy en tu resultado es tu deuda. La parte de tu ingreso que ya está comprometida en cuotas limita lo que puedes destinar a cualquier otro objetivo.',
    fondo_emergencia: 'El punto que más pesa hoy en tu resultado es tu fondo de emergencia. Lo que tienes disponible no alcanza a cubrir tus gastos durante el tiempo que suele tomar resolver un imprevisto.',
    estabilidad: 'El punto que más pesa hoy en tu resultado es la relación entre la estabilidad de tu ingreso y las personas que dependen de ti. Tu ingreso varía o sostiene a más personas de las que tu estructura actual alcanza a respaldar.',
  };
  var FRASE_SIN_COBERTURAS = ' A eso se suma que todavía no tienes coberturas registradas, que son lo que evita que un imprevisto se convierta en una deuda nueva.';
  var RECONOCIMIENTO = {
    flujo_caja: 'Al mismo tiempo, tu flujo de caja es tu punto más firme: hoy logras que lo que entra alcance para lo que sale.',
    salud_deuda: 'Al mismo tiempo, tu deuda es tu punto más firme: hoy no compromete una parte determinante de tu ingreso.',
    fondo_emergencia: 'Al mismo tiempo, tu fondo de emergencia es tu punto más firme: ya cuentas con un respaldo disponible para imprevistos.',
    estabilidad: 'Al mismo tiempo, la estabilidad de tu ingreso es tu punto más firme: tienes una base predecible sobre la cual planear.',
  };
  var CIERRE = 'Soy Maya, tu guía financiera IA. Entre más completo esté tu perfil, mejor podemos construir tu plan financiero juntos. Vamos paso a paso.';
  var ADVERTENCIA = 'Planea presenta información con fines educativos e informativos. No constituye asesoría ni recomendación de productos financieros. Las decisiones sobre tus finanzas son siempre tuyas.';
  var CTA_TEXTO = {
    deuda: 'Para afinar esto necesito conocer tus deudas con más detalle: con qué entidades las tienes y en qué condiciones. El costo de cada deuda cambia por completo el orden en que conviene atenderlas.',
    ahorro: 'Para afinar esto necesito saber dónde tienes hoy tu ahorro y qué tan rápido podrías disponer de él. No es lo mismo un ahorro al que accedes de inmediato que uno comprometido a un plazo.',
    seguros: 'Para afinar esto necesito saber qué coberturas tienes hoy. Un seguro es lo que evita que un imprevisto se convierta en una deuda nueva.',
    inversion: 'Para afinar esto necesito saber si hoy tienes inversiones y de qué tipo. Con eso puedo leer tu patrimonio completo y no solamente tu mes.',
    retiro: 'Para afinar esto necesito saber qué tienes construido para tu retiro y bajo qué régimen estás. Es el pilar que más depende del tiempo y el que menos se nota en el corto plazo.',
  };
  // El segundo CTA arranca distinto (§7.1)
  function ctaTexto(destino, esSegundo) {
    var t = CTA_TEXTO[destino] || CTA_TEXTO.ahorro;
    if (esSegundo) return t.replace(/^Para afinar esto necesito /, 'También me sirve saber ');
    return t;
  }
  var BOTONES = { principal: 'Completar mi perfil', secundario: 'Ver el detalle de mi puntaje' };

  // ── Micro-mensajes de Maya durante el survey (§2.2) — sin emojis, no califican ─
  var MAYA_MICRO = {
    p4_sin_deuda: 'Listo, anotado. Sigamos.',
    p6_nada: 'Tranquilo, para eso estamos aquí. Vamos a cambiar eso juntos.',
    p6_seis_mas: 'Ya tienes un respaldo sólido construido. Eso no es común.',
  };

  // Ensambla los bloques literales del insight en el orden de §6 (+ CTA entre
  // reconocimiento y cierre, §6 nota). Devuelve piezas para render (sin montos/%/meses).
  function buildInsight(r, nombre) {
    var nm = (nombre || '').trim() || 'Hola';
    var apertura = (APERTURA[r.rango.name] || '').replace('[Nombre]', nm);
    var diagnostico = r.omitir_diagnostico ? null
      : (DIAGNOSTICO[r.pilar_atencion] || '') + (r.frase_sin_coberturas ? FRASE_SIN_COBERTURAS : '');
    var reconocimiento = r.omitir_reconocimiento ? null : (RECONOCIMIENTO[r.pilar_respaldo] || '');
    var ctas = [];
    if (r.cta_primario) ctas.push(ctaTexto(r.cta_primario, false));
    if (r.cta_secundario) ctas.push(ctaTexto(r.cta_secundario, true));
    return {
      apertura: apertura,
      diagnostico: diagnostico,
      reconocimiento: reconocimiento,
      cta_textos: ctas,
      cierre: CIERRE,
      advertencia: ADVERTENCIA,
      botones: BOTONES,
    };
  }

  // ── Insight POR PILAR (desplegable en el resultado) ─────────────────────────
  // Texto descriptivo por banda (bajo <35 / medio 35-70 / alto >70). Cumplimiento:
  // describe la situación, sin consejos, sin montos/%/meses. (El copy se afinará luego.)
  var PILAR_META = {
    fondo_emergencia: { label: 'Fondo de Emergencia', icon: 'shield', peso: '35%' },
    flujo_caja: { label: 'Flujo de Caja', icon: 'flow', peso: '25%' },
    salud_deuda: { label: 'Salud de Deuda', icon: 'card', peso: '25%' },
    estabilidad: { label: 'Estabilidad', icon: 'scale', peso: '15%' },
  };
  var PILAR_INSIGHT = {
    fondo_emergencia: {
      bajo: 'Aún no tienes un colchón que cubra tus gastos ante un imprevisto.',
      medio: 'Ya tienes algo de colchón, pero todavía no cubre un imprevisto completo.',
      alto: 'Tienes un buen respaldo para imprevistos.',
    },
    flujo_caja: {
      bajo: 'Gastas casi todo lo que recibes; te queda muy poco margen.',
      medio: 'Te queda algo de margen cada mes, aunque es ajustado.',
      alto: 'Te sobra margen: gastas bastante menos de lo que ganas.',
    },
    salud_deuda: {
      bajo: 'Tus cuotas se llevan buena parte de tu ingreso.',
      medio: 'Tu deuda es manejable, aunque compromete parte de tu ingreso.',
      alto: 'Tu deuda no pesa demasiado en tu ingreso hoy.',
    },
    estabilidad: {
      bajo: 'Tu ingreso varía o sostienes a varias personas; eso mete tensión.',
      medio: 'Tu ingreso es más o menos predecible y tus cargas, moderadas.',
      alto: 'Tu ingreso es estable y predecible: buena base para planear.',
    },
  };
  function band(score) { return score < 35 ? 'bajo' : score <= 70 ? 'medio' : 'alto'; }
  function pillarInsight(key, score) {
    var g = PILAR_INSIGHT[key]; if (!g) return '';
    return g[band(score)] || '';
  }

  var api = {
    compute: compute,
    rangoDe: rangoDe,
    buildInsight: buildInsight,
    pillarInsight: pillarInsight,
    PILAR_META: PILAR_META,
    MAYA_MICRO: MAYA_MICRO,
    MID_INGRESOS: MID_INGRESOS, MID_GASTOS: MID_GASTOS, MID_CUOTAS: MID_CUOTAS,
    FONDO_MAP: FONDO_MAP, DEUDA_ADJ: DEUDA_ADJ,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PlaneaScoreEngine = api;
})(typeof window !== 'undefined' ? window : null);
