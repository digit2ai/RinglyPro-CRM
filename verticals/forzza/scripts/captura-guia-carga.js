'use strict';
/**
 * Toma las capturas de public/guia-carga.html con la app REAL y datos INVENTADOS
 * (empresa de prueba "guia-fz-*", creada y borrada aquí). Nunca usa archivos del cliente.
 *   node -e "require('dotenv').config();require('./verticals/forzza/scripts/captura-guia-carga.js')"
 */
process.env.FORZZA_JWT_SECRET = process.env.FORZZA_JWT_SECRET || 'guia-only-secret-' + Date.now();
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const express = require('express'), bcrypt = require('bcryptjs'), XLSX = require('xlsx');
const puppeteer = require('puppeteer');
const router = require('../src/index'), db = require('../src/db');
const OUT = path.join(__dirname, '..', 'public', 'guia-carga');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'guia-fz-'));
const R = (...c) => c.map(([x, t]) => ({ x, t }));
const hoy = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
const [Y, M] = hoy.split('-');
const dmy = (d) => `${String(d).padStart(2, '0')}/${M}/${Y}`;
const dmyHoy = `${hoy.slice(8)}/${M}/${Y}`;
const F0 = require('../test-fixtures-sicar');
// Mismos totales que el manual de SICAR, con fecha de este mes y nombres de materiales de construcción.
const NOMBRES = { 'Coca Cola Tapa Rosca 500 ml.': 'Cemento gris 50 kg', 'Fresca Lata 355 ml.': 'Varilla 3/8', 'Manzana Lift Lata 355 ml.': 'Block 15x20x40',
  'Marcador Magistral Negro': 'Cal hidratada 25 kg', 'Marcador Magistral Azul': 'Alambre recocido kg', 'Marcador Magistral Clásico': 'Clavo 2 1/2 kg', 'Mi Band3': 'Malla electrosoldada 6x6',
  'Nito Bimbo 355 ml.': 'Arena m3', 'NITO BIMBO 355 ml.': 'Arena m3', 'NITO BIMBO 355 ML': 'Arena m3', 'PAQUETE REFRESCOS': 'Paquete albañil', 'SERVICIO': 'Flete local',
  'Servicio de Entrega': 'Servicio de entrega', 'Sprite Lata 355 ml.': 'Grava m3', 'WACOM INTUOS': 'Revolvedora 1 saco', 'Público en General': 'Público en General',
  'Daniela Macias': 'FERRETERIA MUESTRA', 'MARIO CASILLAS': 'CONSTRUCTORA EJEMPLO SA DE CV', 'BEBIDAS': 'CEMENTOS', 'REFRESCOS': 'GRIS' };
const F = JSON.parse(JSON.stringify(F0), (k, v) => (typeof v === 'string' ? (NOMBRES[v] || v.replace(/21\/09\/2020/g, () => dmyHoy)) : v));
const MESC = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'][Number(M) - 1];

