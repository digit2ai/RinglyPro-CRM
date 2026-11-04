/* Synthex SAI Discovery: the top menu lives behind a hamburger at EVERY width.
   The existing <nav> node is moved, not copied, so handlers already bound to
   its links (e.g. #out, sign out) keep working. */
(function () {
  var bar = document.querySelector('.nav .wrap');
  var nav = bar && bar.querySelector('nav');
  if (!nav || nav.hasAttribute('data-no-menu')) return;
  document.querySelector('.nav').classList.add('has-menu');

  var home = document.createElement('a');
  home.href = 'https://synthexsai.com/';
  home.className = 'sx-home';
  home.textContent = 'Synthex SAI · Inicio';
  nav.appendChild(home);

  nav.id = 'sxMenu';
  nav.setAttribute('aria-label', 'Menú');
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sx-burger';
  btn.setAttribute('aria-controls', 'sxMenu');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'Abrir menú');
  btn.innerHTML = '<span></span><span></span><span></span>';
  bar.appendChild(btn);

  function set(open) {
    document.documentElement.classList.toggle('sx-menu-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    if (open) { var f = nav.querySelector('a,button'); if (f) f.focus({ preventScroll: true }); }
  }
  var isOpen = function () { return btn.getAttribute('aria-expanded') === 'true'; };
  btn.addEventListener('click', function (e) { e.stopPropagation(); set(!isOpen()); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a,button')) set(false); });
  document.addEventListener('click', function (e) { if (isOpen() && !nav.contains(e.target)) set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { set(false); btn.focus(); } });
})();
