# AI Jump Coach — Rider Pose Analyzer (v2)

Auto-mounted Express sub-app at `/ai-jump-coach-rider-pose-analyzer`. A user uploads a show-jumping clip; **MediaPipe Pose runs in the browser** (CPU, no GPU/Python/ffmpeg) to produce per-frame keypoints sampled at ~5fps; the browser POSTs the keypoint frames to this backend, where a deterministic Node **rubric engine** (`lib/rubric.js`, layered on `lib/faultEngine.js`) turns them into a full **coaching evaluation**: a 0–100 **rider score** across five dimensions (overall position · hands & contact · legs & seat · synchronization · posture by phase), phase segmentation (approach/suspension/landing/recovery), an expanded set of position-fault signatures, height-category tolerances, and manual course inputs. The UI plays the original video with a skeleton overlay, a clickable fault timeline, and the score card.

**v2 upgrade (rubric):** rider-position metrics computed from pose — balance line (ear–shoulder–hip–heel), left/right symmetry, heel-down %, lower-leg stability, hand independence, release quality, fold angle, fold timing/sync, landing recovery — plus the original 4 faults (`left_behind`, `dropped_rein`, `gaze_drop`, `forward_seat`) and new insight signatures (`heel_up`, `leg_swing`, `hand_dependent`, `load_left/right`, `alignment_off`, `release_short`, `timing_ahead/behind`). **Honest scope:** horse-side biomechanics (bascule, take-off distance, fore/hind symmetry) and full-course rhythm (stride between fences, approach speed) require **horse** pose / course data and are declared in `pending[]` — not faked. Course time (optimal vs total) is **manual** input. Height categories: 80 · 1.00 · 1.10 · 1.20 · 1.30 · 1.40 · 1.50–1.60 m+.

**Cross-analysis intelligence** (`lib/patterns.js`): per-binomio **records** (max height over time), **workload** (jumps/week + overload flag), **pattern alerts** (recurring faults, rail bias by fence type, refusal clustering, lateral load, score trend), horse **comparison**, and a per-analysis **journal** (rider's subjective note vs objective score).

**v3 — horse technique (`lib/horseTechnique.js`):** estimates the HORSE's jump. Two sources, tagged: `rider_proxy` (bascule, arc symmetry, air-time, take-off timing/label derived from the rider's center-of-mass trajectory — a real physical proxy, lower confidence) and `horse_pose` (full metrics incl. **fore/hind symmetry** from an equine-keypoint contract: `{poll, withers, croup, fore_left/right_hoof, hind_left/right_hoof}` per frame, POSTed as optional `horseFrames[]`). Exact take-off distance in metres (needs fence detection) and fore/hind symmetry without horse limbs stay honestly in `pending[]`. Returned as `horse` and stored in `metrics.horse`.

**UI now surfaces it all:** rider score card + dimension bars, **horse-technique card**, **manual rail/refusal tagging** (builds `manualFaults[]`), **rider journal** (perception vs data), and a **binomio-intelligence** panel (pattern alerts + workload/overload + records) that reads the `insights/*` endpoints.

**v4.1 — guided fault review ON the original video (replaces the separate 2D panel):** the real `<video>` plays and **stops at each finding** ("Reproducir con pausas" auto-mode, or Prev/Next). At each stop the fault is drawn **on the real footage** at the exact joint/location (same anchor map) with the type + a "cómo corregirlo" tip, and the fault card + arc playhead sync. Clicking a fault card or arc pin jumps the video to that moment and pauses. The persisted joint tracks (`lib/replay.js`) reconstruct the skeleton overlay + fault cue so re-opened reports still show the review (the raw video itself is never stored). The old standalone animated 2D `<canvas>` panel was removed to avoid confusion.

**(superseded) v4 — 2D animated slow-motion replay (`lib/replay.js`):** below "Video original" a `<canvas>` replays the jump in slow motion — a **stylized horse** (`buildHorseTrack`, source `stylized`, follows the arc from the rider CoM) + the **real rider skeleton** — where each fault appears at its exact timestamp AND is highlighted on the anchored joint (gaze→head, rein/hand→wrists, left-behind/forward-seat→torso, heel/leg→lower leg, load-left/right→that side, alignment→the balance line), with a "cómo corregirlo" tip. Play/pause/scrub/loop + 0.25/0.5/1x, reduced-motion respected, mobile-safe; two-way seek with the arc playhead + fault cards. Data is a **compact downsampled joint track** persisted server-side from the posted frames — `pose_track` (~13 rider landmarks) + `horse_track` (7 stylized points), rounded to 3 decimals, ≤200 frames — returned by GET `/:id` and `/:id/report` so re-opened reports and public share links replay too. The raw video is never stored. Real horse pose (source `horse_pose`) drops in with no UI change the moment a model supplies `horseFrames[]`.

## Endpoints
- `GET /health` → `{status:'ok', service, version, store}`
- `GET /` · `/dashboard` · `/privacy` — server-rendered, `?lang=es|en` (default **es**)
- `POST /api/v1/analyses` (JWT) — body `{filename, durationSec, frames:[{t,keypoints}], lang?, heightCategory?, horseName?, riderName?, optimalTimeSec?, totalTimeSec?, manualFaults?[]}` → 201 row incl. `faults[]`, `rider_score`, `dimension_scores`, `phase_metrics`, `metrics`, `course`, `pending`
- `GET /api/v1/analyses` · `GET /api/v1/analyses/:id` · `DELETE /api/v1/analyses/:id` (JWT, tenant-scoped; cross-tenant → 404)
- `GET /api/v1/analyses/insights/records|workload|patterns|compare` (JWT) — cross-analysis intelligence
- `POST /api/v1/analyses/:id/journal` (JWT) — body `{feeling, selfScore?}` → appends a subjective entry

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
