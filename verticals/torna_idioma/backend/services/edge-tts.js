'use strict';

/**
 * Microsoft Edge "Read Aloud" neural text-to-speech — free, no API key.
 *
 * Talks to the same public endpoint the Edge browser's Read Aloud feature uses.
 * Self-contained over the `ws` package (already a project dependency) — no extra
 * install. Returns MP3 audio (Buffer).
 *
 * Quality is far above the OS/browser SpeechSynthesis voices. If this endpoint
 * ever changes or is unreachable, callers should fall back to the browser voice.
 *
 * Constants + the Sec-MS-GEC security-token algorithm mirror the edge-tts project
 * (github.com/rany2/edge-tts) as of Chromium 143.
 */

const crypto = require('crypto');
const WebSocket = require('ws');

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const SEC_MS_GEC_VERSION = '1-143.0.3650.75';
const WIN_EPOCH = 11644473600; // seconds between 1601-01-01 and 1970-01-01

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
  Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'en-US,en;q=0.9',
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
};

const DEFAULT_VOICE = 'es-MX-DaliaNeural'; // warm Latin-American female — Profesora Isabel
const EXPL_VOICE_EN = 'en-US-AriaNeural';  // explanation voice when interface_lang = en
const EXPL_VOICE_FIL = 'fil-PH-BlessicaNeural'; // explanation voice when interface_lang = fil
const DEFAULT_RATE = '-4%'; // slightly slowed for learners
const SYNTH_TIMEOUT_MS = 15000;

// Marker Profesora Isabel uses to wrap Spanish target words for the voice layer.
const ES_MARKER = '⟦es⟧'; // ⟦es⟧

// Sec-MS-GEC token: SHA256 of (Windows-file-time ticks rounded to 5 min) + token.
// Ticks exceed Number.MAX_SAFE_INTEGER, so compute with BigInt.
function generateSecMsGec() {
  let seconds = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  seconds -= seconds % 300; // round down to nearest 5 minutes
  const ticks = BigInt(seconds) * 10000000n; // seconds -> 100ns intervals
  const strToHash = `${ticks.toString()}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSsml(text, voice, lang, rate) {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`
  );
}

/**
 * Synthesize `text` to an MP3 Buffer.
 * @param {string} text
 * @param {{voice?:string, lang?:string, rate?:string}} [opts]
 * @returns {Promise<Buffer>}
 */
function synthesize(text, opts = {}) {
  const voice = opts.voice || DEFAULT_VOICE;
  const lang = opts.lang || (voice.match(/^[a-z]{2}-[A-Z]{2}/) || ['es-MX'])[0];
  const rate = opts.rate || DEFAULT_RATE;
  const connectId = crypto.randomUUID().replace(/-/g, '');
  const gec = generateSecMsGec();
  const url = `${WSS_URL}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectId}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: HEADERS });
    const chunks = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.terminate(); } catch (e) { /* noop */ }
      reject(new Error('Edge TTS timeout'));
    }, SYNTH_TIMEOUT_MS);

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch (e) { /* noop */ }
      if (err) return reject(err);
      const audio = Buffer.concat(chunks);
      if (audio.length === 0) return reject(new Error('Edge TTS returned no audio'));
      resolve(audio);
    };

    ws.on('open', () => {
      const ts = new Date().toString();
      ws.send(
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}'
      );
      ws.send(
        `X-RequestId:${connectId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n` +
          buildSsml(text, voice, lang, rate)
      );
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Binary frame: [2-byte BE header length][header][audio bytes]
        if (data.length < 2) return;
        const headerLen = data.readUInt16BE(0);
        const audio = data.subarray(2 + headerLen);
        if (audio.length) chunks.push(audio);
      } else {
        const msg = data.toString();
        if (msg.includes('Path:turn.end')) finish();
      }
    });

    ws.on('error', (e) => finish(e));
    ws.on('close', () => { if (!settled) finish(); });
  });
}

/**
 * Smart-split synthesis: split `text` on ⟦es⟧ markers and speak Spanish spans in
 * a Spanish voice and the surrounding explanation in the interface-language voice,
 * concatenating the MP3 segments into ONE buffer. Edge returns a fixed bitrate so
 * naive Buffer concatenation plays back cleanly.
 *
 * @param {string} text  may contain ⟦es⟧ … ⟦es⟧ spans
 * @param {{interfaceLang?:'en'|'fil', esVoice?:string, rate?:string}} [opts]
 * @returns {Promise<Buffer>}
 */
async function synthesizeMarked(text, opts = {}) {
  const esVoice = opts.esVoice || DEFAULT_VOICE;
  const explVoice = opts.interfaceLang === 'fil' ? EXPL_VOICE_FIL : EXPL_VOICE_EN;
  const rate = opts.rate || DEFAULT_RATE;

  const raw = String(text || '');
  if (!raw.includes(ES_MARKER)) {
    // No markers → speak the whole thing in the explanation voice.
    return synthesize(raw, { voice: explVoice, rate });
  }

  // Toggle Spanish on every marker. Parts at odd indices are Spanish.
  const parts = raw.split(ES_MARKER);
  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].trim();
    if (!seg) continue;
    segments.push({ text: parts[i], voice: i % 2 === 1 ? esVoice : explVoice });
  }
  if (segments.length === 0) return synthesize(raw.replace(/⟦es⟧/g, ' '), { voice: explVoice, rate });

  const buffers = [];
  for (const s of segments) {
    try {
      buffers.push(await synthesize(s.text, { voice: s.voice, rate }));
    } catch (e) {
      // Skip a failed segment rather than aborting the whole utterance.
    }
  }
  if (buffers.length === 0) throw new Error('Edge TTS produced no audio');
  return Buffer.concat(buffers);
}

module.exports = { synthesize, synthesizeMarked, DEFAULT_VOICE, ES_MARKER };
