/* Landing: the theme toggle, the language switch and the mobile drawer.
   Nothing here fetches a vital, so nothing here can show one. */
(function () {
  'use strict';
  var KEY = 'marapet_theme', LKEY = 'marapet_lang';

  function store(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#14171a' : '#ffffff');
    store(KEY, t);
  }
  window.mpSetTheme = setTheme;

  function setLang(l) {
    var lang = l === 'es' ? 'es' : 'en';
    document.documentElement.setAttribute('lang', lang);
    var nodes = document.querySelectorAll('[data-en]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var txt = n.getAttribute('data-' + lang);
      if (txt != null) n.textContent = txt;
    }
    var ph = document.querySelectorAll('[data-ph-en]');
    for (var j = 0; j < ph.length; j++) {
      var v = ph[j].getAttribute('data-ph-' + lang);
      if (v != null) ph[j].setAttribute('placeholder', v);
    }
    var btns = document.querySelectorAll('[data-lang-btn]');
    for (var k = 0; k < btns.length; k++) {
      btns[k].setAttribute('aria-pressed', String(btns[k].getAttribute('data-lang-btn') === lang));
    }
    store(LKEY, lang);
    // Keep Mara (the chat orb) in the same language: Dalia in Spanish, Ava in English.
    if (window.D2AIVoiceOrb && window.D2AIVoiceOrb.setLang) window.D2AIVoiceOrb.setLang(lang);
  }
  window.mpSetLang = setLang;

  document.addEventListener('DOMContentLoaded', function () {
    var saved = read(LKEY);
    if (saved) setLang(saved);
    else if ((navigator.language || '').toLowerCase().indexOf('es') === 0) setLang('es');

    var nav = document.querySelector('.mp-nav');
    var burger = document.querySelector('.mp-burger');
    if (burger && nav) {
      burger.addEventListener('click', function () {
        var open = nav.classList.toggle('mp-nav--open');
        burger.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', function (e) {
        if (!nav.contains(e.target)) {
          nav.classList.remove('mp-nav--open');
          burger.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          nav.classList.remove('mp-nav--open');
          burger.setAttribute('aria-expanded', 'false');
        }
      });
      // Without this an X-shaped burger is stranded on a desktop with nothing
      // left to close.
      window.addEventListener('resize', function () {
        if (window.innerWidth > 760) {
          nav.classList.remove('mp-nav--open');
          burger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    var t = document.querySelector('[data-theme-toggle]');
    if (t) t.addEventListener('click', function () {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });

    var ls = document.querySelectorAll('[data-lang-btn]');
    for (var i = 0; i < ls.length; i++) {
      ls[i].addEventListener('click', function () { setLang(this.getAttribute('data-lang-btn')); });
    }
  });
}());
