// =====================================================
// player.js — the bedtime player.
//
// Two taps to a self-terminating night: pick a track, press Iniciar. The loop
// plays through an HTML5 <audio> element, the volume fades over the final five
// minutes, and playback stops at timer expiry with nobody touching the phone.
//
// Fade engines, in order of preference:
//   1. Web Audio GainNode on a MediaElementSource — the only path that can
//      fade on iOS, where HTMLMediaElement.volume is read-only.
//   2. A linear ramp on element.volume — used when the AudioContext cannot be
//      created or has been killed by the OS.
// Either way the hard stop at expiry is driven by the timer, not by the fade,
// so the night ends even if the fade silently no-ops.
// =====================================================

'use strict';

(function () {
  const CFG = window.SUENO || {};
  const MOUNT = CFG.mount || '';
  const DICT = (CFG.dict && CFG.dict[CFG.lang]) || {};
  const FADE_SECONDS = 5 * 60;          // the final five minutes
  const TOKEN_KEY = 'sueno_anon_token';

  const el = (id) => document.getElementById(id);
  const audio = el('sleep-audio');
  const trackSelect = el('track-select');
  const trackNote = el('track-note');
  const timerInput = el('timer-input');
  const timerReadout = el('timer-readout');
  const startBtn = el('start-btn');
  const pauseBtn = el('pause-btn');
  const stopBtn = el('stop-btn');
  const runningControls = el('running-controls');
  const countdownCard = el('countdown-card');
  const countdownEl = el('countdown');
  const nowPlaying = el('now-playing');
  const progress = el('progress');
  const fadeBadge = el('fade-badge');
  const statusEl = el('status');
  const moon = el('moon');
  const langToggle = el('lang-toggle');

  let tracks = [];
  const session = {
    active: false,
    paused: false,
    track: null,
    timerMinutes: 60,
    totalSeconds: 0,
    remaining: 0,
    playedSeconds: 0,
    fadeSeconds: FADE_SECONDS,
    logged: false,
    tick: null,
  };

  // --- anonymous device identifier -------------------------------------------
  // A random UUID that owns this device's history rows. Not personally
  // identifying; never sent anywhere but our own session endpoint.
  function anonToken() {
    let t = null;
    try { t = localStorage.getItem(TOKEN_KEY); } catch (e) { /* private mode */ }
    if (!t) {
      t = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'a' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* session-only */ }
    }
    return t;
  }

  // --- fade maths (pure, unit-testable) --------------------------------------
  // Full volume until the fade window opens, then a straight line to silence.
  function computeFadeGain(remainingSeconds, fadeSeconds) {
    if (fadeSeconds <= 0) return remainingSeconds > 0 ? 1 : 0;
    if (remainingSeconds >= fadeSeconds) return 1;
    if (remainingSeconds <= 0) return 0;
    return remainingSeconds / fadeSeconds;
  }

  // How long the fade may last: never more than half a short night.
  function fadeWindowFor(totalSeconds) {
    return Math.max(1, Math.min(FADE_SECONDS, Math.floor(totalSeconds / 2)));
  }

  function fmt(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  // --- audio engine ----------------------------------------------------------
  const engine = { kind: null, ctx: null, gain: null, source: null };

  function ensureGainEngine() {
    if (engine.kind === 'gain' && engine.ctx) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    try {
      engine.ctx = new Ctor();
      engine.source = engine.ctx.createMediaElementSource(audio);
      engine.gain = engine.ctx.createGain();
      engine.gain.gain.value = 1;
      engine.source.connect(engine.gain);
      engine.gain.connect(engine.ctx.destination);
      engine.kind = 'gain';
      return true;
    } catch (err) {
      console.warn('[sueno] Web Audio unavailable, falling back to volume ramp:', err && err.message);
      engine.kind = 'volume';
      return false;
    }
  }

  // The volume-ramp fallback. On iOS this is a no-op (volume is read-only) —
  // the timer still stops playback, so the night still ends correctly.
  function rampVolume(value) {
    const v = Math.max(0, Math.min(1, value));
    try { audio.volume = v; } catch (e) { /* read-only on iOS */ }
    return v;
  }

  function applyGain(value) {
    const v = Math.max(0, Math.min(1, value));
    if (engine.kind === 'gain' && engine.gain && engine.ctx) {
      try {
        // Short ramp instead of a step, so each tick is inaudible.
        engine.gain.gain.cancelScheduledValues(engine.ctx.currentTime);
        engine.gain.gain.setValueAtTime(engine.gain.gain.value, engine.ctx.currentTime);
        engine.gain.gain.linearRampToValueAtTime(v, engine.ctx.currentTime + 1.0);
        return v;
      } catch (err) {
        console.warn('[sueno] gain ramp failed, switching to volume ramp:', err && err.message);
        engine.kind = 'volume';
      }
    }
    return rampVolume(v);
  }

  // --- library ---------------------------------------------------------------
  async function loadTracks() {
    const res = await fetch(`${MOUNT}/api/v1/tracks?lang=${encodeURIComponent(CFG.lang || 'es')}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    tracks = await res.json();
    trackSelect.innerHTML = '';
    for (const t of tracks) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.title} · ${t.category}`;
      trackSelect.appendChild(opt);
    }
    const preferred = (() => { try { return localStorage.getItem('sueno_last_track'); } catch (e) { return null; } })();
    if (preferred && tracks.some((t) => t.id === preferred)) trackSelect.value = preferred;
    describeTrack();
  }

  function selectedTrack() {
    return tracks.find((t) => t.id === trackSelect.value) || null;
  }

  function describeTrack() {
    const t = selectedTrack();
    if (!t) { trackNote.textContent = ''; return; }
    trackNote.textContent = (t.description || '') + (t.stereo_required ? ` · ${DICT.headphones || ''}` : '');
  }

  // --- session lifecycle -----------------------------------------------------
  function setRunningUI(running) {
    runningControls.hidden = !running;
    countdownCard.hidden = !running;
    startBtn.hidden = running;
    trackSelect.disabled = running;
    timerInput.disabled = running;
    if (moon) moon.classList.toggle('is-playing', running);
  }

  function paintCountdown() {
    countdownEl.textContent = fmt(session.remaining);
    const done = session.totalSeconds > 0
      ? ((session.totalSeconds - session.remaining) / session.totalSeconds) * 100 : 0;
    progress.style.width = Math.max(0, Math.min(100, done)) + '%';
    const fading = session.remaining <= session.fadeSeconds && session.remaining > 0;
    fadeBadge.hidden = !fading;
  }

  async function start() {
    const track = selectedTrack();
    if (!track) { statusEl.textContent = DICT.status_idle || ''; return; }

    const minutes = parseInt(timerInput.value, 10) || 60;
    session.active = true;
    session.paused = false;
    session.track = track;
    session.timerMinutes = minutes;
    session.totalSeconds = minutes * 60;
    session.remaining = session.totalSeconds;
    session.playedSeconds = 0;
    session.fadeSeconds = fadeWindowFor(session.totalSeconds);
    session.logged = false;

    try { localStorage.setItem('sueno_last_track', track.id); } catch (e) { /* ignore */ }

    // Must happen inside the click gesture for mobile autoplay policy.
    ensureGainEngine();
    audio.src = track.url;
    audio.loop = track.loop !== false;
    audio.currentTime = 0;
    applyGain(1);

    nowPlaying.textContent = track.title;
    setRunningUI(true);
    paintCountdown();

    try {
      if (engine.ctx && engine.ctx.state === 'suspended') await engine.ctx.resume();
      await audio.play();
      statusEl.textContent = '';
    } catch (err) {
      console.error('[sueno] playback blocked:', err && err.message);
      statusEl.textContent = (CFG.lang === 'en')
        ? 'The browser blocked playback. Tap Start again.'
        : 'El navegador bloqueó la reproducción. Pulsa Iniciar de nuevo.';
      finish(false);
      return;
    }

    clearInterval(session.tick);
    session.tick = setInterval(onTick, 1000);
    pauseBtn.textContent = DICT.pause || 'Pausar';
  }

  function onTick() {
    if (!session.active || session.paused) return;
    session.remaining -= 1;
    session.playedSeconds += 1;
    applyGain(computeFadeGain(session.remaining, session.fadeSeconds));
    paintCountdown();
    if (session.remaining <= 0) finish(true);
  }

  function togglePause() {
    if (!session.active) return;
    session.paused = !session.paused;
    if (session.paused) {
      audio.pause();
      pauseBtn.textContent = CFG.lang === 'en' ? 'Resume' : 'Reanudar';
      if (moon) moon.classList.remove('is-playing');
    } else {
      audio.play().catch(() => {});
      pauseBtn.textContent = DICT.pause || 'Pausar';
      if (moon) moon.classList.add('is-playing');
    }
  }

  // completed=true only when the timer ran all the way out on its own.
  function finish(completed) {
    if (!session.active) return;
    clearInterval(session.tick);
    session.tick = null;
    session.active = false;
    session.paused = false;
    try { audio.pause(); } catch (e) { /* ignore */ }
    applyGain(0);
    setRunningUI(false);
    fadeBadge.hidden = true;
    statusEl.textContent = completed ? (DICT.finished || '') : (DICT.status_idle || '');
    logSession(completed, false);
  }

  function logSession(completed, keepalive) {
    if (session.logged || !session.track) return;
    session.logged = true;
    const payload = {
      track_id: session.track.id,
      timer_minutes: session.timerMinutes,
      played_seconds: Math.round(session.playedSeconds),
      completed: !!completed,
      language: CFG.lang || 'es',
    };
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-anon-token': anonToken() },
      body: JSON.stringify(payload),
    };
    if (keepalive) opts.keepalive = true;   // survives the tab closing
    fetch(`${MOUNT}/api/v1/sessions`, opts).catch((err) => {
      console.error('[sueno] could not log session:', err && err.message);
      session.logged = false;               // allow a retry next time round
    });
  }

  // --- wiring ----------------------------------------------------------------
  timerInput.addEventListener('input', () => { timerReadout.textContent = timerInput.value; });
  trackSelect.addEventListener('change', describeTrack);
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', togglePause);
  stopBtn.addEventListener('click', () => finish(false));

  // A track that somehow ends (loop off) must not leave a running countdown.
  audio.addEventListener('ended', () => { if (session.active && !audio.loop) finish(false); });
  audio.addEventListener('error', () => {
    if (!session.active) return;
    console.error('[sueno] audio element error');
    statusEl.textContent = CFG.lang === 'en' ? 'That track failed to load.' : 'Esa pista no se pudo cargar.';
    finish(false);
  });

  // The OS suspends the AudioContext when the screen locks; bring it back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !session.active || session.paused) return;
    if (engine.ctx && engine.ctx.state === 'suspended') engine.ctx.resume().catch(() => {});
    if (audio.paused) audio.play().catch(() => {});
  });

  // Best-effort log if the phone is closed mid-night.
  window.addEventListener('pagehide', () => { if (session.active) logSession(false, true); });

  langToggle.addEventListener('click', (ev) => {
    ev.preventDefault();
    const next = (CFG.lang === 'en') ? 'es' : 'en';
    window.location.search = '?lang=' + next;
  });

  loadTracks().catch((err) => {
    console.error('[sueno] track library failed to load:', err && err.message);
    statusEl.textContent = CFG.lang === 'en'
      ? 'The track library is unavailable right now.'
      : 'La biblioteca de pistas no está disponible por ahora.';
    startBtn.disabled = true;
  });

  // Exposed for the SIT harness and for debugging in the console.
  window.SUENO.computeFadeGain = computeFadeGain;
  window.SUENO.fadeWindowFor = fadeWindowFor;
  window.SUENO.rampVolume = rampVolume;
  window.SUENO.anonToken = anonToken;
  window.SUENO.FADE_SECONDS = FADE_SECONDS;
})();
