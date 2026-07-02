// =====================================================
// i18n copy dictionaries — Spanish-first (submitter wrote in ES), ?lang=en toggles.
// No i18next; plain {{KEY}} substitution in the HTML templates.
// =====================================================

const es = {
  LANG: 'es',
  DOCTITLE: 'Medición Facial — Digit2AI',
  H1: 'Medición Facial',
  SUBTITLE: 'Estima tu ritmo cardíaco desde la cámara. El video nunca sale de tu navegador.',
  PRIVACY_BADGE: 'El video NUNCA sale de tu navegador — solo se guarda el número de pulsaciones (BPM).',
  START: 'Iniciar medición',
  SIMULATE: 'Simular medición',
  STOP: 'Detener',
  ALIGN: 'Alinea tu rostro dentro del recuadro y quédate quieto ~20 segundos con buena luz.',
  CAPTURING: 'Capturando señal…',
  RESULT_LABEL: 'Ritmo cardíaco estimado',
  BPM_UNIT: 'BPM',
  CONFIDENCE: 'Confianza',
  SAVED: 'Lectura guardada.',
  SAVE_ERR: 'No se pudo guardar la lectura.',
  CAM_ERR: 'No se pudo acceder a la cámara. Revisa los permisos.',
  LOWCONF: 'Señal débil — vuelve a intentar con mejor luz y menos movimiento.',
  DISCLAIMER_INLINE: 'Demostración de bienestar, NO un dispositivo médico ni diagnóstico. La precisión varía según la luz, el movimiento y el tono de piel.',
  HISTORY_LINK: 'Ver historial',
  DISCLAIMER_LINK: 'Aviso legal',
  // dashboard
  DASH_H1: 'Historial de Lecturas',
  DASH_SUB: 'Mediciones guardadas para tu cuenta.',
  COL_ID: 'ID', COL_BPM: 'BPM', COL_CONF: 'Confianza', COL_DUR: 'Duración (s)', COL_SRC: 'Origen', COL_TIME: 'Fecha',
  BACK: 'Volver a medir',
  NO_TOKEN: 'Falta el token de acceso (?token=…) para ver el historial.',
  EMPTY: 'Aún no hay lecturas.',
  // disclaimer page
  DISC_H1: 'Aviso Legal — Demostración de Bienestar',
  DISC_BODY_1: 'Esta aplicación es una DEMOSTRACIÓN DE BIENESTAR. NO es un dispositivo médico, no está aprobada por ninguna autoridad sanitaria y NO debe usarse para diagnóstico, tratamiento ni para tomar decisiones de salud.',
  DISC_BODY_2: 'El ritmo cardíaco estimado (BPM) se calcula de forma aproximada a partir de cambios sutiles de color en la piel captados por la cámara (rPPG). La precisión varía según la iluminación, el movimiento y el tono de piel, y puede diferir significativamente de un pulsioxímetro o equipo médico.',
  DISC_BODY_3: 'PRIVACIDAD: el video se procesa íntegramente en tu navegador y NUNCA se transmite ni se almacena. Solo el número entero de pulsaciones (BPM) y la fecha se envían al servidor.',
  DISC_BODY_4: 'Si esta demostración se despliega para público en América Latina, el tratamiento de cualquier dato de salud almacenado se rige por la Ley 1581 de 2012 (Colombia) y la LFPDPPP (México).',
  DISC_BODY_5: 'Si tienes dudas sobre tu salud, consulta a un profesional médico.'
};

const en = {
  LANG: 'en',
  DOCTITLE: 'Facial Measurement — Digit2AI',
  H1: 'Facial Measurement',
  SUBTITLE: 'Estimate your heart rate from the webcam. Video never leaves your browser.',
  PRIVACY_BADGE: 'Video NEVER leaves your browser — only the heart-rate number (BPM) is stored.',
  START: 'Start measurement',
  SIMULATE: 'Simulate measurement',
  STOP: 'Stop',
  ALIGN: 'Align your face inside the box and hold still for ~20 seconds in good light.',
  CAPTURING: 'Capturing signal…',
  RESULT_LABEL: 'Estimated heart rate',
  BPM_UNIT: 'BPM',
  CONFIDENCE: 'Confidence',
  SAVED: 'Reading saved.',
  SAVE_ERR: 'Could not save the reading.',
  CAM_ERR: 'Could not access the camera. Check permissions.',
  LOWCONF: 'Weak signal — try again with better light and less movement.',
  DISCLAIMER_INLINE: 'Wellness demo, NOT a medical or diagnostic device. Accuracy varies with light, movement, and skin tone.',
  HISTORY_LINK: 'View history',
  DISCLAIMER_LINK: 'Disclaimer',
  // dashboard
  DASH_H1: 'Reading History',
  DASH_SUB: 'Saved measurements for your account.',
  COL_ID: 'ID', COL_BPM: 'BPM', COL_CONF: 'Confidence', COL_DUR: 'Duration (s)', COL_SRC: 'Source', COL_TIME: 'Date',
  BACK: 'Measure again',
  NO_TOKEN: 'Access token missing (?token=…) to view history.',
  EMPTY: 'No readings yet.',
  // disclaimer page
  DISC_H1: 'Disclaimer — Wellness Demo',
  DISC_BODY_1: 'This application is a WELLNESS DEMO. It is NOT a medical device, is not approved by any health authority, and must NOT be used for diagnosis, treatment, or any health decision.',
  DISC_BODY_2: 'The estimated heart rate (BPM) is an approximation derived from subtle skin-color changes captured by the camera (rPPG). Accuracy varies with lighting, movement, and skin tone, and may differ significantly from a pulse oximeter or medical equipment.',
  DISC_BODY_3: 'PRIVACY: video is processed entirely in your browser and is NEVER transmitted or stored. Only the integer heart-rate value (BPM) and a timestamp are sent to the server.',
  DISC_BODY_4: 'If this demo is deployed to a Latin American audience, the processing of any stored health data is governed by Ley 1581 de 2012 (Colombia) and LFPDPPP (Mexico).',
  DISC_BODY_5: 'If you have health concerns, consult a medical professional.'
};

const DICTS = { es, en };

function selectLang(lang) {
  return DICTS[lang === 'en' ? 'en' : 'es'];
}

module.exports = { es, en, selectLang };
