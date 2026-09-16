/* SpeakUp console — one window for RinglyPro Architect.
 *
 * Top pane: the work (statuses, then every file Claude reads, edits, runs and tests,
 * and the pull request when it is ready). Bottom pane: type or dictate the instruction.
 * No modes, no project picker, no approval tap: the instruction goes to the RinglyPro
 * CRM repository and the result is always a branch and a PR, never main.
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

  var jobId = null, lastEvent = 0, timer = null, capturing = false, recog = null, tickTimer = null, startTs = 0;
  var shots = []; // pasted screenshots waiting to go with the next instruction

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
    QUEUED: ['Arrancando en GitHub', 'Starting on GitHub'], CODING: ['Escribiendo código', 'Writing code'],
    TESTING: ['Probando', 'Running tests'], FIXING: ['Corrigiendo', 'Fixing'], PUSHING: ['Subiendo la rama', 'Pushing the branch'],
    PR_CREATED: ['Abriendo el PR', 'Opening the pull request'], READY_FOR_REVIEW: ['Listo para revisión', 'Ready for review'],
    DEPLOYING: ['Desplegando', 'Deploying'], DEPLOYED: ['Desplegado', 'Deployed'],
    FAILED: ['Falló', 'Failed'], CANCELLED: ['Cancelado', 'Cancelled']
  };
  var KIND = { read: 'READ', edit: 'EDIT', write: 'WRITE', run: 'RUN', search: 'FIND', say: 'CLAUDE', test: 'TEST',
    error: 'ERROR', info: 'INFO', done: 'DONE', status: 'STATUS', pr: 'PR', todo: 'PLAN', tool: 'TOOL', you: 'YOU', ready: 'READY' };
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
  function line(e) {
    var body = e.kind === 'say' || e.kind === 'you' ? '<span class="say">' + esc(e.text) + '</span>'
      : (['read', 'edit', 'write'].indexOf(e.kind) >= 0 ? '<span class="path">' + esc(e.text) + '</span>' : esc(e.text));
    var extra = '';
    var d = e.detail || {};
    if (d.old || d.new) extra = '<details><summary>' + L('ver cambio', 'see change') + '</summary>' + diffLines(d.old, 'del') + diffLines(d.new, 'add') + '</details>';
    return '<span class="ln"><span class="' + cls(e.kind) + '">' + (KIND[e.kind] || 'INFO') + '</span> ' + body + '</span>' + extra;
  }
  function write(events) {
    // WAITING_APPROVAL is an internal step of the machine: the console approves as it
    // dispatches, so showing it only made the pane look like it was waiting for the owner.
    events = events.filter(function (e) { return !(e.kind === 'status' && e.text === 'WAITING_APPROVAL'); })
      .map(function (e) {
        if (e.kind !== 'status' || !STATUS_TEXT[e.text]) return e;
        return { kind: 'status', text: L(STATUS_TEXT[e.text][0], STATUS_TEXT[e.text][1]), detail: e.detail };
      });
    if (!events.length) return;
    var out = $('out');
    var atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 40;
    out.insertAdjacentHTML('beforeend', events.map(line).join(''));
    if (atBottom) out.scrollTop = out.scrollHeight;
  }
  function banner(html) { $('out').insertAdjacentHTML('afterbegin', '<div class="banner">' + html + '</div>'); }

  var STEPS = [
    { es: 'Plan', en: 'Plan', at: ['ANALYZING', 'PLANNING'] },
    { es: 'Código', en: 'Code', at: ['WAITING_APPROVAL', 'QUEUED', 'CODING'] },
    { es: 'Pruebas', en: 'Tests', at: ['TESTING', 'FIXING'] },
    { es: 'PR', en: 'PR', at: ['PUSHING', 'PR_CREATED', 'READY_FOR_REVIEW'] },
    { es: 'Despliegue', en: 'Deploy', at: ['DEPLOYING', 'DEPLOYED'] }
  ];
  function renderBar(job) {
    var idx = -1;
    STEPS.forEach(function (s, i) { if (job && s.at.indexOf(job.status) >= 0) idx = i; });
    var failed = job && (job.status === 'FAILED' || job.status === 'CANCELLED');
    var html = STEPS.map(function (s, i) {
      var c = idx < 0 ? '' : (i < idx ? 'done' : (i === idx ? 'on' : ''));
      return '<span class="step ' + c + '">' + L(s.es, s.en) + '</span>';
    }).join('');
    if (failed) html += '<span class="step fail">' + esc(job.status) + '</span>';
    html += '<span class="right">';
    if (job && job.pr_url) html += '<a class="lnk" href="' + esc(job.pr_url) + '" target="_blank" rel="noopener">PR #' + job.pr_number + '</a>' +
      '<button class="lnk" id="diffBtn">' + L('Cambios', 'Changes') + '</button>';
    if (job && !job.terminal) html += '<button class="lnk" id="cancelBtn">' + L('Cancelar', 'Cancel') + '</button>';
    html += '</span>';
    $('bar').innerHTML = html;
    if ($('diffBtn')) $('diffBtn').addEventListener('click', showDiff);
    if ($('cancelBtn')) $('cancelBtn').addEventListener('click', cancelJob);
  }

  async function showDiff() {
    try {
      var d = await api('/factory/jobs/' + jobId + '/diff');
      write([{ kind: 'pr', text: d.files.length + L(' archivos cambiados', ' files changed') }]);
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
    if (id !== jobId) { jobId = id; lastEvent = 0; if (fresh) $('out').innerHTML = ''; }
    clearTimeout(timer);
    try {
      var d = await api('/factory/jobs/' + id + '/events?after=' + lastEvent);
      if (d.events.length) { lastEvent = d.events[d.events.length - 1].id; write(d.events); }
      renderBar({ status: d.status, terminal: d.terminal, pr_number: d.pr_number, pr_url: d.pr_url });
      if (!d.terminal && document.visibilityState === 'visible') timer = setTimeout(function () { follow(id); }, 2500);
      else if (d.terminal) {
        var j = (await api('/factory/jobs/' + id)).job;
        if (j.status === 'FAILED' && j.error) write([{ kind: 'error', text: j.error }]);
        if (j.pr_url) write([{ kind: 'pr', text: L('Listo para revisión: ', 'Ready for review: ') + j.pr_url }]);
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
    status(L('Enviando…', 'Sending…'));
    write([{ kind: 'you', text: text + (shots.length ? '  [' + shots.length + ' ' + L('captura(s)', 'screenshot(s)') + ']' : '') }]);
    try {
      var d = await api('/factory/command', { method: 'POST', body: JSON.stringify({
        text: text, mode: 'architect', lang: lang, project_key: 'ringlypro', auto_run: true, engine: SR ? 'webspeech' : 'typed',
        upload_ids: shots.map(function (s) { return s.id; }) }) });
      $('cmd').value = '';
      shots.forEach(function (s) { URL.revokeObjectURL(s.url); });
      shots = []; renderShots();
      try { sessionStorage.removeItem(DRAFT); } catch (e) {}
      status('');
      if (d.reply) write([{ kind: d.intent === 'WAKE' ? 'ready' : 'info', text: d.reply }]);
      if (d.card && d.card.job_id) follow(d.card.job_id);
    } catch (e) {
      status('');
      write([{ kind: 'error', text: e.message }]);
    } finally { $('send').disabled = false; }
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

  // ── boot ───────────────────────────────────────────────────────────────────
  function setLang(l) {
    lang = l;
    try { localStorage.setItem('speakup_lang', l); } catch (e) {}
    document.documentElement.lang = l;
    $('langBtn').textContent = l === 'en' ? 'ES' : 'EN';
    $('cmd').placeholder = L('Escribe, pega una captura o dicta la instrucción…', 'Type, paste a screenshot, or dictate the instruction…');
    $('outBtn').textContent = L('Salir', 'Sign out');
  }

  (async function () {
    setLang(lang);
    $('langBtn').addEventListener('click', function () { setLang(lang === 'en' ? 'es' : 'en'); });
    $('outBtn').addEventListener('click', async function () { await fetch('/speakup/api/v1/auth/logout', { method: 'POST' }); location.href = '/speakup/login'; });
    $('recBtn').addEventListener('click', function () { location.href = '/speakup/recorder'; });
    $('mic').addEventListener('click', function () { if (capturing) stopCapture(); else startCapture(); });
    $('send').addEventListener('click', send);
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
    try { var dr = sessionStorage.getItem(DRAFT); if (dr) $('cmd').value = dr; } catch (e) {}
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && jobId) follow(jobId); });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/speakup/sw.js').catch(function () {});

    try {
      var ov = await api('/factory/overview?lang=' + lang);
      if (!ov.operator) { banner(L('Esta cuenta no puede usar la fábrica.', 'This account cannot use the factory.')); return; }
      if (ov.readiness && !ov.readiness.ready) {
        banner('<strong>' + L('La ejecución está cerrada hasta configurar:', 'Execution is closed until you set:') + '</strong><br>' +
          ov.readiness.blockers.map(function (b) { return esc(b.fix); }).join('<br>'));
      }
      var live = (ov.jobs || []).filter(function (j) { return !j.terminal; })[0] || (ov.jobs || [])[0];
      if (live) follow(live.id, true);
      else write([{ kind: 'info', text: L('Escribe abajo lo que quieres cambiar en digit2ai/RinglyPro-CRM. Se crea una rama y un PR; main y producción no se tocan.',
        'Type below what you want changed in digit2ai/RinglyPro-CRM. A branch and a PR are created; main and production are not touched.') }]);
    } catch (e) { /* redirected on 401 */ }
  })();
})();
