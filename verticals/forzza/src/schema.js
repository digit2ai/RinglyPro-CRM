'use strict';
/**
 * Corre la migración canónica en cada arranque (idempotente, bajo candado) y
 * siembra, SOLO si faltan, la empresa y sus cuentas de dinero con NOMBRES
 * genéricos: los números de cuenta y los saldos son datos del cliente y este
 * repositorio es público, así que se capturan en la app, nunca aquí.
 * La reserva mínima queda vacía hasta que Rafael la defina.
 */
const fs = require('fs');
const path = require('path');

// [nombre, banco, tipo, uso, incluir, nota]
const CUENTAS = [
  ['HSBC cheques', 'HSBC', 'cheques', 'cobranza', true, 'Donde pagan los clientes. Saldo por capturar.'],
  ['BBVA cheques', 'BBVA', 'cheques', 'operacion', true, 'Cuenta de operación. Saldo por capturar.'],
  ['Banorte', 'Banorte', 'cheques', 'operacion', true, 'Saldo por capturar.'],
  ['Tarjeta de crédito', null, 'tarjeta', 'personal', false, 'Fuera del efectivo de la empresa hasta que se decida otra cosa.']
];

async function init(db) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261115_forzza_tables.sql'), 'utf8');
  let tenantId = null;
  await db.transaction(async (t) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('forzza_schema'))", { transaction: t });
    await db.query(sql, { transaction: t });
    if (process.env.FORZZA_SEED === 'off') return;
    const q = (s, r) => db.query(s, { replacements: r || {}, transaction: t });
    await q("INSERT INTO fz_tenants (name,slug) VALUES ('Forzza','forzza') ON CONFLICT (slug) DO NOTHING");
    const [[ten]] = await q("SELECT id FROM fz_tenants WHERE slug='forzza'");
    tenantId = ten.id;
    await q('INSERT INTO fz_config (tenant_id) VALUES (:t) ON CONFLICT (tenant_id) DO NOTHING', { t: tenantId });
    const [[c]] = await q('SELECT COUNT(*)::int AS n FROM fz_cuentas WHERE tenant_id=:t', { t: tenantId });
    if (!c.n) {
      for (const [nombre, banco, tipo, uso, incluir, notas] of CUENTAS) {
        await q('INSERT INTO fz_cuentas (tenant_id,nombre,banco,tipo,uso,incluir,notas) VALUES (:t,:n,:b,:ti,:u,:i,:no)',
          { t: tenantId, n: nombre, b: banco, ti: tipo, u: uso, i: incluir, no: notas });
      }
    }
  });
  return tenantId;
}
module.exports = { init, CUENTAS };
