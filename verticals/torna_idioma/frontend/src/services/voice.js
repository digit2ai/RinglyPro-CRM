// ============================================================================
// The platform voice. One place, one policy.
//
//   English narration   Ava      (en-US-AvaNeural)
//   Filipino narration  Blessica (fil-PH-BlessicaNeural)
//   Every Spanish word  Dalia    (es-MX-DaliaNeural)
//
// Spoken through the app's own zero-key Edge endpoint (/api/tts/edge) — no API
// key in the browser, no per-play cost, disk-cached server-side. The browser's
// own speech synthesis is the fallback only: it is markedly worse, and on many
// machines there is no Spanish voice installed at all, so it is what we use
// when the endpoint cannot be reached rather than what we use by default.
//
// Every surface that speaks should import from here. A page that builds its own
// SpeechSynthesisUtterance will sound like a different product.
// ============================================================================

const NEURAL_URL = '/api/tts/edge';

// The route accepts a friendly alias or a raw Edge voice name.
export const VOICE = {
  es: 'dalia',                    // es-MX-DaliaNeural
  en: 'ava',                      // en-US-AvaNeural
  fil: 'fil-PH-BlessicaNeural',
};

const FALLBACK_LANG = { es: 'es-MX', en: 'en-US', fil: 'fil-PH' };

let neuralOK = null;   // null = untested, true/false once we know
let current = null;    // the Audio element currently playing
let token = 0;         // guards against a slow response overtaking a newer tap

/** Stop whatever is speaking, neural or browser. */
export function stopVoice() {
  token++;
  if (current) { try { current.pause(); current.currentTime = 0; } catch (e) { /* noop */ } current = null; }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (e) { /* noop */ }
  }
}

function browserSpeak(text, lang) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const want = FALLBACK_LANG[lang] || 'es-MX';
    const voices = window.speechSynthesis.getVoices() || [];
    const v = voices.find(x => x.lang && x.lang.toLowerCase() === want.toLowerCase())
      || voices.find(x => x.lang && x.lang.toLowerCase().indexOf(want.slice(0, 2)) === 0);
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = want; }
    u.rate = lang === 'es' ? 0.9 : 1;   // a shade under natural: a model to copy
    window.speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; }
}

/**
 * Speak `text` in `lang` ('es' | 'en' | 'fil').
 * Resolves when playback starts (or when the fallback has been dispatched).
 */
export async function speak(text, lang = 'es') {
  const clean = String(text || '').trim();
  if (!clean) return false;

  stopVoice();
  const mine = ++token;

  if (neuralOK === false) return browserSpeak(clean, lang);

  try {
    const res = await fetch(NEURAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean.slice(0, 2000), voice: VOICE[lang] || VOICE.es }),
    });
    if (!res.ok) throw new Error('tts ' + res.status);
    if ((res.headers.get('content-type') || '').indexOf('audio') === -1) throw new Error('not audio');

    const url = URL.createObjectURL(await res.blob());
    if (mine !== token) { URL.revokeObjectURL(url); return false; }   // superseded

    neuralOK = true;
    const audio = new Audio(url);
    current = audio;
    audio.onended = () => { try { URL.revokeObjectURL(url); } catch (e) { /* noop */ } };
    await audio.play();
    return true;
  } catch (e) {
    if (mine !== token) return false;
    // A failed fetch means the endpoint is unreachable; a failed play() usually
    // means autoplay was blocked. Either way the learner should still hear
    // something rather than tapping into silence.
    if (String(e && e.message).indexOf('tts ') === 0 || String(e && e.name) === 'TypeError') neuralOK = false;
    return browserSpeak(clean, lang);
  }
}

/** Convenience wrappers, so call sites read as what they are. */
export const speakSpanish = (text) => speak(text, 'es');
export const speakUi = (text, uiLang) => speak(text, uiLang === 'fil' ? 'fil' : 'en');

/** True when this browser can speak at all (neural or fallback). */
export function canSpeak() {
  return typeof window !== 'undefined' && (typeof fetch === 'function' || !!window.speechSynthesis);
}
