/**
 * ENRUTA - Estado de documentos: DERIVADO, nunca leído en frío de la columna.
 *
 * El campo `estado` de enruta_documentos se calculaba UNA sola vez, al crear el
 * documento, y nada volvía a tocarlo. Con el tiempo el tablero mentía: 83
 * documentos marcados "por_vencer_30_dias" llevaban seis meses vencidos, y el
 * contador de "por vencer" mostraba 234 mientras /documentos/por-vencer
 * devolvía una lista vacía.
 *
 * Aquí el estado se deriva de fecha_vencimiento en CADA lectura y los filtros
 * consultan rangos de fecha en vez de la columna, así que no puede volver a
 * desincronizarse por el simple paso del tiempo.
 *
 * 'renovado' y 'suspendido' son estados de ciclo de vida: no se deducen de una
 * fecha y se respetan tal como están guardados.
 */
const { Op } = require('sequelize');

const TERMINALES = ['renovado', 'suspendido'];

// Del más urgente al menos urgente. `desde`/`hasta` son días hasta el
// vencimiento (negativo = ya venció); null = sin límite por ese lado.
const ESCALA = [
  { estado: 'vencido', desde: null, hasta: -1 },
  { estado: 'por_vencer_7_dias', desde: 0, hasta: 7 },
  { estado: 'por_vencer_15_dias', desde: 8, hasta: 15 },
  { estado: 'por_vencer_30_dias', desde: 16, hasta: 30 },
  { estado: 'vigente', desde: 31, hasta: null }
];

const DIA_MS = 86400000;

/** Hoy en Colombia (UTC-5), no en la zona del servidor. */
function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function aISO(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) return fecha.toISOString().slice(0, 10);
  return String(fecha).slice(0, 10);
}

function aUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function sumarDias(iso, dias) {
  return new Date(aUTC(iso) + dias * DIA_MS).toISOString().slice(0, 10);
}

function diasParaVencer(fechaVencimiento, hoy = hoyBogota()) {
  const iso = aISO(fechaVencimiento);
  if (!iso) return null;
  return Math.round((aUTC(iso) - aUTC(hoy)) / DIA_MS);
}

function estadoDesdeFecha(fechaVencimiento, hoy = hoyBogota()) {
  const dias = diasParaVencer(fechaVencimiento, hoy);
  if (dias === null) return null;
  const tramo = ESCALA.find(t =>
    (t.desde === null || dias >= t.desde) &&
    (t.hasta === null || dias <= t.hasta)
  );
  return tramo ? tramo.estado : 'vigente';
}

function agruparContiguos(indices) {
  const grupos = [];
  for (const i of indices) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && i === ultimo[ultimo.length - 1] + 1) ultimo.push(i);
    else grupos.push([i]);
  }
  return grupos;
}

function rangoFecha(grupo, hoy) {
  const min = ESCALA[grupo[0]];
  const max = ESCALA[grupo[grupo.length - 1]];
  const cond = {};
  if (min.desde !== null) cond[Op.gte] = sumarDias(hoy, min.desde);
  if (max.hasta !== null) cond[Op.lte] = sumarDias(hoy, max.hasta);
  return Object.getOwnPropertySymbols(cond).length ? cond : null;
}

/**
 * Fragmento `where` para uno o varios estados, expresado en fechas.
 * Se combina por spread con el resto del where (tenant_id, tipo_documento...).
 */
function whereEstado(estados, hoy = hoyBogota()) {
  const lista = (Array.isArray(estados) ? estados : [estados]).filter(Boolean);
  const condiciones = lista
    .filter(e => TERMINALES.includes(e))
    .map(e => ({ estado: e }));

  const indices = [...new Set(
    lista.filter(e => !TERMINALES.includes(e))
      .map(e => ESCALA.findIndex(t => t.estado === e))
  )].filter(i => i >= 0).sort((a, b) => a - b);

  for (const grupo of agruparContiguos(indices)) {
    // Un documento renovado o suspendido nunca cuenta como vencido ni por vencer.
    const cond = { estado: { [Op.notIn]: TERMINALES } };
    const rango = rangoFecha(grupo, hoy);
    if (rango) cond.fecha_vencimiento = rango;
    condiciones.push(cond);
  }

  if (!condiciones.length) return {};
  if (condiciones.length === 1) return condiciones[0];
  return { [Op.or]: condiciones };
}

/**
 * El mismo cálculo en SQL, para agregaciones (GROUP BY / COUNT) donde no hay
 * instancia del modelo sobre la cual correr el getter.
 * `hoy` se genera aquí, nunca viene del request.
 */
function sqlEstado(alias = 'EnrutaDocumento', hoy = hoyBogota()) {
  const col = `"${alias}"."fecha_vencimiento"`;
  const est = `"${alias}"."estado"`;
  const lim = n => `DATE '${sumarDias(hoy, n)}'`;
  return `CASE
    WHEN ${est} IN ('renovado','suspendido') THEN ${est}
    WHEN ${col} IS NULL THEN ${est}
    WHEN ${col} < DATE '${hoy}' THEN 'vencido'
    WHEN ${col} <= ${lim(7)} THEN 'por_vencer_7_dias'
    WHEN ${col} <= ${lim(15)} THEN 'por_vencer_15_dias'
    WHEN ${col} <= ${lim(30)} THEN 'por_vencer_30_dias'
    ELSE 'vigente'
  END`;
}

/** Orden por urgencia real, sin depender de la columna. */
function sqlPrioridad(alias = 'EnrutaDocumento', hoy = hoyBogota()) {
  const col = `"${alias}"."fecha_vencimiento"`;
  const lim = n => `DATE '${sumarDias(hoy, n)}'`;
  return `CASE
    WHEN ${col} < DATE '${hoy}' THEN 1
    WHEN ${col} <= ${lim(7)} THEN 2
    WHEN ${col} <= ${lim(15)} THEN 3
    WHEN ${col} <= ${lim(30)} THEN 4
    ELSE 5
  END`;
}

module.exports = {
  TERMINALES,
  ESCALA,
  hoyBogota,
  sumarDias,
  diasParaVencer,
  estadoDesdeFecha,
  whereEstado,
  sqlEstado,
  sqlPrioridad
};
