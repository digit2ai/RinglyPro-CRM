/* PLANEA — fecha de declaración de renta a partir de los dos últimos dígitos de la cédula.
   UN SOLO MÓDULO para el navegador (window.PlaneaTax) y para Node (SIT), así la tarjeta
   de Impuestos, el aviso de Inicio y las pruebas no pueden calcular cosas distintas.

   UNA SOLA FUENTE: la tabla anual de la DIAN que Planea carga y VALIDA en el módulo
   administrativo (dian.cjs), servida en /planea/api/v1/tax/calendar. Sin tabla validada
   no hay fecha: no existe ventana estimada (revisión de Planea, 20-sep-2026).
   Maya y la app recuerdan fechas; nunca afirman que el usuario esté obligado a declarar. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlaneaTax = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DAY = 86400000;

  // Dos últimos dígitos -> 1..100 ("00" es el último grupo, como en el calendario DIAN).
  function digitsToN(d) {
    var s = String(d == null ? '' : d).replace(/\D/g, '').slice(-2);
    if (s.length !== 2) return null;
    var n = parseInt(s, 10);
    return n === 0 ? 100 : n;
  }
  function isoDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null; }
  function utcDay(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmt(iso) { var p = iso.split('-'); return (+p[2]) + ' de ' + MESES[+p[1] - 1] + ' de ' + p[0]; }

  // Una tabla válida: { year, ranges:[{from,to,date:'YYYY-MM-DD'}] } con from/to 1..100.
  function validTable(t) {
    if (!t || typeof t !== 'object' || !Array.isArray(t.ranges) || !t.ranges.length) return false;
    return t.ranges.every(function (r) {
      return r && Number.isInteger(r.from) && Number.isInteger(r.to) && r.from >= 1 && r.to <= 100 && r.from <= r.to && isoDay(r.date);
    });
  }

  // Fecha de declaración para esos dígitos. year = año del calendario vigente.
  function forDigits(digits, table, year) {
    var n = digitsToN(digits);
    if (n == null) return null;
    if (validTable(table)) {
      for (var i = 0; i < table.ranges.length; i++) {
        var r = table.ranges[i];
        if (n >= r.from && n <= r.to) {
          return { kind: 'exacta', date: r.date, label: fmt(r.date), start: r.date, end: r.date, year: +r.date.slice(0, 4), source: table.source || null };
        }
      }
      return null; // tabla presente pero sin ese grupo: no se inventa uno
    }
    return null; // sin tabla validada no hay fecha
  }

  // ¿Se muestra el aviso hoy? Desde `days` días antes del inicio hasta la fecha límite
  // exacta. Pasada esa fecha no se avisa: el
  // calendario del año siguiente aún no existe y no se adivina.
  function reminder(digits, table, todayIso, days) {
    var today = isoDay(todayIso);
    if (!today) return null;
    var d = forDigits(digits, table, +today.slice(0, 4));
    if (!d) return null;
    var lead = Number.isFinite(+days) && +days >= 0 ? +days : 30;
    var t = utcDay(today), s = utcDay(d.start), e = utcDay(d.end);
    if (t > e) return null;
    if (t < s - lead * DAY) return null;
    return Object.assign({}, d, { days_left: Math.max(0, Math.round((s - t) / DAY)) });
  }

  // Hoy en zona Colombia, como YYYY-MM-DD (el servidor y el teléfono pueden estar en otra).
  function todayColombia(now) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now || new Date());
    } catch (e) { return new Date(now || Date.now()).toISOString().slice(0, 10); }
  }

  return { digitsToN: digitsToN, validTable: validTable, forDigits: forDigits, reminder: reminder, todayColombia: todayColombia, fmt: fmt };
});
