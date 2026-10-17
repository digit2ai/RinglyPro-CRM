# CW Carriers — Claude Context

> Sub-project of RinglyPro-CRM. Root `../../CLAUDE.md` applies. Focused context below.

## What this is
Freight broker platform for CW Carriers. See `FREIGHT_BROKER_MASTER_PROMPT.md` in this folder for the full product spec — read it first when starting work here.

## Layout
- `backend/` — API + services
- `frontend/` — UI
- `sample-data/` — sample loads/lanes (see `sample-data/DATA_REQUEST_README.md`)

## Positioning / architecture / demo guidance
See the "CW Carriers Ecosystem" review feedback in project memory before pitching or relabeling.

## Deploy
Push to `main` → Render auto-deploy. Build the frontend before pushing UI changes.

## Admin passwords come from env only (2026-10-17)
The boot seed used to force-reset four admin passwords to values hardcoded in this public repo, and an open `GET /api/auth/debug` confirmed them to anyone. The route is gone and the seed now reads `CW_USER_PASSWORD` (cwcarriers@ringlypro.com), `CW_OWNER_PASSWORD` (both mstagg accounts) and `CW_JOVAN_PASSWORD`. Unset = the stored hash is left alone (so the old passwords keep working until these are set on Render). `GET /api/settings` masks any key matching token/secret/password/api_key; a PUT carrying the mask keeps the stored value.
