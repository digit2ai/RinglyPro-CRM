'use strict';
/**
 * Banco de preguntas del MOTOR DE REPORTES (intérprete + recetas), sin IA, sin base de datos y sin llaves.
 *   node verticals/forzza/test-motor.js
 * Datos inventados y deterministas (ventas, costos y bancos con la forma de los archivos de Forzza).
 * Cada pregunta dice qué debe entender el motor; las principales además comparan el total del reporte contra
 * una suma hecha aquí a mano, renglón por renglón, sin pasar por el motor.
 */
const RP = require('./src/reportes');
const I = require('./src/intencion');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); } };

/* ── datos inventados, deterministas ── */
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const r2 = (x) => Math.round(x * 100) / 100;
const fecha = (i) => { const d = new Date(Date.UTC(2026, 6, 1) + i * 86400000); return d.toISOString().slice(0, 10); };
const CLIENTES = ['Constructora Norte (demo)', 'Obras del Valle (demo)', 'Grupo Apodaca (demo)', 'Casas Cumbres (demo)', 'Ferretería La Paz (demo)', 'Remodelaciones Sierra (demo)'];
const VEND = ['Ana Cantú', 'Jorge Garza', 'Laura Treviño'];
const PROD = [['Cemento gris 50 kg', 'Cemento'], ['Varilla 3/8', 'Acero'], ['Block 15x20x40', 'Block'], ['Arena (m3)', 'Agregados'], ['Impermeabilizante 19 L', 'Acabados']];
const ventasRows = [['FORZZA (DATOS DE PRUEBA)'], [], ['Fecha', 'Folio', 'Cliente', 'Vendedor', 'Producto', 'Categoría', 'Cantidad', 'Precio unitario', 'Total', 'Forma de pago', 'Estado']];
for (let i = 0; i < 240; i++) { const p = pick(PROD), q = 1 + Math.floor(rnd() * 80), pu = [180, 95, 18, 450, 1650][PROD.indexOf(p)]; ventasRows.push([fecha(Math.floor(i * 142 / 240)), 'V-' + (1000 + i), pick(CLIENTES), pick(VEND), p[0], p[1], q, pu, q * pu, pick(['Transferencia', 'Efectivo', 'Crédito 30 días']), rnd() < 0.25 ? 'Pendiente' : 'Pagada']); }
const PROV = [['Cementos del Norte (demo)', 'Material', 'Bodega Centro'], ['Aceros Monterrey (demo)', 'Material', 'Bodega Norte'], ['Nómina interna', 'Nómina', 'Bodega Centro'], ['Gasolinera Las Torres (demo)', 'Combustible', 'Flotilla'], ['Taller Mecánico Apodaca (demo)', 'Mantenimiento', 'Flotilla'], ['CFE (demo)', 'Servicios', 'Bodega Norte']];
const costosRows = [['Reporte de costos'], ['Fecha', 'Folio', 'Proveedor', 'Categoría', 'Concepto', 'Centro de costo', 'Subtotal', 'IVA', 'Total', 'Forma de pago', 'Estado']];
for (let i = 0; i < 180; i++) { const p = pick(PROV), sub = r2(500 + rnd() * 60000), iva = r2(sub * 0.16); costosRows.push([fecha(Math.floor(i * 142 / 180)), 'C-' + (500 + i), p[0], p[1], p[1] + ' varios', p[2], sub, iva, r2(sub + iva), pick(['Transferencia', 'Tarjeta']), rnd() < 0.15 ? 'Pendiente' : 'Pagado']); }
const V = { nombre: 'Ventas de prueba.xlsx', tabla: RP.tablaDesdeFilas(ventasRows) };
const C = { nombre: 'Costos de prueba.xlsx', tabla: RP.tablaDesdeFilas(costosRows) };
const bancosCols = [['Fecha', 'fecha'], ['Cuenta', 'texto'], ['Banco', 'texto'], ['Concepto', 'texto'], ['Contraparte', 'texto'], ['Categoría', 'texto'], ['Referencia', 'texto'], ['Monto', 'numero'], ['Entrada', 'numero'], ['Salida', 'numero'], ['Suma al efectivo', 'texto']].map(([nombre, tipo]) => ({ nombre, tipo }));
const bf = [];
for (let i = 0; i < 300; i++) { const ent = rnd() < 0.45, tr = rnd() < 0.1, mo = r2((ent ? 1 : -1) * (300 + rnd() * 90000)); bf.push([fecha(Math.floor(i * 142 / 300)), pick(['BBVA 1234', 'HSBC 5678']), 'BBVA', ent ? 'SPEI recibido' : 'Pago SPEI', ent ? pick(CLIENTES) : pick(PROV)[0], tr ? 'traspaso' : ent ? 'cliente' : pick(['proveedor', 'nomina', 'servicios']), null, mo, mo > 0 ? mo : null, mo < 0 ? -mo : null, 'sí']); }
const B = { nombre: 'bancos', tabla: { columnas: bancosCols, filas: bf, notas: [] } };
const HOY = '2026-11-24';

