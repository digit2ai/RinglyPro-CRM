'use strict';

/**
 * SpeakUp — speech-to-text engine (OURS, no third-party SaaS).
 *
 * Engines (SPEAKUP_STT_ENGINE):
 *   - webspeech : transcription happens client-side in the browser (Web Speech
 *                 API), the server just stores the text the browser sends. This
 *                 is the zero-setup, zero-key, nothing-leaves-the-device path.
 *   - whispercpp: self-hosted whisper.cpp binary + local .bin weights, run in a
 *                 child process on our own box. No external API.
 *   - vosk      : self-hosted Vosk model, run via a local python/CLI bridge.
 *   - stub      : DEFAULT. Zero-dependency. Returns a clearly-labelled placeholder
 *                 (is_simulated:true) so the app runs on Render with no model
 *                 installed. Never passed off as a real transcription.
 *
 * transcribe({ filePath, mimetype, lang, durationSec }) resolves to:
 *   { text, segments[], lang_detected, engine, is_simulated }
 *
 * Long jobs must be run OUT of the request cycle (see routes/recordings.js) so
 * the Cloudflare ~100s edge timeout never fires.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENGINE = (process.env.SPEAKUP_STT_ENGINE || 'stub').toLowerCase();
const MODEL_PATH = process.env.SPEAKUP_STT_MODEL_PATH || '';
const WHISPER_BIN = process.env.SPEAKUP_WHISPER_BIN || 'whisper-cli';
const VOSK_BIN = process.env.SPEAKUP_VOSK_BIN || 'vosk-transcriber';

function activeEngine() { return ENGINE; }

// ── stub — honest, labelled placeholder ────────────────────────────────────
function stubTranscribe(meta) {
  const name = meta.filePath ? path.basename(meta.filePath) : 'audio';
  const text = `[Transcripción simulada — SpeakUp STT en modo "stub". El archivo "${name}" no se transcribió con un modelo real. ` +
    `Para transcribir audio subido, configura SPEAKUP_STT_ENGINE=whispercpp (o vosk) y SPEAKUP_STT_MODEL_PATH con los pesos del modelo. ` +
    `La grabación en vivo desde el navegador (Web Speech) sí funciona sin configuración.]`;
  return {
    text,
    segments: [{ start: 0, end: meta.durationSec || 0, speaker: 'spk_1', text }],
    lang_detected: meta.lang || 'es',
    engine: 'stub',
    is_simulated: true
  };
}

// ── whisper.cpp — self-hosted binary ────────────────────────────────────────
// Runs: <bin> -m <model> -f <audio> -otxt -of <tmp>  then reads the .txt.
function whisperTranscribe(meta) {
  return new Promise((resolve, reject) => {
    if (!MODEL_PATH || !fs.existsSync(MODEL_PATH)) {
      return reject(new Error('SPEAKUP_STT_MODEL_PATH missing or not found'));
    }
    if (!meta.filePath || !fs.existsSync(meta.filePath)) {
      return reject(new Error('audio file not found'));
    }
    const outBase = meta.filePath + '.out';
    const args = ['-m', MODEL_PATH, '-f', meta.filePath, '-otxt', '-of', outBase];
    if (meta.lang) args.push('-l', meta.lang);
    const proc = spawn(WHISPER_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      const txtFile = outBase + '.txt';
      if (code === 0 && fs.existsSync(txtFile)) {
        const text = fs.readFileSync(txtFile, 'utf8').trim();
        try { fs.unlinkSync(txtFile); } catch (e) { /* ignore */ }
        resolve({
          text,
          segments: [{ start: 0, end: meta.durationSec || 0, speaker: 'spk_1', text }],
          lang_detected: meta.lang || null,
          engine: 'whispercpp',
          is_simulated: false
        });
      } else {
        reject(new Error('whisper.cpp failed: ' + (err.slice(0, 300) || 'exit ' + code)));
      }
    });
  });
}

// ── vosk — self-hosted model via CLI bridge ─────────────────────────────────
function voskTranscribe(meta) {
  return new Promise((resolve, reject) => {
    if (!MODEL_PATH || !fs.existsSync(MODEL_PATH)) {
      return reject(new Error('SPEAKUP_STT_MODEL_PATH (Vosk model dir) missing'));
    }
    if (!meta.filePath || !fs.existsSync(meta.filePath)) {
      return reject(new Error('audio file not found'));
    }
    const args = ['-m', MODEL_PATH, '-i', meta.filePath];
    const proc = spawn(VOSK_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && out.trim()) {
        const text = out.trim();
        resolve({
          text,
          segments: [{ start: 0, end: meta.durationSec || 0, speaker: 'spk_1', text }],
          lang_detected: meta.lang || null,
          engine: 'vosk',
          is_simulated: false
        });
      } else {
        reject(new Error('vosk failed: ' + (err.slice(0, 300) || 'exit ' + code)));
      }
    });
  });
}

/**
 * Transcribe an uploaded/imported audio file with our own engine.
 * Falls back to the honest stub if the configured real engine is unavailable.
 */
async function transcribe(meta = {}) {
  try {
    if (ENGINE === 'whispercpp') return await whisperTranscribe(meta);
    if (ENGINE === 'vosk') return await voskTranscribe(meta);
    // 'webspeech' has no server-side file path; 'stub' and anything else → stub.
    return stubTranscribe(meta);
  } catch (e) {
    // Real engine misconfigured / failed → degrade to a labelled stub, never crash.
    const s = stubTranscribe(meta);
    s.text = `[No se pudo transcribir con el motor "${ENGINE}": ${e.message}. Mostrando marcador.] ` + s.text;
    return s;
  }
}

module.exports = { transcribe, activeEngine };
