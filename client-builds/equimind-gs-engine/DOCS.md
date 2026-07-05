# EquiMind 3DGS Engine — API Reference & Capture Guide

Base: `https://aiagent.ringlypro.com/equimind-gs-engine` · Auth: EquiMind JWT (Bearer / `ecpf_token` cookie / `?token=`). Tenant = your EquiMind account.

## MCP tools — `POST /api/v1/mcp/tools/call`
Body: `{ "tool": "<name>", "arguments": { … } }` → `{ ok, tool, result }`. Catalog: `GET /api/v1/mcp/tools/list`.

| Tool | Arguments | Result |
|---|---|---|
| `gs.capture.createSession` | `kind`(course_walk\|conformation\|scene), `source_type`(video\|photos), `title?`, `horse_id?` | session `{id,status:created}` |
| `gs.capture.uploadFrames` | `session_id`, `frame_count`, `source_bytes`, `source_seconds` | session `{status:ready}` |
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
- `PATCH /api/v1/scenes/:id/waypoints` `{waypoints:[{label,distance,…}]}` (Course Walk annotations).
- `GET /api/v1/public/scenes/:id?k=<share_token>` → read-only, **no login** (shareable Course Walk link).
- `GET /api/v1/ops` → ops snapshot · `GET /api/v1/pricing?seconds=N` → unit economics.

## Surfaces
- `/capture` — mobile capture/upload + my scenes.
- `/viewer?scene=ID[&k=token]` — WebGL splat viewer (orbit/pinch, waypoints).
- `/admin` — jobs in flight, credits vs GPU spend, failure rate, unit economics.

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
Default provider is **MOCK** (placeholder splats, `is_simulated:true`). Real scans require `LUMA_API_KEY` (or `POSTSHOT_API_KEY`) + `GS_PROCESSING_PROVIDER=luma` — see BLOCKERS.md.
