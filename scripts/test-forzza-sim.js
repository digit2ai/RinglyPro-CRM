#!/usr/bin/env node
/* Prueba del simulador de capital de /forzza (datos simulados). Sin llaves, sin base de datos.
   Parte 1: motor de cálculo. Parte 2: la página en un navegador (se omite, avisando, si no hay puppeteer). */
const path = require('path');
const fs = require('fs');
const E = require('../public/forzza/engine.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  FALLA:', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + b + ', obtenido ' + a + ')'); }

// --- escenario inicial ---
let s = E.fresh();
let p = E.project(s);
eq(p.series[30], 45000, 'saldo día 30');
eq(p.final, 125000, 'saldo día 60');
eq(p.min, -57000, 'menor saldo');
eq(p.minDay, 15, 'menor saldo empieza el día 15');
eq(p.minEnd, 19, 'menor saldo termina antes del cobro del día 20');
eq(p.shortZero, 57000, 'faltante respecto a cero');
eq(p.shortReserve, 87000, 'faltante respecto a la reserva');
eq(p.receivable, 200000, 'cartera');
eq(p.obligations, 225000, 'obligaciones');
eq(p.overdue, 0, 'nada vencido en el día 0');
s.horizon = 30; p = E.project(s); eq(p.final, 45000, 'horizonte 30: saldo final');
ok(p.outside.some(m => m.id === 'c-b'), 'cobro del día 35 queda fuera del horizonte de 30 y visible');
eq(p.receivable, 200000, 'la cartera fuera del horizonte sigue visible en cartera');
s.horizon = 90; p = E.project(s); eq(p.final, 125000, 'horizonte 90');

// --- vencido según fecha de evaluación ---
s = E.fresh(); s.evalDay = 20; p = E.project(s);
eq(p.overdue, 0, 'día 20: cobro que vence el 20 no está vencido');
s.evalDay = 21; p = E.project(s);
eq(p.overdue, 120000, 'día 21: cobro del día 20 vencido');

// --- abono parcial ---
s = E.fresh();
let r = E.collect(s, 'c-a', 40000);
ok(r.ok, 'abono aceptado');
eq(s.cash, 190000, 'abono sube el efectivo');
p = E.project(s);
eq(p.receivable, 160000, 'abono baja la cartera');
const ca = p.items.find(m => m.id === 'c-a');
eq(ca.pending, 80000, 'queda el saldo restante');
eq(ca.day, 20, 'el saldo conserva su vencimiento');
eq(ca.status, 'parcial', 'estado abono parcial');
eq(p.final, 125000, 'el abono no duplica la entrada en la proyección');
eq(E.collect(s, 'c-a', 999999).amount, 80000, 'no se cobra más que lo pendiente');
eq(E.project(s).final, 125000, 'cobro total: saldo final igual');
ok(!E.collect(s, 'c-a', 1).ok, 'no se cobra una cuenta ya pagada');

// --- pago confirmado ---
s = E.fresh();
E.pay(s, 'p-a');
eq(s.cash, 60000, 'pago baja el efectivo');
p = E.project(s);
eq(p.obligations, 135000, 'pago baja la obligación');
eq(p.final, 125000, 'el pago no se descuenta otra vez');
ok(!E.pay(s, 'c-a').ok, 'un cobro no se confirma como pago');

// --- pedido nuevo ---
s = E.fresh();
let a = E.analyzeOrder(s, {});
eq(a.margin, 20000, 'margen ilustrativo');
eq(a.cashOut, 80000, 'salida antes del cobro');
eq(a.netOut, 80000, 'salida neta sin anticipo');
eq(a.without.min, -57000, 'sin pedido: mínimo');
eq(a.with.min, -137000, 'con pedido: mínimo');
eq(a.shortReserveChange, 80000, 'el pedido aumenta el faltante respecto a la reserva');
a = E.analyzeOrder(s, { advPct: 30 });
eq(a.netOut, 50000, 'con 30 % de anticipo, salida neta 50,000');
eq(a.advance, 30000, 'anticipo 30 %');
a = E.analyzeOrder(s, { advMode: 'amt', advAmt: 250000 });
eq(a.advance, 100000, 'anticipo no supera la venta');
eq(E.project(s).final, 125000, 'analizar no modifica el escenario');

