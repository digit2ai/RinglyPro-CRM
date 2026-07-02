# Sprint Brief v2 — Solicitud por Voz (Multi-Vital rPPG · shen.ai-competitive)

## Sprint Goal
Upgrade the existing single-metric heart-rate demo into a **multi-vital, face-tracked rPPG capture engine** that measures heart rate, respiratory rate, and (labeled experimental) HRV + stress from the webcam — with a trustworthy signal-quality gate, a benchmark/validation harness, and an embeddable widget — while keeping all video processing 100% in the browser. This closes the credible, non-research portion of the gap to shen.ai.

## Base — extend, do not replace
Build **on top of** the live app at `client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/` (mounted at `/solicitud-por-voz-okay-luis-carlos-tio-e`, commit `9549570c`). Keep the health route, JWT/tenant middleware, i18n dict pattern, Sequelize+in-memory store, and SIT harness style. All additive; existing acceptance criteria 1-10 must still pass (regression-guarded).

## Primary Deliverable
A single-page web app where the user grants camera access and sees their live feed with a **tracked face mesh and multi-ROI overlay** (forehead + both cheeks). The engine extracts RGB traces per ROI, runs a **POS/CHROM** rPPG pipeline (motion- and illumination-robust, works across skin tones), and returns:

- **Tier A — production-credible (ship on these):** Heart rate (BPM), Respiratory rate (breaths/min), and a **Signal Quality Index (SQI, 0-100)**.
- **Tier B — experimental (must be labeled "estimacion experimental / experimental estimate" in UI + payload):** HRV (SDNN, RMSSD, ms), a derived Stress Index (0-100 from HRV).
- **Tier C — deferred (see below), shown as "Proximamente / Coming soon", never a number.**

Progressive reveal like shen.ai: HR + SQI appear at ~5-10 s, all Tier A/B refine over a 30 s window. If SQI is below threshold, the app **refuses to report a number** and asks the user to improve light/hold still — no fabricated readings. Each completed measurement (all metrics) is POSTed and stored per-tenant, and appears in the history dashboard. Video frames never leave the browser; only computed metrics + a timestamp are POSTed.

## Explicitly Deferred (Tier C — research-grade, shen.ai's moat; do NOT fake)
- **Blood pressure / arterial pressure** — no validated consumer-camera method at credible accuracy without a proprietary ML model + clinical dataset. Show as "Coming soon", link to disclaimer.
- **SpO2** — requires calibrated multi-wavelength assumptions consumer cameras do not satisfy; defer.
- **BMI / disease-risk scores** — ML-derived from proprietary datasets; defer.
- **<0.5 bpm clinically-validated accuracy + EU MDR / FDA certification** — requires a labeled clinical study and regulatory filing; out of scope for software. The benchmark harness below is the demo-appropriate stand-in, NOT a clinical claim.
- **Native mobile app**, multi-tenant onboarding UI, telephony/voice-agent flow.

## Signal Engine (the core upgrade)
- **Face detection & tracking:** MediaPipe FaceMesh (WASM, on-device) with a graceful fallback to the browser `FaceDetector` API, and to the current static-rectangle ROI if neither is available. Landmark-driven ROIs: forehead + left/right cheek; reject frames where the face is lost, too small, over-rotated (yaw/pitch beyond threshold), or over/under-exposed.
- **Trace extraction:** per-ROI mean R/G/B per frame with the real frame timestamp (handle variable webcam FPS). Skin-pixel masking (drop non-skin/over-saturated pixels).
- **rPPG algorithm:** implement **POS (Plane-Orthogonal-to-Skin)** as primary and **CHROM** as a cross-check; both are closed-form (no ML lib), motion/illumination robust, and skin-tone tolerant. Fuse the multi-ROI signals (quality-weighted average).
- **Post-processing:** detrend -> bandpass (HR 0.7-4 Hz; respiration 0.1-0.5 Hz) -> Welch/FFT power spectrum -> dominant peak. HR from the HR band; respiratory rate from the respiration band and/or the HR-signal amplitude envelope; HRV (SDNN/RMSSD) from beat-to-beat peak intervals in the filtered waveform.
- **Signal Quality Index (SQI):** spectral concentration + peak prominence + frame-acceptance ratio -> 0-100. Below threshold -> refuse to report (this is what makes the number trustworthy). SQI replaces the current cosmetic "confidence".
- **Constraint:** classical DSP only, no ML weights beyond MediaPipe's face model. Everything runs client-side.

