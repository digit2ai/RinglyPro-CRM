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

## Build
```bash
cd verticals/torna_idioma/frontend && /opt/homebrew/bin/node node_modules/.bin/vite build
```

## Deploy
Push to `main` → Render auto-deploy (~90-100s). Rebuild the frontend before pushing UI changes.
