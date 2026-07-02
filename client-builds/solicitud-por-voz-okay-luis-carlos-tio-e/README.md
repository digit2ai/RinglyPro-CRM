# Solicitud por Voz — rPPG Vital-Signs Capture

Browser-based rPPG heart-rate (BPM) demo. Camera → client-side estimate → persisted reading → history list. Spanish-first (`?lang=en` toggles). Auto-mounted by `src/app.js` at `/solicitud-por-voz-okay-luis-carlos-tio-e`.

**VIDEO NEVER LEAVES THE BROWSER.** rPPG (mean green-channel intensity of a forehead/cheek ROI → detrend → band-limited spectral search 0.7–4 Hz → dominant peak = BPM) runs entirely client-side in `public/rppg.js`. Only the computed integer BPM + confidence + duration + timestamp are POSTed. No raw video, no biometric signal, no PII (name/email/phone) is transmitted or stored.

## Runbook

```bash
# SIT (in-process, ephemeral port, mints its own JWT) — exits 0 on pass
node client-builds/solicitud-por-voz-okay-luis-carlos-tio-e/sit.js
```

Live once deployed:
- UI: `https://aiagent.ringlypro.com/solicitud-por-voz-okay-luis-carlos-tio-e/` (append `?token=<JWT>` so saving works, `?lang=en` for English)
- History: `.../dashboard?token=<JWT>`
- Disclaimer: `.../disclaimer`
- Health: `.../health`

## Endpoints
- `GET /health` — public JSON `{status,service,version}`
- `GET /` — camera capture UI (ES default, `?lang=en`)
- `GET /dashboard` — reading history table (needs `?token=`)
- `GET /disclaimer` — non-medical wellness disclaimer
- `POST /api/v1/readings` — JWT + tenant; body `{bpm:30..220, confidence?, duration_s?, source?}` → 201 (401 no JWT, 400 invalid bpm)
- `GET /api/v1/readings` — JWT; tenant-scoped list

## Persistence
Sequelize on `CRM_DATABASE_URL || DATABASE_URL`, table `solicitud_por_voz_okay_luis_carlos_tio_e_readings` (SERIAL id, tenant_id + index, bpm, confidence, duration_s, source, created_at). The model `sync({alter:false})`s on boot; canonical schema in `migrations/001_readings.sql`. If Postgres is unreachable the store falls back to an in-memory array (same interface) so the demo never hard-fails.

## Compliance
Non-medical wellness demo, not a diagnostic device (stated inline on the result card and at `/disclaimer`). rPPG accuracy varies with lighting, movement, and skin tone. For a Latin American audience, stored health data is governed by Ley 1581 de 2012 (Colombia) / LFPDPPP (Mexico).

## TODO / deferred (per sprint brief)
- Blood pressure / arterial pressure (no validated consumer-camera rPPG method)
- Voice agent (no telephony provider/script defined)
- Respiratory rate, HRV
- Accuracy validation vs medical-grade reference devices
- The client rPPG math is a best-effort estimate; the "Simular medición" button submits a plausible reading so the persist-and-list slice ships even if the signal path is flaky on a given device.