/* sumas a mano, sin el motor */
const col = (F, n) => F.tabla.columnas.findIndex((c) => c.nombre === n);
const suma = (F, medida, pred) => r2(F.tabla.filas.filter((r) => pred(r)).reduce((a, r) => a + (r[col(F, medida)] || 0), 0));
const mes = (F, m) => (r) => String(r[col(F, 'Fecha')]).slice(0, 7) === '2026-' + m;
const es = (F, c, v) => (r) => r[col(F, c)] === v;
const y = (...ps) => (r) => ps.every((p) => p(r));
const todo = () => true;

/* ── el banco: [pregunta, fuentes, lo que debe entender, total esperado (opcional)] ── */
const casos = [
  // Costos (el caso que falló en producción)
  ['quiero los costos de los primero 4 clientes', [V, C], { fuente: C, dimension: 'Proveedor', top: 4, dir: 'desc', medida: 'Total', nota: /clientes.*Proveedor/ }, () => suma(C, 'Total', todo)],
  ['costos de los 4 proveedores más grandes', [V, C], { fuente: C, dimension: 'Proveedor', top: 4 }],
  ['costos por categoría', [V, C], { fuente: C, dimension: 'Categoría' }, () => suma(C, 'Total', todo)],
  ['costos por categoría por mes', [V, C], { fuente: C, dimension: 'Categoría', tiempo: 'mes' }],
  ['gastos por centro de costo', [V, C], { fuente: C, dimension: 'Centro de costo' }],
  ['costos de octubre', [V, C], { fuente: C, periodo: ['2026-10-01', '2026-10-31'] }, () => suma(C, 'Total', mes(C, '10'))],
  ['costos pendientes por proveedor', [V, C], { fuente: C, dimension: 'Proveedor', filtro: ['Estado', 'Pendiente'] }, () => suma(C, 'Total', es(C, 'Estado', 'Pendiente'))],
  ['costos pendientes de pago', [V, C], { fuente: C, filtro: ['Estado', 'Pendiente'] }, () => suma(C, 'Total', es(C, 'Estado', 'Pendiente'))],
  ['cuánto gastamos en combustible', [V, C], { fuente: C, filtro: ['Categoría', 'Combustible'] }, () => suma(C, 'Total', es(C, 'Categoría', 'Combustible'))],
  ['gastos de la flotilla excepto combustible', [V, C], { fuente: C, filtro: ['Centro de costo', 'Flotilla'], negado: 'Categoría' }, () => suma(C, 'Total', y(es(C, 'Centro de costo', 'Flotilla'), (r) => r[col(C, 'Categoría')] !== 'Combustible'))],
  ['IVA por proveedor', [V, C], { fuente: C, dimension: 'Proveedor', medida: 'IVA' }, () => suma(C, 'IVA', todo)],
  ['subtotal de costos de septiembre', [V, C], { fuente: C, medida: 'Subtotal', periodo: ['2026-09-01', '2026-09-30'] }, () => suma(C, 'Subtotal', mes(C, '09'))],
  ['los 3 proveedores más pequeños', [V, C], { fuente: C, dimension: 'Proveedor', top: 3, dir: 'asc' }],
  ['compras a Cementos del Norte por mes', [V, C], { fuente: C, filtro: ['Proveedor', 'Cementos del Norte (demo)'], tiempo: 'mes' }, () => suma(C, 'Total', es(C, 'Proveedor', 'Cementos del Norte (demo)'))],
  ['costos mayores a 50 mil', [V, C], { fuente: C, umbral: 50000 }, () => suma(C, 'Total', (r) => r[col(C, 'Total')] > 50000)],
  ['los 5 gastos más grandes', [V, C], { fuente: C, listado: true, top: 5 }],
  ['lista de costos pendientes', [V, C], { fuente: C, listado: true, filtro: ['Estado', 'Pendiente'] }],
  ['costos de nómina por mes', [V, C], { fuente: C, filtro: ['Categoría', 'Nómina'], tiempo: 'mes' }, () => suma(C, 'Total', es(C, 'Categoría', 'Nómina'))],
  ['qué porcentaje de los costos es de cada categoría', [V, C], { fuente: C, dimension: 'Categoría', participacion: true }],
  ['costos por forma de pago con gráfica de pastel', [V, C], { fuente: C, dimension: 'Forma de pago', forma: 'pastel' }],
  ['promedio de costo por proveedor', [V, C], { fuente: C, dimension: 'Proveedor', op: 'promedio' }],
  ['cuántas compras hicimos en octubre', [V, C], { fuente: C, op: 'conteo', periodo: ['2026-10-01', '2026-10-31'] }],
  ['costos de julio a septiembre', [V, C], { fuente: C, periodo: ['2026-07-01', '2026-09-30'] }, () => suma(C, 'Total', (r) => r[0] >= '2026-07-01' && r[0] <= '2026-09-30')],
  ['costos del tercer trimestre', [V, C], { fuente: C, periodo: ['2026-07-01', '2026-09-30'] }],
  ['costos de octubre contra septiembre', [V, C], { fuente: C, comparar: true }],
  ['costos por proveedor octubre vs septiembre', [V, C], { fuente: C, comparar: true, dimension: 'Proveedor' }],
  ['gastos semanales de noviembre', [V, C], { fuente: C, tiempo: 'semana', periodo: ['2026-11-01', '2026-11-30'] }],
  ['costos de este mes', [V, C], { fuente: C, periodo: ['2026-11-01', HOY] }],
  ['costos del mes pasado', [V, C], { fuente: C, periodo: ['2026-10-01', '2026-10-31'] }],
  ['costos de los últimos 3 meses', [V, C], { fuente: C, periodo: ['2026-09-01', HOY] }],
  ['tendencia de los costos', [V, C], { fuente: C, tiempo: 'auto' }],
  ['costos de servicios de la Bodega Norte', [V, C], { fuente: C, filtro: ['Centro de costo', 'Bodega Norte'], filtro2: ['Categoría', 'Servicios'] }, () => suma(C, 'Total', y(es(C, 'Centro de costo', 'Bodega Norte'), es(C, 'Categoría', 'Servicios')))],
  ['costos de mantenimiento de la Bodega Norte', [V, C], { fuente: C, filtro: ['Centro de costo', 'Bodega Norte'] }, null, 'sin_datos'],
  ['servicios y combustible por mes', [V, C], { fuente: C, filtro: ['Categoría', 'Servicios'], tiempo: 'mes' }],
  ['top 2 categorías de gasto', [V, C], { fuente: C, dimension: 'Categoría', top: 2 }],
  ['dame un resumen de los costos', [V, C], { fuente: C }],
  // Ventas
  ['ventas por cliente', [V, C], { fuente: V, dimension: 'Cliente' }, () => suma(V, 'Total', todo)],
  ['ventas por cliente de octubre, los 10 más grandes', [V, C], { fuente: V, dimension: 'Cliente', top: 10, periodo: ['2026-10-01', '2026-10-31'] }, () => suma(V, 'Total', mes(V, '10'))],
  ['los 3 mejores clientes', [V, C], { fuente: V, dimension: 'Cliente', top: 3 }],
  ['los 5 clientes que más compran', [V, C], { fuente: V, dimension: 'Cliente', top: 5 }],
  ['los clientes que menos compran', [V, C], { fuente: V, dimension: 'Cliente', dir: 'asc' }],
  ['ventas por vendedor', [V, C], { fuente: V, dimension: 'Vendedor' }],
  ['ventas por vendedor por mes', [V, C], { fuente: V, dimension: 'Vendedor', tiempo: 'mes' }],
  ['ventas por producto', [V, C], { fuente: V, dimension: 'Producto' }],
  ['ventas por categoría con gráfica de pastel', [V, C], { fuente: V, dimension: 'Categoría', forma: 'pastel' }],
  ['qué porcentaje de las ventas es de cada categoría', [V, C], { fuente: V, dimension: 'Categoría', participacion: true }],
  ['ventas por mes', [V, C], { fuente: V, tiempo: 'mes' }, () => suma(V, 'Total', todo)],
  ['ventas mensuales', [V, C], { fuente: V, tiempo: 'mes' }],
  ['ventas por semana de octubre', [V, C], { fuente: V, tiempo: 'semana', periodo: ['2026-10-01', '2026-10-31'] }],
  ['ventas diarias de noviembre', [V, C], { fuente: V, tiempo: 'dia', periodo: ['2026-11-01', '2026-11-30'] }],
  ['ventas de julio a noviembre', [V, C], { fuente: V, periodo: ['2026-07-01', '2026-11-30'] }],
  ['ventas de octubre y noviembre', [V, C], { fuente: V, periodo: ['2026-10-01', '2026-11-30'] }, () => suma(V, 'Total', (r) => r[0] >= '2026-10-01' && r[0] <= '2026-11-30')],
  ['ventas pendientes por cliente de octubre y noviembre', [V, C], { fuente: V, dimension: 'Cliente', filtro: ['Estado', 'Pendiente'], periodo: ['2026-10-01', '2026-11-30'] }, () => suma(V, 'Total', (r) => r[0] >= '2026-10-01' && r[0] <= '2026-11-30' && r[col(V, 'Estado')] === 'Pendiente')],
  ['ventas pendientes de cobro', [V, C], { fuente: V, filtro: ['Estado', 'Pendiente'] }, () => suma(V, 'Total', es(V, 'Estado', 'Pendiente'))],
  ['ventas pagadas por forma de pago', [V, C], { fuente: V, filtro: ['Estado', 'Pagada'], dimension: 'Forma de pago' }],
  ['ventas de cemento por mes', [V, C], { fuente: V, filtro: ['Categoría', 'Cemento'], tiempo: 'mes' }, () => suma(V, 'Total', es(V, 'Categoría', 'Cemento'))],
  ['ventas de acero de Ana Cantú', [V, C], { fuente: V, filtro: ['Categoría', 'Acero'], filtro2: ['Vendedor', 'Ana Cantú'] }, () => suma(V, 'Total', y(es(V, 'Categoría', 'Acero'), es(V, 'Vendedor', 'Ana Cantú')))],
  ['ventas a Grupo Apodaca', [V, C], { fuente: V, filtro: ['Cliente', 'Grupo Apodaca (demo)'] }, () => suma(V, 'Total', es(V, 'Cliente', 'Grupo Apodaca (demo)'))],
  ['ventas de Apodaca por producto', [V, C], { fuente: V, filtro: ['Cliente', 'Grupo Apodaca (demo)'], dimension: 'Producto' }],
  ['ventas excepto Ferretería La Paz', [V, C], { fuente: V, negado: 'Cliente' }, () => suma(V, 'Total', (r) => r[col(V, 'Cliente')] !== 'Ferretería La Paz (demo)')],
  ['cuántas ventas hubo en noviembre', [V, C], { fuente: V, op: 'conteo', periodo: ['2026-11-01', '2026-11-30'] }],
  ['número de ventas por vendedor', [V, C], { fuente: V, op: 'conteo', dimension: 'Vendedor' }],
  ['ticket promedio por cliente', [V, C], { fuente: V, op: 'promedio', dimension: 'Cliente' }],
  ['promedio de venta por vendedor', [V, C], { fuente: V, op: 'promedio', dimension: 'Vendedor' }],
  ['unidades vendidas por producto', [V, C], { fuente: V, medida: 'Cantidad', dimension: 'Producto' }, () => suma(V, 'Cantidad', todo)],
  ['las 5 ventas más grandes', [V, C], { fuente: V, listado: true, top: 5 }],
  ['las 10 ventas más grandes de octubre', [V, C], { fuente: V, listado: true, top: 10, periodo: ['2026-10-01', '2026-10-31'] }],
  ['lista de ventas pendientes', [V, C], { fuente: V, listado: true, filtro: ['Estado', 'Pendiente'] }],
  ['ventas mayores a $20,000', [V, C], { fuente: V, umbral: 20000 }, () => suma(V, 'Total', (r) => r[col(V, 'Total')] > 20000)],
  ['ventas de este mes', [V, C], { fuente: V, periodo: ['2026-11-01', HOY] }],
  ['ventas del mes pasado por cliente', [V, C], { fuente: V, dimension: 'Cliente', periodo: ['2026-10-01', '2026-10-31'] }],
  ['ventas de los últimos 2 meses', [V, C], { fuente: V, periodo: ['2026-10-01', HOY] }],
  ['ventas de octubre contra septiembre', [V, C], { fuente: V, comparar: true }],
  ['ventas por cliente octubre vs septiembre', [V, C], { fuente: V, comparar: true, dimension: 'Cliente' }],
  ['ventas de este año', [V, C], { fuente: V, periodo: ['2026-01-01', HOY] }],
  ['ventas 2026', [V, C], { fuente: V, periodo: ['2026-01-01', '2026-12-31'] }],
  ['evolución de las ventas', [V, C], { fuente: V, tiempo: 'auto' }],
  ['ventas por cliente top 3 con gráfica de barras', [V, C], { fuente: V, dimension: 'Cliente', top: 3, forma: 'barras' }],
  ['ventas por trimestre', [V, C], { fuente: V, tiempo: 'trimestre' }],
  ['facturación por cliente de septiembre', [V, C], { fuente: V, dimension: 'Cliente', periodo: ['2026-09-01', '2026-09-30'] }],
  ['ingresos por mes', [V, C], { fuente: V, tiempo: 'mes' }],
  ['resumen de ventas', [V, C], { fuente: V }],
  // Dos fuentes
  ['ventas contra costos por mes', [V, C], { fuente: V, fuente2: C, tiempo: 'mes' }],
  ['utilidad por mes', [V, C], { fuente: V, fuente2: C }],
  ['margen de octubre', [V, C], { fuente: V, fuente2: C, periodo: ['2026-10-01', '2026-10-31'] }],
  ['ventas vs gastos', [V, C], { fuente: V, fuente2: C }],
  ['ventas contra cobros en bancos', [V, C, B], { fuente: V, fuente2: B }],
  // Bancos
  ['entradas de los bancos por mes', [V, C, B], { fuente: B, medida: 'Entrada', tiempo: 'mes' }, () => suma(B, 'Entrada', (r) => r[5] !== 'traspaso')],
  ['salidas de bancos por contraparte', [V, C, B], { fuente: B, medida: 'Salida', dimension: 'Contraparte' }, () => suma(B, 'Salida', (r) => r[5] !== 'traspaso')],
  ['movimientos del banco por cuenta', [V, C, B], { fuente: B, dimension: 'Cuenta' }],
  ['depósitos de octubre en el banco', [V, C, B], { fuente: B, medida: 'Entrada', periodo: ['2026-10-01', '2026-10-31'] }],
  ['los 10 pagos más grandes del banco', [V, C, B], { fuente: B, listado: true, top: 10 }],
  ['salidas del banco por categoría', [V, C, B], { fuente: B, medida: 'Salida', dimension: 'Categoría' }],
  ['cobros por cliente', [B], { fuente: B, medida: 'Entrada', dimension: 'Contraparte' }],
  ['gastos por mes', [B], { fuente: B, medida: 'Salida', tiempo: 'mes' }],
  // Un solo archivo: no hace falta decir de qué
  ['octubre contra septiembre', [V], { fuente: V, comparar: true }],
  ['por cliente', [V], { fuente: V, dimension: 'Cliente' }],
  ['los 4 más grandes', [C], { fuente: C, top: 4 }],
  ['por categoría con porcentajes', [C], { fuente: C, dimension: 'Categoría', participacion: true }],
  ['noviembre por centro de costo', [C], { fuente: C, dimension: 'Centro de costo', periodo: ['2026-11-01', '2026-11-30'] }],
];

