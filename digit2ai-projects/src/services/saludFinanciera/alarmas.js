'use strict';
/**
 * STALL warning for the instrument panel (owner request 2026-10-28): anything abnormal in the bank,
 * or anything that puts the plan at risk, raised loudly on the panel. Pure functions, integer cents,
 * fixed rules, no model. Each alarm carries a stable `clave` so "Entendido" can silence it.
 *
 *   nivel 'stall'   = red, flashing on the panel (money at risk or something the bank did that he must look at)
 *   nivel 'caution' = amber, listed but not flashing
 *
 * Also: distintos() turns Plaid's recurring streams (which repeat per account and per old bank login)
 * into ONE row per merchant, with a search key the movements table can filter by.
 */
const { claveComercio } = require('./plaidCategorias');

function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const iso = (v) => (v instanceof Date ? v.toISOString() : String(v || '')).slice(0, 10);
const usd = (c) => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fd = (d) => { const x = iso(d); return Number(x.slice(8, 10)) + ' ' + MES[Number(x.slice(5, 7)) - 1]; };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// moves between his own accounts, the Corte and the paycheck are not "charges"
const PROPIA = /online banking transfer|zelle payment (to|from) manuel stagg|zelle payment from digit2ai|transfer to (chk|sav)|from chk|to chk/i;
const ESPERADO = /\btfs\b|payroll/i;
const COMISION = /\b(fee|overdraft|nsf|insufficient funds|returned item|late charge|late fee|service charge)\b/i;
const GENERICO = new Set(['purchase', 'checkcard', 'pmnt', 'sent', 'mobile', 'recurring', 'the', 'payment', 'des', 'inc', 'llc', 'agency', 'online', 'pos', 'debit', 'card', 'ach', 'web', 'id', 'conf', 'transfer']);

