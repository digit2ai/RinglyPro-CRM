'use strict';

/**
 * GoHighLevelProvider — RinglyPro Supply's communications layer on HighLevel.
 *
 * Every GHL HTTP call in the vertical lives in this file (SIT greps for
 * leadconnectorhq elsewhere). Endpoints used, each checked against HighLevel's
 * published API docs on 2026-09-23 — see ghlCapabilities.js for the full map:
 *
 *   POST /contacts/upsert                              contact sync
 *   PUT  /contacts/{id}                                custom fields (the context the agent reads)
 *   GET  /locations/{loc}/customFields                 find our field ids
 *   POST /locations/{loc}/customFields                 create them once
 *   POST /contacts/{id}/workflow/{workflowId}          enroll = start the outbound AI call
 *   GET  /voice-ai/dashboard/call-logs  (Version v3)   what happened on the call
 *   POST /opportunities/ , PUT /opportunities/{id}     pipeline mirror
 *   GET  /locations/{loc}                              health
 *
 * THE OUTBOUND CALL IS A WORKFLOW, NOT AN API CALL. HighLevel places Voice AI
 * outbound calls only through the "Voice AI Outbound Call" workflow action.
 * So startOutboundCall enrolls the contact in the campaign's workflow and
 * returns accepted:true with NO call id: the id exists only once the call log
 * appears, and inventing one here would be a lie the attribution chain then
 * repeats.
 *
 * Resilience: 15 s timeout, two retries with backoff on 429/5xx/network,
 * never on 4xx (a permission refusal repeated is still a refusal).
 */

const { CommunicationProvider } = require('./CommunicationProvider');

const BASE = () => process.env.SUPPLY_GHL_BASE || 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';
const VOICE_VERSION = () => process.env.SUPPLY_GHL_VOICE_VERSION || 'v3';

// The contact custom fields RinglyPro Supply owns inside GHL. The inbound and
// outbound Voice AI agents reference them in their prompts (manual step).
const FIELDS = [
  { key: 'rps_context', name: 'RinglyPro Supply Context', dataType: 'LARGE_TEXT' },
  { key: 'rps_offer', name: 'RinglyPro Supply Offer', dataType: 'LARGE_TEXT' },
  { key: 'rps_rep', name: 'RinglyPro Supply Assigned Rep', dataType: 'TEXT' },
  { key: 'rps_campaign', name: 'RinglyPro Supply Campaign', dataType: 'TEXT' }
];
// What the Voice AI agent should extract (configured in GHL, read back from call logs).
const EXTRACT_KEYS = ['rps_outcome', 'rps_interest', 'rps_product', 'rps_quantity', 'rps_timeframe', 'rps_wants_transfer', 'rps_price_discussed', 'rps_notes'];

let transport = null; // SIT injects a fake: async ({method,url,headers,params,data}) => {status,data}
function _setTransport(fn) { transport = fn; }

