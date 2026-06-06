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

const fs = require('fs');
const os = require('os');
const path = require('path');

const PROVIDER = process.env.VERITAS_DETECTION_PROVIDER || 'stub';

// API keys pasted into env panels often pick up line-wraps / trailing spaces.
// Strip ALL whitespace so a newline can't poison the X-API-KEY HTTP header.
function rdKey() {
  return (process.env.REALITY_DEFENDER_API_KEY || '').replace(/\s+/g, '');
}

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

// Download a remote media URL to a temp file (Reality Defender's SDK takes a path).
async function downloadToTemp(mediaUrl, mediaType) {
  const res = await fetch(mediaUrl);
  if (!res.ok) throw new Error('media download failed: HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = mediaType === 'image' ? 'jpg' : mediaType === 'audio' ? 'mp3' : 'mp4';
  const name = 'veritas-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + '.' + ext;
  const tmp = path.join(os.tmpdir(), name);
  fs.writeFileSync(tmp, buf);
  return tmp;
}

/**
 * Reality Defender adapter.
 * Activated by VERITAS_DETECTION_PROVIDER=reality_defender + REALITY_DEFENDER_API_KEY.
 * Uses the official @realitydefender/realitydefender SDK (optionalDependency).
 * ANY failure (no key, SDK absent, download/API error) gracefully falls back to
 * the stub so production is never left without a verdict.
 *
 * SDK result shape: { status: 'MANIPULATED'|'AUTHENTIC'|..., score: 0..1, models: [{name,status,score}] }
 */
async function detectRealityDefender(input) {
  const apiKey = rdKey();
  if (!apiKey) return detectStub(input);

  let RealityDefender;
  try {
    ({ RealityDefender } = require('@realitydefender/realitydefender'));
  } catch (e) {
    console.warn('[Veritas] Reality Defender SDK not installed; using stub. (npm i @realitydefender/realitydefender)');
    return detectStub(input);
  }

  let tmp;
  try {
    tmp = await downloadToTemp(input.mediaUrl, input.mediaType);
    const client = new RealityDefender({ apiKey });
    const result = await client.detect({ filePath: tmp });

    const rawScore = typeof result.score === 'number' ? result.score : 0;
    const { confidence } = scoreToVerdict(rawScore);

    // Prefer RD's own status label; fall back to our thresholds.
    const st = String(result.status || '').toUpperCase();
    let verdict;
    if (['MANIPULATED', 'SYNTHETIC', 'FAKE', 'ARTIFICIAL'].includes(st)) verdict = 'deepfake';
    else if (['AUTHENTIC', 'REAL'].includes(st)) verdict = confidence >= 45 ? 'suspect' : 'clean';
    else verdict = scoreToVerdict(rawScore).verdict;

    return {
      provider: 'reality_defender',
      rawScore,
      confidence,
      verdict,
      evidence: {
        rd_status: result.status,
        models: (result.models || []).map(m => ({ name: m.name, status: m.status, score: m.score }))
      }
    };
  } catch (e) {
    console.error('[Veritas] Reality Defender error:', e.message, '— falling back to stub.');
    return detectStub(input);
  } finally {
    if (tmp) { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
}

async function detect(input) {
  switch (PROVIDER) {
    case 'hive': return detectHive(input);
    case 'reality_defender': return detectRealityDefender(input);
    default: return detectStub(input);
  }
}

// Non-sensitive diagnostics to confirm a real provider is actually active.
function diagnostics() {
  let sdk_loadable = false;
  try { require.resolve('@realitydefender/realitydefender'); sdk_loadable = true; } catch (e) {}
  return {
    provider: PROVIDER,
    reality_defender_key_present: !!process.env.REALITY_DEFENDER_API_KEY,
    reality_defender_sdk_installed: sdk_loadable,
    search_configured: !!(process.env.VERITAS_SEARCH_API_KEY && process.env.VERITAS_SEARCH_CX),
    node_version: process.version,
    global_fetch: typeof fetch !== 'undefined'
  };
}

// Verbose RD self-test — surfaces the exact failing stage + error (no swallow).
async function realityDefenderSelftest(testUrl) {
  const url = testUrl || 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg';
  const apiKey = rdKey();
  if (!apiKey) return { ok: false, stage: 'key', error: 'REALITY_DEFENDER_API_KEY not present' };
  let RealityDefender;
  try { ({ RealityDefender } = require('@realitydefender/realitydefender')); }
  catch (e) { return { ok: false, stage: 'sdk', error: e.message }; }
  let tmp;
  try { tmp = await downloadToTemp(url, 'image'); }
  catch (e) { return { ok: false, stage: 'download', error: e.message }; }
  try {
    const client = new RealityDefender({ apiKey });
    const r = await client.detect({ filePath: tmp });
    return { ok: true, status: r.status, score: r.score };
  } catch (e) {
    return { ok: false, stage: 'detect', error: e.message, code: e.code || null };
  } finally {
    if (tmp) { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
}

module.exports = { detect, scoreToVerdict, activeProvider: () => PROVIDER, diagnostics, realityDefenderSelftest };