// "PDF" de prueba: %PDF- + páginas en JSON; el lector de PDF se sustituye abajo (no hay PDF real de nadie).
const pdf = (pages) => '%PDF-' + JSON.stringify(pages);
const bbva = [[
  R([497, 'Estado de Cuenta']), R([481, 'MAESTRA PYME BBVA']), R([310, 'Periodo'], [481, `DEL 01/${M}/${Y} AL 28/${M}/${Y}`]), R([309, 'No. de Cuenta'], [550, '0000001234']),
  R([316, 'Saldo de Operaci'], [380, 'ó'], [384, 'n Inicial'], [559, '85,000.00']),
  R([316, 'Dep'], [331, 'ó'], [336, 'sitos / Abonos (+)'], [451, '2'], [552, '61,500.00']), R([317, 'Retiros / Cargos (-)'], [451, '2'], [552, '24,350.00']),
  R([316, 'Saldo de Operaci'], [380, 'ó'], [384, 'n Final'], [559, '122,150.00']),
  R([18, 'OPER'], [51, 'LIQ'], [83, 'COD. DESCRIPCI'], [153, 'Ó'], [160, 'N'], [230, 'REFERENCIA'], [377, 'CARGOS'], [434, 'ABONOS'], [485, 'OPERACI'], [548, 'LIQUIDACI']),
  R([10, `02/${MESC}`], [52, `02/${MESC}`], [83, 'T20 SPEI RECIBIDOBANORTE'], [432, '45,000.00']), R([83, '0000000PAGO FACTURA 101 Ref. 0000000101 072']), R([83, '00000000000000000000']), R([83, '0000000000000000000000000']), R([83, 'CONSTRUCTORA EJEMPLO SA DE CV']),
  R([10, `05/${MESC}`], [52, `05/${MESC}`], [83, 'T17 SPEI ENVIADO BANORTE'], [371, '23,500.00']), R([83, '0000000PAGO CEMENTO Ref. 0000000202 072']), R([83, '00000000000000000000']), R([83, '0000000000000000000000000']), R([83, 'CEMENTOS EJEMPLO SA DE CV']),
  R([10, `09/${MESC}`], [52, `09/${MESC}`], [83, 'T20 SPEI RECIBIDOBBVA'], [432, '16,500.00']), R([83, '0000000ANTICIPO OBRA Ref. 0000000303 012']), R([83, '00000000000000000000']), R([83, '0000000000000000000000000']), R([83, 'JUAN PEREZ EJEMPLO']),
  R([10, `12/${MESC}`], [52, `12/${MESC}`], [83, 'S39 SERV BANCA INTERNET'], [383, '850.00'], [493, '122,150.00'], [561, '122,150.00']), R([83, 'Ref. OPS SERV BCA IN']),
  R([9, 'BBVA MEXICO, S.A., INSTITUCION DE BANCA MULTIPLE, GRUPO FINANCIERO BBVA MEXICO'])
]];
function creditosXlsx(file) {
  const rows = [['Reporte de Créditos a Clientes', '', '', '', '', 'Periodo:'], [], ['Documento:', ' Todos', 'Caja:', ' Todas', 'Tipo:', ' No'], ['Cliente:', ' Todos', 'Estado:', ' Por Pagar', 'Orden:', ' Cliente'],
    ['No. Cli', 'Nombre', 'Teléfono', 'Celular', 'Saldo'],
    [11, 'CONSTRUCTORA EJEMPLO SA DE CV', '', '', '$ 48,200.00'], [], [12, 'FERRETERIA MUESTRA', '', '', '$ 12,750.50'], [], [13, 'JUAN PEREZ EJEMPLO', '', '', '$ 6,300.00'], [], ['', 'Total :', '', '', '$ 67,250.50']];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Creditos'); XLSX.writeFile(wb, file);
}
const ventasCsv = ['Reporte General de Ventas', 'Documento,Fecha,Folio,Cliente,Caja,Usuario,Folio F.,Est,Total',
  `Ticket,${dmy(3)},1001,CONSTRUCTORA EJEMPLO SA DE CV,Caja 1,admin,,V,"$ 18,400.00"`, `Ticket,${dmy(4)},1002,FERRETERIA MUESTRA,Caja 1,admin,,V,"$ 7,250.00"`,
  `Ticket,${dmy(6)},1003,JUAN PEREZ EJEMPLO,Caja 1,admin,,V,"$ 3,980.00"`, ',,,,,,,Total :,"$ 29,630.00"'].join('\n');
const bancoSinPista = ['Fecha,Concepto,Referencia,Cargo,Abono,Saldo', `${dmy(2)},DEPOSITO EN EFECTIVO,9001,,"5,000.00","5,000.00"`, `${dmy(8)},PAGO TARJETA,9002,"1,200.00",,"3,800.00"`].join('\n');

