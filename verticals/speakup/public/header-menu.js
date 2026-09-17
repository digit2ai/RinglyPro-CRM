/* SpeakUp — the header menu, shared by both screens.
 *
 * ONE SET OF CONTROLS, MOVED — NOT A SECOND COPY. The repo label, the language toggle and
 * Sign out live in a single `#hdrMenu` node: a flex row inside the bar on a desktop, and an
 * absolutely-positioned panel under the bar on a phone. A drawer built from duplicate markup
 * is how the two eventually disagree about what they offer, so there is only ever one.
 *
 * Behaviour lives here rather than in console.js and meetings.js, for the same reason.
 */
(function () {
  'use strict';
  var burger = document.getElementById('burger');
  var menu = document.getElementById('hdrMenu');
  if (!burger || !menu) return;

  function close() { menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
  function open() { menu.classList.add('open'); burger.setAttribute('aria-expanded', 'true'); }
  function isOpen() { return menu.classList.contains('open'); }

  burger.addEventListener('click', function (e) { e.stopPropagation(); if (isOpen()) close(); else open(); });
  // Anything chosen inside closes it — including the language toggle, which only relabels.
  menu.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a,button')) close(); });
  document.addEventListener('click', function (e) { if (isOpen() && !menu.contains(e.target) && e.target !== burger) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { close(); burger.focus(); } });
  // Past the breakpoint the panel becomes a row again; leaving it "open" would strand the
  // X-shaped burger on a desktop where there is nothing to close.
  window.addEventListener('resize', function () { if (window.innerWidth > 700 && isOpen()) close(); });

  close();

  // THE THREE MENU ENTRIES EVERY SCREEN SHARES — History, New meeting, Settings. Labelled here
  // once rather than in each page's own language code, so a screen cannot forget one. A page
  // announces a language change with the 'speakup:lang' event; on load the stored choice is used.
  var NAV = { navHistory: ['Historial', 'History'], navNew: ['Nueva reunión', 'New meeting'], navSettings: ['Ajustes', 'Settings'] };
  function relabel(l) {
    for (var id in NAV) { var el = document.getElementById(id); if (el) el.textContent = l === 'en' ? NAV[id][1] : NAV[id][0]; }
  }
  var stored = 'es';
  try { stored = localStorage.getItem('speakup_lang') || 'es'; } catch (e) {}
  relabel(stored);
  document.addEventListener('speakup:lang', function (e) { relabel(e.detail); });
})();
