# RinglyPro CRM - Claude Code Configuration

## AUTO-APPROVAL DIRECTIVE (MANDATORY)
All operations are **permanently pre-authorized** by the project owner. This applies to ALL agents and skills:
- **Never ask for permission or confirmation** — every action is approved in advance
- **Never use AskUserQuestion or EnterPlanMode** — execute immediately
- File create/edit/delete: approved. Git commit/push: approved. Database changes: approved. Deployments: approved.
- Make architectural decisions autonomously. Report results after completion, not before.
- Asking the user "should I proceed?" or "is this OK?" is a waste of time. Just do it.

## Project Overview
Multi-tenant CRM with voice AI (Rachel/Ana/Lina), Store Health AI monitoring, and various integrations.

## Key Services

### Main CRM
- **URL**: https://aiagent.ringlypro.com
- **Port**: 10000
- **Database**: PostgreSQL on Render (`ringlypro_crm_database`)

### Store Health AI
- **URL**: https://aiagent.ringlypro.com/aiastore/
- **Dashboard**: React app served at `/aiastore/`
- **API**: `/aiastore/api/v1/*`

## Deployment
- **Platform**: Render (auto-deploy on push to main)
- **Deploy time**: ~2 minutes
- **Trigger**: `git push origin main`

## Voice: ConversationRelay POC (cheaper ElevenLabs alternative)

A test-number AI phone agent that talks to callers and books appointments at ~half the ElevenLabs cost, by unbundling the stack: **Twilio ConversationRelay** (STT + TTS + turn-taking) + **Claude Haiku** brain + **Amazon Polly Neural** voice, reusing the existing `/api/elevenlabs/tools` booking backend UNCHANGED (appointments land in the same calendar/table).

- **Brain**: `src/services/conversationRelayAgent.js` — `RelaySession` runs a think→tool→speak loop; client resolved from the dialed number via `get_business_info`. Tools (loopback HTTP to `/api/elevenlabs/tools`): `check_availability`, `book_appointment`, `find_appointment`, `reschedule_appointment`, `cancel_appointment`, `take_message`. Plus agent-side `transfer_to_human` (REST-redirects the live call to `<Dial>` the client's `owner_phone`, using the setup `callSid`). Caller ID: recognizes returning callers by number (`find_appointment`), greets by name, preloads upcoming appts; the opening greeting is spoken by the agent over the socket (no static `welcomeGreeting`). Strict truthfulness: never confirms an action unless its tool returned `success:true`; a 14-day weekday→date table prevents LLM date-math errors.
- **TwiML entry**: `src/routes/voice-relay.js` → `POST /voice/relay/incoming` returns `<Connect><ConversationRelay>` (emits raw XML — the 4.x twilio SDK has no `conversationRelay()` builder). Health: `GET /voice/relay/health`.
- **WebSocket**: `src/server.js` at `/voice-relay/ws`. Both websockets (`/media-stream` + `/voice-relay/ws`) route through ONE `server.on('upgrade')` dispatcher with `noServer:true` — attaching two `ws.Server` via `{server, path}` makes the first abort (400) the other's path.
- **Transcripts**: every call turn logged to `voice_call_transcripts` via `src/services/voiceTranscript.js` (fire-and-forget). View at `GET /voice/relay/transcripts` + `/voice/relay/transcripts/:callSid` (unauthenticated POC — gate before customer traffic). Caller-ID uses `identify_caller` (name from any past/future appt); `find_appointment` is future-only.
- **Wire a number**: `node scripts/setup-voice-relay-number.js` (lists numbers) / `... <+E164>` (points its Voice webhook at the relay). Never repoints a number you didn't name.

**Environment Variables:**
- `VOICE_RELAY_CLIENT_ID` — fallback RinglyPro client_id when the dialed number doesn't resolve via `get_business_info` (useful when testing from a number not in the `clients` table). Unset = must dial a real RinglyPro number.
- `VOICE_RELAY_POLLY_VOICE` — Amazon Polly voice for ConversationRelay TTS. Default `Joanna-Neural`.
- `VOICE_RELAY_MODEL` — Anthropic model for the brain. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY` (already set on Render).
- `VOICE_RELAY_TRANSFER_NUMBER` — fallback number `transfer_to_human` dials when the client has no `owner_phone` on file. Unset + no owner_phone = the agent offers to take a message instead.

## Modo Noche — Aplicación de Sueño con Música Personalizada

Self-contained sub-app auto-mounted at `/aplicacion-de-sueno-con-musica-personali` (from `client-builds/aplicacion-de-sueno-con-musica-personali/`). A web bedtime player, 60 tracks in three families: pick a track, set a shutdown timer (default 60 min), tap "Iniciar noche" — the loop plays through an HTML5 `<audio>` element, fades over the final 5 minutes via a Web Audio `GainNode`, and stops on its own at expiry. Spanish default UI, `?lang=en` for English (substituted **server-side**, so the `<h1>` is correct in the delivered HTML). No login, no PII. Installable to the iPhone home screen (PWA).

- **Pages:** `/` player · `/history` (alias `/historial`) session history + favourites.
- **API:** `GET /health` · `GET /api/v1/tracks` (public, 60 tracks with family+category, `?lang=en`) · `GET /api/v1/tracks/meta` (families, categories, frequency + originality disclaimers) · `POST|GET /api/v1/sessions` · `GET /api/v1/sessions/favourites`.
- **THREE FAMILIES (the top-level taxonomy).** `data/tracks.json` carries `families` -> `categories` -> tracks; the API returns `family`/`family_label` + `category`/`category_label` per track, and the player shows a family switch first, then optgroups by category (a flat list of 52 is unusable on a phone). **Family 1 `ondas` = Música de ondas (Wave Music)** = the original 25. **Family 3 `electronica` = Electrónica** = 8 deep-house tracks (clásico/nocturno/orgánico/melódico/lo-fi/soulful/y-lluvia/sin-batería), all `not_for_sleep` except the beatless one. **Family 2 `instrumental` = Música instrumental** = 27: handpan-metal (handpan Kurd, tambor de lengua, gongs, kalimba, dulcimer) · viento-flautas (quena, zampoña, flauta nativa americana, shakuhachi, bansuri alap, silbato irlandés) · cuerdas (guitarra española, arpa celta, cello, guqin, koto) · piano-atmosferico (piano de fieltro, piano lento, ambiente lento) · mundo (gamelan, ney, zanfona, marimba+vibráfono, oud, duduk) · naturaleza-instrumentos (campanas de viento, handpan y lluvia).
- **INSTRUMENTAL IS SYNTHESIZED, NOT SAMPLED.** `tools/lib-instruments.js` = five engines (Karplus-Strong pluck, struck partial stack, blown tube, bowed sustain, piano with string inharmonicity) + a performance renderer whose notes move by a **random walk** over the scale (uniform random sounds like a wind chime, not a melody). Artist names in the brief were a timbre/tempo reference ONLY — **no artist or album name may appear in shipped copy, and SIT fails the build if one does** (whole-word matched, since a substring test flags "eno" inside "menor"). `piano-lento` is "in the manner of the gymnopédies" with an ORIGINAL melody, never a transcription.
- **A PULSE CHANGES THE LOOP.** Deep-house loop length is DERIVED from the tempo (16 bars at the declared BPM), never chosen, so the downbeat after the wrap lands on time. MP3 encoder padding (~25 ms measured) is inaudible under rain but a **stumble in 4/4**, so those tracks carry `gapless:true` and the player `decodeAudioData`s them into an AudioBuffer and loops that (`AudioBufferSourceNode.loop` is sample-exact); pause `ctx.suspend()`s because a buffer source cannot pause; fetch/decode failure falls back to `<audio>`. `tools/verify-tempo.js` proves it from the audio — **do not count kicks** (sub bass shares the 25-120 Hz band and an off-beat bass note is indistinguishable; this caused false failures once). It autocorrelates the onset envelope, requires a distinct peak at beat+bar vs ±8% off-tempo, and runs **4 unsequenced negative controls that must be REJECTED**.
- **ONE LISTENING LEVEL.** Peak normalisation alone left a **17.2 LUFS** spread (a plucked guqin peaks like a flute but averages 16 dB quieter), so `lib-dsp.js` runs a two-pass EBU R128 match to **-19 LUFS** on the RAW PCM before the single MP3 encode (no generation loss), `linear=true` so each track keeps its own dynamics. Now **2.1 LUFS** spread, no clipping — asserted by `tools/verify-loudness.js` in SIT. Regenerating audio without this pass is a regression.
- **Wave family — 25 tracks, 8 categories:** naturaleza (lluvia, selva tropical, viento) · playa y agua (olas del mar = open swell, olas de playa = shore break, cascada con aves) · meditación (cuencos tibetanos, cuenco de cristal y lluvia) · música de la naturaleza (nocturno suave, amazonas) · **ondas cerebrales** (delta 2,5 / theta 5,5 / alfa 10 / beta 16 / gamma 40 Hz) · **frecuencias y propósito** (396 estrés, 174+285 bienestar, 528, 432+639 abundancia, 741 claridad, 852 intuición, 963 paz, enfoque profundo) · respiración (4-7-8) · ruido marrón.
- **THE AUDIO IS OURS — do not swap it for a CDN link.** Every third-party ambient URL evaluated was seconds long, ogg/oga (Safari can't decode), or unclear-licence. Three generators (`tools/generate-audio.js` wave, `tools/generate-instrumental.js` instrumental, `tools/generate-house.js` electronic) share one DSP floor (`tools/lib-dsp.js`) and synthesize all 60 seamless loops into `public/audio/` (38 MB). Royalty-free, same-origin, nothing to 404 at bedtime. ffmpeg is a **build-time** dependency only. Noise loops are seamless via a tail-over-head crossfade; tonal and event tracks wrap exactly by construction (integer cycle counts; bowl strikes, bird calls and wave crashes written **modulo** the buffer).
- **FREQUENCIES ARE Hz, NOT MEGAHERTZ, AND THE COPY MAKES NO CLAIMS.** Brainwave bands: delta 0,5-4 · theta 4-8 · alfa 8-12 · beta 12-30 · gamma 30-100 Hz. Each track is a real **binaural beat** (carrier in one ear, carrier+beat in the other) so all carry `stereo_required`. `tools/verify-binaural.js` decodes every such MP3 and runs a **Goertzel filter per channel** to prove each ear holds the advertised tone — wired into SIT, and skipped LOUDLY (named in the summary) where ffmpeg is absent. Descriptions state what a track IS, never an outcome; `frequency_disclaimer` renders in the UI under any frequency track (not a medical/psychological treatment, no health or financial promise), and `abundancia` explicitly disowns any financial result. Alerting tracks (beta, gamma, 741, enfoque) carry `not_for_sleep`. **SIT fails the build if a curative or guarantee claim appears in any description — keep it that way.**
- **PWA install:** `public/logo-master.svg` is the single source for the mark — **full-bleed square on purpose** (iOS rounds `apple-touch-icon` itself; a pre-rounded source gets double-rounded) with all content inside the central 80% so it doubles as a `maskable` icon. `sips -s format png -Z <n> logo-master.svg --out <file>` produces `apple-touch-icon.png` (180) / `icon-192` / `icon-512` / `favicon-32`; `favicon.svg` is a simplified rounded variant for tabs. `sw.js` caches the shell + audio (cache-first, immutable) and **never** `/api/`; bump `CACHE` when shell files change.
- **The timer ends the night, not the fade.** The fade is cosmetic; the hard stop is the countdown. On iOS `HTMLMediaElement.volume` is read-only so the `GainNode` is the only real fade path — if the AudioContext can't be created it falls back to a linear `element.volume` ramp, and the night still terminates. The player resumes an OS-suspended context on `visibilitychange` and logs via `fetch(keepalive:true)` on `pagehide` so a closed tab still records.
- **Postgres primary, memory safety net.** `models/index.js` connects lazily and never fatally: no `DATABASE_URL` or a failed handshake degrades the session store to an in-memory `Map` behind an identical interface, so `/health` and the whole player stay up (`/health` reports which backend is live). Table `aplicacion_de_sueno_con_musica_personali_sessions`, `tenant_id NOT NULL` + `(tenant_id)` and `(tenant_id, anon_token)` indexes, applied idempotently on boot; canonical DDL in `migrations/001_create_sessions.sql`.
- **Privacy.** Row owner is the client-generated `x-anon-token` UUID (localStorage) — never a name/email/phone. Truncated to 8 chars before any `console.log`. Reads filter on **both** `tenant_id` and `anon_token`, so one device can never see another's history. Writes validate payload shape and 400 on malformed bodies.
- **SIT:** `node -e "require('dotenv').config();require('./client-builds/aplicacion-de-sueno-con-musica-personali/sit.js')"` → **153/153** (150 + 3 skipped without ffmpeg), green on both backends (it awaits the store settle instead of racing it, and deletes its own `sit-token-%` rows afterwards). Zero external keys.

**Environment Variables:**
- `DATABASE_URL` — session store. Unset = in-memory fallback; the player still works end to end.
- `APLICACION_SUENO_TENANT_ID` (default `1`) — tenant stamped on every session row.

## RoundShare — Ride. Improve. Share. (EquiMind community layer)

Self-contained sub-app auto-mounted at `/roundshare` (from `client-builds/roundshare/`). The **community/social layer** of the EquiMind "Jump Coach" ecosystem: riders record a round, get AI feedback, then SHARE it with friends, trainers and barn circles. Same brand DNA as EquiMind (purple identity, horse-jumper mark). Static build — no DB, no new backend.

- **Landing:** `/roundshare/` — EquiMind purple theme, bilingual EN/ES toggle, hero "Share. Get Feedback. Get Better.", **What it is / Why it matters / How it works** cards, feature strip, embedded live phone preview, final CTA. Carries the **Lina voice AI orb** (What/Why/How narration) that **reuses the existing zero-key `/api/tts/edge`** route — voices: Ava (EN, default), Lina/Dalia + Paloma + Salomé (ES). No new TTS backend generated (Layers 1&2 already live per the `voice` runbook).
- **App mockup simulator:** `/roundshare/simulator` (aliases `/roundshare/app`, `?embed=1` for the landing iframe) — an **interactive 40-screen phone simulator** with a working bottom tab bar (Home/Progress/Record/Circles/Profile) and a real **Upload Ride → animated AI Processing (0–100% ring + step checklist) → AI Feedback score (8.1)** flow, plus Strengths/Areas/Homework, Feed, Ride Detail, Comments (live add), Circles, Share (toggles), Notifications, Messages, Rider Profile, Horse Stats, Goals, Achievements, AI Reel, Premium, Parent Dashboard, Search, Settings, and Empty/Offline/Error states. Every button navigates; all screens reachable from the Profile grid.
- **Assets:** `roundshare-icon.svg` (brand mark). Health: `GET /roundshare/health`.
- **No env vars.** Auto-mounts via the client-builds loop (shortname `roundshare`).

## EquiMind 3D Gaussian Splatting Engine + Client Report

Self-contained sub-app auto-mounted at `/equimind-gs-engine` (from `client-builds/equimind-gs-engine/`). Turns a phone video/photos of a horse into a navigable 3D scene, and generates a shareable **state-of-the-art client report** after an analysis. Reuses the EquiMind account/credit system for multi-tenant auth + billing. Data layer: `gs_sessions/gs_jobs/gs_scenes/gs_assets` (tenant-scoped, S3 storage + Render-disk fallback).

- **Report surface:** `/equimind-gs-engine/report?scene=ID[&k=share_token][&lang=en|es]` — hero 3D horse (real gsplat on the `.ply`, canvas-horse fallback) + conformation measurement bars + Neural findings + read-only shareable link. Owner-only studio economics panel hidden on the public `?k=` view. Simulated scenes carry a "generated representation" disclaimer.
- **Report data:** `session.meta.report` (measurements + findings + horse identity), sanitized/capped in `lib/service.js`. Attach via `PATCH /api/v1/sessions/:id/report`, the `gs.report.attach` MCP tool, or seed at `createSession`. Honesty rule: measurements/findings = REAL analysis output; the 3D shape = generated (labeled), never passed off as a scan of the specific animal.
- **Providers** (`lib/provider.js`, swap via `GS_PROCESSING_PROVIDER`): `mock` (default, horse placeholder) · **`procedural`** (the $0 report path — horse-shaped gaussian `.ply` scaled to the measurements, no GPU/API, `is_simulated:true`) · `luma` (real photoreal scan, needs `LUMA_API_KEY`, Enterprise/capture gate — see BLOCKERS.md) · `self_hosted` (COLMAP+gsplat, v2 stub). Upgrading procedural→luma changes NO report/viewer code.
- **SIT:** `node client-builds/equimind-gs-engine/sit.js` → 21/21 (in-memory, no GPU/DB).

**Environment Variables:**
- `GS_PROCESSING_PROVIDER` — `mock` (default) | `procedural` (recommended cheap production path, $0/report) | `luma` | `self_hosted`. `procedural` renders a measurement-scaled horse in-engine with zero GPU cost — use this until the app gets traction, then flip to `luma` for real photoreal scans.
- `LUMA_API_KEY` — activates the real Luma capture provider (video→gaussian). Absent = fall back to mock/procedural. See `client-builds/equimind-gs-engine/BLOCKERS.md`.

## Lawn Co-Pilot — The multi-tenant AI office for landscaping companies

**Purpose:** Digit2AI vertical. A **platform** landscaping companies run on. A landscaper signs up and minutes later has (a) their own page at `lawncopilot.com/<slug>` — their entire web presence, the way `vagaro.com/<salon>` is a salon's — where homeowners get an automatic measured quote, book, pay and log in; and (b) their whole back office staffed by AI. Mounted at `/lawncopilot`. English, emoji-free, Florida first.

**Distribution model — Vagaro, not Squarespace.** Small landscapers do not own domains. **No custom domains, by design** (no DNS, no per-tenant SSL, no domains table). Their Google Business Profile is the front door; our page is what its Website/Book buttons point at. The link travels via a print-resolution QR for the truck, a short link, and OG cards.

**Location:** `verticals/lawncopilot/` — self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`). 52 tables, all `tenant_id`-scoped, `lc_` prefix. Canonical migration `migrations/20260723_lawncopilot_tables.sql` (regenerate: `node verticals/lawncopilot/scripts/gen-migration.js`). New columns via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `index.js` init.

