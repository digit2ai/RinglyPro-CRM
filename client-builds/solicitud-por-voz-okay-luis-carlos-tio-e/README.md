# MaraMed — Multi-Vital rPPG Capture (v3)

Browser-based rPPG + rBCG vital-signs engine. Camera -> face-tracked multi-ROI + head micro-motion -> shared signal-quality backbone -> confidence-gated estimators -> tenant-scoped persisted reading -> history/trends. Spanish-first (`?lang=en`). Auto-mounted at `/solicitud-por-voz-okay-luis-carlos-tio-e`; public vanity URL `/maramed` (landing at `/maramed-landing.html`).

**VIDEO NEVER LEAVES THE BROWSER.** Face tracking (MediaPipe FaceLandmarker, on-device), rPPG and rBCG DSP all run client-side. Only computed metrics + a timestamp are POSTed. No raw video, no biometric signal, no PII.

## Architecture (shared backbone -> gated estimators)
- **M4 preprocess:** resample from real frame timestamps (fixes jitter), background-patch illumination compensation, detrend.
- **M5 rPPG ensemble:** POS + CHROM + GREEN, highest-SNR selected per window.
- **M6 rBCG + fusion:** HR from vertical head micro-motion (color-independent -> Fitzpatrick-bias mitigation), fused with rPPG. A clean color signal is never overridden by motion; rBCG rescues only when rPPG is weak (dark skin / low light).
- **M7 SQI:** 0-100 from SNR + peak prominence + motion + rPPG/rBCG agreement + beat regularity. Every estimator is gated; below threshold the app refuses to show a number.
- **M8 Kalman HR tracker:** smooth, jump-limited BPM (rejects >15 bpm/s).

## Metrics (honesty tiers)
- **Principal:** Heart rate (BPM), Respiratory rate (dual-source), HRV (SDNN/RMSSD, **at-rest gated**), Signal Quality Index.
- **Experimental — calibration required:** Blood pressure (trend, per-user cuff calibration), SpO2 (per-user oximeter calibration). Hard-blocked until calibrated; shown as trend, never a diagnosis.
- **Stress:** REMOVED from the product (code, UI, API).

Calibration + trend history are stored on-device (localStorage); nothing leaves the browser.

## Runbook
```bash
# SIT (in-process, mints its own JWT) — exits 0 on pass
node client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/sit.js

# Accuracy + robustness benchmark (HR MAE, rBCG rescue, motion, refusal) — exits 0 on pass
node client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/scripts/bench-rppg.js
```

Live: app `https://aiagent.ringlypro.com/maramed` (append `?token=<JWT>` to save, `?lang=en`) · history `/maramed/dashboard?token=` · disclaimer `/maramed/disclaimer` · embed `/maramed/embed` + `/maramed/embed-code` · health `/maramed/health`.

## Endpoints
- `GET /health` -> `{status,service,version:3.0.0}`
- `GET /` · `/dashboard` · `/disclaimer` · `/embed` · `/embed-code`
- `POST /api/v1/readings` — JWT + tenant; body `{bpm 30..220, respiratory_bpm? 5..40, hrv_sdnn_ms?, hrv_rmssd_ms?, bp_systolic? 60..260, bp_diastolic? 30..160, spo2? 70..100, sqi? 0..100, duration_s?, metrics?}` -> 201 (401 no JWT, 400 invalid range)
- `GET /api/v1/readings` — tenant-scoped list
- `GET /api/v1/readings/:id/fhir` — FHIR R4 Observation bundle (HR 8867-4, resp 9279-1)

## Persistence
Sequelize on `CRM_DATABASE_URL || DATABASE_URL`, table `solicitud_por_voz_okay_luis_carlos_tio_e_readings`. Additive columns per migration (`respiratory_bpm, hrv_sdnn_ms, hrv_rmssd_ms, bp_systolic, bp_diastolic, spo2, sqi, is_validation, reference_bpm, metrics JSONB`). The legacy `stress_index` column may still exist from v2 but is never written or read. Model applies `ADD COLUMN IF NOT EXISTS` on boot; in-memory fallback if Postgres is unreachable.

## Accuracy is a benchmark, NOT a clinical claim
`scripts/bench-rppg.js` reports HR MAE + robustness gates on committed synthetic fixtures. This is a reproducible engineering benchmark — NOT clinical validation. `<0.5 bpm clinically-validated accuracy`, EU MDR / FDA clearance, and true Fitzpatrick I-VI equity validation require the consented diverse dataset + reference devices + clinical study (brief Section 11, out of scope now).

## Deferred / future (brief §11)
Proprietary consented Fitzpatrick I-VI dataset (the real accuracy moat); regulatory-intelligence + validation-protocol agents; clinical clearance path if BP/SpO2 ever move from Experimental to a claimed metric.
