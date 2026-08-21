'use strict';

// =============================================================
// Job-match email notifier — the LinkedIn-style digest, tiered by cadence.
//
// THE CAP IS ENFORCED AT THE DATA LAYER, not in a comment:
//   - `next_eligible_at` is set to now()+24h (landed) or now()+7d (search) the
//     moment a digest is sent. A user is only ever selected when now() has
//     passed it, so the cap holds regardless of how many matches arrive.
//   - `job_matches.notified_at` is stamped on every included match, and the
//     query only ever reads WHERE notified_at IS NULL — so a match is emailed
//     exactly once, ever, and can never reappear in a later digest.
//   - Zero new matches => nothing is sent. There is no empty digest.
//   - Free tier is excluded entirely (email digests are a paid feature).
//
// CONCURRENCY: one hourly claim in the audit log means only one instance/tick
// runs the notifier in a given hour — the same proven pattern the agent
// scheduler uses. A double cron run or a mid-run redeploy therefore sends
// nothing the second time. On Postgres each user's writes are additionally
// wrapped in a transaction.
//
// SEND ORDER (the brief's failure contract): send FIRST; only on success stamp
// notified_at, insert email_sends, and advance next_eligible_at. A 4xx failure
// writes email_sends status='failed' and stamps nothing, so those matches roll
// into the next cycle.
// =============================================================

const modelsMod = require('../models');
const { models, scoped, plain } = modelsMod;
const digest = require('./emailDigest');
const mailer = require('./mailer');
const crypto = require('crypto');

const SEND_HOUR = (() => {
  const h = parseInt(process.env.JOBUP_NOTIFY_HOUR || '8', 10);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 8;
})();
const DEFAULT_TZ = process.env.JOBUP_NOTIFY_DEFAULT_TZ || 'America/New_York';

function enabled() { return process.env.JOBUP_NOTIFY_GO === '1'; }

// The subscriber's local hour, honoring their IANA timezone. Falls back to the
// default tz, then to UTC, rather than ever throwing.
function localHour(tz, now = new Date()) {
  for (const zone of [tz, DEFAULT_TZ]) {
    if (!zone) continue;
    try {
      const s = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hour12: false }).format(now);
      const h = parseInt(s, 10);
      if (Number.isInteger(h)) return h % 24;
    } catch (e) { /* try next */ }
  }
  return new Date(now).getUTCHours();
}

// A unique-by-construction claim in the audit log. Returns true if THIS process
// won it. Reused for the hourly notifier claim.
async function claim(key) {
  const action = `notify:${key}`;
  const existing = await models.audit_log.findOne({ where: { action } });
  if (existing) return false;
  try {
    await models.audit_log.create({ tenant_id: null, actor: 'notifier', action, reason: `pid ${process.pid}` });
  } catch (e) { return false; }
  const rows = await models.audit_log.findAll({ where: { action } });
  if (rows.length > 1) {
    const winner = rows.reduce((a, b) => (a.id <= b.id ? a : b));
    const mine = rows.find((r) => String(r.reason || '').includes(`pid ${process.pid}`));
    if (!mine || mine.id !== winner.id) return false;
  }
  return true;
}

// Ensure the subscriber has an unsubscribe token (needed for the footer link and
// the one-click List-Unsubscribe header).
async function ensureUnsubToken(sub) {
  if (sub.unsubscribe_token) return sub.unsubscribe_token;
  const tok = crypto.randomBytes(24).toString('base64url');
  await models.subscribers.update({ unsubscribe_token: tok }, { where: { id: sub.id } });
  sub.unsubscribe_token = tok;
  return tok;
}

// Is this subscriber due for a digest right now?
function isEligible(sub, now = new Date()) {
  if (!sub || sub.status !== 'active') return false;
  if (sub.notifications_enabled === false) return false;
  const cad = digest.cadenceFor(sub.plan);
  if (!cad) return false;                                  // free => never
  if (sub.next_eligible_at && new Date(sub.next_eligible_at) > now) return false;
  if (localHour(sub.timezone, now) !== SEND_HOUR) return false;
  return true;
}

// The unnotified Hunter matches for a tenant, richest first, joined to the job,
// and DISTINCT BY POSTING. A job the subscriber has already been emailed can
// never come back (notified_at), and the same posting can never appear twice in
// one digest even if two match rows point at it (dedupe by job_id, then by
// employer|title so a cross-source duplicate collapses too). Each distinct
// posting carries every underlying fresh match_id, so when it is emailed ALL of
// its rows are stamped — a sibling row can never resurface it next cycle.
async function newMatchesFor(tenantId) {
  const rows = plain(await scoped('job_matches', tenantId).findAll({}));
  const fresh = rows.filter((m) =>
    m.notified_at == null
    && (m.source === 'hunter' || m.source == null)
    && m.job_id != null
    && m.score != null);

  const byKey = new Map();
  for (const m of fresh) {
    const job = plain(await models.jobs.findOne({ where: { id: m.job_id } })) || {};
    const title = m.title || job.title || null;
    const company = m.employer || job.employer || null;
    // Prefer job_id; fall back to a normalized employer|title so the same
    // posting arriving under two ids still collapses to one card.
    const key = `job:${m.job_id}`;
    const softKey = `t:${String(company || '').toLowerCase().trim()}|${String(title || '').toLowerCase().trim()}`;
    const existing = byKey.get(key) || byKey.get(softKey);
    if (existing) {
      existing.match_ids.push(m.id);                       // stamp this row too when we send
      if ((m.score || 0) > (existing.match_score || 0)) {  // keep the strongest as the representative
        existing.match_score = m.score;
        existing.posted_at = job.posted_at || m.created_at || existing.posted_at;
      }
      continue;
    }
    const entry = {
      match_id: m.id, match_ids: [m.id],
      title, company, location: job.location || null,
      match_score: m.score,
      posted_at: job.posted_at || m.created_at || null,
      apply_url: job.url || null,
    };
    byKey.set(key, entry);
    byKey.set(softKey, entry);   // both keys point at the same entry, so either collapses
  }

  // Distinct entries only (both keys mapped to the same object — de-dupe by identity).
  const seen = new Set();
  const out = [];
  for (const e of byKey.values()) { if (!seen.has(e)) { seen.add(e); out.push(e); } }
  out.sort((a, b) =>
    (b.match_score - a.match_score) || (new Date(b.posted_at || 0) - new Date(a.posted_at || 0)));
  return out;
}

