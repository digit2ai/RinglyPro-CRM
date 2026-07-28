/**
 * Conectar una cámara de CamaraVirtual con un sitio WordPress, en un comando.
 *
 *   node scripts/setup-wp-integration.js \
 *     --slug=cv-105 \
 *     --site=https://elsitio.com \
 *     --secret=EL_SECRETO_DE_WORDPRESS \
 *     --direction=pull \
 *     --email=mstagg@digit2ai.com --password=...
 *
 * Hace, en orden:
 *   1. Inicia sesión como administrador de la cámara.
 *   2. Guarda la configuración (el secreto se cifra en la base de datos).
 *   3. Prueba la conexión con WordPress. No escribe nada.
 *   4. Ejecuta un ENSAYO (dry run) y muestra el plan.
 *
 * Nunca aplica cambios. Para aplicar, después de leer el plan:
 *   ... --apply
 *
 * Requiere que el plugin "CamaraVirtual Connector" ya esté instalado y
 * activado en WordPress, y que el secreto sea el mismo de los dos lados.
 */
'use strict';

const args = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}

const BASE = (args.base || 'https://aiagent.ringlypro.com').replace(/\/+$/, '');
const SLUG = args.slug;
const APPLY = !!args.apply;

function die(msg) { console.error('\nERROR: ' + msg + '\n'); process.exit(1); }

if (!SLUG) die('Falta --slug (por ejemplo --slug=cv-105)');
if (!args.email || !args.password) die('Faltan --email y --password de un administrador de la cámara');

const DIRECTION = args.direction || 'pull';
if (DIRECTION !== 'pull' && DIRECTION !== 'push') {
  die("--direction debe ser 'pull' (WordPress manda) o 'push' (la cámara manda)");
}

const API = `${BASE}/${SLUG}/api`;

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {}
    ),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { _raw: text.slice(0, 400) }; }
  return { status: res.status, json };
}

function line(t) { console.log(t); }
function head(n, t) { console.log('\n' + n + '. ' + t); }

(async () => {
  line(`\nCámara: ${SLUG}   Servidor: ${BASE}`);
  line(`Dirección: ${DIRECTION === 'pull' ? 'WordPress manda, la cámara sigue' : 'La cámara manda, WordPress sigue'}`);

  // ---- 1. sesión ----
  head(1, 'Iniciando sesión como administrador de la cámara');
  const login = await call('POST', '/auth/login', { email: args.email, password: args.password });
  if (login.status !== 200 || !login.json || !login.json.success) {
    die('No se pudo iniciar sesión: ' + ((login.json && login.json.error) || login.status));
  }
  const token = login.json.data.token;
  const me = login.json.data.member;
  if (!['superadmin', 'admin_global', 'admin_regional'].includes(me.access_level)) {
    die(`La cuenta ${me.email} no es administradora de esta cámara (access_level=${me.access_level})`);
  }
  line(`   OK. ${me.first_name} ${me.last_name} (${me.access_level})`);

  // ---- 2. configuración ----
  head(2, 'Guardando la configuración');
  const cfg = {
    enabled: true,
    direction: DIRECTION,
    mode: args.mode || 'plugin',
    allow_sso: DIRECTION === 'pull'
  };
  if (args.site) cfg.site_url = args.site;
  if (args.secret) cfg.shared_secret = args.secret;
  if (args.user) cfg.auth_user = args.user;
  if (args.password_wp) cfg.auth_secret = args.password_wp;

  const saved = await call('PUT', '/wp/config', cfg, token);
  if (saved.status !== 200 || !saved.json.success) {
    die('No se pudo guardar: ' + ((saved.json && saved.json.error) || saved.status));
  }
  const c = saved.json.data;
  line(`   OK. sitio=${c.site_url || '(sin definir)'}  modo=${c.mode}  secreto=${c.shared_secret.set ? 'guardado ' + c.shared_secret.hint : 'SIN CONFIGURAR'}`);
  if (!c.site_url) die('Falta --site (la dirección del WordPress)');
  if (!c.shared_secret.set) die('Falta --secret (el secreto generado en WordPress)');

  // ---- 3. prueba de conexión ----
  head(3, 'Probando la conexión con WordPress (no escribe nada)');
  const test = await call('POST', '/wp/test', {}, token);
  if (test.status !== 200 || !test.json.success) {
    line('   FALLÓ: ' + ((test.json && test.json.error) || test.status));
    line('\n   Revisa que:');
    line('     - el plugin "CamaraVirtual Connector" esté activado en WordPress;');
    line('     - el secreto sea exactamente el mismo de los dos lados;');
    line('     - la dirección del sitio sea correcta y responda por HTTPS;');
    line('     - la hora del servidor de WordPress esté al día (la firma caduca en 5 minutos).');
    process.exit(1);
  }
  line(`   OK. WordPress respondió con ${test.json.data.fetched} usuario(s).`);
  if (test.json.data.sample && test.json.data.sample.length) {
    line('   Ejemplo de lo que leeríamos:');
    for (const s of test.json.data.sample) {
      line(`     - ${s.email}  ${s.first_name} ${s.last_name}  ${s.company_name || '(sin empresa)'}  ${s.sector || ''}`);
    }
  }

  // ---- 4. ensayo ----
  const path = DIRECTION === 'pull' ? '/wp/sync' : '/wp/push';
  head(4, 'Ensayo: qué pasaría (no cambia nada todavía)');
  const dry = await call('POST', path, { dry_run: true }, token);
  if (dry.status !== 200 || !dry.json.success) {
    die('El ensayo falló: ' + ((dry.json && dry.json.error) || dry.status));
  }
  const d = dry.json.data;
  line(`   Crearía:      ${d.created}`);
  line(`   Actualizaría: ${d.updated}`);
  line(`   Desactivaría: ${d.deactivated}`);
  line(`   Sin cambios:  ${d.unchanged}`);
  if (d.invalid && d.invalid.length) line(`   Descartados por correo inválido: ${d.invalid.length}`);
  if (d.duplicates && d.duplicates.length) line(`   Correos duplicados: ${d.duplicates.join(', ')}`);
  if (d.plan && d.plan.create && d.plan.create.length) {
    line('\n   Se darían de alta:');
    for (const p of d.plan.create.slice(0, 20)) line(`     - ${p.email}  ${p.name}  ${p.company || ''}`);
    if (d.plan.create.length > 20) line(`     ... y ${d.plan.create.length - 20} más`);
  }
  if (d.plan && d.plan.deactivate && d.plan.deactivate.length) {
    line('\n   Se desactivarían:');
    for (const p of d.plan.deactivate.slice(0, 20)) line(`     - ${p.email}  (${p.reason || 'no está en el origen'})`);
  }

  if (!APPLY) {
    line('\n-----------------------------------------------------------');
    line('Esto fue solo un ENSAYO. No se cambió nada.');
    line('Si el plan de arriba es correcto, repite el mismo comando');
    line('agregando  --apply  al final.');
    line('-----------------------------------------------------------\n');
    process.exit(0);
  }

  head(5, 'Aplicando');
  const run = await call('POST', path, {}, token);
  if (run.status !== 200 || !run.json.success) {
    die('Falló al aplicar: ' + ((run.json && run.json.error) || run.status));
  }
  const r = run.json.data;
  line(`   Creados: ${r.created}   Actualizados: ${r.updated}   Desactivados: ${r.deactivated}`);
  if (r.failed) {
    line(`   Con error: ${r.failed}`);
    for (const e of (r.errors || []).slice(0, 10)) line(`     - ${e.email}: ${e.error}`);
  }
  line('\nListo.\n');
})().catch(e => die(e.message));
