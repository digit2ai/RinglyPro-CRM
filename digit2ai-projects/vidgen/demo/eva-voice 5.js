'use strict';

/**
 * EVA — the JobUp voice. Defined once, referenced everywhere.
 *
 * If each video re-picks a voice, the 6s hook and the 60s promo come out
 * sounding like two different products. The ID below is the pin: changing it
 * means re-rendering the back catalogue, not just the next spot.
 *
 * Measured on the pinned voice: median F0 179.8 Hz (p25-p75 163-184) — female,
 * consistent with the specified late-20s/mid-30s peer register.
 */
const EVA = {
  provider: 'fish-audio',
  voiceIdEnv: 'FISH_VOICE_ID',      // pinned in .env; do not vary per render
  measuredMedianF0Hz: 179.8,
  targetLufs: -14,
  truePeakDb: -1,
  padMs: 200,
};

/**
 * Fish reads punctuation, so the copy is formatted for the ear, not the page:
 * URLs spelled phonetically, no ellipses or em dashes (they render as
 * inconsistent pauses), one idea per sentence.
 */
function forSpeech(text) {
  return String(text)
    .replace(/\bjobup\.dev\b/gi, 'job up dot dev')
    .replace(/\bmanuelstagg\.com\b/gi, 'manuel stagg dot com')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\.\.\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { EVA, forSpeech };
