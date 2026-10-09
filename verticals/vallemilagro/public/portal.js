/* Valle Milagro · Portal de Miembros.
   Todo dato que viene del servidor se inserta como TEXTO (el() usa textContent),
   nunca como HTML. Los únicos innerHTML son íconos fijos de este archivo. */
(function () {
  'use strict';
  var BASE = window.VM_BASE || '';
  var API = BASE + '/api/v1';
  var app = document.getElementById('app');
  var me = null, texts = null, chat = [];
  var TZ = 'America/Bogota';

  var ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 5h16M4 12h16M4 19h16"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18h-5M18 14h-8"/><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.1 5.6a2 2 0 0 0 1.8 0l3.7-1.9A1 1 0 0 1 21 4.6v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.7 1.8A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9l4.5-2.3a2 2 0 0 1 1.8 0zM15 5.8v15M9 3.2v15"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.8a1 1 0 0 1 2 0l1 5.6a2 2 0 0 0 1.6 1.6l5.6 1a1 1 0 0 1 0 2l-5.6 1a2 2 0 0 0-1.6 1.6l-1 5.6a1 1 0 0 1-2 0l-1-5.6A2 2 0 0 0 8.4 14l-5.6-1a1 1 0 0 1 0-2l5.6-1A2 2 0 0 0 10 8.4z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.8H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.8-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.8H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 17 5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="m9 18 6-6-6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>'
  };

  /* ---------- utilidades ---------- */
  function el(tag, attrs) {
    var n = document.createElement(tag), i, k, c;
    attrs = attrs || {};
    for (k in attrs) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'icon') n.innerHTML = ICON[attrs[k]] || '';
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'style') n.style.cssText = attrs[k];
      else n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    for (i = 2; i < arguments.length; i++) {
      c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) n.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }
  function icon(name) { var s = el('span', { icon: name, style: 'display:inline-flex' }); return s; }
  function call(method, path, body) {
    var opt = { method: method, credentials: 'same-origin', headers: { 'X-VM': '1' } };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(API + path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || 'No pudimos completar la acción.'); e.status = r.status; e.body = j; throw e; }
        return j;
      });
    });
  }
  var get = function (p) { return call('GET', p); };
  function fmtDateLong(d) {
    var s = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function fmtTime(d) { return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ }).format(d); }
  function isoDate(s) { if (!s) return null; var p = String(s).slice(0, 10).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)); }
  function fmtShort(s) { var d = isoDate(s); return d ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d).replace(/\./g, '') : null; }
  function fmtLong(s) { var d = isoDate(s); return d ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) : null; }
  function money(cop) {
    if (cop == null) return null;
    var n = Number(cop), f = function (v) { return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(v); };
    if (n >= 1e9) return '$' + f(n / 1e9) + ' mil millones';
    if (n >= 1e6) return '$' + f(n / 1e6) + ' millones';
    return '$' + new Intl.NumberFormat('es-CO').format(n);
  }
  function bar(pct) { return el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.max(0, Math.min(100, Number(pct) || 0)) + '%' })); }
  function demoTag() { return el('div', { class: 'demowrap' }, el('span', { class: 'demo', text: 'Dato de ejemplo' })); }
  function section(title, isDemo) {
    var s = el('section', { class: 'sec' }, el('h2', { class: 'eyebrow', text: title }));
    if (isDemo) s.appendChild(demoTag());
    return s;
  }
  function go(path, replace) { history[replace ? 'replaceState' : 'pushState'](null, '', BASE + path); render(); window.scrollTo(0, 0); }
  function link(path, attrs) {
    attrs = attrs || {}; attrs.href = BASE + path;
    var after = attrs.after; delete attrs.after;
    attrs.onclick = function (e) { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); if (after) after(); go(path); };
    var a = el.apply(null, ['a', attrs].concat([].slice.call(arguments, 2)));
    return a;
  }
  function route() { var p = location.pathname; if (BASE && p.toLowerCase().indexOf(BASE.toLowerCase()) === 0) p = p.slice(BASE.length); return p.replace(/\/+$/, '') || '/'; }

  /* ---------- marco del portal ---------- */
  var NAV = [['/portal', 'Inicio', 'home'], ['/portal/periodico', 'Periódico Valle Milagro', 'news'], ['/portal/proyectos', 'Seguimiento de proyectos', 'list'],
    ['/portal/mapa', 'Mapa en vivo', 'map'], ['/portal/ia', 'Valle Milagro IA', 'spark'], ['/portal/perfil', 'Mi perfil', 'user']];
  function frame(content, opts) {
    opts = opts || {};
    var drawerHost = el('div');
    function openMenu() {
      var close = function () { drawerHost.textContent = ''; };
      var cur = route();
      drawerHost.appendChild(el('div', { class: 'scrim', onclick: close }));
      drawerHost.appendChild(el('nav', { class: 'drawer', 'aria-label': 'Menú' },
        el('div', { class: 'head' }, el('img', { src: BASE + '/medallon.png', alt: 'Valle Milagro' }),
          el('button', { class: 'iconbtn', 'aria-label': 'Cerrar menú', icon: 'x', onclick: close })),
        el('p', { class: 'hola', text: 'Hola, ' + me.first_name }), el('div', { class: 'rule' }),
        el('ul', {}, NAV.map(function (n) { return el('li', {}, link(n[0], { class: 'nav' + (cur === n[0] ? ' on' : ''), after: close }, icon(n[2]), n[1])); })),
        el('div', { class: 'sep' }),
        me.is_admin ? el('a', { class: 'nav sec', href: BASE + '/admin' }, icon('gear'), 'Administrar IA') : null,
        el('button', { class: 'nav out', onclick: function () { call('POST', '/auth/logout', {}).then(function () { me = null; chat = []; go('/', true); }); } }, icon('out'), 'Salir')));
    }
    var root = el('div', { class: 'app' },
      el('header', { class: 'top' }, el('button', { class: 'iconbtn', 'aria-label': 'Abrir menú', icon: 'menu', onclick: openMenu }),
        el('img', { src: BASE + '/institucional.png', alt: 'Asociación Valle Milagro' }), el('span')),
      drawerHost, el('main', {}, content),
      el('footer', { class: 'foot' }, el('img', { src: BASE + '/institucional.png', alt: 'Asociación Valle Milagro' }),
        el('p', { class: 'lema', text: texts.lema }), el('p', { class: 'pie', text: texts.pie })));
    if (!opts.noBubble) root.appendChild(el('button', { class: 'bubble', 'aria-label': 'Hablar con Valle', icon: 'spark', onclick: function () { go('/portal/ia'); } }));
    return root;
  }
  function mount(node) { app.textContent = ''; app.appendChild(node); }
  function loading() { return el('p', { class: 'empty', style: 'padding:48px 16px', text: 'Cargando…' }); }
  function failed(e) { return el('p', { class: 'empty', style: 'padding:48px 16px', text: (e && e.message) || 'No pudimos cargar esta sección.' }); }

  /* ---------- ingreso ---------- */
  function entry(mode, prefill) {
    mode = mode || 'register';
    var err = el('p', { class: 'err' }), form, title;
    var box = el('div', { class: 'box' }, el('img', { src: BASE + '/medallon.png', alt: 'Valle Milagro' }),
      el('h1', { class: 'eyebrow', style: 'margin-top:24px;font-size:14px', text: texts.bienvenida }),
      el('p', { class: 'small mut', style: 'margin-top:8px;min-height:20px', text: fmtDateLong(new Date()) }));
    function busy(btn, on) { btn.disabled = on; }
    if (mode === 'code') {
      var code = el('input', { class: 'in round code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '••••••', 'aria-label': 'Código de seis dígitos' });
      var ok = el('button', { class: 'btn primary block', style: 'margin-top:16px', text: 'Entrar' });
      form = el('form', { onsubmit: function (e) {
        e.preventDefault(); err.textContent = ''; busy(ok, true);
        call('POST', '/auth/verify', { email: prefill, code: code.value }).then(start).catch(function (x) { err.textContent = x.message; busy(ok, false); });
      } }, el('p', { class: 'small', style: 'margin-top:20px', text: 'Te enviamos un código de seis dígitos a ' + prefill + '. Vence en 10 minutos.' }),
        el('label', { class: 'f', style: 'text-align:left', text: 'Código' }), code, ok,
        el('button', { type: 'button', class: 'linkbtn', text: 'Usar otro correo', onclick: function () { mount(entry('login')); } }));
    } else {
      var isReg = mode === 'register';
      var first = el('input', { class: 'in round', autocomplete: 'given-name', placeholder: 'Nombre', 'aria-label': 'Nombre' });
      var last = el('input', { class: 'in round', autocomplete: 'family-name', placeholder: 'Apellido', 'aria-label': 'Apellido', style: 'margin-top:8px' });
      var email = el('input', { class: 'in round', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'tu@correo.com', 'aria-label': 'Correo electrónico', value: prefill || '' });
      var consent = el('input', { type: 'checkbox', id: 'consent' });
      var btn = el('button', { class: 'btn primary block', style: 'margin-top:16px', text: 'Continuar' });
      form = el('form', { onsubmit: function (e) {
        e.preventDefault(); err.textContent = ''; busy(btn, true);
        var mail = email.value.trim().toLowerCase();
        var p = isReg ? call('POST', '/auth/register', { first_name: first.value, last_name: last.value, email: mail, consent: consent.checked })
          : call('POST', '/auth/request-code', { email: mail });
        p.then(function () { mount(entry('code', mail)); }).catch(function (x) { err.textContent = x.message; busy(btn, false); });
      } },
        isReg ? el('label', { class: 'f', style: 'text-align:left;margin-top:20px', text: 'Tu nombre' }) : null, isReg ? first : null, isReg ? last : null,
        el('label', { class: 'f', style: 'text-align:left' + (isReg ? '' : ';margin-top:20px'), text: 'Tu correo' }), email,
        isReg ? el('label', { class: 'check', for: 'consent' }, consent, el('span', {}, texts.consent + ' ',
          link('/privacidad', { text: 'Ver aviso de privacidad' }))) : null,
        btn,
        el('button', { type: 'button', class: 'linkbtn', text: isReg ? 'Ya tengo mi portal' : 'Crear mi portal', onclick: function () { mount(entry(isReg ? 'login' : 'register')); } }));
    }
    box.appendChild(form); box.appendChild(err);
    return el('main', { class: 'entry photo-' + ((Math.floor(Date.now() / 864e5) % 4) + 1) }, el('div', { class: 'veil' }), box);
  }
  function linkEntry(token) {
    var err = el('p', { class: 'err' });
    var btn = el('button', { class: 'btn primary block', style: 'margin-top:20px', text: 'Continuar', onclick: function () {
      btn.disabled = true;
      call('POST', '/auth/verify', { token: token }).then(start).catch(function (x) { err.textContent = x.message; btn.disabled = false; });
    } });
    return el('main', { class: 'entry photo-1' }, el('div', { class: 'veil' }), el('div', { class: 'box' },
      el('img', { src: BASE + '/medallon.png', alt: 'Valle Milagro' }), el('h1', { class: 'eyebrow', style: 'margin-top:24px;font-size:14px', text: texts.bienvenida }),
      el('p', { class: 'small', style: 'margin-top:12px', text: 'Toca Continuar para entrar a tu portal.' }), btn, err));
  }
  function privacy() {
    return el('main', { class: 'app' }, el('div', { class: 'sec' }, el('h1', { class: 'eyebrow', text: 'Aviso de privacidad' }),
      el('div', { class: 'card', style: 'margin-top:16px;white-space:pre-wrap;font-size:14px' }, texts.privacidad),
      el('p', { style: 'margin-top:16px;text-align:center' }, link(me ? '/portal' : '/', { text: 'Volver' }))));
  }

  /* ---------- Inicio ---------- */
  function viewHome(host) {
    get('/portal/home').then(function (h) {
      host.textContent = '';
      var clock = el('p', { class: 'small', style: 'margin-top:4px' });
      var tick = function () { if (!clock.isConnected) return clearInterval(timer); var d = new Date(); clock.textContent = fmtDateLong(d) + ' · ' + fmtTime(d); };
      var timer = setInterval(tick, 1000);
      var bg = el('div', { class: 'bg' + (h.photo ? '' : ' photo-' + h.gradient) });
      if (h.photo) bg.style.backgroundImage = 'url("' + API + '/portal/' + h.photo.url + '")';
      host.appendChild(el('div', { class: 'hero' }, bg, el('div', { class: 'veil' }),
        h.photo && h.photo.caption ? el('span', { class: 'cap', text: h.photo.caption }) : null,
        el('div', { class: 'inner' }, el('h1', { text: 'Hola, ' + h.member.first_name }), clock, el('p', { class: 'eyebrow', text: h.city }))));
      setTimeout(tick, 0);

      if (h.edition) host.appendChild(link('/portal/periodico', { class: 'paper' }, el('div', { class: 'row', style: 'align-items:center' },
        el('div', { style: 'min-width:0' }, el('p', { class: 'k', text: 'Periódico Valle Milagro · IA' }), el('p', { class: 'h', text: h.edition.headline }),
          h.edition.today_line ? el('p', { class: 't', text: h.edition.today_line }) : null), icon('chev'))));

      if (h.figures) {
        var s1 = section('En cifras', h.has_demo);
        s1.appendChild(el('div', { class: 'figs' }, [[h.figures.active_projects, 'Proyectos activos'], [h.figures.companies, 'Empresas conectadas'], [h.figures.municipios, 'Municipios']]
          .map(function (f) { return el('div', { class: 'card' }, el('p', { class: 'n', text: String(f[0]) }), el('p', { class: 'tiny mut', text: f[1] })); })));
        host.appendChild(s1);
      }
      if (h.convocatoria.length) {
        var s2 = section('Milagros en convocatoria', h.convocatoria.some(function (p) { return p.is_demo; }));
        s2.appendChild(el('div', { class: 'hscroll' }, h.convocatoria.map(function (p) {
          var q = p.oxi.quota_committed_cop, v = p.oxi.work_value_cop;
          return el('div', { class: 'card' }, el('p', { class: 'small mut', text: p.municipio }), el('p', { class: 'disp b', style: 'font-size:14px', text: p.name }),
            el('div', { style: 'margin-top:12px' }, bar(q / v * 100)),
            el('p', { class: 'small', style: 'margin-top:8px' }, 'Falta ', el('b', { text: money(v - q) }), ' de ' + money(v)));
        })));
        host.appendChild(s2);
      }
      if (h.progress.length) {
        var s3 = section('Índice de Progreso Valle Milagro', h.has_demo);
        s3.appendChild(el('div', { class: 'card stack' }, h.progress.map(function (p) {
          return el('div', {}, el('div', { class: 'row', style: 'font-size:14px' }, el('span', { text: p.category }), el('span', { class: 'disp b', text: p.value + '%' })), bar(p.value));
        })));
        host.appendChild(s3);
      }
      if (h.urgent.length) {
        var s4 = section('Lo más urgente', h.urgent.some(function (u) { return u.is_demo; }));
        s4.appendChild(el('div', { class: 'hscroll' }, h.urgent.map(function (u) {
          var detail = el('ul', { hidden: true, style: 'list-style:none;padding:0;margin:8px 0 0', class: 'small stack' }, u.parts.map(function (p) {
            return el('li', {}, el('div', { class: 'row' }, el('span', { text: p.label }), el('span', { text: String(p.value) })), bar(p.value));
          }));
          return el('div', { class: 'card' }, el('div', { class: 'row', style: 'align-items:flex-start' },
            el('div', { style: 'min-width:0' }, el('p', { class: 'small mut', text: u.municipio }), el('p', { class: 'disp b', style: 'font-size:14px', text: u.name })),
            el('span', { class: 'score ' + (u.score >= 80 ? 'hi' : u.score >= 60 ? 'mid' : 'lo'), text: String(u.score) })),
            el('button', { class: 'linkbtn', text: '¿Por qué este puntaje?', onclick: function () { detail.hidden = !detail.hidden; } }), detail);
        })));
        host.appendChild(s4);
      }
      var s5 = section('Mis proyectos', false);
      s5.appendChild(h.mine.length ? el('div', { class: 'stack' }, h.mine.map(function (p) {
        return el('div', { class: 'card' }, el('div', { class: 'row small mut' }, el('span', { text: p.municipio }), el('span', { text: p.stage_name || '' })),
          el('p', { class: 'disp b', style: 'font-size:14px', text: p.name }), p.progress_pct != null ? el('div', { style: 'margin-top:8px' }, bar(p.progress_pct)) : null);
      })) : el('p', { class: 'empty', text: 'Aún no sigues ningún proyecto. En Seguimiento puedes seguir los que te interesen.' }));
      host.appendChild(s5);
      host.appendChild(el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 16px 16px' },
        link('/portal/proyectos', { class: 'btn secondary' }, icon('list'), 'Seguimiento'), link('/portal/mapa', { class: 'btn secondary' }, icon('map'), 'Mapa en vivo')));
      if (!h.edition && !h.figures) host.appendChild(el('p', { class: 'empty', text: 'Pronto verás aquí los proyectos y las noticias de la Asociación.' }));
    }).catch(function (e) { host.textContent = ''; host.appendChild(failed(e)); });
  }

  /* ---------- Periódico ---------- */
  function viewPaper(host, date) {
    Promise.all([get('/portal/editions/' + (date || 'latest')), get('/portal/editions')]).then(function (r) {
      var ed = r[0].edition, news = r[0].news, dates = r[1].dates;
      host.textContent = '';
      host.appendChild(el('div', { class: 'banner' }, el('div', { class: 'bg photo-2' }), el('div', { class: 'veil' }),
        el('div', { class: 'inner' }, el('h1', { class: 'eyebrow', text: 'Periódico Valle Milagro' }), el('p', { class: 'small', style: 'margin-top:8px;opacity:.9', text: ed ? 'Edición del ' + fmtLong(ed.edition_date) : fmtDateLong(new Date()) }))));
      if (!ed) { host.appendChild(el('p', { class: 'empty', style: 'padding:40px 16px', text: 'Todavía no hay una edición publicada.' })); return; }
      var s1 = section('Titular del día', ed.is_demo);
      s1.appendChild(el('article', { class: 'card' }, el('h2', { style: 'font-size:18px;line-height:1.35;color:var(--primary)', text: ed.headline }),
        ed.summary ? el('p', { style: 'margin-top:12px;font-size:14px;line-height:1.6', text: ed.summary }) : null,
        el('p', { class: 'small mut', style: 'margin-top:12px', text: /scout/.test(ed.composed_by) ? 'Síntesis generada por IA a partir de las noticias del día y aprobada por la Asociación.' : 'Edición revisada por la Asociación.' })));
      host.appendChild(s1);
      var s2 = section('Noticias por tema', false);
      s2.appendChild(news.length ? el('div', { class: 'stack' }, news.map(function (n) {
        var safe = /^https?:\/\//i.test(n.source_url || '');
        return el('article', { class: 'card' }, el('p', { class: 'disp b', style: 'font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--secondary)', text: n.tema }),
          el('h3', { style: 'margin-top:4px;font-size:14px', text: n.title }), el('p', { style: 'margin-top:4px;font-size:14px', text: n.summary }),
          el('div', { class: 'row small mut', style: 'margin-top:8px;align-items:center' }, el('span', { text: [n.medio, fmtShort(n.published_on)].filter(Boolean).join(' · ') }),
            safe ? el('a', { href: n.source_url, target: '_blank', rel: 'noopener noreferrer', style: 'display:inline-flex;gap:4px;align-items:center;min-height:32px' }, 'Fuente ', icon('ext')) : null),
          n.is_demo ? el('div', { style: 'margin-top:8px' }, el('span', { class: 'demo', text: 'Dato de ejemplo' })) : null);
      })) : el('p', { class: 'empty', text: 'Esta edición no tiene noticias publicadas.' }));
      host.appendChild(s2);
      if (dates.length > 1) {
        var s3 = section('Archivo de ediciones', false);
        s3.appendChild(el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' }, dates.map(function (d) {
          return el('button', { class: 'pill' + (String(d).slice(0, 10) === String(ed.edition_date).slice(0, 10) ? ' on' : ''), style: 'font-weight:400', text: fmtLong(d), onclick: function () { viewPaper(host, String(d).slice(0, 10)); window.scrollTo(0, 0); } });
        })));
        host.appendChild(s3);
      }
    }).catch(function (e) { host.textContent = ''; host.appendChild(failed(e)); });
  }

  /* ---------- Seguimiento ---------- */
  var SECTORS = [['publico', 'Sector público'], ['privado', 'Sector privado'], ['oxi', 'Obras por Impuestos']];
  function viewProjects(host) {
    get('/portal/projects').then(function (d) {
      var sector = 'oxi', list = el('div', { class: 'stack', style: 'padding:0 16px' }), tabs = el('div', { class: 'tabs' });
      function paint() {
        tabs.textContent = '';
        SECTORS.forEach(function (s) { tabs.appendChild(el('button', { class: 'pill' + (sector === s[0] ? ' on' : ''), text: s[1], onclick: function () { sector = s[0]; paint(); } })); });
        list.textContent = '';
        var rows = d.projects.filter(function (p) { return p.sector === sector; });
        if (rows.some(function (p) { return p.is_demo; })) list.appendChild(demoTag());
        if (!rows.length) list.appendChild(el('p', { class: 'empty', text: 'No hay proyectos publicados en esta pestaña.' }));
        rows.forEach(function (p) {
          var following = d.following.indexOf(p.id) >= 0;
          var card = el('article', { class: 'card' }, el('p', { class: 'small mut', text: [p.municipio, p.entity].filter(Boolean).join(' · ') }),
            el('h3', { style: 'font-size:14px', text: p.name }),
            el('div', { class: 'steps' }, d.stages.map(function (s, i) { return el('i', { class: i <= p.stage ? 'on' : '', title: s }); })),
            el('p', { class: 'small', style: 'margin-top:4px' }, 'Etapa: ', el('b', { text: p.stage_name || '' })));
          if (p.progress_pct != null) { card.appendChild(el('div', { class: 'row small', style: 'margin-top:8px' }, el('span', { text: 'Avance' }), el('span', { text: p.progress_pct + '%' }))); card.appendChild(bar(p.progress_pct)); }
          card.appendChild(el('div', { class: 'row tiny mut', style: 'margin-top:8px' }, el('span', { text: 'Entrega: ' + (fmtShort(p.delivery_date) || 'Por definir') }), el('span', { text: 'Actualizado: ' + fmtShort(p.updated_at) })));
          if (p.oxi) {
            var o = p.oxi, box = el('div', { class: 'oxi' });
            if (o.contributors_count != null || o.fiduciary) box.appendChild(el('p', { text: [o.contributors_count != null ? o.contributors_count + ' contribuyentes vinculados' : null, o.fiduciary].filter(Boolean).join(' · ') }));
            if (o.quota_committed_cop != null && o.work_value_cop) {
              box.appendChild(el('p', { style: 'margin-top:8px', text: 'Cupo comprometido vs. valor de la obra' })); box.appendChild(bar(o.quota_committed_cop / o.work_value_cop * 100));
              box.appendChild(el('p', { style: 'margin-top:4px', text: money(o.quota_committed_cop) + ' de ' + money(o.work_value_cop) }));
            }
            var slot = el('div', { style: 'margin-top:12px' });
            var done = function () { slot.textContent = ''; slot.appendChild(el('p', { class: 'b', style: 'color:var(--primary)', text: d.texts.interes_registrado })); };
            if (d.interested.indexOf(p.id) >= 0) done();
            else slot.appendChild(el('button', { class: 'btn secondary block', text: 'Me interesa vincular a mi empresa', onclick: function (e) {
              e.target.disabled = true; call('POST', '/portal/projects/' + p.id + '/interest', {}).then(function () { d.interested.push(p.id); done(); }).catch(function () { e.target.disabled = false; });
            } }));
            box.appendChild(slot); card.appendChild(box);
          }
          var fbtn = el('button', { class: 'linkbtn', text: following ? 'Dejar de seguir' : 'Seguir este proyecto', onclick: function () {
            call(following ? 'DELETE' : 'POST', '/portal/projects/' + p.id + '/follow', following ? undefined : {}).then(function () {
              following = !following; fbtn.textContent = following ? 'Dejar de seguir' : 'Seguir este proyecto';
              if (following) d.following.push(p.id); else d.following = d.following.filter(function (x) { return x !== p.id; });
            });
          } });
          card.appendChild(fbtn);
          list.appendChild(card);
        });
        list.appendChild(el('button', { class: 'btn primary block', text: 'Postular un proyecto', onclick: function () { postular(d); } }));
        list.appendChild(el('p', { class: 'small mut', style: 'text-align:center;font-style:italic', text: d.texts.nota_fiduciaria }));
      }
      host.textContent = '';
      host.appendChild(el('div', { class: 'banner' }, el('div', { class: 'bg photo-3' }), el('div', { class: 'veil' }), el('div', { class: 'inner' }, el('h1', { class: 'eyebrow', text: 'Seguimiento de proyectos' }))));
      host.appendChild(tabs); host.appendChild(list);
      host.appendChild(el('button', { class: 'fab', 'aria-label': 'Postular un proyecto', icon: 'plus', onclick: function () { postular(d); } }));
      paint();
    }).catch(function (e) { host.textContent = ''; host.appendChild(failed(e)); });
  }
  function readFile(file) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = no; r.readAsDataURL(file); }); }
  function postular(d) {
    var err = el('p', { class: 'err' }), modal;
    var close = function () { modal.remove(); };
    var f = {
      category: el('select', { class: 'in', required: true }, d.categories.map(function (c) { return el('option', { text: c }); })),
      municipio: el('input', { class: 'in', required: true, placeholder: 'Ej. Jamundí', maxlength: '80' }),
      place: el('input', { class: 'in', maxlength: '120' }),
      map_point: el('input', { class: 'in', placeholder: 'Coordenadas o referencia (ej. 3,26, -76,54)', maxlength: '80' }),
      conditions: el('textarea', { class: 'in', rows: '3', maxlength: '2000' }),
      population: el('input', { class: 'in', type: 'number', min: '0', inputmode: 'numeric' }),
      time_unattended: el('input', { class: 'in', placeholder: 'Ej. 5 años', maxlength: '80' }),
      source: el('input', { class: 'in', maxlength: '200' }),
      photos: el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, style: 'font-size:13px;min-height:44px' })
    };
    var send = el('button', { class: 'btn primary block', style: 'margin-top:20px', text: 'Enviar postulación' });
    var form = el('form', { onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      var files = [].slice.call(f.photos.files || []);
      if (files.length > 6) { err.textContent = 'Puedes subir hasta seis fotos.'; return; }
      if (files.some(function (x) { return x.size > 8 * 1024 * 1024; })) { err.textContent = 'Cada foto debe pesar menos de 8 MB.'; return; }
      send.disabled = true; send.textContent = 'Enviando…';
      Promise.all(files.map(readFile)).then(function (photos) {
        return call('POST', '/portal/submissions', { category: f.category.value, municipio: f.municipio.value, place: f.place.value, map_point: f.map_point.value.replace(/(\d),(\d)/g, '$1.$2'),
          conditions: f.conditions.value, population: f.population.value, time_unattended: f.time_unattended.value, source: f.source.value, photos: photos });
      }).then(function (r) {
        sheet.textContent = '';
        sheet.appendChild(el('div', { style: 'padding:40px 0;text-align:center' }, el('p', { class: 'disp b', style: 'color:var(--primary)', text: d.texts.postulacion_enviada }),
          r.photos_failed && r.photos_failed.length ? el('p', { class: 'small mut', style: 'margin-top:8px', text: 'Algunas fotos no se pudieron guardar: ' + r.photos_failed[0] }) : null,
          el('button', { class: 'btn primary', style: 'margin-top:24px', text: 'Cerrar', onclick: close })));
      }).catch(function (x) { err.textContent = x.message; send.disabled = false; send.textContent = 'Enviar postulación'; });
    } },
      el('label', { class: 'f', text: 'Categoría' }), f.category, el('label', { class: 'f', text: 'Municipio' }), f.municipio,
      el('label', { class: 'f', text: 'Barrio o vereda' }), f.place, el('label', { class: 'f', text: 'Punto en el mapa' }), f.map_point,
      el('label', { class: 'f', text: 'Condiciones actuales' }), f.conditions, el('label', { class: 'f', text: 'Población beneficiada' }), f.population,
      el('label', { class: 'f', text: 'Tiempo sin intervención' }), f.time_unattended, el('label', { class: 'f', text: 'Fuente de la información' }), f.source,
      el('label', { class: 'f', text: 'Fotos' }), f.photos, el('p', { class: 'notice', style: 'margin-top:8px', text: d.texts.aviso_fotos }), send, err);
    var sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Postular un proyecto' },
      el('div', { class: 'row', style: 'align-items:center' }, el('h2', { style: 'font-size:16px;color:var(--primary)', text: 'Postular un proyecto' }),
        el('button', { class: 'iconbtn', 'aria-label': 'Cerrar', icon: 'x', onclick: close })), form);
    modal = el('div', { class: 'modal' }, sheet);
    document.body.appendChild(modal);
  }

  /* ---------- Mapa ---------- */
  var COLORS = { 'Obras públicas': '#4C8AD8', 'Obras por Impuestos': '#21392B', 'Proyectos privados': '#6B5140', 'Reconstrucción Terremoto 2026': '#CF3B30', 'Necesidades': '#E4A23A' };
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise(function (ok, no) {
      document.head.appendChild(el('link', { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css' }));
      var s = el('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' }); s.onload = ok; s.onerror = no; document.head.appendChild(s);
    });
  }
  function viewMap(host) {
    Promise.all([get('/portal/map'), loadLeaflet(), fetch(BASE + '/geo/valle-municipios.json').then(function (r) { return r.json(); }).catch(function () { return null; })]).then(function (r) {
      var data = r[0], geo = r[2], L = window.L, on = {}, sat = false;
      data.layers.forEach(function (l) { on[l] = true; });
      var mapEl = el('div', { id: 'map' }), modes = el('div', { style: 'display:flex;gap:8px' }), layers = el('div', { class: 'card layers' });
      host.textContent = '';
      host.appendChild(el('div', { class: 'sec stack' }, el('h1', { class: 'eyebrow', text: 'Mapa en vivo' }),
        data.points.some(function (p) { return p.is_demo; }) ? demoTag() : null, modes, mapEl, layers));
      var map = L.map(mapEl, { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false }).setView([3.9, -76.5], 8);
      mapEl.addEventListener('click', function () { map.dragging.enable(); });
      var base = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' });
      var satl = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Tiles &copy; Esri' });
      base.addTo(map);
      if (geo) L.geoJSON(geo, { style: { color: '#8EC1F2', weight: 1.2, fillColor: '#F5F0E6', fillOpacity: 0.25 } }).addTo(map);
      var group = L.layerGroup().addTo(map);
      function card(p) {
        return el('div', { style: 'font-family:Lora,Georgia,serif;min-width:180px' }, el('p', { style: 'font-family:Montserrat,sans-serif;font-weight:600;font-size:13px;margin:0', text: p.name }),
          el('p', { style: 'font-size:12px;margin:4px 0 0', text: [p.municipio, p.entity].filter(Boolean).join(' · ') }),
          el('p', { style: 'font-size:12px;margin:4px 0 0', text: 'Etapa: ' + (p.stage_name || '') + (p.progress_pct != null ? ' · Avance ' + p.progress_pct + '%' : '') }));
      }
      function paintPoints() {
        group.clearLayers();
        data.points.forEach(function (p) { if (on[p.layer]) L.circleMarker([p.lat, p.lng], { radius: 9, color: '#fff', weight: 2, fillColor: COLORS[p.layer] || '#21392B', fillOpacity: 1 }).bindPopup(card(p)).addTo(group); });
      }
      function paintModes() {
        modes.textContent = '';
        [['Mapa', false], ['Satélite', true]].forEach(function (m) { modes.appendChild(el('button', { class: 'pill' + (sat === m[1] ? ' on' : ''), text: m[0], onclick: function () {
          sat = m[1]; map.removeLayer(sat ? base : satl); (sat ? satl : base).addTo(map); paintModes();
        } })); });
      }
      layers.appendChild(el('p', { class: 'disp b', style: 'font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--primary);margin-bottom:8px', text: 'Capas' }));
      data.layers.forEach(function (l) {
        var cb = el('input', { type: 'checkbox', checked: true, onchange: function () { on[l] = cb.checked; paintPoints(); } });
        layers.appendChild(el('label', {}, cb, el('span', { class: 'dot', style: 'background:' + COLORS[l] }), l));
      });
      paintModes(); paintPoints();
      setTimeout(function () { map.invalidateSize(); }, 200);
    }).catch(function (e) { host.textContent = ''; host.appendChild(failed(e)); });
  }

  /* ---------- Valle Milagro IA ---------- */
  function viewChat(host) {
    var logEl = el('div', { class: 'chat' }), input = el('input', { class: 'in round', placeholder: 'Escribe a Valle…', maxlength: '1000', 'aria-label': 'Mensaje para Valle' });
    var sendBtn = el('button', { class: 'btn primary', text: 'Enviar' });
    function bubble(m) {
      var b = el('div', { class: 'msg ' + (m.role === 'user' ? 'me' : 'bot'), text: m.content });
      if (m.simulated) b.appendChild(el('span', { class: 'tag', text: 'Respuesta sin modelo' }));
      return b;
    }
    function paint() { logEl.textContent = ''; chat.forEach(function (m) { logEl.appendChild(bubble(m)); }); window.scrollTo(0, document.body.scrollHeight); }
    function send(text) {
      text = String(text || '').trim(); if (!text || sendBtn.disabled) return;
      chat.push({ role: 'user', content: text }); input.value = ''; sendBtn.disabled = true; paint();
      var wait = el('div', { class: 'msg bot mut', text: 'Valle está escribiendo…' }); logEl.appendChild(wait);
      call('POST', '/portal/valle/chat', { messages: chat.map(function (m) { return { role: m.role, content: m.content }; }) }).then(function (r) {
        chat.push({ role: 'assistant', content: r.reply, simulated: r.is_simulated });
      }).catch(function (e) { chat.push({ role: 'assistant', content: e.message }); }).then(function () { sendBtn.disabled = false; paint(); input.focus(); });
    }
    if (!chat.length) chat.push({ role: 'assistant', content: 'Hola, ' + me.first_name + '. Soy Valle. Puedo ayudarte con proyectos, noticias del día, el mapa y cómo funciona Obras por Impuestos. ¿Por dónde empezamos?' });
    host.textContent = '';
    host.appendChild(el('div', { class: 'sec', style: 'padding-bottom:8px' }, el('h1', { class: 'eyebrow', text: 'Valle Milagro IA' })));
    host.appendChild(logEl);
    host.appendChild(el('div', { class: 'chips' }, ['¿Qué es lo más urgente?', 'Noticias de hoy', '¿Cómo funcionan las Obras por Impuestos?'].map(function (t) { return el('button', { class: 'pill', style: 'font-weight:400', text: t, onclick: function () { send(t); } }); })));
    host.appendChild(el('form', { class: 'chatbar', style: 'margin-top:12px', onsubmit: function (e) { e.preventDefault(); send(input.value); } }, input, sendBtn));
    paint();
  }

  /* ---------- Mi perfil ---------- */
  var DUES = { al_dia: 'Al día', pendiente: 'Pendiente', sin_registro: 'Sin registro' };
  function viewProfile(host) {
    get('/portal/profile').then(function (p) {
      host.textContent = '';
      var err = el('p', { class: 'err' });
      var first = el('input', { class: 'in', value: p.first_name, maxlength: '60', 'aria-label': 'Nombre' }), last = el('input', { class: 'in', value: p.last_name, maxlength: '60', 'aria-label': 'Apellido' });
      host.appendChild(el('div', { class: 'sec stack' }, el('h1', { class: 'eyebrow', text: 'Mi perfil' }),
        el('div', { class: 'card', style: 'text-align:center' }, el('img', { src: BASE + '/institucional.png', alt: 'Asociación Valle Milagro', style: 'height:48px' }),
          el('p', { class: 'disp', style: 'margin-top:16px;font-size:20px;font-weight:700;color:var(--primary)', text: p.first_name + ' ' + p.last_name }),
          el('p', { class: 'disp b', style: 'margin-top:4px;font-size:14px;letter-spacing:.08em;color:var(--secondary)', text: p.code + (p.is_founder ? ' · Miembro fundador' : '') })),
        el('div', { class: 'card' },
          el('div', { class: 'kv' }, el('span', { class: 'mut', text: 'Nombre' }), el('span', { text: p.first_name })),
          el('div', { class: 'kv' }, el('span', { class: 'mut', text: 'Apellido' }), el('span', { text: p.last_name })),
          el('div', { class: 'kv' }, el('span', { class: 'mut', text: 'Correo' }), el('span', { style: 'overflow-wrap:anywhere;text-align:right', text: p.email })),
          el('div', { class: 'kv' }, el('span', { class: 'mut', text: 'Número de miembro' }), el('span', { text: p.code })),
          el('div', { class: 'kv' }, el('span', { class: 'mut', text: 'Fecha de ingreso' }), el('span', { text: fmtLong(String(p.joined_at).slice(0, 10)) || '' })),
          el('div', { class: 'kv', style: 'align-items:center' }, el('span', { class: 'mut', text: 'Cuota de mantenimiento' }), el('span', { class: 'status ' + p.dues_status, text: DUES[p.dues_status] || 'Sin registro' }))),
        el('details', { class: 'card' }, el('summary', { class: 'disp b', style: 'font-size:13px;min-height:32px;cursor:pointer', text: 'Corregir mi nombre' }),
          el('label', { class: 'f', text: 'Nombre' }), first, el('label', { class: 'f', text: 'Apellido' }), last,
          el('button', { class: 'btn primary', style: 'margin-top:12px', text: 'Guardar', onclick: function () {
            call('PATCH', '/portal/profile', { first_name: first.value, last_name: last.value }).then(function () { me.first_name = first.value.trim(); viewProfile(host); }).catch(function (x) { err.textContent = x.message; });
          } }), err),
        el('p', { class: 'small mut', style: 'text-align:center' }, link('/privacidad', { text: 'Aviso de privacidad' }), me.is_admin ? null : ' · ',
          me.is_admin ? null : el('button', { class: 'linkbtn', style: 'font-weight:400', text: 'Eliminar mi cuenta', onclick: function () {
            if (!window.confirm('Se eliminarán tus datos personales y perderás el acceso. ¿Continuar?')) return;
            call('POST', '/portal/profile/delete', { confirm: true }).then(function () { me = null; go('/', true); });
          } }))));
    }).catch(function (e) { host.textContent = ''; host.appendChild(failed(e)); });
  }

  /* ---------- arranque y rutas ---------- */
  function render() {
    var r = route();
    if (r === '/privacidad') return mount(privacy());
    if (r === '/entrar') { var t = new URLSearchParams(location.search).get('t'); if (t && !me) return mount(linkEntry(t)); return go(me ? '/portal' : '/', true); }
    if (!me) { if (r !== '/') return go('/', true); return mount(entry('register')); }
    if (r === '/') return go('/portal', true);
    var host = el('div', {}, loading());
    mount(frame(host, { noBubble: r === '/portal/ia' }));
    if (r === '/portal') viewHome(host);
    else if (r === '/portal/periodico') viewPaper(host);
    else if (r === '/portal/proyectos') viewProjects(host);
    else if (r === '/portal/mapa') viewMap(host);
    else if (r === '/portal/ia') viewChat(host);
    else if (r === '/portal/perfil') viewProfile(host);
    else go('/portal', true);
  }
  function start() {
    return get('/auth/me').then(function (m) { me = m; }).catch(function () { me = null; }).then(function () {
      if (me && (route() === '/' || route() === '/entrar')) history.replaceState(null, '', BASE + '/portal');
      render();
    });
  }
  window.addEventListener('popstate', render);
  get('/public/texts').then(function (t) { texts = t; }).catch(function () { texts = { bienvenida: 'Bienvenido', lema: 'No manejamos dinero. Conectamos a quien sí.', pie: 'Cali, Valle del Cauca', privacidad: '', consent: '' }; }).then(start);
})();
