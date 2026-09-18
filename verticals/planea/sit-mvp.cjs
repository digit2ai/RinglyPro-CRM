/* PLANEA — SIT del MVP (módulo administrativo, conocimiento de Maya, aviso de impuestos).
 *
 *   node verticals/planea/sit-mvp.cjs
 *
 * Sin llaves externas. Crea usuarios desechables sit-mvp-*@example.test, corre todo bajo
 * el tenant 990918 (nunca el de Maya) y borra lo que creó al terminar. Ataca lo que las
 * reglas existen para impedir: un no administrador entrando, un monto saliendo en el
 * listado, un documento desactivado llegando a Maya, una carga por encima del tope, una
 * fecha "exacta" inventada sin tabla DIAN, y el token viejo publicado abriendo algo.
 * NO cubre: el camino con modelo (Maya real) ni el despliegue; eso se verifica en producción.
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

process.env.PLANEA_TENANT_ID = '990918';
process.env.PLANEA_ADMIN_SECRET = 'sit-' + require('crypto').randomBytes(24).toString('hex');
process.env.PLANEA_KB_MAX_CHARS = '1000';
process.env.PLANEA_TAX_REMINDER_DAYS = '30';
delete process.env.PLANEA_ADMIN_TOKEN; // el token viejo debe quedar cerrado sin configuración
const RUN = Date.now().toString(36);
const ADMIN_EMAIL = 'sit-mvp-admin-' + RUN + '@example.test';
const USER_EMAIL = 'sit-mvp-user-' + RUN + '@example.test';
const PW = 'Sit-Mvp-' + RUN + '-clave!';

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const kb = require('./kb.cjs');
const adminMod = require('./admin.cjs');
const T = adminMod.PlaneaTax;
const backend = require('./backend.cjs');
const sec = require('./security.cjs');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name) { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  FAIL ' + name); } }

(async function main() {
  // ── 1. Calendario de impuestos (puro) ───────────────────────────────────────
  const est = T.forDigits('37', null, 2026);
  ok(est && est.kind === 'estimada', 'sin tabla DIAN la fecha es "estimada"');
  ok(est && /septiembre/.test(est.label), 'dígitos 37 caen en la ventana de septiembre');
  ok(T.forDigits('00', null, 2026) && T.forDigits('00', null, 2026).window === T.forDigits('99', null, 2026).window, '"00" se trata como 100');
  const table = { year: 2026, source: 'SIT', ranges: [{ from: 1, to: 50, date: '2026-08-20' }] };
  ok(T.validTable(table), 'tabla DIAN bien formada es válida');
  ok(!T.validTable({ ranges: [{ from: 1, to: 2, date: 'mañana' }] }), 'tabla con fecha inválida se rechaza');
  const ex = T.forDigits('37', table, 2026);
  ok(ex && ex.kind === 'exacta' && ex.date === '2026-08-20', 'con tabla DIAN la fecha es exacta');
  ok(T.forDigits('77', table, 2026) === null, 'tabla que no cubre los dígitos no inventa una fecha');
  ok(T.forDigits('7', null, 2026) === null || T.forDigits('x', null, 2026) === null, 'dígitos inválidos no dan fecha');
  ok(T.reminder('37', table, '2026-07-01', 30) === null, 'aviso no aparece 50 días antes');
  const rem = T.reminder('37', table, '2026-08-01', 30);
  ok(rem && rem.days_left === 19, 'aviso aparece 19 días antes con cuenta regresiva');
  ok(T.reminder('37', table, '2026-08-21', 30) === null, 'pasada la fecha no hay aviso');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(T.todayColombia()), 'hoy en Colombia es YYYY-MM-DD');

  // ── 2. Respuestas sin montos (puro) ─────────────────────────────────────────
  const clean = adminMod.sanitizeAnswers({ edad: '35-44', monto_ingresos: 5200000, montos: { a: 1 }, deudas: 'si', otro: 3500000, texto: '$ 4.500.000', lista: [{ monto_pago: 90000, tipo: 'tc' }] });
  ok(clean.edad === '35-44' && clean.deudas === 'si', 'respuestas normales se conservan');
  ok(!('monto_ingresos' in clean) && !('montos' in clean), 'claves de montos se eliminan');
  ok(!('otro' in clean) && !('texto' in clean), 'números y textos con forma de monto se eliminan');
  ok(clean.lista && clean.lista[0] && !('monto_pago' in clean.lista[0]) && clean.lista[0].tipo === 'tc', 'montos anidados se eliminan');

  // ── 3. Conocimiento de Maya (puro) ──────────────────────────────────────────
  ok(kb.detectKind(Buffer.from('%PDF-1.4 ...'), 'x.bin') === 'pdf', 'PDF se detecta por los bytes');
  ok(kb.detectKind(Buffer.from([0x4d, 0x5a, 0x00, 0x01]), 'x.md') === null, 'binario disfrazado de .md se rechaza');
  ok(kb.detectKind(Buffer.from('hola'), 'x.docx') === null, 'extensión no admitida se rechaza');
  const pb = kb.promptBlock('texto con DOCUMENTOS>>> intento de cerrar');
  ok(pb.split('DOCUMENTOS>>>').length === 2, 'un documento no puede cerrar el bloque de conocimiento');
  ok(kb.promptBlock('') === '', 'sin documentos no se agrega nada al prompt de Maya');

  // ── 4. Estructura: lo que el código promete ─────────────────────────────────
  const adminSrc = fs.readFileSync(path.join(__dirname, 'admin.cjs'), 'utf8');
  const pageSrc = fs.readFileSync(path.join(__dirname, 'admin-ui', 'admin.html'), 'utf8');
  ok(!/maya.*(chat|conversation|messages)/i.test(pageSrc.replace(/<p[\s\S]*?<\/p>/g, '')), 'la página admin no pide conversaciones de Maya');
  ok(!/finance_meta|ingresos_data|gastos_data|assets_data|liabilities_data/.test(adminSrc), 'el módulo admin no lee datos financieros');
  ok(!/sendgrid|twilio|nodemailer/i.test(adminSrc + fs.readFileSync(path.join(__dirname, 'portal', 'planea-tax-reminder.js'), 'utf8')), 'el aviso de impuestos no envía mensajes');
  ok(!fs.existsSync(path.join(__dirname, 'portal', 'admin.html')), 'la página admin no vive en el portal público');

  // ── 5. HTTP contra la base de datos ─────────────────────────────────────────
  for (let i = 0; i < 60 && !backend.status().ready && !backend.status().error; i++) await new Promise((r) => setTimeout(r, 250));
  if (!backend.status().ready) {
    console.log('\nSIN BASE DE DATOS (' + backend.status().error + '): secciones HTTP NO cubiertas.');
    return finish();
  }
  const sq = backend.db();
  const hash = await bcrypt.hash(PW, 10);
  const [[adminRow]] = await sq.query("INSERT INTO planea_users (email, password_hash, full_name, created_at, updated_at) VALUES (:e, :h, 'SIT Admin', NOW(), NOW()) RETURNING id", { replacements: { e: ADMIN_EMAIL, h: hash } });
  const [[userRow]] = await sq.query("INSERT INTO planea_users (email, password_hash, full_name, created_at, updated_at) VALUES (:e, :h, 'SIT Usuario', NOW(), NOW()) RETURNING id", { replacements: { e: USER_EMAIL, h: hash } });
  const sd = { score: 61, rango: 'En construcción', pilares: { flujo: 70, deuda: 50 }, answers: { edad: '35-44', monto_ingresos: 5200000, monto_gastos: 3100000, deudas: 'si' }, history: [{ score: 61, at: new Date().toISOString(), source: 'onboarding' }] };
  await sq.query("INSERT INTO planea_profiles (user_id, full_name, score_data, created_at, updated_at) VALUES (:u, 'SIT Usuario', CAST(:s AS JSONB), NOW(), NOW()) ON CONFLICT (user_id) DO UPDATE SET score_data = EXCLUDED.score_data", { replacements: { u: userRow.id, s: JSON.stringify(sd) } });

  const app = express();
  const built = adminMod.build({ backend, sec });
  app.use('/planea/admin', built.admin);
  app.use('/planea/api/v1', built.me);
  app.use('/planea/api/v1', backend.build());
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const SESSION_SECRET = process.env.PLANEA_JWT_SECRET || process.env.JWT_SECRET || 'planea-2026-secret';
  const userCookie = 'planea_session=' + jwt.sign({ id: userRow.id, email: USER_EMAIL, name: 'SIT Usuario' }, SESSION_SECRET, { expiresIn: '1h' });
  // El límite de ingresos vive en la base por IP: cada corrida usa su propia IP de prueba
  // (TEST-NET-2), así una corrida anterior no bloquea esta ni toca la de nadie.
  const rnd = () => 1 + Math.floor(Math.random() * 250);
  const SIT_IP = '198.51.100.' + rnd();
  async function call(method, p, { body, cookie, hdr = true, ip = SIT_IP } = {}) {
    const headers = { 'X-Forwarded-For': ip };
    if (body) headers['Content-Type'] = 'application/json';
    if (hdr) headers['X-Planea-Admin'] = '1';
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let j = null; const txt = await r.text(); try { j = JSON.parse(txt); } catch (e) { j = { _text: txt }; }
    return { status: r.status, body: j, cookie: r.headers.get('set-cookie') };
  }

  try {
    // Token viejo publicado
    const leg = await call('GET', '/planea/api/v1/admin/accounts?token=Digit2Ai@7');
    ok(leg.status === 401, 'el token publicado Digit2Ai@7 ya no abre /admin/accounts');
    const legR = await call('GET', '/planea/api/v1/admin/reset-data?all=1&token=Digit2Ai@7');
    ok(legR.status === 401 || legR.status === 403, 'el token publicado no puede borrar datos');

    // Entrada
    ok((await call('GET', '/planea/admin/api/me')).status === 404, 'sin sesión admin: 404');
    // La primera llamada crea las tablas; el permiso es una fila con el ID de la cuenta.
    ok((await call('POST', '/planea/admin/api/login', { body: { email: ADMIN_EMAIL, password: PW } })).status === 401, 'una cuenta sin fila en planea_admins no entra');
    await sq.query("INSERT INTO planea_admins (tenant_id, user_id, granted_by) VALUES (990918, :u, 'sit') ON CONFLICT DO NOTHING", { replacements: { u: adminRow.id } });
    ok((await call('POST', '/planea/admin/api/login', { body: { email: ADMIN_EMAIL, password: PW }, hdr: false })).status === 404, 'login sin cabecera propia: 404');
    ok((await call('POST', '/planea/admin/api/login', { body: { email: USER_EMAIL, password: PW } })).status === 401, 'usuario de Planea que no es admin no entra');
    ok((await call('POST', '/planea/admin/api/login', { body: { email: ADMIN_EMAIL, password: 'mala-clave-123' } })).status === 401, 'admin con clave equivocada no entra');
    const lg = await call('POST', '/planea/admin/api/login', { body: { email: ADMIN_EMAIL, password: PW } });
    ok(lg.status === 200 && /planea_admin=/.test(lg.cookie || ''), 'admin autorizado entra y recibe cookie');
    ok(/HttpOnly/i.test(lg.cookie || ''), 'la cookie admin es HttpOnly');
    const ac = (lg.cookie || '').split(';')[0];
    ok((await call('GET', '/planea/admin/api/users', { cookie: userCookie })).status === 404, 'la sesión normal de usuario no abre el admin');
    const forged = 'planea_admin=' + jwt.sign({ e: ADMIN_EMAIL }, 'otra-clave-cualquiera-123', { audience: 'planea-admin', expiresIn: '1h' });
    ok((await call('GET', '/planea/admin/api/users', { cookie: forged })).status === 404, 'una cookie admin firmada con otra clave no entra');

    // Usuarios
    const us = await call('GET', '/planea/admin/api/users', { cookie: ac });
    ok(us.status === 200 && Array.isArray(us.body.users), 'listado de usuarios responde');
    const mine = us.body.users && us.body.users.find((u) => u.email === USER_EMAIL);
    ok(!!mine, 'el usuario de prueba aparece');
    ok(us.body.users && !us.body.users.some((u) => u.email === ADMIN_EMAIL), 'los administradores no cuentan como usuarios de prueba');
    ok(mine && mine.onboarding.finished === true && !!mine.onboarding.finished_at, 'se ve que terminó el onboarding y cuándo');
    ok(mine && mine.score && mine.score.score === 61 && mine.score.pilares && mine.score.pilares.flujo === 70, 'se ve el Puntaje Planea por pilar');
    const raw = JSON.stringify(us.body);
    ok(!/monto|5200000|3100000/.test(raw), 'ningún monto sale en el listado');
    ok(!/password_hash|finance_meta|ingresos_data/.test(raw), 'ni claves ni datos financieros en el listado');

    // Métricas y señales del usuario
    ok((await call('POST', '/planea/api/v1/me/events', { body: { event: 'visit' } })).status === 401, 'evento sin sesión: 401');
    ok((await call('POST', '/planea/api/v1/me/events', { body: { event: 'borrar_todo' }, cookie: userCookie })).status === 400, 'evento no admitido: 400');
    ok((await call('POST', '/planea/api/v1/me/events', { body: { event: 'score_view' }, cookie: userCookie })).status === 200, 'score_view se registra');
    ok((await call('POST', '/planea/api/v1/me/events', { body: { event: 'score_view' }, cookie: userCookie })).status === 200, 'repetir el mismo día no falla');
    const [[evc]] = await sq.query("SELECT COUNT(*)::int AS n FROM planea_events WHERE tenant_id = 990918 AND user_id = :u AND event = 'score_view'", { replacements: { u: userRow.id } });
    ok(evc.n === 1, 'un solo evento por día');
    ok((await call('GET', '/planea/api/v1/me/nps', { cookie: userCookie })).body.answered === false, 'NPS aún sin responder');
    ok((await call('POST', '/planea/api/v1/me/nps', { body: { score: 11 }, cookie: userCookie })).status === 400, 'NPS 11 se rechaza');
    ok((await call('POST', '/planea/api/v1/me/nps', { body: { score: 9 }, cookie: userCookie })).status === 200, 'NPS 9 se guarda');
    ok((await call('POST', '/planea/api/v1/me/nps', { body: { score: 2 }, cookie: userCookie })).status === 409, 'NPS no se puede responder dos veces');
    const mt = await call('GET', '/planea/admin/api/metrics', { cookie: ac });
    ok(mt.status === 200 && Array.isArray(mt.body.metrics) && mt.body.metrics.length >= 3, 'métricas responden');
    ok(mt.status === 200 && Array.isArray(mt.body.funnel) && mt.body.funnel.length === 4, 'embudo de cuatro pasos');
    ok(mt.status === 200 && mt.body.metrics.some((m) => /bug/i.test(m.label) && m.value == null), 'bugs críticos se reportan como no medidos, no como cero');

    // Conocimiento de Maya
    const b64 = (s) => 'data:text/markdown;base64,' + Buffer.from(s).toString('base64');
    const up1 = await call('POST', '/planea/admin/api/kb', { cookie: ac, body: { name: 'Guía SIT', filename: 'guia.md', data_b64: b64('# Guía\nVersión uno del conocimiento de Maya para la prueba SIT.') } });
    ok(up1.status === 200 && up1.body.doc.version === 1, 'carga de Markdown crea versión 1');
    const up2 = await call('POST', '/planea/admin/api/kb', { cookie: ac, body: { name: 'guía sit', filename: 'guia.md', data_b64: b64('# Guía\nVersión dos, la que Maya debe leer ahora mismo.') } });
    ok(up2.status === 200 && up2.body.doc.version === 2 && up2.body.replaced === true, 'mismo nombre crea versión 2 y reemplaza');
    kb._cache.clear();
    let txt = await kb.activeText(sq, 990918);
    ok(/Versión dos/.test(txt) && !/Versión uno/.test(txt), 'Maya lee solo la versión activa');
    const inPrompt = await adminMod.mayaKnowledge(backend);
    ok(/DOCUMENTOS DE CONOCIMIENTO/.test(inPrompt) && /Versión dos/.test(inPrompt), 'el conocimiento activo entra al prompt de Maya');
    const big = await call('POST', '/planea/admin/api/kb', { cookie: ac, body: { name: 'Grande', filename: 'grande.txt', data_b64: 'data:text/plain;base64,' + Buffer.from('x'.repeat(1500)).toString('base64') } });
    ok(big.status === 413 && /tope/.test(big.body.message || ''), 'una carga por encima del tope se rechaza y dice por qué');
    const bin = await call('POST', '/planea/admin/api/kb', { cookie: ac, body: { name: 'Bin', filename: 'x.md', data_b64: 'data:text/plain;base64,' + Buffer.from([0x4d, 0x5a, 0, 1, 2, 3]).toString('base64') } });
    ok(bin.status === 415, 'un binario se rechaza');
    const noAdm = await call('POST', '/planea/admin/api/kb', { cookie: userCookie, body: { name: 'X', filename: 'x.md', data_b64: b64('intento de un usuario normal de subir conocimiento') } });
    ok(noAdm.status === 404, 'un usuario normal no puede subir conocimiento');
    const off = await call('POST', '/planea/admin/api/kb/' + up2.body.doc.id + '/deactivate', { cookie: ac });
    ok(off.status === 200, 'desactivar responde');
    txt = await kb.activeText(sq, 990918);
    ok(!/Versión dos/.test(txt), 'un documento desactivado ya no llega a Maya');
    const list = await call('GET', '/planea/admin/api/kb', { cookie: ac });
    ok(list.status === 200 && list.body.docs.length === 2 && list.body.docs.every((d) => !d.active), 'el historial conserva ambas versiones');
    ok(list.status === 200 && !('extracted_text' in (list.body.docs[0] || {})), 'el listado no devuelve el texto completo');

    // Calendario público
    adminMod._resetCalendarCache();
    const cal = await call('GET', '/planea/api/v1/tax/calendar');
    ok(cal.status === 200 && cal.body.reminder_days === 30, 'calendario público responde con días de aviso');
    const hasFile = fs.existsSync(path.join(__dirname, 'data', 'dian-calendar-' + T.todayColombia().slice(0, 4) + '.json'));
    ok(hasFile ? !!cal.body.table : cal.body.table === null, 'sin archivo DIAN la tabla es null (la app estima)');

    // Auditoría
    await new Promise((r) => setTimeout(r, 300));
    const [aud] = await sq.query('SELECT DISTINCT event FROM planea_audit_log WHERE lower(email) = :e', { replacements: { e: ADMIN_EMAIL } });
    const evs = aud.map((r) => r.event);
    ['admin.login', 'admin.view_users', 'admin.view_metrics', 'admin.kb_upload', 'admin.kb_deactivate'].forEach((e) => ok(evs.indexOf(e) >= 0, 'auditoría registra ' + e));

    // Revisión de seguridad
    const bigLogin = await call('POST', '/planea/admin/api/login', { body: { email: ADMIN_EMAIL, password: 'x'.repeat(20000) } });
    ok(bigLogin.status === 413, 'un cuerpo grande sin sesión admin se rechaza antes de procesarlo');
    for (let i = 0; i < 12; i++) await call('POST', '/planea/admin/api/login', { body: { email: 'sit-mvp-nadie-' + i + '@example.test', password: 'mala-clave-123' }, ip: '203.0.113.' + rnd() });
    const stillIn = await call('GET', '/planea/admin/api/me', { cookie: ac });
    ok(stillIn.status === 200, 'intentos a correos inventados no afectan al admin');
    const bSrc = fs.readFileSync(path.join(__dirname, 'backend.cjs'), 'utf8');
    ok(/!sent && process\.env\.NODE_ENV !== 'production'/.test(bSrc), 'el enlace de restablecimiento nunca vuelve al solicitante en producción');
    ok(!/x-forwarded-host[^\n]*reset\?token/.test(bSrc) && /PLANEA_PUBLIC_URL/.test(bSrc), 'el enlace de restablecimiento no usa el Host de la petición');
    await sq.query('UPDATE planea_users SET password_hash = :h WHERE id = :id', { replacements: { h: await bcrypt.hash(PW + '-nueva', 10), id: adminRow.id } });
    ok((await call('GET', '/planea/admin/api/me', { cookie: ac })).status === 404, 'cambiar la clave termina la sesión admin');
    await sq.query('UPDATE planea_users SET password_hash = :h WHERE id = :id', { replacements: { h: hash, id: adminRow.id } });

    // Quitar la fila corta el acceso de inmediato
    await sq.query('DELETE FROM planea_admins WHERE tenant_id = 990918 AND user_id = :u', { replacements: { u: adminRow.id } });
    ok((await call('GET', '/planea/admin/api/me', { cookie: ac })).status === 404, 'quitar al admin de planea_admins corta su sesión');
    await sq.query("INSERT INTO planea_admins (tenant_id, user_id, granted_by) VALUES (990918, :u, 'sit') ON CONFLICT DO NOTHING", { replacements: { u: adminRow.id } });
    ok(!/PLANEA_ADMIN_EMAILS/.test(fs.readFileSync(path.join(__dirname, 'admin.cjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')), 'no queda una lista de correos que dé permiso');

    // Salir
    const out = await call('POST', '/planea/admin/api/logout', { cookie: ac });
    ok(out.status === 200 && /planea_admin=;/.test(out.cookie || ''), 'salir borra la cookie');
  } finally {
    server.close();
    const ids = [adminRow.id, userRow.id];
    await sq.query('DELETE FROM planea_events WHERE user_id IN (:ids)', { replacements: { ids } }).catch(() => {});
    await sq.query('DELETE FROM planea_nps WHERE user_id IN (:ids)', { replacements: { ids } }).catch(() => {});
    await sq.query('DELETE FROM planea_kb_docs WHERE tenant_id = 990918').catch(() => {});
    await sq.query('DELETE FROM planea_admins WHERE tenant_id = 990918').catch(() => {});
    await sq.query("DELETE FROM planea_audit_log WHERE email LIKE 'sit-mvp-%' OR user_id IN (:ids)", { replacements: { ids } }).catch(() => {});
    await sq.query('DELETE FROM planea_profiles WHERE user_id IN (:ids)', { replacements: { ids } }).catch(() => {});
    await sq.query('DELETE FROM planea_users WHERE id IN (:ids)', { replacements: { ids } }).catch(() => {});
    const [[left]] = await sq.query("SELECT COUNT(*)::int AS n FROM planea_users WHERE email LIKE 'sit-mvp-%'");
    ok(left.n === 0, 'la SIT borró sus usuarios');
  }
  finish();
})().catch((e) => { console.error('SIT error:', e); fail++; finish(); });

function finish() {
  console.log('\nPLANEA MVP SIT: ' + pass + '/' + (pass + fail) + (fail ? '  FAILED: ' + fails.join(' | ') : ''));
  console.log('No cubierto: Maya con modelo real, despliegue en producción.');
  setTimeout(() => process.exit(fail ? 1 : 0), 200);
}
