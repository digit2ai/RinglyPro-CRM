'use strict';

/**
 * CommunicationProvider — the ONLY way RinglyPro Supply's business logic
 * reaches a phone line, a contact record in someone else's CRM, or a call log.
 *
 * Why an abstraction and not GoHighLevel calls everywhere: the Twilio account
 * that carried RinglyPro was disabled for 18 days in 2026 and every flow that
 * talked to it directly went down with it. Supply's campaign, memory and
 * attribution logic must survive a change of carrier. GoHighLevelProvider is
 * the first implementation; a future one only has to honour this contract.
 *
 * Every method returns plain data. A provider NEVER invents an id: a method
 * that could not reach the platform throws (or returns { ok:false }) and the
 * caller records the failure.
 *
 * Contract:
 *   capabilities()                                   -> { outbound_ai_call, call_logs, opportunities, contact_fields, ... }
 *   health(tenant)                                   -> { ok, detail }
 *   upsertContact(tenant, contact)                   -> { externalId }
 *   setContactContext(tenant, externalId, fields)    -> { ok }        (context the voice agent reads)
 *   startOutboundCall(tenant, { externalContactId, campaign }) -> { accepted, mode, providerRef }
 *   listCallLogs(tenant, { since, until, contactId }) -> [normalizedCall]
 *   upsertOpportunity(tenant, { externalId, externalContactId, name, stage, value }) -> { externalId }
 *   parseWebhook(body)                               -> [normalizedEvent]
 *
 * normalizedCall  = { providerCallId, externalContactId, fromNumber, direction|null, startedAt, durationSec,
 *                     summary, transcript, extracted, actions:[{type, at}], trial }
 * normalizedEvent = { key, type: 'call.completed'|'call.inbound'|'contact.updated'|'opportunity.updated'|'unknown',
 *                     externalContactId, phone, call?: normalizedCall, raw }
 */
class CommunicationProvider {
  constructor() { this.name = 'base'; }
  capabilities() { return {}; }
  async health() { return { ok: false, detail: 'not implemented' }; }
  async upsertContact() { throw new Error(this.name + ': upsertContact not implemented'); }
  async setContactContext() { throw new Error(this.name + ': setContactContext not implemented'); }
  async startOutboundCall() { throw new Error(this.name + ': startOutboundCall not implemented'); }
  async listCallLogs() { return []; }
  async upsertOpportunity() { throw new Error(this.name + ': upsertOpportunity not implemented'); }
  parseWebhook() { return []; }
}

/**
 * NotConnectedProvider — what a tenant gets before it connects a platform.
 * It refuses every action plainly. There is no "pretend it called" path.
 */
class NotConnectedProvider extends CommunicationProvider {
  constructor(reason) { super(); this.name = 'not_connected'; this.reason = reason || 'No communications platform connected'; }
  capabilities() { return { outbound_ai_call: false, call_logs: false, opportunities: false, contact_fields: false }; }
  async health() { return { ok: false, detail: this.reason }; }
  async upsertContact() { throw Object.assign(new Error(this.reason), { code: 'NOT_CONNECTED' }); }
  async setContactContext() { throw Object.assign(new Error(this.reason), { code: 'NOT_CONNECTED' }); }
  async startOutboundCall() { throw Object.assign(new Error(this.reason), { code: 'NOT_CONNECTED' }); }
  async upsertOpportunity() { throw Object.assign(new Error(this.reason), { code: 'NOT_CONNECTED' }); }
}

module.exports = { CommunicationProvider, NotConnectedProvider };
