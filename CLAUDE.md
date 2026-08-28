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

## Voice on the WEB: the own-stack orb (replaced ElevenLabs ConvAI everywhere)

Every browser voice surface in the repo used to embed `<elevenlabs-convai>` — a hosted agent per product, configured by hand in their dashboard, billed per conversation minute. That is gone. The three layers ElevenLabs bundled are now unbundled and ours:

| Layer | What runs it | Cost |
|---|---|---|
| **Ear** (STT) | Web Speech API, on-device in the browser | $0 |
| **Brain** (LLM) | `POST /api/voice-agent/chat` — Claude Haiku (`src/routes/voice-agent.js`) | Haiku tokens |
| **Voice** (TTS) | `POST /api/tts/edge` — Microsoft Edge neural (`src/services/edge-tts.js`) | $0 |

**THE AGENT'S FACTS COME FROM THE PAGE, NOT FROM A PROMPT.** `src/config/voice-agents.js` holds ONLY personas (name, Edge voice, greeting, standing rules) — deliberately no product facts. The orb extracts the visible text of the page it sits on and posts it as `context` every turn; the system prompt forbids answering from anything else. Consequences to preserve: editing a landing page updates its voice agent with no redeploy and no dashboard; the agent cannot quote a price or metric the page never printed; and adding the orb to a new page needs zero server-side knowledge authoring. With no `ANTHROPIC_API_KEY` it degrades to an extractive answer pulled from the page text (`source:'heuristic'`), never a fabrication.

**Drop-in usage** (`public/embed/voice-orb.js`, dependency-free, no build step):
```html
<div data-voice-orb data-agent="camaravirtual" data-lang="es" data-label="Hablar con Lily"></div>
<script src="/embed/voice-orb.js" defer></script>
```
Attributes: `data-agent` (persona id) · `data-lang` es|en · `data-voice` (Edge alias override) · `data-position` bottom-right|bottom-left · `data-accent` · `data-label` · `data-api` (origin, for cross-host embeds — otherwise inferred from the script's own src, so GHL/WordPress iframes work). SPAs push structured context with `window.D2AIVoiceOrb.setContext(str)` (`null` = back to reading the page) — that is how the Intuitive deck binds per-slide numbers.

**Personas shipped:** `camaravirtual` (Lily) · `pacccfl` · `pcci` · `neural` / `mcp-copilot` (Rachel/Lina) · `rachel` · `lina` · `ronin` · `surgicalmind` · `veritas` · `visionarium` · `gebhardt` · `digit2ai` (generic fallback for any page with no pack of its own — an unknown id resolves here rather than erroring).

**Endpoints:** `GET /api/voice-agent/config?agent=&lang=` (boot payload: name, voice, greeting — never leaks the prompt) · `POST /api/voice-agent/chat` · `GET /api/voice-agent/health`.

**`/api/tts/generate` is now a legacy ALIAS served by the Edge engine.** Every narrated presentation posts there, so the endpoint itself was moved rather than editing each page and missing one: same body, same `audio/mpeg`, no `ELEVENLABS_API_KEY`. Legacy voice names map through (`rachel`→`ava`, `bella`/`lina`/`ana`→`lina`). `TTS_LEGACY_ELEVENLABS=1` restores the paid path.

**Pre-rendered narration MP3s were regenerated on the Edge engine**, and their generator scripts no longer need a key: `generate-hispamind-audio.js` (16 tracks; Spanish text also gained proper tildes — Edge uses them for stress, so "Analitica" was being mis-stressed), `generate-delima-audio.js`, `generate-digit2ai-es-audio.js`, `generate-rachel-banking-audio.js`, `generate-virtualchamber-audio.js`. All take `--force`. `verticals/intuitive/src/routes/proposal.js` also moved off ElevenLabs — that kills a real landmine, since `proposal-audio/` sits on Render's ephemeral disk and every redeploy used to re-bill a full 11-slide deck regeneration. Same for `src/services/voicemailAudioService.js` (Lina's outbound voicemail greetings, now `VOICEMAIL_VOICE`, default `es-MX-DaliaNeural`).

**STILL ON ELEVENLABS (deliberately, not an oversight):** the Twilio *phone* agents in `verticals/{freight_broker,msk_intelligence,imprint_iq,torna_idioma,cw_carriers}/**/voice.js`. Those are real-time telephony, not a web widget — their replacement path is the ConversationRelay stack documented below, and swapping them needs a live call test per vertical.

**Environment Variables:**
- `VOICE_AGENT_MODEL` — Anthropic model for the orb's brain. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY`; unset key = labelled extractive answers, the orb still works end to end.
- `TTS_LEGACY_ELEVENLABS` — `1` sends `/api/tts/generate` back to api.elevenlabs.io (needs `ELEVENLABS_API_KEY`). Unset = Edge neural, $0.
- `VOICEMAIL_VOICE` (`es-MX-DaliaNeural`) · `INTUITIVE_VOICE` (`en-US-AvaNeural`) · `NARRATION_VOICE` / `NARRATION_RATE` (generator scripts).

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

## AI Agent Prompt Builder — one box, then paste into VS Code

Self-contained sub-app auto-mounted at `/ai-agent-prompt-builder-for-data-writing` (from `client-builds/ai-agent-prompt-builder-for-data-writing/`). **You describe an agent in one paragraph — typed or dictated — and get back a complete JSON spec plus the exact `/ringlypro-architect` command to paste into VS Code.** It replaced a four-step wizard: almost everyone describing an agent already says everything the wizard asked for, just in prose, so the model transposes the prose into the fields instead of making a person be a prompt engineer.

**IT AUTHORS PROMPTS AND NEVER EXECUTES ONE.** `lib/compose.js` is the only file that reaches a model, and it uses it to *write the spec*; nothing here ever sends the assembled payload or its `system_prompt` anywhere. SIT asserts that file by file (exactly one SDK importer, and it never references `system_prompt`) — the deliverable is the JSON the user takes to their own tool.

- **Pages:** `/` the one box (`#one-box`) · `/advanced` the field-by-field editor — the escape hatch for fixing a field, **do not promote it back to `/`** · `/gallery` six seeded templates.
- **API:** `POST /api/v1/agents/compose` `{text, lang}` → `{definition, payload, command, assumptions, clarifications, unverified, composed_by, is_simulated}` (public, rate-limited, persists nothing) · `POST /api/v1/agents/generate` pure assembly, no model · `POST/GET/PUT/DELETE /api/v1/agents` JWT, tenant-scoped · `GET /health` names the model actually composing.
- **HONESTY IS ENFORCED IN CODE, NOT IN THE PROMPT.** Every identifier-shaped token the spec introduces (`orders_2024.csv`, `/v1/ingest`, `<source table>`) is checked against what the user actually typed; anything absent comes back in `unverified[]` and renders **above** the artifact under "Confirm before you build". A spec handed to a build agent with an invented table name reading as fact is the failure this exists to prevent. Separator-only differences (`invoice number` → `invoice_number`) do not count as unverified, or the real finds drown in noise.
- **The zero-key path is a real product, not a stub.** With no `ANTHROPIC_API_KEY` the composer assembles a usable definition from the user's own sentences and labels itself `composed_by:'heuristic'` / `is_simulated:true` on the payload, in the status pill and under the buttons. Never a silent fake.
- **`architectCommand()` lives in the pure `promptBuilder.js`**, shipped verbatim to the browser like `buildPrompt`, so the box, the advanced editor and any API caller assemble the identical command. A payload in a clipboard is not yet something an operator can run — the command is the deliverable.
- **Dictation is the Web Speech API, on-device** (same "ear" as the voice orb): no key, no audio upload, unmistakable listening state, disables itself with an explanation where unsupported. Typing is the primary input; nothing is gated behind the mic.
- **SIT:** `node client-builds/ai-agent-prompt-builder-for-data-writing/sit.js` → **129/129**, zero external keys — it unsets `ANTHROPIC_API_KEY` before requiring the app and says so, so the suite is free and offline and the keyless fallback is the one under test. Consequence: the model path is only verifiable against production (`GET /health` → `composer`).

**Environment Variables:**
- `APB_MODEL` — model that authors specs. Default **`claude-opus-5`**, deliberately not the Haiku the rest of the repo uses: this is a handful of one-shot calls a day and the quality of that one call is the entire product (~1.2k output tokens/compose). Set `claude-sonnet-5` or `claude-haiku-4-5-20251001` to trade quality for cost with no redeploy.
- `APB_COMPOSE_PER_HOUR` (30) — per-caller ceiling on `/compose`. The endpoint is ungated because it persists nothing, so this plus the 8,000-char input cap in `lib/compose.js` are what stand between a loop and a bill.
- Reuses `ANTHROPIC_API_KEY`, `DATABASE_URL`, `JWT_SECRET`.

