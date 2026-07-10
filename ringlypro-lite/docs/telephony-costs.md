# RinglyPro Lite — Telephony Cost Engineering

Verified provider pricing (accessed 2026-07-10, USD). This document exists to
answer the brief's hard constraint: **target COGS under $0.06 per answered
minute, under ~$3/mo fixed per tenant (DID).** Where the chosen v1 path exceeds
target, it is flagged with options — never silently swapped.

---

## TL;DR (the honest finding)

- **The v1 pipeline reuses full RinglyPro's ConversationRelay stack** (Twilio
  ConversationRelay + Claude Haiku 4.5 + Amazon Polly). No ElevenLabs. This is
  the fastest, lowest-engineering path and shares the tenant-15 voice system.
- **ConversationRelay is $0.07/min all-in for STT+TTS+turn-taking.** That single
  line **already exceeds the $0.06/min COGS target** before the PSTN minute.
  - US English answered minute ≈ **$0.084/min** (CR $0.07 + inbound $0.0085 + Haiku ~$0.005).
  - Colombia Spanish answered minute ≈ **$0.113–0.170/min** (CR $0.07 + CO inbound $0.0377 mobile / $0.0945 local + Haiku).
- **Decision:** ship v1 on ConversationRelay to validate the product, and
  instrument real per-minute COGS (`/internal/economics`). The path to
  under-target is **unbundling** (documented below), gated behind product
  traction — exactly the procedural→luma style upgrade path used elsewhere in
  the ecosystem. Do not swap providers before there's call volume to justify the
  media-pipeline engineering.
- **Colombia has a hard regulatory blocker** (in-country address bundle) — see
  §Colombia. Flagged per the brief; `provision-number` gates CO behind
  `LITE_CO_NUMBERS_ENABLED=1`.

---

## Verified rate card

| Line item | Price | Source |
|---|---|---|
| Twilio ConversationRelay (STT+TTS+turn-taking, **bundled**) | **$0.07 / min** | twilio.com/en-us/products/conversational-ai/pricing |
| Twilio inbound voice — US local number | $0.0085 / min | twilio.com/en-us/voice/pricing/us |
| Twilio US local number rental | ~$1.00 / mo | twilio.com/en-us/pricing |
| Twilio inbound voice — CO **local** number | $0.0945 / min | twilio.com/en-us/voice/pricing/co |
| Twilio inbound voice — CO **mobile** number | $0.0377 / min | twilio.com/en-us/voice/pricing/co |
| Twilio CO local number rental | **$14.00 / mo** | twilio.com/en-us/voice/pricing/co |
| Amazon Polly Neural | $16.00 / 1M chars | aws.amazon.com/polly/pricing |
| Amazon Polly Generative | $30.00 / 1M chars | aws.amazon.com/polly/pricing |
| Deepgram Nova-3 streaming STT | $0.0077 / min | deepgram.com/pricing |
| Deepgram Nova-3 multilingual | ~$0.0058 / min | deepgram.com/pricing |
| Google STT v2 streaming | $0.016 / min | cloud.google.com/speech-to-text/pricing |
| Claude Haiku 4.5 input / output | $1.00 / $5.00 per 1M tok | anthropic.com/claude/haiku |

Within ConversationRelay, **Polly and Google/Deepgram are already included** in
the $0.07 — you do not pay them as separate line items on that path. They only
become separate (and cheaper) if you unbundle with Media Streams.

## Voice IDs (Polly) for ConversationRelay

- **EN default:** `Joanna-Neural` (`LITE_POLLY_VOICE_EN`).
- **ES default:** `Lupe-Neural` (`LITE_POLLY_VOICE_ES`) — es-US, the most neutral
  pan-Latin-American Polly voice. **There is no dedicated es-CO Polly voice**;
  `Lupe` (es-US) reads more neutral than `Mia` (es-MX) for Colombian callers.
- Transcription language is set per call: `en-US`, `es-CO` (Colombia), or `es-US`.

---

## Per-minute COGS build-up vs $0.06 target

### (a) US English call
| Path | Build-up | $/min | vs $0.06 |
|---|---|---|---|
| **v1 ConversationRelay** | $0.07 CR + $0.0085 inbound + ~$0.005 Haiku | **≈ $0.084** | OVER (1.4×) |
| Unbundled (Media Streams + Deepgram + Polly Neural) | inbound $0.0085 + Deepgram $0.0058 + Polly ~$0.010 + Haiku $0.005 + Media Streams transport* | **≈ $0.030–0.035** | UNDER |

