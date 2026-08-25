'use strict';

// =============================================================
// "You never finished your account."
//
// THE FUNNEL HAD NO WAY BACK. A visitor uploads a résumé, watches the teaser
// build, and lands on /build?t=<token> to set a password and say what to hunt
// for. If they close the tab there, that token exists in exactly one place —
// the browser history of a tab they closed. Nothing is emailed when a teaser
// finishes (see routes/intake.js POST /teaser: the token is returned to the
// page and nowhere else), so the preview we spent model tokens building, and
// the half-made account behind it, are unreachable forever and the person is
// never told anything at all.
//
// Measured on production the day this was written: 23 ready teasers, 13
// completed accounts, 9 distinct people with a finished preview and no account.
//
// WHAT IS AND IS NOT DECIDED HERE
//
//   * "Unfinished" is DERIVED at send time, never stored as a flag. The one
//     thing that must never happen is mailing "you didn't finish" to somebody
//     who finished — so completion is re-read from the live subscriber row in
//     the moment before sending, not from a snapshot taken when the batch was
//     assembled. Same rule the marketing layers here follow for consent.
//
//   * DEDUPED BY PERSON, NOT BY ROW. One tester has four teasers. Four rows is
//     four emails, which is how a helpful reminder becomes spam.
//
//   * TWO REMINDERS, THEN SILENCE. Not a drip campaign. Someone who ignored two
//     emails has answered the question.
//
//   * A BACKFILL CEILING. Turning this on must not cold-mail everyone who ever
//     abandoned a preview; a reminder about something you did three months ago
//     reads as a breach, not a nudge. Anything older than
//     JOBUP_FINISH_MAX_AGE_DAYS is left alone permanently.
//
//   * ONE CLICK STOPS IT, and it stops it for the ADDRESS, not the row — the
//     opt-out is worthless if their other three teasers keep mailing.
// =============================================================

const crypto = require('crypto');
const { models } = require('../models');
const mailer = require('./mailer');

const MAX_REMINDERS = 2;
// First nudge an hour later — long enough that it is not chasing someone who is
// still on the page, short enough that they remember doing it.
const FIRST_AFTER_HOURS = parseFloat(process.env.JOBUP_FINISH_FIRST_HOURS || '1');
const SECOND_AFTER_HOURS = parseFloat(process.env.JOBUP_FINISH_SECOND_HOURS || '48');
const MAX_AGE_DAYS = parseInt(process.env.JOBUP_FINISH_MAX_AGE_DAYS || '14', 10);
const PER_RUN_CAP = parseInt(process.env.JOBUP_FINISH_PER_RUN || '25', 10);

function enabled() { return process.env.JOBUP_FINISH_REMINDERS_GO === '1'; }
function baseUrl() { return (process.env.JOBUP_PUBLIC_URL || 'https://jobup.dev').replace(/\/$/, ''); }

/**
 * The stop token for an address.
 *
 * Derived from the email plus the app secret rather than stored, so there is no
 * new column and no way to enumerate one address's token from another's. It is
 * a one-click unsubscribe on a transactional nudge, not a credential: it grants
 * the ability to stop mail, and nothing else.
 */
