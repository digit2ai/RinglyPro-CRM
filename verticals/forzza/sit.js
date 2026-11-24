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
function multipartMulti(fields, files) {
  const b = '----sitm' + Date.now(); const parts = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="archivos"; filename="${f.name}"\r\nContent-Type: ${f.type || 'text/csv'}\r\n\r\n`), Buffer.from(f.data), Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${b}--\r\n`));
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
    ok('ningún transporte de mensajes', !files.some((f) => /twilio|sendgrid|nodemailer|graph\.facebook/i.test(code[f])));
    ok('el modelo solo se alcanza desde dalia.js', files.filter((f) => /@anthropic-ai/.test(code[f])).join(',') === 'dalia.js');
    ok('el tenant nunca sale del cuerpo', !/body\.tenant_id|b\.tenant_id|query\.tenant_id/.test(code['index.js']));
    const tablaDe = (n) => (mig.match(new RegExp('CREATE TABLE IF NOT EXISTS ' + n + ' \\(([\\s\\S]*?)\\n\\);')) || [])[1] || '';
    ok('ningún saldo pendiente se guarda en cxc/cxp: se calcula', ['fz_cxc', 'fz_cxp'].every((n) => tablaDe(n) && !/pendiente|saldo/i.test(tablaDe(n))));
    ok('la página no calcula proyecciones', !/function proyectar|saldo\s*\+=/.test(ui));
    const repo = [code['schema.js'], mig, ui, fs.readFileSync(path.join(__dirname, 'src', 'index.js'), 'utf8')].join('\n');
    // Huellas SHA-256 (no los números): este repositorio es público y el número mismo no debe aparecer ni aquí.
    const PROHIBIDOS = new Set(["1e8af007ffa5a2ee","02d440aafd58de11","9bc3ca6a4497b84e","dff8718a0fef617e","90e855751509be9e","a1f14c675f8161bc"]);
    const huella = (x) => require('crypto').createHash('sha256').update(x).digest('hex').slice(0, 16);
    ok('ningún número de cuenta real del cliente en el código (repo público)', !(repo.match(/\d{4,10}/g) || []).some((n) => PROHIBIDOS.has(huella(n))));

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
    ok('importa 2, salta el folio repetido y el ya pagado', ic.status === 200 && ic.json.creados === 2 && ic.json.resultados.some((r) => r.motivo === 'ya_estaba') && ic.json.resultados.some((r) => r.motivo === 'ya_pagado'));
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
      R([37, '02/10/2026'], [95, 'COM'], [163, '70001'], [202, 'CEMENTOS PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'V'], [550, '$ 12,000.00']),
      R([37, '02/10/2026'], [95, 'COM'], [163, '70001'], [202, 'CEMENTOS PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'X'], [550, '$ 12,000.00']),
      R([37, '02/10/2026'], [95, 'COM'], [163, '70001'], [202, 'CEMENTOS PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'X'], [547, '-$ 12,000.00']),
      R([37, '03/10/2026'], [95, 'GAS'], [149, 'QNA1SUE'], [202, 'SUELDOS'], [375, 'Caja 1'], [443, 'admin'], [495, 'V'], [550, '$ 20,000.00']),
      R([37, '03/10/2026'], [95, 'COM'], [154, '90001COM'], [202, 'GASOLINERA PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'V'], [554, '$ 1,000.00'])],
      [R([100, 'Reporte General de Compras']), R([44, 'Fecha'], [95, 'Doc.'], [163, 'Folio'], [202, 'Proveedor'], [377, 'Caja'], [437, 'Usuario'], [491, 'Est'], [570, 'Total']),
      R([37, '04/10/2026'], [95, 'COM'], [161, 'REM90'], [202, 'ARENAS PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'V'], [550, '$ 15,000.40']),
      R([200, 'Devoluciones']), R([40, 'Devolución'], [95, '05/10/2026'], [163, '68'], [202, 'CEMENTOS PRUEBA'], [375, 'Caja 1'], [443, 'admin'], [495, 'V'], [560, '$ 100.00']),
      R([300, 'Totales por Forma de Pago']), R([420, 'Efectivo'], [560, '$ 0.00']),
      R([440, 'Total :'], [540, '$ 47,900.40']), R([60, 'Página 2 / 2'], [250, 'Generado por SICAR'])]];
    const rc = SR.leer(compras);
    ok('compras: reconoce el reporte y su periodo', rc.tipo === 'compras_general' && rc.filtros.desde === '2026-10-01' && rc.filtros.hasta === '2026-10-31');
    ok('compras: folio y proveedor por POSICIÓN (en el texto plano vienen pegados)', rc.filas.find((f) => f.folio === 'QNA1SUE').parte === 'SUELDOS' && rc.filas.find((f) => f.folio === '90001COM').parte === 'GASOLINERA PRUEBA');
    ok('compras: la devolución se reconoce aunque SICAR ponga la fecha en la columna Doc.', rc.filas.some((f) => f.doc === 'DEV' && f.fecha === '2026-10-05' && f.total === 10000));
    ok('compras: lo leído cuadra con el Total que imprime SICAR (compras − devoluciones)', rc.cuadra === true && rc.total_leido === 4790040);
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
    const rres = SR.leer(resumido);
    ok('créditos sin detalle (Tipo: No): se lee como foto de saldos, sin ningún documento', !rres.error && rres.solo_saldos === true && rres.filas.length === 0 && rres.partes.length === 1 && rres.partes[0].saldo === 100);
    ok('créditos sin detalle y sin personas: se rechaza con la instrucción', SR.leer([[R([175, 'Reporte de Créditos a Clientes']), R([52, 'No. Cli'], [138, 'Nombre'], [623, 'Teléfono'], [793, 'Celular'], [1060, 'Saldo'])]]).error === 'sin_detalle');
    const resHoja = (estado) => SR.leer(SR.desdeHoja([['Reporte de Créditos a Clientes'], [], ['Documento:', null, ' Todos', null, null, 'Caja:', ' Todas', null, 'Usuario:', null, null, null, ' Todos', null, null, null, 'Tipo:', null, ' No'],
      ['Cliente:', null, ' Todos', null, null, null, null, null, 'Estado:', null, null, null, ' ' + estado], ['  No. Cli', 'Nombre', null, null, null, null, null, null, 'Teléfono', null, null, null, null, 'Celular', null, null, null, 'Saldo  '],
      ['99', 'CLIENTE UNO', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '$ 1,000.50'], [], ['7', 'CLIENTE DOS', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '$ 250.00'],
      [], [null, null, null, null, null, null, null, null, 'Total :', null, null, null, null, '$ 1,250.50'], ['Página 1', null, null, ' / 1', null, null, null, 'Generado por SICAR']]));
    const hv = resHoja('Vencidos'), hp = resHoja('Por Pagar');
    ok('Excel de SICAR sin detalle: cuadra con su Total y sabe si es "Vencidos" o "Por Pagar"', hv.cuadra === true && hv.total_leido === 125050 && hv.vista === 'vencidos' && hp.vista === 'por_pagar' && hp.partes.length === 2);
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
    ok('resumen: compras = COM vigentes − devoluciones; gastos = GAS; los cancelados no cuentan', oct && oct.compras === 2790040 && oct.gastos === 2000000 && oct.ventas === 121000, JSON.stringify(oct));
    ok('resumen: la foto de saldos de SICAR se compara con la app', rs.conciliacion.cxp && rs.conciliacion.cxp.saldo_sicar === 0 && rs.conciliacion.cxp.saldo_app >= 500000, JSON.stringify(rs.conciliacion));
    const cxcAntes = await cuenta('fz_cxc', A);
    const soloPP = await req('POST', '/sicar/importar', { cookie: capA.cookie, raw: multipart({ aplicar: '1' }, { name: 'pp.csv', data: ['Reporte de Créditos a Clientes', 'Tipo:,No,Estado:,Por Pagar', 'No. Cli,Nombre,Teléfono,Celular,Saldo', '99,CLIENTE UNO,,,"$ 1,000.50"', '7,CLIENTE DOS,,,"$ 250.00"', ',Total :,,,"$ 1,250.50"'].join('\n') }) });
    const soloV = await req('POST', '/sicar/importar', { cookie: capA.cookie, raw: multipart({ aplicar: '1' }, { name: 'v.csv', data: ['Reporte de Créditos a Clientes', 'Tipo:,No,Estado:,Vencidos', 'No. Cli,Nombre,Teléfono,Celular,Saldo', '99,CLIENTE UNO,,,"$ 400.00"', ',Total :,,,"$ 400.00"'].join('\n') }) });
    ok('saldos sin detalle: se guardan por persona y NO crean ni pagan facturas', soloPP.status === 200 && soloPP.json.solo_saldos === true && soloPP.json.conteo.saldo_guardado === 2 && soloV.json.conteo.saldo_guardado === 1 && await cuenta('fz_cxc', A) === cxcAntes, JSON.stringify(soloPP.json));
    const rs2 = (await req('GET', '/sicar/resumen', { cookie: conA.cookie })).json.conciliacion.cxc;
    ok('resumen: el total sale de "Por Pagar" aunque "Vencidos" se haya importado después; lo vencido aparte', rs2 && rs2.saldo_sicar === 125050 && rs2.vencido_sicar === 40000 && rs2.personas_vencidas === 1, JSON.stringify(rs2));
    const dz = await require('./src/dalia.js')._ejecutar('saldos_sicar', { lado: 'cobrar' }, { tenant: A, rol: 'director', D: router._daliaDeps() });
    ok('Dalia: saldo total y vencido por cliente, sin inventar antigüedad por días', dz.saldo_total && dz.vencido_total && !dz.antiguedad_total && dz.renglones.some((x) => x.nombre === 'CLIENTE DOS' && x.vencido), JSON.stringify(dz).slice(0, 300));
    const cl = (await req('GET', '/clientes', { cookie: conA.cookie })).json;
    const c1 = cl.find((x) => x.nombre === 'CLIENTE UNO'), c2 = cl.find((x) => x.nombre === 'CLIENTE DOS');
    ok('saldos sin detalle: los clientes quedan en el catálogo con su saldo y su vencido de SICAR', c1 && c1.saldo_sicar === 100050 && c1.vencido_sicar === 40000 && c2 && c2.vencido_sicar === 0, JSON.stringify([c1, c2]));
    ok('B no ve los saldos de A', !(await req('GET', '/sicar/resumen', { cookie: dirB.cookie })).json.conciliacion.cxc);
    ok('un archivo que no es de SICAR = 400 con la instrucción', (await subir(capA.cookie, [[R([1, 'Factura'])]], false)).json.error === 'no_es_reporte_sicar');

    {
    console.log('\nSubir archivos: varios juntos, cada uno se reconoce solo (cargar.js + /cargar)');
    const CG = require('./src/cargar');
    const ctas = [{ id: 1, nombre: 'Cobranza', banco: 'BBVA', terminacion: '7788', active: true }, { id: 2, nombre: 'Operación', banco: 'HSBC', terminacion: '4321', active: true }];
    const filasBanco = [['Fecha', 'Concepto', 'Cargo', 'Abono', 'Saldo'], ['05/11/2026', 'SPEI', '', '100', '100']];
    ok('banco: los últimos 4 dígitos en el nombre eligen la cuenta', (() => { const c = CG.clasificarTabla(filasBanco, 'edo cta 7788.csv', ctas); return c.tipo === 'banco' && c.estado === 'auto' && c.cuenta_id === 1; })());
    ok('banco: el nombre del banco elige la cuenta', CG.clasificarTabla(filasBanco, 'HSBC noviembre.xlsx', ctas).cuenta_id === 2);
    ok('banco: dos cuentas posibles = revisar, nunca se adivina', CG.clasificarTabla(filasBanco, 'estado.csv', ctas).estado === 'revisar');
    ok('banco: una fecha no se confunde con los últimos 4 dígitos', CG.clasificarTabla([['Cuenta del 01/01/7788'], ...filasBanco], 'estado.csv', ctas).estado === 'revisar');
    ok('banco: el número de cuenta completo que termina en los dígitos sí cuenta', CG.clasificarTabla([['Cuenta: 0123457788'], ...filasBanco], 'estado.csv', ctas).cuenta_id === 1);
    ok('una sola cuenta: va a esa', CG.clasificarTabla(filasBanco, 'x.csv', [ctas[0]]).estado === 'auto');
    ok('lista con columna Cliente = por cobrar', (() => { const c = CG.clasificarTabla([['Cliente', 'Folio', 'Total'], ['A', '1', '10']], 'x.csv', ctas); return c.tipo === 'cxc' && c.estado === 'auto'; })());
    ok('lista con columna Proveedor = por pagar', CG.clasificarTabla([['Proveedor', 'Folio', 'Saldo'], ['A', '1', '10']], 'x.csv', ctas).tipo === 'cxp');
    ok('lista que solo dice Nombre = revisar', CG.clasificarTabla([['Nombre', 'Total'], ['A', '10']], 'x.csv', ctas).estado === 'revisar');
    ok('columna Cliente pero archivo "proveedores" = revisar', CG.clasificarTabla([['Cliente', 'Total'], ['A', '10']], 'proveedores.csv', ctas).estado === 'revisar');
    ok('un archivo sin columnas conocidas se rechaza con el motivo', CG.clasificarTabla([['a', 'b'], ['1', '2']], 'x.csv', ctas).estado === 'rechazado');
    ok('orden: saldos de SICAR antes que bancos', CG.orden({ sicar_tipo: 'creditos_clientes' }) < CG.orden({ tipo: 'banco' }) && CG.orden({ sicar_tipo: 'ventas_general' }) < CG.orden({ tipo: 'cxc' }));
    // Cuentas fuera del efectivo (incluir=FALSE): las pruebas de después no cambian.
    const [[cuC1]] = await db.query("INSERT INTO fz_cuentas (tenant_id,nombre,banco,terminacion,incluir) VALUES (:t,'Carga BBVA','BBVA','7788',FALSE) RETURNING id", { replacements: { t: A } });
    const [[cuC2]] = await db.query("INSERT INTO fz_cuentas (tenant_id,nombre,banco,terminacion,incluir) VALUES (:t,'Carga HSBC','HSBC','4321',FALSE) RETURNING id", { replacements: { t: A } });
    const fBanco = ['Fecha,Concepto,Referencia,Cargo,Abono,Saldo', `${hoy.slice(8)}/${hoy.slice(5, 7)}/${hoy.slice(0, 4)},DEPOSITO CARGA,CG1,,"1,234.00","9,999.00"`].join('\n');
    const fVentas = ['Reporte General de Ventas', 'Documento,Fecha,Folio,Cliente,Caja,Usuario,Folio F.,Est,Total', 'Ticket,02/11/2026,9001,Cliente Carga,Caja 1,admin,,V,"$ 500.00"'].join('\n');
    const fCxp = ['Proveedor,Folio,Fecha,Total', 'PROVEEDOR CARGA,PC-1,01/11/2026,"3,000.00"'].join('\n');
    const lote = [{ name: 'BBVA 7788 nov.csv', data: fBanco }, { name: 'ventas.csv', data: fVentas }, { name: 'cxp.csv', data: fCxp }, { name: 'basura.csv', data: 'a,b\n1,2' },
      { name: 'copia.csv', data: fBanco }, { name: 'estado sin pista.csv', data: fBanco.replace('CG1', 'CG2') }, { name: 'otro.pdf', type: 'application/pdf', data: '%PDF-' + JSON.stringify([[R([1, 'Factura'])]]) }];
    const cargar = (cookie, files, fields) => req('POST', '/cargar', { cookie, raw: multipartMulti(fields || {}, files) });
    const nMov = async () => (await q("SELECT COUNT(*)::int AS n FROM fz_movimientos WHERE tenant_id=:t AND referencia LIKE 'CG%'", { t: A }))[0].n;
    const pv = await cargar(capA.cookie, lote, { aplicar: '0' });
    ok('vista previa de la carga: reconoce todo y NO guarda nada', pv.status === 200 && pv.json.aplicado === false && pv.json.archivos[0].estado === 'listo' && await nMov() === 0 && !(await q("SELECT 1 FROM fz_cxp WHERE tenant_id=:t AND folio='PC-1'", { t: A })).length, JSON.stringify(pv.json));
    ok('contador no sube archivos', (await cargar(conA.cookie, lote)).status === 403);
    const cg = await cargar(capA.cookie, lote);
    const by = (n) => cg.json.archivos.find((a) => a.archivo === n) || {};
    ok('estado de cuenta: a la cuenta por sus 4 dígitos, cargado', by('BBVA 7788 nov.csv').estado === 'cargado' && by('BBVA 7788 nov.csv').cuenta_id === cuC1.id && by('BBVA 7788 nov.csv').resultado.creados === 1, JSON.stringify(by('BBVA 7788 nov.csv')));
    ok('reporte de SICAR dentro del lote: reconocido y cargado', by('ventas.csv').tipo === 'sicar' && by('ventas.csv').sicar_tipo === 'ventas_general' && by('ventas.csv').estado === 'cargado');
    ok('lista de proveedores: cuentas por pagar creadas', by('cxp.csv').tipo === 'cxp' && by('cxp.csv').estado === 'cargado' && (await q("SELECT 1 FROM fz_cxp WHERE tenant_id=:t AND folio='PC-1'", { t: A })).length === 1);
    ok('archivo sin sentido: rechazado con motivo, no tumba los demás', by('basura.csv').estado === 'rechazado' && by('basura.csv').motivo);
    ok('el mismo archivo dos veces en el lote se lee una vez', by('copia.csv').estado === 'repetido' && await nMov() === 1);
    ok('estado de cuenta sin pista de cuenta (2 cuentas): revisar, no se carga', by('estado sin pista.csv').estado === 'revisar' && (by('estado sin pista.csv').candidatas || []).length >= 2);
    ok('un PDF que no es de SICAR: rechazado con la instrucción', by('otro.pdf').estado === 'rechazado' && /Excel o CSV/.test(by('otro.pdf').motivo));
    ok('subir el lote otra vez no duplica', (await cargar(capA.cookie, lote)).status === 200 && await nMov() === 1 && (await q("SELECT COUNT(*)::int AS n FROM fz_cxp WHERE tenant_id=:t AND folio='PC-1'", { t: A }))[0].n === 1);
    const dec = await cargar(capA.cookie, [{ name: 'estado sin pista.csv', data: fBanco.replace('CG1', 'CG2') }], { decisiones: JSON.stringify({ 0: { tipo: 'banco', cuenta_id: cuC2.id } }) });
    ok('la persona confirma la cuenta y se carga ahí', dec.json.archivos[0].estado === 'cargado' && (await q("SELECT cuenta_id FROM fz_movimientos WHERE tenant_id=:t AND referencia='CG2'", { t: A }))[0].cuenta_id === cuC2.id);
    const [[cuBx]] = await db.query("SELECT id FROM fz_cuentas WHERE tenant_id=:t LIMIT 1", { replacements: { t: B } });
    const dx = await cargar(capA.cookie, [{ name: 'e.csv', data: fBanco.replace('CG1', 'CG3') }], { decisiones: JSON.stringify({ 0: { tipo: 'banco', cuenta_id: cuBx.id } }) });
    ok('elegir una cuenta de otra empresa no carga nada', dx.json.archivos[0].estado === 'revisar' && !(await q("SELECT 1 FROM fz_movimientos WHERE referencia='CG3'")).length);
    ok('más de 12 archivos = 413', (await cargar(capA.cookie, Array.from({ length: 13 }, (_, i) => ({ name: i + '.csv', data: 'a' })))).status === 413);
    const est = (await req('GET', '/cargar/estado', { cookie: conA.cookie })).json;
    ok('estado: qué reporte se subió y hasta cuándo hay banco', est.sicar.some((x) => x.tipo === 'ventas_general') && est.bancos.some((b) => b.id === cuC1.id && b.hasta === hoy));
    ok('B no ve el estado de A', !(await req('GET', '/cargar/estado', { cookie: dirB.cookie })).json.sicar.some((x) => x.tipo === 'ventas_general'));
    const srcCg = strip(fs.readFileSync(path.join(__dirname, 'src', 'cargar.js'), 'utf8'));
    ok('cargar.js no toca base de datos ni red', !/require\(|sequelize|fetch\(/.test(srcCg));

    }
    {
    console.log('\nEstados de cuenta en PDF (BBVA, HSBC) y más reportes de SICAR (utilidades, inventario)');
    const BP = require('./src/bancos-pdf');
    const S2 = require('./src/sicar');
    const R = (...c) => c.map(([x, t]) => ({ x, t }));
    // HSBC escribe en EBCDIC: el inverso de la tabla del lector, para armar la prueba.
    const INV = {}; for (let c = 0x40; c <= 0xff; c++) { const ch = BP.ebcdic('Á' + String.fromCharCode(c)); if (ch.length === 2 && ch[0] === 'A') INV[ch[1]] = String.fromCharCode(c); }
    const enc = (t) => [...t].map((ch) => INV[ch] || ch).join('');
    const bbva = (quita) => [[
      R([497, 'Estado de Cuenta']), R([481, 'MAESTRA PYME BBVA']), R([310, 'Periodo'], [481, 'DEL 01/10/2026 AL 31/10/2026']), R([309, 'No. de Cuenta'], [550, '0125067788']),
      R([316, 'Saldo de Operaci'], [380, 'ó'], [384, 'n Inicial'], [559, '1,000.00']),
      R([316, 'Dep'], [331, 'ó'], [336, 'sitos / Abonos (+)'], [451, '1'], [552, '500.00']), R([317, 'Retiros / Cargos (-)'], [451, '2'], [552, '250.50']),
      R([316, 'Saldo de Operaci'], [380, 'ó'], [384, 'n Final'], [559, '1,249.50']),
      R([18, 'OPER'], [51, 'LIQ'], [83, 'COD. DESCRIPCI'], [153, 'Ó'], [160, 'N'], [230, 'REFERENCIA'], [377, 'CARGOS'], [434, 'ABONOS'], [485, 'OPERACI'], [548, 'LIQUIDACI']),
      R([10, '01/OCT'], [52, '01/OCT'], [83, 'T20 SPEI RECIBIDOBANORTE'], [432, '500.00']), R([83, '0021026PAGO DE FACTURA Ref. 0163095971 072']), R([83, '00072580001513414766']), R([83, '8846APR1202610025842430206']), R([83, 'CLIENTE PRUEBA SA DE CV']),
      R([10, '02/OCT'], [52, '02/OCT'], [83, 'A15 OXXO GAS'], [376, '200.00']), R([83, 'RFC: SGM 950714DC2 07:43 AUT: 272629 Ref. ******3114']),
      ...(quita ? [] : [R([10, '03/OCT'], [52, '03/OCT'], [83, 'S39 SERV BANCA INTERNET'], [383, '50.50'], [493, '1,249.50'], [561, '1,249.50']), R([83, 'Ref. OPS SERV BCA IN'])]),
      R([9, 'BBVA MEXICO, S.A., INSTITUCION DE BANCA MULTIPLE, GRUPO FINANCIERO BBVA MEXICO'])
    ]];
    const e = bbva(false), eb = BP.leer(e);
    ok('BBVA PDF: cuadra con saldo final, número y total de cargos y abonos', eb.banco === 'bbva' && eb.cuadra === true && eb.movimientos.length === 3 && eb.terminacion === '7788', JSON.stringify(eb.problemas));
    ok('BBVA PDF: abono positivo, cargo negativo (por su columna)', eb.movimientos[0].monto === 50000 && eb.movimientos[1].monto === -20000 && eb.movimientos[2].monto === -5050);
    ok('BBVA PDF: concepto = renglón 1 · renglón 2; referencia solo dígitos; contraparte = nombre', eb.movimientos[0].concepto === 'T20 SPEI RECIBIDOBANORTE · 0021026PAGO DE FACTURA Ref. 0163095971 072' && eb.movimientos[0].referencia === '0163095971' && eb.movimientos[0].contraparte === 'CLIENTE PRUEBA SA DE CV' && eb.movimientos[1].referencia === null);
    ok('BBVA PDF: una "ó" suelta no se traduce como EBCDIC', eb.saldo_inicial === 100000);
    const ebm = BP.leer(bbva(true));
    ok('BBVA PDF al que le falta un movimiento: NO cuadra y lo dice', ebm.cuadra === false && ebm.problemas.length > 0);
    const hsbc = [[
      R([246, 'CUENTA DE CHEQUES']), R([372, 'Saldo Inicial del'], [514, '$ 100.00']), R([372, 'Saldo Final del'], [514, '$ 130.50']), R([468, '01/10/2026 al 31/10/2026']),
      R([41, enc('DETALLE MOVIMIENTOS CUENTA DE CHEQUES No.  4071119754')]),
      R([42, enc('Día')], [141, 'xx'], [349, 'Retiro/Cargo'], [421, 'ÄÎ¢'], [528, 'Saldo']),
      R([43, enc('02')], [61, enc('1388                             0000044')], [300, enc('08045211')], [435, enc('$ 50.00')], [526, enc(' $ 150.00')]), R([309, enc('662773')]),
      R([43, enc('05')], [61, enc('CGO SPEI 19557K2010EZ')], [300, enc('08045209')], [377, enc('$ 19.50')], [541, enc(' $ 130.50')]),
      R([24, 'Emitido por: HSBC México S.A. Institución de Banca Múltiple'])
    ]];
    const eh = BP.leer(hsbc);
    ok('HSBC PDF en EBCDIC: se traduce, cuadra y toma la referencia de su columna', eh.banco === 'hsbc' && eh.cuadra === true && eh.movimientos.length === 2 && eh.movimientos[0].concepto === '1388 0000044' && eh.movimientos[0].referencia === '08045211' && eh.movimientos[1].monto === -1950, JSON.stringify(eh.movimientos));
    ok('un PDF que no es estado de cuenta no se lee como tal', BP.leer([[R([1, 'Minuta de reunión'])]]).error === 'no_es_estado_de_cuenta');
    // Subirlos juntos: van a su cuenta por el banco (o los dígitos) y la huella es la del importador normal.
    const [[cBb]] = await db.query("INSERT INTO fz_cuentas (tenant_id,nombre,banco,incluir) VALUES (:t,'PDF BBVA','BBVA',FALSE) RETURNING id", { replacements: { t: B } });
    const [[cHs]] = await db.query("INSERT INTO fz_cuentas (tenant_id,nombre,banco,incluir) VALUES (:t,'PDF HSBC','HSBC',FALSE) RETURNING id", { replacements: { t: B } });
    const pdfFile = (name, pages) => ({ name, type: 'application/pdf', data: '%PDF-' + JSON.stringify(pages) });
    const cargarB = (files) => req('POST', '/cargar', { cookie: dirB.cookie, raw: multipartMulti({}, files) });
    const up = await cargarB([pdfFile('BBVA OCTUBRE.pdf', e), pdfFile('HSBC OCTUBRE.pdf', hsbc), pdfFile('BBVA INCOMPLETO.pdf', bbva(true).map((p) => p.concat([R([1, 'x'])])))]);
    const ub = (n) => up.json.archivos.find((a) => a.archivo === n) || {};
    ok('PDF de BBVA y de HSBC en una sola carga: cada uno a su cuenta', ub('BBVA OCTUBRE.pdf').estado === 'cargado' && ub('BBVA OCTUBRE.pdf').cuenta_id === cBb.id && ub('HSBC OCTUBRE.pdf').estado === 'cargado' && ub('HSBC OCTUBRE.pdf').cuenta_id === cHs.id, JSON.stringify(up.json));
    ok('un estado de cuenta que no cuadra no se carga solo', ub('BBVA INCOMPLETO.pdf').estado === 'revisar' && /no cuadra/.test(ub('BBVA INCOMPLETO.pdf').motivo));
    const mv = await q("SELECT concepto, referencia, contraparte, monto FROM fz_movimientos WHERE tenant_id=:t AND cuenta_id=:c ORDER BY fecha", { t: B, c: cBb.id });
    ok('movimientos del PDF guardados con contraparte', mv.length === 3 && mv[0].contraparte === 'CLIENTE PRUEBA SA DE CV' && Number(mv[1].monto) === -200);
    const cs = (await q('SELECT saldo_inicial, fecha_saldo::text AS f FROM fz_cuentas WHERE id=:id', { id: cBb.id }))[0];
    ok('el saldo de la cuenta queda en el saldo final del banco', Number(cs.saldo_inicial) === 1249.5 && cs.f === '2026-10-03');
    const up2 = await cargarB([pdfFile('BBVA OCTUBRE (1).pdf', bbva(false).map((p) => p.concat([R([2, 'y'])])))]);
    ok('el mismo mes otra vez (otro archivo): nada se duplica', up2.json.archivos[0].resultado.creados === 0 && up2.json.archivos[0].resultado.duplicados === 3);
    const hashOk = require('crypto').createHash('sha256').update(['2026-10-02', 'A15 OXXO GAS · RFC: SGM 950714DC2 07:43 AUT: 272629 Ref. ******3114', '', '-200.00'].join('|') + '|0').digest('hex').slice(0, 32);
    ok('la huella del movimiento es la del importador de siempre (fecha|concepto|referencia|monto)', (await q('SELECT 1 FROM fz_movimientos WHERE tenant_id=:t AND hash=:h', { t: B, h: hashOk })).length === 1);

    const F = require('./test-fixtures-sicar');
    const uv = S2.leer(F.utilVentas), ua = S2.leer(F.utilArt), iv = S2.leer(F.inventario), iu = S2.leer(F.invUtil);
    ok('Utilidades por Ventas (manual): venta y utilidad cuadran con TOTALES; la nota de crédito resta', uv.tipo === 'utilidades_ventas' && uv.cuadra === true && uv.total_leido === 215084 && uv.utilidad_leida === 98038 && uv.filas.some((x) => x.doc === 'NC'));
    ok('Utilidades por Artículos (manual): cuadra; cantidades con coma decimal; pérdida negativa', ua.tipo === 'utilidades_articulos' && ua.cuadra === true && ua.filas[2].utilidad === -74 && ua.filas.reduce((a, x) => a + x.cantidad, 0) === 32);
    ok('Inventario (manual): cuadra con el "Total :" y lee la base de precio', iv.tipo === 'inventario' && iv.cuadra === true && iv.total_leido === 389520 && iv.filtros.precio === 'Precio de Venta' && iv.filas[0].existencia === 6);
    ok('Inventario/Utilidad (manual): se distingue del Inventario', iu.tipo === 'inventario_utilidad' && iu.filas.length === 3 && iu.filas[2].utilidad === 84600);
    const mal = JSON.parse(JSON.stringify(F.utilVentas)); mal[0][3][8].t = '$ 70.00';
    ok('una utilidad que no suma lo impreso: no cuadra', S2.leer(mal).cuadra === false);
    const subirB = (name, pages) => req('POST', '/sicar/importar', { cookie: dirB.cookie, raw: multipart({ aplicar: '1' }, { name, type: 'application/pdf', data: '%PDF-' + JSON.stringify(pages) }) });
    await subirB('util.pdf', F.utilVentas); await subirB('art.pdf', F.utilArt); await subirB('inv.pdf', F.inventario);
    const rsB = (await req('GET', '/sicar/resumen?desde=2020-01-01', { cookie: dirB.cookie })).json;
    ok('resumen: margen bruto = utilidad / venta neta', rsB.margen && rsB.margen.venta === 215084 && rsB.margen.utilidad === 98038 && rsB.margen.pct === 45.6, JSON.stringify(rsB.margen));
    ok('resumen: valor del inventario y su base', rsB.inventario && rsB.inventario.valor === 389520 && rsB.inventario.base === 'Precio de Venta' && rsB.inventario.top[0].valor === 240000, JSON.stringify(rsB.inventario));
    ok('resumen: utilidad por artículo sumada por clave (una venta con pérdida no hace perdedor al artículo)', rsB.articulos && rsB.articulos.mejores[0].clave === '8HH00R2055104' && rsB.articulos.mejores[0].utilidad === 86274 && rsB.articulos.perdida.length === 0, JSON.stringify(rsB.articulos));
    ok('A no ve el margen ni el inventario de B', !(await req('GET', '/sicar/resumen?desde=2020-01-01', { cookie: dirA.cookie })).json.inventario);
    const srcBp = strip(fs.readFileSync(path.join(__dirname, 'src', 'bancos-pdf.js'), 'utf8'));
    ok('bancos-pdf.js no toca base de datos ni red', !/require\(|sequelize|fetch\(/.test(srcBp));
    const real = process.env.FORZZA_MUESTRAS_DIR;
    if (real && fs.existsSync(real)) {
      const pdfs = fs.readdirSync(real).filter((f) => /^(BBVA|HSBC).*\.pdf$/i.test(f));
      const saved = router._pdfRows; router._pdfRows = null;
      for (const f of pdfs) { const r = await router._clasificarArchivo(fs.readFileSync(path.join(real, f)), f, [{ id: 1, banco: 'BBVA', nombre: 'b', active: true }, { id: 2, banco: 'HSBC', nombre: 'h', active: true }]); ok('real: ' + f + ' se reconoce y cuadra', r.estado === 'auto', r.motivo); }
      router._pdfRows = saved;
    } else console.log('  (sin FORZZA_MUESTRAS_DIR: no se probaron los PDF reales de los bancos)');
    }
    console.log('\nMensajes de error claros al importar');
    { const mpB = (files) => { const b = '----e' + Date.now(); const p = []; for (const f of files) p.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="archivos"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), f.data, Buffer.from('\r\n')); p.push(Buffer.from(`--${b}--\r\n`)); return { body: Buffer.concat(p), type: 'multipart/form-data; boundary=' + b }; };
      const rE = await req('POST', '/cargar', { cookie: capA.cookie, raw: mpB([
        { name: 'foto.jpg', data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 3)]) },
        { name: 'dañado.pdf', data: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2000, 65)]) },
        { name: 'Créditos.txt', data: Buffer.from('hola, esto no es un reporte\nnada\n') }]) });
      const aE = (rE.json && rE.json.archivos) || [];
      ok('una foto se rechaza diciendo que es una foto', /foto o imagen/.test((aE[0] || {}).motivo || ''));
      ok('un PDF dañado: mensaje claro, sin código técnico', /dañado/.test((aE[1] || {}).motivo || ''));
      ok('el nombre con acento llega bien (no «CrÃ©ditos»)', (aE[2] || {}).archivo === 'Créditos.txt', (aE[2] || {}).archivo);
      ok('ningún motivo trae un código técnico (palabra_con_guion_bajo)', aE.every((a) => a.motivo && !/[a-z]+_[a-z]+/.test(a.motivo)));
      const apE = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
      ok('la pantalla nunca muestra "No se pudo completar (código)"', !/No se pudo completar \(' \+/.test(apE) && /ERR\.ocupado/.test(apE) && /sin_conexion/.test(apE));
      ok('si un grupo falla, sus archivos quedan con «Intentar de nuevo» y la carga sigue', /data-reintentar/.test(apE) && /r\.fallo/.test(apE)); }
    console.log('\nReportes: Departamento de Inteligencia de Datos');
    { const RP = require('./src/reportes'), DL2 = require('./src/dalia');
      const rows = [['FORZZA MATERIALES'], ['Reporte de ventas', '', '', ''], [], ['Fecha', 'Cliente', 'Folio', 'Total'],
        ['05/10/2026', 'Constructora Uno', '001', '$1,200.50'], ['12/10/2026', 'Obras Dos', '002', '800'], ['03/11/2026', 'Constructora Uno', '003', '$2,000.00'],
        ['Fecha', 'Cliente', 'Folio', 'Total'], ['20/11/2026', 'Casa Tres', '004', '(150.00)'], ['', 'TOTAL', '', '$3,850.50']];
      const tb = RP.tablaDesdeFilas(rows);
      ok('lector: encuentra el encabezado debajo del título y salta el encabezado repetido', !tb.error && tb.columnas.map((c) => c.nombre).join('|') === 'Fecha|Cliente|Folio|Total' && tb.filas.length === 4, JSON.stringify(tb).slice(0, 300));
      ok('lector: tipos (fecha día/mes, número con $ y paréntesis, el folio es texto)', tb.columnas[0].tipo === 'fecha' && tb.columnas[3].tipo === 'numero' && tb.columnas[2].tipo === 'texto' && tb.filas[0][0] === '2026-10-05' && tb.filas[3][3] === -150);
      ok('lector: el renglón TOTAL del archivo no entra (los totales los calcula el sistema)', !tb.filas.some((f) => /total/i.test(String(f[1]))) && tb.notas.some((n) => /totales/.test(n)));
      const pdfT = RP.tablaDesdePdf([[ [{ x: 10, t: 'Fecha' }, { x: 120, t: 'Proveedor' }, { x: 300, t: 'Importe' }], [{ x: 10, t: '01/10/2026' }, { x: 121, t: 'Cementos SA' }, { x: 305, t: '5,000.00' }], [{ x: 10, t: '02/10/2026' }, { x: 300, t: '1,000.00' }, { x: 119, t: 'Aceros' }] ]]);
      ok('lector PDF: cada celda va a la columna de su encabezado por posición', !pdfT.error && pdfT.filas.length === 2 && pdfT.filas[1][1] === 'Aceros' && pdfT.filas[1][2] === 1000, JSON.stringify(pdfT).slice(0, 200));
      const cq = RP.consultar(tb, { agrupar_por: [{ columna: 'Cliente' }], metricas: [{ op: 'suma', columna: 'Total', nombre: 'Ventas' }, { op: 'conteo', nombre: 'Notas' }], orden: { columna: 'Ventas', dir: 'desc' } });
      ok('consulta: agrupa y suma en código', cq.filas[0][0] === 'Constructora Uno' && cq.filas[0][1] === 3200.5 && cq.filas[0][2] === 2 && cq.totales.Ventas === 3850.5, JSON.stringify(cq));
      const cm = RP.consultar(tb, { agrupar_por: [{ columna: 'Fecha', periodo: 'mes' }], metricas: [{ op: 'suma', columna: 'Total' }], filtros: [{ columna: 'Total', op: '>', valor: 0 }] });
      ok('consulta: agrupa fechas por mes, en orden, con filtro', JSON.stringify(cm.filas) === JSON.stringify([['2026-10', 2000.5], ['2026-11', 2000]]), JSON.stringify(cm.filas));
      ok('consulta: «Otros» junta lo que no cabe', RP.consultar(tb, { agrupar_por: ['Cliente'], metricas: [{ op: 'suma', columna: 'Total', nombre: 'V' }], orden: { columna: 'V' }, limite: 1, agrupar_resto: true }).filas[1][1] === 650);
      ok('consulta: una columna que no existe se dice, no se inventa', /No existe la columna/.test(RP.consultar(tb, { agrupar_por: ['Vendedor'] }).error || ''));
      const consultasV = { c1: cq };
      ok('verificador: un reporte correcto pasa', RP.verificar({ titulo: 'Ventas', resumen: 'Constructora Uno compró $3,200.50.', secciones: [{ tipo: 'tabla', consulta: 'c1' }, { tipo: 'grafica', consulta: 'c1', etiqueta: 'Cliente', valores: ['Ventas'] }] }, consultasV, DL2._permitidos([cq])).length === 0);
      ok('verificador: una cifra inventada en el resumen se rechaza', RP.verificar({ titulo: 'Ventas', resumen: 'Vendimos $9,999,999.00.', secciones: [{ tipo: 'tabla', consulta: 'c1' }] }, consultasV, DL2._permitidos([cq])).some((x) => /9,999,999/.test(x)));
      ok('verificador: una consulta o columna que no existe se rechaza', RP.verificar({ titulo: 'X', resumen: 'ok', secciones: [{ tipo: 'tabla', consulta: 'c9' }, { tipo: 'grafica', consulta: 'c1', etiqueta: 'Cliente', valores: ['Utilidad'] }] }, consultasV, []).length === 2);
      const srcR = strip(fs.readFileSync(path.join(__dirname, 'src', 'reportes.js'), 'utf8'));
      ok('reportes.js no toca la base de datos, la red ni el SDK (el modelo pasa por dalia.crear)', !/sequelize|fetch\(|anthropic-ai|require\('\.\/db'\)/.test(srcR) && /D\.crear\(/.test(srcR));

      // Flujo completo con un modelo simulado.
      const csv = 'Fecha,Cliente,Total\n05/10/2026,Constructora Uno,1200.50\n12/10/2026,Obras Dos,800\n03/11/2026,Constructora Uno,2000\n';
      const subirR = (cookie, name, data) => req('POST', '/reportes/archivos', { cookie, raw: multipartMulti({}, [{ name, data }]) });
      const up = await subirR(capA.cookie, 'ventas.csv', csv);
      const arch = up.json && up.json.archivos && up.json.archivos[0];
      ok('subir un archivo para reportes: se lee la tabla', up.status === 200 && arch && arch.ok && arch.renglones === 3, JSON.stringify(up.json));
      const malo = await subirR(capA.cookie, 'foto.png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100, 1)]));
      ok('subir una foto: mensaje claro', malo.json.archivos[0].ok === false && /foto o imagen/.test(malo.json.archivos[0].motivo));
      ok('el contador no sube archivos ni crea reportes', (await subirR(conA.cookie, 'v.csv', csv)).status === 403 && (await req('POST', '/reportes', { cookie: conA.cookie, body: { peticion: 'ventas por cliente', archivo_ids: [arch.id] } })).status === 403);
      ok('otra empresa no puede usar ese archivo', (await req('POST', '/reportes', { cookie: dirB.cookie, body: { peticion: 'ventas por cliente', archivo_ids: [arch.id] } })).status === 404);
      const secRep = 'SITREPB' + STAMP;
      { const [[cbR]] = await db.query("INSERT INTO fz_cuentas (tenant_id,nombre,banco,incluir) VALUES (:t,'Rep B','BBVA',TRUE) RETURNING id", { replacements: { t: B } });
        await db.query("INSERT INTO fz_movimientos (tenant_id,cuenta_id,fecha,concepto,monto,categoria) VALUES (:t,:c,:f,:k,4242.42,'cliente')", { replacements: { t: B, c: cbR.id, f: hoyMx(), k: secRep } }); }
      const turnos = [];
      const fakeR = (pasos) => ({ messages: { create: async (p) => { turnos.push(p); return pasos.shift()(p); } } });
      const tu = (name, input) => () => ({ content: [{ type: 'tool_use', id: 'r' + Math.random(), name, input }] });
      const entregar = { titulo: 'Ventas por cliente', resumen: 'Constructora Uno es el cliente que más compró: $3,200.50.', secciones: [
        { tipo: 'indicadores', items: [{ etiqueta: 'Mayor cliente', consulta: 'c1', columna: 'Ventas', fila: 0 }] },
        { tipo: 'grafica', titulo: 'Ventas', consulta: 'c1', forma: 'barras', etiqueta: 'Cliente', valores: ['Ventas'] }, { tipo: 'tabla', titulo: 'Detalle', consulta: 'c1' }] };
      DL2._setClient(fakeR([tu('ver_fuentes', {}), tu('consultar', { fuente: 'ventas.csv', agrupar_por: [{ columna: 'Cliente' }], metricas: [{ op: 'suma', columna: 'Total', nombre: 'Ventas' }], orden: { columna: 'Ventas', dir: 'desc' }, tenant_id: B }),
        tu('entregar_reporte', { ...entregar, resumen: 'Vendimos $7,777,777.00 en total.' }), tu('entregar_reporte', entregar)]));
      const cr = await req('POST', '/reportes', { cookie: capA.cookie, body: { peticion: 'ventas por cliente con gráfica', archivo_ids: [arch.id], incluir_bancos: true } });
      ok('crear reporte: responde de inmediato (se arma en segundo plano)', cr.status === 202 && cr.json.estado === 'generando');
      let rep; for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 100)); rep = (await req('GET', '/reportes/' + cr.json.id, { cookie: conA.cookie })).json; if (rep.estado !== 'generando') break; }
      ok('el reporte queda listo y el contador lo puede ver', rep.estado === 'listo' && rep.spec.titulo === 'Ventas por cliente', JSON.stringify(rep).slice(0, 300));
      ok('las cifras de la tabla las puso el código', JSON.stringify(rep.spec.datos.c1.filas) === JSON.stringify([['Constructora Uno', 3200.5], ['Obras Dos', 800]]));
      ok('el verificador rechazó la primera entrega con la cifra inventada', turnos.some((t) => JSON.stringify(t.messages).includes('7,777,777') && JSON.stringify(t.messages).includes('verificador')) && !JSON.stringify(rep.spec).includes('7,777,777'));
      ok('el modelo vio la fuente bancos de SU empresa, nunca la de otra', JSON.stringify(turnos[1].messages).includes('bancos') && !JSON.stringify(turnos).includes(secRep));
      ok('otra empresa no ve el reporte', (await req('GET', '/reportes/' + cr.json.id, { cookie: dirB.cookie })).status === 404 && !(await req('GET', '/reportes', { cookie: dirB.cookie })).json.some((x) => x.id === cr.json.id));
      const pe = await req('PATCH', '/reportes/' + cr.json.id, { cookie: capA.cookie, body: { titulo: 'Ventas de octubre y noviembre', secciones: [{ i: 1, titulo: 'Gráfica' }] } });
      const rep2 = (await req('GET', '/reportes/' + cr.json.id, { cookie: capA.cookie })).json;
      ok('editar a mano: cambia los textos, no las cifras', pe.status === 200 && rep2.spec.titulo === 'Ventas de octubre y noviembre' && rep2.spec.secciones[1].titulo === 'Gráfica' && rep2.editado_a_mano && JSON.stringify(rep2.spec.datos) === JSON.stringify(rep.spec.datos));
      DL2._setClient(fakeR([tu('consultar', { fuente: 'ventas.csv', agrupar_por: [{ columna: 'Fecha', periodo: 'mes' }], metricas: [{ op: 'suma', columna: 'Total', nombre: 'Ventas' }] }),
        tu('entregar_reporte', { titulo: 'Ventas por mes', resumen: 'Ventas mensuales.', secciones: [{ tipo: 'grafica', consulta: 'c1', forma: 'lineas', etiqueta: 'mes de Fecha', valores: ['Ventas'] }] })]));
      const cam = await req('POST', '/reportes/' + cr.json.id + '/cambiar', { cookie: capA.cookie, body: { peticion: 'mejor por mes, con líneas' } });
      let v2; for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 100)); v2 = (await req('GET', '/reportes/' + cam.json.id, { cookie: capA.cookie })).json; if (v2.estado !== 'generando') break; }
      ok('pedir un cambio crea la versión 2 y conserva la 1', cam.status === 202 && v2.estado === 'listo' && v2.version === 2 && v2.versiones.length === 2 && (await req('GET', '/reportes/' + cr.json.id, { cookie: capA.cookie })).json.estado === 'listo');
      { const Dd = router._daliaDeps(), ctxA = { tenant: A, D: Dd }, ctxB = { tenant: B, D: Dd };
        const la = await DL2._ejecutar('archivos_subidos', {}, ctxA);
        ok('Dalia ve los archivos subidos en Reportes de su empresa (y no los de otra)', la.archivos.some((x) => x.nombre === 'ventas.csv') && !(await DL2._ejecutar('archivos_subidos', {}, ctxB)).archivos.some((x) => x.id === arch.id));
        const qa = await DL2._ejecutar('consultar_archivo', { archivo: 'ventas', agrupar_por: [{ columna: 'Cliente' }], metricas: [{ op: 'suma', columna: 'Total', nombre: 'Total' }], orden: { columna: 'Total', dir: 'desc' } }, ctxA);
        ok('Dalia calcula sobre un archivo subido (las cuentas las hace el sistema)', qa.archivo === 'ventas.csv' && qa.filas[0][0] === 'Constructora Uno' && qa.filas[0][1] === 3200.5, JSON.stringify(qa).slice(0, 200));
        ok('Dalia no puede consultar el archivo de otra empresa ni por id', /No encontré/.test((await DL2._ejecutar('consultar_archivo', { archivo: String(arch.id) }, ctxB)).error || ''));
        const rg = await DL2._ejecutar('reportes_guardados', { buscar: 'mes' }, ctxA);
        const rd = await DL2._ejecutar('reportes_guardados', { id: cam.json.id }, ctxA);
        ok('Dalia ve los reportes guardados y sus cifras', rg.reportes.some((x) => x.id === cam.json.id) && rd.titulo === 'Ventas por mes' && rd.secciones[0].filas.length === 2 && !(await DL2._ejecutar('reportes_guardados', { id: cam.json.id }, ctxB)).titulo, JSON.stringify(rd).slice(0, 200));
        ok('Dalia: sus herramientas de Reportes están declaradas y explicadas en su guía', ['reportes_guardados', 'archivos_subidos', 'consultar_archivo'].every((n) => DL2.TOOLS.some((t) => t.name === n)) && /consultar_archivo/.test(fs.readFileSync(path.join(__dirname, 'src', 'dalia.js'), 'utf8'))); }
      ok('la lista muestra una sola entrada por reporte (la última versión)', (await req('GET', '/reportes', { cookie: capA.cookie })).json.filter((x) => x.raiz_id === cr.json.id).length === 1);
      { // 10 consultas en UNA vuelta y luego un error 529 (API saturada): cada tool_use debe recibir su tool_result
        // (si no, la API rechaza la conversación con 400) y el error pasajero se reintenta en vez de tirar el reporte.
        const q = { fuente: 'ventas.csv', agrupar_por: [{ columna: 'Cliente' }], metricas: [{ op: 'suma', columna: 'Total', nombre: 'Ventas' }], orden: { columna: 'Ventas', dir: 'desc' } };
        const vistos = []; let n = 0;
        DL2._setClient({ messages: { create: async (p) => {
          vistos.push(JSON.parse(JSON.stringify(p.messages))); n++;
          if (n === 1) return { content: Array.from({ length: 10 }, (_, i) => ({ type: 'tool_use', id: 'm' + i, name: 'consultar', input: q })) };
          if (n === 2) { const e = new Error('Overloaded'); e.status = 529; throw e; }
          return { content: [{ type: 'tool_use', id: 'fin', name: 'entregar_reporte', input: entregar }] };
        } } });
        const mr = await req('POST', '/reportes', { cookie: capA.cookie, body: { peticion: 'ventas de los primeros clientes', archivo_ids: [arch.id] } });
        let mx; for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 100)); mx = (await req('GET', '/reportes/' + mr.json.id, { cookie: capA.cookie })).json; if (mx.estado !== 'generando') break; }
        const res2 = vistos[1] && vistos[1][vistos[1].length - 1].content;
        ok('10 consultas a la vez: las 10 reciben respuesta (ninguna queda colgada) y un 529 se reintenta', mx.estado === 'listo' && Array.isArray(res2) && res2.length === 10 && Array.from({ length: 10 }, (_, i) => 'm' + i).every((id) => res2.some((b) => b.tool_use_id === id)), JSON.stringify(mx).slice(0, 200));
        ok('la página nunca recibe el detalle técnico de un reporte', !('herramientas' in mx));
      }
      DL2._setClient(fakeR(Array.from({ length: 6 }, () => tu('entregar_reporte', { titulo: 'X', resumen: 'Ganamos $5,555,555.00', secciones: [{ tipo: 'tabla', consulta: 'c1' }] }))));
      const malR = await req('POST', '/reportes', { cookie: capA.cookie, body: { peticion: 'algo imposible', archivo_ids: [arch.id] } });
      let rm; for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 100)); rm = (await req('GET', '/reportes/' + malR.json.id, { cookie: capA.cookie })).json; if (rm.estado !== 'generando') break; }
      ok('si la IA insiste en una cifra sin fuente, el reporte NO se guarda y el mensaje es claro', rm.estado === 'error' && !rm.spec && /cifras verificadas/.test(rm.mensaje || ''), JSON.stringify(rm).slice(0, 200));
      DL2._setClient(null);
      const kb = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
      const sinM = await req('POST', '/reportes', { cookie: capA.cookie, body: { peticion: 'ventas por cliente', archivo_ids: [arch.id] } });
      let rs; for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 100)); rs = (await req('GET', '/reportes/' + sinM.json.id, { cookie: capA.cookie })).json; if (rs.estado !== 'generando') break; }
      if (kb) process.env.ANTHROPIC_API_KEY = kb;
      ok('sin modelo: mensaje claro, nada inventado', rs.estado === 'error' && /no está disponible/.test(rs.mensaje || ''));
      const enLista = async (q) => (await req('GET', '/reportes' + (q || ''), { cookie: capA.cookie })).json.some((x) => x.raiz_id === cr.json.id);
      ok('archivar: sale de la lista y aparece en archivados', (await req('POST', '/reportes/' + cam.json.id + '/archivar', { cookie: capA.cookie, body: { archivar: true } })).status === 200 && !(await enLista()) && await enLista('?archivados=1'));
      ok('regresar un archivado: vuelve a la lista', (await req('POST', '/reportes/' + cr.json.id + '/archivar', { cookie: capA.cookie, body: { archivar: false } })).status === 200 && await enLista() && !(await enLista('?archivados=1')));
      ok('archivar: el contador no puede y otra empresa recibe 404', (await req('POST', '/reportes/' + cr.json.id + '/archivar', { cookie: conA.cookie, body: {} })).status === 403 && (await req('POST', '/reportes/' + cr.json.id + '/archivar', { cookie: dirB.cookie, body: {} })).status === 404);
      ok('el contador no borra', (await req('DELETE', '/reportes/' + cr.json.id, { cookie: conA.cookie })).status === 403);
      ok('borrar quita el reporte con todas sus versiones', (await req('DELETE', '/reportes/' + cr.json.id, { cookie: capA.cookie })).status === 200 && (await req('GET', '/reportes/' + cam.json.id, { cookie: capA.cookie })).status === 404);
      console.log('\nCupo de reportes: 100 al mes, luego USD 1 por reporte extra');
      { const mesBak = process.env.FORZZA_REPORTES_MES, skBak = process.env.STRIPE_SECRET_KEY;
        process.env.FORZZA_REPORTES_MES = '1'; process.env.STRIPE_SECRET_KEY = 'sk_test_sit';
        const upB = await subirR(dirB.cookie, 'b.csv', csv); const aB = upB.json.archivos[0].id;
        const buenos = () => Array.from({ length: 30 }, (_, k) => k % 2 === 0 ? tu('consultar', { fuente: 'b.csv', agrupar_por: [{ columna: 'Cliente' }], metricas: [{ op: 'suma', columna: 'Total', nombre: 'Ventas' }] }) : tu('entregar_reporte', { titulo: 'B', resumen: 'Ventas por cliente.', secciones: [{ tipo: 'tabla', consulta: 'c1' }] }));
        DL2._setClient(fakeR(buenos()));
        const pedirB = () => req('POST', '/reportes', { cookie: dirB.cookie, body: { peticion: 'ventas por cliente', archivo_ids: [aB] } });
        const cupoB = async () => (await req('GET', '/reportes/cupo', { cookie: dirB.cookie })).json;
        const r1 = await pedirB();
        ok('cupo: el primer reporte del mes entra sin crédito', r1.status === 202 && r1.json.usa_credito === false);
        const r2 = await pedirB();
        ok('cupo: al llegar al límite responde 402 con un mensaje claro', r2.status === 402 && r2.json.error === 'sin_cupo' && /incluidos de este mes/.test(r2.json.ayuda) && r2.json.cupo.disponibles === 0);
        await db.query("UPDATE fz_reportes SET estado='error' WHERE id=:i", { replacements: { i: r1.json.id } });
        ok('cupo: un reporte que falló no cuenta', (await cupoB()).usados === 0);
        await new Promise((r) => setTimeout(r, 300));
        const par = await Promise.all([pedirB(), pedirB(), pedirB()]);
        ok('cupo: tres clics al mismo tiempo con 1 disponible = solo 1 entra (candado)', par.filter((x) => x.status === 202).length === 1 && par.filter((x) => x.status === 402).length === 2, par.map((x) => x.status).join(','));
        const sesiones = {}; let nS = 0;
        router._stripe = { checkout: { sessions: {
          create: async (p) => { const id = 'cs_sit_' + (++nS); sesiones[id] = { id, payment_status: 'unpaid', status: 'open', metadata: p.metadata, amount_total: p.line_items[0].price_data.unit_amount * p.line_items[0].quantity, currency: 'usd' }; return { id, url: 'https://checkout.stripe.test/' + id }; },
          retrieve: async (id) => sesiones[id] } } };
        ok('comprar: el capturista no puede (solo el director)', (await req('POST', '/reportes/creditos/comprar', { cookie: capA.cookie, body: { cantidad: 10 } })).status === 403);
        ok('comprar: un paquete que no existe se rechaza (el monto no viene de la petición)', (await req('POST', '/reportes/creditos/comprar', { cookie: dirB.cookie, body: { cantidad: 7 } })).status === 400);
        const co = await req('POST', '/reportes/creditos/comprar', { cookie: dirB.cookie, body: { cantidad: 10 } });
        const sid = Object.keys(sesiones)[0];
        ok('comprar: abre Stripe por USD 10 con la empresa en los metadatos', co.status === 200 && /checkout\.stripe\.test/.test(co.json.url) && sesiones[sid].amount_total === 1000 && sesiones[sid].metadata.tenant_id === String(B));
        ok('sin pagar: no hay créditos', (await cupoB()).creditos === 0);
        sesiones[sid].payment_status = 'paid'; sesiones[sid].status = 'complete';
        const cp = await cupoB();
        ok('pagado: al abrir Reportes se confirman 10 reportes extra', cp.creditos === 10 && cp.recien_pagados === 10 && cp.disponibles === 10);
        ok('confirmar dos veces no duplica', (await cupoB()).creditos === 10);
        const r4 = await pedirB();
        ok('después del cupo, el siguiente reporte usa un crédito', r4.status === 202 && r4.json.usa_credito === true && (await cupoB()).creditos === 9);
        const sd = 'cs_sit_falso';
        sesiones[sd] = { id: sd, payment_status: 'paid', status: 'complete', metadata: { kind: 'forzza_reportes', tenant_id: String(A), cantidad: '50' }, amount_total: 5000, currency: 'usd' };
        await db.query("INSERT INTO fz_rep_compras (tenant_id,cantidad,monto_cents,stripe_session_id) VALUES (:t,50,5000,:s)", { replacements: { t: B, s: sd } });
        const sm = 'cs_sit_monto';
        sesiones[sm] = { id: sm, payment_status: 'paid', status: 'complete', metadata: { kind: 'forzza_reportes', tenant_id: String(B), cantidad: '25' }, amount_total: 100, currency: 'usd' };
        await db.query("INSERT INTO fz_rep_compras (tenant_id,cantidad,monto_cents,stripe_session_id) VALUES (:t,25,2500,:s)", { replacements: { t: B, s: sm } });
        ok('un pago de otra empresa o por otro monto NO da créditos', (await cupoB()).creditos === 9);
        await db.query("UPDATE fz_rep_compras SET created_at=NOW() - INTERVAL '400 days', pagado_at=NOW() - INTERVAL '400 days' WHERE tenant_id=:t AND estado='pagado'", { replacements: { t: B } });
        ok('los reportes extra comprados no vencen (una compra de hace más de un año sigue contando)', (await cupoB()).creditos === 9);
        const apC = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
        ok('pantalla: el contador se actualiza solo al regresar de Stripe y al volver con «atrás»', /reportes\/cupo'\)\.catch/.test(apC) && /pageshow/.test(apC) && /No vencen/.test(apC));
        ok('el contador ve el cupo; otra empresa no ve los créditos de B', (await req('GET', '/reportes/cupo', { cookie: conA.cookie })).status === 200 && (await req('GET', '/reportes/cupo', { cookie: dirA.cookie })).json.creditos === 0);
        router._stripe = null; DL2._setClient(null);
        if (mesBak) process.env.FORZZA_REPORTES_MES = mesBak; else delete process.env.FORZZA_REPORTES_MES;
        if (skBak) process.env.STRIPE_SECRET_KEY = skBak; else delete process.env.STRIPE_SECRET_KEY;
        await new Promise((r) => setTimeout(r, 1500)); }
      console.log('\nAnti-duplicados inteligente al importar');
      { const cargarA = (files) => req('POST', '/cargar', { cookie: capA.cookie, raw: multipartMulti({}, files) });
        await db.query("INSERT INTO fz_cuentas (tenant_id,nombre,banco,terminacion,incluir) VALUES (:t,'Dup Banco','Dupbanco','5566',FALSE)", { replacements: { t: A } });
        const m1 = 'Fecha,Concepto,Cargo,Abono\n01/09/2026,DEPOSITO CLIENTE UNO,,5000.00\n01/09/2026,DEPOSITO CLIENTE DOS,,5000.00\n02/09/2026,PAGO PROVEEDOR,1200.00,\n';
        const m2 = 'Fecha,Descripcion,Retiro,Deposito\n01/09/2026,SPEI RECIBIDO CLIENTE UNO SA,,5000.00\n01/09/2026,SPEI RECIBIDO CLIENTE DOS SA,,5000.00\n02/09/2026,TRANSFERENCIA PROVEEDOR XYZ,1200.00,\n03/09/2026,COMISION,15.00,\n';
        const u1 = (await cargarA([{ name: 'edo 5566 sep.csv', data: m1 }])).json.archivos[0];
        const u2 = (await cargarA([{ name: 'edo 5566 sep (excel del banco).csv', data: m2 }])).json.archivos[0];
        ok('banco: el mismo mes en otro formato (otro texto de concepto) no se duplica; solo entra lo nuevo', u1.resultado.creados === 3 && u2.resultado.creados === 1 && u2.resultado.otro_formato === 3, JSON.stringify([u1.resultado, u2.resultado]));
        const m3 = 'Fecha,Concepto,Cargo,Abono\n01/09/2026,DEPOSITO TERCERO,,5000.00\n01/09/2026,DEPOSITO CLIENTE UNO,,5000.00\n01/09/2026,DEPOSITO CLIENTE DOS,,5000.00\n';
        const u3 = (await cargarA([{ name: 'edo 5566 corte.csv', data: m3 }])).json.archivos[0];
        ok('banco: un tercer depósito igual el mismo día SÍ entra (se cuenta cuántos hay, no se adivina)', u3.resultado.creados === 1, JSON.stringify(u3.resultado));
        const l1 = 'Cliente,Folio,Fecha,Total,Saldo\nDup Cliente SA,F-900,01/10/2026,1000,1000\nDup Sin Folio,,02/10/2026,500,500\n';
        const r1 = (await cargarA([{ name: 'por cobrar.csv', data: l1 }])).json.archivos[0].resultado;
        const r2 = (await cargarA([{ name: 'por cobrar (otra vez).csv', data: l1 }])).json.archivos[0].resultado;
        ok('por cobrar: la misma lista otra vez no duplica (con folio y sin folio)', r1.creados === 2 && r2.creados === 0 && r2.ya_estaban === 2, JSON.stringify([r1, r2]));
        const r3 = (await cargarA([{ name: 'por cobrar actualizada.csv', data: 'Cliente,Folio,Fecha,Total,Saldo\nDup Cliente SA,F-900,01/10/2026,1000,400\n' }])).json.archivos[0].resultado;
        const r4 = (await cargarA([{ name: 'por cobrar vieja.csv', data: 'Cliente,Folio,Fecha,Total,Saldo\nDup Cliente SA,F-900,01/10/2026,1000,700\n' }])).json.archivos[0].resultado;
        r3.diferencias = r4.diferencias;
        const pend = (await q("SELECT x.total - COALESCE((SELECT SUM(monto) FROM fz_cxc_abonos a WHERE a.cxc_id=x.id),0) AS p FROM fz_cxc x WHERE x.tenant_id=:t AND x.folio='F-900'", { t: A }))[0];
        ok('por cobrar: si el archivo nuevo trae menos saldo, se registra el abono; si trae más, no se toca y se avisa', r3.actualizados === 1 && r3.diferencias === 1 && Number(pend.p) === 400 && (await q("SELECT COUNT(*)::int n FROM fz_cxc WHERE tenant_id=:t AND folio='F-900'", { t: A }))[0].n === 1, JSON.stringify(r3));
        const ar1 = (await subirR(capA.cookie, 'ventas.csv', csv)).json.archivos[0];
        ok('reportes: el mismo archivo otra vez se reutiliza (mismo id, no se duplica)', ar1.ya_estaba === true && ar1.id === arch.id);
        const csv2 = csv + '20/11/2026,Casa Tres,450\n';
        const ar2 = (await subirR(capA.cookie, 'Ventas.csv', csv2)).json.archivos[0];
        ok('reportes: mismo nombre y mismas columnas = versión nueva; se reemplaza (mismo id, datos nuevos)', ar2.actualizado === true && ar2.id === arch.id && ar2.renglones === 4 && (await q('SELECT COUNT(*)::int n FROM fz_rep_archivos WHERE tenant_id=:t AND deleted_at IS NULL AND id=:i', { t: A, i: arch.id }))[0].n === 1);
        const ar3 = (await subirR(capA.cookie, 'ventas octubre.csv', 'Fecha,Cliente,Total\n05/10/2026,Constructora Uno,1200.50\n12/10/2026,Obras Dos,800\n')).json.archivos[0];
        ok('reportes: otro archivo que repite renglones avisa que se contarán una vez', ar3.ok && !ar3.ya_estaba && ar3.notas.some((n) => /2 de 2 renglones ya están en «/.test(n)), JSON.stringify(ar3.notas));
        DL2._setClient(fakeR([tu('consultar', { fuente: 'ventas', metricas: [{ op: 'suma', columna: 'Total', nombre: 'Total' }, { op: 'conteo', nombre: 'Ventas' }] }),
          (p) => { const res = JSON.parse(p.messages[p.messages.length - 1].content[0].content); return { content: [{ type: 'tool_use', id: 'rx', name: 'entregar_reporte', input: { titulo: 'Total', resumen: 'ok', secciones: [{ tipo: 'tabla', consulta: res.id }] } }] }; }]));
        const rj = await req('POST', '/reportes', { cookie: capA.cookie, body: { peticion: 'total vendido', archivo_ids: [arch.id, ar3.id] } });
        let rjr; for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 100)); rjr = (await req('GET', '/reportes/' + rj.json.id, { cookie: capA.cookie })).json; if (rjr.estado !== 'generando') break; }
        ok('reportes: dos archivos que se enciman se juntan y los repetidos cuentan una vez (no 6 ventas, 4)', rjr.estado === 'listo' && JSON.stringify(rjr.spec.datos.c1.filas) === JSON.stringify([[4450.5, 4]]), JSON.stringify(rjr.spec && rjr.spec.datos).slice(0, 200));
        DL2._setClient(null); }
      const apR = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
      ok('menú: sección Reportes con Mis reportes y Nuevo reporte', /\['grp', 'Reportes'\], \['reportes', 'Mis reportes'\], \['reporte_nuevo', 'Nuevo reporte'\]/.test(apR) && /R\.reporte = /.test(apR) && /window\.print\(\)/.test(apR)); }
    console.log('\nGuía de usuario con la voz de Dalia');
    { const gu = fs.readFileSync(path.join(__dirname, 'public', 'guia-usuario.html'), 'utf8'), apG = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
      const imgs = [...gu.matchAll(/img: '([^']+)'/g)].map((m) => m[1]);
      ok('guía: el panel izquierdo tiene «Guía de usuario» y abre la guía', /\['url:guia-usuario\.html', 'Guía de usuario'\]/.test(apG));
      ok('guía: cada tema tiene su captura y existe el archivo', imgs.length >= 20 && imgs.every((f) => fs.existsSync(path.join(__dirname, 'public', 'guia-usuario', f + '.jpg'))), imgs.filter((f) => !fs.existsSync(path.join(__dirname, 'public', 'guia-usuario', f + '.jpg'))).join(','));
      ok('guía: narración con la voz de Dalia por /api/tts/edge y cada tema la trae (máximo 2,000 caracteres)', /\/api\/tts\/edge/.test(gu) && /voice: 'dalia'/.test(gu) && [...gu.matchAll(/\bn: '((?:[^'\\]|\\.)*)'/g)].length === imgs.length && [...gu.matchAll(/\bn: '((?:[^'\\]|\\.)*)'/g)].every((m) => m[1].length < 2000));
      ok('guía: sin emojis', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(gu.replace(/[✓▶❚‹›☰]/g, '')));
      ok('guía: las capturas son de una empresa ficticia (dice «demo»), no de datos reales', /datos de ejemplo de una empresa ficticia/.test(gu)); }
    console.log('\nTendencia (flecha bajo la calificación)');
    { const hT = '2026-10-30', mkT = (f, a, c) => ({ fecha: f, monto: a, categoria: c || 'cliente' }), bT = [];
      for (let i = 0; i < 60; i++) { const f = E.addDays(hT, -i); bT.push(mkT(f, 1000), mkT(f, -1000, 'proveedor')); }
      const tT = (x) => E.tendencia(bT.concat(x), hT, ['traspaso', 'prestamo', 'aportacion_socios']);
      ok('tendencia: lo mismo entra y sale = estable (derecha)', tT([]).dir === 'estable');
      ok('tendencia: entra más y mejor que antes = sube', tT([mkT(hT, 10000)]).dir === 'sube');
      ok('tendencia: sale un poco más = menos estable (izquierda)', tT([mkT(hT, -3000, 'proveedor')]).dir === 'menos');
      ok('tendencia: sale mucho más = baja', tT([mkT(hT, -9000, 'proveedor')]).dir === 'baja');
      ok('tendencia: un traspaso o un préstamo no mueve la flecha', tT([mkT(hT, -90000, 'traspaso'), mkT(hT, 90000, 'prestamo')]).dir === 'estable');
      ok('tendencia: sin 30 días de datos no se inventa', E.tendencia([mkT(hT, 5)], hT, []) === null);
      ok('tablero: la salud trae la tendencia', 'tendencia' in ((await req('GET', '/salud', { cookie: dirA.cookie })).json || {}));
      const apT = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
      ok('marca: Inteligencia Empresarial en el encabezado, sin "Capital" como nombre', /Inteligencia Empresarial<span class="brand-sub">Analítica estratégica y gestión predictiva del negocio/.test(apT) && !/<small>Capital<\/small>/.test(apT)); }
    console.log('\nSimulador (patrón histórico y escenarios)');
    const hm = [];
    for (const mes of ['2026-07', '2026-08']) { hm.push({ fecha: mes + '-05', monto: '10000', categoria: 'cliente' }, { fecha: mes + '-15', monto: '-4000', categoria: 'nomina' }, { fecha: mes + '-31', monto: '-1000', categoria: 'renta' }); }
    hm.push({ fecha: '2026-09-02', monto: '999999', categoria: 'cliente' }); // septiembre a medias: no entra
    const pat = E.patronHistorico(hm, { desde: '2026-07-01', hasta: '2026-09-10' });
    ok('patrón: solo meses completos (un mes a medias no cuenta)', pat.n === 2 && pat.meses.map((m) => m.mes).join() === '2026-07,2026-08' && pat.promedio_mes.entradas === C(10000));
    ok('patrón: por día del mes y por categoría', pat.dias.promedio.ent[5] === C(10000) && pat.dias.promedio.sal[15] === C(4000) && pat.por_categoria.nomina.salidas === C(4000));
    const est = E.eventosEstimados(pat, 'promedio', '2026-11-20', 15, {});
    ok('estimado: noviembre (30 días) junta en el día 30 lo del 31', est.some((e) => e.fecha === '2026-11-30' && e.monto === C(-1000)) && !est.some((e) => e.fecha === '2026-11-20'));
    ok('estimado: ajuste de -50% en entradas', E.eventosEstimados(pat, 'promedio', '2026-11-30', 10, { entradas_pct: -50 }).find((e) => e.fecha === '2026-12-05').monto === C(5000));
    const bs = { hoy: '2026-11-20', horizonte: 30, reserva: 1000, efectivo: C(5000), cxc: [{ id: 1, cliente: 'A', vencimiento: '2026-11-25', pendiente: C(3000) }], cxp: [{ id: 7, proveedor: 'P', vencimiento: '2026-11-22', pendiente: C(6000) }], fijos: [], patron: pat };
    const e0 = E.escenario(bs, {}), e1 = E.escenario(bs, { mover: [{ cxp_id: 7, fecha: '2026-11-26' }] });
    ok('escenario: sin cambios el pago deja el saldo en -$1,000 el día 2', e0.minimo.saldo === C(-1000) && e0.minimo.fecha === '2026-11-22' && e0.minimo.hasta === '2026-11-24');
    ok('escenario: mover el pago después del cobro evita el negativo', e1.minimo.saldo === C(2000) && !e1.primero_negativo);
    ok('escenario: un movimiento supuesto entra en su fecha', E.escenario(bs, { puntuales: [{ fecha: '2026-11-21', monto: '2000' }] }).minimo.saldo === C(1000));
    ok('escenario: la base histórica se suma solo si se pide', E.escenario(bs, { historico: 'promedio' }).eventos.some((e) => e.tipo === 'estimado') && !e0.eventos.some((e) => e.tipo === 'estimado'));
    const ki = E.indicadores(bs, e0, 10);
    ok('indicadores: cartera, vencida al día de evaluación, obligaciones', ki.cartera === C(3000) && ki.cartera_vencida === C(3000) && E.indicadores(bs, e0, 2).cartera_vencida === 0 && ki.obligaciones === C(6000));
    const sm = await req('POST', '/simulador', { cookie: conA.cookie, body: { horizonte: 60, mover: [{ cxp_id: 999999999, fecha: hoyMx() }], puntuales: [{ fecha: '2099-01-01', monto: 5, tipo: 'entrada' }] } });
    ok('API: el contador puede simular (no guarda nada) y responde las 8 cifras', sm.status === 200 && sm.json.modificado.indicadores && 'falta_para_reserva' in sm.json.modificado.indicadores && sm.json.inicial.serie.length === 61, JSON.stringify(sm.json).slice(0, 200));
    ok('API: un pago ajeno o una fecha fuera del horizonte no cambian nada', sm.json.modificado.indicadores.final === sm.json.inicial.indicadores.final);
    const pagoA = (await q("SELECT id FROM fz_cxp WHERE tenant_id=:t AND estado<>'pagada' AND estado<>'cancelada' LIMIT 1", { t: A }))[0];
    const smB = await req('POST', '/simulador', { cookie: dirB.cookie, body: { horizonte: 30, mover: pagoA ? [{ cxp_id: pagoA.id, fecha: hoyMx() }] : [] } });
    ok('API: B no ve los pagos de A en su simulador', smB.status === 200 && smB.json.pagos.length === 0 && smB.json.modificado.indicadores.obligaciones === 0);
    const antesSim = await cuenta('fz_movimientos', A);
    await req('POST', '/simulador', { cookie: dirA.cookie, body: { puntuales: [{ fecha: hoyMx(), monto: 1000, tipo: 'salida' }], venta: { precio: 100 } } });
    ok('simular no escribe nada en la base', await cuenta('fz_movimientos', A) === antesSim);
    console.log('\nSalud financiera');
    const hBueno = { '2026-07': new Array(32).fill(C(100)), '2026-08': new Array(32).fill(C(50)) };
    const hMalo = { '2026-07': new Array(32).fill(C(-1000)), '2026-08': new Array(32).fill(C(-1000)) };
    const mcB = E.monteCarlo({ hoy: '2026-11-15', efectivo: C(10000), historia: hBueno, horizonte: 90, caminos: 500, reserva: null });
    const mcM = E.monteCarlo({ hoy: '2026-11-15', efectivo: C(10000), historia: hMalo, horizonte: 90, caminos: 500, reserva: C(5000) });
    ok('Monte Carlo: si siempre entra más, nunca queda en negativo', mcB.prob_negativo === 0 && mcB.minimo.p5 >= C(10000) && mcB.prob_bajo_reserva === null);
    ok('Monte Carlo: si sale $1,000 diario con $10,000, queda negativo antes del día 30 siempre', mcM.prob_negativo_en[30] === 1 && mcM.prob_bajo_reserva === 1 && mcM.final.p50 < 0);
    const mcX = E.monteCarlo({ hoy: '2026-11-15', efectivo: C(10000), historia: { '2026-07': Array.from({ length: 32 }, (_, i) => C(i % 2 ? 900 : -1000)) }, horizonte: 60, caminos: 300, semilla: 7 });
    ok('Monte Carlo: misma semilla, mismo resultado (no cambia al recargar)', JSON.stringify(mcX) === JSON.stringify(E.monteCarlo({ hoy: '2026-11-15', efectivo: C(10000), historia: { '2026-07': Array.from({ length: 32 }, (_, i) => C(i % 2 ? 900 : -1000)) }, horizonte: 60, caminos: 300, semilla: 7 })));
    ok('Monte Carlo: bandas ordenadas p5 ≤ p25 ≤ p50 ≤ p75 ≤ p95', mcX.bandas.every((b) => b.p5 <= b.p25 && b.p25 <= b.p50 && b.p50 <= b.p75 && b.p75 <= b.p95) && mcX.bandas.length === 60);
    ok('Monte Carlo: los documentos reales se suman a todos los caminos', E.monteCarlo({ hoy: '2026-11-15', efectivo: C(0), historia: { '2026-07': new Array(32).fill(0) }, eventos: [{ fecha: '2026-11-20', monto: C(-500) }], horizonte: 10, caminos: 100 }).final.p95 === C(-500));
    ok('Monte Carlo: sin historia no inventa nada', E.monteCarlo({ hoy: '2026-11-15', efectivo: C(1), historia: {}, horizonte: 30 }) === null);
    const cIg = E.concentracion([{ nombre: 'a', monto: 100 }, { nombre: 'b', monto: 100 }, { nombre: 'c', monto: 100 }, { nombre: 'd', monto: 100 }]);
    const cUno = E.concentracion([{ nombre: 'a', monto: 1 }, { nombre: 'b', monto: 1 }, { nombre: 'c', monto: 1 }, { nombre: 'd', monto: 997 }]);
    ok('Gini: clientes iguales = 0, HHI 2,500', Math.abs(cIg.gini) < 1e-9 && cIg.hhi === 2500 && cIg.top5 === 1);
    ok('Gini: uno concentra casi todo ≈ (n-1)/n', Math.abs(cUno.gini - 0.7455) < 0.01 && cUno.mayores[0].nombre === 'd');
    ok('Gini: con un solo cliente no se calcula', E.concentracion([{ nombre: 'a', monto: 5 }]) === null);
    const cal0 = E.calificacion({ dias_efectivo: 30, prob_negativo_60: 0, margen_flujo: 0.05, vencido_pct: 0, top5: 0.3 });
    const cal1 = E.calificacion({ dias_efectivo: 0, prob_negativo_60: 0.5, margen_flujo: -0.1, vencido_pct: 0.5, top5: 0.8 });
    ok('calificación: todo bien = 100 sana, todo mal = 0 riesgo', cal0.puntos === 100 && cal0.nivel === 'sana' && cal1.puntos === 0 && cal1.nivel === 'riesgo');
    const calSin = E.calificacion({ dias_efectivo: 30, prob_negativo_60: 0, margen_flujo: null, vencido_pct: null, top5: null });
    ok('calificación: lo que no tiene dato no se califica (no cuenta como 0)', calSin.puntos === 100 && calSin.peso_calificado === 50 && calSin.partes.filter((x) => !x.calificada).length === 3);
    ok('calificación: sin ningún dato no hay número', E.calificacion({}).puntos === null);
    const sa = await req('GET', '/salud', { cookie: conA.cookie });
    ok('API: /salud responde al contador con calificación y partes', sa.status === 200 && Array.isArray(sa.json.calificacion.partes) && 'monte_carlo' in sa.json, JSON.stringify(sa.json).slice(0, 200));
    const saB = await req('GET', '/salud', { cookie: dirB.cookie });
    ok('API: /salud de B no trae clientes ni dinero de A', saB.status === 200 && (!saB.json.concentracion || !saB.json.concentracion.mayores.some((m) => /SIT/.test(m.nombre || ''))) && saB.json.efectivo !== sa.json.efectivo || saB.json.efectivo === 0);
    ok('API: /salud sin sesión = 401', (await req('GET', '/salud', {})).status === 401);
    const srcIdx = strip(fs.readFileSync(path.join(__dirname, 'src', 'index.js'), 'utf8'));
    ok('el patrón excluye los traspasos entre cuentas propias', /categoria <> 'traspaso'/.test(srcIdx));

    console.log('\nImportar archivos: un solo lugar; el puente automático se quitó (dueño 2026-11-23)');
    ok('las rutas del puente ya no existen', [401, 403, 404].includes((await req('POST', '/ingest/sicar', { header: false, headers: { Authorization: 'Bearer fzk_' + 'x'.repeat(32) } })).status) && (await req('POST', '/ingest/sicar', { cookie: dirA.cookie })).status === 404
      && (await req('GET', '/llaves', { cookie: dirA.cookie })).status === 404 && (await req('POST', '/sicar/instalador', { cookie: dirA.cookie, body: {} })).status === 404
      && (await req('GET', '/sicar/puente.ps1', { cookie: dirA.cookie })).status === 404);
    {
      const ap = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
      const menu = ap.slice(ap.indexOf('const VIEWS = ['), ap.indexOf('];', ap.indexOf('const VIEWS = [')));
      ok('menú: un solo lugar para importar ("Importar archivos") y sin puente ni "Importar de SICAR"', /\['cargar', 'Importar archivos'\]/.test(menu) && !/Importar de SICAR|guia-puente|'sicar',/.test(menu));
      ok('menú: categorías plegadas por omisión, NO se recuerdan entre visitas, acordeón (abrir una cierra las demás) y la de la pantalla abierta se ve', /button type="button" class="grp"/.test(ap) && /aria-expanded/.test(ap) && /function grpAbiertos\(\) \{ return \[\]; \}/.test(ap) && !/localStorage\.setItem\('fz_grp_abiertos'/.test(ap) && /if \(abrir\) document\.querySelectorAll\('nav\.side button\.grp\[aria-expanded="true"\]'\)/.test(ap) && /box\.hidden\) abrirGrupo\(box\.dataset\.g, true\)/.test(ap));
      ok('ninguna otra pantalla importa: no queda importModal; Por cobrar, Por pagar y Bancos ya no tienen botón de importar (dueño 2026-11-23)', !/importModal|movimientos\/importar|\/importar'|Importar estado de cuenta<\/a>/.test(ap) && !/<\/button>\s*<a class="btn" href="#cargar">Importar archivos<\/a><\/div>/.test(ap));
      ok('sin rastros del puente en la app ni en el servidor', !/puente|llaves/.test(ap) && !/puenteScript|\/ingest\/sicar|'\/llaves'/.test(fs.readFileSync(path.join(__dirname, 'src', 'index.js'), 'utf8')) && !fs.existsSync(path.join(__dirname, 'public', 'guia-puente.html')));
      const gc = fs.readFileSync(path.join(__dirname, 'public', 'guia-carga.html'), 'utf8');
      ok('guía para importar: menciona "Importar archivos", no el puente, y todas sus imágenes existen', /Importar archivos/.test(gc) && !/puente/i.test(gc) && [...gc.matchAll(/src="(guia-carga\/[^"]+)"/g)].every((m) => fs.existsSync(path.join(__dirname, 'public', m[1]))));
    }
    {
      const H = require('./src/hallazgos');
      const hs = H.hallazgos({ hoy: '2026-11-18', efectivo: 3000000, dias_efectivo: 5, salida_diaria: 600000, prob60: 0.42, prob90: 0.5, minimo_p50: -5000,
        cartera: { total: 1000000, vencido: 400000, fuente: 'sicar' }, top_vencidos: [{ parte: 'CLIENTE A', saldo: 300000 }], meses: [{ mes: '2026-07', neto: -100 }, { mes: '2026-08', neto: 200 }],
        datos_hasta: '2026-10-30', cuentas_sin_datos: ['Banorte'], por_pagar: 0, hay_cxp_sicar: false, reserva: null, sin_categoria_pct: 0.7 });
      const cods = hs.map((h) => h.codigo);
      ok('hallazgos: cada uno trae diagnóstico, prescripción y evidencia', hs.length >= 8 && hs.every((h) => h.diagnostico && h.prescripcion && h.evidencia));
      ok('hallazgos: los críticos van primero', hs[0].severidad === 'critico' && hs.findIndex((h) => h.severidad !== 'critico') > 0 && hs.slice(hs.findIndex((h) => h.severidad === 'oportunidad')).every((h) => h.severidad === 'oportunidad'));
      ok('hallazgos: nombra al cliente vencido y la cuenta sin datos', cods.includes('FZ-VENCIDO') && /CLIENTE A/.test(hs.find((h) => h.codigo === 'FZ-VENCIDO').prescripcion) && cods.includes('FZ-CUENTA-SIN-DATOS'));
      ok('hallazgos: sin datos no se inventa ninguno de dinero', !H.hallazgos({}).some((h) => /LIQUIDEZ|NEGATIVO|VENCIDO|FLUJO|CONCENTRACION/.test(h.codigo)));
      ok('hallazgos: sin modelo (archivo puro, sin red ni base de datos)', !/require\(['"](\.\.\/|\.\/)?(db|llm|dalia)|anthropic|fetch\(/.test(require('fs').readFileSync(require('path').join(__dirname, 'src', 'hallazgos.js'), 'utf8')));
      const sal = await req('GET', '/salud', { cookie: dirA.cookie });
      ok('GET /salud trae hallazgos', sal.status === 200 && Array.isArray(sal.json.hallazgos));
      const appjs = require('fs').readFileSync(require('path').join(__dirname, 'public', 'app.js'), 'utf8');
      const ti = appjs.indexOf("Lo que te deben y lo que debes"), tn = appjs.indexOf('${hallazgosHtml('), tp = appjs.indexOf('<h2>Próximos 14 días');
      ok('tablero: Neural Findings va entre "Lo que te deben" y "Próximos 14 días"', ti > 0 && tn > ti && tp > tn);
      ok('menú: "Ingresa a SICAR" quitado; la guía para importar está junto a "Importar archivos"', !/\['sicar_web', 'Ingresa a SICAR'\]/.test(appjs) && appjs.indexOf("'url:guia-carga.html'") > appjs.indexOf("['cargar',") && appjs.indexOf("'url:guia-carga.html'") < appjs.indexOf("['grp', 'Operación']") && !/Compatible con SICAR|\['grp', 'SICAR'\]/.test(appjs));
      { const keys = ['calif', 'liquidez', 'riesgo', 'flujo', 'cartera', 'concentracion', 'efectivo', 'dias', 'p90', 'minimo', 'montecarlo', 'meses', 'categorias', 'calor', 'conc', 'deben', 'dso', 'dpo', 'hallazgos', 'proximos'];
        ok('tablero: cada indicador tiene su nota explicativa y hay botón de imprimir', keys.every((k) => new RegExp('\\b' + k + ": \\['").test(appjs) && (appjs.includes("tip('" + k + "')") || (['liquidez', 'riesgo', 'flujo', 'cartera', 'concentracion'].includes(k) && appjs.includes('tip(p.clave)')))) && /id="imprimir"/.test(appjs) && /print\(\)/.test(appjs));
        ok('tablero: la parte de la calificación ya no muestra la regla', !/esc\(p\.regla\)/.test(appjs)); }
      ok('panel izquierdo plegable: se recuerda y se pliega solo en SICAR', /fz_side/.test(appjs) && /side-off/.test(appjs) && /v === 'sicar_web' && antes !== 'sicar_web'\) setSide\(true\)/.test(appjs));
    }
    router._pdfRows = null;
    if (deferReal) {
      const real = fs.readFileSync(process.env.FORZZA_SICAR_MUESTRA);
      const rr = await req('POST', '/sicar/importar', { cookie: capA.cookie, raw: multipart({ aplicar: '0' }, { name: 'muestra.pdf', type: 'application/pdf', data: real }) });
      ok('PDF REAL de SICAR (solo local): se lee completo y cuadra con su total, sin guardar', rr.status === 200 && rr.json.cuadra === true && rr.json.n_errores === 0 && rr.json.aplicado === false, JSON.stringify(rr.json && { t: rr.json.tipo, c: rr.json.cuadra, e: rr.json.n_errores }));
    }

    console.log('\nDalia (asistente financiera)');
    {
      const DL = require('./src/dalia');
      const src = fs.readFileSync(path.join(__dirname, 'src', 'dalia.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      ok('dalia.js no escribe nada (sin INSERT/UPDATE/DELETE)', !/\b(INSERT|UPDATE|DELETE)\b/i.test(src));
      ok('ninguna herramienta acepta empresa ni usuario como argumento', DL.TOOLS.every((t) => !/tenant|empresa_id|user/i.test(JSON.stringify(t.input_schema))));
      const otros = fs.readdirSync(path.join(__dirname, 'src')).filter((f) => f.endsWith('.js') && f !== 'dalia.js' && fs.readFileSync(path.join(__dirname, 'src', f), 'utf8').includes('@anthropic-ai/sdk'));
      ok('dalia.js es el único archivo que llega a un modelo', otros.length === 0, otros.join(','));
      const perm = DL._permitidos([{ total: '$1,234,567.89', p: 0.32 }]);
      ok('verificador: una cifra inventada se detecta', DL._sinFuente('Tienes $999,999 en caja.', perm).length === 1);
      ok('verificador: la cifra de la herramienta, redondeada o en millones, pasa', DL._sinFuente('Hay $1,234,568, unos 1.2 millones, con 32% de riesgo, desde 2026.', perm).length === 0);
      ok('verificador: un porcentaje inventado se detecta', DL._sinFuente('La probabilidad es 45%.', perm).length === 1);

      ok('sin sesión no responde', (await req('POST', '/dalia/chat', { body: { messages: [{ role: 'user', content: 'hola' }] } })).status === 401);
      const keyBak = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
      const hk = await req('POST', '/dalia/chat', { cookie: conA.cookie, body: { messages: [{ role: 'assistant', content: 'Hola' }, { role: 'user', content: '¿Cuánto efectivo hay?' }] } });
      ok('sin modelo: el contador recibe un resumen marcado como heurístico', hk.status === 200 && hk.json.composed_by === 'heuristic' && /efectivo/.test(hk.json.reply), JSON.stringify(hk.json).slice(0, 160));
      if (keyBak) process.env.ANTHROPIC_API_KEY = keyBak;

      // Un movimiento que solo existe en la empresa B.
      const [[cb]] = await db.query("INSERT INTO fz_cuentas (tenant_id,nombre,banco,incluir) VALUES (:t,'SIT B','BBVA',TRUE) RETURNING id", { replacements: { t: B } });
      const secreto = 'SITDALIAB' + STAMP;
      await db.query("INSERT INTO fz_movimientos (tenant_id,cuenta_id,fecha,concepto,monto,categoria) VALUES (:t,:c,:f,:k,777777.77,'cliente')", { replacements: { t: B, c: cb.id, f: hoyMx(), k: secreto } });
      let vistas = [];
      const fake = (respuestas) => ({ messages: { create: async (p) => {
        const last = p.messages[p.messages.length - 1];
        if (Array.isArray(last.content) && last.content[0] && last.content[0].type === 'tool_result') vistas.push(JSON.parse(last.content[0].content));
        return respuestas.shift()(p);
      } } });
      const usar = (name, input) => () => ({ content: [{ type: 'tool_use', id: 'tu' + Math.random(), name, input }] });
      const decir = (t) => () => ({ content: [{ type: 'text', text: t }] });
      DL._setClient(fake([usar('buscar_movimientos', { texto: secreto, tenant_id: B, empresa: B }), (p) => ({ content: [{ type: 'text', text: 'Encontré ' + vistas[0].movimientos_encontrados + ' movimientos.' }] })]));
      const iso = await req('POST', '/dalia/chat', { cookie: dirA.cookie, body: { messages: [{ role: 'user', content: 'busca ' + secreto }] } });
      ok('aislamiento: un tenant_id en los argumentos no trae datos de otra empresa', iso.status === 200 && vistas[0] && vistas[0].movimientos_encontrados === 0 && !JSON.stringify(vistas[0]).includes('777,777'), JSON.stringify(vistas[0]).slice(0, 160));
      vistas = [];
      DL._setClient(fake([usar('estado_hoy', {}), (p) => ({ content: [{ type: 'text', text: 'Hoy tienes ' + vistas[0].efectivo_total_hoy + ' en el banco.' }] })]));
      const ok1 = await req('POST', '/dalia/chat', { cookie: dirA.cookie, body: { messages: [{ role: 'user', content: '¿Cuánto efectivo tengo?' }] } });
      ok('una cifra que sale de la herramienta llega tal cual', ok1.json.composed_by === 'model' && ok1.json.reply.includes(vistas[0].efectivo_total_hoy), JSON.stringify(ok1.json).slice(0, 160));
      DL._setClient(fake([usar('estado_hoy', {}), decir('Tienes $98,765,432.10 en caja.'), decir('Son $98,765,432.10, seguro.')]));
      const inv = await req('POST', '/dalia/chat', { cookie: dirA.cookie, body: { messages: [{ role: 'user', content: '¿Cuánto tengo?' }] } });
      ok('una cifra inventada dos veces se descarta y no llega al usuario', inv.json.composed_by === 'discarded' && !inv.json.reply.includes('98,765'), JSON.stringify(inv.json).slice(0, 160));
      DL._setClient(null);
      const D = router._daliaDeps();
      ok('bitácora: el contador no la puede consultar con Dalia', !!(await DL._ejecutar('actividad', {}, { tenant: A, rol: 'contador', D })).error);
      ok('calculadora: rechaza un número que no salió de una herramienta', /no salieron/.test((await DL._ejecutar('calcular', { expresion: '999999 * 2' }, { tenant: A, D, permitidos: () => [1234] })).error || ''));
      ok('calculadora: solo aritmética, nada de código', /Solo números/.test((await DL._ejecutar('calcular', { expresion: 'process.exit(1)' }, { tenant: A, D, permitidos: () => [] })).error || ''));
      const antes = (await q('SELECT COUNT(*)::int n FROM fz_movimientos WHERE tenant_id=:t', { t: A }))[0].n;
      const esc = await DL._ejecutar('escenario', { historico: 'promedio', movimientos_supuestos: [{ fecha: E.addDays(hoyMx(), 5), monto: -1000 }] }, { tenant: A, D });
      ok('escenario: responde y no guarda nada', !!esc.punto_mas_bajo && (await q('SELECT COUNT(*)::int n FROM fz_movimientos WHERE tenant_id=:t', { t: A }))[0].n === antes);
      const sf = await DL._ejecutar('saldo_en_fecha', { fecha: hoyMx() }, { tenant: A, D });
      ok('saldo en fecha: solo cuentas de su empresa', sf.cuentas.every((c) => c.cuenta !== 'SIT B'));
      for (const t of ['documentos', 'historial_cobros_pagos', 'catalogo', 'configuracion_y_equipo', 'cobertura_de_datos', 'buscar_sicar', 'saldos_sicar']) {
        const r = await DL._ejecutar(t, { lado: 'cobrar', tipo: 'clientes' }, { tenant: B, rol: 'director', D });
        ok('herramienta ' + t + ' responde sin error', r && !r.error && !JSON.stringify(r).includes('Cobranza A'), JSON.stringify(r).slice(0, 120));
      }
      const act = await q("SELECT detail FROM fz_activity WHERE tenant_id=:t AND action='dalia' ORDER BY id DESC LIMIT 1", { t: A });
      ok('la bitácora guarda qué herramientas usó, nunca la pregunta', act[0] && !/Cuánto/.test(act[0].detail || ''));
    }

    console.log('\nPago de facturas (Stripe)');
    {
      const keyBak = process.env.STRIPE_SECRET_KEY; process.env.STRIPE_SECRET_KEY = 'sk_test_sit';
      const vistos = [];
      router._stripe = { checkout: { sessions: { create: async (p) => { vistos.push(p); return { url: 'https://checkout.stripe.test/s' }; } } } };
      const raw = (p) => new Promise((ok) => http.get(base + '/forzza/app' + p, (r) => { r.resume(); ok({ status: r.statusCode, loc: r.headers.location }); }));
      const on = await raw('/pagar/onboarding'), me = await raw('/pagar/mensualidad?cents=1');
      ok('onboarding: pago único de $700 sin sesión del cliente', on.status === 303 && vistos[0].mode === 'payment' && vistos[0].line_items[0].price_data.unit_amount === 70000);
      ok('mensualidad: suscripción de $397 al mes; el monto no viene de la petición', me.status === 303 && vistos[1].mode === 'subscription' && vistos[1].line_items[0].price_data.unit_amount === 39700 && vistos[1].line_items[0].price_data.recurring.interval === 'month');
      ok('un concepto que no existe es 404', (await raw('/pagar/otro')).status === 404);
      router._stripe = null; if (keyBak) process.env.STRIPE_SECRET_KEY = keyBak; else delete process.env.STRIPE_SECRET_KEY;
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
      for (const tb of ['fz_rep_compras', 'fz_reportes', 'fz_rep_archivos', 'fz_sicar_saldos', 'fz_sicar_docs', 'fz_sicar_imports', 'fz_api_keys', 'fz_cxc_abonos', 'fz_cxp_pagos', 'fz_movimientos', 'fz_cxc', 'fz_cxp', 'fz_fijos', 'fz_clientes', 'fz_proveedores', 'fz_cuentas', 'fz_config', 'fz_activity', 'fz_users']) {
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
