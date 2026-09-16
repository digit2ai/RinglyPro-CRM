/* SpeakUp — Meeting Notes Taker.
 *
 * Record a meeting, read what was said back as a checklist, tick the items that are real
 * work, and carry them across to the Factory as editable text. Nothing here writes code,
 * dispatches a job, or sends anything on its own.
 *
 * THE CHECKLIST IS THE SERVER'S TRUTH, NEVER LOCAL STATE. Ticking a row PATCHes the item
 * and the whole list is re-rendered from the response. The verifier on the server may
 * refuse a promotion (a quote that is not in the transcript, an approval nobody said out
 * loud); if the screen drew the tick from local state it would show an approval the server
 * never granted, which is the one lie this product exists to prevent.
 *
 * THE HAND-OFF IS A SESSION KEY, NOT A SEND. "Enviar a la Fábrica" stores the prompt under
 * sessionStorage['speakup_incoming_prompt'] as {text, recording_id, at} and navigates. The
 * console reads that key into its instruction box, where a person edits it and presses send.
 *
 * The recording engine is record-engine.js. This file draws.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var lang = (function () { try { return localStorage.getItem('speakup_lang') || 'es'; } catch (e) { return 'es'; } })();
  var L = function (es, en) { return lang === 'en' ? en : es; };
  var INCOMING = 'speakup_incoming_prompt';

  var recId = null;           // the meeting on screen
  var intel = null;           // the server's latest intelligence for it
  var original = {};          // item id -> the classification it had when we first saw it
  var promptText = '';
  var promptRecId = null;
  var meetings = [];
  var busyItem = {};

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
  function fmt(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function show(el, yes) { $(el).hidden = !yes; }

  // ── the groups. Each item lands in exactly one, so nothing is shown twice and
  //    nothing quietly disappears. Kind decides first, so a row does not jump to
  //    another heading the moment it is ticked.
  var GROUPS = [
    { key: 'decisions', es: 'Decisiones', en: 'Decisions' },
    { key: 'requirements', es: 'Requisitos', en: 'Requirements' },
    { key: 'bugs', es: 'Errores', en: 'Bugs' },
    { key: 'features', es: 'Funcionalidades', en: 'Features' },
    { key: 'ideas', es: 'Ideas', en: 'Ideas' },
    { key: 'suggestions', es: 'Sugerencias', en: 'Suggestions' },
    { key: 'questions', es: 'Preguntas abiertas', en: 'Open questions' },
    { key: 'other', es: 'Otros', en: 'Other' }
  ];
  function groupOf(i) {
    if (i.kind === 'requirement') return 'requirements';
    if (i.kind === 'bug') return 'bugs';
    if (i.kind === 'feature') return 'features';
    if (i.kind === 'open_question') return 'questions';
    if (i.kind === 'decision' || i.classification === 'DECISION') return 'decisions';
    if (i.classification === 'IDEA') return 'ideas';
    if (i.classification === 'SUGGESTION') return 'suggestions';
    return 'other';
  }
  var KIND_LABEL = {
    requirement: ['requisito', 'requirement'], bug: ['error', 'bug'], feature: ['funcionalidad', 'feature'],
    business_rule: ['regla', 'business rule'], decision: ['decisión', 'decision'], action_item: ['tarea', 'action item'],
    open_question: ['pregunta', 'open question'], technical_consideration: ['técnico', 'technical'],
    acceptance_criterion: ['criterio', 'acceptance criterion']
  };
  function kindLabel(k) { var m = KIND_LABEL[k]; return m ? L(m[0], m[1]) : k; }

  // ── the checklist ──────────────────────────────────────────────────────────
  function remember(data) {
    var items = (data && data.items) || [];
    for (var i = 0; i < items.length; i++) {
      // Only the FIRST sighting counts. After a tick the server reports
      // APPROVED_REQUIREMENT, and overwriting here would lose what to restore on untick.
      if (!Object.prototype.hasOwnProperty.call(original, items[i].id)) original[items[i].id] = items[i].classification;
    }
  }

  function renderIntel() {
    show('intelCard', !!intel);
    if (!intel) return;
    var items = intel.items || [];
    var buckets = {};
    for (var g = 0; g < GROUPS.length; g++) buckets[GROUPS[g].key] = [];
    for (var i = 0; i < items.length; i++) buckets[groupOf(items[i])].push(items[i]);

    var html = '';
    for (var k = 0; k < GROUPS.length; k++) {
      var grp = GROUPS[k], list = buckets[grp.key];
      if (!list.length) continue;
      html += '<div class="grp"><h3>' + esc(L(grp.es, grp.en)) + ' <span class="count">' + list.length + '</span></h3>';
      for (var n = 0; n < list.length; n++) {
        var it = list[n];
        var on = it.classification === 'APPROVED_REQUIREMENT';
        html += '<label class="row' + (on ? ' on' : '') + '">' +
          '<input type="checkbox" data-item="' + esc(it.id) + '"' + (on ? ' checked' : '') + (busyItem[it.id] ? ' disabled' : '') +
          ' aria-label="' + esc(L('Aprobar', 'Approve')) + '">' +
          '<span class="body">' +
            '<span class="txt"><span class="kind">' + esc(kindLabel(it.kind)) + '</span>' + esc(it.text) + '</span>' +
            '<span class="tiny" style="display:block">' + esc(L('Dicho: ', 'Said: ')) + '“' + esc(it.quote) + '”</span>' +
            (it.notes && it.notes.length ? '<span class="tiny" style="display:block">' + esc(it.notes.join(' · ')) + '</span>' : '') +
          '</span></label>';
      }
      html += '</div>';
    }
    if (!html) html = '<p class="tiny">' + esc(L('No se extrajo nada de esta transcripción.', 'Nothing was extracted from this transcript.')) + '</p>';

    if (intel.unverified && intel.unverified.length) {
      html += '<div class="grp"><h3>' + esc(L('Sin verificar', 'Unverified')) + ' <span class="count">' + intel.unverified.length + '</span></h3>';
      for (var u = 0; u < intel.unverified.length; u++) {
        var uv = intel.unverified[u];
        html += '<div class="row"><span class="body"><span class="txt">' + esc(uv.text) + '</span>' +
          '<span class="tiny" style="display:block">' + esc(uv.reason || '') + '</span></span></div>';
      }
      html += '<p class="tiny">' + esc(L('No se pueden aprobar: su cita no aparece en la transcripción.',
        'These cannot be approved: their quote is not in the transcript.')) + '</p></div>';
    }

    $('intelBody').innerHTML = html;
    var boxes = $('intelBody').querySelectorAll('input[type=checkbox]');
    for (var b = 0; b < boxes.length; b++) boxes[b].addEventListener('change', onTick);

    var by = intel.is_simulated ? L(' · sin modelo (heurística)', ' · no model (keyword fallback)') : '';
    $('intelHint').textContent = L('Marca lo que quieres construir. Cada línea muestra lo que se dijo.',
      'Tick what you want built. Every line shows what was actually said.') + by;
  }

  async function onTick(ev) {
    var box = ev.target;
    var id = box.getAttribute('data-item');
    var want = box.checked ? 'APPROVED_REQUIREMENT' : (original[id] || 'SUGGESTION');
    busyItem[id] = true;
    box.disabled = true;
    stat(L('Guardando…', 'Saving…'));
    try {
      var d = await api('/factory/recordings/' + recId + '/intel/items/' + encodeURIComponent(id),
        { method: 'PATCH', body: JSON.stringify({ classification: want }) });
      intel = d.intel;            // the server's truth, never the click
      remember(intel);
      stat('');
    } catch (e) {
      stat(e.message);
    } finally {
      delete busyItem[id];
      renderIntel();              // re-drawn from `intel`, so a refused change snaps back
    }
  }

  // ── reading the meeting ────────────────────────────────────────────────────
  async function readMeeting() {
    if (!recId) return;
    $('readBtn').disabled = true;
    $('intelHint').textContent = '';
    show('intelCard', true);
    $('intelBody').innerHTML = '<p class="tiny"><span class="sp"></span>' + esc(L('Leyendo la reunión…', 'Reading the meeting…')) + '</p>';
    try {
      var d = await api('/factory/recordings/' + recId + '/intel', { method: 'POST', body: JSON.stringify({ lang: lang }) });
      intel = d.intel; original = {}; remember(intel);
      clearPrompt();
      renderIntel();
    } catch (e) {
      $('intelBody').innerHTML = '<div class="notice">' + esc(e.message) + '</div>';
    } finally { $('readBtn').disabled = false; }
  }

  // ── the prompt ─────────────────────────────────────────────────────────────
  function clearPrompt() {
    promptText = ''; promptRecId = null;
    show('promptOut', false); show('promptNote', false); show('sendBtn', false);
    $('promptOut').textContent = ''; $('promptNote').textContent = '';
  }
  function heldBackLine(hb) {
    if (!hb) return '';
    var parts = [];
    if (hb.ideas) parts.push(hb.ideas + ' ' + L('ideas', 'ideas'));
    if (hb.suggestions) parts.push(hb.suggestions + ' ' + L('sugerencias', 'suggestions'));
    if (hb.discussion) parts.push(hb.discussion + ' ' + L('de discusión', 'discussion'));
    if (hb.unverified) parts.push(hb.unverified + ' ' + L('sin verificar', 'unverified'));
    if (!parts.length) return '';
    return L('Retenido: ', 'Held back: ') + parts.join(', ') + '.';
  }
  async function buildPrompt() {
    if (!recId) return;
    $('promptBtn').disabled = true;
    show('promptNote', false); show('sendBtn', false);
    stat(L('Construyendo…', 'Building…'));
    try {
      var d = await api('/factory/recordings/' + recId + '/prompt', { method: 'POST', body: JSON.stringify({ lang: lang }) });
      promptText = d.prompt || ''; promptRecId = d.recording_id || recId;
      $('promptOut').textContent = promptText;
      show('promptOut', true); show('sendBtn', !!promptText);
      var hb = heldBackLine(d.held_back);
      var n = (d.requirements || []).length;
      $('promptNote').textContent = L(n + ' elemento(s) aprobados. ', n + ' approved item(s). ') + hb +
        L(' Nada se ha enviado.', ' Nothing has been sent.');
      show('promptNote', true);
      stat('');
    } catch (e) {
      // 409: nothing is ticked. The server's own words plus what it held back.
      var msg = e.message;
      var hb2 = e.data && e.data.held_back ? heldBackLine(e.data.held_back) : '';
      $('promptNote').textContent = msg + (hb2 ? ' ' + hb2 : '');
      show('promptNote', true); show('promptOut', false);
      stat('');
    } finally { $('promptBtn').disabled = false; }
  }
  function sendToFactory() {
    if (!promptText) return;
    try {
      sessionStorage.setItem(INCOMING, JSON.stringify({ text: promptText, recording_id: promptRecId, at: new Date().toISOString() }));
    } catch (e) { stat(e.message); return; }
    location.href = '/speakup/';
  }

  // ── a meeting on screen ────────────────────────────────────────────────────
  async function openMeeting(id) {
    recId = id; intel = null; original = {}; busyItem = {};
    clearPrompt();
    show('intelCard', false);
    show('trCard', true);
    $('live').classList.remove('empty');
    $('live').hidden = true; $('trEdit').hidden = false; show('trActs', true);
    $('trEdit').value = '';
    $('trEdit').placeholder = L('Cargando…', 'Loading…');
    renderMeetings();
    try {
      var d = await api('/recordings/' + id);
      $('trEdit').value = (d.transcript && d.transcript.text) || '';
      $('trEdit').placeholder = '';
      $('trTitle').textContent = (d.recording && d.recording.title) || L('Transcripción', 'Transcript');
      var got = await api('/factory/recordings/' + id + '/intel');
      if (got.intel) { intel = got.intel; remember(intel); renderIntel(); }
    } catch (e) { stat(e.message); }
  }

  async function saveTranscript() {
    if (!recId) return;
    $('saveTrBtn').disabled = true;
    stat(L('Guardando…', 'Saving…'));
    try {
      await api('/recordings/' + recId + '/transcript', { method: 'PUT', body: JSON.stringify({ text: $('trEdit').value, lang: lang }) });
      stat(L('Guardado', 'Saved'));
    } catch (e) { stat(e.message); }
    finally { $('saveTrBtn').disabled = false; }
  }

  // ── the list of past meetings ──────────────────────────────────────────────
  function renderMeetings() {
    if (!meetings.length) { $('meets').innerHTML = '<div class="tiny">' + esc(L('Todavía no hay reuniones.', 'No meetings yet.')) + '</div>'; return; }
    $('meets').innerHTML = meetings.map(function (r) {
      var when = r.created_at ? new Date(r.created_at).toLocaleString() : '';
      var who = (r.participants && r.participants.length) ? r.participants.join(', ') : '';
      return '<button class="meet' + (recId === r.id ? ' on' : '') + '" data-rec="' + esc(r.id) + '">' +
        '<span class="t">' + esc(r.title || ('#' + r.id)) + '</span>' +
        '<span class="tiny" style="display:block">' + esc(when) + (who ? ' · ' + esc(who) : '') + '</span></button>';
    }).join('');
    var btns = $('meets').querySelectorAll('button[data-rec]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { openMeeting(parseInt(this.getAttribute('data-rec'), 10)); });
    }
  }
  async function loadMeetings() {
    try {
      var d = await api('/recordings');
      meetings = (d.recordings || []).filter(function (r) { return r.status !== 'recording'; });   // newest first, as the server returns them
      renderMeetings();
    } catch (e) { $('meets').innerHTML = '<div class="tiny">' + esc(e.message) + '</div>'; }
  }

  // ── the ask box: read-only answers, never a job ────────────────────────────
  async function ask() {
    var text = $('ask').value.trim();
    if (!text) { $('askStat').textContent = L('Escribe una pregunta', 'Type a question'); return; }
    $('askSend').disabled = true;
    $('askStat').textContent = L('Preguntando…', 'Asking…');
    $('askOut').textContent = '';
    try {
      var d = await api('/factory/command', { method: 'POST', body: JSON.stringify({ text: text, mode: 'command', lang: lang }) });
      $('askStat').textContent = '';
      // A reply may carry card.job_id. This screen does NOT follow it: the ask box is
      // read-only and the Factory tab is where work is watched.
      $('askOut').textContent = d.reply || L('Sin respuesta.', 'No reply.');
    } catch (e) {
      $('askStat').textContent = '';
      $('askOut').textContent = e.message;
    } finally { $('askSend').disabled = false; }
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
      $('unsupported').textContent = L('Este navegador no permite grabar. Abre SpeakUp en Safari o Chrome.', 'This browser cannot record. Open SpeakUp in Safari or Chrome.');
      $('startBtn').disabled = true;
    }
    R.on('state', function (e) { recState(e.state); });
    R.on('tick', function (e) { $('clock').textContent = fmt(e.seconds); });
    R.on('transcript', function (e) {
      show('trCard', true);
      $('live').hidden = false; $('trEdit').hidden = true; show('trActs', false);
      $('live').classList.remove('empty');
      $('live').textContent = e.text;
      $('live').scrollTop = $('live').scrollHeight;
    });
    R.on('segment', function (e) {
      stat(e.saved ? L('Guardado automático', 'Autosaved') : L('Sin conexión: se reintenta', 'Offline: will retry'));
    });
    R.on('model', function (e) {
      if (e.background) { if (e.phase !== 'done') stat(modelMsg(e.phase) + (e.pct != null ? ' ' + e.pct + '%' : '')); return; }
      if (e.phase === 'done') overlay(false);
      else overlay(true, modelMsg(e.phase), e.pct);
    });
    R.on('saved', async function (e) {
      $('clock').textContent = '00:00';
      stat(L('Grabación guardada', 'Recording saved'));
      // Mark the row a meeting. POST /recordings cannot carry it; this is the endpoint that can.
      try { await api('/factory/recordings/' + e.recording_id + '/session', { method: 'PATCH', body: JSON.stringify({ mode: 'meeting' }) }); } catch (x) {}
      await loadMeetings();
      await openMeeting(e.recording_id);
      await readMeeting();
    });
    R.on('discarded', function () {
      $('clock').textContent = '00:00';
      stat(L('No se captó voz; la grabación se descartó.', 'No speech was captured; the recording was discarded.'));
      $('live').textContent = ''; $('live').classList.add('empty');
    });
    R.on('recovered', function (e) {
      stat(L('Grabación recuperada tras una interrupción.', 'Recording recovered after an interruption.'));
      if (e.ids && e.ids.length) loadMeetings();
    });
    R.on('error', function (e) {
      overlay(false);
      if (e.code === 'no-display-audio') stat(L('Elige la pestaña de la llamada y activa “Compartir audio”.', 'Pick the call tab and turn on "Share audio".'));
      else stat(e.message || 'error');
    });

    $('startBtn').addEventListener('click', function () {
      clearPrompt(); show('intelCard', false);
      $('live').textContent = ''; $('live').classList.add('empty');
      $('live').hidden = false; $('trEdit').hidden = true; show('trActs', false); show('trCard', true);
      R.start({ mode: 'mic', lang: lang });
    });
    $('pauseBtn').addEventListener('click', function () {
      var s = R.state();
      if (s.paused) R.resume(); else R.pause();
    });
    $('stopBtn').addEventListener('click', function () { R.stop(); });
    recState('idle');
  }

  // ── language ───────────────────────────────────────────────────────────────
  function setLang(l) {
    lang = l;
    try { localStorage.setItem('speakup_lang', l); } catch (e) {}
    document.documentElement.lang = l;
    $('langBtn').textContent = l === 'en' ? 'ES' : 'EN';
    $('outBtn').textContent = L('Salir', 'Sign out');
    $('tabMeet').textContent = L('Reuniones', 'Meetings');
    $('tabFac').textContent = L('Fábrica', 'Factory');
    $('ctx').textContent = L('Acta de reunión', 'Meeting notes');
    $('startBtn').textContent = L('Grabar reunión', 'Record meeting');
    $('stopBtn').textContent = L('Detener', 'Stop');
    $('privacy').textContent = L('Se transcribe en tu dispositivo. El audio no sale de tu equipo.', 'Transcribed on your device. Audio never leaves your machine.');
    $('ovNote').textContent = $('privacy').textContent;
    $('trTitle').textContent = L('Transcripción', 'Transcript');
    $('saveTrBtn').textContent = L('Guardar transcripción', 'Save transcript');
    $('readBtn').textContent = L('Leer la reunión', 'Read the meeting');
    $('intelTitle').textContent = L('Lo que se dijo', 'What was said');
    $('promptBtn').textContent = L('Construir el prompt', 'Build the prompt');
    $('sendBtn').textContent = L('Enviar a la Fábrica', 'Send to Factory');
    $('listTitle').textContent = L('Reuniones', 'Meetings');
    $('listState').textContent = L('Cargando…', 'Loading…');
    $('ask').placeholder = L('Pregunta: acta, resumen, qué tengo que hacer…', 'Ask: minutes, summary, what do I need to do…');
    $('askSend').setAttribute('aria-label', L('Preguntar', 'Ask'));
    $('askNote').textContent = L('Solo lectura: aquí no se ejecuta nada ni se toca código.', 'Read-only: nothing runs and no code is touched here.');
    document.title = L('SpeakUp — Reuniones', 'SpeakUp — Meetings');
    if (intel) renderIntel();
    renderMeetings();
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
    $('saveTrBtn').addEventListener('click', saveTranscript);
    $('readBtn').addEventListener('click', readMeeting);
    $('promptBtn').addEventListener('click', buildPrompt);
    $('sendBtn').addEventListener('click', sendToFactory);
    $('askSend').addEventListener('click', ask);
    $('ask').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); } });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/speakup/sw.js').catch(function () {});

    wireRecorder();
    await loadMeetings();
    if (R) R.recover();
  })();
})();
