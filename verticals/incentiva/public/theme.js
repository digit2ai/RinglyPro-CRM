/* BuyersLine theme toggle. Dark is the default; light is an explicit choice
   remembered per device. The <html data-theme="dark"> attribute ships in the
   markup and a tiny inline script in <head> applies a saved "light" before the
   stylesheet paints, so there is no flash. This file only wires the buttons. */
(function () {
  'use strict';
  var KEY = 'incentiva_theme';
  var GROUND = { dark: '#0E1719', light: '#F4F7F6' };
  var LABELS = {
    en: { toLight: 'Switch to light mode', toDark: 'Switch to dark mode' },
    es: { toLight: 'Cambiar a modo claro', toDark: 'Cambiar a modo oscuro' }
  };

  function current() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }

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
