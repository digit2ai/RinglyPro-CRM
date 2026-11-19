'use strict';
/**
 * NeoHaul — empresa de DEMOSTRACIÓN con 10 semanas de operación ficticia.
 *
 * Crea un tenant aparte (slug 'neohaul-demo'), así que la empresa real (Grupo NeoHaul) no se toca.
 * Todos los nombres, placas, teléfonos, folios y montos son inventados; cada fila sale marcada
 * como demostración (nombre del tenant, proveedores "(demo)", notas). Las cuentas usan money.js,
 * así que los importes, IVA y retenciones se calculan igual que en la operación real.
 *
 * Uso:  node verticals/neohaul/scripts/seed-demo.js [--reset] [--password=XXXX]
 *   --reset      borra el tenant de demostración y lo vuelve a sembrar (las fechas siguen a hoy).
 *   --password   contraseña de la cuenta demo (si no, se genera una y se imprime UNA vez).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const M = require('../src/money');

const SLUG = 'neohaul-demo';
const NAME = 'NeoHaul · Demostración';
const DEMO_EMAIL = 'demo.neohaul@digit2ai.com';
const SEMANAS = 10;
const TABLAS = ['nh_activity', 'nh_diesel_cargas', 'nh_gasto_reparto', 'nh_gastos', 'nh_nomina', 'nh_taller', 'nh_facturas',
  'nh_viajes', 'nh_estimaciones', 'nh_asignaciones', 'nh_pedidos', 'nh_files', 'nh_tarifas', 'nh_obras', 'nh_clients',
  'nh_drivers', 'nh_trucks', 'nh_users'];

const q = (sql, r) => db.query(sql, { replacements: r || {}, logging: false });
const one = async (sql, r) => (await q(sql, r))[0][0];
let seed = 20261119;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const hoy = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const r2 = (n) => Math.round(n * 100) / 100;

async function bulk(table, cols, rows) {
  if (!rows.length) return;
  const def = Object.entries(cols).map(([k, t]) => `${k} ${t}`).join(',');
  const names = Object.keys(cols).join(',');
  for (let i = 0; i < rows.length; i += 400) {
    await q(`INSERT INTO ${table} (${names}) SELECT ${names} FROM json_to_recordset(:j) AS x(${def})`, { j: JSON.stringify(rows.slice(i, i + 400)) });
  }
}

(async () => {
  const reset = process.argv.includes('--reset');
  const pwArg = (process.argv.find((a) => a.startsWith('--password=')) || '').slice(11);
  let ten = await one('SELECT id FROM nh_tenants WHERE slug=:s', { s: SLUG });
  if (ten && !reset) { console.log('Ya existe la empresa de demostración (id ' + ten.id + '). Usa --reset para volver a sembrarla.'); process.exit(0); }
  if (ten) { for (const t of TABLAS) await q(`DELETE FROM ${t} WHERE tenant_id=:t`, { t: ten.id }); await q('DELETE FROM nh_tenants WHERE id=:t', { t: ten.id }); }
  ten = await one('INSERT INTO nh_tenants (name,slug) VALUES (:n,:s) RETURNING id', { n: NAME, s: SLUG });
  const T = ten.id;

  // Cuenta demo (director) — la contraseña se imprime una sola vez.
  const pw = pwArg || crypto.randomBytes(9).toString('base64url');
  const prev = await one('SELECT id,tenant_id FROM nh_users WHERE LOWER(email)=:e', { e: DEMO_EMAIL });
  if (prev && prev.tenant_id !== T) await q('DELETE FROM nh_users WHERE id=:id', { id: prev.id });
  const [[usr]] = await q("INSERT INTO nh_users (tenant_id,email,name,role,password_hash,must_change) VALUES (:t,:e,'Director (demo)','director',:h,FALSE) RETURNING id",
    { t: T, e: DEMO_EMAIL, h: bcrypt.hashSync(pw, 12) });
  await q("INSERT INTO nh_users (tenant_id,email,name,role,password_hash,must_change,active) VALUES (:t,'capturista.demo@neohaul.invalid','Capturista (demo)','capturista',NULL,FALSE,TRUE),(:t,'contador.demo@neohaul.invalid','Contador (demo)','contador',NULL,FALSE,TRUE)", { t: T });

  // Catálogos
  const [[cli]] = await q("INSERT INTO nh_clients (tenant_id,nombre,rfc) VALUES (:t,'HTR Infraestructura (demo)','DEMO010101AAA') RETURNING id", { t: T });
  const obras = {};
  for (const [clave, nombre, ing, tel] of [
    ['E18', 'Bacheo E18', 'Ing. Laura Treviño (demo)', '+528100000101'], ['N18', 'SICT N18', 'Ing. Ricardo Salinas (demo)', '+528100000102'],
    ['N16', 'SICT N16', 'Ing. Mónica Garza (demo)', '+528100000103'], ['INT', 'Viajes internos de plantas', 'Ing. Jorge Cantú (demo)', '+528100000104'],
    ['REA4', 'REA4', 'Ing. Patricia Leal (demo)', '+528100000105'],
    // Obra vacía para el simulacro: sin viajes, para importar el Excel de prueba. El WhatsApp es el del dueño.
    ['SIM', 'Simulacro · Libramiento Santiago', 'Ing. Simulacro (tu número)', '+18136414177']]) {
    obras[clave] = (await one('INSERT INTO nh_obras (tenant_id,client_id,nombre,clave,ingeniero,ingeniero_tel) VALUES (:t,:c,:n,:k,:i,:tel) RETURNING id', { t: T, c: cli.id, n: nombre, k: clave, i: ing, tel })).id;
  }
  const tar = {};
  for (const [k, nombre, material, origen, destino, unidad, precio] of [
    ['carpSan', 'Carpeta asfáltica · Planta Santiago → Monterrey', 'Carpeta asfáltica', 'Planta Santiago', 'Monterrey', 'tonelada', 170],
    ['carpCad', 'Carpeta asfáltica · Planta Cadereyta → Monterrey', 'Carpeta asfáltica', 'Planta Cadereyta', 'Monterrey', 'tonelada', 185],
    ['renta', 'Renta diaria · Planta Cadereyta → bacheo Santiago', 'Renta', 'Planta Cadereyta', 'Bacheo Santiago', 'dia', 6500],
    ['recup', 'Recuperado (reciclado)', 'Recuperado', 'Obra', 'Planta', 'tonelada', 150],
    ['interno', 'Viajes internos en planta', 'Tierra', 'Planta', 'Planta', 'tonelada', 22],
    ['bacheo', 'Planta Santiago → bacheo Santiago', 'Carpeta asfáltica', 'Planta Santiago', 'Bacheo Santiago', 'viaje', 4400],
    ['escombro', 'Escombro (20 t por viaje)', 'Escombro', 'Obra', 'Tiro autorizado', 'viaje', 4500]]) {
    tar[k] = { id: (await one('INSERT INTO nh_tarifas (tenant_id,nombre,material,origen,destino,unidad,precio) VALUES (:t,:n,:m,:o,:d,:u,:p) RETURNING id', { t: T, n: nombre, m: material, o: origen, d: destino, u: unidad, p: precio })).id, unidad, precio };
  }
  const nombres = ['Juan Pérez (demo)', 'Luis Hernández (demo)', 'Carlos Rodríguez (demo)', 'Miguel Ángel Torres (demo)', 'José Martínez (demo)', 'Raúl Garza (demo)'];
  const choferes = [];
  for (let i = 0; i < 6; i++) choferes.push((await one("INSERT INTO nh_drivers (tenant_id,nombre,telefono,empresa,puesto,salario_semanal) VALUES (:t,:n,:tel,'NeoHaul','chofer',:s) RETURNING id",
    { t: T, n: nombres[i], tel: '+52810000020' + i, s: [3800, 3800, 3600, 3800, 3600, 3500][i] })).id);
  const mecanico = (await one("INSERT INTO nh_drivers (tenant_id,nombre,telefono,empresa,puesto,salario_semanal) VALUES (:t,'Ernesto Villarreal (demo)','+528100000210','NeoHaul','mecanico',4200) RETURNING id", { t: T })).id;
  const trucks = [];
  for (let i = 0; i < 6; i++) {
    const pl = `DM-0${i + 1}-00-A`;
    trucks.push({ id: (await one("INSERT INTO nh_trucks (tenant_id,empresa,unidad,tipo,capacidad_m3,placas,chofer_id,propio) VALUES (:t,'NeoHaul',:u,'Torton',14,:p,:c,TRUE) RETURNING id", { t: T, u: `${pl} (0${i + 1})`, p: pl, c: choferes[i] })).id, propio: true, chofer: choferes[i], idx: i });
  }
  for (const [emp, n, tipo, cap] of [['TTS', 4, 'Torton', 14], ['TTS', 2, 'Tolva', 30], ['SEMAQSA', 2, 'Torton', 14]]) {
    for (let i = 0; i < n; i++) trucks.push({ id: (await one('INSERT INTO nh_trucks (tenant_id,empresa,unidad,tipo,capacidad_m3,placas,propio) VALUES (:t,:e,:u,:ti,:c,:p,FALSE) RETURNING id',
      { t: T, e: emp, u: `${emp} ${tipo} ${trucks.length + 1} (demo)`, ti: tipo, c: cap, p: `DX-${String(trucks.length + 1).padStart(2, '0')}-00-B` })).id, propio: false, empresa: emp });
  }
  const propios = trucks.filter((k) => k.propio), externos = trucks.filter((k) => !k.propio);

  // Fechas: 10 semanas, lunes a sábado, hasta hoy.
  const lunesHoy = M.lunes(hoy), ini = M.sumarDias(lunesHoy, -7 * (SEMANAS - 1));
  const dias = []; for (let d = ini; d <= hoy; d = M.sumarDias(d, 1)) { if (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) dias.push(d); }

  // Riesgo realista: dos semanas de lluvia (casi no se trabaja) y una reparación mayor.
  const semanaDe = (f) => Math.round((new Date(M.lunes(f)) - new Date(ini)) / (7 * 864e5)); // 0..9
  const LLUVIA = [2, 7], REPARACION = 5;
  // Viajes y pedidos
  const viajes = [], pedidos = [];
  let ticket = 41000, vale = 87000;
  const trabajo = { E18: ['bacheo', 'escombro'], N18: ['carpSan'], N16: ['carpCad'], REA4: ['recup'] };
  const cantidad = (k) => (tar[k].unidad === 'tonelada' ? r2(entre(1700, 2250) / 100) : 1);
  for (const f of dias) {
    const recientes = M.sumarDias(hoy, -2);
    const estado = f >= recientes ? 'capturado' : 'confirmado';
    const usados = {}, llueve = LLUVIA.includes(semanaDe(f));
    for (const k of propios) {
      if (rnd() < (llueve ? 0.4 : 0.06)) continue; // día sin trabajo (lluvia, taller, descanso)
      const obra = k.idx < 2 ? 'E18' : k.idx < 4 ? 'N18' : k.idx === 4 ? (rnd() < 0.6 ? 'N16' : 'REA4') : (rnd() < 0.5 ? 'N18' : 'N16');
      const nv = entre(2, 4);
      for (let j = 0; j < nv; j++) { const t = pick(trabajo[obra]); viajes.push({ fecha: f, obra, t, truck: k.id, driver: k.chofer, cant: cantidad(t), estado }); }
      (usados[obra] = usados[obra] || []).push(k.id);
    }
    for (const k of externos) {
      if (rnd() < (llueve ? 0.85 : 0.35)) continue;
      const obra = pick(['N18', 'N16', 'E18']); const t = pick(trabajo[obra]);
      for (let j = 0; j < entre(1, 3); j++) viajes.push({ fecha: f, obra, t, truck: k.id, driver: null, cant: cantidad(t), estado });
      (usados[obra] = usados[obra] || []).push(k.id);
    }
    viajes.push({ fecha: f, obra: 'INT', t: 'interno', truck: propios[5].id, driver: propios[5].chofer, cant: r2(entre(19500, 23500) / 100), estado });
    if (new Date(f + 'T00:00:00Z').getUTCDay() === 3) viajes.push({ fecha: f, obra: 'E18', t: 'renta', truck: propios[0].id, driver: propios[0].chofer, cant: 1, estado });
    for (const [obra, ks] of Object.entries(usados)) pedidos.push({ fecha: f, obra, trucks: [...new Set(ks)] });
  }
  for (const v of viajes) { v.precio = tar[v.t].precio; v.importe = M.importe(v.cant, v.precio); v.ticket = 'B-' + (ticket++); v.vale = String(vale++); }

  // Estimaciones semanales por obra: viejas facturadas, -2 aprobada, -1 enviada, semana actual sin estimar.
  const grupos = {};
  for (const v of viajes) { if (v.estado !== 'confirmado') continue; const w = semanaDe(v.fecha); if (w >= SEMANAS - 1) continue; (grupos[w + '|' + v.obra] = grupos[w + '|' + v.obra] || []).push(v); }
  const facturas = [];
  for (const [key, vs] of Object.entries(grupos)) {
    const [w, obra] = key.split('|'); const wn = Number(w);
    const desde = M.sumarDias(ini, wn * 7), hasta = M.sumarDias(desde, 6);
    const subtotal = M.sum(vs.map((v) => v.importe));
    const atras = SEMANAS - 1 - wn; // 1 = semana pasada
    const estado = atras >= 3 ? 'facturada' : atras === 2 ? 'aprobada' : 'enviada';
    const envio = M.sumarDias(hasta, 1);
    const e = await one(`INSERT INTO nh_estimaciones (tenant_id,obra_id,desde,hasta,estado,subtotal,viajes,enviada_at,aprobada_at,created_by)
      VALUES (:t,:o,:d,:h,:e,:s,:n,:ea,:aa,:u) RETURNING id`, { t: T, o: obras[obra], d: desde, h: hasta, e: estado, s: subtotal, n: vs.length,
      ea: envio + 'T16:00:00Z', aa: estado === 'enviada' ? null : M.sumarDias(envio, 2) + 'T17:00:00Z', u: usr.id });
    vs.forEach((v) => { v.est = e.id; });
    if (estado !== 'enviada') facturas.push({ est: e.id, obra, subtotal, req: M.sumarDias(envio, 3), atras });
  }
  let folio = 3120;
  for (const f of facturas) {
    const tot = M.facturaTotals(f.subtotal, true);
    let estado = 'requisicion', emision = null, cobro = null, fol = null;
    if (f.atras >= 3) {
      estado = 'emitida'; emision = M.sumarDias(f.req, 2); fol = 'A-' + (folio++);
      const dCobro = entre(24, 38); const c = M.sumarDias(emision, dCobro);
      // dos facturas viejas se quedan vencidas para que se vea la antigüedad de cartera
      const vencida = f.atras >= 7 && (f.obra === 'N16' || (f.obra === 'REA4' && f.atras === 8));
      if (c <= hoy && !vencida) { estado = 'cobrada'; cobro = c; }
    }
    await q(`INSERT INTO nh_facturas (tenant_id,client_id,obra_id,estimacion_id,concepto,cantidad,unidad,precio_unitario,subtotal,iva,retencion,total,aplica_retencion,
      solicitante,departamento,folio,fecha_requisicion,fecha_emision,fecha_cobro,estado,created_by)
      VALUES (:t,:c,:o,:e,:con,1,'servicio',:s,:s,:iva,:ret,:tot,TRUE,'Ing. de obra (demo)','Construcción',:fol,:fr,:fe,:fc,:es,:u)`,
    { t: T, c: cli.id, o: obras[f.obra], e: f.est, con: `Acarreo de material, estimación semanal ${f.obra}`, s: tot.subtotal, iva: tot.iva, ret: tot.retencion, tot: tot.total,
      fol, fr: f.req, fe: emision, fc: cobro, es: estado, u: usr.id });
  }

  await bulk('nh_viajes', { tenant_id: 'int', fecha: 'date', obra_id: 'int', tarifa_id: 'int', truck_id: 'int', driver_id: 'int', ticket_no: 'text', vale_no: 'text',
    cantidad: 'numeric', unidad: 'text', precio_unitario: 'numeric', importe: 'numeric', estado: 'text', estimacion_id: 'int', created_by: 'int', confirmed_by: 'int', confirmed_at: 'timestamptz', notas: 'text' },
  viajes.map((v) => ({ tenant_id: T, fecha: v.fecha, obra_id: obras[v.obra], tarifa_id: tar[v.t].id, truck_id: v.truck, driver_id: v.driver, ticket_no: v.ticket, vale_no: v.vale,
    cantidad: v.cant, unidad: tar[v.t].unidad, precio_unitario: v.precio, importe: v.importe, estado: v.estado, estimacion_id: v.est || null, created_by: usr.id,
    confirmed_by: v.estado === 'confirmado' ? usr.id : null, confirmed_at: v.estado === 'confirmado' ? v.fecha + 'T23:00:00Z' : null, notas: 'Dato de demostración' })));

  for (const p of pedidos) {
    const ped = await one(`INSERT INTO nh_pedidos (tenant_id,fecha,obra_id,material,camiones,solicitante,estado,created_by) VALUES (:t,:f,:o,:m,:n,'Ing. de obra (demo)',:e,:u) RETURNING id`,
      { t: T, f: p.fecha, o: obras[p.obra], m: p.obra === 'INT' ? 'Tierra' : 'Carpeta asfáltica', n: p.trucks.length, e: p.fecha < hoy ? 'cerrado' : 'asignado', u: usr.id });
    await bulk('nh_asignaciones', { tenant_id: 'int', pedido_id: 'int', truck_id: 'int', driver_id: 'int', avisado_at: 'timestamptz' },
      p.trucks.map((k) => ({ tenant_id: T, pedido_id: ped.id, truck_id: k, driver_id: (propios.find((x) => x.id === k) || {}).chofer || null, avisado_at: M.sumarDias(p.fecha, -1) + 'T23:30:00Z' })));
  }
  // Un pedido abierto para mañana, para enseñar la asignación.
  await q("INSERT INTO nh_pedidos (tenant_id,fecha,obra_id,material,camiones,solicitante,notas,estado,created_by) VALUES (:t,:f,:o,'Carpeta asfáltica',4,'Ing. Ricardo Salinas (demo)','Entrar a las 6:00 a. m.','abierto',:u)",
    { t: T, f: M.sumarDias(hoy, 1), o: obras.N18, u: usr.id });

  // Gastos: diésel semanal con cargas por camión, proveedores aliados, refacciones, llantas, casetas.
  const precioL = 24.85; // antes de IVA
  for (let w = 0; w < SEMANAS; w++) {
    const lun = M.sumarDias(ini, w * 7), sab = M.sumarDias(lun, 5), atras = SEMANAS - 1 - w;
    const pagado = atras >= 2, fechaPago = pagado ? M.sumarDias(sab, entre(7, 12)) : null;
    const cargas = [];
    for (const k of propios) {
      for (let d = 0; d < 6; d++) {
        const f = M.sumarDias(lun, d); if (f > hoy) continue;
        const nv = viajes.filter((v) => v.truck === k.id && v.fecha === f).length; if (!nv) continue;
        const litros = r2(nv * entre(33, 44) + rnd());
        const imp = r2(litros * precioL), iva = r2(imp * 0.16);
        cargas.push({ folio: 'D' + (100000 + cargas.length + w * 1000), fecha: f, hora: `0${entre(5, 7)}:${String(entre(0, 59)).padStart(2, '0')}`, litros, imp, iva, total: r2(imp + iva), truck: rnd() < 0.04 ? null : k.id });
      }
    }
    if (cargas.length) {
      const total = M.sum(cargas.map((c) => c.total));
      const g = await one(`INSERT INTO nh_gastos (tenant_id,fecha,proveedor,folio,concepto,categoria,total,saldo,estado,fecha_pago,origen,empresa,cc,created_by)
        VALUES (:t,:f,'Estación de Servicio del Norte (demo)',:fo,'Diésel de la semana','diesel',:tot,:sal,:e,:fp,'cfdi','NeoHaul','Flota',:u) RETURNING id`,
      { t: T, f: sab > hoy ? hoy : sab, fo: 'CC-' + (17600 + w), tot: total, sal: pagado ? 0 : total, e: pagado ? 'pagado' : 'pendiente', fp: fechaPago, u: usr.id });
      await bulk('nh_diesel_cargas', { tenant_id: 'int', gasto_id: 'int', folio_despacho: 'text', fecha: 'date', hora: 'text', producto: 'text', litros: 'numeric', precio: 'numeric', importe: 'numeric', iva: 'numeric', total: 'numeric', truck_id: 'int' },
        cargas.map((c) => ({ tenant_id: T, gasto_id: g.id, folio_despacho: c.folio, fecha: c.fecha, hora: c.hora, producto: 'Diésel', litros: c.litros, precio: precioL, importe: c.imp, iva: c.iva, total: c.total, truck_id: c.truck })));
    }
    // Aliados: lo que TTS / SEMAQSA cobran por sus viajes (86% del importe).
    for (const emp of ['TTS', 'SEMAQSA']) {
      const ids = externos.filter((k) => k.empresa === emp).map((k) => k.id);
      const base = M.sum(viajes.filter((v) => ids.includes(v.truck) && M.lunes(v.fecha) === lun).map((v) => v.importe));
      if (!base) continue;
      const tot = M.facturaTotals(r2(base * 0.86), false).total;
      await q(`INSERT INTO nh_gastos (tenant_id,fecha,proveedor,folio,concepto,categoria,total,saldo,estado,fecha_pago,origen,empresa,cc,created_by)
        VALUES (:t,:f,:p,:fo,'Fletes de unidades aliadas','otros',:tot,:sal,:e,:fp,'manual','NeoHaul','Fletes',:u)`,
      { t: T, f: sab > hoy ? hoy : sab, p: emp === 'TTS' ? 'Transportes Aliados TTS (demo)' : 'Maquinaria SEMAQSA (demo)', fo: emp + '-' + (500 + w), tot, sal: atras >= 3 ? 0 : tot, e: atras >= 3 ? 'pagado' : 'pendiente', fp: atras >= 3 ? M.sumarDias(sab, 14) : null, u: usr.id });
    }
    const otros = [['Refaccionaria Industrial Monterrey (demo)', 'refacciones', entre(9000, 26000), 'Filtros, balatas y mangueras'],
      ['Autopistas del Noreste (demo)', 'casetas', entre(3200, 5600), 'Casetas de la semana']];
    if (w % 3 === 1) otros.push(['Llantas y Servicios Apodaca (demo)', 'llantas', entre(28000, 41000), 'Juego de llantas de tracción']);
    if (w % 4 === 2) otros.push(['Diésel y Motores del Norte (demo)', 'taller', entre(14000, 30000), 'Reparación de inyectores']);
    if (w === REPARACION) otros.push(['Diésel y Motores del Norte (demo)', 'taller', 186000, 'Reparación mayor de motor (ajuste completo)']);
    otros.push(['Sueldos de oficina y supervisión (demo)', 'nomina', 32000, 'Administración, supervisor de patio y auxiliar']);
    // Pagos fijos del mes: financiamiento de las 6 unidades (día 5) y seguro de la flota (día 15).
    for (let d = 0; d < 7; d++) {
      const f = M.sumarDias(lun, d); if (f > hoy) continue;
      if (f.slice(8) === '05') for (const k of propios) otros.push(['Financiera de Unidades del Norte (demo)', 'otros', 52000, `Mensualidad de financiamiento ${f.slice(0, 7)}`, f, k.id]);
      if (f.slice(8) === '15') otros.push(['Seguros Flota Norte (demo)', 'otros', 52000, `Seguro de la flota ${f.slice(0, 7)}`, f, null]);
    }
    for (const [prov, cat, monto, con, fechaFija, truckFijo] of otros) {
      const truck = truckFijo !== undefined ? truckFijo : (cat === 'casetas' || cat === 'nomina') ? null : pick(propios).id;
      const st = pagado ? 'pagado' : atras === 1 ? 'programado' : 'pendiente';
      await q(`INSERT INTO nh_gastos (tenant_id,fecha,proveedor,folio,concepto,categoria,total,saldo,truck_id,obra_id,prioridad,semana_pago,monto_propuesto,estado,fecha_pago,origen,empresa,cc,created_by)
        VALUES (:t,:f,:p,:fo,:c,:cat,:tot,:sal,:k,:o,:pr,:sp,:mp,:e,:fp,'manual','NeoHaul',:cc,:u)`,
      { t: T, f: fechaFija || (M.sumarDias(lun, entre(0, 4)) > hoy ? hoy : M.sumarDias(lun, entre(0, 4))), p: prov, fo: 'F-' + entre(1000, 9999), c: con, cat, tot: monto, sal: pagado ? 0 : monto, k: truck,
        o: cat === 'casetas' ? obras.N18 : null, pr: st === 'programado' ? 'alta' : null, sp: st === 'programado' ? lunesHoy : null, mp: st === 'programado' ? monto : null,
        e: st, fp: pagado ? M.sumarDias(lun, entre(10, 16)) : null, cc: cat === 'casetas' ? 'N18' : 'Flota', u: usr.id });
    }
  }

  // Nómina: semanas cerradas + la actual abierta. Comisión 8% de los viajes del chofer.
  const todos = choferes.concat([mecanico]);
  for (let w = 0; w < SEMANAS; w++) {
    const lun = M.sumarDias(ini, w * 7), cerrada = w < SEMANAS - 1;
    for (const d of todos) {
      const sal = d === mecanico ? 4200 : [3800, 3800, 3600, 3800, 3600, 3500][choferes.indexOf(d)];
      const base = d === mecanico ? 0 : M.sum(viajes.filter((v) => v.driver === d && M.lunes(v.fecha) === lun).map((v) => v.importe));
      const com = M.comision(base, 8), bonos = rnd() < 0.2 ? 500 : 0;
      const dsem = {}; ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'].forEach((k, i) => { const f = M.sumarDias(lun, i); if (f <= hoy) dsem[k] = rnd() < 0.04 ? 'falto' : 'asistio'; }); dsem.dom = 'descanso';
      await q(`INSERT INTO nh_nomina (tenant_id,driver_id,semana,dias,salario,bonos,bonos_nota,comision_pct,base_comision,comision,total,cerrada)
        VALUES (:t,:d,:s,:dias,:sal,:b,:bn,8,:base,:com,:tot,:c)`, { t: T, d, s: lun, dias: JSON.stringify(dsem), sal, b: bonos, bn: bonos ? 'Puntualidad' : null,
        base, com, tot: M.sum([sal, bonos, com]), c: cerrada });
    }
  }

  // Taller propio: servicios a la flota y a empresas hermanas (por cobrar).
  for (let w = 0; w < SEMANAS; w++) {
    const f = M.sumarDias(ini, w * 7 + 2); if (f > hoy) continue;
    const k = pick(propios);
    await q(`INSERT INTO nh_taller (tenant_id,fecha,cliente,truck_id,supervisor,mecanico,trabajos,horas,km,refacciones,mano_obra,total,cobrable,estado,created_by)
      VALUES (:t,:f,'NeoHaul',:k,'Supervisor (demo)','Ernesto Villarreal (demo)',:tr,:h,:km,:r,:mo,:tot,FALSE,'registrado',:u)`,
    { t: T, f, k: k.id, tr: pick(['Servicio de 10,000 km', 'Cambio de balatas', 'Ajuste de frenos y suspensión', 'Cambio de aceite y filtros']), h: entre(3, 8), km: entre(80000, 160000), r: entre(2500, 9000), mo: entre(1200, 3500), tot: 0, u: usr.id });
    if (w % 2 === 0) {
      const ref = entre(3000, 12000), mo = entre(2000, 5000);
      await q(`INSERT INTO nh_taller (tenant_id,fecha,cliente,unidad_externa,supervisor,mecanico,trabajos,horas,refacciones,mano_obra,total,cobrable,estado,created_by)
        VALUES (:t,:f,'HTR Infraestructura (demo)','Pipa de riego HTR-07 (demo)','Supervisor (demo)','Ernesto Villarreal (demo)','Reparación de bomba y mangueras',:h,:r,:mo,:tot,TRUE,:e,:u)`,
      { t: T, f, h: entre(4, 9), r: ref, mo, tot: ref + mo, e: w < SEMANAS - 4 ? 'cobrado' : 'por_cobrar', u: usr.id });
    }
  }
  await q("UPDATE nh_taller SET total = refacciones + mano_obra WHERE tenant_id=:t AND total=0", { t: T });

  await q("INSERT INTO nh_activity (tenant_id,user_id,user_email,action,detail) VALUES (:t,:u,:e,'demo.seed','Empresa de demostración sembrada con 10 semanas de datos ficticios')", { t: T, u: usr.id, e: DEMO_EMAIL });

  const [c] = (await q(`SELECT (SELECT COUNT(*) FROM nh_viajes WHERE tenant_id=:t)::int viajes, (SELECT COUNT(*) FROM nh_estimaciones WHERE tenant_id=:t)::int est,
    (SELECT COUNT(*) FROM nh_facturas WHERE tenant_id=:t)::int fact, (SELECT COUNT(*) FROM nh_gastos WHERE tenant_id=:t)::int gastos,
    (SELECT COUNT(*) FROM nh_diesel_cargas WHERE tenant_id=:t)::int cargas, (SELECT COUNT(*) FROM nh_nomina WHERE tenant_id=:t)::int nomina`, { t: T }))[0];
  console.log('Empresa de demostración id', T, JSON.stringify(c));
  console.log('Cuenta:', DEMO_EMAIL, (pwArg ? '(contraseña indicada)' : 'contraseña: ' + pw));
  await db.close();
})().catch(async (e) => { console.error(e); try { await db.close(); } catch (_) {} process.exit(1); });