async function send(opts) {
  if (transport) return transport(opts);
  const axios = require('axios');
  const r = await axios({ ...opts, timeout: 15000, validateStatus: () => true });
  return { status: r.status, data: r.data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class GoHighLevelProvider extends CommunicationProvider {
  /** creds = { token, locationId } ; onResult = (ok, err) => void for health tracking */
  constructor(creds, onResult) {
    super();
    this.name = 'gohighlevel';
    this.creds = creds || {};
    this.onResult = onResult || (() => {});
    this.fieldIds = null;
  }

  capabilities() {
    return { outbound_ai_call: 'workflow_enrollment', call_logs: true, opportunities: true, contact_fields: true, inbound_context: 'contact_custom_field' };
  }

  async call(method, path, { params, data, version } = {}) {
    if (!this.creds.token || !this.creds.locationId) throw Object.assign(new Error('GoHighLevel is not connected for this tenant'), { code: 'NOT_CONNECTED' });
    const headers = { Authorization: 'Bearer ' + this.creds.token, Version: version || VERSION, Accept: 'application/json', 'Content-Type': 'application/json' };
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await send({ method, url: BASE() + path, headers, params, data });
        if (r.status >= 200 && r.status < 300) { this.onResult(true); return r.data; }
        const msg = (r.data && (r.data.message || r.data.error)) || ('HTTP ' + r.status);
        last = Object.assign(new Error('GoHighLevel ' + method + ' ' + path.split('?')[0] + ' failed: ' + (Array.isArray(msg) ? msg.join('; ') : msg)), { status: r.status, code: 'GHL_HTTP' });
        if (r.status !== 429 && r.status < 500) break; // 4xx: do not repeat a refusal
      } catch (e) {
        last = Object.assign(new Error('GoHighLevel unreachable: ' + e.message), { code: 'GHL_NETWORK' });
      }
      if (attempt < 2) await sleep(transport ? 1 : 800 * (attempt + 1) * (attempt + 1));
    }
    this.onResult(false, last);
    throw last;
  }

  async health() {
    try {
      const d = await this.call('GET', '/locations/' + encodeURIComponent(this.creds.locationId));
      const loc = d && (d.location || d);
      return { ok: true, detail: 'Connected to location ' + ((loc && loc.name) || this.creds.locationId) };
    } catch (e) { return { ok: false, detail: e.message }; }
  }

  async ensureFields() {
    if (this.fieldIds) return this.fieldIds;
    const loc = encodeURIComponent(this.creds.locationId);
    const d = await this.call('GET', `/locations/${loc}/customFields`, { params: { model: 'contact' } });
    const list = (d && d.customFields) || [];
    const ids = {};
    const tags = {};
    for (const f of FIELDS) {
      let found = list.find((c) => String(c.fieldKey || '').replace(/^contact\./, '') === f.key || c.name === f.name);
      if (!found) {
        const made = await this.call('POST', `/locations/${loc}/customFields`, { data: { name: f.name, dataType: f.dataType, model: 'contact' } });
        found = made && (made.customField || made);
      }
      if (found && found.id) ids[f.key] = found.id;
      // GHL derives the merge key from the field NAME; the prompt must use this exact tag.
      if (found && found.fieldKey) tags[f.key] = '{{' + found.fieldKey + '}}';
    }
    this.fieldIds = ids;
    this.fieldTags = tags;
    return ids;
  }

  async upsertContact(tenant, c) {
    const [first, ...rest] = String(c.contact_name || '').trim().split(/\s+/);
    const data = {
      locationId: this.creds.locationId,
      phone: c.phone_e164 || undefined,
      email: c.email || undefined,
      firstName: first || undefined,
      lastName: rest.join(' ') || undefined,
      companyName: c.company_name || undefined,
      website: c.website || undefined,
      address1: c.address || undefined,
      city: c.city || undefined,
      state: c.state || undefined,
      postalCode: c.zip || undefined,
      source: 'RinglyPro Supply',
      tags: ['ringlypro-supply'].concat(c.do_not_contact ? ['rps-do-not-call'] : [])
    };
    const d = await this.call('POST', '/contacts/upsert', { data });
    const id = d && d.contact && d.contact.id;
    if (!id) throw Object.assign(new Error('GoHighLevel returned no contact id'), { code: 'GHL_SHAPE' });
    return { externalId: id };
  }

  async setContactContext(tenant, externalId, fields) {
    const ids = await this.ensureFields().catch(() => ({}));
    const customFields = Object.entries(fields)
      .filter(([k]) => FIELDS.some((f) => f.key === k))
      .map(([k, v]) => (ids[k] ? { id: ids[k], field_value: String(v == null ? '' : v).slice(0, 4000) } : { key: k, field_value: String(v == null ? '' : v).slice(0, 4000) }));
    await this.call('PUT', '/contacts/' + encodeURIComponent(externalId), { data: { customFields } });
    return { ok: true };
  }

  async startOutboundCall(tenant, { externalContactId, campaign }) {
    const wf = campaign && campaign.agent && campaign.agent.ghl_workflow_id;
    if (!wf) throw Object.assign(new Error('Campaign has no GoHighLevel outbound workflow id'), { code: 'NO_WORKFLOW' });
    await this.call('POST', `/contacts/${encodeURIComponent(externalContactId)}/workflow/${encodeURIComponent(wf)}`, { data: {} });
    return { accepted: true, mode: 'workflow_enrollment', providerRef: null };
  }

  async listCallLogs(tenant, { since, until, contactId, agentId } = {}) {
    const params = { locationId: this.creds.locationId, page: 1, pageSize: 50, sortBy: 'createdAt', sort: 'descend' };
    if (since && until) { params.startDate = Math.floor(new Date(since).getTime() / 1000); params.endDate = Math.floor(new Date(until).getTime() / 1000); }
    if (contactId) params.contactId = contactId;
    if (agentId) params.agentId = agentId;
    const d = await this.call('GET', '/voice-ai/dashboard/call-logs', { params, version: VOICE_VERSION() });
    return ((d && d.callLogs) || []).map(normalizeCallLog);
  }

  async upsertOpportunity(tenant, { externalId, externalContactId, name, pipelineId, stageId, value, status }) {
    if (!pipelineId || !stageId) throw Object.assign(new Error('GoHighLevel pipeline or stage not mapped for this tenant'), { code: 'NO_PIPELINE' });
    const data = { pipelineId, pipelineStageId: stageId, name, status: status || 'open', contactId: externalContactId, monetaryValue: value || undefined };
    if (externalId) {
      await this.call('PUT', '/opportunities/' + encodeURIComponent(externalId), { data });
      return { externalId };
    }
    const d = await this.call('POST', '/opportunities/', { data: Object.assign({ locationId: this.creds.locationId }, data) });
    const id = d && d.opportunity && d.opportunity.id;
    if (!id) throw Object.assign(new Error('GoHighLevel returned no opportunity id'), { code: 'GHL_SHAPE' });
    return { externalId: id };
  }

  parseWebhook(body) { return parseGhlWebhook(body); }

  // ── Setup (auto-configuration). Paths and bodies from HighLevel's API docs, 2026-09-24. ──
  /** GET /phone-system/numbers/location/{loc} (Version v3) -> [{ phoneNumber, friendlyName }] */
  async listNumbers() {
    const d = await this.call('GET', '/phone-system/numbers/location/' + encodeURIComponent(this.creds.locationId), { params: { pageSize: 100 }, version: 'v3' });
    const data = (d && (d.data || d)) || {};
    return (data.numbers || []).map((n) => ({ phoneNumber: n.phoneNumber, friendlyName: n.friendlyName || null }));
  }
  /** GET /voice-ai/agents (Version v3) */
  async listAgents() {
    const d = await this.call('GET', '/voice-ai/agents', { params: { locationId: this.creds.locationId, page: 1, pageSize: 50 }, version: VOICE_VERSION() });
    return (d && (d.agents || d.data || [])) || [];
  }
  /** POST /voice-ai/agents (Version v3) -> { id } */
  async createAgent(body) {
    const d = await this.call('POST', '/voice-ai/agents', { data: Object.assign({ locationId: this.creds.locationId }, body), version: VOICE_VERSION() });
    const id = d && (d.id || (d.agent && d.agent.id));
    if (!id) throw Object.assign(new Error('GoHighLevel returned no agent id'), { code: 'GHL_SHAPE' });
    return { id };
  }
  /** PATCH /voice-ai/agents/{id} (Version v3) */
  async updateAgent(id, body) {
    // GHL reads locationId from the QUERY on PATCH ("LocationId is required" when it is only in the body).
    await this.call('PATCH', '/voice-ai/agents/' + encodeURIComponent(id), { params: { locationId: this.creds.locationId }, data: body, version: VOICE_VERSION() });
    return { id };
  }
  /** POST /voice-ai/actions (Version v3) -> { id } */
  async createAgentAction(agentId, actionType, name, actionParameters) {
    const d = await this.call('POST', '/voice-ai/actions', { data: { agentId, locationId: this.creds.locationId, actionType, name, actionParameters }, version: VOICE_VERSION() });
    return { id: d && (d.id || (d.action && d.action.id)) };
  }
  /** GET /workflows/?locationId= — docs list Version v3; older tokens answer on 2021-07-28. */
  async listWorkflows() {
    let d;
    try { d = await this.call('GET', '/workflows/', { params: { locationId: this.creds.locationId }, version: 'v3' }); }
    catch (e) { if (e.status && e.status < 500 && e.status !== 401 && e.status !== 403) d = await this.call('GET', '/workflows/', { params: { locationId: this.creds.locationId } }); else throw e; }
    return ((d && (d.workflows || (d.data && d.data.workflows))) || []).map((w) => ({ id: w.id, name: w.name, status: w.status }));
  }
  fieldTag(key) { return (this.fieldTags && this.fieldTags[key]) || null; }
}