E.setOrder(s, {});
p = E.project(s);
eq(p.items.filter(m => m.origin === 'pedido').length, 3, 'pedido crea materiales, entrega y saldo (sin anticipo)');
eq(p.receivable, 300000, 'venta a crédito aumenta la cartera');
eq(s.cash, 150000, 'venta a crédito no aumenta el efectivo');
E.setOrder(s, {}); E.setOrder(s, {});
eq(E.project(s).items.filter(m => m.origin === 'pedido').length, 3, 'agregar varias veces no duplica movimientos');
E.setOrder(s, { advPct: 30 });
p = E.project(s);
eq(p.items.filter(m => m.origin === 'pedido').length, 4, 'con anticipo aparece el movimiento de anticipo');
eq(p.receivable, 270000, 'el anticipo no es cartera');
eq(p.min, -107000, 'mínimo con pedido y anticipo 30 %');
E.removeOrder(s);
p = E.project(s);
eq(p.items.filter(m => m.origin === 'pedido').length, 0, 'eliminar el pedido quita sus movimientos');
eq(p.final, 125000, 'eliminar el pedido regresa al escenario inicial');

// --- escenarios ---
s = E.fresh(); E.delay(s, 'c-a', 15); p = E.project(s);
eq(p.items.find(m => m.id === 'c-a').day, 35, 'retrasar 15 días');
ok(p.min < -57000, 'retrasar un cobro empeora el mínimo');
s = E.fresh(); E.moveSupplier(s, 'p-b', 22); p = E.project(s);
ok(/negociación/.test(p.items.find(m => m.id === 'p-b').assumption), 'cambio a proveedor marcado como supuesto de negociación');
s = E.fresh(); E.setPayrollUp(s, true);
eq(E.project(s).items.find(m => m.id === 'nom').amount, 49500, 'nómina +10 %');
E.setPayrollUp(s, false);
eq(E.project(s).items.find(m => m.id === 'nom').amount, 45000, 'nómina regresa');
s = E.fresh(); E.addExtra(s, 25000, 12);
eq(E.project(s).min, -82000, 'gasto extraordinario');
s = E.fresh(); const m = E.addMovement(s, { kind: 'out', party: 'X', concept: 'Y', amount: 24500, day: 18 });
eq(E.project(s).obligations, 249500, 'registro capturado entra como obligación');
s = E.fresh(); E.addMovement(s, { kind: 'in', party: 'X', amount: 10000, day: 3, done: true });
eq(s.cash, 160000, 'registro capturado como realizado sube el efectivo');

