/* Registers the app service worker and offers the install prompt.
   Kept tiny and deferred so it never delays first paint. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/lawncopilot/sw.js', { scope: '/lawncopilot/' })
        .catch(function () { /* offline support is a bonus, never a blocker */ });
    });
  }

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    var bar = document.getElementById('installbar');
    if (bar) bar.classList.add('is-on');
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('#installbtn');
    if (!b || !deferred) return;
    deferred.prompt();
    deferred = null;
    var bar = document.getElementById('installbar');
    if (bar) bar.classList.remove('is-on');
  });
})();
