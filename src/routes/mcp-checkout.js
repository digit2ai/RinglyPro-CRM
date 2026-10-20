'use strict';

/**
 * Digit2AI MCP Neural — Stripe checkout for the /mcp landing (digit2ai.com/MCP).
 *
 * POST /api/mcp-checkout/session   public, rate-limited -> { url } of a Stripe Checkout
 * GET  /api/mcp-checkout/status    ?session_id=cs_...  -> { paid } (a boolean, nothing else)
 * GET  /api/mcp-checkout/health    config only
 *
 * ONE Checkout in subscription mode with TWO lines: the $700 setup fee (one time) and
 * the $397/month subscription. Stripe bills both on the FIRST invoice, the day the
 * client pays (the contract day), and the subscription then renews monthly on that date.
 *
 * THE AMOUNTS LIVE HERE, NEVER IN THE REQUEST. The body is ignored apart from the
 * language; a client cannot change what they pay. Prices are inline price_data, so
 * there is no Stripe Product/Price to keep in step. Env overrides exist for both.
 *
 * Nothing is stored on our side: the payment, customer and subscription live in the
 * Digit2AI Stripe account (STRIPE_SECRET_KEY). No key = 503, never a fake URL.
 */

const express = require('express');
const router = express.Router();

const SETUP_USD = Number(process.env.MCP_SETUP_FEE_USD || 700);
const MONTHLY_USD = Number(process.env.MCP_MONTHLY_USD || 397);
const RETURN_BASE = (process.env.MCP_PUBLIC_URL || 'https://aiagent.ringlypro.com/mcp/').replace(/\/?$/, '/');

let stripeClient = null;
function stripe() {
  const key = process.env.MCP_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) stripeClient = require('stripe')(key);
  return stripeClient;
}

// In-memory, per instance: a public endpoint that mints Stripe sessions needs a ceiling.
const hits = new Map();
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 10;
  const arr = (hits.get(ip) || []).filter(t => now - t < win);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

router.get('/health', (req, res) => {
  res.json({ ok: true, stripe_configured: !!stripe(), setup_usd: SETUP_USD, monthly_usd: MONTHLY_USD });
});

router.post('/session', express.json({ limit: '2kb' }), async (req, res) => {
  try {
    const ip = String(req.headers['cf-connecting-ip'] || req.ip || '');
    if (limited(ip)) return res.status(429).json({ error: 'too_many_requests' });
    const s = stripe();
    if (!s) return res.status(503).json({ error: 'payments_not_configured' });
    const b = req.body || {};
    const lang = b.lang === 'en' ? 'en' : 'es';
    // References only: the lead this payment belongs to (Projects inbox id) and the
    // email to prefill. Neither can change the amount.
    const projectId = /^[0-9]{1,10}$/.test(String(b.project_id || '')) ? String(b.project_id) : null;
    const email = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,20}$/.test(String(b.email || '').trim()) ? String(b.email).trim() : undefined;

    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      locale: lang,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(MONTHLY_USD * 100),
            recurring: { interval: 'month' },
            product_data: {
              name: lang === 'en' ? 'Digit2AI MCP Neural - monthly subscription' : 'Digit2AI MCP Neural - suscripción mensual',
              description: lang === 'en'
                ? 'Use of the advanced AI and ecosystem maintenance, standard token usage.'
                : 'Uso de la inteligencia artificial avanzada y mantenimiento del ecosistema, consumo de tokens estándar.'
            }
          }
        },
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(SETUP_USD * 100),
            product_data: {
              name: lang === 'en' ? 'Digit2AI MCP Neural - initial setup (one time)' : 'Digit2AI MCP Neural - configuración inicial (pago único)'
            }
          }
        }
      ],
      customer_email: email,
      client_reference_id: projectId ? 'd2_project_' + projectId : undefined,
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      subscription_data: { metadata: { product: 'digit2ai_mcp_neural', d2_project_id: projectId || '' } },
      metadata: { product: 'digit2ai_mcp_neural', d2_project_id: projectId || '' },
      success_url: `${RETURN_BASE}?pago=ok&session_id={CHECKOUT_SESSION_ID}#precio`,
      cancel_url: `${RETURN_BASE}?pago=cancelado#precio`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[mcp-checkout] session error:', err && err.message);
    res.status(502).json({ error: 'checkout_failed' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const id = String(req.query.session_id || '');
    if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return res.status(400).json({ error: 'bad_session' });
    const s = stripe();
    if (!s) return res.status(503).json({ error: 'payments_not_configured' });
    const session = await s.checkout.sessions.retrieve(id);
    const ours = session && session.metadata && session.metadata.product === 'digit2ai_mcp_neural';
    res.json({ paid: !!(ours && session.payment_status === 'paid') });
  } catch (err) {
    res.status(404).json({ error: 'not_found' });
  }
});

