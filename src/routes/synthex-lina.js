'use strict';
/**
 * Lina, the Synthex SAI virtual assistant: her booking tools and her training.
 *
 * Mounted at /api/synthex-lina. Three parts:
 *
 *   GET  /slots    free meeting times (tool, loopback only)
 *   POST /book     books the meeting into the Digit2AI calendar (tool, loopback only)
 *   /entrenar      the owner's training page + API (the owner's Projects email and password)
 *
 * THE TOOLS ANSWER ONLY THE VOICE BRAIN. src/routes/voice-agent.js runs a pack's
 * tools by HTTP back to 127.0.0.1, with no proxy header. A request from the
 * internet always arrives through Render's proxy and carries x-forwarded-for,
 * so /slots and /book refuse it with 404. Nobody can book or read the calendar
 * by calling this route directly; the only way in is a conversation with Lina,
 * which is rate-limited per visitor IP by the voice route.
 *
 * THE FREE-SLOT RULE IS NOT COPIED. It comes from routes/mcp-checkout.js
 * (weekdays, afternoons only: 12 to 17 New York time, 60 minutes, never over an existing event,
 * the owner's Google Calendar included), so a meeting Lina books can never
 * land on one booked from the /mcp checkout, and vice versa.
 *
 * A CONFIRMATION EMAIL GOES OUT AFTER THE COMMIT (services/synthexNotify.js, SendGrid,
 * Synthex SAI branding) to the visitor, plus an alert to the owner. The meeting
 * appears in the Projects calendar (workspace 1). /public/* serves the demo form.
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { QueryTypes } = require('sequelize');

const router = express.Router();
const booking = () => require('./mcp-checkout')._booking;
const db = () => booking().db();

const LABEL_TZ = process.env.SYNTHEX_BOOK_TZ || 'America/Caracas';
const PER_DAY = Number(process.env.SYNTHEX_BOOK_PER_DAY || 20);
const KB_MAX = Number(process.env.SYNTHEX_LINA_KB_MAX_CHARS || 20000);
const TENANT = 1;

// ── loopback gate ─────────────────────────────────────────────────────────
function fromVoiceBrain(req) {
  const a = String((req.socket && req.socket.remoteAddress) || '');
  const loop = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  return loop && !req.headers['x-forwarded-for'] && !req.headers['cf-connecting-ip'];
}
function onlyBrain(req, res, next) {
  if (!fromVoiceBrain(req)) return res.status(404).json({ error: 'not_found' });
  next();
}

// ── tables ────────────────────────────────────────────────────────────────
let ready = null;
function ensureTables() {
  if (!ready) {
    ready = db().query(`
      CREATE TABLE IF NOT EXISTS synthex_lina_kb (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        titulo VARCHAR(200) NOT NULL,
        contenido TEXT NOT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_synthex_lina_kb_tenant ON synthex_lina_kb (tenant_id, activo);
    `, { logging: false }).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

// ── knowledge the brain reads on every turn ───────────────────────────────
let kbCache = { at: 0, text: '' };
async function trainedKnowledge() {
  if (Date.now() - kbCache.at < 60000) return kbCache.text;
  try {
    await ensureTables();
    const rows = await db().query(
      'SELECT titulo, contenido FROM synthex_lina_kb WHERE tenant_id = :t AND activo ORDER BY id',
      { replacements: { t: TENANT }, type: QueryTypes.SELECT, logging: false });
    const text = rows.map((r) => `${r.titulo}\n${r.contenido}`).join('\n\n').slice(0, KB_MAX);
    kbCache = { at: Date.now(), text };
  } catch (e) {
    console.error('[synthex-lina] knowledge read failed:', e.message);
    kbCache = { at: Date.now(), text: kbCache.text };
  }
  return kbCache.text;
}

/** Base knowledge (code) + the owner's training (DB). Training goes last and wins. */
async function knowledgeFor(lang) {
  const base = require('../config/synthex-knowledge');
  const trained = await trainedKnowledge();
  const b = lang === 'en' ? base.en : base.es;
  if (!trained) return b;
  const h = lang === 'en'
    ? 'OWNER TRAINING (newest; where it disagrees with the above, this wins)'
    : 'ENTRENAMIENTO DEL DUEÑO (lo más reciente; donde contradiga lo anterior, manda esto)';
  return `${b}\n\n${h}\n${trained}`;
}

// ── slots ─────────────────────────────────────────────────────────────────
function label(iso, lang) {
  const d = new Date(iso);
  const loc = lang === 'en' ? 'en-US' : 'es-VE';
  const s = new Intl.DateTimeFormat(loc, {
    timeZone: LABEL_TZ, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true
  }).format(d);
  return s;
}

