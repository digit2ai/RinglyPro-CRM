// =====================================================
// ProcessingProvider — the GPU/splat abstraction. video/photos IN -> splat OUT.
// Swappable behind one interface so a managed API (Luma/PostShot) or a self-hosted
// COLMAP+gsplat pipeline can be dropped in without touching the queue/routes.
//
//   process({ session, sourceBuffers }) -> { plyBuffer, spzBuffer, thumbBuffer,
//                                            splat_count, is_simulated, provider }
//
// Providers:
//   · MockProvider   — DEFAULT. Produces a small VALID placeholder .ply + .spz +
//                      thumbnail so the whole pipeline (upload->job->assets->view)
//                      runs and is testable end-to-end WITHOUT a GPU. Every output
//                      is flagged is_simulated:true (never passed off as a real scan).
//   · LumaProvider   — REAL managed splatting. Requires LUMA_API_KEY (absent today
//                      -> see BLOCKERS.md). Stubbed: throws a clear NOT_CONFIGURED.
//   · SelfHostedProvider — interface stub only (COLMAP SfM + gsplat training); v2.
// =====================================================
'use strict';

// ---- selection -------------------------------------------------------------
function select() {
  const want = (process.env.GS_PROCESSING_PROVIDER || '').toLowerCase();
  if (want === 'luma' || (!want && process.env.LUMA_API_KEY)) return LumaProvider;
  if (want === 'self_hosted') return SelfHostedProvider;
  return MockProvider;
}
function name() { return select().providerName; }
// NOTE: exported as `process` but named `runProvider` internally — a function
// named `process` would shadow Node's global `process` across this module.
async function runProvider(args) { return select().process(args); }

// ---- Mock (placeholder, testable end-to-end) -------------------------------
const MockProvider = {
  providerName: 'mock',
  async process({ session }) {
    const n = 512; // placeholder splat count
    const plyBuffer = buildPlaceholderPly(n, session);
    const spzBuffer = buildPlaceholderSpz(plyBuffer);
    const thumbBuffer = PLACEHOLDER_PNG;
    // Simulate a little work so job timing/telemetry is realistic in tests.
    return { plyBuffer, spzBuffer, thumbBuffer, splat_count: n, is_simulated: true, provider: 'mock' };
  }
};

// ---- Luma (REAL managed capture API) ---------------------------------------
// Implements the documented Luma capture flow: create -> upload source video to
// the returned presigned URL -> trigger -> poll -> download the gaussian .ply.
// IMPORTANT: this is Luma's CAPTURE/Enterprise API (video->splat), NOT the public
// Dream Machine image/video-gen API. Everything is env-configurable so a
// different contract endpoint/auth needs only env changes, not code:
//   LUMA_API_KEY            (activates the provider)
//   GS_LUMA_BASE_URL        default https://webapp.engineeringlumalabs.com/api/v2
//   GS_LUMA_AUTH_STYLE      'luma' (Authorization: luma-api-key=KEY) | 'bearer'
//   GS_LUMA_POLL_MS (8000)  GS_LUMA_TIMEOUT_MS (1500000 = 25 min)
const LumaProvider = {
  providerName: 'luma',
  async process({ session, sourceBuffers }) {
    const KEY = process.env.LUMA_API_KEY;
    if (!KEY) { const e = new Error('Luma provider not configured (LUMA_API_KEY missing). See BLOCKERS.md.'); e.code = 'PROVIDER_NOT_CONFIGURED'; throw e; }
    const video = (sourceBuffers || []).find((b) => b && b.length);
    if (!video) { const e = new Error('No source video uploaded for this session (Luma needs the raw video bytes).'); e.code = 'NO_SOURCE'; throw e; }

    const BASE = (process.env.GS_LUMA_BASE_URL || 'https://webapp.engineeringlumalabs.com/api/v2').replace(/\/$/, '');
    const auth = () => (process.env.GS_LUMA_AUTH_STYLE === 'bearer') ? { Authorization: 'Bearer ' + KEY } : { Authorization: 'luma-api-key=' + KEY };
    const pollMs = numEnv('GS_LUMA_POLL_MS', 8000);
    const timeoutMs = numEnv('GS_LUMA_TIMEOUT_MS', 25 * 60 * 1000);

    // 1) create capture
    const form = new URLSearchParams(); form.set('title', (session && (session.title || ('EquiMind ' + session.kind + ' #' + session.id))));
    let r = await fetch(BASE + '/capture', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, auth()), body: form.toString() });
    let cap = await asJson(r, 'luma:create');
    cap = cap.capture || cap;
    const slug = cap.slug || cap.id;
    const uploadUrl = (cap.signedUrls && (cap.signedUrls.source || cap.signedUrls.upload)) || cap.uploadUrl;
    if (!slug || !uploadUrl) { const e = new Error('Luma create returned no slug/upload URL (check GS_LUMA_BASE_URL / API access).'); e.code = 'PROVIDER_UNEXPECTED'; throw e; }

    // 2) upload the source video to the presigned URL
    r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: video });
    if (!r.ok) { const e = new Error('Luma source upload failed: HTTP ' + r.status); e.code = 'PROVIDER_UPLOAD'; throw e; }

    // 3) trigger processing
    r = await fetch(BASE + '/capture/' + encodeURIComponent(slug), { method: 'POST', headers: auth() });
    if (!r.ok && r.status !== 409) { const e = new Error('Luma trigger failed: HTTP ' + r.status); e.code = 'PROVIDER_TRIGGER'; throw e; }

    // 4) poll until artifacts are ready
    const start = Date.now(); let artifacts = [];
    while (Date.now() - start < timeoutMs) {
      await sleep(pollMs);
      r = await fetch(BASE + '/capture/' + encodeURIComponent(slug), { headers: auth() });
      if (!r.ok) continue;
      let j = await r.json().catch(() => ({})); j = j.capture || j;
      const status = String(j.status || '').toLowerCase();
      artifacts = j.artifacts || (j.latestRun && j.latestRun.artifacts) || [];
      if (['complete', 'completed', 'finished', 'done'].includes(status) && artifacts.length) break;
      if (['failed', 'error', 'dead'].includes(status)) { const e = new Error('Luma processing failed (status=' + status + ').'); e.code = 'PROVIDER_FAILED'; throw e; }
    }
    if (!artifacts.length) { const e = new Error('Luma processing timed out with no artifacts.'); e.code = 'PROVIDER_TIMEOUT'; throw e; }

    // 5) pick the gaussian-splat / .ply artifact + thumbnail, download them
    const plyUrl = pickArtifact(artifacts, ['gaussian_splat', 'gaussian', 'splat', 'ply'], /\.ply(\?|$)/i);
    if (!plyUrl) { const e = new Error('Luma returned no gaussian/.ply artifact.'); e.code = 'PROVIDER_NO_ARTIFACT'; throw e; }
    const plyBuffer = await download(plyUrl);
    const thumbUrl = pickArtifact(artifacts, ['thumb', 'thumbnail', 'poster', 'image'], /\.(png|jpg|jpeg|webp)(\?|$)/i);
    const thumbBuffer = thumbUrl ? await download(thumbUrl).catch(() => PLACEHOLDER_PNG) : PLACEHOLDER_PNG;
    // SPZ: Luma returns .ply; SPZ web-stream conversion is a separate optimization
    // (D8). Until then we serve the .ply as the stream asset too (viewer reads .ply).
    const spzBuffer = plyBuffer;
    return { plyBuffer, spzBuffer, thumbBuffer, splat_count: countPlyVertices(plyBuffer), is_simulated: false, provider: 'luma' };
  }
};