for (const [q, fuentes, e, tot, debeFallar] of casos) {
  const it = I.interpretar(q, fuentes, { hoy: HOY }), p = it.plan, tag = `«${q}»`;
  const fallas = [];
  if (e.fuente && p.fuente !== e.fuente.nombre) fallas.push(`fuente=${p.fuente}`);
  if (e.fuente2 && p.fuente2 !== e.fuente2.nombre) fallas.push(`fuente2=${p.fuente2}`);
  if (e.dimension && p.dimension !== e.dimension) fallas.push(`dimension=${p.dimension}`);
  if (!e.dimension && !e.fuente2 && !e.comparar && p.dimension && !e.listado) fallas.push(`dimension de más=${p.dimension}`);
  if (e.top && p.top !== e.top) fallas.push(`top=${p.top}`);
  if (e.dir && p.dir !== e.dir) fallas.push(`dir=${p.dir}`);
  if (e.medida && p.medida.columna !== e.medida) fallas.push(`medida=${p.medida.columna}`);
  if (e.op && p.medida.op !== e.op) fallas.push(`op=${p.medida.op}`);
  if (e.tiempo && p.tiempo !== e.tiempo) fallas.push(`tiempo=${p.tiempo}`);
  if (e.listado && !p.listado) fallas.push('listado');
  if (e.participacion && !p.participacion) fallas.push('participacion');
  if (e.forma && p.forma !== e.forma) fallas.push(`forma=${p.forma}`);
  if (e.comparar && !p.comparar) fallas.push('comparar');
  if (e.umbral && !(p.umbral && p.umbral.valor === e.umbral)) fallas.push(`umbral=${JSON.stringify(p.umbral)}`);
  if (e.periodo && !(p.periodos[0] && p.periodos[0].desde === e.periodo[0] && p.periodos[0].hasta === e.periodo[1])) fallas.push(`periodo=${JSON.stringify(p.periodos[0])}`);
  for (const k of ['filtro', 'filtro2']) if (e[k] && !p.filtros.some((f) => f.columna === e[k][0] && f.op === 'en' && f.valor.includes(e[k][1]))) fallas.push(`${k}=${JSON.stringify(p.filtros)}`);
  if (e.negado && !p.filtros.some((f) => f.columna === e.negado && f.op === 'no_en')) fallas.push(`negado=${JSON.stringify(p.filtros)}`);
  if (e.nota && !it.notas.some((n) => e.nota.test(n))) fallas.push('nota');
  if (it.confianza !== 'alta') fallas.push(`confianza=${it.confianza} (${it.ignorado.join(',')})`);
  ok(`entiende ${tag}`, !fallas.length, fallas.join(' · '));
  // Siempre debe armarse un reporte que pase el verificador.
  const out = RP.armarDesdePlan(p, fuentes, it.notas, 'motor', it.entendido);
  if (debeFallar) { ok(`sin datos lo dice claro ${tag}`, !out.ok && out.error === debeFallar && /No encontré renglones/.test(out.mensaje)); continue; }
  ok(`arma y verifica ${tag}`, out.ok, out.ok ? '' : `${out.error}: ${out.mensaje} ${out.detalle || ''}`);
  if (out.ok && tot) {
    const ind = out.reporte.secciones.find((s) => s.tipo === 'indicadores'), it0 = ind && ind.items[0], d = it0 && out.reporte.datos[it0.consulta];
    const j = d ? d.columnas.findIndex((c) => c.nombre === it0.columna) : -1, v = j >= 0 ? d.filas[it0.fila || 0][j] : null;
    ok(`total exacto ${tag}`, v != null && Math.abs(v - tot()) < 0.011, `motor=${v} a mano=${tot()}`);
  }
}

