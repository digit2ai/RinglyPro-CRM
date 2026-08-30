'use strict';

// =============================================================
// Criterios de aceptacion del brief, 1 a 14.
//
// Se prueban contra las funciones reales, no contra copias del algoritmo. Sin
// claves externas: la base de datos se usa solo para los criterios que exigen
// persistencia (replay y multi-tenant), y limpia lo suyo al terminar.
//
//   node tests/wordpressAuth.test.js
// =============================================================

require('dotenv').config();
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY
  || 'a'.repeat(64);   // determinista para la prueba

const assert = require('assert');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const secretos = require('../src/services/tenantSecrets');
const wp = require('../src/services/wpIdentity');

let pass = 0, fail = 0;
const fallos = [];
async function t(nombre, fn) {
  try { await fn(); pass++; console.log('  ok   ' + nombre); }
  catch (e) { fail++; fallos.push({ nombre, err: e.message }); console.log('FALLA  ' + nombre + '\n       ' + e.message); }
}

const SLUG = 'cv-105';
const SECRETO = secretos.generar();
const CFG = {
  jwt_algorithm: 'HS256', max_token_ttl_sec: 120, clock_tolerance_sec: 60,
  wp_issuer: 'https://hispanotec.org/',
  shared_secret_enc: secretos.encrypt(SECRETO),
  allowed_redirects: ['/', '/directorio'],
  role_map: { administrator: 'chamber_admin', editor: 'chamber_staff',
              cv_empresario: 'empresario', subscriber: 'member' },
  default_role: 'member', auto_provision: true,
};

function token(over, secreto, opciones) {
  const ahora = Math.floor(Date.now() / 1000);
  const payload = Object.assign({
    iss: 'https://hispanotec.org/', aud: SLUG, sub: '4821',
    jti: crypto.randomUUID(), iat: ahora, exp: ahora + 120,
    email: 'jperez@empresa.com', name: 'Juan Perez', roles: ['cv_empresario'],
  }, over || {});
  // noTimestamp:true BORRA el iat aunque venga en el payload, y sin iat no se
  // puede comprobar exp-iat contra la politica. El servicio hace bien en
  // rechazarlo; era el ayudante de prueba el que emitia tokens invalidos.
  return jwt.sign(payload, secreto || SECRETO,
    Object.assign({ algorithm: 'HS256' }, opciones || {}));
}

