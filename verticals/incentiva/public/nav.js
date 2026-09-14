/* BuyersLine mobile menu. Below 820px the header nav is hidden; this adds a
   44px menu button that opens the same links as a drop-down panel. One nav
   element serves desktop and phone, so the two can never list different links. */
(function () {
  'use strict';
  var nav = document.querySelector('.site-nav');
  var tools = document.querySelector('.header-tools');
  if (!nav || !tools) return;
  nav.id = nav.id || 'siteNav';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-burger';
  btn.setAttribute('aria-controls', nav.id);
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span class="nav-burger-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
  tools.insertBefore(btn, tools.firstChild);

  var scrim = document.createElement('div');
  scrim.className = 'nav-scrim';
  scrim.hidden = true;
  document.body.appendChild(scrim);

  function label() {
    var es = (document.documentElement.lang || 'en').slice(0, 2) === 'es';
    var open = document.body.classList.contains('nav-open');
    btn.setAttribute('aria-label', open ? (es ? 'Cerrar menú' : 'Close menu') : (es ? 'Abrir menú' : 'Open menu'));
  }
  function setOpen(open) {
    document.body.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    scrim.hidden = !open;
    label();
  }
  btn.addEventListener('click', function () { setOpen(!document.body.classList.contains('nav-open')); });
  scrim.addEventListener('click', function () { setOpen(false); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { setOpen(false); btn.focus(); } });
  window.addEventListener('resize', function () { if (window.innerWidth >= 820) setOpen(false); });
  if (window.MutationObserver) new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  label();
})();
