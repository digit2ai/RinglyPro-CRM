/* Shared top menu bar for the Voice-to-Intake app.
   Links: Voz a Recepción (index) · Intercom · Calendar.
   Preserves the champion ?c= code and ?lang= across navigation. Bilingual (es default). */
(function () {
  var base = window.__VTI_BASE || '/voice-to-intake-transcript-direct-pipeli/';
  var params = new URLSearchParams(location.search);
  var lang = params.get('lang') === 'en' ? 'en' : 'es';

  // Preserve champion code + language on every link.
  var keep = new URLSearchParams();
  if (params.get('c')) keep.set('c', params.get('c'));
  if (params.get('lang')) keep.set('lang', params.get('lang'));
  var suffix = keep.toString() ? ('?' + keep.toString()) : '';

  var items = [
    { key: 'reception', href: base + suffix, es: 'Voz a Recepción', en: 'Voice Reception' },
    { key: 'intercom', href: base + 'intercom.html' + suffix, es: 'Intercom', en: 'Intercom' },
    { key: 'calendar', href: base + 'calendar.html' + suffix, es: 'Calendario', en: 'Calendar' }
  ];
  var active = window.__D2_NAV_ACTIVE || '';

  var css = document.createElement('style');
  css.textContent =
    '.d2-topnav{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:0 auto 18px;max-width:672px;padding:0 4px}' +
    '.d2-navlink{font:600 13px/1 ui-sans-serif,system-ui,-apple-system,sans-serif;padding:10px 15px;border-radius:999px;' +
    'color:#8a98b0;background:#141b29;border:1px solid #243049;text-decoration:none;white-space:nowrap;transition:all .15s}' +
    '.d2-navlink:hover{color:#e9eef7;border-color:#6a4bff}' +
    '.d2-navlink.active{color:#fff;background:linear-gradient(135deg,#6a4bff,#4b32c9);border-color:#6a4bff;box-shadow:0 6px 18px rgba(106,75,255,.35)}';
  document.head.appendChild(css);

  var nav = document.createElement('nav');
  nav.className = 'd2-topnav';
  nav.setAttribute('aria-label', 'Primary');
  items.forEach(function (it) {
    var a = document.createElement('a');
    a.href = it.href;
    a.textContent = it[lang];
    a.className = 'd2-navlink' + (it.key === active ? ' active' : '');
    nav.appendChild(a);
  });

  function mount() {
    var target = document.getElementById('d2-nav-mount');
    if (target) target.appendChild(nav);
    else if (document.body) document.body.insertBefore(nav, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
