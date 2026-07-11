'use strict';

/**
 * Minimal EN/ES string table driven by tenant locale.
 * Used for voice greetings, SMS bodies, and dashboard copy.
 */
const STR = {
  en: {
    greeting: (biz) => `Hi, this is Lina with ${biz}. I'd be glad to help — I can book you an appointment or take a message. What can I do for you today?`,
    greetingKnown: (biz, name) => `Hi ${name}, it's Lina with ${biz} — so nice to hear from you again. Would you like to book an appointment or leave a message?`,
    transferSay: (biz) => `Of course — let me connect you now. One moment please.`,
    smsMessageOwner: (biz, name, phone, body) => `${biz} — new message from ${name || 'a caller'}${phone ? ' (' + phone + ')' : ''}: ${body}`,
    smsBookingOwner: (biz, name, when) => `${biz} — new appointment: ${name || 'caller'} on ${when}.`,
    smsBookingCaller: (biz, when) => `${biz}: your appointment is confirmed for ${when}. Reply to this number to reach us.`,
    voicemail: (biz) => `Hi, you've reached ${biz}. We can't take your call right now — please leave a message after the beep and we'll get right back to you.`
  },
  es: {
    greeting: (biz) => `Hola, habla Lina de ${biz}. Con mucho gusto le ayudo — puedo agendarle una cita o tomar un mensaje. ¿En qué le puedo ayudar hoy?`,
    greetingKnown: (biz, name) => `Hola ${name}, habla Lina de ${biz}. ¡Qué gusto saludarle de nuevo! ¿Desea agendar una cita o dejar un mensaje?`,
    transferSay: (biz) => `Con mucho gusto, le comunico enseguida. Un momento por favor.`,
    smsMessageOwner: (biz, name, phone, body) => `${biz} — nuevo mensaje de ${name || 'una persona'}${phone ? ' (' + phone + ')' : ''}: ${body}`,
    smsBookingOwner: (biz, name, when) => `${biz} — nueva cita: ${name || 'llamante'} el ${when}.`,
    smsBookingCaller: (biz, when) => `${biz}: su cita quedó confirmada para el ${when}. Responda a este número para contactarnos.`,
    voicemail: (biz) => `Hola, se ha comunicado con ${biz}. En este momento no podemos atender su llamada. Por favor deje un mensaje después del tono y le devolveremos la llamada muy pronto.`
  }
};

function t(locale) { return STR[locale === 'es' ? 'es' : 'en']; }

// Language + transcription codes for ConversationRelay per locale + country.
function relayLang(locale, country) {
  if (locale === 'es') return country === 'CO' ? 'es-CO' : 'es-US';
  return 'en-US';
}

module.exports = { t, relayLang, STR };