## Modo Noche — Aplicación de Sueño con Música Personalizada

Self-contained sub-app auto-mounted at `/aplicacion-de-sueno-con-musica-personali` (from `client-builds/aplicacion-de-sueno-con-musica-personali/`). A web bedtime player, 52 tracks in two families: pick a track, set a shutdown timer (default 60 min), tap "Iniciar noche" — the loop plays through an HTML5 `<audio>` element, fades over the final 5 minutes via a Web Audio `GainNode`, and stops on its own at expiry. Spanish default UI, `?lang=en` for English (substituted **server-side**, so the `<h1>` is correct in the delivered HTML). No login, no PII. Installable to the iPhone home screen (PWA).

- **Pages:** `/` player · `/history` (alias `/historial`) session history + favourites.
- **API:** `GET /health` · `GET /api/v1/tracks` (public, 52 tracks with family+category, `?lang=en`) · `GET /api/v1/tracks/meta` (families, categories, frequency + originality disclaimers) · `POST|GET /api/v1/sessions` · `GET /api/v1/sessions/favourites`.
- **TWO FAMILIES (the top-level taxonomy).** `data/tracks.json` carries `families` -> `categories` -> tracks; the API returns `family`/`family_label` + `category`/`category_label` per track, and the player shows a family switch first, then optgroups by category (a flat list of 52 is unusable on a phone). **Family 1 `ondas` = Música de ondas (Wave Music)** = the original 25. **Family 2 `instrumental` = Música instrumental** = 27 new: handpan-metal (handpan Kurd, tambor de lengua, gongs, kalimba, dulcimer) · viento-flautas (quena, zampoña, flauta nativa americana, shakuhachi, bansuri alap, silbato irlandés) · cuerdas (guitarra española, arpa celta, cello, guqin, koto) · piano-atmosferico (piano de fieltro, piano lento, ambiente lento) · mundo (gamelan, ney, zanfona, marimba+vibráfono, oud, duduk) · naturaleza-instrumentos (campanas de viento, handpan y lluvia).
- **INSTRUMENTAL IS SYNTHESIZED, NOT SAMPLED.** `tools/lib-instruments.js` = five engines (Karplus-Strong pluck, struck partial stack, blown tube, bowed sustain, piano with string inharmonicity) + a performance renderer whose notes move by a **random walk** over the scale (uniform random sounds like a wind chime, not a melody). Artist names in the brief were a timbre/tempo reference ONLY — **no artist or album name may appear in shipped copy, and SIT fails the build if one does** (whole-word matched, since a substring test flags "eno" inside "menor"). `piano-lento` is "in the manner of the gymnopédies" with an ORIGINAL melody, never a transcription.
- **ONE LISTENING LEVEL.** Peak normalisation alone left a **17.2 LUFS** spread (a plucked guqin peaks like a flute but averages 16 dB quieter), so `lib-dsp.js` runs a two-pass EBU R128 match to **-19 LUFS** on the RAW PCM before the single MP3 encode (no generation loss), `linear=true` so each track keeps its own dynamics. Now **2.1 LUFS** spread, no clipping — asserted by `tools/verify-loudness.js` in SIT. Regenerating audio without this pass is a regression.
- **Wave family — 25 tracks, 8 categories:** naturaleza (lluvia, selva tropical, viento) · playa y agua (olas del mar = open swell, olas de playa = shore break, cascada con aves) · meditación (cuencos tibetanos, cuenco de cristal y lluvia) · música de la naturaleza (nocturno suave, amazonas) · **ondas cerebrales** (delta 2,5 / theta 5,5 / alfa 10 / beta 16 / gamma 40 Hz) · **frecuencias y propósito** (396 estrés, 174+285 bienestar, 528, 432+639 abundancia, 741 claridad, 852 intuición, 963 paz, enfoque profundo) · respiración (4-7-8) · ruido marrón.
- **THE AUDIO IS OURS — do not swap it for a CDN link.** Every third-party ambient URL evaluated was seconds long, ogg/oga (Safari can't decode), or unclear-licence. Two generators (`tools/generate-audio.js` wave, `tools/generate-instrumental.js` instrumental) share one DSP floor (`tools/lib-dsp.js`) and synthesize all 52 seamless loops into `public/audio/` (34 MB). Royalty-free, same-origin, nothing to 404 at bedtime. ffmpeg is a **build-time** dependency only. Noise loops are seamless via a tail-over-head crossfade; tonal and event tracks wrap exactly by construction (integer cycle counts; bowl strikes, bird calls and wave crashes written **modulo** the buffer).
- **FREQUENCIES ARE Hz, NOT MEGAHERTZ, AND THE COPY MAKES NO CLAIMS.** Brainwave bands: delta 0,5-4 · theta 4-8 · alfa 8-12 · beta 12-30 · gamma 30-100 Hz. Each track is a real **binaural beat** (carrier in one ear, carrier+beat in the other) so all carry `stereo_required`. `tools/verify-binaural.js` decodes every such MP3 and runs a **Goertzel filter per channel** to prove each ear holds the advertised tone — wired into SIT, and skipped LOUDLY (named in the summary) where ffmpeg is absent. Descriptions state what a track IS, never an outcome; `frequency_disclaimer` renders in the UI under any frequency track (not a medical/psychological treatment, no health or financial promise), and `abundancia` explicitly disowns any financial result. Alerting tracks (beta, gamma, 741, enfoque) carry `not_for_sleep`. **SIT fails the build if a curative or guarantee claim appears in any description — keep it that way.**
- **PWA install:** `public/logo-master.svg` is the single source for the mark — **full-bleed square on purpose** (iOS rounds `apple-touch-icon` itself; a pre-rounded source gets double-rounded) with all content inside the central 80% so it doubles as a `maskable` icon. `sips -s format png -Z <n> logo-master.svg --out <file>` produces `apple-touch-icon.png` (180) / `icon-192` / `icon-512` / `favicon-32`; `favicon.svg` is a simplified rounded variant for tabs. `sw.js` caches the shell + audio (cache-first, immutable) and **never** `/api/`; bump `CACHE` when shell files change.
- **The timer ends the night, not the fade.** The fade is cosmetic; the hard stop is the countdown. On iOS `HTMLMediaElement.volume` is read-only so the `GainNode` is the only real fade path — if the AudioContext can't be created it falls back to a linear `element.volume` ramp, and the night still terminates. The player resumes an OS-suspended context on `visibilitychange` and logs via `fetch(keepalive:true)` on `pagehide` so a closed tab still records.
- **Postgres primary, memory safety net.** `models/index.js` connects lazily and never fatally: no `DATABASE_URL` or a failed handshake degrades the session store to an in-memory `Map` behind an identical interface, so `/health` and the whole player stay up (`/health` reports which backend is live). Table `aplicacion_de_sueno_con_musica_personali_sessions`, `tenant_id NOT NULL` + `(tenant_id)` and `(tenant_id, anon_token)` indexes, applied idempotently on boot; canonical DDL in `migrations/001_create_sessions.sql`.
- **Privacy.** Row owner is the client-generated `x-anon-token` UUID (localStorage) — never a name/email/phone. Truncated to 8 chars before any `console.log`. Reads filter on **both** `tenant_id` and `anon_token`, so one device can never see another's history. Writes validate payload shape and 400 on malformed bodies.
- **SIT:** `node -e "require('dotenv').config();require('./client-builds/aplicacion-de-sueno-con-musica-personali/sit.js')"` → **135/135** (133 + 2 skipped without ffmpeg), green on both backends (it awaits the store settle instead of racing it, and deletes its own `sit-token-%` rows afterwards). Zero external keys.

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

## CV Talent Engine v2 — a job-search operating system for N profiles (not one person's tool)

**Purpose:** the personal CV domains (manuelstagg.com, anastagg.com, andreastagg.com, julianagramowski.com) run a shared engine that finds real US jobs, targets named employers, tracks every application, and makes each person findable by recruiters and their AI. Phases 1-3 (discovery, agent/MCP surface, outreach drafting) shipped earlier; **Phases 4-8 turn it into a PLATFORM.**

**THE RULE THAT GOVERNS THE WHOLE ENGINE: nothing about a person may live in code.** No hardcoded slug, role, country, employer or biographical fact in engine logic. Adding a fifth person is data entry — create the profile, attach a résumé, optionally map a domain. Zero code edits, zero redeploys, **zero new env vars per person**. SIT provisions a throwaway profile end to end to prove it.

### Shared vs per-profile (a deliberate split, not an accident)
| Shared infrastructure | Per profile, strictly isolated |
|---|---|
| `cv_jobs` pool, `cv_employers` connector registry, source health, scoring machinery | `cv_profile_settings`, watchlists, matches, saved searches, pipeline, opportunities, outreach, contacts, identity facts |

One profile can never see another's data, and a targeting change for one provably does not move another's matches.

### Phase 4 — settings are the single source of truth
- `src/services/cv-settings.js` — `cv_profile_settings(profile_id, settings JSONB)`, seeded from the existing profile row on first read so no owner breaks. A JSONB document, so adding a setting is not a migration.
- **Honesty encoded in code, not prompts:** `approval_required` is TRUE and `sanitize()` forces it back on every save — nothing sends unreviewed. Contact details, compensation, work authorization and clearance are **PRIVATE by default**; the owner opts in. `employerBlocked()` / `contactBlocked()` are absolute and checked at match, alert AND draft time.
- Work authorization, compensation and availability are **owner-entered facts** quoted VERBATIM in drafts, or omitted entirely — never paraphrased, never guessed. `outreachFacts()` returns only what the owner typed.
- `src/services/cv-geo.js` — country policy with an explicit, overridable rule for every messy ATS location shape: `Remote - US`, `Remote (US only)`, `Remote - North America`, `Remote - Global`, multi-location, hybrid-with-office, and no location at all (`flag` by default, not silent inclusion). Manuel is US-only; the other three are unrestricted unless their own settings say otherwise.
- **Credentials moved off `CV_ADMIN_PW_<SLUG>`** (an env var per person does not scale and blocks self-onboarding). Passwords are profile-owned in the DB; new profiles are provisioned by single-use **invite** (`POST /admin/profiles` -> `/cv-admin?p=slug&invite=token`). The four pre-existing accounts keep working via a one-time bootstrap that only fills an empty hash. Admin is chosen by a RULE (earliest profile), never by naming a person.

### Phase 5 — employer/industry targeting
- `src/services/cv-employers.js` — shared registry of company -> the ATS actually serving its career site -> the public JSON endpoint that site itself calls. Adapters: Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, **Workday** (paginated), Eightfold. Closed families (iCIMS, Taleo, Phenom, Oracle HCM, SuccessFactors) are **named as closed, not scraped around**.
- **GUESSED TOKENS ARE NEVER TRUSTED.** Guessing a board token from a company name lands on abandoned trial accounts squatting real names — `accenture.recruitee.com` and `ey.recruitee.com` serve Amsterdam demo posts titled "Senior Marketer (Sample)". A configured token succeeds as `live`; a **guessed** one becomes `unverified` (with sample titles for the owner to judge) and **contributes nothing to the pool** until confirmed via `PATCH /employers/:id/verify`. Demo boards are rejected outright. Do not regress this into "reachable = live".
- **Workday is paginated.** A large tenant holds thousands of postings served 20 per page; one request is page one, often sorted by an unrelated region. Citi returns **2,000** postings — capped at 200/refresh with 60 description fetches, both stated in the status, never silently truncated.
- Measured reality (first probe): **23 live, 4 unverified, 34 no public board**. Of the money-center banks only **Citi** is reachable (Workday); JPMorgan, BofA, Wells Fargo and Goldman expose no keyless feed. That is the honest answer, not a gap to paper over.

### Phase 6 — the daily operating surface
Saved searches, a daily digest (`GET /digest`), the application **pipeline** (new/saved/applied/screening/interviewing/offer/closed with next actions), contacts, cross-source dedupe + repost/stale detection, and the `CV_JOBS_GO` auto-run fanned out per profile inside a cost ceiling **derived from each profile's dollar cap** (`cost_cap_usd / $0.003 per scoring call`). Compensation is shown **only when the posting states it** (US pay-transparency ranges are parsed) and compared to the owner's floor — never estimated. Referrals come only from people already in that profile's own inbox and outreach history; connection graphs are not scraped.

### Phase 7 — discovery and broadcast
- **Role-targeted landing pages** — `/roles` and `/roles/:role` on each CV domain (`/cv/:slug/roles/...` on the main host), generated from that profile's own role targets. Server-rendered, indexable, carrying the exact title strings a sourcer searches, with Person + `seeks`/`knowsAbout` JSON-LD, and auto-listed in the sitemap and llms.txt. **This is the item that actually moves sourcing tools** — a CV headline of "AI Solutions Architect" is invisible to anyone searching for a project manager.
- **Privacy applies to every public surface through ONE projection** (`cv-agent.applyPrivacy`): a private field is DELETED from resume.json, the A2A card and every MCP tool response — not blanked, not merely hidden in the UI.
- Honest framing to keep: **no recruiting product discovers candidates via MCP today.** It is differentiation once someone lands and a positional bet, not a traffic source. Discovery comes from corpora recruiter tooling already indexes — LinkedIn, Dice, GitHub, employer talent networks — which **only the owner can create**; code links and keeps them consistent.

### Phase 8 — entity identity
`GET /entity/dossier` generates a sourced Wikidata submission from the profile record and **assesses notability honestly**: with only self-published and social links on file it reports the bar is NOT met and refuses to propose an item that would be deleted. The Q-ID is a settings field (`entity.wikidata_qid`), so adding it later is data entry.

**SIT:** `node scripts/test-cv-engine-v2.js` -> **115/115**, zero external keys (heuristic path). Covers cross-profile isolation, settings isolation, privacy absence on public surfaces, do-not-contact/excluded-employer enforcement, guessed-board quarantine, the messy location cases, and provisioning a new profile end to end. It creates its own `sit_*` profiles/jobs and deletes them.

**Configure a profile:** `node scripts/configure-cv-profile.js <slug>` writes settings (same as the UI) and reports what only the owner can state.

**Environment Variables:**
- `CV_JOBS_GO` — `1` enables the daily auto-run across enabled profiles. State is visible at `GET /jobs/auto`, not hidden in env.
- `CV_ENGINE_MODEL` (default `claude-haiku-4-5-20251001`) · `ANTHROPIC_API_KEY` — unset = labeled heuristic scoring (`is_simulated`), never a silent fake.
- `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` — broader discovery beyond ATS boards. Unset = dormant.
- `CV_ADMIN_SECRET` — session cookie signing (falls back to `JWT_SECRET`).
- `CV_ADMIN_PW_<SLUG>` — **legacy bootstrap only**, read once for the four pre-existing profiles when their password hash is empty. New profiles use invites; do not add one per person.

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

## JobUp — AI career platform (folder: jobup, domain jobup.dev)

Self-contained vertical at `verticals/jobup/`. Finds and scores real jobs against a subscriber's actual résumé, gives them a public CV site recruiters and their AI can read, and drafts outreach they approve before anything sends. Own Sequelize via `src/db.js`; shares the CRM database, so every table carries the `ju_` prefix. Reuses the CRM's keyless `/api/tts/edge` for voice — the voice layer is NOT duplicated.

**IT ANSWERS ON THREE ROOTS, AND THAT IS THE THING TO GET RIGHT.**

| Root | Base | Served by |
|---|---|---|
| `jobup.dev/` (+ `www`) | `''` | host handler in `src/app.js` calling `jobupApp(req,res,next)` |
| `<name>.jobup.dev/` | `''` | `jobupApp.subscriberSite`, mounted ABOVE the CRM's routes |
| `aiagent.ringlypro.com/jobup/` | `/jobup` | `app.use('/jobup', jobupApp)` |

**NOTHING USER-FACING MAY HARDCODE `/jobup/`.** `src/services/pwa.js` is the single generator for the manifest, the service worker and the HTML shells, parameterized by `pwa.basePath(req)` (which reads `req.baseUrl`). The three shells (`index.html`, `app.html`, `welcome.html`) carry a `{{BASE}}` token substituted server-side; `offline.html` too. There is deliberately **no `public/manifest.webmanifest` on disk** — a static file would be served verbatim to the wrong origin.

Why this is load-bearing, since it shipped broken once: a manifest's `scope`/`start_url` resolve against the manifest's own URL, so serving the `/jobup/` scope on jobup.dev produced an install whose scope **excluded jobup.dev/ itself** — tapping the logo inside the installed app dropped the user back into the browser. The worker had the mirror bug: its scope is the directory it was fetched from, so `/jobup/sw.js` registered from `jobup.dev/` never controlled the landing page that registered it. The subscriber handler had a *second, separate* copy of the rescoping (the only correct one); both now call `pwa.serveAsset()` so they cannot drift again.

Other PWA invariants worth not undoing:
- `express.static(publicDir, { index: false })` — without `index:false`, static answers `/` with the raw `index.html` and ships `{{BASE}}` tokens to the browser. Direct `/app.html` hits 301 to `/app`.
- The worker caches shell entries **individually**, never `addAll` — `addAll` is atomic, so one 404 aborted the install and left the app with no worker at all.
- It **never** caches `/api/`. A career dashboard showing yesterday's matches from cache is worse than an offline notice; navigations are network-first with `offline.html` as the last resort.
- Manifest carries a stable `id`, `orientation:'any'` (not portrait — it is a dashboard of tables and a chart), and home-screen `shortcuts` backed by the `?tab=` deep link `app.html` reads on boot via `tabFromUrl()`/`showTab()`.
- Bump `SHELL_VERSION` in `src/services/pwa.js` when a shell file changes.

**SUBSCRIBING IS REACHABLE FROM ANYWHERE IN THE FUNNEL — FOUR BUTTONS, ONE CODE PATH.** A real prospect abandoned signup because the teaser's only CTA sat at the foot of its eighth screen, past a 440px site preview and a JSON block. `routes/teaser-view.js` now draws it in four places (a strip above the fold, a strip at the halfway mark, the full pitch on screen 8, and a bar pinned to the viewport that steps aside via IntersectionObserver while the screen-8 button is on screen). **They are bound by class to one `checkout()`, and `CTA_LABEL`/`PRICE_HTML` are resolved once** — a price that appeared on one button and not another is the worst possible bug in that file. `CTA_BUSY` locks all four while a request is in flight, because four buttons that each mint a Stripe session are four sessions for one person. A failed checkout surfaces in a **toast**, not at the foot of screen 8 that whoever tapped the top would never scroll to. Same shape on `public/build.html`: three submit buttons (middle — both required steps end there, bottom, pinned), all forwarding to the one form via `requestSubmit()`, all driven by `setGo()` so they cannot disagree about being disabled, and the pinned bar states what is still missing instead of sitting inert. SIT drives the top and pinned buttons in **jsdom** — markup that is never bound is exactly the failure being fixed, and grep cannot see it.

**Two admin consoles, and the difference is the point.** `/admin` (`routes/admin.js`) is aggregates-only — its own subscriber list is pseudonymised to an email hash plus domain, and reaching career data needs audited impersonation with a written reason. `/subscribers-admin` (`routes/subscribers-admin.js` + `public/subscribers-admin.html`) is the billing register: name, email, amount paid, subscribed-on date, renewal date, payment count. It relaxes the identity boundary **only** for billing — you cannot run a paid product without answering "who is this charge from" — and keeps the part that matters: it never touches `models.profiles`/`matches`/`outreach`/`settings`, and SIT greps the file to prove it. Every list view and CSV export writes an `audit_log` row. Separate credential, separate cookie (`jobup_subs_admin`), 8h TTL, so neither a subscriber session nor an `/admin` session grants access. **Amounts come from paid invoice rows, never from the list price** — a subscriber with no invoice reads `0.00`, meaning not yet charged, and `free_test` activations are labelled and counted apart.

### JobUp Social Media Image Poster (`/social-admin`)

Publishes an approved JobUp marketing image + caption to chosen destinations and returns one record per destination. `services/social-poster.js` (agent) · `social-connectors.js` (Graph API) · `social-rules.js` (per-platform limits) · `crypto.js` (AES-256-GCM tokens) · `routes/social-admin.js` + `public/social-admin.html`. Tables `ju_social_accounts` / `_copy` / `_campaigns` / `_posts`, all `tenant_id`-scoped and owned by `JOBUP_PLATFORM_TENANT_ID` (default 0).

**IT IS DELIBERATELY NOT AN LLM AGENT.** Every constraint in the spec is an absolute about what must never be invented, and a model asked for a post id can produce a plausible one when the call failed. The procedure runs as code: `post_id`/`post_url`/`posted_at` are copied from a connector result and are `null` on every path that did not reach the platform; `shape()` builds the declared JSON key by key and cannot construct them. Captions are **truncated, never rewritten** — that is how "invent no claims" is guaranteed rather than requested. Destinations are loaded **by id from the request**, so there is no "all accounts" path to fall through to. Retry is once, transient only (429/5xx/network); a permission or policy refusal is never retried.

**FACEBOOK GROUPS CANNOT BE POSTED TO, AND THE AGENT SAYS SO.** Meta deprecated the Groups API in Graph v19 and removed it from all versions on 2024-04-22; `publish_to_groups` no longer exists. HOA and Chamber **Groups** are therefore `skipped` with that reason and handed back for manual posting — never reported as posted. Chamber/HOA **Pages** work normally. Supported: `facebook_page`, `instagram` (Business, two-step container→publish). Unsupported by design: `facebook_group`, `other`.

Auth **reuses the subscribers console credential and cookie** rather than minting a third `JOBUP_*_ADMIN_PASSWORD` — two similar names already left one console open in production.

**Environment Variables:** `JOBUP_SOCIAL_SECRET` (token encryption; falls back to `JOBUP_JWT_SECRET`/`JWT_SECRET` — rotating it makes stored tokens undecryptable, which is reported, not silently ignored) · `JOBUP_PLATFORM_TENANT_ID` (0) · `JOBUP_GRAPH_VERSION` (v21.0) · `JOBUP_GRAPH_BASE` · `JOBUP_GRAPH_TIMEOUT_MS` (20000) · `JOBUP_FB_CAPTION_MAX` / `_MAX_BYTES` / `_RATE_DELAY_MS` · `JOBUP_IG_*` equivalents. **No Meta credentials exist in this repo** — tokens are entered per destination in the console and stored encrypted.

### Subscribers console is an installable PWA with a live badge (`/subscribers-admin`)

Its own app, not the subscriber one: `pwa.adminManifest()` gives it a distinct `id`, `scope:/subscribers-admin/`, a separate roster-motif icon (`admin-icon.svg`), and `sw-admin.js` scoped to the console. Sharing the subscriber manifest (`scope:"/"`, `start_url:"/app"`) would have put the SUBSCRIBER dashboard on the home screen under the console's name. **`start_url` carries a trailing slash on purpose** — scope matches by path prefix, so `/subscribers-admin?src=pwa` resolves outside `/subscribers-admin/` and opens in a browser tab.

**The badge is a count of real rows, never a stored counter.** `services/admin-notify.js` keeps a `last_seen_subscriber_id` watermark **per admin email**, so "new" means "since you last looked" and one operator clearing it does not clear another's. Deleting a subscriber lowers the count, which only holds because it is derived — SIT asserts exactly that.

**Three delivery paths, because each covers what the others cannot:** an in-page pill (always), `navigator.setAppBadge` (the installed icon), and **Web Push** (the only thing that updates a CLOSED app). The worker's `push` handler sets the badge and shows a notification — iOS drops silent pushes and eventually revokes permission, so the notification is not optional there. iPhone requires the console be installed to the home screen first.

**VAPID keys generate themselves on first use and live in `ju_admin_state`.** Web Push needs a keypair, not an account, so requiring an env var before the badge worked would be configuration that buys nothing. `JOBUP_VAPID_PUBLIC`/`JOBUP_VAPID_PRIVATE` override when present. A push subscription is a capability URL — anyone holding it can push to that device — so subscriptions are never returned by any read endpoint.

The badge clears by **reading the list**, not a separate button: `markSeen()` fires once the rows render. Tables collapse to cards under 820px, 44px targets, 16px inputs.

### Referrals and profit sharing (`/r/CODE`)

Every subscriber gets a shareable code (`services/referrals.js`). `/r/CODE` logs the click, drops a 60-day `jobup_ref` cookie and redirects to the landing page — an unknown code still redirects, it just earns nobody anything. Signup reads the cookie (or `?ref=`) and creates a **pending** row. Tables `ju_referrals` / `ju_referral_clicks`, both `tenant_id`-scoped on the REFERRER.

**A COMMISSION IS BORN FROM A PAID INVOICE AND FROM NOTHING ELSE.** `qualifyFromInvoice()` is the only function that can set one, it is called from the `invoice.paid` branch of `billing.applyEvent`, and it reads `invoices.amount_cents` — so the figure traces to money that arrived rather than to a signup or the list price. Paying on signup is how a referral programme becomes a fraud surface: `free_test`/`no_billing` referees are voided, self-referral is refused by both id and email, an already-attributed signup cannot be stolen by a second code, and a qualified referral cannot re-qualify.

**IT DOES NOT SEND MONEY.** There are no payout rails in this repo. The ledger computes what is owed; "mark paid" records that the owner settled it elsewhere, with who and when. SIT greps the service to prove nothing in it looks like a transfer — a button labelled "pay" that does not pay is worse than no button.

**A referrer sees their earnings, not who their referees are.** `statsFor()` returns counts, dates and amounts with no referee name or email; the invitee's identity is not the referrer's to see. Clicks store a salted `ip_hash`, never a raw IP. Attribution is last-touch and *claimed*, not proven — both the raw code and the resolved referrer are stored so a dispute is checkable.

**Env:** `JOBUP_REFERRAL_PCT` (0.20) · `JOBUP_REFERRAL_COOKIE_DAYS` (60).

**SIT:** `node verticals/jobup/sit.js` → **379/379**, zero external keys.

**Environment Variables:**
- `JOBUP_JWT_SECRET` — signs the subscriber session cookie and the admin console token. SET on prod (falls back to a `dev-only-insecure-secret`).
- `JOBUP_ADMIN_PASSWORD` — platform owner console at `/admin` (12+ chars). Unset = the console is **CLOSED**, deliberately, rather than open with a default password. `JOBUP_ADMIN_EMAILS` (default `mstagg@digit2ai.com`) is the allowlist.
- `JOBUP_SUBS_ADMIN_EMAIL` (default `admin@jobup.dev`) / `JOBUP_SUBS_ADMIN_PASSWORD` — the subscribers/billing console at `/subscribers-admin`. **No hardcoded default: unset = CLOSED**, the same rule `/admin` has. Falls back to `JOBUP_ADMIN_PASSWORD`, so one secret secures both consoles — two near-identical variable names is a trap, and setting only the obvious one is exactly how this console sat open in production. `GET /subscribers-admin/api/health` reports `configured`, `shares_platform_secret`, and **`weak_password`, which compares the VALUE against the passwords this repo publishes** (`Palindrome@7` and friends). An earlier check only asked whether the env var existed, so `JOBUP_SUBS_ADMIN_PASSWORD=Palindrome@7` read as secure while anyone who had read the repo could sign in. A weak value is reported and bannered, never blocked — refusing to boot would lock the owner out of their own billing register. Changing the email revokes live sessions immediately (the token is re-checked against current config on every request).
- `JOBUP_PRICE_USD` (default **59**) — the annual list price, and the **single source** for every surface that quotes a figure: Stripe checkout (`price_data`, so there is no Stripe Price object to update), the teaser payload, the voice lines, the admin console, and the landing pricing card (substituted server-side via a `{{PRICE}}` token — it must never be hardcoded again). **An env value on Render overrides this default**, so a code change alone will not move the price if one is set. Changing it does NOT reprice existing Stripe subscriptions: they stay on the price they were created with, which is why renewal notices quote the subscriber's own last paid invoice rather than the list.
- `JOBUP_PUBLIC_URL` (default `https://jobup.dev`) — base used for Stripe return URLs.
- `JOBUP_FREE_ACTIVATION` — `1` activates + provisions a subscriber with no payment (test mode). Every such row records the reason.
- `JOBUP_DEFAULT_COUNTRY_CODE` (default `1`) — assumed dialing code when a phone is typed without one.
- **The video console is a GENERATOR, not an editor (the VEED question).** VEED is a timeline you drag; this describes a video and buys one. What it borrows from an editor is the part that matters before money changes hands: `src/services/video-preview.js` renders a **free storyboard animatic** — every beat read aloud by the repo's zero-key Edge TTS over the branded ffmpeg cards, timed to the actual read — in ~8-20s for **$0**, on a DRAFT, before approval. It reports the MEASURED runtime against the spec's target, which is the most common thing wrong with a spec and is invisible in text. SIT greps the service and fails if any paid provider (Fish/Runway/Veo/OpenAI/Gemini) is reachable from it — a preview that costs money defeats its own purpose. It is labelled "not the final look" on every surface: no generated character, no motion, different voice. `JOBUP_PREVIEW_VOICE_EN` (`en-US-AvaNeural`) / `_ES` (`es-MX-DaliaNeural`).
- **Video storage — S3, deliberately NOT a Render disk.** A finished MP4 is written to `JOBUP_VIDEO_DIR` (default the system temp dir) and then COPIED to S3 by `src/services/video-store.js`; the download serves the local file when it is there and 302s to a short-lived signed URL when a deploy has wiped it. Attaching a Render disk would pin this service — the whole CRM and every vertical it hosts — to a single instance and end zero-downtime deploys, in exchange for a folder of marketing videos. `JOBUP_VIDEO_S3_BUCKET` (falls back to `AWS_S3_BUCKET`, already `ringlypro-uploads` on prod) · `JOBUP_VIDEO_S3_PREFIX` (`jobup-videos`) · `JOBUP_VIDEO_URL_TTL` (3600s). Reuses `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`. **No bucket = the render still works and the row records `storage:'local'`** — a video is never reported as kept when it is not, and a failed upload downgrades to local rather than failing a render that already cost money. `JOBUP_VIDEO_DIR` pointing at a mount path that does not exist (e.g. `/var/data` with no disk attached) falls back to temp with a banner naming both paths, instead of blocking every render.
- Reuses `ANTHROPIC_API_KEY` for scoring/drafting; unset = labeled heuristic path.

## JobMD.io — AI physician & surgeon recruitment (folder: jobmd, domain JobMD.io)

**IT ANSWERS ON THREE ROOTS.** `jobmd.io` + `www.jobmd.io` (host handler in `src/app.js`, registered **beside the other custom domains near the top of the file** — Express matches in registration order, and the CRM defines hundreds of paths below, so a late handler silently shadows only the paths the CRM happens to define), plus `/jobmd` and `/jobMD` on the shared CRM host. **Nothing in the page hardcodes a prefix**: every asset and the lead POST are relative, so one file serves all three roots.

**`/api/tts` is self-mounted inside the vertical** (`router.use('/api/tts', require('../../../src/routes/presentation-tts'))`). Ava posts to the absolute `/api/tts/edge`; on jobmd.io the host handler owns the whole domain and the CRM mounts its own TTS ~1,100 lines later, so without the self-mount the narration would drop to the robot browser voice **on the real domain only**. The route is reused, never re-implemented.

**AN UNOWNED PATH ENDS IN THIS VERTICAL, NOT THE CRM.** Falling through served the CRM on the brand domain — `jobmd.io/admin` returned the CamaraVirtual Platform Admin login, leaking an unrelated product onto a customer domain. A catch-all now returns a branded 404 (JSON under `/api/`). Nothing needs to fall through.

Self-contained vertical at `verticals/jobmd/`, mounted at **`/jobmd` and `/jobMD`** — the project request declares `/jobMD`, the owner asked for `/jobmd`, and Express paths are case sensitive, so both mount onto ONE router rather than breaking a link. A specialized division of JobUp.dev: an AI Healthcare Talent Intelligence Network connecting surgeons, physicians, hospitals, health systems and IDNs. Own Sequelize via `src/db.js`; shares the CRM database, so every table carries the `jm_` prefix. English, emoji-free.

**SCOPE: SURGEONS, DOCTORS AND MEDICAL STAFF — NOT SURGEONS ALONE.** The page was first built from healthsourceelite.com, which is surgeon-only, and the owner corrected it. The hero names all three, Who We Serve carries four groups (Surgeons / Doctors & Physicians / Medical Staff / Hospitals, Health Systems & IDNs), the fifteen specialties are labelled **Surgical Specialties** rather than presented as the whole offering, and Ava's narration says all three. **No medical staff roster is invented** — the owner has not supplied the specific roles, so the page says "tell us the role and we will scope it" and SIT fails if a role like "nurse practitioner" appears. SIT also asserts the form's `<option>` values are all accepted by the server allow-list; a value the page offers but the server rejects is silently stored as null and the lead arrives unattributed.

Note the deliberate divergence from the agent: the project request's §1 names only "Physicians & Surgeons", so `corpus.js` still says that (it is a verbatim transcription and must not gain an entity the request never stated). The gap is recorded in the plan's `open_questions` instead.

**Landing** (`public/index.html`) carries the HealthSource Elite positioning — Superior Talent / Superior Results, the AAMC 15,000-30,000 shortage by 2034, The Right Fit, Who We Serve, the 15 specialties + business sectors, the full Robotics Division with its da Vinci figures, and the AI layer — on the **inherited JobUp dark-aurora token set** rotated toward clinical teal (brand inheritance is explicitly requested by the spec). Market figures are **attributed to healthsourceelite.com, not independently verified**, and the page says so. It reuses the shared zero-key voice orb (`/embed/voice-orb.js` → `/api/tts/edge`) rather than standing up a second TTS backend.

### The JobMD Build Plan Architect

Turns the project request into the declared build-plan JSON for OrbUp.app.

**THE MODEL WRITES PROSE. IT NEVER WRITES A NAMED ENTITY.** Every constraint in the spec is an absolute about what must never be invented, and a model asked for "the 13 pipeline stages" will happily return 12 well-formed ones — the output still parses, and the hole ships. So the named entities are not generated. `services/corpus.js` holds them verbatim and in order; `services/plan.js` assembles the entire structure from it deterministically; the model is offered only a narrow rewrite of a `reason`, a `purpose` or a `mitigation`, and each rewrite is discarded unless it survives the identifier guard and full re-verification. **The plan is structurally identical with and without `ANTHROPIC_API_KEY`** — only wording moves, and `composed_by` / `is_simulated` say which path produced it. Verified in production: 29 of 35 prose slots rewritten, 0 rejected, structure byte-identical to the deterministic path.

**`services/verify.js` is the enforcement, and it runs on EVERY plan before it is returned** — the deterministic one included, so a later edit that quietly drops a stage fails there rather than shipping. It enforces: exactly the 17 declared top-level keys (no extras, which is why the capability ledger and the on-disk inventory paths travel *beside* the plan as `evidence`, never inside it); the 15 specialties, 11 agents, 13 stages and 7 dimensions by exact list equality **in order**; `jobup_component` drawn only from the real inventory; `not_applicable` carrying a null target; protected nouns surviving verbatim; shared and JobMD-owned boundary sets staying disjoint; and a PHI/PII sweep (email, phone, SSN, NPI, DEA, licence number) because a build plan describes structures only.

**AGENT STATE-CHANGE AUTHORITY IS AN ALLOW-LIST, NOT A DEFAULT.** The request authorizes agent updates only in the general — "with authorized AI agents updating relevant states when appropriate" — and never says which agent may move which stage. So authority is granted ONLY where a §3 agent function names the work that produces the state (Contacted/Interested ← Recruitment Outreach, Qualified ← Clinical Qualification, Matched ← Candidate Matching, Interview ← Scheduling). Offer, Negotiation, Accepted, Credentialing and Placement are recruiter and administrator only, and the ambiguity is reported in `open_questions` rather than guessed.

**THE JobUp INVENTORY IS REAL, NOT A PLACEHOLDER.** The spec shipped `<JobUp.dev component inventory>` because its author had no repo to point at. JobUp is a real vertical here, so the 20 entries name actual files and **SIT fails if one stops existing** — that is what stops the plan citing a component nobody ever wrote.

**The request is truncated** mid-sentence in §10 (Automated Talent Discovery, at "candidate-submitted profil"). Only the two sources it states are listed, no further source is inferred, and the verifier **rejects a plan whose `open_questions` does not say so**.

**Ava narrates the landing page.** `public/index.html` carries the runbook's Layer 3 narration orb — eight segments (an intro plus one per section), the section being read lifts out of the page, and every section has its own Listen button. It posts to the repo's shared zero-key `/api/tts/edge` with the `ava` alias (`en-US-AvaNeural`); **no second TTS backend ships inside this vertical**, and SIT fails if one appears. **Numbers are spelled out in the script** ("eight and a half million", "eight eight eight, three one five, four four zero one") because Edge reads `8.5` and `(888)` badly and this is copy being read aloud to a surgeon — SIT rejects a segment containing raw numerals. Falls back to browser speech if the route is down. This deliberately REPLACED the generic `digit2ai` conversational orb: two floating voice surfaces on one landing page is redundancy, not a feature.

**The mark** is an **MD monogram with a medical cross knocked out of the D** — the credential itself, with the cross carried inside it. It deliberately avoids the stock-medical clichés: no caduceus (which is Hermes, the symbol of commerce, and is what most "medical" logos get wrong — the correct one is the Rod of Asclepius), no heart, no person-swoosh. An earlier cross-plus-arrow mark was replaced because it read as a generic up arrow, and a Rod of Asclepius attempt was rejected because the snake collapses into a squiggle at icon size. Every candidate was rendered and looked at, at 512px **and blown back up from 32px**, rather than judged from the source. `public/logo-master.svg` is the single source, **full-bleed square on purpose** (iOS rounds `apple-touch-icon` itself; a pre-rounded source gets double-rounded), with `favicon.svg` as the rounded tab variant. `sips -s format png -Z <n>` produces `apple-touch-icon.png` (180) / `icon-192` / `icon-512` / `favicon-32`. The nav and footer lockups inline the SVG with **unique gradient ids** — two inline SVGs sharing one id makes the second render flat, and SIT checks for that.

**The hero scene** (`public/jobmd-hero.jpg`, also the `og-image.jpg` source) is a drawn robotic-surgery scene — four articulated arms converging on a lit surgical field over a table, with HUD panels. Asked for as the SurgicalMind equivalent of the ImagingMind hero; **no such asset existed** (all 18 photos on the shared GHL CDN were checked, and surgicalmind.app's only image is its wordmark), so it was built here as SVG/CSS rendered by Chrome. It is a designed vector scene, **not a photoreal generated image**. It sits behind the hero under a two-layer scrim, because a picture behind a headline is only allowed if the headline still wins.

**The footer illustration** (`public/robotic-surgery.jpg`) is the owner's own generated infographic, resized to 1280 and JPEG'd (2.2MB PNG to 312KB) and lazy-loaded, since it sits below the fold. **It carries clinical claims** — less pain, smaller incisions, faster recovery, better outcomes — which are the generally published advantages of robotic-assisted surgery and NOT anything JobMD.io measured, so the caption says exactly that and SIT asserts the caption is present. Its long `alt` describes the scene rather than being left empty.

**The agent constellation** (`.cstwrap`) in the AI Intelligence section mirrors the Digit2AI MCP-brain diagram with JobMD's own eleven agents: rings rotate, dashes flow outward along each A2A link, and the nodes light in sequence 1.6s apart while the brain's status line names the active agent. SIT asserts **all eleven nodes, numbered 01-11 in corpus order** — a picture that disagrees with the list underneath it is worse than no picture. It **hides below 720px**, where the labels are unreadable, and the full written list always remains; SIT checks the list is never replaced. `prefers-reduced-motion` stops every animation.

Everything is self-hosted. SIT fails if `surgicalmind` appears in the page or if any asset is hotlinked from another host's CDN. Rendering goes through Chrome, not sips: **sips ignores `fill` on `<tspan>`** and its `feDropShadow` support is unreliable — both failed silently and were only caught by looking at the output.

**No phone number.** The published line was retired at the owner's request; the contact path is the form. SIT asserts its ABSENCE on the landing page, in the narration and on the 404, so a copy edit cannot quietly reinstate a dead number.

**Mobile.** The hamburger is a 44px target that draws itself as an X when open and reports `aria-expanded`; the drawer is **fully opaque** (at `.98` the hero headline ghosted through and read as a rendering fault), its rows are 48px, and it carries the Apply Now CTA from the SAME markup node as the desktop bar so the two cannot disagree. It closes on a link tap, the X, the scrim, Escape, or a resize past the breakpoint. **The brand and burger carry `z-index:80`**: the drawer is a child of the sticky nav, so it lives inside the nav's own stacking context and painted over its siblings — the close button was invisible until this was fixed. Safe-area insets are honoured (`viewport-fit=cover` was declared but unused), and an inline `style="grid-template-columns"` that was silently beating the breakpoints is now a class. Verified with Puppeteer at 360/390/768px: no horizontal overflow and no touch target under 44px.

**Endpoints:** `GET /jobmd/health` · `GET /api/v1/architect/schema` · `GET /api/v1/architect/plan[?model=0]` (public, persists nothing, no PII by construction) · `POST|GET /api/v1/architect/runs`, `GET /api/v1/architect/runs/:id` (auth, tenant-scoped, cross-tenant reads 404) · `POST /api/v1/leads` (public, rate-limited, salted `ip_hash` never a raw IP) · `GET /api/v1/leads` (auth) · `POST /api/v1/auth/login|logout`. Debug: `/debug/jobmd-error`.

**Tables** (`jm_`, `tenant_id NOT NULL` + indexed on all four): `jm_users`, `jm_build_plans`, `jm_plan_runs`, `jm_leads`. Tenant is read from the session and **never** from a request body. `jm_leads` is **deliberately unreachable from the architect** — a lead is a real person's contact detail — and SIT greps `src/services/` to prove no architect file imports the models.

**SIT:** `node verticals/jobmd/sit.js` → **150/150**, zero external keys. It attacks the invariants rather than the happy path: ~40 tampered plans (drop a specialty, reorder agents, merge two agents, grant an agent authority over Placement, declare the Talent Intelligence Record shared, leak an NPI, hide the truncation) that the verifier must refuse. It reports **loudly** when `ANTHROPIC_API_KEY` is absent that the model rewrite path was not covered — that path is only verifiable against production.

**Environment Variables:**
- `JOBMD_JWT_SECRET` — signs the `jobmd_token` cookie (falls back to `JWT_SECRET`), 30d. SET on prod.
- `JOBMD_MODEL` — model that rewrites prose. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY`; unset = deterministic prose, **identical structure**, labelled `is_simulated:true`.
- `JOBMD_PASSWORD` — owner password (falls back to `SPEAKUP_TEAM_PASSWORD` / `LAWNCOPILOT_MSTAGG_PASSWORD`, default `Palindrome@7`). `JOBMD_OWNER_EMAIL` default `mstagg@digit2ai.com`.
- `JOBMD_TENANT_ID` (1) · `JOBMD_LEADS_PER_HOUR` (10) · reuses `SESSION_SALT` for the lead `ip_hash`.

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

## AI Readiness Department — a department inside the MCP Brain (folder: ai-readiness)

**Purpose:** take a CEO from fear to confidence about adopting AI, and leave them holding a personalised AI Readiness Roadmap plus a next step small enough to say yes to in the room. Five agents behind one Brain, presented end to end by a human sponsor. Mounted at `/ai-readiness`. Bilingual EN/ES, emoji-free.

**Location:** `verticals/ai-readiness/` — self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`). Tables auto-create on boot via `sync({alter:false})`; canonical migration `verticals/ai-readiness/migrations/20260808_ai_readiness_tables.sql`. Multi-tenant (`tenant_id` = sponsor id), `air_` prefix: `air_sponsors, air_engagements, air_answers, air_findings, air_roadmaps, air_calls, air_approvals`.

**Live:** sponsor console `/ai-readiness/` · login `/ai-readiness/login` · the CEO's read-only roadmap `/ai-readiness/roadmap/:token` · health `/ai-readiness/health` · debug `/debug/ai-readiness-error`.

### The crew — five agents, 22 tools, one gateway
| Agent | Overcomes | Namespace |
|---|---|---|
| **Readiness Director** | Not knowing where to start | `readiness_director.*` |
| **Cost Comfort Agent** | The fear of cost | `cost_comfort.*` |
| **Risk Comfort Agent** | The fear of risk | `risk_comfort.*` |
| **Data Readiness Agent** | The fear that the data is not good enough | `data_readiness.*` |
| **Roadmap Builder** | Not knowing what the actual next step is | `roadmap_builder.*` |

`src/brain.js` is the department gateway — same doctrine as the standalone MCP Brain (`github.com/digit2ai/mcp-brain`): five gates (agent enablement, channel allow-list, min trust, role allow-list, daily cost cap), `tenant_id` injected from session context and DELETED from tool arguments, human approval queue, full audit to `air_calls` including denials. `listTools` computes effective trust exactly as `callTool` does — do not let those drift.

**THE AGENT ORDER IS LOAD-BEARING AND MUST NOT BE PARALLELISED.** Data runs first (its blocking-gap count becomes remediation hours in the cost model), then Cost (its Phase 1 scope is what Risk writes guardrails around), then Risk, then the Roadmap Builder. Fanning them out concurrently leaves each guessing at the others' output and the three lanes quietly disagree about which processes are in the pilot.

### Honesty enforced in code, not in prompts
- **The model writes prose; it never writes a number.** `src/services/llm.js` hands the engines' computed figures to Claude as facts, then verifies the output: text introducing a figure the engines did not produce, or any guarantee language, is **discarded** in favour of the deterministic prose. No `ANTHROPIC_API_KEY` = deterministic prose labeled `narrative_by:'heuristic'`; the figures are byte-identical either way (SIT asserts this).
- **Every dollar traces to an interview answer.** No industry benchmarks in the savings math. An unstated leak is omitted, never estimated. Assumptions live in `engines/cost.js` each carrying a `basis` string rendered into the deliverable.
- **`run_department` REFUSES to analyse while a required interview answer is missing**, and names which. This is the whole difference from the artifact the CEO was oversold last time.
- **Phase 1 excludes regulated data, customer-facing output and zero-error-tolerance work by rule.** Phase 3 is **never priced** — costing a transformation against unknowns is the fabricated number that teaches CEOs to distrust these documents.
- **The verdict is not an average**: a blocking data item dominates two green lanes. And there is **always a safe next step** — a red scorecard yields a smaller step, never "come back later".
- **Mitigation vs guardrail**: every risk carries both, plus an owner and evidence. `publish_to_ceo` is approval-gated — the department obeys the "AI does not act without a human" rule it is selling.

### The deliverable
A Red/Yellow/Green scorecard (Cost Comfort · Risk Comfort · Data Readiness), a three-phase roadmap where each phase carries cost, risk level, data requirements, timeline, success metrics and a **gate**, a safe next step sized under the CEO's stated exposure ceiling, and a **sponsor talk track** (what to say, what to watch for, prepared answers to the five objections that actually get raised). The talk track is deliberately **absent from the CEO's copy** — it includes how to read the room.

**SIT:** `node verticals/ai-readiness/sit.js` → **95/95**, zero external keys. Asserts the invariants above, not the happy path: determinism with and without a model, the refusal on missing inputs, regulated work never entering Phase 1, the approval gate not running its handler, a model-supplied `tenant_id` reading as "not found", and denied calls still writing an audit row.

**Doctrine:** `mcp-brain/agents/ai-readiness-department.md` (portable, vertical-neutral).

**Environment Variables:**
- `AIR_JWT_SECRET` — signs the `air_token` sponsor cookie (falls back to `JWT_SECRET`), 30d. SET on prod.
- `AIR_MODEL` — Anthropic model for the executive-summary prose. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY`; unset = deterministic prose, identical figures.
- `AIR_SPONSOR_PASSWORD` — sponsor password force-synced on boot (falls back to `SPEAKUP_TEAM_PASSWORD` / `LAWNCOPILOT_MSTAGG_PASSWORD`, default `Palindrome@7`).
- `AIR_COST_CAP_USD` (15) — per-tenant daily Brain budget; the admin channel is exempt so an operator is never locked out by their own guard.
- **Cost model** (`engines/cost.js`, every override changes the deliverable with no redeploy): `AIR_BUILD_RATE_USD_HR` (70) · `AIR_HOURS_PER_PROCESS` (40) · `AIR_HOURS_PER_INTEGRATION` (16) · `AIR_HOURS_PER_REMEDIATION` (12) · `AIR_CAPTURE_RATE_PILOT` (0.40) · `AIR_CAPTURE_RATE_SCALE` (0.60) · `AIR_RUN_COST_PER_PROCESS` (120) · `AIR_SUPPORT_MONTH` (250) · `AIR_COST_BAND_PCT` (0.30) · `AIR_PILOT_WEEKS` (4).

## Citi Opportunity Tracker — a private job hunter for Citi requisitions (folder: citijobs)

**Purpose:** the owner's own job hunt, as software. It watches Citigroup's careers feed every day, scores each new requisition against a résumé profile, tailors a résumé (and a real PDF) per requisition, and tracks the board through New → Saved → Applied → Interview → Offer → Closed. Owner-only, login-gated, no public signup, no billing. Mounted at `/citi-tracker`. English, emoji-free.

**Location:** `verticals/citijobs/` — self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`). Tables auto-create on boot via `sync({alter:false})`; canonical migration `verticals/citijobs/migrations/20260813_citijobs_tables.sql`. Multi-tenant (`tenant_id` = owner user id), `cj_` prefix: `cj_users, cj_profiles, cj_reqs, cj_tracked, cj_matches, cj_queries, cj_runs, cj_skills, cj_tailorings`.

