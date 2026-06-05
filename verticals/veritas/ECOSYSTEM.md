# Veritas — AI Deepfake Detection & Takedown (Digit2AI Vertical)

> **Status:** PHASE 0 SHIPPED + Phase 2 scaffolding live (stub engine, no external keys yet).
> Built by the RinglyPro AI Architect via a self-paced `/loop`.
> **Mount point:** `/veritas` (custom domain candidate: `veritas.app` or `veritas.digit2ai.com`)
> **Live:** dashboard `/veritas/` · landing `/veritas-landing.html` · health `/veritas/health`

## Shipped so far

**Phase 0 (live):** self-contained Express sub-app mounted at `/veritas`; `df_` schema
(tenants, monitors, assets, detections, takedowns, usage) via Sequelize + SQL migration;
provider-agnostic detection engine (`services/detection.js`, deterministic stub);
REST API `/api/v1/{monitors,detections,takedowns,scan}` + `/health`; static dashboard
(stat cards, detections feed, takedown tracker with status-advance, live scan box);
bilingual EN/ES landing page; idempotent seeder (3 monitors / 7 detections / 5 takedowns).

**Phase 2 scaffolding (live, stubbed):**
- `services/takedown-templates.js` — DMCA / impersonation / trademark letter generators;
  `GET /api/v1/takedowns/:id/letter` returns the draft + a `mailto:` magic link
  (Apple-Mail pattern, no auto-send). Dashboard "Letter" button opens a review modal.
- `services/adscan.js` — monitor → candidate-fetch → detect → persist pipeline.
  Candidate fetch is STUBBED (synthetic) until `META_AD_LIBRARY_TOKEN` is set, then
  `fetchCandidates()` swaps to the real Meta Ad Library API with no pipeline change.
  `POST /api/v1/monitors/:id/scan` runs it; dashboard "Scan now" button triggers it.

**Still gated on external accounts/keys (see §8):** real detection provider, Meta Ad
Library token, AWS Rekognition (likeness), legal-reviewed templates, convai agents.

---

> _Original plan below (kept for reference)._
> **Mount point:** `/veritas` (custom domain candidate: `veritas.app` or `veritas.digit2ai.com`)
> **Pattern reference:** mirrors `verticals/intuitive` and `verticals/cw_carriers` (self-contained Express sub-app mounted in `src/app.js`).
> **Competitive reference:** revelum.ai (deepfake detection + takedown; 20M ads/mo, 99.8% accuracy, <24h takedown claims).

---

## 1. Positioning

**One-liner:** AI-native platform that detects and removes deepfakes at scale — protecting brands, executives, and individuals from impersonation fraud.

**Three product wedges (same as the proven Revelum shape):**
1. **Ad Fraud Protection** — scan ad networks (Meta Ad Library first) for fraudulent ads using a client's brand/likeness.
2. **Likeness / Reputation Monitoring** — continuous scan of social platforms for a protected person's face/voice.
3. **Live Meeting Verification** (Phase 3) — real-time participant verification in Zoom/Teams.

**Digit2AI differentiators (what we add that Revelum lacks):**
- Bilingual EN/ES by default (LATAM ad-fraud is a huge, underserved surface — FB/IG scam ads).
- An **Ana/Lina-style ElevenLabs convai "protection analyst"** the client can talk to about detections.
- The AI Business Analyst + magic-link dashboard pattern already standardized across the CRM.

---

## 2. Architecture (follows existing vertical recipe)

