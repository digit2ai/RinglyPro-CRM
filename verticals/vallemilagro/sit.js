'use strict';
/**
 * Valle Milagro · SIT. Sin llaves externas: el correo y el modelo son falsos,
 * inyectados. Usa un inquilino de prueba (990977) y borra todo lo que crea.
 *
 *   node -e "require('dotenv').config();require('./verticals/vallemilagro/sit.js')"
 *
 * NO cubre: un modelo real, una búsqueda web real, la entrega real del correo
 * y el diseño comparado contra el prototipo. Eso se verifica en producción.
 */
process.env.VALLEMILAGRO_TENANT_ID = '990977';
process.env.VALLEMILAGRO_SESSION_SECRET = 'sit-secret-valle-milagro-0123456789';
process.env.VALLEMILAGRO_FOUNDER_EMAIL = 'sit-founder@vallemilagro.test';
process.env.VALLEMILAGRO_SCOUT = 'off';
process.env.VALLEMILAGRO_SEED_DEMO = 'on';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SENDGRID_API_KEY;

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const T = 990977;
const dbm = require('./src/db');
const core = require('./src/core');
const agents = require('./src/agents');
const llm = require('./src/llm');
const mail = require('./src/mail');
const router = require('./src/index');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; } else { fail++; console.log('  FALLA  ' + name + (extra ? '  -> ' + extra : '')); } };

const sentMail = [];
mail._setSender(async (m) => { sentMail.push(m); });
const lastCode = (to) => { const m = [...sentMail].reverse().find((x) => x.to === to); return m ? { code: /(\d{6})/.exec(m.subject)[1], token: /entrar\?t=([a-f0-9]{64})/.exec(m.text)[1] } : null; };

const fake = { next: null, calls: [] };
const fakeClient = { messages: { create: async (params) => { fake.calls.push(params); const r = typeof fake.next === 'function' ? fake.next(params) : fake.next; if (r instanceof Error) throw r; return r || { content: [{ type: 'text', text: '' }], stop_reason: 'end_turn' }; } } };
const say = (text) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

async function cleanup() {
  for (const t of ['vm_audit', 'vm_job_runs', 'vm_texts', 'vm_editions', 'vm_findings', 'vm_scout_runs', 'vm_scout_directives', 'vm_kb_docs', 'vm_home_photos', 'vm_files', 'vm_submissions',
    'vm_follows', 'vm_interests', 'vm_projects', 'vm_consents', 'vm_sessions', 'vm_login_codes', 'vm_admins', 'vm_counters', 'vm_members']) {
    await dbm.run(`DELETE FROM ${t} WHERE tenant_id = :t`, { t: T });
  }
}