// --- reglas de la página (búsqueda en el código) ---
const html = fs.readFileSync(path.join(__dirname, '../public/forzza/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../public/forzza/app.js'), 'utf8');
const all = (html + app).toLowerCase();
ok(!/m[aá]rmol|licitaci|maquinaria/.test(all), 'no aparecen mármol, licitaciones ni maquinaria');
ok(!/[\u{1F300}-\u{1FAFF}]/u.test(html + app), 'sin emojis');
ok(!/fetch\([^)]*(whatsapp|graph\.facebook|twilio|plaid|stripe)/i.test(app), 'ningún envío real de WhatsApp ni conexión bancaria');
ok(/datos simulados/i.test(html), 'etiqueta de datos simulados');
ok(/no es una aprobación/i.test(html + app), 'aclara que no es aprobación de crédito');
ok(/sobregiro autorizado/i.test(html + app), 'aclara que negativo no es sobregiro');
ok(/no es necesariamente ahorro/i.test(html), 'aclara que el tiempo liberado no es ahorro de efectivo');
ok(/4\.33/.test(html) && /4\.33/.test(app), 'fórmula de horas liberadas');
ok(/voice: 'dalia'/.test(app), 'narración con la voz de Dalia');
ok(/class="slide"/g.test(html) && (html.match(/class="slide"/g) || []).length === 10, 'diez diapositivas');
const narr = app.match(/narr: '([^']+)'/g) || [];
eq(narr.length, 10, 'una narración por diapositiva');
ok(narr.every(n => n.length < 2000 && !/\d/.test(n)), 'narraciones bajo 2000 caracteres y con cifras en palabras');
eq((app.match(/notes: '/g) || []).length, 10, 'notas para el presentador en cada diapositiva');

// --- navegador ---
(async () => {
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch (e) { console.log('AVISO: sin puppeteer, no se probó la página en un navegador.'); return done(); }
  const http = require('http');
  const root = path.join(__dirname, '../public');
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (u.startsWith('/api/')) { res.writeHead(503); return res.end(); }
    let f = path.join(root, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': t + '; charset=utf-8' }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  const base = 'http://localhost:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const pg = await br.newPage(); await pg.setViewport({ width: w, height: h });
      const errs = []; pg.on('pageerror', e => errs.push(e.message));
      await pg.goto(base + '/forzza/', { waitUntil: 'networkidle0' });
      await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'networkidle0' });
      eq(errs.length, 0, w + 'px: sin errores de JavaScript ' + errs.join(' | '));
      for (let i = 0; i < 10; i++) {
        await pg.evaluate(() => document.getElementById('next').click());
      }
      eq(await pg.$eval('#count', e => e.textContent), '10 / 10', w + 'px: navegación hasta la última diapositiva');
      await pg.evaluate(() => document.querySelector('[data-goto-sim]').click());
      await new Promise(r => setTimeout(r, 200));
      const k = await pg.$$eval('#simKpis .kv', els => els.map(e => e.textContent));
      eq(k[4], '$125,000', w + 'px: KPI saldo final');
      eq(k[5], '−$57,000', w + 'px: KPI menor saldo');
      eq(k[7], '$87,000', w + 'px: KPI faltante reserva');
      const over = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      ok(!over, w + 'px: sin desplazamiento horizontal en el simulador');
      // agregar pedido una vez, cambiar anticipo, eliminar
      await pg.evaluate(() => document.querySelector('#simOrderForm .js-addorder').click());
      eq(await pg.evaluate(() => FzApp.project().items.filter(m => m.origin === 'pedido').length), 3, w + 'px: pedido agregado una vez');
      await pg.evaluate(() => { const s = document.getElementById('scAdv'); s.value = 30; s.dispatchEvent(new Event('input', { bubbles: true })); });
      eq(await pg.evaluate(() => FzApp.project().min), -107000, w + 'px: anticipo 30 % actualiza el pedido');
      await pg.evaluate(() => document.querySelector('#simOrderForm .js-delorder').click());
      eq(await pg.evaluate(() => FzApp.project().final), 125000, w + 'px: pedido eliminado');
      // horizonte 30
      await pg.evaluate(() => document.querySelector('#horizon button[data-h="30"]').click());
      eq(await pg.$$eval('#simKpis .kv', els => els[4].textContent), '$45,000', w + 'px: horizonte 30 días');
      // volver conserva cambios
      await pg.evaluate(() => document.getElementById('backDeck').click());
      eq(await pg.$eval('#count', e => e.textContent), '10 / 10', w + 'px: regresa a la misma diapositiva');
      eq(await pg.evaluate(() => FzApp.state().horizon), 30, w + 'px: conserva los cambios al volver');
      // WhatsApp demo no envía nada
      await pg.evaluate(() => { location.hash = ''; document.getElementById('toSim').click(); document.getElementById('waApprove').click(); });
      ok(/no se envió/i.test(await pg.$eval('#waMsg', e => e.textContent)), w + 'px: WhatsApp demostración sin envío');
      await pg.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', 'forzza-sim-' + w + '.png'), fullPage: false });
      await pg.evaluate(() => document.getElementById('toDeck').click());
      await pg.evaluate(() => { for (let i = 0; i < 9; i++) document.getElementById('prev').click(); for (let i = 0; i < 5; i++) document.getElementById('next').click(); });
      await new Promise(r => setTimeout(r, 400));
      await pg.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', 'forzza-deck6-' + w + '.png') });
      await pg.close();
    }
  } finally { await br.close(); srv.close(); }
  done();
})();
function done() { console.log('Simulador forzza: ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0); }
