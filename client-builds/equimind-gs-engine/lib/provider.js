// =====================================================
// ProcessingProvider — the GPU/splat abstraction. video/photos IN -> splat OUT.
// Swappable behind one interface so a managed API (Luma/PostShot) or a self-hosted
// COLMAP+gsplat pipeline can be dropped in without touching the queue/routes.
//
//   process({ session, sourceBuffers }) -> { plyBuffer, spzBuffer, thumbBuffer,
//                                            splat_count, is_simulated, provider }
//
// Providers:
//   · MockProvider   — DEFAULT. Produces a VALID, HORSE-SHAPED placeholder .ply +
//                      .spz + thumbnail so the whole pipeline (upload->job->assets->
//                      view) runs and is testable end-to-end WITHOUT a GPU. Every
//                      output is flagged is_simulated:true (never a real scan).
//   · ProceduralHorseProvider — the $0 "state-of-the-art report" path. Same horse
//                      generator, but shaped to the analysis MEASUREMENTS carried on
//                      session.meta.report (height/length scale the model). No GPU,
//                      no API cost. is_simulated:true + provider:'procedural' so it
//                      is always labeled a generated representation, not a scan.
//                      Select with GS_PROCESSING_PROVIDER=procedural. Upgrade to real
//                      photoreal scans later by flipping the var to 'luma' — the
//                      report + viewer are unchanged (that's the whole point of this
//                      interface). See BLOCKERS.md / RESEARCH.md for the cost model.
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
  if (want === 'procedural') return ProceduralHorseProvider;
  return MockProvider;
}
function name() { return select().providerName; }
// NOTE: exported as `process` but named `runProvider` internally — a function
// named `process` would shadow Node's global `process` across this module.
async function runProvider(args) { return select().process(args); }

// ---- Mock (horse-shaped placeholder, testable end-to-end) ------------------
const MockProvider = {
  providerName: 'mock',
  async process({ session }) {
    const { ply, count } = buildHorsePly(session, {});
    const spzBuffer = buildPlaceholderSpz(ply);
    // Simulate a little work so job timing/telemetry is realistic in tests.
    return { plyBuffer: ply, spzBuffer, thumbBuffer: PLACEHOLDER_PNG, splat_count: count, is_simulated: true, provider: 'mock' };
  }
};

// ---- Procedural horse (the $0 report path) ---------------------------------
// Builds a horse-shaped Gaussian cloud scaled to the analysis measurements on
// session.meta.report (height_cm at the withers, length_cm nose-to-tail). No GPU,
// no external API — costs nothing per report. ALWAYS is_simulated:true: this is a
// generated representation of a horse at the measured proportions, NOT a photoreal
// scan of that specific animal. Flip GS_PROCESSING_PROVIDER=luma for real scans.
const ProceduralHorseProvider = {
  providerName: 'procedural',
  async process({ session }) {
    const rep = (session && session.meta && session.meta.report) || {};
    const m = measurementScale(rep);
    const { ply, count } = buildHorsePly(session, m);
    const spzBuffer = buildPlaceholderSpz(ply);
    return { plyBuffer: ply, spzBuffer, thumbBuffer: PLACEHOLDER_PNG, splat_count: count, is_simulated: true, provider: 'procedural' };
  }
};

