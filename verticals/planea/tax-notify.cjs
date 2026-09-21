/* PLANEA — aviso por correo de la fecha de declaración de renta.
 *
 * A QUIÉN: solo a quien encendió "Próximas fechas tributarias" en Configuración
 * (finance_meta.notif.tributarias === true) y guardó los dos últimos dígitos de su cédula
 * en Impuestos. Nadie más recibe nada: el interruptor viene apagado.
 *
 * CUÁNDO: 30, 7 y 1 día antes de SU fecha (PLANEA_TAX_EMAIL_DAYS), desde las 8 a. m. hora
 * Colombia. Cada aviso sale UNA vez (planea_notifications, único por usuario/año/aviso) y
 * no hay "puesta al día": un aviso cuyo día ya pasó no se manda tarde.
 *
 * QUÉ FECHA: solo la de la tabla DIAN del año que Planea cargó y VALIDÓ en el módulo
 * administrativo (dian.cjs). Sin tabla validada no se envía correo ni se muestra fecha.
 *
 * QUÉ DICE: la fecha y de dónde sale. Nunca afirma que la persona esté obligada a
 * declarar ni calcula topes o valores (misma regla que Maya).
 *
 * DÓNDE CORRE: solo en producción (el .env local apunta a la misma base de datos).
 * PLANEA_TAX_EMAILS=off lo apaga; =on lo fuerza fuera de producción.
 */
'use strict';

const TICK_MS = 60 * 60 * 1000;
const SEND_HOUR = 8;
const tenant = () => Number(process.env.PLANEA_TENANT_ID) || 1;
const offsets = () => String(process.env.PLANEA_TAX_EMAIL_DAYS || '30,7,1').split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 120);
const PUBLIC_URL = () => String(process.env.PLANEA_PUBLIC_URL || 'https://planea.vip').replace(/\/+$/, '');