(async () => {
  let tenant = null, browser = null;
  const app = express(); app.use('/forzza/app', router);
  const server = http.createServer(app);
  try {
    await router.ready;
    router._pdfRows = async (buf) => ({ pages: JSON.parse(buf.slice(5).toString()) });
    await new Promise((r) => server.listen(0, r));
    const base = 'http://localhost:' + server.address().port + '/forzza/app/';
    const slug = 'guia-fz-' + Date.now();
    [[{ id: tenant }]] = await db.query('INSERT INTO fz_tenants (name,slug) VALUES (:n,:s) RETURNING id', { replacements: { n: 'Materiales Ejemplo', s: slug } });
    await db.query('INSERT INTO fz_config (tenant_id) VALUES (:t)', { replacements: { t: tenant } });
    for (const [n, b] of [['BBVA cheques', 'BBVA'], ['HSBC cheques', 'HSBC']]) await db.query("INSERT INTO fz_cuentas (tenant_id,nombre,banco,tipo,uso,incluir) VALUES (:t,:n,:b,'cheques','operacion',TRUE)", { replacements: { t: tenant, n, b } });
    const email = slug + '@example.test';
    await db.query("INSERT INTO fz_users (tenant_id,email,name,role,password_hash,must_change) VALUES (:t,:e,'Rafael (ejemplo)','director',:h,FALSE)", { replacements: { t: tenant, e: email, h: await bcrypt.hash('guia-pass-123456', 4) } });

    fs.writeFileSync(path.join(TMP, 'Estado de cuenta BBVA.pdf'), pdf(bbva));
    creditosXlsx(path.join(TMP, 'Creditos a Clientes.xlsx'));
    fs.writeFileSync(path.join(TMP, 'Ventas.csv'), ventasCsv);
    fs.writeFileSync(path.join(TMP, 'Utilidades por Ventas.pdf'), pdf(F.utilVentas));
    fs.writeFileSync(path.join(TMP, 'Inventario.pdf'), pdf(F.inventario));
    fs.writeFileSync(path.join(TMP, 'movimientos.csv'), bancoSinPista);
    fs.writeFileSync(path.join(TMP, 'foto del ticket.pdf'), pdf([[R([10, 'Ticket de compra'])]]));

    fs.mkdirSync(OUT, { recursive: true });
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
    await page.goto(base, { waitUntil: 'networkidle0' });
    const lg = await page.evaluate((e) => fetch('api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forzza': '1' }, body: JSON.stringify({ email: e, password: 'guia-pass-123456' }) }).then((r) => r.status + ' ' + r.statusText).catch((x) => String(x)), email);
    console.log('login', lg);
    // Sin el asistente flotante en las capturas.
    const limpio = () => page.addStyleTag({ content: '.d2orb-root{display:none!important}header.top{position:static!important}' });
    await page.goto(base + '#cargar', { waitUntil: 'networkidle0' }); await page.reload({ waitUntil: 'networkidle0' }); await limpio();
    await page.waitForSelector('#multi', { timeout: 8000 }).catch(async () => { await page.screenshot({ path: path.join(TMP, '..', 'guia-debug.png') }); console.log(await page.evaluate(() => document.body.innerText.slice(0, 400))); throw new Error('sin #multi'); });
    const shot = async (sel, name, pad) => { const el = await page.$(sel); await el.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 82 }); console.log('  ' + name); };
    await shot('nav.side', '01-menu.jpg');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, '02-pantalla.jpg'), type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1280, height: 640 } }); console.log('  02-pantalla.jpg');
    await shot('main .card.tbl', '03-que-descargar.jpg');
    const inp = await page.$('#multi input[type=file]');
    await inp.uploadFile(...['Estado de cuenta BBVA.pdf', 'Creditos a Clientes.xlsx', 'Ventas.csv', 'Utilidades por Ventas.pdf', 'Inventario.pdf', 'movimientos.csv', 'foto del ticket.pdf'].map((f) => path.join(TMP, f)));
    await page.waitForFunction(() => document.querySelectorAll('#cres .carga').length === 7, { timeout: 60000 });
    await shot('#cres', '04-resultado.jpg');
    const rev = await page.evaluateHandle(() => document.querySelector('#cres [data-cargar]').closest('.carga'));
    await rev.screenshot({ path: path.join(OUT, '05-revisar.jpg'), type: 'jpeg', quality: 82 }); console.log('  05-revisar.jpg');
    await page.evaluate(() => { const c = document.querySelector('#cres [data-cargar]').closest('.carga'); const s = c.querySelector('[data-cuenta]'); s.value = [...s.options].find((o) => /HSBC/.test(o.textContent)).value; c.querySelector('[data-cargar]').click(); });
    await page.waitForFunction(() => !document.querySelector('#cres [data-cargar]'), { timeout: 30000 });
    const ultima = await page.$$('#cres .carga');
    for (const el of ultima) { const t = await el.evaluate((n) => n.textContent); if (/movimientos\.csv/.test(t)) { await el.screenshot({ path: path.join(OUT, '06-revisado.jpg'), type: 'jpeg', quality: 82 }); console.log('  06-revisado.jpg'); } }
    await page.setViewport({ width: 1280, height: 2800, deviceScaleFactor: 2 });
    await page.goto(base + '#sicar_resumen', { waitUntil: 'networkidle0' }); await limpio();
    await page.waitForFunction(() => /Margen e inventario/.test(document.querySelector('main').textContent));
    const h2 = await page.evaluateHandle(() => [...document.querySelectorAll('main h2')].find((h) => /Margen e inventario/.test(h.textContent)));
    const box = await h2.evaluate((h) => { const r = h.getBoundingClientRect(); return { y: r.top + window.scrollY }; });
    const end = await page.evaluate(() => { const g = document.querySelector('main').lastElementChild.getBoundingClientRect(); return g.bottom + window.scrollY; });
    await page.screenshot({ path: path.join(OUT, '07-margen.jpg'), type: 'jpeg', quality: 82, clip: { x: 220, y: box.y - 10, width: 1050, height: Math.min(900, end - box.y + 20) } }); console.log('  07-margen.jpg');
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
    await page.goto(base + '#cargar', { waitUntil: 'networkidle0' }); await limpio();
    await page.waitForSelector('#multi');
    const est = await page.$$('main .card.tbl');
    await est[1].screenshot({ path: path.join(OUT, '08-estados.jpg'), type: 'jpeg', quality: 82 }); console.log('  08-estados.jpg');
  } catch (e) { console.error('ERROR', e && (e.stack || e)); process.exitCode = 1; }
  finally {
    if (browser) await browser.close();
    if (tenant) {
      for (const tb of ['fz_sicar_saldos', 'fz_sicar_docs', 'fz_sicar_imports', 'fz_movimientos', 'fz_cxc', 'fz_cxp', 'fz_clientes', 'fz_proveedores', 'fz_cuentas', 'fz_config', 'fz_activity', 'fz_users']) {
        await db.query(`DELETE FROM ${tb} WHERE tenant_id=:t`, { replacements: { t: tenant } }).catch((e) => console.log('limpieza', tb, e.message));
      }
      await db.query('DELETE FROM fz_tenants WHERE id=:t', { replacements: { t: tenant } }).catch(() => {});
    }
    fs.rmSync(TMP, { recursive: true, force: true });
    server.close(); process.exit();
  }
})();