/* ── honestidad ── */
{
  const it = I.interpretar('ventas de material eléctrico por vendedor', [V, C], { hoy: HOY });
  ok('una palabra que no existe en los datos NO da confianza alta (se pide ayuda o se avisa)', it.confianza !== 'alta' && it.ignorado.includes('electrico'));
  const out = RP.armarDesdePlan(it.plan, [V, C], it.notas, 'motor', it.entendido);
  ok('…y si se arma igual, el reporte dice qué palabras no usó', out.ok && /No usé estas palabras: .*electrico/.test(out.reporte.resumen));
  const sd = I.interpretar('ventas de marzo', [V, C], { hoy: HOY });
  const o2 = RP.armarDesdePlan(sd.plan, [V, C], sd.notas, 'motor', sd.entendido);
  ok('un periodo sin datos no inventa un reporte vacío: dice qué fechas hay', !o2.ok && o2.error === 'sin_datos' && /tiene datos del 1 de julio de 2026/.test(o2.mensaje), JSON.stringify(o2));
  const rel = I.interpretar('ventas de esta semana', [V], { hoy: '2027-02-10' });
  const o3 = RP.armarDesdePlan(rel.plan, [V], rel.notas, 'motor', rel.entendido);
  ok('un periodo relativo sin datos usa el mes más reciente con datos y lo dice', o3.ok && /No hay datos en esta semana/.test(o3.reporte.resumen), o3.mensaje);
  const plan = JSON.parse(JSON.stringify(I.interpretar('ventas por cliente', [V], { hoy: HOY }).plan));
  const RC = require('./src/recetas'); const b = RC.construir(plan, [V], RP.consultar, {});
  b.reporte.resumen += ' Además ganamos $9,999,999.00.';
  ok('el verificador rechaza una cifra que no salió de una consulta (también en el camino sin IA)', RP.verificar(b.reporte, b.consultas, require('./src/dalia')._permitidos(b.permitidos)).some((x) => /9,999,999/.test(x)));
  const vp = I.validarPlan({ fuente: 'Ventas de prueba.xlsx', medida: { op: 'suma', columna: 'Utilidad' }, dimension: 'Región' }, [V]);
  ok('un plan de la IA con columnas inventadas se rechaza', vp.errs.length === 2, vp.errs.join(' '));
  const vp2 = I.validarPlan({ fuente: 'Otro.xlsx', medida: { op: 'suma', columna: 'Total' } }, [V]);
  ok('un plan de la IA con una fuente inventada se rechaza', vp2.errs.some((x) => /no existe/.test(x)));
  const cambio = I.interpretar('solo octubre', [V], { hoy: HOY, base: I.interpretar('ventas por cliente, los 3 más grandes', [V], { hoy: HOY }).plan });
  ok('pedir un cambio conserva lo anterior y cambia solo lo dicho', cambio.plan.dimension === 'Cliente' && cambio.plan.top === 3 && cambio.plan.periodos[0].desde === '2026-10-01');
  const c2 = I.interpretar('cambia la gráfica a pastel', [V], { hoy: HOY, base: cambio.plan });
  ok('cambio de gráfica sobre el plan anterior', c2.plan.forma === 'pastel' && c2.plan.dimension === 'Cliente' && c2.plan.top === 3);
  const fs = require('fs'), src = ['intencion.js', 'recetas.js'].map((f) => fs.readFileSync(__dirname + '/src/' + f, 'utf8')).join('\n');
  ok('el intérprete y las recetas no llaman a la IA, la red ni la base de datos', !/require\(['"](\.\/dalia|@anthropic|https?|sequelize|\.\/db|pg)['"]\)|fetch\(|messages\.create/.test(src));
}

console.log(`\nMotor de reportes: ${pass}/${pass + fail} (${casos.length} preguntas)`);
if (require.main === module) process.exit(fail ? 1 : 0);
module.exports = { pass, fail };