```
verticals/veritas/
  ECOSYSTEM.md                 <- this file
  src/
    index.js                   <- exports the Express sub-app (mounted at /veritas)
    routes/
      detections.js            <- list/inspect detections, score, evidence
      monitors.js              <- create/manage continuous monitors (brand, person, keyword)
      takedowns.js             <- file + track takedown requests
      scan.js                  <- on-demand single-asset scan ("Who should we check?")
      webhooks.js              <- inbound results from detection provider + ad-platform pulls
      admin.js                 <- enterprise admin console (tenants, seats, usage)
    services/
      detection.js             <- ABSTRACTION over 3rd-party detection APIs (provider-agnostic)
      adscan.js                <- Meta Ad Library ingestion + scheduled scans
      likeness.js              <- reverse face/voice search orchestration
      takedown.js              <- DMCA / platform-impersonation report generation + submission
      scoring.js               <- normalize provider scores -> single 0-100 confidence
    models/
      Asset.js                 <- df_assets
      Detection.js             <- df_detections
      Monitor.js               <- df_monitors
      Takedown.js              <- df_takedowns
      Tenant.js                <- df_tenants (or reuse CRM tenants)
    utils/
    config/
      providers.js             <- which detection provider is active, keys via env
  migrations/
    20260605_veritas_tables.sql
  dashboard/                   <- React (Vite) or static, served at /veritas/
public/veritas-landing.html    <- marketing landing (defensores-style)
```

**Mounting** (in `src/app.js`, copy the `/intuitive` block ~line 1285):
```js
let veritasApp = null, veritasError = null;
try {
  veritasApp = require('../verticals/veritas/src/index');
  app.get('/veritas', (req, res, next) => {
    if (!req.originalUrl.endsWith('/')) return res.redirect('/veritas/');
    next();
  });
  app.use('/veritas', veritasApp);
  console.log('🛡️ Veritas Deepfake Protection mounted at /veritas');
} catch (error) {
  veritasError = error;
  console.log('⚠️ Veritas not available:', error.message);
}
```

**API base:** `/veritas/api/v1/*` · **Health:** `/veritas/health` · **Dashboard:** `/veritas/`

---

## 3. Data model (shared Render Postgres, `df_` prefix)

- **df_tenants** — `id, name, plan, seats, created_at` (or FK to existing CRM tenant).
- **df_monitors** — `id, tenant_id, type (brand|person|keyword), target_label, query_terms jsonb, platforms text[], status, cadence, created_at`. A "what to watch" subscription.
- **df_assets** — `id, monitor_id, source_platform, source_url, media_type (image|video|audio), thumbnail_url, captured_at, raw_meta jsonb`. Each scanned item.
- **df_detections** — `id, asset_id, provider, provider_score numeric, confidence int (0-100), verdict (clean|suspect|deepfake), targeted_person, deepfakes_impact text, evidence jsonb, created_at`.
- **df_takedowns** — `id, detection_id, platform, method (dmca|impersonation|trademark), status (draft|submitted|acknowledged|removed|rejected), submitted_at, removed_at, reference_id, notes`.
- **df_usage** — `id, tenant_id, month, scans_count, takedowns_count` (billing/usage caps).

Indexes: `idx_df_detections_verdict`, `idx_df_assets_monitor`, partial index on `df_takedowns.status` for active queue.

---

## 4. Detection engine — BUY, don't build

"99.8% accuracy, trained on millions of synthetic samples" is a real ML problem. **Do not train from scratch.** Wrap providers behind `services/detection.js` so we stay provider-agnostic and can A/B.

| Provider | Modalities | Notes |
|---|---|---|
| **Hive AI** (Moderation/Deepfake) | image, video, AI-gen | Mature API, per-call pricing, good first integration |
| **Reality Defender** | image, video, audio, text | Deepfake-specialized, enterprise |
| **Sensity AI** | image, video, audio | Deepfake-specialized, EU |
| **AWS Rekognition** | face match/search | For likeness matching, NOT deepfake verdict |

`detection.js` contract:
```js
detect({ mediaUrl, mediaType }) -> { provider, rawScore, confidence(0-100), verdict, evidence }
```
Active provider chosen via `config/providers.js` + env. `scoring.js` normalizes each provider's raw output to one 0–100 confidence + verdict thresholds.

---

## 5. Monitoring / scanning surfaces (legal-safe first)

- **Meta Ad Library API** (FB/IG) — the realistic, *sanctioned* ad-scanning surface. Scheduled pulls by brand/keyword → `df_assets` → run through `detection.js`. This is the "20M ads scanned" engine, built on the existing **Render cron** pattern (see CMS refresh cron in CLAUDE.md).
- **Likeness search** — AWS Rekognition face collection per protected person; match incoming assets. Flag the **privacy/legal sensitivity** (consent, biometric law — BIPA/GDPR). Scope carefully.
- **TikTok / YouTube** — via their official APIs, Phase 2.
- **Live Zoom verification** — separate Zoom Marketplace app + real-time stream analysis. **Phase 3, defer.** High effort.

