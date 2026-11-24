'use strict';
/**
 * INTÉRPRETE DE PREGUNTAS · el motor propio que entiende lo que el cliente pide SIN llamar a la IA.
 *
 * Convierte una petición en español («costos de los 4 proveedores más grandes de julio a noviembre,
 * con gráfica de pastel») en un PLAN estructurado: qué fuente, qué medir, por qué agrupar, qué periodo,
 * cuántos, qué filtros y qué gráfica. Las cuentas las hace después recetas.js con el motor de consultas.
 *
 * Reglas que no se negocian:
 *  - Todo sale de las columnas y los valores que el archivo REALMENTE tiene (el catálogo). Si el cliente
 *    pide «clientes» y el archivo solo tiene «Proveedor», se usa Proveedor Y SE DICE en `notas`.
 *  - Lo que no se entendió se devuelve en `ignorado`, nunca se adivina en silencio.
 *  - La confianza es «alta» solo si se sabe qué fuente y qué medir y no quedó texto importante sin usar;
 *    con confianza «baja» el sistema pide ayuda a la IA (una sola llamada que devuelve un plan, no números).
 * Este archivo no toca la base de datos, la red ni un modelo.
 */

const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n) => String(n).padStart(2, '0');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_CORTO = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const NUM_PAL = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30, cincuenta: 50, cien: 100 };
const finMes = (y, m) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
const sumDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const etiquetaMes = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/* ── 1. CATÁLOGO: qué es cada columna de cada fuente ─────────────────── */
// Papel de una columna, por su nombre. El orden importa: «Forma de pago» es forma_pago antes que «pago».
const ROLES = [
  ['forma_pago', /forma de pago|metodo de pago|condicion(es)? de pago|tipo de pago/],
  ['centro', /centro de costo|sucursal|bodega|almacen|tienda|obra|proyecto|departamento|\barea\b|planta/],
  ['cliente', /^cliente|nombre del cliente|razon social|comprador|^customer/],
  ['proveedor', /proveedor|acreedor|supplier/],
  ['vendedor', /vendedor|agente|asesor|ejecutivo|representante/],
  ['producto', /producto|articulo|\bsku\b|^item|^material$|descripcion del producto/],
  ['categoria', /categor|familia|linea|rubro|clasificaci|^tipo/],
  ['estado', /^estado|estatus|status|situacion/],
  ['contraparte', /contraparte|beneficiario|ordenante|tercero/],
  ['cuenta', /^cuenta$|^banco$/],
  ['ciudad', /ciudad|zona|region|municipio|plaza/],
  ['concepto', /concepto|descripcion|detalle|glosa/],
  ['folio', /folio|factura|^documento|referencia|^numero|^no\.?$|^id$/],
];
// Palabras con que el cliente nombra cada papel (singular y plural, con o sin acento).
const PAL_ROL = [
  ['forma_pago', /formas? de pago|metodos? de pago|condiciones de pago/],
  ['centro', /centros? de costos?|sucursal(es)?|bodegas?|almacen(es)?|tiendas?|obras?|proyectos?|departamentos?|plantas?/],
  ['cliente', /clientes?|compradores?/],
  ['proveedor', /proveedor(es)?|acreedores?/],
  ['vendedor', /vendedor(es|as)?|vendedoras?|agentes?|asesor(es|as)?|ejecutivos?/],
  ['producto', /productos?|articulos?|items?|skus?|mercancias?/],
  ['categoria', /categorias?|familias?|lineas? de producto|rubros?|tipos? de gasto|tipos? de costo|clasificacion(es)?/],
  ['estado', /estatus|estados? de (pago|la venta|las ventas)|por estado/],
  ['contraparte', /contrapartes?|beneficiarios?|ordenantes?/],
  ['cuenta', /cuentas? bancarias?|por cuenta|cada cuenta|por banco|cada banco/],
  ['ciudad', /ciudad(es)?|zonas?|regiones?|municipios?|plazas?/],
  ['concepto', /conceptos?/],
];
// Si el cliente pide un papel que la fuente no tiene, estos lo sustituyen (y se avisa).
const SUSTITUTO = { cliente: ['contraparte', 'proveedor'], proveedor: ['contraparte', 'cliente'], contraparte: ['cliente', 'proveedor'], producto: ['concepto', 'categoria'], concepto: ['producto', 'categoria'], categoria: ['concepto'], cuenta: [] };
const NOMBRE_ROL = { cliente: 'clientes', proveedor: 'proveedores', vendedor: 'vendedores', producto: 'productos', categoria: 'categorías', centro: 'centros de costo', estado: 'estados', forma_pago: 'formas de pago', contraparte: 'contrapartes', cuenta: 'cuentas', ciudad: 'ciudades', concepto: 'conceptos' };

function rolDe(nombre) { const n = norm(nombre).trim(); for (const [r, re] of ROLES) if (re.test(n)) return r; return null; }

