/* AutoDev — install to the home screen, and say so once.
 *
 * The app was installable for months and never offered: Chrome fires `beforeinstallprompt` and
 * does nothing visible unless a page catches it, and iPhone Safari never fires it at all. So
 * this shows a bar with a real Install button where the browser supports one, and the Share ->
 * Add to Home Screen wording where it does not. It is DISMISSED FOR 14 DAYS on a No thanks, and
 * never drawn at all inside the installed app, so the one place it would be pointless.
 */
(function () {
  'use strict';
  var KEY = 'speakup_install_dismissed';
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) { document.documentElement.setAttribute('data-standalone', '1'); return; }
  var dismissedUntil = 0;
  try { dismissedUntil = parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) {}
  if (Date.now() < dismissedUntil) return;

  var lang = (function () { try { return localStorage.getItem('speakup_lang') || 'es'; } catch (e) { return 'es'; } })();
  var L = function (es, en) { return lang === 'en' ? en : es; };
  var deferred = null, bar = null;

  function dismiss() {
    try { localStorage.setItem(KEY, String(Date.now() + 14 * 24 * 3600 * 1000)); } catch (e) {}
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
  }
  function show(kind) {
    if (bar || document.getElementById('installBar')) return;
    bar = document.createElement('div');
    bar.id = 'installBar';
    bar.className = 'installbar';
    var text = kind === 'ios'
      ? L('Instálala: toca Compartir y luego “Añadir a pantalla de inicio”.', 'Install it: tap Share, then “Add to Home Screen”.')
      : L('Instala AutoDev en tu teléfono.', 'Install AutoDev on your phone.');
    bar.innerHTML = '<span class="itxt"></span>' +
      (kind === 'prompt' ? '<button class="btn small primary" id="installYes"></button>' : '') +
      '<button class="btn small" id="installNo"></button>';
    document.body.appendChild(bar);
    bar.querySelector('.itxt').textContent = text;
    if (kind === 'prompt') bar.querySelector('#installYes').textContent = L('Instalar', 'Install');
    bar.querySelector('#installNo').textContent = L('Ahora no', 'Not now');
    bar.querySelector('#installNo').addEventListener('click', dismiss);
    var yes = bar.querySelector('#installYes');
    if (yes) yes.addEventListener('click', async function () {
      if (!deferred) return dismiss();
      yes.disabled = true;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) {}
      deferred = null;
      dismiss();
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    show('prompt');
  });
  window.addEventListener('appinstalled', dismiss);

  // iPhone and iPad Safari: no event exists, so the instructions are the offer.
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var safari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|Android/.test(navigator.userAgent);
  if (ios && safari) setTimeout(function () { show('ios'); }, 1200);

  document.addEventListener('speakup:lang', function (e) {
    lang = (e && e.detail) || lang;
    if (bar) { var k = bar.querySelector('#installYes') ? 'prompt' : 'ios'; dismissKeepCount(); show(k); }
  });
  // Relabelling means redrawing, but a language switch must not count as "not now".
  function dismissKeepCount() { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); bar = null; }
})();