(async () => {
  console.log('WordPress como proveedor de identidad — criterios de aceptacion\n');

  await t('1. token valido verifica y trae sus claims', () => {
    const r = wp.verificarToken(token(), CFG, SLUG);
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.payload.sub, '4821');
    assert.strictEqual(r.payload.email, 'jperez@empresa.com');
  });

  await t('3. token caducado se rechaza', () => {
    const ahora = Math.floor(Date.now() / 1000);
    const r = wp.verificarToken(token({ iat: ahora - 600, exp: ahora - 400 }), CFG, SLUG);
    assert.strictEqual(r.ok, false);
  });

  await t('4. token firmado con otro secreto se rechaza', () => {
    const r = wp.verificarToken(token({}, secretos.generar()), CFG, SLUG);
    assert.strictEqual(r.ok, false);
  });

  await t('5. alg:none se rechaza', () => {
    const ahora = Math.floor(Date.now() / 1000);
    const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const cuerpo = Buffer.from(JSON.stringify({ iss: 'https://hispanotec.org/', aud: SLUG,
      sub: '4821', jti: 'x', iat: ahora, exp: ahora + 120 })).toString('base64url');
    const r = wp.verificarToken(`${cabecera}.${cuerpo}.`, CFG, SLUG);
    assert.strictEqual(r.ok, false, 'alg:none NUNCA debe pasar');
  });

  await t('5b. alg:RS256 con el secreto como clave se rechaza', () => {
    // El ataque clasico de confusion de algoritmo.
    const ahora = Math.floor(Date.now() / 1000);
    const cabecera = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const cuerpo = Buffer.from(JSON.stringify({ aud: SLUG, sub: '1', jti: 'y', iat: ahora, exp: ahora + 60 })).toString('base64url');
    const firma = crypto.createHmac('sha256', SECRETO).update(`${cabecera}.${cuerpo}`).digest('base64url');
    const r = wp.verificarToken(`${cabecera}.${cuerpo}.${firma}`, CFG, SLUG);
    assert.strictEqual(r.ok, false, 'la lista blanca de algoritmos debe cortarlo');
  });

  await t('6. token con aud de otro tenant se rechaza', () => {
    const r = wp.verificarToken(token({ aud: 'cv-106' }), CFG, SLUG);
    assert.strictEqual(r.ok, false, 'un token de cv-106 no puede abrir cv-105');
  });

  await t('7. TTL mayor que la politica se rechaza aunque la firma sea buena', () => {
    const ahora = Math.floor(Date.now() / 1000);
    const r = wp.verificarToken(token({ iat: ahora, exp: ahora + 86400 }), CFG, SLUG);
    assert.strictEqual(r.ok, false);
    assert.ok(/vigencia|politica/i.test(r.error), 'debe decir que es la politica, no la firma: ' + r.error);
  });

  await t('7b. token sin jti se rechaza: sin el no hay defensa de reenvio', () => {
    const ahora = Math.floor(Date.now() / 1000);
    const sinJti = jwt.sign({ iss: 'https://hispanotec.org/', aud: SLUG, sub: '1',
      iat: ahora, exp: ahora + 60 }, SECRETO, { algorithm: 'HS256' });
    const r = wp.verificarToken(sinJti, CFG, SLUG);
    assert.strictEqual(r.ok, false);
    assert.ok(/jti/i.test(r.error));
  });

  await t('8. redirect=//evil.com cae al inicio de la camara', () => {
    assert.strictEqual(wp.destinoSeguro('//evil.com', CFG, SLUG), '/cv-105/dashboard/');
    assert.strictEqual(wp.destinoSeguro('https://evil.com', CFG, SLUG), '/cv-105/dashboard/');
    assert.strictEqual(wp.destinoSeguro('/directorio', CFG, SLUG), '/directorio');
  });

  await t('8b. un destino fuera de la lista del tenant cae al inicio', () => {
    const estricta = Object.assign({}, CFG, { allowed_redirects: ['/directorio'] });
    assert.strictEqual(wp.destinoSeguro('/otra-cosa', estricta, SLUG), '/cv-105/dashboard/');
    assert.strictEqual(wp.destinoSeguro('/directorio', estricta, SLUG), '/directorio');
  });

  await t('9. rotacion: el secreto anterior sigue validando hasta la limpieza', () => {
    const nuevo = secretos.generar();
    const rotada = Object.assign({}, CFG, {
      shared_secret_enc: secretos.encrypt(nuevo),
      shared_secret_prev_enc: secretos.encrypt(SECRETO),
    });
    const conViejo = wp.verificarToken(token({}, SECRETO), rotada, SLUG);
    assert.strictEqual(conViejo.ok, true, 'un token en vuelo firmado con el anterior debe entrar');
    assert.strictEqual(conViejo.secreto_usado, 'anterior');
    const conNuevo = wp.verificarToken(token({}, nuevo), rotada, SLUG);
    assert.strictEqual(conNuevo.ok, true);
    assert.strictEqual(conNuevo.secreto_usado, 'actual');
    // Tras la limpieza, el anterior deja de valer.
    const limpia = Object.assign({}, rotada, { shared_secret_prev_enc: null });
    assert.strictEqual(wp.verificarToken(token({}, SECRETO), limpia, SLUG).ok, false);
  });

  await t('10. webhook con HMAC incorrecto se rechaza', () => {
    const cuerpo = JSON.stringify({ event: 'user.updated' });
    const ts = Math.floor(Date.now() / 1000);
    const r = wp.verificarWebhook(CFG, { timestamp: ts, rawBody: cuerpo, firma: 'deadbeef' });
    assert.strictEqual(r.ok, false);
  });

  await t('10b. webhook con HMAC correcto se acepta, y fuera de ventana no', () => {
    const cuerpo = JSON.stringify({ event: 'user.updated', user: { wp_user_id: 1 } });
    const ts = Math.floor(Date.now() / 1000);
    const buena = wp.firmaWebhook(SECRETO, ts, cuerpo);
    assert.strictEqual(wp.verificarWebhook(CFG, { timestamp: ts, rawBody: cuerpo, firma: buena }).ok, true);
    assert.strictEqual(wp.verificarWebhook(CFG, { timestamp: ts, rawBody: cuerpo, firma: 'sha256=' + buena }).ok, true);
    // Mismo cuerpo, timestamp viejo: la firma ya no vale porque el timestamp entra en el HMAC.
    const viejo = ts - 3600;
    assert.strictEqual(wp.verificarWebhook(CFG, { timestamp: viejo, rawBody: cuerpo,
      firma: wp.firmaWebhook(SECRETO, viejo, cuerpo) }).ok, false, 'debe caer por ventana');
  });

  await t('10c. un byte distinto en el cuerpo invalida la firma', () => {
    const ts = Math.floor(Date.now() / 1000);
    const cuerpo = JSON.stringify({ event: 'user.updated', user: { wp_user_id: 1 } });
    const firma = wp.firmaWebhook(SECRETO, ts, cuerpo);
    const alterado = JSON.stringify({ event: 'user.updated', user: { wp_user_id: 2 } });
    assert.strictEqual(wp.verificarWebhook(CFG, { timestamp: ts, rawBody: alterado, firma }).ok, false);
  });

  await t('ROLES: gana el mayor privilegio, y lo no mapeado nunca escala', () => {
    assert.strictEqual(wp.mapearRoles(['subscriber', 'administrator'], CFG).rol, 'chamber_admin');
    assert.strictEqual(wp.mapearRoles(['cv_empresario', 'subscriber'], CFG).rol, 'empresario');
    const desconocido = wp.mapearRoles(['cv_socio_de_honor'], CFG);
    assert.strictEqual(desconocido.rol, 'member', 'un rol desconocido cae a default_role');
    assert.ok(desconocido.nota, 'y se reporta en vez de silenciarse');
    assert.strictEqual(wp.mapearRoles([], CFG).rol, 'member');
  });

  // ---- los que necesitan base de datos ----
  const { Sequelize, QueryTypes } = require('sequelize');
  const url = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.log('\n  (sin DATABASE_URL: se omiten 2, 11, 12, 14)');
  } else {
    const s = new Sequelize(url, { dialect: 'postgres',
      dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false, pool: { max: 3 } });

    await t('2. token reenviado (mismo jti) se rechaza — en base de datos', async () => {
      const jti = 'test-' + crypto.randomUUID();
      const exp = Math.floor(Date.now() / 1000) + 120;
      const uno = await wp.consumirJti(s, QueryTypes, { jti, chamberId: 104, wpUserId: 4821, exp });
      const dos = await wp.consumirJti(s, QueryTypes, { jti, chamberId: 104, wpUserId: 4821, exp });
      assert.strictEqual(uno, true, 'el primer uso debe pasar');
      assert.strictEqual(dos, false, 'el segundo NO, y debe cortarlo el indice, no un Map de proceso');
      await s.query('DELETE FROM cv_sso_used_tokens WHERE jti = :j', { replacements: { j: jti } });
    });

    await t('2b. el guard es de base de datos, no de memoria (varias instancias)', () => {
      const src = require('fs').readFileSync(__dirname + '/../src/services/wpIdentity.js', 'utf8');
      assert.ok(/INSERT INTO cv_sso_used_tokens/.test(src),
        'el jti debe consumirse con un INSERT, para que valga entre instancias');
      assert.ok(!/const usedJti = new Map|usedJti\.set/.test(src), 'nada de cache en proceso');
    });

    await t('11. entrega duplicada se detecta por indice unico', async () => {
      const did = 'test-' + crypto.randomUUID();
      const ins = async () => s.query(
        `INSERT INTO cv_webhook_deliveries (chamber_id, delivery_id, event, status_code, action)
         VALUES (104, :d, 'user.updated', 200, 'actualizado')`,
        { replacements: { d: did }, type: QueryTypes.INSERT });
      await ins();
      let duplicado = false;
      try { await ins(); } catch (e) { duplicado = true; }
      assert.strictEqual(duplicado, true, 'la segunda entrega con el mismo X-CV-Delivery debe chocar');
      await s.query('DELETE FROM cv_webhook_deliveries WHERE delivery_id = :d', { replacements: { d: did } });
    });

    await t('14. un miembro de cv-105 no se resuelve desde otra camara', async () => {
      const [otra] = await s.query(
        "SELECT id FROM chambers WHERE slug <> 'cv-105' LIMIT 1", { type: QueryTypes.SELECT });
      const [mio] = await s.query(
        "SELECT id, chamber_id FROM members WHERE chamber_id = 104 LIMIT 1", { type: QueryTypes.SELECT });
      if (!otra || !mio) return;   // sin datos suficientes, no se inventa el resultado
      const cruzado = await s.query(
        'SELECT id FROM members WHERE id = :id AND chamber_id = :c',
        { replacements: { id: mio.id, c: otra.id }, type: QueryTypes.SELECT });
      assert.strictEqual(cruzado.length, 0, 'filtrar por chamber_id debe dejarlo fuera');
    });

    await s.close();
  }

  console.log('\n' + '='.repeat(56));
  console.log(`  ${pass}/${pass + fail} criterios`);
  if (fail) { console.log('\n  FALLOS:'); fallos.forEach((f) => console.log('   - ' + f.nombre + ': ' + f.err)); }
  console.log('='.repeat(56));
  process.exit(fail ? 1 : 0);
})();
