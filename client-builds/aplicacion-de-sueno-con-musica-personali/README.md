# Aplicación de Sueño con Música Personalizada — Modo Noche

A web bedtime player auto-mounted at **`/aplicacion-de-sueno-con-musica-personali`**: the user picks a track from a curated royalty-free library, sets a shutdown timer (default 60 min), and taps *Iniciar noche*. The loop plays through an HTML5 `<audio>` element, the volume fades over the final five minutes via a Web Audio `GainNode`, and playback stops on its own at expiry — nobody touches the phone. Each finished night is logged to Postgres against a client-generated anonymous token (no login, no PII) so `/history` can show favourite selections. Spanish is the default UI; `?lang=en` serves English, substituted server-side so the `<h1>` is correct in the delivered HTML rather than swapped after paint.

## Runbook

```bash
# SIT — boots the sub-app on an ephemeral port and drives it over real HTTP
/opt/homebrew/bin/node -e "require('dotenv').config();require('./client-builds/aplicacion-de-sueno-con-musica-personali/sit.js')"
# => 66/66 GREEN (also green with no DATABASE_URL, on the memory fallback)

# Rebuild the audio library (build-time only, needs ffmpeg on PATH)
/opt/homebrew/bin/node client-builds/aplicacion-de-sueno-con-musica-personali/tools/generate-audio.js

# Schema (optional — models/index.js applies the same DDL idempotently on boot)
psql "$DATABASE_URL" -f client-builds/aplicacion-de-sueno-con-musica-personali/migrations/001_create_sessions.sql
```

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{status:'ok', service, version}` plus the live session-store backend |
| GET | `/api/v1/tracks` | Public, no auth. 6 tracks, `?lang=en` for English titles |
| GET | `/api/v1/tracks/meta` | Library version, licence note, categories |
| POST | `/api/v1/sessions` | `{track_id, timer_minutes}` + `x-anon-token` header → 201. No header → 400 |
| GET | `/api/v1/sessions` | Only rows owned by the presented token |
| GET | `/api/v1/sessions/favourites` | Same token filter, aggregated by track |
| GET | `/` · `/history` | Player and history pages (`?lang=es` default / `en`) |
| GET | `/audio/*.mp3` | The self-hosted library, cached immutably |

## Decisions worth knowing

**The audio is ours.** Every candidate third-party ambient URL was either a few seconds long, in a container Safari cannot decode (ogg/oga), or carried an unclear licence. `tools/generate-audio.js` synthesizes six seamless loops (rain, ocean, brown noise, forest wind, a soft-classical pad, and a pre-recorded 5.5 Hz theta binaural pair) and ffmpeg encodes them to MP3 in `public/audio/`. They are royalty-free, served from our own origin, and there is no external CDN to 404 at bedtime. Noise loops are made seamless by crossfading a generated tail back over the head; the pad and binaural tracks wrap exactly by construction (integer cycle counts, note tails written modulo the buffer).

**The timer, not the fade, ends the night.** The fade is cosmetic; the hard stop is driven by the countdown. On iOS `HTMLMediaElement.volume` is read-only, so the `GainNode` is the only path that can actually fade — and if the AudioContext cannot be created the player falls back to a linear `element.volume` ramp. Either way the night terminates correctly, which is the property that matters. The player also resumes a context the OS suspended on screen lock, and logs the session with `fetch(..., {keepalive:true})` on `pagehide` so a closed tab still records the night.

**Postgres is primary, memory is the safety net.** `models/index.js` connects lazily and never fatally: with no `DATABASE_URL`, or on a failed handshake, the session store degrades to an in-memory `Map` behind an identical interface, so `/health` and the whole player stay up. `/health` reports which backend is live. SIT awaits the settle rather than sleeping on it, so it asserts the real Postgres path instead of silently testing the fallback, and it deletes its own `sit-token-%` rows afterwards.

**Privacy.** No names, emails or phones are collected. The row owner is a random UUID minted in the browser and kept in `localStorage`; it is truncated to its first 8 characters before any `console.log`, and it is the only identifier stored. Reads are filtered on both `tenant_id` and `anon_token`, so one device can never see another's history.

## Deferred (per the sprint brief)

Native iOS/Android apps · Spotify / YouTube Music integration · AI personalization and recommendations · runtime binaural generation (the theta track is pre-recorded) · accounts with cross-device sync · preference storage beyond `localStorage`.

## Environment variables

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | Session store. Unset = in-memory fallback, player still fully works |
| `APLICACION_SUENO_TENANT_ID` | `1` | Tenant stamped on every session row |