function numEnv(k, d) { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function asJson(r, where) { if (!r.ok) { const e = new Error(where + ' HTTP ' + r.status); e.code = 'PROVIDER_HTTP'; throw e; } return r.json(); }
async function download(url) { const r = await fetch(url); if (!r.ok) throw new Error('download HTTP ' + r.status); return Buffer.from(await r.arrayBuffer()); }
function pickArtifact(arts, typeHints, urlRe) {
  const list = (arts || []).map((a) => (typeof a === 'string' ? { url: a, type: '' } : a));
  for (const h of typeHints) { const hit = list.find((a) => String(a.type || a.kind || '').toLowerCase().includes(h)); if (hit && (hit.url || hit.signedUrl)) return hit.url || hit.signedUrl; }
  const byUrl = list.find((a) => urlRe.test(a.url || a.signedUrl || '')); return byUrl ? (byUrl.url || byUrl.signedUrl) : null;
}
function countPlyVertices(buf) { try { const head = buf.slice(0, 2048).toString('ascii'); const m = head.match(/element\s+vertex\s+(\d+)/i); return m ? parseInt(m[1], 10) : 0; } catch (e) { return 0; } }

// ---- Self-hosted (COLMAP + gsplat) — interface stub, v2 --------------------
const SelfHostedProvider = {
  providerName: 'self_hosted',
  async process() {
    const e = new Error('Self-hosted COLMAP+gsplat pipeline not built (v2). See RESEARCH.md.');
    e.code = 'PROVIDER_STUB';
    throw e;
  }
};

// ---- placeholder asset builders --------------------------------------------
// A minimal but VALID Gaussian-splat PLY (binary_little_endian) with the standard
// 3DGS vertex properties (x,y,z, nx,ny,nz, f_dc_0..2, opacity, scale_0..2, rot_0..3).
// Points arranged on a ring so a viewer shows a recognizable shape.
function buildPlaceholderPly(n, session) {
  const props = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  const header = 'ply\nformat binary_little_endian 1.0\n' +
    'comment EquiMind GS placeholder (is_simulated) session=' + (session && session.id) + '\n' +
    'element vertex ' + n + '\n' +
    props.map((p) => 'property float ' + p).join('\n') + '\n' +
    'end_header\n';
  const stride = props.length * 4;
  const body = Buffer.alloc(n * stride);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const off = i * stride;
    const vals = [
      Math.cos(t) * 1.2, (i % 2 ? 0.15 : -0.15), Math.sin(t) * 1.2, // xyz ring
      0, 1, 0,                                                        // normal
      0.55, 0.42, 0.20,                                              // f_dc (brassy)
      0.9,                                                           // opacity
      -3.2, -3.2, -3.2,                                             // log-scale (small)
      1, 0, 0, 0                                                    // quat
    ];
    for (let k = 0; k < props.length; k++) body.writeFloatLE(vals[k], off + k * 4);
  }
  return Buffer.concat([Buffer.from(header, 'ascii'), body]);
}

// Placeholder .spz container (magic + count). Real SPZ is a spec'd compressed
// format; this is a clearly-marked stand-in for streaming tests only.
function buildPlaceholderSpz(plyBuffer) {
  const head = Buffer.from('SPZ0EM_PLACEHOLDER', 'ascii');
  return Buffer.concat([head, plyBuffer.slice(0, Math.min(plyBuffer.length, 2048))]);
}

// 16x16 solid brass PNG, base64 (valid thumbnail).
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAKElEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAABeA0G0AAG3v0nAAAAAAElFTkSuQmCC',
  'base64'
);

module.exports = { select, name, process: runProvider, MockProvider, LumaProvider, SelfHostedProvider };
