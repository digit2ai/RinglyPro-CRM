/* Claude Code — one page, one box, one conversation.
 *
 * You type, it works, the answer appears under your message, you type again. There is no run
 * page, no Back, no form: a follow-up continues the same branch and the same pull request, so
 * the conversation is the unit, not the job. That is the whole point of this screen.
 *
 * THE SERVER IS THE TRUTH. A turn streams into a live bubble while it runs, and when it ends the
 * page re-reads the thread and redraws from what was stored — so the screen never keeps an answer
 * the database does not have.
 *
 * NO LINE IS STORED AS FINISHED TEXT. Every label is a key rendered at paint time, so the
 * language toggle repaints the whole screen. What the server sent — a file path, the agent's own
 * prose, an API error — is shown exactly as it arrived: inventing a translation would be worse.
 */
(function () {
  'use strict';

  var API = '/speakup/api/v1/claude-code';
  var THREAD_KEY = 'cc_thread';
  var REPO_KEY = 'cc_repo';
  var TERMINAL = ['merged', 'deployed', 'failed', 'cancelled', 'pr_open'];
  var lang = 'es';
  try { lang = localStorage.getItem('speakup_lang') === 'en' ? 'en' : 'es'; } catch (e) {}

  var T = {
    placeholder: ['Dile qué construir, o pregunta algo sobre el código…', 'Tell it what to build, or ask something about the code…'],
    sync:     ['Sync', 'Sync'],
    newShort: ['Nueva', 'New'],
    pr:       ['Pull request', 'Pull request'],
    pickRepo: ['Elegir repositorio', 'Choose a repository'],
    repoTitle:['Repositorio', 'Repository'],
    merge:    ['Merge', 'Merge'],
    merging:  ['Fusionando…', 'Merging…'],
    merged:   ['Fusionado', 'Merged'],
    canPush:  ['Con permiso de escritura', 'Write access'],
    noPush:   ['Este token no puede escribir aquí', 'This token cannot write here'],
    noGit:    ['GITHUB_TOKEN no está configurado, así que no se puede clonar ningún repositorio.',
               'GITHUB_TOKEN is not set, so no repository can be cloned.'],
    noSdk:    ['El paquete @anthropic-ai/claude-agent-sdk no está instalado en el servidor.',
               'The @anthropic-ai/claude-agent-sdk package is not installed on the server.'],
    noKey:    ['No hay credencial de Anthropic: una ejecución fallará al llegar al agente.',
               'No Anthropic credential: a run will fail when it reaches the agent.'],
    empty:    ['Escribe lo que quieras. <b>Construye</b> — “añade un endpoint /health que devuelva la versión” — o <b>pregunta</b> — “¿qué hace app.py?”. Trabaja sobre una rama y abre un pull request; nada llega a producción hasta que tú lo fusiones.',
               'Type whatever you want. <b>Build</b> — “add a /health endpoint that returns the version” — or <b>ask</b> — “what does app.py do?”. It works on a branch and opens a pull request; nothing reaches production until you merge it.'],
    working:  ['Trabajando…', 'Working…'],
    details:  ['Ver lo que hizo', 'See what it did'],
    detailsLive: ['Ver lo que está haciendo', 'See what it is doing'],
    failed:   ['Falló', 'Failed'],
    cancelled:['Detenida', 'Stopped'],
    cancel:   ['Detener', 'Stop'],
    listening:['Escuchando…', 'Listening…'],
    noMic:    ['Este navegador no reconoce voz.', 'This browser has no speech recognition.'],
    dictate:  ['Dictar', 'Dictate'],
    menu:     ['Menú', 'Menu'],
    tabMeet:  ['Reuniones', 'Meetings'],
    tabFac:   ['Fábrica', 'Factory'],
    tabCC:    ['Builder', 'Builder'],
    confirmMerge: ['¿Fusionar el pull request?', 'Merge the pull request?'],
    stillWorking: ['Espera a que termine lo anterior.', 'Wait for the current one to finish.']
  };

  function t(k) { var e = T[k]; return e ? e[lang === 'en' ? 1 : 0] : k; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function done(status) { return TERMINAL.indexOf(status) !== -1; }

  var thread = null;      // { id, repo_full_name, work_branch, pr_url, ... }
  var turns = [];         // stored runs, oldest first
  var repos = [];
  var cfg = {};
  var busy = false;
  var liveEvents = [];    // lines for the turn currently running
  var streaming = '';     // text arriving now, before the finished message replaces it
  var es = null;          // the open EventSource, if any
  var gen = 0;            // retires an older stream when a newer one opens

  async function api(path, opts) {
    var o = opts || {};
    var res = await fetch(API + path, {
      method: o.method || 'GET',
      headers: Object.assign({ 'X-SpeakUp': '1' }, o.body ? { 'Content-Type': 'application/json' } : {}),
      body: o.body ? JSON.stringify(o.body) : undefined
    });
    if (res.status === 401) { location.href = '/speakup/login'; throw new Error('401'); }
    var d = null;
    try { d = await res.json(); } catch (e) { d = {}; }
    if (!res.ok) { var err = new Error((d && d.error) || ('HTTP ' + res.status)); err.status = res.status; err.data = d; throw err; }
    return d;
  }
  function notice(msg) {
    var n = $('ccNotice');
    if (!msg) { n.hidden = true; return; }
    n.hidden = false; n.textContent = msg;
  }

  // ── painting ───────────────────────────────────────────────────────────────
  function paintChrome() {
    ['tabMeet', 'tabFac', 'tabCC'].forEach(function (id) { var el = $(id); if (el) el.textContent = t(id); });
    $('cmsg').placeholder = t('placeholder');
    $('syncBtn').textContent = t('sync');
    $('newBtn2').textContent = t('newShort');
    $('prLink').textContent = t('pr');
    $('repoBtn').title = t('repoTitle');
    if ($('mergeBtn').textContent !== t('merged')) $('mergeBtn').textContent = t('merge');
    var b = $('burger'); if (b) b.setAttribute('aria-label', t('menu'));
    var m = $('mic'); if (m) { m.setAttribute('aria-label', t('dictate')); m.title = t('dictate'); }
  }

  function paintNotice() {
    // What is missing is said before anyone types, never discovered when a run dies.
    var msgs = [];
    if (cfg.github === false) msgs.push(t('noGit'));
    if (cfg.sdk === false) msgs.push(t('noSdk'));
    if (cfg.anthropic_key === false) msgs.push(t('noKey'));
    if (msgs.length) notice(msgs.join(' '));
  }

  function currentRepo() { return repos.find(function (r) { return r.repo_full_name === $('repo').value; }) || null; }

  // The picker is opened on purpose and closes itself: a conversation is tied to one repository,
  // so the choice is made once and then gets out of the way.
  var pickerOpen = false;

  function paintSetup() {
    var started = !!(thread && turns.length);
    // Once a conversation has started its repository is fixed, so the picker cannot be opened —
    // changing it mid-thread would mean the branch and the pull request no longer match the line.
    if (started) pickerOpen = false;
    $('setup').hidden = !pickerOpen;
    $('repoBtn').disabled = started;

    var repo = started ? thread.repo_full_name : $('repo').value;
    var branch = started ? (thread.work_branch || thread.base_branch) : ($('branch').value || 'main');
    $('repoTxt').textContent = (repo || t('pickRepo')) + (repo ? ' · ' + branch : '');

    $('prLink').hidden = !(started && thread.pr_url);
    if (started && thread.pr_url) $('prLink').href = thread.pr_url;
    $('mergeBtn').hidden = !(started && thread.pr_url);
    $('newBtn2').hidden = !started;

    var r = currentRepo();
    var chip = $('pushChip');
    if (!pickerOpen || !r || r.can_push == null) chip.hidden = true;
    else {
      chip.hidden = false;
      chip.className = 'chip ' + (r.can_push ? 'ok' : 'warn');
      chip.textContent = r.can_push ? t('canPush') : t('noPush');
    }
  }

  function bubble(cls, html) {
    var d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.innerHTML = html;
    return d;
  }

  // One turn = the owner's message, then the answer. A turn still running says what it is doing.
  function turnNodes(turn, isLast) {
    var out = [bubble('user', esc(turn.brief))];
    var finished = done(turn.status);
    var head = '';
    if (turn.status === 'failed') head = '<span class="tag bad">' + esc(t('failed')) + '</span>\n';
    else if (turn.status === 'cancelled') head = '<span class="tag">' + esc(t('cancelled')) + '</span>\n';

    // While a turn runs, the text that has arrived so far IS the bubble. When the turn ends the
    // stored summary replaces it, so the screen never keeps an answer the database does not have.
    var body = turn.summary ? esc(turn.summary)
      : (turn.error ? esc(turn.error)
        : (isLast && streaming ? esc(streaming) : ''));
    var node = bubble('assistant' + (finished ? '' : ' live'), head + body);

    if (!finished) {
      var doing = document.createElement('div');
      doing.className = 'doing';
      doing.innerHTML = '<span class="bar"><span></span></span><span>' + esc(t('working')) + '</span>';
      node.appendChild(doing);
    }
    if (isLast && liveEvents.length) {
      var det = document.createElement('details');
      det.className = 'work';
      det.innerHTML = '<summary>' + esc(finished ? t('details') : t('detailsLive')) + '</summary>' +
        '<div class="lines">' + esc(liveEvents.join('\n')) + '</div>';
      node.appendChild(det);
    }
    if (!finished && turn.id) {
      var a = document.createElement('div');
      a.className = 'mact';
      a.innerHTML = '<button class="btn small" type="button" data-cancel="' + turn.id + '">' + esc(t('cancel')) + '</button>';
      node.appendChild(a);
    }
    out.push(node);
    return out;
  }

  function paintThread() {
    var box = $('thread');
    var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = '';
    if (!turns.length) {
      var e = document.createElement('div');
      e.className = 'empty-note';
      e.innerHTML = t('empty');
      box.appendChild(e);
    } else {
      turns.forEach(function (turn, i) {
        turnNodes(turn, i === turns.length - 1).forEach(function (n) { box.appendChild(n); });
      });
    }
    Array.prototype.forEach.call(box.querySelectorAll('[data-cancel]'), function (b) {
      b.addEventListener('click', function () { cancelTurn(+b.getAttribute('data-cancel')); });
    });
    if (atBottom || busy) box.scrollTop = box.scrollHeight;
  }

  function paint() { paintChrome(); paintSetup(); paintThread(); }

  // ── the live turn ──────────────────────────────────────────────────────────
  function lineFor(ev) {
    var p = ev.payload || {};
    if (ev.kind === 'tool_use') {
      var h = (p.input && (p.input.file_path || p.input.path || p.input.command || p.input.pattern)) || '';
      return (p.name || 'tool') + '  ' + String(h).slice(0, 120);
    }
    if (ev.kind === 'tool_result') return (p.is_error ? 'error  ' : 'ok     ') + String(p.text || '').split('\n')[0].slice(0, 120);
    if (ev.kind === 'assistant') return String(p.text || '').slice(0, 400);
    if (ev.kind === 'delta') return '';
    if (ev.kind === 'system') return '· ' + (p.status || '');
    if (ev.kind === 'result') return '· done';
    return String(p.text || '');
  }

  function closeStream() { if (es) { try { es.close(); } catch (e) {} es = null; } }

  function follow(runId) {
    var mine = ++gen;
    closeStream();
    es = new EventSource(API + '/runs/' + runId + '/stream');
    es.onmessage = function (m) {
      if (mine !== gen) return;
      var ev; try { ev = JSON.parse(m.data); } catch (e) { return; }
      if (ev.kind === 'end') { closeStream(); refresh(); return; }
      if (ev.kind === 'delta') {
        streaming += (ev.payload && ev.payload.text) || '';
        paintThread();
        return;
      }
      // A finished assistant message supersedes whatever was streaming into the bubble.
      if (ev.kind === 'assistant' || ev.kind === 'result') streaming = '';
      var line = lineFor(ev);
      if (line) { liveEvents.push(line); if (liveEvents.length > 400) liveEvents.shift(); }
      if (ev.kind === 'system' && ev.payload && done(ev.payload.status)) { closeStream(); refresh(); return; }
      paintThread();
    };
    es.onerror = function () {
      closeStream();
      // A dropped stream falls back to re-reading the thread rather than freezing on a turn that
      // is still working.
      setTimeout(function () { if (mine === gen) refresh().then(function () { if (busy && turns.length) follow(turns[turns.length - 1].id); }); }, 4000);
    };
  }

  async function refresh() {
    if (!thread) return;
    try {
      var d = await api('/threads/' + thread.id);
      thread = d.thread;
      turns = d.turns || [];
      var last = turns[turns.length - 1];
      var live = !!(last && !done(last.status));
      setBusy(live);
      if (!live) { liveEvents = []; streaming = ''; }
      paint();
      if (live) follow(last.id);
    } catch (e) { /* the next event or the next send re-reads it */ }
  }

  function setBusy(v) {
    busy = v;
    $('send').disabled = v;
    $('workw').textContent = v ? t('working') : '';
  }

  // ── sending ────────────────────────────────────────────────────────────────
  async function send(text) {
    var msg = String(text == null ? $('cmsg').value : text).trim();
    if (!msg) return;
    if (busy) { notice(t('stillWorking')); return; }
    if (!thread && !$('repo').value) return;
    notice('');

    $('cmsg').value = '';
    $('cmsg').style.height = 'auto';
    liveEvents = []; streaming = '';
    // Drawn at once, so the screen answers the keystroke; the server's copy replaces it below.
    turns.push({ id: 0, brief: msg, status: 'queued', summary: null });
    setBusy(true);
    paint();

    try {
      var body = thread
        ? { thread_id: thread.id, text: msg }
        : { repo_full_name: $('repo').value, base_branch: ($('branch').value || 'main').trim(), text: msg };
      var d = await api('/chat', { method: 'POST', body: body });
      thread = d.thread;
      try { localStorage.setItem(THREAD_KEY, String(thread.id)); } catch (e) {}
      await refresh();
    } catch (e) {
      turns.pop();
      setBusy(false);
      notice(e.message);
      paint();
    }
  }

  async function cancelTurn(id) {
    if (!id) return;
    try { await api('/runs/' + id + '/cancel', { method: 'POST', body: {} }); } catch (e) { notice(e.message); }
    await refresh();
  }

  async function doMerge() {
    if (!thread || !thread.pr_url) return;
    if (!confirm(t('confirmMerge'))) return;
    var b = $('mergeBtn');
    b.disabled = true; b.textContent = t('merging');
    try {
      await api('/threads/' + thread.id + '/merge', { method: 'POST', body: {} });
      b.textContent = t('merged');
    } catch (e) {
      b.disabled = false; b.textContent = t('merge');
      notice(e.message);
    }
  }

  function newThread() {
    closeStream(); gen++;
    thread = null; turns = []; liveEvents = []; streaming = '';
    try { localStorage.removeItem(THREAD_KEY); } catch (e) {}
    $('mergeBtn').disabled = false;
    setBusy(false);
    notice('');
    paintNotice();
    paint();
    $('cmsg').focus();
  }

  // ── dictation: the browser's own recognizer, the same ear the Factory uses ──
  function wireMic() {
    var mic = $('mic');
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { mic.disabled = true; mic.title = t('noMic'); return; }
    var rec = null, on = false;
    mic.addEventListener('click', function () {
      if (on && rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = lang === 'en' ? 'en-US' : 'es-ES';
      rec.continuous = true; rec.interimResults = false;
      rec.onresult = function (ev) {
        var add = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) add += ev.results[i][0].transcript;
        if (add) $('cmsg').value = ($('cmsg').value ? $('cmsg').value.replace(/\s*$/, ' ') : '') + add.trim();
      };
      rec.onend = function () { on = false; mic.classList.remove('rec'); $('micStat').textContent = ''; };
      rec.onerror = function () { on = false; mic.classList.remove('rec'); $('micStat').textContent = ''; };
      try { rec.start(); on = true; mic.classList.add('rec'); $('micStat').textContent = t('listening'); } catch (e) {}
    });
  }

  function wireLang() {
    var btn = $('langBtn');
    function label() { btn.textContent = lang === 'en' ? 'ES' : 'EN'; }
    label();
    btn.addEventListener('click', function () {
      lang = lang === 'en' ? 'es' : 'en';
      try { localStorage.setItem('speakup_lang', lang); } catch (e) {}
      document.documentElement.lang = lang;
      document.dispatchEvent(new CustomEvent('speakup:lang', { detail: lang }));
      label(); paint();
    });
    $('outBtn').addEventListener('click', async function () {
      try { await fetch('/speakup/api/v1/auth/logout', { method: 'POST', headers: { 'X-SpeakUp': '1' } }); } catch (e) {}
      location.href = '/speakup/login';
    });
    document.documentElement.lang = lang;
  }

  // ── boot ───────────────────────────────────────────────────────────────────
  (async function boot() {
    wireLang(); wireMic();
    $('send').addEventListener('click', function () { send(); });
    // Enter sends, Shift+Enter is a new line — the gesture everyone already has.
    $('cmsg').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });
    $('cmsg').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, Math.round(window.innerHeight * 0.3)) + 'px';
    });
    $('newBtn2').addEventListener('click', newThread);
    $('repoBtn').addEventListener('click', function () {
      if (this.disabled) return;
      pickerOpen = !pickerOpen;
      paintSetup();
      if (pickerOpen) $('repo').focus();
    });
    $('mergeBtn').addEventListener('click', doMerge);
    $('repo').addEventListener('change', function () {
      try { localStorage.setItem(REPO_KEY, this.value); } catch (e) {}
      var r = currentRepo(); if (r) $('branch').value = r.default_branch || 'main';
      pickerOpen = false;
      paintSetup();
    });
    $('branch').addEventListener('input', paintSetup);
    $('syncBtn').addEventListener('click', async function () {
      var r = currentRepo(); if (!r) return;
      $('syncBtn').disabled = true;
      try {
        var d = await api('/repos/' + r.id + '/sync', { method: 'POST', body: {} });
        Object.assign(r, d.repo);
        $('branch').value = r.default_branch || $('branch').value;
        notice('');
      } catch (e) { notice(e.message); }
      $('syncBtn').disabled = false;
      paintSetup();
    });

    try { cfg = await api('/config'); } catch (e) { cfg = {}; }
    try {
      var d = await api('/repos');
      repos = d.repos || [];
      $('repo').innerHTML = repos.map(function (r) {
        return '<option value="' + esc(r.repo_full_name) + '">' + esc(r.repo_full_name) + '</option>';
      }).join('');
      // Your last choice wins; otherwise the server's default, which is the repository this app
      // itself lives in. Falling back to whatever sorted first was arbitrary.
      var saved = null; try { saved = localStorage.getItem(REPO_KEY); } catch (e) {}
      var has = function (n) { return !!n && repos.some(function (r) { return r.repo_full_name === n; }); };
      if (has(saved)) $('repo').value = saved;
      else if (has(cfg.default_repo)) $('repo').value = cfg.default_repo;
      var r0 = currentRepo();
      $('branch').value = (r0 && r0.default_branch) || cfg.default_branch || 'main';
    } catch (e) { notice(e.message); }
    paintNotice();

    // Reopen the conversation you were in, the way a chat does.
    var want = null;
    var m = location.search.match(/[?&]thread=(\d+)/);
    if (m) want = m[1];
    if (!want) { try { want = localStorage.getItem(THREAD_KEY); } catch (e) {} }
    if (want) {
      try {
        var td = await api('/threads/' + want);
        thread = td.thread; turns = td.turns || [];
      } catch (e) { try { localStorage.removeItem(THREAD_KEY); } catch (e2) {} }
    }
    paint();
    if (thread) await refresh();
    $('cmsg').focus();
  })();
})();
