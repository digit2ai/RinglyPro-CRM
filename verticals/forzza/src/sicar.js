'use strict';
/**
 * Lector de reportes de SICAR (punto de venta de Forzza). PURO: sin base de datos ni red.
 *
 * SICAR no tiene API pública ni acceso documentado a su base. Lo que sí hace, en todos sus
 * reportes, es "Previa (F3)" y guardar en PDF o Excel (manual.sicar.mx/reportes). Este archivo
 * lee esos reportes tal como SICAR los imprime, reconociendo cada uno por su título y sus columnas
 * (tomadas del manual oficial y de un reporte real de Forzza):
 *
 *   Reporte General de Compras ............ Fecha, Doc., Folio, Proveedor, Caja, Usuario, Est, Total
 *   Reporte General de Ventas ............. Documento, Fecha, Folio, Cliente, Caja, Usuario, Folio F., Est, Total
 *   Reporte de Créditos de Proveedores .... No. Prv, Nombre, Teléfono, Celular, Saldo
 *                                           + por documento: Folio, Fecha de Créd., Vencimiento, Est., Total, Abonos, Saldo
 *   Reporte de Créditos a Clientes ........ igual, con No. Cli
 *   Créditos ... por Periodo de Tiempo .... No., Nombre, 0-30, 31-60, 61-90, 91-120, > 121 Días, TOTAL
 *   Reporte de Abonos de Clientes / a Proveedor .. Fecha, Caja, Usuario, Doc Ori, Folio, Fecha Doc, FP, Referencia, Total
 *
 * Entrada: renglones de celdas {x, t} (x = posición en el PDF, o número de columna en Excel).
 * Cada celda se asigna a la columna cuyo encabezado está más cerca: así no se adivina dónde
 * termina el folio y empieza el proveedor (en el texto plano del PDF vienen pegados).
 *
 * HONESTIDAD: nada se inventa. Un renglón que no se puede leer se reporta con su motivo; y si la
 * suma de lo leído no da el "Total" que imprime SICAR, el resultado lo dice (cuadra=false).
 */

const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').replace(/[:]+$/, '').trim();
const MONEY = /^-?\s*\$?\s*-?\s*[\d,]+(\.\d{1,2})?$/;

/** "$ 12,000.00" / "-$ 1,000.00" / 12000 -> centavos (entero). null si no es un importe. */
function cents(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  const s = String(v == null ? '' : v).trim();
  if (!s || !MONEY.test(s) || !/\d/.test(s)) return null;
  const neg = s.includes('-');
  const n = Number(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return (neg ? -1 : 1) * Math.round(n * 100);
}
const isMoney = (t) => typeof t === 'number' || (MONEY.test(String(t).trim()) && /[$.,]/.test(String(t)));

function validISO(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f); if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
/** SICAR imprime día/mes/año. También acepta el número de serie de Excel. */
function fecha(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/);
  if (!m) return null;
  const f = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return validISO(f) ? f : null;
}
const isFecha = (t) => !!fecha(t);