---

## 6. Takedown pipeline (workflow + legal, not AI)

- Templated reports per platform: **DMCA**, **impersonation**, **trademark**.
- `takedown.js` generates the filing from a detection's evidence, submits via platform abuse API/form (or magic-link/mailto for human-in-the-loop, matching the project's `EMAIL_AUTOSEND_DISABLED` Apple-Mail pattern).
- Status tracking Submitted → Acknowledged → Removed in `df_takedowns`. Pure CRM, easy.
- **Requires legal-reviewed templates** — a dependency, not a code task.

---

## 7. Phased build plan

**Phase 0 — Scaffold + demo (1–2 days, fully in-house)**
- Vertical sub-app + mount + `/veritas/health`.
- Migration + models.
- `veritas-landing.html` (defensores/intuitive-grade, EN/ES, Elon-scam-style hero demo).
- Dashboard with **sample/seeded** detections + takedown tracker.
- *Outcome: a credible, demoable product for sales — zero external dependencies.*

**Phase 1 — Real detection (3–5 days, gated on 1 API key)**
- Integrate one provider (Hive recommended) behind `detection.js`.
- On-demand single-asset scan ("Who should we check?" → URL/upload → verdict).
- Real `df_detections` from live scans.

**Phase 2 — Continuous monitoring + takedowns (1 week)**
- Meta Ad Library ingestion + Render cron scans.
- Likeness matching (Rekognition) with consent gating.
- DMCA/impersonation takedown templates + tracking.
- ElevenLabs convai "protection analyst" agent (dedicated agent ID per the `reference_elevenlabs_agents` rule — never shared).

**Phase 3 — Enterprise + live meetings (multi-week, funded)**
- Admin console, seats, usage billing.
- Zoom/Teams live verification.

---

## 8. Dependencies / what's needed from the owner (the real blockers)

These are **accounts/keys/legal**, not code:
1. **Detection API account** — Hive AI or Reality Defender (has a per-scan cost).
2. **Meta Ad Library API access** — app review for the ad-scanning surface.
3. **AWS account** (Phase 2) — Rekognition for likeness.
4. **Legal templates** — DMCA / impersonation report language, + a privacy stance for biometric/likeness data (BIPA/GDPR).
5. **Brand name decision** — confirm "Veritas" + domain (`veritas.app`?).
6. **ElevenLabs convai agents** — one EN + one ES (Phase 2), per project convention.

---

## 9. Environment variables (to add when Phase 1 starts)

- `VERITAS_DETECTION_PROVIDER` — `hive` | `reality_defender` | `sensity` (default `hive`)
- `HIVE_API_KEY` / `REALITY_DEFENDER_API_KEY` — provider key
- `META_AD_LIBRARY_TOKEN` — Meta Graph API token for ad scanning
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — Rekognition (Phase 2)
- `VERITAS_AUTH_USER` / `VERITAS_AUTH_PASS` — Basic-auth gate on the dashboard (mirror SurgicalMind gate)
- `ELEVENLABS_CONVAI_VERITAS_EN` / `_ES` — convai analyst agent IDs (Phase 2)

---

## 10. Cost model (rough)

- Detection: ~$0.01–0.10 per asset scanned (provider-dependent). Cache aggressively; only re-scan changed assets.
- Convai analyst: ~$0.15–0.40 per 3–5 min session (same as Partnership orb).
- Render/Postgres: marginal (shared infra).
- Pricing to client: per-seat + per-takedown, enterprise tiers — Revelum's "book a demo" funnel.

---

## Decision gates before writing code

1. Confirm **Phase 0 scaffold + demo** is the first deliverable (recommended).
2. Confirm **detection provider** (Hive vs Reality Defender) for Phase 1.
3. Confirm **brand/domain** (Veritas / veritas.app).
4. Owner secures the Phase-1 API key.
