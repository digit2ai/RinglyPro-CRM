# Aplicación de Sueño con Música Personalizada — Modo Noche

A web bedtime player auto-mounted at **`/aplicacion-de-sueno-con-musica-personali`**: the user picks a track from a curated royalty-free library of **52 tracks in two families**, sets a shutdown timer (default 60 min), and taps *Iniciar noche*. The loop plays through an HTML5 `<audio>` element, the volume fades over the final five minutes via a Web Audio `GainNode`, and playback stops on its own at expiry — nobody touches the phone. Each finished night is logged to Postgres against a client-generated anonymous token (no login, no PII) so `/history` can show favourite selections. Spanish is the default UI; `?lang=en` serves English, substituted server-side so the `<h1>` is correct in the delivered HTML rather than swapped after paint. Installable to the iPhone home screen as a PWA.

## The library — two families

**Family 1 · Música de ondas (Wave Music)** — 25 tracks

| Category | Tracks |
|---|---|
| Naturaleza | Lluvia suave · Selva tropical · Viento en el bosque |
| Playa y agua | Olas del mar (open swell) · Olas de playa (shore break) · Cascada con aves |
| Meditación y cuencos | Cuencos tibetanos · Cuenco de cristal y lluvia |
| Música de la naturaleza | Nocturno suave · Amazonas |
| Ondas cerebrales | Delta 2.5 · Theta 5.5 · Alfa 10 · Beta 16 · Gamma 40 Hz |
| Frecuencias y propósito | 396 estrés · 174+285 bienestar · 528 · 432+639 abundancia · 741 claridad · 852 intuición · 963 paz · Enfoque profundo |
| Respiración | Respiración guiada 4-7-8 |
| Ruido y máscaras | Ruido marrón |

**Family 2 · Música instrumental (Instrumental Music)** — 27 tracks

| Category | Tracks |
|---|---|
| Handpan y resonancia metálica | Handpan (Kurd) · Tambor de lengua de acero · Gongs lentos · Kalimba · Dulcimer martillado |
| Viento y flautas | Quena andina · Zampoña · Flauta nativa americana · Shakuhachi · Bansuri (alap) · Silbato irlandés |
| Cuerdas | Guitarra española · Arpa celta · Cello ambiental · Guqin · Koto |
| Piano y atmosférico | Piano de fieltro · Piano lento · Ambiente lento |
| Mundo | Gamelan ceremonial · Ney sufí · Zanfona (bordón) · Marimba y vibráfono · Oud (taqsim) · Duduk |
| Naturaleza con instrumentos | Campanas de viento en el bosque · Handpan y lluvia |

The player shows a family switch first, then groups the dropdown by category — a flat list of 52 is unusable on a phone at 2am.

## Runbook

