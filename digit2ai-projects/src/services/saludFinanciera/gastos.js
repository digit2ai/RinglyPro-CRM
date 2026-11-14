'use strict';
/**
 * SPENDING QUESTIONS (owner 2026-11-14): "¿cuánto he gastado en Amazon este mes?",
 * "total de Latitude esta semana", "gasto en Gas Station del mes".
 *
 * Pure and deterministic: no model, no database. It reads the question into
 * { tipo, termino | categoria, periodo } and, given the bank rows the route fetched,
 * adds them up. Every figure in the answer is a sum of bank transactions (Plaid),
 * never an estimate. A misspelled merchant ("latitide") is matched to the closest
 * merchant the owner actually paid, and the answer says which one it used.
 */
const { fmt } = require('./money');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// moves between the owner's own BOA accounts are not spending (same rule as real.js)
const PROPIA = /online banking transfer/i;

// Plaid personal-finance categories. Order matters: groceries before food, gas before transport.
const CATEGORIAS = [
  { clave: 'gasolina', etiqueta: 'gasolineras', palabras: ['gas station', 'gas stations', 'gasolinera', 'gasolineras', 'gasolina', 'combustible', 'fuel', 'gas'], detallada: 'TRANSPORTATION_GAS' },
  { clave: 'supermercado', etiqueta: 'supermercado', palabras: ['supermercado', 'supermercados', 'mercado', 'groceries', 'grocery', 'viveres'], detallada: 'FOOD_AND_DRINK_GROCERIES' },
  { clave: 'comida', etiqueta: 'comida y restaurantes', palabras: ['restaurantes', 'restaurante', 'restaurants', 'restaurant', 'comida', 'comidas', 'comer', 'food'], primaria: 'FOOD_AND_DRINK' },
  { clave: 'entretenimiento', etiqueta: 'entretenimiento', palabras: ['entretenimiento', 'streaming', 'peliculas', 'entertainment'], primaria: 'ENTERTAINMENT' },
  { clave: 'servicios', etiqueta: 'servicios (luz, teléfono, internet)', palabras: ['servicios', 'utilities', 'electricidad', 'luz', 'telefono', 'internet'], primaria: 'RENT_AND_UTILITIES' },
  { clave: 'transporte', etiqueta: 'transporte', palabras: ['transporte', 'transportation', 'peajes', 'peaje'], primaria: 'TRANSPORTATION' },
  { clave: 'compras', etiqueta: 'compras en tiendas', palabras: ['compras', 'tiendas', 'shopping'], primaria: 'GENERAL_MERCHANDISE' },
  { clave: 'salud', etiqueta: 'salud', palabras: ['salud', 'medico', 'medicos', 'farmacia', 'medicinas'], primaria: 'MEDICAL' }
];

