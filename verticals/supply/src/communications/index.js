'use strict';

/**
 * providerFor(tenant) — the one place that decides which CommunicationProvider
 * a tenant talks through and with which credentials.
 *
 * Credential sources, per tenant (tenant.ghl.source):
 *   'private_token' — the supplier's own GHL sub-account: a Private Integration
 *                     token stored AES-256-GCM encrypted + its location id.
 *   'crm_client'    — reuse a GoHighLevel connection the RinglyPro CRM already
 *                     holds (ghl_integrations / clients.settings) for a CRM
 *                     client id. That token is refreshed by the CRM, so it is
 *                     read at call time, never copied. ONLY a super admin may
 *                     point a tenant at a CRM client: it is someone's live
 *                     sub-account.
 * Anything else = NotConnectedProvider, which refuses honestly.
 */

const db = require('../db');
const { decrypt } = require('../util');
const { NotConnectedProvider } = require('./CommunicationProvider');
const { GoHighLevelProvider } = require('./GoHighLevelProvider');

let injected = null; // SIT: (tenant) => provider
function _inject(fn) { injected = fn; }

async function crmClientCreds(clientId) {
  const r = await db.one(`SELECT c.settings->'integration'->'ghl' AS gs, g.access_token AS tok, g.ghl_location_id AS loc
    FROM clients c LEFT JOIN ghl_integrations g ON g.client_id = c.id AND g.is_active = true WHERE c.id = :id`, { id: Number(clientId) });
  if (!r) return null;
  const token = r.gs && r.gs.enabled && r.gs.apiKey ? r.gs.apiKey : r.tok;
  const locationId = r.loc || (r.gs && r.gs.locationId);
  return token && locationId ? { token, locationId } : null;
}

async function recordHealth(tenantId, ok, err) {
  try {
    await db.trun(tenantId, `INSERT INTO sup_integration_health (tenant_id, provider, ok, last_error, last_checked_at)
      VALUES (:tenant, 'gohighlevel', :ok, :e, now())
      ON CONFLICT (tenant_id, provider) DO UPDATE SET ok = EXCLUDED.ok, last_error = CASE WHEN EXCLUDED.ok THEN sup_integration_health.last_error ELSE EXCLUDED.last_error END, last_checked_at = now()`,
    { ok: !!ok, e: err ? String(err.message || err).slice(0, 500) : null });
  } catch (e) { /* health is advisory */ }
}

async function providerFor(tenant) {
  if (injected) return injected(tenant);
  const g = (tenant && tenant.ghl) || {};
  let creds = null;
  try {
    if (g.source === 'private_token') {
      const token = decrypt(tenant.ghl_secret_enc);
      if (!token && tenant.ghl_secret_enc) return new NotConnectedProvider('Stored GoHighLevel token cannot be decrypted (SUPPLY_SECRET changed). Re-enter it.');
      creds = token && g.location_id ? { token, locationId: g.location_id } : null;
    } else if (g.source === 'crm_client' && g.crm_client_id) {
      creds = await crmClientCreds(g.crm_client_id);
    }
  } catch (e) { return new NotConnectedProvider('GoHighLevel credentials could not be read: ' + e.message); }
  if (!creds) return new NotConnectedProvider('GoHighLevel is not connected for this tenant');
  return new GoHighLevelProvider(creds, (ok, err) => { recordHealth(tenant.id, ok, err); });
}

module.exports = { providerFor, _inject, recordHealth };
