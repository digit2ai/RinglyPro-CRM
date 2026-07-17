/* PLANEA — Diagnóstico / Puntaje (vanilla port of the original React onboarding).
   9-step financial diagnostic (P1–P9 + tasa de deuda) → animated calc → result
   with pillar breakdown + Maya recommendation. Scoring + recommendation logic is
   ported 1:1 from src/features/scoring/api/scoreOnboarding.calculations.ts so the
   numbers are identical to the initial version. On completion (if logged in) it
   writes persons.score_data in the SAME shape the dashboard loader + Maya read. */
(function () {
  'use strict';

  // ── SCORING (ported from scoreOnboarding.calculations.ts) ───────────────────
  var INC_MAP = { A: 1200000, B: 2250000, C: 4000000, D: 6500000, E: 9000000 };
  var EXP_MAP = { A: 1200000, B: 2000000, C: 3250000, D: 5250000, E: 8000000 };
  var DBT_MAP = { A: 200000,  B: 500000,  C: 1100000, D: 2250000, E: 4000000 };
  var COV_MAP = { A: 20, B: 50, C: 85, D: 92, E: 100 };
  var STB_MAP = { A: 100, B: 65, C: 25 };
  var DEP_MAP = { A: 100, B: 65, C: 30 };

  function exactOr(exactKey, fallbackMap, rangeVal, answers, def) {
    if (rangeVal === 'X') return Math.max(0, parseInt(answers[exactKey] || '0', 10) || def);
    return fallbackMap[rangeVal || ''] != null ? fallbackMap[rangeVal || ''] : def;
  }

  function computeScore(a) {
    var inc = exactOr('P2_exact', INC_MAP, a.P2, a, 4000000);
    var exp = exactOr('P3_exact', EXP_MAP, a.P3, a, 3200000);

    // Pilar 1 — Fondo de Emergencia (35%)
    var p1 = a.P6 === 'no' ? 0 : (COV_MAP[a.P7] != null ? COV_MAP[a.P7] : 50);

    // Pilar 2 — Flujo de Caja (25%)
    var rf = exp / inc;
    var p2 = rf < 0.50 ? 100 : rf < 0.70 ? 85 : rf < 0.85 ? 65 : rf <= 1.0 ? 35 : 10;

    // Pilar 3 — Salud de Deudas (25%)
    var p3;
    if (a.P4 === 'no') { p3 = 100; }
    else {
      var dp = exactOr('P5_exact', DBT_MAP, a.P5, a, 500000);
      var rd = dp / inc;
      p3 = rd < 0.15 ? 85 : rd < 0.30 ? 65 : rd < 0.40 ? 35 : 10;
    }

    // Pilar 4 — Estabilidad (15%)
    var stab = STB_MAP[a.P8] != null ? STB_MAP[a.P8] : 65;
    var dep = DEP_MAP[a.P9] != null ? DEP_MAP[a.P9] : 65;
    var p4 = Math.round(stab * 0.60 + dep * 0.40);

    var score = Math.round(p1 * 0.35 + p2 * 0.25 + p3 * 0.25 + p4 * 0.15);
    return { score: score, p1: p1, p2: p2, p3: p3, p4: p4 };
  }

  function getScoreLabel(score) {
    if (score >= 86) return { name: 'Planeado',        color: '#4B7F52', desc: 'El nivel más alto. Mantenerlo es el reto.' };
    if (score >= 71) return { name: 'Sólido',          color: '#5e9520', desc: 'Estás donde el 20% de colombianos quisiera estar.' };
    if (score >= 51) return { name: 'En camino',       color: '#46516E', desc: 'Tienes bases sólidas. Ahora es acelerar.' };
    if (score >= 31) return { name: 'Construyendo',    color: '#b8860b', desc: 'Estás en movimiento. Eso ya es más que la mayoría.' };
    return              { name: 'Punto de partida', color: '#c0392b', desc: 'El primer paso es saber dónde estás. Ya lo diste.' };
  }

  // Result-screen headline shown above the ring, per rango.
  var LABEL_HEADLINE = {
    'Planeado': 'Estás donde muy pocos llegan. A mantenerlo.',
    'Sólido': 'Estás donde el 20% de colombianos quisiera estar.',
    'En camino': 'Tienes bases sólidas. Ahora es acelerar.',
    'Construyendo': 'Estás en movimiento. Eso ya es más que la mayoría.',
    'Punto de partida': 'El primer paso es saber dónde estás. Ya lo diste.'
  };

  function getDebtRateFromAnswers(a) {
    if (a.P5_rate === 'lt10')    return 9;
    if (a.P5_rate === '10to20')  return 15;
    if (a.P5_rate === 'gt20')    return 30;
    if (a.P5_rate === 'unknown') return null;
    if (a.P5_rate === 'lt20')    return 15;
    if (a.P5_rate === '20to40')  return 30;
    if (a.P5_rate === 'gt40')    return 41;
    return null;
  }
  function classifyDebt(a) {
    if (a.P4 !== 'yes') return 'none';
    var rate = getDebtRateFromAnswers(a);
    if (rate === null) return 'expensive';
    if (rate > 20) return 'expensive';
    if (rate >= 10) return 'moderate';
    return 'good';
  }

  var OBJETIVO_LABELS = { A: 'pagar tus deudas', B: 'construir tu fondo de emergencia', C: 'alcanzar tu meta', D: 'conseguir libertad financiera', E: 'empezar a invertir' };
  var COV_MONTHS = { A: 0.5, B: 1.5, C: 3, D: 6, E: 12 };
  var SCENARIO_IMMEDIATE_GOAL = {
    A: 'cerrar el hueco entre tus ingresos y gastos',
    B: 'construir un colchón mínimo de liquidez',
    C: 'eliminar tu deuda cara',
    D: 'atacar la deuda cara mientras construyes tu fondo',
    E: 'crear tu primer ahorro de emergencia',
    F: 'completar tu primer mes de fondo de emergencia',
    G: 'completar 3 meses de fondo de emergencia',
    H: 'manejar tu deuda moderada e invertir al mismo tiempo',
    I: 'invertir de forma sostenida'
  };
  function formatCOP(n) {
    var rounded = Math.round(n / 1000) * 1000;
    if (rounded >= 1000000) { var m = rounded / 1000000; return '$' + (m % 1 === 0 ? m : m.toFixed(1)) + 'M'; }
    return '$' + rounded.toLocaleString('es-CO');
  }
  function objectiveMatchesScenario(p1, s) {
    if (p1 === 'A' && (s === 'C' || s === 'D')) return true;
    if (p1 === 'B' && ['B', 'E', 'F', 'G'].indexOf(s) >= 0) return true;
    if (p1 === 'C' && (s === 'H' || s === 'I')) return true;
    if ((p1 === 'D' || p1 === 'E') && (s === 'H' || s === 'I')) return true;
    return false;
  }
  function applyHonestyRule(base, objetivo, scenario, p1) {
    if (objectiveMatchesScenario(p1, scenario)) return base;
    var immediate = SCENARIO_IMMEDIATE_GOAL[scenario];
    return 'Sé que quieres ' + objetivo + '. Vamos a llegar ahí. Pero primero necesitamos ' + immediate + '. Cuando lo resolvamos, podremos avanzar hacia ' + objetivo + ' con una base más estable. ' + base;
  }
  function getDebtRateLabelForMessage(a) {
    if (a.P5_rate === 'gt20' || a.P5_rate === '20to40' || a.P5_rate === 'gt40') return 'más del 20% EA';
    return 'una tasa alta';
  }

  function getRecommendation(a, name) {
    var inc = exactOr('P2_exact', INC_MAP, a.P2, a, 4000000);
    var exp = exactOr('P3_exact', EXP_MAP, a.P3, a, 3200000);
    var objetivo = OBJETIVO_LABELS[a.P1 || ''] || 'mejorar tus finanzas';
    var nombre = name || 'amigo/a';

    var margen = (inc - exp) / inc;
    if (margen < 0) {
      var dif = Math.abs(inc - exp);
      var base = nombre + ', antes de hablar de deudas o ahorros necesito decirte algo importante: cada mes estás gastando más de lo que ganas. Eso significa que tu deuda crece sola aunque no uses las tarjetas. Lo primero que vamos a hacer juntos es cerrar ese hueco. Esta semana revisemos en qué se va la plata.';
      return { scenario: 'A', goalText: 'Reducir gastos en ' + formatCOP(dif) + ' para no seguir endeudándote cada mes.', mayaMessage: applyHonestyRule(base, objetivo, 'A', a.P1 || ''), timeline: '30 días para identificar y reducir gastos variables.' };
    }
    if (margen <= 0.10) {
      var meses = Math.ceil(500000 / (inc - exp));
      var b2 = 'Tu flujo de caja está muy ajustado. Tienes poco margen para maniobrar y eso es riesgoso — cualquier imprevisto puede desbalancear todo. Primero construyamos un colchón mínimo de $500.000. Con eso tienes un amortiguador. ¿Cuánto puedes separar esta quincena?';
      return { scenario: 'B', goalText: 'Ahorra $500.000 como colchón mínimo de emergencia antes de atacar cualquier otra cosa.', mayaMessage: applyHonestyRule(b2, objetivo, 'B', a.P1 || ''), timeline: meses + ' ' + (meses === 1 ? 'mes' : 'meses') + ' para lograrlo.' };
    }

    var debtClass = classifyDebt(a);
    var tieneDeudaCara = debtClass === 'expensive';
    var tieneDeudaModOBuena = debtClass === 'moderate' || debtClass === 'good';
    var cuotas = a.P4 === 'yes' ? exactOr('P5_exact', DBT_MAP, a.P5, a, 500000) : 0;
    var dti = cuotas / inc;
    var margenLibre = inc - exp - cuotas;

    if (tieneDeudaCara && dti > 0.20) {
      var pagoExtra = Math.round(cuotas * 0.10);
      var tasaLabel = getDebtRateLabelForMessage(a);
      return { scenario: 'C', goalText: 'Paga ' + formatCOP(pagoExtra) + ' adicionales al mes a tu deuda más cara.', mayaMessage: nombre + ', sé que tu objetivo es ' + objetivo + '. Y vamos a llegar ahí. Pero primero necesito ser honesta contigo: tienes deuda a ' + tasaLabel + '. Eso significa que cada mes esa deuda te cobra más de lo que cualquier inversión te podría dar. Lo más inteligente ahora mismo es eliminar esa deuda — cuando lo hagas, toda esa plata que ibas pagando en cuotas queda libre para ' + objetivo + '. ¿Arrancamos?', timeline: 'Calculado según tu saldo y pago adicional.' };
    }
    if (tieneDeudaCara && dti <= 0.20) {
      var pd = Math.max(0, Math.round(margenLibre * 0.50));
      var af = Math.max(0, Math.round(margenLibre * 0.50));
      var b4 = 'Tienes deuda cara pero está bajo control. Mi recomendación: divide tu margen en dos — la mitad para pagar más de la cuota de tu deuda cara, la otra mitad para empezar tu fondo de emergencia. Así avanzas en los dos frentes al mismo tiempo.';
      return { scenario: 'D', goalText: 'Divide tu margen disponible: ' + formatCOP(pd) + ' para deuda cara y ' + formatCOP(af) + ' para fondo de emergencia.', mayaMessage: applyHonestyRule(b4, objetivo, 'D', a.P1 || ''), timeline: 'Calculado según tu margen disponible.' };
    }

    var mesesCob = a.P6 === 'no' ? 0 : (COV_MONTHS[a.P7 || ''] || 0);
    if (mesesCob === 0) {
      var sem = Math.round(exp / 4);
      var b5 = 'No tienes ningún ahorro guardado. Eso significa que cualquier imprevisto — una enfermedad, una reparación, perder el trabajo — puede llevarte a endeudarte. Lo primero es cambiar eso. Esta semana separa ' + formatCOP(sem) + ' antes de gastar. No es para invertir ni para pagar deuda — es tu escudo.';
      return { scenario: 'E', goalText: 'Ahorra ' + formatCOP(sem) + ' esta semana — en 4 semanas tienes tu primer mes de respaldo.', mayaMessage: applyHonestyRule(b5, objetivo, 'E', a.P1 || ''), timeline: '4 semanas para tu primer mes de fondo.' };
    }
    if (mesesCob < 1) {
      var act = Math.round(exp * mesesCob);
      var falt = exp - act;
      var m6 = Math.ceil(falt / Math.max(1, margenLibre));
      var b6 = 'Tienes algo guardado pero no es suficiente para protegerte de un imprevisto real. Con menos de 1 mes de cobertura, cualquier gasto inesperado te puede obligar a endeudarte. Necesitas al menos 1 mes de gastos antes de pensar en otra cosa. Estás a ' + formatCOP(falt) + ' de lograrlo — ¿vamos?';
      return { scenario: 'F', goalText: 'Llegar a 1 mes de fondo de emergencia — te faltan ' + formatCOP(falt) + '.', mayaMessage: applyHonestyRule(b6, objetivo, 'F', a.P1 || ''), timeline: m6 + ' ' + (m6 === 1 ? 'mes' : 'meses') + ' para lograrlo.' };
    }
    if (mesesCob < 3) {
      var act2 = Math.round(exp * mesesCob);
      var falt2 = 3 * exp - act2;
      var m7 = Math.ceil(falt2 / Math.max(1, margenLibre));
      var baseG = 'Ya tienes ' + mesesCob + ' mes(es) de fondo de emergencia — eso es un gran avance. El estándar que recomienda el CFP Board para alguien en tu situación es llegar a 3 meses. Te faltan ' + formatCOP(falt2) + ' para lograrlo. Con lo que tienes disponible cada mes puedes llegar en ' + m7 + ' ' + (m7 === 1 ? 'mes' : 'meses') + '.';
      if (debtClass === 'moderate') {
        var afG = Math.round(margenLibre * 0.60);
        var pdG = Math.round(margenLibre * 0.40);
        return { scenario: 'G', goalText: 'Completar 3 meses de fondo — te faltan ' + formatCOP(falt2) + '. Divide tu margen: ' + formatCOP(afG) + ' al fondo y ' + formatCOP(pdG) + ' a tu deuda moderada.', mayaMessage: applyHonestyRule(baseG, objetivo, 'G', a.P1 || ''), timeline: m7 + ' ' + (m7 === 1 ? 'mes' : 'meses') + ' para completar el fondo.' };
      }
      return { scenario: 'G', goalText: 'Completar 3 meses de fondo de emergencia — te faltan ' + formatCOP(falt2) + '.', mayaMessage: applyHonestyRule(baseG, objetivo, 'G', a.P1 || ''), timeline: m7 + ' ' + (m7 === 1 ? 'mes' : 'meses') + ' para completar el fondo.' };
    }

    if (tieneDeudaModOBuena) {
      var inv = Math.max(0, Math.round(margenLibre * 0.70));
      var pc = Math.max(0, Math.round(margenLibre * 0.30));
      var b8 = 'Estás en muy buena posición. Tu deuda actual tiene una tasa razonable y tu fondo de emergencia está sólido. Ahora es momento de hacer que tu plata trabaje para ti. Con tu margen disponible puedes estar invirtiendo ' + formatCOP(inv) + ' cada mes. Te muestro opciones que se ajustan a tu perfil — sin comisiones escondidas.';
      return { scenario: 'H', goalText: 'Invierte ' + formatCOP(inv) + ' cada mes y usa ' + formatCOP(pc) + ' para acelerar tu crédito.', mayaMessage: applyHonestyRule(b8, objetivo, 'H', a.P1 || ''), timeline: 'Mensual.' };
    }
    var metaInv = Math.round(inc * 0.20);
    return { scenario: 'I', goalText: 'Invierte al menos el 20% de tus ingresos — ' + formatCOP(metaInv) + ' cada mes.', mayaMessage: nombre + ', estás en el top 5% de colombianos financieramente. Sin deuda y con fondo de emergencia completo, cada peso que ganas puede trabajar para ti. Voy a mostrarte opciones de inversión que se ajustan exactamente a tu perfil — sin agenda oculta, sin productos que no te convengan.', timeline: 'Mensual.' };
  }

  // ── QUESTION MODEL ──────────────────────────────────────────────────────────
  var CALC_LABELS = ['Evaluando fondo de emergencia', 'Midiendo flujo de caja', 'Analizando salud de deudas', 'Calculando estabilidad', 'Construyendo tu perfil financiero'];

  var Q = {
    1: { key: 'P1', tag: '🎯 Para empezar', title: '¿Cuál es tu mayor objetivo financiero ahora mismo?', hint: 'Tu respuesta nos ayuda a orientarte mejor después del diagnóstico.', type: 'single', options: [
      { val: 'A', emoji: '🎯', label: 'Salir de deudas y respirar tranquilo' },
      { val: 'B', emoji: '🛡️', label: 'Tener un colchón para cualquier imprevisto' },
      { val: 'C', emoji: '🏠', label: 'Ahorrar para algo grande (casa, carro, viaje)' },
      { val: 'D', emoji: '💼', label: 'Tener más libertad, depender menos de un sueldo' },
      { val: 'E', emoji: '📈', label: 'Hacer crecer mi plata, que trabaje por mí' }
    ] },
    2: { key: 'P2', tag: '💰 Ingresos', title: '¿Cuánto son tus ingresos al mes?', hint: 'Suma todo: sueldo, freelance, rentas, lo que sea.', type: 'exact', exactKey: 'P2_exact', placeholder: '3.500.000', options: [
      { val: 'A', label: 'Menos de $1.500.000' }, { val: 'B', label: 'Entre $1.500.000 y $3.000.000' }, { val: 'C', label: 'Entre $3.000.000 y $5.000.000' }, { val: 'D', label: 'Entre $5.000.000 y $8.000.000' }, { val: 'E', label: 'Más de $8.000.000' }
    ] },
    3: { key: 'P3', tag: '🧾 Gastos', title: '¿Cuánto gastas al mes en total?', hint: 'Arriendo, comida, transporte, entretenimiento, todo.', type: 'exact', exactKey: 'P3_exact', placeholder: '2.800.000', options: [
      { val: 'A', label: 'Menos de $1.500.000' }, { val: 'B', label: 'Entre $1.500.000 y $2.500.000' }, { val: 'C', label: 'Entre $2.500.000 y $4.000.000' }, { val: 'D', label: 'Entre $4.000.000 y $6.500.000' }, { val: 'E', label: 'Más de $6.500.000' }
    ] },
    4: { key: 'P4', tag: '⚡ Deudas', title: '¿Tienes deudas activas en este momento?', hint: 'Tarjeta, crédito, cuotas, lo que sea.', type: 'binary', yes: 'Sí, tengo deudas', no: 'No tengo deudas' },
    5: { key: 'P5', tag: '📆 Cuotas', title: '¿Cuánto pagas al mes en cuotas sumando todas tus deudas?', hint: 'Todos los pagos fijos de deuda juntos.', type: 'exact', exactKey: 'P5_exact', placeholder: '800.000', options: [
      { val: 'A', label: 'Menos de $300.000' }, { val: 'B', label: 'Entre $300.000 y $700.000' }, { val: 'C', label: 'Entre $700.000 y $1.500.000' }, { val: 'D', label: 'Entre $1.500.000 y $3.000.000' }, { val: 'E', label: 'Más de $3.000.000' }
    ] },
    55: { key: 'P5_rate', tag: '📈 Tasa de deuda', title: '¿Sabes cuál es la tasa más alta de tus deudas?', hint: 'Si no sabes, asumiremos que es alta para protegerte.', type: 'single', options: [
      { val: 'unknown', label: 'No sé' }, { val: 'lt10', label: 'Menos del 10% EA' }, { val: '10to20', label: 'Entre 10% y 20% EA' }, { val: 'gt20', label: 'Más del 20% EA' }
    ] },
    6: { key: 'P6', tag: '🏦 Ahorros', title: '¿Tienes plata guardada hoy que puedas usar si la necesitas?', hint: 'No importa cuánto, lo que sea que tengas guardado.', type: 'binary', yes: 'Sí, tengo algo guardado', no: 'No tengo nada guardado' },
    7: { key: 'P7', tag: '⏳ Fondo de emergencia', title: 'Si mañana dejaras de recibir ingresos, ¿cuánto tiempo aguantas con lo que tienes guardado?', hint: 'Con lo que tienes guardado hoy.', type: 'single', options: [
      { val: 'A', label: 'Menos de 1 mes' }, { val: 'B', label: 'Entre 1 y 3 meses' }, { val: 'C', label: 'Entre 3 y 6 meses' }, { val: 'D', label: 'Entre 6 meses y 1 año' }, { val: 'E', label: 'Más de 1 año' }
    ] },
    8: { key: 'P8', tag: '📊 Estabilidad', title: '¿Tu ingreso es más o menos el mismo cada mes o cambia?', hint: 'Piensa en los últimos 6 meses.', type: 'single', options: [
      { val: 'A', emoji: '🟢', label: 'Siempre me cae lo mismo, es fijo' }, { val: 'B', emoji: '🟡', label: 'Varía un poco pero más o menos sé cuánto es' }, { val: 'C', emoji: '🔴', label: 'Cambia bastante, nunca sé exactamente cuánto va a ser' }
    ] },
    9: { key: 'P9', tag: '👨‍👩‍👧 Dependientes', title: '¿Cuántas personas dependen económicamente de ti?', hint: 'Hijos, papás, pareja sin ingreso, lo que sea.', type: 'single', last: true, options: [
      { val: 'A', label: 'Nadie depende de mí' }, { val: 'B', label: '1 o 2 personas' }, { val: 'C', label: '3 o más personas' }
    ] }
  };

  // ── STATE ─────────────────────────────────────────────────────────────────
  var answers = {};
  var current = 'intro';
  var root, profile = null;

  function seq() {
    var s = [1, 2, 3, 4];
    if (answers.P4 !== 'no') { s.push(5); s.push(55); }
    s.push(6);
    if (answers.P6 !== 'no') s.push(7);
    s.push(8, 9);
    return s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmtInput(raw) { if (!raw) return ''; return parseInt(raw, 10).toLocaleString('es-CO'); }

  // ── RENDERERS ───────────────────────────────────────────────────────────────
  function optionRow(step, o, sel) {
    return '<button class="dg-opt' + (sel ? ' sel' : '') + '" data-step="' + step + '" data-val="' + o.val + '">' +
      '<span class="dg-check"></span>' + (o.emoji ? '<span class="dg-emoji">' + o.emoji + '</span>' : '') +
      '<span class="dg-lbl">' + esc(o.label) + '</span></button>';
  }

  function renderQuestion(step) {
    var q = Q[step];
    var a = answers, sel = a[q.key];
    var s = seq(), idx = s.indexOf(step), first = idx === 0;
    var html = '<div class="dg-card">';
    html += '<div class="dg-tag">' + esc(q.tag) + '</div>';
    html += '<h3 class="dg-q">' + esc(q.title) + '</h3>';
    if (q.hint) html += '<p class="dg-hint">' + esc(q.hint) + '</p>';

    // Maya moment (rendered if a message exists for this step)
    if (mayaMsg[step]) html += '<div class="dg-maya show"><div class="dg-maya-av">🦜</div><p>' + esc(mayaMsg[step]) + '</p></div>';

    if (q.type === 'binary') {
      html += '<div class="dg-binary">' +
        '<button class="dg-bin' + (sel === 'yes' ? ' yes' : '') + '" data-step="' + step + '" data-bin="yes"><span class="ic">✅</span>' + esc(q.yes) + '</button>' +
        '<button class="dg-bin' + (sel === 'no' ? ' no' : '') + '" data-step="' + step + '" data-bin="no"><span class="ic">❌</span>' + esc(q.no) + '</button>' +
        '</div>';
    } else {
      html += '<div class="dg-opts">';
      q.options.forEach(function (o) { html += optionRow(step, o, sel === o.val); });
      if (q.type === 'exact') {
        var active = sel === 'X';
        html += '<button class="dg-opt' + (active ? ' sel' : '') + '" data-step="' + step + '" data-val="X"><span class="dg-check"></span><span class="dg-emoji">✏️</span><span class="dg-lbl">Monto exacto</span></button>';
        html += '<div class="dg-exact" style="' + (active ? '' : 'display:none') + '"><span class="pfx">$</span><input type="text" inputmode="numeric" id="dg-exact-input" data-exact="' + q.exactKey + '" placeholder="' + q.placeholder + '" value="' + fmtInput(a[q.exactKey]) + '"></div>';
      }
      html += '</div>';
    }

    // Nav
    var nextDisabled = isStepIncomplete(step);
    html += '<div class="dg-nav' + (first ? ' solo' : '') + '">';
    if (!first) html += '<button class="dg-back" data-step="' + step + '">‹ Volver</button>';
    if (q.last) html += '<button class="dg-calc" data-calc' + (nextDisabled ? ' disabled' : '') + '>✦ Calcular puntaje</button>';
    else html += '<button class="dg-next" data-step="' + step + '"' + (nextDisabled ? ' disabled' : '') + '>Continuar ›</button>';
    html += '</div></div>';
    return html;
  }

  function isStepIncomplete(step) {
    var q = Q[step], v = answers[q.key];
    if (q.type === 'binary') return v === undefined;
    if (v === undefined) return true;
    if (q.type === 'exact' && v === 'X' && !answers[q.exactKey]) return true;
    return false;
  }

  function renderIntro() {
    var email = (profile && profile.email) || (window.PlaneaSB && PlaneaSB.user() && PlaneaSB.user().email) || '';
    return '<div class="dg-card"><div class="dg-tag">✉️ Antes de empezar</div>' +
      '<h3 class="dg-q">Descubre tu Puntaje</h3>' +
      '<p class="dg-hint">Diagnóstico inmediato. Sin pagos. Pilares evaluados con la metodología CFP Board.</p>' +
      '<div class="dg-opts" style="margin-top:18px"><input type="email" id="dg-email" placeholder="tucorreo@ejemplo.com" value="' + esc(email) + '" class="dg-email"></div>' +
      '<div class="dg-nav solo"><button class="dg-next" data-intro>Continuar ›</button></div></div>';
  }

  function renderCalculating() {
    var items = CALC_LABELS.map(function (l, i) { return '<div class="dg-calc-item" data-ci="' + i + '"><span class="dg-cdot"></span>' + esc(l) + '</div>'; }).join('');
    return '<div class="dg-card dg-calc-screen"><div class="dg-spinner"></div>' +
      '<div class="dg-calc-title">Calculando tu puntaje Planea</div>' +
      '<div class="dg-calc-sub">Analizando tus 4 pilares financieros…</div>' +
      '<div class="dg-calc-steps">' + items + '</div></div>';
  }

  function renderResult(res, rec) {
    var label = getScoreLabel(res.score);
    var C = 2 * Math.PI * 63;
    var pillars = [
      { icon: '🛡️', name: 'Fondo de Emergencia', w: '35%', v: res.p1 },
      { icon: '💸', name: 'Flujo de Caja', w: '25%', v: res.p2 },
      { icon: '💳', name: 'Salud de Deudas', w: '25%', v: res.p3 },
      { icon: '⚖️', name: 'Estabilidad', w: '15%', v: res.p4 }
    ];
    var prows = pillars.map(function (p) {
      return '<div class="dg-pilar"><span class="ic">' + p.icon + '</span>' +
        '<div class="body"><div class="cab"><span class="nm">' + p.name + ' <span class="w">· ' + p.w + '</span></span><span class="num" style="color:' + (p.v < 50 ? 'var(--red)' : 'var(--green)') + '">' + p.v + '</span></div>' +
        '<div class="track"><div class="fill" style="width:' + p.v + '%"></div></div></div></div>';
    }).join('');

    return '<div class="dg-card dg-result">' +
      '<div class="dg-res-tag">✦ TU PUNTAJE PLANEA</div>' +
      '<h3 class="dg-res-head">' + esc(LABEL_HEADLINE[label.name] || label.desc) + '</h3>' +
      '<div class="dg-ringwrap"><svg viewBox="0 0 156 156"><circle cx="78" cy="78" r="63" fill="none" stroke="var(--line)" stroke-width="11"/>' +
      '<circle id="dg-ring" cx="78" cy="78" r="63" fill="none" stroke="' + label.color + '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" transform="rotate(-90 78 78)"/></svg>' +
      '<div class="dg-res-num"><b id="dg-score">0</b><small>PUNTAJE</small></div></div>' +
      '<div class="dg-res-badge" style="border-color:' + label.color + ';color:' + label.color + '">' + label.name + '</div>' +
      '<div class="dg-res-sub">DESGLOSE POR PILARES</div>' +
      '<div class="dg-pilares">' + prows + '</div>' +
      '<div class="dg-rec"><div class="dg-rec-av">🦜</div><div><div class="dg-rec-goal">' + esc(rec.goalText) + '</div><p class="dg-rec-msg">' + esc(rec.mayaMessage) + '</p><div class="dg-rec-time">⏱ ' + esc(rec.timeline) + '</div></div></div>' +
      '<button class="dg-calc" id="dg-maya-btn">Ver recomendaciones con Maya</button>' +
      '<div class="dg-res-links"><a href="/planea/portal/inicio" id="dg-done">Ir a mi panel →</a><a href="#" id="dg-retake">Volver a empezar</a></div>' +
      (PlaneaSB.loggedIn() ? '<div class="dg-saved" id="dg-saved"></div>' : '<div class="dg-saved warn">Inicia sesión para guardar tu puntaje.</div>') +
      '</div>';
  }

  var mayaMsg = {};

  function paint() {
    if (current === 'intro') root.innerHTML = renderIntro();
    else if (typeof current === 'number') root.innerHTML = renderQuestion(current);
    // calculating / result handled by their own flows
    var inp = document.getElementById('dg-exact-input');
    if (inp) inp.focus();
  }

  function go(step) { current = step; paint(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  function next(from) {
    if (from === 'intro') { go(seq()[0]); return; }
    var s = seq(), i = s.indexOf(from);
    if (i < 0 || i === s.length - 1) return;
    go(s[i + 1]);
  }
  function back(from) {
    var s = seq(), i = s.indexOf(from);
    if (i <= 0) { if (i === 0) go('intro'); return; }
    go(s[i - 1]);
  }

  function selectOption(step, val) {
    var q = Q[step];
    answers[q.key] = val;
    // Maya moments
    if (step === 7 && (val === 'D' || val === 'E')) mayaMsg[7] = 'Eso te pone en el top 7% de Colombia. Serio. 🔥';
    paint();
  }
  function selectBinary(step, val) {
    var q = Q[step];
    answers[q.key] = val;
    if (step === 4) mayaMsg[4] = val === 'no' ? 'Sin deudas. Eso ya te pone por delante de la mayoría. Sigamos 💪' : 'Tranquilo, eso tiene solución. Vamos a entender bien la situación. 💪';
    if (step === 6) mayaMsg[6] = val === 'no' ? 'Tranquilo, para eso estamos aquí. Vamos a cambiar eso juntos. 🙌' : 'Perfecto. Vamos a ver qué tan sólido está ese colchón. 💰';
    paint();
  }

  function startCalc() {
    var res = computeScore(answers);
    root.innerHTML = renderCalculating();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    CALC_LABELS.forEach(function (_, i) {
      setTimeout(function () { var el = document.querySelector('[data-ci="' + i + '"]'); if (el) el.classList.add('done'); }, 450 + i * 520);
    });
    setTimeout(function () { showResult(res); }, 3400);
  }

  function showResult(res) {
    var name = profile ? profile.nombre : '';
    var rec = getRecommendation(answers, name);
    root.innerHTML = renderResult(res, rec);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // animate ring + count-up
    var C = 2 * Math.PI * 63;
    var ring = document.getElementById('dg-ring');
    setTimeout(function () { if (ring) ring.setAttribute('stroke-dashoffset', C - (res.score / 100) * C); }, 140);
    var numEl = document.getElementById('dg-score'), t0 = performance.now(), dur = 1400;
    (function tick(now) {
      var p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      if (numEl) numEl.textContent = Math.round(res.score * e);
      if (p < 1) requestAnimationFrame(tick);
    })(performance.now());

    persist(res, rec);
  }

  function persist(res, rec) {
    if (!window.PlaneaSB || !PlaneaSB.loggedIn()) return;
    var u = PlaneaSB.user(); if (!u) return;
    var entry = {
      timestamp: new Date().toISOString(),
      company: null,
      score: res.score,
      scenario: rec.scenario,
      source: 'survey',
      pillars: { emergency_fund: res.p1, cash_flow: res.p2, debt_health: res.p3, stability: res.p4 },
      answers: answers
    };
    PlaneaSB.patch('persons?user_id=eq.' + u.id, { score_data: entry })
      .then(function (rows) {
        var el = document.getElementById('dg-saved');
        if (el) el.textContent = 'Puntaje guardado en tu perfil ✓';
        // best-effort score history
        var pid = rows && rows[0] && rows[0].id;
        if (pid) PlaneaSB.post('persons_score_history', { person_id: pid, scored_at: entry.timestamp, score_data: entry }).catch(function () {});
      })
      .catch(function (e) {
        var el = document.getElementById('dg-saved');
        if (el) { el.textContent = 'No se pudo guardar el puntaje (revisa tu sesión).'; el.className = 'dg-saved warn'; }
        if (window.console) console.warn('[diagnostico] save failed', e && e.message);
      });
  }

  function retake() {
    answers = {}; mayaMsg = {}; current = 'intro'; paint();
  }

  // ── EVENTS (delegated) ──────────────────────────────────────────────────────
  function onClick(e) {
    var t = e.target.closest('button, a');
    if (!t) return;
    if (t.hasAttribute('data-intro')) { e.preventDefault(); var em = document.getElementById('dg-email'); if (em && em.value) { try { localStorage.setItem('planea-lead-email', em.value); } catch (x) {} } next('intro'); return; }
    if (t.classList.contains('dg-opt')) { e.preventDefault(); selectOption(+t.getAttribute('data-step'), t.getAttribute('data-val')); return; }
    if (t.classList.contains('dg-bin')) { e.preventDefault(); selectBinary(+t.getAttribute('data-step'), t.getAttribute('data-bin')); return; }
    if (t.classList.contains('dg-next')) { e.preventDefault(); if (!t.hasAttribute('disabled')) next(+t.getAttribute('data-step')); return; }
    if (t.classList.contains('dg-back')) { e.preventDefault(); back(+t.getAttribute('data-step')); return; }
    if (t.hasAttribute('data-calc')) { e.preventDefault(); if (!t.hasAttribute('disabled')) startCalc(); return; }
    if (t.id === 'dg-maya-btn') { e.preventDefault(); if (window.MayaChat) MayaChat.open(); else location.href = '/planea/portal/inicio'; return; }
    if (t.id === 'dg-retake') { e.preventDefault(); retake(); return; }
  }
  function onInput(e) {
    var t = e.target;
    if (t.id === 'dg-exact-input') {
      var raw = t.value.replace(/\D/g, '');
      answers[t.getAttribute('data-exact')] = raw;
      t.value = fmtInput(raw);
      // toggle nav enabled without full repaint
      var nav = t.closest('.dg-card').querySelector('.dg-next, .dg-calc');
      if (nav) { if (raw) nav.removeAttribute('disabled'); else nav.setAttribute('disabled', ''); }
    }
  }

  function boot() {
    root = document.getElementById('dg-root');
    if (!root) return;
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    // pull the profile (name/email) if logged in, then paint
    function start() { paint(); }
    if (window.PlaneaSB && PlaneaSB.loggedIn()) {
      PlaneaSB.get('persons?select=full_name&limit=1').then(function (rows) {
        var pr = (rows && rows[0]) || {};
        var full = pr.full_name || (PlaneaSB.user() && PlaneaSB.user().user_metadata && PlaneaSB.user().user_metadata.full_name) || '';
        profile = { nombre: (full || '').trim().split(/\s+/)[0] || '', email: (PlaneaSB.user() && PlaneaSB.user().email) || '' };
        start();
      }).catch(start);
    } else { start(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
