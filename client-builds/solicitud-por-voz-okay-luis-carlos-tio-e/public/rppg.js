/* =====================================================
 * rppg.js v3 (MaraMed) — camera + face tracking + multi-ROI + rBCG head-motion
 * capture. The DSP lives in rppg-core.js (window.RppgCore). Face tracking:
 * MediaPipe FaceLandmarker (lazy CDN) -> FaceDetector API -> static ROI. Feeds
 * the core: 3 ROIs + background patch + head-motion (rBCG). Guided coaching,
 * SQI refuse-to-report, BP/SpO2 calibration-gated (localStorage), trends history.
 * Only computed metrics are POSTed; video never leaves the browser.
 * ===================================================== */
(function () {
  var I = window.__I18N || {};
  var Core = window.RppgCore;
  var $ = function (id) { return document.getElementById(id); };
  var video = $('cam'), overlay = $('overlay'), octx = overlay.getContext('2d');
  var work = $('work'), wctx = work.getContext('2d', { willReadFrequently: true });
  var startBtn = $('start'), stopBtn = $('stop'), simBtn = $('sim');
  var prog = $('prog'), hint = $('hint'), resultBox = $('result'), sqiBanner = $('sqiBanner'), saveMsg = $('saveMsg');

  var CAPTURE_MS = 30000, PROGRESSIVE_AFTER_MS = 8000, SQI_MIN = 35;
  var stream = null, raf = 0, capturing = false, startedAt = 0, lastCalc = 0;
  var landmarker = null, faceDetector = null, mode = 'static', faceSeen = false;
  var lastEstimate = null;
  var tracker = Core ? Core.KalmanHR() : null;

  var buf = fresh();
  function fresh() { return { t: [], forehead: mk(), lcheek: mk(), rcheek: mk(), bg: mk(), headY: [] }; }
  function mk() { return { r: [], g: [], b: [] }; }
  function tokenFromUrl() { var m = new URLSearchParams(location.search).get('token'); return m ? m.trim() : null; }

  // ---- calibration + trends (on-device only) ----
  function loadCal() { try { return JSON.parse(localStorage.getItem('maramed_cal') || '{}'); } catch (e) { return {}; } }
  function saveCal(c) { try { localStorage.setItem('maramed_cal', JSON.stringify(c)); } catch (e) {} }
  function pushHistory(rec) { try { var h = JSON.parse(localStorage.getItem('maramed_history') || '[]'); h.unshift(rec); localStorage.setItem('maramed_history', JSON.stringify(h.slice(0, 100))); } catch (e) {} }
  var CAL = loadCal();

  async function setupTracking() {
    try {
      var vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9');
      var fileset = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm');
      landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
        runningMode: 'VIDEO', numFaces: 1
      });
      mode = 'facemesh'; return;
    } catch (e) { landmarker = null; }
    try { if ('FaceDetector' in window) { faceDetector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: true }); mode = 'facedetector'; return; } } catch (e) {}
    mode = 'static';
  }

  async function startCamera() {
    if (stream) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = stream; await video.play().catch(function () {});
      // Best-effort exposure/white-balance lock (M1) where supported.
      try {
        var track = stream.getVideoTracks()[0], caps = track.getCapabilities ? track.getCapabilities() : {};
        var adv = [];
        if (caps.exposureMode && caps.exposureMode.indexOf('manual') >= 0) adv.push({ exposureMode: 'manual' });
        if (caps.whiteBalanceMode && caps.whiteBalanceMode.indexOf('manual') >= 0) adv.push({ whiteBalanceMode: 'manual' });
        if (adv.length) await track.applyConstraints({ advanced: adv }).catch(function () {});
      } catch (e) {}
      overlay.width = video.videoWidth || 640; overlay.height = video.videoHeight || 480;
      return true;
    } catch (e) { hint.textContent = I.camErr || 'Camera error'; return false; }
  }
  function stopCamera() { if (raf) cancelAnimationFrame(raf), raf = 0; if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }

  function computeROIs(ts) {
    var vw = video.videoWidth, vh = video.videoHeight, noseY = null;
    var rois = {
      forehead: [vw * 0.40, vh * 0.18, vw * 0.20, vh * 0.10],
      lcheek: [vw * 0.30, vh * 0.45, vw * 0.14, vh * 0.14],
      rcheek: [vw * 0.56, vh * 0.45, vw * 0.14, vh * 0.14],
      bg: [vw * 0.02, vh * 0.02, vw * 0.10, vh * 0.10] // top-left background patch (illumination ref)
    };
    faceSeen = (mode === 'static'); // static always "sees"
    try {
      if (mode === 'facemesh' && landmarker) {
        var res = landmarker.detectForVideo(video, ts);
        if (res && res.faceLandmarks && res.faceLandmarks[0]) {
          faceSeen = true;
          var lm = res.faceLandmarks[0], P = function (i) { return { x: lm[i].x * vw, y: lm[i].y * vh }; };
          var fh = P(10), lc = P(50), rc = P(280), nose = P(1), s = vw * 0.10;
          rois.forehead = [fh.x - s / 2, fh.y, s, vh * 0.08];
          rois.lcheek = [lc.x - s / 2, lc.y - s / 2, s, s];
          rois.rcheek = [rc.x - s / 2, rc.y - s / 2, s, s];
          noseY = nose.y; // for rBCG head micro-motion
        }
      }
    } catch (e) {}
    rois._noseY = noseY;
    return rois;
  }

  function sampleROI(x, y, w, h) {
    if (w < 4 || h < 4) return null;
    wctx.drawImage(video, x, y, w, h, 0, 0, work.width, work.height);
    var d = wctx.getImageData(0, 0, work.width, work.height).data, sr = 0, sg = 0, sb = 0, n = 0;
    for (var i = 0; i < d.length; i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 245 || mn < 12) continue;
      sr += r; sg += g; sb += b; n++;
    }
    if (!n) return null;
    return { r: sr / n, g: sg / n, b: sb / n };
  }
  function drawOverlay(rois) {
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.lineWidth = 2; octx.strokeStyle = 'rgba(34,211,238,.9)';
    ['forehead', 'lcheek', 'rcheek'].forEach(function (k) { var r = rois[k]; octx.strokeRect(r[0], r[1], r[2], r[3]); });
  }
  function push(tr, s) { if (s) { tr.r.push(s.r); tr.g.push(s.g); tr.b.push(s.b); } else { var n = tr.g.length; tr.r.push(n ? tr.r[n - 1] : 0); tr.g.push(n ? tr.g[n - 1] : 0); tr.b.push(n ? tr.b[n - 1] : 0); } }

  function loop() {
    if (!capturing) return;
    var now = performance.now(), rois = computeROIs(now);
    drawOverlay(rois);
    var sf = sampleROI.apply(null, rois.forehead), sl = sampleROI.apply(null, rois.lcheek), sr = sampleROI.apply(null, rois.rcheek), sbg = sampleROI.apply(null, rois.bg);
    buf.t.push(now);
    push(buf.forehead, sf); push(buf.lcheek, sl); push(buf.rcheek, sr); push(buf.bg, sbg);
    buf.headY.push(rois._noseY != null ? rois._noseY : (buf.headY.length ? buf.headY[buf.headY.length - 1] : 0));
    var elapsed = now - startedAt;
    prog.style.width = Math.min(100, (elapsed / CAPTURE_MS) * 100) + '%';
    coach(sf);
    if (elapsed > PROGRESSIVE_AFTER_MS && now - lastCalc > 2000) { lastCalc = now; computeAndRender(false); }
    if (elapsed >= CAPTURE_MS) { finishCapture(); return; }
    raf = requestAnimationFrame(loop);
  }

  // Guided coaching tied to live signal (Section 7).
  function coach(foreheadSample) {
    if (!faceSeen) { hint.textContent = I.coachFrame || ''; return; }
    if (foreheadSample && (foreheadSample.r + foreheadSample.g + foreheadSample.b) / 3 < 55) { hint.textContent = I.coachLight || ''; return; }
    var hy = buf.headY; if (hy.length > 15) { var seg = hy.slice(-15), m = seg.reduce(function (a, b) { return a + b; }, 0) / seg.length, v = 0; seg.forEach(function (x) { v += (x - m) * (x - m); }); if (Math.sqrt(v / seg.length) > 6) { hint.textContent = I.coachStill || ''; return; } }
    hint.textContent = I.capturing || '';
  }

  function traces() {
    return {
      t: buf.t,
      rois: ['forehead', 'lcheek', 'rcheek'].map(function (k) { return { t: buf.t, r: buf[k].r, g: buf[k].g, b: buf[k].b }; }),
      background: { r: buf.bg.r, g: buf.bg.g, b: buf.bg.b },
      headMotion: buf.headY.some(function (v) { return v; }) ? buf.headY : null,
      fs: 30
    };
  }

  function computeAndRender(isFinal) {
    if (!Core) return;
    var est = Core.estimateVitals(traces(), { calibration: { bp: CAL.bp, spo2: CAL.spo2 } });
    // Kalman-track HR over the progressive updates.
    if (est.bpm != null && tracker) est.bpm = tracker.update(est.bpm, 2, est.sqi / 100) || est.bpm;
    lastEstimate = est;
    resultBox.classList.remove('hidden');
    setSQI(est.sqi);
    if (isFinal && (est.sqi < SQI_MIN || est.bpm == null)) { showLowSignal(); return; }
    txt('hrVal', est.bpm != null ? est.bpm : '--');
    txt('rrVal', est.respiratory_bpm != null ? est.respiratory_bpm : '--');
    txt('hrvVal', est.hrv_sdnn_ms != null ? Math.round(est.hrv_sdnn_ms) : '--');
    renderBP(est); renderSpo2(est);
    hint.textContent = isFinal ? (I.done || '') : (I.refining || '');
    if (isFinal) { saveReading(est); pushHistory({ ts: Date.now(), bpm: est.bpm, rr: est.respiratory_bpm, sqi: est.sqi, sys: est.bp_systolic, dia: est.bp_diastolic, spo2: est.spo2 }); }
  }

  function renderBP(est) {
    if (est.bp_calibrated && est.bp_systolic != null) { txt('bpVal', est.bp_systolic + '/' + est.bp_diastolic); txt('bpState', ''); }
    else { txt('bpVal', '--'); txt('bpState', I.needsCal || ''); }
  }
  function renderSpo2(est) {
    if (est.spo2_calibrated && est.spo2 != null) { txt('spo2Val', est.spo2); txt('spo2State', ''); }
    else { txt('spo2Val', '--'); txt('spo2State', I.needsCal || ''); }
  }

  function setSQI(sqi) {
    $('sqiBar').style.width = Math.max(0, Math.min(100, sqi)) + '%';
    var dot = $('sqiDot'), t = $('sqiTxt');
    if (sqi >= 60) { dot.style.background = '#4ade80'; t.textContent = (I.sqiGood || 'Good') + ' (' + sqi + ')'; }
    else if (sqi >= SQI_MIN) { dot.style.background = '#f59e0b'; t.textContent = (I.sqiFair || 'Fair') + ' (' + sqi + ')'; }
    else { dot.style.background = '#ef4444'; t.textContent = sqi + ''; }
  }
  function showLowSignal() {
    sqiBanner.className = 'mt-4 text-sm rounded-xl px-3 py-2 bg-red-500/15 text-red-300 border border-red-500/30';
    sqiBanner.textContent = I.sqiLow || 'Insufficient signal.';
    ['hrVal', 'rrVal', 'hrvVal', 'bpVal', 'spo2Val'].forEach(function (id) { txt(id, '--'); });
    hint.textContent = I.lowConf || '';
  }
  function txt(id, v) { var el = $(id); if (el) el.textContent = v; }

  function finishCapture() {
    capturing = false; if (raf) cancelAnimationFrame(raf), raf = 0;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    startBtn.disabled = false; stopBtn.disabled = true; simBtn.disabled = false;
    computeAndRender(true);
  }

  async function saveReading(est) {
    saveMsg.textContent = '…';
    var token = tokenFromUrl(), headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var payload = {
      bpm: est.bpm, respiratory_bpm: est.respiratory_bpm,
      hrv_sdnn_ms: est.hrv_sdnn_ms, hrv_rmssd_ms: est.hrv_rmssd_ms,
      sqi: est.sqi, duration_s: Math.round(CAPTURE_MS / 1000), source: est.source || 'rppg',
      metrics: { method: est.method, hr_source: est.hr_source, motion: est.motion }
    };
    if (est.bp_calibrated) { payload.bp_systolic = est.bp_systolic; payload.bp_diastolic = est.bp_diastolic; }
    if (est.spo2_calibrated) { payload.spo2 = est.spo2; }
    try {
      var r = await fetch('api/v1/readings', { method: 'POST', headers: headers, body: JSON.stringify(payload) });
      if (r.ok) { saveMsg.className = 'text-sm mt-3 text-emerald-400'; saveMsg.textContent = I.saved || 'Saved.'; }
      else { saveMsg.className = 'text-sm mt-3 text-amber-400'; saveMsg.textContent = (I.saveErr || 'Could not save.') + ' (' + r.status + ')'; }
    } catch (e) { saveMsg.className = 'text-sm mt-3 text-amber-400'; saveMsg.textContent = I.saveErr || 'Could not save.'; }
  }

  // ---- calibration buttons (BP + SpO2) — guarded (absent on the compact embed) ----
  if ($('calBp')) $('calBp').addEventListener('click', function () {
    if (!lastEstimate || !lastEstimate.bp_features) { alert(I.calBp || ''); return; }
    var s = prompt((I.calBp || '') + '\nSistólica:'); if (!s) return;
    var d = prompt('Diastólica:'); if (!d) return;
    var sys = parseInt(s, 10), dia = parseInt(d, 10);
    if (!(sys >= 60 && sys <= 260 && dia >= 30 && dia <= 160)) { alert('?'); return; }
    CAL.bp = { ref_sys: sys, ref_dia: dia, ref_amp: lastEstimate.bp_features.amplitude, ref_rise: lastEstimate.bp_features.rise_proxy };
    saveCal(CAL); if ($('bpState')) $('bpState').textContent = I.calSaved || 'saved';
  });
  if ($('calSpo2')) $('calSpo2').addEventListener('click', function () {
    if (!lastEstimate || lastEstimate.spo2_ratio == null) { alert(I.calSpo2 || ''); return; }
    var v = prompt(I.calSpo2 || ''); if (!v) return;
    var sp = parseInt(v, 10); if (!(sp >= 70 && sp <= 100)) { alert('?'); return; }
    CAL.spo2 = { ref_ratio: lastEstimate.spo2_ratio, ref_spo2: sp };
    saveCal(CAL); if ($('spo2State')) $('spo2State').textContent = I.calSaved || 'saved';
  });

  startBtn.addEventListener('click', async function () {
    resultBox.classList.add('hidden'); sqiBanner.className = 'hidden';
    startBtn.disabled = true; hint.textContent = '…';
    var ok = await startCamera(); if (!ok) { startBtn.disabled = false; return; }
    if (!landmarker && !faceDetector) await setupTracking();
    buf = fresh(); tracker = Core ? Core.KalmanHR() : null;
    capturing = true; startedAt = performance.now(); lastCalc = startedAt;
    stopBtn.disabled = false; simBtn.disabled = true;
    hint.textContent = I.early || I.capturing || 'Capturing…';
    raf = requestAnimationFrame(loop);
  });
  stopBtn.addEventListener('click', function () {
    capturing = false; if (raf) cancelAnimationFrame(raf), raf = 0;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    startBtn.disabled = false; stopBtn.disabled = true; simBtn.disabled = false;
    prog.style.width = '0%'; hint.textContent = I.ready || '';
  });

  // Stuck-loop fallback: submit a plausible simulated reading (Principal signals only).
  simBtn.addEventListener('click', function () {
    var est = { bpm: 60 + Math.floor(Math.random() * 40), respiratory_bpm: 12 + Math.floor(Math.random() * 8), hrv_sdnn_ms: 30 + Math.floor(Math.random() * 40), hrv_rmssd_ms: 25 + Math.floor(Math.random() * 35), sqi: 72, source: 'simulated', method: 'simulated', bp_calibrated: false, spo2_calibrated: false };
    resultBox.classList.remove('hidden'); sqiBanner.className = 'hidden';
    setSQI(est.sqi); txt('hrVal', est.bpm); txt('rrVal', est.respiratory_bpm); txt('hrvVal', est.hrv_sdnn_ms); txt('bpVal', '--'); txt('spo2Val', '--');
    txt('bpState', I.needsCal || ''); txt('spo2State', I.needsCal || '');
    saveReading(est);
  });

  window.addEventListener('beforeunload', stopCamera);
})();
