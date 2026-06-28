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
  // Default to Spanish; English only when explicitly requested (?lang=en).
  var lang = params.get('lang') === 'en' ? 'en' : 'es';

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
    fileInput: document.getElementById('fileInput'),
    attachBtn: document.getElementById('attachBtn'),
    attachHint: document.getElementById('attachHint'),
    attachList: document.getElementById('attachList'),
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
    pocHeading: document.getElementById('pocHeading'),
    enableNotif: document.getElementById('enableNotif'),
    champBanner: document.getElementById('champBanner'),
    champBannerText: document.getElementById('champBannerText'),
    champBannerBtn: document.getElementById('champBannerBtn')
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
      // Intentionally KEEP ?c= in the URL. Installed PWAs get storage isolated
      // from Safari, so the code must arrive via the launch URL — the manifest
      // start_url carries it (server-rendered), and leaving it on the visible
      // URL also covers older iOS that snapshots the page URL on "Add to Home
      // Screen". Re-capturing the same code each cold start is idempotent.
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
    if (el.inboxTabLabel) el.inboxTabLabel.textContent = inboxView ? d.intakeTab : d.inboxTab;
    if (el.inboxHeading) el.inboxHeading.textContent = d.inboxTitle;
    if (el.inboxSub) el.inboxSub.textContent = d.inboxSub;
    if (el.pocHeading) el.pocHeading.textContent = d.pocHeading;
    if (el.intercomInput) el.intercomInput.placeholder = d.intercomPlaceholder;
    if (el.intercomSend) { el.intercomSend.title = d.intercomSend; el.intercomSend.setAttribute('aria-label', d.intercomSend); }
    if (el.inboxView && el.inboxView.style.display === 'block') {
      if (typeof renderInbox === 'function') renderInbox(inboxItems);
      if (typeof fetchIntercom === 'function') fetchIntercom();
    }
    if (el.attachBtn) el.attachBtn.textContent = d.attachLabel;
    if (el.attachHint) el.attachHint.textContent = d.attachHint;
    if (typeof renderAttachList === 'function') renderAttachList();
    if (typeof updateNotifBtn === 'function') updateNotifBtn();
    if (typeof updateChampBanner === 'function') updateChampBanner();
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
    // Spanish is the default (no param); only English carries ?lang=en.
    // Preserve any other params (e.g. the champion ?c= code).
    if (lang === 'en') params.set('lang', 'en'); else params.delete('lang');
    var qs = params.toString();
    history.replaceState(null, '', BASE + (qs ? '?' + qs : ''));
    applyLang();
  });

  // ---- Send to intake ---------------------------------------------------
  // ---- Attachments (PDF / Word / text …) --------------------------------
  var ALLOWED_EXT = ['txt', 'md', 'pdf', 'doc', 'docx', 'csv', 'rtf'];
  var MAX_FILE_BYTES = 10 * 1024 * 1024;
  var MAX_FILES = 5;
  var selectedFiles = [];
  function extOf(name) { var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
  function fmtSize(n) { n = Number(n) || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
  function renderAttachList() {
    var d = t();
    if (!el.attachList) return;
    el.attachList.innerHTML = '';
    selectedFiles.forEach(function (f, i) {
      var row = document.createElement('div');
      row.className = 'flex items-center justify-between rounded-lg px-3 py-2 mb-1 text-sm';
      row.style.cssText = 'background:var(--bg2);border:1px solid var(--line)';
      var name = document.createElement('span');
      name.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px';
      name.textContent = f.name + '  (' + fmtSize(f.size) + ')';
      var rm = document.createElement('button');
      rm.type = 'button'; rm.textContent = '✕'; rm.title = d.attachRemove || 'Remove';
      rm.style.cssText = 'color:var(--mut);flex:0 0 auto;font-weight:700;cursor:pointer';
      rm.addEventListener('click', function () { selectedFiles.splice(i, 1); renderAttachList(); });
      row.appendChild(name); row.appendChild(rm); el.attachList.appendChild(row);
    });
  }
  function addFiles(fileList) {
    var d = t();
    el.result.style.color = '#ef4444';
    var msgs = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      if (selectedFiles.length >= MAX_FILES) { msgs.push(d.attachTooMany || 'Up to 5 files.'); break; }
      if (ALLOWED_EXT.indexOf(extOf(f.name)) === -1) { msgs.push(f.name + ' ' + (d.attachBadType || 'not supported.')); continue; }
      if (f.size > MAX_FILE_BYTES) { msgs.push(f.name + ' ' + (d.attachTooBig || 'too large.')); continue; }
      if (selectedFiles.some(function (x) { return x.name === f.name && x.size === f.size; })) continue; // dedupe
      selectedFiles.push(f);
    }
    renderAttachList();
    el.result.textContent = msgs.length ? msgs.join(' ') : '';
  }
  if (el.attachBtn) el.attachBtn.addEventListener('click', function () { el.fileInput.click(); });
  if (el.fileInput) el.fileInput.addEventListener('change', function () { addFiles(el.fileInput.files || []); el.fileInput.value = ''; });

  el.sendBtn.addEventListener('click', function () {
    var d = t();
    var transcript = (el.transcript.value || '').trim();
    var token = getToken();
    el.result.style.color = '#ef4444';
    if (!transcript && !selectedFiles.length) { el.result.textContent = d.emptyTranscript; return; }
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

    // multipart so files ride along; let the browser set the boundary header.
    var fd = new FormData();
    fd.append('transcript', transcript);
    fd.append('lang', lang);
    fd.append('created_at', new Date().toISOString());
    selectedFiles.forEach(function (f) { fd.append('attachments', f, f.name); });

    fetch(API, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: fd
    }).then(function (r) {
      return r.json().then(function (body) { return { ok: r.ok, status: r.status, body: body }; });
    }).then(function (res) {
      el.sendBtn.disabled = false;
      el.sendBtn.textContent = d.sendLabel;
      if (res.ok) {
        var fs = res.body.forward_status === 'forwarded' ? d.forwarded : d.mocked;
        var nAtt = (res.body.attachments && res.body.attachments.length) || 0;
        el.result.style.color = 'var(--green)';
        el.result.textContent = d.sent + res.body.id + ' · ' + fs + (nAtt ? ' · ' + nAtt + ' ' + (d.attachAdded || 'attached') : '');
        el.transcript.value = '';
        committed = '';
        selectedFiles = [];
        renderAttachList();
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
    // Intercom = full WhatsApp-style window: hide the logo + title + subtitle
    // header so the chat is the whole view. The intake (Send a request) view
    // keeps them.
    var brandLogo = document.getElementById('brandLogo');
    if (brandLogo) brandLogo.style.display = showInbox ? 'none' : 'flex';
    if (el.h1) el.h1.style.display = showInbox ? 'none' : 'block';
    if (el.subtitle) el.subtitle.style.display = showInbox ? 'none' : 'block';
    // The toggle button always offers the OTHER page (Intercom <-> Send a request).
    if (el.inboxTabLabel) el.inboxTabLabel.textContent = showInbox ? t().intakeTab : t().inboxTab;
    if (showInbox) setBadge(0);   // entering the chat clears the unread count
    fetchInbox();                 // PoC links live on the intake view — keep them fresh
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
        renderInbox(inboxItems);
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
    // Newest first — the most recent PoC link always sits on top.
    var sorted = items.slice().sort(function (a, b) {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
    sorted.forEach(function (it) {
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
    // (Badge reflects unread Intercom messages, driven by pollUnread.)
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
    if (!getToken()) { var si = document.createElement('div'); si.className = 'text-sm'; si.style.color = '#667781'; si.textContent = d.inboxSignIn; el.intercomThread.appendChild(si); return; }
    if (!messages || !messages.length) {
      var em = document.createElement('div'); em.className = 'text-sm'; em.style.color = '#667781';
      em.textContent = d.intercomEmpty; el.intercomThread.appendChild(em); return;
    }
    messages.forEach(function (m) {
      var mine = m.sender === 'champion';
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;margin-bottom:6px;justify-content:' + (mine ? 'flex-end' : 'flex-start');
      var bub = document.createElement('div');
      // WhatsApp light: outgoing = green (#d9fdd3), incoming = white. Dark text on both.
      bub.style.cssText = 'max-width:80%;padding:6px 9px 7px;border-radius:7.5px;font-size:14px;color:#111b21;box-shadow:0 1px .5px rgba(0,0,0,.13);' +
        (mine ? 'background:#d9fdd3;border-top-right-radius:2px' : 'background:#fff;border-top-left-radius:2px');
      var who = document.createElement('div');
      who.style.cssText = 'font-size:11px;color:#667781;margin-bottom:2px;font-weight:600';
      who.textContent = (mine ? d.youLabel : d.ownerLabel) + ' · ' + fmtTime(m.created_at);
      var txt = document.createElement('div'); txt.style.cssText = 'white-space:pre-wrap;word-wrap:break-word'; txt.textContent = m.body;
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
      .then(function (data) { renderThread((data && data.messages) || []); setBadge(0); setAppBadge(0); })
      .catch(function () {});
  }

  // Home-screen icon badge (installed PWA, iOS 16.4+ / desktop). No-op elsewhere.
  function setAppBadge(n) {
    try {
      if (navigator.setAppBadge) {
        if (n > 0) navigator.setAppBadge(n);
        else if (navigator.clearAppBadge) navigator.clearAppBadge();
      }
    } catch (e) {}
  }

  // Is the signed-in user the owner (Digit2Ai team)? Owners badge with the count
  // of unread CHAMPION messages; champions badge with unread OWNER messages.
  var isOwner = false;
  function refreshWhoami() {
    var token = getToken();
    if (!token) return Promise.resolve();
    return fetch(API_INTERCOM + '/whoami', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { isOwner = !!(d && d.isOwner); })
      .catch(function () {});
  }

  function pollUnread() {
    var token = getToken();
    if (!token) return;
    var url = isOwner ? (API_INTERCOM + '/threads/unread') : (API_INTERCOM + '/me/unread');
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (data) {
        var n = (data && (isOwner ? data.total_unread : data.unread)) || 0;
        if (!inboxView) setBadge(n);
        setAppBadge(n);
      })
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

  el.intercomSend.addEventListener('click', function () { ensurePush(); sendIntercom(); });
  el.intercomInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ensurePush(); sendIntercom(); } });

  // ---- PWA push: badge the installed home-screen icon for new messages ----
  var SW_URL = BASE + 'sw.js';
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(SW_URL, { scope: BASE }).catch(function () {});
  }
  // VAPID key is fetched on demand (not just once at load) so a stale/early page
  // that booted before push was enabled can still subscribe on the next tap.
  var vapidKey = null;
  function getVapidKey() {
    if (vapidKey) return Promise.resolve(vapidKey);
    return fetch(API_INTERCOM + '/vapid-public-key', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.enabled && d.key) vapidKey = d.key; return vapidKey; })
      .catch(function () { return null; });
  }
  getVapidKey(); // prime it

  // iOS only exposes Push/Notification inside an installed (standalone) PWA.
  function isStandalone() {
    return (window.navigator.standalone === true) ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function isiOS() { return /iP(hone|ad|od)/.test(navigator.userAgent); }
  function pushSupported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }

  function urlB64ToUint8Array(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base); var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  var pushTried = false;
  // Must be called from a user gesture (iOS requires it for Notification permission).
  // Fetches the VAPID key on demand, so it no longer silently no-ops when the key
  // wasn't ready at page load. Returns a promise so the button can show status.
  function ensurePush() {
    var token = getToken();
    if (!token) return Promise.resolve();
    if (!pushSupported()) return Promise.resolve();
    if (Notification.permission === 'denied') return Promise.resolve();
    if (pushTried && Notification.permission === 'granted') return Promise.resolve();
    pushTried = true;
    return getVapidKey().then(function (key) {
      if (!key) { pushTried = false; return; }
      return Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') { pushTried = false; return; }
        return navigator.serviceWorker.ready.then(function (reg) {
          return reg.pushManager.getSubscription().then(function (sub) {
            return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
          }).then(function (sub) {
            var subUrl = isOwner ? (API_INTERCOM + '/owner/subscribe') : (API_INTERCOM + '/subscribe');
            return fetch(subUrl, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify({ subscription: sub })
            });
          });
        });
      });
    }).catch(function () { pushTried = false; });
  }

  // "Enable notifications" button — reflects permission state; one tap subscribes.
  function updateNotifBtn() {
    var d = t();
    if (!el.enableNotif) return;
    if (!getToken()) { el.enableNotif.style.display = 'none'; return; }
    // iOS: push only works in the installed PWA. If we're in Safari (not standalone)
    // and Push isn't exposed, guide the user to open from the Home Screen icon.
    if (!pushSupported()) {
      if (isiOS() && !isStandalone()) {
        el.enableNotif.style.display = 'block';
        el.enableNotif.textContent = d.notifNeedInstall || 'Open from your Home Screen icon to enable alerts';
        el.enableNotif.style.opacity = '0.85';
        el.enableNotif.disabled = true;
      } else {
        el.enableNotif.style.display = 'none';
      }
      return;
    }
    var perm = Notification.permission;
    if (perm === 'granted') {
      el.enableNotif.style.display = 'block';
      el.enableNotif.textContent = d.notifOn;
      el.enableNotif.style.opacity = '0.6';
      el.enableNotif.disabled = true;
    } else if (perm === 'denied') {
      el.enableNotif.style.display = 'block';
      el.enableNotif.textContent = d.notifBlocked;
      el.enableNotif.style.opacity = '0.6';
      el.enableNotif.disabled = true;
    } else {
      el.enableNotif.style.display = 'block';
      el.enableNotif.textContent = d.enableNotif;
      el.enableNotif.style.opacity = '1';
      el.enableNotif.disabled = false;
    }
  }
  if (el.enableNotif) {
    el.enableNotif.addEventListener('click', function () {
      if (el.enableNotif.disabled) return;
      var d = t();
      el.enableNotif.textContent = d.notifEnabling || 'Turning on alerts…';
      el.enableNotif.style.opacity = '0.7';
      Promise.resolve(ensurePush()).then(updateNotifBtn).catch(updateNotifBtn);
    });
  }

  // Champion home-screen / alerts nudge on the main view. Shows install steps in
  // Safari, an enable button once installed, nothing once alerts are on.
  function updateChampBanner() {
    if (!el.champBanner) return;
    var d = t();
    // Only nudge champions (magic-link users); owners are redirected to the console.
    if (isOwner || !championCode) { el.champBanner.style.display = 'none'; return; }
    if (!pushSupported()) {
      if (isiOS() && !isStandalone()) {
        el.champBanner.style.display = 'block';
        el.champBannerText.textContent = d.bannerInstall;
        el.champBannerBtn.style.display = 'none';
      } else {
        el.champBanner.style.display = 'none';
      }
      return;
    }
    var perm = Notification.permission;
    if (perm === 'granted') { el.champBanner.style.display = 'none'; return; }
    el.champBanner.style.display = 'block';
    if (perm === 'denied') {
      el.champBannerText.textContent = d.bannerBlocked;
      el.champBannerBtn.style.display = 'none';
    } else {
      el.champBannerText.textContent = d.bannerEnable;
      el.champBannerBtn.style.display = 'block';
      el.champBannerBtn.textContent = d.bannerEnableBtn;
    }
  }
  if (el.champBannerBtn) {
    el.champBannerBtn.addEventListener('click', function () {
      el.champBannerBtn.textContent = (t().notifEnabling || 'Turning on alerts…');
      Promise.resolve(ensurePush()).then(updateChampBanner).catch(updateChampBanner);
    });
  }

  el.inboxBtn.addEventListener('click', function () { ensurePush(); setView(!inboxView); updateNotifBtn(); });
  el.inboxRefresh.addEventListener('click', function () { fetchInbox(); fetchIntercom(); });

  // Opening the Intercom tab loads the chat (marks read) + the PoC links.
  var _setView = setView;
  setView = function (showInbox) { _setView(showInbox); if (showInbox) fetchIntercom(); };

  // Prime the unread badge on load and poll for new messages + ready teasers.
  if (getToken()) {
    refreshWhoami().then(function () {
      // Owners belong in the WhatsApp-style Intercom console (champion list +
      // chat + icon badge). Same PWA/origin, so the CRM session carries over.
      if (isOwner && !/[?&]stay=1/.test(location.search)) { location.replace(BASE + 'intercom.html'); return; }
      pollUnread();
      updateChampBanner();
      // Champions land on Intercom by default (the chat). They tap "Send a
      // request" to reach the Voice-to-Intake form + their PoC links.
      setView(true);
    });
    fetchInbox();
    setInterval(function () { pollUnread(); fetchInbox(); if (inboxView) fetchIntercom(); }, 8000);
    // Refresh the badge immediately when the champion returns to the app/tab.
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { pollUnread(); updateChampBanner(); if (inboxView) fetchIntercom(); } });
    window.addEventListener('focus', pollUnread);
  }

  applyLang();
})();