**THE FEED IS CITI'S OWN WORKDAY JSON, AND THE COORDINATES ARE VERIFIED.** Tenant `citi`, datacenter **`wd5`**, site `2` (`CITIJOBS_WORKDAY`, default `citi:wd5:2`). `wd1`/`wd3`/`wd103` return **422** — the CV engine's `cv-employers.js` seed omits `dc` and probes upward; this module does not repeat that. `bulletFields[0]` IS the requisition id, and `searchText:"<req id>"` returns exactly one posting, which is what makes paste-to-import reliable rather than a guess. Detail gives `startDate` (Posted), `endDate` (Anticipated Close), `remoteType`, `timeType`, `canApply` and the description the salary range is parsed out of.

**A SEARCH'S REPORTED `total` IS CAPPED AT 2000 BY WORKDAY** — a response ceiling, not Citi's opening count. You therefore *cannot* page through "all of Citi", which is why discovery is **many targeted saved queries deduped by req id** and never one firehose.

**`jobs.citi.com` IS A DIFFERENT SURFACE AND IS NEVER CRAWLED OR CONSTRUCTED.** It is Phenom People; the posting id in `…/287/99038749520` appears nowhere in the Workday payload and cannot be derived. The tracker stores the canonical Workday apply URL (always), a `jobs.citi.com` deep link **only when a human pastes one**, and offers a `search-jobs/<req id>` click-out for the owner to use by hand. `jobs.citi.com/robots.txt` disallows `/search-jobs/` and the Workday host disallows `/2/`, so only `/wday/cxs/` is used — SIT greps the source and fails if any path builds a `jobs.citi.com/job/` URL.

