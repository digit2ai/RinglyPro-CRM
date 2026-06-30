// =====================================================
// Gait analyzer — pure-JS WAV decode + onset detection + gait metrics.
//
// No native modules, no Python/librosa, no ffmpeg. We accept 16-bit PCM mono
// WAV (the sprint's documented format — stuck-loop heuristic for WAV edge
// cases) and extract hoof-beat onsets via a short-time-energy envelope with
// adaptive peak picking, then derive:
//   - cadence_bpm   : 60 / mean(inter-onset interval)
//   - regularity_cv : std(IOI) / mean(IOI)   (coefficient of variation)
//   - beat_count    : number of detected onsets
//
// This proves the core thesis that hoof sound is measurable. Video + ML fusion
// are deferred; this is the audio layer alone.
// =====================================================

'use strict';

// ---- WAV decode (16-bit PCM mono, RIFF/WAVE) --------------------------------

class UnsupportedWavError extends Error {
  constructor(msg) { super(msg); this.name = 'UnsupportedWavError'; }
}

// Decode a Buffer of WAV bytes -> { sampleRate, samples: Float32Array (-1..1) }.
// Throws UnsupportedWavError on anything that isn't a parseable PCM WAV so the
// route can answer 415.
function decodeWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44) {
    throw new UnsupportedWavError('buffer too small to be a WAV file');
  }
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new UnsupportedWavError('not a RIFF/WAVE container');
  }

  let fmt = null;
  let dataOffset = -1;
  let dataLength = 0;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = Math.min(size, buf.length - body);
    }
    // Chunks are word-aligned (padded to even length).
    offset = body + size + (size % 2);
  }

  if (!fmt) throw new UnsupportedWavError('missing fmt chunk');
  // audioFormat 1 = PCM; 0xFFFE = WAVE_FORMAT_EXTENSIBLE (treat as PCM if 16-bit).
  if (fmt.audioFormat !== 1 && fmt.audioFormat !== 0xfffe) {
    throw new UnsupportedWavError('only PCM WAV is supported');
  }
  if (fmt.bitsPerSample !== 16) {
    throw new UnsupportedWavError('only 16-bit PCM WAV is supported');
  }
  if (dataOffset < 0) throw new UnsupportedWavError('missing data chunk');

  const channels = fmt.channels || 1;
  const frameBytes = 2 * channels;
  const frames = Math.floor(dataLength / frameBytes);
  const samples = new Float32Array(frames);
  // Downmix to mono by averaging channels; for true mono this is a passthrough.
  for (let i = 0; i < frames; i++) {
    let acc = 0;
    const base = dataOffset + i * frameBytes;
    for (let c = 0; c < channels; c++) {
      acc += buf.readInt16LE(base + c * 2);
    }
    samples[i] = (acc / channels) / 32768;
  }
  return { sampleRate: fmt.sampleRate, samples };
}

// ---- Onset detection --------------------------------------------------------

// Build a short-time RMS energy envelope. winSec ~20ms, hopSec ~5ms.
function energyEnvelope(samples, sampleRate, winSec = 0.02, hopSec = 0.005) {
  const win = Math.max(1, Math.round(sampleRate * winSec));
  const hop = Math.max(1, Math.round(sampleRate * hopSec));
  const env = [];
  const times = [];
  for (let start = 0; start + win <= samples.length; start += hop) {
    let acc = 0;
    for (let j = 0; j < win; j++) {
      const s = samples[start + j];
      acc += s * s;
    }
    env.push(Math.sqrt(acc / win));
    times.push((start + win / 2) / sampleRate);
  }
  return { env, times, hopSec };
}

// Adaptive peak picking: a frame is an onset if it is a local maximum within a
// refractory window AND exceeds an adaptive threshold (a fraction of the global
// max, floored above the noise mean). minGapSec enforces a refractory period so
// a single hoof beat isn't counted twice. Returns onset times (seconds).
function detectOnsets(env, times, minGapSec = 0.12) {
  const n = env.length;
  if (n === 0) return [];
  let globalMax = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) { if (env[i] > globalMax) globalMax = env[i]; sum += env[i]; }
  if (globalMax <= 0) return [];
  const mean = sum / n;
  // Adaptive threshold: well above the average energy, scaled to the peak.
  const thr = Math.max(0.20 * globalMax, mean * 2.0);

  // hop spacing in seconds (times are evenly spaced).
  const hopSec = times.length > 1 ? (times[1] - times[0]) : 0.005;
  const halfWin = Math.max(1, Math.round((minGapSec / 2) / hopSec));

  const candidates = [];
  for (let i = 0; i < n; i++) {
    if (env[i] < thr) continue;
    let isPeak = true;
    for (let k = Math.max(0, i - halfWin); k <= Math.min(n - 1, i + halfWin); k++) {
      if (env[k] > env[i]) { isPeak = false; break; }
    }
    if (isPeak) candidates.push({ t: times[i], e: env[i] });
  }

  // Enforce refractory spacing: walk in time order, keep the first of any
  // cluster that falls within minGapSec of the last accepted onset.
  candidates.sort((a, b) => a.t - b.t);
  const onsets = [];
  let lastT = -Infinity;
  for (const c of candidates) {
    if (c.t - lastT >= minGapSec) { onsets.push(c.t); lastT = c.t; }
  }
  return onsets;
}

// ---- Metrics ----------------------------------------------------------------

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function std(arr, m) {
  const mu = m == null ? mean(arr) : m;
  return Math.sqrt(arr.reduce((a, b) => a + (b - mu) * (b - mu), 0) / arr.length);
}

// Full pipeline: WAV Buffer -> gait metrics. Throws UnsupportedWavError if the
// bytes are not a 16-bit PCM mono WAV (the route maps that to HTTP 415).
function analyze(buf) {
  const { sampleRate, samples } = decodeWav(buf);
  const { env, times } = energyEnvelope(samples, sampleRate);
  const onsets = detectOnsets(env, times);
  const beat_count = onsets.length;

  if (beat_count < 2) {
    return {
      sampleRate,
      duration_sec: samples.length / sampleRate,
      beat_count,
      onsets,
      iois: [],
      cadence_bpm: null,
      regularity_cv: null
    };
  }

  const iois = [];
  for (let i = 1; i < onsets.length; i++) iois.push(onsets[i] - onsets[i - 1]);
  const muIoi = mean(iois);
  const cadence_bpm = muIoi > 0 ? 60 / muIoi : null;
  const regularity_cv = muIoi > 0 ? std(iois, muIoi) / muIoi : null;

  return {
    sampleRate,
    duration_sec: samples.length / sampleRate,
    beat_count,
    onsets,
    iois,
    cadence_bpm: cadence_bpm != null ? Number(cadence_bpm.toFixed(2)) : null,
    regularity_cv: regularity_cv != null ? Number(regularity_cv.toFixed(4)) : null
  };
}

module.exports = {
  analyze,
  decodeWav,
  energyEnvelope,
  detectOnsets,
  UnsupportedWavError
};
