/* PLANEA — Onboarding / Planea Score (MVP spec: "Onboarding, Planea Score e Insight de Maya").
   9 preguntas fijas (P1–P9, NUNCA se salta ninguna) -> cálculo por el motor
   planea-score-engine.js -> pantalla de resultado con el NÚMERO + rango + insight de textos
   LITERALES + CTA. NO se muestra el desglose por pilar, ni montos, ni %, ni meses.

   ES UN SOLO Planea Score: el cuestionario es el PUNTO DE PARTIDA; se refina luego con los
   datos reales que Maya ayuda a registrar (unified-score.cjs). Se guarda histórico del score
   (score_data.history) para la barra de progreso del tab "Planea Score".

   Compat de persistencia: score_data conserva {score, survey_score, rango, pillars:
   {emergency_fund,cash_flow,debt_health,stability}, answers} que leen unified-score.cjs,
   maya-chat.js y planea-data.js. */
(function () {
  'use strict';
  var E = window.PlaneaScoreEngine;

  // ── MODELO DE PREGUNTAS (§2.1) — orden fijo, sin saltos ──────────────────────
  var Q = {
    1: { key: 'ocupacion', tag: 'Ocupación', title: '¿A qué te dedicas hoy?', type: 'single', options: [
      { val: 'empleado', label: 'Empleado con contrato' },
      { val: 'publico', label: 'Servidor público' },
      { val: 'independiente', label: 'Independiente o por prestación de servicios' },
      { val: 'negocio', label: 'Dueño de negocio o empresario' },
      { val: 'pensionado', label: 'Pensionado' },
      { val: 'rentista', label: 'Rentista o inversionista' } ] },
    2: { key: 'rango_ingresos', tag: 'Ingresos', title: '¿Cuánto recibes al mes en total?', hint: 'Suma todo: sueldo, rebusque, arriendos, lo que sea.', type: 'exact', exactKey: 'monto_ingresos', placeholder: '3.500.000', options: [
      { val: 'i1', label: 'Menos de $1.500.000' }, { val: 'i2', label: 'Entre $1.500.000 y $3.000.000' }, { val: 'i3', label: 'Entre $3.000.000 y $5.000.000' }, { val: 'i4', label: 'Entre $5.000.000 y $8.000.000' }, { val: 'i5', label: 'Más de $8.000.000' } ] },
    3: { key: 'rango_gastos', tag: 'Gastos', title: '¿Cuánto se te va al mes en total?', hint: 'Arriendo, mercado, transporte, entretenimiento, todo.', type: 'exact', exactKey: 'monto_gastos', placeholder: '2.800.000', options: [
      { val: 'g1', label: 'Menos de $1.500.000' }, { val: 'g2', label: 'Entre $1.500.000 y $2.500.000' }, { val: 'g3', label: 'Entre $2.500.000 y $4.000.000' }, { val: 'g4', label: 'Entre $4.000.000 y $6.500.000' }, { val: 'g5', label: 'Más de $6.500.000' } ] },
    4: { key: 'tipos_deuda', tag: 'Deudas', title: '¿Qué tipo de deudas tienes hoy?', hint: 'Selecciona todas las que apliquen.', type: 'multi', exclusive: 'ninguna', exactKey: 'monto_deuda_total', exactLabel: 'Si sabes cuánto debes en total, escríbelo (opcional)', placeholder: '12.000.000', options: [
      { val: 'tarjeta', label: 'Tarjeta de crédito' }, { val: 'personal', label: 'Préstamo personal o de libre inversión' }, { val: 'hipotecario', label: 'Crédito hipotecario' }, { val: 'vehiculo', label: 'Crédito de vehículo' }, { val: 'educativo', label: 'Crédito educativo' }, { val: 'compras', label: 'Compras a cuotas o financiadas' }, { val: 'familiares', label: 'Deuda con familiares o particulares' }, { val: 'ninguna', label: 'No tengo deudas' } ] },
    5: { key: 'rango_cuotas', tag: 'Cuotas', title: '¿Cuánto pagas al mes en cuotas sumando todas tus deudas?', type: 'exact', exactKey: 'monto_cuotas', placeholder: '800.000', options: [
      { val: 'nopago', label: 'No pago cuotas' }, { val: 'c1', label: 'Menos de $300.000' }, { val: 'c2', label: 'Entre $300.000 y $700.000' }, { val: 'c3', label: 'Entre $700.000 y $1.500.000' }, { val: 'c4', label: 'Entre $1.500.000 y $3.000.000' }, { val: 'c5', label: 'Más de $3.000.000' } ] },
    6: { key: 'cobertura', tag: 'Fondo de emergencia', title: 'Si dejaras de recibir ingresos, ¿cuánto tiempo aguantas con lo que tienes guardado?', type: 'single', options: [
      { val: 'nada', label: 'No tengo nada guardado' }, { val: 'm1', label: 'Menos de 1 mes' }, { val: 'm1_3', label: 'Entre 1 y 3 meses' }, { val: 'm3_6', label: 'Entre 3 y 6 meses' }, { val: 'm6_12', label: 'Entre 6 meses y 1 año' }, { val: 'm12plus', label: 'Más de 1 año' } ] },
    7: { key: 'estabilidad_ingreso', tag: 'Estabilidad', title: '¿Tu ingreso es más o menos el mismo cada mes o cambia?', type: 'single', options: [
      { val: 'fijo', label: 'Siempre me cae lo mismo, es fijo' }, { val: 'varia', label: 'Varía un poco pero más o menos sé cuánto es' }, { val: 'cambia', label: 'Cambia bastante, nunca sé exactamente cuánto va a ser' } ] },
    8: { key: 'numero_dependientes', tag: 'Dependientes', title: '¿Cuántas personas dependen económicamente de ti?', type: 'single', options: [
      { val: 'nadie', label: 'Nadie depende de mí' }, { val: 'd1_2', label: '1 o 2 personas' }, { val: 'd3plus', label: '3 o más personas' } ] },
    9: { key: 'productos_activos', tag: 'Productos', title: '¿Cuáles de estos tienes hoy?', hint: 'Selecciona todos los que apliquen.', type: 'multi', exclusive: 'ninguno', last: true, options: [
      { val: 'ahorros', label: 'Cuenta de ahorros' }, { val: 'corriente', label: 'Cuenta corriente' }, { val: 'billetera', label: 'Billetera digital' }, { val: 'cdt', label: 'CDT' }, { val: 'inversion', label: 'Cuenta o portafolio de inversión' }, { val: 'polizas', label: 'Pólizas de seguro' }, { val: 'pension', label: 'Pensión voluntaria' }, { val: 'ninguno', label: 'Ninguno de los anteriores' } ] }
  };
  var TOTAL = 9;
  var CALC_LABELS = ['Midiendo tu flujo de caja', 'Analizando tu salud de deuda', 'Evaluando tu fondo de emergencia', 'Calculando tu estabilidad', 'Construyendo tu Planea Score'];

  // Rutas de las pantallas de registro (solo deuda y ahorro habilitadas hoy).
  var CTA_ROUTE = { ahorro: '/planea/portal/ahorro', deuda: '/planea/portal/deuda' };

  // ── STATE ───────────────────────────────────────────────────────────────────
  var answers = {}, current = 'intro', root, profile = null, mayaMsg = {}, savedHistory = [];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmtInput(raw) { if (!raw) return ''; return parseInt(raw, 10).toLocaleString('es-CO'); }
  function firstName(full, email) { var n = (full || '').trim().split(/\s+/)[0]; return n || ((email || '').split('@')[0] || ''); }

  // ── RENDER: pregunta ─────────────────────────────────────────────────────────
  function renderQuestion(step) {
    var q = Q[step], a = answers, sel = a[q.key];
    var html = '<div class="dg-card"><div class="dg-prog">' + step + ' de ' + TOTAL + '</div>' +
      '<div class="dg-tag">' + esc(q.tag) + '</div>' +
      '<h3 class="dg-q">' + esc(q.title) + '</h3>';
    if (q.hint) html += '<p class="dg-hint">' + esc(q.hint) + '</p>';
    if (mayaMsg[step]) html += '<div class="dg-maya show"><div class="dg-maya-av">M</div><p>' + esc(mayaMsg[step]) + '</p></div>';

    html += '<div class="dg-opts">';
    if (q.type === 'multi') {
      var arr = Array.isArray(sel) ? sel : [];
      q.options.forEach(function (o) {
        var on = arr.indexOf(o.val) >= 0;
        html += '<button class="dg-opt dg-multi' + (on ? ' sel' : '') + '" data-step="' + step + '" data-val="' + o.val + '">' +
          '<span class="dg-box"></span><span class="dg-lbl">' + esc(o.label) + '</span></button>';
      });
      if (q.exactKey) {
        html += '<div class="dg-exact"><span class="pfx">$</span><input type="text" inputmode="numeric" id="dg-exact-input" data-exact="' + q.exactKey + '" placeholder="' + q.placeholder + '" value="' + fmtInput(a[q.exactKey]) + '"></div>' +
          '<div class="dg-exact-lbl">' + esc(q.exactLabel) + '</div>';
      }
    } else { // single + exact (rango)
      q.options.forEach(function (o) {
        html += '<button class="dg-opt' + (sel === o.val ? ' sel' : '') + '" data-step="' + step + '" data-val="' + o.val + '">' +
          '<span class="dg-check"></span><span class="dg-lbl">' + esc(o.label) + '</span></button>';
      });
      if (q.type === 'exact') {
        html += '<div class="dg-exact"><span class="pfx">$</span><input type="text" inputmode="numeric" id="dg-exact-input" data-exact="' + q.exactKey + '" placeholder="' + q.placeholder + '" value="' + fmtInput(a[q.exactKey]) + '"></div>' +
          '<div class="dg-exact-lbl">Si sabes el monto exacto, escríbelo aquí (opcional)</div>';
      }
    }
    html += '</div>';

    var disabled = isStepIncomplete(step);
    html += '<div class="dg-nav' + (step === 1 ? ' solo' : '') + '">';
    if (step > 1) html += '<button class="dg-back" data-step="' + step + '">Volver</button>';
    if (q.last) html += '<button class="dg-calc" data-calc' + (disabled ? ' disabled' : '') + '>Calcular mi Planea Score</button>';
    else html += '<button class="dg-next" data-step="' + step + '"' + (disabled ? ' disabled' : '') + '>Continuar</button>';
    html += '</div></div>';
    return html;
  }

  function isStepIncomplete(step) {
    var q = Q[step], v = answers[q.key];
    if (q.type === 'multi') return !(Array.isArray(v) && v.length > 0);
    return v === undefined; // single/exact: basta con un rango elegido (el monto exacto es opcional)
  }

  function renderIntro() {
    return '<div class="dg-card"><div class="dg-tag">Antes de empezar</div>' +
      '<h3 class="dg-q">Descubre tu Planea Score</h3>' +
      '<p class="dg-hint">Son nueve preguntas, dos minutos. Con tus respuestas calculamos tu Planea Score y, a partir de ahí, lo vamos afinando con tu información real. Metodología basada en los cuatro pilares del CFP Board.</p>' +
      '<div class="dg-nav solo"><button class="dg-next" data-intro>Comenzar</button></div></div>';
  }

  function renderCalculating() {
    var items = CALC_LABELS.map(function (l, i) { return '<div class="dg-calc-item" data-ci="' + i + '"><span class="dg-cdot"></span>' + esc(l) + '</div>'; }).join('');
    return '<div class="dg-card dg-calc-screen"><div class="dg-spinner"></div>' +
      '<div class="dg-calc-title">Calculando tu Planea Score</div>' +
      '<div class="dg-calc-sub">Analizando tus cuatro pilares financieros…</div>' +
      '<div class="dg-calc-steps">' + items + '</div></div>';
  }

  // ── RENDER: resultado (número + rango + insight + CTA). SIN desglose por pilar. ─
  var PILAR_ORDER = ['fondo_emergencia', 'flujo_caja', 'salud_deuda', 'estabilidad'];

  function renderResult(r) {
    var nombre = profile ? profile.nombre : '';
    var ins = E.buildInsight(r, nombre);
    var C = 2 * Math.PI * 63, color = r.rango.color;

    // Narrativa envolvente (apertura + cierre + advertencia). El detalle por pilar
    // vive ahora en el desglose desplegable de abajo.
    var apertura = ins.apertura ? '<p class="dg-ins-p">' + esc(ins.apertura) + '</p>' : '';
    var cierre = ins.cierre ? '<p class="dg-ins-p">' + esc(ins.cierre) + '</p>' : '';

    // DESGLOSE POR PILARES — cada pilar se DESPLIEGA para ver su insight (§ solicitud).
    var pilaresHtml = PILAR_ORDER.map(function (k) {
      var meta = E.PILAR_META[k] || { label: k, peso: '' };
      var v = Math.round((r.pilares[k] && r.pilares[k].puntaje) || 0);
      var pins = E.pillarInsight(k, v);
      var col = v < 50 ? 'var(--red)' : 'var(--green)';
      return '<div class="dg-pex" data-pex="' + k + '">' +
        '<button class="dg-pex-head" data-pex-btn="' + k + '">' +
          '<span class="dg-pex-nm">' + esc(meta.label) + ' <span class="dg-pex-w">· ' + esc(meta.peso) + '</span></span>' +
          '<span class="dg-pex-v" style="color:' + col + '">' + v + '</span>' +
          '<span class="dg-pex-chev" aria-hidden="true">▾</span>' +
        '</button>' +
        '<div class="dg-pex-bar"><div class="dg-pex-fill" style="width:' + v + '%;background:' + col + '"></div></div>' +
        '<div class="dg-pex-body"><p>' + esc(pins) + '</p></div>' +
      '</div>';
    }).join('');

    var progHtml = renderProgress(r.score);

    return '<div class="dg-card dg-result">' +
      '<div class="dg-res-tag">TU PLANEA SCORE</div>' +
      '<div class="dg-ringwrap"><svg viewBox="0 0 156 156"><circle cx="78" cy="78" r="63" fill="none" stroke="var(--line)" stroke-width="11"/>' +
      '<circle id="dg-ring" cx="78" cy="78" r="63" fill="none" stroke="' + color + '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" transform="rotate(-90 78 78)"/></svg>' +
      '<div class="dg-res-num"><b id="dg-score">0</b><small>PLANEA</small></div></div>' +
      '<div class="dg-res-badge" style="border-color:' + color + ';color:' + color + '">' + esc(r.rango.name) + '</div>' +
      progHtml +
      '<div class="dg-insight">' + apertura + '</div>' +
      '<div class="dg-res-sub">DESGLOSE POR PILARES · toca cada uno para ver el detalle</div>' +
      '<div class="dg-pex-list">' + pilaresHtml + '</div>' +
      '<div class="dg-insight">' + cierre + '</div>' +
      // "Próximo paso": inicia el registro guiado paso a paso (ingresos -> ... -> retiro).
      '<a class="dg-cta" href="/planea/portal/ingreso?guided=1" id="dg-next-step">Próximo paso</a>' +
      '<a class="dg-panel" href="/planea/portal/inicio" id="dg-done">Ir al panel</a>' +
      '<p class="dg-advertencia">' + esc(ins.advertencia) + '</p>' +
      '<div class="dg-res-links"><a href="#" id="dg-maya-btn">Hablar con Maya</a> · <a href="#" id="dg-retake">Volver a responder</a></div>' +
      '<div class="dg-saved" id="dg-saved"></div>' +
      '</div>';
  }

  function renderProgress(cur) {
    var hist = (savedHistory && savedHistory.length) ? savedHistory.slice() : [{ score: cur }];
    var start = hist[0].score;
    var pct = Math.max(0, Math.min(100, cur));
    if (hist.length <= 1) {
      return '<div class="dg-prog-wrap"><div class="dg-prog-bar"><div class="dg-prog-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="dg-prog-cap">Este es tu punto de partida. Tu Planea Score irá subiendo a medida que registres tu información con Maya.</div></div>';
    }
    return '<div class="dg-prog-wrap"><div class="dg-prog-bar"><div class="dg-prog-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="dg-prog-cap">Así empezaste: ' + start + '. Así vas hoy: ' + cur + '.</div></div>';
  }

  // ── FLOW ─────────────────────────────────────────────────────────────────────
  function paint() {
    if (current === 'intro') root.innerHTML = renderIntro();
    else if (typeof current === 'number') root.innerHTML = renderQuestion(current);
  }
  function go(step) { current = step; paint(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function next(from) { if (from === 'intro') { go(1); return; } if (from < TOTAL) go(from + 1); }
  function back(from) { if (from === 1) { go('intro'); return; } if (from > 1) go(from - 1); }

  function selectSingle(step, val) {
    var q = Q[step];
    answers[q.key] = val;
    // Micro-mensajes de Maya (§2.2) — sin emojis, no califican bueno/malo.
    if (step === 6) {
      if (val === 'nada') mayaMsg[6] = E.MAYA_MICRO.p6_nada;
      else if (val === 'm6_12' || val === 'm12plus') mayaMsg[6] = E.MAYA_MICRO.p6_seis_mas;
      else delete mayaMsg[6];
    }
    paint();
  }
  function toggleMulti(step, val) {
    var q = Q[step], arr = Array.isArray(answers[q.key]) ? answers[q.key].slice() : [];
    var exclusive = q.exclusive;
    if (val === exclusive) { arr = arr.indexOf(val) >= 0 ? [] : [val]; }
    else {
      arr = arr.filter(function (x) { return x !== exclusive; });
      var i = arr.indexOf(val); if (i >= 0) arr.splice(i, 1); else arr.push(val);
    }
    answers[q.key] = arr;
    if (step === 4) { if (arr.indexOf('ninguna') >= 0) mayaMsg[4] = E.MAYA_MICRO.p4_sin_deuda; else delete mayaMsg[4]; }
    paint();
  }

  function startCalc() {
    var r = E.compute(answers);
    root.innerHTML = renderCalculating();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    CALC_LABELS.forEach(function (_, i) { setTimeout(function () { var el = document.querySelector('[data-ci="' + i + '"]'); if (el) el.classList.add('done'); }, 450 + i * 520); });
    setTimeout(function () { showResult(r); }, 3400);
  }

  function showResult(r, opts) {
    current = 'result';
    root.innerHTML = renderResult(r);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    var C = 2 * Math.PI * 63, ring = document.getElementById('dg-ring');
    setTimeout(function () { if (ring) ring.setAttribute('stroke-dashoffset', C - (r.score / 100) * C); }, 140);
    var numEl = document.getElementById('dg-score'), t0 = performance.now(), dur = 1400;
    (function tick(now) { var p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3); if (numEl) numEl.textContent = Math.round(r.score * e); if (p < 1) requestAnimationFrame(tick); })(performance.now());
    if (!(opts && opts.skipPersist)) persist(r);
  }

  // ── PERSISTENCIA — un solo Planea Score + histórico ──────────────────────────
  function persist(r) {
    if (!window.PlaneaSB) return;
    var nowIso = new Date().toISOString();
    var hist = savedHistory && savedHistory.length ? savedHistory.slice() : [];
    hist.push({ score: r.score, at: nowIso, source: 'onboarding' });
    savedHistory = hist;
    var entry = {
      timestamp: nowIso, source: 'survey',
      score: r.score, survey_score: r.score, rango: r.rango.name,
      // compat unified-score.cjs / maya-chat.js / planea-data.js
      pillars: {
        emergency_fund: r.pilares.fondo_emergencia.puntaje,
        cash_flow: r.pilares.flujo_caja.puntaje,
        debt_health: r.pilares.salud_deuda.puntaje,
        stability: r.pilares.estabilidad.puntaje,
      },
      // salida de la spec (§9.1)
      pilar_atencion: r.pilar_atencion, pilar_respaldo: r.pilar_respaldo,
      productos_activos: r.productos_activos, frase_sin_coberturas: r.frase_sin_coberturas,
      cta_primario: r.cta_primario, cta_secundario: r.cta_secundario,
      omitir_diagnostico: r.omitir_diagnostico, omitir_reconocimiento: r.omitir_reconocimiento,
      history: hist,
      answers: answers
    };
    PlaneaSB.mePut({ score_data: entry })
      .then(function () {
        var el = document.getElementById('dg-saved'); if (el) el.textContent = 'Planea Score guardado en tu perfil.';
        try { localStorage.setItem('planea-onboarded', '1'); } catch (e) {}
        try { window.dispatchEvent(new CustomEvent('planea:onboarded')); } catch (e) {}
      })
      .catch(function (e) {
        var el = document.getElementById('dg-saved'); if (el) { el.textContent = 'No se pudo guardar tu Planea Score (revisa tu sesión).'; el.className = 'dg-saved warn'; }
        if (window.console) console.warn('[planea-score] save failed', e && e.message);
      });
  }

  function retake() { answers = {}; mayaMsg = {}; current = 'intro'; paint(); }

  function onClick(e) {
    var t = e.target.closest('button, a'); if (!t) return;
    if (t.hasAttribute('data-intro')) { e.preventDefault(); next('intro'); return; }
    if (t.classList.contains('dg-multi')) { e.preventDefault(); toggleMulti(+t.getAttribute('data-step'), t.getAttribute('data-val')); return; }
    if (t.classList.contains('dg-opt')) { e.preventDefault(); selectSingle(+t.getAttribute('data-step'), t.getAttribute('data-val')); return; }
    if (t.classList.contains('dg-next')) { e.preventDefault(); if (!t.hasAttribute('disabled')) next(+t.getAttribute('data-step')); return; }
    if (t.classList.contains('dg-back')) { e.preventDefault(); back(+t.getAttribute('data-step')); return; }
    if (t.hasAttribute('data-calc')) { e.preventDefault(); if (!t.hasAttribute('disabled')) startCalc(); return; }
    if (t.hasAttribute('data-pex-btn')) { e.preventDefault(); var pex = t.closest('.dg-pex'); if (pex) pex.classList.toggle('open'); return; }
    if (t.id === 'dg-maya-btn') { e.preventDefault(); if (window.MayaChat) MayaChat.open(); else location.href = '/planea/portal/inicio'; return; }
    if (t.id === 'dg-retake') { e.preventDefault(); retake(); return; }
  }
  function onInput(e) {
    var t = e.target;
    if (t.id === 'dg-exact-input') {
      var raw = t.value.replace(/\D/g, '');
      answers[t.getAttribute('data-exact')] = raw; t.value = fmtInput(raw);
    }
  }

  function readOurUser() {
    try {
      var m = (document.cookie || '').match(/(?:^|;\s*)planea_user=([^;]+)/);
      if (!m) return null;
      var v = m[1];
      for (var i = 0; i < 3; i++) { try { return JSON.parse(v); } catch (e) {} var d; try { d = decodeURIComponent(v); } catch (e) { break; } if (d === v) break; v = d; }
      return null;
    } catch (e) { return null; }
  }

  function boot() {
    root = document.getElementById('dg-root'); if (!root || !E) return;
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);

    var ou = readOurUser();
    if (ou) profile = { nombre: firstName(ou.full_name, ou.email), email: ou.email || '' };

    function startSurvey() { current = 'intro'; paint(); }

    if (window.PlaneaSB) {
      PlaneaSB.meGet().then(function (d) {
        if (d && d.full_name) profile = { nombre: firstName(d.full_name, d.email), email: d.email || '' };
        var sd = d && d.score_data;
        savedHistory = (sd && Array.isArray(sd.history)) ? sd.history : [];
        // Ya completado -> mostrar el resultado guardado (tab Planea Score), sin re-preguntar.
        if (sd && sd.score != null && sd.answers && !/[?&]edit=1/.test(location.search)) {
          answers = sd.answers;
          var r = E.compute(answers);
          var stale = sd.score !== r.score; // self-heal si cambió la fórmula
          showResult(r, { skipPersist: !stale });
        } else {
          if (sd && sd.answers) answers = sd.answers;
          startSurvey();
        }
      }).catch(function (e) {
        if (e && /\b401\b/.test(e.message || '')) { location.replace('/planea/login'); return; }
        startSurvey();
      });
    } else { startSurvey(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
