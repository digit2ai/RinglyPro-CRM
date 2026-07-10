'use strict';

/**
 * Minimal EN/ES string table driven by tenant locale.
 * Used for voice greetings, SMS bodies, and dashboard copy.
 */
const STR = {
  en: {
    greeting: (biz) => `Thank you for calling ${biz}. I'm the AI assistant. I can take a message or book you an appointment — how can I help?`,
    greetingKnown: (biz, name) => `Hi ${name}, thanks for calling ${biz}. I can take a message or book an appointment — what do you need?`,
    smsMessageOwner: (biz, name, phone, body) => `${biz} — new message from ${name || 'a caller'}${phone ? ' (' + phone + ')' : ''}: ${body}`,
    smsBookingOwner: (biz, name, when) => `${biz} — new appointment: ${name || 'caller'} on ${when}.`,
    smsBookingCaller: (biz, when) => `${biz}: your appointment is confirmed for ${when}. Reply to this number to reach us.`,
    voicemail: (biz) => `Thank you for calling ${biz}. We can't take your call right now. Please leave a message after the beep.`
  },
  es: {
    greeting: (biz) => `Gracias por llamar a ${biz}. Soy el asistente de inteligencia artificial. Puedo tomar un mensaje o agendarle una cita. ¿En qué le puedo ayudar?`,
    greetingKnown: (biz, name) => `Hola ${name}, gracias por llamar a ${biz}. Puedo tomar un mensaje o agendar una cita. ¿Qué necesita?`,
    smsMessageOwner: (biz, name, phone, body) => `${biz} — nuevo mensaje de ${name || 'una persona'}${phone ? ' (' + phone + ')' : ''}: ${body}`,
    smsBookingOwner: (biz, name, when) => `${biz} — nueva cita: ${name || 'llamante'} el ${when}.`,
    smsBookingCaller: (biz, when) => `${biz}: su cita quedó confirmada para el ${when}. Responda a este número para contactarnos.`,
    voicemail: (biz) => `Gracias por llamar a ${biz}. No podemos atender su llamada en este momento. Por favor deje un mensaje después del tono.`
  }
};

function t(locale) { return STR[locale === 'es' ? 'es' : 'en']; }

// Language + transcription codes for ConversationRelay per locale + country.
function relayLang(locale, country) {
  if (locale === 'es') return country === 'CO' ? 'es-CO' : 'es-US';
  return 'en-US';
}

module.exports = { t, relayLang, STR };
