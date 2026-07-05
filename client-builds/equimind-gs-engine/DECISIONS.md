# DECISIONS.md — EquiMind 3DGS Engine (EQUIMIND-3DGS-001)

Architecture Decision Records. New dependencies must be justified here before use (loop rule).

## D1 — Module placement: client-builds sub-app `equimind-gs-engine`
Auto-mounted by `src/app.js` at `/equimind-gs-engine` (same loader as Paso Fino & Jump Coach). Keeps the GS engine self-contained, tenant-scoped, and consistent with the D2AIEAM module pattern. **No new dependency.**

## D2 — Auth & billing: REUSE the EquiMind account/credit system
`lib/auth.js` verifies the EquiMind JWT (`ECPF_JWT_SECRET||JWT_SECRET`) and resolves `ecpf_users` — the same identity as Paso Fino/Jump Coach. `lib/credits.js` charges via the existing `account.debitOne/addCredits` API. **This means NO change to billing/credit tables** — the loop rule "never modify billing/credit tables without a migration + rollback" is satisfied by not touching them at all; GS usage is recorded in the existing `ecpf_credit_tx` ledger with `analysis_type='gs'` + `GS_PROCESSING` description. **No new dependency.**

## D3 — DB: gs_ tables via Sequelize sync + canonical migration
4 tenant-scoped tables (`gs_sessions`, `gs_jobs`, `gs_scenes`, `gs_assets`). Models auto-create on boot (`sync({alter:false})`) with an in-memory fallback (parity with the championship model). Canonical DDL + rollback in `migrations/20260705_gs_tables*.sql`. **Reuses `sequelize` (already a dep).**

## D4 — Storage: S3 (available) with disk fallback, behind one adapter
`lib/storage.js` uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (ALREADY root deps — verified) since `AWS_S3_BUCKET`+creds are present in env. Falls back to Render disk (`GS_DISK_ROOT`) with HMAC-signed `/files` serving when S3 is absent. **No new dependency.**

## D5 — Job queue: DB-backed (Redis absent)
Brief allowed "BullMQ + Redis, or DB-backed queue if Redis unavailable." `REDIS_URL` is **not set**, so `lib/queue.js` is a DB-backed queue with an in-process worker tick + inline path for determinism. **Avoids adding `bullmq`+`ioredis`.** If Redis is provisioned later, swap `lib/queue.js` internals (interface unchanged).

## D6 — ProcessingProvider abstraction (the swap point)
`lib/provider.js` defines the interface and three implementations:
- **MockProvider (default):** produces a VALID placeholder `.ply` (standard 3DGS vertex layout) + `.spz` + thumbnail so the whole pipeline is testable end-to-end **without a GPU**. Every output is flagged `is_simulated:true` — never presented as a real scan.
- **LumaProvider:** real managed splatting, gated behind `LUMA_API_KEY` (absent — see BLOCKERS.md). Stubbed with a clear `PROVIDER_NOT_CONFIGURED`.
- **SelfHostedProvider:** interface stub for the v2 COLMAP+gsplat pipeline.
Selected via `GS_PROCESSING_PROVIDER` env. **No new dependency** (managed API is HTTP-only when a key exists).

## D7 — Viewer: gsplat via CDN, poster fallback
`public/viewer.html` lazy-imports `@mkkellogg/gaussian-splats-3d` from esm.sh (WebGL splat viewer) with a poster/thumbnail fallback for placeholder scenes or no-WebGL devices. **No bundled dependency** (CDN ESM, loaded on demand).

## D8 — Formats
Canonical `.ply` stored; `.spz` produced for web streaming; glTF `KHR_gaussian_splatting` tracked for future interchange (not emitted yet). Consistent with the brief.

## D9 — Naming gotcha fixed
The provider module exports `process()` but the internal function is `runProvider()` — a function literally named `process` shadows Node's global `process` across the module (caused `process.env` to be undefined). Recorded so it isn't reintroduced.
