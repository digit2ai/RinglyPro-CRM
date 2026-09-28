/* PLANEA — festivos de Colombia, CALCULADOS, no escritos a mano.
 *
 * Eduardo pidió (28-sep-2026) que el Calendario Planea muestre los días festivos junto al
 * calendario de la DIAN. Los festivos colombianos NO se inventan ni se copian de una página:
 * salen de la ley y de la fecha de Pascua, así que se calculan y el mismo código sirve para
 * 2026, 2027 y cualquier año. Escribir una lista a mano por año es justo lo que envejece.
 *
 * Reglas (Ley 35 de 1939, Ley 51 de 1983 "Emiliani", Decreto 2317 de 1983):
 * - FIJOS, nunca se mueven: 1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic.
 * - Se TRASLADAN al lunes siguiente (Emiliani): Reyes (6 ene), San José (19 mar),
 *   San Pedro y San Pablo (29 jun), Asunción (15 ago), Día de la Raza (12 oct),
 *   Todos los Santos (1 nov), Independencia de Cartagena (11 nov).
 * - De Semana Santa, NO se trasladan: Jueves Santo (Pascua - 3) y Viernes Santo (Pascua - 2).
 * - De Pascua y trasladados al lunes: Ascensión (Pascua + 43), Corpus Christi (Pascua + 64),
 *   Sagrado Corazón (Pascua + 71). Esos tres desplazamientos ya caen en lunes por definición.
 *
 * La Pascua se calcula con el algoritmo de Butcher (calendario gregoriano). Un festivo que
 * cae domingo se traslada igual al lunes; uno que ya cae lunes se queda donde está.
 */
'use strict';

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const utc = (y, m, d) => Date.UTC(y, m - 1, d);

// Domingo de Pascua (gregoriano) — algoritmo de Butcher.
function pascua(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, mes, dia);
}

// Lunes siguiente, o el mismo día si ya es lunes (getUTCDay: 0 domingo, 1 lunes).
function alLunes(ms) {
  const wd = new Date(ms).getUTCDay();
  return wd === 1 ? ms : ms + ((8 - wd) % 7) * DAY;
}

// [{ date:'YYYY-MM-DD', name, moved }] ordenados por fecha. Un año = 18 festivos.
function festivos(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1984 || y > 2100) return [];
  const p = pascua(y);
  const fijos = [
    [utc(y, 1, 1), 'Año Nuevo'], [utc(y, 5, 1), 'Día del Trabajo'],
    [utc(y, 7, 20), 'Día de la Independencia'], [utc(y, 8, 7), 'Batalla de Boyacá'],
    [utc(y, 12, 8), 'Inmaculada Concepción'], [utc(y, 12, 25), 'Navidad'],
  ];
  const trasladables = [
    [utc(y, 1, 6), 'Día de los Reyes Magos'], [utc(y, 3, 19), 'Día de San José'],
    [utc(y, 6, 29), 'San Pedro y San Pablo'], [utc(y, 8, 15), 'Asunción de la Virgen'],
    [utc(y, 10, 12), 'Día de la Raza'], [utc(y, 11, 1), 'Todos los Santos'],
    [utc(y, 11, 11), 'Independencia de Cartagena'],
  ];
  const pascuales = [[p - 3 * DAY, 'Jueves Santo', false], [p - 2 * DAY, 'Viernes Santo', false],
    [p + 43 * DAY, 'Ascensión del Señor', true], [p + 64 * DAY, 'Corpus Christi', true],
    [p + 71 * DAY, 'Sagrado Corazón', true]];

  const out = [];
  fijos.forEach(([ms, name]) => out.push({ date: iso(ms), name, moved: false }));
  trasladables.forEach(([ms, name]) => { const l = alLunes(ms); out.push({ date: iso(l), name, moved: l !== ms }); });
  pascuales.forEach(([ms, name, mover]) => { const f = mover ? alLunes(ms) : ms; out.push({ date: iso(f), name, moved: mover && f !== ms }); });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

// Mapa fecha -> nombre para varios años (el calendario se puede navegar hacia adelante).
function mapa(years) {
  const m = {};
  (Array.isArray(years) ? years : [years]).forEach((y) => festivos(y).forEach((f) => { m[f.date] = f.name; }));
  return m;
}

module.exports = { festivos, mapa, pascua, alLunes, _DAY: DAY };
