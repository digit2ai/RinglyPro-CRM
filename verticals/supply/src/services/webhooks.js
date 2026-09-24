'use strict';

/**
 * Inbound webhooks from the communications platform.
 *
 * Tenant resolution: each tenant has a secret webhook token in its URL
 * (/supply/webhooks/ghl/<token>), optionally repeated in an X-Supply-Token
 * header; compared in constant time. If the body names a location, it must be
 * the tenant's location, or the event is refused — a leaked URL cannot inject
 * another sub-account's calls.
 *
 * Store first, then process: every event is written to sup_webhook_events
 * under a unique (tenant, provider, event_key) BEFORE any effect, so a retry
 * from the platform is recognised and acknowledged without running twice.
 * A failed event keeps its error and is retried by the sweep up to 5 times.
 */

const crypto = require('crypto');
const db = require('../db');
const { safeEqual } = require('../util');
const calls = require('./calls');

async function tenantByToken(token) {
  if (!token || String(token).length < 20) return null;
  const t = await db.one('SELECT * FROM sup_tenants WHERE webhook_token = :t', { t: String(token) });
  return t && safeEqual(t.webhook_token, token) ? t : null;
}

async function process1(tenant, provider, evt) {
  if (evt.type === 'call.completed') {
    let call = evt.call;
    if (!call && evt.externalContactId) {
      // The webhook is a signal; the call log is the record.
      const logs = await provider.listCallLogs(tenant, { contactId: evt.externalContactId, since: new Date(Date.now() - 6 * 3600e3), until: new Date() });
      const wanted = evt.key && String(evt.key).startsWith('call:') ? String(evt.key).slice(5) : null;
      if (wanted) call = logs.find((l) => String(l.providerCallId) === wanted) || null;
      if (!call) {
        // Newest log we have not stored yet.
        for (const l of logs) {
          const seen = l.providerCallId ? await db.tone(tenant.id, 'SELECT id FROM sup_calls WHERE tenant_id = :tenant AND provider = :pv AND provider_call_id = :id AND status = :st', { pv: provider.name, id: String(l.providerCallId), st: 'completed' }) : null;
          if (!seen) { call = l; break; }
        }
      }
    }
    if (!call) return { status: 'ignored', note: 'no call data yet' };
    if (!call.externalContactId) call.externalContactId = evt.externalContactId;
    if (!call.fromNumber) call.fromNumber = evt.phone;
    const r = await calls.ingestCall(tenant, provider, call, { direction: evt.direction || undefined });
    return { status: r.ignored ? 'ignored' : 'processed', note: r.ignored || null, result: { call_id: r.call && r.call.id, outcome: r.outcome, buyer_id: r.buyer_id, duplicate: !!r.duplicate } };
  }
  if (evt.type === 'call.inbound') {
    const r = await calls.recognize(tenant, provider, evt);
    return { status: 'processed', result: r };
  }
  if (evt.type === 'contact.updated' && evt.externalContactId) {
    // Opt-outs recorded in GHL (DND) become suppressions here.
    const raw = evt.raw || {};
    if (raw.dnd === true || /dnd|do.?not.?call/i.test(String(raw.tags || raw.tag || ''))) {
      const c = await db.tone(tenant.id, 'SELECT phone_e164 FROM sup_contractors WHERE tenant_id = :tenant AND ghl_contact_id = :g', { g: String(evt.externalContactId) });
      if (c && c.phone_e164) await require('./compliance').suppress(tenant.id, c.phone_e164, 'opt_out', { source: 'GoHighLevel DND' });
      return { status: 'processed', result: { suppressed: !!(c && c.phone_e164) } };
    }
    return { status: 'ignored', note: 'contact change with no effect here' };
  }
  return { status: 'ignored', note: 'event type not used: ' + evt.type };
}

async function receive(tenant, provider, body) {
  const loc = body && (body.locationId || body.location_id || (body.location && body.location.id));
  const g = tenant.ghl || {};
  if (loc && g.location_id && String(loc) !== String(g.location_id)) return { status: 403, body: { error: 'Location does not belong to this tenant' } };
  const events = provider.parseWebhook(body);
  const out = [];
  for (const evt of events) {
    const key = String(evt.key || crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')).slice(0, 120);
    const ins = await db.trun(tenant.id, `INSERT INTO sup_webhook_events (tenant_id, provider, event_key, event_type, payload) VALUES (:tenant, :pv, :k, :t, :p::jsonb)
      ON CONFLICT (tenant_id, provider, event_key) DO NOTHING RETURNING id`, { pv: provider.name, k: key, t: evt.type, p: JSON.stringify(body).slice(0, 200000) });
    if (!ins.length) { out.push({ key, duplicate: true }); continue; }
    out.push(Object.assign({ key }, await run(tenant, provider, ins[0].id, evt)));
  }
  return { status: 200, body: { ok: true, events: out } };
}

async function run(tenant, provider, eventId, evt) {
  try {
    const r = await process1(tenant, provider, evt);
    await db.trun(tenant.id, `UPDATE sup_webhook_events SET status = :s, attempts = attempts + 1, error = :n, processed_at = now() WHERE tenant_id = :tenant AND id = :id`, { s: r.status, n: r.note || null, id: eventId });
    return r;
  } catch (e) {
    await db.trun(tenant.id, `UPDATE sup_webhook_events SET status = 'failed', attempts = attempts + 1, error = :e WHERE tenant_id = :tenant AND id = :id`, { e: String(e.message).slice(0, 1000), id: eventId });
    return { status: 'failed', error: e.message };
  }
}

/** Retry failed events (max 5 attempts). */
async function retryFailed(tenant, provider) {
  const rows = await db.tq(tenant.id, `SELECT * FROM sup_webhook_events WHERE tenant_id = :tenant AND status = 'failed' AND attempts < 5 ORDER BY id LIMIT 20`);
  let ok = 0;
  for (const r of rows) {
    const [evt] = provider.parseWebhook(r.payload);
    if (!evt) continue;
    const res = await run(tenant, provider, r.id, evt);
    if (res.status !== 'failed') ok++;
  }
  return { retried: rows.length, recovered: ok };
}

module.exports = { tenantByToken, receive, retryFailed };
