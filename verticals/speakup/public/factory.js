/* SpeakUp AI Factory — phone UI. Speak, review, approve, check status.
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
    mode: 'command',
    project: null,
    selected: new Set(),
    capturing: false,
    operator: false,
    openJobId: null,
    pollTimer: null
  };

  var MODE_HINT = {
    command: ['Da una instrucción: "analiza mi última reunión", "¿cuál es el estado de mi última tarea?"', 'Give an instruction: "analyze my latest meeting", "what is the status of my last task?"'],
    meeting: ['Graba una conversación larga. Se guarda por partes mientras hablas.', 'Record a long conversation. It is saved in parts while you talk.'],
    note: ['Guarda una idea. Nunca modifica código.', 'Save an idea. It never changes code.'],
    architect: ['Pide un cambio de ingeniería. Se prepara un plan; nada se ejecuta sin tu aprobación.', 'Ask for an engineering change. A plan is prepared; nothing runs without your approval.']
  };

  // ── Modes ──────────────────────────────────────────────────────────────────
  function setMode(m) {
    if (F.capturing) stopCapture();
    F.mode = m;
    try { localStorage.setItem('speakup_mode', m); } catch (e) {}
    document.querySelectorAll('#modes .mode').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === m); });
    var meeting = m === 'meeting';
    $('callBtn').style.display = meeting ? '' : 'none';
    $('noBotNote').style.display = meeting ? '' : 'none';
    $('cmdBox').style.display = meeting ? 'none' : '';
    $('modeHint').textContent = L(MODE_HINT[m][0], MODE_HINT[m][1]);
    $('recstatus').textContent = meeting ? t('tapToRec') : L('Pulsa y habla', 'Tap and speak');
    $('cmdSend').textContent = m === 'note' ? L('Guardar nota', 'Save note') : L('Enviar', 'Send');
    renderModeLabels();
  }
  function renderModeLabels() {
    var names = { command: L('Comando', 'Command'), meeting: L('Reunión', 'Meeting'), note: L('Nota', 'Note'), architect: L('Arquitecto', 'Architect') };
    document.querySelectorAll('#modes .mode').forEach(function (b) { b.textContent = names[b.getAttribute('data-mode')]; });
  }

  // ── Capture for command / note / architect ────────────────────────────────
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recog = null, startTs = 0, tick = null, baseText = '', mr = null, mrChunks = [], mrStream = null;

  // sessionStorage, not localStorage: a dictated draft can contain the spoken private
  // phrase, so it survives a refresh of this tab but not the tab itself.
  function saveDraft() { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ text: $('cmdText').value, mode: F.mode, ts: Date.now() })); } catch (e) {} }
  function startTimer() {
    startTs = Date.now();
    tick = setInterval(function () { var s = Math.floor((Date.now() - startTs) / 1000); $('timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }, 500);
  }
  function stopTimer() { clearInterval(tick); $('timer').textContent = '00:00'; }

  F.toggleCapture = function () { if (F.capturing) stopCapture(); else startCapture(); };

  function startCapture() {
    baseText = $('cmdText').value ? $('cmdText').value.trim() + ' ' : '';
    F.capturing = true;
    $('orb').classList.add('rec');
    $('recstatus').textContent = L('Escuchando…', 'Listening…');
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
        $('cmdText').value = (baseText + finalText + interim).replace(/\s+/g, ' ').trimStart();
        saveDraft();
      };
      recog.onerror = function (e) { if (e.error === 'not-allowed') toast(L('Permite el micrófono para dictar.', 'Allow the microphone to dictate.')); };
      recog.onend = function () { if (F.capturing) stopCapture(true); };
      try { recog.start(); } catch (e) { stopCapture(true); }
    } else if (navigator.mediaDevices && window.MediaRecorder) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        mrStream = stream; mrChunks = [];
        mr = new MediaRecorder(stream);
        mr.ondataavailable = function (e) { if (e.data && e.data.size) mrChunks.push(e.data); };
        mr.onstop = function () {
          stream.getTracks().forEach(function (x) { x.stop(); });
          var blob = new Blob(mrChunks);
          transcribeBlob(blob, lang).then(function (txt) {
            $('cmdText').value = (baseText + (txt || '')).trim(); saveDraft();
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
    $('orb').classList.remove('rec');
    stopTimer();
    $('recstatus').textContent = $('cmdText').value.trim() ? L('Revisa y envía', 'Review and send') : L('Pulsa y habla', 'Tap and speak');
    if (recog && !fromEnd) { try { recog.stop(); } catch (e) {} }
    recog = null;
    if (mr && mr.state === 'recording') mr.stop();
    mr = null;
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  F.send = async function (text, extra) {
    text = (text == null ? $('cmdText').value : text).trim();
    if (!text) { toast(L('Di o escribe una instrucción', 'Say or type an instruction')); return; }
    if (F.capturing) stopCapture();
    var btn = $('cmdSend'); btn.disabled = true;
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
    var box = $('factoryReply');
    box.innerHTML = '<div class="card"><span class="spin"></span> ' + L('Procesando…', 'Working…') + '</div>';
    try {
      var body = Object.assign({ text: text, mode: F.mode === 'meeting' ? 'command' : F.mode, lang: lang, project_key: F.project,
        recording_ids: Array.from(F.selected), engine: SR ? 'webspeech' : 'whisper' }, extra || {});
      var d = await api('/factory/command', { method: 'POST', body: JSON.stringify(body) });
      if (text === $('cmdText').value.trim()) $('cmdText').value = '';
      renderReply(d);
      if (d.client_action === 'start_meeting') { setMode('meeting'); startMic(); }
      if (d.card && (d.card.type === 'note_saved' || d.card.type === 'document')) loadLibrary();
      refreshOverview();
    } catch (e) {
        box.innerHTML = '<div class="card"><div style="color:var(--err)">' + esc(e.message) + '</div><div class="muted" style="margin-top:6px">' +
        L('Tu instrucción sigue en el cuadro. Puedes reintentar.', 'Your instruction is still in the box. You can retry.') + '</div></div>';
    } finally { btn.disabled = false; }
  };

  // ── Replies and cards ──────────────────────────────────────────────────────
  function speakBtn(text) {
    return '<button class="btn sec sm" onclick="Factory.speak(this)" data-say="' + esc(text).replace(/"/g, '&quot;') + '">' + L('Escuchar', 'Listen') + '</button>';
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

  function renderReply(d) {
    var c = d.card || {};
    var html = '<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><span class="pill run">' + esc(d.intent || '') + '</span>' +
      speakBtn(d.reply || '') + '</div>' +
      '<div class="plain" style="margin-top:10px;font-family:inherit">' + esc(d.reply || '') + '</div>' + contextBlock(c.context) + cardBody(c) + '</div>';
    $('factoryReply').innerHTML = html;
    if (c.type === 'job' && c.job_id) F.openJob(c.job_id);
    $('factoryReply').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cardBody(c) {
    switch (c.type) {
      case 'note_saved': return '<button class="btn sec sm" onclick="openRec(' + c.recording_id + ')">' + L('Abrir nota', 'Open note') + '</button>';
      case 'search_results': return resultsList(c.results);
      case 'summary': return (c.summaries || []).map(function (s) {
        return '<div class="result"><h4>#' + s.recording_id + ' ' + esc(s.title) + '</h4><ul>' + (s.bullets || []).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
          ((s.action_items || []).length ? '<h4>' + t('actions') + '</h4><ul>' + s.action_items.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
      }).join('');
      case 'intel': return (c.intel || []).map(function (x) { return intelHtml(x.recording_id, x.title, x.data); }).join('');
      case 'document': return c.document ? '<div class="result"><div class="row" style="justify-content:space-between"><h4>' + esc(c.document.title) + '</h4>' +
        '<button class="btn sec sm" onclick="navigator.clipboard.writeText(Factory.docs[' + c.document.id + ']).then(function(){toast(t(\'copied\'))})">' + t('copy') + '</button></div>' +
        '<div class="mdbody">' + mdToHtml(rememberDoc(c.document)) + '</div></div>' : '';
      case 'needs_selection': return '<div class="muted">' + L('Marca las conversaciones en la Biblioteca y repite la instrucción.', 'Tick the conversations in the Library and repeat the instruction.') + '</div>';
      case 'confirm_execute': case 'confirm_merge': return confirmHtml(c);
      case 'confirm_cancel': return '<button class="btn danger block" onclick="Factory.cancelJob(' + c.job_id + ')">' + L('Sí, cancelar la tarea', 'Yes, cancel the task') + ' #' + c.job_id + '</button>';
      default: return '';
    }
  }

  F.docs = {};
  function rememberDoc(doc) { F.docs[doc.id] = doc.content; return doc.content; }

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
    var box = $('factoryReply');
    box.innerHTML = '<div class="card"><span class="spin"></span> ' + L('Analizando la reunión…', 'Analyzing the meeting…') + '</div>';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      var d = await api('/factory/recordings/' + recId + '/intel');
      if (!d.intel) d = await api('/factory/recordings/' + recId + '/intel', { method: 'POST', body: JSON.stringify({ lang: lang }) });
      var rec = current && current.recording && current.recording.id === recId ? current.recording : { title: '' };
      box.innerHTML = '<div class="card">' + intelHtml(recId, rec.title, d.intel) + '</div>';
    } catch (e) { box.innerHTML = '<div class="card" style="color:var(--err)">' + esc(e.message) + '</div>'; }
  };
  F.reextract = async function (recId) {
    try { await api('/factory/recordings/' + recId + '/intel', { method: 'POST', body: JSON.stringify({ lang: lang }) }); F.showIntel(recId); }
    catch (e) { toast(e.message); }
  };
  F.classify = async function (recId, itemId, cls) {
    try {
      var d = await api('/factory/recordings/' + recId + '/intel/items/' + encodeURIComponent(itemId), { method: 'PATCH', body: JSON.stringify({ classification: cls }) });
      var rec = current && current.recording && current.recording.id === recId ? current.recording : { title: '' };
      $('factoryReply').innerHTML = '<div class="card">' + intelHtml(recId, rec.title, d.intel) + '</div>';
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
      $('factoryReply').innerHTML = '';
      F.openJob(d.job.id); refreshOverview();
    } catch (e) {
      if (input) input.value = '';
      toast(e.message);
      if (e.data && e.data.job) F.openJob(jobId);
    }
  };

  F.cancelJob = async function (jobId) {
    try { await api('/factory/jobs/' + jobId + '/cancel', { method: 'POST', body: JSON.stringify({ confirm: true }) }); toast(L('Cancelada', 'Cancelled')); $('factoryReply').innerHTML = ''; F.openJob(jobId); refreshOverview(); }
    catch (e) { toast(e.message); }
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
      $('agentLine').style.display = d.projects && d.projects.length ? '' : 'none';
      if (!d.operator) { $('jobsCard').style.display = 'none'; return; }
      $('jobsCard').style.display = '';
      $('readiness').innerHTML = d.readiness && !d.readiness.ready
        ? '<div class="banner"><strong>' + L('La ejecución está cerrada hasta configurar:', 'Execution is closed until you set:') + '</strong><br>' + d.readiness.blockers.map(function (b) { return esc(b.fix); }).join('<br>') + '</div>' : '';
      $('jobList').innerHTML = (d.jobs || []).length ? d.jobs.map(function (j) {
        return '<div class="jobitem" onclick="Factory.openJob(' + j.id + ')"><div class="row" style="justify-content:space-between"><strong>#' + j.id + ' ' + esc(j.project_name || '') + '</strong><span class="pill ' + pillFor(j.status) + '">' + esc(j.status) + '</span></div>' +
          '<div class="muted" style="margin-top:4px">' + esc(j.title || '') + ' · ' + new Date(j.updated_at).toLocaleString() + '</div></div>';
      }).join('') : '<div class="empty">' + L('Sin tareas todavía.', 'No tasks yet.') + '</div>';
    } catch (e) { /* signed out or offline: the page handles 401 */ }
  }
  F.refresh = refreshOverview;
  F.relabel = function () { if (!$('modes')) return; renderModeLabels(); $('modeHint').textContent = L(MODE_HINT[F.mode][0], MODE_HINT[F.mode][1]); $('cmdSend').textContent = F.mode === 'note' ? L('Guardar nota', 'Save note') : L('Enviar', 'Send'); };

  F.openJob = async function (id) {
    F.openJobId = id;
    clearTimeout(F.pollTimer);
    var box = $('jobDetail');
    try {
      var d = await api('/factory/jobs/' + id + '?lang=' + lang);
      var j = d.job;
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
      if (!j.terminal && document.visibilityState === 'visible') F.pollTimer = setTimeout(function () { if (F.openJobId === id) F.openJob(id); }, 8000);
    } catch (e) { box.innerHTML = '<div class="card" style="color:var(--err)">' + esc(e.message) + '</div>'; }
  };

  F.askConfirm = async function (action, jobId) {
    try {
      var d = await api('/factory/jobs/' + jobId);
      var j = d.job;
      var ov = await api('/factory/overview');
      $('factoryReply').innerHTML = '<div class="card">' + confirmHtml({ type: action === 'execute' ? 'confirm_execute' : 'confirm_merge', job_id: j.id, plan_hash: j.plan_hash,
        title: j.title, repo: j.repo, branch: j.branch || ('speakup/job-' + j.id), sources: j.sources, readiness: ov.readiness, phrase_verified: false,
        changed_files: j.changed_files, suite_modified: j.suite_modified, outside_plan: j.outside_plan }) + '</div>';
      $('factoryReply').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    $('cmdSend').addEventListener('click', function () { F.send(); });
    $('cmdCancel').addEventListener('click', function () { if (F.capturing) stopCapture(); $('cmdText').value = ''; try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {} });
    $('cmdText').addEventListener('input', saveDraft);
    $('memGo').addEventListener('click', memSearch);
    $('memQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') memSearch(); });
    // An instruction survives a refresh, a crash or a locked phone.
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    try { var dr = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); if (dr && dr.text && Date.now() - dr.ts < 7 * 86400e3) { $('cmdText').value = dr.text; toast(L('Recuperé tu instrucción sin enviar.', 'Restored your unsent instruction.')); } } catch (e) {}
    refreshOverview().then(function () { var jid = parseInt(params.get('job'), 10); if (jid) F.openJob(jid); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { refreshOverview(); if (F.openJobId) F.openJob(F.openJobId); }
    });
  };

  window.Factory = F;
})();
