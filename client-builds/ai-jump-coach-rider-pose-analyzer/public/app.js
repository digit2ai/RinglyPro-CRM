/* =====================================================
 * AI Jump Coach — Rider Pose Analyzer (browser)
 *
 * 1. Load MediaPipe Pose (tasks-vision) from CDN, pinned.
 *    TODO: vendor the wasm + .task model assets to remove the CDN dependency.
 * 2. Sample the uploaded video at ~5fps via <video> + currentTime seeking,
 *    run PoseLandmarker per sampled frame -> keypoint frames array.
 * 3. POST { filename, durationSec, frames } to /api/v1/analyses (JWT). The
 *    Node fault engine returns the persisted row incl. faults[].
 * 4. Render side-by-side: original video + skeleton overlay + fault timeline
 *    (each fault seeks the player). If the model can't load, fall back to a
 *    synthetic keypoint generator so the end-to-end flow is still demonstrable.
 * ===================================================== */
(function () {
  'use strict';

  var MP_VER = '0.10.14';
  var MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + MP_VER;
  var MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
  var SAMPLE_FPS = 5;
  var MAX_FRAMES = 320; // ~64s at 5fps — caps CPU + payload

  var I18N = window.__I18N || {};
  var LANG = window.__LANG || 'es';
  var BASE = window.__BASE || '/';

  var $ = function (id) { return document.getElementById(id); };
  var fileInput = $('file');
  var analyzeBtn = $('analyzeBtn');
  var statusEl = $('status');
  var resultsEl = $('results');
  var player = $('player');
  var faultList = $('faultList');
  var apexLine = $('apexLine');
  var loginNotice = $('loginNotice');

  var frames = [];          // last computed keypoint frames (for overlay)
  var overlayCanvas = null;
  var lastFaults = [];

  // ---- i18n ----------------------------------------------------------------
  function t(key) { return (I18N && I18N[key]) || key; }
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (I18N[k]) el.textContent = I18N[k];
    });
    var sel = $('langSel');
    if (sel) {
      sel.value = LANG;
      sel.addEventListener('change', function () {
        var u = new URL(window.location.href);
        u.searchParams.set('lang', sel.value);
        window.location.href = u.toString();
      });
    }
  }

  // ---- auth ----------------------------------------------------------------
  function getToken() {
    try {
      var q = new URL(window.location.href).searchParams.get('token');
      if (q) return q;
    } catch (e) {}
    try { return localStorage.getItem('token') || ''; } catch (e) { return ''; }
  }

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }

  // ---- MediaPipe load (lazy, cached) --------------------------------------
  var landmarkerPromise = null;
  function loadLandmarker() {
    if (landmarkerPromise) return landmarkerPromise;
    landmarkerPromise = (async function () {
      var vision = await import(MP_BASE + '/vision_bundle.mjs');
      var fileset = await vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
      var lm = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1
      });
      return lm;
    })();
    return landmarkerPromise;
  }

  // ---- frame sampling ------------------------------------------------------
  function seekTo(video, time) {
    return new Promise(function (resolve) {
      var done = function () { video.removeEventListener('seeked', done); resolve(); };
      video.addEventListener('seeked', done);
      video.currentTime = Math.min(time, Math.max(0, (video.duration || 0) - 0.001));
    });
  }

  // Run MediaPipe over the uploaded video, sampling at SAMPLE_FPS.
  async function extractFramesWithModel(video) {
    var lm = await loadLandmarker();
    var dur = video.duration || 0;
    var out = [];
    var step = 1 / SAMPLE_FPS;
    var count = Math.min(MAX_FRAMES, Math.max(1, Math.floor(dur / step)));
    for (var i = 0; i < count; i++) {
      var time = i * step;
      await seekTo(video, time);
      var res = lm.detectForVideo(video, Math.round(time * 1000));
      var lms = (res && res.landmarks && res.landmarks[0]) || null;
      var kps = lms ? lms.map(function (p) {
        return { x: p.x, y: p.y, z: p.z || 0, visibility: (p.visibility != null ? p.visibility : 1) };
      }) : [];
      out.push({ t: Math.round(time * 1000) / 1000, keypoints: kps });
    }
    return out;
  }

  // Synthetic keypoint generator — used only when the model can't load. Produces
  // a plausible jump arc that trips at least one fault so the flow is testable.
  function syntheticFrames(video) {
    var dur = video.duration || 6;
    var step = 1 / SAMPLE_FPS;
    var count = Math.min(MAX_FRAMES, Math.max(8, Math.floor(dur / step)));
    var out = [];
    for (var i = 0; i < count; i++) {
      var time = i * step;
      var phase = i / (count - 1);                 // 0..1
      var arc = Math.sin(phase * Math.PI);         // 0 at ends, 1 at apex
      var baseY = 0.62 - 0.22 * arc;               // body rises toward apex
      var travelX = 0.30 + 0.40 * phase;           // moving left -> right
      // After apex, tip the rider forward (forward_seat) + drop the hands late.
      var forward = phase > 0.55 ? (phase - 0.55) * 0.5 : 0;
      var kp = new Array(33).fill(null).map(function () { return { x: travelX, y: baseY, z: 0, visibility: 1 }; });
      function set(idx, x, y) { kp[idx] = { x: travelX + x, y: baseY + y, z: 0, visibility: 1 }; }
      set(0,  forward * 0.6, -0.20);               // nose
      set(2,  forward * 0.6, -0.21);               // left eye
      set(5,  forward * 0.6, -0.21);               // right eye
      set(11, forward,       -0.10);               // L shoulder
      set(12, forward,       -0.10);               // R shoulder
      set(13, forward * 0.8, -0.02);               // L elbow
      set(14, forward * 0.8, -0.02);               // R elbow
      set(15, forward * 0.8,  0.04 + arc * 0.04);  // L wrist (drops below elbow late)
      set(16, forward * 0.8,  0.04 + arc * 0.04);  // R wrist
      set(23, forward,        0.00);               // L hip (ahead at landing)
      set(24, forward,        0.00);               // R hip
      set(25, 0,              0.12);               // L knee
      set(26, 0,              0.12);               // R knee
      set(27, 0,              0.26);               // L ankle (stays back)
      set(28, 0,              0.26);               // R ankle
      out.push({ t: Math.round(time * 1000) / 1000, keypoints: kp });
    }
    return out;
  }

  // ---- skeleton overlay ----------------------------------------------------
  var CONNECTIONS = [
    [11,12],[11,13],[13,15],[12,14],[14,16],   // arms + shoulders
    [11,23],[12,24],[23,24],                    // torso
    [23,25],[25,27],[24,26],[26,28],            // legs
    [0,11],[0,12]                                // head to shoulders
  ];

  function ensureOverlay() {
    if (overlayCanvas) return overlayCanvas;
    var parent = player.parentNode;
    parent.style.position = 'relative';
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.left = '0';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.pointerEvents = 'none';
    parent.insertBefore(overlayCanvas, player.nextSibling);
    return overlayCanvas;
  }

  function nearestFrame(time) {
    if (!frames.length) return null;
    var best = frames[0], bd = Infinity;
    for (var i = 0; i < frames.length; i++) {
      var d = Math.abs(frames[i].t - time);
      if (d < bd) { bd = d; best = frames[i]; }
    }
    return best;
  }

  function drawOverlay() {
    if (!overlayCanvas) return;
    var w = player.clientWidth, h = player.clientHeight;
    if (!w || !h) return;
    overlayCanvas.width = w; overlayCanvas.height = h;
    overlayCanvas.style.width = w + 'px'; overlayCanvas.style.height = h + 'px';
    var ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    var f = nearestFrame(player.currentTime);
    if (!f || !f.keypoints || !f.keypoints.length) return;
    var kp = f.keypoints;
    ctx.strokeStyle = 'rgba(155,123,255,0.9)';
    ctx.lineWidth = 2;
    CONNECTIONS.forEach(function (c) {
      var a = kp[c[0]], b = kp[c[1]];
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(a.x * w, a.y * h);
      ctx.lineTo(b.x * w, b.y * h);
      ctx.stroke();
    });
    ctx.fillStyle = 'rgba(52,211,153,0.95)';
    kp.forEach(function (p) {
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ---- results render ------------------------------------------------------
  function faultLabel(type) {
    var map = { left_behind: 'fault_left_behind', dropped_rein: 'fault_dropped_rein', gaze_drop: 'fault_gaze_drop', forward_seat: 'fault_forward_seat' };
    return t(map[type] || type);
  }

  function renderResults(row) {
    lastFaults = row.faults || [];
    resultsEl.classList.remove('hidden');
    ensureOverlay();
    if (apexLine && row.apex_sec != null) {
      apexLine.textContent = t('apex_label') + ': ' + row.apex_sec.toFixed(2) + ' ' + t('second_abbr');
    }
    faultList.innerHTML = '';
    if (!lastFaults.length) {
      var none = document.createElement('div');
      none.className = 'muted';
      none.textContent = t('no_faults');
      faultList.appendChild(none);
      return;
    }
    lastFaults.forEach(function (fault) {
      var pct = Math.round((fault.confidence || 0) * 100);
      var row2 = document.createElement('div');
      row2.className = 'fault';
      row2.title = t('jump_to');
      row2.innerHTML =
        '<span class="dot"></span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;justify-content:space-between;gap:10px">' +
            '<strong>' + faultLabel(fault.type) + '</strong>' +
            '<span class="ts">' + (fault.timestampSec).toFixed(2) + ' ' + t('second_abbr') + '</span>' +
          '</div>' +
          '<div class="muted" style="font-size:12px;margin-top:2px">' + pct + '% ' + t('confidence') + '</div>' +
          '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        '</div>';
      row2.addEventListener('click', function () {
        try { player.currentTime = fault.timestampSec; player.play().catch(function () {}); } catch (e) {}
      });
      faultList.appendChild(row2);
    });
  }

  // ---- main flow -----------------------------------------------------------
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) { analyzeBtn.disabled = true; return; }
    var url = URL.createObjectURL(f);
    player.src = url;
    analyzeBtn.disabled = false;
    resultsEl.classList.add('hidden');
    setStatus('');
  });

  player.addEventListener('timeupdate', drawOverlay);
  player.addEventListener('loadedmetadata', drawOverlay);
  window.addEventListener('resize', drawOverlay);

  analyzeBtn.addEventListener('click', async function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    var token = getToken();
    if (!token) { if (loginNotice) loginNotice.classList.remove('hidden'); return; }

    analyzeBtn.disabled = true;
    var probe = document.createElement('video');
    probe.muted = true; probe.playsInline = true; probe.preload = 'auto';
    probe.src = player.src;
    await new Promise(function (res) {
      if (probe.readyState >= 1) return res();
      probe.addEventListener('loadedmetadata', function () { res(); }, { once: true });
    });

    var synthetic = false;
    try {
      setStatus(t('loading_model'));
      await loadLandmarker();
      setStatus(t('extracting'));
      frames = await extractFramesWithModel(probe);
      // If the model loaded but produced no usable poses, fall back.
      var withPose = frames.filter(function (fr) { return fr.keypoints && fr.keypoints.length; }).length;
      if (withPose < 2) { synthetic = true; frames = syntheticFrames(probe); }
    } catch (e) {
      synthetic = true;
      frames = syntheticFrames(probe);
    }

    if (synthetic) setStatus(t('synthetic_notice'));
    else setStatus(t('analyzing'));

    try {
      var resp = await fetch(BASE + 'api/v1/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ filename: f.name, durationSec: probe.duration || null, frames: frames, lang: LANG })
      });
      if (resp.status === 401) { if (loginNotice) loginNotice.classList.remove('hidden'); setStatus(t('need_login')); analyzeBtn.disabled = false; return; }
      if (resp.status === 402) {
        setStatus(t('no_credits') !== 'no_credits' ? t('no_credits') : (LANG === 'en' ? 'Out of credits. Recharge in the panel to continue.' : 'Sin créditos. Recarga en el panel para continuar.'));
        try { if (window.parent !== window) window.parent.postMessage({ type: 'ecpf-recharge' }, '*'); } catch (e) {}
        analyzeBtn.disabled = false; return;
      }
      if (!resp.ok) { setStatus(t('save_failed')); analyzeBtn.disabled = false; return; }
      var row = await resp.json();
      setStatus(synthetic ? t('synthetic_notice') : '');
      // Tell the parent panel to refresh the credit chip.
      if (row && row.credits != null) { try { if (window.parent !== window) window.parent.postMessage({ type: 'ecpf-credits', credits: row.credits }, '*'); } catch (e) {} }
      renderResults(row);
      drawOverlay();
    } catch (e) {
      setStatus(t('save_failed'));
    }
    analyzeBtn.disabled = false;
  });

  // ---- boot ----------------------------------------------------------------
  applyI18n();
  if (!getToken() && loginNotice) loginNotice.classList.remove('hidden');
})();
