'use strict';
/**
 * Lectores PUROS de los documentos reales de NeoHaul (sin base de datos, sin red),
 * escritos contra los archivos que mandaron el 10-nov-2026:
 *
 *  - cleanOcr      la propuesta del lector de tickets (vale HTR No. 41971): valida cada
 *                  campo, convierte kg -> t de forma determinista y avisa cuando algo no cuadra.
 *  - diesel*       el CFDI de la gasolinera (Estación de Servicio J6, factura CC-17637,
 *                  33 cargas, $82,649.57) en PDF de Gas Manager o en XML CFDI 4.0.
 *  - parsePps      su «Propuesta de Pagos Semanal» (PPS S46, 95 facturas, 16 columnas).
 *
 * REGLA: nada se adivina. Un dato que no se lee queda null; una factura cuyas cargas no
 * suman exactamente su total no se acepta; una fila del PPS inválida se reporta, no se brinca.
 */
const M = require('./money');

const str = (v, max) => (v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const strOrNull = (v, max) => str(v, max) || null;
const isoDate = (s) => (M.lunes(s) ? s : null);
const num = (v) => { if (v === '' || v == null) return null; if (typeof v === 'number') return Number.isFinite(v) ? v : null; const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; };
const cents = (v) => Math.round(Number(v) * 100);
const fold = (s) => String(s == null ? '' : s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const alnum = (s) => fold(s).replace(/[^A-Z0-9]/g, '');
/** Para COMPARAR placas: O y 0, I y 1 se confunden a mano y en fotos. Nunca se guarda así. */
const placaKey = (s) => alnum(s).replace(/O/g, '0').replace(/I/g, '1');

/** dd/mm/aaaa, dd-mm-aa o aaaa-mm-dd -> aaaa-mm-dd válido, o null. */
function fechaMx(s) {
  const t = String(s == null ? '' : s).trim();
  if (isoDate(t.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return isoDate(`${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
}
/** "21070 kg" -> {kg:21070}; "21.07 t" -> {t:21.07}. Sin unidad explícita no se interpreta. */
function peso(s) {
  const m = String(s == null ? '' : s).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|t|ton|tons|toneladas?)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return /^k/i.test(m[2]) ? { kg: n } : { t: n };
}
const ID_RE = /^[A-Za-z0-9\-/ ]{1,30}$/;
const idOrNull = (v) => (ID_RE.test(String(v == null ? '' : v).trim()) ? String(v).trim() : null);

/**
 * Normaliza la propuesta del lector. Idempotente: limpiar su propia salida da lo mismo
 * (así se puede guardar en nh_viajes.ocr sin perder datos).
 */
function cleanOcr(o) {
  if (!o || typeof o !== 'object') return null;
  const avisos = [];
  const bruto = peso(o.peso_bruto), tara = peso(o.peso_tara), neto = peso(o.peso_neto);
  let toneladas = num(typeof o.toneladas === 'number' ? o.toneladas : String(o.toneladas == null ? '' : o.toneladas).replace(/[^\d.,]/g, '').replace(',', '.'));
  let origen_t = toneladas != null ? 'impreso' : null;
  if (toneladas == null && neto) { toneladas = neto.kg != null ? Math.round(neto.kg) / 1000 : neto.t; origen_t = neto.kg != null ? 'kg_a_t' : 'impreso'; }
  if (toneladas != null && !(toneladas > 0 && toneladas <= 80)) { toneladas = null; origen_t = null; avisos.push('peso_fuera_de_rango'); }
  if (bruto && tara && neto && bruto.kg != null && tara.kg != null && neto.kg != null && Math.abs(bruto.kg - tara.kg - neto.kg) > 1) avisos.push('neto_no_cuadra');
  if (o.peso_tara && /manual/i.test(String(o.peso_tara))) avisos.push('tara_manual');
  const fecha = fechaMx(o.fecha);
  const fechaEscrita = fechaMx(o.fecha_escrita);
  if (fecha && fechaEscrita && fecha !== fechaEscrita) avisos.push('fecha_escrita_distinta');
  const placas = strOrNull(o.placas, 20), placasEscritas = strOrNull(o.placas_escritas, 20);
  if (placas && placasEscritas && placaKey(placas) !== placaKey(placasEscritas)) avisos.push('placas_distintas');
  const transportista = strOrNull(o.transportista, 80);
  if (transportista && !/NEO\s*HAUL/i.test(transportista)) avisos.push('otro_transportista');
  const folio = idOrNull(o.folio), vale = idOrNull(o.vale_no);
  return {
    ticket_no: idOrNull(o.ticket_no) || folio,
    vale_no: vale, folio, pedido: idOrNull(o.pedido),
    fecha: fecha || fechaEscrita, fecha_impresa: strOrNull(o.fecha_impresa || o.fecha, 30), fecha_escrita: strOrNull(o.fecha_escrita, 30), hora: strOrNull(o.hora, 8),
    placas, placas_escritas: placasEscritas, cliente: strOrNull(o.cliente, 60), producto: strOrNull(o.producto, 60), destino: strOrNull(o.destino, 60),
    operador: strOrNull(o.operador, 80), temperatura: strOrNull(o.temperatura, 20), transportista,
    peso_bruto: strOrNull(o.peso_bruto, 30), peso_tara: strOrNull(o.peso_tara, 30), peso_neto: strOrNull(o.peso_neto, 30),
    toneladas, origen_toneladas: o.origen_toneladas === 'kg_a_t' && origen_t === 'impreso' ? 'kg_a_t' : origen_t,
    legible: ['si', 'parcial', 'no'].includes(o.legible) ? o.legible : 'parcial',
    avisos
  };
}

/** Sugiere camión, obra y chofer a partir de la lectura. Solo sugiere: Andrés confirma. */
function sugerir(p, cat) {
  const out = { truck_id: null, obra_id: null, driver_id: null };
  if (!p) return out;
  const pk = [p.placas, p.placas_escritas].filter(Boolean).map(placaKey);
  const tr = (cat.trucks || []).filter((t) => t.active !== false && t.placas && pk.includes(placaKey(t.placas)));
  if (tr.length === 1) out.truck_id = tr[0].id;
  const dk = alnum(p.destino);
  if (dk.length >= 2) {
    const ob = (cat.obras || []).filter((o) => o.active !== false && ((o.clave && alnum(o.clave) === dk) || alnum(o.nombre).endsWith(dk)));
    if (ob.length === 1) out.obra_id = ob[0].id;
  }
  const toks = fold(p.operador).split(/[^A-Z]+/).filter((x) => x.length >= 3);
  if (toks.length) {
    const scored = (cat.drivers || []).filter((d) => d.active !== false).map((d) => {
      const dt = fold(d.nombre).split(/[^A-Z]+/).filter(Boolean);
      return { d, s: toks.filter((t) => dt.some((x) => x.startsWith(t) || t.startsWith(x))).length };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    if (scored.length && (scored.length === 1 || scored[0].s > scored[1].s)) out.driver_id = scored[0].d.id;
  }
  return out;
}

/* ── diésel: CFDI de la gasolinera ───────────────────────────────────── */
const MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DIC: 12 };
function fechaGm(s) { // "28/MAY/26 07:56:19"
  const m = String(s || '').match(/(\d{2})\/([A-Z]{3,4})\/(\d{2,4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
  if (!m || !MESES[m[2]]) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  const f = isoDate(`${y}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1]}`);
  return f ? { fecha: f, hora: m[4] || null } : null;
}
const money = (s) => num(String(s).replace(/^\$/, ''));
/** Comprueba y resume. Las cargas DEBEN sumar exactamente lo que la factura dice. */
const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
function cerrarDiesel(doc) {
  if (doc.cargas.length > 2000) return { error: 'demasiadas_cargas' };
  if (doc.uuid != null && !UUID_RE.test(String(doc.uuid))) doc.uuid = null;
  if (doc.folio != null) doc.folio = String(doc.folio).slice(0, 60);
  // Una carga sin litros o con importe negativo no es una carga: la factura se rechaza, no se corrige.
  if (doc.cargas.some((c) => !(c.litros > 0 && c.litros < 1e5) || !(c.importe >= 0 && c.importe < 1e7) || !(c.iva >= 0 && c.iva < 1e7))) return { error: 'carga_invalida' };
  const sum = (k) => doc.cargas.reduce((a, c) => a + cents(c[k]), 0) / 100;
  const calc = { importe: sum('importe'), iva: sum('iva'), total: sum('total') };
  const folios = new Set(); const repetidas = [];
  for (const c of doc.cargas) { if (folios.has(c.folio_despacho)) repetidas.push(c.folio_despacho); folios.add(c.folio_despacho); }
  const cuadra = doc.total != null && cents(calc.total) === cents(doc.total)
    && (doc.subtotal == null || cents(calc.importe) === cents(doc.subtotal)) && (doc.iva == null || cents(calc.iva) === cents(doc.iva));
  const litros = doc.cargas.reduce((a, c) => a + Math.round(c.litros * 1000), 0) / 1000;
  const porProducto = {};
  for (const c of doc.cargas) porProducto[c.producto] = Math.round(((porProducto[c.producto] || 0) + c.litros) * 1000) / 1000;
  return { ...doc, calculado: calc, cuadra, repetidas, litros, por_producto: porProducto };
}
/** Texto del PDF de Gas Manager (como lo da pdf-parse). */
function dieselFromPdfText(text) {
  const t = String(text || '');
  if (!/LTR\s*-\s*LITROS/.test(t)) return { error: 'no_es_factura_de_combustible' };
  const L = t.split(/\r?\n/).map((x) => x.trim());
  const uuid = (t.match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i) || [])[0] || null;
  let folio = null, fecha = null;
  const iu = uuid ? L.indexOf(uuid) : -1;
  if (iu >= 0) { folio = /^[A-Z]{0,5}-?\d{1,12}$/.test(L[iu + 1] || '') ? L[iu + 1] : null; const f = fechaGm(L[iu + 2]); fecha = f && f.fecha; }
  const prov = (t.match(/^E\d+\s*-\s*(.+)$/m) || [])[1] || null;
  const rfcs = [...t.matchAll(/RFC:\s*([A-ZÑ&]{3,4}-?\d{6}-?[A-Z0-9]{3})/g)].map((m) => m[1].replace(/-/g, ''));
  const tarjeta = (t.match(/Tarjeta:\s*(\d+)/) || [])[1] || null;
  const placasTarjeta = ((t.match(/Placas:[ \t]*([^\n]*)/) || [])[1] || '').trim() || null;
  const cargas = [];
  const re = /^(\d{8})(\d+\.\d{3})LTR\s*-\s*LITROS\$([\d,]+\.\d+)\$([\d,]+\.\d{2})\$([\d,]+\.\d{2})\$([\d,]+\.\d{2})([A-ZÑ ]+?)[A-Z]{2}\/[\w/]+-(\d+)$/;
  for (let i = 0; i < L.length; i++) {
    const m = L[i].match(re); if (!m) continue;
    const f = fechaGm(L[i + 1] || '');
    const importe = money(m[6]), iva = money(m[5]);
    cargas.push({ folio_despacho: m[8], fecha: f ? f.fecha : null, hora: f ? f.hora : null, producto: m[7].trim(), litros: Number(m[2]),
      precio: money(m[3]), importe, iva, total: M.fromCents(cents(importe) + cents(iva)) });
  }
  const tot = t.match(/\n\$([\d,]+\.\d{2})\n\$([\d,]+\.\d{2})\n\$([\d,]+\.\d{2})\n[\d.]+\nTasa/);
  if (!cargas.length) return { error: 'sin_cargas' };
  return cerrarDiesel({ formato: 'pdf', uuid, folio, fecha, proveedor: prov ? prov.trim() : null, rfc_emisor: rfcs[0] || null, rfc_receptor: rfcs[1] || null,
    tarjeta, placas_tarjeta: placasTarjeta, subtotal: tot ? money(tot[1]) : null, iva: tot ? money(tot[2]) : null, total: tot ? money(tot[3]) : null, cargas });
}
/** XML CFDI 4.0 (estándar del SAT). Sin muestra real de J6 todavía: las fechas de despacho no vienen en el XML. */
function dieselFromXml(xml) {
  let doc;
  try {
    const { XMLParser } = require('fast-xml-parser');
    doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, processEntities: false, allowBooleanAttributes: true }).parse(String(xml));
  } catch (_) { return { error: 'xml_ilegible' }; }
  const c = doc && doc.Comprobante;
  if (!c) return { error: 'no_es_cfdi' };
  const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const conceptos = arr(c.Conceptos && c.Conceptos.Concepto);
  const cargas = [];
  for (const k of conceptos) {
    const litros = num(k.Cantidad), importe = num(k.Importe);
    if (litros == null || importe == null) continue;
    const iva = arr(k.Impuestos && k.Impuestos.Traslados && k.Impuestos.Traslados.Traslado).filter((x) => String(x.Impuesto) === '002').reduce((a, x) => a + cents(num(x.Importe) || 0), 0) / 100;
    const ident = String(k.NoIdentificacion || '');
    cargas.push({ folio_despacho: (ident.match(/(\d+)$/) || [])[1] || ident.slice(-40) || String(cargas.length + 1), fecha: null, hora: null,
      producto: str(k.Descripcion, 30).toUpperCase() || 'COMBUSTIBLE', litros, precio: num(k.ValorUnitario), importe, iva, total: M.fromCents(cents(importe) + cents(iva)) });
  }
  if (!cargas.length) return { error: 'sin_cargas' };
  const tfd = c.Complemento && c.Complemento.TimbreFiscalDigital;
  const ivaTot = c.Impuestos && c.Impuestos.TotalImpuestosTrasladados != null ? num(c.Impuestos.TotalImpuestosTrasladados) : null;
  return cerrarDiesel({ formato: 'xml', uuid: tfd ? tfd.UUID : null, folio: [c.Serie, c.Folio].filter(Boolean).join('-') || null, fecha: fechaMx(c.Fecha),
    proveedor: c.Emisor ? str(c.Emisor.Nombre, 200) : null, rfc_emisor: c.Emisor ? c.Emisor.Rfc : null, rfc_receptor: c.Receptor ? c.Receptor.Rfc : null,
    tarjeta: null, placas_tarjeta: null, subtotal: num(c.SubTotal), iva: ivaTot, total: num(c.Total), cargas });
}

/* ── PPS: propuesta de pagos semanal ─────────────────────────────────── */
const PPS_COLS = ['ORDEN', 'EMPRESA', 'NUM FACT', 'FECHA', 'TIPO', 'SALDO', 'PROVEEDOR', 'TOTAL FACT', 'CONCEPTO', 'CC', 'DESC CC', 'EXPLICACION', 'PRIORIDAD', 'SI NO PARCIAL', 'PAGO PARCIAL', 'PROPUESTA'];
function excelDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  return fechaMx(v);
}
function prioridad(v) {
  const s = fold(v).trim();
  if (!s) return null;
  if (/^(1|A|ALTA|URGENTE)/.test(s)) return 'alta';
  if (/^(2|M|MEDIA)/.test(s)) return 'media';
  if (/^(3|B|BAJA)/.test(s)) return 'baja';
  return null;
}
function categoria(proveedor) {
  const p = fold(proveedor);
  if (/ESTACION DE SERV|GASOLIN|COMBUSTIB|PEMEX/.test(p)) return 'diesel';
  if (/REFACCI|PARTES|AUTOPARTE/.test(p)) return 'refacciones';
  if (/LLANT/.test(p)) return 'llantas';
  if (/RECURSOS HUMANOS|NOMINA/.test(p)) return 'nomina';
  if (/TALLER|MECANIC/.test(p)) return 'taller';
  return 'otros';
}
/** rows = arreglo de arreglos (como sale de la hoja). */
function parsePps(rows) {
  const H = (c) => fold(c).replace(/\s+/g, ' ').trim();
  const hi = rows.findIndex((r) => r && r.map(H).includes('NUM FACT') && r.map(H).includes('PROVEEDOR'));
  if (hi < 0) return { error: 'no_es_pps', ayuda: 'No encontré las columnas NUM FACT y PROVEEDOR de la propuesta de pagos.' };
  const head = rows[hi].map(H);
  const col = (n) => head.indexOf(n);
  const ix = Object.fromEntries(PPS_COLS.map((n) => [n, col(n)]));
  for (const n of ['NUM FACT', 'FECHA', 'SALDO', 'PROVEEDOR', 'TOTAL FACT']) if (ix[n] < 0) return { error: 'falta_columna', columna: n };
  const g = (r, n) => (ix[n] >= 0 ? r[ix[n]] : '');
  const filas = [], errores = [], vistos = new Set();
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => String(c).trim() === '')) continue;
    const renglon = i + 1;
    const folio = str(g(r, 'NUM FACT'), 60), proveedor = str(g(r, 'PROVEEDOR'), 200);
    const fecha = excelDate(g(r, 'FECHA')), saldo = num(g(r, 'SALDO')), total = num(g(r, 'TOTAL FACT'));
    let motivo = null;
    if (!proveedor) motivo = 'sin_proveedor'; else if (!folio) motivo = 'sin_folio'; else if (!fecha) motivo = 'fecha';
    else if (total == null || total <= 0 || total > 1e9) motivo = 'total'; else if (saldo == null || saldo < 0 || cents(saldo) > cents(total)) motivo = 'saldo';
    const key = fold(proveedor) + '|' + fold(folio);
    if (!motivo && vistos.has(key)) motivo = 'repetida_en_el_archivo';
    if (motivo) { errores.push({ renglon, folio, proveedor, motivo }); continue; }
    vistos.add(key);
    const propuesta = num(g(r, 'PROPUESTA')), parcial = num(g(r, 'PAGO PARCIAL'));
    const ord = num(g(r, 'ORDEN'));
    filas.push({ renglon, orden: Number.isInteger(ord) && ord >= 0 && ord < 1e6 ? ord : null, empresa: strOrNull(g(r, 'EMPRESA'), 60), folio, fecha, tipo: strOrNull(g(r, 'TIPO'), 30), saldo: M.fromCents(cents(saldo)),
      proveedor, total: M.fromCents(cents(total)), concepto: strOrNull(g(r, 'CONCEPTO'), 300), cc: strOrNull(g(r, 'CC'), 60), desc_cc: strOrNull(g(r, 'DESC CC'), 120),
      explicacion: strOrNull(g(r, 'EXPLICACION'), 300), prioridad: prioridad(g(r, 'PRIORIDAD')), si_no_parcial: strOrNull(g(r, 'SI NO PARCIAL'), 20),
      pago_parcial: parcial != null && parcial > 0 ? parcial : null, propuesta: propuesta != null && propuesta > 0 ? propuesta : null, categoria: categoria(proveedor) });
  }
  // Su primer renglón trae los totales de la hoja: si existe, comprobamos que leímos lo mismo.
  const sumRow = hi > 0 ? rows[hi - 1] : null;
  const resumen = { facturas: filas.length, saldo: M.sum(filas.map((f) => f.saldo)), total: M.sum(filas.map((f) => f.total)) };
  let control = null;
  if (sumRow && num(sumRow[ix.SALDO]) != null) {
    control = { facturas: num(sumRow[0]), saldo: M.fromCents(cents(num(sumRow[ix.SALDO]))), total: M.fromCents(cents(num(sumRow[ix['TOTAL FACT']]))) };
    control.cuadra = cents(control.saldo) === cents(resumen.saldo) && cents(control.total) === cents(resumen.total) && (control.facturas == null || control.facturas === filas.length);
  }
  return { filas, errores, resumen, control };
}

/** Teléfono para wa.me: 10 dígitos = México (+52). Cualquier otro país debe escribirse con su lada (+1 813...). */
function waNumero(tel) {
  const raw = String(tel || '').trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (raw.startsWith('+') || raw.startsWith('00')) { d = d.replace(/^00/, ''); if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3); return d.length >= 11 && d.length <= 15 ? d : null; }
  if (d.length === 10) return '52' + d;
  if (d.length === 12 && d.startsWith('52')) return d;
  if (d.length === 13 && d.startsWith('521')) return '52' + d.slice(3);
  if (d.length === 11 && d.startsWith('1')) return d;
  return null;
}

module.exports = { cleanOcr, sugerir, placaKey, fechaMx, peso, dieselFromPdfText, dieselFromXml, cerrarDiesel, parsePps, PPS_COLS, excelDate, categoria, waNumero };
