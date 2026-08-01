# Torna Idioma — Claude Context

> Sub-project of RinglyPro-CRM. The root `../../CLAUDE.md` still applies (auto-approval, deploy-on-push, no emojis, Spanish orthography). This file gives **focused** context for this folder so you don't have to re-read the whole monorepo.

## What this is
Neural AI Spanish Language Acquisition Engine. Static landing + React SPA sub-routes under `/Torna_Idioma/`. UVEG (Mexican public university) 12-level SFL curriculum for University of Makati. Target cities: Makati, Zamboanga, Cavite.

## Status (keep current)
- NOT live in the Philippines yet — launching soon. Never say "live".
- Método Rizal (Cinco Raíces SRS + Emperador + Atelier + Rizal Studies) shipped.
- Modules 2-12 Tagalog held in staging awaiting G3 native review. UI is **en/fil only**.

## Layout
- `frontend/` — React + Vite SPA
- `backend/` — API + services (`backend/services/`)

## Curriculum page — `tornaidioma.com/modules`
Server-rendered review of all 12 modules / 72 lessons, read live from `ti_courses` + `ti_lessons`
(`backend/services/curriculum-page.js`, route in `backend/index.js`). Editing a lesson changes the
page immediately — there is no build step and no copy of the content anywhere.
`tornaidioma.com/modules` is a vanity rewrite in `src/app.js` (serves in place, URL stays short);
the canonical path `/Torna_Idioma/modules` works on any host.

**Answer keys are withheld by default** — this page is on the open internet and a learner must not
find the key with it. Correct answers render only when `TI_MODULES_KEY` is set in the environment
AND the request carries `?key=<that value>`. Unset env = answers unavailable, not weakly hidden.

## Animated explainer — `tornaidioma.com/presentation`
Ten-scene pitch deck (`frontend/public/presentation.html`, copied to `dist/` by Vite; route in
`backend/index.js`, vanity rewrite in `src/app.js`). Plain static HTML — no React, no build
dependency, so it can be edited and shipped on its own.

**Narration is Ava, not the browser voice.** Each scene POSTs its script to the zero-key
`/api/tts/edge` route with `voice:'ava'` (`en-US-AvaNeural`) — the same voice manuelstagg.com
narrates with — and gets an MP3 back. `/api/tts` is deliberately passed through the
tornaidioma.com host handler in `src/app.js` so the audio stays same-origin on the custom domain;
removing that line breaks the voice on the short URL only.

**Scene timing follows the audio, not a fixed clock.** `MIN[]` is a floor; `plan[i]` grows to the
real `audio.duration` on `loadedmetadata` and shrinks to `now + TAIL` when Ava finishes. Full
narration runs ~3m02s against ~1m47s of fixed timings, so hard-coding durations cuts every scene
off mid-sentence. Segments are prefetched one scene ahead and cached server-side by text hash.
Falls back to `speechSynthesis`, then to `MIN[]` timings, if the route is unreachable.

Copy rule: the deck must not claim the programme is "live" (see Status above) — scene 6 says
"built and ready".

## Build
```bash
cd verticals/torna_idioma/frontend && /opt/homebrew/bin/node node_modules/.bin/vite build
```
`presentation.html` and `torna-seal.png` live in `frontend/public/` — Vite copies them verbatim.
Editing only those two needs no build, just a copy into `frontend/dist/`.

## Deploy
Push to `main` → Render auto-deploy (~90-100s). Rebuild the frontend before pushing UI changes.
