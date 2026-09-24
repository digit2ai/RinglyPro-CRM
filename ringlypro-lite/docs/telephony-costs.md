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

## Twilio (our stack) vs ElevenLabs Agents — re-verified 2026-09-24

The premise this module was built on ("ConversationRelay is about half the price
of ElevenLabs") **was true when it was written and is not true now.** ElevenLabs
Agents was ~$0.15/min; it is $0.08/min today. Recorded here so the comparison is
not re-derived from memory.

| | Our stack (ConversationRelay) | ElevenLabs Agents |
|---|---|---|
| Speech in + out + turn-taking | $0.070 / min (CR, bundled) | included in $0.080 / min |
| PSTN inbound, US local | $0.0085 / min (Twilio) | **NOT included — you bring the carrier** |
| LLM | ~$0.005 / min (Haiku 4.5) | **billed separately**, same ~$0.005 / min |
| **Answered minute** | **≈ $0.084** | **≈ $0.094** (0.08 + LLM 0.005 + carrier ~0.0085) |
| Number rental | ~$1.00 / mo | **NOT included — your carrier's rental** |
| Platform fee | none | plan fee (Creator $22 / Pro $99 / Scale $299) |
| Included minutes | none — every minute is metered | 275 (Creator) · 1,238 (Pro) · 3,738 (Scale) |
| Over concurrency | no such rate | **$0.16 / min** burst, up to 3x the tier's cap |
| Concurrency cap | Twilio account limits | 10 (Creator) · 20 (Pro) · 30 (Scale) |

Source: elevenlabs.io/pricing/agents, read 2026-09-24. Twilio lines are the
verified rate card above.

**What this changes, and what it does not.**

1. **Per minute they are the same.** Choosing between them on price alone is a
   rounding error; choose on control, latency, voice quality and lock-in.
2. **A plan fee is not automatically waste.** Creator at $22/mo includes 275
   minutes — about $0.080/min if you use them all, and infinite $/min if you do
   not. Below roughly 275 min/mo our metered path is cheaper because it has no
   floor; above it the two converge.
3. **Bringing your own Twilio number to ElevenLabs adds our PSTN line back**
   (+$0.0085/min +$1/mo), which makes them slightly more expensive, not less.
4. **The only real saving is still the unbundled path** (§Options, ~$0.03/min).
   That is ~60% below BOTH, and it is the move that matters if volume ever
   justifies owning the media pipeline.
5. **Colombia does not change**: the cost there is the origination minute
   ($0.0377 mobile / $0.0945 local) and the $14/mo DID, which neither vendor's
   agent pricing touches.

**Not verified here:** ElevenLabs' own PSTN coverage and per-minute for
Colombian numbers, and whether their included-minute allotments roll over.


### CORRECTION 2026-09-24 — ELEVENLABS DOES NOT SELL PHONE NUMBERS

The pricing page's line "telephony is included on every plan" means ElevenLabs
adds **no surcharge** for a call being on the phone. It does **not** mean they
provision a number. Verified against their own docs the same day: every number
is **brought by you**, through either

  - the **Twilio native integration** — you import a Twilio number you already
    own (elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration), or
  - a **SIP trunk** from any standards-compliant carrier — Twilio, Telnyx,
    Vonage, RingCentral, Sinch, Infobip, Exotel, Plivo, Bandwidth and others
    (elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking).

Two consequences, and the second one is the important one:

1. **The answered minute is ~$0.094, not $0.085** — ElevenLabs $0.08 + our LLM
   ~$0.005 + the carrier's inbound minute (~$0.0085 on Twilio US), plus that
   carrier's number rental. That is **more expensive than our own stack**
   (~$0.084), not the same and not less.
2. **It does not, on its own, route around our disabled Twilio account.**
   Twilio voice has been off account-wide since 2026-08-07 (error 32005).
   Importing a Twilio number into ElevenLabs still terminates on Twilio voice,
   so it stays dead. Getting a working line means a **different carrier** —
   Telnyx, Plivo, Bandwidth or similar over SIP trunking — which is a carrier
   migration with its own KYC, A2P/SHAKEN registration and per-country pricing,
   none of it verified here.

So "switch to ElevenLabs" is really two decisions: the agent runtime (ElevenLabs
vs ConversationRelay, a wash on price) and the **carrier** (Twilio vs someone
else, which is the part that is actually blocked). Price the carrier before
committing to either.


### CARRIER ALTERNATIVES TO TWILIO — verified 2026-09-24

Twilio voice has been disabled account-wide since 2026-08-07 and the support
ticket is unanswered, so the carrier is now the binding constraint, not the
agent runtime. Prices read from each vendor's own pricing page the same day.

| | US number | Inbound / min | Agent runtime | Platform fee | Contract |
|---|---|---|---|---|---|
| **Twilio** (today, disabled) | $1.15 / mo | $0.0085 | ConversationRelay $0.07 | none | none |
| **Telnyx** | $1.00 / mo | **$0.0032** | **own AI agent $0.05** | **$0** | none |
| **Plivo** | **$0.50 / mo** | $0.0055 | none — bring ElevenLabs | none stated | none stated |

Answered-minute build-ups, US English, same Haiku-class LLM at ~$0.005/min:

| Path | Build-up | $/min | vs the $0.06 target |
|---|---|---|---|
| Twilio + ConversationRelay (today) | 0.07 + 0.0085 + 0.005 | $0.084 | over |
| Plivo SIP + ElevenLabs Agents | 0.0055 + 0.08 + 0.005 | $0.091 | over |
| Telnyx SIP + ElevenLabs Agents | 0.0032 + 0.08 + 0.005 | $0.088 | over |
| **Telnyx carrier + Telnyx AI agent** | 0.0032 + 0.05 + ~0.005 | **≈ $0.058** | **UNDER — first path that meets it** |

Telnyx bundles STT (Deepgram or their own), TTS and the agent runtime in the
$0.05 and bills the LLM separately, either on their own GPUs (~$0.006/min) or
pass-through to Anthropic. Their own published estimate for a production agent
is ~$0.06/min all-in, which matches the build-up above.

**Read this before treating Telnyx as decided.** None of it is a reason not to,
but each is real work and none of it is verified here:

1. **A2P / SHAKEN starts again on a new carrier.** The attestation and the 10DLC
   registration live with whoever originates the call. Moving carriers means
   redoing brand + campaign registration, which is the multi-week step — the same
   cost as opening a fresh Twilio account, so it is not avoided by staying.
2. **Porting the existing numbers is days, not minutes**, and a port cannot be
   started from an account whose voice is suspended without Twilio's cooperation
   — the very thing currently unanswered. Assume new numbers for the pilot and
   port later.
3. **Colombia keeps its blocker.** §Colombia already records that Telnyx has an
   equivalent in-country address/KYC gate; changing carrier does not remove it.
4. **SMS is a separate question.** The 32005 suspension hit voice; Lite's toll-free
   SMS sender has not been re-verified since. Decide deliberately whether SMS
   follows voice to the new carrier or stays on Twilio, rather than discovering it.
5. **Quality is unmeasured.** Latency, interruption handling and Spanish voice
   quality of the Telnyx agent have not been heard. One real call decides more
   than this table does.
6. **Telnyx pricing above is list, pay-as-you-go.** The $500/mo committed tier
   discounts further and is irrelevant at pilot volume.

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