(async () => {
  await dbm.init();
  await cleanup();
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(['/vallemilagro', '/ValleMilagro'], router);
  const server = http.createServer(app).listen(0);
  const port = server.address().port;
  const B = 'http://127.0.0.1:' + port + '/vallemilagro';
  const req = async (method, p, { body, cookie, headers = {}, raw } = {}) => {
    const h = { 'X-VM': '1', ...headers }; if (cookie) h.Cookie = cookie; if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(B + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const set = r.headers.get('set-cookie');
    let json = null, text = null; if (raw) text = await r.text(); else { try { json = await r.json(); } catch (e) { json = null; } }
    return { status: r.status, json, text, cookie: set ? set.split(';')[0] : null, headers: r.headers };
  };
  const adm = (method, p, cookie, body) => req(method, '/api/v1/admin' + p, { cookie, body, headers: { 'X-VM-Admin': '1' } });
  const signIn = async (email, first, last) => {
    if (first) await req('POST', '/api/v1/auth/register', { body: { first_name: first, last_name: last, email, consent: true } });
    else await req('POST', '/api/v1/auth/request-code', { body: { email } });
    const c = lastCode(email);
    const v = await req('POST', '/api/v1/auth/verify', { body: { email, code: c.code } });
    return v.cookie;
  };

  /* ---------- salud y páginas ---------- */
  let r = await req('GET', '/health');
  ok(r.status === 200 && r.json.ok === true && r.json.ai === 'sin_modelo', 'salud abierta, base lista, sin modelo');
  r = await req('GET', '/', { raw: true });
  ok(r.status === 200 && !r.text.includes('{{BASE}}') && r.text.includes('"/vallemilagro"'), 'la página sustituye {{BASE}}');
  r = await fetch('http://127.0.0.1:' + port + '/ValleMilagro/portal', { redirect: 'manual' });
  ok(r.status === 301 && r.headers.get('location') === '/vallemilagro/portal', 'la forma con mayúsculas redirige a minúsculas');
  r = await req('GET', '/algo-que-no-existe', { raw: true });
  ok(r.status === 404 && r.text.includes('Valle Milagro'), '404 propio, no el del CRM');

  /* ---------- caso 1: registro, número y nombre ---------- */
  r = await req('POST', '/api/v1/auth/register', { body: { first_name: 'Ana', last_name: 'Prueba', email: 'sit-ana@vallemilagro.test' } });
  ok(r.status === 400 && r.json.error === 'consent', 'sin autorización de datos no se registra');
  r = await req('POST', '/api/v1/auth/register', { body: { first_name: 'Ana', last_name: 'Prueba', email: 'sit-ana@vallemilagro.test', consent: true }, headers: { 'X-VM': '' } });
  ok(r.status === 400, 'registro sin la cabecera propia se rechaza');
  r = await req('POST', '/api/v1/auth/register', { body: { first_name: 'Ana', last_name: 'Prueba', email: 'sit-ana@vallemilagro.test', consent: true } });
  ok(r.status === 200 && lastCode('sit-ana@vallemilagro.test'), 'registro válido envía el código');
  const anaCode = lastCode('sit-ana@vallemilagro.test');
  const pending = await dbm.one("SELECT member_no, status FROM vm_members WHERE tenant_id = :t AND email = 'sit-ana@vallemilagro.test'", { t: T });
  ok(pending.member_no == null && pending.status === 'pending', 'el número NO se asigna antes de verificar el correo');
  const stored = await dbm.one("SELECT code_hash, link_hash FROM vm_login_codes WHERE tenant_id = :t AND email = 'sit-ana@vallemilagro.test' ORDER BY id DESC LIMIT 1", { t: T });
  ok(!stored.code_hash.includes(anaCode.code) && stored.link_hash !== anaCode.token, 'código y enlace se guardan solo como hash');
  r = await req('POST', '/api/v1/auth/verify', { body: { email: 'sit-ana@vallemilagro.test', code: anaCode.code === '000000' ? '111111' : '000000' } });
  ok(r.status === 400 && !r.cookie, 'un código equivocado no abre sesión');
  r = await req('POST', '/api/v1/auth/verify', { body: { email: 'sit-ana@vallemilagro.test', code: anaCode.code } });
  const ana = r.cookie;
  ok(r.status === 200 && ana && /HttpOnly/i.test(r.headers.get('set-cookie')) && /Path=\/vallemilagro\/;/.test(r.headers.get('set-cookie')), 'código correcto abre sesión con cookie HttpOnly en su ruta');
  r = await req('POST', '/api/v1/auth/verify', { body: { email: 'sit-ana@vallemilagro.test', code: anaCode.code } });
  ok(r.status === 400, 'un código usado no sirve dos veces');
  r = await req('GET', '/api/v1/auth/me', { cookie: ana });
  ok(r.json.code === 'VM-0002' && r.json.first_name === 'Ana' && r.json.is_admin === false, 'recibe VM-0002 (el 0001 está reservado) y entra con su nombre', JSON.stringify(r.json));
  r = await req('GET', '/api/v1/portal/home', { cookie: ana });
  ok(r.status === 200 && r.json.member.first_name === 'Ana' && r.json.city === 'Cali, Colombia', 'el Inicio saluda por el nombre');
  r = await req('POST', '/api/v1/auth/request-code', { body: { email: 'nadie-existe@vallemilagro.test' } });
  ok(r.status === 200 && !lastCode('nadie-existe@vallemilagro.test'), 'pedir código para un correo desconocido responde igual y no envía nada');

  /* ---------- caso 2: fundador VM-0001 y backend ---------- */
  await req('POST', '/api/v1/auth/request-code', { body: { email: 'sit-founder@vallemilagro.test' } });
  const fc = lastCode('sit-founder@vallemilagro.test');
  r = await req('GET', '/entrar?t=' + fc.token, { raw: true });
  const still = await dbm.one('SELECT used_at FROM vm_login_codes WHERE tenant_id = :t AND link_hash = :l', { t: T, l: dbm.sha(fc.token) });
  ok(r.status === 200 && still.used_at == null, 'abrir el enlace con GET no lo consume (los filtros de correo no lo queman)');
  r = await req('POST', '/api/v1/auth/verify', { body: { token: fc.token } });
  const boss = r.cookie;
  r = await req('GET', '/api/v1/auth/me', { cookie: boss });
  ok(r.json.code === 'VM-0001' && r.json.is_admin === true && r.json.is_founder === true, 'el fundador entra con el mismo correo y es VM-0001 y administrador');
  r = await req('GET', '/admin', { cookie: boss, raw: true });
  ok(r.status === 200 && r.text.includes('Módulo de Backend'), 'el fundador abre el backend');
  r = await req('GET', '/admin', { cookie: ana, raw: true });
  ok(r.status === 404, 'un miembro recibe 404 en el backend (no 403)');
  r = await adm('GET', '/overview', ana);
  ok(r.status === 404, 'un miembro recibe 404 en la API del backend');
  r = await req('POST', '/api/v1/admin/projects', { cookie: boss, body: { name: 'x', municipio: 'y' } });
  ok(r.status === 404, 'una escritura del backend sin su cabecera se rechaza');
  ok(!fs.existsSync(path.join(__dirname, 'public', 'admin.html')), 'la página del backend no está en public/');

  /* números consecutivos con verificaciones simultáneas */
  const emails = ['sit-b1@vallemilagro.test', 'sit-b2@vallemilagro.test', 'sit-b3@vallemilagro.test'];
  for (const e of emails) await req('POST', '/api/v1/auth/register', { body: { first_name: 'Beto', last_name: 'Prueba', email: e, consent: true } });
  await Promise.all(emails.map((e) => req('POST', '/api/v1/auth/verify', { body: { email: e, code: lastCode(e).code } })));
  const nos = (await dbm.q("SELECT member_no FROM vm_members WHERE tenant_id = :t AND email LIKE 'sit-b%' ORDER BY member_no", { t: T })).map((x) => x.member_no);
  ok(nos.join(',') === '3,4,5', 'tres verificaciones simultáneas reciben números distintos y consecutivos', nos.join(','));

  /* ---------- caso 3: la foto del Inicio cambia ---------- */
  ok(core.pickOfDay(2, '2026-10-09') !== core.pickOfDay(2, '2026-10-10') && core.pickOfDay(0) === -1, 'con dos fotos, dos días seguidos dan fotos distintas');
  ok(core.bogotaToday(new Date('2026-10-10T04:30:00Z')) === '2026-10-09' && core.bogotaToday(new Date('2026-10-10T05:30:00Z')) === '2026-10-10', 'el día cambia a medianoche de Colombia, no del servidor');
  const sharp = require('sharp');
  const png = async (c) => 'data:image/png;base64,' + (await sharp({ create: { width: 40, height: 30, channels: 3, background: c } }).png().toBuffer()).toString('base64');
  r = await adm('POST', '/photos', boss, { image: await png('#21392B'), caption: 'Río Cauca' });
  const photo1 = r.json && r.json.id;
  await adm('POST', '/photos', boss, { image: await png('#6B5140') });
  r = await adm('GET', '/photos', boss);
  ok(r.json.photos.length === 2 && r.json.today_id !== r.json.tomorrow_id && r.json.note == null, 'el backend dice cuál foto toca hoy y cuál mañana');
  r = await req('GET', '/api/v1/portal/home', { cookie: ana });
  ok(r.json.photo && /^files\/\d+$/.test(r.json.photo.url), 'el Inicio trae la foto del día');
  r = await adm('POST', '/photos', boss, { image: 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64') });
  ok(r.status === 400, 'un archivo que no es imagen se rechaza por sus bytes');

  /* ---------- caso 7: proyecto del backend en mapa y Seguimiento ---------- */
  r = await adm('POST', '/projects', boss, { name: 'SIT Puente La Prueba', municipio: 'Jamundí', sector: 'publico', layer: 'Obras públicas', category: 'Vías', stage: 2, progress_pct: 30, lat: 3.26, lng: -76.54 });
  const pid = r.json.id;
  const inPortal = async (cookie) => { const a = await req('GET', '/api/v1/portal/projects', { cookie }); const b = await req('GET', '/api/v1/portal/map', { cookie });
    return [a.json.projects.some((p) => p.id === pid), b.json.points.some((p) => p.id === pid)]; };
  ok((await inPortal(ana)).join() === 'false,false', 'un proyecto en borrador no aparece en Seguimiento ni en el mapa');
  await adm('POST', '/projects/' + pid + '/publish', boss, { publish: true });
  ok((await inPortal(ana)).join() === 'true,true', 'publicado, aparece a la vez en Seguimiento y en el mapa');
  r = await req('POST', '/api/v1/portal/projects/' + pid + '/interest', { cookie: ana, body: { amount: 5000000, tenant_id: 1 } });
  ok(r.status === 404, 'registrar interés solo existe para Obras por Impuestos');
  const oxi = await dbm.one("SELECT id FROM vm_projects WHERE tenant_id = :t AND sector = 'oxi' AND status = 'published' LIMIT 1", { t: T });
  r = await req('POST', '/api/v1/portal/projects/' + oxi.id + '/interest', { cookie: ana, body: { amount: 5000000, tenant_id: 1 } });
  const intRow = await dbm.one('SELECT * FROM vm_interests WHERE tenant_id = :t AND project_id = :p', { t: T, p: oxi.id });
  ok(r.status === 200 && intRow && !('amount' in intRow), '"Me interesa" solo guarda un registro: no existe columna de monto');
  r = await req('GET', '/api/v1/portal/home', { cookie: ana });
  ok(r.json.mine.some((p) => p.id === oxi.id) && r.json.figures.active_projects > 0, 'el proyecto con interés pasa a "Mis proyectos" y las cifras son conteos');

  /* índices */
  ok(core.urgency({ u_need: 90, u_people: 80, u_quake: 70, u_time: 60, u_viability: null }) === null, 'un componente vacío deja el proyecto SIN puntaje');
  ok(core.urgency({ u_need: 100, u_people: 100, u_quake: 0, u_time: 0, u_viability: 50 }).score === 50, 'el Índice de Urgencia es la suma ponderada');
  ok(!core.validWeights({ u_need: 0.5, u_people: 0.5, u_quake: 0.5, u_time: 0, u_viability: 0 }) && core.validWeights({ u_need: 0.4, u_people: 0.3, u_quake: 0.1, u_time: 0.1, u_viability: 0.1 }), 'los pesos deben sumar 1');
  r = await adm('PUT', '/texts', boss, { weights: { u_need: 1, u_people: 1, u_quake: 0, u_time: 0, u_viability: 0 } });
  ok(r.status === 400, 'el backend rechaza pesos que no suman 1');

  /* ---------- caso 8: postulación con fotos ---------- */
  r = await req('POST', '/api/v1/portal/submissions', { cookie: ana, body: { tenant_id: 1, member_id: 1, category: 'Agua', municipio: 'Jamundí', conditions: 'Sin agua hace años', population: 1200,
    photos: [await png('#335'), await png('#533'), 'data:text/html;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')] } });
  const subId = r.json && r.json.id;
  ok(r.status === 200 && r.json.photos_saved === 2 && r.json.photos_failed.length === 1, 'la postulación guarda las dos fotos y rechaza el archivo que no es imagen');
  const subRow = await dbm.one('SELECT tenant_id, member_id FROM vm_submissions WHERE id = :id', { id: subId });
  const anaRow = await dbm.one("SELECT id FROM vm_members WHERE tenant_id = :t AND email = 'sit-ana@vallemilagro.test'", { t: T });
  ok(subRow.tenant_id === T && subRow.member_id === anaRow.id, 'el tenant_id y el miembro del cuerpo se ignoran: salen de la sesión');
  r = await adm('GET', '/submissions', boss);
  const sub = r.json.submissions.find((s) => s.id === subId);
  ok(sub && sub.photos.length === 2, 'la postulación llega al backend con sus fotos');
  const beto = await signIn('sit-b1@vallemilagro.test');
  r = await req('GET', '/api/v1/portal/files/' + sub.photos[0], { cookie: beto, raw: true });
  ok(r.status === 404, 'otro miembro no puede ver la foto de una postulación ajena');
  r = await req('GET', '/api/v1/portal/files/' + sub.photos[0], { cookie: ana, raw: true });
  ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg' && r.headers.get('x-content-type-options') === 'nosniff', 'quien la envió sí la ve, recodificada como JPEG');
  r = await req('GET', '/api/v1/portal/home');
  ok(r.status === 401, 'sin sesión el portal responde 401');

  /* ---------- caso 4: un documento cambia lo que responde Valle ---------- */
  llm._setClient(fakeClient);
  r = await adm('POST', '/kb', boss, { name: 'Guía SIT', text: 'El Club Cóndor Azul es el nombre interno del comité técnico de la Asociación.' });
  const docId = r.json.doc.id;
  fake.calls.length = 0; fake.next = say('El Club Cóndor Azul es el comité técnico.');
  r = await req('POST', '/api/v1/portal/valle/chat', { cookie: ana, body: { messages: [{ role: 'user', content: '¿Qué es el Club Cóndor Azul?' }] } });
  ok(r.status === 200 && r.json.composed_by === 'model' && fake.calls[0].system.includes('Club Cóndor Azul'), 'el documento activo viaja en el mensaje de Valle');
  await adm('POST', '/kb/' + docId + '/deactivate', boss, {});
  fake.calls.length = 0;
  await req('POST', '/api/v1/portal/valle/chat', { cookie: ana, body: { messages: [{ role: 'user', content: '¿Qué es el Club Cóndor Azul?' }] } });
  ok(fake.calls.length === 1 && !fake.calls[0].system.includes('Club Cóndor Azul'), 'al quitar el documento deja de viajar');
  r = await adm('POST', '/kb', boss, { name: 'Vacío', text: 'corto' });
  ok(r.status === 400, 'un documento sin texto legible se rechaza');
  ok(agents.sniff(Buffer.from('%PDF-1.7 ...')) === 'pdf' && agents.sniff(Buffer.from([0x50, 0x4b, 3, 4, 0, 0])) === 'docx' && agents.sniff(Buffer.from([0, 1, 2, 0])) === null, 'el tipo de archivo se decide por sus bytes');

  /* ---------- caso 9: límites de Valle ---------- */
  fake.calls.length = 0;
  r = await req('POST', '/api/v1/portal/valle/chat', { cookie: ana, body: { messages: [{ role: 'user', content: '¿Por cuál candidato debo votar en las elecciones?' }] } });
  ok(r.json.reply === agents.FIXED.politica && fake.calls.length === 0, 'una pregunta política recibe la respuesta fija y ni siquiera llega al modelo');
  fake.next = say('Claro. La Asociación recauda los aportes de las empresas y administra los recursos de cada obra.');
  r = await req('POST', '/api/v1/portal/valle/chat', { cookie: ana, body: { messages: [{ role: 'user', content: '¿Quién maneja la plata?' }] } });
  ok(r.json.reply === agents.FIXED.dinero, 'si el modelo dice que la Asociación maneja dinero, se descarta y entra la aclaración fija');
  ok(agents.claimsMoney('La Asociación recibe los aportes.') && !agents.claimsMoney('La Asociación no recauda ni recibe aportes.') && !agents.claimsMoney('La fiduciaria aliada administra los recursos.'), 'el filtro de dinero distingue afirmar de negar y a la fiduciaria de la Asociación');
  fake.next = say('El acueducto tiene 97% de avance y costó 4.812 millones.');
  r = await req('POST', '/api/v1/portal/valle/chat', { cookie: ana, body: { messages: [{ role: 'user', content: '¿Cómo va el acueducto?' }] } });
  ok(r.json.composed_by === 'heuristic' && r.json.is_simulated === true && !r.json.reply.includes('4.812'), 'una cifra que el servidor no entregó descarta la respuesta del modelo');
  fake.next = say('Mira esta nota: https://sitio-inventado.example/nota y vuelve luego.');
  r = await req('POST', '/api/v1/portal/valle/chat', { cookie: ana, body: { messages: [{ role: 'user', content: 'Dame un enlace' }] } });
  ok(!r.json.reply.includes('sitio-inventado'), 'un enlace que no está en los hechos se elimina');
  fake.next = new Error('credit balance is too low');
  r = await req('POST', '/api/v1/portal/valle/chat', { cookie: ana, body: { messages: [{ role: 'user', content: '¿Qué es lo más urgente?' }] } });
  ok(r.status === 200 && r.json.is_simulated === true && /urgente/i.test(r.json.reply), 'si el modelo falla, Valle responde por la ruta sin modelo, marcada');
  r = await req('POST', '/api/v1/portal/valle/chat', { body: { messages: [{ role: 'user', content: 'hola' }] } });
  ok(r.status === 401, 'el chat exige sesión');
  const chatAudit = await dbm.q("SELECT detail FROM vm_audit WHERE tenant_id = :t AND action = 'valle.chat'", { t: T });
  ok(chatAudit.length > 0 && !JSON.stringify(chatAudit).includes('acueducto'), 'las conversaciones no se guardan: solo que hubo una consulta');

  /* ---------- casos 5 y 6: el Scout no publica; medio, fecha y enlace ---------- */
  const san = agents.sanitizeFindings({ hallazgos: [
    { type: 'noticia', tema: 'Gobernación', title: 'Nota real', summary: 'Resumen propio de la nota.', source_url: 'https://www.elpais.com.co/valle/nota-real' },
    { type: 'noticia', tema: 'Tema inventado', title: 'Nota fantasma', summary: 'x', source_url: 'https://inventado.example/fantasma' }] },
  [{ url: 'https://www.elpais.com.co/valle/nota-real', title: 'Nota real en El País', page_age: 'October 5, 2026' }]);
  ok(san.kept.length === 1 && san.dropped.length === 1 && san.dropped[0].reason === 'enlace_no_devuelto_por_el_buscador', 'un hallazgo con un enlace que el buscador no devolvió no entra');
  ok(san.kept[0].medio === 'El País' && san.kept[0].published_on === '2026-10-05', 'el medio sale del dominio y la fecha del buscador, no del modelo');
  ok(agents.copies('uno dos tres cuatro cinco seis siete ocho nueve', 'antes uno dos tres cuatro cinco seis siete ocho despues') && !agents.copies('un resumen corto y propio', 'otra cosa distinta'), 'ocho palabras seguidas iguales a la fuente cuentan como copia');
  fake.next = { stop_reason: 'end_turn', content: [
    { type: 'server_tool_use', name: 'web_search', input: { query: 'obras por impuestos valle' } },
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://www.valledelcauca.gov.co/noticias/sit-anuncio', title: 'Anuncio de prueba de la Gobernación' }] },
    { type: 'text', text: JSON.stringify({ hallazgos: [{ type: 'decreto', tema: 'Gobernación', municipio: 'Cali', title: 'SIT Anuncio de la Gobernación', summary: 'La Gobernación anunció una medida de prueba.', source_url: 'https://www.valledelcauca.gov.co/noticias/sit-anuncio' }],
      titular: 'Titular con una cifra ajena de 987 mil millones', sintesis: 'Síntesis del día.', hoy: '' }) }] };
  r = await adm('POST', '/scout/run', boss, {});
  ok(r.status === 200 && r.json.run_id, 'el Scout arranca en segundo plano y responde de inmediato');
  let finding = null;
  for (let i = 0; i < 40 && !finding; i++) { await new Promise((z) => setTimeout(z, 150)); finding = await dbm.one("SELECT * FROM vm_findings WHERE tenant_id = :t AND title LIKE 'SIT Anuncio%'", { t: T }); }
  ok(finding && finding.status === 'pending' && finding.url_seen === true && finding.medio === 'Gobernación del Valle del Cauca', 'el hallazgo queda PENDIENTE en la bandeja, con el medio puesto por el código');
  const today = core.bogotaToday();
  const draft = await dbm.one('SELECT status, headline, composed_by FROM vm_editions WHERE tenant_id = :t AND edition_date = :d', { t: T, d: today });
  const newsNow = async () => (await req('GET', '/api/v1/portal/editions/latest', { cookie: ana })).json.news.some((n) => n.title.startsWith('SIT Anuncio'));
  ok(!(await newsNow()), 'un hallazgo del Scout NO aparece en el portal antes de aprobarse');
  r = await adm('POST', '/findings/' + finding.id + '/approve', boss, { link_checked_by_hand: true });
  ok(r.status === 400 && /fecha/.test(r.json.message), 'aprobar sin fecha se rechaza (cada noticia lleva medio, fecha y enlace)');
  await adm('PATCH', '/findings/' + finding.id, boss, { published_on: today, source_url: 'javascript:alert(1)' });
  r = await adm('POST', '/findings/' + finding.id + '/approve', boss, { link_checked_by_hand: true });
  ok(r.status === 400 && /enlace/.test(r.json.message), 'un enlace que no es http(s) no se puede aprobar');
  await adm('PATCH', '/findings/' + finding.id, boss, { source_url: 'https://www.valledelcauca.gov.co/noticias/sit-anuncio' });
  r = await adm('POST', '/findings/' + finding.id + '/approve', boss, { link_checked_by_hand: true, edition_date: today });
  ok(r.status === 200, 'con medio, fecha y enlace, el administrador aprueba');
  await adm('PUT', '/editions/' + today, boss, { headline: 'SIT Edición del día', summary: 'Resumen', today_line: '' });
  await adm('POST', '/editions/' + today + '/publish', boss, { publish: false });
  ok(!(await newsNow()), 'aprobado pero con la edición sin publicar, tampoco aparece');
  await adm('POST', '/editions/' + today + '/publish', boss, { publish: true });
  r = await req('GET', '/api/v1/portal/editions/latest', { cookie: ana });
  const pub = r.json.news.find((n) => n.title.startsWith('SIT Anuncio'));
  ok(pub && pub.medio && pub.published_on && /^https:\/\//.test(pub.source_url), 'publicada la edición, la noticia aparece con medio, fecha y enlace');
  ok(draft && !/987/.test(draft.headline), 'un titular del modelo con una cifra ajena se reemplaza por el título del hallazgo', draft && draft.headline);
  llm._setClient(null);
  r = await adm('POST', '/scout/run', boss, {});
  const skipped = await dbm.one('SELECT status, error FROM vm_scout_runs WHERE tenant_id = :t ORDER BY id DESC LIMIT 1', { t: T });
  ok(r.json.skipped === true && skipped.status === 'skipped' && /Sin modelo/.test(skipped.error), 'sin modelo el Scout no corre, lo dice, y no inventa hallazgos');

  /* ---------- privacidad ---------- */
  r = await req('POST', '/api/v1/portal/profile/delete', { cookie: boss, body: { confirm: true } });
  ok(r.status === 400, 'una cuenta administradora no se elimina desde el perfil');
  const betoRow = await dbm.one("SELECT id, member_no FROM vm_members WHERE tenant_id = :t AND email = 'sit-b1@vallemilagro.test'", { t: T });
  r = await req('POST', '/api/v1/portal/profile/delete', { cookie: beto, body: { confirm: true } });
  const gone = await dbm.one('SELECT first_name, email, member_no, status FROM vm_members WHERE tenant_id = :t AND id = :id', { t: T, id: betoRow.id });
  ok(r.status === 200 && gone.status === 'deleted' && !gone.email.includes('sit-b1') && gone.first_name === 'Cuenta' && gone.member_no === betoRow.member_no, 'eliminar la cuenta borra los datos personales y retira el número');
  r = await req('GET', '/api/v1/auth/me', { cookie: beto });
  ok(r.status === 401, 'la sesión de una cuenta eliminada deja de servir');
  const consent = await dbm.one('SELECT text, version, ip_hash FROM vm_consents WHERE tenant_id = :t AND member_id = :m', { t: T, m: anaRow.id });
  ok(consent && consent.text.includes('Ley 1581') && consent.version === 'vm-2026-10', 'la autorización guarda el texto del servidor y su versión');

  /* ---------- promesas estructurales (lo que una prueba en ejecución no ve) ---------- */
  const SRC = path.join(__dirname, 'src');
  const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const files = ['db.js', 'auth.js', 'mail.js', 'llm.js', 'core.js', 'agents.js', 'index.js'];
  const all = files.map((f) => strip(read(f))).join('\n') + strip(fs.readFileSync(path.join(__dirname, 'public', 'portal.js'), 'utf8'));
  ok(!/stripe|paypal|wompi|payu|mercadopago|checkout|payment_intent/i.test(all), 'no hay ningún cliente de pagos en el vertical');
  ok(files.filter((f) => /sendgrid|nodemailer|smtp/i.test(strip(read(f)))).join() === 'mail.js', 'el único archivo con transporte de correo es mail.js');
  ok((strip(read('mail.js')).match(/\bsend\(\{/g) || []).length === 1, 'mail.js hace un solo envío: el código de acceso');
  ok(files.filter((f) => /@anthropic-ai\/sdk/.test(strip(read(f)))).join() === 'llm.js', 'el único archivo que llega a un modelo es llm.js');
  const idx = strip(read('index.js'));
  const portalPart = idx.slice(idx.indexOf('const portal = express.Router()'), idx.indexOf("api.use('/portal', portal)"));
  const bare = [];
  portalPart.replace(/FROM vm_(projects|findings|editions)\b/g, (m0, _t, at) => { const stmt = portalPart.slice(at, at + 320); if (!/status = '(published|approved)'/.test(stmt)) bare.push(stmt.slice(0, 60)); return m0; });
  ok(bare.length === 0 && /status = 'published'/.test(strip(read('core.js'))), 'toda lectura del portal filtra por publicado o aprobado', bare.join(' | '));
  ok(!/\.status\s*=\s*'(published|approved)'|SET status = '(published|approved)'/.test(strip(read('agents.js'))), 'el Scout no tiene ninguna ruta de código que publique o apruebe');
  const mig = fs.readFileSync(path.join(__dirname, 'migrations', '20261009_vallemilagro_tables.sql'), 'utf8');
  const tables = mig.match(/CREATE TABLE IF NOT EXISTS (vm_\w+)/g) || [];
  ok(tables.length >= 20 && (mig.match(/tenant_id INTEGER NOT NULL/g) || []).length === tables.length, 'toda tabla lleva tenant_id NOT NULL', String(tables.length));
  ok(!/sync\(\s*\{\s*alter\s*:\s*true/.test(all), 'no se usa sync({alter:true})');
  const geo = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'geo', 'valle-municipios.json'), 'utf8'));
  ok(geo.features.length === 42, 'el mapa trae los 42 municipios');

  await cleanup();
  server.close();
  console.log(`\nValle Milagro SIT: ${pass}/${pass + fail}`);
  console.log('NO cubierto: modelo real, búsqueda web real, entrega real del correo, diseño contra el prototipo.');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('SIT abortado:', e); try { await cleanup(); } catch (x) { /* nada */ } process.exit(1); });
