/* PLANEA — shared chrome: top bar + left drawer nav + Maya floating button.
   Injected on every module screen so all pages stay identical. */
(function () {
  'use strict';
  var BASE = '/planea/portal/';
  var ITEMS = [
    { k: 'inicio', label: 'Inicio', icon: 'M3 10.5 12 3l9 7.5|M5 9.5V21h14V9.5' },
    { k: 'diagnostico', label: 'Mi Puntaje', icon: 'circle:12,12,9|M12 7v5l3 2' },
    { k: 'patrimonio', label: 'Mi Patrimonio', icon: 'M3 21h18|M6 21V10M11 21V6M16 21V12M21 21V8' },
    { k: 'metas', label: 'Mis metas', icon: 'circle:12,12,9|circle:12,12,4.5|circle:12,12,0.8' },
    { k: 'ahorro', label: 'Ahorro', module: true, icon: 'M19 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2|M15 12h7v4h-7a2 2 0 0 1 0-4Z' },
    { k: 'deuda', label: 'Deuda', module: true, icon: 'rect:2.5,6,19,13,2.5|M2.5 10.5h19|M6 15.5h4' },
    { k: 'inversion', label: 'Inversión', module: true, icon: 'M3 17l6-6 4 4 8-8|M15 7h6v6' },
    { k: 'seguros', label: 'Seguros', module: true, icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z|M9 12l2 2 4-4' },
    { k: 'retiro', label: 'Retiro', module: true, icon: 'circle:12,12,9|M12 7v5l3 3' },
    { k: 'cuentas', label: 'Cuentas vinculadas', icon: 'rect:2.5,6,19,13,2.5|M2.5 10.5h19' },
    { k: 'maya', label: 'Planea IA', icon: 'M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z', plus: true, action: 'maya' },
    { k: 'guia', label: 'Guía de uso', icon: 'M12 6.5V21|M12 6.5C10 5 6 4.5 4 5v13c2-.5 6 0 8 1.5|M12 6.5C14 5 18 4.5 20 5v13c-2-.5-6 0-8 1.5' },
    { k: 'mas', label: 'Más', icon: 'M4 7h16M4 12h16M4 17h16' }
  ];

  function svg(path) {
    var parts = path.split('|'), inner = '';
    parts.forEach(function (p) {
      if (p.indexOf('circle:') === 0) { var c = p.slice(7).split(','); inner += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"' + (c[2] === '0.8' ? ' fill="currentColor"' : '') + '/>'; }
      else if (p.indexOf('rect:') === 0) { var r = p.slice(5).split(','); inner += '<rect x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="' + r[4] + '"/>'; }
      else inner += '<path d="' + p + '"/>';
    });
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  // ── Module state (which optional modules are active) ────────────────────────
  // Persisted per user in Supabase persons.progress_data.modules ({key:bool}),
  // mirrored to localStorage for instant nav render. Drives which module tabs
  // appear in the drawer. Default = all 5 ON (matches "5 de 7 activos").
  var MODULE_KEYS = ['ahorro', 'deuda', 'inversion', 'seguros', 'retiro'];
  var SBU = 'https://mfxujzvvrnsbiqcefvtg.supabase.co';
  var SBK = 'sb_publishable_0dMP5Pof56t9H4fyCNJn9Q_NKGuorXc';
  var LS_MODULES = 'planea-modules';

  function mSession() {
    try {
      var key = null;
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k)) { key = k; break; } }
      if (!key) return null;
      var o = JSON.parse(localStorage.getItem(key));
      var s = o && o.access_token ? o : (o && o.currentSession) ? o.currentSession : null;
      return s && s.access_token ? s : null;
    } catch (e) { return null; }
  }
  function mReq(method, pq, body) {
    var s = mSession(); if (!s) return Promise.reject(new Error('no session'));
    var h = { apikey: SBK, Authorization: 'Bearer ' + s.access_token, Accept: 'application/json' };
    if (body != null) h['Content-Type'] = 'application/json';
    if (method === 'PATCH') h.Prefer = 'return=representation';
    return fetch(SBU + '/rest/v1/' + pq, { method: method, headers: h, body: body != null ? JSON.stringify(body) : undefined })
      .then(function (r) { if (!r.ok) throw new Error('sb ' + r.status); return r.status === 204 ? null : r.json(); });
  }
  function readCache() { try { return JSON.parse(localStorage.getItem(LS_MODULES)) || null; } catch (e) { return null; } }
  function writeCache(m) { try { localStorage.setItem(LS_MODULES, JSON.stringify(m)); } catch (e) {} }
  function activeSet() {
    var c = readCache(); if (c) return c;
    var d = {}; MODULE_KEYS.forEach(function (k) { d[k] = true; }); return d;
  }
  function isActive(k) { return activeSet()[k] !== false; }
  function activeCount() { var s = activeSet(); return MODULE_KEYS.filter(function (k) { return s[k] !== false; }).length; }

  function syncModulesFromDB() {
    if (!mSession()) return Promise.resolve();
    return mReq('GET', 'persons?select=progress_data&limit=1').then(function (rows) {
      var pd = (rows && rows[0] && rows[0].progress_data) || {};
      if (pd && pd.modules && typeof pd.modules === 'object') {
        var norm = {}; MODULE_KEYS.forEach(function (k) { norm[k] = pd.modules[k] !== false; });
        writeCache(norm);
        try { window.dispatchEvent(new CustomEvent('planea:modules', { detail: norm })); } catch (e) {}
      }
      return pd;
    }).catch(function () {});
  }
  function setModule(k, on) {
    if (MODULE_KEYS.indexOf(k) < 0) return Promise.resolve();
    var m = activeSet(); m[k] = !!on; writeCache(m);
    try { window.dispatchEvent(new CustomEvent('planea:modules', { detail: m })); } catch (e) {}
    if (!mSession()) return Promise.resolve(m);
    // merge into progress_data so we never clobber other keys
    return mReq('GET', 'persons?select=id,user_id,progress_data&limit=1').then(function (rows) {
      var row = (rows && rows[0]) || {}; var pd = row.progress_data || {};
      pd.modules = m;
      var uid = row.user_id;
      return mReq('PATCH', 'persons?' + (uid ? 'user_id=eq.' + uid : 'id=eq.' + row.id), { progress_data: pd });
    }).catch(function (e) { if (window.console) console.warn('[modules] save failed', e && e.message); return m; });
  }
  window.PlaneaModules = {
    keys: MODULE_KEYS, isActive: isActive, activeSet: activeSet, activeCount: activeCount,
    setModule: setModule, reload: syncModulesFromDB
  };

  var LOGO = '<svg viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M13 2 L24 20 L14.5 20 L14.5 11 Z" fill="currentColor"/><path d="M11.5 6.5 L11.5 20 L2 20 Z" fill="currentColor"/></svg>';
  // New Planea brand: white horizontal lockup (mark + wordmark). Inverts to ink on light theme via CSS.
  var LOGO_IMG = '<img src="' + BASE + 'planea-logo-white.png" alt="Planea" class="pl-logo-img">';
  var MARK_IMG = '<img src="' + BASE + 'planea-mark-white.png" alt="" class="pl-mark-img">';
  var current = (location.pathname.split('/').pop() || 'inicio').replace('.html', '');

  function build() {
    // Theme
    try { if (localStorage.getItem('planea-theme') === 'light') document.body.classList.add('light'); } catch (e) {}
    var isLight = document.body.classList.contains('light');

    // Top bar
    var top = document.createElement('div');
    top.className = 'topbar';
    top.innerHTML =
      '<button class="iconbtn" id="pl-menu" aria-label="Menú"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>' +
      '<span class="brand">' + LOGO_IMG + '</span><span class="sp"></span>' +
      '<button class="iconbtn" id="pl-theme" aria-label="Cambiar tema"></button>';
    document.body.insertBefore(top, document.body.firstChild);

    // Scrim + drawer
    var scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.id = 'pl-scrim';
    var d = document.createElement('aside'); d.className = 'drawer'; d.id = 'pl-drawer';
    function navHtml() {
      return ITEMS.filter(function (it) { return !it.module || isActive(it.k); }).map(function (it) {
        var on = (it.k === current) ? ' on' : '';
        var href = it.action === 'maya' ? '#' : BASE + it.k;
        var plus = it.plus ? '<span class="plus">+</span>' : '';
        return '<a href="' + href + '"' + (it.action ? ' data-action="' + it.action + '"' : '') + ' class="' + on.trim() + '">' + svg(it.icon) + it.label + plus + '</a>';
      }).join('');
    }
    d.innerHTML =
      '<div class="dbrand">' + LOGO_IMG + '</div>' +
      '<nav class="dnav">' + navHtml() + '</nav>' +
      '<div class="dsep"></div>' +
      '<button class="dbtn" id="pl-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Agregar módulo</button>' +
      '<button class="dbtn solid" id="pl-install" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>Instalar Planea</button>' +
      '<button class="dbtn solid" id="pl-theme2"></button>' +
      '<div class="dprofile"><span class="av">MS</span><div><div class="nm">Manuel Stagg</div><div class="pl">Plan activo</div></div></div>' +
      '<button class="dbtn" id="pl-logout" style="margin-top:10px;color:var(--red);border-color:rgba(200,107,79,.35)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>Cerrar sesión</button>';
    document.body.appendChild(scrim);
    document.body.appendChild(d);

    // Maya button
    var maya = document.createElement('button');
    maya.className = 'chatbot';
    maya.setAttribute('aria-label', 'Abrir chat con Maya, tu guía financiera IA');
    maya.innerHTML = '<span class="orbe"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" fill="#16373A"/><circle cx="18.5" cy="17.5" r="2" fill="#16373A"/></svg></span><span class="txt"><span class="t1">Pregúntale a Maya</span><span class="t2">Tu guía financiera IA</span></span>';
    document.body.appendChild(maya);

    // Wiring
    function openD() { scrim.classList.add('open'); d.classList.add('open'); }
    function closeD() { scrim.classList.remove('open'); d.classList.remove('open'); }
    document.getElementById('pl-menu').addEventListener('click', openD);
    scrim.addEventListener('click', closeD);
    function themeLabel() {
      var light = document.body.classList.contains('light');
      var sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
      var moon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z"/></svg>';
      document.getElementById('pl-theme').innerHTML = light ? moon : sun;
      var t2 = document.getElementById('pl-theme2');
      t2.innerHTML = (light ? moon : sun) + (light ? 'Modo oscuro' : 'Modo claro');
    }
    function toggleTheme() {
      document.body.classList.toggle('light');
      try { localStorage.setItem('planea-theme', document.body.classList.contains('light') ? 'light' : 'dark'); } catch (e) {}
      themeLabel();
    }
    document.getElementById('pl-theme').addEventListener('click', toggleTheme);
    document.getElementById('pl-theme2').addEventListener('click', toggleTheme);
    document.getElementById('pl-add').addEventListener('click', function () { location.href = BASE + 'configuracion'; });
    // Maya links (drawer + anywhere) are handled by the global [data-action="maya"]
    // delegate in maya-chat.js, so a single click opens Maya once (no double-toggle).

    // Live-update the drawer module tabs when the user flips a toggle in Configuración
    // or when the DB sync lands. Re-render only the <nav> so state/handlers stay intact.
    var dnavEl = d.querySelector('.dnav');
    function renderNav() { if (dnavEl) dnavEl.innerHTML = navHtml(); }
    window.addEventListener('planea:modules', renderNav);
    syncModulesFromDB(); // pull the authoritative set from the DB, then re-render via event
    // Logout: clear the Supabase session + local tokens, back to login.
    document.getElementById('pl-logout').addEventListener('click', function () {
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (/^sb-.*-auth-token$/.test(k) || k === 'token' || k === 'planea-profile') localStorage.removeItem(k);
        }
      } catch (e) {}
      // Clear OUR backend session (HttpOnly JWT + readable hint cookie), then go.
      var done = function () { location.href = '/planea/login'; };
      try {
        fetch('/planea/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).then(done, done);
      } catch (e) { done(); }
    });
    themeLabel();
    initPWA();
  }

  // ── PWA: manifest + icons + service worker + install prompt ──
  function initPWA() {
    function head(tag, attrs) { var el = document.createElement(tag); for (var k in attrs) el.setAttribute(k, attrs[k]); document.head.appendChild(el); }
    // Fraunces display serif (Planea brand headings) — injected once, applies site-wide
    head('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500&display=swap' });
    head('link', { rel: 'manifest', href: '/planea/portal/manifest.webmanifest' });
    head('meta', { name: 'theme-color', content: '#0a1310' });
    head('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    head('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
    head('meta', { name: 'apple-mobile-web-app-title', content: 'Planea' });
    head('link', { rel: 'apple-touch-icon', href: '/planea/portal/apple-touch-icon.png' });
    head('link', { rel: 'icon', type: 'image/png', href: '/planea/portal/icon-192.png' });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/planea/portal/sw.js').catch(function () {});
    }
    var installBtn = document.getElementById('pl-install'), deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; if (installBtn) installBtn.style.display = 'flex'; });
    if (installBtn) installBtn.addEventListener('click', function () { if (deferred) { deferred.prompt(); deferred = null; installBtn.style.display = 'none'; } });
    window.addEventListener('appinstalled', function () { if (installBtn) installBtn.style.display = 'none'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
