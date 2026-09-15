'use strict';

/**
 * Rachel, the follow-up agent.
 *
 * Plans a 90-day cadence (days 1, 3, 7, 14, 30, 60, 90) for every lead that ticked email
 * and/or SMS, in the buyer's language, and alerts buyers when a promotion in a community
 * they chose changes or is no longer found.
 *
 * Invariants (SIT asserts each):
 *  - Consent is re-checked at SEND time (notify.buyerMessage / sms.buyerSms), so an unsubscribe
 *    or a STOP after planning stops every later touch.
 *  - Double opt-in: follow-up emails need an address the buyer confirmed by opening their emailed report
 *    link; texts need a number confirmed by a YES reply. Buyer-typed names enter a message only through
 *    safeFirstName (letters only), so a submitted name can never carry a link or a phone number.
 *  - A buyer under agreement with another agent gets no plan at all.
 *  - Closed or lost leads are skipped; the "book a consult" touch is skipped once a meeting exists.
 *  - Texts wait out quiet hours (before 9 am, from 8 pm Eastern) instead of being dropped.
 *  - Messages are fixed bilingual templates. A model may reword ONE opening sentence, and the rewrite
 *    is discarded if it adds any figure or name (advisor.acceptRewrite).
 *  - A promotion alert compares two MODEL research runs for the same area and says the listing is
 *    unconfirmed until the licensed agent checks it; a registry-only run is never compared.
 *  - This file has no transport: email goes through notify.js, texts through sms.js.
 */

const crypto = require('crypto');
const db = require('../db');
const notify = require('./notify');
const sms = require('./sms');
const llm = require('./llm');
const eastern = require('./eastern');
const { token, audit, safeFirstName } = require('./util');
const { acceptRewrite } = require('../engines/advisor');

const CADENCE = [1, 3, 7, 14, 30, 60, 90];
const SMS_DAYS = [1, 7, 30, 90];

function norm(v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function words(v) { return new Set(norm(v).split(' ').filter((w) => w.length > 2)); }
function similar(a, b) {
  const A = words(a), B = words(b);
  if (!A.size && !B.size) return true;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter || 1) >= 0.6;
}
function publicUrl() { return notify.publicUrl(); }

async function latestConsent(tenantId, leadId, channel, { confirmed = false } = {}) {
  const c = await db.one(`SELECT granted, revoked_at, confirmed_at FROM nca_lead_consents WHERE tenant_id = :t AND lead_id = :l AND channel = :ch ORDER BY id DESC LIMIT 1`, { t: tenantId, l: leadId, ch: channel });
  return !!(c && c.granted === true && !c.revoked_at && (!confirmed || c.confirmed_at));
}

