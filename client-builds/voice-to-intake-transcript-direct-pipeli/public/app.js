// =====================================================
// Web Speech capture + lang toggle + fetch POST
//
// Progressive enhancement: the typed transcript is the guaranteed path; voice
// is layered on top via the browser SpeechRecognition API. When the API is
// undefined, the mic is disabled and a visible "not supported" hint shows.
// =====================================================
(function () {
  var DICT = window.I18N || {};
  // Mount base = directory this page is served from (handles the sub-app prefix).
  var BASE = window.location.pathname.replace(/\/[^/]*$/, '/');
  var API = BASE + 'api/v1/intake';

  var params = new URLSearchParams(window.location.search);
  var lang = params.get('lang') === 'es' ? 'es' : 'en';

  var el = {
    h1: document.getElementById('h1'),
    subtitle: document.getElementById('subtitle'),
    micBtn: document.getElementById('micBtn'),
    micLabel: document.getElementById('micLabel'),
    status: document.getElementById('status'),
    transcript: document.getElementById('transcript'),
    transcriptLabel: document.getElementById('transcriptLabel'),
    token: document.getElementById('token'),
    tokenWrap: document.getElementById('tokenWrap'),
    authStatus: document.getElementById('authStatus'),
    sendBtn: document.getElementById('sendBtn'),
    result: document.getElementById('result'),
    langBtn: document.getElementById('langBtn'),
    notSupportedHint: document.getElementById('notSupportedHint')
  };

  // ---- Auth: auto-detect the CRM session token --------------------------
  // Same-origin as the CRM, so the JWT the user already logged in with is in
  // localStorage (canonical key 'token') or a cookie. Manual paste is the
  // fallback only when no session is found.
  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function detectSessionToken() {
    var lsKeys = ['token', 'authToken', 'jwt', 'adminAuthToken'];
    for (var i = 0; i < lsKeys.length; i++) {
      try { var v = localStorage.getItem(lsKeys[i]); if (v && v.split('.').length === 3) return v; } catch (e) {}
    }
    var ckKeys = ['token', 'jwt', 'auth_token'];
    for (var j = 0; j < ckKeys.length; j++) {
      var c = readCookie(ckKeys[j]); if (c && c.split('.').length === 3) return c;
    }
    return null;
  }
  var sessionToken = detectSessionToken();
  function getToken() { return sessionToken || (el.token.value || '').trim(); }

  function renderAuth() {
    var d = t();
    if (sessionToken) {
      el.authStatus.style.display = 'block';
      el.authStatus.style.color = 'var(--green)';
      el.authStatus.textContent = '● ' + d.signedIn;
      el.tokenWrap.style.display = 'none';
    } else {
      // No session — offer the CRM login and a manual-paste fallback.
      el.authStatus.style.display = 'block';
      el.authStatus.style.color = 'var(--mut)';
      el.authStatus.innerHTML = '';
      var txt = document.createElement('span');
      txt.textContent = d.notSignedIn + ' ';
      var login = document.createElement('a');
      login.href = '/login'; login.textContent = d.signInLink;
      login.style.color = 'var(--acc)'; login.style.textDecoration = 'underline';
      var mid = document.createElement('span'); mid.textContent = ' · ';
      var paste = document.createElement('a');
      paste.href = '#'; paste.textContent = d.useTokenInstead;
      paste.style.color = 'var(--acc)'; paste.style.textDecoration = 'underline';
      paste.addEventListener('click', function (ev) { ev.preventDefault(); el.tokenWrap.style.display = 'block'; el.token.focus(); });
      el.authStatus.appendChild(txt); el.authStatus.appendChild(login);
      el.authStatus.appendChild(mid); el.authStatus.appendChild(paste);
    }
  }

  function t() { return DICT[lang] || DICT.en || {}; }

  function applyLang() {
    var d = t();
    document.documentElement.lang = d.htmlLang;
    document.title = d.title;
    el.h1.textContent = d.h1;
    el.subtitle.textContent = d.subtitle;
    el.transcriptLabel.textContent = d.transcriptLabel;
    el.transcript.placeholder = d.transcriptPlaceholder;
    el.token.placeholder = d.tokenPlaceholder;
    el.sendBtn.textContent = d.sendLabel;
    el.langBtn.textContent = d.langToggle;
    el.micLabel.textContent = recognizing ? d.micStop : d.micStart;
    el.notSupportedHint.textContent = d.notSupported;
    if (recognition) recognition.lang = d.speechLang;
    if (typeof renderAuth === 'function') renderAuth();
  }

  // ---- Web Speech setup -------------------------------------------------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;
  var recognizing = false;
  var committed = '';

  if (SR) {
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = t().speechLang;

    recognition.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) committed += chunk + ' ';
        else interim += chunk;
      }
      el.transcript.value = (committed + interim).replace(/\s+/g, ' ').trimStart();
      // Keep the latest dictated words in view as the user speaks.
      el.transcript.scrollTop = el.transcript.scrollHeight;
    };
    recognition.onerror = function (e) {
      if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) {
        el.status.textContent = t().micDenied;
      }
      stopRec();
    };
    recognition.onend = function () { if (recognizing) { try { recognition.start(); } catch (x) { stopRec(); } } };
  } else {
    // Guaranteed fallback path: disable mic, show the hint.
    el.micBtn.disabled = true;
    el.micBtn.style.opacity = 0.4;
    el.micBtn.style.cursor = 'not-allowed';
    el.notSupportedHint.style.display = 'inline';
    el.status.textContent = t().notSupported;
  }

  function startRec() {
    if (!recognition) return;
    committed = el.transcript.value ? el.transcript.value + ' ' : '';
    try { recognition.start(); } catch (x) { /* already started */ }
    recognizing = true;
    el.micBtn.classList.add('rec');
    el.micLabel.textContent = t().micStop;
    el.status.textContent = t().listening;
  }
  function stopRec() {
    recognizing = false;
    if (recognition) { try { recognition.stop(); } catch (x) {} }
    el.micBtn.classList.remove('rec');
    el.micLabel.textContent = t().micStart;
    el.status.textContent = ' ';
  }

  el.micBtn.addEventListener('click', function () {
    if (recognizing) stopRec(); else startRec();
  });

  // ---- Language toggle --------------------------------------------------
  el.langBtn.addEventListener('click', function () {
    lang = lang === 'es' ? 'en' : 'es';
    params.set('lang', lang);
    history.replaceState(null, '', BASE + (lang === 'es' ? '?lang=es' : ''));
    applyLang();
  });

  // ---- Send to intake ---------------------------------------------------
  el.sendBtn.addEventListener('click', function () {
    var d = t();
    var transcript = (el.transcript.value || '').trim();
    var token = getToken();
    el.result.style.color = '#ef4444';
    if (!transcript) { el.result.textContent = d.emptyTranscript; return; }
    if (!token) {
      // No session and nothing pasted — reveal the fallback field and prompt.
      el.tokenWrap.style.display = 'block';
      el.result.textContent = d.tokenHint;
      el.token.focus();
      return;
    }

    if (recognizing) stopRec();
    el.sendBtn.disabled = true;
    el.sendBtn.textContent = d.sending;

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ transcript: transcript, lang: lang, created_at: new Date().toISOString() })
    }).then(function (r) {
      return r.json().then(function (body) { return { ok: r.ok, status: r.status, body: body }; });
    }).then(function (res) {
      el.sendBtn.disabled = false;
      el.sendBtn.textContent = d.sendLabel;
      if (res.ok) {
        var fs = res.body.forward_status === 'forwarded' ? d.forwarded : d.mocked;
        el.result.style.color = 'var(--green)';
        el.result.textContent = d.sent + res.body.id + ' · ' + fs;
        el.transcript.value = '';
        committed = '';
      } else if (res.status === 401) {
        el.result.textContent = d.errorAuth;
      } else {
        el.result.textContent = (res.body && res.body.error) ? res.body.error : d.errorGeneric;
      }
    }).catch(function () {
      el.sendBtn.disabled = false;
      el.sendBtn.textContent = d.sendLabel;
      el.result.textContent = d.errorGeneric;
    });
  });

  applyLang();
})();
