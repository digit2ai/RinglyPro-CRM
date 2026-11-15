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
    minimo: { saldo: min.saldo, fecha: min.fecha, hasta: (() => { let i = serie.findIndex((d) => d.fecha === min.fecha); while (i + 1 < serie.length && serie[i + 1].saldo === min.saldo) i++; return serie[i].fecha; })() },
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
/** Movimientos que nacen de una venta a crédito (se derivan de la venta: no se guardan). */
function ventaEventos(hoy, v) {
  const precio = toC(v.precio) || 0, costo = toC(v.costo) || 0, entrega = toC(v.entrega) || 0;
  const anticipo = Math.max(0, Math.min(precio, toC(v.anticipo) || 0));
  if (precio <= 0) return { error: 'precio_invalido' };
  const d = (n) => addDays(hoy, Math.max(0, Math.min(365, Math.round(Number(n) || 0))));
  const diaEntrega = d(v.dia_entrega), diaProv = d(v.dia_proveedor);
  const diaCobro = addDays(diaEntrega, Math.max(0, Math.min(365, Math.round(Number(v.dias_credito) || 0))));
  const extra = [];
  if (costo > 0) extra.push({ fecha: diaProv, monto: -costo, concepto: 'Material del pedido (simulado)', tipo: 'simulado' });
  if (entrega > 0) extra.push({ fecha: diaEntrega, monto: -entrega, concepto: 'Gastos de entrega (simulado)', tipo: 'simulado' });
  if (anticipo > 0) extra.push({ fecha: diaEntrega, monto: anticipo, concepto: 'Anticipo del pedido (simulado)', tipo: 'simulado' });
  if (precio - anticipo > 0) extra.push({ fecha: diaCobro, monto: precio - anticipo, concepto: 'Saldo del pedido a crédito (simulado)', tipo: 'simulado' });
  return { extra, precio, costo, entrega, anticipo, diaCobro };
}
function simularVenta(base, v) {
  const ve = ventaEventos(base.hoy, v);
  if (ve.error) return ve;
  const { extra, precio, costo, entrega, anticipo, diaCobro } = ve;
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


/* ── Simulador con datos reales ──────────────────────────────────────── */
const ultimoDia = (f) => lastDay(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1);
/**
 * Patrón histórico a partir de los movimientos REALES del banco (ya filtrados: solo cuentas que
 * suman al efectivo y sin traspasos entre cuentas propias). Usa SOLO meses completos dentro de la
 * cobertura (desde/hasta) en que todas las cuentas tienen datos: un mes a medias haría parecer
 * que entra menos dinero del que entra. Devuelve, por mes y por día del mes, entradas y salidas.
 * Esto NO es un dato: es "si los próximos meses se mueven como los pasados", y así se etiqueta.
 */
function patronHistorico(movs, cobertura) {
  if (!cobertura || !valid(cobertura.desde) || !valid(cobertura.hasta) || cobertura.desde > cobertura.hasta) return null;
  const meses = [];
  for (let f = cobertura.desde.slice(0, 7) + '-01'; f <= cobertura.hasta; ) {
    const fin = f.slice(0, 8) + String(ultimoDia(f)).padStart(2, '0');
    // Completo si empieza dentro de la cobertura y la cobertura llega a su último día (o al 25, por estados que cierran antes de fin de mes).
    if (f >= cobertura.desde && (cobertura.hasta >= fin || (cobertura.hasta.slice(0, 7) === f.slice(0, 7) && Number(cobertura.hasta.slice(8)) >= 25))) meses.push(f.slice(0, 7));
    const d = parse(f); d.setUTCMonth(d.getUTCMonth() + 1); f = iso(d);
  }
  if (!meses.length) return null;
  const porMes = {};
  for (const m of meses) porMes[m] = { mes: m, ent: new Array(32).fill(0), sal: new Array(32).fill(0), entradas: 0, salidas: 0, cats: {} };
  for (const x of movs) {
    const f = String(x.fecha).slice(0, 10), pm = porMes[f.slice(0, 7)];
    if (!pm) continue;
    const c = toC(x.monto) || 0, dia = Number(f.slice(8));
    const k = x.categoria || 'sin_categoria';
    pm.cats[k] = pm.cats[k] || { entradas: 0, salidas: 0 };
    if (c > 0) { pm.ent[dia] += c; pm.entradas += c; pm.cats[k].entradas += c; } else { pm.sal[dia] -= c; pm.salidas -= c; pm.cats[k].salidas -= c; }
  }
  const lista = meses.map((m) => ({ ...porMes[m], neto: porMes[m].entradas - porMes[m].salidas }));
  const n = lista.length;
  const prom = { ent: new Array(32).fill(0), sal: new Array(32).fill(0) };
  for (const m of lista) for (let i = 1; i <= 31; i++) { prom.ent[i] += m.ent[i] / n; prom.sal[i] += m.sal[i] / n; }
  for (let i = 1; i <= 31; i++) { prom.ent[i] = Math.round(prom.ent[i]); prom.sal[i] = Math.round(prom.sal[i]); }
  const peor = lista.reduce((a, b) => (b.neto < a.neto ? b : a)), mejor = lista.reduce((a, b) => (b.neto > a.neto ? b : a));
  const cats = {};
  for (const m of lista) for (const [k, v] of Object.entries(m.cats)) { cats[k] = cats[k] || { entradas: 0, salidas: 0 }; cats[k].entradas += v.entradas / n; cats[k].salidas += v.salidas / n; }
  for (const v of Object.values(cats)) { v.entradas = Math.round(v.entradas); v.salidas = Math.round(v.salidas); }
  return {
    meses: lista.map((m) => ({ mes: m.mes, entradas: m.entradas, salidas: m.salidas, neto: m.neto })), n, desde: cobertura.desde, hasta: cobertura.hasta,
    promedio_mes: { entradas: Math.round(lista.reduce((a, m) => a + m.entradas, 0) / n), salidas: Math.round(lista.reduce((a, m) => a + m.salidas, 0) / n) },
    peor_mes: peor.mes, mejor_mes: mejor.mes, por_categoria: cats,
    dias: { promedio: prom, peor: { ent: peor.ent, sal: peor.sal }, mejor: { ent: mejor.ent, sal: mejor.sal } }
  };
}
/**
 * Entradas y salidas estimadas día por día a partir del patrón: el día 15 del mes futuro recibe lo que
 * en la historia pasa el día 15. Un mes corto acumula en su último día lo de los días que no tiene.
 * Empieza MAÑANA: lo de hoy ya está (o no) en el banco. ajustes: % sobre entradas y salidas.
 */
function eventosEstimados(patron, modo, hoy, H, ajustes) {
  if (!patron || !patron.dias[modo]) return [];
  const p = patron.dias[modo], out = [];
  const fe = 1 + Math.max(-90, Math.min(200, Number((ajustes || {}).entradas_pct) || 0)) / 100;
  const fs = 1 + Math.max(-90, Math.min(200, Number((ajustes || {}).salidas_pct) || 0)) / 100;
  const etiqueta = modo === 'promedio' ? 'mes promedio' : modo === 'peor' ? 'como el peor mes (' + patron.peor_mes + ')' : 'como el mejor mes (' + patron.mejor_mes + ')';
  for (let k = 1; k <= H; k++) {
    const f = addDays(hoy, k), dom = Number(f.slice(8)), ld = ultimoDia(f);
    let e = 0, s = 0;
    for (let i = dom; i <= (dom === ld ? 31 : dom); i++) { e += p.ent[i]; s += p.sal[i]; }
    e = Math.round(e * fe); s = Math.round(s * fs);
    if (e) out.push({ fecha: f, monto: e, concepto: 'Entradas estimadas (' + etiqueta + ')', tipo: 'estimado' });
    if (s) out.push({ fecha: f, monto: -s, concepto: 'Salidas estimadas (' + etiqueta + ')', tipo: 'estimado' });
  }
  return out;
}
/**
 * Un escenario del simulador sobre la base real. cambios (nada se guarda):
 *  historico: 'no'|'promedio'|'peor'|'mejor' · entradas_pct / salidas_pct (solo sobre lo estimado)
 *  retraso (días de atraso de la cobranza) · vencido ('excluir'|'hoy')
 *  mover: [{cxp_id, fecha}] (supuesto de negociación con el proveedor, no un acuerdo)
 *  venta: {precio, costo, entrega, anticipo, dia_entrega, dia_proveedor, dias_credito}
 *  puntuales: [{fecha, monto (pesos, + entra / − sale), concepto}]
 */
function escenario(base, cambios) {
  const c = cambios || {};
  const mover = new Map((c.mover || []).filter((m) => valid(m.fecha)).map((m) => [Number(m.cxp_id), m.fecha]));
  const cxp = (base.cxp || []).map((x) => (mover.has(Number(x.id)) ? { ...x, fecha_programada: mover.get(Number(x.id)), movido: true } : x));
  const extra = [];
  const modo = ['promedio', 'peor', 'mejor'].includes(c.historico) ? c.historico : null;
  if (modo) extra.push(...eventosEstimados(base.patron, modo, base.hoy, Math.max(1, Math.min(366, Math.round(Number(base.horizonte) || 60))), c));
  for (const p of c.puntuales || []) {
    const m = toC(p.monto);
    if (valid(p.fecha) && m) extra.push({ fecha: p.fecha, monto: m, concepto: String(p.concepto || (m > 0 ? 'Entrada supuesta' : 'Salida supuesta')).slice(0, 120), tipo: 'simulado' });
  }
  let venta = null;
  if (c.venta && toC(c.venta.precio) > 0) { venta = ventaEventos(base.hoy, c.venta); if (!venta.error) extra.push(...venta.extra); else venta = null; }
  const p = proyectar({ ...base, cxp, extra, opciones: { vencido: c.vencido === 'hoy' ? 'hoy' : 'excluir', retraso: c.retraso } });
  p.venta = venta ? { margen: venta.precio - venta.costo - venta.entrega, fecha_cobro: venta.diaCobro, saldo_a_credito: venta.precio - venta.anticipo } : null;
  p.historico = modo;
  return p;
}
/** Las 8 cifras del simulador, del escenario dado. evalDia: día (desde hoy) para medir la cartera vencida. */
function indicadores(base, p, evalDia) {
  const ev = addDays(base.hoy, Math.max(0, Math.min(p.horizonte, Math.round(Number(evalDia) || 0))));
  const pend = (base.cxc || []).filter((x) => x.pendiente > 0);
  const obligs = p.eventos.filter((e) => e.tipo === 'pago' || e.tipo === 'fijo');
  const cxpTotal = (base.cxp || []).reduce((a, x) => a + (x.pendiente || 0), 0);
  return {
    efectivo: p.efectivo,
    cartera: pend.reduce((a, x) => a + x.pendiente, 0),
    cartera_vencida: pend.filter((x) => String(x.vencimiento).slice(0, 10) < ev).reduce((a, x) => a + x.pendiente, 0),
    fecha_evaluacion: ev,
    obligaciones: cxpTotal + p.eventos.filter((e) => e.tipo === 'fijo').reduce((a, e) => a - e.monto, 0),
    obligaciones_en_horizonte: obligs.reduce((a, e) => a - e.monto, 0),
    salidas_estimadas: p.eventos.filter((e) => e.tipo === 'estimado' && e.monto < 0).reduce((a, e) => a - e.monto, 0),
    entradas_estimadas: p.eventos.filter((e) => e.tipo === 'estimado' && e.monto > 0).reduce((a, e) => a + e.monto, 0),
    final: p.final, hasta: p.hasta, minimo: p.minimo,
    falta_para_cero: p.falta_para_cero, falta_para_reserva: p.falta_para_reserva, reserva: p.reserva,
    primero_negativo: p.primero_negativo, primero_bajo_reserva: p.primero_bajo_reserva
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

module.exports = { patronHistorico, eventosEstimados, escenario, indicadores, ventaEventos, fechaLarga, toC, fromC, valid, addDays, diffDays, vencimiento, saldoCuenta, pendiente, ocurrencias, proyectar, antiguedad, simularVenta, alertas };