async function ensureUnsubscribeToken(tenantId, lead) {
  if (lead.unsubscribe_token) return lead.unsubscribe_token;
  const tok = token(18);
  await db.exec('UPDATE nca_leads SET unsubscribe_token = :tok WHERE id = :id AND tenant_id = :t AND unsubscribe_token IS NULL', { tok, id: lead.id, t: tenantId });
  const row = await db.one('SELECT unsubscribe_token FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: lead.id, t: tenantId });
  return row.unsubscribe_token;
}

/** Plan the cadence for a lead. Idempotent (unique index). Returns the number of touches planned. */
async function scheduleForLead(tenantId, leadId) {
  const l = await db.one('SELECT * FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: leadId, t: tenantId });
  if (!l || l.agent_agreement_signed || ['closed', 'lost'].includes(l.status)) return 0;
  const email = !!l.email && await latestConsent(tenantId, l.id, 'email');
  // Texts are planned only once the number is confirmed (the buyer replied YES); sms.js plans them on that reply.
  const text = !!l.phone && await latestConsent(tenantId, l.id, 'sms', { confirmed: true });
  if (!email && !text) return 0;
  await ensureUnsubscribeToken(tenantId, l);
  const created = new Date(l.created_at);
  let n = 0;
  for (const d of CADENCE) {
    const day = eastern.addDays(created, d);
    const plans = [];
    if (email) plans.push(['email', eastern.toUtc(day.y, day.m, day.d, 10 * 60)]);
    if (text && SMS_DAYS.includes(d)) plans.push(['sms', eastern.toUtc(day.y, day.m, day.d, 11 * 60)]);
    for (const [channel, when] of plans) {
      const r = await db.exec(`INSERT INTO nca_followups (tenant_id, lead_id, kind, day_offset, channel, scheduled_for)
        VALUES (:t, :l, 'cadence', :d, :ch, :w) ON CONFLICT DO NOTHING RETURNING id`, { t: tenantId, l: l.id, d, ch: channel, w: when.toISOString() });
      n += r.length;
    }
  }
  if (n) await audit(tenantId, { type: 'system' }, 'followup.planned', 'lead', l.id, { touches: n, email, sms: text });
  return n;
}

async function cancelForLead(tenantId, leadId, channels, reason) {
  const rows = await db.exec(`UPDATE nca_followups SET status = 'skipped', reason = :r WHERE tenant_id = :t AND lead_id = :l AND status = 'queued' AND channel IN (:chs) RETURNING id`,
    { t: tenantId, l: leadId, chs: channels, r: reason });
  return rows.length;
}

/** One-click unsubscribe from an email link. Revokes the consent rows and cancels planned touches. */
async function unsubscribe(tenantId, unsubToken, channels = ['email', 'sms']) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(unsubToken || ''))) return { ok: false };
  const l = await db.one('SELECT id FROM nca_leads WHERE unsubscribe_token = :tok AND tenant_id = :t', { tok: unsubToken, t: tenantId });
  if (!l) return { ok: false };
  const chs = channels.filter((c) => ['email', 'sms'].includes(c));
  if (!chs.length) return { ok: false };
  await db.exec(`UPDATE nca_lead_consents SET revoked_at = now(), revoked_via = 'unsubscribe_link' WHERE tenant_id = :t AND lead_id = :l AND channel IN (:chs) AND revoked_at IS NULL`, { t: tenantId, l: l.id, chs });
  const cancelled = await cancelForLead(tenantId, l.id, chs, 'unsubscribed');
  await audit(tenantId, { type: 'buyer' }, 'followup.unsubscribed', 'lead', l.id, { channels: chs, cancelled });
  return { ok: true, channels: chs };
}

/* ---------- content ---------- */
// City and ZIP come from the server's area lookup; the typed area text is never put into a message.
function placeOf(l) { return [l.city, l.zip].filter(Boolean).join(' ') || (l.lang === 'es' ? 'su zona' : 'your area'); }
function links(l, unsubToken) {
  const lang = l.lang === 'es' ? 'es' : 'en';
  return {
    report: `${publicUrl()}/?lead=${l.token}&lang=${lang}#intake`,
    book: `${publicUrl()}/?lead=${l.token}&lang=${lang}#book`,
    search: `${publicUrl()}/?lang=${lang}#intake`,
    unsubscribe: unsubToken ? { label: lang === 'es' ? 'Darse de baja de estos correos' : 'Unsubscribe from these emails', url: `${publicUrl()}/unsubscribe/${unsubToken}`, oneClickUrl: `${publicUrl()}/api/v1/public/unsubscribe/${unsubToken}` } : null
  };
}

