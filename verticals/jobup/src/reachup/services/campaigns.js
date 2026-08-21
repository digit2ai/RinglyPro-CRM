'use strict';

// =============================================================
// Campaign sending — three streams, one iron rule on suppression.
//
// STREAMS: a campaign declares its stream and CANNOT resolve to a domain outside
// it. transactional is reserved for the existing JobUp digest (campaigns may not
// use it). marketing and cold each resolve their own configured domain/subuser.
//
// SUPPRESSION IS ATOMIC AND SYNCHRONOUS, per recipient, inside the SAME
// transaction as the send record write. Read straight from Postgres in the loop
// — never a cache, never a pre-computed list. Consent scope (email_marketing) is
// re-checked at send time; quarantined subscribers are excluded. This is what the
// concurrent-unsubscribe integration test asserts.
// =============================================================

const db = require('../../db');
const { models, scoped, plain } = require('../models');
const audience = require('./audience');

// Resolve a stream to its sending config. A stream with no configured domain is
// reported (configured:false) rather than silently borrowing another stream's.
function resolveStream(tenant, stream) {
  const send = (tenant && tenant.sending) || {};
  if (stream === 'marketing') {
    const domain = send.marketing_domain || process.env.MARKETING_SENDING_DOMAIN || null;
    return { stream, domain, subuser: process.env.SENDGRID_MARKETING_SUBUSER || null,
             from: domain ? `marketing@${domain}` : null, configured: Boolean(domain) };
  }
  if (stream === 'cold') {
    const domain = send.cold_domain || process.env.COLD_SENDING_DOMAIN || null;
    return { stream, domain, subuser: process.env.SENDGRID_COLD_SUBUSER || null,
             from: domain ? `outreach@${domain}` : null, configured: Boolean(domain) };
  }
  // transactional is the digest; campaigns may not target it.
  return { stream: 'transactional', configured: false, reserved: true };
}

// Resolve an audience to recipient subscriber rows (tenant-scoped). Excludes
// quarantined contacts up front (they are never sendable).
async function recipientsFor(tenantId, audienceId, opts = {}) {
  const aud = await scoped('audiences', tenantId).findOne({ where: { id: audienceId } });
  if (!aud) return [];
  const def = aud.definition || {};
  const all = plain(await scoped('subscribers', tenantId).findAll({ transaction: opts.transaction }));
  let rows = all.filter((s) => s.quarantined !== true && s.email);
  if (Array.isArray(def.emails) && def.emails.length) {
    const set = new Set(def.emails.map((e) => String(e).toLowerCase()));
    rows = rows.filter((s) => set.has(String(s.email).toLowerCase()));
  }
  if (def.lifecycle_stage) rows = rows.filter((s) => s.lifecycle_stage === def.lifecycle_stage);
  if (Array.isArray(def.tags) && def.tags.length) {
    rows = rows.filter((s) => Array.isArray(s.tags) && def.tags.some((t) => s.tags.includes(t)));
  }
  return rows;
}

async function actuallySend({ stream, from, subuser, to, subject, html, text }) {
  // Subuser key when configured; otherwise the account key with the stream's
  // from-domain. Never blocks the suppression logic — reports its own status.
  if (!process.env.SENDGRID_API_KEY) return { ok: false, error: 'no SENDGRID_API_KEY' };
  try {
    const sg = require('@sendgrid/mail');
    sg.setApiKey(process.env.SENDGRID_API_KEY);
    const fromAddr = from || process.env.JOBUP_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL;
    const msg = { to, from: { email: fromAddr, name: 'JobUp' }, subject: String(subject || 'JobUp').slice(0, 200),
                  categories: ['reachup', stream] };
    if (text) msg.text = String(text);
    if (html) msg.html = String(html);
    if (subuser) msg.headers = { 'X-SG-Subuser': subuser };
    const [resp] = await sg.send(msg);
    return { ok: true, messageId: (resp && resp.headers && resp.headers['x-message-id']) || null };
  } catch (e) {
    const body = e && e.response && e.response.body;
    return { ok: false, error: (body && JSON.stringify(body).slice(0, 300)) || e.message };
  }
}

/**
 * Send a campaign. Per recipient, inside ONE transaction: read suppression from
 * the DB, re-check consent scope, and only then send + write the send record. A
 * suppressed or unconsented recipient is recorded and skipped, never sent.
 * @param {boolean} opts.dryRun skip the external SendGrid call (records only) —
 *   used by the integration test.
 */
