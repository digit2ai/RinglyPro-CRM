/* SpeakUp AI Factory — phone UI. Speak or paste, review, approve, watch it work.
 *
 * The Architect/Command/Note screens are an editor-style panel: activity on top,
 * the conversation in the middle, a composer pinned to the bottom (type, paste a
 * prompt from anywhere, or dictate with the small mic inside the box). The big orb
 * belongs to Meeting mode, where you are recording a conversation.
 *
 * Holds no secret. The private phrase is typed or spoken by the owner and checked
 * on the server; the GitHub token and model keys never reach this file.
 * Uses the page's globals: api, lang, t, esc, toast, mdToHtml, openRec, loadLibrary, startMic.
 */
(function () {
  'use strict';

  var L = function (es, en) { return lang === 'en' ? en : es; };
  var $ = function (id) { return document.getElementById(id); };
  var DRAFT_KEY = 'speakup_cmd_draft';

  var F = {
    mode: 'meeting',
    project: null,
    selected: new Set(),
    capturing: false,
    operator: false,
    openJobId: null,
    pollTimer: null,
    eventTimer: null,
    lastEventId: 0,
    thread: [],
    docs: {}
  };

  var MODE_HINT = {
    command: ['Instrucción: "analiza mi última reunión", "estado de mi última tarea"', 'Instruction: "analyze my latest meeting", "status of my last task"'],
    meeting: ['Graba una conversación larga. Se guarda por partes mientras hablas.', 'Record a long conversation. It is saved in parts while you talk.'],
    note: ['Guarda una idea. Nunca modifica código.', 'Save an idea. It never changes code.'],
    architect: ['Escribe, pega o dicta el cambio. Se prepara un plan; nada se ejecuta sin tu aprobación.', 'Type, paste or dictate the change. A plan is prepared; nothing runs without your approval.']
  };
  var PLACEHOLDER = {
    command: ['Escribe o dicta una instrucción…', 'Type or dictate an instruction…'],
    note: ['Escribe o dicta tu idea…', 'Type or dictate your idea…'],
    architect: ['Escribe o pega tu prompt para RinglyPro Architect…', 'Type or paste your prompt for RinglyPro Architect…']
  };

  // ── Modes ──────────────────────────────────────────────────────────────────
  function setMode(m) {
    if (F.capturing) stopCapture();
    F.mode = m;
    try { localStorage.setItem('speakup_mode', m); } catch (e) {}
    document.querySelectorAll('#modes .mode').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === m); });
    var meeting = m === 'meeting';
    $('orbArea').style.display = meeting ? '' : 'none';
    $('cmdBox').style.display = meeting ? 'none' : '';
    document.body.classList.toggle('composing', !meeting);
    $('modeHint').textContent = L(MODE_HINT[m][0], MODE_HINT[m][1]);
    if (!meeting) $('cmdText').placeholder = L(PLACEHOLDER[m][0], PLACEHOLDER[m][1]);
    $('recstatus').textContent = meeting ? t('tapToRec') : '';
    $('recstatus').style.display = meeting ? '' : 'none';
    $('agentLine').style.display = meeting ? 'none' : '';
    renderModeLabels();
  }
  function renderModeLabels() {
    var names = { command: L('Comando', 'Command'), meeting: L('Reunión', 'Meeting'), note: L('Nota', 'Note'), architect: L('Arquitecto', 'Architect') };
    document.querySelectorAll('#modes .mode').forEach(function (b) { b.textContent = names[b.getAttribute('data-mode')]; });
    $('activityTitle').textContent = L('Actividad', 'Activity');
    $('activityHide').textContent = L('Ocultar', 'Hide');
    $('diffBtn').textContent = L('Ver cambios', 'View changes');
  }

  // ── Dictation inside the composer ──────────────────────────────────────────
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recog = null, startTs = 0, tick = null, baseText = '', mr = null;

  // sessionStorage, not localStorage: a dictated draft can contain the spoken private
  // phrase, so it survives a refresh of this tab but not the tab itself.
  function saveDraft() { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ text: $('cmdText').value, mode: F.mode, ts: Date.now() })); } catch (e) {} }
  function grow() { var el = $('cmdText'); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, window.innerHeight * 0.38) + 'px'; }
  function status(s) { $('capStatus').textContent = s || ''; }
  function startTimer() {
    startTs = Date.now();
    tick = setInterval(function () {
      var s = Math.floor((Date.now() - startTs) / 1000);
      status(L('Escuchando ', 'Listening ') + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'));
    }, 500);
  }
  function stopTimer() { clearInterval(tick); }

  F.toggleCapture = function () { if (F.capturing) stopCapture(); else startCapture(); };

  function startCapture() {
    baseText = $('cmdText').value ? $('cmdText').value.replace(/\s+$/, '') + ' ' : '';
    F.capturing = true;
    $('micBtn').classList.add('rec');
    startTimer();
    if (SR) {
      recog = new SR();
      recog.lang = lang === 'en' ? 'en-US' : 'es-ES';
      recog.continuous = true;
      recog.interimResults = true;
      recog.onresult = function (ev) {
        var finalText = '', interim = '';
        for (var i = 0; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript; else interim += ev.results[i][0].transcript;
        }
        $('cmdText').value = baseText + (finalText + interim).replace(/\s+/g, ' ').trimStart();
        grow(); saveDraft();
      };
      recog.onerror = function (e) { if (e.error === 'not-allowed') toast(L('Permite el micrófono para dictar.', 'Allow the microphone to dictate.')); };
      recog.onend = function () { if (F.capturing) stopCapture(true); };
      try { recog.start(); } catch (e) { stopCapture(true); }
    } else if (navigator.mediaDevices && window.MediaRecorder) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var chunks = [];
        mr = new MediaRecorder(stream);
        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = function () {
          stream.getTracks().forEach(function (x) { x.stop(); });
          transcribeBlob(new Blob(chunks), lang).then(function (txt) {
            $('cmdText').value = (baseText + (txt || '')).trim(); grow(); saveDraft();
          }).catch(function () { hideW(); toast(t('transcribeFail')); });
        };
        mr.start();
      }).catch(function (e) { toast(e.message || t('micUnsupported')); stopCapture(true); });
    } else {
      toast(t('micUnsupported')); stopCapture(true);
    }
  }

  function stopCapture(fromEnd) {
    F.capturing = false;
    $('micBtn').classList.remove('rec');
    stopTimer();
    status($('cmdText').value.trim() ? L('Revisa y envía', 'Review and send') : '');
    if (recog && !fromEnd) { try { recog.stop(); } catch (e) {} }
    recog = null;
    if (mr && mr.state === 'recording') mr.stop();
    mr = null;
  }

  // ── Thread (your prompt, then the answer) ─────────────────────────────────
  function renderThread() {
    $('thread').innerHTML = F.thread.slice(-8).map(function (item) {
      if (item.who === 'you') return '<div class="bubble"><div class="who">' + L('Tú', 'You') + '</div>' + esc(item.text) + '</div>';
      return '<div class="card">' + item.html + '</div>';
    }).join('');
  }
  function pushThread(item) { F.thread.push(item); renderThread(); }

  // ── Send ───────────────────────────────────────────────────────────────────
  F.send = async function (text, extra) {
    text = (text == null ? $('cmdText').value : text).trim();
    if (!text) { toast(L('Escribe o dicta una instrucción', 'Type or dictate an instruction')); return; }
    if (F.capturing) stopCapture();
    var btn = $('cmdSend'); btn.disabled = true;
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
    pushThread({ who: 'you', text: text.length > 1200 ? text.slice(0, 1200) + '…' : text });
    pushThread({ who: 'bot', html: '<span class="spin"></span> ' + L('Procesando…', 'Working…') });
    status(L('Enviando…', 'Sending…'));
    try {
      var body = Object.assign({ text: text, mode: F.mode === 'meeting' ? 'command' : F.mode, lang: lang, project_key: F.project,
        recording_ids: Array.from(F.selected), engine: SR ? 'webspeech' : 'whisper' }, extra || {});
      var d = await api('/factory/command', { method: 'POST', body: JSON.stringify(body) });
      if (text === $('cmdText').value.trim()) { $('cmdText').value = ''; grow(); }
      F.thread.pop();
      pushThread({ who: 'bot', html: replyHtml(d) });
      status('');
      if (d.client_action === 'start_meeting') { setMode('meeting'); startMic(); }
      if (d.card && (d.card.type === 'note_saved' || d.card.type === 'document')) loadLibrary();
      if (d.card && d.card.job_id) F.openJob(d.card.job_id, true);
      refreshOverview();
    } catch (e) {
      F.thread.pop();
      pushThread({ who: 'bot', html: '<div style="color:var(--err)">' + esc(e.message) + '</div><div class="muted" style="margin-top:6px">' +
        L('Tu instrucción sigue en el cuadro. Puedes reintentar.', 'Your instruction is still in the box. You can retry.') + '</div>' });
      status('');
    } finally { btn.disabled = false; }
  };

  // ── Replies and cards ──────────────────────────────────────────────────────
  function speakBtn(text) {
    return '<button class="btn sec sm" onclick="Factory.speak(this)" data-say="' + esc(text) + '">' + L('Escuchar', 'Listen') + '</button>';
  }
  var audioEl = null;
  F.speak = function (btn) {
    var text = btn.getAttribute('data-say');
    fetch('/api/tts/edge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 1500), voice: lang === 'en' ? 'ava' : 'lina' }) })
      .then(function (r) { if (!r.ok) throw new Error('tts'); return r.blob(); })
      .then(function (b) { if (audioEl) audioEl.pause(); audioEl = new Audio(URL.createObjectURL(b)); return audioEl.play(); })
      .catch(function () {
        if (window.speechSynthesis) { var u = new SpeechSynthesisUtterance(text); u.lang = lang === 'en' ? 'en-US' : 'es-MX'; speechSynthesis.speak(u); }
      });
  };

  function contextBlock(ctx) {
    if (!ctx || !ctx.recordings || !ctx.recordings.length) return '';
    return '<div class="muted" style="margin:8px 0">' + L('Seleccionado', 'Selected') + ': ' + ctx.recordings.map(function (r) {
      return '<a href="#" onclick="openRec(' + r.id + ');return false">#' + r.id + ' ' + esc(r.title) + '</a>' + (r.why ? ' <span class="muted">(' + esc(r.why) + ')</span>' : '');
    }).join(', ') + '</div>';
  }

  function replyHtml(d) {
    var c = d.card || {};
    return '<div class="row" style="justify-content:space-between;align-items:center"><span class="pill run">' + esc(d.intent || '') + '</span>' +
      speakBtn(d.reply || '') + '</div>' +
      '<div style="margin-top:10px;white-space:pre-wrap">' + esc(d.reply || '') + '</div>' + contextBlock(c.context) + cardBody(c);
  }

  function cardBody(c) {
    switch (c.type) {
      case 'note_saved': return '<button class="btn sec sm" style="margin-top:10px" onclick="openRec(' + c.recording_id + ')">' + L('Abrir nota', 'Open note') + '</button>';
      case 'search_results': return resultsList(c.results);
      case 'summary': return (c.summaries || []).map(function (s) {
        return '<div class="result"><h4>#' + s.recording_id + ' ' + esc(s.title) + '</h4><ul>' + (s.bullets || []).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
          ((s.action_items || []).length ? '<h4>' + t('actions') + '</h4><ul>' + s.action_items.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
      }).join('');
      case 'intel': return (c.intel || []).map(function (x) { return intelHtml(x.recording_id, x.title, x.data); }).join('');
      case 'document': return c.document ? '<div class="result"><div class="row" style="justify-content:space-between"><h4>' + esc(c.document.title) + '</h4>' +
        '<button class="btn sec sm" onclick="Factory.copyDoc(' + c.document.id + ')">' + t('copy') + '</button></div>' +
        '<div class="mdbody">' + mdToHtml(rememberDoc(c.document)) + '</div></div>' : '';
      case 'needs_selection': return '<div class="muted">' + L('Marca las conversaciones en la Biblioteca y repite la instrucción.', 'Tick the conversations in the Library and repeat the instruction.') + '</div>';
      case 'confirm_execute': case 'confirm_merge': return confirmHtml(c);
      case 'confirm_cancel': return '<button class="btn danger block" style="margin-top:10px" onclick="Factory.cancelJob(' + c.job_id + ')">' + L('Sí, cancelar la tarea', 'Yes, cancel the task') + ' #' + c.job_id + '</button>';
      default: return '';
    }
  }

  function rememberDoc(doc) { F.docs[doc.id] = doc.content; return doc.content; }
  F.copyDoc = function (id) { navigator.clipboard.writeText(F.docs[id] || '').then(function () { toast(t('copied')); }); };

  function resultsList(results) {
    if (!results || !results.length) return '<div class="empty">' + L('Sin resultados.', 'No results.') + '</div>';
    return results.map(function (r) {
      return '<div class="recitem" onclick="openRec(' + r.id + ')"><div class="t">#' + r.id + ' ' + esc(r.title) + '</div>' +
        '<div class="m"><span>' + new Date(r.created_at).toLocaleString() + '</span>' + (r.mode ? '<span>· ' + esc(r.mode) + '</span>' : '') + (r.project_key ? '<span>· ' + esc(r.project_key) + '</span>' : '') + '</div>' +
        (r.snippet ? '<div class="quote">' + esc(r.snippet) + '</div>' : '') + '</div>';
    }).join('');
  }

  // ── Meeting intelligence (human approves; brainstorming stays brainstorming) ──
  var CLS_LABEL = {
    APPROVED_REQUIREMENT: ['Aprobado', 'Approved'], DECISION: ['Decisión', 'Decision'], SUGGESTION: ['Sugerencia', 'Suggestion'],
    IDEA: ['Idea', 'Idea'], DISCUSSION: ['Discusión', 'Discussion']
  };
  function itemHtml(recId, i, canApprove) {
    var cls = CLS_LABEL[i.classification] || [i.classification, i.classification];
    var pill = i.classification === 'APPROVED_REQUIREMENT' ? 'ok' : (i.classification === 'DECISION' ? 'run' : 'warn');
    var action = '';
    if (canApprove && i.classification !== 'APPROVED_REQUIREMENT') action = '<button class="btn sec sm" onclick="Factory.classify(' + recId + ',\'' + i.id + '\',\'APPROVED_REQUIREMENT\')">' + L('Aprobar como requisito', 'Approve as requirement') + '</button>';
    if (i.classification === 'APPROVED_REQUIREMENT') action = '<button class="btn sec sm" onclick="Factory.classify(' + recId + ',\'' + i.id + '\',\'SUGGESTION\')">' + L('Quitar aprobación', 'Remove approval') + '</button>';
    return '<div class="item"><div><span class="pill ' + pill + '">' + L(cls[0], cls[1]) + '</span> <span class="pill">' + esc(i.kind) + '</span>' + (i.approved_by_human ? ' <span class="pill ok">' + L('por ti', 'by you') + '</span>' : '') + '</div>' +
      '<div style="margin-top:6px">' + esc(i.text) + '</div><div class="quote">"' + esc(i.quote) + '"</div>' +
      ((i.notes || []).length ? '<div class="muted">' + esc(i.notes.join('; ')) + '</div>' : '') + (action ? '<div style="margin-top:6px">' + action + '</div>' : '') + '</div>';
  }
  function section(title, items, recId, canApprove) {
    if (!items || !items.length) return '';
    return '<h4>' + title + ' (' + items.length + ')</h4>' + items.map(function (i) { return itemHtml(recId, i, canApprove); }).join('');
  }
  function intelHtml(recId, title, d) {
    if (!d) return '';
    var approvedDev = [].concat(d.requirements || [], d.bugs || [], d.features || [], d.business_rules || []);
    return '<div class="result"><h4>#' + recId + ' ' + esc(title || '') + (d.is_simulated ? ' <span class="pill warn">' + L('sin modelo', 'no model') + '</span>' : '') + '</h4>' +
      (d.summary ? '<p>' + esc(d.summary) + '</p>' : '') +
      (d.participants && d.participants.length ? '<div class="muted">' + L('Participantes', 'Participants') + ': ' + esc(d.participants.join(', ')) + '</div>' : '') +
      section(L('Requisitos aprobados', 'Approved requirements'), approvedDev, recId, true) +
      section(L('Decisiones', 'Decisions'), d.decisions, recId, false) +
      section(L('Acciones', 'Action items'), d.action_items, recId, false) +
      section(L('Preguntas abiertas', 'Open questions'), d.open_questions, recId, false) +
      section(L('Criterios de aceptación', 'Acceptance criteria'), d.acceptance_criteria, recId, true) +
      section(L('Sugerencias (no son requisitos)', 'Suggestions (not requirements)'), d.suggestions, recId, true) +
      section(L('Ideas (no son requisitos)', 'Ideas (not requirements)'), d.ideas, recId, true) +
      section(L('Discusión', 'Discussion'), d.discussion, recId, true) +
      ((d.unverified || []).length ? '<h4>' + L('Sin verificar (la cita no aparece en la transcripción)', 'Unverified (quote not in the transcript)') + '</h4>' + d.unverified.map(function (u) { return '<div class="item muted">' + esc(u.text) + ' — ' + esc(u.reason) + '</div>'; }).join('') : '') +
      '<div class="grid" style="margin-top:12px"><button class="btn sm" onclick="Factory.prepareFrom(' + recId + ')">' + L('Preparar implementación', 'Prepare implementation') + '</button>' +
      '<button class="btn sec sm" onclick="Factory.reextract(' + recId + ')">' + L('Volver a analizar', 'Analyze again') + '</button></div></div>';
  }

  F.showIntel = async function (recId) {
    pushThread({ who: 'bot', html: '<span class="spin"></span> ' + L('Analizando la reunión…', 'Analyzing the meeting…') });
    try {
      var d = await api('/factory/recordings/' + recId + '/intel');
      if (!d.intel) d = await api('/factory/recordings/' + recId + '/intel', { method: 'POST', body: JSON.stringify({ lang: lang }) });
      var rec = current && current.recording && current.recording.id === recId ? current.recording : { title: '' };
      F.thread.pop(); pushThread({ who: 'bot', html: intelHtml(recId, rec.title, d.intel) });
    } catch (e) { F.thread.pop(); pushThread({ who: 'bot', html: '<div style="color:var(--err)">' + esc(e.message) + '</div>' }); }
  };
  F.reextract = async function (recId) {
    try { await api('/factory/recordings/' + recId + '/intel', { method: 'POST', body: JSON.stringify({ lang: lang }) }); F.showIntel(recId); }
    catch (e) { toast(e.message); }
  };
  F.classify = async function (recId, itemId, cls) {
    try {
      var d = await api('/factory/recordings/' + recId + '/intel/items/' + encodeURIComponent(itemId), { method: 'PATCH', body: JSON.stringify({ classification: cls }) });
      var rec = current && current.recording && current.recording.id === recId ? current.recording : { title: '' };
      pushThread({ who: 'bot', html: intelHtml(recId, rec.title, d.intel) });
      toast(t('saved'));
    } catch (e) { toast(e.message); }
  };
  F.prepareFrom = function (recId) {
    F.send(L('Prepara la implementación de los requisitos aprobados', 'Prepare the implementation of the approved requirements'), { mode: 'command', recording_ids: [recId] });
  };

  F.editSession = async function (recId) {
    var parts = prompt(L('Participantes (separados por coma)', 'Participants (comma separated)'), ((current && current.recording && current.recording.participants) || []).join(', '));
    if (parts === null) return;
    try {
      await api('/factory/recordings/' + recId + '/session', { method: 'PATCH', body: JSON.stringify({ participants: parts.split(',').map(function (s) { return s.trim(); }).filter(Boolean), project_key: F.project }) });
      toast(t('saved')); loadLibrary();
    } catch (e) { toast(e.message); }
  };

  F.onSessionSaved = async function (recId) {
    try { await api('/factory/recordings/' + recId + '/session', { method: 'PATCH', body: JSON.stringify({ mode: 'meeting', project_key: F.project }) }); } catch (e) {}
  };

  // ── Selection from the Library ─────────────────────────────────────────────
  F.toggleSelect = function (id, on) {
    if (on) F.selected.add(id); else F.selected.delete(id);
    var chip = $('selChip');
    if (F.selected.size) {
      chip.style.display = '';
      chip.innerHTML = F.selected.size + ' ' + L('conversaciones seleccionadas para el próximo comando', 'conversations selected for the next command') +
        ' · <a href="#" onclick="Factory.clearSelection();return false">' + L('limpiar', 'clear') + '</a>';
    } else chip.style.display = 'none';
  };
  F.clearSelection = function () { F.selected.clear(); F.toggleSelect(0, false); loadLibrary(); };

  // ── Confirmation (execute / merge) ─────────────────────────────────────────
  function confirmHtml(c) {
    var isExec = c.type === 'confirm_execute';
    var blockers = c.readiness && !c.readiness.ready ? '<div class="banner">' + c.readiness.blockers.map(function (b) { return esc(b.fix); }).join('<br>') + '</div>' : '';
    var srcs = (c.sources || []).map(function (s) { return '<li>#' + s.id + ' ' + esc(s.title) + ' · ' + new Date(s.created_at).toLocaleString() + '</li>'; }).join('');
    return blockers + '<div class="result"><h4>' + (isExec ? L('Vas a ejecutar', 'You are about to execute') : L('Vas a fusionar', 'You are about to merge')) + '</h4>' +
      '<div>' + L('Tarea', 'Task') + ' #' + c.job_id + ' · ' + esc(c.title || '') + '</div>' +
      '<div class="muted">' + esc(c.repo || '') + ' · ' + L('rama', 'branch') + ' ' + esc(c.branch || '') + ' · plan ' + esc(String(c.plan_hash || '').slice(0, 10)) + '</div>' +
      (srcs ? '<div style="margin-top:8px">' + L('A partir de', 'From') + ':<ul>' + srcs + '</ul></div>' : '') +
      (!isExec && c.changed_files ? '<div style="margin-top:8px">' + L('Archivos cambiados', 'Changed files') + ' (' + c.changed_files.length + '):<ul>' + c.changed_files.slice(0, 30).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>' : '') +
      (!isExec && c.suite_modified ? '<div class="banner">' + L('Este cambio editó una suite de pruebas: revisa y fusiona en GitHub.', 'This change edited a test suite: review and merge on GitHub.') + '</div>' : '') +
      (!isExec && c.outside_plan && c.outside_plan.length ? '<div class="banner">' + L('Archivos fuera del plan aprobado: ', 'Files outside the approved plan: ') + esc(c.outside_plan.join(', ')) + '</div>' : '') +
      (isExec ? '<div class="muted">' + L('Se crea una rama y un PR. No se toca main ni producción.', 'A branch and a PR are created. main and production are not touched.') + '</div>'
        : '<div class="muted">' + L('Fusionar publica el cambio en main y Render lo despliega.', 'Merging puts the change on main and Render deploys it.') + '</div>') +
      '<button class="btn sec sm" style="margin-top:8px" onclick="Factory.openJob(' + c.job_id + ')">' + L('Ver el plan completo', 'See the full plan') + '</button>' +
      (c.phrase_verified ? '<div class="muted" style="margin-top:10px">' + L('Frase privada verificada.', 'Private phrase verified.') + '</div>'
        : '<input type="password" id="phrase' + c.job_id + '" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + L('Frase privada', 'Private phrase') + '" style="margin-top:10px">') +
      '<button class="btn block" style="margin-top:10px" ' + (c.readiness && !c.readiness.ready ? 'disabled' : '') +
      ' onclick="Factory.confirm(\'' + (isExec ? 'execute' : 'merge') + '\',' + c.job_id + ',\'' + esc(c.plan_hash || '') + '\',\'' + esc(c.confirm_token || '') + '\')">' +
      (isExec ? L('Confirmar y ejecutar', 'Confirm and execute') : L('Confirmar y fusionar', 'Confirm and merge')) + '</button></div>';
  }

  F.confirm = async function (action, jobId, planHash, token) {
    var input = $('phrase' + jobId);
    var body = { plan_hash: planHash };
    if (token) body.confirm_token = token;
    else if (input && input.value) body.passphrase = input.value;
    else { toast(L('Escribe tu frase privada', 'Type your private phrase')); return; }
    try {
      var d = await api('/factory/jobs/' + jobId + '/' + action, { method: 'POST', body: JSON.stringify(body) });
      if (input) input.value = '';
      toast(action === 'execute' ? L('Tarea en marcha. Puedes cerrar la app.', 'Task started. You can close the app.') : L('Fusionado. Esperando el despliegue.', 'Merged. Waiting for deployment.'));
      F.openJob(d.job.id, true); refreshOverview();
    } catch (e) {
      if (input) input.value = '';
      toast(e.message);
      if (e.data && e.data.job) F.openJob(jobId);
    }
  };

  F.cancelJob = async function (jobId) {
    try { await api('/factory/jobs/' + jobId + '/cancel', { method: 'POST', body: JSON.stringify({ confirm: true }) }); toast(L('Cancelada', 'Cancelled')); F.openJob(jobId); refreshOverview(); }
    catch (e) { toast(e.message); }
  };

  // ── Activity: what the factory is doing, live ─────────────────────────────
  var STEPS = [
    { es: 'Plan', en: 'Plan', at: ['ANALYZING', 'PLANNING'] },
    { es: 'Aprobar', en: 'Approve', at: ['WAITING_APPROVAL'] },
    { es: 'Código', en: 'Code', at: ['QUEUED', 'CODING'] },
    { es: 'Pruebas', en: 'Tests', at: ['TESTING', 'FIXING'] },
    { es: 'PR', en: 'PR', at: ['PUSHING', 'PR_CREATED', 'READY_FOR_REVIEW'] },
    { es: 'Despliegue', en: 'Deploy', at: ['DEPLOYING', 'DEPLOYED'] }
  ];
  function renderSteps(status) {
    var idx = -1;
    STEPS.forEach(function (s, i) { if (s.at.indexOf(status) >= 0) idx = i; });
    $('steps').innerHTML = STEPS.map(function (s, i) {
      var cls = idx < 0 ? '' : (i < idx ? 'done' : (i === idx ? 'on' : ''));
      return '<span class="step ' + cls + '">' + L(s.es, s.en) + '</span>';
    }).join('') + (status === 'FAILED' || status === 'CANCELLED' ? '<span class="step" style="color:var(--err);border-color:#5a2a3a">' + esc(status) + '</span>' : '');
  }
  var KIND = { read: 'READ', edit: 'EDIT', write: 'WRITE', run: 'RUN', search: 'FIND', say: 'CLAUDE', test: 'TEST', error: 'ERROR', info: 'INFO', done: 'DONE', status: 'STATUS', pr: 'PR', todo: 'PLAN', tool: 'TOOL' };
  function diffLines(txt, cls) {
    return String(txt || '').split('\n').slice(0, 40).map(function (l) { return '<span class="dl ' + cls + '">' + esc(l) + '</span>'; }).join('');
  }
  function eventHtml(e) {
    var tag = KIND[e.kind] || 'INFO';
    var k = e.kind === 'error' ? 'k err' : (e.kind === 'done' || e.kind === 'status' ? 'k ok' : (e.kind === 'test' ? 'k warn' : 'k'));
    var body = e.kind === 'say' ? '<span class="sayline">' + esc(e.text) + '</span>'
      : (['read', 'edit', 'write'].indexOf(e.kind) >= 0 ? '<span class="path">' + esc(e.text) + '</span>' : esc(e.text));
    var extra = '';
    var d = e.detail || {};
    if (d.old || d.new) extra = '<details><summary>' + L('ver cambio', 'see change') + '</summary>' + diffLines(d.old, 'del') + diffLines(d.new, 'add') + '</details>';
    return '<span class="ln"><span class="' + k + '">' + tag + '</span> ' + body + '</span>' + extra;
  }

  F.showActivity = function (on) { $('activityCard').style.display = on ? '' : 'none'; };

  async function pollEvents(jobId) {
    clearTimeout(F.eventTimer);
    if (F.openJobId !== jobId) return;
    try {
      var d = await api('/factory/jobs/' + jobId + '/events?after=' + F.lastEventId);
      if (F.openJobId !== jobId) return;
      if (d.events.length) {
        F.lastEventId = d.events[d.events.length - 1].id;
        var term = $('term');
        var atBottom = term.scrollTop + term.clientHeight >= term.scrollHeight - 30;
        term.insertAdjacentHTML('beforeend', d.events.map(eventHtml).join(''));
        if (atBottom) term.scrollTop = term.scrollHeight;
      }
      renderSteps(d.status);
      $('diffBtn').style.display = d.pr_number ? '' : 'none';
      if (!d.terminal && document.visibilityState === 'visible') F.eventTimer = setTimeout(function () { pollEvents(jobId); }, 2500);
    } catch (e) { /* the page handles 401 */ }
  }

  F.viewDiff = async function () {
    var box = $('diffBox');
    box.innerHTML = '<div class="muted" style="margin-top:10px"><span class="spin"></span></div>';
    try {
      var d = await api('/factory/jobs/' + F.openJobId + '/diff');
      box.innerHTML = '<div style="margin-top:12px"><div class="muted">' + d.files.length + ' ' + L('archivos', 'files') + ' · <a href="' + esc(d.pr_url) + '" target="_blank" rel="noopener">PR #' + d.pr_number + '</a></div>' +
        d.files.map(function (f) {
          return '<details style="margin-top:8px"><summary><span class="path">' + esc(f.filename) + '</span> <span class="muted">+' + f.additions + ' -' + f.deletions + '</span></summary>' +
            '<div class="term" style="margin-top:6px">' + String(f.patch || '').split('\n').map(function (l) {
              var cls = l.charAt(0) === '+' ? 'add' : (l.charAt(0) === '-' ? 'del' : (l.charAt(0) === '@' ? 'hdr' : ''));
              return '<span class="dl ' + cls + '">' + esc(l) + '</span>';
            }).join('') + (f.truncated ? '<span class="dl hdr">' + L('(recortado)', '(truncated)') + '</span>' : '') + '</div></details>';
        }).join('') + '</div>';
    } catch (e) { box.innerHTML = '<div class="muted" style="margin-top:10px;color:var(--err)">' + esc(e.message) + '</div>'; }
  };

  // ── Tasks ──────────────────────────────────────────────────────────────────
  function pillFor(status) {
    if (status === 'DEPLOYED' || status === 'READY_FOR_REVIEW') return 'ok';
    if (status === 'FAILED') return 'err';
    if (status === 'WAITING_APPROVAL' || status === 'CANCELLED') return 'warn';
    return 'run';
  }

  async function refreshOverview() {
    try {
      var d = await api('/factory/overview?lang=' + lang);
      F.operator = d.operator;
      var sel = $('projSel');
      var keep = F.project;
      sel.innerHTML = (d.projects || []).filter(function (p) { return p.enabled; }).map(function (p) { return '<option value="' + esc(p.key) + '">' + esc(p.name) + '</option>'; }).join('');
      if (keep && d.projects.some(function (p) { return p.key === keep; })) sel.value = keep;
      F.project = sel.value || null;
      if (!d.operator) { $('jobsCard').style.display = 'none'; return; }
      $('jobsCard').style.display = '';
      $('readiness').innerHTML = d.readiness && !d.readiness.ready
        ? '<div class="banner"><strong>' + L('La ejecución está cerrada hasta configurar:', 'Execution is closed until you set:') + '</strong><br>' + d.readiness.blockers.map(function (b) { return esc(b.fix); }).join('<br>') + '</div>' : '';
      $('jobList').innerHTML = (d.jobs || []).length ? d.jobs.map(function (j) {
        return '<div class="jobitem" onclick="Factory.openJob(' + j.id + ')"><div class="row" style="justify-content:space-between"><strong>#' + j.id + ' ' + esc(j.project_name || '') + '</strong><span class="pill ' + pillFor(j.status) + '">' + esc(j.status) + '</span></div>' +
          '<div class="muted" style="margin-top:4px">' + esc(j.title || '') + ' · ' + new Date(j.updated_at).toLocaleString() + '</div></div>';
      }).join('') : '<div class="empty">' + L('Sin tareas todavía.', 'No tasks yet.') + '</div>';
      var active = (d.jobs || []).filter(function (j) { return !j.terminal; })[0];
      if (active && !F.openJobId) F.openJob(active.id);
    } catch (e) { /* signed out or offline: the page handles 401 */ }
  }
  F.refresh = refreshOverview;
  F.relabel = function () {
    if (!$('modes')) return;
    renderModeLabels();
    $('modeHint').textContent = L(MODE_HINT[F.mode][0], MODE_HINT[F.mode][1]);
    if (F.mode !== 'meeting') $('cmdText').placeholder = L(PLACEHOLDER[F.mode][0], PLACEHOLDER[F.mode][1]);
  };

  F.openJob = async function (id, follow) {
    if (F.openJobId !== id) { F.lastEventId = 0; $('term').innerHTML = ''; $('diffBox').innerHTML = ''; }
    F.openJobId = id;
    clearTimeout(F.pollTimer);
    F.showActivity(true);
    pollEvents(id);
    var box = $('jobDetail');
    try {
      var d = await api('/factory/jobs/' + id + '?lang=' + lang);
      var j = d.job;
      renderSteps(j.status);
      var actions = '';
      if (j.status === 'WAITING_APPROVAL') actions += '<button class="btn block" onclick="Factory.askConfirm(\'execute\',' + j.id + ')">' + L('Aprobar y ejecutar', 'Approve and execute') + '</button>';
      if (j.status === 'READY_FOR_REVIEW') actions += '<button class="btn block" onclick="Factory.askConfirm(\'merge\',' + j.id + ')">' + L('Fusionar (despliega)', 'Merge (deploys)') + '</button>';
      if (j.pr_url) actions += '<a class="btn sec block" style="display:block;text-align:center;margin-top:8px;text-decoration:none" href="' + esc(j.pr_url) + '" target="_blank" rel="noopener">' + L('Ver PR', 'View PR') + ' #' + j.pr_number + '</a>';
      if (!j.terminal && j.status !== 'DEPLOYING') actions += '<button class="btn danger sm block" style="margin-top:8px" onclick="Factory.cancelJob(' + j.id + ')">' + L('Cancelar tarea', 'Cancel task') + '</button>';
      box.innerHTML = '<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">' + L('Tarea', 'Task') + ' #' + j.id + '</h2><span class="pill ' + pillFor(j.status) + '">' + esc(j.status) + '</span></div>' +
        '<div class="plain" style="margin-top:12px">' + esc(j.plain) + '</div>' +
        '<div class="row" style="margin-top:8px">' + speakBtn(j.plain) + '<button class="btn sec sm" onclick="Factory.trace(' + j.id + ')">' + L('¿Por qué este cambio?', 'Why this change?') + '</button></div>' +
        (j.sources.length ? '<div class="muted" style="margin-top:10px">' + L('Fuentes', 'Sources') + ': ' + j.sources.map(function (s) { return '<a href="#" onclick="openRec(' + s.id + ');return false">#' + s.id + ' ' + esc(s.title) + '</a>'; }).join(', ') + '</div>' : '') +
        '<div style="margin-top:12px">' + actions + '</div>' +
        (j.plan_md ? '<details class="sec-collapse" style="margin-top:14px"' + (j.status === 'WAITING_APPROVAL' ? ' open' : '') + '><summary>' + L('Plan', 'Plan') + '</summary><div class="mdbody">' + mdToHtml(j.plan_md) + '</div></details>' : '') +
        '<div id="trace' + j.id + '"></div></div>';
      if (follow) $('activityCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!j.terminal && document.visibilityState === 'visible') F.pollTimer = setTimeout(function () { if (F.openJobId === id) F.openJob(id); }, 8000);
    } catch (e) { box.innerHTML = '<div class="card" style="color:var(--err)">' + esc(e.message) + '</div>'; }
  };

  F.askConfirm = async function (action, jobId) {
    try {
      var d = await api('/factory/jobs/' + jobId);
      var j = d.job;
      var ov = await api('/factory/overview');
      pushThread({ who: 'bot', html: confirmHtml({ type: action === 'execute' ? 'confirm_execute' : 'confirm_merge', job_id: j.id, plan_hash: j.plan_hash,
        title: j.title, repo: j.repo, branch: j.branch || ('speakup/job-' + j.id), sources: j.sources, readiness: ov.readiness, phrase_verified: false,
        changed_files: j.changed_files, suite_modified: j.suite_modified, outside_plan: j.outside_plan }) });
      $('thread').scrollIntoView({ behavior: 'smooth', block: 'end' });
    } catch (e) { toast(e.message); }
  };

  F.trace = async function (jobId) {
    var el = $('trace' + jobId);
    try {
      var d = await api('/factory/jobs/' + jobId + '/trace');
      var w = d.why;
      el.innerHTML = '<div class="result"><h4>' + L('Instrucción', 'Instruction') + '</h4>' + (w.command ? '<div>' + esc(w.command.transcript) + '</div><div class="muted">' + esc(w.command.intent) + ' · ' + esc(w.command.classified_by) + ' · ' + new Date(w.command.created_at).toLocaleString() + '</div>' : '<div class="muted">-</div>') +
        '<h4>' + L('Requisitos aprobados', 'Approved requirements') + '</h4>' + (w.approved_requirements || []).map(function (r) { return '<div class="item">' + esc(r.id + ' ' + r.text) + '<div class="quote">"' + esc(r.quote) + '"</div></div>'; }).join('') +
        '<h4>' + L('Conversaciones de origen', 'Source conversations') + '</h4>' + (w.sources || []).map(function (s) { return '<div class="item"><strong>#' + s.id + ' ' + esc(s.title) + '</strong><div class="quote">' + esc(s.excerpt.slice(0, 400)) + '…</div></div>'; }).join('') +
        '<h4>' + L('Aprobación', 'Approval') + '</h4><div>' + esc(w.approved_by || L('aún no aprobado', 'not approved yet')) + (w.approved_at ? ' · ' + new Date(w.approved_at).toLocaleString() : '') + '</div><div class="muted">plan ' + esc(String(w.approved_plan_hash || '').slice(0, 16)) + '</div>' +
        '<h4>' + L('Registro de auditoría', 'Audit trail') + '</h4>' + (d.audit || []).map(function (a) { return '<div class="item muted">' + new Date(a.at).toLocaleString() + ' · ' + esc(a.actor) + ' · ' + esc(a.action) + (a.to ? ' → ' + esc(a.to) : '') + '</div>'; }).join('') + '</div>';
    } catch (e) { el.innerHTML = '<div class="muted">' + esc(e.message) + '</div>'; }
  };

  // ── Memory search ──────────────────────────────────────────────────────────
  async function memSearch() {
    var q = $('memQ').value.trim();
    if (!q) return;
    $('memResults').innerHTML = '<div class="muted" style="margin-top:10px"><span class="spin"></span></div>';
    try { var d = await api('/factory/search?q=' + encodeURIComponent(q)); $('memResults').innerHTML = '<div style="margin-top:10px">' + resultsList(d.results) + '</div>'; }
    catch (e) { $('memResults').innerHTML = '<div class="muted">' + esc(e.message) + '</div>'; }
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  F.boot = function () {
    var params = new URLSearchParams(location.search);
    var saved = null; try { saved = localStorage.getItem('speakup_mode'); } catch (e) {}
    F.project = (function () { try { return localStorage.getItem('speakup_project'); } catch (e) { return null; } })();
    document.querySelectorAll('#modes .mode').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });
    // Meeting is the default so tapping the orb still records, as SpeakUp always did.
    setMode(['command', 'meeting', 'note', 'architect'].indexOf(params.get('mode')) >= 0 ? params.get('mode') : (saved || 'meeting'));
    $('projSel').addEventListener('change', function () { F.project = this.value; try { localStorage.setItem('speakup_project', F.project); } catch (e) {} });
    $('micBtn').addEventListener('click', function () { F.toggleCapture(); });
    $('cmdSend').addEventListener('click', function () { F.send(); });
    $('cmdText').addEventListener('input', function () { grow(); saveDraft(); });
    // Cmd/Ctrl+Enter sends from a keyboard; plain Enter stays a new line on a phone.
    $('cmdText').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); F.send(); } });
    $('activityHide').addEventListener('click', function () { F.showActivity(false); });
    $('diffBtn').addEventListener('click', F.viewDiff);
    $('memGo').addEventListener('click', memSearch);
    $('memQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') memSearch(); });
    // An unsent instruction survives a refresh of this tab.
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    try {
      var dr = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (dr && dr.text && Date.now() - dr.ts < 7 * 86400e3) { $('cmdText').value = dr.text; grow(); toast(L('Recuperé tu instrucción sin enviar.', 'Restored your unsent instruction.')); }
    } catch (e) {}
    refreshOverview().then(function () { var jid = parseInt(params.get('job'), 10); if (jid) F.openJob(jid, true); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { refreshOverview(); if (F.openJobId) F.openJob(F.openJobId); }
    });
  };

  window.Factory = F;
})();
