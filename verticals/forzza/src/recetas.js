'use strict';
/**
 * RECETAS DE REPORTE · convierten un plan (intencion.js o la IA) en un reporte completo SIN IA:
 * consultas hechas por el motor (reportes.consultar), tablas, gráficas, indicadores y un resumen escrito
 * con plantillas. Cada cifra del texto sale de una consulta o de una cuenta hecha aquí con cifras de una
 * consulta; el verificador de reportes.js la revisa igual que si la hubiera escrito la IA.
 *
 * Recetas: comparar dos fuentes (ventas contra costos) · comparar periodos · lista de renglones ·
 * agrupado por una columna (los N más grandes, % del total, cruzado por mes) · por periodo · resumen.
 * No toca la base de datos, la red ni un modelo.
 */
const I = require('./intencion');

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const norm = I.norm;
const esDin = (n) => !/n[uú]mero|cantidad|conteo|renglones|registros|piezas|unidades|d[ií]as|%|porcentaje/i.test(n || '') && /monto|total|importe|venta|compra|saldo|pago|costo|utilidad|precio|entrada|salida|cargo|abono|ingreso|gasto|diferencia|promedio de|valor|cobr/i.test(n || '');
const dinero = (v) => (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cifra = (v, label) => (v == null ? 'sin dato' : esDin(label) ? dinero(v) : Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 }));
const pct = (a, b) => (b ? r2((a / b) * 100) : null);
const fechaL = (iso) => (iso ? `${Number(iso.slice(8, 10))} de ${I.MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}` : '');
const etiquetaPeriodo = (v, por) => {
  if (!v) return '—';
  if (por === 'mes') return `${I.MESES[Number(v.slice(5, 7)) - 1].slice(0, 3)} ${v.slice(0, 4)}`;
  if (por === 'semana') return `sem. ${Number(v.slice(8, 10))} ${I.MESES[Number(v.slice(5, 7)) - 1].slice(0, 3)}`;
  return v;
};

/** Nombre con que se muestra la medida: «Ventas», «Costos», «Entradas», «Monto de IVA», «Cantidad». */
function etiquetaMedida(plan, cat) {
  const op = plan.medida.op, col = plan.medida.columna;
  if (op === 'conteo') return cat.clase === 'ventas' ? 'Número de ventas' : cat.clase === 'costos' ? 'Número de gastos y compras' : cat.clase === 'bancos' ? 'Número de movimientos' : 'Número de registros';
  let base;
  if (cat.clase === 'bancos') base = col === 'Entrada' ? 'Entradas' : col === 'Salida' ? 'Salidas' : 'Monto neto';
  else if (col && col === cat.medida) base = cat.clase === 'ventas' ? 'Ventas' : cat.clase === 'costos' ? 'Costos' : cat.clase === 'cobranza' ? 'Saldo' : `Monto de ${col}`;
  else if (/cantidad|unidades|piezas/i.test(col || '')) base = col;
  else base = `Monto de ${col}`;
  return op === 'promedio' ? `Promedio de ${base.toLowerCase()}` : op === 'maximo' ? `Máximo de ${base.toLowerCase()}` : op === 'minimo' ? `Mínimo de ${base.toLowerCase()}` : base;
}

/**
 * Arma el reporte. `consultar(tabla, args)` es el motor de reportes.js.
 * Devuelve { reporte:{titulo,resumen,secciones}, consultas, permitidos, entendido, notas } o { error, mensaje }.
 */
