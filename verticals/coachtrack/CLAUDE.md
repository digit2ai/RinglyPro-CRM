# CoachTrack — Claude Context

> Sub-project of RinglyPro-CRM. Root `../../CLAUDE.md` applies. This file is the focused context for this folder.

## What this is
Personal AI coaching tracker. Log weekly 1:1 coaching sessions (coach = **Lala**), record + transcribe the full session (voice NLP or typed), auto-extract the **subject of the day + action items**, and ask an **AI coaching agent** for guidance on each action item. Mounted at `/coaching`. Spanish-first, emoji-free. Single-user lite (tenant_id 1). Structure modeled on CoachAccountable (accountability), BetterUp (session->goals), Quenza (between-session reflection), Mentalyc (notes from audio).

## Architecture
- Self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`).
- Tables auto-create on boot (`sync({alter:false})`). Canonical migration: `migrations/20260712_coachtrack_tables.sql`. All multi-tenant (`tenant_id`), `ct_` prefix: `ct_users, ct_sessions, ct_transcripts, ct_action_items, ct_guidance`.
- AI brain `src/services/coach-brain.js` reuses `ANTHROPIC_API_KEY` (Claude Haiku via `COACHTRACK_MODEL`). Zero-key **heuristic fallback** if no key — extraction + guidance still work for a demo.
- Cookie-JWT auth exactly like Veritas (`coachtrack_token`, secret `COACHTRACK_JWT_SECRET || JWT_SECRET`). Login gate; `/login`, `/health`, `/favicon.svg` public.
- Single self-contained `public/dashboard.html` + `public/login.html` (no build step).

## Capture flow
Voice (browser Web Speech API, `es-ES`, zero key) and typed both POST to `/sessions/:id/turn` — same pipeline. On **Finalize**, `coach-brain.finalizeSession()` reads the whole transcript and returns `{subject, summary, action_items[]}`, persisted. Each action item has a `/guidance` chat that loads the session as context.

## API (`/coaching/api/v1/*`)
- `POST /sessions` · `GET /sessions` · `GET /sessions/:id` · `POST /sessions/:id/turn` · `POST /sessions/:id/finalize`
- `GET /action-items` (accountability board) · `PATCH /action-items/:id` · `GET|POST /action-items/:id/guidance`
- `GET /health`

## Key env vars
`COACHTRACK_JWT_SECRET` (set on prod), `COACHTRACK_MODEL` (default `claude-haiku-4-5-20251001`, reuses `ANTHROPIC_API_KEY`), `COACHTRACK_DEFAULT_PASSWORD` (owner login, default `coachtrack@2026`), `COACHTRACK_SEED_DEMO=1` (optional sample session).

## Owner login
`mstagg@digit2ai.com` / `COACHTRACK_DEFAULT_PASSWORD`. Login at `/coaching/login`.