const T = {
  en: {
    footer: 'You are receiving this because you asked for your BuyersLine report and agreed to email updates. BuyersLine is a technology platform, not a real estate brokerage or a lender.',
    open: 'Open my report', book: 'Book a free consult', search: 'Search again',
    1: (x) => ({ subject: 'Your BuyersLine report and what to do next', p: [`Hi ${x.name}. Your report for ${x.place} is saved, with the communities you chose.`, 'One thing that protects you: register with our licensed agent before you visit any sales office, so you keep free representation.'], cta: 'report' }),
    3: (x) => ({ subject: 'Before you visit a model home', p: [`Hi ${x.name}. Many builders ask you to sign a guest card at the door.`, 'If you sign one before our licensed agent registers you, the builder may not let a buyer\'s agent help you later. It costs you nothing to register first.'], cta: x.referral ? 'book' : 'report' }),
    7: (x) => ({ subject: 'Builder promotions change often', p: [`Hi ${x.name}. The promotions we found for ${x.place} were current when we searched, but builders change them often.`, 'Our licensed agent can confirm the current terms for the communities you chose before you visit.'], cta: x.referral ? 'book' : 'report' }),
    14: (x) => ({ subject: 'A free 30-minute consult', p: [`Hi ${x.name}. If you would like help comparing ${x.communities || 'the communities you chose'}, our licensed agent can walk you through them.`, x.referral ? 'Book a free 30-minute consult at a time that suits you.' : 'Your report stays available whenever you are ready.'], cta: x.referral ? 'book' : 'report' }),
    30: (x) => ({ subject: `Still looking in ${x.place}?`, p: [`Hi ${x.name}. If your plans, timing or budget changed, run a new search and we will pull the current promotions again.`], cta: 'search' }),
    60: (x) => ({ subject: 'New communities open all the time', p: [`Hi ${x.name}. New phases and quick move-in homes appear in ${x.place} regularly.`, 'A new search shows what builders are offering now.'], cta: 'search' }),
    90: (x) => ({ subject: 'Last check-in from BuyersLine', p: [`Hi ${x.name}. This is our last scheduled note.`, 'Your report stays available, and you can start a new search whenever you are ready.'], cta: 'report' }),
    sms: { 1: (x) => `BuyersLine: Hi ${x.name}, your new-home report is saved: ${x.link}. Register with our agent before visiting sales offices.`, 7: (x) => `BuyersLine: builder promotions change often. Our licensed agent can confirm current terms: ${x.link}`, 30: (x) => `BuyersLine: still looking in ${x.place}? Update your search any time: ${x.link}`, 90: (x) => `BuyersLine: last check-in. Your report stays here: ${x.link}` },
    promo_subject: 'A promotion changed in a community you chose',
    promo_intro: (x) => `Hi ${x.name}. Our latest search for ${x.place} found a change in a community you chose.`,
    promo_changed: (c) => `${c.community} by ${c.builder}: the promotion now listed is "${c.after}".`,
    promo_ended: (c) => `${c.community} by ${c.builder}: our latest search did not find the promotion listed before.`,
    promo_note: 'These come from builder websites and are not confirmed until our licensed agent checks them.',
    promo_sms: (x) => `BuyersLine: a promotion changed for ${x.community}. Details and next step: ${x.link}`
  },
  es: {
    footer: 'Recibe este correo porque pidió su informe de BuyersLine y aceptó recibir novedades por correo. BuyersLine es una plataforma tecnológica, no una correduría de bienes raíces ni un prestamista.',
    open: 'Ver mi informe', book: 'Reservar una consulta gratuita', search: 'Buscar de nuevo',
    1: (x) => ({ subject: 'Su informe de BuyersLine y el siguiente paso', p: [`Hola ${x.name}. Su informe para ${x.place} está guardado, con las comunidades que eligió.`, 'Algo que lo protege: regístrese con nuestro agente con licencia antes de visitar cualquier oficina de ventas, para conservar su representación sin costo.'], cta: 'report' }),
    3: (x) => ({ subject: 'Antes de visitar una casa modelo', p: [`Hola ${x.name}. Muchas constructoras le piden firmar una tarjeta de visita en la entrada.`, 'Si la firma antes de que nuestro agente con licencia lo registre, la constructora puede no permitir que un agente del comprador le ayude después. Registrarse primero no le cuesta nada.'], cta: x.referral ? 'book' : 'report' }),
    7: (x) => ({ subject: 'Las promociones de las constructoras cambian seguido', p: [`Hola ${x.name}. Las promociones que encontramos para ${x.place} estaban vigentes cuando buscamos, pero las constructoras las cambian con frecuencia.`, 'Nuestro agente con licencia puede confirmar los términos actuales de las comunidades que eligió antes de su visita.'], cta: x.referral ? 'book' : 'report' }),
    14: (x) => ({ subject: 'Una consulta gratuita de 30 minutos', p: [`Hola ${x.name}. Si quiere ayuda para comparar ${x.communities || 'las comunidades que eligió'}, nuestro agente con licencia puede explicárselas.`, x.referral ? 'Reserve una consulta gratuita de 30 minutos a la hora que le convenga.' : 'Su informe sigue disponible cuando esté listo.'], cta: x.referral ? 'book' : 'report' }),
    30: (x) => ({ subject: `¿Sigue buscando en ${x.place}?`, p: [`Hola ${x.name}. Si cambiaron sus planes, plazos o presupuesto, haga una búsqueda nueva y volveremos a buscar las promociones actuales.`], cta: 'search' }),
    60: (x) => ({ subject: 'Siempre abren comunidades nuevas', p: [`Hola ${x.name}. En ${x.place} aparecen con frecuencia nuevas etapas y casas listas para mudarse.`, 'Una búsqueda nueva muestra lo que ofrecen las constructoras hoy.'], cta: 'search' }),
    90: (x) => ({ subject: 'Último mensaje de BuyersLine', p: [`Hola ${x.name}. Este es nuestro último mensaje programado.`, 'Su informe sigue disponible y puede empezar una búsqueda nueva cuando esté listo.'], cta: 'report' }),
    sms: { 1: (x) => `BuyersLine: Hola ${x.name}, su informe de casas nuevas está guardado: ${x.link}. Regístrese con nuestro agente antes de visitar oficinas de ventas.`, 7: (x) => `BuyersLine: las promociones cambian seguido. Nuestro agente con licencia puede confirmar los términos actuales: ${x.link}`, 30: (x) => `BuyersLine: ¿sigue buscando en ${x.place}? Actualice su búsqueda cuando quiera: ${x.link}`, 90: (x) => `BuyersLine: último mensaje. Su informe sigue aquí: ${x.link}` },
    promo_subject: 'Cambió una promoción en una comunidad que eligió',
    promo_intro: (x) => `Hola ${x.name}. Nuestra búsqueda más reciente para ${x.place} encontró un cambio en una comunidad que eligió.`,
    promo_changed: (c) => `${c.community} de ${c.builder}: la promoción que aparece ahora es "${c.after}".`,
    promo_ended: (c) => `${c.community} de ${c.builder}: nuestra búsqueda más reciente no encontró la promoción que aparecía antes.`,
    promo_note: 'Esta información viene de los sitios de las constructoras y no está confirmada hasta que nuestro agente con licencia la revise.',
    promo_sms: (x) => `BuyersLine: cambió una promoción en ${x.community}. Detalles y siguiente paso: ${x.link}`
  }
};