### Two layers

| Layer | URLs |
|---|---|
| **Platform** (Digit2AI) | `/lawncopilot/` pitch · `/lawncopilot/signup` · `/lawncopilot/platform` super-admin · `/lawncopilot/mcp/*` Brain · `/lawncopilot/l/:code` short links · `/lawncopilot/webhooks/*` · `/lawncopilot/voice/*` |
| **Tenant** (one company) | `/lawncopilot/:slug` their page · `/:slug/portal` their customers · `/:slug/admin` their office · `/:slug/api/v1/*` · `/:slug/quote/:token` |

**TENANCY IS THE KEYSTONE.** `src/tenancy.js` resolves the company from the URL slug and **nowhere else** — v1's `LAWNCOPILOT_TENANT_ID` reads are gone from every route, and SIT greps the source and fails if one returns. Reserved slugs, `lc_tenant_aliases` for old slugs, and an unknown slug 404s rather than falling back to another company. Phone resolves the tenant from the **dialed number**; Stripe webhooks from event metadata or the Connect account, parking unattributable payments rather than guessing.

### The AI crew — eight employees, one Brain

| Employee | Replaces | Namespace |
|---|---|---|
| **Receptionist** | Answering service, calls missed after 5pm | `receptionist.*` |
| **Estimator** | The truck roll and the 3-day quote | `estimator.*` |
| **Dispatcher** | The whiteboard and the double-drive | `dispatcher.*` |
| **Bookkeeper** | The bookkeeper and the invoice chase | `bookkeeper.*` |
| **Crew Manager** | The clipboard and the HR folder | `crew.*` |
| **Payroll Officer** | The payroll clerk | `payroll.*` |
| **Marketer** | The agency they cannot afford | `marketer.*` |
| **Controller** | The advisor they never hired | `controller.*` |

**Brain** (`src/mcp/brain.js` + `src/mcp/employees/*.js`), 75 tools. Every channel routes through it. Enforces role + channel authorization, injects `tenant_id` from session context (ignores it from tool arguments), **per-tenant employee enablement by plan**, per-tenant cost caps, human approval queue, and full audit to `lc_agent_calls`. `listTools` must receive `identity_verified` or gated tools are silently withheld (a v1 bug — do not regress).

### Boundaries enforced in code, not prompts

- **Payroll never self-files.** `filed` can only be set from a licensed provider response; `submit_pay_run` refuses without one; with no provider every run is draft-only and says so on every surface. Open shifts block payroll rather than being guessed into hours.
- **Marketing consent is checked at SEND time** against the live customer record, snapshotted per send, with quiet hours (9pm-8am local).
- **Review requests are never gated or incentivized.** SIT asserts no rating-conditional logic exists in the Marketer.
- **Controller figures trace to real rows** or are omitted — savings are never estimated into existence.
- **No card data at rest.** Stripe holds it; we store ids, brand, last4, expiry.
- **Platform super-admin sees counts and money, not customer PII** — that needs audited impersonation with a written reason (`lc_impersonation_log`).

### Signup and provisioning

`POST /lawncopilot/api/v1/signup` creates a complete company in **one transaction**: tenant, owner login, Florida rate card, service plans, add-ons, crews, job checklists, site content, share link, subscription. Rolls back cleanly on failure — a half-built company is worse than a failed signup. Plans: `starter` / `pro` / `scale` gate crews, employees and which AI employees are enabled.

**SIT:** `node verticals/lawncopilot/sit.js` → **109/109** (deep, provisions its own company) and `node verticals/lawncopilot/sit-v2.js` → **182/182** (tenancy + cross-tenant isolation across the *entire* tool registry, plus cost-derived pricing, confirm-password gate, phone-layer forwarding codes, and capability-coverage). Zero external keys.

### Pricing is derived from cost, not typed
`src/services/unit-economics.js` computes what each plan costs us to run per company per month — every rate is a cited provider price (Twilio ConversationRelay/DID/SMS from the *verified* `ringlypro-lite/docs/telephony-costs.md`, Anthropic Haiku tokens, Google geocode/static-map, Stripe Connect active-account, SendGrid, amortized Render infra) or a labeled assumption — then marks it up (`LAWNCOPILOT_MARKUP`, default **1.70** = 70% above cost). `provision.js` `PLAN_LIMITS` reads `price_cents` from `priceFor(id)`, so a price can never drift from its cost. Shipped: **Solo $35 · Crew $99 · Multi Trucks $259** (down from the old $99/$249/$499 placeholders). `allowancesFor()` sets fair-use ceilings (metered overage at the same 1.70x). Platform economics view: `GET /lawncopilot/platform/economics` (itemized cost, margin, and an honest infra-amortization-at-scale note). `actualCostFor(tenant_id)` measures real logged cost per tenant so `PLAN_USAGE` assumptions get corrected by evidence.

### Phone layer = RinglyPro Lite, integrated (not coupled)
`src/services/telephony.js` gives a tenant a real Receptionist number + carrier call-forwarding so missed calls reach the Brain. It is a **self-contained PORT** of Lite's number-provisioning + `forwardingCodes` (US+CO: GSM `**61*…**timer#` no-answer / `**21` direct, Verizon `*71`/`*72`) — NOT a `require()` across into `ringlypro-lite/` (Lite is a separate Render service + DB + Twilio subaccount and must stay isolated). Provisioning uses the repo's Twilio creds when set (`LAWNCOPILOT_TWILIO_SID`/`_TOKEN` or the account `TWILIO_*` pair), else returns a labeled `mode:'manual'` result — never a fabricated number. Admin: `GET /:slug/admin/phone`, `POST /:slug/admin/phone/provision`, `POST /:slug/admin/phone/number`. `routes/voice.js` (ConversationRelay entry, resolves tenant by dialed number) is unchanged.

### Owner's full-ecosystem demo company
`node verticals/lawncopilot/scripts/seed-demo-company.js` lays down **"Lawn Co-Pilot"** (slug `lawn-co-pilot`, tenant id 1, Multi Trucks plan → all 8 employees enabled) owned by **mstagg@digit2ai.com** — a complete, cross-referenced lawn-maintenance company: 2 crews, 6 staff (certs incl. one expiring), 8 customers/properties/subscriptions, ~3 weeks of completed visits + service records, invoices (paid/open/one failed card) + payments + autopay, quotes (accepted + needs-review), leads across sources, time entries feeding a **draft** pay run (never filed — no provider), job costs + expenses, two sequenced routes, reviews, a referral, tickets, call logs, and a Receptionist number on file. Idempotent. `adoptLegacyTenant` now honors `settings.identity_locked` so it stops renaming tenant 1 back to "Lawn Monster"; the old `lawn-monster` slug resolves via alias. Sign in at `/lawncopilot/lawn-co-pilot/admin`.

The landing page is plan-aware: signup's "What you get" list, the auto-slug (spaces→`_`, specials stripped, client-side instant), a confirm-password field, crew-size options (**default "Just me"**), a movie-style auto-rotating phone simulator (10-screen tour with progress bar, pauses on tap/`prefers-reduced-motion`), and a mobile hamburger drawer + "Eight AI employees" nav anchor.

