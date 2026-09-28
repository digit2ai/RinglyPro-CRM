/* PLANEA — Calendario Planea: vista de mes + próximas fechas + recordatorios propios.
   Todo sale de /planea/api/v1/me/calendar, que arma las fechas en cada lectura desde las
   metas (fecha objetivo), la fecha de renta (dígitos de la cédula + tabla DIAN validada) y
   los recordatorios que el usuario escribe. Los festivos de Colombia se calculan en el
   servidor (Ley 51 de 1983) y se pintan en el mes; no entran en la lista de próximas fechas
   porque son dieciocho al año y taparían lo que la persona sí debe hacer. */
(function () {
  'use strict';
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var data = null, view = null, selected = null, HOL = {};
  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function iso(y, m, d) { return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  function cuando(n) { return n < 0 ? 'Pasó hace ' + (-n) + (n === -1 ? ' día' : ' días') : n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : 'En ' + n + ' días'; }
  function api(method, path, body) {
    return fetch('/planea/api/v1' + path, {
      method: method, credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
  }

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
      var k = iso(y2, m2, d), ev = map[k] || [], fest = HOL[k];
      if (i >= 35 && i >= start + days) break;
      var label = ev.map(function (e) { return e.title; }).concat(fest ? [fest] : []).join(', ');
      html += '<button type="button" class="cal-day' + (other ? ' other' : '') + (k === data.today ? ' today' : '') + (fest ? ' fest' : '') + (ev.length ? ' has' : '') + '" data-day="' + k + '"' +
        (label ? ' title="' + esc(k + ': ' + label) + '" aria-label="' + esc(k + ': ' + label) + '"' : ' tabindex="-1"') + '>' + d +
        ((ev.length || fest) ? '<div class="dots">' + ev.map(function (e) { return '<i class="dot ' + e.origin + '"></i>'; }).join('') + (fest ? '<i class="dot festivo"></i>' : '') + '</div>' : '') + '</button>';
    }
    $('cal-days').innerHTML = html;
    var mes = (data.holidays || []).filter(function (f) { return f.date.slice(0, 7) === y + '-' + String(mo + 1).padStart(2, '0'); });
    $('cal-fest').innerHTML = mes.length
      ? '<b>Festivos de ' + MESES[mo] + ':</b> ' + mes.map(function (f) { return esc((+f.date.slice(8, 10)) + ' · ' + f.name); }).join(' — ')
      : '<b>Festivos de ' + MESES[mo] + ':</b> ninguno.';
  }

  function renderList() {
    var up = (data.events || []).filter(function (e) { return e.days_left >= 0 || (e.origin === 'recordatorio' && !e.done); });
    if (!up.length) { $('cal-list').innerHTML = '<div class="cal-empty">No tienes fechas próximas. Ponle una fecha objetivo a una meta en <a href="/planea/portal/metas" style="color:var(--green)">Mis metas</a>, o crea un recordatorio aquí abajo.</div>'; return; }
    $('cal-list').innerHTML = up.map(function (e) {
      var p = e.date.split('-'), tag = e.origin === 'renta' ? 'RENTA' : e.origin === 'meta' ? 'META' : 'RECORDATORIO';
      var body = '<div class="cal-date"><b>' + (+p[2]) + '</b><small>' + MESES[+p[1] - 1].slice(0, 3) + '</small></div>' +
        '<div class="cal-it"><b><span class="cal-tag ' + e.origin + '">' + tag + '</span>' + esc(e.title) + (e.done ? ' <span class="cal-done">hecho</span>' : '') + '</b>' +
        '<span>' + esc(e.detail) + ' · ' + cuando(e.days_left) + '</span></div>';
      if (e.origin === 'recordatorio') {
        var id = String(e.id).split(':')[1];
        return '<div class="cal-item' + (e.date === selected ? ' hl' : '') + '" data-date="' + e.date + '">' + body +
          '<div class="cal-acts"><button type="button" class="cal-mini" data-done="' + esc(id) + '" data-val="' + (e.done ? '0' : '1') + '">' + (e.done ? 'Reabrir' : 'Hecho') + '</button>' +
          '<button type="button" class="cal-mini del" data-del="' + esc(id) + '">Borrar</button></div></div>';
      }
      return '<a class="cal-item' + (e.date === selected ? ' hl' : '') + '" href="' + esc(e.link) + '" data-date="' + e.date + '">' + body + '</a>';
    }).join('');
  }

  function note() {
    var r = data.renta || {};
    if (r.status && r.status !== 'ok') { $('cal-note').textContent = r.message; $('cal-note').hidden = false; }
    else $('cal-note').hidden = true;
  }

  function load(first) {
    return api('GET', '/me/calendar').then(function (j) {
      if (j._status === 401) { location.href = '/planea/login'; return; }
      if (j._status !== 200) { $('cal-list').innerHTML = '<div class="cal-empty">No se pudo cargar tu calendario. Intenta de nuevo.</div>'; return; }
      data = j; HOL = {}; (j.holidays || []).forEach(function (f) { HOL[f.date] = f.name; });
      if (first) { var t = j.today.split('-'); view = { y: +t[0], m: +t[1] - 1 }; }
      renderMonth(); renderList(); note();
    });
  }

  function addReminder() {
    var fecha = $('rem-date').value, title = $('rem-title').value.trim(), notes = $('rem-notes').value.trim(), rd = $('rem-days').value;
    $('rem-err').textContent = ''; $('rem-ok').textContent = '';
    if (!fecha) { $('rem-err').textContent = 'Elige la fecha.'; return; }
    if (title.length < 2) { $('rem-err').textContent = 'Escribe de qué es el recordatorio.'; return; }
    $('rem-add').disabled = true;
    api('POST', '/me/reminders', { fecha: fecha, title: title, notes: notes, remind_days: parseInt(rd, 10) }).then(function (j) {
      $('rem-add').disabled = false;
      if (j._status !== 200) { $('rem-err').textContent = j.message || 'No se pudo guardar.'; return; }
      $('rem-ok').textContent = 'Recordatorio guardado. Aparecerá en tu calendario y en Inicio cuando se acerque.';
      $('rem-title').value = ''; $('rem-notes').value = '';
      load(false);
    });
  }

  function boot() {
    load(true);
    $('cal-prev').addEventListener('click', function () { if (!data) return; view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderMonth(); });
    $('cal-next').addEventListener('click', function () { if (!data) return; view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderMonth(); });
    $('cal-days').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.cal-day'); if (!b) return;
      selected = b.getAttribute('data-day'); renderList();
      var el = $('rem-date'); if (el) el.value = selected;
      var it = document.querySelector('.cal-item.hl'); if (it) it.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('cal-list').addEventListener('click', function (e) {
      var d = e.target.closest && e.target.closest('[data-del]');
      if (d) { if (!confirm('¿Borrar este recordatorio?')) return; api('DELETE', '/me/reminders/' + d.getAttribute('data-del')).then(function () { load(false); }); return; }
      var k = e.target.closest && e.target.closest('[data-done]');
      if (k) { api('PATCH', '/me/reminders/' + k.getAttribute('data-done'), { done: k.getAttribute('data-val') === '1' }).then(function () { load(false); }); }
    });
    $('rem-add').addEventListener('click', addReminder);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