/* ── definiciones de reporte ─────────────────────────────────────────── */
const C = {
  fecha: /^fecha$/, doc: /^doc\.?$|^documento$/, folio: /^folio$/, caja: /^caja$/, usuario: /^usuario$/, est: /^est\.?$/, total: /^total$/,
  folio_f: /^folio f\.?$/, num_prv: /^no\.? ?prv\.?$/, num_cli: /^no\.? ?cli\.?$/, nombre: /^nombre$/, telefono: /^telefono$/, celular: /^celular$/,
  saldo: /^saldo$/, fecha_cred: /^fecha de cred/, vencimiento: /^venci?mi?e?n?o?$|^vencimiento$/, abonos: /^abonos$/,
  d0: /^0 ?- ?30/, d31: /^31 ?- ?60/, d61: /^61 ?- ?90/, d91: /^91 ?- ?120/, d121: /121/, doc_ori: /^doc ori/, fecha_doc: /^fecha doc/, fp: /^fp$/, referencia: /^referencia$|^multipago referencia$/
};
const REPORTES = {
  compras_general: { titulo: /reporte general de compras/, parte: 'proveedor',
    tabla: { fecha: C.fecha, doc: C.doc, folio: C.folio, proveedor: /^proveedor$/, caja: C.caja, usuario: C.usuario, est: C.est, total: C.total } },
  ventas_general: { titulo: /reporte general de ventas/, parte: 'cliente',
    tabla: { doc: C.doc, fecha: C.fecha, folio: C.folio, cliente: /^cliente$/, caja: C.caja, usuario: C.usuario, folio_f: C.folio_f, est: C.est, total: C.total } },
  periodo_clientes: { titulo: /creditos a clientes por periodo/, parte: 'cliente',
    tabla: { num: C.num_cli, nombre: C.nombre, d0: C.d0, d31: C.d31, d61: C.d61, d91: C.d91, d121: C.d121, total: C.total } },
  periodo_proveedores: { titulo: /creditos (a|de) proveedores por periodo/, parte: 'proveedor',
    tabla: { num: C.num_prv, nombre: C.nombre, d0: C.d0, d31: C.d31, d61: C.d61, d91: C.d91, d121: C.d121, total: C.total } },
  creditos_clientes: { titulo: /reporte de creditos a clientes(?! por)/, parte: 'cliente', credito: true,
    tabla: { num: C.num_cli, nombre: C.nombre, telefono: C.telefono, celular: C.celular, saldo: C.saldo },
    detalle: { folio: C.folio, fecha: C.fecha_cred, vencimiento: C.vencimiento, est: C.est, total: C.total, abonos: C.abonos, saldo: C.saldo } },
  creditos_proveedores: { titulo: /reporte de creditos (de|a) proveedores(?! por)/, parte: 'proveedor', credito: true,
    tabla: { num: C.num_prv, nombre: C.nombre, telefono: C.telefono, celular: C.celular, saldo: C.saldo },
    detalle: { folio: C.folio, fecha: C.fecha_cred, vencimiento: C.vencimiento, est: C.est, total: C.total, abonos: C.abonos, saldo: C.saldo } },
  abonos_clientes: { titulo: /reporte de abonos de clientes/, parte: 'cliente', etiqueta: /^cliente$/,
    tabla: { fecha: C.fecha, caja: C.caja, usuario: C.usuario, doc_ori: C.doc_ori, folio: C.folio, fecha_doc: C.fecha_doc, fp: C.fp, referencia: C.referencia, total: C.total } },
  abonos_proveedores: { titulo: /reporte de abonos (a|de) proveedor/, parte: 'proveedor', etiqueta: /^proveedor$/,
    tabla: { fecha: C.fecha, caja: C.caja, usuario: C.usuario, doc_ori: C.doc_ori, folio: C.folio, fecha_doc: C.fecha_doc, fp: C.fp, referencia: C.referencia, total: C.total } }
};
const NOMBRES = {
  compras_general: 'Reporte General de Compras', ventas_general: 'Reporte General de Ventas', periodo_clientes: 'Créditos a Clientes por Periodo',
  periodo_proveedores: 'Créditos de Proveedores por Periodo', creditos_clientes: 'Reporte de Créditos a Clientes', creditos_proveedores: 'Reporte de Créditos de Proveedores',
  abonos_clientes: 'Reporte de Abonos de Clientes', abonos_proveedores: 'Reporte de Abonos a Proveedor'
};

/** Cuántas celdas de un renglón son encabezados de esta tabla, y dónde está cada columna. */
function encabezado(row, tabla) {
  const cols = [];
  for (const c of row) {
    const n = norm(c.t);
    for (const [k, re] of Object.entries(tabla)) if (re.test(n) && !cols.some((x) => x.k === k)) { cols.push({ k, x: c.x }); break; }
  }
  return cols.length >= Math.min(4, Object.keys(tabla).length - 1) ? cols.sort((a, b) => a.x - b.x) : null;
}
/** Asigna cada celda a la columna más cercana (límites a la mitad entre encabezados). */
function asignar(row, cols) {
  const out = {};
  for (const c of row) {
    let i = 0;
    while (i < cols.length - 1 && c.x > (cols[i].x + cols[i + 1].x) / 2) i++;
    const k = cols[i].k;
    out[k] = out[k] == null ? c.t : out[k] + ' ' + c.t;
  }
  return out;
}

const CHROME = /^(pagina \d|generado por sicar|codigo de colores)/;
const FILTRO = /^(caja|usuario|doc|documento|detalle|proveedor|cliente|estado|orden|periodo|tipo|grupo|vendedor|f\. de pago)$/;

