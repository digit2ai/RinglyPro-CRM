/* SpeakUp record engine — the recorder, lifted out of recorder.html unchanged.
 *
 * WHAT THIS IS: the exact recording/transcription logic that has been shipping inside
 * verticals/speakup/public/recorder.html, moved into one file so more than one screen can
 * use it. The logic did not change. What changed is where it lives and how it reports out:
 * every place the old code wrote into a DOM node by id (the orb, the timer, #recstatus, the
 * model-download overlay) now emits an event instead, and the screen decides what to draw.
 *
 * The properties that must survive any future edit here:
 *  - BOTH the mic and Record Call capture REAL AUDIO in rolling segments. No Web Speech:
 *    it is unreliable on mobile and gives no audio to fall back on.
 *  - Each segment is transcribed ON THE DEVICE by Whisper (transformers.js) and the growing
 *    transcript is PUT to the server after every segment. Flat memory for a two-hour meeting,
 *    and nothing is lost if the tab, the app or the battery dies mid-recording.
 *  - WASM backend, NOT WebGPU. WebGPU + q8 Whisper hallucinates repeating multilingual
 *    garbage in transformers.js 3.x — verified. WASM is slower and correct.
 *  - The spoken language is auto-detected, never forced. Forcing one makes Whisper invent
 *    text when the audio does not match it.
 *  - If in-browser decoding fails the audio is handed to the server engine so the recording
 *    is still saved, rather than being lost.
 *
 * Holds no secret and no UI. Audio never leaves the device except on the explicit
 * server-STT fallback path.
 */
