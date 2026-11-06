'use strict';
/**
 * Delca SIT — zero external keys, no database (in-memory store), fake WhatsApp
 * and fake model. Attacks the invariants: prices from the catalog only, no order
 * without a shown summary + explicit yes, no fabricated figure from the model,
 * WhatsApp "sent" only when the provider accepted it, admin fails shut.
 *   node verticals/delca/sit.js
 */
process.env.DELCA_STORE = 'memory';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DELCA_WHATSAPP_TOKEN; delete process.env.DELCA_TWILIO_WHATSAPP_FROM; delete process.env.DELCA_WHATSAPP_NUMBER;
process.env.DELCA_ADMIN_KEY = 'sit-admin-key-0123456789';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { ITEMS } = require('./src/menu');
const nlp = require('./src/nlp');
const dalia = require('./src/dalia');
const wa = require('./src/whatsapp');
const llm = require('./src/llm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL', m); } };
const near = (a, b) => a === b;

(async () => {
  /* ---------- 1. the menu transcription ---------- */
  const codes = new Set(ITEMS.map((i) => i.code));
  ok(codes.size === ITEMS.length, 'menu codes are unique');
  ok(ITEMS.length === 119, 'menu has 119 rows (got ' + ITEMS.length + ')');
  const price = (c) => (ITEMS.find((i) => i.code === c) || {}).price_cents;
  [['king-delca', 475], ['hamb-lomito-especial', 1530], ['promo-crunchy', 3300], ['parrilla-lomito', 1980], ['tumba-mechada', 730],
   ['wrap-lomito', 1210], ['perrito-x6', 1600], ['resuelve-x6', 2800], ['patacon-mechada', 1370], ['adic-pincho-lomito-solo', 1550], ['asada-carne-asada', 520]]
    .forEach(([c, p]) => ok(near(price(c), p), `price of ${c} is ${p} (got ${price(c)})`));
  ok(ITEMS.filter((i) => i.kind === 'service').length === 24, '24 adicionales are typed as services');
  const tests = [
    ['quiero 2 hamburguesas de carne especiales y una lata', [['hamb-carne-especial', 2], ['bebida-lata', 1]]],
    ['pan con huevo y queso y papas fritas', [['pan-huevo-queso', 1], ['papas-fritas', 1]]],
    ['un pepito de lomito, 3 tequeños', [['pepito-lomito', 1], ['tequenos', 3]]],
    ['una hamburguesa de pollo crunchy sencilla', [['hamb-crunchy-sencilla', 1]]],
    ['refresco litro y medio', [['bebida-litro-medio', 1]]],
    ['promo pa cinco', [['promo-pa-5', 1]]]
  ];
  for (const [t, exp] of tests) {
    const got = nlp.parseItems(t).filter((x) => x.code).map((x) => [x.code, x.qty]);
    ok(JSON.stringify(got) === JSON.stringify(exp), `parse "${t}" -> ${JSON.stringify(got)}`);
  }
  const amb = nlp.parseItems('una hamburguesa de pollo');
  ok(amb.length === 1 && amb[0].ambiguous && amb[0].ambiguous.length === 2, 'sencilla/especial not given -> ambiguous, never guessed');
  ok(nlp.parseItems('quiero una hamburguesa de pescado frito').every((x) => !x.code || !/pescado/.test(x.code)), 'an item not on the menu never appears');
  ok(nlp.phone('0414-123 45 67') === '+584141234567' && nlp.phone('hola') === null, 'Venezuelan phone normalised to E.164');

  /* ---------- 2. structural promises (grep) ---------- */
  const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
  const files = fs.readdirSync(path.join(__dirname, 'src')).filter((f) => f.endsWith('.js'));
  ok(files.filter((f) => /@anthropic-ai\/sdk/.test(src(f))).join() === 'llm.js', 'only llm.js reaches a model');
  ok(files.filter((f) => /graph\.facebook|require\('twilio'\)/.test(src(f))).join() === 'whatsapp.js', 'only whatsapp.js has a message transport');
  ok(!/price/i.test(src('index.js').match(/addLine\([^)]*\)/g).join()), 'cart route never passes a request price into the cart');
  const pgSql = src('store.js').split('function postgres')[1];
  const stmts = [...pgSql.matchAll(/`((?:SELECT|UPDATE)[\s\S]*?)`|'((?:SELECT|UPDATE)[^']*)'/g)].map((m) => m[1] || m[2]);
  stmts.filter((s) => /^(SELECT|UPDATE)/.test(s) && !/pg_advisory/.test(s) && !/tenant_id = :t/.test(s)).forEach((s) => console.log('   untenanted:', s.slice(0, 90)));
  ok(stmts.filter((s) => /^(SELECT|UPDATE)/.test(s) && !/pg_advisory/.test(s)).every((s) => /tenant_id = :t/.test(s)), 'every postgres SELECT/UPDATE filters tenant_id');

  /* ---------- 3. the HTTP flow, keyless ---------- */
  const sent = [];
  wa._setTransport(async (m) => { sent.push(m); return { status: 'sent', provider: 'test', id: 'wamid.sit' }; });
  const app = express(); app.use(express.json()); app.use('/delca', require('./src/index'));
  const server = app.listen(0); const base = 'http://127.0.0.1:' + server.address().port + '/delca';
  const post = async (p, b, h) => { const r = await fetch(base + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}), body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
  const get = async (p, h) => { const r = await fetch(base + p, { headers: h || {} }); return { s: r.status, j: r.headers.get('content-type').includes('json') ? await r.json() : await r.text() }; };

  const health = await get('/health');
  ok(health.s === 200 && health.j.ok && health.j.ai === 'heuristic', 'health ok on the keyless path');
  const page = await get('/');
  ok(page.s === 200 && !page.j.includes('{{BASE}}') && page.j.includes("var BASE='/delca'"), 'landing served with BASE substituted');
  const menu = await get('/api/v1/menu');
  ok(menu.j.products.length === 119 && menu.j.products.find((p) => p.code === 'king-delca').price === '€4,75', 'menu API returns the table with formatted prices');

  const { j: { sid } } = await post('/api/v1/session', {});
  const chat = (text) => post('/api/v1/chat', { sid, text });
  let r = await chat('Hola, quiero 2 hamburguesas de carne especiales y una lata');
  ok(r.j.cart.total === '€25,90' && r.j.composed_by === 'heuristic' && r.j.is_simulated === true, 'cart total computed from the catalog (2 x 11,70 + 2,50) and labelled heuristic');
  r = await post('/api/v1/cart', { sid, code: 'king-delca', qty: 1, price: 0.01, price_cents: 1 });
  ok(r.j.cart.total === '€30,65', 'a price in the request is ignored');
  r = await post('/api/v1/cart', { sid, code: 'hamburguesa-gratis' });
  ok(r.j.cart.total === '€30,65' && /no está en el menú/.test(r.j.reply), 'an unknown code cannot enter the cart');
  r = await chat('sí');
  ok(!r.j.order, 'a "sí" before any summary places nothing');
  r = await chat('eso es todo'); ok(r.j.awaiting === 'name', 'checkout asks the name');
  r = await chat('me llamo maría pérez'); ok(r.j.customer.name === 'María Pérez' && r.j.awaiting === 'phone', 'name captured');
  r = await chat('mi número es 0414 123 4567'); ok(r.j.customer.phone === '+584141234567' && r.j.awaiting === 'mode', 'phone captured');
  r = await chat('delivery por favor'); ok(r.j.awaiting === 'address', 'delivery asks the address');
  r = await chat('Av. 5 de Julio con calle 77, edificio azul'); ok(r.j.awaiting === 'confirm' && /€30,65/.test(r.j.reply), 'summary shown with the computed total');
  r = await post('/api/v1/cart', { sid, code: 'bebida-lata', qty: 1 });
  r = await chat('sí');
  ok(!r.j.order && r.j.awaiting === 'confirm' && /€33,15/.test(r.j.reply), 'cart changed after the summary: "sí" re-shows the new summary instead of placing');
  r = await chat('sí');
  ok(r.j.order && /^DLC-\d{5}$/.test(r.j.order.number) && r.j.order.whatsapp === 'sent', 'order placed after summary + yes; WhatsApp accepted');
  ok(sent.length === 1 && sent[0].to === '+584141234567' && /€33,15/.test(sent[0].text) && /DLC-/.test(sent[0].text), 'confirmation text carries the order number and the computed total');
  r = await chat('sí');
  ok(sent.length === 1 && /ya está registrado/.test(r.j.reply), 'a second "sí" does not place a second order');

  /* WhatsApp not configured -> never claimed as sent */
  wa._setTransport(null);
  const s2 = (await post('/api/v1/session', {})).j.sid;
  for (const t of ['una king delca', 'eso es todo', 'Pedro', '04241112233', 'paso a buscar', 'si']) r = await post('/api/v1/chat', { sid: s2, text: t });
  ok(r.j.order && r.j.order.whatsapp === 'not_configured' && !/Te envié/.test(r.j.reply) && /no está activada/.test(r.j.reply), 'no provider: order kept, WhatsApp reported as not configured, never "sent"');

  /* admin fails shut, then works */
  ok((await get('/api/v1/admin/orders')).s === 404, 'admin with no key -> 404');
  const H = { 'x-delca-admin-key': process.env.DELCA_ADMIN_KEY };
  const orders = await get('/api/v1/admin/orders', H);
  ok(orders.s === 200 && orders.j.orders.length === 2 && orders.j.orders[1].total_cents === 3315, 'admin lists the orders with stored totals');
  const pr = await fetch(base + '/api/v1/admin/products/king-delca', { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify({ available: false }) });
  ok(pr.status === 200, 'admin marks a product unavailable');
  const s3 = (await post('/api/v1/session', {})).j.sid;
  r = await post('/api/v1/chat', { sid: s3, text: 'una king delca' });
  ok(r.j.cart.lines.length === 0 && /no está disponible/.test(r.j.reply), 'an unavailable product cannot be ordered');
  const saveKey = process.env.DELCA_ADMIN_KEY; delete process.env.DELCA_ADMIN_KEY;
  ok((await get('/api/v1/admin/orders', H)).s === 503, 'admin closed (503) when DELCA_ADMIN_KEY is unset');
  process.env.DELCA_ADMIN_KEY = saveKey;
  ok((await post('/api/v1/chat', { sid: 'not-a-sid', text: 'hola' })).s === 400, 'malformed session id refused');

  /* ---------- 4. the model path, with a fake client ---------- */
  const script = [];
  llm._setClient({ messages: { create: async () => script.shift() } });
  const tool = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't' + Math.random(), name, input }] });
  const say = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });
  const s4 = (await post('/api/v1/session', {})).j.sid;
  script.push(tool('add_item', { code: 'hamburguesa-dorada', qty: 2 }), say('Te anoté dos hamburguesas doradas.'));
  r = await post('/api/v1/chat', { sid: s4, text: 'quiero la hamburguesa dorada' });
  ok(r.j.cart.lines.length === 0, 'model: an invented code is refused by the tool');
  script.push(tool('add_item', { code: 'hamb-pollo-sencilla', qty: 1 }), say('Listo, una hamburguesa de pollo sencilla por €5,00.'));
  r = await post('/api/v1/chat', { sid: s4, text: 'una de pollo sencilla' });
    ok(r.j.cart.total === '€8,00' && !/€5,00/.test(r.j.reply) && r.j.composed_by === 'model-discarded', 'model: a fabricated price is discarded for the computed reply');
  script.push(tool('set_customer', { name: 'Ana', phone: '04145556677', mode: 'pickup' }), tool('place_order', {}), say('¡Pedido listo!'));
  r = await post('/api/v1/chat', { sid: s4, text: 'soy Ana, 04145556677, lo busco' });
  ok(!r.j.order, 'model: place_order without a shown summary and a yes is refused');
  script.push(tool('show_summary', {}), tool('place_order', {}), say('¿Confirmas?'));
  r = await post('/api/v1/chat', { sid: s4, text: 'listo' });
  ok(!r.j.order, 'model: summary shown but the customer did not say yes -> place_order refused');
  ok(r.j.awaiting === 'confirm' && /€8,00/.test(r.j.reply), 'model: the summary text is the code\'s, with the computed total');
  script.push(tool('place_order', {}), say('Listo, tu pedido va por €99,00.'));
  r = await post('/api/v1/chat', { sid: s4, text: 'sí, confirmo' });
  ok(r.j.order && /€8,00/.test(r.j.reply) && !/99/.test(r.j.reply), 'model: after the yes the order is placed and the confirmation wording is the code\'s');
  llm._setClient(null);
  ok(dalia.verifyReply('La hamburguesa de carne especial cuesta €11,70 y la lata €2,50', dalia.newState(), (await get('/api/v1/menu')).j.products.map((p) => Object.assign(p, { description: p.description }))).length === 0, 'verifier accepts the real price of a named item');
  ok(dalia.verifyReply('La hamburguesa de carne especial cuesta €5,00', dalia.newState(), (await get('/api/v1/menu')).j.products).length === 1, 'verifier refuses another item\'s price attached to a named item');

  server.close();
  console.log(`\nDelca SIT: ${pass}/${pass + fail}`);
  console.log('NOT covered: a real Anthropic call, a real WhatsApp provider (Meta/Twilio), Postgres, the browser voice (Web Speech / Edge TTS).');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
