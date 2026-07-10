'use strict';

/**
 * Call-forwarding dial-code generator (US + Colombia), two modes:
 *
 *  mode = 'direct'   → forward EVERY call immediately (owner phone never rings).
 *                      The AI always answers. Zero risk of hitting the owner's
 *                      carrier voicemail. GSM MMI service code 21 / Verizon *72.
 *
 *  mode = 'noanswer' → forward only when unanswered, but with an explicit short
 *                      ring timer (default 2 rings ≈ 10s) so the AI picks up
 *                      BEFORE the carrier voicemail (~25-30s default). GSM MMI
 *                      service code 61 with a settable no-reply timer (5-30s,
 *                      steps of 5). Verizon *71 (timer not configurable on CDMA).
 *
 * We deliberately do NOT use the generic **004# (all conditional) anymore — it
 * can't set the ring timer, so voicemail may answer first.
 *
 * IMPORTANT: deleting the app/account does NOT remove forwarding. The owner must
 * dial the deactivation code from their own handset.
 */

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

// rings → GSM no-reply timer seconds (5..30, multiples of 5). ~5s per ring.
function ringTimerSeconds(rings) {
  const secs = Math.round((Number(rings) || 2) * 5 / 5) * 5;
  return Math.max(5, Math.min(30, secs));
}

function tel(code) { return `tel:${encodeURIComponent(code)}`; }

function codesFor({ country = 'US', carrier, did, mode = 'noanswer', rings = 2 }) {
  const d = didForCode(did);
  const list = CARRIERS[country] || CARRIERS.US;
  const car = list.find(c => c.id === carrier) || list[0];
  const isDirect = mode === 'direct';

  if (car.family === 'verizon') {
    const activate = isDirect ? `*72${d}` : `*71${d}`;   // *72 = forward all, *71 = forward no-answer/busy
    return {
      carrier: car.label, family: 'verizon', mode: isDirect ? 'direct' : 'noanswer',
      rings: isDirect ? null : Math.round(ringTimerSeconds(rings) / 5),
      activate, deactivate: '*73', check: null,
      activate_tel: tel(activate), deactivate_tel: tel('*73'),
      note: isDirect ? null : 'Verizon does not let you set the ring count; it uses its default no-answer timer. For guaranteed pickup before voicemail, use Direct.'
    };
  }

  // GSM standard (AT&T, T-Mobile, Claro, Movistar, Tigo, WOM, most carriers).
  if (isDirect) {
    const activate = `**21*${d}#`;    // register + activate: forward ALL calls
    return {
      carrier: car.label, family: 'gsm', mode: 'direct', rings: null,
      activate, deactivate: '##21#', check: '*#21#',
      activate_tel: tel(activate), deactivate_tel: tel('##21#'), check_tel: tel('*#21#')
    };
  }
  const secs = ringTimerSeconds(rings);
  const activate = `**61*${d}**${secs}#`;  // forward NO-REPLY with a ${secs}s timer
  return {
    carrier: car.label, family: 'gsm', mode: 'noanswer', rings: Math.round(secs / 5), timer_seconds: secs,
    activate, deactivate: '##61#', check: '*#61#',
    activate_tel: tel(activate), deactivate_tel: tel('##61#'), check_tel: tel('*#61#')
  };
}

function carriers(country) { return CARRIERS[country] || CARRIERS.US; }

module.exports = { codesFor, carriers, ringTimerSeconds, CARRIERS };
