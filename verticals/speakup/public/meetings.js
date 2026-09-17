/* AutoDev — Meetings: record a meeting, then talk to it.
 *
 * The Decisions / Other checklist is gone. One meeting is on screen at a time — the one in
 * ?id=, or the last one opened — and the owner asks for anything about it in plain words: a
 * summary, the minutes, action items, a build prompt, an email. Past meetings moved to
 * /speakup/history.
 *
 * THE THREAD IS THE SERVER'S TRUTH. A reply streams into a temporary bubble for speed, and
 * the moment the server confirms what it stored, that bubble is replaced by the stored
 * message — so the screen never shows an answer the database does not have.
 *
 * "TRANSFER TO FACTORY" STOPS AT A PLAN. The button and the typed or dictated command both
 * go to the server, which hands the answer to the Factory without running anything; the
 * receipt links to the job, where the owner reads the plan and types "approved".
 *
 * The recording engine is record-engine.js. This file draws.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var lang = (function () { try { return localStorage.getItem('speakup_lang') || 'es'; } catch (e) { return 'es'; } })();
  var L = function (es, en) { return lang === 'en' ? en : es; };
  var ACTIVE = 'speakup_active_meeting';

  var meeting = null;          // { id, title, date_label, transcript }
  var messages = [];           // stored messages for the meeting on screen
  var busy = false;
  var pending = null;          // { name, mime, data_base64, url } — one screenshot per message

  // ── helpers ────────────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  async function api(path, opts) {
    var r = await fetch('/speakup/api/v1' + path, Object.assign({ headers: { 'Content-Type': 'application/json', 'X-SpeakUp': '1' } }, opts || {}));
    if (r.status === 401) { location.href = '/speakup/login'; throw new Error('401'); }
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(d.error || ('HTTP ' + r.status)); e.status = r.status; e.data = d; throw e; }
    return d;
  }
  function stat(s) { $('stat').textContent = s || ''; }
  function msgStat(s) { $('msgStat').textContent = s || ''; }
  function fmt(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function show(el, yes) { $(el).hidden = !yes; }

  // ── starter chips. Optional shortcuts that send a sentence; the box takes anything. ──
  var CHIPS = [
    ['Resumen', 'Summary', 'Dame un resumen de la reunión.', 'Give me a summary of the meeting.'],
    ['Acta', 'Minutes', 'Escribe el acta de la reunión.', 'Write the meeting minutes.'],
    ['Tareas', 'Action items', 'Lista las tareas con responsable y fecha.', 'List the action items with owner and date.'],
    ['Decisiones', 'Decisions', '¿Qué decisiones se tomaron?', 'What decisions were made?'],
    ['Convertir a prompt', 'Build prompt', 'Convierte esto en un prompt de construcción.', 'Convert this into a build prompt.'],
    ['Correo', 'Email', 'Redacta un correo con lo acordado.', 'Draft an email with what was agreed.'],
    ['WhatsApp', 'WhatsApp', 'Redacta un mensaje de WhatsApp con lo acordado.', 'Draft a WhatsApp message with what was agreed.']
  ];
  function renderChips() {
    $('chips').innerHTML = CHIPS.map(function (c, i) {
      return '<button class="chip" data-chip="' + i + '"' + (meeting && !busy ? '' : ' disabled') + '>' + esc(L(c[0], c[1])) + '</button>';
    }).join('');
    Array.prototype.forEach.call($('chips').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { var c = CHIPS[+b.getAttribute('data-chip')]; send(L(c[2], c[3])); });
    });
  }

  // ── the thread ─────────────────────────────────────────────────────────────
  function bubble(m) {
    var cls = 'msg ' + (m.role === 'user' ? 'user' : 'assistant') + (m.kind === 'transfer' ? ' transfer' : '');
    var h = '<div class="' + cls + '" data-id="' + esc(m.id || '') + '">';
    if (m.attachment_url) h += '<img class="att" src="' + esc(m.attachment_url) + '" alt="">';
    if (m.role === 'assistant' && m.offline) h += '<span class="tag off">' + esc(L('Sin modelo: respuesta de respaldo', 'No model: fallback reply')) + '</span>\n';
    else if (m.role === 'assistant' && m.kind === 'prompt') h += '<span class="tag">' + esc(L('Prompt de construcción', 'Build prompt')) + '</span>\n';
    h += '<span class="body">' + esc(m.content) + '</span>';
    if (m.role === 'assistant' && m.id && !m.streaming) {
      h += '<div class="mact">';
      if (m.kind === 'transfer' && m.job_id) {
        h += '<a class="btn small" href="/speakup/?job=' + esc(m.job_id) + '">' + esc(L('Abrir el trabajo #', 'Open job #') + m.job_id) + '</a>';
      } else {
        h += '<button class="btn small" data-copy="' + esc(m.id) + '">' + esc(L('Copiar', 'Copy')) + '</button>';
        // A "No model" reply cannot be turned into a prompt, so offering to transfer it would only fail.
        if (!m.offline) h += '<button class="btn small primary" data-transfer="' + esc(m.id) + '">' + esc(L('Transferir a la Fábrica', 'Transfer to Factory')) + '</button>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }
  function renderThread() {
    if (!meeting) {
      $('thread').innerHTML = '<p class="empty-note">' + esc(L('Graba una reunión o abre una desde el Historial para hablar con ella.',
        'Record a meeting, or open one from History, to talk to it.')) + '</p>';
      return;
    }
    if (!messages.length) {
      $('thread').innerHTML = '<p class="empty-note">' + esc(L('Pide lo que quieras sobre esta reunión: un resumen, el acta, las tareas, un prompt, un correo…',
        'Ask anything about this meeting: a summary, the minutes, action items, a build prompt, an email…')) + '</p>';
      return;
    }
    $('thread').innerHTML = messages.map(bubble).join('');
    scrollEnd();
  }
  function scrollEnd() { $('thread').scrollTop = $('thread').scrollHeight; }

  function onThreadClick(e) {
    var c = e.target.closest && e.target.closest('[data-copy]');
    if (c) return copyMessage(+c.getAttribute('data-copy'), c);
    var t = e.target.closest && e.target.closest('[data-transfer]');
    if (t) return transfer(+t.getAttribute('data-transfer'));
  }
  async function copyMessage(id, btn) {
    var m = messages.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    try { await navigator.clipboard.writeText(m.content); }
    catch (e) {
      var ta = document.createElement('textarea'); ta.value = m.content; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (x) {} document.body.removeChild(ta);
    }
    var was = btn.textContent; btn.textContent = L('Copiado', 'Copied');
    setTimeout(function () { btn.textContent = was; }, 1400);
  }

  // ── sending: a streamed reply ──────────────────────────────────────────────
  function setBusy(b) {
    busy = b;
    $('send').disabled = b || !meeting;
    $('msg').disabled = !meeting;
    renderChips();
  }
  async function send(forced) {
    if (!meeting || busy) return;
    var text = (forced != null ? forced : $('msg').value).trim();
    if (!text && !pending) { msgStat(L('Escribe o dicta algo', 'Type or dictate something')); return; }
    if (capturing) stopCapture();
    var body = { message: text, lang: lang };
    if (pending) body.attachment = { name: pending.name, mime: pending.mime, data_base64: pending.data_base64 };
    if (forced == null) $('msg').value = '';
    clearPending();
    setBusy(true);
    msgStat(L('Pensando…', 'Thinking…'));

    var live = null;                    // the streaming bubble
    try {
      var r = await fetch('/speakup/api/v1/meetings/' + meeting.id + '/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SpeakUp': '1' }, body: JSON.stringify(body) });
      if (r.status === 401) { location.href = '/speakup/login'; return; }
      if (!r.ok || !r.body) { var d = await r.json().catch(function () { return {}; }); throw new Error(d.error || ('HTTP ' + r.status)); }
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
      for (;;) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          var line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          var ev; try { ev = JSON.parse(line); } catch (x) { continue; }
          if (ev.type === 'user') { messages.push(ev.message); renderThread(); }
          else if (ev.type === 'delta') {
            if (!live) { live = { role: 'assistant', content: '', streaming: true }; messages.push(live); renderThread(); msgStat(''); }
            live.content += ev.text;
            var bodies = $('thread').querySelectorAll('.msg .body');
            if (bodies.length) bodies[bodies.length - 1].textContent = live.content;
            scrollEnd();
          } else if (ev.type === 'done' || ev.type === 'message') {
            // The stored message replaces the streaming bubble: the screen shows what was saved.
            if (live) { messages.splice(messages.indexOf(live), 1); live = null; }
            messages.push(ev.message); renderThread();
          } else if (ev.type === 'error') {
            msgStat(ev.error);
          }
        }
      }
      if (live) { messages.splice(messages.indexOf(live), 1); live = null; await loadThread(); }
      if ($('msgStat').textContent === L('Pensando…', 'Thinking…')) msgStat('');
    } catch (e) {
      if (live) { messages.splice(messages.indexOf(live), 1); live = null; }
      msgStat(e.message);
      await loadThread();
    } finally { setBusy(false); }
  }

  async function transfer(messageId) {
    if (!meeting || busy) return;
    setBusy(true);
    msgStat(L('Transfiriendo a la Fábrica…', 'Transferring to the Factory…'));
    try {
      var d = await api('/meetings/' + meeting.id + '/factory', { method: 'POST', body: JSON.stringify({ message_id: messageId, lang: lang }) });
      (d.messages || []).forEach(function (m) { messages.push(m); });
      renderThread();
      msgStat('');
    } catch (e) {
      ((e.data && e.data.messages) || []).forEach(function (m) { messages.push(m); });
      renderThread();
      msgStat(e.message);
    } finally { setBusy(false); }
  }

  // ── screenshots: one per message, sent with it ─────────────────────────────
  function clearPending() { if (pending && pending.url) URL.revokeObjectURL(pending.url); pending = null; renderPending(); }
  function renderPending() {
    $('shots').innerHTML = pending ? '<div class="shot"><img src="' + pending.url + '" alt=""><button id="unshot" aria-label="' + esc(L('Quitar', 'Remove')) + '">×</button></div>' : '';
    if (pending) $('unshot').addEventListener('click', clearPending);
  }
  async function attach(file) {
    if (!meeting) return;
    if (file.size > 6 * 1024 * 1024) { msgStat(L('La imagen pasa de 6 MB', 'That image is over 6 MB')); return; }
    try {
      var b64 = await new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(String(fr.result).split(',')[1] || ''); };
        fr.onerror = rej; fr.readAsDataURL(file);
      });
      clearPending();
      pending = { name: file.name || 'screenshot.png', mime: file.type, data_base64: b64, url: URL.createObjectURL(file) };
      renderPending();
      msgStat(L('Captura adjunta', 'Screenshot attached'));
    } catch (e) { msgStat(e.message); }
  }
  function imagesFrom(ev) {
    var out = [], items = (ev.clipboardData || ev.dataTransfer || {}).items || [];
    for (var i = 0; i < items.length; i++) if (items[i].kind === 'file') { var f = items[i].getAsFile(); if (f && /^image\//.test(f.type)) out.push(f); }
    return out;
  }

  // ── dictation (the browser's own speech recognition, as in the Factory) ────
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var capturing = false, recog = null, baseText = '';
  function startCapture() {
    if (!SR) { msgStat(L('Este navegador no permite dictado; escribe.', 'This browser cannot dictate; type instead.')); return; }
    if (!meeting) return;
    baseText = $('msg').value ? $('msg').value.replace(/\s+$/, '') + ' ' : '';
    capturing = true; $('mic').classList.add('rec'); msgStat(L('Escuchando…', 'Listening…'));
    recog = new SR();
    recog.lang = lang === 'en' ? 'en-US' : 'es-ES';
    recog.continuous = true; recog.interimResults = true;
    recog.onresult = function (ev) {
      var all = '';
      for (var i = 0; i < ev.results.length; i++) all += ev.results[i][0].transcript;
      $('msg').value = baseText + all.replace(/\s+/g, ' ').trimStart();
    };
    recog.onerror = function (e) { if (e.error === 'not-allowed') msgStat(L('Permite el micrófono.', 'Allow the microphone.')); };
    recog.onend = function () { if (capturing) stopCapture(true); };
    try { recog.start(); } catch (e) { stopCapture(true); }
  }
  function stopCapture(fromEnd) {
    capturing = false; $('mic').classList.remove('rec');
    msgStat($('msg').value.trim() ? L('Revisa y envía', 'Review and send') : '');
    if (recog && !fromEnd) { try { recog.stop(); } catch (e) {} }
    recog = null;
  }

  // ── the meeting on screen ──────────────────────────────────────────────────
  async function loadThread() {
    if (!meeting) return;
    try { var d = await api('/meetings/' + meeting.id + '/chat'); messages = d.messages || []; renderThread(); }
    catch (e) { msgStat(e.message); }
  }
  async function openMeeting(id) {
    try {
      var d = await api('/meetings/' + id);
      meeting = d.meeting;
      try { localStorage.setItem(ACTIVE, String(id)); } catch (e) {}
      if (!/[?&]id=/.test(location.search) || new URLSearchParams(location.search).get('id') !== String(id)) {
        try { history.replaceState(null, '', '/speakup/meetings?id=' + id); } catch (e) {}
      }
      $('mTitle').textContent = meeting.title || ('#' + meeting.id);
      $('mDate').textContent = meeting.date_label || (meeting.created_at ? new Date(meeting.created_at).toLocaleString() : '');
      $('trEdit').value = meeting.transcript || '';
      show('meetCard', true); show('trPanel', false);
      if (!(R && R.state().recording)) show('recCard', false);
      messages = [];
      renderThread();
      setBusy(false);
      await loadThread();
    } catch (e) {
      // A meeting that no longer exists (or belongs to someone else) is not stuck on screen.
      if (e.status === 404) { try { localStorage.removeItem(ACTIVE); } catch (x) {} newMeeting(); }
      else stat(e.message);
    }
  }
  function newMeeting() {
    meeting = null; messages = [];
    show('meetCard', false); show('recCard', true);
    renderThread(); setBusy(false);
  }
  async function saveTranscript() {
    if (!meeting) return;
    $('saveTrBtn').disabled = true; $('trStat').textContent = L('Guardando…', 'Saving…');
    try {
      await api('/recordings/' + meeting.id + '/transcript', { method: 'PUT', body: JSON.stringify({ text: $('trEdit').value, lang: lang }) });
      meeting.transcript = $('trEdit').value;
      $('trStat').textContent = L('Guardado', 'Saved');
    } catch (e) { $('trStat').textContent = e.message; }
    finally { $('saveTrBtn').disabled = false; }
  }

  // ── the recorder ───────────────────────────────────────────────────────────
  var R = window.SpeakUpRecorder;
  function recState(s) {
    var rec = s === 'recording', hold = s === 'paused', fin = s === 'finishing';
    $('dot').className = 'dot' + (rec ? ' live' : (hold ? ' hold' : ''));
    $('startBtn').hidden = rec || hold || fin;
    $('pauseBtn').hidden = !(rec || hold);
    $('stopBtn').hidden = !(rec || hold);
    $('startBtn').disabled = !!fin;
    $('pauseBtn').textContent = hold ? L('Reanudar', 'Resume') : L('Pausar', 'Pause');
    if (rec) stat(L('Grabando', 'Recording'));
    else if (hold) stat(L('En pausa', 'Paused'));
    else if (fin) stat(L('Cerrando la grabación…', 'Finishing the recording…'));
  }
  function overlay(on, msg, pct) {
    $('ov').className = on ? 'on' : '';
    if (!on) return;
    $('ovMsg').textContent = msg || '';
    $('ovFill').style.width = (pct == null ? 0 : pct) + '%';
    $('ovPct').textContent = pct == null ? '' : pct + '%';
  }
  function modelMsg(phase) {
    if (phase === 'downloading') return L('Descargando el modelo de transcripción (solo la primera vez)…', 'Downloading the transcription model (first time only)…');
    if (phase === 'preparing') return L('Preparando el audio…', 'Preparing audio…');
    if (phase === 'uploading') return L('Subiendo…', 'Uploading…');
    return L('Transcribiendo en tu dispositivo…', 'Transcribing on your device…');
  }
  function wireRecorder() {
    if (!R) { show('unsupported', true); $('unsupported').textContent = L('No se pudo cargar el motor de grabación.', 'The recording engine did not load.'); return; }
    if (!R.supported) {
      show('unsupported', true);
      $('unsupported').textContent = L('Este navegador no permite grabar. Abre AutoDev en Safari o Chrome.', 'This browser cannot record. Open AutoDev in Safari or Chrome.');
      $('startBtn').disabled = true;
    }
    R.on('state', function (e) { recState(e.state); });
    R.on('tick', function (e) { $('clock').textContent = fmt(e.seconds); });
    R.on('transcript', function (e) {
      show('live', true); $('live').classList.remove('empty');
      $('live').textContent = e.text; $('live').scrollTop = $('live').scrollHeight;
    });
    R.on('segment', function (e) { stat(e.saved ? L('Guardado automático', 'Autosaved') : L('Sin conexión: se reintenta', 'Offline: will retry')); });
    R.on('model', function (e) {
      if (e.background) { if (e.phase !== 'done') stat(modelMsg(e.phase) + (e.pct != null ? ' ' + e.pct + '%' : '')); return; }
      if (e.phase === 'done') overlay(false);
      else overlay(true, modelMsg(e.phase), e.pct);
    });
    R.on('saved', async function (e) {
      $('clock').textContent = '00:00';
      stat(L('Grabación guardada', 'Recording saved'));
      // Mark the row a meeting, so it appears in History and not among Factory instructions.
      try { await api('/factory/recordings/' + e.recording_id + '/session', { method: 'PATCH', body: JSON.stringify({ mode: 'meeting' }) }); } catch (x) {}
      $('live').textContent = ''; show('live', false);
      await openMeeting(e.recording_id);
    });
    R.on('discarded', function () {
      $('clock').textContent = '00:00';
      stat(L('No se captó voz; la grabación se descartó.', 'No speech was captured; the recording was discarded.'));
      $('live').textContent = ''; show('live', false);
    });
    R.on('recovered', function () { stat(L('Grabación recuperada tras una interrupción.', 'Recording recovered after an interruption.')); });
    R.on('error', function (e) {
      overlay(false);
      if (e.code === 'no-display-audio') stat(L('Elige la pestaña de la llamada y activa “Compartir audio”.', 'Pick the call tab and turn on "Share audio".'));
      else stat(e.message || 'error');
    });
    $('startBtn').addEventListener('click', function () {
      $('live').textContent = ''; $('live').classList.add('empty'); show('live', true);
      R.start({ mode: 'mic', lang: lang });
    });
    $('pauseBtn').addEventListener('click', function () { var s = R.state(); if (s.paused) R.resume(); else R.pause(); });
    $('stopBtn').addEventListener('click', function () { R.stop(); });
    recState('idle');
  }

  // ── language ───────────────────────────────────────────────────────────────
  function setLang(l) {
    lang = l;
    try { localStorage.setItem('speakup_lang', l); } catch (e) {}
    document.documentElement.lang = l;
    document.dispatchEvent(new CustomEvent('speakup:lang', { detail: l }));
    $('langBtn').textContent = l === 'en' ? 'ES' : 'EN';
    $('outBtn').textContent = L('Salir', 'Sign out');
    $('tabMeet').textContent = L('Reuniones', 'Meetings');
    $('tabFac').textContent = L('Fábrica', 'Factory');
    $('ctx').textContent = L('Reunión', 'Meeting');
    $('startBtn').textContent = L('Grabar reunión', 'Record meeting');
    $('stopBtn').textContent = L('Detener', 'Stop');
    $('privacy').textContent = L('Se transcribe en tu dispositivo. El audio no sale de tu equipo.', 'Transcribed on your device. Audio never leaves your machine.');
    $('ovNote').textContent = $('privacy').textContent;
    $('trToggle').textContent = L('Transcripción', 'Transcript');
    $('saveTrBtn').textContent = L('Guardar transcripción', 'Save transcript');
    $('msg').placeholder = L('Pregunta lo que quieras sobre la reunión…', 'Ask anything about the meeting…');
    $('mic').setAttribute('aria-label', L('Dictar', 'Dictate'));
    $('send').setAttribute('aria-label', L('Enviar', 'Send'));
    document.title = L('AutoDev — Reuniones', 'AutoDev — Meetings');
    renderChips(); renderThread();
    recState(R && R.state().recording ? (R.state().paused ? 'paused' : 'recording') : 'idle');
  }

  // ── boot ───────────────────────────────────────────────────────────────────
  (async function () {
    setLang(lang);
    $('langBtn').addEventListener('click', function () { setLang(lang === 'en' ? 'es' : 'en'); });
    $('outBtn').addEventListener('click', async function () {
      await fetch('/speakup/api/v1/auth/logout', { method: 'POST', headers: { 'X-SpeakUp': '1' } });
      location.href = '/speakup/login';
    });
    $('trToggle').addEventListener('click', function () { show('trPanel', $('trPanel').hidden); });
    $('saveTrBtn').addEventListener('click', saveTranscript);
    $('send').addEventListener('click', function () { send(); });
    $('mic').addEventListener('click', function () { if (capturing) stopCapture(); else startCapture(); });
    $('msg').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
    $('msg').addEventListener('paste', function (e) { var f = imagesFrom(e); if (f.length) { e.preventDefault(); attach(f[0]); } });
    ['dragover', 'drop'].forEach(function (evt) {
      document.addEventListener(evt, function (e) { e.preventDefault(); if (evt === 'drop') { var f = imagesFrom(e); if (f.length) attach(f[0]); } });
    });
    $('thread').addEventListener('click', onThreadClick);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/speakup/sw.js').catch(function () {});

    wireRecorder();
    var params = new URLSearchParams(location.search);
    var stored = null; try { stored = localStorage.getItem(ACTIVE); } catch (e) {}
    var id = parseInt(params.get('id') || (params.get('new') ? '' : stored) || '', 10);
    if (id) await openMeeting(id); else newMeeting();
    if (R) R.recover();
  })();
})();