### Investor teaser (pre-seed)
`/lawncopilot/investors` (and `lawncopilot.com/investors`) — a dark, narrated investor pitch. The Ava voice orb reuses `/api/tts/edge` (now **mounted inside the LawnCopilot app too**, so the orb is same-origin on the custom domain where the main-app route is unreachable — no CORS, no browser-voice fallback). Ten segments: problem → one-brain/eight-employees → why-now → live product → market TAM/SAM/SOM → the real 43–48% unit economics → distribution → a $750K marketing pre-seed ask. Honest: product-complete/live/pre-revenue stated plainly, market figures labeled estimates, no fabricated traction. Unlisted (not in the customer nav). The `/investors` route is registered before `/:slug`.

### Pricing fix — area now drives price (was: identical prices)
The FL default rate was `0.0042/sqft` against a `$45` minimum → break-even ~10,700 sqft, so nearly every residential lawn floored to one price and different-sized yards looked identical. Fixed: default rate **0.0065**, minimum **$40** (break-even ~6,150 sqft), so typical lawns differentiate by size. `priceOne` now returns `minimum_applied` (and `priceProperty.minimum_applied`) so the UI can flag "priced at our minimum" instead of looking like a measurement error. Existing tenants realigned in the DB (rate rules 0.0042→0.0065, min 4500→4000).

### Keyless satellite view
The property diagram (`orb.js drawMap`) already rendered satellite when `imagery_url` was set, but that needed a Google key. Now **zero-key**: `measurement.js` geocodes via OpenStreetMap Nominatim when there's no `GOOGLE_MAPS_API_KEY`, and `imageryUrl()` falls back to **Esri World Imagery** (keyless) framed to a `lotBbox`; the overlay projects against `geometry.bbox` so the parcel/house outline lands on the real roof. Google Static Maps / Mapbox still used first when their keys are present.

### Google Business Profile helper (semi-automated)
`services/gbp.js` + `/:slug/admin/google-listing`. **Full password-based automation is not possible and is not built** (Google has no password API, requires OAuth with an approved project, and new-listing verification is owner-only) — the helper says so plainly. What it does: assembles the whole listing (service-area business, no storefront address — just counties), one-tap copy for every field, deep-links into Google's create flow, and gives the exact Website/Booking URL to paste (the LawnCopilot page). OAuth auto-set-website slots in later behind `GOOGLE_BUSINESS_PROFILE_KEY`.

### Platform subscriptions (Digit2AI Stripe account, 7-day trial)
`services/billing.js` charges landscapers on the **platform** Stripe account (`STRIPE_SECRET_KEY`, via `accounting.stripe()`) — NOT Connect. `createCheckout` builds a Checkout session with `trial_period_days` = `LAWNCOPILOT_TRIAL_DAYS` (**now default 7**), price from the single source in provision.js, metadata `{tenant_id, plan}`. `createPortal` for self-service. Webhook (`/webhooks/stripe`) handles `checkout.session.completed` + `customer.subscription.*` → `applySubscriptionEvent` updates plan/status (attributed by metadata, never guessed). Owner UI at `/:slug/admin/billing`. No key = honest "not configured", never a fake URL.

### Platform forgot-password (SendGrid, info@digit2ai.com)
`/lawncopilot/platform/login` has a "Forgot your password?" flow → `POST /api/v1/platform/forgot-password` emails a reset link **from info@digit2ai.com** (`LAWNCOPILOT_RESET_FROM_EMAIL`). Stateless token: signed with the app secret **plus the user's current password hash**, so it's one-time and expires in 1h with nothing to store. Reset page `/lawncopilot/platform/reset`. `ensurePlatform` no longer clobbers passwords on every boot (so a reset sticks); mstagg's default is **Palindrome@7** (`LAWNCOPILOT_MSTAGG_PASSWORD`), force-reset only with `LAWNCOPILOT_FORCE_PLATFORM_PASSWORD=1`.

**Environment Variables:**
- `LAWNCOPILOT_JWT_SECRET` / `LAWNCOPILOT_SECRET` — session signing and gate-code encryption. Fall back to `JWT_SECRET`. SET on prod.
- `LAWNCOPILOT_PLATFORM_PASSWORD` — Digit2AI super-admin password (mstagg@ / admin@digit2ai.com). Default `lawncopilot@2026`, force-synced on boot.
- `LAWNCOPILOT_BASE_DOMAIN` — canonical host for share links and QR codes.
- `LAWNCOPILOT_TRIAL_DAYS` (14) · `LAWNCOPILOT_SIGNUP_OPEN` (1) · `LAWNCOPILOT_DEMO_SLUG` (`green-acres`).
- `LAWNCOPILOT_MEASURE_PROVIDER` — `heuristic` (default, always labeled an estimate) | `parcel` | `imagery_ai`. `REGRID_API_KEY` / `ATTOM_API_KEY` for `parcel`.
- `GOOGLE_MAPS_API_KEY` — geocoding + satellite. Unset = scaled property diagram, quote still works.
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_CLIENT_ID` / `STRIPE_PLATFORM_FEE_BPS` — payments; Connect sends money to the landscaper.
- `PAYROLL_PROVIDER` + `PAYROLL_PROVIDER_KEY` — unset = payroll draft-only, never represented as filed.
- `ROUTING_PROVIDER_KEY` — real drive-time matrix; unset = straight-line, labeled.
- `GOOGLE_BUSINESS_PROFILE_KEY` — GBP sync; unset = copy-paste instructions.
- `ELEVENLABS_CONVAI_LAWNCOPILOT_EN` / `_ES` — web orb voice. Typed chat always works with no keys.
- `LAWNCOPILOT_AGENT_COST_CAP_USD` (25) · `LAWNCOPILOT_QUOTE_TTL_DAYS` (30) · `LAWNCOPILOT_MIN_CHARGE_USD` (45) · `LAWNCOPILOT_OVERHEAD_PER_JOB_CENTS` (400) · `LAWNCOPILOT_DRIVE_COST_PER_MIN_CENTS` (85) · `LAWNCOPILOT_TARGET_MARGIN` (0.45).
- **Pricing/cost model** (`services/unit-economics.js`): `LAWNCOPILOT_MARKUP` (1.70) · `LAWNCOPILOT_INFRA_MONTHLY` (185) · `LAWNCOPILOT_INFRA_TENANTS` (75, amortization divisor) · `LAWNCOPILOT_COGS_VOICE_MIN` (0.084) · `LAWNCOPILOT_COGS_DID_MONTHLY` (1.00) · `LAWNCOPILOT_COGS_SMS` (0.0083) · `LAWNCOPILOT_COGS_LLM_IN_PER_M` (1.00) / `_OUT_PER_M` (5.00) · `LAWNCOPILOT_COGS_LLM_IN_TURN` (3500) / `_OUT_TURN` (450) · `LAWNCOPILOT_COGS_GEOCODE` (0.005) · `LAWNCOPILOT_COGS_STATIC_MAP` (0.002) · `LAWNCOPILOT_COGS_STRIPE_ACCOUNT` (2.00) · `LAWNCOPILOT_COGS_EMAIL` (0.0004). Every override changes plan prices with no redeploy.
- **Phone layer** (`services/telephony.js`): `LAWNCOPILOT_TWILIO_SID` / `LAWNCOPILOT_TWILIO_TOKEN` — activate real number provisioning (fall back to the account `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`). Unset = forwarding codes still work against a manually-entered number; provisioning returns a labeled `manual` result, never a fake number.
- **Demo company**: `LAWNCOPILOT_DEMO_OWNER_PASSWORD` (falls back to `LAWNCOPILOT_MSTAGG_PASSWORD`, default `Palindrome@7`) — owner password the seed force-sets for mstagg@digit2ai.com on "Lawn Co-Pilot". `LAWNCOPILOT_DEMO_COMPANY_SLUG` (`lawn-co-pilot`).
- **Platform accounts**: `LAWNCOPILOT_MSTAGG_PASSWORD` (default `Palindrome@7`) — mstagg@digit2ai.com super-admin password, set on account creation and never clobbered on boot (so Forgot-password resets stick). `LAWNCOPILOT_FORCE_PLATFORM_PASSWORD=1` force-resets platform passwords to defaults on boot (lockout recovery). `LAWNCOPILOT_RESET_FROM_EMAIL` (default `info@digit2ai.com`) — From: on password-reset mail (must be a verified SendGrid sender).
- **Billing/trial**: `LAWNCOPILOT_TRIAL_DAYS` (**now 7**) — free-trial length, applied both locally and as the Stripe `trial_period_days`. Reuses `STRIPE_SECRET_KEY` (Digit2AI platform account) + `STRIPE_WEBHOOK_SECRET`. Unset = local trial only, no online billing.
- **Satellite/geocode**: keyless by default (OpenStreetMap Nominatim + Esri World Imagery). `GOOGLE_MAPS_API_KEY` / `MAPBOX_TOKEN` upgrade to their imagery + geocoder when present.

**Data Flow:**
Google listing / truck QR / short link → `/lawncopilot/<slug>` → identity gate → that company's `lc_leads` → Brain `tools/call` (tenant injected) → Estimator → Dispatcher → crew clocks in → Bookkeeper invoices on completion → Stripe Connect → Controller reports what it saved

## Database Access
```javascript
const { Sequelize } = require('sequelize');
require('dotenv').config();
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});
```

## Node.js Path
Local: `/opt/homebrew/bin/node`

## CI/CD Agent
Use `/ringlypro-cicd` for autonomous development operations.
See `.claude/skills/ringlypro-cicd.md` for full documentation.

## Important Files
- `src/app.js` - Main Express app, mounts all routes
- `store-health-ai/src/index.js` - Store Health AI entry point
- `store-health-ai/models/` - Sequelize models
- `package.json` - Root dependencies (shared with Store Health AI)
- `build.sh` - Build script for Render deployment

## Common Commands
```bash
# Local test
/opt/homebrew/bin/node -e "require('dotenv').config(); ..."

# Deploy
git add -A && git commit -m "msg" && git push origin main