async function chosenCommunities(tenantId, leadId) {
  return db.q(`SELECT r.builder, r.community, r.promotion FROM nca_lead_selections s JOIN nca_research_rows r ON r.id = s.research_row_id AND r.tenant_id = s.tenant_id
    WHERE s.tenant_id = :t AND s.lead_id = :l ORDER BY r.builder`, { t: tenantId, l: leadId });
}

/** Optional warmer wording for the first sentence. Kept only when it adds no figure or name. */
async function personalize(lang, sentence, facts) {
  if (process.env.INCENTIVA_FOLLOWUP_MODEL === 'off' || !llm.configured()) return sentence;
  try {
    const out = await llm.text({
      model: process.env.INCENTIVA_FOLLOWUP_MODEL || 'claude-haiku-4-5-20251001',
      system: `Rewrite one sentence of a short follow-up note from a home-buying service so it sounds warm and human. Language: ${lang === 'es' ? 'Spanish, use usted, correct accents' : 'English'}. Keep the meaning. Do not add any number, date, price, name, place or promise. No emojis, no exclamation marks. Return only the sentence.`,
      user: sentence, max_tokens: 120
    });
    const clean = String(out || '').trim().replace(/^"|"$/g, '');
    return clean && acceptRewrite(sentence, clean, facts) ? clean : sentence;
  } catch (e) { return sentence; }
}