/** Qué tipo de datos es cada fuente: ventas, costos, bancos u otro. */
function claseFuente(f) {
  const n = norm(f.nombre), cols = f.tabla.columnas.map((c) => rolDe(c.nombre));
  if (n === 'bancos') return 'bancos';
  if (/venta|factur|ingreso/.test(n)) return 'ventas';
  if (/cost|gasto|compra|egreso|proveed/.test(n)) return 'costos';
  if (/cobr|cxc|por cobrar|cartera/.test(n)) return 'cobranza';
  if (cols.includes('cliente')) return 'ventas';
  if (cols.includes('proveedor')) return 'costos';
  return 'otro';
}
/** Columna de dinero principal: Total, Importe, Monto… nunca Cantidad, Precio unitario, IVA ni porcentajes. */
function medidaPrincipal(tabla) {
  const nums = tabla.columnas.map((c, j) => ({ c, j })).filter((x) => x.c.tipo === 'numero');
  const pref = [/^total$/, /^importe$|^monto$/, /importe|monto/, /^total/, /total/, /subtotal/];
  for (const re of pref) { const x = nums.find((y) => re.test(norm(y.c.nombre)) && !/iva|impuesto|%|porcentaje/.test(norm(y.c.nombre))); if (x) return x.c.nombre; }
  const x = nums.find((y) => !/cantidad|precio|iva|impuesto|%|porcentaje|unidades|piezas|folio/.test(norm(y.c.nombre)));
  return x ? x.c.nombre : (nums[0] ? nums[0].c.nombre : null);
}
function fechaPrincipal(tabla) {
  const fs = tabla.columnas.filter((c) => c.tipo === 'fecha');
  return (fs.find((c) => /^fecha$/.test(norm(c.nombre))) || fs.find((c) => !/venc|pago|entrega/.test(norm(c.nombre))) || fs[0] || {}).nombre || null;
}
function catalogo(fuentes) {
  return fuentes.map((f) => {
    const t = f.tabla, fecha = fechaPrincipal(t), jf = t.columnas.findIndex((c) => c.nombre === fecha);
    const fechas = jf >= 0 ? t.filas.map((r) => r[jf]).filter(Boolean).sort() : [];
    const textos = t.columnas.map((c, j) => ({ c, j })).filter((x) => x.c.tipo === 'texto').map(({ c, j }) => {
      const cnt = new Map(); for (const r of t.filas) if (r[j] != null) cnt.set(r[j], (cnt.get(r[j]) || 0) + 1);
      return { nombre: c.nombre, rol: rolDe(c.nombre), distintos: cnt.size, valores: cnt.size <= 600 ? [...cnt.keys()] : [] };
    });
    return { nombre: f.nombre, clase: claseFuente(f), renglones: t.filas.length, medida: medidaPrincipal(t), fecha, desde: fechas[0] || null, hasta: fechas[fechas.length - 1] || null,
      numericas: t.columnas.filter((c) => c.tipo === 'numero').map((c) => c.nombre), textos };
  });
}

/* ── 2. LECTURA DE LA PETICIÓN ────────────────────────────────────────── */
const VACIAS = new Set('a al algo ante bajo como con contra cual cuales cuanto cuanta cuantos cuantas de del desde donde dame dime el ella en entre era es esa ese eso esta este esto estos estas fue ha hay hasta haz la las le lo los me mi mis muestra muestrame mostrar necesito o para pero por porfa porfavor favor que quiero quisiera reporte reportes ser se si sin sobre solo sus su tambien te tu un una uno unos unas y ya ver veo dar genera generar hacer haz crea crear arma armar informe tabla grafica graficas grafico detalle detallado todo todos todas cada total totales general mostrando incluye incluir incluyendo agrega agregar pon poner ordenado ordenados ordenadas ordena orden mayor menor mas menos grande grandes chico chicos pequeno pequenos datos dato info informacion archivo excel según segun respecto vez nos les mio mia bien gracias hola hubo hay habia tuvimos tenemos tengo tienen tiene hicimos hice fueron fue han sido estan quiero queremos podrias puedes puedo saber conocer ensename revisar revisa analiza analizar analisis resumen resume excepto salvo sin contar ademas tambien solamente unicamente nada mas'.split(' '));

function numero(tok) { if (/^\d+$/.test(tok)) return Number(tok); return NUM_PAL[tok] || null; }