router.get('/slots', onlyBrain, async (req, res) => {
  try {
    const lang = req.query.lang === 'en' ? 'en' : 'es';
    const free = await booking().freeSlots();
    const days = booking().threeByThree(free, new Date().toISOString().slice(0, 10));
    const opciones = [];
    days.forEach((d) => d.slots.forEach((iso) => opciones.push({ start: iso, texto: label(iso, lang) })));
    res.json({
      ok: true,
      zona_horaria: LABEL_TZ,
      duracion_minutos: booking().BOOK_MIN,
      opciones,
      nota: opciones.length
        ? 'Ofrece dos o tres de estas opciones en palabras. Para agendar, pasa el campo start EXACTO de la elegida.'
        : 'No hay horarios libres en los próximos días. Ofrece que el equipo lo contacte.'
    });
  } catch (e) {
    console.error('[synthex-lina] slots error:', e.message);
    res.json({ ok: false, error: 'no se pudieron leer los horarios' });
  }
});

// ── savings estimate: the SAME arithmetic as the calculator on synthexsai.com ──
// hours/month = people x hours/week x 52 / 12; value = freed hours x hourly cost;
// difference = value - the USD 388 subscription. Lina never does this math herself:
// a model that multiplies in its head is a model that quotes a wrong saving.
const SUBSCRIPTION = 388;
function estimate(b) {
  const n = (v) => Number(String(v == null ? '' : v).replace(/[^0-9.,-]/g, '').replace(',', '.'));
  const personas = n(b.personas), horas = n(b.horas_semana), costo = n(b.costo_hora);
  let pct = n(b.porcentaje_automatizado);
  const supuesto = !isFinite(pct) || pct <= 0;
  if (supuesto) pct = 50;
  if (pct > 0 && pct <= 1) pct *= 100;
  const bad = [];
  if (!(personas >= 1 && personas <= 1000)) bad.push('personas');
  if (!(horas >= 1 && horas <= 80)) bad.push('horas_semana');
  if (!(costo > 0 && costo <= 1000)) bad.push('costo_hora');
  if (!(pct >= 5 && pct <= 90)) bad.push('porcentaje_automatizado');
  if (bad.length) return { ok: false, error: 'faltan o no son válidos: ' + bad.join(', '), nota: 'Pide solo esos datos.' };
  const hrsMes = personas * horas * 52 / 12;
  const manual = hrsMes * costo, libres = hrsMes * pct / 100, valor = libres * costo, dif = valor - SUBSCRIPTION;
  const r = (x) => Math.round(x);
  return {
    ok: true,
    datos: { personas, horas_semana: horas, costo_hora: costo, porcentaje_automatizado: pct, porcentaje_es_supuesto: supuesto },
    horas_manuales_mes: r(hrsMes),
    costo_manual_mes_usd: r(manual),
    horas_liberadas_mes: r(libres),
    valor_horas_liberadas_mes_usd: r(valor),
    suscripcion_mes_usd: SUBSCRIPTION,
    diferencia_mes_usd: r(dif),
    diferencia_anual_usd: r(dif * 12),
    nota: 'Es un estimado con los datos de la persona; el porcentaje automatizado es un supuesto y el diagnóstico lo mide con su operación real. Di las cifras en palabras y redondeadas. Si la diferencia es negativa, dilo con honestidad (el valor está en las horas que se liberan para crecer) y no la maquilles.'
  };
}

router.post('/calc', onlyBrain, express.json({ limit: '2kb' }), (req, res) => res.json(estimate(req.body || {})));

// ── book ──────────────────────────────────────────────────────────────────
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

