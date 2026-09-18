/* PLANEA — cotizaciones con enlace mágico (/planea/quote/:token).
 *
 * REGLAS QUE VIVEN EN CÓDIGO (la SIT ataca cada una):
 * - EL MONTO VIENE DE LA FILA, NUNCA DEL NAVEGADOR. /checkout ignora todo lo que llegue
 *   en el cuerpo o en la URL; el valor de Stripe Checkout es amount_cents de la cotización.
 * - "PAGADA" SOLO LA ESCRIBE EL WEBHOOK DE STRIPE. La página de regreso (?pago=ok) solo
 *   dice "estamos confirmando". El webhook no se cree a sí mismo: si hay secreto de firma
 *   lo verifica, y en todo caso vuelve a pedirle el evento y la sesión a Stripe con la
 *   llave del servidor, y exige que la sesión sea de ESTA cotización, esté pagada, en USD
 *   y por el monto exacto guardado.
 * - EL TOKEN NO SE GUARDA. Se guarda su SHA-256: quien lea la base de datos no obtiene
 *   enlaces. Un token mal formado o desconocido responde 404, igual que uno inexistente.
 * - SIN STRIPE_SECRET_KEY el botón dice que los pagos no están configurados. Nunca se
 *   simula un pago.
 * - NADA SE ENVÍA AL CLIENTE. La cotización se comparte a mano (WhatsApp). Solo el dueño
 *   recibe un correo cuando el cliente pide discutir o cuando Stripe confirma el pago.
 *
 * Estados: sent -> approved (abrió el pago) -> paid (webhook). discuss en cualquier
 * momento antes de pagar. Una cotización pagada no vuelve atrás.
 */
'use strict';

const express = require('express');
const crypto = require('crypto');

const tenant = () => Number(process.env.PLANEA_TENANT_ID) || 1;
const BASE = () => String(process.env.PLANEA_QUOTE_BASE_URL || 'https://aiagent.ringlypro.com/planea').replace(/\/+$/, '');
const ALERT_TO = () => process.env.PLANEA_QUOTE_ALERT_EMAIL || 'mstagg@digit2ai.com';
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const usd = (cents) => 'USD ' + (cents / 100).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function ensure(sq) {
  await sq.query(`CREATE TABLE IF NOT EXISTS planea_quotes (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    title TEXT NOT NULL,
    recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    hours NUMERIC(8,2) NOT NULL,
    rate_cents INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','approved','paid','discuss')),
    approved_at TIMESTAMPTZ, paid_at TIMESTAMPTZ,
    stripe_session_id TEXT, stripe_payment_intent TEXT,
    discuss_comment TEXT, discuss_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await sq.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_quotes_token ON planea_quotes (token_hash)');
  await sq.query('CREATE INDEX IF NOT EXISTS idx_planea_quotes_tenant ON planea_quotes (tenant_id, created_at)');
  await sq.query(`CREATE TABLE IF NOT EXISTS planea_quote_events (
    id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, quote_id INTEGER NOT NULL,
    event TEXT NOT NULL, detail JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await sq.query('CREATE INDEX IF NOT EXISTS idx_planea_quote_events_quote ON planea_quote_events (tenant_id, quote_id, created_at)');
  // Un mismo evento de Stripe no se aplica dos veces.
  await sq.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_quote_events_stripe ON planea_quote_events ((detail->>'stripe_event')) WHERE event = 'paid'");
}

// Crea una cotización y devuelve el token UNA sola vez (no se puede recuperar después).
async function create(sq, { title, recipients, content, hours, rate_cents }) {
  await ensure(sq);
  const h = Math.round(Number(hours) * 100) / 100;
  const amount = Math.round(h * rate_cents);
  if (!(h > 0) || !(rate_cents > 0) || !(amount > 0)) throw new Error('horas o tarifa inválidas');
  const token = newToken();
  const [[row]] = await sq.query(`INSERT INTO planea_quotes (tenant_id, token_hash, title, recipients, content, hours, rate_cents, amount_cents)
     VALUES (:t, :th, :ti, CAST(:r AS JSONB), CAST(:c AS JSONB), :h, :rc, :a) RETURNING id, amount_cents`,
  { replacements: { t: tenant(), th: hashToken(token), ti: title, r: JSON.stringify(recipients || []), c: JSON.stringify(content || {}), h, rc: rate_cents, a: amount } });
  await logEvent(sq, row.id, 'created', { amount_cents: row.amount_cents });
  return { id: row.id, token, amount_cents: row.amount_cents, url: BASE() + '/quote/' + token };
}

async function logEvent(sq, quoteId, event, detail) {
  await sq.query('INSERT INTO planea_quote_events (tenant_id, quote_id, event, detail) VALUES (:t, :q, :e, CAST(:d AS JSONB))',
    { replacements: { t: tenant(), q: quoteId, e: event, d: JSON.stringify(detail || null) } });
}

async function findByToken(sq, token) {
  if (!TOKEN_RE.test(String(token || ''))) return null;
  const [rows] = await sq.query('SELECT * FROM planea_quotes WHERE token_hash = :h AND tenant_id = :t', { replacements: { h: hashToken(token), t: tenant() } });
  return rows[0] || null;
}

async function alertOwner(subject, text) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) { console.log('[planea-quote] alerta sin correo (falta SENDGRID_API_KEY):', subject); return false; }
  try {
    const sg = require('@sendgrid/mail'); sg.setApiKey(key);
    await sg.send({ to: ALERT_TO(), from: { email: process.env.SENDGRID_FROM_EMAIL || 'info@digit2ai.com', name: 'Planea' }, subject, text });
    return true;
  } catch (e) { console.error('[planea-quote] alerta:', e.message); return false; }
}

function defaultStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? require('stripe')(key) : null;
}

// ── Página ──────────────────────────────────────────────────────────────────
const STATUS_TXT = { sent: 'Enviada', approved: 'Aprobada · pago en proceso', paid: 'Pagada', discuss: 'En conversación' };
function page(q, { payments, notice }) {
  const c = q.content || {};
  const items = (c.items || []).map((it) => '<li><b>' + esc(it.title) + '.</b> ' + esc(it.what) + (it.why ? ' <span class="why">' + esc(it.why) + '</span>' : '') + '</li>').join('');
  const excl = (c.not_included || []).map((x) => '<li>' + esc(x) + '</li>').join('');
  const who = (q.recipients || []).map((r) => esc(r.name)).join(' y ');
  const paid = q.status === 'paid';
  const hours = Number(q.hours).toLocaleString('es-CO', { minimumFractionDigits: 2 });
  const w = c.window || {};
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(q.title)} · Digit2AI</title>
<style>
:root{--ink:#0b1b2b;--mut:#5b6b7b;--line:#e3e8ee;--brand:#17a6a6;--brand2:#0f6f7a;--bg:#f5f7fa;--ok:#1f7a4d;--warn:#9a5b00}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 Inter,'Segoe UI',system-ui,-apple-system,Arial,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:28px 16px 60px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.logo{font-weight:800;letter-spacing:.5px;font-size:20px}.logo span{color:var(--brand)}
.tag{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--brand2);background:#e4f5f5;border-radius:999px;padding:5px 12px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px;margin:14px 0}
h1{font-size:24px;margin:0 0 6px}h2{font-size:17px;margin:0 0 12px;color:var(--brand2)}
.mut{color:var(--mut);font-size:13.5px}
table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid var(--line)}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr.tot td{border-bottom:0;font-weight:800;font-size:18px;padding-top:12px}
ul{padding-left:20px;margin:0}li{margin:8px 0}.why{color:var(--mut)}
.status{display:inline-block;font-weight:700;border-radius:999px;padding:4px 12px;font-size:13px;background:#eef2f6}
.status.paid{background:#e3f4ea;color:var(--ok)}.status.discuss{background:#fff3e0;color:var(--warn)}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
button{font:inherit;font-weight:700;border-radius:10px;padding:12px 18px;min-height:44px;cursor:pointer;border:1px solid var(--brand2)}
.pri{background:var(--brand2);color:#fff}.sec{background:#fff;color:var(--brand2)}button[disabled]{opacity:.55;cursor:default}
textarea{width:100%;min-height:96px;font:inherit;font-size:16px;border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:10px}
.note{margin-top:10px;font-size:14px}.err{color:#b03a2e}.ok{color:var(--ok)}
.foot{margin-top:24px;font-size:12px;color:var(--mut)}
@media print{.actions,#discussBox{display:none}}
</style></head><body><div class="wrap">
<div class="top"><div class="logo">DIGIT<span>2</span>AI</div><div class="tag">Propuesta técnico-comercial</div></div>
<div class="card">
  <h1>${esc(q.title)}</h1>
  <div class="mut">Para: ${who || '—'} · Fecha: ${esc(c.date || '')}</div>
  <div style="margin-top:10px"><span class="status ${esc(q.status)}">${esc(STATUS_TXT[q.status] || q.status)}</span></div>
  ${notice ? '<p class="note ' + (notice.ok ? 'ok' : '') + '">' + esc(notice.text) + '</p>' : ''}
</div>
<div class="card">
  <h2>Valor</h2>
  <table>
    <tr><td>Tiempo real de desarrollo${w.start && w.end ? '<div class="mut">Del ' + esc(w.start) + ' al ' + esc(w.end) + (w.commits ? ' · ' + esc(w.commits) + ' entregas registradas' : '') + '</div>' : ''}</td><td class="n">${esc(hours)} h</td></tr>
    <tr><td>Tarifa por hora</td><td class="n">${esc(usd(q.rate_cents))}</td></tr>
    <tr class="tot"><td>Total</td><td class="n">${esc(usd(q.amount_cents))}</td></tr>
  </table>
  <p class="mut">${esc(c.price_note || '')}</p>
</div>
<div class="card"><h2>Qué se construyó</h2><ul>${items}</ul></div>
<div class="card"><h2>Qué no incluye</h2><ul>${excl}</ul></div>
<div class="card" id="discussBox">
  <h2>Siguiente paso</h2>
  ${paid ? '<p class="ok"><b>Pago confirmado por Stripe.</b> Gracias.</p>' : `
  <div class="actions">
    <button class="pri" id="approveBtn" ${payments ? '' : 'disabled'}>${payments ? 'Aprobar y pagar ' + esc(usd(q.amount_cents)) : 'Aprobar: los pagos en línea no están configurados todavía'}</button>
    <button class="sec" id="discussBtn" type="button">Quiero discutirlo</button>
  </div>
  <p class="note err" id="payErr" hidden></p>
  <div id="discussForm" hidden>
    <textarea id="comment" maxlength="2000" placeholder="Cuéntanos qué quieres revisar o cambiar."></textarea>
    <div class="actions"><button class="pri" id="sendComment" type="button">Enviar comentario</button></div>
    <p class="note" id="commentMsg"></p>
  </div>`}
</div>
<div class="foot">Digit2AI · Esta cotización es privada: quien tenga este enlace puede verla. No incluye IVA ni cargos adicionales.</div>
</div>
<script>
(function(){
  var base = location.pathname.replace(/\\/+$/, '');
  function post(p, body){ return fetch(base + p, { method:'POST', headers:{'Content-Type':'application/json','X-Planea-Quote':'1'}, body: JSON.stringify(body||{}) }).then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ j._ok = r.ok; return j; }); }); }
  var ap = document.getElementById('approveBtn');
  if (ap) ap.addEventListener('click', function(){
    ap.disabled = true; ap.textContent = 'Abriendo el pago seguro…';
    post('/checkout').then(function(j){
      if (j._ok && j.url) { location.href = j.url; return; }
      var e = document.getElementById('payErr'); e.hidden = false; e.textContent = j.message || 'No se pudo abrir el pago.';
      ap.disabled = false; ap.textContent = 'Aprobar y pagar';
    });
  });
  var db = document.getElementById('discussBtn');
  if (db) db.addEventListener('click', function(){ document.getElementById('discussForm').hidden = false; document.getElementById('comment').focus(); });
  var sc = document.getElementById('sendComment');
  if (sc) sc.addEventListener('click', function(){
    var t = document.getElementById('comment').value.trim(), m = document.getElementById('commentMsg');
    if (!t) { m.textContent = 'Escribe tu comentario.'; return; }
    sc.disabled = true;
    post('/discuss', { comment: t }).then(function(j){ m.textContent = j._ok ? 'Recibido. Te contactaremos pronto.' : (j.message || 'No se pudo enviar.'); sc.disabled = !!j._ok; });
  });
})();
</script></body></html>`;
}

function notFound(res) {
  res.status(404).set('X-Robots-Tag', 'noindex, nofollow').type('html')
    .send('<!doctype html><meta name="robots" content="noindex"><title>No encontrada</title><body style="font-family:system-ui;padding:40px;color:#0b1b2b"><h1>Cotización no encontrada</h1><p>Revisa el enlace que recibiste.</p></body>');
}

function build({ db, stripe } = {}) {
  const getStripe = stripe || defaultStripe;
  const router = express.Router();
  const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Referrer-Policy', 'no-referrer'); next(); };
  const discussHits = new Map(); // token_hash -> [timestamps]
  const checkoutHits = new Map(); // token_hash -> [timestamps]
  const hookHits = new Map();     // ip -> [timestamps]
  function limited(map, key, max, windowMs) {
    const now = Date.now(), arr = (map.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { map.set(key, arr); return true; }
    arr.push(now); map.set(key, arr);
    if (map.size > 5000) map.clear(); // tope de memoria
    return false;
  }

  // ── Webhook de Stripe (cuerpo crudo registrado en src/app.js antes del parser global) ──
  router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const s = getStripe();
    if (!s) return res.status(503).json({ error: 'pagos_no_configurados' });
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    let event;
    try {
      const secret = process.env.PLANEA_QUOTE_WEBHOOK_SECRET;
      if (secret) event = s.webhooks.constructEvent(raw, req.headers['stripe-signature'], secret);
      else {
        // Sin secreto de firma: el cuerpo es solo una pista; el evento se le pide a Stripe.
        // Límite por IP: cada consulta usa la llave compartida de Stripe y su cuota.
        if (limited(hookHits, req.ip || 'x', 30, 60e3)) return res.status(429).json({ error: 'demasiadas' });
        const hint = JSON.parse(raw.toString('utf8'));
        // Todos los checkout de la cuenta llegan aquí (JobUp, Kancho...). Ignorar uno ajeno es
        // inofensivo, así que se descarta sin gastar una llamada a Stripe.
        const hm = hint && hint.data && hint.data.object && hint.data.object.metadata;
        if (hint && hint.type && (!hm || hm.kind !== 'planea_quote')) return res.json({ received: true, ignored: true });
        const id = hint && hint.id;
        if (!/^evt_[A-Za-z0-9]+$/.test(String(id || ''))) return res.status(400).json({ error: 'evento_invalido' });
        event = await s.events.retrieve(id);
      }
    } catch (e) { return res.status(400).json({ error: 'firma_o_evento_invalido' }); }
    if (!event || !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return res.json({ received: true, ignored: true });
    const obj = event.data && event.data.object;
    if (!obj || !obj.metadata || obj.metadata.kind !== 'planea_quote') return res.json({ received: true, ignored: true });
    try {
      const sq = db(); await ensure(sq);
      const session = await s.checkout.sessions.retrieve(obj.id); // la fuente es Stripe, no el cuerpo
      const qid = Number(session.metadata && session.metadata.quote_id);
      const [[q]] = await sq.query('SELECT id, amount_cents, currency, status, title FROM planea_quotes WHERE id = :id AND tenant_id = :t', { replacements: { id: qid || 0, t: tenant() } });
      if (!q) return res.status(404).json({ error: 'cotizacion_no_encontrada' });
      // Pago diferido (p. ej. ACH): la sesión se completa sin pagar; llegará async_payment_succeeded.
      if (session.payment_status !== 'paid') { await logEvent(sq, q.id, 'webhook_unpaid', { stripe_event: event.id, session: session.id }); return res.json({ received: true, ignored: 'unpaid' }); }
      const okPay = session.payment_status === 'paid' && session.amount_total === q.amount_cents && String(session.currency).toLowerCase() === q.currency
        && String(session.metadata.tenant_id) === String(tenant());
      if (!okPay) { await logEvent(sq, q.id, 'webhook_rejected', { stripe_event: event.id, payment_status: session.payment_status, amount_total: session.amount_total }); return res.status(400).json({ error: 'pago_no_coincide' }); }
      // Ya pagada con OTRA sesión: un segundo cobro. No se oculta: se registra y se avisa para reembolsar.
      if (q.status === 'paid') {
        const [[p]] = await sq.query("SELECT stripe_session_id FROM planea_quotes WHERE id = :id", { replacements: { id: q.id } });
        if (p && p.stripe_session_id && p.stripe_session_id !== session.id) {
          const [dup] = await sq.query("INSERT INTO planea_quote_events (tenant_id, quote_id, event, detail) VALUES (:t, :q, 'double_payment', CAST(:d AS JSONB)) RETURNING id",
            { replacements: { t: tenant(), q: q.id, d: JSON.stringify({ stripe_event: event.id, session: session.id, payment_intent: session.payment_intent || null }) } });
          if (dup.length) alertOwner('Planea: SEGUNDO pago de una cotización — reembolsar', 'La cotización "' + q.title + '" ya estaba pagada y Stripe confirmó otro pago (sesión ' + session.id + '). Reembólsalo desde Stripe.');
          return res.json({ received: true, duplicate: true });
        }
      }
      const t = await sq.transaction();
      try {
        const [ins] = await sq.query("INSERT INTO planea_quote_events (tenant_id, quote_id, event, detail) VALUES (:t, :q, 'paid', CAST(:d AS JSONB)) ON CONFLICT DO NOTHING RETURNING id",
          { replacements: { t: tenant(), q: q.id, d: JSON.stringify({ stripe_event: event.id, session: session.id, amount_total: session.amount_total }) }, transaction: t });
        if (ins.length) {
          await sq.query("UPDATE planea_quotes SET status = 'paid', paid_at = NOW(), stripe_session_id = :s, stripe_payment_intent = :pi WHERE id = :id AND tenant_id = :t",
            { replacements: { s: session.id, pi: typeof session.payment_intent === 'string' ? session.payment_intent : null, id: q.id, t: tenant() }, transaction: t });
        }
        await t.commit();
        if (ins.length && q.status !== 'paid') alertOwner('Planea: cotización pagada — ' + q.title, 'Stripe confirmó el pago de ' + usd(q.amount_cents) + ' para "' + q.title + '". Sesión ' + session.id + '.');
      } catch (e) { await t.rollback().catch(() => {}); throw e; }
      res.json({ received: true });
    } catch (e) { console.error('[planea-quote] webhook', e.message); res.status(500).json({ error: 'error_interno' }); }
  });

  router.use(noStore);

  router.get('/:token', async (req, res) => {
    try {
      const sq = db(); await ensure(sq);
      const q = await findByToken(sq, req.params.token);
      if (!q) return notFound(res);
      let notice = null;
      if (req.query.pago === 'ok' && q.status !== 'paid') notice = { text: 'Recibimos tu regreso desde Stripe. El pago se marca como confirmado solo cuando Stripe nos avisa; recarga esta página en unos minutos.' };
      if (req.query.pago === 'cancelado') notice = { text: 'El pago no se completó. Puedes intentarlo de nuevo cuando quieras.' };
      if (!req.query.pago) logEvent(sq, q.id, 'viewed', null).catch(() => {});
      res.type('html').send(page(q, { payments: !!getStripe(), notice }));
    } catch (e) { console.error('[planea-quote] page', e.message); res.status(500).send('Error'); }
  });

  // Aprobar: abre Stripe Checkout por el monto GUARDADO. El cuerpo de la petición no se lee.
  router.post('/:token/checkout', async (req, res) => {
    if (req.headers['x-planea-quote'] !== '1') return res.status(404).json({ error: 'not_found' });
    try {
      const sq = db(); await ensure(sq);
      const q = await findByToken(sq, req.params.token);
      if (!q) return res.status(404).json({ error: 'not_found' });
      if (q.status === 'paid') return res.status(409).json({ error: 'ya_pagada', message: 'Esta cotización ya está pagada.' });
      const s = getStripe();
      if (!s) return res.status(503).json({ error: 'pagos_no_configurados', message: 'Los pagos en línea no están configurados todavía. Escríbenos y lo resolvemos.' });
      // Un solo pago abierto a la vez: dos pestañas o dos toques no abren dos cobros.
      if (q.stripe_session_id) {
        try {
          const prev = await s.checkout.sessions.retrieve(q.stripe_session_id);
          if (prev && prev.status === 'open' && prev.url) return res.json({ url: prev.url, reused: true });
          if (prev && prev.status === 'complete') return res.status(409).json({ error: 'pago_en_proceso', message: 'Ya recibimos un pago y lo estamos confirmando. Recarga en unos minutos.' });
        } catch (e) { /* sesión vieja ilegible: se abre una nueva */ }
      }
      if (limited(checkoutHits, q.token_hash, 10, 3600e3)) return res.status(429).json({ error: 'demasiados', message: 'Demasiados intentos. Inténtalo más tarde.' });
      const url = BASE() + '/quote/' + req.params.token;
      const session = await s.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: q.currency, unit_amount: q.amount_cents, product_data: { name: q.title, description: Number(q.hours) + ' h x ' + usd(q.rate_cents) + '/h' } } }],
        metadata: { kind: 'planea_quote', quote_id: String(q.id), tenant_id: String(tenant()) },
        payment_intent_data: { metadata: { kind: 'planea_quote', quote_id: String(q.id) } },
        success_url: url + '?pago=ok',
        cancel_url: url + '?pago=cancelado',
      });
      await sq.query("UPDATE planea_quotes SET status = CASE WHEN status = 'paid' THEN status ELSE 'approved' END, approved_at = COALESCE(approved_at, NOW()), stripe_session_id = :s WHERE id = :id AND tenant_id = :t",
        { replacements: { s: session.id, id: q.id, t: tenant() } });
      await logEvent(sq, q.id, 'approved', { session: session.id, amount_cents: q.amount_cents });
      res.json({ url: session.url });
    } catch (e) { console.error('[planea-quote] checkout', e.message); res.status(502).json({ error: 'stripe', message: 'No se pudo abrir el pago. Inténtalo de nuevo.' }); }
  });

  // Quiero discutirlo: guarda el comentario y avisa al dueño.
  router.post('/:token/discuss', async (req, res) => {
    if (req.headers['x-planea-quote'] !== '1') return res.status(404).json({ error: 'not_found' });
    try {
      const sq = db(); await ensure(sq);
      const q = await findByToken(sq, req.params.token);
      if (!q) return res.status(404).json({ error: 'not_found' });
      const comment = String((req.body && req.body.comment) || '').replace(/[ --]/g, '').trim().slice(0, 2000);
      if (!comment) return res.status(400).json({ error: 'comentario_vacio', message: 'Escribe tu comentario.' });
      if (limited(discussHits, q.token_hash, 5, 3600e3)) return res.status(429).json({ error: 'demasiados', message: 'Recibimos varios comentarios; te contactaremos pronto.' });
      await sq.query("UPDATE planea_quotes SET status = CASE WHEN status = 'paid' THEN status ELSE 'discuss' END, discuss_comment = :c, discuss_at = NOW() WHERE id = :id AND tenant_id = :t",
        { replacements: { c: comment, id: q.id, t: tenant() } });
      await logEvent(sq, q.id, 'discuss', { comment });
      alertOwner('Planea: quieren discutir la cotización — ' + q.title, 'Comentario del cliente:\n\n' + comment + '\n\nCotización: ' + q.title + ' (' + usd(q.amount_cents) + ').');
      res.json({ ok: true });
    } catch (e) { console.error('[planea-quote] discuss', e.message); res.status(500).json({ error: 'error_interno' }); }
  });

  return router;
}

module.exports = { build, create, ensure, findByToken, hashToken, TOKEN_RE };