/** Periodos: «octubre», «julio a noviembre», «octubre 2026», «este mes», «últimos 3 meses», «2026», «tercer trimestre». */
function leerPeriodos(t, hoy, anioBase) {
  const out = [], usados = [];
  const y0 = Number(String(hoy).slice(0, 4)), m0 = Number(String(hoy).slice(5, 7));
  const mesRe = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)';
  const mesN = (s) => { const i = MESES.indexOf(s === 'setiembre' ? 'septiembre' : s); return i >= 0 ? i + 1 : MES_CORTO[s]; };
  const anioDe = (s) => (s ? Number(s.length === 2 ? '20' + s : s) : null);
  let m;
  // Rango de meses: «de julio a noviembre», «julio-noviembre 2026», «entre julio y noviembre».
  const reR = new RegExp(`(?:de |desde |entre )?\\b${mesRe}\\b(?: (?:de |del )?(\\d{4}))? ?(?:a|al|hasta|y|-) ?\\b${mesRe}\\b(?: (?:de |del )?(\\d{4}))?`, 'g');
  while ((m = reR.exec(t))) {
    const a = mesN(m[1]), b = mesN(m[3]); if (!a || !b) continue;
    const yb = anioDe(m[4]) || anioDe(m[2]) || anioBase, ya = anioDe(m[2]) || (a > b ? yb - 1 : yb);
    out.push({ desde: `${ya}-${pad(a)}-01`, hasta: finMes(yb, b), etiqueta: `${MESES[a - 1]} a ${MESES[b - 1]} ${yb}`, relativo: false }); usados.push(m[0]);
  }
  let resto = t; for (const u of usados) resto = resto.replace(u, ' ');
  // Mes suelto (con año opcional). Varios meses sueltos = comparación o lista.
  const reM = new RegExp(`\\b${mesRe}\\b(?: (?:de |del )?(\\d{4}))?`, 'g');
  while ((m = reM.exec(resto))) {
    if (m[1] === 'mar' && !/\bmar\b \d{4}/.test(m[0])) continue; // «mar» casi nunca es marzo en una pregunta
    if (m[1] === 'may' && !/\d{4}/.test(m[0])) continue;
    const a = mesN(m[1]); if (!a) continue;
    const y = anioDe(m[2]) || anioBase;
    out.push({ desde: `${y}-${pad(a)}-01`, hasta: finMes(y, a), etiqueta: `${MESES[a - 1]} ${y}`, relativo: false }); usados.push(m[0]);
  }
  for (const u of usados) resto = resto.replace(u, ' ');
  const rel = (desde, hasta, etiqueta, frase) => { out.push({ desde, hasta, etiqueta, relativo: true }); usados.push(frase); };
  if ((m = resto.match(/\b(este mes|mes actual|en lo que va del mes)\b/))) rel(`${y0}-${pad(m0)}-01`, hoy, `este mes (${MESES[m0 - 1]})`, m[0]);
  if ((m = resto.match(/\b(el )?mes (pasado|anterior)\b/))) { const y = m0 === 1 ? y0 - 1 : y0, mm = m0 === 1 ? 12 : m0 - 1; rel(`${y}-${pad(mm)}-01`, finMes(y, mm), `el mes pasado (${MESES[mm - 1]})`, m[0]); }
  if ((m = resto.match(/\b(este ano|ano actual|en lo que va del ano)\b/))) rel(`${y0}-01-01`, hoy, `este año (${y0})`, m[0]);
  if ((m = resto.match(/\b(el )?ano (pasado|anterior)\b/))) rel(`${y0 - 1}-01-01`, `${y0 - 1}-12-31`, `el año pasado (${y0 - 1})`, m[0]);
  if ((m = resto.match(/\b(esta semana)\b/))) { const d = new Date(hoy + 'T12:00:00Z'), w = (d.getUTCDay() + 6) % 7; rel(sumDias(hoy, -w), hoy, 'esta semana', m[0]); }
  if ((m = resto.match(/\b(la )?semana (pasada|anterior)\b/))) { const d = new Date(hoy + 'T12:00:00Z'), w = (d.getUTCDay() + 6) % 7, l = sumDias(hoy, -w - 7); rel(l, sumDias(l, 6), 'la semana pasada', m[0]); }
  if ((m = resto.match(/\bhoy\b/))) rel(hoy, hoy, 'hoy', m[0]);
  if ((m = resto.match(/\bayer\b/))) rel(sumDias(hoy, -1), sumDias(hoy, -1), 'ayer', m[0]);
  if ((m = resto.match(/\b(?:los |las )?ultim[oa]s? (\w+ )?(dias|semanas|meses|anos)\b/))) {
    const n = (m[1] && numero(m[1].trim())) || 1, u = m[2];
    if (u === 'dias') rel(sumDias(hoy, -(n - 1)), hoy, `los últimos ${n} días`, m[0]);
    else if (u === 'semanas') rel(sumDias(hoy, -(7 * n - 1)), hoy, `las últimas ${n} semanas`, m[0]);
    else if (u === 'meses') { let y = y0, mm = m0 - (n - 1); while (mm < 1) { mm += 12; y--; } rel(`${y}-${pad(mm)}-01`, hoy, `los últimos ${n} meses`, m[0]); }
    else rel(`${y0 - n + 1}-01-01`, hoy, `los últimos ${n} años`, m[0]);
  }
  const ordT = { primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4 };
  if ((m = resto.match(/\b(primer|primero|segundo|tercer|tercero|cuarto) trimestre(?: (?:de |del )?(\d{4}))?|\bq([1-4])(?: (\d{4}))?\b/))) {
    const q = m[1] ? ordT[m[1]] : Number(m[3]), y = Number(m[2] || m[4]) || anioBase;
    out.push({ desde: `${y}-${pad(q * 3 - 2)}-01`, hasta: finMes(y, q * 3), etiqueta: `el ${['primer', 'segundo', 'tercer', 'cuarto'][q - 1]} trimestre de ${y}`, relativo: false }); usados.push(m[0]);
  } else if ((m = resto.match(/\b(este|el ultimo) trimestre\b|\btrimestre (actual|pasado|anterior)\b/))) {
    let q = Math.ceil(m0 / 3), y = y0; if (/ultimo|pasado|anterior/.test(m[0])) { q--; if (q < 1) { q = 4; y--; } }
    rel(`${y}-${pad(q * 3 - 2)}-01`, q === Math.ceil(m0 / 3) && y === y0 ? hoy : finMes(y, q * 3), `${/ultimo|pasado|anterior/.test(m[0]) ? 'el trimestre pasado' : 'este trimestre'}`, m[0]);
  }
  for (const u of usados) resto = resto.replace(u, ' ');
  if (!out.length && (m = resto.match(/\b(?:en |del |de |el )?(?:ano )?(20\d{2})\b/))) { out.push({ desde: `${m[1]}-01-01`, hasta: `${m[1]}-12-31`, etiqueta: `el año ${m[1]}`, relativo: false }); usados.push(m[0]); }
  // «desde octubre», «hasta septiembre»: abren un rango con un solo extremo.
  return { periodos: out, usados };
}

