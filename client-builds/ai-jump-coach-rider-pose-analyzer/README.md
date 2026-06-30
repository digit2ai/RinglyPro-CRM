# AI Jump Coach — Rider Pose Analyzer (PoC)

Auto-mounted Express sub-app at `/ai-jump-coach-rider-pose-analyzer`. A user uploads a show-jumping clip; **MediaPipe Pose runs in the browser** (CPU, no GPU/Python/ffmpeg) to produce per-frame keypoints sampled at ~5fps; the browser POSTs the keypoint frames to this backend, where a deterministic Node **fault engine** (`lib/faultEngine.js`) flags four position-fault signatures — `left_behind`, `dropped_rein`, `gaze_drop`, `forward_seat` — each with a timestamp and confidence. The UI plays the original video with a skeleton overlay and a clickable fault timeline keyed to video seconds.

This is a **proof of concept** (triage: POC, fit 6/10): it proves "the AI can see the rider on a moving horse" and produces visible, falsifiable output. Fine-tuned models, GPU inference, billing, native apps, and integrations are explicitly deferred.

## Endpoints
- `GET /health` → `{status:'ok', service, version, store}`
- `GET /` · `/dashboard` · `/privacy` — server-rendered, `?lang=es|en` (default **es**)
- `POST /api/v1/analyses` (JWT) — body `{filename, durationSec, frames:[{t,keypoints}], lang?}` → 201 row incl. `faults[]`
- `GET /api/v1/analyses` · `GET /api/v1/analyses/:id` · `DELETE /api/v1/analyses/:id` (JWT, tenant-scoped; cross-tenant → 404)

## Data
Postgres via `DATABASE_URL`, table `ai_jump_coach_rider_pose_analyzer_analyses` (multi-tenant, `tenant_id NOT NULL` + index), created on boot via `sync({alter:false})`; canonical DDL in `migrations/001_create_analyses.sql`. Only metadata + computed `faults[]` are stored — **never the video or raw keypoints** (PII + size). If the DB is unreachable, the store falls back to in-memory (set `AIJUMP_FORCE_MEMORY=1` to force it, used by SIT).

## Auth
Reuses the RinglyPro CRM JWT (`JWT_SECRET`); `tenant_id` derived from token claims. The browser uses the SSO `localStorage['token']`. No custom signer.

## Run SIT
```bash
node client-builds/ai-jump-coach-rider-pose-analyzer/sit.js
# remote: SIT_BASE_URL=https://aiagent.ringlypro.com/ai-jump-coach-rider-pose-analyzer node .../sit.js
```
SIT boots the app in-memory and verifies health, JWT gating, the fault engine against a checked-in fixture, tenant scoping, the ES/EN pages, and `/privacy`.

## Notes / deferred
- Browser MediaPipe assets load from the jsDelivr CDN (pinned `@mediapipe/tasks-vision@0.10.14`) + the Google-hosted `pose_landmarker_lite` model. **TODO: vendor the wasm + .task** to drop the CDN dependency. If the model can't load, the client falls back to a synthetic keypoint generator so the flow stays demonstrable.
- No accuracy validation; thresholds in `faultEngine.js` are documented heuristics.