const RELLENO = new Set(('cuanto cuanta cuantos cuantas he has ha hemos gastado gastada gaste gasto gastos gastamos gastaste gastar gastando ' +
  'dame da me dime decir di muestrame mostrar ver quiero saber necesito sabes puedes podrias por favor el la los las lo un una unos unas ' +
  'de del en a al con para por que cual cuales total totales suma sumame monto montos sobre mi mis tu tus este esta estos estas ese esa ' +
  'semana semanas mes meses ano anos hoy ayer pagado pague pagos pago pagamos cargos cargo transacciones movimientos veces comercio tienda lugar ' +
  'y o se si hay tengo tuve llevo van va dinero plata dolares usd hasta ahora fue fueron es son hice cobraron cobro ' +
  'how much did i spend spent spending at on in this the week month total give what was is me my of ' +
  'ultimo ultimos ultima ultimas dias dia pasado pasada anterior actual corriente desde inicio entro entraron ingresos ingreso recibi deposito depositos').split(' '));

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function iso(dt) { return dt.toISOString().slice(0, 10); }
function parseIso(s) { return new Date(s + 'T12:00:00Z'); }
function addDays(s, n) { const d = parseIso(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function fechaCorta(s) { const p = s.split('-'); return Number(p[2]) + ' ' + MESES[Number(p[1]) - 1].slice(0, 3); }
function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** The period the question names; "este mes" when it names none. Weeks run Monday to Sunday. */
function periodo(t, hoy) {
  const [y, m] = hoy.split('-').map(Number);
  const dow = (parseIso(hoy).getUTCDay() + 6) % 7; // 0 = Monday
  const lunes = addDays(hoy, -dow);
  let x;
  if ((x = t.match(/\bultimos? (\d{1,3}) dias?\b|\blast (\d{1,3}) days\b/))) {
    const n = Math.min(Number(x[1] || x[2]), 366);
    return { desde: addDays(hoy, -(n - 1)), hasta: hoy, etiqueta: 'los últimos ' + n + ' días', frase: x[0] };
  }
  if ((x = t.match(/\bantier\b|\bantes de ayer\b/))) { const a = addDays(hoy, -2); return { desde: a, hasta: a, etiqueta: 'antier', frase: x[0] }; }
  if ((x = t.match(/\bayer\b|\byesterday\b/))) { const a = addDays(hoy, -1); return { desde: a, hasta: a, etiqueta: 'ayer', frase: x[0] }; }
  if ((x = t.match(/\bhoy\b|\btoday\b/))) return { desde: hoy, hasta: hoy, etiqueta: 'hoy', frase: x[0] };
  if ((x = t.match(/\b(la )?semana (pasada|anterior)\b|\bultima semana\b|\blast week\b/))) {
    const l = addDays(lunes, -7); return { desde: l, hasta: addDays(l, 6), etiqueta: 'la semana pasada', frase: x[0] };
  }
  if ((x = t.match(/\b(esta|la|en la|de la|this) semana\b|\bthis week\b|\bsemanal\b/))) return { desde: lunes, hasta: hoy, etiqueta: 'esta semana', frase: x[0] };
  if ((x = t.match(/\b(el )?mes (pasado|anterior)\b|\blast month\b/))) {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1, mm = String(pm).padStart(2, '0');
    return { desde: py + '-' + mm + '-01', hasta: py + '-' + mm + '-' + lastDay(py, pm), etiqueta: 'el mes pasado (' + MESES[pm - 1] + ')', frase: x[0] };
  }
  if ((x = t.match(/\b(este|el|del|this) ano\b|\bthis year\b|\ben lo que va del ano\b/))) return { desde: y + '-01-01', hasta: hoy, etiqueta: 'este año', frase: x[0] };
  const nombres = MESES.concat(MES_EN);
  const rx = new RegExp('\\b(' + nombres.join('|') + ')( (de |del )?(20\\d\\d))?\\b');
  if ((x = t.match(rx))) {
    const idx = nombres.indexOf(x[1]) % 12 + 1;
    let yy = x[4] ? Number(x[4]) : (idx > m ? y - 1 : y);
    const mm = String(idx).padStart(2, '0');
    const fin = (yy === y && idx === m) ? hoy : yy + '-' + mm + '-' + lastDay(yy, idx);
    return { desde: yy + '-' + mm + '-01', hasta: fin, etiqueta: MESES[idx - 1] + (x[4] ? ' de ' + yy : ''), frase: x[0] };
  }
  x = t.match(/\b(este|el|del|en el|this) mes\b|\bthis month\b|\bmensual\b/);
  return { desde: y + '-' + String(m).padStart(2, '0') + '-01', hasta: hoy, etiqueta: 'este mes', frase: x ? x[0] : '', supuesto: !x };
}

/** Is this a spending (or income) question at all? */
function esPregunta(t) {
  return /\b(gast|cuanto|cuanta|total|suma|pague|pagado|pagamos|spend|spent|how much|compr|ingres|me entr|recibi|deposit|cobr)/.test(t);
}

/**
 * Read a question. `previo` (optional) is the last query, so "¿y la semana pasada?" reuses its subject.
 * Returns null when it is not a spending question.
 */
function interpretar(texto, hoy, previo) {
  const t = norm(texto);
  if (!t) return null;
  const per = periodo(t, hoy);
  const tipo = /\b(ingres|me entr|recibi|deposit|me pagaron|income)/.test(t) ? 'ingreso' : 'gasto';
  let resto = ' ' + t + ' ';
  if (per.frase) resto = resto.replace(' ' + per.frase + ' ', ' ');
  let categoria = null;
  for (const c of CATEGORIAS) {
    const p = c.palabras.find(w => resto.includes(' ' + w + ' '));
    if (p) { categoria = c.clave; resto = resto.replace(' ' + p + ' ', ' '); break; }
  }
  const termino = resto.split(' ').filter(w => w && w.length > 1 && !relleno(w) && !/^\d+$/.test(w)).join(' ').slice(0, 40);
  const pregunta = esPregunta(t) || !!categoria || (!!termino && !per.supuesto);
  const continuacion = /^(y|and)\b/.test(t) || (!termino && !categoria && !pregunta && !per.supuesto);
  if (!pregunta && !continuacion) return null;
  // "este mes o semana": answer both periods
  const ambos = /\bmes\b.*\b(o|y|or|and)\b.*\bsemana\b|\bsemana\b.*\b(o|y|or|and)\b.*\bmes\b/.test(t);
  const periodos = ambos ? [periodo('este mes', hoy), periodo('esta semana', hoy)] : [per];
  if (!termino && !categoria && previo && continuacion && (previo.termino || previo.categoria)) {
    return { tipo: previo.tipo === 'ingreso' ? 'ingreso' : tipo, termino: String(previo.termino || '').slice(0, 40), categoria: CATEGORIAS.some(c => c.clave === previo.categoria) ? previo.categoria : null, periodo: periodos[0], periodos };
  }
  return { tipo, termino: categoria ? '' : termino, categoria, periodo: periodos[0], periodos };
}

// filler words, and their typos ("hastado" for "gastado")
function relleno(w) {
  if (RELLENO.has(w)) return true;
  if (w.length < 5) return false;
  for (const r of RELLENO) if (r.length >= 5 && Math.abs(r.length - w.length) <= 1 && lev(w, r) <= 1) return true;
  return false;
}

function lev(a, b) {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/**
 * Which word to search for. `textos` = merchant names and bank descriptions the owner actually has.
 * Exact substring first; otherwise the closest word within 1 edit (short) or 2 edits (6+ letters).
 * Returns { buscar, corregido } or null when nothing is close.
 */
function resolverTermino(termino, textos) {
  const t = norm(termino);
  if (!t) return null;
  const docs = textos.map(norm);
  if (docs.some(d => d.includes(t))) return { buscar: t, corregido: false };
  const exacta = t.split(' ').filter(w => w.length >= 3 && docs.some(d => d.includes(w))).sort((a, b) => b.length - a.length)[0];
  if (exacta) return { buscar: exacta, corregido: false };
  const palabras = new Set();
  docs.forEach(d => d.split(' ').forEach(w => { if (w.length >= 3 && !/\d/.test(w)) palabras.add(w); }));
  const partes = t.split(' ').filter(w => w.length >= 3);
  let mejor = null;
  for (const p of partes) {
    // the bank often cuts a name ("LATITUDE VENTU"), so compare against a word's start too
    for (const w of palabras) {
      const dist = Math.min(lev(p, w), w.length > p.length ? lev(p, w.slice(0, p.length)) : 99);
      const tope = p.length >= 6 ? 2 : 1;
      if (dist <= tope && (!mejor || dist < mejor.dist || (dist === mejor.dist && w.length > mejor.w.length))) mejor = { w, dist };
    }
  }
  if (!mejor) return null;
  return { buscar: mejor.w, corregido: true };
}

/** Rows that answer the question. `txns`: [{ fecha, nombre, comercio, monto_cents, pending, pfc_primary, pfc_detailed }]. */
function filtrar(q, txns, buscar) {
  const cat = q.categoria ? CATEGORIAS.find(c => c.clave === q.categoria) : null;
  return txns.filter(x => {
    const f = String(x.fecha).slice(0, 10);
    if (f < q.periodo.desde || f > q.periodo.hasta) return false;
    const m = Number(x.monto_cents);
    if (q.tipo === 'gasto' ? m <= 0 : m >= 0) return false;
    const texto = (x.comercio || '') + ' ' + (x.nombre || '');
    if (PROPIA.test(texto)) return false;
    if (cat) return cat.detallada ? x.pfc_detailed === cat.detallada : x.pfc_primary === cat.primaria;
    if (buscar) return norm(texto).includes(buscar);
    return true;
  });
}

function rangoTexto(p) {
  return p.desde === p.hasta ? fechaCorta(p.desde) : 'del ' + fechaCorta(p.desde) + ' al ' + fechaCorta(p.hasta);
}
function nombreCorto(x) {
  return String(x.comercio || x.nombre || '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** The answer, in plain Spanish. Every amount is a sum of the rows listed. */
function responder(q, filas, extra) {
  extra = extra || {};
  const p = q.periodo;
  const cat = q.categoria ? CATEGORIAS.find(c => c.clave === q.categoria) : null;
  const sujeto = cat ? 'en ' + cat.etiqueta : (extra.buscar ? 'en ' + extra.nombre : (q.tipo === 'ingreso' ? '' : 'en total'));
  const verbo = q.tipo === 'ingreso' ? 'Te entraron' : 'Gastaste';
  const total = filas.reduce((s, x) => s + Math.abs(Number(x.monto_cents)), 0);
  const lineas = [];
  if (extra.corregido) lineas.push('Busqué "' + extra.nombre + '".');
  if (!filas.length) {
    lineas.push((q.tipo === 'ingreso' ? 'No veo ingresos ' : 'No veo gastos ') + (sujeto && sujeto !== 'en total' ? sujeto + ' ' : '') + p.etiqueta + ' (' + rangoTexto(p) + ').');
  } else {
    lineas.push(verbo + ' ' + fmt(total) + (sujeto ? ' ' + sujeto : '') + ' ' + p.etiqueta + ' (' + rangoTexto(p) + '), en ' + filas.length + (filas.length === 1 ? ' movimiento.' : ' movimientos.'));
    const pend = filas.filter(x => x.pending);
    if (pend.length) lineas.push(pend.length + (pend.length === 1 ? ' está pendiente' : ' están pendientes') + ' en el banco.');
    if (!cat && !extra.buscar && filas.length > 1) {
      const por = {};
      filas.forEach(x => { const k = nombreCorto(x); por[k] = (por[k] || 0) + Math.abs(Number(x.monto_cents)); });
      const top = Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 5);
      lineas.push('Lo más grande: ' + top.map(([k, v]) => k + ' ' + fmt(v)).join(', ') + '.');
    }
  }
  if (p.supuesto) lineas.push('Tomé este mes porque no dijiste el periodo.');
  if (cat) lineas.push('Según la categoría que pone el banco.');
  const detalle = filas.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .map(x => ({ fecha: String(x.fecha).slice(0, 10), concepto: nombreCorto(x), monto: fmt(Math.abs(Number(x.monto_cents))), pendiente: !!x.pending }));
  return { texto: lineas.join(' '), total: fmt(total), total_cents: total, n: filas.length, detalle, desde: p.desde, hasta: p.hasta };
}

/** Same merchants as `filas`, same period, but filed by the bank under another category. */
function otrasDelMismoComercio(q, txns, filas) {
  const clave = x => norm(x.comercio || x.nombre).split(' ')[0] || '';
  const claves = new Set(txns.filter(x => {
    const cat = CATEGORIAS.find(c => c.clave === q.categoria);
    return cat && (cat.detallada ? x.pfc_detailed === cat.detallada : x.pfc_primary === cat.primaria);
  }).map(clave).filter(k => k.length >= 3));
  const ya = new Set(filas);
  const resto = filtrar({ ...q, categoria: null }, txns, '').filter(x => !ya.has(x) && claves.has(clave(x)));
  if (!resto.length) return { texto: '', total_cents: 0 };
  const por = {};
  resto.forEach(x => { const k = nombreCorto(x).split(' ')[0]; por[k] = (por[k] || 0) + Math.abs(Number(x.monto_cents)); });
  const total = resto.reduce((s, x) => s + Math.abs(Number(x.monto_cents)), 0);
  return { total_cents: total, texto: 'Aparte, en esas mismas estaciones hay ' + fmt(total) + ' que el banco marca como tienda (' +
    Object.entries(por).map(([k, v]) => k + ' ' + fmt(v)).join(', ') + '); con eso serían ' + fmt(total + filas.reduce((s, x) => s + Math.abs(Number(x.monto_cents)), 0)) + '.' };
}

module.exports = { otrasDelMismoComercio, interpretar, resolverTermino, filtrar, responder, periodo, norm, lev, CATEGORIAS, PROPIA };