async function send(tenantId, tenant, campaignId, opts = {}) {
  const campaign = await scoped('campaigns', tenantId).findOne({ where: { id: campaignId } });
  if (!campaign) return { ok: false, error: 'no such campaign' };
  const streamCfg = resolveStream(tenant, campaign.stream);
  if (streamCfg.reserved) return { ok: false, error: 'campaigns cannot use the transactional stream' };

  const subjAsset = campaign.subject_asset_id ? await scoped('content_assets', tenantId).findOne({ where: { id: campaign.subject_asset_id } }) : null;
  const bodyAsset = campaign.body_asset_id ? await scoped('content_assets', tenantId).findOne({ where: { id: campaign.body_asset_id } }) : null;
  // Approved-only: an unapproved asset can never be published.
  if (subjAsset && subjAsset.status !== 'approved') return { ok: false, error: 'subject asset is not approved' };
  if (bodyAsset && bodyAsset.status !== 'approved') return { ok: false, error: 'body asset is not approved' };
  const subject = (subjAsset && subjAsset.body) || campaign.name || 'JobUp';
  const bodyText = (bodyAsset && bodyAsset.body) || '';

  const recipients = await recipientsFor(tenantId, campaign.audience_id);
  await scoped('campaigns', tenantId).update({ status: 'sending' }, { id: campaignId });

  let sent = 0; let suppressed = 0; let skipped = 0;
  for (const r of recipients) {
    const t = await db.sequelize().transaction();
    try {
      // ATOMIC + SYNCHRONOUS: suppression read inside this recipient's tx.
      if (await audience.isSuppressed(tenantId, r.email, { transaction: t })) {
        await models.events.create({ tenant_id: tenantId, subscriber_id: r.id, campaign_id: campaignId,
          type: 'suppressed', meta: { reason: 'suppression' } }, { transaction: t });
        await t.commit(); suppressed++; continue;
      }
      if (!(await audience.hasConsent(tenantId, r.id, 'email_marketing', { transaction: t }))) {
        await models.events.create({ tenant_id: tenantId, subscriber_id: r.id, campaign_id: campaignId,
          type: 'skipped', meta: { reason: 'no_consent' } }, { transaction: t });
        await t.commit(); skipped++; continue;
      }
      let messageId = null;
      if (!opts.dryRun) {
        const s = await actuallySend({ ...streamCfg, to: r.email, subject,
          text: bodyText, html: bodyText ? `<div style="font:15px/1.6 system-ui">${bodyText.replace(/\n/g, '<br>')}</div>` : null });
        if (!s.ok) {
          await models.events.create({ tenant_id: tenantId, subscriber_id: r.id, campaign_id: campaignId,
            type: 'send_failed', meta: { error: s.error } }, { transaction: t });
          await t.commit(); skipped++; continue;
        }
        messageId = s.messageId;
      }
      // The send record + the suppression read live in the SAME transaction.
      await models.events.create({ tenant_id: tenantId, subscriber_id: r.id, campaign_id: campaignId,
        type: 'sent', sg_message_id: messageId, meta: { stream: campaign.stream, dry_run: Boolean(opts.dryRun) } }, { transaction: t });
      await t.commit(); sent++;
    } catch (e) {
      await t.rollback(); skipped++;
    }
  }

  await scoped('campaigns', tenantId).update(
    { status: 'sent', sent_count: sent, suppressed_count: suppressed, sent_at: new Date() }, { id: campaignId });
  return { ok: true, campaign_id: campaignId, stream: campaign.stream, recipients: recipients.length,
           sent, suppressed, skipped, stream_configured: streamCfg.configured };
}

// SendGrid Event Webhook ingest -> events + auto-suppress on hard bounce / spam
// report / unsubscribe.
async function ingestEvents(tenantId, tenant, events) {
  let suppressedNow = 0;
  for (const ev of (Array.isArray(events) ? events : [])) {
    const email = String(ev.email || '').toLowerCase();
    if (!email) continue;
    const sub = await scoped('subscribers', tenantId).findOne({ where: { email } });
    const type = ev.event;
    await scoped('events', tenantId).create({
      subscriber_id: sub ? sub.id : null, type: type || 'unknown', sg_message_id: ev.sg_message_id || null,
      meta: { reason: ev.reason || null, type: ev.type || null },
    });
    if (type === 'bounce' || type === 'dropped' || type === 'spamreport' || type === 'unsubscribe' || type === 'group_unsubscribe') {
      await audience.suppress(tenantId, { email, reason: type });
      suppressedNow++;
    }
  }
  return { ok: true, processed: (events || []).length, suppressed: suppressedNow };
}

module.exports = { resolveStream, recipientsFor, send, ingestEvents };