/** Busca en el texto valores reales de las columnas de texto (un cliente, una categoría, «pendiente»…). */
function leerValores(t, cat, excluir) {
  const palabras = t.split(/[^a-z0-9ñ]+/).filter(Boolean);
  const cols = cat.textos.filter((c) => c.valores.length && c.rol !== 'folio').map((col) => ({ col, vals: col.valores.map((v) => ({ v, n: norm(v).replace(/\(demo\)/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim() })).filter((x) => x.n.length >= 3), hits: new Set(), frases: [] }));
  const tomadas = new Set(); // palabras ya explicadas por un valor completo: no se reusan en otra columna
  // 1) El valor completo aparece tal cual (con plural sencillo): «material», «bodega norte», «pagadas».
  for (const c of cols) for (const x of c.vals) {
    const re = new RegExp(`\\b${x.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?\\b`);
    const mm = t.match(re); if (mm && !excluir.has(x.n)) { c.hits.add(x.v); c.frases.push(mm[0]); x.n.split(' ').forEach((w) => tomadas.add(w)); }
  }
  // 2) Un valor de una sola palabra por su raíz: «pendientes» -> «Pendiente», «pagadas» -> «Pagada».
  for (const c of cols) { if (c.hits.size) continue; for (const x of c.vals) {
    if (x.n.includes(' ') || x.n.length < 5) continue;
    const raiz = x.n.slice(0, Math.max(5, x.n.length - 2));
    const w = palabras.find((p) => p.length >= 5 && p.startsWith(raiz) && !excluir.has(p) && !tomadas.has(p)); if (w) { c.hits.add(x.v); c.frases.push(w); tomadas.add(w); }
  } }
  // 3) Una palabra distintiva de un nombre largo: «apodaca» -> «Grupo Constructor Apodaca».
  for (const c of cols) { if (c.hits.size) continue; for (const w of palabras) {
    if (w.length < 5 || VACIAS.has(w) || excluir.has(w) || tomadas.has(w)) continue;
    const cand = c.vals.filter((x) => x.n.split(' ').includes(w));
    if (cand.length && cand.length <= 8 && cand.length < c.vals.length) { cand.forEach((x) => c.hits.add(x.v)); c.frases.push(w); tomadas.add(w); }
  } }
  const filtros = [], usados = [];
  for (const c of cols) {
    if (!c.hits.size) continue;
    const negado = c.frases.some((f) => new RegExp(`(excepto|menos|sin contar|salvo|sin|que no sean?|no) (el |la |los |las |a |de )?${f}`).test(t));
    filtros.push({ columna: c.col.nombre, op: negado ? 'no_en' : 'en', valor: [...c.hits].slice(0, 30) });
    usados.push(...c.frases);
  }
  return { filtros, usados };
}

/**
 * Lee la petición y devuelve el plan. `base` (opcional) es el plan del reporte anterior cuando el cliente
 * pide un cambio: lo que la nueva frase dice reemplaza, lo demás se conserva.
 */
function interpretar(peticion, fuentes, opts = {}) {
  const hoy = opts.hoy || new Date().toISOString().slice(0, 10);
  const t0 = ' ' + norm(peticion).replace(/(\d),(\d{3})/g, '$1$2').replace(/(\d),(\d{3})/g, '$1$2').replace(/[¿?¡!,;:"“”()]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const cats = catalogo(fuentes);
  const notas = [], consumido = [];
  const toma = (re) => { const m = t0.match(re); if (m) consumido.push(m[0]); return m; };
  const base = opts.base || null;

  // ── Qué medir ──
  const quiere = {
    ventas: /\bvent(a|as)\b|\bvend(i|io|imos|ido|idos|idas)\b|\bfactura(do|cion|ciones)\b|\bingresos?\b/.test(t0),
    costos: /\bcost(o|os)\b|\bgast(o|os|amos|ado)\b|\bcompr(a|as|amos|ado)\b|\begresos?\b|\berogaciones\b/.test(t0),
    cobros: /\bcobr(o|os|amos|ado|anza)\b|\bentradas?\b|\bdepositos?\b|\babonos?\b/.test(t0),
    pagos: /\bpagos? (hechos|realizados|a proveedores)\b|\bsalidas?\b|\bretiros?\b|\bcargos?\b/.test(t0),
    bancos: /\bbancos?\b|\bbancari|\bmovimientos?\b|estado de cuenta|\bcuentas? bancarias?\b/.test(t0),
    utilidad: /\butilidad\b|\bganancia\b|\bmargen\b|\brentabilidad\b/.test(t0),
  };
  const contra = /\b(contra|vs|versus|comparad[oa]s? con|frente a|comparar|compara|comparacion|comparativo)\b/.test(t0);
  let op = 'suma';
  if (toma(/\b(cuant(o|a)s (ventas|facturas|operaciones|movimientos|compras|registros|pedidos|tickets|transacciones)|numero de (ventas|facturas|operaciones|movimientos|compras|registros|pedidos)|cantidad de (ventas|facturas|operaciones|movimientos|compras|pedidos)|conteo)\b/)) op = 'conteo';
  else if (toma(/\b(promedio|ticket (medio|promedio)|en promedio|media)\b/)) op = 'promedio';

  // ── Qué fuente ──
  const archivos = cats.filter((c) => c.clase !== 'bancos'), bancos = cats.find((c) => c.clase === 'bancos');
  const porClase = (k) => archivos.find((c) => c.clase === k);
  // Mención directa del nombre del archivo («el archivo de costos», «el excel de ventas»).
  const mencion = archivos.find((c) => norm(c.nombre).replace(/\.(xlsx|xls|csv|pdf)$/, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !['forzza', 'prueba', 'dummy', 'reporte'].includes(w)).some((w) => t0.includes(' ' + w)));
  let fuente = null, fuente2 = null, signo = null;
  if (quiere.utilidad || (contra && quiere.ventas && quiere.costos)) {
    const v = porClase('ventas'), c = porClase('costos');
    if (v && c) { fuente = v; fuente2 = c; }
    else if (v && bancos) { fuente = v; fuente2 = bancos; signo = 'salida'; notas.push('No hay un archivo de costos: los costos se tomaron de las salidas de tus bancos.'); }
  } else if (contra && quiere.ventas && quiere.cobros && porClase('ventas') && bancos) { fuente = porClase('ventas'); fuente2 = bancos; signo = 'entrada'; }
  if (!fuente) {
    if (quiere.bancos && bancos && !mencion) { fuente = bancos; signo = quiere.costos || quiere.pagos ? 'salida' : quiere.ventas || quiere.cobros ? 'entrada' : null; }
    else if (mencion) fuente = mencion;
    else if (quiere.ventas && porClase('ventas')) fuente = porClase('ventas');
    else if ((quiere.costos || quiere.pagos) && porClase('costos')) fuente = porClase('costos');
    else if ((quiere.cobros) && porClase('cobranza')) fuente = porClase('cobranza');
    else if ((quiere.cobros || quiere.pagos) && bancos) { fuente = bancos; signo = quiere.cobros ? 'entrada' : 'salida'; }
    else if ((quiere.costos) && bancos && !archivos.length) { fuente = bancos; signo = 'salida'; }
    else if (quiere.ventas && bancos && !archivos.length) { fuente = bancos; signo = 'entrada'; notas.push('No subiste un archivo de ventas: se usaron las entradas de tus bancos.'); }
    else if (archivos.length === 1) fuente = archivos[0];
    else if (!archivos.length && bancos) fuente = bancos;
    else if (base) fuente = cats.find((c) => c.nombre === base.fuente) || null;
    else {
      // Ninguna palabra de medida: se elige el archivo que tiene lo que la frase nombra (un papel, una columna o un valor).
      const pts = archivos.map((c) => {
        let p = 0;
        for (const [rol, re] of PAL_ROL) if (re.test(t0) && c.textos.some((x) => x.rol === rol)) p += 2;
        for (const n of c.numericas.concat(c.textos.map((x) => x.nombre))) { const k = norm(n); if (k.length >= 3 && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`).test(t0)) p += 2; }
        const w = t0.split(/[^a-z0-9ñ]+/).filter((x) => x.length >= 5 && !VACIAS.has(x));
        for (const x of c.textos) if (x.valores.some((v) => w.some((y) => norm(v).includes(y)))) p += 1;
        return { c, p };
      }).sort((a, b) => b.p - a.p);
      if (pts[0] && pts[0].p > 0 && (!pts[1] || pts[0].p > pts[1].p)) fuente = pts[0].c;
    }
  }
  if (quiere.costos && fuente && fuente.clase === 'ventas' && !fuente2) notas.push('Pediste costos pero el archivo elegido es de ventas.');
  const anioBase = Number(((fuente && fuente.hasta) || hoy).slice(0, 4));

  // ── Periodos ──
  const { periodos, usados: pu } = leerPeriodos(t0, hoy, anioBase); consumido.push(...pu);

  // ── Agrupar por tiempo ──
  let tiempo = null;
  const mt = toma(/\b(por|cada|x) (dia|semana|mes|trimestre|ano)\b|\b(diari[oa]s?|semanal(es)?|mensual(es|mente)?|trimestral(es)?|anual(es)?)\b|\b(tendencia|evolucion|historico|comportamiento|mes a mes|semana a semana)\b/);
  if (mt) {
    const w = mt[0];
    tiempo = /dia|diari/.test(w) ? 'dia' : /semana/.test(w) ? 'semana' : /trimestr/.test(w) ? 'trimestre' : /ano|anual/.test(w) ? 'año' : 'mes';
    if (/tendencia|evolucion|historico|comportamiento/.test(w)) tiempo = null; // se decide abajo por el largo del periodo
    if (!tiempo) tiempo = 'auto';
  }

  // ── Agrupar por una columna (papel o nombre de columna) ──
  let dimension = null, pedidoRol = null;
  if (fuente) {
    const t1 = t0.replace(/\b(por|de|cada|x|entre|segun)\b/g, (s) => s);
    // Nombre de columna escrito tal cual: «por Centro de costo», «por forma de pago».
    for (const c of fuente.textos) {
      const n = norm(c.nombre); if (c.rol === 'folio' || n.length < 4) continue;
      const m = t1.match(new RegExp(`\\b(por|cada|x|segun) (el |la |los |las )?${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`));
      if (m) { dimension = c.nombre; consumido.push(m[0]); break; }
    }
    // Una palabra de papel dentro del nombre de un valor real («Bodega Norte», «Obras del Valle») es un filtro, no un «por».
    const dentroDeValor = (w) => fuente.textos.some((c) => c.valores.some((v) => { const n = norm(v).replace(/\(demo\)/g, '').trim(); return n.includes(' ') && n.includes(w.trim()) && t1.includes(n); }));
    if (!dimension) for (const [rol, re] of PAL_ROL) {
      const m = t1.match(re); if (!m || dentroDeValor(m[0])) continue;
      // «los 4 clientes», «por cliente», «clientes que más compran», «de cada proveedor»…
      pedidoRol = rol; consumido.push(m[0]);
      let col = fuente.textos.find((c) => c.rol === rol);
      if (!col) for (const s of SUSTITUTO[rol] || []) { col = fuente.textos.find((c) => c.rol === s); if (col) { notas.push(`Pediste ${NOMBRE_ROL[rol]}, pero «${fuente.nombre}» no tiene esa columna; se usó «${col.nombre}».`); break; } }
      if (col) { dimension = col.nombre; break; }
      notas.push(`Pediste ${NOMBRE_ROL[rol]}, pero «${fuente.nombre}» no tiene una columna así.`);
      break;
    }
  }

  // ── Cuántos (top N) ──
  let top = null, dir = 'desc';
  const reTop = /\b(?:los |las )?(?:primer[oa]s?|top|principales|mayores|mejores|mas grandes|mas importantes|que mas \w+|menores|peores|mas pequen[oa]s|mas chic[oa]s|que menos \w+|ultim[oa]s)\s+(\d+|\w+)\b|\b(\d+|\w+)\s+(?:primer[oa]s|principales|mayores|mejores|menores|peores)?\s*(?:clientes?|proveedor(?:es)?|productos?|vendedor(?:es)?|categorias?|conceptos?|centros?|ventas|compras|gastos|costos|movimientos|facturas|pagos|cobros|depositos|entradas|salidas|operaciones|articulos?|cuentas?|bodegas?|sucursal(?:es)?|contrapartes?)\b(?:\s+(?:mas grandes|mayores|principales|que mas \w+|menores|mas pequen[oa]s|que menos \w+))?/g;
  let mm;
  while ((mm = reTop.exec(t0))) {
    const n = numero((mm[1] || mm[2] || '').trim()); if (!n || n > 200) continue;
    if (/ultim/.test(mm[0]) && /\b(dias|semanas|meses|anos)\b/.test(t0.slice(mm.index, mm.index + mm[0].length + 12))) continue;
    // «los 4 clientes» sin palabra de orden también es top N (los más grandes, regla del intérprete).
    if (mm[2] && !/^\d+$/.test(mm[2]) && !NUM_PAL[mm[2]]) continue;
    top = n; consumido.push(mm[0]);
    if (/menores|peores|pequen|chic|que menos/.test(mm[0])) dir = 'asc';
    break;
  }
  if (!top && (mm = t0.match(/\b(\d+|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte) (mas grandes|mayores|principales|primer[oa]s|mas importantes|mejores|menores|mas pequen[oa]s|mas chic[oa]s|peores)\b/))) { top = numero(mm[1]); consumido.push(mm[0]); if (/menores|pequen|chic|peores/.test(mm[2])) dir = 'asc'; }
  if (!top && (mm = t0.match(/\btop (\d+)\b/))) { top = Number(mm[1]); consumido.push(mm[0]); }
  if (top == null && /\b(menores|peores|que menos|mas pequen|mas chic)\b/.test(t0)) dir = 'asc';
  toma(/\b(mas grandes|mayores|que mas \w+|principales|de mayor a menor|mas importantes)\b/);
  if (toma(/\b(de menor a mayor|ascendente)\b/)) dir = 'asc';

  // ── Listado de renglones ──
  const listado = !!toma(/\b(lista|listado|desglose|cada (venta|factura|compra|movimiento|gasto|costo)|todas las (ventas|facturas|compras)|todos los (movimientos|gastos|costos)|renglones|registros|operaciones|movimientos (mas grandes|mayores))\b/)
    || (!dimension && top != null && /\b(ventas|compras|gastos|costos|facturas|movimientos|operaciones|pagos|cobros|depositos|entradas|salidas)\b/.test(t0) && !pedidoRol);

  // ── Filtros por valores reales ──
  const excluir = new Set(['venta', 'ventas', 'costo', 'costos', 'gasto', 'gastos', 'total', 'mes', 'meses', 'demo', 'pago', 'pagos', 'cliente', 'clientes', 'proveedor', 'proveedores', 'producto', 'productos', 'compra', 'compras', 'categoria', 'categorias', 'banco', 'bancos', 'cuenta', 'cuentas']);
  let filtros = [];
  if (fuente) {
    const tf = consumido.reduce((s, c) => s.replace(c, ' '), t0);
    const r = leerValores(tf, fuente, excluir); filtros = r.filtros; consumido.push(...r.usados);
  }
  // Umbrales numéricos: «mayores a $50,000», «de más de 10 mil».
  let umbral = null;
  if ((mm = t0.match(/\b(mayor(?:es)? (?:a|de|que)|mas de|arriba de|superior(?:es)? a|por encima de|menor(?:es)? (?:a|de|que)|menos de|abajo de|debajo de|inferior(?:es)? a) \$? ?([\d.,]+)( ?mil| ?k| ?millones?)?\b/))) {
    let v = Number(mm[2].replace(/,/g, '')); if (/mil|k/.test(mm[3] || '')) v *= 1000; if (/millon/.test(mm[3] || '')) v *= 1e6;
    if (Number.isFinite(v)) { umbral = { op: /menor|menos|abajo|debajo|inferior/.test(mm[1]) ? '<' : '>', valor: v }; consumido.push(mm[0]); }
  }

  // ── Forma de la gráfica y extras ──
  let forma = null;
  if (toma(/\b(pastel|pay|pie|dona|circular|de queso)\b/)) forma = 'pastel';
  else if (toma(/\b(lineas?|linea de tiempo)\b/)) forma = 'lineas';
  else if (toma(/\b(barras?|columnas)\b/)) forma = 'barras';
  const participacion = !!toma(/\b(porcentajes?|participacion|proporcion|% del total|cuanto representa|distribucion|peso)\b/);
  const comparar = contra && !fuente2;
  toma(/\b(grafica|graficas|grafico|chart|con grafica|en grafica)\b/);

  // ── Medida (columna) ──
  let medida = null;
  if (fuente) {
    // Columna numérica nombrada: «el IVA», «el subtotal», «la cantidad», «las unidades».
    const nombrada = fuente.numericas.find((n) => { const k = norm(n); return k.length >= 3 && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`).test(t0) && !/^total$/.test(k) && !(op === 'conteo' && /cantidad/.test(k)); });
    if (/\b(unidades|piezas|volumen|cantidad vendida|cantidades)\b/.test(t0)) medida = fuente.numericas.find((n) => /cantidad|unidades|piezas/.test(norm(n))) || null;
    if (!medida && nombrada) { medida = nombrada; consumido.push(norm(nombrada)); }
    if (!medida && fuente.clase === 'bancos') medida = signo === 'entrada' ? 'Entrada' : signo === 'salida' ? 'Salida' : 'Monto';
    if (!medida) medida = fuente.medida;
    toma(/\b(unidades|piezas|volumen|cantidad vendida|cantidades)\b/);
  }
  if (op === 'conteo' && fuente) medida = null;

  // ── Palabras que nadie usó ──
  let restante = t0;
  for (const c of consumido.sort((a, b) => b.length - a.length)) restante = restante.replace(c, ' ');
  const claves = /\b(vent\w*|vend\w*|factur\w*|ingres\w*|cost\w*|gast\w*|compr\w*|egres\w*|cobr\w*|entrad\w*|deposit\w*|abon\w*|pagos?|salid\w*|retir\w*|cargos?|bancos?|bancari\w*|movimient\w*|utilidad|ganancia|margen|rentabilidad|contra|vs|versus|compar\w*|frente|cuant\w*|numero|cantidad|promedio|media|estado|cuenta)\b/g;
  restante = restante.replace(claves, ' ');
  const ignorado = restante.split(/\s+/).filter((w) => w.length >= 4 && !VACIAS.has(w) && !/^\d+$/.test(w) && !NUM_PAL[w]);

  // ── Cambio sobre un reporte anterior: lo no mencionado se conserva ──
  let plan = {
    fuente: fuente ? fuente.nombre : null, fuente2: fuente2 ? fuente2.nombre : null, signo,
    medida: { op, columna: medida },
    dimension, tiempo, top, dir, listado, participacion, forma,
    periodos, comparar: comparar && (periodos.length >= 2 || (dimension && periodos.length >= 1)),
    filtros: filtros.map((f) => ({ columna: f.columna, op: f.op, valor: f.valor })), umbral,
  };
  if (base) plan = fusionar(base, plan, t0);

  // ── Confianza ──
  const sabeQue = !!plan.fuente && (plan.medida.op === 'conteo' || !!plan.medida.columna);
  const pidioAlgo = plan.dimension || plan.tiempo || plan.periodos.length || plan.listado || plan.top || plan.filtros.length || plan.fuente2 || op !== 'suma' || quiere.ventas || quiere.costos || quiere.cobros || quiere.pagos || base;
  // Una palabra sin usar puede ser un filtro que no existe («material eléctrico»): eso ya no es «alta».
  const confianza = sabeQue && pidioAlgo && !ignorado.length ? 'alta' : sabeQue && pidioAlgo && ignorado.length <= 5 ? 'media' : 'baja';
  if (ignorado.length) notas.push(`No usé estas palabras: ${ignorado.slice(0, 8).join(', ')}.`);
  return { plan, confianza, ignorado, notas, catalogo: cats, entendido: describir(plan, cats, notas) };
}

/** Pedir un cambio: lo que la frase nueva dice reemplaza al plan anterior; lo que no dice se conserva. */
function fusionar(base, nuevo, t) {
  const p = JSON.parse(JSON.stringify(base));
  const toca = (k) => nuevo[k] != null && nuevo[k] !== false && !(Array.isArray(nuevo[k]) && !nuevo[k].length);
  if (nuevo.fuente && nuevo.fuente !== base.fuente && /\b(archivo|excel|bancos?|usa|cambia)\b/.test(t)) { p.fuente = nuevo.fuente; p.fuente2 = nuevo.fuente2; p.signo = nuevo.signo; p.medida = nuevo.medida; }
  else if (nuevo.medida && nuevo.medida.op !== 'suma') p.medida.op = nuevo.medida.op;
  for (const k of ['dimension', 'tiempo', 'top', 'forma', 'umbral']) if (toca(k)) p[k] = nuevo[k];
  if (nuevo.dir === 'asc') p.dir = 'asc';
  if (nuevo.participacion) p.participacion = true;
  if (nuevo.listado) p.listado = true;
  if (nuevo.periodos.length) { p.periodos = nuevo.periodos; p.comparar = nuevo.comparar; }
  if (nuevo.filtros.length) p.filtros = /\b(agrega|tambien|ademas)\b/.test(t) ? (base.filtros || []).concat(nuevo.filtros) : nuevo.filtros;
  if (/\b(sin filtros?|quita (el|los) filtros?|todos los)\b/.test(t)) p.filtros = [];
  if (/\b(quita|sin) (la )?grafica\b/.test(t)) p.sin_grafica = true;
  if (/\b(todo el periodo|todas las fechas|sin fechas?)\b/.test(t)) p.periodos = [];
  return p;
}

const fmtF = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
/** «Entendí:» en palabras, para que el cliente vea qué se va a calcular antes de que se calcule. */
function describir(p, cats, notas) {
  if (!p || !p.fuente) return { texto: 'No supe de qué datos quieres el reporte. Sube un archivo o marca «Incluir mis bancos», y di qué quieres ver (ventas, costos, cobros…).', partes: [], notas: notas || [] };
  const f = cats.find((c) => c.nombre === p.fuente) || {};
  const que = p.medida.op === 'conteo' ? 'número de renglones' : `${p.medida.op === 'promedio' ? 'promedio' : 'suma'} de «${p.medida.columna}»`;
  const partes = [`Datos: ${p.fuente === 'bancos' ? 'movimientos de tus bancos' + (p.signo === 'entrada' ? ' (solo entradas)' : p.signo === 'salida' ? ' (solo salidas)' : '') : '«' + p.fuente + '»'}${p.fuente2 ? ` contra ${p.fuente2 === 'bancos' ? 'tus bancos' : '«' + p.fuente2 + '»'}` : ''}`, `Qué se mide: ${que}`];
  if (p.dimension) partes.push(`Agrupado por: ${p.dimension}`);
  if (p.tiempo) partes.push(`Por periodo: ${p.tiempo === 'auto' ? 'automático según el rango' : p.tiempo}`);
  if (p.top) partes.push(`${p.dir === 'asc' ? 'Los' : 'Los'} ${p.top} ${p.dir === 'asc' ? 'más pequeños' : 'más grandes'}`);
  if (p.listado) partes.push('Lista de renglones');
  if (p.periodos.length) partes.push(`Periodo: ${p.periodos.map((x) => x.etiqueta).join(p.comparar ? ' contra ' : ', ')}`);
  else if (f.desde) partes.push(`Periodo: todo lo que trae (${fmtF(f.desde)} a ${fmtF(f.hasta)})`);
  for (const x of p.filtros || []) partes.push(`${x.columna}${x.op === 'no_en' ? ' excepto' : ':'} ${x.valor.slice(0, 4).join(', ')}${x.valor.length > 4 ? ` y ${x.valor.length - 4} más` : ''}`);
  if (p.umbral) partes.push(`Solo renglones ${p.umbral.op === '>' ? 'mayores' : 'menores'} a ${p.umbral.valor.toLocaleString('en-US')}`);
  if (p.participacion) partes.push('Con porcentaje del total');
  if (p.forma) partes.push(`Gráfica: ${p.forma}`);
  return { texto: partes.join(' · '), partes, notas: notas || [] };
}

/** Valida un plan que viene de la IA contra el catálogo: toda fuente y columna debe existir. */
function validarPlan(p, fuentes) {
  const cats = catalogo(fuentes), errs = [];
  if (!p || typeof p !== 'object') return { errs: ['No hay plan.'] };
  const f = cats.find((c) => norm(c.nombre) === norm(p.fuente)); if (!f) errs.push(`La fuente «${p.fuente}» no existe.`);
  const f2 = p.fuente2 ? cats.find((c) => norm(c.nombre) === norm(p.fuente2)) : null; if (p.fuente2 && !f2) errs.push(`La fuente «${p.fuente2}» no existe.`);
  const cols = f ? f.textos.map((c) => c.nombre).concat(f.numericas, [f.fecha]) : [];
  const existe = (n) => cols.some((c) => c && norm(c) === norm(n));
  const med = p.medida || {};
  if (!['suma', 'promedio', 'conteo', 'maximo', 'minimo'].includes(med.op)) errs.push('Operación no válida.');
  if (med.op !== 'conteo' && f && !f.numericas.some((n) => norm(n) === norm(med.columna))) errs.push(`«${med.columna}» no es una columna numérica.`);
  if (p.dimension && !existe(p.dimension)) errs.push(`La columna «${p.dimension}» no existe.`);
  for (const x of p.filtros || []) if (!existe(x.columna)) errs.push(`La columna «${x.columna}» no existe.`);
  for (const x of p.periodos || []) if (!/^\d{4}-\d{2}-\d{2}$/.test(x.desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(x.hasta || '')) errs.push('Periodo con fechas inválidas.');
  if (p.tiempo && !['dia', 'semana', 'mes', 'trimestre', 'año', 'auto'].includes(p.tiempo)) errs.push('Periodo de agrupación no válido.');
  const plan = {
    fuente: f ? f.nombre : null, fuente2: f2 ? f2.nombre : null, signo: ['entrada', 'salida'].includes(p.signo) ? p.signo : null,
    medida: { op: med.op, columna: med.op === 'conteo' ? null : (f && f.numericas.find((n) => norm(n) === norm(med.columna))) || null },
    dimension: p.dimension ? cols.find((c) => c && norm(c) === norm(p.dimension)) : null, tiempo: p.tiempo || null,
    top: Number.isInteger(p.top) && p.top > 0 && p.top <= 200 ? p.top : null, dir: p.dir === 'asc' ? 'asc' : 'desc',
    listado: !!p.listado, participacion: !!p.participacion, forma: ['barras', 'lineas', 'pastel'].includes(p.forma) ? p.forma : null,
    periodos: (p.periodos || []).slice(0, 4).map((x) => ({ desde: x.desde, hasta: x.hasta, etiqueta: String(x.etiqueta || `${x.desde} a ${x.hasta}`).slice(0, 60), relativo: false })),
    comparar: !!p.comparar,
    filtros: (p.filtros || []).slice(0, 6).map((x) => ({ columna: cols.find((c) => c && norm(c) === norm(x.columna)), op: x.op === 'no_en' ? 'no_en' : 'en', valor: (Array.isArray(x.valor) ? x.valor : [x.valor]).map(String).slice(0, 30) })),
    umbral: p.umbral && Number.isFinite(Number(p.umbral.valor)) ? { op: p.umbral.op === '<' ? '<' : '>', valor: Number(p.umbral.valor) } : null,
  };
  return { errs, plan, entendido: describir(plan, cats, []) };
}

module.exports = { interpretar, catalogo, describir, validarPlan, rolDe, claseFuente, medidaPrincipal, fechaPrincipal, leerPeriodos, norm, etiquetaMes, finMes, sumDias, MESES };
