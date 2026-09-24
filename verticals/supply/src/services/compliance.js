'use strict';

/**
 * Outbound compliance. canCall() is checked when a target is QUEUED and again
 * at DIAL time (a contractor can opt out between the two), so a do-not-call
 * number cannot reach the dialer by any path.
 *
 * Checks: do_not_contact flag, the tenant suppression list (do_not_call,
 * opt_out, internal_block, national_dnc), revoked consent, a consent
 * requirement when the tenant turns it on, a valid phone, and calling hours
 * in the CONTRACTOR's local timezone.
 *
 * National Do-Not-Call registry scrubbing is NOT built: it needs an FTC SAN
 * subscription. Numbers a tenant has scrubbed elsewhere are loaded into the
 * suppression list as reason 'national_dnc'. Stated on the Settings screen.
 */

const db = require('../db');
const { e164, tzFor, localClock, audit, httpError } = require('../util');

const REASONS = ['do_not_call', 'opt_out', 'internal_block', 'national_dnc'];

async function suppressed(tenantId, phone) {
  if (!phone) return null;
  return db.tone(tenantId, 'SELECT reason FROM sup_suppression WHERE tenant_id = :tenant AND phone_e164 = :p', { p: phone });
}

function withinHours(settings, tz, at = new Date()) {
  const s = Object.assign({ calling_days: [1, 2, 3, 4, 5], calling_start: '09:00', calling_end: '18:00' }, settings || {});
  const { weekday, minutes } = localClock(tz, at);
  const [sh, sm] = s.calling_start.split(':').map(Number);
  const [eh, em] = s.calling_end.split(':').map(Number);
  if (!s.calling_days.includes(weekday)) return { ok: false, reason: 'outside calling days in ' + tz };
  if (minutes < sh * 60 + sm || minutes >= eh * 60 + em) return { ok: false, reason: `outside calling hours (${s.calling_start}-${s.calling_end} ${tz})` };
  return { ok: true };
}

/** Everything except the clock: used when building a campaign audience. */
async function eligible(tenant, contractor) {
  if (contractor.do_not_contact) return { ok: false, reason: 'marked do not contact' };
  if (!contractor.phone_e164) return { ok: false, reason: 'no valid phone number' };
  if (contractor.consent_status === 'revoked') return { ok: false, reason: 'consent revoked' };
  if (tenant.settings && tenant.settings.require_consent_status && !['express', 'business_published'].includes(contractor.consent_status)) return { ok: false, reason: 'no recorded consent basis' };
  const s = await suppressed(tenant.id, contractor.phone_e164);
  if (s) return { ok: false, reason: 'on suppression list (' + s.reason + ')' };
  return { ok: true };
}

async function canCall(tenant, contractor, campaign, at = new Date()) {
  const e = await eligible(tenant, contractor);
  if (!e.ok) return e;
  const schedule = Object.assign({}, tenant.settings, campaign && campaign.calling_schedule && campaign.calling_schedule.days
    ? { calling_days: campaign.calling_schedule.days, calling_start: campaign.calling_schedule.start || tenant.settings.calling_start, calling_end: campaign.calling_schedule.end || tenant.settings.calling_end }
    : {});
  return withinHours(schedule, tzFor(contractor, tenant), at);
}

/** Add to the suppression list AND flag the contractor, in one step. */
async function suppress(tenantId, phoneRaw, reason, { source, actorId } = {}) {
  const phone = e164(phoneRaw);
  if (!phone) throw httpError(400, 'Enter a valid phone number');
  if (!REASONS.includes(reason)) throw httpError(400, 'Reason must be one of ' + REASONS.join(', '));
  await db.trun(tenantId, `INSERT INTO sup_suppression (tenant_id, phone_e164, reason, source, created_by) VALUES (:tenant, :p, :r, :s, :a)
    ON CONFLICT (tenant_id, phone_e164) DO UPDATE SET reason = EXCLUDED.reason`, { p: phone, r: reason, s: source || null, a: actorId || null });
  await db.trun(tenantId, `UPDATE sup_contractors SET do_not_contact = true, stage = 'do_not_contact', updated_at = now() WHERE tenant_id = :tenant AND phone_e164 = :p`, { p: phone });
  await db.trun(tenantId, `UPDATE sup_campaign_targets SET status = 'skipped', skip_reason = :r, updated_at = now()
    WHERE tenant_id = :tenant AND status = 'queued' AND contractor_id IN (SELECT id FROM sup_contractors WHERE tenant_id = :tenant AND phone_e164 = :p)`, { p: phone, r: 'suppressed: ' + reason });
  await audit(tenantId, actorId, 'compliance.suppressed', 'phone', null, { reason, source: source || null });
  return { phone, reason };
}

async function unsuppress(tenantId, phoneRaw, actorId) {
  const phone = e164(phoneRaw);
  await db.trun(tenantId, 'DELETE FROM sup_suppression WHERE tenant_id = :tenant AND phone_e164 = :p', { p: phone });
  await audit(tenantId, actorId, 'compliance.unsuppressed', 'phone', null, {});
  return { phone };
}

async function list(tenantId) {
  return db.tq(tenantId, 'SELECT id, phone_e164, reason, source, created_at FROM sup_suppression WHERE tenant_id = :tenant ORDER BY created_at DESC LIMIT 2000');
}

module.exports = { REASONS, eligible, canCall, withinHours, suppress, unsuppress, list, suppressed };
