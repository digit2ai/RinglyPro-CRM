'use strict';

/**
 * Veritas — Detection Engine (provider-agnostic abstraction)
 *
 * Phase 0: deterministic STUB so the platform is fully demoable with zero API keys.
 * Phase 1: wire a real provider (Hive AI / Reality Defender / Sensity) behind the
 *          same detect() contract. Selection via VERITAS_DETECTION_PROVIDER env.
 *
 * Contract:
 *   detect({ mediaUrl, mediaType }) ->
 *     { provider, rawScore, confidence (0-100), verdict, evidence }
 */

const PROVIDER = process.env.VERITAS_DETECTION_PROVIDER || 'stub';

// Normalize any provider's raw 0..1 score into a 0-100 confidence + verdict.
function scoreToVerdict(rawScore) {
  const confidence = Math.round(rawScore * 100);
  let verdict = 'clean';
  if (confidence >= 75) verdict = 'deepfake';
  else if (confidence >= 45) verdict = 'suspect';
  return { confidence, verdict };
}

// Deterministic pseudo-score from a string so stub results are stable per asset.
function hashScore(seed) {
  let h = 0;
  const s = String(seed || 'veritas');
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return (h % 1000) / 1000; // 0.000 .. 0.999
}

async function detectStub({ mediaUrl, mediaType }) {
  const rawScore = hashScore(mediaUrl + '|' + mediaType);
  const { confidence, verdict } = scoreToVerdict(rawScore);
  return {
    provider: 'stub',
    rawScore,
    confidence,
    verdict,
    evidence: {
      note: 'Stub detection — deterministic. Set VERITAS_DETECTION_PROVIDER + provider key to enable real analysis.',
      signals: {
        face_warping: +(rawScore * 0.9).toFixed(2),
        temporal_inconsistency: +(rawScore * 0.8).toFixed(2),
        audio_lipsync_drift: +(rawScore * 0.7).toFixed(2)
      }
    }
  };
}

// ── Provider adapters (Phase 1 — stubbed shells, no live calls yet) ──────────
async function detectHive(input) {
  // TODO Phase 1: POST mediaUrl to Hive moderation/deepfake API using HIVE_API_KEY.
  // const res = await fetch('https://api.thehive.ai/...', {...});
  // const rawScore = res.deepfake_probability; return { provider:'hive', ...scoreToVerdict(rawScore) }
  return detectStub(input);
}

async function detectRealityDefender(input) {
  // TODO Phase 1: REALITY_DEFENDER_API_KEY.
  return detectStub(input);
}

async function detect(input) {
  switch (PROVIDER) {
    case 'hive': return detectHive(input);
    case 'reality_defender': return detectRealityDefender(input);
    default: return detectStub(input);
  }
}

module.exports = { detect, scoreToVerdict, activeProvider: () => PROVIDER };