function validate(b) {
  const nombre = clean(b.nombre, 80);
  const email = clean(b.email, 160).toLowerCase();
  const telefono = clean(b.telefono, 30);
  const empresa = clean(b.empresa, 120);
  const tema = clean(b.tema, 400);
  const errores = [];
  if (!/^[\p{L}][\p{L}' .-]{1,79}$/u.test(nombre)) errores.push('nombre');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) errores.push('email');
  const digits = telefono.replace(/\D/g, '');
  if (!/^[+()\d\s.-]{7,30}$/.test(telefono) || digits.length < 7 || digits.length > 15) errores.push('telefono');
  if (empresa && !/^[\p{L}\p{N}' .,&()-]{1,120}$/u.test(empresa)) errores.push('empresa');
  if (b.confirmado !== true) errores.push('confirmado');
  return { nombre, email, telefono, empresa, tema, errores };
}

// One booking path for Lina and for the demo form. Returns the tool-shaped result
// the model reads; the page reads the same object.
// brand: 'synthex' (synthexsai.com + Lina) or 'digit2ai' (the digit2ai.com/presentacion deck).
// Same calendar, same free-slot rule; only the calendar wording, the marker and the email change.
const BRAND_TAG = { synthex: 'synthex_lina:', digit2ai: 'd2ai_deck:' };
async function bookMeeting(v, startRaw, lang, origen, tz, brand, source) {
  brand = brand === 'digit2ai' ? 'digit2ai' : 'synthex';
  const tag = BRAND_TAG[brand];
  const start = new Date(String(startRaw || ''));
  if (isNaN(start.getTime())) return { booked: false, error: 'horario inválido: consulta horarios_disponibles y usa un start exacto' };
  const marker = tag + crypto.createHash('sha256').update(v.email).digest('hex').slice(0, 16);
  const t = await db().transaction();
  try {
    await db().query('SELECT pg_advisory_xact_lock(:k)', { replacements: { k: 7240611 }, transaction: t, logging: false });

    // One upcoming meeting per email: a second request returns the first.
    const prior = await db().query(
      `SELECT start_time FROM d2_calendar_events
        WHERE workspace_id = 1 AND description LIKE :m AND start_time > NOW() ORDER BY start_time LIMIT 1`,
      { replacements: { m: `%${marker}%` }, type: QueryTypes.SELECT, transaction: t, logging: false });
    if (prior.length) {
      await t.commit();
      const iso = new Date(prior[0].start_time).toISOString();
      return { booked: true, already: true, start: iso, texto: label(iso, lang) };
    }

    const today = await db().query(
      `SELECT COUNT(*)::int AS n FROM d2_calendar_events
        WHERE workspace_id = 1 AND description LIKE :tag AND created_at > NOW() - INTERVAL '1 day'`,
      { replacements: { tag: `%${tag}%` }, type: QueryTypes.SELECT, transaction: t, logging: false });
    if ((today[0] && today[0].n) >= PER_DAY) {
      await t.rollback();
      return { booked: false, error: 'límite diario de reuniones alcanzado', nota: 'Ofrece que el equipo lo contacte por correo.' };
    }

    const free = await booking().freeSlots(t);
    if (!free.some((s) => s.getTime() === start.getTime())) {
      await t.rollback();
      return { booked: false, error: 'ese horario ya no está libre', nota: 'Consulta horarios_disponibles otra vez y ofrece otras opciones.' };
    }

    const end = new Date(start.getTime() + booking().BOOK_MIN * 60000);
    const description = [
      brand === 'digit2ai'
        ? `Reunión con Digit2AI, agendada desde ${source || 'la presentación narrada (digit2ai.com/presentacion)'}.`
        : origen === 'lina'
        ? 'Reunión con los agentes especializados de Synthex SAI, agendada por Lina (asistente virtual en synthexsai.com).'
        : source ? `Reunión con los agentes especializados de Synthex SAI, agendada desde ${source}.`
        : 'Reunión con los agentes especializados de Synthex SAI, agendada desde el formulario «Agendar demostración» de synthexsai.com.',
      `Nombre: ${v.nombre}`,
      v.empresa ? `Empresa: ${v.empresa}` : null,
      `Correo: ${v.email}`,
      `Teléfono: ${v.telefono}`,
      v.tema ? `Tema: ${v.tema}` : null,
      marker
    ].filter(Boolean).join('\n');
    await db().query(
      `INSERT INTO d2_calendar_events
         (workspace_id, project_id, title, description, event_type, start_time, end_time, all_day, language, created_at, updated_at)
       VALUES (1, NULL, :title, :description, 'meeting', :s, :e, false, :lang, NOW(), NOW())`,
      { replacements: { title: `${brand === 'digit2ai' ? 'Digit2AI' : 'Synthex SAI'}: ${v.nombre}${v.empresa ? ' (' + v.empresa + ')' : ''}`.slice(0, 500),
          description, s: start.toISOString(), e: end.toISOString(), lang },
        transaction: t, logging: false });
    await t.commit();
    const iso = start.toISOString();
    // The confirmation goes out after the commit: a mail hiccup never undoes a booking.
    const mail = await require('../services/synthexNotify').bookingConfirmed({
      ...v, start: iso, lang, tz, origen, brand, source, minutes: booking().BOOK_MIN
    }).catch((e) => ({ sent: false, reason: e.message }));
    return { booked: true, start: iso, texto: label(iso, lang), zona_horaria: LABEL_TZ, correo_enviado: !!mail.sent };
  } catch (e) {
    try { await t.rollback(); } catch (_) {}
    console.error('[synthex-lina] book error:', e.message);
    return { booked: false, error: 'no se pudo guardar la reunión' };
  }
}

router.post('/book', onlyBrain, express.json({ limit: '4kb' }), async (req, res) => {
  const b = req.body || {};
  const v = validate(b);
  if (v.errores.length) {
    return res.json({
      booked: false,
      error: 'datos incompletos o inválidos: ' + v.errores.join(', '),
      nota: 'Pide de nuevo SOLO esos datos y confírmalos con la persona antes de reintentar.'
    });
  }
  res.json(await bookMeeting(v, b.start, b.lang === 'en' ? 'en' : 'es', 'lina', null));
});

// ── the demo form on synthexsai.com (public) ───────────────────────────────
// The visitor picks one of the free times shown and clicks: that click IS the
// confirmation. Public, so: a per-IP ceiling, the daily cap, one upcoming meeting
// per email, and the same validation as Lina's tool. The email it sends has fixed
// wording; the visitor's own text only appears escaped (their name).
const hits = new Map();
function limited(key, max) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((x) => now - x < 3600000);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, a] of hits) if (!a.some((x) => now - x < 3600000)) hits.delete(k);
  return false;
}
const ipOf = (req) => String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || '').trim();