async function composeCadence(tenantId, l, f) {
  const lang = l.lang === 'es' ? 'es' : 'en', L = T[lang];
  const unsubToken = await ensureUnsubscribeToken(tenantId, l);
  const lk = links(l, unsubToken);
  const chosen = await chosenCommunities(tenantId, l.id);
  const x = { name: safeFirstName(l.first_name), place: placeOf(l), referral: !!l.referral_consent, communities: chosen.slice(0, 3).map((c) => c.community || c.builder).join(', ') };
  if (f.channel === 'sms') {
    const fn = L.sms[f.day_offset];
    return fn ? { body: fn(Object.assign({}, x, { link: f.day_offset === 30 ? lk.search : lk.report })).replace(/Hi ,|Hola ,/, (m) => m.replace(' ,', ',')) } : null;
  }
  const c = L[f.day_offset] && L[f.day_offset](x);
  if (!c) return null;
  c.p = c.p.map((para) => para.replace(/^(Hi|Hola) \. /, '$1. '));
  const facts = [x.name, x.place, x.communities].join(' ');
  c.p[0] = await personalize(lang, c.p[0], facts);
  const cta = { label: L[c.cta === 'report' ? 'open' : c.cta], url: lk[c.cta] };
  return { subject: c.subject, paragraphs: c.p, cta, footer: L.footer, unsubscribe: lk.unsubscribe };
}

/* ---------- sending ---------- */
async function claimDue(tenantId, limit) {
  // A row left 'sending' by a crashed instance is retried; delivery is deduplicated per touch in the audit log.
  await db.exec(`UPDATE nca_followups SET status = 'queued' WHERE tenant_id = :t AND status = 'sending' AND scheduled_for < now() - interval '1 hour'`, { t: tenantId });
  return db.exec(`UPDATE nca_followups SET status = 'sending' WHERE id IN (
      SELECT id FROM nca_followups WHERE tenant_id = :t AND status = 'queued' AND scheduled_for <= now() ORDER BY scheduled_for LIMIT :lim FOR UPDATE SKIP LOCKED)
    RETURNING *`, { t: tenantId, lim: limit });
}

async function finish(f, status, reason, extra = {}) {
  await db.exec(`UPDATE nca_followups SET status = :s, reason = :r, sent_at = CASE WHEN :s = 'sent' THEN now() ELSE sent_at END, scheduled_for = COALESCE(:next, scheduled_for) WHERE id = :id`,
    { s: status, r: reason || null, id: f.id, next: extra.next || null });
}

async function sendOne(tenantId, f) {
  const l = await db.one('SELECT * FROM nca_leads WHERE id = :id AND tenant_id = :t', { id: f.lead_id, t: tenantId });
  if (!l) return finish(f, 'skipped', 'lead_missing');
  if (l.agent_agreement_signed) return finish(f, 'skipped', 'under_agreement');
  if (['closed', 'lost'].includes(l.status)) return finish(f, 'skipped', 'lead_closed');
  if (f.kind === 'cadence' && f.day_offset === 14) {
    const m = await db.one(`SELECT id FROM nca_lead_meetings WHERE tenant_id = :t AND lead_id = :l AND status IN ('booked','held') LIMIT 1`, { t: tenantId, l: l.id });
    if (m) return finish(f, 'skipped', 'meeting_booked');
  }
  let res;
  if (f.kind === 'cadence') {
    const content = await composeCadence(tenantId, l, f);
    if (!content) return finish(f, 'skipped', 'no_template');
    res = f.channel === 'sms'
      ? await sms.buyerSms(tenantId, l.id, { action: 'sms.followup_' + f.id, subjectType: 'followup', subjectId: f.id, body: content.body })
      : await notify.buyerMessage(tenantId, l.id, Object.assign({ action: 'email.followup_' + f.id, subjectType: 'followup', subjectId: f.id, marketing: true }, content));
  } else {
    res = await sendPromoChange(tenantId, l, f);
  }
  if (res.sent) return finish(f, 'sent', null);
  if (res.reason === 'quiet_hours') {
    const day = eastern.addDays(new Date(), eastern.hourNow() >= 20 ? 1 : 0);
    return finish(f, 'queued', 'quiet_hours', { next: eastern.toUtc(day.y, day.m, day.d, 11 * 60).toISOString() });
  }
  if (res.reason === 'error') return finish(f, 'failed', 'send_error');
  if (res.reason === 'already_sent') return finish(f, 'sent', 'already_sent');
  return finish(f, 'skipped', res.reason || 'not_sent');
}