### The compounding loop, and the wire that must never be connected
Every tailoring makes the hunter smarter. But if "tailoring adds skills to my profile" meant *skills harvested from the posting*, then after ten tailorings the profile claims Snowflake and Tableau because ten postings asked for them — and the agent would then hunt for that fabricated profile, compounding **away** from the owner, silently, growing more confident daily. So `cj_skills.kind` splits the loop in two:

| kind | may appear on a résumé | may widen the search | how it is reached |
|---|---|---|---|
| `verified` | **yes** | yes | ONLY `confirmVerified()`, which **requires an evidence string** |
| `vocabulary` | no | yes | harvested automatically from tailored postings |
| `rejected` | no | no | the owner said no; never suggested again |

**Nothing automated may promote `vocabulary` → `verified`** — not a model call, not a status change, not a weight update. Search widens fast and automatically; the résumé widens deliberately. Board movement is the third signal (`applied` +0.5, `interview` +1.5, `not_interested` −0.75) and moves **ranking weight only** — it can never change `kind`.

### Tailoring selects; it cannot author
`services/tailor.js` hands the model a pool of bullets from `cj_profiles.resume_json` and it may return **only their ids**, so every bullet that reaches a PDF is verbatim from the base résumé. The one free-text field it may write — the summary — is verified afterwards against the evidence corpus and **discarded in favour of the base summary** if it introduces a domain term, an acronym, or a **number** the corpus does not contain (numbers being the classic fabrication). Re-wording individual bullets is deliberately not offered: verbatim selection is what makes each line defensible in an interview. Unknown bullet ids are dropped and reported in `dropped[]`.