router.get('/public/slots', async (req, res) => {
  if (limited('slots:' + ipOf(req), 60)) return res.status(429).json({ ok: false, error: 'too_many_requests' });
  try {
    const free = await booking().freeSlots();
    const days = booking().threeByThree(free, ipOf(req) + new Date().toISOString().slice(0, 10));
    res.json({ ok: true, minutes: booking().BOOK_MIN, days });
  } catch (e) {
    console.error('[synthex-lina] public slots error:', e.message);
    res.status(500).json({ ok: false, error: 'slots_failed' });
  }
});

router.post('/public/book', express.json({ limit: '4kb' }), async (req, res) => {
  if (limited('book:' + ipOf(req), 5)) return res.status(429).json({ booked: false, error: 'too_many_requests' });
  const b = req.body || {};
  const v = validate({ ...b, confirmado: true });
  if (v.errores.length) return res.status(400).json({ booked: false, error: 'invalid', fields: v.errores });
  const tz = /^[A-Za-z_]+\/[A-Za-z_\/-]+$/.test(String(b.tz || '')) ? String(b.tz).slice(0, 64) : null;
  // Where the button was (book-meeting.js sends host + path). Only URL-ish characters survive.
  const source = String(b.source || '').replace(/[^A-Za-z0-9.\/_-]/g, '').slice(0, 120) || null;
  const r = await bookMeeting(v, b.start, b.lang === 'en' ? 'en' : 'es', 'form', tz, b.brand === 'digit2ai' ? 'digit2ai' : 'synthex', source);
  res.status(r.booked ? 200 : (/libre/.test(r.error || '') ? 409 : 400)).json({ booked: r.booked, already: !!r.already, start: r.start, email_sent: !!r.correo_enviado, error: r.booked ? undefined : (/libre/.test(r.error || '') ? 'slot_taken' : 'not_booked') });
});

// ── training (owner only) ─────────────────────────────────────────────────
// The owner signs in with the SAME email and password as aiagent.ringlypro.com/projects
// (the CRM users table, bcrypt), and only emails in SYNTHEX_LINA_OWNER_EMAILS may enter.
// Basic auth: the browser asks once and remembers it for the tab. Ten failed tries per IP
// in 15 minutes and the door closes for that IP.
const OWNERS = () => String(process.env.SYNTHEX_LINA_OWNER_EMAILS || 'mstagg@digit2ai.com')
  .split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
