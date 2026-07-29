# Aplicación de Sueño con Música Personalizada — Modo Noche

A web bedtime player auto-mounted at **`/aplicacion-de-sueno-con-musica-personali`**: the user picks a track from a curated royalty-free library of **25 tracks across 8 categories**, sets a shutdown timer (default 60 min), and taps *Iniciar noche*. The loop plays through an HTML5 `<audio>` element, the volume fades over the final five minutes via a Web Audio `GainNode`, and playback stops on its own at expiry — nobody touches the phone. Each finished night is logged to Postgres against a client-generated anonymous token (no login, no PII) so `/history` can show favourite selections. Spanish is the default UI; `?lang=en` serves English, substituted server-side so the `<h1>` is correct in the delivered HTML rather than swapped after paint. Installable to the iPhone home screen as a PWA.

## The library

| Category | Tracks |
|---|---|
| Naturaleza | Lluvia suave · Selva tropical · Viento en el bosque |
| Playa y agua | Olas del mar (open swell) · Olas de playa (shore break) · Cascada con aves |
| Meditación y cuencos | Cuencos tibetanos · Cuenco de cristal y lluvia |
| Música de la naturaleza | Nocturno suave · Amazonas |
| Ondas cerebrales | Delta 2.5 Hz · Theta 5.5 Hz · Alfa 10 Hz · Beta 16 Hz · Gamma 40 Hz |
| Frecuencias y propósito | Alivio del estrés 396 · Bienestar físico 174/285 · 528 · Abundancia 432/639 · Claridad mental 741 · Intuición 852 · Paz 963 · Enfoque profundo |
| Respiración | Respiración guiada 4-7-8 |
| Ruido y máscaras | Ruido marrón |

## Runbook

```bash
# SIT — boots the sub-app on an ephemeral port and drives it over real HTTP
/opt/homebrew/bin/node -e "require('dotenv').config();require('./client-builds/aplicacion-de-sueno-con-musica-personali/sit.js')"
# => 107/107 GREEN (also green with no DATABASE_URL, on the memory fallback)

# Rebuild the audio library (build-time only, needs ffmpeg on PATH)
/opt/homebrew/bin/node client-builds/aplicacion-de-sueno-con-musica-personali/tools/generate-audio.js

# Schema (optional — models/index.js applies the same DDL idempotently on boot)
psql "$DATABASE_URL" -f client-builds/aplicacion-de-sueno-con-musica-personali/migrations/001_create_sessions.sql
```

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{status:'ok', service, version}` plus the live session-store backend |
| GET | `/api/v1/tracks` | Public, no auth. 25 tracks, grouped, `?lang=en` for English |
| GET | `/api/v1/tracks/meta` | Version, licence note, categories, frequency disclaimer |
| POST | `/api/v1/sessions` | `{track_id, timer_minutes}` + `x-anon-token` header → 201. No header → 400 |
| GET | `/api/v1/sessions` | Only rows owned by the presented token |
| GET | `/api/v1/sessions/favourites` | Same token filter, aggregated by track |
| GET | `/` · `/history` | Player and history pages (`?lang=es` default / `en`) |
| GET | `/audio/*.mp3` | The self-hosted library, cached immutably |
| GET | `/manifest.webmanifest` · `/sw.js` · icons | PWA install + offline shell |

## Decisions worth knowing

**The audio is ours.** Every candidate third-party ambient URL was either a few seconds long, in a container Safari cannot decode (ogg/oga), or carried an unclear licence. `tools/generate-audio.js` synthesizes all 25 seamless loops and ffmpeg encodes them to MP3 in `public/audio/` (14 MB). They are royalty-free, served from our own origin, and there is no external CDN to 404 at bedtime. Noise loops are made seamless by crossfading a generated tail back over the head; tonal and event-driven tracks wrap exactly by construction (integer cycle counts, and every bowl strike, bird call and wave crash written modulo the buffer, so an event starting near the end simply continues over the loop point).

**The timer, not the fade, ends the night.** The fade is cosmetic; the hard stop is driven by the countdown. On iOS `HTMLMediaElement.volume` is read-only, so the `GainNode` is the only path that can actually fade — and if the AudioContext cannot be created the player falls back to a linear `element.volume` ramp. Either way the night terminates correctly, which is the property that matters. The player also resumes a context the OS suspended on screen lock, and logs the session with `fetch(..., {keepalive:true})` on `pagehide` so a closed tab still records the night.

**Postgres is primary, memory is the safety net.** `models/index.js` connects lazily and never fatally: with no `DATABASE_URL`, or on a failed handshake, the session store degrades to an in-memory `Map` behind an identical interface, so `/health` and the whole player stay up. `/health` reports which backend is live. SIT awaits the settle rather than sleeping on it, so it asserts the real Postgres path instead of silently testing the fallback, and it deletes its own `sit-token-%` rows afterwards.

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
