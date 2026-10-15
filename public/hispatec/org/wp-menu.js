/* Mobile menu button for the copied hispanotec.org header (see wp-menu.css). */
(function () {
  var widget = document.querySelector('.elementor-widget-nav-menu');
  var drop = widget && widget.querySelector('.elementor-nav-menu--dropdown.elementor-nav-menu__container');
  if (!widget || !drop) return;
  var host = widget.querySelector('.elementor-widget-container') || widget;
  host.style.position = 'relative';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hx-burger-wp';
  btn.setAttribute('aria-label', 'Menú');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span></span><span></span><span></span>';
  host.insertBefore(btn, host.firstChild);
  var head = document.querySelector('[data-elementor-type="header"]');
  function set(open) {
    if (open && head) document.documentElement.style.setProperty('--hx-wp-head', Math.round(head.getBoundingClientRect().bottom) + 'px');
    widget.classList.toggle('hx-menu-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    drop.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  btn.addEventListener('click', function () { set(!widget.classList.contains('hx-menu-open')); });
  drop.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  document.addEventListener('click', function (e) { if (!widget.contains(e.target)) set(false); });
})();