**PDFs are `pdfkit`, not headless Chrome** — Render has no Chrome binary, and a feature that works on the laptop and 500s in production is worse than no feature. The PDF is re-rendered on demand **from the stored `content` JSONB**, never read off Render's ephemeral disk, so the exact document sent to Citi for a req id is always recoverable. Tailorings are versioned and immutable (unique on `profile_id, req_id, version`).

### The daily agent
Off by default behind `CITIJOBS_GO=1`; state visible at `/citi-tracker/health`. Claims the day via a **partial unique index** on `(tenant_id, run_date) WHERE trigger='schedule'` (Render runs more than one instance; manual runs are never locked out). Bounded by an HTTP request budget that **stops the run and says it stopped**, and a model cost cap. `fillDetails()` ranks pending requisitions by the **free** pre-filter before spending a request — ordering matters more than the cap, since a broad query set surfaces hundreds of new requisitions a day and newest-first burns the budget on postings a US-only profile can never take; a location-excluded requisition gets a recorded `cj_matches` row rather than silently never appearing. **It may set exactly ONE status automatically**: a `new`/`saved` requisition that has left the feed becomes `closed/expired` with a dated note. It never advances Applied → Interview → Offer, never auto-closes something already applied to, never applies, and never contacts anyone.

**A heuristic score and a model score are not the same scale**, so with no `ANTHROPIC_API_KEY` the board floor is `threshold × 0.7` — comparing a deterministic score topping out in the 60s to a threshold calibrated for an LLM silently produces an empty board on an app that is working correctly.

