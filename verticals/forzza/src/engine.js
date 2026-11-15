'use strict';
/**
 * Forzza — motor de capital. Es el ÚNICO lugar donde se calcula una cifra; las
 * rutas solo leen filas y la página solo dibuja. Todo en CENTAVOS enteros y
 * fechas YYYY-MM-DD (zona Monterrey). Sin base de datos, sin red: la SIT lo
 * prueba directo.
 *
 * Reglas (las mismas del simulador que vio Rafael, ahora sobre filas reales):
 *  - Efectivo hoy = suma de las cuentas con incluir=TRUE (saldo al cierre de
 *    fecha_saldo + movimientos posteriores). Una tarjeta fuera del efectivo no suma.
 *  - Proyección diaria = efectivo hoy + cobros pendientes en su vencimiento
 *    − pagos pendientes en su fecha − gastos fijos en cada ocurrencia.
 *    Solo cuenta la parte PENDIENTE: lo ya cobrado o pagado ya está en el banco.
 *  - Un cobro VENCIDO no se cuenta por defecto (no se sabe cuándo llega): se
 *    reporta aparte. Con la opción vencido='hoy' se cuenta hoy.
 *  - Un pago vencido SÍ se cuenta hoy: se debe.
 *  - Un pago programado usa su fecha programada; si no, su vencimiento.
 *  - Un gasto fijo cuenta solo las fechas posteriores a pagado_hasta.
 *  - La reserva mínima NULL no se inventa: sin reserva no hay alerta de reserva.
 */

const toC = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : null; };
const fromC = (c) => Math.round(c) / 100;

const RX = /^(\d{4})-(\d{2})-(\d{2})$/;
function valid(f) {
  const m = RX.exec(String(f || '')); if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
const iso = (d) => d.toISOString().slice(0, 10);
const parse = (f) => new Date(String(f).slice(0, 10) + 'T00:00:00Z');
function addDays(f, n) { const d = parse(f); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); } // b − a
const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** Vencimiento = fecha + días de crédito. */
function vencimiento(fecha, dias) { return valid(fecha) ? addDays(fecha, Math.max(0, Math.round(Number(dias) || 0))) : null; }

/** Saldo de una cuenta hoy: saldo al cierre de fecha_saldo + movimientos con fecha posterior (hasta hoy). */
function saldoCuenta(cuenta, movs, hoy) {
  let c = toC(cuenta.saldo_inicial) || 0;
  const desde = cuenta.fecha_saldo ? String(cuenta.fecha_saldo).slice(0, 10) : null;
  for (const m of movs) {
    if (m.cuenta_id !== cuenta.id) continue;
    const f = String(m.fecha).slice(0, 10);
    if (desde && f <= desde) continue;
    if (hoy && f > hoy) continue;
    c += toC(m.monto) || 0;
  }
  return c;
}

/** Saldo pendiente de un documento (total − abonos), nunca negativo. */
const pendiente = (total, pagos) => Math.max(0, (toC(total) || 0) - (pagos || []).reduce((a, p) => a + (toC(p.monto) || 0), 0));

/** Fechas en que cae un gasto fijo entre [desde, hasta], después de pagado_hasta. */
function ocurrencias(fijo, desde, hasta) {
  const out = [];
  if (!valid(desde) || !valid(hasta) || desde > hasta) return out;
  let ini = desde;
  if (fijo.desde && valid(String(fijo.desde).slice(0, 10)) && String(fijo.desde).slice(0, 10) > ini) ini = String(fijo.desde).slice(0, 10);
  let fin = hasta;
  if (fijo.hasta && valid(String(fijo.hasta).slice(0, 10)) && String(fijo.hasta).slice(0, 10) < fin) fin = String(fijo.hasta).slice(0, 10);
  const pagado = fijo.pagado_hasta ? String(fijo.pagado_hasta).slice(0, 10) : null;
  const push = (f) => { if (f >= ini && f <= fin && (!pagado || f > pagado)) out.push(f); };
  const d0 = parse(ini);
  if (fijo.frecuencia === 'semanal') {
    const target = Math.min(7, Math.max(1, Number(fijo.dia) || 5)); // 1=lun … 7=dom; por omisión viernes
    const dow = ((d0.getUTCDay() + 6) % 7) + 1;
    for (let f = addDays(ini, (target - dow + 7) % 7); f <= fin; f = addDays(f, 7)) push(f);
  } else {
    // Mensual: el día indicado (si el mes es corto, su último día). Quincenal: el 15 y el último día del mes.
    let y = d0.getUTCFullYear(), m = d0.getUTCMonth();
    for (let k = 0; k < 400; k++) {
      const ld = lastDay(y, m);
      const days = fijo.frecuencia === 'quincenal' ? [15, ld] : [Math.min(Math.max(1, Number(fijo.dia) || 1), ld)];
      for (const d of days) push(iso(new Date(Date.UTC(y, m, d))));
      if (iso(new Date(Date.UTC(y, m, ld))) >= fin) break;
      m++; if (m > 11) { m = 0; y++; }
    }
  }
  return out;
}