/** Renglones de todas las páginas, en orden, sin el pie de página. */
function renglones(pages) {
  const out = [];
  for (const p of pages || []) for (const r of p || []) {
    const cells = (r || []).filter((c) => c && c.t != null && String(c.t).trim() !== '');
    if (!cells.length) continue;
    if (cells.some((c) => CHROME.test(norm(c.t)))) continue;
    out.push(cells.map((c) => ({ x: Number(c.x) || 0, t: typeof c.t === 'number' ? c.t : String(c.t).trim() })));
  }
  return out;
}
/** Etiquetas de filtro "Estado: Por Pagar" del encabezado del reporte (celda-etiqueta y la siguiente). */
function filtros(rows) {
  const f = {};
  for (const r of rows.slice(0, 40)) {
    for (let i = 0; i < r.length; i++) {
      const raw = String(r[i].t);
      const n = norm(raw);
      const m = raw.match(/^([^:]{2,20}):\s*(.+)$/);
      if (m && FILTRO.test(norm(m[1]))) { f[norm(m[1])] = m[2].trim(); continue; }
      if (/:$/.test(raw.trim()) && FILTRO.test(n) && r[i + 1] && !/:$/.test(String(r[i + 1].t).trim())) f[n] = String(r[i + 1].t).trim();
    }
  }
  if (f.periodo) {
    const ds = String(f.periodo).match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
    f.desde = fecha(ds[0]); f.hasta = fecha(ds[1]);
  }
  // En el PDF el periodo puede venir en celdas separadas: "01/01/2026", "-", "12/11/2026".
  if (!f.hasta) for (const r of rows.slice(0, 6)) {
    const i = r.findIndex((c) => /^periodo/.test(norm(c.t)));
    if (i >= 0) { const ds = r.slice(i + 1).map((c) => fecha(c.t)).filter(Boolean); if (ds.length) { f.desde = ds[0]; f.hasta = ds[1] || null; } }
  }
  return f;
}
function detectar(rows) {
  const titulo = rows.slice(0, 12).map((r) => r.map((c) => norm(c.t)).join(' ')).join(' | ');
  for (const [k, d] of Object.entries(REPORTES)) if (d.titulo.test(titulo)) return k;
  // Sin título (alguien borró renglones del Excel): por las columnas.
  for (const r of rows.slice(0, 40)) {
    for (const k of ['creditos_proveedores', 'creditos_clientes', 'periodo_clientes', 'periodo_proveedores', 'compras_general', 'ventas_general', 'abonos_clientes']) {
      const cols = encabezado(r, REPORTES[k].tabla);
      if (cols && cols.length >= Object.keys(REPORTES[k].tabla).length - 1) return k;
    }
  }
  return null;
}

/** El "Total :" final que imprime SICAR (el último importe en un renglón que dice Total). */
function totalImpreso(rows) {
  let t = null;
  for (const r of rows) {
    const txt = r.map((c) => norm(c.t)).join(' ');
    if (/^total ?(general|compra)?$|total :|^total general|total$/.test(txt.replace(/\$.*$/, '').trim()) || /^total( general)?$/.test(norm(r[0].t))) {
      const m = r.map((c) => cents(c.t)).filter((v) => v != null);
      if (m.length) t = m[m.length - 1];
    }
  }
  return t;
}

/* ── lectores por tipo ───────────────────────────────────────────────── */
function leerTabla(rows, def, tipo) {
  const filas = [], errores = [];
  let cols = null, vio = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const h = encabezado(r, def.tabla);
    if (h) { cols = h; vio = true; continue; }
    if (!cols) continue;
    const txt = norm(r.map((c) => c.t).join(' '));
    if (txt === 'resumen') break; // el RESUMEN final repite los totales: no son renglones
    if (/^(devoluciones|totales por forma de pago|resumen)$/.test(txt)) { if (tipo !== 'compras_general' || txt !== 'devoluciones') cols = null; continue; }
    if (/^total/.test(txt) || /total (compra|devolucion|general)/.test(txt)) continue;
    const a = asignar(r, cols);
    if (tipo === 'compras_general' || tipo === 'ventas_general') {
      // En la sección Devoluciones de Compras, SICAR imprime "Devolución" en la columna Fecha y la fecha en Doc.
      let f = fecha(a.fecha), doc = a.doc;
      if (!f && /devoluci/.test(norm(a.fecha)) && fecha(a.doc)) { f = fecha(a.doc); doc = 'DEV'; }
      const total = cents(a.total);
      if (!f && total == null) continue;
      if (!f || total == null) { errores.push({ renglon: i + 1, motivo: !f ? 'fecha' : 'total', texto: r.map((c) => c.t).join(' ').slice(0, 120) }); continue; }
      const parte = String(a[def.parte] || '').trim();
      filas.push({ fecha: f, doc: String(doc || '').trim().toUpperCase() || null, folio: a.folio != null ? String(a.folio).trim() : null, parte,
        caja: a.caja || null, usuario: a.usuario || null, folio_f: a.folio_f || null, est: String(a.est || '').trim().toUpperCase() || null, total });
    } else {
      const nombre = String(a.nombre || '').trim();
      const total = cents(a.total);
      if (!nombre || total == null) { if (nombre || total != null) errores.push({ renglon: i + 1, motivo: 'renglon_incompleto', texto: r.map((c) => c.t).join(' ').slice(0, 120) }); continue; }
      filas.push({ num: a.num != null ? String(a.num).trim() : null, parte: nombre, d0: cents(a.d0) || 0, d31: cents(a.d31) || 0, d61: cents(a.d61) || 0, d91: cents(a.d91) || 0, d121: cents(a.d121) || 0, total });
    }
  }
  return { filas, errores, columnas: vio };
}