function enabled() {
  const v = String(process.env.PLANEA_TAX_EMAILS || '').toLowerCase();
  if (v === 'off') return false;
  return v === 'on' || process.env.NODE_ENV === 'production';
}
function hourColombia(now) {
  try { return +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }).format(now || new Date()); }
  catch (e) { return new Date(now || Date.now()).getUTCHours() - 5; }
}
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
function safeFirstName(n) { const f = String(n || '').trim().split(/\s+/)[0] || ''; return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'-]{1,40}$/.test(f) ? f : ''; }
function escHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function ensure(sq) {
  await sq.query(`CREATE TABLE IF NOT EXISTS planea_notifications (
    id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL DEFAULT 1, user_id INTEGER NOT NULL,
    kind TEXT NOT NULL, ref TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL,
    detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await sq.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_notif_once ON planea_notifications (tenant_id, user_id, kind, ref)');
}

// Qué avisos tocan hoy. Puro, para que la SIT lo pruebe sin base de datos ni correo.
function dueToday(people, table, todayIso, PlaneaTax, days) {
  const out = [];
  people.forEach((p) => {
    const fm = p.finance_meta || {};
    if (!fm.notif || fm.notif.tributarias !== true) return;
    const d = String((fm.tributario && fm.tributario.cedula2) || '').replace(/\D/g, '').slice(-2);
    if (d.length !== 2) return;
    const r = PlaneaTax.forDigits(d, table, +todayIso.slice(0, 4));
    if (!r || r.kind !== 'exacta') return;
    const left = daysBetween(todayIso, r.date);
    if ((days || offsets()).indexOf(left) < 0) return;
    out.push({ user_id: p.user_id, email: p.email, name: p.full_name, digits: d, date: r.date, label: r.label, days_left: left, ref: r.year + ':' + left });
  });
  return out;
}

function message(n, table) {
  const hola = safeFirstName(n.name);
  const when = n.days_left === 0 ? 'hoy' : n.days_left === 1 ? 'mañana' : 'en ' + n.days_left + ' días';
  const subject = 'Planea: tu fecha para declarar renta es ' + (n.days_left <= 1 ? when : 'el ' + n.label);
  const cfg = PUBLIC_URL() + '/planea/portal/configuracion';
  const lines = [
    (hola ? 'Hola ' + hola + ',' : 'Hola,'),
    'Según el calendario de la DIAN, la fecha límite para declarar renta (año gravable ' + ((table && table.tax_year) || (+n.date.slice(0, 4) - 1)) + ') para cédulas terminadas en ' + n.digits + ' es el ' + n.label + ' (' + when + ').',
    'Si debes declarar, ten listos tus soportes: ingresos, retenciones y deducciones. Si te ayuda un contador, avísale con tiempo.',
    'Fuente: ' + ((table && table.source) || 'calendario tributario DIAN') ,
    'Planea te recuerda fechas; no determina si estás obligado a declarar ni calcula valores. Es información educativa, no asesoría tributaria.',
    'Para dejar de recibir estos avisos, apaga "Próximas fechas tributarias" en ' + cfg,
  ];
  const html = '<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#0f231e">' +
    '<h2 style="color:#17a6a6;margin:0 0 12px">Planea</h2>' +
    lines.slice(0, 3).map((l) => '<p>' + escHtml(l) + '</p>').join('') +
    '<p><a href="' + escHtml(PUBLIC_URL() + '/planea/portal/impuestos') + '" style="display:inline-block;background:#17a6a6;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700">Ver mis impuestos</a></p>' +
    lines.slice(3).map((l) => '<p style="color:#607068;font-size:12.5px">' + escHtml(l) + '</p>').join('') + '</div>';
  return { subject, text: lines.join('\n\n'), html, unsubscribe: cfg };
}

async function sendEmail(to, msg) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return { ok: false, detail: 'sin SENDGRID_API_KEY' };
  const from = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'info@digit2ai.com';
  try {
    const sg = require('@sendgrid/mail'); sg.setApiKey(key);
    await sg.send({ to, from: { email: from, name: 'Planea' }, subject: msg.subject, text: msg.text, html: msg.html,
      headers: { 'List-Unsubscribe': '<' + msg.unsubscribe + '>' } });
    return { ok: true };
  } catch (e) { return { ok: false, detail: String(e.message || e).slice(0, 200) }; }
}

async function runOnce({ db, PlaneaTax, dianTable, send, now } = {}) {
  const sq = db(); if (!sq) return { skipped: 'no_db' };
  const table = await dianTable(); if (!table) return { skipped: 'no_table' };
  const today = PlaneaTax.todayColombia(now);
  await ensure(sq);
  const [people] = await sq.query(`SELECT p.user_id, u.email, u.full_name, p.finance_meta FROM planea_profiles p JOIN planea_users u ON u.id = p.user_id
     WHERE p.finance_meta->'notif'->>'tributarias' = 'true'`);
  const due = dueToday(people, table, today, PlaneaTax);
  let sent = 0, failed = 0;
  for (const n of due) {
    // Reclamar ANTES de enviar: dos instancias no mandan el mismo aviso dos veces.
    const [claim] = await sq.query(`INSERT INTO planea_notifications (tenant_id, user_id, kind, ref, channel, status)
       VALUES (:t, :u, 'tax_due', :r, 'email', 'sending') ON CONFLICT DO NOTHING RETURNING id`, { replacements: { t: tenant(), u: n.user_id, r: n.ref } });
    if (!claim.length) continue;
    const r = await (send || sendEmail)(n.email, message(n, table));
    await sq.query('UPDATE planea_notifications SET status = :s, detail = :d WHERE id = :id', { replacements: { s: r.ok ? 'sent' : 'failed', d: r.detail || null, id: claim[0].id } });
    if (r.ok) sent++; else failed++;
  }
  return { today, due: due.length, sent, failed };
}

let timer = null;
function start(deps) {
  if (!enabled() || timer) return false;
  const tick = () => {
    if (hourColombia() < SEND_HOUR) return;
    runOnce(deps).then((r) => { if (r && (r.sent || r.failed)) console.log('Planea avisos de renta:', JSON.stringify(r)); })
      .catch((e) => console.error('Planea avisos de renta:', e.message));
  };
  timer = setInterval(tick, TICK_MS); if (timer.unref) timer.unref();
  setTimeout(tick, 60 * 1000).unref?.();
  return true;
}
function status() { return { enabled: enabled(), running: !!timer, days: offsets(), hour: SEND_HOUR }; }

module.exports = { start, runOnce, dueToday, message, status, enabled, _ensure: ensure };