**LOCKED TO THE CV CONSOLE'S DOMAIN.** `CITIJOBS_ALLOWED_HOSTS` (default `manuelstagg.com,www.manuelstagg.com`) — on `aiagent.ringlypro.com` the tracker answers **404, not 403**, because a 403 confirms there is something there worth finding. `/health` stays open on every host (service state, never a requisition). Loopback is allowed only when `NODE_ENV !== 'production'`, so SIT can drive the router without opening the live origin. Entry is the **CV console SSO**: the console's `cv_admin_token` is `Path=/` so it already arrives, and `CITIJOBS_SSO_SLUGS` (default `manuelstagg`) names which CV profiles may cross. **The console does NOT issue JWTs** — `src/routes/cv-engine.js` signs `base64url(JSON).hmac-sha256` with `exp` in epoch MILLISECONDS; reading it as a JWT rejects every real session, and SIT now asserts a JWT is refused.

### One board, two windows — Citi requisitions in the console pipeline
A Citi requisition at any status past `new` appears in `/cv-admin` → **Pipeline**, alongside the CV engine's own matches. It is **read live, never copied**: `cv-engine.js` `citiPipelineRows()` joins `cj_tracked`/`cj_reqs`/`cj_matches` (both modules already share `CRM_DATABASE_URL`), so the two surfaces can never drift. Changing a stage in the pipeline calls `citiSetStage()`, which writes straight back to `cj_tracked` — the row's id is `citi:<tracked_id>`, which is what routes the PATCH. Stage vocabularies were deliberately aligned (`screening` added to the tracker); only `interview` differs, spelled `interviewing` in the console. Closing from the pipeline records `status_reason:'unspecified'` rather than inventing one. `CITIJOBS_CV_PROFILE_MAP` (default `manuelstagg:manuel-stagg`) maps CV slug to tracker profile; an unmapped profile sees and moves nothing.