async function sendDue(tenantId, { limit = 40 } = {}) {
  const due = await claimDue(tenantId, limit);
  for (const f of due) {
    try { await sendOne(tenantId, f); } catch (e) { console.error('[incentiva] followup', f.id, e.message); await finish(f, 'failed', 'exception'); }
  }
  return due.length;
}

/* ---------- promotion-change alerts ---------- */
async function sendPromoChange(tenantId, l, f) {
  const lang = l.lang === 'es' ? 'es' : 'en', L = T[lang];
  const unsubToken = await ensureUnsubscribeToken(tenantId, l);
  const lk = links(l, unsubToken);
  const c = f.detail || {};
  const x = { name: safeFirstName(l.first_name), place: placeOf(l) };
  if (f.channel === 'sms') {
    return sms.buyerSms(tenantId, l.id, { action: 'sms.followup_' + f.id, subjectType: 'followup', subjectId: f.id, body: L.promo_sms({ community: c.community || c.builder, link: lk.report }) });
  }
  const paragraphs = [L.promo_intro(x), c.change === 'ended' ? L.promo_ended(c) : L.promo_changed(c), L.promo_note];
  return notify.buyerMessage(tenantId, l.id, { action: 'email.followup_' + f.id, subjectType: 'followup', subjectId: f.id, marketing: true,
    subject: L.promo_subject, paragraphs, cta: { label: l.referral_consent ? L.book : L.open, url: l.referral_consent ? lk.book : lk.report }, footer: L.footer, unsubscribe: lk.unsubscribe });
}

function hash(v) { return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 12); }

