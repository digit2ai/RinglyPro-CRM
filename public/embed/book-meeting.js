/*
 * Digit2AI "Book a meeting" embed. Dependency-free, no build step.
 *
 *   <div data-d2-book></div>
 *   <script src="https://aiagent.ringlypro.com/embed/book-meeting.js" defer></script>
 *
 * Any element carrying data-d2-book opens the booking window when clicked. An EMPTY
 * element is filled with a default pill button; an element that already has content
 * (a site's own <a class="btn">) keeps its look and only gains the click.
 *
 * Window: 1) three days of free times from the Digit2AI Projects calendar,
 * 2) name, email, phone, company, 3) booked + SendGrid confirmation email.
 * It talks to /api/synthex-lina/public/slots|book (same free-slot rule as /mcp,
 * Lina and synthexsai.com, so nothing can double-book).
 *
 * Attributes (on the element):
 *   data-lang    es | en | auto (default auto: follows <html lang>, live, then the browser)
 *   data-brand   digit2ai (default) | synthex   — wording of the calendar entry + email
 *   data-source  short label of where it was booked (default: this page's host + path)
 *   data-label   custom button text for an empty element (one text for both languages)
 * Script tag:    data-api="https://origin" to override the API origin (default: this script's own origin)
 */
(function () {
  if (window.D2Book) return;
  var me = document.currentScript || (function () { var s = document.querySelectorAll('script[src*="book-meeting.js"]'); return s[s.length - 1]; })();
  var API = (me && me.getAttribute('data-api')) || (me && me.src ? new URL(me.src, location.href).origin : '');
  API = API.replace(/\/+$/, '');

  var TX = {
    es: { btn: 'Agendar una reunión', steps: ['1 · Horario', '2 · Sus datos', '3 · Listo'], t1: 'Agende su reunión',
      s1: 'Elija el día y la hora que mejor le queden. Horas en su zona horaria', loading: 'Cargando horarios disponibles…',
      none: 'No hay horarios libres en este momento. Escríbanos a info@digit2ai.com y le contactamos.',
      t2: 'Sus datos', s2: 'Le enviaremos la confirmación por correo.', name: 'Nombre y apellido *', email: 'Correo *',
      phone: 'Teléfono / WhatsApp *', company: 'Empresa', back: 'Cambiar horario', go: 'Confirmar reunión',
      consent: function (b) { return 'Al confirmar, acepta que el equipo de ' + b + ' le contacte por correo o teléfono sobre su reunión.'; },
      check: 'Revise los campos marcados.', booking: 'Agendando…', taken: 'Ese horario se acaba de ocupar. Elija otro.',
      many: 'Demasiados intentos. Espere unos minutos.', fail: 'No se pudo agendar. Revise sus datos e intente de nuevo.',
      thanks: function (n) { return '¡Muchas gracias, ' + n + '!'; }, had: 'Ya tenía una reunión agendada para el ',
      done: 'Su reunión quedó agendada para el ',
      mail: function (e) { return 'Va a recibir un correo de confirmación en ' + e + ' con la invitación para su calendario. Si no lo ve, revise su carpeta de correo no deseado.'; },
      nomail: function (b) { return 'El equipo de ' + b + ' le contactará para confirmar.'; }, close: 'Cerrar', x: 'Cerrar' },
    en: { btn: 'Book a meeting', steps: ['1 · Time', '2 · Your details', '3 · Done'], t1: 'Book your meeting',
      s1: 'Pick the day and time that suits you. Times in your time zone', loading: 'Loading available times…',
      none: 'No times are free right now. Write to info@digit2ai.com and we will contact you.',
      t2: 'Your details', s2: 'We will email you the confirmation.', name: 'Full name *', email: 'Email *',
      phone: 'Phone / WhatsApp *', company: 'Company', back: 'Change time', go: 'Confirm meeting',
      consent: function (b) { return 'By confirming, you agree that the ' + b + ' team may contact you by email or phone about your meeting.'; },
      check: 'Please check the highlighted fields.', booking: 'Booking…', taken: 'That time was just taken. Please pick another.',
      many: 'Too many attempts. Please wait a few minutes.', fail: 'Could not book. Check your details and try again.',
      thanks: function (n) { return 'Thank you so much, ' + n + '!'; }, had: 'You already had a meeting booked for ',
      done: 'Your meeting is booked for ',
      mail: function (e) { return 'You will receive a confirmation email at ' + e + ' with a calendar invite. If you do not see it, check your spam folder.'; },
      nomail: function (b) { return 'The ' + b + ' team will contact you to confirm.'; }, close: 'Close', x: 'Close' }
  };

  var CSS = '' +
    '.d2b-btn{display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 24px;border:0;border-radius:999px;cursor:pointer;' +
    'background:linear-gradient(90deg,#22d3ee,#67e8f9);color:#04222a;font:700 17px "Space Grotesk",Inter,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;' +
    'box-shadow:0 10px 36px rgba(34,211,238,.32);transition:transform .15s,box-shadow .2s}' +
    '.d2b-btn:hover{transform:translateY(-2px);box-shadow:0 14px 44px rgba(34,211,238,.42)}.d2b-btn:focus-visible{outline:2px solid #fff;outline-offset:3px}' +
    '.d2b-ov{position:fixed;inset:0;z-index:2147483100;background:rgba(4,7,15,.78);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.d2b-ov[hidden]{display:none}' +
    '.d2b{--cy:#22d3ee;--vi:#8b5cf6;--txt:#eaf0fb;--mut:#9db0cc;--l2:rgba(120,150,200,.28);width:min(720px,100%);max-height:calc(100dvh - 32px);overflow:auto;' +
    'background:#131e33;border:1px solid var(--l2);border-radius:20px;box-shadow:0 30px 90px rgba(0,0,0,.6);position:relative;padding:26px 24px 22px;' +
    'font:15px/1.4 Inter,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:var(--txt);text-align:left;box-sizing:border-box}' +
    '.d2b *{box-sizing:border-box}' +
    '.d2b::before{content:"";position:absolute;left:24px;right:24px;top:0;height:3px;background:linear-gradient(90deg,var(--cy),var(--vi));border-radius:3px}' +
    '.d2b-x{position:absolute;top:10px;right:10px;width:44px;height:44px;border-radius:12px;border:1px solid var(--l2);background:transparent;color:var(--txt);font-size:22px;cursor:pointer}' +
    '.d2b h3{font:700 24px "Space Grotesk",Inter,system-ui,sans-serif;margin:0 44px 4px 0;color:var(--txt)}' +
    '.d2b .d2b-sub{color:var(--mut);font-size:15px;line-height:1.5;margin:0 0 16px}' +
    '.d2b .d2b-fine{color:var(--mut);font-size:13px;line-height:1.5;margin:12px 0 0}' +
    '.d2b-steps{display:flex;flex-wrap:wrap;gap:12px;margin:0 48px 16px 0;font:12px ui-monospace,Menlo,monospace;letter-spacing:1.5px;text-transform:uppercase}' +
    '.d2b-steps span{color:var(--mut)}.d2b-steps span.on{color:var(--cy)}' +
    '.d2b-days{display:grid;gap:12px;grid-template-columns:repeat(3,1fr)}' +
    '.d2b-day{background:#0b1222;border:1px solid var(--l2);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px}' +
    '.d2b-day b{font-size:15px}' +
    '.d2b-t{min-height:44px;border-radius:12px;border:1px solid var(--l2);background:transparent;color:var(--txt);font:600 15px Inter,system-ui,sans-serif;cursor:pointer}' +
    '.d2b-t:hover,.d2b-t:focus-visible{border-color:var(--cy)}' +
    '.d2b-pick{margin:4px 0 14px;padding:12px 14px;border-radius:12px;border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.07);font-weight:600}' +
    '.d2b-f{display:grid;gap:12px;grid-template-columns:1fr 1fr}' +
    '.d2b-f label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--mut)}' +
    '.d2b-f input{min-height:48px;border-radius:12px;border:1px solid var(--l2);background:#070b16;color:var(--txt);padding:0 14px;font:16px Inter,system-ui,sans-serif;width:100%}' +
    '.d2b-f input.bad{border-color:#f87171}' +
    '.d2b-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;align-items:center}' +
    '.d2b-b{min-height:46px;padding:0 20px;border-radius:999px;border:1px solid var(--l2);background:transparent;color:var(--txt);font:700 15px "Space Grotesk",Inter,system-ui,sans-serif;cursor:pointer}' +
    '.d2b-b.pri{background:linear-gradient(90deg,#22d3ee,#67e8f9);color:#04222a;border:0}.d2b-b:disabled{opacity:.55;cursor:default}' +
    '.d2b-err{color:#fca5a5;font-size:14px;margin-top:10px}' +
    '.d2b-ok{text-align:center;padding:10px 4px}' +
    '.d2b-ic{width:64px;height:64px;border-radius:50%;margin:4px auto 14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#22d3ee,#8b5cf6);color:#04222a;font-size:30px;font-weight:700}' +
    '@media(max-width:640px){.d2b-days{grid-template-columns:1fr}.d2b-f{grid-template-columns:1fr}.d2b{padding:22px 16px 18px}.d2b h3{font-size:21px}}';

  function pageLang() {
    var l = (document.documentElement.getAttribute('lang') || '').slice(0, 2).toLowerCase();
    if (l === 'es' || l === 'en') return l;
    return /^es/i.test(navigator.language || '') ? 'es' : 'en';
  }
  function langOf(el) { var a = (el && el.getAttribute('data-lang') || 'auto').toLowerCase(); return a === 'es' || a === 'en' ? a : pageLang(); }

  var ov, body, last, cur = { lang: 'es', brand: 'digit2ai', source: '' };
  var st = { days: null, start: null, minutes: 60 };
  var saved = { nombre: '', email: '', telefono: '', empresa: '' };
  var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  function T() { return TX[cur.lang]; }
  function brandName() { return cur.brand === 'synthex' ? 'Synthex SAI' : 'Digit2AI'; }
  function loc() { return cur.lang === 'en' ? 'en-US' : 'es'; }
  function cap(x) { return x.charAt(0).toUpperCase() + x.slice(1); }
  function fDay(iso) { return cap(new Intl.DateTimeFormat(loc(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))); }
  function fTime(iso) { return new Intl.DateTimeFormat(loc(), { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)); }
  function when(iso) { return new Intl.DateTimeFormat(loc(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso)) + ', ' + fTime(iso); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function build() {
    if (ov) return;
    if (!document.querySelector('style[data-d2b]')) { var s = document.createElement('style'); s.setAttribute('data-d2b', ''); s.textContent = CSS; document.head.appendChild(s); }
    ov = el('div', 'd2b-ov'); ov.hidden = true;
    var box = el('div', 'd2b'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'd2bTitle');
    var x = el('button', 'd2b-x', '×'); x.type = 'button'; x.id = 'd2bX'; x.addEventListener('click', close);
    body = el('div'); box.appendChild(x); box.appendChild(body); ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ['keydown', 'touchstart', 'touchend', 'wheel'].forEach(function (n) { ov.addEventListener(n, function (e) { e.stopPropagation(); }, { passive: true }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden) close(); });
    document.body.appendChild(ov);
  }
  function head(n, title, sub) {
    body.innerHTML = '';
    var s = el('div', 'd2b-steps'); T().steps.forEach(function (t, k) { s.appendChild(el('span', k + 1 === n ? 'on' : '', t)); }); body.appendChild(s);
    if (title) { var h = el('h3', null, title); h.id = 'd2bTitle'; body.appendChild(h); }
    if (sub) body.appendChild(el('p', 'd2b-sub', sub));
    ov.querySelector('.d2b-x').setAttribute('aria-label', T().x);
  }
  function stepTime() {
    head(1, T().t1, T().s1 + (tz ? ' (' + tz + ')' : '') + ' · ' + st.minutes + ' min.');
    if (!st.days) { body.appendChild(el('p', 'd2b-fine', T().loading)); return; }
    if (!st.days.length) { body.appendChild(el('p', 'd2b-fine', T().none)); return; }
    var g = el('div', 'd2b-days');
    st.days.forEach(function (d) {
      if (!d.slots || !d.slots.length) return;
      var c = el('div', 'd2b-day'); c.appendChild(el('b', null, fDay(d.slots[0])));
      d.slots.forEach(function (iso) {
        var b = el('button', 'd2b-t', fTime(iso)); b.type = 'button';
        b.addEventListener('click', function () { st.start = iso; stepDetails(); });
        c.appendChild(b);
      });
      g.appendChild(c);
    });
    body.appendChild(g);
  }
  function field(name, label, type, ac) {
    var l = el('label'); l.appendChild(document.createTextNode(label));
    var i = document.createElement('input'); i.name = name; i.type = type || 'text'; i.autocomplete = ac || 'off'; i.maxLength = 160; i.value = saved[name] || '';
    i.addEventListener('input', function () { saved[name] = i.value; i.classList.remove('bad'); });
    l.appendChild(i); return l;
  }
  function stepDetails() {
    head(2, T().t2, T().s2);
    body.appendChild(el('div', 'd2b-pick', cap(when(st.start))));
    var f = el('div', 'd2b-f');
    f.appendChild(field('nombre', T().name, 'text', 'name'));
    f.appendChild(field('email', T().email, 'email', 'email'));
    f.appendChild(field('telefono', T().phone, 'tel', 'tel'));
    f.appendChild(field('empresa', T().company, 'text', 'organization'));
    body.appendChild(f);
    var err = el('div', 'd2b-err'); err.setAttribute('role', 'status'); body.appendChild(err);
    var row = el('div', 'd2b-row');
    var back = el('button', 'd2b-b', T().back); back.type = 'button'; back.addEventListener('click', stepTime);
    var go = el('button', 'd2b-b pri', T().go); go.type = 'button';
    row.appendChild(back); row.appendChild(go); body.appendChild(row);
    body.appendChild(el('p', 'd2b-fine', T().consent(brandName())));
    setTimeout(function () { var i = body.querySelector('input[name=nombre]'); if (i) i.focus(); }, 30);
    go.addEventListener('click', function () {
      var bad = [];
      if (saved.nombre.trim().length < 2) bad.push('nombre');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(saved.email.trim())) bad.push('email');
      if (saved.telefono.replace(/\D/g, '').length < 7) bad.push('telefono');
      body.querySelectorAll('.d2b-f input').forEach(function (i) { i.classList.toggle('bad', bad.indexOf(i.name) !== -1); });
      if (bad.length) { err.textContent = T().check; return; }
      go.disabled = true; back.disabled = true; err.textContent = T().booking;
      fetch(API + '/api/synthex-lina/public/book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        brand: cur.brand, source: cur.source, nombre: saved.nombre.trim(), email: saved.email.trim(), telefono: saved.telefono.trim(),
        empresa: saved.empresa.trim(), start: st.start, lang: cur.lang, tz: tz }) })
        .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
        .then(function (x) {
          if (x.j.booked) return stepDone(x.j);
          go.disabled = false; back.disabled = false;
          if (x.j.error === 'slot_taken') { err.textContent = T().taken; st.days = null; st.start = null; load(); return; }
          if (x.s === 429) { err.textContent = T().many; return; }
          if (x.j.fields) body.querySelectorAll('.d2b-f input').forEach(function (i) { i.classList.toggle('bad', x.j.fields.indexOf(i.name) !== -1); });
          err.textContent = T().fail;
        })
        .catch(function () { go.disabled = false; back.disabled = false; err.textContent = T().fail; });
    });
  }
  function stepDone(j) {
    head(3);
    var ok = el('div', 'd2b-ok');
    ok.appendChild(el('div', 'd2b-ic', '✓'));
    var h = el('h3', null, T().thanks(saved.nombre.trim().split(' ')[0])); h.id = 'd2bTitle'; h.style.margin = '0 0 8px'; ok.appendChild(h);
    ok.appendChild(el('p', 'd2b-sub', (j.already ? T().had : T().done) + when(j.start) + '.'));
    ok.appendChild(el('p', 'd2b-sub', j.email_sent ? T().mail(saved.email.trim()) : T().nomail(brandName())));
    var c = el('button', 'd2b-b pri', T().close); c.type = 'button'; c.addEventListener('click', close); ok.appendChild(c);
    body.appendChild(ok);
  }
  function load() {
    stepTime();
    fetch(API + '/api/synthex-lina/public/slots').then(function (r) { return r.json(); }).then(function (j) {
      st.days = (j && j.ok && j.days) ? j.days : []; st.minutes = (j && j.minutes) || 60; stepTime();
    }).catch(function () { st.days = []; stepTime(); });
  }
  function open(trigger) {
    build();
    cur.lang = langOf(trigger);
    cur.brand = (trigger && trigger.getAttribute('data-brand')) === 'synthex' ? 'synthex' : 'digit2ai';
    cur.source = ((trigger && trigger.getAttribute('data-source')) || (location.hostname + location.pathname)).slice(0, 160);
    last = document.activeElement; ov.hidden = false; window.D2BOOK_OPEN = true;
    st.days = null; st.start = null; load();
    try { window.dispatchEvent(new CustomEvent('d2book:open')); } catch (e) {}
    setTimeout(function () { var x = document.getElementById('d2bX'); if (x) x.focus(); }, 30);
  }
  function close() {
    if (!ov) return;
    ov.hidden = true; window.D2BOOK_OPEN = false;
    try { window.dispatchEvent(new CustomEvent('d2book:close')); } catch (e) {}
    if (last && last.focus) last.focus();
  }

  // Empty triggers get the default pill; its label follows the page language live.
  function label(t) { if (t.hasAttribute('data-d2-book-auto')) t.textContent = (t.getAttribute('data-label') || TX[langOf(t)].btn) + ' →'; }
  function wire(t) {
    if (t.__d2b) return; t.__d2b = true;
    if (!t.children.length && !t.textContent.trim()) {
      var b = el('button', 'd2b-btn'); b.type = 'button';
      ['data-lang', 'data-brand', 'data-source', 'data-label'].forEach(function (a) { if (t.hasAttribute(a)) b.setAttribute(a, t.getAttribute(a)); });
      b.setAttribute('data-d2-book-auto', ''); b.__d2b = true; t.appendChild(b); label(b);
      if (!document.querySelector('style[data-d2b]')) { var s = document.createElement('style'); s.setAttribute('data-d2b', ''); s.textContent = CSS; document.head.appendChild(s); }
      t = b;
    }
    t.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); open(t); });
  }
  function init() {
    document.querySelectorAll('[data-d2-book]').forEach(wire);
    new MutationObserver(function () { document.querySelectorAll('[data-d2-book-auto]').forEach(label); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.D2Book = { open: function (opts) { var f = document.createElement('span'); opts = opts || {};
    ['lang', 'brand', 'source'].forEach(function (k) { if (opts[k]) f.setAttribute('data-' + k, opts[k]); }); open(f); }, close: close, wire: wire };
})();
