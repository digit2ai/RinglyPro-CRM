# Visionarium Coaching (folder: coachtrack) — Claude Context

> Sub-project of RinglyPro-CRM. Root `../../CLAUDE.md` applies. This file is the focused context for this folder. Product name = **Visionarium Coaching**; folder/mount stays `coachtrack` / `/coaching`.

## What this is
Multi-tenant AI coaching tracker for **Visionarium** (creativity & leadership incubator; brand visionarium.app). Log 1:1 coaching sessions, record + transcribe the full session (voice NLP or typed), auto-extract the **subject of the day + action items**, and ask the Visionarium AI coach **Lala** for guidance on each action item. Mounted at `/coaching`. Spanish-first, emoji-free. **Open free self-signup** for Visionarium users. Structure modeled on CoachAccountable (accountability), BetterUp (session->goals), Quenza (between-session reflection), Mentalyc (notes from audio).

## Multi-tenancy
Each signup is its **own private tenant** (`tenant_id = user.id`); all coaching data is isolated per user. JWT carries `tenant_id`; every session/action-item query is scoped to `req.user.tenant_id` (helper `tenantOf(req)` in the routes). `ct_users.tenant_id` is added via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `index.js` init (because `sync({alter:false})` never adds columns to existing tables).

## Architecture
- Self-contained Express Router, own Sequelize via `src/db.js` (`CRM_DATABASE_URL || DATABASE_URL`).
- Tables auto-create on boot (`sync({alter:false})`). Canonical migration: `migrations/20260712_coachtrack_tables.sql`. All multi-tenant (`tenant_id`), `ct_` prefix: `ct_users, ct_sessions, ct_transcripts, ct_action_items, ct_guidance`.
- AI brain `src/services/coach-brain.js` = **Lala**; reuses `ANTHROPIC_API_KEY` (Claude Haiku via `COACHTRACK_MODEL`). Zero-key **heuristic fallback** if no key.
- Cookie-JWT auth (`coachtrack_token`, secret `COACHTRACK_JWT_SECRET || JWT_SECRET`, 30d). Login gate; public: `/login`, `/signup`, `/health`, `/favicon.svg`, `/manifest.webmanifest`, `/sw.js`, and any static asset (`.png/.svg/.js/...`) so the PWA installs pre-login.
- Self-contained `public/dashboard.html` + `login.html` + `signup.html` (no build step). **Visionarium light theme** (white, green→teal→blue gradient), logo `public/visionarium-logo.png`.

## PWA (mobile-friendly)
`manifest.webmanifest` (standalone, theme `#17a6a6`, icons 192/512 + maskable), `sw.js` (offline shell cache; network-first for navigations, never caches `/api/`), `apple-touch-icon.png`, safe-area insets, 44px touch targets, in-app **Install** bar via `beforeinstallprompt`. Icons generated from the logo with `sips` (fit-then-pad, no crop). Branded `favicon.svg` = constellation node mark.

## Capture flow
Voice (browser Web Speech API, `es-ES`/`en-US` by UI lang, zero key) and typed both POST to `/sessions/:id/turn` — same pipeline. On **Finalize**, `coach-brain.finalizeSession()` returns `{subject, summary, action_items[]}`, persisted. Each action item has a `/guidance` chat with Lala that loads the session as context.

### Dashboard enhancements (7-feature set, `public/dashboard.html`)
1. **EN/ES language selector** (`langBtn`) — full-app i18n via `T` dict + `t()`; persisted `localStorage['ct_lang']`; also switches Web Speech `REC.lang`.
2. **Expanded session input** — `#turnText` min-height 140px, auto-grows to 52vh then scrolls (`autoGrow()`).
3. **Per-session AI action generation** — in session detail, "Generar acciones con IA" → `POST /sessions/:id/generate-action-items` (analyzes ONLY that session, APPENDS, dedupes).
4. **Pending-actions dashboard card** (`pendingCard`) — counter of non-done items; opens the board **grouped by session**.
5. **Full action-item CRUD** — add (`POST /action-items`), edit/complete/reopen (`PATCH`), delete (`DELETE`). Completed items shown struck-through, sorted last, still accessible.
6. **Voice auto-save + resume** — each *final* speech result is saved as a turn immediately (no data loss if the user never taps Agregar/Finalizar); an in-progress session shows a **Resume** banner on home.
7. **30-min mic idle timeout** — `IDLE_MS=30min` → warning bar with 60s (`GRACE_MS`) countdown → auto-stop mic, transcript preserved. Any voice activity or "Continuar" resets it.

## API (`/coaching/api/v1/*`)
- Auth: `POST /auth/signup` (open free) · `POST /auth/login` · `POST /auth/logout` · `GET /auth/me`
- Sessions: `POST /sessions` · `GET /sessions` (hides the `__manual__` bucket) · `GET /sessions/:id` · `POST /sessions/:id/turn` · `POST /sessions/:id/finalize` · `POST /sessions/:id/generate-action-items` (append, this session only)
- Action items: `GET /action-items` (board; each item carries its `session`) · `POST /action-items` (manual add; no `session_id` → per-tenant `__manual__` session bucket) · `PATCH /action-items/:id` (status/text/notes/due_date) · `DELETE /action-items/:id` · `GET|POST /action-items/:id/guidance`
- `GET /health`

No schema change was needed for the 7-feature set — all columns already exist in `ct_action_items` (`text/status/completed_at`) and `ct_transcripts` (`source`).

## Key env vars
`COACHTRACK_JWT_SECRET` (set on prod), `COACHTRACK_MODEL` (default `claude-haiku-4-5-20251001`, reuses `ANTHROPIC_API_KEY`), `COACHTRACK_DEFAULT_PASSWORD` (seeded admin login), `COACHTRACK_SEED_DEMO=1` (optional).

## Access
Sign up free at `/coaching/signup`. Seeded admin: `mstagg@digit2ai.com` / `COACHTRACK_DEFAULT_PASSWORD`.