// =====================================================================================
// SETUP MEETING — after a paid checkout the client books the configuration call.
//
// GET  /slots?session_id=cs_...   -> { slots:[iso...], booking:{start}|null, minutes }
// POST /book  { session_id, start } -> { booked:true, start }
//
// THE PAYMENT IS THE KEY. Both routes re-ask Stripe that the session is ours and paid;
// nothing in the browser is trusted. One meeting per paid session (the session id is
// written into the event and checked under an advisory lock, so two tabs cannot book
// twice). The event lands in the Projects calendar (d2_calendar_events, workspace 1),
// linked to the lead's project id from the session metadata. Slots: weekdays, 9:00 to
// 17:00 New York time, 60 minutes, at least MCP_BOOK_MIN_HOURS ahead, within
// MCP_BOOK_DAYS days, never over an existing event. Nothing is emailed from here.
// =====================================================================================

const BOOK_TZ = 'America/New_York';
const BOOK_MIN = Number(process.env.MCP_MEETING_MINUTES || 60);
const BOOK_DAYS = Number(process.env.MCP_BOOK_DAYS || 14);
const BOOK_MIN_HOURS = Number(process.env.MCP_BOOK_MIN_HOURS || 24);
const BOOK_HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

let d2db = null;
function db() {
  if (!d2db) d2db = require('../../digit2ai-projects/src/models').sequelize;
  return d2db;
}

// Offset of New York on a given calendar day, e.g. "-04:00".
function nyOffset(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: BOOK_TZ, timeZoneName: 'shortOffset' })
    .formatToParts(d).find(p => p.type === 'timeZoneName').value; // "GMT-4"
  const m = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return '-05:00';
  return `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}`;
}

function candidateSlots(now) {
  const out = [];
  const earliest = now.getTime() + BOOK_MIN_HOURS * 3600000;
  for (let i = 0; i <= BOOK_DAYS; i++) {
    const day = new Date(now.getTime() + i * 86400000);
    const ds = new Intl.DateTimeFormat('en-CA', { timeZone: BOOK_TZ }).format(day); // YYYY-MM-DD
    const wd = new Date(ds + 'T12:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const off = nyOffset(ds);
    for (const h of BOOK_HOURS) {
      const start = new Date(`${ds}T${String(h).padStart(2, '0')}:00:00${off}`);
      if (start.getTime() >= earliest) out.push(start);
    }
  }
  // unique (two loop days can map to the same NY date near midnight)
  const seen = new Set();
  return out.filter(d => (seen.has(d.getTime()) ? false : seen.add(d.getTime())));
}

async function paidSession(id) {
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) return { error: 400 };
  const s = stripe();
  if (!s) return { error: 503 };
  let session;
  try { session = await s.checkout.sessions.retrieve(id); } catch (e) { return { error: 404 }; }
  const ours = session && session.metadata && session.metadata.product === 'digit2ai_mcp_neural';
  if (!ours || session.payment_status !== 'paid') return { error: 402 };
  return { session };
}

const marker = id => `stripe_session:${id}`;

async function existingBooking(id, t) {
  const rows = await db().query(
    `SELECT id, start_time FROM d2_calendar_events
      WHERE workspace_id = 1 AND description LIKE :m ORDER BY id LIMIT 1`,
    { replacements: { m: `%${marker(id)}%` }, type: require('sequelize').QueryTypes.SELECT, transaction: t, logging: false });
  return rows[0] || null;
}