/**
 * Proyección. entrada:
 *  { hoy, horizonte, reserva (pesos o null), efectivo (centavos),
 *    cxc: [{id, cliente, folio, vencimiento, compromiso_fecha, pendiente(c)}],
 *    cxp: [{id, proveedor, folio, vencimiento, fecha_programada, estado, pendiente(c)}],
 *    fijos: [{id, concepto, categoria, monto, frecuencia, dia, desde, hasta, pagado_hasta}],
 *    extra: [{fecha, monto(c, + entra / − sale), concepto, tipo}]   // simulaciones, no se guardan
 *    opciones: { vencido: 'excluir'|'hoy', retraso: días de atraso en la cobranza } }
 */
function proyectar(e) {
  const hoy = e.hoy, H = Math.max(1, Math.min(366, Math.round(Number(e.horizonte) || 60)));
  const fin = addDays(hoy, H);
  const op = e.opciones || {};
  const retraso = Math.max(0, Math.min(180, Math.round(Number(op.retraso) || 0)));
  const reserva = e.reserva == null || e.reserva === '' ? null : toC(e.reserva);
  const eventos = [], fuera = [], vencidoNoContado = [];
  const add = (ev) => { if (ev.fecha > fin) fuera.push(ev); else eventos.push(ev); };

  for (const x of e.cxc || []) {
    if (!(x.pendiente > 0)) continue;
    const base = String(x.compromiso_fecha || x.vencimiento).slice(0, 10);
    const venc = String(x.vencimiento).slice(0, 10);
    const ev = { tipo: 'cobro', ref: 'cxc:' + x.id, concepto: `${x.cliente}${x.folio ? ' · ' + x.folio : ''}`, monto: x.pendiente, vencimiento: venc };
    if (base < hoy) {
      if (op.vencido === 'hoy') add({ ...ev, fecha: hoy, vencido: true });
      else vencidoNoContado.push({ ...ev, fecha: base, dias_vencido: diffDays(venc, hoy) });
    } else add({ ...ev, fecha: addDays(base, retraso) });
  }
  for (const x of e.cxp || []) {
    if (!(x.pendiente > 0)) continue;
    const f = String(x.fecha_programada || x.vencimiento).slice(0, 10);
    add({ tipo: 'pago', ref: 'cxp:' + x.id, concepto: `${x.proveedor}${x.folio ? ' · ' + x.folio : ''}`, monto: -x.pendiente,
      fecha: f < hoy ? hoy : f, vencido: f < hoy, estado: x.estado, vencimiento: String(x.vencimiento).slice(0, 10) });
  }
  for (const g of e.fijos || []) {
    if (g.active === false) continue;
    const m = toC(g.monto); if (!(m > 0)) continue;
    for (const f of ocurrencias(g, hoy, fin)) eventos.push({ tipo: 'fijo', ref: 'fijo:' + g.id, concepto: g.concepto, categoria: g.categoria, monto: -m, fecha: f });
  }
  for (const x of e.extra || []) if (valid(x.fecha) && Number.isFinite(x.monto) && x.monto) add({ tipo: x.tipo || 'simulado', ref: 'sim', concepto: x.concepto, monto: x.monto, fecha: x.fecha < hoy ? hoy : x.fecha, simulado: true });

  eventos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : b.monto - a.monto)); // mismo día: entradas primero
  const serie = [];
  let saldo = e.efectivo || 0, i = 0;
  for (let k = 0; k <= H; k++) {
    const f = addDays(hoy, k); let ent = 0, sal = 0;
    while (i < eventos.length && eventos[i].fecha === f) { const m = eventos[i].monto; if (m > 0) ent += m; else sal -= m; saldo += m; i++; }
    serie.push({ fecha: f, entradas: ent, salidas: sal, saldo });
  }
  let min = serie[0], primeroBajoReserva = null, primeroNegativo = null;
  for (const d of serie) {
    if (d.saldo < min.saldo) min = d;
    if (!primeroNegativo && d.saldo < 0) primeroNegativo = d.fecha;
    if (reserva != null && !primeroBajoReserva && d.saldo < reserva) primeroBajoReserva = d.fecha;
  }
  const sum = (arr, f) => arr.filter(f).reduce((a, x) => a + Math.abs(x.monto), 0);
  return {
    hoy, horizonte: H, hasta: fin, efectivo: e.efectivo || 0, reserva,
    serie, eventos, fuera, vencido_no_contado: vencidoNoContado,
    minimo: { saldo: min.saldo, fecha: min.fecha },
    final: serie[serie.length - 1].saldo,
    primero_bajo_reserva: primeroBajoReserva,
    primero_negativo: primeroNegativo,
    falta_para_cero: Math.max(0, -min.saldo),
    falta_para_reserva: reserva == null ? null : Math.max(0, reserva - min.saldo),
    entradas: sum(eventos, (x) => x.monto > 0),
    salidas: sum(eventos, (x) => x.monto < 0),
    opciones: { vencido: op.vencido === 'hoy' ? 'hoy' : 'excluir', retraso }
  };
}

