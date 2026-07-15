# CoachTrack — Build Brief for /ringlypro-architect

Build a new self-contained Digit2AI vertical called **CoachTrack**: a personal AI coaching tracker. It logs my weekly 1:1 coaching sessions (my coach is "Lala"), records + transcribes the full session (voice NLP and typed), auto-extracts the subject of the day and action items, and lets me ask an AI coaching agent for guidance on each action item. Model the structure on proven coaching platforms (CoachAccountable's accountability/commitment state machine, BetterUp's session→focus-area→goals spine, Quenza's between-session reflection, Mentalyc's draft-notes-from-audio).

## Architecture (mirror the Veritas vertical exactly)
- Location: `verticals/coachtrack/`. Self-contained Express Router mounted at `/coaching`.
- Own Sequelize instance via `src/db.js` using `CRM_DATABASE_URL || DATABASE_URL` (SSL, `rejectUnauthorized:false`, `logging:false`).
- Tables auto-create on boot via `sequelize.sync({ alter:false })`. Canonical migration at `verticals/coachtrack/migrations/20260712_coachtrack_tables.sql`.
- All tables multi-tenant (`tenant_id`), `ct_` table prefix. Single-user lite: default tenant + coach preset "Lala".
- Cookie-JWT auth exactly like Veritas (`coachtrack_token`, secret `COACHTRACK_JWT_SECRET || JWT_SECRET`), login page gate, `/login`, `/health` public.
- Single self-contained `public/dashboard.html` (no build step) + `public/login.html`. Spanish/English toggle, emoji-free.
- Mount into main app the same way Veritas is mounted in `src/app.js`.
- No new infra, no paid keys required to run. AI reuses the existing `ANTHROPIC_API_KEY`; model via `COACHTRACK_MODEL` (default `claude-haiku-4-5-20251001`).

## Data model (`ct_` tables)
- `ct_sessions` — id, tenant_id, coach_name (default "Lala"), session_date, subject, summary, status (`in_progress|finalized`), duration_min, created_at
- `ct_transcripts` — id, session_id, turn_index, role (`me|coach`), text, source (`voice|typed`), ts
- `ct_action_items` — id, session_id, tenant_id, text, status (`open|in_progress|done|overdue`), due_date, notes, created_at, completed_at
- `ct_guidance` — id, action_item_id, question, ai_response, ts  (the coaching-agent Q&A thread per action item)

## AI services (`src/services/`)
- `coach-brain.js` — provider-agnostic Claude wrapper (reuse ANTHROPIC_API_KEY).
  - `finalizeSession(transcript)` → `{ subject, summary, action_items:[{text, due_date?}] }` extracted from the full transcript.
  - `guidance(actionItem, sessionContext, question)` → motivational, practical coaching answer scoped to that action item, loading the session subject + transcript as context. Warm, direct, accountability-focused tone.

## REST API (`/coaching/api/v1/*`)
- `POST /sessions` — start a session (returns id). `GET /sessions` — list with open-action-item counts. `GET /sessions/:id` — session + full transcript + action items.
- `POST /sessions/:id/turn` — append a transcript turn `{ role, text, source }` (voice or typed — same pipeline).
- `POST /sessions/:id/finalize` — run `finalizeSession`, persist subject/summary/action_items, set status finalized.
- `GET /action-items` — all items across sessions, open/overdue first (the accountability view). `PATCH /action-items/:id` — update status/due_date/notes; stamp completed_at on done.
- `POST /action-items/:id/guidance` — ask the coaching AI agent about this item; persist to `ct_guidance`; return the answer + full thread.
- `GET /health`.

## Capture UX (dashboard.html, single file)
- **Home**: session list + a cross-session "Open action items" board (open/overdue highlighted) — the CoachAccountable-style accountability view.
- **Live session screen**: mic orb using the browser Web Speech API for zero-key live voice transcription, with an equal typed path (textarea) feeding the same `/turn` endpoint. Live transcript pane (me vs coach color-coded). "Finalize session" button → shows extracted subject, summary, action items.
- **Session detail**: subject, summary, full transcript, and action-item cards. Each card has an inline "Ask my coach" chat (calls `/guidance`) and status controls (mark in-progress/done, set due date).

## Environment variables
- `COACHTRACK_JWT_SECRET` — signs the `coachtrack_token` cookie (fallback `JWT_SECRET`). Set on prod.
- `COACHTRACK_MODEL` — Anthropic model for extraction + guidance. Default `claude-haiku-4-5-20251001`. Reuses `ANTHROPIC_API_KEY`.
- `COACHTRACK_DEFAULT_PASSWORD` — password for my single console login (seeded on boot, idempotent).
- `COACHTRACK_SEED_DEMO` — `1` seeds one sample session with transcript + action items; default unset = clean.

## Deliverables
- Full working vertical (router, db, models, services, routes, dashboard, login, migration).
- `verticals/coachtrack/CLAUDE.md` + `ECOSYSTEM.md` documenting it, and a root-CLAUDE.md section (same style as the Veritas section).
- Mounted, boots clean, `sync({alter:false})` creates `ct_*` tables, `/coaching/health` returns ok.
- Commit + push to main (Render auto-deploy).

Constraints: emoji-free, proper Spanish orthography in any Spanish copy, POC scoped in weeks. Auto-approve everything; do not ask questions — build, deploy, and report results.
