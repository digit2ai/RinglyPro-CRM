#!/usr/bin/env node
'use strict';

// =============================================================
// Generador de secreto compartido por tenant. Se autoverifica.
//
//   node scripts/generar-secreto-tenant.js cv-105            (simulacion)
//   node scripts/generar-secreto-tenant.js cv-105 --aplicar  (guarda y rota)
//
// El secreto en claro se imprime UNA VEZ. No se guarda en ningun sitio en
// claro, no se registra en el log, y ningun endpoint de lectura lo devuelve.
// Al aplicar, el secreto anterior pasa a shared_secret_prev_enc: los tokens ya
// emitidos por WordPress siguen validando mientras el socio despliega el nuevo.
// =============================================================

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');
const secretos = require('../src/services/tenantSecrets');

const APLICAR = process.argv.includes('--aplicar') || process.argv.includes('--apply');
const SLUG = (process.argv.find((a) => /^(cv|vc)-\d+$/.test(a)) || '').toLowerCase();

if (!SLUG) {
  console.error('Uso: node scripts/generar-secreto-tenant.js <cv-NNN> [--aplicar]');
  process.exit(1);
}

const seq = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false,
});

(async () => {
  const [camara] = await seq.query('SELECT id, slug, name FROM chambers WHERE slug = :s',
    { replacements: { s: SLUG }, type: QueryTypes.SELECT });
  if (!camara) { console.error(`No existe la camara ${SLUG}.`); process.exit(1); }

  const [actual] = await seq.query(
    "SELECT * FROM cv_tenant_integrations WHERE chamber_id = :c AND provider = 'wordpress'",
    { replacements: { c: camara.id }, type: QueryTypes.SELECT });

  const nuevo = secretos.generar();

  // Autoverificacion: se cifra, se descifra y se comprueba que vuelve igual.
  // Si APP_ENCRYPTION_KEY esta mal, es mejor descubrirlo aqui que cuando el
  // socio ya ha desplegado un secreto que la plataforma no sabe leer.
  const cifrado = secretos.encrypt(nuevo);
  if (secretos.decrypt(cifrado) !== nuevo) {
    console.error('FALLO: el cifrado no es reversible. Revisa APP_ENCRYPTION_KEY.');
    process.exit(1);
  }

  console.log(`Camara: ${camara.name} (${camara.slug})  chamber_id=${camara.id}`);
  console.log(`Integracion existente: ${actual ? 'si' : 'no'}`);
  if (actual) {
    console.log(`Huella del secreto actual: ${secretos.huella(actual.shared_secret_enc) || '(ilegible)'}`);
  }
  console.log();
  console.log('SECRETO COMPARTIDO (se muestra una sola vez):');
  console.log();
  console.log('   ' + nuevo);
  console.log();
  console.log('Huella del nuevo: ' + require('crypto').createHash('sha256').update(nuevo).digest('hex').slice(0, 12));
  console.log();

  if (!APLICAR) {
    console.log('SIMULACION: no se ha guardado nada. Repite con --aplicar para guardarlo.');
    await seq.close();
    return;
  }

  if (actual) {
    await seq.query(
      `UPDATE cv_tenant_integrations
          SET shared_secret_prev_enc = shared_secret_enc,
              shared_secret_enc = :nuevo,
              secret_rotated_at = NOW(),
              updated_at = NOW()
        WHERE id = :id`,
      { replacements: { nuevo: cifrado, id: actual.id }, type: QueryTypes.UPDATE });
    console.log('ROTADO. El secreto anterior sigue siendo valido hasta que se limpie,');
    console.log('para que los tokens ya emitidos no fallen mientras despliegas el nuevo.');
  } else {
    await seq.query(
      `INSERT INTO cv_tenant_integrations (chamber_id, tenant_slug, provider, shared_secret_enc)
       VALUES (:c, :s, 'wordpress', :sec)`,
      { replacements: { c: camara.id, s: camara.slug, sec: cifrado }, type: QueryTypes.INSERT });
    console.log('CREADA la integracion. SSO y webhook quedan DESACTIVADOS:');
    console.log('activalos desde la interfaz cuando el lado WordPress este listo.');
  }
  await seq.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
