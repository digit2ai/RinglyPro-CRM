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
// Confirmado por NeoHaul en «exel 12.xlsx» (10-nov-2026), con sus palabras.
const NOTA_4400 = 'Por viaje a bacheo Santiago: $2,400 carpeta + $2,000 escombro (NeoHaul, 10-nov-2026).';
const NOTA_ESCOMBRO = 'Se cobra a $225/t y lo pagan por 20 t: $4,500 por viaje (NeoHaul, 10-nov-2026).';
// [nombre, material, origen, destino, unidad, precio, por_confirmar, nota]
const TARIFAS = [
  ['Carpeta asfáltica · Planta Santiago → Monterrey', 'asfalto', 'Planta Santiago', 'Monterrey', 'tonelada', 170, false, null],
  ['Carpeta asfáltica · Planta Cadereyta → Monterrey', 'asfalto', 'Planta Cadereyta', 'Monterrey', 'tonelada', 185, false, null],
  ['Renta diaria · Planta Cadereyta → bacheo Santiago', 'asfalto', 'Planta Cadereyta', 'Bacheo Santiago', 'dia', 6500, false, null],
  ['Planta Santiago → bacheo Santiago', 'asfalto', 'Planta Santiago', 'Bacheo Santiago', 'viaje', 4400, false, NOTA_4400],
  ['Recuperado (reciclado)', 'recuperado', null, null, 'tonelada', 150, false, null],
  ['Escombro (20 t por viaje)', 'escombro', null, null, 'viaje', 4500, false, NOTA_ESCOMBRO],
  ['Viajes internos en planta', 'asfalto', 'Planta', 'Planta', 'tonelada', 22, false, null]
];

/** Ver el comentario de adentro. Exportada para que la SIT la pruebe contra una empresa con viajes. */
async function confirmarTarifas(q, tenantId) {
  // Las dos tarifas que sembramos "por confirmar" ya las confirmó NeoHaul. Solo se tocan si siguen
  // exactamente como las sembramos (si alguien ya las editó, su edición gana). Si ya hay viajes con
  // ellas, NO se cambian en su lugar: se retiran y se agrega la confirmada como fila nueva, para que
  // ningún viaje viejo cambie de unidad (20 t a $250 jamás debe volverse 20 viajes a $4,500).
  const corregir = async (where, nueva) => {
    const [rows] = await q(`SELECT id FROM nh_tarifas WHERE tenant_id=:t AND por_confirmar AND ${where}`, { t: tenantId });
    for (const r of rows) {
      const [[u]] = await q('SELECT COUNT(*)::int AS n FROM nh_viajes WHERE tenant_id=:t AND tarifa_id=:id', { t: tenantId, id: r.id });
      if (!u.n) {
        await q('UPDATE nh_tarifas SET nombre=:n, unidad=:u, precio=:p, por_confirmar=FALSE, nota=:nota WHERE id=:id AND tenant_id=:t', { ...nueva, id: r.id, t: tenantId });
      } else {
        await q("UPDATE nh_tarifas SET active=FALSE, nota='Reemplazada por la tarifa confirmada (10-nov-2026); sus viajes conservan su precio.' WHERE id=:id AND tenant_id=:t", { id: r.id, t: tenantId });
        await q(`INSERT INTO nh_tarifas (tenant_id,nombre,material,origen,destino,unidad,precio,por_confirmar,nota)
          SELECT tenant_id,:n,material,origen,destino,:u,:p,FALSE,:nota FROM nh_tarifas WHERE id=:id AND tenant_id=:t`, { ...nueva, id: r.id, t: tenantId });
      }
      await q("INSERT INTO nh_activity (tenant_id,action,detail) VALUES (:t,'tarifa_confirmada',:d)", { t: tenantId, d: `${r.id} -> ${nueva.n} ${nueva.p}/${nueva.u}${u.n ? ' (fila nueva; ' + u.n + ' viajes conservan la anterior)' : ''}` });
    }
  };
  await corregir("nombre='Planta Santiago → bacheo Santiago' AND precio=4400 AND unidad='dia'",
    { n: 'Planta Santiago → bacheo Santiago', u: 'viaje', p: 4400, nota: NOTA_4400 });
  await corregir("material='escombro' AND precio=250 AND unidad='tonelada'",
    { n: 'Escombro (20 t por viaje)', u: 'viaje', p: 4500, nota: NOTA_ESCOMBRO });
}

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
    await confirmarTarifas(q, tenantId);
  });
  return tenantId;
}
module.exports = { init, confirmarTarifas, FLOTA, OBRAS, TARIFAS };
