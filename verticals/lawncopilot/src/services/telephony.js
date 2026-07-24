'use strict';

/**
 * Lawn Co-Pilot — the phone layer (RinglyPro Lite, integrated)
 *
 * A landscaper's calls are the whole point of the Receptionist, so a company
 * needs a real number and a way to send missed calls to it. That is exactly
 * what RinglyPro Lite does: a dedicated DID + carrier call-forwarding so the AI
 * answers what the owner cannot.
 *
 * WHY THIS IS A PORT, NOT A require('../../../ringlypro-lite'):
 * RinglyPro Lite is a SEPARATE Render service with its own database and its own
 * Twilio subaccount, and its charter forbids coupling it to the full app. So
 * Lawn Co-Pilot carries its own copy of the two things it needs from Lite —
 * number provisioning and the carrier forwarding codes — using the same proven
 * logic, wired to Lawn Co-Pilot's own tenants and the same Twilio account the
 * rest of this repo already uses. The Brain and the ConversationRelay entry in
 * routes/voice.js are unchanged: this only gives a tenant the number that entry
 * resolves against, and tells the owner how to forward to it.
 *
 * HONESTY: with no Twilio credentials configured, provisioning does NOT invent
 * a number. It returns a clearly-labeled "manual" result so the owner (or the
 * operator) wires a number by hand, and the forwarding codes still work against
 * whatever number is on file.
 */

const { Tenant } = require('../models');

// ── Carrier call-forwarding codes (US + Colombia) ──────────────────────────
// Ported from ringlypro-lite/src/services/forwardingCodes.js. Two modes:
//   direct   — forward EVERY call; the AI always answers (GSM **21, Verizon *72)
//   noanswer — forward only unanswered, with a short ring timer so the AI picks
//              up BEFORE carrier voicemail (GSM **61 with timer, Verizon *71)
const CARRIERS = {
  US: [
    { id: 'att', label: 'AT&T', family: 'gsm' },
    { id: 'tmobile', label: 'T-Mobile', family: 'gsm' },
    { id: 'verizon', label: 'Verizon', family: 'verizon' },
    { id: 'other_us', label: 'Other US carrier', family: 'gsm' }
  ],
  CO: [
    { id: 'claro', label: 'Claro', family: 'gsm' },
    { id: 'movistar', label: 'Movistar', family: 'gsm' },
    { id: 'tigo', label: 'Tigo', family: 'gsm' },
    { id: 'wom', label: 'WOM', family: 'gsm' },
    { id: 'other_co', label: 'Otro operador', family: 'gsm' }
  ]
};

function didForCode(did) { return String(did || '').replace(/[^0-9+]/g, ''); }
function ringTimerSeconds(rings) {
  const secs = Math.round((Number(rings) || 2) * 5 / 5) * 5;
  return Math.max(5, Math.min(30, secs));
}
function tel(code) { return `tel:${encodeURIComponent(code)}`; }

function forwardingCodes({ country = 'US', carrier, did, mode = 'noanswer', rings = 2 }) {
  const d = didForCode(did);
  const list = CARRIERS[country] || CARRIERS.US;
  const car = list.find(c => c.id === carrier) || list[0];
  const isDirect = mode === 'direct';

  if (car.family === 'verizon') {
    const activate = isDirect ? `*72${d}` : `*71${d}`;
    return {
      carrier: car.label, family: 'verizon', mode: isDirect ? 'direct' : 'noanswer',
      activate, deactivate: '*73',
      activate_tel: tel(activate), deactivate_tel: tel('*73'),
      note: isDirect ? null
        : 'Verizon uses its own no-answer timer. For guaranteed pickup before voicemail, choose Direct.'
    };
  }
  if (isDirect) {
    const activate = `**21*${d}#`;
    return {
      carrier: car.label, family: 'gsm', mode: 'direct',
      activate, deactivate: '##21#', check: '*#21#',
      activate_tel: tel(activate), deactivate_tel: tel('##21#'), check_tel: tel('*#21#')
    };
  }
  const secs = ringTimerSeconds(rings);
  const activate = `**61*${d}**${secs}#`;
  return {
    carrier: car.label, family: 'gsm', mode: 'noanswer', timer_seconds: secs,
    activate, deactivate: '##61#', check: '*#61#',
    activate_tel: tel(activate), deactivate_tel: tel('##61#'), check_tel: tel('*#61#')
  };
}

function carrierList(country = 'US') {
  return (CARRIERS[country] || CARRIERS.US).map(c => ({ id: c.id, label: c.label }));
}