/** Antigüedad de la cartera por días vencidos (al vencimiento, no a la fecha de venta). */
const TRAMOS = [['por_vencer', -Infinity, 0], ['d1_30', 1, 30], ['d31_60', 31, 60], ['d61_90', 61, 90], ['d90_mas', 91, Infinity]];
function antiguedad(cxc, hoy) {
  const out = { total: 0, vencido: 0, n: 0 };
  for (const [k] of TRAMOS) out[k] = { monto: 0, n: 0 };
  for (const x of cxc) {
    if (!(x.pendiente > 0)) continue;
    const d = diffDays(String(x.vencimiento).slice(0, 10), hoy);
    const t = TRAMOS.find(([, a, b]) => d >= a && d <= b) || TRAMOS[0];
    out[t[0]].monto += x.pendiente; out[t[0]].n++;
    out.total += x.pendiente; out.n++;
    if (d > 0) out.vencido += x.pendiente;
  }
  return out;
}

/**
 * Simulación de una venta a crédito: qué le pasa al punto más bajo si se acepta.
 * No guarda nada y no aprueba crédito: compara la proyección con y sin el pedido.
 * dias_* se cuentan desde hoy. anticipo en pesos (se cobra el día de entrega).
 */
function simularVenta(base, v) {
  const precio = toC(v.precio) || 0, costo = toC(v.costo) || 0, entrega = toC(v.entrega) || 0;
  const anticipo = Math.max(0, Math.min(precio, toC(v.anticipo) || 0));
  if (precio <= 0) return { error: 'precio_invalido' };
  const d = (n) => addDays(base.hoy, Math.max(0, Math.min(365, Math.round(Number(n) || 0))));
  const diaEntrega = d(v.dia_entrega), diaProv = d(v.dia_proveedor);
  const diaCobro = addDays(diaEntrega, Math.max(0, Math.min(365, Math.round(Number(v.dias_credito) || 0))));
  const extra = [];
  if (costo > 0) extra.push({ fecha: diaProv, monto: -costo, concepto: 'Material del pedido (simulado)', tipo: 'simulado' });
  if (entrega > 0) extra.push({ fecha: diaEntrega, monto: -entrega, concepto: 'Gastos de entrega (simulado)', tipo: 'simulado' });
  if (anticipo > 0) extra.push({ fecha: diaEntrega, monto: anticipo, concepto: 'Anticipo del pedido (simulado)', tipo: 'simulado' });
  if (precio - anticipo > 0) extra.push({ fecha: diaCobro, monto: precio - anticipo, concepto: 'Saldo del pedido a crédito (simulado)', tipo: 'simulado' });
  const sin = proyectar(base), con = proyectar({ ...base, extra: (base.extra || []).concat(extra) });
  return {
    margen: precio - costo - entrega, salida_antes_de_cobrar: costo + entrega, salida_neta: costo + entrega - anticipo,
    saldo_a_credito: precio - anticipo, fecha_cobro: diaCobro, anticipo,
    sin: { minimo: sin.minimo, final: sin.final, falta_para_reserva: sin.falta_para_reserva },
    con: { minimo: con.minimo, final: con.final, falta_para_reserva: con.falta_para_reserva, primero_negativo: con.primero_negativo, primero_bajo_reserva: con.primero_bajo_reserva },
    cambio_minimo: con.minimo.saldo - sin.minimo.saldo,
    serie_con: con.serie.map((x) => x.saldo), serie_sin: sin.serie.map((x) => x.saldo)
  };
}

/** Alertas en palabras, solo de cifras reales. */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** 2026-11-30 -> "30 de noviembre" (el texto de las alertas lo lee una persona). */
const fechaLarga = (f) => { const [y, m, d] = String(f).slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
function alertas(p, cartera, cxpVencido) {
  const out = [];
  const $ = (c) => '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p.primero_negativo) out.push({ nivel: 'alto', clave: 'negativo', texto: `El saldo queda en negativo el ${fechaLarga(p.primero_negativo)}. Faltan ${$(p.falta_para_cero)} para no quedar abajo de cero.` });
  if (p.reserva == null) out.push({ nivel: 'info', clave: 'sin_reserva', texto: 'Aún no hay reserva mínima definida (Ajustes).' });
  else if (p.primero_bajo_reserva) out.push({ nivel: p.primero_negativo ? 'medio' : 'alto', clave: 'reserva', texto: `El ${fechaLarga(p.primero_bajo_reserva)} el saldo baja de la reserva de ${$(p.reserva)}. Faltan ${$(p.falta_para_reserva)}.` });
  if (cartera && cartera.vencido > 0) out.push({ nivel: 'medio', clave: 'cartera_vencida', texto: `Clientes con pagos vencidos: ${$(cartera.vencido)}. Eso no se cuenta en la proyección hasta que haya fecha de pago.` });
  if (cxpVencido > 0) out.push({ nivel: 'medio', clave: 'pagos_vencidos', texto: `Pagos a proveedores vencidos: ${$(cxpVencido)} (se cuentan hoy).` });
  return out;
}

module.exports = { fechaLarga, toC, fromC, valid, addDays, diffDays, vencimiento, saldoCuenta, pendiente, ocurrencias, proyectar, antiguedad, simularVenta, alertas };
