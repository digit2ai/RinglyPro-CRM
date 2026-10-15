/* HISPANOTEC shared header: the burger opens the same menu node the desktop
   bar shows, so the two can never offer different links. */
(function () {
  var btn = document.getElementById('hxBurger');
  var menu = document.getElementById('hxMenu');
  if (!btn || !menu) return;
  function set(open) {
    menu.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }
  btn.addEventListener('click', function () { set(!menu.classList.contains('open')); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  window.addEventListener('resize', function () { if (window.innerWidth > 1380) set(false); });
})();