const failed = new Map();
let crmLookup = async (email) => {
  const rows = await require('../config/database').query(
    'SELECT password_hash FROM users WHERE LOWER(email) = :e LIMIT 1',
    { replacements: { e: email }, type: QueryTypes.SELECT, logging: false });
  return rows[0] && rows[0].password_hash;
};
const DUMMY = '$2a$12$abcdefghijklmnopqrstuuJcB6W6fK3k0n1i3m3e0YcJ9mL0pQkS.';
async function ownerOnly(req, res, next) {
  const ip = String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || '').trim();
  const now = Date.now();
  const tries = (failed.get(ip) || []).filter((t) => now - t < 900000);
  const ask = (code, msg) => {
    res.set('WWW-Authenticate', 'Basic realm="Entrenar a Lina (usa tu acceso de Projects)", charset="UTF-8"');
    return res.status(code).type('text').send(msg);
  };
  if (tries.length >= 10) return res.status(429).type('text').send('Demasiados intentos. Espera 15 minutos.');
  const h = String(req.headers.authorization || '');
  let email = '', pass = '';
  if (h.startsWith('Basic ')) {
    const raw = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const k = raw.indexOf(':'); email = raw.slice(0, k).trim().toLowerCase(); pass = raw.slice(k + 1);
  }
  if (!email || !pass) return ask(401, 'Inicia sesión con tu correo y contraseña de Projects.');
  let ok = false;
  try {
    const bcrypt = require('bcryptjs');
    const hash = OWNERS().includes(email) ? await crmLookup(email) : null;
    ok = await bcrypt.compare(pass, hash || DUMMY) && !!hash;
  } catch (e) {
    console.error('[synthex-lina] sign-in check failed:', e.message);
    return res.status(503).type('text').send('No se pudo comprobar el acceso. Intenta de nuevo.');
  }
  if (!ok) { tries.push(now); failed.set(ip, tries); return ask(401, 'Correo o contraseña incorrectos.'); }
  failed.delete(ip);
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  next();
}

router.get('/entrenar', ownerOnly, (req, res) => {
  res.sendFile(path.join(__dirname, '../views/synthex-lina-entrenar.html'));
});

router.get('/entrenar/api', ownerOnly, async (req, res) => {
  try {
    await ensureTables();
    const rows = await db().query(
      'SELECT id, titulo, contenido, activo, updated_at FROM synthex_lina_kb WHERE tenant_id = :t ORDER BY activo DESC, id DESC',
      { replacements: { t: TENANT }, type: QueryTypes.SELECT, logging: false });
    const used = rows.filter((r) => r.activo).reduce((n, r) => n + r.titulo.length + r.contenido.length + 2, 0);
    res.json({ ok: true, entradas: rows, usado: used, limite: KB_MAX, base: require('../config/synthex-knowledge').es });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/entrenar/api', ownerOnly, express.json({ limit: '64kb' }), async (req, res) => {
  if (req.get('X-Synthex') !== '1') return res.status(404).end();
  const titulo = clean(req.body && req.body.titulo, 200);
  const contenido = String((req.body && req.body.contenido) || '').replace(/\u0000/g, '').trim().slice(0, 8000);
  const id = Number(req.body && req.body.id) || null;
  if (!titulo || !contenido) return res.status(400).json({ ok: false, error: 'Falta el título o el contenido.' });
  try {
    await ensureTables();
    const rows = await db().query(
      'SELECT id, titulo, contenido FROM synthex_lina_kb WHERE tenant_id = :t AND activo',
      { replacements: { t: TENANT }, type: QueryTypes.SELECT, logging: false });
    const used = rows.filter((r) => r.id !== id).reduce((n, r) => n + r.titulo.length + r.contenido.length + 2, 0);
    if (used + titulo.length + contenido.length + 2 > KB_MAX) {
      return res.status(400).json({ ok: false, error: `No cabe: Lina lee todo su entrenamiento en cada respuesta y el límite es ${KB_MAX} caracteres. Acorta o desactiva otra entrada.` });
    }
    if (id) {
      await db().query('UPDATE synthex_lina_kb SET titulo = :titulo, contenido = :contenido, activo = true, updated_at = NOW() WHERE id = :id AND tenant_id = :t',
        { replacements: { titulo, contenido, id, t: TENANT }, logging: false });
    } else {
      await db().query('INSERT INTO synthex_lina_kb (tenant_id, titulo, contenido) VALUES (:t, :titulo, :contenido)',
        { replacements: { titulo, contenido, t: TENANT }, logging: false });
    }
    kbCache.at = 0;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/entrenar/api/:id/activo', ownerOnly, express.json({ limit: '1kb' }), async (req, res) => {
  if (req.get('X-Synthex') !== '1') return res.status(404).end();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
  try {
    await ensureTables();
    await db().query('UPDATE synthex_lina_kb SET activo = :a, updated_at = NOW() WHERE id = :id AND tenant_id = :t',
      { replacements: { a: !!(req.body && req.body.activo), id, t: TENANT }, logging: false });
    kbCache.at = 0;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'synthex-lina', training_owners: OWNERS().length, label_tz: LABEL_TZ });
});

module.exports = router;
module.exports.knowledgeFor = knowledgeFor;
module.exports._test = { estimate, validate, fromVoiceBrain, label, setCrmLookup: (f) => { crmLookup = f; } };
