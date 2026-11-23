'use strict';
/**
 * Lee el estado de cuenta en PDF de BBVA (Maestra PYME) y de HSBC (Cuenta de cheques), tal como
 * el banco lo entrega. PURO: recibe las celdas {x, t} que saca pdf-child.js, sin base ni red.
 *
 * HSBC escribe parte del texto en EBCDIC (código de página 037 de mainframe): "ñô" es "14",
 * "[@ðKðò" es "$ 0.02". Cada celda se traduce antes de leer.
 *
 * Convenciones (las mismas de la carga del 2026-11-15, para que la huella de cada movimiento sea
 * idéntica y subir otra vez el mismo mes no duplique nada):
 *   HSBC  concepto = la descripción (espacios colapsados) · referencia = la columna Referencia
 *   BBVA  concepto = renglón 1 + " · " + renglón 2 · referencia = los dígitos que siguen a "Ref." ·
 *         contraparte = el último renglón cuando el movimiento trae 4 o más (el nombre en un SPEI)
 *
 * HONESTIDAD: nada se adivina. Saldo inicial + movimientos debe dar el saldo final que imprime el
 * banco (y, en BBVA, el número y total de cargos y abonos). Si no da, el resultado lo dice
 * (cuadra=false) y la carga no se hace sola.
 */

const EBC = {};
const put = (start, s) => [...s].forEach((ch, i) => { EBC[start + i] = ch; });
put(0xF0, '0123456789'); put(0xC1, 'ABCDEFGHI'); put(0xD1, 'JKLMNOPQR'); put(0xE2, 'STUVWXYZ');
put(0x81, 'abcdefghi'); put(0x91, 'jklmnopqr'); put(0xA2, 'stuvwxyz');
Object.assign(EBC, { 0x40: ' ', 0x4B: '.', 0x6B: ',', 0x5B: '$', 0x61: '/', 0x60: '-', 0x7A: ':', 0x4E: '+', 0x5C: '*', 0x6D: '_', 0x7D: "'",
  0x4D: '(', 0x5D: ')', 0x7E: '=', 0x6C: '%', 0x50: '&', 0x7B: '#', 0x7C: '@', 0x4C: '<', 0x6E: '>', 0x6F: '?', 0x5E: ';', 0x7F: '"', 0x69: 'Ñ', 0x49: 'ñ', 0x5A: '!' });
/** Traduce una celda si está en EBCDIC (sin espacios ASCII, con bytes altos, y todo traducible). */
function ebcdic(s) {
  s = String(s == null ? '' : s);
  if (/ /.test(s) || !/[\u0080-ÿ]/.test(s)) return s;
  let o = '';
  for (const ch of s) { const c = ch.charCodeAt(0); if (!(c in EBC)) return s; o += EBC[c]; }
  return o;
}

const MONEY = /^\$?\s*-?\s*[\d,]+\.\d{2}$/;
const cents = (t) => { const s = String(t).replace(/[$\s,]/g, ''); return /^-?\d+\.\d{2}$/.test(s) ? Math.round(Number(s) * 100) : null; };
const isMoney = (t) => MONEY.test(String(t).trim());
const MES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n) => String(n).padStart(2, '0');
function validISO(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f); if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
/** Une celdas que el PDF partió en una letra acentuada ("Informaci" "ó" "n") sin meter espacios. */
function unir(cells) {
  let s = '';
  cells.forEach((c, i) => {
    const t = String(c.t);
    if (i && !(t.length === 1 && /[^\x00-\x7f]/.test(t)) && !(String(cells[i - 1].t).length === 1 && /[^\x00-\x7f]/.test(cells[i - 1].t))) s += ' ';
    s += t;
  });
  return s.replace(/\s+/g, ' ').trim();
}

/** Renglones de todas las páginas, con las celdas ya traducidas. */
function renglones(pages, decodificar) {
  const out = [];
  for (const p of pages || []) for (const r of p || []) {
    const cells = (r || []).filter((c) => c && c.t != null && String(c.t).trim() !== '').map((c) => ({ x: Number(c.x) || 0, t: (decodificar ? ebcdic(String(c.t)) : String(c.t)).trim() }));
    if (cells.length) out.push(cells);
  }
  return out;
}

function detectarBanco(texto) {
  if (/maestra pyme bbva|bbva mexico, s\.a\./.test(texto)) return 'bbva';
  if (/hsbc mexico s\.a\.|detalle movimientos cuenta de cheques/.test(texto)) return 'hsbc';
  return null;
}

/** El primer importe de un renglón cuyo texto cumple re (solo celdas a partir de xMin). */
function importeDe(rows, re, xMin) {
  for (const r of rows) {
    const txt = fold(unir(r));
    if (!re.test(txt)) continue;
    const m = r.filter((c) => c.x >= (xMin || 0)).map((c) => (isMoney(c.t) ? cents(c.t) : cents(String(c.t).replace(/^.*\$\s*/, '')))).filter((v) => v != null);
    if (m.length) return m[m.length - 1];
  }
  return null;
}

