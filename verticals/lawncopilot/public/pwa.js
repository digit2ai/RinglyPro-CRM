/* Registers the app service worker and offers the install prompt.
   Kept tiny and deferred so it never delays first paint. */
(function () {
  'use strict';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      // On lawncopilot.com the app is at the root; under aiagent it is at
      // /lawncopilot. Derive both from where this script was actually served.
      var base = (location.pathname.indexOf('/lawncopilot/') === 0 ||
                  location.pathname === '/lawncopilot') ? '/lawncopilot' : '';
      navigator.serviceWorker.register(base + '/sw.js', { scope: base + '/' })
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
