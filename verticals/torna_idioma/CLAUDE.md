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

## Build
```bash
cd verticals/torna_idioma/frontend && /opt/homebrew/bin/node node_modules/.bin/vite build
```

## Deploy
Push to `main` → Render auto-deploy (~90-100s). Rebuild the frontend before pushing UI changes.
