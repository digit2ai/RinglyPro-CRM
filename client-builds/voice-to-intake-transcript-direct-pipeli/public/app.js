// =====================================================
// Web Speech capture + lang toggle + fetch POST
//
// Progressive enhancement: the typed transcript is the guaranteed path; voice
// is layered on top via the browser SpeechRecognition API. When the API is
// undefined, the mic is disabled and a visible "not supported" hint shows.
// =====================================================
(function () {
  var DICT = window.I18N || {};
  // Mount base — prefer the server-injected absolute base; fall back to deriving
  // it from the path (works only when loaded with the trailing slash).
  var BASE = window.__VTI_BASE || window.location.pathname.replace(/\/[^/]*$/, '/');
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
    notSupportedHint: document.getElementById('notSupportedHint'),
    inboxBtn: document.getElementById('inboxBtn'),
    inboxBadge: document.getElementById('inboxBadge'),
    inboxTabLabel: document.getElementById('inboxTabLabel'),
    inboxView: document.getElementById('inboxView'),
    submitView: document.getElementById('submitView'),
    inboxList: document.getElementById('inboxList'),
    inboxHeading: document.getElementById('inboxHeading'),
    inboxSub: document.getElementById('inboxSub'),
    inboxRefresh: document.getElementById('inboxRefresh'),
    intercomThread: document.getElementById('intercomThread'),
    intercomInput: document.getElementById('intercomInput'),
    intercomSend: document.getElementById('intercomSend'),
    pocHeading: document.getElementById('pocHeading')
  };
  var API_INBOX = BASE + 'api/v1/inbox';
  var API_INTERCOM = BASE + 'api/v1/intercom';

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
  // Champion magic link: capture ?c=<code> once, persist it, and use it as the
  // credential. No CRM login needed — the code carries the champion's identity.
  function captureChampionCode() {
    var c = params.get('c');
    if (c) {
      try { localStorage.setItem('d2ai_champion_code', c); } catch (e) {}
      params.delete('c');
      history.replaceState(null, '', BASE + (lang === 'es' ? '?lang=es' : ''));
    }
    try { return localStorage.getItem('d2ai_champion_code') || null; } catch (e) { return null; }
  }
  var championCode = captureChampionCode();
  var sessionToken = detectSessionToken();
  // Champion code takes PRECEDENCE over any CRM session on this device, so a
  // champion link always acts as that champion (never leaks another inbox).
  function getToken() { return championCode || sessionToken || (el.token.value || '').trim(); }

  function championEmail() {
    if (!championCode) return null;
    try {
      var p = JSON.parse(atob(championCode.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.email || null;
    } catch (e) { return null; }
  }
  function clearChampion() {
    try { localStorage.removeItem('d2ai_champion_code'); } catch (e) {}
    championCode = null;
    location.href = BASE;
  }

  function championName() {
    if (!championCode) return null;
    try {
      var p = JSON.parse(atob(championCode.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return p.name || p.email || null;
    } catch (e) { return null; }
  }

  function renderAuth() {
    var d = t();
    if (championCode) {
      // Acting as a specific champion — show name + email so it's unambiguous.
      el.authStatus.style.display = 'block';
      el.authStatus.style.color = 'var(--green)';
      el.authStatus.innerHTML = '';
      var line = document.createElement('span');
      line.textContent = '● ' + (championName() || '') + ' · ' + (championEmail() || '') + ' ';
      var sw = document.createElement('a');
      sw.href = '#'; sw.textContent = '(' + d.switchChampion + ')';
      sw.style.cssText = 'color:var(--mut);text-decoration:underline';
      sw.addEventListener('click', function (ev) { ev.preventDefault(); clearChampion(); });
      el.authStatus.appendChild(line); el.authStatus.appendChild(sw);
      el.tokenWrap.style.display = 'none';
    } else if (sessionToken) {
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
    // Inbox static labels + re-render (localized share buttons).
    if (el.inboxTabLabel) el.inboxTabLabel.textContent = d.inboxTab;
    if (el.inboxHeading) el.inboxHeading.textContent = d.inboxTitle;
    if (el.inboxSub) el.inboxSub.textContent = d.inboxSub;
    if (el.pocHeading) el.pocHeading.textContent = d.pocHeading;
    if (el.intercomInput) el.intercomInput.placeholder = d.intercomPlaceholder;
    if (el.intercomSend) el.intercomSend.textContent = d.intercomSend;
    if (el.inboxView && el.inboxView.style.display === 'block') {
      if (typeof renderInbox === 'function') renderInbox(inboxItems);
      if (typeof fetchIntercom === 'function') fetchIntercom();
    }
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
        // New request submitted — refresh the inbox now and again as the PoC
        // teaser finishes generating in the background.
        if (typeof fetchInbox === 'function') {
          fetchInbox();
          setTimeout(fetchInbox, 8000);
          setTimeout(fetchInbox, 20000);
        }
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

  // ---- Champion Inbox: PoC teaser magic links ---------------------------
  var inboxItems = [];
  var inboxEmail = null;
  var inboxView = false;

  function setView(showInbox) {
    inboxView = showInbox;
    el.inboxView.style.display = showInbox ? 'block' : 'none';
    el.submitView.style.display = showInbox ? 'none' : 'block';
    if (showInbox) fetchInbox();
  }

  function setBadge(n) {
    if (n > 0) { el.inboxBadge.textContent = n > 99 ? '99+' : String(n); el.inboxBadge.style.display = 'flex'; }
    else { el.inboxBadge.style.display = 'none'; }
  }

  function fetchInbox() {
    var token = getToken();
    if (!token) { renderInbox(null); return; }
    fetch(API_INBOX, { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : { items: [], badge: 0 }; })
      .then(function (data) {
        inboxItems = (data && data.items) || [];
        inboxEmail = (data && data.email) || null;
        if (inboxView) renderInbox(inboxItems);
      }).catch(function () {});
  }

  function fmtDate(s) { try { return new Date(s).toLocaleDateString(); } catch (e) { return ''; } }

  function renderInbox(items) {
    var d = t();
    el.inboxList.innerHTML = '';
    if (!getToken()) {
      var si = document.createElement('div'); si.className = 'text-sm'; si.style.color = 'var(--mut)';
      si.textContent = d.inboxSignIn; el.inboxList.appendChild(si); return;
    }
    if (inboxEmail) {
      var scope = document.createElement('div');
      scope.className = 'text-xs mono mb-3'; scope.style.color = 'var(--mut)';
      scope.textContent = d.inboxOf + ' ' + inboxEmail;
      el.inboxList.appendChild(scope);
    }
    if (!items || !items.length) {
      var em = document.createElement('div'); em.className = 'text-sm'; em.style.color = 'var(--mut)';
      em.textContent = d.inboxEmpty; el.inboxList.appendChild(em); return;
    }
    items.forEach(function (it) {
      var card = document.createElement('div');
      card.className = 'rounded-xl p-3 mb-3';
      card.style.cssText = 'background:var(--bg2);border:1px solid var(--line)';

      var title = document.createElement('div');
      title.className = 'font-semibold mb-1'; title.textContent = it.title || '—';
      card.appendChild(title);

      var meta = document.createElement('div');
      meta.className = 'text-xs mono mb-2'; meta.style.color = 'var(--mut)';
      var bits = [fmtDate(it.created_at)];
      if (it.fit_score != null) bits.push(d.fitLabel + ' ' + it.fit_score + '/10');
      meta.textContent = bits.filter(Boolean).join(' · ');
      card.appendChild(meta);

      if (!it.teaser_ready) {
        var prep = document.createElement('div');
        prep.className = 'text-sm'; prep.style.color = 'var(--mut)';
        prep.textContent = '⏳ ' + d.pocPreparing;
        card.appendChild(prep);
      } else {
        var ready = document.createElement('div');
        ready.className = 'text-sm mb-2'; ready.style.color = 'var(--green)';
        ready.textContent = '● ' + d.pocReady + (it.shared ? ' · ' + d.sharedTag : '');
        card.appendChild(ready);

        var msg = d.shareMsg + it.teaser_url;
        var row = document.createElement('div');
        row.className = 'flex flex-wrap gap-2';

        var wa = document.createElement('a');
        wa.href = 'https://wa.me/?text=' + encodeURIComponent(msg);
        wa.target = '_blank'; wa.rel = 'noopener';
        wa.className = 'text-sm px-3 py-1 rounded-lg font-semibold';
        wa.style.cssText = 'background:#25D366;color:#06281c';
        wa.textContent = d.shareWhatsapp;
        wa.addEventListener('click', function () { markShared(it); });
        row.appendChild(wa);

        var sms = document.createElement('a');
        sms.href = 'sms:?&body=' + encodeURIComponent(msg);
        sms.className = 'text-sm px-3 py-1 rounded-lg font-semibold';
        sms.style.cssText = 'background:var(--acc);color:#fff';
        sms.textContent = d.shareSms;
        sms.addEventListener('click', function () { markShared(it); });
        row.appendChild(sms);

        var open = document.createElement('a');
        open.href = it.teaser_url; open.target = '_blank'; open.rel = 'noopener';
        open.className = 'text-sm px-3 py-1 rounded-lg border';
        open.style.cssText = 'border-color:var(--line);color:var(--txt)';
        open.textContent = d.openPoc;
        row.appendChild(open);

        var copy = document.createElement('button');
        copy.className = 'text-sm px-3 py-1 rounded-lg border';
        copy.style.cssText = 'border-color:var(--line);color:var(--txt)';
        copy.textContent = d.copyLink;
        copy.addEventListener('click', function () {
          var done = function () { copy.textContent = d.copied; setTimeout(function () { copy.textContent = d.copyLink; }, 1500); markShared(it); };
          if (navigator.clipboard) navigator.clipboard.writeText(it.teaser_url).then(done, done); else done();
        });
        row.appendChild(copy);

        card.appendChild(row);
      }
      el.inboxList.appendChild(card);
    });
  }

  function markShared(it) {
    if (it.shared) return;
    it.shared = true;
    var ready = inboxItems.filter(function (x) { return x.teaser_ready && !x.shared; }).length;
    setBadge(ready);
    var token = getToken();
    if (!token) return;
    fetch(API_INBOX + '/' + it.project_id + '/shared', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }
    }).catch(function () {});
  }

  // ---- Intercom chat (champion <-> owner) -------------------------------
  function fmtTime(s) { try { return new Date(s).toLocaleString(); } catch (e) { return ''; } }

  function renderThread(messages) {
    var d = t();
    el.intercomThread.innerHTML = '';
    if (!getToken()) { el.intercomThread.textContent = d.inboxSignIn; return; }
    if (!messages || !messages.length) {
      var em = document.createElement('div'); em.className = 'text-sm'; em.style.color = 'var(--mut)';
      em.textContent = d.intercomEmpty; el.intercomThread.appendChild(em); return;
    }
    messages.forEach(function (m) {
      var mine = m.sender === 'champion';
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;margin-bottom:8px;justify-content:' + (mine ? 'flex-end' : 'flex-start');
      var bub = document.createElement('div');
      bub.style.cssText = 'max-width:80%;padding:8px 10px;border-radius:12px;font-size:14px;' +
        (mine ? 'background:var(--acc);color:#fff' : 'background:#1b2536;color:var(--txt);border:1px solid var(--line)');
      var who = document.createElement('div');
      who.style.cssText = 'font-size:11px;opacity:.7;margin-bottom:2px';
      who.textContent = (mine ? d.youLabel : d.ownerLabel) + ' · ' + fmtTime(m.created_at);
      var txt = document.createElement('div'); txt.textContent = m.body;
      bub.appendChild(who); bub.appendChild(txt); wrap.appendChild(bub);
      el.intercomThread.appendChild(wrap);
    });
    el.intercomThread.scrollTop = el.intercomThread.scrollHeight;
  }

  function fetchIntercom() {
    var token = getToken();
    if (!token) { renderThread(null); return; }
    fetch(API_INTERCOM + '/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : { messages: [] }; })
      .then(function (data) { renderThread((data && data.messages) || []); setBadge(0); })
      .catch(function () {});
  }

  function pollUnread() {
    var token = getToken();
    if (!token) return;
    fetch(API_INTERCOM + '/me/unread', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : { unread: 0 }; })
      .then(function (data) { if (!inboxView) setBadge((data && data.unread) || 0); })
      .catch(function () {});
  }

  function sendIntercom() {
    var token = getToken();
    var body = (el.intercomInput.value || '').trim();
    if (!token || !body) return;
    el.intercomInput.value = '';
    fetch(API_INTERCOM + '/me', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ body: body })
    }).then(function () { fetchIntercom(); }).catch(function () {});
  }

  el.intercomSend.addEventListener('click', sendIntercom);
  el.intercomInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendIntercom(); } });

  el.inboxBtn.addEventListener('click', function () { setView(!inboxView); });
  el.inboxRefresh.addEventListener('click', function () { fetchInbox(); fetchIntercom(); });

  // Opening the Intercom tab loads the chat (marks read) + the PoC links.
  var _setView = setView;
  setView = function (showInbox) { _setView(showInbox); if (showInbox) fetchIntercom(); };

  // Prime the unread badge on load and poll for new messages + ready teasers.
  if (getToken()) {
    pollUnread();
    fetchInbox();
    setInterval(function () { pollUnread(); if (inboxView) { fetchInbox(); fetchIntercom(); } }, 8000);
    // Refresh the badge immediately when the champion returns to the app/tab.
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { pollUnread(); if (inboxView) fetchIntercom(); } });
    window.addEventListener('focus', pollUnread);
  }

  applyLang();
})();
