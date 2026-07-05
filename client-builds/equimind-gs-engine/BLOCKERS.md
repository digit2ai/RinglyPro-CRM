# BLOCKERS.md — EquiMind 3DGS Engine

Per the loop protocol: build everything that does NOT need the missing secret, then report the blocker. The engine is fully built and tested end-to-end with the **MockProvider**; the single hard blocker below is what stands between "runs with placeholder splats" and "produces a real 3D Gaussian scan from a phone video."

## BLOCKER-1 (CRITICAL) — Real splat processing credential / GPU worker
**Impact:** blocks the Definition-of-Done clause *"one real capture processed end-to-end and viewable on mobile."* Everything else (schema, MCP tools, credits, queue, S3 storage, viewer, pricing, ops, docs) is live and green with the mock.

**Root cause:** Gaussian-Splatting reconstruction requires GPU processing. Neither path has credentials in the environment:
- **Managed API path (recommended for v1):** `LUMA_API_KEY` (Luma AI Genie/Capture API) or `POSTSHOT_API_KEY` — **both absent** and not derivable. This is the fastest unblock: set one key on Render, set `GS_PROCESSING_PROVIDER=luma`, and finish the ~1 screen of real API wiring stubbed in `lib/provider.js` (`LumaProvider.process`).
- **Self-hosted path (v2, cost reduction):** a GPU worker (Render GPU or AWS spot) running COLMAP SfM + gsplat training. Needs GPU infra provisioning + the `SelfHostedProvider` build. Deferred (see RESEARCH.md).

**Luma integration is now BUILT and env-configurable** (`lib/provider.js` → `LumaProvider`): create capture → upload source video to the presigned URL → trigger → poll → download the gaussian `.ply`. It threads the real uploaded bytes to the provider and counts vertices from the PLY header. SIT proves the wiring (NO_SOURCE guard, no network). So "paste the key" is real — with ONE honesty caveat below.

**HONESTY CAVEAT (verified against Luma docs 2026):** Luma's PUBLIC API (`docs.lumalabs.ai`, Dream Machine) is image/video **generation** and does **NOT** expose video→gaussian-splat. Video→splat is Luma's **capture / Enterprise** API — access is gated by a Luma account/contract, and its exact endpoint is not in the public docs. `LumaProvider` targets the documented capture flow at `webapp.engineeringlumalabs.com/api/v2` and is fully overridable, so if your Luma Enterprise contract gives a different base/auth, you change env — not code.

**What the human must provide (one of):**
1. A **Luma capture/Enterprise API key** → set on Render:
   - `LUMA_API_KEY=<key>`
   - `GS_PROCESSING_PROVIDER=luma`
   - (only if your contract differs) `GS_LUMA_BASE_URL`, `GS_LUMA_AUTH_STYLE` (`luma`|`bearer`), `GS_LUMA_POLL_MS`, `GS_LUMA_TIMEOUT_MS`
   Then run one real phone-video capture. If Luma's capture API isn't available to your account, use a **generic managed video→.ply provider** with the same create/poll/download shape by pointing `GS_LUMA_BASE_URL` at it.
2. Or approval + budget for a **self-hosted GPU worker** (COLMAP + gsplat) — `SelfHostedProvider`, v2 (RESEARCH.md).

**Not blocked by this (shipped now):** capture upload, coverage validation, credit metering (real ledger), DB-backed job queue with auto-refund on failure, S3 storage with signed URLs, MCP tools, the web viewer, pricing/unit-economics, quota guards, admin ops cards, bilingual UI, docs. The mock lets the full flow be demoed today (labeled `is_simulated`).

## Non-blockers (resolved with available env)
- **S3 storage:** `AWS_S3_BUCKET` + creds present → real S3 signed URLs active. ✓
- **Redis:** absent → DB-backed queue used instead (D5). ✓
- **Auth/DB:** `JWT_SECRET` + `DATABASE_URL` present. ✓

## Status
LOOP PAUSED on BLOCKER-1 for P2's real-provider acceptance and the final DoD only. P1, P3, P4 acceptance criteria are green with the mock; see PROGRESS.md.
