'use strict';
/**
 * Bills the bank pays by itself (owner request 2026-10-29: AT&T, Render, Anthropic, Spectrum).
 *
 * They are sf_recurrentes rows with solo_aviso = TRUE: they are NEVER projected into the plan
 * (the Bank of America debit is the only record of the payment, so a plan row would count it
 * twice). What they do is remind: next charge date, the amount, and whether the account that
 * pays them holds enough to cover every charge between today and that date.
 *
 * Pure, fixed rules, no model. Amount = the last real bank charge of that merchant when there is
 * one, else the owner's estimate (and it says "estimado").
 */
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function diasEntre(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function ultimoDia(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** The words a bank description must contain: "Claude (Anthropic)" -> claude, anthropic; "AT&T" -> att. */
function claves(concepto) {
  const f = fold(concepto);
  const out = new Set();
  const sin = f.replace(/&/g, '');
  if (/^[a-z0-9 ]{2,6}$/.test(sin.trim())) out.add(sin.trim().replace(/\s+/g, ''));   // short brand: AT&T -> att
  for (const w of f.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)) if (w.length >= 4) out.add(w);
  return [...out];
}
function coincide(texto, ks) {
  const t = fold(texto).replace(/&/g, '');
  return ks.some((k) => new RegExp('(^|[^a-z0-9])' + k + '([^a-z0-9]|$)').test(t) || (k.length >= 5 && t.includes(k)));
}

function fechaDelMes(rec, y, m) {
  const ult = ultimoDia(y, m);
  const d = rec.fin_de_mes ? ult : Math.min(Number(rec.dia) || 1, ult);
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/**
 * @param hoy        'YYYY-MM-DD'
 * @param recs       sf_recurrentes rows (only active solo_aviso ones are used)
 * @param cargos     bank outflows: [{ fecha, texto, monto_cents }]  (monto_cents > 0 = money out)
 * @param cuenta     the paying account: { mask, disponible_cents } or null
 */
function sumarMes(iso, dia) {
  let [y, m] = iso.split('-').map(Number);
  m += 1; if (m > 12) { m = 1; y += 1; }
  const d = Math.min(dia, ultimoDia(y, m));
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/**
 * @param hoy        'YYYY-MM-DD'
 * @param recs       sf_recurrentes rows (only active solo_aviso ones are used)
 * @param cargos     bank outflows: [{ fecha, texto, monto_cents }]  (monto_cents > 0 = money out), ~180 days
 * @param cuenta     the paying account: { mask, disponible_cents } or null
 *
 * The bank's own history wins over the owner's estimate: the bill's charges are that merchant's debits
 * within 40% of their median (a $20 API top-up is not the $100 subscription); when the latest one is
 * at most 45 days old, the next charge is the same day one month later, for the same amount.
 * Otherwise the owner's day and amount are used and marked "estimado".
 */
function calcular({ hoy, recs, cargos, cuenta }) {
  const items = [];
  for (const rec of recs || []) {
    if (rec.activo === false || !rec.solo_aviso || rec.tipo === 'ingreso') continue;
    const ks = claves(rec.concepto);
    const suyos = (cargos || []).filter((c) => c.monto_cents > 0 && c.fecha <= hoy && c.fecha >= addDays(hoy, -180) && coincide(c.texto, ks));
    const montos = suyos.map((c) => c.monto_cents).sort((a, b) => a - b);
    const med = montos.length ? montos[Math.floor((montos.length - 1) / 2)] : 0;
    const factura = suyos.filter((c) => Math.abs(c.monto_cents - med) <= med * 0.4).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const ultimo = factura[0] && diasEntre(factura[0].fecha, hoy) <= 45 ? factura[0] : null;
    let fecha;
    if (ultimo) {
      const dia = Number(ultimo.fecha.slice(8));
      fecha = sumarMes(ultimo.fecha, dia);
      while (fecha < hoy) fecha = sumarMes(fecha, dia);
    } else {
      let [y, m] = hoy.split('-').map(Number);
      fecha = fechaDelMes(rec, y, m);
      if (fecha < hoy) { m += 1; if (m > 12) { m = 1; y += 1; } fecha = fechaDelMes(rec, y, m); }
    }
    const montoC = ultimo ? ultimo.monto_cents : Math.round(Number(rec.monto) * 100);
    items.push({ id: rec.id, concepto: rec.concepto, fecha, dias: diasEntre(hoy, fecha), monto_cents: montoC,
      estimado: !ultimo, ultimo_cargo: ultimo ? ultimo.fecha : null });
  }
  items.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.concepto.localeCompare(b.concepto)));
  let acum = 0;
  const disp = cuenta && Number.isFinite(cuenta.disponible_cents) ? cuenta.disponible_cents : null;
  for (const it of items) {
    acum += it.monto_cents;
    it.acumulado_cents = acum;
    it.cubierto = disp == null ? null : disp - acum >= 0;
  }
  const total = acum;
  return {
    cuenta: cuenta ? cuenta.mask : null,
    disponible_cents: disp,
    total_cents: total,
    cubierto: disp == null ? null : disp >= total,
    falta_cents: disp == null ? null : Math.max(0, total - disp),
    items
  };
}

module.exports = { calcular, claves, coincide, sumarMes };