```bash
# SIT — boots the sub-app on an ephemeral port and drives it over real HTTP
/opt/homebrew/bin/node -e "require('dotenv').config();require('./client-builds/aplicacion-de-sueno-con-musica-personali/sit.js')"
# => 135/135 GREEN (also green with no DATABASE_URL, on the memory fallback)

# Rebuild the audio library (build-time only, needs ffmpeg on PATH)
/opt/homebrew/bin/node client-builds/aplicacion-de-sueno-con-musica-personali/tools/generate-audio.js        # wave family
/opt/homebrew/bin/node client-builds/aplicacion-de-sueno-con-musica-personali/tools/generate-instrumental.js # instrumental family

# Measure what shipped, rather than trusting the labels
/opt/homebrew/bin/node client-builds/aplicacion-de-sueno-con-musica-personali/tools/verify-binaural.js
/opt/homebrew/bin/node client-builds/aplicacion-de-sueno-con-musica-personali/tools/verify-loudness.js

# Schema (optional — models/index.js applies the same DDL idempotently on boot)
psql "$DATABASE_URL" -f client-builds/aplicacion-de-sueno-con-musica-personali/migrations/001_create_sessions.sql
```

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{status:'ok', service, version}` plus the live session-store backend |
| GET | `/api/v1/tracks` | Public, no auth. 52 tracks with family + category, `?lang=en` for English |
| GET | `/api/v1/tracks/meta` | Version, licence + originality notes, families, categories, frequency disclaimer |
| POST | `/api/v1/sessions` | `{track_id, timer_minutes}` + `x-anon-token` header → 201. No header → 400 |
| GET | `/api/v1/sessions` | Only rows owned by the presented token |
| GET | `/api/v1/sessions/favourites` | Same token filter, aggregated by track |
| GET | `/` · `/history` | Player and history pages (`?lang=es` default / `en`) |
| GET | `/audio/*.mp3` | The self-hosted library, cached immutably |
| GET | `/manifest.webmanifest` · `/sw.js` · icons | PWA install + offline shell |

## Decisions worth knowing

**The audio is ours.** Every candidate third-party ambient URL was either a few seconds long, in a container Safari cannot decode (ogg/oga), or carried an unclear licence. Two generators synthesize all 52 seamless loops over a shared DSP floor (`tools/lib-dsp.js`) and ffmpeg encodes them to MP3 in `public/audio/` (34 MB). They are royalty-free, served from our own origin, and there is no external CDN to 404 at bedtime. Noise loops are made seamless by crossfading a generated tail back over the head; tonal and event-driven tracks wrap exactly by construction (integer cycle counts, and every bowl strike, bird call and wave crash written modulo the buffer, so an event starting near the end simply continues over the loop point).

**The timer, not the fade, ends the night.** The fade is cosmetic; the hard stop is driven by the countdown. On iOS `HTMLMediaElement.volume` is read-only, so the `GainNode` is the only path that can actually fade — and if the AudioContext cannot be created the player falls back to a linear `element.volume` ramp. Either way the night terminates correctly, which is the property that matters. The player also resumes a context the OS suspended on screen lock, and logs the session with `fetch(..., {keepalive:true})` on `pagehide` so a closed tab still records the night.

**Postgres is primary, memory is the safety net.** `models/index.js` connects lazily and never fatally: with no `DATABASE_URL`, or on a failed handshake, the session store degrades to an in-memory `Map` behind an identical interface, so `/health` and the whole player stay up. `/health` reports which backend is live. SIT awaits the settle rather than sleeping on it, so it asserts the real Postgres path instead of silently testing the fallback, and it deletes its own `sit-token-%` rows afterwards.

**The instrumental family is synthesized, not sampled.** `tools/lib-instruments.js` holds five engines — Karplus-Strong plucked string, struck partial stack, blown tube, bowed sustain, and a piano with real string inharmonicity — plus a performance renderer whose notes move by a *random walk* over the scale rather than uniform random choice. That single detail is the difference between a melody and a wind chime: real playing mostly steps, occasionally leaps, and returns toward the centre. Each instrument is then a set of physical parameters: a handpan is tuned 1:2:3 (harmonic, so it sounds melodic) while a gong is wildly inharmonic (so it sounds like weather); a shakuhachi is mostly breath and a bansuri mostly tone; a gamelan gets its ombak shimmer from paired instruments a few hertz apart.

The artist names in the brief were used **only** as a reference for timbre and tempo — how breathy, how slow, how sparse. No recording is sampled, no artist or album name appears anywhere in the shipped product, and SIT fails the build if one does (matched on whole words, because a substring test flags "eno" inside the Spanish "menor"). `piano-lento` is deliberately titled "in the manner of the gymnopédies" with an original melody, so nothing is misattributed to a historical composer.

**One listening level across the whole library.** Peak normalisation was not enough: a plucked guqin peaked as high as a flute while averaging 16 dB quieter, so the library spanned **17.2 LUFS** end to end — pick a new track at 2am and you either hear nothing or get startled awake. `lib-dsp.js` now runs a two-pass EBU R128 match to −19 LUFS on the raw PCM before the single MP3 encode (so no generation loss), in `linear=true` mode which applies one gain and preserves each track's own dynamics. Spread is now **2.1 LUFS** with no clipping, asserted by `tools/verify-loudness.js` inside SIT.

**Frequencies are in hertz, and the copy makes no claims.** Brainwave bands are Hz, not megahertz — delta 0.5-4, theta 4-8, alpha 8-12, beta 12-30, gamma 30-100. A megahertz tone is radio, millions of times above hearing. What these tracks actually contain is a *binaural beat*: an audible carrier in one ear and the same tone offset by the target hertz in the other, so the difference is perceived as a slow pulse — which only works on headphones, so every such track carries `stereo_required`. The SIT measures this rather than trusting it: it decodes each MP3 and runs a Goertzel filter per channel to confirm the left ear holds the carrier and the right holds carrier+beat.

Every description states **what the track is**, never an outcome. `frequency_disclaimer` in `data/tracks.json` is surfaced in the UI under any frequency track and says plainly that these are relaxation audio, not a medical or psychological treatment, and promise no health or financial result — the *abundancia* track says outright that it produces no financial outcome. Alerting tracks (beta, gamma, 741 Hz, deep focus) carry `not_for_sleep` so nobody picks a 40 Hz gamma bed at bedtime by accident. SIT fails the build if a curative or guarantee claim appears in any description.

**Installable.** `logo-master.svg` is the single source for the app mark — full-bleed square, because iOS rounds an `apple-touch-icon` itself and a pre-rounded source gets double-rounded. All content sits inside the central 80% so the same file works as a `maskable` PWA icon. `sips` rasterizes it to `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` and `favicon-32.png`; `favicon.svg` is a simplified rounded variant, because at 16px the arcs and stars turn to mud. `sw.js` caches the shell and the audio (cache-first, the loops are immutable) but **never** `/api/` — a stale cached history would be a lie.

**Privacy.** No names, emails or phones are collected. The row owner is a random UUID minted in the browser and kept in `localStorage`; it is truncated to its first 8 characters before any `console.log`, and it is the only identifier stored. Reads are filtered on both `tenant_id` and `anon_token`, so one device can never see another's history.

## Deferred (per the sprint brief)

Native iOS/Android apps · Spotify / YouTube Music integration · AI personalization and recommendations · runtime binaural generation (all binaural tracks are pre-recorded) · accounts with cross-device sync · preference storage beyond `localStorage`.

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | Session store. Unset = in-memory fallback, player still fully works |
| `APLICACION_SUENO_TENANT_ID` | `1` | Tenant stamped on every session row |
