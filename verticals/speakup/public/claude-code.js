/* Claude Code — the third tab, both screens.
 *
 * ONE FILE, TWO PAGES. The list and the run share their language dictionary, their status
 * vocabulary and their fetch wrapper; a second copy is how two screens start disagreeing
 * about what "pr_open" is called. The run id is read from the path, so the run page needs
 * no template substitution and no second HTML file.
 *
 * NO LINE IS STORED AS FINISHED TEXT. Every label is a key rendered at paint time, so the
 * language toggle repaints the whole screen — including a console that is already full.
 * What the server sent (a file path, a model's prose, an API error) is shown exactly as it
 * arrived: inventing a translation for it would be worse than leaving it.
 */
(function () {
  'use strict';

  var API = '/speakup/api/v1/claude-code';
  var lang = 'es';
  try { lang = localStorage.getItem('speakup_lang') === 'en' ? 'en' : 'es'; } catch (e) {}

  var T = {
    newRun:   ['Nueva ejecución', 'New run'],
    repo:     ['Repositorio', 'Repository'],
    branch:   ['Rama base', 'Base branch'],
    brief:    ['Qué construir', 'What to build'],
    run:      ['Ejecutar', 'Run'],
    running:  ['Iniciando…', 'Starting…'],
    sync:     ['Sincronizar', 'Sync'],
    refresh:  ['Buscar repositorios', 'Find repositories'],
    history:  ['Ejecuciones', 'Runs'],
    noRuns:   ['Todavía no hay ejecuciones.', 'No runs yet.'],
    skillYes: ['Lleva la guía del arquitecto', 'Carries the architect skill'],
    skillNo:  ['Sin guía del arquitecto: se copia la nuestra', 'No architect skill: ours is copied in'],
    skillUnk: ['Guía del arquitecto sin comprobar', 'Architect skill not checked'],
    noPush:   ['Este token no puede escribir en este repositorio: la ejecución se detendrá al subir.',
               'This token cannot write to this repository: a run would stop at the push.'],
    canPush:  ['Con permiso de escritura', 'Write access'],
    noGit:    ['GITHUB_TOKEN no está configurado, así que no se puede clonar ningún repositorio.',
               'GITHUB_TOKEN is not set, so no repository can be cloned.'],
    noSdk:    ['El paquete @anthropic-ai/claude-agent-sdk no está instalado en el servidor.',
               'The @anthropic-ai/claude-agent-sdk package is not installed on the server.'],
    noKey:    ['ANTHROPIC_API_KEY no está configurada: una ejecución fallará al llegar al agente.',
               'ANTHROPIC_API_KEY is not set: a run will fail when it reaches the agent.'],
    briefReq: ['Escribe qué hay que construir.', 'Write what has to be built.'],
    repoReq:  ['Elige un repositorio.', 'Choose a repository.'],
    dictate:  ['Dictar', 'Dictate'],
    listening:['Escuchando…', 'Listening…'],
    noMic:    ['Este navegador no reconoce voz.', 'This browser has no speech recognition.'],
    cancel:   ['Cancelar', 'Cancel'],
    merge:    ['Fusionar', 'Merge'],
    openPr:   ['Ver el pull request', 'Open the pull request'],
    openDep:  ['Ver el despliegue', 'Open the deploy'],
    back:     ['Volver', 'Back'],
    turns:    ['Turnos', 'Turns'],
    tokens:   ['Tokens', 'Tokens'],
    cost:     ['Coste', 'Cost'],
    dur:      ['Duración', 'Duration'],
    notYet:   ['sin medir', 'not measured'],
    confirmCancel: ['¿Cancelar esta ejecución?', 'Cancel this run?'],
    confirmMerge:  ['¿Fusionar el pull request y desplegar?', 'Merge the pull request and deploy?'],
    // The tabs and the document title are rendered here for the same reason every other label
    // is: they are the first thing an English user reads, and hardcoding them in the markup left
    // "Reuniones / Fábrica" on an English screen.
    tabMeet:  ['Reuniones', 'Meetings'],
    tabFac:   ['Fábrica', 'Factory'],
    tabCC:    ['Claude Code', 'Claude Code'],
    menu:     ['Menú', 'Menu'],
    titleList:['Claude Code — AutoDev', 'Claude Code — AutoDev'],
    titleRun: ['Ejecución — Claude Code', 'Run — Claude Code']
  };
  var ST = {
    queued:   ['En cola', 'Queued'],
    cloning:  ['Clonando', 'Cloning'],
    running:  ['Programando', 'Coding'],
    testing:  ['Probando', 'Testing'],
    pushing:  ['Subiendo', 'Pushing'],
    pr_open:  ['Pull request abierto', 'Pull request open'],
    merged:   ['Fusionado', 'Merged'],
    deployed: ['Desplegado', 'Deployed'],
    failed:   ['Falló', 'Failed'],
    cancelled:['Cancelada', 'Cancelled']
  };
  var TERMINAL = ['merged', 'deployed', 'failed', 'cancelled'];
  function t(k) { var e = T[k]; return e ? e[lang === 'en' ? 1 : 0] : k; }
  function statusLabel(s) { var e = ST[s]; return e ? e[lang === 'en' ? 1 : 0] : String(s || ''); }
  function statusClass(s) {
    if (s === 'merged' || s === 'deployed') return 'good';
    if (s === 'failed' || s === 'cancelled') return 'bad';
    if (s === 'pr_open') return '';
    return 'live';
  }
  function setText(id, s) { var el = document.getElementById(id); if (el) el.textContent = s; }
  // Shared chrome: the three tabs, the burger's label and the document title. Called by both
  // screens' paint(), so a language change relabels the whole page and not only its body.
  function paintChrome(titleKey) {
    setText('tabMeet', t('tabMeet')); setText('tabFac', t('tabFac')); setText('tabCC', t('tabCC'));
    var b = document.getElementById('burger'); if (b) b.setAttribute('aria-label', t('menu'));
    var m = document.getElementById('mic'); if (m) { m.setAttribute('aria-label', t('dictate')); m.title = t('dictate'); }
    document.title = t(titleKey);
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

  async function api(path, opts) {
    var o = opts || {};
    var res = await fetch(API + path, {
      method: o.method || 'GET',
      headers: Object.assign({ 'X-SpeakUp': '1' }, o.body ? { 'Content-Type': 'application/json' } : {}),
      body: o.body ? JSON.stringify(o.body) : undefined
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  }

  function langToggle(repaint) {
    var btn = document.getElementById('langBtn');
    if (!btn) return;
    function label() { btn.textContent = lang === 'en' ? 'ES' : 'EN'; }
    label();
    btn.addEventListener('click', function () {
      lang = lang === 'en' ? 'es' : 'en';
      try { localStorage.setItem('speakup_lang', lang); } catch (e) {}
      document.documentElement.lang = lang;
      document.dispatchEvent(new CustomEvent('speakup:lang', { detail: lang }));
      label();
      repaint();
    });
    var out = document.getElementById('outBtn');
    if (out) out.addEventListener('click', async function () {
      try { await fetch('/speakup/api/v1/auth/logout', { method: 'POST', headers: { 'X-SpeakUp': '1' } }); } catch (e) {}
      location.href = '/speakup/login';
    });
    document.documentElement.lang = lang;
  }

  // ── dictation: the browser's own recognizer, the same ear the Factory uses ──
  function wireMic(target, statEl) {
    var mic = document.getElementById('mic');
    if (!mic) return;
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
        if (add) target.value = (target.value ? target.value.replace(/\s*$/, ' ') : '') + add.trim();
      };
      rec.onend = function () { on = false; mic.classList.remove('rec'); if (statEl) statEl.textContent = ''; };
      rec.onerror = function () { on = false; mic.classList.remove('rec'); if (statEl) statEl.textContent = ''; };
      try { rec.start(); on = true; mic.classList.add('rec'); if (statEl) statEl.textContent = t('listening'); } catch (e) {}
    });
  }

  // ═══ the list screen ═══════════════════════════════════════════════════════
  async function listScreen() {
    var repoSel = document.getElementById('repo');
    var branchIn = document.getElementById('branch');
    var briefIn = document.getElementById('brief');
    var runBtn = document.getElementById('runBtn');
    var syncBtn = document.getElementById('syncBtn');
    var refreshBtn = document.getElementById('refreshBtn');
    var skillChip = document.getElementById('skillChip');
    var pushChip = document.getElementById('pushChip');
    var notice = document.getElementById('ccNotice');
    var repos = [];
    var cfg = {};

    function paint() {
      paintChrome('titleList');
      setText('tNew', t('newRun')); setText('tRepo', t('repo')); setText('tBranch', t('branch'));
      setText('tBrief', t('brief')); setText('tHist', t('history'));
      runBtn.textContent = t('run'); syncBtn.textContent = t('sync'); refreshBtn.textContent = t('refresh');
      briefIn.placeholder = lang === 'en'
        ? 'Describe the change. Claude Code clones, codes, tests, commits and opens the pull request.'
        : 'Describe el cambio. Claude Code clona, programa, prueba, hace commit y abre el pull request.';
      paintSkill(); paintNotice(); renderRuns();
    }
    function paintNotice() {
      // What is missing is said plainly and up front, never discovered when a run dies.
      var msgs = [];
      if (cfg.github === false) msgs.push(t('noGit'));
      if (cfg.sdk === false) msgs.push(t('noSdk'));
      if (cfg.anthropic_key === false) msgs.push(t('noKey'));
      if (!msgs.length) { notice.hidden = true; return; }
      notice.hidden = false; notice.textContent = msgs.join(' ');
    }
    function current() { return repos.find(function (r) { return r.repo_full_name === repoSel.value; }) || null; }
    function paintSkill() {
      var r = current();
      if (!r) { skillChip.hidden = true; pushChip.hidden = true; return; }
      skillChip.hidden = false;
      skillChip.className = 'chip ' + (r.has_architect_skill === true ? 'ok' : (r.has_architect_skill === false ? 'warn' : ''));
      skillChip.textContent = r.has_architect_skill === true ? t('skillYes') : (r.has_architect_skill === false ? t('skillNo') : t('skillUnk'));
      // Write access is the one thing that fails LAST and costs money: a read-only token carries
      // a run through the clone, the agent and the commit and only dies at the push.
      if (r.can_push === false) {
        pushChip.hidden = false; pushChip.className = 'chip warn'; pushChip.textContent = t('noPush');
      } else if (r.can_push === true) {
        pushChip.hidden = false; pushChip.className = 'chip ok'; pushChip.textContent = t('canPush');
      } else { pushChip.hidden = true; }
    }
    function paintRepos() {
      repoSel.innerHTML = repos.map(function (r) { return '<option value="' + esc(r.repo_full_name) + '">' + esc(r.repo_full_name) + '</option>'; }).join('');
      var saved = null;
      try { saved = localStorage.getItem('cc_repo'); } catch (e) {}
      if (saved && repos.some(function (r) { return r.repo_full_name === saved; })) repoSel.value = saved;
      var r = current();
      if (r) branchIn.value = r.default_branch || 'main';
      paintSkill();
    }

    var runsCache = [];
    function renderRuns() {
      var box = document.getElementById('runs');
      if (!runsCache.length) { box.innerHTML = '<p class="empty">' + esc(t('noRuns')) + '</p>'; return; }
      box.innerHTML = runsCache.map(function (r) {
        var first = String(r.brief || '').split('\n')[0].slice(0, 90);
        var cost = r.cost_usd == null ? '' : ' · $' + Number(r.cost_usd).toFixed(2);
        return '<a class="runrow" href="/speakup/claude-code/runs/' + r.id + '">' +
          '<span class="pill ' + statusClass(r.status) + '">' + esc(statusLabel(r.status)) + '</span>' +
          '<span class="title">#' + r.id + ' · ' + esc(first) + '</span>' +
          '<span class="meta">' + esc(r.repo_full_name) + cost + '</span></a>';
      }).join('');
    }

    try { cfg = await api('/config'); } catch (e) { cfg = {}; }
    try {
      var d = await api('/repos');
      repos = d.repos || [];
      paintRepos();
    } catch (e) { notice.hidden = false; notice.textContent = e.message; }
    try { runsCache = (await api('/runs')).runs || []; } catch (e) {}
    paint();

    repoSel.addEventListener('change', function () {
      var r = current();
      if (r) branchIn.value = r.default_branch || 'main';
      try { localStorage.setItem('cc_repo', repoSel.value); } catch (e) {}
      paintSkill();
    });

    syncBtn.addEventListener('click', async function () {
      var r = current(); if (!r) return;
      syncBtn.disabled = true;
      try {
        var d = await api('/repos/' + r.id + '/sync', { method: 'POST', body: {} });
        Object.assign(r, d.repo);
        branchIn.value = r.default_branch || branchIn.value;
        paintSkill();
      } catch (e) { notice.hidden = false; notice.textContent = e.message; }
      syncBtn.disabled = false;
    });

    refreshBtn.addEventListener('click', async function () {
      refreshBtn.disabled = true;
      try {
        await api('/repos/refresh', { method: 'POST', body: {} });
        repos = (await api('/repos')).repos || [];
        paintRepos();
      } catch (e) { notice.hidden = false; notice.textContent = e.message; }
      refreshBtn.disabled = false;
    });

    runBtn.addEventListener('click', async function () {
      var brief = briefIn.value.trim();
      if (!repoSel.value) { notice.hidden = false; notice.textContent = t('repoReq'); return; }
      if (!brief) { notice.hidden = false; notice.textContent = t('briefReq'); return; }
      runBtn.disabled = true; runBtn.textContent = t('running');
      try {
        var d = await api('/runs', { method: 'POST', body: { repo_full_name: repoSel.value, base_branch: branchIn.value.trim() || 'main', brief: brief } });
        location.href = '/speakup/claude-code/runs/' + d.run.id;
      } catch (e) {
        notice.hidden = false; notice.textContent = e.message;
        runBtn.disabled = false; runBtn.textContent = t('run');
      }
    });

    wireMic(briefIn, document.getElementById('micStat'));
    langToggle(paint);
  }

  // ═══ the run screen ════════════════════════════════════════════════════════
  async function runScreen() {
    var m = location.pathname.match(/\/claude-code\/runs\/(\d+)/);
    if (!m) { location.href = '/speakup/claude-code'; return; }
    var id = Number(m[1]);
    var run = null;
    var shown = [];              // raw events, so a language change can repaint them all
    var seen = {};
    var pane = document.getElementById('console');

    function paint() {
      paintChrome('titleRun');
      if (!run) return;
      var pill = document.getElementById('statusPill');
      pill.className = 'pill ' + statusClass(run.status);
      pill.textContent = statusLabel(run.status);
      setText('runRepo', run.repo_full_name + ' · ' + (run.work_branch || run.base_branch));
      setText('runBrief', run.brief);
      paintCounters(); paintActions(); repaintLog();
    }
    function paintCounters() {
      var c = document.getElementById('counters');
      var dur = '';
      if (run.started_at) {
        var end = run.finished_at ? new Date(run.finished_at) : new Date();
        var s = Math.max(0, Math.round((end - new Date(run.started_at)) / 1000));
        dur = s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
      }
      var tok = (run.tokens_in || run.tokens_out) ? ((run.tokens_in || 0) + ' / ' + (run.tokens_out || 0)) : t('notYet');
      c.innerHTML =
        '<span>' + esc(t('turns')) + ': <b>' + (run.turns == null ? esc(t('notYet')) : run.turns) + '</b></span>' +
        '<span>' + esc(t('tokens')) + ': <b>' + esc(tok) + '</b></span>' +
        '<span>' + esc(t('cost')) + ': <b>' + (run.cost_usd == null ? esc(t('notYet')) : '$' + Number(run.cost_usd).toFixed(4)) + '</b></span>' +
        (dur ? '<span>' + esc(t('dur')) + ': <b>' + esc(dur) + '</b></span>' : '');
    }
    function paintActions() {
      var box = document.getElementById('runActions');
      box.innerHTML = '';
      var add = function (label, cls, fn, href) {
        var el = document.createElement(href ? 'a' : 'button');
        el.className = 'btn ' + (cls || '');
        el.textContent = label;
        if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener'; } else { el.type = 'button'; el.addEventListener('click', fn); }
        box.appendChild(el);
      };
      add(t('back'), 'quiet', null, '/speakup/claude-code');
      if (run.pr_url) add(t('openPr'), 'small', null, run.pr_url);
      if (run.deploy_url) add(t('openDep'), 'small', null, run.deploy_url);
      if (run.status === 'pr_open') add(t('merge'), 'primary', doMerge);
      if (TERMINAL.indexOf(run.status) === -1) add(t('cancel'), 'small', doCancel);
    }

    // A language change must not throw the console away. The old version rebuilt the pane and
    // jumped to the bottom, so every fold the operator had opened closed and they lost their
    // place in a long run — for a toggle that only relabels.
    function repaintLog() {
      var open = {}, i;
      var folds = pane.querySelectorAll('details');
      for (i = 0; i < folds.length; i++) if (folds[i].open) open[i] = true;
      var atBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 60;
      var keepTop = pane.scrollTop;
      pane.innerHTML = '';
      for (i = 0; i < shown.length; i++) pane.appendChild(lineFor(shown[i]));
      var again = pane.querySelectorAll('details');
      for (i = 0; i < again.length; i++) if (open[i]) again[i].open = true;
      pane.scrollTop = atBottom ? pane.scrollHeight : keepTop;
    }
    // A tool call is one collapsed row; its arguments and its result are the fold. A console
    // that prints every byte of every Write is unreadable exactly when it matters most.
    function lineFor(ev) {
      var p = ev.payload || {};
      var wrap = document.createElement('span');
      if (ev.kind === 'system') {
        wrap.className = 'ln';
        wrap.innerHTML = '<span class="k ' + (statusClass(p.status) === 'bad' ? 'err' : (statusClass(p.status) === 'good' ? 'ok' : '')) + '">' +
          esc(statusLabel(p.status) || 'system') + '</span><span class="say">' + esc(p.error || p.work_branch || p.pr_url || '') + '</span>';
      } else if (ev.kind === 'assistant') {
        wrap.className = 'ln';
        wrap.innerHTML = '<span class="k you">claude</span><span class="say">' + esc(p.text || '') + '</span>';
      } else if (ev.kind === 'tool_use') {
        var d = document.createElement('details');
        var head = (p.input && (p.input.file_path || p.input.path || p.input.command || p.input.pattern)) || '';
        d.innerHTML = '<summary><span class="k">' + esc(p.name || 'tool') + '</span><span class="path">' + esc(String(head).slice(0, 120)) + '</span></summary>' +
          '<span class="body">' + esc(JSON.stringify(p.input || {}, null, 1)) + '</span>';
        return d;
      } else if (ev.kind === 'tool_result') {
        var r = document.createElement('details');
        r.innerHTML = '<summary><span class="k ' + (p.is_error ? 'err' : 'ok') + '">' + (p.is_error ? 'error' : 'ok') + '</span>' +
          '<span class="path">' + esc(String(p.text || '').split('\n')[0].slice(0, 110)) + '</span></summary>' +
          '<span class="body">' + esc(p.text || '') + '</span>';
        return r;
      } else if (ev.kind === 'result') {
        wrap.className = 'ln';
        wrap.innerHTML = '<span class="k ' + (p.is_error ? 'err' : 'ok') + '">result</span><span class="say">' +
          esc((p.text || '') + (p.cost_usd != null ? '  ($' + Number(p.cost_usd).toFixed(4) + ')' : '')) + '</span>';
      } else {
        wrap.className = 'ln';
        wrap.innerHTML = '<span class="k">log</span><span class="say">' + esc(p.text || '') + '</span>';
      }
      return wrap;
    }

    function push(ev) {
      if (ev.id && seen[ev.id]) return;
      if (ev.id) seen[ev.id] = 1;
      shown.push(ev);
      if (shown.length > 1200) shown.splice(0, shown.length - 1200);
      var atBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 60;
      pane.appendChild(lineFor(ev));
      if (atBottom) pane.scrollTop = pane.scrollHeight;
    }

    async function load() {
      var d = await api('/runs/' + id);
      run = d.run;
      shown = d.events || [];
      // Said, not hidden: a long run has more events than one page, and the console shows the
      // newest. Pretending otherwise would make the log look complete when it is not.
      if (d.truncated) {
        shown.unshift({ id: 0, kind: 'log', payload: { text: (lang === 'en'
          ? 'Showing the most recent ' + shown.length + ' of ' + d.total + ' events.'
          : 'Se muestran los ' + shown.length + ' eventos más recientes de ' + d.total + '.') } });
      }
      for (var i = 0; i < shown.length; i++) if (shown[i].id) seen[shown[i].id] = 1;
      paint();
    }

    async function doCancel() {
      if (!confirm(t('confirmCancel'))) return;
      try { var d = await api('/runs/' + id + '/cancel', { method: 'POST', body: {} }); run = d.run; paint(); } catch (e) { alert(e.message); }
    }
    async function doMerge() {
      if (!confirm(t('confirmMerge'))) return;
      try { var d = await api('/runs/' + id + '/merge', { method: 'POST', body: {} }); run = d.run; paint(); } catch (e) { alert(e.message); }
    }

    // The language toggle and Sign out are wired by langToggle, so it runs BEFORE the first
    // fetch: a 404, an expired cookie or a 500 used to reject here and leave the page shipped
    // markup with a dead menu and no message at all.
    langToggle(paint);
    try {
      await load();
    } catch (e) {
      pane.innerHTML = '';
      var err = document.createElement('span');
      err.className = 'ln';
      err.innerHTML = '<span class="k err">error</span><span class="say">' + esc(e.message) + '</span>';
      pane.appendChild(err);
      document.getElementById('statusPill').textContent = lang === 'en' ? 'Not loaded' : 'No cargó';
      return;
    }

    // Live events. The stream replays anything stored after the last id we hold, so nothing
    // is missed between the load above and the connection; a dropped stream falls back to
    // polling rather than leaving the page frozen on a run that is still working.
    function follow() {
      if (run && TERMINAL.indexOf(run.status) !== -1) return;
      var last = shown.length ? (shown[shown.length - 1].id || 0) : 0;
      var es = new EventSource(API + '/runs/' + id + '/stream?after=' + last);
      es.onmessage = function (m) {
        var ev; try { ev = JSON.parse(m.data); } catch (e) { return; }
        if (ev.kind === 'end') { es.close(); load().catch(function () {}); return; }
        push(ev);
        if (ev.kind === 'system' && ev.payload) {
          if (ev.payload.status) run.status = ev.payload.status;
          ['work_branch', 'pr_url', 'commit_sha', 'deploy_url', 'error', 'cost_usd', 'turns', 'tokens_in', 'tokens_out'].forEach(function (k) {
            if (ev.payload[k] !== undefined) run[k] = ev.payload[k];
          });
          var pill = document.getElementById('statusPill');
          pill.className = 'pill ' + statusClass(run.status);
          pill.textContent = statusLabel(run.status);
          paintCounters(); paintActions();
        }
      };
      // A dropped stream falls back to POLLING the stored events rather than giving up: the old
      // version swallowed a failed reload and froze the page on a run that was still working.
      es.onerror = function () {
        es.close();
        setTimeout(function () {
          load().then(function () { paint(); follow(); }).catch(function () { follow(); });
        }, 4000);
      };
    }
    follow();
    // The counters hold a live duration, so they tick while the run is not finished — and the
    // ticker stops itself, so a tab left open on a stranded run does not repaint for ever.
    var ticker = setInterval(function () {
      if (!run) return;
      if (TERMINAL.indexOf(run.status) !== -1) { clearInterval(ticker); return; }
      paintCounters();
    }, 1000);
  }

  if (document.getElementById('console')) runScreen();
  else if (document.getElementById('newRun')) listScreen();
})();
