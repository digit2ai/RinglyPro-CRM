'use strict';
/**
 * NeoHaul SIT. Desde la raíz del repo:
 *   node -e "require('dotenv').config();require('./verticals/neohaul/sit.js')"
 * Sin llaves externas (ANTHROPIC_API_KEY se borra: la lectura del ticket corre
 * por el camino manual). Usa la base de .env con dos empresas desechables
 * sit-nh-*, borradas al final. Ataca las reglas: importes que el navegador no
 * puede fijar, aislamiento entre empresas, rol de solo lectura, viajes bloqueados
 * dentro de una estimación, IVA/retención exactos, reparto de diésel al centavo,
 * camión sin costos que no muestra ganancia.
 * NO cubre: el ingreso del dueño contra la tabla users del CRM, la lectura real
 * del ticket con el modelo, el navegador.
 */
delete process.env.ANTHROPIC_API_KEY;
process.env.NEOHAUL_JWT_SECRET = process.env.NEOHAUL_JWT_SECRET || 'sit-only-secret-' + Date.now();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const bcrypt = require('bcryptjs');
const M = require('./src/money');
const router = require('./src/index');
const db = require('./src/db');

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) { if (cond) pass++; else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); } console.log((cond ? '  ✓ ' : '  ✗ ') + name); }

const app = express(); app.use('/neohaul', router);
const server = http.createServer(app);
let base;
function req(method, p, { body, cookie, header = true, raw } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (header) headers['X-NeoHaul'] = '1';
    if (cookie) headers.Cookie = cookie;
    let data = null;
    if (raw) { data = raw.body; headers['Content-Type'] = raw.type; }
    else if (body !== undefined) { data = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(base + '/neohaul/api/v1' + p, { method, headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks); let json = null; try { json = JSON.parse(buf.toString()); } catch (_) {}
        const sc = res.headers['set-cookie']; const ck = sc ? sc[0].split(';')[0] : null;
        resolve({ status: res.statusCode, json, buf, headers: res.headers, cookie: ck });
      });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
function multipart(fields, fileField, file) {
  const b = '----sit' + Date.now(); const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from(`\r\n--${b}--\r\n`));
  return { body: Buffer.concat(parts), type: 'multipart/form-data; boundary=' + b };
}
const sel = (sql, r) => db.query(sql, { replacements: r, type: db.QueryTypes.SELECT });
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

