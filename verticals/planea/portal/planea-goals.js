/* PLANEA — reglas de una meta, en UN solo lugar.
   PURO y determinista (sin DOM, sin red). Corre en el navegador (window.PlaneaGoals) y en
   Node (module.exports), para que la pantalla Mis metas, el contador, el Calendario y los
   avisos de Inicio decidan lo mismo sobre la misma meta.

   Antes había dos reglas: la pantalla marcaba «Cumplida» al llegar al 100 %, pero el
   aviso de Inicio solo miraba el estado GUARDADO, así que una meta ya cumplida seguía
   avisando «En 3 días». Con una sola función eso no puede volver a pasar. */
(function (root) {
  'use strict';

  function num(x) { var v = +x; return isFinite(v) ? v : 0; }

  // Una meta está completa si el usuario la marcó cumplida, o si lo guardado alcanzó un
  // objetivo POSITIVO. Una meta sin monto (objetivo 0) solo se cumple a mano.
  function completa(g) {
    if (!g) return false;
    if (g.estado === 'cumplida') return true;
    return num(g.target_amount) > 0 && num(g.current_savings) >= num(g.target_amount);
  }

  // Estado que se muestra: manual (cumplida/archivada) o DERIVADO (cumplida al alcanzar el
  // monto, vencida al pasar la fecha objetivo sin cumplirse; si no, activa). §17.3.
  function estado(g, hoy) {
    if (!g) return 'activa';
    if (g.estado === 'archivada') return 'archivada';
    if (completa(g)) return 'cumplida';
    if (g.fecha_objetivo && hoy && String(g.fecha_objetivo) < String(hoy)) return 'vencida';
    return 'activa';
  }

  // Texto del contador de Mis metas. Dice cuántas hay de cada clase, con singular y
  // plural correctos, para que «1» nunca se lea como un error cuando en pantalla hay dos.
  function resumen(estados) {
    var n = { activa: 0, vencida: 0, cumplida: 0, archivada: 0 };
    (estados || []).forEach(function (e) { if (n[e] != null) n[e] += 1; });
    var p = [n.activa + (n.activa === 1 ? ' activa' : ' activas')];
    if (n.vencida) p.push(n.vencida + (n.vencida === 1 ? ' vencida' : ' vencidas'));
    if (n.cumplida) p.push(n.cumplida + (n.cumplida === 1 ? ' cumplida' : ' cumplidas'));
    if (n.archivada) p.push(n.archivada + (n.archivada === 1 ? ' archivada' : ' archivadas'));
    return p.join(' · ');
  }

  var api = { completa: completa, estado: estado, resumen: resumen };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PlaneaGoals = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null));
