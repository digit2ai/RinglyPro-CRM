'use strict';

/**
 * The outbound dialer. For each ACTIVE campaign, within the contractor's
 * calling hours and under the campaign's daily limit, it takes the best-scored
 * queued contractor, re-checks compliance at dial time, builds that
 * contractor's context package, writes it onto the contact, and asks the
 * provider to start the call (GoHighLevel: enroll in the campaign workflow).
 *
 * A dispatched call is a row with status 'dispatched' and NO provider call id:
 * the id only exists once the call log comes back. Failures mark the target
 * back to queued with the error, so nothing is lost and nothing is retried
 * in a tight loop (one attempt per target per tick).
 *
 * The loop runs only when NODE_ENV=production or SUPPLY_DIALER=on, and
 * SUPPLY_DIALER=off stops it anywhere — the local .env points at the
 * production database.
 */

const db = require('../db');
const { localDate, tzFor } = require('../util');
const compliance = require('./compliance');
const memory = require('./memory');
const contractors = require('./contractors');

async function contextPackage(tenant, campaign, contractor) {
  const ctx = await memory.build(tenant.id, contractor.id);
  const offer = campaign.offer || {};
  const rep = campaign.sales_rep_id ? await db.tone(tenant.id, 'SELECT name FROM sup_sales_reps WHERE tenant_id = :tenant AND id = :id', { id: campaign.sales_rep_id }) : null;
  return {
    supplier: tenant.name,
    contractor: { name: contractor.contact_name, company: contractor.company_name, category_id: contractor.category_id, city: contractor.city, state: contractor.state },
    campaign: { id: campaign.id, name: campaign.campaign_name, objective: campaign.call_objective },
    products: (offer.products || []).filter((p) => p.price != null).map((p) => ({ name: p.name, sku: p.sku, price: p.price, unit: p.unit, in_stock: p.quantity_available, verified_comparison: p.claim || null })),
    value_proposition: offer.value_proposition, talking_points: offer.talking_points || [], pricing_language: offer.pricing_language,
    objection_handling: offer.objection_handling || [], history: ctx ? ctx.text : null,
    sales_rep: rep ? rep.name : null,
    disclosure: (tenant.settings && tenant.settings.recording_disclosure) || null
  };
}

function offerText(pkg) {
  const lines = [pkg.value_proposition].concat(pkg.talking_points || []);
  if (pkg.pricing_language) lines.push('Pricing rule: ' + pkg.pricing_language);
  if (pkg.disclosure) lines.push('Say first: ' + pkg.disclosure);
  if (pkg.sales_rep) lines.push('Transfer interested buyers to ' + pkg.sales_rep + '.');
  return lines.filter(Boolean).join('\n').slice(0, 3900);
}

async function dispatchOne(tenant, provider, campaign, target, now) {
  const contractor = await db.tone(tenant.id, 'SELECT * FROM sup_contractors WHERE tenant_id = :tenant AND id = :id', { id: target.contractor_id });
  const ok = contractor ? await compliance.canCall(tenant, contractor, campaign, now) : { ok: false, reason: 'contractor deleted' };
  if (!ok.ok) {
    // Hours are temporary; everything else is permanent for this campaign.
    if (/outside calling/.test(ok.reason)) return { deferred: ok.reason };
    await db.trun(tenant.id, `UPDATE sup_campaign_targets SET status = 'skipped', skip_reason = :r, updated_at = now() WHERE tenant_id = :tenant AND id = :id`, { r: ok.reason, id: target.id });
    return { skipped: ok.reason };
  }
  const pkg = await contextPackage(tenant, campaign, contractor);
  const [call] = await db.trun(tenant.id, `INSERT INTO sup_calls (tenant_id, campaign_id, contractor_id, direction, status, provider, context_package)
    VALUES (:tenant, :cp, :c, 'outbound', 'dispatched', :pv, :pkg::jsonb) RETURNING *`, { cp: campaign.id, c: contractor.id, pv: provider.name, pkg: JSON.stringify(pkg) });
  await db.trun(tenant.id, `UPDATE sup_campaign_targets SET status = 'dispatched', call_id = :k, updated_at = now() WHERE tenant_id = :tenant AND id = :id`, { k: call.id, id: target.id });
  try {
    const ext = await contractors.syncToProvider(tenant, contractor, provider);
    await provider.setContactContext(tenant, ext, { rps_context: pkg.history || '', rps_offer: offerText(pkg), rps_rep: pkg.sales_rep || '', rps_campaign: campaign.campaign_name });
    const r = await provider.startOutboundCall(tenant, { externalContactId: ext, campaign, context: pkg });
    await db.trun(tenant.id, `UPDATE sup_calls SET ghl_contact_id = :g, provider_call_id = COALESCE(:ref, provider_call_id) WHERE tenant_id = :tenant AND id = :id`, { g: ext, ref: r.providerRef || null, id: call.id });
    await db.trun(tenant.id, `UPDATE sup_contractors SET stage = CASE WHEN stage IN ('target_contractor','outbound_scheduled') THEN 'outbound_attempted' ELSE stage END, updated_at = now() WHERE tenant_id = :tenant AND id = :id`, { id: contractor.id });
    return { dispatched: call.id, mode: r.mode };
  } catch (e) {
    await db.trun(tenant.id, `UPDATE sup_calls SET status = 'failed', summary = :m, ended_at = now() WHERE tenant_id = :tenant AND id = :id`, { m: 'Dispatch failed: ' + e.message, id: call.id });
    await db.trun(tenant.id, `UPDATE sup_campaign_targets SET status = 'queued', skip_reason = :m, updated_at = now() WHERE tenant_id = :tenant AND id = :id`, { m: 'last attempt failed: ' + String(e.message).slice(0, 200), id: target.id });
    return { failed: e.message, code: e.code || null };
  }
}

