'use strict';

/**
 * HighLevel number provider: buys a US LC Phone number in a tenant's own
 * sub-account and gives it a Voice AI agent booking into that tenant's own
 * calendar.
 *
 * Replaces the Twilio + ConversationRelay path for NEW numbers: the account's
 * own Twilio voice has been disabled since 2026-08-07 (error 32005), while an
 * LC Phone number runs on HighLevel's Twilio and is answered by HighLevel
 * Voice AI. Existing Twilio numbers and the demo lines are untouched — only
 * buyNumber() is routed here (see telephony/index.js).
 *
 * CREDENTIALS COME FROM THE TENANT, NOT FROM ENV. `new GhlProvider({ creds })`
 * carries one sub-account's token and location; env is the fallback for the
 * single-client pilot only. Two tenants must never share a location.
 *
 * THE AGENT IS COPIED FROM A TEMPLATE, NOT INVENTED. The owner builds one agent
 * by hand (voice, language, tone, end-of-call workflows) and every client gets
 * a copy with only their own facts added. LITE_GHL_TEMPLATE_AGENT_ID names it;
 * unset, the first agent not already on a number is used.
 *
 * BUYING AND AGENT-BUILDING ARE SEPARATE CALLS ON PURPOSE. The purchase is the
 * only step that costs money and the only one that cannot be undone, so it
 * commits alone and the caller records it before anything else is attempted.
 * A failure afterwards keeps the number instead of buying a second one.
 */
const ghl = require('./ghl');
const tollFraud = require('../security/tollFraud');

// The conversations and contacts endpoints are documented under v3, while the
// phone-system calls this file already makes work on the date-stamped default.
// Overridable without a redeploy if HighLevel moves it again.
const SMS_VERSION = String(process.env.LITE_GHL_SMS_VERSION || 'v3').trim();
const MONTHLY_COST_USD = 1.15; // LC Phone local number, HighLevel pricing page 2026-09-01

function firstArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') for (const v of Object.values(data)) if (Array.isArray(v)) return v;
  return [];
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
  constructor(opts = {}) {
    this.name = 'ghl';
    this.creds = opts.creds || null;   // { token, locationId }; null = env fallback
  }
  static configured() { return ghl.configured(); }
  _c() { return this.creds; }
  _loc() { return ghl.locationId(this.creds); }

  async templateAgent() {
    const wanted = String(process.env.LITE_GHL_TEMPLATE_AGENT_ID || '').trim();
    if (wanted) {
      const a = await ghl.call('GET', `/voice-ai/agents/${encodeURIComponent(wanted)}`,
        { query: { locationId: this._loc() }, creds: this._c() });
      return (a && (a.agent || a)) || null;
    }
    const list = firstArray(await ghl.listVoiceAgents(this._c()));
    return list.find((a) => !a.inboundNumber) || list[0] || null;
  }

  /** Buy a US local number. Nothing else — see the class note. */
  async buyNumber({ country = 'US', areaCode, tenantId, allowAnyArea = false }) {
    if (country !== 'US') throw new Error('HighLevel numbers are US-only in this pilot');
    let pick = null;
    const wanted = areaCode && /^\d{3}$/.test(String(areaCode)) ? String(areaCode) : null;
    if (wanted) {
      // `firstPart` IS THE BARE AREA CODE, measured against the live API
      // 2026-09-25: firstPart='813' returns 9 Tampa numbers, firstPart='1813'
      // and '+1813' both return ZERO. Sending the country code silently
      // matched nothing, so every area-code request fell through to "any
      // number" and looked like HighLevel having no local stock.
      pick = firstArray(await ghl.searchAvailable({ firstPart: wanted }, this._c()))
        .find((n) => String(n.phoneNumber || n.number || '').startsWith(`+1${wanted}`)) || null;
    }
    // ASKING FOR 813 AND GETTING A MICHIGAN NUMBER IS NOT A NEAR MISS.
    // The old code fell straight through to "any number", so a client who
    // asked for their own city could be given another state's area code with
    // nothing on any screen saying so — and a local business's whole reason
    // for wanting a local number is that customers recognise it. If the area
    // was asked for and is not available, say so and let them choose.
    if (wanted && !pick && !allowAnyArea) {
      const e = new Error(`No numbers are available in area code ${wanted} right now. Pick another area code, or continue with any available US number.`);
      e.code = 'NO_NUMBER_IN_AREA'; e.area_code = wanted; throw e;
    }
    if (!pick) pick = firstArray(await ghl.searchAvailable({}, this._c()))[0] || null;
    const phoneNumber = pick && (pick.phoneNumber || pick.number);
    if (!phoneNumber) throw new Error('No US local numbers available on HighLevel');

    await ghl.call('POST', `/phone-system/numbers/location/${this._loc()}/purchase`, {
      creds: this._c(),
      body: {
        phoneNumber, countryCode: 'US', numberType: 'local',
        // Per-tenant, so a retried signup cannot buy a second number even if
        // our own guard is bypassed.
        fingerprintId: `ringlypro-lite-tenant-${tenantId}`,
      },
    });
    return { did: phoneNumber, providerSid: 'ghl-number', provider: 'ghl', monthlyCostUsd: MONTHLY_COST_USD };
  }

  /**
   * Create the client's agent on their number, booking into THEIR calendar.
   * Returns { id, actions: {...} } — an action that could not be added is
   * reported, never silently dropped.
   */
  async createAgent({ tenant, phoneNumber, calendarId }) {
    const tpl = await this.templateAgent();
    const t = tenant || {};
    const body = {
      locationId: this._loc(),
      agentName: String(t.business_name || `Tenant ${t.id}`).slice(0, 40),
      businessName: t.business_name || undefined,
      welcomeMessage: t.greeting || (tpl && tpl.welcomeMessage)
        || `Thanks for calling ${t.business_name || 'us'}. How can I help you today?`,
      agentPrompt: [tpl && tpl.agentPrompt, clientContext(t)].filter(Boolean).join('\n\n'),
      voiceId: tpl && tpl.voiceId ? tpl.voiceId : undefined,
      language: t.locale === 'es' ? 'es' : (tpl && tpl.language) || 'en-US',
      callEndWorkflowIds: (tpl && tpl.callEndWorkflowIds) || [],
      timezone: t.timezone || (tpl && tpl.timezone) || undefined,
      inboundNumber: phoneNumber,
    };
    const created = await ghl.call('POST', '/voice-ai/agents', { body, creds: this._c() });
    const agentId = (created && (created.id || (created.agent && created.agent.id))) || null;
    if (!agentId) { const e = new Error('HighLevel did not return an agent id'); e.code = 'NO_AGENT_ID'; throw e; }

    const actions = { booking: null, transfer: null };

    // Booking, pointed at this tenant's own calendar.
    if (calendarId) {
      try {
        const a = await ghl.call('POST', '/voice-ai/actions', {
          creds: this._c(),
          body: {
            agentId, locationId: this._loc(), actionType: 'APPOINTMENT_BOOKING', name: 'Book an appointment',
            actionParameters: { calendarId, daysOfOfferingDates: 14, hoursBetweenSlots: 1, slotsPerDay: 4 },
          },
        });
        actions.booking = (a && a.id) || 'created';
      } catch (e) { actions.booking = null; actions.bookingError = e.message; }
    }

    // Transfer, only to a destination the toll-fraud allow-list accepts. This
    // is the same gate the Twilio provider uses and it stays in the provider.
    const dest = t.transfer_number || t.owner_phone;
    const chk = dest ? tollFraud.checkDestination(dest, { defaultCountry: t.country }) : null;
    if (chk && chk.ok) {
      try {
        const a = await ghl.call('POST', '/voice-ai/actions', {
          creds: this._c(),
          body: {
            agentId, locationId: this._loc(), actionType: 'CALL_TRANSFER', name: 'Transfer to owner',
            actionParameters: {
              triggerPrompt: 'When the caller asks to speak to a person or the owner',
              transferToType: 'number', transferToValue: chk.e164,
            },
          },
        });
        actions.transfer = (a && a.id) || 'created';
      } catch (e) { actions.transfer = null; actions.transferError = e.message; }
    } else if (dest) {
      actions.transferRefused = 'the saved transfer number is not an allowed destination';
    }

    return { id: agentId, actions };
  }

  // HighLevel's API has no release endpoint; releasing is done in HighLevel.
  async releaseNumber() { return { released: false, manual: true, reason: 'Release the number in HighLevel > Phone System' }; }
  // Calls on a HighLevel number are answered by its Voice AI agent, never by Lite.
  async configureInboundWebhook() { return { ok: true, managed_by: 'ghl' }; }
  /**
   * Send an SMS from the tenant's OWN HighLevel number.
   *
   * WHY THIS REPLACED A STUB THAT THREW. Numbers and voice moved to HighLevel;
   * SMS never did, so `getProvider()` stayed Twilio and every owner alert went
   * out from a Twilio toll-free that has nothing to do with the client, on the
   * account whose voice is disabled and whose token had been rotated out from
   * under us. A client on a HighLevel number should be texted from that
   * number — it threads with their calls and it is the number their customer
   * already knows.
   *
   * THE TOLL-FRAUD GATE IS HERE, IN THE PROVIDER, exactly as it is in the
   * Twilio one. That placement is the whole design: a check at save time would
   * miss rows edited in the database or reached by a path written later, and
   * the security SIT fails if any file outside a provider reaches a send API.
   */
  async sendSMS({ from, to, body, purpose }) {
    const gate = tollFraud.authorize(purpose === 'demo' ? 'demo_sms' : 'sms', to);
    if (!gate.ok) { const e = new Error(`sms_refused:${gate.reason}`); e.code = 'TOLL_FRAUD_GUARD'; throw e; }
    to = gate.e164;
    if (!from) { const e = new Error('no HighLevel number to send from'); e.code = 'NO_FROM'; throw e; }

    // HighLevel requires a contactId on a message, the same way it does on an
    // appointment. An upsert is safe to repeat and returns the same contact.
    const up = await ghl.call('POST', '/contacts/upsert', {
      creds: this._c(), version: SMS_VERSION,
      body: { locationId: this._loc(), phone: to, source: 'RinglyPro' },
    });
    const contactId = up && (up.contact ? up.contact.id : up.id);
    if (!contactId) { const e = new Error('HighLevel did not return a contact id'); e.code = 'NO_CONTACT_ID'; throw e; }

    const sent = await ghl.call('POST', '/conversations/messages', {
      creds: this._c(), version: SMS_VERSION,
      body: { type: 'SMS', contactId, message: String(body || '').slice(0, 1500),
              fromNumber: from, toNumber: to },
    });
    return { sid: (sent && (sent.messageId || sent.id)) || null, provider: 'ghl' };
  }
  async redirectCall() { const e = new Error('ghl_transfer_is_an_agent_action'); e.code = 'GHL_WORKFLOWS'; throw e; }
}

GhlProvider.MONTHLY_COST_USD = MONTHLY_COST_USD;
GhlProvider.clientContext = clientContext;
module.exports = GhlProvider;
