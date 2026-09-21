/* PLANEA — Calendario Planea: vista de mes + lista de próximas fechas.
   Todo sale de /planea/api/v1/me/calendar, que arma las fechas en cada lectura desde las
   metas (fecha objetivo) y la fecha de renta (dígitos de la cédula + tabla DIAN validada). */
(function () {
  'use strict';
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var data = null, view = null, selected = null;
  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function iso(y, m, d) { return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  function cuando(n) { return n < 0 ? 'Pasó hace ' + (-n) + (n === -1 ? ' día' : ' días') : n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : 'En ' + n + ' días'; }

  function byDay() { var m = {}; (data.events || []).forEach(function (e) { (m[e.date] = m[e.date] || []).push(e); }); return m; }

  function renderMonth() {
    var y = view.y, mo = view.m, map = byDay();
    $('cal-title').textContent = MESES[mo] + ' ' + y;
    var first = new Date(Date.UTC(y, mo, 1)), start = (first.getUTCDay() + 6) % 7; // lunes = 0
    var days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(), prevDays = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    var html = '';
    for (var i = 0; i < 42; i++) {
      var d, m2 = mo, y2 = y, other = false;
      if (i < start) { d = prevDays - start + i + 1; m2 = mo - 1; other = true; }
      else if (i >= start + days) { d = i - start - days + 1; m2 = mo + 1; other = true; }
      else d = i - start + 1;
      if (m2 < 0) { m2 = 11; y2 = y - 1; } if (m2 > 11) { m2 = 0; y2 = y + 1; }
      var k = iso(y2, m2, d), ev = map[k] || [];
      if (i >= 35 && i >= start + days) break;
      html += '<button type="button" class="cal-day' + (other ? ' other' : '') + (k === data.today ? ' today' : '') + (ev.length ? ' has' : '') + '" data-day="' + k + '"' + (ev.length ? ' aria-label="' + esc(k + ': ' + ev.map(function (e) { return e.title; }).join(', ')) + '"' : ' tabindex="-1"') + '>' + d +
        (ev.length ? '<div class="dots">' + ev.map(function (e) { return '<i class="dot ' + e.origin + '"></i>'; }).join('') + '</div>' : '') + '</button>';
    }
    $('cal-days').innerHTML = html;
  }

  function renderList() {
    var up = (data.events || []).filter(function (e) { return e.days_left >= 0; });
    if (!up.length) { $('cal-list').innerHTML = '<div class="cal-empty">No tienes fechas próximas. Ponle una fecha objetivo a una meta en <a href="/planea/portal/metas" style="color:var(--green)">Mis metas</a>.</div>'; return; }
    $('cal-list').innerHTML = up.map(function (e) {
      var p = e.date.split('-');
      return '<a class="cal-item' + (e.date === selected ? ' hl' : '') + '" href="' + esc(e.link) + '" data-date="' + e.date + '">' +
        '<div class="cal-date"><b>' + (+p[2]) + '</b><small>' + MESES[+p[1] - 1].slice(0, 3) + '</small></div>' +
        '<div class="cal-it"><b><span class="cal-tag ' + e.origin + '">' + (e.origin === 'renta' ? 'RENTA' : 'META') + '</span>' + esc(e.title) + '</b>' +
        '<span>' + esc(e.detail) + ' · ' + cuando(e.days_left) + '</span></div></a>';
    }).join('');
  }

  function note() {
    var r = data.renta || {};
    if (r.status && r.status !== 'ok') { $('cal-note').textContent = r.message; $('cal-note').hidden = false; }
  }

  function boot() {
    fetch('/planea/api/v1/me/calendar', { credentials: 'include' }).then(function (r) {
      if (r.status === 401) { location.href = '/planea/login'; return null; }
      return r.ok ? r.json() : null;
    }).then(function (j) {
      if (!j) { $('cal-list').innerHTML = '<div class="cal-empty">No se pudo cargar tu calendario. Intenta de nuevo.</div>'; return; }
      data = j; var t = j.today.split('-'); view = { y: +t[0], m: +t[1] - 1 };
      renderMonth(); renderList(); note();
    });
    $('cal-prev').addEventListener('click', function () { if (!data) return; view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderMonth(); });
    $('cal-next').addEventListener('click', function () { if (!data) return; view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderMonth(); });
    $('cal-days').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.cal-day.has'); if (!b) return;
      selected = b.getAttribute('data-day'); renderList();
      var it = document.querySelector('.cal-item.hl'); if (it) it.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
