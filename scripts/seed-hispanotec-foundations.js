#!/usr/bin/env node
'use strict';

/**
 * Siembra la lista inicial de fundaciones de referencia del modulo HISP-104,
 * en la Instancia cv-105 (HISPANOTEC) y en ninguna otra.
 *
 * SE SIEMBRA EL NOMBRE. NO SE SIEMBRA NI UNA SOLA CIFRA.
 *
 * La especificacion pide "las fundaciones de referencia identificadas por
 * HISPANOTEC en Espana (p. ej. Fundacion Telefonica, fundaciones de entidades
 * bancarias, Fundacion Rafael del Pino)". Nombra dos y describe una categoria.
 * Los presupuestos NO son publicamente accesibles de forma homogenea, y el
 * criterio de aceptacion prohibe expresamente presentar una estimacion como
 * dato confirmado. Inventar una dotacion aqui seria exactamente el fallo que
 * el modulo existe para evitar, asi que cada ficha entra sin presupuesto, sin
 * proxy, sin email y sin telefono: solo el nombre y el pais.
 *
 * Todas nacen 'pendiente_validacion'. Una persona de HISPANOTEC confirma la
 * entidad y, cuando tenga fuente y ejercicio, anade la cifra.
 *
 * Los equivalentes en Hispanoamerica NO se siembran: la especificacion no
 * nombra ninguno y elegirlos por mi cuenta seria inventar el criterio de
 * HISPANOTEC, no aplicarlo.
 *
 *   node scripts/seed-hispanotec-foundations.js          (dry run)
 *   node scripts/seed-hispanotec-foundations.js --apply
 */

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const APPLY = process.argv.includes('--apply');
const SLUG = 'cv-105';

// Nombradas en la especificacion, mas las fundaciones de entidades bancarias
// espanolas de referencia. Solo denominacion y pais.
const FUNDACIONES = [
  { nombre: 'Fundacion Telefonica',        origen_lista: 'Nombrada en HISP-104' },
  { nombre: 'Fundacion Rafael del Pino',   origen_lista: 'Nombrada en HISP-104' },
  { nombre: 'Fundacion "la Caixa"',        origen_lista: 'Fundacion de entidad bancaria (categoria citada en HISP-104)' },
  { nombre: 'Fundacion BBVA',              origen_lista: 'Fundacion de entidad bancaria (categoria citada en HISP-104)' },
  { nombre: 'Fundacion Banco Santander',   origen_lista: 'Fundacion de entidad bancaria (categoria citada en HISP-104)' },
  { nombre: 'Fundacion Ibercaja',          origen_lista: 'Fundacion de entidad bancaria (categoria citada en HISP-104)' },
  { nombre: 'Fundacion Unicaja',           origen_lista: 'Fundacion de entidad bancaria (categoria citada en HISP-104)' },
];

const seq = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});

(async () => {
  const [ch] = await seq.query('SELECT id, slug, name FROM chambers WHERE slug = :s',
    { replacements: { s: SLUG }, type: QueryTypes.SELECT });
  if (!ch) { console.error('No existe la camara ' + SLUG); process.exit(1); }
  console.log(`Instancia: ${ch.slug} (${ch.name})  id=${ch.id}\n`);

  let creadas = 0, existentes = 0;
  for (const f of FUNDACIONES) {
    const clave = `fundacion|${f.nombre.toLowerCase()}|espana`;
    const [ya] = await seq.query(
      'SELECT id FROM hd_entries WHERE chamber_id = :c AND dedupe_key = :k',
      { replacements: { c: ch.id, k: clave }, type: QueryTypes.SELECT });
    if (ya) { existentes++; console.log(`  = ${f.nombre} (ya existe)`); continue; }

    if (!APPLY) { creadas++; console.log(`  + ${f.nombre}  [simulacion]`); continue; }

    const [row] = await seq.query(
      `INSERT INTO hd_entries
         (chamber_id, nombre, naturaleza, tipologia, pais, estado_ficha, origen,
          base_legal, dedupe_key, notas)
       VALUES (:c, :n, 'fundacion', 'Prospecto', 'Espana', 'pendiente_validacion', 'manual',
               'Interes legitimo — entidad juridica, sin datos personales', :k, :notas)
       RETURNING id`,
      { replacements: { c: ch.id, n: f.nombre, k: clave,
          notas: f.origen_lista + '. Alta sin presupuesto ni proxy: la cifra debe anadirse '
               + 'con fuente y ejercicio verificables. Pendiente de validacion humana.' },
        type: QueryTypes.SELECT });

    // Ficha de fundacion SIN cifras. Existe para que el modulo la liste y una
    // persona pueda completarla; no para sugerir que ya tenemos el dato.
    await seq.query(
      'INSERT INTO hd_foundations (chamber_id, entry_id) VALUES (:c, :e)',
      { replacements: { c: ch.id, e: row.id }, type: QueryTypes.INSERT });

    creadas++;
    console.log(`  + ${f.nombre}  -> ficha #${row.id}`);
  }

  console.log(`\n${APPLY ? 'Creadas' : 'Se crearian'}: ${creadas}   ya existentes: ${existentes}`);
  console.log('Ninguna lleva presupuesto, proxy, email ni telefono. Todas quedan '
            + 'pendientes de validacion.');
  console.log('\nEquivalentes en Hispanoamerica: NO sembrados. La especificacion no nombra '
            + 'ninguno y elegirlos seria inventar el criterio de HISPANOTEC. Que los indiquen.');
  if (!APPLY) console.log('\nEjecuta con --apply para escribir.');
  await seq.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
