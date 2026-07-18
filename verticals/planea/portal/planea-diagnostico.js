/* PLANEA — Diagnóstico / Puntaje (June 2026 spec: Planea_Survey_Tecnico).
   8-question survey (P1–P8, objetivo P0 and tasa-de-deuda REMOVED) → animated calc
   → result with 4-pillar breakdown + Maya insight (CFP-pyramid decision tree) and an
   AUTO-GENERATED first meta (fondo de emergencia) created before any user interaction.

   Formulas per spec:
   - Pilar 1 Fondo Emergencia (35%): meta_meses = 3 si ingreso fijo, 6 si variable;
     pilar_1 = min(100, meses_cobertura/meta_meses*100); sin ahorro → 0.
   - Pilar 2 Flujo (25%): margen<=0→0, >=20%→100, else margen/0.20*100.
   - Pilar 3 Deuda (25%): sin deuda→100; DTI>=36%→0; else (1-DTI/0.36)*100.
   - Pilar 4 Estabilidad (15%): fijo→100, varía→65, cambia→35. Dependientes NO penalizan
     el score — sólo agrandan la meta del colchón (×1 / ×1.2 / ×1.5).
   Writes persons.score_data {score, scenario, pillars, answers} (read by dashboard+Maya). */
(function () {
  'use strict';

  // ── MID-POINT MAPS (spec §2) ────────────────────────────────────────────────
  var INC_MAP = { A: 1200000, B: 2250000, C: 4000000, D: 6500000, E: 9000000 };
  var EXP_MAP = { A: 1200000, B: 2250000, C: 4000000, D: 6500000, E: 9000000 };
  var CUOTA_MAP = { A: 200000, B: 500000, C: 1100000, D: 2250000, E: 3500000 };
  var MESES_MAP = { A: 0.5, B: 2, C: 4.5, D: 9, E: 12 }; // "cuánto tiempo aguantas"
  var DEP_FACTOR = { A: 1, B: 1.2, C: 1.5 }; // nadie / 1-2 / 3+

  function exactOr(exactKey, map, rangeVal, a, def) {
    if (rangeVal === 'X') return Math.max(0, parseInt(a[exactKey] || '0', 10) || def);
    return map[rangeVal || ''] != null ? map[rangeVal || ''] : def;
  }
  function isFijo(a) { return a.P7 === 'A'; }
  function metaMeses(a) { return isFijo(a) ? 3 : 6; }
  function mesesCobertura(a) { return a.P5 === 'no' ? 0 : (MESES_MAP[a.P6] != null ? MESES_MAP[a.P6] : 0); }

  function computeScore(a) {
    var inc = exactOr('P1_exact', INC_MAP, a.P1, a, 4000000);
    var exp = exactOr('P2_exact', EXP_MAP, a.P2, a, 3200000);

    // Pilar 1 — Fondo de Emergencia (35%)
    var p1;
    if (a.P5 === 'no') p1 = 0;
    else { var mm = metaMeses(a), mc = mesesCobertura(a); p1 = Math.min(100, (mc / mm) * 100); }

    // Pilar 2 — Flujo de Caja (25%)
    var margen = inc > 0 ? (inc - exp) / inc : 0;
    var p2 = margen <= 0 ? 0 : margen >= 0.20 ? 100 : (margen / 0.20) * 100;

    // Pilar 3 — Salud de Deuda (25%)
    var p3;
    if (a.P3 === 'no') p3 = 100;
    else {
      var cuotas = exactOr('P4_exact', CUOTA_MAP, a.P4, a, 500000);
      var dti = inc > 0 ? cuotas / inc : 1;
      p3 = dti <= 0 ? 100 : dti >= 0.36 ? 0 : (1 - (dti / 0.36)) * 100;
    }

    // Pilar 4 — Estabilidad (15%) — dependientes NO penalizan
    var p4 = a.P7 === 'A' ? 100 : a.P7 === 'B' ? 65 : 35;

    p1 = Math.round(p1); p2 = Math.round(p2); p3 = Math.round(p3); p4 = Math.round(p4);
    var score = Math.round(p1 * 0.35 + p2 * 0.25 + p3 * 0.25 + p4 * 0.15);
    return { score: score, p1: p1, p2: p2, p3: p3, p4: p4 };
  }

  function getScoreLabel(score) {
    if (score >= 86) return { name: 'Planeado',        color: '#4B7F52' };
    if (score >= 71) return { name: 'Sólido',          color: '#5e9520' };
    if (score >= 51) return { name: 'En camino',       color: '#46516E' };
    if (score >= 31) return { name: 'Construyendo',    color: '#b8860b' };
    return              { name: 'Punto de partida', color: '#c0392b' };
  }
  var LABEL_HEADLINE = {
    'Planeado': 'Estás donde muy pocos llegan. A mantenerlo.',
    'Sólido': 'Estás donde el 20% de colombianos quisiera estar.',
    'En camino': 'Tienes bases sólidas. Ahora es acelerar.',
    'Construyendo': 'Estás en movimiento. Eso ya es más que la mayoría.',
    'Punto de partida': 'El primer paso es saber dónde estás. Ya lo diste.'
  };

  function formatCOP(n) {
    var r = Math.round(n / 1000) * 1000;
    if (r >= 1000000) { var m = r / 1000000; return '$' + (m % 1 === 0 ? m : m.toFixed(1)) + 'M'; }
    return '$' + Math.max(0, r).toLocaleString('es-CO');
  }

  // Emergency-fund target (spec §4 meta_colchon): meta_meses × gasto × factor dependientes
  function fundTarget(a) {
    var exp = exactOr('P2_exact', EXP_MAP, a.P2, a, 3200000);
    var factor = DEP_FACTOR[a.P8] != null ? DEP_FACTOR[a.P8] : 1;
    return Math.round(metaMeses(a) * exp * factor);
  }

  // ── MAYA INSIGHT — CFP-pyramid decision tree (spec §5), no objetivo ─────────
  function getRecommendation(a, name) {
    var inc = exactOr('P1_exact', INC_MAP, a.P1, a, 4000000);
    var exp = exactOr('P2_exact', EXP_MAP, a.P2, a, 3200000);
    var cuotas = a.P3 === 'yes' ? exactOr('P4_exact', CUOTA_MAP, a.P4, a, 500000) : 0;
    var nombre = name || 'amigo/a';
    var margen = inc > 0 ? (inc - exp) / inc : 0;
    var margenLibre = inc - exp - cuotas;

    // PASO 1 — Flujo de caja
    if (margen < 0) {
      var dif = Math.abs(inc - exp);
      return { scenario: 'A',
        goalText: 'Reducir gastos en ' + formatCOP(dif) + ' para no seguir endeudándote cada mes.',
        mayaMessage: nombre + ', cada mes estás gastando más de lo que ganas. Eso hace que tu deuda crezca sola aunque no uses las tarjetas. Lo primero que vamos a hacer juntos es cerrar ese hueco. Esta semana revisemos en qué se va la plata.',
        timeline: '30 días para identificar y reducir gastos variables.' };
    }
    if (margen <= 0.10) {
      var mB = Math.ceil(500000 / Math.max(1, inc - exp));
      return { scenario: 'B',
        goalText: 'Ahorra $500.000 como colchón mínimo antes de atacar cualquier otra cosa.',
        mayaMessage: 'Tu flujo de caja está muy ajustado: tienes poco margen y eso es riesgoso. Primero construyamos un colchón mínimo de $500.000 para amortiguar cualquier imprevisto. ¿Cuánto puedes separar esta quincena?',
        timeline: mB + (mB === 1 ? ' mes' : ' meses') + ' para lograrlo.' };
    }

    // PASO 2 — Deuda
    if (a.P3 === 'yes') {
      var dti = inc > 0 ? cuotas / inc : 0;
      if (dti > 0.20) {
        var extra = Math.round(cuotas * 0.10);
        return { scenario: 'C',
          goalText: 'Paga ' + formatCOP(extra) + ' adicionales al mes a tu deuda más cara.',
          mayaMessage: nombre + ', tus cuotas ya se llevan más del 20% de tus ingresos. Esa deuda te cuesta más de lo que cualquier inversión te daría. Lo más inteligente ahora es atacarla: cuando la reduzcas, esa plata queda libre para lo que tú quieras. ¿Arrancamos?',
          timeline: 'Calculado según tu saldo y pago adicional.' };
      }
      var pd = Math.max(0, Math.round(margenLibre * 0.50)), af = Math.max(0, Math.round(margenLibre * 0.50));
      return { scenario: 'D',
        goalText: 'Divide tu margen: ' + formatCOP(pd) + ' a tu deuda y ' + formatCOP(af) + ' a tu fondo de emergencia.',
        mayaMessage: 'Tu deuda está bajo control. Divide tu margen en dos: la mitad para pagar más de tu cuota y la otra mitad para empezar tu fondo de emergencia. Así avanzas en los dos frentes al tiempo.',
        timeline: 'Mensual, según tu margen disponible.' };
    }

    // PASO 3 — Fondo de emergencia (sin deuda)
    var meses = mesesCobertura(a);
    if (meses === 0) {
      var sem = Math.round(exp / 4);
      return { scenario: 'E',
        goalText: 'Ahorra ' + formatCOP(sem) + ' esta semana — en 4 semanas tienes tu primer mes de respaldo.',
        mayaMessage: 'No tienes ahorro guardado, así que cualquier imprevisto te puede empujar a endeudarte. Esta semana separa ' + formatCOP(sem) + ' antes de gastar. No es para invertir ni pagar deuda: es tu escudo.',
        timeline: '4 semanas para tu primer mes de fondo.' };
    }
    if (meses < 1) {
      var falt = Math.round(exp - meses * exp), mF = Math.ceil(falt / Math.max(1, margenLibre));
      return { scenario: 'F',
        goalText: 'Llegar a 1 mes de fondo — te faltan ' + formatCOP(falt) + '.',
        mayaMessage: 'Ya tienes algo guardado, pero con menos de un mes de cobertura aún estás expuesto. Lleguemos primero a 1 mes de gastos. Estás a ' + formatCOP(falt) + ' de lograrlo. ¿Vamos?',
        timeline: mF + (mF === 1 ? ' mes' : ' meses') + ' para lograrlo.' };
    }
    if (meses < 3) {
      var target = fundTarget(a), falt2 = Math.round(target - meses * exp), mG = Math.ceil(falt2 / Math.max(1, margenLibre));
      return { scenario: 'G',
        goalText: 'Completa tu fondo de emergencia — te faltan ' + formatCOP(Math.max(0, falt2)) + '.',
        mayaMessage: 'Vas muy bien: ya tienes ' + (meses % 1 === 0 ? meses : meses.toFixed(1)) + ' meses de fondo. El estándar del CFP para tu caso es llegar a ' + metaMeses(a) + ' meses. Con lo que te queda cada mes lo completas en ' + mG + (mG === 1 ? ' mes' : ' meses') + '.',
        timeline: mG + (mG === 1 ? ' mes' : ' meses') + ' para completar el fondo.' };
    }

    // PASO 4 — Usuario sólido, sin deuda → invertir
    var invMonto = Math.round(inc * 0.20);
    return { scenario: 'I',
      goalText: 'Invierte al menos el 20% de tus ingresos — ' + formatCOP(invMonto) + ' cada mes.',
      mayaMessage: nombre + ', estás en una posición sólida: sin deuda cara y con tu fondo de emergencia listo. Ahora tu plata puede trabajar para ti. Voy a mostrarte opciones de inversión que se ajustan a tu perfil, sin comisiones escondidas.',
      timeline: 'Mensual.' };
  }

  // ── QUESTION MODEL (spec §1) ────────────────────────────────────────────────
  var CALC_LABELS = ['Midiendo tu flujo de caja', 'Analizando tu salud de deuda', 'Evaluando tu fondo de emergencia', 'Calculando tu estabilidad', 'Construyendo tu perfil financiero'];

  var Q = {
    1: { key: 'P1', tag: '💰 Ingresos', title: '¿Cuánto son tus ingresos al mes?', hint: 'Suma todo: sueldo, freelance, rentas, lo que sea.', type: 'exact', exactKey: 'P1_exact', placeholder: '3.500.000', options: [
      { val: 'A', label: 'Menos de $1.500.000' }, { val: 'B', label: 'Entre $1.500.000 y $3.000.000' }, { val: 'C', label: 'Entre $3.000.000 y $5.000.000' }, { val: 'D', label: 'Entre $5.000.000 y $8.000.000' }, { val: 'E', label: 'Más de $8.000.000' }
    ] },
    2: { key: 'P2', tag: '🧾 Gastos', title: '¿Cuánto gastas al mes en total?', hint: 'Arriendo, comida, transporte, entretenimiento, todo.', type: 'exact', exactKey: 'P2_exact', placeholder: '2.800.000', options: [
      { val: 'A', label: 'Menos de $1.500.000' }, { val: 'B', label: 'Entre $1.500.000 y $3.000.000' }, { val: 'C', label: 'Entre $3.000.000 y $5.000.000' }, { val: 'D', label: 'Entre $5.000.000 y $8.000.000' }, { val: 'E', label: 'Más de $8.000.000' }
    ] },
    3: { key: 'P3', tag: '⚡ Deudas', title: '¿Tienes deudas activas en este momento?', hint: 'Tarjeta, crédito, cuotas, lo que sea.', type: 'binary', yes: 'Sí, tengo deudas', no: 'No tengo deudas' },
    4: { key: 'P4', tag: '📆 Cuotas', title: '¿Cuánto pagas al mes en cuotas sumando todas tus deudas?', hint: 'Todos los pagos fijos de deuda juntos.', type: 'exact', exactKey: 'P4_exact', placeholder: '800.000', options: [
      { val: 'A', label: 'Menos de $300.000' }, { val: 'B', label: 'Entre $300.000 y $700.000' }, { val: 'C', label: 'Entre $700.000 y $1.500.000' }, { val: 'D', label: 'Entre $1.500.000 y $3.000.000' }, { val: 'E', label: 'Más de $3.000.000' }
    ] },
    5: { key: 'P5', tag: '🏦 Ahorros', title: '¿Tienes plata guardada hoy que puedas usar si la necesitas?', hint: 'No importa cuánto, lo que sea que tengas guardado.', type: 'binary', yes: 'Sí, tengo algo guardado', no: 'No tengo nada guardado' },
    6: { key: 'P6', tag: '⏳ Fondo de emergencia', title: 'Si mañana dejaras de recibir ingresos, ¿cuánto tiempo aguantas con lo que tienes guardado?', hint: 'Con lo que tienes guardado hoy.', type: 'single', options: [
      { val: 'A', label: 'Menos de 1 mes' }, { val: 'B', label: 'Entre 1 y 3 meses' }, { val: 'C', label: 'Entre 3 y 6 meses' }, { val: 'D', label: 'Entre 6 meses y 1 año' }, { val: 'E', label: 'Más de 1 año' }
    ] },
    7: { key: 'P7', tag: '📊 Estabilidad', title: '¿Tu ingreso es más o menos el mismo cada mes o cambia?', hint: 'Piensa en los últimos 6 meses.', type: 'single', options: [
      { val: 'A', emoji: '🟢', label: 'Siempre me cae lo mismo, es fijo' }, { val: 'B', emoji: '🟡', label: 'Varía un poco pero más o menos sé cuánto es' }, { val: 'C', emoji: '🔴', label: 'Cambia bastante, nunca sé exactamente cuánto va a ser' }
    ] },
    8: { key: 'P8', tag: '👨‍👩‍👧 Dependientes', title: '¿Cuántas personas dependen económicamente de ti?', hint: 'Esto no baja tu puntaje — nos ayuda a ajustar el tamaño de tu fondo de emergencia.', type: 'single', last: true, options: [
      { val: 'A', label: 'Nadie depende de mí' }, { val: 'B', label: '1 o 2 personas' }, { val: 'C', label: '3 o más personas' }
    ] }
  };

  // ── STATE ───────────────────────────────────────────────────────────────────
  var answers = {}, current = 'intro', root, profile = null, mayaMsg = {};

  function seq() {
    var s = [1, 2, 3];
    if (answers.P3 !== 'no') s.push(4);
    s.push(5);
    if (answers.P5 !== 'no') s.push(6);
    s.push(7, 8);
    return s;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmtInput(raw) { if (!raw) return ''; return parseInt(raw, 10).toLocaleString('es-CO'); }

  function renderQuestion(step) {
    var q = Q[step], a = answers, sel = a[q.key];
    var s = seq(), idx = s.indexOf(step), first = idx === 0;
    var html = '<div class="dg-card"><div class="dg-tag">' + esc(q.tag) + '</div>';
    html += '<h3 class="dg-q">' + esc(q.title) + '</h3>';
    if (q.hint) html += '<p class="dg-hint">' + esc(q.hint) + '</p>';
    if (mayaMsg[step]) html += '<div class="dg-maya show"><div class="dg-maya-av">🦜</div><p>' + esc(mayaMsg[step]) + '</p></div>';

    if (q.type === 'binary') {
      html += '<div class="dg-binary">' +
        '<button class="dg-bin' + (sel === 'yes' ? ' yes' : '') + '" data-step="' + step + '" data-bin="yes"><span class="ic">✅</span>' + esc(q.yes) + '</button>' +
        '<button class="dg-bin' + (sel === 'no' ? ' no' : '') + '" data-step="' + step + '" data-bin="no"><span class="ic">❌</span>' + esc(q.no) + '</button></div>';
    } else {
      html += '<div class="dg-opts">';
      q.options.forEach(function (o) {
        html += '<button class="dg-opt' + (sel === o.val ? ' sel' : '') + '" data-step="' + step + '" data-val="' + o.val + '">' +
          '<span class="dg-check"></span>' + (o.emoji ? '<span class="dg-emoji">' + o.emoji + '</span>' : '') +
          '<span class="dg-lbl">' + esc(o.label) + '</span></button>';
      });
      if (q.type === 'exact') {
        var active = sel === 'X';
        html += '<button class="dg-opt' + (active ? ' sel' : '') + '" data-step="' + step + '" data-val="X"><span class="dg-check"></span><span class="dg-emoji">✏️</span><span class="dg-lbl">Monto exacto</span></button>';
        html += '<div class="dg-exact" style="' + (active ? '' : 'display:none') + '"><span class="pfx">$</span><input type="text" inputmode="numeric" id="dg-exact-input" data-exact="' + q.exactKey + '" placeholder="' + q.placeholder + '" value="' + fmtInput(a[q.exactKey]) + '"></div>';
      }
      html += '</div>';
    }

    var disabled = isStepIncomplete(step);
    html += '<div class="dg-nav' + (first ? ' solo' : '') + '">';
    if (!first) html += '<button class="dg-back" data-step="' + step + '">‹ Volver</button>';
    if (q.last) html += '<button class="dg-calc" data-calc' + (disabled ? ' disabled' : '') + '>✦ Calcular puntaje</button>';
    else html += '<button class="dg-next" data-step="' + step + '"' + (disabled ? ' disabled' : '') + '>Continuar ›</button>';
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
      '<p class="dg-hint">Diagnóstico inmediato. Sin pagos. 8 preguntas, dos minutos. Pilares evaluados con la metodología CFP Board.</p>' +
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
    var label = getScoreLabel(res.score), C = 2 * Math.PI * 63;
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
      '<h3 class="dg-res-head">' + esc(LABEL_HEADLINE[label.name] || '') + '</h3>' +
      '<div class="dg-ringwrap"><svg viewBox="0 0 156 156"><circle cx="78" cy="78" r="63" fill="none" stroke="var(--line)" stroke-width="11"/>' +
      '<circle id="dg-ring" cx="78" cy="78" r="63" fill="none" stroke="' + label.color + '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" transform="rotate(-90 78 78)"/></svg>' +
      '<div class="dg-res-num"><b id="dg-score">0</b><small>PUNTAJE</small></div></div>' +
      '<div class="dg-res-badge" style="border-color:' + label.color + ';color:' + label.color + '">' + label.name + '</div>' +
      '<div class="dg-res-sub">DESGLOSE POR PILARES</div><div class="dg-pilares">' + prows + '</div>' +
      '<div class="dg-rec"><div class="dg-rec-av">🦜</div><div><div class="dg-rec-goal">' + esc(rec.goalText) + '</div><p class="dg-rec-msg">' + esc(rec.mayaMessage) + '</p><div class="dg-rec-time">⏱ ' + esc(rec.timeline) + '</div></div></div>' +
      '<button class="dg-calc" id="dg-maya-btn">Ver recomendaciones con Maya</button>' +
      '<div class="dg-res-links"><a href="/planea/portal/inicio" id="dg-done">Ir a mi panel →</a><a href="#" id="dg-retake">Volver a empezar</a></div>' +
      (PlaneaSB.loggedIn() ? '<div class="dg-saved" id="dg-saved"></div>' : '<div class="dg-saved warn">Inicia sesión para guardar tu puntaje.</div>') +
      '</div>';
  }

  function paint() {
    if (current === 'intro') root.innerHTML = renderIntro();
    else if (typeof current === 'number') root.innerHTML = renderQuestion(current);
    var inp = document.getElementById('dg-exact-input'); if (inp) inp.focus();
  }
  function go(step) { current = step; paint(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function next(from) {
    if (from === 'intro') { go(seq()[0]); return; }
    var s = seq(), i = s.indexOf(from);
    if (i < 0 || i === s.length - 1) return; go(s[i + 1]);
  }
  function back(from) {
    var s = seq(), i = s.indexOf(from);
    if (i === 0) { go('intro'); return; }
    if (i > 0) go(s[i - 1]);
  }

  function selectOption(step, val) { answers[Q[step].key] = val; paint(); }
  function selectBinary(step, val) {
    answers[Q[step].key] = val;
    if (step === 3) mayaMsg[3] = val === 'no' ? 'Sin deudas. Eso ya te pone por delante de la mayoría. Sigamos 💪' : 'Tranquilo, eso tiene solución. Vamos a entender bien la situación. 💪';
    if (step === 5) mayaMsg[5] = val === 'no' ? 'Tranquilo, para eso estamos aquí. Vamos a cambiar eso juntos. 🙌' : 'Perfecto. Vamos a ver qué tan sólido está ese colchón. 💰';
    paint();
  }

  function startCalc() {
    var res = computeScore(answers);
    root.innerHTML = renderCalculating();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    CALC_LABELS.forEach(function (_, i) { setTimeout(function () { var el = document.querySelector('[data-ci="' + i + '"]'); if (el) el.classList.add('done'); }, 450 + i * 520); });
    setTimeout(function () { showResult(res); }, 3400);
  }

  function showResult(res) {
    var rec = getRecommendation(answers, profile ? profile.nombre : '');
    root.innerHTML = renderResult(res, rec);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    var C = 2 * Math.PI * 63, ring = document.getElementById('dg-ring');
    setTimeout(function () { if (ring) ring.setAttribute('stroke-dashoffset', C - (res.score / 100) * C); }, 140);
    var numEl = document.getElementById('dg-score'), t0 = performance.now(), dur = 1400;
    (function tick(now) { var p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3); if (numEl) numEl.textContent = Math.round(res.score * e); if (p < 1) requestAnimationFrame(tick); })(performance.now());
    persist(res, rec);
  }

  function persist(res, rec) {
    if (!window.PlaneaSB || !PlaneaSB.loggedIn()) return;
    var u = PlaneaSB.user(); if (!u) return;
    var entry = {
      timestamp: new Date().toISOString(), company: null, score: res.score, scenario: rec.scenario, source: 'survey',
      pillars: { emergency_fund: res.p1, cash_flow: res.p2, debt_health: res.p3, stability: res.p4 },
      // The first insight Planea generates before any user interaction (spec §5).
      recommendation: { scenario: rec.scenario, goalText: rec.goalText, mayaMessage: rec.mayaMessage, timeline: rec.timeline },
      answers: answers
    };
    PlaneaSB.patch('persons?user_id=eq.' + u.id, { score_data: entry })
      .then(function (rows) {
        var el = document.getElementById('dg-saved'); if (el) el.textContent = 'Puntaje guardado en tu perfil ✓';
        var pid = (rows && rows[0] && rows[0].id) || u.id;
        PlaneaSB.post('persons_score_history', { person_id: pid, scored_at: entry.timestamp, score_data: entry }).catch(function () {});
        autoCreateFirstMeta(pid, rec, res); // the "primera meta" generated before any interaction
        // Onboarding complete → unlock the rest of the nav.
        try { localStorage.setItem('planea-onboarded', '1'); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent('planea:onboarded')); } catch (e) {}
      })
      .catch(function (e) {
        var el = document.getElementById('dg-saved'); if (el) { el.textContent = 'No se pudo guardar el puntaje (revisa tu sesión).'; el.className = 'dg-saved warn'; }
        if (window.console) console.warn('[diagnostico] save failed', e && e.message);
      });
  }

  // The scenario-driven "primera meta" (spec §5 "Meta que aparece en la app").
  // Fund scenarios (B,D,E,F,G) create a real Fondo de emergencia goal with computed
  // amounts; action scenarios (A,C,H,I) carry their meta in score_data.recommendation
  // (surfaced on the dashboard) rather than a misleading savings goal.
  function firstMeta(rec) {
    var exp = exactOr('P2_exact', EXP_MAP, answers.P2, answers, 3200000);
    var inc = exactOr('P1_exact', INC_MAP, answers.P1, answers, 4000000);
    var cuotas = answers.P3 === 'yes' ? exactOr('P4_exact', CUOTA_MAP, answers.P4, answers, 500000) : 0;
    var margenLibre = Math.max(0, inc - exp - cuotas);
    var current = Math.round(mesesCobertura(answers) * exp);
    switch (rec.scenario) {
      case 'B': return { name: 'Colchón mínimo de emergencia', type: 'emergency', target_amount: 500000, current_savings: 0, monthly_saving: Math.max(0, inc - exp) };
      case 'E': return { name: 'Fondo de emergencia', type: 'emergency', target_amount: Math.round(exp), current_savings: 0, monthly_saving: Math.round(exp) };
      case 'F': return { name: 'Fondo de emergencia', type: 'emergency', target_amount: Math.round(exp), current_savings: current, monthly_saving: margenLibre };
      case 'G': return { name: 'Fondo de emergencia', type: 'emergency', target_amount: fundTarget(answers), current_savings: current, monthly_saving: margenLibre };
      case 'D': return { name: 'Fondo de emergencia', type: 'emergency', target_amount: fundTarget(answers), current_savings: current, monthly_saving: Math.round(margenLibre * 0.5) };
      default: return null; // A, C, H, I → insight only (no fund goal)
    }
  }
  function autoCreateFirstMeta(personId, rec, res) {
    var meta = firstMeta(rec);
    if (!meta) return;
    PlaneaSB.get('persons_long_term_goals?person_id=eq.' + personId + '&select=id,name')
      .then(function (rows) {
        var has = (rows || []).some(function (g) { return /emergen|colch/i.test(g.name || ''); });
        if (has) return;
        meta.person_id = personId;
        return PlaneaSB.post('persons_long_term_goals', meta);
      }).catch(function () {});
  }

  function retake() { answers = {}; mayaMsg = {}; current = 'intro'; paint(); }

  function onClick(e) {
    var t = e.target.closest('button, a'); if (!t) return;
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
      answers[t.getAttribute('data-exact')] = raw; t.value = fmtInput(raw);
      var nav = t.closest('.dg-card').querySelector('.dg-next, .dg-calc');
      if (nav) { if (raw) nav.removeAttribute('disabled'); else nav.setAttribute('disabled', ''); }
    }
  }

  // Read our session identity straight from the readable cookie (no network).
  function readOurUser() {
    try { var m = (document.cookie || '').match(/(?:^|;\s*)planea_user=([^;]+)/); return m ? JSON.parse(decodeURIComponent(m[1])) : null; }
    catch (e) { return null; }
  }

  function boot() {
    root = document.getElementById('dg-root'); if (!root) return;
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);

    var ou = readOurUser();
    var onboarding = /[?&]onboarding=1/.test(location.search);
    function hasSbSession() { try { for (var i = 0; i < localStorage.length; i++) { if (/^sb-.*-auth-token$/.test(localStorage.key(i))) return true; } } catch (e) {} return false; }
    // Logged in via ANY signal (our cookie, PlaneaSB, or a legacy Supabase token).
    var loggedIn = (window.PlaneaSB && PlaneaSB.loggedIn()) || !!ou || hasSbSession();
    // We already know who they are — never ask for the email again.
    if (ou) profile = { nombre: (ou.full_name || '').trim().split(/\s+/)[0] || '', email: ou.email || '' };

    function start() {
      // Logged-in / onboarding users gave name+email at signup → skip the intro
      // email step entirely and start at question 1.
      if (loggedIn || onboarding) current = seq()[0];
      paint();
    }

    // Enrich the name from the backend profile if possible (non-blocking).
    if (window.PlaneaSB && PlaneaSB.loggedIn()) {
      PlaneaSB.get('persons?select=full_name&limit=1').then(function (rows) {
        var pr = (rows && rows[0]) || {};
        var full = pr.full_name || (ou && ou.full_name) || '';
        profile = { nombre: (full || '').trim().split(/\s+/)[0] || '', email: (ou && ou.email) || (PlaneaSB.user() && PlaneaSB.user().email) || '' };
        start();
      }).catch(start);
    } else { start(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
