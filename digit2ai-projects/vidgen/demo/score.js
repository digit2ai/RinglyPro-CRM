'use strict';
/**
 * An ORIGINAL score for the ad, synthesized here.
 *
 * Not a downloaded track, deliberately. Meta fingerprints audio on Facebook
 * and Instagram, and a "royalty-free" bed with murky provenance gets the post
 * muted or pulled — on the ad you paid to make. This is generated from
 * oscillators in this file, so the rights are yours and there is nothing to
 * clear. Same doctrine the sleep app in this repo already follows.
 *
 * It is written to the ad's shape rather than looped underneath it:
 *
 *   bars 0-2   A minor, low pad only          the pile, the silence
 *   bars 3-6   C - G - Am - F, pulse enters   the product, momentum
 *   bars 7-9   C - G - C, octave up, lift     the replies, the payoff
 *
 * 80 BPM, one bar = 3s, so the turn lands at 9s where the character looks up.
 */

const SR = 44100;
const BPM = 80;
const BAR = (60 / BPM) * 4;            // 3.0s

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// root, then the triad above it
const CHORDS = {
  Am: { root: 45, triad: [57, 60, 64] },
  F:  { root: 41, triad: [53, 57, 60] },
  C:  { root: 48, triad: [52, 55, 60] },
  G:  { root: 43, triad: [55, 59, 62] }
};

// section: 0 = sparse, 1 = pulse, 2 = lift
const PROGRESSION = [
  { c: 'Am', s: 0 }, { c: 'F', s: 0 }, { c: 'Am', s: 0 },
  { c: 'C', s: 1 }, { c: 'G', s: 1 }, { c: 'Am', s: 1 }, { c: 'F', s: 1 },
  { c: 'C', s: 2 }, { c: 'G', s: 2 }, { c: 'C', s: 2 }
];

/** Slightly detuned sine pair — one oscillator alone sounds synthetic. */
function pad(buf, startS, durS, freq, gain, pan) {
  const a = Math.floor(startS * SR);
  const n = Math.floor(durS * SR);
  const atk = SR * 0.6, rel = SR * 0.9;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = Math.min(1, i / atk) * Math.min(1, (n - i) / rel);
    env *= env;
    const v = (Math.sin(2 * Math.PI * freq * t) +
               Math.sin(2 * Math.PI * freq * 1.004 * t) * 0.7) * 0.5 * gain * env;
    const j = (a + i) * 2;
    if (j + 1 < buf.length) {
      buf[j] += v * (1 - pan);
      buf[j + 1] += v * pan;
    }
  }
}

/** Short decaying pluck, triangle-ish via odd harmonics. */
function pluck(buf, startS, freq, gain) {
  const a = Math.floor(startS * SR);
  const n = Math.floor(SR * 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 7);
    const v = (Math.sin(2 * Math.PI * freq * t) +
               Math.sin(2 * Math.PI * freq * 3 * t) * 0.18 +
               Math.sin(2 * Math.PI * freq * 5 * t) * 0.06) * gain * env;
    const j = (a + i) * 2;
    if (j + 1 < buf.length) { buf[j] += v * 0.5; buf[j + 1] += v * 0.5; }
  }
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2 * 2, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** @param seconds how long the bed must run (the voiceover length) */
function score(seconds) {
  const total = Math.ceil((seconds + 1.5) * SR);
  const buf = new Float32Array(total * 2);

  for (let b = 0; b < PROGRESSION.length; b++) {
    const at = b * BAR;
    if (at > seconds) break;
    const { c, s } = PROGRESSION[b];
    const ch = CHORDS[c];

    // bass root, always
    pad(buf, at, BAR + 0.4, mtof(ch.root), 0.30, 0.5);
    // chord pad, wider and louder as the piece opens up
    const gain = [0.085, 0.115, 0.145][s];
    ch.triad.forEach((m, i) => {
      pad(buf, at + 0.15, BAR + 0.3, mtof(m), gain, [0.25, 0.5, 0.75][i]);
      if (s === 2) pad(buf, at + 0.3, BAR, mtof(m + 12), gain * 0.45, [0.7, 0.3, 0.55][i]);
    });

    // the pulse: on beats 1 and 3 once the product section starts
    if (s >= 1) {
      const beat = BAR / 4;
      for (const k of (s === 2 ? [0, 1, 2, 3] : [0, 2])) {
        pluck(buf, at + k * beat, mtof(ch.triad[0] + 12), s === 2 ? 0.10 : 0.07);
      }
    }
  }

  // top and tail so it never clicks in or cuts off
  const fi = Math.floor(SR * 1.2), fo = Math.floor(SR * 2.2);
  const end = Math.floor(seconds * SR);
  for (let i = 0; i < total; i++) {
    let g = 1;
    if (i < fi) g *= i / fi;
    if (i > end - fo) g *= Math.max(0, (end - i) / fo);
    buf[i * 2] *= g; buf[i * 2 + 1] *= g;
  }

  // headroom: the bed is ducked again at mux time, but clipping here is baked in
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > 0.89) for (let i = 0; i < buf.length; i++) buf[i] *= 0.89 / peak;

  return wav(buf);
}

module.exports = { score, BAR, BPM };
