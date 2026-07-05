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

  function $(id) { return document.getElementById(id); }
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) { var k = el.getAttribute('data-i18n'); if (I18N[k] != null) el.textContent = I18N[k]; });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) { var k = el.getAttribute('data-i18n-ph'); if (I18N[k] != null) el.setAttribute('placeholder', I18N[k]); });
  }
  function langToggle() {
    var el = $('langToggle'); if (!el) return;
    el.addEventListener('click', function () { var u = new URL(location.href); u.searchParams.set('lang', LANG === 'es' ? 'en' : 'es'); location.href = u.toString(); });
  }

  var MODALIDAD_LABEL = {
    paso_fino: { es: 'Paso fino', en: 'Paso fino' },
    trocha: { es: 'Trocha', en: 'Trocha' },
    trote_galope: { es: 'Trote / galope', en: 'Trot / canter' },
    trocha_galope: { es: 'Trocha y galope', en: 'Trocha and canter' }
  };
  function modLabel(m) { return (MODALIDAD_LABEL[m] && MODALIDAD_LABEL[m][LANG]) || (m || '—'); }


  // ---- Caballos del cliente (select o alta) ----
  function loadHorses() {
    return fetch(CHAMP + '/horses', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var sel = $('horseSel'); if (!sel) return rows;
        var cur = sel.value;
        sel.innerHTML = '';
        var ph = document.createElement('option'); ph.value = ''; ph.textContent = I18N.horse_pick || 'Elige tu caballo'; sel.appendChild(ph);
        (rows || []).forEach(function (c) { var o = document.createElement('option'); o.value = c.id; o.textContent = c.nombre + (c.criadero ? (' · ' + c.criadero) : ''); sel.appendChild(o); });
        if (cur) sel.value = cur;
        return rows;
      }).catch(function () { return []; });
  }
  function bindHorseControls() {
    var toggle = $('horseNewToggle'), form = $('horseNewForm');
    if (toggle && form) toggle.addEventListener('click', function () { form.classList.toggle('hidden'); });
    var save = $('hnSave');
    if (save) save.addEventListener('click', function () {
      var nombre = ($('hnNombre').value || '').trim();
      if (!nombre) { $('hnNombre').focus(); return; }
      save.disabled = true;
      fetch(CHAMP + '/horses', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre, sexo: $('hnSexo').value || null, capa: ($('hnCapa').value || '').trim() || null, criadero: ($('hnCriadero').value || '').trim() || null })
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
        save.disabled = false;
        if (!c) return;
        $('hnNombre').value = ''; $('hnCapa').value = ''; $('hnCriadero').value = ''; $('hnSexo').value = '';
        $('horseNewForm').classList.add('hidden');
        loadHorses().then(function () { $('horseSel').value = String(c.id); });
      }).catch(function () { save.disabled = false; });
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
      var videoFile = $('video').files[0];
      var audioFile = $('audio').files[0];
      // Análisis REAL = audio real de cascos (del .wav o extraído del video) =
      // 1 crédito. Requiere cuenta. Sin video ni audio = referencia GRATIS.
      if (!window.ECPFAccount || !window.ECPFAccount.isLoggedIn()) {
        location.href = BASE + 'login?next=' + encodeURIComponent(location.pathname);
        return;
      }
      // El análisis se define por VIDEO/AUDIO + CATEGORÍA (disciplina). El caballo
      // es OPCIONAL (etiqueta): si eliges uno o registras nombre lo usamos; si no,
      // el servidor lo archiva como "Sin asignar". No bloquea el análisis.
      var modalidad = $('disciplinaSel') ? $('disciplinaSel').value : 'paso_fino';
      var caballo_id = $('horseSel') ? $('horseSel').value : '';
      var nuevoNombre = ($('hnNombre') && $('hnNombre').value ? $('hnNombre').value : '').trim();
      var btn = this; btn.disabled = true;
      fakeProgress();

      // DOS caminos claros, sin mezclar (no reclasificar el video):
      //  · .wav APARTE de cascos -> análisis REAL de audio (1 crédito).
      //  · solo VIDEO (sin .wav) -> se evalúa como la DISCIPLINA seleccionada
      //    (referencia, gratis). El audio de un video de celular NO es audio
      //    limpio de cascos: no distingue lateral/diagonal ni da simetría/elevación
      //    (eso requiere pose de video). Se envía `modalidad`, no audio extraído.
      var fd = new FormData();
      if (caballo_id) fd.append('caballo_id', caballo_id);
      else {
        fd.append('caballo_nombre', nuevoNombre);
        if ($('hnSexo').value) fd.append('caballo_sexo', $('hnSexo').value);
        if ($('hnCapa').value) fd.append('caballo_capa', $('hnCapa').value.trim());
        if ($('hnCriadero').value) fd.append('caballo_criadero', $('hnCriadero').value.trim());
      }
      fd.append('modalidad', modalidad);
      fd.append('superficie', $('superficieSel').value);
      if (audioFile) fd.append('audio', audioFile); // solo un .wav aparte cuenta como audio real
      if (videoFile) fd.append('video', videoFile);
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
          loadHorses(); loadMyHistory();
        })
        .catch(function (e) { stopProgress(false); btn.disabled = false; progress(0, String(e)); });
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
    // Simetría lateral y Elevación se derivan de la POSE del video. En lugar de
    // DOS tarjetas gigantes vacías, mostramos los gauges medibles arriba y UN
    // solo aviso compacto (full-width) que lista las métricas pendientes de pose.
    var items = [
      { pct: pctOr(mov.regularidad_ritmo), label: I18N.m_regularidad || 'Regularidad', pose: false },
      { pct: pctOr(mov.simetria_lateral), label: I18N.m_simetria || 'Simetría lateral', pose: true },
      { pct: pctOr(clar), label: I18N.m_claridad || 'Claridad 4 tiempos', pose: false },
      { pct: elev, label: I18N.m_elevacion || 'Elevación', pose: true }
    ];
    var gauges = [], pending = [];
    items.forEach(function (it) {
      if (it.pct == null && it.pose) { pending.push(it.label); }
      else if (it.pct == null) { gauges.push(gaugeSVG(0, '—', it.label, EM.muted)); }
      else { gauges.push(gaugeSVG(it.pct, it.pct + '%', it.label, scoreColor(it.pct))); }
    });
    var html = gauges.join('');
    if (pending.length) {
      html += '<div style="grid-column:1 / -1;border:1px dashed rgba(236,230,218,.16);border-radius:12px;padding:11px 14px;display:flex;align-items:center;gap:10px;color:#98A199;font-size:12.5px;line-height:1.35">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#98A199" stroke-width="2" style="flex:none"><path d="M15 10l-4 4-2-2"/><circle cx="12" cy="12" r="9"/></svg>' +
        '<span><strong style="color:#cbd5e1">' + pending.map(esc).join(' · ') + '</strong> — ' + (I18N.pose_pending_note || 'requieren pose de video (próximamente)') + '</span></div>';
    }
    box.innerHTML = html;
  }
  function renderCadenceMeter(cad, band) {
    var box = $('cadenceMeter'); if (!box) return;
    if (cad == null) { box.innerHTML = ''; return; }
    // Banda REAL por modalidad (del servidor). Fallback a paso fino ~540–760.
    band = band || { min: 540, ideal: 654, max: 760 };
    var MIN = band.min, MAX = band.max, IDEAL = band.ideal;
    // Zona ideal ±5% alrededor del ideal, dentro de la banda.
    var ILO = Math.max(MIN, IDEAL - (MAX - MIN) * 0.08), IHI = Math.min(MAX, IDEAL + (MAX - MIN) * 0.08);
    var confiable = cad >= MIN && cad <= MAX;
    var pos = (Math.max(MIN, Math.min(MAX, cad)) - MIN) / (MAX - MIN) * 100;
    var ilo = (ILO - MIN) / (MAX - MIN) * 100, ihi = (IHI - MIN) / (MAX - MIN) * 100;
    box.innerHTML =
      '<div class="flex justify-between text-xs mb-1"><span style="color:#98A199">' + (I18N.m_cadencia || 'Cadencia') + ' (ppm)</span>' +
      '<span class="mono" style="color:' + (confiable ? EM.turf : EM.amber) + '">' + Math.round(cad) + ' ppm' + (confiable ? '' : ' · ' + (I18N.cadence_unreliable || 'no confiable')) + '</span></div>' +
      '<div style="position:relative;height:14px;border-radius:99px;background:rgba(236,230,218,.08)">' +
      '<div style="position:absolute;top:0;bottom:0;left:' + ilo.toFixed(1) + '%;width:' + Math.max(0, ihi - ilo).toFixed(1) + '%;background:rgba(95,208,139,.22);border-radius:99px"></div>' +
      '<div style="position:absolute;top:-3px;bottom:-3px;left:' + pos.toFixed(1) + '%;transform:translateX(-50%);width:3px;border-radius:2px;background:' + (confiable ? EM.brass : EM.amber) + ';box-shadow:0 0 8px ' + (confiable ? EM.brass : EM.amber) + '"></div></div>' +
      '<div class="flex justify-between mono" style="font-size:10px;color:#697268;margin-top:4px"><span>' + MIN + '</span><span>ideal ~' + IDEAL + '</span><span>' + MAX + '</span></div>' +
      (confiable ? '' : '<div style="font-size:10.5px;color:#D98A3E;margin-top:5px">' + (I18N.cadence_unreliable_note || 'Fuera del rango físico de la modalidad: no se usó en el puntaje. Sube audio más limpio de los cascos.') + '</div>');
  }

  var currentSesionId = null, currentSummary = '', currentShareUrl = '';
  function reportCode(id) { return 'EM-' + String(id).padStart(6, '0'); }
  function renderFallo(f, videoFile) {
    var card = $('result'); card.classList.remove('hidden');
    currentSesionId = f.sesion_id || null;
    // ID del informe (referenciable): EM-000064.
    var idBar = $('reportIdBar'), idEl = $('reportId');
    if (idBar && idEl) {
      if (currentSesionId != null) { idEl.textContent = reportCode(currentSesionId); idBar.classList.remove('hidden'); }
      else { idBar.classList.add('hidden'); }
    }
    var clas = f.clasificacion || {};
    $('resModalidad').textContent = modLabel(clas.modalidad_detectada);
    $('resConf').textContent = '· ' + Math.round((clas.confianza || 0) * 100) + '% ' + (I18N.res_confianza || 'confianza') + ' · ' + (clas.tiempos || '?') + ' ' + (I18N.res_tiempos || 'tiempos') + (f.solo_audio ? ' · ' + (I18N.est_audio || 'estimada por audio') : '');
    $('resTotal').textContent = (f.puntaje_total != null ? f.puntaje_total.toFixed(1) : '—');

    // Banner de referencia: resultado simulado (no analiza el caballo real, gratis).
    var simB = $('simBanner');
    if (simB) {
      if (f.simulado) {
        simB.textContent = I18N.sim_banner || 'Resultado de referencia (simulación). No analiza tu caballo real y no se cobró. Para un análisis real, sube el audio de los cascos (.wav).';
        simB.classList.remove('hidden');
      } else { simB.classList.add('hidden'); }
    }

    var flag = $('resFlag');
    if (clas.es_modalidad_valida === false) {
      // Descalificación REAL (con pose de video): rojo.
      flag.className = 'mb-4 px-3 py-2 rounded-lg bg-rose-600/20 border border-rose-600 text-rose-300 text-sm';
      flag.textContent = (I18N.flag_mismatch || 'La modalidad detectada no coincide con la categoría') + ' (' + modLabel(clas.modalidad_categoria) + ' → ' + modLabel(clas.modalidad_detectada) + ').';
      flag.classList.remove('hidden');
    } else if (f.solo_audio) {
      // Solo-audio: no se descalifica. Nota informativa en ámbar.
      flag.className = 'mb-4 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/60 text-amber-200 text-sm';
      flag.textContent = (I18N.audio_only_note || 'Modalidad estimada por audio (baja confianza): el audio no distingue paso fino de trocha con certeza. Simetría y elevación requieren pose de video (próximamente).');
      flag.classList.remove('hidden');
    } else { flag.classList.add('hidden'); }

    var mov = f.metricas_movimiento || {};
    var son = f.metricas_sonido || {};
    renderInfographics(mov, son);
    renderCadenceMeter(mov.cadencia_ppm, f.cadencia_band);

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

    // Dictamen profesional estructurado (server-side) + gráfico por métrica.
    renderDictamen(f.dictamen, f.puntuaciones || []);

    // Feed the 3D Gaussian Splatting Report generator with THIS analysis:
    // horse name, the weighted gait scores as measurement bars, and the neural
    // findings as report findings. The owner clicks "Generate" — no re-entry.
    try { if (window.GSReport) GSReport.setContext(buildGsContext(f)); } catch (e) {}

    // Share: summary + rellenar la caja de enlace + permalink navegable.
    currentSummary = (I18N.share_summary || 'Fallo del juez EquiMind') + ' — ' +
      modLabel(clas.modalidad_detectada) + ' ' + (f.puntaje_total != null ? f.puntaje_total.toFixed(1) + '/100' : '') +
      (f.ranking ? ' · ' + (I18N.res_ranking || 'Puesto') + ' #' + f.ranking : '');
    // Magic link público (marketing): lo da el servidor (dominio canónico + token).
    currentShareUrl = f.share_url || (f.share_token ? ('https://equimind.app/juez?session=' + currentSesionId + '&k=' + f.share_token) : '');
    var sb = $('shareBtn');
    if (sb) { if (currentSesionId != null) sb.classList.remove('hidden'); else sb.classList.add('hidden'); }
    var link = $('shareLink'); if (link) link.value = currentShareUrl || '';
    if (currentSesionId != null && f.share_token) { try { history.replaceState(null, '', BASE + 'juez?session=' + currentSesionId + '&k=' + f.share_token + '&lang=' + LANG); } catch (e) {} }

    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function shareUrl() { return currentShareUrl || (location.origin + BASE + 'juez?session=' + currentSesionId + '&lang=' + LANG); }
  function flashMsg(id) { var m = $(id); if (m) { m.textContent = I18N.share_copied || 'Enlace copiado'; setTimeout(function () { m.textContent = ''; }, 2500); } }
  // Copia robusta: clipboard API si hay contexto seguro; si no (o iframe sin
  // permiso), fallback execCommand seleccionando el input visible.
  function copyText(text, input, msgId) {
    function legacy() {
      try {
        if (input) { input.removeAttribute('readonly'); input.value = text; input.focus(); input.select(); input.setSelectionRange(0, 99999); }
        var ok = document.execCommand('copy');
        if (input) input.setAttribute('readonly', 'readonly');
        if (ok) flashMsg(msgId); else window.prompt(I18N.share_copy_prompt || 'Copia el enlace:', text);
      } catch (e) { window.prompt(I18N.share_copy_prompt || 'Copia el enlace:', text); }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { flashMsg(msgId); }).catch(legacy);
    } else { legacy(); }
  }
  function bindShare() {
    var sb = $('shareBtn');
    if (sb) sb.addEventListener('click', function () {
      if (currentSesionId == null) return;
      var url = shareUrl();
      if (navigator.share) { navigator.share({ title: 'EquiMind', text: currentSummary, url: url }).catch(function () { copyText(currentSummary + ' ' + url, $('shareLink'), 'shareMsg'); }); }
      else { copyText(currentSummary + ' ' + url, $('shareLink'), 'shareMsg'); }
    });
    var sc = $('shareCopy');
    if (sc) sc.addEventListener('click', function () { if (currentSesionId != null) copyText(shareUrl(), $('shareLink'), 'shareMsg2'); });
    var so = $('shareOpen');
    if (so) so.addEventListener('click', function () { if (currentSesionId != null) window.open(shareUrl(), '_blank', 'noopener'); });
    var ic = $('reportIdCopy');
    if (ic) ic.addEventListener('click', function () {
      if (currentSesionId == null) return;
      var code = reportCode(currentSesionId), m = $('reportIdMsg');
      function ok() { if (m) { m.textContent = I18N.id_copied || 'ID copiado'; setTimeout(function () { m.textContent = ''; }, 2000); } }
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(code).then(ok).catch(function () { window.prompt('', code); }); }
      else { window.prompt('', code); }
    });
  }

  // ---- Mis análisis (historial del cliente) ----
  function loadMyHistory() {
    var tbody = $('histRows'), empty = $('histEmpty');
    if (!tbody || !empty) return;
    fetch(CHAMP + '/my-sessions', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        tbody.innerHTML = '';
        if (!rows || !rows.length) { empty.classList.remove('hidden'); return; }
        empty.classList.add('hidden');
        rows.forEach(function (s) {
          var d = s.fecha ? new Date(s.fecha) : null;
          var dateStr = d ? (d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '—';
          var url = s.share_url || (location.origin + BASE + 'juez?session=' + s.sesion_id + '&lang=' + LANG);
          var tag = s.simulado ? (' <span class="text-amber-400" title="' + (I18N.sim_tag || 'referencia') + '">◦</span>') : '';
          var tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/50';
          tr.innerHTML =
            '<td class="py-2 pr-4 mono text-xs">' + esc(dateStr) + '</td>' +
            '<td class="py-2 pr-4">' + esc(s.caballo || '—') + tag + '</td>' +
            '<td class="py-2 pr-4">' + esc(modLabel(s.modalidad)) + '</td>' +
            '<td class="py-2 pr-4 mono font-bold text-emerald-400">' + (s.puntaje != null ? Number(s.puntaje).toFixed(1) : '—') + '</td>' +
            '<td class="py-2 pr-4"><a href="' + url + '" target="_blank" rel="noopener" class="text-indigo-300 hover:text-indigo-200 underline">' + (I18N.hist_open || 'Ver informe') + ' ↗</a></td>';
          tbody.appendChild(tr);
        });
      }).catch(function () {});
  }
  function bindHistoryActions() {
    var hr = $('histRefresh'); if (hr) hr.addEventListener('click', loadMyHistory);
    var na = $('newAnalysis');
    if (na) na.addEventListener('click', function () {
      currentSesionId = null;
      var res = $('result'); if (res) res.classList.add('hidden');
      var v = $('video'); if (v) v.value = ''; var a = $('audio'); if (a) a.value = '';
      try { history.replaceState(null, '', BASE + 'juez?lang=' + LANG); } catch (e) {}
      var up = document.querySelector('[data-i18n="up_title"]'); if (up) up.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    var gh = $('goHistory');
    if (gh) gh.addEventListener('click', function () { loadMyHistory(); var h = $('historySection'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  // Load a persisted session (shareable permalink ?session=ID) read-only.
  // Oculta los controles de entrada: es un INFORME COMPLETO para revisar/compartir.
  function loadSharedSession() {
    var qs = new URLSearchParams(location.search);
    var id = qs.get('session');
    if (!id) return;
    var k = qs.get('k');
    // Ocultar secciones de carga y de historial en el informe compartido.
    document.querySelectorAll('section').forEach(function (sec) {
      if (sec.querySelector('#horseSel') || sec.querySelector('#evaluar') || sec.id === 'historySection' || sec.querySelector('#sessionBadge')) {
        if (sec.id !== 'result') sec.classList.add('hidden');
      }
    });
    // Acciones de dueño no aplican a un visitante del informe.
    ['newAnalysis', 'goHistory'].forEach(function (bid) { var b = $(bid); if (b) b.classList.add('hidden'); });
    // Mostrar el CTA de marketing (a menos que el visitante ya tenga sesión).
    // El generador de informe 3D es una acción de dueño: se oculta a visitantes anónimos.
    if (!window.ECPFAccount || !window.ECPFAccount.isLoggedIn()) {
      var cta = $('marketingCta'); if (cta) cta.classList.remove('hidden');
      ['gsReportTop', 'gsReportBottom'].forEach(function (bid) { var b = $(bid); if (b) b.classList.add('hidden'); });
    }
    var url = CHAMP + '/sessions/' + encodeURIComponent(id) + '?lang=' + LANG + (k ? ('&k=' + encodeURIComponent(k)) : '');
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) { showShareError(r.status); return null; } return r.json(); })
      .then(function (j) {
        if (!j || !j.sesion) return;
        var clas = j.clasificacion || {};
        if (j.categoria) clas.modalidad_categoria = j.categoria.modalidad;
        renderFallo({
          simulado: j.simulado,
          solo_audio: j.solo_audio,
          cadencia_band: j.cadencia_band,
          share_token: j.share_token, share_url: j.share_url,
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
  function showShareError(status) {
    var res = $('result'); if (!res) return;
    res.classList.remove('hidden');
    res.innerHTML = '<div class="text-center py-8"><div class="text-lg font-bold mb-2">' +
      (status === 403 ? (I18N.share_invalid || 'Enlace no válido o expirado.') : (I18N.share_notfound || 'Informe no encontrado.')) +
      '</div><a href="' + BASE + 'inicio" class="text-indigo-300 underline">EquiMind →</a></div>';
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

  // Build the 3D-report context from a gait analysis: horse name, the weighted
  // scores as measurement bars, and neural findings as report findings.
  function buildGsContext(f) {
    var horseName = '';
    var hsel = $('horseSel');
    if (hsel && hsel.value && hsel.selectedOptions && hsel.selectedOptions[0]) horseName = hsel.selectedOptions[0].textContent.split(' · ')[0].trim();
    if (!horseName) horseName = f.caballo_nombre || f.caballo || '';
    var measurements = (f.puntuaciones || []).map(function (p) {
      var sc = Math.max(0, Math.min(100, p.puntaje_normalizado || 0));
      return { key: String(p.nombre || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40), label: p.nombre, value: sc.toFixed(0) + '/100', cm: sc, lo: 0, hi: 100, ideal_lo: 70, ideal_hi: 100, at: sc, status: sc >= 70 ? 'ok' : (sc >= 45 ? 'info' : 'watch') };
    });
    var findings = (f.neural_findings || []).map(function (fd) {
      var kind = (fd.impact === 'critical' || fd.impact === 'high') ? 'watch' : 'info';
      var detail = fd.summary || ''; if (fd.recommended_action) detail += (detail ? ' — ' : '') + fd.recommended_action;
      return { kind: kind, title: fd.title || fd.code || '', detail: detail };
    });
    if (!findings.length && f.dictamen && f.dictamen.resumen) {
      findings.push({ kind: 'info', title: modLabel((f.clasificacion || {}).modalidad_detectada) + (f.puntaje_total != null ? (' · ' + f.puntaje_total.toFixed(1) + '/100') : ''), detail: f.dictamen.resumen });
    }
    return { horseName: horseName, measurements: measurements, findings: findings, captureSeconds: f.duracion_seg || f.video_seconds || null };
  }

  // Match a dictamen section to its numeric score: by criterion name first, then
  // by a uniquely-weighted "(NN%)" tag in the title.
  function matchScore(titulo, puntuaciones) {
    var t = String(titulo || '').toLowerCase();
    for (var i = 0; i < puntuaciones.length; i++) {
      var n = String(puntuaciones[i].nombre || '').toLowerCase();
      if (n && t.indexOf(n) >= 0) return puntuaciones[i];
    }
    var m = String(titulo || '').match(/\((\d+)\s*%\)/);
    if (m) { var w = +m[1]; var hits = puntuaciones.filter(function (p) { return +p.peso_porcentaje === w; }); if (hits.length === 1) return hits[0]; }
    return null;
  }
  // A compact score graph: quality-zoned track (red/amber/brass/turf) + a marker
  // at the score + numeric label. Zones mirror scoreColor() thresholds.
  function metricGraph(pct, weight) {
    pct = Math.max(0, Math.min(100, pct));
    var col = scoreColor(pct);
    var zones = 'linear-gradient(90deg,' +
      'rgba(197,106,78,.30) 0%,rgba(197,106,78,.30) 45%,' +
      'rgba(230,197,114,.24) 45%,rgba(230,197,114,.24) 70%,' +
      'rgba(201,162,75,.30) 70%,rgba(201,162,75,.30) 85%,' +
      'rgba(95,167,114,.34) 85%,rgba(95,167,114,.34) 100%)';
    return '<div class="mt-2 mb-1">' +
      '<div style="position:relative;height:12px;border-radius:99px;overflow:hidden;background:' + zones + '">' +
        '<div style="position:absolute;left:calc(' + pct + '% - 1.5px);top:-1px;bottom:-1px;width:3px;background:' + col + ';box-shadow:0 0 6px ' + col + '"></div>' +
      '</div>' +
      '<div class="flex justify-between items-center mt-1">' +
        '<span class="text-[10px] mono" style="color:#697268">0 · 45 · 70 · 85 · 100</span>' +
        '<span class="text-[11px] mono font-semibold" style="color:' + col + '">' + pct.toFixed(0) + '/100' + (weight != null ? (' · ' + weight + '%') : '') + '</span>' +
      '</div>' +
    '</div>';
  }

  function renderDictamen(d, puntuaciones) {
    puntuaciones = puntuaciones || [];
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
      var graph = '';
      var sc = matchScore(s.titulo, puntuaciones);
      if (sc) graph = metricGraph(sc.puntaje_normalizado || 0, sc.peso_porcentaje);
      el.innerHTML = '<div class="text-xs font-semibold text-slate-200 mb-0.5">' + esc(s.titulo) + '</div>' +
        '<div class="text-xs text-slate-400" style="white-space:pre-line">' + esc(s.cuerpo) + '</div>' + graph;
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
  applyI18n(); langToggle();
  bindHorseControls();
  bindEvaluar();
  bindShare();
  bindHistoryActions();
  // Vista de informe compartido (?session=ID) vs. flujo normal.
  var sharedId = new URLSearchParams(location.search).get('session');
  if (sharedId) {
    loadSharedSession();
  } else {
    loadHorses();
    loadMyHistory();
  }
})();
