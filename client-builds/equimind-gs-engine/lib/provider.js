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

// ---- Luma (real managed API — gated) ---------------------------------------
const LumaProvider = {
  providerName: 'luma',
  async process({ session }) {
    if (!process.env.LUMA_API_KEY) {
      const e = new Error('Luma provider not configured (LUMA_API_KEY missing). See BLOCKERS.md.');
      e.code = 'PROVIDER_NOT_CONFIGURED';
      throw e;
    }
    // Real integration lives here: create capture, poll, download .ply.
    // POST https://webapp.engineeringlumalabs.com/api/v2/capture (Bearer LUMA_API_KEY)
    // -> upload source -> trigger -> poll status -> fetch gaussian .ply -> return.
    const e = new Error('Luma integration is stubbed pending credential + contract sign-off.');
    e.code = 'PROVIDER_STUB';
    throw e;
  }
};

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