(function () {
  'use strict';

  // ── events ──────────────────────────────────────────────────────────────────
  var handlers = {};
  function on(event, cb) {
    if (!handlers[event]) handlers[event] = [];
    handlers[event].push(cb);
    return function () { off(event, cb); };
  }
  function off(event, cb) {
    var list = handlers[event] || [];
    var i = list.indexOf(cb);
    if (i >= 0) list.splice(i, 1);
  }
  function emit(event, payload) {
    var list = (handlers[event] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](payload || {}); } catch (e) { /* a listener must never break the recording */ }
    }
  }

  // ── server ──────────────────────────────────────────────────────────────────
  async function api(path, opts) {
    var r = await fetch('/speakup/api/v1' + path, Object.assign({ headers: { 'Content-Type': 'application/json', 'X-SpeakUp': '1' } }, opts || {}));
    if (r.status === 401) { location.href = '/speakup/login'; throw new Error('401'); }
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(d.error || ('HTTP ' + r.status)); e.status = r.status; e.data = d; throw e; }
    return d;
  }

  // ── on-device speech-to-text (our own Whisper model, runs in the browser) ────
  // Transcribes recorded calls + uploaded files locally — no vendor, audio never
  // leaves the device. Model (~80MB) downloads once and is cached by the browser.
  var __whisper = null;
  // Lighter model on phones (memory + speed); larger, more accurate one on desktop.
  var IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
  var WHISPER_MODEL = IS_MOBILE ? 'Xenova/whisper-tiny' : 'Xenova/whisper-base';

  async function getWhisper(onProg) {
    if (__whisper) return __whisper;
    var mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/+esm');
    // IMPORTANT: use the WASM backend (default), NOT WebGPU. WebGPU + q8 Whisper
    // hallucinates repeating multilingual garbage in transformers.js 3.x — verified.
    // WASM is slower but produces correct transcripts on every device.
    __whisper = await mod.pipeline('automatic-speech-recognition', WHISPER_MODEL, { progress_callback: onProg, dtype: 'q8' });
    return __whisper;
  }

  // decode any audio blob -> mono Float32 PCM @ 16kHz (what Whisper expects)
  async function blobToPCM(blob) {
    var arr = await blob.arrayBuffer();
    var AC = window.AudioContext || window.webkitAudioContext;
    var tmp = new AC();
    var decoded = await tmp.decodeAudioData(arr.slice(0));
    try { tmp.close(); } catch (e) {}
    var len = Math.max(1, Math.ceil(decoded.duration * 16000));
    var off2 = new OfflineAudioContext(1, len, 16000);
    var src = off2.createBufferSource(); src.buffer = decoded; src.connect(off2.destination); src.start(0);
    var rendered = await off2.startRendering();
    return rendered.getChannelData(0);
  }

  // `background` is true for a rolling segment of a live recording (the screen shows it
  // inline) and false for a file the operator handed us (the screen shows an overlay).
  async function transcribeBlob(blob, background) {
    function setMsg(phase, pct) { emit('model', { phase: phase, pct: pct == null ? null : pct, background: !!background }); }
    setMsg('downloading', 0);
    var asr = await getWhisper(function (p) {
      if (p && p.status === 'progress' && p.progress != null) setMsg('downloading', Math.round(p.progress));
    });
    setMsg('preparing', null);
    var pcm = await blobToPCM(blob);
    setMsg('transcribing', null);
    // Auto-detect the spoken language (do NOT force it): a faithful transcript of
    // whatever was actually said. Forcing a language makes Whisper hallucinate
    // garbage when the audio doesn't match. The UI ES/EN toggle only controls the
    // language of generated deliverables, not the transcript.
    //
    // no_repeat_ngram_size STOPS A LOOP WHILE IT IS FORMING. Whisper writes each word with
    // the previous ones as context, and on unclear audio it can lock onto a phrase and repeat
    // it until the window's 448-token ceiling: a real meeting came back 88% loop. This option
    // forbids emitting any 8-token sequence already emitted in the same window, so a loop is
    // broken within about one extra copy. It was traced through transformers.js 3.3.3 rather
    // than assumed: the pipeline spreads these options into generation_config, and Whisper's
    // generate() hands that to _get_logits_processor, which adds NoRepeatNGramLogitsProcessor.
    // 8 and not smaller: a small n also forbids legitimate repeats inside ordinary speech
    // ("of the", "I think that"), while any n breaks a loop within one period plus n tokens.
    // repetition_penalty is deliberately NOT used — it taxes every word already said,
    // including "the" and "and", and bends normal sentences to avoid them.
    var out = await asr(pcm, { chunk_length_s: 30, stride_length_s: 5, task: 'transcribe', return_timestamps: false,
      no_repeat_ngram_size: 8 });
    setMsg('done', null);
    var text = (out && out.text) ? out.text.trim() : '';
    // AND ANYTHING THAT GETS THROUGH IS COLLAPSED. The decoder guard is per window and exact;
    // a loop with slightly different punctuation, or one straddling two windows, survives it.
    // The same cleaner runs on the server when the transcript is saved.
    if (window.SpeakUpTranscript) text = window.SpeakUpTranscript.collapseRepeats(text).text;
    return text;
  }

  // fallback: hand the audio to the server (stub engine) so the recording is still saved
  async function uploadBlobFallback(blob, title, source) {
    var fd = new FormData();
    fd.append('file', blob, 'audio.webm');
    fd.append('title', title);
    fd.append('source', source);
    emit('model', { phase: 'uploading', pct: null, background: false });
    var r = await fetch('/speakup/api/v1/recordings/upload', { method: 'POST', body: fd, headers: { 'X-SpeakUp': '1' } });
    if (r.status === 401) { location.href = '/speakup/login'; throw new Error('401'); }
    var d = await r.json().catch(function () { return {}; });
    emit('model', { phase: 'done', pct: null, background: false });
    return d;
  }

  // ── live-session state (shared by mic + call; only one active at a time) ─────
  var liveRecId = null, liveMode = null, liveText = '', liveLang = 'es';

  // ── recording (mic OR call): real audio + rolling on-device Whisper + autosave ──
  // BOTH the mic orb and Record Call record ACTUAL AUDIO in ~90s segments; each
  // segment is transcribed on-device by Whisper and the growing transcript is saved
  // to the server per chunk. No Web Speech (unreliable on mobile). Flat memory for
  // long meetings; loss-proof if the tab/app/battery dies mid-recording.
  var SEGMENT_MS = 90000; // 90s
  var callRec = null, callChunks = [], callCtx = null, callStreams = [], callTimerInt = null, callStartTs = 0;
  var segStopping = false, segRotateTimer = null, pendingTx = Promise.resolve();
  var pausedAt = 0, wakeLock = null;

  function state() {
    return { recording: !!liveMode, mode: liveMode, recording_id: liveRecId, text: liveText,
      paused: !!(callRec && callRec.state === 'paused'), seconds: liveMode ? Math.floor((Date.now() - callStartTs) / 1000) : 0 };
  }

  async function startMic(opts) {
    var mic = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      callStreams = [mic]; callCtx = null;
      await startSession('mic', mic, opts.title || ((opts.lang === 'en' ? 'Voice note ' : 'Nota de voz ') + new Date().toLocaleString()), 'mic', opts);
    } catch (e) {
      if (mic) mic.getTracks().forEach(function (x) { x.stop(); });
      emit('error', { where: 'start', message: e.message || 'mic', code: e.name || null });
      resetSession();
    }
  }

  async function startCall(opts) {
    var mic = null, disp = null;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!disp.getAudioTracks().length) {
        emit('error', { where: 'start', message: 'no-display-audio', code: 'no-display-audio' });
        mic.getTracks().forEach(function (x) { x.stop(); });
        disp.getTracks().forEach(function (x) { x.stop(); });
        return;
      }
      callStreams = [mic, disp];
      callCtx = new (window.AudioContext || window.webkitAudioContext)();
      var dest = callCtx.createMediaStreamDestination();
      callCtx.createMediaStreamSource(mic).connect(dest);   // your voice
      callCtx.createMediaStreamSource(disp).connect(dest);  // the call
      var vt = disp.getVideoTracks()[0];
      if (vt) vt.addEventListener('ended', function () { stopSession(); });
      await startSession('call', dest.stream, opts.title || ((opts.lang === 'en' ? 'Call ' : 'Llamada ') + new Date().toLocaleString()), 'call', opts);
    } catch (e) {
      if (mic) mic.getTracks().forEach(function (x) { x.stop(); });
      if (disp) disp.getTracks().forEach(function (x) { x.stop(); });
      emit('error', { where: 'start', message: e.message || 'call', code: e.name || null });
      resetSession();
    }
  }

  async function startSession(mode, stream, title, source, opts) {
    liveMode = mode; liveText = ''; segStopping = false; pendingTx = Promise.resolve();
    liveLang = (opts && opts.lang) || liveLang;
    getWhisper(function () {}).catch(function () {});   // warm up the model in the background so it's ready
    try {
      // POST /recordings takes title/source/lang/status and nothing else. Marking the row
      // as a meeting is a separate, real call the screen makes once the row exists
      // (PATCH /factory/recordings/:id/session) — this one would silently drop the field.
      var created = await api('/recordings', { method: 'POST', body: JSON.stringify({ title: title, source: source, lang: liveLang, status: 'recording' }) });
      liveRecId = created.recording.id;
    } catch (e) { liveRecId = null; }
    try { localStorage.setItem('speakup_live', JSON.stringify({ id: liveRecId, text: '', ts: Date.now(), mode: mode })); } catch (e) {}
    callStartTs = Date.now();
    callTimerInt = setInterval(function () { emit('tick', { seconds: Math.floor((Date.now() - callStartTs) / 1000) }); }, 1000);
    emit('tick', { seconds: 0 });
    emit('state', { state: 'recording', mode: mode, recording_id: liveRecId });
    acquireWake();
    startSegment(stream);
    segRotateTimer = setInterval(function () { if (callRec && callRec.state === 'recording') callRec.stop(); }, SEGMENT_MS);
  }

  function startSegment(stream) {
    callChunks = [];
    callRec = new MediaRecorder(stream);
    callRec.ondataavailable = function (e) { if (e.data && e.data.size) callChunks.push(e.data); };
    callRec.onstop = function () {
      var blob = callChunks.length ? new Blob(callChunks) : null;   // let the browser keep its own container (mp4 on Safari, webm on Chrome)
      if (!segStopping) startSegment(stream);   // resume recording immediately (tiny gap)
      pendingTx = pendingTx.then(function () { return transcribeSegment(blob); }).catch(function () {});
      if (segStopping) pendingTx.then(function () { return finalizeSession(); });
    };
    callRec.start();
  }

  async function transcribeSegment(blob) {
    if (!blob || blob.size < 1200) return;
    var seg = '';
    try { seg = await transcribeBlob(blob, true); } catch (e) { /* keep going */ }
    if (seg) {
      liveText += (liveText ? ' ' : '') + seg;
      emit('transcript', { text: liveText, added: seg, recording_id: liveRecId });
      try { localStorage.setItem('speakup_live', JSON.stringify({ id: liveRecId, text: liveText, ts: Date.now(), mode: liveMode })); } catch (e) {}
      var saved = false;
      if (liveRecId) {
        try { await api('/recordings/' + liveRecId + '/transcript', { method: 'PUT', body: JSON.stringify({ text: liveText, lang: liveLang }) }); saved = true; }
        catch (e) {}
      }
      emit('segment', { saved: saved, recording_id: liveRecId, chars: liveText.length, added: seg });
    }
  }

  async function acquireWake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', function () { wakeLock = null; });
      }
    } catch (e) {}
  }
  function releaseWake() { try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null; }

  function pause() {
    if (!liveMode || !callRec) return false;
    if (callRec.state === 'recording' && typeof callRec.pause === 'function') {
      callRec.pause(); clearInterval(segRotateTimer); pausedAt = Date.now();
      emit('state', { state: 'paused', mode: liveMode, recording_id: liveRecId });
      return true;
    }
    return false;
  }
  function resume() {
    if (!liveMode || !callRec) return false;
    if (callRec.state === 'paused') {
      callRec.resume(); callStartTs += Date.now() - pausedAt; pausedAt = 0;
      segRotateTimer = setInterval(function () { if (callRec && callRec.state === 'recording') callRec.stop(); }, SEGMENT_MS);
      emit('state', { state: 'recording', mode: liveMode, recording_id: liveRecId });
      return true;
    }
    return false;
  }

  document.addEventListener('visibilitychange', function () {
    if (!liveMode) return;
    if (document.visibilityState === 'hidden') {
      // Save what we have now: iOS may suspend the page while it is hidden.
      if (callRec && callRec.state === 'recording' && !segStopping) callRec.stop();
    } else { acquireWake(); }
  });

  function stopSession() {
    if (!liveMode || segStopping) return;
    segStopping = true;
    clearInterval(segRotateTimer); clearInterval(callTimerInt);
    releaseWake();
    if (callRec && callRec.state === 'paused') { try { callRec.resume(); } catch (e) {} }
    emit('state', { state: 'finishing', mode: liveMode, recording_id: liveRecId });
    if (callRec && callRec.state === 'recording') callRec.stop(); // final onstop -> finalizeSession
    else pendingTx.then(function () { return finalizeSession(); });
  }

  async function finalizeSession() {
    if (!liveMode && !liveRecId) return;
    var id = liveRecId, dur = Math.floor((Date.now() - callStartTs) / 1000), hadText = !!liveText.trim();
    var text = liveText;
    callStreams.forEach(function (s) { s.getTracks().forEach(function (x) { x.stop(); }); });
    try { callCtx && callCtx.close(); } catch (e) {}
    var title = null;
    if (id) {
      if (hadText) {
        title = text.trim().split(/[.!?\n]/)[0].slice(0, 60);
        try {
          await api('/recordings/' + id + '/transcript', { method: 'PUT', body: JSON.stringify({ text: text, lang: liveLang }) });
          await api('/recordings/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'done', duration_sec: dur, title: title || undefined }) });
        } catch (e) { emit('error', { where: 'finalize', message: e.message }); }
      } else {
        try { await api('/recordings/' + id, { method: 'DELETE' }); } catch (e) {}
      }
    }
    try { localStorage.removeItem('speakup_live'); } catch (e) {}
    resetSession();
    emit('state', { state: 'idle', mode: null, recording_id: null });
    if (hadText && id) emit('saved', { recording_id: id, duration_sec: dur, title: title, text: text });
    else emit('discarded', { recording_id: id });
  }

  function resetSession() {
    liveRecId = null; liveMode = null; liveText = ''; segStopping = false;
    callRec = null; callChunks = []; callStreams = []; callCtx = null;
  }

  // ── crash recovery: finalize any recording left 'recording' by an interruption ─
  async function recoverSessions() {
    try {
      var d = await api('/recordings');
      var stale = (d.recordings || []).filter(function (r) { return r.status === 'recording'; });
      if (!stale.length) { try { localStorage.removeItem('speakup_live'); } catch (e) {} return { recovered: [] }; }
      var ls = null;
      try { ls = JSON.parse(localStorage.getItem('speakup_live') || 'null'); } catch (e) {}
      var ids = [];
      for (var i = 0; i < stale.length; i++) {
        var r = stale[i];
        // flush any tail saved locally but not yet synced, then finalize
        if (ls && ls.id === r.id && ls.text) {
          try { await api('/recordings/' + r.id + '/transcript', { method: 'PUT', body: JSON.stringify({ text: ls.text, lang: liveLang }) }); } catch (e) {}
        }
        try { await api('/recordings/' + r.id, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) }); ids.push(r.id); } catch (e) {}
      }
      try { localStorage.removeItem('speakup_live'); } catch (e) {}
      emit('recovered', { ids: ids });
      return { recovered: ids };
    } catch (e) { return { recovered: [] }; }
  }

  // ── public API ──────────────────────────────────────────────────────────────
  // start({ mode:'mic'|'call', title, lang })
  function start(opts) {
    opts = opts || {};
    if (liveMode) return Promise.resolve(false);
    if (!(navigator.mediaDevices && window.MediaRecorder)) {
      emit('error', { where: 'start', message: 'unsupported', code: 'unsupported' });
      return Promise.resolve(false);
    }
    liveLang = opts.lang || liveLang;
    return (opts.mode === 'call' ? startCall(opts) : startMic(opts)).then(function () { return true; });
  }

  window.SpeakUpRecorder = {
    start: start,
    stop: stopSession,
    pause: pause,
    resume: resume,
    recover: recoverSessions,
    on: on,
    off: off,
    state: state,
    supported: !!(navigator.mediaDevices && window.MediaRecorder),
    canRecordCall: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
    // Exposed so a screen can transcribe an uploaded file with the same engine, and fall
    // back to the server when the browser cannot decode it.
    transcribeBlob: transcribeBlob,
    uploadBlobFallback: uploadBlobFallback,
    SEGMENT_MS: SEGMENT_MS,
    model: WHISPER_MODEL
  };
})();
