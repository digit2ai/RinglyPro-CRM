/* =====================================================
 * AI Jump Coach — Rider Pose Analyzer (browser)
 *
 * Premium equestrian UI wired to the real pipeline:
 *   1. MediaPipe Pose (tasks-vision, CDN) samples the uploaded video at ~5fps.
 *   2. POST { filename, durationSec, frames } to /api/v1/analyses with the horse
 *      account token (?token=), which debits 1 credit (unified credits).
 *   3. Render into the arc timeline + fault cards + the real <video> with a
 *      skeleton overlay. Synthetic keypoint fallback if the model can't load.
 * ===================================================== */
(function () {
  'use strict';

  var MP_VER = '0.10.14';
  var MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER;
  var MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  var SAMPLE_FPS = 5;
  var MAX_FRAMES = 320;

  var I18N = window.__I18N || {};
  var LANG = (window.__LANG === 'en') ? 'en' : 'es';
  var BASE = window.__BASE || '/';
  var EN = LANG === 'en';

  var $ = function (id) { return document.getElementById(id); };
  var fileInput = $('file'), analyzeBtn = $('analyze'), statusEl = $('status');
  var resultsEl = $('results'), player = $('player'), faultList = $('faultList');
  var loginNotice = $('loginNotice'), faultCount = $('faultCount');
  var apexVal = $('apexVal'), pins = $('pins'), apexMarker = $('apexMarker'), arcEnd = $('arcEnd');
  var fileName = $('fileName'), playBtn = $('play'), playIcon = $('playIcon'), timeEl = $('time'), track = $('track'), played = $('played');
  var dz = $('dz'), dzTitle = $('dzTitle'), dzSub = $('dzSub');

  var frames = [], overlayCanvas = null, lastFaults = [], DUR = 0;

  // ---- fault metadata (self-contained, bilingual) --------------------------
  var FAULT_META = {
    gaze_drop:    { sev: 'high', es: ['Mirada baja anticipada', 'La cabeza cae antes del ápice'],       en: ['Premature gaze drop', 'Head drops before the apex'] },
    left_behind:  { sev: 'high', es: ['Quedarse atrás', 'El torso se retrasa tras el ápice'],           en: ['Left behind', 'Torso lags after the apex'] },
    dropped_rein: { sev: 'mid',  es: ['Mano de rienda caída', 'Muñeca por debajo del codo en el ascenso'], en: ['Dropped rein hand', 'Wrist below elbow on the ascent'] },
    forward_seat: { sev: 'mid',  es: ['Asiento adelantado', 'La cadera se adelanta al tobillo al aterrizar'], en: ['Forward seat', 'Hip ahead of ankle at landing'] }
  };
  var SEV_COLOR = { high: 'var(--sev-high)', mid: 'var(--sev-mid)', low: 'var(--sev-low)' };
  function sevLabel(sev) { return sev === 'high' ? (EN ? 'Critical' : 'Crítico') : (EN ? 'Moderate' : 'Moderado'); }
  function faultName(type) { var m = FAULT_META[type]; return m ? m[LANG][0] : type; }
  function faultSub(type) { var m = FAULT_META[type]; return m ? m[LANG][1] : ''; }
  function faultSev(type) { var m = FAULT_META[type]; return m ? m.sev : 'low'; }

  // ---- i18n ----------------------------------------------------------------
  function t(key) { return (I18N && I18N[key]) || key; }
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) { var k = el.getAttribute('data-i18n'); if (I18N[k]) el.textContent = I18N[k]; });
    var sel = $('langSel');
    if (sel) { sel.value = LANG; sel.addEventListener('change', function () { var u = new URL(location.href); u.searchParams.set('lang', sel.value); location.href = u.toString(); }); }
  }

  function getToken() {
    try { var q = new URL(location.href).searchParams.get('token'); if (q) return q; } catch (e) {}
    try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
  }
  function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }

  // ---- MediaPipe load ------------------------------------------------------
  var landmarkerPromise = null;
  function loadLandmarker() {
    if (landmarkerPromise) return landmarkerPromise;
    landmarkerPromise = (async function () {
      var vision = await import(MP_BASE + '/vision_bundle.mjs');
      var fileset = await vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
      return await vision.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 });
    })();
    return landmarkerPromise;
  }
  function seekTo(video, time) {
    return new Promise(function (resolve) { var d = function () { video.removeEventListener('seeked', d); resolve(); }; video.addEventListener('seeked', d); video.currentTime = Math.min(time, Math.max(0, (video.duration || 0) - 0.001)); });
  }
  async function extractFramesWithModel(video) {
    var lm = await loadLandmarker(); var dur = video.duration || 0; var out = []; var step = 1 / SAMPLE_FPS;
    var count = Math.min(MAX_FRAMES, Math.max(1, Math.floor(dur / step)));
    for (var i = 0; i < count; i++) {
      var time = i * step; await seekTo(video, time);
      var res = lm.detectForVideo(video, Math.round(time * 1000));
      var lms = (res && res.landmarks && res.landmarks[0]) || null;
      var kps = lms ? lms.map(function (p) { return { x: p.x, y: p.y, z: p.z || 0, visibility: (p.visibility != null ? p.visibility : 1) }; }) : [];
      out.push({ t: Math.round(time * 1000) / 1000, keypoints: kps });
    }
    return out;
  }
  function syntheticFrames(video) {
    var dur = video.duration || 6; var step = 1 / SAMPLE_FPS; var count = Math.min(MAX_FRAMES, Math.max(8, Math.floor(dur / step))); var out = [];
    for (var i = 0; i < count; i++) {
      var time = i * step; var phase = i / (count - 1); var arc = Math.sin(phase * Math.PI);
      var baseY = 0.62 - 0.22 * arc; var travelX = 0.30 + 0.40 * phase; var forward = phase > 0.55 ? (phase - 0.55) * 0.5 : 0;
      var kp = new Array(33).fill(null).map(function () { return { x: travelX, y: baseY, z: 0, visibility: 1 }; });
      function set(idx, x, y) { kp[idx] = { x: travelX + x, y: baseY + y, z: 0, visibility: 1 }; }
      set(0, forward * 0.6, -0.20); set(2, forward * 0.6, -0.21); set(5, forward * 0.6, -0.21);
      set(11, forward, -0.10); set(12, forward, -0.10); set(13, forward * 0.8, -0.02); set(14, forward * 0.8, -0.02);
      set(15, forward * 0.8, 0.04 + arc * 0.04); set(16, forward * 0.8, 0.04 + arc * 0.04);
      set(23, forward, 0.00); set(24, forward, 0.00); set(25, 0, 0.12); set(26, 0, 0.12); set(27, 0, 0.26); set(28, 0, 0.26);
      out.push({ t: Math.round(time * 1000) / 1000, keypoints: kp });
    }
    return out;
  }

  // ---- skeleton overlay ----------------------------------------------------
  var CONNECTIONS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[0,11],[0,12]];
  function ensureOverlay() {
    if (overlayCanvas) return overlayCanvas;
    var stage = player.parentNode; // .video-stage (position:relative)
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    player.parentNode.insertBefore(overlayCanvas, player.nextSibling);
    return overlayCanvas;
  }
  function nearestFrame(time) {
    if (!frames.length) return null; var best = frames[0], bd = Infinity;
    for (var i = 0; i < frames.length; i++) { var d = Math.abs(frames[i].t - time); if (d < bd) { bd = d; best = frames[i]; } }
    return best;
  }
  function drawOverlay() {
    if (!overlayCanvas) return; var w = player.clientWidth, h = player.clientHeight; if (!w || !h) return;
    overlayCanvas.width = w; overlayCanvas.height = h; overlayCanvas.style.width = w + 'px'; overlayCanvas.style.height = h + 'px';
    var ctx = overlayCanvas.getContext('2d'); ctx.clearRect(0, 0, w, h);
    var f = nearestFrame(player.currentTime); if (!f || !f.keypoints || !f.keypoints.length) return; var kp = f.keypoints;
    ctx.strokeStyle = 'rgba(230,197,114,0.9)'; ctx.lineWidth = 2;
    CONNECTIONS.forEach(function (c) { var a = kp[c[0]], b = kp[c[1]]; if (!a || !b) return; ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke(); });
    ctx.fillStyle = 'rgba(95,208,139,0.95)';
    kp.forEach(function (p) { if (!p) return; ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2); ctx.fill(); });
  }

  // ---- arc geometry --------------------------------------------------------
  var X0 = 40, X1 = 960;
  function xAt(tt) { return DUR > 0 ? X0 + (tt / DUR) * (X1 - X0) : X0; }
  function arcY(px) { var ax = 497, peak = 84, base = 250, spread = 430; var d = Math.abs(px - ax); var hh = Math.max(0, 1 - (d / spread) * (d / spread)); return base - (base - peak) * hh; }
  var NS = 'http://www.w3.org/2000/svg';
  function fmt(s) { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }

  function renderArc(apexSec) {
    // apex marker
    var apx = xAt(apexSec), apy = arcY(apx);
    apexMarker.innerHTML =
      '<line x1="' + apx + '" y1="' + apy + '" x2="' + apx + '" y2="250" stroke="rgba(201,162,75,.35)" stroke-width="1.25" stroke-dasharray="3 5"/>' +
      '<circle cx="' + apx + '" cy="' + apy + '" r="7.5" fill="var(--brass-bright)"/>' +
      '<circle cx="' + apx + '" cy="' + apy + '" r="13" fill="none" stroke="var(--brass)" stroke-width="1" opacity=".5"/>' +
      '<text x="' + apx + '" y="' + (apy - 20) + '" text-anchor="middle" fill="var(--brass-bright)" font-size="14" font-weight="600">' + (EN ? 'APEX' : 'ÁPICE') + '</text>' +
      '<text x="' + apx + '" y="' + (apy - 37) + '" text-anchor="middle" fill="var(--muted)" font-size="12">' + apexSec.toFixed(2) + 's</text>';
    // fault pins
    pins.innerHTML = '';
    lastFaults.forEach(function (f, i) {
      var col = SEV_COLOR[faultSev(f.type)]; var px = xAt(f.timestampSec); var py = arcY(px);
      var g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'pin-hit'); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.dataset.i = i;
      g.innerHTML =
        '<line class="pin-stem" x1="' + px + '" y1="250" x2="' + px + '" y2="' + (py + 6) + '" stroke="' + col + '" stroke-width="1.5" opacity=".6"/>' +
        '<circle class="pin-dot" cx="' + px + '" cy="250" r="7" fill="' + col + '"/>' +
        '<circle cx="' + px + '" cy="250" r="12" fill="none" stroke="' + col + '" stroke-width="1" opacity=".35"/>' +
        '<text x="' + px + '" y="232" text-anchor="middle" fill="' + col + '" font-size="12" font-weight="600" opacity=".85">' + f.timestampSec.toFixed(2) + '</text>';
      g.addEventListener('click', function () { seekVideo(f.timestampSec); });
      g.addEventListener('mouseenter', function () { setActive(i, true); });
      g.addEventListener('mouseleave', function () { setActive(i, false); });
      pins.appendChild(g);
    });
  }

  function setActive(i, on) {
    var card = faultList.children[i]; if (card) card.classList.toggle('active', on);
    var pin = pins.children[i]; if (pin) { var d = pin.querySelector('.pin-dot'); if (d) d.setAttribute('r', on ? '9.5' : '7'); }
  }

  // ---- results render ------------------------------------------------------
  function renderResults(row) {
    if (row && row.share_url) setShareLink(row.share_url);
    lastFaults = row.faults || [];
    DUR = (row.duration_sec && row.duration_sec > 0) ? row.duration_sec : (player.duration || DUR || 1);
    resultsEl.classList.remove('hidden');
    ensureOverlay();

    if (faultCount) faultCount.textContent = lastFaults.length + ' ' + (EN ? (lastFaults.length === 1 ? 'fault detected' : 'faults detected') : (lastFaults.length === 1 ? 'fallo detectado' : 'fallos detectados'));
    if (apexVal) apexVal.textContent = (row.apex_sec != null ? row.apex_sec.toFixed(2) : '—');
    if (arcEnd) arcEnd.textContent = fmt(DUR);
    if (timeEl) timeEl.textContent = '0:00 / ' + fmt(DUR);

    renderArc(row.apex_sec != null ? row.apex_sec : DUR / 2);

    faultList.innerHTML = '';
    if (!lastFaults.length) {
      var none = document.createElement('div'); none.className = 'sub-label'; none.style.margin = '4px 2px';
      none.textContent = EN ? 'No position faults detected. Clean round.' : 'No se detectaron fallos de posición. Recorrido limpio.';
      faultList.appendChild(none); return;
    }
    lastFaults.forEach(function (f, i) {
      var sev = faultSev(f.type); var col = SEV_COLOR[sev]; var pct = Math.round((f.confidence || 0) * 100);
      var card = document.createElement('div'); card.className = 'fault'; card.style.setProperty('--sev', col); card.dataset.i = i; card.setAttribute('tabindex', '0');
      card.innerHTML =
        '<div class="fault-name">' + faultName(f.type) + '<span class="sub">' + faultSub(f.type) + '</span></div>' +
        '<div class="fault-time">' + f.timestampSec.toFixed(2) + '<small>' + (EN ? 'seconds' : 'segundos') + '</small></div>' +
        '<div class="fault-meta"><span class="sev-tag">' + sevLabel(sev) + '</span>' +
        '<span class="conf"><span class="conf-bar"><span class="conf-fill" style="width:' + pct + '%"></span></span><span class="conf-num">' + pct + '% ' + t('confidence') + '</span></span></div>';
      card.addEventListener('click', function () { seekVideo(f.timestampSec); });
      card.addEventListener('mouseenter', function () { setActive(i, true); });
      card.addEventListener('mouseleave', function () { setActive(i, false); });
      faultList.appendChild(card);
    });
  }

  // ---- real video controls -------------------------------------------------
  function seekVideo(tt) { try { player.currentTime = tt; player.play().catch(function () {}); } catch (e) {} }
  var PLAY = '<path d="M8 5v14l11-7z"/>', PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
  if (playBtn) playBtn.addEventListener('click', function () { if (player.paused) player.play(); else player.pause(); });
  if (player) {
    player.addEventListener('play', function () { playIcon.innerHTML = PAUSE; });
    player.addEventListener('pause', function () { playIcon.innerHTML = PLAY; });
    player.addEventListener('timeupdate', function () {
      var d = player.duration || DUR || 1; if (played) played.style.width = (player.currentTime / d * 100) + '%';
      if (timeEl) timeEl.textContent = fmt(player.currentTime) + ' / ' + fmt(d);
      drawOverlay();
    });
    player.addEventListener('loadedmetadata', function () { DUR = player.duration || DUR; drawOverlay(); });
    window.addEventListener('resize', drawOverlay);
  }
  if (track) track.addEventListener('click', function (e) { var r = track.getBoundingClientRect(); var frac = (e.clientX - r.left) / r.width; seekVideo(frac * (player.duration || DUR || 0)); });

  // ---- upload + analyze ----------------------------------------------------
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0]; if (!f) { analyzeBtn.disabled = true; return; }
    if (dzTitle) dzTitle.innerHTML = '<span class="dz-file">' + f.name + '</span>';
    if (dzSub) dzSub.textContent = EN ? 'Ready to analyze' : 'Listo para analizar';
    if (fileName) fileName.textContent = f.name;
    player.src = URL.createObjectURL(f); analyzeBtn.disabled = false; resultsEl.classList.add('hidden'); setStatus('');
  });
  ['dragover', 'dragenter'].forEach(function (e) { dz.addEventListener(e, function (ev) { ev.preventDefault(); dz.classList.add('drag'); }); });
  ['dragleave', 'drop'].forEach(function (e) { dz.addEventListener(e, function (ev) { ev.preventDefault(); dz.classList.remove('drag'); }); });

  analyzeBtn.addEventListener('click', async function () {
    var f = fileInput.files && fileInput.files[0]; if (!f) return;
    var token = getToken();
    if (!token) { if (loginNotice) loginNotice.classList.remove('hidden'); setStatus(t('need_login')); return; }

    analyzeBtn.disabled = true;
    var probe = document.createElement('video'); probe.muted = true; probe.playsInline = true; probe.preload = 'auto'; probe.src = player.src;
    await new Promise(function (res) { if (probe.readyState >= 1) return res(); probe.addEventListener('loadedmetadata', function () { res(); }, { once: true }); });

    var synthetic = false;
    try {
      setStatus(t('loading_model')); await loadLandmarker();
      setStatus(t('extracting')); frames = await extractFramesWithModel(probe);
      var withPose = frames.filter(function (fr) { return fr.keypoints && fr.keypoints.length; }).length;
      if (withPose < 2) { synthetic = true; frames = syntheticFrames(probe); }
    } catch (e) { synthetic = true; frames = syntheticFrames(probe); }

    setStatus(synthetic ? t('synthetic_notice') : t('analyzing'));
    try {
      var resp = await fetch(BASE + 'api/v1/analyses', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ filename: f.name, durationSec: probe.duration || null, frames: frames, lang: LANG })
      });
      if (resp.status === 401) { if (loginNotice) loginNotice.classList.remove('hidden'); setStatus(t('need_login')); analyzeBtn.disabled = false; return; }
      if (resp.status === 402) {
        setStatus(EN ? 'Out of credits. Recharge in the panel to continue.' : 'Sin créditos. Recarga en el panel para continuar.');
        try { if (window.parent !== window) window.parent.postMessage({ type: 'ecpf-recharge' }, '*'); } catch (e) {}
        analyzeBtn.disabled = false; return;
      }
      if (!resp.ok) { setStatus(t('save_failed')); analyzeBtn.disabled = false; return; }
      var row = await resp.json();
      setStatus(synthetic ? t('synthetic_notice') : '');
      if (row && row.credits != null) { try { if (window.parent !== window) window.parent.postMessage({ type: 'ecpf-credits', credits: row.credits }, '*'); } catch (e) {} }
      renderResults(row);
      // reveal animation
      [].forEach.call(resultsEl.querySelectorAll('.reveal'), function (el, i) { setTimeout(function () { el.classList.add('in'); }, 60 + i * 90); });
      drawOverlay();
      loadHistory();
    } catch (e) { setStatus(t('save_failed')); }
    analyzeBtn.disabled = false;
  });

  // ---- share (magic link público) -----------------------------------------
  var currentShareUrl = '';
  function setShareLink(url) { currentShareUrl = url || ''; var el = $('shareLink'); if (el) el.value = currentShareUrl; }
  function flashShare() { var m = $('shareMsg'); if (m) { m.textContent = t('jc_copied') || 'Enlace copiado'; setTimeout(function () { m.textContent = ''; }, 2500); } }
  function copyText(text) {
    var input = $('shareLink');
    function legacy() {
      try { if (input) { input.removeAttribute('readonly'); input.value = text; input.focus(); input.select(); input.setSelectionRange(0, 99999); } var ok = document.execCommand('copy'); if (input) input.setAttribute('readonly', 'readonly'); if (ok) flashShare(); else window.prompt('', text); }
      catch (e) { window.prompt('', text); }
    }
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(flashShare).catch(legacy); } else { legacy(); }
  }
  function bindShare() {
    var c = $('shareCopy'); if (c) c.addEventListener('click', function () { if (currentShareUrl) copyText(currentShareUrl); });
    var o = $('shareOpen'); if (o) o.addEventListener('click', function () { if (currentShareUrl) window.open(currentShareUrl, '_blank', 'noopener'); });
    var n = $('newJump'); if (n) n.addEventListener('click', function () { resultsEl.classList.add('hidden'); if (fileInput) fileInput.value = ''; try { history.replaceState(null, '', BASE + '?lang=' + LANG); } catch (e) {} window.scrollTo({ top: 0, behavior: 'smooth' }); });
    var g = $('goJumpHistory'); if (g) g.addEventListener('click', function () { loadHistory(); var h = $('jumpHistory'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    var r = $('jhRefresh'); if (r) r.addEventListener('click', loadHistory);
  }

  // ---- Mis análisis (historial) --------------------------------------------
  function fmtDate(s) { if (!s) return '—'; var d = new Date(s); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function loadHistory() {
    var tbody = $('jhRows'), empty = $('jhEmpty'); if (!tbody || !empty) return;
    var token = getToken(); if (!token) { empty.classList.remove('hidden'); return; }
    fetch(BASE + 'api/v1/analyses', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var rows = j && j.data ? j.data : [];
        tbody.innerHTML = '';
        if (!rows.length) { empty.classList.remove('hidden'); return; }
        empty.classList.add('hidden');
        rows.forEach(function (a) {
          var url = a.share_url || (BASE + '?analysis=' + a.id);
          var faults = Array.isArray(a.faults) ? a.faults.length : 0;
          var tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid var(--line)';
          tr.innerHTML =
            '<td style="padding:8px 12px 8px 0;font-family:ui-monospace,Menlo,monospace;font-size:12px">' + esc(fmtDate(a.created_at)) + '</td>' +
            '<td style="padding:8px 12px 8px 0">' + esc(a.filename || '—') + '</td>' +
            '<td style="padding:8px 12px 8px 0;font-family:ui-monospace,Menlo,monospace">' + (a.apex_sec != null ? Number(a.apex_sec).toFixed(2) + 's' : '—') + '</td>' +
            '<td style="padding:8px 12px 8px 0;font-family:ui-monospace,Menlo,monospace;color:' + (faults ? 'var(--sev-mid)' : 'var(--turf)') + '">' + faults + '</td>' +
            '<td style="padding:8px 12px 8px 0"><a href="' + url + '" target="_blank" rel="noopener" style="text-decoration:underline">' + (t('jc_view_report') || 'Ver informe') + ' ↗</a></td>';
          tbody.appendChild(tr);
        });
      }).catch(function () {});
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- Informe compartido (permalink ?analysis=ID[&k=TOKEN]) ---------------
  function loadSharedReport() {
    var q; try { q = new URL(location.href).searchParams; } catch (e) { return false; }
    var id = q.get('analysis'); if (!id) return false;
    var k = q.get('k'), token = getToken();
    // Vista de informe: ocultar carga + historial; mostrar CTA si es anónimo.
    var up = document.querySelector('.upload'); if (up) up.classList.add('hidden');
    var jh = $('jumpHistory'); if (jh) jh.classList.add('hidden');
    var oa = $('ownerActions'); if (oa) oa.classList.add('hidden');
    if (!token) { var cta = $('jumpCta'); if (cta) cta.classList.remove('hidden'); }
    var url, opts = {};
    if (k) { url = BASE + 'api/v1/analyses/' + encodeURIComponent(id) + '/report?k=' + encodeURIComponent(k); }
    else { url = BASE + 'api/v1/analyses/' + encodeURIComponent(id); opts.headers = { 'Authorization': 'Bearer ' + token }; }
    fetch(url, opts).then(function (r) {
      if (!r.ok) { setStatus(t('jc_share_invalid') || 'Enlace no válido.'); return null; }
      return r.json();
    }).then(function (row) {
      if (!row) return;
      resultsEl.classList.remove('hidden');
      renderResults(row);
      setShareLink(row.share_url || currentShareUrl);
      [].forEach.call(resultsEl.querySelectorAll('.reveal'), function (el, i) { setTimeout(function () { el.classList.add('in'); }, 60 + i * 90); });
    }).catch(function () {});
    return true;
  }

  // ---- boot ----------------------------------------------------------------
  applyI18n();
  bindShare();
  var isShared = loadSharedReport();
  if (!isShared) {
    if (!getToken() && loginNotice) loginNotice.classList.remove('hidden');
    loadHistory();
  }
  var rev = [].slice.call(document.querySelectorAll('.wrap > header.reveal, .wrap > .panel.reveal'));
  rev.forEach(function (el, i) { setTimeout(function () { el.classList.add('in'); }, 80 + i * 90); });
})();
