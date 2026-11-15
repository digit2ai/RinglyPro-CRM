'use strict';
/**
 * Forzza SIT. Desde la raíz del repo:
 *   node -e "require('dotenv').config();require('./verticals/forzza/sit.js')"
 * Sin llaves externas. Usa la base de .env con dos empresas desechables sit-fz-*,
 * borradas al final. Ataca las reglas: el escenario del simulador reproducido al
 * centavo, cobros vencidos que no se inventan, abonos que no pasan del saldo,
 * pagos sin aprobar, aislamiento entre empresas, solo lectura, importaciones
 * que no duplican y concilian, y que ningún dato real del cliente viva en el repo.
 * NO cubre: ingreso del dueño contra la tabla users del CRM, el navegador,
 * archivos reales de SICAR o del banco (aún no los tenemos).
 */
process.env.FORZZA_JWT_SECRET = process.env.FORZZA_JWT_SECRET || 'sit-only-secret-' + Date.now();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const bcrypt = require('bcryptjs');
const E = require('./src/engine');
const router = require('./src/index');
const db = require('./src/db');

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) { if (cond) pass++; else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); } console.log((cond ? '  ✓ ' : '  ✗ ') + name); }

const app = express(); app.use('/forzza/app', router);
const server = http.createServer(app);
let base;
function req(method, p, { body, cookie, header = true, raw, headers: extra } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { ...(extra || {}) };
    if (header) headers['X-Forzza'] = '1';
    if (cookie) headers.Cookie = cookie;
    let data = null;
    if (raw) { data = raw.body; headers['Content-Type'] = raw.type; }
    else if (body !== undefined) { data = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(base + '/forzza/app/api/v1' + p, { method, headers }, (res) => {
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
function multipart(fields, file) {
  const b = '----sit' + Date.now(); const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="archivo"; filename="${file.name}"\r\nContent-Type: ${file.type || 'text/csv'}\r\n\r\n`), Buffer.from(file.data), Buffer.from(`\r\n--${b}--\r\n`));
  return { body: Buffer.concat(parts), type: 'multipart/form-data; boundary=' + b };
}
const q = (sql, r) => db.query(sql, { replacements: r || {}, type: db.QueryTypes.SELECT });
const hoyMx = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);

(async () => {
  const STAMP = Date.now();
  const tenants = [];
  let deferReal = false;
  try {
    await router.ready;
    await new Promise((r) => server.listen(0, r));
    base = 'http://127.0.0.1:' + server.address().port;

    console.log('\nMotor (engine.js)');
    const h0 = '2026-11-16', d = (n) => E.addDays(h0, n), C = (x) => x * 100;
    const deck = {
      hoy: h0, horizonte: 60, reserva: 30000, efectivo: C(150000),
      cxc: [{ id: 1, cliente: 'A', vencimiento: d(20), pendiente: C(120000) }, { id: 2, cliente: 'B', vencimiento: d(35), pendiente: C(80000) }],
      cxp: [{ id: 1, proveedor: 'PA', vencimiento: d(7), pendiente: C(90000) }, { id: 2, proveedor: 'PB', vencimiento: d(15), pendiente: C(60000) },
        { id: 3, proveedor: 'Nom', vencimiento: d(15), pendiente: C(45000) }, { id: 4, proveedor: 'Veh', vencimiento: d(10), pendiente: C(12000) }, { id: 5, proveedor: 'Otr', vencimiento: d(25), pendiente: C(18000) }]
    };
    const p = E.proyectar(deck);
    ok('escenario del simulador: mínimo -$57,000 el día 15', p.minimo.saldo === C(-57000) && p.minimo.fecha === d(15));
    ok('faltan $87,000 para la reserva de $30,000, final $125,000', p.falta_para_reserva === C(87000) && p.final === C(125000));
    ok('primer día negativo y bajo la reserva', p.primero_negativo === d(15) && p.primero_bajo_reserva === d(15) && p.serie[7].saldo === C(60000));
    const ven = E.proyectar({ ...deck, cxc: [{ id: 9, cliente: 'Z', vencimiento: d(-10), pendiente: C(50000) }], cxp: [] });
    ok('cobro vencido NO se cuenta por omisión y se reporta aparte', ven.final === C(150000) && ven.vencido_no_contado.length === 1 && ven.vencido_no_contado[0].dias_vencido === 10);
    ok('con vencido=hoy se cuenta hoy', E.proyectar({ ...deck, cxc: ven.vencido_no_contado.length ? [{ id: 9, cliente: 'Z', vencimiento: d(-10), pendiente: C(50000) }] : [], cxp: [], opciones: { vencido: 'hoy' } }).serie[0].saldo === C(200000));
    ok('compromiso de pago futuro pone el cobro vencido en su fecha', E.proyectar({ ...deck, cxp: [], cxc: [{ id: 9, cliente: 'Z', vencimiento: d(-10), compromiso_fecha: d(5), pendiente: C(50000) }] }).serie[5].saldo === C(200000));
    const pv = E.proyectar({ ...deck, cxc: [], cxp: [{ id: 1, proveedor: 'X', vencimiento: d(-3), pendiente: C(1000) }] });
    ok('pago vencido SÍ se cuenta hoy', pv.serie[0].saldo === C(149000) && pv.eventos[0].vencido === true);
    ok('pago programado usa su fecha programada', E.proyectar({ ...deck, cxc: [], cxp: [{ id: 1, proveedor: 'X', vencimiento: d(2), fecha_programada: d(9), pendiente: C(1000) }] }).serie[8].saldo === C(150000));
    const ret = E.proyectar({ ...deck, opciones: { retraso: 10 } });
    ok('retraso de cobranza mueve los cobros', ret.eventos.find((e) => e.ref === 'cxc:1').fecha === d(30));
    ok('quincenal = 15 y fin de mes', JSON.stringify(E.ocurrencias({ frecuencia: 'quincenal' }, '2026-11-16', '2027-01-05')) === JSON.stringify(['2026-11-30', '2026-12-15', '2026-12-31']));
    ok('mensual día 31 cae en el último día de meses cortos', E.ocurrencias({ frecuencia: 'mensual', dia: 31 }, '2027-02-01', '2027-04-30').join() === '2027-02-28,2027-03-31,2027-04-30');
    ok('semanal viernes respeta pagado_hasta', E.ocurrencias({ frecuencia: 'semanal', dia: 5, pagado_hasta: '2026-11-20' }, '2026-11-16', '2026-12-10').join() === '2026-11-27,2026-12-04');
    ok('gasto fijo con hasta (última mensualidad) se detiene', E.ocurrencias({ frecuencia: 'mensual', dia: 10, hasta: '2027-01-10' }, '2026-11-16', '2027-06-01').length === 2);
    const fj = E.proyectar({ hoy: h0, horizonte: 30, efectivo: C(100000), fijos: [{ id: 1, concepto: 'Nómina', monto: '45000.00', frecuencia: 'quincenal' }] });
    ok('nómina quincenal descuenta dos veces en 30 días', fj.final === C(10000));
    ok('reserva vacía: sin alerta de reserva, y lo dice', E.proyectar({ ...deck, reserva: null }).primero_bajo_reserva === null && E.alertas(E.proyectar({ ...deck, reserva: null })).some((a) => a.clave === 'sin_reserva'));
    const ag = E.antiguedad([{ vencimiento: d(5), pendiente: 100 }, { vencimiento: d(-1), pendiente: 200 }, { vencimiento: d(-45), pendiente: 300 }, { vencimiento: d(-120), pendiente: 400 }], h0);
    ok('antigüedad por tramos', ag.por_vencer.monto === 100 && ag.d1_30.monto === 200 && ag.d31_60.monto === 300 && ag.d90_mas.monto === 400 && ag.vencido === 900 && ag.total === 1000);
    const sv = E.simularVenta({ ...deck }, { precio: 100000, costo: 75000, entrega: 5000, anticipo: 0, dia_entrega: 5, dia_proveedor: 5, dias_credito: 30 });
    ok('simulación: margen $20,000, sale $80,000 antes de cobrar', sv.margen === C(20000) && sv.salida_antes_de_cobrar === C(80000) && sv.saldo_a_credito === C(100000));
    ok('simulación: el pedido baja el punto más bajo en $80,000', sv.cambio_minimo === C(-80000) && sv.con.primero_negativo);
    ok('simulación: anticipo de 30% reduce el golpe a $50,000', E.simularVenta({ ...deck }, { precio: 100000, costo: 75000, entrega: 5000, anticipo: 30000, dia_entrega: 5, dia_proveedor: 5, dias_credito: 30 }).cambio_minimo === C(-50000));
    ok('simulación: anticipo nunca mayor que el precio', E.simularVenta({ ...deck }, { precio: 100, anticipo: 500 }).anticipo === C(100));
    ok('saldo de cuenta ignora movimientos de antes del corte y futuros', E.saldoCuenta({ id: 1, saldo_inicial: '1000.00', fecha_saldo: '2026-11-10' },
      [{ cuenta_id: 1, fecha: '2026-11-10', monto: '50' }, { cuenta_id: 1, fecha: '2026-11-11', monto: '-200.50' }, { cuenta_id: 1, fecha: '2026-11-30', monto: '999' }, { cuenta_id: 2, fecha: '2026-11-11', monto: '7' }], '2026-11-16') === 79950);
    ok('pendiente nunca negativo', E.pendiente('100', [{ monto: '150' }]) === 0 && E.pendiente('100.10', [{ monto: '0.05' }]) === 10005);

    console.log('\nEstructura');
    const srcDir = path.join(__dirname, 'src');
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'));
    const code = Object.fromEntries(files.map((f) => [f, strip(fs.readFileSync(path.join(srcDir, f), 'utf8'))]));
    const ui = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    const mig = fs.readFileSync(path.join(__dirname, 'migrations', '20261115_forzza_tables.sql'), 'utf8');
    ok('engine.js no toca base de datos ni red', !/require\('\.\/db'\)|sequelize|https?\.|fetch\(/.test(code['engine.js']));
    ok('ningún transporte de mensajes ni modelo', !files.some((f) => /twilio|sendgrid|nodemailer|@anthropic-ai|graph\.facebook/i.test(code[f])));
    ok('el tenant nunca sale del cuerpo', !/body\.tenant_id|b\.tenant_id|query\.tenant_id/.test(code['index.js']));
    const tablaDe = (n) => (mig.match(new RegExp('CREATE TABLE IF NOT EXISTS ' + n + ' \\(([\\s\\S]*?)\\n\\);')) || [])[1] || '';
    ok('ningún saldo pendiente se guarda en cxc/cxp: se calcula', ['fz_cxc', 'fz_cxp'].every((n) => tablaDe(n) && !/pendiente|saldo/i.test(tablaDe(n))));
    ok('la página no calcula proyecciones', !/function proyectar|saldo\s*\+=/.test(ui));
    const repo = [code['schema.js'], mig, ui, fs.readFileSync(path.join(__dirname, 'src', 'index.js'), 'utf8')].join('\n');
    ok('ningún número de cuenta real del cliente en el código (repo público)', !/4071119754|0125066018|0166278442|1535679928|3114|3381/.test(repo));

    console.log('\nPreparación');
    const hash = await bcrypt.hash('sit-pass-123456', 4);
    const mk = async (slug) => { const [[t]] = await db.query('INSERT INTO fz_tenants (name,slug) VALUES (:n,:s) RETURNING id', { replacements: { n: slug, s: slug } }); tenants.push(t.id); return t.id; };
    const A = await mk(`sit-fz-a-${STAMP}`), B = await mk(`sit-fz-b-${STAMP}`);
    const user = async (t, role) => {
      const email = `sit-fz-${role}-${t}-${STAMP}@example.test`;
      const [[u]] = await db.query('INSERT INTO fz_users (tenant_id,email,role,password_hash,must_change) VALUES (:t,:e,:r,:h,FALSE) RETURNING id', { replacements: { t, e: email, r: role, h: hash } });
      const r = await req('POST', '/auth/login', { body: { email, password: 'sit-pass-123456' } });
      return { id: u.id, cookie: r.cookie };
    };
    const dirA = await user(A, 'director'), capA = await user(A, 'capturista'), conA = await user(A, 'contador'), dirB = await user(B, 'director');
    ok('inicio de sesión', !!dirA.cookie && !!capA.cookie && !!dirB.cookie);
    const [[cuA]] = await db.query("INSERT INTO fz_cuentas (tenant_id,nombre,uso) VALUES (:t,'Cobranza A','cobranza') RETURNING id", { replacements: { t: A } });
    const [[cuA2]] = await db.query("INSERT INTO fz_cuentas (tenant_id,nombre,incluir,tipo) VALUES (:t,'Tarjeta A',FALSE,'tarjeta') RETURNING id", { replacements: { t: A } });
    const [[cuB]] = await db.query("INSERT INTO fz_cuentas (tenant_id,nombre) VALUES (:t,'Cuenta B') RETURNING id", { replacements: { t: B } });

    console.log('\nSesión y permisos');
    ok('sin cabecera X-Forzza un POST se rechaza', (await req('POST', '/cxc', { cookie: dirA.cookie, header: false, body: {} })).status === 403);
    ok('sin sesión = 401', (await req('GET', '/tablero')).status === 401);
    ok('contador es solo lectura', (await req('POST', '/cxc', { cookie: conA.cookie, body: { cliente: 'X', total: 10 } })).status === 403 && (await req('GET', '/cxc', { cookie: conA.cookie })).status === 200);
    ok('capturista no cambia Ajustes (404)', (await req('PUT', '/config', { cookie: capA.cookie, body: { reserva_minima: 1 } })).status === 404);

    console.log('\nCuentas y efectivo');
    const hoy = hoyMx();
    ok('saldo de corte de la cuenta', (await req('POST', `/cuentas/${cuA.id}/saldo`, { cookie: capA.cookie, body: { saldo: '100,000.00', fecha: E.addDays(hoy, -1) } })).status === 200);
    ok('saldo con fecha futura se rechaza', (await req('POST', `/cuentas/${cuA.id}/saldo`, { cookie: capA.cookie, body: { saldo: 1, fecha: E.addDays(hoy, 3) } })).status === 400);
    await req('POST', `/cuentas/${cuA2.id}/saldo`, { cookie: capA.cookie, body: { saldo: -50000, fecha: hoy } });
    ok('B no toca la cuenta de A', (await req('POST', `/cuentas/${cuA.id}/saldo`, { cookie: dirB.cookie, body: { saldo: 1 } })).status === 404);
    ok('capturista no agrega cuentas', (await req('POST', '/cuentas', { cookie: capA.cookie, body: { nombre: 'Nueva' } })).status === 403);
    let tb = (await req('GET', '/tablero', { cookie: dirA.cookie })).json;
    ok('efectivo = solo las cuentas que suman (la tarjeta no)', tb.efectivo === C(100000));

    console.log('\nPor cobrar');
    const x1 = await req('POST', '/cxc', { cookie: capA.cookie, body: { cliente: 'Constructora Uno', folio: 'F-100', fecha: hoy, total: '50000', tenant_id: B } });
    ok('alta crea al cliente por nombre y vence a 30 días (Ajustes)', x1.status === 201 && x1.json.vencimiento === E.addDays(hoy, 30));
    ok('tenant_id del cuerpo se ignora', (await q('SELECT tenant_id FROM fz_cxc WHERE id=:id', { id: x1.json.id }))[0].tenant_id === A);
    ok('folio repetido para el mismo cliente = 409', (await req('POST', '/cxc', { cookie: capA.cookie, body: { cliente: 'constructora uno', folio: 'F-100', total: 1 } })).status === 409);
    ok('vencimiento antes de la fecha = 400', (await req('POST', '/cxc', { cookie: capA.cookie, body: { cliente: 'Y', fecha: hoy, vencimiento: E.addDays(hoy, -1), total: 1 } })).status === 400);
    ok('B no lee el documento de A', (await req('GET', '/cxc/' + x1.json.id, { cookie: dirB.cookie })).status === 404);
    ok('B no registra cobros en A', (await req('POST', `/cxc/${x1.json.id}/pagos`, { cookie: dirB.cookie, body: { monto: 1 } })).status === 404);
    ok('cobro mayor que lo pendiente = 400', (await req('POST', `/cxc/${x1.json.id}/pagos`, { cookie: capA.cookie, body: { monto: '50000.01' } })).json.error === 'monto_mayor_al_saldo');
    ok('cobro en una cuenta de B = 404', (await req('POST', `/cxc/${x1.json.id}/pagos`, { cookie: capA.cookie, body: { monto: 1, cuenta_id: cuB.id } })).status === 404);
    const ab = await req('POST', `/cxc/${x1.json.id}/pagos`, { cookie: capA.cookie, body: { monto: '20000', cuenta_id: cuA.id, fecha: hoy } });
    ok('abono parcial deja $30,000 pendiente y anota el movimiento', ab.status === 201 && ab.json.pendiente === C(30000) && ab.json.movimiento_id);
    tb = (await req('GET', '/tablero', { cookie: dirA.cookie })).json;
    ok('efectivo sube con el cobro y la cartera baja (sin contar dos veces)', tb.efectivo === C(120000) && tb.cartera.total === C(30000));
    ok('total menor que lo ya cobrado = 400', (await req('PATCH', '/cxc/' + x1.json.id, { cookie: capA.cookie, body: { total: 10000 } })).json.error === 'total_menor_que_pagado');
    const ab2 = await req('POST', `/cxc/${x1.json.id}/pagos`, { cookie: capA.cookie, body: { monto: 30000 } });
    ok('cobro del resto = pagada', ab2.json.pendiente === 0 && (await q('SELECT estado FROM fz_cxc WHERE id=:id', { id: x1.json.id }))[0].estado === 'pagada');
    ok('documento pagado no acepta más cobros', (await req('POST', `/cxc/${x1.json.id}/pagos`, { cookie: capA.cookie, body: { monto: 1 } })).status === 409);
    const det = (await req('GET', '/cxc/' + x1.json.id, { cookie: capA.cookie })).json;
    const und = await req('DELETE', `/cxc/${x1.json.id}/pagos/${det.pagos[0].id}`, { cookie: capA.cookie });
    ok('deshacer un cobro reabre el documento y quita su movimiento', und.status === 200 && (await q('SELECT estado FROM fz_cxc WHERE id=:id', { id: x1.json.id }))[0].estado === 'abierta'
      && !(await q('SELECT id FROM fz_movimientos WHERE id=:m', { m: ab.json.movimiento_id })).length);
    tb = (await req('GET', '/tablero', { cookie: dirA.cookie })).json;
    ok('después de deshacer: efectivo $100,000 y cartera $20,000', tb.efectivo === C(100000) && tb.cartera.total === C(20000));
    const venc = await req('POST', '/cxc', { cookie: capA.cookie, body: { cliente: 'Moroso', fecha: E.addDays(hoy, -60), vencimiento: E.addDays(hoy, -20), total: 7000 } });
    let pr = (await req('GET', '/proyeccion', { cookie: dirA.cookie })).json;
    ok('el vencido no entra a la proyección y aparece aparte', !pr.eventos.some((e) => e.ref === 'cxc:' + venc.json.id) && pr.vencido_no_contado.some((e) => e.ref === 'cxc:' + venc.json.id));
    await req('PATCH', '/cxc/' + venc.json.id, { cookie: capA.cookie, body: { compromiso_fecha: E.addDays(hoy, 4) } });
    pr = (await req('GET', '/proyeccion', { cookie: dirA.cookie })).json;
    ok('con compromiso de pago entra ese día', pr.eventos.some((e) => e.ref === 'cxc:' + venc.json.id && e.fecha === E.addDays(hoy, 4)));

    console.log('\nPor pagar: programar → aprobar → pagar');
    const y1 = await req('POST', '/cxp', { cookie: capA.cookie, body: { proveedor: 'Cementos Prueba', folio: 'P-1', fecha: hoy, dias_credito: 15, total: 40000 } });
    ok('alta de factura de proveedor con días de crédito', y1.status === 201 && y1.json.vencimiento === E.addDays(hoy, 15));
    ok('capturista no paga algo sin aprobar', (await req('POST', `/cxp/${y1.json.id}/pagos`, { cookie: capA.cookie, body: { monto: 100 } })).json.error === 'pago_no_aprobado');
    ok('no se aprueba sin programar', (await req('POST', `/cxp/${y1.json.id}/aprobar`, { cookie: dirA.cookie, body: {} })).json.error === 'primero_programar');
    ok('programar en el pasado = 400', (await req('POST', `/cxp/${y1.json.id}/programar`, { cookie: capA.cookie, body: { fecha: E.addDays(hoy, -1) } })).status === 400);
    ok('capturista programa', (await req('POST', `/cxp/${y1.json.id}/programar`, { cookie: capA.cookie, body: { fecha: E.addDays(hoy, 3) } })).status === 200);
    ok('capturista no aprueba', (await req('POST', `/cxp/${y1.json.id}/aprobar`, { cookie: capA.cookie, body: {} })).status === 403);
    ok('B no aprueba pagos de A', (await req('POST', `/cxp/${y1.json.id}/aprobar`, { cookie: dirB.cookie, body: {} })).status === 404);
    ok('director aprueba', (await req('POST', `/cxp/${y1.json.id}/aprobar`, { cookie: dirA.cookie, body: {} })).status === 200);
    await req('POST', `/cxp/${y1.json.id}/programar`, { cookie: capA.cookie, body: { fecha: E.addDays(hoy, 5) } });
    ok('cambiar la fecha de algo aprobado lo regresa a programada', (await q('SELECT estado, aprobado_por FROM fz_cxp WHERE id=:id', { id: y1.json.id }))[0].estado === 'programada');
    await req('POST', `/cxp/${y1.json.id}/aprobar`, { cookie: dirA.cookie, body: {} });
    await req('PATCH', '/cxp/' + y1.json.id, { cookie: capA.cookie, body: { total: 500000 } });
    ok('subir el total de un pago aprobado le quita la aprobación', (await q('SELECT estado FROM fz_cxp WHERE id=:id', { id: y1.json.id }))[0].estado === 'programada'
      && (await req('POST', `/cxp/${y1.json.id}/pagos`, { cookie: capA.cookie, body: { monto: 500000 } })).json.error === 'pago_no_aprobado');
    await req('PATCH', '/cxp/' + y1.json.id, { cookie: capA.cookie, body: { total: 40000 } });
    await req('POST', `/cxp/${y1.json.id}/aprobar`, { cookie: dirA.cookie, body: {} });
    const py = await req('POST', `/cxp/${y1.json.id}/pagos`, { cookie: capA.cookie, body: { monto: 15000, cuenta_id: cuA.id } });
    ok('aprobado: capturista registra el pago y sale del banco', py.status === 201 && Number((await q('SELECT monto FROM fz_movimientos WHERE id=:m', { m: py.json.movimiento_id }))[0].monto) === -15000);
    pr = (await req('GET', '/proyeccion', { cookie: dirA.cookie })).json;
    ok('la proyección cuenta solo lo pendiente del proveedor, en su fecha programada', pr.eventos.some((e) => e.ref === 'cxp:' + y1.json.id && e.monto === C(-25000) && e.fecha === E.addDays(hoy, 5)));
    ok('aprobador definido: solo esa persona aprueba', (await req('PUT', '/config', { cookie: dirA.cookie, body: { aprobador_user_id: capA.id, reserva_minima: '30000', dias_credito_clientes: 30, dias_credito_proveedores: 30, horizonte_dias: 60 } })).status === 200);
    const y2 = await req('POST', '/cxp', { cookie: capA.cookie, body: { proveedor: 'Acero Prueba', total: 1000 } });
    await req('POST', `/cxp/${y2.json.id}/programar`, { cookie: capA.cookie, body: { fecha: E.addDays(hoy, 2) } });
    ok('…el director ya no aprueba', (await req('POST', `/cxp/${y2.json.id}/aprobar`, { cookie: dirA.cookie, body: {} })).status === 403);
    ok('…y la persona elegida sí', (await req('POST', `/cxp/${y2.json.id}/aprobar`, { cookie: capA.cookie, body: {} })).status === 200);
    ok('aprobador de otra empresa = 400', (await req('PUT', '/config', { cookie: dirA.cookie, body: { aprobador_user_id: dirB.id } })).json.error === 'aprobador_invalido');
    ok('contador no puede ser aprobador', (await req('PUT', '/config', { cookie: dirA.cookie, body: { aprobador_user_id: conA.id } })).json.error === 'aprobador_invalido');
    tb = (await req('GET', '/tablero', { cookie: dirA.cookie })).json;
    ok('reserva en el tablero', tb.reserva === C(30000));

    console.log('\nGastos fijos');
    const g = await req('POST', '/fijos', { cookie: capA.cookie, body: { concepto: 'Renta bodega', categoria: 'renta', monto: 12000, frecuencia: 'mensual', dia: 28 } });
    ok('alta de gasto fijo', g.status === 201);
    const fl = (await req('GET', '/fijos', { cookie: capA.cookie })).json.find((x) => x.id === g.json.id);
    ok('próxima fecha calculada', fl.proximo && fl.proximo.slice(8) === '28');
    ok('marcar pagado un día que no toca = 400', (await req('POST', `/fijos/${g.json.id}/pagado`, { cookie: capA.cookie, body: { fecha: fl.proximo.slice(0, 8) + '27' } })).json.error === 'no_toca_ese_dia');
    ok('marcar pagado la fecha que toca', (await req('POST', `/fijos/${g.json.id}/pagado`, { cookie: capA.cookie, body: { fecha: fl.proximo } })).status === 200);
    ok('marcarla dos veces = 409', (await req('POST', `/fijos/${g.json.id}/pagado`, { cookie: capA.cookie, body: { fecha: fl.proximo } })).status === 409);
    pr = (await req('GET', '/proyeccion', { cookie: dirA.cookie })).json;
    ok('la ocurrencia pagada sale de la proyección', !pr.eventos.some((e) => e.ref === 'fijo:' + g.json.id && e.fecha === fl.proximo) && pr.eventos.some((e) => e.ref === 'fijo:' + g.json.id));
    ok('frecuencia inválida = 400', (await req('POST', '/fijos', { cookie: capA.cookie, body: { concepto: 'x', monto: 1, frecuencia: 'diaria' } })).status === 400);

    console.log('\nImportar estado de cuenta');
    // Una salida anotada en la app que el banco reportará 2 días después: debe conciliarse, no duplicarse.
    const man = await req('POST', '/movimientos', { cookie: capA.cookie, body: { cuenta_id: cuA.id, tipo: 'salida', monto: 777.77, fecha: E.addDays(hoy, -2), concepto: 'Gasolina', categoria: 'combustible' } });
    const csv = ['Banco de prueba,,,,', 'Fecha,Concepto,Referencia,Cargo,Abono,Saldo',
      `${hoy.slice(8)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)},SPEI RECIBIDO CLIENTE,R1,,"5,000.00","105,000.00"`,
      `${hoy.slice(8)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)},COMISION,R2,10.00,,"104,990.00"`,
      `${hoy.slice(8)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)},COMISION,R2,10.00,,"104,980.00"`,
      `${hoy.slice(8)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)},PAGO TPV GASOLINERA,R3,777.77,,"104,202.23"`,
      'xx/yy/zzzz,RENGLON MALO,,1,,', ',,,,,'].join('\n');
    const im = await req('POST', '/movimientos/importar', { cookie: capA.cookie, raw: multipart({ cuenta_id: cuA.id }, { name: 'edo.csv', data: csv }) });
    ok('importa 3 nuevos (dos comisiones idénticas son dos) y concilia 1', im.status === 200 && im.json.creados === 3 && im.json.conciliados === 1, JSON.stringify(im.json && { c: im.json.creados, k: im.json.conciliados }));
    ok('el renglón malo recibe su motivo', im.json.resultados.some((r) => !r.ok && r.motivo === 'fecha'));
    ok('la salida capturada quedó conciliada con los datos del banco', (await q('SELECT conciliado, concepto FROM fz_movimientos WHERE id=:id', { id: man.json.id }))[0].conciliado === true);
    const im2 = await req('POST', '/movimientos/importar', { cookie: capA.cookie, raw: multipart({ cuenta_id: cuA.id }, { name: 'edo.csv', data: csv }) });
    ok('el mismo archivo otra vez no duplica nada', im2.json.creados === 0 && im2.json.conciliados === 0 && im2.json.duplicados === 4);
    ok('importado no se borra', (await req('DELETE', '/movimientos/' + (await q("SELECT id FROM fz_movimientos WHERE tenant_id=:t AND origen='importado' LIMIT 1", { t: A }))[0].id, { cookie: capA.cookie })).status === 409);
    const im3 = await req('POST', '/movimientos/importar', { cookie: capA.cookie, raw: multipart({ cuenta_id: cuA.id, actualizar_saldo: '1' }, { name: 'edo.csv', data: csv }) });
    const cta = (await q('SELECT saldo_inicial, fecha_saldo::text AS f FROM fz_cuentas WHERE id=:id', { id: cuA.id }))[0];
    ok('tomar el saldo del último renglón como corte', im3.status === 200 && Number(cta.saldo_inicial) === 104202.23 && cta.f === hoy);
    ok('un PDF se rechaza con la instrucción', (await req('POST', '/movimientos/importar', { cookie: capA.cookie, raw: multipart({ cuenta_id: cuA.id }, { name: 'x.pdf', data: '%PDF-1.4 hola' }) })).json.error === 'pdf_no');
    ok('importar a una cuenta de B = 404', (await req('POST', '/movimientos/importar', { cookie: capA.cookie, raw: multipart({ cuenta_id: cuB.id }, { name: 'edo.csv', data: csv }) })).status === 404);
    ok('sin encabezados = 400', (await req('POST', '/movimientos/importar', { cookie: capA.cookie, raw: multipart({ cuenta_id: cuA.id }, { name: 'x.csv', data: 'a,b\n1,2' }) })).json.error === 'sin_encabezados');
    const mov = (await q("SELECT id FROM fz_movimientos WHERE tenant_id=:t AND concepto='COMISION' LIMIT 1", { t: A }))[0];
    await db.query("UPDATE fz_movimientos SET contraparte='BANCO X' WHERE tenant_id=:t AND concepto='COMISION'", { replacements: { t: A } });
    const cm = await req('PATCH', '/movimientos/' + mov.id, { cookie: capA.cookie, body: { categoria: 'comision_bancaria', aplicar_a_todos: true } });
    ok('categoría para todos los de la misma contraparte', cm.json.actualizados === 2);
    ok('categoría inventada = 400', (await req('PATCH', '/movimientos/' + mov.id, { cookie: capA.cookie, body: { categoria: 'lujos' } })).status === 400);

    console.log('\nImportar cuentas por cobrar (formato tipo SICAR)');
    const csvC = ['Reporte de cuentas por cobrar', 'Cliente,Folio,Fecha,Vencimiento,Total,Saldo',
      `Ferretería Prueba,A-1,01/10/2026,31/10/2026,"10,000.00","4,000.00"`,
      `Ferretería Prueba,A-1,01/10/2026,31/10/2026,"10,000.00","4,000.00"`,
      `Obra Prueba,A-2,05/11/2026,,"2,500.00",`,
      `Pagado Prueba,A-3,05/11/2026,,"1,000.00",0`,
      'TOTAL,,,,"13,500.00",'].join('\n');
    const ic = await req('POST', '/cxc/importar', { cookie: capA.cookie, raw: multipart({}, { name: 'cxc.csv', data: csvC }) });
    ok('importa 2, salta el folio repetido y el ya pagado', ic.status === 200 && ic.json.creados === 2 && ic.json.resultados.some((r) => r.motivo === 'folio_duplicado') && ic.json.resultados.some((r) => r.motivo === 'ya_pagado'));
    const imp1 = (await q("SELECT x.id, x.vencimiento::text AS v FROM fz_cxc x WHERE x.tenant_id=:t AND x.folio='A-1'", { t: A }))[0];
    const dimp = (await req('GET', '/cxc/' + imp1.id, { cookie: capA.cookie })).json;
    ok('saldo menor que total entra como abono "saldo inicial"', dimp.pendiente === C(4000) && dimp.pagos.length === 1);
    ok('fecha 01/10/2026 se lee día/mes', imp1.v === '2026-10-31');
    const a2 = (await q("SELECT vencimiento::text AS v FROM fz_cxc WHERE tenant_id=:t AND folio='A-2'", { t: A }))[0];
    ok('sin vencimiento: fecha + días de Ajustes', a2.v === '2026-12-05');
    ok('B no ve nada de A', (await req('GET', '/cxc?estado=todas', { cookie: dirB.cookie })).json.length === 0 && (await req('GET', '/tablero', { cookie: dirB.cookie })).json.efectivo === 0);

    console.log('\nSICAR: lector de reportes (sicar.js, formatos del manual oficial; datos inventados)');
    const SR = require('./src/sicar');
    // Un renglón de PDF: celdas con su x, como las entrega pdf-child.js.
    const R = (...cells) => cells.map(([x, t]) => ({ x, t }));
    const compras = [[
      R([100, 'Reporte General de Compras'], [403, 'Periodo:'], [450, '01/10/2026'], [514, '-'], [531, '31/10/2026']),
      R([72, 'Caja:'], [95, 'Todas'], [223, 'Usuario:'], [260, 'Todos'], [384, 'Doc.:'], [407, 'Todos'], [508, 'Detalle:'], [542, 'No']),
      R([46, 'Proveedor:'], [95, 'Todos'], [351, 'Estado:'], [385, 'Todos'], [483, 'Orden:'], [514, 'Fecha']),
      R([44, 'Fecha'], [95, 'Doc.'], [163, 'Folio'], [202, 'Proveedor'], [377, 'Caja'], [437, 'Usuario'], [491, 'Est'], [570, 'Total']),
      R([37, '02/10/2026'], [95, 'COM'], [163, '50514'], [202, 'CEMENTOS PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'V'], [550, '$ 14,384.00']),
      R([37, '02/10/2026'], [95, 'COM'], [163, '50514'], [202, 'CEMENTOS PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'X'], [550, '$ 14,384.00']),
      R([37, '02/10/2026'], [95, 'COM'], [163, '50514'], [202, 'CEMENTOS PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'X'], [547, '-$ 14,384.00']),
      R([37, '03/10/2026'], [95, 'GAS'], [149, 'ENERO1SUE'], [202, 'SUELDOS'], [375, 'Caja 1'], [443, 'admin'], [495, 'V'], [550, '$ 22,030.00']),
      R([37, '03/10/2026'], [95, 'COM'], [154, '47171COM'], [202, 'GASOLINERA PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'V'], [554, '$ 1,000.00'])],
      [R([100, 'Reporte General de Compras']), R([44, 'Fecha'], [95, 'Doc.'], [163, 'Folio'], [202, 'Proveedor'], [377, 'Caja'], [437, 'Usuario'], [491, 'Est'], [570, 'Total']),
      R([37, '04/10/2026'], [95, 'COM'], [161, 'REM44'], [202, 'ARENAS PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'V'], [550, '$ 17,066.40']),
      R([200, 'Devoluciones']), R([40, 'Devolución'], [95, '05/10/2026'], [163, '68'], [202, 'CEMENTOS PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'V'], [560, '$ 100.00']),
      R([300, 'Totales por Forma de Pago']), R([420, 'Efectivo'], [560, '$ 0.00']),
      R([440, 'Total :'], [540, '$ 54,380.40']), R([60, 'Página 2 / 2'], [250, 'Generado por SICAR'])]];
    const rc = SR.leer(compras);
    ok('compras: reconoce el reporte y su periodo', rc.tipo === 'compras_general' && rc.filtros.desde === '2026-10-01' && rc.filtros.hasta === '2026-10-31');
    ok('compras: folio y proveedor por POSICIÓN (en el texto plano vienen pegados)', rc.filas.find((f) => f.folio === 'ENERO1SUE').parte === 'SUELDOS' && rc.filas.find((f) => f.folio === '47171COM').parte === 'GASOLINERA PRUEBA');
    ok('compras: la devolución se reconoce aunque SICAR ponga la fecha en la columna Doc.', rc.filas.some((f) => f.doc === 'DEV' && f.fecha === '2026-10-05' && f.total === 10000));
    ok('compras: lo leído cuadra con el Total que imprime SICAR (compras − devoluciones)', rc.cuadra === true && rc.total_leido === 5438040);
    ok('compras: el pie de página y "Totales por Forma de Pago" no son renglones', !rc.filas.some((f) => /efectivo|pagina/i.test(f.parte || '')) && rc.errores.length === 0);
    const malo = JSON.parse(JSON.stringify(compras)); malo[1].splice(2, 1); // falta un renglón: el total ya no cuadra
    ok('si falta un renglón, dice que NO cuadra (no se calla)', SR.leer(malo).cuadra === false);
    const cred = [[
      R([145, 'Reporte de Créditos de Proveedores'], [763, 'Periodo:']),
      R([137, 'Caja:'], [190, 'Todas'], [503, 'Usuario:'], [580, 'Todos'], [855, 'Tipo:'], [895, 'Si']),
      R([86, 'Proveedor:'], [190, 'Todos'], [667, 'Estado:'], [735, 'Por Pagar'], [915, 'Orden:'], [980, 'Proveedor']),
      R([52, 'No. Prv'], [138, 'Nombre'], [623, 'Teléfono'], [793, 'Celular'], [1060, 'Saldo']),
      R([88, '1'], [138, 'CEMENTOS PRUEBA SA DE CV'], [623, '8110000001'], [793, '8110000002'], [1030, '$ 1,439.00']),
      R([100, 'Folio'], [208, 'Fecha de Créd.'], [371, 'Vencimieno'], [511, 'Est.'], [700, 'Total'], [868, 'Abonos'], [1072, 'Saldo']),
      R([118, 'F-9'], [220, '09/09/2026'], [370, '09/10/2026'], [511, 'PEN'], [653, '$ 1,554.00'], [858, '$ 115.00'], [1030, '$ 1,439.00']),
      R([456, 'Lista de Devoluciónes']), R([104, 'Fecha'], [254, 'Serie/Folio'], [398, 'Comentario'], [1080, 'Total']),
      R([77, '09/09/2026'], [300, '66'], [1050, '$ 115.00']), R([810, 'Total de Dev.:'], [1048, '$ 115.00']),
      R([88, '2'], [138, 'ACEROS PRUEBA'], [623, '8110000003'], [1030, '$ 5,000.00']),
      R([100, 'Folio'], [208, 'Fecha de Créd.'], [371, 'Vencimiento'], [511, 'Est.'], [700, 'Total'], [868, 'Abonos'], [1072, 'Saldo']),
      R([118, '-'], [220, '20/10/2026'], [370, '19/11/2026'], [511, 'PEN'], [653, '$ 5,000.00'], [858, '$ 0.00'], [1030, '$ 5,000.00']),
      R([737, 'Total :'], [1027, '$ 6,439.00'])]];
    const rk = SR.leer(cred);
    ok('créditos: un documento por folio, con vencimiento, total, abonos y saldo', rk.tipo === 'creditos_proveedores' && rk.filas.length === 2 && rk.filas[0].vencimiento === '2026-10-09' && rk.filas[0].abonos === 11500 && rk.filas[0].saldo === 143900);
    ok('créditos: "Lista de Devoluciones" no se cuenta como documento', !rk.filas.some((f) => f.folio === '66'));
    ok('créditos: folio "-" se guarda como sin folio', rk.filas[1].folio === null && rk.filas[1].parte === 'ACEROS PRUEBA');
    ok('créditos: cuadra con el Total y con el saldo de cada proveedor', rk.cuadra === true && rk.partes_que_no_cuadran.length === 0 && rk.filtros.estado === 'Por Pagar');
    const resumido = [[R([175, 'Reporte de Créditos a Clientes']), R([52, 'No. Cli'], [138, 'Nombre'], [623, 'Teléfono'], [793, 'Celular'], [1060, 'Saldo']), R([88, '2'], [138, 'Cliente X'], [623, '1'], [1030, '$ 1.00'])]];
    ok('créditos sin detalle (Tipo: No) se rechaza con la instrucción', SR.leer(resumido).error === 'sin_detalle');
    const per = SR.leer([[R([415, 'Reporte de Créditos a Clientes por Periodo de Tiempo en Días']),
      R([52, 'No. Cli'], [138, 'Nombre'], [663, '0-30 Dias'], [795, '31-60 Dias'], [936, '61-90 Dias'], [1067, '91-120 Dias'], [1222, '> 121 Dias'], [1435, 'TOTAL']),
      R([88, '2'], [138, 'Cliente Uno'], [653, '$ 1,474.60'], [830, '$ 0.00'], [970, '$ 0.00'], [1112, '$ 0.00'], [1258, '$ 0.00'], [1378, '$ 1,474.60']),
      R([88, '3'], [138, 'Cliente Dos'], [653, '$ 0.00'], [830, '$ 0.00'], [970, '$ 893.00'], [1112, '$ 0.00'], [1258, '$ 0.00'], [1378, '$ 893.00']),
      R([709, 'RESUMEN']), R([160, '0-30 Dias'], [1340, 'TOTAL']), R([118, '$ 1,474.60'], [1300, '$ 2,367.60'])]]);
    ok('por periodo: tramos por persona y el RESUMEN no es una persona', per.tipo === 'periodo_clientes' && per.filas.length === 2 && per.filas[1].d61 === 89300 && per.errores.length === 0);
    const abn = SR.leer([[R([174, 'Reporte de Abonos de Clientes'], [1063, 'Periodo:'], [1155, '07/09/2026'], [1328, '25/09/2026']),
      R([78, 'Fecha'], [210, 'Caja'], [343, 'Usuario'], [461, 'Doc Ori'], [579, 'Folio'], [677, 'Fecha Doc'], [800, 'FP'], [900, 'MultiPago'], [1002, 'Referencia'], [1415, 'Total']),
      R([52, '07/09/2026'], [210, 'Caja 1'], [353, 'admin'], [478, 'TIC'], [584, '667'], [670, '27/08/2026'], [802, 'EF']), R([1388, '$ 100.00']),
      R([70, 'Cliente:'], [167, 'Cliente Uno'], [683, 'Representante:'], [838, 'Cliente Uno']),
      R([52, '08/09/2026'], [210, 'Caja 1'], [353, 'admin'], [478, 'TIC'], [584, '711'], [670, '08/09/2026'], [802, 'EF'], [1398, '$ 50.00']),
      R([70, 'Cliente:'], [167, 'Cliente Dos'], [683, 'Representante:'], [838, 'Cliente Dos']), R([1127, 'Total :'], [1368, '$ 150.00'])]]);
    ok('abonos: dos renglones por abono y el total centrado entre ellos', abn.tipo === 'abonos_clientes' && abn.filas.length === 2 && abn.filas[0].total === 10000 && abn.filas[0].parte === 'Cliente Uno' && abn.filas[1].folio === '711' && abn.cuadra === true);
    ok('un archivo que no es de SICAR se rechaza', SR.leer([[R([10, 'Hola'], [50, 'Mundo'])]]).error === 'no_es_reporte_sicar');
    const hoja = SR.leer(SR.desdeHoja([['Reporte General de Ventas'], ['Documento', 'Fecha', 'Folio', 'Cliente', 'Caja', 'Usuario', 'Folio F.', 'Est', 'Total'],
      ['Ticket', 46300, 738, 'Público en General', 'Caja 1', 'admin', '', 'V', 210], ['Ticket', '22/10/2026', 739, 'Cliente Uno', 'Caja 1', 'admin', '', 'V', '$ 58.11'], ['Total General:', '', '', '', '', '', '', '', 268.11]]));
    ok('Excel: misma lectura, con fechas de Excel y números', hoja.tipo === 'ventas_general' && hoja.filas.length === 2 && hoja.filas[0].fecha === '2026-10-05' && hoja.filas[1].total === 5811 && hoja.cuadra === true);
    const srcSicar = strip(fs.readFileSync(path.join(__dirname, 'src', 'sicar.js'), 'utf8'));
    ok('sicar.js no toca base de datos ni red', !/require\(|sequelize|https?\.|fetch\(/.test(srcSicar.replace("module.exports", "")));
    if (process.env.FORZZA_SICAR_MUESTRA) {
      // Prueba LOCAL con un reporte real (el archivo nunca entra al repo): node ... con FORZZA_SICAR_MUESTRA=/ruta/COMPRAS.pdf
      router._pdfRows = null;
      deferReal = true;
    } else console.log('  (sin FORZZA_SICAR_MUESTRA: no se probó contra un PDF real de SICAR)');

    console.log('\nSICAR: importar (revisar = lo mismo que aplicar, sin guardar), sincronizar saldos, puente');
    router._pdfRows = async (buf) => ({ pages: JSON.parse(buf.slice(5).toString()) }); // "PDF" de prueba: %PDF- + páginas
    const subir = (cookie, pages, aplicar, extra) => req('POST', '/sicar/importar', { cookie, ...(extra || {}), raw: multipart({ aplicar: aplicar ? '1' : '0' }, { name: 'reporte.pdf', type: 'application/pdf', data: '%PDF-' + JSON.stringify(pages) }) });
    const cuenta = async (tb, t) => (await q(`SELECT COUNT(*)::int AS n FROM ${tb} WHERE tenant_id=:t`, { t }))[0].n;
    const antes = await cuenta('fz_cxp', A), impAntes = await cuenta('fz_sicar_imports', A);
    const prev = await subir(capA.cookie, cred, false);
    ok('revisar: muestra lo que haría y NO guarda nada', prev.status === 200 && prev.json.aplicado === false && prev.json.conteo.nuevo === 2 && await cuenta('fz_cxp', A) === antes && await cuenta('fz_sicar_imports', A) === impAntes, JSON.stringify(prev.json));
    ok('contador no importa', (await subir(conA.cookie, cred, true)).status === 403);
    const ap = await subir(dirA.cookie, cred, true);
    const cem = (await q("SELECT x.id FROM fz_cxp x JOIN fz_proveedores p ON p.id=x.proveedor_id WHERE x.tenant_id=:t AND x.folio='F-9' AND x.origen='sicar'", { t: A }))[0];
    const pend = async (id) => (await req('GET', '/cxp/' + id, { cookie: dirA.cookie })).json.pendiente;
    ok('aplicar: crea los documentos y lo abonado en SICAR entra como abono', ap.json.aplicado === true && ap.json.conteo.nuevo === 2 && cem && await pend(cem.id) === 143900);
    const prov = (await q("SELECT telefono, sicar_num FROM fz_proveedores WHERE tenant_id=:t AND nombre='CEMENTOS PRUEBA SA DE CV'", { t: A }))[0];
    ok('aplicar: el proveedor queda con su número de SICAR y su teléfono', prov.sicar_num === '1' && prov.telefono === '+528110000002');
    const ap2 = await subir(dirA.cookie, cred, true);
    ok('el mismo reporte otra vez: sin cambio, nada duplicado, y avisa que ya se importó', ap2.json.conteo.sin_cambio === 2 && !ap2.json.conteo.nuevo && ap2.json.archivo_ya_importado && await pend(cem.id) === 143900);
    const ace = (await q("SELECT x.id FROM fz_cxp x JOIN fz_proveedores p ON p.id=x.proveedor_id WHERE x.tenant_id=:t AND p.nombre='ACEROS PRUEBA'", { t: A }))[0];
    const cred2 = JSON.parse(JSON.stringify(cred));
    cred2[0][6] = R([118, 'F-9'], [220, '09/09/2026'], [370, '09/10/2026'], [511, 'PEN'], [653, '$ 1,554.00'], [858, '$ 554.00'], [1030, '$ 1,000.00']);
    cred2[0][4] = R([88, '1'], [138, 'CEMENTOS PRUEBA SA DE CV'], [623, '8110000001'], [793, '8110000002'], [1030, '$ 1,000.00']);
    cred2[0][11] = R([88, '2'], [138, 'ACEROS PRUEBA'], [623, '8110000003'], [1030, '$ 6,000.00']);
    cred2[0][13] = R([118, '-'], [220, '20/10/2026'], [370, '19/11/2026'], [511, 'PEN'], [653, '$ 5,000.00'], [858, '$ 0.00'], [1030, '$ 6,000.00']);
    const ap3 = await subir(capA.cookie, cred2, true);
    ok('SICAR registró un abono: la diferencia entra como abono "de SICAR"', ap3.json.conteo.actualizado === 1 && await pend(cem.id) === 100000);
    ok('SICAR dice MÁS que la app: no se toca, se reporta', ap3.json.conteo.diferencia === 1 && await pend(ace.id) === 500000 && ap3.json.detalle.some((d) => d.resultado === 'sicar_mayor'));
    ok('reaplicar el corte no repite el abono', (await subir(capA.cookie, cred2, true)).json.conteo.sin_cambio >= 1 && await pend(cem.id) === 100000);
    const cred3 = JSON.parse(JSON.stringify(cred2)); cred3[0].splice(11, 3); // ACEROS ya no aparece
    cred3[0][4] = R([88, '1'], [138, 'CEMENTOS PRUEBA SA DE CV'], [623, '8110000001'], [793, '8110000002'], [1030, '$ 0.00']);
    cred3[0][6] = R([118, 'F-9'], [220, '09/09/2026'], [370, '09/10/2026'], [511, 'PAG'], [653, '$ 1,554.00'], [858, '$ 1,554.00'], [1030, '$ 0.00']);
    cred3[0][2] = R([86, 'Proveedor:'], [190, 'Todos'], [667, 'Estado:'], [735, 'Todos'], [915, 'Orden:'], [980, 'Proveedor']);
    const ap4 = await subir(capA.cookie, cred3, true);
    ok('saldo 0 en SICAR: el documento queda pagado', (await q('SELECT estado FROM fz_cxp WHERE id=:id', { id: cem.id }))[0].estado === 'pagada');
    ok('lo que SICAR ya no trae NO se marca pagado solo: se avisa', ap4.json.conteo.ya_no_aparece === 1 && (await q('SELECT estado FROM fz_cxp WHERE id=:id', { id: ace.id }))[0].estado === 'abierta');
    ok('B no ve las importaciones de A ni le cambian nada', (await req('GET', '/sicar/importaciones', { cookie: dirB.cookie })).json.length === 0 && await cuenta('fz_cxp', B) === 0);
    const cp = await subir(capA.cookie, compras, true);
    ok('compras: historial guardado; reimportar no duplica', cp.json.conteo.nuevo === 7 && (await subir(capA.cookie, compras, true)).json.conteo.ya_estaba === 7);
    const csvVentas = ['Reporte General de Ventas', 'Documento,Fecha,Folio,Cliente,Caja,Usuario,Folio F.,Est,Total', 'Ticket,22/10/2026,738,Cliente Uno,Caja 1,admin,,V,"$ 1,210.00"', 'Ticket,23/10/2026,739,Cliente Uno,Caja 1,admin,,C,"$ 99.00"'].join('\n');
    const vs = await req('POST', '/sicar/importar', { cookie: capA.cookie, raw: multipart({ aplicar: '1' }, { name: 'ventas.csv', data: csvVentas }) });
    ok('ventas desde Excel/CSV', vs.status === 200 && vs.json.tipo === 'ventas_general' && vs.json.conteo.nuevo === 2, JSON.stringify(vs.json));
    const rs = (await req('GET', '/sicar/resumen?desde=2026-10-01&hasta=2026-10-31', { cookie: conA.cookie })).json;
    const oct = rs.meses.find((m) => m.mes === '2026-10');
    ok('resumen: compras = COM vigentes − devoluciones; gastos = GAS; los cancelados no cuentan', oct && oct.compras === 3235040 && oct.gastos === 2203000 && oct.ventas === 121000, JSON.stringify(oct));
    ok('resumen: la foto de saldos de SICAR se compara con la app', rs.conciliacion.cxp && rs.conciliacion.cxp.saldo_sicar === 0 && rs.conciliacion.cxp.saldo_app >= 500000, JSON.stringify(rs.conciliacion));
    ok('un archivo que no es de SICAR = 400 con la instrucción', (await subir(capA.cookie, [[R([1, 'Factura'])]], false)).json.error === 'no_es_reporte_sicar');

    console.log('\nPuente SICAR (llaves)');
    ok('capturista no crea llaves (404)', (await req('POST', '/llaves', { cookie: capA.cookie, body: {} })).status === 404);
    const lk = await req('POST', '/llaves', { cookie: dirA.cookie, body: { nombre: 'PC de caja' } });
    ok('la llave se muestra una vez', lk.status === 201 && /^fzk_[A-Za-z0-9_-]{30,}$/.test(lk.json.llave));
    const lks = (await req('GET', '/llaves', { cookie: dirA.cookie })).json;
    ok('la lista no expone la llave ni su hash', JSON.stringify(lks).indexOf(lk.json.llave) < 0 && lks.every((k) => !('hash' in k)));
    const ingest = (llave) => req('POST', '/ingest/sicar', { header: false, headers: llave ? { Authorization: 'Bearer ' + llave } : {}, raw: multipart({}, { name: 'r.pdf', type: 'application/pdf', data: '%PDF-' + JSON.stringify(cred) }) });
    ok('puente sin llave = 401', (await ingest(null)).status === 401);
    ok('puente con llave inventada = 401', (await ingest('fzk_' + 'x'.repeat(32))).status === 401);
    const ig = await ingest(lk.json.llave);
    ok('puente con llave: aplica en SU empresa y queda como origen "puente"', ig.status === 200 && ig.json.aplicado === true && (await q("SELECT tenant_id FROM fz_sicar_imports WHERE origen='puente' ORDER BY id DESC LIMIT 1"))[0].tenant_id === A);
    await req('DELETE', '/llaves/' + lk.json.id, { cookie: dirA.cookie });
    ok('llave revocada = 401', (await ingest(lk.json.llave)).status === 401);
    ok('B no revoca llaves de A', (await req('DELETE', '/llaves/' + lk.json.id, { cookie: dirB.cookie })).status === 404);
    const ps = await req('GET', '/sicar/puente.ps1', { cookie: dirA.cookie });
    ok('el script del puente no lleva ninguna llave adentro', ps.status === 200 && /PEGA_AQUI_LA_LLAVE/.test(ps.buf.toString()) && !/fzk_[A-Za-z0-9]/.test(ps.buf.toString()));
    ok('capturista no descarga el script (404)', (await req('GET', '/sicar/puente.ps1', { cookie: capA.cookie })).status === 404);
    router._pdfRows = null;
    if (deferReal) {
      const real = fs.readFileSync(process.env.FORZZA_SICAR_MUESTRA);
      const rr = await req('POST', '/sicar/importar', { cookie: capA.cookie, raw: multipart({ aplicar: '0' }, { name: 'muestra.pdf', type: 'application/pdf', data: real }) });
      ok('PDF REAL de SICAR (solo local): se lee completo y cuadra con su total, sin guardar', rr.status === 200 && rr.json.cuadra === true && rr.json.n_errores === 0 && rr.json.aplicado === false, JSON.stringify(rr.json && { t: rr.json.tipo, c: rr.json.cuadra, e: rr.json.n_errores }));
    }

    console.log('\nUsuarios');
    const nu = await req('POST', '/usuarios', { cookie: dirA.cookie, body: { email: `sit-fz-new-${STAMP}@example.test`, role: 'capturista' } });
    ok('alta con contraseña temporal mostrada una vez', nu.status === 201 && nu.json.password_temporal.length === 14);
    ok('un director no crea otro director', (await req('POST', '/usuarios', { cookie: dirA.cookie, body: { email: `d2-${STAMP}@example.test`, role: 'director' } })).status === 403);
    ok('la lista no expone el hash', (await req('GET', '/usuarios', { cookie: dirA.cookie })).json.every((u) => !('password_hash' in u)));
    await req('PATCH', '/usuarios/' + capA.id, { cookie: dirA.cookie, body: { active: false } });
    ok('desactivar al aprobador lo quita como aprobador', (await q('SELECT aprobador_user_id FROM fz_config WHERE tenant_id=:t', { t: A }))[0].aprobador_user_id === null);
    ok('el usuario desactivado ya no entra', (await req('GET', '/tablero', { cookie: capA.cookie })).status === 401);
  } catch (e) {
    ok('sin excepciones', false, e && (e.stack || e.message));
  } finally {
    for (const t of tenants) {
      for (const tb of ['fz_sicar_saldos', 'fz_sicar_docs', 'fz_sicar_imports', 'fz_api_keys', 'fz_cxc_abonos', 'fz_cxp_pagos', 'fz_movimientos', 'fz_cxc', 'fz_cxp', 'fz_fijos', 'fz_clientes', 'fz_proveedores', 'fz_cuentas', 'fz_config', 'fz_activity', 'fz_users']) {
        await db.query(`DELETE FROM ${tb} WHERE tenant_id=:t`, { replacements: { t } }).catch((e) => console.log('limpieza', tb, e.message));
      }
      await db.query('DELETE FROM fz_tenants WHERE id=:t', { replacements: { t } }).catch(() => {});
    }
    server.close();
    console.log(`\nForzza SIT: ${pass}/${pass + fail}`);
    if (fails.length) console.log('Fallas:\n - ' + fails.join('\n - '));
    console.log('NO cubierto: ingreso del dueño con la contraseña del CRM, el navegador, el PDF real (solo con FORZZA_SICAR_MUESTRA) y los Excel reales de SICAR de créditos, ventas y abonos (aún no los tenemos: el formato sale del manual oficial).');
    await db.close();
    process.exit(fail ? 1 : 0);
  }
})();
