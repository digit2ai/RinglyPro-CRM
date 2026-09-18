/* PLANEA — aviso de declaración de renta en Inicio. Lee los dos últimos dígitos que el
   usuario guardó en Impuestos (finance_meta.tributario.cedula2), pide la tabla DIAN al
   servidor y usa PlaneaTax.reminder: el aviso aparece solo desde N días antes de la
   ventana hasta su fin. Sin dígitos o fuera de fecha, no se dibuja nada. Solo en la app:
   no envía correos ni mensajes. */
(function () {
  'use strict';
  var API = '/planea/api/v1';
  function get(path) { return fetch(API + path, { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function mount() {
    var box = document.getElementById('tax-reminder');
    if (!box || !window.PlaneaTax) return;
    Promise.all([get('/me/profile'), get('/tax/calendar')]).then(function (res) {
      var prof = res[0], cal = res[1] || {};
      var t = prof && prof.finance_meta && prof.finance_meta.tributario;
      var d = t && String(t.cedula2 || '').replace(/\D/g, '').slice(-2);
      if (!d || d.length !== 2) return;
      var r = window.PlaneaTax.reminder(d, cal.table || null, window.PlaneaTax.todayColombia(), cal.reminder_days);
      if (!r) return;
      var when = r.days_left > 0 ? 'Faltan ' + r.days_left + (r.days_left === 1 ? ' día' : ' días') : 'Tu fecha ya empezó';
      box.querySelector('[data-tx=title]').textContent = 'Declaración de renta ' + r.year + ' · ' + when;
      box.querySelector('[data-tx=body]').textContent = (r.kind === 'exacta'
        ? 'Según el calendario DIAN, tu fecha es el ' + r.label + '.'
        : 'Tu ventana estimada es ' + r.label + '. Confírmala con el calendario oficial de la DIAN.') +
        ' Ten listos tus soportes (ingresos, retenciones, deducciones).';
      box.hidden = false;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
