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
  ok(T.forDigits('37', null, 2026) === null && T.reminder('37', null, '2026-09-01', 30) === null, 'sin tabla DIAN validada no hay fecha ni aviso (no hay ventana estimada)');
  ok(!/estimada|WINDOWS/.test(fs.readFileSync(path.join(__dirname, 'portal', 'planea-tax.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//, '')), 'el módulo de impuestos ya no trae ventanas estimadas');
  ok(T.forDigits('00', { ranges: [{ from: 99, to: 100, date: '2026-10-26' }] }, 2026).date === '2026-10-26', '"00" se trata como 100');
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

  // ── 1b. Calendario oficial DIAN 2026 y avisos por correo (puro) ─────────────
  const dian = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'dian-calendar-formato-ejemplo.json'), 'utf8'));
  ok(!fs.readdirSync(path.join(__dirname, 'data')).some((n) => /^dian-calendar-\d{4}\.json$/.test(n)), 'ningún archivo del repositorio es fuente de fechas DIAN');
  ok(!/dian-calendar-|readFileSync\([^)]*data/.test(fs.readFileSync(path.join(__dirname, 'admin.cjs'), 'utf8')), 'el servidor no lee fechas DIAN de un archivo');
  ok(T.validTable(dian) && dian.ranges.length === 50, 'tabla DIAN 2026 válida con 50 rangos');
  let nxt = 1, weekdays = true, ordered = true;
  dian.ranges.forEach((r, i) => { if (r.from !== nxt) nxt = -999; nxt = r.to + 1; const wd = new Date(r.date + 'T12:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) weekdays = false; if (i && r.date <= dian.ranges[i - 1].date) ordered = false; });
  ok(nxt === 101 && weekdays && ordered, 'la tabla cubre 01 a 00 sin huecos, en días hábiles y en orden');
  ok(T.forDigits('01', dian, 2026).date === '2026-08-12' && T.forDigits('00', dian, 2026).date === '2026-10-26' && T.forDigits('67', dian, 2026).date === '2026-10-01', 'fechas del Decreto 2229 de 2023: 01 el 12-ago, 67 el 1-oct, 00 el 26-oct');
  ok(/Decreto 2229 de 2023/.test(dian.source), 'la tabla cita su fuente');
  const TN = require('./tax-notify.cjs');
  const person = (fm) => [{ user_id: 1, email: 'a@example.test', full_name: 'Ana', finance_meta: fm }];
  const on67 = { notif: { tributarias: true }, tributario: { cedula2: '67' } };
  ok(TN.dueToday(person(on67), dian, '2026-09-01', T, [30, 7, 1]).length === 1, 'aviso 30 días antes');
  ok(TN.dueToday(person(on67), dian, '2026-09-24', T, [30, 7, 1]).length === 1 && TN.dueToday(person(on67), dian, '2026-09-30', T, [30, 7, 1]).length === 1, 'aviso 7 días y 1 día antes');
  ok(TN.dueToday(person(on67), dian, '2026-09-02', T, [30, 7, 1]).length === 0, 'ningún aviso en otros días');
  ok(TN.dueToday(person({ notif: { tributarias: false }, tributario: { cedula2: '67' } }), dian, '2026-09-24', T, [30, 7, 1]).length === 0, 'quien no encendió el aviso no recibe correo');
  ok(TN.dueToday(person({ notif: { tributarias: true } }), dian, '2026-09-24', T, [30, 7, 1]).length === 0, 'sin dígitos de cédula no hay correo');
  ok(TN.dueToday(person(on67), null, '2026-09-24', T, [30, 7, 1]).length === 0, 'sin tabla oficial no se envía una fecha estimada por correo');
  const msg = TN.message({ name: '<script>x', digits: '67', date: '2026-10-01', label: '1 de octubre de 2026', days_left: 7 }, dian);
  ok(/1 de octubre de 2026/.test(msg.text) && /Decreto 2229 de 2023/.test(msg.text) && /configuracion/.test(msg.text), 'el correo dice la fecha, la fuente y cómo apagarlo');
  ok(!/<script>/.test(msg.html) && /^Hola,/.test(msg.text), 'un nombre raro no entra al correo');
  ok(/no determina si estás obligado/.test(msg.text) && !/debes declarar el|estás obligado a declarar\./.test(msg.text), 'el correo no afirma que la persona esté obligada a declarar');
  ok(TN.enabled() === false, 'los avisos no corren fuera de producción');

  // ── 1c. Carga de la tabla DIAN (formato estándar, revisión completa) ──
  const dianM = require('./dian.cjs');
  const csv = 'desde,hasta,fecha\n' + dian.ranges.map((r) => [r.from === 100 ? '00' : String(r.from).padStart(2, '0'), r.to === 100 ? '00' : String(r.to).padStart(2, '0'), r.date].join(',')).join('\n');
  const pOk = dianM.parse(csv, { year: 2026, decree: 'Decreto SIT de 2025' });
  ok(pOk.table && pOk.table.ranges.length === 50 && pOk.table.tax_year === 2025, 'un CSV completo se acepta');
  ok(!dianM.parse(csv, { year: 2026 }).table, 'sin decreto no se acepta');
  ok(dianM.parse(csv.replace(/\n03,04,[^\n]+/, ''), { year: 2026, decree: 'Decreto SIT de 2025' }).errors.some((e) => /Falta el grupo 03/.test(e)), 'un hueco en los dígitos se rechaza y se nombra');
  ok(dianM.parse(csv.replace('2026-08-12', '2026-08-15'), { year: 2026, decree: 'Decreto SIT de 2025' }).errors.some((e) => /fin de semana/.test(e)), 'una fecha en fin de semana se rechaza');
  ok(dianM.parse(csv, { year: 2027, decree: 'Decreto SIT de 2025' }).errors.some((e) => /no cae en 2027/.test(e)), 'fechas de otro año se rechazan');
  ok(dianM.parse(csv + '\n05,06,2026-10-27', { year: 2026, decree: 'Decreto SIT de 2025' }).errors.length > 0, 'un grupo repetido se rechaza');
  ok(dianM.parse(JSON.stringify(Object.assign({}, dian, { decree: 'Decreto SIT de 2025' })), {}).table, 'el JSON de ejemplo también se acepta');
  ok(/CALENDARIO TRIBUTARIO DIAN 2026/.test(dianM.knowledgeBlock(Object.assign({ decree: 'Decreto SIT' }, pOk.table))) && dianM.knowledgeBlock(null) === '', 'la tabla validada entra al conocimiento de Maya');

  // ── 1d. Las 20 respuestas en palabras y el Calendario Planea (puro) ──
  ok(adminMod.SURVEY && adminMod.SURVEY.length === 20, 'las 20 preguntas se leen de la encuesta');
  const ra = adminMod.readableAnswers({ edad: 'e2', deuda_tipos: ['tarjeta', 'libre'], rango_ingresos: 'i3', monto_ingresos: 5200000 });
  ok(ra.length === 20 && ra[0].answer === '30–39' && /Tarjeta de crédito · Préstamo/.test(ra[6].answer), 'cada pregunta muestra la opción elegida en palabras');
  ok(ra[17].answer === 'Entre $3.000.000 y $6.000.000' && ra[17].exact_given === true && !/5200000|5\.200\.000/.test(JSON.stringify(ra)), 'la cifra exacta opcional no se muestra, solo que existe');
  ok(ra[1].answer === 'No aplica / sin respuesta', 'una pregunta sin respuesta lo dice');
  const tbl = Object.assign({ decree: 'Decreto SIT' }, pOk.table);
  const cf = adminMod.calendarFor([{ id: 'g1', name: 'Viaje', fecha_objetivo: '2026-09-25' }, { id: 'g2', name: 'Sin fecha' }, { id: 'g3', name: 'Archivada', fecha_objetivo: '2026-09-26', estado: 'archivada' }], { tributario: { cedula2: '67' } }, tbl, '2026-09-21', 30);
  ok(cf.events.length === 2 && cf.events.some((e) => e.origin === 'meta' && e.title === 'Viaje') && cf.events.some((e) => e.origin === 'renta' && e.date === '2026-10-01'), 'el calendario junta metas con fecha y la fecha de renta');
  ok(cf.notices.length === 2 && cf.notices[0].days_left === 4, 'lo próximo genera un aviso en la app');
  ok(adminMod.calendarFor([], { tributario: { cedula2: '67' } }, null, '2026-09-21', 30).renta.status === 'sin_calendario' && !adminMod.calendarFor([], { tributario: { cedula2: '67' } }, null, '2026-09-21', 30).events.length, 'sin tabla validada el calendario no muestra fecha de renta');
  ok(adminMod.calendarFor([], {}, tbl, '2026-09-21', 30).renta.status === 'sin_digitos', 'sin dígitos de cédula lo pide');
  ok(adminMod.calendarFor([], { tributario: { cedula2: '67' } }, tbl, '2026-08-01', 30).notices.length === 0, 'la renta lejana no genera aviso todavía');

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
  ok(!/\/conversations|chat_history|maya_messages/i.test(pageSrc + adminSrc), 'el admin no pide conversaciones de usuarios con Maya');
  const trainSrc = adminSrc.match(/api\.post\('\/train\/chat'[\s\S]*?\n  \}\);/)[0];
  ok(!/INSERT|kb\.|addRule/.test(trainSrc.replace(/kb\._cache|kb\.promptBlock|kb\.activeText/g, '')), 'el chat de entrenamiento no guarda la conversación');
  ok(!/ingresos_data|gastos_data|assets_data|liabilities_data|seguros_data|retiro_data|net_worth/.test(adminSrc), 'el módulo admin no lee columnas de montos');
  ok(!/SELECT[^;]*\b(value|monthly)\b[^;]*FROM planea_items/.test(adminSrc), 'de planea_items solo se cuentan registros, nunca valores');
  ok(!/sendgrid|twilio|nodemailer/i.test(adminSrc + fs.readFileSync(path.join(__dirname, 'portal', 'planea-avisos.js'), 'utf8')), 'los avisos de la app no envían mensajes');
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
  const ADMIN2_EMAIL = 'sit-mvp-admin2-' + RUN + '@example.test';
  const [[admin2Row]] = await sq.query("INSERT INTO planea_users (email, password_hash, full_name, created_at, updated_at) VALUES (:e, :h, 'SIT Admin 2', NOW(), NOW()) RETURNING id", { replacements: { e: ADMIN2_EMAIL, h: hash } });
  const [[dropRow]] = await sq.query("INSERT INTO planea_users (email, password_hash, full_name, created_at, updated_at) VALUES (:e, :h, 'SIT Abandono', NOW(), NOW()) RETURNING id", { replacements: { e: 'sit-mvp-drop-' + RUN + '@example.test', h: hash } });
  const sd = { score: 61, rango: 'En construcción', pilares: { flujo: 70, deuda: 50 }, answers: { edad: '35-44', monto_ingresos: 5200000, monto_gastos: 3100000, deudas: 'si' }, history: [{ score: 61, at: new Date().toISOString(), source: 'onboarding' }] };
  await sq.query("INSERT INTO planea_profiles (user_id, full_name, score_data, created_at, updated_at) VALUES (:u, 'SIT Usuario', CAST(:s AS JSONB), NOW(), NOW()) ON CONFLICT (user_id) DO UPDATE SET score_data = EXCLUDED.score_data", { replacements: { u: userRow.id, s: JSON.stringify(sd) } });

  const app = express();
  // Modelo FALSO: registra la instrucción recibida y responde según traiga o no documentos.
  const mayaCalls = [];
  const chatCalls = [];
  const fakeFetch = async (url, opt) => { const b = JSON.parse(opt.body); if (b.messages.length > 1 || /entrenamiento/.test(b.messages[0].content)) { chatCalls.push(b); return { ok: true, json: async () => ({ content: [{ text: 'Respuesta de entrenamiento' }] }) }; } mayaCalls.push(b.system); return { ok: true, json: async () => ({ content: [{ text: /DOCUMENTOS DE CONOCIMIENTO/.test(b.system) ? 'Según el documento: versión dos. <accion>{}</accion>' : 'No tengo ese dato.' }] }) }; };
  const built = adminMod.build({ backend, sec, mayaSystem: () => 'REGLAS BASE DE MAYA', mayaModel: 'fake-model', fetchImpl: fakeFetch });
  app.use('/planea/admin', built.admin);
  app.use('/planea/api/v1', built.me);
  app.use('/planea/api/v1', backend.build());
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const SESSION_SECRET = process.env.PLANEA_JWT_SECRET || process.env.JWT_SECRET || 'planea-2026-secret';
  const userCookie = 'planea_session=' + jwt.sign({ id: userRow.id, email: USER_EMAIL, name: 'SIT Usuario' }, SESSION_SECRET, { expiresIn: '1h' });
  const dropCookie = 'planea_session=' + jwt.sign({ id: dropRow.id, email: 'sit-mvp-drop@example.test', name: 'SIT Abandono' }, SESSION_SECRET, { expiresIn: '1h' });
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
    ok(mine && Array.isArray(mine.answers) && mine.answers.length === 20 && mine.answers[0].question === '¿En qué rango de edad estás?', 'las respuestas salen como las 20 preguntas con su opción');
    const raw = JSON.stringify(us.body);
    ok(!/monto|5200000|3100000/.test(raw), 'ningún monto sale en el listado');
    ok(!/password_hash|finance_meta|ingresos_data/.test(raw), 'ni claves ni datos financieros en el listado');

    // Lista de usuarios: todas las cuentas, solo lectura, sin montos
    await sq.query("INSERT INTO planea_items (user_id, category, name, type, value, monthly, meta, created_at, updated_at) VALUES (:u, 'ingreso', 'Salario SIT', 'fijo', 5200000, 5200000, '{}'::jsonb, NOW(), NOW())", { replacements: { u: userRow.id } });
    const accs = await call('GET', '/planea/admin/api/accounts', { cookie: ac });
    ok(accs.status === 200 && Array.isArray(accs.body.users), 'lista de usuarios responde');
    const aU = accs.body.users && accs.body.users.find((u) => u.id === userRow.id);
    const aA = accs.body.users && accs.body.users.find((u) => u.id === adminRow.id);
    ok(!!aU && !!aA && aA.is_admin === true && aU.is_admin === false, 'la lista incluye a todos y marca a los administradores');
    ok(aU && aU.data.modules.some((m) => m.category === 'ingreso' && m.records === 1), 'se ve cuántos registros tiene por módulo');
    ok(aU && aU.account && typeof aU.account.logins_ok === 'number' && aU.onboarding.finished === true, 'se ve la cuenta, los ingresos y el onboarding');
    const accRaw = JSON.stringify(accs.body);
    ok(!/5200000|3100000|monto|Salario SIT/.test(accRaw), 'la lista no muestra montos ni nombres de registros financieros');
    ok(!/password_hash|reset_token|ip_hash|user_agent|data_b64/.test(accRaw), 'la lista no muestra claves, tokens, IP ni documentos');
    ok((await call('POST', '/planea/admin/api/accounts', { cookie: ac, body: {} })).status === 404, 'la lista es solo lectura');
    ok((await call('GET', '/planea/admin/api/accounts', { cookie: userCookie })).status === 404, 'un usuario normal no ve la lista');

    // Carga de documentos de impuestos: DESACTIVADA en el MVP
    const upl = await call('POST', '/planea/api/v1/me/tax-docs', { cookie: userCookie, body: { filename: 'x.pdf', mime: 'application/pdf', data_b64: Buffer.from('%PDF-1.4 sit').toString('base64') } });
    ok(upl.status === 410, 'subir documentos de impuestos está desactivado');
    const [[td]] = await sq.query('SELECT COUNT(*)::int AS n FROM planea_tax_docs WHERE user_id = :u', { replacements: { u: userRow.id } });
    ok(td.n === 0, 'no se guardó ningún documento');
    const impHtml = fs.readFileSync(path.join(__dirname, 'portal', 'impuestos.html'), 'utf8');
    ok(!/type="file"|tx-up-btn/.test(impHtml), 'la página de Impuestos no ofrece subir archivos');
    ok((await call('GET', '/planea/api/v1/me/tax-docs', { cookie: userCookie })).status === 200, 'quien ya había subido algo aún puede ver su lista');

    // Progreso del onboarding: dónde se quedan y cuánto tardan
    ok((await call('POST', '/planea/api/v1/me/onboarding', { body: { step: 1, key: 'edad' } })).status === 401, 'progreso sin sesión: 401');
    ok((await call('POST', '/planea/api/v1/me/onboarding', { cookie: userCookie, body: { step: 0, key: 'edad' } })).status === 400, 'paso inválido: 400');
    ok((await call('POST', '/planea/api/v1/me/onboarding', { cookie: userCookie, body: { step: 2, key: 'x; DROP' } })).status === 400, 'clave inválida: 400');
    ok((await call('POST', '/planea/api/v1/me/onboarding', { cookie: userCookie, body: { step: 1, key: 'edad', title: '¿En qué rango de edad estás?' } })).status === 200, 'la primera pregunta se registra');
    await sq.query("UPDATE planea_onboarding_progress SET started_at = NOW() - INTERVAL '10 minutes' WHERE tenant_id = 990918 AND user_id = :u", { replacements: { u: userRow.id } });
    ok((await call('POST', '/planea/api/v1/me/onboarding', { cookie: userCookie, body: { done: true } })).status === 200, 'terminar la encuesta se registra');
    await call('POST', '/planea/api/v1/me/onboarding', { cookie: userCookie, body: { step: 5, key: 'ingresos' } });
    const [[pr]] = await sq.query('SELECT last_step, completed_at FROM planea_onboarding_progress WHERE tenant_id = 990918 AND user_id = :u', { replacements: { u: userRow.id } });
    ok(pr && pr.last_step === 1 && pr.completed_at, 'repetir la encuesta después de terminar no cambia lo medido');
    for (const s of [1, 2, 3, 4]) await call('POST', '/planea/api/v1/me/onboarding', { cookie: dropCookie, body: { step: s, key: 'q' + s, title: 'Pregunta SIT ' + s + ' <b>' } });
    await sq.query("UPDATE planea_onboarding_progress SET last_step_at = NOW() - INTERVAL '2 days' WHERE tenant_id = 990918 AND user_id = :u", { replacements: { u: dropRow.id } });
    await call('POST', '/planea/api/v1/me/events', { body: { event: 'visit' }, cookie: userCookie });
    const us2 = await call('GET', '/planea/admin/api/users', { cookie: ac });
    const mine2 = us2.body.users.find((u) => u.id === userRow.id), drop2 = us2.body.users.find((u) => u.id === dropRow.id);
    ok(mine2 && mine2.onboarding.minutes >= 9.9 && mine2.onboarding.minutes <= 10.2, 'se ve cuántos minutos tardó en terminar');
    ok(mine2 && mine2.last_visit === T.todayColombia(), 'usuarios de prueba muestran el último día de visita');
    ok(drop2 && drop2.last_visit === null, 'sin visitas ni ingresos, la última visita queda vacía, no inventada');
    ok(drop2 && drop2.onboarding.stopped_at && drop2.onboarding.stopped_at.step === 4, 'se ve en qué pregunta se quedó quien no terminó');
    ok(drop2 && !/<b>/.test(drop2.onboarding.stopped_at.title || ''), 'el título guardado no lleva marcas HTML');
    const mt2 = await call('GET', '/planea/admin/api/metrics', { cookie: ac });
    ok(mt2.status === 200 && Array.isArray(mt2.body.dropoff) && mt2.body.dropoff.some((d) => d.step === 4 && d.count >= 1), 'las métricas muestran la pregunta donde abandonan');
    const tm = mt2.body.metrics && mt2.body.metrics.find((m) => m.key === 'onboarding_time');
    ok(tm && typeof tm.value === 'number', 'las métricas muestran el tiempo del onboarding');
    ok(!/respuesta|answer/i.test(fs.readFileSync(path.join(__dirname, 'admin.cjs'), 'utf8').match(/me\.post\('\/me\/onboarding'[\s\S]*?\n  \}\);/)[0].replace(/\/\/[^\n]*/g, '')), 'el progreso nunca guarda respuestas');

    // Envío de avisos: una sola vez por aviso, con envío falso (nunca un correo real)
    await sq.query("UPDATE planea_profiles SET finance_meta = CAST(:m AS JSONB) WHERE user_id = :u", { replacements: { u: userRow.id, m: JSON.stringify({ notif: { tributarias: true }, tributario: { cedula2: '67' } }) } });
    const sentTo = [];
    const fakeSend = async (to) => { sentTo.push(to); return { ok: true }; };
    const when = new Date('2026-09-24T15:00:00Z');
    const deps = { db: () => sq, PlaneaTax: T, dianTable: () => dian, send: fakeSend, now: when };
    const run1 = await TN.runOnce(deps);
    ok(run1.sent >= 1 && sentTo.indexOf(USER_EMAIL) >= 0, 'el aviso de 7 días se envía a quien lo pidió');
    const before = sentTo.length;
    const run2 = await TN.runOnce(deps);
    ok(run2.sent === 0 && sentTo.length === before, 'el mismo aviso no se envía dos veces');
    const [[nrow]] = await sq.query("SELECT status FROM planea_notifications WHERE tenant_id = 990918 AND user_id = :u AND ref = '2026:7'", { replacements: { u: userRow.id } });
    ok(nrow && nrow.status === 'sent', 'queda registro de cada aviso enviado');

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
    // Probar a Maya: la misma instrucción base + los documentos activos, comparada sin ellos
    const prevKey = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = 'sit-fake-key';
    ok((await call('POST', '/planea/admin/api/kb/test', { cookie: ac, body: { question: '  ' } })).status === 400, 'probar a Maya sin pregunta: 400');
    ok((await call('POST', '/planea/admin/api/kb/test', { cookie: userCookie, body: { question: 'x' } })).status === 404, 'un usuario normal no puede probar a Maya');
    const probe = await call('POST', '/planea/admin/api/kb/test', { cookie: ac, body: { question: '¿Qué dice la guía?' } });
    ok(probe.status === 200 && probe.body.docs.some((d) => /gu/i.test(d.name) && d.version === 2), 'la prueba lista los documentos activos enviados');
    ok(mayaCalls.length === 2 && mayaCalls.every((s) => s.indexOf('REGLAS BASE DE MAYA') === 0), 'las dos respuestas usan las reglas de Maya de la app');
    ok(mayaCalls.some((s) => /Versión dos/.test(s)) && mayaCalls.some((s) => !/DOCUMENTOS DE CONOCIMIENTO/.test(s)), 'una lleva los documentos y la otra no');
    ok(!mayaCalls.some((s) => /Versión uno/.test(s)), 'la versión desactivada no llega a Maya en la prueba');
    ok(probe.body.with_docs.ok && /versión dos/.test(probe.body.with_docs.reply) && !/<accion>/.test(probe.body.with_docs.reply), 'la respuesta con documentos se muestra limpia');
    ok(probe.body.without_docs && /No tengo/.test(probe.body.without_docs.reply), 'la respuesta sin documentos se muestra al lado');
    const sent = await call('GET', '/planea/admin/api/kb/sent', { cookie: ac });
    ok(sent.status === 200 && /Versión dos/.test(sent.body.block) && !/Versión uno/.test(sent.body.block), 'se puede ver exactamente lo que Maya recibe');
    delete process.env.ANTHROPIC_API_KEY;
    const nokey = await call('POST', '/planea/admin/api/kb/test', { cookie: ac, body: { question: 'x' } });
    ok(nokey.status === 200 && nokey.body.with_docs.ok === false && /ANTHROPIC_API_KEY/.test(nokey.body.with_docs.reason), 'sin clave del modelo la prueba lo dice, no inventa una respuesta');
    if (prevKey) process.env.ANTHROPIC_API_KEY = prevKey;
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

    // Entrenar a Maya: chat + corrección guardada como regla, editable y desactivable
    process.env.ANTHROPIC_API_KEY = 'sit-fake-key';
    ok((await call('POST', '/planea/admin/api/train/chat', { cookie: userCookie, body: { messages: [{ role: 'user', content: 'hola' }] } })).status === 404, 'un usuario normal no entra al chat de entrenamiento');
    const ch = await call('POST', '/planea/admin/api/train/chat', { cookie: ac, body: { messages: [{ role: 'user', content: 'pregunta de entrenamiento' }, { role: 'assistant', content: 'x' }, { role: 'user', content: '¿y el ahorro?' }] } });
    ok(ch.status === 200 && ch.body.ok && ch.body.reply === 'Respuesta de entrenamiento' && chatCalls.length === 1 && chatCalls[0].messages.length === 3 && chatCalls[0].system.indexOf('REGLAS BASE DE MAYA') === 0, 'el chat usa las reglas de Maya y conserva la conversación');
    const rule = await call('POST', '/planea/admin/api/train/rule', { cookie: ac, body: { question: '¿Cuánto debo ahorrar al mes?', wrong_answer: 'Ahorra el 50 %', correction: 'Planea no indica un porcentaje fijo; invita a registrar ingresos y gastos para ver el propio.' } });
    ok(rule.status === 200 && rule.body.doc.kind === 'rule' && rule.body.doc.uploaded_by === ADMIN_EMAIL && !!rule.body.doc.created_at, 'la corrección se guarda como regla con autor y fecha');
    kb._cache.clear();
    let kt = await kb.activeText(sq, 990918);
    ok(/CORRECCIONES DEL EQUIPO/.test(kt) && /no indica un porcentaje fijo/.test(kt) && !/Ahorra el 50/.test(kt), 'Maya recibe la corrección y nunca la respuesta equivocada');
    ok(kt.indexOf('CORRECCIONES DEL EQUIPO') === 0, 'las correcciones van antes que los documentos');
    const ed = await call('POST', '/planea/admin/api/kb/' + rule.body.doc.id + '/edit', { cookie: ac, body: { text: 'Cuando pregunten cuánto ahorrar: Planea no fija un porcentaje; muestra el propio con ingresos y gastos.' } });
    ok(ed.status === 200 && ed.body.doc.version === 2 && ed.body.doc.kind === 'rule', 'editar una regla crea una versión nueva');
    const oldV = await call('GET', '/planea/admin/api/kb/' + rule.body.doc.id, { cookie: ac });
    ok(oldV.status === 200 && oldV.body.doc.active === false && oldV.body.doc.meta && oldV.body.doc.meta.wrong_answer === 'Ahorra el 50 %', 'la versión anterior queda en el historial con la pregunta y la respuesta marcada');
    ok((await call('POST', '/planea/admin/api/kb/' + rule.body.doc.id + '/edit', { cookie: ac, body: { text: 'otra edición sobre una versión vieja' } })).status === 409, 'solo se edita la versión activa');
    ok((await call('POST', '/planea/admin/api/kb/' + ed.body.doc.id + '/deactivate', { cookie: ac })).status === 200, 'una regla se puede desactivar');
    kb._cache.clear(); kt = await kb.activeText(sq, 990918);
    ok(!/porcentaje/.test(kt), 'una regla desactivada ya no llega a Maya');
    delete process.env.ANTHROPIC_API_KEY;
    if (prevKey) process.env.ANTHROPIC_API_KEY = prevKey;

    // Calendario DIAN: cargar, validar (otro admin), única fuente
    adminMod._resetCalendarCache();
    let cal = await call('GET', '/planea/api/v1/tax/calendar');
    ok(cal.status === 200 && cal.body.reminder_days === 30 && cal.body.table === null, 'sin tabla validada el calendario público no da fechas');
    const bad = await call('POST', '/planea/admin/api/dian', { cookie: ac, body: { year: 2026, decree: 'Decreto SIT de 2025', text: csv.replace(/\n03,04,[^\n]+/, '') } });
    ok(bad.status === 422 && bad.body.errors.some((e) => /Falta el grupo 03/.test(e)), 'una tabla con huecos no se guarda y dice por qué');
    const yr = +T.todayColombia().slice(0, 4);
    const csvY = csv.replace(/2026-/g, yr + '-');
    const ld = await call('POST', '/planea/admin/api/dian', { cookie: ac, body: { year: yr, decree: 'Decreto SIT de 2025', text: csvY } });
    const weekendFree = ld.status === 200;
    ok(ld.status === 200 || (ld.status === 422 && yr !== 2026), 'una tabla completa se guarda como borrador');
    if (weekendFree) {
      adminMod._resetCalendarCache();
      ok((await call('GET', '/planea/api/v1/tax/calendar')).body.table === null, 'un borrador no se muestra a los usuarios');
      ok((await call('POST', '/planea/admin/api/dian/' + ld.body.calendar.id + '/validate', { cookie: ac })).status === 409, 'quien cargó la tabla no la puede validar');
      await sq.query("INSERT INTO planea_admins (tenant_id, user_id, granted_by) VALUES (990918, :u, 'sit') ON CONFLICT DO NOTHING", { replacements: { u: admin2Row.id } });
      const lg2 = await call('POST', '/planea/admin/api/login', { body: { email: ADMIN2_EMAIL, password: PW } });
      const ac2 = (lg2.cookie || '').split(';')[0];
      ok((await call('POST', '/planea/admin/api/dian/' + ld.body.calendar.id + '/validate', { cookie: ac2 })).status === 200, 'otro administrador la valida');
      cal = await call('GET', '/planea/api/v1/tax/calendar');
      ok(cal.body.table && cal.body.table.ranges.length === 50 && cal.body.table.source === 'Decreto SIT de 2025', 'validada, la tabla es la fuente de fechas');
      await sq.query("UPDATE planea_profiles SET finance_meta = CAST(:m AS JSONB), goals = CAST(:g AS JSONB) WHERE user_id = :u", { replacements: { u: userRow.id, m: JSON.stringify({ tributario: { cedula2: '67' } }), g: JSON.stringify([{ id: 'gs', name: 'Meta SIT', fecha_objetivo: T.todayColombia() }]) } });
      const mc = await call('GET', '/planea/api/v1/me/calendar', { cookie: userCookie });
      ok(mc.status === 200 && mc.body.events.some((e) => e.origin === 'renta') && mc.body.events.some((e) => e.origin === 'meta' && e.title === 'Meta SIT') && mc.body.notices.some((n) => n.title === 'Meta SIT'), 'el Calendario Planea del usuario trae su renta, su meta y el aviso');
      ok((await call('GET', '/planea/api/v1/me/calendar')).status === 401, 'el calendario pide sesión');
      const kp = await adminMod.mayaKnowledge(backend);
      ok(/CALENDARIO TRIBUTARIO DIAN/.test(kp) && /Decreto SIT de 2025/.test(kp), 'Maya recibe la tabla validada');
      const ld2 = await call('POST', '/planea/admin/api/dian', { cookie: ac, body: { year: yr, decree: 'Decreto SIT corregido', text: csvY } });
      await call('POST', '/planea/admin/api/dian/' + ld2.body.calendar.id + '/validate', { cookie: ac2 });
      const dl = await call('GET', '/planea/admin/api/dian', { cookie: ac });
      ok(dl.body.calendars.filter((c) => c.status === 'validated').length === 1 && dl.body.current.decree === 'Decreto SIT corregido', 'validar una nueva retira la anterior del mismo año');
      await call('POST', '/planea/admin/api/dian/' + ld2.body.calendar.id + '/discard', { cookie: ac });
      ok((await call('GET', '/planea/api/v1/tax/calendar')).body.table === null, 'retirar la tabla validada deja a los usuarios sin fecha');
    } else console.log('  (año ' + yr + ': la tabla de ejemplo cae en fin de semana; validación HTTP NO cubierta)');

    // Auditoría
    await new Promise((r) => setTimeout(r, 300));
    const [aud] = await sq.query('SELECT DISTINCT event FROM planea_audit_log WHERE lower(email) = :e', { replacements: { e: ADMIN_EMAIL } });
    const evs = aud.map((r) => r.event);
    ['admin.login', 'admin.view_users', 'admin.view_metrics', 'admin.kb_upload', 'admin.kb_deactivate', 'admin.view_accounts', 'admin.kb_test', 'admin.train_chat', 'admin.train_rule', 'admin.kb_edit', 'admin.dian_load'].forEach((e) => ok(evs.indexOf(e) >= 0, 'auditoría registra ' + e));

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
    const ids = [adminRow.id, admin2Row.id, userRow.id, dropRow.id];
    await sq.query('DELETE FROM planea_dian_calendars WHERE tenant_id = 990918').catch(() => {});
    await sq.query('DELETE FROM planea_events WHERE user_id IN (:ids)', { replacements: { ids } }).catch(() => {});
    await sq.query('DELETE FROM planea_nps WHERE user_id IN (:ids)', { replacements: { ids } }).catch(() => {});
    await sq.query('DELETE FROM planea_kb_docs WHERE tenant_id = 990918').catch(() => {});
    await sq.query('DELETE FROM planea_admins WHERE tenant_id = 990918').catch(() => {});
    await sq.query('DELETE FROM planea_notifications WHERE tenant_id = 990918').catch(() => {});
    await sq.query("DELETE FROM planea_audit_log WHERE email LIKE 'sit-mvp-%' OR user_id IN (:ids)", { replacements: { ids } }).catch(() => {});
    await sq.query('DELETE FROM planea_onboarding_progress WHERE user_id IN (:ids)', { replacements: { ids } }).catch(() => {});
    await sq.query('DELETE FROM planea_items WHERE user_id IN (:ids)', { replacements: { ids } }).catch(() => {});
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
