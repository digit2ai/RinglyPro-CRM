'use strict';

/**
 * Conditional call-forwarding dial-code generator (US + Colombia).
 *
 * GSM standard (works on most GSM carriers incl. Colombia Claro/Movistar/Tigo/WOM
 * and US AT&T / T-Mobile):
 *   Activate "forward when unanswered": **004*<DID>#
 *   Deactivate ALL conditional forwarding: ##004#
 *   Check status: *#004#
 *
 * US CDMA-heritage (Verizon) uses star codes:
 *   Forward-no-answer: *71<DID>   Turn off: *73
 *
 * IMPORTANT: deleting the app/account does NOT remove forwarding. The caller
 * must dial ##004# (GSM) or *73 (Verizon) from their own handset.
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

// Normalize a DID for embedding in a dial code. GSM codes want the raw digits
// with country/plus; we keep the leading + for GSM (handsets accept it).
function didForCode(did) { return String(did || '').replace(/[^0-9+]/g, ''); }

function codesFor({ country = 'US', carrier, did }) {
  const d = didForCode(did);
  const list = CARRIERS[country] || CARRIERS.US;
  const car = list.find(c => c.id === carrier) || list[0];

  if (car.family === 'verizon') {
    return {
      carrier: car.label, family: 'verizon',
      activate: `*71${d}`,
      deactivate: '*73',
      check: null,
      activate_tel: `tel:${encodeURIComponent(`*71${d}`)}`,
      deactivate_tel: 'tel:*73'
    };
  }
  // GSM standard conditional-forward (no-answer) code family.
  return {
    carrier: car.label, family: 'gsm',
    activate: `**004*${d}#`,
    deactivate: '##004#',
    check: '*#004#',
    activate_tel: `tel:${encodeURIComponent(`**004*${d}#`)}`,
    deactivate_tel: `tel:${encodeURIComponent('##004#')}`
  };
}

function carriers(country) { return CARRIERS[country] || CARRIERS.US; }

module.exports = { codesFor, carriers, CARRIERS };
