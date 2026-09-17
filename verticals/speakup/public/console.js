/* SpeakUp console — one window for RinglyPro Architect.
 *
 * Top pane: the work (statuses, then every file Claude reads, edits, runs and tests, then
 * the change itself when it is ready). Bottom pane: type, dictate, or answer the plan.
 *
 * THE SCREEN SPEAKS PLAIN WORDS. The step bar said "PR" and the pane said "Pushing the
 * branch" — GitHub vocabulary in a place the owner reads to decide something. The machine
 * states keep their real names in the database and on the wire; only the labels changed.
 *
 * Holds no secret. Dictation is the browser's own recogniser; the phrase, the GitHub
 * token and the model keys live on the server.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var lang = (function () { try { return localStorage.getItem('speakup_lang') || 'es'; } catch (e) { return 'es'; } })();
  var L = function (es, en) { return lang === 'en' ? en : es; };
  var DRAFT = 'speakup_console_draft';

  var DISMISSED = 'speakup_console_dismissed';
  var jobId = null, jobTerminal = false, lastEvent = 0, timer = null, capturing = false, recog = null, tickTimer = null, startTs = 0;
  var shots = []; // pasted screenshots waiting to go with the next instruction
  var shown = [];  // every line in the pane, raw — repainted when the language changes
  var lastJob = null; // what the step bar is showing, so it can be redrawn in the other language

  // A FINISHED JOB IS DISMISSED FOR GOOD, A RUNNING ONE ALWAYS COMES BACK. On boot the
  // console re-attaches to the newest job, which is right while it is running (close the
  // tab, come back, the work is still on screen) and wrong once it has finished — the
  // same completed run reappeared in every new window with no way to get rid of it.
  // Clearing records the id, so only jobs newer than it are restored.
  function dismissed() { try { return parseInt(localStorage.getItem(DISMISSED), 10) || 0; } catch (e) { return 0; } }
  function dismiss(id) { try { localStorage.setItem(DISMISSED, String(id)); } catch (e) {} }

  // ── helpers ────────────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  async function api(path, opts) {
    var r = await fetch('/speakup/api/v1' + path, Object.assign({ headers: { 'Content-Type': 'application/json', 'X-SpeakUp': '1' } }, opts || {}));
    if (r.status === 401) { location.href = '/speakup/login'; throw new Error('401'); }
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(d.error || ('HTTP ' + r.status)); e.data = d; throw e; }
    return d;
  }
  function status(s) { $('stat').textContent = s || ''; }

  // ── the top pane ───────────────────────────────────────────────────────────
  var STATUS_TEXT = {
    ANALYZING: ['Leyendo la instrucción', 'Reading the instruction'], PLANNING: ['Planificando', 'Planning'],
    WAITING_APPROVAL: ['Plan listo: léelo abajo', 'Plan ready: read it below'],
    QUEUED: ['Arrancando en GitHub', 'Starting on GitHub'], CODING: ['Escribiendo código', 'Writing code'],
    TESTING: ['Probando', 'Running tests'], FIXING: ['Corrigiendo', 'Fixing'], PUSHING: ['Guardando el cambio', 'Saving the change'],
    PR_CREATED: ['Proponiendo el cambio', 'Proposing the change'], READY_FOR_REVIEW: ['Listo para revisar', 'Ready for you to look at'],
    DEPLOYING: ['Desplegando', 'Deploying'], DEPLOYED: ['Desplegado', 'Deployed'],
    FAILED: ['Falló', 'Failed'], CANCELLED: ['Cancelado', 'Cancelled']
  };
  var KIND = { read: 'READ', edit: 'EDIT', write: 'WRITE', run: 'RUN', search: 'FIND', say: 'CLAUDE', test: 'TEST',
    error: 'ERROR', info: 'INFO', done: 'DONE', status: 'STATUS', pr: 'CHANGE', todo: 'PLAN', tool: 'TOOL', you: 'YOU', ready: 'READY', answer: 'ANSWER' };
  function cls(kind) {
    if (kind === 'error') return 'k err';
    if (kind === 'done' || kind === 'status' || kind === 'pr') return 'k ok';
    if (kind === 'test') return 'k warn';
    if (kind === 'you') return 'k you';
    if (kind === 'ready') return 'k ok';
    return 'k';
  }
  function diffLines(txt, c) {
    return String(txt || '').split('\n').slice(0, 60).map(function (l) { return '<span class="dl ' + c + '">' + esc(l) + '</span>'; }).join('');
  }
  /* NOTHING IN THE PANE IS STORED AS FINISHED TEXT.
   *
   * Switching language used to relabel the header and leave the pane as it was, so an
   * English console listed "Probando / Subiendo la rama / Desplegado" — every line kept the
   * language it happened to be written in. So a line is a KEY plus arguments, the pane keeps
   * the raw events, and changing language repaints all of it from them.
   *
   * MSG: lines the console itself authors. SRV: lines the server or the GitHub runner
   * authors, which travel with `detail.i18n` naming the phrase. Anything with no key — a
   * model's prose, a file path, an error from an API — is shown exactly as it arrived,
   * because inventing a translation for it would be worse than leaving it.
   */
  var MSG = {
    filesChanged: ['{n} archivos cambiados', '{n} files changed'],
    readyForReview: ['El cambio está aquí para que lo mires: {url}', 'The change is here for you to look at: {url}'],
    approved: ['Aprobado. La fábrica trabaja sola desde aquí.', 'Approved. The factory runs on its own from here.'],
    planCorrected: ['Plan corregido. Léelo otra vez.', 'Plan corrected. Read it again.'],
    fromMeeting: ['Prompt traído de la reunión. Revísalo y envíalo.', 'Prompt brought from the meeting. Review it and send it.'],
    youSaid: ['{text}', '{text}'],
    youSaidShots: ['{text}  [{n} captura(s)]', '{text}  [{n} screenshot(s)]'],
    notOperator: ['Esta cuenta no puede usar la fábrica.', 'This account cannot use the factory.'],
    blocked: ['La ejecución está cerrada hasta configurar:', 'Execution is closed until you set:'],
    // ── the plan, written for the person deciding ──
    planWhatChanges: ['Qué cambia', 'What changes'],
    planWhatStays: ['Qué no cambia', 'What does not change'],
    planHowYouKnow: ['Cómo sabrás que funcionó', 'How you will know it worked'],
    planDecisions: ['Decisiones que tomé por ti', 'Decisions I made for you'],
    planWhy: ['porque', 'because'],
    planTradeoff: ['A cambio', 'Trade-off'],
    planWatchOut: ['Ten esto en cuenta', 'Watch out for'],
    planScope: ['Alcance', 'Scope'],
    planTechnical: ['Detalle técnico', 'Technical detail'],
    planStepsTitle: ['Pasos', 'Steps'],
    planCandidates: ['Archivos candidatos', 'Candidate files'],
    planDrop: ['Quitar', 'Remove'],
    planDropStep: ['Quitar el paso {n}', 'Remove step {n}'],
    planDropFile: ['Quitar el archivo {path}', 'Remove the file {path}'],
    planDropping: ['Quitando…', 'Removing…'],
    planUpdated: ['Plan actualizado.', 'Plan updated.'],
    planAsking: ['Buscando la respuesta…', 'Looking up the answer…'],
    planUnchanged: ['Era una pregunta: el plan no cambió.', 'That was a question: the plan did not change.'],
    planDiffTitle: ['Esto hicieron tus palabras', 'What your words did'],
    diffAdded: ['Añadido', 'Added'],
    diffRemoved: ['Quitado', 'Removed'],
    diffChanged: ['Cambiado', 'Changed'],
    planNoModel: ['Este plan se armó SIN modelo: es una suposición por palabras clave, no un análisis. Léelo con más cuidado.',
      'This plan was assembled WITHOUT a model: it is a keyword guess, not an analysis. Read it more carefully.']
  };
  var SRV = {
    merged: ['Fusionado en {branch}. Render está desplegando.', 'Merged into {branch}. Render is deploying.'],
    suite_modified: ['Queda para que lo revises: este cambio editó una suite de pruebas que la fábrica ejecuta, así que su resultado en verde no puede avalarse a sí mismo.',
      'Left for you to review: this change edited a test suite the factory runs, so its green result cannot vouch for itself.'],
    merge_failed: ['No se pudo fusionar automáticamente: {message}', 'Could not merge automatically: {message}'],
    claude_started: ['Claude Code arrancó{model}', 'Claude Code started{model}'],
    claude_done: ['Claude terminó{turns}{cost}', 'Claude finished{turns}{cost}'],
    claude_stopped: ['Claude se detuvo: {why}{turns}{cost}', 'Claude stopped: {why}{turns}{cost}'],
    turns: [' tras {n} turnos', ' after {n} turns'],
    tests: ['{passed} aprobadas, {failed} fallidas — {summary}', '{passed} passed, {failed} failed — {summary}'],
    tests_unmeasured: ['No se pudieron medir las pruebas', 'Tests could not be measured']
  };
  function fill(s, args) {
    return String(s).replace(/\{(\w+)\}/g, function (_, k) { return args && args[k] != null ? String(args[k]) : ''; });
  }
  // The same dictionary serves the pane and the plan card: a label the plan draws is a key,
  // so switching language redraws it from the raw job rather than leaving it behind.
  function m(k, args) { return MSG[k] ? fill(L(MSG[k][0], MSG[k][1]), args) : ''; }
  function phrase(e) {
    if (e.t && MSG[e.t]) return fill(L(MSG[e.t][0], MSG[e.t][1]), e.args);
    var d = e.detail || {};
    if (d.i18n && SRV[d.i18n]) {
      var args = d;
      // The runner sends the pieces; the joining words are ours, so they follow the language.
      if (d.turns != null) args = Object.assign({}, d, { turns: fill(L(SRV.turns[0], SRV.turns[1]), { n: d.turns }) });
      return fill(L(SRV[d.i18n][0], SRV[d.i18n][1]), args);
    }
    if (e.kind === 'status' && STATUS_TEXT[e.text]) return L(STATUS_TEXT[e.text][0], STATUS_TEXT[e.text][1]);
    return e.text;
  }

  function line(e) {
    var txt = phrase(e);
    if (e.kind === 'banner') return '<div class="banner"><strong>' + esc(txt) + '</strong>' + (e.args && e.args.html ? '<br>' + e.args.html : '') + '</div>';
    var body = e.kind === 'say' || e.kind === 'you' ? '<span class="say">' + esc(txt) + '</span>'
      : (['read', 'edit', 'write'].indexOf(e.kind) >= 0 ? '<span class="path">' + esc(txt) + '</span>' : esc(txt));
    var extra = '';
    var d = e.detail || {};
    if (d.old || d.new) extra = '<details><summary>' + L('ver cambio', 'see change') + '</summary>' + diffLines(d.old, 'del') + diffLines(d.new, 'add') + '</details>';
    return '<span class="ln"><span class="' + cls(e.kind) + '">' + (KIND[e.kind] || 'INFO') + '</span> ' + body + '</span>' + extra;
  }
  // WAITING_APPROVAL is shown, and it is the point: the plan is on screen and the machine is
  // waiting for the owner. It used to be filtered out because the console approved as it
  // dispatched, so the line described a pause that never happened.
  function write(events) {
    var list = (events || []).filter(Boolean);
    if (!list.length) return;
    leaveIdle();
    for (var i = 0; i < list.length; i++) shown.push(list[i]);
    var out = $('out');
    var atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 40;
    out.insertAdjacentHTML('beforeend', list.map(line).join(''));
    if (atBottom) out.scrollTop = out.scrollHeight;
  }
  function paint() {
    var out = $('out');
    out.innerHTML = shown.map(line).join('');
    out.scrollTop = out.scrollHeight;
  }
  function banner(t, args) { shown.unshift({ kind: 'banner', t: t, args: args || {} }); paint(); }

  var STEPS = [
    { es: 'Plan', en: 'Plan', at: ['ANALYZING', 'PLANNING'] },
    { es: 'Código', en: 'Code', at: ['WAITING_APPROVAL', 'QUEUED', 'CODING'] },
    { es: 'Pruebas', en: 'Tests', at: ['TESTING', 'FIXING'] },
    { es: 'Revisión', en: 'Review', at: ['PUSHING', 'PR_CREATED', 'READY_FOR_REVIEW'] },
    { es: 'Despliegue', en: 'Deploy', at: ['DEPLOYING', 'DEPLOYED'] }
  ];
  function renderBar(job) {
    lastJob = job;
    if (job) leaveIdle();
    var idx = -1;
    STEPS.forEach(function (s, i) { if (job && s.at.indexOf(job.status) >= 0) idx = i; });
    var failed = job && (job.status === 'FAILED' || job.status === 'CANCELLED');
    var html = STEPS.map(function (s, i) {
      var c = idx < 0 ? '' : (i < idx ? 'done' : (i === idx ? 'on' : ''));
      return '<span class="step ' + c + '">' + L(s.es, s.en) + '</span>';
    }).join('');
    if (failed) html += '<span class="step fail">' + esc(job.status) + '</span>';
    html += '<span class="right">';
    // The link opens a page GitHub calls a pull request, so the real word stays in the
    // tooltip while the chip itself reads in plain language. And the button beside it says
    // what it shows — "Cambio #5" next to "Cambios" was two different things, one letter apart.
    if (job && job.pr_url) html += '<a class="lnk" href="' + esc(job.pr_url) + '" target="_blank" rel="noopener" title="' +
      L('Pull request en GitHub', 'Pull request on GitHub') + '">' + L('Cambio #', 'Change #') + job.pr_number + '</a>' +
      '<button class="lnk" id="diffBtn">' + L('Ver archivos', 'See the files') + '</button>';
    if (job && !job.terminal) html += '<button class="lnk" id="cancelBtn">' + L('Cancelar', 'Cancel') + '</button>';
    if (job && job.terminal) html += '<button class="lnk" id="clearBtn">' + L('Limpiar', 'Clear') + '</button>';
    html += '</span>';
    $('bar').innerHTML = html;
    if ($('diffBtn')) $('diffBtn').addEventListener('click', showDiff);
    if ($('cancelBtn')) $('cancelBtn').addEventListener('click', cancelJob);
    if ($('clearBtn')) $('clearBtn').addEventListener('click', clearPane);
  }

  // THERE IS NO EMPTY PAGE (owner request 2026-09-17). Opening the factory used to land on
  // five grey steps with none active, a Clear button with nothing to clear, and a dark pane
  // holding one sentence. With nothing in progress the work area is not drawn at all; the
  // box is the whole screen, and the plan card — which says exactly what "approved" does —
  // arrives the moment there is something to read. A job with a plan is never idle: startup
  // restores it, so you land straight on it.
  function showIdle() { document.body.classList.add('idle'); }
  function leaveIdle() { document.body.classList.remove('idle'); }

  // Clearing empties the pane only. It never cancels: a running job keeps running on
  // GitHub, and the next reload re-attaches to it.
  //
  // AND IT ONLY EVER CLEARS A FINISHED JOB. It used to be offered on every screen, including
  // beside Cancel on a plan still waiting to be read, where it did two bad things: it hid a
  // live plan (the owner landed on an empty page with the plan still waiting on the server),
  // and it nulled planJob — so the next message skipped the correction path and started a
  // SECOND job underneath the unread plan. "No new job under a plan waiting to be read" is
  // enforced in this file, and Clear was the way around it. A live job has Cancel.
  function clearPane() {
    if (jobId && !jobTerminal) return;
    clearTimeout(timer);
    if (jobId && jobTerminal) dismiss(jobId);
    jobId = null; jobTerminal = false; lastEvent = 0;
    hidePlan();
    shown = [];
    $('out').innerHTML = '';
    renderBar(null);
    showIdle();
  }

  async function showDiff() {
    try {
      var d = await api('/factory/jobs/' + jobId + '/diff');
      write([{ kind: 'pr', t: 'filesChanged', args: { n: d.files.length } }]);
      $('out').insertAdjacentHTML('beforeend', d.files.map(function (f) {
        return '<details open><summary><span class="path">' + esc(f.filename) + '</span> +' + f.additions + ' -' + f.deletions + '</summary>' +
          String(f.patch || '').split('\n').map(function (l) {
            var c = l.charAt(0) === '+' ? 'add' : (l.charAt(0) === '-' ? 'del' : (l.charAt(0) === '@' ? 'hdr' : ''));
            return '<span class="dl ' + c + '">' + esc(l) + '</span>';
          }).join('') + '</details>';
      }).join(''));
      $('out').scrollTop = $('out').scrollHeight;
    } catch (e) { write([{ kind: 'error', text: e.message }]); }
  }

  async function cancelJob() {
    if (!jobId) return;
    try { await api('/factory/jobs/' + jobId + '/cancel', { method: 'POST', body: JSON.stringify({ confirm: true }) }); }
    catch (e) { write([{ kind: 'error', text: e.message }]); }
  }

  // ── following a job ────────────────────────────────────────────────────────
  async function follow(id, fresh) {
    if (id !== jobId) { jobId = id; lastEvent = 0; if (fresh) { shown = []; $('out').innerHTML = ''; } }
    clearTimeout(timer);
    try {
      var d = await api('/factory/jobs/' + id + '/events?after=' + lastEvent);
      if (d.events.length) { lastEvent = d.events[d.events.length - 1].id; write(d.events); }
      renderBar({ status: d.status, terminal: d.terminal, pr_number: d.pr_number, pr_url: d.pr_url });
      jobTerminal = !!d.terminal;
      // The plan is ready: stop polling and hand the box over to the owner. Fetched once,
      // on the transition, so a plan on screen is never silently swapped underneath them.
      if (d.status === 'WAITING_APPROVAL') {
        if (planJob !== id) {
          var full = (await api('/factory/jobs/' + id + '?lang=' + lang)).job;
          planDiff = null;
          showPlan(full);
          renderBar(full);
        }
        return;
      }
      if (planJob === id) hidePlan();
      if (!d.terminal && document.visibilityState === 'visible') timer = setTimeout(function () { follow(id); }, 2500);
      else if (d.terminal) {
        var j = (await api('/factory/jobs/' + id)).job;
        if (j.status === 'FAILED' && j.error) write([{ kind: 'error', text: j.error }]);
        if (j.pr_url) write([{ kind: 'pr', t: 'readyForReview', args: { url: j.pr_url } }]);
        renderBar(j);
      }
    } catch (e) { /* the page redirects on 401 */ }
  }

  // ── pasted screenshots ─────────────────────────────────────────────────────
  function renderShots() {
    $('shots').innerHTML = shots.map(function (s, i) {
      return '<div class="shot"><img src="' + s.url + '" alt="' + esc(s.name) + '"><button data-i="' + i + '" aria-label="Quitar">×</button></div>';
    }).join('');
    Array.prototype.forEach.call($('shots').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { var i = +b.getAttribute('data-i'); URL.revokeObjectURL(shots[i].url); shots.splice(i, 1); renderShots(); });
    });
  }
  async function addImage(file) {
    if (shots.length >= 6) { status(L('Máximo 6 capturas', 'Six screenshots at most')); return; }
    if (file.size > 6 * 1024 * 1024) { status(L('La imagen pasa de 6 MB', 'That image is over 6 MB')); return; }
    status(L('Subiendo captura…', 'Uploading screenshot…'));
    try {
      var b64 = await new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(String(r.result).split(',')[1] || ''); };
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      var up = await api('/factory/uploads', { method: 'POST', body: JSON.stringify({ name: file.name || 'screenshot.png', mime: file.type, data_base64: b64 }) });
      shots.push({ id: up.id, name: up.name, url: URL.createObjectURL(file) });
      renderShots();
      status(L('Captura adjunta', 'Screenshot attached'));
    } catch (e) { status(e.message); }
  }
  function filesFrom(ev) {
    var out = [];
    var items = (ev.clipboardData || ev.dataTransfer || {}).items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') { var f = items[i].getAsFile(); if (f && /^image\//.test(f.type)) out.push(f); }
    }
    var files = (ev.dataTransfer && ev.dataTransfer.files) || [];
    for (var j = 0; j < files.length; j++) if (/^image\//.test(files[j].type) && out.indexOf(files[j]) < 0) out.push(files[j]);
    return out;
  }

  // ── sending ────────────────────────────────────────────────────────────────
  async function send() {
    var text = $('cmd').value.trim();
    if (!text && shots.length) text = L('Mira la captura adjunta y haz el cambio que muestra.', 'Look at the attached screenshot and make the change it shows.');
    if (!text) { status(L('Escribe o dicta una instrucción', 'Type or dictate an instruction')); return; }
    if (capturing) stopCapture();
    $('send').disabled = true;
    write([{ kind: 'you', t: shots.length ? 'youSaidShots' : 'youSaid', args: { text: text, n: shots.length } }]);
    // WHILE A PLAN IS ON SCREEN THE BOX IS A CONVERSATION ABOUT IT. "approved" runs it; a
    // question is answered and leaves the plan exactly as it is; anything else is a
    // correction. A new instruction cannot be started underneath a plan waiting to be read —
    // that is how the old build-without-reading behaviour crept in.
    if (planJob) {
      $('cmd').value = ''; clearDraft();
      if (APPROVED.test(text.trim())) return approvePlan();
      if (isQuestion(text)) return askPlan(text);
      return revisePlan(text);
    }
    status(L('Enviando…', 'Sending…'));
    try {
      var d = await api('/factory/command', { method: 'POST', body: JSON.stringify({
        text: text, mode: 'architect', lang: lang, project_key: 'ringlypro', engine: SR ? 'webspeech' : 'typed',
        upload_ids: shots.map(function (s) { return s.id; }) }) });
      $('cmd').value = '';
      shots.forEach(function (s) { URL.revokeObjectURL(s.url); });
      shots = []; renderShots();
      try { sessionStorage.removeItem(DRAFT); } catch (e) {}
      status('');
      if (d.reply) write([{ kind: d.intent === 'WAKE' ? 'ready' : (d.intent === 'ASK' ? 'answer' : 'info'), text: d.reply }]);
      if (d.card && d.card.job_id) follow(d.card.job_id);
    } catch (e) {
      status('');
      write([{ kind: 'error', text: e.message }]);
    } finally { $('send').disabled = false; }
  }

  // ── the plan, and the one word that runs it ────────────────────────────────
  // Only these. "ok", "yes" and "go" are deliberately NOT here: the word that puts code on
  // the path to production should be one the owner cannot type by reflex.
  var APPROVED = /^\s*(approved|aprobado|aprobada)\s*[.!]?\s*$/i;
  var planJob = null, planHash = null, planShown = null, planDiff = null;

  /* A QUESTION MUST NEVER CHANGE THE PLAN.
   *
   * "why are you touching the routes?" used to be routed as a correction, so the plan was
   * rebuilt around a sentence that asked for nothing to change — and the owner lost the plan
   * they were half way through reading. ONE function decides it, and `ask` is the only call
   * it can lead to: a question mark at the end, an opening `¿`, or an opening question word.
   *
   * The accent-less Spanish forms (que, como, cual, donde) are deliberately NOT in the word
   * list: "que no toque las rutas" is an instruction, not a question. They still reach `ask`
   * when the sentence carries a `?` or a `¿`.
   */
  var QUESTION_WORD = /^\s*(what|what's|whats|why|how|how's|which|where|when|who|whose|does|did|do you|can|could|is|are|will|would|should|qué|por qué|porqué|cómo|cuál|cuáles|dónde|cuándo|quién|puedes|puede|podrías|podrias)\b/i;
  function isQuestion(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    if (/[?？]\s*$/.test(t)) return true;
    if (/^¿/.test(t)) return true;
    return QUESTION_WORD.test(t);
  }

  function hidePlan() { planJob = null; planHash = null; planShown = null; planDiff = null; $('plan').style.display = 'none'; $('plan').innerHTML = ''; setPlaceholder(); }

  // ── the plan, rendered for the person deciding ─────────────────────────────
  // Sections in the order a decision is actually made, each omitted entirely when the server
  // sent nothing for it. File names are not here: they are behind the fold below.
  function bullets(items) {
    return '<ul class="plist">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }
  function section(key, items) {
    var list = (items || []).filter(function (x) { return x != null && String(x).trim() !== ''; });
    if (!list.length) return '';
    return '<div class="psec"><h3>' + esc(m(key)) + '</h3>' + bullets(list) + '</div>';
  }
  function decisionSection(list) {
    var rows = (list || []).filter(Boolean).map(function (d) {
      if (typeof d === 'string') return '<li>' + esc(d) + '</li>';
      var li = '<li><span class="pchoice">' + esc(d.choice || '') + '</span>';
      if (d.why) li += ' <span class="tiny">— ' + esc(m('planWhy')) + ' ' + esc(d.why) + '</span>';
      if (d.tradeoff) li += '<div class="tiny">' + esc(m('planTradeoff')) + ': ' + esc(d.tradeoff) + '</div>';
      return li + '</li>';
    });
    if (!rows.length) return '';
    return '<div class="psec"><h3>' + esc(m('planDecisions')) + '</h3><ul class="plist">' + rows.join('') + '</ul></div>';
  }
  // Removing a step or a file is a direct tap: no model, the server answers with the new plan.
  function dropBtn(step, path) {
    var isStep = step != null;
    return '<button type="button" class="drop"' +
      (isStep ? ' data-step="' + esc(step) + '"' : ' data-path="' + esc(path) + '"') +
      ' title="' + esc(m('planDrop')) + '"' +
      ' aria-label="' + esc(isStep ? m('planDropStep', { n: step }) : m('planDropFile', { path: path })) + '">&times;</button>';
  }
  function fileRow(f) {
    var p = typeof f === 'string' ? f : String((f && f.path) || '');
    if (!p) return '';
    var note = f && typeof f === 'object' ? (f.change || (f.matched && f.matched.length ? f.matched.join(', ') : '')) : '';
    return '<li class="pfile"><code>' + esc(p) + '</code>' +
      (note ? '<span class="tiny">' + esc(note) + '</span>' : '') + dropBtn(null, p) + '</li>';
  }
  function stepRow(s, i) {
    if (!s) return '';
    var n = s.n != null ? s.n : (i + 1);
    var files = (s.files || []).map(fileRow).join('');
    return '<li class="pstep"><div class="pstephd"><span class="n">' + esc(n) + '</span>' +
      '<strong>' + esc(s.title || '') + '</strong>' + dropBtn(n, null) + '</div>' +
      (s.detail ? '<p class="tiny pdetail">' + esc(s.detail) + '</p>' : '') +
      (files ? '<ul class="pfiles">' + files + '</ul>' : '') + '</li>';
  }
  // COLLAPSED BY DEFAULT AND CLEARLY LABELLED: the owner cares about the behaviour above,
  // and opens this only when they want to argue with a file.
  function techFold(plan, open) {
    var steps = (plan.steps || []).filter(Boolean);
    var cands = (plan.candidate_files || []).filter(Boolean);
    if (!steps.length && !cands.length) return '';
    var html = '<details class="tech"' + (open ? ' open' : '') + '><summary>' + esc(m('planTechnical')) + '</summary>';
    if (steps.length) html += '<div class="psec"><h3>' + esc(m('planStepsTitle')) + '</h3><ul class="psteps">' + steps.map(stepRow).join('') + '</ul></div>';
    if (cands.length) html += '<div class="psec"><h3>' + esc(m('planCandidates')) + '</h3><ul class="pfiles">' + cands.map(fileRow).join('') + '</ul></div>';
    return html + '</details>';
  }
  function planBody(plan, open) {
    var html = section('planWhatChanges', plan.what_changes) +
      section('planWhatStays', plan.what_stays) +
      section('planHowYouKnow', plan.how_you_know) +
      decisionSection(plan.decisions) +
      section('planWatchOut', plan.watch_out);
    if (plan.scope_plain) html += '<p class="pscope">' + esc(m('planScope')) + ': ' + esc(plan.scope_plain) + '</p>';
    return html + techFold(plan, open);
  }
  // WHAT YOUR WORDS DID. Shown above the plan after a revision or a drop, so a change is not
  // something the owner has to find by re-reading forty lines.
  function diffBlock(d) {
    if (!d) return '';
    var rows = [['added', 'diffAdded'], ['removed', 'diffRemoved'], ['changed', 'diffChanged']].map(function (p) {
      var items = (d[p[0]] || []).filter(Boolean).map(function (x) { return typeof x === 'string' ? x : JSON.stringify(x); });
      if (!items.length) return '';
      return '<div class="drow"><span class="dtag ' + p[0] + '">' + esc(m(p[1])) + '</span>' + bullets(items) + '</div>';
    }).join('');
    if (!rows) return '';
    return '<div class="pdiff"><h3>' + esc(m('planDiffTitle')) + '</h3>' + rows + '</div>';
  }

  function showPlan(job) {
    // The fold is collapsed for a NEW plan and only for a new plan: removing a step from
    // inside it rebuilds the card, and snapping shut under the finger that just tapped is
    // how a list of five files takes five taps of re-opening to prune.
    var prev = $('plan').querySelector('details.tech');
    var keepOpen = planJob === job.id && !!(prev && prev.open);
    leaveIdle();
    planJob = job.id; planHash = job.plan_hash; planShown = job;
    var plan = job.plan && typeof job.plan === 'object' ? job.plan : null;
    var revs = (job.revisions || []).map(function (r) { return '<div class="rev">' + esc(r.text) + '</div>'; }).join('');
    var composed = (plan && plan.composed_by) || job.plan_composed_by || '';
    // A PLAN ASSEMBLED WITHOUT A MODEL SAYS SO, IN FULL VIEW. It is a keyword guess, and
    // hiding that behind the same card as a reasoned plan is the lie this notice prevents.
    var simulated = !!(plan && (plan.is_simulated || plan.composed_by === 'heuristic')) || composed === 'heuristic';
    var body = plan ? planBody(plan, keepOpen) : '';
    if (!body) body = '<pre>' + esc(job.plan_md || '') + '</pre>';
    $('plan').innerHTML =
      '<div class="planhd"><h2>' + esc(job.title || (plan && plan.title) || L('Plan', 'Plan')) + '</h2>' +
      '<span class="tiny">' + esc(job.project_name || job.project_key || '') + (composed ? ' · ' + esc(composed) : '') + '</span></div>' +
      (simulated ? '<div class="notice">' + esc(m('planNoModel')) + '</div>' : '') +
      // SAY WHAT APPROVING ACTUALLY DOES. "Run it" was true of the branch and false of the
      // rest: with auto-merge on, a green run merges itself into main and Render deploys.
      // This word is the last human step before the live site, and the card has to say so.
      '<p class="tiny">' + L('Lee el plan. Escribe una corrección para rehacerlo, pregunta lo que quieras (una pregunta no cambia el plan), o escribe <strong>aprobado</strong>: se ejecuta, y si las pruebas pasan se fusiona en main y se despliega en producción sin otra confirmación.',
        'Read the plan. Type a correction to rebuild it, ask anything you like (a question never changes the plan), or type <strong>approved</strong>: it runs, and if the tests pass it merges itself into main and deploys to production with no further confirmation.') + '</p>' +
      (revs ? '<div>' + L('<span class="tiny">Tus correcciones</span>', '<span class="tiny">Your corrections</span>') + revs + '</div>' : '') +
      diffBlock(planDiff) + body;
    $('plan').style.display = 'block';
    $('plan').scrollTop = 0;
    setPlaceholder();
  }

  // One delegated listener: the card is rebuilt on every change, the container is not.
  async function onPlanClick(ev) {
    var t = ev.target;
    var b = t && t.closest ? t.closest('button.drop') : null;
    if (!b || !planJob) return;
    ev.preventDefault();
    var id = planJob;
    var body = b.hasAttribute('data-step')
      ? { step: parseInt(b.getAttribute('data-step'), 10), lang: lang }
      : { path: b.getAttribute('data-path'), lang: lang };
    status(m('planDropping'));
    try {
      var d = await api('/factory/jobs/' + id + '/plan/drop', { method: 'POST', body: JSON.stringify(body) });
      planDiff = d.diff || null;
      showPlan(d.job);
      status('');
      write([{ kind: 'info', t: 'planUpdated' }]);
    } catch (e) {
      status('');
      write([{ kind: 'error', text: e.message }]);
    }
  }

  // ASKING NEVER TOUCHES THE PLAN. Nothing in here writes planShown, planHash or the card:
  // the answer is a line in the pane, and the plan on screen is the one still waiting.
  async function askPlan(text) {
    var id = planJob;
    status(m('planAsking'));
    try {
      var d = await api('/factory/jobs/' + id + '/ask', { method: 'POST', body: JSON.stringify({ text: text, lang: lang }) });
      status('');
      if (d.reply) write([{ kind: 'answer', text: d.reply }]);
      write([{ kind: 'info', t: 'planUnchanged' }]);
    } catch (e) {
      status('');
      write([{ kind: 'error', text: e.message }]);
    } finally { $('send').disabled = false; }
  }

  async function approvePlan() {
    var id = planJob;
    status(L('Arrancando…', 'Starting…'));
    try {
      var d = await api('/factory/jobs/' + id + '/approve', { method: 'POST', body: JSON.stringify({ plan_hash: planHash, lang: lang }) });
      hidePlan();
      write([{ kind: 'done', t: 'approved' }]);
      status('');
      follow(d.job.id);
    } catch (e) {
      status('');
      write([{ kind: 'error', text: e.message }]);
      // The plan moved under them (a revision landed): show the current one rather than
      // leaving an approval pointing at a plan that no longer exists.
      if (e.data && e.data.job) { planDiff = null; showPlan(e.data.job); }
    } finally { $('send').disabled = false; }
  }

  async function revisePlan(text) {
    var id = planJob;
    status(L('Rehaciendo el plan…', 'Rebuilding the plan…'));
    try {
      var d = await api('/factory/jobs/' + id + '/revise', { method: 'POST', body: JSON.stringify({ text: text, lang: lang }) });
      planDiff = d.diff || null;
      showPlan(d.job);
      status('');
      write([{ kind: 'info', t: 'planCorrected' }]);
    } catch (e) {
      status('');
      write([{ kind: 'error', text: e.message }]);
      // RE-SYNC, ALWAYS. The request can die at the proxy (~100 s) while the server finishes
      // and moves on. Leaving the old plan on screen meant the next thing typed was routed as
      // a SECOND correction against a plan that no longer existed.
      try {
        var cur = (await api('/factory/jobs/' + id + '?lang=' + lang)).job;
        planDiff = null;
        if (cur.status === 'WAITING_APPROVAL') showPlan(cur); else { hidePlan(); follow(id); }
      } catch (e2) { /* the page redirects on 401 */ }
    } finally { $('send').disabled = false; }
  }

  // A prompt handed over by the Meetings screen. It arrives as TEXT in the box — editable,
  // never auto-sent — and the key is cleared so a refresh does not resurrect it.
  function takeIncomingPrompt() {
    var raw = null;
    try { raw = sessionStorage.getItem('speakup_incoming_prompt'); sessionStorage.removeItem('speakup_incoming_prompt'); } catch (e) { return false; }
    if (!raw) return false;
    var p = null;
    try { p = JSON.parse(raw); } catch (e) { return false; }
    if (!p || !p.text) return false;
    $('cmd').value = String(p.text).slice(0, 50000);
    saveDraft();
    write([{ kind: 'info', t: 'fromMeeting' }]);
    return true;
  }

  // ── dictation ──────────────────────────────────────────────────────────────
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var baseText = '';
  function startCapture() {
    if (!SR) { status(L('Este navegador no permite dictado; escribe.', 'This browser cannot dictate; type instead.')); return; }
    baseText = $('cmd').value ? $('cmd').value.replace(/\s+$/, '') + ' ' : '';
    capturing = true;
    $('mic').classList.add('rec');
    startTs = Date.now();
    tickTimer = setInterval(function () {
      var s = Math.floor((Date.now() - startTs) / 1000);
      status(L('Escuchando ', 'Listening ') + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'));
    }, 500);
    recog = new SR();
    recog.lang = lang === 'en' ? 'en-US' : 'es-ES';
    recog.continuous = true;
    recog.interimResults = true;
    recog.onresult = function (ev) {
      var fin = '', interim = '';
      for (var i = 0; i < ev.results.length; i++) { if (ev.results[i].isFinal) fin += ev.results[i][0].transcript; else interim += ev.results[i][0].transcript; }
      $('cmd').value = baseText + (fin + interim).replace(/\s+/g, ' ').trimStart();
      saveDraft();
    };
    recog.onerror = function (e) { if (e.error === 'not-allowed') status(L('Permite el micrófono.', 'Allow the microphone.')); };
    recog.onend = function () { if (capturing) stopCapture(true); };
    try { recog.start(); } catch (e) { stopCapture(true); }
  }
  function stopCapture(fromEnd) {
    capturing = false;
    $('mic').classList.remove('rec');
    clearInterval(tickTimer);
    status($('cmd').value.trim() ? L('Revisa y envía', 'Review and send') : '');
    if (recog && !fromEnd) { try { recog.stop(); } catch (e) {} }
    recog = null;
  }
  function saveDraft() { try { sessionStorage.setItem(DRAFT, $('cmd').value); } catch (e) {} }
  function clearDraft() { try { sessionStorage.removeItem(DRAFT); } catch (e) {} }
  function setPlaceholder() {
    $('cmd').placeholder = planJob
      ? L('Corrige el plan, pregunta algo, o escribe: aprobado', 'Correct the plan, ask a question, or type: approved')
      : L('Escribe, pega una captura o dicta la instrucción…', 'Type, paste a screenshot, or dictate the instruction…');
  }

  // ── boot ───────────────────────────────────────────────────────────────────
  function setLang(l) {
    lang = l;
    try { localStorage.setItem('speakup_lang', l); } catch (e) {}
    document.documentElement.lang = l;
    $('langBtn').textContent = l === 'en' ? 'ES' : 'EN';
    setPlaceholder();
    $('outBtn').textContent = L('Salir', 'Sign out');
    $('tabMeet').textContent = L('Reuniones', 'Meetings');
    $('tabFac').textContent = L('Fábrica', 'Factory');
    // THE WHOLE SCREEN FOLLOWS, NOT JUST THE HEADER. The pane repaints from the raw events,
    // the step bar redraws from the job it last showed, and a plan on screen gets its
    // instructions back in the new language.
    paint();
    renderBar(lastJob);
    if (planJob && planShown) showPlan(planShown);
  }

  (async function () {
    setLang(lang);
    $('langBtn').addEventListener('click', function () { setLang(lang === 'en' ? 'es' : 'en'); });
    $('outBtn').addEventListener('click', async function () { await fetch('/speakup/api/v1/auth/logout', { method: 'POST' }); location.href = '/speakup/login'; });
    $('mic').addEventListener('click', function () { if (capturing) stopCapture(); else startCapture(); });
    $('send').addEventListener('click', send);
    // Delegated: the plan card is rebuilt on every change, this container is not.
    $('plan').addEventListener('click', onPlanClick);
    $('cmd').addEventListener('input', saveDraft);
    $('cmd').addEventListener('paste', function (e) {
      var imgs = filesFrom(e);
      if (imgs.length) { e.preventDefault(); imgs.forEach(addImage); }
    });
    ['dragover', 'drop'].forEach(function (evt) {
      document.addEventListener(evt, function (e) {
        e.preventDefault();
        if (evt === 'drop') filesFrom(e).forEach(addImage);
      });
    });
    $('cmd').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
    if (!takeIncomingPrompt()) { try { var dr = sessionStorage.getItem(DRAFT); if (dr) $('cmd').value = dr; } catch (e) {} }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && jobId) follow(jobId); });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/speakup/sw.js').catch(function () {});

    try {
      var ov = await api('/factory/overview?lang=' + lang);
      if (!ov.operator) { banner('notOperator'); return; }
      if (ov.readiness && !ov.readiness.ready) {
        banner('blocked', { html: ov.readiness.blockers.map(function (b) { return esc(b.fix); }).join('<br>') });
      }
      var running = (ov.jobs || []).filter(function (j) { return !j.terminal; })[0];
      var last = (ov.jobs || [])[0];
      if (running) follow(running.id, true);
      else if (last && last.id > dismissed()) follow(last.id, true);
      else { renderBar(null); showIdle(); }
    } catch (e) { /* redirected on 401 */ }
  })();
})();