function leerCreditos(rows, def) {
  const filas = [], errores = [], partes = [];
  let pcols = null, dcols = null, modo = null, actual = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const txt = norm(r.map((c) => c.t).join(' '));
    const hp = encabezado(r, def.tabla), hd = encabezado(r, def.detalle);
    if (hd && (!hp || hd.length > hp.length)) { dcols = hd; modo = 'detalle'; continue; }
    if (hp) { pcols = hp; modo = 'parte'; continue; }
    if (/lista de devoluci/.test(txt)) { modo = 'devoluciones'; continue; }
    if (/^total/.test(txt)) continue;
    const tieneFecha = r.some((c) => isFecha(c.t));
    // Renglón de la persona: número de cliente/proveedor, nombre y saldo, sin fechas.
    if (pcols && !tieneFecha && /^\d+$/.test(String(r[0].t)) && isMoney(r[r.length - 1].t)) {
      const a = asignar(r, pcols);
      actual = { num: String(a.num || '').trim(), parte: String(a.nombre || '').trim(), telefono: a.telefono || null, celular: a.celular || null, saldo: cents(a.saldo) };
      partes.push(actual); modo = 'parte';
      continue;
    }
    if (modo === 'devoluciones') continue;
    if (modo === 'detalle' && dcols && tieneFecha) {
      const a = asignar(r, dcols);
      const total = cents(a.total), saldo = cents(a.saldo), f = fecha(a.fecha);
      if (!actual || !f || total == null || saldo == null) { errores.push({ renglon: i + 1, motivo: !actual ? 'sin_persona' : 'renglon_incompleto', texto: r.map((c) => c.t).join(' ').slice(0, 120) }); continue; }
      const folio = String(a.folio == null ? '' : a.folio).trim();
      filas.push({ parte: actual.parte, num: actual.num, telefono: actual.telefono, celular: actual.celular, folio: folio && folio !== '-' ? folio : null,
        fecha: f, vencimiento: fecha(a.vencimiento), est: String(a.est || '').trim().toUpperCase() || null, total, abonos: cents(a.abonos) || 0, saldo });
    }
  }
  return { filas, errores, partes, columnas: !!(pcols || dcols), con_detalle: !!dcols };
}

function leerAbonos(rows, def) {
  const filas = [], errores = [];
  let cols = null, actual = null;
  const cerrar = () => { if (actual) { if (actual.total == null) errores.push({ renglon: actual.renglon, motivo: 'total' }); else filas.push(actual); actual = null; } };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const h = encabezado(r, def.tabla);
    if (h) { cols = h; continue; }
    if (!cols) continue;
    const txt = norm(r.map((c) => c.t).join(' '));
    if (/^total/.test(txt)) { cerrar(); continue; }
    const iEt = r.findIndex((c) => def.etiqueta.test(norm(c.t)));
    if (iEt >= 0) { // "Cliente: Daniela Macias   Representante: Daniela Macias   $ 100.00"
      if (actual) {
        const sig = r.slice(iEt + 1); const j = sig.findIndex((c) => /^representante/.test(norm(c.t)));
        actual.parte = (j >= 0 ? sig.slice(0, j) : sig).filter((c) => !isMoney(c.t)).map((c) => c.t).join(' ').trim();
        const m = r.map((c) => cents(c.t)).filter((v) => v != null); if (actual.total == null && m.length) actual.total = m[m.length - 1];
      }
      continue;
    }
    const a = asignar(r, cols);
    if (fecha(a.fecha)) {
      cerrar();
      actual = { renglon: i + 1, fecha: fecha(a.fecha), caja: a.caja || null, usuario: a.usuario || null, doc_ori: a.doc_ori || null, folio: a.folio != null ? String(a.folio).trim() : null,
        fecha_doc: fecha(a.fecha_doc), fp: a.fp || null, referencia: a.referencia || null, total: cents(a.total), parte: null };
      continue;
    }
    // SICAR centra el total entre los dos renglones del abono: a veces queda en un renglón propio.
    const m = r.map((c) => cents(c.t)).filter((v) => v != null);
    if (actual && actual.total == null && m.length === 1 && r.length === 1) actual.total = m[0];
  }
  cerrar();
  return { filas: filas.map(({ renglon, ...x }) => x), errores, columnas: !!cols };
}

