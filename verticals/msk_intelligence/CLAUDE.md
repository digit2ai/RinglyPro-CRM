# MSK Intelligence — Claude Context

> Sub-project of RinglyPro-CRM. Root `../../CLAUDE.md` applies. Focused context below.

## What this is
Musculoskeletal (MSK) intelligence vertical with AI image analysis. Read `FEATURES.md` and `AI-IMAGE-ANALYSIS.md` in this folder first for the feature set and the image-analysis pipeline.

## Layout
- `backend/` — API + services
- `frontend/` — UI
- `uploads/` — uploaded images (runtime; ephemeral on Render)

## Deploy
Push to `main` → Render auto-deploy. Build the frontend before pushing UI changes.