function normalizeCallLog(l) {
  return {
    providerCallId: l.id || null,
    externalContactId: l.contactId || null,
    agentId: l.agentId || null,
    fromNumber: l.fromNumber || null,
    direction: l.direction || null,
    startedAt: l.createdAt || null,
    durationSec: l.duration != null ? Math.round(Number(l.duration)) : null,
    summary: l.summary || null,
    transcript: l.transcript || null,
    extracted: l.extractedData && typeof l.extractedData === 'object' ? l.extractedData : {},
    actions: (l.executedCallActions || []).map((a) => ({ type: a.actionType || a.type || 'unknown', at: a.executedAt || a.createdAt || null })),
    trial: !!l.trialCall
  };
}

/**
 * Webhooks reach us from GHL workflows ("Webhook" / "Custom Webhook" actions,
 * configured by hand). The body shape is whatever the workflow sends, so this
 * accepts the standard contact payload (contact_id, phone, customData) and
 * our documented custom keys. A webhook is a SIGNAL: the call data itself is
 * re-read from the call-logs API by the ingest layer when the body lacks it.
 */
function parseGhlWebhook(body) {
  const b = body || {};
  const cd = b.customData || b.custom_data || {};
  const type = String(b.event || cd.event || b.type || '').toLowerCase();
  const contactId = b.contact_id || b.contactId || cd.contact_id || (b.contact && b.contact.id) || null;
  const phone = b.phone || cd.phone || (b.contact && b.contact.phone) || null;
  const callId = b.call_id || b.callId || cd.call_id || null;
  let kind = 'unknown';
  if (/call[._ ]?(completed|ended|end)|voice.?ai/.test(type)) kind = 'call.completed';
  else if (/inbound/.test(type)) kind = 'call.inbound';
  else if (/opportunit/.test(type)) kind = 'opportunity.updated';
  else if (/contact/.test(type)) kind = 'contact.updated';
  const call = (b.summary || b.transcript || b.extractedData || cd.summary) ? normalizeCallLog({
    id: callId, contactId, summary: b.summary || cd.summary, transcript: b.transcript || cd.transcript,
    extractedData: b.extractedData || cd.extractedData || pickExtract(Object.assign({}, b, cd)), duration: b.duration || cd.duration,
    createdAt: b.createdAt || cd.createdAt, executedCallActions: b.executedCallActions || cd.executedCallActions, fromNumber: phone
  }) : null;
  const key = callId ? 'call:' + callId : (b.webhookId || b.id || null);
  return [{ key, type: kind, externalContactId: contactId, phone, direction: b.direction || cd.direction || null, call, raw: b }];
}
function pickExtract(o) {
  const out = {};
  for (const k of EXTRACT_KEYS) if (o[k] != null && o[k] !== '') out[k] = o[k];
  return out;
}

module.exports = { GoHighLevelProvider, normalizeCallLog, parseGhlWebhook, FIELDS, EXTRACT_KEYS, _setTransport };