# Test endpoint
curl -s "https://aiagent.ringlypro.com/aiastore/health"
```

## OEE Tracking Module

**Purpose:** Real-time shop floor monitoring and OEE calculation for manufacturing tenants.

**New Files:**
- `/migrations/20260305_oee_tables.sql` — DB schema for machines, machine_events, production_runs
- `/src/models/Machine.js` — Sequelize model for shop floor machines
- `/src/models/MachineEvent.js` — Sequelize model for machine status events
- `/src/models/ProductionRun.js` — Sequelize model for production run records
- `/src/utils/oee.js` — OEE calculation utility (Availability x Performance x Quality)
- `/src/routes/mcp-oee.js` — MCP tool handlers for all 5 OEE tools + REST API + webhook

**API Base:** `/api/oee`

**MCP Tools (via POST /api/oee/tools/call):**
1. `get_machine_status` — Live status of one or all machines
2. `get_oee_report` — Full OEE breakdown for a machine on a shift date
3. `get_downtime_summary` — Ranked downtime reasons with total minutes
4. `log_machine_event` — Log a status change (running/stopped/idle/fault)
5. `get_floor_summary` — Shop floor snapshot with rolling OEE

**REST Endpoints:**
- `GET /api/oee/machines?tenant_id=N` — List machines
- `POST /api/oee/machines` — Register a machine
- `POST /api/oee/production-runs` — Record a production run
- `GET /api/oee/tools/list` — List available MCP tools
- `GET /api/oee/health` — Health check

**Webhook:** `POST /api/oee/webhooks/machine-event`
- Body: `{ machine_id, status, reason, tenant_id, api_key }`
- Validates `api_key` against `WEBHOOK_API_KEY` env var
- Called by PLCs / n8n for real-time machine status

**Environment Variables:**
- `WEBHOOK_API_KEY` — Secret for authenticating inbound machine event webhooks
- `SENDGRID_API_KEY` — SendGrid API key for outbound surgeon-survey emails (verticals/intuitive). When unset, the survey `/send` endpoint generates magic links but does not transmit; set both this and `SENDGRID_FROM_EMAIL` to enable auto-send.
- `SENDGRID_FROM_EMAIL` — Verified SendGrid sender address used as the From: line on surgeon survey invitations.
- `INTUITIVE_ENGAGEMENT_GO` — Set to `1` to enable Wave 4 (Snowflake connector + NL Q&A + white-label) of the multi-wave Intuitive build. Default unset = skipped.
- `BRAVE_SEARCH_API_KEY` — Optional. When set, the AI Business Analyst Agent uses Brave Search; otherwise falls back to DuckDuckGo HTML scrape (no key required).
- `CHAT_DAILY_CAP_PER_USER` — Per-user daily message cap for `/api/v1/chat`. Default 200. Lower for cost control.
- `WAIVE_SIGNUP_FEES_SLUGS` — Comma-separated chamber slugs that skip the $25 setup fee and $10/mo subscription at signup. Members in these chambers are activated immediately and a $0 'waived' transaction is recorded for audit. Default: `cv-2` (PACC-CFL promotional period). Remove a slug to restore paid signup; no code changes needed.
- `EMAIL_AUTOSEND_DISABLED` — Default ON. Kills every server-initiated SendGrid send in `digit2ai-projects`: meeting-recap auto-send (4s after AI processing), requestor approval/rejection notices, architect-pipeline UAT/SIT/build-complete emails, and the four scheduled pollers (meetingReminder, rsvpReminder, inboxDigest, meetingMinutesPrompt). Reason: SendGrid mail was landing in client spam folders; user reviews drafts in the dashboard and sends each through Apple Mail via the magic-link / mailto helper. Set `EMAIL_AUTOSEND_DISABLED=0` to restore the original behavior. **Does not gate user-clicked sends** (campaigns, contracts, meeting invites, manual minutes /send) — those still go through SendGrid until per-flow Apple-Mail UIs land.
- `ELEVENLABS_CONVAI_PARTNERSHIP_EN` — ElevenLabs Conversational AI agent ID for the English Partnership orb on `/champion-teaser.html`. The orb on the teaser page connects directly to this agent via the browser SDK. **No API key is sent to the browser** — agent IDs are public per ElevenLabs convai design; the API key stays server-side. When unset, the orb shows a friendly "voice mode unavailable" caption and the keyboard demo stays the active path. Sister var: `ELEVENLABS_CONVAI_PARTNERSHIP_ES` for the Spanish agent (same orb, switches based on the page's language toggle).
- `ELEVENLABS_CONVAI_PARTNERSHIP_ES` — Spanish-language convai agent ID. See `ELEVENLABS_CONVAI_PARTNERSHIP_EN` for the full setup recipe. Must be a separate dedicated agent (per the `ringlypro_elevenlabs_agents` reference memory: "Each product gets its own dedicated convai agent; never share agents across unrelated products").

## Tier 4 — Polish That Compounds (T4.1–T4.4)

- **T4.1 Mobile orb v2**: bottom-sheet drawer for the transcript on <=900px (tap header to toggle .peeked state), full-screen voice mode (body.orb-fullscreen hides every other element; status indicator + 52x200 red Stop + ghost Exit-fullscreen at bottom), Wake Lock API (`navigator.wakeLock.request('screen')`) on session start + auto-re-acquire on visibility return. Wake lock gracefully no-ops on Safari < 16.4.
- **T4.2 Portuguese (PT-BR) — REMOVED per user request**. Page is EN+ES only. Dead `.i18n-pt` span markers remain in DOM but are CSS-hidden (`{ display: none }`) — re-introduction would need only restoring the lang toggle button + JS branches. Backend `/partnership-orb-config` reverted to en/es only. `ELEVENLABS_CONVAI_PARTNERSHIP_PT` env var no longer read.
- **T4.3 Sample prompt cards**: 3 one-tap example projects (Dispatch Auto-Pilot, Churn Rescue Agent, Document AI for Regulated Workflows) between orb and social-proof. Each card carries EN / ES / PT versions; tap fills `#d-desc` in active language, smooth-scrolls to demo, focuses Run AI Triage (does not auto-run).
- **T4.4 Lighthouse pass**: ElevenLabs SDK now LAZY-LOADED via `window.__loadElevenLabsSdk()` on first orb-click intent — saves ~200KB of unused JS for visitors who never use voice. `import('https://esm.sh/@elevenlabs/client@1.9.0')` triggered inside activateOrb's promise chain, cached via `window.__ElevenLabsSdkPromise`. Preconnect hint for `esm.sh` primes the connection during idle. Critical font weights preloaded.

## Tier 3 — Sales/Ops Automation (T3.1–T3.4)

- **T3.1 Partner dashboard** at `/champion-dashboard.html` (HTML page). Migration `016_partner_sessions.sql`. Endpoints: `POST /partner-login` (magic link; always returns URL even if SendGrid down), `GET /partner-verify?token=` (sets HttpOnly cookie + redirects), `GET /partner-stats` (cookie-authed, joins `d2_projects` WHERE `partner_slug = me`), `POST /partner-logout`. Commission estimate placeholder = 10% of stated budget.
- **T3.2 Embed code generator** at `/champion-embed.html`. Pre-fills slug from partner session, builds iframe + direct-URL snippets with click-to-copy, live preview iframe. Architecture choice: iframe over `<script>` for mic sandbox + version-pinning. `allow="microphone; autoplay"` on the iframe.
- **T3.3 Funnel analytics**. Migration `017_funnel_events.sql`. Endpoints: `POST /funnel-event` (allowlist of 19 events, sendBeacon-friendly), `GET /funnel-summary?days=N` (BasicAuth, returns Sankey-shaped counts), `GET /ab-summary?days=N` (BasicAuth, per-variant conversion rates). Admin view at `/champion-funnel.html` with 1/7/30/90-day toggle, bar funnel, variant winner highlight, top-partners table. Client emits: `page_visible`, `orb_clicked`, `triage_started`, `triage_completed`, `submit_succeeded`, `hero_variant_shown`. Helper: `window.__emitFunnelEvent(event, metadata?)`.
- **T3.4 A/B headline framework**. `GET /hero-variant?session_id=` returns deterministic variant 0/1/2 via `md5(session_id) % 3` + EN+ES copy. Client applies on load and emits `hero_variant_shown`. Variant 0 = control (Joint Venture / Partnership), variant 1 = problem-led ("Stop guessing. Start shipping."), variant 2 = social proof ("Trusted by 21 platforms").
- **New env vars added**: `BASIC_AUTH_USER` + `BASIC_AUTH_PASS` for `/funnel-summary` + `/ab-summary` admin gating. If unset, those endpoints only allow localhost (dev). `SESSION_SALT` (also used by T2.3, T3.1) for ip_hash anonymization.

## Tier 2 — Robustness Wins (T2.1–T2.5)

- **T2.1 Auto-save + recovery**: localStorage key `d2ai_session_state` (30-min TTL, schema v1). Snapshots transcript, triage payload, form fields, language every 5s during a session. On page load, if state with >= 2 transcript lines OR a triage payload exists, the amber resume banner slides down from top with "Resume" / "Start fresh". Successful submit auto-clears. Exposes `window.__setLang`, `window.__renderResult`, `window.__clearSavedSession`, `window.__snapshotSession`.
- **T2.2 Email me / Download PDF**: two buttons in the result-panel CTA row. Email uses mailto with a formatted plain-text body (matches the project-wide Apple Mail pattern). PDF uses `window.print()` against a print stylesheet that hides all chrome — user saves as PDF from the print dialog. Sets `document.title` to `digit2ai-triage-<slug>-<YYYY-MM-DD>` so the default filename is meaningful.
- **T2.3 Abandoned-conversation capture**: migration `015_abandoned_conversations.sql` adds the `d2_abandoned_conversations` table. POST `/projects/api/v1/intake/abandoned-conversation` (rate-limited via shared triage bucket, ip_hash with `SESSION_SALT` env var — never raw IPs). Modal triggers from `endVoiceSession` when triage did NOT fire AND transcript has >= 2 lines. Bilingual EN/ES, Esc + backdrop + close-button dismiss, mobile-stacks actions under 480px.
- **T2.4 FAQ section**: 8 collapsible Q&As with native `<details>/<summary>`, bilingual inline, schema.org FAQPage JSON-LD regenerated on language toggle for Google rich-result snippets. Topics: Is this real AI / What if triage wrong / Pricing / Data NDA / Integrations / Speed / Languages-platforms / Non-technical describe.
- **T2.5 ROI calculator**: 3 sliders (team / hours per week / hourly cost) → hours wasted per year, $ wasted per year, payback weeks at $50K midpoint cost. Currency toggle USD / MXN / COP (display only, no conversion). Shareable URL: `?roi=team=10&hr=8&rate=85&cur=USD` — preserves partner attribution.
- **Env var added**: `SESSION_SALT` — secret string mixed into the ip_hash for `d2_abandoned_conversations`. Optional; defaults to `d2ai-default-salt`. Set this on prod for stronger anonymization.

## Trust Signals + Live Transcript (T1.2, T1.4)

- `GET /projects/api/v1/intake/partnership-trust-signals?lang=en|es` — returns the social-proof stats (21 platforms, 22 verticals, 99.9% SLA, $300B TAM) + the partner badge list shown on the social-proof block. Numbers sourced from `company_digit2ai.md` memory — never invent. Updating just the endpoint refreshes the page without redeploy.
- `POST /projects/api/v1/intake/email-transcript` — user-clicked send (bypasses `EMAIL_AUTOSEND_DISABLED`). Body: `{ email, transcript: [{role, text, ts}], language, partner_slug? }`. Renders a branded HTML email + plain-text fallback via SendGrid. Rate-limited via the shared triage bucket. Requires `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL`.
- Frontend: orb-transcript panel (`#orb-transcript`) shows live user + agent messages color-coded (cyan = user, violet = agent). Listens to the convai SDK's `onMessage` callback. Copy / Clear / Email buttons. Slides in to the right of the orb on desktop, drops below on mobile. Persists visible after orb returns to idle so the prospect can copy/email after the call.

## Partner Attribution + UTM Tracking (T1.1)

- Migration: `digit2ai-projects/migrations/014_partner_attribution.sql` (LIVE)
- Adds 7 nullable columns to `d2_projects`: `partner_slug`, `utm_source`, `utm_campaign`, `utm_medium`, `utm_content`, `utm_term`, `referrer_url`
- Indexes: `idx_d2_projects_partner_slug` (partial), `idx_d2_projects_utm_source` (partial)
- Frontend (`/champion-teaser.html`) parses `?partner=<slug>` (+ alias `?ref=<slug>`, `?p=<slug>`) and the standard 5 UTM params from `window.location.search` on load. Persists to `localStorage['d2ai_partner_attribution']` for 30 days so attribution survives reloads/language toggles. Renders a "Referred by: <Pretty Name>" badge above the hero h1 when present.
- Submission path (`acceptAndSubmit` → POST `/projects/api/v1/intake/public/request`) attaches all attribution fields to the payload via `window.attachPartnerAttribution(payload)`. Server (`intake.js`) persists them on the `d2_projects` row + echoes `partner_slug`/`utm_source`/`utm_campaign` back in the success response so Partners can verify their code wired correctly.
- Slug sanitization: alphanumeric + dash/underscore/dot/space only, capped at 120 chars. UTM params capped at 255. Both client + server enforce.
- Test URL: `https://aiagent.ringlypro.com/champion-teaser.html?partner=manuel-stagg&utm_source=linkedin&utm_campaign=launch-2026`

## Partnership Orb — ElevenLabs Convai Setup Recipe

The animated voice-interactive orb on `/champion-teaser.html` is powered by ElevenLabs Conversational AI. To enable it in production, create two dedicated convai agents (one EN, one ES) and wire their IDs into the env vars above.

**Per-agent setup (do once for EN, once for ES):**

1. Log into the ElevenLabs dashboard → **Conversational AI** → **Agents** → **Create New Agent**
2. Name: `Digit2AI Partnership Brain (EN)` / `(ES)` — keep these distinct from Rachel / Ana / Lina
3. **Voice**: pick a premium multilingual or language-specific voice — for EN, something warm and confident (e.g. "Adam" or a custom voice); for ES, a fluent LATAM voice with proper neutral accent
4. **System prompt**: paste the full teaser content as context (the 6 sections, 83-agent roster, 4 deliverables, 5-step flow, doctor-vs-thermometer framing, all script replies). Add structured intake instructions: detect when prospect is describing a project vs asking general questions; in intake mode, gather industry/problem/current-state/timeline/budget hints; ask at most 4 clarifying questions; when ready, call the `run_partnership_triage` client tool with `{ description, conversation_summary, name?, email?, company?, country? }`
5. **Client tools** → add a tool named `run_partnership_triage` with parameters matching the payload shape the orb sends to `/api/v1/intake/voice-trigger-triage`. The orb's controller registers a JS handler under the same name; the SDK bridges the agent's tool call to the browser-side handler, which POSTs to the backend and returns the verdict
6. **First-message greeting**: "Hi, I'm the Digit2AI Partnership brain. Tell me about your project — or ask me anything about what we do." (Spanish equivalent for the ES agent)
7. Save → copy the **Agent ID** from the agent detail page
8. On Render, set `ELEVENLABS_CONVAI_PARTNERSHIP_EN` (or `_ES`) to that agent ID and redeploy
9. Reload `/champion-teaser.html` → click the orb → mic permission prompt → orb enters listening state → speak

