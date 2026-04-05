'use strict';

/**
 * Voice Stream Service — Whisper STT + ElevenLabs TTS wrappers.
 *
 * Provides:
 *   - transcribe(audioBuffer, mimeType): Buffer -> Spanish text (Whisper)
 *   - synthesize(text, voiceId):         text  -> Buffer of MP3 audio (ElevenLabs)
 *
 * Environment variables:
 *   TI_V2_OPENAI_KEY  || OPENAI_API_KEY     — for Whisper
 *   ELEVENLABS_API_KEY                       — shared across app
 *   TI_V2_ELEVENLABS_VOICE_ISABEL            — voice ID for Isabel (falls back
 *                                              to MSK_RACHEL voice which we know works)
 *
 * If keys missing, functions throw a clear error that the route handler turns
 * into a 503 response so the UI can show a helpful message.
 */

const OPENAI_KEY = process.env.TI_V2_OPENAI_KEY || process.env.OPENAI_API_KEY;
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const ISABEL_VOICE_ID =
  process.env.TI_V2_ELEVENLABS_VOICE_ISABEL ||
  process.env.MSK_RACHEL_VOICE_ID ||
  '21m00Tcm4TlvDq8ikWAM'; // ElevenLabs "Rachel" default — works with any account

// Step 12: Custom voice clones. Set these env vars after commissioning
// Professional Voice Clones on ElevenLabs. Until then, both fall back to
// the default Isabel voice so the system stays functional.
const VOICE_LIBRARY = {
  isabel_default: ISABEL_VOICE_ID,
  ate_maria: process.env.TI_V2_ELEVENLABS_VOICE_ATE_MARIA || ISABEL_VOICE_ID,
  kuya_diego: process.env.TI_V2_ELEVENLABS_VOICE_KUYA_DIEGO || ISABEL_VOICE_ID
};

function resolveVoiceId(preference) {
  return VOICE_LIBRARY[preference] || ISABEL_VOICE_ID;
}
const WHISPER_MODEL = 'whisper-1';
const TTS_MODEL = process.env.TI_V2_ELEVENLABS_MODEL || 'eleven_multilingual_v2';

const WHISPER_TIMEOUT_MS = 20000;
const TTS_TIMEOUT_MS = 20000;

/**
 * Transcribe audio buffer to text using OpenAI Whisper.
 * @param {Buffer} audioBuffer
 * @param {string} mimeType - 'audio/webm' | 'audio/mp4' | 'audio/wav' | 'audio/ogg'
 * @param {string} [language='es'] - ISO-639-1 code (Spanish by default)
 * @returns {Promise<{text, language, duration_ms, latency_ms}>}
 */
async function transcribe(audioBuffer, mimeType = 'audio/webm', language = 'es') {
  if (!OPENAI_KEY) {
    const err = new Error('Whisper not configured: set TI_V2_OPENAI_KEY or OPENAI_API_KEY');
    err.code = 'STT_NOT_CONFIGURED';
    throw err;
  }
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Empty audio buffer');
  }

  const start = Date.now();
  const ext = extFromMime(mimeType);

  // Node 18+ has native FormData, Blob, fetch
  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  form.append('file', blob, `audio.${ext}`);
  form.append('model', WHISPER_MODEL);
  form.append('language', language);
  form.append('response_format', 'verbose_json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Whisper API ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    return {
      text: (data.text || '').trim(),
      language: data.language || language,
      duration_ms: Math.round((data.duration || 0) * 1000),
      latency_ms: Date.now() - start,
      model: WHISPER_MODEL
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Synthesize speech with ElevenLabs TTS. Returns MP3 buffer + metadata.
 * @param {string} text
 * @param {string} [voiceId]
 * @returns {Promise<{audio: Buffer, voice_id, model, latency_ms}>}
 */
async function synthesize(text, voiceId) {
  if (!ELEVENLABS_KEY) {
    const err = new Error('ElevenLabs not configured: set ELEVENLABS_API_KEY');
    err.code = 'TTS_NOT_CONFIGURED';
    throw err;
  }
  if (!text || text.trim().length === 0) {
    throw new Error('Empty text for synthesis');
  }

  const start = Date.now();
  const voice = voiceId || ISABEL_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text.slice(0, 2500), // ElevenLabs hard limit
        model_id: TTS_MODEL,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true
        }
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ElevenLabs TTS ${res.status}: ${errText.slice(0, 300)}`);
    }

    const arrayBuf = await res.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuf),
      voice_id: voice,
      model: TTS_MODEL,
      latency_ms: Date.now() - start,
      size_bytes: arrayBuf.byteLength
    };
  } finally {
    clearTimeout(timer);
  }
}

function extFromMime(mime) {
  if (!mime) return 'webm';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'webm';
}

function isConfigured() {
  return {
    stt: !!OPENAI_KEY,
    tts: !!ELEVENLABS_KEY,
    voice_id: ISABEL_VOICE_ID,
    voice_library: {
      isabel_default: { id: VOICE_LIBRARY.isabel_default, custom: false },
      ate_maria: {
        id: VOICE_LIBRARY.ate_maria,
        custom: VOICE_LIBRARY.ate_maria !== ISABEL_VOICE_ID
      },
      kuya_diego: {
        id: VOICE_LIBRARY.kuya_diego,
        custom: VOICE_LIBRARY.kuya_diego !== ISABEL_VOICE_ID
      }
    }
  };
}

module.exports = {
  transcribe,
  synthesize,
  isConfigured,
  resolveVoiceId,
  ISABEL_VOICE_ID,
  VOICE_LIBRARY,
  TTS_MODEL,
  WHISPER_MODEL
};
