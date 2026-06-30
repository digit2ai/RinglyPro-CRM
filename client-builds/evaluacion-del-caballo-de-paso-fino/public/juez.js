// =====================================================
// Juez de campeonato — cliente: selectores evento/categoría/competidor, carga de
// video+audio, barra de progreso, y el fallo (modalidad + confianza + bandera +
// métricas + puntaje + desglose + línea de tiempo de pisadas + video + dictamen).
//
// NOTA: no hay modelo de pose EQUINA en el navegador, así que el video se sube
// como referencia y la marcha se SIMULA en el servidor (demo_modalidad) corriendo
// el pipeline REAL. En producción, los pose_frames vienen del modelo de pose.
// =====================================================
(function () {
  'use strict';
  var I18N = window.__I18N || {}, BASE = window.__BASE || '/', LANG = window.__LANG || 'es';
  var API = BASE + 'api/v1', CHAMP = API + '/champ';
  var demoToken = '';

  function $(id) { return document.getElementById(id); }
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) { var k = el.getAttribute('data-i18n'); if (I18N[k] != null) el.textContent = I18N[k]; });
  }
  function langToggle() {
    var el = $('langToggle'); if (!el) return;
    el.addEventListener('click', function () { var u = new URL(location.href); u.searchParams.set('lang', LANG === 'es' ? 'en' : 'es'); location.href = u.toString(); });
  }
  function customToken() { var e = $('jwt'); return e && e.value ? e.value.trim() : ''; }
  function ensureToken() {
    if (customToken()) return Promise.resolve(customToken());
    if (demoToken) return Promise.resolve(demoToken);
    return fetch(API + '/session/demo').then(function (r) { return r.json(); }).then(function (j) { demoToken = (j && j.token) || ''; setBadge(); return demoToken; }).catch(function () { return ''; });
  }
  function setBadge() { var b = $('sessionBadge'); if (!b) return; if (demoToken) { b.textContent = I18N.session_demo; b.className = 'text-xs text-emerald-400 mono'; } }

  var MODALIDAD_LABEL = {
    paso_fino: { es: 'Paso fino', en: 'Paso fino' },
    trocha: { es: 'Trocha', en: 'Trocha' },
    trote_galope: { es: 'Trote / galope', en: 'Trot / canter' },
    trocha_galope: { es: 'Trocha y galope', en: 'Trocha and canter' }
  };
  function modLabel(m) { return (MODALIDAD_LABEL[m] && MODALIDAD_LABEL[m][LANG]) || (m || '—'); }

  // ---- Selectores ----
  function loadEventos() {
    return fetch(CHAMP + '/eventos').then(function (r) { return r.json(); }).then(function (rows) {
      fillSelect('eventoSel', rows, 'sel_evento', function (e) { return e.nombre + ' (' + (e.anio || '') + ')'; });
      return rows;
    }).catch(function () { return []; });
  }
  function loadCategorias(evento_id) {
    return fetch(CHAMP + '/categorias?evento_id=' + evento_id).then(function (r) { return r.json(); }).then(function (rows) {
      fillSelect('categoriaSel', rows, 'sel_categoria', function (c) { return c.nombre + ' · ' + modLabel(c.modalidad); });
      return rows;
    }).catch(function () { return []; });
  }
  function loadInscripciones(categoria_id) {
    return fetch(CHAMP + '/inscripciones?categoria_id=' + categoria_id).then(function (r) { return r.json(); }).then(function (rows) {
      fillSelect('inscripcionSel', rows, 'sel_competidor', function (i) { return '#' + (i.numero_competidor || '?') + ' · ' + (i.caballo || ''); });
      return rows;
    }).catch(function () { return []; });
  }
  function fillSelect(id, rows, placeholderKey, label) {
    var sel = $(id); if (!sel) return;
    sel.innerHTML = '';
    var ph = document.createElement('option'); ph.value = ''; ph.textContent = I18N[placeholderKey] || ''; sel.appendChild(ph);
    (rows || []).forEach(function (r) { var o = document.createElement('option'); o.value = r.id; o.textContent = label(r); sel.appendChild(o); });
  }

  function bindSelectors() {
    $('eventoSel').addEventListener('change', function () { if (this.value) loadCategorias(this.value); });
    $('categoriaSel').addEventListener('change', function () { if (this.value) loadInscripciones(this.value); });
    $('demoSetup').addEventListener('click', function () {
      ensureToken().then(function (t) {
        if (!t) return;
        fetch(CHAMP + '/demo-setup', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: '{}' })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            loadEventos().then(function () {
              $('eventoSel').value = d.evento.id;
              loadCategorias(d.evento.id).then(function () {
                $('categoriaSel').value = d.categoria.id;
                loadInscripciones(d.categoria.id).then(function () { $('inscripcionSel').value = d.inscripcion.id; });
              });
            });
            // pre-seleccionar la modalidad de la categoría como simulación
            $('demoModSel').value = d.categoria.modalidad === 'trote_galope' ? 'trote' : d.categoria.modalidad;
          });
      });
    });
  }

  // ---- Evaluar ----
  function progress(pct, msg) { $('progressWrap').classList.remove('hidden'); $('progressBar').style.width = pct + '%'; $('progressMsg').textContent = msg || ''; }
  var progTimer = null;
  function fakeProgress() {
    var steps = [[12, I18N.prog_video], [34, I18N.prog_pose], [56, I18N.prog_pisadas], [74, I18N.prog_metricas], [88, I18N.prog_clasif]];
    var i = 0; progress(5, I18N.prog_subiendo);
    progTimer = setInterval(function () { if (i < steps.length) { progress(steps[i][0], steps[i][1]); i++; } }, 320);
  }
  function stopProgress(done) { if (progTimer) clearInterval(progTimer); if (done) progress(100, I18N.prog_listo); }

  function bindEvaluar() {
    $('evaluar').addEventListener('click', function () {
      var inscripcion_id = $('inscripcionSel').value;
      if (!inscripcion_id) { progress(0, I18N.err_need_inscripcion); $('progressWrap').classList.remove('hidden'); return; }
      var btn = this; btn.disabled = true;
      fakeProgress();
      ensureToken().then(function (t) {
        var fd = new FormData();
        fd.append('inscripcion_id', inscripcion_id);
        fd.append('superficie', $('superficieSel').value);
        var demoMod = $('demoModSel').value;
        var videoFile = $('video').files[0];
        var audioFile = $('audio').files[0];
        // Sin pose equina en navegador: simular modalidad (la elegida, o la de la categoría).
        if (!demoMod) demoMod = 'paso_fino';
        fd.append('demo_modalidad', demoMod);
        if (videoFile) fd.append('video', videoFile);
        if (audioFile) fd.append('audio', audioFile);
        fetch(CHAMP + '/sessions', { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: fd })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            stopProgress(true);
            btn.disabled = false;
            if (!res.ok) { progress(0, (res.j && res.j.error) || 'error'); return; }
            setTimeout(function () { $('progressWrap').classList.add('hidden'); }, 600);
            renderFallo(res.j, videoFile);
          })
          .catch(function (e) { stopProgress(false); btn.disabled = false; progress(0, String(e)); });
      });
    });
  }

  function renderFallo(f, videoFile) {
    var card = $('result'); card.classList.remove('hidden');
    var clas = f.clasificacion || {};
    $('resModalidad').textContent = modLabel(clas.modalidad_detectada);
    $('resConf').textContent = '· ' + Math.round((clas.confianza || 0) * 100) + '% ' + (I18N.res_confianza || 'confianza') + ' · ' + (clas.tiempos || '?') + ' ' + (I18N.res_tiempos || 'tiempos');
    $('resTotal').textContent = (f.puntaje_total != null ? f.puntaje_total.toFixed(1) : '—');

    var flag = $('resFlag');
    if (clas.es_modalidad_valida === false) {
      flag.classList.remove('hidden');
      flag.textContent = (I18N.flag_mismatch || 'Modalidad detectada no coincide con la categoría inscrita') + ' (' + modLabel(clas.modalidad_categoria) + ' → ' + modLabel(clas.modalidad_detectada) + ').';
    } else { flag.classList.add('hidden'); }

    var mov = f.metricas_movimiento || {};
    $('mCad').textContent = mov.cadencia_ppm != null ? Math.round(mov.cadencia_ppm) : '—';
    $('mReg').textContent = mov.regularidad_ritmo != null ? Math.round(mov.regularidad_ritmo * 100) + '%' : '—';
    $('mSim').textContent = mov.simetria_lateral != null ? Math.round(mov.simetria_lateral * 100) + '%' : '—';
    var clar = (f.metricas_sonido && f.metricas_sonido.claridad_4_tiempos != null) ? f.metricas_sonido.claridad_4_tiempos : mov.uniformidad_4_tiempos;
    $('mClar').textContent = clar != null ? Math.round(clar * 100) + '%' : '—';

    // Desglose por criterio (barras).
    var bd = $('breakdown'); bd.innerHTML = '';
    (f.puntuaciones || []).forEach(function (p) {
      var row = document.createElement('div');
      var pct = Math.max(0, Math.min(100, p.puntaje_normalizado || 0));
      row.innerHTML = '<div class="flex justify-between text-xs mb-1"><span>' + esc(p.nombre) + ' <span class="text-slate-500">(' + p.peso_porcentaje + '%)</span></span><span class="mono">' + pct.toFixed(0) + '/100</span></div>' +
        '<div class="h-2 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-indigo-500" style="width:' + pct + '%"></div></div>';
      bd.appendChild(row);
    });

    // Línea de tiempo de pisadas.
    renderTimeline(f.pisadas || []);

    // Video.
    var vp = $('videoPlayer');
    if (videoFile) { vp.src = URL.createObjectURL(videoFile); vp.classList.remove('hidden'); } else { vp.classList.add('hidden'); }

    // Dictamen narrativo del juez.
    $('resDictamen').textContent = dictamen(f);

    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTimeline(pisadas) {
    var tl = $('timeline'); tl.innerHTML = '';
    if (!pisadas.length) return;
    var min = pisadas[0].timestamp_ms, max = pisadas[pisadas.length - 1].timestamp_ms; var span = (max - min) || 1;
    pisadas.forEach(function (p) {
      var m = document.createElement('div');
      var cls = (p.detectada_por_audio && p.detectada_por_video) ? 'both' : (p.detectada_por_video ? 'video' : 'audio');
      m.className = 'mark ' + cls;
      m.style.left = (((p.timestamp_ms - min) / span) * 100) + '%';
      m.title = (p.extremidad || '?') + ' @ ' + p.timestamp_ms + 'ms';
      tl.appendChild(m);
    });
  }

  function dictamen(f) {
    var c = f.clasificacion || {}, mov = f.metricas_movimiento || {};
    var L = LANG === 'en';
    var mod = modLabel(c.modalidad_detectada);
    var conf = Math.round((c.confianza || 0) * 100);
    var cv = c.coef_variacion_intervalos != null ? c.coef_variacion_intervalos.toFixed(3) : 'n/d';
    if (L) {
      return 'The horse shows a ' + mod + ' gait with ' + c.tiempos + ' beats and a ' + c.patron + ' support pattern (confidence ' + conf + '%). ' +
        'Rhythm coefficient of variation is ' + cv + ' (lower is steadier); cadence ' + (mov.cadencia_ppm != null ? Math.round(mov.cadencia_ppm) : '?') + ' steps/min, lateral symmetry ' + (mov.simetria_lateral != null ? Math.round(mov.simetria_lateral * 100) + '%' : 'n/a') + '. ' +
        'Weighted score: ' + (f.puntaje_total != null ? f.puntaje_total.toFixed(1) : '—') + '/100' + (f.ranking ? ', current rank #' + f.ranking + ' in the category.' : '.') +
        (c.es_modalidad_valida === false ? ' WARNING: detected gait does not match the entered category.' : '');
    }
    return 'El caballo presenta una marcha de ' + mod + ' con ' + c.tiempos + ' tiempos y apoyos ' + c.patron + ' (confianza ' + conf + '%). ' +
      'El coeficiente de variación del ritmo es ' + cv + ' (más bajo = más parejo); cadencia ' + (mov.cadencia_ppm != null ? Math.round(mov.cadencia_ppm) : '?') + ' pisadas/min, simetría lateral ' + (mov.simetria_lateral != null ? Math.round(mov.simetria_lateral * 100) + '%' : 'n/d') + '. ' +
      'Puntaje ponderado: ' + (f.puntaje_total != null ? f.puntaje_total.toFixed(1) : '—') + '/100' + (f.ranking ? ', puesto actual #' + f.ranking + ' en la categoría.' : '.') +
      (c.es_modalidad_valida === false ? ' ATENCIÓN: la modalidad detectada no coincide con la categoría inscrita.' : '');
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- Boot ----
  applyI18n(); langToggle(); setBadge();
  ensureToken().then(setBadge);
  loadEventos();
  bindSelectors();
  bindEvaluar();
})();
