/* PLANEA — SIT de las cotizaciones con enlace mágico.
 *
 *   node verticals/planea/sit-quote.cjs
 *
 * Sin llaves: Stripe es un cliente FALSO inyectado (nunca se cobra ni se llama a Stripe).
 * Corre bajo el tenant 990919 y borra sus filas. Ataca: un monto enviado por el navegador,
 * un token malo, "pagada" desde la página de regreso, un evento falsificado o repetido,
 * un pago por otro monto, y la ausencia de Stripe.
 * NO cubre: Stripe real ni el correo de alerta (se verifican en producción).
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
process.env.PLANEA_TENANT_ID = '990919';
delete process.env.PLANEA_QUOTE_WEBHOOK_SECRET;
delete process.env.SENDGRID_API_KEY; // la alerta al dueño no sale desde la SIT

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Sequelize } = require('sequelize');
const Q = require('./quote.cjs');

let pass = 0, fail = 0; const fails = [];
function ok(c, n) { if (c) pass++; else { fail++; fails.push(n); console.log('  FAIL ' + n); } }

// ── Stripe falso ─────────────────────────────────────────────────────────────
const created = [], sessions = new Map(), events = new Map();
let n = 0;
const fake = {
  checkout: { sessions: {
    create: async (p) => { created.push(p); const id = 'cs_test_sit_' + (++n); sessions.set(id, { id, status: 'open', url: 'https://checkout.stripe.test/' + id, payment_status: 'unpaid', amount_total: p.line_items[0].price_data.unit_amount, currency: p.line_items[0].price_data.currency, metadata: p.metadata, payment_intent: 'pi_sit_' + n }); return { id, url: 'https://checkout.stripe.test/' + id }; },
    retrieve: async (id) => { if (!sessions.has(id)) throw new Error('no such session'); return sessions.get(id); },
  } },
  events: { retrieve: async (id) => { if (!events.has(id)) throw new Error('no such event'); return events.get(id); } },
  webhooks: { constructEvent: (raw, sig) => { if (sig !== 'good') throw new Error('bad signature'); return JSON.parse(raw.toString('utf8')); } },
};
let stripeOn = true;

(async () => {
  const sq = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, { dialect: 'postgres', dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false });
  const app = express();
  app.use('/planea/quote/stripe/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use('/planea/quote', Q.build({ db: () => sq, stripe: () => (stripeOn ? fake : null) }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/planea/quote';
  async function call(method, p, { body, hdr = true, headers = {}, raw } = {}) {
    const h = Object.assign({}, headers);
    if (body || raw) h['Content-Type'] = 'application/json';
    if (hdr) h['X-Planea-Quote'] = '1';
    const r = await fetch(base + p, { method, headers: h, body: raw != null ? raw : (body ? JSON.stringify(body) : undefined) });
    const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch (e) { j = { _text: txt }; }
    return { status: r.status, body: j, text: txt, headers: r.headers };
  }
  const evt = (id, sessionId, type) => { const e = { id, type: type || 'checkout.session.completed', data: { object: { id: sessionId, metadata: sessions.get(sessionId) ? sessions.get(sessionId).metadata : { kind: 'planea_quote' } } } }; events.set(id, e); return e; };

  let q1, q2;
  try {
    // Crear
    q1 = await Q.create(sq, { title: 'SIT cotización <b>uno</b>', recipients: [{ name: 'Ana SIT' }], content: { items: [{ title: 'Ítem', what: 'Hace algo' }], not_included: ['Nada más'] }, hours: 1.72, rate_cents: 14000 });
    q2 = await Q.create(sq, { title: 'SIT cotización dos', recipients: [], content: {}, hours: 2, rate_cents: 14000 });
    ok(q1.amount_cents === 24080 && q2.amount_cents === 28000, 'el total es horas x tarifa, guardado en la fila');
    ok(Q.TOKEN_RE.test(q1.token) && q1.token.length >= 43, 'el token es aleatorio de 256 bits');
    const [[row1]] = await sq.query('SELECT * FROM planea_quotes WHERE id = :id', { replacements: { id: q1.id } });
    ok(row1.tenant_id === 990919 && !JSON.stringify(row1).includes(q1.token), 'el token no se guarda en claro; la fila tiene tenant');

    // Tokens malos
    ok((await call('GET', '/nope')).status === 404, 'token mal formado: 404');
    ok((await call('GET', '/' + 'A'.repeat(43))).status === 404, 'token desconocido: 404');
    ok((await call('POST', '/' + 'A'.repeat(43) + '/checkout')).status === 404, 'pagar con token desconocido: 404');
    ok((await call('POST', '/' + 'A'.repeat(43) + '/discuss', { body: { comment: 'x' } })).status === 404, 'comentar con token desconocido: 404');

    // Página
    const pg = await call('GET', '/' + q1.token);
    ok(pg.status === 200 && /noindex/.test(pg.headers.get('x-robots-tag') || '') && /<meta name="robots" content="noindex/.test(pg.text), 'la página responde y es noindex');
    ok(/USD 240,80/.test(pg.text) && /1,72 h/.test(pg.text), 'la página muestra horas y total');
    ok(!/Tarifa por hora|USD 140,00/.test(pg.text), 'la página no muestra la tarifa por hora');
    ok(!/entregas registradas|Tiempo real/.test(pg.text), 'la página no muestra fechas de desarrollo ni entregas registradas');
    ok(!/<b>uno<\/b>/.test(pg.text) && /&lt;b&gt;uno/.test(pg.text), 'el contenido se escapa');
    ok(/no-store/.test(pg.headers.get('cache-control') || ''), 'la página no se guarda en caché');

    // Sin Stripe: nunca un pago falso
    stripeOn = false;
    const noS = await call('POST', '/' + q1.token + '/checkout');
    ok(noS.status === 503 && noS.body.error === 'pagos_no_configurados', 'sin STRIPE_SECRET_KEY el pago responde "no configurado"');
    ok(/no están configurados/.test((await call('GET', '/' + q1.token)).text), 'y la página lo dice en el botón');
    stripeOn = true;

    // Manipular el monto
    ok((await call('POST', '/' + q1.token + '/checkout', { hdr: false })).status === 404, 'pagar sin la cabecera propia: 404');
    const co = await call('POST', '/' + q1.token + '/checkout?amount=1&unit_amount=1', { body: { amount: 1, amount_cents: 1, unit_amount: 1, price: 0.01, currency: 'cop', hours: 0.01 } });
    const sent = created[created.length - 1];
    ok(co.status === 200 && /checkout\.stripe\.test/.test(co.body.url), 'aprobar abre Stripe Checkout');
    ok(sent && sent.line_items[0].price_data.unit_amount === 24080 && sent.line_items[0].price_data.currency === 'usd', 'Stripe recibe el monto GUARDADO, no el del navegador');
    ok(sent && sent.metadata.quote_id === String(q1.id) && sent.metadata.kind === 'planea_quote', 'la sesión lleva el id de la cotización');
    const qsrc = fs.readFileSync(path.join(__dirname, 'quote.cjs'), 'utf8');
    const coSrc = qsrc.slice(qsrc.indexOf("router.post('/:token/checkout'"), qsrc.indexOf("router.post('/:token/discuss'"));
    ok(!/req\.body|req\.query/.test(coSrc), 'el código de pago no lee el cuerpo ni la URL');
    const co2 = await call('POST', '/' + q1.token + '/checkout');
    ok(co2.status === 200 && co2.body.url === co.body.url && created.length === 1, 'un segundo toque reusa el pago abierto, no abre otro cobro');
    let [[st]] = await sq.query('SELECT status FROM planea_quotes WHERE id = :id', { replacements: { id: q1.id } });
    ok(st.status === 'approved', 'aprobar deja la cotización en "approved"');

    // La página de regreso NO marca pagada
    const back = await call('GET', '/' + q1.token + '?pago=ok');
    [[st]] = await sq.query('SELECT status FROM planea_quotes WHERE id = :id', { replacements: { id: q1.id } });
    ok(back.status === 200 && st.status === 'approved' && /solo cuando Stripe nos avisa/.test(back.text), 'regresar de Stripe con ?pago=ok no marca pagada');
    ok((qsrc.match(/SET status = 'paid'/g) || []).length === 1 && qsrc.indexOf("SET status = 'paid'") > qsrc.indexOf("'/stripe/webhook'") && qsrc.indexOf("SET status = 'paid'") < qsrc.indexOf('router.use(noStore)') && !/'paid'\s*(,|WHERE)/.test(coSrc), 'solo el webhook escribe "paid"');

    const sid = sent ? 'cs_test_sit_' + n : null;
    // Webhook: evento que Stripe no conoce (falsificado)
    const forged = { id: 'evt_forged1', type: 'checkout.session.completed', data: { object: { id: sid, metadata: { kind: 'planea_quote', quote_id: String(q1.id) } } } };
    ok((await call('POST', '/stripe/webhook', { hdr: false, raw: JSON.stringify(forged) })).status === 400, 'un evento que Stripe no emitió se rechaza');
    // Sesión aún sin pagar
    evt('evt_unpaid', sid);
    const unp = await call('POST', '/stripe/webhook', { hdr: false, raw: JSON.stringify({ id: 'evt_unpaid' }) });
    ok(unp.status === 200 && unp.body.ignored === 'unpaid', 'una sesión completada sin pagar (pago diferido) se ignora sin error');
    // Pagada por otro monto
    sessions.get(sid).payment_status = 'paid'; sessions.get(sid).amount_total = 100;
    evt('evt_wrongamt', sid);
    ok((await call('POST', '/stripe/webhook', { hdr: false, raw: JSON.stringify({ id: 'evt_wrongamt' }) })).status === 400, 'un pago por otro monto no marca pagada');
    [[st]] = await sq.query('SELECT status FROM planea_quotes WHERE id = :id', { replacements: { id: q1.id } });
    ok(st.status === 'approved', 'sigue sin estar pagada');
    // Con secreto de firma: firma mala
    process.env.PLANEA_QUOTE_WEBHOOK_SECRET = 'whsec_sit';
    sessions.get(sid).amount_total = 24080;
    evt('evt_ok', sid);
    ok((await call('POST', '/stripe/webhook', { hdr: false, raw: JSON.stringify(events.get('evt_ok')), headers: { 'stripe-signature': 'bad' } })).status === 400, 'con secreto configurado, una firma mala se rechaza');
    delete process.env.PLANEA_QUOTE_WEBHOOK_SECRET;
    // Evento correcto
    const good = await call('POST', '/stripe/webhook', { hdr: false, raw: JSON.stringify({ id: 'evt_ok' }) });
    [[st]] = await sq.query('SELECT status, paid_at, stripe_session_id FROM planea_quotes WHERE id = :id', { replacements: { id: q1.id } });
    ok(good.status === 200 && st.status === 'paid' && st.paid_at && st.stripe_session_id === sid, 'el webhook confirmado por Stripe marca pagada');
    const again = await call('POST', '/stripe/webhook', { hdr: false, raw: JSON.stringify({ id: 'evt_ok' }) });
    const [[pc]] = await sq.query("SELECT COUNT(*)::int AS n FROM planea_quote_events WHERE quote_id = :id AND event = 'paid'", { replacements: { id: q1.id } });
    ok(again.status === 200 && pc.n === 1, 'el mismo evento repetido no se aplica dos veces');
    const before2 = events.size;
    const foreign = await call('POST', '/stripe/webhook', { hdr: false, raw: JSON.stringify({ id: 'evt_jobup', type: 'checkout.session.completed', data: { object: { id: 'cs_x', metadata: { kind: 'jobup' } } } }) });
    ok(foreign.status === 200 && foreign.body.ignored === true, 'un checkout de otro producto se ignora sin consultar a Stripe');
    // Otros eventos se ignoran
    events.set('evt_other', { id: 'evt_other', type: 'invoice.paid', data: { object: {} } });
    ok((await call('POST', '/stripe/webhook', { hdr: false, raw: JSON.stringify({ id: 'evt_other' }) })).body.ignored === true, 'eventos ajenos se ignoran');

    // Segundo cobro con otra sesión: se registra y se avisa, no se oculta
    const dupId = 'cs_test_sit_dup';
    sessions.set(dupId, { id: dupId, status: 'complete', payment_status: 'paid', amount_total: 24080, currency: 'usd', metadata: { kind: 'planea_quote', quote_id: String(q1.id), tenant_id: '990919' }, payment_intent: 'pi_dup' });
    evt('evt_dup', dupId);
    const dup = await call('POST', '/stripe/webhook', { hdr: false, raw: JSON.stringify({ id: 'evt_dup' }) });
    const [[dc]] = await sq.query("SELECT COUNT(*)::int AS n FROM planea_quote_events WHERE quote_id = :id AND event = 'double_payment'", { replacements: { id: q1.id } });
    ok(dup.body.duplicate === true && dc.n === 1, 'un segundo pago de la misma cotización queda registrado para reembolso');
    // Límite del webhook abierto (sin secreto)
    let limitedHit = false;
    for (let i = 0; i < 32; i++) { const r = await call('POST', '/stripe/webhook', { hdr: false, raw: JSON.stringify({ id: 'evt_flood' + i }) }); if (r.status === 429) { limitedHit = true; break; } }
    ok(limitedHit, 'el webhook sin secreto limita llamadas por IP');

    // Después de pagada
    ok((await call('POST', '/' + q1.token + '/checkout')).status === 409, 'una cotización pagada no abre otro pago');
    await call('POST', '/' + q1.token + '/discuss', { body: { comment: 'después de pagar' } });
    [[st]] = await sq.query('SELECT status FROM planea_quotes WHERE id = :id', { replacements: { id: q1.id } });
    ok(st.status === 'paid', 'comentar después de pagar no cambia el estado');
    ok(/Pago confirmado por Stripe/.test((await call('GET', '/' + q1.token)).text), 'la página muestra el pago confirmado');

    // Quiero discutirlo
    ok((await call('POST', '/' + q2.token + '/discuss', { body: { comment: '   ' } })).status === 400, 'comentario vacío: 400');
    ok((await call('POST', '/' + q2.token + '/discuss', { body: { comment: 'x' }, hdr: false })).status === 404, 'comentar sin la cabecera propia: 404');
    const d = await call('POST', '/' + q2.token + '/discuss', { body: { comment: 'Queremos revisar el alcance.' } });
    const [[s2]] = await sq.query('SELECT status, discuss_comment FROM planea_quotes WHERE id = :id', { replacements: { id: q2.id } });
    ok(d.status === 200 && s2.status === 'discuss' && s2.discuss_comment === 'Queremos revisar el alcance.', '"Quiero discutirlo" guarda el comentario y el estado');
    for (let i = 0; i < 4; i++) await call('POST', '/' + q2.token + '/discuss', { body: { comment: 'otra ' + i } });
    ok((await call('POST', '/' + q2.token + '/discuss', { body: { comment: 'sexta' } })).status === 429, 'más de 5 comentarios por hora se frenan');
    const [ev] = await sq.query('SELECT DISTINCT event FROM planea_quote_events WHERE quote_id IN (:a, :b)', { replacements: { a: q1.id, b: q2.id } });
    const evs = ev.map((r) => r.event);
    ok(['created', 'viewed', 'approved', 'paid', 'discuss', 'webhook_rejected', 'webhook_unpaid', 'double_payment'].every((e) => evs.indexOf(e) >= 0), 'cada paso queda registrado');
  } catch (e) { console.error('SIT error:', e); fail++; }
  finally {
    server.close();
    await sq.query('DELETE FROM planea_quote_events WHERE tenant_id = 990919').catch(() => {});
    await sq.query('DELETE FROM planea_quotes WHERE tenant_id = 990919').catch(() => {});
    const [[left]] = await sq.query('SELECT COUNT(*)::int AS n FROM planea_quotes WHERE tenant_id = 990919').catch(() => [[{ n: -1 }]]);
    ok(left.n === 0, 'la SIT borró sus cotizaciones');
    await sq.close();
  }
  console.log('\nPLANEA QUOTE SIT: ' + pass + '/' + (pass + fail) + (fail ? '  FAILED: ' + fails.join(' | ') : ''));
  console.log('No cubierto: Stripe real y el correo de alerta al dueño.');
  process.exit(fail ? 1 : 0);
})();
