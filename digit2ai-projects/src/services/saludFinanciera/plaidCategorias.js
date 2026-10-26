'use strict';
/**
 * Plaid Personal Finance Category (v2) -> Salud Financiera category.
 * Codes taken from https://plaid.com/documents/pfc-taxonomy-all.csv (2026-10-26).
 * A manual rule (sf_categoria_reglas, 'merchant:<key>') always wins over this map.
 */
const DETALLE = {
  INCOME_SALARY: 'salario',
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: 'corte',
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: 'inversion',
  TRANSFER_OUT_SAVINGS: 'ahorro',
  TRANSFER_IN_SAVINGS: 'ahorro'
};
const PRIMARIO = {
  INCOME: 'ingreso_extra',
  TRANSFER_IN: 'ingreso_extra',
  RENT_AND_UTILITIES: 'servicios',
  ENTERTAINMENT: 'gasto_personal',
  FOOD_AND_DRINK: 'gasto_personal',
  GENERAL_MERCHANDISE: 'gasto_personal',
  PERSONAL_CARE: 'gasto_personal',
  TRANSPORTATION: 'gasto_personal',
  TRAVEL: 'gasto_personal',
  MEDICAL: 'gasto_personal',
  HOME_IMPROVEMENT: 'gasto_personal',
  GENERAL_SERVICES: 'servicios',
  BANK_FEES: 'otro'
};

function claveComercio(nombre) {
  return 'merchant:' + String(nombre || '').toLowerCase().replace(/[0-9#*]+/g, ' ').replace(/[^a-zà-ÿ ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** categoria({ comercio, nombre, pfc_primary, pfc_detailed, tipo }, reglas Map) */
function categoria(t, reglas) {
  const k = claveComercio(t.comercio || t.nombre);
  if (reglas && reglas.has(k)) return reglas.get(k);
  if (t.pfc_detailed && DETALLE[t.pfc_detailed]) return DETALLE[t.pfc_detailed];
  if (t.pfc_primary && PRIMARIO[t.pfc_primary]) {
    const c = PRIMARIO[t.pfc_primary];
    // an "income" that is money out (refund reversal etc.) is not income
    if ((c === 'salario' || c === 'ingreso_extra') && t.tipo === 'egreso') return 'otro';
    return c;
  }
  return t.tipo === 'ingreso' ? 'ingreso_extra' : 'otro';
}

module.exports = { categoria, claveComercio, DETALLE, PRIMARIO };