function stopToken(email) {
  const secret = process.env.JOBUP_JWT_SECRET || process.env.JWT_SECRET || 'dev-only-insecure-secret';
  return crypto.createHmac('sha256', secret)
    .update(`finish-stop:${String(email || '').trim().toLowerCase()}`)
    .digest('base64url').slice(0, 32);
}
function stopTokenValid(email, token) {
  const a = Buffer.from(stopToken(email));
  const b = Buffer.from(String(token || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hoursSince(d) {
  if (!d) return Infinity;
  return (Date.now() - new Date(d).getTime()) / 3600000;
}

/** When reminder number `n` (1-based) becomes due, in hours after the preview. */
function dueAfterHours(n) {
  return n === 1 ? FIRST_AFTER_HOURS : SECOND_AFTER_HOURS;
}

/**
 * Everyone with a finished preview and no finished account.
 *
 * Returns one entry per PERSON — their newest ready teaser — annotated with
 * what has already been sent and whether another reminder is due now. Pure
 * reads; sends nothing. This is also what the admin preview renders, so the
 * owner can see the leak without triggering mail.
 */
async function pending({ includeNotDue = false } = {}) {
  const teasers = await models.teasers.findAll({ where: { status: 'ready' } });

  // Newest ready teaser per address. The newest is the one whose token still
  // matches what they last saw, and its build is the one worth linking to.
  const byEmail = new Map();
  for (const t of teasers) {
    const email = String(t.email || '').trim().toLowerCase();
    if (!email) continue;                       // nothing to reach them at
    const prev = byEmail.get(email);
    if (!prev || new Date(t.created_at) > new Date(prev.created_at)) byEmail.set(email, t);
  }
  if (!byEmail.size) return [];

  const subs = await models.subscribers.findAll({});
  const subByEmail = new Map(subs.map((s) => [String(s.email || '').toLowerCase(), s]));

  const out = [];
  for (const [email, t] of byEmail) {
    const sub = subByEmail.get(email);
    // A password is what makes an account usable — status alone is not enough,
    // because checkout creates the row before anyone has chosen one.
    if (sub && sub.password_hash) continue;

    // Opt-out is per address: any teaser of theirs carrying the flag stops all.
    const optedOut = Array.from(teasers).some(
      (x) => String(x.email || '').toLowerCase() === email && x.finish_optout_at);

    const ageHours = hoursSince(t.created_at);
    const sent = t.finish_reminders_sent || 0;
    const tooOld = ageHours > MAX_AGE_DAYS * 24;
    const due = !optedOut && !tooOld
      && sent < MAX_REMINDERS
      && ageHours >= dueAfterHours(sent + 1)
      // Never two in the same day, whatever the schedule arithmetic says.
      && hoursSince(t.finish_reminded_at) >= 20;

    if (!due && !includeNotDue) continue;
    out.push({
      email,
      teaser_token: t.token,
      teaser_id: t.id,
      name: t.name || null,
      language: t.language || 'en',
      created_at: t.created_at,
      age_hours: Math.round(ageHours * 10) / 10,
      reminders_sent: sent,
      last_reminded_at: t.finish_reminded_at || null,
      has_subscriber_row: Boolean(sub),
      opted_out: Boolean(optedOut),
      too_old: tooOld,
      due,
      finish_url: `${baseUrl()}/build?t=${encodeURIComponent(t.token)}`,
    });
  }
  // Oldest preview first: the person closest to forgetting us entirely.
  out.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return out;
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * The reminder itself.
 *
 * It says what is missing and what happens when they finish, and it does not
 * pretend the account exists. Two facts only, both true: the preview is built,
 * and the account is not created until a password is set.
 */
function buildEmail(row, { attempt }) {
  const es = String(row.language || 'en') === 'es';
  const first = String(row.name || '').trim().split(/\s+/)[0];
  const url = row.finish_url;
  const stop = `${baseUrl()}/finish/stop?e=${encodeURIComponent(row.email)}&k=${stopToken(row.email)}`;
  const addr = process.env.JOBUP_MAIL_ADDRESS || 'Digit2AI LLC, Wesley Chapel, Florida, USA';

  const t = es ? {
    subject: attempt === 1
      ? 'Tu vista previa de JobUp está lista — falta un paso'
      : 'Tu cuenta de JobUp sigue sin terminar',
    hi: first ? `Hola ${first},` : 'Hola,',
    lead: 'Construimos tu sitio profesional y tu perfil legible por IA a partir de tu currículum. Ya está listo y te está esperando.',
    but: 'Pero tu cuenta todavía no existe.',
    why: 'Faltan dos cosas, y toman menos de un minuto: elegir una contraseña y decirnos qué puestos deben buscar tus agentes. Hasta entonces no podemos publicar tu sitio ni empezar a buscar vacantes para ti.',
    cta: 'Terminar mi cuenta',
    keep: 'Este enlace es el único camino de vuelta a tu vista previa, así que guárdalo.',
    stopL: 'No me lo recuerdes más',
    foot: 'Recibes esto porque creaste una vista previa en JobUp y no la terminaste.',
  } : {
    subject: attempt === 1
      ? 'Your JobUp preview is ready — one step left'
      : 'Your JobUp account is still unfinished',
    hi: first ? `Hi ${first},` : 'Hi,',
    lead: 'We built your professional site and your AI-readable profile from your résumé. It is finished and waiting.',
    but: 'But your account does not exist yet.',
    why: 'Two things are missing, and together they take under a minute: choose a password, and tell us which roles your agents should hunt for. Until then we cannot publish your site or start searching for openings on your behalf.',
    cta: 'Finish my account',
    keep: 'This link is the only way back to your preview, so keep this email.',
    stopL: 'Stop reminding me',
    foot: 'You are receiving this because you built a JobUp preview and did not finish it.',
  };

  const html = `<!doctype html><html><body style="margin:0;background:#0b0b12;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8e8f0">
<div style="max-width:560px;margin:0 auto;padding:28px 22px">
  <div style="font-size:20px;font-weight:700;background:linear-gradient(90deg,#7c5cff,#ff5c9d);-webkit-background-clip:text;background-clip:text;color:transparent">JobUp</div>
  <p style="font-size:16px;margin:22px 0 10px">${esc(t.hi)}</p>
  <p style="font-size:15px;line-height:1.6;color:#c9c9d8;margin:0 0 14px">${esc(t.lead)}</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 14px"><strong>${esc(t.but)}</strong></p>
  <p style="font-size:15px;line-height:1.6;color:#c9c9d8;margin:0 0 22px">${esc(t.why)}</p>
  <p style="margin:0 0 22px"><a href="${esc(url)}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:linear-gradient(90deg,#4cc9f0,#f72585);color:#fff;text-decoration:none;font-weight:700;font-size:15px">${esc(t.cta)}</a></p>
  <p style="font-size:13px;line-height:1.6;color:#9a9ab0;margin:0 0 4px">${esc(t.keep)}</p>
  <p style="font-size:12px;color:#7a7a90;word-break:break-all;margin:0 0 24px">${esc(url)}</p>
  <hr style="border:0;border-top:1px solid #23233a;margin:0 0 14px">
  <p style="font-size:12px;color:#7a7a90;line-height:1.6;margin:0">${esc(t.foot)}<br>
    <a href="${esc(stop)}" style="color:#9a9ab0">${esc(t.stopL)}</a> &middot; ${esc(addr)}</p>
</div></body></html>`;

  const text = [t.hi, '', t.lead, '', t.but, '', t.why, '', t.cta + ': ' + url, '',
    t.keep, '', t.foot, t.stopL + ': ' + stop, addr].join('\n');

  return { subject: t.subject, html, text };
}

/**
 * Send every reminder that is due.
 *
 * dryRun renders and reports without touching SendGrid or the reminder counters,
 * so the owner can read exactly what would go out, to whom, before any of it does.
 */
/**
 * A unique-by-construction claim in the audit log — the same device the job
 * notifier uses. Render runs more than one instance; without it every instance
 * would read the same due row in the same second and each would mail it, and
 * the "never two in twenty hours" guard cannot see a send that has not landed
 * yet. Returns true if THIS process won the hour.
 */
async function claimHour(key) {
  const action = `finish-reminder:${key}`;
  const existing = await models.audit_log.findOne({ where: { action } });
  if (existing) return false;
  try {
    await models.audit_log.create({ tenant_id: null, actor: 'finish-reminder', action, reason: `pid ${process.pid}` });
  } catch (e) { return false; }
  const rows = await models.audit_log.findAll({ where: { action } });
  if (rows.length > 1) {
    const winner = rows.reduce((a, b) => (a.id <= b.id ? a : b));
    const mine = rows.find((r) => String(r.reason || '').includes(`pid ${process.pid}`));
    if (!mine || mine.id !== winner.id) return false;
  }
  return true;
}

async function runOnce({ dryRun = false, force = false, limit = PER_RUN_CAP } = {}) {
  if (!enabled() && !dryRun) return { skipped: 'JOBUP_FINISH_REMINDERS_GO is not 1' };
  if (!dryRun && !force) {
    const hourKey = new Date().toISOString().slice(0, 13);   // YYYY-MM-DDTHH
    if (!(await claimHour(hourKey))) return { skipped: 'another instance claimed this hour', sent: 0, results: [] };
  }

  const due = (await pending()).slice(0, Math.max(0, limit));
  const results = [];
  let sent = 0;

  for (const row of due) {
    // THE LAST-MOMENT RE-CHECK. The batch above may be seconds or minutes old,
    // and finishing the account is exactly what we are asking them to do — so
    // the one thing worth re-reading is whether they just did it.
    const fresh = await models.subscribers.findOne({ where: { email: row.email } });
    if (fresh && fresh.password_hash) {
      results.push({ email: row.email, skipped: 'completed_since_batch' });
      continue;
    }
    const attempt = (row.reminders_sent || 0) + 1;
    const msg = buildEmail(row, { attempt });

    if (dryRun) {
      results.push({ email: row.email, attempt, subject: msg.subject, finish_url: row.finish_url, dry_run: true });
      continue;
    }

    let r;
    try {
      r = await mailer.send({ to: row.email, subject: msg.subject, html: msg.html, text: msg.text });
    } catch (e) {
      r = { ok: false, error: e.message };
    }
    if (r && r.ok) {
      // Counted only on a send that actually happened — a failed send that
      // burned an attempt would silently cost the person their reminder.
      await models.teasers.update(
        { finish_reminders_sent: attempt, finish_reminded_at: new Date() },
        { where: { id: row.teaser_id } });
      sent += 1;
      results.push({ email: row.email, attempt, ok: true });
    } else {
      results.push({ email: row.email, attempt, ok: false, error: (r && (r.error || r.reason)) || 'send failed' });
    }
  }

  return { eligible: due.length, sent, dry_run: Boolean(dryRun), results };
}

/** One click, and this address is never reminded again. */
async function optOut(email, token) {
  const addr = String(email || '').trim().toLowerCase();
  if (!addr || !stopTokenValid(addr, token)) return { ok: false, error: 'invalid_link' };
  const [n] = await models.teasers.update(
    { finish_optout_at: new Date() },
    { where: { email: addr } });
  return { ok: true, rows: n };
}

async function status() {
  let counts = null;
  try {
    const all = await pending({ includeNotDue: true });
    counts = {
      unfinished: all.length,
      due_now: all.filter((r) => r.due).length,
      opted_out: all.filter((r) => r.opted_out).length,
      too_old: all.filter((r) => r.too_old).length,
      exhausted: all.filter((r) => r.reminders_sent >= MAX_REMINDERS).length,
    };
  } catch (e) { counts = { error: e.message }; }
  return {
    enabled: enabled(),
    mailer_configured: mailer.configured(),
    max_reminders: MAX_REMINDERS,
    first_after_hours: FIRST_AFTER_HOURS,
    second_after_hours: SECOND_AFTER_HOURS,
    max_age_days: MAX_AGE_DAYS,
    per_run_cap: PER_RUN_CAP,
    counts,
  };
}

module.exports = {
  enabled, pending, runOnce, optOut, status, buildEmail, claimHour,
  stopToken, stopTokenValid, baseUrl,
  MAX_REMINDERS, MAX_AGE_DAYS,
};
