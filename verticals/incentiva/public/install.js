/* BuyersLine install + service worker registration.
   - Registers the worker only in a top-level window (a framed page gets a partitioned worker that controls nothing).
   - Android/desktop Chrome: shows an Install banner when the browser offers it.
   - iPhone Safari: shows how to add to the Home Screen (iOS has no install prompt).
   - Dismissal is remembered for 14 days; nothing shows once installed. */
(function () {
  'use strict';
  var BASE = window.BL_BASE || '';
  var KEY = 'incentiva_install_dismissed';
  var framed = false;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }

  if (!framed && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(BASE + '/sw.js', { scope: BASE + '/' }).catch(function () { /* the site still works without it */ });
    });
  }

  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (framed || standalone || document.body.hasAttribute('data-no-install')) return;
  function dismissedRecently() {
    try { var t = Number(localStorage.getItem(KEY)); return t && (Date.now() - t) < 14 * 864e5; } catch (e) { return false; }
  }
  if (dismissedRecently()) return;

  var TEXT = {
    en: { title: 'Install BuyersLine', body: 'Keep your search and report one tap away.', install: 'Install', later: 'Not now',
      ios: 'Tap the Share button, then "Add to Home Screen".' },
    es: { title: 'Instale BuyersLine', body: 'Tenga su búsqueda y su informe a un toque.', install: 'Instalar', later: 'Ahora no',
      ios: 'Toque el botón Compartir y luego "Agregar a pantalla de inicio".' }
  };
  function tx() { return TEXT[(document.documentElement.lang || 'en').slice(0, 2) === 'es' ? 'es' : 'en']; }

  var deferred = null, bar = null;
  function show(ios) {
    if (bar) return;
    var T = tx();
    bar = document.createElement('div');
    bar.className = 'install-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', T.title);
    var img = document.createElement('img'); img.src = BASE + '/icon-192.png'; img.alt = ''; img.width = 40; img.height = 40;
    var textBox = document.createElement('div'); textBox.className = 'install-text';
    var strong = document.createElement('strong'); strong.textContent = T.title;
    var p = document.createElement('span'); p.textContent = ios ? T.ios : T.body;
    textBox.appendChild(strong); textBox.appendChild(p);
    var actions = document.createElement('div'); actions.className = 'install-actions';
    if (!ios) {
      var go = document.createElement('button'); go.type = 'button'; go.className = 'btn btn-primary btn-small'; go.textContent = T.install;
      go.addEventListener('click', function () {
        if (!deferred) return hide(false);
        deferred.prompt();
        deferred.userChoice.finally(function () { deferred = null; hide(false); });
      });
      actions.appendChild(go);
    }
    var later = document.createElement('button'); later.type = 'button'; later.className = 'btn btn-ghost btn-small'; later.textContent = T.later;
    later.addEventListener('click', function () { hide(true); });
    actions.appendChild(later);
    bar.appendChild(img); bar.appendChild(textBox); bar.appendChild(actions);
    document.body.appendChild(bar);
    document.body.classList.add('has-install-bar');
  }
  function hide(remember) {
    if (remember) { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ } }
    if (bar) { bar.remove(); bar = null; }
    document.body.classList.remove('has-install-bar');
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; show(false); });
  window.addEventListener('appinstalled', function () { hide(true); });

  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (isIOS && isSafari) setTimeout(function () { show(true); }, 6000);
})();
