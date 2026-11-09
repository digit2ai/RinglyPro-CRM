'use strict';
/**
 * Corre la migración canónica en cada arranque (idempotente, bajo candado) y
 * siembra, SOLO si faltan, los datos que NeoHaul ya nos dio en el mapa del
 * proceso (27-oct-2026): su flota por empresa, HTR como cliente, las obras que
 * aparecen en sus facturas y la tabla de tarifas. Los nombres de unidad son
 * provisionales (no tenemos números económicos ni placas) y lo dicen.
 * Nada se sobrescribe: lo que Andrés edite en Catálogos sobrevive a cada deploy.
 */
const fs = require('fs');
const path = require('path');

const FLOTA = [
  ['NeoHaul', 6, 'Torton', 14, true],
  ['TTS', 8, 'Torton', 14, false],
  ['TTS', 4, 'Tolva', 30, false],
  ['SEMAQSA', 2, 'Torton', 14, false]
];
const OBRAS = [
  ['Bacheo E18', 'E18'], ['SICT N18', 'N18'], ['SICT N16', 'N16'],
  ['Viajes internos de plantas', 'INT'], ['REA4', 'REA4']
];
// [nombre, material, origen, destino, unidad, precio, por_confirmar, nota]
const TARIFAS = [
  ['Carpeta asfáltica · Planta Santiago → Monterrey', 'asfalto', 'Planta Santiago', 'Monterrey', 'tonelada', 170, false, null],
  ['Carpeta asfáltica · Planta Cadereyta → Monterrey', 'asfalto', 'Planta Cadereyta', 'Monterrey', 'tonelada', 185, false, null],
  ['Renta diaria · Planta Cadereyta → bacheo Santiago', 'asfalto', 'Planta Cadereyta', 'Bacheo Santiago', 'dia', 6500, false, null],
  ['Planta Santiago → bacheo Santiago', 'asfalto', 'Planta Santiago', 'Bacheo Santiago', 'dia', 4400, true, 'Confirmar con NeoHaul si los $4,400 son por día o por viaje.'],
  ['Recuperado (reciclado)', 'recuperado', null, null, 'tonelada', 150, false, null],
  ['Escombro', 'escombro', null, null, 'tonelada', 250, true, 'El mensaje de NeoHaul dice $4,500 por 20 t; a $250/t serían $5,000. Confirmar.'],
  ['Viajes internos en planta', 'asfalto', 'Planta', 'Planta', 'tonelada', 22, false, null]
];

async function init(db) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261109_neohaul_tables.sql'), 'utf8');
  let tenantId = null;
  await db.transaction(async (t) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('neohaul_schema'))", { transaction: t });
    await db.query(sql, { transaction: t });
    if (process.env.NEOHAUL_SEED === 'off') return;
    const q = (s, r) => db.query(s, { replacements: r || {}, transaction: t });
    await q("INSERT INTO nh_tenants (name,slug) VALUES ('Grupo NeoHaul','neohaul') ON CONFLICT (slug) DO NOTHING");
    const [[ten]] = await q("SELECT id FROM nh_tenants WHERE slug='neohaul'");
    tenantId = ten.id;
    const count = async (table) => (await q(`SELECT COUNT(*)::int AS n FROM ${table} WHERE tenant_id=:t`, { t: tenantId }))[0][0].n;
    if (!(await count('nh_trucks'))) {
      for (const [empresa, n, tipo, cap, propio] of FLOTA) {
        const pref = tipo === 'Tolva' ? 'TV' : 'T';
        for (let i = 1; i <= n; i++) {
          await q(`INSERT INTO nh_trucks (tenant_id,empresa,unidad,tipo,capacidad_m3,propio,notas)
            VALUES (:t,:e,:u,:tipo,:cap,:p,'Nombre provisional: cambiar por número económico y placas.')`,
            { t: tenantId, e: empresa, u: `${empresa} ${pref}-${String(i).padStart(2, '0')}`, tipo, cap, p: propio });
        }
      }
    }
    if (!(await count('nh_clients'))) await q("INSERT INTO nh_clients (tenant_id,nombre) VALUES (:t,'HTR Infraestructura')", { t: tenantId });
    if (!(await count('nh_obras'))) {
      const [[c]] = await q('SELECT id FROM nh_clients WHERE tenant_id=:t ORDER BY id LIMIT 1', { t: tenantId });
      for (const [nombre, clave] of OBRAS) await q('INSERT INTO nh_obras (tenant_id,client_id,nombre,clave) VALUES (:t,:c,:n,:k)', { t: tenantId, c: c.id, n: nombre, k: clave });
    }
    if (!(await count('nh_tarifas'))) {
      for (const [nombre, material, origen, destino, unidad, precio, pc, nota] of TARIFAS) {
        await q(`INSERT INTO nh_tarifas (tenant_id,nombre,material,origen,destino,unidad,precio,por_confirmar,nota)
          VALUES (:t,:n,:m,:o,:d,:u,:p,:pc,:nota)`, { t: tenantId, n: nombre, m: material, o: origen, d: destino, u: unidad, p: precio, pc, nota });
      }
    }
  });
  return tenantId;
}
module.exports = { init, FLOTA, OBRAS, TARIFAS };