// Derive body-space scale factors from the report measurements. Reference horse:
// 144 cm at the withers (14.2 hands), 152 cm body length. Missing -> factor 1.
function measurementScale(rep) {
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : null; };
  const heightCm = num(rep.height_cm) || cmFromMeasures(rep, /wither|cruz|alzada|height/i);
  const lengthCm = num(rep.length_cm) || cmFromMeasures(rep, /length|largo|body/i);
  return {
    scaleY: heightCm ? clamp(heightCm / 144, 0.72, 1.4) : 1,
    scaleX: lengthCm ? clamp(lengthCm / 152, 0.78, 1.35) : 1
  };
}
function cmFromMeasures(rep, re) {
  const arr = Array.isArray(rep.measurements) ? rep.measurements : [];
  const hit = arr.find((x) => x && re.test(String(x.key || x.label || '')));
  if (!hit) return null;
  const n = parseFloat(hit.cm != null ? hit.cm : hit.value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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

// ---- horse-shaped asset builder --------------------------------------------
// A VALID Gaussian-splat PLY (binary_little_endian) with the standard 3DGS vertex
// properties (x,y,z, nx,ny,nz, f_dc_0..2, opacity, scale_0..2, rot_0..3), sampled
// into the silhouette of a horse (barrel, chest, hindquarter, neck, head, muzzle,
// ears, four legs, tail) so the real WebGL splat viewer shows a recognizable
// horse — for $0. opts.scaleX / opts.scaleY stretch the model to the measured
// body length / withers height. Returns { ply:Buffer, count:int }.
//
// SH DC term: the viewer reconstructs colour as 0.5 + 0.2820948*f_dc, so we invert
// (f = (c-0.5)/0.2820948) to hit target brass/dark tones. Opacity is stored pre-
// sigmoid (logit); scale is stored as log (viewer takes exp).
const SH_C0 = 0.2820947917738781;
function shDC(c) { return (c - 0.5) / SH_C0; }
function buildHorsePly(session, opts) {
  const sx = (opts && opts.scaleX) || 1, sy = (opts && opts.scaleY) || 1, sz = (opts && opts.scaleY) || 1;
  const pts = [];
  // region colours (sRGB 0..1): body brass, extremities darker (points/mane/tail).
  const C = {
    body: [0.72, 0.52, 0.28], hind: [0.70, 0.50, 0.27], chest: [0.74, 0.55, 0.31],
    neck: [0.67, 0.47, 0.25], head: [0.65, 0.46, 0.24], muzzle: [0.34, 0.26, 0.20],
    ear: [0.28, 0.21, 0.16], leg: [0.33, 0.25, 0.18], hoof: [0.16, 0.14, 0.12], tail: [0.24, 0.18, 0.13]
  };
  // deterministic PRNG (no Math.random — keeps output stable per session id).
  let seed = ((session && session.id) || 1) * 2654435761 >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 0.9;
  function ellip(n, cx, cy, cz, rx, ry, rz, col) {
    for (let i = 0; i < n; i++) {
      const u = rnd(), v = rnd(), th = Math.acos(2 * u - 1), ph = 2 * Math.PI * v, rr = Math.cbrt(rnd()) * 0.55 + 0.45;
      pts.push([cx + rx * rr * Math.sin(th) * Math.cos(ph), cy + ry * rr * Math.cos(th), cz + rz * rr * Math.sin(th) * Math.sin(ph), col]);
    }
  }
  function limb(n, x0, y0, z0, x1, y1, z1, r, col) {
    for (let i = 0; i < n; i++) {
      const s = rnd(), a = 2 * Math.PI * rnd(), rr = Math.sqrt(rnd()) * r;
      pts.push([x0 + (x1 - x0) * s + Math.cos(a) * rr, y0 + (y1 - y0) * s, z0 + (z1 - z0) * s + Math.sin(a) * rr, col]);
    }
  }
  ellip(1600, 0, 0.15, 0, 1.55, 0.86, 0.66, C.body);      // barrel
  ellip(700, -1.25, 0.25, 0, 0.72, 0.82, 0.64, C.hind);   // hindquarter
  ellip(520, 1.15, 0.05, 0, 0.56, 0.72, 0.62, C.chest);   // chest
  // neck (tapered column from chest up to poll)
  for (let i = 0; i < 780; i++) { const s = rnd(), a = 2 * Math.PI * rnd(), rr = Math.sqrt(rnd()) * (0.42 - 0.16 * s); pts.push([1.35 + 1.0 * s + Math.cos(a) * rr, 0.55 + 1.15 * s, Math.sin(a) * rr, C.neck]); }
  ellip(320, 2.5, 1.72, 0, 0.34, 0.27, 0.24, C.head);     // head
  ellip(140, 2.86, 1.5, 0, 0.16, 0.16, 0.15, C.muzzle);   // muzzle
  limb(40, 2.42, 2.0, 0.10, 2.30, 2.36, 0.16, 0.05, C.ear);
  limb(40, 2.42, 2.0, -0.10, 2.30, 2.36, -0.16, 0.05, C.ear);
  // four legs (front pair near x=0.95, hind near x=-1.15) with dark hooves
  const legs = [[0.95, 0.42], [0.95, -0.42], [-1.15, 0.42], [-1.15, -0.42]];
  for (const [lx, lz] of legs) {
    limb(260, lx, -0.5, lz, lx + 0.06, -2.15, lz + (lz > 0 ? 0.06 : -0.06), 0.16, C.leg);
    limb(40, lx + 0.06, -2.15, lz + (lz > 0 ? 0.06 : -0.06), lx + 0.06, -2.35, lz + (lz > 0 ? 0.06 : -0.06), 0.16, C.hoof);
  }
  limb(220, -1.9, 0.35, 0, -2.35, -1.15, 0, 0.16, C.tail); // tail
  const n = pts.length;

  const props = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  const header = 'ply\nformat binary_little_endian 1.0\n' +
    'comment EquiMind GS procedural horse (is_simulated) session=' + (session && session.id) + '\n' +
    'element vertex ' + n + '\n' +
    props.map((p) => 'property float ' + p).join('\n') + '\n' +
    'end_header\n';
  const stride = props.length * 4;
  const body = Buffer.alloc(n * stride);
  const LSCALE = Math.log(0.024); // per-splat radius ~2.4cm-equivalent -> reads solid
  for (let i = 0; i < n; i++) {
    const p = pts[i], col = p[3];
    const x = (p[0] + gauss() * 0.03) * sx, y = (p[1] + gauss() * 0.03) * sy, z = (p[2] + gauss() * 0.03) * sz;
    const off = i * stride;
    const vals = [
      x, y, z, 0, 1, 0,
      shDC(col[0]), shDC(col[1]), shDC(col[2]),
      2.6,                          // opacity (sigmoid ~0.93)
      LSCALE, LSCALE, LSCALE,       // isotropic log-scale
      1, 0, 0, 0                    // identity quat
    ];
    for (let k = 0; k < props.length; k++) body.writeFloatLE(vals[k], off + k * 4);
  }
  return { ply: Buffer.concat([Buffer.from(header, 'ascii'), body]), count: n };
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

module.exports = { select, name, process: runProvider, buildHorsePly, MockProvider, ProceduralHorseProvider, LumaProvider, SelfHostedProvider };