(async () => {
  const STAMP = Date.now();
  const tenants = [];
  try {
    await router.ready;
    await new Promise((r) => server.listen(0, r));
    base = 'http://127.0.0.1:' + server.address().port;

    console.log('\nDinero (money.js)');
    ok('218.46 t x $22 = $4,806.12 (Excel PLANTA SANT)', M.importe(218.46, 22) === 4806.12);
    const ft = M.facturaTotals(6500, true);
    ok('$6,500 + IVA 16% - ret 4% = $7,280 (FOR-FYC-01)', ft.total === 7280 && ft.iva === 1040 && ft.retencion === 260);
    ok('sin retención: solo IVA', M.facturaTotals(100, false).total === 116);
    const rp = M.reparto(1000, [{ truck_id: 1, km: 1 }, { truck_id: 2, km: 1 }, { truck_id: 3, km: 1 }]);
    ok('reparto por km suma exacto al centavo', M.toCents(M.sum(rp.map((x) => x.monto))) === 100000);
    ok('reparto sin km no inventa nada', M.reparto(1000, []) === null && M.reparto(1000, [{ truck_id: 1, km: 0 }]) === null);
    ok('comisión 8% de $3,000 = $240', M.comision(3000, 8) === 240);
    ok('comisión fuera de rango se rechaza', M.comision(3000, 20) === null);
    ok('lunes de la semana', M.lunes('2026-11-15') === '2026-11-09' && M.lunes('2026-02-30') === null);

    console.log('\nEstructura');
    const srcDir = path.join(__dirname, 'src');
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'));
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const code = Object.fromEntries(files.map((f) => [f, strip(fs.readFileSync(path.join(srcDir, f), 'utf8'))]));
    ok('docs.js (lectores) no toca base de datos ni red', !/require\('\.\/db'\)|sequelize|https?\.request|fetch\(/.test(code['docs.js']));
    const deck = fs.readFileSync(path.join(__dirname, 'public', 'presentacion.html'), 'utf8');
    const narr = eval('(' + deck.slice(deck.indexOf('var NARR = ') + 11, deck.indexOf('];', deck.indexOf('var NARR = ')) + 1) + ')');
    const imgs = [...deck.matchAll(/src="\/neohaul\/(presentacion\/[^"]+)"/g)].map((m) => m[1]);
    ok('guía narrada: una narración por lámina, bajo el tope de la voz, cada captura existe', (deck.match(/class="slide/g) || []).length === narr.length && narr.every((n) => n.length < 2000) && imgs.length > 15 && imgs.every((s) => fs.existsSync(path.join(__dirname, 'public', s))));
    ok('solo llm.js llega a un modelo', files.filter((f) => /@anthropic-ai\/sdk/.test(code[f])).join() === 'llm.js');
    ok('ningún transporte de mensajes en el vertical', !files.some((f) => /twilio|sendgrid|nodemailer|graph\.facebook|messages\.create\(\s*\{\s*to/i.test(code[f])));
    ok('el servidor no lee importe/subtotal/total del cuerpo', !/body\.(importe|subtotal|total|iva|retencion|precio_unitario)\b/.test(code['index.js'].replace(/b\.precio_unitario/g, 'PU_SUELTA')) && !/b\.(importe|subtotal|iva|retencion)\b/.test(code['index.js']));
    ok('el tenant nunca sale del cuerpo', !/body\.tenant_id|b\.tenant_id/.test(code['index.js']));
    ok('el lector no calcula importes', !/importe/.test(code['llm.js']));

    console.log('\nDocumentos reales (lectores puros, 10-nov-2026)');
    const D = require('./src/docs');
    // Mismos campos y formas que el vale HTR No. 41971; valores inventados (el repo es público).
    const vale = { vale_no: '90001', folio: '70001', pedido: '70001', fecha: '28/09/2026', hora: '10:43', fecha_escrita: '28-07-26', placas: 'XX0224B', placas_escritas: 'XXO224B',
      cliente: 'S I C T', producto: 'MARSHALL 3-4', destino: 'N-16', operador: 'Juan Prueba', temperatura: '175 Gr', transportista: 'GRUPO NEOHAUL',
      peso_bruto: '30570 kg', peso_tara: '9500 kg TARA MANUAL', peso_neto: '21070 kg', legible: 'si' };
    const cv = D.cleanOcr(vale);
    ok('neto 21,070 kg = 21.07 t, dicho como conversión', cv.toneladas === 21.07 && cv.origen_toneladas === 'kg_a_t');
    ok('fecha: la impresa por la báscula, y avisa que la escrita a mano difiere', cv.fecha === '2026-09-28' && cv.avisos.includes('fecha_escrita_distinta'));
    ok('avisa tara manual', cv.avisos.includes('tara_manual'));
    ok('O/0 en placas no cuenta como placas distintas', !cv.avisos.includes('placas_distintas'));
    ok('vale No. y folio de báscula por separado', cv.vale_no === '90001' && cv.ticket_no === '70001');
    ok('limpiar su propia salida da lo mismo (se guarda en ocr)', JSON.stringify(D.cleanOcr(cv)) === JSON.stringify(cv));
    ok('bruto - tara distinto del neto = aviso', D.cleanOcr({ ...vale, peso_neto: '20000 kg' }).avisos.includes('neto_no_cuadra'));
    ok('un número sin unidad no se interpreta como peso', D.cleanOcr({ peso_neto: '21070' }).toneladas === null);
    ok('peso absurdo no pasa', D.cleanOcr({ peso_neto: '210700 kg' }).toneladas === null);
    ok('otro transportista = aviso', D.cleanOcr({ transportista: 'OTRA SA' }).avisos.includes('otro_transportista'));
    const sg = D.sugerir(cv, { trucks: [{ id: 7, placas: 'XX-0224-B' }, { id: 8, placas: 'ZZ1' }], obras: [{ id: 3, nombre: 'SICT N16', clave: 'N16' }, { id: 4, nombre: 'SICT N18', clave: 'N18' }],
      drivers: [{ id: 5, nombre: 'Juan Prueba López' }, { id: 6, nombre: 'Pedro Otro' }] });
    ok('sugiere camión por placas, obra por destino N-16 y chofer por nombre', sg.truck_id === 7 && sg.obra_id === 3 && sg.driver_id === 5, JSON.stringify(sg));
    ok('dos camiones con las mismas placas = no sugiere ninguno', D.sugerir(cv, { trucks: [{ id: 1, placas: 'XX0224B' }, { id: 2, placas: 'XXO224B' }] }).truck_id === null);
    const casos = ['8136414177', '+1 813 641 4177', '+52 1 81 1234 5678', '5218112345678', '528112345678', '123', '', '+44 20 7946 0958'];
    ok('WhatsApp: 10 dígitos = México; +1 = EE. UU.', D.waNumero('8136414177') === '528136414177' && D.waNumero('+1 813 641 4177') === '18136414177' && D.waNumero('+52 1 81 1234 5678') === '528112345678' && D.waNumero('123') === null);
    const appSrc = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    const fnSrc = (appSrc.match(/function waNumero\(tel\) \{[\s\S]*?\n  \}/) || [])[0];
    const waCliente = fnSrc && new Function(fnSrc + '; return waNumero;')();
    ok('la pantalla y el servidor arman el mismo número de WhatsApp', !!waCliente && casos.every((c) => waCliente(c) === D.waNumero(c)), String(casos.map((c) => waCliente && waCliente(c))));
    const sch = require('./src/schema');
    const esc4500 = sch.TARIFAS.find((t) => t[1] === 'escombro'), b4400 = sch.TARIFAS.find((t) => t[5] === 4400);
    ok('tarifas confirmadas por NeoHaul: escombro $4,500/viaje, bacheo $4,400/viaje', esc4500[4] === 'viaje' && esc4500[5] === 4500 && !esc4500[6] && b4400[4] === 'viaje' && !b4400[6]);

    console.log('\nPreparación');
    const mkTenant = async (slug) => { const [[t]] = await db.query("INSERT INTO nh_tenants (name,slug) VALUES (:n,:s) RETURNING id", { replacements: { n: 'SIT ' + slug, s: slug } }); tenants.push(t.id); return t.id; };
    const A = await mkTenant('sit-nh-a-' + STAMP), B = await mkTenant('sit-nh-b-' + STAMP);
    const hash = await bcrypt.hash('sit-password-123', 4);
    const mkUser = async (t, role) => {
      const email = `sit-nh-${role}-${t}-${STAMP}@example.test`;
      await db.query('INSERT INTO nh_users (tenant_id,email,name,role,password_hash,must_change) VALUES (:t,:e,:n,:r,:h,FALSE)', { replacements: { t, e: email, n: role, r: role, h: hash } });
      return (await req('POST', '/auth/login', { body: { email, password: 'sit-password-123' } })).cookie;
    };
    const dirA = await mkUser(A, 'director'), capA = await mkUser(A, 'capturista'), conA = await mkUser(A, 'contador'), dirB = await mkUser(B, 'director');
    ok('sesiones iniciadas', !!(dirA && capA && conA && dirB));
    const tempUser = `sit-nh-temp-${STAMP}@example.test`;
    await db.query('INSERT INTO nh_users (tenant_id,email,role,password_hash,must_change) VALUES (:t,:e,\'capturista\',:h,TRUE)', { replacements: { t: A, e: tempUser, h: hash } });
    const tmp = (await req('POST', '/auth/login', { body: { email: tempUser, password: 'sit-password-123' } })).cookie;
    ok('contraseña temporal bloquea todo lo demás', (await req('GET', '/viajes', { cookie: tmp })).status === 403);

    const cl = (await req('POST', '/clients', { cookie: dirA, body: { nombre: 'HTR SIT' } })).json;
    const obra = (await req('POST', '/obras', { cookie: dirA, body: { client_id: cl.id, nombre: 'Obra SIT', ingeniero: 'Ing. SIT', ingeniero_tel: '8112345678' } })).json;
    const tar22 = (await req('POST', '/tarifas', { cookie: dirA, body: { nombre: 'Internos SIT', unidad: 'tonelada', precio: 22 } })).json;
    const drv = (await req('POST', '/drivers', { cookie: dirA, body: { nombre: 'Chofer SIT', empresa: 'NeoHaul', puesto: 'chofer', salario_semanal: 2000 } })).json;
    const t1 = (await req('POST', '/trucks', { cookie: dirA, body: { empresa: 'NeoHaul', unidad: 'SIT T-01', chofer_id: drv.id } })).json;
    const t2 = (await req('POST', '/trucks', { cookie: dirA, body: { empresa: 'NeoHaul', unidad: 'SIT T-02' } })).json;
    const t3 = (await req('POST', '/trucks', { cookie: dirA, body: { empresa: 'TTS', unidad: 'SIT TTS-01' } })).json;
    ok('catálogos creados', !!(obra.id && tar22.id && drv.id && t1.id && t2.id && t3.id));
    ok('NeoHaul = propio, TTS no', t1.propio === true && t3.propio === false);
    const clB = (await req('POST', '/clients', { cookie: dirB, body: { nombre: 'Cliente B' } })).json;
    const obraB = (await req('POST', '/obras', { cookie: dirB, body: { client_id: clB.id, nombre: 'Obra B' } })).json;

    console.log('\nPermisos y aislamiento');
    ok('sin el encabezado X-NeoHaul = 403', (await req('POST', '/viajes', { cookie: capA, header: false, body: {} })).status === 403);
    ok('contador no escribe', (await req('POST', '/gastos', { cookie: conA, body: { fecha: '2026-11-09', proveedor: 'X', total: 10 } })).status === 403);
    ok('contador sí lee', (await req('GET', '/viajes', { cookie: conA })).status === 200);
    ok('capturista no ve usuarios (404)', (await req('GET', '/usuarios', { cookie: capA })).status === 404);
    ok('obra de otra empresa no existe para B', (await req('PATCH', '/obras/' + obra.id, { cookie: dirB, body: { nombre: 'robada' } })).status === 404);
    ok('obra de A no se puede usar desde B', (await req('POST', '/viajes', { cookie: dirB, body: { fecha: '2026-11-09', obra_id: obra.id, tarifa_id: tar22.id, cantidad: 1 } })).status === 404);
    ok('cliente de B no se liga a obra de A', (await req('POST', '/obras', { cookie: dirA, body: { client_id: clB.id, nombre: 'mezcla' } })).status === 404);

    console.log('\nViajes');
    const fecha = '2026-11-03';
    const v1 = await req('POST', '/viajes', { cookie: capA, body: { fecha, obra_id: obra.id, tarifa_id: tar22.id, truck_id: t1.id, driver_id: drv.id, ticket_no: 'T-100', cantidad: 218.46, importe: 1, precio_unitario: 999, subtotal: 5 } });
    ok('importe calculado por el servidor = $4,806.12', v1.status === 201 && near(v1.json.importe, 4806.12) && near(v1.json.precio_unitario, 22), JSON.stringify(v1.json));
    ok('nace capturado, no confirmado', v1.json.estado === 'capturado');
    ok('ticket duplicado con la misma tarifa = 409', (await req('POST', '/viajes', { cookie: capA, body: { fecha, obra_id: obra.id, tarifa_id: tar22.id, ticket_no: 'T-100', cantidad: 5 } })).status === 409);
    ok('cantidad inválida = 400', (await req('POST', '/viajes', { cookie: capA, body: { fecha, obra_id: obra.id, tarifa_id: tar22.id, cantidad: -3 } })).status === 400);
    ok('B no ve los viajes de A', ((await req('GET', `/viajes?desde=2026-11-02&hasta=2026-11-08`, { cookie: dirB })).json || []).length === 0);
    ok('B no edita un viaje de A', (await req('PATCH', '/viajes/' + v1.json.id, { cookie: dirB, body: { cantidad: 1 } })).status === 404);
    const v2 = (await req('POST', '/viajes', { cookie: capA, body: { fecha: '2026-11-04', obra_id: obra.id, tarifa_id: tar22.id, truck_id: t1.id, driver_id: drv.id, ticket_no: 'T-101', cantidad: 20, confirmar: true } })).json;
    ok('guardar y confirmar', v2.estado === 'confirmado' && near(v2.importe, 440));
    ok('cambiar la tarifa no mueve viajes ya capturados', (await req('PATCH', '/tarifas/' + tar22.id, { cookie: dirA, body: { precio: 30 } })).status === 200
      && near((await sel('SELECT importe FROM nh_viajes WHERE id=:id', { id: v1.json.id }))[0].importe, 4806.12));
    await req('PATCH', '/tarifas/' + tar22.id, { cookie: dirA, body: { precio: 22 } });
    ok('la capturista no cambia el precio de una tarifa', (await req('PATCH', '/tarifas/' + tar22.id, { cookie: capA, body: { precio: 999999 } })).status === 403);
    ok('el cambio de precio queda en la bitácora con antes y después', (await sel("SELECT detail FROM nh_activity WHERE tenant_id=:t AND action='tarifas_updated' ORDER BY id DESC LIMIT 1", { t: A }))[0].detail.includes('$30.00 -> $22.00'));

    const est0 = await req('POST', '/estimaciones', { cookie: capA, body: { obra_id: obra.id, desde: '2026-11-03', hasta: '2026-11-03' } });
    ok('un viaje capturado sin confirmar no entra a la estimación (409)', est0.status === 409 && est0.json.capturados_sin_confirmar === 1, JSON.stringify(est0.json));
    ok('confirmar seleccionados', (await req('POST', '/viajes/confirmar', { cookie: capA, body: { ids: [v1.json.id] } })).json.confirmados === 1);

    console.log('\nLectura de ticket (sin llave = captura manual)');
    const jpg = await require('sharp')({ create: { width: 40, height: 40, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    const n0 = (await sel('SELECT COUNT(*)::int AS n FROM nh_viajes WHERE tenant_id=:t', { t: A }))[0].n;
    const lt = await req('POST', '/viajes/leer-ticket', { cookie: capA, raw: multipart({}, 'foto', { name: 't.jpg', type: 'image/jpeg', data: jpg }) });
    ok('la foto se guarda y vuelve una propuesta vacía', lt.status === 200 && lt.json.leido_por === 'captura_manual' && lt.json.propuesta === null && lt.json.file_id);
    ok('leer un ticket no crea ningún viaje', (await sel('SELECT COUNT(*)::int AS n FROM nh_viajes WHERE tenant_id=:t', { t: A }))[0].n === n0);
    ok('B no abre la foto de A', (await req('GET', '/files/' + lt.json.file_id, { cookie: dirB })).status === 404);
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(40)]);
    ok('HEIC se rechaza con el arreglo', (await req('POST', '/viajes/leer-ticket', { cookie: capA, raw: multipart({}, 'foto', { name: 'a.heic', type: 'image/heic', data: heic }) })).json.error === 'heic');
    ok('un archivo que dice ser foto y no lo es se rechaza', (await req('POST', '/viajes/leer-ticket', { cookie: capA, raw: multipart({}, 'foto', { name: 'x.jpg', type: 'image/jpeg', data: Buffer.from('<html>hola</html> no soy foto') }) })).status === 415);

    console.log('\nImportar Excel de planta');
    const csv = 'Fecha,Ticket,Toneladas\n05/11/2026,T-200,10.5\n06/11/2026,T-201,abc\n2026-11-06,T-100,4\n';
    const im = await req('POST', '/viajes/importar', { cookie: capA, raw: multipart({ obra_id: obra.id, tarifa_id: tar22.id }, 'archivo', { name: 'p.csv', type: 'text/csv', data: Buffer.from(csv) }) });
    ok('cada renglón recibe resultado (1 creado, 2 rechazados)', im.status === 200 && im.json.creados === 1 && im.json.rechazados === 2, JSON.stringify(im.json));
    ok('el duplicado se nombra como tal', im.json.resultados.some((r) => r.motivo === 'ticket_duplicado'));
    ok('fecha 05/11/2026 se lee como 5 de noviembre (día/mes)', (await sel("SELECT to_char(fecha,'YYYY-MM-DD') AS f FROM nh_viajes WHERE tenant_id=:t AND ticket_no='T-200'", { t: A }))[0].f === '2026-11-05');

    const xls = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
    ok('un .xls binario se rechaza (solo .xlsx o CSV)', (await req('POST', '/viajes/importar', { cookie: capA, raw: multipart({ obra_id: obra.id, tarifa_id: tar22.id }, 'archivo', { name: 'a.xls', type: 'application/vnd.ms-excel', data: xls }) })).json.error === 'usa_excel_o_csv');
    ok('el parser corre en un hilo aparte', /new Worker\(/.test(fs.readFileSync(path.join(__dirname, 'src', 'index.js'), 'utf8')) && !/require\('xlsx'\)\.read|XLSX\.read/.test(fs.readFileSync(path.join(__dirname, 'src', 'index.js'), 'utf8').split('/estimaciones/:id/excel')[0]));

    console.log('\nEstimación');
    const est = await req('POST', '/estimaciones', { cookie: capA, body: { obra_id: obra.id, desde: '2026-11-02', hasta: '2026-11-08' } });
    ok('arma solo los confirmados: 2 viajes, $5,246.12', est.status === 201 && est.json.viajes === 2 && near(est.json.subtotal, 5246.12), JSON.stringify(est.json));
    ok('un viaje en estimación no se edita', (await req('PATCH', '/viajes/' + v1.json.id, { cookie: capA, body: { cantidad: 1 } })).status === 409);
    ok('ni se borra', (await req('DELETE', '/viajes/' + v1.json.id, { cookie: capA })).status === 409);
    ok('ni entra a una segunda estimación', (await req('POST', '/estimaciones', { cookie: capA, body: { obra_id: obra.id, desde: '2026-11-02', hasta: '2026-11-08' } })).status === 409);
    ok('Excel de la estimación', (await req('GET', `/estimaciones/${est.json.id}/excel`, { cookie: conA })).buf.slice(0, 2).toString() === 'PK');
    ok('B no ve la estimación de A', (await req('GET', '/estimaciones/' + est.json.id, { cookie: dirB })).status === 404);
    ok('requisición antes de aprobación = 409', (await req('POST', `/estimaciones/${est.json.id}/requisicion`, { cookie: capA, body: {} })).status === 409);
    ok('borrador -> aprobada directo = 409', (await req('PATCH', '/estimaciones/' + est.json.id, { cookie: capA, body: { estado: 'aprobada' } })).status === 409);
    await req('PATCH', '/estimaciones/' + est.json.id, { cookie: capA, body: { estado: 'enviada' } });
    ok('enviada -> aprobada', (await req('PATCH', '/estimaciones/' + est.json.id, { cookie: capA, body: { estado: 'aprobada' } })).json.estado === 'aprobada');
    ok('ya no se borra fuera de borrador', (await req('DELETE', '/estimaciones/' + est.json.id, { cookie: capA })).status === 409);

    console.log('\nFacturas');
    const rq = await req('POST', `/estimaciones/${est.json.id}/requisicion`, { cookie: capA, body: { total: 1, subtotal: 1 } });
    ok('requisición: IVA y retención exactos', rq.status === 201 && near(rq.json.subtotal, 5246.12) && near(rq.json.iva, 839.38) && near(rq.json.retencion, 209.84) && near(rq.json.total, 5875.66), JSON.stringify(rq.json));
    ok('con requisición viva la estimación no regresa (no se factura dos veces)', (await req('PATCH', '/estimaciones/' + est.json.id, { cookie: capA, body: { estado: 'enviada' } })).status === 409);
    ok('una sola requisición por estimación', (await req('POST', `/estimaciones/${est.json.id}/requisicion`, { cookie: capA, body: {} })).status === 409);
    ok('emitir sin folio = 400', (await req('PATCH', '/facturas/' + rq.json.id, { cookie: capA, body: { estado: 'emitida' } })).status === 400);
    ok('cobrar antes de emitir = 409', (await req('PATCH', '/facturas/' + rq.json.id, { cookie: capA, body: { estado: 'cobrada' } })).status === 409);
    await req('PATCH', '/facturas/' + rq.json.id, { cookie: capA, body: { estado: 'emitida', folio: 'A-1234', fecha_emision: '2026-11-10' } });
    ok('al emitir, la estimación queda facturada', (await sel('SELECT estado FROM nh_estimaciones WHERE id=:id', { id: est.json.id }))[0].estado === 'facturada');
    const suelta = await req('POST', '/facturas', { cookie: capA, body: { client_id: cl.id, concepto: 'Renta diaria', cantidad: 1, precio_unitario: 6500, total: 1 } });
    ok('requisición suelta 1 x $6,500 = $7,280', suelta.status === 201 && near(suelta.json.total, 7280));
    ok('B no toca facturas de A', (await req('PATCH', '/facturas/' + rq.json.id, { cookie: dirB, body: { estado: 'cobrada' } })).status === 404);

    console.log('\nGastos y diésel');
    const g1 = (await req('POST', '/gastos', { cookie: capA, body: { fecha: '2026-11-11', proveedor: 'Refacciones SIT', categoria: 'refacciones', total: 300, truck_id: t1.id } })).json;
    const dz = (await req('POST', '/gastos', { cookie: capA, body: { fecha: '2026-11-12', proveedor: 'Gasolinera SIT', categoria: 'diesel', total: 1000 } })).json;
    ok('saldo mayor que total = 400', (await req('POST', '/gastos', { cookie: capA, body: { fecha: '2026-11-11', proveedor: 'X', total: 10, saldo: 20 } })).status === 400);
    const rep = await req('PUT', `/gastos/${dz.id}/reparto`, { cookie: capA, body: { filas: [{ truck_id: t1.id, km: 300 }, { truck_id: t2.id, km: 600 }] } });
    ok('diésel repartido por km: $333.33 / $666.67', rep.status === 200 && near(rep.json.reparto[0].monto, 333.33) && near(rep.json.reparto[1].monto, 666.67) && near(rep.json.total, 1000));
    ok('reparto con camión de otra empresa = 404', (await req('PUT', `/gastos/${dz.id}/reparto`, { cookie: dirB, body: { filas: [{ truck_id: t1.id, km: 1 }] } })).status === 404);
    ok('no se reparte un gasto ya asignado a un camión', (await req('PUT', `/gastos/${g1.id}/reparto`, { cookie: capA, body: { filas: [{ truck_id: t2.id, km: 1 }] } })).status === 409);
    ok('programar más que el saldo = 400', (await req('PATCH', '/gastos/' + g1.id, { cookie: capA, body: { estado: 'programado', monto_propuesto: 999 } })).status === 400);
    await req('PATCH', '/gastos/' + g1.id, { cookie: capA, body: { estado: 'programado', monto_propuesto: 100, semana_pago: '2026-11-12' } });
    const pg = (await req('PATCH', '/gastos/' + g1.id, { cookie: capA, body: { estado: 'pagado' } })).json;
    ok('un gasto ya repartido no se asigna además a un camión', (await req('PATCH', '/gastos/' + dz.id, { cookie: capA, body: { truck_id: t1.id } })).status === 409);
    const dup = await req('PUT', `/gastos/${dz.id}/reparto`, { cookie: capA, body: { filas: [{ truck_id: t1.id, km: 300 }, { truck_id: t1.id, km: 300 }, { truck_id: t2.id, km: 600 }] } });
    ok('camión repetido en el reparto cuenta una sola vez', dup.json.reparto.length === 2 && near(dup.json.total, 1000));
    ok('pago parcial deja saldo $200 pendiente', near(pg.saldo, 200) && pg.estado === 'pendiente');

    console.log('\nDiésel por carga (CFDI de la gasolinera) y PPS');
    const mkPdf = (lineas) => new Promise((resolve) => {
      const PDF = require('pdfkit'); const d = new PDF({ size: 'LETTER', margin: 20, compress: false, pdfVersion: '1.4' }); const ch = [];
      d.on('data', (c) => ch.push(c)); d.on('end', () => resolve(Buffer.concat(ch)));
      d.fontSize(6); lineas.forEach((l, i) => d.text(l, 20, 20 + i * 9, { lineBreak: false })); d.end();
    });
    // Mismo formato que el PDF de Gas Manager de la estación J6; datos inventados.
    const cfdi = (uuid, folio, totales) => ['I - INGRESO', uuid, folio, 'LU 01/JUN/26 12:07:16', 'E09999 - GASOLINERA SIT', 'RFC: XAX-010101-000', 'RFC: XEX-010101-000',
      '1510150580.000LTR - LITROS$23.343561$1,828.22$292.52$1,867.48DIESELPL/9999/EXP/ES/2015-1000001', 'JU 28/MAY/26 07:56:191000001', 'FolioDespacho',
      '15101505100.000LTR - LITROS$23.343561$2,285.27$365.64$2,334.36DIESELPL/9999/EXP/ES/2015-1000002', 'VI 29/MAY/26 16:10:041000002', 'FolioDespacho',
      '1510151562.616LTR - LITROS$25.858152$1,573.95$251.83$1,619.14PREMIUMPL/9999/EXP/ES/2015-1000003', 'SA 30/MAY/26 11:36:351000003', 'Mang',
      ...totales, '0.16', 'Tasa', 'SubTotal:', 'Tarjeta: 111, Titular: SIT, Placas:'];
    const XLSX = require('xlsx');
    const ppsBuf = (rows) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'NEOHAUL'); return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }); };
    const H = ['ORDEN', 'EMPRESA', 'NUM FACT', 'FECHA', 'TIPO', 'SALDO', 'PROVEEDOR', 'TOTAL FACT', 'CONCEPTO', 'CC', 'DESC CC', 'EXPLICACION', 'PRIORIDAD', 'SI NO PARCIAL', 'PAGO PARCIAL', 'PROPUESTA'];
    const filaPps = (o, folio, serial, saldo, prov, total, cc) => [o, 'NEOHAUL', folio, serial, '            ', saldo, prov + '          ', total, 'Factura        ', cc || 'GENERAL     ', 'NEOHAUL', '', '', '', '', '0'];
    const pps1 = ppsBuf([[3, '', '', '', '', 9731.97, '', 9731.97], H, filaPps(1, 'CC-500        ', 46175, 6730.97, 'GASOLINERA SIT', 6730.97),
      filaPps(2, 4002, 46174, 3000, 'REFACCIONES SIT', 3000, 'N16'), filaPps(3, 'X-9', 46174, 900, 'PROVEEDOR MAL', 800)]);
    const ip = await req('POST', '/gastos/importar-pps', { cookie: capA, raw: multipart({}, 'archivo', { name: 'PPS.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: ppsBuf([]) }) });
    ok('un Excel que no es PPS se rechaza con el motivo', ip.status === 400 && ip.json.error === 'no_es_pps');
    const p1 = await req('POST', '/gastos/importar-pps', { cookie: capA, raw: multipart({}, 'archivo', { name: 'PPS.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: pps1 }) });
    ok('PPS: 2 nuevas, la de saldo > total se rechaza y se nombra', p1.status === 200 && p1.json.creadas === 2 && p1.json.rechazadas.length === 1 && p1.json.rechazadas[0].motivo === 'saldo', JSON.stringify(p1.json));
    ok('PPS: compara con su renglón de totales (aquí no cuadra: trae 3 facturas)', p1.json.control && p1.json.control.cuadra === false);
    const gPps = await sel("SELECT * FROM nh_gastos WHERE tenant_id=:t AND origen='pps' ORDER BY id", { t: A });
    ok('PPS: fecha serial de Excel 46175 = 2026-06-02, espacios recortados, categoría sugerida', gPps.length === 2 && String(gPps[0].fecha).slice(0, 10) === '2026-06-02' && gPps[0].folio === 'CC-500' && gPps[0].proveedor === 'GASOLINERA SIT' && gPps[0].categoria === 'diesel', JSON.stringify(gPps[0]));
    const pps2 = ppsBuf([[1, '', '', '', '', 1000, '', 6730.97], H, filaPps(1, 'CC-500', 46175, 1000, 'GASOLINERA SIT', 6730.97)]);
    const p2 = (await req('POST', '/gastos/importar-pps', { cookie: capA, raw: multipart({}, 'archivo', { name: 'PPS2.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: pps2 }) })).json;
    ok('PPS de la semana siguiente actualiza el saldo, no duplica', p2.creadas === 0 && p2.actualizadas === 1 && near((await sel('SELECT saldo FROM nh_gastos WHERE id=:id', { id: gPps[0].id }))[0].saldo, 1000));
    ok('PPS: lo que ya no viene se avisa y NO se marca pagado solo', p2.no_vienen.some((x) => x.folio === '4002') && (await sel('SELECT estado FROM nh_gastos WHERE id=:id', { id: gPps[1].id }))[0].estado === 'pendiente');
    ok('PPS: B no ve ni actualiza las facturas de A', ((await req('GET', '/gastos', { cookie: dirB })).json || []).length === 0);

    const malo = await mkPdf(cfdi('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEE0001', 'CC-501', ['$5,821.98', '$909.99', '$6,731.97']));
    const dm = await req('POST', '/diesel/importar', { cookie: capA, raw: multipart({}, 'archivo', { name: 'f.pdf', type: 'application/pdf', data: malo }) });
    ok('factura cuyas cargas no suman su total = 422 y no crea nada', dm.status === 422 && dm.json.error === 'no_cuadra' && (await sel("SELECT COUNT(*)::int AS n FROM nh_gastos WHERE tenant_id=:t AND folio='CC-501'", { t: A }))[0].n === 0);
    const bueno = await mkPdf(cfdi('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEE0002', 'CC-500', ['$5,820.98', '$909.99', '$6,730.97']));
    const di = await req('POST', '/diesel/importar', { cookie: capA, raw: multipart({}, 'archivo', { name: 'f.pdf', type: 'application/pdf', data: bueno }) });
    ok('PDF de la gasolinera: 3 cargas, 242.616 L, cuadra al centavo', di.status === 201 && di.json.cargas === 3 && di.json.litros === 242.616 && near(di.json.total, 6730.97), JSON.stringify(di.json));
    ok('se agrega a la factura que ya venía en el PPS (no la duplica)', di.json.adjuntado_a_existente === true && di.json.gasto_id === gPps[0].id
      && (await sel("SELECT COUNT(*)::int AS n FROM nh_gastos WHERE tenant_id=:t AND upper(folio)='CC-500'", { t: A }))[0].n === 1);
    ok('la misma factura dos veces = 409', (await req('POST', '/diesel/importar', { cookie: capA, raw: multipart({}, 'archivo', { name: 'f.pdf', type: 'application/pdf', data: bueno }) })).status === 409);
    const foto = await req('POST', '/diesel/importar', { cookie: capA, raw: multipart({}, 'archivo', { name: 'f.jpg', type: 'image/jpeg', data: jpg }) });
    ok('una foto no es un CFDI: 415 con el arreglo', foto.status === 415 && foto.json.error === 'usa_pdf_o_xml_del_cfdi');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Serie="CC" Folio="502" Fecha="2026-06-08T10:00:00" SubTotal="3734.96" Total="4320.00">
      <cfdi:Emisor Rfc="XAX010101000" Nombre="GASOLINERA SIT"/><cfdi:Receptor Rfc="XEX010101000"/><cfdi:Conceptos>
      <cfdi:Concepto Cantidad="80.000" ValorUnitario="23.343561" Importe="1867.48" NoIdentificacion="PL/9999-2000001" Descripcion="DIESEL"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="292.52"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>
      <cfdi:Concepto Cantidad="80.000" ValorUnitario="23.343561" Importe="1867.48" NoIdentificacion="PL/9999-2000002" Descripcion="DIESEL"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="292.52"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>
      </cfdi:Conceptos><cfdi:Impuestos TotalImpuestosTrasladados="585.04"/><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="x" UUID="AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEE0003"/></cfdi:Complemento></cfdi:Comprobante>`;
    const dx = await req('POST', '/diesel/importar', { cookie: capA, raw: multipart({}, 'archivo', { name: 'f.xml', type: 'text/xml', data: Buffer.from(xml) }) });
    ok('XML CFDI 4.0: 2 cargas, nueva cuenta por pagar', dx.status === 201 && dx.json.cargas === 2 && dx.json.adjuntado_a_existente === false && near(dx.json.total, 4320), JSON.stringify(dx.json));
    const gd = di.json.gasto_id;
    const det = (await req('GET', '/diesel/' + gd, { cookie: capA })).json;
    ok('las cargas nacen sin camión', det.cargas.length === 3 && det.sin_asignar.cargas === 3 && near(det.sin_asignar.total, 6730.97));
    ok('B no ve las cargas de A', (await req('GET', '/diesel/' + gd, { cookie: dirB })).status === 404);
    const [c1d, c2d, c3d] = det.cargas;
    const truckB = (await req('POST', '/trucks', { cookie: dirB, body: { empresa: 'TTS', unidad: 'B T-01' } })).json;
    ok('asignar una carga a un camión de otra empresa = 404', (await req('PUT', `/diesel/${gd}/cargas`, { cookie: capA, body: { asignaciones: [{ id: c1d.id, truck_id: truckB.id }] } })).status === 404);
    ok('B no asigna cargas de A', (await req('PUT', `/diesel/${gd}/cargas`, { cookie: dirB, body: { asignaciones: [{ id: c1d.id, truck_id: truckB.id }] } })).status === 404);
    ok('contador no asigna', (await req('PUT', `/diesel/${gd}/cargas`, { cookie: conA, body: { asignaciones: [{ id: c1d.id, truck_id: t1.id }] } })).status === 403);
    const as = await req('PUT', `/diesel/${gd}/cargas`, { cookie: capA, body: { asignaciones: [{ id: c1d.id, truck_id: t1.id }, { id: c2d.id, truck_id: t1.id }, { id: c3d.id, truck_id: null }] } });
    ok('asignadas: T-01 lleva 2 cargas ($2,160 + $2,700 = $4,860), la premium queda general', as.status === 200 && near(as.json.por_camion['SIT T-01'].total, 4860) && as.json.sin_asignar.cargas === 1, JSON.stringify(as.json.por_camion));
    ok('con cargas ya no se reparte por km', (await req('PUT', `/gastos/${gd}/reparto`, { cookie: capA, body: { filas: [{ truck_id: t1.id, km: 1 }] } })).json.error === 'tiene_cargas');
    ok('con cargas no se asigna además entera a un camión', (await req('PATCH', '/gastos/' + gd, { cookie: capA, body: { truck_id: t2.id } })).status === 409);
    const tbd = (await req('GET', '/tablero?desde=2026-05-25', { cookie: conA })).json;
    const cd1 = tbd.camiones.find((c) => c.id === t1.id);
    ok('el diésel cuenta en la semana de la CARGA (25-may), no de la factura (2-jun)', cd1 && near(cd1.diesel, 4860) && Number(cd1.litros) === 180 && near(cd1.costos, 4860), JSON.stringify(cd1));
    ok('el tablero avisa las cargas sin camión de la semana', tbd.diesel_sin_asignar.n === 1 && near(tbd.diesel_sin_asignar.total, 1870.97), JSON.stringify(tbd.diesel_sin_asignar));
    const tbJun = (await req('GET', '/tablero?desde=2026-06-01', { cookie: conA })).json;
    ok('la semana de la factura no la cuenta dos veces', near((tbJun.camiones.find((c) => c.id === t1.id) || {}).diesel || 0, 0));

    const ex = await req('GET', '/gastos/pps.xlsx?semana=2026-11-09', { cookie: conA });
    const exRows = XLSX.utils.sheet_to_json(XLSX.read(ex.buf, { type: 'buffer' }).Sheets.NEOHAUL, { header: 1, raw: true, defval: '' });
    ok('PPS de salida: sus mismas 16 columnas', ex.status === 200 && JSON.stringify(exRows[1]) === JSON.stringify(H), JSON.stringify(exRows[1]));
    const exSaldo = exRows.slice(2).reduce((a, r) => a + Math.round(Number(r[5]) * 100), 0) / 100;
    ok('PPS de salida: el renglón 1 suma el saldo de sus filas', exRows.length > 2 && near(exRows[0][5], exSaldo) && exRows[0][0] === exRows.length - 2);
    ok('PPS de salida: fecha como fecha de Excel', exRows.slice(2).some((r) => r[2] === 'CC-500' && r[3] === 46175), JSON.stringify(exRows.slice(2).map((r) => r.slice(0, 4))));
    const exB = await req('GET', '/gastos/pps.xlsx', { cookie: dirB });
    ok('PPS de B no trae nada de A', XLSX.utils.sheet_to_json(XLSX.read(exB.buf, { type: 'buffer' }).Sheets.NEOHAUL, { header: 1 }).length === 2);

    ok('teléfono inválido = 400 con el motivo', (await req('POST', '/drivers', { cookie: dirA, body: { nombre: 'X', telefono: '123' } })).json.error === 'telefono_invalido');
    const dus = (await req('POST', '/drivers', { cookie: dirA, body: { nombre: 'Prueba WhatsApp EE. UU.', telefono: '+1 813 641 4177', puesto: 'chofer' } })).json;
    ok('teléfono de EE. UU. con +1 se guarda +18136414177', dus.telefono === '+18136414177');
    const dmx = (await req('POST', '/drivers', { cookie: dirA, body: { nombre: 'Prueba MX', telefono: '81 3641 4177', puesto: 'chofer' } })).json;
    ok('el mismo número sin lada se guarda como México (+52): por eso la pantalla lo advierte', dmx.telefono === '+528136414177');
    ok('editar con teléfono inválido = 400, no 500', (await req('PATCH', '/drivers/' + dus.id, { cookie: dirA, body: { telefono: 'abc' } })).status === 400);
    const vv = await req('POST', '/viajes', { cookie: capA, body: { fecha: '2026-11-05', obra_id: obra.id, tarifa_id: tar22.id, vale_no: 'V-41971', ticket_no: 'F-1', cantidad: 21.07 } });
    ok('el mismo vale en otro viaje = 409 (sería cobrar dos veces)', vv.status === 201 && (await req('POST', '/viajes', { cookie: capA, body: { fecha: '2026-11-05', obra_id: obra.id, tarifa_id: tar22.id, vale_no: 'V-41971', ticket_no: 'F-2', cantidad: 21.07 } })).json.error === 'vale_duplicado');
    await req('DELETE', '/viajes/' + vv.json.id, { cookie: capA });

    console.log('\nArreglos de la revisión de seguridad');
    // Foto del precio: cambiar la tarifa y luego editar solo las notas no re-cotiza el viaje.
    const tarF = (await req('POST', '/tarifas', { cookie: dirA, body: { nombre: 'Foto SIT', unidad: 'tonelada', precio: 100 } })).json;
    const vF = (await req('POST', '/viajes', { cookie: capA, body: { fecha: '2026-10-20', obra_id: obra.id, tarifa_id: tarF.id, cantidad: 2 } })).json;
    await req('PATCH', '/tarifas/' + tarF.id, { cookie: dirA, body: { precio: 150, unidad: 'viaje' } });
    const eF = await req('PATCH', '/viajes/' + vF.id, { cookie: capA, body: { notas: 'solo una nota' } });
    ok('editar notas de un viaje viejo NO lo re-cotiza con la tarifa nueva ($200 sigue $200, en t)', eF.status === 200 && near(eF.json.importe, 200) && eF.json.unidad === 'tonelada', JSON.stringify(eF.json));
    const eF2 = await req('PATCH', '/viajes/' + vF.id, { cookie: capA, body: { tarifa_id: tarF.id, cantidad: 3 } });
    ok('cambiar la cantidad con la misma tarifa usa el precio de la foto ($300)', near(eF2.json.importe, 300));
    await req('DELETE', '/viajes/' + vF.id, { cookie: capA });
    // Corrección de tarifas sembradas: con viajes, se retira y se agrega fila nueva; sin viajes, se corrige en su lugar.
    const qA = (sql, r) => db.query(sql, { replacements: r || {} });
    const [[escV]] = await qA("INSERT INTO nh_tarifas (tenant_id,nombre,material,unidad,precio,por_confirmar) VALUES (:t,'Escombro','escombro','tonelada',250,TRUE) RETURNING id", { t: A });
    await qA("INSERT INTO nh_viajes (tenant_id,fecha,obra_id,tarifa_id,cantidad,unidad,precio_unitario,importe) VALUES (:t,'2026-10-01',:o,:ta,20,'tonelada',250,5000)", { t: A, o: obra.id, ta: escV.id });
    const [[b44]] = await qA("INSERT INTO nh_tarifas (tenant_id,nombre,unidad,precio,por_confirmar) VALUES (:t,'Planta Santiago → bacheo Santiago','dia',4400,TRUE) RETURNING id", { t: A });
    await require('./src/schema').confirmarTarifas(qA, A);
    const escAhora = (await sel('SELECT * FROM nh_tarifas WHERE id=:id', { id: escV.id }))[0];
    const escNueva = (await sel("SELECT * FROM nh_tarifas WHERE tenant_id=:t AND nombre='Escombro (20 t por viaje)'", { t: A }))[0];
    ok('escombro con viajes: la vieja se retira intacta ($250/t) y la confirmada es fila nueva ($4,500/viaje)', escAhora.active === false && Number(escAhora.precio) === 250 && escAhora.unidad === 'tonelada' && escNueva && Number(escNueva.precio) === 4500 && escNueva.unidad === 'viaje');
    ok('el viaje viejo de escombro conserva $5,000', near((await sel('SELECT importe FROM nh_viajes WHERE tenant_id=:t AND tarifa_id=:ta', { t: A, ta: escV.id }))[0].importe, 5000));
    const b44n = (await sel('SELECT * FROM nh_tarifas WHERE id=:id', { id: b44.id }))[0];
    ok('$4,400 sin viajes: se corrige en su lugar a viaje, confirmada', b44n.unidad === 'viaje' && b44n.por_confirmar === false && b44n.active === true);
    ok('la corrección queda en la bitácora', (await sel("SELECT COUNT(*)::int AS n FROM nh_activity WHERE tenant_id=:t AND action='tarifa_confirmada'", { t: A }))[0].n === 2);
    // PPS: lo que la app sabe gana.
    await req('PATCH', '/gastos/' + gPps[1].id, { cookie: capA, body: { estado: 'pagado' } });
    const pps3 = ppsBuf([[2, '', '', '', '', 0, '', 0], H, filaPps(1, 'CC 500', 46175, 6730.97, 'ESTACION OTRO NOMBRE', 7000), filaPps(2, 4002, 46174, 3000, 'REFACCIONES SIT', 3000, 'N16')]);
    const p3 = (await req('POST', '/gastos/importar-pps', { cookie: capA, raw: multipart({}, 'archivo', { name: 'PPS3.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: pps3 }) })).json;
    const g4002 = (await sel('SELECT * FROM nh_gastos WHERE id=:id', { id: gPps[1].id }))[0];
    ok('una factura pagada en la app no se reabre con un PPS viejo (y se avisa)', g4002.estado === 'pagado' && p3.avisos.some((x) => x.aviso === 'ya_pagada_en_la_app'), JSON.stringify(p3.avisos));
    ok('otro proveedor con folio parecido y OTRO total no se confunde: es factura nueva', p3.creadas === 1);
    const pps4 = ppsBuf([[1, '', '', '', '', 0, '', 0], H, filaPps(1, 'CC 500', 46175, 5000, 'ESTACION J6 OTRO NOMBRE', 6730.97)]);
    const p4 = (await req('POST', '/gastos/importar-pps', { cookie: capA, raw: multipart({}, 'archivo', { name: 'PPS4.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: pps4 }) })).json;
    ok('folio escrito distinto ("CC 500") + mismo total = la misma factura, no duplicado', p4.creadas === 0 && p4.actualizadas === 1, JSON.stringify(p4));
    ok('un saldo mayor que el de la app no sube (PPS viejo) y se avisa', near((await sel('SELECT saldo FROM nh_gastos WHERE id=:id', { id: gPps[0].id }))[0].saldo, 1000) && p4.avisos.some((x) => x.aviso === 'saldo_mayor_que_en_la_app'));
    const pps5 = ppsBuf([[1, '', '', '', '', 0, '', 0], H, filaPps(1, 'CC-500', 46175, 900, 'GASOLINERA SIT', 9999)]);
    const p5 = (await req('POST', '/gastos/importar-pps', { cookie: capA, raw: multipart({}, 'archivo', { name: 'PPS5.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: pps5 }) })).json;
    ok('con cargas, el PPS no cambia el total (las cargas dejarían de cuadrar) y se avisa', near((await sel('SELECT total FROM nh_gastos WHERE id=:id', { id: gPps[0].id }))[0].total, 6730.97) && p5.avisos.some((x) => x.aviso === 'total_distinto_con_cargas'), JSON.stringify(p5));
    // Entradas hostiles o rotas.
    const xmlDt = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><cfdi:Comprobante Total="1"></cfdi:Comprobante>';
    ok('XML con DOCTYPE/ENTITY se rechaza antes de leerlo', (await req('POST', '/diesel/importar', { cookie: capA, raw: multipart({}, 'archivo', { name: 'x.xml', type: 'text/xml', data: Buffer.from(xmlDt) }) })).json.error === 'xml_con_doctype');
    ok('carga sin litros = factura rechazada, no corregida', D.cerrarDiesel({ total: 0, cargas: [{ folio_despacho: '1', litros: 0, importe: 0, iva: 0, total: 0 }] }).error === 'carga_invalida');
    ok('UUID que no tiene la forma del SAT se descarta', D.cerrarDiesel({ uuid: 'x'.repeat(80), total: 1, cargas: [{ folio_despacho: '1', litros: 1, importe: 1, iva: 0, total: 1 }] }).uuid === null);
    ok('más de 2,000 asignaciones = 400, no se recortan en silencio', (await req('PUT', `/diesel/${gd}/cargas`, { cookie: capA, body: { asignaciones: Array.from({ length: 2001 }, () => ({ id: c1d.id, truck_id: t1.id })) } })).json.error === 'demasiadas_cargas');
    ok('ORDEN no entero del PPS no rompe la importación', D.parsePps([H, [3.5, 'NEOHAUL', 'A1', 46175, '', 10, 'P', 10]]).filas[0].orden === null);
    const big = 'Fecha,Ticket,Toneladas\n' + Array.from({ length: 2100 }, (_, i) => `05/11/2026,BIG-${i},1`).join('\n');
    ok('hoja de más de 2,000 renglones se rechaza entera (no a medias)', (await req('POST', '/viajes/importar', { cookie: capA, raw: multipart({ obra_id: obra.id, tarifa_id: tar22.id }, 'archivo', { name: 'b.csv', type: 'text/csv', data: Buffer.from(big) }) })).json.error === 'demasiados_renglones');
    const [[viejo]] = await qA("INSERT INTO nh_drivers (tenant_id,nombre,telefono) VALUES (:t,'Chofer viejo','81-1234') RETURNING id", { t: A });
    ok('un teléfono viejo sin tocar no impide editar lo demás', (await req('PATCH', '/drivers/' + viejo.id, { cookie: dirA, body: { nombre: 'Chofer viejo 2', telefono: '81-1234' } })).status === 200);
    const pdfChild = fs.readFileSync(path.join(__dirname, 'src', 'pdf-child.js'), 'utf8'), idxSrc = fs.readFileSync(path.join(__dirname, 'src', 'index.js'), 'utf8');
    ok('el PDF se lee en un PROCESO aparte, sin eval y sin variables de entorno', /fork\(path\.join\(__dirname, 'pdf-child\.js'\), \[\], \{ env: \{\}, execArgv: \['--disallow-code-generation-from-strings'/.test(idxSrc) && !/pdf-parse/.test(fs.readFileSync(path.join(__dirname, 'src', 'xlsx-worker.js'), 'utf8')) && /pdf-parse/.test(pdfChild));

    const disp = await req('GET', '/disponibles?fecha=2026-11-11', { cookie: capA });
    ok('camiones libres para asignar responde (choferes y camiones tienen columna empresa)', disp.status === 200 && Array.isArray(disp.json) && disp.json.length > 0, disp.status + ' ' + JSON.stringify(disp.json).slice(0, 120));
    console.log('\nNómina');
    const nom = (await req('GET', '/nomina?semana=2026-11-03', { cookie: capA })).json;
    const fila = nom.filas.find((r) => r.driver_id === drv.id);
    ok('base de comisión = sus viajes confirmados ($5,246.12)', fila && near(fila.base_actual, 5246.12));
    const sv = await req('PUT', '/nomina', { cookie: capA, body: { driver_id: drv.id, semana: '2026-11-05', salario: 2000, bonos: 150, comision_pct: 10, comision: 99999, total: 1 } });
    ok('comisión 10% = $524.61 y total calculado', sv.status === 200 && near(sv.json.comision, 524.61) && near(sv.json.total, 2674.61), JSON.stringify(sv.json));
    ok('comisión fuera de 8-10% = 400', (await req('PUT', '/nomina', { cookie: capA, body: { driver_id: drv.id, semana: '2026-11-02', comision_pct: 5 } })).status === 400);
    ok('bono absurdo = 400', (await req('PUT', '/nomina', { cookie: capA, body: { driver_id: drv.id, semana: '2026-11-02', bonos: 900000 } })).status === 400);
    ok('comisión de 20% = 400', (await req('PUT', '/nomina', { cookie: capA, body: { driver_id: drv.id, semana: '2026-11-02', comision_pct: 20 } })).status === 400);
    await req('POST', '/nomina/cerrar', { cookie: capA, body: { semana: '2026-11-02' } });
    ok('semana cerrada no se edita', (await req('PUT', '/nomina', { cookie: capA, body: { driver_id: drv.id, semana: '2026-11-02', bonos: 1 } })).status === 409);

    console.log('\nTaller y tablero');
    const ts = (await req('POST', '/taller', { cookie: capA, body: { fecha: '2026-11-10', cliente: 'Inova Vial', unidad_externa: 'Pipa HPA 03', trabajos: 'Engrasado', refacciones: 120, mano_obra: 380, total: 1 } })).json;
    ok('servicio a empresa hermana queda por cobrar con total calculado', ts.estado === 'por_cobrar' && near(ts.total, 500));
    const tb = (await req('GET', '/tablero?desde=2026-11-10', { cookie: conA })).json;
    const c1 = tb.camiones.find((c) => c.id === t1.id), c2 = tb.camiones.find((c) => c.id === t2.id);
    ok('costos por camión = gasto + diésel repartido', c1 && near(c1.costos, 633.33), JSON.stringify(c1));
    ok('camión propio con costo y sin viajes = resultado negativo', c2 && near(c2.margen, -666.67));
    ok('por cobrar incluye la factura emitida', near(tb.por_cobrar_total, 5875.66));
    ok('TTS no aparece como camión propio', !tb.camiones.some((c) => c.id === t3.id));
    ok('taller por cobrar', near(tb.taller_por_cobrar.total, 500));
    const tbv = (await req('GET', '/tablero?desde=2026-11-03', { cookie: conA })).json;
    const c1v = tbv.camiones.find((c) => c.id === t1.id);
    ok('semana con viajes y sin costos dice "sin costos", no ganancia', c1v && c1v.sin_costos === true && c1v.margen === null && Number(c1v.ingresos) > 0);
    const tbB = (await req('GET', '/tablero?desde=2026-11-10', { cookie: dirB })).json;
    ok('el tablero de B no ve nada de A', tbB.por_cobrar_total === 0 && tbB.camiones.length === 0);

    console.log('\nUsuarios');
    const nu = await req('POST', '/usuarios', { cookie: dirA, body: { email: `sit-nh-new-${STAMP}@example.test`, role: 'capturista' } });
    ok('alta con contraseña temporal mostrada una vez', nu.status === 201 && nu.json.password_temporal && nu.json.password_temporal.length === 14);
    ok('no se puede crear un dueño', (await req('POST', '/usuarios', { cookie: dirA, body: { email: `x-${STAMP}@example.test`, role: 'owner' } })).status === 400);
    const lst = (await req('GET', '/usuarios', { cookie: dirA })).json;
    ok('la lista no expone el hash', lst.every((u) => !('password_hash' in u)));
    ok('un director no crea otro director', (await req('POST', '/usuarios', { cookie: dirA, body: { email: `d2-${STAMP}@example.test`, role: 'director' } })).status === 403);
    const [[dirA2]] = await db.query("INSERT INTO nh_users (tenant_id,email,role,password_hash,must_change) VALUES (:t,:e,'director',:h,FALSE) RETURNING id", { replacements: { t: A, e: `sit-nh-dir2-${STAMP}@example.test`, h: hash } });
    ok('un director no resetea a otro director', (await req('PATCH', '/usuarios/' + dirA2.id, { cookie: dirA, body: { reset: true } })).status === 404);
    ok('B no administra usuarios de A', (await req('PATCH', '/usuarios/' + nu.json.id, { cookie: dirB, body: { active: false } })).status === 404);
    await req('PATCH', '/usuarios/' + nu.json.id, { cookie: dirA, body: { reset: true } });
  } catch (e) {
    ok('sin excepciones', false, e && (e.stack || e.message));
  } finally {
    for (const t of tenants) {
      for (const tb of ['nh_diesel_cargas', 'nh_activity', 'nh_taller', 'nh_nomina', 'nh_gasto_reparto', 'nh_gastos', 'nh_facturas', 'nh_estimaciones', 'nh_viajes', 'nh_files', 'nh_asignaciones', 'nh_pedidos', 'nh_tarifas', 'nh_obras', 'nh_clients', 'nh_drivers', 'nh_trucks', 'nh_users']) {
        await db.query(`DELETE FROM ${tb} WHERE tenant_id=:t`, { replacements: { t } }).catch(() => {});
      }
      await db.query('DELETE FROM nh_tenants WHERE id=:t', { replacements: { t } }).catch(() => {});
    }
    server.close();
    console.log(`\nNeoHaul SIT: ${pass}/${pass + fail}`);
    if (fails.length) console.log('Fallas:\n - ' + fails.join('\n - '));
    console.log('NO cubierto: ingreso del dueño con la contraseña del CRM, lectura real del ticket con el modelo, el navegador.');
    await db.close();
    process.exit(fail ? 1 : 0);
  }
})();
