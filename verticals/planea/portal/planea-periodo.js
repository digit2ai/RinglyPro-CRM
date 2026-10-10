/* PLANEA — a qué mes pertenece un ingreso o un gasto, en UN solo lugar.
   PURO y determinista (sin DOM, sin red). Corre en el navegador (window.PlaneaPeriodo) y en
   Node (module.exports), para que «Tu mes», la sección, la gráfica de evolución, el Puntaje
   Planea y el servidor decidan lo mismo sobre el mismo registro.

   LA REGLA (ajustes del 7 de octubre de 2026):
   - Cada ingreso y cada gasto lleva una FECHA DEL MOVIMIENTO (fecha_mov, AAAA-MM-DD).
   - Un registro «Único» cuenta SOLO en el mes de su fecha.
   - Un registro que se repite (Recurrente o Variable, o sin marca) cuenta desde el mes de
     su fecha EN ADELANTE: el salario registrado una vez sigue contando cada mes.
   - Un registro con fecha futura no cuenta hoy: aparece en su mes.
   - Un registro viejo sin fecha cuenta siempre (nada cambia para quien ya usaba la app).
   Las demás secciones (ahorro, deuda, inversión, seguros, retiro) son saldos, no
   movimientos: esta regla no las toca. */
(function (root) {
  'use strict';

  var CATS = { ingreso: 1, gasto: 1 };

  function num(x) { var v = +x; return isFinite(v) ? v : 0; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Hoy en Colombia (UTC-5 todo el año), como AAAA-MM-DD.
  function hoy(now) {
    var d = new Date((now ? +new Date(now) : Date.now()) - 5 * 3600 * 1000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function ymDe(fecha) { var m = /^(\d{4})-(\d{2})/.exec(String(fecha || '')); return m ? m[1] + '-' + m[2] : ''; }
  function sumaMeses(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }
  // ¿Es una fecha real del calendario? (2026-02-31 no lo es.)
  function fechaValida(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  // Rango aceptado: hasta 5 años atrás y 2 adelante. Más allá casi siempre es un error de dedo.
  function fechaEnRango(v, hoyStr) {
    if (!fechaValida(v)) return false;
    var h = hoyStr || hoy(), y = +h.slice(0, 4);
    return String(v) >= (y - 5) + h.slice(4) && String(v) <= (y + 2) + h.slice(4);
  }

  function esUnico(item) { return !!(item && item.meta && item.meta.behavior === 'unico'); }
  function aplica(item) { return !!(item && CATS[item.category]); }

  // ¿Este registro cuenta en el mes `ym` (AAAA-MM)?
  function cuentaEn(item, ym) {
    if (!aplica(item)) return true;                 // saldos: siempre
    var f = ymDe(item.fecha_mov);
    if (!f) return true;                            // registro viejo sin fecha
    return esUnico(item) ? f === ym : f <= ym;
  }
  function cuentaHoy(item, hoyStr) { return cuentaEn(item, ymDe(hoyStr || hoy())); }

  function totalMes(items, cat, ym) {
    return (items || []).reduce(function (s, it) {
      return it && it.category === cat && cuentaEn(it, ym) ? s + num(it.value) : s;
    }, 0);
  }

  // Serie mensual para la gráfica de evolución: hasta `n` meses seguidos, que siempre
  // incluyen el mes actual y muestran hasta 3 meses hacia adelante si hay algo programado.
  function serie(items, cat, hoyStr, n) {
    var act = ymDe(hoyStr || hoy()), max = n || 8;
    var fechas = (items || []).filter(function (it) { return it && it.category === cat; })
      .map(function (it) { return ymDe(it.fecha_mov); }).filter(Boolean).sort();
    if (!fechas.length) {
      var t = totalMes(items, cat, act);
      return t > 0 ? [{ ym: act, total: t, actual: true, futuro: false }] : [];
    }
    var fin = fechas[fechas.length - 1] > act ? fechas[fechas.length - 1] : act;
    if (fin > sumaMeses(act, 3)) fin = sumaMeses(act, 3);
    var ini = fechas[0] < act ? fechas[0] : act;
    if (ini < sumaMeses(fin, -(max - 1))) ini = sumaMeses(fin, -(max - 1));
    var out = [];
    for (var ym = ini; ym <= fin; ym = sumaMeses(ym, 1)) {
      out.push({ ym: ym, total: totalMes(items, cat, ym), actual: ym === act, futuro: ym > act });
    }
    return out;
  }

  // Etiqueta corta del registro para la lista: «Único · 12 sep 2026», «Desde 1 oct 2026»,
  // «Programado · 5 nov 2026».
  var MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fechaCorta(f) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f || ''));
    return m ? (+m[3]) + ' ' + MES[+m[2] - 1] + ' ' + m[1] : '';
  }
  function etiqueta(item, hoyStr) {
    if (!aplica(item) || !fechaValida(item.fecha_mov)) return '';
    var h = hoyStr || hoy(), fc = fechaCorta(item.fecha_mov);
    if (String(item.fecha_mov) > h) return 'Programado · ' + fc;
    return (esUnico(item) ? 'Único · ' : 'Desde ') + fc;
  }

  var api = { hoy: hoy, ymDe: ymDe, sumaMeses: sumaMeses, fechaValida: fechaValida, fechaEnRango: fechaEnRango,
    esUnico: esUnico, aplica: aplica, cuentaEn: cuentaEn, cuentaHoy: cuentaHoy, totalMes: totalMes,
    serie: serie, fechaCorta: fechaCorta, etiqueta: etiqueta };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PlaneaPeriodo = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));
