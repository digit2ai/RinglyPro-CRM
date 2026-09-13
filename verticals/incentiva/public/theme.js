/* BuyersLine theme toggle. Light is the default; dark is an explicit choice
   remembered per device. The <html data-theme="light"> attribute ships in the
   markup and a tiny inline script in <head> applies a saved "dark" before the
   stylesheet paints, so there is no flash. This file only wires the buttons. */
(function () {
  'use strict';
  var KEY = 'incentiva_theme';
  var GROUND = { dark: '#1B1730', light: '#FFFFFF' };
  var LABELS = {
    en: { toLight: 'Switch to light mode', toDark: 'Switch to dark mode' },
    es: { toLight: 'Cambiar a modo claro', toDark: 'Cambiar a modo oscuro' }
  };

  function current() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

  function sync() {
    var theme = current();
    var lang = (document.documentElement.lang || 'en').slice(0, 2) === 'es' ? 'es' : 'en';
    var label = theme === 'dark' ? LABELS[lang].toLight : LABELS[lang].toDark;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', GROUND[theme]);
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (b) {
      b.setAttribute('aria-label', label);
      b.setAttribute('title', label);
      b.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    });
  }

  function set(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode: this visit only */ }
    sync();
    try { document.dispatchEvent(new CustomEvent('incentiva:theme', { detail: { theme: theme } })); } catch (e) { /* old browsers */ }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
    if (!btn) return;
    set(current() === 'dark' ? 'light' : 'dark');
  });

  // Labels follow the page language when the EN/ES toggle changes <html lang>.
  if (window.MutationObserver) {
    new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-theme'] });
  }
  window.BuyersLineTheme = { set: set, current: current };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
})();
