# PROGRESS.md — EquiMind 3DGS Engine (EQUIMIND-3DGS-001)

Loop cadence: one phase per iteration; TEST never skipped; commit + this file every iteration.

## Overall: ~80% (P1 ✅ · P2 ✅ mock / ⏸ real-provider · P3 ✅ · P4 ✅ · P5 ✅)
LOOP PAUSED on **BLOCKER-1** (real splat GPU credential) — the only thing between mock and real scans. Everything buildable without that secret is shipped, tested (SIT 15/15), and deployed.

## P1 — Foundations & Schema ✅
- MCP module `gs-engine`: 7 tools (`gs.capture.createSession/uploadFrames`, `gs.job.dispatch/status`, `gs.scene.get/list/delete`) — `GET /api/v1/mcp/tools/list`, `POST /api/v1/mcp/tools/call`. Multi-tenant JWT enforced.
- Migrations `gs_sessions/gs_jobs/gs_scenes/gs_assets` (tenant-scoped) + rollback. **Verified up→down→up clean against prod DB.**
- Credit metering `GS_PROCESSING` via the existing EquiMind ledger (no billing-table change).
- Storage adapter: S3 (active — AWS creds present) + Render-disk fallback with signed URLs.
- **Acceptance: migrations clean ✅ · MCP schema-valid JSON ✅ · credit deduction on simulated job ✅**

## P2 — Capture Pipeline (Static 3DGS) ✅ (mock) / ⏸ (real)
- Upload flow (video/photos) + coverage validation (min frames / size / duration).
- DB-backed job queue (Redis absent) + in-process worker + inline path.
- ProcessingProvider: MockProvider (end-to-end placeholder splats), LumaProvider (real, stubbed pending key), SelfHostedProvider (v2 stub).
- Post-process: .ply canonical + .spz stream + thumbnail; asset records.
- **Acceptance: end-to-end upload→job→ply+spz+thumb→scene.get URLs ✅ (mock) · failed job auto-refunds credits ✅. Real-provider end-to-end ⏸ BLOCKER-1.**

## P3 — Viewer & Product Surfaces ✅
- WebGL splat viewer (`/viewer`, gsplat.js via CDN) with poster fallback; orbit/pinch; waypoints.
- Course Walk (waypoint annotations, public shareable `?k=token` link, no login) + Conformation Scan preset.
- Bilingual EN/ES from day one.
- **Acceptance: read-only public link ✅ · EN/ES strings ✅ · interactive viewer ✅ (mock scene renders poster; real splats render once provider is live).**

## P4 — Pricing, Limits, Ops ✅
- Pricing config (per-min processing, per-GB storage, min charge, premium share gate) — env-tunable.
- Quota guards: max concurrent jobs/tenant, max scene size/duration, min frames.
- Admin cards (`/admin`): jobs in flight, credits vs GPU spend, failure rate; unit-economics endpoint.
- Docs: `DOCS.md` (API ref + capture best-practices).
- **Acceptance: unit-economics report (margin > 0 at list) ✅ · concurrency/quota guards ✅.**

## P6 — State-of-the-art client report + $0 procedural path ✅ (2026-07-05)
The deliverable clients generate after an analysis: a shareable 3D report. Cost problem (Luma) solved for the pre-traction phase by generating the horse in-engine instead of on a GPU.
- **ProceduralHorseProvider** (`lib/provider.js`) — builds a horse-shaped, VALID 3DGS `.ply` (barrel/chest/hindquarter/neck/head/muzzle/ears/4 legs/tail as gaussians) scaled to the report's `height_cm`/`length_cm`. `GS_PROCESSING_PROVIDER=procedural`. **$0/report, no GPU/API**, always `is_simulated:true`. The MockProvider now also renders a horse (not a ring).
- **Report data** — `session.meta.report` (measurements + findings + horse identity), sanitized/capped in `service.js`. Attach via `PATCH /api/v1/sessions/:id/report` or the `gs.report.attach` MCP tool, or seed at `createSession`. Surfaced on the scene response (public via share token too).
- **Report page** — `/report?scene=ID[&k=token][&lang=]` (`public/report.html`): hero 3D (real gsplat on the `.ply`, canvas-horse fallback), conformation measurement bars, Neural findings, shareable read-only link, owner-only studio economics panel, bilingual EN/ES. Honesty disclaimer on simulated scenes (3D = generated representation; measurements/findings = real analysis).
- **Upgrade path** — flip `GS_PROCESSING_PROVIDER=luma` for real photoreal scans; report + viewer unchanged (the whole point of the provider interface).
- **Acceptance: SIT 21/21** (was 15) — procedural job → horse cloud (>1000 splats), report stored + surfaced, public share shows report without login. PLY validated (body bytes align, brass f_dc, isotropic scale).

## P5 — Dynamic 4DGS & Avatars (research) ✅
- `RESEARCH.md`: GO on managed dynamic 4D fast-follow; NO-GO/defer on articulated horse avatars until a managed video→rigged-quadruped API exists. Cost model + v2 architecture documented.

## Tests
- `node sit.js` → **SIT 15/15** (in-memory, mock): pipeline, credit charge, auto-refund, MCP tools, auth, health.
- Migration up/down/up verified against prod DB.
- **LIVE prod E2E (2026-07-05):** MCP createSession → uploadFrames → process → job `done` → scene `GS-000014` (512 splats, is_simulated) with assets in **real S3** (`ringlypro-uploads/gs/…`); `.ply` downloads HTTP 200, 35 KB. Fixed a schema mismatch (gs_assets is write-once, `updatedAt:false`) found only in prod (SIT runs in-memory).

## Next step (to close DoD)
Set `LUMA_API_KEY` (or `POSTSHOT_API_KEY`) + `GS_PROCESSING_PROVIDER=luma` on Render → finish `LumaProvider.process` (~1 screen already scaffolded) → run one real phone-video capture end-to-end. See BLOCKERS.md.
