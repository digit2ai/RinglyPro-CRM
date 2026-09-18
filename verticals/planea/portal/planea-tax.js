/* PLANEA — fecha de declaración de renta a partir de los dos últimos dígitos de la cédula.
   UN SOLO MÓDULO para el navegador (window.PlaneaTax) y para Node (SIT), así la tarjeta
   de Impuestos, el aviso de Inicio y las pruebas no pueden calcular cosas distintas.

   Dos fuentes, y la etiqueta dice cuál se usó:
   - "exacta": la tabla anual de la DIAN (dos dígitos -> fecha límite) que Planea entrega.
     Vive en verticals/planea/data/dian-calendar-<año>.json y se sirve en
     /planea/api/v1/tax/calendar. La regla es la misma cada año; cambian las fechas.
   - "estimada": mientras no exista esa tabla, las ventanas referenciales de siempre, con
     una fecha de inicio aproximada para poder avisar. Nunca se presentan como exactas.
   Maya y la app recuerdan fechas; nunca afirman que el usuario esté obligado a declarar. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlaneaTax = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Ventanas REFERENCIALES por dos últimos dígitos (persona natural). Inicio y fin
  // aproximados (MM-DD) solo para poder avisar a tiempo; se muestran como "estimada".
  var WINDOWS = [
    { from: 1, to: 6, win: 'segunda quincena de agosto', start: '08-16', end: '08-31' },
    { from: 7, to: 16, win: 'última semana de agosto', start: '08-25', end: '08-31' },
    { from: 17, to: 28, win: 'primera semana de septiembre', start: '09-01', end: '09-07' },
    { from: 29, to: 40, win: 'segunda semana de septiembre', start: '09-08', end: '09-14' },
    { from: 41, to: 52, win: 'tercera semana de septiembre', start: '09-15', end: '09-21' },
    { from: 53, to: 64, win: 'última semana de septiembre', start: '09-24', end: '09-30' },
    { from: 65, to: 76, win: 'primera semana de octubre', start: '10-01', end: '10-07' },
    { from: 77, to: 88, win: 'segunda semana de octubre', start: '10-08', end: '10-14' },
    { from: 89, to: 100, win: 'tercera semana de octubre', start: '10-15', end: '10-21' }
  ];
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
    var y = year || new Date().getFullYear();
    for (var j = 0; j < WINDOWS.length; j++) {
      var w = WINDOWS[j];
      if (n >= w.from && n <= w.to) {
        return { kind: 'estimada', window: w.win, label: w.win + ' de ' + y, start: y + '-' + w.start, end: y + '-' + w.end, year: y };
      }
    }
    return null;
  }

  // ¿Se muestra el aviso hoy? Desde `days` días antes del inicio hasta la fecha límite
  // (exacta) o el fin de la ventana (estimada). Pasada esa fecha no se avisa: el
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

  return { WINDOWS: WINDOWS, digitsToN: digitsToN, validTable: validTable, forDigits: forDigits, reminder: reminder, todayColombia: todayColombia, fmt: fmt };
});