## Benchmark / Validation Harness (the "clinically validated" stand-in)
- A `?mode=bench` view + `scripts/bench-rppg.js` that runs the exact browser DSP (extracted into a shared, environment-agnostic module `public/rppg-core.js` that both the page and Node import) against **pre-recorded RGB trace fixtures** with known ground-truth HR (small committed CSVs; cite public rPPG datasets like UBFC-rPPG / PURE as the source format — do not vendor their video).
- Outputs MAE (bpm), RMSE, and % within +/-3 bpm; SIT asserts the engine stays under a documented error bound on the fixtures. This gives a reproducible accuracy figure without any clinical claim.
- A "validation mode" in the live UI where a user can enter a reference HR (e.g., from a pulse oximeter) alongside a reading; stored with `is_validation=true` for later error analysis (still no PII).

## Distribution / Embeddability (closes shen.ai's SDK gap, demo-grade)
- **Embeddable widget:** `GET /embed?token=&lang=&metrics=hr,rr` returns a minimal, chromeless capture UI designed for an `<iframe allow="camera">`; plus an embed-code generator page (`/embed-code`) that emits the iframe snippet with click-to-copy (mirror the pattern in `public/champion-embed.html`).
- **Metrics export:** `GET /api/v1/readings/:id/fhir` returns the reading as a FHIR R4 `Observation` bundle (HR = LOINC 8867-4, resp = 9279-1), tenant-scoped, JWT-guarded — the interoperability hook telehealth buyers ask for.

## Tech Stack & Conventions
- **Backend:** Node.js + Express, same sub-app `client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/index.js`, auto-mounted at `/solicitud-por-voz-okay-luis-carlos-tio-e`.
- **DB:** Sequelize on `CRM_DATABASE_URL || DATABASE_URL`. Extend the existing table `solicitud_por_voz_okay_luis_carlos_tio_e_readings` additively — new nullable columns `respiratory_bpm`, `hrv_sdnn_ms`, `hrv_rmssd_ms`, `stress_index`, `sqi`, `is_validation BOOLEAN DEFAULT false`, `reference_bpm`, and a `metrics JSONB` catch-all + GIN index. Migration `002_multivital.sql` with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; model `sync({alter:false})` + explicit ALTER on boot (existing pattern).
- **Auth:** reuse `middleware/tenant.js` verbatim (RinglyPro JWT, default tenant 1). All write + read endpoints JWT-guarded.
- **Frontend:** static HTML + vanilla JS + Tailwind (CDN), dark theme. rPPG DSP in `public/rppg-core.js` (pure, importable by Node) + `public/rppg.js` (DOM/camera glue). MediaPipe FaceMesh loaded lazily from CDN on first capture intent (like the ElevenLabs lazy-load pattern in `champion-teaser.html`); fall back gracefully if the CDN/model is blocked.
- **i18n:** extend `i18n/dict.js` (ES default, `?lang=en`), including all new metric labels, the experimental disclaimers, and the low-signal coaching copy. Proper Spanish orthography, no emojis.
- **Observability:** structured stderr logs, tenant_id + reading id + source only — never raw signal or PII. `GET /health` returns `{status:'ok', service:'...-tio-e', version:'2.0.0'}`.

## Compliance & Security
- Video frames NEVER leave the browser (MediaPipe inference is on-device). Only computed metrics + timestamp are POSTed. Stated inline on the result card and at `/disclaimer`.
- Strengthen `/disclaimer`: (1) non-medical wellness demo, not a diagnostic device; (2) Tier B metrics are experimental estimates; (3) accuracy varies with lighting, motion, and skin tone, and rPPG has documented skin-tone bias we mitigate (POS/CHROM + multi-ROI) but do not certify; (4) privacy statement; (5) Ley 1581 de 2012 (Colombia) / LFPDPPP (Mexico) for any stored health-adjacent data.
- No PII stored with readings. JWT required on all `/api/v1/*`. Tenant isolation on every read.