### (b) Colombia Spanish call
| Path | Build-up | $/min | vs $0.06 |
|---|---|---|---|
| **v1 CR + CO local DID** | $0.07 CR + $0.0945 inbound + Haiku | **≈ $0.170** | OVER (2.8×) |
| v1 CR + CO mobile origination | $0.07 CR + $0.0377 + Haiku | **≈ $0.113** | OVER (1.9×) |
| Unbundled + cheaper origination (Telnyx/mobile) | origination + Deepgram multilingual $0.0058 + Polly Lupe ~$0.010 + Haiku + transport* | **≈ $0.030–0.050** | ~AT/UNDER |

\* Twilio Media Streams transport fee not yet metered — add before treating the
unbundled figure as final.

The live `/internal/economics/tenant/:id` endpoint reports **both** the actual
ConversationRelay COGS and the projected unbundled COGS per tenant, so the gap
to target is always visible for pricing decisions.

---

## Options to reach under $0.06 (do NOT auto-apply — traction-gated)

1. **Unbundle the media loop.** Replace `<Connect><ConversationRelay>` with
   `<Connect><Stream>` (Twilio Media Streams) and run STT (Deepgram Nova-3) +
   TTS (Polly Neural `Lupe`/`Joanna`) yourself, keeping the Claude Haiku brain
   unchanged. Lands US ≈ $0.03/min. Cost: you own the media pipeline + latency
   tuning. This is the recommended step once call volume justifies it.
2. **Colombia origination swap.** CO local DID inbound ($0.0945/min) is the
   single biggest cost. Options: (a) accept a CO **mobile**-terminated number
   ($0.0377/min) if regulatory allows, (b) add a **Telnyx** provider (the
   `TelephonyProvider` abstraction already supports this — drop in
   `telnyxProvider.js`, set `LITE_TELEPHONY_PROVIDER=telnyx`). Telnyx CO monthly
   + per-minute are very likely far below Twilio's $14/mo + $0.0945/min but were
   **not price-confirmed** — verify in Telnyx Mission Control before switching.
3. **Cap call length.** The agent prompt caps turns and targets < 90s. A 60–90s
   message call at $0.084/min = $0.08–0.13/call — a few cents. At low volume the
   per-*call* cost matters more than per-minute; the DID rental dominates.

---

## Colombia regulatory blocker (FLAGGED)

Provisioning a **Twilio Colombia local number requires a Regulatory Bundle with
an in-country Colombian address** (individual: gov ID + local-address proof;
business: business registration + local-address proof). **A PO Box is not
accepted.** Bundle review ~2 business days. **Telnyx has an equivalent
in-country address/KYC gate** — switching providers does not remove it.

Consequences wired into the build:
- `POST /api/onboarding/provision-number` **gates CO** behind
  `LITE_CO_NUMBERS_ENABLED=1`, returning a clear message until the bundle is done.
- Never assign a US DID to a CO tenant (the onboarding guard forces DID country =
  tenant country) — a US DID would bill the forwarded leg internationally to the
  caller's mobile plan.
- CO cost warning shown in onboarding + settings UI: the forwarded leg bills to
  the client's mobile plan; a Colombian local DID keeps it domestic.

**Action item before CO launch:** obtain a verifiable Colombian business address
+ registration doc, submit the Twilio (or Telnyx) regulatory bundle, then set
`LITE_CO_NUMBERS_ENABLED=1`. Until then, CO onboarding stops at the number step.

---

## Fixed cost per tenant (DID rental) vs ~$3/mo target

- **US:** ~$1.00/mo — **under target.**
- **Colombia (Twilio local):** **$14.00/mo — 4.7× over the $3 target.** This is a
  second reason to evaluate Telnyx for CO (option 2). CO mobile numbers, if
  usable, may also carry a different rental. Flag CO fixed cost in pricing.

---

## Unconfirmed numbers to verify before finalizing pricing

1. Telnyx Colombia monthly rental + inbound per-minute (Telnyx global SIP price sheet / Mission Control).
2. Twilio Media Streams transport fee (for the unbundled path).
3. Claude Haiku per-minute is an engineering estimate (~3–4K in + ~200 out tok/min, no caching ⇒ ~$0.005/min; prompt caching → ~$0.002). Metered per call via `lite_calls.llm_input_tokens/llm_output_tokens`.
