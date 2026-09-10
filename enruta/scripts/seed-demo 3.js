#!/usr/bin/env node
'use strict';
/**
 * Siembra los datos de demostración de ENRUTA contra la base que apunte
 * DATABASE_URL. Es el mismo generador que usa POST /enruta/admin/seed-demo.
 *
 *   node enruta/scripts/seed-demo.js                  # añade 60 ciudadanos
 *   node enruta/scripts/seed-demo.js --reset          # deja el tenant limpio primero
 *   node enruta/scripts/seed-demo.js --clientes=120 --semilla=7
 */
require('dotenv').config();
const models = require('../models');
const { sembrarDemo } = require('../src/services/demo-data');

const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${n}=`));
  return m ? m.split('=')[1] : d;
};

(async () => {
  const reset = process.argv.includes('--reset');
  if (reset) console.log('--reset: se borrarán las filas del tenant antes de sembrar');
  const resumen = await sembrarDemo(models, {
    tenant_id: arg('tenant'),
    clientes: arg('clientes'),
    semilla: arg('semilla') && Number(arg('semilla')),
    reset
  });
  console.log(JSON.stringify(resumen, null, 2));
  await models.sequelize.close();
})().catch((e) => { console.error(e); process.exit(1); });