/** One pass for one tenant. max caps how many calls this pass may start. */
async function tick(tenant, provider, { now = new Date(), max = 20 } = {}) {
  const out = { tenant_id: tenant.id, dispatched: 0, skipped: 0, deferred: 0, failed: 0, errors: [] };
  if (!['trial', 'active'].includes(tenant.status)) return Object.assign(out, { note: 'tenant ' + tenant.status });
  const active = await db.tq(tenant.id, `SELECT * FROM sup_campaigns WHERE tenant_id = :tenant AND status = 'active' ORDER BY priority = 'high' DESC, id`);
  const today = localDate(tenant.timezone, now);
  for (const campaign of active) {
    const sent = await db.tone(tenant.id, `SELECT count(*)::int AS n FROM sup_calls WHERE tenant_id = :tenant AND campaign_id = :c AND direction = 'outbound'
      AND (started_at AT TIME ZONE :tz)::date = :d::date`, { c: campaign.id, tz: tenant.timezone, d: today });
    let room = Math.min(max - out.dispatched, campaign.daily_call_limit - sent.n);
    if (room <= 0) continue;
    const targets = await db.tq(tenant.id, `SELECT * FROM sup_campaign_targets WHERE tenant_id = :tenant AND campaign_id = :c AND status = 'queued'
      AND (skip_reason IS NULL OR updated_at < :cut) ORDER BY score DESC, id LIMIT :lim`, { c: campaign.id, lim: room * 3, cut: new Date(now.getTime() - 15 * 60e3) });
    for (const t of targets) {
      if (room <= 0) break;
      const r = await dispatchOne(tenant, provider, campaign, t, now);
      if (r.dispatched) { out.dispatched++; room--; }
      else if (r.skipped) out.skipped++;
      else if (r.deferred) out.deferred++;
      else if (r.failed) { out.failed++; out.errors.push(r.failed); if (r.code === 'NOT_CONNECTED' || r.code === 'NO_WORKFLOW') break; }
    }
  }
  return out;
}

/**
 * Poll call logs for dispatched calls the webhook has not reported. The
 * webhook is the fast path; this is the safety net.
 */
async function reconcile(tenant, provider) {
  const pending = await db.tq(tenant.id, `SELECT id, ghl_contact_id, started_at FROM sup_calls WHERE tenant_id = :tenant AND status = 'dispatched' AND ghl_contact_id IS NOT NULL
    AND started_at > now() - interval '48 hours' ORDER BY started_at LIMIT 25`);
  const calls = require('./calls');
  let ingested = 0;
  for (const p of pending) {
    try {
      const logs = await provider.listCallLogs(tenant, { contactId: p.ghl_contact_id, since: p.started_at, until: new Date() });
      const log = logs.find((l) => !l.startedAt || new Date(l.startedAt) >= new Date(new Date(p.started_at).getTime() - 60e3));
      if (log) { const r = await calls.ingestCall(tenant, provider, log, { direction: 'outbound' }); if (r.created) ingested++; }
    } catch (e) { break; } // provider down: try next pass
  }
  // Inbound calls and callbacks: no webhook needed. Every pass reads the recent
  // call logs for the whole sub-account; ingestCall ignores callers who are not
  // contractors and is idempotent on the call id, so re-reading is harmless.
  try {
    const recent = await provider.listCallLogs(tenant, { since: new Date(Date.now() - 3 * 3600e3), until: new Date() });
    for (const l of recent) { const r = await calls.ingestCall(tenant, provider, l); if (r.created) ingested++; }
  } catch (e) { /* provider down: next pass */ }
  // Give up on calls with no log after 48 h, so the campaign target is not stuck.
  await db.trun(tenant.id, `UPDATE sup_calls SET status = 'failed', summary = COALESCE(summary, 'No call log returned within 48 hours'), ended_at = now()
    WHERE tenant_id = :tenant AND status = 'dispatched' AND started_at <= now() - interval '48 hours'`);
  return { checked: pending.length, ingested };
}

module.exports = { tick, reconcile, contextPackage, offerText, dispatchOne };