function leer(pages) {
  // Solo HSBC usa EBCDIC: en otro banco una "ó" suelta se traduciría a "3".
  // HSBC a veces escribe en EBCDIC hasta su propio nombre: se detecta con y sin traducir.
  const banco = detectarBanco(fold(renglones(pages, false).slice(0, 400).map(unir).join(' | '))) ||
    (detectarBanco(fold(renglones(pages, true).slice(0, 400).map(unir).join(' | '))) === 'hsbc' ? 'hsbc' : null);
  if (!banco) return { error: 'no_es_estado_de_cuenta' };
  const rows = renglones(pages, banco === 'hsbc');
  const texto = fold(rows.slice(0, 400).map(unir).join(' | '));
  const per = texto.match(/(\d{2})\/(\d{2})\/(\d{4}) al (\d{2})\/(\d{2})\/(\d{4})/);
  if (!per) return { error: 'sin_periodo', banco };
  const desde = `${per[3]}-${per[2]}-${per[1]}`, hasta = `${per[6]}-${per[5]}-${per[4]}`;
  let cuenta = null;
  const mc = banco === 'hsbc' ? texto.match(/cuenta de cheques no\.\s*(\d{8,12})/) : texto.match(/no\. (?:de )?cuenta (\d{8,12})/);
  if (mc) cuenta = mc[1];

  let saldoIni, saldoFin, totAb = null, totCa = null, nAb = null, nCa = null;
  if (banco === 'bbva') {
    saldoIni = importeDe(rows, /saldo de operacion inicial/, 300);
    saldoFin = importeDe(rows, /saldo de operacion final/, 300);
    for (const r of rows) {
      const t = fold(unir(r));
      const m = t.match(/depositos \/ abonos \(\+\) (\d+) ([\d,]+\.\d{2})/); if (m && nAb == null) { nAb = +m[1]; totAb = cents(m[2]); }
      const k = t.match(/retiros \/ cargos \(-\) (\d+) ([\d,]+\.\d{2})/); if (k && nCa == null) { nCa = +k[1]; totCa = cents(k[2]); }
    }
  } else {
    saldoIni = importeDe(rows, /^saldo inicial del/, 400);
    saldoFin = importeDe(rows, /^saldo final del/, 400);
  }

  // Columnas del detalle: se toman del encabezado (se repite en cada página).
  let col = null;
  const movs = [];
  let actual = null;
  const cerrar = () => { if (actual) { movs.push(actual); actual = null; } };
  for (const r of rows) {
    const t = fold(unir(r));
    const hc = r.find((c) => /^(retiro\/cargo|cargos)$/.test(fold(c.t))), ha = r.find((c) => /^(deposito\/abono|abonos)$/.test(fold(c.t)));
    const hs0 = hc && r.find((c) => c.x > hc.x && /^saldo$/.test(fold(c.t)));
    if (hc && (ha || hs0)) {
      // HSBC imprime "Depósito/Abono" con otra fuente que no se puede leer: queda entre Cargo y Saldo.
      const hax = ha ? ha.x : hc.x + 72;
      const hs = r.find((c) => c.x > hax && /^(saldo|operaci)/.test(fold(c.t)));
      const hd = r.find((c) => /^(descripcion|cod\. descripci)/.test(fold(c.t)));
      col = { cargo: hc.x, abono: hax, saldo: hs ? hs.x : hax + 90, desc: hd ? hd.x : null };
      cerrar(); continue;
    }
    if (!col) continue;
    const f0 = r[0];
    let fecha = null;
    if (banco === 'bbva') {
      const m = /^(\d{2})\/([A-Z]{3})$/.exec(f0.t);
      if (m && MES[m[2]] && f0.x < 30) {
        const mes = MES[m[2]];
        const y = mes < +per[2] ? +per[6] : +per[3];
        fecha = `${y}-${pad(mes)}-${m[1]}`;
      }
    } else if (/^\d{2}$/.test(f0.t) && f0.x < 60 && r.some((c) => isMoney(c.t))) {
      const d = +f0.t;
      const [y, mo] = d >= +per[1] ? [per[3], per[2]] : [per[6], per[5]];
      fecha = `${y}-${mo}-${pad(d)}`;
    }
    if (fecha && validISO(fecha)) {
      cerrar();
      const dinero = r.filter((c) => isMoney(c.t));
      if (!dinero.length) continue;
      const amt = dinero[0];
      const lim1 = (col.cargo + col.abono) / 2, lim2 = (col.abono + col.saldo) / 2;
      if (amt.x >= lim2) continue; // solo saldo, sin movimiento
      const signo = amt.x < lim1 ? -1 : 1;
      const saldoCell = dinero.find((c) => c.x >= lim2);
      const xDesc = banco === 'hsbc' ? f0.x + 8 : col.desc != null ? col.desc - 8 : 55;
      const descCells = r.filter((c) => c !== f0 && c.x >= xDesc && c.x < col.cargo - 25 && !isMoney(c.t) && !(banco === 'bbva' && /^\d{2}\/[A-Z]{3}$/.test(c.t)));
      let ref = null;
      if (banco === 'hsbc') {
        const rc = descCells.filter((c) => c.x >= 270 && /^\d{4,}$/.test(c.t));
        ref = rc.length ? rc[0].t : null;
        actual = { fecha, lineas: [unir(descCells.filter((c) => !rc.includes(c)))], ref, monto: signo * cents(amt.t), saldo: saldoCell ? cents(saldoCell.t) : null, renglon: movs.length };
      } else {
        actual = { fecha, lineas: [unir(descCells)], ref: null, monto: signo * cents(amt.t), saldo: saldoCell ? cents(saldoCell.t) : null };
      }
      continue;
    }
    // Renglón de continuación (BBVA): una sola celda en la columna de descripción.
    if (actual && banco === 'bbva' && r.length === 1 && col.desc != null && Math.abs(r[0].x - col.desc) <= 8 && !isMoney(r[0].t)) {
      if (actual.lineas.length < 8) actual.lineas.push(r[0].t.replace(/\s+/g, ' ').trim());
      continue;
    }
    if (actual && !(banco === 'hsbc' && r.length === 1 && /^\d+$/.test(r[0].t))) cerrar();
  }
  cerrar();

  const movimientos = movs.map((m) => {
    let concepto = m.lineas[0] || '';
    let referencia = m.ref, contraparte = null;
    if (banco === 'bbva') {
      if (m.lineas[1]) concepto += ' · ' + m.lineas[1];
      const rf = (m.lineas[1] || m.lineas[0] || '').match(/Ref\. (\d+)/); // solo números: "Ref. ******3114" no es referencia
      referencia = rf ? rf[1] : null;
      if (m.lineas.length >= 4) { const u = m.lineas[m.lineas.length - 1]; if (/[A-Za-z]{3}/.test(u) && !/\d{6,}/.test(u)) contraparte = u; }
    }
    return { fecha: m.fecha, concepto: concepto.slice(0, 300), referencia, contraparte, monto: m.monto };
  });
  const abonos = movimientos.filter((m) => m.monto > 0), cargos = movimientos.filter((m) => m.monto < 0);
  const sumAb = abonos.reduce((s, m) => s + m.monto, 0), sumCa = -cargos.reduce((s, m) => s + m.monto, 0);
  const calculado = saldoIni == null ? null : saldoIni + sumAb - sumCa;
  const problemas = [];
  if (saldoIni == null) problemas.push('no se encontró el saldo inicial');
  if (saldoFin == null) problemas.push('no se encontró el saldo final');
  if (calculado != null && saldoFin != null && calculado !== saldoFin) problemas.push('saldo inicial + movimientos no da el saldo final');
  if (totAb != null && (totAb !== sumAb || nAb !== abonos.length)) problemas.push('los abonos no dan el total impreso');
  if (totCa != null && (totCa !== sumCa || nCa !== cargos.length)) problemas.push('los cargos no dan el total impreso');
  if (!movimientos.length) problemas.push('no se encontraron movimientos');
  return {
    banco, nombre: banco === 'bbva' ? 'Estado de cuenta BBVA' : 'Estado de cuenta HSBC', cuenta, terminacion: cuenta ? cuenta.slice(-4) : null,
    desde, hasta, saldo_inicial: saldoIni, saldo_final: saldoFin, saldo_calculado: calculado,
    abonos: { n: abonos.length, total: sumAb, impreso: totAb, n_impreso: nAb }, cargos: { n: cargos.length, total: sumCa, impreso: totCa, n_impreso: nCa },
    movimientos, cuadra: !problemas.length, problemas
  };
}

/** Lo convierte a los renglones que entiende importarBanco (fechas ISO, saldo corrido). */
function aRenglones(ec) {
  const out = [['Fecha', 'Concepto', 'Referencia', 'Cargo', 'Abono', 'Saldo', 'Contraparte']];
  let s = ec.saldo_inicial;
  for (const m of ec.movimientos) {
    if (s != null) s += m.monto;
    out.push([m.fecha, m.concepto, m.referencia || '', m.monto < 0 ? (-m.monto / 100).toFixed(2) : '', m.monto > 0 ? (m.monto / 100).toFixed(2) : '', s == null ? '' : (s / 100).toFixed(2), m.contraparte || '']);
  }
  return out;
}

module.exports = { leer, aRenglones, ebcdic, cents };
