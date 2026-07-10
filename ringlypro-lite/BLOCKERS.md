# RinglyPro Lite — Open Blockers & Go-Live Checklist

Do not lose these. Two are documented in detail below; the go-live steps show
what stands between the committed code and a testable live URL.

---

## BLOCKER 1 — Colombia local-DID regulatory gate (HARD)

**Twilio AND Telnyx require a verified in-country Colombian address bundle
(no PO Box) to provision a Colombia local DID.** CO local number rental is
**$14/mo — over the $3/mo/tenant target** (4.7×). CO local inbound is also
$0.0945/min. Switching Twilio→Telnyx lowers price but does **not** remove the
address/KYC gate.

- **Wired now:** `POST /api/onboarding/provision-number` gates Colombia behind
  `LITE_CO_NUMBERS_ENABLED=1` and returns a clear "complete the regulatory
  bundle" message until then. A **US DID is never assigned to a CO tenant**
  (onboarding forces DID country = tenant country).
- **To unblock:** obtain a verifiable Colombian business address + registration
  doc → submit the Twilio (or Telnyx) regulatory bundle (~2 business days) →
  set `LITE_CO_NUMBERS_ENABLED=1`.
- **Also evaluate:** Telnyx for CO (cheaper rental + per-minute; drop in
  `src/telephony/telnyxProvider.js`, set `LITE_TELEPHONY_PROVIDER=telnyx`) — the
  `TelephonyProvider` interface already supports the swap with no caller changes.
- Detail + verified rate card: [`docs/telephony-costs.md`](docs/telephony-costs.md).

**Status:** OPEN. US launch is unaffected; CO onboarding stops at the number step.

---

## BLOCKER 2 — ConversationRelay exceeds the $0.06/min COGS target (ACCEPTED for v1)

Twilio ConversationRelay is **$0.07/min all-in (STT+TTS+turn-taking)** — that
single line already exceeds the $0.06/min target before the PSTN minute.

- Measured (10-call batch, `npm run cogs`): **US ~$0.093/min v1**, Colombia
  ~$0.24/min v1.
- **Decision:** accept for **v1 validation** (fastest path, reuses the
  tenant-15 voice pipeline, no ElevenLabs). Do not swap providers before there
  is call volume to justify the media-pipeline engineering.
- **Path to under-target (traction-gated, NOT auto-applied):**
  - **US:** unbundle `<Connect><ConversationRelay>` → `<Connect><Stream>`
    (Media Streams) + **Deepgram Nova-3** STT + **Polly Neural** TTS, keeping the
    Claude Haiku brain unchanged → **~$0.047/min, under target.**
  - **Colombia:** needs BOTH (a) cheaper **origination** (Telnyx / mobile-
    terminated number instead of Twilio CO-local $0.0945/min) AND (b) **SMS →
    WhatsApp** for owner/caller notifications (CO SMS is ~$0.06/segment and
    dominates booking-call cost).
- Detail: [`docs/telephony-costs.md`](docs/telephony-costs.md) §Options.

**Status:** ACCEPTED for v1. Revisit when call volume justifies unbundling.

---

## GO-LIVE CHECKLIST (what makes a live URL exist)

There is **no live URL yet** — Lite is a separate service, not part of
aiagent.ringlypro.com. To get one:

1. **Create a new Render web service** pointed at this repo, `rootDir:
   ringlypro-lite` (config in `render.yaml`). Suggested URL:
   **`https://ringlypro-lite.onrender.com`** (or a custom domain / GHL subdomain).
2. **Provision a separate Postgres DB** → set `LITE_DATABASE_URL` (must NOT be
   the CRM database). Tables auto-create on boot.
3. **Create a Lite Twilio subaccount** → set `LITE_TWILIO_ACCOUNT_SID` /
   `LITE_TWILIO_AUTH_TOKEN`. Set `LITE_ANTHROPIC_API_KEY`.
4. Set `LITE_WEBHOOK_BASE_URL` to the Render URL (drives the `wss://` + webhooks).
5. **Stripe:** set `LITE_STRIPE_SECRET_KEY`, `LITE_STRIPE_WEBHOOK_SECRET`, and a
   flat price per country. Point the Stripe webhook at `{URL}/webhooks/stripe`.
6. Buy a US Lite DID via `/api/onboarding/provision-number`; point its Twilio
   Voice webhook at `POST {URL}/voice/incoming`.
7. Then testable: `{URL}/health`, `{URL}/signup`, `{URL}/dashboard`, and a real
   forwarded call to the DID.

Until steps 1–3 are done, testing is limited to the local sims
(`npm run check | sim | cogs`) — which pass.
