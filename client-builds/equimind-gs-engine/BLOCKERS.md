# BLOCKERS.md — EquiMind 3DGS Engine

Per the loop protocol: build everything that does NOT need the missing secret, then report the blocker. The engine is fully built and tested end-to-end with the **MockProvider**; the single hard blocker below is what stands between "runs with placeholder splats" and "produces a real 3D Gaussian scan from a phone video."

## BLOCKER-1 (CRITICAL) — Real splat processing credential / GPU worker
**Impact:** blocks the Definition-of-Done clause *"one real capture processed end-to-end and viewable on mobile."* Everything else (schema, MCP tools, credits, queue, S3 storage, viewer, pricing, ops, docs) is live and green with the mock.

**Root cause:** Gaussian-Splatting reconstruction requires GPU processing. Neither path has credentials in the environment:
- **Managed API path (recommended for v1):** `LUMA_API_KEY` (Luma AI Genie/Capture API) or `POSTSHOT_API_KEY` — **both absent** and not derivable. This is the fastest unblock: set one key on Render, set `GS_PROCESSING_PROVIDER=luma`, and finish the ~1 screen of real API wiring stubbed in `lib/provider.js` (`LumaProvider.process`).
- **Self-hosted path (v2, cost reduction):** a GPU worker (Render GPU or AWS spot) running COLMAP SfM + gsplat training. Needs GPU infra provisioning + the `SelfHostedProvider` build. Deferred (see RESEARCH.md).

**What the human must provide (one of):**
1. A **Luma AI (or PostShot) API key** → set `LUMA_API_KEY` (or `POSTSHOT_API_KEY`) + `GS_PROCESSING_PROVIDER=luma` on Render. *Fastest.*
2. Or approval + budget to stand up a **GPU worker** for the self-hosted pipeline.

**Not blocked by this (shipped now):** capture upload, coverage validation, credit metering (real ledger), DB-backed job queue with auto-refund on failure, S3 storage with signed URLs, MCP tools, the web viewer, pricing/unit-economics, quota guards, admin ops cards, bilingual UI, docs. The mock lets the full flow be demoed today (labeled `is_simulated`).

## Non-blockers (resolved with available env)
- **S3 storage:** `AWS_S3_BUCKET` + creds present → real S3 signed URLs active. ✓
- **Redis:** absent → DB-backed queue used instead (D5). ✓
- **Auth/DB:** `JWT_SECRET` + `DATABASE_URL` present. ✓

## Status
LOOP PAUSED on BLOCKER-1 for P2's real-provider acceptance and the final DoD only. P1, P3, P4 acceptance criteria are green with the mock; see PROGRESS.md.