/** Readable name for a bank description: the merchant when Plaid gives one, else the description without codes. */
function nombreLimpio(descripcion, comercio) {
  if (comercio) return String(comercio).trim();
  const d = String(descripcion || '');
  const z = d.match(/zelle (?:payment to|transfer)\b[^;]*?;?\s*([a-z]+ [a-z]+)\s*$/i) || d.match(/zelle payment to ([a-z]+ [a-z]+)/i);
  if (z) return 'Zelle a ' + z[1].replace(/\b\w/g, (m) => m.toUpperCase()).replace(/\B\w+/g, (m) => m.toLowerCase());
  if (/\btfs\b/i.test(d)) return 'TFS (Corte)';
  if (/maintenance fee/i.test(d)) return 'Comisión de mantenimiento';
  const limpio = d.replace(/\b(DES|ID|INDN|CO ID|CONF#?)\b:?.*$/i, '').replace(/X{3,}\S*/g, '').replace(/\b(PURCHASE|CHECKCARD|PMNT SENT|MOBILE PURCHASE|RECURRING)\b/gi, '')
    .replace(/[#*]\S*/g, '').replace(/\b\d[\d/]*\b/g, '').replace(/\s+/g, ' ').trim();
  return (limpio || d).slice(0, 40);
}

/** Word(s) the movements table searches for: the first non-generic token, two words for a person. */
function claveBusqueda(nombre) {
  const n = fold(nombre).replace(/^zelle a /, '').replace(/\(.*?\)/g, '');
  if (/^comision de mantenimiento/.test(n)) return 'maintenance fee';
  const toks = n.replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((t) => t.length >= 2 && !GENERICO.has(t));
  if (/^zelle a /.test(fold(nombre))) return toks[0] || '';   // the first name also matches the plan row ("Pago Lina")
  return toks[0] || n.trim();
}

const FREQ = { WEEKLY: 'semanal', BIWEEKLY: 'quincenal', SEMI_MONTHLY: '2 al mes', MONTHLY: 'mensual', ANNUALLY: 'anual' };
const POR_MES = { WEEKLY: 52 / 12, BIWEEKLY: 26 / 12, SEMI_MONTHLY: 2, MONTHLY: 1, ANNUALLY: 1 / 12 };

/**
 * One row per merchant. Only active outflows; the same amount seen twice for the same merchant is the
 * same charge reported by two accounts/logins, so it counts once.
 */
function distintos(recurrentes) {
  const grupos = new Map();
  for (const r of recurrentes || []) {
    if (r.direccion !== 'salida' || !r.activo) continue;
    const nombre = nombreLimpio(r.descripcion, r.comercio);
    const clave = claveBusqueda(nombre);
    if (!clave) continue;
    if (!grupos.has(clave)) grupos.set(clave, { nombre, clave, cargos: new Map(), proxima: null, categoria: r.categoria || null });
    const g = grupos.get(clave);
    if (nombre.length < g.nombre.length) g.nombre = nombre;               // "Amazon" over "Amazon Prime"
    const cents = Math.round(Number(r.monto_ultimo || r.monto_promedio || 0) * 100);
    if (cents > 0 && !g.cargos.has(cents)) g.cargos.set(cents, r.frecuencia || null);
    if (r.proxima_fecha && (!g.proxima || r.proxima_fecha < g.proxima)) g.proxima = iso(r.proxima_fecha);
    if (r.categoria === 'corte') g.categoria = 'corte';
  }
  return [...grupos.values()].map((g) => {
    const cargos = [...g.cargos.entries()].sort((a, b) => b[0] - a[0]);
    const mensual = cargos.reduce((x, [c, f]) => x + Math.round(c * (POR_MES[f] != null ? POR_MES[f] : 1)), 0);
    let frecs = [...new Set(cargos.map(([, f]) => FREQ[f] || 'variable'))];
    if (frecs.length > 1) frecs = frecs.filter((f) => f !== 'variable');
    return { nombre: g.nombre, clave: g.clave, claves: g.categoria === 'corte' ? [g.clave, 'corte'] : [g.clave], montos: cargos.map(([c]) => usd(c)), n_cargos: cargos.length, mensual_cents: mensual, mensual: usd(mensual),
      frecuencia: frecs.join(', '), proxima_fecha: g.proxima, categoria: g.categoria };
  }).sort((a, b) => b.mensual_cents - a.mensual_cents);
}

/**
 * revisar({ hoy, txns, alertas, items, cuentas, recurrentes (distintos()), dias_negativos, obligaciones_descubiertas, vistas })
 *   txns: sf_plaid_txn rows of INCLUDED accounts, last ~400 days ({ id, fecha, nombre, comercio, monto_cents, pending, enlace })
 *         monto_cents follows Plaid: positive = money out.
 */
function revisar(o) {
  const hoy = o.hoy, out = [];
  const push = (a) => { if (!(o.vistas || []).includes(a.clave)) out.push(a); };
  const txns = (o.txns || []).map((t) => ({ ...t, fecha: iso(t.fecha), cents: Number(t.monto_cents), nom: nombreLimpio(t.nombre, t.comercio) })).map((t) => ({ ...t, k: claveBusqueda(t.nom) || claveComercio(t.comercio || t.nombre) }));
  const conocidos = new Set((o.recurrentes || []).map((r) => r.clave));
  const salidas = txns.filter((t) => t.cents > 0 && !PROPIA.test(t.nombre || '') && !ESPERADO.test(t.nombre || ''));
  const recientes = salidas.filter((t) => t.fecha >= addDays(hoy, -14) && t.fecha <= hoy);

  // 1) money already at risk in the projection
  (o.dias_negativos || []).slice(0, 1).forEach((d) => push({ nivel: 'stall', clave: 'neg:' + d.fecha, titulo: 'Saldo en negativo', detalle: 'El ' + fd(d.fecha) + ' quedas en ' + d.saldo + '.' }));
  (o.obligaciones_descubiertas || []).forEach((p) => push({ nivel: 'stall', clave: 'desc:' + p.fecha + ':' + p.concepto, titulo: 'Pago sin cubrir', detalle: p.concepto + ' del ' + fd(p.fecha) + ' (' + p.monto + ') te deja en ' + p.saldo + '.' }));

  // 2) the bank stopped talking: nothing below can be trusted
  (o.items || []).forEach((it) => { if (it.estado && it.estado !== 'activo') push({ nivel: 'stall', clave: 'item:' + it.id + ':' + it.estado, titulo: 'El banco no sincroniza', detalle: (it.institution_name || 'Banco') + ' necesita reconectarse; no llegan movimientos nuevos.' }); });
  (o.cuentas || []).forEach((c) => {
    const s = c.saldo_disponible != null ? Number(c.saldo_disponible) : c.saldo_actual != null ? Number(c.saldo_actual) : null;
    if (c.incluir && s != null && s < 0) push({ nivel: 'stall', clave: 'sobregiro:' + c.mask + ':' + hoy, titulo: 'Cuenta en sobregiro', detalle: '••' + c.mask + ' tiene ' + usd(Math.round(s * 100)) + ' disponibles.' });
  });

  // 3) the same charge twice (same merchant, same amount, within 2 days)
  const vistosDup = new Set();
  for (let i = 0; i < recientes.length; i++) for (let j = i + 1; j < recientes.length; j++) {
    const a = recientes[i], b = recientes[j];
    if (a.k !== b.k || a.cents !== b.cents || a.cents < 500) continue;
    const dias = Math.abs(Date.parse(a.fecha) - Date.parse(b.fecha)) / 864e5;
    if (dias > 2) continue;
    const clave = 'dup:' + [a.id, b.id].sort().join('-');
    if (vistosDup.has(a.k + a.cents)) continue; vistosDup.add(a.k + a.cents);
    push({ nivel: a.cents >= 10000 ? 'stall' : 'caution', clave, titulo: 'Posible cargo doble', detalle: a.nom + ' ' + usd(a.cents) + ' dos veces (' + fd(a.fecha) + (a.fecha !== b.fecha ? ' y ' + fd(b.fecha) : '') + ').', buscar: a.k });
  }

  // 4) a charge out of the ordinary: far above what that merchant usually charges, or a big one from a merchant never seen
  for (const t of recientes) {
    if (t.enlace === 'plan') continue;                                    // it paid a row of the plan: expected
    const antes = salidas.filter((x) => x.k === t.k && x.fecha < addDays(t.fecha, -2) && x.fecha >= addDays(t.fecha, -365));
    if (!antes.length) {
      if (t.cents >= 15000 && !conocidos.has(t.k)) push({ nivel: t.cents >= 50000 ? 'stall' : 'caution', clave: 'nuevo:' + t.id, titulo: 'Cargo nuevo grande', detalle: t.nom + ' ' + usd(t.cents) + ' el ' + fd(t.fecha) + ': nunca te había cobrado.', buscar: t.k });
    } else {
      const max = Math.max(...antes.map((x) => x.cents));
      if (t.cents >= 5000 && t.cents > 2 * max) push({ nivel: t.cents - max >= 20000 ? 'stall' : 'caution', clave: 'alto:' + t.id, titulo: 'Cargo más alto de lo normal', detalle: t.nom + ' ' + usd(t.cents) + ' el ' + fd(t.fecha) + ' (lo más alto antes: ' + usd(max) + ').', buscar: t.k });
    }
  }

  // 5) bank fees in the last 30 days
  txns.filter((t) => t.cents > 0 && t.fecha >= addDays(hoy, -30) && COMISION.test(t.nombre || '')).forEach((t) =>
    push({ nivel: /overdraft|nsf|insufficient|returned/i.test(t.nombre) ? 'stall' : 'caution', clave: 'fee:' + t.id, titulo: 'Comisión del banco', detalle: t.nom + ' ' + usd(t.cents) + ' el ' + fd(t.fecha) + '.', buscar: claveBusqueda(t.nom) }));

  // 6) what the subscription watcher found and he has not acknowledged
  (o.alertas || []).filter((a) => !a.leida && (a.tipo === 'nueva_suscripcion' || a.tipo === 'cambio_monto')).forEach((a) =>
    push({ nivel: 'caution', clave: 'alerta:' + a.id, alerta_id: a.id, titulo: a.tipo === 'cambio_monto' ? 'Suscripción cambió de precio' : 'Suscripción nueva', detalle: a.texto }));

  const orden = { stall: 0, caution: 1 };
  out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  return out;
}

module.exports = { revisar, distintos, nombreLimpio, claveBusqueda, PROPIA };
