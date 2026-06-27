// EN/ES copy dictionaries — shared by server-side injection and client toggle.
// Loaded in the browser as a global (window.I18N) and required by index.js.
(function (root) {
  var I18N = {
    en: {
      htmlLang: 'en',
      speechLang: 'en-US',
      title: 'Voice to Intake',
      h1: 'Voice to Intake',
      subtitle: 'Speak your request. We transcribe it and send it straight to intake.',
      micStart: 'Start recording',
      micStop: 'Stop recording',
      transcriptLabel: 'Transcript',
      transcriptPlaceholder: 'Your words will appear here. You can also type or edit.',
      sendLabel: 'Send to Intake',
      sending: 'Sending…',
      langToggle: 'Español',
      listening: 'Listening… speak now.',
      notSupported: 'Voice input not supported — type your transcript.',
      needToken: 'Paste an access token to send.',
      tokenPlaceholder: 'Access token (JWT)',
      emptyTranscript: 'Transcript is empty.',
      sent: 'Sent to intake. Reference #',
      errorAuth: 'Not authorized — check your access token.',
      errorGeneric: 'Could not send. Please try again.',
      forwarded: 'forwarded',
      mocked: 'queued (mock forward)',
      micDenied: 'Microphone permission denied — type your transcript instead.'
    },
    es: {
      htmlLang: 'es',
      speechLang: 'es-US',
      title: 'Voz a Recepción',
      h1: 'Voz a Recepción',
      subtitle: 'Diga su solicitud. La transcribimos y la enviamos directo a recepción.',
      micStart: 'Comenzar grabación',
      micStop: 'Detener grabación',
      transcriptLabel: 'Transcripción',
      transcriptPlaceholder: 'Sus palabras aparecerán aquí. También puede escribir o editar.',
      sendLabel: 'Enviar a Recepción',
      sending: 'Enviando…',
      langToggle: 'English',
      listening: 'Escuchando… hable ahora.',
      notSupported: 'Entrada de voz no compatible — escriba su transcripción.',
      needToken: 'Pegue un token de acceso para enviar.',
      tokenPlaceholder: 'Token de acceso (JWT)',
      emptyTranscript: 'La transcripción está vacía.',
      sent: 'Enviado a recepción. Referencia #',
      errorAuth: 'No autorizado — verifique su token de acceso.',
      errorGeneric: 'No se pudo enviar. Inténtelo de nuevo.',
      forwarded: 'enviado',
      mocked: 'en cola (envío simulado)',
      micDenied: 'Permiso de micrófono denegado — escriba su transcripción.'
    }
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18N;
  }
  root.I18N = I18N;
})(typeof window !== 'undefined' ? window : this);