function construir(plan0, fuentes, consultar, opts = {}) {
  const plan = JSON.parse(JSON.stringify(plan0));
  const cats = I.catalogo(fuentes);
  const fu = fuentes.find((f) => f.nombre === plan.fuente), cat = cats.find((c) => c.nombre === plan.fuente);
  if (!fu || !cat) return { error: 'sin_fuente', mensaje: 'No encontré los datos para ese reporte. Revisa que el archivo esté marcado o que «Incluir mis bancos» esté activo.' };
  if (plan.medida.op !== 'conteo' && !plan.medida.columna) return { error: 'sin_medida', mensaje: `El archivo «${fu.nombre}» no tiene una columna de importes para sumar. Pide un conteo o usa otro archivo.` };
  const notas = (opts.notas || []).slice();
  const consultas = {}, extra = [];
  let n = 0;
  const q = (f, args) => {
    const r = consultar(f.tabla, JSON.parse(JSON.stringify({ ...args, fuente: undefined })));
    if (r.error) throw new Error(r.error);
    const id = 'c' + (++n); r._args = { fuente: f.nombre, ...args }; consultas[id] = r; return { id, r };
  };
  const derivada = (columnas, filas, desc) => { const id = 'c' + (++n); consultas[id] = { columnas, filas, total_filas: filas.length, mostradas: filas.length, totales: {}, _args: { derivada: desc } }; return id; };
  const label = etiquetaMedida(plan, cat);
  const P = (a, b) => { const v = pct(a, b); if (v != null) extra.push(v); return v; };

  // Filtros comunes a todas las consultas de una fuente.
  const filtrosDe = (c, periodo, conSigno) => {
    const fs = [];
    if (periodo && c.fecha) fs.push({ columna: c.fecha, op: 'entre', valor: periodo.desde, valor2: periodo.hasta });
    if (c.clase === 'bancos') {
      if (!(plan.filtros || []).some((x) => norm(x.columna) === 'categoria')) fs.push({ columna: 'Categoría', op: '!=', valor: 'traspaso' });
      const s = conSigno || plan.signo;
      if (s === 'entrada') fs.push({ columna: 'Entrada', op: 'no_vacio' }); else if (s === 'salida') fs.push({ columna: 'Salida', op: 'no_vacio' });
    }
    if (c.nombre === cat.nombre) {
      for (const x of plan.filtros || []) fs.push({ columna: x.columna, op: x.op, valor: x.valor });
      if (plan.umbral && plan.medida.columna) fs.push({ columna: plan.medida.columna, op: plan.umbral.op, valor: plan.umbral.valor });
    }
    return fs;
  };
  const metrica = (c, lab, colMed) => (plan.medida.op === 'conteo' ? { op: 'conteo', nombre: lab } : { op: plan.medida.op, columna: colMed || plan.medida.columna, nombre: lab });

  // ── Periodo efectivo ──
  let periodos = (plan.periodos || []).slice();
  const conDatos = (c, p) => { if (!c.fecha) return true; const j = fu.tabla.columnas.findIndex((x) => x.nombre === c.fecha); return fu.tabla.filas.some((r) => r[j] && r[j] >= p.desde && r[j] <= p.hasta); };
  if (cat.fecha && periodos.length && !plan.comparar) {
    const p = periodos[0];
    if (!conDatos(cat, p)) {
      if (!cat.hasta) return { error: 'sin_datos', mensaje: 'Ese archivo no tiene fechas.' };
      if (p.relativo) {
        const y = Number(cat.hasta.slice(0, 4)), m = Number(cat.hasta.slice(5, 7));
        notas.push(`No hay datos en ${p.etiqueta}: se usó el mes más reciente con datos (${I.MESES[m - 1]} ${y}).`);
        periodos = [{ desde: `${y}-${String(m).padStart(2, '0')}-01`, hasta: I.finMes(y, m), etiqueta: `${I.MESES[m - 1]} ${y}` }];
      } else return { error: 'sin_datos', mensaje: `No hay datos en ${p.etiqueta}. «${fu.nombre}» tiene datos del ${fechaL(cat.desde)} al ${fechaL(cat.hasta)}.` };
    }
  }
  if (periodos.length > 1 && !plan.comparar) { const d = periodos.map((p) => p.desde).sort()[0], h = periodos.map((p) => p.hasta).sort().slice(-1)[0]; periodos = [{ desde: d, hasta: h, etiqueta: periodos.map((p) => p.etiqueta).join(' y ') }]; }
  const periodo = plan.comparar ? null : periodos[0] || null;

  // ── Indicadores generales (siempre) ──
  const metsT = [metrica(cat, label)];
  if (plan.medida.op !== 'conteo') metsT.push({ op: 'conteo', nombre: 'Número de registros' });
  if (cat.fecha) metsT.push({ op: 'minimo', columna: cat.fecha, nombre: 'Primera fecha' }, { op: 'maximo', columna: cat.fecha, nombre: 'Última fecha' });
  const tot = plan.comparar ? null : q(fu, { filtros: filtrosDe(cat, periodo), metricas: metsT });
  const total = tot ? tot.r.filas[0][0] : null, cuantos = tot ? (plan.medida.op === 'conteo' ? total : tot.r.filas[0][1]) : null;
  if (tot && !cuantos) return { error: 'sin_datos', mensaje: `No encontré renglones con esas condiciones en «${fu.nombre}». Revisa el periodo o los filtros (por ejemplo, el nombre del cliente o la categoría).` };
  const desdeReal = tot && cat.fecha ? tot.r.filas[0][plan.medida.op === 'conteo' ? 1 : 2] : null, hastaReal = tot && cat.fecha ? tot.r.filas[0][plan.medida.op === 'conteo' ? 2 : 3] : null;
  const cuando = periodo ? `en ${periodo.etiqueta}` : desdeReal ? `del ${fechaL(desdeReal)} al ${fechaL(hastaReal)}` : '';
  const secciones = [], resumen = [];
  const kpis = (items) => secciones.push({ tipo: 'indicadores', items });
  const frase0 = () => (plan.medida.op === 'conteo' ? `${label} ${cuando}: ${cifra(total, label)}.` : `${label} ${cuando}: ${cifra(total, label)} en ${cuantos.toLocaleString('en-US')} registros.`);
  let titulo = label;

  // ── Tiempo: «auto» se decide por el largo del rango ──
  const span = (() => { const d = periodo ? periodo.desde : desdeReal, h = periodo ? periodo.hasta : hastaReal; return d && h ? (new Date(h) - new Date(d)) / 864e5 : 0; })();
  const tiempoAuto = span <= 62 ? 'semana' : span <= 800 ? 'mes' : 'año';
  const tiempo = plan.tiempo === 'auto' ? tiempoAuto : plan.tiempo;

  if (plan.fuente2) {
    /* ── A. Dos fuentes: ventas contra costos (o contra los bancos) ── */
    const fu2 = fuentes.find((f) => f.nombre === plan.fuente2), cat2 = cats.find((c) => c.nombre === plan.fuente2);
    if (!fu2 || !cat2) return { error: 'sin_fuente', mensaje: 'Falta la segunda fuente para comparar.' };
    const por = tiempo || 'mes';
    const lab2 = cat2.clase === 'bancos' ? (plan.signo === 'entrada' ? 'Cobros en bancos' : 'Salidas de bancos') : cat2.clase === 'costos' ? 'Costos' : cat2.clase === 'ventas' ? 'Ventas' : 'Monto 2';
    const col2 = cat2.clase === 'bancos' ? (plan.signo === 'entrada' ? 'Entrada' : 'Salida') : cat2.medida;
    const f1 = filtrosDe(cat, periodo), f2 = filtrosDe(cat2, periodo, plan.signo);
    const a = q(fu, { filtros: f1, agrupar_por: [{ columna: cat.fecha, periodo: por, nombre: 'Periodo' }], metricas: [{ op: 'suma', columna: plan.medida.columna, nombre: label }], limite: 200 });
    const b = q(fu2, { filtros: f2, agrupar_por: [{ columna: cat2.fecha, periodo: por, nombre: 'Periodo' }], metricas: [{ op: 'suma', columna: col2, nombre: lab2 }], limite: 200 });
    const tb = q(fu2, { filtros: f2, metricas: [{ op: 'suma', columna: col2, nombre: lab2 }] });
    const keys = [...new Set(a.r.filas.map((r) => r[0]).concat(b.r.filas.map((r) => r[0])))].filter(Boolean).sort();
    const va = new Map(a.r.filas.map((r) => [r[0], r[1] || 0])), vb = new Map(b.r.filas.map((r) => [r[0], r[1] || 0]));
    const difN = cat.clase === 'ventas' && cat2.clase !== 'ventas' ? 'Diferencia (ventas menos costos)' : 'Diferencia';
    const filas = keys.map((k) => [etiquetaPeriodo(k, por), r2(va.get(k) || 0), r2(vb.get(k) || 0), r2((va.get(k) || 0) - (vb.get(k) || 0))]);
    const id = derivada([{ nombre: 'Periodo', tipo: 'texto' }, { nombre: label, tipo: 'numero' }, { nombre: lab2, tipo: 'numero' }, { nombre: difN, tipo: 'numero' }], filas, `${label} contra ${lab2} por ${por}`);
    const t2 = tb.r.filas[0][0] || 0, dif = r2((total || 0) - t2), margen = P(dif, total);
    const idT = derivada([{ nombre: label, tipo: 'numero' }, { nombre: lab2, tipo: 'numero' }, { nombre: difN, tipo: 'numero' }, { nombre: '% sobre ' + label.toLowerCase(), tipo: 'numero' }], [[total, r2(t2), dif, margen]], 'totales');
    kpis([{ etiqueta: label, consulta: idT, columna: label, fila: 0 }, { etiqueta: lab2, consulta: idT, columna: lab2, fila: 0 }, { etiqueta: difN, consulta: idT, columna: difN, fila: 0 }]);
    secciones.push({ tipo: 'grafica', titulo: `${label} contra ${lab2.toLowerCase()} por ${por}`, consulta: id, forma: plan.forma === 'lineas' ? 'lineas' : 'barras', etiqueta: 'Periodo', valores: [label, lab2] });
    secciones.push({ tipo: 'tabla', titulo: 'Detalle por periodo', consulta: id });
    titulo = `${label} contra ${lab2.toLowerCase()}`;
    resumen.push(`${label} ${cuando}: ${cifra(total, label)}. ${lab2}: ${cifra(r2(t2), lab2)}.`);
    resumen.push(`${difN}: ${cifra(dif, 'diferencia')}${margen != null ? `, ${margen}% sobre ${label.toLowerCase()}` : ''}.`);
    const peor = filas.slice().sort((x, y) => x[3] - y[3])[0]; if (peor && filas.length > 1) resumen.push(`El periodo con menor diferencia fue ${peor[0]} (${cifra(peor[3], 'diferencia')}).`);
    if (cat2.clase === 'bancos' || cat.clase === 'bancos') notas.push('Los bancos muestran dinero que entró o salió, no facturas: una venta a crédito aparece cuando se cobra.');
  } else if (plan.comparar) {
    /* ── B. Comparar periodos ── */
    const ps = periodos.length >= 2 ? periodos.slice(0, 4) : null;
    if (!ps) return { error: 'aclarar', mensaje: 'Para comparar dime dos periodos, por ejemplo: «octubre contra septiembre».' };
    const res = ps.map((p) => ({ p, t: q(fu, { filtros: filtrosDe(cat, p), metricas: [metrica(cat, label)] }) }));
    const vals = res.map((x) => x.t.r.filas[0][0] || 0);
    if (plan.dimension) {
      const gs = ps.map((p) => q(fu, { filtros: filtrosDe(cat, p), agrupar_por: [{ columna: plan.dimension }], metricas: [metrica(cat, label)], limite: 200 }));
      const maps = gs.map((g) => new Map(g.r.filas.map((r) => [r[0], r[1] || 0])));
      let keys = [...new Set(gs.flatMap((g) => g.r.filas.map((r) => r[0])))].filter((k) => k != null);
      keys.sort((x, y) => (maps[0].get(y) || 0) + (maps[1].get(y) || 0) - (maps[0].get(x) || 0) - (maps[1].get(x) || 0));
      if (plan.top) keys = keys.slice(0, plan.top);
      const cols = [{ nombre: plan.dimension, tipo: 'texto' }].concat(ps.map((p) => ({ nombre: cap(p.etiqueta), tipo: 'numero' })), [{ nombre: 'Diferencia', tipo: 'numero' }, { nombre: 'Variación %', tipo: 'numero' }]);
      const filas = keys.slice(0, 50).map((k) => { const a = maps[0].get(k) || 0, b = maps[1].get(k) || 0; return [k].concat(maps.map((m) => r2(m.get(k) || 0)), [r2(a - b), b ? P(a - b, b) : null]); });
      const id = derivada(cols, filas, `comparación por ${plan.dimension}`);
      secciones.push({ tipo: 'grafica', titulo: `${label} por ${plan.dimension.toLowerCase()}`, consulta: id, forma: 'barras', etiqueta: plan.dimension, valores: ps.slice(0, 3).map((p) => cap(p.etiqueta)) });
      secciones.push({ tipo: 'tabla', titulo: 'Comparación', consulta: id });
      const sube = filas.filter((f) => f[f.length - 2] > 0).sort((x, y) => y[y.length - 2] - x[x.length - 2])[0];
      if (sube) resumen.push(`Lo que más creció fue ${sube[0]} (${cifra(sube[sube.length - 2], 'diferencia')}).`);
    }
    const dif = r2(vals[0] - vals[1]), var_ = vals[1] ? P(vals[0] - vals[1], vals[1]) : null;
    const idT = derivada([{ nombre: 'Periodo', tipo: 'texto' }, { nombre: label, tipo: 'numero' }], ps.map((p, i) => [cap(p.etiqueta), r2(vals[i])]), 'totales por periodo');
    const idD = derivada([{ nombre: 'Diferencia', tipo: 'numero' }, { nombre: 'Variación %', tipo: 'numero' }], [[dif, var_]], 'diferencia');
    kpis(ps.slice(0, 2).map((p, i) => ({ etiqueta: `${label} ${p.etiqueta}`, consulta: idT, columna: label, fila: i })).concat([{ etiqueta: 'Diferencia', consulta: idD, columna: 'Diferencia', fila: 0 }]));
    if (!plan.dimension) secciones.push({ tipo: 'grafica', titulo: `${label} por periodo`, consulta: idT, forma: 'barras', etiqueta: 'Periodo', valores: [label] });
    titulo = `${label}: ${ps.map((p) => p.etiqueta).join(' contra ')}`;
    resumen.unshift(`${label} en ${ps[0].etiqueta}: ${cifra(r2(vals[0]), label)}; en ${ps[1].etiqueta}: ${cifra(r2(vals[1]), label)}. ${dif >= 0 ? 'Subió' : 'Bajó'} ${cifra(Math.abs(dif), 'diferencia')}${var_ != null ? ` (${Math.abs(var_)}%)` : ''}.`);
    extra.push(dif, var_, Math.abs(dif), var_ != null ? Math.abs(var_) : null);
  } else if (plan.listado) {
    /* ── C. Lista de renglones ── */
    const cols = [cat.fecha].concat(cat.textos.filter((c) => ['cliente', 'proveedor', 'contraparte', 'producto', 'categoria', 'concepto', 'vendedor', 'estado', 'folio'].includes(c.rol)).map((c) => c.nombre)).filter(Boolean).slice(0, 5);
    if (plan.dimension && !cols.includes(plan.dimension)) cols.push(plan.dimension);
    if (plan.medida.columna) cols.push(plan.medida.columna);
    const l = q(fu, { filtros: filtrosDe(cat, periodo), columnas: cols, orden: plan.medida.columna ? { columna: plan.medida.columna, dir: plan.dir } : { columna: cat.fecha, dir: 'desc' }, limite: plan.top || 50 });
    kpis(kpiBase(tot.id, label, plan));
    secciones.push({ tipo: 'tabla', titulo: plan.top ? `Los ${plan.top} ${plan.dir === 'asc' ? 'más pequeños' : 'más grandes'}` : 'Detalle', consulta: l.id });
    titulo = plan.top ? `${label}: los ${plan.top} registros ${plan.dir === 'asc' ? 'más pequeños' : 'más grandes'}` : `Detalle de ${label.toLowerCase()}`;
    resumen.push(frase0());
    const jm = l.r.columnas.findIndex((c) => c.nombre === plan.medida.columna);
    if (jm >= 0 && l.r.filas[0]) { const s = r2(l.r.filas.reduce((a, r) => a + (r[jm] || 0), 0)); resumen.push(`Los ${l.r.filas.length} registros de la lista suman ${cifra(s, label)}, el ${P(s, total)}% del total.`); extra.push(s, P(s, total)); }
  } else if (plan.dimension) {
    /* ── D. Agrupado por una columna ── */
    const grupos = consultar(fu.tabla, { filtros: filtrosDe(cat, periodo), agrupar_por: [{ columna: plan.dimension }], metricas: [metrica(cat, label)] }).total_filas;
    const lim = plan.top || (grupos > 15 ? 15 : grupos);
    const g = q(fu, { filtros: filtrosDe(cat, periodo), agrupar_por: [{ columna: plan.dimension }], metricas: [metrica(cat, label)], orden: { columna: label, dir: plan.dir }, limite: lim, agrupar_resto: !plan.top && grupos > 15 });
    let id = g.id;
    const sumable = plan.medida.op === 'suma' || plan.medida.op === 'conteo';
    if ((plan.participacion || plan.top || sumable) && sumable && total) {
      const filas = g.r.filas.map((r) => [r[0], r[1], P(r[1] || 0, total)]);
      id = derivada([g.r.columnas[0], g.r.columnas[1], { nombre: '% del total', tipo: 'numero' }], filas, `${label} por ${plan.dimension} con % del total`);
      consultas[id].total_filas = g.r.total_filas;
    }
    kpis(kpiBase(tot.id, label, plan));
    const pastel = plan.forma === 'pastel' || (plan.participacion && g.r.filas.length <= 6 && !plan.forma);
    if (!plan.sin_grafica) secciones.push({ tipo: 'grafica', titulo: `${label} por ${plan.dimension.toLowerCase()}`, consulta: id, forma: pastel && g.r.filas.length <= 8 ? 'pastel' : plan.forma === 'lineas' ? 'lineas' : 'barras', etiqueta: plan.dimension, valores: [label] });
    secciones.push({ tipo: 'tabla', titulo: plan.top ? `Los ${plan.top} ${plan.dir === 'asc' ? 'más pequeños' : 'más grandes'}` : `${label} por ${plan.dimension.toLowerCase()}`, consulta: id });
    if (tiempo) {
      // Cruce por periodo de los 3 primeros: una línea por cada uno.
      const top3 = g.r.filas.filter((r) => !/^Otros \(/.test(String(r[0]))).slice(0, 3).map((r) => r[0]);
      const x = q(fu, { filtros: filtrosDe(cat, periodo).concat([{ columna: plan.dimension, op: 'en', valor: top3 }]), agrupar_por: [{ columna: cat.fecha, periodo: tiempo, nombre: 'Periodo' }, { columna: plan.dimension }], metricas: [metrica(cat, label)], limite: 200 });
      const keys = [...new Set(x.r.filas.map((r) => r[0]))].sort();
      const filas = keys.map((k) => [etiquetaPeriodo(k, tiempo)].concat(top3.map((d) => r2((x.r.filas.find((r) => r[0] === k && r[1] === d) || [0, 0, 0])[2] || 0))));
      const idx = derivada([{ nombre: 'Periodo', tipo: 'texto' }].concat(top3.map((d) => ({ nombre: String(d).slice(0, 60), tipo: 'numero' }))), filas, `${label} de los principales por ${tiempo}`);
      secciones.push({ tipo: 'grafica', titulo: `Los principales por ${tiempo}`, consulta: idx, forma: 'lineas', etiqueta: 'Periodo', valores: top3.map((d) => String(d).slice(0, 60)) });
      secciones.push({ tipo: 'tabla', titulo: `Por ${tiempo}`, consulta: idx });
    }
    const quien = { cliente: 'clientes', proveedor: 'proveedores', vendedor: 'vendedores', producto: 'productos', categoria: 'categorías' }[I.rolDe(plan.dimension)] || plan.dimension.toLowerCase();
    titulo = `${label} por ${plan.dimension.toLowerCase()}${plan.top ? `: los ${plan.top} ${plan.dir === 'asc' ? 'más pequeños' : 'más grandes'}` : ''}`;
    resumen.push(frase0());
    const f0 = g.r.filas[0];
    if (f0 && sumable) resumen.push(`${plan.dir === 'asc' ? 'El más pequeño' : 'El más grande'} es ${f0[0]} con ${cifra(f0[1], label)} (${P(f0[1] || 0, total)}% del total).`);
    else if (f0) resumen.push(`${plan.dir === 'asc' ? 'El más bajo' : 'El más alto'} es ${f0[0]} con ${cifra(f0[1], label)}.`);
    if (plan.top && sumable && g.r.filas.length > 1) { const s = r2(g.r.filas.reduce((a, r) => a + (r[1] || 0), 0)); resumen.push(`Los ${g.r.filas.length} ${quien} de la tabla suman ${cifra(s, label)}, el ${P(s, total)}% del total.`); extra.push(s); }
    if (plan.top && g.r.filas.length < plan.top) notas.push(`Solo hay ${g.r.filas.length} ${quien} con datos.`);
  } else if (tiempo) {
    /* ── E. Por periodo ── */
    const s = q(fu, { filtros: filtrosDe(cat, periodo), agrupar_por: [{ columna: cat.fecha, periodo: tiempo, nombre: 'Periodo' }], metricas: [metrica(cat, label)], limite: 200 });
    const id = derivada([{ nombre: 'Periodo', tipo: 'texto' }, { nombre: label, tipo: 'numero' }], s.r.filas.map((r) => [etiquetaPeriodo(r[0], tiempo), r[1]]), `${label} por ${tiempo}`);
    kpis(kpiBase(tot.id, label, plan));
    if (!plan.sin_grafica) secciones.push({ tipo: 'grafica', titulo: `${label} por ${tiempo}`, consulta: id, forma: plan.forma || 'lineas', etiqueta: 'Periodo', valores: [label] });
    secciones.push({ tipo: 'tabla', titulo: `${label} por ${tiempo}`, consulta: id });
    titulo = `${label} por ${tiempo}`;
    resumen.push(frase0());
    const filas = consultas[id].filas.filter((r) => r[1] != null);
    if (filas.length > 1) { const hi = filas.reduce((a, r) => (r[1] > a[1] ? r : a)), lo = filas.reduce((a, r) => (r[1] < a[1] ? r : a)); resumen.push(`El ${tiempo} más alto fue ${hi[0]} con ${cifra(hi[1], label)} y el más bajo ${lo[0]} con ${cifra(lo[1], label)}.`); }
  } else {
    /* ── F. Resumen: total, tendencia y los principales ── */
    kpis(kpiBase(tot.id, label, plan));
    resumen.push(frase0());
    if (cat.fecha && span > 10) {
      const s = q(fu, { filtros: filtrosDe(cat, periodo), agrupar_por: [{ columna: cat.fecha, periodo: tiempoAuto, nombre: 'Periodo' }], metricas: [metrica(cat, label)], limite: 200 });
      const id = derivada([{ nombre: 'Periodo', tipo: 'texto' }, { nombre: label, tipo: 'numero' }], s.r.filas.map((r) => [etiquetaPeriodo(r[0], tiempoAuto), r[1]]), `${label} por ${tiempoAuto}`);
      if (!plan.sin_grafica) secciones.push({ tipo: 'grafica', titulo: `${label} por ${tiempoAuto}`, consulta: id, forma: plan.forma || 'lineas', etiqueta: 'Periodo', valores: [label] });
    }
    const filtradas = new Set((plan.filtros || []).map((x) => x.columna));
    const dim = ['cliente', 'proveedor', 'contraparte', 'categoria', 'producto', 'concepto'].map((r) => cat.textos.find((c) => c.rol === r && c.distintos > 1 && !filtradas.has(c.nombre))).find(Boolean);
    if (dim) {
      const g = q(fu, { filtros: filtrosDe(cat, periodo), agrupar_por: [{ columna: dim.nombre }], metricas: [metrica(cat, label)], orden: { columna: label, dir: 'desc' }, limite: 10 });
      if (g.r.filas.length > 1) secciones.push({ tipo: 'tabla', titulo: `Principales por ${dim.nombre.toLowerCase()}`, consulta: g.id });
      const f0 = g.r.filas[0]; if (f0 && g.r.filas.length > 1 && total && plan.medida.op !== 'promedio') resumen.push(`El principal es ${f0[0]} con ${cifra(f0[1], label)} (${P(f0[1] || 0, total)}% del total).`);
    }
    titulo = `${label}${periodo ? '' : ': resumen'}`;
  }
  if (periodo) titulo += ` · ${periodo.etiqueta}`;
  const filtrosTxt = (plan.filtros || []).map((x) => `${x.columna}${x.op === 'no_en' ? ' excepto' : ':'} ${x.valor.slice(0, 3).join(', ')}`).join('; ');
  if (filtrosTxt) titulo += ` (${filtrosTxt.slice(0, 80)})`;
  // Los porcentajes del resumen se calculan aquí con cifras de consultas: se agregan a lo permitido.
  for (const id of Object.keys(consultas)) for (const r of consultas[id].filas) for (const v of r) if (typeof v === 'number') extra.push(v);
  const permitidos = Object.values(consultas).map((c) => ({ filas: c.filas, totales: c.totales })).concat([extra.filter((x) => x != null), total, cuantos].filter((x) => x != null));
  if (total != null && tot) extra.push(...Object.values(consultas).flatMap((c) => c.filas.flatMap((r) => r.filter((v) => typeof v === 'number').map((v) => P(v, total)))));
  return {
    reporte: { titulo: cap(titulo).slice(0, 200), resumen: resumen.join(' ') + (notas.length ? ' Nota: ' + notas.join(' ') : ''), secciones },
    consultas, permitidos: permitidos.concat([extra]), notas,
  };
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
function kpiBase(idT, label, plan) {
  const it = [{ etiqueta: label, consulta: idT, columna: label, fila: 0 }];
  if (plan.medida.op !== 'conteo') it.push({ etiqueta: 'Número de registros', consulta: idT, columna: 'Número de registros', fila: 0 });
  return it;
}

module.exports = { construir, etiquetaMedida, dinero, cifra };
