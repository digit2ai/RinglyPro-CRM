'use strict';

/**
 * HighLevel number provider: buys a US LC Phone number in the pilot
 * sub-account and gives it its own HighLevel Voice AI agent.
 *
 * Replaces the Twilio + Lina path for NEW numbers (owner decision 2026-09-22):
 * the account's own Twilio voice is disabled, while an LC Phone number runs on
 * HighLevel's Twilio, is answered by HighLevel Voice AI, and fires the owner's
 * HighLevel workflows. Existing Twilio numbers and the web-chat demo are
 * untouched; only buyNumber() is routed here (see telephony/index.js).
 *
 * THE AGENT IS COPIED FROM A TEMPLATE, NOT INVENTED. The owner builds one
 * agent by hand in the pilot sub-account (voice, language, end-of-call
 * workflows, tone). Each new client gets a copy of that agent with only the
 * client's own facts filled in. LITE_GHL_TEMPLATE_AGENT_ID names it; unset,
 * the first agent in the sub-account that is not already on a number is used.
 *
 * ORDER MATTERS AND IS SAFE ON FAILURE. The number is bought first (the only
 * step that costs money), with a fingerprint per tenant so a retried request
 * cannot buy a second one. If creating the agent then fails, the number is
 * returned anyway with agent:null so it is recorded and can be finished by
 * hand in HighLevel rather than bought again.
 */
const ghl = require('./ghl');
const tollFraud = require('../security/tollFraud');

const MONTHLY_COST_USD = 1.15; // LC Phone local number, HighLevel pricing page 2026-09-01

function firstArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') for (const v of Object.values(data)) if (Array.isArray(v)) return v;
  return [];
}

async function templateAgent() {
  const wanted = String(process.env.LITE_GHL_TEMPLATE_AGENT_ID || '').trim();
  if (wanted) {
    const a = await ghl.call('GET', `/voice-ai/agents/${encodeURIComponent(wanted)}`, { query: { locationId: ghl.locationId() } });
    return (a && (a.agent || a)) || null;
  }
  const list = firstArray(await ghl.listVoiceAgents());
  return list.find((a) => !a.inboundNumber) || list[0] || null;
}

/** The client's facts, stated plainly. Never a promise the tenant did not make. */
function clientContext(t) {
  const lines = [
    `You answer calls for ${t.business_name}.`,
    t.owner_name ? `The owner is ${t.owner_name}.` : null,
    t.timezone ? `The business timezone is ${t.timezone}.` : null,
    'Take a message (caller name, callback number, reason) or book an appointment.',
    'Never quote a price, hour or policy the business has not given you; offer to take a message instead.',
  ];
  return lines.filter(Boolean).join('\n');
}

class GhlProvider {
  constructor() { this.name = 'ghl'; }
  static configured() { return ghl.configured(); }

  async buyNumber({ country = 'US', areaCode, tenantId, tenant }) {
    if (country !== 'US') throw new Error('HighLevel numbers are US-only in this pilot');
    // 1. Find a number. An area code narrows the search; none available there = any US local number.
    let pick = null;
    if (areaCode && /^\d{3}$/.test(String(areaCode))) {
      pick = firstArray(await ghl.searchAvailable({ firstPart: `1${areaCode}` }))[0] || null;
    }
    if (!pick) pick = firstArray(await ghl.searchAvailable())[0] || null;
    const phoneNumber = pick && (pick.phoneNumber || pick.number);
    if (!phoneNumber) throw new Error('No US local numbers available on HighLevel');

    // 2. Buy it. The fingerprint makes a retried request idempotent per tenant.
    await ghl.call('POST', `/phone-system/numbers/location/${ghl.locationId()}/purchase`, {
      body: { phoneNumber, countryCode: 'US', numberType: 'local', fingerprintId: `ringlypro-lite-tenant-${tenantId}` },
    });

    // 3. Give it an agent copied from the template. A failure here keeps the number.
    let agentId = null; let agentError = null;
    try {
      const tpl = await templateAgent();
      const t = tenant || {};
      const body = {
        locationId: ghl.locationId(),
        agentName: String(t.business_name || `Tenant ${tenantId}`).slice(0, 40),
        businessName: t.business_name || undefined,
        welcomeMessage: t.greeting || (tpl && tpl.welcomeMessage) || `Thanks for calling ${t.business_name || 'us'}. How can I help you today?`,
        agentPrompt: [tpl && tpl.agentPrompt, clientContext(t)].filter(Boolean).join('\n\n'),
        voiceId: tpl && tpl.voiceId ? tpl.voiceId : undefined,
        language: t.locale === 'es' ? 'es' : (tpl && tpl.language) || 'en-US',
        callEndWorkflowIds: (tpl && tpl.callEndWorkflowIds) || [],
        timezone: t.timezone || (tpl && tpl.timezone) || undefined,
        inboundNumber: phoneNumber,
      };
      const created = await ghl.call('POST', '/voice-ai/agents', { body });
      agentId = (created && (created.id || (created.agent && created.agent.id))) || null;

      // 4. Transfer to the owner, only to a destination the toll-fraud allow-list accepts.
      const dest = t.transfer_number || t.owner_phone;
      const chk = dest ? tollFraud.checkDestination(dest, { defaultCountry: t.country }) : null;
      if (agentId && chk && chk.ok) {
        try {
          await ghl.call('POST', '/voice-ai/actions', { body: {
            agentId, locationId: ghl.locationId(), actionType: 'CALL_TRANSFER', name: 'Transfer to owner',
            actionParameters: { triggerPrompt: 'When the caller asks to speak to a person or the owner',
              transferToType: 'number', transferToValue: chk.e164 },
          } });
        } catch (e) { console.warn('[lite:ghl] transfer action not added:', e.message); }
      }
    } catch (e) {
      agentError = e.message;
      console.error(`[lite:ghl] number ${tollFraud.mask(phoneNumber)} bought but the agent was not created: ${e.message}`);
    }

    return {
      did: phoneNumber,
      providerSid: agentId ? `ghl-agent:${agentId}` : 'ghl-agent:pending',
      provider: 'ghl',
      monthlyCostUsd: MONTHLY_COST_USD,
      agent: agentId,
      agentError,
    };
  }

  // HighLevel's API has no release endpoint; releasing is done in HighLevel.
  async releaseNumber() { return { released: false, manual: true, reason: 'Release the number in HighLevel > Phone System' }; }
  // Calls on a HighLevel number are answered by its Voice AI agent, never by Lite.
  async configureInboundWebhook() { return { ok: true, managed_by: 'ghl' }; }
  async sendSMS() { const e = new Error('ghl_sms_via_workflows'); e.code = 'GHL_WORKFLOWS'; throw e; }
  async redirectCall() { const e = new Error('ghl_transfer_is_an_agent_action'); e.code = 'GHL_WORKFLOWS'; throw e; }
}

GhlProvider.MONTHLY_COST_USD = MONTHLY_COST_USD;
GhlProvider.clientContext = clientContext;
module.exports = GhlProvider;
