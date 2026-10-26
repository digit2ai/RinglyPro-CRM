'use strict';
/**
 * Corte reserve (owner design 2026-10-26).
 * The paycheck lands 100% in the "corte" account (••7485), which only pays the Corte by auto-debit.
 * On every payday the owner needs to know how much to KEEP there so the next Corte is covered, and how much
 * he can move to the "gastos" account (••5122). Pure function, integer cents, no model, no database.
 *
 * Inputs:
 *   hoy          'YYYY-MM-DD'
 *   saldoCents   the bank's own balance of the corte account (available, else current); null = unknown
 *   corte        { fecha, montoCents }  next Corte (amount already the max of plan and last real charge)
 *   pagos        [{ fecha, montoCents }] upcoming paychecks (plan), any order
 *   colchonCents cushion to keep on top of the Corte
 */
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const ceilDollar = (c) => Math.ceil(c / 100) * 100;

function calcular({ hoy, saldoCents, corte, pagos, colchonCents = 20000 }) {
  if (!corte || !corte.fecha || !(corte.montoCents > 0)) return { estado: 'sin_corte' };
  if (saldoCents == null || !isFinite(saldoCents)) return { estado: 'sin_saldo', corte };
  const objetivo = corte.montoCents + Math.max(0, colchonCents || 0);
  const falta = objetivo - saldoCents;
  const antes = (pagos || []).filter(p => p.fecha >= hoy && p.fecha < corte.fecha && p.montoCents > 0).sort((a, b) => a.fecha < b.fecha ? -1 : 1);
  const out = { corte, saldoCents, colchonCents, objetivoCents: objetivo, faltaCents: Math.max(0, falta), pagos: [], riesgo: null };

  if (falta <= 0) {
    out.estado = 'cubierto';
    out.moverAhoraCents = -falta;                        // surplus that can go to the gastos account today
    out.pagos = antes.map(p => ({ fecha: p.fecha, montoCents: p.montoCents, guardarCents: 0, moverCents: p.montoCents }));
    return out;
  }
  if (!antes.length) {
    out.estado = 'faltante';                              // no paycheck before the Corte: money must come from gastos
    out.traerCents = falta;
    return out;
  }
  const cada = ceilDollar(falta / antes.length);
  let pendiente = falta;
  out.pagos = antes.map(p => {
    const guardar = Math.min(p.montoCents, cada, Math.max(0, ceilDollar(pendiente)));
    pendiente -= guardar;
    return { fecha: p.fecha, montoCents: p.montoCents, guardarCents: guardar, moverCents: p.montoCents - guardar };
  });
  if (pendiente > 0) { out.estado = 'insuficiente'; out.traerCents = pendiente; }
  else out.estado = 'en_camino';
  // the last paycheck before the Corte lands 0-2 days before it and is still needed: a late deposit bounces the Corte
  const ultimo = antes[antes.length - 1];
  const sinUltimo = antes.slice(0, -1).reduce((x, p) => x + p.montoCents, 0);
  if (ultimo && ultimo.fecha >= addDays(corte.fecha, -2) && sinUltimo < falta) {
    out.riesgo = { fecha: ultimo.fecha, faltaSinEseCents: falta - sinUltimo };
  }
  return out;
}

module.exports = { calcular };
