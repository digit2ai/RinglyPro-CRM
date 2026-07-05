# EquiMind 3DGS Engine — API Reference & Capture Guide

Base: `https://aiagent.ringlypro.com/equimind-gs-engine` · Auth: EquiMind JWT (Bearer / `ecpf_token` cookie / `?token=`). Tenant = your EquiMind account.

## MCP tools — `POST /api/v1/mcp/tools/call`
Body: `{ "tool": "<name>", "arguments": { … } }` → `{ ok, tool, result }`. Catalog: `GET /api/v1/mcp/tools/list`.

| Tool | Arguments | Result |
|---|---|---|
| `gs.capture.createSession` | `kind`(course_walk\|conformation\|scene), `source_type`(video\|photos), `title?`, `horse_id?`, `report?` | session `{id,status:created}` |
| `gs.capture.uploadFrames` | `session_id`, `frame_count`, `source_bytes`, `source_seconds` | session `{status:ready}` |
| `gs.report.attach` | `session_id`, `report`(measurements+findings+horse identity) | `{ok, report}` |
| `gs.job.dispatch` | `session_id`, `inline?` | `{job, credits}` (charges credits) |
| `gs.job.status` | `job_id` | job `{status,credits_charged,error}` |
| `gs.scene.get` | `scene_id` | scene `{assets:{ply,spz,thumbnail}, splat_count, is_simulated, report_code}` |
| `gs.scene.list` | — | `[scene…]` |
| `gs.scene.delete` | `scene_id` | `{ok,deleted}` |

## REST (equivalent)
- `POST /api/v1/sessions` → create.
- `POST /api/v1/sessions/:id/upload` (multipart `frames[]`) → store source + validate coverage.
- `POST /api/v1/sessions/:id/process?inline=1` → charge + run job. `402` if out of credits.
- `GET /api/v1/jobs/:id` · `GET /api/v1/scenes` · `GET /api/v1/scenes/:id` · `DELETE /api/v1/scenes/:id`.
- `PATCH /api/v1/sessions/:id/report` `{report:{horse_name,breed,height_cm,length_cm,capture_seconds,measurements:[{key,label,value,cm,lo,hi,ideal_lo,ideal_hi,at,status}],findings:[{kind,title,detail}]}}` → attach the analysis report (do this **before** `/process` so the procedural model scales to the measurements).
- `PATCH /api/v1/scenes/:id/waypoints` `{waypoints:[{label,distance,…}]}` (Course Walk annotations).
- `GET /api/v1/public/scenes/:id?k=<share_token>` → read-only, **no login** (shareable link; includes `report`).
- `GET /api/v1/ops` → ops snapshot · `GET /api/v1/pricing?seconds=N` → unit economics.

## Surfaces
- `/capture` — mobile capture/upload + my scenes.
- `/viewer?scene=ID[&k=token]` — WebGL splat viewer (orbit/pinch, waypoints).
- `/report?scene=ID[&k=token][&lang=en|es]` — **state-of-the-art client report**: hero 3D horse (real gsplat on the `.ply`, canvas-horse fallback) + conformation measurements + Neural findings + shareable read-only link. Studio economics panel shows only on the owner (no `?k`) view. `is_simulated` scenes carry the "generated representation" disclaimer.
- `/admin` — jobs in flight, credits vs GPU spend, failure rate, unit economics.

## The $0 report path (procedural horse)
Set `GS_PROCESSING_PROVIDER=procedural` to render a **horse-shaped Gaussian cloud** scaled to the report's `height_cm`/`length_cm` — no GPU, no API, **$0/report**, always `is_simulated:true` (a generated representation, never passed off as a photoreal scan). The real viewer renders it as a horse. Upgrade to real scans later by flipping `GS_PROCESSING_PROVIDER=luma` — the report page and viewer are unchanged.

## Pricing (env-tunable, `lib/pricing.js`)
`GS_CREDITS_PER_MIN` (3), `GS_CREDITS_PER_GB_MONTH` (1), `GS_MIN_CREDITS` (2), quotas `GS_MAX_CONCURRENT` (2), `GS_MAX_SOURCE_SEC` (180), `GS_MIN_FRAMES` (20). 1 credit = $1.

## How to film for good splats (capture best practices)
1. **One slow, complete loop** around the subject (horse or jump line) — 360° coverage; don't skip the back.
2. **Even, bright light**; avoid harsh shadows and blown highlights.
3. **Keep the subject still** for conformation scans (a splat is a *static* snapshot in v1 — a moving horse blurs; use dynamic 4D in v2).
4. **Overlap frames** heavily; move smoothly, no fast pans. 20–60s of steady video is plenty.
5. **Fill the frame** with the subject; textured background helps alignment; plain sky/floor hurts it.
6. **Course walks:** walk the line at rider eye height; pause at each jump so waypoints anchor cleanly.

## Provider status
- **mock** (default) — horse-shaped placeholder splats, `is_simulated:true`. Runs anywhere, zero cost. Good for demos/tests.
- **procedural** (`GS_PROCESSING_PROVIDER=procedural`) — the $0 report path: horse-shaped cloud scaled to the report measurements, `is_simulated:true`. Cheapest production path until traction.
- **luma** (`GS_PROCESSING_PROVIDER=luma` + `LUMA_API_KEY`) — real photoreal scan of the actual horse from its video, `is_simulated:false`. See BLOCKERS.md (Enterprise/capture API gate).
- **self_hosted** — COLMAP + gsplat on your own/serverless GPU (RunPod/Modal), v2 stub. See RESEARCH.md.