function tokenizeHeaders(data) {
  const from = mailer.fromAddress();
  const listUnsub = [`<${data.unsubscribe_url}>`];
  if (from) listUnsub.unshift(`<mailto:${from}?subject=unsubscribe>`);
  return {
    'List-Unsubscribe': listUnsub.join(', '),
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Process ONE subscriber. Returns a result object (never throws for a normal
 * skip). dryRun logs the payload and does not call SendGrid or stamp anything.
 */
async function runForUser(sub, { dryRun = false, now = new Date() } = {}) {
  const cad = digest.cadenceFor(sub.plan);
  if (!cad) return { tenant_id: sub.id, skipped: 'free tier (no email)' };

  const all = await newMatchesFor(sub.id);
  if (!all.length) return { tenant_id: sub.id, skipped: 'no new matches' };

  await ensureUnsubToken(sub);
  const included = all.slice(0, cad.top);         // distinct postings, top N
  const moreCount = all.length - included.length;
  // Stamp EVERY underlying row for each included posting, not just the
  // representative — so a duplicate match row can never bring the same job back.
  const includedIds = included.reduce((ids, m) => ids.concat(m.match_ids || [m.match_id]), []);
  const data = digest.buildData(sub, included, moreCount);
  const fb = digest.renderFallback(data);

  if (dryRun) {
    return {
      tenant_id: sub.id, period: cad.period, would_send: true,
      to: sub.email, subject: fb.subject, match_count: data.match_count,
      more_count: data.more_count, locale: data.locale, dynamic_template_data: data,
    };
  }

  const templateId = data.locale === 'es'
    ? process.env.SENDGRID_TEMPLATE_ID_ES : process.env.SENDGRID_TEMPLATE_ID_EN;

  const r = await mailer.sendDigest({
    to: sub.email,
    subject: fb.subject, html: fb.html, text: fb.text,     // used when templateId is unset
    templateId: templateId || null,
    dynamicData: data,
    asmGroupId: process.env.SENDGRID_ASM_GROUP_ID || null,
    headers: tokenizeHeaders(data),
    categories: ['job_match_digest', cad.period],
  });

  if (!r.ok) {
    // Do NOT stamp. Those matches roll into the next cycle. Record the failure.
    await models.email_sends.create({
      tenant_id: sub.id, kind: 'job_match_digest', period: cad.period,
      tier_at_send: sub.plan || 'legacy', locale: data.locale, match_count: data.match_count,
      status: 'failed', error: String(r.error || 'send failed').slice(0, 900),
    });
    return { tenant_id: sub.id, sent: false, error: r.error };
  }

  // SUCCESS. Stamp every included match once, log the send, advance the cap.
  const stampedAt = new Date();
  for (const id of includedIds) {
    await scoped('job_matches', sub.id).update({ notified_at: stampedAt }, { id });
  }
  await models.email_sends.create({
    tenant_id: sub.id, kind: 'job_match_digest', period: cad.period,
    tier_at_send: sub.plan || 'legacy', locale: data.locale, match_count: data.match_count,
    sendgrid_message_id: r.messageId || null, status: r.dry_run ? 'dry_run' : 'sent',
  });
  await models.subscribers.update({
    last_notified_at: stampedAt,
    next_eligible_at: new Date(now.getTime() + cad.ms),
  }, { where: { id: sub.id } });

  return { tenant_id: sub.id, sent: true, period: cad.period, match_count: data.match_count,
           more_count: moreCount, message_id: r.messageId || null };
}

/**
 * One notifier pass. Selects every eligible subscriber and processes each.
 * `force` bypasses the hourly claim (used by the test script / dry-run).
 */
async function runOnce({ dryRun = false, force = false, onlyTenant = null } = {}) {
  const now = new Date();
  if (!force && !dryRun) {
    const hourKey = now.toISOString().slice(0, 13);   // YYYY-MM-DDTHH
    if (!(await claim(hourKey))) return { skipped: 'another instance claimed this hour', results: [] };
  }

  let subs;
  if (onlyTenant != null) {
    const one = await models.subscribers.findOne({ where: { id: onlyTenant } });
    subs = one ? [plain(one)] : [];
  } else {
    subs = plain(await models.subscribers.findAll({ where: { status: 'active' } }));
  }

  const eligible = subs.filter((s) => (onlyTenant != null) || isEligible(s, now));
  const results = [];
  for (const s of eligible) {
    try { results.push(await runForUser(s, { dryRun, now })); }
    catch (e) { results.push({ tenant_id: s.id, error: e.message }); }
  }
  const sent = results.filter((r) => r.sent).length;
  return { at: now, considered: subs.length, eligible: eligible.length, sent, results };
}

module.exports = {
  enabled, runOnce, runForUser, isEligible, newMatchesFor, localHour, claim,
  ensureUnsubToken, SEND_HOUR, DEFAULT_TZ,
};