**Fallback behavior:** if either agent ID is unset, the SDK fails to load, or the user denies mic permission, the orb shows a friendly fallback message and the keyboard demo (textarea + Run AI Triage button) below the hero remains the working path. Voice is an enhancement, not a requirement.

**Cost model:** ~$0.15-$0.40 per 3-5 minute prospect demo (covers STT + LLM + TTS bundled by convai). At 50 demos/month per Partner, ~$10-22/month. Pennies per closed deal.

## Phase A — Public Source Refresh Schedule (Intuitive)

Six public-source connectors back the Hospital Intake bulletproof citation chain:

| Source | Refresh cadence | Script | URL |
|---|---|---|---|
| CMS Hospital Compare | monthly (1st Sunday) | (already wired in services/cms-hospital-compare.js) | https://data.cms.gov |
| CMS HCRIS | quarterly (Mar/Jun/Sep/Dec, 1st Sunday) | `verticals/intuitive/scripts/ingest-hcris.js` | https://www.cms.gov/Research-Statistics-Data-and-Systems/Files-for-Order/CostReports |
| CMS Open Payments | annually (July 15, 1st Sunday after) | `verticals/intuitive/scripts/ingest-open-payments.js` | https://www.cms.gov/openpayments/data/dataset-downloads |
| CMS MPUP (Physician Volume) | annually (April 15, 1st Sunday after) | `verticals/intuitive/scripts/ingest-physician-volume.js` | https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners |
| CMS Medicare Inpatient Hospitals (hospital × MS-DRG) | annually (Sep, after MS-DRG year close) | `verticals/intuitive/scripts/ingest-medicare-inpatient-drg.js` | https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals |
| Florida AHCA | quarterly (1st Sunday of Jan/Apr/Jul/Oct for prior quarter) | `verticals/intuitive/scripts/ingest-florida-ahca.js --quarter=YYYY-QX` | https://ahca.myflorida.com/ahca-database-download-form |
| NPI Registry (NPPES) | live API per Hospital Intake call (24h cache) | (no script — connector caches inline) | https://npiregistry.cms.hhs.gov |
| ProPublica Form 990 | live API per Hospital Intake call (24h cache) | (no script — connector caches inline) | https://projects.propublica.org/nonprofits |

Run scripts manually for the initial population:
```bash
# Download bulk files manually first (CMS download URLs vary by year), then:
node verticals/intuitive/scripts/ingest-hcris.js --file=/path/to/hosp10_2024.csv
node verticals/intuitive/scripts/ingest-open-payments.js --file=/path/to/OP_DTL_GNRL_PG2024.csv
node verticals/intuitive/scripts/ingest-physician-volume.js --file=/path/to/MUP_PHY_R24_P2024_NPI_HCPCS.csv
node verticals/intuitive/scripts/ingest-florida-ahca.js --file=/path/to/florida_hospitals_2024.csv
```

TODO: wire actual Render cron jobs once first quarterly refresh window approaches.

## Veritas — AI Deepfake Detection & Takedown

**Purpose:** Digit2AI vertical (modeled on revelum.ai) that detects and removes deepfakes/impersonations at scale — brand, executive, and likeness protection. Mounted at `/veritas`.

**Location:** `verticals/veritas/` (self-contained Express Router, own Sequelize instance via `src/db.js` using `CRM_DATABASE_URL || DATABASE_URL`). Tables auto-create on boot via `sync({alter:false})`; canonical migration at `verticals/veritas/migrations/20260605_veritas_tables.sql`. All tables multi-tenant (`tenant_id`), `df_` prefix: tenants, monitors, assets, detections, takedowns, usage.

**Live:** dashboard `/veritas/` · landing `/public/veritas-landing.html` (bilingual EN/ES) · health `/veritas/health` · debug `/debug/veritas-error`.

**Detection engine:** `src/services/detection.js` is provider-agnostic. Phase 0 = deterministic stub (zero keys). Swap to a real provider via `VERITAS_DETECTION_PROVIDER` (`hive`|`reality_defender`|`sensity`) + that provider's key — the `detect()` contract is unchanged.

**REST API (`/veritas/api/v1/*`):**
- `GET/POST /monitors`, `PATCH /monitors/:id` (pause/resume), `POST /monitors/:id/scan` (runs ad-library pipeline)
- `GET /detections`, `GET /detections/summary` (dashboard stat cards)
- `GET/POST /takedowns`, `PATCH /takedowns/:id` (status flow), `GET /takedowns/:id/letter` (DMCA/impersonation/trademark draft + mailto magic link)
- `POST /scan` (on-demand single-asset "Who should we check?")
- `POST /webhooks/candidate` (external scanners / n8n push media for analysis; api_key auth)

**Ad scanning:** `src/services/adscan.js` — monitor → fetchCandidates → detect → persist. Candidate fetch is STUBBED (synthetic) until `META_AD_LIBRARY_TOKEN` is set, then swaps to the real Meta Ad Library API with no pipeline change.

**Environment Variables:**
- `VERITAS_DETECTION_PROVIDER` — `hive`|`reality_defender`|`sensity` (default `stub`). Selects the deepfake-detection backend behind `services/detection.js`.
- `HIVE_API_KEY` / `REALITY_DEFENDER_API_KEY` — provider key for live detection (Phase 1).
- `META_AD_LIBRARY_TOKEN` — Meta Graph token enabling real ad scanning in `services/adscan.js` (Phase 2). Unset = synthetic stub candidates.
- `VERITAS_WEBHOOK_API_KEY` — secret validated on `POST /veritas/api/v1/webhooks/candidate`. When unset, auth is skipped (dev/demo).
- `VERITAS_JWT_SECRET` — secret for signing the console login JWT (cookie `veritas_token`). Falls back to `JWT_SECRET` then a default. SET THIS on prod so tokens can't be forged.
- `VERITAS_DEFAULT_PASSWORD` — shared password seeded for the 4 console operator accounts (mstagg@, lala@, abelardo@, eduardo@ digit2ai.com). Default `defensoresdelapatria@7`. Accounts live in `df_users`; login at `/veritas/login`, gate redirects unauthed users. Cookie is SameSite=None;Secure (works direct + best-effort in iframe; third-party-cookie blockers may require direct access).
- `VERITAS_SEED_DEMO` — set to `1` to populate the demo tenant with sample Defensores detections/monitors/takedowns on boot. Default (unset) = NO seeding, and never re-seeds on restart (keeps the tenant clean for real scans).
- `VERITAS_SEARCH_API_KEY` + `VERITAS_SEARCH_CX` — Google Custom Search API key + Search Engine ID. Powers the one-click "¡Veritas, por favor escanea ya!" button (`POST /veritas/api/v1/scan/now`): web image search for the candidate → Reality Defender on each result. When unset, the button returns a "configure search" message (no fake results). Free tier 100 queries/day.
- `VERITAS_SCAN_QUERY` — the search term the scan button uses. Default `Abelardo de la Espriella`.
- `VERITAS_SCAN_MAX` — max images analyzed per scan click (default 10). Caps provider-credit usage; repeat clicks dedupe on URL.
- `ELEVENLABS_CONVAI_VERITAS_EN` / `_ES` — convai "protection analyst" agent IDs (Phase 2; dedicated agents per the ringlypro_elevenlabs_agents rule).

Full build status + remaining external dependencies (provider keys, AWS Rekognition for likeness, legal-reviewed templates) are tracked in `verticals/veritas/ECOSYSTEM.md`.

## Visionarium Coaching — Multi-tenant AI Coaching Tracker (folder: coachtrack)

**Purpose:** Multi-tenant AI coaching tracker for **Visionarium** (creativity & leadership incubator, brand visionarium.app). Log 1:1 coaching sessions, record + transcribe the full session (voice NLP or typed), auto-extract the subject of the day + action items, and ask the Visionarium AI coach **Lina** for guidance on each action item. **Open free self-signup** for Visionarium users. Structure modeled on CoachAccountable (accountability state machine), BetterUp (session->goals), Quenza (between-session reflection), Mentalyc (notes from audio). Spanish-first, emoji-free. Mounted at `/coaching`. Product name = "Visionarium Coaching"; folder/mount stay `coachtrack` / `/coaching`.

**Multi-tenancy:** each signup is its own private tenant (`tenant_id = user.id`); all data isolated per user, scoped by `req.user.tenant_id` in every query. `ct_users.tenant_id` added via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `index.js` init (sync({alter:false}) never adds columns).

**Location:** `verticals/coachtrack/` — self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`). Tables auto-create on boot via `sync({alter:false})`; canonical migration `verticals/coachtrack/migrations/20260712_coachtrack_tables.sql`. Multi-tenant (`tenant_id`), `ct_` prefix: `ct_users, ct_sessions, ct_transcripts, ct_action_items, ct_guidance`.

**Live:** promo landing `/visionarium/coachtrack` (public, bilingual ES/EN, served from `verticals/coachtrack/public/landing.html` via a route in `src/app.js`) · dashboard `/coaching/` · signup `/coaching/signup` (open free) · login `/coaching/login` · health `/coaching/health` · debug `/debug/coachtrack-error`.

**Branding:** crisp vector brand lockup (constellation mark + `VISI●NARIUM` wordmark with gradient node-O) inline in login/signup/dashboard/landing — replaced the low-res `visionarium-logo.png`. App icons (`icon-192/512`, `apple-touch-icon`, `favicon-32`) rasterized from `public/icon-master.svg` (square constellation mark) via `sips -s format png -Z`. Green→teal→blue gradient (`#3fc06a → #17a6a6 → #2a6f9e`).

**PWA + mobile:** installable PWA — `public/manifest.webmanifest` (standalone, theme `#17a6a6`), `public/sw.js` (offline shell; network-first navigations, never caches `/api/`), `apple-touch-icon.png`, icons 192/512 (generated from the Visionarium logo via `sips` fit-then-pad), branded `favicon.svg` (constellation node mark). Light Visionarium theme (white + green→teal→blue gradient), logo `public/visionarium-logo.png`, safe-area insets, 44px touch targets, in-app Install bar. PWA assets serve pre-login (auth gate allows `/signup`, `/manifest.webmanifest`, `/sw.js`, and any static asset extension).

**AI brain:** `src/services/coach-brain.js` = **Lina**; reuses `ANTHROPIC_API_KEY` (Claude Haiku). `finalizeSession(transcript)` extracts `{subject, summary, action_items[]}`; `guidance(item, sessionContext, question, thread)` answers per-action-item questions with the session as context. Zero-key **heuristic fallback** if no API key.

**Capture:** browser Web Speech API (`es-ES`, zero key) live voice AND typed input both POST to `/sessions/:id/turn` — one pipeline. Full transcript saved to `ct_transcripts`. "Finalize" runs the AI extraction; each action item has an inline "Preguntar a Lina" chat.

**REST API (`/coaching/api/v1/*`):**
- Auth: `POST /auth/signup` (open free) · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me`
- `POST /sessions` · `GET /sessions` (list + open-item counts) · `GET /sessions/:id` · `POST /sessions/:id/turn` · `POST /sessions/:id/finalize`
- `GET /action-items` (cross-session accountability board) · `PATCH /action-items/:id` · `GET|POST /action-items/:id/guidance` · `GET /health`

**Environment Variables:**
- `COACHTRACK_JWT_SECRET` — signs the `coachtrack_token` cookie (fallback `JWT_SECRET`), 30d. SET on prod.
- `COACHTRACK_MODEL` — Anthropic model for extraction + guidance. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY`.
- `COACHTRACK_DEFAULT_PASSWORD` — seeded admin password (`mstagg@digit2ai.com`). Default `coachtrack@2026`. (Regular users self-signup; no shared password.)
- `COACHTRACK_SEED_DEMO` — `1` seeds one sample session on boot. Default unset = clean.

## Digit2AI Growth — internal AI CMO for our OWN portfolio (folder: growth)

**Purpose:** Internal, owner-only "AI CMO" (Okara.ai-style) that markets **our own verticals**, not a product we sell. Each **brand = one Digit2AI product** (Lawn Co-Pilot, Speakly, EquiMind, Veritas, Torna, Visionarium, RoundShare, AgroMercado, Digit2AI itself). A fleet of growth agents drafts SEO/content/social/GEO work per brand into a **review queue**; NOTHING auto-publishes (obeys the `EMAIL_AUTOSEND_DISABLED` philosophy — owner reviews, edits, and posts). Login-only, no public signup, no billing. Mounted at `/growth`. Emoji-free.