/**
 * Lee un reporte. pages = [[ [ {x,t}, ... ] /renglón ] /página ]. Devuelve el tipo, los filtros,
 * los renglones leídos, los que no se pudieron leer, y si la suma cuadra con el total de SICAR.
 */
function leer(pages) {
  const rows = renglones(pages);
  const tipo = detectar(rows);
  if (!tipo) return { error: 'no_es_reporte_sicar' };
  const def = REPORTES[tipo];
  const f = filtros(rows);
  const r = def.credito ? leerCreditos(rows, def) : def.etiqueta ? leerAbonos(rows, def) : leerTabla(rows, def, tipo);
  if (!r.columnas) return { error: 'sin_columnas', tipo };
  // Sin detalle ("Tipo: No") el reporte solo trae el saldo de cada persona: se guarda como foto de saldos,
  // nunca como facturas (no trae folio, fecha ni vencimiento, y no se inventan).
  const soloSaldos = !!(def.credito && !r.con_detalle);
  if (soloSaldos && !(r.partes || []).length) return { error: 'sin_detalle', tipo, ayuda: 'En SICAR genera el reporte con "Tipo: Sí" (detalle de documentos) para importar folio por folio.' };
  const impreso = totalImpreso(rows);
  let leido = null;
  // SICAR imprime Total = documentos (vigentes y cancelados con su reverso) menos devoluciones.
  if (tipo === 'compras_general' || tipo === 'ventas_general') leido = r.filas.reduce((s, x) => s + (x.doc === 'DEV' ? -x.total : x.total), 0);
  else if (def.credito) leido = (r.partes || []).reduce((s, p) => s + (p.saldo || 0), 0);
  else if (def.etiqueta) leido = r.filas.reduce((s, x) => s + x.total, 0);
  else leido = r.filas.reduce((s, x) => s + x.total, 0);
  // Créditos: además, el saldo de cada persona debe ser la suma del saldo de sus documentos.
  let partesQueNoCuadran = [];
  if (def.credito && !soloSaldos) partesQueNoCuadran = r.partes.filter((p) => p.saldo != null && r.filas.filter((x) => x.parte === p.parte && x.num === p.num).reduce((s, x) => s + x.saldo, 0) !== p.saldo).map((p) => p.parte);
  return {
    tipo, nombre: NOMBRES[tipo], parte: def.parte, filtros: f, solo_saldos: soloSaldos, vista: vistaDe(f.estado), filas: r.filas, partes: r.partes || [], errores: r.errores,
    total_impreso: impreso, total_leido: leido,
    cuadra: impreso == null ? null : impreso === leido,
    partes_que_no_cuadran: partesQueNoCuadran
  };
}
/** El filtro Estado de un reporte de créditos: 'Vencidos', 'Por Pagar', 'Pagados', 'Todos'. */
function vistaDe(estado) {
  const n = norm(estado || '');
  if (!n) return null;
  if (/vencid/.test(n)) return 'vencidos';
  if (/por pagar|pendiente/.test(n)) return 'por_pagar';
  if (/pagad/.test(n)) return 'pagados';
  if (/todo/.test(n)) return 'todos';
  return n.slice(0, 30);
}
/** Una hoja de Excel (arreglo de arreglos) al mismo formato de celdas: x = número de columna. */
function desdeHoja(rows) {
  return [(rows || []).map((r) => (r || []).map((v, i) => ({ x: i * 100, t: v })).filter((c) => c.t !== '' && c.t != null))];
}

module.exports = { leer, desdeHoja, cents, fecha, norm, REPORTES, NOMBRES };
