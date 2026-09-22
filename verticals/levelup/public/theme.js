/* LevelUp theme toggle. Light is the default; dark is an explicit choice
   remembered per device (key lu_theme). An inline <head> script applies a
   saved "dark" before paint, so there is no flash. */
(function () {
  'use strict';
  var KEY = 'lu_theme';
  function current() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function sync() {
    var t = current(), es = (document.documentElement.lang || 'en').slice(0, 2) === 'es';
    var label = t === 'dark' ? (es ? 'Cambiar a modo claro' : 'Switch to light mode') : (es ? 'Cambiar a modo oscuro' : 'Switch to dark mode');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#1B1730' : '#FFFFFF');
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (b) { b.setAttribute('aria-label', label); b.title = label; });
  }
  function set(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) { /* private mode */ }
    sync();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
    if (b) set(current() === 'dark' ? 'light' : 'dark');
  });
  if (window.MutationObserver) new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  window.LevelUpTheme = { set: set, current: current };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
})();
