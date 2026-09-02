/* PLANEA — module editor (Ingresos / Gastos / Ahorro / Deuda / Inversión / Seguros / Retiro).
   Each module is INDEPENDENT and stored as its own rows in the planea_items table.
   The page carries <div id="mod-edit" data-cat="X">; this fills it with an
   interactive list + "+ Agregar" and add / edit / remove operate on single rows via
   PlaneaSB.itemCreate / itemUpdate / itemDelete (no whole-array writes, no races).
   Auth is the httpOnly JWT. Header totals refresh via planea-data.js on reload. */
(function () {
  'use strict';

  // `add` = etiqueta completa del botón (Documento Maestro §3 «Acción nombrada»: nunca
  // solo «Agregar»). `charts` = qué gráficas muestra la sección (Doc 2 §1.3): Ingresos,
  // Gastos, Ahorro, Deuda, Inversión llevan composición + evolución; Seguros ninguna
  // (§24); Retiro solo evolución (§25). Denominaciones: deuda «Pago mensual» (§21),
  // retiro «recursos» (§25).
  var CATS = {
    ingreso:   { cat: 'ingreso', title: 'Tus fuentes de ingreso', noun: 'ingresos', add: 'Agregar ingreso', amount: 'Monto mensual', ph: 'Ej: Salario', charts: { comp: true, evo: true }, behavior: true,
      types: ['Salario', 'Mesada', 'Freelance / honorarios', 'Negocio propio', 'Arriendos / rentas', 'Pensión', 'Comisiones', 'Otro'] },
    gastos:    { cat: 'gasto', title: 'Tus gastos mensuales', noun: 'gastos', add: 'Agregar gasto', amount: 'Monto mensual', ph: 'Ej: Arriendo', charts: { comp: true, evo: true }, behavior: true,
      types: ['Vivienda / arriendo', 'Alimentación', 'Transporte', 'Servicios públicos', 'Entretenimiento', 'Educación', 'Salud', 'Suscripciones', 'Otro'] },
    ahorro:    { cat: 'ahorro', title: 'Tus cuentas de ahorro', noun: 'ahorros', add: 'Agregar ahorro', amount: 'Valor actual', ph: 'Ej: Cuenta de ahorros', charts: { comp: true, evo: true },
      types: ['Cuenta de ahorros', 'Efectivo', 'CDT', 'Fondo (FIC)', 'Cuenta AFC', 'Otro'] },
    inversion: { cat: 'inversion', title: 'Tus inversiones', noun: 'inversiones', add: 'Agregar inversión', amount: 'Valor actual', ph: 'Ej: Fondo de inversión', charts: { comp: true, evo: true },
      types: ['Acciones', 'Fondo de inversión', 'CDT', 'Cripto', 'Bonos', 'ETF', 'Portafolio', 'Otro'] },
    deuda:     { cat: 'deuda', title: 'Tus deudas', noun: 'deudas', add: 'Agregar deuda', amount: 'Saldo que debes', ph: 'Ej: Tarjeta Visa', charts: { comp: true, evo: true },
      extra: { key: 'monthly', label: 'Pago mensual', short: 'pago' },
      types: ['Tarjeta de crédito', 'Crédito de libre inversión', 'Crédito de vehículo', 'Crédito hipotecario', 'Crédito educativo', 'Deuda informal', 'Otro'] },
    seguros:   { cat: 'seguros', title: 'Tus pólizas', noun: 'seguros', add: 'Agregar seguro', amount: 'Valor asegurado', ph: 'Ej: Seguro de vida', charts: { comp: false, evo: false }, insurance: true,
      extra: { key: 'monthly', label: 'Prima', short: 'prima' },
      types: ['Vida', 'Salud', 'Vehículo', 'Hogar', 'Educativo', 'Exequial', 'Otro'] },
    retiro:    { cat: 'retiro', title: 'Tus recursos para el retiro', noun: 'recursos', add: 'Agregar recurso', amount: 'Saldo o valor actual', ph: 'Ej: Pensión voluntaria', charts: { comp: false, evo: true },
      types: ['Pensión obligatoria', 'Pensión voluntaria', 'Cesantías', 'Fondo privado', 'Otro'] }
  };
  // Paleta de segmentos para la gráfica de composición (dona).
  var PIE = ['#3fc06a', '#17a6a6', '#5a9e7b', '#c8a24a', '#8fd9ac', '#2a6f9e', '#b07ac8', '#c87a32', '#9db3ab'];

  var mount, cat, cfg, items = [], editItem = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); }
  function cop(n) { return '$' + (Math.round(+n || 0)).toLocaleString('es-CO'); }
  function digits(s) { return (s || '').replace(/\D/g, ''); }
  function total() { return items.reduce(function (a, x) { return a + (+x.value || 0); }, 0); }

  // ── Gráficas §1.3 (dona composición + evolución), según cfg.charts. Existen aunque
  //    no haya datos: una sección vacía muestra el componente en estado vacío, nunca su
  //    ausencia (regla §3 «Ninguna sección bloqueada / estado vacío»). ──
  function chartsHtml() {
    if (!cfg.charts || (!cfg.charts.comp && !cfg.charts.evo)) return '';
    return (cfg.charts.comp ? donutHtml() : '') + (cfg.charts.evo ? evoHtml() : '');
  }
  function donutHtml() {
    var head = '<div class="pe-chart"><div class="pe-chart-h">Composición</div>';
    var t = total();
    if (!items.length || t <= 0) return head + '<div class="pe-chart-empty">Se dibujará aquí cuando agregues ' + esc(cfg.noun) + '.</div></div>';
    var C = 2 * Math.PI * 42, off = 0, segs = '', legend = '';
    items.slice().sort(function (a, b) { return (+b.value || 0) - (+a.value || 0); }).forEach(function (x, i) {
      var v = +x.value || 0; if (v <= 0) return;
      var frac = v / t, len = frac * C, col = PIE[i % PIE.length];
      segs += '<circle cx="60" cy="60" r="42" fill="none" stroke="' + col + '" stroke-width="16" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 60 60)"/>';
      off += len;
      legend += '<div class="pe-leg"><span class="pe-dot" style="background:' + col + '"></span><span class="pe-leg-nm">' + esc(x.name || x.type || '—') + '</span><span class="pe-leg-pct">' + Math.round(frac * 100) + '% · ' + cop(v) + '</span></div>';
    });
    return head + '<div class="pe-donut"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="42" fill="none" stroke="var(--card2,#16302a)" stroke-width="16"/>' + segs + '</svg><div class="pe-legwrap">' + legend + '</div></div></div>';
  }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function evoHtml() {
    return '<div class="pe-chart"><div class="pe-chart-h">Evolución</div><div class="pe-evo" id="pe-evo"><div class="pe-chart-empty">Cargando…</div></div></div>';
  }
  // Barras reales de evolución mes a mes desde el histórico (planea_item_history).
  function fillEvo() {
    if (!cfg.charts || !cfg.charts.evo || !window.PlaneaSB || !PlaneaSB.itemsHistory) return;
    var box = document.getElementById('pe-evo'); if (!box) return;
    PlaneaSB.itemsHistory(cfg.cat).then(function (d) {
      var h = ((d && d.history) || []).filter(function (r) { return r.category === cfg.cat; }).slice(-8);
      if (!h.length) { box.innerHTML = '<div class="pe-chart-empty">Aparecerá aquí cuando registres o actualices tus ' + esc(cfg.noun) + ' en distintos meses.</div>'; return; }
      var max = h.reduce(function (m, r) { return Math.max(m, +r.total || 0); }, 0) || 1;
      box.innerHTML = '<div class="pe-bars">' + h.map(function (r) {
        var pct = Math.round((+r.total || 0) / max * 100), mi = parseInt((r.ym || '').slice(5, 7), 10) - 1;
        return '<div class="pe-bar"><div class="pe-bar-track"><div class="pe-bar-fill" style="height:' + Math.max(pct, 3) + '%"></div></div><div class="pe-bar-lbl">' + (MESES[mi] || '') + '</div></div>';
      }).join('') + '</div>';
    }).catch(function () { box.innerHTML = '<div class="pe-chart-empty">Aún sin histórico.</div>'; });
  }

  function render() {
    if (!mount) return;
    var body = items.length
      ? items.map(function (x) {
          var m = (x.meta && typeof x.meta === 'object') ? x.meta : {};
          var sub = x.type || '';
          if (cfg.extra && x[cfg.extra.key]) {
            var per = '/mes';
            if (cfg.insurance && m.frequency && m.frequency !== 'mensual') per = '/' + ({ trimestral: 'trimestre', semestral: 'semestre', anual: 'año', otra: 'período' }[m.frequency] || 'período');
            sub += (sub ? ' · ' : '') + (cfg.extra.short || 'pago') + ' ' + cop(x[cfg.extra.key]) + per;
          }
          if (cfg.behavior && m.behavior) sub += (sub ? ' · ' : '') + ({ recurrente: 'Recurrente', variable: 'Variable', unico: 'Único' }[m.behavior] || '');
          if (cfg.insurance && m.employer) sub += (sub ? ' · ' : '') + 'del empleador';
          return '<div class="pe-row"><div><div class="pe-nm">' + esc(x.name || x.type || '—') + '</div>' +
            (sub ? '<div class="pe-ty">' + esc(sub) + '</div>' : '') + '</div>' +
            '<div class="pe-amt">' + cop(x.value) + '</div>' +
            '<button class="pe-edit" data-edit="' + x.id + '" title="Editar" aria-label="Editar">✎</button>' +
            '<button class="pe-del" data-del="' + x.id + '" title="Eliminar" aria-label="Eliminar">✕</button></div>';
        }).join('')
      : '<div class="pe-empty">Aún no has agregado ' + cfg.noun + '. Toca «' + esc(cfg.add) + '».</div>';
    mount.innerHTML = chartsHtml() +
      '<div class="pe-col"><div class="pe-head"><span>' + esc(cfg.title) + '</span></div>' + body + '</div>' +
      '<div class="pe-addwrap"><button class="pe-add" data-add><span class="pe-plus">+</span>' + esc(cfg.add) + '</button></div>' +
      continueHtml();
    // keep the page's "total above" header in sync immediately (planea-data also does on reload)
    document.querySelectorAll('[data-pl="' + totalKey() + '"]').forEach(function (el) { el.textContent = cop(total()); });
    if (cfg.charts && cfg.charts.evo) fillEvo();
  }

  // ── Paso guiado: etiqueta legible de cada pilar para el botón "Continuar" ──
  var STEP_LABEL = { ingreso: 'Ingresos', gastos: 'Gastos', ahorro: 'Ahorro', deuda: 'Deuda', inversion: 'Inversión', seguros: 'Seguros', retiro: 'Retiro' };
  // Botón "Continuar" del flujo guiado: marca este paso como completado (incluso si
  // el pilar va vacío — "no tengo") y lleva al SIGUIENTE pilar en el orden fijo. Solo
  // aparece cuando este pilar es el paso ACTUAL del acompañamiento.
  function continueHtml() {
    var PS = window.PlaneaSteps; if (!PS) return '';
    if (!PS.guidedActive || !PS.guidedActive()) return ''; // solo en onboarding nuevo
    if (guidedActive()) return '';                // el flujo ?guided=1 ya trae su barra
    if (PS.current() !== cat) return '';          // no es el paso actual -> sin CTA de avance
    var nxt = PS.next(cat);
    var label = items.length
      ? (nxt ? 'Continuar a ' + (STEP_LABEL[nxt] || 'lo siguiente') : 'Terminar y ver mi Puntaje Planea')
      : (nxt ? 'No tengo, continuar a ' + (STEP_LABEL[nxt] || 'lo siguiente') : 'No tengo, terminar');
    return '<div class="pe-nextwrap"><button class="pe-next" data-next>' + esc(label) +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
      '<div class="pe-nexthint">Planea te guía paso a paso, en orden. Completa este para desbloquear el siguiente.</div></div>';
  }
  function goNext() {
    var PS = window.PlaneaSteps; if (!PS) { location.href = '/planea/portal/diagnostico'; return; }
    var nxt = PS.next(cat);
    var done = PS.markDone(cat);
    var jump = function () { location.href = nxt ? ('/planea/portal/' + nxt) : '/planea/portal/diagnostico'; };
    (done && done.then ? done.then(jump, jump) : jump());
  }
  function totalKey() {
    return { ingreso: 'ingreso_total', gasto: 'gasto_total', ahorro: 'ahorro_total', inversion: 'inversion_total', deuda: 'deuda_total', seguros: 'seguros_total', retiro: 'retiro_total' }[cfg.cat];
  }

  function formHtml(prefill) {
    var pm = (prefill && prefill.meta && typeof prefill.meta === 'object') ? prefill.meta : {};
    var behaviorHtml = cfg.behavior ? ('<label class="pe-l">Comportamiento</label><select class="pe-in" id="pe-behavior">' +
      [['recurrente', 'Recurrente (se repite cada mes)'], ['variable', 'Variable (cambia cada mes)'], ['unico', 'Único (una sola vez)']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((pm.behavior === o[0] || (!pm.behavior && o[0] === 'recurrente')) ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>') : '';
    var insuranceHtml = cfg.insurance ? ('<label class="pe-l">Frecuencia de la prima</label><select class="pe-in" id="pe-freq">' +
      ['mensual', 'trimestral', 'semestral', 'anual', 'otra'].map(function (f) {
        return '<option value="' + f + '"' + ((pm.frequency === f || (!pm.frequency && f === 'mensual')) ? ' selected' : '') + '>' + f.charAt(0).toUpperCase() + f.slice(1) + '</option>';
      }).join('') + '</select>' +
      '<label class="pe-check"><input type="checkbox" id="pe-employer"' + (pm.employer ? ' checked' : '') + '> La otorga mi empleador</label>') : '';
    return '<div class="pe-backdrop" id="pe-modal"><div class="pe-form">' +
      '<div class="pe-form-h">' + (prefill ? 'Editar' : 'Agregar') + '<button class="pe-x" data-close>✕</button></div>' +
      '<label class="pe-l">Nombre <span class="pe-opt">(opcional)</span></label><input class="pe-in" id="pe-name" placeholder="' + esc(cfg.ph) + '" value="' + esc(prefill && prefill.name || '') + '">' +
      '<label class="pe-l">Tipo</label><select class="pe-in" id="pe-type">' +
        cfg.types.map(function (t) { return '<option' + (prefill && prefill.type === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
      behaviorHtml +
      '<label class="pe-l">' + esc(cfg.amount) + ' ($)</label><div class="pe-money"><span>$</span>' +
        '<input class="pe-in" id="pe-value" inputmode="numeric" placeholder="0" value="' + (prefill && prefill.value ? (+prefill.value).toLocaleString('es-CO') : '') + '"></div>' +
      (cfg.extra ? '<label class="pe-l">' + esc(cfg.extra.label) + ' ($)</label><div class="pe-money"><span>$</span>' +
        '<input class="pe-in" id="pe-extra" inputmode="numeric" placeholder="0" value="' + (prefill && prefill[cfg.extra.key] ? (+prefill[cfg.extra.key]).toLocaleString('es-CO') : '') + '"></div>' : '') +
      insuranceHtml +
      '<div class="pe-err" id="pe-err" hidden></div>' +
      '<div class="pe-actions"><button class="pe-cancel" data-close>Cancelar</button><button class="pe-save" data-save>Guardar</button></div>' +
      '</div></div>';
  }
  function openForm(prefill) {
    editItem = prefill || null;
    document.body.insertAdjacentHTML('beforeend', formHtml(prefill));
    var fmt = function (el) { if (!el) return; el.addEventListener('input', function () { var d = digits(el.value); el.value = d ? parseInt(d, 10).toLocaleString('es-CO') : ''; }); };
    fmt(document.getElementById('pe-value'));
    fmt(document.getElementById('pe-extra'));
    document.getElementById('pe-name').focus();
  }
  function closeForm() { var m = document.getElementById('pe-modal'); if (m) m.remove(); editItem = null; }

  function save() {
    var name = document.getElementById('pe-name').value.trim();
    var type = document.getElementById('pe-type').value;
    var value = parseInt(digits(document.getElementById('pe-value').value), 10) || 0;
    // §1.5: el nombre es OPCIONAL (una nota personal). Con tipo y valor basta para guardar.
    // Sin valor, mensaje EN LÍNEA dentro del formulario — nunca una alerta nativa del navegador.
    if (!value) {
      var er = document.getElementById('pe-err');
      if (er) { er.textContent = 'Escribe un valor para guardar.'; er.hidden = false; }
      var vi = document.getElementById('pe-value'); if (vi) vi.focus();
      return;
    }
    var body = { category: cfg.cat, name: name || type, type: type, value: value };
    if (cfg.extra) body[cfg.extra.key] = parseInt(digits((document.getElementById('pe-extra') || {}).value || ''), 10) || 0;
    // §18 comportamiento · §24 frecuencia + empleador → viajan en meta (columna JSONB).
    var meta = {};
    if (cfg.behavior) { var bh = document.getElementById('pe-behavior'); if (bh && bh.value) meta.behavior = bh.value; }
    if (cfg.insurance) {
      var fq = document.getElementById('pe-freq'); if (fq && fq.value) meta.frequency = fq.value;
      var em = document.getElementById('pe-employer'); if (em && em.checked) meta.employer = true;
    }
    if (Object.keys(meta).length) body.meta = meta;
    if (!window.PlaneaSB) { closeForm(); return; }
    var op = editItem ? PlaneaSB.itemUpdate(editItem.id, body) : PlaneaSB.itemCreate(body);
    closeForm();
    op.then(function () { reload(); recomputeScore(); }).catch(function (e) {
      if (window.console) console.warn('[module-edit] save failed', e && e.message);
      // 401 = not authenticated on this domain -> go log in here, then come back.
      if (e && /\b401\b/.test(e.message || '')) { location.href = '/planea/login'; return; }
      alert('No se pudo guardar. Intenta de nuevo.');
    });
  }
  function del(id) {
    if (!confirm('¿Eliminar este ' + cfg.noun.replace(/s$/, '') + '?')) return;
    PlaneaSB.itemDelete(id).then(function () { reload(); recomputeScore(); }).catch(function () { alert('No se pudo eliminar.'); });
  }

  // DATO REAL (Documento Maestro §3, §6.3): al registrar/editar/borrar un ítem, el motor
  // ÚNICO de 8 pilares recalcula el Puntaje Planea con el dato real fusionado en answers
  // (planea-realdata.js). Se persiste en score_data, así que Inicio, Puntaje Planea y las
  // secciones leen SIEMPRE el mismo número. Sin diagnóstico previo no hay nada que recalcular.
  function recomputeScore() {
    if (!window.PlaneaSB || !window.PlaneaMotor || !window.PlaneaRealData || !PlaneaSB.meGet) return;
    PlaneaSB.meGet().then(function (d) {
      var sd = d && d.score_data;
      if (!sd || !sd.answers || !sd.answers.edad) return;   // aún sin vinculación → no se recalcula
      var all = (d && d.items) || [];
      var ans = PlaneaRealData.applyRealData(sd.answers, all);
      var r = PlaneaMotor.compute(ans);
      if (sd.score === r.score && JSON.stringify(sd.answers) === JSON.stringify(ans)) return; // sin cambios
      function sub(k) { return Math.round((r.pilares[k] && r.pilares[k].puntaje) || 0); }
      var hist = Array.isArray(sd.history) ? sd.history.slice() : [];
      if (sd.score !== r.score) hist.push({ score: r.score, at: new Date().toISOString(), source: 'real' });
      var newSd = Object.assign({}, sd, {
        score: r.score, rango: r.rango.name, answers: ans, history: hist, prioridad: r.prioridad,
        pilares: { ahorro: sub('ahorro'), flujo: sub('flujo'), deuda: sub('deuda'), retiro: sub('retiro'), seguros: sub('seguros'), inversion: sub('inversion'), impuestos: sub('impuestos'), patrimonio: sub('patrimonio') },
        pillars: { emergency_fund: sub('ahorro'), cash_flow: sub('flujo'), debt_health: sub('deuda'), stability: sub('patrimonio') }
      });
      PlaneaSB.mePut({ score_data: newSd }).then(function () {
        document.querySelectorAll('[data-pl="score"]').forEach(function (el) { el.textContent = r.score; });
      }).catch(function () {});
    }).catch(function () {});
  }

  function reload() {
    PlaneaSB.items(cfg.cat).then(function (d) { items = (d && d.items) || []; render(); }).catch(function () { render(); });
  }

  function onClick(e) {
    if (e.target.id === 'pe-modal') { closeForm(); return; }
    var t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-add')) { openForm(null); return; }
    if (t.hasAttribute('data-edit')) { var id = +t.getAttribute('data-edit'); var it = items.filter(function (x) { return x.id === id; })[0]; if (it) openForm(it); return; }
    if (t.hasAttribute('data-del')) { del(+t.getAttribute('data-del')); return; }
    if (t.hasAttribute('data-close')) { closeForm(); return; }
    if (t.hasAttribute('data-save')) { save(); return; }
    if (t.hasAttribute('data-next')) { goNext(); return; }
  }

  function style() {
    var s = document.createElement('style');
    s.textContent = '#mod-edit .pe-edit{background:none;border:none;color:var(--mut,#9db3ab);cursor:pointer;font-size:15px;padding:4px 6px;margin-left:6px}#mod-edit .pe-edit:hover{color:var(--green,#3fc06a)}' +
      // Gráficas (dona composición + evolución)
      '#mod-edit .pe-chart{background:var(--card,#0f231e);border:1px solid var(--line,#1f3b33);border-radius:16px;padding:16px;margin-bottom:14px}' +
      '#mod-edit .pe-chart-h{font-family:"Inter",system-ui,sans-serif;font-weight:800;font-size:14px;color:var(--txt,#eafff4)}' +
      '#mod-edit .pe-chart-empty{font-size:12.5px;color:var(--mut,#9db3ab);line-height:1.5;margin-top:8px}' +
      '#mod-edit .pe-donut{display:flex;gap:16px;align-items:center;margin-top:12px;flex-wrap:wrap}' +
      '#mod-edit .pe-donut svg{width:120px;height:120px;flex:0 0 120px}' +
      '#mod-edit .pe-legwrap{flex:1;min-width:160px;display:flex;flex-direction:column;gap:7px}' +
      '#mod-edit .pe-leg{display:flex;align-items:center;gap:8px;font-size:12.5px}' +
      '#mod-edit .pe-dot{width:10px;height:10px;border-radius:3px;flex:0 0 10px}' +
      '#mod-edit .pe-leg-nm{flex:1;color:var(--txt,#eafff4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#mod-edit .pe-leg-pct{color:var(--mut,#9db3ab);font-variant-numeric:tabular-nums;white-space:nowrap}' +
      // Barras de evolución
      '#mod-edit .pe-bars{display:flex;gap:8px;align-items:flex-end;height:96px;margin-top:12px}' +
      '#mod-edit .pe-bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%}' +
      '#mod-edit .pe-bar-track{flex:1;width:100%;max-width:34px;display:flex;align-items:flex-end;background:var(--card2,#16302a);border-radius:6px;overflow:hidden}' +
      '#mod-edit .pe-bar-fill{width:100%;background:linear-gradient(180deg,#3fc06a,#17a6a6);border-radius:6px 6px 0 0;transition:height .5s ease}' +
      '#mod-edit .pe-bar-lbl{font-size:10.5px;color:var(--mut,#9db3ab);text-transform:capitalize}' +
      // Botón "Agregar {sección}" centrado, debajo del listado (§1.4 + PRECISIÓN NUEVA)
      '#mod-edit .pe-addwrap{margin-top:16px;display:flex;justify-content:center}' +
      '#mod-edit .pe-add{display:inline-flex;align-items:center;gap:9px;background:#12494b;color:#eafff4;border:none;border-radius:14px;padding:14px 26px;font-family:"Inter",system-ui,sans-serif;font-weight:800;font-size:15.5px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.22)}' +
      'body.light #mod-edit .pe-add{background:var(--cream,#16373A);color:#fff}' +
      '#mod-edit .pe-add:active{transform:scale(.99)}#mod-edit .pe-plus{font-size:19px;line-height:1;font-weight:700}' +
      '.pe-form .pe-opt{color:var(--mut,#9db3ab);font-weight:500}' +
      '.pe-form .pe-check{display:flex;align-items:center;gap:9px;font-size:13.5px;color:var(--txt,#eafff4);margin-top:12px;cursor:pointer}' +
      '.pe-form .pe-check input{width:18px;height:18px;flex:0 0 18px}' +
      '.pe-form .pe-err{color:#e0705a;font-size:12.5px;margin:2px 0 -2px;font-weight:600}' +
      '#mod-edit .pe-nextwrap{margin-top:18px;display:flex;flex-direction:column;gap:8px}' +
      '#mod-edit .pe-next{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;background:linear-gradient(90deg,#3fc06a,#17a6a6);color:#04120c;border:none;border-radius:14px;padding:15px 20px;font-family:"Inter",system-ui,sans-serif;font-weight:800;font-size:16px;cursor:pointer;box-shadow:0 8px 22px rgba(63,192,106,.30)}' +
      '#mod-edit .pe-next:active{transform:scale(.99)}#mod-edit .pe-next svg{width:20px;height:20px}' +
      '#mod-edit .pe-nexthint{font-size:12.5px;color:var(--mut,#9db3ab);line-height:1.4;text-align:center}';
    document.head.appendChild(s);
  }

  // ── Registro GUIADO paso a paso (?guided=1) ─────────────────────────────────
  // Tras el Planea Score, "Próximo paso" arranca este flujo: lleva al usuario click a
  // click por cada bucket (ingresos -> gastos -> ... -> retiro) con un botón Siguiente
  // grande, para que registrar sus datos sea muy fácil y explícito.
  var GUIDED_SEQ = ['ingreso', 'gastos', 'ahorro', 'deuda', 'inversion', 'seguros', 'retiro'];
  var GUIDED_LABEL = { ingreso: 'Ingresos', gastos: 'Gastos', ahorro: 'Ahorro', deuda: 'Deudas', inversion: 'Inversión', seguros: 'Seguros', retiro: 'Retiro' };
  function guidedActive() { try { return /[?&]guided=1/.test(location.search); } catch (e) { return false; } }

  function guidedStyle() {
    var s = document.createElement('style');
    s.textContent =
      'body.guided-mode{padding-bottom:96px}' +
      '.gw-top{position:sticky;top:0;z-index:40;background:var(--bg,#0a1310);border-bottom:1px solid var(--line);padding:12px 16px 14px}' +
      '.gw-step{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);font-weight:700}' +
      '.gw-ttl{font-family:"Inter",sans-serif;font-weight:800;font-size:16px;margin-top:3px;color:var(--txt)}' +
      '.gw-track{height:7px;border-radius:99px;background:var(--line);overflow:hidden;margin-top:9px}' +
      '.gw-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#3fc06a,#17a6a6);transition:width .4s ease}' +
      '.gw-hint{font-size:12.5px;color:var(--mut);margin-top:9px;line-height:1.4}' +
      '.gw-bar{position:fixed;left:0;right:0;bottom:0;z-index:41;display:flex;gap:12px;align-items:center;justify-content:space-between;' +
        'padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));background:var(--bg,#0a1310);border-top:1px solid var(--line)}' +
      '.gw-skip{background:none;border:none;color:var(--mut);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:10px}' +
      '.gw-next{flex:1;max-width:280px;margin-left:auto;background:linear-gradient(90deg,#3fc06a,#17a6a6);color:#04120c;border:none;border-radius:14px;' +
        'padding:15px 20px;font-family:"Inter",sans-serif;font-weight:800;font-size:16px;cursor:pointer;box-shadow:0 8px 22px rgba(63,192,106,.32)}' +
      '.gw-next:active{transform:scale(.99)}';
    document.head.appendChild(s);
  }

  function guided() {
    var idx = GUIDED_SEQ.indexOf(cat);
    if (idx < 0) return;                       // este módulo no está en el flujo guiado
    guidedStyle();
    document.body.classList.add('guided-mode');
    var n = idx + 1, total = GUIDED_SEQ.length;
    var last = idx === total - 1;
    var pct = Math.round((n / total) * 100);

    // Banner superior con progreso
    var top = document.createElement('div');
    top.className = 'gw-top';
    top.innerHTML = '<div class="gw-step">Paso ' + n + ' de ' + total + '</div>' +
      '<div class="gw-ttl">' + esc(GUIDED_LABEL[cat] || cfg.title) + '</div>' +
      '<div class="gw-track"><div class="gw-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="gw-hint">Agrega tus ' + esc(cfg.noun) + ' con “+ Agregar”. Cuando termines (o si no aplica), toca ' + (last ? 'Finalizar' : 'Siguiente') + '.</div>';
    document.body.insertBefore(top, document.body.firstChild);

    // Barra inferior con Siguiente/Finalizar
    var bar = document.createElement('div');
    bar.className = 'gw-bar';
    var nextLabel = last ? 'Finalizar' : 'Siguiente';
    bar.innerHTML = '<button class="gw-skip" id="gw-skip">Saltar por ahora</button>' +
      '<button class="gw-next" id="gw-next">' + nextLabel + '</button>';
    document.body.appendChild(bar);

    function go() {
      // Marca este paso como completado (desbloquea el siguiente en la navegación),
      // luego avanza. "Saltar por ahora" también completa: el flujo debe progresar.
      var PS = window.PlaneaSteps;
      var done = PS ? PS.markDone(cat) : null;
      var jump = function () {
        if (last) { location.href = '/planea/portal/diagnostico'; return; }   // termina en Salud Financiera
        location.href = '/planea/portal/' + GUIDED_SEQ[idx + 1] + '?guided=1';
      };
      (done && done.then ? done.then(jump, jump) : jump());
    }
    document.getElementById('gw-next').addEventListener('click', go);
    document.getElementById('gw-skip').addEventListener('click', go);
  }

  // Guardia anti-atajo: si el usuario llega por URL a un pilar BLOQUEADO (posterior al
  // paso actual), lo devolvemos a su paso actual. Se ejecuta cuando ya hay perfil real
  // (planea:profile) para no rebotar durante la carga inicial.
  function guardLocked() {
    var PS = window.PlaneaSteps; if (!PS || !window.PLANEA_PROFILE) return;
    if (guidedActive()) return;                 // el flujo guiado maneja su propio orden
    if (PS.isLocked(cat)) {
      var cur = PS.current();
      if (cur && cur !== cat) location.replace('/planea/portal/' + cur);
    }
  }

  function boot() {
    mount = document.getElementById('mod-edit');
    if (!mount) return;
    cat = mount.getAttribute('data-cat');
    cfg = CATS[cat];
    if (!cfg) return;
    style();
    render();
    document.addEventListener('click', onClick);
    // El botón "Continuar" y el candado del siguiente pilar dependen del paso actual,
    // que se resuelve cuando llega el perfil real. Re-render al cambiar pasos/perfil,
    // y aplica la guardia anti-atajo una vez que hay datos reales.
    window.addEventListener('planea:steps', render);
    window.addEventListener('planea:profile', function () { render(); guardLocked(); });
    if (guidedActive()) guided();
    if (window.PlaneaSB) reload(); // load this module's rows (JWT-auth); 401 => empty
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
