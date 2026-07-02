// =====================================================
// Frontend — vanilla JS: i18n apply, horse registry, WAV upload + analyze,
// diagnostic card, history table, language toggle. No React.
// =====================================================
(function () {
  'use strict';

  var I18N = window.__I18N || {};
  var BASE = window.__BASE || '/';
  var LANG = window.__LANG || 'es';
  var PAGE = window.__PAGE || 'index';
  var API = BASE + 'api/v1';

  // ---- i18n: fill [data-i18n] text + [data-i18n-ph] placeholders ----
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (I18N[k] != null) el.textContent = I18N[k];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph');
      if (I18N[k] != null) el.setAttribute('placeholder', I18N[k]);
    });
  }

  function langToggle() {
    var el = document.getElementById('langToggle');
    if (!el) return;
    el.addEventListener('click', function () {
      var next = LANG === 'es' ? 'en' : 'es';
      var u = new URL(window.location.href);
      u.searchParams.set('lang', next);
      window.location.href = u.toString();
    });
  }

  // Auto-acquired demo session token (server-minted, scoped to the demo tenant).
  // A user-pasted token in the "advanced" field overrides it.
  var demoToken = '';

  function customToken() {
    var el = document.getElementById('jwt');
    return el && el.value ? el.value.trim() : '';
  }

  function setSessionBadge() {
    var b = document.getElementById('sessionBadge');
    if (!b) return;
    if (customToken()) { b.textContent = I18N.session_custom; b.className = 'text-xs text-emerald-400 mono'; }
    else if (demoToken) { b.textContent = I18N.session_demo; b.className = 'text-xs text-emerald-400 mono'; }
    else { b.textContent = I18N.session_loading; b.className = 'text-xs text-amber-400 mono'; }
  }

  // Resolve a usable token: prefer the pasted one, else the demo token (fetching
  // it on demand if the boot fetch hasn't landed yet). Never asks the user.
  function ensureToken() {
    var c = customToken();
    if (c) return Promise.resolve(c);
    if (demoToken) return Promise.resolve(demoToken);
    return fetch(API + '/session/demo')
      .then(function (r) { return r.json(); })
      .then(function (j) { demoToken = (j && j.token) || ''; setSessionBadge(); return demoToken; })
      .catch(function () { return ''; });
  }

  function authHeaders() {
    var t = customToken() || demoToken;
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  function setStatus(msg) {
    var el = document.getElementById('status');
    if (el) el.textContent = msg || '';
  }

  // ---- Horses ----
  function loadHorses() {
    return fetch(API + '/horses', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        var sels = document.querySelectorAll('#horseSel');
        sels.forEach(function (sel) {
          var keep = sel.querySelector('option[value=""]');
          sel.innerHTML = '';
          if (keep) sel.appendChild(keep);
          (rows || []).forEach(function (h) {
            var o = document.createElement('option');
            o.value = h.id;
            o.textContent = h.name + (h.breed ? ' (' + h.breed + ')' : '');
            sel.appendChild(o);
          });
        });
        return rows;
      })
      .catch(function () { return []; });
  }

  function bindCreateHorse() {
    var btn = document.getElementById('createHorse');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var name = (document.getElementById('hName') || {}).value;
      var breed = (document.getElementById('hBreed') || {}).value;
      if (!name || !name.trim()) { setStatus(I18N.err_need_horse); return; }
      if (!isLoggedIn()) { goLogin(); return; }
      setStatus('…');
      fetch(API + '/horses', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), breed: (breed || '').trim() })
      }).then(function (r) {
        if (r.status === 401) { goLogin(); return null; }
        return r.json();
      }).then(function (row) {
        if (!row || row.error) { if (row && row.error) setStatus(row.error); return; }
        setStatus('');
        loadHorses().then(function () {
          var sel = document.getElementById('horseSel');
          if (sel) sel.value = row.id;
        });
      }).catch(function (e) { setStatus(String(e)); });
    });
  }

  // ---- Verdict styling ----
  function verdictStyle(v) {
    if (v === 'vet_review') return { cls: 'bg-rose-600 text-white', label: I18N.verdict_vet_review };
    if (v === 'training_adjustment') return { cls: 'bg-amber-500 text-slate-900', label: I18N.verdict_training_adjustment };
    return { cls: 'bg-emerald-600 text-white', label: I18N.verdict_normal };
  }

  // ---- Analyze (upload WAV) ----
  function bindAnalyze() {
    var btn = document.getElementById('analyze');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var sel = document.getElementById('horseSel');
      var horseId = sel ? sel.value : '';
      if (!horseId) { setStatus(I18N.err_need_horse); return; }
      var fileEl = document.getElementById('wav');
      var file = fileEl && fileEl.files[0];
      if (!file) { setStatus(I18N.err_need_file); return; }
      if (!isLoggedIn()) { goLogin(); return; }

      setStatus(I18N.analyzing);
      var fd = new FormData();
      fd.append('audio', file);
      fd.append('horse_id', horseId);
      fd.append('lang', LANG);

      fetch(API + '/evaluations', { method: 'POST', credentials: 'same-origin', body: fd })
        .then(function (r) {
          if (r.status === 415) { setStatus(I18N.err_415); return null; }
          if (r.status === 401) { goLogin(); return null; }
          if (r.status === 402) { setStatus(I18N.err_no_credits || 'Sin créditos.'); if (window.ECPFAccount) window.ECPFAccount.openRecharge(); return null; }
          return r.json();
        })
        .then(function (res) {
          if (!res || res.error) { if (res && res.error) setStatus(res.error); return; }
          setStatus('');
          if (res.credits != null && window.ECPFAccount) window.ECPFAccount.setCount(res.credits);
          renderResult(res);
        })
        .catch(function (e) { setStatus(String(e)); });
    });
  }

  function isLoggedIn() { return !!(window.ECPFAccount && window.ECPFAccount.isLoggedIn()); }
  function goLogin() { location.href = BASE + 'login?next=' + encodeURIComponent(location.pathname); }

  function renderResult(res) {
    var card = document.getElementById('result');
    if (!card) return;
    card.classList.remove('hidden');
    var vs = verdictStyle(res.verdict);
    var badge = document.getElementById('verdictBadge');
    badge.className = 'inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 ' + vs.cls;
    badge.textContent = vs.label;
    document.getElementById('recommendation').textContent = res.recommendation || '';
    document.getElementById('mCadence').textContent = res.cadence_bpm != null ? res.cadence_bpm : '—';
    document.getElementById('mCv').textContent = res.regularity_cv != null ? res.regularity_cv : '—';
    document.getElementById('mBeats').textContent = res.beat_count != null ? res.beat_count : '—';
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---- Dashboard history ----
  function bindDashboard() {
    var sel = document.getElementById('horseSel');
    if (!sel) return;
    sel.addEventListener('change', function () { loadHistory(sel.value); });
  }

  function fmtDate(s) {
    try { return new Date(s).toLocaleString(LANG === 'en' ? 'en-US' : 'es-CO'); }
    catch (e) { return s; }
  }

  function loadHistory(horseId) {
    var tbody = document.getElementById('rows');
    var empty = document.getElementById('empty');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!horseId) { if (empty) empty.classList.add('hidden'); return; }
    fetch(API + '/evaluations?horse_id=' + encodeURIComponent(horseId), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!rows || !rows.length) { if (empty) empty.classList.remove('hidden'); return; }
        if (empty) empty.classList.add('hidden');
        rows.forEach(function (e) {
          var vs = verdictStyle(e.verdict);
          var tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/50';
          tr.innerHTML =
            '<td class="py-2 pr-4 mono text-xs">' + fmtDate(e.created_at) + '</td>' +
            '<td class="py-2 pr-4 mono">' + (e.cadence_bpm != null ? e.cadence_bpm : '—') + '</td>' +
            '<td class="py-2 pr-4 mono">' + (e.regularity_cv != null ? e.regularity_cv : '—') + '</td>' +
            '<td class="py-2 pr-4 mono">' + (e.beat_count != null ? e.beat_count : '—') + '</td>' +
            '<td class="py-2 pr-4"><span class="px-2 py-0.5 rounded-full text-xs font-bold ' + vs.cls + '">' + vs.label + '</span></td>';
          tbody.appendChild(tr);
        });
      })
      .catch(function () { if (empty) empty.classList.remove('hidden'); });
  }

  // ---- Championship ranking (dashboard) ----
  var CHAMP = BASE + 'api/v1/champ';
  var MODL = { paso_fino: 'Paso fino', trocha: 'Trocha', trote_galope: LANG === 'en' ? 'Trot / canter' : 'Trote / galope', trocha_galope: LANG === 'en' ? 'Trocha and canter' : 'Trocha y galope' };
  function bindRanking() {
    var ev = document.getElementById('rankEventoSel');
    var cat = document.getElementById('rankCategoriaSel');
    if (!ev || !cat) return;
    fetch(CHAMP + '/eventos').then(function (r) { return r.json(); }).then(function (rows) {
      (rows || []).forEach(function (e) { var o = document.createElement('option'); o.value = e.id; o.textContent = e.nombre + ' (' + (e.anio || '') + ')'; ev.appendChild(o); });
    }).catch(function () {});
    ev.addEventListener('change', function () {
      cat.querySelectorAll('option:not([value=""])').forEach(function (o) { o.remove(); });
      if (!this.value) return;
      fetch(CHAMP + '/categorias?evento_id=' + this.value).then(function (r) { return r.json(); }).then(function (rows) {
        (rows || []).forEach(function (c) { var o = document.createElement('option'); o.value = c.id; o.textContent = c.nombre + ' · ' + (MODL[c.modalidad] || c.modalidad); cat.appendChild(o); });
      }).catch(function () {});
    });
    cat.addEventListener('change', function () { if (this.value) loadRanking(this.value); });
  }
  function loadRanking(categoria_id) {
    var tbody = document.getElementById('rankRows');
    var empty = document.getElementById('rankEmpty');
    if (!tbody) return;
    tbody.innerHTML = '';
    fetch(CHAMP + '/results?categoria_id=' + encodeURIComponent(categoria_id)).then(function (r) { return r.json(); }).then(function (rows) {
      if (!rows || !rows.length) { empty.textContent = I18N.rank_empty; empty.classList.remove('hidden'); return; }
      empty.classList.add('hidden');
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.className = 'border-b border-slate-800/50' + (r.ranking === 1 ? ' bg-emerald-500/5' : '');
        tr.innerHTML =
          '<td class="py-2 pr-4 mono font-bold">' + (r.ranking != null ? r.ranking : '—') + '</td>' +
          '<td class="py-2 pr-4 mono">' + (r.numero_competidor != null ? r.numero_competidor : '—') + '</td>' +
          '<td class="py-2 pr-4">' + esc(r.caballo || '—') + '</td>' +
          '<td class="py-2 pr-4 mono font-bold text-emerald-400">' + (r.puntaje_total != null ? r.puntaje_total.toFixed(1) : '—') + '</td>' +
          '<td class="py-2 pr-4 text-xs text-slate-400">' + esc(r.observaciones || '') + '</td>';
        tbody.appendChild(tr);
      });
    }).catch(function () { empty.classList.remove('hidden'); });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- Coach de Salto (Jump Coach) history (dashboard) ----
  // The Jump Coach is a sibling app on aiagent.ringlypro.com. Its analyses are
  // billed against THIS EquiMind account, so its history belongs in the Historial
  // view. We fetch it cross-origin with the short-lived embed token the panel
  // appends as ?token= (same token the Jump Coach iframe uses to bill credits).
  var JUMP_BASE = 'https://aiagent.ringlypro.com/ai-jump-coach-rider-pose-analyzer';
  function loadJumpHistory() {
    var tbody = document.getElementById('jumpRows');
    var empty = document.getElementById('jumpEmpty');
    if (!tbody || !empty) return;
    var tok = new URLSearchParams(location.search).get('token');
    var url = JUMP_BASE + '/api/v1/analyses' + (tok ? ('?token=' + encodeURIComponent(tok)) : '');
    fetch(url, { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (resp) {
      var rows = Array.isArray(resp) ? resp : (resp && resp.data) || [];
      if (!rows.length) { empty.textContent = I18N.jump_hist_empty || empty.textContent; empty.classList.remove('hidden'); return; }
      empty.classList.add('hidden');
      tbody.innerHTML = '';
      rows.forEach(function (a) {
        var d = a.created_at ? new Date(a.created_at) : null;
        var dateStr = d ? (d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '—';
        var faults = Array.isArray(a.faults) ? a.faults.length : (a.faults_count != null ? a.faults_count : 0);
        var dur = a.duration_sec != null ? (Number(a.duration_sec).toFixed(1) + 's') : '—';
        var apex = a.apex_sec != null ? (Number(a.apex_sec).toFixed(1) + 's') : '—';
        var tr = document.createElement('tr');
        tr.className = 'border-b border-slate-800/50';
        tr.innerHTML =
          '<td class="py-2 pr-4 mono text-xs">' + esc(dateStr) + '</td>' +
          '<td class="py-2 pr-4">' + esc(a.filename || '—') + '</td>' +
          '<td class="py-2 pr-4 mono">' + esc(dur) + '</td>' +
          '<td class="py-2 pr-4 mono">' + esc(apex) + '</td>' +
          '<td class="py-2 pr-4 mono ' + (faults ? 'text-amber-400' : 'text-emerald-400') + '">' + faults + '</td>';
        tbody.appendChild(tr);
      });
    }).catch(function () { empty.classList.remove('hidden'); });
  }

  // ---- Mis análisis Caballo de Paso (dashboard) ----
  function loadMyChampSessions() {
    var tbody = document.getElementById('myChampRows'), empty = document.getElementById('myChampEmpty');
    if (!tbody || !empty) return;
    var MODL2 = { paso_fino: 'Paso Fino', trocha: 'Trocha', trocha_galope: (LANG === 'en' ? 'Trocha and canter' : 'Trocha y Galope'), trote_galope: (LANG === 'en' ? 'Trot / canter' : 'Trote / galope') };
    fetch(CHAMP + '/my-sessions', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        tbody.innerHTML = '';
        if (!rows || !rows.length) { empty.classList.remove('hidden'); return; }
        empty.classList.add('hidden');
        rows.forEach(function (s) {
          var d = s.fecha ? new Date(s.fecha) : null;
          var dateStr = d ? (d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '—';
          var url = BASE + 'juez?session=' + s.sesion_id + '&lang=' + LANG;
          var tag = s.simulado ? ' <span class="text-amber-400" title="' + (I18N.sim_tag || 'referencia') + '">◦</span>' : '';
          var tr = document.createElement('tr');
          tr.className = 'border-b border-slate-800/50';
          tr.innerHTML =
            '<td class="py-2 pr-4 mono text-xs">' + esc(dateStr) + '</td>' +
            '<td class="py-2 pr-4">' + esc(s.caballo || '—') + tag + '</td>' +
            '<td class="py-2 pr-4">' + esc(MODL2[s.modalidad] || s.modalidad || '—') + '</td>' +
            '<td class="py-2 pr-4 mono font-bold text-emerald-400">' + (s.puntaje != null ? Number(s.puntaje).toFixed(1) : '—') + '</td>' +
            '<td class="py-2 pr-4"><a href="' + url + '" target="_blank" rel="noopener" class="text-indigo-300 hover:text-indigo-200 underline">' + (I18N.hist_open || 'Ver informe') + ' ↗</a></td>';
          tbody.appendChild(tr);
        });
      }).catch(function () {});
  }

  // ---- Boot ----
  applyI18n();
  langToggle();
  loadHorses();
  if (PAGE === 'dashboard') {
    bindDashboard();
    bindRanking();
    loadMyChampSessions();
    loadJumpHistory();
  } else {
    bindCreateHorse();
    bindAnalyze();
    // Account + credits chip is handled by account.js. Reflect login state in the
    // session badge (audio analysis needs an account + 1 credit).
    (function reflectAuth() {
      var b = document.getElementById('sessionBadge');
      function paint() {
        if (!b) return;
        if (isLoggedIn()) { b.textContent = I18N.session_ready || 'Cuenta activa · listo para evaluar'; b.className = 'text-xs text-emerald-400 mono'; }
        else { b.textContent = I18N.session_need_login || 'Inicia sesión para evaluar (1 crédito por análisis)'; b.className = 'text-xs text-amber-400 mono'; }
      }
      paint();
      // account.js loads config async; re-paint shortly after.
      setTimeout(paint, 400); setTimeout(paint, 1200);
    })();
  }
})();
