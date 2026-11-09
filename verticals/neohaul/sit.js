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
    ok('solo llm.js llega a un modelo', files.filter((f) => /@anthropic-ai\/sdk/.test(code[f])).join() === 'llm.js');
    ok('ningún transporte de mensajes en el vertical', !files.some((f) => /twilio|sendgrid|nodemailer|graph\.facebook|messages\.create\(\s*\{\s*to/i.test(code[f])));
    ok('el servidor no lee importe/subtotal/total del cuerpo', !/body\.(importe|subtotal|total|iva|retencion|precio_unitario)\b/.test(code['index.js'].replace(/b\.precio_unitario/g, 'PU_SUELTA')) && !/b\.(importe|subtotal|iva|retencion)\b/.test(code['index.js']));
    ok('el tenant nunca sale del cuerpo', !/body\.tenant_id|b\.tenant_id/.test(code['index.js']));
    ok('el lector no calcula importes', !/importe/.test(code['llm.js']));

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
      for (const tb of ['nh_activity', 'nh_taller', 'nh_nomina', 'nh_gasto_reparto', 'nh_gastos', 'nh_facturas', 'nh_estimaciones', 'nh_viajes', 'nh_files', 'nh_asignaciones', 'nh_pedidos', 'nh_tarifas', 'nh_obras', 'nh_clients', 'nh_drivers', 'nh_trucks', 'nh_users']) {
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