**Location:** `verticals/growth/` — self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`). Tables auto-create on boot via `sync()`; canonical migration `verticals/growth/migrations/20260725_growth_tables.sql`. `gr_` prefix: `gr_users, gr_brands, gr_drafts, gr_runs, gr_metrics`. Rows carry `owner_id` so a second operator needs no migration.

**The agent fleet** (`src/services/agents.js`) — each returns ONE draft (status `draft`), Haiku-backed with a labeled zero-key heuristic fallback (`is_simulated:true`): `seo.audit` (keyword opportunities + post outline), `content.draft` (article intro + headers in brand voice), `social.x` (3 X posts), `social.linkedin` (one professional post), `geo.monitor` (how AI engines describe the brand + gaps to publish). `runBrand()` fans a set of agents over one brand, records a `gr_run` with cost telemetry, and stops at `GROWTH_COST_CAP_USD`.

**Brand registry** (`src/services/brands.js`) — the real Digit2AI portfolio seeded once per owner (idempotent by slug), each with URL/positioning/ICP/voice/keywords. Editable in the cockpit; the seed only fills gaps, never clobbers edits.

**Cockpit:** `/growth/` (brand list + per-brand review queue, "Run all agents" + per-channel buttons, Approve/Mark-published/Discard) · login `/growth/login` (owner `mstagg@digit2ai.com`) · health `/growth/health` · debug `/debug/growth-error`.

**REST API (`/growth/api/v1/*`):** `POST /login|logout` · `GET /brands` (+ pending-draft counts) · `PATCH /brands/:id` · `POST /brands/:id/run` (`{agents?}`) · `GET /drafts?brand_id=&status=` · `PATCH /drafts/:id` (status/title/body) · `DELETE /drafts/:id`.

**Channel settings** (`/growth/settings`, `gr_settings`, `src/services/settings.js`) — owner-level config per channel that STEERS the agents: Contenido (words/tone/CTA), X (posts-per-run), GEO (which AI engines + brand facts), plus SEO (GSC/GA4 properties — Phase-4 plumbing) and X/LinkedIn API tokens stored **AES-256-GCM encrypted** (`src/services/crypto.js`), returned masked `{set,hint}`, never raw; empty secret on re-save keeps the stored value.

**Blog / publish pipeline (the SEO/Contenido destination):** approved SEO or Contenido drafts publish to the brand's blog via `POST /api/v1/drafts/:id/publish` (`src/services/publish.js`) → a `gr_posts` row rendered as crawlable HTML. Public renderer `src/blog.js` is mounted at **`/blog` on the main app** and is **host-aware**: on a brand's custom domain (e.g. `orbup.app/blog`) it serves THAT brand's posts; on the main domain use `/blog?brand=<slug>`. Full SEO head (title, meta description, canonical, OG, Article JSON-LD). Markdown→HTML by dependency-free `src/services/render.js`. The `orbup.app` host handler in `src/app.js` already passes `/blog` through untouched. X/LinkedIn drafts are NOT blog-publishable (social destination); GEO items are site to-dos, not posts.

**Add-a-vertical utility (repo scanner):** `src/services/discover.js` scans the actual repo — `verticals/*` dirs, `host === '…'` custom domains in `src/app.js`, and `public/*-teaser|-landing.html` — for brands not yet in the registry. Cockpit "+ Agregar" modal (`GET /api/v1/discover`) lists them one-click, plus a manual add form (`POST /api/v1/brands`, slug/dupe-guarded). New brands default `blog_enabled:true, source:'manual|vertical|domain|landing'`.

**Universal SEO layer (all verticals, brand-host gated):** three files wired into `src/app.js` right after the custom-domain handlers, **hard-gated to managed brand hosts** so the shared `aiagent.ringlypro.com` CRM host is never touched:
- `src/services/hosts.js` — 60s-refreshed host→brand cache. A host is "managed" ONLY if exactly ONE brand owns it (a dedicated custom domain) and it isn't excluded (`aiagent.ringlypro.com`, `APP_HOST`). Path-based brands sharing the CRM host are handled by the audit, not injected.
- `src/seo.js` — dynamic **`/sitemap.xml`** (homepage + `/blog` + every published post, auto-updates on publish) and **`/robots.txt`** (points at the sitemap). Both `next()` on non-brand hosts.
- `src/inject.js` — injects a fixed **"Blog"** link pill into brand-host HTML (SEO connection #1) via a res.send hook, only when the page lacks a `/blog` link. Static-file landings bypass res.send and are flagged by the audit instead.

**SEO-first flow + site audit:** clicking SEO (running `seo.audit`) first runs `src/services/audit.js` `ensureBlog()`, which fetches the brand's live landing, checks the three SEO connections (blog link / sitemap / robots) + whether the domain even routes here (`served_by_app`, detected via the blog renderer's `X-Growth-Blog:1` header), enables the blog wiring, and **posts the readiness finding as an `seo.site_audit` draft**. Honest when a domain isn't pointed here (no fabricated fix). `GET /api/v1/brands/:id/audit` runs it on demand.

**SIT:** `node verticals/growth/sit.js` → **33/33** (seeds owner + brands incl. OrbUp, fans the full fleet, settings save + secret masking, publish→blog with slug uniqueness + markdown render + channel gating, repo-scanner discovery + add-brand dupe guard, host-cache managed-vs-shared gating, network-tolerant site audit). Zero external keys.

**Phases:** P1 engine (DONE) · P2 richer cockpit (edit-in-place, Apple-Mail/copy publish helpers) · P3 daily scheduler behind `GROWTH_GO=1` (per-brand fan-out, cost-capped, reuses the poller pattern) · P4 GSC+GA4 feedback connectors (OAuth like projects-bridge) feeding the SEO/content agents · P5 optional model router (cheap Haiku for drafts, stronger model for analysis).

**Environment Variables:**
- `GROWTH_JWT_SECRET` — signs the `growth_token` cookie (fallback `JWT_SECRET`), 30d. SET on prod.
- `GROWTH_MODEL` — Anthropic model for the agents. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY`. Unset key = labeled heuristic drafts (tool still fully runs).
- `GROWTH_OWNER_PASSWORD` — owner password force-synced on boot (falls back to `LAWNCOPILOT_MSTAGG_PASSWORD`, default `Palindrome@7`).
- `GROWTH_COST_CAP_USD` — max token spend per brand fan-out (default 2.0).
- `GROWTH_GO` — (P3) set to `1` to enable the daily scheduled fan-out. Default unset = manual runs only.

## SpeakUp — Voice-to-Text + AI editing (internal team tool, folder: speakup)

**Purpose:** Private, login-only voice-to-text + AI editing app for the owner + team (a self-hosted SpeakApp.com work-alike). Record or upload audio, transcribe with OUR OWN engine, then one-tap **summarize, translate (50+ langs, auto-detect), or rewrite the tone**. Records meetings by capturing the user's own device audio in the browser — **no bot joins the call**. NOT a product: no public landing, no free web tool, no pricing, no FAQ. Mounted at `/speakup`. Spanish-first, bilingual ES/EN, emoji-free.

**Ownership:** transcription, auth, storage, hosting = 100% ours (no STT vendor, no per-minute fees, nothing leaves our servers). The ONLY external dependency is Claude for AI text editing (reuses `ANTHROPIC_API_KEY`). Everything degrades gracefully with no keys (stub STT + heuristic AI), so it runs on Render immediately.

**Location:** `verticals/speakup/` — self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`). Tables auto-create on boot via `sync({alter:false})`; canonical migration `verticals/speakup/migrations/20260721_speakup_tables.sql`. Multi-tenant (`tenant_id` = user id), `su_` prefix: `su_users, su_recordings, su_transcripts, su_summaries, su_translations, su_edits, su_usage`. New columns ensured via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `index.js` init.

**Live:** app `/speakup/` · login `/speakup/login` (login-only, no public signup; owner seeds team) · health `/speakup/health` · debug `/debug/speakup-error`. Installable PWA (manifest + sw.js; network-first, never caches `/api/`).

**STT engine (ours — on-device):** transcription runs in the BROWSER, no vendor, audio never leaves the device.
- **Live mic** = **Web Speech API** (instant, on-device).
- **Recorded calls + uploaded files** = **Whisper** via transformers.js (`Xenova/whisper-base`, q8) loaded from jsdelivr `+esm`, model weights from the HF CDN, cached after first use (~80MB, one time). Audio blob is decoded to 16kHz mono PCM in-browser (Web Audio `OfflineAudioContext`), transcribed locally, then only the TEXT is POSTed to `/recordings` (no audio upload). WebGPU when available, WASM fallback. A progress overlay shows model download % → "transcribing". No CSP blocks `/speakup` (only `frame-ancestors` on unrelated routes).
- **Record Call** (`startCall`): mixes `getUserMedia` (your mic) + `getDisplayMedia` (the call, via shared tab/screen) with Web Audio into ONE stream. Recorded in **~2.5-min rolling segments** (recorder rotates on a timer): each segment is transcribed on-device and the growing transcript is **autosaved** to the server after every chunk — so a 2-hour meeting uses FLAT memory (no giant single-blob decode) and nothing is lost if the tab/app/battery dies mid-call. macOS can't capture the *native* Zoom app's system audio via the browser (OS limit) — works with Zoom-in-a-browser-tab, Windows screen+system audio, or a virtual audio device.
- **Autosave + crash recovery**: live mic + call sessions create a `status:'recording'` row up front and PUT the transcript every chunk (mic every 12s; call every segment), mirrored to `localStorage['speakup_live']`. On boot, `recoverSessions()` finalizes any lingering `status:'recording'` rows (flushing the local tail first) so an interrupted recording reappears complete in the Library. Endpoints: `POST /recordings {status:'recording'}` (start), `PUT /recordings/:id/transcript` (idempotent replace), `PATCH /recordings/:id` (finalize status/title/duration).
- **Server fallback:** if in-browser decode/transcribe fails, the audio is uploaded to `src/services/stt.js` (server engine `SPEAKUP_STT_ENGINE`: `stub` default | self-hosted `whispercpp`/`vosk`), run OUT of the request cycle via `setImmediate` job + `GET /:id/status` poll. Stub returns an honest labelled placeholder (`is_simulated:true`), never a faked transcription.

**AI brain:** `src/services/ai-editor.js` reuses `ANTHROPIC_API_KEY` (`SPEAKUP_MODEL`, default Haiku). `summarize()` → `{summary, bullets[], action_items[]}`; `translate()` (never fabricated — no key returns original + notice); `rewrite()` (professional/concise/friendly/email/grammar/bullets + custom prompt, original always preserved). Zero-key heuristic fallback throughout.

**REST API (`/speakup/api/v1/*`):** auth `POST /auth/login|logout` + `GET /auth/me` · recordings `POST /recordings` (live mic text), `POST /recordings/upload` (multer→async STT), `POST /recordings/import` (file|url), `GET /recordings`, `GET /recordings/:id`, `POST /recordings/:id/transcribe`, `GET /recordings/:id/status`, `POST /recordings/:id/summarize`, `DELETE /recordings/:id`, `GET /recordings/:id/export?format=txt|md` · AI `POST /translate`, `POST /rewrite`.

**SIT:** `node verticals/speakup/sit.js` (from repo root) → 15/15, no external keys (STT stub + AI heuristic). Boots the router against the dev DB and exercises login→create→summarize→translate→rewrite→export→upload/poll→tenant-isolation→delete.

**Environment Variables:**
- `SPEAKUP_JWT_SECRET` — signs the `speakup_token` cookie (fallback `JWT_SECRET`), 30d. SET on prod.
- `SPEAKUP_MODEL` — Anthropic model for AI editing. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY`.
- `SPEAKUP_STT_ENGINE` — `stub` (default, zero-dep) | `webspeech` (browser live) | `whispercpp` (self-hosted binary) | `vosk` (self-hosted model). No SaaS providers.
- `SPEAKUP_STT_MODEL_PATH` — path to self-hosted weights (e.g. `models/ggml-base.bin` for whisper.cpp, or the Vosk model dir). Read when engine is `whispercpp`/`vosk`. Unset = stub/webspeech.
- `SPEAKUP_WHISPER_BIN` / `SPEAKUP_VOSK_BIN` — override the self-hosted binary name (default `whisper-cli` / `vosk-transcriber`).
- `SPEAKUP_TEAM_PASSWORD` — password for the seeded owner/team account(s) (`mstagg@digit2ai.com`). Default `Palindrome@7`. Force-synced on every boot for the accounts in `ACCOUNTS` (self-signup users are never touched); set this env var to override without a code change.
- `SPEAKUP_SEED_DEMO` — `1` seeds one tenant with a sample recording + transcript + AI summary on boot. Default unset = clean.

## AI Radar — capture AI discoveries from the phone share sheet (folder: airadar)

**Purpose:** The owner's personal log of AI products spotted while scrolling. See something AI-shaped on Instagram / Facebook / TikTok / X, hit Share, and it lands in an inbox with **company name, company website and a short description already drafted**; you correct whatever the draft got wrong and move on. Search, filter, rate and export the whole log later. Login-only, no public signup, no billing. Mounted at `/airadar`. English, emoji-free.

**Location:** `verticals/airadar/` — self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`). Tables auto-create on boot via `sync({alter:false})`; canonical migration `verticals/airadar/migrations/20260726_airadar_tables.sql`. Multi-tenant (`tenant_id` = user id), `ar_` prefix: `ar_users, ar_items, ar_enrichments`. New columns ensured via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `index.js` init.

**Live:** app `/airadar/` · login `/airadar/login` · share target `/airadar/share` · health `/airadar/health` · debug `/debug/airadar-error`. Installable PWA (manifest + sw.js; network-first, never caches `/api/`, never intercepts `/share`).

**IT IS A BUCKET, NOT A FORM.** The product this replaces is the owner's WhatsApp "Message yourself" chat: tap share, it is saved, back to scrolling. **Nothing blocks the save** — no form, no confirmation, no page fetch and no model call inside the request (`services/save.js` `saveLink()` inserts the row and returns; SIT asserts capture answers in well under 2.5s, typically ~70ms). Labelling happens **after** the response via `enrichLater()` fire-and-forget, which fills only fields that are still empty and flips `ar_items.enrich_status` `pending → done|failed`. The list shows "reading the link" on a pending row and quietly refreshes every 3s until nothing is pending. If enrichment fails the link is still saved — that is the whole contract. Do not reintroduce a capture-time form.

**Two ways in — because iOS has no Web Share Target:**
- **Android / desktop Chrome:** the manifest declares `share_target` → `GET /airadar/share`, which **saves server-side and redirects to `/airadar/?saved=<id>`** (toast + highlighted row). Only a share carrying no link at all falls through to the add sheet.
- **iPhone:** a one-time Shortcut POSTs to `POST /airadar/api/v1/capture?key=<capture_token>` — the only route outside the cookie gate, authenticated by the per-user `ar_users.capture_token` (rotatable from the app, unique-indexed). Saves silently without opening a browser. Same endpoint powers the desktop bookmarklet. The in-app **Setup** sheet renders the exact address, the Shortcut steps and a copy-to-clipboard bookmarklet.
- The list itself reads like a chat of saved links (thumbnail, headline, host, relative time, Open button). The headline degrades honestly: company name, else the post title, else the bare link — never a placeholder.

**AI auto-enrich** (`src/services/enrich.js` + `src/services/metadata.js`): fetches the shared page (dependency-free og:/twitter:/`<title>` parser, 9s timeout, private-IP ranges refused), then Claude Haiku drafts `{company_name, company_url, description, category, tags}`. **Honesty is enforced in code, not just the prompt:**
- `company_url` is validated against the candidate list — the model cannot return a URL that was not in the evidence, and a social host is never proposed as a company site.
- Login-walled reels return their own brand as the page title ("Instagram", "TikTok - Make Your Day"); that noise is scrubbed, so the draft comes back **blank with `needs_review:true`** and states why, rather than filing a company called "Instagram".
- No `ANTHROPIC_API_KEY` = the labelled heuristic path (`enriched_by:'heuristic'`, `is_simulated:true`), shown in the UI as a "no model" chip.
- Typing over any of the three core fields sets `enriched_by:'manual'`, clears `is_simulated` and clears the review flag — a human vouched for it. Re-enrich only ever fills fields that are still empty.
- Every draft is written to `ar_enrichments` with the page metadata actually fetched, so a suggestion can be re-read.

**REST API (`/airadar/api/v1/*`):** auth `POST /auth/login|logout`, `GET /auth/me` (returns the capture token), `POST /auth/rotate-capture-token` · items `GET /items` (q + status/category/platform/tag/needs_review filters), `POST /items` (opt `auto_enrich`), `GET /items/stats`, `GET /items/export?format=csv|json|md`, `GET|PATCH|DELETE /items/:id`, `POST /items/:id/enrich` (opt `apply`) · `POST /enrich` (draft, saves nothing) · `POST|GET /capture?key=` (token-authed).

**SIT:** `node verticals/airadar/sit.js` → **60/60** (auth gate, instant-save share target, capture latency ceiling, background labelling settling out of `pending`, second-hop provenance, platform detection, honesty flags, private-network refusal, search/filter/stats, capture + rotation invalidation, all three export formats, cross-tenant 404s). Zero external keys — runs green on the heuristic path.

**Environment Variables:**
- `AIRADAR_JWT_SECRET` — signs the `airadar_token` cookie (falls back to `JWT_SECRET`), 30d. SET on prod.
- `AIRADAR_MODEL` — Anthropic model for enrichment. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY`; unset key = labelled heuristic drafts (the app still works end to end).
- `AIRADAR_PASSWORD` — owner password force-synced on boot (falls back to `SPEAKUP_TEAM_PASSWORD`, default `Palindrome@7`).

## Executive English Coaching — Multi-tenant AI Coaching (folder: exec-coaching)

**Purpose:** Digit2AI vertical for **executive English coaching for international leadership** (trade, investment, diplomacy, press). Built from Fernando de la Espriella García's coaching program for Dr. Mauricio Gómez Amín (new Colombian Minister of Comercio, Industria y Turismo). A coach logs 1:1 sessions, records + transcribes (voice or typed), and the AI generates the program's **5 post-session deliverables** + an **"80% student speaks" meter**. Spanish-first, emoji-free. Mounted at `/coaching-english`.

**Multi-tenancy:** one coach = one tenant (`tenant_id = coach user id`); all students/sessions/reports isolated per coach. Academy-ready via `ec_students.coach_id` (a future `owner` role can hold multiple coaches under one tenant without migration). `ec_users.tenant_id` + newer `ec_sessions` columns ensured via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `index.js` init.

**Location:** `verticals/exec-coaching/` — self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`). Tables auto-create on boot via `sync({alter:false})`; canonical migration `verticals/exec-coaching/migrations/20260714_exec_coaching_tables.sql`. Multi-tenant (`tenant_id`), `ec_` prefix: `ec_users, ec_students, ec_sessions, ec_transcripts, ec_reports, ec_assignments`.

**Public domain — Speakly (speakly.vip):** the consumer-facing brand for this vertical is **Speakly**. Premium bilingual (ES default / EN toggle) marketing landing at `/speakly` (+ `/speakly/terms`, `/speakly/privacy`), modeled on Enverson/Leya AI. Login/Register CTAs wire to `/coaching-english/login` and `/coaching-english/start`. Custom-domain handler in `src/app.js` routes `speakly.vip` root/terms/privacy/login/register vanity paths (no-op until DNS points at the app). Landing + legal files live in `verticals/exec-coaching/public/speakly*.html`. Use "Speakly" in all marketing; "Executive English Coaching" is the internal/coach label.

**Live:** Speakly landing `/speakly` (public) · landing `/executive-english` (public, bilingual EN/ES, two paths) · coach dashboard `/coaching-english/` · coach signup/login · **student self-signup `/coaching-english/start`** · **student app `/coaching-english/learn`** · health `/coaching-english/health` · debug `/debug/exec-coaching-error`.

**Two tracks (v2):**
- **Coach track (v1):** log 1:1 sessions → AI 5-deliverable report + 80%-speaks meter (below).
- **Student self-serve (v2):** derived from Torna Idioma (reversed ES→EN, premium). 7-step typeform intake + placement quiz (+ optional AI-scored 30s spoken response) → **AI Curriculum Agent** (`services/curriculum-brain.js`, two-phase: compact outline then lazy per-module lesson content) generates a personalized modular program (ESP by occupation/industry, 80/20 vocab, micro-lessons). Modular learning: markdown lessons + vocab + AI-graded MC/fill assessment; pass unlocks next, fail → AI reinforcement, final → certificate. Pass threshold coach-configurable (default 80%). Tables: `ec_intake_profiles, ec_curricula, ec_modules, ec_assessments, ec_assessment_attempts`. Routes: `intake`, `learning`.
- **Coach KB (v2):** coach uploads teaching materials (`ec_kb_documents`, route `kb`) that steer the curriculum agent to teach the coach's way (white-label). Coach linking code = coach tenant id (students enter it at signup to join that coach's tenant+KB). Supervision view lists self-serve students + progress + stuck flags. Role-aware gate: students→/learn, coaches→dashboard.

**AI brain:** `src/services/coach-brain.js` reuses `ANTHROPIC_API_KEY` (Claude Haiku). `finalizeSession(turns, ctx)` returns `{subject, summary, fortalezas[], aspectos_mejorar[], expresiones[], vocabulario[], ejercicio, correcciones[]}` — the 5 deliverables from the program's SEGUIMIENTO section. `suggestAssignments(report, ctx)` proposes "entre sesiones" tasks. `guidance(...)` answers coach questions. Zero-key **heuristic fallback** if no API key. The **80%-student-speaks meter** is deterministic (transcript word counts in the route, not the LLM).

**Capture:** browser Web Speech API (`en-US`) live voice AND typed input both POST to `/sessions/:id/turn` — one pipeline. "Finalize" runs the AI report + locks speaking %; report shown with per-section deliverables, PDF (print) + Email (mailto) buttons.

**REST API (`/coaching-english/api/v1/*`):**
- Auth: `POST /auth/signup|login|logout` · `GET /auth/me`
- Students: `GET|POST /students` · `GET|PATCH|DELETE /students/:id`
- Sessions: `POST /sessions` · `GET /sessions` (opt `?student_id=`) · `GET /sessions/:id` · `POST /sessions/:id/turn` · `POST /sessions/:id/finalize` · `GET /sessions/:id/report` · `POST /sessions/:id/suggest-assignments` · `POST /sessions/:id/guidance`
- Assignments: `GET|POST /assignments` · `PATCH|DELETE /assignments/:id`

**Environment Variables:**
- `EXEC_COACHING_JWT_SECRET` — signs the `exec_coaching_token` cookie (fallback `JWT_SECRET`), 30d. SET on prod.
- `EXEC_COACHING_MODEL` — Anthropic model for report + guidance. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY`.
- `EXEC_COACHING_DEFAULT_PASSWORD` — seeded password for the two default accounts (fernandodelae@gmail.com coach, mstagg@digit2ai.com owner). Default `exec@2026`. Regular coaches self-signup.
- `EXEC_COACHING_SEED_DEMO` — `1` seeds Fernando's tenant with the Minister as a student + one finalized sample session on boot. Default unset = clean.
- (v2 student self-serve reuses `ANTHROPIC_API_KEY` + `EXEC_COACHING_MODEL` for the AI Curriculum Agent — no new keys.)

## Projects Hub — Client 15 Command Center (`/projects`)

The Digit2AI Projects Hub doubles as the owner's (client 15) single command center, surfacing RinglyPro CRM data alongside projects. Glue lives in `src/routes/projects-bridge.js` (mounted `/api/projects-bridge`, hard-scoped to `D2AI_CLIENT_ID = 15`, runs on the main CRM sequelize).

- **Lina → Projects calendar**: client-15 carve-out in `src/routes/elevenlabs-tools.js` books into `d2_calendar_events` (not the CRM `appointments` table). Availability/conflict checks honor 9–19h, 30-min slots, weekdays.
- **Calls & Messages**: `GET /call-stats` (calls today, follow-ups pending, unread messages), `GET /messages` (inbound feed from the `messages` table, unread-first), `POST /messages/:id/read` + `/messages/read-all`. Embedded view: `public/projects-messages.html`. Hub shows a Messages nav badge + Home KPIs.
- **Neural KPIs**: `GET /neural` proxies the CRM `/api/neural/dashboard/15` server-side (admin key hidden). Rendered as a KPI panel on the Hub home.
- **Email reconciliation** (multi-account unified inbox): `email_accounts` table (auto-created), app passwords AES-256-GCM encrypted. Service `src/services/emailReconcile.js` (IMAP via `imapflow`, 60s cache). JWT-gated endpoints (client-15 token): `GET /email-stats`, `GET /emails`, `GET/POST/DELETE /email-accounts`. Embedded view `public/projects-emails.html` with an Add-account flow (provider presets: iCloud/Gmail/365/Network Solutions/Yahoo). Hub shows an Email nav badge.
- **SSO**: the Hub logs in via the CRM `/api/auth/login`; its JWT is mirrored to `localStorage['token']` so embedded CRM screens (and the RinglyPro nav group) don't re-prompt.

**Environment Variables:**
- `EMAIL_CRED_SECRET` — secret used to derive the AES-256-GCM key that encrypts stored IMAP app passwords + Gmail OAuth tokens in `email_accounts`. Falls back to `JWT_SECRET`. SET THIS on prod so credentials aren't encrypted under a guessable default.
- `GMAIL_OAUTH_REDIRECT_URI` — OAuth redirect for the password-free Gmail connect flow. Default `https://aiagent.ringlypro.com/api/projects-bridge/email-oauth/google/callback`. Must be added as an Authorized redirect URI on the `GOOGLE_CLIENT_ID` OAuth client, and `gmail.readonly` added to the consent screen (owner added as a test user while the app is in Testing). Reuses the existing `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (also used by Calendar OAuth).

**Data Flow:**
PLC / Sensor → n8n → POST /api/oee/webhooks/machine-event → machine_events table
MCP Tool Call → POST /api/oee/tools/call → OEE route handler → PostgreSQL → response

## AgroMercadoDigital — National Agro Marketplace (Venezuela)

**Purpose:** Digital marketplace for Venezuela's agricultural sector (semovientes, maquinaria, insumos, subastas en vivo, divisas BCV). **Developed by ISTC (Ingeniería y Servicios Tecnológicos Colón)** — owns/registered the AgroMercado platform; **AI layer by Digit2AI**. Product for Grupo Agrollano = **AgrollanoDigital** (white-label of AgroMercado, a separate `tenant_id`). The alliance is **ISTC × Digit2AI** (never "AgroMercado × Digit2AI"). See `project_agrollano_istc` memory.

**Location:** `verticals/agromercado/` — self-contained Express Router (own Sequelize via `src/db.js` using `CRM_DATABASE_URL || DATABASE_URL`). Tables auto-create on boot via `sync({alter:false})`; canonical migration at `verticals/agromercado/migrations/20260610_agromercado_tables.sql`. All tables multi-tenant (`tenant_id`), `am_` prefix: users, products, auctions, bids, fx_rates, kyc, directory, farms, service_requests. Built from ISTC tech-spec v1.0.1.

**Live:** dashboard `/agromercado/` (admin/ops, full-bleed Spanish) · health `/agromercado/health` · debug `/debug/agromercado-error`. Public storefront stays on ISTC's Vercel app (https://agromercado-vzla.vercel.app). Board teaser: `public/agromercado-teaser.html` (GHL digit2ai.com/agromercado).

**REST API (`/agromercado/api/v1/*`):**
- `auth`: `POST /auth/register|login|logout`, `GET /auth/me`, `POST /auth/verify` (KYC submit). Roles admin|producer|buyer, JWT in HttpOnly+Secure cookie `agromercado_token`.
- `products`: `GET /products/categories` (8 cats + counts), `GET /products`, `GET /products/:id`, `POST /products` (verified producer), `PATCH /products/:id`. JSONB `metadata` + GIN index.
- `subastas`: `GET /subastas`, `GET /subastas/:id` (computes next min bid), `GET /subastas/:id/stream` (SSE live bids), `POST /subastas/:id/puja` (ACID row-locked), `POST /subastas` + `PATCH /subastas/:id/cerrar` (admin), `GET /subastas/reglamento`. Min-bid: `P_min = P_actual + Δ_base × (1 + ln(Count_pujas + 1))` in `src/utils/bid.js`.
- `divisas`: `GET /divisas/rates`, `GET /divisas/convert?usd=&rate=bcv|parallel`. Poller fires 09:00 & 13:00 (`src/services/fxPoller.js`); parallel fallback = official + 40% when source down.
- `services`: KYC review (`GET/PATCH /services/kyc`), directory (`GET/POST /services/directory`), farms (`GET/POST /services/farms`), financing/logistics leads (`POST/GET /services/request`).
- `ai` (Digit2AI layer): `GET /ai/market-trends`, `GET /ai/auction-trail/:id`, `GET /ai/fraud-flags` (admin), `GET /ai/monitor` (dashboard stats).

**Environment Variables:**
- `AGROMERCADO_JWT_SECRET` — signs the `agromercado_token` cookie (fallback `JWT_SECRET`). SET on prod.
- `AGROMERCADO_WHATSAPP_TOKEN` / `AGROMERCADO_WHATSAPP_PHONE_ID` — WhatsApp Cloud API for bid/auction/KYC alerts. Unset = log-only (no send), same disabled-by-default safety as `EMAIL_AUTOSEND_DISABLED`.
- `AGROMERCADO_FX_SOURCE_URL` — JSON endpoint for BCV/parallel rates. Unset = poller uses cache fallback only (no live fetch).
- `AGROMERCADO_SEED_DEMO` — `1` seeds one tenant with sample categories/products/auctions/FX/directory on boot (idempotent). Default unset = no seed.

**Data Flow:**
Browser → /agromercado/api/v1/* (Express Router) → Sequelize → PostgreSQL (am_* tables)
FX poller (09:00/13:00) → AGROMERCADO_FX_SOURCE_URL → am_fx_rates ← /divisas/convert
Bid POST → ACID txn (row-lock auction) → recompute P_min (ln formula) → am_bids → SSE broadcast to lot subscribers

## Chamber public member directory (external embeds: WordPress, GHL, any CMS)

**Purpose:** let an external site publish a chamber's member directory without exposing PII or requiring login. Built for `cv-105` (Hispanotec, whose marketing site is the WordPress/`/hispatec/` surface); works for any `cv-*`/`vc-*` slug.

**Opt-in per chamber — this is the safety boundary.** The endpoints 403 unless the `chambers` row has `theme_config.public_directory = true`. Enabled today on **cv-105 only**; cv-1/cv-2/cv-3 and the rest stay private with no code change. Enable another with:
```sql
UPDATE chambers SET theme_config = COALESCE(theme_config,'{}'::jsonb) || '{"public_directory": true}'::jsonb WHERE slug = 'cv-XXX';
```
(`chamber-resolver` caches 60s, so it takes effect within a minute.)

**Endpoints** (unauthenticated, `Cache-Control: public, max-age=300`), in `src/routes/unified-chamber/core.js` immediately after `/public/info`:
- `GET /:slug/api/public/members` — active members. Params `page`, `limit` (capped 100), `search`, `sector`, `country`.
- `GET /:slug/api/public/members/facets` — distinct sectors + countries with counts, for filter dropdowns.

**PRIVACY BOUNDARY — do not widen the SELECT.** The public projection deliberately omits `email`, `phone`, `password_hash`, `access_level`, `stripe_customer_id`, `company_registration_id`. Public `search` also omits email so the endpoint can't be used to confirm whether an address is a member. Emails stay behind `authMiddleware` on `GET /members`. Adding a column to that SELECT publishes it to the open internet.

**Embeds** (`public/embed/`, served by the existing `express.static`):
- `chamber-directory.js` — dependency-free widget. `<div data-cv-directory data-slug="cv-105"></div>` + one script tag. Search, sector filter, cards, pagination, dark mode, ES/EN. Renders only `http(s)` links (a stored `javascript:` URL can never become a clickable anchor on a customer's site).
- `wordpress-shortcode.php.txt` — `[cv_directory slug="cv-105"]`. Server-rendered via `wp_remote_get` + WP transient cache, so the members land in the HTML Google indexes (the JS widget does not). Preferred when SEO matters.
- `index.html` — integration guide at `/embed/` with copy buttons and a live preview.

CORS is already open globally (`app.use(cors())` in `src/app.js`), so cross-origin fetch from any WordPress host works with no per-domain allowlist.

## Chamber ↔ WordPress member sync (pull or push)

**Purpose:** two-way integration between a chamber and a WordPress site, with an explicit choice of who is the system of record. `theme_config.wp_sync.direction` is **`pull`** (WordPress owns members, CamaraVirtual follows) **or `push`** (CamaraVirtual owns members, WordPress follows) — never both. Running both is an echo loop (CV writes → WP fires `profile_update` → webhook writes back to CV → …), so `/wp/sync` refuses in push mode, `/wp/push` refuses in pull mode, the inbound webhook 409s in push mode, and the companion plugin suppresses its own outbound webhook while applying a CV write. This is separate from the read-only directory above, which involves no member records at all.

- **Engine:** `src/services/chamberWpSync.js` · **Routes:** `src/routes/unified-chamber/wp.js`, mounted at `/:slug/api/wp/*` (before `core.js` in `unified-chamber/index.js`).
- **Companion WP plugin:** `public/embed/wordpress-sor-plugin.php.txt` — signed roster endpoint `/wp-json/camaravirtual/v1/members`, push on `user_register`/`profile_update`/`delete_user`, `[cv_login]` SSO shortcode, settings screen, `cv_sor_member` filter for mapping MemberPress/PMPro/WooCommerce/ACF fields.
- **Guide:** `/embed/` (second half of the page).

**FIELD OWNERSHIP is the design.** `WP_OWNED_FIELDS` is the only set a sync may write: first/last name, company, phone, country, sector, sub_specialty, years_experience, languages, bio, linkedin, website, membership_type. **`access_level` and `governance_role` are deliberately NOT syncable** — a compromised or misconfigured WordPress must never be able to mint a chamber superadmin. `trust_score`, `verified`, `verification_level`, `region_id` and Stripe ids are equally untouched. Widening that list is a privilege-escalation change, not a feature.

**Other invariants (all covered by SIT):**
- **Never hard-deletes.** A member absent from WordPress goes `status='inactive'` — they author projects, RFQs and messages, so the row and its audit trail stay.
- **`deactivate_missing` defaults OFF**, and even when on it skips chamber admins and `chambers.owner_member_id`, so a bad sync can't lock out whoever would have to fix it.
- **Dry run first.** `POST /wp/sync {"dry_run":true}` returns the full plan and writes nothing.
- **Matching** is by WordPress id via `chamber_wp_links` (falling back to email), so an upstream email change renames the member instead of creating a duplicate.
- **Synced members get an unusable random `password_hash`** (the column is NOT NULL) — they enter via SSO or the existing forgot-password flow, never a guessable default.

**Endpoints:** admin (Bearer + chamber admin) `GET|PUT /wp/config`, `POST /wp/test`, `POST /wp/sync`, `GET /wp/runs`. Machine (HMAC-authed, no session) `POST /wp/webhook`, `GET /wp/sso`. The webhook signs `timestamp + "." + event + "." + email` — a canonical field string, NOT the raw body, because Express has consumed the stream before a router sees it and JSON key order isn't stable. SSO tokens are single-use (nonce), expire in 5 min, and the redirect is forced same-site so a fresh session JWT can't be bounced off-site.

**Tables** (created on demand, no migration step, additive — `members` DDL untouched): `chamber_wp_links` (provenance, unique per chamber+member and chamber+external_id), `chamber_wp_sync_runs` (audit).

**Config** lives in `chambers.theme_config.wp_sync`; `shared_secret` / `auth_secret` are AES-256-GCM encrypted at rest and returned only as `{set, hint}`. Sending a blank secret keeps the stored one. `mode: 'plugin'` (companion plugin, full fields) or `'wp_users'` (core REST API + Application Password, zero install, but no company/sector/phone).

**SIT:** `node scripts/test-chamber-wp-sync.js` → **74/74**. Spins a fake WordPress plus a throwaway chamber (`cv-99001`, created and dropped by the script — it never touches cv-105) and covers field ownership, privilege-escalation attempts, email renames, soft deactivation, admin protection, webhook signature/replay/staleness, and SSO forge/replay/expiry/open-redirect. Zero external keys.

**Environment Variables:**
- `CHAMBER_WP_SECRET` — key material for encrypting the per-chamber WordPress credentials. Falls back to `CHAMBER_JWT_SECRET` then `JWT_SECRET`. SET on prod: rotating it makes stored secrets undecryptable (re-enter them), and leaving it default means credentials are encrypted under a guessable key.

### Push direction (CamaraVirtual as System of Record)
`pushChamber()` writes the chamber's active members into WordPress as **real WP users** (profile in user meta), for sites that need member accounts — private area, comments, WooCommerce, restricted content. `POST /:slug/api/wp/push` (admin, `{dry_run:true}` plans only). Requires `mode:'plugin'`; the core `wp/v2/users` API cannot carry company/sector/phone.

- **Diff, not overwrite.** It reads the current WordPress roster first and sends only changed members; a second push in a row issues zero requests.
- **The chamber grants no WordPress privilege.** The payload never contains a role or capability — the site decides via `cv_sor_default_role` (defaults to WordPress's own default role). Exact counterpart of the inverse rule: WordPress can't set `access_level` inside the chamber, the chamber can't set a role on the site.
- **No deletes.** With `push_deactivate_missing` on (default off), a WP user with no matching active member has its **roles removed**, keeping authorship of posts, comments and orders.
- **Partial failure is isolated.** One record failing WordPress validation doesn't abandon the roster; failures come back in `errors[]` and `failed`.
- Companion plugin gained `POST /wp-json/camaravirtual/v1/members` (HMAC over `ts.event.email`) plus `$GLOBALS['cv_sor_applying']` loop suppression.

**Picking a scenario:** WordPress only *displays* members → the embed widget / `[cv_directory]` (no member records move). Signups and payments already happen in WordPress → `direction:'pull'`. Signups happen in the chamber and members need site accounts → `direction:'push'`.
