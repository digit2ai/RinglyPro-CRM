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
  var manualFaults = [], currentAnalysisId = null;

  // ---- fault metadata (self-contained, bilingual) --------------------------
  var FAULT_META = {
    gaze_drop:    { sev: 'high', es: ['Mirada baja anticipada', 'La cabeza cae antes del ápice'],       en: ['Premature gaze drop', 'Head drops before the apex'] },
    left_behind:  { sev: 'high', es: ['Quedarse atrás', 'El torso se retrasa tras el ápice'],           en: ['Left behind', 'Torso lags after the apex'] },
    dropped_rein: { sev: 'mid',  es: ['Mano de rienda caída', 'Muñeca por debajo del codo en el ascenso'], en: ['Dropped rein hand', 'Wrist below elbow on the ascent'] },
    forward_seat: { sev: 'mid',  es: ['Asiento adelantado', 'La cadera se adelanta al tobillo al aterrizar'], en: ['Forward seat', 'Hip ahead of ankle at landing'] },
    heel_up:      { sev: 'mid',  es: ['Talón arriba', 'El talón no baja de forma constante'],            en: ['Heel up', 'Heel not kept down consistently'] },
    leg_swing:    { sev: 'mid',  es: ['Pierna inestable', 'La pantorrilla se balancea adelante/atrás'],  en: ['Swinging lower leg', 'Calf swings back and forth'] },
    hand_dependent:{sev: 'mid',  es: ['Mano dependiente', 'La mano sigue el movimiento del cuerpo'],     en: ['Dependent hand', 'Hand follows the body motion'] },
    load_left:    { sev: 'low',  es: ['Carga el lado izquierdo', 'Asimetría hacia la izquierda'],        en: ['Loads the left side', 'Left-side asymmetry'] },
    load_right:   { sev: 'low',  es: ['Carga el lado derecho', 'Asimetría hacia la derecha'],            en: ['Loads the right side', 'Right-side asymmetry'] },
    alignment_off:{ sev: 'mid',  es: ['Línea de equilibrio', 'Oreja-hombro-cadera-talón desalineados'],  en: ['Balance line off', 'Ear–shoulder–hip–heel misaligned'] },
    release_short:{ sev: 'low',  es: ['Suelta corta', 'Poca entrega de rienda sobre el salto'],          en: ['Short release', 'Little rein release over the jump'] },
    timing_ahead: { sev: 'mid',  es: ['Se adelanta', 'El jinete se adelanta al despegue'],               en: ['Ahead of the motion', 'Rider anticipates take-off'] },
    timing_behind:{ sev: 'mid',  es: ['Se atrasa', 'El jinete se atrasa al despegue'],                   en: ['Behind the motion', 'Rider lags the take-off'] }
  };
  var DIM_META = {
    posicion_general: { es: 'Posición general', en: 'Overall position' },
    manos_contacto:   { es: 'Manos y contacto', en: 'Hands & contact' },
    piernas_asiento:  { es: 'Piernas y asiento', en: 'Legs & seat' },
    sincronizacion:   { es: 'Sincronización',   en: 'Synchronization' },
    postura_fase:     { es: 'Postura por fase',  en: 'Posture by phase' }
  };
  // Short coach-style correction per fault ("cómo corregirlo" / "how to fix").
  var FAULT_FIX = {
    gaze_drop:     { es: 'Mira hacia el próximo obstáculo, no al suelo.', en: 'Look up to the next fence, not down.' },
    left_behind:   { es: 'Acompaña el salto con el torso; no te quedes atrás.', en: 'Fold with the horse; don’t get left behind.' },
    dropped_rein:  { es: 'Mantén las manos arriba y el contacto en el ascenso.', en: 'Keep hands up and contact on the ascent.' },
    forward_seat:  { es: 'Estabiliza en la recepción; no te vayas adelante.', en: 'Stabilize on landing; don’t tip forward.' },
    heel_up:       { es: 'Talón abajo de forma constante.', en: 'Keep your heel down consistently.' },
    leg_swing:     { es: 'Fija la pantorrilla bajo el cuerpo.', en: 'Keep the lower leg still under you.' },
    hand_dependent:{ es: 'Mano independiente; no sigas el salto con las manos.', en: 'Independent hand; don’t follow the jump with your hands.' },
    load_left:     { es: 'Reparte el peso; no cargues el lado izquierdo.', en: 'Balance your weight; don’t load the left side.' },
    load_right:    { es: 'Reparte el peso; no cargues el lado derecho.', en: 'Balance your weight; don’t load the right side.' },
    alignment_off: { es: 'Alinea oreja, hombro, cadera y talón.', en: 'Line up ear, shoulder, hip and heel.' },
    release_short: { es: 'Entrega más rienda sobre el salto (crest release).', en: 'Give more release over the jump (crest release).' },
    timing_ahead:  { es: 'Espera al caballo; no te adelantes al despegue.', en: 'Wait for the horse; don’t anticipate take-off.' },
    timing_behind: { es: 'Anticipa un poco; vas tarde al despegue.', en: 'Be a touch quicker; you’re late to take-off.' }
  };
  function faultFix(type) { var m = FAULT_FIX[type]; return m ? m[LANG] : ''; }
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

  // ---- progress bar --------------------------------------------------------
  var progWrap = $('progWrap'), progBar = $('progBar'), progLabel = $('progLabel'), progMsg = $('progMsg'), progPct = $('progPct');
  function showProgress() { if (progWrap) progWrap.classList.remove('hidden'); if (progLabel) progLabel.classList.remove('hidden'); }
  // pct = null -> indeterminate (sliding); pct = 0..100 -> determinate
  function setProgress(pct, msg) {
    showProgress();
    if (msg != null && progMsg) progMsg.textContent = msg;
    if (pct == null) {
      if (progWrap) progWrap.classList.add('indet');
      if (progBar) progBar.style.width = '';
      if (progPct) progPct.textContent = '';
    } else {
      if (progWrap) progWrap.classList.remove('indet');
      var p = Math.max(0, Math.min(100, Math.round(pct)));
      if (progBar) progBar.style.width = p + '%';
      if (progPct) progPct.textContent = p + '%';
    }
  }
  function hideProgress() {
    if (progWrap) { progWrap.classList.add('hidden'); progWrap.classList.remove('indet'); }
    if (progLabel) progLabel.classList.add('hidden');
    if (progBar) progBar.style.width = '0%';
  }

  // ---- prominent analysis message (errors / no-credits) --------------------
  var analysisMsg = $('analysisMsg');
  var ECPF_BASE = BASE + '../evaluacion-del-caballo-de-paso-fino/';
  function showMsg(html, kind) {
    if (!analysisMsg) return;
    analysisMsg.innerHTML = html;
    analysisMsg.style.borderColor = kind === 'error' ? 'color-mix(in srgb,var(--sev-high) 50%,transparent)' : 'color-mix(in srgb,var(--sev-mid) 45%,transparent)';
    analysisMsg.classList.remove('hidden');
    try { analysisMsg.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
  }
  function clearMsg() { if (analysisMsg) { analysisMsg.classList.add('hidden'); analysisMsg.innerHTML = ''; } }

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
  async function extractFramesWithModel(video, onProgress) {
    var lm = await loadLandmarker(); var dur = video.duration || 0; var out = []; var step = 1 / SAMPLE_FPS;
    var count = Math.min(MAX_FRAMES, Math.max(1, Math.floor(dur / step)));
    for (var i = 0; i < count; i++) {
      var time = i * step; await seekTo(video, time);
      var res = lm.detectForVideo(video, Math.round(time * 1000));
      var lms = (res && res.landmarks && res.landmarks[0]) || null;
      var kps = lms ? lms.map(function (p) { return { x: p.x, y: p.y, z: p.z || 0, visibility: (p.visibility != null ? p.visibility : 1) }; }) : [];
      out.push({ t: Math.round(time * 1000) / 1000, keypoints: kps });
      if (onProgress) { try { onProgress((i + 1) / count); } catch (e) {} }
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
    // guided review: highlight the active fault on the real footage
    try { drawFaultCue(ctx, w, h, f); } catch (e) {}
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
      g.addEventListener('click', function () { review.auto = false; updateAutoBtn(); var gi = review.faults.indexOf(f); if (gi >= 0) gotoFault(gi); else seekVideo(f.timestampSec); });
      g.addEventListener('mouseenter', function () { setActive(i, true); });
      g.addEventListener('mouseleave', function () { setActive(i, false); });
      pins.appendChild(g);
    });
  }

  function setActive(i, on) {
    var card = faultList.children[i]; if (card) card.classList.toggle('active', on);
    var pin = pins.children[i]; if (pin) { var d = pin.querySelector('.pin-dot'); if (d) d.setAttribute('r', on ? '9.5' : '7'); }
  }

  // ---- rider score card (v2 rubric) ----------------------------------------
  var CAT_LABEL = { '80': '80 cm', '100': '1.00 m', '110': '1.10 m', '120': '1.20 m', '130': '1.30 m', '140': '1.40 m', '150_160': '1.50–1.60 m+' };
  function dimName(k) { var m = DIM_META[k]; return m ? m[LANG] : k; }
  function renderScore(row) {
    var panel = $('scorePanel'); if (!panel) return;
    var dims = row && row.dimension_scores; var score = row ? row.rider_score : null;
    // Only show the card when this analysis carries v2 rubric data.
    if (!dims || typeof dims !== 'object' || !Object.keys(dims).length) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    var pill = $('catPill'); if (pill) pill.textContent = CAT_LABEL[row.height_category] || '';
    var num = $('scoreNum'), ring = $('scoreRing');
    if (num) num.textContent = (score != null ? score : '—');
    if (ring) ring.style.setProperty('--p', (score != null ? score : 0));
    var bars = $('dimBars');
    if (bars) {
      bars.innerHTML = '';
      ['posicion_general', 'manos_contacto', 'piernas_asiento', 'sincronizacion', 'postura_fase'].forEach(function (k) {
        var d = dims[k] || {}; var s = (d && d.score != null) ? d.score : null;
        var row2 = document.createElement('div'); row2.className = 'dim' + (s == null ? ' nd' : '');
        row2.innerHTML = '<span class="dn">' + dimName(k) + '</span>' +
          '<span class="db"><span class="df" style="width:' + (s == null ? 0 : s) + '%"></span></span>' +
          '<span class="dv">' + (s == null ? 'n/d' : s) + '</span>';
        bars.appendChild(row2);
      });
    }
    // Course line (from POST response course, or reconstructed from stored times)
    var course = row.course || null;
    if (!course && row.total_time_sec != null && row.optimal_time_sec != null) {
      course = { total_time_sec: row.total_time_sec, optimal_time_sec: row.optimal_time_sec, delta_sec: Math.round((row.total_time_sec - row.optimal_time_sec) * 100) / 100 };
    }
    var cl = $('courseLine');
    if (cl) {
      if (course && course.total_time_sec != null && course.optimal_time_sec != null) {
        var d = course.delta_sec; var sign = d > 0 ? '+' : '';
        cl.textContent = (EN ? 'Time: ' : 'Tiempo: ') + course.total_time_sec + 's ' + (EN ? 'vs optimal ' : 'vs óptimo ') + course.optimal_time_sec + 's (' + sign + d + 's)';
        cl.style.color = (Math.abs(d) <= course.optimal_time_sec * 0.03) ? 'var(--turf)' : 'var(--sev-mid)';
      } else { cl.textContent = ''; }
    }
    var pn = $('pendingNote');
    if (pn) pn.textContent = EN
      ? 'Rider-position metrics are computed from your pose (documented heuristics). Horse bascule, take-off distance and stride between fences require horse pose and are on the roadmap.'
      : 'Las métricas de posición del jinete se calculan desde tu pose (heurísticas documentadas). El bascular del caballo, la distancia de batida y la zancada entre obstáculos requieren pose del caballo y están en el roadmap.';
  }

  // ---- manual rail/refusal tagging -----------------------------------------
  var MF_KIND = { rail: ['Derribo', 'Rail'], refusal: ['Rehúse', 'Refusal'] };
  var MF_FENCE = { vertical: ['Vertical', 'Vertical'], oxer: ['Oxer', 'Oxer'], combo: ['Combinación', 'Combination'], other: ['Otro', 'Other'] };
  function mfLabel(m) { return (MF_KIND[m.kind] ? MF_KIND[m.kind][EN ? 1 : 0] : m.kind) + ' · ' + (MF_FENCE[m.fence_type] ? MF_FENCE[m.fence_type][EN ? 1 : 0] : m.fence_type) + (m.at_sec != null ? ' · ' + m.at_sec + 's' : ''); }
  function renderMfChips() {
    var box = $('mfChips'); if (!box) return; box.innerHTML = '';
    manualFaults.forEach(function (m, i) {
      var chip = document.createElement('span'); chip.className = 'mf-chip ' + m.kind;
      chip.innerHTML = '<span>' + esc(mfLabel(m)) + '</span><button type="button" aria-label="x">&times;</button>';
      chip.querySelector('button').addEventListener('click', function () { manualFaults.splice(i, 1); renderMfChips(); });
      box.appendChild(chip);
    });
  }
  function bindMf() {
    var add = $('mfAdd'); if (!add) return;
    add.addEventListener('click', function () {
      var k = $('mfKind'), fc = $('mfFence'), at = $('mfAt');
      if (manualFaults.length >= 60) return;
      var atv = at && at.value !== '' ? parseFloat(at.value) : null;
      manualFaults.push({ kind: k ? k.value : 'rail', fence_type: fc ? fc.value : 'other', at_sec: (atv != null && isFinite(atv)) ? atv : null });
      if (at) at.value = '';
      renderMfChips();
    });
  }

  // ---- horse technique card ------------------------------------------------
  function renderHorse(row) {
    var panel = $('horsePanel'); if (!panel) return;
    var h = (row && row.horse) || (row && row.metrics && row.metrics.horse) || null;
    if (!h || (h.bascule_score == null && !h.fore_hind_symmetry)) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    var src = $('horseSrc');
    if (src) src.textContent = h.source === 'horse_pose' ? (EN ? 'horse pose' : 'pose del caballo') : (EN ? 'estimated · rider' : 'estimado · jinete');
    var grid = $('horseGrid'); if (grid) {
      grid.innerHTML = '';
      var tile = function (v, l) { var d = document.createElement('div'); d.className = 'ht'; d.innerHTML = '<div class="hv">' + v + '</div><div class="hl">' + l + '</div>'; grid.appendChild(d); };
      if (h.bascule_score != null) tile(h.bascule_score, EN ? 'Bascule' : 'Bascular');
      if (h.arc_symmetry_score != null) tile(h.arc_symmetry_score, EN ? 'Arc symmetry' : 'Simetría del arco');
      if (h.airtime_sec != null) tile(h.airtime_sec + 's', EN ? 'Air time' : 'Tiempo en el aire');
      if (h.takeoff_distance_label) {
        var TL = { close: [EN ? 'Close' : 'Cerca'], good: [EN ? 'Good' : 'Buena'], long: [EN ? 'Long' : 'Larga'] };
        tile((TL[h.takeoff_distance_label] ? TL[h.takeoff_distance_label][0] : h.takeoff_distance_label), EN ? 'Take-off distance' : 'Distancia de batida');
      }
      if (h.fore_hind_symmetry && h.fore_hind_symmetry.score != null) tile(h.fore_hind_symmetry.score, EN ? 'Fore/hind symmetry' : 'Simetría ant./post.');
    }
    var note = $('horseNote');
    if (note) note.textContent = h.source === 'horse_pose'
      ? (EN ? 'Computed from horse pose keypoints.' : 'Calculado desde los puntos de pose del caballo.')
      : (EN ? 'Estimated from the rider’s trajectory (proxy). Fore/hind symmetry and exact take-off distance in metres need a horse-pose model / fence detection.' : 'Estimado desde la trayectoria del jinete (proxy). La simetría anterior/posterior y la distancia exacta de batida en metros requieren un modelo de pose del caballo / detección del obstáculo.');
  }

  // ---- rider journal (perception vs data) ----------------------------------
  function renderJournal(row) {
    var panel = $('journalPanel'); if (!panel) return;
    currentAnalysisId = row && row.id != null ? row.id : null;
    var entries = (row && Array.isArray(row.journal)) ? row.journal : [];
    var box = $('jnEntries');
    if (box) {
      box.innerHTML = '';
      entries.forEach(function (e) {
        var d = document.createElement('div'); d.className = 'jn-entry';
        var self = e.self_score != null ? (' · ' + (EN ? 'self ' : 'auto ') + e.self_score) : '';
        var obj = (row.rider_score != null) ? (' · ' + (EN ? 'AI ' : 'IA ') + row.rider_score) : '';
        d.innerHTML = '<div>' + esc(e.feeling || '') + '</div><div class="jm">' + esc(fmtDate(e.at)) + self + obj + '</div>';
        box.appendChild(d);
      });
    }
    // Only the owner (has token + a real id) can add entries.
    var canPost = currentAnalysisId != null && !!getToken();
    ['jnFeeling', 'jnSelf', 'jnSave'].forEach(function (id) { var el = $(id); if (el) el.style.display = canPost ? '' : 'none'; });
  }
  function saveJournal() {
    if (currentAnalysisId == null) return;
    var token = getToken(); if (!token) return;
    var feeling = ($('jnFeeling') && $('jnFeeling').value || '').trim(); if (!feeling) return;
    var selfEl = $('jnSelf'); var selfScore = selfEl && selfEl.value !== '' ? parseInt(selfEl.value, 10) : null;
    fetch(BASE + 'api/v1/analyses/' + currentAnalysisId + '/journal', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ feeling: feeling, selfScore: selfScore })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (row) {
      if (!row) return;
      if ($('jnFeeling')) $('jnFeeling').value = ''; if (selfEl) selfEl.value = '';
      var m = $('jnMsg'); if (m) { m.textContent = EN ? 'Saved.' : 'Guardado.'; setTimeout(function () { m.textContent = ''; }, 2000); }
      renderJournal(row);
    }).catch(function () {});
  }

  // ---- cross-analysis insights (patterns / workload / records) -------------
  function describeAlert(a) {
    var sig = a.signal;
    switch (a.code) {
      case 'recurring_fault': return (EN ? 'Recurring: ' : 'Recurrente: ') + faultName(sig) + ' (' + a.occurrences + '/' + a.of + ')';
      case 'rail_fence_bias': return (EN ? 'Most rails on ' : 'Más derribos en ') + (MF_FENCE[sig] ? MF_FENCE[sig][EN ? 1 : 0] : sig) + ' (' + a.occurrences + '/' + a.of + ')';
      case 'refusal_cluster': return (EN ? 'Refusals cluster ' : 'Rehúses agrupados ') + (sig === 'late_course' ? (EN ? 'late in the course' : 'al final del recorrido') : (EN ? 'early in the course' : 'al inicio del recorrido'));
      case 'lateral_load': return faultName(sig);
      case 'score_declining': return (EN ? 'Rider score trending down ~' : 'Tu puntaje baja ~') + a.occurrences + ' pts';
      case 'score_improving': return (EN ? 'Rider score trending up ~' : 'Tu puntaje sube ~') + a.occurrences + ' pts';
      default: return a.code + ' · ' + sig;
    }
  }
  function sevColorFor(sev) { return sev === 'high' ? SEV_COLOR.high : (sev === 'medium' ? SEV_COLOR.mid : (sev === 'info' ? 'var(--turf)' : SEV_COLOR.low)); }
  function loadInsights() {
    var panel = $('insightsPanel'); if (!panel) return;
    var token = getToken(); if (!token) return;
    var H = { headers: { 'Authorization': 'Bearer ' + token } };
    var api = BASE + 'api/v1/analyses/insights/';
    Promise.all([
      fetch(api + 'patterns', H).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch(api + 'workload', H).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch(api + 'records', H).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      var pat = res[0], wl = res[1], rec = res[2];
      var any = (pat && pat.alerts && pat.alerts.length) || (wl && wl.current && wl.current.count) || (rec && rec.records && rec.records.length);
      if (!any) { panel.classList.add('hidden'); return; }
      panel.classList.remove('hidden');
      // patterns
      var pa = $('insAlerts');
      if (pa) {
        pa.innerHTML = '';
        var alerts = (pat && pat.alerts) || [];
        if (!alerts.length) pa.innerHTML = '<div style="color:var(--faint);font-size:13px">' + (EN ? 'No repeating patterns yet.' : 'Aún no hay patrones repetidos.') + '</div>';
        alerts.forEach(function (a) {
          var d = document.createElement('div'); d.className = 'alert'; d.style.setProperty('--sev', sevColorFor(a.severity));
          d.innerHTML = '<span class="as">' + (a.severity || '') + '</span><span>' + esc(describeAlert(a)) + '</span>';
          pa.appendChild(d);
        });
      }
      // workload
      var wb = $('insWorkload');
      if (wb) {
        wb.innerHTML = '';
        if (wl && wl.overload) { var o = document.createElement('div'); o.className = 'overload'; o.textContent = EN ? 'Overload this week — consider easing the jumping volume.' : 'Sobrecarga esta semana — considera bajar el volumen de saltos.'; wb.appendChild(o); }
        var cur = wl && wl.current ? wl.current : { count: 0, big: 0 };
        var line = document.createElement('div'); line.style.fontSize = '13.5px';
        line.innerHTML = (EN ? 'This week: ' : 'Esta semana: ') + '<b>' + (cur.count || 0) + '</b> ' + (EN ? 'jumps' : 'saltos') + ' · <b>' + (cur.big || 0) + '</b> ' + (EN ? '≥1.30m' : '≥1.30m');
        wb.appendChild(line);
      }
      // records
      var rb = $('insRecords');
      if (rb) {
        rb.innerHTML = '';
        var records = (rec && rec.records) || [];
        if (!records.length) rb.innerHTML = '<div style="color:var(--faint);font-size:13px">' + (EN ? 'Add a horse name to build records.' : 'Agrega el nombre del caballo para llevar récords.') + '</div>';
        records.forEach(function (g) {
          if (!g.horse_name) return;
          var d = document.createElement('div'); d.className = 'rec-row';
          d.innerHTML = '<span>' + esc(g.horse_name) + (g.rider_name ? ' · ' + esc(g.rider_name) : '') + '</span>' +
            '<span class="rv">' + (EN ? 'best ' : 'récord ') + (g.best_cm || 0) + ' cm · ' + g.count + (EN ? ' jumps' : ' saltos') + '</span>';
          rb.appendChild(d);
        });
      }
    });
  }

  // ---- results render ------------------------------------------------------
  function renderAnalysisId(row) {
    var chip = $('analysisIdChip'); if (!chip) return;
    if (!row || row.id == null) { chip.style.display = 'none'; return; }
    var label = (I18N.jc_id_label || 'ID');
    var base = label + ' #' + row.id;
    chip.textContent = base; chip.style.display = '';
    chip.title = EN ? 'Copy analysis ID' : 'Copiar ID del análisis';
    chip.onclick = function () {
      var txt = String(row.id);
      var done = function () { chip.textContent = (I18N.jc_id_copied || 'ID copiado'); setTimeout(function () { chip.textContent = base; }, 1500); };
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(txt).then(done).catch(function () { window.prompt('', txt); }); }
      else { window.prompt('', txt); }
    };
  }

  // ---- guided fault review ON the original video ---------------------------
  // The original <video> plays and STOPS at each finding; the fault is drawn on
  // the real footage at the exact joint/location, with the type + a fix tip.
  var review = { faults: [], i: -1, auto: false, nextStop: 0 };

  function setArcPlayhead(frac) {
    var el = $('arcPlayhead'); if (!el) return;
    if (frac == null) { el.setAttribute('opacity', '0'); return; }
    var x = 40 + Math.max(0, Math.min(1, frac)) * (960 - 40);
    el.setAttribute('x1', x); el.setAttribute('x2', x); el.setAttribute('opacity', '1');
  }
  // Reconstruct in-memory `frames` from a persisted pose_track (re-opened reports
  // / public share links) so the skeleton overlay + fault anchors work.
  function framesFromPoseTrack(pt) {
    if (!pt || !Array.isArray(pt.frames) || !Array.isArray(pt.idx)) return [];
    return pt.frames.map(function (f) {
      var kps = new Array(33).fill(null);
      (f.xy || []).forEach(function (p, i) { var li = pt.idx[i]; if (p && li != null) kps[li] = { x: p[0], y: p[1], z: 0, visibility: 1 }; });
      return { t: f.t, keypoints: kps };
    });
  }
  function faultAnchor(type, P) {
    var M = function (a, b) { var x = P(a), y = P(b); return (x && y) ? { x: (x.x + y.x) / 2, y: (x.y + y.y) / 2 } : (x || y || null); };
    if (type === 'gaze_drop') return { p: P(0) };
    if (/dropped_rein|hand_dependent|release_short/.test(type)) return { p: M(15, 16) };
    if (/heel_up|leg_swing/.test(type)) return { p: M(27, 28) };
    if (type === 'load_left') return { p: M(11, 23) };
    if (type === 'load_right') return { p: M(12, 24) };
    if (type === 'alignment_off') return { line: [P(0), M(11, 12), M(23, 24), M(27, 28)] };
    if (/left_behind|forward_seat|timing_/.test(type)) return { p: M(23, 24) };
    return { p: M(11, 12) };
  }
  function faultColor(type) { var s = faultSev(type); return s === 'high' ? '#CE4C3B' : (s === 'mid' ? '#D98A3E' : '#C9A24B'); }
  // Draw the active fault highlight onto the video overlay (called by drawOverlay).
  function drawFaultCue(ctx, w, h, frame) {
    if (review.i < 0 || review.i >= review.faults.length || !frame || !frame.keypoints) return;
    var f = review.faults[review.i];
    var P = function (li) { var k = frame.keypoints[li]; return k ? { x: k.x, y: k.y } : null; };
    var a = faultAnchor(f.type, P), col = faultColor(f.type);
    if (a.line) {
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.setLineDash([3, 5]); ctx.beginPath(); var st = false;
      a.line.forEach(function (p) { if (!p) return; if (!st) { ctx.moveTo(p.x * w, p.y * h); st = true; } else ctx.lineTo(p.x * w, p.y * h); });
      ctx.stroke(); ctx.setLineDash([]);
    } else if (a.p) {
      var x = a.p.x * w, y = a.p.y * h;
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y, 24, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      ctx.font = '600 13px Archivo,system-ui,sans-serif';
      var lbl = faultName(f.type), tw = ctx.measureText(lbl).width;
      var lx = Math.min(Math.max(x + 18, 6), w - tw - 12), ly = Math.max(y - 18, 16);
      ctx.fillStyle = 'rgba(12,16,12,.82)'; ctx.fillRect(lx - 6, ly - 14, tw + 12, 20);
      ctx.fillStyle = col; ctx.fillText(lbl, lx, ly);
    }
  }
  function updateAutoBtn() {
    var b = $('rvAuto'); if (!b) return;
    b.textContent = review.auto ? (EN ? 'Continue' : 'Continuar') : (I18N.jc_rv_auto || (EN ? 'Play with pauses' : 'Reproducir con pausas'));
  }
  function updateReviewUI() {
    var bar = $('reviewBar'); if (!bar) return;
    var n = review.faults.length;
    if (!n) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    var f = review.i >= 0 ? review.faults[review.i] : null;
    var cnt = $('rvCount'), nm = $('rvName'), tip = $('rvTip');
    if (cnt) cnt.textContent = (review.i >= 0 ? (review.i + 1) : '–') + ' / ' + n;
    if (nm) nm.textContent = f ? faultName(f.type) : (EN ? 'Step through each fault on the video' : 'Recorre cada fallo en el video');
    if (tip) tip.textContent = f ? faultFix(f.type) : '';
    var prev = $('rvPrev'), next = $('rvNext');
    if (prev) prev.disabled = review.i <= 0;
    if (next) next.disabled = review.i >= n - 1;
    review.faults.forEach(function (_, i) { setActive(i, i === review.i); });
  }
  function gotoFault(i) {
    if (i < 0 || i >= review.faults.length) return;
    review.i = i;
    var t = review.faults[i].timestampSec || 0;
    try { player.pause(); } catch (e) {}
    if (playIcon) playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    var onSeek = function () { player.removeEventListener('seeked', onSeek); drawOverlay(); };
    player.addEventListener('seeked', onSeek);
    try { player.currentTime = t; } catch (e) {}
    var d = player.duration || DUR || 1; setArcPlayhead(d ? t / d : 0);
    updateReviewUI();
    drawOverlay();
  }
  function startAuto() {
    if (!review.faults.length) return;
    review.auto = true;
    review.nextStop = review.faults.length;
    for (var i = 0; i < review.faults.length; i++) { if ((review.faults[i].timestampSec || 0) > player.currentTime + 0.05) { review.nextStop = i; break; } }
    updateAutoBtn();
    try { player.play(); } catch (e) {}
  }
  function setupReview(row) {
    review = { faults: [], i: -1, auto: false, nextStop: 0 };
    var bar = $('reviewBar');
    // rider frames: in-memory (fresh) or reconstructed from the persisted track.
    if ((!frames || !frames.length) && row && row.pose_track) frames = framesFromPoseTrack(row.pose_track);
    review.faults = (row && Array.isArray(row.faults)) ? row.faults.slice().sort(function (a, b) { return (a.timestampSec || 0) - (b.timestampSec || 0); }) : [];
    if (!review.faults.length) { if (bar) bar.style.display = 'none'; setArcPlayhead(null); return; }
    updateAutoBtn(); updateReviewUI();
    var prev = $('rvPrev'); if (prev) prev.onclick = function () { review.auto = false; updateAutoBtn(); gotoFault(review.i <= 0 ? 0 : review.i - 1); };
    var next = $('rvNext'); if (next) next.onclick = function () { review.auto = false; updateAutoBtn(); gotoFault(review.i < 0 ? 0 : Math.min(review.i + 1, review.faults.length - 1)); };
    var auto = $('rvAuto'); if (auto) auto.onclick = function () { if (review.auto) { try { player.play(); } catch (e) {} } else { startAuto(); } };
  }

  function renderResults(row) {
    if (row && row.share_url) setShareLink(row.share_url);
    try { renderAnalysisId(row); } catch (e) {}
    try { renderScore(row); } catch (e) {}
    try { renderHorse(row); } catch (e) {}
    try { renderJournal(row); } catch (e) {}
    lastFaults = row.faults || [];
    DUR = (row.duration_sec && row.duration_sec > 0) ? row.duration_sec : (player.duration || DUR || 1);
    resultsEl.classList.remove('hidden');
    ensureOverlay();
    try { setupReview(row); } catch (e) {}

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
      card.addEventListener('click', function () { review.auto = false; updateAutoBtn(); var gi = review.faults.indexOf(f); if (gi >= 0) gotoFault(gi); else seekVideo(f.timestampSec); });
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
      setArcPlayhead(player.currentTime / d);
      // auto guided review: pause the video at each finding
      if (review.auto && review.nextStop < review.faults.length) {
        var ns = review.faults[review.nextStop];
        if (player.currentTime + 0.02 >= (ns.timestampSec || 0)) {
          var idx = review.nextStop; review.nextStop++;
          gotoFault(idx);
          if (review.nextStop >= review.faults.length) review.auto = false;
          updateAutoBtn();
        }
      }
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
    if (!token) {
      // Not logged in -> can't bill an analysis. Make it impossible to miss.
      if (loginNotice) { loginNotice.classList.remove('hidden'); try { loginNotice.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
      setStatus(t('need_login'));
      return;
    }

    clearMsg();
    analyzeBtn.disabled = true;
    setProgress(3, EN ? 'Preparing…' : 'Preparando…');
    var probe = document.createElement('video'); probe.muted = true; probe.playsInline = true; probe.preload = 'auto'; probe.src = player.src;
    await new Promise(function (res) { if (probe.readyState >= 1) return res(); probe.addEventListener('loadedmetadata', function () { res(); }, { once: true }); });

    var synthetic = false;
    try {
      setProgress(null, t('loading_model')); await loadLandmarker();
      setProgress(10, t('extracting'));
      frames = await extractFramesWithModel(probe, function (frac) { setProgress(10 + frac * 65, t('extracting')); });
      var withPose = frames.filter(function (fr) { return fr.keypoints && fr.keypoints.length; }).length;
      if (withPose < 2) { synthetic = true; frames = syntheticFrames(probe); }
    } catch (e) { synthetic = true; frames = syntheticFrames(probe); }

    setProgress(null, synthetic ? t('synthetic_notice') : t('analyzing'));
    setStatus(synthetic ? t('synthetic_notice') : '');
    try {
      var numOr = function (id) { var el = $(id); var v = el && el.value !== '' ? parseFloat(el.value) : null; return (v != null && isFinite(v)) ? v : null; };
      var strOr = function (id) { var el = $(id); return el && el.value ? el.value.trim().slice(0, 120) : null; };
      var catEl = $('heightCat');
      var resp = await fetch(BASE + 'api/v1/analyses', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          filename: f.name, durationSec: probe.duration || null, frames: frames, lang: LANG,
          heightCategory: catEl ? catEl.value : '110',
          horseName: strOr('horseName'), riderName: strOr('riderName'),
          optimalTimeSec: numOr('optimalTime'), totalTimeSec: numOr('totalTime'),
          manualFaults: manualFaults.slice()
        })
      });
      if (resp.status === 401) {
        hideProgress();
        showMsg((EN ? 'Your session expired. Log in again to analyze.' : 'Tu sesión expiró. Inicia sesión de nuevo para analizar.') +
          '<div class="login-cta"><a class="jbtn" href="' + ECPF_BASE + 'login">' + (t('jc_login_btn') || 'Iniciar sesión') + '</a>' +
          '<a class="jbtn ghost" href="' + ECPF_BASE + 'panel">' + (t('jc_panel_btn') || 'Ir al panel') + '</a></div>', 'error');
        analyzeBtn.disabled = false; return;
      }
      if (resp.status === 402) {
        hideProgress();
        var bal = '';
        try { var jb = await resp.json(); if (jb && jb.credits != null) bal = ' (' + jb.credits + ' ' + (EN ? 'credits' : 'créditos') + ')'; } catch (e) {}
        showMsg((EN ? 'You have no analysis credits' : 'No tienes créditos para analizar') + bal + '. ' +
          (EN ? 'Top up to run the analysis.' : 'Recarga para ejecutar el análisis.') +
          '<div class="login-cta"><a class="jbtn" href="' + ECPF_BASE + 'panel">' + (EN ? 'Recharge' : 'Recargar') + '</a></div>', 'error');
        try { if (window.parent !== window) window.parent.postMessage({ type: 'ecpf-recharge' }, '*'); } catch (e) {}
        analyzeBtn.disabled = false; return;
      }
      if (!resp.ok) {
        hideProgress();
        var detail = ''; try { var je = await resp.json(); if (je && je.error) detail = ' — ' + je.error; } catch (e) {}
        showMsg((EN ? 'The analysis could not be completed' : 'No se pudo completar el análisis') + ' (HTTP ' + resp.status + ')' + detail + '.', 'error');
        analyzeBtn.disabled = false; return;
      }
      var row = await resp.json();
      clearMsg();
      setProgress(100, EN ? 'Done' : 'Listo');
      setStatus(synthetic ? t('synthetic_notice') : '');
      if (row && row.credits != null) { try { if (window.parent !== window) window.parent.postMessage({ type: 'ecpf-credits', credits: row.credits }, '*'); } catch (e) {} }
      try { renderResults(row); } catch (e) { resultsEl.classList.remove('hidden'); setStatus(t('save_failed')); }
      // reveal animation
      [].forEach.call(resultsEl.querySelectorAll('.reveal'), function (el, i) { setTimeout(function () { el.classList.add('in'); }, 60 + i * 90); });
      drawOverlay();
      loadHistory();
      loadInsights();
      try { resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      setTimeout(hideProgress, 700);
    } catch (e) {
      hideProgress();
      showMsg((EN ? 'Network error while sending the analysis. Check your connection and try again.' : 'Error de red al enviar el análisis. Revisa tu conexión e intenta de nuevo.'), 'error');
    }
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
    var n = $('newJump'); if (n) n.addEventListener('click', function () { resultsEl.classList.add('hidden'); if (fileInput) fileInput.value = ''; manualFaults = []; renderMfChips(); review = { faults: [], i: -1, auto: false, nextStop: 0 }; setArcPlayhead(null); try { history.replaceState(null, '', BASE + '?lang=' + LANG); } catch (e) {} window.scrollTo({ top: 0, behavior: 'smooth' }); });
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
  bindMf();
  (function bindExtras() {
    var js = $('jnSave'); if (js) js.addEventListener('click', saveJournal);
    var ir = $('insRefresh'); if (ir) ir.addEventListener('click', loadInsights);
  })();
  var isShared = loadSharedReport();
  if (!isShared) {
    if (!getToken() && loginNotice) loginNotice.classList.remove('hidden');
    loadHistory();
    loadInsights();
  }
  var rev = [].slice.call(document.querySelectorAll('.wrap > header.reveal, .wrap > .panel.reveal'));
  rev.forEach(function (el, i) { setTimeout(function () { el.classList.add('in'); }, 80 + i * 90); });
})();