async function freeSlots(t) {
  const now = new Date();
  const cands = candidateSlots(now);
  if (!cands.length) return [];
  const busy = await db().query(
    `SELECT start_time, COALESCE(end_time, start_time + INTERVAL '30 minutes') AS end_time
       FROM d2_calendar_events
      WHERE workspace_id = 1 AND start_time < :hi
        AND COALESCE(end_time, start_time + INTERVAL '30 minutes') > :lo`,
    { replacements: { lo: cands[0].toISOString(), hi: new Date(cands[cands.length - 1].getTime() + BOOK_MIN * 60000).toISOString() },
      type: require('sequelize').QueryTypes.SELECT, transaction: t, logging: false });
  return cands.filter(s => {
    const a = s.getTime(), b = a + BOOK_MIN * 60000;
    return !busy.some(e => new Date(e.start_time).getTime() < b && new Date(e.end_time).getTime() > a);
  });
}

const STATUS = { 400: 'bad_session', 402: 'not_paid', 404: 'not_found', 503: 'payments_not_configured' };

router.get('/slots', async (req, res) => {
  try {
    const id = String(req.query.session_id || '');
    const p = await paidSession(id);
    if (p.error) return res.status(p.error).json({ error: STATUS[p.error] });
    const booking = await existingBooking(id);
    if (booking) return res.json({ booking: { start: new Date(booking.start_time).toISOString() }, slots: [], minutes: BOOK_MIN });
    const slots = await freeSlots();
    res.json({ booking: null, slots: slots.map(d => d.toISOString()), minutes: BOOK_MIN, timezone: BOOK_TZ });
  } catch (err) {
    console.error('[mcp-checkout] slots error:', err && err.message);
    res.status(500).json({ error: 'slots_failed' });
  }
});

router.post('/book', express.json({ limit: '2kb' }), async (req, res) => {
  const ip = String(req.headers['cf-connecting-ip'] || req.ip || '');
  if (limited('book:' + ip)) return res.status(429).json({ error: 'too_many_requests' });
  const b = req.body || {};
  const id = String(b.session_id || '');
  const startIso = String(b.start || '');
  const p = await paidSession(id).catch(() => ({ error: 404 }));
  if (p.error) return res.status(p.error).json({ error: STATUS[p.error] });
  const start = new Date(startIso);
  if (isNaN(start.getTime())) return res.status(400).json({ error: 'bad_start' });

  const t = await db().transaction();
  try {
    // One booking at a time across instances; serialises the free-slot check + insert.
    await db().query('SELECT pg_advisory_xact_lock(:k)', { replacements: { k: 7240611 }, transaction: t, logging: false });
    const prior = await existingBooking(id, t);
    if (prior) { await t.commit(); return res.json({ booked: true, already: true, start: new Date(prior.start_time).toISOString() }); }
    const free = await freeSlots(t);
    if (!free.some(s => s.getTime() === start.getTime())) { await t.rollback(); return res.status(409).json({ error: 'slot_taken' }); }

    const cd = p.session.customer_details || {};
    const name = String(cd.name || '').slice(0, 120);
    const pid = /^[0-9]{1,10}$/.test(String(p.session.metadata.d2_project_id || '')) ? Number(p.session.metadata.d2_project_id) : null;
    const description = [
      'Reunión de configuración de Digit2AI MCP Neural (cliente pagado en Stripe).',
      name ? `Cliente: ${name}` : null,
      cd.email ? `Correo: ${cd.email}` : null,
      cd.phone ? `Teléfono: ${cd.phone}` : null,
      pid ? `Lead (Projects): #${pid}` : null,
      marker(id)
    ].filter(Boolean).join('\n');
    const end = new Date(start.getTime() + BOOK_MIN * 60000);
    await db().query(
      `INSERT INTO d2_calendar_events
         (workspace_id, project_id, title, description, event_type, start_time, end_time, all_day, language, created_at, updated_at)
       VALUES (1, :pid, :title, :description, 'meeting', :s, :e, false, :lang, NOW(), NOW())`,
      { replacements: { pid, title: `Configuración MCP Neural: ${name || cd.email || 'cliente'}`.slice(0, 500), description,
          s: start.toISOString(), e: end.toISOString(), lang: b.lang === 'en' ? 'en' : 'es' }, transaction: t, logging: false });
    await t.commit();
    res.json({ booked: true, start: start.toISOString() });
  } catch (err) {
    try { await t.rollback(); } catch (_) {}
    console.error('[mcp-checkout] book error:', err && err.message);
    res.status(500).json({ error: 'book_failed' });
  }
});

module.exports = router;
module.exports._test = { candidateSlots, nyOffset, setStripe: c => { stripeClient = c; } };
