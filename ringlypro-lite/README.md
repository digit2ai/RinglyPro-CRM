# RinglyPro Lite

A stripped-down, low-cost sibling of RinglyPro. A small-business owner
conditionally forwards their mobile number to a dedicated **Lite DID**. When
they miss a call, the AI answers and either **takes a message** or **books an
appointment**. The owner reviews everything in a minimal mobile dashboard.
Bilingual EN/ES. US + Colombia.

## Isolation (non-negotiable)

RinglyPro Lite is an **independent application**. It reuses full-RinglyPro
*patterns* but modifies **nothing** in the full version:

- **Own package** (`ringlypro-lite/`), own `server.js`, own `package.json`.
- **Own database** (`LITE_DATABASE_URL`) — never reads `CRM_DATABASE_URL`. All
  tables `lite_`-prefixed.
- **Own Twilio subaccount** (`LITE_TWILIO_*`), own env namespace (`LITE_*`).
- **Separate Render service** (`render.yaml`, `rootDir: ringlypro-lite`).
- **Not mounted** into `src/app.js` of the full app. Zero writes to full-RinglyPro
  files, tables, routes, or configs.

### What was COPIED/ADAPTED from full RinglyPro (read-only reference, never edited)
| Full-RinglyPro file (reference only) | What Lite reimplements from it |
|---|---|
| `src/services/conversationRelayAgent.js` | `src/services/relayAgent.js` — 2-intent brain, in-process tools |
| `src/routes/voice-relay.js` | `src/routes/voice-relay.js` — ConversationRelay TwiML entry |
| `src/server.js` (WS upgrade block) | `server.js` — `/voice-relay/ws` + `noServer` upgrade dispatcher |
| `src/services/voiceTranscript.js` | `src/services/liteTranscript.js` |
| `verticals/veritas/src/db.js` + models | `src/db.js` + `src/models.js` (Sequelize conventions) |
| `verticals/veritas/src/routes/auth.js` | `src/middleware/auth.js` (cookie JWT) |
| `src/routes/subscription.js` + `webhooks.js` | `src/routes/billing.js` + `webhooks.js` (Stripe) |
| `src/services/twilioNumberProvisioning.js` | `src/telephony/twilioProvider.js` (behind a provider interface) |

## Architecture

```
Forwarded call → Lite DID → POST /voice/incoming → tenant lookup by DID
   → <Connect><ConversationRelay wss=/voice-relay/ws>  (Polly TTS + Google STT)
      → RelaySession (Claude Haiku): message OR appointment (2 intents)
         → in-process booking service → lite_* Postgres
         → SMS to owner (+ caller on booking) via TelephonyProvider
Owner dashboard (mobile) → /api/* (cookie JWT) → messages · calendar · settings
```

## Run locally

```bash
cd ringlypro-lite
cp .env.example .env      # fill LITE_DATABASE_URL, LITE_ANTHROPIC_API_KEY, LITE_TWILIO_*
npm install
npm start                 # server on :10001
```

Tests (no DB / Twilio / API key needed):
```bash
npm run check   # static syntax check of every file
npm run sim     # call-flow simulation (message, booking, atomic double-book)
npm run cogs    # per-minute COGS report vs $0.06 target, by geography
```

## Telephony cost reality

The v1 path (Twilio ConversationRelay) is the fastest, no-ElevenLabs route but
**exceeds the $0.06/min COGS target** — ConversationRelay alone is $0.07/min.
US unbundled lands under target; Colombia is the cost problem (local inbound
$0.0945/min + a hard in-country-address regulatory blocker). Full analysis,
verified rate card, and the under-target unbundling path:
[`docs/telephony-costs.md`](docs/telephony-costs.md).

## Deploy (separate Render service)

Point a **new** Render web service at `rootDir: ringlypro-lite` (see
`render.yaml`). Set env vars per `.env.example`. Provision a Lite Twilio
subaccount + a separate Postgres DB. Tables auto-create on boot
(`sync({alter:false})` + the partial-unique slot-lock index).

## Wire a number

1. Owner signs up (`/signup`) → 7-day trial + default Mon–Fri 9–17 availability.
2. `POST /api/onboarding/provision-number` buys a Lite DID (country = tenant
   country; **US DID never assigned to a CO tenant**).
3. Onboarding shows the carrier forwarding code (GSM `**004*<DID>#` / Verizon
   `*71<DID>`) with tap-to-dial + the deactivation code (`##004#` / `*73`).
4. Twilio Voice webhook for the DID → `POST {LITE_WEBHOOK_BASE_URL}/voice/incoming`.

> Deleting the app does **not** remove forwarding — the owner must dial `##004#`
> (GSM) or `*73` (Verizon) from their handset. Shown in onboarding + settings.