## Acceptance Criteria
1. `GET /.../health` -> 200 `{status:'ok', service:'solicitud-por-voz-okay-luis-carlos-tio-e', version:'2.0.0'}`.
2. `GET /.../` -> 200 HTML with `<video`, a Spanish `<h1>` ("Medicion Facial"), and a multi-ROI/face-mesh `<canvas>` overlay element.
3. `GET /.../?lang=en` -> English `<h1>`.
4. `POST /.../api/v1/readings` with valid JWT and body `{bpm:72, respiratory_bpm:15, hrv_sdnn_ms:45, stress_index:30, sqi:82, duration_s:30, metrics:{...}}` -> 201 with the created row incl. `id, tenant_id, bpm, respiratory_bpm, sqi, created_at`.
5. Same POST without JWT -> 401.
6. POST `{bpm:"abc"}` -> 400 (bpm integer 30-220); POST `{bpm:72, respiratory_bpm:99}` -> 400 (respiratory_bpm out of 5-40); POST `{bpm:72, sqi:150}` -> 400 (sqi 0-100).
7. `GET /.../api/v1/readings` with valid JWT -> 200, array scoped to caller's tenant only, includes the new metric fields.
8. `GET /.../disclaimer` -> 200 with non-medical + experimental-metrics + skin-tone + privacy text.
9. `GET /.../api/v1/readings/:id/fhir` with valid JWT -> 200 FHIR `Observation` bundle with HR LOINC 8867-4; wrong-tenant id -> 404; no JWT -> 401.
10. `GET /.../embed?token=<JWT>` -> 200 chromeless capture HTML containing `<video`; `GET /.../embed-code` -> 200 with a copyable `<iframe` snippet.
11. `rppg-core.js` is importable in Node; `node scripts/bench-rppg.js` runs the DSP on committed fixtures and prints MAE/RMSE/+-3bpm%, exiting 0 when MAE is under the documented bound.
12. `node sit.js` exits 0; prints a markdown summary of failures on non-zero.
13. No regression: existing criteria (health shape, page render, auth'd write, unauth 401, tenant scoping, disclaimer), the sibling `client-builds/*` health, and `/projects/health` all still 200.

## File Layout (additions to the existing dir)
```
client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/
|-- index.js                         # + mount embed + fhir routes (existing extended)
|-- routes/readings.js               # extended: multi-metric validation (bpm/rr/hrv/sqi ranges)
|-- routes/pages.js                  # + /embed, /embed-code (existing / /dashboard /disclaimer)
|-- routes/fhir.js                   # GET /api/v1/readings/:id/fhir  (JWT + tenant)
|-- models/reading.js                # + respiratory_bpm, hrv_*, stress_index, sqi, metrics JSONB
|-- migrations/002_multivital.sql    # ALTER TABLE ADD COLUMN IF NOT EXISTS + GIN(metrics)
|-- i18n/dict.js                     # + all new labels / experimental + coaching copy
|-- public/index.html                # + face-mesh canvas, multi-metric result cards, progressive reveal
|-- public/rppg-core.js              # PURE DSP: POS/CHROM, bandpass, FFT/Welch, HRV, SQI (Node-importable)
|-- public/rppg.js                   # camera + MediaPipe FaceMesh + ROI + calls rppg-core
|-- public/dashboard.html            # history table with all metrics + SQI + validation flag
|-- public/embed.html                # chromeless iframe capture widget
|-- public/embed-code.html           # iframe snippet generator (click-to-copy)
|-- scripts/bench-rppg.js            # runs rppg-core on fixtures -> MAE/RMSE/+-3bpm
|-- fixtures/*.csv                    # RGB traces + ground-truth HR (UBFC/PURE format; no vendored video)
|-- sit.js                           # extended harness (criteria 1-13)
`-- README.md                        # runbook + accuracy-is-a-benchmark-not-a-clinical-claim note
```

## Stuck-Loop Heuristics
- If MediaPipe fails to load (CDN blocked) twice -> fall back to `FaceDetector` API, then to the v1 static-rectangle ROI; keep HR + SQI working. Mark the mesh path with a TODO. Never let face-tracking failure block the persist-and-list slice.
- If POS/CHROM HRV/stress are noisy on the fixtures beyond the budget -> keep Tier A (HR, RR, SQI) as shipped, downgrade Tier B to "experimental — no disponible en este dispositivo", and TODO the HRV path. Do not fabricate.
- If the benchmark MAE exceeds the bound twice -> do not loosen the bound silently; log the actual MAE in the report, keep HR shipping with the honest SQI gate, and TODO the algorithm tuning.
- If a migration/ALTER will not apply -> rely on `metrics` JSONB for the new fields and note it in README.
- Iteration > 30 -> freeze features: guarantee criteria 1, 2, 4, 5, 7, 8, 12, 13 (health, render, auth'd multi-metric write, unauth reject, tenant scoping, disclaimer, SIT green, no regression). Everything else -> README TODO.

## Non-negotiables carried from standing prefs
Multi-tenant on every table/query; bilingual EN/ES; no emojis; proper Spanish orthography; on-device video; honest labeling (no clinical/BP/SpO2 claims). Accuracy is presented only as a reproducible benchmark, never as certification.

## Closing
Commit + push to main; Render auto-deploys (~90s). The health-poller fires SIT automatically. Bump `version` to `2.0.0`. Report: the workforce used, metrics shipped per tier, the benchmark MAE/RMSE actually achieved, live-verified criteria, and any Tier B item downgraded to experimental.
