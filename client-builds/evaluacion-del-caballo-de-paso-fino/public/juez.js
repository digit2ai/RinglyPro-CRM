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
    return fetch(CHAMP + '/eventos', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (rows) {
      fillSelect('eventoSel', rows, 'sel_evento', function (e) { return e.nombre + ' (' + (e.anio || '') + ')'; });
      return rows;
    }).catch(function () { return []; });
  }
  function loadCategorias(evento_id) {
    return fetch(CHAMP + '/categorias?evento_id=' + evento_id, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (rows) {
      fillSelect('categoriaSel', rows, 'sel_categoria', function (c) { return c.nombre + ' · ' + modLabel(c.modalidad); });
      return rows;
    }).catch(function () { return []; });
  }
  function loadInscripciones(categoria_id) {
    return fetch(CHAMP + '/inscripciones?categoria_id=' + categoria_id, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (rows) {
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
      {
        fetch(CHAMP + '/demo-setup', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
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
      }
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
      var videoFile = $('video').files[0];
      var audioFile = $('audio').files[0];
      var demoMod = $('demoModSel').value;
      // Análisis REAL = se subió un AUDIO de la pasada (1 crédito, requiere cuenta).
      // El video es solo para el reproductor. Sin audio = simulación GRATIS.
      var isReal = !!audioFile;
      if (isReal && (!window.ECPFAccount || !window.ECPFAccount.isLoggedIn())) {
        location.href = BASE + 'login?next=' + encodeURIComponent(location.pathname);
        return;
      }
      var btn = this; btn.disabled = true;
      fakeProgress();
      {
        var fd = new FormData();
        fd.append('inscripcion_id', inscripcion_id);
        fd.append('superficie', $('superficieSel').value);
        if (isReal) {
          fd.append('audio', audioFile);
          if (videoFile) fd.append('video', videoFile);
        } else {
          fd.append('demo_modalidad', demoMod || 'paso_fino'); // simulación gratis
        }
        fetch(CHAMP + '/sessions', { method: 'POST', credentials: 'same-origin', body: fd })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
          .then(function (res) {
            stopProgress(true);
            btn.disabled = false;
            if (res.status === 401) { location.href = BASE + 'login?next=' + encodeURIComponent(location.pathname); return; }
            if (res.status === 402) { progress(0, I18N.err_no_credits || 'Sin créditos.'); if (window.ECPFAccount) window.ECPFAccount.openRecharge(); return; }
            if (!res.ok) { progress(0, (res.j && res.j.error) || 'error'); return; }
            setTimeout(function () { $('progressWrap').classList.add('hidden'); }, 600);
            if (res.j.credits != null && window.ECPFAccount) window.ECPFAccount.setCount(res.j.credits);
            renderFallo(res.j, videoFile);
          })
          .catch(function (e) { stopProgress(false); btn.disabled = false; progress(0, String(e)); });
      }
    });
  }

  // ---- Infographics ----
  var EM = { turf: '#5FD08B', brass: '#E6C572', amber: '#D98A3E', red: '#CE4C3B', muted: '#98A199' };
  function scoreColor(p) { if (p >= 85) return EM.turf; if (p >= 70) return EM.brass; if (p >= 45) return EM.amber; return EM.red; }
  function pctOr(v) { return v != null ? Math.round(v * 100) : null; }
  function gaugeSVG(pct, valueText, label, color) {
    pct = Math.max(0, Math.min(100, pct || 0));
    var C = 2 * Math.PI * 42, off = C * (1 - pct / 100);
    return '<div style="background:#0e120c;border:1px solid rgba(236,230,218,.08);border-radius:14px;padding:12px;display:flex;flex-direction:column;align-items:center">' +
      '<svg viewBox="0 0 100 100" style="width:78px;height:78px">' +
      '<circle cx="50" cy="50" r="42" fill="none" stroke="rgba(236,230,218,.10)" stroke-width="8"/>' +
      '<circle cx="50" cy="50" r="42" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 50 50)" style="transition:stroke-dashoffset .9s cubic-bezier(.22,.61,.36,1)"/>' +
      '<text x="50" y="55" text-anchor="middle" fill="#ECE6DA" font-family="JetBrains Mono,monospace" font-size="19" font-weight="600">' + valueText + '</text></svg>' +
      '<div style="font-size:11px;margin-top:6px;text-align:center;color:#98A199">' + esc(label) + '</div></div>';
  }
  function renderInfographics(mov, son) {
    var box = $('infographics'); if (!box) return;
    var clar = (son && son.claridad_4_tiempos != null) ? son.claridad_4_tiempos : mov.uniformidad_4_tiempos;
    var elev = (mov.elevacion_anterior != null || mov.elevacion_posterior != null) ? Math.round(((mov.elevacion_anterior || 0) + (mov.elevacion_posterior || 0)) / 2 * 100) : null;
    var items = [
      { pct: pctOr(mov.regularidad_ritmo), label: I18N.m_regularidad || 'Regularidad' },
      { pct: pctOr(mov.simetria_lateral), label: I18N.m_simetria || 'Simetría lateral' },
      { pct: pctOr(clar), label: I18N.m_claridad || 'Claridad 4 tiempos' },
      { pct: elev, label: I18N.m_elevacion || 'Elevación' }
    ];
    box.innerHTML = items.map(function (it) { var p = it.pct != null ? it.pct : 0; return gaugeSVG(p, it.pct != null ? it.pct + '%' : '—', it.label, scoreColor(p)); }).join('');
  }
  function renderCadenceMeter(cad) {
    var box = $('cadenceMeter'); if (!box) return;
    if (cad == null) { box.innerHTML = ''; return; }
    var MIN = 120, MAX = 280, ILO = 150, IHI = 210;
    var pos = (Math.max(MIN, Math.min(MAX, cad)) - MIN) / (MAX - MIN) * 100;
    var ilo = (ILO - MIN) / (MAX - MIN) * 100, ihi = (IHI - MIN) / (MAX - MIN) * 100;
    var ok = cad >= MIN && cad <= MAX;
    box.innerHTML =
      '<div class="flex justify-between text-xs mb-1"><span style="color:#98A199">' + (I18N.m_cadencia || 'Cadencia') + ' (ppm)</span>' +
      '<span class="mono" style="color:' + (ok ? EM.turf : EM.amber) + '">' + Math.round(cad) + ' ppm</span></div>' +
      '<div style="position:relative;height:14px;border-radius:99px;background:rgba(236,230,218,.08)">' +
      '<div style="position:absolute;top:0;bottom:0;left:' + ilo.toFixed(1) + '%;width:' + (ihi - ilo).toFixed(1) + '%;background:rgba(95,208,139,.22);border-radius:99px"></div>' +
      '<div style="position:absolute;top:-3px;bottom:-3px;left:' + pos.toFixed(1) + '%;transform:translateX(-50%);width:3px;border-radius:2px;background:' + EM.brass + ';box-shadow:0 0 8px ' + EM.brass + '"></div></div>' +
      '<div class="flex justify-between mono" style="font-size:10px;color:#697268;margin-top:4px"><span>120</span><span>ideal ~180</span><span>280</span></div>';
  }

  var currentSesionId = null, currentSummary = '';
  function renderFallo(f, videoFile) {
    var card = $('result'); card.classList.remove('hidden');
    currentSesionId = f.sesion_id || null;
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
    var son = f.metricas_sonido || {};
    renderInfographics(mov, son);
    renderCadenceMeter(mov.cadencia_ppm);

    // Desglose por criterio (barras) — coloreadas por severidad.
    var bd = $('breakdown'); bd.innerHTML = '';
    (f.puntuaciones || []).forEach(function (p) {
      var row = document.createElement('div');
      var pct = Math.max(0, Math.min(100, p.puntaje_normalizado || 0));
      var col = scoreColor(pct);
      row.innerHTML = '<div class="flex justify-between text-xs mb-1"><span>' + esc(p.nombre) + ' <span style="color:#697268">(' + p.peso_porcentaje + '%)</span></span><span class="mono" style="color:' + col + '">' + pct.toFixed(0) + '/100</span></div>' +
        '<div style="height:8px;background:rgba(236,230,218,.08);border-radius:99px;overflow:hidden"><div style="height:100%;border-radius:99px;width:' + pct + '%;background:' + col + '"></div></div>';
      bd.appendChild(row);
    });

    // Línea de tiempo de pisadas.
    renderTimeline(f.pisadas || []);

    // Video.
    var vp = $('videoPlayer');
    if (videoFile) { vp.src = URL.createObjectURL(videoFile); vp.classList.remove('hidden'); } else { vp.classList.add('hidden'); }

    // Neural Intelligence: panel de hallazgos.
    renderNeural(f.neural_findings || []);

    // Dictamen profesional estructurado (server-side).
    renderDictamen(f.dictamen);

    // Share: build the summary + reveal the button + make the result a permalink.
    currentSummary = (I18N.share_summary || 'Fallo del juez EquiMind') + ' — ' +
      modLabel(clas.modalidad_detectada) + ' ' + (f.puntaje_total != null ? f.puntaje_total.toFixed(1) + '/100' : '') +
      (f.ranking ? ' · ' + (I18N.res_ranking || 'Puesto') + ' #' + f.ranking : '');
    var sb = $('shareBtn');
    if (sb) { if (currentSesionId != null) sb.classList.remove('hidden'); else sb.classList.add('hidden'); }
    if (currentSesionId != null) { try { history.replaceState(null, '', BASE + 'juez?session=' + currentSesionId + '&lang=' + LANG); } catch (e) {} }

    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function shareUrl() { return location.origin + BASE + 'juez?session=' + currentSesionId + '&lang=' + LANG; }
  function bindShare() {
    var sb = $('shareBtn'); if (!sb) return;
    sb.addEventListener('click', function () {
      if (currentSesionId == null) return;
      var url = shareUrl(), msg = $('shareMsg');
      var data = { title: 'EquiMind', text: currentSummary, url: url };
      if (navigator.share) {
        navigator.share(data).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(currentSummary + ' ' + url).then(function () {
          if (msg) { msg.textContent = I18N.share_copied || 'Enlace copiado'; setTimeout(function () { msg.textContent = ''; }, 2500); }
        }).catch(function () {});
      } else {
        window.prompt(I18N.share_copy_prompt || 'Copia el enlace:', url);
      }
    });
  }

  // Load a persisted session (shareable permalink ?session=ID) read-only.
  function loadSharedSession() {
    var id = new URLSearchParams(location.search).get('session');
    if (!id) return;
    fetch(CHAMP + '/sessions/' + encodeURIComponent(id) + '?lang=' + LANG, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.sesion) return;
        var clas = j.clasificacion || {};
        if (j.categoria) clas.modalidad_categoria = j.categoria.modalidad;
        renderFallo({
          sesion_id: j.sesion.id,
          clasificacion: clas,
          metricas_movimiento: j.metricas_movimiento || {},
          metricas_sonido: j.metricas_sonido || {},
          puntuaciones: j.puntuaciones || [],
          pisadas: j.pisadas || [],
          puntaje_total: j.resultado ? j.resultado.puntaje_total : null,
          ranking: j.resultado ? j.resultado.ranking : null,
          dictamen: j.dictamen,
          neural_findings: j.neural_findings || []
        }, null);
      }).catch(function () {});
  }

  var IMPACT_LABEL = {
    critical: { es: 'Crítico', en: 'Critical' }, high: { es: 'Alto', en: 'High' },
    medium: { es: 'Medio', en: 'Medium' }, low: { es: 'Bajo', en: 'Low' }, info: { es: 'Info', en: 'Info' }
  };
  function impactLabel(i) { return (IMPACT_LABEL[i] && IMPACT_LABEL[i][LANG]) || i; }

  function renderNeural(findings) {
    var panel = $('neuralPanel'); if (!panel) return;
    panel.innerHTML = '';
    var counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    findings.forEach(function (f) { if (counts[f.impact] != null) counts[f.impact]++; });
    var cEl = $('neuralCounts');
    if (cEl) {
      if (!findings.length) cEl.textContent = (I18N.neural_clean || 'Sin alertas');
      else cEl.textContent = (counts.critical ? counts.critical + ' ' + impactLabel('critical') + ' · ' : '') +
        (counts.high ? counts.high + ' ' + impactLabel('high') + ' · ' : '') + findings.length + ' ' + (I18N.neural_total || 'hallazgos');
    }
    if (!findings.length) {
      panel.innerHTML = '<div class="finding info text-sm text-slate-400">' + esc(I18N.neural_none || 'No se detectaron hallazgos para esta marcha.') + '</div>';
      return;
    }
    findings.forEach(function (fd) {
      var el = document.createElement('div');
      el.className = 'finding ' + (fd.impact || 'info');
      var action = fd.recommended_action ? '<div class="text-xs text-slate-400 mt-2"><span class="text-slate-500">' + esc(I18N.neural_action || 'Acción recomendada') + ':</span> ' + esc(fd.recommended_action) + '</div>' : '';
      var est = fd.impact_estimate ? '<span class="text-xs text-slate-500 mono">' + esc(fd.impact_estimate) + '</span>' : '';
      el.innerHTML =
        '<div class="flex items-center justify-between gap-2 mb-1">' +
          '<div class="flex items-center gap-2 flex-wrap"><span class="chip ' + (fd.impact || 'info') + '">' + esc(impactLabel(fd.impact)) + '</span>' +
          '<span class="mono text-xs text-slate-500">' + esc(fd.code) + '</span></div>' + est + '</div>' +
        '<div class="text-sm font-semibold text-slate-100">' + esc(fd.title) + '</div>' +
        '<div class="text-xs text-slate-400 mt-1">' + esc(fd.summary) + '</div>' + action;
      panel.appendChild(el);
    });
  }

  function renderDictamen(d) {
    var box = $('resDictamen'), res = $('resResumen'), reco = $('resReco'), firma = $('resFirma');
    if (!box) return;
    box.innerHTML = ''; if (reco) reco.innerHTML = '';
    if (!d) { if (res) res.textContent = ''; return; }
    if (res) res.textContent = d.resumen || '';
    if (d.veredicto) {
      var lead = document.createElement('div');
      lead.className = 'text-xs text-slate-300';
      lead.textContent = d.veredicto;
      box.appendChild(lead);
    }
    (d.secciones || []).forEach(function (s) {
      var el = document.createElement('div');
      el.className = 'dsec ' + (s.nivel || 'info');
      el.innerHTML = '<div class="text-xs font-semibold text-slate-200 mb-0.5">' + esc(s.titulo) + '</div>' +
        '<div class="text-xs text-slate-400" style="white-space:pre-line">' + esc(s.cuerpo) + '</div>';
      box.appendChild(el);
    });
    if (reco && d.recomendaciones && d.recomendaciones.length) {
      var h = '<div class="text-xs font-semibold text-indigo-300 mb-1">' + esc(I18N.res_reco || 'Recomendaciones') + '</div><ul class="list-disc list-inside text-xs text-slate-300 space-y-1">';
      d.recomendaciones.forEach(function (r) { h += '<li>' + esc(r) + '</li>'; });
      reco.innerHTML = h + '</ul>';
    }
    if (firma) firma.textContent = d.firma || '';
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


  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- Boot ----
  applyI18n(); langToggle(); setBadge();
  loadEventos();
  bindSelectors();
  bindEvaluar();
  bindShare();
  loadSharedSession();
})();
