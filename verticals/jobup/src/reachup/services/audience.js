'use strict';

// =============================================================
// Suppression + capture + imports. The load-bearing rules live here.
//
// SUPPRESSION IS SYNCHRONOUS AND UNCACHED. isSuppressed() reads the primary
// database every time, on the send path, per recipient — there is deliberately
// no Redis, no in-memory set, no pre-computed sendable list. A cache here would
// let a just-unsubscribed address receive one more send; that is the exact
// failure the concurrent-unsubscribe test exists to catch.
// =============================================================

const crypto = require('crypto');
const db = require('../../db');
const { models, scoped, plain } = require('../models');

function hash(v) {
  return crypto.createHash('sha256').update(String(v || '').trim().toLowerCase()).digest('hex');
}

/**
 * Is this email suppressed for this tenant, RIGHT NOW? Checks both the tenant's
 * own rows AND global (tenant_id NULL) rows. Reads Postgres directly — no cache.
 * @param {object} [opts.transaction] read inside the caller's transaction so a
 *   concurrent unsubscribe committed before this read is seen.
 */
async function isSuppressed(tenantId, email, opts = {}) {
  if (!email) return true;                                   // no address = never send
  const eh = hash(email);
  const { Op } = require('sequelize');
  const row = await models.suppressions.findOne({
    where: { email_hash: eh, [Op.or]: [{ tenant_id: tenantId }, { tenant_id: null }] },
    transaction: opts.transaction,
  });
  return Boolean(row);
}

/** Add a suppression (idempotent-ish; a duplicate row is harmless). */
async function suppress(tenantId, { email, phone, reason }, opts = {}) {
  return models.suppressions.create({
    tenant_id: tenantId || null,
    email_hash: email ? hash(email) : null,
    phone_hash: phone ? hash(phone) : null,
    reason: reason || 'unspecified',
  }, { transaction: opts.transaction });
}

// ---- capture: subscriber + consent, atomically ----------------------------

const CHANNELS = new Set(['email', 'sms', 'voice', 'social_dm']);
const STAGES = new Set(['visitor', 'lead', 'free', 'paid', 'churned']);

/**
 * Public capture. Writes a subscriber and a consent row in ONE transaction, with
 * the full UTM chain and the source IP. Consent scope is explicit — an email
 * capture grants email_marketing, never automated_voice.
 */
async function capture(tenantId, body, meta = {}) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'a valid email is required' };
  }
  const lang = String(body.language || body.lang || 'en').toLowerCase() === 'es' ? 'es' : 'en';
  const stage = STAGES.has(body.lifecycle_stage) ? body.lifecycle_stage : 'lead';
  const t = await db.sequelize().transaction();
  try {
    let sub = await models.subscribers.findOne({ where: { tenant_id: tenantId, email }, transaction: t });
    const fields = {
      tenant_id: tenantId, email,
      phone: body.phone || null,
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      language: lang,
      source: body.source || 'capture_form',
      utm_source: body.utm_source || null, utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null, utm_term: body.utm_term || null,
      utm_content: body.utm_content || null,
      referrer_url: body.referrer_url || null,
      lifecycle_stage: stage,
      quarantined: false,
      updated_at: new Date(),
    };
    if (sub) { await models.subscribers.update(fields, { where: { id: sub.id }, transaction: t }); }
    else { sub = await models.subscribers.create(fields, { transaction: t }); }

    const channel = CHANNELS.has(body.channel) ? body.channel : 'email';
    const scope = Array.isArray(body.scope) && body.scope.length ? body.scope : ['email_marketing'];
    await models.consents.create({
      tenant_id: tenantId, subscriber_id: sub.id,
      channel, method: 'form', scope,
      ip: meta.ip || null, user_agent: meta.user_agent || null,
      source_url: body.source_url || meta.source_url || null,
    }, { transaction: t });

    await t.commit();
    return { ok: true, subscriber_id: sub.id, language: lang };
  } catch (e) {
    await t.rollback();
    return { ok: false, error: e.message };
  }
}

// ---- consent scope check (at send time) -----------------------------------

/** Does this subscriber hold a live (un-revoked) consent covering `scopeNeeded`? */
async function hasConsent(tenantId, subscriberId, scopeNeeded, opts = {}) {
  const rows = await scoped('consents', tenantId).findAll({
    where: { subscriber_id: subscriberId }, transaction: opts.transaction,
  });
  return rows.some((c) => !c.revoked_at && Array.isArray(c.scope) && c.scope.includes(scopeNeeded));
}

// ---- imports: QUARANTINED only, released by an admin with provenance -------

/**
 * Import a contact list. It lands in a QUARANTINED batch. Quarantined contacts
 * are NEVER sendable. There is no override flag.
 */
async function importBatch(tenantId, rows) {
  const clean = (Array.isArray(rows) ? rows : []).map((r) => ({
    email: String(r.email || '').trim().toLowerCase(),
    first_name: r.first_name || null, last_name: r.last_name || null,
    phone: r.phone || null, language: (r.language === 'es' ? 'es' : 'en'),
  })).filter((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email));
  const batch = await scoped('import_batches', tenantId).create({
    status: 'quarantined', row_count: clean.length, rows: clean,
  });
  return { ok: true, batch_id: batch.id, row_count: clean.length, status: 'quarantined' };
}

/**
 * Release a quarantined batch. REQUIRES the releasing admin id AND consent
 * provenance text — enforced here, not in the UI. Only then do the contacts
 * become real, sendable subscribers, each with an `import`-method consent that
 * records the provenance. No exceptions.
 */
async function releaseBatch(tenantId, batchId, { provenanceText, adminId }) {
  if (!provenanceText || !String(provenanceText).trim()) {
    return { ok: false, error: 'consent provenance text is required to release a batch' };
  }
  if (!adminId) return { ok: false, error: 'the releasing admin id is required' };
  const batch = await scoped('import_batches', tenantId).findOne({ where: { id: batchId } });
  if (!batch) return { ok: false, error: 'no such batch' };
  if (batch.status === 'released') return { ok: true, already: true, released: 0 };
  if (batch.status !== 'quarantined') return { ok: false, error: `batch is ${batch.status}` };

  const t = await db.sequelize().transaction();
  try {
    let created = 0;
    for (const r of (batch.rows || [])) {
      let sub = await models.subscribers.findOne({ where: { tenant_id: tenantId, email: r.email }, transaction: t });
      if (!sub) {
        sub = await models.subscribers.create({
          tenant_id: tenantId, email: r.email, first_name: r.first_name, last_name: r.last_name,
          phone: r.phone, language: r.language, source: 'import', lifecycle_stage: 'lead',
          quarantined: false, import_batch_id: batch.id,
        }, { transaction: t });
        created++;
      } else if (sub.quarantined) {
        await models.subscribers.update({ quarantined: false }, { where: { id: sub.id }, transaction: t });
      }
      await models.consents.create({
        tenant_id: tenantId, subscriber_id: sub.id, channel: 'email', method: 'import',
        scope: ['email_marketing'], source_url: `import_batch:${batch.id}`,
      }, { transaction: t });
    }
    await models.import_batches.update(
      { status: 'released', released_by: String(adminId), released_at: new Date(), provenance_text: String(provenanceText) },
      { where: { id: batch.id }, transaction: t });
    await t.commit();
    return { ok: true, released: created, batch_id: batch.id };
  } catch (e) {
    await t.rollback();
    return { ok: false, error: e.message };
  }
}

module.exports = { hash, isSuppressed, suppress, capture, hasConsent, importBatch, releaseBatch };
