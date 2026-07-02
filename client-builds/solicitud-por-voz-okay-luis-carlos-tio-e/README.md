# Solicitud por Voz — Multi-Vital rPPG Capture (v2)

Browser-based rPPG vital-signs demo. Camera -> face-tracked multi-ROI -> POS/CHROM DSP -> multiple metrics -> tenant-scoped persisted reading -> history. Spanish-first (`?lang=en` toggles). Auto-mounted by `src/app.js` at `/solicitud-por-voz-okay-luis-carlos-tio-e`.

**VIDEO NEVER LEAVES THE BROWSER.** Face tracking (MediaPipe FaceLandmarker, on-device) and all rPPG DSP run client-side. Only the computed metrics + a timestamp are POSTed. No raw video, no biometric signal, no PII (name/email/phone) is transmitted or stored.

## Metrics (tiered)
- **Tier A — production-credible:** Heart rate (BPM), Respiratory rate (breaths/min), Signal Quality Index (SQI 0-100).
- **Tier B — experimental (labeled in UI + disclaimer):** HRV (SDNN, RMSSD ms), Stress Index (0-100 from HRV).
- **Tier C — deferred (shown "Coming soon", never a number):** Blood pressure, SpO2, BMI, disease-risk scores. These are research-grade / require a proprietary ML model + clinical validation + medical-device certification.

If SQI is below threshold the app **refuses to show a number** and coaches the user to improve light / hold still — no fabricated readings.

## Signal engine
`public/rppg-core.js` (pure DSP, importable in browser AND Node): POS (primary) + CHROM (cross-check) on mean-normalized multi-ROI RGB -> detrend -> band-limited spectral search (HR 0.7-4 Hz, respiration 0.1-0.5 Hz) -> peak. HRV from beat-to-beat intervals; SQI from spectral concentration + POS/CHROM agreement. Classical DSP only (no ML weights beyond MediaPipe's face model). `public/rppg.js` is the camera/face-tracking/DOM glue with graceful fallback: FaceLandmarker -> FaceDetector API -> static ROI.

## Runbook
```bash
# SIT (in-process, ephemeral port, mints its own JWT) — exits 0 on pass
node client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/sit.js

# Accuracy benchmark against committed fixtures — exits 0 when MAE < 5 bpm
node client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/scripts/bench-rppg.js
```

Live once deployed:
- UI: `https://aiagent.ringlypro.com/solicitud-por-voz-okay-luis-carlos-tio-e/` (append `?token=<JWT>` so saving works, `?lang=en` for English)
- History: `.../dashboard?token=<JWT>`
- Disclaimer: `.../disclaimer`
- Embed widget: `.../embed?token=<JWT>` · Embed-code generator: `.../embed-code`
- Health: `.../health`

## Endpoints
- `GET /health` — public JSON `{status,service,version:2.0.0}`
- `GET /` — multi-vital capture UI (ES default, `?lang=en`)
- `GET /dashboard` — history table (all metrics; needs `?token=`)
- `GET /disclaimer` — non-medical + experimental + skin-tone + privacy notice
- `GET /embed` — chromeless capture widget for `<iframe allow="camera">`
- `GET /embed-code` — iframe snippet generator (click-to-copy + live preview)
- `POST /api/v1/readings` — JWT + tenant; body `{bpm 30..220, respiratory_bpm? 5..40, hrv_sdnn_ms?, hrv_rmssd_ms?, stress_index? 0..100, sqi? 0..100, duration_s?, is_validation?, reference_bpm?, metrics?}` -> 201 (401 no JWT, 400 invalid range)
- `GET /api/v1/readings` — JWT; tenant-scoped list
- `GET /api/v1/readings/:id/fhir` — FHIR R4 Observation bundle (HR LOINC 8867-4, resp 9279-1); 404 wrong-tenant, 401 no JWT

## Persistence
Sequelize on `CRM_DATABASE_URL || DATABASE_URL`, table `solicitud_por_voz_okay_luis_carlos_tio_e_readings`. v1 columns + v2 additive columns (`respiratory_bpm, hrv_sdnn_ms, hrv_rmssd_ms, stress_index, sqi, is_validation, reference_bpm, metrics JSONB`). The model applies `ADD COLUMN IF NOT EXISTS` on boot (`ensureColumns`); canonical schema in `migrations/002_multivital.sql`. In-memory fallback if Postgres is unreachable.

## Accuracy is a benchmark, NOT a clinical claim
`scripts/bench-rppg.js` reports MAE/RMSE/±3bpm against committed synthetic RGB-trace fixtures (format modeled on public UBFC-rPPG / PURE datasets; no video vendored). This is a reproducible engineering benchmark. It is NOT a clinical validation and makes no medical-accuracy claim. `<0.5 bpm clinically-validated accuracy` and EU MDR / FDA certification are explicitly out of scope (Tier C).

## Compliance
Non-medical wellness demo, not a diagnostic device (stated inline on the result card and at `/disclaimer`). Tier B metrics labeled experimental. rPPG has a documented skin-tone bias, mitigated by POS/CHROM + multi-ROI but not certified. For a Latin American audience, stored health-adjacent data is governed by Ley 1581 de 2012 (Colombia) / LFPDPPP (Mexico).

## TODO / deferred
- Tier C metrics (BP, SpO2, BMI, risk scores) — need proprietary ML + clinical dataset.
- FaceDetector-API path is a stub between FaceLandmarker and the static-ROI fallback (mesh + static both fully wired).
- Clinical accuracy validation vs medical-grade reference devices; MDR/FDA filing.
