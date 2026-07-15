'use strict';
// OK Hola frontend — vanilla JS. Web Speech API capture + fetch calls + lang toggle.
(function () {
  var DICT = window.__DICT || {};
  var LANG = window.__LANG || 'es';
  // sub-app mount path: strip a trailing /app or /dashboard (and any trailing slash)
  var BASE = location.pathname.replace(/\/(app|dashboard)\/?$/, '').replace(/\/$/, '');
  var API = BASE + '/api/v1';
  var TOKEN_KEY = 'okhola_jwt';

  function t(k) { return DICT[k] || k; }
  function $(id) { return document.getElementById(id); }
  function jwt() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setJwt(v) { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); }

  // ---- apply i18n text to [data-i18n] / [data-i18n-ph] ----
  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n'); if (DICT[k]) el.textContent = DICT[k];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph'); if (DICT[k]) el.setAttribute('placeholder', DICT[k]);
    });
  }

  // ---- language toggle ----
  function wireLangToggle() {
    var lt = $('langToggle');
    if (!lt) return;
    lt.addEventListener('click', function (e) {
      e.preventDefault();
      var next = LANG === 'en' ? 'es' : 'en';
      var u = new URL(location.href); u.searchParams.set('lang', next); location.href = u.toString();
    });
  }

  function api(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (jwt()) headers['Authorization'] = 'Bearer ' + jwt();
    return fetch(API + path, {
      method: method, headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  // ============ APP PAGE (voice/text tool) ============
  function initApp() {
    var authPanel = $('authPanel'), sessionBar = $('sessionBar'), composer = $('composer');
    if (!authPanel) return; // not on the tool page

    function refreshAuthUI() {
      if (jwt()) {
        authPanel.classList.add('hidden');
        sessionBar.classList.remove('hidden'); sessionBar.classList.add('flex');
        composer.classList.remove('hidden');
        try {
          var payload = JSON.parse(atob(jwt().split('.')[1]));
          $('whoami').textContent = payload.email || '';
        } catch (e) {}
      } else {
        authPanel.classList.remove('hidden');
        sessionBar.classList.add('hidden'); sessionBar.classList.remove('flex');
        composer.classList.add('hidden');
        $('result').classList.add('hidden');
      }
    }

    // One-step login: enter email -> get magic-link token -> auto-verify -> in.
    // No token to copy. If real email delivery is on (no token returned), we
    // reveal the manual token box and tell the user to check their inbox.
    $('btnMagic').addEventListener('click', function () {
      var email = $('email').value.trim();
      if (!email) { $('authMsg').textContent = t('error_empty'); return; }
      var btn = $('btnMagic'); btn.disabled = true; btn.textContent = t('entering');
      $('authMsg').textContent = t('entering');
      api('POST', '/auth/magic-link', { email: email }).then(function (r) {
        if (r.status !== 200) { btn.disabled = false; btn.textContent = t('enter'); $('authMsg').textContent = r.body.error || t('error_generic'); return; }
        if (r.body.loginToken) {
          // frictionless: verify immediately, user never sees a token
          return api('POST', '/auth/verify', { token: r.body.loginToken }).then(function (v) {
            btn.disabled = false; btn.textContent = t('enter');
            if (v.status === 200 && v.body.jwt) { setJwt(v.body.jwt); $('authMsg').textContent = ''; refreshAuthUI(); }
            else { $('authMsg').textContent = (v.body && v.body.error) || t('error_generic'); }
          });
        }
        // email delivery is enabled -> token was emailed, show manual entry
        btn.disabled = false; btn.textContent = t('enter');
        $('tokenRow').classList.remove('hidden'); $('tokenRow').classList.add('flex');
        $('authMsg').textContent = t('check_email');
      }).catch(function () { btn.disabled = false; btn.textContent = t('enter'); $('authMsg').textContent = t('error_generic'); });
    });

    $('btnVerify').addEventListener('click', function () {
      var token = $('loginToken').value.trim();
      if (!token) { $('authMsg').textContent = t('error_empty'); return; }
      api('POST', '/auth/verify', { token: token }).then(function (r) {
        if (r.status === 200 && r.body.jwt) { setJwt(r.body.jwt); $('authMsg').textContent = ''; refreshAuthUI(); }
        else { $('authMsg').textContent = r.body.error || t('error_generic'); }
      }).catch(function () { $('authMsg').textContent = t('error_generic'); });
    });

    $('btnLogout').addEventListener('click', function () { setJwt(''); refreshAuthUI(); });

    // ---- Web Speech API voice capture (progressive enhancement) ----
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var recog = null, recording = false;
    var mic = $('mic');
    if (!SR) { $('micMsg').textContent = t('mic_unsupported'); mic.disabled = true; mic.classList.add('opacity-40'); }
    else {
      mic.addEventListener('click', function () {
        if (recording) { recog.stop(); return; }
        recog = new SR();
        recog.lang = LANG === 'en' ? 'en-US' : 'es-ES';
        recog.interimResults = true; recog.continuous = true;
        var base = $('rawText').value;
        recog.onresult = function (ev) {
          var finalTxt = '';
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) finalTxt += ev.results[i][0].transcript;
          }
          if (finalTxt) $('rawText').value = (base ? base + ' ' : '') + finalTxt, base = $('rawText').value;
        };
        recog.onend = function () { recording = false; mic.classList.remove('rec'); $('micMsg').textContent = ''; };
        recog.onerror = function () { recording = false; mic.classList.remove('rec'); };
        recog.start(); recording = true; mic.classList.add('rec'); $('micMsg').textContent = t('mic_stop') + '...';
      });
    }

    // ---- Generate ----
    var lastId = null;
    $('btnGenerate').addEventListener('click', function () {
      var raw = $('rawText').value.trim();
      if (!raw) { $('resultMsg').textContent = t('error_empty'); $('result').classList.remove('hidden'); return; }
      var btn = $('btnGenerate'); btn.disabled = true; btn.textContent = t('generating');
      api('POST', '/prompts/generate', { rawText: raw }).then(function (r) {
        btn.disabled = false; btn.textContent = t('generate');
        if (r.status === 201) { lastId = r.body.id; fillResult(r.body.prompt.structured); $('result').classList.remove('hidden'); $('resultMsg').textContent = ''; }
        else { $('resultMsg').textContent = r.body.error || t('error_generic'); $('result').classList.remove('hidden'); }
      }).catch(function () { btn.disabled = false; btn.textContent = t('generate'); $('resultMsg').textContent = t('error_generic'); });
    });

    function fillResult(s) {
      $('f_title').value = s.title || '';
      $('f_style').value = s.style || '';
      $('f_duration').value = s.durationSec || 30;
      $('f_aspect').value = s.aspectRatio || '9:16';
      $('f_platform').value = s.platform || 'general';
      $('f_scenes').value = JSON.stringify(s.scenes || [], null, 2);
    }
    function readResult() {
      var scenes = [];
      try { scenes = JSON.parse($('f_scenes').value); } catch (e) { scenes = []; }
      return {
        title: $('f_title').value, style: $('f_style').value,
        durationSec: parseInt($('f_duration').value, 10) || 30,
        aspectRatio: $('f_aspect').value, platform: $('f_platform').value,
        scenes: scenes
      };
    }

    $('btnSave').addEventListener('click', function () {
      if (!lastId) { $('resultMsg').textContent = t('error_generic'); return; }
      api('PATCH', '/prompts/' + lastId, { structured: readResult(), title: $('f_title').value }).then(function (r) {
        $('resultMsg').textContent = (r.status === 200) ? t('saved') + ' ✓' : (r.body.error || t('error_generic'));
      });
    });
    $('btnRender').addEventListener('click', function () {
      if (!lastId) return;
      api('POST', '/prompts/' + lastId + '/render').then(function (r) { $('resultMsg').textContent = (r.body.note || t('mocked_note')) + ' [' + (r.body.jobId || '') + ']'; });
    });
    $('btnPublish').addEventListener('click', function () {
      if (!lastId) return;
      api('POST', '/prompts/' + lastId + '/publish', { platform: $('f_platform').value }).then(function (r) { $('resultMsg').textContent = (r.body.note || t('mocked_note')) + ' [' + (r.body.platform || '') + ']'; });
    });

    refreshAuthUI();
  }

  // ============ DASHBOARD PAGE ============
  function initDashboard() {
    if (!jwt()) { $('needLogin').classList.remove('hidden'); return; }
    api('GET', '/prompts').then(function (r) {
      if (r.status !== 200) { $('needLogin').classList.remove('hidden'); return; }
      var rows = r.body.prompts || [];
      if (!rows.length) { $('empty').classList.remove('hidden'); return; }
      var list = $('list');
      rows.forEach(function (p) {
        var s = p.structured || {};
        var el = document.createElement('div');
        el.className = 'rounded-xl border border-zinc-800 bg-zinc-900/50 p-4';
        el.innerHTML =
          '<div class="flex items-center justify-between">' +
            '<div class="font-semibold">' + esc(p.title || s.title || ('#' + p.id)) + '</div>' +
            '<div class="text-xs text-zinc-500">' + esc(s.style || '') + ' · ' + esc(s.aspectRatio || '') + ' · ' + esc(String(s.durationSec || '')) + 's · ' + esc(s.platform || '') + '</div>' +
          '</div>' +
          '<pre class="mono text-xs text-zinc-400 mt-2 whitespace-pre-wrap overflow-x-auto">' + esc(JSON.stringify(s.scenes || [], null, 2)) + '</pre>';
        list.appendChild(el);
      });
    });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- boot ----
  document.addEventListener('DOMContentLoaded', function () {
    applyI18n();
    wireLangToggle();
    if (/\/dashboard\/?$/.test(location.pathname)) initDashboard();
    else if (/\/app\/?$/.test(location.pathname)) initApp();
    // else: marketing landing — i18n + lang toggle only
  });
  window.__initDashboard = initDashboard;
})();
