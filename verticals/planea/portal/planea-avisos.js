/* PLANEA — avisos en la app del Calendario Planea (Inicio).
   Pide /planea/api/v1/me/calendar y muestra los avisos de lo que viene: la fecha de renta
   (solo si Planea cargó y validó la tabla DIAN y el usuario guardó sus dos dígitos) y las
   metas con fecha objetivo cercana. "Entendido" oculta ese aviso en este dispositivo.
   Solo en la app: no envía correos ni mensajes (los correos de renta van aparte). */
(function () {
  'use strict';
  var KEY = 'planea-avisos-vistos';
  function seen() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function markSeen(id) { var s = seen(); s[id] = 1; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function corto(iso) { var p = iso.split('-'); return (+p[2]) + ' ' + MESES[+p[1] - 1]; }
  function cuando(n) { return n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : 'En ' + n + ' días'; }
  function mount() {
    var box = document.getElementById('cal-notices'); if (!box) return;
    fetch('/planea/api/v1/me/calendar', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.notices) return;
      var s = seen();
      var list = j.notices.filter(function (n) { return !s[n.id + '@' + n.date]; }).slice(0, 3);
      box.innerHTML = list.map(function (n) {
        return '<div class="tx-remind" data-av="' + esc(n.id + '@' + n.date) + '">' +
          '<span class="tx-remind-ic" aria-hidden="true">' + (n.origin === 'renta' ? 'DIAN' : 'META') + '</span>' +
          '<span style="flex:1"><b>' + esc(n.title) + ' · ' + cuando(n.days_left) + ' (' + corto(n.date) + ')</b>' +
          '<span data-tx="body">' + esc(n.detail) + '. <a href="/planea/portal/calendario" style="color:var(--green)">Ver calendario</a></span></span>' +
          '<button type="button" data-av-ok style="flex:none;background:none;border:0;color:var(--mut);font:inherit;font-size:12.5px;cursor:pointer;padding:4px">Entendido</button></div>';
      }).join('');
      box.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-av-ok]'); if (!b) return;
        var row = b.closest('[data-av]'); markSeen(row.getAttribute('data-av')); row.remove();
      });
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