// ── Number provisioning ────────────────────────────────────────────────────
function twilioConfigured() {
  return !!(process.env.LAWNCOPILOT_TWILIO_SID || process.env.TWILIO_ACCOUNT_SID)
      && !!(process.env.LAWNCOPILOT_TWILIO_TOKEN || process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Search and buy a local number, point its Voice webhook at the relay entry,
 * and store it as the tenant's Receptionist number. Returns a labeled 'manual'
 * result when Twilio is not configured — never a fabricated number.
 */
async function provisionNumber(tenant_id, { areaCode, country = 'US' } = {}) {
  const tenant = await Tenant.findByPk(tenant_id);
  if (!tenant) return { success: false, error: 'No such company' };

  if (tenant.phone) {
    return { success: true, already: true, number: tenant.phone,
      message: 'This company already has a Receptionist number.' };
  }

  if (!twilioConfigured()) {
    return {
      success: true, mode: 'manual', number: null,
      message: 'Twilio is not configured on this environment, so no number was purchased. '
        + 'Set LAWNCOPILOT_TWILIO_SID and LAWNCOPILOT_TWILIO_TOKEN (or the account TWILIO_* pair), '
        + 'or enter a number you already own in the admin. Forwarding setup works either way.',
      configure_hint: ['LAWNCOPILOT_TWILIO_SID', 'LAWNCOPILOT_TWILIO_TOKEN']
    };
  }

  try {
    const twilio = require('twilio');
    const client = twilio(
      process.env.LAWNCOPILOT_TWILIO_SID || process.env.TWILIO_ACCOUNT_SID,
      process.env.LAWNCOPILOT_TWILIO_TOKEN || process.env.TWILIO_AUTH_TOKEN
    );
    const base = process.env.LAWNCOPILOT_BASE_URL || 'https://aiagent.ringlypro.com';
    const voiceUrl = `${base}/lawncopilot/voice/incoming`;
    const statusUrl = `${base}/lawncopilot/voice/status`;

    const found = await client.availablePhoneNumbers(country).local.list({
      areaCode: areaCode ? Number(areaCode) : undefined,
      voiceEnabled: true, smsEnabled: true, limit: 1
    });
    if (!found.length) return { success: false, error: 'No numbers available in that area code. Try another.' };

    const bought = await client.incomingPhoneNumbers.create({
      phoneNumber: found[0].phoneNumber,
      voiceUrl, voiceMethod: 'POST',
      statusCallback: statusUrl, statusCallbackMethod: 'POST',
      friendlyName: `Lawn Co-Pilot · ${tenant.name}`
    });

    tenant.phone = bought.phoneNumber;
    tenant.settings = { ...(tenant.settings || {}), twilio_number_sid: bought.sid };
    await tenant.save();
    require('../tenancy').cacheBust(tenant.slug);

    return { success: true, mode: 'provisioned', number: bought.phoneNumber, sid: bought.sid,
      message: 'Your Receptionist number is live and pointed at Lawn Co-Pilot.' };
  } catch (e) {
    return { success: false, error: `Could not provision a number: ${e.message}` };
  }
}

/**
 * Set the Receptionist number manually (a number the owner already controls).
 */
async function setNumber(tenant_id, number) {
  const digits = String(number || '').replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length < 10) return { success: false, error: 'Enter a valid phone number with area code.' };
  const tenant = await Tenant.findByPk(tenant_id);
  if (!tenant) return { success: false, error: 'No such company' };
  tenant.phone = digits;
  await tenant.save();
  require('../tenancy').cacheBust(tenant.slug);
  return { success: true, number: digits, message: 'Receptionist number saved.' };
}

/**
 * The phone-layer status for a tenant: number, whether calls route, and — if a
 * carrier/mobile is known — the exact forwarding code the owner should dial.
 */
async function phoneStatus(tenant_id, { country = 'US', carrier, mode = 'noanswer', rings = 2 } = {}) {
  const tenant = await Tenant.findByPk(tenant_id, { raw: true });
  if (!tenant) return { success: false, error: 'No such company' };
  const has = !!tenant.phone;
  return {
    success: true,
    receptionist_number: tenant.phone || null,
    transfers_to: tenant.owner_phone || null,
    routes: has,
    twilio_configured: twilioConfigured(),
    carriers: carrierList(country),
    forwarding: has ? forwardingCodes({ country, carrier, did: tenant.phone, mode, rings }) : null,
    powered_by: 'RinglyPro Lite'
  };
}

module.exports = {
  forwardingCodes, carrierList, twilioConfigured,
  provisionNumber, setNumber, phoneStatus
};