/** Compare each lead's chosen communities with the newest model research run for the same area. */
async function detectChanges(tenantId) {
  const leads = await db.q(`SELECT l.id, l.research_run_id, r.cache_key, r.ran_at FROM nca_leads l
    JOIN nca_research_runs r ON r.id = l.research_run_id AND r.tenant_id = l.tenant_id
    WHERE l.tenant_id = :t AND l.status NOT IN ('closed','lost') AND l.agent_agreement_signed = false AND l.created_at > now() - interval '90 days'
      AND EXISTS (SELECT 1 FROM nca_lead_selections s WHERE s.lead_id = l.id AND s.tenant_id = l.tenant_id)
      AND EXISTS (SELECT 1 FROM nca_lead_consents c WHERE c.lead_id = l.id AND c.tenant_id = l.tenant_id AND c.channel IN ('email','sms') AND c.granted AND c.revoked_at IS NULL)
    LIMIT 500`, { t: tenantId });
  let alerts = 0;
  for (const lead of leads) {
    const newer = await db.one(`SELECT id FROM nca_research_runs WHERE tenant_id = :t AND cache_key = :k AND status = 'done' AND source = 'model' AND ran_at > :ran ORDER BY ran_at DESC LIMIT 1`,
      { t: tenantId, k: lead.cache_key, ran: lead.ran_at });
    if (!newer) continue;
    const current = await db.q(`SELECT builder, community, promotion FROM nca_research_rows WHERE tenant_id = :t AND run_id = :r AND hidden_reason IS NULL`, { t: tenantId, r: newer.id });
    if (!current.length) continue;
    const byKey = new Map(current.map((x) => [norm(x.builder) + '|' + norm(x.community), x]));
    const email = await latestConsent(tenantId, lead.id, 'email');
    const text = await latestConsent(tenantId, lead.id, 'sms');
    for (const chosen of await chosenCommunities(tenantId, lead.id)) {
      const key = norm(chosen.builder) + '|' + norm(chosen.community);
      const last = await db.one(`SELECT detail FROM nca_followups WHERE tenant_id = :t AND lead_id = :l AND kind = 'promo_change' AND detail->>'key' = :k ORDER BY id DESC LIMIT 1`, { t: tenantId, l: lead.id, k: key });
      const before = last ? last.detail.after : chosen.promotion;
      if (!before) continue; // nothing was listed, so nothing can have changed
      const now = byKey.get(key);
      let change = null;
      if (!now || !now.promotion) change = last && last.detail.change === 'ended' ? null : 'ended';
      else if (!similar(before, now.promotion)) change = 'changed';
      if (!change) continue;
      const detail = { key, builder: chosen.builder, community: chosen.community || chosen.builder, change, before, after: change === 'ended' ? null : String(now.promotion).slice(0, 240), run_id: newer.id };
      const changeKey = key.slice(0, 180) + ':' + hash(detail.after || 'ended');
      for (const [channel, ok] of [['email', email], ['sms', text]]) {
        if (!ok) continue;
        const r = await db.exec(`INSERT INTO nca_followups (tenant_id, lead_id, kind, channel, scheduled_for, change_key, detail)
          VALUES (:t, :l, 'promo_change', :ch, now(), :ck, :d) ON CONFLICT DO NOTHING RETURNING id`, { t: tenantId, l: lead.id, ch: channel, ck: changeKey, d: JSON.stringify(detail) });
        alerts += r.length;
      }
    }
  }
  return alerts;
}

/** Re-run research weekly for areas that active, consented leads chose communities in (uses the monthly research cap). */
async function refreshAreas(tenantId, { limit = 3 } = {}) {
  const days = Number(process.env.INCENTIVA_FOLLOWUP_REFRESH_DAYS || 7);
  if (!days || !process.env.ANTHROPIC_API_KEY || process.env.INCENTIVA_RESEARCH === 'off') return 0;
  const areas = await db.q(`SELECT DISTINCT ON (r.cache_key) r.cache_key, r.zip, r.city, r.county, r.area_label FROM nca_leads l
    JOIN nca_research_runs r ON r.id = l.research_run_id AND r.tenant_id = l.tenant_id
    WHERE l.tenant_id = :t AND l.status NOT IN ('closed','lost') AND l.agent_agreement_signed = false AND l.created_at > now() - interval '90 days'
      AND EXISTS (SELECT 1 FROM nca_lead_consents c WHERE c.lead_id = l.id AND c.tenant_id = l.tenant_id AND c.channel IN ('email','sms') AND c.granted AND c.revoked_at IS NULL)
    ORDER BY r.cache_key, r.ran_at DESC`, { t: tenantId });
  const research = require('./research');
  let started = 0;
  for (const a of areas) {
    if (started >= limit) break;
    const latest = await db.one(`SELECT ran_at FROM nca_research_runs WHERE tenant_id = :t AND cache_key = :k AND source = 'model' ORDER BY ran_at DESC LIMIT 1`, { t: tenantId, k: a.cache_key });
    if (latest && new Date(latest.ran_at) > new Date(Date.now() - days * 86400e3)) continue;
    const out = await research.startOrGet(tenantId, { zip: a.zip, city: a.city, county: a.county, state: 'FL', label: a.area_label, input: a.area_label }, { allowFresh: true });
    if (out.fresh) { started++; await audit(tenantId, { type: 'system' }, 'followup.area_refresh', 'research_run', out.run.id, { cache_key: a.cache_key }); }
  }
  return started;
}

module.exports = { CADENCE, SMS_DAYS, scheduleForLead, cancelForLead, unsubscribe, sendDue, detectChanges, refreshAreas, similar, composeCadence, T };