**UI:** `/citi-tracker/` — top bar carries the `jobs.citi.com/job/tampa` browse link, a paste-to-import box (req id, Workday URL or careers URL), the agent status pill and Run. Tabs: Board (honest close-date countdown, red under 3 days; salary only when stated) · Pool · Skills · Searches · Agent. The requisition drawer carries **"Tailor my résumé for this req"** and the gap triage (`I did this` / `Adjacent` / `No`).

**SIT:** `node verticals/citijobs/sit.js` → **139/139**, zero external keys, offline against recorded fixtures of the real payloads. Asserts the invariants, not the happy path: the six field mappings, salary copied-or-absent, vocabulary never self-promoting, a rejected term staying dead, bullets verbatim from the pool, the summary verifier catching an invented number/acronym/tool, the single permitted auto-transition, an APPLIED row never auto-closing, the daily claim refusing a second scheduled run, the request budget, and cross-profile isolation.

**Environment Variables:**
- `CITIJOBS_JWT_SECRET` — signs the `citijobs_token` cookie (falls back to `JWT_SECRET`), 30d. SET on prod.
- `CITIJOBS_PASSWORD` — owner password, force-synced on boot (falls back to `SPEAKUP_TEAM_PASSWORD` / `LAWNCOPILOT_MSTAGG_PASSWORD`, default `Palindrome@7`). `CITIJOBS_OWNER_EMAIL` default `mstagg@digit2ai.com`.
- `CITIJOBS_GO` — `1` enables the daily scheduled run. Unset = manual runs only.
- `CITIJOBS_MODEL` — scoring/tailoring model. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY`; unset = labelled heuristic path, app fully usable. `CITIJOBS_TAILOR_MODEL` overrides for tailoring alone.
- `CITIJOBS_WORKDAY` (`citi:wd5:2`) — tenant:datacenter:site. A Citi migration is a config change, not a redeploy.
- `CITIJOBS_ALLOWED_HOSTS` (`manuelstagg.com,www.manuelstagg.com`) · `CITIJOBS_SSO_SLUGS` (`manuelstagg`) · `CITIJOBS_CV_PROFILE_MAP` (`manuelstagg:manuel-stagg`).
- `CITIJOBS_MAX_REQUESTS` (120) · `CITIJOBS_DETAIL_CAP` (60) · `CITIJOBS_COST_CAP_USD` (0.5) · `CITIJOBS_MAX_BULLETS` (7) · `CITIJOBS_UA_CONTACT` (embedded in the User-Agent).

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
