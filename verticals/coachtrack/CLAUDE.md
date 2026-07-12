# Visionarium Coaching (folder: coachtrack) — Claude Context

> Sub-project of RinglyPro-CRM. Root `../../CLAUDE.md` applies. This file is the focused context for this folder. Product name = **Visionarium Coaching**; folder/mount stays `coachtrack` / `/coaching`.

## What this is
Multi-tenant AI coaching tracker for **Visionarium** (creativity & leadership incubator; brand visionarium.app). Log 1:1 coaching sessions, record + transcribe the full session (voice NLP or typed), auto-extract the **subject of the day + action items**, and ask the Visionarium AI coach **Lina** for guidance on each action item. Mounted at `/coaching`. Spanish-first, emoji-free. **Open free self-signup** for Visionarium users. Structure modeled on CoachAccountable (accountability), BetterUp (session->goals), Quenza (between-session reflection), Mentalyc (notes from audio).

## Multi-tenancy
Each signup is its **own private tenant** (`tenant_id = user.id`); all coaching data is isolated per user. JWT carries `tenant_id`; every session/action-item query is scoped to `req.user.tenant_id` (helper `tenantOf(req)` in the routes). `ct_users.tenant_id` is added via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `index.js` init (because `sync({alter:false})` never adds columns to existing tables).

## Architecture
- Self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`).
- Tables auto-create on boot (`sync({alter:false})`). Canonical migration: `migrations/20260712_coachtrack_tables.sql`. All multi-tenant (`tenant_id`), `ct_` prefix: `ct_users, ct_sessions, ct_transcripts, ct_action_items, ct_guidance`.
- AI brain `src/services/coach-brain.js` = **Lina**; reuses `ANTHROPIC_API_KEY` (Claude Haiku via `COACHTRACK_MODEL`). Zero-key **heuristic fallback** if no key.
- Cookie-JWT auth (`coachtrack_token`, secret `COACHTRACK_JWT_SECRET || JWT_SECRET`, 30d). Login gate; public: `/login`, `/signup`, `/health`, `/favicon.svg`, `/manifest.webmanifest`, `/sw.js`, and any static asset (`.png/.svg/.js/...`) so the PWA installs pre-login.
- Self-contained `public/dashboard.html` + `login.html` + `signup.html` (no build step). **Visionarium light theme** (white, green→teal→blue gradient), logo `public/visionarium-logo.png`.

## PWA (mobile-friendly)
`manifest.webmanifest` (standalone, theme `#17a6a6`, icons 192/512 + maskable), `sw.js` (offline shell cache; network-first for navigations, never caches `/api/`), `apple-touch-icon.png`, safe-area insets, 44px touch targets, in-app **Install** bar via `beforeinstallprompt`. Icons generated from the logo with `sips` (fit-then-pad, no crop). Branded `favicon.svg` = constellation node mark.

## Capture flow
Voice (browser Web Speech API, `es-ES`, zero key) and typed both POST to `/sessions/:id/turn` — same pipeline. On **Finalize**, `coach-brain.finalizeSession()` returns `{subject, summary, action_items[]}`, persisted. Each action item has a `/guidance` chat with Lina that loads the session as context.

## API (`/coaching/api/v1/*`)
- Auth: `POST /auth/signup` (open free) · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me`
- `POST /sessions` · `GET /sessions` · `GET /sessions/:id` · `POST /sessions/:id/turn` · `POST /sessions/:id/finalize`
- `GET /action-items` (accountability board) · `PATCH /action-items/:id` · `GET|POST /action-items/:id/guidance`
- `GET /health`

## Key env vars
`COACHTRACK_JWT_SECRET` (set on prod), `COACHTRACK_MODEL` (default `claude-haiku-4-5-20251001`, reuses `ANTHROPIC_API_KEY`), `COACHTRACK_DEFAULT_PASSWORD` (seeded admin login), `COACHTRACK_SEED_DEMO=1` (optional).

## Access
Sign up free at `/coaching/signup`. Seeded admin: `mstagg@digit2ai.com` / `COACHTRACK_DEFAULT_PASSWORD`.
